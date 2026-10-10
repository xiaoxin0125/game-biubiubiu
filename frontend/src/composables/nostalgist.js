// Thin wrapper around Nostalgist. Cores are served by our backend from
// `data/cores`, not from Nostalgist's CDN. We keep the two-phase prepare/start
// pattern so the caller can mount the generated canvas before the emulator runs.

import { Nostalgist } from 'nostalgist'
import { cachedFetch } from './useBlobCache.js'
import { installNativeGamepadGuard } from './input/physicalGamepads.js'

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
])
const SYNC_SENSITIVE_CORES = new Set([
  'mgba2',
])

function localCoreFile(core, ext) {
  return {
    fileName: `${core}_libretro.${ext}`,
    fileContent: cachedFetch(`/api/cores/${core}_libretro.${ext}`),
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

  if (SYNC_SENSITIVE_CORES.has(core)) {
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
}) {
  // Normalize legacy arguments. When `rom` isn't passed, fall back to
  // romUrl/romFileName; otherwise pass `rom` through (Nostalgist accepts
  // strings, single {fileName,fileContent} objects, or arrays of them).
  const resolvedRom = rom !== undefined
    ? rom
    : (romFileName ? { fileName: romFileName, fileContent: romUrl } : romUrl)

  const localCore = typeof core === 'string'
    ? {
        name: core,
        js: localCoreFile(core, 'js'),
        wasm: localCoreFile(core, 'wasm'),
      }
    : core

  // Per-core defaults (run-ahead, rewind) are keyed by name, also when the
  // caller hands over a prepared core object.
  const coreName = typeof core === 'string' ? core : core?.name

  // The core reads pads straight from the browser; hide them so RetroArch's
  // autoconfig path cannot replay every press (see physicalGamepads.js).
  installNativeGamepadGuard()

  const options = {
    core: localCore,
    rom: resolvedRom,
    respondToGlobalEvents: true,
    retroarchConfig: buildRetroarchConfig(coreName, retroarchConfig),
    retroarchCoreConfig,
    resolveCoreJs:   (c) => localCoreFile(c, 'js'),
    resolveCoreWasm: (c) => localCoreFile(c, 'wasm'),
  }
  if (bios?.length) options.bios = bios
  if (shader) options.shader = shader

  return Nostalgist.prepare(options)
}
