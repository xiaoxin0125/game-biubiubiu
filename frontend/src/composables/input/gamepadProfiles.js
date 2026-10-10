// 手柄配置模型：按键映射按「设备」（手柄名字 + 同型号序号）保存，另外单独保存
// 每个玩家座位用哪台手柄。默认只有 XBOX（浏览器标准映射）一套布局，其他类型
// 的手柄（PS4/NS/杂牌）不提供预设，由玩家在按键设置里逐键手动映射。

import { RETROPAD_BUTTON_KEYS } from './buttons.js'

// XBOX / 浏览器标准映射，按手柄上的按键字母一一对应：
// A→0、B→1、X→2、Y→3、LB/RB→4/5、LT/RT→6/7、View/Menu→8/9、
// 摇杆按下→10/11、十字键→12..15。
// 不做 RetroArch 那套“按位置对调 A/B、X/Y”的换算 —— 玩家按手柄 A 就是 A 行。
export const GAMEPAD_DEFAULT_MAPPING = {
  a: 0, b: 1, x: 2, y: 3,
  l: 4, r: 5, l2: 6, r2: 7,
  l3: 10, r3: 11,
  select: 8, start: 9,
  up: 12, down: 13, left: 14, right: 15,
}

export const DEFAULT_GAMEPAD = GAMEPAD_DEFAULT_MAPPING

// 只有整套映射仍等于旧默认时才迁移；单行相同无法区分默认值和用户自定义。
const LEGACY_GAMEPAD_DEFAULT_MAPPINGS = [
  { ...GAMEPAD_DEFAULT_MAPPING, a: 1, b: 0, x: 3, y: 2 },
]

// 沿用已有版本；读取旧存档时迁移一次并持久化，设备认领不再重新迁移。
export const GAMEPAD_LAYOUT_VERSION = 5

// 座位取值：null / undefined = 自动（按连接顺序），'off' = 不使用手柄，
// 其他字符串 = 设备 key。
export const GAMEPAD_SEAT_OFF = 'off'
export const GAMEPAD_SEAT_AUTO = 'auto'
export const GAMEPAD_SEAT_COUNT = 2

const LEGACY_PROFILE_KEYS = ['xbox', 'ps4', 'ns', 'generic']

// ---------------------------------------------------------------- 设备标识

export function deviceNameOf(padOrId) {
  const raw = typeof padOrId === 'string' ? padOrId : padOrId?.id
  return String(raw || '').trim() || '未知手柄'
}

export function deviceKeyFor(name, occurrence = 0) {
  return `${deviceNameOf(name)}#${Math.max(0, Number(occurrence) || 0)}`
}

export function isDeviceKey(key) {
  const raw = String(key || '')
  const at = raw.lastIndexOf('#')
  return at > 0 && /^\d+$/.test(raw.slice(at + 1))
}

export function parseDeviceKey(key) {
  const raw = String(key || '')
  if (!isDeviceKey(raw)) return { name: raw || '未知手柄', occurrence: 0 }
  const at = raw.lastIndexOf('#')
  return { name: raw.slice(0, at), occurrence: Number(raw.slice(at + 1)) }
}

// 显示用名字：只留手柄名（去掉浏览器补的 vendor/product 括号）+#序号，同型号多台时区分。
export function shortDeviceName(name) {
  const raw = String(name || '').trim()
  const short = raw.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return short || raw || '未知手柄'
}

export function deviceLabel(key) {
  const { name, occurrence } = parseDeviceKey(key)
  return `${shortDeviceName(name)}#${occurrence + 1}`
}

// ---------------------------------------------------------------- 设备枚举

// 纯枚举：厂商/产品号、时间戳和按键状态都不能证明两项是同一台物理设备。
// 同型号手柄仍按传入的连接顺序各自编号，不隐式合并或丢弃任何已连接设备。
export function describeConnectedDevices(pads = []) {
  const counts = new Map()
  return (pads || [])
    .filter((pad) => pad && pad.connected !== false)
    .map((pad, index) => {
      const name = deviceNameOf(pad)
      const occurrence = counts.get(name) || 0
      counts.set(name, occurrence + 1)
      return { key: deviceKeyFor(name, occurrence), name, occurrence, position: index + 1, connected: true, pad }
    })
}

