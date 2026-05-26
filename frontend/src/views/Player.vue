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
        <!-- Version switcher: only when this game has multi-version siblings -->
        <div v-if="canShowVersionSwitch && siblings.length > 1" class="ver-switch" @click.stop>
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

        <button v-if="isRoomMode" class="room-chip" :class="{ active: showRoom }" @click="showRoom = !showRoom" title="房间">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span class="chip-count">{{ Object.keys(signalPeers).length }}</span>
        </button>
      </template>
    </GameOverlay>

    <div class="emu-area">
      <div class="emu-frame">
        <!-- Host / solo: real Nostalgist emulator.
             Only render when we KNOW we're solo or the host. If we're in a
             room but role is still unknown (welcome not arrived yet), show
             the waiting-guest view instead — starting the emulator for a
             future guest wastes cores + triggers an unmount race. -->
        <EmulatorPortal
          v-if="rom && biosReady && (!isRoomMode || isHostMode)"
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

        <!-- Guest (or role not yet determined in a room): remote video stream -->
        <div v-else-if="isRoomMode && !fatalError" class="guest-view">
          <video
            ref="remoteVideoRef"
            class="remote-video"
            autoplay
            playsinline
            muted
            @playing="onVideoPlaying"
          ></video>
          <!-- Waiting overlay: connecting / no stream yet -->
          <div v-if="!remoteStreamActive" class="guest-waiting">
            <div class="spinner"></div>
            <p>{{ signalMe ? '等待主机画面…' : '正在进入房间…' }}</p>
            <p class="muted">{{ connectionStatus }}</p>
          </div>
          <!-- Mute badge: auto-start is always muted to bypass browser autoplay
               policy; this chip lets the user opt in to audio with a tap. -->
          <button v-if="remoteStreamActive && isMuted" class="unmute-chip" @click="unmuteRemote">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>
            点击取消静音
          </button>
        </div>

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

    <!-- Virtual pad: host/solo on touch devices, or room players with control seats. -->
    <VirtualGamepad
      v-if="shouldShowVirtualGamepad"
      :platform="romMeta?.platform"
      :button-interceptor="gamepadButtonInterceptor"
      :press-button="pressLocalButton"
      :release-button="releaseLocalButton"
    />

    <RoomPanel
      v-if="isRoomMode"
      :open="showRoom"
      :code="roomCode"
      :connected="signalConnected"
      :is-host="isHostMode"
      :allow-play="roomAllowsPlay"
      :me-peer-id="signalMe?.peerId"
      :peers="signalPeers"
      :chat="signalChat"
      @close="showRoom = false"
      @send="sendChat"
    />

    <InputSettings
      v-if="showInput && !isTouchLayout"
      :platform="romMeta?.platform"
      :local-players="!isRoomMode ? Math.min(2, activeMaxPlayers) : 1"
      @close="closeInputSettings"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useInputMapping, BUTTON_DEFS, RETROPAD_BUTTON_DEFS, buildLocalPlayerKeyboardMap, effectiveKeyboardForPlayer, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS, normalizeRetroarchKey } from '../composables/useInputMapping.js'
import { dispatchKeyboardEvent } from '../composables/dispatchKeyboardEvent.js'
import { useAuth } from '../composables/useAuth.js'
import { useGamepads } from '../composables/useGamepads.js'
import { usePlayerRom } from '../composables/player/usePlayerRom.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { useGuestInputForwarding } from '../composables/player/useGuestInputForwarding.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import { usePlayerRoomRuntime } from '../composables/player/usePlayerRoomRuntime.js'
import EmulatorPortal from '../components/emulator-portal/EmulatorPortal.vue'
import GameOverlay from '../components/emulator-portal/GameOverlay.vue'
import VirtualGamepad from '../components/emulator-portal/VirtualGamepad.vue'
import RoomPanel from '../components/emulator-portal/RoomPanel.vue'
import InputSettings from '../components/InputSettings.vue'

const props = defineProps({
  id: String,
})
const router = useRouter()
const route = useRoute()
const { mapping } = useInputMapping()
const { isAuthed } = useAuth()

const portalRef = ref(null)
const booted = ref(false)

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

const roomCode = (route.query.room || '').toString().toUpperCase() || null
const isRoomMode = !!roomCode
const roomHostInputConfigSnapshot = ref(null)
const keyboardTurboLoops = new Map()

function openInputSettings() {
  openInputSettingsPanel({ blocked: isTouchLayout.value })
}

let remotePlayerKeyMaps = { value: {} }

const roomRuntime = usePlayerRoomRuntime({
  roomCode,
  router,
  portalRef,
  isRoomMode,
  booted,
  remoteKeyMapForPlayer: (playerIndex) => remotePlayerKeyMaps.value[playerIndex],
  setFatalError,
  showToast,
})

