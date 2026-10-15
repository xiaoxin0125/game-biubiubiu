// J2ME 的“核心”进度：运行时脚本与 Java 类库。
//
// J2ME 没有 libretro 核心，但启动前要下四兆多的运行时资源（脚本、样式、类库）。
// 以前这几兆是在 iframe 里悄悄下的，播放页面板上只有 ROM 一项，下完就卡在
// “初始化模拟器…”。这组用例守住新的做法：按 /j2me/version.json 的 boot 清单
// （构建时写入，带每个文件的体积）登记两项核心任务并预取同一批带版本号的地址，
// 让 iframe 之后直接命中缓存；没有清单时不登记任何占位任务。
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  j2meClassLibrary,
  loadJ2meRuntimeManifest,
  registerJ2meCoreTasks,
  resetJ2meRuntimeManifestCache,
  warmJ2meRuntime,
} from '../frontend/src/composables/player/j2meCore.js'
import { useResourceLoadProgress } from '../frontend/src/composables/player/useResourceLoadProgress.js'

const VERSION = 'abc123abc123'
const BOOT = [
  { name: 'main.html', size: 400 },
  { name: 'bld/main-all.js', size: 2048 },
  // 构建脚本把三个类库都写进清单：只有选中的那一个会下载。
  { name: 'java/classesold.jar', size: 8192 },
  { name: 'java/classes2.jar', size: 4096 },
]
const RUNTIME_BYTES = 400 + 2048

/** fetch 替身：清单与运行时资源都从内存里发。 */
function mockFetch(t, { boot = BOOT, version = VERSION, missing = [] } = {}) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    calls.push({ url: target, cache: init.cache, signal: init.signal })
    if (target === '/j2me/version.json') {
      return new Response(JSON.stringify({ version, boot }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const name = target.replace('/j2me/', '').split('?')[0]
    if (missing.includes(name)) return new Response('missing', { status: 404 })
    const entry = boot.find((file) => file.name === name)
    return new Response(new Uint8Array(entry?.size || 16).fill(7), { status: 200 })
  })
  return calls
}

function newSession(tasks = []) {
  const progress = useResourceLoadProgress({ flushIntervalMs: 1 })
  progress.beginSession()
  for (const task of tasks) progress.ensureTask(task)
  return progress
}

test('运行时清单给出启动资源与体积，请求一律带内容版本号', async (t) => {
  const calls = mockFetch(t)
  resetJ2meRuntimeManifestCache()
  const manifest = await loadJ2meRuntimeManifest()
  assert.equal(manifest.version, VERSION)
  assert.deepEqual(manifest.boot, BOOT)
  assert.equal(calls[0].url, '/j2me/version.json')
  assert.equal(calls[0].cache, 'no-store', '版本号本身不能从缓存里来')
  // 同一个页面加载里只问一次
  assert.equal(await loadJ2meRuntimeManifest(), manifest)
  assert.equal(calls.length, 1)
})

test('登记运行时与类库两项核心任务，旧的 js/wasm 占位被清掉', async (t) => {
  mockFetch(t)
  resetJ2meRuntimeManifestCache()
  const progress = newSession([
    { id: 'core:js2me:js', label: 'J2meJS 核心（js）', kind: 'core' },
    { id: 'rom:161', label: '仙剑奇侠传.jar', kind: 'rom', size: 300000 },
  ])
  const plan = await registerJ2meCoreTasks(progress)
  assert.ok(plan)
  assert.deepEqual(progress.tasks.map((task) => task.id), [
    'rom:161',
    'core:j2mejs:runtime',
    'core:j2mejs:java:classesold.jar',
  ])
  const runtime = progress.tasks.find((task) => task.id === 'core:j2mejs:runtime')
  assert.equal(runtime.label, 'J2meJS 运行时（脚本与样式）')
  assert.equal(runtime.status, 'pending')
  assert.equal(runtime.size, RUNTIME_BYTES, '没选中的类库不算进运行时这一项')
  const classLibrary = progress.tasks.find((task) => task.id === 'core:j2mejs:java:classesold.jar')
  assert.equal(classLibrary.label, 'Java 类库（classesold.jar）')
  assert.equal(classLibrary.size, 8192)
  // 体积先于下载就知道：总体进度从一开始就是可确定的百分比
  assert.equal(progress.overall.totalBytes, 300000 + RUNTIME_BYTES + 8192)
  assert.equal(progress.overall.determinate, true)
})

