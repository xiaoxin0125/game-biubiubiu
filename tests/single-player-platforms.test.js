import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PLATFORM_SINGLE_PLAYER,
  isSinglePlayerPlatform,
} from '../shared/registry/platform-players.js'
import {
  defaultMaxPlayersForPlatform,
  defaultMaxPlayersForPlatformCore,
  effectiveMaxPlayersForRom,
  inferMaxPlayers,
  resolveMaxPlayersInfo,
} from '../server/rom-players.js'
import { recalculateControlSeats } from '../server/rooms/room-seat-policy.js'
import { getPlatformInfo } from '../frontend/src/data/config.js'

// 单人机：GB 三兄弟 + SMS / GameGear / NGP / J2ME。掌机只有一只手柄口，J2ME 运行时
// 只模拟一部手机，所以平台级限制要压过 ROM 字段、标题推断与核心级例外。
const SOLO = ['gb', 'gbc', 'gba', 'sms', 'gamegear', 'ngp', 'j2me']

test('单人机清单：GB 家族、SMS/GG、NGP、J2ME', () => {
  for (const platform of SOLO) {
    assert.ok(isSinglePlayerPlatform(platform), `${platform} 应该在单人机清单里`)
    assert.equal(defaultMaxPlayersForPlatform(platform), 1, `${platform} 默认人数应为 1`)
  }
  for (const platform of ['nes', 'sfc', 'megadrive', 'psx', 'arcade', 'pcecd', '3do', 'sega32x', 'neogeocd']) {
    assert.ok(!isSinglePlayerPlatform(platform), `${platform} 不该被当成单人机`)
  }
  assert.deepEqual([...PLATFORM_SINGLE_PLAYER].sort(), [...SOLO].sort())
})

test('核心级例外不能把单人机开成多人：GBA 的联机线缆核心也是 1', () => {
  assert.equal(defaultMaxPlayersForPlatformCore('gba', 'mgba2'), 1)
  assert.equal(defaultMaxPlayersForPlatformCore('gb', 'gambatte'), 1)
  // 前端播放页读的是同一份判断：P2 按键页因此不会出现。
  assert.equal(getPlatformInfo('gba', { core: 'mgba2' }).maxPlayers, 1)
  assert.equal(getPlatformInfo('j2me', { core: 'j2mejs' }).maxPlayers, 1)
  assert.equal(getPlatformInfo('nes', { core: 'nestopia' }).maxPlayers, 2)
})

test('标题里的「2P / 4人」不会给单人机加席位', () => {
  assert.equal(inferMaxPlayers({ platform: 'gb', title: 'Tetris 2P', fileName: 'tetris.gb' }), 1)
  assert.equal(inferMaxPlayers({ platform: 'j2me', title: '斗地主 4人版', fileName: 'game.jar' }), 1)
  // 其他平台仍然按标题推断。
  assert.equal(inferMaxPlayers({ platform: 'nes', title: 'Contra 2P', fileName: 'contra.nes' }), 2)
})

test('ROM 记录里填的 2 / 4 人在单人机上被压回 1', () => {
  assert.equal(effectiveMaxPlayersForRom({ platform: 'sms', maxPlayers: 2 }), 1)
  assert.equal(effectiveMaxPlayersForRom({ platform: 'j2me', maxPlayers: 4 }), 1)
  assert.deepEqual(resolveMaxPlayersInfo({ id: 7, platform: 'ngp', maxPlayers: 4 }), { maxPlayers: 1, sourceRomId: 7 })
  // 多人机不受影响。
  assert.equal(effectiveMaxPlayersForRom({ platform: 'sfc', maxPlayers: 2 }), 2)
})

test('联机房里单人机只有房主（P1）能控制，其余是观战', () => {
  const room = {
    platform: 'j2me',
    effectiveMaxPlayers: effectiveMaxPlayersForRom({ platform: 'j2me', maxPlayers: 4 }),
    allowPlay: true,
    allowGuestControl: true,
    hostUserId: 11,
    peers: new Map([
      ['host', { id: 'host', userId: 11, isHost: true, canControl: false, playerIndex: null }],
      ['guest-a', { id: 'guest-a', userId: 22, isHost: false, canControl: true, playerIndex: 2 }],
      ['guest-b', { id: 'guest-b', userId: null, isHost: false, canControl: true, playerIndex: 3 }],
    ]),
  }
  recalculateControlSeats(room)
  assert.equal(room.peers.get('host').canControl, true)
  assert.equal(room.peers.get('host').playerIndex, 1)
  for (const peer of ['guest-a', 'guest-b']) {
    assert.equal(room.peers.get(peer).canControl, false, `${peer} 应该只能观战`)
    assert.equal(room.peers.get(peer).playerIndex, null)
  }

  // 双人机保持原来的座位分配。
  const duo = {
    platform: 'nes',
    effectiveMaxPlayers: 2,
    allowPlay: true,
    allowGuestControl: true,
    hostUserId: 11,
    peers: new Map([
      ['host', { id: 'host', userId: 11, isHost: true, canControl: false, playerIndex: null }],
      ['guest-a', { id: 'guest-a', userId: 22, isHost: false, canControl: false, playerIndex: null }],
    ]),
  }
  recalculateControlSeats(duo)
  assert.equal(duo.peers.get('guest-a').playerIndex, 2)
  assert.equal(duo.peers.get('guest-a').canControl, true)
})
