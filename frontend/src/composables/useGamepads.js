import { ref, onBeforeUnmount, watch } from 'vue'
import { effectiveKeyboardForPlayer, gamepadMappingFor, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS } from './useInputMapping.js'
import { turboButtonsForPlatform } from '../constants/platforms.js'
import { dispatchKeyboardEvent } from './dispatchKeyboardEvent.js'

const AXIS_DEADZONE = 0.5
const AXIS_DIRECTIONS = [
  { axis: 0, negative: 'left', positive: 'right' },
  { axis: 1, negative: 'up', positive: 'down' },
]

// Polls navigator.getGamepads() each animation frame. Local play uses physical
// slot #1 -> P1 and slot #2 -> P2; slot #3+ is ignored. Room play can force every
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
  platform = null,
} = {}) {
  const connected = ref(false)
  const padCount = ref(0)

  let rafId = null
  const sourceState = Object.create(null)
  const activeLogicalButtons = Object.create(null)
  const turboLoops = new Map()

  function releaseTrackedButtons() {
    for (const sourceKey of Object.keys(sourceState)) {
      releaseSource(sourceKey)
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

  function pressSource(sourceKey, btn, player, slot) {
    if (!btn || !player) return
    const existing = sourceState[sourceKey]
    if (existing) {
      if (existing.btn === btn && existing.player === player && existing.slot === slot) return
      releaseSource(sourceKey)
    }

    sourceState[sourceKey] = { btn, player, slot }
    const logicalKey = `${player}:${btn}`
    if (!activeLogicalButtons[logicalKey]) activeLogicalButtons[logicalKey] = new Set()
    const active = activeLogicalButtons[logicalKey]
    const wasInactive = active.size === 0
    active.add(sourceKey)
    if (!wasInactive) return

    const handled = onButton ? !!onButton('down', btn, player, slot) : false
    if (!handled) dispatchMappedButton('keydown', btn, player)
  }

  function releaseSource(sourceKey) {
    const activeSource = sourceState[sourceKey]
    if (!activeSource) return
    delete sourceState[sourceKey]

    const { btn, player, slot } = activeSource
    const logicalKey = `${player}:${btn}`
    const active = activeLogicalButtons[logicalKey]
    if (!active) return
    active.delete(sourceKey)
    if (active.size > 0) return

    delete activeLogicalButtons[logicalKey]
    const handled = onButton ? !!onButton('up', btn, player, slot) : false
    if (!handled) dispatchMappedButton('keyup', btn, player)
  }

  function poll() {
    const pads = getPhysicalPads()
    padCount.value = pads.length
    connected.value = pads.length > 0

    const playerLimit = Math.max(1, Math.min(2, Number(maxLocalPlayers?.value ?? maxLocalPlayers) || 1))
    const activeLimit = playerResolver ? Math.min(2, pads.length) : Math.min(playerLimit, 2, pads.length)
    const activePads = pads.slice(0, activeLimit)

    for (const pad of activePads) {
      const slot = pads.indexOf(pad) + 1
      const player = resolvePlayer(slot, pad, pads.length)
      if (!player) {
        releasePadSources(pad.index)
        continue
      }

      for (let i = 0; i < pad.buttons.length; i++) {
        const sourceKey = `button:${pad.index}:${i}`
        const pressed = !!pad.buttons[i].pressed
        if (!pressed) {
          releaseSource(sourceKey)
          continue
        }

        const btn = buttonFromIndex(i, slot)
        if (!btn) {
          releaseSource(sourceKey)
          continue
        }
        pressSource(sourceKey, btn, player, slot)
      }
      dispatchAxisDirections(pad, player, slot)
    }

    releaseInactiveSources(activePads)
    rafId = requestAnimationFrame(poll)
  }

  function dispatchAxisDirections(pad, player, slot) {
    for (const { axis, negative, positive } of AXIS_DIRECTIONS) {
      const value = Number(pad.axes?.[axis] || 0)
      const negativeKey = `axis:${pad.index}:${axis}:negative`
      const positiveKey = `axis:${pad.index}:${axis}:positive`

      if (value < -AXIS_DEADZONE && buttonAllowed(negative)) {
        pressSource(negativeKey, negative, player, slot)
        releaseSource(positiveKey)
      } else if (value > AXIS_DEADZONE && buttonAllowed(positive)) {
        pressSource(positiveKey, positive, player, slot)
        releaseSource(negativeKey)
      } else {
        releaseSource(negativeKey)
        releaseSource(positiveKey)
      }
    }
  }

  function releaseInactiveSources(activePads) {
    const activePadIndexes = new Set(activePads.map((pad) => String(pad.index)))
    for (const sourceKey of Object.keys(sourceState)) {
      const padIndex = sourceKey.split(':')[1]
      if (!activePadIndexes.has(padIndex)) releaseSource(sourceKey)
    }
  }

  function releasePadSources(padIndex) {
    const prefix = `:${padIndex}:`
    for (const sourceKey of Object.keys(sourceState)) {
      if (sourceKey.includes(prefix)) releaseSource(sourceKey)
    }
  }

  function getPhysicalPads() {
    return (navigator.getGamepads?.() || []).filter(Boolean)
  }

  function resolvePlayer(slot, pad, physicalPadCount = padCount.value) {
    if (typeof playerResolver === 'function') {
      const resolved = Number(playerResolver(slot, pad, physicalPadCount))
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

  function buttonAllowed(btn) {
    const allowed = platformButtons?.value ? new Set(platformButtons.value) : null
    return !allowed || allowed.has(btn)
  }

  function invertGamepadMap(gpMap) {
    const out = {}
    for (const [btn, idx] of Object.entries(gpMap || {})) {
      if (!buttonAllowed(btn)) continue
      if (typeof idx === 'number') out[idx] = btn
    }
    return out
  }

  function turboTargetForButton(btn) {
    const platformId = platform?.value ?? platform
    return turboButtonsForPlatform(platformId)?.[btn] || TURBO_BUTTON_TARGETS[btn]
  }

  function dispatchMappedButton(type, btn, player = 1) {
    const turboTarget = turboTargetForButton(btn)
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