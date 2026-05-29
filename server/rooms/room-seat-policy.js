import { clampMaxPlayers } from '../rom-players.js'

export function recalculateControlSeats(room) {
  normalizeArcadeHostSeat(room)

  const max = clampMaxPlayers(room.effectiveMaxPlayers ?? room.maxPlayers)
  for (const peer of room.peers.values()) {
    if (peer.isHost) {
      peer.canControl = true
      peer.playerIndex = 1
    }
  }

  let nextSeat = 2
  for (const peer of room.peers.values()) {
    if (peer.isHost) continue

    const controlEligible = room.allowPlay && nextSeat <= max && (room.allowGuestControl || !peer.isGuest)
    if (controlEligible) {
      peer.canControl = true
      peer.playerIndex = nextSeat++
    } else {
      peer.canControl = false
      peer.playerIndex = null
    }
  }
}

export function normalizeArcadeHostSeat(room) {
  if (room.platform !== 'arcade') return

  const hosts = [...room.peers.values()].filter((peer) => peer.isHost)
  if (hosts.length > 1) {
    for (const peer of hosts.slice(1)) peer.isHost = false
  }
  if (hosts.length) return

  const fallbackHost = [...room.peers.values()].find((peer) => peer.userId != null && peer.userId === room.hostUserId)
  if (fallbackHost) fallbackHost.isHost = true
}