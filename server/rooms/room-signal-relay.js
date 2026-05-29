export function applyChatMessage(room, from, msg, now = Date.now()) {
  const text = String(msg.text || '').slice(0, 500)
  if (!text) return null
  const entry = { from: from.id, fromName: from.username, text, at: now }
  room.chatHistory.push(entry)
  if (room.chatHistory.length > 200) room.chatHistory.shift()
  return entry
}

export function buildSignalForward(room, from, msg) {
  const target = room.peers.get(msg.to)
  if (!target) return null
  if (msg.type === 'offer' && (!from.isHost || target.isHost)) return null
  if (msg.type === 'answer' && (from.isHost || !target.isHost)) return null
  if (msg.type === 'ice' && !from.isHost && !target.isHost) return null
  const fwd = { ...msg, from: from.id }
  delete fwd.to
  return { target, message: fwd }
}