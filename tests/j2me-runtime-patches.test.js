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
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
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
  // fastInterpreterFrameAdapter 的 catch 与上一条同源：展开到嵌套标记（另一个
  // ExitInterpreter / Native）的 Java 异常只是被交还给 JS 这一侧的调用者，不是没人接，
  // 上游却把它连同 JS 错误一起吞掉、返回 0 假装调用成功 —— 外层解释器里的 catch 处理器
  // 再也收不到它。「冒险小子」的 logo 循环就是这么停不下来的：缺一张图片抛出的
  // IOException 被吞掉后拿到 null 继续装下一张，四个全试完，最后画那张空图时空指针
  // 杀掉线程，游戏停在商标画面上。带 classInfo 的必须照原样往上传。
  assert.match(engine, /\/\/ Site patch \(nested interpreter exceptions\):/)
  assert.match(engine, /catch\(err\)\{\n                \/\/ Site patch \(nested interpreter exceptions\):[\s\S]*?if \(err && err\.classInfo\) \{\n                    throw err;\n                \}\n                console\.log\('interpret error:',err\);\n                return v;\n            \}/)
  // 解释器必须周期性让出执行权：fork 关掉了编译方法的抢占检查，解释器里原本一次检查
  // 也没有，于是一个不阻塞的 Java 线程就能把 JS 事件循环占死 —— 别的线程在异步
  // native（System.gc、图片解码）里等的 setTimeout / Promise 因此永远不执行，那个
  // 线程再也不会被唤醒，整页无响应。「功夫西游 - 乱舞唐僧」就是这样白屏的。
  assert.match(engine, /\/\/ Site patch \(interpreter preemption\):/)
  assert.match(engine, /if \(\(\+\+PS & 1023\) === 0\) \{\n                PE\(\);\n                if \(U\) \{\n                    thread\.set\(fp, sp, opPC\);\n                    return;\n                \}\n            \}/)
  // 一个执行窗口 = 半个 60Hz 的帧（8ms），不是上游的 80ms。播放页显示的是从运行时页面
  // 镜像过来的画布，镜像、触摸手柄与按钮都在同一条主线程上：窗口的长度就是「整页每秒能
  // 画几次」的上界，而一次窗口边界还要等当前那段 Java 执行返回并排上下一个任务，实际
  // 节奏约是窗口的 1.3 倍。80ms 于是留给整页每秒约 13 次执行机会（实测 12000ms 里
  // 11826ms 在跑虚拟机任务，被切成 159 段约 72ms 的长任务），连页面里一个独立的
  // requestAnimationFrame 循环都只能跑到 13.6 次/秒；16ms 也只到 50~53 次/秒。
  assert.match(engine, /\/\/ Site patch \(half-frame execution window\):/)
  assert.match(engine, /var MAX_WINDOW_EXECUTION_TIME = 8;/)
  assert.doesNotMatch(engine, /var MAX_WINDOW_EXECUTION_TIME = (16|80);/)
  // Thread.yield() 保持上游写法：试过「没有别的可运行线程时直接返回」的版本，它把
  // 恐龙快打每秒 29.4 万次的「展开 Java 栈 + 调度器重排 + 重入解释器」换成一次判断，
  // 解释器吞吐也涨了 3~4 倍，但画面一帧也没多 —— 这些 MIDlet 的等待循环
  // `while (现在 < 截止时刻) Thread.yield();` 会把省下来的 CPU 原样烧回空转里，
  // 帧率在 1/4/8 倍 CPU 降频下都与只改窗口时一致，而每次调用多出的那次
  // performance.now() 自己就占了 28% 的样本。见 j2me-integration.md。
  assert.match(engine, /Native\["java\/lang\/Thread\.yield\.\(\)V"\] = function \(addr\) \{\n        \$\.yield\("Thread\.yield"\);\n        \$\.nativeBailout\(9 \/\* Void \*\/\);\n    \};/)
  // drawRGB：宽或高为 0 的区域在真机上什么都不画。原来它照原样进 createImageData()，
  // 浏览器抛 IndexSizeError（DOMException，不是 TypeError），translateException 认不出，
  // 编译代码的 catch 于是把它当成「重新抛出的异常是 null」，抛出一个假的空指针打断整帧
  // 绘制；按 MIDP 规定 paint() 的异常被忽略，画面就永久停在上一帧（功夫西游剧情卡死）。
  assert.match(bundle, /\/\/ Site patch \(empty drawRGB\):/)
  assert.match(bundle, /if \(!\(width > 0\) \|\| !\(height > 0\)\) return;/)
  // 兜底：不认识的 JavaScript 异常不能原样返回，编译代码马上要读的 _address 会是
  // undefined，原始 name/message 全部丢失，只剩一句没头没尾的空指针。
  assert.match(engine, /\/\/ Site patch \(untranslatable JS errors\):/)
  assert.match(engine, /return \$\.newRuntimeException\(\(e\.name \? e\.name \+ ": " : ""\) \+ \(e\.message \? e\.message : String\(e\)\)\);/)
  // 圆弧：MIDP 的圆心在包围盒正中，扇形的顶点也在那儿，扫过方向按 MIDP 的角度约定。
  // 「蹦球传说」的主角球是用一串 fillArc 画的高光，圆心错到左上角后整颗球变成一坨
  // 红白怪块；负角度还要靠 anticlockwise 才不会绕反方向 270 度。
  assert.match(bundle, /\/\/ Site patch \(MIDP arc angles\):/)
  assert.match(bundle, /\/\/ Site patch \(arcs centred in the bounding box\):/)
  assert.match(bundle, /function siteArc\(startAngle, arcAngle\) \{/)
  assert.match(bundle, /anticlockwise: arcAngle > 0,/)
  assert.match(bundle, /function createEllipticalArc\(c, x, y, rw, rh, arcStart, arcEnd, closed, anticlockwise\) \{/)
  assert.match(bundle, /c\.arc\(0, 0, rw, arcStart, arcEnd, !!anticlockwise\);/)
  assert.match(bundle, /createEllipticalArc\(c, x \+ width \/ 2, y \+ height \/ 2, width \/ 2, height \/ 2, arc\.startRad, arc\.endRad, false, arc\.anticlockwise\);\n    c\.stroke\(\);/)
  assert.match(bundle, /c\.moveTo\(cx, cy\);\n    createEllipticalArc\(c, cx, cy, width \/ 2, height \/ 2, arc\.startRad, arc\.endRad, false, arc\.anticlockwise\);\n    c\.closePath\(\);\n    c\.fill\(\);/)
  // 圆的四角仍然是按圆心调用的（这条补丁不能把 createRoundRect 一起改坏）。
  assert.equal(
    (bundle.match(/createEllipticalArc\(c, x \+ width - rw, y \+ rh, rw, rh, 1\.5 \* Math\.PI, 2 \* Math\.PI, false\);/g) || []).length,
    1,
  )
  // 左上角当圆心的老写法必须彻底消失：它会把每一片弧都向左上挪半个包围盒。
  assert.doesNotMatch(bundle, /createEllipticalArc\(c, x, y, width \/ 2, height \/ 2, startRad, endRad/)
  assert.doesNotMatch(bundle, /var endRad = -startAngle \* \.0175;\n    var startRad = endRad - arcAngle \* \.0175;/)
  // 裁剪区落在画布之外时必须保持为空。这四条边上原来各有一个 `& 32767`，它对非负值
  // 是恒等运算、对负值却是 `v & 32767 = 32768 + v` —— 一块完全落在画面外（右/下边界
  // 为负）的裁剪区因此变成一个宽三万多像素的裁剪区，比画布还大。游戏「先按精灵矩形
  // 设裁剪区、再把整张精灵表贴上去」的画法全靠这个裁剪区，「恐龙快打」倒地/被打飞的
  // 敌人与主角贴图移出画面左边时，画面上就多出一条横贯的精灵表碎片。
  assert.match(bundle, /\/\/ Site patch \(clip outside the target\):/)
  assert.match(bundle, /newX1 = Math\.min\(Math\.max\(minX, newX1\), maxX\);/)
  assert.match(bundle, /newX2 = Math\.min\(Math\.max\(minX, newX2\), maxX\);/)
  assert.doesNotMatch(bundle, /Math\.max\(minX, newX1\) & 32767;/)
  assert.doesNotMatch(bundle, /Math\.min\(maxX, newX2\) & 32767;/)
  // Nokia 的 DirectGraphics.drawImage 带着 manipulation（旋转/翻转）参数。丢掉它之后
  // 需要镜像的精灵会被当成原图贴到「镜像后该在的位置」上 —— 游戏是先设裁剪区、再把
  // 整张图按变换贴上去的，落进裁剪区的就成了同一张精灵表里另一块内容：「恐龙快打」的
  // 主角朝右时散成一堆错位的部件、朝左（manipulation=0）完全正常。
  assert.match(bundle, /\/\/ Site patch \(Nokia image manipulation\):/)
  assert.match(bundle, /function siteManipulationToTransform\(manipulation\) \{/)
  assert.match(
    bundle,
    /var siteNokiaManipulation = \[\n    \[TRANS_NONE, TRANS_ROT270, TRANS_ROT180, TRANS_ROT90\],\n    \[TRANS_MIRROR, TRANS_MIRROR_ROT90, TRANS_MIRROR_ROT180, TRANS_MIRROR_ROT270\],\n    \[TRANS_MIRROR_ROT180, TRANS_MIRROR_ROT270, TRANS_MIRROR, TRANS_MIRROR_ROT90\],\n    \[TRANS_ROT180, TRANS_ROT90, TRANS_NONE, TRANS_ROT270\],\n  \];/,
  )
  assert.match(bundle, /renderRegion\(c, NativeMap\.get\(image\.imageData\)\.context\.canvas, 0, 0, imageData\.width, imageData\.height, siteManipulationToTransform\(manipulation\), x, y, anchor\);/)
  // 老写法（参数名 unknow、丢掉 manipulation、一律 TRANS_NONE）必须彻底消失。
  // Graphics.drawImage(img, x, y, anchor) 那条本来就没有变换，不在检查范围内。
  assert.doesNotMatch(bundle, /anchor,unknow/)
  // 折算表必须写在 `var TRANS_*` 之后：写成它们前面时，字面量读到的是尚未赋值的 var
  // （全是 undefined），每次折算都返回 undefined，renderRegion 拿不认识的变换算出
  // NaN 目标坐标 —— 画面上就是朝右的精灵整块消失。这一条就是那次事故的守卫。
  const transAt = bundle.indexOf('var TRANS_MIRROR_ROT90 = 7;')
  const tableAt = bundle.indexOf('var siteNokiaManipulation = [')
  assert.ok(transAt >= 0, 'TRANS_* 常量必须还在产物里')
  assert.ok(tableAt > transAt, '折算表必须定义在 TRANS_* 之后，否则表里全是 undefined')
  // 有些 MIDlet 把「UTF-8」拼成「UFT-8」，CLDC 的 Helper 于是去要
  // com/sun/cldc/i18n/j2me/UFT_8_Reader —— 三个类库里都只有拼写正确的 UTF_8_Reader，
  // Class.forName 抛 ClassNotFoundException，没人接住它的线程就此结束（「昆仑千年情」
  // 启动到一半卡在载入画面）。类加载的最后一跳要按同名的 UTF_* 回退。
  assert.match(engine, /\/\/ Site patch \(misspelled encoding class\):/)
  assert.match(engine, /if \(!bytes && fileName\.indexOf\("com\/sun\/cldc\/i18n\/j2me\/UFT_"\) === 0\) \{\n                bytes = JARStore\.loadFile\(fileName\.replace\("UFT_", "UTF_"\)\);\n            \}/)

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
  // 内联事件处理器在这条 CSP 下不会执行：script-src 是 'self' blob: 'unsafe-eval'
  // 'wasm-unsafe-eval'，没有 'unsafe-inline'，而 hash 与 nonce 都授权不了 `on*=`
  // 这种属性 —— 浏览器拒绝运行它，并在每次派发时往控制台写一条
  // "Executing inline event handler violates ..."。上游触摸板上的
  // `onselectstart='return false'` 就是这条报错的来源（见 bridge.js 里挂回的
  // 监听器），页面里不能再有任何一个内联处理器。
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i)
  assert.match(read('bridge.js'), /siteGamepad\.addEventListener\('selectstart'/)
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

// Nokia 的 DirectGraphics.drawImage(img, x, y, anchor, manipulation) 里，
// manipulation 是「第 13 位 = 左右翻转（FLIP_HORIZONTAL 8192）、第 14 位 = 上下翻转
// （FLIP_VERTICAL 16384），低位 = 逆时针旋转的度数（90/180/270）」的叠加。折算成
// MIDP 的 TRANS_* 码之后由 renderRegion 绘制，所以这张表就是「Nokia 的组合 ↔ MIDP
// 的变换」的全部依据。
//
// 每一项都用同一条规则核对过：Nokia 先按给定角度**逆时针**旋转、再在旋转后的坐标系里
// 翻转（等价于 MIDP 的「先镜像、再顺时针旋转」）。这也是「恐龙快打」自己算出的目标
// 坐标所要求的 —— 游戏先设裁剪区、再整图贴上去，源区域必须正好落进裁剪区，只有这张表
// 能让它成立（8192 → TRANS_MIRROR、8192|90 → TRANS_MIRROR_ROT90、
// 8192|270 → TRANS_MIRROR_ROT270、90 → TRANS_ROT270 都由这个 ROM 直接验证过）。
test('Nokia 的 manipulation 折算成 MIDP 变换码', () => {
  const bundle = read('bld/main-all.js')
  // 关键：按产物里的**真实顺序**求值 —— 从 `var TRANS_NONE = 0;` 一直切到折算函数结束。
  // 折算表曾经写在 TRANS_* 之前，那时字面量读到的全是尚未赋值的 var（undefined），
  // 这个测试（把常量当参数注入的版本）当时是绿的，游戏里朝右的精灵却整块消失。
  const fromConstants = bundle.indexOf('var TRANS_NONE = 0;')
  const fromFunction = bundle.indexOf('function siteManipulationToTransform(manipulation) {')
  assert.ok(fromConstants >= 0, 'TRANS_* 常量必须能在产物里读到')
  assert.ok(fromFunction > fromConstants, '折算表必须定义在 TRANS_* 之后')
  const functionEnd = bundle.indexOf('\n  }', bundle.indexOf('return siteNokiaManipulation[flip][rotation / 90];', fromFunction)) + 4
  assert.ok(functionEnd > fromFunction && functionEnd <= bundle.length, '折算函数的结尾必须能找到')
  const source = bundle.slice(fromConstants, functionEnd)
  const $ = { newIllegalArgumentException: (message) => new Error(message) }
  const toTransform = new Function('$', `${source}\nreturn siteManipulationToTransform;`)($)
  // 与产物里的常量同值（MIDP 的变换码）。
  const NONE = 0, MIRROR_ROT180 = 1, MIRROR = 2, ROT180 = 3, MIRROR_ROT270 = 4, ROT90 = 5, ROT270 = 6, MIRROR_ROT90 = 7
  assert.deepEqual(
    [toTransform(0), toTransform(8192), toTransform(16384), toTransform(24576)],
    [NONE, MIRROR, MIRROR_ROT180, ROT180],
    '表里不能有 undefined：TRANS_* 常量那时必须已经有值（否则 renderRegion 会算出 NaN 坐标，什么也不画）',
  )

  assert.equal(toTransform(0), NONE)
  // 恐龙快打实际用到的组合。
  assert.equal(toTransform(8192), MIRROR)
  assert.equal(toTransform(16384), MIRROR_ROT180)
  assert.equal(toTransform(90), ROT270)
  assert.equal(toTransform(180), ROT180)
  assert.equal(toTransform(8192 | 90), MIRROR_ROT90)
  assert.equal(toTransform(8192 | 270), MIRROR_ROT270)
  // 其余组合：先逆时针旋转、再在旋转后的坐标系里翻转。
  assert.equal(toTransform(270), ROT90)
  assert.equal(toTransform(8192 | 16384), ROT180)
  assert.equal(toTransform(16384 | 90), MIRROR_ROT270)
  assert.equal(toTransform(16384 | 180), MIRROR)
  assert.equal(toTransform(16384 | 270), MIRROR_ROT90)
  assert.equal(toTransform(8192 | 16384 | 90), ROT90)
  assert.equal(toTransform(8192 | 16384 | 180), NONE)
  assert.equal(toTransform(8192 | 16384 | 270), ROT270)
  // 拆不出来的取值按真机抛 IllegalArgumentException，而不是悄悄画成原图。
  assert.throws(() => toTransform(45), /Unsupported manipulation: 45/)
  assert.throws(() => toTransform(360), /Unsupported manipulation: 360/)
  assert.throws(() => toTransform(32768), /Unsupported manipulation: 32768/)
})

// MIDP 规定 setClip() 设的裁剪区不超过 Graphics 的范围（画布或离屏图），所以把裁剪区
// 设到画布之外等于「什么都不画」。上游那份实现的四条边各套了一个 `& 32767`，而它对
// 负值不是恒等运算（`v & 32767 = 32768 + v`）：一块完全落在画面外、右/下边界为负的
// 裁剪区会变成一个宽三万多像素的裁剪区 —— 裁剪不但没生效，还比画布大得多。游戏用
// 「先 setClip 到精灵矩形、再把整张精灵表贴上去」画精灵（见补丁 25 与本文档），
// 裁剪一失效，落进画面的就是精灵表里另一段内容：「恐龙快打」里被打倒、移出画面左边
// 的敌人与主角，会在画面左端多出一条与精灵同高的精灵表碎片，看上去像贴图错乱。
//
// 这一条按产物里的**真实代码**求值 setClip（不是把常量当参数注入），逐点核对边界：
// 完全在画布外的矩形必须变空、部分越界的矩形必须被裁到画布边、画布内的矩形原样保留。
test('裁剪区落在画布之外时保持为空', () => {
  const bundle = read('bld/main-all.js')
  const fromFunction = bundle.indexOf('GraphicsInfo.prototype.setClip = function(x, y, width, height, minX, minY, maxX, maxY) {')
  assert.ok(fromFunction >= 0, 'setClip 必须能在产物里读到')
  const endMarker = bundle.indexOf('\n    this.clipY2 = newY2;\n  };', fromFunction)
  assert.ok(endMarker > fromFunction, 'setClip 的结尾必须能找到')
  const source = bundle.slice(fromFunction, endMarker + '\n    this.clipY2 = newY2;\n  };'.length)
  const GraphicsInfo = function () {}
  const setClip = new Function('GraphicsInfo', `${source}\nreturn GraphicsInfo.prototype.setClip;`)(GraphicsInfo)
  const WIDTH = 240
  const HEIGHT = 320
  // 目标 240x320（恐龙快打自己的画布），未做过 translate。
  const clipAfter = (x, y, width, height) => {
    const info = {
      transX: 0,
      transY: 0,
      clipX1: 0,
      clipY1: 0,
      clipX2: WIDTH,
      clipY2: HEIGHT,
      contextInfo: { currentlyAppliedGraphicsInfo: null },
    }
    setClip.call(info, x, y, width, height, 0, 0, WIDTH, HEIGHT)
    return [info.clipX1, info.clipY1, info.clipX2, info.clipY2]
  }
  // 画布内的矩形原样保留。
  assert.deepEqual(clipAfter(10, 20, 30, 40), [10, 20, 40, 60])
  // 部分越界：裁到画布边。
  assert.deepEqual(clipAfter(-20, 10, 30, 5), [0, 10, 10, 15])
  assert.deepEqual(clipAfter(230, 10, 40, 5), [230, 10, 240, 15])
  assert.deepEqual(clipAfter(10, -30, 20, 40), [10, 0, 30, 10])
  assert.deepEqual(clipAfter(10, 315, 20, 40), [10, 315, 30, 320])
  // 完全在画布之外：必须是空裁剪区（四个 0），不能变成巨大的裁剪区。
  for (const [x, y, width, height] of [
    [-63, 152, 40, 4], [-94, 152, 40, 4], [-63, -30, 40, 4], [260, 152, 40, 4], [10, 340, 40, 4],
    [40000, 10, 20, 5], [-40000, 10, 20, 5], [-63, 152, 0, 4], [-63, 152, 40, 0],
  ]) {
    assert.deepEqual(clipAfter(x, y, width, height), [0, 0, 0, 0], `setClip(${x},${y},${width},${height}) 必须为空裁剪区`)
  }
  // 无论请求的矩形在哪，得到的裁剪区都在画布之内 —— 真机不可能画出画布外的像素，
  // 而这份实现的裁剪区正是「画布 ∩ 请求」。
  for (const [x, y, width, height] of [
    [10, 20, 30, 40], [-20, 10, 30, 5], [230, 10, 40, 5], [-63, 152, 40, 4], [260, 152, 40, 4],
  ]) {
    const rect = clipAfter(x, y, width, height)
    assert.ok(rect[0] >= 0 && rect[1] >= 0 && rect[2] <= WIDTH && rect[3] <= HEIGHT,
      `setClip(${x},${y},${width},${height}) 的裁剪区必须落在画布内，实际 ${JSON.stringify(rect)}`)
    assert.ok(rect[2] <= rect[0] || rect[3] <= rect[1] || (rect[2] - rect[0] <= WIDTH && rect[3] - rect[1] <= HEIGHT))
  }
})

test('Samsung 音频探针答 true，而且这条替换能作用到 MIDlet 自己字节码里的调用', () => {
  // 三星时代的 MIDlet（「冒险小子」）先问 com.samsung.util.AudioClip.isSupported()，拿到
  // true 才分配自己那张关卡常量表（ABGame.x() 里的 `if (i) c = new int[7]`），而关卡音乐、
  // 关卡切换这些路径会不带条件地读它。内置类库那份 AudioClip 是完整的空实现，只有
  // isSupported() 写死返回 false，于是游戏在关卡里按一下确定键就读到一张从未分配的
  // int[7]：空指针结束 MIDlet 线程、画面定在最后一帧。站点在 bridge.js 里用 fork 自己的
  // ReplaceMethod 表把它换成 true（真机上这个类由三星/国产手机的类库提供并答 true）。
  const bridge = read('bridge.js')
  const shim = bridge.match(
    /ReplaceMethod\['com\/samsung\/util\/AudioClip\.isSupported\.\(\)Z'\] = (function \(\) \{\s*return 1;\s*\});/,
  )
  assert.ok(shim, 'bridge.js 必须把三星音频探针换成答 true')
  // 真的求值一次：这段 shim 返回 1（Java 的 boolean true）。
  assert.equal(new Function('return ' + shim[1])()(), 1)

  // 光有替换还不够：fork 的 ReplaceMethod 表只在 JS 调用进来时被查（getLinkedMethod /
  // findNativeMethodImplementation），MIDlet 自己字节码里的 invokestatic 会被解释器
  // 直接解释到底，替换从不生效。补丁 30 把作者留在 getMethodByName 里的注释代码打开，
  // 在方法解析时套一次替换（常量池缓存结果）。
  const engine = read('bld/j2me.js')
  assert.match(engine, /\/\/ Site patch \(method replacement\):/)
  assert.match(
    engine,
    /var replacement = ReplaceMethod && ReplaceMethod\[method\.implKey\];\n                    if \(replacement\) \{\n                        method\.fn = replacement;\n                        method\.state = 1 \/\* Compiled \*\/;\n                        J2ME\.linkedMethods\[method\.id\] = replacement;\n                        return method;\n                    \}/,
  )
  // 换掉的那段注释代码不能只剩注释：原来这条路径根本不存在（注释里的老代码还留着，
  // 所以这里只锁「生效的那一段」不含日志）。
  assert.doesNotMatch(
    engine,
    /\/\/ Site patch \(method replacement\):[\s\S]{0,600}?console\.log\(/,
  )
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
    // 许可证与出处说明是纯文档，进目录、但不进版本指纹（改它不该让访客重下运行时）。
    writeFileSync(path.join(j2me, 'LICENSE'), 'GNU GENERAL PUBLIC LICENSE\n')
    writeFileSync(path.join(j2me, 'LICENSE-README.md'), '# License\n')
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
    // 纯文档改动不换版本号：否则改一句许可证说明就要所有访客重下 4.4 MB 运行时。
    writeFileSync(path.join(j2me, 'LICENSE-README.md'), '# License\n\n改了一行说明\n')
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

test('构建产物里的运行时副本与打过补丁的那份一致', () => {
  // 线上跑的不是 public/ 里的源码，而是 dist 里的副本：改完运行时不重新构建，
  // 访客手里仍是旧脚本，「已经修好」的补丁一行都没上线（2026-10-16：「冒险小子」
  // 按确定键的空指针在源码里修了两轮，线上照旧卡死，因为 dist 是修之前构建的）。
  // dist 是构建产物、不进版本库，所以只在它存在时校验。
  const distDir = path.join(repoRoot, 'frontend/dist/j2me')
  if (!existsSync(distDir)) return

  // main.html 会被打上 ?v=<版本号>（见 stamp-j2me-runtime.mjs），比较前先抹掉。
  const stripVersion = (text) => text.replace(/[?&]v=[0-9a-f]{12}/g, '')
  const relativeFiles = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory()
      ? relativeFiles(path.join(dir, entry.name), relative)
      : [relative]
  })

  const stale = []
  for (const name of relativeFiles(runtimeDir)) {
    const deployed = path.join(distDir, name)
    if (!existsSync(deployed)) { stale.push(`${name}（构建产物里没有）`); continue }
    const source = name === 'main.html'
      ? stripVersion(readFileSync(path.join(runtimeDir, name), 'utf8')) === stripVersion(readFileSync(deployed, 'utf8'))
      : readFileSync(path.join(runtimeDir, name)).equals(readFileSync(deployed))
    if (!source) stale.push(name)
  }
  assert.deepEqual(
    stale,
    [],
    `构建产物里的运行时与 frontend/public/j2me 不一致：${stale.join('、')} —— 跑一次 npm run build 再发布`,
  )
})
