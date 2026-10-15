<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="上传 ROM">
        <header class="dh">
          <h3>上传 ROM</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
        <div
          class="drop"
          :class="{ dragging, 'has-file': !!file }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <input ref="fileInput" type="file" hidden @change="onFile" />
          <template v-if="!file">
            <div class="drop-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p class="drop-title">拖拽文件到此处</p>
            <p class="drop-sub">或点击选择 · 最大 {{ maxMb }} MB</p>
          </template>
          <template v-else>
            <div class="file-row">
              <div class="file-icon mono">{{ (file.name.split('.').pop() || 'ROM').toUpperCase().slice(0, 4) }}</div>
              <div class="file-meta">
                <div class="fn">{{ file.name }}</div>
                <div class="fs">{{ fmtSize(file.size) }}</div>
              </div>
              <button class="btn btn-ghost btn-icon btn-sm" @click.stop="file = null" aria-label="移除">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </template>
        </div>

        <label v-if="canUseRemote" class="pub-row remote-row">
          <div class="sw">
            <input type="checkbox" v-model="useRemoteStorage" />
            <span class="track"><span class="thumb"></span></span>
          </div>
          <div class="pub-copy">
            <div class="pub-copy-title">上传到远端服务器</div>
            <div class="pub-copy-hint">{{ remoteHint }}</div>
          </div>
        </label>

        <div class="field">
          <label class="label">标题</label>
          <input v-model.trim="title" class="input" placeholder="留空使用文件名" />
        </div>

        <div class="field">
          <label class="label">平台</label>
          <div class="plat-grid">
            <button
              v-for="[id, p] in platformList"
              :key="id"
              class="plat-btn"
              :class="{ active: platform === id }"
              :style="{ '--pc': p.color }"
              @click="platform = id"
            >
              <span class="pd"></span>
              <span>{{ p.shortLabel }}</span>
            </button>
          </div>
        </div>

        <div v-if="coreOptions.length" class="field compat-field">
          <label class="label">默认核心</label>
          <ClaySelect v-model="defaultCore" class="select" aria-label="默认核心" :options="coreSelectOptions" />
          <div class="hint-text">只影响启动前选择，不会在运行中切换核心。</div>
        </div>

        <label class="pub-row">
          <div class="sw">
            <input type="checkbox" v-model="isPublic" :disabled="!!selectedParent" />
            <span class="track"><span class="thumb"></span></span>
          </div>
          <div class="pub-copy">
            <div class="pub-copy-title">公开给所有玩家</div>
            <div class="pub-copy-hint">{{ selectedParent ? '作为版本时会继承父 ROM 的公开状态' : '其他用户也可以在游戏库里看到并试玩' }}</div>
          </div>
        </label>

        <label class="pub-row">
          <div class="sw">
            <input type="checkbox" v-model="asVariant" :disabled="!sameCandidates.length" />
            <span class="track"><span class="thumb"></span></span>
          </div>
          <div class="pub-copy">
            <div class="pub-copy-title">作为已有游戏的版本</div>
            <div class="pub-copy-hint">
              {{ sameCandidates.length
                ? '选择父 ROM，本文件作为变体（如拳皇97 的 Plus / 风云再起）'
                : '先上传一个同平台的 ROM 才能作为其变体' }}
            </div>
          </div>
        </label>

        <div v-if="asVariant && sameCandidates.length" class="field variant-field">
          <label class="label">父 ROM</label>
          <input v-model="parentQuery" class="input" placeholder="搜索父 ROM（按标题或文件名）" />
          <div v-if="filteredParents.length" class="parent-list">
            <button
              v-for="r in filteredParents.slice(0, 8)"
              :key="r.id"
              type="button"
              class="parent-row"
              :class="{ selected: parentRomId === r.id }"
              @click="parentRomId = r.id"
            >
              <span class="parent-title">{{ r.title }}</span>
              <span class="parent-file">{{ r.fileName }}</span>
            </button>
          </div>
          <div v-else class="parent-empty">没有匹配结果</div>
          <label class="label" style="margin-top: 12px;">版本名</label>
          <input v-model.trim="versionLabel" class="input" placeholder="如：Plus / 风云再起 / 大蛇版" maxlength="64" />
        </div>

        <div class="field cover-field">
          <label class="label">{{ coverLabel }}</label>
          <div class="cover-picker" :class="{ 'has-cover': !!coverPreview }">
            <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden @change="onCover" />
            <template v-if="coverPreview">
              <img class="cover-preview" :src="coverPreview" alt="封面预览" />
              <div class="cover-actions">
                <button type="button" class="btn btn-sm" @click="pickCover">更换</button>
                <button type="button" class="btn btn-sm btn-ghost" @click="clearCover">移除</button>
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
          <button class="btn" @click="$emit('close')" :disabled="uploading">取消</button>
          <button class="btn btn-primary" :disabled="!file || !platform || uploading" @click="submit">
            <span v-if="!uploading">上传</span>
            <span v-else>{{ percent < 100 ? `${percent}%` : '处理中…' }}</span>
          </button>
        </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { platforms, resolvePlatformId } from '../constants/platforms.js'
