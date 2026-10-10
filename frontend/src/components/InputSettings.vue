<template>
  <Teleport to="body">
  <div class="is-overlay">
    <div class="is-panel" :class="{ 'source-mode': props.sourceStyle || props.roomMode, 'room-mode': props.roomMode }">
      <header class="is-head">
        <h2>按键设置<span v-if="platformName" class="is-plat">· {{ platformName }}</span></h2>
        <button class="is-close" @click="$emit('close')" aria-label="关闭">×</button>
      </header>

      <div class="is-tabs">
        <button :class="{ active: tab === 'kb' }" @click="tab = 'kb'">键盘</button>
        <button :class="{ active: tab === 'gp' }" @click="tab = 'gp'">手柄</button>
      </div>

      <div v-if="activeTabCount > 1" class="is-player-tabs">
        <template v-if="tab === 'kb'">
          <button
            v-for="slot in localPlayers"
            :key="slot"
            :class="{ active: activeSlot === slot }"
            @click="playerTab = slot"
          >P{{ slot }}</button>
        </template>
        <template v-else>
          <button
            v-for="device in deviceTabs"
            :key="device.key"
            :class="{ active: activeDevice?.key === device.key }"
            :title="device.key"
            @click="activeDeviceKey = device.key"
          >{{ deviceTabLabel(device) }}</button>
        </template>
      </div>

      <template v-if="tab === 'gp'">
        <div class="is-gp-controls">
          <p class="is-gp-note">{{ gamepadNote }}</p>
          <div v-if="!roomMode" class="is-seat-list">
            <div v-for="seat in seatRows" :key="seat.player" class="is-select-field">
              <span>{{ seat.label }}</span>
              <ClaySelect
                class="is-select"
                :aria-label="seat.label"
                :model-value="seatValue(seat.player)"
                :options="seatOptions"
                :placeholder="seatPlaceholder(seat.player)"
                @update:model-value="(value) => setSeat(seat.player, value)"
              />
            </div>
          </div>
          <p v-if="gpNotice" class="is-gp-notice">{{ gpNotice }}</p>
          <p v-else-if="!deviceTabs.length" class="is-gp-note">
            没有检测到手柄。插上手柄后会立刻出现在上面，可以直接按键映射。
          </p>
          <p v-else-if="activeDevice && !activePadIsStandard" class="is-gp-note">
            这台手柄不是浏览器标准映射（standard），默认键位可能和手柄上印的字母不一致：点某一行再按手柄上对应的键，逐键映射一次即可。
          </p>
          <p v-if="deviceTabs.length" class="is-gp-note">
            测试：按住手柄上的键，对应的那一行会亮起来。
            <template v-if="liveIndexes.length">正在按下按钮 {{ liveIndexes.join('、') }}。</template>
          </p>
        </div>
      </template>

      <section class="is-grid">
        <div v-if="activeConflicts.length" class="is-warning">
          检测到 {{ activeConflicts.length }} 组重复绑定。重新绑定其中任意一个按钮会自动清除旧占用。
        </div>

        <div v-for="b in relevantButtons" :key="b.key" class="is-row">
          <div class="is-label">
            <span class="is-btn" :class="`grp-${b.group}`">{{ b.label }}</span>
          </div>

          <template v-if="tab === 'kb'">
            <button
              class="is-slot"
              :class="{ listening: listening === b.key, conflict: hasConflict(b.key) }"
              @click="startListen(b.key)"
            >
              {{ listening === b.key ? '按一个键…' : (activeKeyboard[b.key] || '—') }}
            </button>
          </template>

          <template v-else>
            <button
              class="is-slot"
              :class="{ listening: gpListening === b.key, conflict: hasConflict(b.key), live: liveButtons.has(b.key) }"
              @click="startGpListen(b.key)"
            >
              {{ gpListening === b.key ? '按手柄上的键…' : gamepadLabel(b.key) }}
            </button>
          </template>
        </div>
      </section>

      <footer class="is-foot">
        <button class="is-reset" @click="resetActive">{{ resetLabel }}</button>
        <button class="is-done" @click="$emit('close')">完成</button>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  useInputMapping,
  BUTTON_DEFS,
  GAMEPAD_SEAT_AUTO,
  GAMEPAD_SEAT_OFF,
  deviceLabel,
  describeConnectedDevices,
  effectiveLocalKeyboardForPlayer,
  isDeviceKey,
  normalizeGamepadSeats,
  normalizeKeyboardEventKey,
  resolveSoloSeatPlayers,
} from '../composables/useInputMapping.js'
import { pcButtonsForPlatform, turboButtonsForPlatform, getPlatform } from '../constants/platforms.js'
import { readPhysicalPads } from '../composables/input/physicalGamepads.js'
import ClaySelect from './ClaySelect.vue'

