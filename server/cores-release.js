/*
 * 核心资源的“发布版本”读取与校验。
 *
 * 核心文件由 deploy/build-cores.mjs 打包成 <distDir>/<release>/ 下的版本目录，
 * 版本号由内容决定，所以 <release> 本身就是内容标识：同一个版本号下的文件内容
 * 一定相同，可以安全地长期缓存。
 *
 * 主站与远端资源服务器都按 <版本>/<文件名> 提供文件：
 *   远端：https://<资源服务器>/<前缀>/<release>/fbneo.wasm
 *   主站：/api/cores/<release>/fbneo.wasm            （远端不可用时的回退）
 *
 * 主站不重复存一份 98 MB：<distDir>/<release>/ 不存在时，回退到 data/cores 里的
 * 同名文件，并按清单校验体积（体积不符说明本地文件与清单不是同一批，宁可不发）。
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const CORES_DIR = resolve(process.env.CORES_DIR || 'data/cores')
export const CORES_DIST_DIR = resolve(process.env.CORES_DIST_DIR || 'data/cores-dist')

// /api/cores/fbneo.wasm、/api/cores/fbneo_libretro.wasm 都要能用：后者是历史
// 别名，核心文件在磁盘上始终不带 _libretro 后缀。
export const CORE_FILE_RE = /^([a-z0-9_]+?)(?:_libretro)?\.(js|wasm)$/
export const RELEASE_ID_RE = /^[a-f0-9]{8,32}$/

// 后台设置里表示“强制使用主站本地核心”的哨兵值：环境变量兜底也不会把它盖掉。
export const CORES_BASE_DISABLED = 'none'
// 后台「站点设置 → 核心资源」里保存远端基地址的键名（settings 表）。
export const CORES_BASE_URL_KEY = 'coresBaseUrl'
// 启用远端核心托管的开关（settings 表）：'1' 启用、'0' 关闭、'' 未设置。
// 与地址分开保存：地址随时可以填和改，开关只决定这份地址要不要投入使用，
// 于是"先填地址、测通了再打开"不需要重填一遍。空值表示老数据（当时只有地址）。
export const CORES_REMOTE_ENABLED_KEY = 'coresRemoteEnabled'

export function readCurrentRelease(distDir = CORES_DIST_DIR) {
  const file = join(distDir, 'current.json')
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const release = String(parsed?.release || '').toLowerCase()
    if (!RELEASE_ID_RE.test(release)) return null
    return { release, generatedAt: parsed.generatedAt || null }
  } catch {
    return null
  }
}

export function readReleaseManifest(release, distDir = CORES_DIST_DIR) {
  if (!RELEASE_ID_RE.test(String(release || ''))) return null
  const file = join(distDir, String(release), 'manifest.json')
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed.files !== 'object' || parsed.files === null) return null
    const files = {}
    for (const [name, entry] of Object.entries(parsed.files)) {
      if (!CORE_FILE_RE.test(name)) continue
      const size = Number(entry?.size)
      if (!Number.isFinite(size) || size < 0) continue
      files[name] = {
        size,
        sha256: typeof entry?.sha256 === 'string' ? entry.sha256 : '',
        gzipSize: Number.isFinite(Number(entry?.gzipSize)) ? Number(entry.gzipSize) : null,
      }
    }
    return { release: String(parsed.release || release).toLowerCase(), generatedAt: parsed.generatedAt || null, files }
  } catch {
    return null
  }
}

/**
 * 服务端对外发布的清单。没有构建过发布目录时返回空清单：前端会退回历史
 * 的无版本地址，因此本地开发不需要先跑构建脚本。
 */
export function loadCoreRelease(distDir = CORES_DIST_DIR) {
  const current = readCurrentRelease(distDir)
  if (!current) return { release: null, generatedAt: null, files: {} }
  const manifest = readReleaseManifest(current.release, distDir)
  if (!manifest) return { release: null, generatedAt: null, files: {} }
  return manifest
}

/**
 * 定位一个版本化核心文件的磁盘位置。
 * 返回 null 表示"这个版本下没有这个文件"，调用方应交给更长的回退链处理。
 */
