import { computed, onBeforeUnmount, ref } from 'vue'

export function usePlayerViewport() {
  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 768)
  const hasTouchInput = typeof window !== 'undefined'
    && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  const isTouchLayout = computed(() => hasTouchInput && viewportWidth.value < 900)
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