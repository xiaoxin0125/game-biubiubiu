<template>
  <div class="player-page" @contextmenu.prevent>
    <GameOverlay
      :title="displayName"
      :platform="overlayPlatformInfo"
      :core-name="overlayCoreName"
      :can-save="canSaveState"
      :show-keys="!isTouchLayout"
      @back="goBack"
      @fullscreen="onFullscreen"
      @keys="openInputSettings"
      @save-state="onSaveState"
      @load-state="onLoadState"
    >
      <template #extras>
        <div v-if="siblings.length > 1" class="ver-switch" @click.stop>
          <button class="ver-btn" @click="versionMenuOpen = !versionMenuOpen">
            <span class="ver-cur">{{ currentVersionLabel }}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div v-if="versionMenuOpen" class="ver-menu">
            <button
              v-for="v in siblings"
              :key="v.id"
              class="ver-item"
              :class="{ active: v.id === romMeta?.id }"
              @click="switchVersion(v)"
            >{{ v.id === (romMeta?.parentRomId ?? romMeta?.id) ? '原版' : (v.versionLabel || '变体') }}</button>
          </div>
        </div>
      </template>
    </GameOverlay>

    <div class="emu-area">
      <div class="emu-frame">
        <EmulatorPortal
          v-if="rom && biosReady"
          ref="portalRef"
          :core="activeCore"
          :rom="rom"
          :bios="bios"
          :retroarch-config="retroarchConfig"
          :retroarch-core-config="retroarchCoreConfig"
          @booted="onBooted"
          @config-reloaded="onInputConfigReloaded"
          @error="(err) => setFatalError(err?.message || '模拟器启动失败')"
        />

        <div v-else-if="fatalError" class="emu-error">
          <div class="error-card">
            <p>{{ fatalError }}</p>
            <button class="btn btn-primary" @click="goBack">返回列表</button>
          </div>
        </div>

        <div v-else class="emu-loading">
          <div class="loading-stack">
            <div class="loading-glow"></div>
            <div class="spinner"></div>
          </div>
          <p class="emu-loading-title">
            <span class="dot" style="--i:0"></span><span class="dot" style="--i:1"></span><span class="dot" style="--i:2"></span>
            INSERT COIN
          </p>
          <p class="emu-loading-game">{{ displayName }}</p>
          <p class="emu-loading-sub">{{ loadingSub }}</p>
          <button v-if="loadingSlow" class="btn btn-sm emu-loading-retry" @click="reloadPage">长时间未加载，点此刷新</button>
        </div>
      </div>
    </div>

    <Transition name="hint">
      <div v-if="showRotateHint" class="rotate-hint" @click="hideRotateHint">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/></svg>
        横屏体验更佳
      </div>
    </Transition>

    <Transition name="hint">
      <div v-if="toastText" class="toast">{{ toastText }}</div>
    </Transition>

    <VirtualGamepad
      v-if="shouldShowVirtualGamepad"
      :platform="romMeta?.platform"
      :press-button="pressSoloGamepadButton"
      :release-button="releaseSoloGamepadButton"
    />

    <InputSettings
      v-if="showInput && !isTouchLayout"
      :platform="romMeta?.platform"
      :local-players="Math.min(2, activeMaxPlayers)"
      :gamepad-players="1"
      gamepad-binding-note="当前只使用本机唯一手柄，默认控制 P2；其他手柄不会参与控制。"
      room-mode
      @close="closeInputSettings"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useInputMapping, BUTTON_DEFS, RETROPAD_BUTTON_DEFS, buildLocalPlayerKeyboardMap, effectiveKeyboardForPlayer, effectiveLocalKeyboardForPlayer, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS, normalizeRetroarchKey } from '../composables/useInputMapping.js'
import { dispatchKeyboardEvent } from '../composables/dispatchKeyboardEvent.js'
import { useAuth } from '../composables/useAuth.js'
import { useGamepads } from '../composables/useGamepads.js'
import { usePlayerRom } from '../composables/player/usePlayerRom.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import EmulatorPortal from '../components/emulator-portal/EmulatorPortal.vue'
import GameOverlay from '../components/emulator-portal/GameOverlay.vue'
import VirtualGamepad from '../components/emulator-portal/VirtualGamepad.vue'
import InputSettings from '../components/InputSettings.vue'

