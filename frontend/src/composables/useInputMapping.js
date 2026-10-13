// User-customizable keyboard + gamepad mapping per virtual retropad button.
// Stored in localStorage, keyed by user id (guests share a single 'guest' slot).
// Keyboard maps stay per player slot (P1/P2); gamepad maps are stored per
// physical device (name + occurrence) and the seat table decides which device
// controls which player. Drives VirtualGamepad/useGamepads dispatch and the
// InputSettings UI.

import { ref, computed, watch } from 'vue'
import { useAuth } from './useAuth.js'
import {
  BUTTON_DEFS,
  RETROPAD_BUTTON_DEFS,
  TURBO_BUTTON_TARGETS,
  TURBO_FIRE_MS,
} from './input/buttons.js'
import { normalizeKeyboardEventKey, normalizeRetroarchKey } from './input/keyboardKeys.js'
import {
  GAMEPAD_DEFAULT_MAPPING,
  GAMEPAD_LAYOUT_VERSION,
  GAMEPAD_SEAT_AUTO,
  GAMEPAD_SEAT_COUNT,
  GAMEPAD_SEAT_OFF,
  assignGamepadSeat,
  deviceKeyFor,
  deviceLabel,
  deviceMappingFor,
  deviceNameOf,
  describeConnectedDevices,
  extractLegacyGamepads,
  isDefaultGamepadMapping,
  isDeviceKey,
  isValidGamepadBinding,
  legacyMappingForPosition,
  migrateGamepadMappingDefaults,
  normalizeDeviceGamepads,
  normalizeGamepadMapping,
  normalizeGamepadSeats,
  parseDeviceKey,
  resolveSoloSeatPlayers,
  sanitizeGamepadSave,
  shortDeviceName,
} from './input/gamepadProfiles.js'
import {
  DEFAULT_KEYBOARD,
  DEFAULT_LOCAL_PLAYER_KEYBOARDS,
  DEFAULT_PLAYER1_RUNTIME_KEYBOARD,
  buildLocalMultiplayerRetroarchConfig,
  buildLocalPlayerKeyboardMap,
  defaultLocalKeyboardForPlayer,
  defaultPlayer1KeyboardForPlatform,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  isSavedDefaultKeyboard,
  isSavedLocalPlayer2DefaultKeyboard,
  isValidKeyboardBinding,
  keyboardStorageKeyForPlayer,
  localPlayer2RuntimeKeyboard,
  normalizeKeyboardMapping,
  sanitizeKeyboardSave,
  withoutDuplicateBinding,
  withoutKeyboardValue,
  withoutKeyboardValues,
} from './input/keyboardProfiles.js'
import { buildPlayerRetroarchConfig } from './input/retroarchConfig.js'
import {
  P2_KEY_MAP,
  REMOTE_PLAYER_KEY_MAPS,
  buildPlayer2RetroarchConfig,
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
  player1ReservedKeys,
} from './input/remotePlayers.js'
import { loadInputMapping, saveInputMapping } from './input/storage.js'

export {
  BUTTON_DEFS,
  DEFAULT_PLAYER1_RUNTIME_KEYBOARD,
  GAMEPAD_DEFAULT_MAPPING,
  GAMEPAD_SEAT_AUTO,
  GAMEPAD_SEAT_COUNT,
  GAMEPAD_SEAT_OFF,
  P2_KEY_MAP,
  REMOTE_PLAYER_KEY_MAPS,
  RETROPAD_BUTTON_DEFS,
  TURBO_BUTTON_TARGETS,
  TURBO_FIRE_MS,
  buildLocalMultiplayerRetroarchConfig,
  buildLocalPlayerKeyboardMap,
  buildPlayer2RetroarchConfig,
  buildPlayerRetroarchConfig,
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
  defaultPlayer1KeyboardForPlatform,
  deviceKeyFor,
  deviceLabel,
  deviceMappingFor,
  deviceNameOf,
  describeConnectedDevices,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  isDefaultGamepadMapping,
  isDeviceKey,
  localPlayer2RuntimeKeyboard,
  normalizeDeviceGamepads,
  normalizeGamepadSeats,
  normalizeKeyboardEventKey,
  normalizeRetroarchKey,
  parseDeviceKey,
  player1ReservedKeys,
  resolveSoloSeatPlayers,
  shortDeviceName,
}

const mapping = ref({
  keyboard: { ...DEFAULT_KEYBOARD },
  keyboardP2: { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] },
  gamepads: {},
  seats: { 1: null, 2: null },
  legacyGamepads: { 1: null, 2: null },
  gamepadLayoutVersion: GAMEPAD_LAYOUT_VERSION,
})
let loaded = false

function normalizeLegacyGamepads(stored = null) {
  const out = { 1: null, 2: null }
  for (let slot = 1; slot <= GAMEPAD_SEAT_COUNT; slot++) {
    const value = stored?.[slot] ?? stored?.[String(slot)]
    if (!value || typeof value !== 'object') continue
    const normalized = sanitizeGamepadSave(value)
    if (Object.keys(normalized).length) out[slot] = normalized
  }
  return out
}

