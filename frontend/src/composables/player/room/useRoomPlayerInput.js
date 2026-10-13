import { computed, unref } from 'vue'
import {
  BUTTON_DEFS,
  RETROPAD_BUTTON_DEFS,
  TURBO_FIRE_MS,
  buildLocalPlayerKeyboardMap,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  normalizeKeyboardEventKey,
  normalizeRetroarchKey,
} from '../../useInputMapping.js'
import { dispatchKeyboardEvent } from '../../dispatchKeyboardEvent.js'
import { useGamepads } from '../../useGamepads.js'

// 远端席位在 core 里用的那批「中转键」。core 直接读 canvas 上的原生键盘事件，这些键又
// 都是房主键盘上真实存在的键，所以房主按下它们会打到对应玩家的角色。把它们收集起来，
// 房主侧吞掉（见 interceptRoomRemoteSeatKey），远端席位就只认 RTC 注入的合成事件。
export function roomRemoteSeatKeySet(remoteKeyMaps = null) {
  const out = new Set()
  for (const [player, keyMap] of Object.entries(remoteKeyMaps || {})) {
    if (!(Number(player) >= 2)) continue
    for (const value of Object.values(keyMap || {})) {
      const key = normalizeRetroarchKey(value)
      if (key && key !== 'nul') out.add(key)
    }
  }
  return out
}

// 房主按到远端席位的键就整段吞掉：既不落到本地 P1，也不让 core 看到。带
// __internalInputDispatch 的合成事件是我们自己注入的（P1 的键、客人转发的键），放行。
export function interceptRoomRemoteSeatKey(event, { isRoomMode = false, isHost = false, seatKeys = null } = {}) {
  if (!isRoomMode || !isHost) return false
  if (!seatKeys || !seatKeys.size) return false
  if (event?.__internalInputDispatch) return false
  const key = normalizeKeyboardEventKey(event)
  if (!key || !seatKeys.has(key)) return false
  event.preventDefault?.()
  event.stopImmediatePropagation?.()
  return true
}

// Room physical pads always use the local P1 dispatch path. The argument is
// the existing room authorization/seat result, not the literal emulator seat.
export function resolveRoomPhysicalGamepadPlayer(roomPlayer) {
  return roomPlayer ? 1 : null
}

// Guests keep the existing forwarding function, which applies authorization
// and sends to the guest's assigned room seat. A denied guest is consumed so
// it cannot fall through to a local host/emulator dispatch.
export function interceptRoomPhysicalGamepad(action, button, {
  isRoomMode = false,
  isHost = false,
  roomPlayer = null,
  forwardGuest = null,
} = {}) {
  if (!isRoomMode || isHost) return false
  if (roomPlayer) forwardGuest?.(action, button)
  return true
}

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
  remoteKeyMaps = null,
}) {
  const keyboardTurboLoops = new Map()
  const pressLocalButton = (button, player = 1) => portalRef.value?.pressButton?.(button, player)
  const releaseLocalButton = (button, player = 1) => portalRef.value?.releaseButton?.(button, player)
  // 远端席位的键位表在 core 配置与运行时注入之间是同一份，这里照它吞键。
  const remoteSeatKeys = () => roomRemoteSeatKeySet(unref(remoteKeyMaps))

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
  // Physical pads use the direct button route on the host. Keep the existing
  // interceptor above for the virtual pad and keyboard paths.
  const physicalGamepadButtonInterceptor = (action, button) => interceptRoomPhysicalGamepad(action, button, {
    isRoomMode,
    isHost: isHostMode.value,
    roomPlayer: roomGamepadPlayer(),
    forwardGuest: guestButtonInterceptor,
  })
  // Every local pad shares logical P1, independently of the solo seat table.
  // roomGamepadPlayer supplies only the existing room permission/seat gate;
  // guestButtonInterceptor still forwards to the guest's authorized room seat.
  const resolveGamepadPlayer = () => resolveRoomPhysicalGamepadPlayer(roomGamepadPlayer())

  useGamepads({
    mapping,
    enabled: computed(() => !showInput.value),
    onButton: physicalGamepadButtonInterceptor,
    pressButton: (button, player = 1) => pressLocalButton(button, player),
    releaseButton: (button, player = 1) => releaseLocalButton(button, player),
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

  // 房主的物理键盘碰到远端席位的键：吞掉，别让它到 core（那些键只是内部中转，玩家
  // 应该按自己的键，按键设置里也没有这些行）。P1 自己的键在上面已经处理过了。
  function handleRemoteSeatKeyboard(e) {
    return interceptRoomRemoteSeatKey(e, {
      isRoomMode,
      isHost: isHostMode.value,
      seatKeys: remoteSeatKeys(),
    })
  }

  function handleRoomKeyboardEvent(e) {
    if (handleHostKeyboardRemap(e)) return true
    if (handleLocalPlayer2Keyboard(e)) return true
    if (handleLocalKeyboardButton(e)) return true
    if (handleRemoteSeatKeyboard(e)) return true
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