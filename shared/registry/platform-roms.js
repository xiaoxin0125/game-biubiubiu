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
  // NEC —— 卡带与光盘分两个平台（扩展名不重叠，同一个核心）。
  pcengine: {
    fileExtensions: ['.pce', '.zip'],
    cores: ['mednafen_pce_fast'],
  },
  pcecd: {
    fileExtensions: ['.chd', '.cue', '.ccd', '.toc', '.m3u'],
    cores: ['mednafen_pce_fast'],
  },
  // SNK —— Neo Geo CD 的 BIOS 要放进模拟器系统目录的 neocd/ 子目录（见 platform-bios.js）。
  neogeocd: {
    fileExtensions: ['.chd', '.cue'],
    cores: ['neocd'],
  },
  ngp: {
    fileExtensions: ['.ngp', '.ngc', '.ngpc', '.npc', '.zip'],
    cores: ['mednafen_ngp'],
  },
  // 3DO —— Opera 核心的 BIOS 是日版 FZ-1（panafz1j.bin）+ 日版字库 ROM。
  '3do': {
    fileExtensions: ['.chd', '.cue', '.iso', '.bin'],
    cores: ['opera'],
  },
  // Sega Super 32X —— 只有 picodrive 支持 32X，genesis_plus_gx 不支持。
  sega32x: {
    fileExtensions: ['.32x', '.bin', '.gen', '.md', '.zip'],
    cores: ['picodrive'],
  },
  // J2ME 使用本机托管的 J2meJS；JAD/JAM 是描述文件，不是可独立启动的游戏。
  j2me: {
    fileExtensions: ['.jar'],
    cores: ['j2mejs'],
  },
})

// 上传页按扩展名自动识别平台。
//
// 只给「一个扩展名基本只可能属于一台机器」的情况定归属。光盘镜像（.cue / .chd /
// .iso / .bin）和 .bin 卡带多台机器共用，猜错会让游戏挂到别的核心上、也拿不到对应
// 的 BIOS，所以一律不自动识别，交给上传者自己选。.zip 保留街机：打包的街机 ROM 集
// 是最常见的一类上传，而其他平台把 .zip 只当作兼容的打包格式。
export const PLATFORM_AUTO_DETECT_BY_EXTENSION = Object.freeze({
  zip: 'arcade',
  nes: 'nes',
  unif: 'nes',
  unf: 'nes',
  fds: 'fds',
  smc: 'sfc',
  sfc: 'sfc',
  gb: 'gb',
  gbc: 'gbc',
  cgb: 'gbc',
  sgb: 'gbc',
  gba: 'gba',
  md: 'megadrive',
  gen: 'megadrive',
  smd: 'megadrive',
  sms: 'sms',
  gg: 'gamegear',
  pbp: 'psx',
  pce: 'pcengine',
  ngp: 'ngp',
  ngc: 'ngp',
  ngpc: 'ngp',
  npc: 'ngp',
  '32x': 'sega32x',
  jar: 'j2me',
})

/** 按上传文件名猜平台；猜不出（多台机器共用这个扩展名）时返回空字符串。 */
export function autoDetectPlatform(fileName) {
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || ''
  if (!ext || ext === String(fileName || '').toLowerCase()) return ''
  const platform = PLATFORM_AUTO_DETECT_BY_EXTENSION[ext]
  return platform && PLATFORM_ROM_REGISTRY[platform] ? platform : ''
}

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