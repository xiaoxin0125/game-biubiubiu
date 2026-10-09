<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="编辑 ROM">
        <header class="dh">
          <h3>编辑 ROM</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <div class="rom-hint">
            <div class="rom-hint-title">{{ rom.title }}</div>
            <div class="rom-hint-meta">
              <span class="mono">{{ rom.fileName }}</span>
              <span>·</span>
              <span>{{ fmtSize(rom.fileSize) }}</span>
              <span v-if="rom.owner">·</span>
              <span v-if="rom.owner">@{{ rom.owner.username }}</span>
              <span>·</span>
              <span>{{ rom.storage === 'remote' ? '远端存储' : '本机存储' }}</span>
            </div>
            <div v-if="parentTitle" class="rom-hint-version">版本：{{ rom.versionLabel || '变体' }} · 属于《{{ parentTitle }}》</div>
          </div>

          <div class="field">
            <label class="label">标题</label>
            <input v-model.trim="title" class="input" maxlength="128" placeholder="ROM 标题" />
          </div>

          <div class="field">
            <label class="label">平台</label>
            <ClaySelect
              v-model="platform"
              class="input-select"
              aria-label="平台"
              :options="platformSelectOptions"
            />
            <div class="hint-text">平台决定可用核心；保存后会同步该版本家族，与新平台不匹配的默认核心会被清除。</div>
          </div>

          <div class="field">
            <label class="label">游玩人数</label>
            <ClaySelect
              v-model="maxPlayers"
              class="input-select"
              aria-label="游玩人数"
              :options="maxPlayerOptions"
            />
            <div class="hint-text">{{ rom.parentRomId ? '变体默认跟随父 ROM 的人数；这里可以单独覆盖。' : '自动时按平台与档位推断，可在对战房间里限制人数。' }}</div>
          </div>

          <div class="field">
            <label class="label">默认核心</label>
            <ClaySelect
              v-model="defaultCore"
              class="input-select"
              aria-label="默认核心"
              :options="coreSelectOptions"
            />
          </div>

          <label class="opt">
            <div class="sw">
              <input type="checkbox" v-model="isPublic" />
              <span class="track"><span class="thumb"></span></span>
            </div>
            <div class="opt-text">
              <div class="pt">公开给所有玩家</div>
              <div class="ps">同版本的其它 ROM 会一起切换公开状态</div>
            </div>
          </label>

          <div class="field">
            <label class="label">封面图片{{ rom.parentRomId ? '（可选，留空沿用父 ROM 的封面）' : '（可选）' }}</label>
            <div class="cover-picker" :class="{ 'has-cover': !!coverPreview }">
              <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden @change="onCover" />
              <template v-if="coverPreview">
                <img class="cover-preview" :src="coverPreview" alt="封面预览" />
                <div class="cover-actions">
                  <button type="button" class="btn btn-sm" @click="pickCover">更换</button>
                  <button type="button" class="btn btn-sm btn-ghost" @click="removeCover">移除</button>
                </div>
              </template>
              <button v-else type="button" class="cover-empty" @click="pickCover">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3.5 3.5L16 13l4 4"/></svg>
                <span class="cover-empty-title">点击选择封面图片</span>
                <span class="cover-empty-sub">PNG / JPG / WebP / GIF / AVIF，不超过 4MB</span>
              </button>
            </div>
            <div v-if="coverError" class="cover-error">{{ coverError }}</div>
          </div>

          <div v-if="error" class="err">{{ error }}</div>

          <footer class="df">
            <button type="button" class="btn" :disabled="busy" @click="$emit('close')">取消</button>
            <button type="button" class="btn btn-primary" :disabled="busy || !title" @click="submit">
              {{ busy ? '保存中…' : '保存' }}
            </button>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { platforms } from '../constants/platforms.js'
import { coreDisplayName } from '../constants/cores.js'
import { api } from '../api/client.js'
import ClaySelect from './ClaySelect.vue'

