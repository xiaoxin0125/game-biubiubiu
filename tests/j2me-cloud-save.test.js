// J2ME 的两件新接线：开局选类库（enginemode）与 RMS 云存档。
//
// 端到端行为用 /tmp 的探针跑真实播放页验证过（全新配置 → 游戏写记录 → 自动上传；
// 干净配置 + 云存档 → MIDlet 第一次读 RMS 就拿到 v1；engine 参数真的换了
// java/classes2.jar）。这里守住接线方式与不变量：谁在什么时候把什么交给谁。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { J2ME_CAPABILITIES } from '../frontend/src/composables/player/j2meRuntime.js'
import { J2ME_DEFAULT_ENGINE, J2ME_ENGINES } from '../frontend/src/composables/player/j2meCore.js'
import {
  J2ME_ENGINE_CHOICES, isJ2mePlatform, j2meEngineLabel, readJ2meEngine, writeJ2meEngine,
} from '../frontend/src/composables/player/j2meEngines.js'
import {
  J2ME_DEFAULT_LANGUAGE, J2ME_LANGUAGE_CHOICES, isJ2meLanguage, j2meLanguageLabel,
  j2meLanguageParam, readJ2meLanguage, writeJ2meLanguage,
} from '../frontend/src/composables/player/j2meLanguage.js'

const repoRoot = new URL('../', import.meta.url)
const read = (relative) => readFile(new URL(relative, repoRoot), 'utf8')

test('三个类库档位都给玩家看得懂的名字，且与运行时认得的那批一致', () => {
  assert.deepEqual(
    J2ME_ENGINE_CHOICES.map((choice) => choice.id).sort(),
    [...J2ME_ENGINES].sort(),
  )
  for (const choice of J2ME_ENGINE_CHOICES) {
    assert.ok(choice.label && choice.note, `${choice.id} 要有名称与说明`)
  }
  assert.equal(j2meEngineLabel(J2ME_DEFAULT_ENGINE), J2ME_ENGINE_CHOICES[0].label)
  assert.equal(isJ2mePlatform('j2me'), true)
  assert.equal(isJ2mePlatform('gba'), false)
})

test('类库的选择按 ROM 记在本地；读回来一律现校验', () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  try {
    assert.equal(readJ2meEngine(7), J2ME_DEFAULT_ENGINE)          // 第一次玩：默认兼容库
    writeJ2meEngine(7, 'enginemode2-classes2.jar')
    assert.equal(readJ2meEngine(7), 'enginemode2-classes2.jar')   // 下次开局预选上次那一档
    assert.equal(readJ2meEngine(8), J2ME_DEFAULT_ENGINE)          // 别的 ROM 各记各的
    store.set('j2me:engine:7', 'enginemode-not-a-jar.jar')        // 老数据 / 手改过的值
    assert.equal(readJ2meEngine(7), J2ME_DEFAULT_ENGINE)
    writeJ2meEngine(7, 'enginemode-not-a-jar.jar')                // 不认识的一律不写
    assert.equal(readJ2meEngine(7), J2ME_DEFAULT_ENGINE)
  } finally {
    delete globalThis.localStorage
  }
})

