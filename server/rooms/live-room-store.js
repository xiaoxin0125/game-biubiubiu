export const MAX_PEERS_PER_ROOM = 8

const rooms = new Map()

export function send(ws, msg) {
  try { ws.send(JSON.stringify(msg)) } catch {}
}

export function getLiveRoom(code) {
  return rooms.get(code)
}

export function setLiveRoom(code, room) {
  rooms.set(code, room)
  return room
}

export function deleteLiveRoom(code) {
  rooms.delete(code)
}

export function liveRoomCodes() {
  return [...rooms.keys()]
}

export function liveRooms() {
  return rooms.values()
}