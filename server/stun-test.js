/*
 * STUN 服务器连通性探测。
 *
 * 后台「站点设置 → STUN 服务器」里的地址由这里做一次真实的 RFC 5389
 * Binding Request 测试：从本服务直接向目标 STUN 端口发 UDP（stuns: 走 TCP）
 * 并解析返回的 XOR-MAPPED-ADDRESS，因此能区分"网络不通 / 端口没监听 /
 * 地址写错 / 服务器正常"。
 *
 * 浏览器侧另有一次 ICE 采集测试（Admin.vue 里的 testStunIce）：浏览器出于
 * 隐私不会把 STUN 的应答暴露给页面，所以"服务器能不能用"以本模块的结论为准。
 *
 * 注意：本服务部署在服务器上，探测结果代表"服务器出网方向"的可达性；
 * 玩家能不能用还取决于玩家的网络与安全组规则，后台测试界面会给出提示。
 */

import dgram from 'node:dgram'
import net from 'node:net'
import dns from 'node:dns'
import { randomBytes } from 'node:crypto'
import { buildAuthenticatedAllocate, parseAllocateSuccess } from './webrtc-settings.js'

const MAGIC_COOKIE = Buffer.from([0x21, 0x12, 0xa4, 0x42])
export { MAGIC_COOKIE }
const DEFAULT_PORT = 3478
const DEFAULT_TIMEOUT_MS = 2500
const MAX_PARALLEL_PROBES = 4

// transport: udp | tcp → 中文名，用于结果展示
const TRANSPORT_LABELS = { udp: 'UDP', tcp: 'TCP' }

// 把「IP:端口」格式化成方便查看的形式（IPv6 加方括号）
function formatEndpoint(address, port) {
  const host = String(address || '')
  return `${host.includes(':') ? `[${host}]` : host}:${port}`
}

// XOR-MAPPED-ADDRESS / XOR-RELAYED-ADDRESS 的值 → { address, port, family }
export function decodeXorAddress(value) {
  const family = value.readUInt8(1)
  const port = value.readUInt16BE(2) ^ 0x2112
  if (family === 0x01 && value.length >= 8) {
    const raw = Buffer.from(value.subarray(4, 8))
    for (let i = 0; i < 4; i += 1) raw[i] ^= MAGIC_COOKIE[i]
    return { address: `${raw[0]}.${raw[1]}.${raw[2]}.${raw[3]}`, port, family: 'IPv4' }
  }
  if (family === 0x02 && value.length >= 20) {
    const raw = Buffer.from(value.subarray(4, 20))
    for (let i = 0; i < 16; i += 1) raw[i] ^= i < 4 ? MAGIC_COOKIE[i] : 0
    return { address: [...Array(8)].map((_, i) => raw.readUInt16BE(i * 2).toString(16)).join(':'), port, family: 'IPv6' }
  }
  return null
}

// STUN Binding Request：20 字节头部。默认不带任何属性：
// 实测（coturn 4.5.2 + 1:1 NAT 环境）带 SOFTWARE 属性的请求会收不到响应，
// 裸头部最稳，而且响应解析照样能验证 XOR-MAPPED-ADDRESS。
export function buildBindingRequest(transactionId, software = null) {
  const txid = Buffer.from(transactionId)
  if (txid.length !== 12) throw new Error('事务 ID 必须是 12 字节')
  const attributes = []
  if (software) {
    const value = Buffer.from(software, 'utf8')
    const attr = Buffer.alloc(4 + value.length)
    attr.writeUInt16BE(0x8022, 0) // SOFTWARE
    attr.writeUInt16BE(value.length, 2)
    value.copy(attr, 4)
    attributes.push(attr)
  }
  const body = Buffer.concat(attributes)
  const header = Buffer.alloc(20)
  header.writeUInt16BE(0x0001, 0) // Binding Request
  header.writeUInt16BE(body.length, 2)
  header.writeUInt32BE(0x2112a442, 4)
  txid.copy(header, 8)
  return Buffer.concat([header, body])
}

