import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ref } from 'vue'
import {
  ACTIONS_SIDE_COLUMN_WIDTH,
  ACTIONS_SIDE_MIN_VIEWPORT_WIDTH,
  ACTIONS_SIDE_TWO_COLUMN_MIN_WIDTH,
  usePlayerActionsPlacement,
} from '../frontend/src/composables/player/usePlayerActionsPlacement.js'

// 播放页顶部 / 画面旁边那组按钮（保存、读档、重置、金手指、按键设置）与「按键透明度」
// 按钮的摆放规则。这套布局按「触屏布局 + 窗口宽度」两个条件决定，很容易在后续改动里
// 被顺手改回顶部，所以把规则和两个播放页的接线都钉在这里。
const read = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), 'utf8')

const playerSource = read('views/Player.vue')
const roomSource = read('views/RoomPlayer.vue')
const overlaySource = read('components/emulator-portal/GameOverlay.vue')
const actionsSource = read('components/emulator-portal/GameActionButtons.vue')
const padSource = read('components/emulator-portal/VirtualGamepad.vue')
const roomActionsSource = read('composables/player/room/useRoomPlayerActions.js')

function variantFor({ isTouch = false, width = 1920, height = 1080, fullscreen = false, forcedLandscape = false }) {
  const { variant } = usePlayerActionsPlacement({
    isTouchLayout: ref(isTouch),
    viewportWidth: ref(width),
    viewportHeight: ref(height),
    isFullscreen: ref(fullscreen),
    isForcedLandscape: ref(forcedLandscape),
  })
  return variant.value
}

function verticalFor({ isTouch = false, width = 390, height = 844, fullscreen = false, forcedLandscape = false }) {
  const { vertical } = usePlayerActionsPlacement({
    isTouchLayout: ref(isTouch),
    viewportWidth: ref(width),
    viewportHeight: ref(height),
    isFullscreen: ref(fullscreen),
    isForcedLandscape: ref(forcedLandscape),
  })
  return vertical.value
}

function sideColumnFor(width) {
  const { sideColumnWidth } = usePlayerActionsPlacement({
    isTouchLayout: ref(false),
    viewportWidth: ref(width),
    viewportHeight: ref(900),
    isFullscreen: ref(false),
    isForcedLandscape: ref(false),
  })
  return sideColumnWidth.value
}

test('宽屏 PC 用画面右侧的图文按钮，窄了才退回顶部工具条', () => {
  assert.equal(variantFor({ width: 1920 }), 'side')
  assert.equal(variantFor({ width: ACTIONS_SIDE_MIN_VIEWPORT_WIDTH, height: 900 }), 'side')
  assert.equal(variantFor({ width: ACTIONS_SIDE_MIN_VIEWPORT_WIDTH - 1, height: 900 }), 'top')
  // 页面缩放把有效宽度压下来之后，同样退回顶部
  assert.equal(variantFor({ width: 900, height: 900 }), 'top')
})

test('触屏设备一律走悬浮按钮，不看窗口宽度', () => {
  // 手机横屏后 innerWidth 常常超过侧栏阈值（932 / 915），不能因此切成桌面布局
  assert.equal(variantFor({ isTouch: true, width: 932, height: 430 }), 'mobile')
  assert.equal(variantFor({ isTouch: true, width: 390, height: 844 }), 'mobile')
})

test('触屏设备横屏、全屏（含 CSS 转横版）时按钮改竖排', () => {
  assert.equal(verticalFor({ width: 390, height: 844 }), false)
  assert.equal(verticalFor({ width: 844, height: 390 }), true)
  assert.equal(verticalFor({ width: 390, height: 844, fullscreen: true }), true)
  // iOS / 微信没有原生全屏：整页被 CSS 顺时针转 90°，本地视口仍是竖的
  assert.equal(verticalFor({ width: 390, height: 844, forcedLandscape: true }), true)
})

