import { onBeforeUnmount, onMounted, watch } from 'vue'

export function useRoomPlayerLifecycle({
  routeRomId,
  booted,
  roomHostInputConfigSnapshot,
  shouldSuggestRotate,
  showRotateHintFor,
  startViewport,
  stopViewport,
  closeInputSettings,
  handleRoomKeyboardEvent,
  loadMeta,
  resetForRouteChange,
  startSlowLoadingTimer,
  stopKeyboardTurboLoops,
  connectRoomRuntime,
  disconnectRoomRuntime,
  resetInvites,
  rtc,
  guestKeyHandler,
  goBack,
  isPseudoFullscreen,
}) {
  function onKeyDown(e) {
    // ESC 先用来退出全屏：原生全屏由浏览器处理，CSS 伪全屏时不要误触发返回。
    if (e.key === 'Escape' && !document.fullscreenElement && !isPseudoFullscreen?.value) goBack()
    handleRoomKeyboardEvent(e)
  }

  function onKeyUp(e) {
    handleRoomKeyboardEvent(e)
  }

  watch(() => routeRomId(), (now, prev) => {
    if (!prev || now === prev) return
    resetForRouteChange()
    booted.value = false
    roomHostInputConfigSnapshot.value = null
    resetInvites()
    loadMeta()
  })

  onMounted(() => {
    if (shouldSuggestRotate.value) showRotateHintFor()
    startViewport({ onTouchLayout: closeInputSettings })
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    loadMeta()
    startSlowLoadingTimer({ isBooted: () => booted.value })
    connectRoomRuntime({
      onOffer: async (msg) => { await rtc.handleOffer(msg.from, msg.sdp) },
      onAnswer: async (msg) => { await rtc.handleAnswer(msg.from, msg.sdp) },
      onIce: async (msg) => { await rtc.handleIce(msg.from, msg.candidate) },
      guestKeyHandler,
    })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('keyup', onKeyUp, true)
    stopViewport()
    stopKeyboardTurboLoops()
    disconnectRoomRuntime({ guestKeyHandler })
  })

  return { onKeyDown, onKeyUp }
}