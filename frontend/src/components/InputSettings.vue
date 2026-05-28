<template>
  <Teleport to="body">
  <div class="is-overlay" @click.self="$emit('close')">
    <div class="is-panel" :class="{ 'room-mode': props.roomMode }">
      <header class="is-head">
        <h2>按键设置<span v-if="platformName" class="is-plat">· {{ platformName }}</span></h2>
        <button class="is-close" @click="$emit('close')" aria-label="关闭">×</button>
      </header>

      <div class="is-tabs">
        <button :class="{ active: tab === 'kb' }" @click="tab = 'kb'">键盘</button>
        <button :class="{ active: tab === 'gp' }" @click="tab = 'gp'">手柄</button>
      </div>

      <div v-if="activeSlotCount > 1" class="is-player-tabs">
        <button
          v-for="slot in activeSlotCount"
          :key="slot"
          :class="{ active: activeSlot === slot }"
          @click="playerTab = slot"
        >{{ tab === 'gp' ? `手柄${slot}` : `P${slot}` }}</button>
      </div>

      <template v-if="tab === 'gp'">
        <div class="is-gp-controls">
          <label class="is-select-field">
            <span>手柄类型</span>
            <select v-model="activeGamepadProfile">
              <option v-for="profile in visibleGamepadProfiles" :key="profile.key" :value="profile.key">
                {{ profile.label }}
              </option>
            </select>
          </label>
          <p class="is-gp-note">
            {{ gamepadBindingNote }}
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
              :class="{ listening: gpListening === b.key, conflict: hasConflict(b.key) }"
              @click="startGpListen(b.key)"
            >
              {{ gpListening === b.key ? '按一个键…' : gamepadLabel(b.key) }}
            </button>
          </template>
        </div>
      </section>

      <footer class="is-foot">
        <button class="is-reset" @click="tab === 'kb' ? resetKeyboard(activeSlot, props.platform) : resetGamepad(activeSlot, activeGamepadProfile)">
          重置{{ resetLabel }}
        </button>
        <button class="is-done" @click="$emit('close')">完成</button>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useInputMapping, BUTTON_DEFS, effectiveLocalKeyboardForPlayer, gamepadMappingFor, GAMEPAD_PROFILE_DEFS, normalizeGamepadProfile, normalizeKeyboardEventKey } from '../composables/useInputMapping.js'
import { getPlatform } from '../constants/platforms.js'

const props = defineProps({
  platform: { type: String, default: null },
  localPlayers: { type: Number, default: 1 },
  gamepadPlayers: { type: Number, default: 2 },
  gamepadProfileKeys: { type: Array, default: () => [] },
  gamepadBindingNote: { type: String, default: '' },
  roomMode: { type: Boolean, default: false },
})
defineEmits(['close'])

const { mapping, setKeyboard, setGamepad, setGamepadProfile, resetKeyboard, resetGamepad } = useInputMapping()
const tab = ref('kb')
const playerTab = ref(1)
const listening = ref(null)     // keyboard mode: button being re-bound
const gpListening = ref(null)   // gamepad mode: button being re-bound

