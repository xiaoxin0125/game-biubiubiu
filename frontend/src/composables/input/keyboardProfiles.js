import { RETROPAD_BUTTON_DEFS, RETROPAD_BUTTON_KEYS } from './buttons.js'
import { normalizeRetroarchKey } from './keyboardKeys.js'
import { resolvePlatformId } from '../../constants/platforms.js'

// 默认键位按“手区 + 方位”排：P1 用左手十字 + 右手按键，P2 用右手十字 + 数字
// 小键盘。同一块键盘上所有参与者的键必须互不重叠（见 remotePlayers.js 与
// tests/input-keyboard-defaults.test.js），否则一个键会同时触发两名玩家。
export const DEFAULT_KEYBOARD = {
  up: 'w', down: 's', left: 'a', right: 'd',
  a: 'j', b: 'k',
  x: 'i', y: 'o',
  l: 'u', r: 'p',
  l2: '7', r2: '9',
  l3: '8', r3: '0',
  start: 'enter', select: 'rshift',
}

// 街机六键（界面标签 A B C D E F）：下排 J K L = A B C，上排 U I O = D E F。
// retropad 与游戏按键不是一一对应（见 constants/platforms.js 的 BUTTON_LABELS），
// 所以这里按“界面上显示的标签”落键。
const ARCADE_KEYBOARD = {
  ...DEFAULT_KEYBOARD,
  b: 'j', a: 'k', y: 'l',
  x: 'u', l: 'i', r: 'o',
}

// MD / Genesis 六键：镜像手柄的两排按键 —— 下排 J K L = A B C，上排 U I O = X Y Z。
// genesis_plus_gx / picodrive 的 retropad 映射：y=A, b=B, a=C, l=X, x=Y, r=Z。
// 32X 用的是同一只六键手柄，默认键位与 MD 完全一致（见 PLATFORM_DEFAULT_KEYBOARDS）。
const MEGADRIVE_KEYBOARD = {
  ...DEFAULT_KEYBOARD,
  y: 'j', b: 'k', a: 'l',
  l: 'u', x: 'i', r: 'o',
}

// SMS / Game Gear 只有两颗按键，界面按 1 / 2 标注；核心里 retropad b→1、a→2，
// 所以 1 落 J、2 落 K（见 constants/platforms.js 的 BUTTON_LABELS.sms）。
const SMS_KEYBOARD = {
  ...DEFAULT_KEYBOARD,
  a: 'k', b: 'j',
}

// PC Engine / PCE-CD 的六键手柄：界面上的 III / IV 是 retropad y / x，落在 I / O；
// 「模式」（Avenue Pad 6 的 2 / 6 切换键，retropad l2）落在 M。
const PCE_KEYBOARD = {
  ...DEFAULT_KEYBOARD,
  x: 'o', y: 'i', l2: 'm',
}

// 3DO 手柄的面键从左到右是 A B C；核心里 retropad y→A、b→B、a→C
// （见 constants/platforms.js 的 BUTTON_LABELS['3do']），按界面标签落 J / K / L。
const THREEDO_KEYBOARD = {
  ...DEFAULT_KEYBOARD,
  y: 'j', b: 'k', a: 'l',
}

// J2ME 的复刻对象是一部手机，键盘就照手机键盘摆：数字小键盘上同样数字的那几颗键
// 就是手机的 1 / 3 / 5 / 7 / 9 / 0（retropad 的 x / a / l2 / y / b / r2，标签见
// constants/platforms.js 的 BUTTON_LABELS.j2me），0 旁边那颗 . 是 *、小键盘回车是 #。
// 两块软键（select = 左软键 / start = 右软键）落在主回车与右 Shift 上；十字仍是 WASD，
// 所以两只手一边管方向、一边管手机键盘，互不交叉。
const J2ME_KEYBOARD = {
  ...DEFAULT_KEYBOARD,
  x: 'numpad1', a: 'numpad3', l2: 'numpad5',
  y: 'numpad7', b: 'numpad9', r2: 'numpad0',
  l: 'kp_period', r: 'kp_enter',
  select: 'enter', start: 'rshift',
}

