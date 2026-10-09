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
    </div>

    <slot name="extras" />

    <button v-if="canSave" class="bar-btn" @click="$emit('save-state')" aria-label="存档" title="快速存档">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    </button>
    <button v-if="canSave" class="bar-btn" @click="$emit('load-state')" aria-label="读档" title="读取存档">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    </button>
    <button v-if="canReload" class="bar-btn" @click="$emit('reload')" aria-label="重载游戏" title="重载游戏（重新启动模拟器）">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.51-7.13"/><polyline points="21 3 21 9 15 9"/></svg>
    </button>
    <button v-if="canCheat" class="bar-btn" @click="$emit('cheats')" aria-label="金手指" title="金手指">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="2.6"/></svg>
    </button>
    <button v-if="showKeys" class="bar-btn bar-btn-keys" @click="$emit('keys')" aria-label="按键设置" title="按键设置">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>
    </button>
    <button v-if="canFullscreen" class="bar-btn bar-btn-accent" @click="$emit('fullscreen')" aria-label="全屏">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
      <span class="bar-btn-label">全屏</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  platform: { type: Object, required: true },
  coreName: String,
  canSave: { type: Boolean, default: true },
  canReload: { type: Boolean, default: false },
  canCheat: { type: Boolean, default: false },
  showKeys: { type: Boolean, default: true },
})
defineEmits(['back', 'fullscreen', 'keys', 'save-state', 'load-state', 'reload', 'cheats'])

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
  .bar-badge, .bar-core, .playing-led { display: none; }
}
</style>