import { autoDetectPlatform } from '../../../shared/registry/platform-roms.js'
import { coreDisplayName } from '../constants/cores.js'
import { api } from '../api/client.js'
import { useSettings } from '../composables/useSettings.js'
import ClaySelect from './ClaySelect.vue'

const emit = defineEmits(['close', 'uploaded'])
const { settings } = useSettings()

const file = ref(null)
const title = ref('')
const platform = ref('')
const isPublic = ref(false)
const uploading = ref(false)
const percent = ref(0)
const error = ref('')
const dragging = ref(false)
const maxMb = 100
// 可以选择把 ROM 转存到远端存储服务器（主站磁盘不够时用），不限文件大小
const useRemoteStorage = ref(false)

const asVariant = ref(false)
const parentRomId = ref(null)
const versionLabel = ref('')
const defaultCore = ref('')
const existingRoms = ref([])
const parentQuery = ref('')
const coverFile = ref(null)
const coverUrl = ref('')
const coverError = ref('')
const coverInput = ref(null)
const MAX_COVER_MB = 4

function releaseCoverUrl() {
  if (coverUrl.value) URL.revokeObjectURL(coverUrl.value)
  coverUrl.value = ''
}

const coverPreview = computed(() => (coverFile.value ? coverUrl.value : ''))

// 远端存储开关：只要已配置远端就出现（不限文件大小），变体永远跟父 ROM
const remoteAvailable = computed(() => !!settings.value.remoteUploadAvailable)
const canUseRemote = computed(() => remoteAvailable.value && !asVariant.value)
const fileSizeMb = computed(() => (file.value ? (file.value.size / 1024 / 1024).toFixed(1) : '0'))
const remoteHint = computed(() => {
  if (useRemoteStorage.value) {
    return file.value
      ? `将转存到远端存储，本机只保留记录；${fileSizeMb.value}MB 转发需要一点时间`
      : '将转存到远端存储，本机只保留记录'
  }
  return file.value
    ? `当前文件 ${fileSizeMb.value}MB，转存到远端存储服务器后本机只保留记录`
    : '转存到远端存储服务器，本机只保留记录'
})

watch(canUseRemote, (allowed) => { if (!allowed) useRemoteStorage.value = false })

onBeforeUnmount(releaseCoverUrl)

onMounted(async () => {
  try {
    const mine = await api.romsMine().catch(() => ({ roms: [] }))
    const seen = new Set()
    existingRoms.value = (mine.roms || []).filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return !r.parentRomId
    })
  } catch {
    existingRoms.value = []
  }
})

const platformList = computed(() => Object.entries(platforms))
const coreOptions = computed(() => platform.value ? platforms[platform.value]?.cores || [] : [])
const coreSelectOptions = computed(() => [
  { value: '', label: '跟随平台默认' },
  ...coreOptions.value.map((core) => ({ value: core, label: coreDisplayName[core] || core })),
])
// 变体没上传封面时由父 ROM 的封面代替
const coverLabel = computed(() => (asVariant.value ? '封面图片（可选，留空沿用父 ROM 的封面）' : '封面图片（可选）'))

const sameCandidates = computed(() => {
  if (!platform.value) return []
  // 平台按通用名比较：父 ROM 是老记录、写着别名（famicom / snes / genesis）时也能选。
  const id = resolvePlatformId(platform.value)
  return existingRoms.value.filter((r) => resolvePlatformId(r.platform) === id)
})

const selectedParent = computed(() => sameCandidates.value.find((r) => r.id === parentRomId.value) || null)

