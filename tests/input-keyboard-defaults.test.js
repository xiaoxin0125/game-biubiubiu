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
  effectiveKeyboardForPlayer,
  effectiveLocalKeyboardForPlayer,
  isJ2meKeyboardProfile,
  isSavedDefaultKeyboard,
  isSavedLocalPlayer2DefaultKeyboard,
  isValidKeyboardBinding,
  platformKeyboardProfileId,
  sanitizePlatformKeyboards,
  withPlayerKeyboard,
} from '../frontend/src/composables/input/keyboardProfiles.js'
import {
  buildRemotePlayerKeyMaps,
  buildRemotePlayersRetroarchConfig,
} from '../frontend/src/composables/input/remotePlayers.js'
import { buildPlayerRetroarchConfig } from '../frontend/src/composables/input/retroarchConfig.js'
import { pcButtonsForPlatform, pcButtonOrderForPlatform, getPlatform } from '../frontend/src/constants/platforms.js'
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

// SMS / Game Gear 只有 1 / 2 两颗按键（retropad b → 1，a → 2），1 落 J、2 落 K。
const SMS_DEFAULT = {
  ...PLAYER_1_DEFAULT,
  a: 'k', b: 'j',
}

// PCE 六键手柄：III / IV 是 retropad y / x，落 I / O；「模式」（l2）落 M。
const PCE_DEFAULT = {
  ...PLAYER_1_DEFAULT,
  x: 'o', y: 'i', l2: 'm',
}

// 3DO：A / B / C 是 retropad y / b / a，落 J / K / L。
const THREEDO_DEFAULT = {
  ...PLAYER_1_DEFAULT,
  y: 'j', b: 'k', a: 'l',
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

test('世嘉 32X 与 MD 用同一套六键键位', () => {
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('sega32x'), MEGADRIVE_DEFAULT)
  assert.deepEqual(defaultLocalKeyboardForPlayer(2, 'sega32x'), MEGADRIVE_PLAYER_2_DEFAULT)
})

test('SMS / Game Gear：面板上的 1 落 J、2 落 K', () => {
  for (const platform of ['sms', 'gamegear']) {
    assert.deepEqual(defaultPlayer1KeyboardForPlatform(platform), SMS_DEFAULT)
    const labels = getPlatform(platform).buttonLabels
    // 核心里 retropad b→1、a→2，所以 1 是 b、2 是 a。
    assert.equal(labels.b, '1')
    assert.equal(SMS_DEFAULT.b, 'j', `${platform} 的按键 1 不是 J`)
    assert.equal(labels.a, '2')
    assert.equal(SMS_DEFAULT.a, 'k', `${platform} 的按键 2 不是 K`)
  }
})

test('PCE / PCE-CD：III / IV 落 I / O，模式落 M', () => {
  for (const platform of ['pcengine', 'pcecd']) {
    assert.deepEqual(defaultPlayer1KeyboardForPlatform(platform), PCE_DEFAULT)
    const labels = getPlatform(platform).buttonLabels
    assert.equal(labels.y, 'III')
    assert.equal(PCE_DEFAULT.y, 'i', `${platform} 的 III 不是 I`)
    assert.equal(labels.x, 'IV')
    assert.equal(PCE_DEFAULT.x, 'o', `${platform} 的 IV 不是 O`)
    assert.equal(labels.l2, '模式')
    assert.equal(PCE_DEFAULT.l2, 'm', `${platform} 的模式不是 M`)
  }
})

test('3DO：A / B / C 落 J / K / L', () => {
  assert.deepEqual(defaultPlayer1KeyboardForPlatform('3do'), THREEDO_DEFAULT)
  const labels = getPlatform('3do').buttonLabels
  assert.equal(labels.y, 'A')
  assert.equal(THREEDO_DEFAULT.y, 'j')
  assert.equal(labels.b, 'B')
  assert.equal(THREEDO_DEFAULT.b, 'k')
  assert.equal(labels.a, 'C')
  assert.equal(THREEDO_DEFAULT.a, 'l')
})

