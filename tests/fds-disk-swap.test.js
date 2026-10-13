import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { effectScope, ref } from 'vue'
import {
  FDS_DISK_HOLD_MS,
  useFdsDiskSwap,
} from '../frontend/src/composables/player/useFdsDiskSwap.js'
import { buildPlayerRetroarchConfig } from '../frontend/src/composables/input/retroarchConfig.js'
import { effectiveKeyboardForPlayer } from '../frontend/src/composables/input/keyboardProfiles.js'
import { getPlatform, pcButtonsForPlatform } from '../frontend/src/constants/platforms.js'

// FDS 的换面 / 换盘不是游戏按键：nestopia 与 fceumm 把这两个动作绑在 retropad 的
// L / R 上（core 里没有 disk control 接口，RetroArch 的 DISK_* 命令在这里是空转）。
// 这组测试钉住四件事：FDS 平台确实开放了 L / R、core 配置里这两个键真的绑上了键、
// 三处摆放（顶部工具条 / 画面右侧 / 手机悬浮）都接上了这两颗按钮、按下之后是
// 「按住一小会儿再松手」而不是瞬时脉冲。
const read = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), 'utf8')

const playerSource = read('views/Player.vue')
const roomSource = read('views/RoomPlayer.vue')
const overlaySource = read('components/emulator-portal/GameOverlay.vue')
const actionsSource = read('components/emulator-portal/GameActionButtons.vue')
const fullscreenSource = read('components/emulator-portal/FullscreenButton.vue')
const opacitySource = read('components/emulator-portal/VirtualGamepadOpacityButton.vue')

test('FDS 平台开放 L / R，触屏与 PC 两张表都带着换面 / 换盘', () => {
  const fds = getPlatform('fds').buttons
  assert.ok(fds.includes('l') && fds.includes('r'), 'FDS 缺少换面 / 换盘的按键')
  assert.ok(pcButtonsForPlatform('fds').includes('l'))
  assert.ok(pcButtonsForPlatform('fds').includes('r'))

  // 同一个 core 也给 NES / FC 用，但那两个平台没有磁碟机，不该多出这两行。
  for (const platform of ['nes', 'famicom']) {
    assert.ok(!pcButtonsForPlatform(platform).includes('l'), `${platform} 不该有 L`)
    assert.ok(!pcButtonsForPlatform(platform).includes('r'), `${platform} 不该有 R`)
  }
})

test('换面 / 换盘的标签就是动作名，按键设置里不出现 L / R', () => {
  const labels = getPlatform('fds').buttonLabels
  assert.equal(labels.l, '换面')
  assert.equal(labels.r, '换盘')
})

test('FDS 的 core 配置把 L / R 绑到默认键 U / P，别的平台仍是 nul', () => {
  const fdsKeyboard = effectiveKeyboardForPlayer(null, 1, 'fds')
  const fdsConfig = buildPlayerRetroarchConfig({}, pcButtonsForPlatform('fds'), { runtimeKeyboard: fdsKeyboard })
  assert.equal(fdsConfig.input_player1_l, 'u')
  assert.equal(fdsConfig.input_player1_r, 'p')
  // 手柄的原生读取必须继续关着，否则一次按键会被 core 收两份
  assert.equal(fdsConfig.input_player1_l_btn, 'nul')
  assert.equal(fdsConfig.input_player1_r_axis, 'nul')

  const nesKeyboard = effectiveKeyboardForPlayer(null, 1, 'nes')
  const nesConfig = buildPlayerRetroarchConfig({}, pcButtonsForPlatform('nes'), { runtimeKeyboard: nesKeyboard })
  assert.equal(nesConfig.input_player1_l, 'nul')
  assert.equal(nesConfig.input_player1_r, 'nul')
})

