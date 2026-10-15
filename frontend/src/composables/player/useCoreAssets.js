/*
 * 核心资源（libretro 的 js / wasm）的取用。
 *
 * 顺序：读发布清单 → 按 <版本>/<文件名> 组 URL（远端优先、主站兜底）→
 * IndexedDB 命中即用 → 否则下载 → 校验体积与 sha256 → 写入缓存。
 *
 * 三点关键设计：
 * 1. 版本号 = 内容标识。缓存键和 URL 都带版本号，所以换服务器地址不会重复存
 *    一份，也不会出现"新的 js + 旧的 wasm"这种混用。
 * 2. 同一发布版本内回退。远端失败时只回退到本机同版本地址，不退回历史无版本
 *    地址：宁可用不了，也不能悄悄换一份内容不同的核心。
 * 3. 清单缺失（本地开发还没跑构建脚本）时退回历史地址，功能照常，只是拿不到
 *    体积/摘要，进度退化为不确定状态。
 */

import { blobDigestHex, fetchBlob, getCachedBlob, putCachedBlob } from '../useBlobCache.js'
import { coreDisplayName } from '../../constants/cores.js'
import { registerJ2meCoreTasks } from './j2meCore.js'

const MANIFEST_URL = '/api/cores/manifest'
// 清单很小且同源，缓存 30 秒即可：发布新版本后刷新一次页面就能拿到。
const MANIFEST_TTL_MS = 30 * 1000

let manifestCache = { at: 0, promise: null, value: null }

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR'
}

/** 后台「核心资源」里配好的远端基地址（运行时配置注入，不需要重新构建）。 */
export function coresBaseUrlFromConfig() {
  const raw = globalThis.window?.__APP_CONFIG__?.CORES_BASE_URL
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
}

export function localCoresBaseUrl() {
  return '/api/cores'
}

export function resetCoreManifestCache() {
  manifestCache = { at: 0, promise: null, value: null }
}