const filteredParents = computed(() => {
  const q = parentQuery.value.trim().toLowerCase()
  if (!q) return sameCandidates.value
  return sameCandidates.value.filter((r) =>
    r.title.toLowerCase().includes(q) || r.fileName.toLowerCase().includes(q),
  )
})

watch(asVariant, (on) => {
  if (!on) { parentRomId.value = null; versionLabel.value = ''; parentQuery.value = '' }
})
watch(platform, () => {
  parentRomId.value = null
  parentQuery.value = ''
  defaultCore.value = ''
})
watch(selectedParent, (parent) => {
  if (parent) isPublic.value = !!parent.isPublic
})

function onFile(e) {
  const f = e.target.files?.[0]
  if (f) assignFile(f)
}
function onDrop(e) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) assignFile(f)
}
function assignFile(f) {
  if (f.size > maxMb * 1024 * 1024) {
    error.value = `文件超过 ${maxMb}MB`
    return
  }
  error.value = ''
  file.value = f
  if (!title.value) title.value = f.name.replace(/\.[^.]+$/, '')
  if (!platform.value) platform.value = guessPlatform(f.name)
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
  releaseCoverUrl()
  coverFile.value = f
  coverUrl.value = URL.createObjectURL(f)
}

function pickCover() { coverInput.value?.click() }

function clearCover() {
  releaseCoverUrl()
  coverFile.value = null
  if (coverInput.value) coverInput.value.value = ''
}

function guessPlatform(name) {
  return autoDetectPlatform(name)
}

function fmtSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}

async function submit() {
  if (!file.value || !platform.value) return
  if (asVariant.value && !parentRomId.value) {
    error.value = '请选择父 ROM'
    return
  }
  uploading.value = true
  error.value = ''
  percent.value = 0
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('title', title.value || file.value.name)
    fd.append('platform', platform.value)
    fd.append('isPublic', String(isPublic.value))
    if (defaultCore.value) fd.append('defaultCore', defaultCore.value)
    if (asVariant.value && parentRomId.value) {
      fd.append('parentRomId', String(parentRomId.value))
      fd.append('versionLabel', versionLabel.value || '变体')
    }
    // 封面是可选功能：变体也可以有自己的封面，没传则沿用父 ROM
    if (coverFile.value) fd.append('cover', coverFile.value)
    if (canUseRemote.value && useRemoteStorage.value) fd.append('storage', 'remote')
    const xhr = new XMLHttpRequest()
    await new Promise((resolve, reject) => {
      xhr.open('POST', '/api/roms/upload')
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) percent.value = Math.round((e.loaded / e.total) * 100)
      }
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) resolve(data)
          else reject(new Error(data?.error || `上传失败 (${xhr.status})`))
        } catch { reject(new Error('响应解析失败')) }
      }
      xhr.onerror = () => reject(new Error('网络错误'))
      xhr.send(fd)
    }).then((data) => emit('uploaded', data))
  } catch (err) {
    error.value = err.message
  } finally {
    uploading.value = false
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
  animation: fadeIn 0.2s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 标题栏不参与滚动，关闭按钮固定在弹窗右上角；只有 .dialog-body 滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  border-radius: var(--r-2xl);
  background: var(--clay-surface);
  border: 0;
  animation: popIn 0.2s var(--ease-spring);

  box-shadow: var(--clay-lg);
}
@keyframes popIn { from { opacity: 0; transform: translateY(10px) scaleX(0.96) scaleY(0.94); } to { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); } }

.dh {
  flex: 0 0 auto;
  padding: 22px 58px 12px 28px;
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
  padding: 0 28px 24px;
}

.drop {
  position: relative;
  border: 0;
  outline: 3px dashed rgba(242, 126, 178, 0.42);
  outline-offset: -10px;
  border-radius: var(--r-2xl);
  padding: 30px;
  text-align: center;
  cursor: pointer;
  color: var(--text-secondary);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), outline-color var(--t) var(--clay-ease);
}
.drop:hover:not(.has-file),
.drop.dragging {
  background: var(--clay-surface-alt);
  color: var(--text-primary);
  outline-color: rgba(242, 126, 178, 0.7);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.drop.has-file {
  padding: 16px;
  outline: none;
  cursor: default;
  background: var(--clay-surface);
  box-shadow: var(--clay-sm);
}

.drop-icon {
  width: 54px; height: 54px;
  margin: 0 auto 12px;
  border-radius: var(--r-lg);
  background: var(--clay-surface);
  border: 0;
  color: var(--text-primary);
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--clay-md);
}
.drop-title { margin: 8px 0 4px; font-weight: 900; font-size: 14px; color: var(--text-primary); }
.drop-sub { margin: 0; font-size: 12px; color: var(--text-tertiary); }

