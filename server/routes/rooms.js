import { Hono } from 'hono'
import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, insertAndFetch, updateAndFetch } from '../db/index.js'
import { rooms, roms, users, STATUS } from '../db/schema.js'
import { requireAuth, currentUser } from '../middleware/auth.js'
import { getSetting } from './settings.js'
import { updateRoomPermissions, isHostOnline, broadcastRoomClosed } from '../room-hub.js'
import { effectiveMaxPlayersForRom } from '../rom-players.js'
import { rateLimit, consumeRateLimit, peekRateLimit } from '../middleware/rate-limit.js'
import { clientIp } from '../middleware/security.js'
import { parseListWindow, listPage } from '../http-utils.js'
import { hashPassword, verifyPassword } from '../passwords.js'
import { createRoomTicket } from '../room-tickets.js'
import { liveRoom, makeRoomCode, serializeRoom } from '../rooms/room-repository.js'
// 房间卡片上要摆游戏封面，封面地址与 ROM 列表用的是同一个（/api/roms/:id/cover）
import { coverUrlFor } from './roms.js'

// 每个普通用户同时只能有一个未关闭的房间（管理员不受限，便于排查问题）。
// 房间记录只增不减、也没有分页，不设上限的话一个账号就能把房间表刷满
// （2026-10 审计 M-4）。
const MAX_OPEN_ROOMS_PER_USER = 1

// 房间名最长 7 个字：大厅卡片顶部那一行要放得下名字 + 房间码，太长的名字会把
// 房间码挤掉。前端输入框按同样的长度限制，这里兜底并给一句能看懂的提示。
const ROOM_NAME_MAX = 7

// 私有房间的口令就是它的全部保护：口令空间太小的话，入房限流（30 次/分钟）挡不住
// 换 IP 的慢速爆破 —— 4 位数字单 IP 一天内能试完（2026-10-16 重审 N-2）。
// 下限只约束"新设置的口令"，已有房间的旧口令照常校验，不会把人锁在自己房间外。
const ROOM_PASSWORD_MIN = 4
// 口令错误单独计数（成功不消耗）：同一个来源对同一个房间连着错 10 次，
// 之后 15 分钟内不再受理该房间的密码尝试。
const ROOM_PASSWORD_FAIL_MAX = 10
const ROOM_PASSWORD_FAIL_WINDOW_MS = 15 * 60 * 1000

function passwordPolicyError(password) {
  if (typeof password !== 'string' || !password) return ''
  return password.length < ROOM_PASSWORD_MIN ? `房间密码至少 ${ROOM_PASSWORD_MIN} 位` : ''
}

function passwordFailKey(c, code) {
  return `room-password:${clientIp(c)}:${String(code || '').toUpperCase()}`
}

function nameErrorMessage(error) {
  return error.issues?.some((issue) => issue.path?.[0] === 'name')
    ? `房间名称需为 1-${ROOM_NAME_MAX} 个字`
    : ''
}

