import { ref, onBeforeUnmount, watch } from 'vue'
import { effectiveKeyboardForPlayer, gamepadMappingFor, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS } from './useInputMapping.js'
import { dispatchKeyboardEvent } from './dispatchKeyboardEvent.js'

// Polls navigator.getGamepads() each animation frame. Local play uses physical
// slot #1 → P1 and slot #2 → P2; slot #3+ is ignored. Room play can force every
// local physical pad into the current room role so no pad can control another
// seat by device order.
export function useGamepads({
  mapping,
  onButton,
  pressButton,
  releaseButton,
  maxLocalPlayers = 1,
  playerResolver = null,
  platformButtons = null,
} = {}) {
  const connected = ref(false)
  const padCount = ref(0)

  let rafId = null
  const state = Object.create(null)   // "padIndex:buttonIndex" → pressed?
  const turboLoops = new Map()        // btn → setInterval id

  function releaseTrackedButtons() {
    const activePads = getPhysicalPads()
    for (const key of Object.keys(state)) {
      if (!state[key]) {
        delete state[key]
        continue
      }
      const [padIndexRaw, buttonIndexRaw] = key.split(':')
      const padIndex = Number(padIndexRaw)
      const buttonIndex = Number(buttonIndexRaw)
      const padPosition = activePads.findIndex((pad) => pad.index === padIndex)
      const slot = padPosition >= 0 ? padPosition + 1 : 1
      const player = resolvePlayer(slot, activePads[padPosition])
      const btn = buttonFromIndex(buttonIndex, slot)
      if (btn && player) {
        const handled = onButton ? !!onButton('up', btn, player, slot) : false
        if (!handled) dispatchMappedButton('keyup', btn, player)
      }
      delete state[key]
    }
    for (const [loopKey, active] of turboLoops.entries()) {
      clearInterval(active.loop)
      turboLoops.delete(loopKey)
      if (releaseButton) releaseButton(active.targetBtn, active.player || 1)
      else {
        const key = keyboardForPlayer(active.player || 1)[active.targetBtn]
        if (key) dispatchKey('keyup', key)
      }
    }
  }

  function poll() {
    const pads = getPhysicalPads()
    padCount.value = pads.length
    connected.value = pads.length > 0

    const playerLimit = Math.max(1, Math.min(2, Number(maxLocalPlayers?.value ?? maxLocalPlayers) || 1))
    const activeLimit = playerResolver ? Math.min(2, pads.length) : Math.min(playerLimit, 2, pads.length)

    for (const pad of pads.slice(0, activeLimit)) {
      const slot = pads.indexOf(pad) + 1
      const player = resolvePlayer(slot, pad)
      if (!player) continue
      for (let i = 0; i < pad.buttons.length; i++) {
        const pressed = pad.buttons[i].pressed
        const k = pad.index + ':' + i
        if (pressed === !!state[k]) continue
        state[k] = pressed

        const btn = buttonFromIndex(i, slot)
        if (!btn) continue
        const handled = onButton ? !!onButton(pressed ? 'down' : 'up', btn, player, slot) : false
        if (handled) continue
        dispatchMappedButton(pressed ? 'keydown' : 'keyup', btn, player)
      }
    }
    rafId = requestAnimationFrame(poll)
  }

  function getPhysicalPads() {
    return (navigator.getGamepads?.() || []).filter(Boolean)
  }

  function resolvePlayer(slot, pad) {
    if (typeof playerResolver === 'function') {
      const resolved = Number(playerResolver(slot, pad))
      return Number.isInteger(resolved) && resolved >= 1 ? resolved : null
    }
    const playerLimit = Math.max(1, Math.min(2, Number(maxLocalPlayers?.value ?? maxLocalPlayers) || 1))
    return slot <= playerLimit ? slot : null
  }

  function buttonFromIndex(buttonIndex, slot) {
    const reverseMap = invertGamepadMap(gamepadMappingFor(mapping?.value, slot))
    return reverseMap[buttonIndex]
  }

  function keyboardForPlayer(player = 1) {
    return effectiveKeyboardForPlayer(mapping?.value, player)
  }

  function invertGamepadMap(gpMap) {
    const allowed = platformButtons?.value ? new Set(platformButtons.value) : null
    const out = {}
    for (const [btn, idx] of Object.entries(gpMap || {})) {
      if (allowed && !allowed.has(btn)) continue
      if (typeof idx === 'number') out[idx] = btn
    }
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
    const key = keyboardForPlayer(player)[btn]
    if (key) dispatchKey(type, key)
  }

  function startTurbo(btn, targetBtn, player = 1) {
    const loopKey = `${player}:${btn}`
    if (turboLoops.has(loopKey)) return
    const emit = (down) => {
      if (down && pressButton) pressButton(targetBtn, player)
      else if (!down && releaseButton) releaseButton(targetBtn, player)
      else {
        const key = keyboardForPlayer(player)[targetBtn]
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
      const key = keyboardForPlayer(player)[targetBtn]
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