test('两种摆放 + 顶部工具条都接上换面 / 换盘，且只有 FDS 才亮', () => {
  for (const source of [playerSource, roomSource]) {
    assert.match(source, /import \{ useFdsDiskSwap \} from '\.\.\/composables\/player\/useFdsDiskSwap\.js'/)
    assert.match(source, /platform === 'fds'\)/)
    assert.match(source, /const \{ swapDiskSide, changeDisk \} = useFdsDiskSwap\(\{ portalRef, enabled: canUseFdsDisk \}\)/)
    // 三处入口：顶部工具条（PC 窄屏兜底，经 GameOverlay 透传）、画面右上角一组（mobile）、
    // 画面右侧一组（side）。少接一处就会有一种布局里没有这两颗按钮。
    const wiring = source.match(/:can-swap-disk="canUseFdsDisk"[\s\S]*?@swap-disk-side="swapDiskSide"[\s\S]*?@change-disk="changeDisk"/g) || []
    assert.equal(wiring.length, 3, '换面 / 换盘的接线少了一处')
    assert.equal((source.match(/:can-change-disk="canUseFdsDisk"/g) || []).length, 3, 'can-change-disk 少接了一处')
  }
  // 工具条里的那组由 GameOverlay 渲染：props 与事件都要透传下去
  assert.match(overlaySource, /canSwapDisk: \{ type: Boolean, default: false \}/)
  assert.match(overlaySource, /canChangeDisk: \{ type: Boolean, default: false \}/)
  assert.match(overlaySource, /defineEmits\(\[[^\]]*'swap-disk-side'[^\]]*'change-disk'[^\]]*\]\)/)
  assert.match(overlaySource, /:can-swap-disk="canSwapDisk"[\s\S]*?:can-change-disk="canChangeDisk"[\s\S]*?@swap-disk-side="\$emit\('swap-disk-side'\)"[\s\S]*?@change-disk="\$emit\('change-disk'\)"/)
  // 房间里的磁碟机在房主手上，客人不显示这两颗按钮
  assert.match(roomSource, /const canUseFdsDisk = computed\(\(\) => canControlEmulator\.value && romMeta\.value\?\.platform === 'fds'\)/)
})

test('动作按钮组里换面 / 换盘是两颗独立的按钮，摆放沿用同一套样式', () => {
  assert.match(actionsSource, /canSwapDisk: \{ type: Boolean, default: false \}/)
  assert.match(actionsSource, /canChangeDisk: \{ type: Boolean, default: false \}/)
  assert.match(actionsSource, /defineEmits\(\[[^\]]*'swap-disk-side'[^\]]*'change-disk'[^\]]*\]\)/)
  assert.match(actionsSource, /props\.canSwapDisk \|\| props\.canChangeDisk/)
  // 两个动作只写一份定义：事件名、标签与图标路径
  assert.match(actionsSource, /event: 'swap-disk-side',[\s\S]{0,200}?label: '换面'/)
  assert.match(actionsSource, /event: 'change-disk',[\s\S]{0,200}?label: '换盘'/)
  // side / top：排在这组按钮的最后；mobile：另起一组（见下一个用例）
  assert.match(actionsSource, /<template v-if="variant !== 'mobile'">[\s\S]*?v-for="disk in diskActions"[\s\S]*?@click="\$emit\(disk\.event\)"/)
  assert.match(actionsSource, /v-if="variant === 'mobile' && diskActions\.length"[\s\S]*?v-for="disk in diskActions"[\s\S]*?@click="\$emit\(disk\.event\)"/)
})