const props = defineProps({
  platform: { type: String, default: null },
  localPlayers: { type: Number, default: 1 },
  roomMode: { type: Boolean, default: false },
  sourceStyle: { type: Boolean, default: false },
})
defineEmits(['close'])

const {
  mapping,
  bindGamepadDevice,
  gamepadMappingForDevice,
  setKeyboard, setGamepad, setGamepadSeat,
  resetKeyboard, resetGamepad,
} = useInputMapping()
const tab = ref('kb')
const playerTab = ref(1)
const listening = ref(null)     // keyboard mode: button being re-bound
const gpListening = ref(null)   // gamepad mode: button being re-bound
const gpNotice = ref('')
const activeDeviceKey = ref('')
// Gamepad objects have native getters; retain the browser snapshots without
// turning the objects themselves into deep reactive proxies.
const connectedPads = shallowRef([])

const relevantButtons = computed(() => {
  if (!props.platform) return BUTTON_DEFS
  const p = getPlatform(props.platform)
  const allowed = new Set(pcButtonsForPlatform(props.platform) || BUTTON_DEFS.map((b) => b.key))
  const labels = p?.buttonLabels || {}
  const turboTargets = turboButtonsForPlatform(props.platform)
  const rows = BUTTON_DEFS
    .filter((b) => allowed.has(b.key))
    .map((b) => ({
      ...b,
      label: labels[b.key] || b.label,
      turboTarget: turboTargets[b.key] || null,
    }))

  // Group order: dpad → face → shoulder → system. Inside each group (except
  // dpad which stays up/down/left/right), sort by the VISIBLE label so users
  // see A/B/C/D in natural order — not B/A/D/C when platforms remap retropad.
  const groupOrder = { dpad: 0, face: 1, shoulder: 2, system: 3 }
  return rows.sort((a, b) => {
    const g = (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9)
    if (g !== 0) return g
    if (a.group === 'dpad') return 0   // preserve up/down/left/right
    const aTurbo = !!a.turboTarget
    const bTurbo = !!b.turboTarget
    if (aTurbo !== bTurbo) return aTurbo ? 1 : -1
    return String(a.label).localeCompare(String(b.label), undefined, { numeric: true })
  })
})
const platformName = computed(() => props.platform ? getPlatform(props.platform).displayName : null)
const localPlayers = computed(() => Math.max(1, Math.min(2, Number(props.localPlayers) || 1)))
const connectedDevices = computed(() => describeConnectedDevices(connectedPads.value))
const soloAssignments = computed(() => resolveSoloSeatPlayers(connectedDevices.value, mapping.value.seats, localPlayers.value))
// Both solo and room settings expose every connected device's own mapping.
const deviceTabs = connectedDevices
const activeDevice = computed(() => deviceTabs.value.find((device) => device.key === activeDeviceKey.value) || deviceTabs.value[0] || null)
const activeTabCount = computed(() => tab.value === 'kb' ? localPlayers.value : deviceTabs.value.length)
const activeSlot = computed(() => Math.max(1, Math.min(localPlayers.value, Number(playerTab.value) || 1)))

const activeKeyboard = computed(() => effectiveLocalKeyboardForPlayer(mapping.value, activeSlot.value, props.platform))
const activeGamepad = computed(() => activeDevice.value
  ? gamepadMappingForDevice(activeDevice.value.key, activeDevice.value.position)
  : {})
// 浏览器标准映射（standard）下，按钮序号对应的就是手柄上印的字母/肩键名，
// 面板上直接写出来，玩家一眼就能确认「A 行」是不是手柄的 A。
const activePadIsStandard = computed(() => activeDevice.value?.pad?.mapping === 'standard')
const STANDARD_BUTTON_NAMES = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y',
  4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'View', 9: 'Menu', 10: 'L3', 11: 'R3',
  12: '十字↑', 13: '十字↓', 14: '十字←', 15: '十字→',
}
// 手柄上正按着的键：哪一行跟着亮，就说明这个物理键映射到了哪一行。
const liveIndexes = ref([])
const liveButtons = ref(new Set())