const props = defineProps({
  id: String,
})
const router = useRouter()
const { mapping } = useInputMapping()
const { isAuthed } = useAuth()

const isRoomMode = false
const soloPeer = ref({ isHost: true })
const roomHostInputConfigSnapshot = ref(null)
const portalRef = ref(null)
const booted = ref(false)
const keyboardTurboLoops = new Map()

const {
  showRotateHint,
  showInput,
  toastText,
  fatalError,
  loadingSlow,
  openInputSettings: openInputSettingsPanel,
  closeInputSettings,
  showToast,
  setFatalError,
  showRotateHintFor,
  hideRotateHint,
  startSlowLoadingTimer,
  markBooted,
} = usePlayerUi()

const {
  isTouchLayout,
  shouldSuggestRotate,
  start: startViewport,
  stop: stopViewport,
} = usePlayerViewport()

const {
  romMeta,
  roomInfo,
  siblings,
  versionMenuOpen,
  rom,
  bios,
  biosReady,
  platformInfo,
  currentVersionLabel,
  loadingSub,
  loadMeta,
  resetForRouteChange,
} = usePlayerRom({
  routeRomId: () => props.id,
  isRoomMode,
  roomCode: null,
  localPeer: soloPeer,
  reportError: setFatalError,
})

const {
  activeCore,
  activeMaxPlayers,
  retroarchCoreConfig,
  overlayPlatformInfo,
  overlayCoreName,
  currentPlatformButtons,
  player1RuntimeKeyboard,
  retroarchConfig,
} = usePlayerEmulatorConfig({
  mapping,
  romMeta,
  roomInfo,
  platformInfo,
  roomSession: {},
  signalMe: soloPeer,
  isRoomMode,
  isTouchLayout,
  roomHostInputConfigSnapshot,
})

const canSaveState = computed(() => isAuthed.value)
const shouldShowVirtualGamepad = computed(() => !!rom.value)
const displayName = computed(() => romMeta.value?.title || '加载中…')
const isGuestMode = computed(() => false)

const { onSaveState, onLoadState } = useSaveState({
  romMeta,
  platformInfo,
  portalRef,
  isAuthed,
  isGuestMode,
  showToast,
})

function openInputSettings() {
  openInputSettingsPanel({ blocked: isTouchLayout.value })
}

const gamepadButtonInterceptor = () => false
const soloGamepadPlayer = computed(() => activeMaxPlayers.value >= 2 ? 2 : 1)
const resolveGamepadPlayer = (slot) => slot === 1 ? soloGamepadPlayer.value : null
const pressLocalButton = (button, player = 1) => portalRef.value?.pressButton?.(button, player)
const releaseLocalButton = (button, player = 1) => portalRef.value?.releaseButton?.(button, player)
const pressSoloGamepadButton = (button) => pressLocalButton(button, 1)
const releaseSoloGamepadButton = (button) => releaseLocalButton(button, 1)
useGamepads({
  mapping,
  onButton: gamepadButtonInterceptor,
  pressButton: (button, player = 1) => pressLocalButton(button, player),
  releaseButton: (button, player = 1) => releaseLocalButton(button, player),
  maxLocalPlayers: computed(() => 1),
  playerResolver: resolveGamepadPlayer,
  platformButtons: currentPlatformButtons,
})

function onBooted() {
  booted.value = true
  markBooted()
}
function onInputConfigReloaded() {
  booted.value = true
  markBooted()
  showToast('按键设置已保存，输入配置已重新载入')
}
function reloadPage() { window.location.reload() }
function onFullscreen() { portalRef.value?.toggleFullscreen() }
function onKeyDown(e) {
  if (e.key === 'Escape' && !document.fullscreenElement) goBack()
  if (handleLocalPlayer2Keyboard(e)) return
  if (handleLocalKeyboardButton(e)) return
  handleTurboKeyboard(e)
}
function onKeyUp(e) {
  if (handleLocalPlayer2Keyboard(e)) return
  if (handleLocalKeyboardButton(e)) return
  handleTurboKeyboard(e)
}
function inputButtonFromConfigKey(config, key, allowed = null, { includeTurbo = false } = {}) {
  const defs = includeTurbo ? BUTTON_DEFS : RETROPAD_BUTTON_DEFS
  for (const { key: button } of defs) {
    if (allowed && !allowed.has(button)) continue
    if (config?.[button] === key) return button
  }
  return null
}

