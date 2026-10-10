import { RETROPAD_BUTTON_DEFS } from './buttons.js'
import { normalizeKeyboardMapping } from './keyboardProfiles.js'

// 键盘映射 → core 配置。物理手柄不走 core 的原生手柄输入：前端读 Gamepad API，
// 按设备映射换算成虚拟 retropad 按键后再分发，所以 *_btn / *_axis 一律写 nul。
export function buildPlayerRetroarchConfig(inputMapping, platformButtons = null, options = {}) {
  const cfg = {}
  const allowed = platformButtons ? new Set(platformButtons) : null
  const keyboard = normalizeKeyboardMapping(
    options.runtimeKeyboard || inputMapping?.keyboard,
    options.runtimeKeyboard || undefined,
  )
  for (const { key } of RETROPAD_BUTTON_DEFS) {
    const enabled = !allowed || allowed.has(key)
    cfg[`input_player1_${key}`] = enabled ? (keyboard[key] || 'nul') : 'nul'
    cfg[`input_player1_${key}_btn`] = 'nul'
    cfg[`input_player1_${key}_axis`] = 'nul'
  }
  return cfg
}
