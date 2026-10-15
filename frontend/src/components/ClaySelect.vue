<template>
  <div class="clay-select" :class="{ 'is-open': open, 'is-disabled': disabled, flat }">
    <button
      :id="id"
      ref="trigger"
      type="button"
      class="clay-select-trigger"
      :class="{ 'is-placeholder': !selectedOption }"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
      @blur="onTriggerBlur"
    >
      <span class="clay-select-value">{{ selectedOption ? selectedOption.label : (placeholder || '请选择') }}</span>
      <span class="clay-select-arrow" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
    </button>

    <Teleport :to="panelTarget">
      <Transition name="clay-pop">
        <div
          v-if="open"
          ref="panel"
          class="clay-select-panel"
          :style="panelStyle"
          role="listbox"
          :aria-label="ariaLabel || undefined"
          @mousedown.prevent
        >
          <button
            v-for="(option, index) in normalizedOptions"
            :key="option.value"
            type="button"
            class="clay-option"
            :class="{ 'is-selected': option.value === modelValue, 'is-active': index === activeIndex }"
            role="option"
            :aria-selected="option.value === modelValue ? 'true' : 'false'"
            :disabled="option.disabled"
            @click="pick(option)"
            @mouseenter="activeIndex = index"
          >
            <span class="clay-option-label">{{ option.label }}</span>
            <svg v-if="option.value === modelValue" class="clay-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <div v-if="!normalizedOptions.length" class="clay-option-empty">没有可选项</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '请选择' },
  ariaLabel: { type: String, default: '' },
  id: { type: String, default: undefined },
  // 嵌在胶囊控件里的选择框：去掉自己的底色和外阴影
  flat: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])

const trigger = ref(null)
const panel = ref(null)
const open = ref(false)
const activeIndex = ref(-1)
const panelStyle = ref({})
// 原生全屏时浏览器只渲染全屏元素内部的内容，挂在 body 上的面板在全屏里会整个消失：
// 全屏中改挂进全屏元素（播放页容器）。面板用 position: fixed + 视口坐标定位，
// 播放页在原生全屏下没有 transform，坐标依旧对得上；不在全屏时照旧挂 body。
const panelTarget = ref('body')

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null
}

const normalizedOptions = computed(() => props.options
  .map((option) => {
    if (option === null || option === undefined) return null
    if (typeof option === 'object') {
      return { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? ''), disabled: !!option.disabled }
    }
    return { value: String(option), label: String(option), disabled: false }
  })
  .filter(Boolean))

const selectedOption = computed(() => normalizedOptions.value.find((option) => option.value === String(props.modelValue)) || null)

function toggle() {
  if (props.disabled) return
  open.value ? close() : openPanel()
}

async function openPanel() {
  open.value = true
  panelTarget.value = fullscreenElement() || 'body'
  const index = normalizedOptions.value.findIndex((option) => option.value === String(props.modelValue))
  activeIndex.value = index >= 0 ? index : firstEnabledIndex()
  await nextTick()
  positionPanel()
  window.addEventListener('scroll', positionPanel, true)
  window.addEventListener('resize', positionPanel, true)
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
}

