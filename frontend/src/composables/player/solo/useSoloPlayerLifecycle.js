import { onBeforeUnmount, onMounted, watch } from 'vue'

export function useSoloPlayerLifecycle({
  routeRomId,
  booted,
  shouldSuggestRotate,
  showRotateHintFor,
  startViewport,
  stopViewport,
  closeInputSettings,
  handleLocalKeyboardEvent,
  loadMeta,
  resetForRouteChange,
  startSlowLoadingTimer,
  stopKeyboardTurboLoops,
  goBack,
  isPseudoFullscreen,
}) {
  function onKeyDown(e) {
    // ESC 先用来退出全屏：原生全屏由浏览器处理，CSS 伪全屏时不要误触发返回。
    if (e.key === 'Escape' && !document.fullscreenElement && !isPseudoFullscreen?.value) goBack()
    handleLocalKeyboardEvent(e)
  }

  function onKeyUp(e) {
    handleLocalKeyboardEvent(e)
  }

  watch(() => routeRomId(), (now, prev) => {
    if (!prev || now === prev) return
    resetForRouteChange()
    booted.value = false
    loadMeta()
  })

  onMounted(() => {
    if (shouldSuggestRotate.value) showRotateHintFor()
    startViewport({ onTouchLayout: closeInputSettings })
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    loadMeta()
    startSlowLoadingTimer({ isBooted: () => booted.value })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('keyup', onKeyUp, true)
    stopViewport()
    stopKeyboardTurboLoops()
  })

  return { onKeyDown, onKeyUp }
}