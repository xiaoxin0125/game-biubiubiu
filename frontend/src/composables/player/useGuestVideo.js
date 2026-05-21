import { ref } from 'vue'

// Owns the guest video element lifecycle. A MediaStream arriving does not mean
// pixels are decoded yet, so `remoteStreamActive` flips only on <video> playing.
export function useGuestVideo() {
  const remoteVideoRef = ref(null)
  const remoteStreamActive = ref(false)
  const isMuted = ref(true)

  function attachRemoteStream(stream) {
    const video = remoteVideoRef.value
    if (!video) return
    video.srcObject = stream
    video.muted = true
    isMuted.value = true
    video.play().catch((err) => {
      console.warn('[webrtc] video.play() blocked:', err)
      remoteStreamActive.value = false
    })
  }

  function onVideoPlaying() {
    remoteStreamActive.value = true
  }

  function clearRemoteStream() {
    remoteStreamActive.value = false
    const video = remoteVideoRef.value
    if (video) video.srcObject = null
  }

  async function unmuteRemote() {
    const video = remoteVideoRef.value
    if (!video) return
    try {
      video.muted = false
      await video.play()
      isMuted.value = false
    } catch (err) {
      console.warn('[webrtc] unmute failed:', err)
    }
  }

  return { remoteVideoRef, remoteStreamActive, isMuted, attachRemoteStream, onVideoPlaying, clearRemoteStream, unmuteRemote }
}