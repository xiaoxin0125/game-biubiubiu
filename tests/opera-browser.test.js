// Optional integration test. Supply legally obtained CHD/BIOS files yourself:
// OPERA_TEST_CHROME=/path/to/chrome OPERA_TEST_ROM=/path/to/game.chd node --test tests/opera-browser.test.js
// OPERA_TEST_CORE_DIR may point to a fresh RetroArch build (opera_libretro.js/wasm).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const chromePath = process.env.OPERA_TEST_CHROME
const romPath = process.env.OPERA_TEST_ROM
const romUrl = process.env.OPERA_TEST_ROM_URL
const enabled = !!(chromePath && (romPath || romUrl))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const page = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#171717}canvas{width:640px;height:480px}</style>
<script type="importmap">{"imports":{"nostalgist":"/node_modules/nostalgist/dist/nostalgist.js","vue":"/node_modules/vue/dist/vue.esm-browser.js"}}</script>
<script type="module">
import { prepareEmulator } from '/frontend/src/composables/nostalgist.js';
import { buildPlatformCoreOptions } from '/frontend/src/data/config.js';
import { buildPlayerRetroarchConfig } from '/frontend/src/composables/input/retroarchConfig.js';
import { getPlatform } from '/frontend/src/constants/platforms.js';
window.result = { stage: 'preparing' };
window.addEventListener('error', e => { result = { stage: 'failed', error: e.error?.stack || e.message } });
window.addEventListener('unhandledrejection', e => { result = { stage: 'failed', error: e.reason?.stack || String(e.reason) } });
try {
  window.emu = await prepareEmulator({
    core: { name: 'opera', js: { fileName: 'opera_libretro.js', fileContent: '/core/opera.js' }, wasm: { fileName: 'opera_libretro.wasm', fileContent: '/core/opera.wasm' } },
    rom: { fileName: 'test.chd', fileContent: '/game.chd' },
    bios: ['panafz1j.bin', 'panafz1j-kanji.bin'].map(fileName => ({ fileName, fileContent: '/bios/' + fileName })),
    retroarchConfig: { ...buildPlayerRetroarchConfig(null, getPlatform('3do').buttons), log_verbosity: true, log_to_file: false },
    retroarchCoreConfig: buildPlatformCoreOptions({ platform: '3do', core: 'opera' }),
  });
  document.body.append(emu.getCanvas());
  result.stage = 'starting';
  await emu.start();
  result = { stage: 'running', canvas: { width: emu.getCanvas().width, height: emu.getCanvas().height }, resizeExport: typeof emu.getEmscripten().Module.setCanvasSize };
} catch (e) { result = { stage: 'failed', error: e.stack || String(e) } }
</script>`

test('Opera boots a real CHD through the production adapter with audio and rewind defaults', { skip: !enabled, timeout: 240000 }, async () => {
  const coreDir = process.env.OPERA_TEST_CORE_DIR || path.join(root, 'data/cores')
  const built = !!process.env.OPERA_TEST_CORE_DIR
  const biosDir = process.env.OPERA_TEST_BIOS_DIR || path.join(root, 'data/bios/3do')
  const rom = romPath ? await readFile(romPath) : Buffer.from(await (await fetch(romUrl, { signal: AbortSignal.timeout(180000) })).arrayBuffer())
  assert.equal(rom.subarray(0, 8).toString('ascii'), 'MComprHD', 'Expected an actual CHD file')
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname
      if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(page); return }
      if (pathname === '/game.chd') { res.end(rom); return }
      let file
      if (/^\/core\/opera\.(js|wasm)$/.test(pathname)) file = path.join(coreDir, pathname.endsWith('.js') ? (built ? 'opera_libretro.js' : 'opera.js') : (built ? 'opera_libretro.wasm' : 'opera.wasm'))
      else if (/^\/bios\/panafz1j(?:-kanji)?\.bin$/.test(pathname)) file = path.join(biosDir, path.basename(pathname))
      else if (/^\/(frontend\/src|shared\/registry|node_modules\/(nostalgist|vue)\/dist)\//.test(pathname)) {
        file = path.resolve(root, '.' + pathname)
        if (!file.startsWith(root)) throw Error('Invalid path')
      } else throw Error('Not found')
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
      res.end(await readFile(file))
    } catch { res.statusCode = 404; res.end('Not found') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'opera-browser-'))
  const debugPort = Number(process.env.OPERA_TEST_DEBUG_PORT || 9339)
  const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' })
  const closed = new Promise(resolve => { chrome.once('exit', resolve); chrome.once('error', resolve) })
  let ws
  const logs = [], errors = [], requests = []
  try {
    let target
    for (let i = 0; i < 100; i++) {
      try { target = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find(t => t.type === 'page' && t.url === 'about:blank'); if (target) break } catch {}
      await delay(100)
    }
    assert.ok(target, 'Chromium debugging endpoint unavailable')
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
    let id = 0
    const pending = new Map()
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data)
      if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id) }
      if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
      if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url)
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id
      const timeout = setTimeout(() => { pending.delete(n); reject(Error('CDP timeout: ' + method)) }, 30000)
      pending.set(n, m => { clearTimeout(timeout); m.error ? reject(Error(m.error.message)) : resolve(m.result) })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result?.value
    }
    await send('Runtime.enable'); await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: origin })
    let result
    for (let i = 0; i < 600; i++) {
      await delay(100)
      result = await evaluate('window.result')
      if (['running', 'failed'].includes(result?.stage)) break
    }
    assert.equal(result?.stage, 'running', JSON.stringify({ result, errors, logs: logs.slice(-25) }))
    assert.equal(result.resizeExport, 'function')
    assert.ok(result.canvas.width > 0 && result.canvas.height > 0)
    const artifactDir = process.env.OPERA_TEST_ARTIFACT_DIR
    if (artifactDir) await mkdir(artifactDir, { recursive: true })
    async function screenshot(name) {
      const image = await send('Page.captureScreenshot', { format: 'png' })
      if (artifactDir) await writeFile(path.join(artifactDir, name + '.png'), Buffer.from(image.data, 'base64'))
      const stats = await evaluate(`(async () => {
        const image = new Image(); image.src = 'data:image/png;base64,${image.data}'; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        const colors = new Set(); let lit = 0, hash = 2166136261;
        for (let i=0;i<pixels.length;i+=4) { const rgb=(pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]; colors.add(rgb); if(pixels[i]>35||pixels[i+1]>35||pixels[i+2]>35) lit++; hash=Math.imul(hash^rgb,16777619)>>>0; }
        return {colors:colors.size,lit,hash};
      })()`)
      return stats
    }
    await delay(5000)
    const early = await screenshot('opera-early')
    await delay(Number(process.env.OPERA_TEST_PLAY_MS || 20000))
    const later = await screenshot('opera-later')
    assert.ok(later.colors > 16 && later.lit > 500, 'Game frame must contain rendered graphics: ' + JSON.stringify(later))
    assert.equal((await evaluate('window.result')).stage, 'running')
    assert.ok(!errors.length, errors.join('\n'))
    assert.ok(!logs.some(line => /Failed to load content|signature mismatch|RuntimeError: unreachable/i.test(line)), logs.slice(-25).join('\n'))
    assert.ok(!logs.some(line => /\[Rewind\].*(Initializing|Buffer capacity insufficient)/i.test(line)), 'Opera must not initialize the undersized rewind buffer')
    assert.ok(logs.some(line => /\[Audio\].*(Set audio input rate|Started synchronous audio driver)/i.test(line)), 'Production audio initialization was not exercised')
    assert.ok(requests.filter(url => /^https?:/.test(url)).every(url => url.startsWith(origin + '/')), 'Runtime fetched resources outside the test server')
    for (const button of ['start', 'y']) {
      await evaluate(`emu.pressDown({button:${JSON.stringify(button)}})`)
      await delay(250)
      await evaluate(`emu.pressUp({button:${JSON.stringify(button)}})`)
      await delay(2000)
    }
    await delay(6000)
    const afterInput = await screenshot('opera-input')
    const snapshot = await evaluate('(async()=>{const saved=await emu.saveState();await emu.loadState(saved.state);return {size:saved.state.size}})()')
    assert.ok(snapshot.size > 0, 'Manual save/load must remain available')
    await delay(2000)
    assert.ok(logs.some(line => /\[State\].*Loading state/i.test(line)), 'Core must process the load-state command before exit')
    await evaluate('(async()=>{await emu.pause();await emu.resume();await emu.exit()})()')
    const evidence = { result, early, later, afterInput, snapshot, errors, logs }
    if (artifactDir) await writeFile(path.join(artifactDir, 'opera-evidence.json'), JSON.stringify(evidence, null, 2))
    console.log('Opera browser evidence:', JSON.stringify({ result, early, later, afterInput, runtimeErrors: errors.length }))
  } finally {
    ws?.close(); chrome.kill('SIGTERM')
    await Promise.race([closed, delay(3000)])
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true, maxRetries: 3 })
  }
})