function handleLocalPlayer2Keyboard(e) {
  if (e.__internalInputDispatch || showInput.value || isTouchLayout.value) return false
  if (activeMaxPlayers.value < 2) return false

  const key = normalizeDomKey(e)
  const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
  const p2UserKeyboard = effectiveLocalKeyboardForPlayer(mapping.value, 2, romMeta.value?.platform || null)
  const button = inputButtonFromConfigKey(p2UserKeyboard, key, allowed, { includeTurbo: true })
  if (!button) return false

  const p2RuntimeKeyboard = buildLocalPlayerKeyboardMap(2, currentPlatformButtons.value)
  const action = e.type === 'keydown' ? 'down' : 'up'
  const turboTarget = TURBO_BUTTON_TARGETS[button]
  const targetButton = turboTarget || button
  const runtimeKey = p2RuntimeKeyboard[targetButton]
  if (!runtimeKey || runtimeKey === 'nul') return false

  e.preventDefault()
  e.stopImmediatePropagation()
  if (turboTarget) dispatchKeyboardTurbo(`p2:${button}`, targetButton, action, {
    ...p2RuntimeKeyboard,
    [button]: p2UserKeyboard[button],
  })
  else dispatchKeyboardEvent(e.type, runtimeKey, { internal: true })
  return true
}

function handleLocalKeyboardButton(e) {
  if (e.__internalInputDispatch || showInput.value) return false

  const key = normalizeDomKey(e)
  const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
  const currentKeyboard = effectiveKeyboardForPlayer(mapping.value, 1, romMeta.value?.platform || null)
  const button = inputButtonFromConfigKey(currentKeyboard, key, allowed, { includeTurbo: true })
  if (!button) return false

  const action = e.type === 'keydown' ? 'down' : 'up'
  const turboTarget = TURBO_BUTTON_TARGETS[button]
  const targetButton = turboTarget || button
  const runtimeKeyboard = player1RuntimeKeyboard.value

  e.preventDefault()
  e.stopImmediatePropagation()
  if (turboTarget) dispatchKeyboardTurbo(button, targetButton, action, runtimeKeyboard)
  else {
    const runtimeKey = runtimeKeyboard?.[targetButton]
    if (!runtimeKey || runtimeKey === 'nul') return true
    dispatchKeyboardEvent(e.type, runtimeKey, { internal: true })
  }
  return true
}

