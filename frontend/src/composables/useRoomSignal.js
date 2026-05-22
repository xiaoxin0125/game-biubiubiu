// Thin WebSocket client for /api/rooms/:code/ws. Exposes an on/off event bus
// so Player.vue can hook 'welcome', 'peer-joined', 'peer-left', 'chat',
// 'offer', 'answer', 'ice', 'room-closed' without caring about wire format.

import { ref } from 'vue'
import { api } from '../api/client.js'

export function useRoomSignal({ code, roomTicket = '', clientId = '' }) {
  const connected = ref(false)
  const listeners = new Map()   // event → Set<fn>
  let ws = null
  let closedByUs = false
  let terminalClose = false
  let reconnectTimer = null

  function on(event, fn) {
    let s = listeners.get(event)
    if (!s) { s = new Set(); listeners.set(event, s) }
    s.add(fn)
    return () => s.delete(fn)
  }
  function emit(event, msg) {
    const s = listeners.get(event)
    if (s) for (const fn of s) { try { fn(msg) } catch (e) { console.warn('[signal] handler error', e) } }
  }

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try { ws.send(JSON.stringify(msg)); return true } catch { return false }
  }

  async function connect() {
    if (ws) return
    closedByUs = false
    terminalClose = false
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const params = new URLSearchParams()
    if (roomTicket) params.set('roomTicket', roomTicket)
    if (clientId) params.set('clientId', clientId)
    try {
      const { ticket } = await api.webSocketTicket()
      if (ticket) params.set('ticket', ticket)
    } catch {
      // Anonymous spectators can still enter public rooms; logged-in users use
      // the short ticket as a production fallback when WS cookies are stripped.
    }
    const query = params.toString() ? `?${params.toString()}` : ''
    const url = `${proto}://${location.host}/api/rooms/${encodeURIComponent(code)}/ws${query}`
    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
    }
    ws.onmessage = (evt) => {
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }
      if (!msg || typeof msg.type !== 'string') return
      if (msg.type === 'error' || msg.type === 'room-closed') terminalClose = true
      emit(msg.type, msg)
    }
    ws.onclose = () => {
      connected.value = false
      emit('closed', {})
      ws = null
      if (!closedByUs && !terminalClose) {
        // Soft auto-reconnect once after 2s (handles transient network blips)
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 2000)
      }
    }
    ws.onerror = () => {
      // Error path ultimately triggers onclose; log for visibility only.
      // Intentionally no retry here — onclose handles it.
    }
  }

  function close() {
    closedByUs = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) {
      try { ws.close() } catch {}
      ws = null
    }
    connected.value = false
  }

  function sendChat(text) {
    if (!text) return
    send({ type: 'chat', text: String(text).slice(0, 500) })
  }
  function sendOffer(toPeerId, sdp) { send({ type: 'offer', to: toPeerId, sdp }) }
  function sendAnswer(toPeerId, sdp) { send({ type: 'answer', to: toPeerId, sdp }) }
  function sendIce(toPeerId, candidate) { send({ type: 'ice', to: toPeerId, candidate }) }

  return {
    connected,
    on,
    connect,
    close,
    send,
    sendChat,
    sendOffer,
    sendAnswer,
    sendIce,
  }
}
