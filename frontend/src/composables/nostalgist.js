// Thin wrapper around Nostalgist. Cores are served by our backend from
// `data/cores`, not from Nostalgist's CDN. We keep the two-phase prepare/start
// pattern so the caller can mount the generated canvas before the emulator runs.

import { Nostalgist } from 'nostalgist'
import { cachedFetch } from './useBlobCache.js'

// Sensible defaults cribbed from retroassembly's emulator-portal. Rewind stays
// enabled, while run-ahead is disabled for heavy cores where one extra frame of
// emulation can cost more than it saves on mobile devices.
const DEFAULT_RETROARCH_CONFIG = {
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
const RUN_AHEAD_DISABLED_CORES = new Set(['fbneo', 'mame2003_plus', 'pcsx_rearmed'])

function localCoreFile(core, ext) {
  return {
    fileName: `${core}_libretro.${ext}`,
    fileContent: cachedFetch(`/api/cores/${core}_libretro.${ext}`),
  }
}

function defaultRetroarchConfigForCore(core) {
  if (!RUN_AHEAD_DISABLED_CORES.has(core)) return DEFAULT_RETROARCH_CONFIG
  return {
    ...DEFAULT_RETROARCH_CONFIG,
    run_ahead_enabled: false,
    run_ahead_frames: 0,
  }
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

  const options = {
    core: localCore,
    rom: resolvedRom,
    respondToGlobalEvents: true,
    retroarchConfig: { ...defaultRetroarchConfigForCore(core), ...retroarchConfig },
    retroarchCoreConfig,
    resolveCoreJs:   (c) => localCoreFile(c, 'js'),
    resolveCoreWasm: (c) => localCoreFile(c, 'wasm'),
  }
  if (bios?.length) options.bios = bios
  if (shader) options.shader = shader

  return Nostalgist.prepare(options)
}
