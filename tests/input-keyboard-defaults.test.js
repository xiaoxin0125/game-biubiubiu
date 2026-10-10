import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_KEYBOARD,
  DEFAULT_PLAYER1_RUNTIME_KEYBOARD,
  LOCAL_PLAYER2_RUNTIME_KEYBOARD,
  buildLocalMultiplayerRetroarchConfig,
  defaultLocalKeyboardForPlayer,
  defaultPlayer1KeyboardForPlatform,
  effectiveLocalKeyboardForPlayer,
  isSavedDefaultKeyboard,
  isSavedLocalPlayer2DefaultKeyboard,
} from '../frontend/src/composables/input/keyboardProfiles.js'
import {
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
} from '../frontend/src/composables/input/remotePlayers.js'
import { buildPlayerRetroarchConfig } from '../frontend/src/composables/input/retroarchConfig.js'
import { pcButtonsForPlatform } from '../frontend/src/constants/platforms.js'

// 这一组测试锁住默认键位的骨架：P1 = 左手 WASD 十字 + 右手 J K I O / U P + 数字行
// 肩键，P2 = 方向键十字 + 数字小键盘。更要紧的是锁住“同一块键盘上所有人的键互不
// 重叠”——重叠的话一个键会同时触发两名玩家的按钮。
const PLAYER_1_DEFAULT = {
  up: 'w', down: 's', left: 'a', right: 'd',
  a: 'j', b: 'k',
  x: 'i', y: 'o',
  l: 'u', r: 'p',
  l2: '7', r2: '9',
  l3: '8', r3: '0',
  start: 'enter', select: 'rshift',
}

const ARCADE_DEFAULT = {
  ...PLAYER_1_DEFAULT,
  b: 'j', a: 'k', y: 'l',
  x: 'u', l: 'i', r: 'o',
}

const MEGADRIVE_DEFAULT = {
  ...PLAYER_1_DEFAULT,
  y: 'j', b: 'k', a: 'l',
  l: 'u', x: 'i', r: 'o',
}

const PLAYER_2_DEFAULT = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  a: 'numpad1', b: 'numpad2',
  x: 'numpad4', y: 'numpad5',
  l: 'numpad7', r: 'numpad8',
  l2: 'numpad0', r2: 'kp_period',
  l3: 'numpad6', r3: 'numpad3',
  start: 'kp_enter', select: 'add',
}

// 街机 / MD 的 P2：六键按各平台自己的顺序占小键盘下排 1 2 3、上排 4 5 6。
const ARCADE_PLAYER_2_DEFAULT = {
  ...PLAYER_2_DEFAULT,
  b: 'numpad1', a: 'numpad2', y: 'numpad3',
  x: 'numpad4', l: 'numpad5', r: 'numpad6',
  l3: 'numpad7', r3: 'numpad8',
}

const MEGADRIVE_PLAYER_2_DEFAULT = {
  ...PLAYER_2_DEFAULT,
  y: 'numpad1', b: 'numpad2', a: 'numpad3',
  l: 'numpad4', x: 'numpad5', r: 'numpad6',
  l3: 'numpad7', r3: 'numpad8',
}

// 改版前的默认。存放的映射和它们完全一致时，会被当成“用户没改过”并升级成新默认。
const OLD_PLAYER_1_DEFAULT = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  a: 'z', b: 'x',
  x: 'a', y: 's',
  l: 'q', r: 'w',
  l2: '1', r2: '3',
  l3: '2', r3: '4',
  start: 'enter', select: 'rshift',
}

const OLD_ARCADE_DEFAULT = {
  ...OLD_PLAYER_1_DEFAULT,
  b: 'z', a: 'x', y: 'c', x: 'd',
  l: 'g', r: 'h',
}

const OLD_MEGADRIVE_DEFAULT = {
  ...OLD_PLAYER_1_DEFAULT,
  a: 'c', b: 'x', y: 'z', x: 's',
  l: 'a', r: 'd',
}

