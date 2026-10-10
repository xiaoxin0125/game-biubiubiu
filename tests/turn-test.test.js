import assert from 'node:assert/strict'
import { test } from 'node:test'
import dgram from 'node:dgram'
import { randomBytes } from 'node:crypto'
import { buildAllocateRequest, parseTurnResponse, probeTurnServer, probeTurnWithCredentials } from '../server/stun-test.js'
import { verifyMessageIntegrity } from '../server/webrtc-settings.js'
import { createHash, createHmac } from 'node:crypto'

const COOKIE = Buffer.from([0x21, 0x12, 0xa4, 0x42])

function attribute(type, value) {
  const padded = Buffer.concat([value, Buffer.alloc((4 - (value.length % 4)) % 4)])
  const attr = Buffer.alloc(4 + padded.length)
  attr.writeUInt16BE(type, 0)
  attr.writeUInt16BE(value.length, 2)
  padded.copy(attr, 4)
  return attr
}

function turnErrorResponse(transactionId, code, realm) {
  const errorValue = Buffer.alloc(4)
  errorValue.writeUInt16BE(0, 0)
  errorValue.writeUInt8(Math.floor(code / 100), 2)
  errorValue.writeUInt8(code % 100, 3)
  const attributes = [attribute(0x0009, errorValue)]
  if (realm) attributes.push(attribute(0x0014, Buffer.from(realm, 'utf8')))
  const body = Buffer.concat(attributes)
  const header = Buffer.alloc(20)
  header.writeUInt16BE(0x0113, 0) // Allocate Error Response
  header.writeUInt16BE(body.length, 2)
  header.writeUInt32BE(0x2112a442, 4)
  Buffer.from(transactionId).copy(header, 8)
  return Buffer.concat([header, body])
}

test('Allocate 请求编码正确', () => {
  const txid = randomBytes(12)
  const request = buildAllocateRequest(txid)
  assert.equal(request.length, 28)
  assert.equal(request.readUInt16BE(0), 0x0003)
  assert.equal(request.readUInt16BE(2), 8)
  assert.equal(request.readUInt32BE(4), 0x2112a442)
  assert.deepEqual(request.subarray(8, 20), txid)
  assert.equal(request.readUInt16BE(20), 0x0019) // REQUESTED-TRANSPORT
  assert.equal(request.readUInt16BE(22), 4)
  assert.equal(request.readUInt8(24), 17) // UDP
})

test('TURN 应答能解出错误码与 realm', () => {
  const txid = randomBytes(12)
  const parsed = parseTurnResponse(turnErrorResponse(txid, 401, 'games-online'), txid)
  assert.equal(parsed.method, 0x0003)
  assert.equal(parsed.errorCode, 401)
  assert.equal(parsed.realm, 'games-online')
  assert.deepEqual(parseTurnResponse(turnErrorResponse(txid, 508, null), txid), { method: 0x0003, errorCode: 508, realm: null, nonce: null })
  assert.throws(() => parseTurnResponse(turnErrorResponse(txid, 401, 'x'), randomBytes(12)), /事务 ID 不匹配/)
  assert.throws(() => parseTurnResponse(Buffer.alloc(8), txid), /不足 20 字节/)
})

test('探测真实 UDP TURN 端口：401 视为可用，508 视为容量不足', async (t) => {
  const server = dgram.createSocket('udp4')
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  let mode = '401'
  server.on('message', (msg, rinfo) => {
    const reply = mode === '401'
      ? turnErrorResponse(msg.subarray(8, 20), 401, 'games-online')
      : turnErrorResponse(msg.subarray(8, 20), 508, null)
    server.send(reply, rinfo.port, rinfo.address)
  })
  const port = server.address().port

  const ok = await probeTurnServer(`turn:127.0.0.1:${port}`, { timeoutMs: 1000 })
  assert.equal(ok.ok, true, ok.error)
  assert.equal(ok.transport, 'UDP')
  assert.equal(ok.realm, 'games-online')
  assert.match(ok.note, /鉴权/)

  mode = '508'
  const noPorts = await probeTurnServer(`turn:127.0.0.1:${port}`, { timeoutMs: 1000 })
  assert.equal(noPorts.ok, false)
  assert.match(noPorts.error, /TURN 错误 508/)

  // 不存在的端口：应当超时并给出可读错误
  const dead = await probeTurnServer('turn:127.0.0.1:1', { timeoutMs: 300 })
  assert.equal(dead.ok, false)
  assert.match(dead.error, /拒绝连接|未收到响应|超时/)
})

