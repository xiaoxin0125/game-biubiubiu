import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  DEFAULT_KEYBOARD,
  DEFAULT_PLAYER1_RUNTIME_KEYBOARD,
  LOCAL_PLAYER2_RUNTIME_KEYBOARD,
  buildLocalMultiplayerRetroarchConfig,
  buildLocalPlayerKeyboardMap,
  defaultLocalKeyboardForPlayer,
  defaultPlayer1KeyboardForPlatform,
  effectiveLocalKeyboardForPlayer,
  isSavedDefaultKeyboard,
  isSavedLocalPlayer2DefaultKeyboard,
  isValidKeyboardBinding,
} from '../frontend/src/composables/input/keyboardProfiles.js'
import {
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
} from '../frontend/src/composables/input/remotePlayers.js'
import { buildPlayerRetroarchConfig } from '../frontend/src/composables/input/retroarchConfig.js'
import { pcButtonsForPlatform, getPlatform } from '../frontend/src/constants/platforms.js'
import { isSinglePlayerPlatform } from '../shared/registry/platform-players.js'
import { normalizeRetroarchKey } from '../frontend/src/composables/input/keyboardKeys.js'
import { J2ME_BUTTON_KEYS } from '../frontend/src/composables/player/j2meRuntime.js'
import {
  interceptLocalPlayer2RuntimeKey,
  localPlayer2RuntimeKeySet,
} from '../frontend/src/composables/player/solo/useLocalPlayerInput.js'

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

// J2ME：手机键盘照数字小键盘摆 —— 手机 1 / 3 / 5 / 7 / 9 / 0 落在小键盘上同样数字的
// 那几颗键（retropad 的 x / a / l2 / y / b / r2），* 落在 0 旁边那颗 .（小数点），
// # 落在小键盘回车；两块软键（select = 左软键 / start = 右软键）是主回车与右 Shift。
// 十字仍是 WASD，所以一只手管方向、一只手管手机键盘。
const J2ME_DEFAULT = {
  ...PLAYER_1_DEFAULT,
  x: 'numpad1', a: 'numpad3', l2: 'numpad5',
  y: 'numpad7', b: 'numpad9', r2: 'numpad0',
  l: 'kp_period', r: 'kp_enter',
  select: 'enter', start: 'rshift',
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

// 平台表里已经只有通用名（FC / SFC / MD），别名（famicom / snes / genesis）只作为
// 老数据出现，由下面单独一条用例盯着「照样套用同一套键位」。
const PLATFORMS = ['nes', 'sfc', 'gba', 'megadrive', 'arcade', 'psx', 'pcengine', 'pcecd', 'neogeocd', 'ngp', '3do', 'sega32x', 'j2me']

// P2 的默认键位只在多人机上成立：单人机没有 P2（按键设置里那一页根本不出现，J2ME
// 模拟的是一部手机），而 J2ME 把 P1 摆在小键盘上，正好和 P2 的通用默认同一片区。
const MULTIPLAYER_PLATFORMS = PLATFORMS.filter((id) => !isSinglePlayerPlatform(id))

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
  // 老记录里的别名（genesis）收敛到 MD，照样套用六键键位，不掉回通用默认
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('genesis'), MEGADRIVE_DEFAULT)
})

test('J2ME：手机键盘照小键盘摆，* / # 落在 . 与小键盘回车，软键是回车与右 Shift', () => {
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('j2me'), J2ME_DEFAULT)
  // 面板上每一颗手机键写的数字，就是它默认落在小键盘上的那颗键。
  const labels = getPlatform('j2me').buttonLabels
  for (const button of ['x', 'a', 'l2', 'y', 'b', 'r2']) {
    assert.equal(J2ME_DEFAULT[button], `numpad${labels[button].replace(/\D/g, '')}`, `${button}（手机 ${labels[button]}）没落在小键盘上`)
  }
  assert.equal(J2ME_DEFAULT.l, 'kp_period')   // ＊ → 0 旁边那颗 .
  assert.equal(J2ME_DEFAULT.r, 'kp_enter')    // ＃ → 小键盘回车
  // select 是左软键、start 是右软键（见 j2meRuntime.js 的 J2ME_BUTTON_KEYS）。
  assert.equal(labels.select, '软键1')
  assert.equal(J2ME_DEFAULT.select, 'enter')
  assert.equal(labels.start, '软键2')
  assert.equal(J2ME_DEFAULT.start, 'rshift')
  // 十字与平台用不到的按钮跟着通用默认走，和其它平台变体一样。
  assert.equal(J2ME_DEFAULT.up, PLAYER_1_DEFAULT.up)
  assert.equal(J2ME_DEFAULT.l3, PLAYER_1_DEFAULT.l3)
})