const {
  rtc,
  roomSession,
  signalConnected,
  signalMe,
  signalPeers,
  signalChat,
  showRoom,
  connectionStatus,
  roomAllowPlay,
  isHostMode,
  isGuestMode,
  currentRoomPeer,
  sendChat,
  remoteVideoRef,
  remoteStreamActive,
  isMuted,
  onVideoPlaying,
  unmuteRemote,
  canLocalControl,
  roomGamepadPlayer,
  inviteConnectedRoomPeers,
  connect: connectRoomRuntime,
  disconnect: disconnectRoomRuntime,
  resetInvites,
} = roomRuntime

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
  roomCode,
  localPeer: signalMe,
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
  remotePlayerKeyMaps: resolvedRemotePlayerKeyMaps,
  retroarchConfig,
} = usePlayerEmulatorConfig({
  mapping,
  romMeta,
  roomInfo,
  platformInfo,
  roomSession,
  signalMe,
  isRoomMode,
  isTouchLayout,
  roomHostInputConfigSnapshot,
})
remotePlayerKeyMaps = resolvedRemotePlayerKeyMaps

const roomAllowsPlay = computed(() => (isRoomMode ? roomAllowPlay.value : roomInfo.value?.allowPlay !== false))
const canShowVersionSwitch = computed(() => !isRoomMode || isHostMode.value === true)
const canSaveState = computed(() => {
  if (!isAuthed.value) return false
  if (!isRoomMode) return true
  return signalMe.value?.isHost === true
})

const shouldShowVirtualGamepad = computed(() => {
  if (isTouchLayout.value) return !!rom.value && (!isRoomMode || signalMe.value?.isHost || canLocalControl.value)
  if (!isRoomMode) return !!rom.value
  if (!signalMe.value) return false
  if (signalMe.value.isHost) return !!rom.value
  return canLocalControl.value
})
const displayName = computed(() =>
  romMeta.value?.title || roomInfo.value?.romTitle || (isGuestMode.value ? '连接中…' : '加载中…'))

const { onSaveState, onLoadState } = useSaveState({
  romMeta,
  platformInfo,
  portalRef,
  isAuthed,
  isGuestMode,
  showToast,
})

const { guestKeyHandler, guestButtonInterceptor } = useGuestInputForwarding({
  mapping,
  platform: computed(() => romMeta.value?.platform || null),
  platformButtons: currentPlatformButtons,
  roomRtc: () => rtc,
  isRoomMode,
  localPeer: signalMe,
  isGuestMode,
  canLocalControl,
})
const hostButtonInterceptor = (action, button) => {
  if (!isRoomMode || !isHostMode.value) return false
  const snapshotKeyboard = snapshotKeyboardMapping()
  const turboTarget = TURBO_BUTTON_TARGETS[button]
  if (turboTarget) {
    dispatchHostPlayer1Turbo(button, turboTarget, action, snapshotKeyboard)
    return true
  }
  dispatchHostPlayer1Button(action, button, snapshotKeyboard)
  return true
}

function dispatchHostPlayer1Button(action, button, source = null) {
  if (action === 'down') pressLocalButton(button, 1)
  else releaseLocalButton(button, 1)

  const key = source?.[button]
  if (key && key !== 'nul') {
    dispatchKeyboardEvent(action === 'down' ? 'keydown' : 'keyup', key, { internal: true })
  }
}

function dispatchHostPlayer1Turbo(turboButton, targetButton, action, source = null) {
  dispatchLocalButtonTurbo(`host:${turboButton}`, targetButton, action, 1)
  dispatchKeyboardTurbo(`host:${turboButton}`, targetButton, action, {
    ...(source || {}),
    [turboButton]: null,
  })
}

const gamepadButtonInterceptor = (action, button, player = 1) => {
  if (isRoomMode && !isHostMode.value && guestButtonInterceptor(action, button)) return true
  if (isRoomMode && isHostMode.value) return hostButtonInterceptor(action, button)
  return false
}
const resolveGamepadPlayer = (slot) => {
  if (!isRoomMode) return slot <= Math.min(2, activeMaxPlayers.value) ? slot : null
  return roomGamepadPlayer()
}
const pressLocalButton = (button, player = 1) => portalRef.value?.pressButton?.(button, player)
const releaseLocalButton = (button, player = 1) => portalRef.value?.releaseButton?.(button, player)
useGamepads({
  mapping,
  onButton: gamepadButtonInterceptor,
  pressButton: (button, player = 1) => pressLocalButton(button, player),
  releaseButton: (button, player = 1) => releaseLocalButton(button, player),
  maxLocalPlayers: computed(() => (isRoomMode ? 2 : Math.min(2, activeMaxPlayers.value))),
  playerResolver: resolveGamepadPlayer,
  platformButtons: currentPlatformButtons,
})