// 只对「这次读取的存档」做一次旧默认键位迁移（标记写在存档里，跑过就不再跑）。
function migrateStoredMappings(maps = null) {
  const out = {}
  for (const [key, value] of Object.entries(maps || {})) {
    out[key] = value ? migrateGamepadMappingDefaults(value) : value
  }
  return out
}

function refreshForUser(userId) {
  const stored = loadInputMapping(userId)
  const storedVersion = Number(stored?.gamepadLayoutVersion) || 0
  const needsLayoutMigration = storedVersion < GAMEPAD_LAYOUT_VERSION
  const gamepads = normalizeDeviceGamepads(stored?.gamepads, { preserveSparse: needsLayoutMigration })
  // An explicitly saved legacy table is authoritative, including consumed
  // (null) slots. Never re-extract an already adopted slot from an older field.
  const savedLegacy = stored?.legacyGamepads
  const legacySource = savedLegacy && typeof savedLegacy === 'object'
    ? normalizeLegacyGamepads(savedLegacy)
    : extractLegacyGamepads(stored)
  const legacyGamepads = needsLayoutMigration ? migrateStoredMappings(legacySource) : legacySource
  const next = {
    keyboard: isSavedDefaultKeyboard(stored?.keyboard)
      ? { ...DEFAULT_KEYBOARD }
      : normalizeKeyboardMapping(stored?.keyboard),
    keyboardP2: isSavedLocalPlayer2DefaultKeyboard(stored?.keyboardP2)
      ? { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] }
      : normalizeKeyboardMapping(stored?.keyboardP2, DEFAULT_LOCAL_PLAYER_KEYBOARDS[2]),
    gamepads: normalizeDeviceGamepads(needsLayoutMigration ? migrateStoredMappings(gamepads) : gamepads),
    seats: normalizeGamepadSeats(stored?.seats),
    legacyGamepads,
    gamepadLayoutVersion: Math.max(storedVersion, GAMEPAD_LAYOUT_VERSION),
  }
  mapping.value = next

  // Persist a converted old record immediately. The version marker makes this a
  // one-time operation; current-version custom swaps are never rewritten.
  if (stored && needsLayoutMigration) {
    // Storage may be unavailable/full; the loaded mapping should still work.
    try { saveInputMapping(userId, next) } catch {}
  }
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
    saveInputMapping(user.value?.id, mapping.value)
    return true
  }

  // 设备首次出现时，把旧版按玩家槽位存的映射认领给它（认领后清掉那一份旧数据，
  // 避免同一套旧映射被后来的设备重复继承）。
  function bindGamepadDevice(deviceKey, position = 0) {
    const key = String(deviceKey || '')
    const slot = Number(position) === 2 ? 2 : 1
    if (!isDeviceKey(key) || mapping.value.gamepads?.[key]) return
    if (Number(position) !== 1 && Number(position) !== 2) return
    const legacy = legacyMappingForPosition(mapping.value, slot)
    if (!legacy) return
    // 迁移已在读取旧存档时完成；认领只复制现有值，不能再次按行猜测默认值。
    const adopted = normalizeGamepadMapping(legacy)
    const legacyGamepads = { ...mapping.value.legacyGamepads, [slot]: null }
    mapping.value = {
      ...mapping.value,
      gamepads: { ...mapping.value.gamepads, [key]: adopted },
      legacyGamepads,
    }
    saveInputMapping(user.value?.id, mapping.value)
  }

  function gamepadMappingForDevice(deviceKey, position = 0) {
    return deviceMappingFor(mapping.value, deviceKey, position)
  }

  function setGamepad(btn, idx, deviceKey = null) {
    const key = String(deviceKey || '')
    if (!isDeviceKey(key)) return false
    const current = deviceMappingFor(mapping.value, key, 0)
    const normalized = idx === null ? null : (isValidGamepadBinding(idx) ? Number(idx) : GAMEPAD_DEFAULT_MAPPING[btn])
    const next = sanitizeGamepadSave(withoutDuplicateBinding(current, btn, normalized))
    const gamepads = { ...mapping.value.gamepads, [key]: next }
    mapping.value = { ...mapping.value, gamepads }
    saveInputMapping(user.value?.id, mapping.value)
    return true
  }

  function setGamepadSeat(player = 1, value = null) {
    mapping.value = {
      ...mapping.value,
      seats: assignGamepadSeat(mapping.value.seats, player, value),
    }
    saveInputMapping(user.value?.id, mapping.value)
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
    saveInputMapping(user.value?.id, mapping.value)
  }

  function resetGamepad(deviceKey = null) {
    const key = String(deviceKey || '')
    if (!isDeviceKey(key)) return
    mapping.value = {
      ...mapping.value,
      gamepads: { ...mapping.value.gamepads, [key]: { ...GAMEPAD_DEFAULT_MAPPING } },
    }
    saveInputMapping(user.value?.id, mapping.value)
  }

  const retroarchConfig = computed(() => buildPlayerRetroarchConfig(mapping.value))

  return {
    mapping: computed(() => mapping.value),
    retroarchConfig,
    bindGamepadDevice,
    gamepadMappingForDevice,
    setKeyboard, setGamepad, setGamepadSeat,
    resetKeyboard, resetGamepad,
  }
}
