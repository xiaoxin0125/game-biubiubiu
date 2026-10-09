<template>
  <span
    class="rom-cover"
    :class="{ 'has-image': showImage }"
    :style="{ '--pc': platformColor }"
  >
    <img
      v-if="showImage"
      :src="coverSrc"
      :alt="altText"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <svg v-else class="rom-cover-art" viewBox="0 0 64 64" aria-hidden="true">
      <rect class="cd-bg" x="0" y="0" width="64" height="64" rx="18" />
      <rect class="cd-body" x="19" y="11" width="26" height="42" rx="8" />
      <rect class="cd-screen" x="24" y="16" width="16" height="11" rx="3" />
      <rect class="cd-line" x="24" y="31" width="16" height="3" rx="1.5" />
      <rect class="cd-line cd-line-2" x="24" y="37" width="10" height="3" rx="1.5" />
      <circle class="cd-dot" cx="32" cy="45" r="2.4" />
      <circle class="cd-dot cd-dot-2" cx="32" cy="48.5" r="2.4" />
    </svg>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getPlatform } from '../constants/platforms.js'

const props = defineProps({
  // 传整个 ROM 对象（后端序列化结果）即可，也可用 src/platform/alt 单独指定
  rom: { type: Object, default: null },
  src: { type: String, default: '' },
  platform: { type: String, default: '' },
  alt: { type: String, default: '' },
})

const failed = ref(false)

const coverSrc = computed(() => props.src || props.rom?.coverUrl || '')
const platformId = computed(() => props.platform || props.rom?.platform || '')
const platformColor = computed(() => getPlatform(platformId.value).color || 'var(--accent)')
const altText = computed(() => props.alt || (props.rom?.title ? `${props.rom.title} 封面` : 'ROM 封面'))
const showImage = computed(() => !!coverSrc.value && !failed.value)

// 换封面（编辑后 URL 变化）时重置加载失败状态
watch(coverSrc, () => { failed.value = false })
</script>

<style scoped>
.rom-cover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--cover-size, 44px);
  height: var(--cover-size, 44px);
  overflow: hidden;
  border-radius: var(--cover-radius, var(--r-md));
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-sm);
  color: var(--pc, var(--accent));
}
.rom-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 默认封面：粘土底 + 卡带图形，颜色跟随平台色 */
.rom-cover-art { display: block; width: 100%; height: 100%; }
.cd-bg { fill: color-mix(in srgb, currentColor 16%, #fff); }
.cd-body { fill: var(--clay-surface-flat); }
.cd-screen { fill: currentColor; opacity: 0.92; }
.cd-line { fill: currentColor; opacity: 0.34; }
.cd-line-2 { opacity: 0.2; }
.cd-dot { fill: currentColor; opacity: 0.4; }
.cd-dot-2 { opacity: 0.22; }
</style>
