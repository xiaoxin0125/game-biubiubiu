import { nextTick } from 'vue'
import { useWebRTC } from '../useWebRTC.js'
import { dispatchPlayerButton } from './useGuestInputForwarding.js'

// Owns host-side WebRTC invitation and guest-side stream handling. Signaling is
// supplied lazily by useRoomSession so PeerConnection can be created before the
// WebSocket is open.
export function useRoomRtc({ getSignal, portalRef, isHostMode, playerIndexForPeer, canControlPeer, remoteKeyMapForPlayer, turboTargetsForPlayer, dispatchRemoteInput, attachRemoteStream, setConnectionStatus }) {
  const signalProxy = {
    sendOffer: (...args) => getSignal()?.sendOffer(...args),
    sendAnswer: (...args) => getSignal()?.sendAnswer(...args),
    sendIce: (...args) => getSignal()?.sendIce(...args),
  }

  const rtc = useWebRTC({
    signal: signalProxy,
    onRemoteStream: attachRemoteStream,
    onDataMessage: (data, peerId) => {
      if (isHostMode.value && data?.type === 'input' && data.button) {
        if (!canControlPeer?.(peerId)) return
        const playerIndex = Number(playerIndexForPeer?.(peerId))
        if (!Number.isInteger(playerIndex) || playerIndex < 2 || playerIndex > 4) return
        const keyMap = remoteKeyMapForPlayer?.(playerIndex)
        const turboTargets = turboTargetsForPlayer?.(playerIndex) || null
        const controls = {
          pressButton: (button, player) => portalRef.value?.pressButton?.(button, player),
          releaseButton: (button, player) => portalRef.value?.releaseButton?.(button, player),
        }
        if (dispatchRemoteInput?.({ playerIndex, action: data.action, button: data.button, keyMap, controls, turboTargets }) === true) return
        dispatchPlayerButton(playerIndex, data.action, data.button, keyMap, controls, { turboTargets })
      }
    },
    onStateChange: (state) => {
      if (state === 'connected' || state === 'dc:open' || state === 'ice:connected' || state === 'ice:completed') setConnectionStatus('已连接')
      else if (state === 'connecting' || state === 'new' || state === 'ice:checking' || state === 'ice:new') setConnectionStatus('握手中…')
      else if (state === 'failed' || state === 'ice:failed') setConnectionStatus('连接失败：跨网络需要 TURN 中继')
      else if (state === 'disconnected' || state === 'ice:disconnected') setConnectionStatus('连接中断，正在重试…')
      else if (state === 'closed' || state === 'ice:closed' || state === 'dc:close') setConnectionStatus('连接断开')
    },
  })

  async function inviteGuest(peerId) {
    await nextTick()
    const portal = portalRef.value
    if (!portal) {
      console.warn('[host] no portalRef, cannot invite', peerId)
      return
    }

    // Cold arcade cores can boot slowly. Wait for a capturable canvas before
    // sending the offer; otherwise guests get a valid session with no pixels.
    let canvas = null
    for (let i = 0; i < 134 && !canvas; i++) {
      canvas = portal.canvas
      if (canvas?.captureStream) break
      canvas = null
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    if (!canvas) {
      console.warn('[host] canvas still not ready after 20s, giving up on', peerId)
      return
    }

    const stream = canvas.captureStream(60)
    try {
      const audioStream = portal.captureAudioStream?.()
      if (audioStream) {
        for (const track of audioStream.getAudioTracks()) stream.addTrack(track)
      }
    } catch (err) {
      console.warn('[host] audio capture failed, proceeding video-only', err)
    }

    rtc.startCall(peerId, stream)
    setConnectionStatus('正在发送画面…')
  }

  return { rtc, inviteGuest }
}