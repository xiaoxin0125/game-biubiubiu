// Hono websocket upgrade at /api/rooms/:code/ws — validates auth, room and
// short-lived room tickets, then hands the socket off to room-hub for signaling relay.

import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rooms, roms, STATUS } from '../db/schema.js'
import { currentUser, consumeWebSocketTicket } from '../middleware/auth.js'
import { clientIp } from '../middleware/security.js'
import { consumeRoomTicket } from '../room-tickets.js'
import { getSetting } from './settings.js'
import { consumeRateLimit } from '../middleware/rate-limit.js'
import { effectiveMaxPlayersForRom } from '../rom-players.js'
import * as hub from '../room-hub.js'

const WS_MAX_MESSAGE_BYTES = 8192
const WS_MESSAGE_WINDOW_MS = 10_000
const WS_MAX_MESSAGES_PER_WINDOW = 80

export function installRoomsWebSocket(app, upgradeWebSocket) {
  app.get(
    '/api/rooms/:code/ws',
    upgradeWebSocket(async (c) => {
      const code = (c.req.param('code') || '').toUpperCase()
      const roomTicket = c.req.query('roomTicket') || ''
      const ticket = c.req.query('ticket') || ''
      const user = await currentUser(c) || await consumeWebSocketTicket(ticket)
      const roomTicketEntry = consumeRoomTicket(roomTicket, code)

      const row = (await db.select({
        room: rooms,
        rom: roms,
      }).from(rooms)
        .innerJoin(roms, eq(roms.id, rooms.romId))
        .where(and(eq(rooms.code, code), eq(rooms.status, STATUS.normal)))
        .limit(1))[0]
      const roomRow = row?.room
      const romRow = row?.rom

      let peer = null
      let rejectReason = null
      const ip = clientIp(c)
      const connectLimit = consumeRateLimit(`ws-connect:${ip}:${code}`, { windowMs: 60_000, max: 20 })
      if (!connectLimit.ok) rejectReason = 'rate-limited'
      const netplayEnabled = await getSetting('netplayEnabled', '1')
      // Private rooms require a short-lived ticket from /join unless the caller
      // is the host or an admin. Room passwords never travel on the WS URL.
      const isHostOrAdmin = !!user && (user.id === roomRow?.hostUserId || user.role === 'admin')
      const hasValidRoomTicket = !!roomTicketEntry?.canJoin
      if (netplayEnabled !== '1' && user?.role !== 'admin') rejectReason = 'netplay-disabled'
      else if (!roomRow || roomRow.closedAt) rejectReason = 'room-not-found'
      else if (roomRow.passwordHash && !isHostOrAdmin && !hasValidRoomTicket) {
        rejectReason = 'bad-room-ticket'
      }

      return {
        onOpen(_evt, ws) {
          if (rejectReason) {
            try { ws.send(JSON.stringify({ type: 'error', reason: rejectReason })) } catch {}
            ws.close()
            return
          }
          hub.ensureRoom(code, {
            ...roomRow,
            maxPlayers: romRow?.maxPlayers ?? null,
            effectiveMaxPlayers: effectiveMaxPlayersForRom(romRow),
          })
          peer = hub.addPeer(code, { user, ws })
        },
        onMessage(evt, ws) {
          if (!peer) return
          const raw = typeof evt.data === 'string' ? evt.data : ''
          if (!raw || raw.length > WS_MAX_MESSAGE_BYTES) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'message-too-large' })) } catch {}
            try { ws.close(4009, 'message-too-large') } catch {}
            return
          }
          const limit = consumeRateLimit(`ws-msg:${peer.id}`, {
            windowMs: WS_MESSAGE_WINDOW_MS,
            max: WS_MAX_MESSAGES_PER_WINDOW,
          })
          if (!limit.ok) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'rate-limited' })) } catch {}
            try { ws.close(4008, 'rate-limited') } catch {}
            return
          }
          let msg
          try {
            msg = JSON.parse(raw)
          } catch {
            return
          }
          if (!msg || typeof msg.type !== 'string') return
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
