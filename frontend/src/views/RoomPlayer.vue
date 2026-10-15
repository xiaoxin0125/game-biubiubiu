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
      @reload="reloadGame"
      @cheats="showCheats = true"
      @swap-disk-side="swapDiskSide"
      @change-disk="changeDisk"
    >
      <template #extras>
        <!-- 房间里的玩家列表 / 房间面板入口：顶部工具条的最末端。
             房间内不再提供 ROM 版本选择。 -->
        <button v-if="isRoomMode" class="room-chip" :class="{ active: showRoom }" @click="showRoom = !showRoom" title="房间">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span class="chip-count">{{ Object.keys(signalPeers).length }}</span>
        </button>
      </template>
    </GameOverlay>

    <div class="emu-area" :style="{ '--side-actions-w': sideColumnWidth }">
      <!-- 右侧按钮列的等宽占位：左右对称，画面（crt-screen）才会停在页面正中 -->
      <div v-if="actionsPlacement === 'side'" class="emu-side-spacer" aria-hidden="true"></div>
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
          :engine="isJ2me && isHostMode ? engineChoice : null"
          :cloud-save="cloudSave"
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

        <!-- 手机端：保存 / 读档 / 重置 / 金手指与「按键透明度」按钮同侧（画面右上角），
             竖屏横排，横屏与全屏改成竖排（房间内只有房主能看到这几颗） -->
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
          @reload="reloadGame"
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
        @reload="reloadGame"
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

    <!-- Virtual pad: host/solo on touch devices, or room players with control seats. -->
    <VirtualGamepad
      v-if="shouldShowVirtualGamepad"
      :platform="romMeta?.platform"
      :landscape-rotate="isForcedLandscape"
      :dimmed="vpadDimmed"
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

    <!-- J2ME：房主开局（以及换类库重开）前的兼容库选择。客人看画面流，不弹。 -->
    <J2meEngineDialog
      v-if="engineDialogOpen && isHostMode === true"
      :title="displayName"
      :model-value="engineChoice"
      :mode="engineDialogMode"
      @confirm="confirmEngine"
      @close="closeEngineDialog"
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
import { usePlayRecord } from '../composables/player/usePlayRecord.js'
import { useSaveState } from '../composables/player/useSaveState.js'
import { useCheats } from '../composables/player/useCheats.js'
import { useGuestInputForwarding } from '../composables/player/useGuestInputForwarding.js'
import { usePlayerUi } from '../composables/player/usePlayerUi.js'
import { usePlayerViewport } from '../composables/player/usePlayerViewport.js'
import { usePlayerActionsPlacement } from '../composables/player/usePlayerActionsPlacement.js'
import { useVirtualPadOpacity } from '../composables/useVirtualPadOpacity.js'
import { usePlayerEmulatorConfig } from '../composables/player/usePlayerEmulatorConfig.js'
import { useJ2meCloudSave } from '../composables/player/useJ2meCloudSave.js'
import { isJ2mePlatform, readJ2meEngine, writeJ2meEngine, J2ME_ENGINE_CHOICES } from '../composables/player/j2meEngines.js'
import { usePlayerRoomRuntime } from '../composables/player/usePlayerRoomRuntime.js'
import { useFullscreen } from '../composables/useFullscreen.js'
import { useTouchZoomGuard } from '../composables/useTouchZoomGuard.js'
import { usePerfOverlay } from '../composables/usePerfOverlay.js'
import { dispatchArcadeNetplayInput, isArcadeNetplayInputEnabled, arcadeNetplayGuestKeyboardPlayer } from '../composables/player/arcadeNetplayInput.js'
import { useRoomTurboTargets } from '../composables/player/room/useRoomTurboTargets.js'
import { useRoomPlayerInput } from '../composables/player/room/useRoomPlayerInput.js'
import { useFdsDiskSwap } from '../composables/player/useFdsDiskSwap.js'
import { useRoomPlayerActions } from '../composables/player/room/useRoomPlayerActions.js'
import { useRoomPlayerLifecycle } from '../composables/player/room/useRoomPlayerLifecycle.js'
import EmulatorPortal from '../components/emulator-portal/EmulatorPortal.vue'
import GameOverlay from '../components/emulator-portal/GameOverlay.vue'
import CheatDialog from '../components/emulator-portal/CheatDialog.vue'
import VirtualGamepad from '../components/emulator-portal/VirtualGamepad.vue'
import FullscreenButton from '../components/emulator-portal/FullscreenButton.vue'
import GameActionButtons from '../components/emulator-portal/GameActionButtons.vue'
import VirtualGamepadOpacityButton from '../components/emulator-portal/VirtualGamepadOpacityButton.vue'
import RoomPanel from '../components/emulator-portal/RoomPanel.vue'
import ResourceLoadingOverlay from '../components/emulator-portal/ResourceLoadingOverlay.vue'
import J2meEngineDialog from '../components/J2meEngineDialog.vue'
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
  viewportWidth,
  viewportHeight,
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
  rom,
  bios,
  biosReady,
  platformInfo,
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
// 房间不给存档 / 读档按钮：J2ME 的存档跟着 ROM 自动进出云端（房主登录时），
// 其余平台照旧（房主 + 登录）。
const canSaveState = computed(() => isAuthed.value && signalMe.value?.isHost === true && !isJ2me.value)

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
// J2ME 还要等房主在开局弹窗里选完兼容库（enginemode）。
const isJ2me = computed(() => isJ2mePlatform(romMeta.value?.platform))
const engineChoice = ref('')
const engineDialogOpen = ref(false)
const engineDialogMode = ref('start')
const engineConfirmed = ref(false)

