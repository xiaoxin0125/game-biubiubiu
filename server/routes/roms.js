import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { mkdirSync, createReadStream, statSync, unlinkSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { db, insertAndFetch, updateAndFetch } from '../db/index.js'
import { roms, users, favorites, rooms, STATUS } from '../db/schema.js'
import { requireAuth, currentUser } from '../middleware/auth.js'
import { stream } from 'hono/streaming'
import { getSetting } from './settings.js'
import { broadcastRoomClosed } from '../room-hub.js'
import { resolveMaxPlayersInfo } from '../rom-players.js'

const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR || 'data/uploads')
const MAX_SIZE = Number(process.env.MAX_UPLOAD_BYTES) || 100 * 1024 * 1024
const ALLOWED_PLATFORMS = new Set([
  'arcade',
  'nes', 'famicom', 'fds', 'sfc', 'snes', 'gb', 'gbc', 'gba',
  'megadrive', 'genesis', 'sms', 'gamegear',
  'psx',
])

// Matches only live (non-soft-deleted) ROMs
const liveRom = (extra) => extra ? and(eq(roms.status, STATUS.normal), extra) : eq(roms.status, STATUS.normal)

export const romRoutes = new Hono()

function serialize(rom, owner, opts = {}) {
  const maxPlayersInfo = resolveMaxPlayersInfo(rom, opts.parentRom || null)
  return {
    id: rom.id,
    title: rom.title,
    platform: rom.platform,
    fileName: rom.fileName,
    fileSize: rom.fileSize,
    isPublic: Boolean(rom.isPublic),
    maxPlayers: rom.maxPlayers ?? null,
    effectiveMaxPlayers: maxPlayersInfo.maxPlayers,
    maxPlayersSourceRomId: maxPlayersInfo.sourceRomId,
    userId: rom.userId,
    owner: owner ? { id: owner.id, username: owner.username } : undefined,
    parentRomId: rom.parentRomId ?? null,
    versionLabel: rom.versionLabel ?? null,
    versionCount: opts.versionCount ?? undefined,
    isFavorite: !!opts.isFavorite,
    createdAt: rom.createdAt,
    updatedAt: rom.updatedAt,
  }
}

function canAccessRom(user, rom) {
  return !!rom?.isPublic || rom?.userId === user?.id || user?.role === 'admin'
}

// Count child ROMs grouped by parent id — used to annotate parent listings
// with a "N 版本" badge in the Gallery.
async function childCountsFor(parentIds, user = null, status = STATUS.normal) {
  if (!parentIds.length) return new Map()
  const rows = await db.select().from(roms)
    .where(and(eq(roms.status, status), inArray(roms.parentRomId, parentIds)))
  const out = new Map()
  for (const r of rows) {
    if (!canAccessRom(user, r)) continue
    out.set(r.parentRomId, (out.get(r.parentRomId) || 0) + 1)
  }
  return out
}

async function closeRoomsForRomIds(romIds, reason) {
  if (!romIds.length) return 0
  const openRooms = await db.select({ code: rooms.code }).from(rooms)
    .where(and(
      eq(rooms.status, STATUS.normal),
      isNull(rooms.closedAt),
      inArray(rooms.romId, romIds),
    ))
  if (!openRooms.length) return 0
  await db.update(rooms)
    .set({ status: STATUS.deleted, closedAt: new Date() })
    .where(and(
      eq(rooms.status, STATUS.normal),
      isNull(rooms.closedAt),
      inArray(rooms.code, openRooms.map((r) => r.code)),
    ))
  for (const room of openRooms) broadcastRoomClosed(room.code, { reason })
  return openRooms.length
}

async function familyChildrenForParent(parentId, { includeDeleted = false } = {}) {
  return await db.select().from(roms)
    .where(includeDeleted
      ? eq(roms.parentRomId, parentId)
      : and(eq(roms.parentRomId, parentId), eq(roms.status, STATUS.normal)))
}

function foreignFamilyRowsFor(user, parent, familyRows) {
  if (user?.role === 'admin') return []
  return familyRows.filter((row) => row.userId !== parent.userId)
}

