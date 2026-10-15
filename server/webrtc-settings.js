import { MAGIC_COOKIE, decodeXorAddress } from './stun-test.js'
import { createHash, createHmac } from 'node:crypto'

export const STUN_SETTING_KEY = 'webrtcStunUrls'
export const MAX_STUN_URLS_LENGTH = 2000

// TURN 中继同样支持在后台配置；环境变量只作为兜底（老部署不受影响）。
export const TURN_URLS_KEY = 'webrtcTurnUrls'
export const TURN_USERNAME_KEY = 'webrtcTurnUsername'
export const TURN_CREDENTIAL_KEY = 'webrtcTurnCredential'
// 共享密钥（coturn 的 auth secret）与临时凭据有效期。填了密钥就进入「临时凭据」
// 模式：静态用户名/密码不再下发，前端每次拿到的是一小时后过期的签名字符串，
// 于是密钥本身永远不出服务端，泄露的凭据也只能用来中继很短的一段时间。
export const TURN_SECRET_KEY = 'webrtcTurnSecret'
export const TURN_TTL_KEY = 'webrtcTurnTtl'

export const TURN_SECRET_MIN_LENGTH = 16
export const TURN_CREDENTIAL_TTL_DEFAULT_SEC = 3600
export const TURN_CREDENTIAL_TTL_MIN_SEC = 300
export const TURN_CREDENTIAL_TTL_MAX_SEC = 24 * 60 * 60
// 临时凭据里的用户名部分（时间戳冒号后面的那一段），只影响 coturn 日志显示。
export const TURN_CREDENTIAL_DEFAULT_NAME = 'games-online'
const TURN_CREDENTIAL_NAME_MAX_LENGTH = 32

const HOST_PATTERN = '(?:[a-zA-Z0-9.-]+|\\[[0-9a-fA-F:]+\\])'

// STUN is optional. Store a canonical comma-separated list; never inject defaults.
export function normalizeStunUrls(value) {
  if (typeof value !== 'string') throw new Error('STUN 地址必须是字符串')
  if (value.length > MAX_STUN_URLS_LENGTH) throw new Error('STUN 地址总长度不能超过 2000 个字符')

  const urls = value.split(/[,\r\n]+/).map((url) => url.trim()).filter(Boolean)
  for (const url of urls) {
    const match = /^(?:stun|stuns):(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?$/.exec(url)
    if (!match || (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535))) {
      throw new Error('STUN 地址格式不正确，请使用 stun:主机:端口 或 stuns:主机:端口')
    }
  }
  return [...new Set(urls)].join(',')
}

// 每个 TURN 地址可选带 ?transport=udp|tcp（coturn 常见写法）
const TURN_URL_PATTERN = new RegExp(`^(?:turn|turns):${HOST_PATTERN}(?::(\\d{1,5}))?(?:\\?transport=(?:udp|tcp))?$`)

export function normalizeTurnUrls(value) {
  if (typeof value !== 'string') throw new Error('TURN 地址必须是字符串')
  if (value.length > MAX_STUN_URLS_LENGTH) throw new Error('TURN 地址总长度不能超过 2000 个字符')

  const urls = value.split(/[,\r\n]+/).map((url) => url.trim()).filter(Boolean)
  for (const url of urls) {
    const match = TURN_URL_PATTERN.exec(url)
    if (!match || (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535))) {
      throw new Error('TURN 地址格式不正确，请使用 turn:主机:端口 或 turn:主机:端口?transport=udp')
    }
  }
  return [...new Set(urls)].join(',')
}

export function normalizeTurnUsername(value) {
  const username = String(value ?? '').trim()
  if (username.length > 128) throw new Error('TURN 用户名过长')
  return username
}

export function normalizeTurnCredential(value) {
  const credential = String(value ?? '').trim()
  if (credential.length > 256) throw new Error('TURN 密码过长')
  return credential
}

/**
 * coturn 共享密钥（use-auth-secret / TURN REST API）。
 * 空字符串表示"没配置"，调用方应退回静态用户名+密码模式。
 */
