<template>
  <Teleport to="body">
    <div class="mask" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="`${rom.title} 封面大图`">
        <header class="dh">
          <h3>{{ rom.title }}</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" aria-label="关闭" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <!-- 大图保持原始比例（contain），不做裁切；没有封面或图片打不开时退回默认卡带图 -->
        <div class="preview">
          <RomCover :rom="rom" class="preview-cover" />
        </div>

        <p class="foot">
          <span class="plat" :style="{ background: platformColor }"></span>
          {{ platformLabel }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { getPlatform } from '../constants/platforms.js'
import RomCover from './RomCover.vue'

const props = defineProps({
  rom: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const platformLabel = computed(() => getPlatform(props.rom.platform).displayName)
const platformColor = computed(() => getPlatform(props.rom.platform).color)

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.mask {
  position: fixed; inset: 0;
  background: rgba(94, 58, 84, 0.30);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 只看一张图，弹窗按内容收窄：大图自己定宽高，面板不再拉满 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: auto;
  max-width: calc(100vw - 40px);
  max-height: 90vh;
  overflow: hidden;
  padding-bottom: 16px;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.2s var(--ease-spring);
}
@keyframes popIn { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

.dh {
  align-self: stretch;
  padding: 18px 56px 12px 22px;
  background: var(--clay-surface-flat);
}
.dh h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.dlg-close { position: absolute; top: 12px; right: 12px; }

.preview { padding: 16px 22px 0; }
.preview-cover {
  /* 上限压在 300px：够看清封面，又不至于占满屏幕（手机端跟着视口缩） */
  --cover-size: min(66vw, 42vh, 300px);
  --cover-radius: var(--r-xl);
  --cover-fit: contain;
}

.foot {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0 22px;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 800;
}
.plat {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .dh { padding: 16px 50px 10px 18px; }
  .preview { padding: 14px 18px 0; }
  .foot { padding: 0 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .mask, .dialog { animation: none; }
}
</style>
