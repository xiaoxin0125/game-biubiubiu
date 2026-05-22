<template>
  <div class="gallery-page container">
    <section class="blog-hero">
      <div class="hero-profile">
        <div>
          <p class="hero-kicker">RETRO GAME LIBRARY</p>
          <h1>{{ settings.siteTitle }}</h1>
          <p>{{ settings.siteSubtitle || '把经典游戏整理成一页温暖、清爽、好访问的线上收藏夹。' }}</p>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-art-card hero-art-card-main">
          <div class="hero-art-screen">
            <span class="hero-art-pixel"></span>
            <span class="hero-art-pixel"></span>
            <span class="hero-art-pixel"></span>
          </div>
          <div class="hero-art-controls">
            <span class="hero-art-dpad"></span>
            <span class="hero-art-dot"></span>
            <span class="hero-art-dot hero-art-dot-alt"></span>
          </div>
        </div>
        <div class="hero-art-card hero-art-card-mini">ROM</div>
        <div class="hero-art-spark hero-art-spark-a"></div>
        <div class="hero-art-spark hero-art-spark-b"></div>
      </div>
      <div class="hero-actions">
        <div class="search blog-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input v-model="query" placeholder="搜索游戏" aria-label="搜索" />
        </div>
        <router-link v-if="isAuthed" to="/my" class="tab action-tab">上传 ROM</router-link>
        <router-link v-else to="/auth?mode=register" class="tab action-tab">注册</router-link>
      </div>
    </section>

    <div class="blog-tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'all' }"
        @click="activeTab = 'all'"
      >
        全部 <span class="n">{{ total }}</span>
      </button>
      <button
        v-if="isAuthed"
        class="tab tab-fav"
        :class="{ active: activeTab === 'favorites' }"
        :disabled="favoriteCount === 0"
        @click="activeTab = 'favorites'"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.3 5.82 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73L18.18 21z"/></svg>
        收藏 <span class="n">{{ favoriteCount }}</span>
      </button>
      <button
        v-for="[key, group] in Object.entries(tabGroups)"
        :key="key"
        class="tab"
        :class="{ active: activeTab === key }"
        :disabled="tabCount(key) === 0"
        @click="activeTab = key"
      >
        {{ group.label }} <span class="n">{{ tabCount(key) }}</span>
      </button>
    </div>

    <div v-if="loading" class="rom-card-grid">
      <article v-for="i in 4" :key="i" class="rom-card rom-card-skel">
        <div class="skeleton skel-avatar"></div>
        <div class="rom-card-content">
          <div class="skeleton" style="height: 16px; width: 48%;"></div>
          <div class="skeleton" style="height: 12px; width: 88%;"></div>
          <div class="skeleton" style="height: 12px; width: 62%;"></div>
        </div>
      </article>
    </div>
    <div v-else-if="!filtered.length" class="empty-state blog-empty">
      <h3>{{ query ? '没有匹配结果' : '游戏库为空' }}</h3>
      <p v-if="!query">{{ isAuthed ? '上传你的第一个 ROM' : '登录后可以上传自己的 ROM' }}</p>
      <p v-else>换个关键词试试</p>
      <router-link v-if="!query && isAuthed" to="/my" class="tab action-tab">去上传</router-link>
      <router-link v-if="!query && !isAuthed" to="/auth" class="tab action-tab">登录 / 注册</router-link>
      <button v-if="query" class="tab action-tab" @click="query = ''">清除搜索</button>
    </div>
    <div v-else class="rom-card-grid">
      <article
        v-for="rom in pagedRoms"
        :key="rom.id"
        class="rom-card"
        tabindex="0"
        @click="play(rom)"
        @keydown.enter="play(rom)"
        :aria-label="rom.title"
      >
        <div class="rom-avatar" :style="{ background: artBg(rom.platform) }">
          <span>{{ rom.title.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div class="rom-card-content">
          <h2 class="rom-card-title">{{ rom.title }}</h2>
          <p class="rom-card-desc">
            {{ platformLabel(rom.platform) }} 平台游戏{{ rom.owner ? `，由 @${rom.owner.username} 分享。` : '。' }}
          </p>
        </div>
        <div class="card-badges">
          <span class="version-badge" :title="`${(rom.versionCount || 0) + 1} 个版本`">
            {{ (rom.versionCount || 0) + 1 }} 版
          </span>
          <span
            class="status-badge"
            :style="{ '--platform-color': platformColor(rom.platform) }"
            :title="platformLabel(rom.platform)"
          >
            {{ platformLabel(rom.platform) }}
          </span>
        </div>
        <button
          v-if="isAuthed"
          class="fav-btn"
          :class="{ on: rom.isFavorite }"
          :title="rom.isFavorite ? '取消收藏' : '收藏'"
          @click.stop="toggleFavorite(rom)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" :fill="rom.isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 17.3 5.82 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73L18.18 21z"/></svg>
        </button>
      </article>
    </div>
    <nav v-if="!loading && filtered.length > pageSize" class="pagination" aria-label="ROM 分页">
      <button class="tab page-btn" type="button" :disabled="page <= 1" @click="page -= 1">‹ 上一页</button>
      <template v-for="(item, index) in pageItems" :key="`${item}-${index}`">
        <span v-if="item === 'ellipsis'" class="pagination-ellipsis">···</span>
        <button
          v-else
          class="tab page-btn page-number"
          :class="{ active: item === page }"
          type="button"
          @click="page = item"
        >
          {{ item }}
        </button>
      </template>
      <button class="tab page-btn" type="button" :disabled="page >= pageCount" @click="page += 1">下一页 ›</button>
      <button class="tab page-btn" type="button" @click="jumpToPage">跳转 »</button>
    </nav>

    <VersionPickerDialog
      v-if="pickerRom"
      :rom="pickerRom"
      @close="pickerRom = null"
      @pick="onVersionPicked"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'
import { tabGroups, getPlatform } from '../constants/platforms.js'
import { useSettings } from '../composables/useSettings.js'
import VersionPickerDialog from '../components/VersionPickerDialog.vue'

const router = useRouter()
const { isAuthed } = useAuth()
const { settings } = useSettings()
const guestPlayEnabled = computed(() => settings.value?.guestPlayEnabled === true || settings.value?.guestPlayEnabled === '1')

const roms = ref([])
const favoriteRoms = ref([])
const loading = ref(true)
const query = ref('')
const activeTab = ref('all')
const page = ref(1)
const pageSize = 10

async function loadPublic() {
  loading.value = true
  try { roms.value = (await api.romsPublic()).roms }
  catch { roms.value = [] }
  finally { loading.value = false }
}

async function loadFavorites() {
  if (!isAuthed.value) {
    favoriteRoms.value = []
    return
  }
  try { favoriteRoms.value = (await api.romsFavorites()).roms }
  catch { favoriteRoms.value = [] }
}

onMounted(async () => {
  await loadPublic()
  if (isAuthed.value) await loadFavorites()
})

watch(isAuthed, async (authed) => {
  await loadPublic()
  if (authed) await loadFavorites()
  else {
    favoriteRoms.value = []
    if (activeTab.value === 'favorites') activeTab.value = 'all'
  }
})

const total = computed(() => roms.value.length)
const favoriteCount = computed(() => favoriteRoms.value.length)

function tabCount(key) {
  const allowed = new Set(tabGroups[key]?.platforms || [])
  return roms.value.filter((r) => allowed.has(r.platform)).length
}

const filtered = computed(() => {
  let list = activeTab.value === 'favorites' ? favoriteRoms.value : roms.value
  if (activeTab.value !== 'all' && activeTab.value !== 'favorites') {
    const allowed = new Set(tabGroups[activeTab.value]?.platforms || [])
    list = list.filter((r) => allowed.has(r.platform))
  }
  const q = query.value.trim().toLowerCase()
  if (q) list = list.filter((r) => r.title.toLowerCase().includes(q))
  return [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const pagedRoms = computed(() => {
  const start = (page.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})
const pageItems = computed(() => {
  const count = pageCount.value
  const current = page.value
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)

  const middle = [current - 1, current, current + 1]
    .filter((n) => n > 1 && n < count)
  const items = [1, ...middle, 'ellipsis', count]
  return items.filter((item, index) => items.indexOf(item) === index)
})

watch([query, activeTab], () => { page.value = 1 })
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

function jumpToPage() {
  const input = prompt(`跳转到第几页？1 - ${pageCount.value}`)
  if (!input) return
  const next = Number.parseInt(input, 10)
  if (!Number.isFinite(next)) return
  page.value = Math.min(Math.max(next, 1), pageCount.value)
}

async function toggleFavorite(rom) {
  const prev = !!rom.isFavorite
  const setPublicFavorite = (value) => {
    const publicRom = roms.value.find((r) => r.id === rom.id)
    if (publicRom) publicRom.isFavorite = value
  }

  rom.isFavorite = !prev
  setPublicFavorite(!prev)
  try {
    if (prev) {
      await api.romUnfavorite(rom.id)
      favoriteRoms.value = favoriteRoms.value.filter((r) => r.id !== rom.id)
      if (activeTab.value === 'favorites' && favoriteRoms.value.length === 0) activeTab.value = 'all'
    } else {
      await api.romFavorite(rom.id)
      favoriteRoms.value = [{ ...rom, isFavorite: true }, ...favoriteRoms.value.filter((r) => r.id !== rom.id)]
    }
  } catch (err) {
    rom.isFavorite = prev
    setPublicFavorite(prev)
    alert(err?.message || '操作失败')
  }
}

function platformLabel(p) { return getPlatform(p).shortLabel }
function platformColor(p) { return getPlatform(p).color }
function artBg(p) {
  const c = getPlatform(p).color
  return `linear-gradient(135deg, ${c} 0%, ${c}dd 100%)`
}

const pickerRom = ref(null)

function play(rom) {
  if (!isAuthed.value && !(guestPlayEnabled.value && rom.isPublic)) {
    router.push(`/auth?redirect=${encodeURIComponent('/play/' + rom.id)}`)
    return
  }
  if (rom.versionCount > 0) {
    pickerRom.value = rom
    return
  }
  router.push(`/play/${rom.id}`)
}

function onVersionPicked(v) {
  pickerRom.value = null
  router.push(`/play/${v.id}`)
}
</script>

<style scoped>
.gallery-page {
  max-width: 960px;
}

.blog-hero {
  position: relative;
  margin: 28px 0 26px;
  padding: 34px;
  min-height: 238px;
  border: 2px solid #111;
  border-radius: var(--r-xl);
  background: radial-gradient(circle at 90% 10%, rgba(245, 158, 11, 0.20), transparent 28%), linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(255, 247, 237, 0.88));
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.blog-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(245, 158, 11, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(245, 158, 11, 0.08) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(90deg, transparent, #000 36%, #000 100%);
  pointer-events: none;
}
.hero-profile,
.hero-actions,
.hero-art { position: relative; z-index: 1; }
.hero-profile {
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: 570px;
}
.hero-art {
  position: absolute;
  right: 38px;
  top: 50%;
  width: 230px;
  height: 168px;
  transform: translateY(-50%);
  pointer-events: none;
}
.hero-art-card {
  position: absolute;
  border: 2px solid var(--border-color, #111);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 5px 5px 0 var(--border-color, #111);
}
.hero-art-card-main {
  inset: 18px 18px 10px 18px;
  padding: 18px;
  transform: rotate(-3deg);
}
.hero-art-screen {
  height: 72px;
  border: 2px solid #111;
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(234, 88, 12, 0.06)),
    #fff7ed;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: end;
  gap: 8px;
  padding: 14px;
}
.hero-art-pixel {
  display: block;
  height: 18px;
  border: 2px solid #111;
  border-radius: 6px;
  background: var(--accent-gradient);
}
.hero-art-pixel:nth-child(2) { height: 34px; background: #f97316; }
.hero-art-pixel:nth-child(3) { height: 26px; background: #facc15; }
.hero-art-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}
.hero-art-dpad {
  position: relative;
  width: 34px;
  height: 34px;
}
.hero-art-dpad::before,
.hero-art-dpad::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 5px;
  background: #111;
  transform: translate(-50%, -50%);
}
.hero-art-dpad::before { width: 34px; height: 12px; }
.hero-art-dpad::after { width: 12px; height: 34px; }
.hero-art-dot {
  width: 18px;
  height: 18px;
  border: 2px solid #111;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 24px 0 0 #f59e0b;
}
.hero-art-dot-alt { display: none; }
.hero-art-card-mini {
  right: 0;
  top: 0;
  width: 76px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #fff;
  color: #111;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  transform: rotate(7deg);
}
.hero-art-spark {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid #111;
  border-radius: 5px;
  background: #facc15;
  transform: rotate(16deg);
}
.hero-art-spark-a { left: 6px; top: 16px; }
.hero-art-spark-b { right: 16px; bottom: 0; background: #fb923c; transform: rotate(-12deg); }
.hero-kicker {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--accent);
  font-weight: 800;
}
.blog-hero h1 {
  margin: 0;
  font-size: clamp(30px, 5vw, 46px);
  line-height: 1.08;
  letter-spacing: -0.05em;
  color: var(--text-primary);
}
.blog-hero p:last-child {
  margin: 12px 0 0;
  max-width: 520px;
  color: var(--text-secondary);
  font-size: 15px;
}
.hero-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 28px;
  flex-wrap: wrap;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.88);
  border: 2px solid #111;
  border-radius: var(--r-pill);
  color: var(--text-tertiary);
  min-width: 260px;
  box-shadow: var(--shadow-xs);
  transition: border-color var(--t-fast), box-shadow var(--t-fast), background var(--t-fast);
}
.search:focus-within {
  background: #fff;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-ring);
}
.search input {
  flex: 1;
  height: 100%;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  min-width: 0;
}
.search input::placeholder { color: var(--text-quaternary); }

.blog-tabs {
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
.tab:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.tab.active {
  color: #ffffff;
  background: #111;
  box-shadow: none;
}
.tab:disabled { opacity: 0.45; cursor: not-allowed; }
.tab .n {
  font-size: 11px;
  font-weight: 900;
  padding: 1px 7px;
  min-width: 20px;
  text-align: center;
  border-radius: 7px;
  background: transparent;
  color: #111;
  font-variant-numeric: tabular-nums;
}
.tab.active .n { background: transparent; color: #ffffff; }
.action-tab { height: 40px; text-decoration: none; }
.tab-fav svg { color: var(--sys-yellow); }

.rom-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
}
.rom-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 100px;
  padding: 20px 16px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  overflow: hidden;
  cursor: pointer;
  outline: none;
  transition: transform 0.2s, box-shadow 0.2s;
}
.rom-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.rom-card:focus-visible {
  box-shadow: 0 0 0 4px var(--accent-ring);
}
.rom-avatar,
.skel-avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rom-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #111;
  color: #fff;
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.rom-card-content {
  min-width: 0;
  padding-right: 10px;
}
.rom-card-title {
  margin: 0 0 5px;
  color: #050505;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rom-card-desc {
  margin: 0;
  color: #1f2933;
  font-size: 13px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-badges {
  position: absolute;
  top: -2px;
  right: -2px;
  display: inline-flex;
  align-items: stretch;
  height: 26px;
  border: 2px solid #111;
  border-top: 0;
  border-right: 0;
  border-radius: 0 8px 0 8px;
  overflow: hidden;
  line-height: 1;
}
.version-badge,
.status-badge {
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}
.version-badge {
  background: #fff;
  color: #111;
  border-right: 2px solid #111;
}
.status-badge {
  background: color-mix(in srgb, var(--platform-color) 16%, #fff);
  color: var(--platform-color);
}

.fav-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid #111;
  background: #fff;
  color: #111;
  cursor: pointer;
  opacity: 0;
  z-index: 2;
  transition: opacity var(--t-fast), background var(--t-fast), transform var(--t-fast) var(--ease-spring);
}
.rom-card:hover .fav-btn,
.rom-card:focus-within .fav-btn,
.fav-btn.on { opacity: 1; }
.fav-btn.on { color: #f59e0b; background: #fff7ed; }
.fav-btn:hover { background: #fff7ed; transform: scale(1.08); }
.fav-btn:active { transform: scale(0.92); }

.rom-card-skel { cursor: default; }
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
.page-number {
  padding: 0 12px;
}
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
.blog-empty {
  margin: 24px auto 0;
  max-width: 520px;
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--bg-1);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 768px) {
  .gallery-page { max-width: 100%; }
  .blog-hero { margin-top: 18px; padding: 24px; min-height: auto; }
  .hero-profile { align-items: flex-start; max-width: none; }
  .hero-art { display: none; }
  .hero-actions { align-items: stretch; }
  .search { flex: 1 1 100%; min-width: 0; }
  .rom-card-grid { grid-template-columns: 1fr; gap: 16px; }
  .rom-card {
    min-height: 76px;
    padding: 14px 16px;
  }
  .rom-avatar,
  .skel-avatar { width: 50px; height: 50px; }
  .rom-card-title { font-size: 15px; margin-bottom: 4px; }
  .rom-card-desc { font-size: 11px; line-height: 1.35; }
}
@media (max-width: 480px) {
  .blog-hero { padding: 20px; border-radius: var(--r-lg); }
  .hero-profile { flex-direction: column; gap: 14px; }
}
</style>
