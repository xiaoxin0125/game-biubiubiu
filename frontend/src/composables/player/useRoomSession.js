import { computed, reactive, ref, watch } from 'vue'
import { useRoomSignal } from '../useRoomSignal.js'

// Owns WebSocket room membership, peer list, chat and room-level errors.
// Media transport is delegated to useRoomRtc so signaling remains independent
// from RTCPeerConnection and browser capture APIs.
export function useRoomSession({ roomCode, router, inviteGuest, closePeer, clearRemoteStream, showToast, onRoomClosed }) {
  const signalConnected = ref(false)
  const signalMe = ref(null)
  const signalPeers = reactive({})
  const signalChat = ref([])
  const showRoom = ref(false)
  const fatalRoomError = ref(null)
  const connectionStatus = ref('建立连接…')
  const roomAllowPlay = ref(true)

  let signal = null
  const isRoomMode = !!roomCode
  const isHostMode = computed(() => isRoomMode && !!signalMe.value?.isHost)
  const isGuestMode = computed(() => isRoomMode && signalMe.value && !signalMe.value.isHost)
  const currentRoomPeer = computed(() => {
    if (!signalMe.value?.peerId) return null
    return signalPeers[signalMe.value.peerId] || signalMe.value
  })

  function setConnectionStatus(value) {
    connectionStatus.value = value
  }

  function sendChat(text) {
    signal?.sendChat(text)
  }

  function roomClosedMessage(reason) {
    return ({
      'netplay-disabled': '管理员已关闭对战功能',
      'host-deleted': '房主账号已被管理员删除',
      'rom-soft-deleted': '房间 ROM 已被移入回收站',
      'rom-permanently-deleted': '房间 ROM 已被永久删除',
      'room-closed': '房间已关闭',
    })[reason] || '房间已关闭'
  }

  function connect() {
    if (!isRoomMode || signal) return signal
    const password = sessionStorage.getItem(`room:${roomCode}:pw`) || ''
    signal = useRoomSignal({ code: roomCode, password })

    signal.on('welcome', (msg) => {
      signalMe.value = {
        peerId: msg.peerId,
        isHost: msg.isHost,
        userId: msg.userId,
        isGuest: !!msg.isGuest,
        playerIndex: msg.playerIndex,
        canControl: !!msg.canControl,
      }
      for (const id of Object.keys(signalPeers)) delete signalPeers[id]
      for (const p of msg.peers || []) signalPeers[p.id] = p
      if (!signalPeers[msg.peerId]) signalPeers[msg.peerId] = { ...signalMe.value, id: msg.peerId }
      signalChat.value = Array.isArray(msg.chat) ? msg.chat.slice(-50) : []
      roomAllowPlay.value = msg.room?.allowPlay !== false
      const hostPresent = msg.isHost || (msg.peers || []).some((p) => p.isHost)
      if (msg.isHost) connectionStatus.value = '等待玩家加入…'
      else connectionStatus.value = hostPresent ? '等待主机画面…' : '等待主机加入…'
      showRoom.value = true
      if (msg.isHost) {
        for (const p of msg.peers || []) {
          if (!p.isHost && p.id !== msg.peerId) inviteGuest(p.id)
        }
      }
    })

    signal.on('peer-joined', (msg) => {
      signalPeers[msg.peer.id] = msg.peer
      if (msg.peer?.isHost && !signalMe.value?.isHost) {
        connectionStatus.value = '主机已加入，正在连接画面…'
      }
      if (signalMe.value?.isHost && msg.peer && !msg.peer.isHost) inviteGuest(msg.peer.id)
    })

    signal.on('peers-updated', (msg) => {
      for (const id of Object.keys(signalPeers)) delete signalPeers[id]
      for (const p of msg.peers || []) signalPeers[p.id] = p
      if (msg.room && typeof msg.room.allowPlay === 'boolean') roomAllowPlay.value = msg.room.allowPlay
      const me = signalMe.value?.peerId ? signalPeers[signalMe.value.peerId] : null
      if (me) {
        signalMe.value = {
          ...signalMe.value,
          isGuest: !!me.isGuest,
          playerIndex: me.playerIndex,
          canControl: !!me.canControl,
        }
      }
    })

    signal.on('peer-left', (msg) => {
      delete signalPeers[msg.peerId]
      closePeer(msg.peerId)
      if (msg.wasHost && !signalMe.value?.isHost) {
        clearRemoteStream()
        showToast(msg.reconnecting ? '主机重连中…' : '房主已离开')
        connectionStatus.value = msg.reconnecting ? '等待主机回来…' : '房主已离开'
      }
    })

    signal.on('chat', (msg) => {
      signalChat.value.push({ from: msg.from, fromName: msg.fromName, text: msg.text, at: msg.at })
    })
    signal.on('room-closed', (msg) => {
      clearRemoteStream()
      onRoomClosed?.()
      showToast(roomClosedMessage(msg?.reason))
      setTimeout(() => router.push('/rooms'), 1500)
    })
    signal.on('error', (msg) => {
      fatalRoomError.value = ({
        'netplay-disabled': '管理员已关闭对战功能',
        'room-not-found': '房间不存在或已关闭',
        'bad-password': '房间密码错误',
        'host-offline': '房主不在线，请稍后再试',
      })[msg.reason] || (`信令错误：${msg.reason}`)
    })
    signal.on('closed', () => { signalConnected.value = false })
    signal.connect()
    watch(signal.connected, (value) => { signalConnected.value = value })
    return signal
  }

  function close() {
    try { signal?.close() } catch {}
    signal = null
  }

  return { signal: () => signal, signalConnected, signalMe, signalPeers, signalChat, showRoom, fatalRoomError, connectionStatus, roomAllowPlay, isHostMode, isGuestMode, currentRoomPeer, setConnectionStatus, sendChat, connect, close }
}