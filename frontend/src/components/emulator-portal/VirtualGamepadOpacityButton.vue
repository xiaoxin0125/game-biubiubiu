<template>
  <!-- 手机端「按键透明度」按钮：贴在画面右上角，和左上角的全屏按钮分居两侧。
       点一下把整块虚拟手柄压到 20% 让出画面，再点一下恢复。 -->
  <button
    class="vpad-opacity-fab"
    :class="{ active: dimmed, 'is-fullscreen': fullscreen }"
    type="button"
    :aria-pressed="dimmed ? 'true' : 'false'"
    :aria-label="dimmed ? '恢复虚拟按键透明度' : '把虚拟按键调到 20% 透明度'"
    :title="dimmed ? '恢复虚拟按键透明度' : '虚拟按键透明度 20%'"
    @click.stop="$emit('toggle')"
  >
    <svg v-if="!dimmed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6.4 0 10 6 10 6a17.4 17.4 0 0 1-3.2 3.9" />
      <path d="M6.3 6.3C3.6 8.3 2 12 2 12s3.6 6 10 6c1 0 1.9-.1 2.8-.4" />
    </svg>
  </button>
</template>

<script setup>
defineProps({
  // 已经调成 20% 透明度
  dimmed: { type: Boolean, default: false },
  // 原生 / 伪全屏：顶部要避开刘海与状态栏，规则与全屏按钮一致
  fullscreen: { type: Boolean, default: false },
})

defineEmits(['toggle'])
</script>

<style scoped>
.vpad-opacity-fab {
  position: absolute;
  top: 10px;
  right: calc(10px + env(safe-area-inset-right));
  /* 高于加载 / 报错遮罩（z-index 10），低于虚拟手柄（30）。 */
  z-index: 20;
  width: 42px;
  height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-float-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: var(--text-primary);
  box-shadow: var(--clay-md);
  cursor: pointer;
  opacity: 0.66;
  transition: opacity var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.vpad-opacity-fab:focus-visible {
  outline: none;
  opacity: 1;
  box-shadow: var(--clay-focus);
}
@media (hover: hover) {
  .vpad-opacity-fab:hover { opacity: 1; transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
}
.vpad-opacity-fab:active {
  opacity: 1;
  transform: translateY(2px) var(--clay-squash);
  box-shadow: var(--clay-press-sm);
}
.vpad-opacity-fab.is-fullscreen { top: max(10px, env(safe-area-inset-top)); }
/* 已经压到 20% 时按钮自己亮起来，提醒用户可以再点一下恢复 */
.vpad-opacity-fab.active {
  opacity: 1;
  background: var(--clay-primary-grad);
  color: #fff;
}
</style>
