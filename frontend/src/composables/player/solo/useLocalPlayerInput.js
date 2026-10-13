import { computed } from 'vue'
import {
  RETROPAD_BUTTON_DEFS,
  TURBO_FIRE_MS,
  buildLocalPlayerKeyboardMap,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  normalizeKeyboardEventKey,
  normalizeRetroarchKey,
} from '../../useInputMapping.js'
import { turboButtonsForPlatform } from '../../../constants/platforms.js'
import { dispatchKeyboardEvent } from '../../dispatchKeyboardEvent.js'
import { useGamepads } from '../../useGamepads.js'

// 单机双打：P2 在 core 里的键位是运行期键位（默认 z x v n q y …
// 见 buildLocalMultiplayerRetroarchConfig），按键设置里给 P2 看的是另一套小键盘键位，
// 前端再把玩家的物理键换算成运行期键注入给 core。core 直接读 canvas 上的原生键盘
// 事件，所以玩家本人按到这批运行期键时 core 会当成 P2 的输入 —— 但它们并不在 P2 的
// 映射里，属于误触。这里把它们吞掉，P2 只认前端注入的合成事件。
export function localPlayer2RuntimeKeySet(runtimeKeyboard = null) {
  const out = new Set()
  for (const value of Object.values(runtimeKeyboard || {})) {
    const key = normalizeRetroarchKey(value)
    if (key && key !== 'nul') out.add(key)
  }
  return out
}

// 吞键本身只在桌面端、本地双打（P2 真的被 core 绑定了）时启用：P1 映射与 P2 映射都
// 在上面处理过了，走到这里说明这批运行期键没人认领。
export function interceptLocalPlayer2RuntimeKey(event, { enabled = false, runtimeKeys = null } = {}) {
  if (!enabled) return false
  if (!runtimeKeys || !runtimeKeys.size) return false
  // 带 __internalInputDispatch 的合成事件是前端自己注入的（玩家按 P2 映射时用的就是
  // 它），放行。原生事件才是要吞的那一批。
  if (event?.__internalInputDispatch) return false
  const key = normalizeKeyboardEventKey(event)
  if (!key || !runtimeKeys.has(key)) return false
  event.preventDefault?.()
  event.stopImmediatePropagation?.()
  return true
}

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
  // 座位设置决定哪台手柄控制哪个玩家；默认按连接顺序 P1、P2，单个手柄只控制 P1。
  const gamepadSeats = computed(() => mapping.value?.seats || null)
  const gamepadPlayerLimit = computed(() => Math.max(1, Math.min(2, Number(activeMaxPlayers.value) || 1)))
  const pressLocalButton = (button, player = 1) => portalRef.value?.pressButton?.(button, player)
  const releaseLocalButton = (button, player = 1) => portalRef.value?.releaseButton?.(button, player)
  const p2RuntimeKeyboard = computed(() => buildLocalPlayerKeyboardMap(2, currentPlatformButtons.value))
  const p2RuntimeKeys = computed(() => localPlayer2RuntimeKeySet(p2RuntimeKeyboard.value))
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

  const dispatchGamepadButton = (type, button, player = 1) => {
    // 物理手柄已经按座位直接调用 Nostalgist 的 player 参数。这里不能再发送 P2
    // 的运行时键盘事件，否则 P2 的方向键（ArrowUp 等）会撞到旧版/自定义的
    // P1 键盘映射，表现为“一只手柄同时控制两个玩家”。
    if (type === 'keydown') pressLocalButton(button, player)
    else releaseLocalButton(button, player)
  }

  const pressSoloGamepadButton = (button) => pressLocalButton(button, 1)
  const releaseSoloGamepadButton = (button) => releaseLocalButton(button, 1)

  useGamepads({
    mapping,
    // 打开按键设置时释放并暂停物理输出，避免设置面板里按手柄同时打到游戏里。
    enabled: computed(() => !showInput.value),
    onButton: () => false,
    pressButton: (button, player = 1) => dispatchGamepadButton('keydown', button, player),
    releaseButton: (button, player = 1) => dispatchGamepadButton('keyup', button, player),
    maxLocalPlayers: gamepadPlayerLimit,
    seats: gamepadSeats,
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
      // P2 的默认十字就是方向键，等于运行时键。内部事件已经会送到 core，
      // 原始事件必须截断，否则旧版或自定义的 P1 键盘映射也可能收到同一个方向。
      e.preventDefault()
      e.stopImmediatePropagation()
      dispatchLocalButton(e.type, button, 2)
      return true
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

  // P2 运行期键位的兜底：P1 映射、P2 映射都处理完之后，剩下的运行期键属于「按键设置
  // 里看不到、core 却认」的那批，直接吞掉，免得误触 P2。打开按键设置时不吞（那时用户
  // 正在绑键），触屏布局与单人模式也没有 P2 可打。
  function handleLocalPlayer2RuntimeKey(e) {
    return interceptLocalPlayer2RuntimeKey(e, {
      enabled: !showInput.value && !isTouchLayout.value && activeMaxPlayers.value >= 2,
      runtimeKeys: p2RuntimeKeys.value,
    })
  }

  function handleLocalKeyboardEvent(e) {
    if (handleLocalPlayer2Keyboard(e)) return true
    if (handleLocalKeyboardButton(e)) return true
    return handleLocalPlayer2RuntimeKey(e)
  }

  return {
    pressSoloGamepadButton,
    releaseSoloGamepadButton,
    handleLocalKeyboardEvent,
    stopKeyboardTurboLoops,
  }
}