function close() {
  if (!open.value) return
  open.value = false
  window.removeEventListener('scroll', positionPanel, true)
  window.removeEventListener('resize', positionPanel, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
}

// 点到面板和触发按钮之外就收起（触屏上不会触发 blur，需要这条兜底）
function onDocumentPointerDown(event) {
  const target = event.target
  if (panel.value && target instanceof Node && panel.value.contains(target)) return
  if (trigger.value && target instanceof Node && trigger.value.contains(target)) return
  close()
}

function firstEnabledIndex() {
  return normalizedOptions.value.findIndex((option) => !option.disabled)
}

// 面板宽度按内容自适应（width: max-content）：最长的那条选项也要完整摆下，所以不
// 再用触发器的宽度当面板宽度，否则「任天堂红白机 (FC / NES) 43」这种长条目会被
// 省略号截断。宽度由浏览器按内容算，落完样式再读回真实宽度把面板夹进视口；宽度
// 不小于触发器、不大于视口（视口也放不下时，才由选项自己的省略号兜底）。
// 每次定位带一个序号：连续滚动 / 缩放时，旧的测量结果不再覆盖新的定位。
let positionToken = 0

async function positionPanel() {
  const el = trigger.value
  // 注意别写成 `const panel = panel.value` —— 同名声明会遮蔽上面的模板 ref，取值时抛 TDZ
  const panelEl = panel.value
  if (!el || !panelEl || !open.value) return
  const token = (positionToken += 1)
  const rect = el.getBoundingClientRect()
  const gap = 8
  const maxHeight = 280
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const spaceAbove = rect.top - gap
  const flipUp = spaceBelow < Math.min(maxHeight, 180) && spaceAbove > spaceBelow
  const available = Math.max(120, Math.min(maxHeight, flipUp ? spaceAbove : spaceBelow))
  const maxWidth = Math.max(140, window.innerWidth - 16)
  panelStyle.value = {
    position: 'fixed',
    // 先按触发器左缘落一个近似位置（这时还没有面板宽度），读到真实宽度后再右对齐
    left: `${Math.round(Math.max(rect.left, 8))}px`,
    width: 'max-content',
    minWidth: `${Math.round(Math.min(rect.width, maxWidth))}px`,
    maxWidth: `${Math.round(maxWidth)}px`,
    maxHeight: `${Math.round(available)}px`,
    ...(flipUp ? { bottom: `${Math.round(window.innerHeight - rect.top + gap)}px` } : { top: `${Math.round(rect.bottom + gap)}px` }),
  }
  await nextTick()
  if (token !== positionToken || !open.value || !panelEl.isConnected) return
  const width = panelEl.getBoundingClientRect().width
  // 水平方向与触发器的右缘对齐：首页分类栏这类下拉框本来就挨着右边界，条目比触发器
  // 宽时向左展开，面板不会一头顶到屏幕上被推偏。面板太宽、左缘要出屏时，才退回
  // 「触发器左缘」并夹进视口（视口本身就放不下时，由选项的省略号兜底）。
  const maxLeft = Math.max(8, window.innerWidth - width - 8)
  const rightAlignedLeft = rect.right - width
  const left = rightAlignedLeft >= 8
    ? Math.min(rightAlignedLeft, maxLeft)
    : Math.min(Math.max(rect.left, 8), maxLeft)
  panelStyle.value = { ...panelStyle.value, left: `${Math.round(left)}px` }
}

function pick(option) {
  if (option.disabled) return
  if (option.value !== String(props.modelValue)) {
    emit('update:modelValue', option.value)
    emit('change', option.value)
  }
  close()
  trigger.value?.focus()
}

function moveActive(step) {
  const list = normalizedOptions.value
  if (!list.length) return
  let index = activeIndex.value
  for (let i = 0; i < list.length; i += 1) {
    index = (index + step + list.length) % list.length
    if (!list[index]?.disabled) break
  }
  activeIndex.value = index
}

function onKeydown(event) {
  const key = event.key
  if (key === 'Escape') {
    if (open.value) { event.stopPropagation(); close() }
    return
  }
  if (props.disabled) return
  if (!open.value) {
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      openPanel()
    }
    return
  }
  if (key === 'ArrowDown') { event.preventDefault(); moveActive(1) }
  else if (key === 'ArrowUp') { event.preventDefault(); moveActive(-1) }
  else if (key === 'Home') { event.preventDefault(); activeIndex.value = firstEnabledIndex() }
  else if (key === 'End') { event.preventDefault(); activeIndex.value = normalizedOptions.value.length - 1 }
  else if (key === 'Enter' || key === ' ') {
    event.preventDefault()
    const option = normalizedOptions.value[activeIndex.value]
    if (option) pick(option)
  } else if (key === 'Tab') {
    close()
  }
}

// 焦点移到面板外就收起来（面板用 mousedown.prevent 保持焦点在触发按钮上）
function onTriggerBlur() {
  window.setTimeout(() => {
    if (!open.value) return
    const active = document.activeElement
    if (panel.value && active && panel.value.contains(active)) return
    close()
  }, 0)
}

watch(() => props.disabled, (value) => { if (value) close() })
watch(() => normalizedOptions.value.length, () => { if (open.value) positionPanel() })

