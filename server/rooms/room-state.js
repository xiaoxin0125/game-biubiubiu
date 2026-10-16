import { clampMaxPlayers } from '../rom-players.js'

export function roomState(room) {
  return {
    // 房间名：联机房间的顶栏与房间面板要显示它（点名字复制房间码）
    name: room.name || '',
    allowPlay: room.allowPlay,
    maxPlayers: room.maxPlayers ?? null,
    effectiveMaxPlayers: clampMaxPlayers(room.effectiveMaxPlayers ?? room.maxPlayers),
  }
}

export function summary(peer) {
  return {
    id: peer.id,
    userId: peer.userId,
    username: peer.username,
    isHost: peer.isHost,
    isGuest: !!peer.isGuest,
    playerIndex: peer.playerIndex,
    canControl: !!peer.canControl,
  }
}
