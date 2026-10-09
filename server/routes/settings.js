import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rooms, settings, STATUS } from '../db/schema.js'
import { requireAdmin } from '../middleware/auth.js'
import { broadcastRoomClosed, updateGuestPlayPermissions } from '../room-hub.js'
import { audit } from '../audit.js'
import { STUN_SETTING_KEY, normalizeStunUrls } from '../webrtc-settings.js'
import {
  REMOTE_UPLOAD_THRESHOLD_BYTES,
  REMOTE_TOKEN_KEY,
  REMOTE_URL_KEY,
  normalizeRemoteToken,
  normalizeRemoteUrl,
  remoteHealth,
} from '../remote-storage.js'

// Keys exposed to anonymous clients
const PUBLIC_KEYS = new Set(['siteTitle', 'siteSubtitle', 'netplayEnabled', 'guestPlayEnabled', 'userUploadEnabled'])
// Keys admins are allowed to write
const WRITABLE_KEYS = new Set([...PUBLIC_KEYS, STUN_SETTING_KEY, REMOTE_URL_KEY, REMOTE_TOKEN_KEY])

const DEFAULTS = {
  siteTitle: 'Games Online',
  siteSubtitle: '自托管浏览器游戏厅',
  netplayEnabled: '1',
  // When '1', anonymous visitors can boot any public ROM (no save / no netplay).
  // Default off — admins opt in.
  guestPlayEnabled: '0',
  // When '1', normal users may upload ROMs. Admins can always upload.
  userUploadEnabled: '1',
  // Empty means no STUN server; admins can configure it after deployment.
  [STUN_SETTING_KEY]: '',
  // Optional remote storage for large ROMs (see /www/wwwroot/rom-upload).
  [REMOTE_URL_KEY]: '',
  [REMOTE_TOKEN_KEY]: '',
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
  // 只暴露“远端存储是否可用”，地址和密钥留在服务端
  out.remoteUploadAvailable = all[REMOTE_URL_KEY] && all[REMOTE_TOKEN_KEY] ? '1' : '0'
  out.remoteUploadThresholdBytes = REMOTE_UPLOAD_THRESHOLD_BYTES
  return c.json(out)
})

// ---- Admin ----
export const adminSettingsRoutes = new Hono()
adminSettingsRoutes.use('*', requireAdmin)

adminSettingsRoutes.get('/', async (c) => c.json(await getAll()))

// 测试远端存储：默认用已保存的配置；带上 url/token 时先测表单里还没保存的值
adminSettingsRoutes.post('/test-remote', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  let override = null
  if (body && typeof body === 'object' && (body.url || body.token)) {
    try {
      override = {
        url: body.url ? normalizeRemoteUrl(body.url) : '',
        token: body.token ? normalizeRemoteToken(body.token) : '',
      }
    } catch (error) {
      return c.json({ ok: false, error: error.message }, 400)
    }
    if (!override.url || !override.token) return c.json({ ok: false, error: '地址和密钥都要填写' }, 400)
  }
  try {
    const health = await remoteHealth(override)
    return c.json({ ok: true, health })
  } catch (error) {
    return c.json({ ok: false, error: error.message })
  }
})

adminSettingsRoutes.patch('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: '格式不正确' }, 400)
  const patch = {}
  for (const [k, v] of Object.entries(body)) {
    if (!WRITABLE_KEYS.has(k)) continue
    let val
    if (k === STUN_SETTING_KEY) {
      try {
        val = normalizeStunUrls(v)
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === REMOTE_URL_KEY) {
      try {
        val = normalizeRemoteUrl(v)
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === REMOTE_TOKEN_KEY) {
      try {
        val = normalizeRemoteToken(v)
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (typeof v === 'boolean') val = v ? '1' : '0'
    else if (typeof v === 'string') val = v.slice(0, 200)
    else continue
    if (k === 'siteTitle' || k === 'siteSubtitle') {
      val = val.trim()
      if (!val) continue
    }
    patch[k] = val
  }
  // Validate every value before persisting any setting.
  const before = await getAll()
  const changed = {}
  for (const [k, val] of Object.entries(patch)) {
    await upsert(k, val)
    changed[k] = { before: before[k], after: val }
    if (k === 'guestPlayEnabled') updateGuestPlayPermissions(val === '1')
    if (k === 'netplayEnabled' && val !== '1') await closeOpenRooms('netplay-disabled')
  }
  if (Object.keys(changed).length) {
    await audit(c, {
      action: 'admin.settings.update',
      targetType: 'settings',
      metadata: { changed },
    })
  }
  return c.json(await getAll())
})
