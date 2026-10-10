import { onBeforeUnmount, onMounted, ref } from 'vue'

// 手机端「按快了画面变大且缩不回去」的防治。
//
// 成因是两个浏览器自带的缩放手势，跟 App 逻辑无关：
//   1. 双击放大 —— 连点按钮时被当成双击（iOS Safari 还会忽略 viewport 里的
//      user-scalable=no / maximum-scale，所以 meta 拦不住）；
//   2. 双指捏合放大 —— 两个拇指同时按手柄/画面时被当成捏合。
// 放大后是浏览器的视觉视口缩放，JS 没有接口能改回去，只能让用户再捏合还原。
//
// 所以这里做三件事：
//   1. 在游戏画面和虚拟手柄区域，多指手势一律 preventDefault（不认
//      touch-action 的老 iOS / 各家 WebView 的兜底）；
//   2. 拦掉 iOS 私有的 gesture* 捏合事件；
//   3. 万一还是被放大了（visualViewport.scale > 1），暴露 isZoomed，页面据此
//      放开 touch-action 限制并提示用户捏合还原 —— 保证有路可退。
export function useTouchZoomGuard({ target, areaSelector = null, onZoomed } = {}) {
  const isZoomed = ref(false)

  function resolveTarget() {
    if (typeof target === 'function') return target()
    return target?.value ?? target ?? null
  }

  function visualScale() {
    if (typeof window === 'undefined') return 1
    const value = window.visualViewport?.scale
    return typeof value === 'number' && value > 0 ? value : 1
  }

  function syncZoomed() {
    const next = visualScale() > 1.01
    if (next === isZoomed.value) return
    isZoomed.value = next
    if (next) onZoomed?.()
  }

  function inArea(el) {
    if (!areaSelector) return true
    return !!el?.closest?.(areaSelector)
  }

  // 多指触摸直接取消（单指点击、长按不受影响）。已经放大时不拦，用户才能捏回去。
  function onTouch(e) {
    if (isZoomed.value) return
    if ((e.touches?.length || 0) > 1 && inArea(e.target)) e.preventDefault()
  }

  // iOS Safari 私有的捏合/旋转手势事件，preventDefault 即可取消缩放
  function onGesture(e) {
    if (isZoomed.value) return
    e.preventDefault()
  }

  onMounted(() => {
    const el = resolveTarget()
    if (el) {
      el.addEventListener('touchstart', onTouch, { passive: false })
      el.addEventListener('touchmove', onTouch, { passive: false })
      el.addEventListener('gesturestart', onGesture)
      el.addEventListener('gesturechange', onGesture)
      el.addEventListener('gestureend', onGesture)
    }
    window.visualViewport?.addEventListener('resize', syncZoomed)
    window.visualViewport?.addEventListener('scroll', syncZoomed)
    syncZoomed()
  })

  onBeforeUnmount(() => {
    const el = resolveTarget()
    if (el) {
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('touchmove', onTouch)
      el.removeEventListener('gesturestart', onGesture)
      el.removeEventListener('gesturechange', onGesture)
      el.removeEventListener('gestureend', onGesture)
    }
    window.visualViewport?.removeEventListener('resize', syncZoomed)
    window.visualViewport?.removeEventListener('scroll', syncZoomed)
  })

  return { isZoomed }
}
