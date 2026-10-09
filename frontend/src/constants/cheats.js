// Cheat (金手指) reference data.
//
// Codes are handed to RetroArch's cheat manager through the core's exported
// `_cmd_cheat_*` bridge and registered as CHEAT_HANDLER_TYPE_EMU, which means
// the running core parses the code text itself. Support therefore depends on
// the core, not on the platform: libretro cores that never implemented
// `retro_cheat_set` (QuickNES, TGB Dual, FBNeo, MAME 2003-Plus ...) simply
// ignore whatever we send.
export const CHEAT_CAPABLE_CORES = new Set([
  'nestopia',          // NES: Game Genie / Pro Action Rocky / 地址:数值
  'fceumm',            // NES
  'snes9x',            // SFC/SNES
  'mgba',              // GB/GBC/GBA
  'mgba2',             // GB/GBC/GBA（本项目自建 mgba 变体）
  'vba_next',          // GBA
  'gambatte',          // GB/GBC
  'gearboy',           // GB/GBC
  'genesis_plus_gx',   // MD/Genesis/SMS/GG
  'picodrive',         // MD/Genesis
  'pcsx_rearmed',      // PS1
])

export function coreSupportsCheats(core) {
  return CHEAT_CAPABLE_CORES.has(core)
}
