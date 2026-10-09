/*
 * 远端 ROM 存储客户端。
 *
 * 大体积 ROM 可以转存到独立的 rom-upload 服务（代码见 /www/wwwroot/rom-upload）。
 * 浏览器始终只和本服务通信：上传由这里带密钥转发，播放时这里再代理回来，
 * 所以共享密钥不会下发到前端。
 *
 * 配置在后台「站点设置 → 远端存储」里（settings 表：remoteUploadUrl / remoteUploadToken）。
 */

import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { settings } from './db/schema.js'

export const REMOTE_URL_KEY = 'remoteUploadUrl'
export const REMOTE_TOKEN_KEY = 'remoteUploadToken'

// 超过这个体积的 ROM 才在界面上提供「上传到远端服务器」的选项。
export const REMOTE_UPLOAD_THRESHOLD_BYTES = 3 * 1024 * 1024

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 60 * 1000
const HEALTH_TIMEOUT_MS = 8 * 1000

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
export async function remoteHealth(override = null) {
  const config = override || (await remoteStorageConfig())
  if (!config.url) throw new Error('尚未配置远端地址')
  if (!config.token) throw new Error('尚未配置远端密钥')

  const startedAt = Date.now()
  let res
  try {
    res = await fetch(joinUrl(config.url, '/health'), {
      headers: { 'X-Token': config.token, Accept: 'application/json' },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(describeFetchError(err))
  }
  const latencyMs = Date.now() - startedAt
  const body = await res.json().catch(() => null)
  if (res.status === 401 || res.status === 403) throw new Error('远端密钥不正确（远端返回 401）')
  if (!res.ok || !body?.ok) throw new Error(`远端返回异常状态 ${res.status}`)
  return { ...body, latencyMs, url: endpoint(config) }
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
    throw new Error(`上传到远端服务器失败：${describeFetchError(err)}`)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.id) {
    throw new Error(body?.error ? `远端服务器拒绝：${body.error}` : `远端服务器返回 ${res.status}`)
  }
  return body
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
    throw new Error(`读取远端文件失败：${describeFetchError(err)}`)
  }
  return res
}
