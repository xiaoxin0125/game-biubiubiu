import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rooms, roms, STATUS } from '../db/schema.js'
import { currentUser, consumeWebSocketTicket } from '../middleware/auth.js'
import { clientIp } from '../middleware/security.js'
import { consumeRoomTicket } from '../room-tickets.js'
import { getSetting } from '../routes/settings.js'
import { consumeRateLimit } from '../middleware/rate-limit.js'
import { effectiveMaxPlayersForRom } from '../rom-players.js'

export const WS_MAX_MESSAGE_BYTES = 8192
export const WS_MESSAGE_WINDOW_MS = 10_000
export const WS_MAX_MESSAGES_PER_WINDOW = 80

export async function resolveRoomWebSocketAdmission(c) {
  const code = (c.req.param('code') || '').toUpperCase()
  const roomTicket = c.req.query('roomTicket') || ''
  const ticket = c.req.query('ticket') || ''
  const clientId = String(c.req.query('clientId') || '').slice(0, 80)
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

  let rejectReason = null
  const ip = clientIp(c)
  const connectLimit = consumeRateLimit(`ws-connect:${ip}:${code}`, { windowMs: 60_000, max: 20 })
  if (!connectLimit.ok) rejectReason = 'rate-limited'
  const netplayEnabled = await getSetting('netplayEnabled', '1')
  const guestPlayEnabled = await getSetting('guestPlayEnabled', '0')
  const isHostOrAdmin = !!user && (user.id === roomRow?.hostUserId || user.role === 'admin')
  const hasValidRoomTicket = !!roomTicketEntry?.canJoin
  if (netplayEnabled !== '1' && user?.role !== 'admin') rejectReason = 'netplay-disabled'
  else if (!roomRow || roomRow.closedAt) rejectReason = 'room-not-found'
  else if (roomRow.passwordHash && !isHostOrAdmin && !hasValidRoomTicket) {
    rejectReason = 'bad-room-ticket'
  }

  return {
    code,
    clientId,
    user,
    roomRow,
    romRow,
    guestPlayEnabled,
    rejectReason,
  }
}

export function hubRoomSnapshot({ roomRow, romRow, guestPlayEnabled }) {
  return {
    ...roomRow,
    maxPlayers: romRow?.maxPlayers ?? null,
    effectiveMaxPlayers: effectiveMaxPlayersForRom(romRow),
    platform: romRow?.platform || null,
    allowGuestControl: guestPlayEnabled === '1',
  }
}

export function readRoomWsRawMessage(evt) {
  const raw = typeof evt.data === 'string' ? evt.data : ''
  if (!raw || raw.length > WS_MAX_MESSAGE_BYTES) {
    return { raw, rejectReason: 'message-too-large', closeCode: 4009 }
  }
  return { raw, rejectReason: null, closeCode: null }
}

export function consumeRoomWsMessageLimit(peerId) {
  return consumeRateLimit(`ws-msg:${peerId}`, {
    windowMs: WS_MESSAGE_WINDOW_MS,
    max: WS_MAX_MESSAGES_PER_WINDOW,
  })
}

export function parseRoomWsMessage(raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }
  if (!msg || typeof msg.type !== 'string') return null
  return msg
}