// Returns a Set<romId> of the current user's favorites, or null when anon.
async function favoriteSetFor(user, romIds) {
  if (!user || romIds.length === 0) return null
  const rows = await db.select({ romId: favorites.romId })
    .from(favorites)
    .where(and(eq(favorites.userId, user.id), inArray(favorites.romId, romIds)))
  return new Set(rows.map((r) => r.romId))
}

romRoutes.get('/mine', requireAuth, async (c) => {
  const user = c.get('user')
  // `/mine` returns everything the user uploaded (parents + children) so they
  // can manage variants from one place. Gallery filters children separately.
  const rows = await db.select().from(roms)
    .where(liveRom(eq(roms.userId, user.id)))
    .orderBy(desc(roms.createdAt))
  const favSet = await favoriteSetFor(user, rows.map((r) => r.id))
  const counts = await childCountsFor(rows.filter((r) => !r.parentRomId).map((r) => r.id), user)
  return c.json({ roms: rows.map((r) => serialize(r, null, {
    isFavorite: favSet?.has(r.id),
    versionCount: counts.get(r.id),
  })) })
})

// List the current user's soft-deleted ROMs — the "recycle bin" view.
// Ordered by updatedAt (most recently deleted first) so the newest go to top.
romRoutes.get('/trash', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(roms)
    .where(and(eq(roms.status, STATUS.deleted), eq(roms.userId, user.id)))
    .orderBy(desc(roms.updatedAt))
  const counts = await childCountsFor(rows.filter((r) => !r.parentRomId).map((r) => r.id), user, STATUS.deleted)
  return c.json({ roms: rows.map((r) => serialize(r, null, {
    versionCount: counts.get(r.id),
  })) })
})

// Restore a soft-deleted ROM (user-owned only, or admin). Restoring a parent
// ROM also restores its deleted child versions so the version family comes back
// as one unit; restoring a child still requires its parent to be live first.
romRoutes.post('/:id/restore', requireAuth, async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const rom = (await db.select().from(roms).where(eq(roms.id, id)).limit(1))[0]
  if (!rom) return c.json({ error: '不存在' }, 404)
  if (rom.userId !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  if (rom.status === STATUS.normal) return c.json({ ok: true })

  if (rom.parentRomId) {
    const parent = (await db.select().from(roms).where(liveRom(eq(roms.id, rom.parentRomId))).limit(1))[0]
    if (!parent) return c.json({ error: '请先恢复父 ROM' }, 409)
    await db.update(roms).set({ status: STATUS.normal }).where(eq(roms.id, id))
    return c.json({ ok: true, restoredCount: 1 })
  }

  const children = await familyChildrenForParent(rom.id, { includeDeleted: true })
  const foreignRows = foreignFamilyRowsFor(user, rom, children)
  if (foreignRows.length) {
    return c.json({ error: '该版本家族包含其他用户的 ROM，请联系管理员处理' }, 409)
  }
  const targets = [rom, ...children].filter((row) => row.status !== STATUS.normal)
  if (!targets.length) return c.json({ ok: true, restoredCount: 0 })
  await db.update(roms).set({ status: STATUS.normal }).where(inArray(roms.id, targets.map((row) => row.id)))
  return c.json({ ok: true, restoredCount: targets.length })
})

romRoutes.get('/public', async (c) => {
  // Only top-level parents show up in the public Gallery. Children are still
  // reachable via /api/roms/:parentId/versions for the version picker.
  const rows = await db.select({
    rom: roms,
    user: { id: users.id, username: users.username },
  })
    .from(roms)
    .innerJoin(users, eq(users.id, roms.userId))
    .where(liveRom(and(eq(roms.isPublic, true), isNull(roms.parentRomId))))
    .orderBy(desc(roms.createdAt))
  const me = await currentUser(c)
  const favSet = await favoriteSetFor(me, rows.map(({ rom }) => rom.id))
  const counts = await childCountsFor(rows.map(({ rom }) => rom.id), me)
  return c.json({ roms: rows.map(({ rom, user }) => serialize(rom, user, {
    isFavorite: favSet?.has(rom.id),
    versionCount: counts.get(rom.id),
  })) })
})

