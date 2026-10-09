<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="选择版本">
        <header class="dh">
          <div class="dh-text">
            <h3>选择版本</h3>
            <p class="sub">{{ title }} · {{ versions.length }} 个版本</p>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <div v-if="loading" class="loading">
            <div class="skeleton" style="height: 52px;"></div>
            <div class="skeleton" style="height: 52px;"></div>
          </div>
          <div v-else class="list">
            <button
              v-for="(v, i) in versions"
              :key="v.id"
              class="row"
              @click="$emit('pick', v)"
            >
              <span class="row-idx">{{ i + 1 }}</span>
              <div class="left">
                <div class="name">{{ versionName(v) }}</div>
              </div>
              <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/client.js'

const props = defineProps({
  rom: { type: Object, required: true },
})
defineEmits(['close', 'pick'])

const versions = ref([])
const loading = ref(true)
const title = props.rom.title

onMounted(async () => {
  try {
    const { versions: list } = await api.romVersions(props.rom.id)
    versions.value = list || []
  } catch {
    versions.value = [props.rom]
  } finally {
    loading.value = false
  }
})

function versionName(v) {
  if (!v.parentRomId) return '原版'
  return v.versionLabel || '变体'
}
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
  animation: fadeIn 0.2s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 标题栏不参与滚动，关闭按钮固定在弹窗右上角；只有 .dialog-body 滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.22s var(--ease-spring);
}
@keyframes popIn {
  from { opacity: 0; transform: translateY(10px) scaleX(0.96) scaleY(0.94); }
  to   { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); }
}

.dh {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 56px 10px 20px;
  background: var(--clay-surface-flat);
}
.dh-text { min-width: 0; flex: 1; }
.dh h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}
.sub { margin: 3px 0 0; font-size: 12px; color: var(--text-tertiary); }

.dlg-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 20px 16px;
}

.loading { display: flex; flex-direction: column; gap: 6px; padding: 2px 0; }

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: var(--r-lg);
  /* 内凹托盘 + 白色版本卡，避免白卡叠白底看不出层次 */
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--r-lg);
  border: 0;
  background: var(--clay-surface);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--clay-sm);
  transition: background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.row:hover {
  background: var(--clay-surface-alt);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.row:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.row:hover .chev { color: var(--accent); transform: translateX(2px); }
.row:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.row-idx {
  flex-shrink: 0;
  width: 26px; height: 26px;
  border-radius: var(--r-pill);
  background: var(--clay-lilac);
  color: var(--text-lilac);
  font-size: 11px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--clay-xs);
  transition: background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.row:hover .row-idx { background: var(--clay-pink-soft); color: #7A3D5C; }

.chev {
  color: var(--text-quaternary);
  flex-shrink: 0;
  transition: color var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease);
}
.left { min-width: 0; flex: 1; }
.name { font-size: 14px; font-weight: 900; color: var(--text-primary); }
</style>
