/*
 * 口令哈希与校验。
 *
 * 两种格式并存：
 *   scrypt$N$r$p$<salt base64>$<hash base64>   ← 新写入的
 *   $2a$ / $2b$ ...                            ← 历史的 bcryptjs 哈希，仍可校验
 *
 * 为什么换掉 bcryptjs：它是纯 JS 实现，每次哈希/校验都占着主线程约百毫秒，
 * 登录接口被刷时会拖慢整个事件循环（2026-10 审计 M-3）。scrypt 是 Node 自带的，
 * 计算发生在 libuv 线程池（不阻塞事件循环），而且是内存困难（memory-hard）的，
 * 离线爆破的性价比更低。
 *
 * 历史哈希不强制失效：调用方校验成功后按 needsRehash() 的结论把它改写为新格式
 * （登录时静默升级），所以老用户不需要重新设置密码。
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import bcrypt from 'bcryptjs'

const scryptAsync = promisify(scrypt)

// N=2^15、r=8、p=1：单次约 32MB 内存、几十毫秒。
// maxmem 必须显式放大：scrypt 需要 128*N*r ≈ 33.5MB，而 Node 默认上限是 32MB，
// 不放开会直接抛 ERR_CRYPTO_INVALID_SCRYPT_PARAMS。
const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const SCRYPT_MAXMEM = 96 * 1024 * 1024
const SCRYPT_PREFIX = 'scrypt'

// 用户口令的最短长度。只影响新注册与改密：老密码照常登录（登录不校验长度）。
export const MIN_PASSWORD_LENGTH = 8

export function isLegacyHash(stored) {
  return /^\$2[aby]\$/.test(String(stored || ''))
}

export function parseScryptHash(stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return null
  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts
  const N = Number(rawN)
  const r = Number(rawR)
  const p = Number(rawP)
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0) return null
  if (!Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) return null
  let salt
  let hash
  try {
    salt = Buffer.from(rawSalt, 'base64')
    hash = Buffer.from(rawHash, 'base64')
  } catch {
    return null
  }
  if (!salt.length || !hash.length) return null
  return { N, r, p, salt, hash }
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scryptAsync(String(password), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
  return [
    SCRYPT_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/** 校验口令；历史 bcrypt 哈希与当前 scrypt 哈希都能过。 */
export async function verifyPassword(password, stored) {
  const text = String(stored || '')
  if (!text) return false
  const candidate = String(password ?? '')

  if (isLegacyHash(text)) {
    try {
      return await bcrypt.compare(candidate, text)
    } catch {
      return false
    }
  }

  const parsed = parseScryptHash(text)
  if (!parsed) return false
  try {
    const derived = await scryptAsync(candidate, parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: Math.max(SCRYPT_MAXMEM, 128 * parsed.N * parsed.r * 2),
    })
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash)
  } catch {
    return false
  }
}

/**
 * 校验成功后是否值得改写存储（历史 bcrypt 哈希、或参数与当前强度不一致）。
 * 返回密码主流程不关心细节，只决定"要不要顺手重算一次"。
 */
export function needsRehash(stored) {
  const text = String(stored || '')
  if (isLegacyHash(text)) return true
  const parsed = parseScryptHash(text)
  if (!parsed) return true
  return parsed.N !== SCRYPT_N || parsed.r !== SCRYPT_R || parsed.p !== SCRYPT_P
}
