import assert from 'node:assert/strict'
import { test } from 'node:test'
import dgram from 'node:dgram'
import { randomBytes } from 'node:crypto'
import {
  buildBindingRequest,
  parseBindingResponse,
  parseStunUrl,
  probeStunServer,
  testStunUrls,
} from '../server/stun-test.js'

const COOKIE = Buffer.from([0x21, 0x12, 0xa4, 0x42])

function xorMappedAddress(address, port) {
  const value = Buffer.alloc(8)
  value.writeUInt8(0, 0) // 保留位
  value.writeUInt8(1, 1) // IPv4
  value.writeUInt16BE(port ^ 0x2112, 2)
  const raw = Buffer.from(address.split('.').map(Number))
  for (let i = 0; i < 4; i += 1) raw[i] ^= COOKIE[i]
  raw.copy(value, 4)
  const attr = Buffer.alloc(4 + value.length)
  attr.writeUInt16BE(0x0020, 0)
  attr.writeUInt16BE(value.length, 2)
  value.copy(attr, 4)
  return attr
}

function errorCodeAttribute(code) {
  const value = Buffer.alloc(4)
  value.writeUInt16BE(0, 0)
  value.writeUInt8(Math.floor(code / 100), 2)
  value.writeUInt8(code % 100, 3)
  const attr = Buffer.alloc(4 + value.length)
  attr.writeUInt16BE(0x0009, 0)
  attr.writeUInt16BE(value.length, 2)
  value.copy(attr, 4)
  return attr
}

function bindingResponse(transactionId, ...attributes) {
  const body = Buffer.concat(attributes)
  const header = Buffer.alloc(20)
  header.writeUInt16BE(0x0101, 0) // Binding Success Response
  header.writeUInt16BE(body.length, 2)
  header.writeUInt32BE(0x2112a442, 4)
  Buffer.from(transactionId).copy(header, 8)
  return Buffer.concat([header, body])
}

test('Binding Request 是合法的 STUN 报文', () => {
  const txid = randomBytes(12)
  const request = buildBindingRequest(txid)
  assert.equal(request.length, 20)
  assert.equal(request.readUInt16BE(0), 0x0001)
  assert.equal(request.readUInt16BE(2), 0)
  assert.equal(request.readUInt32BE(4), 0x2112a442)
  assert.deepEqual(request.subarray(8, 20), txid)
})

test('需要时可以带上 SOFTWARE 属性', () => {
  const txid = randomBytes(12)
  const request = buildBindingRequest(txid, 'games-online-stun-test')
  assert.equal(request.length, 20 + 4 + 'games-online-stun-test'.length)
  assert.equal(request.readUInt16BE(20), 0x8022)
})

test('从 Binding Success Response 解出公网地址', () => {
  const txid = randomBytes(12)
  const response = bindingResponse(txid, xorMappedAddress('203.0.113.7', 55001))
  assert.deepEqual(parseBindingResponse(response, txid), { address: '203.0.113.7', port: 55001, family: 'IPv4' })
})

test('按 4 字节对齐跳过不认识的属性', () => {
  const txid = randomBytes(12)
  // SOFTWARE 属性长度为 3，实际占 4 字节（含 1 字节填充）
  const unknown = Buffer.from([0x80, 0x22, 0x00, 0x03, 0x61, 0x62, 0x63, 0x00])
  const response = bindingResponse(txid, unknown, xorMappedAddress('198.51.100.20', 3478))
  assert.deepEqual(parseBindingResponse(response, txid), { address: '198.51.100.20', port: 3478, family: 'IPv4' })
})

