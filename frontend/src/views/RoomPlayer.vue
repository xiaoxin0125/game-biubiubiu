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
          v-if="rom && biosReady && isHostMode"
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
      :local-players="1"
      :gamepad-players="1"
      :gamepad-profile-keys="roomGamepadProfileKeys"
      room-mode
      @close="closeInputSettings"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useInputMapping } from '../composables/useInputMapping.js'
import { useAuth } from '../composables/useAuth.js'
import { usePlayerRom } from '../composables/player/usePlayerRom.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { useGuestInputForwarding } from '../composables/player/useGuestInputForwarding.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import { usePlayerRoomRuntime } from '../composables/player/usePlayerRoomRuntime.js'
import { dispatchArcadeNetplayInput, isArcadeNetplayInputEnabled, arcadeNetplayGuestKeyboardPlayer } from '../composables/player/arcadeNetplayInput.js'
import { useRoomTurboTargets } from '../composables/player/room/useRoomTurboTargets.js'
import { useRoomPlayerInput } from '../composables/player/room/useRoomPlayerInput.js'
import { useRoomPlayerActions } from '../composables/player/room/useRoomPlayerActions.js'
import { useRoomPlayerLifecycle } from '../composables/player/room/useRoomPlayerLifecycle.js'
import EmulatorPortal from '../components/emulator-portal/EmulatorPortal.vue'
import GameOverlay from '../components/emulator-portal/GameOverlay.vue'
import VirtualGamepad from '../components/emulator-portal/VirtualGamepad.vue'
import RoomPanel from '../components/emulator-portal/RoomPanel.vue'
import InputSettings from '../components/InputSettings.vue'

const props = defineProps({
  id: String,
  code: String,
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

const roomCode = (props.code || route.params.code || route.query.room || '').toString().toUpperCase() || null
const isRoomMode = true
const roomGamepadProfileKeys = ['ps4', 'xbox', 'generic']
const roomHostInputConfigSnapshot = ref(null)
const { currentTurboTargets, turboTargetForButton } = useRoomTurboTargets({
  romMeta: { get value() { return romMeta.value } },
  isTouchLayout,
})

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
  turboTargetsForPlayer: () => currentTurboTargets.value,
  dispatchRemoteInput: ({ playerIndex, action, button, keyMap, controls, turboTargets }) => {
    if (!isArcadeNetplayInputEnabled({ isRoomMode, platform: romMeta.value?.platform })) return false
    return dispatchArcadeNetplayInput({ playerIndex, action, button, keyMap, controls, turboTargets })
  },
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

const roomAllowsPlay = computed(() => roomAllowPlay.value)
const canShowVersionSwitch = computed(() => isHostMode.value === true)
const canSaveState = computed(() => isAuthed.value && signalMe.value?.isHost === true)

const shouldShowVirtualGamepad = computed(() => {
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
  keyboardPlayer: () => arcadeNetplayGuestKeyboardPlayer({
    isRoomMode,
    platform: romMeta.value?.platform,
    playerIndex: currentRoomPeer.value?.playerIndex || signalMe.value?.playerIndex,
  }),
})
const {
  gamepadButtonInterceptor,
  pressLocalButton,
  releaseLocalButton,
  handleRoomKeyboardEvent,
  stopKeyboardTurboLoops,
} = useRoomPlayerInput({
  mapping,
  romMeta,
  portalRef,
  showInput,
  isTouchLayout,
  isRoomMode,
  isHostMode,
  isGuestMode,
  activeMaxPlayers,
  currentPlatformButtons,
  player1RuntimeKeyboard,
  roomHostInputConfigSnapshot,
  currentTurboTargets,
  turboTargetForButton,
  guestButtonInterceptor,
  roomGamepadPlayer,
})

const {
  onBooted,
  onInputConfigReloaded,
  reloadPage,
  onFullscreen,
  goBack,
  switchVersion,
} = useRoomPlayerActions({
  router,
  roomCode,
  romMeta,
  versionMenuOpen,
  portalRef,
  booted,
  markBooted,
  showToast,
  inviteConnectedRoomPeers,
})

useRoomPlayerLifecycle({
  routeRomId: () => props.id,
  booted,
  roomHostInputConfigSnapshot,
  shouldSuggestRotate,
  showRotateHintFor,
  startViewport,
  stopViewport,
  closeInputSettings,
  handleRoomKeyboardEvent,
  loadMeta,
  resetForRouteChange,
  startSlowLoadingTimer,
  stopKeyboardTurboLoops,
  connectRoomRuntime,
  disconnectRoomRuntime,
  resetInvites,
  rtc,
  guestKeyHandler,
  goBack,
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
  background: rgba(255, 251, 245, 0.88);
  color: #111;
  backdrop-filter: blur(8px);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  margin: 16px;
  box-shadow: 6px 6px 0 var(--border-color, #111);
}
.guest-waiting p { margin: 0; font-size: 14px; font-weight: 900; }
.guest-waiting .muted { font-size: 11px; color: var(--text-secondary); letter-spacing: 0.08em; }

/* Tap-to-unmute chip for guests — floats in bottom-right of video area */
.unmute-chip {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: rgba(255, 251, 245, 0.94);
  color: #111;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 4px 4px 0 var(--border-color, #111);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 5;
  transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}
.unmute-chip:hover { color: #fff; background: #111; transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--border-color, #111); }

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

.room-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: rgba(255, 251, 245, 0.92);
  color: #111;
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: none;
  transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease, color 0.14s ease;
}

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
.room-chip:hover { background: #fff; transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--border-color, #111); }
.room-chip.active { background: #111; color: #fff; border-color: #111; }
.chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  border-radius: 7px;
  border: 2px solid currentColor;
  background: transparent;
  color: currentColor;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  box-shadow: none;
}

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

