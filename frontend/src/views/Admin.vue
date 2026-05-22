<template>
  <div class="admin container">
    <header class="page-head">
      <div>
        <h1 class="page-title">管理后台</h1>
        <p class="page-sub">管理用户、ROM 以及站点设置</p>
      </div>
    </header>

    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-icon icon-blue">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">用户</div>
          <div class="stat-value">{{ users.length }}</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon icon-orange">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">ROM</div>
          <div class="stat-value">{{ roms.length }}</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon icon-green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/><path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">公开 ROM</div>
          <div class="stat-value">{{ publicRomCount }}</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon icon-purple">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">管理员</div>
          <div class="stat-value">{{ adminCount }}</div>
        </div>
      </div>
    </div>

    <nav class="seg admin-seg">
      <button class="seg-btn" :class="{ active: tab === 'site' }" @click="tab = 'site'">站点</button>
      <button class="seg-btn" :class="{ active: tab === 'users' }" @click="tab = 'users'">用户</button>
      <button class="seg-btn" :class="{ active: tab === 'roms' }" @click="tab = 'roms'">ROM</button>
      <button class="seg-btn" :class="{ active: tab === 'bios' }" @click="tab = 'bios'">BIOS</button>
    </nav>

    <section v-if="tab === 'site'" class="panel-card panel">
      <h2 class="panel-title">站点设置</h2>
      <div class="field">
        <label class="label">网站名称</label>
        <input v-model.trim="form.siteTitle" class="input" maxlength="40" placeholder="Games Online" />
      </div>
      <div class="field">
        <label class="label">副标题</label>
        <input v-model.trim="form.siteSubtitle" class="input" maxlength="80" />
      </div>
      <label class="toggle-row">
        <div class="toggle-sw">
          <input type="checkbox" v-model="form.netplayEnabled" />
          <span class="sw-track"><span class="sw-thumb"></span></span>
        </div>
        <div class="toggle-text">
          <div class="tr-t">开启对战功能</div>
          <div class="tr-s">关闭后用户无法创建或加入房间；管理员不受影响</div>
        </div>
      </label>

      <label class="toggle-row">
        <div class="toggle-sw">
          <input type="checkbox" v-model="form.guestPlayEnabled" />
          <span class="sw-track"><span class="sw-thumb"></span></span>
        </div>
        <div class="toggle-text">
          <div class="tr-t">允许游客试玩</div>
          <div class="tr-s">开启后未登录用户可以试玩公开 ROM；存档和对战控制权仍然需要登录</div>
        </div>
      </label>

      <label class="toggle-row">
        <div class="toggle-sw">
          <input type="checkbox" v-model="form.userUploadEnabled" />
          <span class="sw-track"><span class="sw-thumb"></span></span>
        </div>
        <div class="toggle-text">
          <div class="tr-t">允许普通用户上传 ROM</div>
          <div class="tr-s">关闭后只有管理员可以上传 ROM，普通用户的上传接口会被拒绝</div>
        </div>
      </label>

      <div class="row-end">
        <button class="btn btn-primary" :disabled="savingSite" @click="saveSite">
          {{ savingSite ? '保存中…' : '保存' }}
        </button>
        <Transition name="saved">
          <span v-if="siteSaved" class="saved">已保存</span>
        </Transition>
      </div>
    </section>

    <section v-if="tab === 'users'" class="panel-card panel">
      <h2 class="panel-title">用户列表</h2>
      <div class="tbl">
        <div class="trow trow-head">
          <div>用户名</div><div>角色</div><div>注册时间</div><div class="right">操作</div>
        </div>
        <div v-for="u in users" :key="u.id" class="trow">
          <div class="u-name">
            <div class="avatar">{{ u.username.slice(0, 1).toUpperCase() }}</div>
            <span>{{ u.username }}</span>
          </div>
          <div>
            <span class="pill-tag" :class="u.role === 'admin' ? 'pill-admin' : 'pill-member'">
              {{ u.role === 'admin' ? '管理员' : '用户' }}
            </span>
          </div>
          <div class="muted">{{ fmtTime(u.createdAt) }}</div>
          <div class="actions">
            <template v-if="u.id !== me.id">
              <button class="btn btn-sm" @click="toggleRole(u)">
                {{ u.role === 'admin' ? '降为用户' : '设为管理员' }}
              </button>
              <button class="btn btn-sm btn-danger" @click="removeUser(u)">删除</button>
            </template>
            <span v-else class="muted">（当前账号）</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="tab === 'roms'" class="panel-card panel">
      <div class="panel-head">
        <h2 class="panel-title">全部 ROM</h2>
        <button class="btn btn-primary btn-sm" @click="openUpload">上传</button>
      </div>
      <div class="rom-toolbar">
        <div class="rom-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input v-model.trim="adminRomSearch" placeholder="搜索 ROM、文件名或上传者" />
        </div>
        <select v-model="adminRomPlatform" class="filter-select" aria-label="筛选平台">
          <option value="all">全部平台</option>
          <option v-for="p in adminRomPlatformOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <select v-model="adminRomVisibility" class="filter-select" aria-label="筛选公开状态">
          <option value="all">全部状态</option>
          <option value="public">公开</option>
          <option value="private">私密</option>
        </select>
      </div>

      <div v-if="!filteredAdminRoms.length" class="empty-state">没有匹配的 ROM</div>
      <div v-else class="admin-rom-list">
        <article v-for="r in pagedAdminRoms" :key="r.id" class="admin-rom-entry">
          <div class="admin-rom-main">
            <span class="pdot" :style="{ background: platColor(r.platform) }"></span>
            <div class="admin-rom-title-wrap">
              <div class="rt">{{ r.title }}</div>
              <div class="rf">{{ r.fileName }} · {{ fmtSize(r.fileSize) }}</div>
            </div>
          </div>
          <div class="admin-rom-meta">
            <span class="plat-badge" :style="{ '--pc': platColor(r.platform) }">{{ platLabel(r.platform) }}</span>
            <span class="meta-chip">@{{ r.owner?.username || '—' }}</span>
            <select
              class="select max-player-select"
              :value="r.maxPlayers ?? ''"
              :disabled="savingMaxPlayersId === r.id"
              @change="updateMaxPlayers(r, $event.target.value)"
            >
              <option value="">自动（{{ r.effectiveMaxPlayers || 4 }}P）</option>
              <option v-for="n in [1, 2, 3, 4]" :key="n" :value="n">{{ n }}P</option>
            </select>
            <span class="meta-chip">{{ fmtTime(r.createdAt) }}</span>
            <button
              class="pill-tag pill-toggle"
              :class="r.isPublic ? 'pill-pub' : 'pill-priv'"
              :disabled="togglingId === r.id"
              @click="togglePublic(r)"
              :title="r.isPublic ? '点击设为私密' : '点击设为公开'"
            >
              {{ togglingId === r.id ? '…' : (r.isPublic ? '公开' : '私密') }}
            </button>
            <div class="actions">
              <button class="btn btn-sm" @click="play(r)">试玩</button>
              <button class="btn btn-sm btn-danger" @click="deleteRom(r)">删除</button>
            </div>
          </div>
        </article>
      </div>

      <nav v-if="filteredAdminRoms.length > pageSize" class="pagination" aria-label="管理 ROM 分页">
        <button class="seg-btn page-btn" type="button" :disabled="adminRomPage <= 1" @click="adminRomPage -= 1">‹ 上一页</button>
        <template v-for="(item, index) in adminRomPageItems" :key="`${item}-${index}`">
          <span v-if="item === 'ellipsis'" class="pagination-ellipsis">···</span>
          <button
            v-else
            class="seg-btn page-btn page-number"
            :class="{ active: item === adminRomPage }"
            type="button"
            @click="adminRomPage = item"
          >
            {{ item }}
          </button>
        </template>
        <button class="seg-btn page-btn" type="button" :disabled="adminRomPage >= adminRomPageCount" @click="adminRomPage += 1">下一页 ›</button>
        <button class="seg-btn page-btn" type="button" @click="jumpAdminRomPage">跳转 »</button>
      </nav>
    </section>

    <section v-if="tab === 'bios'" class="panel-card panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">BIOS 文件</h2>
          <p class="panel-sub">当前只列出运行时会加载的 BIOS 目录；文件来自服务器的 <code>data/bios/&lt;platform&gt;</code>。</p>
        </div>
        <button class="btn btn-sm" :disabled="biosLoading" @click="loadBios">
          {{ biosLoading ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <div v-if="biosLoading && !biosItems.length" class="empty-state">正在读取 BIOS 列表…</div>
      <div v-else class="bios-grid">
        <article v-for="item in biosItems" :key="item.platform" class="bios-card">
          <header class="bios-head">
            <div>
              <div class="bios-title">
                <span class="pdot" :style="{ background: platColor(item.platform) }"></span>
                {{ item.label }}
              </div>
              <div class="bios-path">data/bios/{{ item.platform }}</div>
            </div>
            <span class="pill-tag" :class="item.missing.length ? 'pill-warn' : 'pill-pub'">
              {{ item.files.length }}/{{ item.required.length }}
            </span>
          </header>

          <div class="bios-files">
            <div v-for="file in item.files" :key="file.name" class="bios-file">
              <span class="bios-name">{{ file.name }}</span>
              <span class="muted">{{ fmtSize(file.size) }}</span>
            </div>
            <div v-if="!item.files.length" class="muted">目录为空或不存在</div>
          </div>

          <div v-if="item.missing.length" class="bios-missing">
            缺少：{{ item.missing.join('、') }}
          </div>
          <div v-else class="bios-ok">必需文件已就绪</div>
        </article>
      </div>
    </section>

    <UploadDialog v-if="showUpload" @close="showUpload = false" @uploaded="onUploaded" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'
import { useSettings } from '../composables/useSettings.js'
import { getPlatform } from '../constants/platforms.js'
import UploadDialog from '../components/UploadDialog.vue'

const router = useRouter()
const { user: me } = useAuth()
const { updateLocal } = useSettings()

const tab = ref('site')
const form = reactive({
  siteTitle: '',
  siteSubtitle: '',
  netplayEnabled: true,
  guestPlayEnabled: false,
  userUploadEnabled: true,
})
const savingSite = ref(false)
const siteSaved = ref(false)

const users = ref([])
const roms = ref([])
const biosItems = ref([])
const biosLoading = ref(false)
const showUpload = ref(false)
const pageSize = 10
const adminRomSearch = ref('')
const adminRomPlatform = ref('all')
const adminRomVisibility = ref('all')
const adminRomPage = ref(1)

const adminRomPlatformOptions = computed(() => {
  const ids = [...new Set(roms.value.map((r) => r.platform).filter(Boolean))]
  return ids
    .map((id) => ({ id, label: platLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
})
const filteredAdminRoms = computed(() => {
  const q = adminRomSearch.value.trim().toLowerCase()
  return roms.value
    .filter((rom) => adminRomPlatform.value === 'all' || rom.platform === adminRomPlatform.value)
    .filter((rom) => {
      if (adminRomVisibility.value === 'public') return !!rom.isPublic
      if (adminRomVisibility.value === 'private') return !rom.isPublic
      return true
    })
    .filter((rom) => {
      if (!q) return true
      return `${rom.title || ''} ${rom.fileName || ''} ${rom.owner?.username || ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
})
const adminRomPageCount = computed(() => Math.max(1, Math.ceil(filteredAdminRoms.value.length / pageSize)))
const pagedAdminRoms = computed(() => {
  const start = (adminRomPage.value - 1) * pageSize
  return filteredAdminRoms.value.slice(start, start + pageSize)
})
const adminRomPageItems = computed(() => pageItems(adminRomPage.value, adminRomPageCount.value))

const publicRomCount = computed(() => roms.value.filter((r) => r.isPublic).length)
const adminCount = computed(() => users.value.filter((u) => u.role === 'admin').length)

watch([adminRomSearch, adminRomPlatform, adminRomVisibility], () => { adminRomPage.value = 1 })
watch(adminRomPageCount, (count) => {
  if (adminRomPage.value > count) adminRomPage.value = count
})

onMounted(async () => {
  loadUsers(); loadRoms(); loadBios()
  try {
    const s = await api.adminSettings()
    form.siteTitle = s.siteTitle || ''
    form.siteSubtitle = s.siteSubtitle || ''
    form.netplayEnabled = s.netplayEnabled === '1'
    form.guestPlayEnabled = s.guestPlayEnabled === '1'
    form.userUploadEnabled = s.userUploadEnabled !== '0'
  } catch {}
})

async function saveSite() {
  savingSite.value = true
  siteSaved.value = false
  try {
    const next = await api.adminUpdateSettings({
      siteTitle: form.siteTitle,
      siteSubtitle: form.siteSubtitle,
      netplayEnabled: form.netplayEnabled,
      guestPlayEnabled: form.guestPlayEnabled,
      userUploadEnabled: form.userUploadEnabled,
    })
    updateLocal({
      siteTitle: next.siteTitle,
      siteSubtitle: next.siteSubtitle,
      netplayEnabled: next.netplayEnabled === '1',
      guestPlayEnabled: next.guestPlayEnabled === '1',
      userUploadEnabled: next.userUploadEnabled !== '0',
    })
    siteSaved.value = true
    setTimeout(() => { siteSaved.value = false }, 1600)
  } catch (err) { alert(err?.message || '保存失败') }
  finally { savingSite.value = false }
}

async function loadUsers() { try { users.value = (await api.adminUsers()).users } catch {} }
async function loadRoms()  { try { roms.value  = (await api.adminRoms()).roms   } catch {} }
async function loadBios() {
  biosLoading.value = true
  try {
    biosItems.value = (await api.adminBios()).bios || []
  } catch (err) {
    alert(err?.message || '读取 BIOS 列表失败')
  } finally {
    biosLoading.value = false
  }
}

async function toggleRole(u) {
  const nextRole = u.role === 'admin' ? 'user' : 'admin'
  if (!confirm(`确认将 ${u.username} 设为 ${nextRole === 'admin' ? '管理员' : '普通用户'} ？`)) return
  try {
    const updated = await api.adminUpdateUser(u.id, { role: nextRole })
    u.role = updated.role
  } catch (err) { alert(err.message) }
}

async function removeUser(u) {
  if (!confirm(`删除用户 ${u.username} 及其所有 ROM？该操作不可撤销。`)) return
  try {
    await api.adminDeleteUser(u.id)
    users.value = users.value.filter((x) => x.id !== u.id)
    loadRoms()
  } catch (err) { alert(err.message) }
}

function openUpload() { showUpload.value = true }
function onUploaded() {
  loadRoms()
  showUpload.value = false
}

async function deleteRom(r) {
  if (!confirm(`删除 "${r.title}" ？将移至回收站，用户可在「我的 ROM」里恢复。`)) return
  await api.romDelete(r.id)
  await loadRoms()
}

const togglingId = ref(null)
const savingMaxPlayersId = ref(null)
async function togglePublic(r) {
  togglingId.value = r.id
  try {
    await api.romUpdate(r.id, { isPublic: !r.isPublic })
    await loadRoms()
  } catch (err) {
    alert(err?.message || '切换失败')
  } finally {
    togglingId.value = null
  }
}

async function updateMaxPlayers(r, value) {
  savingMaxPlayersId.value = r.id
  try {
    const maxPlayers = value === '' ? null : Number(value)
    await api.romUpdate(r.id, { maxPlayers })
    await loadRoms()
  } catch (err) {
    alert(err?.message || '保存人数失败')
  } finally {
    savingMaxPlayersId.value = null
  }
}

function play(r) { router.push(`/play/${r.id}`) }
function pageItems(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const middle = [current - 1, current, current + 1]
    .filter((n) => n > 1 && n < count)
  const items = [1, ...middle, 'ellipsis', count]
  return items.filter((item, index) => items.indexOf(item) === index)
}
function jumpAdminRomPage() {
  const input = prompt(`跳转到第几页？1 - ${adminRomPageCount.value}`)
  if (!input) return
  const next = Number.parseInt(input, 10)
  if (!Number.isFinite(next)) return
  adminRomPage.value = Math.min(Math.max(next, 1), adminRomPageCount.value)
}
function platColor(p) { return getPlatform(p).color }
function platLabel(p) { return getPlatform(p).shortLabel }
function fmtSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}
function fmtTime(v) {
  if (v == null) return '—'
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.admin { max-width: 960px; }

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: transparent;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  box-shadow: none;
  transition: transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}

.stat-icon {
  width: 44px; height: 44px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.icon-blue   { color: var(--sys-blue); }
.icon-orange { color: var(--sys-orange); }
.icon-green  { color: var(--sys-green); }
.icon-purple { color: var(--sys-purple); }

.stat-body { min-width: 0; }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 2px; font-weight: 900; }
.stat-value {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: #111;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.admin-seg { margin-bottom: 20px; }

.panel { padding: 24px; }
.panel-title { font-size: 16px; font-weight: 900; margin: 0 0 16px; color: #111; }
.panel-sub { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; line-height: 1.6; }
.panel-sub code {
  padding: 1px 5px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  color: #111;
  font-family: ui-monospace, 'SF Mono', monospace;
}
.panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 16px; }

.field { margin-bottom: 16px; max-width: 480px; }

.toggle-row {
  display: flex; align-items: center; gap: 14px;
  margin: 18px 0 22px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.46);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  cursor: pointer;
  max-width: 480px;
}
.toggle-sw { position: relative; flex-shrink: 0; }
.toggle-sw input { position: absolute; inset: 0; opacity: 0; cursor: pointer; margin: 0; }
.sw-track {
  display: block; width: 40px; height: 24px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  position: relative;
  transition: all var(--t);
}
.sw-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: #111;
  border-radius: 5px;
  box-shadow: none;
  transition: transform var(--t) var(--ease-spring);
}
.toggle-sw input:checked + .sw-track { background: #111; border-color: #111; }
.toggle-sw input:checked + .sw-track .sw-thumb { background: #fff; transform: translateX(16px); }
.tr-t { font-size: 14px; font-weight: 900; color: #111; }
.tr-s { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

.row-end { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
.saved { color: var(--success); font-size: 13px; font-weight: 900; }
.saved-enter-active, .saved-leave-active { transition: all 0.2s var(--ease-out); }
.saved-enter-from, .saved-leave-to { opacity: 0; transform: translateY(4px); }

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
.admin-rom-list { display: flex; flex-direction: column; gap: 14px; }
.admin-rom-entry {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: transparent;
  transition: transform 0.2s, box-shadow 0.2s;
}
.admin-rom-entry:hover {
  transform: translate(-3px, -3px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.admin-rom-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.admin-rom-title-wrap { min-width: 0; flex: 1; }
.admin-rom-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-left: 22px;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 9px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: #fff;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
}
.tbl { display: flex; flex-direction: column; gap: 2px; }
.trow {
  display: grid;
  grid-template-columns: 2fr 1fr 1.2fr 180px;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 7px;
  transition: background var(--t-fast);
}
.trow-roms { grid-template-columns: 2fr 110px 1fr 120px 160px 90px 170px; }
.trow:not(.trow-head):hover { background: rgba(17, 17, 17, 0.06); }
.trow-head {
  font-size: 12px; font-weight: 900; color: #111;
  padding: 10px 14px;
  border-bottom: 2px solid var(--border-color, #111);
  border-radius: 0;
}
.right { text-align: right; }

.u-name { display: flex; align-items: center; gap: 12px; min-width: 0; }
.avatar {
  width: 32px; height: 32px;
  border-radius: 7px;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  color: #111;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 900;
  flex-shrink: 0;
}
.pdot { width: 10px; height: 10px; margin-top: 7px; border-radius: 3px; flex-shrink: 0; border: 1px solid #111; }
.rt { font-size: 16px; font-weight: 900; color: #111; overflow-wrap: anywhere; word-break: break-word; }
.rf { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; overflow-wrap: anywhere; }
.muted { color: var(--text-tertiary); font-size: 13px; }

.actions { display: flex; gap: 6px; justify-content: flex-end; margin-left: auto; }
.max-player-select {
  width: 126px;
  height: 30px;
  padding: 0 8px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: #fff;
  color: #111;
  font-size: 12px;
  font-weight: 900;
}

.pill-tag {
  display: inline-flex; align-items: center;
  padding: 3px 10px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 900;
  border: 2px solid var(--border-color, #111);
  background: #fff;
}
.pill-admin  { color: var(--accent); }
.pill-member { color: var(--text-secondary); }
.pill-pub    { color: var(--success); }
.pill-priv   { color: var(--text-tertiary); }
.pill-warn   { color: var(--warn); }

.bios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.bios-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: transparent;
  transition: transform 0.2s, box-shadow 0.2s;
}
.bios-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.bios-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.bios-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 900;
  color: #111;
}
.bios-path {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
}
.bios-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 28px;
}
.bios-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  border: 2px solid var(--border-color, #111);
}
.bios-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 12px;
  color: #111;
}
.bios-ok,
.bios-missing,
.empty-state {
  padding: 10px 12px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: #fff;
  font-size: 12px;
  line-height: 1.5;
}
.bios-ok { color: var(--success); }
.bios-missing { color: var(--warn); }
.empty-state { color: var(--text-tertiary); }

.pill-toggle {
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.2s, box-shadow 0.2s;
}
.pill-toggle:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 3px 3px 0 var(--border-color, #111);
}
.pill-toggle:disabled { opacity: 0.6; cursor: wait; }

.plat-badge {
  --pc: var(--accent);
  display: inline-flex; align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 900;
  background: #fff;
  border: 2px solid var(--pc);
  color: var(--pc);
}
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

@media (max-width: 900px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .rom-toolbar { grid-template-columns: 1fr; }
  .admin-rom-meta { padding-left: 0; }
  .actions { width: 100%; margin-left: 0; }
  .trow, .trow-roms { grid-template-columns: 1fr 1fr; gap: 10px; }
  .trow > div:nth-child(n+3), .trow-head > div:nth-child(n+3) { display: none; }
}
</style>
