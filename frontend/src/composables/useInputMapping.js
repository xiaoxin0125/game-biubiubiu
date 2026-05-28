// User-customizable keyboard + gamepad mapping per virtual retropad button.
// Stored in localStorage, keyed by user id (guests share a single 'guest' slot).
// Drives VirtualGamepad/useGamepads dispatch and the InputSettings UI.

import { ref, computed, watch } from 'vue'
import { useAuth } from './useAuth.js'

export const RETROPAD_BUTTON_DEFS = [
  { key: 'up',     label: '上',      group: 'dpad' },
  { key: 'down',   label: '下',      group: 'dpad' },
  { key: 'left',   label: '左',      group: 'dpad' },
  { key: 'right',  label: '右',      group: 'dpad' },
  { key: 'a',      label: 'A',       group: 'face' },
  { key: 'b',      label: 'B',       group: 'face' },
  { key: 'x',      label: 'X',       group: 'face' },
  { key: 'y',      label: 'Y',       group: 'face' },
  { key: 'l',      label: 'L',       group: 'shoulder' },
  { key: 'r',      label: 'R',       group: 'shoulder' },
  { key: 'l2',     label: 'L2',      group: 'shoulder' },
  { key: 'r2',     label: 'R2',      group: 'shoulder' },
  { key: 'l3',     label: 'L3',      group: 'shoulder' },
  { key: 'r3',     label: 'R3',      group: 'shoulder' },
  { key: 'start',  label: 'Start',   group: 'system' },
  { key: 'select', label: 'Select',  group: 'system' },
]

const RETROPAD_BUTTON_KEYS = new Set(RETROPAD_BUTTON_DEFS.map((button) => button.key))

export const TURBO_FIRE_MS = 60

export function normalizeRetroarchKey(key) {
  if (key == null) return key
  const value = String(key).trim().toLowerCase()
  if (value === '') return value
  const aliases = {
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    ' ': 'space',
    ';': 'semicolon',
    '-': 'minus',
    '=': 'equals',
    equal: 'equals',
    ',': 'comma',
    '.': 'period',
    '/': 'slash',
    "'": 'quote',
    '[': 'leftbracket',
    ']': 'rightbracket',
    '`': 'backquote',
    delete: 'del',
    control: 'ctrl',
    leftcontrol: 'ctrl',
    rightcontrol: 'rctrl',
    numenter: 'kp_enter',
    numpadenter: 'kp_enter',
    decimal: 'kp_period',
    numdecimal: 'kp_period',
    numpaddecimal: 'kp_period',
    numdivide: 'divide',
    numpaddivide: 'divide',
    nummultiply: 'multiply',
    numpadmultiply: 'multiply',
    numsubtract: 'subtract',
    numpadsubtract: 'subtract',
    numadd: 'add',
    numpadadd: 'add',
  }
  if (/^numpad[0-9]$/.test(value)) return `numpad${value.slice(6)}`
  if (/^num[0-9]$/.test(value)) return `numpad${value.slice(3)}`
  if (/^kp_[0-9]$/.test(value)) return `numpad${value.slice(3)}`
  return aliases[value] || value
}

export function normalizeKeyboardEventKey(e) {
  if (!e) return ''
  const raw = e.key
  let key
  if (raw === 'ArrowUp') key = 'up'
  else if (raw === 'ArrowDown') key = 'down'
  else if (raw === 'ArrowLeft') key = 'left'
  else if (raw === 'ArrowRight') key = 'right'
  else if (raw === 'Enter') key = e.code === 'NumpadEnter' ? 'kp_enter' : 'enter'
  else if (raw === 'Shift') key = e.location === 2 ? 'rshift' : 'shift'
  else if (raw === 'Control') key = e.location === 2 ? 'rctrl' : 'ctrl'
  else if (raw === ' ') key = 'space'
  else if (raw === 'Delete') key = 'del'
  else if (/^Numpad[0-9]$/.test(e.code)) key = `numpad${e.code.slice(6)}`
  else if (/^[0-9]$/.test(raw)) key = raw
  else if (raw === ';') key = 'semicolon'
  else if (raw === '-' && e.code === 'NumpadSubtract') key = 'subtract'
  else if (raw === '-') key = 'minus'
  else if (raw === '=') key = 'equals'
  else if (raw === '/' && e.code === 'NumpadDivide') key = 'divide'
  else if (raw === '/') key = 'slash'
  else if (raw === '*' && e.code === 'NumpadMultiply') key = 'multiply'
  else if (raw === '*') key = 'multiply'
  else if (raw === '+') key = 'add'
  else if (raw === '.' && e.code === 'NumpadDecimal') key = 'kp_period'
  else if (raw === '.') key = 'period'
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(raw)) key = raw.toLowerCase()
  else key = raw?.length === 1 ? raw.toLowerCase() : String(raw || '').toLowerCase()
  return normalizeRetroarchKey(key)
}

