<template>
  <div class="my-page container">
    <header class="page-head">
      <div>
        <h1 class="page-title">我的 ROM</h1>
        <p class="page-sub">上传并管理自己的 ROM，公开后其他玩家也能试玩</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" @click="openUpload">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          上传 ROM
        </button>
      </div>
    </header>

    <div class="tabs">
      <button class="tab" :class="{ active: activeTab === 'active' }" @click="activeTab = 'active'">
        全部 <span class="n">{{ roms.length }}</span>
      </button>
      <button class="tab" :class="{ active: activeTab === 'trash' }" @click="onSwitchTrash">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
        回收站 <span class="n">{{ trashRoms.length }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'active'">
      <div v-if="loading" class="panel-card loading-card">
        <div class="spinner"></div>
        <p>加载中…</p>
      </div>
      <div v-else-if="!roms.length" class="panel-card empty-card">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <h3>还没有上传过 ROM</h3>
        <p>把 .nes / .zip / .gba / .chd 等文件拖进来开始收藏</p>
        <button class="btn btn-primary btn-sm" @click="openUpload">选择文件</button>
      </div>
      <template v-else>
        <div class="rom-toolbar">
          <div class="rom-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input v-model.trim="activeSearch" placeholder="搜索 ROM 名称或文件名" />
          </div>
          <select v-model="activePlatform" class="filter-select" aria-label="筛选平台">
            <option value="all">全部平台</option>
            <option v-for="p in activePlatformOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
          <select v-model="activeVisibility" class="filter-select" aria-label="筛选公开状态">
            <option value="all">全部状态</option>
            <option value="public">公开</option>
            <option value="private">私密</option>
          </select>
        </div>

        <div v-if="!filteredRoms.length" class="panel-card empty-card">
          <h3>没有匹配的 ROM</h3>
          <p>换个平台、公开状态或关键词再试试</p>
        </div>
        <div v-else class="rom-card-table">
          <article v-for="rom in pagedRoms" :key="rom.id" class="rom-entry">
            <div class="rom-entry-main">
              <span class="pdot" :style="{ background: platformColor(rom.platform) }"></span>
              <div class="rom-entry-title-wrap">
                <div v-if="editingId === rom.id" class="rt-edit">
                  <input
                    ref="editInput"
                    v-model.trim="editTitle"
                    class="rt-input"
                    maxlength="128"
                    @keydown.enter.prevent="saveTitle(rom)"
                    @keydown.esc.prevent="cancelEdit"
                    @blur="saveTitle(rom)"
                  />
                </div>
                <button v-else class="rom-title-button" type="button" :title="rom.title + ' · 点击重命名'" @click="startEdit(rom)">
                  <span>{{ rom.title }}</span>
                  <svg class="rt-pen" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <div class="rf">{{ rom.fileName }}</div>
              </div>
            </div>
            <div class="rom-entry-meta">
              <span class="plat-badge" :style="{ '--pc': platformColor(rom.platform) }">{{ platformLabel(rom.platform) }}</span>
              <span class="meta-chip">{{ fmtSize(rom.fileSize) }}</span>
              <span class="meta-chip">{{ fmtTime(rom.createdAt) }}</span>
              <label class="switch" :title="rom.isPublic ? '公开' : '私密'">
                <input type="checkbox" :checked="rom.isPublic" @change="togglePublic(rom, $event.target.checked)" />
                <span class="track"><span class="thumb"></span></span>
                <span class="switch-label">{{ rom.isPublic ? '公开' : '私密' }}</span>
              </label>
              <div class="col-actions">
                <button class="btn btn-sm" @click="play(rom)">试玩</button>
                <button class="btn btn-sm btn-danger" @click="remove(rom)">删除</button>
              </div>
            </div>
          </article>
        </div>

        <nav v-if="filteredRoms.length > pageSize" class="pagination" aria-label="我的 ROM 分页">
          <button class="tab page-btn" type="button" :disabled="activePage <= 1" @click="activePage -= 1">‹ 上一页</button>
          <template v-for="(item, index) in activePageItems" :key="`${item}-${index}`">
            <span v-if="item === 'ellipsis'" class="pagination-ellipsis">···</span>
            <button
              v-else
              class="tab page-btn page-number"
              :class="{ active: item === activePage }"
              type="button"
              @click="activePage = item"
            >
              {{ item }}
            </button>
          </template>
          <button class="tab page-btn" type="button" :disabled="activePage >= activePageCount" @click="activePage += 1">下一页 ›</button>
          <button class="tab page-btn" type="button" @click="jumpActivePage">跳转 »</button>
        </nav>
      </template>
    </section>

    <section v-else-if="activeTab === 'trash'">
      <div v-if="trashRoms.length" class="trash-hint">
        这些 ROM 已标记为删除，文件仍在磁盘上保留。恢复可将其还原，永久删除会抹除磁盘上的 ROM、存档与子版本。
      </div>
      <div v-if="trashLoading" class="panel-card loading-card">
        <div class="spinner"></div>
        <p>加载中…</p>
      </div>
      <div v-else-if="!trashRoms.length" class="panel-card empty-card">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </div>
        <h3>回收站是空的</h3>
        <p>删除的 ROM 会出现在这里，可以随时恢复</p>
      </div>
      <div v-else class="panel-card rom-table">
        <div class="trow trow-head trow-trash">
          <span class="col-check"></span>
          <span>游戏</span>
          <span>平台</span>
          <span>大小</span>
          <span>删除时间</span>
          <span class="col-actions">操作</span>
        </div>
        <div v-for="rom in trashRoms" :key="rom.id" class="trow trow-trash">
          <span class="col-check"><span class="pdot" :style="{ background: platformColor(rom.platform) }"></span></span>
          <div class="col-title">
            <div class="rt"><span class="rt-text">{{ rom.title }}</span></div>
            <div class="rf">{{ rom.fileName }}</div>
          </div>
          <div>
            <span class="plat-badge" :style="{ '--pc': platformColor(rom.platform) }">{{ platformLabel(rom.platform) }}</span>
          </div>
          <div class="muted">{{ fmtSize(rom.fileSize) }}</div>
          <div class="muted">{{ fmtTime(rom.updatedAt) }}</div>
          <div class="col-actions">
            <button class="btn btn-sm btn-primary" @click="restore(rom)">恢复</button>
            <button class="btn btn-sm btn-danger" @click="purge(rom)">永久删除</button>
          </div>
        </div>
      </div>
    </section>

    <UploadDialog v-if="showUpload" @close="showUpload = false" @uploaded="onUploaded" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { getPlatform } from '../constants/platforms.js'
import UploadDialog from '../components/UploadDialog.vue'

const router = useRouter()
const roms = ref([])
const trashRoms = ref([])
const loading = ref(true)
const trashLoading = ref(false)
const trashLoaded = ref(false)
const showUpload = ref(false)
const editingId = ref(null)
const editTitle = ref('')
const editInput = ref(null)
const activeTab = ref('active')
const pageSize = 10
const activeSearch = ref('')
const activePlatform = ref('all')
const activeVisibility = ref('all')
const activePage = ref(1)

const activePlatformOptions = computed(() => {
  const ids = [...new Set(roms.value.map((r) => r.platform).filter(Boolean))]
  return ids
    .map((id) => ({ id, label: platformLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
})

const filteredRoms = computed(() => {
  const q = activeSearch.value.trim().toLowerCase()
  return roms.value
    .filter((rom) => activePlatform.value === 'all' || rom.platform === activePlatform.value)
    .filter((rom) => {
      if (activeVisibility.value === 'public') return !!rom.isPublic
      if (activeVisibility.value === 'private') return !rom.isPublic
      return true
    })
    .filter((rom) => {
      if (!q) return true
      return `${rom.title || ''} ${rom.fileName || ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
})
const activePageCount = computed(() => Math.max(1, Math.ceil(filteredRoms.value.length / pageSize)))
const pagedRoms = computed(() => {
  const start = (activePage.value - 1) * pageSize
  return filteredRoms.value.slice(start, start + pageSize)
})
const activePageItems = computed(() => pageItems(activePage.value, activePageCount.value))

watch([activeSearch, activePlatform, activeVisibility], () => { activePage.value = 1 })
watch(activePageCount, (count) => {
  if (activePage.value > count) activePage.value = count
})

async function load() {
  loading.value = true
  try { roms.value = (await api.romsMine()).roms } finally { loading.value = false }
}
async function loadTrash() {
  trashLoading.value = true
  try { trashRoms.value = (await api.romsTrash()).roms }
  catch { trashRoms.value = [] }
  finally { trashLoading.value = false; trashLoaded.value = true }
}
onMounted(load)

function onSwitchTrash() {
  activeTab.value = 'trash'
  if (!trashLoaded.value) loadTrash()
}

function openUpload() { showUpload.value = true }
function onUploaded(r) {
  load()
  showUpload.value = false
}

async function togglePublic(rom, val) {
  try {
    await api.romUpdate(rom.id, { isPublic: val })
    await load()
  } catch (err) { alert(err.message) }
}

function startEdit(rom) {
  editingId.value = rom.id
  editTitle.value = rom.title
  nextTick(() => {
    const el = Array.isArray(editInput.value) ? editInput.value[0] : editInput.value
    el?.focus()
    el?.select()
  })
}
function cancelEdit() {
  editingId.value = null
  editTitle.value = ''
}
async function saveTitle(rom) {
  if (editingId.value !== rom.id) return
  const next = editTitle.value.trim()
  if (!next || next === rom.title) { cancelEdit(); return }
  const id = rom.id
  editingId.value = null
  try {
    const updated = await api.romUpdate(id, { title: next })
    rom.title = updated.title
  } catch (err) {
    alert(err?.message || '重命名失败')
  }
}

async function remove(rom) {
  if (!confirm(`删除 "${rom.title}"？将移至回收站，可随时恢复。`)) return
  try {
    await api.romDelete(rom.id)
    await load()
    trashLoaded.value = false
  } catch (err) {
    alert(err?.message || '删除失败')
  }
}

async function restore(rom) {
  try {
    await api.romRestore(rom.id)
    await load()
    if (trashLoaded.value) await loadTrash()
  } catch (err) {
    alert(err?.message || '恢复失败')
  }
}

async function purge(rom) {
  if (!confirm(`永久删除 "${rom.title}"？磁盘上的 ROM 文件、所有云存档以及子版本都会被抹除，不可恢复。`)) return
  try {
    await api.romDelete(rom.id, { permanent: true })
    await load()
    if (trashLoaded.value) await loadTrash()
  } catch (err) {
    alert(err?.message || '永久删除失败')
  }
}

function play(rom) { router.push(`/play/${rom.id}`) }
function pageItems(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const middle = [current - 1, current, current + 1]
    .filter((n) => n > 1 && n < count)
  const items = [1, ...middle, 'ellipsis', count]
  return items.filter((item, index) => items.indexOf(item) === index)
}
function jumpActivePage() {
  const input = prompt(`跳转到第几页？1 - ${activePageCount.value}`)
  if (!input) return
  const next = Number.parseInt(input, 10)
  if (!Number.isFinite(next)) return
  activePage.value = Math.min(Math.max(next, 1), activePageCount.value)
}
function platformColor(p) { return getPlatform(p).color }
function platformLabel(p) { return getPlatform(p).shortLabel }
function fmtSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}
function fmtTime(v) {
  if (v == null) return '—'
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleString('zh-CN', {
    year: sameYear ? undefined : 'numeric',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}
</script>

<style scoped>
.my-page { max-width: 960px; }

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 6px 12px 2px;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: transparent;
  color: #111;
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  white-space: nowrap;
}
.tab:hover:not(.active) {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.tab.active { color: #fff; background: #111; box-shadow: none; }
.tab .n {
  font-size: 11px;
  font-weight: 900;
  padding: 0;
  min-width: auto;
  text-align: center;
  border-radius: 0;
  background: transparent;
  color: #111;
  font-variant-numeric: tabular-nums;
}
.tab.active .n { background: transparent; color: #fff; }

.trash-hint {
  padding: 12px 16px;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.loading-card, .empty-card { text-align: center; padding: 56px 24px; }
.spinner {
  width: 28px; height: 28px; margin: 0 auto 12px;
  border-radius: 50%;
  border: 3px solid var(--border-color, #111);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-icon {
  width: 64px; height: 64px;
  margin: 0 auto 16px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  display: flex; align-items: center; justify-content: center;
  color: #111;
}
.empty-card h3 { margin: 0 0 6px; font-size: 16px; font-weight: 900; color: #111; }
.empty-card p, .loading-card p { margin: 0 0 18px; color: var(--text-tertiary); font-size: 14px; }

.rom-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px 140px;
  gap: 10px;
  margin-bottom: 16px;
}
.rom-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.88);
  color: #111;
}
.rom-search input {
  width: 100%;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: #111;
  font: inherit;
  font-weight: 800;
}
.rom-search input::placeholder { color: var(--text-quaternary); }
.filter-select {
  height: 40px;
  padding: 0 10px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.88);
  color: #111;
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  outline: none;
}
.rom-card-table { display: flex; flex-direction: column; gap: 14px; }
.rom-entry {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: transparent;
  transition: transform 0.2s, box-shadow 0.2s;
}
.rom-entry:hover {
  transform: translate(-3px, -3px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.rom-entry-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.rom-entry-title-wrap { min-width: 0; flex: 1; }
.rom-title-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #111;
  font: inherit;
  font-size: 16px;
  font-weight: 900;
  text-align: left;
  cursor: text;
}
.rom-title-button span {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.rom-title-button:hover .rt-pen { opacity: 1; }
.rom-entry-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-left: 22px;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 9px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: #fff;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
}
.pdot { width: 10px; height: 10px; margin-top: 7px; border-radius: 3px; flex-shrink: 0; border: 1px solid #111; }
.rt-pen { opacity: 0; flex-shrink: 0; color: var(--text-tertiary); transition: opacity var(--t-fast); }
.rt-edit { padding: 0; }
.rt-input {
  width: 100%;
  font-size: 16px; font-weight: 900;
  font-family: inherit;
  color: #111;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  padding: 6px 8px;
  outline: none;
  box-shadow: none;
}
.rf { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; overflow-wrap: anywhere; }
.plat-badge {
  --pc: var(--accent);
  display: inline-flex; align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 900;
  background: #fff;
  border: 2px solid var(--pc);
  color: var(--pc);
}

.col-actions { display: flex; gap: 6px; margin-left: auto; }

.switch { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.track {
  position: relative;
  width: 40px; height: 24px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  transition: background var(--t), border-color var(--t);
}
.thumb {
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: #111;
  border-radius: 5px;
  box-shadow: none;
  transition: transform var(--t) var(--ease-spring);
}
.switch input:checked + .track { background: #111; border-color: #111; }
.switch input:checked + .track .thumb { background: #fff; transform: translateX(16px); }
.switch-label { font-size: 12px; color: var(--text-tertiary); font-weight: 900; min-width: 28px; }
.switch input:checked ~ .switch-label { color: #111; }
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.page-btn {
  height: 38px;
  min-width: 42px;
  justify-content: center;
}
.page-number { padding: 0 12px; }
.pagination-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  min-width: 42px;
  color: #111;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

@media (max-width: 820px) {
  .rom-toolbar { grid-template-columns: 1fr; }
  .rom-entry-meta { padding-left: 0; }
  .col-actions { width: 100%; margin-left: 0; }
}
</style>
