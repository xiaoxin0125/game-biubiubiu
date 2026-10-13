<template>
  <Teleport to="body">
    <div v-if="activeDialog" class="dialog-mask" @click.self="cancelDialog">
      <section
        :key="activeDialog.id"
        ref="dialogElement"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        tabindex="-1"
      >
        <header class="dialog-head">
          <h3 id="app-dialog-title">{{ activeDialog.title }}</h3>
          <button type="button" class="btn btn-ghost btn-icon btn-sm dialog-close" aria-label="关闭" @click="cancelDialog">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>
        <form class="dialog-form" novalidate @submit.prevent="submitDialog(inputValue)">
          <div class="dialog-body">
            <p id="app-dialog-message" class="dialog-message">{{ activeDialog.message }}</p>
            <div v-if="activeDialog.type === 'prompt'" class="dialog-field">
              <label for="app-dialog-input" class="label">{{ activeDialog.inputLabel || '输入内容' }}</label>
              <input
                id="app-dialog-input"
                ref="inputElement"
                v-model="inputValue"
                class="input"
                type="text"
                :inputmode="activeDialog.inputMode || 'text'"
                :placeholder="activeDialog.placeholder"
                :aria-invalid="error ? 'true' : undefined"
                :aria-describedby="error ? 'app-dialog-message app-dialog-error' : 'app-dialog-message'"
                autocomplete="off"
              />
              <p v-if="error" id="app-dialog-error" class="dialog-error" role="alert">{{ error }}</p>
            </div>
          </div>
          <footer class="dialog-actions">
            <button v-if="activeDialog.type !== 'alert'" ref="cancelButton" type="button" class="btn" @click="cancelDialog">
              {{ activeDialog.cancelText }}
            </button>
            <button ref="confirmButton" type="submit" class="btn" :class="activeDialog.danger ? 'btn-danger' : 'btn-primary'">
              {{ activeDialog.confirmText }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useAppDialog } from '../composables/useAppDialog.js'

const { activeDialog, error, submitDialog, cancelDialog, cancelAll } = useAppDialog()
const dialogElement = ref(null)
const inputElement = ref(null)
const cancelButton = ref(null)
const confirmButton = ref(null)
const inputValue = ref('')
let previousFocus = null
let previousOverflow = ''
let locked = false

function focusInitial() {
  // 确认操作默认聚焦取消，避免按回车时误删；页码输入默认选中方便直接改写。
  const target = activeDialog.value?.type === 'prompt'
    ? inputElement.value
    : cancelButton.value || confirmButton.value
  target?.focus({ preventScroll: true })
}

function onFocusIn(event) {
  if (dialogElement.value && !dialogElement.value.contains(event.target)) focusInitial()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    cancelDialog()
    return
  }
  if (event.key !== 'Tab') return
  const elements = dialogElement.value?.querySelectorAll('button:not(:disabled), input:not(:disabled)')
  if (!elements?.length) return
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function releasePage() {
  if (!locked) return
  locked = false
  document.body.style.overflow = previousOverflow
  window.removeEventListener('keydown', onKeydown, true)
  document.removeEventListener('focusin', onFocusIn)
  const target = previousFocus
  previousFocus = null
  // 等调用方撤销按钮的 disabled 状态后再恢复焦点（例如页码跳转按钮）。
  nextTick(() => {
    if (!activeDialog.value && target?.isConnected) target.focus({ preventScroll: true })
  })
}

watch(activeDialog, async (dialog) => {
  if (!dialog) { releasePage(); return }
  if (!locked) {
    locked = true
    previousFocus = document.activeElement
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeydown, true)
    document.addEventListener('focusin', onFocusIn)
  }
  inputValue.value = String(dialog.defaultValue ?? '')
  await nextTick()
  if (activeDialog.value?.id !== dialog.id) return
  focusInitial()
  if (dialog.type === 'prompt') inputElement.value?.select()
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => { cancelAll(); releasePage() })
</script>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(94, 58, 84, 0.30);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: fadeIn 0.18s var(--ease-out);
}
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  max-height: 90dvh;
  overflow: hidden;
  background: var(--clay-surface);
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.2s var(--ease-spring);
}
.dialog-head { flex: 0 0 auto; padding: 22px 58px 12px 24px; background: var(--clay-surface-flat); }
.dialog-head h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }
.dialog-close { position: absolute; top: 14px; right: 14px; }
.dialog-form { display: flex; flex-direction: column; min-height: 0; }
.dialog-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px; }
.dialog-message { margin: 4px 0 0; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; }
.dialog-field { margin-top: 18px; }
.dialog-field .input { font-size: 16px; }
.dialog-error { margin: 8px 0 0; color: var(--error); font-size: 13px; }
.dialog-actions { flex: 0 0 auto; display: flex; justify-content: flex-end; gap: 10px; padding: 22px 24px; }
.dialog-actions .btn { min-width: 84px; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (max-width: 600px) {
  .dialog-mask { padding: 16px; }
  .dialog-head { padding-left: 20px; }
  .dialog-body { padding: 0 20px; }
  .dialog-actions { padding: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .dialog-mask, .dialog { animation: none; }
}
</style>
