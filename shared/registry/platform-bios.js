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
})

export const BIOS_PLATFORM_LABELS = Object.freeze({
  arcade: '街机',
  psx: 'PlayStation',
  fds: 'Famicom Disk System',
})

export function biosFilesForPlatform(platform) {
  return BIOS_BY_PLATFORM[platform] || []
}

export function platformRequiresBios(platform) {
  return biosFilesForPlatform(platform).length > 0
}