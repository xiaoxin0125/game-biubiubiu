# J2ME 运行时集成（J2meJS）

## 这里跑的是什么

`.jar` 格式的 ROM 由 **J2meJS** 运行（上游
[`Rosabis/J2meJS`](https://github.com/Rosabis/J2meJS)，锁定在 `main` 分支的
commit `75947c1`，是 Mozilla j2me.js 的一个 fork），复制到
`frontend/public/j2me/` 后由本站自身提供服务。这里既没有 libretro 核心也没有
BIOS：运行时从 `frontend/public/j2me/java/` 加载它自带的 Java 类库。

刷新这份内置副本意味着要重新跑一遍 `apply-j2me-patches.mjs`（见下）；对应源码
按 GPL-2.0 的要求保留在上游。

许可证：**GPL-2.0**（`frontend/public/j2me/LICENSE`，上游 README 保留为
`LICENSE-README.md`）。`style/emoji/` 下的表情图形是 CC-BY-4.0，只受该许可证
覆盖。页脚与 README 都标注了运行时的名称与许可证。

## 为什么不用 SquirrelJME 的 libretro 核心

2026-10-14 实测：这个 libretro 核心能加载、能启动，但它的内容加载在上游尚未实现。
在 `nanocoat/frontend/libretro/boot.c` 里，每一条加载路径最后都落到
`sjme_nvm_defaultBootSuiteInDirectory()`，而其中的文件查找
`sjme_nvm_defaultBootSuiteAttempt()` 是一个被停用的 `sjme_todo("Impl?")` 桩函数，
`sjme_nvm_parseCommandLine()` 对 `-jar` 也是同样处理。因此 `retro_load_game()`
对任何输入都返回 false：真实 MIDlet 的 JAR 与核心自带的类库归档都会以
`[Content] Failed to load content` 失败，即便把 `squirreljme-0.3.0-fast.jar`
按它 `.info` 要求的准确文件名放进系统目录也一样。预编译的核心与类库已从
`data/cores` 与 `data/bios/j2me` 移除，核心发布包也重新构建过、不再包含它们。

## 对内置运行时的站点补丁

`apply-j2me-patches.mjs`（与本文件同目录，位于 `frontend/scripts/`）会重新应用
每一个补丁，且可重复执行，所以刷新内置副本之后跑一次即可：

```bash
node frontend/scripts/apply-j2me-patches.mjs
```

它不在 `frontend/public/` 里：`public/` 中的任何文件都会被 vite 复制到
`frontend/dist` 当成静态资源对外提供，而这个脚本与本文档属于开发期资料，
不该被访客下载（2026-10 安全审计 H-3）。

打包时还丢掉了上游副本里、本集成从不加载的文件：独立页面及其游戏列表
（`index.html`、`index2.html`、`indexbatch.html`、`gamelist.js`、`gc.html`、
`gc.js`、`benchmark.js`、`timer.js`、`jar/`、`certs/`、`kaios/` 构建产物）以及
`img/` —— 那个游戏列表用的 37 张封面，这里没有任何地方引用。`main.html` 与它
拉取的脚本就是运行时的全部；所以刷新副本时需要做同样的裁剪，否则那些多余文件
会被白白对外提供（也会被打进发布包）。

1. `bld/main-all.js` —— 它的启动列表用 `":"` 切分 `config.jars`，这会把 `blob:`
   URL 切坏。打过补丁的那一行在 `window.__j2meJars` 有值时优先用它。
2. `bld/main-all.js` —— `window.onload` 绝不能被编译方法缓存拦住（见下面移动端
   一节）：`clear()` 的结果被套上两秒的竞态与一个 `catch`，无论哪种情况
   VM 都会启动。
3. `bld/main-all.js` —— 类库按页面的 `?v=` 版本号请求，这样缓存了上一版运行时的
   浏览器不会把它和新页面配成一对。
4. `bld/main-all.js` —— 按键码带上对应的 MIDP 游戏动作：`getGameAction` 补上
   2/4/6/8 → UP/LEFT/RIGHT/DOWN、5 → FIRE 与 1/3/7/9 → GAME_A..GAME_D（导航键码
   本来就在表里），`getKeyCode` 则按本播放器实际发送的键码作答（两者见「适配层」）。
5. `bld/main-all.js` —— `keyNames` 学会导航键与软键的名字，否则它们在
   `getKeyName()` 里会掉进 `String.fromCharCode(-1)`。
6. `bld/j2me.js` —— 可选的编译方法缓存被关掉。JIT 方法每局重新生成，而不是从
   桌面浏览器的 IndexedDB 里恢复 —— 那里存着旧版运行时生成的方法，会让启动卡住。
7. `libs/compiled-method-cache.js` —— `restore()`/`clear()` 改为在
   `openDatabase` resolve 之后才读 `database` 句柄（上游把 `new Promise(...)`
   直接交给了 `.then()`，而它的执行器在调用时就跑了）。
8. `main.html` —— 在配置脚本之后立刻加载 `preload.js`（把 `?jar=` 参数变成
   `window.__j2meJars`），在运行时脚本之后加载 `bridge.js`。
9. `bld/j2me.js` —— 对 null 接收者的虚调用或接口调用会由解释器抛出 Java 的
   `NullPointerException`，而不是从 null 的 `classInfo` 上读 `vTable`
   （见下面「控制台输出」）。
10. `bld/j2me.js` —— 穿过解释器的 Java 异常记到 debug 通道；只有一路展开、
    穿过所有帧都没找到处理器的异常才报成 error。
11. `bld/j2me.js` —— fork 里那行 `createException`（每创建一个异常打一行）被去掉。
12. `bld/main-all.js` —— fork 的各种值转储被去掉：每个按键码、`config` 与
    manifest 对象，以及永远为 undefined 的 `config.gamepadSize`。
13. `bld/main-all.js` —— 在这个运行时里本来就是空操作的 MIDP 内部实现，不再
    每次调用都告警。
14. `main.html` —— 在运行时脚本之后立刻加载 `lcdui.js`（见下面「MIDP 高级界面」）。
15. `bld/j2me.js` —— 已经展开完所有帧的异常直接离开解释器，而不是被吞掉后重跑
    （见下面「异常墙」）。
16. `bld/j2me.js` —— 让某个线程死掉的 Java 异常，报出它的类名与消息。
17. `bld/main-all.js` —— RMS 监听器注册表（为其它 MIDlet 做的 AMS 记账，在这里
    是空操作）不再每次开关记录存储都告警。
18. `main.html` —— 在运行时脚本之后加载 `rms.js`（见下面「Java 存档（RMS）上云」）。
19. `bld/main-all.js` —— `microedition.locale` 把浏览器的各种中文写法
    （zh-Hans-CN、zh-SG、zh-Hant-TW …）折算成 MIDlet 携带的设备语言名
    （`zh-CN` / `zh-HK`）；播放页可以用自己的 `language` 参数覆盖它。
20. `bld/j2me.js` —— 解释器在运行期间按周期让出执行权，于是一个忙碌的 Java
    线程无法饿死 JavaScript 事件循环（见下面「一个忙碌的 Java 线程饿死事件循环」）。
21. `bld/j2me.js` —— 把 `UTF-8` 拼成 `UFT-8` 的 MIDlet 依然能找到它的
    reader 类：这个请求会回退到拼写正确的 `UTF_*` 类（见下面「拼错的编码类名」）。
22. `bld/main-all.js` —— `Graphics.drawRGB` 遇到空区域（宽或高为零）直接返回，
    而不是交给 `createImageData` —— 后者抛出的 `IndexSizeError` 曾让整次 paint
    中断、画面冻结（见下面「空区域的 drawRGB 冻结画面」）。
23. `bld/j2me.js` —— 既不是 `TypeError`、也不是 fork 的 `JavaRuntimeException`
    的 JavaScript 错误，会变成携带其名字与消息的 Java 异常，而不是以一个没有
    `_address` 的对象身份进入编译代码。
24. `bld/main-all.js` —— `Graphics.drawArc` / `fillArc` 按 MIDP 画弧：椭圆在包围盒
    正中（而不是左上角），扇形从圆心张开，扫过的方向也按 MIDP 的角度约定
    （见下面「圆弧画在包围盒的左上角」）。
25. `bld/main-all.js` —— Nokia 的 `DirectGraphics.drawImage` 认它的 `manipulation`
    参数（旋转与翻转），不再一律按 `TRANS_NONE` 画（见下面「朝右的精灵散成一堆部件」）。
26. `main.html` —— 内置触摸板上的内联事件处理器被删掉。这条 CSP 没有
    `'unsafe-inline'`，浏览器会拒绝执行内联处理器、每次在这块板上拉起选区都往
    控制台写一条 `Executing inline event handler violates …`；同样的行为由
    `bridge.js` 用 `addEventListener` 挂回去（见下面「控制台输出」）。
27. `bld/j2me.js` —— 展开到嵌套解释器运行的 Java 异常（解释器每个被编译方法或原生
    方法调进来的入口都会压一个 `ExitInterpreter` 标记）继续交给上面的调用者，而不是
    被吞掉后当成一次正常返回（见下面「嵌套运行里被吞掉的异常」）。
28. `bld/j2me.js` —— 一次执行窗口是半个 60Hz 的帧（8ms），不再是上游的 80ms。
    播放页显示的是从运行时页面镜像过来的画布，镜像、触摸手柄与按钮都在同一条主
    线程上，80ms 的窗口让整页每秒只拿得到约 13 次执行机会、16ms 也只到 50~53 次
    （见下面「整页每秒只有 13 次执行机会」）。
29. `bld/main-all.js` —— 完全落在画布外（边界为负）的裁剪区不再被 `& 32767` 折算成
    一个巨大的裁剪区：先按精灵矩形设裁剪区、再把整张精灵表贴上去的画法因此重新受到
    裁剪（恐龙快打被击倒的角色曾画成一条横贯画面的精灵表碎片）。
30. `bld/j2me.js` —— fork 自己的 `ReplaceMethod` 表终于能作用到 MIDlet 从自己字节码里
    发出的调用（原来只有 JS 调用进来时才会查它）；`bridge.js` 就是靠它把三星的
    `com.samsung.util.AudioClip.isSupported()` 换成答 true（见下面「关卡里按确定键就
    卡死」）。
31. `bld/main-all.js` —— 自己解 IMA ADPCM（`WAVE_FORMAT_IMA_ADPCM`，格式标签 0x11）
    的 WAV：浏览器的 `decodeAudioData` 不认这种 4 bit 压缩格式，而 J2ME 游戏为了省
    空间大量使用它（见下面「J2ME 音效是 IMA ADPCM」）。
32. `bld/main-all.js` —— 被拒绝的音频解码不再拆掉整局游戏：`decodeAudioData` 的回调
    形式仍然返回一个被拒绝的 Promise，`bridge.js` 会把它当成未捕获错误上报、播放器
    随即调用 `fail()` 拆掉 iframe；改用 Promise 形式并显式处理失败，解不了的音效只
    安静地不出声。
33. `bld/main-all.js` —— `Class.forName` 对运行时/JAR 里不存在的类抛出真正的
    `java.lang.ClassNotFoundException`（空名字抛 `NullPointerException`）。原来类
    加载器的标记被吞掉、native 正常返回，反模拟器探针全都像「找到了」（见下面
    「反模拟器检测」）。
34. `java/classesold.jar` —— 默认类库里 `java/lang/Class.forName` 对字面量
    `"XMessage"` 的硬编码短路（直接返回 null，根本不进 native）被改成等长的非法
    类名，让补丁 33 能接管。
35. `java/classes.jar` —— 同补丁 34，作用于第三个引擎；`classes2.jar` 本来就没有
    这条短路，保持原样。

## 控制台输出

以前这个游戏基本无法用来诊断：`.jar` 播放会打出红色的
`TypeError: Cannot read properties of null (reading 'vTable')`，每个 Java 异常
之后跟着一行 `createException` 和一次对象转储，每次按键打一个光秃秃的键码，
每次加载打整个对象，还有八条来自「在这里本是空操作」的 MIDP 内部实现的
`not implemented` 告警。仙剑奇侠传两次启动打了 74 条消息，其中 2 条 error、
18 条 warning。

补丁 9 到 13 把它收敛成运行时自己的信息输出：44 条消息、**没有 error、没有
warning**，同一个游戏仍然在约 0.7–1.1 秒内启动、仍然响应输入。游戏自己抛出并
捕获的那两个异常仍留在 debug 通道上（devtools 控制台不开 verbose 日志时不显示
`debug`），所以排障时并没有丢信息。

用外置 ROM 探针可以复现 —— 它把 `Runtime.consoleAPICalled` 与
`Runtime.exceptionThrown` 记进 `runtime-log.json`：

```bash
J2ME_TEST_CHROME=/path/to/chrome node tests/j2me-real-game.mjs /path/game.jar /tmp/evidence
```

`bridge.js` 把未捕获的运行时错误转发给播放器，并暴露 `window.__j2mePlayer`
（按键按下/松开、VM canvas、启动状态、暂停）。暂停的实现是在暂停期间压住
`setTimeout` / `setInterval` / `requestAnimationFrame`，从而把 VM 冻结在原地 ——
运行时的调度、sleep 与画面 blit 都靠这几个定时器驱动。

页面必须叫 `main.html`：运行时靠 URL 里的这个名字决定自己工作在 "index" 还是
"player" 模式。

内联事件处理器在这个站点上没有生存空间：应用服务端给出的 `script-src` 是
`'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'`，既没有 `'unsafe-inline'`，也没有
`'unsafe-hashes'` —— 浏览器会拒绝执行 `on*=` 这类属性里的代码，并在每次要执行它时
往控制台写一条

```
Executing inline event handler violates the following Content Security Policy
directive 'script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval''. Either the
'unsafe-inline' keyword, a hash ('sha256-...'), or a nonce ('nonce-...') is required
to enable inline execution. ...
```

上游 `main.html` 的触摸板上原本写着 `onselectstart='return false'`（旁边那句
`οnselect='document.selection.empty()'` 的名字里 "o" 是希腊字母，从来就不是事件
处理器），于是在这块板上拉起选区时，浏览器一边拒绝执行、一边留下上面这条报错。
补丁 26 把属性删掉，行为改由 `bridge.js` 的
`addEventListener('selectstart', …preventDefault)` 承担。2026-10-16 用同一段 CSP
头 + 同一段标记在 Chromium 上复现过：属性躺在标记里不报错，报错发生在处理器第一次
被编译时（也就是事件真的派发到那个元素时），所以症状是「碰到那块板才刷一条」。

## MIDP 高级界面（lcdui.js）

以 `Form`、`List`、`TextBox` 或 `Alert` 开局的 MIDlet 以前什么都不显示：内置
运行时把高级 LCDUI 的原生实现做成了空壳（`addUnimplementedNative`，外加一个从
错误对象上读字段的、基于 DOM 的 `ChoiceGroupLFImpl`），而它确实构建出来的元素
活在运行时自己的页面里，播放器从不显示那个页面 —— 它只镜像 `#canvas`。于是从
这类界面启动的游戏过不了播放器的「画过没有」检查，在启动阶段以超时告终。

`lcdui.js` 在 `bld/main-all.js` 之后加载并替换那些原生实现，用运行时自带的字体
对象把这些界面以 4 px 内边距画进运行时的 canvas。它还补上了构建产物留给「原生
侧」的两件事：

- **软键**：`NativeMenu.updateCommands` 拿到 displayable 的 `Command`，把它们画
  成左右软键栏，并在按下时用 `MIDP.sendCommandEvent(id)` 派发（命令派发本身在
  Java 侧：`Display.handleCommandEvent` → `uCallCommandEvent`）。`-6`/`-7` ——
  也就是 `select`/`start` 已经发送的键码 —— 由一个 `MIDP.sendKeyPress` 包装
  转发给它。
- **`List` 导航**：这个 fork 没有 `ListLFImpl` —— `List` 只是一个含
  `ChoiceGroup` 的单条目 `Form`，而 Java 侧没人移动选中项
  （`DisplayableLFImpl.uCallKeyPressed` 是空的，`ChoiceGroupLFImpl` 也没有按键
  处理）。方向键的上下在这里移动高亮，开火键负责选中：应用设了就用 `List` 自己的
  `selectCommand`，否则用第一个非返回类命令。MIDlet 来问选中项时，Java 通过
  `getSelectedIndex0` 读回去。

尺寸也从这里作答，而尺寸决定整个布局：MIDP 的 `LayoutManager` 只在该条目的布局
带 `LAYOUT_EXPAND` 时拉伸它，所以 `List` 的行、`TextField` 与 `Gauge` 都要自己
报出可用宽度。有两个坑值得记住：尺寸类原生实现的**第一个**参数是条目的
**native id**（`getPreferredWidth0(int nativeId, int availableWidth)`）；而字体
的 `height`/`baseline` 挂在 Java 的 `Font` 对象上，不在 `NativeMap` 返回的 2D
上下文里 —— 少了这两样，每个条目都会塌成左上角一个 100×20 的方块。

文本输入是同一个问题的另一半。运行时的 `TextEditorProvider` 只服务过 Nokia 的
`TextEditor` API，它的元素待在隐藏页面里，高级 `TextField` 的原生实现则是桩
（`createNativeResource0` 只告警；`getString0` 拿一个只有 `prompt()` 能设置的
全局量作答）。现在播放器会在 canvas 之上打开一个真正的 `<input>`：5 / 确定 开始
编辑，5 或左软键提交，右软键取消，点这个输入框效果相同。值经
`__lcdui.setText` / `commitText` 回写，写进 Java 的 `DynamicCharacterArray`；
MIDlet 每次读这个字段，Java 都用 `getString0` 去取，所以不需要同步别的东西。
`ItemStateListener` 的通知没法从播放器的按键处理里发 —— 在那里发起的 Java 调用
没有 VM 上下文（`ctx` 为 null）—— 于是它先入队，等下一次 Java 回调进来时
（`getString0`、`setCurrentItem0`）再投递。

## 移动端：WebKit 启动失败（2026-10-14 修复）

J2ME 在桌面 Chromium 上能加载，在手机上却始终不行。iOS Safari 与 iOS Edge
（WebKit）跑的是同一个 WebKit 引擎，它们在 `java/classesold.jar` 送达**之后**
失败，不再请求任何东西，也没有画面：

```
Unhandled Promise Rejection: TypeError: undefined is not an object
  (evaluating 'database.transaction')
```

`compiled-method-cache.js` 把一个 `new Promise(executor)` 交给了
`openDatabase.then(...)`，于是执行器立即运行 —— 早于 IndexedDB 打开并产出
`database` 句柄。在 V8 上，`window.onload` 调 `clear()` 时数据库碰巧已经打开，
所以什么都没抛；在 WebKit 上它还在打开，执行器抛出，被拒绝的 promise 经
`bridge.js` 报成致命错误，播放器随即把 frame 拆掉。补丁 4 修掉了那个调用；
补丁 2 让缓存既非致命也不阻塞，因为它本来就只是个优化。

同时进去的还有两处相关改动：

- 适配层在启动期间不再把每个上报的错误都当致命：第一个错误先压五秒
  （`J2ME_BOOT_ERROR_GRACE_MS`），而不是立刻失败。已经画过画面的会话继续跑
  （错误仍留在 `getStatus().error` 里），没画过的会话则以运行时自己的消息失败，
  而不是一句干巴巴的 "startup timed out"。
- 应用服务端现在允许本站把运行时页面嵌进 frame（只对 `/j2me/` 使用
  `X-Frame-Options: SAMEORIGIN` 与 `frame-ancestors 'self'`）。它此前一律发的
  `DENY` / `frame-ancestors 'none'`，导致由 Node 应用提供前端构建产物（Docker
  部署）时每次 J2ME 启动都会以 "Refused to load" / 沙箱访问违规告终。

## 桌面端卡死：父页面动画调度（2026-10-14 修复）

与 `/www/wwwroot/default/J2meJS-main/java` 做受控对比后，定位到的是集成层的
触发条件，而不是 ROM 或类库的问题。同一个 450,183 字节的
`正义化身－忍者神龟传` JAR，在原始页面里和一个用我们打过补丁的运行时的最小
iframe 里都能通过加载画面。而在父页面里加一个哪怕空的、连续的
`requestAnimationFrame` 循环，就会让它在 asm.js 分配器里卡住。去掉父页面那个
RAF 循环，或者把适配层的 canvas 镜像换成 16 ms 的 `setTimeout` 循环，它就能加载
并持续绘制。

适配层现在用定时器镜像，并在暂停、失败与退出时取消它。在 Chromium 里跑真实
游戏 45 秒保持响应，越过了原先的加载卡死，画面持续变化，VM 堆稳定在 557,056
字节。这定位并移除了集成侧的触发条件；它并不声称已经找到 VM 那处非法内存写入的
确切位置。移动端浏览器的模拟同样能复现旧故障，所以这个修复是一致应用的，而不靠
user-agent 判断。

下面更早的分配器调查作为背景保留；它那个 `OutOfMemoryError` 防线单独并**没有**
修好这个游戏。把运行时挪到独立源是可选的隔离工作，不是本修复的前提。

### 98% 卡住背后的异常墙（2026-10-15 修复）

卡死又回来了，在玩家的控制台里表现为一墙
`Uncaught Java exception: java/lang/NullPointerException`，画面停在游戏自己的
加载界面上。控制台就是线索：这个异常是真的，而且由游戏自己的字节码抛出。
`p.aq()V` 重置 actor 表（对 `K` 的每个元素写 `n.j = -1`），执行时 `K` 里还有
元素是 null，于是解释器的 `PUTFIELD` 检查（补丁 6）抛出 Java 的
`NullPointerException` —— 这是正确的 MIDP 行为，`p.aq` 及其调用者里没有任何
地方捕获它。

接着 `Thread.exceptionUnwind` 走完所有帧、到达 `ExitInterpreter` 标记并重新抛出
—— 运行时正是这样把异常交还给上游的编译代码的（`fastInterpreterFrameAdapter`
压入那个标记；`Thread.start0` 压入线程自己的）。这次重抛落进了解释器自己的
`catch (err)` —— fork 把它写成「吞掉 handler 里出来的一切、然后 `continue`
循环」。循环于是在展开刚刚移除的帧栈上重跑那条出错指令，每跑一遍 `sp` 长两个字：
某个游戏一次 40 秒的运行里抛了同一个异常 **594 次**，每一次都是一行红色控制台
输出，类库的 `Display` 每次重绘都报一个被捕获的 `NullPointerException`，画面
停在游戏已经到达的那一帧不再变化。本该收到异常的那个处理器始终没机会运行，
因为那次展开从未结束。

用一个裸的父页面 `requestAnimationFrame` 循环即可复现 —— 与上面那个卡死同一个
触发条件，而且在那个修复之后仍然是触发条件。同一套测试装置与同样的按键做两组
对照（父页面没有循环、父页面用 `setInterval(0)` 循环）都能把游戏玩 60 秒而
不抛一个异常。

补丁 15 让这种异常离开解释器，补丁 16 在异常杀死线程时报出类名与消息，补丁 10
则只在异常展开到线程**自己**的底部标记时才称它未捕获：嵌套标记意味着上面那些
编译帧 —— 解释器的搜索看不到它们 —— 还有处理器，把它们报出来就把一个游戏本来
能处理的异常变成了又一行红色。三个补丁之后同样的运行：没有 error，运行时也没有
warning，游戏一路玩过它的加载界面和各关卡。

### 嵌套运行里被吞掉的异常（2026-10-16 修复）

「冒险小子」（AdventureBoy，HandyGames 出品的《Adventure in Loom Land》，
`ABGame`，2026-10-16 收录）启动时停在发行商的商标画面上，控制台最后的几行是：

```
debug error occurs at : java/io/IOException detailMessage: logo1.png not found
debug Java exception left the interpreter: java/io/IOException
log   interpret error: constructor
...
Uncaught Java exception: java/lang/NullPointerException, detailMessage: image is null
Thread terminated by java/lang/NullPointerException: image is null
```

游戏自己是接得住那条 IOException 的。它在 `ABGame.V()` 里把商标图装进
`Image[5]`：先取 `tmt.png`，再按 `"logo" + i + ".png"` 一张张往下试，整段循环包在
`catch (Exception)` 里，第一张取不到就把这个 catch 当循环出口。而这个 ROM 里只有
`logo0.png`（`logo1` 到 `logo4` 是发行商那些不随包发布的版本），真机上游戏就是靠这个
catch 停下来的。

这里的运行方式不一样：`Image.createImage(String)` 那条链（`ImageDataFactory` →
`Class.getResourceAsStream` → `ResourceInputStream`）是「原生方法再调进解释器」，
也就是一次**嵌套**的解释器运行。异常在这层展开时，`Thread.exceptionUnwind` 走完它
自己压进来的帧，撞上 `fastInterpreterFrameAdapter` 压的 `ExitInterpreter` 标记 ——
标记下面还有 `V()` 的帧，`V()` 的异常表里就有那个 `catch (Exception)` —— 但它按
「上面是编译帧、编译帧自己有处理器」的约定把异常往 JS 那一侧扔。扔出去正好落进
上游那条 `catch (err) { console.log('interpret error:', err); return v; }`：它把
Java 异常和运行时自己的 JS 错误一起吞掉，返回 0 假装调用成功。

于是 `catch` 处理器一次也没跑：循环拿到一个 null 继续装下一张商标图，四张全试完，
最后拿那张空图去画的时候，`Graphics.drawImage` 的 null 检查抛出
`NullPointerException: image is null`，整个 MIDlet 线程就此结束 —— 画面停在商标上。

这和「异常墙」是同一处错误的两半：补丁 15 修的是**解释器循环**里的吞异常，这一处是
`fastInterpreterFrameAdapter`（每个「编译方法 / 原生方法调进解释器」的入口）里的
同一条。补丁 27 让带 `classInfo` 的异常照原样往上传：调用者是编译方法时，它自己的
`try/catch` 按异常表处理或再抛；调用者是解释器循环时，循环的 catch 会把它交给
`exceptionUnwind` 继续找外面的处理器。运行时的 JS 错误维持原样记一条日志。

补丁之后同一个 ROM：日志里只剩一条 `logo1.png not found`（第一张缺失的图就停下来了，
这正是 ROM 里 `logo0.png` 之下没有别的原因），启动 1.0 秒到国旗选择，确定键进标题与
排行榜，方向键与确定键能正常玩。同一批对照 ROM（蹦球传说、恐龙快打、功夫西游、
Forgotten Warrior、Lode Runner、Diamond Rush）启动与操作都不变。

### 关卡里按一下确定键就卡死：三星音频探针答 false（2026-10-16 修复）

上一节让「冒险小子」能进游戏了，但玩着玩着画面会突然定住，控制台只剩两行（截图里就是这两行）：

```
Uncaught Java exception: java/lang/NullPointerException
Thread terminated by java/lang/NullPointerException
```

复现很稳：一路按确定键玩到关卡里，再按一下确定键必现。用探针取到异常展开时的 Java 栈：

```
[I]ABGame.M.()V@334 op=46(IALOAD)      <- 读 c[4] / c[2]
[I]ABGame.d.(I)V@207
[I]ABGame.c.(II)V@57
[I]ABGame.b.(II)V@65
[I]c.run.()V@11
```

`IALOAD` 的数组是 `ABGame.c`：一张 7 个 int 的关卡常量表（每关的音乐与资源 id）。
它只在 `ABGame.x()` 里分配，而且带着条件 —— `if (i) { c = new int[7]; … }`。`i` 来自
游戏的设置初始化 `ABGame.i()`：`i = b.a()`，而 `b.a()` 就是
`com.samsung.util.AudioClip.isSupported()`。真机上这个类由三星（以及当年大量国产手机）
的类库提供并答 true，于是表被分配、音效走 AudioClip；本站内置类库带的那份 `AudioClip`
是完整的 Java 空实现（构造与 play/stop/pause/resume 都不做事），只有 `isSupported()`
写死 `iconst_0`（false）—— 表于是从未分配，而 `ABGame.M()` 与 `ABGame.c(int)` 的关卡音乐
分支照样会去读它，一读就是空指针：MIDlet 线程结束，画面定在最后一帧。

两处一起改：

* `bridge.js` 用 fork 自己的 `ReplaceMethod` 表把
  `com/samsung/util/AudioClip.isSupported.()Z` 换成答 true。本运行时里 AudioClip 的每个
  调用本来就是安全空操作，与站点对其它「在这里是空操作」的 MIDP 内部实现的做法一致。
* 补丁 30 让这张表也能作用到 MIDlet 自己字节码里的调用：原来只有
  `getLinkedMethod` / `findNativeMethodImplementation` 这两条 JS 调用路径会查它，而
  解释器解释 MIDlet 的 `invokestatic` 时一次也不查 —— 作者在 `getMethodByName` 里留的
  注释代码（`//这里实现替换java中的方法`）正是这个挂点。补丁 30 在方法解析时套一次替换，
  常量池把结果缓存进 `cp.resolved[]`，每个引用只多一次查表。

验证：同样按 22 次确定键，帧帧都在变、控制台 0 条 error/warning；按随机键玩 80 秒
（239 次采样、219 张不同的画面）不再出现空指针。同类 ROM（蹦球传说、快打旋风、
Forgotten Warrior、Lode Runner、Diamond Rush）启动与操作不变 —— 其中 Forgotten Warrior
也引用 `AudioClip`，但它从不问 `isSupported()`，行为不受影响。

**类库档位**：`java/classes2.jar`（enginemode2，MIDP 2.0 那一档）里根本没有
`com/samsung/util/AudioClip`，这个 ROM 换到那一档会在 `ABGame.i()` 里抛
`ClassNotFoundException`、停在空白画面 —— 三星类库本来就是这一档刻意不带的东西，
这类 ROM 要用默认的兼容库（enginemode1-classesold.jar，也是播放页的默认选项）。

**同一处卡死为什么在线上又活了一天**（2026-10-16）：这一节的两处改动落在
`frontend/public/j2me/` 里，而访客执行的是 `frontend/dist` 里那份构建时复制过去的
副本。当时 dist 是补丁之前构建的，于是「已经修好」的补丁一行都没上线：同一个 ROM
在线上进入关卡后按确定键照旧空指针卡死，控制台版本号还是旧的那一个
（`?v=ddf7625e334e`）。重新构建（版本号换成新的）之后问题消失。这类「源码修好、
线上照旧」的错位现在由 `tests/j2me-runtime-patches.test.js` 最后一条用例挡住：dist
存在时逐个文件比对 `frontend/public/j2me` 与 `frontend/dist/j2me`（`main.html` 的
`?v=` 版本号先抹掉），不一致就报出是哪几个文件，提示重新构建。

### 一个忙碌的 Java 线程饿死事件循环（2026-10-16 修复）

「功夫西游 - 乱舞唐僧」（`com.sinaflying.engine.GameMIDlet`，817 KB，
2026-10-16 收录）画完启动画面就把页面冻住了：canvas 一直白屏，
`Runtime.evaluate` 与 `Page.captureScreenshot` 都再也不返回 —— 渲染进程的主
线程没了，控制台最后一条输出是运行时自己的 CHAPI 行（`Store setCleanup…`）。
播放器的存档路径与它无关：它发生在一次完全没有存档的首次启动上，这也正是把这次
调查引向 VM 本身的原因。

牵涉两个 Java 线程，它们通过 JavaScript 事件循环互相死锁：

- MIDlet 自己的线程跑 `GameMIDlet.run`。它的循环是
  `while (!c) { if (canvas != null && canvas.f()) { repaint(); … Thread.sleep(90 - elapsed); } }`，
  而 `canvas.f()` 是 `return !this.t` —— `paint()` 开始时置位、返回时清除的那个
  标志。`Thread.sleep` 位于 `f()` 分支**内部**，所以一次绘制进行期间，这个循环
  就是纯粹的忙等。
- LCDUI 事件线程正在那次绘制里面：`f.paint` → 游戏的场景（`game/d.b`）→ 它的
  CMCC 图片辅助类（`cmcc/sinaflying/game/a`）→ `System.gc()`。在这个运行时里
  `Runtime.gc` 是**异步**原生实现（`asyncImpl` + `setTimeout(… ASM._forceCollection())`）：
  它把调用线程挂起，直到 JavaScript 事件循环跑到那个定时器。

解释器完全没有抢占检查，而 fork 还把基线编译器为循环生成的那个也关掉了
（`J2ME.emitCheckPreemption = false`），所以忙等线程从不给事件循环让出机会：
被挂起线程的定时器永不到点，`t` 一直为真，两个线程就这样永远互等。页面的
JavaScript 也再没回到浏览器 —— 白屏和卡死的标签页就是这么来的。

找到它需要一条能在主线程卡死时存活的通道。CDP 的各种路径在解释器空转之后都会
超时，但从 frame 内部发出的 `fetch(..., {keepalive: true})` 仍能离开渲染进程
（由网络进程发送），于是探针向它自己的服务器发了两样东西：一个解释器心跳
（每 1024 条字节码一次，附上 Java 栈）和一份按线程的 Java 栈转储
（`runtime.allCtxs`，像 `Throwable.fillInStackTrace` 那样沿每个线程的帧链走）。
这份转储一次就点出了死锁的两半：

```
ctx 4 paused   org/mozilla/internal/Sys.unwind  <- java/lang/System.gc  <- cmcc/sinaflying/game/a.a(String,int)
ctx 7 spinning com/sinaflying/engine/GameMIDlet.run   (pcs 7/11/15/21/103, f() returning 0, no Thread.sleep)
```

补丁 20 给解释器补上了编译器为循环生成的那种周期性让出（掩码背后的 `PS++` /
`PE()`，保存 `fp`/`sp`/`pc` 并返回 `Context.execute`，由它把线程按 `Yielding`
重新排队）。要不要让、什么时候让仍由 `Scheduler.shouldPreempt()` 决定：
80 ms 的执行窗口加 5 ms 的检查间隔，所以在没有别的东西可跑时，循环根本不会被打断。

补丁之后同一个 ROM 约 1.1 秒启动到启动画面，页面保持响应（`Runtime.evaluate`
能作答、截图能出图），左软键把启动画面收进游戏的加载条与标题界面（带「新的游戏」
菜单），软键 / 方向键 / 开火键持续改变帧。循环也回到每帧一次
`Thread.sleep(90)`（15 秒会话里实测 158 次 sleep）。首次启动与恢复播放器云 RMS
快照的第二次启动都正常绘制，仙剑奇侠传也照样启动、照样重绘 —— 解释器这道检查
是每条字节码一次计数自增加一次掩码分支，代价与它旁边那些 `!release` 断言同一
量级。

有两件事**不是**这个修复：把 `Runtime.gc` 改成同步（asm.js 的收集器必须在
JavaScript 栈为空时运行 —— 这正是那个原生实现挂起调用线程的原因，改成内联执行
反而会损坏 VM），以及把它当成存档 bug。它也不是 `System.gc` 专有：绘制路径上
任何异步原生实现都会以同样的方式死锁，而这个游戏在 `System.gc` 之后就直接走进了
`ImageDataFactory.createImmutableImageData`（经浏览器做图片解码），症状一模一样。

### 整页每秒只有 13 次执行机会（2026-10-16 修复）

玩家反馈「J2ME 游戏卡得厉害」。用播放页真正走的那条路径（`prepareJ2me` → iframe →
镜像画布 → 播放器 canvas）在无头 Chromium 里量了七个 ROM 之后，问题分成两半：
游戏自己的出帧率，和整页还能不能画。

运行时把整个 Java VM 跑在播放页的主线程上，一次最多霸占它
`MAX_WINDOW_EXECUTION_TIME`（上游 80 ms）。而播放页显示的那张画布，是用一个 16 ms
的 `setTimeout` 循环从运行时页面的 canvas 镜像过来的 —— 这条循环也在同一条主线程
上，于是窗口的长度就是「整页每秒能画几次」的上界；而一次窗口边界还要等当前那段
Java 执行返回、再排上下一个任务，实际节奏约是窗口的 1.3 倍。80 ms 于是只留给整页
每秒约 13 次执行机会，吃满 CPU 的 ROM 实测正是如此：

| ROM | VM 出帧 | 页面帧产出（页面里独立的 rAF 循环） | 主线程 |
| --- | --- | --- | --- |
| 恐龙快打 | 13.3 fps（帧间隔中位数 75 ms） | 13.6 fps | 12000 ms 里 11826 ms 在跑任务 |
| 正义化身－忍者神龟传 | 3.4 fps | 11.1 fps | 98%（159 段约 72 ms 的「长任务」） |
| 蹦球传说 | 58.8 fps | 59.5 fps | 18% |

第三行是判据：轻游戏在同一个窗口下一切正常，所以既不是镜像慢、也不是 rAF 被浏览器
压制，而是**窗口太长**。同一个 ROM 里那个与游戏无关的 rAF 循环只能跑到 13.6 次/秒，
这一点最能说明「不是游戏慢，是整页拿不到帧」。

把窗口改成半个 60Hz 的帧（8 ms）之后：

| ROM | VM 出帧 1× | VM 出帧 4× 降频 | 页面帧产出 1× | 页面帧产出 4× |
| --- | --- | --- | --- | --- |
| 恐龙快打 | 13.3 → 13.3 | 12.5 → 13.3 | 13.6 → 60.0 | 12.9 → 59.0 |
| 正义化身－忍者神龟传 | 3.4 → 11.5 | 3.2 → 10.9 | 11.1 → 59.8 | 10.8 → 59.0 |
| 蹦球传说 | 58.8 → 58.6 | — | 59.5 → 59.6 | — |
| 仙剑奇侠传 | 54.4 → 54.2 | — | 60.1 → 60.0 | — |

恐龙快打仍是 13.3 fps：它自己就按约 75 ms 一帧的节奏跑（窗口改成 4 ms 也一样），
与窗口无关 —— 它变的是整页的帧产出（13.6 → 60）。忍者神龟传不一样：它的 `paint()`
走 `DisplayDevice.refresh0`，那个原生实现用 `requestAnimationFrame` 挂起绘制线程，
rAF 被 80 ms 的窗口饿着，出帧率于是被压到 3.4 fps；窗口短了以后回到 11.5 fps。
CPU 总占用不变（依旧 ~99%），变的只是 VM 把执行权还回去的次数：每秒约 13 次 →
约 120 次。

为什么是半个帧而不是一个帧（16 ms）：16 ms 下同样量到页面帧产出只有 50~53 次/秒
（边界间隔被拖到约 20 ms），出帧率也略低（忍者神龟传 1× 10.6、4× 10.2，恐龙快打
4× 13.1）。再降到一个帧的八分之一（4 ms）没有额外收益（忍者神龟传 4× 11.0、恐龙
快打 4× 13.2），只多出调度次数。

#### 试过、但没有留下来的：让 `Thread.yield()` 变便宜

先量到的其实是另一半。这些 MIDlet 的等待循环写成
`while (System.currentTimeMillis() < 截止时刻) Thread.yield();`，而在这个运行时里
一次 `Thread.yield()` 走的是完整重路径：`beginUnwind` / `nativeBailout`
（`getUnwindMethodInfo` 加造一个 bailout 帧）→ 抛过解释器 → `endUnwind` +
`pushPendingNativeFrames` → `Scheduler.enqueue`（unshift + sort +
`updateMinVirtualRuntime`）→ 由 `run()` 重新 `execute()` 并重入解释器。恐龙快打实测
每秒调用 29.4 万次（`J2ME.unwindCount` 每秒 +33~38 万），CPU profile 里这条路径占了
主线程 45% 的时间，而真正解释字节码只占 18%。

于是试了一版「没有别的可运行线程、执行窗口也还没用完时直接返回」的 `Thread.yield()`
（判据是 `runningQueue.length === 0` 且 `performance.now() - windowStartTime <
MAX_WINDOW_EXECUTION_TIME`；窗口到期照旧走真 yield，所以「事件循环最长被挡多久」的
保证不变，在编译方法里同样成立 —— `shouldPreempt` 只覆盖解释器）。它确实省掉了那些
展开：解释器吞吐按抢占检查次数估算涨了 3~4 倍（恐龙快打 123 → 454 次/秒，忍者神龟传
139 → 520 次/秒），但**画面一帧也没多** —— 等待循环会把省下来的 CPU 原样烧回空转里，
两种实现的帧率在 1 倍、4 倍、8 倍 CPU 降频下完全一致（恐龙快打 13.3/12.5/12.7 对
13.3/12.6/12.6，忍者神龟传 10.6/9.6/8.5 对 10.6/10.0/8.7），页面帧产出也一样。
代价却是实实在在的：每次调用多一次 `performance.now()`，profile 里 `canSkipYield`
自己就占了 28% 的样本；它还改了 `Thread.yield` 的语义（等别的线程或事件循环的代码
要多等一个窗口）。没有收益就不留：补丁清单里没有这一条，`Thread.yield` 保持上游
写法（`tests/j2me-runtime-patches.test.js` 里有断言守住）。

真正解决问题的是窗口本身：窗口短了，解释器的抢占检查（补丁 20）与 `refresh0` 的 rAF
都能按时排上，页面和游戏不再互相饿着。量这些用的探针在 `/tmp/j2me-perf/`：
`probe4.mjs` 量 VM 出帧、页面帧产出与主线程占用（`CPU_THROTTLE=<倍数>` 用
`Emulation.setCPUThrottlingRate` 模拟手机 CPU），`probe8.mjs` 按原因统计线程让出。

### 拼错的编码类名（2026-10-16 修复）

「昆仑千年情」（`GameMIDlet`，Nokia N73 版本，ROM id 172）始终过不了加载界面。
控制台打出了 manifest、`load main class : GameMIDlet`、CHAPI 行 —— 然后是一行
红色的 `Uncaught java exception: java/lang/NullPointerException`，接着
`Thread terminated by java/lang/NullPointerException`，canvas 停在启动画面。

死掉的线程是后半段故事；它上面那条 warning 才是前半段：

```
ClassNotFoundException com/sun/cldc/i18n/j2me/UFT_8_Reader.class
'com/sun/cldc/i18n/j2me/UFT_8_Reader.class' not found.
```

游戏自己的 `l.class` 里带着字符串 `UFT-8` —— `UTF-8` 调换了两个字母 —— 并把它
传给 `new InputStreamReader(is, "UFT-8")`。CLDC 的
`Helper.internalNameForEncoding` 由编码名推出实现类
（`com/sun/cldc/i18n/j2me/<NAME>_Reader`），于是运行时被要求加载一个三份内置
类库都没有的类：它们只提供 `UTF_8_Reader`。这个 `ClassNotFoundException` 穿过
`Helper.getStreamReaderPrim` 回到 MIDlet，没有地方捕获它，线程死在一个
`NullPointerException` 上。同一个 JAR 在 `a.class` 里把 `UTF-8` 拼写正确，加载
`UTF_8_Reader` 毫无问题，这也是为什么故障只在启动进行到一半时才出现。

这个 ROM 在真机上没有问题：若干厂商类库同样提供那个拼错的类，所以游戏在那里
根本遇不到失败。

补丁 21 在类加载的最后一步加上别名：请求 `com/sun/cldc/i18n/j2me/UFT_*` 而找不到
文件时，用 `UTF_*` 再试一次。Java 侧最终持有的是 `UTF_8_Reader` —— 对调用方不可见，
因为它只关心从 reader 里读回的字符。打了补丁之后，同一个 ROM 约 1.2 秒启动到
标题画面（首次）、约 0.8 秒（第二次，缓存已热），MIDI 主题曲响起，帧之间持续
重绘；控制台干净，只剩游戏自己那行
`error occurs at : java/lang/NullPointerException` 调试输出 —— 有无补丁它都在
（MIDlet 在启动期间捕获了自己抛的一个异常）。

### 空区域的 drawRGB 冻结画面（2026-10-16 修复）

同一个游戏，在终于能启动之后，剧情进行几分钟又冻住了：画面停在某个场景，按键
看不出反应，而页面本身完全健康（`Runtime.evaluate` 能作答，游戏循环仍保持每帧
一次 `Thread.sleep(90)`）。控制台以一行游戏永远看不到的输出结束：

```
TRACE: <at java.lang.NullPointerException>, Exception caught in Display class
```

那行 TRACE 来自 `Display.handleThrowable`，由 `CanvasLFImpl.uCallPaint` 环绕
`canvas.paint(g)` 的 `catch (Throwable)` 调用 —— 也就是说 **MIDlet 的 `paint()`
抛了异常**，而 MIDP 规定从 `paint()` 抛出的异常被忽略（canvas 保留上一帧内容）。
于是游戏继续在没人重绘的屏幕后面运行：冻住的是画面，不是线程。

这个异常本身是一个更底层问题的站点补丁副产物：给 `Context.createException`、
`translateException` 以及编译器生成的空值检查加上观测后，可以看到那个 NPE 是
**被制造出来的**。真正的错误是一个浏览器的 `DOMException`：

```
SITE-TE-NOADDR {"name":"IndexSizeError","ctor":"DOMException",
  "str":"IndexSizeError: Failed to execute 'createImageData' on 'CanvasRenderingContext2D':
         The source width is zero or not a number.",
  "stack":["  at Native.javax/microedition/lcdui/Graphics.drawRGB.([IIIIIIIZ)V (main-all.js:9388)",
           "  at com/sinaflying/engine/e.a(Graphics,IIIIII,II)V (compiled)"]}
```

游戏的精灵 blitter 调用
`Graphics.drawRGB(rgbData, offset, scanlength, x, y, width, height, true)`，
而在那个场景它交来的是**宽或高为零的区域**（一个可见面积塌缩的精灵）。真机什么
都不画；这个运行时的原生实现把数字直接喂给 `createImageData(width, height)`，
后者对非正尺寸抛出 `IndexSizeError`。`translateException` 只映射 `TypeError` 与
fork 的 `JavaRuntimeException`，于是这个 `DOMException` 原样穿过 —— 而编译代码
随后在自己的 catch 里做 `TE(ex)._address`，对 `DOMException` 来说那是
`undefined`。它的重抛路径（`emitThrow` → `!A && TN()`）因此抛出的是一个**全新**
的 Java `NullPointerException`，而被 `Display` 吞掉的正是它。真正的原因从未到达
控制台。

由此产生两个补丁：

- **补丁 22** —— `drawRGB` 在 `width <= 0` 或 `height <= 0`（含 `NaN`）时立即
  返回，这正是手机对空区域的处理。
- **补丁 23** —— `translateException` 把任何没有 `_address` 的 JavaScript 错误
  变成携带其 `name` 与 `message` 的 Java `RuntimeException`，这样下一个抛出意外
  东西的原生实现会报出**为什么**，而不是制造一个 null。

用 `tests/j2me-real-game.mjs` 测试装置里的探针（或站点自带的 `__spinProbe`
观测点）验证：用软键 / 确定 推进剧情（第一个界面等的是**左软键**），确认画面
持续变化且 `Exception caught in Display` 永不出现。补丁 22 之前，那次运行按了
约 20 次键到达剧情后画面就不再变化，日志里留下一个 `NullPointerException`；
之后，同样的运行越过了那个场景继续推进。

### 圆弧画在包围盒的左上角（2026-10-16 修复）

「蹦球传说」的主角球画成了一个红白相间的怪块：一个红色圆盘，加一块偏向右下、
半透明的白色球体。球本身是游戏自己算出来的 42×42 像素块，用
`Graphics.drawRGB` 贴上去，球面高光则是一串 `fillArc`：

```
SITE-DRAW drawRGB len=1764 off=0 scan=42 d=97,203 42x42 alpha=1
SITE-DRAW fillArc d=101,213 32x34 ang=90,90
SITE-DRAW fillArc d=101,214 32x32 ang=180,90
SITE-DRAW fillArc d=105,222 24x24 ang=0,90
```

两个圆弧 native 都把包围盒的**左上角**当成椭圆圆心交给了 `createEllipticalArc()`
（它要的确实是圆心 —— `createRoundRect()` 就是按圆心调用的），`fillArc` 还把这个
角当成了扇形的顶点（`c.moveTo(x, y)`）。于是每一片弧都向左上偏了半个包围盒，扇形
还多出一块连到那个角的楔形：整颗球的高光被画成一坨压在球上的大白块，这也就是玩家
看到的「主角球解析得不对」。

补丁 24 修两件事：

- **圆心与扇形顶点** —— 圆心取包围盒正中，扇形从圆心张开（`moveTo(cx, cy)` 加
  `closePath()`），与真机一致。
- **扫过的方向与整圆** —— MIDP 的角度以「0 = 3 点钟、逆时针为正」计，画布的角以
  「0 = 3 点钟、顺时针为正」计（屏幕 y 轴向下），所以画布角 = -MIDP 角。上游把起止
  角互换后一律按 `anticlockwise=false` 画：正角度（游戏里最常见的那种）刚好凑对，
  负角度却会沿另一个方向绕 270 度。`|arcAngle| >= 360` 另按整圆处理，因为画布对
  `start == end` 的圆弧什么都不画。

验证用仓库里自带的探针（不需要任何商业 ROM，它自己现编一个只画圆弧的 MIDlet）：

```bash
J2ME_TEST_CHROME=/path/to/chrome node tests/j2me-arc-probe.mjs /tmp/arc-probe
```

15 格分别覆盖正角、负角、跨 0 度、整圆、空角与 `drawArc`；脚本把截图里每一格与
「MIDP 规定的扇形」逐点比对 —— 半径 7 与 15 处按 5 度采样必须在扇形内、半径 25 处
必须留白（贴着边界射线 1.6 像素以内的点会被抗锯齿混色，跳过）。补丁前 804 个采样点
不符，补丁后 2319 个采样点全部通过。同一套探针下，「蹦球传说」的主角球也从这个怪块
恢复成正常的红球加高光。

### 朝右的精灵散成一堆部件（2026-10-16 修复）

「恐龙快打」（Gameloft 的 J2ME 版，ROM id 174）的主角朝右时整个人是一堆错位的
身体部件，朝左时完全正常；同一张精灵表里的小怪与道具也跟着坏。截图里的差别很干净
—— 朝左的走路、出拳都对，朝右的每一帧都散架。

游戏用的是 Nokia 的 `DirectGraphics.drawImage(img, x, y, anchor, manipulation)`
（Nokia UI API 的图片变换入口），而这份实现把第 5 个参数整个丢掉、一律按
`TRANS_NONE` 把整张图贴到 `(x, y)`：

```
Native["com/nokia/mid/ui/DirectGraphicsImp.drawImage.(Ljavax/microedition/lcdui/Image;IIII)V"] = function(addr, imageAddr, x, y, anchor,unknow) { … renderRegion(…, TRANS_NONE, x, y, anchor); };
```

游戏是照真机的行为算坐标的，两件事合在一起就出错了：它先把 MIDP 裁剪区设成
「变换后的图该出现的那个矩形」，再把**整张**精灵表按变换贴上去，让要用的那块源图
正好落进裁剪区（源区域在变换后的图里的偏移 = 图尺寸 - 源坐标 - 源尺寸）。变换被丢掉
之后，落进裁剪区的是同一张表里另一块内容 —— 朝右的每一帧都由另一组精灵组成，于是
画面变成一堆错位的部件；朝左的帧 `manipulation = 0`，走的本来就是对的路。

补丁 25 把 Nokia 的 `manipulation` 折算成 MIDP 的 `TRANS_*` 码，绘制仍交给
`renderRegion()`（`Graphics.drawRegion`、`Image.createImage(…, transform)` 走的都是
这条路径）：

```
manipulation = 第 13 位（FLIP_HORIZONTAL 8192）| 第 14 位（FLIP_VERTICAL 16384）| 低位（90/180/270）
```

| 翻转 \ 旋转 | 0 | 90 | 180 | 270 |
| --- | --- | --- | --- | --- |
| 无 | TRANS_NONE | TRANS_ROT270 | TRANS_ROT180 | TRANS_ROT90 |
| FLIP_HORIZONTAL | TRANS_MIRROR | TRANS_MIRROR_ROT90 | TRANS_MIRROR_ROT180 | TRANS_MIRROR_ROT270 |
| FLIP_VERTICAL | TRANS_MIRROR_ROT180 | TRANS_MIRROR_ROT270 | TRANS_MIRROR | TRANS_MIRROR_ROT90 |
| 两者 | TRANS_ROT180 | TRANS_ROT90 | TRANS_NONE | TRANS_ROT270 |

这张表有一条统一的规则：**Nokia 先按给定角度逆时针旋转，再在旋转后的坐标系里翻转**
（等价于 MIDP 的「先镜像、再顺时针旋转」）。它被两样东西印证：MicroEmulator 的 Nokia
API 实现（`MANIPULATION2TRANSFORM`，J2ME-Loader 继承的那份）与本表逐项一致；FreeJ2ME
对单独旋转/翻转的折算也一致（它把「翻转 + 旋转」换成两次图片变换的组合，方向与另一条
规则相反 —— 按这个 ROM 的几何，本表才是对的，下面就是判定依据）。

顺着这个 ROM 自身的几何还能定出**方向与顺序**：每种组合只有一个解能让源区域落进裁剪
区，而游戏为每种组合算出的目标坐标正好就是这个要求 —— `8192 → TRANS_MIRROR`、
`8192|90 → TRANS_MIRROR_ROT90`（而不是 `TRANS_MIRROR_ROT270`）、
`8192|270 → TRANS_MIRROR_ROT270`、`90 → TRANS_ROT270`、`16384 → TRANS_MIRROR_ROT180`，
表里每一项都对得上。反过来说，旋转方向或翻转顺序填错时源区域会落到裁剪区之外，画面上
就是「什么都没画」。

拆不出来的取值（旋转不是 90 的倍数、度数超过 270、翻转位之外的高位有值）按真机抛
Java 的 `IllegalArgumentException`，而不是悄悄画成原图 —— 与 MicroEmulator 的做法
一致，将来真遇到这种 ROM 时也会指明是哪个值。

### 同一个补丁的坑：折算表必须写在 `TRANS_*` 之后

这条补丁第一次上线时把表写在了 `Native[...] = function (...) {...}` 那里，也就是
`var TRANS_NONE = 0; ... var TRANS_MIRROR_ROT90 = 7;` 这八行的**前面**。`var` 会提升但
赋值不会：表字面量求值时那八个变量都还是 `undefined`，于是 `siteManipulationToTransform()`
每次返回 `undefined`。`renderRegion()` 拿到不认识的变换就走不进第二个 `switch`，目标坐标
`x` / `y` 保持 `undefined`，交给 `drawImage()` 就是 NaN —— 画了，但什么都没落在画布上。

症状因此长得像「反向修坏」：朝左的帧（`manipulation = 0`，走 `Graphics.drawImage`）完好，
朝右的帧（8192，走 Nokia 路径）整块消失，而不是错位。判定它的办法是**同一次会话里切换
新旧行为**：给折算函数加一个开关，关掉时按 `TRANS_NONE` 画，打开时按折算表画。同一帧
下前者能看见（散架的）主角、后者空空如也，说明问题就出在这条路径上；再用一个干净画布
手工复现 `renderRegion` 的镜像（`scale(-1,1)` + 整图 `drawImage`）就能看到镜像本身没
问题 —— 问题在折算结果。`tests/j2me-runtime-patches.test.js` 里现在有两道守卫：一条断言
表出现在 `var TRANS_MIRROR_ROT90 = 7;` 之后，另一条按产物里的**真实顺序**求值这段代码
（而不是把常量当参数注入）并检查四个基本取值都不是 `undefined`。

验证：同一个 ROM 走生产适配层（`tests/j2me-real-game.mjs` 那套外置 ROM 探针，额外把
运行时自己的 native 逐个包一层计数），按键推进到关卡。调用分布本身就点明了症状所在 ——
朝右的每一帧都是 `8192`，朝左的帧是 `0`（加上零星几次 `90`/`180`/`8282`/`16384`，是别处
的道具与特效）。补丁前主角与旁边的小怪散成一堆部件、剧情场景里也一样；补丁后朝右的
走路、出拳与朝左的走路都正常，剧情场景里的主角与敌人也不再碎片化，控制台除了游戏自己
那行被捕获的 `NullPointerException` 调试输出之外没有任何 error/warning，每帧的绘制调用数
与补丁前完全一致（变换是画布自己的，没有多出一次拷贝）。

顺带核对过本站其余 10 个 J2ME ROM：只有「恐龙快打」调用
`com/nokia/mid/ui/DirectGraphics.drawImage`（其余用的是 `fillPolygon` /
`drawPolygon` / `setARGBColor` / `DeviceControl`），所以这次改动的影响范围就是它。

### 画在画面外的裁剪区变成一个巨大的裁剪区（2026-10-16 修复）

「恐龙快打」里被打倒的敌人与主角，只要贴图有一部分移出画面左边，画面上就会多出一条与
精灵同高的**精灵表碎片**：有时压在角色身上（看上去像那张贴图错乱），有时铺在路面上，
位置由整张表贴上去时的偏移决定，横跨画面的左半部分（实测最远到 x ≈ 184，见下）。

根因在 `GraphicsInfo.prototype.setClip()` 的四个 `& 32767`：

```js
    newX1 = Math.max(minX, newX1) & 32767;
    newY1 = Math.max(minY, newY1) & 32767;
    newX2 = Math.min(maxX, newX2) & 32767;
    newY2 = Math.min(maxY, newY2) & 32767;
```

对非负值这个掩码是恒等运算；对负值它是 `v & 32767 = 32768 + v`。而
`Math.min(maxX, newX2)` 只有在**请求的矩形完全落在画布左外侧**（右边界 `x + width < 0`）
时才会是负数 —— 也就是说，唯一被这个掩码改动的输入，恰好是「与画布求交为空」的那一类
请求。掩码把它变成 `32768 + 负数`，一个宽三万多像素的裁剪区，比 240x320 的画布大得多：
裁剪不但没生效，还等于没有裁剪。

游戏正是靠裁剪画精灵的：`n.a(Graphics, Image, int sx, int sy, int sw, int sh, int dx, int dy,
int anchor, int transform)` 先把裁剪区设成精灵矩形 `(dx, dy, sw, sh)`，再把**整张精灵表**
按变换贴到 `(dx - sx, dy - sy)`，让要用的那块源图正好落进裁剪区（这个 ROM 的角色精灵表
是一张 200x171 的图，表里放着同一个角色的各种姿势，所以落进画面的碎片常常是一具
**躺着的身体**——玩家看到的就是「倒地的敌人/主角贴图错乱」）。裁剪失效后，贴上去的整张
表只要与画面相交就会画出来：碎片的高度就是那个精灵的高度（实测 4~32 像素，多数在
`y ≈ 133~228`，也就是地面与影子那一带），位置取决于表的偏移。

修法是把四条边各自夹进 `[min, max]`（即与目标画布求交），空交集照旧被下面那句判断折叠
成 `[0, 0, 0, 0]`（空裁剪区，`applyGraphics()` 会把它变成画布上的空裁剪）：

```js
    newX1 = Math.min(Math.max(minX, newX1), maxX);
    ...
```

这条改动**只**影响那些与画布求交为空的请求（见上：掩码只在右/下边界为负时生效），对
画布内与部分越界的矩形结果完全一致，所以不可能画少任何内容。

验证：本次调查用了一个外置探针（模式与 `tests/j2me-real-game.mjs` 相同：同一个 ROM
走生产适配层、按键脚本推进到关卡），它在运行时页面里包一层 `CanvasRenderingContext2D`，记录
每一次 `clip()` 与 `drawImage()` 的**设备坐标**与当前裁剪区，并在绘制前后对同一块区域取
像素。判定标准不依赖任何外部参照：**真机上不会有比画布更大的裁剪区**，也不会在「与画布
求交为空」的裁剪区下画出任何像素。

- 补丁前（同一个 ROM，同一套按键脚本，60 秒）：`310` 次裁剪区大于画布，其中 `310` 次
  真的画了东西，共改变 `34777` 个像素；按帧统计，最重的一帧改了 `15678` 个像素。
- 补丁后：`0` 次。裁剪区请求的其余行为完全一致（同一时间窗内 `clipEmpty` 3560 → 3666，
  出画面边界的 drawImage 14481 → 14271，绘制调用总量 37243 → 36776）。
- 同一次会话里切换新旧行为的成对截图（把「被修正的裁剪区」下的那次绘制单独重放到画布
  副本上，两次裁剪都取自同一帧的同一瞬间）：旧行为在画面左端画出一具多余的躺倒身体，
  新行为那里什么都不画（差异 687 / 639 / 621 … 像素，逐对可查）。

`tests/j2me-runtime-patches.test.js` 里有两道守卫：一条断言产物里的四行夹取写法在、四个
`& 32767` 不在；另一条按产物里的**真实代码**求值 `setClip`，逐点核对「完全在画布外 →
空裁剪区」「部分越界 → 裁到画布边」「画布内 → 原样保留」，并断言任何请求得到的裁剪区都
落在画布之内（把补丁挪回旧写法时这两条都会红）。

### 更早的分配器证据

`正义化身－忍者神龟传`（从形态上看，任何把 fork 的运行时逼进同一个角落的 MIDlet
也一样）在 PC 上会冻住整个页面：游戏自己的「载入中…」画面走到一半停住，标签页
不再响应 —— 渲染进程的主线程再也不让出，连播放器的 UI 都无法反应。

经由生产播放器入口实测（`tests/j2me-real-game.mjs`，外加一个每秒采样页面的 CDP
驱动）：

- 卡死时游戏已画完自己的加载界面，VM 堆约占 128 MB asm.js 堆的 471 KB，所以这
  **不是**内存压力。
- 此后 `Runtime.evaluate` 超时，`Profiler.stop` 永不返回，但 `Debugger.pause`
  仍能返回：渲染进程在 JS 里空转，不是在等 I/O。
- 暂停下来的调用链是 `bld/native.js` 里的 `jf → Rc → Pc → Nc → Yb → ce → Ab → Bb`
  —— Emscripten 的 asm.js GC —— 由 `bld/j2me.js` 的 `newArray()` 经
  `J2ME.gcMallocAtomic` 进入（按模块的导出表，`jf` 就是导出的
  `_gcMallocAtomic`）。
- `ASM._getUsedHeapSize()` 四分钟内保持不变，Java 帧状态（`fp`、`sp`、`opPC`）
  在多次暂停之间逐字节相同：**一次** `_gcMallocAtomic()` 调用永不返回。`Bb` 是
  分配器的空闲空间搜索；它的循环在走一条永不终止的链，也就是说它遍历的空闲
  链表早先已被破坏。
- 只有这个游戏如此。`仙剑奇侠传` 在同一套装置里跑 45 秒以上、持续重绘
  （屏幕哈希在变，没有卡死）。

破坏从哪来：这个 fork **停用了 Java 的错误路径**。
`Thread.prototype.throwException` 只打日志（`case 1/0/2/3` 被注释掉了，
「这里拦截了报错」），`throwArrayIndexOutOfBoundsException`、
`throwNullPointerException`、`throwArithmeticException` 也都被阉割，于是解释器
会继续执行那条刚被检查拒绝的存储/字段写入。编译路径同样：`emitBoundsCheck()`
调用 `TI()` —— 那个被阉割的抛出 —— 然后照样写入，特权名单里的方法完全跳过检查，
而对 null 接收者的编译 `putfield` 会走 `TN()`（同样被阉割）并写到
`null + fieldOffset`。那么低的地址是模块自己的静态数据，而那正是 GC 放页表
（`c[60320 + …]`）与空闲链表头（`c[8 + …]`）的地方。那里来一次野写，分配器的
搜索就会永远空转 —— 顺带把浏览器标签页一起带走。

这次调查产出的是：运行时现在保留 Java 的安全检查。`Thread.throwException()`
与编译产物里的 `TN` / `TI` / `TA` 辅助函数改为抛出对应的 Java 异常，而不是打条
日志继续跑；数组存储检查同理。这防止了错误的字段或数组访问覆盖 GC 的页表或空闲
链表。`newArray()` 在分配器返回 0 时也改为抛出 Java 的 `OutOfMemoryError`，
而不是在地址 0 处写数组头。带着这些防护，游戏仍能启动、仍能重绘，下面那段真实
游戏序列也已经过生产播放器入口验证。

试过但**不能**解决卡死的做法（都在这个 ROM 上验证过）：另外两份类库
（`enginemode2-classes2.jar`、`enginemode3-classes.jar`）、全 STORED 的 JAR
（不走 JS inflate）、挂起的 `AudioContext`、20 倍 CPU 降频、省略
`midletClassName`、每 32 个调度轮次强制一次完整收集，以及给分配器的 `while(1)`
与 `do-while` 循环加上边界（5 万次迭代、bail-out 时 `break`）—— 空转只是转移到
边界之外的循环里，调用方「收集并重试」的路径仍让页面卡住。关掉 JIT
（`invokeThreshold` / `backwardBranchThreshold` 设为 1e9，让一切都留在确实会跳过
野访问的解释器里）能让页面保持响应，但游戏停在加载界面上，所以也不算修复。

建议的后续工作，按价值排序：

1. **给运行时一个独立源**（自己的端口/主机，而不只是自己的路径）。同源 frame
   共享同一个渲染进程主线程，这正是 VM 卡死会冻住播放器 UI 的原因；独立源会有
   自己的进程，播放器就能发现 frame 已死并提供重新加载，而不是一起卡住。这需要
   把 JAR 的交接从 `blob:` URL 改成 `postMessage`（blob URL 是按源隔离的），并把
   canvas 镜像换成传输过来的 `ImageBitmap`（跨源 canvas 读不回来）。
2. 把分配器/异常的发现上报给上游（`Rosabis/J2meJS`）：被阉割的
   `throwException` 路径与一条可能被无限遍历的空闲链表都是上游问题，而上面的
   复现是自包含的。

### J2ME 音效是 IMA ADPCM（2026-10-17 修复）

「刺客信条-兄弟会」（ROM 名 `刺客信条-兄弟会`，JAR 1.19 MB）一开局，控制台就出现：

```
create player : audio/x-wav
PlayerContainer 0
mediaFormat- wav
Uncaught (in promise) EncodingError: Unable to decode audio data
```

画面停在 Gameloft 商标，播放器把这一局标记成失败。原因有两层：

- 这个 JAR 的 17 个音效全在资源文件 `17` 里，都是 **IMA ADPCM**：`fmt ` 的格式标签
  `0x11`、单声道、8000 Hz、`nBlockAlign = 256`、每块 505 个采样。Chrome 的
  `decodeAudioData` 只认未压缩 PCM 等少数格式，IMA ADPCM 一律拒绝 —— 所以声音本来
  就放不出来。
- 运行时的写法是回调形式 `decodeAudioData(uint8, success, error)`。按规范它**仍然
  返回一个 Promise**；解码失败时这个 Promise 被拒绝，而代码只接过回调、没有接
  Promise。`bridge.js` 的 `unhandledrejection` 监听把它当成未捕获错误发给播放页，
  播放页的 `fail()` 于是拆掉运行时 iframe —— 一个解不了的音效把整局游戏结束了。

修法：

1. `siteDecodeImaAdpcmWav()` 按 Microsoft 的 IMA ADPCM 规范解码：每个块 4 字节块头
   （predictor / step index / reserved），之后每个字节两个半字节、**低位在前**，按
   步长表与索引表累加并夹到 16 位；支持单声道与双声道，最后用
   `AudioContext.createBuffer()` 生成 PCM `AudioBuffer` 交给原来的 `playSound()`。
   普通 PCM WAV 仍然走浏览器自己的解码器（格式标签不是 `0x11` 时函数返回 `null`）。
2. `writeBuffer()` 改用 Promise 形式并带拒绝处理。解不了、或者浏览器拒绝的音频只
   `resolve`，不再留下没人接的拒绝。

这个游戏在标题画面就会预建 **19 个 wav Player**（`PlayerContainer 0` 到 `18`），所以
任何一处解码失败都不该结束会话；补丁后 19 个都正常创建，标题画面出现
「要开启声音吗?」，按 5 可以进入下一屏。

用 `tests/j2me-real-game.mjs` 对真实 ROM 验证：补丁前 `getStatus()` 在 1 秒内变成
`failed`、iframe 被拆掉；补丁后运行停在 `running`，`runtime-log.json` 里没有任何
error / exception，按 5 后画面从 Gameloft 商标变成标题画面。`tests/j2me-runtime-patches.test.js`
里的守卫按产物里的真实代码求值解码器：一块 256 字节的单声道 IMA 块必须解出 505 个
采样、前八个值与规范逐位算得的结果一致；立体声块每声道 249 个；PCM 与不是 RIFF 的
数据都必须返回 `null`，不能把它抢走。

另外记一笔：这个 ROM 偶尔会在**音频初始化之前**就停在 Gameloft 商标，控制台里是
`Static initializer: java.lang.NullPointerException` 的类初始化错误（一次
`create player` 都没有），与本条音效修复无关，本次没有处理。

## 运行时资源的版本化

nginx 以 12 小时的 `max-age` 提供 `dist` 里的 `.js`/`.css`。于是缓存了上一版
运行时的手机，会拿这些脚本去跑一个新部署的页面 —— 这正是上面那个修复对上报问题
的手机不生效的状态。`frontend/scripts/stamp-j2me-runtime.mjs`（由 `npm run build`
执行）对 `dist/j2me` 里的运行时副本做哈希，写出 `dist/j2me/version.json`，并给
`main.html` 里每一处本地 `src`/`href` 打上 `?v=<version>`。适配层用
`cache: 'no-store'` 读那个文件并打开 `/j2me/main.html?v=<version>`，打过补丁的
`main-all.js` 也按同一个版本号取类库。因此改动任何运行时文件都会一次性改掉所有
URL；`version.json` 缺失（开发服务器）只意味着 URL 不带版本戳。

## 播放器加载面板里的 J2ME「核心」

J2ME 没有 libretro 核心可下载，但启动一个游戏仍要拉约 4.4 MB 的运行时：
`main.html` 引用的脚本与样式表，外加 Java 类库（`java/classesold.jar`）。这些
由 frame 自己去取，所以在最后一次改动之前，播放器只显示 ROM 一项任务，然后一直
停在「初始化模拟器…」，其余部分在看不见的地方到达。

`version.json` 里还带一份 `boot` 列表 —— `main.html`、它引用的每一处本地
`src`/`href`，以及 `java/*.jar` 类库，各自带体积（被引用但磁盘上不存在的文件
记 `size: null`）。播放器读它两次：

- `frontend/src/composables/player/useCoreAssets.js` 在核心确定时就登记这些任务
  （面板在下载开始前就把它们列成两行「核心」，并带上字节总数），以及
- `frontend/src/composables/player/j2meCore.js`（`warmJ2meRuntime`）在
  `prepareJ2me` 打开 frame 之前，按同样的 `?v=<version>` URL 取这些文件，并汇报
  真实字节进度。之后 frame 自己的请求就命中浏览器缓存（`cache: 'force-cache'`，
  js/css 有 12 小时 `max-age`，类库最坏情况是回源校验），而不是把同样的几 MB
  再下一次。

只取所选 `enginemode` 对应的那份类库；另外两份列在 `boot` 里但从不请求、也不
计入进度。下载失败会报成一项失败的任务，但从不中断启动 —— 运行时有自己的抓取
和自己的 30 秒启动超时 —— 而如果预热停滞（20 秒没有一个新字节），它就停止等待，
把自己的任务标成 skipped，让 frame 继续走。没有 `version.json` 时（开发服务器、
未打版本戳的部署）不登记任何「核心」任务，面板退回只显示 ROM，与以前完全一致。


## 适配层

`frontend/src/composables/player/j2meRuntime.js`（`prepareJ2me`）：

- 把 ROM 解析成字节，然后从 JAR 内的 `META-INF/MANIFEST.MF` 读出主类（manifest
  通常是 deflate 压缩的，所以要走 ZIP 中央目录，再用 `DecompressionStream` 解开
  那个条目）。类文件本身也会校验，因此无法启动的 JAR 会以清晰的消息失败，而不是
  超时。
- 通过 frame 的查询串把 JAR 以 `blob:` URL 交给运行时，同时带上
  `midletClassName`、类库（`enginemode`，由玩家在开局对话框里选择，未保存过时用
  `enginemode1-classesold.jar`）、屏幕预设，以及从 `/j2me/version.json` 读到的
  运行时版本（见「运行时资源的版本化」）。
- 接上云存档时（`cloudSave`，见「Java 存档（RMS）上云」），快照在 frame 打开
  之前请求，并作为第二个 `blob:` URL 放进 `save` 参数；已登录但还没有存档的玩家
  拿到 `save=none`，它告诉 frame 清掉上一局留下的东西。URL 在会话结束时释放。
- 启动是上报出来的，不是假设出来的：运行时在启动期间上报的错误先压住
  `J2ME_BOOT_ERROR_GRACE_MS`（5 秒）而不直接判失败，这样下面说的 WebKit 噪声
  就无法杀掉一个即将画出画面的启动；而始终没画出画面的会话以运行时自己的消息
  失败。
- **frame 是同源的，没有加沙箱。** 运行时把 JAR 与类的状态放在 IndexedDB 里，
  浏览器不会把 IndexedDB 暴露给不透明源的沙箱，所以 JAR 以本站源的权限执行。
  独立源（用自己的主机/端口只提供这些文件）能恢复那层隔离，是建议的后续工作；
  除了读 VM 的 canvas，适配层没有别的地方依赖同源。
- frame 保持在屏幕上、按 VM 的屏幕尺寸摆放，用 `opacity: 0` 隐藏。Chrome 会把
  它认为不可见的 frame 的定时器压到每秒约一次唤醒；正是这种压制让上一版运行时
  显得卡顿（实测：启动 18 秒、解释器利用率约 1%，都靠让 frame 保持可见修好）。
- 播放器显示的是适配层自己拥有的 canvas，由一个短 `setTimeout` 循环从运行时的
  canvas 镜像过来，这样播放器 UI、全屏与截图都还在同一个元素上工作。父页面刻意
  不用 `requestAnimationFrame` 做这个镜像：Chromium 的父页面 RAF 与 J2meJS 的
  嵌套 RAF 循环会在这个游戏的加载界面触发运行时的分配器损坏。定时器路径避开了
  那个只在桌面出现的卡死，同时保留移动端既有行为。
- 按键直接走 `MIDP.sendKeyPress/sendKeyRelease`，用下面的手机键盘码。非 1 的
  `player` 会被忽略，而 J2ME 是单人平台（见 `PLATFORM_SINGLE_PLAYER`），所以
  房间只给 P1 一个座位。

| 应用按钮 | 手机键 | 键码 | PC 键盘默认 |
| --- | --- | --- | --- |
| 上 / 下 / 左 / 右 | 方向键（导航键） | -1 / -2 / -3 / -4 | W / S / A / D |
| x / a / y / b | 1 / 3 / 7 / 9 | 49 / 51 / 55 / 57 | 小键盘 1 / 3 / 7 / 9 |
| l2 | 5（确定） | 53 | 小键盘 5 |
| r2 | 0 | 48 | 小键盘 0 |
| l / r | * / # | 42 / 35 | 小键盘 . / 小键盘回车 |
| select / start | 左 / 右软键 | -6 / -7 | 回车 / 右 Shift |

方向键发送的是 MIDP 的导航键码（`Canvas.KEY_UP/DOWN/LEFT/RIGHT`），这是带方向
键的手机所上报的、也是键盘时代的 MIDlet 在 `keyPressed` 里用来比较的（下面的
例子在同样的分支里同时检查 `-1`/`50` 与 `-2`/`56`，所以两种约定它都认）。面板
键与肩键保持在手机键盘上，它们的标签就是 PC 键盘设置里显示的文字 —— 而默认
键位把它们摆在数字小键盘上同样数字的那几颗键上（`keyboardProfiles.js` 的
`J2ME_KEYBOARD`，与街机 / MD 的变体并列），0 旁边那颗 `.` 是 `*`、小键盘回车
是 `#`，两块软键在主回车与右 Shift 上，十字留在 WASD。触摸手柄上，
左手摇杆换成手机自己的**十字键**：四个不规则五边形（一条矩形臂加中心三角）拼成
一个宽高相等的无缝十字，一个方向一块，没有中心按钮 —— 手机键盘的中心键
（5 / MIDP FIRE，retropad 的 `l2`）已经在肩键那一行，写作「5 确定」（PC 键盘上
就是小键盘 5）。玩家自己改过键就整份保留，改过的键照旧经前端换算成上面这套运行
期键位再送进适配层。

只有从不看原始键码的 MIDlet 能区分这些约定：它们问 `getGameAction()` /
`GameCanvas.getKeyStates()`，而这个构建产物的 `KeyConverter` 丢掉了 MIDP
游戏动作表里的键盘那一半，于是键盘键码（5、1/3/7/9）产生的动作是空的。站点
补丁恢复了那张表（2/4/6/8 → UP/LEFT/RIGHT/DOWN、5 → FIRE、1/3/7/9 →
GAME_A..GAME_D —— 导航键码本来就在），并把反向表（`getKeyCode`）指向本播放器
实际发送的键码，这也正是 MIDP 对它定义的行为。

## Java 存档（RMS）上云

MIDP 唯一的持久化机制是 RMS（`javax.microedition.rms.RecordStore`），而这个
运行时把它存成自己那套 IndexedDB 文件系统里 `/RecordStore/...` 下的文件。这套
文件系统的两个性质决定了设计：它按**源**分，而不是按游戏 —— 下一个 J2ME 游戏
启动时，上一个游戏的记录还在，MIDlet 读它们不需要问任何人；而且它住在隐藏的
frame 里，所以只有那个 frame 能碰它。

`rms.js`（像 `lcdui.js` 一样在运行时之后加载）让那棵树充当「该 ROM 对应该用户的
存档文件」：

- **在 MIDlet 运行之前恢复。** 适配层把云快照作为 `save` 参数里的 `blob:` URL
  交给 frame（`none` = 已登录但没有存档 → 清空那棵树；参数缺失 = 未登录 → 完全
  不动那棵树）。`rms.js` 往运行时自己的 `loadingPromises` 数组里推一个 promise，
  `window.onload` 会在启动 VM 之前 await 它，并且只在 `initFS` 打开文件系统之后
  才发起抓取。因此 MIDlet 在它第一次 `RecordStore.openRecordStore` 时就能看到云
  存档。8 秒超时与父页面侧 4 秒超时保证这道闸门会用当时能拿到的东西放行，所以
  网络慢或坏只会拖延启动，绝不阻塞它。
- **快照格式。** `{"v":1,"at":<ms>,"files":[{"p":"/RecordStore/…","m":<mtime>,"d":"<base64>"}]}`
  —— 刻意不用运行时自己的 `store.export`，后者转储整个文件系统并在导入时
  **清空数据库**。恢复会删掉快照里没有的记录，所以一个游戏的记录永远不会漏进
  另一个游戏。
- **自动存档。** `rms.js` 包住三个会改动记录的原生实现
  （`RecordStoreFile.commitWrite`、`truncateFile`、`RecordStoreUtil.deleteFile`），
  并向播放器发 `j2me-rms-dirty`，防抖 800 ms。适配层再防抖一次（1.2 s），从
  frame 取一份快照，上传到 `/api/saves/:romId?slot=0` —— 也就是其它平台使用的
  同一套按用户的存档存储。暂停、`exit()`、`pagehide` 与标签页隐藏都会冲刷待发的
  改动；卸载路径要求 `keepalive`，`exit()` 会在拆掉 frame 之前读取快照（限时 1.5 秒）。
- **摘要只看记录内容。** 快照的 FNV-1a 摘要（`digest`）不包含任何时间戳：快照自己的
  `at`、每个文件的 mtime，以及记录集文件头里偏移 24 起的「最后写入时间」（运行时写的
  是 `System.currentTimeMillis()`，每次写入都变）都不参与。**开局恢复完成时，frame
  把恢复进来的那一份的摘要一并报给播放器**（`j2me-rms-restored` 的 `digest`），播放器
  当作「云端现在这一份」的基准。于是"游戏把同一份记录原样重写一遍"既不会上传，也不会
  弹「已自动存档」—— 而这种事很常见：不少 MIDlet 进菜单、过场、初始化状态机时就会把
  记录整体重写一遍（证据见下面「用探针验证过」）。
  读失败 / 超时（`failed` / `timeout`）不报 `digest`：那种情况下本地与云端各是什么都
  不知道，第一次改动照旧上传。摘要是 32 位 FNV-1a，只用来判断「和云端那一份是不是同
  一份」，不做完整性校验。
- **谁能用。** `useJ2meCloudSave.js` 只为已登录、非游客的玩家接上这套接口：
  单机会话与房主。游客与未登录玩家保持旧行为（记录随浏览器配置一起生灭）。每个
  用户对每个 ROM 有自己的存档；J2ME 的存/读按钮被隐藏，因为已经没有可按的东西
  —— 类库选择在开局对话框里（`J2meEngineDialog.vue`，三个引擎，按 ROM 记在
  `localStorage`）。

用探针验证过（`tests/j2me-rms-probe.mjs`，可选、不进 `npm test`）：它复制一份运行时、
往那份 `rms.js` 里塞一个把当前 Java 调用栈一起报上来的钩子，再用假的云存档接口驱动真实
适配层，所以每次写入都能看到是游戏自己的哪条路径干的：

```bash
J2ME_TEST_CHROME=/path/to/chrome node tests/j2me-rms-probe.mjs /path/game.jar /tmp/evidence
# 可选：J2ME_PROBE_SAVE=<快照文件>（模拟已有云存档）、J2ME_PROBE_KEYS=<按键序列>、
#       J2ME_PROBE_IDLE_MS=<按第一个键之前静置多久>
```

以「刺客骨肉分离」（ROM 205）为例，恢复用户自己的云存档后静置 18 秒、**不按任何键**：
游戏自己写了 8 次，栈是

```
h.a(I[B)V <- k.c(I)V <- k.c()V <- k.a()V <- k.b()V <- GameMIDlet.run()V
```

（`RmsProbeMidlet` 那种"只有一个探针 MIDlet"的用例不会出现写入；这条栈里没有一行是站点
的代码），而 `uploads` 里只有开局那次读取 —— 那 8 次只是把同一份记录原样重写一遍
（存储文件与恢复进去的云存档逐字节只差文件头里的写入时间）。归一化之前，这种空改动每次
都会传一份新快照并弹一次「已自动存档」，玩家看到的就是「一进菜单就替我存了一次档」。
把 `J2ME_PROBE_SAVE` 去掉（云端为空）再跑：同一次重写会上传 247 字节，正是「内容真的
变了才传」的另一半。

MIDlet 侧的读写接线用探针（`/tmp/lcdui-probe/rms-probe.mjs`，MIDlet 在
`RmsProbeMidlet.java`）验证过并走真实适配层：没有云存档的全新配置启动时是空的，MIDlet
写入一条记录，随后在没有任何按键的情况下到达两次上传（记录 + 之后的 `tick`）；
另一个只持有那份已上传快照的浏览器配置启动时是 `restore: loaded`，MIDlet 在 VM
启动前读回 `v1` —— 在 `enginemode2-classes2.jar` 下也一样，此时 frame 真的去取
`java/classes2.jar`。

## 已验证的行为（2026-10-14）

外置样本 `/www/wwwroot/default/GAME/J2ME/仙剑奇侠传.jar`（304 KB），在 Chromium
里走生产播放器入口：首帧在 **1.09 秒**后（上一版运行时：改完定时器问题约 2.0 秒，
在那之前约 18 秒），手机 **5** 键把标题画面推进游戏菜单，没有运行时错误。两种
运行时下菜单渲染一致（五列竖向条目）；那是游戏自己的布局，不是渲染缺陷。

移动端，在上述修复之后：同一个游戏、同一个播放器入口，在部署好的站点上以
**WebKit**（iOS Safari 与 iOS Edge 背后的引擎）驱动，用 iPhone user agent 与
触摸模拟 —— 约 6-8 秒启动到已绘制、可运行的会话，每一次运行时请求都带
`?v=<runtime version>`，运行时 frame 的定时器不受压制（600 ms 内 139 次
`setTimeout(…, 0)` tick，rAF 正常触发）。Chromium 开移动模拟约 5 秒启动。

固定用例浏览器测试（`tests/j2me-browser.test.js`）驱动 MIDlet 字节码、输入、
暂停/恢复、主类缺失处理、退出清理、frame 定时器守卫、带版本的 frame URL 以及
启动错误宽限期的两侧；`tests/j2me-runtime.test.js` 覆盖 ROM 校验与 manifest
读取，`tests/j2me-runtime-patches.test.js` 守住内置补丁与构建时的版本盖戳。
本次会话的真实游戏证据目录：`/tmp/j2mejs/integrated`、`/tmp/j2mejs/matrix`、
`/tmp/j2mejs/full`。

## 反模拟器检测：`Class.forName` 吞掉 `ClassNotFoundException`（2026-10-17 修复）

「丧尸危机 - 全城爆发」在开始游戏时显示「请在手机上运行游戏！」。这句话不是站点加
的，是游戏自己的反模拟器检查：游戏包内的 `data/config.bin`（jzy 资源包，
`needCopyRight=1`）写着

```
crack=XMessage,XConnection,emulator.Emulator,java.applet.Applet
```

开始游戏时 `f.a()` 会做三件事：

```java
if (配置里的 needCopyRight 为真) {
  String cr = Main.self.getAppProperty("copyRight");
  if (cr == null || !cr.equals("0")) {
    if (Runtime.getRuntime().totalMemory() == 8000000L) 判定失败; // 模拟器内存特征
    if (能加载 crack 列表里的任意一个类) 判定失败;              // 真机没有这些类
  }
}
```

第三项依赖 Java 的语义：真机上 `Class.forName("XMessage")` 找不到类，抛出
`java.lang.ClassNotFoundException`，游戏的 `catch` 接住后继续；全部探针都找不到才
放行。本站的运行时有两个问题，让每个探针看起来都「成功」：

1. `java/lang/Class.forName0`（`bld/main-all.js`）把类加载器的
   `J2ME.ClassNotFoundException` 标记吞掉后 `return`，Java 侧看不到异常；随后
   `classInitCheck(null)` 抛出的 `TypeError` 又被 `translateException` 转成
   `RuntimeException`，游戏只 `catch ClassNotFoundException`，根本接不到。
2. `classesold.jar` / `classes.jar` 里的 `java/lang/Class.forName` 还多了一条
   在 native 之前执行的短路：

   ```java
   if ("XMessage".equals(name)) return null;
   ```

   即使修好 native，`XMessage` 这个探针也永远到不了它。

修法分两层：

- 补丁 33 按 CLDC 的语义重写 `forName0` / `forName1`：空名字 →
  `NullPointerException`，找不到类 → `ClassNotFoundException`（用
  `$.newClassNotFoundException` 创建真正的 Java 异常），其他 JS 错误原样上抛。
  `forName0` 成功路径的加载、初始化与执行窗口让出保持原样。
- 补丁 34/35 把两个类库里的 `"XMessage"` 常量改成等长的非法类名 `"XMessag!"`。
  只改 UTF-8 常量、不改字节码长度，所以常量池索引、代码偏移、class 文件大小
  都不变；`j2me-classlib.mjs` 只重写 ZIP 里这一个 deflate 条目，其余条目逐字节
  保留（CRC 与中央目录同步更新）。

验证：`node frontend/scripts/apply-j2me-patches.mjs` 可重复执行；类库仍能通过
`unzip -t`，`javap -c java/lang/Class` 里 `Class.forName` 的比较对象已经是
`XMessag!`；`tests/j2me-runtime-patches.test.js` 守住 native 的异常路径与两个
类库的常量。ROM 自身的 `copyRight: 0` 补丁（上一轮的临时绕过）保留着，但即使
去掉它，现在也应该由运行时正确放行。

## 限制

- 只支持 `.jar`。JAD/JAM 是描述文件，`.sqc` 套件不支持。
- 没有 `DecompressionStream` / `deflate-raw` 的浏览器（较老的 Android WebView、
  部分应用内浏览器）无法预先检查：适配层只在能解压时才读 JAR manifest，否则把
  游戏直接交给运行时，由它用自己的 inflate 读 manifest。因此在这类浏览器上，
  无法启动的 JAR 会以启动超时告终，而不是给出一句可读的消息。
- 没有即时存档、没有回退、没有金手指：`saveState`/`loadState` 直接拒绝。J2ME
  没有状态快照；持久化的那一半是 RMS，它改为接到云上（见「Java 存档（RMS）上云」）。
- 对已登录玩家，RMS 存储与我们的云存档绑定：每个用户每个 ROM 一份，在 MIDlet
  启动前恢复，并随游戏写入上传（记录内容真的变了才传：游戏只是把同一份记录原样重写
  一遍不算改动，见上面「摘要只看记录内容」）。未登录玩家与房间访客的记录只留在这个
  浏览器里。
- 类库由玩家在开局对话框里选择（三个引擎，按 ROM 记忆）；需要 MIDP 2.0 特性的
  游戏从 `enginemode2-classes2.jar` 得到它们，不需要任何人去改 ROM。
- MIDP 高级界面（Form/List/Alert/Gauge/TextField）由 `lcdui.js` 画进 canvas，
  文本框在播放器于 canvas 之上打开的输入框里编辑；运行时自己的 DOM 对话框
  （短信验证、Nokia 文件选择器、下载失败）与它内置的触摸板仍留在隐藏的 frame
  里、始终不可见。这些路径很少见（各一处引用），只在 MIDlet 用到那个 API 时
  才会出现。
- `TextBox` 走的是同一个单行输入框，所以没法往里输入换行。
- J2ME 是单人平台：一个座位，除房主外任何人都没有房间控制权。
