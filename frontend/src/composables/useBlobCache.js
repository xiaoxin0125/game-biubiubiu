// Persistent Blob cache backed by IndexedDB — same minimal pattern as
// EmulatorJS: one object store, key → Blob. On fetch, check IDB first; if
// not present, download from network and store. Failures (quota / evicted)
// are swallowed — the caller still has the fresh Blob in memory so playback
// is unaffected, only the next-boot cache is skipped.
//
// Downloads stream through readResponseBlob() so callers can show real progress
// (核心 34 MB 的下载没有进度条是不可接受的)。注意浏览器给的响应流通常已经解压，
// 而 Content-Length 可能是压缩后的长度，所以进度以调用方提供的 expectedSize
// （发布清单 / 数据库里的原始体积）为准，只有明确没有 content-encoding 时
// 才把 Content-Length 当作可信总长。

const DB_NAME = 'games-online'
const STORE = 'blobs'

// 大文件分块回调的最小间隔：34 MB 的文件按 256 KB 汇报约 140 次，界面不会被打爆。
const PROGRESS_STEP_BYTES = 256 * 1024

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function idbOp(mode, fn) {
  return openDb().then((db) => new Promise((resolve) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const r = fn(store)
    tx.oncomplete = () => resolve(r?.result ?? null)
    tx.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  }))
}

function getCached(key) {
  return idbOp('readonly', (s) => s.get(key))
}

function putCached(key, blob) {
  return idbOp('readwrite', (s) => s.put(blob, key))
}

export async function clearCache() {
  await idbOp('readwrite', (s) => s.clear())
}

export async function stats() {
  const db = await openDb()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const cursor = tx.objectStore(STORE).openCursor()
    let count = 0
    let bytes = 0
    cursor.onsuccess = () => {
      const c = cursor.result
      if (c) { count++; bytes += c.value?.size || 0; c.continue() }
      else resolve({ count, bytes })
    }
    cursor.onerror = () => resolve({ count, bytes })
  })
}

export async function getCachedBlob(key) {
  if (!key) return null
  try { return await getCached(key) } catch { return null }
}

export async function putCachedBlob(key, blob) {
  if (!key || !blob) return false
  try { return (await putCached(key, blob)) !== null } catch { return false }
}

/**
 * 资源本身的体积：只有响应没有被压缩时，Content-Length 才等于文件体积。
 * 压缩响应的长度会偏小，用它做分母会让进度条永远走不满。
 */
export function declaredSizeOf(res) {
  const encoding = String(res.headers.get('content-encoding') || '').toLowerCase()
  if (encoding && encoding !== 'identity') return null
  const raw = res.headers.get('content-length')
  if (!raw) return null
  const size = Number(raw)
  return Number.isFinite(size) && size > 0 ? size : null
}

/**
 * 把响应体读成 Blob，并沿途汇报进度。
 * @returns {Promise<{blob: Blob, bytes: number, declaredSize: number|null}>}
 */
export async function readResponseBlob(res, { expectedSize = null, onProgress = null } = {}) {
  const declared = declaredSizeOf(res)
  const expected = Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : null
  const total = expected || declared
  const contentType = res.headers.get('content-type') || ''

  // 浏览器不支持响应流（或流被禁用）时退回一次性 blob：仍然能播，只是没有细粒度进度。
  if (!res.body || typeof res.body.getReader !== 'function') {
    const blob = await res.blob()
    onProgress?.({ loaded: blob.size, total: total || blob.size, done: true })
    return { blob, bytes: blob.size, declaredSize: declared }
  }

  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  let reported = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      loaded += value.byteLength
      if (loaded - reported >= PROGRESS_STEP_BYTES) {
        reported = loaded
        onProgress?.({ loaded, total, done: false })
      }
    }
  } catch (err) {
    try { await reader.cancel() } catch {}
    throw err
  } finally {
    try { reader.releaseLock() } catch {}
  }

  const blob = new Blob(chunks, contentType ? { type: contentType } : undefined)
  onProgress?.({ loaded: blob.size, total: total || blob.size, done: true })
  return { blob, bytes: blob.size, declaredSize: declared }
}

/**
 * 下载一个 URL 为 Blob（带进度）。不写缓存，缓存策略交给调用方。
 * `preferCached` 只是给 HTTP 缓存的提示，用于 ROM 这种希望尽量复用已下载副本的场景。
 */
export async function fetchBlob(url, { signal = null, expectedSize = null, onProgress = null, cache = 'default' } = {}) {
  const init = { signal }
  if (cache) init.cache = cache
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  return readResponseBlob(res, { expectedSize, onProgress })
}

/** SHA-256（十六进制小写）。非安全上下文拿不到 WebCrypto 时返回 null。 */
export async function blobDigestHex(blob) {
  if (!globalThis.crypto?.subtle?.digest) return null
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  let out = ''
  for (const byte of new Uint8Array(digest)) out += byte.toString(16).padStart(2, '0')
  return out
}

/**
 * Fetch a URL as a Blob, using IndexedDB as the persistent cache.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.key]        缓存键，默认用 url。核心资源用"版本+文件名"，
 *                                      这样换服务器地址不会重复存一份。
 * @param {number} [options.expectedSize] 期望体积，用于进度分母与体积校验
 * @param {AbortSignal} [options.signal]
 * @param {(p: {loaded:number,total:number|null,done:boolean,cached?:boolean}) => void} [options.onProgress]
 * @param {boolean} [options.useCache]  是否读写 IndexedDB，默认 true
 * @param {'default'|'no-store'|'reload'} [options.cache] fetch 的 cache 模式
 */
export async function cachedFetch(url, options = {}) {
  const {
    key = url,
    expectedSize = null,
    signal = null,
    onProgress = null,
    useCache = true,
    cache = 'default',
  } = options

  if (useCache) {
    const hit = await getCachedBlob(key)
    if (hit) {
      onProgress?.({ loaded: hit.size, total: expectedSize || hit.size, done: true, cached: true })
      return hit
    }
  }

  const { blob } = await fetchBlob(url, { signal, expectedSize, onProgress, cache })

  if (useCache) {
    // 体积明显不符说明拿到的不是同一份资源：不写缓存，避免把坏文件留成"永久副本"。
    const expected = Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : null
    const sizeOk = !expected || !blob.size || blob.size === expected
    if (sizeOk) await putCachedBlob(key, blob)
  }

  return blob
}
