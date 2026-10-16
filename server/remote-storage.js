/*
 * 远端 ROM 存储客户端。
 *
 * 大体积 ROM 可以转存到独立的 rom-upload 服务（代码见 /www/wwwroot/rom-upload）。
 * 浏览器始终只和本服务通信：上传由这里带密钥转发，播放时这里再代理回来，
 * 所以共享密钥不会下发到前端。
 *
 * 配置在后台「站点设置 → 远端存储」里（settings 表：remoteUploadUrl / remoteUploadToken）。
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { settings } from './db/schema.js'

export const REMOTE_URL_KEY = 'remoteUploadUrl'
export const REMOTE_TOKEN_KEY = 'remoteUploadToken'
// 浏览器直连下载用的地址与签名密钥：和上传地址/上传密钥分开，泄漏面更小。
export const REMOTE_DOWNLOAD_URL_KEY = 'remoteDownloadUrl'
export const REMOTE_DOWNLOAD_SECRET_KEY = 'remoteDownloadSecret'
export const ROM_DIRECT_ENABLED_KEY = 'romDirectEnabled'

// 直连签名的有效期：够一次大 ROM 下载完成，又不至于变成一个长期公开链接。
export const DIRECT_URL_TTL_SEC = 600
export const DIRECT_URL_PURPOSE = 'download'
// 允许的对表误差，只用于吸收服务器之间的秒级漂移。
export const DIRECT_URL_CLOCK_SKEW_SEC = 60

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 60 * 1000
const HEALTH_TIMEOUT_MS = 8 * 1000
// 直连前的探测：远端整体不可用时干脆不发 302，玩家直接走本地/代理，不用先
// 在浏览器里等一次连接失败。结果缓存一小段时间，正常播放路径几乎无额外开销。
const DIRECT_PROBE_TTL_MS = 30 * 1000
const DIRECT_PROBE_TIMEOUT_MS = 3000

/**
 * 流式上传的超时预算：按体积给，慢速上行也能完成；至少 10 分钟。
 * 目前按每 MiB 2 秒（约 512KB/s）估算，1GB 的文件有约 33 分钟。
 */
export function streamUploadTimeoutMs(size) {
  const bytes = Number(size) || 0
  return Math.max(UPLOAD_TIMEOUT_MS, Math.ceil(bytes / (1024 * 1024)) * 2000)
}