test('帧里的 rms.js：等文件系统就绪、恢复赶在 MIDlet 之前、改动后通知播放页', async () => {
  const rms = await read('frontend/public/j2me/rms.js')
  // 快照格式（path / mtime / base64）与合法性校验。
  assert.match(rms, /\{ v: SNAPSHOT_VERSION, at: Date\.now\(\), files: files \}/)
  assert.match(rms, /if \(!\/\^\\\/RecordStore\\\/\/\.test\(file\.p\) \|\| file\.p\.indexOf\('\.\.'\) !== -1\)/)
  // 恢复要挂在运行时的启动等待里（loadingPromises 是 window.onload 里 await 的那一批），
  // 而且要等 initFS 打开 IndexedDB 文件系统之后再写。超时兜底不能少。
  assert.match(rms, /loadingPromises\.push\(gate\)/)
  assert.match(rms, /Promise\.resolve\(typeof initFS !== 'undefined' \? initFS : null\)\.then/)
  assert.match(rms, /setTimeout\(function \(\) \{ finish\(status\.restore === 'pending' \? 'timeout' : status\.restore\) \}, GATE_TIMEOUT_MS\)/)
  // 参数三种可能：blob: 快照、none（登录但还没有存档，本地必须清干净）、缺席（不碰本地）。
  assert.match(rms, /var mode = param\('save'\)/)
  assert.match(rms, /if \(mode == null \|\| mode === ''\) return finish\('skipped'\)/)
  assert.match(rms, /if \(mode === 'none'\)/)
  // 改动只在 commitWrite / truncateFile / deleteFile 上判定：writeBytes 只是往文件里写。
  assert.match(rms, /'com\/sun\/midp\/rms\/RecordStoreFile\.commitWrite\.\(I\)V'/)
  assert.match(rms, /'com\/sun\/midp\/rms\/RecordStoreFile\.truncateFile\.\(II\)V'/)
  assert.match(rms, /'com\/sun\/midp\/rms\/RecordStoreUtil\.deleteFile\.\(Ljava\/lang\/String;Ljava\/lang\/String;I\)V'/)
  assert.match(rms, /post\(\{ type: 'j2me-rms-dirty' \}\)/)
  // 导出：整棵 /RecordStore 读成 JSON，摘要用来去重。
  assert.match(rms, /function snapshot\(\)/)
  assert.match(rms, /digest: digestOf\(text\)/)
  assert.match(rms, /window\.__j2meRms = \{/)
})

test('播放页：开局读云存档、改动后自动上传、离开前补一次，都不需要按钮', async () => {
  const adapter = await read('frontend/src/composables/player/j2meRuntime.js')
  // 开局：等存档取回来再打开运行时页面，然后交给 rms.js（save 参数）。
  assert.match(adapter, /const cloudSavePromise = cloud\?\.load \? loadCloudSave\(cloud\) : null/)
  assert.match(adapter, /const save = cloudSavePromise \? await cloudSavePromise : null/)
  assert.match(adapter, /url\.searchParams\.set\('save', saveBlobUrl\)/)
  assert.match(adapter, /url\.searchParams\.set\('save', 'none'\)/)
  // 读取失败 / 超时都当作「没有存档」，不能挡住开局。
  assert.match(adapter, /J2ME_CLOUD_SAVE_TIMEOUT_MS = 4000/)
  assert.match(adapter, /console\.warn\('\[j2me\] 云存档读取超时，本次从本地状态启动'\)/)
  // 运行中：帧说改了 → 去抖后上传；摘要没变不重复传。
  assert.match(adapter, /if \(data\.type === 'j2me-rms-dirty'\) \{ scheduleCloudSave\(\); return \}/)
  assert.match(adapter, /if \(!shot \|\| shot\.digest === lastUploadDigest\) return/)
  assert.match(adapter, /await cloud\.save\(shot\.blob, \{ keepalive \}\)/)
  // 暂停 / 关标签页 / 退出各补一次；退出前要在拆掉 iframe 之前把快照读完。
  assert.match(adapter, /void flushCloudSave\(\)\n    \},\n    async resume\(\)/)
  assert.match(adapter, /window\.addEventListener\('pagehide', onPageHide\)/)
  assert.match(adapter, /document\.addEventListener\('visibilitychange', onVisibilityHidden\)/)
  assert.match(adapter, /await Promise\.race\(\[flushCloudSave\(\{ keepalive: true \}\), new Promise\(resolve => setTimeout\(resolve, 1500\)\)\]\)/)
  // 结账时把 blob 地址还回去。
  assert.match(adapter, /if \(saveBlobUrl\) \{ URL\.revokeObjectURL\(saveBlobUrl\); saveBlobUrl = null \}/)
})

