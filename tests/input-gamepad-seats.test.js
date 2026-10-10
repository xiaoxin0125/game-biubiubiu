import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GAMEPAD_DEFAULT_MAPPING,
  GAMEPAD_SEAT_AUTO,
  GAMEPAD_SEAT_OFF,
  assignGamepadSeat,
  deviceKeyFor,
  describeConnectedDevices,
  deviceLabel,
  deviceMappingFor,
  extractLegacyGamepads,
  isDefaultGamepadMapping,
  migrateGamepadMappingDefaults,
  normalizeGamepadMapping,
  normalizeGamepadSeats,
  normalizeDeviceGamepads,
  resolveSoloSeatPlayers,
} from '../frontend/src/composables/input/gamepadProfiles.js'

function pads(...ids) {
  return ids.map((id, index) => ({ index, id, buttons: [], axes: [] }))
}

test('设备按名字 + 同型号序号编号', () => {
  const list = describeConnectedDevices(pads('Xbox Wireless Controller', 'Xbox Wireless Controller', 'DualSense Wireless Controller'))
  assert.deepEqual(list.map((device) => device.key), [
    'Xbox Wireless Controller#0',
    'Xbox Wireless Controller#1',
    'DualSense Wireless Controller#0',
  ])
  assert.deepEqual(list.map((device) => device.position), [1, 2, 3])
})

test('座位设置只保留合法值', () => {
  assert.deepEqual(normalizeGamepadSeats(null), { 1: null, 2: null })
  assert.deepEqual(normalizeGamepadSeats({ 1: 'pad#0', 2: GAMEPAD_SEAT_OFF }), { 1: 'pad#0', 2: GAMEPAD_SEAT_OFF })
  assert.deepEqual(normalizeGamepadSeats({ '1': '  pad#1 ', 2: '' }), { 1: 'pad#1', 2: null })
})

test('单机默认：第一个手柄控制 P1，第二个控制 P2，单个手柄只控制 P1', () => {
  const one = describeConnectedDevices(pads('Pad A'))
  const two = describeConnectedDevices(pads('Pad A', 'Pad B'))

  assert.deepEqual([...resolveSoloSeatPlayers(one, null, 2)], [['Pad A#0', 1]])
  assert.deepEqual([...resolveSoloSeatPlayers(two, null, 2)], [['Pad A#0', 1], ['Pad B#0', 2]])
  // 单人游戏：第二个手柄没有输入
  assert.deepEqual([...resolveSoloSeatPlayers(two, null, 1)], [['Pad A#0', 1]])
})

test('单机可以手动交换手柄控制顺序', () => {
  const devices = describeConnectedDevices(pads('Pad A', 'Pad B'))
  const seats = { 1: 'Pad B#0', 2: 'Pad A#0' }
  assert.deepEqual([...resolveSoloSeatPlayers(devices, seats, 2)], [['Pad B#0', 1], ['Pad A#0', 2]])
})

test('指定了未连接的手柄时空出该座位，其余手柄补空位，不使用手柄则不参与', () => {
  const devices = describeConnectedDevices(pads('Pad B'))
  assert.deepEqual([...resolveSoloSeatPlayers(devices, { 1: 'Pad A#0' }, 2)], [['Pad B#0', 2]])
  assert.deepEqual([...resolveSoloSeatPlayers(devices, { 1: GAMEPAD_SEAT_OFF }, 2)], [['Pad B#0', 2]])
  assert.deepEqual([...resolveSoloSeatPlayers(devices, { 1: GAMEPAD_SEAT_OFF, 2: GAMEPAD_SEAT_OFF }, 2)], [])
})

test('同一个手柄不能被两个座位同时占用', () => {
  const devices = describeConnectedDevices(pads('Pad A'))
  assert.deepEqual([...resolveSoloSeatPlayers(devices, { 1: 'Pad A#0', 2: 'Pad A#0' }, 2)], [['Pad A#0', 1]])
})

test('旧版按玩家槽位的映射可以迁移出来并被设备沿用', () => {
  const legacyCustom = { ...GAMEPAD_DEFAULT_MAPPING, a: 5 }
  const legacy = extractLegacyGamepads({
    gamepadProfiles: { 1: 'ps4', 2: 'xbox' },
    gamepads: {
      1: { xbox: { ...GAMEPAD_DEFAULT_MAPPING, a: 2 }, ps4: legacyCustom },
      2: { xbox: { ...GAMEPAD_DEFAULT_MAPPING } },
    },
  })

  assert.equal(legacy[1].a, 5)
  assert.ok(isDefaultGamepadMapping(legacy[2]))

  // 已经按设备保存的映射优先，没有的才回退到旧数据 / XBOX 默认。
  const inputMapping = { gamepads: { 'Pad A#0': { ...GAMEPAD_DEFAULT_MAPPING, a: 9 } }, legacyGamepads: legacy }
  assert.equal(deviceMappingFor(inputMapping, 'Pad A#0', 1).a, 9)
  assert.equal(deviceMappingFor(inputMapping, 'Pad B#0', 1).a, 5)
  assert.ok(isDefaultGamepadMapping(deviceMappingFor(inputMapping, 'Pad C#0', 2)))
  assert.equal(deviceMappingFor(inputMapping, null, 0).a, GAMEPAD_DEFAULT_MAPPING.a)
})

