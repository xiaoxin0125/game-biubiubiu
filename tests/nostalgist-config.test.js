import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Nostalgist } from 'nostalgist'
import {
  buildRetroarchConfig,
  defaultRetroarchConfigForCore,
  prepareEmulator,
} from '../frontend/src/composables/nostalgist.js'
import { isNativeGamepadGuardInstalled } from '../frontend/src/composables/input/physicalGamepads.js'

// 物理手柄由网站自己的 useGamepads 映射后按键盘键位送进核心。核心如果还自己读
// 手柄，同一次按键会被送到两套绑定（内置 autoconfig：a=1、b=0、x=3、y=2），表现
// 为 A+B、A/B 与 X/Y 对调、一只手柄同时控两个玩家。

test('默认配置关掉 RetroArch 自己的手柄读取与自动配置', () => {
  const config = defaultRetroarchConfigForCore('nestopia')
  assert.equal(config.input_autodetect_enable, false)
  assert.equal(config.input_joypad_driver, 'null')
  // 常规默认仍在
  assert.equal(config.fastforward_ratio, 10)
  assert.equal(config.rewind_enable, true)
})

test('重核心例外与同步敏感核心保持原样', () => {
  const nestopia = defaultRetroarchConfigForCore('nestopia')
  assert.equal(nestopia.run_ahead_enabled, false)
  assert.equal(nestopia.run_ahead_frames, 0)

  const mgba = defaultRetroarchConfigForCore('mgba2')
  assert.equal(mgba.rewind_enable, false)
  assert.equal(mgba.rewind_granularity, 0)

  const snes = defaultRetroarchConfigForCore('snes9x')
  assert.equal(snes.run_ahead_enabled, true)
  assert.equal(snes.rewind_enable, true)
})

test('Opera 禁用会溢出默认缓冲区的回退，保留手动快照能力', () => {
  const opera = defaultRetroarchConfigForCore('opera')
  assert.equal(opera.rewind_enable, false)
  assert.equal(opera.rewind_granularity, 0)
  assert.equal(opera.run_ahead_enabled, false)
  assert.equal(defaultRetroarchConfigForCore('snes9x').rewind_enable, true)
})

test('调用方不能把原生手柄通道重新打开', () => {
  const caller = {
    input_autodetect_enable: true,
    input_joypad_driver: 'rwebpad',
    input_max_users: 2,
  }
  const config = buildRetroarchConfig('snes9x', caller)
  assert.equal(config.input_autodetect_enable, false)
  assert.equal(config.input_joypad_driver, 'null')
  // 其它字段照常生效，且不修改调用方对象
  assert.equal(config.input_max_users, 2)
  assert.deepEqual(caller, {
    input_autodetect_enable: true,
    input_joypad_driver: 'rwebpad',
    input_max_users: 2,
  })
})

test('调用方传入 null 或 undefined 也不会让开关消失', () => {
  const config = buildRetroarchConfig('snes9x', {
    input_autodetect_enable: null,
    input_joypad_driver: undefined,
  })
  assert.equal(config.input_autodetect_enable, false)
  assert.equal(config.input_joypad_driver, 'null')
})

// prepareEmulator 只有 Nostalgist.prepare 会真正启动核心，这里把它换掉以捕获最终参数。
function withPrepareSpy(run) {
  const original = Nostalgist.prepare
  const calls = []
  Nostalgist.prepare = async (options) => {
    calls.push(options)
    return { fake: true }
  }
  return Promise.resolve(run(calls)).finally(() => { Nostalgist.prepare = original })
}

test('prepareEmulator 让核心看不到手柄，并把配置原样传给 Nostalgist', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const pad = { id: 'Xbox Wireless Controller', index: 0, connected: true, buttons: [], axes: [] }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { getGamepads: () => [pad] },
  })

  try {
    await withPrepareSpy(async (calls) => {
      const emulator = await prepareEmulator({
        // 用对象形式的 core，避免真的去下载核心文件。
        core: { name: 'nestopia', js: {}, wasm: {} },
        rom: { fileName: 'test.nes', fileContent: 'rom' },
        retroarchConfig: { input_autodetect_enable: true, input_player1_a: 'j' },
        retroarchCoreConfig: { nestopia_blargg_ntsc_filter: 'disabled' },
      })

      assert.deepEqual(emulator, { fake: true })
      assert.equal(calls.length, 1)
      const options = calls[0]
      // 核心默认按名字取，所以对象形式的 nestopia 也关掉 run-ahead
      assert.equal(options.retroarchConfig.run_ahead_enabled, false)
      assert.equal(options.retroarchConfig.input_autodetect_enable, false)
      assert.equal(options.retroarchConfig.input_joypad_driver, 'null')
      // 键盘键位是网站送输入的唯一通道，必须保留
      assert.equal(options.retroarchConfig.input_player1_a, 'j')
      assert.deepEqual(options.retroarchCoreConfig, { nestopia_blargg_ntsc_filter: 'disabled' })
      assert.equal(options.respondToGlobalEvents, true)

      // 启动前已安装守卫：核心这一侧读到空列表，网站仍读得到手柄
      assert.equal(isNativeGamepadGuardInstalled(), true)
      assert.deepEqual(navigator.getGamepads(), [])
    })
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator)
    else delete globalThis.navigator
  }
})