const PLATFORM_DEFAULT_KEYBOARDS = {
  arcade: ARCADE_KEYBOARD,
  megadrive: MEGADRIVE_KEYBOARD,
  sega32x: MEGADRIVE_KEYBOARD,
  sms: SMS_KEYBOARD,
  gamegear: SMS_KEYBOARD,
  pcengine: PCE_KEYBOARD,
  pcecd: PCE_KEYBOARD,
  '3do': THREEDO_KEYBOARD,
  j2me: J2ME_KEYBOARD,
}

export const DEFAULT_PLAYER1_RUNTIME_KEYBOARD = { ...DEFAULT_KEYBOARD }

export function defaultPlayer1KeyboardForPlatform(platform = null) {
  return PLATFORM_DEFAULT_KEYBOARDS[resolvePlatformId(platform)] || DEFAULT_KEYBOARD
}

// 有自己默认键位的平台，改键时写进属于自己的那一格（keyboardsByPlatform[平台]），
// 不再覆盖账号共用的 keyboard / keyboardP2。否则在 J2ME 里按一下「重置键盘」，整套
// 手机小键盘键位会写进共用存档，切到 NES 也全变成小键盘 —— 玩家看到的就是「改一个
// 平台，所有平台都跟着变」。没有平台默认键位的平台仍然共用那一份存档。
export function platformKeyboardProfileId(platform = null) {
  const id = resolvePlatformId(platform)
  return Object.prototype.hasOwnProperty.call(PLATFORM_DEFAULT_KEYBOARDS, id) ? id : null
}

/** 这个平台自己保存的 P1 键位；没有就是 null（沿用共用存档 / 平台默认）。 */
export function platformKeyboardForPlayer(inputMapping = null, platform = null) {
  const id = platformKeyboardProfileId(platform)
  const stored = id ? inputMapping?.keyboardsByPlatform?.[id] : null
  return stored && typeof stored === 'object' ? stored : null
}

/** 读存档时只保留认识的平台与合法按键。 */
export function sanitizePlatformKeyboards(stored = null) {
  const out = {}
  for (const [id, value] of Object.entries(stored || {})) {
    if (!PLATFORM_DEFAULT_KEYBOARDS[id] || !value || typeof value !== 'object') continue
    const keyboard = sanitizeKeyboardSave(value)
    if (Object.keys(keyboard).length) out[id] = keyboard
  }
  return out
}

/** 把一份 P1 / P2 键位写回 mapping：有平台专属格子的 P1 写那一格，其余写共用存档。 */
export function withPlayerKeyboard(inputMapping = {}, player = 1, keyboard = {}, platform = null) {
  const slot = Number(player) === 2 ? 2 : 1
  const profileId = slot === 1 ? platformKeyboardProfileId(platform) : null
  const next = { ...inputMapping }
  if (!profileId) {
    next[keyboardStorageKeyForPlayer(slot)] = keyboard
    return next
  }
  next.keyboardsByPlatform = {
    ...(inputMapping.keyboardsByPlatform || {}),
    [profileId]: keyboard,
  }
  return next
}

