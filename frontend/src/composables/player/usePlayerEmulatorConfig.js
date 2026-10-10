import { computed } from 'vue'
import {
  buildLocalMultiplayerRetroarchConfig,
  buildPlayerRetroarchConfig,
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
  effectiveKeyboardForPlayer,
  RETROPAD_BUTTON_DEFS,
  TURBO_BUTTON_TARGETS,
} from '../useInputMapping.js'
import {
  buildArcadeNetplayRemoteKeyMaps,
  buildArcadeNetplayRetroarchConfig,
  isArcadeNetplayInputEnabled,
} from './arcadeNetplayInput.js'
import { getPlatform, pcButtonsForPlatform, turboButtonsForPlatform } from '../../constants/platforms.js'
import { buildPlatformCoreConfig } from '../../data/config.js'

export function usePlayerEmulatorConfig({
  mapping,
  romMeta,
  roomInfo,
  platformInfo,
  roomSession,
  signalMe,
  isRoomMode,
  isTouchLayout = null,
  roomHostInputConfigSnapshot,
}) {
  const activeCore = computed(() => platformInfo.value.core)
  const activeMaxPlayers = computed(() => {
    if (isRoomMode) return roomSession.roomMaxPlayers?.value || roomInfo.value?.effectiveMaxPlayers || platformInfo.value.maxPlayers || 1
    if (isTouchLayout?.value) return 1
    return roomInfo.value?.effectiveMaxPlayers || romMeta.value?.effectiveMaxPlayers || platformInfo.value.maxPlayers || 1
  })
  const retroarchCoreConfig = computed(() => buildPlatformCoreConfig({
    platform: romMeta.value?.platform,
    core: activeCore.value,
    players: activeMaxPlayers.value,
  }))
  const overlayPlatformInfo = computed(() => {
    if (romMeta.value) return platformInfo.value
    return {
      label: isRoomMode ? 'ROOM' : 'GAME',
      color: '#6e6e73',
    }
  })
  const overlayCoreName = computed(() => romMeta.value ? platformInfo.value.core : '')
  const currentPlatformButtons = computed(() => {
    const platform = romMeta.value?.platform
    if (!platform) return null
    return isTouchLayout?.value ? getPlatform(platform).buttons : pcButtonsForPlatform(platform)
  })
  const currentTurboTargets = computed(() => {
    const platform = romMeta.value?.platform
    if (!platform || isTouchLayout?.value) return {}
    return turboButtonsForPlatform(platform)
  })
  const usesArcadeNetplayInputConfig = computed(() =>
    isArcadeNetplayInputEnabled({ isRoomMode, platform: romMeta.value?.platform }) && signalMe.value?.isHost === true
  )
  const player1RuntimeKeyboard = computed(() => {
    const platform = romMeta.value?.platform || null
    const defaults = effectiveKeyboardForPlayer(null, 1, platform)
    const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
    const out = {}
    for (const { key } of RETROPAD_BUTTON_DEFS) {
      if (allowed && !allowed.has(key)) continue
      out[key] = defaults[key] || 'nul'
    }
    return out
  })
  const remotePlayerKeyMaps = computed(() => {
    const platformButtons = currentPlatformButtons.value
    if (usesArcadeNetplayInputConfig.value) {
      const base = roomHostInputConfigSnapshot.value || buildPlayerRetroarchConfig(mapping.value, platformButtons, {
        runtimeKeyboard: player1RuntimeKeyboard.value,
      })
      return buildArcadeNetplayRemoteKeyMaps({
        maxPlayers: activeMaxPlayers.value,
        hostConfig: base,
        platformButtons,
      })
    }
    const reservedKeys = Object.entries(mapping.value.keyboard || {})
      .filter(([btn, key]) => !currentTurboTargets.value[btn] && !TURBO_BUTTON_TARGETS[btn] && key != null && key !== '')
      .map(([, key]) => key)
    return buildRemotePlayerKeyMaps(activeMaxPlayers.value, reservedKeys, platformButtons)
  })
  const retroarchConfig = computed(() => {
    const platformButtons = currentPlatformButtons.value
    const runtimeKeyboard = player1RuntimeKeyboard.value
    const base = buildPlayerRetroarchConfig(mapping.value, platformButtons, { runtimeKeyboard })
    if (!isRoomMode) {
      return {
        ...base,
        ...buildLocalMultiplayerRetroarchConfig(activeMaxPlayers.value, platformButtons),
      }
    }
    if (isRoomMode && signalMe.value?.isHost) {
      if (!roomHostInputConfigSnapshot.value) roomHostInputConfigSnapshot.value = { ...base }
      const reservedKeys = Object.values(roomHostInputConfigSnapshot.value)
        .filter((value) => typeof value === 'string' && value !== 'nul')
      if (usesArcadeNetplayInputConfig.value) {
        return {
          ...roomHostInputConfigSnapshot.value,
          ...buildArcadeNetplayRetroarchConfig({
            maxPlayers: activeMaxPlayers.value,
            keyMaps: remotePlayerKeyMaps.value,
            platformButtons,
          }),
        }
      }
      return {
        ...roomHostInputConfigSnapshot.value,
        ...buildRemotePlayersRetroarchConfig(activeMaxPlayers.value, reservedKeys, platformButtons),
      }
    }
    return base
  })

  return {
    activeCore,
    activeMaxPlayers,
    retroarchCoreConfig,
    overlayPlatformInfo,
    overlayCoreName,
    currentPlatformButtons,
    player1RuntimeKeyboard,
    remotePlayerKeyMaps,
    retroarchConfig,
  }
}