test('turn: 地址解析失败时给出可读错误', async () => {
  const bad = await probeTurnServer('turn:no-such-host.invalid:14273', { timeoutMs: 500 })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /解析/)
  const invalid = await probeTurnServer('not-a-turn-url', { timeoutMs: 500 })
  assert.equal(invalid.ok, false)
  assert.match(invalid.error, /无法识别/)
})

test('带用户名密码的 TURN 验证：正确密码分配成功，错误密码报 401', async (t) => {
  const username = 'gameuser'
  const password = 'secret-pass'
  const realm = 'games-online'
  const nonce = 'nonce-abc'

  function xorAddr(type, address, port) {
    const value = Buffer.alloc(8)
    value.writeUInt8(0, 0)
    value.writeUInt8(1, 1)
    value.writeUInt16BE(port ^ 0x2112, 2)
    const raw = Buffer.from(address.split('.').map(Number))
    for (let i = 0; i < 4; i += 1) raw[i] ^= COOKIE[i]
    raw.copy(value, 4)
    const attr = Buffer.alloc(12)
    attr.writeUInt16BE(type, 0)
    attr.writeUInt16BE(8, 2)
    value.copy(attr, 4)
    return attr
  }

  function challenge(transactionId) {
    const body = Buffer.concat([attribute(0x0009, Buffer.from([0, 0, 4, 1])), attribute(0x0014, Buffer.from(realm)), attribute(0x0015, Buffer.from(nonce))])
    const header = Buffer.alloc(20)
    header.writeUInt16BE(0x0113, 0)
    header.writeUInt16BE(body.length, 2)
    header.writeUInt32BE(0x2112a442, 4)
    Buffer.from(transactionId).copy(header, 8)
    return Buffer.concat([header, body])
  }

  function allocateSuccess(transactionId) {
    const body = Buffer.concat([xorAddr(0x0016, '203.0.113.50', 14280), xorAddr(0x0020, '198.51.100.9', 40000)])
    const header = Buffer.alloc(20)
    header.writeUInt16BE(0x0103, 0)
    header.writeUInt16BE(body.length, 2)
    header.writeUInt32BE(0x2112a442, 4)
    Buffer.from(transactionId).copy(header, 8)
    return Buffer.concat([header, body])
  }

  const server = dgram.createSocket('udp4')
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  server.on('message', (msg, rinfo) => {
    // 未签名/签名错误 → 回 401 + realm + nonce 的鉴权挑战（和 coturn 行为一致）
    const authenticated = verifyMessageIntegrity(msg, { username, realm, password })
    if (!authenticated) {
      server.send(challenge(msg.subarray(8, 20)), rinfo.port, rinfo.address)
      return
    }
    server.send(allocateSuccess(msg.subarray(8, 20)), rinfo.port, rinfo.address)
  })
  const port = server.address().port
  const url = `turn:127.0.0.1:${port}?transport=udp`

  const ok = await probeTurnWithCredentials(url, { username, credential: password, timeoutMs: 1500 })
  assert.equal(ok.ok, true, ok.error)
  assert.equal(ok.realm, realm)
  assert.equal(ok.relay, '203.0.113.50:14280')
  assert.equal(ok.mapped, '198.51.100.9:40000')
  assert.match(ok.note, /中继端口分配成功/)

  const bad = await probeTurnWithCredentials(url, { username, credential: 'wrong-pass', timeoutMs: 1500 })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /用户名或密码/)

  await assert.rejects(() => probeTurnWithCredentials(url, { username: '', credential: '' }), /请先填写/)
})

test('带 ?transport= 的 TURN 地址按参数选择承载', async (t) => {
  const server = dgram.createSocket('udp4')
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  server.on('message', (msg, rinfo) => {
    // 统一回 401 + realm 的鉴权挑战，用于验证「未带凭据也能判定中继可用」
    server.send(turnErrorResponse(msg.subarray(8, 20), 401, 'games-online'), rinfo.port, rinfo.address)
  })
  const port = server.address().port

  const udp = await probeTurnServer(`turn:127.0.0.1:${port}?transport=udp`, { timeoutMs: 1000 })
  assert.equal(udp.ok, true, udp.error)
  assert.equal(udp.transport, 'UDP')

  // ?transport=tcp 会走 TCP，UDP 服务器收不到 → 应超时失败
  const tcp = await probeTurnServer(`turn:127.0.0.1:${port}?transport=tcp`, { timeoutMs: 400 })
  assert.equal(tcp.ok, false)
  assert.equal(tcp.transport, 'TCP')
})