// Keep every pad selectable for either solo seat. setGamepadSeat enforces
// exclusivity, so choosing the other seat's pad can change the assignment.
const seatOptions = computed(() => [
  { value: GAMEPAD_SEAT_AUTO, label: '自动（按连接顺序）' },
  ...connectedDevices.value.map((device) => ({ value: device.key, label: deviceLabel(device.key) })),
  { value: GAMEPAD_SEAT_OFF, label: '不使用手柄' },
])
const seatRows = computed(() => {
  if (props.roomMode) return []
  const rows = []
  for (let player = 1; player <= localPlayers.value; player++) {
    rows.push({ player, label: `P${player} 手柄` })
  }
  return rows
})
const gamepadNote = computed(() => props.roomMode
  ? '手柄默认使用 XBOX 浏览器标准映射，PS / NS 等其他手柄可逐键手动映射。房间内所有本地手柄都作为本机 P1 输入，不受单机座位设置影响；房主控制 P1，客机只回传到已有授权席位，观战者不能控制。可切换上方设备分页分别设置映射。'
  : '手柄默认使用 XBOX 浏览器标准映射，PS / NS 等其他手柄可逐键手动映射。默认第一个手柄控制 P1、第二个控制 P2；单个手柄默认只控制 P1，同一台手柄只能分给一个座位。可选择另一座位当前使用的手柄来调整分配。')
const resetLabel = computed(() => {
  if (tab.value === 'kb') return localPlayers.value > 1 ? `重置 P${activeSlot.value} 键盘` : '重置键盘'
  if (!activeDevice.value) return '重置手柄'
  return `重置手柄 · ${deviceLabel(activeDevice.value.key)}`
})

const activeConflicts = computed(() => {
  const source = tab.value === 'kb' ? activeKeyboard.value : activeGamepad.value
  const visible = new Set(relevantButtons.value.map((b) => b.key))
  const byValue = new Map()
  for (const btn of visible) {
    const value = source?.[btn]
    if (value == null || value === '') continue
    const key = String(value)
    if (!byValue.has(key)) byValue.set(key, [])
    byValue.get(key).push(btn)
  }
  return [...byValue.values()].filter((buttons) => buttons.length > 1)
})

function hasConflict(btn) {
  return activeConflicts.value.some((buttons) => buttons.includes(btn))
}

function deviceTabLabel(device) {
  const player = props.roomMode ? null : soloAssignments.value.get(device.key)
  return `${deviceLabel(device.key)}${player ? ` · P${player}` : ''}`
}

function seatValue(player) {
  const value = normalizeGamepadSeats(mapping.value.seats)[player]
  return value || GAMEPAD_SEAT_AUTO
}

// 座位指定了一台已拔出的手柄时，选项里不会再有它，用占位文案说明而不是伪造一项。
function seatPlaceholder(player) {
  const value = normalizeGamepadSeats(mapping.value.seats)[player]
  return isDeviceKey(value) ? `${deviceLabel(value)} 未连接` : '请选择'
}

function setSeat(player, value) {
  setGamepadSeat(player, value)
}

function flashNotice(message) {
  gpNotice.value = message
  window.setTimeout(() => { if (gpNotice.value === message) gpNotice.value = '' }, 2600)
}

function resetActive() {
  if (tab.value === 'kb') resetKeyboard(activeSlot.value, props.platform)
  else if (activeDevice.value) resetGamepad(activeDevice.value.key)
}

function startListen(btn) { listening.value = btn; gpListening.value = null }
function startGpListen(btn) {
  listening.value = null
  const device = activeDevice.value
  if (!device) { flashNotice('没有检测到手柄，插上手柄后再按按钮映射。'); return }
  const target = describeConnectedDevices(currentPads()).find((item) => item.key === device.key)
  if (!target) { flashNotice('该手柄当前未连接，插上后再试。'); return }
  // 先记下当前按住的键，避免把“点按钮时正好按着”的键当成新按下。
  clearPressedState()
  restorePressedState(target.pad)
  gpListening.value = btn
}

