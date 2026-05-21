import { nextTick } from 'vue'
import { useWebRTC } from '../useWebRTC.js'
import { dispatchP2Button } from './useGuestInputForwarding.js'

// Owns host-side WebRTC invitation and guest-side stream handling. Signaling is
// supplied lazily by useRoomSession so PeerConnection can be created before the
// WebSocket is open.
export function useRoomRtc({ getSignal, portalRef, isHostMode, canControlPeer, attachRemoteStream, setConnectionStatus }) {
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
        dispatchP2Button(data.action, data.button)
      }
    },
    onStateChange: (state) => {
      if (state === 'connected' || state === 'dc:open') setConnectionStatus('已连接')
      else if (state === 'connecting' || state === 'new') setConnectionStatus('握手中…')
      else if (state === 'failed' || state === 'closed') setConnectionStatus('连接断开')
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
  }

  return { rtc, inviteGuest }
}