const relevantButtons = computed(() => {
  if (!props.platform) return BUTTON_DEFS
  const p = getPlatform(props.platform)
  const allowed = new Set(p?.buttons || BUTTON_DEFS.map((b) => b.key))
  const labels = p?.buttonLabels || {}
  const rows = BUTTON_DEFS
    .filter((b) => allowed.has(b.key))
    .map((b) => ({ ...b, label: labels[b.key] || b.label }))

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
const gamepadPlayers = computed(() => Math.max(1, Math.min(2, Number(props.gamepadPlayers) || 2)))
const activeSlotCount = computed(() => tab.value === 'gp' ? gamepadPlayers.value : localPlayers.value)
const activeSlot = computed(() => Math.max(1, Math.min(activeSlotCount.value, Number(playerTab.value) || 1)))
const visibleGamepadProfiles = computed(() => {
  const requested = Array.isArray(props.gamepadProfileKeys) ? props.gamepadProfileKeys : []
  if (!requested.length) return GAMEPAD_PROFILE_DEFS
  const byKey = new Map(GAMEPAD_PROFILE_DEFS.map((profile) => [profile.key, profile]))
  const profiles = requested
    .map((key) => byKey.get(String(key).toLowerCase()))
    .filter(Boolean)
  return profiles.length ? profiles : GAMEPAD_PROFILE_DEFS
})
const activeKeyboard = computed(() => effectiveLocalKeyboardForPlayer(mapping.value, activeSlot.value, props.platform))
const activeGamepadProfile = computed({
  get: () => {
    const storedProfile = normalizeGamepadProfile(mapping.value.gamepadProfiles?.[activeSlot.value])
    return visibleGamepadProfiles.value.some((profile) => profile.key === storedProfile)
      ? storedProfile
      : visibleGamepadProfiles.value[0]?.key || storedProfile
  },
  set: (profile) => setGamepadProfile(activeSlot.value, profile),
})
const activeGamepadProfileLabel = computed(() => visibleGamepadProfiles.value.find((profile) => profile.key === activeGamepadProfile.value)?.label || '通用手柄')
const activeGamepad = computed(() => gamepadMappingFor(mapping.value, activeSlot.value, activeGamepadProfile.value))
const gamepadBindingNote = computed(() => {
  if (props.gamepadBindingNote) return props.gamepadBindingNote
  return props.roomMode
    ? '当前配置只用于本机唯一手柄；其他手柄不会参与房间控制。'
    : `当前配置只绑定手柄${activeSlot.value}；第 3 个及以后手柄不会参与控制。`
})
const resetLabel = computed(() => {
  if (tab.value === 'kb') return activeSlotCount.value > 1 ? `P${activeSlot.value} 键盘` : '键盘'
  return props.roomMode ? `手柄 · ${activeGamepadProfileLabel.value}` : `手柄${activeSlot.value} ${activeGamepadProfileLabel.value}`
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

function startListen(btn) { listening.value = btn; gpListening.value = null }
function startGpListen(btn) { gpListening.value = btn; listening.value = null }

function onKey(e) {
  if (!listening.value) return
  e.preventDefault()
  const saved = setKeyboard(listening.value, normalizeKeyboardEventKey(e), activeSlot.value, props.platform)
  if (saved !== false) listening.value = null
}

let rafId = null
const prevPressed = Object.create(null)
function pollGp() {
  if (gpListening.value) {
    const pads = (navigator.getGamepads?.() || []).filter(Boolean)
    const padSlot = Math.max(1, Math.min(gamepadPlayers.value, Number(activeSlot.value) || 1))
    const pad = pads[padSlot - 1]
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) {
        const key = `${pad.index}:${i}`
        const p = pad.buttons[i].pressed
        if (p && !prevPressed[key]) {
          setGamepad(gpListening.value, i, activeSlot.value, activeGamepadProfile.value)
          gpListening.value = null
          prevPressed[key] = p
          break
        }
        prevPressed[key] = p
      }
    }
  }
  rafId = requestAnimationFrame(pollGp)
}
function gamepadLabel(btn) {
  const idx = activeGamepad.value[btn]
  return typeof idx === 'number' ? `按钮 ${idx}` : '—'
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  rafId = requestAnimationFrame(pollGp)
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
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  padding: 20px;
}
.is-panel {
  width: 420px; max-width: 100%; max-height: 86vh;
  display: flex; flex-direction: column;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  color: #fff;
  overflow: hidden;
}
.is-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.is-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
.is-plat { color: rgba(255,255,255,0.5); font-weight: 400; margin-left: 6px; }
.is-close {
  width: 30px; height: 30px; border-radius: 50%;
  background: transparent; color: rgba(255,255,255,0.6);
  border: 0; cursor: pointer; font-size: 20px; line-height: 1;
}
.is-close:hover { background: rgba(255,255,255,0.08); color: #fff; }

.is-tabs, .is-player-tabs { display: flex; gap: 4px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.is-player-tabs { padding-top: 0; }
.is-tabs button, .is-player-tabs button {
  flex: 1;
  padding: 8px 12px;
  background: transparent;
  color: rgba(255,255,255,0.6);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}
.is-tabs .active, .is-player-tabs .active { background: rgba(10,132,255,0.22); border-color: rgba(10,132,255,0.5); color: #fff; }
.is-gp-controls {
  display: grid;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.is-select-field {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 10px;
  color: rgba(255,255,255,0.62);
  font-size: 12px;
}
.is-select-field select {
  width: 100%;
  --select-height: 36px;
  --select-min-height: 36px;
  --select-font-size: 12px;
}
.is-gp-note {
  margin: 0;
  color: rgba(255,255,255,0.45);
  font-size: 11px;
  line-height: 1.45;
}
.is-warning {
  margin: 10px 18px 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 204, 0, 0.32);
  background: rgba(255, 204, 0, 0.12);
  color: #ffd966;
  font-size: 12px;
  line-height: 1.45;
}

.is-grid {
  flex: 1;
  overflow-y: auto;
  padding: 10px 18px;
  display: grid; grid-template-columns: 1fr; gap: 6px;
}
.is-row {
  display: grid; grid-template-columns: 80px 1fr; gap: 12px; align-items: center;
}
.is-label { display: flex; align-items: center; }
.is-btn {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,0.08);
  color: #fff;
}
.grp-dpad     { background: rgba(99, 102, 241, 0.25); }
.grp-face     { background: rgba(255, 149, 0, 0.25); }
.grp-shoulder { background: rgba(52, 199, 89, 0.25); }
.grp-system   { background: rgba(255, 255, 255, 0.14); }

.is-slot {
  text-align: left;
  padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  color: #fff;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  cursor: pointer;
}
.is-slot:hover { background: rgba(255,255,255,0.08); }
.is-slot.listening {
  background: rgba(10,132,255,0.22);
  border-color: rgba(10,132,255,0.5);
  color: #7ac7ff;
}
.is-slot.conflict {
  border-color: rgba(255, 204, 0, 0.55);
  background: rgba(255, 204, 0, 0.12);
  color: #ffd966;
}

.is-foot {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.is-reset, .is-done {
  padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: 0;
}
.is-reset { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }
.is-reset:hover { background: rgba(255,255,255,0.14); }
.is-done  { background: rgba(10,132,255,0.3); color: #fff; }
.is-panel.room-mode {
  background: rgba(255, 251, 245, 0.96);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  color: #111;
  box-shadow: 6px 6px 0 var(--border-color, #111);
}
.room-mode .is-head {
  border-bottom: 2px solid var(--border-color, #111);
  background: rgba(255, 255, 255, 0.5);
}
.room-mode .is-head h2 { color: #111; font-weight: 900; }
.room-mode .is-plat { color: var(--text-secondary); font-weight: 900; }
.room-mode .is-close {
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  color: #111;
  font-weight: 900;
  transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}
.room-mode .is-close:hover,
.room-mode .is-close:focus-visible {
  background: #111;
  color: #fff;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
  outline: none;
}
.room-mode .is-tabs,
.room-mode .is-player-tabs,
.room-mode .is-gp-controls,
.room-mode .is-foot { border-color: var(--border-color, #111); }
.room-mode .is-tabs button,
.room-mode .is-player-tabs button {
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  color: #111;
  font-weight: 900;
  background: rgba(255, 255, 255, 0.62);
  transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}
.room-mode .is-tabs button:hover,
.room-mode .is-player-tabs button:hover,
.room-mode .is-tabs button:focus-visible,
.room-mode .is-player-tabs button:focus-visible {
  background: #fff;
  color: #111;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
  outline: none;
}
.room-mode .is-tabs .active,
.room-mode .is-player-tabs .active { background: #111; border-color: #111; color: #fff; }
.room-mode .is-tabs .active:hover,
.room-mode .is-player-tabs .active:hover,
.room-mode .is-tabs .active:focus-visible,
.room-mode .is-player-tabs .active:focus-visible { background: #111; color: #fff; }
.room-mode .is-select-field { color: #111; font-weight: 900; }
.room-mode .is-gp-note { color: var(--text-secondary); font-weight: 700; }
.room-mode .is-warning {
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: color-mix(in srgb, var(--warn) 18%, #fff);
  color: #9A3412;
  font-weight: 900;
}
.room-mode .is-btn {
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  color: #111;
  font-weight: 900;
}
.room-mode .is-slot {
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  color: #111;
  font-weight: 900;
  transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}
.room-mode .is-slot:hover,
.room-mode .is-slot:focus-visible {
  background: #fff;
  color: #111;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
  outline: none;
}
.room-mode .is-slot.listening { background: #111; border-color: #111; color: #fff; }
.room-mode .is-slot.listening:hover,
.room-mode .is-slot.listening:focus-visible { background: #111; color: #fff; }
.room-mode .is-slot.conflict { background: color-mix(in srgb, var(--warn) 18%, #fff); color: #9A3412; }
.room-mode .is-reset,
.room-mode .is-done {
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  font-weight: 900;
  transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}
.room-mode .is-reset { background: rgba(255, 255, 255, 0.62); color: #111; }
.room-mode .is-reset:hover,
.room-mode .is-reset:focus-visible {
  background: #fff;
  color: #111;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
  outline: none;
}
.room-mode .is-done { background: #111; color: #fff; }
.room-mode .is-done:hover,
.room-mode .is-done:focus-visible {
  background: #111;
  color: #fff;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
  outline: none;
}
</style>
