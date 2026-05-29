import { computed } from 'vue'
import {
  RETROPAD_BUTTON_DEFS,
  TURBO_FIRE_MS,
  buildLocalPlayerKeyboardMap,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  normalizeKeyboardEventKey,
} from '../../useInputMapping.js'
import { turboButtonsForPlatform } from '../../../constants/platforms.js'
import { dispatchKeyboardEvent } from '../../dispatchKeyboardEvent.js'
import { useGamepads } from '../../useGamepads.js'

export function useLocalPlayerInput({
  mapping,
  romMeta,
  portalRef,
  showInput,
  isTouchLayout,
  activeMaxPlayers,
  currentPlatformButtons,
  player1RuntimeKeyboard,
}) {
  const currentTurboTargets = computed(() => isTouchLayout.value ? {} : turboButtonsForPlatform(romMeta.value?.platform))
  const keyboardTurboLoops = new Map()
  const soloGamepadPlayer = computed(() => (isTouchLayout.value || activeMaxPlayers.value < 2) ? 1 : 2)
  const resolveGamepadPlayer = (slot, _pad, physicalPadCount = 0) => {
    if (physicalPadCount >= 2) return slot <= Math.min(2, activeMaxPlayers.value || 1) ? slot : null
    return slot === 1 ? soloGamepadPlayer.value : null
  }
  const pressLocalButton = (button, player = 1) => portalRef.value?.pressButton?.(button, player)
  const releaseLocalButton = (button, player = 1) => portalRef.value?.releaseButton?.(button, player)
  const p2RuntimeKeyboard = computed(() => buildLocalPlayerKeyboardMap(2, currentPlatformButtons.value))
  const turboTargetForButton = (button) => currentTurboTargets.value?.[button] || null

  const dispatchLocalButtonTurbo = (loopKey, targetButton, action, player = 1) => {
    const targetKey = player === 2 ? p2RuntimeKeyboard.value?.[targetButton] : null
    const emit = (down) => {
      if (down) pressLocalButton(targetButton, player)
      else releaseLocalButton(targetButton, player)
      if (targetKey) dispatchKeyboardEvent(down ? 'keydown' : 'keyup', targetKey, { internal: true })
    }

    if (action === 'down') {
      if (keyboardTurboLoops.has(loopKey)) return
      let down = true
      emit(true)
      const loop = setInterval(() => {
        down = !down
        emit(down)
      }, TURBO_FIRE_MS)
      keyboardTurboLoops.set(loopKey, { loop, targetButton, player, targetKey })
      return
    }

    const active = keyboardTurboLoops.get(loopKey)
    if (active) {
      clearInterval(active.loop)
      keyboardTurboLoops.delete(loopKey)
    }
    releaseLocalButton(targetButton, player)
    if (targetKey) dispatchKeyboardEvent('keyup', targetKey, { internal: true })
  }

  function stopKeyboardTurboLoops() {
    for (const [loopKey, active] of keyboardTurboLoops.entries()) {
      clearInterval(active.loop)
      keyboardTurboLoops.delete(loopKey)
      releaseLocalButton(active.targetButton, active.player || 1)
      if (active.targetKey) dispatchKeyboardEvent('keyup', active.targetKey, { internal: true })
    }
  }

  const dispatchLocalButton = (type, button, player = 1) => {
    const turboTarget = turboTargetForButton(button)
    if (turboTarget) {
      dispatchLocalButtonTurbo(`${player}:${button}`, turboTarget, type === 'keydown' ? 'down' : 'up', player)
      return
    }
    if (player === 2) {
      if (type === 'keydown') pressLocalButton(button, 2)
      else releaseLocalButton(button, 2)
      const key = p2RuntimeKeyboard.value?.[button]
      if (key) dispatchKeyboardEvent(type, key, { internal: true })
      return
    }
    if (type === 'keydown') pressLocalButton(button, player)
    else releaseLocalButton(button, player)
  }

  const pressSoloGamepadButton = (button) => pressLocalButton(button, 1)
  const releaseSoloGamepadButton = (button) => releaseLocalButton(button, 1)

  useGamepads({
    mapping,
    onButton: () => false,
    pressButton: (button, player = 1) => dispatchLocalButton('keydown', button, player),
    releaseButton: (button, player = 1) => dispatchLocalButton('keyup', button, player),
    maxLocalPlayers: computed(() => 1),
    playerResolver: resolveGamepadPlayer,
    platformButtons: currentPlatformButtons,
    platform: computed(() => romMeta.value?.platform || null),
  })

  function inputButtonFromConfigKey(config, key, allowed = null, { includePcTurbo = false } = {}) {
    for (const { key: button } of RETROPAD_BUTTON_DEFS) {
      if (allowed && !allowed.has(button)) continue
      if (!includePcTurbo && turboTargetForButton(button)) continue
      if (config?.[button] === key) return button
    }
    return null
  }

  function handleLocalPlayer2Keyboard(e) {
    if (e.__internalInputDispatch || showInput.value || isTouchLayout.value) return false
    if (activeMaxPlayers.value < 2) return false

    const key = normalizeKeyboardEventKey(e)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    const p2UserKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, 2, romMeta.value?.platform || null)
    const button = inputButtonFromConfigKey(p2UserKeyboard, key, allowed, { includePcTurbo: true })
    if (!button) return false

    const targetButton = turboTargetForButton(button) || button
    const runtimeKey = p2RuntimeKeyboard.value?.[targetButton]
    if (!runtimeKey || runtimeKey === 'nul') return false

    if (key === runtimeKey) {
      dispatchLocalButton(e.type, button, 2)
      return false
    }

    e.preventDefault()
    e.stopImmediatePropagation()
    dispatchLocalButton(e.type, button, 2)
    return true
  }

  function handleLocalKeyboardButton(e) {
    if (e.__internalInputDispatch || showInput.value) return false

    const key = normalizeKeyboardEventKey(e)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    if (!isTouchLayout.value && activeMaxPlayers.value >= 2) {
      const p2UserKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, 2, romMeta.value?.platform || null)
      if (inputButtonFromConfigKey(p2UserKeyboard, key, allowed)) return false
    }
    const currentKeyboard = effectiveKeyboardForPlayer(mapping.value, 1, romMeta.value?.platform || null)
    const button = inputButtonFromConfigKey(currentKeyboard, key, allowed, { includePcTurbo: true })
    if (!button) return false

    const targetButton = turboTargetForButton(button) || button
    const runtimeKey = player1RuntimeKeyboard.value?.[targetButton]
    if (!runtimeKey || runtimeKey === 'nul') return true

    e.preventDefault()
    e.stopImmediatePropagation()
    if (targetButton !== button) dispatchLocalButton(e.type, button, 1)
    else dispatchKeyboardEvent(e.type, runtimeKey, { internal: true })
    return true
  }

  function handleLocalKeyboardEvent(e) {
    if (handleLocalPlayer2Keyboard(e)) return true
    return handleLocalKeyboardButton(e)
  }

  return {
    pressSoloGamepadButton,
    releaseSoloGamepadButton,
    handleLocalKeyboardEvent,
    stopKeyboardTurboLoops,
  }
}