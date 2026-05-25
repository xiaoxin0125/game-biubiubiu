<template>
  <Teleport to="body">
  <div class="is-overlay" @click.self="$emit('close')">
    <div class="is-panel">
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
              <option v-for="profile in GAMEPAD_PROFILE_DEFS" :key="profile.key" :value="profile.key">
                {{ profile.label }}
              </option>
            </select>
          </label>
          <p class="is-gp-note">
            当前配置只绑定手柄{{ activeSlot }}；第 3 个及以后手柄不会参与控制。
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
          重置{{ tab === 'kb' ? `P${activeSlot} 键盘` : `手柄${activeSlot} ${activeGamepadProfileLabel}` }}
        </button>
        <button class="is-done" @click="$emit('close')">完成</button>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useInputMapping, BUTTON_DEFS, effectiveKeyboardForPlayer, gamepadMappingFor, GAMEPAD_PROFILE_DEFS, normalizeGamepadProfile } from '../composables/useInputMapping.js'
import { getPlatform } from '../constants/platforms.js'

const props = defineProps({
  platform: { type: String, default: null },
  localPlayers: { type: Number, default: 1 },
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
const activeSlotCount = computed(() => tab.value === 'gp' ? 2 : localPlayers.value)
const activeSlot = computed(() => Math.max(1, Math.min(activeSlotCount.value, Number(playerTab.value) || 1)))
const activeKeyboard = computed(() => effectiveKeyboardForPlayer(mapping.value, activeSlot.value, props.platform))
const activeGamepadProfile = computed({
  get: () => normalizeGamepadProfile(mapping.value.gamepadProfiles?.[activeSlot.value]),
  set: (profile) => setGamepadProfile(activeSlot.value, profile),
})
const activeGamepadProfileLabel = computed(() => GAMEPAD_PROFILE_DEFS.find((profile) => profile.key === activeGamepadProfile.value)?.label || '通用手柄')
const activeGamepad = computed(() => gamepadMappingFor(mapping.value, activeSlot.value, activeGamepadProfile.value))

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
  let k = e.key
  if (k === ' ') k = 'space'
  else if (k === 'ArrowUp') k = 'up'
  else if (k === 'ArrowDown') k = 'down'
  else if (k === 'ArrowLeft') k = 'left'
  else if (k === 'ArrowRight') k = 'right'
  else if (k === 'Enter') k = e.code === 'NumpadEnter' ? 'kp_enter' : 'enter'
  else if (k === 'Shift') k = e.location === 2 ? 'rshift' : 'shift'
  else if (/^[0-9]$/.test(k)) k = k
  else if (k === ';') k = 'semicolon'
  else if (k === '-') k = 'minus'
  else if (k === '=') k = 'equals'
  else if (k === '/') k = 'slash'
  else if (k === '*') k = 'multiply'
  else if (k === '+') k = 'add'
  else if (k === '.') k = 'period'
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) k = k.toLowerCase()
  else if (k.length === 1) k = k.toLowerCase()
  else k = k.toLowerCase()
  const saved = setKeyboard(listening.value, k, activeSlot.value, props.platform)
  if (saved !== false) listening.value = null
}

let rafId = null
const prevPressed = Object.create(null)
function pollGp() {
  if (gpListening.value) {
    const pads = (navigator.getGamepads?.() || []).filter(Boolean)
    const padSlot = Math.max(1, Math.min(2, Number(activeSlot.value) || 1))
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
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
  color: #fff;
  outline: none;
}
.is-select-field option { color: #111; }
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
.is-done:hover { background: rgba(10,132,255,0.45); }
</style>
