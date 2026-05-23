<template>
  <Teleport to="body">
    <div class="mask" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="上传 ROM">
        <header class="dh">
          <h3>上传 ROM</h3>
          <button class="btn btn-ghost btn-icon btn-sm" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

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
          <select v-model="defaultCore" class="select">
            <option value="">跟随平台默认</option>
            <option v-for="core in coreOptions" :key="core" :value="core">
              {{ coreDisplayName[core] || core }}
            </option>
          </select>
          <div class="hint-text">只影响启动前选择，不会在运行中切换核心。</div>
        </div>

        <div v-if="isNesPlatform" class="field compat-field">
          <label class="label">NES 4P 控制器模式</label>
          <select v-model="nesFourPlayerMode" class="select">
            <option value="">关闭 / 自动</option>
            <option value="four_score">Four Score</option>
            <option value="famicom_expansion">FC 扩展手柄</option>
          </select>
          <div class="hint-text">4 人改版 ROM 建议配合 FCEUmm 或 Nestopia 测试。</div>
        </div>

        <label class="pub-row">
          <div class="sw">
            <input type="checkbox" v-model="isPublic" :disabled="!!selectedParent" />
            <span class="track"><span class="thumb"></span></span>
          </div>
          <div class="pub-text">
            <div class="pr-t">公开给所有玩家</div>
            <div class="pr-s">{{ selectedParent ? '作为版本时会继承父 ROM 的公开状态' : '其他用户也可以在游戏库里看到并试玩' }}</div>
          </div>
        </label>

        <label class="pub-row">
          <div class="sw">
            <input type="checkbox" v-model="asVariant" :disabled="!sameCandidates.length" />
            <span class="track"><span class="thumb"></span></span>
          </div>
          <div class="pub-text">
            <div class="pr-t">作为已有游戏的版本</div>
            <div class="pr-s">
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

        <div v-if="error" class="err">{{ error }}</div>

        <footer class="df">
          <button class="btn" @click="$emit('close')" :disabled="uploading">取消</button>
          <button class="btn btn-primary" :disabled="!file || !platform || uploading" @click="submit">
            <span v-if="!uploading">上传</span>
            <span v-else>{{ percent }}%</span>
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { platforms } from '../constants/platforms.js'
import { coreDisplayName } from '../constants/cores.js'
import { api } from '../api/client.js'

const emit = defineEmits(['close', 'uploaded'])

const file = ref(null)
const title = ref('')
const platform = ref('')
const isPublic = ref(false)
const uploading = ref(false)
const percent = ref(0)
const error = ref('')
const dragging = ref(false)
const maxMb = 100

const asVariant = ref(false)
const parentRomId = ref(null)
const versionLabel = ref('')
const defaultCore = ref('')
const nesFourPlayerMode = ref('')
const existingRoms = ref([])
const parentQuery = ref('')

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
const isNesPlatform = computed(() => platform.value === 'nes' || platform.value === 'famicom')

const sameCandidates = computed(() => {
  if (!platform.value) return []
  return existingRoms.value.filter((r) => r.platform === platform.value)
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
  nesFourPlayerMode.value = ''
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

function guessPlatform(name) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  for (const [id, p] of Object.entries(platforms)) {
    if (p.fileExtensions.includes('.' + ext)) return id
  }
  return ''
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
    if (isNesPlatform.value && nesFourPlayerMode.value) fd.append('nesFourPlayerMode', nesFourPlayerMode.value)
    if (asVariant.value && parentRomId.value) {
      fd.append('parentRomId', String(parentRomId.value))
      fd.append('versionLabel', versionLabel.value || '变体')
    }
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
  background: rgba(17, 17, 17, 0.28);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.dialog {
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 7px;
  padding: 28px;
  background: rgba(255, 251, 245, 0.96);
  border: 2px solid var(--border-color, #111);
  box-shadow: 6px 6px 0 var(--border-color, #111);
  animation: popIn 0.2s var(--ease-spring);
}
@keyframes popIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.dh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: #111; }

.drop {
  position: relative;
  border: 2px dashed var(--border-color, #111);
  border-radius: 7px;
  padding: 28px;
  text-align: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
  background: rgba(255, 255, 255, 0.58);
}
.drop:hover,
.drop.dragging {
  background: #fff;
  color: #111;
  transform: translate(-3px, -3px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.drop.has-file {
  padding: 14px;
  border-style: solid;
  border-color: var(--border-color, #111);
  cursor: default;
  background: #fff;
}
.drop.has-file:hover { transform: none; box-shadow: none; }

.drop-icon {
  width: 52px; height: 52px;
  margin: 0 auto 10px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  color: #111;
  display: flex; align-items: center; justify-content: center;
}
.drop-title { margin: 8px 0 4px; font-weight: 900; font-size: 14px; color: #111; }
.drop-sub { margin: 0; font-size: 12px; color: var(--text-tertiary); }

.file-row { display: flex; align-items: center; gap: 12px; text-align: left; }
.file-icon {
  flex-shrink: 0;
  width: 44px; height: 44px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  color: #111;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 900;
  letter-spacing: 0.04em;
}
.file-meta { flex: 1; min-width: 0; }
.fn { font-size: 14px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #111; }
.fs { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

.field { margin-top: 18px; }
.select {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: #fff;
  color: #111;
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
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
  height: 36px;
  padding: 0 10px;
  border: 2px solid var(--border-color, #111);
  background: transparent;
  color: #111;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s, color 0.2s;
  font-family: inherit;
}
.plat-btn:hover:not(.active) {
  color: #111;
  background: transparent;
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.plat-btn.active {
  background: #111;
  border-color: #111;
  color: #fff;
  font-weight: 900;
}
.pd { width: 8px; height: 8px; border-radius: 3px; background: var(--pc); border: 1px solid #111; }
.plat-btn.active .pd { background: currentColor; border-color: currentColor; }

.pub-row {
  display: flex; gap: 14px; align-items: center;
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.46);
  border: 2px solid var(--border-color, #111);
  cursor: pointer;
  transition: background var(--t-fast);
}
.pub-row:hover { background: #fff; }
.sw { position: relative; flex-shrink: 0; }
.sw input { opacity: 0; position: absolute; width: 100%; height: 100%; top: 0; left: 0; margin: 0; cursor: pointer; }
.track {
  position: relative; display: block;
  width: 40px; height: 24px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  transition: all var(--t);
}
.thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: #111;
  border-radius: 5px;
  box-shadow: none;
  transition: all var(--t) var(--ease-spring);
}
.sw input:checked + .track { background: #111; border-color: #111; }
.sw input:checked + .track .thumb { background: #fff; transform: translateX(16px); }
.pr-t { font-size: 14px; font-weight: 900; color: #111; }
.pr-s { font-size: 12px; color: var(--text-tertiary); margin-top: 3px; }

.variant-field { display: flex; flex-direction: column; gap: 8px; }
.parent-list {
  margin-top: 6px;
  max-height: 220px;
  overflow-y: auto;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: #fff;
}
.parent-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-bottom: 2px solid var(--border-color, #111);
  background: transparent;
  color: #111;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
}
.parent-row:last-child { border-bottom: none; }
.parent-row:hover { background: rgba(17, 17, 17, 0.06); }
.parent-row.selected { background: #111; color: #fff; }
.parent-row.selected .parent-file { color: rgba(255, 255, 255, 0.78); }
.parent-title { font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.parent-file { color: var(--text-tertiary); font-size: 11px; flex-shrink: 0; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.parent-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: #fff;
}

.err {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  color: var(--error);
  font-size: 13px;
  font-weight: 800;
}

.df { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; }
</style>