// 历史默认键位。存下来的映射只要和某一版历史默认完全一致，就当成“用户没改过”，
// refreshForUser 会把它升级成当前默认；自己改过键的账号不受影响。
// 每次改默认键位，都要把被替换掉的那一版加到这里来。
const SAVED_DEFAULT_KEYBOARD_PROFILES = [
  // 上一版默认：方向键 + Z/X/A/S + 1/2/3/4
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'z', b: 'x',
    x: 'a', y: 's',
    l: 'q', r: 'w',
    l2: '1', r2: '3',
    l3: '2', r3: '4',
    start: 'enter', select: 'rshift',
  },
  // 上一版的街机默认：下排 Z X C / 上排 D G H
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'x', b: 'z',
    x: 'd', y: 'c',
    l: 'g', r: 'h',
    l2: '1', r2: '3',
    l3: '2', r3: '4',
    start: 'enter', select: 'rshift',
  },
  // 上一版的 MD / Genesis 默认：A/S/D + Z/X/C 镜像手柄两排
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'c', b: 'x',
    x: 's', y: 'z',
    l: 'a', r: 'd',
    l2: '1', r2: '3',
    l3: '2', r3: '4',
    start: 'enter', select: 'rshift',
  },
  // 更早的一版：A/B 左右相反
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'x', b: 'z',
    x: 's', y: 'a',
    l: 'q', r: 'w',
    l2: '1', r2: '3',
    l3: '2', r3: '4',
    start: 'enter', select: 'rshift',
  },
  // 更早的一版
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'x', b: 'z',
    x: 's', y: 'a',
    l: 'd', r: 'f',
    l2: 'g', r2: 'h',
    l3: 'c', r3: 'v',
    start: 'b', select: 'n',
  },
]

export function isSavedDefaultKeyboard(storedKeyboard = {}) {
  const entries = Object.entries(storedKeyboard || {})
    .filter(([btn, key]) => RETROPAD_BUTTON_KEYS.has(btn) && key != null)
  if (!entries.length) return false
  return SAVED_DEFAULT_KEYBOARD_PROFILES.some((profile) =>
    entries.every(([btn, key]) => normalizeRetroarchKey(key) === normalizeRetroarchKey(profile[btn])),
  )
}

// J2ME 专属的那几颗键（十字与 L3/R3 两边相同，看它们没有意义）。这一份用来认出
// 「被整套写进共用存档」的 J2ME 键位，见 isJ2meKeyboardProfile。
const J2ME_SIGNATURE_BUTTONS = ['a', 'b', 'x', 'y', 'l', 'r', 'l2', 'r2', 'select', 'start']

// v1.7.3 在 J2ME 里改键时，会把整套手机键位写进账号共用的 keyboard（当年的 setKeyboard
// 保存的是生效中的整份键位），其它平台随后也套用了这份“自定义键位”。下面这份判断
// 认出它：J2ME 专属的十颗键里至少六颗与 J2ME 默认一致。允许几颗不同，是因为玩家可能
// 在 J2ME 里改过几颗键；而其它任何一套默认（通用 / 街机 / MD）在这十颗键上一颗都
// 对不上，正常自定义出来的小键盘键位也不会长成手机键盘这个样子。认出来之后由
// refreshForUser 搬回 J2ME 自己的格子，共用存档恢复成通用默认。
export function isJ2meKeyboardProfile(storedKeyboard = null) {
  if (!storedKeyboard || typeof storedKeyboard !== 'object') return false
  for (const btn of J2ME_SIGNATURE_BUTTONS) {
    if (!isValidKeyboardBinding(storedKeyboard[btn])) return false
  }
  const matches = J2ME_SIGNATURE_BUTTONS.filter((btn) =>
    normalizeRetroarchKey(storedKeyboard[btn]) === normalizeRetroarchKey(J2ME_KEYBOARD[btn]),
  )
  return matches.length >= J2ME_SIGNATURE_BUTTONS.length - 4
}

