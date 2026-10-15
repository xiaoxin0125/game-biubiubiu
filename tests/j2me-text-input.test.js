// MIDP 高级界面的文字输入（TextField / TextBox）。
//
// 运行时自带的编辑器（TextEditorProvider）挂在隐藏 iframe 的 DOM 上：玩家既看不到也点不到，
// 而这份内部构建根本没把它接到高级界面上（TextFieldLFImpl.createNativeResource0 是空壳，
// getString0 读的是一个只有 prompt() 才会写进去的全局变量）。所以输入由播放页显示一个真正的
// <input>（手机上点一下就能拉起系统键盘），运行时只负责把值写回 Java，并在合适的时机通知
// MIDlet 的 ItemStateListener。端到端行为用探针跑真实播放页验证，这里守住接线方式。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { editorInputType } from '../frontend/src/composables/player/j2meRuntime.js'

const readAdapter = () => readFile(new URL('../frontend/src/composables/player/j2meRuntime.js', import.meta.url), 'utf8')
const readLcdui = () => readFile(new URL('../frontend/public/j2me/lcdui.js', import.meta.url), 'utf8')

test('输入框类型跟着 TextField 的约束走', () => {
  // TextField.ANY / EMAILADDR / NUMERIC / PHONENUMBER / URL / DECIMAL / PASSWORD。
  assert.equal(editorInputType(0), 'text')
  assert.equal(editorInputType(1), 'email')
  assert.equal(editorInputType(2), 'number')
  assert.equal(editorInputType(5), 'number')
  assert.equal(editorInputType(3), 'tel')
  assert.equal(editorInputType(4), 'url')
  assert.equal(editorInputType(0x10000), 'password')
  assert.equal(editorInputType(0x10002), 'password')   // 密码优先于数字
  assert.equal(editorInputType(0x20000), 'text')       // UNEDITABLE 不会打开输入框
})

test('运行时把聚焦的输入框交给播放页，播放页负责显示与提交', async () => {
  const lcdui = await readLcdui()
  const adapter = await readAdapter()
  // 运行时侧：交出状态、写回内容（含 Java 的 DynamicCharacterArray）、提交。
  assert.match(lcdui, /textField: textFieldState/)
  assert.match(lcdui, /commitText: function \(nativeId, text\)/)
  assert.match(lcdui, /setBufferText\(item\.bufferAddr, next\)/)
  // Java 读 TextField 时用 getString0 来问我们，值一定对得上。
  assert.match(lcdui, /TextFieldLFImpl\.getString0/)
  assert.match(lcdui, /TEXT_UNEDITABLE = 131072/)
  // 播放页侧：真正的 <input>；5 / 确定打开，5 或左软键提交，右软键取消；开着时软键不再传给游戏。
  assert.match(adapter, /input\.setAttribute\('aria-label', '游戏内文字输入'\)/)
  assert.match(adapter, /if \(down && button === 'l2' && startEditing\(\)\) return/)
  assert.match(adapter, /if \(editorId != null\) \{/)
  assert.match(adapter, /__lcdui\?\.commitText\?\.\(id, value\)/)
  assert.match(adapter, /__lcdui\?\.setText\?\.\(id, editorOriginal\)/)
})

test('ItemStateListener 的通知只从 Java 调进来的 native 里发', async () => {
  const lcdui = await readLcdui()
  // 提交发生在播放页的按键处理里，那时没有 VM 上下文（实测报 ctx 为 null），所以攒起来，
  // 等 Java 下次叫到我们（读值或移动焦点）时再发。
  assert.match(lcdui, /function flushItemChange\(\)/)
  assert.match(lcdui, /TextFieldLFImpl\.getString0[\s\S]{0,240}flushItemChange\(\)/)
  assert.match(lcdui, /FormLFImpl\.setCurrentItem0[\s\S]{0,320}flushItemChange\(\)/)
  assert.match(lcdui, /uCallItemStateChanged/)
})