export function normalizeRemoteUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('远端地址必须是 http(s)://主机:端口 形式')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('远端地址只支持 http / https')
  }
  if (!parsed.hostname) throw new Error('远端地址缺少主机名')
  if (parsed.search || parsed.hash) throw new Error('远端地址不能带查询参数或锚点')
  // 只保留协议、主机和可选的路径前缀
  const path = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.host}${path}`
}

export function normalizeRemoteToken(value) {
  const token = String(value ?? '').trim()
  if (!token) return ''
  if (token.length < 16) throw new Error('远端密钥至少需要 16 位')
  if (token.length > 256) throw new Error('远端密钥过长')
  return token
}

/**
 * 浏览器直连下载的地址。和上传地址不同，这个地址必须能被玩家的浏览器打开，
 * 因此生产环境要求 https：站点本身是 https，跨域加载 http 资源会被浏览器拦掉。
 */
export function normalizeRemoteDownloadUrl(value, { allowInsecure = false } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('下载地址必须是 https://主机 形式')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('下载地址只支持 http / https')
  }
  if (parsed.protocol === 'http:' && !allowInsecure) {
    throw new Error('下载地址必须使用 https：https 页面无法跨域下载 http 资源')
  }
  if (!parsed.hostname) throw new Error('下载地址缺少主机名')
  if (parsed.search || parsed.hash) throw new Error('下载地址不能带查询参数或锚点')
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
}

export function normalizeRemoteDownloadSecret(value) {
  const secret = String(value ?? '').trim()
  if (!secret) return ''
  if (secret.length < 16) throw new Error('下载签名密钥至少需要 16 位')
  if (secret.length > 256) throw new Error('下载签名密钥过长')
  return secret
}

/**
 * 直连下载的签名。签名内容绑定"用途 + 文件 id + 过期时间"：
 *   sig = HMAC-SHA256(secret, `${purpose}.${fileId}.${exp}`)
 * 远端只读该 id、且能过期，所以即使链接被转发出去，影响也有限。
 */
export function signRemoteDownloadUrl({ secret, fileId, exp, purpose = DIRECT_URL_PURPOSE }) {
  return createHmac('sha256', String(secret)).update(`${purpose}.${fileId}.${exp}`).digest('hex')
}

export function verifyRemoteDownloadUrl({
  secret,
  fileId,
  exp,
  sig,
  purpose = DIRECT_URL_PURPOSE,
  now = Date.now(),
}) {
  const nowSec = Math.floor(now / 1000)
  const expiry = Number(exp)
  if (!Number.isFinite(expiry)) return { ok: false, error: 'exp 非法' }
  if (expiry < nowSec - DIRECT_URL_CLOCK_SKEW_SEC) return { ok: false, error: '链接已过期' }
  if (expiry > nowSec + DIRECT_URL_TTL_SEC + DIRECT_URL_CLOCK_SKEW_SEC) return { ok: false, error: '过期时间过长' }
  const expected = signRemoteDownloadUrl({ secret, fileId, exp: expiry, purpose })
  const provided = String(sig || '').toLowerCase()
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: '签名不匹配' }
  return { ok: true }
}

// 直接读取 settings 表，避免和 routes/settings.js 形成循环依赖
async function readSetting(key) {
  const row = (await db.select().from(settings).where(eq(settings.key, key)).limit(1))[0]
  return row?.value ?? ''
}

export async function remoteStorageConfig() {
  const [url, token] = await Promise.all([
    readSetting(REMOTE_URL_KEY),
    readSetting(REMOTE_TOKEN_KEY),
  ])
  return { url: String(url || '').trim(), token: String(token || '').trim(), configured: !!url && !!token }
}

/**
 * 浏览器直连下载的配置。`enabled` 是后台开关，`configured` 表示地址+密钥都齐。
 * 只有两个条件同时成立，主站才会 302 到远端，否则继续走本机代理回源。
 */
export async function remoteDownloadConfig() {
  const [url, secret, enabled] = await Promise.all([
    readSetting(REMOTE_DOWNLOAD_URL_KEY),
    readSetting(REMOTE_DOWNLOAD_SECRET_KEY),
    readSetting(ROM_DIRECT_ENABLED_KEY),
  ])
  const trimmedUrl = String(url || '').trim().replace(/\/+$/, '')
  const trimmedSecret = String(secret || '').trim()
  return {
    url: trimmedUrl,
    secret: trimmedSecret,
    enabled: String(enabled || '') === '1',
    configured: !!trimmedUrl && !!trimmedSecret,
  }
}

/**
 * 生成一个短期直连下载地址；未开启直连或没配置时返回 null（调用方继续走代理）。
 */
export async function buildRemoteDownloadUrl(remoteFileId, { ttlSec = DIRECT_URL_TTL_SEC } = {}) {
  if (!remoteFileId) return null
  const config = await remoteDownloadConfig()
  if (!config.enabled || !config.configured) return null
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const sig = signRemoteDownloadUrl({ secret: config.secret, fileId: remoteFileId, exp })
  // purpose 不进 URL：远端用固定用途字符串校验，避免客户端参与决定签名内容。
  return `${config.url}/signed/${encodeURIComponent(remoteFileId)}?exp=${exp}&sig=${sig}`
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`
}

function describeFetchError(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return '远端服务器响应超时'
  const code = String(err?.cause?.code || '')
  const address = err?.cause?.address ? `${err.cause.address}${err.cause.port ? `:${err.cause.port}` : ''}` : ''
  if (code === 'ECONNREFUSED') return `无法连接远端服务器（${address || '目标地址'} 拒绝连接）`
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '远端服务器域名无法解析'
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return '远端服务器网络不可达'
  if (code === 'ETIMEDOUT') return '连接远端服务器超时'
  return err?.cause?.message || err?.message || '无法连接远端服务器'
}

function endpoint(config) {
  return config.url || ''
}

