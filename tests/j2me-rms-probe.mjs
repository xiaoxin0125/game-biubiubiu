// 可选的外部探针（不进 `npm test`）：观察某个真实 MIDlet 什么时候写 RMS，以及站点在这些
// 写入上做了什么。它把运行时复制一份到临时目录、往那份 rms.js 里塞一个"把当前 Java 调用栈
// 一起报上来"的诊断钩子，然后用一个假的云存档接口驱动真实适配层：
//
//   J2ME_TEST_CHROME=/path/to/chrome node tests/j2me-rms-probe.mjs /path/game.jar [输出目录]
//
// 环境变量：
//   J2ME_PROBE_SAVE      云端已有存档的快照文件（rms.js 的快照格式）；不传 = 这个用户还没有存档
//   J2ME_PROBE_KEYS      按顺序按下的键（默认 select,start,l2,r2,up,down,left,right,a）
//   J2ME_PROBE_IDLE_MS   按第一个键之前先静置多久（默认 20000；用来看游戏自己会不会写）
//
// 输出（默认 /tmp/j2me-rms-probe）：report.json（每次写入的 Java 栈 + 每次上传的快照）、
// 每个按键前后各一张画面。典型用法是回答"为什么一进菜单云端就多一份存档"：
// 如果写入栈里出现的是 MIDlet 自己的方法（`… <- k.c()V <- k.a()V <- GameMIDlet.run()V`），
// 那就是游戏自己在写记录，站点只是跟着游戏走。
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { tmpdir } from 'node:os'

const chromePath = process.env.J2ME_TEST_CHROME
assert.ok(chromePath, 'Set J2ME_TEST_CHROME to Chromium')
const romPath = process.argv[2]
assert.ok(romPath, 'Pass a legally available external JAR path')
const out = path.resolve(process.argv[3] || '/tmp/j2me-rms-probe')
const frontendRoot = path.resolve(fileURLToPath(new URL('../frontend/', import.meta.url)))
const runtimeSource = path.join(frontendRoot, 'public', 'j2me')
const repo = path.dirname(frontendRoot)
const keys = (process.env.J2ME_PROBE_KEYS || 'select,start,l2,r2,up,down,left,right,a').split(',').filter(Boolean)
const idleMs = Number(process.env.J2ME_PROBE_IDLE_MS || 20000)
const httpPort = Number(process.env.J2ME_TEST_HTTP_PORT || 4396)
const debugPort = Number(process.env.J2ME_TEST_DEBUG_PORT || 9336)
const origin = 'http://127.0.0.1:' + httpPort

// 诊断钩子：包住写记录的那几个原生实现，把解释器的 Java 帧抓成一行（与 fillInStackTrace
// 走同一套帧游标，只是取完名字就还原）。插进的是复制出来的那份运行时，不是仓库里的文件。
const STACK_HOOK = `
  function reportWrite(signature) {
    var stack = '(no runtime ctx)';
    try {
      if (typeof $ !== 'undefined' && $ && $.ctx && $.ctx.nativeThread) {
        var frame = $.ctx.nativeThread.frame, tp = $.ctx.nativeThread.tp;
        var fp = frame.fp, sp = frame.sp, pc = frame.pc, out = [], guard = 0;
        while (frame.fp !== (tp >> 2) && guard++ < 40) {
          try {
            var mi = frame.methodInfo;
            out.push(mi ? (mi.classInfo.getClassNameSlow() + '.' + mi.name + mi.signature) : ('<frame ' + frame.type + '>'));
          } catch (e) { out.push('<frame?>'); }
          frame.set(frame.thread, i32[frame.fp + 1], frame.fp + frame.parameterOffset, i32[frame.fp + 0]);
        }
        frame.fp = fp; frame.sp = sp; frame.pc = pc;
        stack = out.join(' <- ');
      }
    } catch (error) { stack = '(stack error: ' + error + ')'; }
    try { console.log('[rms-write] ' + signature + ' :: ' + stack); } catch (error) {}
    post({ type: 'j2me-rms-write', signature: signature, stack: stack, at: Date.now() });
  }
`
const hooksNative = `      var wrapped = function () {
        var result = native.apply(this, arguments)
        markDirty()`
const reportsNative = `      var wrapped = function () {
        var result = native.apply(this, arguments)
        reportWrite(signature)
        markDirty()`

