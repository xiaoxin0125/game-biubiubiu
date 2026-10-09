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
      :gamepad-players="Math.min(2, activeMaxPlayers)"
      gamepad-binding-note="连接两个手柄时分别控制 P1/P2；只有一个手柄时，单人游戏控制 P1，双人游戏默认控制 P2。左摇杆和十字键都可控制方向。"
      source-style
      @close="closeInputSettings"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInputMapping } from '../composables/useInputMapping.js'
import { useAuth } from '../composables/useAuth.js'
import { usePlayerRom } from '../composables/player/usePlayerRom.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import { useLocalPlayerInput } from '../composables/player/solo/useLocalPlayerInput.js'
import { useSoloPlayerActions } from '../composables/player/solo/useSoloPlayerActions.js'
import { useSoloPlayerLifecycle } from '../composables/player/solo/useSoloPlayerLifecycle.js'
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

const {
  pressSoloGamepadButton,
  releaseSoloGamepadButton,
  handleLocalKeyboardEvent,
  stopKeyboardTurboLoops,
} = useLocalPlayerInput({
  mapping,
  romMeta,
  portalRef,
  showInput,
  isTouchLayout,
  activeMaxPlayers,
  currentPlatformButtons,
  player1RuntimeKeyboard,
})

const {
  onBooted,
  onInputConfigReloaded,
  reloadPage,
  onFullscreen,
  goBack,
  switchVersion,
} = useSoloPlayerActions({
  router,
  romMeta,
  versionMenuOpen,
  portalRef,
  booted,
  markBooted,
  showToast,
})

useSoloPlayerLifecycle({
  routeRomId: () => props.id,
  booted,
  shouldSuggestRotate,
  showRotateHintFor,
  startViewport,
  stopViewport,
  closeInputSettings,
  handleLocalKeyboardEvent,
  loadMeta,
  resetForRouteChange,
  startSlowLoadingTimer,
  stopKeyboardTurboLoops,
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
    linear-gradient(180deg, #FFF9F2 0%, #FFFBFD 46%, #FFF9F2 100%);
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
    #2A2138;
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
  animation: glow-pulse 1.8s var(--clay-ease) infinite;
}
@keyframes glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.92); }
  50%      { opacity: 1;   transform: scale(1.1);  }
}

.emu-loading-title {
  margin: 0;
  color: #F7F1F6;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.22em;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  animation: coin-blink 1.6s var(--clay-ease) infinite;
}
@keyframes coin-blink {
  0%, 50%, 100% { opacity: 1; }
  60%, 90%      { opacity: 0.45; }
}
.emu-loading-title .dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #A98CF5;
  box-shadow: 0 0 6px var(--accent);
  animation: dot-bounce 1.2s var(--clay-ease) infinite;
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
  color: #F7F1F6;
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
  border-radius: var(--r-lg);
  background: rgba(255, 252, 253, 0.96);
  border: 0;
  max-width: 320px;
  color: var(--text-primary);
  box-shadow: var(--clay-md);
}
.error-card p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; line-height: 1.5; font-weight: 700; }

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