test('手机端换面 / 换盘排在左上角全屏按钮下方，尺寸与全屏 / 透明度按钮一致', () => {
  const rule = actionsSource.match(/\.actions-mobile-disk \{([^}]*)\}/)
  assert.ok(rule, '缺少 .actions-mobile-disk 规则')
  assert.match(rule[1], /position: absolute/)
  // 全屏按钮：top: 10px、高 42px，加 6px 间距 = 48px，正好排在它下沿
  assert.match(fullscreenSource, /top: 10px;/)
  assert.match(fullscreenSource, /width: 42px;/)
  assert.match(fullscreenSource, /height: 42px;/)
  assert.match(rule[1], /top: calc\(10px \+ 48px\)/)
  // 左边与全屏按钮同一个偏移
  assert.match(rule[1], /left: calc\(10px \+ env\(safe-area-inset-left\)\)/)
  assert.match(rule[1], /flex-direction: column/)
  // 全屏（含原生 / 伪全屏）时跟着让出刘海
  assert.match(actionsSource, /\.actions-mobile-disk\.is-fullscreen \{ top: calc\(max\(10px, env\(safe-area-inset-top\)\) \+ 48px\); \}/)

  // 尺寸与全屏按钮、「按键透明度」按钮同一条规则：42px
  assert.match(opacitySource, /width: 42px;/)
  const sizeRule = actionsSource.match(/\.actions-mobile \.game-action-btn,\s*\.actions-mobile-disk \.game-action-btn \{([^}]*)\}/)
  assert.ok(sizeRule, '缺少手机端两组悬浮按钮的共用尺寸规则')
  assert.match(sizeRule[1], /width: 42px;/)
  assert.match(sizeRule[1], /height: 42px;/)
  // 横屏 / 全屏时收缩的是右上角那组（那里按钮多、高度紧），换面 / 换盘不跟着变小：
  // 所有以 .actions-mobile-disk 开头的规则都不在横屏 / 全屏的收缩条件里。
  assert.match(actionsSource, /\.actions-mobile\.is-vertical \.game-action-btn \{/)
  const diskSelectors = actionsSource.match(/^[^\n{]*\.actions-mobile-disk[^\n{]*\{/gm) || []
  assert.ok(diskSelectors.length >= 2, '换面 / 换盘的样式规则不见了')
  for (const selector of diskSelectors) {
    assert.ok(!/is-vertical|max-height/.test(selector), `换面 / 换盘不该跟着横屏那组收缩：${selector.trim()}`)
  }
})

test('换面 / 换盘按住一小会儿再松手：同一帧里按下又松开会被 core 整段丢掉', async () => {
  const calls = []
  const portalRef = { value: {
    pressButton: (button, player) => calls.push(`down:${button}:${player}`),
    releaseButton: (button, player) => calls.push(`up:${button}:${player}`),
  } }
  const enabled = ref(true)
  const { canUseFdsDisk, swapDiskSide, changeDisk } = useFdsDiskSwap({ portalRef, enabled })
  assert.equal(canUseFdsDisk.value, true)

  assert.equal(swapDiskSide(), true)
  assert.equal(changeDisk(), true)
  assert.deepEqual(calls, ['down:l:1', 'down:r:1'])

  await new Promise((resolve) => setTimeout(resolve, FDS_DISK_HOLD_MS + 60))
  assert.deepEqual(calls, ['down:l:1', 'down:r:1', 'up:l:1', 'up:r:1'])

  // 没装模拟器（还没启动 / 不是 FDS）时按不动
  const idle = useFdsDiskSwap({ portalRef, enabled: ref(false) })
  assert.equal(idle.canUseFdsDisk.value, false)
  assert.equal(idle.swapDiskSide(), false)
  assert.equal(useFdsDiskSwap({ portalRef: ref(null), enabled: ref(true) }).changeDisk(), false)
})

test('换过模拟器实例 / 离开页面：松手只发给按下时那台，卸载时补一次松手', async () => {
  const calls = []
  const makePortal = (tag) => ({
    pressButton: (button, player) => calls.push(`${tag}:down:${button}:${player}`),
    releaseButton: (button, player) => calls.push(`${tag}:up:${button}:${player}`),
  })
  const first = makePortal('old')
  const second = makePortal('new')
  const portalRef = ref(first)
  const scope = effectScope()
  let disk = null
  scope.run(() => { disk = useFdsDiskSwap({ portalRef, enabled: ref(true) }) })

  // 同一颗键连点：第二次直接忽略，不会有两个定时器交叉释放
  assert.equal(disk.swapDiskSide(), true)
  assert.equal(disk.swapDiskSide(), false)
  assert.deepEqual(calls, ['old:down:l:1'])

  // 按住期间模拟器被换掉（重载 / 换 ROM）：松手不再打到新实例上
  portalRef.value = second
  await new Promise((resolve) => setTimeout(resolve, FDS_DISK_HOLD_MS + 60))
  assert.deepEqual(calls, ['old:down:l:1'])

  // 新实例上按下，离开页面（作用域销毁）时补一次松手，别把按下状态留给下一台
  assert.equal(disk.changeDisk(), true)
  assert.deepEqual(calls, ['old:down:l:1', 'new:down:r:1'])
  scope.stop()
  assert.deepEqual(calls, ['old:down:l:1', 'new:down:r:1', 'new:up:r:1'])
  await new Promise((resolve) => setTimeout(resolve, FDS_DISK_HOLD_MS + 60))
  assert.deepEqual(calls, ['old:down:l:1', 'new:down:r:1', 'new:up:r:1'])
})