const buildDir = await mkdtemp(path.join(tmpdir(), 'j2me-rms-build-'))
const runtimeDir = path.join(buildDir, 'runtime')
await cp(runtimeSource, runtimeDir, { recursive: true })
const rmsSource = await readFile(path.join(runtimeDir, 'rms.js'), 'utf8')
assert.ok(rmsSource.includes(hooksNative), 'rms.js 的写入包装变了，请同步这个探针')
assert.ok(rmsSource.includes('  function markDirty() {'), 'rms.js 里没有 markDirty()')
await writeFile(
  path.join(runtimeDir, 'rms.js'),
  rmsSource.replace(hooksNative, reportsNative).replace('  function markDirty() {', STACK_HOOK + '\n  function markDirty() {'),
)

const bytes = await readFile(romPath)
const saveText = process.env.J2ME_PROBE_SAVE ? await readFile(process.env.J2ME_PROBE_SAVE, 'utf8') : null
await mkdir(out, { recursive: true })

const page = `<!doctype html><script>window.__saveText=${JSON.stringify(saveText)}</script>
<meta charset="utf-8"><style>canvas{width:240px;height:320px;image-rendering:pixelated;background:#ddd}</style>
<div id="host"></div>
<script type="importmap">{"imports":{"vue":"/node_modules/vue/dist/vue.esm-browser.js","nostalgist":"/node_modules/nostalgist/dist/nostalgist.js"}}</script>
<script type="module">
import {prepareJ2me} from '/src/composables/player/j2meRuntime.js';
window.events=[];window.uploads=[];window.errors=[];
addEventListener('message',(e)=>{const d=e.data;if(!d)return;
  if(d.type==='j2me-rms-write')window.events.push(d);
  if(d.type==='j2me-rms-restored')window.events.push({restore:d.status&&d.status.restore,digest:d.digest,at:Date.now()});
  if(d.type==='j2me-error')window.errors.push(d.message)});
window.boot=async()=>{
  window.emu=await prepareJ2me({rom:{fileName:'game.jar',fileContent:'/game.jar'},
    cloudSave:{load:async()=>{window.uploads.push({phase:'load',at:Date.now()});return window.__saveText?new Blob([window.__saveText]):null},
      save:async(blob)=>{window.uploads.push({phase:'save',at:Date.now(),bytes:blob.size,text:await blob.text()})}}});
  document.getElementById('host').append(emu.getCanvas());
  await emu.start();
  return {status:emu.getStatus(),rms:emu.getRmsStatus()};
};
window.key=(name,down)=>emu[down?'pressDown':'pressUp']({button:name});
window.sample=()=>{const c=emu.getCanvas(),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let opaque=0,hash=2166136261;
  for(let i=0;i<p.length;i+=4){if(p[i+3])opaque++;for(let j=0;j<4;j++)hash=Math.imul(hash^p[i+j],16777619)}
  return {state:emu.getStatus().state,opaque,hash:hash>>>0}};
window.dump=()=>({events:window.events,uploads:window.uploads,errors:window.errors});
</script>`

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, origin).pathname
    if (pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page); return }
    if (pathname === '/game.jar') { res.end(bytes); return }
    let file
    if (/^\/(node_modules\/(vue|nostalgist)\/dist|shared\/registry)\/[\w/.-]+\.js$/.test(pathname)) {
      file = path.resolve(repo, '.' + pathname)
      if (!file.startsWith(repo + path.sep)) throw new Error('invalid path')
    } else if (pathname.startsWith('/j2me/')) {
      file = path.resolve(runtimeDir, '.' + pathname.replace(/^\/j2me/, ''))
      if (!file.startsWith(runtimeDir + path.sep)) throw new Error('invalid path')
    } else if (pathname.startsWith('/src/')) {
      file = path.resolve(frontendRoot, '.' + pathname)
      if (!file.startsWith(frontendRoot + path.sep)) throw new Error('invalid path')
    } else throw new Error('not found')
    res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream')
    res.end(await readFile(file))
  } catch (error) { res.statusCode = 404; res.end(error.message) }
})
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(httpPort, '127.0.0.1', resolve) })

