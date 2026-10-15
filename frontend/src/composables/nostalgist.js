// Thin wrapper around Nostalgist. Cores are served by our backend from
// `data/cores`, not from Nostalgist's CDN. We keep the two-phase prepare/start
// pattern so the caller can mount the generated canvas before the emulator runs.

import { Nostalgist } from 'nostalgist'
import { installNativeGamepadGuard } from './input/physicalGamepads.js'
import { loadCoreAsset } from './player/useCoreAssets.js'
import { createCoreBootGuard } from './player/coreBootGuard.js'

// Sensible defaults cribbed from retroassembly's emulator-portal. Rewind stays
// enabled, while run-ahead is disabled for heavy or audio-sensitive cores.
//
// Physical pads are sampled and mapped by our own useGamepads layer, which
// presses the RetroArch keyboard binds via pressButton/releaseButton. The core
// must not read pads itself: with every input_player*_<button>_btn / _axis set
// to `nul`, RetroArch's rwebpad driver falls back to its autoconfig binds
// (input_driver.c: `bind_joykey != NO_BTN ? bind_joykey : autobind_joykey`), so
// one physical press would reach the core twice, using RetroArch's own layout
// (built-in EMSCRIPTEN profile: a=1, b=0, x=3, y=2) — P1 A+B presses, swapped
// A/B and X/Y, and one pad driving two players.
//
// `input_joypad_driver = null` is the documented way to disable pad polling, but
// RetroArch 1.22.2 declares the null driver with a NULL init and
// input_joypad_init_driver() then falls back to the first working driver
// (rwebpad), so it is kept only for builds that do honour it. The enforced part
// is turning autodetection off plus hiding pads from the page-level reader in
// input/physicalGamepads.js — both are re-applied after the caller config, see
// buildRetroarchConfig below.
const NATIVE_GAMEPAD_DISABLED = {
  input_joypad_driver: 'null',
  input_autodetect_enable: false,
}

const DEFAULT_RETROARCH_CONFIG = {
  ...NATIVE_GAMEPAD_DISABLED,
  fastforward_ratio: 10,
  input_max_users: 4,
  input_libretro_device_p1: 1,
  input_libretro_device_p2: 1,
  input_libretro_device_p3: 1,
  input_libretro_device_p4: 1,
  input_player1_analog_dpad_mode: 1,
  input_player2_analog_dpad_mode: 1,
  input_player3_analog_dpad_mode: 1,
  input_player4_analog_dpad_mode: 1,
  rewind_enable: true,
  rewind_granularity: 4,
  rgui_menu_color_theme: 1,
  run_ahead_enabled: true,
  run_ahead_frames: 1,
}
const RUN_AHEAD_DISABLED_CORES = new Set([
  'fbneo',
  'mame2003_plus',
  'pcsx_rearmed',
  'nestopia',
  'fceumm',
  'quicknes',
  'mgba2',
  // 光盘机器与 J2ME 虚拟机都吃不住「多跑一帧再回滚」：前者一秒要喂几十兆的
  // 光盘数据，后者在字节码解释器上跑两遍会直接掉帧。
  'mednafen_pce_fast',
  'mednafen_ngp',
  'opera',
  'neocd',
  'squirreljme',
])
const REWIND_DISABLED_CORES = new Set([
  'mgba2',
  // Opera snapshots overflow the default 20 MB rewind buffer during CHD play,
  // producing an error every few frames. Keep manual snapshots, skip rewind.
  'opera',
])

/**
 * 核心文件的取回方式交给 useCoreAssets：发布清单里带着体积与 sha256，远端不
 * 可用时回退本机同版本文件。`fileName` 必须保持 `<core>_libretro.<ext>`：核心
 * 自己按这个名字认文件，我们的磁盘文件名不带 _libretro 只影响 URL。
 */
function localCoreFile(core, ext, progress = null) {
  return {
    fileName: `${core}_libretro.${ext}`,
    fileContent: loadCoreAsset({ core, ext, progress }),
  }
}

