import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { db, updateAndFetch } from '../db/index.js'
import { users, roms, rooms, STATUS } from '../db/schema.js'
import { requireAdmin, invalidateUserSessions } from '../middleware/auth.js'
import { broadcastRoomClosed } from '../room-hub.js'
import { resolveMaxPlayersInfo } from '../rom-players.js'

export const adminRoutes = new Hono()

const BIOS_DIR = resolve(process.env.BIOS_DIR || 'data/bios')
const REQUIRED_BIOS_FILES = {
  arcade: [
    'neogeo.zip',
    'pgm.zip',
    'nmk004.zip',
    'cchip.zip',
    'decocass.zip',
    'isgsm.zip',
    'midssio.zip',
    'bubsys.zip',
    'ym2608.zip',
    'skns.zip',
  ],
  psx: ['scph5500.bin', 'scph5501.bin', 'scph5502.bin', 'scph7001.bin', 'psxonpsp660.bin'],
  fds: ['disksys.rom'],
}
const BIOS_PLATFORM_LABELS = {
  arcade: '街机',
  psx: 'PlayStation',
  fds: 'Famicom Disk System',
}

function readBiosFiles(platform) {
  const safePlatform = String(platform).replace(/[^a-z0-9_-]/gi, '')
  if (!safePlatform) return []
  const dir = join(BIOS_DIR, safePlatform)
  if (!dir.startsWith(BIOS_DIR) || !existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => {
        const full = join(dir, entry.name)
        const st = statSync(full)
        return { name: entry.name, size: st.size, updatedAt: st.mtime.toISOString() }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

adminRoutes.use('*', requireAdmin)

adminRoutes.get('/bios', async (c) => {
  const platforms = Object.keys(REQUIRED_BIOS_FILES)
  const items = platforms.map((platform) => {
    const files = readBiosFiles(platform)
    const present = new Set(files.map((file) => file.name))
    const required = REQUIRED_BIOS_FILES[platform]
    return {
      platform,
      label: BIOS_PLATFORM_LABELS[platform] || platform,
      required,
      files,
      missing: required.filter((name) => !present.has(name)),
    }
  })
  return c.json({ bios: items })
})

adminRoutes.get('/users', async (c) => {
  const rows = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users)
    .where(eq(users.status, STATUS.normal))
    .orderBy(desc(users.createdAt))
  return c.json({ users: rows })
})

// Soft-delete a user, invalidate their sessions, close affected live rooms, and
// release the unique username so the same username can be registered again.
adminRoutes.delete('/users/:id', async (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  if (id === me.id) return c.json({ error: '不能删除自己' }, 400)
  const victim = (await db.select().from(users)
    .where(and(eq(users.id, id), eq(users.status, STATUS.normal))).limit(1))[0]
  if (!victim) return c.json({ error: 'not found' }, 404)

  const ownedRoms = await db.select({ id: roms.id }).from(roms).where(eq(roms.userId, id))
  const ownedRomIds = ownedRoms.map((r) => r.id)
  const affectedRooms = await db.select({ code: rooms.code }).from(rooms)
    .where(and(
      eq(rooms.status, STATUS.normal),
      isNull(rooms.closedAt),
      ownedRomIds.length
        ? or(eq(rooms.hostUserId, id), inArray(rooms.romId, ownedRomIds))
        : eq(rooms.hostUserId, id),
    ))

  const deletedUsername = `deleted_${id}_${Date.now().toString(36)}`.slice(0, 32)
  await db.update(users).set({ status: STATUS.deleted, username: deletedUsername }).where(eq(users.id, id))
  await invalidateUserSessions(id)
  await db.update(roms).set({ status: STATUS.deleted }).where(eq(roms.userId, id))
  if (affectedRooms.length) {
    await db.update(rooms)
      .set({ status: STATUS.deleted, closedAt: new Date() })
      .where(and(
        eq(rooms.status, STATUS.normal),
        isNull(rooms.closedAt),
        inArray(rooms.code, affectedRooms.map((r) => r.code)),
      ))
    for (const room of affectedRooms) broadcastRoomClosed(room.code, { reason: 'host-deleted' })
  }
  return c.json({ ok: true, releasedUsername: victim.username, closedRooms: affectedRooms.length })
})

adminRoutes.patch('/users/:id', async (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  if (id === me.id) return c.json({ error: '不能修改自己的角色' }, 400)
  const body = await c.req.json().catch(() => ({}))
  const patch = {}
  if (body.role === 'user' || body.role === 'admin') patch.role = body.role
  if (Object.keys(patch).length === 0) return c.json({ error: '没有可修改的字段' }, 400)
  const target = (await db.select().from(users)
    .where(and(eq(users.id, id), eq(users.status, STATUS.normal))).limit(1))[0]
  if (!target) return c.json({ error: 'not found' }, 404)
  const updated = await updateAndFetch(users, patch, eq(users.id, id))
  return c.json({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    createdAt: updated.createdAt,
  })
})

adminRoutes.get('/roms', async (c) => {
  const rows = await db.select({
    rom: roms,
    user: { id: users.id, username: users.username },
  })
    .from(roms)
    .innerJoin(users, eq(users.id, roms.userId))
    .where(eq(roms.status, STATUS.normal))
    .orderBy(desc(roms.createdAt))
  return c.json({
    roms: rows.map(({ rom, user }) => ({
      id: rom.id,
      title: rom.title,
      platform: rom.platform,
      fileName: rom.fileName,
      fileSize: rom.fileSize,
      isPublic: Boolean(rom.isPublic),
      maxPlayers: rom.maxPlayers ?? null,
      effectiveMaxPlayers: resolveMaxPlayersInfo(rom).maxPlayers,
      createdAt: rom.createdAt,
      owner: user,
    })),
  })
})
