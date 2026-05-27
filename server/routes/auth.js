import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, insertAndFetch } from '../db/index.js'
import { users, STATUS } from '../db/schema.js'
import { createSession, destroyCurrentSession, currentUser, createWebSocketTicket, invalidateUserSessions } from '../middleware/auth.js'
import { rateLimit, consumeRateLimit } from '../middleware/rate-limit.js'
import { clientIp } from '../middleware/security.js'
import { audit } from '../audit.js'

const passwordSchema = z.string()
  .min(6)

const credentialsSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: passwordSchema,
})

const loginSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
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
  return '密码至少 6 位'
}

export const authRoutes = new Hono()

authRoutes.post('/register', authLimiter, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = credentialsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: passwordPolicyMessage() }, 400)
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

  const passwordHash = await bcrypt.hash(password, 10)
  const row = await insertAndFetch(users, { username, passwordHash, role: 'user' }, eq(users.username, username))

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
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    await audit(c, { action: 'auth.login.failed', targetType: 'user', targetId: user.id, metadata: { reason: 'bad-password' }, actor: user })
    return c.json({ error: '用户名或密码错误' }, 401)
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

  const ok = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash)
  if (!ok) {
    await audit(c, { action: 'auth.password.failed', targetType: 'user', targetId: me.id, metadata: { reason: 'bad-current-password' }, actor: me })
    return c.json({ error: '当前密码不正确' }, 401)
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10)
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, me.id))
  await invalidateUserSessions(me.id, c)
  await audit(c, { action: 'auth.password.changed', targetType: 'user', targetId: me.id, actor: me })
  return c.json({ ok: true, sessionInvalidated: true })
})