export const TURBO_BUTTON_TARGETS = {}
export const BUTTON_DEFS = [...RETROPAD_BUTTON_DEFS]

const DEFAULT_KEYBOARD = {
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
    b: 'z', a: 'x', y: 'c', x: 'b', l: 'u', r: 'i',
  },
  genesis: {
    ...DEFAULT_KEYBOARD,
    b: 'z', a: 'x', y: 'c', x: 'b', l: 'u', r: 'i',
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

function isSavedDefaultKeyboard(storedKeyboard = {}) {
  const entries = Object.entries(storedKeyboard || {})
    .filter(([btn, key]) => RETROPAD_BUTTON_KEYS.has(btn) && key != null)
  if (!entries.length) return false
  return SAVED_DEFAULT_KEYBOARD_PROFILES.some((profile) =>
    entries.every(([btn, key]) => normalizeRetroarchKey(key) === profile[btn]),
  )
}

function isSavedLocalPlayer2DefaultKeyboard(storedKeyboard = {}) {
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

const DEFAULT_LOCAL_PLAYER_KEYBOARDS = {
  2: { ...EMPTY_KEYBOARD },
}

const LOCAL_PLAYER_RUNTIME_KEYBOARDS = {
  2: { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD },
}

function defaultLocalKeyboardForPlayer(player = 1, platform = null) {
  return Number(player) === 2 ? LOCAL_PLAYER2_DEFAULT_KEYBOARD : defaultPlayer1KeyboardForPlatform(platform)
}

export function localPlayer2RuntimeKeyboard() {
  return { ...LOCAL_PLAYER2_RUNTIME_KEYBOARD }
}

function keyboardStorageKeyForPlayer(player = 1) {
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
  for (let player = 1; player <= 4; player++) {
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) cfg[`input_player${player}_${btn}_btn`] = 'nul'
  }
  return cfg
}

const REMOTE_PLAYER_KEY_LAYOUTS = {
  2: {
    up: 'i', down: 'k', left: 'j', right: 'l',
    a: 'u', b: 'o', x: 'y', y: 't',
    l: 'n', r: 'm', l2: '7', r2: '9',
    l3: 'p', r3: 'v', start: 'h', select: 'g',
  },
  3: {
    up: 'b', down: 'e', left: 'f', right: 'semicolon',
    a: 'minus', b: 'equal', x: 'comma', y: 'period',
    l: 'slash', r: 'quote', l2: 'leftbracket', r2: 'rightbracket',
    l3: 'backquote', r3: 'tab', start: 'space', select: 'shift',
  },
  4: {
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

// Remote retropad buttons map to host-side reserved keyboard keys. These are
// generated from the current P1 mapping at runtime, so P1 custom bindings never
// get stolen by P2-P4.
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
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) cfg[`input_player${player}_${btn}_btn`] = 'nul'
  }
  return cfg
}

export function buildPlayer2RetroarchConfig() {
  return buildRemotePlayersRetroarchConfig(2)
}

export const GAMEPAD_PROFILE_DEFS = [
  { key: 'xbox', label: 'XBOX' },
  { key: 'ps4', label: 'PS4' },
  { key: 'ns', label: 'NS' },
  { key: 'generic', label: '通用手柄' },
]

export const DEFAULT_GAMEPAD_PROFILE = 'xbox'
const GAMEPAD_PROFILE_KEYS = new Set(GAMEPAD_PROFILE_DEFS.map((profile) => profile.key))

