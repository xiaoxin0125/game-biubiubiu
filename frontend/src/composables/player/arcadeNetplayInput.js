import {
  buildLocalPlayerKeyboardMap,
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

export function arcadeNetplayGuestKeyboardPlayer({ isRoomMode, platform, playerIndex } = {}) {
  if (!isArcadeNetplayInputEnabled({ isRoomMode, platform })) return 1
  return Number(playerIndex) === 2 ? 2 : 1
}

export function buildArcadeNetplayRemoteKeyMaps({ maxPlayers = 4, hostConfig = {}, platformButtons = null } = {}) {
  const maps = buildRemotePlayerKeyMaps(maxPlayers, reservedKeysFromHostConfig(hostConfig), platformButtons)
  if (Number(maxPlayers) >= 2) maps[2] = buildLocalPlayerKeyboardMap(2, platformButtons)
  return maps
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
      if (allowed && !allowed.has(btn)) continue
      const key = normalizeRetroarchKey(keyMap?.[btn])
      if (key) cfg[`input_player${playerIndex}_${btn}`] = key
    }
  }

  for (let player = 1; player <= 4; player++) {
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) cfg[`input_player${player}_${btn}_btn`] = 'nul'
  }

  return cfg
}

export function dispatchArcadeNetplayInput({ playerIndex, action, button, keyMap, controls } = {}) {
  const player = Number(playerIndex)
  if (!Number.isInteger(player) || player < 2 || player > 4) return false

  const turboTarget = TURBO_BUTTON_TARGETS[button]
  if (turboTarget) return dispatchArcadeNetplayTurbo({ playerIndex: player, action, button, targetButton: turboTarget, keyMap, controls })

  let handled = false
  if (controls?.pressButton && controls?.releaseButton) {
    if (action === 'down') controls.pressButton(button, player)
    else controls.releaseButton(button, player)
    handled = true
  }

  const mappedKey = keyMap?.[button]
  if (mappedKey && mappedKey !== 'nul') {
    dispatchKeyboardEvent(action === 'down' ? 'keydown' : 'keyup', mappedKey, { internal: true })
    handled = true
  }
  return handled
}

function dispatchArcadeNetplayTurbo({ playerIndex, action, button, targetButton, keyMap, controls }) {
  const mappedKey = keyMap?.[targetButton]
  const hasDirectControl = controls?.pressButton && controls?.releaseButton
  if (!mappedKey && !hasDirectControl) return false

  const press = () => {
    if (hasDirectControl) controls.pressButton(targetButton, playerIndex)
    if (mappedKey && mappedKey !== 'nul') dispatchKeyboardEvent('keydown', mappedKey, { internal: true })
  }
  const release = () => {
    if (hasDirectControl) controls.releaseButton(targetButton, playerIndex)
    if (mappedKey && mappedKey !== 'nul') dispatchKeyboardEvent('keyup', mappedKey, { internal: true })
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