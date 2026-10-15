import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ref } from 'vue'
import { prepareEmulator } from '../frontend/src/composables/nostalgist.js'
import { registerCoreTasksFor } from '../frontend/src/composables/player/useCoreAssets.js'
import { resetJ2meRuntimeManifestCache } from '../frontend/src/composables/player/j2meCore.js'
import { useResourceLoadProgress } from '../frontend/src/composables/player/useResourceLoadProgress.js'
import { useSaveState } from '../frontend/src/composables/player/useSaveState.js'
import { J2ME_BUTTON_KEYS } from '../frontend/src/composables/player/j2meRuntime.js'
import { getPlatform } from '../frontend/src/constants/platforms.js'

test('Java 核心与旧设置都走 JAR 适配器，而不是再下载 SquirrelJME', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Java ROM 校验之前不应下载核心'))
  for (const core of ['js2me', 'squirreljme', { name: 'squirreljme' }]) {
    await assert.rejects(prepareEmulator({ core, rom: { fileName: 'game.jad', fileContent: new Blob(['descriptor']) } }), /只支持 JAR/)
  }
})

test('Java 不登记虚假的 WASM 下载任务，改为登记运行时与类库', async (t) => {
  // J2ME 读的是运行时自己的清单（/j2me/version.json），不是 libretro 发布清单。
  resetJ2meRuntimeManifestCache()
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), '/j2me/version.json', 'Java 只问运行时清单')
    return new Response(JSON.stringify({
      version: 'abc123abc123',
      boot: [{ name: 'preload.js', size: 587 }, { name: 'java/classesold.jar', size: 1682052 }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  const progress = useResourceLoadProgress()
  progress.beginSession()
  // 平台默认核心先占过位：J2ME 没有 js/wasm 这两个文件，占位要被清掉
  progress.ensureTask({ id: 'core:squirreljme:js', label: 'J2meJS 核心（js）', kind: 'core' })
  progress.ensureTask({ id: 'rom:161', label: '仙剑奇侠传.jar', kind: 'rom', size: 300000 })
  await registerCoreTasksFor(progress, 'js2me')
  assert.deepEqual(progress.tasks.map((task) => task.id), [
    'rom:161',
    'core:j2mejs:runtime',
    'core:j2mejs:java:classesold.jar',
  ])
})

// 进度对象上挂的是 ref：方法拿到 reactive 包装前的 api 就没法迭代 tasks，
// 每次进播放页都会抛 "object is not iterable"，核心任务也就登记不上。
test('核心任务登记使用解包后的任务列表', async (t) => {
  resetJ2meRuntimeManifestCache()
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ version: 'abc123abc123', boot: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const progress = useResourceLoadProgress()
  assert.ok(Array.isArray(progress.tasks))
  await assert.doesNotReject(() => progress.registerCoreTasks('js2me'))
})

test('手机全键盘可由网站按键设置和虚拟手柄访问，包括 0 键', () => {
  const platform = getPlatform('j2me')
  assert.deepEqual([...platform.buttons].sort(), Object.keys(J2ME_BUTTON_KEYS).sort())
  assert.equal(platform.buttonLabels.r2, '0')
})

test('Java 即时存档能力限制会显示给玩家，不发起云端请求', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('不支持的即时存档不应访问云端'))
  const messages = []
  const actions = useSaveState({
    romMeta: ref({ id: 161 }), platformInfo: ref({ core: 'js2me' }),
    portalRef: ref({ coreSupportsSaveState: () => false }),
    isAuthed: ref(true), isGuestMode: ref(false), showToast: msg => messages.push(msg),
  })
  await actions.onSaveState()
  await actions.onLoadState()
  assert.match(messages[0], /不支持即时存档/)
  assert.match(messages[1], /不支持即时读档/)
})