function onBooted() {
  booted.value = true
  markBooted()
  inviteConnectedRoomPeers({ booted: booted.value })
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
  if (handleHostKeyboardRemap(e)) return
  if (handleLocalPlayer2Keyboard(e)) return
  if (handleLocalKeyboardButton(e)) return
  handleTurboKeyboard(e)
}
function onKeyUp(e) {
  if (handleHostKeyboardRemap(e)) return
  if (handleLocalPlayer2Keyboard(e)) return
  if (handleLocalKeyboardButton(e)) return
  handleTurboKeyboard(e)
}
function snapshotKeyboardMapping() {
  const snapshot = roomHostInputConfigSnapshot.value
  const runtimeKeyboard = player1RuntimeKeyboard.value
  if (!snapshot) return runtimeKeyboard
  const out = {}
  for (const { key } of BUTTON_DEFS) {
    const target = TURBO_BUTTON_TARGETS[key] || key
    out[key] = snapshot[`input_player1_${target}`] || runtimeKeyboard[target] || 'nul'
  }
  return out
}

function inputButtonFromConfigKey(config, key, allowed = null, { includeTurbo = false } = {}) {
  const defs = includeTurbo ? BUTTON_DEFS : RETROPAD_BUTTON_DEFS
  for (const { key: button } of defs) {
    if (allowed && !allowed.has(button)) continue
    if (config?.[button] === key) return button
  }
  return null
}

function handleHostKeyboardRemap(e) {
  if (e.__internalInputDispatch) return false
  if (!isRoomMode || !isHostMode.value || showInput.value) return false
  const snapshotKeyboard = snapshotKeyboardMapping()
  if (!snapshotKeyboard) return false

  const key = normalizeDomKey(e)
  const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
  const currentKeyboard = effectiveKeyboardForPlayer(mapping.value, 1, romMeta.value?.platform || null)
  const currentButton = inputButtonFromConfigKey(currentKeyboard, key, allowed, { includeTurbo: true })

  if (currentButton) {
    const targetButton = TURBO_BUTTON_TARGETS[currentButton] || currentButton
    e.preventDefault()
    e.stopImmediatePropagation()
    const action = e.type === 'keydown' ? 'down' : 'up'
    if (TURBO_BUTTON_TARGETS[currentButton]) dispatchHostPlayer1Turbo(currentButton, targetButton, action, snapshotKeyboard)
    else dispatchHostPlayer1Button(action, targetButton, snapshotKeyboard)
    return true
  }

  const oldButton = inputButtonFromConfigKey(snapshotKeyboard, key, allowed)
  if (oldButton && currentKeyboard[oldButton] !== key) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return true
  }

  return false
}

