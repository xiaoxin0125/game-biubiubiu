import { Hono } from 'hono'
import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, insertAndFetch, updateAndFetch } from '../db/index.js'
import { rooms, roms, users, STATUS } from '../db/schema.js'
import { requireAuth, currentUser } from '../middleware/auth.js'
import { getSetting } from './settings.js'
import { updateRoomPermissions, isHostOnline, broadcastRoomClosed } from '../room-hub.js'
import { effectiveMaxPlayersForRom } from '../rom-players.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { clientIp } from '../middleware/security.js'
import { parseListWindow, listPage } from '../http-utils.js'
import { hashPassword, verifyPassword } from '../passwords.js'
import { createRoomTicket } from '../room-tickets.js'
import { liveRoom, makeRoomCode, serializeRoom } from '../rooms/room-repository.js'

// 每个普通用户同时只能有一个未关闭的房间（管理员不受限，便于排查问题）。
// 房间记录只增不减、也没有分页，不设上限的话一个账号就能把房间表刷满
// （2026-10 审计 M-4）。
const MAX_OPEN_ROOMS_PER_USER = 1

const createSchema = z.object({
  name: z.string().min(1).max(60),
  romId: z.number().int().positive(),
  isPublic: z.boolean().default(true),
  allowPlay: z.boolean().default(true),
  password: z.string().min(0).max(64).optional(),
})

export const roomRoutes = new Hono()

const roomJoinLimiter = rateLimit({
  name: 'room-join',
  windowMs: 60_000,
  max: 30,
  key: (c) => `${clientIp(c)}:${c.req.param('code')?.toUpperCase() || ''}`,
})

// 建房频率：上限本身是「每人 1 个未关闭房间」，这条限流挡的是「关掉再建」的循环。
const roomCreateLimiter = rateLimit({
  name: 'room-create',
  windowMs: 60_000,
  max: 10,
  key: (c) => String(c.get('user')?.id ?? clientIp(c)),
})

// List open public rooms with basic info
roomRoutes.get('/', async (c) => {
  const { limit, offset } = parseListWindow(c)
  const where = liveRoom(eq(rooms.isPublic, true))
  const rows = await db.select({
    r: rooms,
    hostUsername: users.username,
    romTitle: roms.title,
    romPlatform: roms.platform,
    romMaxPlayers: roms.maxPlayers,
    romDefaultCore: roms.defaultCore,
  })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.hostUserId))
    .innerJoin(roms, eq(roms.id, rooms.romId))
    .where(where)
    .orderBy(desc(rooms.createdAt))
    .limit(limit)
    .offset(offset)
  const [countRow] = await db.select({ n: count() }).from(rooms).where(where)
  const total = Number(countRow?.n || 0)

  return c.json({
    rooms: rows.map(({ r, hostUsername, romTitle, romPlatform, romMaxPlayers, romDefaultCore }) =>
      serializeRoom(r, {
        hostUsername, romTitle, romPlatform,
        maxPlayers: romMaxPlayers ?? null,
        effectiveMaxPlayers: effectiveMaxPlayersForRom({ ...r, maxPlayers: romMaxPlayers, title: romTitle, fileName: '', platform: romPlatform, defaultCore: romDefaultCore }),
        hostOnline: isHostOnline(r.code),
      }),
    ),
    ...listPage(rows, { total, limit, offset }),
  })
})

// List all OPEN rooms the current user hosts (public + private)
roomRoutes.get('/mine', requireAuth, async (c) => {
  const me = c.get('user')
  const { limit, offset } = parseListWindow(c)
  const where = liveRoom(eq(rooms.hostUserId, me.id))
  const rows = await db.select({
    r: rooms,
    romTitle: roms.title,
    romPlatform: roms.platform,
    romMaxPlayers: roms.maxPlayers,
    romDefaultCore: roms.defaultCore,
  })
    .from(rooms)
    .innerJoin(roms, eq(roms.id, rooms.romId))
    .where(where)
    .orderBy(desc(rooms.createdAt))
    .limit(limit)
    .offset(offset)
  const [countRow] = await db.select({ n: count() }).from(rooms).where(where)
  const total = Number(countRow?.n || 0)
  return c.json({
    rooms: rows.map(({ r, romTitle, romPlatform, romMaxPlayers, romDefaultCore }) =>
      serializeRoom(r, {
        hostUsername: me.username, romTitle, romPlatform,
        maxPlayers: romMaxPlayers ?? null,
        effectiveMaxPlayers: effectiveMaxPlayersForRom({ ...r, maxPlayers: romMaxPlayers, title: romTitle, fileName: '', platform: romPlatform, defaultCore: romDefaultCore }),
        hostOnline: isHostOnline(r.code),
      }),
    ),
    ...listPage(rows, { total, limit, offset }),
  })
})

