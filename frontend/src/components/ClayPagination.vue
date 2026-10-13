<template>
  <nav
    ref="container"
    class="pagination"
    :class="{ dense: layout.dense }"
    :aria-label="ariaLabel"
    :style="navStyle"
  >
    <button class="page-btn page-icon" type="button" aria-label="上一页" title="上一页" :disabled="current <= 1" @click="changePage(current - 1)">
      <span aria-hidden="true">‹</span>
    </button>
    <template v-for="(item, index) in layout.items" :key="`${item}-${index}`">
      <span v-if="item === 'ellipsis'" class="pagination-ellipsis" :style="itemStyle(item)" aria-hidden="true">···</span>
      <button
        v-else
        class="page-btn page-number"
        :class="{ active: item === current }"
        :style="itemStyle(item)"
        :aria-label="`第 ${item} 页`"
        :aria-current="item === current ? 'page' : undefined"
        type="button"
        @click="changePage(item)"
      >{{ item }}</button>
    </template>
    <button class="page-btn page-icon" type="button" aria-label="下一页" title="下一页" :disabled="current >= pageCount" @click="changePage(current + 1)">
      <span aria-hidden="true">›</span>
    </button>
    <button v-if="layout.showJump" class="page-btn page-jump" type="button" aria-haspopup="dialog" :disabled="jumping" @click="jumpToPage">跳转</button>
  </nav>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { paginationItemWidth, paginationLayout, pageInputError } from '../composables/pagination.js'
import { useAppDialog } from '../composables/useAppDialog.js'

const props = defineProps({
  modelValue: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  ariaLabel: { type: String, default: '分页' },
})
const emit = defineEmits(['update:modelValue'])
const { showPrompt } = useAppDialog()
const container = ref(null)
const availableWidth = ref(320)
const jumping = ref(false)
const current = computed(() => Math.min(Math.max(props.modelValue, 1), props.pageCount))
const layout = computed(() => paginationLayout(current.value, props.pageCount, availableWidth.value))
const navStyle = computed(() => {
  const { profile } = layout.value
  return {
    '--page-gap': `${profile.gap}px`,
    '--page-font': `${profile.font}px`,
    '--page-control-font': `${profile.controlFont}px`,
    '--page-control-width': `${profile.control}px`,
    '--page-jump-width': `${profile.jump}px`,
  }
})
let observer = null
let disposed = false

function itemStyle(item) {
  return { width: `${paginationItemWidth(item, layout.value.profile)}px` }
}

function measure() {
  const width = container.value?.getBoundingClientRect().width
  if (width > 0) availableWidth.value = width
}

function changePage(page) {
  emit('update:modelValue', Math.min(Math.max(page, 1), props.pageCount))
}

async function jumpToPage() {
  if (jumping.value) return
  jumping.value = true
  try {
    const input = await showPrompt(`请输入要跳转的页码（1 - ${props.pageCount}）`, {
      title: '跳转页面',
      confirmText: '跳转',
      inputLabel: '页码',
      inputMode: 'numeric',
      defaultValue: current.value,
      validate: (value) => pageInputError(value, props.pageCount),
    })
    if (input !== null && !disposed) changePage(Number(input))
  } finally {
    jumping.value = false
  }
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(container.value)
  } else {
    window.addEventListener('resize', measure)
  }
})
onActivated(measure)
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<style scoped>
.pagination {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: var(--page-gap);
  width: 100%;
  min-width: 0;
  margin-top: 24px;
  white-space: nowrap;
}
.page-btn, .pagination-ellipsis {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0;
  font-size: var(--page-font);
  font-weight: 900;
}
.page-btn {
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease);
}
.page-btn:hover:not(:disabled) { color: var(--text-primary); transform: translateY(-3px); box-shadow: var(--clay-lift-shadow); }
.page-btn:active:not(:disabled) { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.page-btn:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.page-btn:disabled { opacity: 0.45; cursor: default; }
.page-btn.active { background: var(--clay-primary-grad); color: #6C2039; box-shadow: var(--clay-sm); }
.page-number { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
/* 上一页 / 下一页：只有箭头，没有文字 */
.page-icon { width: var(--page-control-width); font-size: var(--page-control-font); line-height: 1; }
.page-jump { width: var(--page-jump-width); }
.pagination-ellipsis { color: var(--text-tertiary); }
</style>