function handleLocalPlayer2Keyboard(e) {
  if (e.__internalInputDispatch || showInput.value || isTouchLayout.value || isRoomMode || isGuestMode.value) return false
  if (activeMaxPlayers.value < 2 || isTouchLayout.value) return false

  const key = normalizeDomKey(e)
  const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
  const p2UserKeyboard = mapping.value.keyboardP2 || {}
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
  if (e.__internalInputDispatch || showInput.value || isGuestMode.value) return false
  if (isRoomMode && !isHostMode.value) return false

  const key = normalizeDomKey(e)
  const allowed = currentPlatformButtons.value ? new Set(currentPlatformButtons.value) : null
  const currentKeyboard = effectiveKeyboardForPlayer(mapping.value, 1, romMeta.value?.platform || null)
  const button = inputButtonFromConfigKey(currentKeyboard, key, allowed, { includeTurbo: true })
  if (!button) return false

  const action = e.type === 'keydown' ? 'down' : 'up'
  const turboTarget = TURBO_BUTTON_TARGETS[button]
  const targetButton = turboTarget || button
  const runtimeKeyboard = isRoomMode ? snapshotKeyboardMapping() : player1RuntimeKeyboard.value

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
  if (showInput.value || isGuestMode.value) return
  const snapshotKeyboard = snapshotKeyboardMapping()
  const source = snapshotKeyboard || mapping.value.keyboard || {}
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
function dispatchLocalButtonTurbo(turboButton, targetButton, action, player = 1) {
  const loopKey = `${player}:${turboButton}`
  if (action === 'down') {
    if (keyboardTurboLoops.has(loopKey)) return
    let down = true
    pressLocalButton(targetButton, player)
    const loop = setInterval(() => {
      down = !down
      if (down) pressLocalButton(targetButton, player)
      else releaseLocalButton(targetButton, player)
    }, TURBO_FIRE_MS)
    keyboardTurboLoops.set(loopKey, { loop, targetButton, direct: true, player })
    return
  }

  const active = keyboardTurboLoops.get(loopKey)
  if (active) {
    clearInterval(active.loop)
    keyboardTurboLoops.delete(loopKey)
  }
  releaseLocalButton(targetButton, player)
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
    if (active.direct) releaseLocalButton(active.targetButton, active.player || 1)
    else dispatchKeyboardEvent('keyup', active.targetKey, { internal: true })
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
  if (/^[0-9]$/.test(raw)) return raw
  if (raw === ';') return 'semicolon'
  if (raw === '-') return 'minus'
  if (raw === '=') return 'equals'
  if (raw === '/') return 'slash'
  if (raw === '*') return 'multiply'
  if (raw === '+') return 'add'
  if (raw === '.') return 'period'
  return normalizeRetroarchKey(raw.length === 1 ? raw.toLowerCase() : raw.toLowerCase())
}
function goBack() {
  if (isRoomMode) {
    router.push('/rooms')
  } else {
    router.push('/')
  }
}
function switchVersion(v) {
  versionMenuOpen.value = false
  if (!v || v.id === romMeta.value?.id) return
  const suffix = roomCode ? `?room=${roomCode}` : ''
  router.push(`/play/${v.id}${suffix}`)
}

watch(() => props.id, (now, prev) => {
  if (!prev || now === prev) return
  resetForRouteChange()
  booted.value = false
  roomHostInputConfigSnapshot.value = null
  resetInvites()
  loadMeta()
})

onMounted(() => {
  if (shouldSuggestRotate.value) showRotateHintFor()
  startViewport({ onTouchLayout: closeInputSettings })
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('keyup', onKeyUp, true)
  loadMeta()
  startSlowLoadingTimer({ isBooted: () => booted.value })
  if (isRoomMode) {
    connectRoomRuntime({
      onOffer: async (msg) => { await rtc.handleOffer(msg.from, msg.sdp) },
      onAnswer: async (msg) => { await rtc.handleAnswer(msg.from, msg.sdp) },
      onIce: async (msg) => { await rtc.handleIce(msg.from, msg.candidate) },
      guestKeyHandler,
    })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('keyup', onKeyUp, true)
  stopViewport()
  disconnectRoomRuntime({ guestKeyHandler })
})
</script>

<style scoped>
.player-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #000;
  position: relative;
  overflow: hidden;
  /* Kill iOS / WeChat long-press menus (复制/搜一搜/翻译 等) that steal
     pointer events mid-stroke and leave the stick/buttons in a stuck state. */
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

.guest-view {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex; align-items: center; justify-content: center;
  background: #000;
  overflow: hidden;
}
.remote-video {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: #000;
  object-fit: contain;
}
.guest-waiting {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  backdrop-filter: blur(6px);
}
.guest-waiting p { margin: 0; font-size: 14px; }
.guest-waiting .muted { font-size: 11px; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; }

/* Tap-to-unmute chip for guests — floats in bottom-right of video area */
.unmute-chip {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--r-sm);
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: rgba(8, 8, 12, 0.85);
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 5;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}
.unmute-chip:hover { color: #fff; background: color-mix(in srgb, var(--accent) 35%, transparent); }

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
/* Faint CRT scanlines on the loading screen — on-brand for an arcade loader. */
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
  border-radius: 16px;
  background: #141416;
  border: 1px solid rgba(255,255,255,0.08);
  max-width: 320px;
  color: #fff;
}
.error-card p { color: rgba(255,255,255,0.75); font-size: 14px; margin: 0 0 16px; line-height: 1.5; }

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

.room-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.06);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}

.ver-switch { position: relative; }
.ver-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.14s ease;
}
.ver-btn:hover { background: rgba(255,255,255,0.14); }
.ver-cur { color: rgba(255,255,255,0.9); }
.ver-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 140px;
  padding: 6px;
  background: rgba(22, 22, 24, 0.96);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  z-index: 40;
}
.ver-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: rgba(255,255,255,0.85);
  font-size: 12px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.ver-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
.ver-item.active { background: color-mix(in srgb, var(--accent) 30%, transparent); color: #fff; }
.room-chip:hover { background: rgba(255,255,255,0.12); }
.room-chip.active { background: color-mix(in srgb, var(--accent) 30%, transparent); color: #fff; border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
.chip-count {
  background: rgba(0,0,0,0.3);
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.rotate-hint, .toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 16px;
  border-radius: 999px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  background: rgba(20, 20, 22, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.08);
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
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
}
</style>

