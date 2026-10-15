// J2meJS 运行时的站点补丁与产物版本号。
//
// 手机端曾经完全起不来游戏：上游 compiled-method-cache.js 里
// `openDatabase.then(new Promise(executor))` 的 executor 在调用时就执行，
// WebKit（iOS Safari / iOS Edge）那时还没拿到 database 句柄 —— 抛出的
// TypeError 被 bridge 当成致命错误上报，播放页于是直接判定启动失败。V8 只是
// 恰好在 window.onload 之前开好了库，所以桌面端看不出来。
//
// 这一组用例守住三件事：补丁确实在库里、补丁脚本可重复执行、运行时静态文件
// 在构建后会带上内容版本号（否则手机浏览器的 12 小时缓存会让新页面配老脚本）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { J2ME_BUTTON_KEYS } from '../frontend/src/composables/player/j2meRuntime.js'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const runtimeDir = path.join(repoRoot, 'frontend/public/j2me')
// 补丁脚本与集成文档刻意放在 public/ 之外：public/ 里的文件会被 vite 原样复制进
// frontend/dist 当成静态资源对外提供（2026-10 审计 H-3）。
const scriptsDir = path.join(repoRoot, 'frontend/scripts')
const patchScript = path.join(scriptsDir, 'apply-j2me-patches.mjs')
const read = (relative) => readFileSync(path.join(runtimeDir, relative), 'utf8')

