<template>
  <!-- 手机端全屏按钮：贴在画面左上角。父级需要 position: relative
       （播放页里就是 .emu-frame），全屏时同样停留在左上角，用来退出全屏。 -->
  <button
    class="fs-fab"
    :class="{ 'fs-fab-on': active }"
    type="button"
    :aria-label="active ? '退出全屏' : '全屏'"
    :title="active ? '退出全屏' : '全屏'"
    @click.stop="$emit('toggle')"
  >
    <svg v-if="!active" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
    <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  </button>
</template>

<script setup>
defineProps({
  // 已经处于全屏（原生或伪全屏）时显示「退出」图标
  active: { type: Boolean, default: false },
})
defineEmits(['toggle'])
</script>

<style scoped>
.fs-fab {
  position: absolute;
  top: 10px;
  left: calc(10px + env(safe-area-inset-left));
  /* 高于加载 / 报错遮罩（z-index 10），加载中也能进全屏；
     低于虚拟手柄（30）与各种弹层，避免抢交互。 */
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
  transition: opacity var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.fs-fab:active {
  opacity: 1;
  transform: translateY(2px) var(--clay-squash);
  box-shadow: var(--clay-press-sm);
}
.fs-fab:focus-visible { outline: none; opacity: 1; box-shadow: var(--clay-focus); }
@media (hover: hover) {
  .fs-fab:hover { opacity: 1; transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
}
/* 全屏时工具条已隐藏，这里让出刘海 / 状态栏的位置 */
.fs-fab-on {
  top: max(10px, env(safe-area-inset-top));
  opacity: 0.9;
}
</style>