// ---------------------------------------------------------------- 映射存储

export function isValidGamepadBinding(idx) {
  if (idx == null || idx === '') return false
  if (typeof idx === 'number') return Number.isInteger(idx) && idx >= 0
  if (typeof idx === 'string' && /^\d+$/.test(idx.trim())) return true
  return false
}

export function normalizeGamepadMapping(storedGamepad = {}, defaults = GAMEPAD_DEFAULT_MAPPING) {
  const out = { ...defaults }
  for (const [btn, idx] of Object.entries(storedGamepad || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    // 显式的 null = 这一行被解绑（多半是重复绑定被自动清掉），保持没按键，
    // 不能再回落到默认值，否则旧占用会“复活”。
    if (idx === null) {
      out[btn] = null
      continue
    }
    if (!isValidGamepadBinding(idx)) continue
    out[btn] = typeof idx === 'number' ? idx : Number(idx)
  }
  return out
}

export function isDefaultGamepadMapping(mapping = null) {
  for (const btn of RETROPAD_BUTTON_KEYS) {
    if (normalizeGamepadBindingValue(mapping?.[btn]) !== GAMEPAD_DEFAULT_MAPPING[btn]) return false
  }
  return true
}

function normalizeGamepadBindingValue(idx) {
  if (!isValidGamepadBinding(idx)) return null
  return typeof idx === 'number' ? idx : Number(idx)
}

export function sanitizeGamepadSave(current) {
  const out = {}
  for (const [btn, idx] of Object.entries(current || {})) {
    if (!RETROPAD_BUTTON_KEYS.has(btn)) continue
    out[btn] = isValidGamepadBinding(idx) ? (typeof idx === 'number' ? idx : Number(idx)) : null
  }
  return out
}

// 按设备保存的映射表（键为 `<手柄名>#<序号>`）。
export function normalizeDeviceGamepads(stored = null, { preserveSparse = false } = {}) {
  const out = {}
  for (const [key, mapping] of Object.entries(stored || {})) {
    if (!isDeviceKey(key)) continue
    // Preserve sparse rows while migrating old records so a partial/custom
    // mapping cannot be mistaken for a complete legacy default. Normal reads
    // still return the complete normalized device mapping.
    out[key] = preserveSparse ? sanitizeGamepadSave(mapping) : normalizeGamepadMapping(mapping)
  }
  return out
}

// ---------------------------------------------------------------- 座位存储

export function normalizeGamepadSeats(stored = null) {
  const out = { 1: null, 2: null }
  for (let player = 1; player <= GAMEPAD_SEAT_COUNT; player++) {
    const value = stored?.[player] ?? stored?.[String(player)]
    const selected = typeof value === 'string' ? value.trim() : null
    if (selected === GAMEPAD_SEAT_OFF) out[player] = GAMEPAD_SEAT_OFF
    else if (isDeviceKey(selected)) out[player] = selected
    else out[player] = null
  }
  return out
}

// 一台手柄只能坐一个座位：某个座位点了它，另一个座位上的同一台设备自动退回“自动”。
export function assignGamepadSeat(seats = null, player = 1, value = null) {
  const slot = Number(player) === 2 ? 2 : 1
  const normalized = normalizeGamepadSeats({ [slot]: value })[slot]
  const next = { ...normalizeGamepadSeats(seats), [slot]: normalized }
  if (typeof normalized === 'string' && normalized !== GAMEPAD_SEAT_OFF) {
    for (let other = 1; other <= GAMEPAD_SEAT_COUNT; other++) {
      if (other !== slot && next[other] === normalized) next[other] = null
    }
  }
  return next
}

// 旧版数据：gamepads 按玩家槽位 × 4 种手柄类型保存。升级后这些映射没法直接
// 对应到具体设备，先在内存里留一份，等设备第一次出现时按它当前的连接顺序套用。
export function extractLegacyGamepads(stored = null) {
  const out = { 1: null, 2: null }
  const slots = stored?.gamepads
  const profiles = stored?.gamepadProfiles || {}
  if (slots && typeof slots === 'object') {
    for (let player = 1; player <= GAMEPAD_SEAT_COUNT; player++) {
      const slot = slots?.[player] ?? slots?.[String(player)]
      const selected = String(profiles?.[player] ?? profiles?.[String(player)] ?? 'xbox').toLowerCase()
      const mapping = legacySlotMapping(slot, selected)
      if (mapping) out[player] = mapping
    }
  }
  if (!out[1] && stored?.gamepad) out[1] = pickValidGamepadRows(stored.gamepad)
  return out
}

function legacySlotMapping(slot, selectedProfile = 'xbox') {
  if (!slot || typeof slot !== 'object') return null

  const chosen = slot[selectedProfile]
  if (chosen && typeof chosen === 'object') return pickValidGamepadRows(chosen)
  for (const profile of LEGACY_PROFILE_KEYS) {
    const candidate = slot[profile]
    if (candidate && typeof candidate === 'object') return pickValidGamepadRows(candidate)
  }

  const flat = pickValidGamepadRows(slot)
  return Object.keys(flat).length ? flat : null
}

// 旧存档中的 null 同样表示解绑；猜测其来源再补默认值会覆盖自定义映射。
function pickValidGamepadRows(mapping = null) {
  const out = {}
  for (const btn of RETROPAD_BUTTON_KEYS) {
    if (mapping?.[btn] === null) out[btn] = null
    else if (isValidGamepadBinding(mapping?.[btn])) out[btn] = Number(mapping[btn])
  }
  return out
}

export function legacyMappingForPosition(inputMapping = null, position = 0) {
  const slot = Number(position)
  if (slot !== 1 && slot !== 2) return null
  return inputMapping?.legacyGamepads?.[slot] || null
}

// 读取某台设备的映射：设备自己的 → 旧的按位置存的 → XBOX 标准默认。
export function deviceMappingFor(inputMapping = null, deviceKey = null, position = 0) {
  const stored = deviceKey ? inputMapping?.gamepads?.[deviceKey] : null
  const selected = stored || legacyMappingForPosition(inputMapping, position) || {}
  return normalizeGamepadMapping(selected)
}

// 读取旧存档时的一次性迁移：只有所有已知行都显式等于完整历史默认时才替换，
// 任何自定义值、缺失行或 null 都保持原样。调用方负责检查并持久化版本，设备认领时仅复制。
export function migrateGamepadMappingDefaults(mapping = null) {
  const out = { ...(mapping || {}) }
  const untouched = LEGACY_GAMEPAD_DEFAULT_MAPPINGS.some((legacy) =>
    [...RETROPAD_BUTTON_KEYS].every((btn) =>
      Object.prototype.hasOwnProperty.call(out, btn)
      && normalizeGamepadBindingValue(out[btn]) === legacy[btn],
    ),
  )
  return untouched ? { ...out, ...GAMEPAD_DEFAULT_MAPPING } : out
}

// ---------------------------------------------------------------- 座位判定

// 自动补位只按连接顺序选择尚未占用的物理描述；同型号也可能是真实的两只手柄，
// 不能依据厂商、时间戳或状态把它们排除。
export function resolveSoloSeatPlayers(descriptors = [], seats = null, maxPlayers = GAMEPAD_SEAT_COUNT) {
  const normalizedSeats = normalizeGamepadSeats(seats)
  const players = new Map()
  const taken = new Set()

  // 先处理显式设备座位，再给自动座位分配剩余的物理描述。
  for (let player = 1; player <= GAMEPAD_SEAT_COUNT; player++) {
    const wanted = normalizedSeats[player]
    if (typeof wanted !== 'string' || wanted === GAMEPAD_SEAT_OFF || taken.has(wanted)) continue
    if (!descriptors.some((device) => device.key === wanted)) continue
    players.set(wanted, player)
    taken.add(wanted)
  }

  for (let player = 1; player <= GAMEPAD_SEAT_COUNT; player++) {
    if (normalizedSeats[player]) continue
    const free = descriptors.find((device) => !taken.has(device.key))
    if (!free) continue
    players.set(free.key, player)
    taken.add(free.key)
  }

  const limit = Math.max(1, Math.min(GAMEPAD_SEAT_COUNT, Number(maxPlayers) || 1))
  for (const [key, player] of [...players.entries()]) {
    if (player > limit) players.delete(key)
  }
  return players
}