test('J2meJS 运行时补丁齐备，且补丁脚本可重复执行', () => {
  const cache = read('libs/compiled-method-cache.js')
  // 只允许“先等数据库打开再读句柄”的写法。
  assert.match(cache, /openDatabase\.then\(function\(\) \{ return new Promise\(/)
  assert.doesNotMatch(cache, /openDatabase\.then\(new Promise\(/)
  assert.equal((cache.match(/openDatabase\.then\(function\(\) \{ return new Promise\(/g) || []).length, 2)

  const bundle = read('bld/main-all.js')
  assert.match(bundle, /window\.__j2meJars \|\| config\.jars\.split\(":"\)/)
  // 编译方法缓存只是优化项：clear() 失败或变慢都不能挡住/中断启动。
  assert.match(bundle, /Promise\.race\(\[cacheReady, cacheTimeout\]\)\.then\(function\(\) \{/)
  assert.match(bundle, /compiled method cache unavailable/)
  // 类库跟随页面版本号，避免新页面配旧的 classesold.jar。
  assert.match(bundle, /if \(pageVersion\) classedjarname \+= '\?v=' \+ encodeURIComponent\(pageVersion\);/)
  // 手机键盘的代码必须带上 MIDP 规定的游戏动作（见下一条用例）。
  assert.match(bundle, /50:1,52:2,54:5,56:6,53:8,49:9,51:10,55:11,57:12/)
  // getKeyCode(action) 要答出播放页真正发的那颗键：十字键是导航键，其余是键盘。
  assert.match(bundle, /var keyMap = \{1:-1, 2:-3, 5:-4, 6:-2, 8:53, 9:49, 10:51, 11:55, 12:57\};/)
  // 导航键与软键的负代码取不到名字时会落到 String.fromCharCode(-1) 上。
  assert.match(bundle, /"-1":"Up", "-2":"Down", "-3":"Left", "-4":"Right", "-5":"Select", "-6":"Softkey 1", "-7":"Softkey 2"/)
  // microedition.locale 不能再直接把 navigator.language 交给 MIDlet：中文手机报的是
  // zh-SG、zh-Hans-CN 这些浏览器写法，游戏按 /lang.<值> 精确取包，差一点就退回英文。
  // 两处取值（System.getProperty0 与 Configuration.getProperty0）都要走 siteLocale。
  assert.match(bundle, /function siteLocale\(\) \{/)
  assert.equal((bundle.match(/value = siteLocale\(\);/g) || []).length, 2)
  assert.doesNotMatch(bundle, /value = navigator\.language;/)

  const html = read('main.html')
  assert.match(html, /<script defer src="preload\.js"><\/script>/)
  assert.match(html, /<script defer src="bridge\.js"><\/script>/)

  const engine = read('bld/j2me.js')
  assert.match(engine, /J2ME\.enableCompiledMethodCache = false;/)
  // The browser must regenerate methods for the current runtime instead of
  // restoring methods persisted by an older page from IndexedDB.
  assert.doesNotMatch(engine, /J2ME\.enableCompiledMethodCache = true/)
  // 分配器返回 0 时不能再往地址 0 写对象头（那是运行时自己的低地址内存，
  // GC 的空闲链表就在那儿），要抛出 Java 的 OutOfMemoryError。
  assert.match(engine, /throw \$\.ctx\.createException\("java\/lang\/OutOfMemoryError", "J2ME heap allocation failed"\);/)
  // Java 的数组/空指针检查不能只记日志后继续执行：JIT 里的 TN/TI
  // 直接保护后面的字段和数组写入，否则异常路径会把 GC 元数据覆盖掉。
  assert.match(engine, /case 1 \/\* ArrayIndexOutOfBoundsException \*\/:\n                    J2ME\.throwArrayIndexOutOfBoundsException\(a\);/)
  assert.match(engine, /case 3 \/\* NullPointerException \*\/:\n                    J2ME\.throwNullPointerException\(\);/)
  assert.match(engine, /function throwNullPointerException\(\) \{\n        throw \$\.newNullPointerException\(\);/)
  assert.match(engine, /function throwArrayIndexOutOfBoundsException\(index\) \{\n        throw \$\.newArrayIndexOutOfBoundsException\(String\(index\)\);/)
  assert.match(engine, /function throwArithmeticException\(\) \{\n        throw \$\.newArithmeticException\("\/ by zero"\);/)
  assert.match(engine, /if \(!isAssignableTo\(valueClassInfo, arrayClassInfo\.elementClass\)\) \{\n            throw \$\.newArrayStoreException\(\);/)
  // Primitive array opcodes must check null before reading ARRAY_LENGTH_OFFSET;
  // the original interpreter only did this for reference arrays.
  assert.match(engine, /case 46 \/\* IALOAD \*\/:\n                    case 48 \/\* FALOAD \*\/:\n[\s\S]*?arrayAddr === 0 \/\* NULL \*\/[\s\S]*?case 51 \/\* BALOAD \*\/:/)
  assert.match(engine, /BaselineCompiler\.prototype\.emitStoreIndexed = function \(kind\) \{[\s\S]*?this\.emitNullPointerCheck\(array\);\n            this\.emitBoundsCheck\(array, index\);/)
  // 虚调用与接口调用也要在接收者为 null 时就抛 Java 空指针：上游只给 INVOKESPECIAL
  // 做了检查，另外两条会去读 null 的 vTable/iTable，抛出的 JS TypeError 只能在解释器
  // 的 catch 里被翻译成 NPE —— 每次都是控制台里的一条红色报错。
  assert.match(engine, /case 182 \/\* INVOKEVIRTUAL \*\/:\n                                    if \(address === 0 \/\* NULL \*\/\) \{\n                                        thread\.throwException\(fp, sp, opPC, 3 \/\* NullPointerException \*\/\);/)
  assert.match(engine, /case 185 \/\* INVOKEINTERFACE \*\/:\n                                    if \(address === 0 \/\* NULL \*\/\) \{/)
  // MIDlet 自己捕获的 Java 异常是常态，不该打警告与对象转储；只有没人接的异常报一次。
  assert.match(engine, /console\.debug\("error occurs at : "/)
  assert.match(engine, /console\.error\("Uncaught Java exception: "/)
  assert.doesNotMatch(engine, /console\.warn\("error occurs at : "/)
  // 只有线程最底层那个 ExitInterpreter 标记才算「没人接」：JIT 代码通过
  // fastInterpreterFrameAdapter 调进解释器时会再压一个标记，那种异常上面那些编译帧
  // 自己有处理者 —— 报成没人接就是给已经接住的异常多刷一条红色报错。
  assert.match(engine, /if \(this\.fp === this\.bp\) \{/)
  assert.match(engine, /console\.debug\("Java exception left the interpreter: "/)
  // 走完全部帧的异常必须离开解释器：这个分支原来把它吞掉后继续跑解释器循环，
  // 同一条出错指令于是被反复重跑（栈指针每次涨两个 int），Java 侧的处理者永远收不到，
  // 控制台被同一条报错刷满、游戏停在载入画面。
  assert.match(engine, /\/\/ Site patch \(thread death\):/)
  assert.match(engine, /if \(err && err\.classInfo\) \{\n                        throw err;\n                    \}/)
  // 线程真的死掉时，控制台要说出是哪个 Java 异常，而不是打一个对象转储。
  assert.match(engine, /\/\/ Site patch \(readable thread death\):/)
  assert.match(engine, /console\.error\("Thread terminated by " \+ e\.classInfo\._name \+/)

  // 这些 MIDP 内部调用在这个运行时里本来就是空操作（标题栏的信任图标、套件锁、显示
  // 状态、CHAPI 记账），逐次警告只会把真正的问题淹掉。
  assert.doesNotMatch(bundle, /console\.warn\("Display\.drawTrustedIcon0/)
  assert.doesNotMatch(bundle, /console\.warn\("MIDletSuiteImpl\.lockMIDletSuite/)
  assert.doesNotMatch(bundle, /console\.warn\("DisplayDevice\.displayStateChanged0/)
  assert.doesNotMatch(bundle, /console\.warn\("SuspendSystem\$MIDPSystem\.allMidletsKilled/)
  assert.doesNotMatch(bundle, /addUnimplementedNative\("com\/sun\/j2me\/content\/InvocationStore\.setCleanup0/)
  // RMS 的监听者登记表是 AMS 给「别的 MIDlet」的通知簿：这里一次只跑一个 MIDlet，
  // 也没有任何登记表，每次开关 record store 都警告两句只是噪声。
  assert.doesNotMatch(bundle, /console\.warn\("RecordStoreRegistry\./)
  // 作者遗留的调试输出：键码、config 与 manifest 对象、未定义的配置值。
  assert.doesNotMatch(bundle, /console\.log\(keyCode\);/)
  assert.doesNotMatch(bundle, /console\.log\(config\)/)
  assert.doesNotMatch(bundle, /console\.log\(MIDP\.manifest\)/)
  assert.doesNotMatch(bundle, /config\.gamepadSize "\+config\.gamepadSize/)
  assert.doesNotMatch(engine, /console\.log\('createException'/)

  // 脚本自身必须幂等：第二次运行应当全部报告 ok 并以 0 退出。
  const output = execFileSync(process.execPath, [patchScript], { encoding: 'utf8' })
  assert.doesNotMatch(output, /FAILED/)
  const patchCount = (readFileSync(patchScript, 'utf8').match(/^ {4}label: '/gm) || []).length
  assert.equal((output.match(/^(ok|patched) /gm) || []).length, patchCount)
  // 高级界面（Form / List / Alert …）由 lcdui.js 画进运行时的 canvas，它必须紧跟
  // 运行时加载（覆盖那批空壳 native），所以这一行也是补丁的一部分而不是手改。
  assert.match(read('main.html'), /<script defer src="bld\/main-all\.js"><\/script>\n<script defer src="lcdui\.js"><\/script>/)
  // 云存档桥（RMS ⇄ 站点存档）同理：它要用运行时的 fs 与 loadingPromises。
  assert.match(read('main.html'), /<script defer src="lcdui\.js"><\/script>\n<script defer src="rms\.js"><\/script>/)
})

// 播放页的十字键发手机的导航键代码（-1..-4），面键与肩键发手机键盘代码（5 当确定、
// 1/3/7/9 当游戏键）。这份内部构建把 MIDP 动作表里的键盘那一半删掉了，只留下 WASD、
// 方向键与导航键代码 —— 结果「5 确定」和 1/3/7/9 在只看 getGameAction() /
// getKeyStates() 的游戏里完全没反应（《仙剑奇侠传》就是用 getGameAction()==FIRE
// 判断确定的，它自己在 keyPressed 里另外比了 -1..-4 与 50/52/54/56 两张代码表）。
// 这条用例把「播放页发的代码」和「运行时认的动作」锁在一起，任何一边改了都会在这里断。
test('播放页发的键码在运行时里带着正确的 MIDP 游戏动作', () => {
  const bundle = read('bld/main-all.js')
  const literal = (name) => {
    const match = bundle.match(new RegExp(`var ${name} = (\\{[^}]*\\});`))
    assert.ok(match, `runtime table ${name} must be readable`)
    return new Function(`return ${match[1]}`)()
  }
  const gameKeys = literal('gameKeys')
  const keyMap = literal('keyMap')
  const action = (code) => gameKeys[code] || gameKeys[String(code)] || 0

  // MIDP Canvas 的动作常数：UP 1、LEFT 2、RIGHT 5、DOWN 6、FIRE 8、GAME_A..D 9..12。
  const expected = { up: 1, down: 6, left: 2, right: 5, l2: 8, x: 9, a: 10, y: 11, b: 12 }
  for (const [button, wanted] of Object.entries(expected)) {
    const code = J2ME_BUTTON_KEYS[button]
    assert.equal(action(code), wanted, `${button} (code ${code}) must carry game action ${wanted}`)
    // 反过来问「这个动作是哪颗键」也要答出播放页发的那颗，游戏里
    // key == getKeyCode(UP) 这类写法才对得上。
    assert.equal(keyMap[wanted], code, `getKeyCode(${wanted}) must answer with the code the player sends`)
  }
  // 十字键是手机的导航键代码，肩键上的 5 仍然是手机键盘的数字键。
  assert.deepEqual(
    [J2ME_BUTTON_KEYS.up, J2ME_BUTTON_KEYS.down, J2ME_BUTTON_KEYS.left, J2ME_BUTTON_KEYS.right, J2ME_BUTTON_KEYS.l2],
    [-1, -2, -3, -4, 53],
  )
  // 键盘那一半（7/8/9/0 之外的数字键）仍然按 MIDP 要求认动作：将来换回数字键十字，
  // 或者游戏自己去查 getGameAction(50) 时不会落空。
  assert.equal(action(50), 1)
  assert.equal(action(56), 6)
  assert.equal(action(52), 2)
  assert.equal(action(54), 5)
  assert.equal(action(53), 8)
})

test('构建产物给 J2meJS 运行时打好内容版本号', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'j2me-stamp-'))
  try {
    const j2me = path.join(fixture, 'j2me')
    mkdirSync(path.join(j2me, 'bld'), { recursive: true })
    mkdirSync(path.join(j2me, 'java'), { recursive: true })
    copyFileSync(path.join(runtimeDir, 'main.html'), path.join(j2me, 'main.html'))
    writeFileSync(path.join(j2me, 'bld/main-all.js'), '// runtime bundle\n')
    // 类库不在 main.html 里（运行时自己按 enginemode 取），但启动前要下，所以
    // 也必须进启动清单。
    writeFileSync(path.join(j2me, 'java/classesold.jar'), 'PK\u0003\u0004fake class library\n')
    // 绝对地址与协议相对地址不该被改写。
    const html = readFileSync(path.join(j2me, 'main.html'), 'utf8')
      .replace('</head>', '<script src="https://cdn.example.com/other.js"></script>\n</head>')
    writeFileSync(path.join(j2me, 'main.html'), html)

    const stamp = path.join(repoRoot, 'frontend/scripts/stamp-j2me-runtime.mjs')
    execFileSync(process.execPath, [stamp, fixture], { encoding: 'utf8' })

    const version = JSON.parse(readFileSync(path.join(j2me, 'version.json'), 'utf8')).version
    assert.match(version, /^[0-9a-f]{12}$/)
    // 启动清单连同每个文件的体积一起写进清单：播放页的“核心”进度就是按这份
    // 清单登记与预取的（见 frontend/src/composables/player/j2meCore.js）。
    const boot = JSON.parse(readFileSync(path.join(j2me, 'version.json'), 'utf8')).boot
    const entry = (name) => boot.find((file) => file.name === name)
    assert.equal(entry('bld/main-all.js').size, Buffer.byteLength('// runtime bundle\n'))
    assert.ok(entry('main.html').size > 0)
    assert.equal(entry('java/classesold.jar').size, Buffer.byteLength('PK\u0003\u0004fake class library\n'))
    // fixture 里没有的文件（main.html 引用了运行时的一整套资源）不带体积，
    // 而不是编一个假的分母。
    assert.deepEqual(entry('libs/encoding.js'), { name: 'libs/encoding.js', size: null })
    const stamped = readFileSync(path.join(j2me, 'main.html'), 'utf8')
    assert.match(stamped, new RegExp(`src="bld/main-all\\.js\\?v=${version}"`))
    assert.match(stamped, new RegExp(`href="style/main\\.css\\?v=${version}"`))
    assert.match(stamped, /src="https:\/\/cdn\.example\.com\/other\.js"/)
    assert.doesNotMatch(stamped, /other\.js\?v=/)

    // 同样的内容重复打版本号结果不变，改一个字节就必须换版本号。
    execFileSync(process.execPath, [stamp, fixture], { encoding: 'utf8' })
    assert.equal(JSON.parse(readFileSync(path.join(j2me, 'version.json'), 'utf8')).version, version)
    writeFileSync(path.join(j2me, 'bld/main-all.js'), '// runtime bundle changed\n')
    execFileSync(process.execPath, [stamp, fixture], { encoding: 'utf8' })
    assert.notEqual(JSON.parse(readFileSync(path.join(j2me, 'version.json'), 'utf8')).version, version)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('播放页在打开 iframe 之前按同一批版本号地址预取运行时', () => {
  const adapter = readFileSync(path.join(repoRoot, 'frontend/src/composables/player/j2meRuntime.js'), 'utf8')
  const core = readFileSync(path.join(repoRoot, 'frontend/src/composables/player/j2meCore.js'), 'utf8')
  // 版本号必须绕过 HTTP 缓存读取，否则新页面仍会配上旧脚本。
  assert.match(core, /fetch\(MANIFEST_URL, \{ cache: 'no-store' \}\)/)
  // 预取用的地址与 iframe 打开的页面是同一批：都带 ?v=<version>，iframe 才能
  // 直接读缓存而不是把这几兆再下一遍。
  assert.match(core, /return version \? `\$\{url\}\?v=\$\{encodeURIComponent\(version\)\}` : url/)
  assert.match(adapter, /if \(version\) url\.searchParams\.set\('v', version\)/)
  assert.match(adapter, /const manifest = await warmJ2meRuntime\(\{ progress, engine, signal/)
})

test('J2meJS 运行时页面允许同源内嵌，其余响应仍然禁止被内嵌', async () => {
  const { securityHeaders } = await import('../server/middleware/security.js')
  const collect = async (url) => {
    const headers = {}
    const context = {
      req: { url, header: () => null },
      header: (name, value) => { headers[name] = value },
    }
    await securityHeaders()(context, async () => {})
    return headers
  }
  const runtime = await collect('https://example.com/j2me/main.html')
  assert.equal(runtime['X-Frame-Options'], 'SAMEORIGIN')
  assert.match(runtime['Content-Security-Policy'], /frame-ancestors 'self'/)

  const page = await collect('https://example.com/play/1')
  assert.equal(page['X-Frame-Options'], 'DENY')
  assert.match(page['Content-Security-Policy'], /frame-ancestors 'none'/)
})

test('开发期脚本与文档放在 public/ 之外，构建产物里也不该再出现', () => {
  // 2026-10 审计 H-3：这两个文件曾经躺在 frontend/public/j2me/ 下，被 vite 原样
  // 复制到 dist 并被访客直接下载（/j2me/apply-site-patches.mjs 返回 200）。
  for (const name of ['apply-j2me-patches.mjs', 'j2me-integration.md']) {
    assert.ok(existsSync(path.join(scriptsDir, name)), `${name} 应该在 frontend/scripts/ 下`)
    assert.ok(!existsSync(path.join(runtimeDir, name)), `${name} 不该出现在 frontend/public/ 里`)
  }

  // 构建链里要有清理步骤：以后再有开发期文件被误放进 public/，也不会随 dist 上线。
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8'))
  assert.match(pkg.scripts.build, /prune-dist-devfiles\.js/)
})
