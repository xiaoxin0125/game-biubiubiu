import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeStunUrls, MAX_STUN_URLS_LENGTH } from '../server/webrtc-settings.js'

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
