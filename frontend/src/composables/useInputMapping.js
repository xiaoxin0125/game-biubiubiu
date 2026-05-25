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
    numenter: 'kp_enter',
    decimal: 'kp_period',
    numdivide: 'divide',
    nummultiply: 'multiply',
    numsubtract: 'subtract',
    numadd: 'add',
  }
  if (/^numpad[0-9]$/.test(value)) return value.slice(6)
  if (/^num[0-9]$/.test(value)) return value.slice(3)
  if (/^kp_[0-9]$/.test(value)) return value.slice(3)
  return aliases[value] || value
}

export const TURBO_BUTTON_TARGETS = {
  aa: 'a',
  bb: 'b',
  xx: 'x',
  yy: 'y',
  ll: 'l',
  rr: 'r',
  l2l2: 'l2',
  r2r2: 'r2',
}

export const TURBO_BUTTON_DEFS = Object.entries(TURBO_BUTTON_TARGETS).map(([key, target]) => {
  const base = RETROPAD_BUTTON_DEFS.find((btn) => btn.key === target)
  return {
    key,
    label: `${base?.label || target.toUpperCase()}${base?.label || target.toUpperCase()}`,
    group: base?.group || 'face',
    turboTarget: target,
  }
})

export const BUTTON_DEFS = [...RETROPAD_BUTTON_DEFS, ...TURBO_BUTTON_DEFS]

const DEFAULT_KEYBOARD = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  a: 'z', b: 'x',
  x: 'a', y: 's',
  l: 'q', r: 'w',
  l2: null, r2: null,
  l3: null, r3: null,
  start: 'enter', select: 'rshift',
  aa: 'n', bb: 'm', xx: 'o', yy: 'k',
  ll: null, rr: null, l2l2: null, r2r2: null,
}

const PLATFORM_DEFAULT_KEYBOARDS = {
  arcade: {
    ...DEFAULT_KEYBOARD,
    b: 'z', a: 'x', y: 'c', x: 'd',
    l: 'g', r: 'h',
    bb: 'n', aa: 'm', yy: 'j', xx: 'f',
    ll: 't', rr: 'y',
  },
  megadrive: {
    ...DEFAULT_KEYBOARD,
    b: 'z', a: 'x', y: 'c', x: 'b', l: 'u', r: 'i',
    bb: 'n', aa: 'm', yy: 'j', xx: 'k', ll: 'o', rr: 'p',
  },
  genesis: {
    ...DEFAULT_KEYBOARD,
    b: 'z', a: 'x', y: 'c', x: 'b', l: 'u', r: 'i',
    bb: 'n', aa: 'm', yy: 'j', xx: 'k', ll: 'o', rr: 'p',
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
    aa: 'c', bb: 'd', xx: 'e', yy: 'f',
    ll: '5', rr: '6', l2l2: '8', r2r2: '0',
  },
  {
    up: 'up', down: 'down', left: 'left', right: 'right',
    a: 'x', b: 'z',
    x: 's', y: 'a',
    l: 'd', r: 'f',
    l2: 'g', r2: 'h',
    l3: 'c', r3: 'v',
    start: 'b', select: 'n',
    aa: null, bb: null, xx: null, yy: null,
    ll: null, rr: null, l2l2: null, r2r2: null,
  },
]

function isSavedDefaultKeyboard(storedKeyboard = {}) {
  const entries = Object.entries(storedKeyboard || {})
    .filter(([, key]) => key != null)
  if (!entries.length) return false
  return SAVED_DEFAULT_KEYBOARD_PROFILES.some((profile) =>
    entries.every(([btn, key]) => normalizeRetroarchKey(key) === profile[btn]),
  )
}