// 只做连通性/鉴权检查，失败时抛出带人话错误信息的异常
export async function remoteHealth(override = null, { timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const config = override || (await remoteStorageConfig())
  if (!config.url) throw new Error('尚未配置远端地址')
  if (!config.token) throw new Error('尚未配置远端密钥')

  const startedAt = Date.now()
  let res
  try {
    res = await fetch(joinUrl(config.url, '/health'), {
      headers: { 'X-Token': config.token, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new Error(describeFetchError(err), { cause: err })
  }
  const latencyMs = Date.now() - startedAt
  const body = await res.json().catch(() => null)
  if (res.status === 401 || res.status === 403) throw new Error('远端密钥不正确（远端返回 401）')
  if (!res.ok || !body?.ok) throw new Error(`远端返回异常状态 ${res.status}`)
  return { ...body, latencyMs, url: endpoint(config) }
}

let directProbeCache = { at: 0, ok: false, inflight: null }

/**
 * 浏览器直连前的一次快速体检：远端还活着才发 302。
 * 结果缓存 DIRECT_PROBE_TTL_MS，探测失败只影响"要不要直连"，不影响本机兜底链路。
 */
export async function remoteDirectReachable() {
  const now = Date.now()
  if (now - directProbeCache.at < DIRECT_PROBE_TTL_MS) return directProbeCache.ok
  if (directProbeCache.inflight) return directProbeCache.inflight
  const inflight = (async () => {
    let ok = false
    try {
      await remoteHealth(null, { timeoutMs: DIRECT_PROBE_TIMEOUT_MS })
      ok = true
    } catch {}
    directProbeCache = { at: Date.now(), ok, inflight: null }
    return ok
  })()
  directProbeCache = { ...directProbeCache, inflight }
  return inflight
}

// 测试用：清掉探测缓存，让下一次调用重新探。
export function resetRemoteDirectProbe() {
  directProbeCache = { at: 0, ok: false, inflight: null }
}

async function parseUploadResponse(res) {
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.id) {
    throw new Error(body?.error ? `远端服务器拒绝：${body.error}` : `远端服务器返回 ${res.status}`)
  }
  return body
}

export async function remoteUpload({ buffer, fileName, sha256 }) {
  const config = await remoteStorageConfig()
  if (!config.configured) throw new Error('尚未配置远端存储')
  let res
  try {
    res = await fetch(joinUrl(config.url, '/upload'), {
      method: 'POST',
      headers: {
        'X-Token': config.token,
        'X-Filename': encodeURIComponent(fileName || 'rom.bin'),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buffer.length),
        ...(sha256 ? { 'X-Sha256': sha256 } : {}),
      },
      body: buffer,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`上传到远端服务器失败：${describeFetchError(err)}`, { cause: err })
  }
  return parseUploadResponse(res)
}

/**
 * 流式上传：请求体是一段可读流，整个文件不进内存。
 * 一键迁移用它搬大 ROM —— 几百 MB 到几 GB 的文件按 buffer 读会把内存打满。
 * `signal` 用于任务取消；传了就直接中断这次上传。
 */
export async function remoteUploadStream({ stream, fileName, sha256, size, signal = null }) {
  const config = await remoteStorageConfig()
  if (!config.configured) throw new Error('尚未配置远端存储')
  const timeoutSignal = AbortSignal.timeout(streamUploadTimeoutMs(size))
  const combined = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
  let res
  try {
    res = await fetch(joinUrl(config.url, '/upload'), {
      method: 'POST',
      headers: {
        'X-Token': config.token,
        'X-Filename': encodeURIComponent(fileName || 'rom.bin'),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(size),
        ...(sha256 ? { 'X-Sha256': sha256 } : {}),
      },
      body: stream,
      // undici 对"流式请求体"要求显式声明半双工。
      duplex: 'half',
      signal: combined,
    })
  } catch (err) {
    // 任务被取消时把原始 AbortError 抛上去，让调用方区分"取消"和"上传失败"。
    if (signal?.aborted) throw err
    throw new Error(`上传到远端服务器失败：${describeFetchError(err)}`, { cause: err })
  }
  return parseUploadResponse(res)
}

export async function remoteDelete(remoteFileId) {
  const config = await remoteStorageConfig()
  if (!config.configured || !remoteFileId) return false
  try {
    const res = await fetch(joinUrl(config.url, `/files/${encodeURIComponent(remoteFileId)}`), {
      method: 'DELETE',
      headers: { 'X-Token': config.token },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

// 打开远端文件流，透传客户端的 Range 请求头
export async function remoteOpenFile(remoteFileId, rangeHeader = null) {
  const config = await remoteStorageConfig()
  if (!config.configured) throw new Error('尚未配置远端存储')
  const headers = { 'X-Token': config.token }
  if (rangeHeader) headers.Range = rangeHeader
  let res
  try {
    res = await fetch(joinUrl(config.url, `/files/${encodeURIComponent(remoteFileId)}`), {
      headers,
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`读取远端文件失败：${describeFetchError(err)}`, { cause: err })
  }
  return res
}