export function defaultRetroarchConfigForCore(core) {
  const config = RUN_AHEAD_DISABLED_CORES.has(core)
    ? {
        ...DEFAULT_RETROARCH_CONFIG,
        run_ahead_enabled: false,
        run_ahead_frames: 0,
      }
    : { ...DEFAULT_RETROARCH_CONFIG }

  if (REWIND_DISABLED_CORES.has(core)) {
    config.rewind_enable = false
    config.rewind_granularity = 0
  }

  return config
}

/**
 * Final RetroArch config handed to Nostalgist: core defaults, then caller
 * overrides, then the native-gamepad switches pinned back off so a caller can
 * never re-open the duplicate input path.
 */
export function buildRetroarchConfig(core, callerConfig = {}) {
  const config = { ...defaultRetroarchConfigForCore(core), ...(callerConfig || {}) }
  // A `null` or `undefined` override would leave Retropad's own driver active,
  // so the disable switches are written last, unconditionally.
  return { ...config, ...NATIVE_GAMEPAD_DISABLED }
}

/**
 * Prepare a Nostalgist instance (loads core + ROM + BIOS but does NOT start
 * the emulator loop yet). Call `.start()` on the returned instance once the
 * canvas is in the DOM.
 *
 * @param {Object} opts
 * @param {string} opts.core
 * @param {string} opts.romUrl
 * @param {string} [opts.romFileName]
 * @param {Array<{fileName,fileContent}>} [opts.bios]
 * @param {Object} [opts.retroarchConfig]
 * @param {Object} [opts.retroarchCoreConfig]
 * @param {string} [opts.shader]
 * @param {Object} [opts.progress] 资源加载进度会话（见 useResourceLoadProgress）
 */
export async function prepareEmulator({
  core,
  rom,           // string | { fileName, fileContent } | Array<{fileName, fileContent}>
  romUrl,        // legacy
  romFileName,   // legacy
  bios = [],
  retroarchConfig = {},
  retroarchCoreConfig = {},
  shader,
  progress = null,
  onRuntimeError = null,
  engine = null,      // J2ME：玩家在开局弹窗里选的类库（enginemode）
  cloudSave = null,   // J2ME：RMS 云存档的读写接口（见 j2meRuntime.js）
}) {
  // Normalize legacy arguments. When `rom` isn't passed, fall back to
  // romUrl/romFileName; otherwise pass `rom` through (Nostalgist accepts
  // strings, single {fileName,fileContent} objects, or arrays of them).
  const resolvedRom = rom !== undefined
    ? rom
    : (romFileName ? { fileName: romFileName, fileContent: romUrl } : romUrl)

  const coreName = typeof core === 'string' ? core : core?.name
  // Old saved settings may still name js2me or squirreljme. Every J2ME id runs
  // the self-hosted J2meJS runtime instead of a libretro core.
  if (coreName === 'j2mejs' || coreName === 'js2me' || coreName === 'squirreljme') {
    const { prepareJ2me } = await import('./player/j2meRuntime.js')
    return prepareJ2me({
      rom: resolvedRom, retroarchConfig, progress, onRuntimeError,
      // 类库只在玩家选过之后才带上来；没选（旧调用方）就用默认兼容库。
      ...(engine ? { engine } : {}),
      cloudSave,
    })
  }

  const localCore = typeof core === 'string'
    ? {
        name: core,
        js: localCoreFile(core, 'js', progress),
        wasm: localCoreFile(core, 'wasm', progress),
      }
    : core

  // Per-core defaults are keyed by name, including prepared core objects.

  // The core reads pads straight from the browser; hide them so RetroArch's
  // autoconfig path cannot replay every press (see physicalGamepads.js).
  installNativeGamepadGuard()

  const options = {
    ...createCoreBootGuard(coreName),
    core: localCore,
    rom: resolvedRom,
    respondToGlobalEvents: true,
    retroarchConfig: buildRetroarchConfig(coreName, retroarchConfig),
    retroarchCoreConfig,
    resolveCoreJs:   (c) => localCoreFile(c, 'js', progress),
    resolveCoreWasm: (c) => localCoreFile(c, 'wasm', progress),
  }
  if (bios?.length) options.bios = bios
  if (shader) options.shader = shader

  return Nostalgist.prepare(options)
}