// numeric values are W3C Gamepad button indexes. The browser standardizes most
// modern pads to the same physical order; NS keeps a separate preset for users
// who expect Nintendo face-button labels.
const GAMEPAD_PROFILE_DEFAULTS = {
  xbox: {
    a: 1, b: 0, x: 3, y: 2,
    l: 4, r: 5, l2: 6, r2: 7,
    l3: 10, r3: 11,
    select: 8, start: 9,
    up: 12, down: 13, left: 14, right: 15,
  },
  ps4: {
    a: 1, b: 0, x: 3, y: 2,
    l: 4, r: 5, l2: 6, r2: 7,
    l3: 10, r3: 11,
    select: 8, start: 9,
    up: 12, down: 13, left: 14, right: 15,
  },
  ns: {
    a: 0, b: 1, x: 2, y: 3,
    l: 4, r: 5, l2: 6, r2: 7,
    l3: 10, r3: 11,
    select: 8, start: 9,
    up: 12, down: 13, left: 14, right: 15,
  },
  generic: {
    a: 1, b: 0, x: 3, y: 2,
    l: 4, r: 5, l2: 6, r2: 7,
    l3: 10, r3: 11,
    select: 8, start: 9,
    up: 12, down: 13, left: 14, right: 15,
  },
}

const DEFAULT_GAMEPAD = GAMEPAD_PROFILE_DEFAULTS[DEFAULT_GAMEPAD_PROFILE]

export function normalizeGamepadProfile(profile) {
  const key = String(profile || '').toLowerCase()
  return GAMEPAD_PROFILE_KEYS.has(key) ? key : DEFAULT_GAMEPAD_PROFILE
}

function cloneGamepadProfiles() {
  const out = {}
  for (const { key } of GAMEPAD_PROFILE_DEFS) out[key] = { ...GAMEPAD_PROFILE_DEFAULTS[key] }
  return out
}

function clonePlayerGamepads() {
  return {
    1: cloneGamepadProfiles(),
    2: cloneGamepadProfiles(),
  }
}

export function detectGamepadProfile(gamepadOrId = '') {
  const id = String(typeof gamepadOrId === 'string' ? gamepadOrId : gamepadOrId?.id || '').toLowerCase()
  if (/xbox|xinput|microsoft/.test(id)) return 'xbox'
  if (/dualshock|dualsense|wireless controller|sony|playstation/.test(id)) return 'ps4'
  if (/switch|joy-?con|pro controller|nintendo/.test(id)) return 'ns'
  return 'generic'
}

function storageKey(userId) { return `input-mapping:${userId || 'guest'}` }

function loadMapping(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}
function saveMapping(userId, mapping) {
  localStorage.setItem(storageKey(userId), JSON.stringify(mapping))
}

const INVALID_KEYBOARD_BINDINGS = new Set(['', 'nul', 'null', 'undefined', 'none', 'false'])

function isValidKeyboardBinding(key) {
  if (key == null) return false
  return !INVALID_KEYBOARD_BINDINGS.has(String(key).trim().toLowerCase())
}