function currentPads() {
  // Reads the browser's real list; the emulator-facing global reader is hidden
  // so RetroArch cannot pick the same pad up a second time.
  return readPhysicalPads().filter((pad) => pad && pad.connected !== false)
}

let rafId = null
let lastSignature = ''
const seenDeviceKeys = new Set()
const prevPressed = Object.create(null)

function clearPressedState() {
  for (const key of Object.keys(prevPressed)) delete prevPressed[key]
}

function restorePressedState(pad) {
  for (let i = 0; i < pad.buttons.length; i++) {
    prevPressed[`${pad.index}:${i}`] = !!pad.buttons[i].pressed
  }
}

function syncDevices(pads) {
  connectedPads.value = pads
  const devices = describeConnectedDevices(pads)
  // 旧版按玩家槽位存的映射，第一次见到设备时认领给它。
  for (const device of devices) {
    if (seenDeviceKeys.has(device.key)) continue
    seenDeviceKeys.add(device.key)
    bindGamepadDevice(device.key, device.position)
  }
  if (!deviceTabs.value.some((device) => device.key === activeDeviceKey.value)) {
    activeDeviceKey.value = deviceTabs.value[0]?.key || ''
  }
}

function pollGp() {
  const pads = currentPads()
  // Browsers can return new Gamepad objects every frame even when the device
  // list is unchanged. Keep the active device and its native state current.
  connectedPads.value = pads
  const signature = pads.map((pad) => `${pad.index}:${pad.id}`).join('|')
  if (signature !== lastSignature) {
    lastSignature = signature
    syncDevices(pads)
  }
  pollGpListen(pads)
  trackLiveButtons(pads)
  rafId = requestAnimationFrame(pollGp)
}

// 手柄分页的实时反馈：哪个物理键按下，映射到它的那一行就高亮，同时显示按钮序号。
function trackLiveButtons(pads) {
  const target = describeConnectedDevices(pads).find((device) => device.key === activeDevice.value?.key)
  const held = target
    ? Array.from(target.pad.buttons || [])
        .map((button, index) => (button?.pressed ? index : -1))
        .filter((index) => index >= 0)
    : []
  const nextIndexes = held.slice()
  if (nextIndexes.join(',') !== liveIndexes.value.join(',')) liveIndexes.value = nextIndexes

  const mapped = activeGamepad.value || {}
  const rows = new Set(relevantButtons.value.map((row) => row.key))
  const nextButtons = new Set()
  for (const [btn, idx] of Object.entries(mapped)) {
    if (!rows.has(btn)) continue
    if (held.includes(idx)) nextButtons.add(btn)
  }
  if (nextButtons.size !== liveButtons.value.size || [...nextButtons].some((btn) => !liveButtons.value.has(btn))) {
    liveButtons.value = nextButtons
  }
}

function pollGpListen(pads) {
  const btn = gpListening.value
  if (!btn || !activeDevice.value) return
  const target = describeConnectedDevices(pads).find((device) => device.key === activeDevice.value.key)
  if (!target) {
    gpListening.value = null
    flashNotice('该手柄已断开连接。')
    return
  }
  const pad = target.pad
  for (let i = 0; i < pad.buttons.length; i++) {
    const key = `${pad.index}:${i}`
    const pressed = !!pad.buttons[i].pressed
    if (pressed && !prevPressed[key]) {
      setGamepad(btn, i, target.key)
      gpListening.value = null
      prevPressed[key] = pressed
      return
    }
    prevPressed[key] = pressed
  }
}

function onKey(e) {
  if (!listening.value) return
  e.preventDefault()
  const saved = setKeyboard(listening.value, normalizeKeyboardEventKey(e), activeSlot.value, props.platform)
  if (saved !== false) listening.value = null
}

function gamepadLabel(btn) {
  const idx = activeGamepad.value?.[btn]
  if (typeof idx !== 'number') return '—'
  const name = activePadIsStandard.value ? STANDARD_BUTTON_NAMES[idx] : ''
  return name ? `${name}（按钮 ${idx}）` : `按钮 ${idx}`
}