const OLD_PLAYER_2_DEFAULT = {
  up: 'numpad8', down: 'numpad2', left: 'numpad4', right: 'numpad6',
  a: 'numpad1', b: 'numpad3', x: 'numpad7', y: 'numpad9',
  l: 'divide', r: 'multiply', l2: 'subtract', r2: 'add',
  l3: 'kp_period', r3: 'numpad5', start: 'kp_enter', select: 'numpad0',
}

const PLATFORMS = ['nes', 'snes', 'gba', 'megadrive', 'genesis', 'arcade', 'psx']

const PLAYER_BUTTON = '(up|down|left|right|a|b|x|y|l|r|l2|r2|l3|r3|start|select)'

function activePlayerConfig(cfg, players = [1, 2, 3, 4]) {
  const pattern = new RegExp(`^input_player(${players.join('|')})_${PLAYER_BUTTON}$`)
  const out = []
  for (const [name, value] of Object.entries(cfg)) {
    if (!pattern.test(name)) continue
    if (!value || value === 'nul') continue
    out.push({ name, key: value })
  }
  return out
}

function duplicateKeys(entries) {
  const seen = new Map()
  const duplicates = []
  for (const { name, key } of entries) {
    const first = seen.get(key)
    if (first) duplicates.push(`${key}: ${first} / ${name}`)
    else seen.set(key, name)
  }
  return duplicates
}

function platformPlayer1Keyboard(platformId) {
  return { ...defaultPlayer1KeyboardForPlatform(platformId) }
}

function platformPlayer2Keyboard(platformId) {
  return { ...defaultLocalKeyboardForPlayer(2, platformId) }
}

function player1ConfigFor(platformId) {
  const buttons = pcButtonsForPlatform(platformId)
  return buildPlayerRetroarchConfig({}, buttons, { runtimeKeyboard: platformPlayer1Keyboard(platformId) })
}

test('默认 P1：左手 WASD 十字、右手 J K I O / U P、数字行肩键', () => {
  assert.deepEqual(DEFAULT_KEYBOARD, PLAYER_1_DEFAULT)
  assert.deepEqual(DEFAULT_PLAYER1_RUNTIME_KEYBOARD, PLAYER_1_DEFAULT)
})

test('街机 / MD 六键按两排三列：下排 J K L、上排 U I O', () => {
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('arcade'), ARCADE_DEFAULT)
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('megadrive'), MEGADRIVE_DEFAULT)
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('genesis'), MEGADRIVE_DEFAULT)
})

test('默认 P2：方向键十字 + 数字小键盘成对铺开', () => {
  assert.deepEqual(defaultLocalKeyboardForPlayer(2), PLAYER_2_DEFAULT)
})

test('街机 / MD 的 P2：六键占小键盘下排 1 2 3、上排 4 5 6', () => {
  assert.deepEqual(defaultLocalKeyboardForPlayer(2, 'arcade'), ARCADE_PLAYER_2_DEFAULT)
  assert.deepEqual(defaultLocalKeyboardForPlayer(2, 'megadrive'), MEGADRIVE_PLAYER_2_DEFAULT)
  assert.deepEqual(defaultLocalKeyboardForPlayer(2, 'genesis'), MEGADRIVE_PLAYER_2_DEFAULT)
  for (const profile of [ARCADE_PLAYER_2_DEFAULT, MEGADRIVE_PLAYER_2_DEFAULT]) {
    const keys = Object.values(profile)
    assert.equal(new Set(keys).size, keys.length)
  }
})

test('存的还是通用 P2 默认时，按平台套用对应变体；自己改过就整份保留', () => {
  const stored = { keyboardP2: { ...PLAYER_2_DEFAULT } }
  assert.deepEqual(effectiveLocalKeyboardForPlayer(stored, 2, 'arcade'), ARCADE_PLAYER_2_DEFAULT)
  assert.deepEqual(effectiveLocalKeyboardForPlayer(stored, 2, 'megadrive'), MEGADRIVE_PLAYER_2_DEFAULT)
  assert.deepEqual(effectiveLocalKeyboardForPlayer(stored, 2, 'snes'), PLAYER_2_DEFAULT)

  const customized = { keyboardP2: { ...PLAYER_2_DEFAULT, up: 'numpad9' } }
  assert.deepEqual(effectiveLocalKeyboardForPlayer(customized, 2, 'arcade'), { ...PLAYER_2_DEFAULT, up: 'numpad9' })
})