test('按键设置分页只列当前连接着的手柄，拔出后立即消失', () => {
  assert.deepEqual(
    describeConnectedDevices(pads('Pad A', 'Pad B')).map((device) => [device.key, device.connected]),
    [['Pad A#0', true], ['Pad B#0', true]],
  )
  // 拔掉手柄后列表里不再出现（映射仍保存在本地，插上即恢复）。
  assert.deepEqual(describeConnectedDevices(pads('Pad A')).map((device) => device.key), ['Pad A#0'])
  assert.deepEqual(describeConnectedDevices([]), [])
})

// 同一只手柄被浏览器枚举成两台时的镜像对象：id 相同、采样时间戳相同、状态逐帧一致。
const MIRROR_PAD_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)'

function mirrorPad(index, { pressed = [], timestamp = 1000 } = {}) {
  return {
    index,
    id: MIRROR_PAD_ID,
    connected: true,
    mapping: 'standard',
    timestamp,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })),
    axes: [0, 0, 0, 0],
  }
}

test('两台同型号手柄也都保留并按连接顺序占用两个座位', () => {
  const identical = [mirrorPad(0, { pressed: [0] }), mirrorPad(1, { pressed: [0] })]
  const devices = describeConnectedDevices(identical)
  assert.deepEqual(devices.map((device) => device.key), [
    deviceKeyFor(MIRROR_PAD_ID, 0),
    deviceKeyFor(MIRROR_PAD_ID, 1),
  ])
  assert.deepEqual([...resolveSoloSeatPlayers(devices, null, 2)], [
    [devices[0].key, 1],
    [devices[1].key, 2],
  ])

  // Seat selection may still choose either physical descriptor explicitly.
  const preferred = describeConnectedDevices(identical)
  assert.deepEqual(
    [...resolveSoloSeatPlayers(preferred, { 1: preferred[1].key, 2: preferred[0].key }, 2)],
    [[preferred[1].key, 1], [preferred[0].key, 2]],
  )
})

test('两台相同 VID/PID 的真手柄不会因为时间戳或状态相同而合并', () => {
  const real = [mirrorPad(0, { pressed: [0], timestamp: 1000 }), mirrorPad(1, { pressed: [0], timestamp: 1000 })]
  assert.equal(describeConnectedDevices(real).length, 2)
  const split = [mirrorPad(0, { pressed: [0], timestamp: 1000 }), mirrorPad(1, { pressed: [1], timestamp: 1007 })]
  assert.equal(describeConnectedDevices(split).length, 2)
})

