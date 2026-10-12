<template>
  <div
    class="player-page"
    :class="{ 'is-touch-layout': isTouchLayout, 'is-pseudo-fullscreen': isPseudoFullscreen, 'is-forced-landscape': isForcedLandscape, 'is-zoomed': isZoomed }"
    ref="playerRootRef"
    @contextmenu.prevent
  >
    <GameOverlay
      :title="displayName"
      :platform="overlayPlatformInfo"
      :core-name="overlayCoreName"
      :can-save="canSaveState"
      :can-reload="canReload"
      :can-cheat="canCheat"
      :show-keys="!isTouchLayout"
      :show-fullscreen="!isTouchLayout"
      @back="goBack"
      @fullscreen="onFullscreen"
      @keys="openInputSettings"
      @save-state="onSaveState"
      @load-state="onLoadState"
      @reload="onReload"
      @cheats="showCheats = true"
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
          v-if="portalActive"
          ref="portalRef"
          :core="activeCore"
          :rom="rom"
          :bios="bios"
          :progress="loadProgress"
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
            <div class="error-actions">
              <button class="btn btn-primary" @click="goBack">返回列表</button>
              <button class="btn" @click="reloadPage">重新加载</button>
            </div>
          </div>
        </div>

        <!-- 房主/单机加载面板：核心下载与初始化全程可见。客人不下载本地资源，
             等待画面由 guest-view 负责，所以这里用 guestViewActive 排除。 -->
        <ResourceLoadingOverlay
          v-if="showLoadOverlay"
          :title="displayName"
          :progress="loadProgress"
          :hint="loadingSub"
          :slow="loadingSlow"
          @retry="reloadPage"
        />

        <!-- 手机端全屏按钮：画面左上角，全屏后同样停在左上角用于退出 -->
        <FullscreenButton
          v-if="isTouchLayout || isFullscreen"
          :active="isFullscreen"
          @toggle="onFullscreen"
        />
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
      :landscape-rotate="isForcedLandscape"
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
      room-mode
      @close="closeInputSettings"
    />

    <CheatDialog
      v-if="showCheats"
      :builtin-cheats="builtinCheats"
      :cheats="cheats"
      :core-name="coreDisplayName[activeCore] || activeCore"
      :supported="cheatSupported"
      :max-cheats="maxCheats"
      @close="showCheats = false"
      @add="addCheat"
      @update="updateCheat"
      @remove="removeCheat"
      @toggle="toggleCheat"
      @clear="clearCheats"
    />

    <!-- 手机端排查卡死：地址后加 ?perf=1 才出现 -->
    <pre v-if="perfActive" class="perf-hud">{{ perfStats }}</pre>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useInputMapping } from '../composables/useInputMapping.js'
import { useAuth } from '../composables/useAuth.js'
import { usePlayerRom } from '../composables/player/usePlayerRom.js'
import { useResourceLoadProgress } from '../composables/player/useResourceLoadProgress.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { useCheats } from '../composables/player/useCheats.js'
import { useGuestInputForwarding } from '../composables/player/useGuestInputForwarding.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import { usePlayerRoomRuntime } from '../composables/player/usePlayerRoomRuntime.js'
import { useFullscreen } from '../composables/useFullscreen.js'
import { useTouchZoomGuard } from '../composables/useTouchZoomGuard.js'
import { usePerfOverlay } from '../composables/usePerfOverlay.js'
import { dispatchArcadeNetplayInput, isArcadeNetplayInputEnabled, arcadeNetplayGuestKeyboardPlayer } from '../composables/player/arcadeNetplayInput.js'
import { useRoomTurboTargets } from '../composables/player/room/useRoomTurboTargets.js'
import { useRoomPlayerInput } from '../composables/player/room/useRoomPlayerInput.js'
import { useRoomPlayerActions } from '../composables/player/room/useRoomPlayerActions.js'
import { useRoomPlayerLifecycle } from '../composables/player/room/useRoomPlayerLifecycle.js'
import EmulatorPortal from '../components/emulator-portal/EmulatorPortal.vue'
import GameOverlay from '../components/emulator-portal/GameOverlay.vue'
import CheatDialog from '../components/emulator-portal/CheatDialog.vue'
import VirtualGamepad from '../components/emulator-portal/VirtualGamepad.vue'
import FullscreenButton from '../components/emulator-portal/FullscreenButton.vue'
import RoomPanel from '../components/emulator-portal/RoomPanel.vue'
import ResourceLoadingOverlay from '../components/emulator-portal/ResourceLoadingOverlay.vue'
import InputSettings from '../components/InputSettings.vue'
import { coreDisplayName } from '../constants/cores.js'

