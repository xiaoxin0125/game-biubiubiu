// 圆弧几何探针（可选的外部装置，不进 `npm test`）：
//
//   J2ME_TEST_CHROME=/path/to/chrome node tests/j2me-arc-probe.mjs [输出目录]
//
// 「蹦球传说」的主角球是用一串 fillArc 画的高光。上游把包围盒的左上角当成椭圆圆心
// （fillArc 还把它当成扇形顶点），整颗球于是被画成一坨压在画面上的红白怪块。这个探针
// 自带一个只画圆弧的 MIDlet（不需要任何商业 ROM）：15 格分别覆盖正角、负角、跨 0 度、
// 整圆、空角与 drawArc，然后按 MIDP 的定义逐点核对每一格的像素 ——
// 半径 7 / 15 处（每 5 度采样、跳过贴着扇形边界的点）必须在扇形内，
// 半径 25 处必须留白，描边的曲线上的点必须是黑线。
//
// 它同时验证两件事：圆心在包围盒正中（否则整块图形会偏移半个包围盒），以及扫过的
// 方向与 |arcAngle| >= 360 的处理（否则负角度会绕另一个方向 270 度）。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

const chromePath = process.env.J2ME_TEST_CHROME
assert.ok(chromePath, 'Set J2ME_TEST_CHROME to Chromium')
const out = path.resolve(process.argv[2] || '/tmp/j2me-arc-probe')
const frontendRoot = path.resolve(fileURLToPath(new URL('../frontend/', import.meta.url)))
const runtimeDir = path.resolve(process.env.J2ME_TEST_RUNTIME_DIR || path.join(frontendRoot, 'public/j2me'))
const httpPort = Number(process.env.J2ME_TEST_HTTP_PORT || 4399)
const debugPort = Number(process.env.J2ME_TEST_DEBUG_PORT || 9339)
const origin = `http://127.0.0.1:${httpPort}`

// 每一格：60x60 的格子，包围盒 40x40 居中（圆心 = 格心 = 格内 +30,+30），半径 20。
const CELLS = [
  { col: 0, row: 0, start: 0, arc: 90, color: 0x00ff0000, kind: 'fill' },
  { col: 1, row: 0, start: 90, arc: 90, color: 0x0000a000, kind: 'fill' },
  { col: 2, row: 0, start: 0, arc: -90, color: 0x000000ff, kind: 'fill' },
  { col: 3, row: 0, start: 0, arc: 360, color: 0x00ff00ff, kind: 'fill' },
  { col: 0, row: 1, start: 45, arc: 90, color: 0x0000ffff, kind: 'fill' },
  { col: 1, row: 1, start: 0, arc: 180, color: 0x00800000, kind: 'fill' },
  { col: 2, row: 1, start: 270, arc: 180, color: 0x00008000, kind: 'fill' },
  { col: 3, row: 1, start: 0, arc: 0, color: 0x00000000, kind: 'empty' },
  { col: 0, row: 2, start: -45, arc: 90, color: 0x00808000, kind: 'fill' },
  { col: 1, row: 2, start: 200, arc: 90, color: 0x00800080, kind: 'fill' },
  { col: 2, row: 2, start: 0, arc: -270, color: 0x00004040, kind: 'fill' },
  { col: 3, row: 2, start: 30, arc: 300, color: 0x00404000, kind: 'fill' },
  { col: 0, row: 3, start: 0, arc: 90, kind: 'stroke' },
  { col: 1, row: 3, start: 0, arc: -90, kind: 'stroke' },
  { col: 2, row: 3, start: 90, arc: 180, kind: 'stroke' },
]

const white = 0x00ffffff
const norm = (value) => ((value % 360) + 360) % 360
// MIDP：角度以度计，0 = 3 点钟方向，正方向为逆时针（屏幕 y 轴向下）。
const inSector = (start, arc, theta) =>
  Math.abs(arc) >= 360 ? true : arc === 0 ? false : arc > 0 ? norm(theta - start) <= arc : norm(start - theta) <= -arc
const at = (cx, cy, radius, theta) => [
  Math.round(cx + radius * Math.cos((theta * Math.PI) / 180)),
  Math.round(cy - radius * Math.sin((theta * Math.PI) / 180)),
]