// 解析 Binding Success Response；拿到 mapped address 才算成功。
// 非 STUN 响应（HTTP、随机字节、错误的事务 ID）都会抛错，让调用方转成人话。
export function parseBindingResponse(buffer, transactionId) {
  const buf = Buffer.from(buffer || [])
  if (buf.length < 20) throw new Error('响应报文不足 20 字节')
  if ((buf.readUInt16BE(0) & 0xc000) !== 0) throw new Error('响应类型不是 STUN 消息')
  const type = buf.readUInt16BE(0)
  if (type !== 0x0101) throw new Error(`不是 Binding Success Response（0x${type.toString(16)}）`)
  if (!buf.subarray(4, 8).equals(MAGIC_COOKIE)) throw new Error('响应缺少 STUN magic cookie')
  if (!buf.subarray(8, 20).equals(Buffer.from(transactionId))) throw new Error('响应事务 ID 不匹配')

  let offset = 20
  const end = Math.min(20 + buf.readUInt16BE(2), buf.length)
  while (offset + 4 <= end) {
    const attrType = buf.readUInt16BE(offset)
    const attrLength = buf.readUInt16BE(offset + 2)
    const valueStart = offset + 4
    const valueEnd = valueStart + attrLength
    if (valueEnd > buf.length) break

    if (attrType === 0x0020 && attrLength >= 8) {
      // XOR-MAPPED-ADDRESS：端口和地址都与 magic cookie 异或
      const family = buf.readUInt8(valueStart + 1)
      const port = buf.readUInt16BE(valueStart + 2) ^ 0x2112
      if (family === 0x01) {
        const raw = Buffer.from(buf.subarray(valueStart + 4, valueStart + 8))
        for (let i = 0; i < 4; i += 1) raw[i] ^= MAGIC_COOKIE[i]
        return { address: `${raw[0]}.${raw[1]}.${raw[2]}.${raw[3]}`, port, family: 'IPv4' }
      }
      if (family === 0x02 && attrLength >= 20) {
        const raw = Buffer.from(buf.subarray(valueStart + 4, valueStart + 20))
        for (let i = 0; i < 16; i += 1) raw[i] ^= (i < 4 ? MAGIC_COOKIE[i] : transactionId[i - 4])
        const groups = []
        for (let i = 0; i < 16; i += 2) groups.push(raw.readUInt16BE(i).toString(16))
        return { address: groups.join(':'), port, family: 'IPv6' }
      }
    }
    if (attrType === 0x0009 && attrLength >= 4) {
      // ERROR-CODE：class 取高 3 位，number 取低 8 位
      const codeNumber = (buf.readUInt8(valueStart + 2) & 0x07) * 100 + buf.readUInt8(valueStart + 3)
      throw new Error(`服务器返回 STUN 错误 ${codeNumber}`)
    }
    offset = valueStart + attrLength + ((4 - (attrLength % 4)) % 4) // 属性按 4 字节对齐
  }
  throw new Error('响应里没有 XOR-MAPPED-ADDRESS')
}

// stun:/stuns: 地址 → { host, port, transport }
export function parseStunUrl(raw) {
  const url = String(raw || '').trim()
  const match = /^(stun|stuns):([^:]+|\[[^\]]+\])(?::(\d+))?$/.exec(url)
  if (!match) throw new Error(`无法识别的 STUN 地址：${url || '(空)'}`)
  let host = match[2]
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  const transport = match[1] === 'stuns' ? 'tcp' : 'udp'
  const port = match[3] ? Number(match[3]) : DEFAULT_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`端口不合法：${match[3]}`)
  return { host, port, transport }
}

function errorMessage(error) {
  const code = String(error?.code || '')
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '域名无法解析'
  if (code === 'ECONNREFUSED') return '端口拒绝连接（服务器没在监听该端口）'
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return '网络不可达'
  return error?.prettyMessage || error?.message || '未知错误'
}

// 单个地址探测：返回 { url, ok, ... }，不抛异常
export async function probeStunServer(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, resolveHost = null } = {}) {
  const startedAt = Date.now()
  let target
  try {
    target = parseStunUrl(rawUrl)
  } catch (error) {
    return { url: String(rawUrl), ok: false, error: error.message }
  }

  const transport = TRANSPORT_LABELS[target.transport] || target.transport
  let address
  try {
    const lookup = resolveHost || ((host) => dns.promises.lookup(host, { family: 0, verbatim: false }).then((r) => r.address))
    address = await lookup(target.host)
  } catch (error) {
    return { url: String(rawUrl), ok: false, transport, error: `解析 ${target.host} 失败：${errorMessage(error)}` }
  }

  const txid = randomBytes(12)
  const request = buildBindingRequest(txid)
  const timeout = Math.max(500, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 10000))

  try {
    const result = target.transport === 'tcp'
      ? await probeTcp(address, target.port, request, txid, timeout)
      : await probeUdp(address, target.port, request, txid, timeout)
    return {
      url: String(rawUrl),
      ok: true,
      transport,
      resolved: formatEndpoint(address, target.port),
      mapped: formatEndpoint(result.address, result.port),
      family: result.family,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return { url: String(rawUrl), ok: false, transport, error: errorMessage(error) }
  }
}