onBeforeUnmount(() => {
  window.removeEventListener('scroll', positionPanel, true)
  window.removeEventListener('resize', positionPanel, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<style scoped>
/* 触发器沿用站点的“粘土胶囊”外观：尺寸和配色通过 --select-* 变量从外部覆盖 */
.clay-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: var(--select-width, auto);
  min-width: 0;
  vertical-align: middle;
}
.clay-select-trigger {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: var(--select-height, 44px);
  min-height: var(--select-min-height, 44px);
  padding: var(--select-padding, 0 40px 0 18px);
  border: 0;
  border-radius: var(--r-pill);
  background: var(--select-bg, #FBF4F8);
  color: var(--select-color, var(--text-primary));
  font-family: inherit;
  font-size: var(--select-font-size, 14px);
  font-weight: 800;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--select-shadow, var(--clay-md));
  transition: box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
/* 下拉框不做悬停位移，避免指针滑过时控件移动导致误触 */
.clay-select-trigger:focus-visible { outline: none; box-shadow: var(--select-focus-shadow, var(--clay-focus)); }
.clay-select.is-open .clay-select-trigger { box-shadow: var(--select-focus-shadow, var(--clay-focus)); }
.clay-select.is-disabled .clay-select-trigger { opacity: 0.55; cursor: not-allowed; box-shadow: var(--clay-xs); }
.clay-select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.clay-select-trigger.is-placeholder .clay-select-value { color: var(--text-tertiary); font-weight: 700; }
.clay-select-arrow {
  position: absolute;
  top: 50%;
  right: var(--select-arrow-right, 16px);
  transform: translateY(-50%);
  display: inline-flex;
  color: var(--select-arrow-color, var(--text-secondary));
  transition: transform var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.clay-select.is-open .clay-select-arrow { transform: translateY(-50%) rotate(180deg); }

/* 嵌在胶囊控件里（如管理后台的“游玩人数 / 核心”）时不再自带底色和阴影 */
.clay-select.flat .clay-select-trigger {
  background: transparent;
  box-shadow: none;
  --select-arrow-right: 10px;
}
.clay-select.flat .clay-select-trigger:focus-visible,
.clay-select.flat.is-open .clay-select-trigger {
  box-shadow: var(--select-focus-shadow, inset 0 0 0 3px var(--accent-ring));
}

/* 展开的面板：粘土表面 + 超圆角，和站点其它面板一致 */
.clay-select-panel {
  z-index: 400;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 0;
  border-radius: var(--r-lg);
  background: var(--clay-surface);
  box-shadow: var(--clay-lg);
  scrollbar-width: none;
}
.clay-select-panel::-webkit-scrollbar { width: 0; height: 0; display: none; }

.clay-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: var(--select-font-size, 13px);
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
}
/* 悬停/键盘高亮：面板底色接近白色，薄涂一档梅子色并加一圈内描边，指针落到哪一项要一眼看清 */
.clay-option:hover:not(:disabled),
.clay-option.is-active:not(:disabled) {
  background: rgba(168, 82, 126, 0.13);
  box-shadow: inset 0 0 0 2px rgba(168, 82, 126, 0.16);
}

/* 已选中：只留更淡的水洗色 + 梅子色文字和勾，安静下来，不再和悬停抢注意力 */
.clay-option.is-selected { background: rgba(168, 82, 126, 0.07); color: var(--ink-pink); }

/* 悬停/定位到已选中项时加深一档，保持“这是当前值”的辨识，而不是把选中态盖掉 */
.clay-option.is-selected:hover:not(:disabled),
.clay-option.is-selected.is-active:not(:disabled) { background: rgba(168, 82, 126, 0.18); }
.clay-option:disabled { opacity: 0.45; cursor: not-allowed; }
.clay-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clay-option-check { flex-shrink: 0; color: var(--ink-pink); }
.clay-option-empty {
  padding: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.clay-pop-enter-active, .clay-pop-leave-active { transition: opacity var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease); }
.clay-pop-enter-from, .clay-pop-leave-to { opacity: 0; transform: translateY(-6px) scaleY(0.96); }
</style>
