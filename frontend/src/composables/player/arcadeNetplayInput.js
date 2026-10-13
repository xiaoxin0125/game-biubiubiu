import {
  buildRemotePlayerKeyMaps,
  normalizeRetroarchKey,
  RETROPAD_BUTTON_DEFS,
  TURBO_BUTTON_TARGETS,
  TURBO_FIRE_MS,
} from '../useInputMapping.js'
import { dispatchKeyboardEvent } from '../dispatchKeyboardEvent.js'

const arcadeTurboLoops = new Map()

export function isArcadeNetplayInputEnabled({ isRoomMode, platform } = {}) {
  return isRoomMode === true && platform === 'arcade'
}

function reservedKeysFromHostConfig(hostConfig = {}) {
  return Object.values(hostConfig || {})
    .filter((value) => typeof value === 'string' && value !== 'nul')
}

export function arcadeNetplayGuestKeyboardPlayer({ isRoomMode, platform } = {}) {
  if (!isArcadeNetplayInputEnabled({ isRoomMode, platform })) return 1
  return 1
}

export function buildArcadeNetplayRemoteKeyMaps({ maxPlayers = 4, hostConfig = {}, platformButtons = null, reservedKeys = null } = {}) {
  // 房间会传完整的 P1 保留键（运行期键 + 房主保存的映射，见 player1ReservedKeys）；
  // 只给 hostConfig 的旧用法仍然按 core 配置里的 P1 键推导。
  // P2 用单机 P2 的运行时键位这一点由 remotePlayers.js 的布局表保证，这里不再覆盖：
  // 覆盖会绕过保留机制，把房主按得到的键分给 P2。
  const reserved = Array.isArray(reservedKeys) ? reservedKeys : reservedKeysFromHostConfig(hostConfig)
  return buildRemotePlayerKeyMaps(maxPlayers, reserved, platformButtons)
}

export function buildArcadeNetplayRetroarchConfig({ maxPlayers = 4, keyMaps = {}, platformButtons = null } = {}) {
  const limit = Math.max(1, Math.min(4, Number(maxPlayers) || 4))
  const allowed = platformButtons ? new Set(platformButtons) : null
  const cfg = { input_max_users: limit }

  for (let player = 1; player <= 4; player++) {
    cfg[`input_libretro_device_p${player}`] = 1
    cfg[`input_player${player}_analog_dpad_mode`] = 1
  }

  for (const [player, keyMap] of Object.entries(keyMaps || {})) {
    const playerIndex = Number(player)
    if (!Number.isInteger(playerIndex) || playerIndex < 2 || playerIndex > limit) continue
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      const key = allowed && !allowed.has(btn) ? 'nul' : normalizeRetroarchKey(keyMap?.[btn])
      cfg[`input_player${playerIndex}_${btn}`] = key || 'nul'
    }
  }

  for (let player = 1; player <= 4; player++) {
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      cfg[`input_player${player}_${btn}_btn`] = 'nul'
      cfg[`input_player${player}_${btn}_axis`] = 'nul'
    }
  }

  return cfg
}

function dispatchArcadeKey(action, key) {
  if (!key || key === 'nul') return false
  return dispatchKeyboardEvent(action === 'down' ? 'keydown' : 'keyup', key, { internal: true })
}

export function dispatchArcadeNetplayInput({ playerIndex, action, button, keyMap, controls, turboTargets = null } = {}) {
  const player = Number(playerIndex)
  if (!Number.isInteger(player) || player < 2 || player > 4) return false

  const turboTarget = turboTargets?.[button] || TURBO_BUTTON_TARGETS[button]
  if (turboTarget) return dispatchArcadeNetplayTurbo({ playerIndex: player, action, button, targetButton: turboTarget, keyMap, controls })

  const mappedKey = keyMap?.[button]
  const handledByKeyboard = dispatchArcadeKey(action, mappedKey)
  if (controls?.pressButton && controls?.releaseButton) {
    if (action === 'down') controls.pressButton(button, player)
    else controls.releaseButton(button, player)
  }
  return handledByKeyboard
}

function dispatchArcadeNetplayTurbo({ playerIndex, action, button, targetButton, keyMap, controls }) {
  const mappedKey = keyMap?.[targetButton]
  const hasDirectControl = controls?.pressButton && controls?.releaseButton
  if ((!mappedKey || mappedKey === 'nul') && !hasDirectControl) return false

  const press = () => {
    dispatchArcadeKey('down', mappedKey)
    if (hasDirectControl) controls.pressButton(targetButton, playerIndex)
  }
  const release = () => {
    dispatchArcadeKey('up', mappedKey)
    if (hasDirectControl) controls.releaseButton(targetButton, playerIndex)
  }

  const loopKey = `${playerIndex}:${button}`
  if (action === 'down') {
    if (arcadeTurboLoops.has(loopKey)) return true
    let down = true
    press()
    const loop = setInterval(() => {
      down = !down
      if (down) press()
      else release()
    }, TURBO_FIRE_MS)
    arcadeTurboLoops.set(loopKey, { loop, release })
    return true
  }

  const active = arcadeTurboLoops.get(loopKey)
  if (active) {
    clearInterval(active.loop)
    arcadeTurboLoops.delete(loopKey)
    active.release?.()
    return true
  }
  release()
  return true
}