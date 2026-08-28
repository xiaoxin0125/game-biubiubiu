// RTCPeerConnection wrapper for host↔guest video/audio stream + a DataChannel
// for input forwarding. The signaling layer (useRoomSignal) is injected so
// SDP offers/answers/ICE candidates travel through our own server.
//
// Host: calls startCall(peerId, stream) to offer media + a DC to the guest.
// Guest: listens passively — handleOffer creates a PC answering the host,
//        exposing the incoming stream via onRemoteStream and DC msgs via
//        onDataMessage.

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
]

function splitIceUrls(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function sanitizeIceServer(server) {
  const urls = Array.isArray(server?.urls)
    ? server.urls.map((item) => String(item || '').trim()).filter(Boolean)
    : String(server?.urls || '').trim()
  if (!urls || (Array.isArray(urls) && urls.length === 0)) return null
  const out = { urls }
  if (server.username) out.username = String(server.username)
  if (server.credential) out.credential = String(server.credential)
  if (server.credentialType) out.credentialType = String(server.credentialType)
  return out
}

function parseCustomIceServers(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitizeIceServer).filter(Boolean)
  } catch {
    return []
  }
}

function runtimeValue(key, defaultValue = '') {
  const value = window.__APP_CONFIG__?.[key]
  return value === undefined || value === null ? defaultValue : value
}

function buildIceServers() {
  const customServers = parseCustomIceServers(runtimeValue('WEBRTC_ICE_SERVERS'))
  if (customServers.length) return customServers

  const stunUrls = splitIceUrls(runtimeValue('WEBRTC_STUN_URLS'))
  const turnUrls = splitIceUrls(runtimeValue('WEBRTC_TURN_URLS'))
  const servers = [{ urls: stunUrls.length ? stunUrls : DEFAULT_STUN_URLS }]

  if (turnUrls.length) {
    const turnServer = { urls: turnUrls }
    const username = String(runtimeValue('WEBRTC_TURN_USERNAME')).trim()
    const credential = String(runtimeValue('WEBRTC_TURN_CREDENTIAL')).trim()
    if (username) turnServer.username = username
    if (credential) turnServer.credential = credential
    servers.push(turnServer)
  }

  return servers
}

const ICE_CONFIG = {
  iceServers: buildIceServers(),
  iceTransportPolicy: String(runtimeValue('WEBRTC_FORCE_RELAY')) === '1' ? 'relay' : 'all',
}

export function useWebRTC({ signal, onRemoteStream, onDataMessage, onStateChange }) {
  // peerId → { pc, dc }
  const peers = new Map()

  function getOrCreate(peerId, { initiatorStream = null } = {}) {
    let entry = peers.get(peerId)
    if (entry) return entry

    const pc = new RTCPeerConnection(ICE_CONFIG)
    entry = { pc, dc: null }
    peers.set(peerId, entry)

    pc.onicecandidate = (ev) => {
      if (ev.candidate) signal.sendIce(peerId, ev.candidate)
    }
    pc.ontrack = (ev) => {
      onRemoteStream?.(ev.streams[0])
    }
    pc.onconnectionstatechange = () => {
      onStateChange?.(pc.connectionState)
    }
    pc.oniceconnectionstatechange = () => {
      onStateChange?.('ice:' + pc.iceConnectionState)
    }
    pc.ondatachannel = (ev) => {
      // Guest (non-initiator) receives the host's DataChannel here
      entry.dc = ev.channel
      wireDataChannel(entry.dc, peerId)
    }

    if (initiatorStream) {
      for (const track of initiatorStream.getTracks()) {
        pc.addTrack(track, initiatorStream)
      }
      // Host-side DC: carries guest-input messages back to host
      entry.dc = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 })
      wireDataChannel(entry.dc, peerId)
    }

    return entry
  }

  function wireDataChannel(dc, peerId) {
    dc.onopen = () => onStateChange?.('dc:open')
    dc.onclose = () => onStateChange?.('dc:close')
    dc.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      onDataMessage?.(msg, peerId)
    }
  }

  async function startCall(peerId, stream) {
    const { pc } = getOrCreate(peerId, { initiatorStream: stream })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signal.sendOffer(peerId, offer)
  }

  async function handleOffer(fromPeerId, sdp) {
    const { pc } = getOrCreate(fromPeerId)
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    signal.sendAnswer(fromPeerId, answer)
  }

  async function handleAnswer(fromPeerId, sdp) {
    const entry = peers.get(fromPeerId)
    if (!entry) return
    await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp))
  }

  async function handleIce(fromPeerId, candidate) {
    const entry = peers.get(fromPeerId)
    if (!entry) return
    try { await entry.pc.addIceCandidate(candidate) } catch (err) {
      // remote candidate may arrive before we've set remote description; swallow
    }
  }

  function sendData(msg) {
    const data = JSON.stringify(msg)
    for (const { dc } of peers.values()) {
      if (dc && dc.readyState === 'open') {
        try { dc.send(data) } catch {}
      }
    }
  }

  function close() {
    for (const { pc, dc } of peers.values()) {
      try { dc?.close() } catch {}
      try { pc.close() } catch {}
    }
    peers.clear()
  }

  function closePeer(peerId) {
    const entry = peers.get(peerId)
    if (!entry) return
    try { entry.dc?.close() } catch {}
    try { entry.pc.close() } catch {}
    peers.delete(peerId)
  }

  return {
    startCall,
    handleOffer,
    handleAnswer,
    handleIce,
    sendData,
    closePeer,
    close,
  }
}
