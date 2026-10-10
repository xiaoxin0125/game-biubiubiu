import { getPlatform } from '../constants/platforms.js'
import { BIOS_BY_PLATFORM } from '../../../shared/registry/platform-bios.js'
import { PLATFORM_CORE_DEFAULT_MAX_PLAYERS } from '../../../shared/registry/platform-players.js'

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
// keep the default (their pads are 2-button).
const PLATFORM_CORE_OPTIONS = {
  megadrive: { picodrive: { picodrive_input1: '6 button pad', picodrive_input2: '6 button pad' } },
  genesis:   { picodrive: { picodrive_input1: '6 button pad', picodrive_input2: '6 button pad' } },
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
    fileName,
    fileContent: `/api/bios/${platformId}/${fileName}`,
  }))
}