export function normalizeTurnSecret(value) {
  const secret = String(value ?? '').trim()
  if (!secret) return ''
  if (secret.length < TURN_SECRET_MIN_LENGTH) {
    throw new Error(`TURN 共享密钥至少需要 ${TURN_SECRET_MIN_LENGTH} 位`)
  }
  if (secret.length > 256) throw new Error('TURN 共享密钥过长')
  return secret
}

/** 临时凭据有效期（秒）；空值表示用默认 1 小时。 */
export function normalizeTurnTtl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return String(TURN_CREDENTIAL_TTL_DEFAULT_SEC)
  const ttl = Number(raw)
  if (!Number.isInteger(ttl) || ttl < TURN_CREDENTIAL_TTL_MIN_SEC || ttl > TURN_CREDENTIAL_TTL_MAX_SEC) {
    throw new Error(`临时凭据有效期需要在 ${TURN_CREDENTIAL_TTL_MIN_SEC} ~ ${TURN_CREDENTIAL_TTL_MAX_SEC} 秒之间`)
  }
  return String(ttl)
}

function turnCredentialName(raw) {
  const name = String(raw || '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, TURN_CREDENTIAL_NAME_MAX_LENGTH)
  return name || TURN_CREDENTIAL_DEFAULT_NAME
}

/**
 * 生成 coturn 临时凭据（RFC 草案 "TURN REST API" / coturn 的 use-auth-secret）：
 *
 *   username   = "<过期时间戳>:<用户名>"
 *   credential = base64(HMAC-SHA1(共享密钥, username))
 *
 * coturn 用同一把共享密钥重算一遍并与客户端提交的密码比对，同时校验冒号前的
 * 时间戳没有过期 —— 所以密钥本身不需要下发给浏览器，泄露的凭据也会自然失效。
 * 注意：哈希输入是完整的 username（含时间戳与冒号），用户名里的冒号会被清掉。
 */
export function buildTurnCredentials({
  secret,
  name = TURN_CREDENTIAL_DEFAULT_NAME,
  ttlSec = TURN_CREDENTIAL_TTL_DEFAULT_SEC,
  now = Date.now(),
} = {}) {
  const key = String(secret || '')
  if (!key) throw new Error('缺少 TURN 共享密钥')
  const ttl = Number(ttlSec)
  if (!Number.isInteger(ttl) || ttl <= 0) throw new Error('临时凭据有效期不合法')
  const expiresAtSec = Math.floor(now / 1000) + ttl
  const username = `${expiresAtSec}:${turnCredentialName(name)}`
  const credential = createHmac('sha1', key).update(username).digest('base64')
  return { username, credential, expiresAtSec, ttlSec: ttl }
}


// ── 带鉴权的 TURN Allocate（验证用户名/密码是否真的能分配中继端口） ──
function appendAttribute(parts, type, value) {
  const padded = Buffer.concat([value, Buffer.alloc((4 - (value.length % 4)) % 4)])
  const attr = Buffer.alloc(4 + padded.length)
  attr.writeUInt16BE(type, 0)
  attr.writeUInt16BE(value.length, 2)
  padded.copy(attr, 4)
  parts.push(attr)
  return attr
}

// 长凭据机制（RFC 5389）：
//   key = MD5(username:realm:password)
//   MESSAGE-INTEGRITY = HMAC-SHA1(头部 + 属性)
// 其中「头部长度字段」的取值是「属性字节数 + 24（MESSAGE-INTEGRITY 属性长度）」，
// 也就是加入该属性后整条消息的长度。写错这个字段 coturn 会一直回
// 「401 credentials are incorrect」，很容易误判成密码错。
export function buildAuthenticatedAllocate({ transactionId, username, realm, nonce, password }) {
  const txid = Buffer.from(transactionId)
  const parts = []

  const transport = Buffer.alloc(4)
  transport.writeUInt8(17, 0) // UDP
  appendAttribute(parts, 0x0019, transport)
  appendAttribute(parts, 0x0014, Buffer.from(realm, 'utf8'))
  appendAttribute(parts, 0x0015, Buffer.from(nonce, 'utf8'))
  appendAttribute(parts, 0x0006, Buffer.from(username, 'utf8'))

  const header = Buffer.alloc(20)
  header.writeUInt16BE(0x0003, 0) // Allocate
  header.writeUInt32BE(0x2112a442, 4)
  txid.copy(header, 8)

  const bodyLength = parts.reduce((sum, part) => sum + part.length, 0)
  const integrity = Buffer.alloc(4 + 20)
  integrity.writeUInt16BE(0x0008, 0)
  integrity.writeUInt16BE(20, 2)
  // 头部长度 = 属性字节数 + MESSAGE-INTEGRITY 属性长度（24），即整条消息的长度
  header.writeUInt16BE(bodyLength + integrity.length, 2)

  // 直接对 message（头部 + 属性）求 HMAC，即为 RFC 5389 的 MESSAGE-INTEGRITY
  const message = Buffer.concat([header, ...parts])
  const key = createHash('md5').update(`${username}:${realm}:${password}`).digest()
  const hmac = createHmac('sha1', key).update(message).digest()
  hmac.copy(integrity, 4)

  return Buffer.concat([header, ...parts, integrity])
}

// 校验一条 STUN 消息里的 MESSAGE-INTEGRITY。
// 签名时头部长度 = 整条消息长度（含 MESSAGE-INTEGRITY），所以校验时把长度改回
// 「到该属性末尾为止的长度」再算 HMAC。
export function verifyMessageIntegrity(message, { username, realm, password }) {
  const msg = Buffer.from(message)
  let offset = 20
  const end = Math.min(20 + msg.readUInt16BE(2), msg.length)
  while (offset + 4 <= end) {
    const attrType = msg.readUInt16BE(offset)
    const attrLength = msg.readUInt16BE(offset + 2)
    if (attrType === 0x0008) {
      if (offset + 4 + attrLength > msg.length) return false
      const signed = Buffer.from(msg.subarray(0, offset))
      // 签名区的长度字段 = 属性总字节数（不含 20 字节头部）+ MESSAGE-INTEGRITY 的 24 字节
      // = （头部之后的字节数）+ 24，因为签名区恰好是「头部 + 前面的属性」
      signed.writeUInt16BE((offset - 20) + 24, 2)
      const key = createHash('md5').update(`${username}:${realm}:${password}`).digest()
      const expected = createHmac('sha1', key).update(signed).digest()
      return expected.equals(msg.subarray(offset + 4, offset + 4 + attrLength))
    }
    offset += 4 + attrLength + ((4 - (attrLength % 4)) % 4)
  }
  return false
}

// 解析 Allocate 成功响应：返回分配到的中继地址与出口地址
export function parseAllocateSuccess(buffer, transactionId) {
  const buf = Buffer.from(buffer || [])
  if (buf.length < 20) throw new Error('响应报文不足 20 字节')
  if (buf.readUInt16BE(0) !== 0x0103) throw new Error('不是 Allocate Success Response')
  if (!buf.subarray(4, 8).equals(MAGIC_COOKIE)) throw new Error('响应缺少 STUN magic cookie')
  if (!buf.subarray(8, 20).equals(Buffer.from(transactionId))) throw new Error('响应事务 ID 不匹配')

  let offset = 20
  const end = Math.min(20 + buf.readUInt16BE(2), buf.length)
  let relayAddress = null
  let mappedAddress = null
  while (offset + 4 <= end) {
    const attrType = buf.readUInt16BE(offset)
    const attrLength = buf.readUInt16BE(offset + 2)
    const valueStart = offset + 4
    if (valueStart + attrLength > buf.length) break
    if ((attrType === 0x0016 || attrType === 0x0020) && attrLength >= 8) {
      const address = decodeXorAddress(buf.subarray(valueStart, valueStart + attrLength))
      if (address) {
        if (attrType === 0x0016) relayAddress = address
        else mappedAddress = address
      }
    }
    offset = valueStart + attrLength + ((4 - (attrLength % 4)) % 4)
  }
  return { relayAddress, mappedAddress }
}