test('自动补位不会排除同型号的第二个物理描述', () => {
  const twin = (index) => ({ ...mirrorPad(index, { pressed: [0] }), id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)' })
  const devices = describeConnectedDevices([twin(0), twin(1)])
  assert.equal(devices.length, 2)

  // P2 点名其中一台时，P1 使用另一台；两台物理描述各分配一次。
  assert.deepEqual(
    [...resolveSoloSeatPlayers(devices, { 1: null, 2: devices[1].key }, 2)],
    [[devices[1].key, 2], [devices[0].key, 1]],
  )
  assert.deepEqual(
    [...resolveSoloSeatPlayers(devices, { 1: devices[0].key, 2: devices[1].key }, 2)],
    [[devices[0].key, 1], [devices[1].key, 2]],
  )
  assert.deepEqual([...resolveSoloSeatPlayers(devices, null, 2)], [[devices[0].key, 1], [devices[1].key, 2]])
})

test('旧版槽位存档里的完整旧默认在认领前迁移，部分自定义映射不被猜测改写', () => {
  const oldDefault = { ...GAMEPAD_DEFAULT_MAPPING, a: 1, b: 0, x: 3, y: 2 }
  const adopted = normalizeGamepadMapping(migrateGamepadMappingDefaults(oldDefault))
  assert.deepEqual(
    { a: adopted.a, b: adopted.b, x: adopted.x, y: adopted.y },
    { a: 0, b: 1, x: 2, y: 3 },
  )

  const custom = migrateGamepadMappingDefaults({ ...oldDefault, b: 5 })
  assert.deepEqual(
    { a: custom.a, b: custom.b, x: custom.x, y: custom.y },
    { a: 1, b: 5, x: 3, y: 2 },
  )
})

test('设备映射保留显式解绑，旧存档迁移时也保留稀疏自定义行', () => {
  const sparse = normalizeDeviceGamepads({ 'Pad A#0': { a: 7, b: null } })
  assert.equal(sparse['Pad A#0'].a, 7)
  assert.equal(sparse['Pad A#0'].b, null)

  const legacySparse = normalizeDeviceGamepads({ 'Pad A#0': { a: 1, b: 0, x: 3, y: 2 } }, { preserveSparse: true })
  assert.deepEqual(legacySparse['Pad A#0'], { a: 1, b: 0, x: 3, y: 2 })
})

test('一台手柄只能坐一个座位：选了它，另一个座位上的同一台设备退回自动', () => {
  const seats = assignGamepadSeat(null, 2, 'Pad A#0')
  assert.deepEqual(seats, { 1: null, 2: 'Pad A#0' })
  // P1 再点同一台手柄 → P2 退回自动
  assert.deepEqual(assignGamepadSeat(seats, 1, 'Pad A#0'), { 1: 'Pad A#0', 2: null })
  // 「不使用」/「自动」不参与互斥
  assert.deepEqual(assignGamepadSeat({ 1: 'Pad A#0', 2: null }, 2, GAMEPAD_SEAT_OFF), { 1: 'Pad A#0', 2: GAMEPAD_SEAT_OFF })
  assert.deepEqual(assignGamepadSeat({ 1: 'Pad A#0', 2: 'Pad B#0' }, 2, GAMEPAD_SEAT_AUTO), { 1: 'Pad A#0', 2: null })
})

test('手柄 A/B/X/Y 按手柄上的字母一一对应，不做 A/B、X/Y 对调', () => {
  assert.equal(GAMEPAD_DEFAULT_MAPPING.a, 0)   // 手柄 A（按钮 0）
  assert.equal(GAMEPAD_DEFAULT_MAPPING.b, 1)   // 手柄 B（按钮 1）
  assert.equal(GAMEPAD_DEFAULT_MAPPING.x, 2)   // 手柄 X（按钮 2）
  assert.equal(GAMEPAD_DEFAULT_MAPPING.y, 3)   // 手柄 Y（按钮 3）
  // 新装的手柄直接用这套默认
  const fresh = deviceMappingFor({ gamepads: {} }, 'Pad A#0', 1)
  assert.ok(isDefaultGamepadMapping(fresh))
  // FC/NES 的 X/Y 行（连发 A / 连发 B）就落在手柄的 X/Y 上
  assert.equal(fresh.x, 2)
  assert.equal(fresh.y, 3)
})

test('旧版对调过的完整默认映射升级，当前版本的自定义交换保持不变', () => {
  const oldDefault = { ...GAMEPAD_DEFAULT_MAPPING, a: 1, b: 0, x: 3, y: 2 }
  const migrated = migrateGamepadMappingDefaults(oldDefault)
  assert.deepEqual(
    { a: migrated.a, b: migrated.b, x: migrated.x, y: migrated.y },
    { a: 0, b: 1, x: 2, y: 3 },
  )

  const custom = migrateGamepadMappingDefaults({ ...oldDefault, a: 1, b: 5, x: 3, y: 9, l: 9 })
  assert.deepEqual(
    { a: custom.a, b: custom.b, x: custom.x, y: custom.y, l: custom.l },
    { a: 1, b: 5, x: 3, y: 9, l: 9 },
  )
})

test('旧版 null 保持解绑，不会在迁移或读取时复活成默认键位', () => {
  const repaired = migrateGamepadMappingDefaults({ ...GAMEPAD_DEFAULT_MAPPING, b: null, x: null })
  assert.equal(repaired.b, null)
  assert.equal(repaired.x, null)
  assert.equal(repaired.l, GAMEPAD_DEFAULT_MAPPING.l)
})

test('重复绑定被清掉的行不写回默认值', () => {
  // withoutDuplicateBinding 会把旧占用写成 null；normalizeGamepadMapping 保持这个解绑状态
  // （只有读取旧存档时的一次性迁移会给脸键补回默认值，见上一条用例）。
  const deduped = normalizeGamepadMapping({ a: 1, x: 1, y: null })
  assert.equal(deduped.a, 1)
  assert.equal(deduped.y, null)
  assert.equal(deduped.b, GAMEPAD_DEFAULT_MAPPING.b)
})

test('旧版按玩家槽位保存的 null 映射不会被提取时改回默认值', () => {
  const legacy = extractLegacyGamepads({
    gamepadProfiles: { 1: 'xbox' },
    gamepads: { 1: { xbox: { a: 1, b: 0, x: null, y: 2 } } },
  })
  assert.equal(legacy[1].x, null)
  assert.equal(legacy[1].y, 2)
})

test('显示名只留手柄名 +#序号，去掉浏览器补的 vendor/product', () => {
  const [first, second] = describeConnectedDevices(pads(
    'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
  ))
  assert.equal(deviceLabel(first.key), 'Xbox Wireless Controller#1')
  assert.equal(deviceLabel(second.key), 'Xbox Wireless Controller#2')
  assert.equal(deviceLabel('HID-compliant game controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)#0'), 'HID-compliant game controller#1')
})

test('设备 key 解析与拼装保持一致', () => {
  assert.equal(deviceKeyFor('Pad A', 1), 'Pad A#1')
  assert.equal(deviceKeyFor('  Pad A  '), 'Pad A#0')
})
