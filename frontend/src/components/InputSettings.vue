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
          <div class="is-select-field">
            <span>手柄类型</span>
            <ClaySelect
              v-model="activeGamepadProfile"
              class="is-select"
              aria-label="手柄类型"
              :options="gamepadProfileOptions"
            />
          </div>
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useInputMapping, BUTTON_DEFS, effectiveLocalKeyboardForPlayer, gamepadMappingFor, GAMEPAD_PROFILE_DEFS, normalizeGamepadProfile, normalizeKeyboardEventKey } from '../composables/useInputMapping.js'
import { pcButtonsForPlatform, turboButtonsForPlatform, getPlatform } from '../constants/platforms.js'
import ClaySelect from './ClaySelect.vue'

const props = defineProps({
  platform: { type: String, default: null },
  localPlayers: { type: Number, default: 1 },
  gamepadPlayers: { type: Number, default: 2 },
  gamepadProfileKeys: { type: Array, default: () => [] },
  gamepadBindingNote: { type: String, default: '' },
  roomMode: { type: Boolean, default: false },
  sourceStyle: { type: Boolean, default: false },
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

watch([activeSlot, activeGamepadProfile], ([, profile]) => {
  const storedProfile = normalizeGamepadProfile(mapping.value.gamepadProfiles?.[activeSlot.value])
  if (profile && profile !== storedProfile) setGamepadProfile(activeSlot.value, profile)
}, { immediate: true })
const activeGamepadProfileLabel = computed(() => visibleGamepadProfiles.value.find((profile) => profile.key === activeGamepadProfile.value)?.label || '通用手柄')
const gamepadProfileOptions = computed(() => visibleGamepadProfiles.value
  .map((profile) => ({ value: profile.key, label: profile.label })))
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
  padding: 9px 12px;
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  border: 0;
  border-radius: var(--r-pill);
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
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
