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
  a: 'x', b: 'z',
  x: 's', y: 'a',
  l: 'q', r: 'w',
  l2: '1', r2: '3',
  l3: '2', r3: '4',
  start: 'enter', select: 'rshift',
  aa: 'c', bb: 'd', xx: 'e', yy: 'f',
  ll: '5', rr: '6', l2l2: '8', r2r2: '0',
}

const REMOTE_KEY_POOL = [
  'i', 'k', 'j', 'l', 'u', 'o', 'y', 't', 'n', 'm', '7', '9', 'p', 'v',
  'h', 'g', 'b', 'e', 'f', 'semicolon', 'minus', 'equal',
  'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24',
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
  'decimal', 'numdivide', 'nummultiply', 'numsubtract', 'numadd', 'numenter',
]

function remotePlayerKeys(player, reserved = new Set()) {
  const out = {}
  const offset = Math.max(0, player - 2)
  const pool = [...REMOTE_KEY_POOL.slice(offset * 16), ...REMOTE_KEY_POOL.slice(0, offset * 16)]
  let cursor = 0

  for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
    while (cursor < pool.length && reserved.has(pool[cursor])) cursor++
    out[btn] = pool[cursor] || `f${13 + ((cursor + player) % 12)}`
    reserved.add(out[btn])
    cursor++
  }
  return out
}

// Remote retropad buttons map to host-side reserved keyboard keys. These are
// generated from the current P1 mapping at runtime, so P1 custom bindings never
// get stolen by P2-P4.
export function buildRemotePlayerKeyMaps(maxPlayers = 4, reservedKeys = []) {
  const limit = Math.max(2, Math.min(4, Number(maxPlayers) || 4))
  const reserved = new Set((reservedKeys || []).filter((key) => key != null && key !== '').map((key) => String(key)))
  const maps = {}
  for (let player = 2; player <= limit; player++) maps[player] = remotePlayerKeys(player, reserved)
  return maps
}

export const REMOTE_PLAYER_KEY_MAPS = buildRemotePlayerKeyMaps(4)

export const P2_KEY_MAP = REMOTE_PLAYER_KEY_MAPS[2]

export function buildRemotePlayersRetroarchConfig(maxPlayers = 4, reservedKeys = []) {
  const maps = buildRemotePlayerKeyMaps(maxPlayers, reservedKeys)
  const cfg = {}
  for (const [player, keyMap] of Object.entries(maps)) {
    for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
      const key = keyMap[btn]
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

const mapping = ref({ keyboard: { ...DEFAULT_KEYBOARD }, gamepad: { ...DEFAULT_GAMEPAD } })
let loaded = false

function refreshForUser(userId) {
  const stored = loadMapping(userId)
  mapping.value = {
    keyboard: { ...DEFAULT_KEYBOARD, ...(stored?.keyboard || {}) },
    gamepad:  { ...DEFAULT_GAMEPAD,  ...(stored?.gamepad  || {}) },
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

export function buildPlayerRetroarchConfig(inputMapping, platformButtons = null) {
  const cfg = {}
  const allowed = platformButtons ? new Set(platformButtons) : null
  for (const { key } of RETROPAD_BUTTON_DEFS) {
    const enabled = !allowed || allowed.has(key)
    cfg[`input_player1_${key}`] = enabled ? (inputMapping?.keyboard?.[key] || 'nul') : 'nul'
    const gp = inputMapping?.gamepad?.[key]
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

  function setKeyboard(btn, key) {
    mapping.value = { ...mapping.value, keyboard: withoutDuplicateBinding(mapping.value.keyboard, btn, key) }
    saveMapping(user.value?.id, mapping.value)
  }
  function setGamepad(btn, idx) {
    mapping.value = { ...mapping.value, gamepad: withoutDuplicateBinding(mapping.value.gamepad, btn, idx) }
    saveMapping(user.value?.id, mapping.value)
  }
  function resetKeyboard() {
    mapping.value = { ...mapping.value, keyboard: { ...DEFAULT_KEYBOARD } }
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
