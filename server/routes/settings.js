import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rooms, settings, STATUS } from '../db/schema.js'
import { requireAdmin } from '../middleware/auth.js'
import { broadcastRoomClosed, updateGuestPlayPermissions } from '../room-hub.js'

// Keys exposed to anonymous clients
const PUBLIC_KEYS = new Set(['siteTitle', 'siteSubtitle', 'netplayEnabled', 'guestPlayEnabled', 'userUploadEnabled'])
// Keys admins are allowed to write
const WRITABLE_KEYS = new Set(['siteTitle', 'siteSubtitle', 'netplayEnabled', 'guestPlayEnabled', 'userUploadEnabled'])

const DEFAULTS = {
  siteTitle: 'Games Online',
  siteSubtitle: '自托管浏览器游戏厅',
  netplayEnabled: '1',
  // When '1', anonymous visitors can boot any public ROM (no save / no netplay).
  // Default off — admins opt in.
  guestPlayEnabled: '0',
  // When '1', normal users may upload ROMs. Admins can always upload.
  userUploadEnabled: '1',
}

// --- Low-level helpers (reused by other server modules) ---
export async function getSetting(key, fallback) {
  const row = (await db.select().from(settings).where(eq(settings.key, key)).limit(1))[0]
  return row?.value ?? fallback ?? DEFAULTS[key]
}

async function getAll() {
  const rows = await db.select().from(settings)
  const out = { ...DEFAULTS }
  for (const r of rows) out[r.key] = r.value
  return out
}

async function upsert(key, value) {
  await db.insert(settings).values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } })
}

async function closeOpenRooms(reason) {
  const openRooms = await db.select({ code: rooms.code }).from(rooms)
    .where(and(eq(rooms.status, STATUS.normal), isNull(rooms.closedAt)))
  if (!openRooms.length) return 0
  await db.update(rooms)
    .set({ status: STATUS.deleted, closedAt: new Date() })
    .where(and(eq(rooms.status, STATUS.normal), isNull(rooms.closedAt)))
  for (const room of openRooms) broadcastRoomClosed(room.code, { reason })
  return openRooms.length
}

// ---- Public (anonymous) ----
export const publicSettingsRoutes = new Hono()
publicSettingsRoutes.get('/', async (c) => {
  const all = await getAll()
  const out = {}
  for (const k of PUBLIC_KEYS) out[k] = all[k]
  return c.json(out)
})

// ---- Admin ----
export const adminSettingsRoutes = new Hono()
adminSettingsRoutes.use('*', requireAdmin)

adminSettingsRoutes.get('/', async (c) => c.json(await getAll()))

adminSettingsRoutes.patch('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body || typeof body !== 'object') return c.json({ error: '格式不正确' }, 400)
  for (const [k, v] of Object.entries(body)) {
    if (!WRITABLE_KEYS.has(k)) continue
    // booleans/strings: coerce to string for storage
    let val
    if (typeof v === 'boolean') val = v ? '1' : '0'
    else if (typeof v === 'string') val = v.slice(0, 200)
    else continue
    if (k === 'siteTitle' || k === 'siteSubtitle') {
      val = val.trim()
      if (!val) continue
    }
    await upsert(k, val)
    if (k === 'guestPlayEnabled') updateGuestPlayPermissions(val === '1')
    if (k === 'netplayEnabled' && val !== '1') await closeOpenRooms('netplay-disabled')
  }
  return c.json(await getAll())
})
