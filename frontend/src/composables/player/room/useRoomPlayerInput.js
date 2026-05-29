import { computed } from 'vue'
import {
  BUTTON_DEFS,
  RETROPAD_BUTTON_DEFS,
  TURBO_FIRE_MS,
  buildLocalPlayerKeyboardMap,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  normalizeKeyboardEventKey,
} from '../../useInputMapping.js'
import { dispatchKeyboardEvent } from '../../dispatchKeyboardEvent.js'
import { useGamepads } from '../../useGamepads.js'

export function useRoomPlayerInput({
  mapping,
  romMeta,
  portalRef,
  showInput,
  isTouchLayout,
  isRoomMode,
  isHostMode,
  isGuestMode,
  activeMaxPlayers,
  currentPlatformButtons,
  player1RuntimeKeyboard,
  roomHostInputConfigSnapshot,
  currentTurboTargets,
  turboTargetForButton,
  guestButtonInterceptor,
  roomGamepadPlayer,
}) {
  const keyboardTurboLoops = new Map()
  const pressLocalButton = (button, player = 1) => portalRef.value?.pressButton?.(button, player)
  const releaseLocalButton = (button, player = 1) => portalRef.value?.releaseButton?.(button, player)

  function snapshotKeyboardMapping() {
    const snapshot = roomHostInputConfigSnapshot.value
    const runtimeKeyboard = player1RuntimeKeyboard.value
    if (!snapshot) return runtimeKeyboard
    const out = {}
    for (const { key } of BUTTON_DEFS) {
      const target = turboTargetForButton(key) || key
      out[key] = snapshot[`input_player1_${target}`] || runtimeKeyboard[target] || 'nul'
    }
    return out
  }

  function inputButtonFromConfigKey(config, key, allowed = null, { includeTurbo = false } = {}) {
    const defs = includeTurbo ? BUTTON_DEFS : RETROPAD_BUTTON_DEFS
    for (const { key: button } of defs) {
      if (allowed && !allowed.has(button)) continue
      if (!includeTurbo && turboTargetForButton(button)) continue
      if (config?.[button] === key) return button
    }
    return null
  }

  function dispatchHostPlayer1Button(action, button, source = null) {
    if (action === 'down') pressLocalButton(button, 1)
    else releaseLocalButton(button, 1)

    const key = source?.[button]
    if (key && key !== 'nul') {
      dispatchKeyboardEvent(action === 'down' ? 'keydown' : 'keyup', key, { internal: true })
    }
  }

  function dispatchLocalButtonTurbo(turboButton, targetButton, action, player = 1) {
    const loopKey = `${player}:${turboButton}`
    if (action === 'down') {
      if (keyboardTurboLoops.has(loopKey)) return
      let down = true
      pressLocalButton(targetButton, player)
      const loop = setInterval(() => {
        down = !down
        if (down) pressLocalButton(targetButton, player)
        else releaseLocalButton(targetButton, player)
      }, TURBO_FIRE_MS)
      keyboardTurboLoops.set(loopKey, { loop, targetButton, direct: true, player })
      return
    }

    const active = keyboardTurboLoops.get(loopKey)
    if (active) {
      clearInterval(active.loop)
      keyboardTurboLoops.delete(loopKey)
    }
    releaseLocalButton(targetButton, player)
  }

  function dispatchKeyboardTurbo(turboButton, targetButton, action, source) {
    const targetKey = source?.[targetButton]
    const sourceKey = source?.[turboButton]
    if (!targetKey || targetKey === 'nul' || targetKey === sourceKey) return

    if (action === 'down') {
      if (keyboardTurboLoops.has(turboButton)) return
      let down = true
      dispatchKeyboardEvent('keydown', targetKey, { internal: true })
      const loop = setInterval(() => {
        down = !down
        dispatchKeyboardEvent(down ? 'keydown' : 'keyup', targetKey, { internal: true })
      }, TURBO_FIRE_MS)
      keyboardTurboLoops.set(turboButton, { loop, targetKey })
      return
    }

    const active = keyboardTurboLoops.get(turboButton)
    if (active) {
      clearInterval(active.loop)
      keyboardTurboLoops.delete(turboButton)
    }
    dispatchKeyboardEvent('keyup', targetKey, { internal: true })
  }

  function dispatchHostPlayer1Turbo(turboButton, targetButton, action, source = null) {
    dispatchLocalButtonTurbo(`host:${turboButton}`, targetButton, action, 1)
    dispatchKeyboardTurbo(`host:${turboButton}`, targetButton, action, {
      ...(source || {}),
      [turboButton]: null,
    })
  }

  const hostButtonInterceptor = (action, button) => {
    if (!isRoomMode || !isHostMode.value) return false
    const snapshotKeyboard = snapshotKeyboardMapping()
    const turboTarget = turboTargetForButton(button)
    if (turboTarget) {
      dispatchHostPlayer1Turbo(button, turboTarget, action, snapshotKeyboard)
      return true
    }
    dispatchHostPlayer1Button(action, button, snapshotKeyboard)
    return true
  }

  const gamepadButtonInterceptor = (action, button) => {
    if (isRoomMode && !isHostMode.value && guestButtonInterceptor(action, button)) return true
    if (isRoomMode && isHostMode.value) return hostButtonInterceptor(action, button)
    return false
  }
  const resolveGamepadPlayer = (slot = 1) => slot === 1 ? roomGamepadPlayer() : null

  useGamepads({
    mapping,
    onButton: gamepadButtonInterceptor,
    pressButton: (button, player = 1) => pressLocalButton(button, player),
    releaseButton: (button, player = 1) => releaseLocalButton(button, player),
    maxLocalPlayers: computed(() => 1),
    playerResolver: resolveGamepadPlayer,
    platformButtons: currentPlatformButtons,
    platform: computed(() => romMeta.value?.platform || null),
  })

  function handleHostKeyboardRemap(e) {
    if (e.__internalInputDispatch) return false
    if (!isRoomMode || !isHostMode.value || showInput.value) return false
    const snapshotKeyboard = snapshotKeyboardMapping()
    if (!snapshotKeyboard) return false

    const key = normalizeKeyboardEventKey(e)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    const currentKeyboard = effectiveKeyboardForPlayer(mapping.value, 1, romMeta.value?.platform || null)
    const currentButton = inputButtonFromConfigKey(currentKeyboard, key, allowed, { includeTurbo: true })

    if (currentButton) {
      const targetButton = turboTargetForButton(currentButton) || currentButton
      e.preventDefault()
      e.stopImmediatePropagation()
      const action = e.type === 'keydown' ? 'down' : 'up'
      if (turboTargetForButton(currentButton)) dispatchHostPlayer1Turbo(currentButton, targetButton, action, snapshotKeyboard)
      else dispatchHostPlayer1Button(action, targetButton, snapshotKeyboard)
      return true
    }

    const oldButton = inputButtonFromConfigKey(snapshotKeyboard, key, allowed)
    if (oldButton && currentKeyboard[oldButton] !== key) {
      e.preventDefault()
      e.stopImmediatePropagation()
      return true
    }

    return false
  }

  function handleLocalPlayer2Keyboard(e) {
    if (e.__internalInputDispatch || showInput.value || isTouchLayout.value || isRoomMode || isGuestMode.value) return false
    if (activeMaxPlayers.value < 2 || isTouchLayout.value) return false

    const key = normalizeKeyboardEventKey(e)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    const p2UserKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, 2, romMeta.value?.platform || null)
    const button = inputButtonFromConfigKey(p2UserKeyboard, key, allowed, { includeTurbo: true })
    if (!button) return false

    const p2RuntimeKeyboard = buildLocalPlayerKeyboardMap(2, currentPlatformButtons.value)
    const action = e.type === 'keydown' ? 'down' : 'up'
    const turboTarget = turboTargetForButton(button)
    const targetButton = turboTarget || button
    const runtimeKey = p2RuntimeKeyboard[targetButton]
    if (!runtimeKey || runtimeKey === 'nul') return false

    e.preventDefault()
    e.stopImmediatePropagation()
    if (turboTarget) dispatchKeyboardTurbo(`p2:${button}`, targetButton, action, {
      ...p2RuntimeKeyboard,
      [button]: p2UserKeyboard[button],
    })
    else dispatchKeyboardEvent(e.type, runtimeKey, { internal: true })
    return true
  }

  function handleLocalKeyboardButton(e) {
    if (e.__internalInputDispatch || showInput.value || isGuestMode.value) return false
    if (isRoomMode && !isHostMode.value) return false

    const key = normalizeKeyboardEventKey(e)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    const currentKeyboard = effectiveKeyboardForPlayer(mapping.value, 1, romMeta.value?.platform || null)
    const button = inputButtonFromConfigKey(currentKeyboard, key, allowed, { includeTurbo: true })
    if (!button) return false

    const action = e.type === 'keydown' ? 'down' : 'up'
    const turboTarget = turboTargetForButton(button)
    const targetButton = turboTarget || button
    const runtimeKeyboard = snapshotKeyboardMapping()

    e.preventDefault()
    e.stopImmediatePropagation()
    if (turboTarget) dispatchKeyboardTurbo(button, targetButton, action, runtimeKeyboard)
    else {
      const runtimeKey = runtimeKeyboard?.[targetButton]
      if (!runtimeKey || runtimeKey === 'nul') return true
      dispatchKeyboardEvent(e.type, runtimeKey, { internal: true })
    }
    return true
  }

  function handleTurboKeyboard(e) {
    if (showInput.value || isGuestMode.value) return
    const snapshotKeyboard = snapshotKeyboardMapping()
    const source = snapshotKeyboard || mapping.value.keyboard || {}
    const key = normalizeKeyboardEventKey(e)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    for (const [turboButton, targetButton] of Object.entries(currentTurboTargets.value || {})) {
      if (allowed && !allowed.has(turboButton)) continue
      if (source[turboButton] !== key) continue
      e.preventDefault()
      e.stopImmediatePropagation()
      dispatchKeyboardTurbo(turboButton, targetButton, e.type === 'keydown' ? 'down' : 'up', source)
      return
    }
  }

  function handleRoomKeyboardEvent(e) {
    if (handleHostKeyboardRemap(e)) return true
    if (handleLocalPlayer2Keyboard(e)) return true
    if (handleLocalKeyboardButton(e)) return true
    handleTurboKeyboard(e)
    return false
  }

  function stopKeyboardTurboLoops() {
    for (const [button, active] of keyboardTurboLoops.entries()) {
      clearInterval(active.loop)
      keyboardTurboLoops.delete(button)
      if (active.direct) releaseLocalButton(active.targetButton, active.player || 1)
      else dispatchKeyboardEvent('keyup', active.targetKey, { internal: true })
    }
  }

  return {
    gamepadButtonInterceptor,
    pressLocalButton,
    releaseLocalButton,
    handleRoomKeyboardEvent,
    stopKeyboardTurboLoops,
  }
}