const profile = await mkdtemp(path.join(tmpdir(), 'j2me-rms-chrome-'))
const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--remote-debugging-port=' + debugPort, 'about:blank'], { stdio: 'ignore' })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const logs = []
const report = { romPath, saveText: saveText ? process.env.J2ME_PROBE_SAVE : null, boot: null, idle: null, keys: [], uploads: [], errors: [] }
let ws
try {
  let target
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find((t) => t.type === 'page' && t.url === 'about:blank'); if (target) break } catch {}
    await delay(100)
  }
  assert.ok(target, 'No Chromium target')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  let next = 0
  const pending = new Map()
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 60000)
    pending.set(id, (message) => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result) })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); return }
    if (message.method === 'Target.attachedToTarget') send('Runtime.enable', {}, message.params.sessionId).catch(() => {})
    if (message.method === 'Runtime.consoleAPICalled') logs.push({ level: message.params.type, text: message.params.args.map((a) => a.value ?? a.description).join(' ') })
    // 页面/帧里没被接住的异常也要留下来：模块加载失败、运行时错误都靠它。
    if (message.method === 'Runtime.exceptionThrown') logs.push({ exception: message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text })
  }
  await send('Runtime.enable')
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await send('Page.navigate', { url: origin })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 600))
    return result.result?.value
  }
  for (let i = 0; i < 50 && !(await evaluate('typeof boot === "function"')); i++) await delay(100)
  const shot = async (name) => {
    const data = await evaluate('emu.getCanvas().toDataURL()')
    await writeFile(path.join(out, name + '.png'), Buffer.from(data.split(',')[1], 'base64'))
  }

  report.boot = await evaluate('boot()')
  assert.equal(report.boot.status.state, 'running', 'game must keep running')
  console.log('boot:', JSON.stringify(report.boot))

  // 静置：这一段没有任何输入，能看出游戏自己会不会写记录（很多游戏进标题/过场就写）。
  const seen = (dump) => dump.events.filter((event) => event.signature).length
  await delay(idleMs)
  await shot('00-idle')
  let dump = await evaluate('dump()')
  report.idle = { keys: 0, writes: seen(dump), stacks: [...new Set(dump.events.filter((event) => event.signature).map((event) => gameFrames(event.stack)))] }
  report.uploads = dump.uploads
  console.log('idle', idleMs + 'ms:', JSON.stringify(report.idle), 'uploads:', dump.uploads.length)

  let handled = 0
  for (const key of keys) {
    handled = dump.events.length
    const before = await evaluate('sample()')
    const pressAt = Date.now()
    await evaluate(`key(${JSON.stringify(key)}, true)`)
    await delay(220)
    await evaluate(`key(${JSON.stringify(key)}, false)`)
    await delay(4200)
    const after = await evaluate('sample()')
    const fresh = dump.events.slice(handled)
    dump = await evaluate('dump()')
    const writes = fresh.filter((event) => event.signature)
    const entry = {
      key,
      changed: before.hash !== after.hash,
      writes: writes.length,
      writeSpanMs: writes.length ? writes[writes.length - 1].at - writes[0].at : 0,
      firstWriteMs: writes.length ? writes[0].at - pressAt : null,
      stacks: [...new Set(writes.map((event) => gameFrames(event.stack)))],
    }
    report.keys.push(entry)
    report.uploads = dump.uploads
    report.errors = dump.errors
    console.log('key:', JSON.stringify(entry))
    await shot(String(report.keys.length).padStart(2, '0') + '-' + key)
  }

  const finalDump = await evaluate('dump()')
  report.uploads = finalDump.uploads
  report.errors = finalDump.errors
  for (const upload of report.uploads) {
    console.log('upload', upload.phase, upload.bytes ?? '', JSON.stringify((upload.text || '').slice(0, 200)))
  }
  assert.equal(report.errors.length, 0, 'no runtime errors expected')
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ ...report, logs }, null, 2))
  ws?.close()
  chrome.kill('SIGTERM')
  await new Promise((resolve) => (chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve)))
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(profile, { recursive: true, force: true, maxRetries: 3 })
  await rm(buildDir, { recursive: true, force: true, maxRetries: 3 })
}
console.log('Evidence: ' + out)

/** 只留 MIDlet 自己的帧：原生/解释器标记与 JDK 内部帧对读日志的人没有意义。 */
function gameFrames(stack) {
  return (stack || '').split(' <- ').filter((frame) => /^(?!<frame)[\w$./]+\./.test(frame)
    && !/^(com\/sun|java\/|javax\/microedition|org\/mozilla|com\/nokia|com\/samsung)/.test(frame)).slice(0, 6).join(' <- ')
}
