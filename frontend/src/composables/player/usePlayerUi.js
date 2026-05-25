import { onBeforeUnmount, ref } from 'vue'

export function usePlayerUi() {
  const showRotateHint = ref(false)
  const showInput = ref(false)
  const toastText = ref('')
  const fatalError = ref(null)
  const loadingSlow = ref(false)

  let toastTimer = null
  let rotateHintTimer = null
  let slowTimer = null

  function openInputSettings({ blocked = false } = {}) {
    if (blocked) return
    showInput.value = true
  }

  function closeInputSettings() {
    showInput.value = false
  }

  function showToast(text, duration = 1600) {
    toastText.value = text
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastText.value = '' }, duration)
  }

  function setFatalError(message) {
    fatalError.value = message
  }

  function clearFatalError() {
    fatalError.value = null
  }

  function showRotateHintFor(duration = 3500) {
    showRotateHint.value = true
    if (rotateHintTimer) clearTimeout(rotateHintTimer)
    rotateHintTimer = setTimeout(() => { showRotateHint.value = false }, duration)
  }

  function hideRotateHint() {
    showRotateHint.value = false
    if (rotateHintTimer) {
      clearTimeout(rotateHintTimer)
      rotateHintTimer = null
    }
  }

  function startSlowLoadingTimer({ isBooted, delay = 30000 } = {}) {
    stopSlowLoadingTimer()
    slowTimer = setTimeout(() => {
      if (!isBooted?.()) loadingSlow.value = true
    }, delay)
  }

  function stopSlowLoadingTimer() {
    if (!slowTimer) return
    clearTimeout(slowTimer)
    slowTimer = null
  }

  function markBooted() {
    loadingSlow.value = false
    stopSlowLoadingTimer()
  }

  function dispose() {
    if (toastTimer) clearTimeout(toastTimer)
    if (rotateHintTimer) clearTimeout(rotateHintTimer)
    stopSlowLoadingTimer()
    toastTimer = null
    rotateHintTimer = null
  }

  onBeforeUnmount(dispose)

  return {
    showRotateHint,
    showInput,
    toastText,
    fatalError,
    loadingSlow,
    openInputSettings,
    closeInputSettings,
    showToast,
    setFatalError,
    clearFatalError,
    showRotateHintFor,
    hideRotateHint,
    startSlowLoadingTimer,
    stopSlowLoadingTimer,
    markBooted,
    dispose,
  }
}