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
      :show-actions="showBarActions"
      :can-swap-disk="canUseFdsDisk"
      :can-change-disk="canUseFdsDisk"
      @back="goBack"
      @fullscreen="onFullscreen"
      @keys="openInputSettings"
      @save-state="onSaveState"
      @load-state="onLoadState"
      @reload="onReload"
      @cheats="showCheats = true"
      @swap-disk-side="swapDiskSide"
      @change-disk="changeDisk"
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

    <div class="emu-area" :style="{ '--side-actions-w': sideColumnWidth }">
      <!-- 右侧按钮列的等宽占位：左右对称，画面（crt-screen）才会停在页面正中 -->
      <div v-if="actionsPlacement === 'side'" class="emu-side-spacer" aria-hidden="true"></div>
      <div class="emu-frame">
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

        <div v-else-if="fatalError" class="emu-error">
          <div class="error-card">
            <p>{{ fatalError }}</p>
            <div class="error-actions">
              <button class="btn btn-primary" @click="goBack">返回列表</button>
              <button class="btn" @click="reloadPage">重新加载</button>
            </div>
          </div>
        </div>

        <!-- 加载面板独立于模拟器组件是否挂载：核心还在下载、模拟器还在初始化时
             它都盖在画面上，直到游戏真的跑起来才消失。 -->
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

        <!-- 手机端：保存 / 读档 / 重置 / 金手指与「按键透明度」按钮同侧（画面右上角），
             竖屏横排，横屏与全屏改成竖排 -->
        <GameActionButtons
          v-if="actionsPlacement === 'mobile'"
          variant="mobile"
          :vertical="actionsVertical"
          :fullscreen="isFullscreen"
          :can-save="canSaveState"
          :can-reload="canReload"
          :can-cheat="canCheat"
          :can-swap-disk="canUseFdsDisk"
          :can-change-disk="canUseFdsDisk"
          @save-state="onSaveState"
          @load-state="onLoadState"
          @reload="onReload"
          @cheats="showCheats = true"
          @swap-disk-side="swapDiskSide"
          @change-disk="changeDisk"
        />

        <!-- 手机端「按键透明度」按钮：画面右上角，和左上角的全屏按钮分居两侧 -->
        <VirtualGamepadOpacityButton
          v-if="actionsPlacement === 'mobile'"
          :dimmed="vpadDimmed"
          :fullscreen="isFullscreen"
          @toggle="toggleVpadDimmed"
        />
      </div>

      <!-- PC 宽屏：同一组按钮改成图文按钮放在画面右侧，一行两个 -->
      <GameActionButtons
        v-if="actionsPlacement === 'side'"
        variant="side"
        :can-save="canSaveState"
        :can-reload="canReload"
        :can-cheat="canCheat"
        :show-keys="!isTouchLayout"
        :can-swap-disk="canUseFdsDisk"
        :can-change-disk="canUseFdsDisk"
        @save-state="onSaveState"
        @load-state="onLoadState"
        @reload="onReload"
        @cheats="showCheats = true"
        @keys="openInputSettings"
        @swap-disk-side="swapDiskSide"
        @change-disk="changeDisk"
      />
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
      :landscape-rotate="isForcedLandscape"
      :dimmed="vpadDimmed"
      :press-button="pressSoloGamepadButton"
      :release-button="releaseSoloGamepadButton"
    />

    <InputSettings
      v-if="showInput && !isTouchLayout"
      :platform="romMeta?.platform"
      :local-players="Math.min(2, activeMaxPlayers)"
      source-style
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
import { useRouter } from 'vue-router'
import { useInputMapping } from '../composables/useInputMapping.js'
import { useAuth } from '../composables/useAuth.js'
import { usePlayerRom } from '../composables/player/usePlayerRom.js'
import { useResourceLoadProgress } from '../composables/player/useResourceLoadProgress.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { useCheats } from '../composables/player/useCheats.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerActionsPlacement } from '../composables/player/usePlayerActionsPlacement.js'
import { useVirtualPadOpacity } from '../composables/useVirtualPadOpacity.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import { useFullscreen } from '../composables/useFullscreen.js'
import { useTouchZoomGuard } from '../composables/useTouchZoomGuard.js'
import { usePerfOverlay } from '../composables/usePerfOverlay.js'
import { useLocalPlayerInput } from '../composables/player/solo/useLocalPlayerInput.js'
import { useFdsDiskSwap } from '../composables/player/useFdsDiskSwap.js'
import { useSoloPlayerActions } from '../composables/player/solo/useSoloPlayerActions.js'
import { useSoloPlayerLifecycle } from '../composables/player/solo/useSoloPlayerLifecycle.js'
import { coreDisplayName } from '../constants/cores.js'
import EmulatorPortal from '../components/emulator-portal/EmulatorPortal.vue'
import GameOverlay from '../components/emulator-portal/GameOverlay.vue'
import CheatDialog from '../components/emulator-portal/CheatDialog.vue'
import VirtualGamepad from '../components/emulator-portal/VirtualGamepad.vue'
import FullscreenButton from '../components/emulator-portal/FullscreenButton.vue'
import GameActionButtons from '../components/emulator-portal/GameActionButtons.vue'
import VirtualGamepadOpacityButton from '../components/emulator-portal/VirtualGamepadOpacityButton.vue'
import ResourceLoadingOverlay from '../components/emulator-portal/ResourceLoadingOverlay.vue'
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
  viewportWidth,
  viewportHeight,
  start: startViewport,
  stop: stopViewport,
} = usePlayerViewport()