test('没有云存档时能力表照旧：persistentRms 跟着接口走，即时存档仍然不支持', () => {
  assert.equal(J2ME_CAPABILITIES.saveState, false)
  assert.equal(J2ME_CAPABILITIES.persistentRms, false)
})

test('能力表与云存档接口：接上才算有持久化', async () => {
  const adapter = await read('frontend/src/composables/player/j2meRuntime.js')
  assert.match(adapter, /const capabilities = cloud\?\.save \? \{ \.\.\.J2ME_CAPABILITIES, persistentRms: true \} : J2ME_CAPABILITIES/)
  // 即时存档 / 读档依旧拒绝：J2ME 没有状态快照，存档走 RMS（见上面的自动流程）。
  assert.match(adapter, /saveState: async \(\) => \{ throw new Error\('J2ME 运行时不支持即时存档\/读档/)
})

test('云存档接线：登录用户一份、客人不接、房间只有房主', async () => {
  const cloud = await read('frontend/src/composables/player/useJ2meCloudSave.js')
  assert.match(cloud, /romMeta\.value\.platform === 'j2me'/)
  assert.match(cloud, /isAuthed\.value/)
  assert.match(cloud, /!isGuestMode\.value/)
  assert.match(cloud, /api\.saveLoad\(romMeta\.value\.id, 0\)/)
  assert.match(cloud, /api\.saveUpload\(romMeta\.value\.id, blob, 0, options\)/)

  const player = await read('frontend/src/views/Player.vue')
  assert.match(player, /const \{ cloudSave \} = useJ2meCloudSave\(\{ romMeta, isAuthed, isGuestMode, showToast \}\)/)
  assert.match(player, /:cloud-save="cloudSave"/)
  assert.match(player, /:engine="isJ2me \? engineChoice : null"/)

  const room = await read('frontend/src/views/RoomPlayer.vue')
  assert.match(room, /enabled: computed\(\(\) => isHostMode\.value === true\)/)
  assert.match(room, /:engine="isJ2me && isHostMode \? engineChoice : null"/)
  // 房间不摆存档 / 读档按钮，单机也收起来：J2ME 的存档是自动的。
  assert.match(room, /const canSaveState = computed\(\(\) => isAuthed\.value && signalMe\.value\?\.isHost === true && !isJ2me\.value\)/)
  assert.match(player, /const canSaveState = computed\(\(\) => isAuthed\.value && !isJ2me\.value\)/)
})

test('开局弹窗：挡住模拟器挂载，选完才开局；重载游戏就是换档重开', async () => {
  const dialog = await read('frontend/src/components/J2meEngineDialog.vue')
  assert.match(dialog, /v-for="choice in choices"/)
  assert.match(dialog, /@click="\$emit\('confirm', \{ engine: selected, language: selectedLanguage \}\)"/)
  assert.match(dialog, /role="radiogroup"/)
  // 选项来自共享常量，弹窗自己不再抄一份列表。
  assert.match(dialog, /const choices = J2ME_ENGINE_CHOICES/)
  assert.match(dialog, /const languageChoices = J2ME_LANGUAGE_CHOICES/)

  for (const view of ['frontend/src/views/Player.vue', 'frontend/src/views/RoomPlayer.vue']) {
    const source = await read(view)
    assert.match(source, /const portalActive = computed\(.*engineConfirmed\.value \|\| !isJ2me\.value\)/s)
    assert.match(source, /readJ2meEngine\(romId\)/)
    assert.match(source, /writeJ2meEngine\(romMeta\.value\?\.id, engine\)/)
    assert.match(source, /engineDialogMode\.value = 'restart'/)
    assert.match(source, /loadProgress\.registerCoreTasks\(core, \{ engine: isJ2me\.value \? engineChoice\.value : null \}\)/)
  }
})

test('类库选择一路传到适配器：组件 → useEmulator → nostalgist → prepareJ2me', async () => {
  const portal = await read('frontend/src/components/emulator-portal/EmulatorPortal.vue')
  assert.match(portal, /engine: \{ type: String, default: null \}/)
  assert.match(portal, /language: \{ type: String, default: null \}/)
  assert.match(portal, /cloudSave: \{ type: Object, default: null \}/)
  assert.match(portal, /engine: props\.engine,\n      language: props\.language,\n      cloudSave: props\.cloudSave,/)
  // 换档/换语言等于换核心：EnginePortal 会自己重启。
  assert.match(portal, /watch\(\(\) => \[romKey\(props\.rom\), props\.core, props\.engine, props\.language\]/)

  const emulator = await read('frontend/src/composables/useEmulator.js')
  assert.match(emulator, /engine = null, language = null, cloudSave = null \}\) \{/)
  assert.match(emulator, /engine, language, cloudSave,/)

  const nostalgist = await read('frontend/src/composables/nostalgist.js')
  assert.match(nostalgist, /\.\.\.\(engine \? \{ engine \} : \{\}\),\n      \.\.\.\(language \? \{ language \} : \{\}\),\n      cloudSave,/)

  const core = await read('frontend/src/composables/player/useCoreAssets.js')
  assert.match(core, /registerCoreTasksFor\(progress, core, \{ engine = null \} = \{\}\)/)
  assert.match(core, /return registerJ2meCoreTasks\(progress, \{ engine: engine \|\| undefined \}\)/)
})

test('游戏语言：弹窗选项 → 本地记忆 → 运行时 URL（auto 什么都不传）', async () => {
  for (const view of ['frontend/src/views/Player.vue', 'frontend/src/views/RoomPlayer.vue']) {
    const source = await read(view)
    assert.match(source, /const languageChoice = ref\(J2ME_DEFAULT_LANGUAGE\)/)
    assert.match(source, /languageChoice\.value = readJ2meLanguage\(\)/)
    assert.match(source, /writeJ2meLanguage\(language\)/)
    assert.match(source, /function confirmEngine\(\{ engine, language \}\)/)
    // 语言进 VM 之前就定下来：改动由 EmulatorPortal 的重启 watch 接管，
    // 两项都没动时才手动重开。
    assert.match(source, /if \(engine === previous && language === previousLanguage\) void onReload\(\)/)
  }
  assert.match(await read('frontend/src/views/Player.vue'), /:language="isJ2me \? languageChoice : null"/)
  assert.match(await read('frontend/src/views/RoomPlayer.vue'), /:language="isJ2me && isHostMode \? languageChoice : null"/)

  const adapter = await read('frontend/src/composables/player/j2meRuntime.js')
  assert.match(adapter, /if \(language != null && !isJ2meLanguage\(language\)\) throw new Error\(`未知的 J2ME 游戏语言：\$\{language\}`\)/)
  assert.match(adapter, /const languageParam = j2meLanguageParam\(language\)/)
  assert.match(adapter, /if \(languageParam\) url\.searchParams\.set\('language', languageParam\)/)
})

test('四个语言档位都给玩家看得懂的名字，且只有 auto 不往运行时传', () => {
  assert.deepEqual(
    J2ME_LANGUAGE_CHOICES.map((choice) => choice.id),
    ['auto', 'zh-CN', 'zh-HK', 'en-US'],
  )
  for (const choice of J2ME_LANGUAGE_CHOICES) {
    assert.ok(choice.label && choice.note, `${choice.id} 要有名称与说明`)
  }
  assert.equal(J2ME_DEFAULT_LANGUAGE, 'auto')
  assert.equal(j2meLanguageParam('auto'), null)       // 自动：由运行时的 siteLocale 看浏览器
  assert.equal(j2meLanguageParam('zh-CN'), 'zh-CN')
  assert.equal(j2meLanguageParam('zh-HK'), 'zh-HK')
  assert.equal(j2meLanguageParam('en-US'), 'en-US')
  assert.equal(j2meLanguageParam(null), null)
  assert.equal(j2meLanguageLabel('zh-HK'), '繁体中文')
  assert.equal(j2meLanguageLabel('nope'), J2ME_LANGUAGE_CHOICES[0].label)
  assert.equal(isJ2meLanguage('zh-SG'), false)        // 玩家只能选这份列表里的值
  assert.equal(isJ2meLanguage('auto'), true)
})

test('语言的选择记在本地（跨 ROM 共用），读回来一律现校验', () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  try {
    assert.equal(readJ2meLanguage(), J2ME_DEFAULT_LANGUAGE)   // 第一次玩：自动
    writeJ2meLanguage('zh-CN')
    assert.equal(readJ2meLanguage(), 'zh-CN')                 // 换个 ROM 也是它：语言跟着人走
    store.set('j2me:language', 'zh-SG')                       // 老数据 / 手改过的值
    assert.equal(readJ2meLanguage(), J2ME_DEFAULT_LANGUAGE)
    writeJ2meLanguage('zh-SG')                                // 不认识的一律不写
    assert.equal(readJ2meLanguage(), J2ME_DEFAULT_LANGUAGE)
  } finally {
    delete globalThis.localStorage
  }
})

test('microedition.locale：中文变体归一成设备语言的名字，其他语言照原样', async () => {
  // 直接跑运行时里那份 siteLocale（补丁写进去的），不是这里再抄一遍。
  const bundle = await read('frontend/public/j2me/bld/main-all.js')
  const source = bundle.match(/function siteLocale\(\) \{[\s\S]*?\n\}/)
  assert.ok(source, 'siteLocale 必须已经在运行时里（补丁见 apply-j2me-patches.mjs）')
  const loadSiteLocale = new Function('config', 'navigator', `${source[0]}\nreturn siteLocale;`)
  const auto = (browser) => loadSiteLocale({}, { language: browser })()
  const forced = (language, browser = 'en-US') => loadSiteLocale({ language }, { language: browser })()

  // 自动：浏览器怎么说，就怎么归到设备语言的名字上。
  assert.equal(auto('zh-CN'), 'zh-CN')
  assert.equal(auto('zh-SG'), 'zh-CN')          // 新加坡简体：就是手机上那一例
  assert.equal(auto('zh-Hans-CN'), 'zh-CN')
  assert.equal(auto('zh'), 'zh-CN')
  assert.equal(auto('zh_CN'), 'zh-CN')          // 下划线写法
  assert.equal(auto('zh-TW'), 'zh-HK')
  assert.equal(auto('zh-Hant-TW'), 'zh-HK')
  assert.equal(auto('zh-HK'), 'zh-HK')
  assert.equal(auto('zh-MO'), 'zh-HK')
  assert.equal(auto('zh-Hans-HK'), 'zh-CN')     // 简繁同时出现时以简体为先
  // 非中文原样交给游戏：MIDlet 找不到自己的包就退回 lang.xx（英文），这是它的选择。
  assert.equal(auto('en-US'), 'en-US')
  assert.equal(auto('ja-JP'), 'ja-JP')
  // 玩家手选的那一档优先，并且同样走归一化。
  assert.equal(forced('zh-CN', 'en-US'), 'zh-CN')
  assert.equal(forced('zh-HK', 'en-US'), 'zh-HK')
  assert.equal(forced('en-US', 'zh-SG'), 'en-US')   // 中文手机上想玩英文版：说得通
  assert.equal(forced('zh-SG'), 'zh-CN')
})

test('上传接口支持 keepalive（关标签页前的最后一次自动存档）', async () => {
  const client = await read('frontend/src/api/client.js')
  assert.match(client, /saveUpload: async \(romId, blob, slot = 0, \{ keepalive = false \} = \{\}\) => \{/)
  assert.match(client, /keepalive,/)
})
