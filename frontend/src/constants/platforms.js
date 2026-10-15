import { PLATFORM_ROM_REGISTRY } from '../../../shared/registry/platform-roms.js'
import { PLATFORM_DEFAULT_MAX_PLAYERS } from '../../../shared/registry/platform-players.js'

// Platform registry. Trimmed to the platforms actually played in the CN market
// (arcade / Nintendo family / Sega family / Sony / NEC / SNK / 3DO / J2ME).
// 后面这几台的卡带与光盘机（PC Engine 与 PC Engine CD、Neo Geo Pocket 与
// Neo Geo CD、3DO、Super 32X、J2ME）是 v1.6.0 加回来的：核心来自 libretro 的
// v1.22.2 构建，BIOS 需要的文件见 shared/registry/platform-bios.js。
//
// Each entry: displayName (cn), shortLabel (tab badge), manufacturer,
// releaseDate, libretroName, fileExtensions, cores (priority order — first is
// default), buttons (which retropad buttons the platform actually uses).
//
// 三对「区域别名」：nes = famicom（红白机 / NES）、sfc = snes（超任 / SNES）、
// megadrive = genesis（日版 MD / 美版 Genesis）。同组两边是同一台硬件 —— 扩展名、
// 核心、默认人数、按键、虚拟手柄布局、键盘默认值全部逐项相同，只有给玩家看的
// displayName / shortLabel / color 不一样（nes 与 famicom 连 color 都一样）。
// 所以不要把它俩当两台机器写分支：要按机器判断的地方一律用一份判断覆盖两边，
// 例如下面的 NES_PLATFORM_IDS、VirtualGamepad 的 pickLayout、tabGroups 的分组。
// 保留两个 id 只是让上传者能自己选日版还是美版叫法。代价是 platform 是 ROM 记录
// 上的字段兼分组键（父子版本要求同平台、上传目录按平台分），同一款游戏一份标
// nes、一份标 famicom 就不能互为版本，卡片标签也会不一致 —— 但上传页的自动识别
// 按本表顺序取第一个匹配，只会给出 nes / sfc / megadrive，别名得手动选。
// releaseDate 与 libretroName 目前没有任何代码读取，只是资料性字段。

