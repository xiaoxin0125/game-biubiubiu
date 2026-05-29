// Hono websocket upgrade at /api/rooms/:code/ws — validates auth, room and
// short-lived room tickets, then hands the socket off to room-hub for signaling relay.

import * as hub from '../room-hub.js'
import {
  consumeRoomWsMessageLimit,
  hubRoomSnapshot,
  parseRoomWsMessage,
  readRoomWsRawMessage,
  resolveRoomWebSocketAdmission,
} from '../rooms/room-ws-gate.js'

export function installRoomsWebSocket(app, upgradeWebSocket) {
  app.get(
    '/api/rooms/:code/ws',
    upgradeWebSocket(async (c) => {
      const {
        code,
        clientId,
        user,
        roomRow,
        romRow,
        guestPlayEnabled,
        rejectReason,
      } = await resolveRoomWebSocketAdmission(c)

      let peer = null

      return {
        onOpen(_evt, ws) {
          if (rejectReason) {
            try { ws.send(JSON.stringify({ type: 'error', reason: rejectReason })) } catch {}
            ws.close()
            return
          }
          hub.ensureRoom(code, hubRoomSnapshot({ roomRow, romRow, guestPlayEnabled }))
          peer = hub.addPeer(code, { user, ws, clientId })
        },
        onMessage(evt, ws) {
          if (!peer) return
          const { raw, rejectReason: messageRejectReason, closeCode } = readRoomWsRawMessage(evt)
          if (messageRejectReason) {
            try { ws.send(JSON.stringify({ type: 'error', reason: messageRejectReason })) } catch {}
            try { ws.close(closeCode, messageRejectReason) } catch {}
            return
          }
          const limit = consumeRoomWsMessageLimit(peer.id)
          if (!limit.ok) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'rate-limited' })) } catch {}
            try { ws.close(4008, 'rate-limited') } catch {}
            return
          }
          const msg = parseRoomWsMessage(raw)
          if (!msg) return
          hub.relay(code, peer.id, msg)
        },
        onClose() {
          if (peer) hub.removePeer(code, peer.id)
          peer = null
        },
        onError() {
          if (peer) hub.removePeer(code, peer.id)
          peer = null
        },
      }
    }),
  )
}
