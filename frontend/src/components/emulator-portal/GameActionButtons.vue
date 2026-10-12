<template>
  <!-- 保存 / 读档 / 重置 / 金手指（桌面端还有按键设置）这组按钮的唯一实现。
       三种摆放方式由父组件按布局决定，组件本身只负责长什么样：
         mobile — 触屏设备：浮在画面右上角，与「按键透明度」按钮同侧；
         side   — 桌面宽屏：图文按钮竖排在画面（crt-screen）右侧，一行两个；
         top    — 桌面窄屏：退回顶部工具条，和以前一致。 -->
  <div
    v-if="hasActions"
    class="game-actions"
    :class="[`actions-${variant}`, { 'is-vertical': vertical, 'is-fullscreen': fullscreen }]"
  >
    <button
      v-if="canSave"
      class="game-action-btn"
      type="button"
      aria-label="保存"
      title="快速存档"
      @click="$emit('save-state')"
    >
      <svg class="game-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      <span class="game-action-label">保存</span>
    </button>

    <button
      v-if="canSave"
      class="game-action-btn"
      type="button"
      aria-label="读档"
      title="读取存档"
      @click="$emit('load-state')"
    >
      <svg class="game-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      <span class="game-action-label">读档</span>
    </button>

    <button
      v-if="canReload"
      class="game-action-btn"
      type="button"
      aria-label="重置"
      title="重置游戏（重新启动模拟器）"
      @click="$emit('reload')"
    >
      <svg class="game-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3.51-7.13"/><polyline points="21 3 21 9 15 9"/></svg>
      <span class="game-action-label">重置</span>
    </button>

    <button
      v-if="canCheat"
      class="game-action-btn"
      type="button"
      aria-label="金手指"
      title="金手指"
      @click="$emit('cheats')"
    >
      <svg class="game-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="2.6"/></svg>
      <span class="game-action-label">金手指</span>
    </button>

    <button
      v-if="showKeys"
      class="game-action-btn"
      type="button"
      aria-label="按键设置"
      title="按键设置"
      @click="$emit('keys')"
    >
      <svg class="game-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>
      <span class="game-action-label">按键设置</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  canSave: { type: Boolean, default: false },
  canReload: { type: Boolean, default: false },
  canCheat: { type: Boolean, default: false },
  showKeys: { type: Boolean, default: false },
  // mobile / side / top —— 摆放方式，见模板顶部注释
  variant: { type: String, default: 'top' },
  // 触屏设备横屏、全屏时改成竖向排布
  vertical: { type: Boolean, default: false },
  // 原生 / 伪全屏：顶部要避开刘海与状态栏，规则与全屏按钮一致
  fullscreen: { type: Boolean, default: false },
})

defineEmits(['save-state', 'load-state', 'reload', 'cheats', 'keys'])

const hasActions = computed(() => props.canSave || props.canReload || props.canCheat || props.showKeys)
</script>

<style scoped>
.game-actions { min-width: 0; }

.game-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  min-height: 34px;
  padding: 5px 12px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.game-action-btn:hover {
  background: var(--clay-surface-alt);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.game-action-btn:active {
  transform: translateY(2px) var(--clay-squash);
  box-shadow: var(--clay-press-sm);
}
.game-action-btn:focus-visible {
  outline: none;
  box-shadow: var(--clay-focus);
}
.game-action-icon { width: 16px; height: 16px; flex: 0 0 auto; }
.game-action-label { white-space: nowrap; line-height: 1.2; }

/* ===== top：顶部工具条里的紧凑图标按钮（桌面窄屏的兜底，和以前一致） ===== */
.actions-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.actions-top .game-action-label { display: none; }

/* ===== side：画面右侧的图文按钮 ===== */
.actions-side {
  flex: 0 0 auto;
  /* 宽度由页面写进 --side-actions-w（值与 usePlayerActionsPlacement 里的列宽一致）：
     左侧有等宽占位，画面才能真正居中 */
  width: var(--side-actions-w, 176px);
  /* 顶部与画面（crt-screen）对齐，不再悬在右栏正中间 */
  align-self: flex-start;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.actions-side .game-action-btn {
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  min-height: 64px;
  padding: 8px 4px;
  border-radius: var(--r-lg);
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
}
.actions-side .game-action-icon { width: 19px; height: 19px; }
.actions-side .game-action-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

/* 窗口或页面缩放后两列排不开：收成一行一个，改成图标在左、文字在右的窄条目
   （列宽 138px 由 usePlayerActionsPlacement 同步给出） */
@media (max-width: 1199px) {
  .actions-side {
    grid-template-columns: minmax(0, 1fr);
  }
  .actions-side .game-action-btn {
    flex-direction: row;
    justify-content: flex-start;
    gap: 8px;
    min-height: 46px;
    padding: 0 14px;
    border-radius: var(--r-pill);
  }
}

/* ===== mobile：画面右上角的悬浮按钮，紧挨「按键透明度」按钮左侧 ===== */
.actions-mobile {
  position: absolute;
  top: 10px;
  right: calc(60px + env(safe-area-inset-right));
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  /* 容器本身不要吃触摸：空出来的地方让给画面 / 手柄 */
  pointer-events: none;
}
.actions-mobile.is-fullscreen { top: max(10px, env(safe-area-inset-top)); }
/* 横屏 / 全屏：竖排，并且与「按键透明度」按钮同列 —— 排在它正下方。
   42px（按钮高的「按键透明度」）+ 6px 间距 = 48px 正好是它的下沿；
   right 也换成与它同一个偏移，两者就在同一条竖线上。
   列底给右下角的虚拟手柄让位（ABXY 与肩键最高能顶到画面底部往上约 186px + 安全区），
   高度不够时按钮先自己收缩，不会叠到手柄按键上面。 */
.actions-mobile.is-vertical {
  top: calc(max(10px, env(safe-area-inset-top)) + 48px);
  bottom: calc(186px + env(safe-area-inset-bottom));
  right: calc(10px + env(safe-area-inset-right));
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.actions-mobile .game-action-btn {
  /* 尺寸与「按键透明度」按钮（42px）一致，同排时上下对齐 */
  width: 42px;
  height: 42px;
  min-width: 42px;
  min-height: 42px;
  padding: 0;
  background: var(--clay-float-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  opacity: 0.82;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
/* 竖排时收小一档：手机横屏只有 390 左右的高度，整列不能太占地方。
   min-height 是收缩的下限，低于它就不再压扁（宁可略微越过一点让位线）。 */
.actions-mobile.is-vertical .game-action-btn {
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 22px;
}
/* 手机横屏（高度 ≤ 420）再收一档，尺寸与工具条横屏下的紧凑按钮一致（28px） */
@media (max-height: 420px) {
  .actions-mobile.is-vertical {
    gap: 3px;
  }
  .actions-mobile.is-vertical .game-action-btn {
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 22px;
  }
}
.actions-mobile .game-action-label { display: none; }
.actions-mobile .game-action-btn:hover,
.actions-mobile .game-action-btn:active,
.actions-mobile .game-action-btn:focus-visible { opacity: 1; }
</style>
