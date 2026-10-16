/*
 * 房间密码的规则。
 *
 * 与后端 server/routes/rooms.js 的 ROOM_PASSWORD_MIN 一致：私有房间的口令就是它
 * 的全部保护，太短的口令换 IP 慢速爆破就能试完（2026-10-16 重审 N-2）。
 *
 * 只约束"新设置的密码"（建房间、改密码）：已经在用的旧密码照常校验，否则房主会被
 * 自己的老口令锁在房间外面。加入房间时也不做长度校验，原因同上 —— 老房间可能就
 * 是短口令，拦在客户端等于拦住房主自己。
 */
export const ROOM_PASSWORD_MIN = 4

/** 新密码的校验提示；返回空字符串表示没问题。 */
export function roomPasswordError(password) {
  if (typeof password !== 'string' || !password) return ''
  return password.length < ROOM_PASSWORD_MIN ? `房间密码至少 ${ROOM_PASSWORD_MIN} 位` : ''
}
