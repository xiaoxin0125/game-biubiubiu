import { resolve, relative, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

export function normalizeRoot(root) {
  return resolve(root)
}

export function assertInsideRoot(root, candidate) {
  const normalizedRoot = normalizeRoot(root)
  const full = resolve(candidate)
  const rel = relative(normalizedRoot, full)
  if (rel === '' || (!rel.startsWith('..') && rel !== '..' && !isAbsolute(rel))) {
    return full
  }
  throw new Error('path-outside-root')
}

export function isPathInsideRoot(root, candidate) {
  try {
    assertInsideRoot(root, candidate)
    return true
  } catch {
    return false
  }
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// ── 上传目录与本地副本路径 ────────────────────────────────────────────────
// ROM / 封面文件的位置解析在几处都要用（上传、播放、迁移、删除），
// 所以放在这里共享，避免每个文件各写一份、慢慢走偏。
export const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR || 'data/uploads')
export const LEGACY_UPLOAD_ROOTS = [
  process.env.LEGACY_UPLOADS_DIR,
  '/www/wwwroot/Xgame/data/uploads',
].filter(Boolean).map((root) => resolve(root))

/*
 * 远端存储记录的 filePath 约定：
 *   - 指向本地文件 → 正常状态：远端 ROM 在本站留的副本，浏览器直连远端失败时
 *     由它兜底；
 *   - 以 `remote:<id>` 开头 → 历史遗留（早期迁移脚本只记了占位值），本站没有
 *     本地副本，只能靠直连远端播放。
 */
export const REMOTE_FILE_PATH_PREFIX = 'remote:'

export function isRemoteOnlyFilePath(filePath) {
  return String(filePath || '').startsWith(REMOTE_FILE_PATH_PREFIX)
}

/** 本地兜底路径：filePath 是 `remote:` 占位值时返回空字符串（表示没有本地副本）。 */
export function localFallbackFilePath(filePath) {
  const raw = String(filePath || '')
  return raw && !isRemoteOnlyFilePath(raw) ? raw : ''
}

/**
 * 把一个 filePath 解析成真实可读的磁盘路径（先本目录、再历史遗留目录）。
 * 文件不存在或本来就是 `remote:` 占位值时抛 upload-file-not-found。
 */
export function resolveReadableUploadPath(filePath) {
  const raw = String(filePath || '')
  if (!raw || isRemoteOnlyFilePath(raw)) throw new Error('upload-file-not-found')
  for (const root of [UPLOADS_DIR, ...LEGACY_UPLOAD_ROOTS]) {
    try {
      const checked = assertInsideRoot(root, raw)
      if (existsSync(checked)) return checked
    } catch {}
  }
  throw new Error('upload-file-not-found')
}

/**
 * 从 ROM 记录里挑出"可以迁到远端"的候选：本站磁盘上、而且确实还有本地文件的
 * 那些（`remote:` 占位值的记录没有本地文件可搬）。大的先搬 —— 腾格子的收益
 * 最大，失败也会更早暴露。纯函数，调用方负责先按 status 过滤。
 */
export function pickRemoteMigrationCandidates(rows) {
  return (rows || [])
    .filter((row) => row && (row.storage || 'local') === 'local')
    .filter((row) => !isRemoteOnlyFilePath(row.filePath))
    .sort((a, b) => (Number(b.fileSize) || 0) - (Number(a.fileSize) || 0))
}