// Create room (must be authed; rom must be accessible to user)
roomRoutes.post('/', requireAuth, roomCreateLimiter, async (c) => {
  const me = c.get('user')
  // Honor global netplay kill-switch (admins bypass)
  if (me.role !== 'admin' && (await getSetting('netplayEnabled', '1')) !== '1') {
    return c.json({ error: '管理员已关闭对战功能' }, 403)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)
  const { name, romId, isPublic, allowPlay, password } = parsed.data
  if (!isPublic && !password) return c.json({ error: '私有房间必须设置密码' }, 400)

  if (me.role !== 'admin') {
    const [row] = await db.select({ n: count() }).from(rooms)
      .where(and(liveRoom(), eq(rooms.hostUserId, me.id)))
    if (Number(row?.n || 0) >= MAX_OPEN_ROOMS_PER_USER) {
      return c.json({
        error: '你已有一个未关闭的房间，先关闭它再创建新的',
        openRoomLimit: MAX_OPEN_ROOMS_PER_USER,
      }, 409)
    }
  }

  const rom = (await db.select().from(roms).where(and(eq(roms.id, romId), eq(roms.status, STATUS.normal))).limit(1))[0]
  if (!rom) return c.json({ error: 'ROM 不存在' }, 404)
  if (rom.userId !== me.id && !rom.isPublic && me.role !== 'admin') {
    return c.json({ error: '无权使用该 ROM' }, 403)
  }

  const passwordHash = password ? await hashPassword(password) : null

  // try a few times in case of a code collision
  let code, inserted
  for (let i = 0; i < 5; i++) {
    code = makeRoomCode()
    try {
      inserted = await insertAndFetch(rooms, {
        code,
        hostUserId: me.id,
        romId,
        name: name.trim(),
        isPublic,
        allowPlay,
        passwordHash,
      }, eq(rooms.code, code))
      break
    } catch (err) {
      if (err?.code !== 'ER_DUP_ENTRY' || i === 4) throw err
    }
  }

  return c.json(serializeRoom(inserted, { hostUsername: me.username }))
})

// Fetch room info by code (public endpoint; validates password if provided)
roomRoutes.post('/:code/join', roomJoinLimiter, async (c) => {
  const code = c.req.param('code').toUpperCase()
  const body = await c.req.json().catch(() => ({}))
  const password = typeof body?.password === 'string' ? body.password : ''

  const row = (await db.select({
    r: rooms,
    hostUsername: users.username,
    romTitle: roms.title,
    romPlatform: roms.platform,
    romMaxPlayers: roms.maxPlayers,
    romDefaultCore: roms.defaultCore,
  })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.hostUserId))
    .innerJoin(roms, eq(roms.id, rooms.romId))
    .where(eq(rooms.code, code))
    .limit(1))[0]

  if (!row || row.r.closedAt || row.r.status !== STATUS.normal) return c.json({ error: '房间不存在或已关闭' }, 404)
  const me = await currentUser(c)
  const isHostOrAdmin = !!me && (me.id === row.r.hostUserId || me.role === 'admin')
  if (me?.role !== 'admin' && (await getSetting('netplayEnabled', '1')) !== '1') {
    return c.json({ error: '管理员已关闭对战功能' }, 403)
  }

  if (row.r.passwordHash && !isHostOrAdmin) {
    if (!password) return c.json({ error: '此房间需要密码', needsPassword: true }, 401)
    const ok = await verifyPassword(password, row.r.passwordHash)
    if (!ok) return c.json({ error: '密码不正确' }, 401)
  }

  const room = serializeRoom(row.r, {
    hostUsername: row.hostUsername,
    romTitle: row.romTitle,
    romPlatform: row.romPlatform,
    maxPlayers: row.romMaxPlayers ?? null,
    effectiveMaxPlayers: effectiveMaxPlayersForRom({ ...row.r, maxPlayers: row.romMaxPlayers, title: row.romTitle, fileName: '', platform: row.romPlatform, defaultCore: row.romDefaultCore }),
    hostOnline: isHostOnline(code),
  })
  return c.json({
    ...room,
    roomTicket: createRoomTicket({ code, userId: me?.id ?? null, canJoin: true }),
  })
})

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  romId: z.number().int().positive().optional(),
  isPublic: z.boolean().optional(),
  allowPlay: z.boolean().optional(),
  // password: null clears, '' is treated as null, otherwise sets new hash
  password: z.union([z.string().max(64), z.null()]).optional(),
})