// 采样点：填色格的扇形内（必须着色）、圆外（必须留白）；描边格的曲线上（必须有线）。
const probes = []
for (const cell of CELLS) {
  const cx = cell.col * 60 + 30
  const cy = cell.row * 60 + 30
  if (cell.kind === 'stroke') {
    const steps = Math.max(2, Math.round(Math.abs(cell.arc) / 5))
    for (let i = 1; i < steps; i++) {
      const [x, y] = at(cx, cy, 20, cell.start + (cell.arc * i) / steps)
      probes.push({ cell, x, y, expect: 'curve' })
    }
    continue
  }
  const expected = cell.kind === 'empty' ? white : cell.color
  const signedDelta = (a, b) => {
    const delta = norm(a - b)
    return delta > 180 ? delta - 360 : delta
  }
  // 采样点离扇形两条边界射线的像素距离：小于 1.6 像素的点会被画布的抗锯齿混色
  // （真机不抗锯齿），既不能算「在扇形里」也不能算「在扇形外」，直接跳过。
  const edgeDistance = (theta, radius) => {
    if (Math.abs(cell.arc) >= 360) return Infinity
    const toStart = Math.abs(radius * Math.sin((signedDelta(theta, cell.start) * Math.PI) / 180))
    const toEnd = Math.abs(radius * Math.sin((signedDelta(theta, cell.start + cell.arc) * Math.PI) / 180))
    return Math.min(toStart, toEnd)
  }
  for (let theta = 0; theta < 360; theta += 5) {
    const inside = inSector(cell.start, cell.arc, theta) ? expected : white
    for (const radius of [7, 15]) {
      if (edgeDistance(theta, radius) < 1.6) continue
      const [x, y] = at(cx, cy, radius, theta)
      probes.push({ cell, x, y, expect: inside })
    }
    if (edgeDistance(theta, 25) < 1.6) continue
    const [ox, oy] = at(cx, cy, 25, theta)
    if (ox >= 0 && oy >= 0 && ox < 240 && oy < 320) probes.push({ cell, x: ox, y: oy, expect: white })
  }
}

const midletSource = `import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.*;

public class ArcProbeMidlet extends MIDlet {
  public void startApp() {
    Display.getDisplay(this).setCurrent(new Probe());
  }
  public void pauseApp() {}
  public void destroyApp(boolean unconditional) {}

  static class Probe extends Canvas {
    protected void paint(Graphics g) {
      g.setColor(0xFFFFFF);
      g.fillRect(0, 0, getWidth(), getHeight());
      // 每格 60x60：包围盒 40x40 居中，圆心在格中心（格内 +30,+30），半径 20。
      fill(g, 0, 0, 0, 90, 0xFF0000);        // 0..90（右上，MIDP 逆时针）
      fill(g, 60, 0, 90, 90, 0x00A000);      // 90..180（左上）
      fill(g, 120, 0, 0, -90, 0x0000FF);     // 负角：0..-90（右下）
      fill(g, 180, 0, 0, 360, 0xFF00FF);     // 整圆
      fill(g, 0, 60, 45, 90, 0x00FFFF);      // 45..135（正上）
      fill(g, 60, 60, 0, 180, 0x800000);     // 上半圆
      fill(g, 120, 60, 270, 180, 0x008000);  // 270..90（右半）
      fill(g, 180, 60, 0, 0, 0x000000);      // 空：什么都不该画
      fill(g, 0, 120, -45, 90, 0x808000);    // -45..45（正右）
      fill(g, 60, 120, 200, 90, 0x800080);   // 跨 0 度：200..290
      fill(g, 120, 120, 0, -270, 0x004040);  // 负大角
      fill(g, 180, 120, 30, 300, 0x404000);  // 300 度
      arc(g, 0, 180, 0, 90, 0x000000);       // drawArc 0..90
      arc(g, 60, 180, 0, -90, 0x000000);     // drawArc 0..-90
      arc(g, 120, 180, 90, 180, 0x000000);   // drawArc 90..270
    }

    private void fill(Graphics g, int cx, int cy, int start, int arc, int color) {
      g.setColor(color);
      g.fillArc(cx + 10, cy + 10, 40, 40, start, arc);
    }

    private void arc(Graphics g, int cx, int cy, int start, int arc, int color) {
      g.setColor(color);
      g.drawArc(cx + 10, cy + 10, 40, 40, start, arc);
    }
  }
}
`

