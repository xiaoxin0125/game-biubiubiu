import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 播放页里的浮层（金手指弹窗、按键设置面板）必须留在播放页容器内部。
//
// 原因：全屏的元素就是整个播放页，而浏览器的原生全屏只会渲染「全屏元素」内部的内容 ——
// 用 <Teleport to="body"> 挂到 body 上的浮层，一进全屏（手机端点右上角按钮后画面里点金手指）
// 就整个消失，点开等于没反应；iOS / 微信的 CSS 伪全屏没有原生全屏元素，播放页自己固定满屏
// 且 z-index 500，挂在 body 上的浮层同样会被压在下面。
// 这两条都是「结构决定可见性」，源码层面很难再测，所以在这里钉住。
const read = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), 'utf8')

const cheatSource = read('components/emulator-portal/CheatDialog.vue')
const inputSettingsSource = read('components/InputSettings.vue')
const claySelectSource = read('components/ClaySelect.vue')

for (const [name, source] of [['金手指弹窗', cheatSource], ['按键设置面板', inputSettingsSource]]) {
  test(`${name}不挂到 body 上，留在播放页容器里`, () => {
    assert.doesNotMatch(source, /<Teleport/, `${name}不能再用 Teleport to="body"`)
    // 遮罩本身就是模板根元素：它随组件出现在播放页容器内
    assert.match(source, /<div class="(mask|is-overlay)"/, `${name}的遮罩应该是模板根元素`)
  })
}

test('两个播放页都把浮层渲染在播放页容器（也就是全屏元素）内部', () => {
  for (const view of ['views/Player.vue', 'views/RoomPlayer.vue']) {
    const source = read(view)
    // 全屏对象 = 播放页容器：浮层在它里面，就等于在全屏元素里面
    assert.match(source, /useFullscreen\(\{\s*\n\s*target: \(\) => playerRootRef\.value/)
    assert.match(source, /class="player-page"/)
    assert.match(source, /<CheatDialog[\s\S]*?<\/div>\s*<\/template>/)
    assert.match(source, /<InputSettings[\s\S]*?<\/div>\s*<\/template>/)
  }
})

test('金手指代码在播放页里仍然可以选中复制', () => {
  // 播放页整页 user-select: none（长按不出菜单），代码输入框要单独放开
  const rule = cheatSource.match(/\.input,\s*\n\.code-text \{([^}]*)\}/)
  assert.ok(rule, '缺少放开文本选中的规则')
  assert.match(rule[1], /user-select: text/)
  assert.match(rule[1], /-webkit-user-select: text/)
})

test('下拉面板在全屏里改挂到全屏元素上', () => {
  // ClaySelect 用 position: fixed + 视口坐标定位，只有在全屏元素内部才看得到
  assert.match(claySelectSource, /<Teleport :to="panelTarget">/)
  assert.match(claySelectSource, /const panelTarget = ref\('body'\)/)
  assert.match(claySelectSource, /document\.fullscreenElement \|\| document\.webkitFullscreenElement/)
  assert.match(claySelectSource, /panelTarget\.value = fullscreenElement\(\) \|\| 'body'/)
})

// 全屏 + 浏览器不给锁方向时，整页会被 CSS 转成横版：容器本地宽高互换
// （本地高度 = 100vw，竖屏手机上只有 390 左右），此时用 vh 量尺寸会读到竖屏的
// 844，浮层就会长到屏幕外面去（金手指一多尤其明显）。所以浮层一律按容器
// （遮罩 / 父级盒子）或播放页给出的 --view-h / --view-w 来定尺寸。
test('金手指弹窗与按键面板按容器定高度，不用 vh 量视口', () => {
  for (const [name, source, selector] of [
    ['金手指弹窗', cheatSource, /\.dialog \{([^}]*)\}/],
    ['按键设置面板', inputSettingsSource, /\.is-panel \{([^}]*)\}/],
  ]) {
    const rule = source.match(selector)
    assert.ok(rule, `找不到 ${name} 的尺寸规则`)
    assert.match(rule[1], /max-height: 100%/, `${name}应该按遮罩高度自适应`)
    assert.doesNotMatch(source, /max-height:\s*\d+vh/, `${name}不能用 vh 定高度`)
  }
})

test('加载卡片与房间面板用播放页给出的可视尺寸变量', () => {
  const loadingSource = read('components/emulator-portal/ResourceLoadingOverlay.vue')
  assert.match(loadingSource, /max-height: calc\(var\(--view-h, 100vh\) \* 0\.3\)/)
  assert.match(loadingSource, /max-height: calc\(var\(--view-h, 100vh\) \* 0\.22\)/)
  assert.match(loadingSource, /width: min\(360px, calc\(var\(--view-w, 100vw\) \* 0\.84\)\)/)
  assert.doesNotMatch(loadingSource, /max-height:\s*\d+vh/)

  const roomPanelSource = read('components/emulator-portal/RoomPanel.vue')
  assert.match(roomPanelSource, /max-width: calc\(var\(--view-w, 100vw\) - 32px\)/)
})

test('播放页定义「可视区域」尺寸，横版时跟着换过来', () => {
  const css = readFileSync(new URL('../frontend/src/assets/global.css', import.meta.url), 'utf8')
  assert.match(css, /\.player-page \{\s*\n\s*--view-w: 100vw;\s*\n\s*--view-h: 100vh;/)
  assert.match(css, /--view-w: 100dvw;\s*\n\s*--view-h: 100dvh;/)
  // 旋转成横版后本地宽高互换，变量也必须互换
  const rotated = css.match(/\.player-page\.is-forced-landscape\.is-forced-landscape \{\s*\n\s*--view-w: 100vh;\s*\n\s*--view-h: 100vw;/)
  assert.ok(rotated, '横版下 --view-w / --view-h 需要互换')
})
