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

/*
 * 房间的下发形态。默认**不下发** hostUserId：公开房间列表是匿名可读的，把房主的
 * 内部用户 ID 摆给爬虫没有收益（2026-10-16 重审 N-4）。需要"这是不是我主持的房间"
 * 的地方走 `isMine`（按当前登录用户现算），需要原样带上房主 ID 的单个房间接口
 * （创建 / 加入 / 编辑的返回值）由调用方通过 extras 显式传入 hostUserId。
 */
export function serializeRoom(row, extras = {}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isPublic: Boolean(row.isPublic),
    allowPlay: row.allowPlay === undefined ? true : Boolean(row.allowPlay),
    hasPassword: !!row.passwordHash,
    romId: row.romId,
    maxPlayers: extras.maxPlayers ?? null,
    effectiveMaxPlayers: extras.effectiveMaxPlayers ?? extras.maxPlayers ?? 4,
    createdAt: row.createdAt,
    ...extras,
  }
}