async function probeUdp(address, port, request, txid, timeoutMs) {
  const reply = await udpRequest(address, port, request, timeoutMs)
  return parseBindingResponse(reply, txid)
}

async function probeTcp(address, port, request, txid, timeoutMs) {
  const reply = await tcpRequest(address, port, request, timeoutMs)
  return parseBindingResponse(reply, txid)
}

// 依次探测多个地址，汇总成一句人话结论
export async function testStunUrls(urls, { timeoutMs = DEFAULT_TIMEOUT_MS, resolveHost = null } = {}) {
  const list = [...new Set((urls || []).map((item) => String(item || '').trim()).filter(Boolean))]
  if (!list.length) throw new Error('还没有填写 STUN 地址')

  const probes = []
  for (let i = 0; i < list.length; i += MAX_PARALLEL_PROBES) {
    probes.push(...await Promise.all(list.slice(i, i + MAX_PARALLEL_PROBES)
      .map((url) => probeStunServer(url, { timeoutMs, resolveHost }))))
  }

  const okCount = probes.filter((item) => item.ok).length
  const latencies = probes.filter((item) => item.ok).map((item) => item.latencyMs)
  const averageLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null
  const summary = okCount === probes.length
    ? `${probes.length} 个 STUN 地址全部可用`
    : okCount > 0
      ? `${probes.length} 个地址中 ${okCount} 个可用，${probes.length - okCount} 个失败`
      : '所有 STUN 地址都不可用'
  return { ok: okCount > 0, probes, okCount, failCount: probes.length - okCount, averageLatencyMs, summary }
}

// ── TURN Allocate 探测 ──────────────────────────────────
// 发一个不带凭据的 Allocate 请求，根据响应判断「中继端口段是否真的能用」：
//   - Error 401 + REALM：服务正常且要求鉴权——这是预期现象，说明中继可以分配
//   - Error 300：服务器配了备用地址，探测方没带；不影响正常使用
//   - Error 437/508 等：中继端口段耗尽或容量不足（min-port/max-port 开太小）
//   - 超时：端口没放行或被防火墙拦截
export function buildAllocateRequest(transactionId) {
  const txid = Buffer.from(transactionId)
  const value = Buffer.alloc(4)
  value.writeUInt8(17, 0) // REQUESTED-TRANSPORT = UDP
  const attr = Buffer.alloc(8)
  attr.writeUInt16BE(0x0019, 0)
  attr.writeUInt16BE(4, 2)
  value.copy(attr, 4)
  const header = Buffer.alloc(20)
  header.writeUInt16BE(0x0003, 0) // Allocate Request
  header.writeUInt16BE(attr.length, 2)
  header.writeUInt32BE(0x2112a442, 4)
  txid.copy(header, 8)
  return Buffer.concat([header, attr])
}

// 解析 TURN 应答：返回 { method, errorCode, realm, nonce }。鉴权挑战（401）也算解析成功。
export function parseTurnResponse(buffer, transactionId) {
  const buf = Buffer.from(buffer || [])
  if (buf.length < 20) throw new Error('响应报文不足 20 字节')
  if ((buf.readUInt16BE(0) & 0xc000) !== 0) throw new Error('响应类型不是 STUN 消息')
  if (!buf.subarray(4, 8).equals(MAGIC_COOKIE)) throw new Error('响应缺少 STUN magic cookie')
  if (!buf.subarray(8, 20).equals(Buffer.from(transactionId))) throw new Error('响应事务 ID 不匹配')
  const type = buf.readUInt16BE(0)
  const method = ((type >> 2) & 0x0f80) | ((type >> 1) & 0x0070) | (type & 0x000f)
  let offset = 20
  const end = Math.min(20 + buf.readUInt16BE(2), buf.length)
  let errorCode = null
  let realm = null
  let nonce = null
  while (offset + 4 <= end) {
    const attrType = buf.readUInt16BE(offset)
    const attrLength = buf.readUInt16BE(offset + 2)
    const valueStart = offset + 4
    if (valueStart + attrLength > buf.length) break
    if (attrType === 0x0009 && attrLength >= 4) {
      errorCode = (buf.readUInt8(valueStart + 2) & 0x07) * 100 + buf.readUInt8(valueStart + 3)
    }
    if (attrType === 0x0014) realm = buf.subarray(valueStart, valueStart + attrLength).toString('utf8')
    if (attrType === 0x0015) nonce = buf.subarray(valueStart, valueStart + attrLength).toString('utf8')
    offset = valueStart + attrLength + ((4 - (attrLength % 4)) % 4)
  }
  if (method !== 0x0003) throw new Error('响应不是 Allocate 方法')
  return { method, errorCode, realm, nonce }
}

