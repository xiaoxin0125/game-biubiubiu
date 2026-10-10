import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// 播放页全屏：优先用浏览器原生 Fullscreen API，并让画面真正变成横版。
//
// 手机端「点击后横版全屏」要分三层兜底：
// 1. Android Chrome 等支持方向锁的浏览器：全屏后用
//    screen.orientation.lock('landscape') 让系统真的转屏，变成满屏横版。
// 2. 能全屏但锁不了方向（部分 WebView、桌面浏览器）：把整页顺时针旋转 90°，
//    用户把手机横过来就是横版满屏（.is-forced-landscape，见 global.css）。
// 3. iOS Safari / 微信 WebView 没有 Element 全屏：先退化为 CSS 伪全屏，
//    再走第 2 步的旋转兜底。
//
// 注意：全屏 / 旋转的对象必须是整个播放页容器，而不是 canvas 外层。canvas 外层带
// `contain: paint`，且虚拟手柄是它的兄弟节点 —— 只处理 canvas 会让手柄消失。

// 进入全屏后给系统转屏留出的时间：这段时间内变成横屏就不用 CSS 旋转兜底
const FORCED_LANDSCAPE_DELAY_MS = 600
// 部分浏览器要等全屏状态稳定后才允许锁方向，失败后补一次
const LANDSCAPE_LOCK_RETRY_MS = 250

function getDocument() {
  return typeof document === 'undefined' ? null : document
}

function nativeFullscreenElement() {
  const doc = getDocument()
  if (!doc) return null
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null
}

// 不依赖 document.fullscreenEnabled：部分 WebView（微信 X5 等）实现了
// webkitRequestFullscreen 却没有对应的 *Enabled 标志。
function fullscreenRequestFor(el) {
  if (!el) return null
  return el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.webkitRequestFullScreen
    || el.msRequestFullscreen
    || null
}

function fullscreenExitFor() {
  const doc = getDocument()
  if (!doc) return null
  return doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen || null
}

// 标准 screen.orientation 与各厂商的老接口
function orientationApi() {
  if (typeof screen === 'undefined') return null
  return screen.orientation || screen.mozOrientation || screen.msOrientation || screen
}

function orientationLockFor(api) {
  if (!api) return null
  return api.lock
    || api.lockOrientation
    || api.webkitLockOrientation
    || api.mozLockOrientation
    || api.msLockOrientation
    || null
}

function orientationUnlockFor(api) {
  if (!api) return null
  return api.unlock
    || api.unlockOrientation
    || api.webkitUnlockOrientation
    || api.mozUnlockOrientation
    || api.msUnlockOrientation
    || null
}

