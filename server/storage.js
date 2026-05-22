import { resolve, relative, isAbsolute } from 'node:path'

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