import { randomBytes } from 'node:crypto'

const ROOM_TICKET_TTL_MS = 60 * 1000
const tickets = new Map()

function newToken() {
  return randomBytes(32).toString('base64url')
}

export function createRoomTicket({ code, userId = null, canJoin = false }) {
  cleanupRoomTickets()
  const ticket = newToken()
  tickets.set(ticket, {
    code: String(code || '').toUpperCase(),
    userId,
    canJoin: !!canJoin,
    expiresAt: Date.now() + ROOM_TICKET_TTL_MS,
  })
  return ticket
}

export function consumeRoomTicket(ticket, code) {
  if (!ticket) return null
  const entry = tickets.get(ticket)
  tickets.delete(ticket)
  if (!entry || entry.expiresAt < Date.now()) return null
  if (entry.code !== String(code || '').toUpperCase()) return null
  return entry
}

export function clearRoomTicketsForUser(userId) {
  for (const [ticket, entry] of tickets.entries()) {
    if (entry.userId === userId) tickets.delete(ticket)
  }
}

export function cleanupRoomTickets() {
  const now = Date.now()
  for (const [ticket, entry] of tickets.entries()) {
    if (entry.expiresAt < now) tickets.delete(ticket)
  }
}