test('预取取的是同一批带版本号的地址，进度按字节写进两项任务', async (t) => {
  const calls = mockFetch(t)
  resetJ2meRuntimeManifestCache()
  const progress = newSession([{ id: 'rom:161', label: '仙剑奇侠传.jar', kind: 'rom', size: RUNTIME_BYTES + 8192 }])
  const manifest = await warmJ2meRuntime({ progress, signal: progress.currentSignal() })
  assert.equal(manifest.version, VERSION)
  progress.flushNow()

  const fetched = calls.filter((call) => call.url !== '/j2me/version.json').map((call) => call.url).sort()
  assert.deepEqual(fetched, [
    `/j2me/bld/main-all.js?v=${VERSION}`,
    `/j2me/java/classesold.jar?v=${VERSION}`,
    `/j2me/main.html?v=${VERSION}`,
  ])
  assert.ok(!fetched.some((url) => url.includes('classes2.jar')), '没选中的类库不下载')
  assert.ok(calls.slice(1).every((call) => call.cache === 'force-cache'), '带版本号的地址命中缓存就用缓存')

  const runtime = progress.tasks.find((task) => task.id === 'core:j2mejs:runtime')
  assert.equal(runtime.status, 'done')
  assert.equal(runtime.loaded, RUNTIME_BYTES)
  const classLibrary = progress.tasks.find((task) => task.id === 'core:j2mejs:java:classesold.jar')
  assert.equal(classLibrary.status, 'done')
  assert.equal(classLibrary.loaded, 8192)
  // 提前登记的任务被复用，而不是又登记一遍
  assert.equal(progress.tasks.filter((task) => task.kind === 'core').length, 2)
})

test('单个文件取不到只让那一项失败，预取本身不抛异常', async (t) => {
  mockFetch(t, { missing: ['bld/main-all.js'] })
  resetJ2meRuntimeManifestCache()
  const progress = newSession()
  const manifest = await warmJ2meRuntime({ progress, signal: progress.currentSignal() })
  assert.ok(manifest, '预取失败不该拖住启动')
  const runtime = progress.tasks.find((task) => task.id === 'core:j2mejs:runtime')
  assert.equal(runtime.status, 'failed')
  assert.equal(progress.statusTextFor(runtime), 'bld/main-all.js 下载失败（HTTP 404）')
  assert.equal(progress.failure.id, 'core:j2mejs:runtime')
  // 另一项照常完成：一处 404 不影响已经取到的文件
  assert.equal(progress.tasks.find((task) => task.id === 'core:j2mejs:java:classesold.jar').status, 'done')
})

test('没有运行时清单（本地开发）时不登记任务，也不预取文件', async (t) => {
  const calls = mockFetch(t, { boot: [] })
  resetJ2meRuntimeManifestCache()
  const progress = newSession([{ id: 'rom:161', label: '仙剑奇侠传.jar', kind: 'rom', size: 300000 }])
  assert.equal(await warmJ2meRuntime({ progress, signal: progress.currentSignal() }), null)
  assert.deepEqual(progress.tasks.map((task) => task.id), ['rom:161'], '不留永远完不成的占位项')
  assert.deepEqual(calls.map((call) => call.url), ['/j2me/version.json'])
})

test('预取返回之前换了游戏：结果不写进新会话', async (t) => {
  mockFetch(t)
  resetJ2meRuntimeManifestCache()
  const writes = []
  const tasks = []
  const progress = {
    tasks,
    sessionId: 1,
    ensureTask: (task) => tasks.push(task),
    dropTask: () => {},
    setStage: () => {},
    taskProgress: (id, loaded) => writes.push({ kind: 'progress', id, loaded }),
    taskSettled: (id, status) => writes.push({ kind: 'settled', id, status }),
    taskFailed: (id) => writes.push({ kind: 'failed', id }),
    currentSignal: () => null,
  }
  const pending = warmJ2meRuntime({ progress })
  progress.sessionId = 2
  await pending
  assert.ok(!writes.some((write) => write.kind !== 'progress'), '完成/失败都属于上一局，不能写进新会话')
})

test('类库文件名跟运行时自己的取法一致', () => {
  assert.equal(j2meClassLibrary(), 'java/classesold.jar')
  assert.equal(j2meClassLibrary('enginemode2-classes2.jar'), 'java/classes2.jar')
  assert.equal(j2meClassLibrary('enginemode3-classes.jar'), 'java/classes.jar')
  assert.equal(j2meClassLibrary('乱填的'), 'java/classesold.jar')
})