.file-row { display: flex; align-items: center; gap: 12px; text-align: left; }
.file-icon {
  flex-shrink: 0;
  width: 46px; height: 46px;
  border-radius: var(--r-md);
  background: var(--clay-lilac);
  border: 0;
  color: var(--text-lilac);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 900;
  letter-spacing: 0.04em;
  box-shadow: var(--clay-xs);
}
.file-meta { flex: 1; min-width: 0; }
.fn { font-size: 14px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.fs { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

.field { margin-top: 18px; }
.cover-field { margin-top: 18px; }
.cover-picker {
  position: relative;
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
.cover-error {
  margin-top: 8px;
  color: var(--error);
  font-size: 12px;
  font-weight: 800;
}
.select {
  --select-width: 100%;
  --select-height: 42px;
  --select-min-height: 42px;
  --select-font-size: 13px;
}
.hint-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.plat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px;
}
.plat-btn {
  --pc: var(--accent);
  display: flex; align-items: center; gap: 6px;
  height: 38px;
  padding: 0 12px;
  border: 0;
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  border-radius: var(--r-pill);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
  font-family: inherit;
}
.plat-btn:hover:not(.active) {
  color: var(--text-primary);
  background: var(--clay-surface-alt);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.plat-btn:active:not(.active) { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.plat-btn.active {
  background: var(--clay-primary-grad);
  color: #fff;
  font-weight: 900;
  box-shadow: var(--clay-sm);
}
.pd { width: 8px; height: 8px; border-radius: 14px; background: var(--pc); border: 0; }
.plat-btn.active .pd { background: currentColor; border-color: currentColor; }

.pub-row {
  display: flex; gap: 14px; align-items: center;
  margin-top: 20px;
  padding: 16px 18px;
  border-radius: var(--r-lg);
  /* 面板本身是白色粘土卡，开关行改用糖果粉卡片，避免白底叠白卡看不出层次 */
  background: var(--clay-pink-soft);
  box-shadow: var(--clay-sm);
  border: 0;
  cursor: pointer;
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t-fast) var(--clay-ease);
}
.pub-row:hover { transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.pub-row:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.sw { position: relative; flex-shrink: 0; }
.sw input { opacity: 0; position: absolute; width: 100%; height: 100%; top: 0; left: 0; margin: 0; cursor: pointer; }
/* 行内文案：显式声明 display / 字体 / 颜色（写死十六进制），不依赖变量与 font 简写 */
.pub-copy { display: block; flex: 1 1 auto; min-width: 0; }
.pub-copy-title,
.pub-copy-hint { display: block; }
.pub-copy-title {
  color: #4E3348;
  font-family: var(--font-sans);
  font-size: 14px;
  font-style: normal;
  font-weight: 900;
  line-height: 1.4;
}
.pub-copy-hint {
  margin-top: 3px;
  color: #6E5069;
  font-family: var(--font-sans);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: 1.5;
}
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

.variant-field { display: flex; flex-direction: column; gap: 8px; }
.parent-list {
  margin-top: 6px;
  max-height: 220px;
  overflow-y: auto;
  border: 0;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
  padding: 6px;
}
.parent-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-bottom: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--clay-xs);
  transition: background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.parent-row:last-child { border-bottom: none; }
.parent-row:hover { background: var(--clay-surface-alt); transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.parent-row:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.parent-row.selected { background: var(--clay-primary-grad); color: #fff; box-shadow: var(--clay-sm); }
.parent-row.selected .parent-file { color: rgba(255, 255, 255, 0.78); }
.parent-title { font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.parent-file { color: var(--text-tertiary); font-size: 11px; flex-shrink: 0; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.parent-empty {
  padding: 14px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  border: 0;
  border-radius: var(--r-md);
  background: var(--clay-surface);
  box-shadow: var(--clay-xs);
}

.err {
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--error) 12%, #fff);
  border: 0;
  box-shadow: var(--clay-in-sm);
  color: var(--error);
  font-size: 13px;
  font-weight: 800;
}

.df { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; }
</style>
