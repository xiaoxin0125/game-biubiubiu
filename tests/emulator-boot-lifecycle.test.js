import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Nostalgist } from 'nostalgist'
import { useEmulator } from '../frontend/src/composables/useEmulator.js'

function fakeEmulator({ start = async () => {} } = {}) {
  const counts = { exit: 0, remove: 0 }
  const canvas = { setAttribute() {}, classList: { add() {} }, remove() { counts.remove++ }, focus() {} }
  return {
    counts,
    getCanvas: () => canvas,
    getEmscripten: () => ({ Module: {} }),
    start,
    exit: async () => { counts.exit++ },
  }
}
const opts = { core: { name: 'opera', js: {}, wasm: {} }, rom: {} }

test('启动失败清理画布和实例，重试不会返回失败的实例', async (t) => {
  t.mock.method(console, 'warn', () => {}) // composable is tested without mounting a Vue component
  const previous = new Map(['document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of previous.keys()) Object.defineProperty(globalThis, key, {
    configurable: true, value: { addEventListener() {}, removeEventListener() {}, visibilityState: 'hidden' },
  })
  try {
    const failure = new Error('核心启动失败')
    const failed = fakeEmulator({ start: async () => { throw failure } })
    const recovered = fakeEmulator()
    let attempts = 0
    t.mock.method(Nostalgist, 'prepare', async () => ++attempts === 1 ? failed : recovered)
    const emu = useEmulator()
    emu.wrapperRef.value = { append() {} }
    const stages = []
    await assert.rejects(emu.boot({ ...opts, progress: { setStage: s => stages.push(s) } }), /核心启动失败/)
    assert.equal(emu.instance.value, null)
    assert.equal(emu.canvas(), null)
    assert.equal(emu.booting.value, false)
    assert.equal(failed.counts.exit, 1)
    assert.equal(failed.counts.remove, 1)
    assert.equal(stages.at(-1), 'failed')
    assert.equal(await emu.boot(opts), recovered)
    assert.equal(attempts, 2)
    assert.equal(emu.error.value, null)
    await emu.destroy()
    assert.equal(recovered.counts.exit, 1)
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})

test('下载完成前销毁页面，迟到的实例不能重新挂载', async (t) => {
  t.mock.method(console, 'warn', () => {})
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  t.mock.method(Nostalgist, 'prepare', () => pending)
  const emu = useEmulator()
  emu.wrapperRef.value = { append() { assert.fail('cancelled canvas was attached') } }
  const boot = emu.boot(opts)
  await emu.destroy()
  const late = fakeEmulator()
  finish(late)
  assert.equal(await boot, null)
  assert.equal(emu.instance.value, null)
  assert.equal(late.counts.exit, 1)
})
