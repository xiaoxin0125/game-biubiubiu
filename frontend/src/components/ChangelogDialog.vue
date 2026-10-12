<template>
  <Teleport to="body">
    <div class="mask" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
        <header class="dh">
          <h3 id="changelog-title">更新日志</h3>
          <p class="sub">当前版本 v{{ currentVersion }} · 共 {{ releases.length }} 个版本</p>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <div class="list">
            <article
              v-for="release in releases"
              :key="release.version"
              class="release"
              :class="{ current: release.version === currentVersion }"
            >
              <div class="rel-head">
                <span class="rel-version mono">v{{ release.version }}</span>
                <span v-if="release.version === currentVersion" class="rel-badge">当前</span>
                <span class="rel-date">{{ release.date }}</span>
              </div>

              <h4 class="rel-title">{{ release.title }}</h4>

              <section v-for="group in release.groups" :key="group.label" class="group">
                <p class="group-label">{{ group.label }}</p>
                <ul class="group-items">
                  <li v-for="(item, index) in group.items" :key="index">{{ item }}</li>
                </ul>
              </section>
            </article>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { APP_CHANGELOG } from '../constants/changelog.js'

defineProps({
  // 页脚显示的版本号（构建期注入），用来给「当前」版本加标记
  currentVersion: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const releases = APP_CHANGELOG

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

.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.2s var(--ease-spring);
}
@keyframes popIn { from { opacity: 0; transform: translateY(8px) scaleX(0.97) scaleY(0.95); } to { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); } }

.dh {
  flex: 0 0 auto;
  padding: 22px 58px 12px 24px;
  background: var(--clay-surface-flat);
}
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }
.sub { margin: 3px 0 0; font-size: 12px; color: var(--text-tertiary); }
.dlg-close { position: absolute; top: 14px; right: 14px; z-index: 2; }

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 20px 20px;
}

/* 内凹托盘 + 白色版本卡：和版本选择弹窗保持同一种层次 */
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}

.release {
  padding: 14px 16px;
  border-radius: var(--r-lg);
  background: var(--clay-surface);
  box-shadow: var(--clay-xs);
}
.release.current { background: var(--clay-surface-alt); box-shadow: var(--clay-sm); }

.rel-head { display: flex; align-items: center; gap: 8px; }
.rel-version {
  padding: 3px 10px;
  border-radius: var(--r-pill);
  background: var(--clay-lilac);
  color: var(--text-lilac);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  box-shadow: var(--clay-xs);
}
.release.current .rel-version {
  background: var(--clay-pink);
  color: #6C2039;
}
.rel-badge {
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--clay-pink-soft);
  color: #7A3D5C;
  font-size: 11px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.rel-date {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-quaternary);
  font-variant-numeric: tabular-nums;
}

.rel-title { margin: 10px 0 0; font-size: 14px; font-weight: 900; color: var(--text-primary); }

.group { margin-top: 10px; }
.group-label {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--ink-pink);
}
.group-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group-items li {
  position: relative;
  padding-left: 14px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-secondary);
}
.group-items li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 9px;
  width: 5px;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--accent);
  opacity: 0.75;
}

@media (max-width: 480px) {
  .mask { padding: 12px; }
  .dh { padding: 18px 56px 10px 18px; }
  .dialog-body { padding: 0 14px 16px; }
  .release { padding: 12px 13px; }
}
</style>
