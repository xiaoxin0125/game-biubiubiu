import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
  player1ReservedKeys,
} from '../frontend/src/composables/input/remotePlayers.js'
import { buildPlayerRetroarchConfig } from '../frontend/src/composables/input/retroarchConfig.js'
import {
  buildArcadeNetplayRemoteKeyMaps,
  buildArcadeNetplayRetroarchConfig,
} from '../frontend/src/composables/player/arcadeNetplayInput.js'
import { RETROPAD_BUTTON_DEFS } from '../frontend/src/composables/input/buttons.js'
import {
  DEFAULT_KEYBOARD,
  buildLocalPlayerKeyboardMap,
  defaultPlayer1KeyboardForPlatform,
  effectiveKeyboardForPlayer,
} from '../frontend/src/composables/input/keyboardProfiles.js'
import { pcButtonsForPlatform } from '../frontend/src/constants/platforms.js'
import {
  interceptRoomRemoteSeatKey,
  roomRemoteSeatKeySet,
} from '../frontend/src/composables/player/room/useRoomPlayerInput.js'

// 这一组测试锁住房间输入的分工：房主这一侧只有 P1 会响，远端席位只认 RTC 注入。
// core 直接读 canvas 上的原生键盘事件，所以「远端席位的键位表避开了房主的键」和
// 「房主按到远端席位的键会被吞掉」两件事缺一不可：
//   - 键位表（player1ReservedKeys + buildRemotePlayerKeyMaps）保证房主自己的键不会
//     被分给别的玩家（包括按键设置里没有行的按钮，比如 NES 的 L2/R2/L3/R3）；
//   - 吞键（interceptRoomRemoteSeatKey）兜住其余情况，比如 P2 用的就是房主键盘上的
//     z x v n q y 这些普通字母，房主一按就会打到 P2。

const PLATFORMS = ['arcade', 'nes', 'fds', 'sfc', 'gba', 'megadrive', 'sms', 'gamegear', 'gb', 'gbc', 'psx', 'pcengine', 'pcecd', 'neogeocd', 'ngp', '3do', 'sega32x', 'j2me']

// 房主改过键位的两种存档：一种把 A 挪到 z，一种把「右」从 d 挪到 k。
const CUSTOM_KEYBOARDS = [
  { tag: 'default', keyboard: { ...DEFAULT_KEYBOARD } },
  { tag: 'A=z', keyboard: { ...DEFAULT_KEYBOARD, a: 'z' } },
  { tag: 'right=k', keyboard: { ...DEFAULT_KEYBOARD, right: 'k' } },
  // 极端：P1 的键大量挪到中转池里的键上（小键盘 / 功能键），池子会被保留集吃掉。
  {
    tag: 'P1 用尽中转池',
    keyboard: {
      ...DEFAULT_KEYBOARD,
      up: 'z', down: 'x', left: 'v', right: 'n', a: 'q', b: 'y', x: 'g', y: 'h', l: 't', r: 'm',
      l2: 'home', r2: 'end', l3: 'del', r3: 'pagedown',
    },
  },
  {
    tag: 'P1 用小键盘',
    keyboard: {
      ...DEFAULT_KEYBOARD,
      up: 'numpad1', down: 'numpad2', left: 'numpad3', right: 'numpad4',
      a: 'numpad5', b: 'numpad6', x: 'numpad7', y: 'numpad8',
      l: 'numpad9', r: 'numpad0', l2: 'kp_enter', r2: 'kp_period',
      l3: 'divide', r3: 'multiply',
    },
  },
]

// 复刻 usePlayerEmulatorConfig + usePlayerInput 的取值方式：core 里 P1 的键位是平台
// 运行期键位（只含平台用得到的按钮），房主物理键盘上是玩家保存的完整映射。
function roomInputState(platform, storedKeyboard) {
  const platformButtons = pcButtonsForPlatform(platform)
  const runtimeKeyboard = {}
  for (const { key } of RETROPAD_BUTTON_DEFS) {
    if (platformButtons.includes(key)) runtimeKeyboard[key] = defaultPlayer1KeyboardForPlatform(platform)[key] || 'nul'
  }
  const userKeyboard = effectiveKeyboardForPlayer({ keyboard: storedKeyboard }, 1, platform)
  const reservedKeys = player1ReservedKeys(
    effectiveKeyboardForPlayer(null, 1, platform),
    userKeyboard,
  )
  const snapshot = buildPlayerRetroarchConfig({ keyboard: userKeyboard }, platformButtons, { runtimeKeyboard })
  return { platformButtons, runtimeKeyboard, userKeyboard, reservedKeys, snapshot }
}

