// User-customizable keyboard + gamepad mapping per virtual retropad button.
// Stored in localStorage, keyed by user id (guests share a single 'guest' slot).
// Drives VirtualGamepad/useGamepads dispatch and the InputSettings UI.

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
  DEFAULT_GAMEPAD,
  DEFAULT_GAMEPAD_PROFILE,
  GAMEPAD_PROFILE_DEFAULTS,
  GAMEPAD_PROFILE_DEFS,
  clonePlayerGamepads,
  detectGamepadProfile,
  gamepadMappingFor,
  isValidGamepadBinding,
  normalizeGamepadProfile,
  normalizePlayerGamepads,
  normalizeSelectedGamepadProfiles,
  sanitizeGamepadSave,
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
} from './input/remotePlayers.js'
import { loadInputMapping, saveInputMapping } from './input/storage.js'

export {
  BUTTON_DEFS,
  DEFAULT_GAMEPAD_PROFILE,
  DEFAULT_PLAYER1_RUNTIME_KEYBOARD,
  GAMEPAD_PROFILE_DEFS,
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
  detectGamepadProfile,
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  gamepadMappingFor,
  localPlayer2RuntimeKeyboard,
  normalizeGamepadProfile,
  normalizeKeyboardEventKey,
  normalizeRetroarchKey,
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
  const stored = loadInputMapping(userId)
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
    saveInputMapping(user.value?.id, mapping.value)
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
    saveInputMapping(user.value?.id, mapping.value)
  }

  const retroarchConfig = computed(() => buildPlayerRetroarchConfig(mapping.value))

  return {
    mapping: computed(() => mapping.value),
    retroarchConfig,
    setKeyboard, setGamepad, setGamepadProfile,
    resetKeyboard, resetGamepad,
  }
}