export function isSavedLocalPlayer2DefaultKeyboard(storedKeyboard = {}) {
  const entries = Object.entries(storedKeyboard || {})
    .filter(([btn, key]) => RETROPAD_BUTTON_KEYS.has(btn) && key != null)
  if (!entries.length) return false
  const legacyProfiles = [
    {
      up: 'i', down: 'k', left: 'j', right: 'l',
      a: 'u', b: 'o', x: 'y', y: 't',
      l: 'q', r: 'w', l2: 'e', r2: 'r',
      l3: 'p', r3: 'semicolon', start: 'space', select: 'tab',
    },
    {
      up: '8', down: '2', left: '4', right: '6',
      a: '1', b: '3', x: '7', y: '9',
      l: 'subtract', r: 'add', l2: null, r2: null,
      l3: null, r3: null, start: 'kp_enter', select: '0',
    },
    {
      up: 'numpad8', down: 'numpad2', left: 'numpad4', right: 'numpad6',
      a: 'numpad1', b: 'numpad3', x: 'numpad7', y: 'numpad9',
      l: 'subtract', r: 'add', l2: null, r2: null,
      l3: null, r3: null, start: 'kp_enter', select: 'numpad0',
    },
    // 上一版默认：小键盘 8/2/4/6 方向 + 四角面键 + 运算符肩键
    {
      up: 'numpad8', down: 'numpad2', left: 'numpad4', right: 'numpad6',
      a: 'numpad1', b: 'numpad3', x: 'numpad7', y: 'numpad9',
      l: 'divide', r: 'multiply', l2: 'subtract', r2: 'add',
      l3: 'kp_period', r3: 'numpad5', start: 'kp_enter', select: 'numpad0',
    },
  ]
  return legacyProfiles.some((profile) =>
    entries.every(([btn, key]) => normalizeRetroarchKey(key) === normalizeRetroarchKey(profile[btn])),
  )
}

// 单人双打的 P2 默认键位：方向键管十字，其余按小键盘的行成对铺开 ——
// 1/2 = A/B，4/5 = X/Y，7/8 = L/R，0 与 . = L2/R2，6 与 3 = L3/R3，
// Enter = Start，+ = Select。
const LOCAL_PLAYER2_DEFAULT_KEYBOARD = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  a: 'numpad1', b: 'numpad2',
  x: 'numpad4', y: 'numpad5',
  l: 'numpad7', r: 'numpad8',
  l2: 'numpad0', r2: 'kp_period',
  l3: 'numpad6', r3: 'numpad3',
  start: 'kp_enter', select: 'add',
}

// P2 交给 core 的运行时键位：玩家在按键设置里看到的是上面那张小键盘表，前端把玩家的
// P2 按键换算成这一套再发给 core（core 只监听这里的键）。必须与 P1 的默认（含街机 /
// MD / 手机键位）以及远端玩家的键位完全不重叠，否则一个键会同时触发两名玩家。
// remotePlayers.js 里远端 P2 用的就是这一份。
// select 用 F4：PCE 的「模式」默认落在 M 上，原来这里也是 M，按一下会同时触发
// P1 的模式与 P2 的 select；F4 不在任何平台的 P1 默认里，也没有浏览器快捷键。
export const LOCAL_PLAYER2_RUNTIME_KEYBOARD = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  a: 'z', b: 'x', x: 'v', y: 'n',
  l: 'q', r: 'y',
  l2: 'f1', r2: 'f2',
  l3: 'g', r3: 'h',
  start: 't', select: 'f4',
}

export const DEFAULT_LOCAL_PLAYER_KEYBOARDS = {
  2: { ...LOCAL_PLAYER2_DEFAULT_KEYBOARD },
}

const LOCAL_PLAYER_RUNTIME_KEYBOARDS = {
  2: { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD },
}

// 街机六键（界面标签 A B C D E F）和 MD / Genesis 六键（A B C / X Y Z）在小键盘上
// 各占两排：下排 = 1 2 3，上排 = 4 5 6，按各平台自己的按键顺序落键（和 P1 的
// J K L / U I O 一个道理）。L2/R2/L3/R3 这两个平台用不到，按通用的“外侧 + 剩下的
// 角”补位：0 与 . 给 L2/R2，7 与 8 给 L3/R3（1-6 已被六键占用）。
const ARCADE_LOCAL_PLAYER2_KEYBOARD = {
  ...LOCAL_PLAYER2_DEFAULT_KEYBOARD,
  b: 'numpad1', a: 'numpad2', y: 'numpad3',
  x: 'numpad4', l: 'numpad5', r: 'numpad6',
  l3: 'numpad7', r3: 'numpad8',
}