const props = defineProps({
  id: String,
  code: String,
})
const router = useRouter()
const route = useRoute()
const { mapping } = useInputMapping()
const { isAuthed } = useAuth()

const portalRef = ref(null)
const playerRootRef = ref(null)
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

// 资源加载进度：房主这一侧才真正下载核心/ROM/BIOS，进度只对它有意义。
const loadProgress = useResourceLoadProgress()

const roomCode = (props.code || route.params.code || route.query.room || '').toString().toUpperCase() || null
const isRoomMode = true
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
  progress: loadProgress,
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

const showCheats = ref(false)
// 模拟器只跑在房主一侧，重载与金手指都只对房主开放。
const canControlEmulator = computed(() => isHostMode.value === true && !!rom.value && booted.value)
const canCheat = computed(() => canControlEmulator.value)

// 模拟器组件挂载条件：房主 + ROM/BIOS 就绪（核心下载就在组件内部发起）。
const portalActive = computed(() => isHostMode.value === true && !!rom.value && biosReady.value)
// 客人（以及还没确定角色的访客）看的是主机画面，不该出现"本地资源"进度。
const guestViewActive = computed(() => isRoomMode && isHostMode.value !== true)
// 加载面板显示规则：没启动成功就一直显示；错误发生在模拟器挂载之前时让位给错误卡片。
const showLoadOverlay = computed(() =>
  !booted.value && !guestViewActive.value && !(fatalError.value && !portalActive.value))

// 核心一选定就登记任务，界面先知道要下几个文件、共多大。
watch([activeCore, isHostMode], ([core, host]) => {
  if (core && host === true) loadProgress.registerCoreTasks(core)
})

const { onSaveState, onLoadState } = useSaveState({
  romMeta,
  platformInfo,
  portalRef,
  isAuthed,
  isGuestMode,
  showToast,
})

const {
  builtinCheats,
  cheats,
  cheatSupported,
  maxCheats,
  addCheat,
  updateCheat,
  removeCheat,
  toggleCheat,
  clearCheats,
} = useCheats({
  romMeta,
  platformInfo,
  portalRef,
  booted,
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
  onReload,
  reloadPage,
  goBack,
  switchVersion,
  reloading,
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
  resetInvites,
  rtc,
  signalMe,
  signalPeers,
})

// 全屏对象是整个播放页：虚拟手柄、顶部工具条都在里面，全屏后手柄不会丢。
// 横屏锁定失败（iOS 等）时用 toast 提示用户手动横屏。
const { isFullscreen, isPseudoFullscreen, isForcedLandscape, toggleFullscreen } = useFullscreen({
  target: () => playerRootRef.value,
  onNotice: (message) => showToast(message),
})

function onFullscreen() {
  toggleFullscreen()
}

// 手机端：防止连点按钮 / 双指同时按手柄被浏览器当成缩放手势（放大了就回不去）
const { isZoomed } = useTouchZoomGuard({
  target: () => playerRootRef.value,
  onZoomed: () => showToast('画面被放大了，双指捏合可还原', 3600),
})

// 排查手机端卡死用：地址后加 ?perf=1 才显示性能浮层
const { active: perfActive, stats: perfStats } = usePerfOverlay({
  enabled: typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf'),
})

