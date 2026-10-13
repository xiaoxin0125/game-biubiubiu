import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createAppDialog } from '../frontend/src/composables/useAppDialog.js'

const source = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), 'utf8')

test('确认操作必须等到用户确定，取消不会执行后续操作', async () => {
  const dialog = createAppDialog()
  let executions = 0
  async function action() {
    if (!await dialog.showConfirm('确认删除？', { danger: true })) return
    executions += 1
  }
  const cancelled = action()
  assert.equal(executions, 0)
  assert.equal(dialog.activeDialog.value.type, 'confirm')
  assert.equal(dialog.activeDialog.value.danger, true)
  dialog.cancelDialog()
  await cancelled
  assert.equal(executions, 0)

  const confirmed = action()
  dialog.submitDialog()
  await confirmed
  assert.equal(executions, 1)
  assert.equal(dialog.activeDialog.value, null)
})

test('输入弹窗校验失败时保持打开，通过时返回输入，取消返回 null', async () => {
  const dialog = createAppDialog()
  const result = dialog.showPrompt('输入页码', {
    validate: (value) => value === '12' ? '' : '请输入 12',
  })
  const id = dialog.activeDialog.value.id
  assert.equal(dialog.submitDialog('abc'), false)
  assert.equal(dialog.error.value, '请输入 12')
  assert.equal(dialog.activeDialog.value.id, id)
  assert.equal(dialog.submitDialog(' 12 '), true)
  assert.equal(await result, '12')
  assert.equal(dialog.error.value, '')

  const cancelled = dialog.showPrompt('输入页码')
  dialog.cancelDialog()
  assert.equal(await cancelled, null)
})

test('并发提示按顺序展示，不覆盖前一个确认的结果', async () => {
  const dialog = createAppDialog()
  const first = dialog.showConfirm('第一个')
  const firstId = dialog.activeDialog.value.id
  const second = dialog.showPrompt('第二个')
  const third = dialog.showAlert('第三个')
  assert.equal(dialog.activeDialog.value.message, '第一个')
  dialog.submitDialog()
  assert.equal(await first, true)
  assert.equal(dialog.activeDialog.value.message, '第二个')
  assert.ok(dialog.activeDialog.value.id > firstId)
  dialog.submitDialog('3')
  assert.equal(await second, '3')
  assert.equal(dialog.activeDialog.value.confirmText, '知道了')
  dialog.submitDialog()
  assert.equal(await third, true)
  assert.equal(dialog.activeDialog.value, null)
})

test('离开页面会取消当前和排队中的所有弹窗，之后仍能打开新弹窗', async () => {
  const dialog = createAppDialog()
  const pending = [dialog.showConfirm('确认'), dialog.showPrompt('输入'), dialog.showAlert('提示')]
  dialog.cancelAll()
  assert.deepEqual(await Promise.all(pending), [false, null, false])
  assert.equal(dialog.activeDialog.value, null)
  assert.equal(dialog.submitDialog(), false)
  dialog.cancelAll()
  dialog.cancelDialog()

  const fresh = dialog.showConfirm('新的确认')
  dialog.submitDialog()
  assert.equal(await fresh, true)
})

test('所有原生确认、输入和错误提示均接入统一弹窗', () => {
  const paths = ['views/Gallery.vue', 'views/MyRoms.vue', 'views/Admin.vue', 'views/Rooms.vue', 'components/AppHeader.vue']
  for (const path of paths) {
    const text = source(path)
    assert.doesNotMatch(text, /\b(?:confirm|prompt|alert)\s*\(/, path)
    assert.match(text, /useAppDialog/, path)
    if (text.includes('showConfirm(')) assert.match(text, /if \(!await showConfirm\(/, path)
  }
  const app = source('App.vue')
  assert.match(app, /<AppDialog\s*\/>/)
  assert.match(app, /watch\(\(\) => route.fullPath, cancelAll/)
})

test('弹窗复用项目风格并支持键盘、焦点恢复和手机数字键盘', () => {
  const dialog = source('components/AppDialog.vue')
  for (const expected of ['Teleport to="body"', 'aria-modal="true"', 'aria-labelledby=', 'aria-describedby=', 'role="alert"', "event.key === 'Escape'", "event.key !== 'Tab'", 'target.focus', 'var(--clay-surface)', 'var(--clay-lg)', 'justify-content: center', ':inputmode=']) {
    assert.ok(dialog.includes(expected), expected)
  }
})
