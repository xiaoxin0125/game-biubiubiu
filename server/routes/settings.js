import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rooms, settings, STATUS } from '../db/schema.js'
import { requireAdmin } from '../middleware/auth.js'
import { broadcastRoomClosed, updateGuestPlayPermissions } from '../room-hub.js'
import { audit } from '../audit.js'
import { STUN_SETTING_KEY, normalizeStunUrls } from '../webrtc-settings.js'
import {
  TURN_URLS_KEY,
  TURN_USERNAME_KEY,
  TURN_CREDENTIAL_KEY,
  normalizeTurnUrls,
  normalizeTurnUsername,
  normalizeTurnCredential,
} from '../webrtc-settings.js'
import { testStunUrls, probeTurnServer, probeTurnWithCredentials } from '../stun-test.js'
import {
  REMOTE_UPLOAD_THRESHOLD_BYTES,
  REMOTE_TOKEN_KEY,
  REMOTE_URL_KEY,
  REMOTE_DOWNLOAD_URL_KEY,
  REMOTE_DOWNLOAD_SECRET_KEY,
  ROM_DIRECT_ENABLED_KEY,
  normalizeRemoteToken,
  normalizeRemoteUrl,
  normalizeRemoteDownloadUrl,
  normalizeRemoteDownloadSecret,
  remoteHealth,
} from '../remote-storage.js'
import { CORES_BASE_URL_KEY, CORES_REMOTE_ENABLED_KEY, normalizeCoresBaseUrl, normalizeCoresRemoteEnabled } from '../cores-release.js'

// Keys exposed to anonymous clients
const PUBLIC_KEYS = new Set(['siteTitle', 'siteSubtitle', 'netplayEnabled', 'guestPlayEnabled', 'userUploadEnabled'])
// Keys admins are allowed to write
const WRITABLE_KEYS = new Set([
  ...PUBLIC_KEYS,
  STUN_SETTING_KEY,
  TURN_URLS_KEY,
  TURN_USERNAME_KEY,
  TURN_CREDENTIAL_KEY,
  REMOTE_URL_KEY,
  REMOTE_TOKEN_KEY,
  REMOTE_DOWNLOAD_URL_KEY,
  REMOTE_DOWNLOAD_SECRET_KEY,
  ROM_DIRECT_ENABLED_KEY,
  CORES_BASE_URL_KEY,
  CORES_REMOTE_ENABLED_KEY,
])

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
  // TURN 中继同样在后台配置；环境变量只作为兜底（见 runtime-config.js）
  [TURN_URLS_KEY]: '',
  [TURN_USERNAME_KEY]: '',
  [TURN_CREDENTIAL_KEY]: '',
  // Optional remote storage for large ROMs (see /www/wwwroot/rom-upload).
  [REMOTE_URL_KEY]: '',
  [REMOTE_TOKEN_KEY]: '',
  // 浏览器直连下载（302 到短期签名地址）：默认关闭，先走本机代理确保可用。
  [REMOTE_DOWNLOAD_URL_KEY]: '',
  [REMOTE_DOWNLOAD_SECRET_KEY]: '',
  [ROM_DIRECT_ENABLED_KEY]: '0',
  // 核心资源基地址（远端资源服务器）：空 = 没保存过地址，none = 老数据里的"强制本机"。
  [CORES_BASE_URL_KEY]: '',
  // 核心资源启用开关：'1' 开、'0' 关、'' 老数据（按地址推断）。地址与开关分开存，
  // 这样填好地址可以先保存、测通再打开，不必重填。
  [CORES_REMOTE_ENABLED_KEY]: '',
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

