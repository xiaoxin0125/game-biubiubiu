import { getPlatform } from '../constants/platforms.js'
import { BIOS_BY_PLATFORM, biosMountPathFor } from '../../../shared/registry/platform-bios.js'
import { PLATFORM_CORE_DEFAULT_MAX_PLAYERS, isSinglePlayerPlatform } from '../../../shared/registry/platform-players.js'

export function getPlatformInfo(platformId, { core } = {}) {
  const p = getPlatform(platformId)
  const selectedCore = core && p.cores.includes(core) ? core : p.cores[0]
  return {
    core: selectedCore,
    label: p.shortLabel,
    displayName: p.displayName,
    color: p.color,
    manufacturer: p.manufacturer,
    maxPlayers: maxPlayersForPlatformCore(platformId, selectedCore),
  }
}

const PLATFORM_CORE_MAX_PLAYERS = PLATFORM_CORE_DEFAULT_MAX_PLAYERS

function maxPlayersForPlatformCore(platformId, core) {
  // 单人机不走核心级的例外（例如 GBA 的联机线缆核心），一律一席。
  if (isSinglePlayerPlatform(platformId)) return 1
  const p = getPlatform(platformId)
  return PLATFORM_CORE_MAX_PLAYERS[platformId]?.[core] || p.maxPlayers || 1
}

export function buildPlatformCoreConfig({ platform, core, players = 1 } = {}) {
  return {
    ...buildPlatformCoreOptions({ platform, core }),
    ...buildPlatformNetplayCoreConfig({ platform, core, players }),
  }
}

// Core options that a platform needs regardless of player count. PicoDrive
// defaults to a 3-button pad, which makes X/Y/Z unreachable no matter what the
// player presses; force the 6-button pad where the hardware had one. SMS/GG
// keep the default (their pads are 2-button). 32X 的手柄本来就是六键，一并钉死，
// 免得 PicoDrive 按三键处理（32X 游戏会读不出 X/Y/Z）。
const SIX_BUTTON_PAD_OPTIONS = Object.freeze({
  picodrive_input1: '6 button pad',
  picodrive_input2: '6 button pad',
})

const PLATFORM_CORE_OPTIONS = {
  megadrive: { picodrive: { ...SIX_BUTTON_PAD_OPTIONS } },
  genesis:   { picodrive: { ...SIX_BUTTON_PAD_OPTIONS } },
  sega32x:   { picodrive: { ...SIX_BUTTON_PAD_OPTIONS } },
  // Opera 的核心选项里 BIOS / 字库按「系统目录里确实存在的文件」列出，取值就是文件名。
  // 默认不填的话核心自己挑，日文游戏（本机这份 3DO 游戏是日版）缺日版字库会显示不出汉字，
  // 所以这里点名用日版 FZ-1 BIOS + 日版字库 ROM。
  '3do': {
    opera: {
      opera_bios: 'panafz1j.bin',
      opera_font: 'panafz1j-kanji.bin',
    },
  },
}

export function buildPlatformCoreOptions({ platform, core } = {}) {
  return PLATFORM_CORE_OPTIONS[platform]?.[core] || {}
}

const PLATFORM_NETPLAY_CORE_CONFIG = {
  psx: {
    pcsx_rearmed: {
      3: { pcsx_rearmed_multitap1: 'enabled' },
      4: { pcsx_rearmed_multitap1: 'enabled' },
    },
  },
}

export function buildPlatformNetplayCoreConfig({ platform, core, players = 1 } = {}) {
  const count = Math.max(1, Math.min(4, Number(players) || 1))
  return PLATFORM_NETPLAY_CORE_CONFIG[platform]?.[core]?.[count] || {}
}

export function getBiosUrls(platformId) {
  const files = BIOS_BY_PLATFORM[platformId]
  if (!files?.length) return []
  return files.map((fileName) => ({
    // fileName 是给 Nostalgist 的落点，带不带子目录由共享表的挂载表决定；
    // 下载地址始终用平台目录下的文件名（后端路由不接受子目录）。
    fileName: biosMountPathFor(platformId, fileName),
    fileContent: `/api/bios/${platformId}/${fileName}`,
  }))
}
