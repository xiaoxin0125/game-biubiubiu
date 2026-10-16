import { normalizeKeyboardEventKey, normalizeRetroarchKey } from '../input/keyboardKeys.js'
import { J2ME_DEFAULT_ENGINE, J2ME_ENGINES, warmJ2meRuntime } from './j2meCore.js'
import { isJ2meLanguage, j2meLanguageParam } from './j2meLanguage.js'

export { J2ME_DEFAULT_ENGINE } from './j2meCore.js'

// J2ME input: the cross sends MIDP's navigation key codes — the ⟂ keys of a
// phone with a direction pad (Canvas.KEY_UP/DOWN/LEFT/RIGHT = -1/-2/-3/-4) —
// while the face and shoulder buttons stay on the phone keypad, whose labels the
// virtual pad shows (1/3/7/9 = the game keys, 5 = 确定, * / # , 0 = 键 0) and
// whose soft keys are select/start (the PC defaults for this platform sit on the
// numpad like the phone keypad itself: see keyboardProfiles.js' J2ME_KEYBOARD).
// On the touch pad the left-hand stick is
// swapped for the phone's own cross: four irregular pentagons tiling a seamless
// plus-shape of equal width and height, one per direction, with no centre button
// (the keypad's centre key is already the l2 row on the shoulder row). The
// runtime's game-action table is taught the keypad codes too (see
// `frontend/scripts/apply-j2me-patches.mjs`), so both halves of MIDP's
// mapping reach MIDlets that ask getGameAction() instead of reading keyPressed.
export const J2ME_BUTTON_KEYS = Object.freeze({
  up: -1, down: -2, left: -3, right: -4,
  a: 51, b: 57, x: 49, y: 55, l: 42, r: 35, l2: 53,
  select: -6, start: -7, r2: 48,
})
export const J2ME_CAPABILITIES = Object.freeze({ saveState: false, loadState: false, rewind: false, cheats: false, multiplayer: false, persistentRms: false, audioCapture: false })

// 云存档（RMS）读取的时限：网络卡住时不能把启动拖在这里。真正把它写进文件系统
// 的是窗体里的 rms.js，那一边也有自己的超时（见 rms.js 的 GATE_TIMEOUT_MS）。
const J2ME_CLOUD_SAVE_TIMEOUT_MS = 4000
// 帧里报告 RMS 改动之后的去抖：游戏一次存档往往连着写好几条记录。
const J2ME_CLOUD_SAVE_DEBOUNCE_MS = 1200

/**
 * 云存档接口。播放页只在「登录用户 + 单机（或房间房主）」时传进来，客人不传：
 *
 *   load(): Promise<Blob|null>     这个用户在这个 ROM 上的存档（null = 还没有）
 *   save(blob, options): Promise   把最新的 RMS 快照传上去
 *
 * 它对应服务端的 /api/saves/:romId?slot=0 —— 每人一份，跟着 ROM 走。
 */
function normalizeCloudSave(cloud) {
  if (!cloud || typeof cloud !== 'object') return null
  const load = typeof cloud.load === 'function' ? cloud.load : null
  const save = typeof cloud.save === 'function' ? cloud.save : null
  return load || save ? { load, save } : null
}

/** 读云存档：失败或超时都当作「没有存档」，游戏照常开。 */
function loadCloudSave(cloud) {
  return new Promise(resolve => {
    let settled = false
    const done = (value) => { if (!settled) { settled = true; resolve(value) } }
    setTimeout(() => {
      if (!settled) console.warn('[j2me] 云存档读取超时，本次从本地状态启动')
      done(null)
    }, J2ME_CLOUD_SAVE_TIMEOUT_MS)
    Promise.resolve()
      .then(() => cloud.load())
      .then(done, error => {
        console.warn('[j2me] 云存档读取失败，本次从本地状态启动', error)
        done(null)
      })
  })
}