export async function probeTurnServer(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, resolveHost = null } = {}) {
  const startedAt = Date.now()
  let target
  let requestedTransport = null
  try {
    const raw = String(rawUrl)
    // coturn 生成的地址常带 ?transport=udp|tcp，用它决定走哪种承载
    const queryIndex = raw.indexOf('?')
    const withoutQuery = queryIndex === -1 ? raw : raw.slice(0, queryIndex)
    if (queryIndex !== -1) {
      const transport = new URLSearchParams(raw.slice(queryIndex + 1)).get('transport')
      if (transport === 'udp' || transport === 'tcp') requestedTransport = transport
    }
    // 端口和主机解析复用 STUN 的规则：turn:/turns: 与 stun:/stuns: 同构
    const normalized = withoutQuery.replace(/^turns:/, 'stuns:').replace(/^turn:/, 'stun:')
    target = parseStunUrl(normalized)
    if (requestedTransport) target.transport = requestedTransport
  } catch (error) {
    return { url: String(rawUrl), ok: false, error: error.message }
  }
  const transport = TRANSPORT_LABELS[target.transport] || target.transport
  let address
  try {
    const lookup = resolveHost || ((host) => dns.promises.lookup(host, { family: 0, verbatim: false }).then((r) => r.address))
    address = await lookup(target.host)
  } catch (error) {
    return { url: String(rawUrl), ok: false, transport, error: `解析 ${target.host} 失败：${errorMessage(error)}` }
  }

  const txid = randomBytes(12)
  const request = buildAllocateRequest(txid)
  const timeout = Math.max(500, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 10000))
  try {
    const reply = target.transport === 'tcp'
      ? await socketRequest('tcp', address, target.port, request, timeout)
      : await socketRequest('udp', address, target.port, request, timeout)
    const parsed = parseTurnResponse(reply, txid)
    const latencyMs = Date.now() - startedAt
    if (parsed.errorCode && parsed.errorCode !== 401 && parsed.errorCode !== 438) {
      return {
        url: String(rawUrl), ok: false, transport, latencyMs,
        error: parsed.errorCode === 300
          ? '服务器要求使用备用地址（alt-server），探测请求没带；正常使用不受影响'
          : `服务器返回 TURN 错误 ${parsed.errorCode}`,
      }
    }
    return {
      url: String(rawUrl), ok: true, transport,
      resolved: formatEndpoint(address, target.port),
      realm: parsed.realm || null,
      latencyMs,
      note: '中继端口可用，要求鉴权（正常）',
    }
  } catch (error) {
    return { url: String(rawUrl), ok: false, transport, error: errorMessage(error) }
  }
}