// 资源加载进度：贯穿"读取游戏信息 → 载入核心/ROM/BIOS → 校验 → 初始化模拟器"。
const loadProgress = useResourceLoadProgress()

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
const canCheat = computed(() => !!rom.value && booted.value)
const showCheats = ref(false)

// 模拟器组件挂载条件（核心下载就是在它内部发起的）。
const portalActive = computed(() => !!rom.value && biosReady.value)
// 加载面板的显示规则：还没启动成功就一直显示；只有在"错误发生在模拟器挂载
// 之前"（例如 ROM 未找到）时才让位给错误卡片，避免两层遮罩互相覆盖。
const showLoadOverlay = computed(() => !booted.value && !(fatalError.value && !portalActive.value))

// 核心任务在选定核心后就登记：界面先知道"要下几个文件、总共多大"，
// 之后下载的字节进度会更新同一批任务。
watch(activeCore, (core) => {
  if (core) loadProgress.registerCoreTasks(core)
}, { immediate: true })

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

// FDS：换面 / 换盘。只有磁碟机游戏、且模拟器已经跑起来时才有意义。
const canUseFdsDisk = computed(() => booted.value && romMeta.value?.platform === 'fds')
const { swapDiskSide, changeDisk } = useFdsDiskSwap({ portalRef, enabled: canUseFdsDisk })

const {
  onBooted,
  onInputConfigReloaded,
  onReload,
  reloadPage,
  goBack,
  switchVersion,
  reloading,
} = useSoloPlayerActions({
  router,
  romMeta,
  versionMenuOpen,
  portalRef,
  booted,
  markBooted,
  showToast,
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

// 保存 / 读档 / 重置 / 金手指放在哪里：手机端浮到画面右上角（与「按键透明度」同侧），
// PC 宽屏排到画面右侧，窗口或缩放放不下时退回顶部工具条。规则见
// composables/player/usePlayerActionsPlacement.js。
const {
  variant: actionsPlacement,
  vertical: actionsVertical,
  sideColumnWidth,
} = usePlayerActionsPlacement({
  isTouchLayout,
  viewportWidth,
  viewportHeight,
  isFullscreen,
  isForcedLandscape,
})
// 只有在放不下、退回顶部工具条时，这组按钮才留在工具条里（side / mobile 都由页面另行渲染）
const showBarActions = computed(() => actionsPlacement.value === 'top')

// 虚拟手柄透明度：点一下压到 20% 让出画面，再点一下恢复（选择会记住）
const { dimmed: vpadDimmed, toggle: toggleVpadDimmed } = useVirtualPadOpacity()

// 手机端：防止连点按钮 / 双指同时按手柄被浏览器当成缩放手势（放大了就回不去）
const { isZoomed } = useTouchZoomGuard({
  target: () => playerRootRef.value,
  onZoomed: () => showToast('画面被放大了，双指捏合可还原', 3600),
})

// 排查手机端卡死用：地址后加 ?perf=1 才显示性能浮层
const { active: perfActive, stats: perfStats } = usePerfOverlay({
  enabled: typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf'),
})

const canReload = computed(() => !!rom.value && booted.value && !reloading.value)

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
  background: rgba(255, 252, 253, 0.96);
  border: 0;
  max-width: 320px;
  color: var(--text-primary);
  box-shadow: var(--clay-md);
}
.error-card p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; line-height: 1.5; font-weight: 700; }
.error-actions { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }

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
  /* 桌面端：右侧是图文按钮列（GameActionButtons 的 side 摆放）时，
     左边放一块等宽占位（.emu-side-spacer），画面（crt-screen）才会停在页面正中；
     列宽由 --side-actions-w 给出（usePlayerActionsPlacement 里的 sideColumnWidth）。 */
  .emu-area { padding: 16px 24px; gap: 16px; justify-content: center; }
  .emu-side-spacer { flex: 0 0 var(--side-actions-w, 176px); }
  .emu-frame {
    flex: 0 1 1100px;
    max-width: 1100px;
    max-height: calc(100vh - 32px);
    margin: 0;
    border-radius: var(--r-lg);
    border: 0;
    overflow: hidden;
    background: linear-gradient(180deg, #382C46 0%, #2A2138 100%);
  }
}
</style>