// List all versions (parent + children) for a given ROM id. Accepts either the
// parent's id or any child's id — in both cases returns the full family.
romRoutes.get('/:id/versions', async (c) => {
  const id = Number(c.req.param('id'))
  const seed = (await db.select().from(roms).where(liveRom(eq(roms.id, id))).limit(1))[0]
  if (!seed) return c.json({ versions: [] })
  const parentId = seed.parentRomId ?? seed.id
  const rows = await db.select({
    rom: roms,
    user: { id: users.id, username: users.username },
  })
    .from(roms)
    .innerJoin(users, eq(users.id, roms.userId))
    .where(liveRom(or(eq(roms.id, parentId), eq(roms.parentRomId, parentId))))
    .orderBy(roms.id)
  const me = await currentUser(c)
  return c.json({
    parentId,
    versions: rows
      .filter(({ rom }) => rom.isPublic || rom.userId === me?.id || me?.role === 'admin')
      .map(({ rom, user }) => serialize(rom, user)),
  })
})

// List the current user's favorited ROMs. Pulls any ROM they favorited that
// is still live AND they can access (their own ROM, or isPublic).
romRoutes.get('/favorites', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await db.select({
    rom: roms,
    user: { id: users.id, username: users.username },
  })
    .from(favorites)
    .innerJoin(roms, eq(roms.id, favorites.romId))
    .innerJoin(users, eq(users.id, roms.userId))
    .where(and(
      eq(favorites.userId, user.id),
      eq(roms.status, STATUS.normal),
    ))
    .orderBy(desc(favorites.createdAt))
  const visibleRows = rows.filter(({ rom }) => rom.isPublic || rom.userId === user.id || user.role === 'admin')
  const counts = await childCountsFor(visibleRows
    .map(({ rom }) => rom)
    .filter((rom) => !rom.parentRomId)
    .map((rom) => rom.id), user)
  return c.json({
    roms: visibleRows.map(({ rom, user: owner }) => serialize(rom, owner, {
      isFavorite: true,
      versionCount: counts.get(rom.id),
    })),
  })
})

romRoutes.post('/:id/favorite', requireAuth, async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const rom = (await db.select().from(roms).where(liveRom(eq(roms.id, id))).limit(1))[0]
  if (!rom) return c.json({ error: '不存在' }, 404)
  if (!rom.isPublic && rom.userId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }
  try {
    await db.insert(favorites).values({ userId: user.id, romId: id })
  } catch (err) {
    if (err?.code !== 'ER_DUP_ENTRY') throw err
  }
  return c.json({ ok: true, isFavorite: true })
})

romRoutes.delete('/:id/favorite', requireAuth, async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.romId, id)))
  return c.json({ ok: true, isFavorite: false })
})

