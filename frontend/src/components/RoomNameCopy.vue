<template>
  <button
    type="button"
    class="room-name"
    :class="{ copied }"
    :title="copied ? '已复制房间码' : `复制房间码 ${code}`"
    :aria-label="`复制房间码 ${code}`"
    @click.stop="onCopy"
    @keydown.enter.stop
    @keydown.space.stop
  >
    <span class="name-text"><slot>{{ name }}</slot></span>
    <span class="hint" aria-hidden="true">
      <svg v-if="copied" class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
    </span>
  </button>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { copyText } from '../composables/clipboard.js'

const props = defineProps({
  // 点名字复制的是房间码（名字好点、码不好抄）
  code: { type: String, required: true },
  // 不传 slot 时用这个当名字
  name: { type: String, default: '' },
})

const copied = ref(false)
let timer = null

async function onCopy() {
  if (!await copyText(props.code)) return
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 1500)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
/* 房间名本身就是复制按钮：平时安静，悬停时右侧的复制图标才亮起来，
   复制成功后换成对勾（不改名字文字，名字始终看得见）。
   放在可点击的卡片 / 列表行里时自己拦住点击与按键冒泡，免得顺手进了房间。 */
.room-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 900;
  line-height: 1.3;
  cursor: pointer;
  border-radius: var(--r-xs);
  transition: color var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
}
.room-name:hover { color: var(--ink-pink); }
.room-name:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint {
  display: inline-flex;
  flex-shrink: 0;
  /* 默认很淡：名字是主角，图标只是提示；父组件可用 --name-copy-hint 调亮 */
  opacity: var(--name-copy-hint, 0.32);
  transition: opacity var(--t-fast) var(--clay-ease);
}
.room-name:hover .hint,
.room-name:focus-visible .hint { opacity: 1; }
.room-name.copied .hint { opacity: 1; color: var(--success); }
.ico { display: block; }
</style>
