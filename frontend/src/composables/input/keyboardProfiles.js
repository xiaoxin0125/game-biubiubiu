import { RETROPAD_BUTTON_DEFS, RETROPAD_BUTTON_KEYS } from './buttons.js'
import { normalizeRetroarchKey } from './keyboardKeys.js'

export const DEFAULT_KEYBOARD = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  a: 'z', b: 'x',
  x: 'a', y: 's',
  l: 'q', r: 'w',
  l2: '1', r2: '3',
  l3: '2', r3: '4',
  start: 'enter', select: 'rshift',
}

const PLATFORM_DEFAULT_KEYBOARDS = {
  arcade: {
    ...DEFAULT_KEYBOARD,
    b: 'z', a: 'x', y: 'c', x: 'd',
    l: 'g', r: 'h',
  },
  megadrive: {
    ...DEFAULT_KEYBOARD,
    // Mirror the pad: A/S/D = MD X/Y/Z (top row), Z/X/C = MD A/B/C (bottom).
    // retropad keys per core mapping: y=A, b=B, a=C, l=X, x=Y, r=Z.
    a: 'c', b: 'x', y: 'z', x: 's', l: 'a', r: 'd',
  },
  genesis: {
    ...DEFAULT_KEYBOARD,
    a: 'c', b: 'x', y: 'z', x: 's', l: 'a', r: 'd',
  },
}

export const DEFAULT_PLAYER1_RUNTIME_KEYBOARD = { ...DEFAULT_KEYBOARD }

export function defaultPlayer1KeyboardForPlatform(platform = null) {
  return PLATFORM_DEFAULT_KEYBOARDS[platform] || DEFAULT_KEYBOARD
}

const SAVED_DEFAULT_KEYBOARD_PROFILES = [
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'x', b: 'z',
    x: 's', y: 'a',
    l: 'q', r: 'w',
    l2: '1', r2: '3',
    l3: '2', r3: '4',
    start: 'enter', select: 'rshift',
  },
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
    entries.every(([btn, key]) => normalizeRetroarchKey(key) === profile[btn]),
  )
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
  ]
  return legacyProfiles.some((profile) =>
    entries.every(([btn, key]) => normalizeRetroarchKey(key) === profile[btn]),
  )
}

const EMPTY_KEYBOARD = {
  up: null, down: null, left: null, right: null,
  a: null, b: null, x: null, y: null,
  l: null, r: null, l2: null, r2: null,
  l3: null, r3: null, start: null, select: null,
}

const LOCAL_PLAYER2_DEFAULT_KEYBOARD = {
  up: 'numpad8', down: 'numpad2', left: 'numpad4', right: 'numpad6',
  a: 'numpad1', b: 'numpad3', x: 'numpad7', y: 'numpad9',
  l: 'divide', r: 'multiply', l2: 'subtract', r2: 'add',
  l3: 'kp_period', r3: 'numpad5', start: 'kp_enter', select: 'numpad0',
}

const LOCAL_PLAYER2_RUNTIME_KEYBOARD = {
  up: 'i', down: 'k', left: 'j', right: 'l',
  a: 'u', b: 'o', x: 'y', y: 't',
  l: 'n', r: 'm', l2: '7', r2: '9',
  l3: 'p', r3: 'v', start: 'h', select: 'g',
}

export const DEFAULT_LOCAL_PLAYER_KEYBOARDS = {
  2: { ...EMPTY_KEYBOARD },
}

const LOCAL_PLAYER_RUNTIME_KEYBOARDS = {
  2: { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD },
}

export function defaultLocalKeyboardForPlayer(player = 1, platform = null) {
  return Number(player) === 2 ? LOCAL_PLAYER2_DEFAULT_KEYBOARD : defaultPlayer1KeyboardForPlatform(platform)
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
  const stored = inputMapping?.[keyboardStorageKeyForPlayer(player)]
  if (Number(player) === 1 && platform && keyboardMatchesProfile(stored, DEFAULT_KEYBOARD)) {
    return { ...defaults }
  }
  return normalizeKeyboardMapping(stored, defaults)
}

export function effectiveLocalKeyboardForPlayer(inputMapping = null, player = 1, platform = null) {
  const defaults = defaultLocalKeyboardForPlayer(player, platform)
  const stored = inputMapping?.[keyboardStorageKeyForPlayer(player)]
  if (Number(player) === 1 && platform && keyboardMatchesProfile(stored, DEFAULT_KEYBOARD)) {
    return { ...defaults }
  }
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