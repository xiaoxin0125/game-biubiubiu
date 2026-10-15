import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// ClaySelect 的下拉面板用 position: fixed + 视口坐标摆位（全屏时挂进全屏元素，
// 见 player-fullscreen-overlay.test.js）。这里盯两件事：
//   1. 宽度按内容自适应 —— 面板不再钉死在触发器宽度，像「任天堂 Game Boy Color
//      (GBC) 1」这种长条目要完整摆下（旧实现只能被省略号截断）；
//   2. 水平方向与触发器右缘对齐 —— 首页分类栏的下拉框挨着右边界，条目比触发器
//      宽时向左展开，不会被视口推离触发器。
const claySelect = readFileSync(new URL('../frontend/src/components/ClaySelect.vue', import.meta.url), 'utf8')

test('下拉面板宽度按内容自适应：不小于触发器、不超出视口', () => {
  assert.match(claySelect, /async function positionPanel\(\)/)
  assert.match(claySelect, /width: 'max-content'/)
  assert.match(claySelect, /minWidth: `\$\{Math\.round\(Math\.min\(rect\.width, maxWidth\)\)\}px`/)
  assert.match(claySelect, /maxWidth = Math\.max\(140, window\.innerWidth - 16\)/)
  assert.match(claySelect, /maxWidth: `\$\{Math\.round\(maxWidth\)\}px`/)
  // 旧实现把面板钉死在触发器宽度（Math.max(rect.width, 140)），长条目只能截断
  assert.doesNotMatch(claySelect, /const width = Math\.max\(rect\.width, 140\)/)
  // 视口也放不下时，才由选项自己的省略号兜底
  assert.match(claySelect, /text-overflow: ellipsis/)
})

test('面板右缘与触发器右缘对齐，太宽放不下时才退回左对齐', () => {
  const position = claySelect.slice(claySelect.indexOf('async function positionPanel'), claySelect.indexOf('function pick(option)'))
  assert.match(position, /const maxLeft = Math\.max\(8, window\.innerWidth - width - 8\)/)
  assert.match(position, /const rightAlignedLeft = rect\.right - width/)
  // 右对齐可行就用右对齐（面板右缘贴触发器右缘，再夹住视口右缘的 8px 边距）
  assert.match(position, /const left = rightAlignedLeft >= 8\n\s*\? Math\.min\(rightAlignedLeft, maxLeft\)\n\s*: Math\.min\(Math\.max\(rect\.left, 8\), maxLeft\)/)
})

test('读到真实宽度后再定位面板，且旧测量不会覆盖新定位', () => {
  // 宽度要等浏览器算完（nextTick）才读得到，因此定位分两步：先落近似位置，再按右缘对齐
  const position = claySelect.slice(claySelect.indexOf('async function positionPanel'), claySelect.indexOf('function pick(option)'))
  const awaitIndex = position.indexOf('await nextTick()')
  const measureIndex = position.indexOf('getBoundingClientRect().width')
  assert.ok(awaitIndex > 0 && measureIndex > awaitIndex, '要先等样式生效再读面板宽度')
  // 连续滚动 / 缩放会让多个测量排队：带序号的这次才算数，收起后不再改样式
  assert.match(position, /const token = \(positionToken \+= 1\)/)
  assert.match(position, /if \(token !== positionToken \|\| !open\.value \|\| !panelEl\.isConnected\) return/)
  // 面板收起时定位函数直接返回，不再读写面板
  assert.match(position, /if \(!el \|\| !panelEl \|\| !open\.value\) return/)
  // 局部变量不能叫 panel：会遮蔽同名模板 ref，取值当场抛 TDZ（面板拿不到定位样式）
  assert.match(position, /const panelEl = panel\.value/)
  assert.doesNotMatch(position, /^\s*const panel = panel\.value/m)
})