function remoteMapsFor(platform, maxPlayers, state) {
  if (platform === 'arcade') {
    return buildArcadeNetplayRemoteKeyMaps({
      maxPlayers,
      hostConfig: state.snapshot,
      reservedKeys: state.reservedKeys,
      platformButtons: state.platformButtons,
    })
  }
  return buildRemotePlayerKeyMaps(maxPlayers, state.reservedKeys, state.platformButtons)
}

function remoteConfigFor(platform, maxPlayers, state, maps) {
  if (platform === 'arcade') {
    return buildArcadeNetplayRetroarchConfig({ maxPlayers, keyMaps: maps, platformButtons: state.platformButtons })
  }
  return buildRemotePlayersRetroarchConfig(maxPlayers, state.reservedKeys, state.platformButtons, maps)
}

function activeConfigEntries(cfg, players) {
  const pattern = new RegExp(`^input_player(${players.join('|')})_(up|down|left|right|a|b|x|y|l|r|l2|r2|l3|r3|start|select)$`)
  const out = []
  for (const [name, value] of Object.entries(cfg)) {
    if (!pattern.test(name) || !value || value === 'nul') continue
    out.push({ name, key: value })
  }
  return out
}

test('保留集覆盖房主保存的完整映射：按键设置里没有行的按钮也算', () => {
  const reserved = player1ReservedKeys(defaultPlayer1KeyboardForPlatform('nes'), { ...DEFAULT_KEYBOARD })
  // NES 用不到 L/R/L2/R2/L3/R3，按键设置里没有这些行，但键还在存档里。
  for (const key of ['u', 'p', '7', '9', '8', '0']) assert.ok(reserved.includes(key), `${key} 应该在保留集里`)
  assert.ok(reserved.includes('w') && reserved.includes('j'))
  // 空值 / nul 不进保留集。
  assert.deepEqual(player1ReservedKeys({ a: 'nul', b: '', c: null }, null), [])
})

test('远端席位的键位避开房主 P1 的键，且每个可用按钮都有键', () => {
  for (const platform of PLATFORMS) {
    for (const variant of CUSTOM_KEYBOARDS) {
      const state = roomInputState(platform, variant.keyboard)
      const reserved = new Set(state.reservedKeys)
      for (const maxPlayers of [2, 3, 4]) {
        const maps = remoteMapsFor(platform, maxPlayers, state)
        const used = new Set()
        for (let player = 2; player <= maxPlayers; player++) {
          for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
            if (!state.platformButtons.includes(btn)) continue
            const key = maps[player]?.[btn]
            assert.ok(key && key !== 'nul', `${platform}/${variant.tag}/${maxPlayers} 人：P${player} ${btn} 没有键`)
            assert.ok(!reserved.has(key), `${platform}/${variant.tag}/${maxPlayers} 人：P${player} ${btn} 用了房主的键 ${key}`)
            assert.ok(!used.has(key), `${platform}/${variant.tag}/${maxPlayers} 人：${key} 被分给了两个席位`)
            used.add(key)
          }
        }
      }
    }
  }
})

test('core 配置绑定的键与运行时注入的键完全一致', () => {
  // 客人按键时 host 是把「键位表里的键」注入给 core，两边不同就会打到别的玩家（或者
  // 干脆没反应）。配置必须用同一份键位表生成，而不是各算一次。
  for (const platform of PLATFORMS) {
    for (const variant of CUSTOM_KEYBOARDS) {
      const state = roomInputState(platform, variant.keyboard)
      for (const maxPlayers of [2, 3, 4]) {
        const maps = remoteMapsFor(platform, maxPlayers, state)
        const cfg = remoteConfigFor(platform, maxPlayers, state, maps)
        for (let player = 2; player <= maxPlayers; player++) {
          for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
            const expected = state.platformButtons.includes(btn) ? maps[player][btn] : 'nul'
            assert.equal(cfg[`input_player${player}_${btn}`], expected, `${platform}/${maxPlayers} 人：P${player} ${btn}`)
          }
        }
      }
    }
  }
})

test('房主按遍自己键盘上的键，都不会落进远端席位的键位表', () => {
  for (const platform of PLATFORMS) {
    for (const variant of CUSTOM_KEYBOARDS) {
      const state = roomInputState(platform, variant.keyboard)
      // 房主物理键盘上的键（含平台用不到的行）+ core 里 P1 实际绑定的键。
      const hostKeys = new Set([...Object.values(state.userKeyboard), ...state.reservedKeys])
      for (const maxPlayers of [2, 3, 4]) {
        const seatKeys = roomRemoteSeatKeySet(remoteMapsFor(platform, maxPlayers, state))
        const overlap = [...hostKeys].filter((key) => key && key !== 'nul' && seatKeys.has(key))
        assert.deepEqual(overlap, [], `${platform}/${variant.tag}/${maxPlayers} 人：房主的键落到了远端席位`)
      }
    }
  }
})