test('J2ME：每颗按钮都有关键、键码与互不重复的默认键', () => {
  const buttons = pcButtonsForPlatform('j2me')
  const keys = buttons.map((button) => J2ME_DEFAULT[button])
  assert.equal(new Set(keys).size, buttons.length, 'J2ME 的默认键有重复')
  for (const button of buttons) {
    assert.ok(isValidKeyboardBinding(J2ME_DEFAULT[button]), `J2ME 的 ${button} 没有默认键，PC 键盘上按不到`)
    assert.ok(J2ME_BUTTON_KEYS[button] != null, `J2ME 的 ${button} 没有 MIDP 键码`)
  }
  // 适配层按运行时键位反查按钮（见 j2meRuntime.js 的 keyboard()）：每个默认键都要
  // 落回它自己那颗按钮，否则按下去会打到别的手机键上。
  for (const button of buttons) {
    const binding = normalizeRetroarchKey(J2ME_DEFAULT[button])
    const found = Object.keys(J2ME_BUTTON_KEYS).find((b) => normalizeRetroarchKey(J2ME_DEFAULT[b]) === binding)
    assert.equal(found, button, `${J2ME_DEFAULT[button]} 没有落到 ${button} 上`)
  }
})

test('默认 P2：方向键十字 + 数字小键盘成对铺开', () => {
  assert.deepEqual(defaultLocalKeyboardForPlayer(2), PLAYER_2_DEFAULT)
})

test('街机 / MD 的 P2：六键占小键盘下排 1 2 3、上排 4 5 6', () => {
  assert.deepEqual(defaultLocalKeyboardForPlayer(2, 'arcade'), ARCADE_PLAYER_2_DEFAULT)
  assert.deepEqual(defaultLocalKeyboardForPlayer(2, 'megadrive'), MEGADRIVE_PLAYER_2_DEFAULT)
  // 别名（genesis）算作 MD，P2 同样走六键那一套
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
  // 别名（genesis）算作 MD；sfc 没有自己的变体，沿用通用 P2 默认
  assert.deepEqual(effectiveLocalKeyboardForPlayer(stored, 2, 'genesis'), MEGADRIVE_PLAYER_2_DEFAULT)
  assert.deepEqual(effectiveLocalKeyboardForPlayer(stored, 2, 'sfc'), PLAYER_2_DEFAULT)

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
  for (const platform of MULTIPLAYER_PLATFORMS) {
    const player2Keys = new Set(Object.values(platformPlayer2Keyboard(platform)))
    const overlap = Object.values(platformPlayer1Keyboard(platform)).filter((key) => player2Keys.has(key))
    assert.deepEqual(overlap, [], `${platform} 的 P1 默认和 P2 默认撞键`)
  }
})

