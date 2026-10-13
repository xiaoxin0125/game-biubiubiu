import { computed } from 'vue'
import {
  buildLocalMultiplayerRetroarchConfig,
  buildPlayerRetroarchConfig,
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
  effectiveKeyboardForPlayer,
  player1ReservedKeys,
  RETROPAD_BUTTON_DEFS,
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
  // 房主这一侧 P1 会产生、core 收得到的全部键：运行期注入用的键 + 房主物理键盘上属于
  // P1 的键（含平台用不到的按钮，它们在按键设置里没有行，但键还在存档里）。远端席位的
  // 键位表必须避开这一份，否则房主按自己的键就会打到别的玩家身上。
  const player1ReservedKeyboardKeys = computed(() => {
    const platform = romMeta.value?.platform || null
    return player1ReservedKeys(
      effectiveKeyboardForPlayer(null, 1, platform),
      effectiveKeyboardForPlayer(mapping.value, 1, platform),
    )
  })
  // P1 在 core 里的键位启动时冻结一次，之后前端按这份快照把玩家的物理按键换算成 core
  // 认的键（见 useRoomPlayerInput 的 handleHostKeyboardRemap）。远端键位表和 core 配置
  // 都从这里取，保证两边是同一份。
  function roomHostInputSnapshot() {
    if (!roomHostInputConfigSnapshot.value) {
      roomHostInputConfigSnapshot.value = {
        ...buildPlayerRetroarchConfig(mapping.value, currentPlatformButtons.value, {
          runtimeKeyboard: player1RuntimeKeyboard.value,
        }),
      }
    }
    return roomHostInputConfigSnapshot.value
  }
  const remotePlayerKeyMaps = computed(() => {
    const platformButtons = currentPlatformButtons.value
    if (usesArcadeNetplayInputConfig.value) {
      return buildArcadeNetplayRemoteKeyMaps({
        maxPlayers: activeMaxPlayers.value,
        hostConfig: roomHostInputSnapshot(),
        reservedKeys: player1ReservedKeyboardKeys.value,
        platformButtons,
      })
    }
    return buildRemotePlayerKeyMaps(activeMaxPlayers.value, player1ReservedKeyboardKeys.value, platformButtons)
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
      const hostConfig = roomHostInputSnapshot()
      if (usesArcadeNetplayInputConfig.value) {
        return {
          ...hostConfig,
          ...buildArcadeNetplayRetroarchConfig({
            maxPlayers: activeMaxPlayers.value,
            keyMaps: remotePlayerKeyMaps.value,
            platformButtons,
          }),
        }
      }
      // 远端席位的键位表和运行时注入共用同一份，core 绑的和注入的必须是同一个键。
      return {
        ...hostConfig,
        ...buildRemotePlayersRetroarchConfig(
          activeMaxPlayers.value,
          player1ReservedKeyboardKeys.value,
          platformButtons,
          remotePlayerKeyMaps.value,
        ),
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