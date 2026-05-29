// In-memory room hub. Tracks live peers + their websockets and routes
// signaling traffic between them. The canonical room record lives in MySQL
// (server/db/schema.js:rooms); this module only mirrors transient presence.
//
// Lifecycle policy: rooms in the DB are NEVER auto-closed when the host
// disconnects. The room record lives until the host (or an admin) explicitly
// closes it via the API. Guests and spectators can still join the room while
// the host is away; existing peers remain connected and continue waiting or
// playing until the host returns.

import { nanoid } from 'nanoid'
import { clampMaxPlayers } from './rom-players.js'
import { deleteLiveRoom, getLiveRoom, liveRoomCodes, liveRooms, MAX_PEERS_PER_ROOM, send, setLiveRoom } from './rooms/live-room-store.js'
import { roomState, summary } from './rooms/room-state.js'
import { recalculateControlSeats } from './rooms/room-seat-policy.js'
import { applyChatMessage, buildSignalForward } from './rooms/room-signal-relay.js'

export function ensureRoom(code, row) {
  let r = getLiveRoom(code)
  const effectiveMaxPlayers = clampMaxPlayers(row.effectiveMaxPlayers ?? row.maxPlayers)
  if (!r) {
    r = {
      code,
      hostUserId: row.hostUserId,
      allowPlay: row.allowPlay !== false,
      allowGuestControl: row.allowGuestControl === true,
      platform: row.platform || row.romPlatform || null,
      maxPlayers: row.maxPlayers ?? null,
      effectiveMaxPlayers,
      peers: new Map(),
      chatHistory: [],
    }
    setLiveRoom(code, r)
  } else {
    r.hostUserId = row.hostUserId
    r.allowPlay = row.allowPlay !== false
    r.allowGuestControl = row.allowGuestControl === true
    r.platform = row.platform || row.romPlatform || r.platform || null
    r.maxPlayers = row.maxPlayers ?? r.maxPlayers ?? null
    r.effectiveMaxPlayers = effectiveMaxPlayers
  }
  recalculateControlSeats(r)
  return r
}

export function isHostOnline(code) {
  const room = getLiveRoom(code)
  if (!room) return false
  for (const p of room.peers.values()) if (p.isHost) return true
  return false
}

export function addPeer(code, { user, ws, clientId = null }) {
  const room = getLiveRoom(code)
  if (!room) return null

  // Authed users: dedupe only the same browser tab/session instance. This keeps
  // page-refresh cleanup, while still allowing the same account to open multiple
  // player seats from different tabs/devices for local testing or shared setups.
  if (user?.id && clientId) {
    for (const existing of [...room.peers.values()]) {
      if (existing.userId === user.id && existing.clientId === clientId) {
        try { existing.ws.close(4000, 'superseded') } catch {}
        removePeer(code, existing.id, { keepRoom: true })
      }
    }
  }

  if (room.peers.size >= MAX_PEERS_PER_ROOM) {
    send(ws, { type: 'error', reason: 'room-full' })
    try { ws.close(4008, 'room-full') } catch {}
    return null
  }

  const peerId = nanoid(8)
  const userId = user?.id ?? null
  const username = user?.username ?? `访客-${peerId.slice(0, 4)}`
  const hasActiveHost = room.platform === 'arcade' && [...room.peers.values()].some((p) => p.isHost)
  const isHost = userId != null && userId === room.hostUserId && !hasActiveHost
  const isGuest = !userId
  const peer = { id: peerId, userId, username, isHost, isGuest, clientId, playerIndex: null, canControl: false, ws }
  room.peers.set(peerId, peer)
  recalculateControlSeats(room)
  const assignedPeer = room.peers.get(peerId) || peer

  // Welcome the new peer with its id + current peer list
  send(ws, {
    type: 'welcome',
    peerId,
    isHost: assignedPeer.isHost,
    userId,
    isGuest: !!assignedPeer.isGuest,
    playerIndex: assignedPeer.playerIndex,
    canControl: !!assignedPeer.canControl,
    room: roomState(room),
    peers: [...room.peers.values()].map(summary),
    chat: room.chatHistory.slice(-50),
  })
  // Broadcast arrival to everyone else
  for (const other of room.peers.values()) {
    if (other.id === peerId) continue
    send(other.ws, { type: 'peer-joined', peer: summary(assignedPeer) })
  }
  broadcastPeersUpdated(room)
  return assignedPeer
}

export function removePeer(code, peerId, { keepRoom = false } = {}) {
  const room = getLiveRoom(code)
  if (!room) return
  const gone = room.peers.get(peerId)
  if (!gone) return
  room.peers.delete(peerId)

  if (room.peers.size > 0) {
    recalculateControlSeats(room)
    broadcastPeersUpdated(room)
  }

  // Notify remaining peers. If host went offline, surface `reconnecting:true`
  // so guests see "主机重连中…" rather than a hard "room closed" — the room
  // still exists, host can come back any time and we'll resume.
  for (const other of room.peers.values()) {
    send(other.ws, {
      type: 'peer-left',
      peerId,
      wasHost: gone.isHost,
      reconnecting: gone.isHost,
    })
  }

  // Drop the in-memory entry once everyone is gone. The DB record is kept
  // alive — host or admin must explicitly close the room from the UI. During
  // refresh dedupe, keep the transient shell so the replacement peer can join.
  if (!keepRoom && room.peers.size === 0) deleteLiveRoom(code)
}

export function activeRoomCodes() {
  return liveRoomCodes()
}

export function broadcastRoomClosed(code, { reason = 'room-closed' } = {}) {
  const room = getLiveRoom(code)
  if (!room) return
  for (const peer of room.peers.values()) {
    send(peer.ws, { type: 'room-closed', reason })
    try { peer.ws.close(4001, reason) } catch {}
  }
  deleteLiveRoom(code)
}

export function updateRoomPermissions(code, { allowPlay } = {}) {
  const room = getLiveRoom(code)
  if (!room) return
  if (typeof allowPlay === 'boolean') room.allowPlay = allowPlay
  recalculateControlSeats(room)
  broadcastPeersUpdated(room)
}

export function updateGuestPlayPermissions(allowGuestControl = false) {
  for (const room of liveRooms()) {
    room.allowGuestControl = allowGuestControl === true
    recalculateControlSeats(room)
    broadcastPeersUpdated(room)
  }
}

// Dispatch any inbound message from `fromPeerId`. Recognizes a small signaling
// vocabulary (offer/answer/ice directed to a specific peer, chat broadcast).
export function relay(code, fromPeerId, msg) {
  const room = getLiveRoom(code)
  if (!room) return
  const from = room.peers.get(fromPeerId)
  if (!from) return

  switch (msg.type) {
    case 'chat': {
      const entry = applyChatMessage(room, from, msg)
      if (!entry) return
      for (const peer of room.peers.values()) {
        send(peer.ws, { type: 'chat', ...entry })
      }
      return
    }
    case 'offer':
    case 'answer':
    case 'ice': {
      const fwd = buildSignalForward(room, from, msg)
      if (!fwd) return
      send(fwd.target.ws, fwd.message)
      return
    }
    default:
      return
  }
}

function broadcastPeersUpdated(room) {
  const peers = [...room.peers.values()].map(summary)
  for (const peer of room.peers.values()) {
    send(peer.ws, { type: 'peers-updated', peers, room: roomState(room) })
  }
}