test('单机双打：P1 与 P2 的 core 配置没有重复键', () => {
  for (const platform of MULTIPLAYER_PLATFORMS) {
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
  for (const platform of MULTIPLAYER_PLATFORMS) {
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

// 单机双打：core 里 P2 绑的是运行期键位（z x v n …），按键设置里给 P2 看的是小键盘那
// 一套。core 直接读 canvas 上的原生键盘事件，所以玩家本人按到 z x v n 这些键时会被
// 当成 P2 的输入 —— 但它们并不在 P2 的映射里，属于误触，必须吞掉；P2 只认前端按映射
// 换算出来的合成事件（带 __internalInputDispatch）。
test('本地 P2 的吞键集合与 core 里 P2 实际绑定的键完全一致', () => {
  for (const platform of PLATFORMS) {
    const buttons = pcButtonsForPlatform(platform)
    const cfg = buildLocalMultiplayerRetroarchConfig(2, buttons)
    const bound = new Set(activePlayerConfig(cfg, [2]).map((entry) => entry.key))
    const runtimeKeys = localPlayer2RuntimeKeySet(buildLocalPlayerKeyboardMap(2, buttons))
    assert.deepEqual(
      [...runtimeKeys].sort(),
      [...bound].sort(),
      `${platform} 的 P2 吞键集合和 core 绑定对不上`,
    )
  }
})

test('本地吞键不会吃掉 P1 自己的键', () => {
  for (const platform of PLATFORMS) {
    const runtimeKeys = localPlayer2RuntimeKeySet(buildLocalPlayerKeyboardMap(2, pcButtonsForPlatform(platform)))
    const player1Keys = Object.values(platformPlayer1Keyboard(platform))
    const overlap = player1Keys.filter((key) => runtimeKeys.has(key))
    assert.deepEqual(overlap, [], `${platform}：P2 的吞键集合里混进了 P1 的键`)
    // 平台用不到的按钮（NES 的 L2/L3…）没有绑进 core，也就不该被吞。
    const buttons = new Set(pcButtonsForPlatform(platform))
    for (const btn of ['l2', 'r2', 'l3', 'r3']) {
      if (buttons.has(btn)) continue
      assert.ok(!runtimeKeys.has(LOCAL_PLAYER2_RUNTIME_KEYBOARD[btn]), `${platform}：${btn} 没绑定却被吞`)
    }
  }
})

test('单机吞键：原生事件被拦下，合成事件与单人模式放行', () => {
  const runtimeKeys = localPlayer2RuntimeKeySet(buildLocalPlayerKeyboardMap(2, pcButtonsForPlatform('nes')))
  // NES 用得上十字 + A/B + X/Y（连发）+ Start/Select：z x v n / t m 都在 core 里。
  for (const key of ['z', 'x', 'v', 'n', 't', 'm', 'up', 'down']) {
    assert.ok(runtimeKeys.has(key), `${key} 应该是 P2 的运行时键`)
  }

  const makeEvent = (key, code) => {
    const calls = { prevented: 0, stopped: 0 }
    return {
      key,
      code,
      preventDefault: () => { calls.prevented++ },
      stopImmediatePropagation: () => { calls.stopped++ },
      calls,
    }
  }

  const hostEvent = makeEvent('z', 'KeyZ')
  assert.equal(interceptLocalPlayer2RuntimeKey(hostEvent, { enabled: true, runtimeKeys }), true)
  assert.equal(hostEvent.calls.prevented, 1)
  assert.equal(hostEvent.calls.stopped, 1)

  // P1 的键（WASD / J K I O / U P）不受影响。
  for (const [key, code] of [['w', 'KeyW'], ['j', 'KeyJ'], ['k', 'KeyK'], ['enter', 'Enter']]) {
    const own = makeEvent(key, code)
    assert.equal(interceptLocalPlayer2RuntimeKey(own, { enabled: true, runtimeKeys }), false, `${key} 被误吞`)
    assert.equal(own.calls.prevented, 0)
  }

  // 方向键既是 P2 的运行期键，也是 P2 默认映射里的十字 —— 所以它确实在吞键集合里，
  // 但真实链路上 handleLocalPlayer2Keyboard 会先把它按 P2 的映射处理掉（见链路顺序测试）。
  assert.ok(runtimeKeys.has('up') && runtimeKeys.has('left'))

  // 前端按 P2 映射注入的合成事件放行（那是 P2 真正的输入通道）。
  const injected = makeEvent('z', 'KeyZ')
  injected.__internalInputDispatch = true
  assert.equal(interceptLocalPlayer2RuntimeKey(injected, { enabled: true, runtimeKeys }), false)
  assert.equal(injected.calls.prevented, 0)

  // 触屏布局、单人模式、按键设置打开时不吞键。
  assert.equal(interceptLocalPlayer2RuntimeKey(makeEvent('z', 'KeyZ'), { enabled: false, runtimeKeys }), false)
  assert.equal(interceptLocalPlayer2RuntimeKey(makeEvent('z', 'KeyZ'), { enabled: true, runtimeKeys: null }), false)
  assert.equal(interceptLocalPlayer2RuntimeKey(makeEvent('z', 'KeyZ'), { enabled: true, runtimeKeys: new Set() }), false)
})

test('单机键盘链路接上吞键，且排在 P1 / P2 映射之后', () => {
  const source = readFileSync(new URL('../frontend/src/composables/player/solo/useLocalPlayerInput.js', import.meta.url), 'utf8')
  assert.match(source, /return handleLocalPlayer2RuntimeKey\(e\)/)
  assert.match(source, /enabled: !showInput\.value && !isTouchLayout\.value && activeMaxPlayers\.value >= 2/)

  const chain = source.slice(source.indexOf('function handleLocalKeyboardEvent'))
  const p2Map = chain.indexOf('handleLocalPlayer2Keyboard(e)')
  const p1Map = chain.indexOf('handleLocalKeyboardButton(e)')
  const guard = chain.indexOf('handleLocalPlayer2RuntimeKey(e)')
  assert.ok(p2Map >= 0 && p1Map >= 0 && guard >= 0, '键盘链路缺少一环')
  // 玩家自己的映射先处理，吞键只兜住没人认领的运行期键。
  assert.ok(p2Map < p1Map && p1Map < guard, '吞键必须在 P1 / P2 映射之后')
})
