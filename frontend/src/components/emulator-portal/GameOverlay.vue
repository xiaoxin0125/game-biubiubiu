<template>
  <div class="player-bar">
    <button class="bar-btn" @click="$emit('back')" aria-label="返回">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      <span class="bar-btn-label">返回</span>
    </button>

    <div class="bar-center">
      <span class="bar-badge" :style="{ '--pc': platform.color }">{{ platform.label }}</span>
      <h2 class="bar-title">{{ title }}</h2>
      <span v-if="coreName" class="bar-core">{{ coreName }}</span>
      <span class="playing-led" title="游戏运行中">
        <span class="led-dot"></span>PLAYING
      </span>
      <!-- 联机房间里把房间名摆在运行指示后面：点名字复制房间码。
           手机端顶栏放不下，靠媒体查询把这一块收起来（房间面板标题里仍看得到）。 -->
      <RoomNameCopy
        v-if="roomName"
        :code="roomCode"
        class="bar-room"
      >{{ roomName }}</RoomNameCopy>
    </div>

    <slot name="extras" />

    <GameActionButtons
      v-if="showActions"
      variant="top"
      :can-save="canSave"
      :can-reload="canReload"
      :can-cheat="canCheat"
      :show-keys="showKeys"
      :can-swap-disk="canSwapDisk"
      :can-change-disk="canChangeDisk"
      @save-state="$emit('save-state')"
      @load-state="$emit('load-state')"
      @reload="$emit('reload')"
      @cheats="$emit('cheats')"
      @keys="$emit('keys')"
      @swap-disk-side="$emit('swap-disk-side')"
      @change-disk="$emit('change-disk')"
    />

    <button v-if="canFullscreen && showFullscreen" class="bar-btn bar-btn-accent" @click="$emit('fullscreen')" aria-label="全屏">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
      <span class="bar-btn-label">全屏</span>
    </button>
  </div>
</template>

<script setup>
import GameActionButtons from './GameActionButtons.vue'
import RoomNameCopy from '../RoomNameCopy.vue'

defineProps({
  title: String,
  platform: { type: Object, required: true },
  coreName: String,
  // 联机房间里显示的房间名与房间码：名字摆在 PLAYING 后面，点一下复制房间码
  roomName: { type: String, default: '' },
  roomCode: { type: String, default: '' },
  canSave: { type: Boolean, default: true },
  canReload: { type: Boolean, default: false },
  canCheat: { type: Boolean, default: false },
  showKeys: { type: Boolean, default: true },
  // 触屏设备改用画面左上角的悬浮全屏按钮，工具条上这颗就收起来
  showFullscreen: { type: Boolean, default: true },
  // 手机端与 PC 宽屏把这组按钮挪到画面旁边（GameActionButtons 的 mobile / side），
  // 工具条上就不再重复出现
  showActions: { type: Boolean, default: true },
  // FDS 专用：换面 / 换盘。顶部工具条里也是同一组按钮，所以同样要透传
  // （PC 窄屏、页面缩放到放不下侧栏时，这组按钮就退回这里）。
  canSwapDisk: { type: Boolean, default: false },
  canChangeDisk: { type: Boolean, default: false },
})
defineEmits(['back', 'fullscreen', 'keys', 'save-state', 'load-state', 'reload', 'cheats', 'swap-disk-side', 'change-disk'])

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const hasFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)
const canFullscreen = hasFs && !isIOS
</script>