function normalizeKeyboardMapping(storedKeyboard = {}, defaults = DEFAULT_KEYBOARD) {
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

function isValidGamepadBinding(idx) {
  if (idx == null || idx === '') return false
  if (typeof idx === 'number') return Number.isInteger(idx) && idx >= 0
  if (typeof idx === 'string' && /^\d+$/.test(idx.trim())) return true
  return false
}

function normalizeGamepadMapping(storedGamepad = {}, profile = DEFAULT_GAMEPAD_PROFILE) {
  const defaults = GAMEPAD_PROFILE_DEFAULTS[normalizeGamepadProfile(profile)] || DEFAULT_GAMEPAD
  const out = { ...defaults }
  for (const [btn, idx] of Object.entries(storedGamepad || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    if (!isValidGamepadBinding(idx)) continue
    out[btn] = typeof idx === 'number' ? idx : Number(idx)
  }
  return out
}

function normalizeGamepadProfiles(storedProfiles = {}) {
  const out = cloneGamepadProfiles()
  for (const { key: profile } of GAMEPAD_PROFILE_DEFS) {
    out[profile] = normalizeGamepadMapping(storedProfiles?.[profile], profile)
  }
  return out
}

function normalizePlayerGamepads(storedGamepads = null, legacyGamepad = null) {
  const out = clonePlayerGamepads()
  for (const player of [1, 2]) {
    const source = storedGamepads?.[player] || storedGamepads?.[String(player)]
    out[player] = normalizeGamepadProfiles(source)
  }
  if (legacyGamepad) {
    out[1][DEFAULT_GAMEPAD_PROFILE] = normalizeGamepadMapping(legacyGamepad, DEFAULT_GAMEPAD_PROFILE)
  }
  return out
}

function normalizeSelectedGamepadProfiles(stored = {}) {
  return {
    1: normalizeGamepadProfile(stored?.[1] || stored?.['1']),
    2: normalizeGamepadProfile(stored?.[2] || stored?.['2']),
  }
}

export function gamepadMappingFor(inputMapping = null, player = 1, profile = null) {
  const slot = Number(player) === 2 ? 2 : 1
  const activeProfile = normalizeGamepadProfile(profile || inputMapping?.gamepadProfiles?.[slot] || inputMapping?.gamepadProfiles?.[String(slot)])
  return normalizeGamepadMapping(inputMapping?.gamepads?.[slot]?.[activeProfile], activeProfile)
}

const mapping = ref({
  keyboard: { ...DEFAULT_KEYBOARD },
  keyboardP2: { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] },
  gamepadProfiles: {
    1: DEFAULT_GAMEPAD_PROFILE,
    2: DEFAULT_GAMEPAD_PROFILE,
  },
  gamepads: clonePlayerGamepads(),
  gamepad: { ...DEFAULT_GAMEPAD },
})
let loaded = false

function refreshForUser(userId) {
  const stored = loadMapping(userId)
  const gamepadProfiles = normalizeSelectedGamepadProfiles(stored?.gamepadProfiles)
  const gamepads = normalizePlayerGamepads(stored?.gamepads, stored?.gamepad)
  mapping.value = {
    keyboard: isSavedDefaultKeyboard(stored?.keyboard)
      ? { ...DEFAULT_KEYBOARD }
      : normalizeKeyboardMapping(stored?.keyboard),
    keyboardP2: isSavedLocalPlayer2DefaultKeyboard(stored?.keyboardP2)
      ? { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] }
      : normalizeKeyboardMapping(stored?.keyboardP2, DEFAULT_LOCAL_PLAYER_KEYBOARDS[2]),
    gamepadProfiles,
    gamepads,
    gamepad: { ...gamepads[1][gamepadProfiles[1]] },
  }
}

