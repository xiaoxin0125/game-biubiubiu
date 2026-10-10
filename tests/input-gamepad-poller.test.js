import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createRenderer,
  defineComponent,
  computed,
  h,
  nextTick,
  ref,
} from 'vue'
import { useGamepads } from '../frontend/src/composables/useGamepads.js'
import { GAMEPAD_DEFAULT_MAPPING } from '../frontend/src/composables/input/gamepadProfiles.js'
import { installNativeGamepadGuard } from '../frontend/src/composables/input/physicalGamepads.js'

const renderer = createRenderer({
  patchProp() {},
  insert(child, parent) {
    if (!parent.children) parent.children = []
    parent.children.push(child)
    child.parent = parent
  },
  remove(child) {
    const parent = child?.parent
    if (parent?.children) parent.children = parent.children.filter((item) => item !== child)
  },
  createElement(type) { return { type, children: [] } },
  createText(text) { return { text } },
  createComment(text) { return { comment: text } },
  setText(node, text) { node.text = text },
  setElementText(node, text) { node.text = text },
  parentNode(node) { return node?.parent || null },
  nextSibling() { return null },
  querySelector() { return null },
  setScopeId() {},
  cloneNode(node) { return { ...node } },
  insertStaticContent() { return [] },
})

function makePad(id, index, { pressed = [], axes = [0, 0] } = {}) {
  return {
    id,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    buttons: Array.from({ length: 16 }, (_, button) => ({
      pressed: pressed.includes(button),
      value: pressed.includes(button) ? 1 : 0,
    })),
    axes: [...axes],
  }
}

function setPressed(pad, button, value) {
  pad.buttons[button].pressed = value
  pad.buttons[button].value = value ? 1 : 0
}

function installBrowserFakes(pads) {
  const previous = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    raf: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  }
  const rafs = new Map()
  const intervals = new Map()
  let nextRaf = 1
  let nextInterval = 1
  const window = {
    addEventListener() {},
    removeEventListener() {},
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window })
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextRaf++
    rafs.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => rafs.delete(id)
  globalThis.setInterval = (callback) => {
    const id = nextInterval++
    intervals.set(id, callback)
    return id
  }
  globalThis.clearInterval = (id) => intervals.delete(id)

  return {
    frame() {
      const callbacks = [...rafs.values()]
      rafs.clear()
      callbacks.forEach((callback) => callback(0))
    },
    tickIntervals() {
      for (const callback of [...intervals.values()]) callback()
    },
    restore() {
      if (previous.navigator) Object.defineProperty(globalThis, 'navigator', previous.navigator)
      else delete globalThis.navigator
      if (previous.window) Object.defineProperty(globalThis, 'window', previous.window)
      else delete globalThis.window
      globalThis.requestAnimationFrame = previous.raf
      globalThis.cancelAnimationFrame = previous.cancel
      globalThis.setInterval = previous.setInterval
      globalThis.clearInterval = previous.clearInterval
    },
  }
}

function mountGamepad(options) {
  let api
  const app = renderer.createApp(defineComponent({
    setup() {
      api = useGamepads(options)
      return () => h('span')
    },
  }))
  app.mount({ type: 'root', children: [] })
  return { app, api: () => api }
}

function freshMapping() {
  return ref({
    keyboard: {},
    keyboardP2: {},
    gamepads: {},
    seats: { 1: null, 2: null },
  })
}

const NES_BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'start', 'select']

