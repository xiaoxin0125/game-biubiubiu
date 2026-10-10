import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  installNativeGamepadGuard,
  isNativeGamepadGuardInstalled,
  readPhysicalPads,
} from '../frontend/src/composables/input/physicalGamepads.js'

function fakePad(id, index, pressed = []) {
  return {
    id,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    buttons: Array.from({ length: 16 }, (unused, button) => ({
      pressed: pressed.includes(button),
      value: pressed.includes(button) ? 1 : 0,
    })),
    axes: [0, 0, 0, 0],
  }
}

// 用假的 navigator 替换全局，返回恢复函数。
function withNavigator(getGamepads) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { getGamepads },
  })
  return () => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous)
    else delete globalThis.navigator
  }
}

test('安装守卫后模拟器读不到手柄，网站自己的输入层仍能读到', () => {
  const pad = fakePad('Xbox Wireless Controller', 0, [0])
  const restore = withNavigator(() => [pad])
  try {
    assert.equal(isNativeGamepadGuardInstalled(), false)
    assert.deepEqual(readPhysicalPads(), [pad], '未安装守卫时直接读浏览器')

    assert.equal(installNativeGamepadGuard(), true)
    assert.equal(isNativeGamepadGuardInstalled(), true)
    // RetroArch 的 Emscripten 运行时就是通过这个全局读手柄。
    assert.deepEqual(navigator.getGamepads(), [])
    // 网站这条映射链必须照旧拿到真实手柄。
    assert.deepEqual(readPhysicalPads(), [pad])
  } finally {
    restore()
  }
})

test('重复安装不会把手柄从网站自己的读取路径里弄丢', () => {
  const pad = fakePad('Twin Pad', 0, [1])
  const restore = withNavigator(() => [pad])
  try {
    installNativeGamepadGuard()
    installNativeGamepadGuard()
    assert.deepEqual(navigator.getGamepads(), [])
    assert.deepEqual(readPhysicalPads(), [pad])
    assert.equal(isNativeGamepadGuardInstalled(), true)
  } finally {
    restore()
  }
})

test('守卫按当前 navigator 解析真实读取器，支持被整体替换的导航对象', () => {
  const first = fakePad('Pad A', 0, [0])
  const restoreFirst = withNavigator(() => [first])
  try {
    installNativeGamepadGuard()
    assert.deepEqual(readPhysicalPads(), [first])
  } finally {
    restoreFirst()
  }

  // 换一个全新的 navigator（测试宿主、内嵌 frame 都可能这样），不安装守卫也要能读到。
  const second = fakePad('Pad B', 0, [1])
  const restoreSecond = withNavigator(() => [second])
  try {
    assert.deepEqual(readPhysicalPads(), [second])
  } finally {
    restoreSecond()
  }
})

test('没有 getGamepads 时守卫保持惰性且读取返回空列表', () => {
  const restore = withNavigator(undefined)
  try {
    assert.equal(installNativeGamepadGuard(), true)
    assert.deepEqual(readPhysicalPads(), [])
    assert.deepEqual(navigator.getGamepads(), [])
  } finally {
    restore()
  }
})

test('读取器抛错时返回空列表而不是把输入层带崩', () => {
  const restore = withNavigator(() => { throw new Error('SecurityError') })
  try {
    assert.deepEqual(readPhysicalPads(), [])
  } finally {
    restore()
  }
})