romRoutes.post('/upload', requireAuth, async (c) => {
  const contentLength = Number(c.req.header('content-length') || 0)
  if (contentLength > MAX_SIZE + 1024 * 1024) {
    return c.json({ error: `请求体超过 ${Math.round(MAX_SIZE / 1024 / 1024)}MB` }, 413)
  }
  const user = c.get('user')
  if (user.role !== 'admin' && (await getSetting('userUploadEnabled', '1')) !== '1') {
    return c.json({ error: '管理员已关闭普通用户上传' }, 403)
  }
  const body = await c.req.parseBody({ all: false })
  const file = body.file
  if (!file || typeof file === 'string') return c.json({ error: '未收到文件' }, 400)
  if (file.size > MAX_SIZE) return c.json({ error: `文件超过 ${Math.round(MAX_SIZE / 1024 / 1024)}MB` }, 413)

  const platform = String(body.platform || '')
  if (!ALLOWED_PLATFORMS.has(platform)) return c.json({ error: '不支持的平台' }, 400)

  const titleSchema = z.string().min(1).max(128)
  const title = titleSchema.safeParse(String(body.title || '').trim() || file.name)
  if (!title.success) return c.json({ error: '标题格式不正确' }, 400)

  let isPublic = String(body.isPublic || '') === 'true'

  // Optional parent/version linkage. Parent must be the caller's own top-level
  // ROM on the same platform, and child variants inherit the parent's visibility.
  let parentRomId = null
  let versionLabel = null
  if (body.parentRomId) {
    const pid = Number(body.parentRomId)
    if (Number.isFinite(pid) && pid > 0) {
      const parent = (await db.select().from(roms).where(liveRom(eq(roms.id, pid))).limit(1))[0]
      if (!parent) return c.json({ error: '父 ROM 不存在' }, 400)
      if (parent.userId !== user.id) return c.json({ error: '父 ROM 只能选择你自己的 ROM' }, 403)
      if (parent.platform !== platform) return c.json({ error: '父 ROM 平台不匹配' }, 400)
      if (parent.parentRomId) return c.json({ error: '不支持嵌套版本（父 ROM 本身是变体）' }, 400)
      parentRomId = pid
      isPublic = Boolean(parent.isPublic)
      const lbl = String(body.versionLabel || '').trim().slice(0, 64)
      versionLabel = lbl || '变体'
    }
  }

  const userDir = join(UPLOADS_DIR, String(user.id), platform)
  mkdirSync(userDir, { recursive: true })
  const safeExt = extname(file.name).replace(/[^\w.]/g, '').slice(0, 10) || '.bin'
  const storedName = `${randomUUID()}${safeExt}`
  const filePath = join(userDir, storedName)
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buf)

  const row = await insertAndFetch(roms, {
    userId: user.id,
    title: title.data,
    platform,
    fileName: file.name,
    filePath,
    fileSize: file.size,
    isPublic,
    parentRomId,
    versionLabel,
  }, and(eq(roms.userId, user.id), eq(roms.filePath, filePath)))

  return c.json(serialize(row))
})

romRoutes.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const rows = await db.select().from(roms).where(liveRom(eq(roms.id, id))).limit(1)
  const rom = rows[0]
  if (!rom) return c.json({ error: '不存在' }, 404)
  if (rom.userId !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const nextTitle = typeof body.title === 'string' ? body.title.trim() : ''
  const wantsVisibility = typeof body.isPublic === 'boolean'
  const wantsMaxPlayers = user.role === 'admin' && Object.prototype.hasOwnProperty.call(body, 'maxPlayers')
  if (!nextTitle && !wantsVisibility && !wantsMaxPlayers) return c.json(serialize(rom))

  if (wantsVisibility) {
    const familyRoot = rom.parentRomId
      ? (await db.select().from(roms).where(liveRom(eq(roms.id, rom.parentRomId))).limit(1))[0] || rom
      : rom
    const children = familyRoot.parentRomId ? [] : await familyChildrenForParent(familyRoot.id)
    const foreignRows = foreignFamilyRowsFor(user, familyRoot, children)
    if (foreignRows.length) {
      return c.json({ error: '该版本家族包含其他用户的 ROM，请联系管理员处理' }, 409)
    }
    const familyIds = [familyRoot.id, ...children.map((row) => row.id)]
    await db.update(roms).set({ isPublic: body.isPublic }).where(inArray(roms.id, familyIds))
  }

  if (nextTitle) {
    await updateAndFetch(roms, { title: nextTitle }, eq(roms.id, id))
  }
  if (wantsMaxPlayers) {
    const nextMaxPlayers = body.maxPlayers === null || body.maxPlayers === ''
      ? null
      : Number(body.maxPlayers)
    if (nextMaxPlayers !== null && (!Number.isInteger(nextMaxPlayers) || nextMaxPlayers < 1 || nextMaxPlayers > 4)) {
      return c.json({ error: '人数必须是自动或 1-4' }, 400)
    }
    await updateAndFetch(roms, { maxPlayers: nextMaxPlayers }, eq(roms.id, id))
  }

  const updated = (await db.select().from(roms).where(liveRom(eq(roms.id, id))).limit(1))[0]
  let parent = null
  if (updated?.parentRomId) {
    parent = (await db.select().from(roms).where(liveRom(eq(roms.id, updated.parentRomId))).limit(1))[0] || null
  }
  return c.json(serialize(updated, null, { parentRom: parent }))
})

