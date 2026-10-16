import { and, eq, gt, lt, or } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/index.js'
import { users, sessions, STATUS } from '../db/schema.js'
import { clientIp, isSecureRequest } from './security.js'
import { clearRoomTicketsForUser, cleanupRoomTickets } from '../room-tickets.js'

const COOKIE_NAME = 'session'
const DEFAULT_TTL_DAYS = 30
const TTL_MS = DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000
const WS_TICKET_TTL_MS = 60 * 1000
const wsTickets = new Map()
// 会话活跃时间不必每个请求都写一次：间隔内只更新一次，既省写又避免高频更新。
const ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000
// 除 30 天的绝对有效期之外，再加一道"闲置过期"：令牌被复制走后一直不用也拿不到
// 永久访问权（2026-10 审计的加固项）。0 表示关闭这道检查。
const IDLE_TIMEOUT_DAYS = Number(process.env.SESSION_IDLE_TIMEOUT_DAYS ?? 14)
const IDLE_TIMEOUT_MS = Number.isFinite(IDLE_TIMEOUT_DAYS) && IDLE_TIMEOUT_DAYS > 0
  ? IDLE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000
  : 0

/** 会话最后一次活动时间（没记过活跃时间就用创建时间兜底）。 */
function lastSeenAt(sessionRow) {
  const value = sessionRow.lastActivityAt || sessionRow.createdAt
  return value instanceof Date ? value.getTime() : 0
}

/** 会话是否已闲置超时。 */
export function isSessionIdleExpired(sessionRow, now = new Date()) {
  if (!IDLE_TIMEOUT_MS) return false
  const seen = lastSeenAt(sessionRow)
  if (!seen) return false
  return now.getTime() - seen > IDLE_TIMEOUT_MS
}

function newToken() {
  // 32 bytes = 43 chars base64url, plenty of entropy
  return randomBytes(32).toString('base64url')
}

// 库里只存令牌的 sha256：数据库被读（备份泄露、误配从库）时，拿到的哈希无法直接
// 当 Cookie 重放（2026-10 审计 M-3）。令牌本身是高熵随机串，不需要加盐慢哈希。
function hashSessionToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

// 历史会话的令牌是明文入库的（改动前的格式）：32 字节 base64url 恰为 43 个字符。
// sha256 无盐、服务端自己就能算，所以启动时可以把这些行原地改写成哈希 ——
// 浏览器 Cookie 里持有的原文照样能匹配上，没有任何人需要重新登录，而库里不再
// 留可直接重放的凭据（2026-10-16 重审 N-3）。
const LEGACY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export async function upgradeLegacySessionTokens() {
  const rows = await db.select({ id: sessions.id, token: sessions.token }).from(sessions)
  let upgraded = 0
  for (const row of rows) {
    const token = String(row.token || '')
    if (!LEGACY_TOKEN_PATTERN.test(token)) continue
    try {
      await db.update(sessions).set({ token: hashSessionToken(token) }).where(eq(sessions.id, row.id))
      upgraded += 1
    } catch (err) {
      // 唯一索引冲突（同一令牌同时存在明文行与哈希行）时跳过：那一行已经是哈希，
      // 少改一条不影响任何人的登录状态。
      console.warn('[api] failed to upgrade legacy session token', err?.message || err)
    }
  }
  return upgraded
}

async function findSessionRow(tokenValue, now) {
  const rows = await db.select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, tokenValue), gt(sessions.expiresAt, now)))
    .limit(1)
  return rows[0] || null
}


export async function createSession(c, userId) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + TTL_MS)
  const ip = clientIp(c)
  const userAgent = (c.req.header('user-agent') || '').slice(0, 512)
  await db.insert(sessions).values({ userId, token: hashSessionToken(token), ip, userAgent, expiresAt })
  setCookie(c, token, expiresAt)
  return token
}

export async function createWebSocketTicket(c) {
  const user = await currentUser(c)
  if (!user) return null
  cleanupExpiredWebSocketTickets()
  const ticket = newToken()
  wsTickets.set(ticket, { userId: user.id, expiresAt: Date.now() + WS_TICKET_TTL_MS })
  return ticket
}