export function resolveCoreArtifact({
  release,
  name,
  distDir = CORES_DIST_DIR,
  coresDir = CORES_DIR,
  currentRelease = null,
}) {
  if (!RELEASE_ID_RE.test(String(release || ''))) return null
  if (!CORE_FILE_RE.test(String(name || ''))) return null

  const built = join(distDir, String(release), String(name))
  if (built.startsWith(distDir) && existsSync(built)) {
    return { path: built, size: statSync(built).size, built: true }
  }

  // 还没构建发布目录时，用 data/cores 里的同名文件顶上，但必须与清单体积一致。
  const activeRelease = currentRelease || readCurrentRelease(distDir)?.release || null
  if (activeRelease !== release) return null
  const manifest = readReleaseManifest(release, distDir)
  const expected = manifest?.files?.[name]
  if (!expected) return null

  const local = join(coresDir, String(name))
  if (!local.startsWith(coresDir) || !existsSync(local)) return null
  const size = statSync(local).size
  if (size !== expected.size) return null
  return { path: local, size, built: false }
}

/**
 * 规范化后台填写的核心资源基地址。
 * 空字符串或 none/off/local 表示使用主站本机核心（none 会压过环境变量兜底）。
 */
export function normalizeCoresBaseUrl(value, { allowInsecure = false } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (['none', 'off', 'local', 'false', '0'].includes(raw.toLowerCase())) return CORES_BASE_DISABLED

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('核心资源地址必须是 https://主机/前缀 形式，或填 none 强制使用本机')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('核心资源地址只支持 http / https')
  }
  if (parsed.protocol === 'http:' && !allowInsecure) {
    throw new Error('核心资源地址必须使用 https：https 页面无法跨域加载 http 资源')
  }
  if (!parsed.hostname) throw new Error('核心资源地址缺少主机名')
  if (parsed.search || parsed.hash) throw new Error('核心资源地址不能带查询参数或锚点')
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
}

/**
 * 真正下发给前端的值：哨兵值必须变成空字符串。
 * 前端拿到的空字符串 = 用主站 /api/cores；把 'none' 直接发下去会让它拼出
 * `${'none'}/<版本>/<文件>` 这种地址。
 */
export function publicCoresBaseUrl(normalized) {
  return !normalized || normalized === CORES_BASE_DISABLED ? '' : normalized
}

/**
 * 规范化后台的启用开关。接受 '1'/'0'、布尔值以及 true/false/on/off 之类写法，
 * 空值表示"没设置过"，交给调用方按老数据推断。
 */
export function normalizeCoresRemoteEnabled(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === '') return ''
  if (['1', 'true', 'on', 'yes', 'enable', 'enabled'].includes(raw)) return '1'
  if (['0', 'false', 'off', 'no', 'disable', 'disabled'].includes(raw)) return '0'
  throw new Error('核心资源开关只能是 1 或 0')
}

/**
 * 计算真正下发给浏览器的核心基地址（'' = 使用主站 /api/cores）。
 *
 * 优先级：后台开关 > 老数据里的 none 哨兵 > 环境变量兜底。
 *   - 开关 '0'：强制本机，并且忽略环境变量（否则关掉远端会被 .env 里的旧值重新打开）；
 *   - 开关 '1'：用保存的地址；
 *   - 开关未设置（老数据）：有地址就当作开启，'none' 当作关闭，什么都没有才看环境变量。
 */
export function effectiveCoresBaseUrl({
  savedBaseUrl = '',
  savedEnabled = '',
  fromEnv = '',
  allowInsecure = false,
} = {}) {
  const saved = String(savedBaseUrl ?? '').trim()
  const normalizedSaved = normalizeCoresBaseUrl(saved, { allowInsecure })
  const flag = String(savedEnabled ?? '').trim()

  let enabled
  if (flag === '1') enabled = true
  else if (flag === '0') enabled = false
  else if (normalizedSaved === '') enabled = null // 没保存过地址：交给环境变量兜底
  else enabled = normalizedSaved !== CORES_BASE_DISABLED

  if (enabled === false) return ''
  if (enabled === true && normalizedSaved !== '' && normalizedSaved !== CORES_BASE_DISABLED) {
    return normalizedSaved
  }

  const env = String(fromEnv ?? '').trim()
  if (!env) return ''
  return publicCoresBaseUrl(normalizeCoresBaseUrl(env, { allowInsecure }))
}
