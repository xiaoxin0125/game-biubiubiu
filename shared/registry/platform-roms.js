// 表里没列出的平台在前端会回落到这里的默认值；扩展名与核心是前后端共用的唯一
// 来源（frontend/src/constants/platforms.js 里写的那两份会被覆盖）。
//
// 三对区域别名（nes/famicom、sfc/snes、megadrive/genesis）在本表里是两条完全
// 相同的记录：同一台硬件、同一套扩展名、同一批核心。改动其中一边（新增扩展名、
// 调整核心顺序）必须同步另一边，否则同一款游戏会因为上传时选了不同叫法而落到
// 不同核心上。
export const PLATFORM_ROM_REGISTRY = Object.freeze({
  arcade: {
    fileExtensions: ['.zip'],
    cores: ['fbneo', 'mame2003_plus'],
  },
  nes: {
    fileExtensions: ['.nes', '.unif', '.unf', '.zip'],
    cores: ['nestopia', 'fceumm', 'quicknes'],
  },
  famicom: {
    fileExtensions: ['.nes', '.unif', '.unf', '.zip'],
    cores: ['nestopia', 'fceumm', 'quicknes'],
  },
  fds: {
    fileExtensions: ['.fds', '.zip'],
    cores: ['nestopia', 'fceumm'],
  },
  sfc: {
    fileExtensions: ['.smc', '.sfc', '.zip'],
    cores: ['snes9x'],
  },
  snes: {
    fileExtensions: ['.smc', '.sfc', '.zip'],
    cores: ['snes9x'],
  },
  gb: {
    fileExtensions: ['.gb', '.zip'],
    cores: ['mgba', 'gambatte', 'gearboy', 'tgbdual'],
  },
  gbc: {
    fileExtensions: ['.gb', '.gbc', '.cgb', '.sgb', '.zip'],
    cores: ['mgba', 'gambatte', 'gearboy', 'tgbdual'],
  },
  gba: {
    fileExtensions: ['.gba', '.zip'],
    cores: ['mgba', 'mgba2', 'vba_next'],
  },
  megadrive: {
    fileExtensions: ['.md', '.gen', '.smd', '.bin', '.zip'],
    cores: ['genesis_plus_gx', 'picodrive'],
  },
  genesis: {
    fileExtensions: ['.md', '.gen', '.smd', '.bin', '.zip'],
    cores: ['genesis_plus_gx', 'picodrive'],
  },
  sms: {
    fileExtensions: ['.sms', '.zip'],
    cores: ['genesis_plus_gx', 'picodrive', 'gearsystem'],
  },
  gamegear: {
    fileExtensions: ['.gg', '.zip'],
    cores: ['genesis_plus_gx', 'gearsystem'],
  },
  psx: {
    fileExtensions: ['.chd', '.cue', '.bin', '.iso', '.pbp', '.m3u'],
    cores: ['pcsx_rearmed'],
  },
})

export const PLATFORM_IDS = Object.freeze(Object.keys(PLATFORM_ROM_REGISTRY))

export const PLATFORM_CORES = Object.freeze(Object.fromEntries(
  Object.entries(PLATFORM_ROM_REGISTRY).map(([platform, info]) => [platform, Object.freeze([...info.cores])]),
))

export const PLATFORM_FILE_EXTENSIONS = Object.freeze(Object.fromEntries(
  Object.entries(PLATFORM_ROM_REGISTRY).map(([platform, info]) => [platform, Object.freeze([...info.fileExtensions])]),
))

export function coresForPlatform(platform) {
  return PLATFORM_ROM_REGISTRY[platform]?.cores || []
}

export function fileExtensionsForPlatform(platform) {
  return PLATFORM_ROM_REGISTRY[platform]?.fileExtensions || []
}