test('MD / 32X 的按键设置按手柄顺序 A B C X Y Z 排列', () => {
  const order = pcButtonOrderForPlatform('megadrive')
  const keyForLabel = (platform, label) => order.find((key) => getPlatform(platform).buttonLabels[key] === label)
  assert.deepEqual(
    ['A', 'B', 'C', 'X', 'Y', 'Z'].map((label) => keyForLabel('megadrive', label)),
    ['y', 'b', 'a', 'l', 'x', 'r'],
  )
  assert.deepEqual(pcButtonOrderForPlatform('sega32x'), order)
  assert.deepEqual(pcButtonOrderForPlatform('genesis'), order)
  // 其它平台沿用原来的分组排法。
  assert.equal(pcButtonOrderForPlatform('nes'), null)
  assert.equal(pcButtonOrderForPlatform('j2me'), null)
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

test('J2ME 改键只写 J2ME 自己的存档，其它平台照旧', () => {
  // 没改过的账号：共用存档还是通用默认。
  const stored = { keyboard: { ...PLAYER_1_DEFAULT } }
  // 在 J2ME 里把手机 3 改到 q，保存的是 J2ME 的整份键位。
  const customized = { ...J2ME_DEFAULT, a: 'q' }
  const next = withPlayerKeyboard(stored, 1, customized, 'j2me')

  // 共用存档一个键都没动。
  assert.deepEqual(next.keyboard, PLAYER_1_DEFAULT)
  // J2ME 用改过的键位。
  assert.deepEqual(effectiveKeyboardForPlayer(next, 1, 'j2me'), customized)
  assert.deepEqual(effectiveLocalKeyboardForPlayer(next, 1, 'j2me'), customized)
  // 其它平台仍然套用自己的默认，不会变成小键盘。
  assert.deepEqual(effectiveKeyboardForPlayer(next, 1, 'nes'), PLAYER_1_DEFAULT)
  assert.deepEqual(effectiveKeyboardForPlayer(next, 1, 'sfc'), PLAYER_1_DEFAULT)
  assert.deepEqual(effectiveKeyboardForPlayer(next, 1, 'arcade'), ARCADE_DEFAULT)
  assert.deepEqual(effectiveKeyboardForPlayer(next, 1, 'megadrive'), MEGADRIVE_DEFAULT)
  assert.deepEqual(effectiveLocalKeyboardForPlayer(next, 1, 'nes'), PLAYER_1_DEFAULT)

  // 有自己默认键位 / 专属存档的平台就那三个（genesis 收敛到 MD）。
  assert.equal(platformKeyboardProfileId('j2me'), 'j2me')
  assert.equal(platformKeyboardProfileId('arcade'), 'arcade')
  assert.equal(platformKeyboardProfileId('genesis'), 'megadrive')
  assert.equal(platformKeyboardProfileId('nes'), null)
  assert.equal(platformKeyboardProfileId(null), null)
})

test('其它平台改键也不会写到 J2ME 的格子里', () => {
  const stored = withPlayerKeyboard({ keyboard: { ...PLAYER_1_DEFAULT } }, 1, { ...ARCADE_DEFAULT, a: 'q' }, 'arcade')
  assert.deepEqual(effectiveKeyboardForPlayer(stored, 1, 'arcade'), { ...ARCADE_DEFAULT, a: 'q' })
  assert.deepEqual(effectiveKeyboardForPlayer(stored, 1, 'j2me'), J2ME_DEFAULT)
  assert.deepEqual(effectiveKeyboardForPlayer(stored, 1, 'nes'), PLAYER_1_DEFAULT)
  assert.deepEqual(stored.keyboard, PLAYER_1_DEFAULT)
})

test('写进共用存档的整套 J2ME 键位会被认出来（迁移用）', () => {
  // 在 J2ME 里按「重置键盘」之后，共用存档就是这一份。
  assert.equal(isJ2meKeyboardProfile({ ...J2ME_DEFAULT }), true)
  // 只改过几颗键也认（十颗手机键里还剩六颗以上对得上）。
  assert.equal(isJ2meKeyboardProfile({ ...J2ME_DEFAULT, a: 'q' }), true)
  assert.equal(isJ2meKeyboardProfile({ ...J2ME_DEFAULT, a: 'q', b: 'e', x: 'r' }), true)
  assert.equal(isJ2meKeyboardProfile({ ...J2ME_DEFAULT, a: 'q', b: 'e', x: 'r', y: 't' }), true)
  // 通用 / 街机 / MD / 玩家自己摆的键位都不算。
  assert.equal(isJ2meKeyboardProfile({ ...PLAYER_1_DEFAULT }), false)
  assert.equal(isJ2meKeyboardProfile({ ...ARCADE_DEFAULT }), false)
  assert.equal(isJ2meKeyboardProfile({ ...MEGADRIVE_DEFAULT }), false)
  assert.equal(isJ2meKeyboardProfile({
    ...DEFAULT_KEYBOARD,
    a: 'numpad1', b: 'numpad2', x: 'numpad4', y: 'numpad5',
    l: 'numpad7', r: 'numpad8', l2: 'numpad9', r2: 'numpad0',
  }), false)
  // 空存档 / 缺键的存档不是。
  assert.equal(isJ2meKeyboardProfile({}), false)
  assert.equal(isJ2meKeyboardProfile(null), false)
})

test('平台键位存档只保留有默认键位的平台与合法按键', () => {
  const sanitized = sanitizePlatformKeyboards({
    j2me: { ...J2ME_DEFAULT, bogus: 'x', a: 'nul' },
    nes: { ...PLAYER_1_DEFAULT },
    'not-a-platform': { ...J2ME_DEFAULT },
  })
  assert.deepEqual(Object.keys(sanitized), ['j2me'])
  assert.equal(sanitized.j2me.a, null)
  assert.equal('bogus' in sanitized.j2me, false)
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
  for (const key of ['z', 'x', 'v', 'n', 't', 'f4', 'up', 'down']) {
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
