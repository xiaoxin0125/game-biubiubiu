import { and, eq, isNull } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { rooms, STATUS } from '../db/schema.js'

const makeCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 6)

export const liveRoom = (extra) =>
  extra ? and(eq(rooms.status, STATUS.normal), isNull(rooms.closedAt), extra)
        : and(eq(rooms.status, STATUS.normal), isNull(rooms.closedAt))

export function makeRoomCode() {
  return makeCode()
}

export function serializeRoom(row, extras = {}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isPublic: Boolean(row.isPublic),
    allowPlay: row.allowPlay === undefined ? true : Boolean(row.allowPlay),
    hasPassword: !!row.passwordHash,
    hostUserId: row.hostUserId,
    romId: row.romId,
    maxPlayers: extras.maxPlayers ?? null,
    effectiveMaxPlayers: extras.effectiveMaxPlayers ?? extras.maxPlayers ?? 4,
    createdAt: row.createdAt,
    ...extras,
  }
}