function isSavedLocalPlayer2DefaultKeyboard(storedKeyboard = {}) {
  const entries = Object.entries(storedKeyboard || {})
    .filter(([, key]) => key != null)
  if (!entries.length) return false
  const legacyProfiles = [
    {
      up: 'i', down: 'k', left: 'j', right: 'l',
      a: 'u', b: 'o', x: 'y', y: 't',
      l: 'q', r: 'w', l2: 'e', r2: 'r',
      l3: 'p', r3: 'semicolon', start: 'space', select: 'tab',
      aa: null, bb: null, xx: null, yy: null,
      ll: null, rr: null, l2l2: null, r2r2: null,
    },
    {
      up: '8', down: '2', left: '4', right: '6',
      a: '1', b: '3', x: '7', y: '9',
      l: 'subtract', r: 'add', l2: null, r2: null,
      l3: null, r3: null, start: 'kp_enter', select: '0',
      aa: null, bb: null, xx: null, yy: null,
      ll: null, rr: null, l2l2: null, r2r2: null,
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
  aa: null, bb: null, xx: null, yy: null,
  ll: null, rr: null, l2l2: null, r2r2: null,
}

const DEFAULT_LOCAL_PLAYER_KEYBOARDS = {
  2: { ...EMPTY_KEYBOARD },
}

const LOCAL_PLAYER_RUNTIME_KEYBOARDS = {
  2: {
    up: 'i', down: 'k', left: 'j', right: 'l',
    a: 'u', b: 'o', x: 'y', y: 't',
    l: 'q', r: 'w', l2: 'e', r2: 'r',
    l3: 'p', r3: 'semicolon', start: 'space', select: 'tab',
    aa: null, bb: null, xx: null, yy: null,
    ll: null, rr: null, l2l2: null, r2r2: null,
  },
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

function localPlayerKeys(player, platformButtons = null, inputMapping = null) {
  const preferred = effectiveKeyboardForPlayer(inputMapping, player)
  const allowed = platformButtons ? new Set(platformButtons) : null
  const out = {}
  for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
    if (allowed && !allowed.has(btn)) continue
    const key = normalizeRetroarchKey(preferred[btn])
    if (key) out[btn] = key
  }
  return out
}

export function buildLocalPlayerKeyboardMap(player = 2, platformButtons = null) {
  return localPlayerKeys(player, platformButtons, { [keyboardStorageKeyForPlayer(player)]: LOCAL_PLAYER_RUNTIME_KEYBOARDS[player] })
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
    const keyMap = buildLocalPlayerKeyboardMap(player, platformButtons)
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      if (allowed && !allowed.has(btn)) continue
      const key = normalizeRetroarchKey(keyMap[btn])
      if (key) cfg[`input_player${player}_${btn}`] = key
    }
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
      if (allowed && !allowed.has(btn)) continue
      const key = normalizeRetroarchKey(keyMap[btn])
      if (key) cfg[`input_player${player}_${btn}`] = key
    }
  }
  return cfg
}

export function buildPlayer2RetroarchConfig() {
  return buildRemotePlayersRetroarchConfig(2)
}

// numeric values are W3C Gamepad button indexes (Xbox layout).
const DEFAULT_GAMEPAD = {
  a: 1, b: 0, x: 3, y: 2,
  l: 4, r: 5, l2: 6, r2: 7,
  l3: 10, r3: 11,
  select: 8, start: 9,
  up: 12, down: 13, left: 14, right: 15,
  aa: null, bb: null, xx: null, yy: null,
  ll: null, rr: null, l2l2: null, r2r2: null,
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

function normalizeGamepadMapping(storedGamepad = {}) {
  const out = { ...DEFAULT_GAMEPAD }
  for (const [btn, idx] of Object.entries(storedGamepad || {})) {
    if (!isValidGamepadBinding(idx)) continue
    out[btn] = typeof idx === 'number' ? idx : Number(idx)
  }
  return out
}

const mapping = ref({
  keyboard: { ...DEFAULT_KEYBOARD },
  keyboardP2: { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] },
  gamepad: { ...DEFAULT_GAMEPAD },
})
let loaded = false