test('P2 运行时键位覆盖全部 16 个按钮、无重复、不落在 P1 默认上', () => {
  const runtimeKeys = Object.values(LOCAL_PLAYER2_RUNTIME_KEYBOARD)
  assert.equal(runtimeKeys.length, 16)
  assert.equal(new Set(runtimeKeys).size, 16)
  assert.deepEqual(runtimeKeys.filter((key) => !key), [])
  const player1Keys = new Set(Object.values(PLAYER_1_DEFAULT))
  for (const platform of PLATFORMS) {
    for (const key of Object.values(platformPlayer1Keyboard(platform))) {
      player1Keys.add(key)
    }
  }
  assert.deepEqual(runtimeKeys.filter((key) => player1Keys.has(key)), [])
})

test('P1 默认（含各平台变体）与 P2 默认（含各平台变体）不重叠', () => {
  for (const platform of PLATFORMS) {
    const player2Keys = new Set(Object.values(platformPlayer2Keyboard(platform)))
    const overlap = Object.values(platformPlayer1Keyboard(platform)).filter((key) => player2Keys.has(key))
    assert.deepEqual(overlap, [], `${platform} 的 P1 默认和 P2 默认撞键`)
  }
})

test('单机双打：P1 与 P2 的 core 配置没有重复键', () => {
  for (const platform of PLATFORMS) {
    const buttons = pcButtonsForPlatform(platform)
    const cfg = {
      ...player1ConfigFor(platform),
      ...buildLocalMultiplayerRetroarchConfig(2, buttons),
    }
    const duplicates = duplicateKeys(activePlayerConfig(cfg, [1, 2]))
    assert.deepEqual(duplicates, [], `${platform} 的 P1/P2 配置撞键`)
    assert.equal(cfg.input_player2_up, 'up')
    assert.equal(cfg.input_player2_a, 'z')
    assert.equal(cfg.input_player1_up, platformPlayer1Keyboard(platform).up)
  }
})

test('四人房间：host 的 P1 与远端 P2/P3/P4 的 core 配置没有重复键', () => {
  for (const platform of PLATFORMS) {
    const buttons = pcButtonsForPlatform(platform)
    const player1Config = player1ConfigFor(platform)
    const reserved = activePlayerConfig(player1Config, [1]).map((entry) => entry.key)
    const cfg = {
      ...player1Config,
      ...buildRemotePlayersRetroarchConfig(4, reserved, buttons),
    }
    const duplicates = duplicateKeys(activePlayerConfig(cfg, [1, 2, 3, 4]))
    assert.deepEqual(duplicates, [], `${platform} 的四人配置撞键`)
  }
})

test('远端 P2 用的就是单机 P2 的运行时键位', () => {
  assert.deepEqual(buildRemotePlayerKeyMaps(2)[2], LOCAL_PLAYER2_RUNTIME_KEYBOARD)
})

test('旧默认（通用 / 街机 / MD / P2 小键盘）会被识别成“没改过”以升级到新默认', () => {
  assert.equal(isSavedDefaultKeyboard(OLD_PLAYER_1_DEFAULT), true)
  assert.equal(isSavedDefaultKeyboard(OLD_ARCADE_DEFAULT), true)
  assert.equal(isSavedDefaultKeyboard(OLD_MEGADRIVE_DEFAULT), true)
  assert.equal(isSavedLocalPlayer2DefaultKeyboard(OLD_PLAYER_2_DEFAULT), true)

  assert.equal(isSavedDefaultKeyboard({ ...OLD_PLAYER_1_DEFAULT, a: 'n' }), false)
  assert.equal(isSavedLocalPlayer2DefaultKeyboard({ ...OLD_PLAYER_2_DEFAULT, up: 'numpad9' }), false)

  // 新默认本身不该被当成“旧默认”去替换。
  assert.equal(isSavedDefaultKeyboard(PLAYER_1_DEFAULT), false)
  assert.equal(isSavedLocalPlayer2DefaultKeyboard(PLAYER_2_DEFAULT), false)
})