// A pending binding belongs to the visible device/player and input tab only.
// Flush synchronously so the next poll or key event cannot bind the new tab.
watch([tab, activeSlot, () => activeDevice.value?.key, () => activeDevice.value?.pad?.index], () => {
  listening.value = null
  gpListening.value = null
  clearPressedState()
}, { flush: 'sync' })

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  pollGp()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.is-overlay {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(94, 58, 84, 0.30);
  backdrop-filter: blur(6px);
  padding: 20px;
  animation: fadeIn 0.18s var(--clay-ease);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.is-panel {
  width: 420px; max-width: 100%; max-height: 86vh;
  display: flex; flex-direction: column;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  color: var(--text-primary);
  box-shadow: var(--clay-lg);
  overflow: hidden;
  animation: popIn 0.22s var(--clay-ease);
}
@keyframes popIn {
  from { opacity: 0; transform: translateY(10px) scaleX(0.96) scaleY(0.94); }
  to   { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); }
}
.is-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 0;
}
.is-head h2 { margin: 0; font-size: 16px; font-weight: 900; color: var(--text-primary); }
.is-plat { color: var(--text-secondary); font-weight: 900; margin-left: 6px; }
.is-close {
  width: 34px; height: 34px; border-radius: var(--r-pill);
  background: var(--clay-surface-flat); color: var(--text-secondary);
  border: 0; cursor: pointer; font-size: 20px; line-height: 1;
  box-shadow: var(--clay-xs);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.is-close:hover {
  background: var(--clay-primary-grad);
  color: #fff;
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.is-close:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.is-close:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.is-tabs, .is-player-tabs { display: flex; gap: 8px; padding: 10px 18px; border-bottom: 0; }
.is-player-tabs { padding-top: 0; }
.is-tabs button, .is-player-tabs button {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  border: 0;
  border-radius: var(--r-pill);
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.is-tabs button:hover, .is-player-tabs button:hover {
  color: var(--text-primary);
  background: var(--clay-surface-alt);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.is-tabs button:active, .is-player-tabs button:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.is-tabs button:focus-visible, .is-player-tabs button:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.is-tabs .active, .is-player-tabs .active { background: var(--clay-primary-grad); color: #fff; box-shadow: var(--clay-sm); }
.is-gp-controls {
  display: grid;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 0;
}
.is-seat-list { display: grid; gap: 8px; }
.is-select-field {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
}
.is-select-field .is-select {
  --select-width: 100%;
  --select-height: 38px;
  --select-min-height: 38px;
  --select-font-size: 12px;
  --select-color: var(--text-primary);
  --select-focus-color: var(--text-primary);
}
.is-gp-note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}
.is-gp-notice {
  margin: 0;
  color: var(--warn);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.45;
}
.is-warning {
  margin: 10px 0 0;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 0;
  background: color-mix(in srgb, var(--warn) 16%, #fff);
  color: var(--warn);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
  box-shadow: var(--clay-in-sm);
}

.is-grid {
  flex: 1;
  overflow-y: auto;
  padding: 10px 18px;
  display: grid; grid-template-columns: 1fr; gap: 8px;
}
.is-row {
  display: grid; grid-template-columns: 80px 1fr; gap: 12px; align-items: center;
}
.is-label { display: flex; align-items: center; }
.is-btn {
  display: inline-block;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  font-size: 12px; font-weight: 900;
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  box-shadow: var(--clay-xs);
}
.grp-dpad     { background: var(--clay-lilac); color: var(--text-lilac); }
.grp-face     { background: var(--clay-cream); color: var(--text-cream); }
.grp-shoulder { background: var(--clay-mint);  color: var(--text-mint); }
.grp-system   { background: var(--clay-inset-surface); color: var(--text-secondary); }

.is-slot {
  text-align: left;
  padding: 10px 14px;
  background: var(--clay-inset-surface);
  border: 0;
  border-radius: var(--r-md);
  color: var(--text-primary);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.is-slot:hover {
  background: var(--clay-surface-alt);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.is-slot:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.is-slot:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.is-slot.listening {
  background: var(--clay-primary-grad);
  color: #fff;
  box-shadow: var(--clay-sm);
}
.is-slot.conflict {
  background: color-mix(in srgb, var(--warn) 18%, #fff);
  color: var(--warn);
  box-shadow: var(--clay-in-sm);
}
/* 手柄分页的实时反馈：这个物理键正按着，映射到它的那一行亮起来。 */
.is-slot.live {
  background: var(--clay-mint);
  color: var(--ink-green);
  box-shadow: var(--clay-sm);
}

.is-foot {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 14px 20px;
  border-top: 0;
}
.is-reset, .is-done {
  padding: 10px 18px; border-radius: var(--r-pill); font-size: 13px; font-weight: 900;
  font-family: inherit;
  cursor: pointer; border: 0;
  box-shadow: var(--clay-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.is-reset { background: var(--clay-surface-alt); color: var(--text-secondary); }
.is-reset:hover { color: var(--text-primary); transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.is-done  { background: var(--clay-primary-grad); color: #fff; }
.is-done:hover { background: var(--clay-pink-soft); color: #6C2039; transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.is-reset:active, .is-done:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.is-reset:focus-visible, .is-done:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.is-panel.source-mode {
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  color: var(--text-primary);
  box-shadow: var(--clay-lg);
}
.source-mode .is-head {
  border-bottom: 0;
  background: var(--clay-surface-alt);
}
.source-mode .is-head h2 { color: var(--text-primary); font-weight: 900; }
.source-mode .is-plat { color: var(--text-secondary); font-weight: 900; }
.source-mode .is-close {
  border-radius: var(--r-pill);
  border: 0;
  color: var(--text-primary);
  font-weight: 900;
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.source-mode .is-close:hover,
.source-mode .is-close:focus-visible {
  background: var(--clay-primary-grad);
  color: #fff;
  transform: var(--clay-lift);
  box-shadow: var(--clay-sm);
  outline: none;
}
.source-mode .is-tabs,
.source-mode .is-player-tabs,
.source-mode .is-gp-controls,
.source-mode .is-foot { border-color: transparent; }
.source-mode .is-tabs button,
.source-mode .is-player-tabs button {
  border: 0;
  border-radius: var(--r-pill);
  color: var(--text-secondary);
  font-weight: 900;
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.source-mode .is-tabs button:hover,
.source-mode .is-player-tabs button:hover,
.source-mode .is-tabs button:focus-visible,
.source-mode .is-player-tabs button:focus-visible {
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
  outline: none;
}
.source-mode .is-tabs .active,
.source-mode .is-player-tabs .active { background: var(--clay-primary-grad); border-color: transparent; color: #fff; }
.source-mode .is-tabs .active:hover,
.source-mode .is-player-tabs .active:hover,
.source-mode .is-tabs .active:focus-visible,
.source-mode .is-player-tabs .active:focus-visible { background: var(--clay-primary-grad); color: #fff; }
.source-mode .is-select-field { color: var(--text-primary); font-weight: 900; }
.source-mode .is-gp-note { color: var(--text-secondary); font-weight: 700; }
.source-mode .is-gp-notice { color: var(--warn); font-weight: 900; }
.source-mode .is-warning {
  border: 0;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--warn) 18%, #fff);
  color: var(--warn);
  font-weight: 900;
}
.source-mode .is-btn {
  border-radius: var(--r-pill);
  border: 0;
  color: var(--text-secondary);
  font-weight: 900;
  box-shadow: var(--clay-xs);
}
.source-mode .is-slot {
  border: 0;
  border-radius: var(--r-md);
  background: var(--clay-inset-surface);
  color: var(--text-primary);
  font-weight: 900;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), border-color var(--t-fast) var(--clay-ease);
}
.source-mode .is-slot:hover,
.source-mode .is-slot:focus-visible {
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-sm);
  outline: none;
}
.source-mode .is-slot.listening { background: var(--clay-primary-grad); border-color: transparent; color: #fff; }
.source-mode .is-slot.listening:hover,
.source-mode .is-slot.listening:focus-visible { background: var(--clay-primary-grad); color: #fff; }
.source-mode .is-slot.conflict { background: color-mix(in srgb, var(--warn) 18%, #fff); color: var(--warn); }
.source-mode .is-reset,
.source-mode .is-done {
  border-radius: var(--r-pill);
  border: 0;
  font-weight: 900;
  box-shadow: var(--clay-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.source-mode .is-reset { background: var(--clay-surface-alt); color: var(--text-secondary); }
.source-mode .is-reset:hover,
.source-mode .is-reset:focus-visible {
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-sm);
  outline: none;
}
.source-mode .is-done { background: var(--clay-primary-grad); color: #fff; }
.source-mode .is-done:hover,
.source-mode .is-done:focus-visible {
  background: var(--clay-primary-grad);
  color: #fff;
  transform: var(--clay-lift);
  box-shadow: var(--clay-sm);
  outline: none;
}
</style>