watch([isJ2me, isHostMode, () => romMeta.value?.id], ([j2me, host, romId]) => {
  if (!j2me || host !== true || romId == null) return
  engineChoice.value = readJ2meEngine(romId)
  engineDialogMode.value = 'start'
  engineDialogOpen.value = true
}, { immediate: true })

function confirmEngine(engine) {
  const previous = engineChoice.value
  const restarting = engineDialogMode.value === 'restart'
  engineChoice.value = engine
  engineDialogOpen.value = false
  engineDialogMode.value = 'start'
  writeJ2meEngine(romMeta.value?.id, engine)
  if (!restarting) { engineConfirmed.value = true; return }
  if (engine === previous) void onReload()
}

function closeEngineDialog() {
  if (engineDialogMode.value === 'restart') { engineDialogOpen.value = false; engineDialogMode.value = 'start'; return }
  // 开局这一步不能取消：默认用上次那一档（或兼容库）直接开局。
  confirmEngine(engineChoice.value || J2ME_ENGINE_CHOICES[0].id)
}

function reloadGame() {
  if (isJ2me.value) {
    engineDialogMode.value = 'restart'
    engineDialogOpen.value = true
    return
  }
  void onReload()
}

const portalActive = computed(() => isHostMode.value === true && !!rom.value && biosReady.value
  && (engineConfirmed.value || !isJ2me.value))
// 客人（以及还没确定角色的访客）看的是主机画面，不该出现"本地资源"进度。
const guestViewActive = computed(() => isRoomMode && isHostMode.value !== true)
// 加载面板显示规则：没启动成功就一直显示；错误发生在模拟器挂载之前时让位给错误卡片。
const showLoadOverlay = computed(() =>
  !booted.value && !guestViewActive.value && !(fatalError.value && !portalActive.value))

// 核心一选定就登记任务，界面先知道要下几个文件、共多大。J2ME 等房主选完类库再登记。
watch([activeCore, isHostMode, engineConfirmed], ([core, host, confirmed]) => {
  if (!core || host !== true) return
  if (isJ2me.value && !confirmed) return
  loadProgress.registerCoreTasks(core, { engine: isJ2me.value ? engineChoice.value : null })
}, { immediate: true })

// J2ME 的存档跟着 ROM 走：房主登录时开局读云存档、运行中自动上传，客人不接
// （客人那边跑的是画面流，没有本地文件系统）。
const { cloudSave } = useJ2meCloudSave({
  romMeta,
  isAuthed,
  isGuestMode,
  showToast,
  enabled: computed(() => isHostMode.value === true),
})

// 联机房里只有房主会在本地启动核心（客人看的是房间画面流），所以 @booted 只在
// 房主这一侧触发：这次游玩记在房主头上，客人不进这份统计。
const { recordPlay } = usePlayRecord({ romMeta })
watch(booted, (value) => { if (value) recordPlay() })

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
  // 远端席位的键位表：房主按到这些键要吞掉（远端只认 RTC 注入）。
  remoteKeyMaps: resolvedRemotePlayerKeyMaps,
})

// FDS：换面 / 换盘。磁碟机在房主这一侧，与重置 / 金手指一样只对房主开放
// （客人的按键是转发给 core 的，但磁盘动作改的是房主的虚拟磁碟机，不跟着转发）。
const canUseFdsDisk = computed(() => canControlEmulator.value && romMeta.value?.platform === 'fds')
const { swapDiskSide, changeDisk } = useFdsDiskSwap({ portalRef, enabled: canUseFdsDisk })

const {
  onBooted,
  onInputConfigReloaded,
  onReload,
  reloadPage,
  goBack,
  reloading,
} = useRoomPlayerActions({
  router,
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