// Update room (host or admin)
roomRoutes.patch('/:code', requireAuth, async (c) => {
  const me = c.get('user')
  const code = c.req.param('code').toUpperCase()
  const row = (await db.select().from(rooms).where(eq(rooms.code, code)).limit(1))[0]
  if (!row || row.status !== STATUS.normal) return c.json({ error: '房间不存在' }, 404)
  if (row.closedAt) return c.json({ error: '房间已关闭' }, 410)
  if (row.hostUserId !== me.id && me.role !== 'admin') {
    return c.json({ error: '无权修改该房间' }, 403)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)

  const patch = {}
  if (typeof parsed.data.name === 'string') patch.name = parsed.data.name.trim()
  if (typeof parsed.data.isPublic === 'boolean') patch.isPublic = parsed.data.isPublic
  if (typeof parsed.data.allowPlay === 'boolean') patch.allowPlay = parsed.data.allowPlay
  if (typeof parsed.data.romId === 'number' && parsed.data.romId !== row.romId) {
    const rom = (await db.select().from(roms).where(and(eq(roms.id, parsed.data.romId), eq(roms.status, STATUS.normal))).limit(1))[0]
    if (!rom) return c.json({ error: 'ROM 不存在' }, 404)
    if (rom.userId !== me.id && !rom.isPublic && me.role !== 'admin') {
      return c.json({ error: '无权使用该 ROM' }, 403)
    }
    patch.romId = parsed.data.romId
  }
  if ('password' in parsed.data) {
    const pw = parsed.data.password
    patch.passwordHash = (pw === null || pw === '') ? null : await hashPassword(pw)
  }
  if (Object.keys(patch).length === 0) {
    const rom = (await db.select().from(roms).where(eq(roms.id, row.romId)).limit(1))[0]
    return c.json(serializeRoom(row, {
      romTitle: rom?.title,
      romPlatform: rom?.platform,
      maxPlayers: rom?.maxPlayers ?? null,
      effectiveMaxPlayers: effectiveMaxPlayersForRom(rom),
      hostUsername: me.username,
    }))
  }

  const updated = await updateAndFetch(rooms, patch, eq(rooms.code, code))
  updateRoomPermissions(code, { allowPlay: updated.allowPlay !== false })
  const rom = (await db.select().from(roms).where(eq(roms.id, updated.romId)).limit(1))[0]
  return c.json(serializeRoom(updated, {
    romTitle: rom?.title,
    romPlatform: rom?.platform,
    maxPlayers: rom?.maxPlayers ?? null,
    effectiveMaxPlayers: effectiveMaxPlayersForRom(rom),
    hostUsername: me.username,
  }))
})

// Close a room (host or admin)
roomRoutes.delete('/:code', requireAuth, async (c) => {
  const me = c.get('user')
  const code = c.req.param('code').toUpperCase()
  const row = (await db.select().from(rooms).where(eq(rooms.code, code)).limit(1))[0]
  if (!row) return c.json({ error: '房间不存在' }, 404)
  if (row.hostUserId !== me.id && me.role !== 'admin') {
    return c.json({ error: '无权关闭该房间' }, 403)
  }
  await db.update(rooms)
    .set({ closedAt: new Date(), status: STATUS.deleted })
    .where(eq(rooms.code, code))
  broadcastRoomClosed(code)
  return c.json({ ok: true })
})
