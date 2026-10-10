import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GAMEPAD_DEFAULT_MAPPING,
  GAMEPAD_LAYOUT_VERSION,
} from '../frontend/src/composables/input/gamepadProfiles.js'

function response(data) {
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => data,
  }
}

test('旧手柄映射只迁移并持久化一次，设备认领和当前自定义交换不再重写', async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousFetch = globalThis.fetch
  const records = new Map()
  let writes = 0
  globalThis.localStorage = {
    getItem(key) { return records.get(key) ?? null },
    setItem(key, value) { writes += 1; records.set(key, value) },
  }
  globalThis.fetch = async () => response({ user: null })

  const oldDefault = { ...GAMEPAD_DEFAULT_MAPPING, a: 1, b: 0, x: 3, y: 2 }
  records.set('input-mapping:guest', JSON.stringify({
    gamepads: { 1: { xbox: oldDefault } },
    gamepadProfiles: { 1: 'xbox' },
  }))

  try {
    const first = await import(`../frontend/src/composables/useInputMapping.js?migration=${Date.now()}`)
    const firstMapping = first.useInputMapping()
    assert.equal(writes, 1)
    assert.equal(firstMapping.mapping.value.gamepadLayoutVersion, GAMEPAD_LAYOUT_VERSION)
    assert.deepEqual(
      {
        a: firstMapping.mapping.value.legacyGamepads[1].a,
        b: firstMapping.mapping.value.legacyGamepads[1].b,
        x: firstMapping.mapping.value.legacyGamepads[1].x,
        y: firstMapping.mapping.value.legacyGamepads[1].y,
      },
      { a: 0, b: 1, x: 2, y: 3 },
    )

    // Adoption copies the already migrated legacy value; it does not run a
    // second per-row migration or resurrect null rows.
    firstMapping.bindGamepadDevice('Legacy Pad#0', 1)
    assert.equal(writes, 2)
    const afterAdoption = JSON.parse(records.get('input-mapping:guest'))
    assert.deepEqual(
      {
        a: afterAdoption.gamepads['Legacy Pad#0'].a,
        b: afterAdoption.gamepads['Legacy Pad#0'].b,
        x: afterAdoption.gamepads['Legacy Pad#0'].x,
        y: afterAdoption.gamepads['Legacy Pad#0'].y,
      },
      { a: 0, b: 1, x: 2, y: 3 },
    )

    const customSwap = { ...GAMEPAD_DEFAULT_MAPPING, a: 1, b: 0, x: 3, y: 2 }
    records.set('input-mapping:guest', JSON.stringify({
      gamepads: { 'Current Pad#0': customSwap },
      gamepadLayoutVersion: GAMEPAD_LAYOUT_VERSION,
    }))
    const second = await import(`../frontend/src/composables/useInputMapping.js?custom=${Date.now()}`)
    const secondMapping = second.useInputMapping()
    assert.equal(writes, 2)
    assert.deepEqual(
      {
        a: secondMapping.mapping.value.gamepads['Current Pad#0'].a,
        b: secondMapping.mapping.value.gamepads['Current Pad#0'].b,
        x: secondMapping.mapping.value.gamepads['Current Pad#0'].x,
        y: secondMapping.mapping.value.gamepads['Current Pad#0'].y,
      },
      { a: 1, b: 0, x: 3, y: 2 },
    )
  } finally {
    await new Promise((resolve) => setImmediate(resolve))
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
    globalThis.fetch = previousFetch
  }
})
