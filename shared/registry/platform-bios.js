// 各平台需要的 BIOS / 固件文件。表里写的是「本机 data/bios/<平台>/ 下的文件名」，
// 后端 /api/bios/<平台>/<文件> 与后台的 BIOS 检查都以它为准。
export const BIOS_BY_PLATFORM = Object.freeze({
  arcade: Object.freeze([
    'neogeo.zip',
    'pgm.zip',
    'nmk004.zip',
    'cchip.zip',
    'decocass.zip',
    'isgsm.zip',
    'midssio.zip',
    'bubsys.zip',
    'ym2608.zip',
    'skns.zip',
  ]),
  psx: Object.freeze([
    'scph5500.bin',
    'scph5501.bin',
    'scph5502.bin',
    'scph7001.bin',
    'psxonpsp660.bin',
  ]),
  fds: Object.freeze(['disksys.rom']),
  // Beetle PCE Fast：CD 游戏需要 System Card 3（核心默认就选它）。卡带游戏不用 BIOS。
  pcecd: Object.freeze(['syscard3.pce']),
  // Opera（3DO）：日版 FZ-1 的 BIOS 与配套的日版字库 ROM，缺字库时日文游戏会花屏。
  '3do': Object.freeze(['panafz1j.bin', 'panafz1j-kanji.bin']),
  // NeoCD：前开盖版 BIOS 加 Y-ZOOM ROM。光盘引导必须要 Y-ZOOM。
  neogeocd: Object.freeze(['neocd_f.rom', 'ng-lo.rom']),
  // J2ME 的 J2meJS 运行时自带 Java 类库，无需 BIOS。
})

// 同一份 BIOS 在模拟器系统目录里的落点与它在 data/bios 下的文件名不一致时的对应表。
// NeoCD 核心按 system/neocd/ 找 BIOS（见 neocd_libretro.info 的 firmware*_path），
// 我们磁盘上仍按平台平铺存放 —— 后端路由只接受文件名，子目录由前端在挂载时补。
export const BIOS_MOUNT_PATHS = Object.freeze({
  neogeocd: Object.freeze({
    'neocd_f.rom': 'neocd/neocd_f.rom',
    'ng-lo.rom': 'neocd/ng-lo.rom',
  }),
})

export const BIOS_PLATFORM_LABELS = Object.freeze({
  arcade: '街机',
  psx: 'PlayStation',
  fds: 'Famicom Disk System',
  pcecd: 'PC Engine CD',
  '3do': '3DO',
  neogeocd: 'Neo Geo CD',
})

export function biosFilesForPlatform(platform) {
  return BIOS_BY_PLATFORM[platform] || []
}

/** BIOS 在模拟器系统目录里的落点（多数平台就是文件名本身）。 */
export function biosMountPathFor(platform, fileName) {
  return BIOS_MOUNT_PATHS[platform]?.[fileName] || fileName
}

export function platformRequiresBios(platform) {
  return biosFilesForPlatform(platform).length > 0
}