test('街机房间的 P2 仍然用单机 P2 的运行时键位，但让位于房主的键', () => {
  const state = roomInputState('arcade', { ...DEFAULT_KEYBOARD })
  const maps = buildArcadeNetplayRemoteKeyMaps({
    maxPlayers: 2,
    hostConfig: state.snapshot,
    reservedKeys: state.reservedKeys,
    platformButtons: state.platformButtons,
  })
  // 默认键位下与改动前一致：P2 就是单机 P2 的运行时键位（按平台按钮表裁剪）。
  assert.deepEqual(maps[2], buildLocalPlayerKeyboardMap(2, state.platformButtons))
  assert.deepEqual(Object.values(maps[2]), ['up', 'down', 'left', 'right', 'z', 'x', 'v', 'n', 'q', 'y', 't', 'm'])

  // 房主把自己的 A 挪到 z（P2 布局里的键）时，P2 的 A 必须让开。
  const custom = roomInputState('arcade', { ...DEFAULT_KEYBOARD, a: 'z' })
  const customMaps = buildArcadeNetplayRemoteKeyMaps({
    maxPlayers: 2,
    hostConfig: custom.snapshot,
    reservedKeys: custom.reservedKeys,
    platformButtons: custom.platformButtons,
  })
  assert.notEqual(customMaps[2].a, 'z')
})

test('房主侧吞掉远端席位的键：真人按无效，RTC 注入照旧', () => {
  const state = roomInputState('fds', { ...DEFAULT_KEYBOARD })
  const seatKeys = roomRemoteSeatKeySet(remoteMapsFor('fds', 3, state))
  // 3 座位房间下 P2 用的就是房主键盘上的这些键，P3 用 b e f 这些。
  for (const key of ['z', 'x', 'v', 'n', 'q', 'y']) assert.ok(seatKeys.has(key), `${key} 应该是远端席位的键`)

  const makeEvent = (key) => {
    const calls = { prevented: 0, stopped: 0 }
    return {
      key,
      code: `Key${key.toUpperCase()}`,
      preventDefault: () => { calls.prevented++ },
      stopImmediatePropagation: () => { calls.stopped++ },
      calls,
    }
  }

  const hostEvent = makeEvent('z')
  assert.equal(interceptRoomRemoteSeatKey(hostEvent, { isRoomMode: true, isHost: true, seatKeys }), true)
  assert.equal(hostEvent.calls.prevented, 1)
  assert.equal(hostEvent.calls.stopped, 1)

  // P1 自己的键不受影响。
  const ownKey = makeEvent('j')
  assert.equal(interceptRoomRemoteSeatKey(ownKey, { isRoomMode: true, isHost: true, seatKeys }), false)
  assert.equal(ownKey.calls.prevented, 0)

  // 注入的合成事件（前端自己的键、客人转发的键）一律放行。
  const injected = makeEvent('z')
  injected.__internalInputDispatch = true
  assert.equal(interceptRoomRemoteSeatKey(injected, { isRoomMode: true, isHost: true, seatKeys }), false)

  // 客机、单机没有本地 core，不需要吞。
  assert.equal(interceptRoomRemoteSeatKey(makeEvent('z'), { isRoomMode: true, isHost: false, seatKeys }), false)
  assert.equal(interceptRoomRemoteSeatKey(makeEvent('z'), { isRoomMode: false, isHost: true, seatKeys }), false)
  assert.equal(interceptRoomRemoteSeatKey(makeEvent('z'), { isRoomMode: true, isHost: true, seatKeys: null }), false)
})

