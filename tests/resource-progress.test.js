import assert from 'node:assert/strict'
import { test } from 'node:test'

import { useResourceLoadProgress } from '../frontend/src/composables/player/useResourceLoadProgress.js'
import { declaredSizeOf, readResponseBlob } from '../frontend/src/composables/useBlobCache.js'

// 进度面板的一切都建立在这几个数字上：分母必须是"资源本身的体积"，分子必须是
// 已读取的字节数。这里用真实的 Response/ReadableStream 验证计量口径。

function progressWithTasks(tasks) {
  const progress = useResourceLoadProgress({ flushIntervalMs: 5 })
  progress.beginSession()
  for (const task of tasks) progress.ensureTask(task)
  return progress
}

test('总体进度按字节加权，并通过节流后的回调更新', async () => {
  const progress = progressWithTasks([
    { id: 'core:fbneo:wasm', label: '街机核心（wasm）', kind: 'core', size: 1000 },
    { id: 'core:fbneo:js', label: '街机核心（js）', kind: 'core', size: 200 },
  ])
  assert.equal(progress.overall.totalBytes, 1200)
  assert.equal(progress.overall.determinate, true)
  assert.equal(progress.overall.ratio, 0)

  progress.taskProgress('core:fbneo:wasm', 500)
  progress.taskProgress('core:fbneo:js', 200, { cached: true })
  // 小文件命中缓存：状态直接是"本地缓存已就绪"，且按完整体积计入
  assert.equal(progress.tasks.find((t) => t.id === 'core:fbneo:js').status, 'cached')
  assert.equal(progress.tasks.find((t) => t.id === 'core:fbneo:js').loaded, 200)

  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(progress.overall.loadedBytes, 700)
  assert.equal(Math.round(progress.overall.ratio * 100), 58)

  progress.taskSettled('core:fbneo:wasm', 'done', { size: 1000 })
  assert.equal(progress.overall.ratio, 1)
  assert.equal(progress.overall.completed, 2)
  assert.equal(progress.overall.allSettled, true)
})

test('总长未知时不给百分比，但已读取字节照常累计', () => {
  const progress = progressWithTasks([
    { id: 'bios:arcade/neogeo.zip', label: 'BIOS neogeo.zip', kind: 'bios' },
  ])
  assert.equal(progress.overall.determinate, false)
  assert.equal(progress.overall.ratio, null)

  progress.taskProgress('bios:arcade/neogeo.zip', 300)
  progress.flushNow()
  assert.equal(progress.overall.loadedBytes, 300)
  assert.equal(progress.overall.determinate, false)

  // 拿到可信总长（未压缩响应的 Content-Length）之后就能给百分比了
  progress.setTaskSize('bios:arcade/neogeo.zip', 600)
  progress.flushNow()
  assert.equal(progress.overall.determinate, true)
  assert.equal(progress.overall.ratio, 0.5)
})

test('旧会话的迟到回调一律丢弃，不会被当成当前进度', () => {
  const progress = progressWithTasks([{ id: 'rom:1', label: '游戏文件', kind: 'rom', size: 100 }])
  const staleSession = progress.sessionId
  progress.taskProgress('rom:1', 60, { session: staleSession })
  progress.flushNow()
  assert.equal(progress.overall.loadedBytes, 60)

  // 换游戏：新会话、清空任务、中断旧请求
  const signal = progress.currentSignal()
  progress.beginSession({ stage: 'meta' })
  assert.equal(signal.aborted, true)
  assert.equal(progress.tasks.length, 0)
  assert.equal(progress.stage, 'meta')

  progress.ensureTask({ id: 'rom:2', label: '另一个游戏', kind: 'rom', size: 100 })
  progress.taskProgress('rom:2', 20, { session: staleSession })
  progress.taskProgress('rom:2', 30)
  progress.flushNow()
  assert.equal(progress.overall.loadedBytes, 30, '旧会话的 20 不该混进来')
})

test('重试从 0 重新累计，失败尝试的字节不重复计入', () => {
  const progress = progressWithTasks([{ id: 'core:fbneo:wasm', label: '街机核心（wasm）', kind: 'core', size: 900 }])
  progress.taskProgress('core:fbneo:wasm', 400)
  progress.flushNow()
  assert.equal(progress.overall.loadedBytes, 400)

  // 远端失败 → 换本机地址重试：先归零，再重新累计
  progress.taskProgress('core:fbneo:wasm', 0)
  progress.setTaskStatus('core:fbneo:wasm', 'loading', { note: '正在切换备用地址…' })
  progress.flushNow()
  assert.equal(progress.overall.loadedBytes, 0)
  assert.equal(progress.statusTextFor(progress.tasks[0]), '正在切换备用地址…')

  progress.taskProgress('core:fbneo:wasm', 900)
  progress.flushNow()
  assert.equal(progress.overall.loadedBytes, 900)
  assert.equal(progress.overall.ratio, 1)
})

test('BIOS 跳过不算失败，也不会让进度永远等下去', () => {
  const progress = progressWithTasks([
    { id: 'core:fbneo:wasm', label: '街机核心（wasm）', kind: 'core', size: 100 },
    { id: 'bios:neogeo.zip', label: 'BIOS neogeo.zip', kind: 'bios' },
  ])
  progress.taskSettled('core:fbneo:wasm', 'done')
  progress.taskSettled('bios:neogeo.zip', 'skipped')
  assert.equal(progress.overall.allSettled, true)
  assert.equal(progress.overall.ratio, 1)
  assert.equal(progress.failure, null)
})

