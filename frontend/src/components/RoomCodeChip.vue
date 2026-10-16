<template>
  <button
    type="button"
    class="room-code"
    :class="{ copied }"
    :title="copied ? '已复制' : `复制房间码 ${code}`"
    :aria-label="`复制房间码 ${code}`"
    @click.stop="onCopy"
    @keydown.enter.stop
    @keydown.space.stop
  >
    <span class="code">{{ copied ? '已复制' : code }}</span>
    <svg v-if="copied" class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
    <svg v-else class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
  </button>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { copyText } from '../composables/clipboard.js'

const props = defineProps({
  code: { type: String, required: true },
})

const copied = ref(false)
let timer = null

// 复制成功后按钮自己变成「已复制」一秒多，不再弹窗打断玩家
async function onCopy() {
  if (!await copyText(props.code)) return
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 1500)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
/* 胶囊形的房间码，点了就复制。放在可点击的卡片 / 列表行里，所以自己拦住
   点击与按键的冒泡，免得顺手把房间打开。 */
.room-code {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 3px 9px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.room-code:hover { transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.room-code:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.room-code:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.room-code.copied { color: var(--text-mint); }
.ico { flex-shrink: 0; opacity: 0.7; }
.room-code.copied .ico { opacity: 1; }
</style>
