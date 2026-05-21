// Hono websocket upgrade at /api/rooms/:code/ws — validates auth + room +
// password, then hands the socket off to room-hub for signaling relay.

import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { rooms, STATUS } from '../db/schema.js'
import { currentUser, consumeWebSocketTicket } from '../middleware/auth.js'
import { getSetting } from './settings.js'
import { consumeRateLimit } from '../middleware/rate-limit.js'
import * as hub from '../room-hub.js'

const WS_MAX_MESSAGE_BYTES = 8192
const WS_MESSAGE_WINDOW_MS = 10_000
const WS_MAX_MESSAGES_PER_WINDOW = 80

export function installRoomsWebSocket(app, upgradeWebSocket) {
  app.get(
    '/api/rooms/:code/ws',
    upgradeWebSocket(async (c) => {
      const code = (c.req.param('code') || '').toUpperCase()
      const password = c.req.query('password') || ''
      const ticket = c.req.query('ticket') || ''
      const user = await currentUser(c) || await consumeWebSocketTicket(ticket)

      const row = (await db.select().from(rooms)
        .where(and(eq(rooms.code, code), eq(rooms.status, STATUS.normal)))
        .limit(1))[0]

      let peer = null
      let rejectReason = null
      const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'unknown'
      const connectLimit = consumeRateLimit(`ws-connect:${ip}:${code}`, { windowMs: 60_000, max: 20 })
      if (!connectLimit.ok) rejectReason = 'rate-limited'
      const netplayEnabled = await getSetting('netplayEnabled', '1')
      // Anonymous visitors may spectate rooms; private rooms still require the
      // password below. Only authenticated non-host players can receive control.
      const isHostOrAdmin = !!user && (user.id === row?.hostUserId || user.role === 'admin')
      if (netplayEnabled !== '1' && user?.role !== 'admin') rejectReason = 'netplay-disabled'
      else if (!row || row.closedAt) rejectReason = 'room-not-found'
      else if (row.passwordHash && !isHostOrAdmin) {
        const ok = await bcrypt.compare(password, row.passwordHash)
        if (!ok) rejectReason = 'bad-password'
      }

      return {
        onOpen(_evt, ws) {
          if (rejectReason) {
            try { ws.send(JSON.stringify({ type: 'error', reason: rejectReason })) } catch {}
            ws.close()
            return
          }
          hub.ensureRoom(code, row)
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