function buildProbeJar(buildDir) {
  // 编译期的类库就用运行时自带的那份（CLDC/MIDP 的类都在里面）。
  const classLibrary = path.join(runtimeDir, 'java/classesold.jar')
  const manifest = [
    'Manifest-Version: 1.0',
    'MIDlet-1: ArcProbe, , ArcProbeMidlet',
    'MIDlet-Name: ArcProbe',
    'MIDlet-Version: 1.0',
    'MIDlet-Vendor: probe',
    'MicroEdition-Configuration: CLDC-1.0',
    'MicroEdition-Profile: MIDP-1.0',
    '',
  ].join('\n')
  const classesDir = path.join(buildDir, 'classes')
  mkdirSync(classesDir, { recursive: true })
  writeFileSync(path.join(buildDir, 'ArcProbeMidlet.java'), midletSource)
  writeFileSync(path.join(buildDir, 'MANIFEST.MF'), manifest)
  let javac = 'javac'
  try {
    execFileSync(javac, ['-version'], { stdio: 'ignore' })
  } catch (error) {
    assert.fail('这个探针要用 JDK 的 javac 现编一个 MIDlet：' + error.message)
  }
  execFileSync(javac, ['-nowarn', '-source', '8', '-target', '8', '-bootclasspath', classLibrary, '-d', classesDir, path.join(buildDir, 'ArcProbeMidlet.java')], { stdio: 'inherit' })
  execFileSync('jar', ['cfm', path.join(buildDir, 'arc-probe.jar'), path.join(buildDir, 'MANIFEST.MF'), '-C', classesDir, '.'], { stdio: 'inherit' })
  return path.join(buildDir, 'arc-probe.jar')
}

const page = `<!doctype html><meta charset="utf-8"><style>canvas{image-rendering:pixelated;background:#ddd}</style>
<div id="host"></div>
<script type="importmap">{"imports":{"vue":"/node_modules/vue/dist/vue.esm-browser.js","nostalgist":"/node_modules/nostalgist/dist/nostalgist.js"}}</script>
<script type="module">
import {prepareJ2me} from '/src/composables/player/j2meRuntime.js';
window.emu=null;
window.boot=async()=>{
  window.emu=await prepareJ2me({rom:{fileName:'arc-probe.jar',fileContent:'/probe.jar'}});
  document.getElementById('host').append(emu.getCanvas());
  await emu.start();
  return {status:emu.getStatus(),width:emu.getCanvas().width,height:emu.getCanvas().height};
};
window.pixels=(points)=>{
  const ctx=emu.getCanvas().getContext('2d');
  return points.map(([x,y])=>{const d=ctx.getImageData(x,y,1,1).data;return (d[0]<<16)|(d[1]<<8)|d[2]});
};
</script>`

await mkdir(out, { recursive: true })
const buildDir = await mkdtemp(path.join(tmpdir(), 'j2me-arc-build-'))
const jarPath = buildProbeJar(buildDir)
const jarBytes = await readFile(jarPath)

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, origin).pathname
    if (pathname === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(page)
      return
    }
    if (pathname === '/probe.jar') {
      res.end(jarBytes)
      return
    }
    let file
    if (/^\/node_modules\/(vue|nostalgist)\/dist\/[\w/.-]+\.js$/.test(pathname)) {
      file = path.resolve(frontendRoot, '.' + pathname)
      if (!file.startsWith(frontendRoot + path.sep)) throw new Error('invalid path')
    } else {
      if (!pathname.startsWith('/j2me/') && !pathname.startsWith('/src/')) throw new Error('not found')
      file = pathname.startsWith('/j2me/')
        ? path.resolve(runtimeDir, '.' + pathname.replace(/^\/j2me/, ''))
        : path.resolve(frontendRoot, '.' + pathname)
      if (!file.startsWith(runtimeDir + path.sep) && !file.startsWith(frontendRoot + path.sep)) throw new Error('invalid path')
    }
    res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream')
    res.end(await readFile(file))
  } catch (error) {
    res.statusCode = 404
    res.end(error.message)
  }
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(httpPort, '127.0.0.1', resolve)
})