/** 读取当前发布清单；失败时返回空清单（调用方会退回历史地址）。 */
export async function loadCoreManifest({ force = false } = {}) {
  const fresh = manifestCache.value && Date.now() - manifestCache.at < MANIFEST_TTL_MS
  if (!force && fresh) return manifestCache.value
  if (!force && manifestCache.promise) return manifestCache.promise

  manifestCache.promise = (async () => {
    try {
      const res = await fetch(MANIFEST_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const value = {
        release: typeof data?.release === 'string' ? data.release : '',
        files: data?.files && typeof data.files === 'object' ? data.files : {},
      }
      manifestCache.value = value
      manifestCache.at = Date.now()
      return value
    } catch (error) {
      console.warn('[cores] 发布清单不可用，改用兼容地址', error)
      // 空清单也要缓存，避免每次开局都打一次失败的请求。
      manifestCache.value = { release: '', files: {} }
      manifestCache.at = Date.now()
      return manifestCache.value
    } finally {
      manifestCache.promise = null
    }
  })()

  return manifestCache.promise
}

/** 清单里某个文件的体积 / 摘要 / 压缩后体积。 */
export function coreFileMeta(manifest, name) {
  const entry = manifest?.files?.[name]
  if (!entry) return null
  const size = Number(entry.size)
  return {
    size: Number.isFinite(size) && size > 0 ? size : null,
    sha256: typeof entry.sha256 === 'string' ? entry.sha256 : '',
    gzipSize: Number.isFinite(Number(entry.gzipSize)) ? Number(entry.gzipSize) : null,
  }
}

export function coreTaskId(core, ext) {
  return `core:${core}:${ext}`
}

export function coreTaskLabel(core, ext) {
  return `${coreDisplayName[core] || core} 核心（${ext}）`
}

/** 同一发布版本内的候选地址：远端优先，主站同版本地址兜底。 */
export function coreAssetUrls({ manifest, name }) {
  const urls = []
  if (manifest?.release) {
    const base = coresBaseUrlFromConfig()
    if (base) urls.push(`${base}/${manifest.release}/${name}`)
    urls.push(`${localCoresBaseUrl()}/${manifest.release}/${name}`)
  } else {
    // 没有发布清单（本地开发）时用历史地址，功能不受影响。
    urls.push(`${localCoresBaseUrl()}/${name}`)
  }
  return urls
}

/** 缓存键 = 发布版本 + 文件名；版本由内容决定，所以键本身就是内容标识。 */
export function coreAssetCacheKey({ manifest, name }) {
  return manifest?.release ? `core:${manifest.release}:${name}` : `core:unversioned:${name}`
}

/**
 * 提前把核心任务登记进进度面板：界面在开始下载之前就知道总共要下多少、
 * 有几个文件，总体进度才有意义。
 *
 * 选定核心在元数据到达前可能先是平台默认值、之后才变成 ROM 指定的核心，
 * 所以这里会把"上一个核心还没开始下载的占位任务"清掉，免得面板上挂着一个
 * 永远不会加载的核心。J2ME 没有 libretro 核心，它的任务来自运行时清单
 * （j2meCore.js）。
 */
export async function registerCoreTasksFor(progress, core) {
  if (!progress || !core) return null
  if (core === 'j2mejs' || core === 'js2me' || core === 'squirreljme') {
    // The Java runtime is served with the frontend, not as a libretro JS/WASM
    // pair. It still gets “core” tasks — its scripts and class library are a
    // few megabytes — but they come from the runtime's own manifest, and the
    // placeholder pair from a platform default is removed instead of left
    // unfinished (see j2meCore.js).
    return registerJ2meCoreTasks(progress)
  }
  const manifest = await loadCoreManifest()
  const wanted = new Set(['js', 'wasm'].map((ext) => coreTaskId(core, ext)))
  for (const task of progress.tasks || []) {
    if (task?.kind === 'core' && !wanted.has(task.id)) progress.dropTask?.(task.id)
  }
  for (const ext of ['js', 'wasm']) {
    const name = `${core}.${ext}`
    progress.ensureTask({
      id: coreTaskId(core, ext),
      label: coreTaskLabel(core, ext),
      kind: 'core',
      size: coreFileMeta(manifest, name)?.size ?? null,
    })
  }
  return manifest
}

/**
 * 取一份核心文件（Blob）。
 * 生产环境会顺带校验 sha256：内容不符就换下一个地址，绝不把坏文件写进缓存。
 */
export async function loadCoreAsset({ core, ext, progress = null }) {
  const name = `${core}.${ext}`
  const taskId = coreTaskId(core, ext)
  const manifest = await loadCoreManifest()
  const meta = coreFileMeta(manifest, name)
  const session = progress?.sessionId
  const signal = progress?.currentSignal?.() ?? null

  progress?.ensureTask({
    id: taskId,
    label: coreTaskLabel(core, ext),
    kind: 'core',
    size: meta?.size ?? null,
  })

  const key = coreAssetCacheKey({ manifest, name })
  const cached = await getCachedBlob(key)
  if (cached && (!meta?.size || cached.size === meta.size)) {
    progress?.taskProgress(taskId, cached.size, { session, cached: true })
    return cached
  }

  const urls = coreAssetUrls({ manifest, name })
  let lastError = null

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]
    const isLast = index === urls.length - 1
    try {
      const { blob } = await fetchBlob(url, {
        signal,
        expectedSize: meta?.size ?? null,
        onProgress: ({ loaded, done }) => {
          progress?.taskProgress(taskId, loaded, { session })
          if (!done) progress?.setStage('resources')
        },
      })

      if (meta?.size && blob.size && blob.size !== meta.size) {
        throw new Error(`${name} 体积不符（期望 ${meta.size}，实际 ${blob.size}）`)
      }
      if (meta?.sha256) {
        progress?.setTaskStatus(taskId, 'verifying')
        progress?.setStage('verify')
        const digest = await blobDigestHex(blob)
        // 非安全上下文（http）拿不到 WebCrypto：只能靠体积校验，放行。
        if (digest && digest !== meta.sha256) throw new Error(`${name} 内容校验不通过`)
      }

      await putCachedBlob(key, blob)
      progress?.taskSettled(taskId, 'done', { size: meta?.size ?? null, loaded: blob.size })
      progress?.setStage('resources')
      return blob
    } catch (error) {
      if (isAbortError(error)) throw error
      lastError = error
      if (!isLast) {
        // 换下一个地址重试：进度不重复累计，因为下一次是从 0 开始重新读。
        progress?.taskProgress(taskId, 0, { session })
        progress?.setTaskStatus(taskId, 'loading', { note: '正在切换备用地址…', error: '' })
      }
    }
  }

  progress?.taskFailed(taskId, lastError?.message || '核心文件不可用')
  throw lastError || new Error(`${name} 下载失败`)
}