// DELETE /api/roms/:id
//   default:           soft-delete (status=deleted, file kept on disk for admin recovery)
//   ?permanent=1:      hard-delete — unlinks rom file + all save-state files,
//                      cascade-removes favorites/save_states/rooms rows,
//                      and also purges any child-version ROMs belonging to this
//                      parent (kof97 parent → also wipes kof97pls / kof97a).
romRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const permanent = c.req.query('permanent') === '1' || c.req.query('permanent') === 'true'

  // Hard-delete needs to find both live AND already-soft-deleted rows so admins
  // can purge the trash. Soft-delete path keeps the live-only filter.
  const finder = permanent
    ? db.select().from(roms).where(eq(roms.id, id))
    : db.select().from(roms).where(liveRom(eq(roms.id, id)))
  const rows = await finder.limit(1)
  const rom = rows[0]
  if (!rom) return c.json({ error: '不存在' }, 404)
  if (rom.userId !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)

  let targets = [rom]
  if (!rom.parentRomId) {
    const children = await familyChildrenForParent(rom.id, { includeDeleted: permanent })
    const foreignRows = foreignFamilyRowsFor(user, rom, children)
    if (foreignRows.length) {
      return c.json({ error: '该版本家族包含其他用户的 ROM，请联系管理员处理' }, 409)
    }
    targets = [rom, ...children]
  }

  if (!permanent) {
    const liveTargets = targets.filter((row) => row.status === STATUS.normal)
    await closeRoomsForRomIds(liveTargets.map((row) => row.id), 'rom-soft-deleted')
    await db.update(roms)
      .set({ status: STATUS.deleted })
      .where(inArray(roms.id, liveTargets.map((row) => row.id)))
    return c.json({ ok: true, mode: 'soft', affectedCount: liveTargets.length })
  }

  await closeRoomsForRomIds(targets.map((t) => t.id), 'rom-permanently-deleted')

  // Purge on-disk artifacts first (rom files + save state blobs for each target)
  const { saveStates } = await import('../db/schema.js')
  for (const t of targets) {
    // save-state files
    const states = await db.select().from(saveStates).where(eq(saveStates.romId, t.id))
    for (const s of states) {
      try { unlinkSync(s.filePath) } catch {}
    }
    // the rom file itself
    try { unlinkSync(t.filePath) } catch {}
  }

  // DB: children first, then the parent. FK cascades remove favorites/save_states/rooms.
  for (const t of targets) {
    if (t.id !== rom.id) await db.delete(roms).where(eq(roms.id, t.id))
  }
  await db.delete(roms).where(eq(roms.id, rom.id))

  return c.json({ ok: true, mode: 'permanent', purgedCount: targets.length })
})

async function serveRomFile(c) {
  const id = Number(c.req.param('id'))
  const rows = await db.select().from(roms).where(liveRom(eq(roms.id, id))).limit(1)
  const rom = rows[0]
  if (!rom) return c.json({ error: 'not found' }, 404)

  // Gating: playing normally requires a logged-in account. Admins can opt in
  // to guest play via the `guestPlayEnabled` setting — anonymous visitors
  // then get to boot PUBLIC ROMs only (no save-states, no netplay; those
  // still require auth elsewhere).
  const user = await currentUser(c)
  if (!user) {
    const guestOk = (await getSetting('guestPlayEnabled', '0')) === '1'
    if (!guestOk) return c.json({ error: '请先登录' }, 401)
    if (!rom.isPublic) return c.json({ error: '该 ROM 非公开' }, 403)
  } else if (!rom.isPublic && user.id !== rom.userId && user.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }

  const st = statSync(rom.filePath)
  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Length', String(st.size))
  c.header('Content-Disposition', `inline; filename="${encodeURIComponent(rom.fileName)}"`)
  return stream(c, async (s) => {
    const fileStream = createReadStream(rom.filePath)
    await s.pipe(new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk))
        fileStream.on('end', () => controller.close())
        fileStream.on('error', (err) => controller.error(err))
      },
    }))
  })
}

romRoutes.get('/:id/file', serveRomFile)
// Alias with the filename as the last segment — lets FBNeo / MAME pick up the
// romset name from the URL (the :name segment is cosmetic, content comes from DB).
romRoutes.get('/:id/file/:name', serveRomFile)