const profile = await mkdtemp(path.join(tmpdir(), 'j2me-arc-chrome-'))
const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--remote-debugging-port=' + debugPort, 'about:blank'], { stdio: 'ignore' })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let ws, send
let summary = null
try {
  let target
  for (let i = 0; i < 100; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((tab) => tab.type === 'page' && tab.url === 'about:blank')
      if (target) break
    } catch {}
    await delay(100)
  }
  assert.ok(target, 'No Chromium target')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  let next = 0
  const pending = new Map()
  send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++next
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error('CDP timeout: ' + method))
      }, 45000)
      pending.set(id, (message) => {
        clearTimeout(timeout)
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
      })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
      return
    }
    if (message.method === 'Target.attachedToTarget') send('Runtime.enable', {}, message.params.sessionId).catch(() => {})
  }
  await send('Runtime.enable')
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await send('Page.navigate', { url: origin })
  const evaluate = async (expression, timeoutMs = 15000) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, undefined, timeoutMs)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800))
    return result.result?.value
  }
  for (let i = 0; i < 50 && !(await evaluate('typeof boot === "function"')); i++) await delay(100)
  const boot = await evaluate('boot()')
  assert.equal(boot.status.state, 'running', `probe MIDlet must keep running, got ${JSON.stringify(boot.status)}`)
  await delay(2500)
  const shot = await send('Page.captureScreenshot')
  await writeFile(path.join(out, 'arcs.png'), Buffer.from(shot.data, 'base64'))
  const canvasImage = await evaluate('emu.getCanvas().toDataURL()')
  await writeFile(path.join(out, 'arcs-canvas.png'), Buffer.from(canvasImage.split(',')[1], 'base64'))

  // 一次把需要的像素全取回来：填色/留白的采样点要它自己，描边的采样点要它和它的
  // 四个邻居（描边只有 1 像素宽，采样点落在相邻像素上也算命中）。
  const wanted = []
  const slot = new Map()
  const indexOf = (x, y) => {
    const key = `${x},${y}`
    if (!slot.has(key)) {
      slot.set(key, wanted.length)
      wanted.push([x, y])
    }
    return slot.get(key)
  }
  for (const probe of probes) {
    if (probe.expect === 'curve') {
      probe.neighbours = [[probe.x, probe.y], [probe.x + 1, probe.y], [probe.x - 1, probe.y], [probe.x, probe.y + 1], [probe.x, probe.y - 1]].map(([x, y]) => indexOf(x, y))
    } else {
      probe.slot = indexOf(probe.x, probe.y)
    }
  }
  const values = await evaluate(`pixels(${JSON.stringify(wanted)})`, 30000)
  assert.equal(values.length, wanted.length, 'canvas 没有返回全部采样点')

  const channel = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  const close = (a, b, tolerance) => channel(a).every((part, index) => Math.abs(part - channel(b)[index]) <= tolerance)
  const describe = (cell) => `格(${cell.col},${cell.row}) ${cell.kind} ${cell.start}..${cell.start + cell.arc}`
  const mismatches = []
  for (const probe of probes) {
    if (probe.expect === 'curve') {
      const values_ = probe.neighbours.map((position) => values[position])
      if (!values_.some((value) => value < 0x00808080)) mismatches.push({ ...probe, got: values_[0], note: '曲线上没有线' })
      continue
    }
    const got = values[probe.slot]
    if (!close(got, probe.expect, 40)) mismatches.push({ ...probe, got })
  }
  summary = { probes: probes.length, mismatches: mismatches.length, samples: mismatches.slice(0, 8).map((probe) => `${describe(probe.cell)} x=${probe.x} y=${probe.y} 期望 ${probe.expect.toString(16)} 实际 ${probe.got.toString(16)}`) }
  console.log(JSON.stringify(summary, null, 1))
  // 抗锯齿在扇形顶点上会让一两个采样点偏淡；整块图形偏移半个包围盒或绕反方向会
  // 一次打掉几百个点，所以容忍度为个位数就已经很灵敏。
  assert.ok(mismatches.length <= 4, `${mismatches.length}/${probes.length} 个采样点不符合 MIDP 的圆弧定义`)
} finally {
  await writeFile(path.join(out, 'arc-probe.json'), JSON.stringify(summary, null, 2))
  ws?.close()
  chrome.kill('SIGTERM')
  await new Promise((resolve) => (chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve)))
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(profile, { recursive: true, force: true, maxRetries: 3 })
  await rm(buildDir, { recursive: true, force: true, maxRetries: 3 })
}
console.log('Evidence: ' + out)