function withoutDuplicateBinding(current, btn, value) {
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

function withoutKeyboardValue(current, value) {
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

function withoutKeyboardValues(current, values = []) {
  let next = { ...current }
  for (const value of values) next = withoutKeyboardValue(next, value)
  return next
}

function sanitizeKeyboardSave(current) {
  const out = {}
  for (const [btn, key] of Object.entries(current || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    out[btn] = isValidKeyboardBinding(key) ? normalizeRetroarchKey(key) : null
  }
  return out
}

function sanitizeGamepadSave(current) {
  const out = {}
  for (const [btn, idx] of Object.entries(current || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    out[btn] = isValidGamepadBinding(idx) ? (typeof idx === 'number' ? idx : Number(idx)) : null
  }
  return out
}

export function buildPlayerRetroarchConfig(inputMapping, platformButtons = null, options = {}) {
  const cfg = {}
  const allowed = platformButtons ? new Set(platformButtons) : null
  const keyboard = normalizeKeyboardMapping(
    options.runtimeKeyboard || inputMapping?.keyboard,
    options.runtimeKeyboard || DEFAULT_KEYBOARD,
  )
  const includeNativeGamepad = options.includeNativeGamepad !== false
  const gamepad = includeNativeGamepad ? gamepadMappingFor(inputMapping, 1, options.gamepadProfile) : null
  for (const { key } of RETROPAD_BUTTON_DEFS) {
    const enabled = !allowed || allowed.has(key)
    cfg[`input_player1_${key}`] = enabled ? (keyboard[key] || 'nul') : 'nul'
    const gp = gamepad?.[key]
    if (includeNativeGamepad && enabled && typeof gp === 'number') cfg[`input_player1_${key}_btn`] = gp
    else cfg[`input_player1_${key}_btn`] = 'nul'
  }
  return cfg
}

export function useInputMapping() {
  const { user } = useAuth()

  if (!loaded) {
    loaded = true
    refreshForUser(user.value?.id)
    watch(() => user.value?.id, (id) => refreshForUser(id))
  }

  function setKeyboard(btn, key, player = 1, platform = null) {
    const slot = Number(player) === 2 ? 2 : 1
    const playerKey = keyboardStorageKeyForPlayer(slot)
    const otherSlot = slot === 2 ? 1 : 2
    const otherKey = keyboardStorageKeyForPlayer(otherSlot)
    const defaults = defaultLocalKeyboardForPlayer(slot, platform)
    const current = effectiveLocalKeyboardForPlayer(mapping.value, slot, platform)
    const normalized = isValidKeyboardBinding(key) ? normalizeRetroarchKey(key) : defaults[btn]
    const keyboard = sanitizeKeyboardSave(withoutDuplicateBinding(current, btn, normalized))
    const next = { ...mapping.value, [playerKey]: keyboard }
    if (isValidKeyboardBinding(normalized)) {
      const otherKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, otherSlot, platform)
      next[otherKey] = sanitizeKeyboardSave(withoutKeyboardValue(otherKeyboard, normalized))
    }
    mapping.value = next
    saveMapping(user.value?.id, mapping.value)
    return true
  }
  function setGamepadProfile(player = 1, profile = DEFAULT_GAMEPAD_PROFILE) {
    const slot = Number(player) === 2 ? 2 : 1
    const normalizedProfile = normalizeGamepadProfile(profile)
    const gamepadProfiles = {
      ...(mapping.value.gamepadProfiles || {}),
      [slot]: normalizedProfile,
    }
    const gamepads = normalizePlayerGamepads(mapping.value.gamepads, mapping.value.gamepad)
    mapping.value = {
      ...mapping.value,
      gamepadProfiles,
      gamepads,
      gamepad: { ...gamepads[1][gamepadProfiles[1]] },
    }
    saveMapping(user.value?.id, mapping.value)
  }
  function setGamepad(btn, idx, player = 1, profile = null) {
    const slot = Number(player) === 2 ? 2 : 1
    const gamepadProfiles = normalizeSelectedGamepadProfiles(mapping.value.gamepadProfiles)
    const activeProfile = normalizeGamepadProfile(profile || gamepadProfiles[slot])
    const gamepads = normalizePlayerGamepads(mapping.value.gamepads, mapping.value.gamepad)
    const current = gamepads[slot][activeProfile]
    const normalized = isValidGamepadBinding(idx)
      ? (typeof idx === 'number' ? idx : Number(idx))
      : GAMEPAD_PROFILE_DEFAULTS[activeProfile][btn]
    gamepads[slot] = {
      ...gamepads[slot],
      [activeProfile]: sanitizeGamepadSave(withoutDuplicateBinding(current, btn, normalized)),
    }
    mapping.value = {
      ...mapping.value,
      gamepadProfiles,
      gamepads,
      gamepad: { ...gamepads[1][gamepadProfiles[1]] },
    }
    saveMapping(user.value?.id, mapping.value)
  }
  function resetKeyboard(player = 1, platform = null) {
    const slot = Number(player) === 2 ? 2 : 1
    const playerKey = keyboardStorageKeyForPlayer(slot)
    const otherSlot = slot === 2 ? 1 : 2
    const otherKey = keyboardStorageKeyForPlayer(otherSlot)
    const defaults = { ...defaultLocalKeyboardForPlayer(slot, platform) }
    const next = { ...mapping.value, [playerKey]: defaults }
    const reserved = Object.values(defaults).filter(isValidKeyboardBinding).map((value) => normalizeRetroarchKey(value))
    const otherKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, otherSlot, platform)
    next[otherKey] = sanitizeKeyboardSave(withoutKeyboardValues(otherKeyboard, reserved))
    mapping.value = next
    saveMapping(user.value?.id, mapping.value)
  }
  function resetGamepad(player = 1, profile = null) {
    const slot = Number(player) === 2 ? 2 : 1
    const gamepadProfiles = normalizeSelectedGamepadProfiles(mapping.value.gamepadProfiles)
    const activeProfile = normalizeGamepadProfile(profile || gamepadProfiles[slot])
    const gamepads = normalizePlayerGamepads(mapping.value.gamepads, mapping.value.gamepad)
    gamepads[slot] = {
      ...gamepads[slot],
      [activeProfile]: { ...GAMEPAD_PROFILE_DEFAULTS[activeProfile] },
    }
    mapping.value = {
      ...mapping.value,
      gamepadProfiles,
      gamepads,
      gamepad: { ...gamepads[1][gamepadProfiles[1]] },
    }
    saveMapping(user.value?.id, mapping.value)
  }

  // Retroarch-style input config for player 1 derived from the current mapping.
  const retroarchConfig = computed(() => buildPlayerRetroarchConfig(mapping.value))

  return {
    mapping: computed(() => mapping.value),
    retroarchConfig,
    setKeyboard, setGamepad, setGamepadProfile,
    resetKeyboard, resetGamepad,
  }
}
