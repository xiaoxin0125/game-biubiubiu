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

const MAX_PEERS_PER_ROOM = 8

// roomCode → { code, hostUserId, peers: Map<peerId, Peer>, chatHistory: [...] }
const rooms = new Map()

function send(ws, msg) {
  try { ws.send(JSON.stringify(msg)) } catch {}
}

function roomState(room) {
  return {
    allowPlay: room.allowPlay,
    maxPlayers: room.maxPlayers ?? null,
    effectiveMaxPlayers: clampMaxPlayers(room.effectiveMaxPlayers ?? room.maxPlayers),
  }
}

export function ensureRoom(code, row) {
  let r = rooms.get(code)
  const effectiveMaxPlayers = clampMaxPlayers(row.effectiveMaxPlayers ?? row.maxPlayers)
  if (!r) {
    r = {
      code,
      hostUserId: row.hostUserId,
      allowPlay: row.allowPlay !== false,
      maxPlayers: row.maxPlayers ?? null,
      effectiveMaxPlayers,
      peers: new Map(),
      chatHistory: [],
    }
    rooms.set(code, r)
  } else {
    r.hostUserId = row.hostUserId
    r.allowPlay = row.allowPlay !== false
    r.maxPlayers = row.maxPlayers ?? r.maxPlayers ?? null
    r.effectiveMaxPlayers = effectiveMaxPlayers
  }
  recalculateControlSeats(r)
  return r
}

export function isHostOnline(code) {
  const room = rooms.get(code)
  if (!room) return false
  for (const p of room.peers.values()) if (p.isHost) return true
  return false
}

export function addPeer(code, { user, ws }) {
  const room = rooms.get(code)
  if (!room) return null

  // Authed users: dedupe any ghost socket from the same user id (page refresh
  // race). Keep the transient room object even when this was the only peer;
  // otherwise a solo host refresh removes the room from the hub before the new
  // socket is added, leaving signaling/routing with a disconnected Map entry.
  if (user?.id) {
    for (const existing of [...room.peers.values()]) {
      if (existing.userId === user.id) {
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
  const isHost = userId != null && userId === room.hostUserId
  const isGuest = !userId
  const peer = { id: peerId, userId, username, isHost, isGuest, playerIndex: null, canControl: false, ws }
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
  const room = rooms.get(code)
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
  if (!keepRoom && room.peers.size === 0) rooms.delete(code)
}

export function activeRoomCodes() {
  return [...rooms.keys()]
}

export function broadcastRoomClosed(code, { reason = 'room-closed' } = {}) {
  const room = rooms.get(code)
  if (!room) return
  for (const peer of room.peers.values()) {
    send(peer.ws, { type: 'room-closed', reason })
    try { peer.ws.close(4001, reason) } catch {}
  }
  rooms.delete(code)
}

export function updateRoomPermissions(code, { allowPlay } = {}) {
  const room = rooms.get(code)
  if (!room) return
  if (typeof allowPlay === 'boolean') room.allowPlay = allowPlay
  recalculateControlSeats(room)
  broadcastPeersUpdated(room)
}

export function updateGuestPlayPermissions() {
  for (const room of rooms.values()) {
    recalculateControlSeats(room)
    broadcastPeersUpdated(room)
  }
}

// Dispatch any inbound message from `fromPeerId`. Recognizes a small signaling
// vocabulary (offer/answer/ice directed to a specific peer, chat broadcast).
export function relay(code, fromPeerId, msg) {
  const room = rooms.get(code)
  if (!room) return
  const from = room.peers.get(fromPeerId)
  if (!from) return

  switch (msg.type) {
    case 'chat': {
      const text = String(msg.text || '').slice(0, 500)
      if (!text) return
      const entry = { from: from.id, fromName: from.username, text, at: Date.now() }
      room.chatHistory.push(entry)
      if (room.chatHistory.length > 200) room.chatHistory.shift()
      for (const peer of room.peers.values()) {
        send(peer.ws, { type: 'chat', ...entry })
      }
      return
    }
    case 'offer':
    case 'answer':
    case 'ice': {
      const target = room.peers.get(msg.to)
      if (!target) return
      if (msg.type === 'offer' && (!from.isHost || target.isHost)) return
      if (msg.type === 'answer' && (from.isHost || !target.isHost)) return
      if (msg.type === 'ice' && !from.isHost && !target.isHost) return
      const fwd = { ...msg, from: from.id }
      delete fwd.to
      send(target.ws, fwd)
      return
    }
    default:
      return
  }
}

function getPlayerIndex(room, isHost) {
  if (isHost) return 1
  const max = clampMaxPlayers(room.effectiveMaxPlayers ?? room.maxPlayers)
  for (let seat = 2; seat <= max; seat++) {
    let taken = false
    for (const peer of room.peers.values()) {
      if (!peer.isHost && peer.playerIndex === seat) {
        taken = true
        break
      }
    }
    if (!taken) return seat
  }
  return null
}

function recalculateControlSeats(room) {
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

    const controlEligible = !peer.isGuest && room.allowPlay && nextSeat <= max
    if (controlEligible) {
      peer.canControl = true
      peer.playerIndex = nextSeat++
    } else {
      peer.canControl = false
      peer.playerIndex = null
    }
  }
}

function broadcastPeersUpdated(room) {
  const peers = [...room.peers.values()].map(summary)
  for (const peer of room.peers.values()) {
    send(peer.ws, { type: 'peers-updated', peers, room: roomState(room) })
  }
}

function summary(peer) {
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
