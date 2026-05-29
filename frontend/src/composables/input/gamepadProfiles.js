import { RETROPAD_BUTTON_KEYS } from './buttons.js'

export const GAMEPAD_PROFILE_DEFS = [
  { key: 'xbox', label: 'XBOX' },
  { key: 'ps4', label: 'PS4' },
  { key: 'ns', label: 'NS' },
  { key: 'generic', label: '通用手柄' },
]

export const DEFAULT_GAMEPAD_PROFILE = 'xbox'
const GAMEPAD_PROFILE_KEYS = new Set(GAMEPAD_PROFILE_DEFS.map((profile) => profile.key))

export const GAMEPAD_PROFILE_DEFAULTS = {
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

export const DEFAULT_GAMEPAD = GAMEPAD_PROFILE_DEFAULTS[DEFAULT_GAMEPAD_PROFILE]

export function normalizeGamepadProfile(profile) {
  const key = String(profile || '').toLowerCase()
  return GAMEPAD_PROFILE_KEYS.has(key) ? key : DEFAULT_GAMEPAD_PROFILE
}

export function cloneGamepadProfiles() {
  const out = {}
  for (const { key } of GAMEPAD_PROFILE_DEFS) out[key] = { ...GAMEPAD_PROFILE_DEFAULTS[key] }
  return out
}

export function clonePlayerGamepads() {
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

export function isValidGamepadBinding(idx) {
  if (idx == null || idx === '') return false
  if (typeof idx === 'number') return Number.isInteger(idx) && idx >= 0
  if (typeof idx === 'string' && /^\d+$/.test(idx.trim())) return true
  return false
}

export function normalizeGamepadMapping(storedGamepad = {}, profile = DEFAULT_GAMEPAD_PROFILE) {
  const defaults = GAMEPAD_PROFILE_DEFAULTS[normalizeGamepadProfile(profile)] || DEFAULT_GAMEPAD
  const out = { ...defaults }
  for (const [btn, idx] of Object.entries(storedGamepad || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    if (!isValidGamepadBinding(idx)) continue
    out[btn] = typeof idx === 'number' ? idx : Number(idx)
  }
  return out
}

export function normalizeGamepadProfiles(storedProfiles = {}) {
  const out = cloneGamepadProfiles()
  for (const { key: profile } of GAMEPAD_PROFILE_DEFS) {
    out[profile] = normalizeGamepadMapping(storedProfiles?.[profile], profile)
  }
  return out
}

export function normalizePlayerGamepads(storedGamepads = null, legacyGamepad = null) {
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

export function normalizeSelectedGamepadProfiles(stored = {}) {
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

export function sanitizeGamepadSave(current) {
  const out = {}
  for (const [btn, idx] of Object.entries(current || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    out[btn] = isValidGamepadBinding(idx) ? (typeof idx === 'number' ? idx : Number(idx)) : null
  }
  return out
}