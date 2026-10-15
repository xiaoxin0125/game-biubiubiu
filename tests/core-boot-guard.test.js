import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCoreBootGuard } from '../frontend/src/composables/player/coreBootGuard.js'
import { prepareEmulator } from '../frontend/src/composables/nostalgist.js'
import { Nostalgist } from 'nostalgist'

test('RetroArch 回退菜单不算游戏启动成功', (t) => {
  t.mock.method(console, 'error', () => {})
  const guard = createCoreBootGuard('squirreljme')
  guard.emscriptenModule.printErr('[ERROR] [Content]: Failed to load content')
  assert.throws(() => guard.onLaunch(), /squirreljme.*无法加载此 ROM/)
})

test('普通日志、警告及正常退出不会误报启动失败', (t) => {
  t.mock.method(console, 'error', () => {})
  const guard = createCoreBootGuard('opera')
  guard.emscriptenModule.printErr('[INFO] [Content]: Loading content')
  guard.emscriptenModule.printErr('[WARN] Optional font not found')
  guard.emscriptenModule.quit(0)
  assert.doesNotThrow(() => guard.onLaunch())
})

test('异常退出向调用方传播，保留原始异常', () => {
  const guard = createCoreBootGuard('opera')
  const reason = new WebAssembly.RuntimeError('unreachable')
  assert.throws(() => guard.emscriptenModule.quit(1, reason), (err) => err === reason)
  assert.throws(() => guard.onLaunch(), (err) => err === reason)
})

test('中止后即使 start 返回也要失败，重试使用独立守卫', () => {
  const failed = createCoreBootGuard('opera')
  failed.emscriptenModule.onAbort('unreachable')
  assert.throws(() => failed.onLaunch(), /opera.*启动中止.*unreachable/)
  const retry = createCoreBootGuard('opera')
  assert.doesNotThrow(() => retry.onLaunch())
})

test('prepareEmulator 给 Nostalgist 接入失败检测', async (t) => {
  let received
  t.mock.method(Nostalgist, 'prepare', async (options) => { received = options; return {} })
  t.mock.method(console, 'error', () => {})
  await prepareEmulator({ core: { name: 'opera', js: {}, wasm: {} }, rom: {} })
  assert.equal(typeof received.emscriptenModule.quit, 'function')
  received.emscriptenModule.printErr('[ERROR]', '[Content]: Failed to load content')
  assert.throws(() => received.onLaunch(), /opera.*无法加载/)
})
