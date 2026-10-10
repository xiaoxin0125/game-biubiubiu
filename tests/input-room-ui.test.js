import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  interceptRoomPhysicalGamepad,
  resolveRoomPhysicalGamepadPlayer,
} from '../frontend/src/composables/player/room/useRoomPlayerInput.js'
import { describeConnectedDevices } from '../frontend/src/composables/input/gamepadProfiles.js'

function pads(...ids) {
  return ids.map((id, index) => ({
    id,
    index,
    connected: true,
    buttons: [],
    axes: [],
  }))
}

test('房间内每个本地手柄都归一到本机 P1，不读取单机座位表', () => {
  const devices = describeConnectedDevices(pads(
    'Xbox Wireless Controller',
    'Xbox Wireless Controller',
    'DualSense Wireless Controller',
  ))

  assert.equal(devices.length, 3)
  assert.deepEqual(devices.map(() => resolveRoomPhysicalGamepadPlayer(1)), [1, 1, 1])
  // 房间解析只看现有 roomGamepadPlayer 结果；单机 seat/off 值不会改变它。
  assert.equal(resolveRoomPhysicalGamepadPlayer('guest-seat-3'), 1)
  assert.equal(resolveRoomPhysicalGamepadPlayer(null), null)
})

test('房主物理手柄走本地 P1 直达路径，客机授权时沿用既有席位转发', () => {
  const forwarded = []
  const hostForwarded = interceptRoomPhysicalGamepad('down', 'a', {
    isRoomMode: true,
    isHost: true,
    roomPlayer: 1,
    forwardGuest: (...args) => hostForwarded.push(args),
  })
  assert.equal(hostForwarded, false)
  assert.deepEqual(forwarded, [])

  const guestResult = interceptRoomPhysicalGamepad('down', 'a', {
    isRoomMode: true,
    isHost: false,
    roomPlayer: 3,
    forwardGuest: (...args) => forwarded.push(args),
  })
  assert.equal(guestResult, true)
  assert.deepEqual(forwarded, [['down', 'a']])
})

test('未获授权的客机物理手柄输入被消费且不会转发或落到本地', () => {
  const forwarded = []
  const handled = interceptRoomPhysicalGamepad('up', 'b', {
    isRoomMode: true,
    isHost: false,
    roomPlayer: null,
    forwardGuest: (...args) => forwarded.push(args),
  })

  assert.equal(handled, true)
  assert.deepEqual(forwarded, [])
})

test('按键设置保留房间全设备分页、每帧新快照和单机互斥座位入口', () => {
  const source = readFileSync(new URL('../frontend/src/components/InputSettings.vue', import.meta.url), 'utf8')
  const roomInputSource = readFileSync(new URL('../frontend/src/composables/player/room/useRoomPlayerInput.js', import.meta.url), 'utf8')
  const soloInputSource = readFileSync(new URL('../frontend/src/composables/player/solo/useLocalPlayerInput.js', import.meta.url), 'utf8')
  const gamepadsSource = readFileSync(new URL('../frontend/src/composables/useGamepads.js', import.meta.url), 'utf8')

  assert.match(source, /const deviceTabs = connectedDevices/)
  assert.match(source, /connectedPads\.value = pads/)
  assert.match(source, /describeConnectedDevices\(pads\)/)
  assert.match(source, /const seatOptions = computed\(\(\) => \[/)
  assert.match(source, /:options="seatOptions"/)
  assert.match(source, /v-if="!roomMode" class="is-seat-list"/)
  assert.match(roomInputSource, /enabled: computed\(\(\) => !showInput\.value\)/)
  assert.match(soloInputSource, /enabled: computed\(\(\) => !showInput\.value\)/)
  assert.doesNotMatch(source, /resolveRoomDeviceKey|preferredKeys|mirroredPadsMerged|twinSeatsWarning/)
})

test('手柄只从被隔离的读取器进入网站，核心看不到同一个手柄', () => {
  const source = readFileSync(new URL('../frontend/src/components/InputSettings.vue', import.meta.url), 'utf8')
  const gamepadsSource = readFileSync(new URL('../frontend/src/composables/useGamepads.js', import.meta.url), 'utf8')
  const nostalgistSource = readFileSync(new URL('../frontend/src/composables/nostalgist.js', import.meta.url), 'utf8')

  // 没有任何一处直接读 navigator.getGamepads，全部走 readPhysicalPads()
  assert.doesNotMatch(source, /navigator\.getGamepads/)
  assert.doesNotMatch(gamepadsSource, /navigator\.getGamepads/)
  assert.match(source, /readPhysicalPads\(\)/)
  assert.match(gamepadsSource, /readPhysicalPads\(\)/)
  // 启动核心之前先把手柄从核心的读取路径里摘掉
  assert.match(nostalgistSource, /installNativeGamepadGuard\(\)/)
})
