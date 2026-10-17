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
  isJ2meKeyboardProfile,
  isValidKeyboardBinding,
  localPlayer2RuntimeKeyboard,
  normalizeKeyboardMapping,
  sanitizeKeyboardSave,
  sanitizePlatformKeyboards,
  withPlayerKeyboard,
  withoutDuplicateBinding,
  withoutKeyboardValue,
  withoutKeyboardValues,
} from './input/keyboardProfiles.js'
import { isSinglePlayerPlatform } from '../../../shared/registry/platform-players.js'
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
  keyboardsByPlatform: {},
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
  // v1.7.3 的 J2ME 默认键位（手机小键盘）曾经被整套写进账号共用的 keyboard：在 J2ME
  // 里改一颗键或按「重置键盘」，其它平台的按键设置也跟着变成小键盘。这里认出那种
  // 存档，把它搬回 J2ME 自己的格子，共用存档恢复成通用默认键位（见 isJ2meKeyboardProfile）。
  const leakedJ2meKeyboard = isJ2meKeyboardProfile(stored?.keyboard)
    ? sanitizeKeyboardSave(stored.keyboard)
    : null
  const keyboardsByPlatform = sanitizePlatformKeyboards(stored?.keyboardsByPlatform)
  if (leakedJ2meKeyboard && !keyboardsByPlatform.j2me) keyboardsByPlatform.j2me = leakedJ2meKeyboard
  const next = {
    keyboard: leakedJ2meKeyboard || isSavedDefaultKeyboard(stored?.keyboard)
      ? { ...DEFAULT_KEYBOARD }
      : normalizeKeyboardMapping(stored?.keyboard),
    keyboardP2: isSavedLocalPlayer2DefaultKeyboard(stored?.keyboardP2)
      ? { ...DEFAULT_LOCAL_PLAYER_KEYBOARDS[2] }
      : normalizeKeyboardMapping(stored?.keyboardP2, DEFAULT_LOCAL_PLAYER_KEYBOARDS[2]),
    keyboardsByPlatform,
    gamepads: normalizeDeviceGamepads(needsLayoutMigration ? migrateStoredMappings(gamepads) : gamepads),
    seats: normalizeGamepadSeats(stored?.seats),
    legacyGamepads,
    gamepadLayoutVersion: Math.max(storedVersion, GAMEPAD_LAYOUT_VERSION),
  }
  mapping.value = next

  // Persist a converted old record immediately. The version marker makes this a
  // one-time operation; current-version custom swaps are never rewritten.
  if (stored && (needsLayoutMigration || leakedJ2meKeyboard)) {
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
    const otherSlot = slot === 2 ? 1 : 2
    const defaults = defaultLocalKeyboardForPlayer(slot, platform)
    const current = effectiveLocalKeyboardForPlayer(mapping.value, slot, platform)
    const normalized = isValidKeyboardBinding(key) ? normalizeRetroarchKey(key) : defaults[btn]
    const keyboard = sanitizeKeyboardSave(withoutDuplicateBinding(current, btn, normalized))
    // 有自己默认键位的平台（J2ME / 街机 / MD）写进自己的格子，共用存档不动 ——
    // 在 J2ME 里改键不该让其它平台的按键设置跟着变。
    let next = withPlayerKeyboard(mapping.value, slot, keyboard, platform)
    // 单人机没有 P2（J2ME 模拟的是一部手机），不要为了避让撞键去改 P2 的存档：
    // 那一份是给别的平台的双打席位用的。
    if (isValidKeyboardBinding(normalized) && !isSinglePlayerPlatform(platform)) {
      const otherKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, otherSlot, platform)
      next = withPlayerKeyboard(next, otherSlot, sanitizeKeyboardSave(withoutKeyboardValue(otherKeyboard, normalized)), platform)
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
    const otherSlot = slot === 2 ? 1 : 2
    const defaults = { ...defaultLocalKeyboardForPlayer(slot, platform) }
    // 重置只恢复这个平台自己的默认键位，不改共用存档（见 setKeyboard）。
    let next = withPlayerKeyboard(mapping.value, slot, defaults, platform)
    if (!isSinglePlayerPlatform(platform)) {
      const reserved = Object.values(defaults).filter(isValidKeyboardBinding).map((value) => normalizeRetroarchKey(value))
      const otherKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, otherSlot, platform)
      next = withPlayerKeyboard(next, otherSlot, sanitizeKeyboardSave(withoutKeyboardValues(otherKeyboard, reserved)), platform)
    }
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