test('错误响应、事务 ID 不符和非 STUN 报文都会被拒绝', () => {
  const txid = randomBytes(12)
  assert.throws(() => parseBindingResponse(bindingResponse(txid, errorCodeAttribute(401)), txid), /STUN 错误 401/)
  assert.throws(() => parseBindingResponse(bindingResponse(txid, xorMappedAddress('203.0.113.7', 3478)), randomBytes(12)), /事务 ID 不匹配/)
  assert.throws(() => parseBindingResponse(Buffer.alloc(8), txid), /不足 20 字节/)
  assert.throws(() => parseBindingResponse(Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'), txid), /不是 STUN 消息/)
  assert.throws(() => parseBindingResponse(bindingResponse(txid), txid), /没有 XOR-MAPPED-ADDRESS/)
})

test('STUN 地址解析支持 UDP 默认端口、显式端口和 stuns:', () => {
  assert.deepEqual(parseStunUrl('stun:stun.example.com'), { host: 'stun.example.com', port: 3478, transport: 'udp' })
  assert.deepEqual(parseStunUrl('stun:203.0.113.5:45123'), { host: '203.0.113.5', port: 45123, transport: 'udp' })
  assert.deepEqual(parseStunUrl('stuns:stun.example.com:5349'), { host: 'stun.example.com', port: 5349, transport: 'tcp' })
  assert.deepEqual(parseStunUrl('stun:[2001:db8::1]:3478'), { host: '2001:db8::1', port: 3478, transport: 'udp' })
  for (const value of ['', 'turn:example.com:3478', 'stun:example.com:0', 'stun:example.com:99999', 'http://example.com']) {
    assert.throws(() => parseStunUrl(value), /无法识别|端口不合法/, `应拒绝: ${value}`)
  }
})

function xorMappedFromRinfo(rinfo, txid) {
  const header = Buffer.alloc(20)
  header.writeUInt16BE(0x0101, 0)
  header.writeUInt16BE(12, 2)
  header.writeUInt32BE(0x2112a442, 4)
  Buffer.from(txid).copy(header, 8)

  const value = Buffer.alloc(8)
  value.writeUInt8(0, 0)
  value.writeUInt8(1, 1)
  value.writeUInt16BE(rinfo.port ^ 0x2112, 2)
  const raw = Buffer.from(String(rinfo.address).split('.').map(Number))
  for (let i = 0; i < 4; i += 1) raw[i] ^= COOKIE[i]
  raw.copy(value, 4)

  const attr = Buffer.alloc(4 + value.length)
  attr.writeUInt16BE(0x0020, 0)
  attr.writeUInt16BE(value.length, 2)
  value.copy(attr, 4)
  return Buffer.concat([header, attr])
}

test('探测真实 UDP STUN 服务器返回公网地址和延迟', async (t) => {
  const server = dgram.createSocket('udp4')
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  let clientEndpoint = null
  server.on('message', (msg, rinfo) => {
    clientEndpoint = `${rinfo.address}:${rinfo.port}`
    server.send(xorMappedFromRinfo(rinfo, msg.subarray(8, 20)), rinfo.port, rinfo.address)
  })
  const port = server.address().port

  const result = await probeStunServer(`stun:127.0.0.1:${port}`, { timeoutMs: 1000 })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.transport, 'UDP')
  assert.equal(result.family, 'IPv4')
  assert.equal(result.resolved, `127.0.0.1:${port}`)
  // 探测器解出的 mapped 地址应当就是本机实际发包的地址:端口
  assert.equal(result.mapped, clientEndpoint)
  assert.ok(Number.isInteger(result.latencyMs) && result.latencyMs >= 0)

  const aggregate = await testStunUrls([`stun:127.0.0.1:${port}`], { timeoutMs: 1000 })
  assert.equal(aggregate.okCount, 1)
  assert.equal(aggregate.failCount, 0)
  assert.equal(aggregate.summary, '1 个 STUN 地址全部可用')
})

test('解析失败、连接被拒绝和空列表都会给出可读的错误', async () => {
  const results = await testStunUrls(
    ['stun:unresolvable.invalid:3478', 'stun:203.0.113.9:3478'],
    { timeoutMs: 300, resolveHost: (host) => (host === 'unresolvable.invalid' ? Promise.reject(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })) : Promise.resolve('203.0.113.9')) },
  )
  assert.equal(results.okCount, 0)
  assert.match(results.probes[0].error, /域名无法解析/)
  assert.match(results.probes[1].error, /未收到响应/)
  await assert.rejects(() => testStunUrls([]), /还没有填写/)
})