function refreshForUser(userId) {
  const stored = loadMapping(userId)
  mapping.value = {
    keyboard: isSavedDefaultKeyboard(stored?.keyboard)
      ? { ...DEFAULT_KEYBOARD }
      : normalizeKeyboardMapping(stored?.keyboard),
    keyboardP2: isSavedLocalPlayer2DefaultKeyboard(stored?.keyboardP2)
      ? { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] }
      : normalizeKeyboardMapping(stored?.keyboardP2, DEFAULT_LOCAL_PLAYER_KEYBOARDS[2]),
    gamepad: normalizeGamepadMapping(stored?.gamepad),
  }
}

function withoutDuplicateBinding(current, btn, value) {
  const next = { ...current }
  for (const key of Object.keys(next)) {
    if (key !== btn && value != null && next[key] === value) next[key] = null
  }
  next[btn] = value
  return next
}

function sanitizeKeyboardSave(current) {
  const out = {}
  for (const [btn, key] of Object.entries(current || {})) {
    out[btn] = isValidKeyboardBinding(key) ? normalizeRetroarchKey(key) : null
  }
  return out
}

function sanitizeGamepadSave(current) {
  const out = {}
  for (const [btn, idx] of Object.entries(current || {})) {
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
  const gamepad = normalizeGamepadMapping(inputMapping?.gamepad)
  for (const { key } of RETROPAD_BUTTON_DEFS) {
    const enabled = !allowed || allowed.has(key)
    cfg[`input_player1_${key}`] = enabled ? (keyboard[key] || 'nul') : 'nul'
    const gp = gamepad[key]
    if (enabled && typeof gp === 'number') cfg[`input_player1_${key}_btn`] = gp
    else if (!enabled) cfg[`input_player1_${key}_btn`] = 'nul'
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
    const playerKey = keyboardStorageKeyForPlayer(player)
    const defaults = defaultKeyboardForPlayer(player, platform)
    const current = effectiveKeyboardForPlayer(mapping.value, player, platform)
    const normalized = isValidKeyboardBinding(key) ? normalizeRetroarchKey(key) : defaults[btn]
    if (Number(player) === 2) {
      const player1Keyboard = effectiveKeyboardForPlayer(mapping.value, 1, platform)
      const p1Reserved = new Set(Object.values(player1Keyboard).filter(isValidKeyboardBinding).map((value) => normalizeRetroarchKey(value)))
      if (p1Reserved.has(normalized)) return false
    }
    const keyboard = sanitizeKeyboardSave(withoutDuplicateBinding(current, btn, normalized))
    mapping.value = { ...mapping.value, [playerKey]: keyboard }
    saveMapping(user.value?.id, mapping.value)
    return true
  }
  function setGamepad(btn, idx) {
    const normalized = isValidGamepadBinding(idx) ? (typeof idx === 'number' ? idx : Number(idx)) : DEFAULT_GAMEPAD[btn]
    const gamepad = sanitizeGamepadSave(withoutDuplicateBinding(mapping.value.gamepad, btn, normalized))
    mapping.value = { ...mapping.value, gamepad }
    saveMapping(user.value?.id, mapping.value)
  }
  function resetKeyboard(player = 1, platform = null) {
    const playerKey = keyboardStorageKeyForPlayer(player)
    mapping.value = { ...mapping.value, [playerKey]: { ...defaultKeyboardForPlayer(player, platform) } }
    saveMapping(user.value?.id, mapping.value)
  }
  function resetGamepad() {
    mapping.value = { ...mapping.value, gamepad: { ...DEFAULT_GAMEPAD } }
    saveMapping(user.value?.id, mapping.value)
  }

  // Retroarch-style input config for player 1 derived from the current mapping.
  const retroarchConfig = computed(() => buildPlayerRetroarchConfig(mapping.value))

  return {
    mapping: computed(() => mapping.value),
    retroarchConfig,
    setKeyboard, setGamepad,
    resetKeyboard, resetGamepad,
  }
}