test('房间键盘链路接上吞键，并把同一份键位表传给房间输入', () => {
  const roomInput = readFileSync(new URL('../frontend/src/composables/player/room/useRoomPlayerInput.js', import.meta.url), 'utf8')
  const roomView = readFileSync(new URL('../frontend/src/views/RoomPlayer.vue', import.meta.url), 'utf8')
  const emulatorConfig = readFileSync(new URL('../frontend/src/composables/player/usePlayerEmulatorConfig.js', import.meta.url), 'utf8')
  const roomRtc = readFileSync(new URL('../frontend/src/composables/player/useRoomRtc.js', import.meta.url), 'utf8')

  assert.match(roomInput, /if \(handleRemoteSeatKeyboard\(e\)\) return true/)
  assert.match(roomInput, /roomRemoteSeatKeySet\(unref\(remoteKeyMaps\)\)/)
  assert.match(roomView, /remoteKeyMaps: resolvedRemotePlayerKeyMaps/)
  // core 配置与运行时注入共用同一份键位表，且保留集来自 player1ReservedKeys。
  assert.match(emulatorConfig, /player1ReservedKeys\(/)
  assert.match(emulatorConfig, /platformButtons,\s*remotePlayerKeyMaps\.value,/)
  // 拿不到键位表时不注入默认表（那会打到别的玩家）。
  assert.match(roomRtc, /remoteKeyMapForPlayer\?\.\(playerIndex\) \|\| \{\}/)
})

// 房主这一侧要吞的是「当前房间人数以内、每个远端席位用到的全部中转键」：P3 用的是
// b e f 这些普通字母、P4 用的是 home / end 这类编辑键，房主随手一按就会打到他们。
test('房主吞掉全部远端席位的中转键（含 P3 / P4），且只在房间人数以内', () => {
  for (const platform of PLATFORMS) {
    const state = roomInputState(platform, { ...DEFAULT_KEYBOARD })
    for (const maxPlayers of [2, 3, 4]) {
      const maps = remoteMapsFor(platform, maxPlayers, state)
      const seatKeys = roomRemoteSeatKeySet(maps)
      for (let player = 2; player <= maxPlayers; player++) {
        for (const { key: btn } of RETROPAD_BUTTON_DEFS) {
          const key = maps[player]?.[btn]
          if (!key || key === 'nul') continue
          assert.ok(seatKeys.has(key), `${platform}/${maxPlayers} 人：P${player} ${btn} 的 ${key} 没被吞`)
        }
      }
      // 席位数以外的玩家在 core 里没有绑定，他们的键不该被吞。
      for (let player = maxPlayers + 1; player <= 4; player++) {
        for (const [key, value] of Object.entries(remoteMapsFor(platform, player, state)[player] || {})) {
          if (!value || value === 'nul') continue
          assert.ok(!seatKeys.has(value), `${platform}/${maxPlayers} 人：吃掉了 P${player} 的 ${value}（${key}）`)
        }
      }
    }
  }

  // 默认键位 + 街机：P3 的十字就是 b e f，P4 的十字是 home end del pagedown。
  const arcade = roomInputState('arcade', { ...DEFAULT_KEYBOARD })
  const fourSeats = roomRemoteSeatKeySet(remoteMapsFor('arcade', 4, arcade))
  for (const key of ['b', 'e', 'f', 'semicolon']) assert.ok(fourSeats.has(key), `${key} 应该是 P3 的键`)
  for (const key of ['home', 'end', 'del', 'pagedown']) assert.ok(fourSeats.has(key), `${key} 应该是 P4 的键`)
  // 两人房间里这些键没有绑定，按下去不该被拦。
  const twoSeats = roomRemoteSeatKeySet(remoteMapsFor('arcade', 2, arcade))
  for (const key of ['b', 'e', 'f', 'home', 'end', 'del']) {
    assert.ok(!twoSeats.has(key), `${key} 不该出现在两人房间里`)
  }
})

// 房主改过的 P1 键位必须让位：P1 自己用到的键既不能进远端席位的键位表，也不能被吞。
test('房主自定义 P1 键位时，P3 / P4 让开且房主的键不被吞', () => {
  for (const variant of CUSTOM_KEYBOARDS) {
    const state = roomInputState('arcade', variant.keyboard)
    const maps = remoteMapsFor('arcade', 4, state)
    const seatKeys = roomRemoteSeatKeySet(maps)
    const reserved = new Set(state.reservedKeys)
    for (const [player, keyMap] of Object.entries(maps)) {
      for (const [btn, key] of Object.entries(keyMap)) {
        if (!key || key === 'nul') continue
        assert.ok(!reserved.has(key), `${variant.tag}：P${player} ${btn} 用了房主的键 ${key}`)
        assert.ok(seatKeys.has(key), `${variant.tag}：P${player} ${btn} 的 ${key} 没被吞`)
      }
    }
    // 房主物理键盘上的键（含按键设置里没有行的）一律不被吞。
    const hostKeys = new Set([...Object.values(state.userKeyboard), ...state.reservedKeys])
    for (const key of hostKeys) {
      if (!key || key === 'nul') continue
      assert.ok(!seatKeys.has(key), `${variant.tag}：房主的 ${key} 被当成远端中转键吞了`)
    }
  }
})
