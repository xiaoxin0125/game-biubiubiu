import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 手机端虚拟手柄：按键上的字母（A/B/C/D、SELECT、START、连发）和方向箭头都是文本，
// 浏览器自带的长按手势会把它们当成可选内容，先弹「复制 / 搜一搜 / 翻译」菜单，菜单
// 还会吞掉这次触摸 —— 按住不放的键收不到抬起，手感直接断掉。CSS 的 user-select /
// -webkit-touch-callout 挡不住自带长按菜单的内核（微信 XWEB、部分国产浏览器），所以
// 手柄上必须同时保留「事件拦截」这一层。这个用例把防线钉住，避免以后被顺手删掉。
const source = readFileSync(
  new URL('../frontend/src/components/emulator-portal/VirtualGamepad.vue', import.meta.url),
  'utf8',
)

function padRootAttributes() {
  const match = source.match(/<div\s+v-if="enabled"([\s\S]*?)>/)
  assert.ok(match, '找不到虚拟手柄根元素')
  return match[1]
}

function section(openTag, closeTag) {
  const match = source.match(new RegExp(`${openTag}([\\s\\S]*)</${closeTag}>`))
  assert.ok(match, `找不到 ${closeTag} 块`)
  return match[1]
}

const styleSource = section('<style scoped>', 'style')
const scriptSource = section('<script setup>', 'script')

test('手柄根元素在触摸源头取消浏览器原生手势', () => {
  const attrs = padRootAttributes()
  for (const attr of [
    '@touchstart="onPadTouch"',
    '@touchmove="onPadTouch"',
    '@contextmenu.prevent',
    '@selectstart.prevent',
    '@dragstart.prevent',
    '@copy.prevent',
  ]) {
    assert.ok(attrs.includes(attr), `手柄根元素缺少 ${attr}`)
  }
})

test('手柄整块区域不可选中，并覆盖到子元素', () => {
  const rule = styleSource.match(/\.vpad,\s*\.vpad \*\s*\{([^}]*)\}/)
  assert.ok(rule, '缺少 .vpad / .vpad * 的不可选中规则')
  for (const declaration of [
    '-webkit-user-select: none',
    'user-select: none',
    '-webkit-touch-callout: none',
  ]) {
    assert.ok(rule[1].includes(declaration), `不可选中规则缺少 ${declaration}`)
  }
})

test('长按守卫取消触摸默认行为，画面被放大时放行以便还原缩放', () => {
  const handler = scriptSource.match(/function onPadTouch\(e\) \{([\s\S]*?)\n\}/)
  assert.ok(handler, '缺少 onPadTouch')
  assert.match(handler[1], /e\.preventDefault\(\)/, 'onPadTouch 必须取消触摸的默认行为')
  assert.match(scriptSource, /visualViewport\?\.scale/, '要用 visualViewport.scale 判断是否已被放大')
  assert.match(handler[1], /viewportScale\(\)/, 'onPadTouch 必须读缩放状态决定是否放行')
})

test('选中兜底只在选中范围落进手柄时清理，并随组件卸载摘掉监听', () => {
  const handler = scriptSource.match(/function onSelectionChange\(\) \{([\s\S]*?)\n\}/)
  assert.ok(handler, '缺少 onSelectionChange')
  assert.match(handler[1], /padEl\.value\?\.contains\(anchor\)/, '清理选中必须限定在手柄范围内')
  assert.match(handler[1], /removeAllRanges\(\)/, '选中落进手柄时要立刻清掉')
  assert.match(scriptSource, /document\.addEventListener\('selectionchange', onSelectionChange\)/)
  assert.match(scriptSource, /document\.removeEventListener\('selectionchange', onSelectionChange\)/)
})
