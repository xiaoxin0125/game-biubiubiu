import { clampMaxPlayers } from '../rom-players.js'

export function roomState(room) {
  return {
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