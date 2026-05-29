import {
  MAX_ROOM_PLAYERS,
  PLATFORM_CORE_DEFAULT_MAX_PLAYERS,
  PLATFORM_DEFAULT_CORES,
  PLATFORM_DEFAULT_MAX_PLAYERS,
} from '../shared/registry/platform-players.js'

export function normalizeMaxPlayers(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > MAX_ROOM_PLAYERS) return null
  return n
}

export function clampMaxPlayers(value) {
  return normalizeMaxPlayers(value) || MAX_ROOM_PLAYERS
}

export function inferMaxPlayers(rom = {}) {
  const text = `${rom.title || ''} ${rom.fileName || ''}`.toLowerCase()
  const match = text.match(/(?:^|[^0-9])([1-4])\s*(?:p|players?|人|玩家)(?:[^0-9]|$)/i)
  if (match) return clampMaxPlayers(Number(match[1]))
  return defaultMaxPlayersForPlatformCore(rom?.platform, rom?.defaultCore)
}

export function defaultMaxPlayersForPlatform(platform) {
  return PLATFORM_DEFAULT_MAX_PLAYERS[platform] || 1
}

export function defaultMaxPlayersForPlatformCore(platform, core = null) {
  const selectedCore = core || PLATFORM_DEFAULT_CORES[platform]
  return PLATFORM_CORE_DEFAULT_MAX_PLAYERS[platform]?.[selectedCore]
    || defaultMaxPlayersForPlatform(platform)
}

export function resolveMaxPlayersInfo(rom = {}, parent = null) {
  const self = normalizeMaxPlayers(rom?.maxPlayers)
  if (self) return { maxPlayers: self, sourceRomId: rom?.id ?? null }

  const inherited = normalizeMaxPlayers(parent?.maxPlayers)
  if (inherited) return { maxPlayers: inherited, sourceRomId: parent?.id ?? null }

  return {
    maxPlayers: inferMaxPlayers(rom || parent || {}),
    sourceRomId: rom?.id ?? parent?.id ?? null,
  }
}

export function effectiveMaxPlayersForRom(rom, parent = null) {
  return resolveMaxPlayersInfo(rom, parent).maxPlayers
}

export { MAX_ROOM_PLAYERS }