const MEGADRIVE_LOCAL_PLAYER2_KEYBOARD = {
  ...LOCAL_PLAYER2_DEFAULT_KEYBOARD,
  y: 'numpad1', b: 'numpad2', a: 'numpad3',
  l: 'numpad4', x: 'numpad5', r: 'numpad6',
  l3: 'numpad7', r3: 'numpad8',
}

const PLATFORM_LOCAL_PLAYER2_DEFAULT_KEYBOARDS = {
  arcade: ARCADE_LOCAL_PLAYER2_KEYBOARD,
  megadrive: MEGADRIVE_LOCAL_PLAYER2_KEYBOARD,
  sega32x: MEGADRIVE_LOCAL_PLAYER2_KEYBOARD,
}

export function defaultLocalKeyboardForPlayer(player = 1, platform = null) {
  if (Number(player) === 2) {
    return PLATFORM_LOCAL_PLAYER2_DEFAULT_KEYBOARDS[resolvePlatformId(platform)] || LOCAL_PLAYER2_DEFAULT_KEYBOARD
  }
  return defaultPlayer1KeyboardForPlatform(platform)
}

export function localPlayer2RuntimeKeyboard() {
  return { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD }
}

export function keyboardStorageKeyForPlayer(player = 1) {
  return Number(player) === 2 ? 'keyboardP2' : 'keyboard'
}

function defaultKeyboardForPlayer(player = 1, platform = null) {
  return Number(player) === 2 ? DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] : defaultPlayer1KeyboardForPlatform(platform)
}

function keyboardMatchesProfile(keyboard = {}, profile = {}) {
  const keys = new Set([...Object.keys(keyboard || {}), ...Object.keys(profile || {})])
  for (const key of keys) {
    if (normalizeRetroarchKey(keyboard?.[key]) !== normalizeRetroarchKey(profile?.[key])) return false
  }
  return true
}

const INVALID_KEYBOARD_BINDINGS = new Set(['', 'nul', 'null', 'undefined', 'none', 'false'])

export function isValidKeyboardBinding(key) {
  if (key == null) return false
  return !INVALID_KEYBOARD_BINDINGS.has(String(key).trim().toLowerCase())
}

export function normalizeKeyboardMapping(storedKeyboard = {}, defaults = DEFAULT_KEYBOARD) {
  const out = { ...defaults }
  for (const [btn, key] of Object.entries(storedKeyboard || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    if (!isValidKeyboardBinding(key)) continue
    const normalized = normalizeRetroarchKey(key)
    if (!isValidKeyboardBinding(normalized)) continue
    out[btn] = normalized
  }
  return out
}

export function effectiveKeyboardForPlayer(inputMapping = null, player = 1, platform = null) {
  const defaults = defaultKeyboardForPlayer(player, platform)
  // 有自己默认键位的平台（J2ME / 街机 / MD）优先读它自己那一格：在那里改键只改
  // 这个平台，别的平台继续用共用存档里的那一份。
  if (Number(player) !== 2) {
    const scoped = platformKeyboardForPlayer(inputMapping, platform)
    if (scoped) return normalizeKeyboardMapping(scoped, defaults)
  }
  const stored = inputMapping?.[keyboardStorageKeyForPlayer(player)]
  if (Number(player) === 1 && platform && keyboardMatchesProfile(stored, DEFAULT_KEYBOARD)) {
    return { ...defaults }
  }
  return normalizeKeyboardMapping(stored, defaults)
}

export function effectiveLocalKeyboardForPlayer(inputMapping = null, player = 1, platform = null) {
  const defaults = defaultLocalKeyboardForPlayer(player, platform)
  if (Number(player) !== 2) {
    const scoped = platformKeyboardForPlayer(inputMapping, platform)
    if (scoped) return normalizeKeyboardMapping(scoped, defaults)
  }
  const stored = inputMapping?.[keyboardStorageKeyForPlayer(player)]
  // 存下来的还是“没改过”的默认（P1 比通用默认、P2 比通用 P2 默认）时，套用当前平台
  // 的默认键位；用户自己改过键就整份保留。
  const unmodified = Number(player) === 2
    ? keyboardMatchesProfile(stored, LOCAL_PLAYER2_DEFAULT_KEYBOARD)
    : keyboardMatchesProfile(stored, DEFAULT_KEYBOARD)
  if (platform && unmodified) return { ...defaults }
  return normalizeKeyboardMapping(stored, defaults)
}

function localPlayerKeys(player, platformButtons = null, inputMapping = null) {
  const preferred = effectiveLocalKeyboardForPlayer(inputMapping, player)
  const allowed = platformButtons ? new Set(platformButtons) : null
  const out = {}
  for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
    if (allowed && !allowed.has(btn)) continue
    const key = normalizeRetroarchKey(preferred[btn])
    if (key) out[btn] = key
  }
  return out
}