function handleTurboKeyboard(e) {
  if (showInput.value) return
  const source = mapping.value.keyboard || {}
  const key = normalizeDomKey(e)
  const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
  for (const [turboButton, targetButton] of Object.entries(TURBO_BUTTON_TARGETS)) {
    if (allowed && !allowed.has(turboButton)) continue
    if (source[turboButton] !== key) continue
    e.preventDefault()
    e.stopImmediatePropagation()
    dispatchKeyboardTurbo(turboButton, targetButton, e.type === 'keydown' ? 'down' : 'up', source)
    return
  }
}
function dispatchKeyboardTurbo(turboButton, targetButton, action, source) {
  const targetKey = source?.[targetButton]
  const sourceKey = source?.[turboButton]
  if (!targetKey || targetKey === 'nul' || targetKey === sourceKey) return

  if (action === 'down') {
    if (keyboardTurboLoops.has(turboButton)) return
    let down = true
    dispatchKeyboardEvent('keydown', targetKey, { internal: true })
    const loop = setInterval(() => {
      down = !down
      dispatchKeyboardEvent(down ? 'keydown' : 'keyup', targetKey, { internal: true })
    }, TURBO_FIRE_MS)
    keyboardTurboLoops.set(turboButton, { loop, targetKey })
    return
  }

  const active = keyboardTurboLoops.get(turboButton)
  if (active) {
    clearInterval(active.loop)
    keyboardTurboLoops.delete(turboButton)
  }
  dispatchKeyboardEvent('keyup', targetKey, { internal: true })
}
function stopKeyboardTurboLoops() {
  for (const [button, active] of keyboardTurboLoops.entries()) {
    clearInterval(active.loop)
    keyboardTurboLoops.delete(button)
    dispatchKeyboardEvent('keyup', active.targetKey, { internal: true })
  }
}
function normalizeDomKey(e) {
  const raw = e.key
  if (raw === 'ArrowUp') return 'up'
  if (raw === 'ArrowDown') return 'down'
  if (raw === 'ArrowLeft') return 'left'
  if (raw === 'ArrowRight') return 'right'
  if (raw === 'Enter') return e.code === 'NumpadEnter' ? 'kp_enter' : 'enter'
  if (raw === 'Shift') return e.location === 2 ? 'rshift' : 'shift'
  if (raw === ' ') return 'space'
  if (/^Numpad[0-9]$/.test(e.code)) return `numpad${e.code.slice(6)}`
  if (/^[0-9]$/.test(raw)) return raw
  if (raw === ';') return 'semicolon'
  if (raw === '-' && e.code === 'NumpadSubtract') return 'subtract'
  if (raw === '-') return 'minus'
  if (raw === '=') return 'equals'
  if (raw === '/') return e.code === 'NumpadDivide' ? 'numdivide' : 'slash'
  if (raw === '*') return e.code === 'NumpadMultiply' ? 'nummultiply' : 'multiply'
  if (raw === '+') return 'add'
  if (raw === '.' && e.code === 'NumpadDecimal') return 'numpaddecimal'
  if (raw === '.') return 'period'
  return normalizeRetroarchKey(raw.length === 1 ? raw.toLowerCase() : raw.toLowerCase())
}
function goBack() { router.push('/') }
async function switchVersion(v) {
  versionMenuOpen.value = false
  if (!v || v.id === romMeta.value?.id) return
  await portalRef.value?.destroy?.()
  router.push(`/play/${v.id}`)
}

watch(() => props.id, (now, prev) => {
  if (!prev || now === prev) return
  resetForRouteChange()
  booted.value = false
  loadMeta()
})

onMounted(() => {
  if (shouldSuggestRotate.value) showRotateHintFor()
  startViewport({ onTouchLayout: closeInputSettings })
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('keyup', onKeyUp, true)
  loadMeta()
  startSlowLoadingTimer({ isBooted: () => booted.value })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('keyup', onKeyUp, true)
  stopKeyboardTurboLoops()
  stopViewport()
})
</script>

<style scoped>
.player-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.18), transparent 32vw),
    linear-gradient(180deg, #FFF7ED 0%, #FFFBF5 46%, #FFF7ED 100%);
  position: relative;
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.player-page :deep(.portal-canvas) {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}
.emu-area {
  flex: 1 1 auto;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  position: relative;
  z-index: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.emu-frame { width: 100%; height: 100%; min-width: 0; min-height: 0; position: relative; overflow: hidden; }

.emu-error, .emu-loading {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px;
  background:
    radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, rgba(0,0,0,0) 60%),
    #000;
  z-index: 10;
  padding: 24px;
  text-align: center;
}
.emu-loading::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0px,
    rgba(255, 255, 255, 0) 2px,
    rgba(255, 255, 255, 0.035) 2px,
    rgba(255, 255, 255, 0.035) 3px
  );
  pointer-events: none;
}

.loading-stack { position: relative; width: 40px; height: 40px; margin-bottom: 4px; }
.loading-glow {
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 55%, transparent) 0%, transparent 65%);
  filter: blur(6px);
  animation: glow-pulse 1.8s ease-in-out infinite;
}
@keyframes glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.92); }
  50%      { opacity: 1;   transform: scale(1.1);  }
}

.emu-loading-title {
  margin: 0;
  color: #F5F5F7;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.22em;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  animation: coin-blink 1.6s ease-in-out infinite;
}
@keyframes coin-blink {
  0%, 50%, 100% { opacity: 1; }
  60%, 90%      { opacity: 0.45; }
}
.emu-loading-title .dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #818CF8;
  box-shadow: 0 0 6px var(--accent);
  animation: dot-bounce 1.2s ease-in-out infinite;
  animation-delay: calc(var(--i) * 140ms);
}
@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
  40%           { transform: scale(1);   opacity: 1;   }
}

