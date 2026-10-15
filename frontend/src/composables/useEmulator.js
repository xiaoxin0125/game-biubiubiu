// Vue lifecycle wrapper around Nostalgist. Uses the prepare/start two-phase
// pattern borrowed from retroassembly — we let Nostalgist own the canvas
// element (via getCanvas()) and mount it into our container once ready.

import { ref, shallowRef, onBeforeUnmount } from 'vue'
import { prepareEmulator } from './nostalgist.js'

// Some libretro cores probe `navigator.mediaDevices.getUserMedia` on boot,
// which pops an unwanted camera-permission prompt. We null it out during
// start() and restore immediately after — lifted from retroassembly.
const originalGetUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia
  ?.bind(globalThis.navigator.mediaDevices)

export function useEmulator() {
  // Where Nostalgist's generated canvas gets inserted.
  const wrapperRef = ref(null)
  const booting = ref(false)
  const error = ref(null)
  const instance = shallowRef(null)

  // Cached for WebRTC's canvas.captureStream() call later
  let currentCanvas = null
  let wakeLock = null
  let wakeLockListenersAttached = false
  let audioCapture = null
  let bootGeneration = 0

  async function acquireWakeLock() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
    } catch {
      wakeLock = null
    }
  }

  async function releaseWakeLock() {
    try { await wakeLock?.release() } catch {}
    wakeLock = null
  }

  function syncWakeLock() {
    if (!instance.value) return
    if (document.visibilityState !== 'visible') {
      void releaseWakeLock()
      return
    }
    if (!wakeLock) void acquireWakeLock()
  }

  function attachWakeLockListeners() {
    if (wakeLockListenersAttached) return
    wakeLockListenersAttached = true
    document.addEventListener('visibilitychange', syncWakeLock)
    window.addEventListener('focus', syncWakeLock)
    window.addEventListener('blur', syncWakeLock)
  }

  function detachWakeLockListeners() {
    if (!wakeLockListenersAttached) return
    wakeLockListenersAttached = false
    document.removeEventListener('visibilitychange', syncWakeLock)
    window.removeEventListener('focus', syncWakeLock)
    window.removeEventListener('blur', syncWakeLock)
  }

  function disconnectAudioCapture() {
    const capture = audioCapture
    audioCapture = null
    if (!capture) return
    try { capture.source?.disconnect?.(capture.dest) } catch {}
    try {
      for (const track of capture.stream?.getTracks?.() || []) track.stop()
    } catch {}
  }

  function audioContextFor(emuModule) {
    return emuModule?.audioContext || emuModule?.AL?.currentCtx?.audioCtx || null
  }

  function audioSourceFor(emuModule) {
    return emuModule?.SDL2?.audio?.scriptProcessorNode || emuModule?.AL?.alcDevice?.script || null
  }

  function silenceEmulatorAudio(inst) {
    const emuModule = inst?.getEmscripten?.()?.Module
    const source = audioSourceFor(emuModule)
    const ctx = audioContextFor(emuModule)
    try { source?.disconnect?.() } catch {}
    try {
      if (ctx?.state === 'running') void ctx.suspend?.()
    } catch {}
  }

  async function boot({ core, rom, romUrl, romFileName, bios = [], retroarchConfig = {}, retroarchCoreConfig = {}, shader, progress = null, onRuntimeError = null, engine = null, language = null, cloudSave = null }) {
    if (!wrapperRef.value) throw new Error('wrapper not mounted')
    if (instance.value) return instance.value
    const generation = ++bootGeneration
    let prepared = null
    let bootComplete = false
    let runtimeFailure = null
    booting.value = true
    error.value = null
    try {
      // Accept either a unified `rom` (object | array | url) or the legacy
      // romUrl/romFileName pair. Normalising here keeps callers flexible.
      const romInput = rom !== undefined
        ? rom
        : (romFileName ? { fileName: romFileName, fileContent: romUrl } : romUrl)
      // 阶段只由真实事件驱动：核心/ROM 的字节进度由各自的下载回调汇报，这里
      // 只标记"开始取资源"和"资源齐了，开始初始化模拟器"。
      progress?.setStage('resources')
      const emu = await prepareEmulator({
        core, rom: romInput, bios, retroarchConfig, retroarchCoreConfig, shader, progress,
        // J2ME 专用：类库（enginemode）与游戏语言由开局弹窗选定，云存档接口由播放页
        // 给出；其余核心的 prepareEmulator 会直接忽略这三项。
        engine, language, cloudSave,
        onRuntimeError(err) {
          runtimeFailure = err
          if (!bootComplete || generation !== bootGeneration) return
          error.value = err
          progress?.setStage('failed')
          void destroy()
          onRuntimeError?.(err)
        },
      })
      prepared = emu

      // Re-check mount: prepareEmulator is async (seconds), the component may
      // have been torn down while we waited (e.g. guest role arrived and the
      // v-if flipped). Bail cleanly instead of crashing on a null wrapper.
      if (generation !== bootGeneration || !wrapperRef.value) {
        silenceEmulatorAudio(emu)
        try { await emu.exit() } catch {}
        return null
      }
      instance.value = emu

      const canvas = emu.getCanvas()
      currentCanvas = canvas
      canvas.setAttribute('tabindex', '-1')
      canvas.classList.add('portal-canvas')
      wrapperRef.value.append(canvas)

      progress?.setStage('emulator')
      try { globalThis.navigator.mediaDevices.getUserMedia = null } catch {}
      try { await emu.start() }
      finally { try { globalThis.navigator.mediaDevices.getUserMedia = originalGetUserMedia } catch {} }

      if (generation !== bootGeneration || !wrapperRef.value) {
        silenceEmulatorAudio(emu)
        try { await emu.exit() } catch {}
        return null
      }

      canvas.focus({ preventScroll: true })

      attachWakeLockListeners()
      await acquireWakeLock()

      if (runtimeFailure) throw runtimeFailure
      bootComplete = true
      progress?.setStage('ready')
      return emu
    } catch (err) {
      // A failed core may already have a canvas, audio and a running menu loop.
      // Release that instance so retry really boots a new game instead of
      // returning the failed instance from the early guard above.
      if (generation === bootGeneration) {
        if (instance.value === prepared) {
          instance.value = null
          try { currentCanvas?.remove?.() } catch {}
          currentCanvas = null
        }
        error.value = err
        progress?.setStage('failed')
      }
      silenceEmulatorAudio(prepared)
      try { await prepared?.exit() } catch {}
      throw err
    } finally {
      if (generation === bootGeneration) booting.value = false
    }
  }

  function coreSupportsSaveState() {
    return !!instance.value && instance.value.capabilities?.saveState !== false
  }

  async function saveState() {
    if (!instance.value) return null
    const { state } = await instance.value.saveState()
    return state
  }

  async function loadState(blobOrArrayBuffer) {
    if (!instance.value) return
    await instance.value.loadState(blobOrArrayBuffer)
  }

  // Cheats. RetroArch's cheat manager is reachable through the core's exported
  // `_cmd_cheat_*` bridge (see RetroArch's frontend/drivers/platform_emscripten.c).
  // Entries are registered with CHEAT_HANDLER_TYPE_EMU, i.e. the core itself
  // parses the code text — Nestopia/FCEUmm take Game Genie + PAR + raw
  // `addr:value`, Snes9x/Genesis Plus GX/mGBA take their own formats.
  function cheatModule() {
    const Module = instance.value?.getEmscripten?.()?.Module
    if (!Module || typeof Module._cmd_cheat_realloc !== 'function') return null
    return Module
  }

  function coreSupportsCheats() {
    return !!cheatModule()
  }

  // Replace the running core's cheat list with `list` ([{ code, enabled }]) and
  // re-apply it. Returns false when the emulator/core can't take cheats.
  function syncCheats(list = []) {
    const Module = cheatModule()
    if (!Module) return false
    const entries = (Array.isArray(list) ? list : [])
      .map((item) => ({ code: String(item?.code || '').trim(), enabled: item?.enabled !== false }))
      .filter((item) => item.code)
    try {
      // Clear first: cheat_manager_realloc() only frees entries above the new
      // size, so reusing the same indexes would keep old codes alive. A size of
      // 0 deliberately tears the whole list down (it reports failure for that).
      Module._cmd_cheat_realloc(0)
      // One extra disabled, code-less slot when the list is empty: with a NULL
      // list cheat_manager_apply_cheats() returns early and the core never gets
      // retro_cheat_reset(), leaving the previously applied cheats running.
      if (!Module._cmd_cheat_realloc(Math.max(entries.length, 1))) return false
      for (let i = 0; i < entries.length; i++) {
        const ptr = Module.stringToNewUTF8(entries[i].code)
        try { Module._cmd_cheat_set_code(i, ptr) } finally { Module._free(ptr) }
        // set_code marks the slot enabled, so disabling needs an explicit toggle.
        if (!!Module._cmd_cheat_get_code_state(i) !== entries[i].enabled) {
          Module._cmd_cheat_toggle_index(true, i)
        }
      }
      Module._cmd_cheat_apply_cheats()
      return true
    } catch (err) {
      console.warn('[cheats] apply failed', err)
      return false
    }
  }

  // Read back what the running core currently holds (mostly for debugging).
  function readCheats() {
    const Module = cheatModule()
    if (!Module) return []
    const size = Module._cmd_cheat_get_size()
    const out = []
    for (let i = 0; i < size; i++) {
      const ptr = Module._cmd_cheat_get_code(i)
      const code = ptr ? Module.UTF8ToString(ptr) : ''
      if (!code) continue
      out.push({ code, enabled: !!Module._cmd_cheat_get_code_state(i) })
    }
    return out
  }

  function pressButton(button, player = 1) {
    try { instance.value?.pressDown?.({ button, player }) } catch {}
  }

  function releaseButton(button, player = 1) {
    try { instance.value?.pressUp?.({ button, player }) } catch {}
  }

  function canvas() { return currentCanvas }

  // Tap into Nostalgist's internal AudioContext via MediaStreamDestination so
  // the host-mode WebRTC path can forward audio to the guest. The capture node
  // is shared across invitations to avoid stacking duplicate WebAudio outputs.
  function captureAudioStream() {
    if (audioCapture?.stream) return audioCapture.stream

    const inst = instance.value
    if (!inst) return null
    const emuModule = inst?.getEmscripten?.()?.Module
    const ctx = audioContextFor(emuModule)
    if (!ctx || typeof ctx.createMediaStreamDestination !== 'function') return null

    let dest = null
    let source = null
    try {
      dest = ctx.createMediaStreamDestination()
      source = audioSourceFor(emuModule)
      if (!source) return null
      source.connect(dest)
      audioCapture = { source, dest, stream: dest.stream }
      return audioCapture.stream
    } catch {
      try { source?.disconnect?.(dest) } catch {}
      return null
    }
  }

  async function destroy() {
    ++bootGeneration
    const inst = instance.value
    const oldCanvas = currentCanvas
    instance.value = null
    currentCanvas = null
    booting.value = false
    try { oldCanvas?.remove?.() } catch {}
    disconnectAudioCapture()
    silenceEmulatorAudio(inst)
    detachWakeLockListeners()
    await releaseWakeLock()
    if (!inst) return
    try { await inst.exit() } catch {}
  }

  onBeforeUnmount(() => { destroy() })

  return {
    wrapperRef,
    booting,
    error,
    instance,
    boot,
    saveState,
    loadState,
    syncCheats,
    readCheats,
    coreSupportsCheats,
    coreSupportsSaveState,
    pressButton,
    releaseButton,
    canvas,
    captureAudioStream,
    destroy,
  }
}
