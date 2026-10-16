import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, insertAndFetch } from '../db/index.js'
import { users, STATUS } from '../db/schema.js'
import { createSession, destroyCurrentSession, currentUser, createWebSocketTicket, invalidateUserSessions } from '../middleware/auth.js'
import { rateLimit, consumeRateLimit } from '../middleware/rate-limit.js'
import { clientIp } from '../middleware/security.js'
import { hashPassword, verifyPassword, needsRehash, MIN_PASSWORD_LENGTH } from '../passwords.js'
import {
  USERNAME_MAX_LENGTH,
  USERNAME_LOGIN_MAX_LENGTH,
  usernameProblem,
} from '../../shared/username-policy.js'
import { audit } from '../audit.js'

const passwordSchema = z.string()
  .min(MIN_PASSWORD_LENGTH)

// 用户名的规则与提示文案都在 shared/username-policy.js（前端表单读的是同一份），
// 这里只负责把它包成 zod 校验。max 由调用方决定：注册用注册上限，登录放到列宽。
function usernameSchema(max) {
  return z.string().superRefine((value, ctx) => {
    const problem = usernameProblem(value, { max })
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  })
}

const credentialsSchema = z.object({
  username: usernameSchema(USERNAME_MAX_LENGTH),
  password: passwordSchema,
})

const loginSchema = z.object({
  username: usernameSchema(USERNAME_LOGIN_MAX_LENGTH),
  password: z.string().min(1),
})

const authLimiter = rateLimit({ name: 'auth', windowMs: 60_000, max: 20 })

function authKey(c, username) {
  return `${clientIp(c)}:${String(username || '').toLowerCase()}`
}

function rejectIfLimited(c, username, options) {
  const limit = consumeRateLimit(authKey(c, username), options)
  if (!limit.ok) {
    c.header('Retry-After', String(limit.retryAfter))
    return c.json({ error: '请求过于频繁，请稍后再试' }, 429)
  }
  return null
}

function passwordPolicyMessage() {
  return `密码至少 ${MIN_PASSWORD_LENGTH} 位`
}

// 校验失败时说清是哪个字段的错：用户名的问题回用户名规则，其余才回密码提示。
// 以前不分字段一律回"密码至少 8 位"，用户按提示反复改密码也注册不上。
function policyMessage(parsed) {
  const issue = parsed.error.issues[0]
  return issue?.path?.[0] === 'username' ? issue.message : passwordPolicyMessage()
}

export const authRoutes = new Hono()

authRoutes.post('/register', authLimiter, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = credentialsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: policyMessage(parsed) }, 400)
  const { username, password } = parsed.data

  const limited = rejectIfLimited(c, username, { windowMs: 10 * 60_000, max: 8 })
  if (limited) return limited

  const existing = (await db.select().from(users)
    .where(eq(users.username, username))
    .limit(1))[0]
  if (existing?.status === STATUS.normal) return c.json({ error: '用户名已被占用' }, 409)
  if (existing?.status === STATUS.deleted) {
    const releasedUsername = `deleted_${existing.id}_${Date.now().toString(36)}`.slice(0, 32)
    await db.update(users).set({ username: releasedUsername }).where(eq(users.id, existing.id))
  }

  const passwordHash = await hashPassword(password)
  // 查重与插入之间隔着一次异步哈希，同名并发注册会双双通过查重，其中一个必然撞上
  // 用户名唯一索引（MySQL 1062）。这是预期内的冲突，回 409 让用户换名字，
  // 而不是把驱动层的报错抛成 500。
  let row
  try {
    row = await insertAndFetch(users, { username, passwordHash, role: 'user' }, eq(users.username, username))
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
      return c.json({ error: '用户名已被占用' }, 409)
    }
    throw err
  }

  await createSession(c, row.id)
  await audit(c, { action: 'auth.register', targetType: 'user', targetId: row.id, actor: row })
  return c.json({ id: row.id, username: row.username, role: row.role })
})

authRoutes.post('/login', authLimiter, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: '用户名或密码错误' }, 401)
  const { username, password } = parsed.data

  const limited = rejectIfLimited(c, username, { windowMs: 15 * 60_000, max: 10 })
  if (limited) return limited

  const rows = await db.select().from(users)
    .where(and(eq(users.username, username), eq(users.status, STATUS.normal)))
    .limit(1)
  const user = rows[0]
  if (!user) {
    await audit(c, { action: 'auth.login.failed', targetType: 'user', targetId: username, metadata: { reason: 'not-found' }, actor: null })
    return c.json({ error: '用户名或密码错误' }, 401)
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    await audit(c, { action: 'auth.login.failed', targetType: 'user', targetId: user.id, metadata: { reason: 'bad-password' }, actor: user })
    return c.json({ error: '用户名或密码错误' }, 401)
  }

  // 历史哈希（bcrypt）在这里静默升级成 scrypt：用户不用做任何事，下次登录就已经
  // 是新格式。升级失败不能影响登录本身。
  if (needsRehash(user.passwordHash)) {
    try {
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id))
    } catch (err) {
      console.warn('[auth] failed to upgrade password hash', err?.message || err)
    }
  }

  await createSession(c, user.id)
  await audit(c, { action: 'auth.login.success', targetType: 'user', targetId: user.id, actor: user })
  return c.json({ id: user.id, username: user.username, role: user.role })
})

authRoutes.post('/logout', async (c) => {
  await destroyCurrentSession(c)
  return c.json({ ok: true })
})

authRoutes.get('/me', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ user: null })
  return c.json({ user: { id: user.id, username: user.username, role: user.role } })
})

authRoutes.post('/ws-ticket', async (c) => {
  const ticket = await createWebSocketTicket(c)
  if (!ticket) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ ticket })
})

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

authRoutes.post('/password', async (c) => {
  const me = await currentUser(c)
  if (!me) return c.json({ error: '未登录' }, 401)
  const body = await c.req.json().catch(() => null)
  const parsed = passwordChangeSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: passwordPolicyMessage() }, 400)

  const limited = rejectIfLimited(c, me.username, { windowMs: 15 * 60_000, max: 8 })
  if (limited) return limited

  const ok = await verifyPassword(parsed.data.currentPassword, me.passwordHash)
  if (!ok) {
    await audit(c, { action: 'auth.password.failed', targetType: 'user', targetId: me.id, metadata: { reason: 'bad-current-password' }, actor: me })
    return c.json({ error: '当前密码不正确' }, 401)
  }

  const newHash = await hashPassword(parsed.data.newPassword)
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, me.id))
  await invalidateUserSessions(me.id, c)
  await audit(c, { action: 'auth.password.changed', targetType: 'user', targetId: me.id, actor: me })
  return c.json({ ok: true, sessionInvalidated: true })
})