// 带用户名/密码的完整 TURN 验证：真的去分配一次中继端口。
// 不带凭据先拿 realm/nonce，再按长凭据机制（MESSAGE-INTEGRITY）重发 Allocate。
// 返回中继地址说明账号、密码、端口窗口全部可用。
export async function probeTurnWithCredentials(rawUrl, { username, credential, realm: knownRealm = null, timeoutMs = DEFAULT_TIMEOUT_MS, resolveHost = null } = {}) {
  if (!username || !credential) throw new Error('请先填写 TURN 用户名和密码')
  const startedAt = Date.now()
  let target
  let requestedTransport = null
  try {
    const raw = String(rawUrl)
    const queryIndex = raw.indexOf('?')
    const withoutQuery = queryIndex === -1 ? raw : raw.slice(0, queryIndex)
    if (queryIndex !== -1) {
      const transport = new URLSearchParams(raw.slice(queryIndex + 1)).get('transport')
      if (transport === 'udp' || transport === 'tcp') requestedTransport = transport
    }
    target = parseStunUrl(withoutQuery.replace(/^turns:/, 'stuns:').replace(/^turn:/, 'stun:'))
    if (requestedTransport) target.transport = requestedTransport
  } catch (error) {
    return { url: String(rawUrl), ok: false, error: error.message }
  }
  const transport = TRANSPORT_LABELS[target.transport] || target.transport
  let address
  try {
    const lookup = resolveHost || ((host) => dns.promises.lookup(host, { family: 0, verbatim: false }).then((r) => r.address))
    address = await lookup(target.host)
  } catch (error) {
    return { url: String(rawUrl), ok: false, transport, error: `解析 ${target.host} 失败：${errorMessage(error)}` }
  }
  const timeout = Math.max(500, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 10000))

  // 挑战和鉴权必须从同一个本地端口发出：coturn 会把 nonce 与客户端地址绑定，
  // 换端口会被判成 stale nonce（438）。所以整个会话复用同一个 socket。
  const session = await openTurnSession(target.transport, address, target.port, timeout)
  try {
    let realm = knownRealm
    let nonce = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const txid = randomBytes(12)
      const payload = nonce
        ? buildAuthenticatedAllocate({ transactionId: txid, username, realm, nonce, password: credential })
        : buildAllocateRequest(txid)
      const reply = await session.request(payload)
      const head = Buffer.from(reply).subarray(0, 20)
      const type = head.readUInt16BE(0)

      if (type === 0x0103 && nonce) {
        const allocated = parseAllocateSuccess(reply, txid)
        return {
          url: String(rawUrl), ok: true, transport, realm,
          relay: allocated.relayAddress ? formatEndpoint(allocated.relayAddress.address, allocated.relayAddress.port) : null,
          mapped: allocated.mappedAddress ? formatEndpoint(allocated.mappedAddress.address, allocated.mappedAddress.port) : null,
          latencyMs: Date.now() - startedAt,
          note: '鉴权通过，中继端口分配成功',
        }
      }
      if (type === 0x0103 && !nonce) {
        return { url: String(rawUrl), ok: true, transport, note: '服务器允许匿名中继（未要求鉴权），中继可用但建议配置 lt-cred-mech' }
      }

      const parsed = parseTurnResponse(reply, txid)
      if (parsed.realm) realm = parsed.realm
      // 401 = 首次询问（需要带凭据重试）；438 = nonce 过期（用新 nonce 重试）
      if ((parsed.errorCode === 401 || parsed.errorCode === 438) && parsed.nonce && attempt < 3) {
        nonce = parsed.nonce
        continue
      }
      if (parsed.errorCode === 401) {
        return { url: String(rawUrl), ok: false, transport, latencyMs: Date.now() - startedAt, error: '用户名或密码不正确（服务器要求鉴权）' }
      }
      if (parsed.errorCode === 438) {
        return { url: String(rawUrl), ok: false, transport, latencyMs: Date.now() - startedAt, error: '服务器 nonce 校验失败（438），请重启 coturn 后重试' }
      }
      if (parsed.errorCode === 508) {
        return { url: String(rawUrl), ok: false, transport, latencyMs: Date.now() - startedAt, error: '服务器中继端口已用满（508），请扩大 min-port/max-port 窗口或稍后重试' }
      }
      return {
        url: String(rawUrl), ok: false, transport, latencyMs: Date.now() - startedAt,
        error: `服务器返回 TURN 错误 ${parsed.errorCode ?? `0x${type.toString(16)}`}`,
      }
    }
    return { url: String(rawUrl), ok: false, transport, error: '多次尝试后仍未拿到可用的 nonce（检查服务器 realm/lt-cred-mech 与网络稳定性）' }
  } catch (error) {
    return { url: String(rawUrl), ok: false, transport, error: errorMessage(error) }
  } finally {
    session.close()
  }
}

// 整个 TURN 会话复用一个连接：返回 { request(payload) → Promise<response>, close() }
function openTurnSession(kind, address, port, timeoutMs) {
  if (kind === 'tcp') return openTcpSession(address, port, timeoutMs)
  return openUdpSession(address, port, timeoutMs)
}