export function buildLocalPlayerKeyboardMap(player = 2, platformButtons = null, inputMapping = null) {
  const slot = Number(player) === 2 ? 2 : 1
  const source = inputMapping || { [keyboardStorageKeyForPlayer(slot)]: LOCAL_PLAYER_RUNTIME_KEYBOARDS[slot] }
  return localPlayerKeys(slot, platformButtons, source)
}

export function buildLocalMultiplayerRetroarchConfig(maxPlayers = 2, platformButtons = null, inputMapping = null) {
  const limit = Math.max(1, Math.min(2, Number(maxPlayers) || 1))
  const cfg = { input_max_users: limit }
  const allowed = platformButtons ? new Set(platformButtons) : null
  for (let player = 1; player <= limit; player++) {
    cfg[`input_libretro_device_p${player}`] = 1
    cfg[`input_player${player}_analog_dpad_mode`] = 1
  }
  for (let player = 2; player <= limit; player++) {
    const keyMap = inputMapping === null
      ? localPlayer2RuntimeKeyboard()
      : buildLocalPlayerKeyboardMap(player, platformButtons, inputMapping)
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      const key = allowed && !allowed.has(btn) ? 'nul' : normalizeRetroarchKey(keyMap[btn])
      cfg[`input_player${player}_${btn}`] = key || 'nul'
    }
  }
  for (let player = 1; player < 4; player++) {
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      cfg[`input_player${player}_${btn}_btn`] = 'nul'
      cfg[`input_player${player}_${btn}_axis`] = 'nul'
    }
  }
  return cfg
}

export function withoutDuplicateBinding(current, btn, value) {
  const next = { ...current }
  const normalized = isValidKeyboardBinding(value) ? normalizeRetroarchKey(value) : null
  for (const key of Object.keys(next)) {
    if (!RETROPAD_BUTTON_KEYS.has(key)) {
      delete next[key]
      continue
    }
    const other = isValidKeyboardBinding(next[key]) ? normalizeRetroarchKey(next[key]) : null
    if (key !== btn && normalized != null && other === normalized) next[key] = null
  }
  next[btn] = value
  return next
}

export function withoutKeyboardValue(current, value) {
  const next = { ...current }
  const normalized = isValidKeyboardBinding(value) ? normalizeRetroarchKey(value) : null
  if (normalized == null) return next
  for (const key of Object.keys(next)) {
    if (!RETROPAD_BUTTON_KEYS.has(key)) {
      delete next[key]
      continue
    }
    const other = isValidKeyboardBinding(next[key]) ? normalizeRetroarchKey(next[key]) : null
    if (other === normalized) next[key] = null
  }
  return next
}

export function withoutKeyboardValues(current, values = []) {
  let next = { ...current }
  for (const value of values) next = withoutKeyboardValue(next, value)
  return next
}

export function sanitizeKeyboardSave(current) {
  const out = {}
  for (const [btn, key] of Object.entries(current || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    out[btn] = isValidKeyboardBinding(key) ? normalizeRetroarchKey(key) : null
  }
  return out
}