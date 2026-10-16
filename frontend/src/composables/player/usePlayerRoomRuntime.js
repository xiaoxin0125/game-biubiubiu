import { computed, watch } from 'vue'
import { useGuestVideo } from './useGuestVideo.js'
import { useRoomRtc } from './useRoomRtc.js'
import { useRoomSession } from './useRoomSession.js'

export function usePlayerRoomRuntime({
  roomCode,
  router,
  portalRef,
  isRoomMode,
  booted,
  remoteKeyMapForPlayer,
  turboTargetsForPlayer,
  dispatchRemoteInput,
  setFatalError,
  showToast,
}) {
  let rtc = null
  let inviteRoomGuest = () => {}
  const invitedRoomPeers = new Set()

  const {
    remoteVideoRef,
    remoteStreamActive,
    isMuted,
    attachRemoteStream,
    onVideoPlaying,
    clearRemoteStream,
    unmuteRemote,
  } = useGuestVideo()

  const roomSession = useRoomSession({
    roomCode,
    router,
    inviteGuest: (peerId) => inviteRoomGuest(peerId),
    closePeer: (peerId) => rtc?.closePeer(peerId),
    clearRemoteStream,
    showToast,
    onRoomClosed: () => { try { rtc?.close() } catch {} },
  })

  const {
    signalConnected,
    signalMe,
    signalPeers,
    signalChat,
    showRoom,
    fatalRoomError,
    connectionStatus,
    roomAllowPlay,
    roomName,
    isHostMode,
    isGuestMode,
    currentRoomPeer,
    setConnectionStatus,
    sendChat,
  } = roomSession

  watch(fatalRoomError, (message) => {
    if (message) setFatalError(message)
  })

  const roomRtc = useRoomRtc({
    getSignal: () => roomSession.signal(),
    portalRef,
    isHostMode,
    playerIndexForPeer: (peerId) => signalPeers[peerId]?.playerIndex,
    canControlPeer: (peerId) => signalPeers[peerId]?.canControl === true,
    remoteKeyMapForPlayer,
    turboTargetsForPlayer,
    dispatchRemoteInput,
    attachRemoteStream,
    setConnectionStatus,
  })
  rtc = roomRtc.rtc
  inviteRoomGuest = roomRtc.inviteGuest

  const canLocalControl = computed(() => {
    if (!isRoomMode || !signalMe.value || signalMe.value.isHost) return false
    return currentRoomPeer.value?.canControl === true
  })

  function roomGamepadPlayer() {
    if (!isRoomMode) return null
    if (isHostMode.value) return 1
    if (!canLocalControl.value) return null
    const playerIndex = Number(currentRoomPeer.value?.playerIndex || signalMe.value?.playerIndex)
    return Number.isInteger(playerIndex) && playerIndex >= 2 && playerIndex <= 4 ? playerIndex : null
  }

  function inviteConnectedRoomPeers({ booted }) {
    if (!isRoomMode || !isHostMode.value || !booted) return
    for (const peer of Object.values(signalPeers)) {
      if (!peer || peer.isHost || peer.id === signalMe.value?.peerId) continue
      if (invitedRoomPeers.has(peer.id)) continue
      invitedRoomPeers.add(peer.id)
      setConnectionStatus('正在连接玩家画面…')
      inviteRoomGuest(peer.id)
      setTimeout(() => {
        if (invitedRoomPeers.has(peer.id)) inviteRoomGuest(peer.id)
      }, 2000)
    }
  }

  function connect({ onOffer, onAnswer, onIce, guestKeyHandler }) {
    if (!isRoomMode) return
    const signal = roomSession.connect()
    if (signal) {
      signal.on('offer', onOffer)
      signal.on('answer', onAnswer)
      signal.on('ice', onIce)
    }
    document.addEventListener('keydown', guestKeyHandler, true)
    document.addEventListener('keyup', guestKeyHandler, true)
  }

  function disconnect({ guestKeyHandler }) {
    document.removeEventListener('keydown', guestKeyHandler, true)
    document.removeEventListener('keyup', guestKeyHandler, true)
    try { rtc?.close() } catch {}
    roomSession.close()
  }

  function resetInvites() {
    invitedRoomPeers.clear()
  }

  watch(() => Object.keys(signalPeers).join('|'), () => {
    inviteConnectedRoomPeers({ booted: !!booted?.value })
  })

  return {
    rtc,
    roomSession,
    signalConnected,
    signalMe,
    signalPeers,
    signalChat,
    showRoom,
    connectionStatus,
    roomAllowPlay,
    roomName,
    isHostMode,
    isGuestMode,
    currentRoomPeer,
    sendChat,
    remoteVideoRef,
    remoteStreamActive,
    isMuted,
    onVideoPlaying,
    unmuteRemote,
    clearRemoteStream,
    canLocalControl,
    roomGamepadPlayer,
    inviteConnectedRoomPeers,
    connect,
    disconnect,
    resetInvites,
  }
}