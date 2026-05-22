import { ref, onBeforeUnmount, watch } from 'vue'
import { useInputMapping, TURBO_BUTTON_TARGETS } from './useInputMapping.js'
import { dispatchKeyboardEvent } from './dispatchKeyboardEvent.js'

/**
 * Polls navigator.getGamepads() each animation frame and dispatches synthetic
 * KeyboardEvents matching the user's current gamepad→retropad mapping.
 *
 * Solo / host mode: dispatches real keyboard events that Nostalgist listens to.
 * Guest mode: caller provides `onButton` to intercept — when it returns true
 *             we skip keyboard dispatch (guest forwards over DataChannel).
 */
export function useGamepads({ onButton } = {}) {
  const { mapping } = useInputMapping()
  const connected = ref(false)
  const padCount = ref(0)

  let rafId = null
  const state = Object.create(null)   // "padIndex:buttonIndex" → pressed?

  function releaseTrackedButtons() {
    const gpMap = mapping.value.gamepad || {}
    const reverseMap = invertGamepadMap(gpMap)
    for (const key of Object.keys(state)) {
      if (!state[key]) {
        delete state[key]
        continue
      }
      const buttonIndex = Number(key.split(':')[1])
      const btn = reverseMap[buttonIndex]
      if (btn) {
        const handled = onButton ? !!onButton('up', btn) : false
        if (!handled) dispatchMappedButton('keyup', btn)
      }
      delete state[key]
    }
  }

  function poll() {
    const pads = (navigator.getGamepads?.() || []).filter(Boolean)
    padCount.value = pads.length
    connected.value = pads.length > 0

    const pad = pads[0]
    if (pad) {
      const gpMap = mapping.value.gamepad || {}
      const reverseMap = invertGamepadMap(gpMap)

      for (let i = 0; i < pad.buttons.length; i++) {
        const pressed = pad.buttons[i].pressed
        const k = pad.index + ':' + i
        if (pressed === !!state[k]) continue
        state[k] = pressed

        const btn = reverseMap[i]
        if (!btn) continue
        const handled = onButton ? !!onButton(pressed ? 'down' : 'up', btn) : false
        if (handled) continue
        dispatchMappedButton(pressed ? 'keydown' : 'keyup', btn)
      }
    }
    rafId = requestAnimationFrame(poll)
  }

  function invertGamepadMap(gpMap) {
    const out = {}
    for (const [btn, idx] of Object.entries(gpMap)) out[idx] = btn
    return out
  }

  function dispatchMappedButton(type, btn) {
    const turboTarget = TURBO_BUTTON_TARGETS[btn]
    const key = mapping.value.keyboard[turboTarget || btn]
    if (key) dispatchKey(type, key)
  }

  function dispatchKey(type, key) {
    dispatchKeyboardEvent(type, key)
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(poll) }
  function stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null } }

  const onConnect = () => start()
  window.addEventListener('gamepadconnected', onConnect)
  const stopMappingWatch = watch(mapping, () => releaseTrackedButtons(), { deep: true })
  start()

  onBeforeUnmount(() => {
    releaseTrackedButtons()
    stop()
    stopMappingWatch()
    window.removeEventListener('gamepadconnected', onConnect)
  })

  return { connected, padCount }
}
