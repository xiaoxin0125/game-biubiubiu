// 区域别名（famicom / snes / genesis）在读取旧数据时按通用名处理：单人机判断、
// 默认人数、核心级例外都以通用名为键，不给别名再各写一份。
import { normalizePlatformId } from './platform-roms.js'

export const MAX_ROOM_PLAYERS = 4

export const PLATFORM_DEFAULT_CORES = Object.freeze({
  gba: 'mgba',
})

export const PLATFORM_CORE_DEFAULT_MAX_PLAYERS = Object.freeze({
  gba: Object.freeze({
    // 联机线缆核心本可开四席，但 GBA 归在单人机里（见 PLATFORM_SINGLE_PLAYER），
    // 平台级限制优先，这里保留映射只是资料。
    mgba2: 4,
  }),
})

export const PLATFORM_DEFAULT_MAX_PLAYERS = Object.freeze({
  arcade: 4,
  nes: 2,
  fds: 2,
  sfc: 2,
  gb: 1,
  gbc: 1,
  gba: 1,
  megadrive: 2,
  sms: 1,
  gamegear: 1,
  psx: 2,
  // PC Engine 的手柄口 1 与 2 各接一只手柄，多人游戏靠 multitap，这里只开两席。
  pcengine: 2,
  pcecd: 2,
  // Neo Geo CD 是双人对战机器（第二只手柄直接插主机）。
  neogeocd: 2,
  // Beetle NeoPop 只认一个端口（MAX_PLAYERS 1），联机无法把 P2 送进核心。
  ngp: 1,
  // 3DO 的手柄是菊花链，Opera 核心支持到 8 只；这里按常规两席开。
  '3do': 2,
  sega32x: 2,
  // J2ME 运行时模拟一部手机，只支持单人。
  j2me: 1,
})

// 单人机：掌机与手back机只有一只手柄口，或运行时只模拟一部手机。这些平台无
// 论 ROM 记录里填了几人、标题里写着「2P」还是核心支持几席，都只开一席 ——
// 单机时按键设置不出现 P2，联机房里除房主（P1）外其余人只能观战。
export const PLATFORM_SINGLE_PLAYER = Object.freeze(new Set([
  'gb',
  'gbc',
  'gba',
  'sms',
  'gamegear',
  'ngp',
  'j2me',
]))

export function isSinglePlayerPlatform(platform) {
  return PLATFORM_SINGLE_PLAYER.has(normalizePlatformId(platform))
}