const props = defineProps({
  rom: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved'])

const platformList = computed(() => Object.entries(platforms))

const title = ref(props.rom.title || '')
const platform = ref(props.rom.platform || '')
const maxPlayers = ref(props.rom.maxPlayers == null ? '' : String(props.rom.maxPlayers))
const defaultCore = ref(props.rom.defaultCore || '')
const isPublic = ref(props.rom.isPublic !== false)

const coverFile = ref(null)
const coverObjectUrl = ref('')
const coverRemoved = ref(false)
const coverError = ref('')
const coverInput = ref(null)
const MAX_COVER_MB = 4

const parentTitle = ref('')
const error = ref('')
const busy = ref(false)

const coreOptions = computed(() => platforms[platform.value]?.cores || [])
const platformSelectOptions = computed(() => platformList.value
  .map(([id, p]) => ({ value: id, label: `${p.displayName}（${p.shortLabel}）` })))
const maxPlayerOptions = computed(() => [
  { value: '', label: `自动（${props.rom.effectiveMaxPlayers || 4}P）` },
  ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}P` })),
])
const coreSelectOptions = computed(() => [
  { value: '', label: '跟随平台默认' },
  ...coreOptions.value.map((core) => ({ value: core, label: coreDisplayName[core] || core })),
])
const coverPreview = computed(() => {
  if (coverFile.value) return coverObjectUrl.value
  if (coverRemoved.value) return ''
  return props.rom.coverUrl || ''
})

onMounted(async () => {
  if (!props.rom.parentRomId) return
  try {
    const { rom: parent } = await api.romGet(props.rom.parentRomId)
    parentTitle.value = parent?.title || ''
  } catch {}
})

onBeforeUnmount(() => {
  if (coverObjectUrl.value) URL.revokeObjectURL(coverObjectUrl.value)
})

function fmtSize(b) {
  if (!Number.isFinite(b)) return ''
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}

function onCover(e) {
  const f = e.target.files?.[0]
  if (!f) return
  coverError.value = ''
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(f.type)) {
    coverError.value = '封面只支持 PNG / JPG / WebP / GIF / AVIF'
    e.target.value = ''
    return
  }
  if (f.size > MAX_COVER_MB * 1024 * 1024) {
    coverError.value = `封面不能超过 ${MAX_COVER_MB}MB`
    e.target.value = ''
    return
  }
  if (coverObjectUrl.value) URL.revokeObjectURL(coverObjectUrl.value)
  coverFile.value = f
  coverObjectUrl.value = URL.createObjectURL(f)
  coverRemoved.value = false
}

function pickCover() { coverInput.value?.click() }

function removeCover() {
  if (coverObjectUrl.value) URL.revokeObjectURL(coverObjectUrl.value)
  coverObjectUrl.value = ''
  coverFile.value = null
  coverRemoved.value = !!props.rom.coverUrl
  if (coverInput.value) coverInput.value.value = ''
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const patch = {}
    if (title.value && title.value !== props.rom.title) patch.title = title.value
    if (platform.value && platform.value !== props.rom.platform) patch.platform = platform.value
    const nextMaxPlayers = maxPlayers.value === '' ? null : Number(maxPlayers.value)
    if (nextMaxPlayers !== (props.rom.maxPlayers ?? null)) patch.maxPlayers = nextMaxPlayers
    const nextCore = defaultCore.value || null
    if (nextCore !== (props.rom.defaultCore ?? null)) patch.defaultCore = nextCore
    if (isPublic.value !== (props.rom.isPublic !== false)) patch.isPublic = isPublic.value

    let updated = Object.keys(patch).length ? await api.romUpdate(props.rom.id, patch) : props.rom

    if (coverFile.value) {
      const fd = new FormData()
      fd.append('cover', coverFile.value)
      updated = await api.romUploadCover(props.rom.id, fd)
    } else if (coverRemoved.value && props.rom.coverUrl) {
      updated = await api.romDeleteCover(props.rom.id)
    }

    emit('saved', { ...props.rom, ...patch, ...updated })
  } catch (err) {
    error.value = err?.message || '保存失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.mask {
  position: fixed; inset: 0;
  background: rgba(94, 58, 84, 0.28);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 标题栏不参与滚动，关闭按钮固定在弹窗右上角；只有 .dialog-body 滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  animation: popIn 0.2s var(--ease-spring);
  box-shadow: var(--clay-lg);
}
@keyframes popIn { from { opacity: 0; transform: translateY(10px) scaleX(0.96) scaleY(0.94); } to { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); } }

.dh {
  flex: 0 0 auto;
  padding: 22px 58px 12px 24px;
  background: var(--clay-surface-flat);
}
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }

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
  padding: 0 24px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rom-hint {
  padding: 14px 16px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.rom-hint-title { font-size: 14px; font-weight: 900; color: var(--text-primary); }
.rom-hint-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.rom-hint-meta .mono { font-family: var(--mono-stack); }
.rom-hint-version { margin-top: 6px; font-size: 12px; color: var(--text-secondary); font-weight: 800; }

.field { display: flex; flex-direction: column; gap: 8px; }
.input-select {
  --select-width: 100%;
  --select-height: 44px;
  --select-min-height: 44px;
  --select-font-size: 13px;
}
.hint-text { font-size: 12px; line-height: 1.5; color: var(--text-tertiary); }

.opt {
  display: flex;
  gap: 14px;
  align-items: center;
  cursor: pointer;
  padding: 16px 18px;
  border: 0;
  border-radius: var(--r-lg);
  background: var(--clay-pink-soft);
  box-shadow: var(--clay-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.opt:hover { transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.opt:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.sw { position: relative; flex-shrink: 0; }
.sw input { opacity: 0; position: absolute; width: 100%; height: 100%; top: 0; left: 0; margin: 0; cursor: pointer; }
.track {
  position: relative; display: block;
  width: 44px; height: 26px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  border: 0;
  box-shadow: var(--clay-in-sm);
  transition: background var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.thumb {
  position: absolute; top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: var(--clay-primary-grad);
  border-radius: var(--r-pill);
  box-shadow: var(--clay-xs);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.sw input:checked + .track { background: var(--clay-primary-grad); box-shadow: var(--clay-sm); }
.sw input:checked + .track .thumb { background: var(--clay-surface-flat); transform: translateX(18px); }
.sw:active .thumb { transform: scaleX(1.08) scaleY(0.9); }
.sw input:checked:active + .track .thumb { transform: translateX(18px) scaleX(1.08) scaleY(0.9); }
.pt { font-size: 14px; font-weight: 900; color: var(--clay-ink); }
.ps { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

.cover-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.cover-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px 16px;
  border: 0;
  border-radius: var(--r-md);
  outline: 2px dashed rgba(242, 126, 178, 0.42);
  outline-offset: -8px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
  transition: color var(--t-fast) var(--clay-ease), outline-color var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease);
}
.cover-empty:hover { color: var(--text-primary); outline-color: rgba(242, 126, 178, 0.7); background: rgba(255, 255, 255, 0.5); }
.cover-empty-title { font-size: 13px; font-weight: 900; }
.cover-empty-sub { font-size: 11px; color: var(--text-tertiary); }
.cover-preview {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: var(--r-md);
  background: var(--clay-surface-flat);
  box-shadow: var(--clay-xs);
}
.cover-actions { display: flex; gap: 8px; }
.cover-error { margin-top: 6px; color: var(--error); font-size: 12px; font-weight: 800; }

.err {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--error) 12%, #fff);
  border: 0;
  box-shadow: var(--clay-in-sm);
  color: var(--error);
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}
.df { display: flex; gap: 8px; justify-content: flex-end; }
</style>