function openUdpSession(address, port, timeoutMs) {
  const socket = dgram.createSocket(address.includes(':') ? 'udp6' : 'udp4')
  let waiter = null
  socket.on('message', (msg) => {
    const current = waiter
    waiter = null
    if (current) {
      clearTimeout(current.timer)
      current.resolve(Buffer.from(msg))
    }
  })
  socket.on('error', (error) => {
    const current = waiter
    waiter = null
    if (current) {
      clearTimeout(current.timer)
      current.reject(error)
    }
  })
  return Promise.resolve({
    request(payload) {
      return new Promise((resolve, reject) => {
        if (waiter) return reject(new Error('上一个请求还没有结果'))
        const timer = setTimeout(() => {
          waiter = null
          reject(Object.assign(new Error(`超过 ${timeoutMs}ms 未收到响应`), { prettyMessage: `超过 ${timeoutMs}ms 未收到响应（可能被防火墙拦截）` }))
        }, timeoutMs)
        waiter = { resolve, reject, timer }
        socket.send(payload, port, address, (error) => {
          if (!error) return
          const current = waiter
          waiter = null
          if (current) {
            clearTimeout(current.timer)
            current.reject(error)
          }
        })
      })
    },
    close() {
      try { socket.close() } catch {}
    },
  })
}

function openTcpSession(address, port, timeoutMs) {
  const socket = net.connect({ host: address, port })
  let waiter = null
  let buffer = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    while (waiter && buffer.length >= 20) {
      const total = 20 + buffer.readUInt16BE(2)
      if (buffer.length < total) return
      const message = buffer.subarray(0, total)
      buffer = buffer.subarray(total)
      const current = waiter
      waiter = null
      clearTimeout(current.timer)
      current.resolve(Buffer.from(message))
    }
  })
  socket.on('error', (error) => {
    const current = waiter
    waiter = null
    if (current) {
      clearTimeout(current.timer)
      current.reject(error)
    }
  })
  socket.on('close', () => {
    const current = waiter
    waiter = null
    if (current) {
      clearTimeout(current.timer)
      current.reject(new Error('连接被服务器关闭，没有返回响应'))
    }
  })
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve({
      request(payload) {
        return new Promise((res, rej) => {
          if (waiter) return rej(new Error('上一个请求还没有结果'))
          const timer = setTimeout(() => {
            waiter = null
            rej(Object.assign(new Error(`超过 ${timeoutMs}ms 未收到响应`), { prettyMessage: `连接或读取超过 ${timeoutMs}ms（可能被防火墙拦截）` }))
          }, timeoutMs)
          waiter = { resolve: res, reject: rej, timer }
          socket.write(payload)
        })
      },
      close() {
        try { socket.destroy() } catch {}
      },
    }))
    socket.once('error', reject)
  })
}

// 通用「发一个请求、收一个响应」的 UDP/TCP 探测底座
function socketRequest(kind, address, port, payload, timeoutMs) {
  if (kind === 'tcp') return tcpRequest(address, port, payload, timeoutMs)
  return udpRequest(address, port, payload, timeoutMs)
}

function udpRequest(address, port, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(address.includes(':') ? 'udp6' : 'udp4')
    let settled = false
    const finish = (cb, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.close() } catch {}
      cb(value)
    }
    const timer = setTimeout(() => finish(reject, Object.assign(new Error(`超过 ${timeoutMs}ms 未收到响应`), { prettyMessage: `超过 ${timeoutMs}ms 未收到响应（可能被防火墙拦截）` })), timeoutMs)
    socket.on('error', (error) => finish(reject, error))
    socket.on('message', (msg) => finish(resolve, Buffer.from(msg)))
    socket.send(payload, port, address, (error) => {
      if (error) finish(reject, error)
    })
  })
}

function tcpRequest(address, port, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: address, port })
    let settled = false
    let buffer = Buffer.alloc(0)
    const finish = (cb, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.destroy() } catch {}
      cb(value)
    }
    const timer = setTimeout(() => finish(reject, Object.assign(new Error(`超过 ${timeoutMs}ms 未收到响应`), { prettyMessage: `连接或读取超过 ${timeoutMs}ms（可能被防火墙拦截）` })), timeoutMs)
    socket.on('error', (error) => finish(reject, error))
    socket.on('connect', () => socket.write(payload))
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length < 20) return
      const total = 20 + buffer.readUInt16BE(2)
      if (buffer.length < total) return
      finish(resolve, buffer.subarray(0, total))
    })
    socket.on('close', () => {
      if (!settled) finish(reject, new Error('连接被服务器关闭，没有返回响应'))
    })
  })
}
