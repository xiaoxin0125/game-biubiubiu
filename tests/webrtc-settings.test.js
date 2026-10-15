import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeStunUrls,
  normalizeTurnSecret,
  normalizeTurnTtl,
  buildTurnCredentials,
  MAX_STUN_URLS_LENGTH,
  TURN_CREDENTIAL_TTL_DEFAULT_SEC,
  TURN_SECRET_MIN_LENGTH,
} from '../server/webrtc-settings.js'

test('STUN is empty by default and can be cleared', () => {
  assert.equal(normalizeStunUrls(''), '')
  assert.equal(normalizeStunUrls(' \n, '), '')
})

test('STUN addresses support commas, newlines and duplicates', () => {
  assert.equal(
    normalizeStunUrls(' stun:example.com:3478\nstuns:example.com:5349,stun:example.com:3478 '),
    'stun:example.com:3478,stuns:example.com:5349',
  )
  assert.equal(normalizeStunUrls('stun:[::1]:3478,stun:localhost'), 'stun:[::1]:3478,stun:localhost')
})

test('invalid STUN addresses and oversized values are rejected', () => {
  for (const value of [null, [], 'https://example.com', 'turn:example.com:3478', 'stun:example.com:0', 'stun:example.com:65536', 'stun:example.com/path', 'stun:user@example.com', 'x'.repeat(MAX_STUN_URLS_LENGTH + 1)]) {
    assert.throws(() => normalizeStunUrls(value))
  }
})

test('WebRTC reads settings at connection creation, with no default external STUN', async () => {
  const oldWindow = globalThis.window
  const oldPeerConnection = globalThis.RTCPeerConnection
  const oldSessionDescription = globalThis.RTCSessionDescription
  const configs = []
  globalThis.window = { __APP_CONFIG__: {} }
  globalThis.RTCSessionDescription = class { constructor(init) { Object.assign(this, init) } }
  globalThis.RTCPeerConnection = class {
    constructor(config) { configs.push(config) }
    async setRemoteDescription() {}
    async createAnswer() { return { type: 'answer', sdp: '' } }
    async setLocalDescription() {}
    close() {}
  }
  const signal = { sendAnswer() {} }
  try {
    const { useWebRTC } = await import('../frontend/src/composables/useWebRTC.js')
    const rtc = useWebRTC({ signal })
    async function iceServersFor(peerId) {
      await rtc.handleOffer(peerId, { type: 'offer', sdp: '' })
      return configs.at(-1)
    }

    assert.deepEqual(await iceServersFor('empty'), { iceServers: [], iceTransportPolicy: 'all' })

    window.__APP_CONFIG__ = { WEBRTC_STUN_URLS: 'stun:example.com:3478' }
    assert.deepEqual((await iceServersFor('configured')).iceServers, [{ urls: ['stun:example.com:3478'] }])

    window.__APP_CONFIG__ = { WEBRTC_STUN_URLS: '' }
    assert.deepEqual((await iceServersFor('cleared')).iceServers, [])

    window.__APP_CONFIG__ = { WEBRTC_TURN_URLS: 'turn:example.com:3478', WEBRTC_TURN_USERNAME: 'user', WEBRTC_TURN_CREDENTIAL: 'secret', WEBRTC_FORCE_RELAY: '1' }
    assert.deepEqual(await iceServersFor('turn'), { iceServers: [{ urls: ['turn:example.com:3478'], username: 'user', credential: 'secret' }], iceTransportPolicy: 'relay' })
    rtc.close()
  } finally {
    globalThis.window = oldWindow
    globalThis.RTCPeerConnection = oldPeerConnection
    globalThis.RTCSessionDescription = oldSessionDescription
  }
})

test('TURN 共享密钥：留空表示不启用，太短会被拒绝', () => {
  assert.equal(normalizeTurnSecret(''), '')
  assert.equal(normalizeTurnSecret(null), '')
  assert.equal(normalizeTurnSecret('  spaced-secret-123456  '), 'spaced-secret-123456')
  assert.throws(() => normalizeTurnSecret('short'))
  assert.throws(() => normalizeTurnSecret('x'.repeat(TURN_SECRET_MIN_LENGTH - 1)))
  assert.throws(() => normalizeTurnSecret('x'.repeat(257)))
})

test('TURN 临时凭据有效期：空值取默认，越界会被拒绝', () => {
  assert.equal(normalizeTurnTtl(''), String(TURN_CREDENTIAL_TTL_DEFAULT_SEC))
  assert.equal(normalizeTurnTtl(null), String(TURN_CREDENTIAL_TTL_DEFAULT_SEC))
  assert.equal(normalizeTurnTtl('900'), '900')
  assert.equal(normalizeTurnTtl(300), '300')
  assert.equal(normalizeTurnTtl('86400'), '86400')
  for (const value of ['299', '86401', '0', '-1', '1.5', 'abc']) {
    assert.throws(() => normalizeTurnTtl(value), undefined, `${value} 应该被拒绝`)
  }
})

test('TURN 临时凭据：coturn 认的格式（时间戳:用户名 + HMAC-SHA1 base64）', () => {
  // 期望值用 openssl 独立算过，确认公式与 coturn 的 use-auth-secret 一致：
  //   printf '%s' '<用户名>' | openssl dgst -sha1 -hmac '<密钥>' -binary | base64
  const issued = buildTurnCredentials({
    secret: 'test-secret-0123456789abcdef',
    name: 'games-online',
    ttlSec: 600,
    now: 1_699_999_400_000,
  })
  assert.deepEqual(issued, {
    username: '1700000000:games-online',
    credential: '3ivVS59MNz4v648p31IeJOz77ww=',
    expiresAtSec: 1_700_000_000,
    ttlSec: 600,
  })

  // 用户名里的冒号会破坏 coturn 的 <时间戳>:<名字> 解析，必须清掉
  assert.equal(buildTurnCredentials({ secret: 'test-secret-0123456789abcdef', name: 'a:b c', ttlSec: 60, now: 0 }).username, '60:abc')
  assert.equal(buildTurnCredentials({ secret: 'test-secret-0123456789abcdef', name: '', ttlSec: 60, now: 0 }).username, '60:games-online')
  assert.throws(() => buildTurnCredentials({ secret: '', ttlSec: 60 }))
  assert.throws(() => buildTurnCredentials({ secret: 'test-secret-0123456789abcdef', ttlSec: 0 }))
})