const canReload = computed(() => canControlEmulator.value && !reloading.value)

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
  isPseudoFullscreen,
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
    linear-gradient(180deg, #FFF9F2 0%, #FFFBFD 46%, #FFF9F2 100%);
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
  background: linear-gradient(180deg, #382C46 0%, #2A2138 100%);
  overflow: hidden;
}
.remote-video {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: linear-gradient(180deg, #382C46 0%, #2A2138 100%);
  object-fit: contain;
}
.guest-waiting {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  background: rgba(255, 252, 253, 0.88);
  color: var(--text-primary);
  backdrop-filter: blur(8px);
  border: 0;
  border-radius: var(--r-lg);
  margin: 16px;
  box-shadow: var(--clay-md);
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
  padding: 10px 18px;
  border-radius: var(--r-pill);
  border: 0;
  background: rgba(255, 252, 253, 0.88);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: var(--clay-sm);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 5;
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.unmute-chip:hover {
  color: #6C2039;
  background: var(--clay-pink-soft);
  transform: var(--clay-lift);
  box-shadow: var(--clay-md);
}
.unmute-chip:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.unmute-chip:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.emu-error {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px;
  background:
    radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, rgba(0,0,0,0) 60%),
    #2A2138;
  z-index: 10;
  padding: 24px;
  text-align: center;
}

.error-card {
  text-align: center;
  padding: 28px 36px;
  border-radius: var(--r-lg);
  background: rgba(255, 252, 253, 0.88);
  border: 0;
  max-width: 320px;
  color: var(--text-primary);
  box-shadow: var(--clay-md);
}
.error-card p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; line-height: 1.5; font-weight: 700; }
.error-actions { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }

.spinner {
  position: relative;
  width: 38px; height: 38px;
  margin: 0 auto 4px;
  border-radius: 50%;
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-md), 0 0 22px color-mix(in srgb, var(--accent) 45%, transparent);
  animation: clay-pulse 1s var(--clay-ease) infinite;
  z-index: 1;
}

.room-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.room-chip:hover {
  background: var(--clay-surface-alt);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.room-chip:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.room-chip:focus-visible { outline: none; box-shadow: var(--clay-focus); }

/* GameOverlay 自带粘土样式，这里只做页面级微调（条形更紧凑、上浮更明显）。 */
.player-page :deep(.player-bar) {
  gap: 8px;
  background: var(--clay-float-surface);
  box-shadow: var(--clay-sm);
}
.player-page :deep(.bar-btn-accent) {
  background: var(--clay-primary-grad);
  color: #fff;
}

.ver-switch { position: relative; }
.ver-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.ver-btn:hover {
  background: var(--clay-surface-alt);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.ver-btn:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.ver-btn:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.ver-cur { color: var(--text-primary); }
.ver-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 150px;
  padding: 8px;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-lg);
  box-shadow: var(--clay-lg);
  z-index: 40;
}
.ver-item {
  display: block;
  width: 100%;
  padding: 9px 12px;
  background: transparent;
  border: 0;
  border-radius: var(--r-md);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.ver-item:hover {
  background: var(--clay-surface-alt);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.ver-item:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.ver-item.active { background: var(--clay-primary-grad); color: #fff; box-shadow: var(--clay-sm); }
.room-chip.active { background: var(--clay-primary-grad); color: #fff; box-shadow: var(--clay-sm); }
.chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--r-pill);
  border: 0;
  background: rgba(255, 255, 255, 0.72);
  color: currentColor;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  box-shadow: var(--clay-xs);
}
.room-chip.active .chip-count { background: rgba(255, 255, 255, 0.82); color: #7A3D5C; }

.rotate-hint, .toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: var(--r-pill);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  background: var(--clay-float-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 0;
  box-shadow: var(--clay-lg);
  z-index: 100;
}
.rotate-hint { bottom: 90px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.rotate-hint svg { animation: rotPhone 1.8s var(--clay-ease) infinite; }
@keyframes rotPhone {
  0%, 100% { transform: rotate(0); }
  50%      { transform: rotate(90deg); }
}
.toast { bottom: 60px; }

.hint-enter-active, .hint-leave-active {
  transition: opacity var(--t) var(--clay-ease), transform var(--t) var(--clay-ease);
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
    border-radius: var(--r-lg);
    border: 0;
    overflow: hidden;
    background: linear-gradient(180deg, #382C46 0%, #2A2138 100%);
  }
}
</style>

