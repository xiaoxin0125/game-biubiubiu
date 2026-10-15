import {
  MAX_ROOM_PLAYERS,
  PLATFORM_CORE_DEFAULT_MAX_PLAYERS,
  PLATFORM_DEFAULT_CORES,
  PLATFORM_DEFAULT_MAX_PLAYERS,
  isSinglePlayerPlatform,
} from '../shared/registry/platform-players.js'
import { normalizePlatformId } from '../shared/registry/platform-roms.js'

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
  // 单人机不猜：标题里的「2P / 4人」是别的机器上的写法，这些平台一律一席。
  if (isSinglePlayerPlatform(rom?.platform)) return 1
  const text = `${rom.title || ''} ${rom.fileName || ''}`.toLowerCase()
  const match = text.match(/(?:^|[^0-9])([1-4])\s*(?:p|players?|人|玩家)(?:[^0-9]|$)/i)
  if (match) return clampMaxPlayers(Number(match[1]))
  return defaultMaxPlayersForPlatformCore(rom?.platform, rom?.defaultCore)
}

export function defaultMaxPlayersForPlatform(platform) {
  const id = normalizePlatformId(platform)
  if (isSinglePlayerPlatform(id)) return 1
  return PLATFORM_DEFAULT_MAX_PLAYERS[id] || 1
}

export function defaultMaxPlayersForPlatformCore(platform, core = null) {
  const id = normalizePlatformId(platform)
  if (isSinglePlayerPlatform(id)) return 1
  const selectedCore = core || PLATFORM_DEFAULT_CORES[id]
  return PLATFORM_CORE_DEFAULT_MAX_PLAYERS[id]?.[selectedCore]
    || defaultMaxPlayersForPlatform(id)
}

export function resolveMaxPlayersInfo(rom = {}, parent = null) {
  const platform = rom?.platform || parent?.platform
  // 单人机的平台级限制压过 ROM 字段与父版本继承：上传者填的 4 人也只开一席。
  if (isSinglePlayerPlatform(platform)) return { maxPlayers: 1, sourceRomId: rom?.id ?? parent?.id ?? null }

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