<style scoped>
/* Clay chrome bar — 顶部工具条沿用粘土表面，与全站一致。 */
.player-bar {
  --b-bg:        var(--clay-float-surface);
  --b-border:    transparent;
  --b-btn-bg:    var(--clay-inset-surface);
  --b-btn-hover: var(--clay-surface-alt);
  --b-text:      var(--text-primary);
  --b-muted:     var(--text-secondary);
  --b-tertiary:  var(--text-tertiary);

  /* Always visible — takes its own row in the .player-page flex column, so
     the canvas below sizes itself to the remaining viewport. */
  flex-shrink: 0;
  position: relative;
  z-index: 5;

  display: flex;
  align-items: center;
  gap: 8px;
  padding:
    calc(8px + env(safe-area-inset-top))
    calc(12px + env(safe-area-inset-right))
    8px
    calc(12px + env(safe-area-inset-left));
  background: var(--b-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: var(--b-text);
  border-bottom: 0;
  box-shadow: var(--clay-sm);
}

.bar-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  overflow: hidden;
  min-width: 0;
}
.bar-badge {
  --pc: var(--accent);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 900;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  /* 平台色仅做浅底，文字用墨色版本保证 ≥ 4.5:1 */
  color: color-mix(in srgb, var(--pc) 40%, var(--clay-ink));
  background: color-mix(in srgb, var(--pc) 16%, #fff);
  box-shadow: var(--clay-xs);
  letter-spacing: 0.02em;
  line-height: 1.4;
}
.bar-title {
  font-size: 14px;
  font-weight: 900;
  color: var(--b-text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.bar-core {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
  color: var(--b-tertiary);
  flex-shrink: 0;
}
/* "PLAYING" indicator — 粘土薄荷徽章 */
.playing-led {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  background: var(--clay-mint);
  color: var(--text-mint);
  font-size: 11px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.led-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--sys-green);
  box-shadow: 0 0 0 3px rgba(95, 196, 143, 0.22);
  animation: led-pulse 1.6s var(--clay-ease) infinite;
}
@keyframes led-pulse {
  0%, 100% { transform: scaleX(1) scaleY(1); opacity: 1; }
  50%      { transform: scaleX(0.8) scaleY(1.2); opacity: 0.6; }
}
/* 房间名：联机房间里它比游戏名更该被一眼看到，做成糖果粉胶囊 + 点一下复制房间码 */
.bar-room {
  flex: 0 1 auto;
  max-width: 42%;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  background: var(--clay-pink-soft);
  color: #7A3D5C;
  font-size: 12px;
  box-shadow: var(--clay-xs);
  --name-copy-hint: 0.6;
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.bar-room:hover {
  color: #6C2039;
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.bar-room:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }

@media (max-width: 640px) {
  .playing-led { display: none; }
}

.bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  min-height: 34px;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--b-btn-bg);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
  flex-shrink: 0;
}
.bar-btn:hover {
  background: var(--b-btn-hover);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.bar-btn:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.bar-btn:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.bar-btn-accent {
  background: var(--clay-primary-grad);
  border-color: transparent;
  color: #fff;
}
.bar-btn-accent:hover {
  background: var(--clay-pink-soft);
  color: #6C2039;
}

@media (max-width: 768px) {
  .bar-btn-label { display: none; }
  .bar-btn { padding: 8px; min-width: 36px; min-height: 36px; }
  .bar-title { font-size: 12px; }
  .bar-badge { padding: 1px 6px; font-size: 10px; }
  .bar-core, .playing-led { display: none; }
  /* 手机端顶栏地方有限：房间名收起来，平台标签与游戏名（ROM 名）照常显示。
     房间名在房间面板标题里仍看得到，点它照样复制房间码。
     房间名是 RoomNameCopy 的根元素，它自己带着 display: inline-flex，
     同优先级下按样式表顺序分胜负，所以这里用 :deep 提一级才盖得住。 */
  .bar-center :deep(.bar-room) { display: none; }
  .player-bar {
    gap: 5px;
    padding:
      calc(5px + env(safe-area-inset-top))
      calc(8px + env(safe-area-inset-right))
      5px
      calc(8px + env(safe-area-inset-left));
  }
}
@media (max-height: 500px) and (orientation: landscape) {
  .player-bar {
    gap: 4px;
    padding:
      calc(2px + env(safe-area-inset-top))
      calc(8px + env(safe-area-inset-right))
      2px
      calc(8px + env(safe-area-inset-left));
  }
  .bar-btn { min-height: 28px; min-width: 28px; padding: 2px 6px; }
  .bar-title { font-size: 11px; }
  /* 横屏手机同样收掉房间名（顶栏更清爽），其余标签照旧 */
  .bar-badge, .bar-core, .playing-led { display: none; }
  .bar-center :deep(.bar-room) { display: none; }
}
</style>