const DPAD = ['up', 'down', 'left', 'right']
const BTN_NES   = [...DPAD, 'a', 'b', 'start', 'select']
const BTN_NES_PC = [...DPAD, 'a', 'b', 'x', 'y', 'start', 'select']
// FDS：本机是台「磁盘机」，换面 / 换盘不是游戏按键，而是 core 自己的动作 ——
// nestopia 与 fceumm 都把这两件事绑在 retropad 的 L / R 上（见两个 core 的
// libretro.c：L = 换面/选面，R = 换盘/弹出插入）。所以这两个键只给 FDS 平台开放，
// 其余 FC / NES 平台保持原来的 2 键 + 连发。
const BTN_FDS   = [...BTN_NES, 'l', 'r']
const BTN_FDS_PC = [...BTN_NES_PC, 'l', 'r']
const BTN_GB    = [...DPAD, 'a', 'b', 'start', 'select']
const BTN_GBA   = [...DPAD, 'a', 'b', 'l', 'r', 'start', 'select']
const BTN_SNES  = [...DPAD, 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select']
const BTN_MD    = [...DPAD, 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select']
const BTN_PSX   = [...DPAD, 'a', 'b', 'x', 'y', 'l', 'r', 'l2', 'r2', 'start', 'select']
const BTN_ARCADE = [...DPAD, 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select']
const BTN_SIMPLE = [...DPAD, 'a', 'b', 'start']
// PC Engine / PCE-CD：同一个核心（Beetle PCE Fast）。b/a 是主机自带的两颗 I / II，
// x/y/l/r 是六键手柄（Avenue Pad 6）上的 III / IV / V / VI，l2 是它的 2/6 键切换键。
// 核心默认按两键手柄启动（六键在少数游戏里会被认错），玩家按「模式」键随时切到六键。
const BTN_PCE   = [...DPAD, 'a', 'b', 'x', 'y', 'l', 'r', 'l2', 'start', 'select']
// Neo Geo CD：四颗面键 A/B/C/D + Start / Select（NeoCD 核心还额外接了 B+C、A+B 这类
// 组合键，那些放在 L / L2 / R2 上，触屏手柄摆不下，就没给用户开放）。
const BTN_NEOGEO = [...DPAD, 'a', 'b', 'x', 'y', 'start', 'select']
// Neo Geo Pocket / Color：A / B 加 Option（机身菜单键）。
const BTN_NGP   = [...DPAD, 'a', 'b', 'start']
// 3DO：面键 A / B / C 三颗 + L / R 肩键，X（停止）与 P（播放/暂停）借用系统的
// select / start 两行。
const BTN_3DO   = [...DPAD, 'a', 'b', 'y', 'l', 'r', 'start', 'select']
// J2ME：面键与肩键沿用手机键盘的数字键标签，十字键发手机的导航键代码。
const BTN_J2ME  = [...DPAD, 'a', 'b', 'x', 'y', 'l', 'r', 'l2', 'r2', 'start', 'select']
const withTurbo = (buttons) => [...buttons]
const NES_PC_TURBO_BUTTONS = Object.freeze({ x: 'a', y: 'b' })
const NES_PLATFORM_IDS = new Set(['nes', 'famicom', 'fds'])

// 键盘用的行：FC/NES 系列在电脑上多出 x/y 两行（连发 A / 连发 B），FDS 再多出
// L / R 两行（换面 / 换盘）。触屏手柄不摆这两颗键，换面 / 换盘由播放页的动作按钮
// 负责，所以 PC 与触屏用的是两张不同的表。
export function pcButtonsForPlatform(id) {
  if (id === 'fds') return withTurbo(BTN_FDS_PC)
  return NES_PLATFORM_IDS.has(id) ? withTurbo(BTN_NES_PC) : getPlatform(id).buttons
}

export function turboButtonsForPlatform(id) {
  return NES_PLATFORM_IDS.has(id) ? NES_PC_TURBO_BUTTONS : {}
}

export function turboTargetForPlatform(button, platform) {
  return turboButtonsForPlatform(platform)?.[button]
}

export const platforms = {
  arcade: {
    displayName: '街机',
    shortLabel: 'ARCADE',
    manufacturer: '多厂商',
    releaseDate: '1971-10-15',
    libretroName: 'MAME',
    color: '#af52de',
    fileExtensions: ['.zip'],
    cores: ['fbneo', 'mame2003_plus'],
    requiresBios: true,
  },

  // Nintendo
  nes: {
    displayName: 'Nintendo Entertainment System',
    shortLabel: 'NES',
    manufacturer: 'Nintendo',
    releaseDate: '1983-07-15',
    libretroName: 'Nintendo - Nintendo Entertainment System',
    color: '#ff3b30',
    fileExtensions: ['.nes', '.unif', '.unf', '.zip'],
    cores: ['nestopia', 'fceumm', 'quicknes'],
    buttons: withTurbo(BTN_NES),
  },
  // 别名：与上面的 nes 同一台硬件（日版叫红白机 / FC），配置逐项相同。
  famicom: {
    displayName: '任天堂红白机 (Famicom)',
    shortLabel: 'FC',
    manufacturer: 'Nintendo',
    releaseDate: '1983-07-15',
    libretroName: 'Nintendo - Famicom',
    color: '#ff3b30',
    fileExtensions: ['.nes', '.unif', '.unf', '.zip'],
    cores: ['nestopia', 'fceumm', 'quicknes'],
    buttons: withTurbo(BTN_NES),
  },
  fds: {
    displayName: '任天堂磁碟机',
    shortLabel: 'FDS',
    manufacturer: 'Nintendo',
    releaseDate: '1986-02-21',
    libretroName: 'Nintendo - Family Computer Disk System',
    color: '#ff3b30',
    fileExtensions: ['.fds', '.zip'],
    cores: ['nestopia', 'fceumm'],
    buttons: withTurbo(BTN_FDS),
  },
  sfc: {
    displayName: 'Super Famicom',
    shortLabel: 'SFC',
    manufacturer: 'Nintendo',
    releaseDate: '1990-11-21',
    libretroName: 'Nintendo - Super Famicom',
    color: '#007aff',
    fileExtensions: ['.smc', '.sfc', '.zip'],
    cores: ['snes9x'],
  },
  // 别名：与上面的 sfc 同一台硬件（美版叫 SNES），只有颜色深浅不同。
  snes: {
    displayName: 'Super Nintendo',
    shortLabel: 'SNES',
    manufacturer: 'Nintendo',
    releaseDate: '1991-08-23',
    libretroName: 'Nintendo - Super Nintendo Entertainment System',
    color: '#409fff',
    fileExtensions: ['.smc', '.sfc', '.zip'],
    cores: ['snes9x'],
  },
  gb: {
    displayName: 'Game Boy',
    shortLabel: 'GB',
    manufacturer: 'Nintendo',
    releaseDate: '1989-04-21',
    libretroName: 'Nintendo - Game Boy',
    color: '#8e8e93',
    fileExtensions: ['.gb', '.zip'],
    cores: ['mgba', 'gambatte', 'gearboy', 'tgbdual'],
  },
  gbc: {
    displayName: 'Game Boy Color',
    shortLabel: 'GBC',
    manufacturer: 'Nintendo',
    releaseDate: '1998-10-21',
    libretroName: 'Nintendo - Game Boy Color',
    color: '#5856d6',
    fileExtensions: ['.gb', '.gbc', '.cgb', '.sgb', '.zip'],
    cores: ['mgba', 'gambatte', 'gearboy', 'tgbdual'],
  },
  gba: {
    displayName: 'Game Boy Advance',
    shortLabel: 'GBA',
    manufacturer: 'Nintendo',
    releaseDate: '2001-06-11',
    libretroName: 'Nintendo - Game Boy Advance',
    color: '#34c759',
    fileExtensions: ['.gba', '.zip'],
    cores: ['mgba', 'mgba2', 'vba_next'],
  },

  // Sega
  megadrive: {
    displayName: 'Mega Drive',
    shortLabel: 'MD',
    manufacturer: 'Sega',
    releaseDate: '1988-10-29',
    libretroName: 'Sega - Mega Drive',
    color: '#ff9500',
    fileExtensions: ['.md', '.gen', '.smd', '.bin', '.zip'],
    cores: ['genesis_plus_gx', 'picodrive'],
  },
  // 别名：与上面的 megadrive 同一台硬件（美版叫 Genesis），配置逐项相同。
  genesis: {
    displayName: 'Genesis',
    shortLabel: 'GEN',
    manufacturer: 'Sega',
    releaseDate: '1989-08-14',
    libretroName: 'Sega - Genesis',
    color: '#ff9500',
    fileExtensions: ['.md', '.gen', '.smd', '.bin', '.zip'],
    cores: ['genesis_plus_gx', 'picodrive'],
  },
  sms: {
    displayName: 'Master System',
    shortLabel: 'SMS',
    manufacturer: 'Sega',
    releaseDate: '1985-10-20',
    libretroName: 'Sega - Master System',
    color: '#ff9f0a',
    fileExtensions: ['.sms', '.zip'],
    cores: ['genesis_plus_gx', 'picodrive', 'gearsystem'],
  },
  gamegear: {
    displayName: 'Game Gear',
    shortLabel: 'GG',
    manufacturer: 'Sega',
    releaseDate: '1990-10-06',
    libretroName: 'Sega - Game Gear',
    color: '#ffb340',
    fileExtensions: ['.gg', '.zip'],
    cores: ['genesis_plus_gx', 'gearsystem'],
  },
  sega32x: {
    displayName: 'Super 32X',
    shortLabel: '32X',
    manufacturer: 'Sega',
    releaseDate: '1994-11-21',
    libretroName: 'Sega - 32X',
    color: '#ffd60a',
    fileExtensions: ['.32x', '.bin', '.gen', '.md', '.zip'],
    // genesis_plus_gx 不支持 32X，只能走 picodrive。
    cores: ['picodrive'],
  },

  // Sony
  psx: {
    displayName: 'PlayStation',
    shortLabel: 'PS1',
    manufacturer: 'Sony',
    releaseDate: '1994-12-03',
    libretroName: 'Sony - PlayStation',
    color: '#ff375f',
    fileExtensions: ['.chd', '.cue', '.bin', '.iso', '.pbp', '.m3u'],
    cores: ['pcsx_rearmed'],
  },

  // NEC
  pcengine: {
    displayName: 'PC Engine',
    shortLabel: 'PCE',
    manufacturer: 'NEC',
    releaseDate: '1987-10-30',
    libretroName: 'NEC - PC Engine',
    color: '#ff6b35',
    fileExtensions: ['.pce', '.zip'],
    cores: ['mednafen_pce_fast'],
    buttons: withTurbo(BTN_PCE),
  },
  pcecd: {
    displayName: 'PC Engine CD',
    shortLabel: 'PCE-CD',
    manufacturer: 'NEC',
    releaseDate: '1988-12-04',
    libretroName: 'NEC - PC Engine CD',
    color: '#ff8c42',
    fileExtensions: ['.chd', '.cue', '.ccd', '.toc', '.m3u'],
    cores: ['mednafen_pce_fast'],
    requiresBios: true,
    buttons: withTurbo(BTN_PCE),
  },

  // SNK
  neogeocd: {
    displayName: 'Neo Geo CD',
    shortLabel: 'NEOCD',
    manufacturer: 'SNK',
    releaseDate: '1994-09-09',
    libretroName: 'SNK - Neo Geo CD',
    color: '#d4af37',
    fileExtensions: ['.chd', '.cue'],
    cores: ['neocd'],
    requiresBios: true,
    buttons: withTurbo(BTN_NEOGEO),
  },
  ngp: {
    displayName: 'Neo Geo Pocket / Color',
    shortLabel: 'NGP',
    manufacturer: 'SNK',
    releaseDate: '1998-10-28',
    libretroName: 'SNK - Neo Geo Pocket / Color',
    color: '#5ac8fa',
    fileExtensions: ['.ngp', '.ngc', '.ngpc', '.npc', '.zip'],
    cores: ['mednafen_ngp'],
  },

  // 3DO
  '3do': {
    displayName: '3DO Interactive Multiplayer',
    shortLabel: '3DO',
    manufacturer: 'The 3DO Company',
    releaseDate: '1993-10-04',
    libretroName: 'The 3DO Company - 3DO',
    color: '#bf5af2',
    fileExtensions: ['.chd', '.cue', '.iso', '.bin'],
    cores: ['opera'],
    requiresBios: true,
    buttons: withTurbo(BTN_3DO),
  },

  // 手机游戏
  j2me: {
    displayName: 'Java ME (J2ME 手机游戏)',
    shortLabel: 'J2ME',
    manufacturer: '各手机厂商',
    releaseDate: '2000-05-01',
    libretroName: 'Java ME (J2meJS)',
    color: '#64d2ff',
    fileExtensions: ['.jar'],
    cores: ['js2me'],
    requiresBios: false,
    buttons: withTurbo(BTN_J2ME),
  },
}

// Tab grouping by manufacturer (for Gallery tabs)
export const tabGroups = {
  arcade:   { label: '街机',   platforms: ['arcade'] },
  nintendo: { label: '任天堂', platforms: ['nes', 'famicom', 'fds', 'sfc', 'snes', 'gb', 'gbc', 'gba'] },
  sega:     { label: '世嘉',   platforms: ['megadrive', 'genesis', 'sega32x', 'sms', 'gamegear'] },
  sony:     { label: '索尼',   platforms: ['psx'] },
  nec:      { label: 'NEC',    platforms: ['pcengine', 'pcecd'] },
  snk:      { label: 'SNK',    platforms: ['neogeocd', 'ngp'] },
  '3do':    { label: '3DO',    platforms: ['3do'] },
  j2me:     { label: '手机游戏', platforms: ['j2me'] },
}

// Button profile per platform — attached after definition to keep the registry
// table tidy. Anything not listed falls back to BTN_NES (basic 2-button + D-pad).
const BUTTON_PROFILES = {
  arcade:     withTurbo(BTN_ARCADE),
  nes:        withTurbo(BTN_NES),
  famicom:    withTurbo(BTN_NES),
  fds:        withTurbo(BTN_FDS),
  sfc:        withTurbo(BTN_SNES),
  snes:       withTurbo(BTN_SNES),
  gb:         withTurbo(BTN_GB),
  gbc:        withTurbo(BTN_GB),
  gba:        withTurbo(BTN_GBA),
  megadrive:  withTurbo(BTN_MD),
  genesis:    withTurbo(BTN_MD),
  sms:        withTurbo(BTN_SIMPLE),
  gamegear:   withTurbo(BTN_SIMPLE),
  psx:        withTurbo(BTN_PSX),
  pcengine:   withTurbo(BTN_PCE),
  pcecd:      withTurbo(BTN_PCE),
  neogeocd:   withTurbo(BTN_NEOGEO),
  ngp:        withTurbo(BTN_NGP),
  '3do':      withTurbo(BTN_3DO),
  sega32x:    withTurbo(BTN_MD),
  j2me:       withTurbo(BTN_J2ME),
}

export const platformDefaultMaxPlayers = PLATFORM_DEFAULT_MAX_PLAYERS

// 扩展名与核心以上面 import 的共享表为准，本表里写的这两项会被这里覆盖（两边目前
// 逐项一致）。后端上传校验、BIOS、默认人数都读共享表，所以只改这里不生效。
for (const [id, p] of Object.entries(platforms)) {
  const romRegistry = PLATFORM_ROM_REGISTRY[id]
  if (romRegistry) {
    p.fileExtensions = [...romRegistry.fileExtensions]
    p.cores = [...romRegistry.cores]
  }
  p.buttons = BUTTON_PROFILES[id] || BTN_NES
  p.maxPlayers = platformDefaultMaxPlayers[id] || 1
}

// Per-platform face-button label overrides. The internal retropad keys
// (a/b/x/y/l/r/l2/r2) never change — we just relabel what the user sees so
// arcade shows "A B C D" (Neo Geo convention) instead of the confusing
// "A B X Y", Mega Drive shows "X Y Z / A B C", PlayStation uses the symbols
// etc. Platforms not listed use the generic A/B/X/Y which is already correct
// for SNES/SFC/GB/GBC/GBA/NES families.
const BUTTON_LABELS = {
  // Arcade — FBNeo retropad→Neo Geo mapping is NOT one-to-one:
  //   retropad a → game's B,  retropad b → game's A
  //   retropad x → game's D,  retropad y → game's C
  // Show labels that match what the game actually sees, so users binding keys
  // aren't surprised by "A" triggering B.
  arcade:    { a: 'B', b: 'A', x: 'D', y: 'C', l: 'E', r: 'F' },

  // Sega Genesis / Mega Drive — genesis_plus_gx and picodrive both declare the
  // same retropad mapping (see the cores' retro_input_descriptor tables):
  //   b→B, a→C, y→A, x→Y, l→X, r→Z, select→Mode
  // i.e. retropad buttons map by PHYSICAL POSITION on the pad, not by letter:
  // retro y is where MD "A" sits, retro b where MD "B" sits, retro a where MD
  // "C" sits. Labeling a→'B' / b→'A' (what we had) made the on-screen "A" fire
  // the game's B and so on.
  megadrive: { a: 'C', b: 'B', x: 'Y', y: 'A', l: 'X', r: 'Z' },
  genesis:   { a: 'C', b: 'B', x: 'Y', y: 'A', l: 'X', r: 'Z' },
  // 32X 用的就是 MD 的六键手柄，映射与上面两行逐项相同。
  sega32x:   { a: 'C', b: 'B', x: 'Y', y: 'A', l: 'X', r: 'Z' },

  // Sega Master System / Game Gear — retropad_b is Button 1 (primary)
  sms:       { a: '2', b: '1' },
  gamegear:  { a: '2', b: '1' },

  // PlayStation — retropad_a → ◯, retropad_b → ✕ (matches physical layout)
  psx:       { a: '◯', b: '✕', x: '△', y: '□', l: 'L1', r: 'R1', l2: 'L2', r2: 'R2' },

  // NES/SNES/GB/GBC/GBA/FC/SFC/FDS ship as A/B (+X/Y/L/R for SFC/SNES/GBA),
  // which is the native hardware labeling. FC/NES 系列在 PC 上多出 X/Y 两行，
  // 它们是 core 的「连发 A / 连发 B」，这里把标签写明，避免玩家以为 X/Y 是普通按键。
  nes:       { x: '连发A', y: '连发B' },
  famicom:   { x: '连发A', y: '连发B' },
  // FDS 的 L / R 不是手柄上的肩键，而是磁碟机的两个动作：L = 换面（A / B 面），
  // R = 换盘（弹出 / 插回，多盘游戏用来换到另一张盘）。标签直接写成动作名，
  // 按键设置里才不会出现「L / R 是干什么的」这种疑问。
  fds:       { x: '连发A', y: '连发B', l: '换面', r: '换盘' },

  // PC Engine / PCE-CD — Beetle PCE Fast 的 retropad 映射（见核心的
  // retro_input_descriptor 表）：b→II, a→I, y→III, x→IV, l→V, r→VI,
  // l2→Mode Switch（六键手柄的 2 键 / 6 键切换）, select→Select, start→Run。
  // 主机自带的两颗是 I / II，III–VI 只有插上六键手柄才有；核心默认按两键启动
  // （六键在少数游戏里会被认错），所以把「模式」也摆出来，玩家自己切。
  pcengine:  { a: 'I', b: 'II', y: 'III', x: 'IV', l: 'V', r: 'VI', l2: '模式', select: 'SELECT', start: 'RUN' },
  pcecd:     { a: 'I', b: 'II', y: 'III', x: 'IV', l: 'V', r: 'VI', l2: '模式', select: 'SELECT', start: 'RUN' },

  // Neo Geo CD — 与街机平台同一套「retropad 与游戏按键反着来」的对应
  // （NeoCD 核心的表里 b→A、a→B、y→C、x→D）。
  neogeocd:  { a: 'B', b: 'A', x: 'D', y: 'C' },

  // Neo Geo Pocket / Color — b→A，a→B，start→Option（机身菜单键）。
  ngp:       { a: 'B', b: 'A', start: 'Option' },

  // 3DO — Opera：y→A，b→B，a→C（手柄上从左到右就是 A B C），l / r→肩键，
  // select→X（停止），start→P（播放/暂停）。
  '3do':     { a: 'C', b: 'B', y: 'A', l: 'L', r: 'R', select: 'X', start: 'P' },

  // J2ME — J2meJS 适配器把 retropad 标识映射到手机键盘；保留原来的按键标签：
  //   x→1（游戏A），a→3（游戏B），y→7（游戏C），b→9（游戏D），
  //   l2→5（开火 / 确定），l→＊，r→＃，select / start→左软键 / 右软键。
  j2me:       { a: '3', b: '9', x: '1', y: '7', l: '＊', r: '＃', l2: '5 确定', r2: '0', select: '软键1', start: '软键2' },
}
for (const [id, p] of Object.entries(platforms)) {
  p.buttonLabels = BUTTON_LABELS[id] || null
}

export function getPlatform(id) {
  return platforms[id] || platforms.nes
}
