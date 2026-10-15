import { normalizeKeyboardEventKey, normalizeRetroarchKey } from '../input/keyboardKeys.js'
import { J2ME_DEFAULT_ENGINE, J2ME_ENGINES, warmJ2meRuntime } from './j2meCore.js'

export { J2ME_DEFAULT_ENGINE } from './j2meCore.js'

// J2ME input: the cross sends MIDP's navigation key codes — the ⟂ keys of a
// phone with a direction pad (Canvas.KEY_UP/DOWN/LEFT/RIGHT = -1/-2/-3/-4) —
// while the face and shoulder buttons stay on the phone keypad, whose labels the
// virtual pad shows (1/3/7/9 = the game keys, 5 = 确定, * / # , 0 = 键 0) and
// whose soft keys are select/start. The runtime's game-action table is taught the
// keypad codes too (see `apply-site-patches.mjs`), so both halves of MIDP's
// mapping reach MIDlets that ask getGameAction() instead of reading keyPressed.
export const J2ME_BUTTON_KEYS = Object.freeze({
  up: -1, down: -2, left: -3, right: -4,
  a: 51, b: 57, x: 49, y: 55, l: 42, r: 35, l2: 53,
  select: -6, start: -7, r2: 48,
})
export const J2ME_CAPABILITIES = Object.freeze({ saveState: false, loadState: false, rewind: false, cheats: false, multiplayer: false, persistentRms: false, audioCapture: false })

// The hosted runtime ships three class libraries; the compatibility one boots
// the widest range of MIDlets (verified with Sword and Fairy). Games that need
// MIDP 2.0 features can be pointed at enginemode2-classes2.jar per ROM.
// The engine list and the runtime's own asset/version bookkeeping live in
// `j2meCore.js` (the player's progress panel reads them too).

// Screen presets the runtime can lay its canvas out for (its body classes).
const J2ME_CANVAS_PRESETS = new Set(['240x320', '320x240', '128x128', '176x220', '240x400', '400x240', '360x640', '640x360', '480x800', '800x480'])

export async function resolveJ2meRom(input, signal) {
  input = await input
  if (Array.isArray(input)) {
    if (input.length !== 1) throw new Error('J2ME 一次只能加载一个 JAR 文件')
    input = input[0]
  }
  const name = input?.fileName || (typeof input === 'string' ? input.split('?')[0] : '')
  if (name && !/\.jar$/i.test(name)) throw new Error('J2ME 浏览器运行时只支持 JAR；请上传 JAD/JAM 对应的 JAR 文件')
  let data = await (input?.fileContent ?? input)
  if (typeof data === 'string' || data instanceof URL) {
    const response = await fetch(data, { signal })
    if (!response.ok) throw new Error(`J2ME ROM 下载失败 (${response.status})`)
    data = await response.arrayBuffer()
  }
  if (data instanceof Blob) data = await data.arrayBuffer()
  if (ArrayBuffer.isView(data)) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  if (!(data instanceof ArrayBuffer)) throw new Error('无效的 J2ME ROM 数据')
  const bytes = new Uint8Array(data)
  if (bytes.length < 22 || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) throw new Error('J2ME ROM 不是有效的 JAR/ZIP 文件')
  return data
}

/** Central-directory entries of a JAR: name → { method, compressedSize, localOffset }. */
function readJarEntries(bytes) {
  const entries = new Map()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return entries
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    entries.set(name, { method, compressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Raw-deflate one ZIP entry without pulling in a zip library. */
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Manifest text of a JAR: stored entries are scanned directly, deflated ones are read from the ZIP directory. */
async function readJarManifest(bytes, entries) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 512 * 1024)))
  if (/MIDlet-1:/.test(head)) return head
  const entry = entries.get('META-INF/MANIFEST.MF')
  if (!entry) return ''
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const localNameLength = view.getUint16(entry.localOffset + 26, true)
  const localExtraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + localNameLength + localExtraLength
  const raw = bytes.subarray(start, start + entry.compressedSize)
  const content = entry.method === 8 ? await inflateRaw(raw) : raw
  return new TextDecoder('utf-8', { fatal: false }).decode(content)
}