// 测试 STUN：默认用已保存的配置；带上 stunUrls 时先测表单里还没保存的值。
// 这是一个真实的 STUN Binding 探测（UDP/TCP），能区分网络不通、端口没监听和服务器正常。
adminSettingsRoutes.post('/test-stun', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  let value
  if (body && typeof body === 'object' && Object.hasOwn(body, 'stunUrls')) {
    const raw = Array.isArray(body.stunUrls) ? body.stunUrls.join(',') : String(body.stunUrls ?? '')
    try {
      // 地址格式先用和保存时同一套规则校验一遍
      value = normalizeStunUrls(raw)
    } catch (error) {
      return c.json({ ok: false, error: error.message })
    }
  } else {
    value = await getSetting(STUN_SETTING_KEY, '')
  }
  if (!value) {
    return c.json({ ok: false, error: '还没有填写 STUN 地址' })
  }
  try {
    const result = await testStunUrls(value.split(','))
    await audit(c, {
      action: 'admin.settings.test-stun',
      targetType: 'settings',
      metadata: { urls: result.probes.map((probe) => probe.url), okCount: result.okCount },
    })
    return c.json(result)
  } catch (error) {
    return c.json({ ok: false, error: error.message })
  }
})

// 测试 TURN 中继：默认用后台保存的配置（没有则退回环境变量）。
// 填了用户名/密码时会做一次带鉴权的 Allocate，真的分配一个中继端口；
// 没填则只发不带凭据的 Allocate，401/438 即表示中继可用。
adminSettingsRoutes.post('/test-turn', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const hasOverride = body && typeof body === 'object' && Object.hasOwn(body, 'turnUrls')
  let urlsValue
  let username
  let credential
  if (hasOverride) {
    try {
      urlsValue = normalizeTurnUrls(Array.isArray(body.turnUrls) ? body.turnUrls.join(',') : String(body.turnUrls ?? ''))
      username = normalizeTurnUsername(body.turnUsername ?? '')
      credential = normalizeTurnCredential(body.turnCredential ?? '')
    } catch (error) {
      return c.json({ ok: false, error: error.message })
    }
  } else {
    const all = await getAll()
    urlsValue = all[TURN_URLS_KEY] || String(process.env.VITE_WEBRTC_TURN_URLS || '')
    username = all[TURN_USERNAME_KEY] || String(process.env.VITE_WEBRTC_TURN_USERNAME || '')
    credential = all[TURN_CREDENTIAL_KEY] || String(process.env.VITE_WEBRTC_TURN_CREDENTIAL || '')
  }

  const list = [...new Set(String(urlsValue || '').split(/[,\r\n]+/).map((item) => item.trim()).filter(Boolean))]
  if (!list.length) return c.json({ ok: false, error: '还没有填写 TURN 地址' })

  const authenticated = !!username && !!credential
  const probes = []
  for (const url of list) {
    if (authenticated) {
      probes.push(await probeTurnWithCredentials(url, { username, credential }))
    } else {
      probes.push(await probeTurnServer(url))
    }
  }
  const okCount = probes.filter((item) => item.ok).length
  await audit(c, {
    action: 'admin.settings.test-turn',
    targetType: 'settings',
    metadata: { urls: probes.map((probe) => probe.url), okCount, authenticated },
  })
  return c.json({
    ok: okCount > 0,
    probes,
    okCount,
    failCount: probes.length - okCount,
    authenticated,
    summary: okCount === probes.length ? `${probes.length} 个 TURN 地址全部可用` : `${probes.length} 个地址中 ${okCount} 个可用`,
  })
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
    } else if (k === TURN_URLS_KEY) {
      try {
        val = normalizeTurnUrls(v)
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === TURN_USERNAME_KEY) {
      try {
        val = normalizeTurnUsername(v)
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === TURN_CREDENTIAL_KEY) {
      try {
        val = normalizeTurnCredential(v)
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
    } else if (k === REMOTE_DOWNLOAD_URL_KEY) {
      try {
        val = normalizeRemoteDownloadUrl(v, { allowInsecure: process.env.NODE_ENV !== 'production' })
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === REMOTE_DOWNLOAD_SECRET_KEY) {
      try {
        val = normalizeRemoteDownloadSecret(v)
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === CORES_BASE_URL_KEY) {
      try {
        val = normalizeCoresBaseUrl(v, { allowInsecure: process.env.NODE_ENV !== 'production' })
      } catch (error) {
        return c.json({ error: error.message }, 400)
      }
    } else if (k === CORES_REMOTE_ENABLED_KEY) {
      try {
        val = normalizeCoresRemoteEnabled(v)
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
