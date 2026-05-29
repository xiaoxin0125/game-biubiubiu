export const ROOM_SIGNAL_EVENTS = Object.freeze({
  welcome: 'welcome',
  peerJoined: 'peer-joined',
  peersUpdated: 'peers-updated',
  peerLeft: 'peer-left',
  chat: 'chat',
  roomClosed: 'room-closed',
  error: 'error',
  closed: 'closed',
  offer: 'offer',
  answer: 'answer',
  ice: 'ice',
})

export const ROOM_WS_QUERY_KEYS = Object.freeze({
  roomTicket: 'roomTicket',
  ticket: 'ticket',
  clientId: 'clientId',
})

export const ROOM_CLOSED_REASONS = Object.freeze({
  netplayDisabled: 'netplay-disabled',
  hostDeleted: 'host-deleted',
  romSoftDeleted: 'rom-soft-deleted',
  romPermanentlyDeleted: 'rom-permanently-deleted',
  roomClosed: 'room-closed',
})