export function useFullscreen({ target, onNotice } = {}) {
  const isNativeFullscreen = ref(false)
  const isPseudoFullscreen = ref(false)
  const isFullscreen = computed(() => isNativeFullscreen.value || isPseudoFullscreen.value)
  // 浏览器不帮忙转屏时，用 CSS 把整页转成横版
  const isForcedLandscape = ref(false)
  const isPortraitViewport = ref(isPortrait())
  let forceLandscapeTimer = null
  let lockRetryTimer = null

  function resolveTarget() {
    if (typeof target === 'function') return target()
    return target?.value ?? target ?? null
  }

  function isPortrait() {
    if (typeof window === 'undefined') return false
    return window.innerHeight > window.innerWidth
  }

  function clearTimers() {
    if (forceLandscapeTimer) {
      clearTimeout(forceLandscapeTimer)
      forceLandscapeTimer = null
    }
    if (lockRetryTimer) {
      clearTimeout(lockRetryTimer)
      lockRetryTimer = null
    }
  }

  // 用户自己把手机转成横屏（或系统转屏成功）后，撤销 CSS 旋转，避免双重旋转
  function syncViewportOrientation() {
    isPortraitViewport.value = isPortrait()
    if (!isPortraitViewport.value) isForcedLandscape.value = false
  }

  async function lockLandscape() {
    const api = orientationApi()
    const lock = orientationLockFor(api)
    if (typeof lock !== 'function') return false

    const attempt = async (value) => {
      try {
        const result = lock.call(api, value)
        // 标准接口返回 Promise，老接口同步返回 boolean
        if (result && typeof result.then === 'function') return (await result.then(() => true, () => false)) === true
        return result !== false
      } catch {
        return false
      }
    }

    if (await attempt('landscape')) return true
    return attempt('landscape-primary')
  }

  function unlockOrientation() {
    const api = orientationApi()
    const unlock = orientationUnlockFor(api)
    if (typeof unlock !== 'function') return
    try { unlock.call(api) } catch {}
  }

  // 系统没转屏（iOS / 微信 / 桌面）时，到点把页面自己转过来
  function scheduleForcedLandscape() {
    if (forceLandscapeTimer) {
      clearTimeout(forceLandscapeTimer)
      forceLandscapeTimer = null
    }
    forceLandscapeTimer = setTimeout(() => {
      forceLandscapeTimer = null
      if (!isFullscreen.value || !isPortraitViewport.value) return
      isForcedLandscape.value = true
      onNotice?.('已进入横屏全屏，请横置手机')
    }, FORCED_LANDSCAPE_DELAY_MS)
  }

  async function enterFullscreen() {
    if (isFullscreen.value) return
    const el = resolveTarget()
    let native = false

    const request = fullscreenRequestFor(el)
    if (request) {
      try {
        const result = request.call(el, { navigationUI: 'hide' })
        if (result && typeof result.then === 'function') await result.catch(() => {})
        native = !!nativeFullscreenElement()
      } catch {
        native = false
      }
    }

    isNativeFullscreen.value = native
    isPseudoFullscreen.value = !native

    const locked = await lockLandscape()
    if (!locked) {
      if (lockRetryTimer) clearTimeout(lockRetryTimer)
      lockRetryTimer = setTimeout(() => {
        lockRetryTimer = null
        if (isFullscreen.value) void lockLandscape()
      }, LANDSCAPE_LOCK_RETRY_MS)
    }

    syncViewportOrientation()
    scheduleForcedLandscape()
  }

  async function exitFullscreen() {
    isPseudoFullscreen.value = false
    isNativeFullscreen.value = false
    isForcedLandscape.value = false
    clearTimers()
    unlockOrientation()
    const doc = getDocument()
    if (!doc || !nativeFullscreenElement()) return
    const exit = fullscreenExitFor()
    try { await exit?.call(doc) } catch {}
  }

  function toggleFullscreen() {
    return isFullscreen.value ? exitFullscreen() : enterFullscreen()
  }

  // 用户按 ESC / 系统返回键退出原生全屏时同步状态，按钮图标和工具条才会跟着复位。
  function syncFromBrowser() {
    const native = !!nativeFullscreenElement()
    isNativeFullscreen.value = native
    if (!native) {
      unlockOrientation()
      isForcedLandscape.value = false
      clearTimers()
    }
  }

  onMounted(() => {
    const doc = getDocument()
    if (!doc) return
    doc.addEventListener('fullscreenchange', syncFromBrowser)
    doc.addEventListener('webkitfullscreenchange', syncFromBrowser)
    window.addEventListener('resize', syncViewportOrientation)
    window.addEventListener('orientationchange', syncViewportOrientation)
    syncViewportOrientation()
  })

  onBeforeUnmount(() => {
    const doc = getDocument()
    if (doc) {
      doc.removeEventListener('fullscreenchange', syncFromBrowser)
      doc.removeEventListener('webkitfullscreenchange', syncFromBrowser)
    }
    window.removeEventListener('resize', syncViewportOrientation)
    window.removeEventListener('orientationchange', syncViewportOrientation)
    if (isFullscreen.value) exitFullscreen()
    clearTimers()
  })

  return {
    isFullscreen,
    isNativeFullscreen,
    isPseudoFullscreen,
    isForcedLandscape,
    isPortraitViewport,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  }
}
