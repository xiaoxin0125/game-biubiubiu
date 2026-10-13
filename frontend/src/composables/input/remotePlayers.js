import { RETROPAD_BUTTON_DEFS } from './buttons.js'
import { normalizeRetroarchKey } from './keyboardKeys.js'
import { LOCAL_PLAYER2_RUNTIME_KEYBOARD } from './keyboardProfiles.js'

// 联机房间里远端玩家（P2 / P3 / P4）在 host 侧 core 配置里的键位。远端玩家用自己
// 键盘上的 P1 映射按键，host 收到按钮后按这里的键转发给 core，所以这些键只是内部
// 中转，玩家看不到。core 是直接读 canvas 上的原生键盘事件的，所以它们同时也是
// 房主键盘上真实存在的键：房主一按就会打到对应的远端玩家。因此这批键必须彼此、与
// host 的 P1 运行期键位、以及与房主保存的 P1 完整映射（含平台用不到的按钮）都不
// 重叠——保留集由 player1ReservedKeys 给出，房主侧再把它们吞掉（见 useRoomPlayerInput
// 的 interceptRoomRemoteSeatKey）作为第二道保险。P2 用的就是单机 P2 的运行时键位。
const REMOTE_PLAYER_KEY_LAYOUTS = {
  2: { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD },
  3: {
    up: 'b', down: 'e', left: 'f', right: 'semicolon',
    a: 'minus', b: 'equal', x: 'comma', y: 'period',
    l: 'slash', r: 'quote', l2: 'leftbracket', r2: 'rightbracket',
    l3: 'backquote', r3: 'tab', start: 'space', select: 'shift',
  },
  4: {
    // d / 8 / 0 与 P1 的键位（右=d、L2/L3…=8/0）撞车：构建时会由保留键机制自动换成
    // 池子里的空闲键（P4 只在四人房间出现，这些键同样只是内部中转）。P1 用不到的
    // 按钮的键也在保留集里，所以「按键设置里没有行的键」同样不会再被分出去。
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

// 备用键：房主把 P1 的键大量挪到上面这些键上时，池子会被保留集吃掉（这时远端某个
// 按钮就没键可用了）。这里补一批「项目里已经在用、房主平时不会按」的键：小键盘和
// 功能键。它们同样只是内部中转，房主真按到也会被 interceptRoomRemoteSeatKey 吞掉，
// 不会漏给远端玩家。避开了会触发浏览器行为的 F5 / F11 / F12。
const REMOTE_KEY_SPARE_POOL = [
  'numpad0', 'numpad1', 'numpad2', 'numpad3', 'numpad4',
  'numpad5', 'numpad6', 'numpad7', 'numpad8', 'numpad9',
  'kp_enter', 'kp_period', 'divide', 'multiply', 'subtract', 'add',
  'f13', 'f14', 'f15',
  'f3', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10',
]

const REMOTE_KEY_POOL = [...REMOTE_KEY_FALLBACK_POOL, ...REMOTE_KEY_SPARE_POOL]

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
      while (fallbackCursor < REMOTE_KEY_POOL.length && reserved.has(normalizeRetroarchKey(REMOTE_KEY_POOL[fallbackCursor]))) fallbackCursor++
      out[btn] = normalizeRetroarchKey(REMOTE_KEY_POOL[fallbackCursor]) || 'nul'
      fallbackCursor++
    }
    if (out[btn] && out[btn] !== 'nul') reserved.add(out[btn])
  }
  return out
}

// P1（房主）在房主这一侧会产生、并且 core 能收到的那批键，远端席位必须全部避开：
//   runtimeKeyboard —— 运行期注入用的键。core 里 P1 绑的就是这些（含平台用不到的
//                      按钮，比如 NES 的 L2/R2/L3/R3 保留着默认的 7/9/8/0）。
//   userKeyboard    —— 玩家物理键盘上属于 P1 的键。平台用不到的按钮在按键设置里没有
//                      行，但键还在存档里，房主按下去 core 一样能收到。
export function player1ReservedKeys(runtimeKeyboard = null, userKeyboard = null) {
  const out = []
  for (const source of [runtimeKeyboard, userKeyboard]) {
    for (const value of Object.values(source || {})) {
      const key = normalizeRetroarchKey(value)
      if (!key || key === 'nul') continue
      out.push(key)
    }
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

// keyMaps 可以由调用方传进来（房间走这条：core 配置与运行时注入必须用同一份键位表，
// 否则客人按下的键会被注入成另一个按钮/另一个玩家的键）。
export function buildRemotePlayersRetroarchConfig(maxPlayers = 4, reservedKeys = [], platformButtons = null, keyMaps = null) {
  const limit = Math.max(1, Math.min(4, Number(maxPlayers) || 4))
  const maps = keyMaps || buildRemotePlayerKeyMaps(limit, reservedKeys, platformButtons)
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