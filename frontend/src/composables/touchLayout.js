// 触屏设备的布局判定 —— 播放页与虚拟手柄共用同一套规则，避免两边判断不一致。
//
// 关键点：不能只看浏览器宽度。很多 Android 手机横屏后 innerWidth ≥ 900
// （例如 915 / 932），会被误判成桌面布局：虚拟手柄整个消失、按键映射也切到
// PC 那一套。改成看「短边」后，同一台手机横竖屏的结果保持一致。

export const TOUCH_LAYOUT_MAX_SHORT_SIDE = 900

export function hasTouchScreen() {
  if (typeof window === 'undefined') return false
  if ('ontouchstart' in window) return true
  if ((navigator.maxTouchPoints || 0) > 0) return true
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function isTouchDeviceLayout(viewportWidth, viewportHeight) {
  if (!hasTouchScreen()) return false
  const width = Number(viewportWidth) || 0
  const height = Number(viewportHeight) || 0
  const shortSide = width && height ? Math.min(width, height) : Math.max(width, height)
  if (!shortSide) return false
  return shortSide < TOUCH_LAYOUT_MAX_SHORT_SIDE
}
