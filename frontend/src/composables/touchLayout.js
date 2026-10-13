// 触屏设备的布局判定 —— 播放页与虚拟手柄共用同一套规则，避免两边判断不一致。
//
// 关键点一：不能只看浏览器宽度。很多 Android 手机横屏后 innerWidth ≥ 900
// （例如 915 / 932），会被误判成桌面布局：虚拟手柄整个消失、按键映射也切到
// PC 那一套。改成看「短边」后，同一台手机横竖屏的结果保持一致。
//
// 关键点二：也不能只看「有没有触摸屏」。触摸屏笔记本 / 一体机的
// 'ontouchstart' 与 navigator.maxTouchPoints 同样是真，但它们的主指针是鼠标或
// 触控板，本质还是一台 PC —— 按窗口大小切进触屏布局会连带改变模拟方式：虚拟手柄
// 冒出来、core 的玩家数从 2 改成 1、键鼠设置被藏起来，模拟器还会按新配置重启。
// 所以这里只认「主指针是触摸、且不能悬停」的设备（手机 / 平板）；主指针是鼠标或
// 触控板的设备一律按 PC 处理，跟窗口大小无关。

export const TOUCH_LAYOUT_MAX_SHORT_SIDE = 900

function matchesMedia(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  try {
    return window.matchMedia(query).matches === true
  } catch {
    return null
  }
}

export function hasTouchScreen() {
  if (typeof window === 'undefined') return false
  // 主指针是鼠标 / 触控板且能悬停：PC、带触摸屏的笔记本与一体机都走这条。
  if (matchesMedia('(pointer: fine)') === true && matchesMedia('(hover: hover)') === true) return false
  const coarse = matchesMedia('(pointer: coarse)')
  if (coarse !== null) return coarse
  // 老内核没有媒体查询：只能按触摸能力兜底（可能把触摸屏笔记本也算进来）。
  return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0
}

export function isTouchDeviceLayout(viewportWidth, viewportHeight) {
  if (!hasTouchScreen()) return false
  const width = Number(viewportWidth) || 0
  const height = Number(viewportHeight) || 0
  const shortSide = width && height ? Math.min(width, height) : Math.max(width, height)
  if (!shortSide) return false
  return shortSide < TOUCH_LAYOUT_MAX_SHORT_SIDE
}