const createSchema = z.object({
  name: z.string().min(1).max(ROOM_NAME_MAX),
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
  const me = await currentUser(c)
  const { limit, offset } = parseListWindow(c)
  const where = liveRoom(eq(rooms.isPublic, true))
  const rows = await db.select({
    r: rooms,
    hostUsername: users.username,
    romTitle: roms.title,
    romPlatform: roms.platform,
    romCoverPath: roms.coverPath,
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
    rooms: rows.map(({ r, hostUsername, romTitle, romPlatform, romCoverPath, romMaxPlayers, romDefaultCore }) =>
      serializeRoom(r, {
        hostUsername, romTitle, romPlatform,
        romCoverUrl: coverUrlFor({ id: r.romId, coverPath: romCoverPath }),
        // 大厅匿名可读：只告诉前端"这张卡片是不是你的"，房主的内部用户 ID 不下发
        isMine: !!me && me.id === r.hostUserId,
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
    romCoverPath: roms.coverPath,
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
    rooms: rows.map(({ r, romTitle, romPlatform, romCoverPath, romMaxPlayers, romDefaultCore }) =>
      serializeRoom(r, {
        hostUsername: me.username, romTitle, romPlatform,
        romCoverUrl: coverUrlFor({ id: r.romId, coverPath: romCoverPath }),
        // 这个列表里的房间都是自己主持的
        isMine: true,
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
  if (!parsed.success) return c.json({ error: nameErrorMessage(parsed.error) || '参数不合法' }, 400)
  const { name, romId, isPublic, allowPlay, password } = parsed.data
  if (!isPublic && !password) return c.json({ error: '私有房间必须设置密码' }, 400)
  const passwordError = passwordPolicyError(password)
  if (passwordError) return c.json({ error: passwordError }, 400)

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

  return c.json(serializeRoom(inserted, {
    // 单个房间的返回值带上房主 ID：进房页要据此判断"我是房主"
    hostUserId: inserted.hostUserId,
    hostUsername: me.username,
    romTitle: rom.title,
    romPlatform: rom.platform,
    romCoverUrl: coverUrlFor(rom),
  }))
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
    romCoverPath: roms.coverPath,
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
    // 只看一眼这个来源是不是已经错太多次（只读、不消耗），再校验口令；
    // 口令错了才计数 —— 输对的人不该占用尝试次数（2026-10-16 重审 N-2）。
    const failKey = passwordFailKey(c, code)
    const failOptions = { windowMs: ROOM_PASSWORD_FAIL_WINDOW_MS, max: ROOM_PASSWORD_FAIL_MAX }
    const gate = peekRateLimit(failKey, failOptions)
    if (!gate.ok) {
      c.header('Retry-After', String(gate.retryAfter))
      return c.json({ error: '密码错误次数过多，请稍后再试' }, 429)
    }
    const ok = await verifyPassword(password, row.r.passwordHash)
    if (!ok) {
      consumeRateLimit(failKey, failOptions)
      return c.json({ error: '密码不正确' }, 401)
    }
  }

  const room = serializeRoom(row.r, {
    hostUserId: row.r.hostUserId,
    hostUsername: row.hostUsername,
    romTitle: row.romTitle,
    romPlatform: row.romPlatform,
    romCoverUrl: coverUrlFor({ id: row.r.romId, coverPath: row.romCoverPath }),
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
  name: z.string().min(1).max(ROOM_NAME_MAX).optional(),
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
  if (!parsed.success) return c.json({ error: nameErrorMessage(parsed.error) || '参数不合法' }, 400)

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
    // 空串 / null 表示"清除密码"，不校验长度；填了新口令才要求够长
    const passwordError = passwordPolicyError(pw)
    if (passwordError) return c.json({ error: passwordError }, 400)
    patch.passwordHash = (pw === null || pw === '') ? null : await hashPassword(pw)
  }
  if (Object.keys(patch).length === 0) {
    const rom = (await db.select().from(roms).where(eq(roms.id, row.romId)).limit(1))[0]
    return c.json(serializeRoom(row, {
      hostUserId: row.hostUserId,
      romTitle: rom?.title,
      romPlatform: rom?.platform,
      romCoverUrl: coverUrlFor(rom),
      maxPlayers: rom?.maxPlayers ?? null,
      effectiveMaxPlayers: effectiveMaxPlayersForRom(rom),
      hostUsername: me.username,
    }))
  }

  const updated = await updateAndFetch(rooms, patch, eq(rooms.code, code))
  // 名字也要同步给房间内的人（房间名在信令的 room 状态里下发）
  updateRoomPermissions(code, { allowPlay: updated.allowPlay !== false, name: updated.name })
  const rom = (await db.select().from(roms).where(eq(roms.id, updated.romId)).limit(1))[0]
  return c.json(serializeRoom(updated, {
    hostUserId: updated.hostUserId,
    romTitle: rom?.title,
    romPlatform: rom?.platform,
    romCoverUrl: coverUrlFor(rom),
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