// This uses the actual composable inside a Vue renderer rather than testing a
// copied polling function, with deterministic requestAnimationFrame/intervals.
test('poller routes two pads, dpad/axes, seat switches, and disconnects', async () => {
  const pads = [makePad('Twin Pad', 0), makePad('Twin Pad', 1)]
  const browser = installBrowserFakes(pads)
  const mapping = freshMapping()
  const events = []
  const enabled = ref(true)
  const mounted = mountGamepad({
    mapping,
    seats: computed(() => mapping.value.seats),
    enabled,
    platform: ref('nes'),
    platformButtons: ref(NES_BUTTONS),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    setPressed(pads[0], 0, true) // physical A -> logical A / P1
    setPressed(pads[1], 1, true) // physical B -> logical B / P2
    browser.frame()
    assert.deepEqual(events.slice(-2), [['down', 'a', 1], ['down', 'b', 2]])

    setPressed(pads[0], 12, true) // D-pad up
    pads[0].axes[0] = 1 // right stick direction on axis 0
    browser.frame()
    assert.deepEqual(events.slice(-2), [['down', 'up', 1], ['down', 'right', 1]])

    setPressed(pads[0], 0, false)
    setPressed(pads[0], 12, false)
    pads[0].axes[0] = 0
    setPressed(pads[1], 1, false)
    browser.frame()
    assert.deepEqual(events.slice(-4).sort(), [
      ['up', 'a', 1], ['up', 'up', 1], ['up', 'right', 1], ['up', 'b', 2],
    ].sort())

    // Explicit seats change the player without changing the device mapping.
    mapping.value.seats = { 1: 'Twin Pad#1', 2: 'Twin Pad#0' }
    await nextTick()
    setPressed(pads[0], 0, true)
    browser.frame()
    assert.deepEqual(events.slice(-1), [['down', 'a', 2]])
    setPressed(pads[0], 0, false)
    browser.frame()
    assert.deepEqual(events.slice(-1), [['up', 'a', 2]])

    // Removing the first pad releases its held source; the remaining pad is
    // still enumerated, even though it has the same id.
    setPressed(pads[0], 0, true)
    browser.frame()
    assert.deepEqual(events.slice(-1), [['down', 'a', 2]])
    pads.splice(0, 1)
    mapping.value.seats = { 1: null, 2: null }
    await nextTick()
    browser.frame()
    assert.deepEqual(events.slice(-1), [['up', 'a', 2]])
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('poller aggregates ordinary A and NES turbo X without premature release', async () => {
  const pads = [makePad('Turbo Pad', 0)]
  const browser = installBrowserFakes(pads)
  const events = []
  const mounted = mountGamepad({
    mapping: freshMapping(),
    maxLocalPlayers: 1,
    platform: ref('nes'),
    platformButtons: ref(NES_BUTTONS),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    setPressed(pads[0], 0, true)
    browser.frame()
    setPressed(pads[0], 2, true) // NES turbo A targets the same logical A
    browser.frame()
    browser.tickIntervals() // turbo's off phase must not release held A
    assert.deepEqual(events, [['down', 'a', 1]])

    setPressed(pads[0], 0, false)
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1]])
    setPressed(pads[0], 2, false)
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1]])
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('resolver receives every pad and aggregates same logical room input', async () => {
  const pads = [makePad('Room Pad', 0), makePad('Room Pad', 1)]
  const browser = installBrowserFakes(pads)
  const events = []
  const seen = []
  const mounted = mountGamepad({
    mapping: freshMapping(),
    playerResolver(device, devices) {
      seen.push([device.key, devices.length])
      return 1
    },
    platform: ref('snes'),
    platformButtons: ref(['a', 'b']),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    setPressed(pads[0], 0, true)
    setPressed(pads[1], 0, true)
    browser.frame()
    assert.deepEqual(seen.slice(-2).map(([, count]) => count), [2, 2])
    assert.deepEqual(events, [['down', 'a', 1]])

    setPressed(pads[0], 0, false)
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1]])
    setPressed(pads[1], 0, false)
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1]])
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('enabled ref releases and suspends physical output', async () => {
  const pads = [makePad('Enabled Pad', 0)]
  const browser = installBrowserFakes(pads)
  const enabled = ref(true)
  const events = []
  const mounted = mountGamepad({
    mapping: freshMapping(),
    enabled,
    platform: ref('snes'),
    platformButtons: ref(['a']),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    setPressed(pads[0], 0, true)
    browser.frame()
    enabled.value = false
    await nextTick()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1]])
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1]])

    enabled.value = true
    await nextTick()
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1], ['down', 'a', 1]])
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('映射或座位变化会先释放旧逻辑按钮，再采用新映射', async () => {
  const pads = [makePad('Remap Pad', 0)]
  const browser = installBrowserFakes(pads)
  const mapping = freshMapping()
  const events = []
  const mounted = mountGamepad({
    mapping,
    platform: ref('snes'),
    platformButtons: ref(['a', 'b']),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    setPressed(pads[0], 0, true)
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1]])

    mapping.value.gamepads = {
      'Remap Pad#0': { ...GAMEPAD_DEFAULT_MAPPING, a: 1, b: 0 },
    }
    await nextTick()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1]])
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['up', 'a', 1], ['down', 'b', 1]])
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('标准手柄的 A/B/X/Y 各自独立，不会合并成 A+B 或对调', async () => {
  const pads = [makePad('Standard Pad', 0)]
  const browser = installBrowserFakes(pads)
  const events = []
  const mounted = mountGamepad({
    mapping: freshMapping(),
    platform: ref('snes'),
    platformButtons: ref(['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y']),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    // 0/1/2/3 就是手柄上的 A/B/X/Y，一行只触发一个按钮。
    for (const [index, button] of [[0, 'a'], [1, 'b'], [2, 'x'], [3, 'y']]) {
      setPressed(pads[0], index, true)
      browser.frame()
      assert.deepEqual(events.slice(-1), [['down', button, 1]], `物理按钮 ${index}`)
      setPressed(pads[0], index, false)
      browser.frame()
      assert.deepEqual(events.slice(-1), [['up', button, 1]], `物理按钮 ${index}`)
    }
    // 十字键同理，一个方向只动一个方向键
    for (const [index, button] of [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']]) {
      setPressed(pads[0], index, true)
      browser.frame()
      assert.deepEqual(events.slice(-1), [['down', button, 1]], `十字键 ${index}`)
      setPressed(pads[0], index, false)
      browser.frame()
    }
    assert.equal(events.filter(([type, button]) => type === 'down' && button === 'b').length, 1)
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('NES 的 X/Y 连发键只作用在自己的目标上', async () => {
  const pads = [makePad('Nes Pad', 0)]
  const browser = installBrowserFakes(pads)
  const events = []
  const mounted = mountGamepad({
    mapping: freshMapping(),
    platform: ref('nes'),
    platformButtons: ref(NES_BUTTONS),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    browser.frame()
    setPressed(pads[0], 2, true) // X = 连发 A
    browser.frame()
    setPressed(pads[0], 3, true) // Y = 连发 B
    browser.frame()
    assert.deepEqual([...new Set(events.map(([, button]) => button))].sort(), ['a', 'b'])
    assert.equal(events.every(([type, button, player]) => player === 1 && ['a', 'b'].includes(button)), true)
    browser.tickIntervals()
    setPressed(pads[0], 2, false)
    setPressed(pads[0], 3, false)
    browser.frame()
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})

test('模拟器看不到手柄时，网站的输入层照旧收到手柄输入', async () => {
  const pads = [makePad('Guarded Pad', 0)]
  const browser = installBrowserFakes(pads)
  const events = []
  const mounted = mountGamepad({
    mapping: freshMapping(),
    platform: ref('snes'),
    platformButtons: ref(['a', 'b']),
    pressButton(button, player) { events.push(['down', button, player]) },
    releaseButton(button, player) { events.push(['up', button, player]) },
  })

  try {
    installNativeGamepadGuard()
    assert.deepEqual(navigator.getGamepads(), [], '核心这一侧应当看不到手柄')

    browser.frame()
    setPressed(pads[0], 0, true)
    browser.frame()
    setPressed(pads[0], 1, true)
    browser.frame()
    assert.deepEqual(events, [['down', 'a', 1], ['down', 'b', 1]])

    setPressed(pads[0], 0, false)
    setPressed(pads[0], 1, false)
    browser.frame()
    assert.deepEqual(events.slice(-2), [['up', 'a', 1], ['up', 'b', 1]])
  } finally {
    mounted.app.unmount()
    browser.restore()
  }
})