/**
 * Whether this browser can inflate a JAR entry (the manifest is usually
 * deflated). Older mobile WebViews lack `DecompressionStream` or its
 * `deflate-raw` mode; they can still run the game, they just cannot be
 * pre-checked here, because that check needs to read the manifest.
 */
export function canInflateJarEntries() {
  if (typeof DecompressionStream !== 'function') return false
  if (typeof Blob !== 'function' || typeof Blob.prototype?.stream !== 'function') return false
  try { new DecompressionStream('deflate-raw'); return true } catch { return false }
}

/**
 * Main class from the JAR manifest; the runtime needs it to launch the suite.
 * The class file itself is checked too, so an unlaunchable JAR fails here with a
 * clear message instead of timing out inside the runtime.
 */
export async function midletClassFromJar(data) {
  const bytes = new Uint8Array(data)
  const entries = readJarEntries(bytes)
  const manifest = await readJarManifest(bytes, entries)
  if (!manifest) throw new Error('这个 JAR 里没有 META-INF/MANIFEST.MF，不是可启动的 Java 手机游戏')
  const unfolded = manifest.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  const match = unfolded.match(/(?:^|\r?\n)MIDlet-1:[ \t]*([^\r\n]+)/)
  if (!match) throw new Error('这个 JAR 的清单里没有 MIDlet-1，不是可启动的 Java 手机游戏')
  const parts = match[1].split(',')
  const className = parts[parts.length - 1].trim().replace(/\//g, '.')
  if (!/^[\w.$]+$/.test(className)) throw new Error('这个 JAR 的 MIDlet-1 主类名不合法')
  if (!entries.has(`${className.replace(/\./g, '/')}.class`)) throw new Error(`JAR 里没有主类 ${className}.class，无法启动`)
  return className
}

/**
 * Self-hosted J2meJS adapter (the vendored runtime under `public/j2me`).
 *
 * The runtime must run same-origin: it keeps its JAR/class-library state in
 * IndexedDB, which browsers refuse to expose to an opaque-origin sandbox. The
 * frame therefore has no `sandbox` attribute, stays on-screen at the VM's own
 * size (Chrome throttles hidden frames' timers) and is made invisible with
 * opacity while its canvas is mirrored into the canvas the player displays.
 *
 * Every runtime file is requested under the build's content version
 * (`/j2me/version.json`, written by `frontend/scripts/stamp-j2me-runtime.mjs`)
 * because nginx serves `.js` with a 12-hour max-age: without it a phone that
 * cached the previous runtime keeps running those scripts against a new page,
 * which used to stall the boot with no visible reason. The same manifest drives
 * the player's “core” progress for J2ME: see `j2meCore.js`.
 */
// A J2meJS session reports survivable noise through the bridge (WebKit, for
// instance, rejects a promise upstream code ignores on V8). While the VM is
// still booting, hold the first reported error for this long instead of failing
// immediately: a runtime that paints anyway keeps its session, and one that
// does not is failed with the runtime's own message instead of a bare timeout.
const J2ME_BOOT_ERROR_GRACE_MS = 5000

export async function prepareJ2me({ rom, romUrl, romFileName, retroarchConfig = {}, progress = null,
  width = 240, height = 320, timeoutMs = 30000, onRuntimeError = null,
  runtimeUrl = '/j2me/main.html', engine = J2ME_DEFAULT_ENGINE,
} = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 96 || height < 96 || width > 1024 || height > 1024) throw new Error('无效的 J2ME 屏幕尺寸')
  if (!J2ME_ENGINES.has(engine)) throw new Error(`未知的 J2ME 内核：${engine}`)
  const bytes = await resolveJ2meRom(rom ?? (romFileName ? { fileName: romFileName, fileContent: romUrl } : romUrl), progress?.currentSignal?.())
  // Reading the main class out of the JAR is a courtesy check — it turns an
  // unlaunchable file into a readable error instead of a startup timeout. The
  // runtime reads the manifest itself with its own inflate, so on browsers that
  // cannot inflate (older mobile WebViews have no DecompressionStream) the game
  // is handed over unchecked rather than refused.
  const midletClass = canInflateJarEntries() ? await midletClassFromJar(bytes) : null
  // J2ME 的“核心”就是运行时那批脚本与类库：先按带版本号的同一批地址取一遍
  // （进度写进面板，之后 iframe 的请求直接命中缓存），取完再打开运行时页面。
  // 这一步永不抛异常，没有清单（本地开发）时直接返回 null。
  const manifest = await warmJ2meRuntime({ progress, engine, signal: progress?.currentSignal?.() })

  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  const jarUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/java-archive' }))

  const url = new URL(runtimeUrl, location.href)
  if (url.origin !== location.origin) throw new Error('J2ME 运行时必须由本机同源托管')
  const version = manifest?.version || null
  if (version) url.searchParams.set('v', version)
  url.searchParams.set('jar', jarUrl)
  if (midletClass) url.searchParams.set('midletClassName', midletClass)
  url.searchParams.set('enginemode', engine)
  url.searchParams.set('logLevel', 'warn')
  if ((width !== 240 || height !== 320) && J2ME_CANVAS_PRESETS.has(`${width}x${height}`)) url.searchParams.set('canvasSize', `size-${width}x${height}`)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.setAttribute('allow', 'autoplay')
  // Same-origin by design (IndexedDB), but never visible: the player shows the
  // mirrored canvas only.
  iframe.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none`

  let state = 'prepared', runtimeError = null, pendingError = null, errorGraceTimer = null, startPromise, resolveStart, rejectStart, timer, frameHandle = null, mirroring = false
  const held = new Set()

  function clearErrorGrace() {
    if (errorGraceTimer == null) return
    clearTimeout(errorGraceTimer)
    errorGraceTimer = null
  }

  function reportRuntimeError(error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    if (!pendingError) pendingError = failure
    if (state !== 'starting' && state !== 'prepared') return
    if (errorGraceTimer != null) return
    errorGraceTimer = setTimeout(() => fail(pendingError), J2ME_BOOT_ERROR_GRACE_MS)
  }

  function fail(error) {
    if (state === 'exited' || state === 'failed') return
    runtimeError = error instanceof Error ? error : new Error(String(error))
    state = 'failed'; clearTimeout(timer); clearErrorGrace(); stopMirror()
    rejectStart?.(runtimeError)
    teardown()
    canvas.dispatchEvent(new CustomEvent('j2meerror', { detail: runtimeError }))
    onRuntimeError?.(runtimeError)
  }

  function teardown() {
    iframe.remove()
    URL.revokeObjectURL(jarUrl)
  }

  function runtimeWindow() {
    try { return iframe.contentWindow } catch { return null }
  }
  function runtimeCanvas() {
    const win = runtimeWindow()
    const node = win?.__j2mePlayer?.canvas?.()
    return node && node.width > 0 && node.height > 0 ? node : null
  }
  function startMirror() {
    if (mirroring) return
    mirroring = true
    // Avoid a continuous RAF loop in the parent: with J2meJS's nested frame
    // callbacks, Chromium reproduces an allocator hang during this game's asset
    // loading even if the parent RAF does no drawing. A 16 ms timer preserves
    // the mirror without introducing that scheduling trigger (INTEGRATION.md).
    const step = () => {
      if (!mirroring) return
      const source = runtimeCanvas()
      if (source) {
        if (canvas.width !== source.width || canvas.height !== source.height) { canvas.width = source.width; canvas.height = source.height }
        context.drawImage(source, 0, 0)
      }
      frameHandle = setTimeout(step, 16)
    }
    frameHandle = setTimeout(step, 16)
  }
  function stopMirror() {
    mirroring = false
    if (frameHandle != null) clearTimeout(frameHandle)
    frameHandle = null
  }
  function painted() {
    const source = runtimeCanvas()
    if (!source) return false
    try {
      const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) return true
    } catch { /* canvas not readable yet */ }
    return false
  }
  function key(button, down, player = 1) {
    if (Number(player) !== 1 || state !== 'running') return
    const code = J2ME_BUTTON_KEYS[button]
    if (code == null || (down ? held.has(button) : !held.has(button))) return
    if (down) held.add(button); else held.delete(button)
    const api = runtimeWindow()?.__j2mePlayer
    if (!api) return
    if (down) api.press(code); else api.release(code)
  }
  function releaseAll() { for (const button of [...held]) key(button, false) }
  function keyboard(event) {
    if (!event.__internalInputDispatch && event.target !== canvas) return
    const binding = normalizeKeyboardEventKey(event)
    const button = Object.keys(J2ME_BUTTON_KEYS).find(b => normalizeRetroarchKey(retroarchConfig[`input_player1_${b}`]) === binding)
    if (button) { event.preventDefault(); key(button, event.type === 'keydown') }
  }
  canvas.addEventListener('keydown', keyboard); canvas.addEventListener('keyup', keyboard)
  canvas.addEventListener('blur', releaseAll)
  const onMessage = event => {
    if (!event.data || event.data.type !== 'j2me-error') return
    // A running game is torn down by a runtime error (the VM has no way back);
    // a booting one gets the grace period to prove itself first.
    if (state === 'running' || state === 'paused') fail(new Error(event.data.message))
    else reportRuntimeError(new Error(event.data.message))
  }
  window.addEventListener('message', onMessage)

  const adapter = {
    capabilities: J2ME_CAPABILITIES,
    getCanvas: () => canvas,
    getStatus: () => ({ state, error: runtimeError }),
    start() {
      if (state === 'exited' || state === 'failed') return Promise.reject(runtimeError || new Error('J2ME 已退出'))
      if (startPromise) return startPromise
      state = 'starting'
      startPromise = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject })
      timer = setTimeout(() => fail(new Error('J2ME 启动超时：游戏没有绘制画面，可能使用了不支持的 Java API')), timeoutMs)
      iframe.src = url.href
      document.body.append(iframe)
      const poll = () => {
        if (state !== 'starting') return
        if (runtimeWindow()?.__j2mePlayer?.booted?.() && painted()) {
          state = 'running'; clearTimeout(timer); clearErrorGrace(); startMirror(); resolveStart(adapter); return
        }
        setTimeout(poll, 100)
      }
      poll()
      return startPromise
    },
    pressDown: ({ button, player = 1 }) => key(button, true, player),
    pressUp: ({ button, player = 1 }) => key(button, false, player),
    async pause() {
      if (state !== 'running') return
      releaseAll(); state = 'paused'
      // The runtime holds its timers and rAF while paused, so the game stops
      // where it was instead of running on unseen; the mirror stops too.
      runtimeWindow()?.__j2mePlayer?.setPaused?.(true)
      stopMirror()
    },
    async resume() {
      if (state !== 'paused') return
      state = 'running'
      runtimeWindow()?.__j2mePlayer?.setPaused?.(false)
      startMirror()
    },
    async exit() {
      if (state === 'exited') return
      releaseAll(); state = 'exited'; clearTimeout(timer); clearErrorGrace(); stopMirror()
      rejectStart?.(new Error('J2ME 启动已取消'))
      window.removeEventListener('message', onMessage)
      canvas.removeEventListener('keydown', keyboard); canvas.removeEventListener('keyup', keyboard); canvas.removeEventListener('blur', releaseAll)
      iframe.remove(); URL.revokeObjectURL(jarUrl)
    },
    saveState: async () => { throw new Error('J2ME 运行时不支持即时存档/读档；游戏内存档仅在当前会话有效') },
    loadState: async () => { throw new Error('J2ME 运行时不支持即时存档/读档；游戏内存档仅在当前会话有效') },
    getEmscripten: () => null,
  }
  void teardown
  return adapter
}
