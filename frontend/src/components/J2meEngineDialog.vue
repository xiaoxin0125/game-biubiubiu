<template>
  <Teleport to="body">
    <div class="dialog-mask" @click.self="$emit('close')">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="j2me-engine-title">
        <header class="dialog-head">
          <h3 id="j2me-engine-title">{{ mode === 'restart' ? '重新开始前的设置' : '选择兼容库与语言' }}</h3>
          <button type="button" class="btn btn-ghost btn-icon btn-sm dialog-close" aria-label="关闭" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <p class="dialog-message">
            <b>{{ title }}</b> 默认用覆盖面最广的一档。
          </p>
          <div class="choices" role="radiogroup" aria-labelledby="j2me-engine-title">
            <button
              v-for="choice in choices"
              :key="choice.id"
              type="button"
              class="choice"
              role="radio"
              :aria-checked="choice.id === selected ? 'true' : 'false'"
              :class="{ active: choice.id === selected }"
              @click="selected = choice.id"
            >
              <span class="radio" aria-hidden="true"><span v-if="choice.id === selected" class="dot" /></span>
              <span class="choice-text">
                <span class="choice-label">{{ choice.label }}</span>
                <span class="choice-note">{{ choice.note }}</span>
                <span class="choice-file">{{ choice.id }}</span>
              </span>
            </button>
          </div>

          <h4 class="section-title">游戏语言</h4>
          <p class="dialog-message">
            游戏按「设备语言」挑自己的语言包，缺失时会回退默认。
          </p>
          <div class="choices" role="radiogroup" aria-label="游戏语言">
            <button
              v-for="item in languageChoices"
              :key="item.id"
              type="button"
              class="choice"
              role="radio"
              :aria-checked="item.id === selectedLanguage ? 'true' : 'false'"
              :class="{ active: item.id === selectedLanguage }"
              @click="selectedLanguage = item.id"
            >
              <span class="radio" aria-hidden="true"><span v-if="item.id === selectedLanguage" class="dot" /></span>
              <span class="choice-text">
                <span class="choice-label">{{ item.label }}</span>
                <span class="choice-note">{{ item.note }}</span>
              </span>
            </button>
          </div>
        </div>

        <footer class="dialog-actions">
          <button v-if="mode === 'restart'" type="button" class="btn" @click="$emit('close')">取消</button>
          <button type="button" class="btn btn-primary" @click="$emit('confirm', { engine: selected, language: selectedLanguage })">
            {{ mode === 'restart' ? '用这一档重新开始' : '开始游戏' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { J2ME_ENGINE_CHOICES } from '../composables/player/j2meEngines.js'
import { J2ME_LANGUAGE_CHOICES } from '../composables/player/j2meLanguage.js'

const props = defineProps({
  title: { type: String, default: '这个游戏' },
  // 上次选的（或默认的）那一档：弹窗一开就预选它，回头客直接点「开始游戏」。
  modelValue: { type: String, required: true },
  // 上次选的（或默认的）游戏语言：'auto' = 跟随浏览器语言。
  language: { type: String, default: 'auto' },
  // 'start' = 开局前第一次选；'restart' = 已经开着这一局，换个类库/语言重开。
  mode: { type: String, default: 'start' },
})
defineEmits(['confirm', 'close'])

const choices = J2ME_ENGINE_CHOICES
const languageChoices = J2ME_LANGUAGE_CHOICES
const selected = ref(props.modelValue)
const selectedLanguage = ref(props.language)
watch(() => props.modelValue, (value) => { selected.value = value })
watch(() => props.language, (value) => { selectedLanguage.value = value })
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
  max-width: 460px;
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
.dialog-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px; }
.dialog-message { margin: 4px 0 0; color: var(--text-secondary); line-height: 1.8; }
.dialog-message b { color: var(--text-primary); }
.section-title { margin: 24px 0 0; font-size: 15px; font-weight: 900; color: var(--text-primary); }
.choices { display: flex; flex-direction: column; gap: 10px; margin: 18px 0 4px; }
.choice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  text-align: left;
  border: 2px solid transparent;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out), background 0.15s var(--ease-out);
}
.choice:hover { background: var(--clay-surface-alt); }
.choice.active { border-color: var(--accent); }
.radio {
  flex: 0 0 auto;
  width: 18px; height: 18px;
  margin-top: 2px;
  border: 2px solid var(--text-tertiary);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.choice.active .radio { border-color: var(--accent); }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
.choice-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.choice-label { font-weight: 800; color: var(--text-primary); }
.choice-note { font-size: 13px; line-height: 1.7; }
.choice-file { font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono, monospace); }
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