test('两个播放页都把按钮交给同一套摆放规则，工具条上不再重复出现', () => {
  for (const source of [playerSource, roomSource]) {
    assert.match(source, /const \{[\s\S]*?variant: actionsPlacement,[\s\S]*?vertical: actionsVertical,[\s\S]*?sideColumnWidth,[\s\S]*?\} = usePlayerActionsPlacement\(/)
    // 只有退回顶部（top）时才在工具条里渲染这组按钮：side / mobile 都由页面自己摆在画面旁边
    assert.match(source, /const showBarActions = computed\(\(\) => actionsPlacement\.value === 'top'\)/)
    assert.match(source, /:show-actions="showBarActions"/)
    // 画面右上角：先一组按钮，再「按键透明度」按钮
    assert.match(source, /v-if="actionsPlacement === 'mobile'"[\s\S]*?variant="mobile"[\s\S]*?<VirtualGamepadOpacityButton[\s\S]*?v-if="actionsPlacement === 'mobile'"[\s\S]*?:dimmed="vpadDimmed"/)
    // PC 宽屏：同一组按钮换成 side 摆放，放在画面右侧
    assert.match(source, /v-if="actionsPlacement === 'side'"[\s\S]*?variant="side"/)
    assert.match(source, /:dimmed="vpadDimmed"/)
  }
})

test('侧栏列宽左右对称，画面（crt-screen）停在页面正中', () => {
  for (const source of [playerSource, roomSource]) {
    // 列宽交给 CSS 变量：组件按它定宽，页面在同宽的左侧占位上开一块，画面才不被挤偏
    assert.match(source, /<div class="emu-area" :style="\{ '--side-actions-w': sideColumnWidth \}">/)
    assert.match(source, /<div v-if="actionsPlacement === 'side'" class="emu-side-spacer" aria-hidden="true"><\/div>/)
    assert.match(source, /\.emu-side-spacer \{ flex: 0 0 var\(--side-actions-w, 176px\); \}/)
    assert.match(source, /\.emu-area \{ padding: 16px 24px; gap: 16px; justify-content: center; \}/)
  }

  const side = actionsSource.match(/\.actions-side \{([^}]*)\}/)
  assert.ok(side, '缺少 .actions-side 规则')
  assert.match(side[1], /width: var\(--side-actions-w, 176px\)/)
  // 顶部与画面对齐（不再悬在整条右栏的正中间），底部留白靠左侧占位对称
  assert.match(side[1], /align-self: flex-start/)
  assert.doesNotMatch(side[1], /align-content: center/)

  // 一行两个 / 一行一个的列宽，与 usePlayerActionsPlacement 公布的值必须一致
  assert.equal(sideColumnFor(ACTIONS_SIDE_TWO_COLUMN_MIN_WIDTH), `${ACTIONS_SIDE_COLUMN_WIDTH.two}px`)
  assert.equal(sideColumnFor(ACTIONS_SIDE_TWO_COLUMN_MIN_WIDTH - 1), `${ACTIONS_SIDE_COLUMN_WIDTH.one}px`)
  assert.match(actionsSource, /@media \(max-width: 1199px\)/)
})

test('工具条只在这组按钮挪走后保留返回、游戏信息与全屏', () => {
  assert.match(overlaySource, /showActions: \{ type: Boolean, default: true \}/)
  assert.match(overlaySource, /<GameActionButtons[\s\S]*?variant="top"/)
  assert.match(overlaySource, /v-if="showActions"/)
  // 按钮实现只有一份：工具条本身不再内联这些按钮
  assert.doesNotMatch(overlaySource, /@click="\$emit\('(save-state|load-state|reload|cheats|keys)'\)"/)
  // 返回、游戏信息居中、全屏都还在（版本选择与房间列表由页面通过 extras 插槽塞进来）
  assert.match(overlaySource, /@click="\$emit\('back'\)"/)
  assert.match(overlaySource, /class="bar-center"/)
  assert.match(overlaySource, /<slot name="extras" \/>/)
  assert.match(overlaySource, /showFullscreen/)
})

test('联机房间顶部不再提供 ROM 版本选择，只留房间玩家列表', () => {
  assert.doesNotMatch(roomSource, /ver-switch|ver-btn|ver-menu|ver-item/)
  assert.doesNotMatch(roomSource, /switchVersion|canShowVersionSwitch/)
  assert.doesNotMatch(roomActionsSource, /switchVersion/)
  assert.match(roomSource, /<template #extras>[\s\S]*?class="room-chip"/)
})

test('「按键透明度」按钮把整块虚拟手柄压到 20%', () => {
  const rule = padSource.match(/\.vpad\.vpad-dimmed \{([^}]*)\}/)
  assert.ok(rule, '缺少 .vpad-dimmed 规则')
  assert.match(rule[1], /opacity:\s*0\.2/)
  assert.match(padSource, /dimmed: \{ type: Boolean, default: false \}/)
  assert.match(padSource, /'vpad-dimmed': dimmed/)
})

test('竖排时按钮与「按键透明度」按钮同一列，排在它正下方', () => {
  const verticalRule = actionsSource.match(/\.actions-mobile\.is-vertical \{([^}]*)\}/)
  assert.ok(verticalRule, '缺少 .actions-mobile.is-vertical 规则')
  // 与「按键透明度」按钮同样的 right 偏移 —— 同一条竖线上
  assert.match(verticalRule[1], /right: calc\(10px \+ env\(safe-area-inset-right\)\)/)
  // 42px 的按钮 + 6px 间距：从它的下沿开始往下排
  assert.match(verticalRule[1], /top: calc\(max\(10px, env\(safe-area-inset-top\)\) \+ 48px\)/)
  // 列底给右下角的虚拟手柄让位，高度不够时先收缩而不是叠上去
  assert.match(verticalRule[1], /bottom: calc\(186px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(verticalRule[1], /flex-direction: column/)
  assert.match(actionsSource, /min-height: 22px/)

  // 横屏 / 全屏时「按键透明度」按钮本身也停在右上角（和左上角的全屏按钮分居两侧）
  const opacitySource = readFileSync(new URL('../frontend/src/components/emulator-portal/VirtualGamepadOpacityButton.vue', import.meta.url), 'utf8')
  assert.match(opacitySource, /right: calc\(10px \+ env\(safe-area-inset-right\)\)/)
})