export async function consumeWebSocketTicket(ticket) {
  if (!ticket) return null
  const entry = wsTickets.get(ticket)
  wsTickets.delete(ticket)
  if (!entry || entry.expiresAt < Date.now()) return null
  const row = (await db.select().from(users)
    .where(and(eq(users.id, entry.userId), eq(users.status, STATUS.normal)))
    .limit(1))[0]
  return row || null
}

export async function destroyCurrentSession(c) {
  const token = readCookie(c)
  if (token) {
    // 兼容历史会话：明文令牌与哈希都可能命中，一条 SQL 一起删掉。
    await db.delete(sessions).where(or(
      eq(sessions.token, hashSessionToken(token)),
      eq(sessions.token, token),
    ))
  }
  clearCookie(c)
}

export async function invalidateUserSessions(userId, c = null) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
  for (const [ticket, entry] of wsTickets.entries()) {
    if (entry.userId === userId) wsTickets.delete(ticket)
  }
  clearRoomTicketsForUser(userId)
  if (c) clearCookie(c)
}

export async function currentUser(c) {
  const token = readCookie(c)
  if (!token) return null
  const now = new Date()
  const hashed = hashSessionToken(token)

  let row = await findSessionRow(hashed, now)
  if (!row) {
    // 兼容改动之前建立的会话：那时库里存的是明文令牌。命中一次就顺手改写成哈希，
    // 这样不需要强制任何人重新登录（2026-10 审计 M-3）。
    row = await findSessionRow(token, now)
    if (row) {
      try {
        await db.update(sessions).set({ token: hashed }).where(eq(sessions.id, row.s.id))
      } catch (err) {
        console.warn('[api] failed to upgrade legacy session token', err?.message || err)
      }
    }
  }
  if (!row) return null
  if (row.u.status !== STATUS.normal) return null

  // 闲置太久的会话直接作废并清掉 Cookie：库里的行留着没有意义，只会让
  // "会话表越长越像还活着"。
  if (isSessionIdleExpired(row.s, now)) {
    try {
      await db.delete(sessions).where(eq(sessions.id, row.s.id))
    } catch (err) {
      console.warn('[api] failed to drop idle session', err?.message || err)
    }
    clearCookie(c)
    return null
  }

  // lastActivityAt 只在间隔够久时更新一次：原先是每个请求都写一次库，而且没有
  // await（未处理的 Promise 在异常时会变成 unhandled rejection）。
  const lastTouch = row.s.lastActivityAt instanceof Date ? row.s.lastActivityAt.getTime() : 0
  if (now.getTime() - lastTouch > ACTIVITY_TOUCH_INTERVAL_MS) {
    try {
      await db.update(sessions).set({ lastActivityAt: now }).where(eq(sessions.id, row.s.id))
    } catch (err) {
      console.warn('[api] failed to touch session activity', err?.message || err)
    }
  }
  return row.u
}

export async function requireAuth(c, next) {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}

export async function requireAdmin(c, next) {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  c.set('user', user)
  await next()
}

// ----- cookie helpers -----
function readCookie(c) {
  const header = c.req.header('cookie')
  if (!header) return null
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq) === COOKIE_NAME) return decodeURIComponent(part.slice(eq + 1))
  }
  return null
}
function setCookie(c, token, expiresAt) {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (isSecureRequest(c)) attrs.push('Secure')
  c.header('Set-Cookie', attrs.join('; '))
}
function clearCookie(c) {
  const attrs = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (isSecureRequest(c)) attrs.push('Secure')
  c.header('Set-Cookie', attrs.join('; '))
}

// Periodic expired-session cleanup (call opportunistically)
export async function cleanupExpiredSessions() {
  try {
    const now = new Date()
    const conditions = [lt(sessions.expiresAt, now)]
    if (IDLE_TIMEOUT_MS) {
      // 闲置过期的会话留着也没人能再用，顺手一起清掉（见 isSessionIdleExpired）。
      conditions.push(lt(sessions.lastActivityAt, new Date(now.getTime() - IDLE_TIMEOUT_MS)))
    }
    await db.delete(sessions).where(or(...conditions))
  } catch (err) {
    console.error('[api] failed to cleanup expired sessions', err)
  }
  cleanupExpiredWebSocketTickets()
  cleanupRoomTickets()
}

function cleanupExpiredWebSocketTickets() {
  const now = Date.now()
  for (const [ticket, entry] of wsTickets.entries()) {
    if (entry.expiresAt < now) wsTickets.delete(ticket)
  }
}
