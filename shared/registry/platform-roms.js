// 表里没列出的平台在前端会回落到这里的默认值；扩展名与核心是前后端共用的唯一
// 来源（frontend/src/constants/platforms.js 里写的那两份会被覆盖）。
//
// 同一台硬件的两个区域叫法只保留通用名那一条：红白机 / NES 记作 nes，超任 / SNES
// 记作 sfc，世嘉五代 / MD / Genesis 记作 megadrive。三种叫法的机器、扩展名、核心
// 完全一样，各留一条只会让同一台机器在分类筛选里出现两项，其中一项一盘游戏都没有。
// 旧记录里的别名（famicom / snes / genesis）由下面的 PLATFORM_ALIASES 收敛到通用名：
// 上传、改平台时用 normalizePlatformId() 先归一，读旧数据时也按同一张表合并。
export const PLATFORM_ROM_REGISTRY = Object.freeze({
  arcade: {
    fileExtensions: ['.zip'],
    cores: ['fbneo', 'mame2003_plus'],
  },
  nes: {
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

// 区域别名 → 通用平台 id。NES 与 FC（红白机）、SNES 与 SFC（超任）、Genesis 与
// MD（世嘉五代）分别是同一台硬件的两个叫法，注册表里只留通用名那一条，别名只在
// 读旧数据时用得上：历史 ROM 记录、旧客户端上传时填的平台、玩家浏览器里存下来的
// 设置都可能还写着别名。写入数据库之前一律先 normalizePlatformId()。
export const PLATFORM_ALIASES = Object.freeze({
  famicom: 'nes',
  snes: 'sfc',
  genesis: 'megadrive',
})

/** 把平台 id 收敛到通用名；不是别名的（含空值、未知 id）原样返回。 */
export function normalizePlatformId(platform) {
  const id = String(platform ?? '').trim()
  return PLATFORM_ALIASES[id] || id
}

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