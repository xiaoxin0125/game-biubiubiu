import { RETROPAD_BUTTON_DEFS } from './buttons.js'
import { normalizeKeyboardMapping } from './keyboardProfiles.js'
import { gamepadMappingFor } from './gamepadProfiles.js'

export function buildPlayerRetroarchConfig(inputMapping, platformButtons = null, options = {}) {
  const cfg = {}
  const allowed = platformButtons ? new Set(platformButtons) : null
  const keyboard = normalizeKeyboardMapping(
    options.runtimeKeyboard || inputMapping?.keyboard,
    options.runtimeKeyboard || undefined,
  )
  const includeNativeGamepad = options.includeNativeGamepad !== false
  const gamepad = includeNativeGamepad ? gamepadMappingFor(inputMapping, 1, options.gamepadProfile) : null
  for (const { key } of RETROPAD_BUTTON_DEFS) {
    const enabled = !allowed || allowed.has(key)
    cfg[`input_player1_${key}`] = enabled ? (keyboard[key] || 'nul') : 'nul'
    const gp = gamepad?.[key]
    if (includeNativeGamepad && enabled && typeof gp === 'number') cfg[`input_player1_${key}_btn`] = gp
    else cfg[`input_player1_${key}_btn`] = 'nul'
    if (!includeNativeGamepad || !enabled) cfg[`input_player1_${key}_axis`] = 'nul'
  }
  return cfg
}