// MIDP 的 TextField 约束值：低 16 位是「哪一类」，高位是标志位（PASSWORD / UNEDITABLE）。
// 播放页按它挑输入框类型，跟运行时自己那套编辑器用同一份映射。
const J2ME_CONSTRAINT_MASK = 0xFFFF
const J2ME_CONSTRAINT_PASSWORD = 0x10000

export function editorInputType(constraints) {
  if (constraints & J2ME_CONSTRAINT_PASSWORD) return 'password'
  switch (constraints & J2ME_CONSTRAINT_MASK) {
    case 1: return 'email'
    case 2: case 5: return 'number'      // NUMERIC / DECIMAL 只该收数字
    case 3: return 'tel'
    case 4: return 'url'
    default: return 'text'
  }
}

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
  runtimeUrl = '/j2me/main.html', engine = J2ME_DEFAULT_ENGINE, language = null, cloudSave = null,
} = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 96 || height < 96 || width > 1024 || height > 1024) throw new Error('无效的 J2ME 屏幕尺寸')
  if (!J2ME_ENGINES.has(engine)) throw new Error(`未知的 J2ME 内核：${engine}`)
  if (language != null && !isJ2meLanguage(language)) throw new Error(`未知的 J2ME 游戏语言：${language}`)
  // 云存档的读取现在就开始：预热运行时、下 JAR 的这几秒正好用来等它（见 start()）。
  const cloud = normalizeCloudSave(cloudSave)
  const cloudSavePromise = cloud?.load ? loadCloudSave(cloud) : null
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
  // 游戏语言：auto 不传，运行时的 siteLocale 补丁自己看浏览器语言（并把中文的
  // 各种写法归到游戏认的 zh-CN / zh-HK，见 apply-j2me-patches.mjs）。
  const languageParam = j2meLanguageParam(language)
  if (languageParam) url.searchParams.set('language', languageParam)
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
    stopCloudSync()
    iframe.remove()
    URL.revokeObjectURL(jarUrl)
    if (saveBlobUrl) { URL.revokeObjectURL(saveBlobUrl); saveBlobUrl = null }
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
  // ---- 输入框 ----
  // 高级界面的 TextField / TextBox：运行时自带的编辑器挂在那张隐藏页面的 DOM 上，玩家既
  // 看不到也点不到（这份构建其实根本没把它接到高级界面上）。这里在画面里对应的位置叠一个
  // 真正的 <input>，手机上点一下就能拉起系统键盘；打完把值写回运行时，Java 读 TextField
  // 时问的就是那份值。
  let editor = null, editorId = null, editorOriginal = ''

  function textFieldState() {
    try { return runtimeWindow()?.__lcdui?.textField?.() || null } catch { return null }
  }
  function createEditor() {
    const input = document.createElement('input')
    input.type = 'text'
    input.autocomplete = 'off'
    input.autocapitalize = 'off'
    input.spellcheck = false
    input.setAttribute('aria-label', '游戏内文字输入')
    // 画布按运行时画布尺寸等比放大，输入框跟着它换算（用 fixed 定位，不假设播放页布局）。
    input.style.cssText = 'position:fixed;z-index:70;display:none;box-sizing:border-box;padding:0 3px;' +
      'border:1px solid #2f6fd0;border-radius:2px;background:#fff;color:#000;font-family:inherit;outline:none'
    input.addEventListener('keydown', event => {
      event.stopPropagation()
      if (event.key === 'Enter') { event.preventDefault(); commitEditor() }
      else if (event.key === 'Escape') { event.preventDefault(); cancelEditor() }
    })
    input.addEventListener('input', () => { runtimeWindow()?.__lcdui?.setText?.(editorId, input.value) })
    input.addEventListener('blur', () => { if (editor) commitEditor() })
    document.body.append(input)
    return input
  }
  function placeEditor(field) {
    const box = canvas.getBoundingClientRect()
    const scaleX = box.width / (canvas.width || 1)
    const scaleY = box.height / (canvas.height || 1)
    editor.style.left = `${Math.round(box.left + field.editX * scaleX)}px`
    editor.style.top = `${Math.round(box.top + field.editY * scaleY)}px`
    editor.style.width = `${Math.max(32, Math.round(field.editWidth * scaleX))}px`
    editor.style.height = `${Math.max(18, Math.round(field.editHeight * scaleY))}px`
    editor.style.fontSize = `${Math.max(11, Math.round(12 * scaleY))}px`
  }
  /** 开始编辑：焦点在输入框上（或点在它上面）时调用。 */
  function startEditing() {
    const field = textFieldState()
    if (!field) return false
    if (!editor) editor = createEditor()
    editorId = field.id
    editorOriginal = field.text || ''
    editor.value = editorOriginal
    editor.type = field.htmlType || editorInputType(field.constraints)
    editor.maxLength = field.maxSize > 0 ? field.maxSize : 524288
    placeEditor(field)
    editor.style.display = 'block'
    editor.focus()
    try { editor.setSelectionRange(editor.value.length, editor.value.length) } catch { /* number 型不支持选区 */ }
    return true
  }
  function closeEditor() {
    if (!editor) return
    editor.style.display = 'none'
    editorId = null
    editorOriginal = ''
    if (document.activeElement === editor) editor.blur()
  }
  function commitEditor() {
    const id = editorId
    const value = editor ? editor.value : ''
    closeEditor()
    if (id != null) runtimeWindow()?.__lcdui?.commitText?.(id, value)
  }
  function cancelEditor() {
    const id = editorId
    closeEditor()
    if (id != null) runtimeWindow()?.__lcdui?.setText?.(id, editorOriginal)
  }
  /** 点在输入框那块区域上等于开始编辑（触摸屏上的习惯动作）。 */
  function editorHitTest(event) {
    const field = textFieldState()
    if (!field) return false
    const box = canvas.getBoundingClientRect()
    const scaleX = (canvas.width || 1) / (box.width || 1)
    const scaleY = (canvas.height || 1) / (box.height || 1)
    const x = (event.clientX - box.left) * scaleX
    const y = (event.clientY - box.top) * scaleY
    return x >= field.editX - 4 && x <= field.editX + field.editWidth + 4
      && y >= field.editY - 4 && y <= field.editY + field.editHeight + 4
  }
  function key(button, down, player = 1) {
    if (Number(player) !== 1 || state !== 'running') return
    const code = J2ME_BUTTON_KEYS[button]
    if (code == null || (down ? held.has(button) : !held.has(button))) return
    if (down) held.add(button); else held.delete(button)
    // 输入框开着时，左右软键是「确定 / 取消」，不再往下传给游戏。
    if (editorId != null) {
      if (down && button === 'start') cancelEditor()
      else if (down && (button === 'l2' || button === 'select')) commitEditor()
      return
    }
    // 5 / 确定（真机上就是开始编辑那颗键）：焦点在输入框上时打开编辑框。
    if (down && button === 'l2' && startEditing()) return
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
  canvas.addEventListener('click', event => { if (state === 'running' && editorHitTest(event)) startEditing() })
  const onMessage = event => {
    // 只认这个 iframe 发来的消息：window 上的 message 事件任何窗口都能发，
    // 不校验来源的话，别的页面（或同页的第三方脚本）能伪造一个 j2me-error
    // 把玩家这一局打断（2026-10 审计 L-6）。
    if (event.source && event.source !== runtimeWindow()) return
    const data = event.data
    if (!data) return
    // 帧里的 rms.js：RMS 有改动 → 去抖后自动上传；开局恢复完成 → 记下结果，
    // 并把"云端这一份"的摘要收下（游戏原样重写时就不必再传。见 queueCloudSave）。
    if (data.type === 'j2me-rms-dirty') { scheduleCloudSave(); return }
    if (data.type === 'j2me-rms-restored') {
      lastRestore = data.status ? { ...data.status, digest: data.digest || null } : null
      if (typeof data.digest === 'string' && data.digest) cloudDigest = data.digest
      return
    }
    if (data.type !== 'j2me-error') return
    // A running game is torn down by a runtime error (the VM has no way back);
    // a booting one gets the grace period to prove itself first.
    if (state === 'running' || state === 'paused') fail(new Error(data.message))
    else reportRuntimeError(new Error(data.message))
  }
  window.addEventListener('message', onMessage)

  function pollBoot() {
    if (state !== 'starting') return
    if (runtimeWindow()?.__j2mePlayer?.booted?.() && painted()) {
      state = 'running'; clearTimeout(timer); clearErrorGrace(); startMirror(); resolveStart(adapter); return
    }
    setTimeout(pollBoot, 100)
  }

  /**
   * 打开运行时页面。云存档就位之后才动手：帧里的 rms.js 把 `save` 参数当作这一局的
   * 开局状态，而运行时起 VM 之前会 await 它恢复完（见 rms.js 的 loadingPromises）。
   */
  async function openRuntime() {
    const save = cloudSavePromise ? await cloudSavePromise : null
    if (state !== 'starting') return
    if (cloud?.load) {
      if (save) {
        saveBlobUrl = URL.createObjectURL(save instanceof Blob ? save : new Blob([save]))
        url.searchParams.set('save', saveBlobUrl)
      } else {
        // 这个用户还没有云存档：本地可能还留着别的 ROM（或上一局）的记录，交给 rms.js 清干净。
        url.searchParams.set('save', 'none')
      }
    }
    timer = setTimeout(() => fail(new Error('J2ME 启动超时：游戏没有绘制画面，可能使用了不支持的 Java API')), timeoutMs)
    iframe.src = url.href
    document.body.append(iframe)
    pollBoot()
  }

  // ---- 云存档：开局恢复 + 改动后自动上传 ----
  // 帧里的 rms.js 负责把 /RecordStore 读成一份快照、把快照写回去；这里负责时序：
  // 开局把存档交给它（save 参数），之后它说"改了"就上传，暂停 / 退出 / 页面隐藏时
  // 再补一次。玩家不用点任何按钮。
  //
  // cloudDigest 是"云端现在这一份"的摘要：开局从云端恢复进来的那一份，或最后一次上传
  // 的那一份。rms.js 的摘要只看记录内容，时间戳一律不算改动 —— 不少 MIDlet 进菜单、
  // 过场时会把同一份记录原样重写一遍（2026-10-16 用「刺客骨肉分离」验证过：标题画面
  // 自己重写 4 轮，写出来的存储文件与恢复进来的云存档逐字节只差文件头里的写入时间），
  // 那种"重写"不该在玩家的云存档里再留一次记录，更不该弹"已自动存档"。
  let saveBlobUrl = null
  let cloudDigest = null
  let lastRestore = null
  let saveChain = Promise.resolve()
  let saveTimer = null

  function rmsApi() {
    try { return runtimeWindow()?.__j2meRms || null } catch { return null }
  }

  function stopCloudSync() {
    if (saveTimer != null) { clearTimeout(saveTimer); saveTimer = null }
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityHidden)
  }

  /** 把当前 RMS 快照传上去；和云端那一份一样（摘要相同）就不重复传。 */
  function queueCloudSave({ keepalive = false } = {}) {
    if (!cloud?.save || state === 'exited') return Promise.resolve()
    saveChain = saveChain.then(async () => {
      const api = rmsApi()
      if (!api?.snapshot) return
      const shot = await api.snapshot()
      if (!shot || shot.digest === cloudDigest) return
      await cloud.save(shot.blob, { keepalive })
      cloudDigest = shot.digest
    }).catch(error => { console.warn('[j2me] 云存档上传失败', error) })
    return saveChain
  }

  function scheduleCloudSave() {
    if (!cloud?.save || saveTimer != null) return
    saveTimer = setTimeout(() => { saveTimer = null; queueCloudSave() }, J2ME_CLOUD_SAVE_DEBOUNCE_MS)
  }

  function flushCloudSave(options) {
    if (saveTimer != null) { clearTimeout(saveTimer); saveTimer = null }
    return queueCloudSave(options)
  }

  // 切到后台时先按普通请求存一次：手机上是「先隐藏、稍后才可能被丢弃」，这时页面
  // 还活着，普通 fetch 能完整跑完。真正的 pagehide（关标签页 / 前进后退）才用
  // keepalive 兜底——那条路有 64KB 上限，只能当最后手段（2026-10 审计 L-5）。
  function onPageHide() { void flushCloudSave({ keepalive: true }) }
  function onVisibilityHidden() { if (document.visibilityState === 'hidden') void flushCloudSave() }
  if (cloud?.save) {
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityHidden)
  }

  const capabilities = cloud?.save ? { ...J2ME_CAPABILITIES, persistentRms: true } : J2ME_CAPABILITIES

  const adapter = {
    capabilities,
    getCanvas: () => canvas,
    getStatus: () => ({ state, error: runtimeError }),
    /** 帧里 rms.js 的报告（开局恢复的结果），排查用。 */
    getRmsStatus: () => lastRestore,
    start() {
      if (state === 'exited' || state === 'failed') return Promise.reject(runtimeError || new Error('J2ME 已退出'))
      if (startPromise) return startPromise
      state = 'starting'
      startPromise = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject })
      void openRuntime()
      return startPromise
    },
    pressDown: ({ button, player = 1 }) => key(button, true, player),
    pressUp: ({ button, player = 1 }) => key(button, false, player),
    async pause() {
      if (state !== 'running') return
      if (editorId != null) commitEditor()   // 暂停前把没提交的输入落下去，别丢字
      releaseAll(); state = 'paused'
      // The runtime holds its timers and rAF while paused, so the game stops
      // where it was instead of running on unseen; the mirror stops too.
      runtimeWindow()?.__j2mePlayer?.setPaused?.(true)
      stopMirror()
      // 玩家按了暂停，多半正要离开：把这一段进度先存上去。
      void flushCloudSave()
    },
    async resume() {
      if (state !== 'paused') return
      state = 'running'
      runtimeWindow()?.__j2mePlayer?.setPaused?.(false)
      startMirror()
    },
    async exit() {
      if (state === 'exited') return
      // 最后一次存档要在拆掉 iframe 之前做完（快照得从帧里读）。给它一个上限：
      // 玩家已经在离开这一页了，不能为了上传把人拖住。
      if (cloud?.save) await Promise.race([flushCloudSave({ keepalive: true }), new Promise(resolve => setTimeout(resolve, 1500))])
      closeEditor(); editor?.remove(); editor = null
      releaseAll(); state = 'exited'; clearTimeout(timer); clearErrorGrace(); stopMirror(); stopCloudSync()
      rejectStart?.(new Error('J2ME 启动已取消'))
      window.removeEventListener('message', onMessage)
      canvas.removeEventListener('keydown', keyboard); canvas.removeEventListener('keyup', keyboard); canvas.removeEventListener('blur', releaseAll)
      iframe.remove(); URL.revokeObjectURL(jarUrl)
      if (saveBlobUrl) { URL.revokeObjectURL(saveBlobUrl); saveBlobUrl = null }
    },
    saveState: async () => { throw new Error('J2ME 运行时不支持即时存档/读档；游戏内存档仅在当前会话有效') },
    loadState: async () => { throw new Error('J2ME 运行时不支持即时存档/读档；游戏内存档仅在当前会话有效') },
    getEmscripten: () => null,
  }
  void teardown
  return adapter
}
