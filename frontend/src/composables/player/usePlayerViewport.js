import { computed, onBeforeUnmount, ref } from 'vue'
import { hasTouchScreen, isTouchDeviceLayout } from '../touchLayout.js'

export function usePlayerViewport() {
  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 768)
  const hasTouchInput = hasTouchScreen()

  // 触屏布局按「短边」判定：手机横屏后宽度会超过 900，但短边仍是 400 左右，
  // 所以横屏时依旧是移动端布局（虚拟手柄、隐藏键鼠设置）。
  const isTouchLayout = computed(() => isTouchDeviceLayout(viewportWidth.value, viewportHeight.value))
  const shouldSuggestRotate = computed(() => viewportWidth.value < 768 && viewportHeight.value > viewportWidth.value)

  function updateViewportSize() {
    if (typeof window === 'undefined') return
    viewportWidth.value = window.innerWidth
    viewportHeight.value = window.innerHeight
  }

  function mountViewportListeners({ onTouchLayout } = {}) {
    if (typeof window === 'undefined') return
    const update = () => {
      updateViewportSize()
      if (isTouchLayout.value) onTouchLayout?.()
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    update()

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }

  let unlisten = null

  function start(options) {
    stop()
    unlisten = mountViewportListeners(options) || null
  }

  function stop() {
    if (!unlisten) return
    unlisten()
    unlisten = null
  }

  onBeforeUnmount(stop)

  return {
    viewportWidth,
    viewportHeight,
    hasTouchInput,
    isTouchLayout,
    shouldSuggestRotate,
    updateViewportSize,
    start,
    stop,
  }
}