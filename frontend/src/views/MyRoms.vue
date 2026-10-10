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
          <ClaySelect
            v-model="activePlatform"
            class="filter-select"
            aria-label="筛选平台"
            :options="activePlatformSelectOptions"
          />
          <ClaySelect
            v-model="activeVisibility"
            class="filter-select"
            aria-label="筛选公开状态"
            :options="activeVisibilitySelectOptions"
          />
        </div>

        <div v-if="!filteredRoms.length" class="panel-card empty-card">
          <h3>没有匹配的 ROM</h3>
          <p>换个平台、公开状态或关键词再试试</p>
        </div>
        <div v-else class="rom-card-table">
          <article v-for="rom in pagedRoms" :key="rom.id" class="rom-entry">
            <div class="rom-entry-main">
              <RomCover :rom="rom" class="entry-cover" />
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
              <span v-if="rom.storage === 'remote'" class="meta-chip" title="文件存放在远端存储服务器">远端</span>
              <span class="meta-chip">{{ fmtSize(rom.fileSize) }}</span>
              <span class="meta-chip">{{ formatServerTime(rom.createdAt) }}</span>
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
      <div v-else class="rom-card-table trash-card-table">
        <article v-for="rom in trashRoms" :key="rom.id" class="rom-entry trash-entry">
          <div class="rom-entry-main">
            <span class="pdot" :style="{ background: platformColor(rom.platform) }"></span>
            <div class="rom-entry-title-wrap">
              <div class="trash-title">{{ rom.title }}</div>
              <div class="rf">{{ rom.fileName }}</div>
            </div>
          </div>
          <div class="rom-entry-meta">
            <span class="plat-badge" :style="{ '--pc': platformColor(rom.platform) }">{{ platformLabel(rom.platform) }}</span>
            <span class="meta-chip">{{ fmtSize(rom.fileSize) }}</span>
            <span class="meta-chip">删除 {{ formatServerTime(rom.updatedAt) }}</span>
            <div class="col-actions">
              <button class="btn btn-sm btn-primary" @click="restore(rom)">恢复</button>
              <button class="btn btn-sm btn-danger" @click="purge(rom)">永久删除</button>
            </div>
          </div>
        </article>
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
import { formatServerTime } from '../composables/formatTime.js'
import UploadDialog from '../components/UploadDialog.vue'
import ClaySelect from '../components/ClaySelect.vue'
import RomCover from '../components/RomCover.vue'

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
const activePlatformSelectOptions = computed(() => [
  { value: 'all', label: '全部平台' },
  ...activePlatformOptions.value.map((p) => ({ value: p.id, label: p.label })),
])
const activeVisibilitySelectOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'public', label: '公开' },
  { value: 'private', label: '私密' },
]

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
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
  white-space: nowrap;
}
.tab:hover:not(.active) {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.tab:active:not(.active) { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.tab:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.tab.active { color: #fff; background: var(--clay-primary-grad); box-shadow: var(--clay-sm); }
.tab .n {
  font-size: 11px;
  font-weight: 900;
  padding: 1px 8px;
  min-width: 22px;
  text-align: center;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  box-shadow: var(--clay-xs);
}
.tab.active .n { background: rgba(255, 255, 255, 0.82); color: #7A3D5C; box-shadow: var(--clay-xs); }

.trash-hint {
  padding: 14px 18px;
  margin-bottom: 16px;
  background: var(--clay-surface-alt);
  border: 0;
  border-radius: var(--r-lg);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
  box-shadow: var(--clay-sm);
}

.loading-card, .empty-card { text-align: center; padding: 56px 24px; }
/* 加载指示器由 global.css 的 .clay-loader / .spinner 提供（挤压回弹，无线性旋转） */
.empty-icon {
  width: 64px; height: 64px;
  margin: 0 auto 16px;
  border-radius: var(--r-lg);
  background: var(--clay-surface);
  border: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-primary);
  box-shadow: var(--clay-md);
}
.empty-card h3 { margin: 0 0 6px; font-size: 16px; font-weight: 900; color: var(--text-primary); }
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
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-primary);
  box-shadow: var(--clay-in-sm);
}
.rom-search input {
  width: 100%;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 800;
}
.rom-search input::placeholder { color: var(--text-quaternary); }
.filter-select {
  --select-width: 100%;
  --select-height: 40px;
  --select-min-height: 40px;
  --select-font-size: 13px;
}
.rom-card-table { display: flex; flex-direction: column; gap: 14px; }
.rom-entry {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 0;
  border-radius: var(--r-xl);
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.rom-entry:hover {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.rom-entry:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
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
  color: var(--text-primary);
  font: inherit;
  font-size: 16px;
  font-weight: 900;
  text-align: left;
  cursor: text;
}
.trash-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 900;
  overflow-wrap: anywhere;
  word-break: break-word;
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
  padding: 0 11px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
}
.pdot { width: 10px; height: 10px; margin-top: 7px; border-radius: 14px; flex-shrink: 0; border: 0; }
/* ROM 条目的封面（无封面时是默认卡带 SVG） */
.entry-cover { --cover-size: 46px; }
.rt-pen { opacity: 0; flex-shrink: 0; color: var(--text-tertiary); transition: opacity var(--t-fast) var(--clay-ease); }
.rt-edit { padding: 0; }
.rt-input {
  width: 100%;
  font-size: 16px; font-weight: 900;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--clay-inset-surface);
  border: 0;
  border-radius: var(--r-md);
  padding: 8px 12px;
  outline: none;
  box-shadow: var(--clay-in);
}
.rt-input:focus { box-shadow: var(--clay-in-deep), 0 0 0 4px var(--accent-ring); }
.rf { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; overflow-wrap: anywhere; }
.plat-badge {
  --pc: var(--accent);
  display: inline-flex; align-items: center;
  height: 26px;
  padding: 0 12px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 900;
  background: color-mix(in srgb, var(--pc) 16%, #fff);
  border: 0;
  /* 平台色只做浅底，文字混入深梅子保证浅底上 ≥ 4.5:1 */
  color: color-mix(in srgb, var(--pc) 40%, var(--clay-ink));
  box-shadow: var(--clay-xs);
}

.col-actions { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }

.switch { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.track {
  position: relative;
  width: 44px; height: 26px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  border: 0;
  box-shadow: var(--clay-in-sm);
  transition: background var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: var(--clay-primary-grad);
  border-radius: var(--r-pill);
  box-shadow: var(--clay-xs);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.switch:active .thumb { transform: scaleX(1.08) scaleY(0.9); }
.switch input:checked + .track { background: var(--clay-primary-grad); box-shadow: var(--clay-sm); }
.switch input:checked + .track .thumb { background: var(--clay-surface-flat); transform: translateX(18px); }
.switch input:checked:active + .track .thumb { transform: translateX(18px) scaleX(1.08) scaleY(0.9); }
.switch-label { font-size: 12px; color: var(--text-tertiary); font-weight: 900; min-width: 28px; }
.switch input:checked ~ .switch-label { color: var(--text-primary); }
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
  color: var(--text-primary);
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
