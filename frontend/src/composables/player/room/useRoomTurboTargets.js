import { computed } from 'vue'
import { TURBO_BUTTON_TARGETS } from '../../useInputMapping.js'
import { turboButtonsForPlatform } from '../../../constants/platforms.js'

export function useRoomTurboTargets({ romMeta, isTouchLayout }) {
  const currentTurboTargets = computed(() => isTouchLayout.value ? {} : turboButtonsForPlatform(romMeta.value?.platform))
  const turboTargetForButton = (button) => currentTurboTargets.value?.[button] || TURBO_BUTTON_TARGETS[button]

  return {
    currentTurboTargets,
    turboTargetForButton,
  }
}