test('必需资源失败：标记失败资源、给出原因，阶段变成失败', () => {
  const progress = progressWithTasks([{ id: 'core:fbneo:wasm', label: '街机核心（wasm）', kind: 'core', size: 100 }])
  progress.taskFailed('core:fbneo:wasm', '内容校验不通过')
  progress.setStage('failed')
  assert.equal(progress.stage, 'failed')
  assert.deepEqual(progress.failure, { id: 'core:fbneo:wasm', label: '街机核心（wasm）', message: '内容校验不通过' })
  assert.equal(progress.statusTextFor(progress.tasks[0]), '内容校验不通过')
  assert.equal(progress.overall.ratio, 0)
})

test('核心换了以后：还没开始的旧核心任务被清掉，已完成的不动', () => {
  const progress = useResourceLoadProgress()
  progress.beginSession()
  // 平台默认核心先占位
  progress.ensureTask({ id: 'core:snes9x:js', label: 'Snes9x 核心（js）', kind: 'core', size: 254000 })
  progress.ensureTask({ id: 'core:snes9x:wasm', label: 'Snes9x 核心（wasm）', kind: 'core', size: 4600000 })
  // 其中一个已经开始下载：这是事实，不能抹掉
  progress.taskProgress('core:snes9x:wasm', 1000)
  progress.flushNow()

  // 元数据到达：实际要用 nestopia
  progress.ensureTask({ id: 'core:nestopia:js', label: 'Nestopia 核心（js）', kind: 'core', size: 261000 })
  progress.ensureTask({ id: 'core:nestopia:wasm', label: 'Nestopia 核心（wasm）', kind: 'core', size: 4200000 })
  assert.equal(progress.dropTask('core:snes9x:js'), true, '还没开始的任务应该被清掉')
  assert.equal(progress.dropTask('core:snes9x:wasm'), false, '正在下载的任务不能抹掉')

  const ids = progress.tasks.map((task) => task.id)
  assert.ok(!ids.includes('core:snes9x:js'))
  assert.deepEqual(ids.filter((id) => id.startsWith('core:')), ['core:snes9x:wasm', 'core:nestopia:js', 'core:nestopia:wasm'])
})

test('阶段文案由真实事件驱动', () => {
  const progress = useResourceLoadProgress()
  assert.equal(progress.stage, 'idle')
  assert.equal(progress.stageText, '')

  progress.beginSession({ stage: 'meta' })
  assert.equal(progress.stageText, '读取游戏信息…')
  progress.setStage('resources')
  assert.equal(progress.stageText, '加载资源…')
  progress.setStage('verify')
  assert.equal(progress.stageText, '校验资源…')
  progress.setStage('emulator')
  assert.equal(progress.stageText, '初始化模拟器…')
  progress.setStage('ready')
  assert.equal(progress.stageText, '启动完成')
  // 不认识的阶段不写进去，避免把界面文案打乱
  progress.setStage('whatever')
  assert.equal(progress.stage, 'ready')
})

test('压缩响应的 Content-Length 不能当分母', () => {
  const gzipped = new Response('x', {
    headers: { 'Content-Length': '3', 'Content-Encoding': 'gzip' },
  })
  assert.equal(declaredSizeOf(gzipped), null, 'gzip 后的长度不是资源本身的大小')

  const plain = new Response('x', { headers: { 'Content-Length': '3' } })
  assert.equal(declaredSizeOf(plain), 3)
})

test('流式读取按资源本身计量：解压后的字节数 + 调用方给的可信总长', async () => {
  const payload = new Uint8Array(3000).fill(7)
  const res = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(payload.slice(0, 1000))
      controller.enqueue(payload.slice(1000))
      controller.close()
    },
  }), { headers: { 'Content-Type': 'application/wasm' } })

  const events = []
  // 清单给的原始体积（解压后）作为分母：1000 字节原文件被 gzip 成 300 字节时，
  // 分母仍然是 1000，而不是 Content-Length 的 300。
  const { blob, bytes, declaredSize } = await readResponseBlob(res, {
    expectedSize: 3000,
    onProgress: (event) => events.push(event),
  })

  assert.equal(bytes, 3000)
  assert.equal(blob.size, 3000)
  assert.equal(declaredSize, null)
  assert.equal(events.at(-1).loaded, 3000)
  assert.equal(events.at(-1).total, 3000)
  assert.equal(events.at(-1).done, true)
  assert.equal(blob.type, 'application/wasm')
})

test('没有可信总长时退化为"已读取字节"，不假装有百分比', async () => {
  const res = new Response('abcdefghij')
  const events = []
  const progress = progressWithTasks([{ id: 'bios:fds/disksys.rom', label: 'BIOS disksys.rom', kind: 'bios' }])

  const { blob } = await readResponseBlob(res, {
    onProgress: ({ loaded, total, done }) => {
      events.push({ loaded, total, done })
      if (total) progress.setTaskSize('bios:fds/disksys.rom', total)
      progress.taskProgress('bios:fds/disksys.rom', loaded)
    },
  })

  assert.equal(blob.size, 10)
  assert.equal(events.at(-1).total, 10, '未压缩响应可以信任 Content-Length')
  progress.taskSettled('bios:fds/disksys.rom', 'done', { size: blob.size, loaded: blob.size })
  assert.equal(progress.overall.ratio, 1)
})

test('不支持响应流的环境仍然能完成下载', async () => {
  const res = new Response('hello')
  // 模拟老浏览器：body 拿不到 reader
  Object.defineProperty(res, 'body', { value: null })
  const { blob } = await readResponseBlob(res, { expectedSize: 5 })
  assert.equal(await blob.text(), 'hello')
})
