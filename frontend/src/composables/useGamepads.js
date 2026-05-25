import { ref, onBeforeUnmount, watch } from 'vue'
import { useInputMapping, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS } from './useInputMapping.js'
import { dispatchKeyboardEvent } from './dispatchKeyboardEvent.js'

// Polls navigator.getGamepads() each animation frame and maps connected pads
// to local players by order: pad #1 → P1, pad #2 → P2. Room guests still forward
// their own first pad through the injected interceptor.
export function useGamepads({ onButton, pressButton, releaseButton, maxLocalPlayers = 1 } = {}) {
  const { mapping } = useInputMapping()
  const connected = ref(false)
  const padCount = ref(0)

  let rafId = null
  const state = Object.create(null)   // "padIndex:buttonIndex" → pressed?
  const turboLoops = new Map()        // btn → setInterval id

  function releaseTrackedButtons() {
    const gpMap = mapping.value.gamepad || {}
    const reverseMap = invertGamepadMap(gpMap)
    const activePads = (navigator.getGamepads?.() || []).filter(Boolean)
    for (const key of Object.keys(state)) {
      if (!state[key]) {
        delete state[key]
        continue
      }
      const [padIndexRaw, buttonIndexRaw] = key.split(':')
      const buttonIndex = Number(buttonIndexRaw)
      const btn = reverseMap[buttonIndex]
      if (btn) {
        const padPosition = activePads.findIndex((pad) => pad.index === Number(padIndexRaw))
        const player = padPosition >= 0 ? padPosition + 1 : 1
        const handled = onButton ? !!onButton('up', btn, player) : false
        if (!handled) dispatchMappedButton('keyup', btn, player)
      }
      delete state[key]
    }
    for (const [loopKey, active] of turboLoops.entries()) {
      clearInterval(active.loop)
      turboLoops.delete(loopKey)
      if (releaseButton) releaseButton(active.targetBtn, active.player || 1)
      else {
        const key = mapping.value.keyboard[active.targetBtn]
        if (key) dispatchKey('keyup', key)
      }
    }
  }

  function poll() {
    const pads = (navigator.getGamepads?.() || []).filter(Boolean)
    padCount.value = pads.length
    connected.value = pads.length > 0

    const playerLimit = Math.max(1, Math.min(2, Number(maxLocalPlayers?.value ?? maxLocalPlayers) || 1))
    const gpMap = mapping.value.gamepad || {}
    const reverseMap = invertGamepadMap(gpMap)

    for (const pad of pads.slice(0, playerLimit)) {
      for (let i = 0; i < pad.buttons.length; i++) {
        const pressed = pad.buttons[i].pressed
        const k = pad.index + ':' + i
        if (pressed === !!state[k]) continue
        state[k] = pressed

        const btn = reverseMap[i]
        if (!btn) continue
        const player = pads.indexOf(pad) + 1
        const handled = onButton ? !!onButton(pressed ? 'down' : 'up', btn, player) : false
        if (handled) continue
        dispatchMappedButton(pressed ? 'keydown' : 'keyup', btn, player)
      }
    }
    rafId = requestAnimationFrame(poll)
  }

  function invertGamepadMap(gpMap) {
    const out = {}
    for (const [btn, idx] of Object.entries(gpMap)) out[idx] = btn
    return out
  }

  function dispatchMappedButton(type, btn, player = 1) {
    const turboTarget = TURBO_BUTTON_TARGETS[btn]
    if (turboTarget) {
      if (type === 'keydown') startTurbo(btn, turboTarget, player)
      else stopTurbo(btn, turboTarget, player)
      return
    }
    if (pressButton && releaseButton) {
      if (type === 'keydown') pressButton(btn, player)
      else releaseButton(btn, player)
      return
    }
    const key = mapping.value.keyboard[btn]
    if (key) dispatchKey(type, key)
  }

  function startTurbo(btn, targetBtn, player = 1) {
    const loopKey = `${player}:${btn}`
    if (turboLoops.has(loopKey)) return
    const emit = (down) => {
      if (down && pressButton) pressButton(targetBtn, player)
      else if (!down && releaseButton) releaseButton(targetBtn, player)
      else {
        const key = mapping.value.keyboard[targetBtn]
        if (key) dispatchKey(down ? 'keydown' : 'keyup', key)
      }
    }
    let down = true
    emit(true)
    const loop = setInterval(() => {
      down = !down
      emit(down)
    }, TURBO_FIRE_MS)
    turboLoops.set(loopKey, { loop, targetBtn, down, player })
  }

  function stopTurbo(btn, targetBtn, player = 1) {
    const loopKey = `${player}:${btn}`
    const active = turboLoops.get(loopKey)
    if (active) {
      clearInterval(active.loop)
      turboLoops.delete(loopKey)
    }
    if (releaseButton) releaseButton(targetBtn, player)
    else {
      const key = mapping.value.keyboard[targetBtn]
      if (key) dispatchKey('keyup', key)
    }
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
