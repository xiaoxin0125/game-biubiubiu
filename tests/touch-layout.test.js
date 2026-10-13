import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  TOUCH_LAYOUT_MAX_SHORT_SIDE,
  hasTouchScreen,
  isTouchDeviceLayout,
} from '../frontend/src/composables/touchLayout.js'

// 触屏布局 = 虚拟手柄 + 隐藏键鼠设置 + core 按 1 人配置跑，这套东西只在手机 / 平板上
// 成立。触摸屏笔记本、一体机的 'ontouchstart' 与 navigator.maxTouchPoints 同样是真，
// 但它们的主指针是鼠标 / 触控板：以前在 PC 上把窗口拖小就会切进触屏布局 —— 虚拟手柄
// 冒出来、玩家数从 2 变 1，模拟器还得按新配置重启。这个用例把「按设备判定、不看窗口
// 大小」钉住。

function mediaQueries(map = {}) {
  return (query) => ({ matches: !!map[query] })
}

// 用假的 window / navigator 替换全局，返回恢复函数。
function withBrowser({ media = null, ontouchstart = false, maxTouchPoints = 0 } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const fakeWindow = { maxTouchPoints }
  if (media) fakeWindow.matchMedia = mediaQueries(media)
  if (ontouchstart) fakeWindow.ontouchstart = null
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: fakeWindow })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { maxTouchPoints } })
  return () => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator)
    else delete globalThis.navigator
  }
}

// 手机 / 平板：主指针是触摸，不能悬停。
const PHONE = { '(pointer: coarse)': true, '(hover: none)': true, '(pointer: fine)': false, '(hover: hover)': false }
// 触摸屏笔记本 / 一体机：屏幕能摸，但鼠标（或触控板）才是主指针。
const TOUCH_LAPTOP = { '(pointer: coarse)': true, '(hover: none)': false, '(pointer: fine)': true, '(hover: hover)': true, '(any-pointer: coarse)': true }
// 普通 PC。
const DESKTOP = { '(pointer: coarse)': false, '(pointer: fine)': true, '(hover: hover)': true }

test('PC 上不显示虚拟手柄：窗口再小也不切触屏布局', () => {
  for (const media of [DESKTOP, TOUCH_LAPTOP]) {
    const restore = withBrowser({ media, ontouchstart: true, maxTouchPoints: 10 })
    try {
      assert.equal(hasTouchScreen(), false)
      // 正是这次要修的场景：从 1080p 全屏拖到 1200×700 的窄窗口，短边 < 900 就切走了。
      for (const [w, h] of [[1920, 1080], [1600, 1000], [1200, 700], [900, 800], [700, 900], [480, 800]]) {
        assert.equal(isTouchDeviceLayout(w, h), false, `${w}×${h} 被误判成触屏布局`)
      }
    } finally {
      restore()
    }
  }
})

test('手机竖横屏都是触屏布局，横屏的宽视野不会把它顶掉', () => {
  const restore = withBrowser({ media: PHONE, maxTouchPoints: 5 })
  try {
    assert.equal(hasTouchScreen(), true)
    assert.equal(isTouchDeviceLayout(390, 844), true)
    assert.equal(isTouchDeviceLayout(844, 390), true)
    // 很多 Android 手机横屏 innerWidth ≥ 900，短边仍然很小。
    assert.equal(isTouchDeviceLayout(915, 412), true)
  } finally {
    restore()
  }
})

test('平板按触屏布局，短边超过阈值的大屏仍是桌面布局', () => {
  const restore = withBrowser({ media: PHONE, maxTouchPoints: 5 })
  try {
    assert.equal(isTouchDeviceLayout(768, 1024), true)
    assert.equal(isTouchDeviceLayout(1024, 768), true)
    assert.equal(isTouchDeviceLayout(TOUCH_LAYOUT_MAX_SHORT_SIDE, 1600), false)
    assert.equal(isTouchDeviceLayout(1200, 2000), false)
  } finally {
    restore()
  }
})

test('没有媒体查询的老内核按触摸能力兜底', () => {
  const withTouch = withBrowser({ ontouchstart: true, maxTouchPoints: 2 })
  try {
    assert.equal(hasTouchScreen(), true)
    assert.equal(isTouchDeviceLayout(390, 844), true)
  } finally {
    withTouch()
  }

  const withoutTouch = withBrowser({})
  try {
    assert.equal(hasTouchScreen(), false)
    assert.equal(isTouchDeviceLayout(390, 844), false)
  } finally {
    withoutTouch()
  }
})

test('虚拟手柄与播放页共用同一套判定', () => {
  const pad = readFileSync(new URL('../frontend/src/components/emulator-portal/VirtualGamepad.vue', import.meta.url), 'utf8')
  const viewport = readFileSync(new URL('../frontend/src/composables/player/usePlayerViewport.js', import.meta.url), 'utf8')
  assert.match(pad, /import \{ isTouchDeviceLayout \} from '\.\.\/\.\.\/composables\/touchLayout\.js'/)
  assert.match(pad, /isTouchDeviceLayout\(viewportWidth\.value, viewportHeight\.value\)/)
  assert.match(viewport, /isTouchDeviceLayout\(viewportWidth\.value, viewportHeight\.value\)/)
})