.emu-loading-game {
  margin: 0;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.emu-loading-sub {
  margin: 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  max-width: 300px;
  line-height: 1.55;
  letter-spacing: 0.01em;
}
.emu-loading-retry {
  margin-top: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #F5F5F7;
  border-color: rgba(255, 255, 255, 0.18);
  position: relative; z-index: 1;
}
.emu-loading-retry:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
.error-card {
  text-align: center;
  padding: 28px 36px;
  border-radius: 7px;
  background: rgba(255, 251, 245, 0.96);
  border: 2px solid var(--border-color, #111);
  max-width: 320px;
  color: #111;
  box-shadow: 6px 6px 0 var(--border-color, #111);
}
.error-card p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; line-height: 1.5; font-weight: 700; }

.spinner {
  position: relative;
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.08);
  border-top-color: #818CF8;
  border-right-color: color-mix(in srgb, var(--accent) 50%, transparent);
  animation: spin 0.9s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
  z-index: 1;
}
@keyframes spin { to { transform: rotate(360deg); } }

.player-page :deep(.player-bar) {
  --b-bg: rgba(255, 251, 245, 0.96);
  --b-border: var(--border-color, #111);
  --b-btn-bg: rgba(255, 255, 255, 0.72);
  --b-btn-hover: #111;
  --b-text: #111;
  --b-muted: var(--text-secondary);
  --b-tertiary: var(--text-tertiary);
  gap: 8px;
  background: var(--b-bg);
  color: #111;
  border-bottom: 2px solid var(--border-color, #111);
  box-shadow: none;
}
.player-page :deep(.bar-title) {
  color: #111;
  font-weight: 900;
}
.player-page :deep(.bar-core) {
  color: var(--text-secondary);
  font-weight: 900;
}
.player-page :deep(.bar-btn) {
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  color: #111;
  font-weight: 900;
}
.player-page :deep(.bar-btn:hover) {
  background: #111;
  border-color: #111;
  color: #fff;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.player-page :deep(.bar-btn:active) {
  transform: translate(0, 0);
  box-shadow: none;
}
.player-page :deep(.bar-btn-accent) {
  background: #111;
  border-color: #111;
  color: #fff;
}
.player-page :deep(.bar-badge) {
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  color: #111;
  font-weight: 900;
  box-shadow: none;
}
.player-page :deep(.playing-led) {
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: color-mix(in srgb, var(--success) 20%, #fff);
  color: #047857;
  font-weight: 900;
}

.ver-switch { position: relative; }
.ver-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 10px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: rgba(255, 251, 245, 0.92);
  color: #111;
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease, color 0.14s ease;
}
.ver-btn:hover { background: #fff; transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--border-color, #111); }
.ver-cur { color: #111; }
.ver-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 140px;
  padding: 6px;
  background: rgba(255, 251, 245, 0.98);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  z-index: 40;
}
.ver-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: #111;
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.ver-item:hover { background: rgba(17, 17, 17, 0.06); color: #111; }
.ver-item.active { background: #111; color: #fff; }

.rotate-hint, .toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 16px;
  border-radius: 7px;
  color: #111;
  font-size: 13px;
  font-weight: 900;
  background: rgba(255, 251, 245, 0.94);
  backdrop-filter: blur(12px);
  border: 2px solid var(--border-color, #111);
  box-shadow: 4px 4px 0 var(--border-color, #111);
  z-index: 100;
}
.rotate-hint { bottom: 90px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.rotate-hint svg { animation: rotPhone 1.8s ease-in-out infinite; }
@keyframes rotPhone {
  0%, 100% { transform: rotate(0); }
  50%      { transform: rotate(90deg); }
}
.toast { bottom: 60px; }

.hint-enter-active, .hint-leave-active {
  transition: opacity 0.25s var(--ease-out), transform 0.25s var(--ease-out);
}
.hint-enter-from, .hint-leave-to {
  opacity: 0; transform: translateX(-50%) translateY(12px);
}

@media (min-width: 769px) {
  .emu-area { padding: 16px 24px; }
  .emu-frame {
    max-width: 1100px;
    max-height: calc(100vh - 32px);
    margin: 0 auto;
    border-radius: 7px;
    border: 2px solid var(--border-color, #111);
    overflow: hidden;
    background: #000;
  }
}
</style>
