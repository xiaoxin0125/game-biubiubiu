import { RETROPAD_BUTTON_DEFS } from './buttons.js'
import { normalizeRetroarchKey } from './keyboardKeys.js'
import { LOCAL_PLAYER2_RUNTIME_KEYBOARD } from './keyboardProfiles.js'

// 联机房间里远端玩家（P2 / P3 / P4）在 host 侧 core 配置里的键位。远端玩家用自己
// 键盘上的 P1 映射按键，host 收到按钮后按这里的键转发给 core，所以这些键只是内部
// 中转，玩家看不到；但它们必须彼此、以及与 host 的 P1 默认键位（含街机 / MD 变体）
// 互不重叠，否则一个键会同时触发两名玩家。P2 用的就是单机 P2 的运行时键位。
const REMOTE_PLAYER_KEY_LAYOUTS = {
  2: { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD },
  3: {
    up: 'b', down: 'e', left: 'f', right: 'semicolon',
    a: 'minus', b: 'equal', x: 'comma', y: 'period',
    l: 'slash', r: 'quote', l2: 'leftbracket', r2: 'rightbracket',
    l3: 'backquote', r3: 'tab', start: 'space', select: 'shift',
  },
  4: {
    // d / 8 / 0 和新 P1 的默认（右=d、L3=8、R3=0）撞车：构建时会由下面的保留键
    // 机制自动换成池子里的空闲键（P4 只在四人房间出现，这些键同样只是内部中转）。
    up: 'home', down: 'end', left: 'del', right: 'pagedown',
    a: 'c', b: 'd', x: 'r', y: '0',
    l: '5', r: '6', l2: '8', r2: 'backspace',
    l3: 'capslock', r3: 'insert', start: 'pageup', select: 'rctrl',
  },
}

const REMOTE_KEY_FALLBACK_POOL = [
  ...Object.values(REMOTE_PLAYER_KEY_LAYOUTS[2]),
  ...Object.values(REMOTE_PLAYER_KEY_LAYOUTS[3]),
  ...Object.values(REMOTE_PLAYER_KEY_LAYOUTS[4]),
]

function remotePlayerKeys(player, reserved = new Set(), platformButtons = null) {
  const out = {}
  const preferred = REMOTE_PLAYER_KEY_LAYOUTS[player] || {}
  const allowed = platformButtons ? new Set(platformButtons) : null
  let fallbackCursor = 0

  for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
    if (allowed && !allowed.has(btn)) continue
    const key = normalizeRetroarchKey(preferred[btn])
    if (key && !reserved.has(key)) {
      out[btn] = key
    } else {
      while (fallbackCursor < REMOTE_KEY_FALLBACK_POOL.length && reserved.has(normalizeRetroarchKey(REMOTE_KEY_FALLBACK_POOL[fallbackCursor]))) fallbackCursor++
      out[btn] = normalizeRetroarchKey(REMOTE_KEY_FALLBACK_POOL[fallbackCursor]) || 'nul'
      fallbackCursor++
    }
    if (out[btn] && out[btn] !== 'nul') reserved.add(out[btn])
  }
  return out
}

export function buildRemotePlayerKeyMaps(maxPlayers = 4, reservedKeys = [], platformButtons = null) {
  const limit = Math.max(1, Math.min(4, Number(maxPlayers) || 4))
  const reserved = new Set((reservedKeys || []).filter((key) => key != null && key !== '').map((key) => normalizeRetroarchKey(key)))
  const maps = {}
  for (let player = 2; player <= limit; player++) maps[player] = remotePlayerKeys(player, reserved, platformButtons)
  return maps
}

export const REMOTE_PLAYER_KEY_MAPS = buildRemotePlayerKeyMaps(4)

export const P2_KEY_MAP = REMOTE_PLAYER_KEY_MAPS[2]

export function buildRemotePlayersRetroarchConfig(maxPlayers = 4, reservedKeys = [], platformButtons = null) {
  const limit = Math.max(1, Math.min(4, Number(maxPlayers) || 4))
  const maps = buildRemotePlayerKeyMaps(limit, reservedKeys, platformButtons)
  const cfg = { input_max_users: limit }
  const allowed = platformButtons ? new Set(platformButtons) : null
  for (let player = 1; player <= 4; player++) {
    cfg[`input_libretro_device_p${player}`] = 1
    cfg[`input_player${player}_analog_dpad_mode`] = 1
  }
  for (const [player, keyMap] of Object.entries(maps)) {
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      const key = allowed && !allowed.has(btn) ? 'nul' : normalizeRetroarchKey(keyMap[btn])
      cfg[`input_player${player}_${btn}`] = key || 'nul'
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

export function buildPlayer2RetroarchConfig() {
  return buildRemotePlayersRetroarchConfig(2)
}