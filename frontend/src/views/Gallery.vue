<template>
  <div class="gallery-page container">
    <section class="blog-hero">
      <div class="hero-profile">
        <div>
          <span class="hero-kicker">游戏库</span>
          <h1>{{ settings.siteTitle }}</h1>
          <p>{{ settings.siteSubtitle || '把经典游戏整理成一页温暖、清爽、好访问的线上收藏夹。' }}</p>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-art-inner">
          <div class="hero-art-card hero-art-card-main">
            <div class="hero-art-screen">
              <span class="hero-art-pixel"></span>
              <span class="hero-art-pixel"></span>
              <span class="hero-art-pixel"></span>
            </div>
            <div class="hero-art-controls">
              <span class="hero-art-dpad"></span>
              <span class="hero-art-dots">
                <span class="hero-art-dot"></span>
                <span class="hero-art-dot hero-art-dot-alt"></span>
              </span>
            </div>
          </div>
          <div class="hero-art-card hero-art-card-mini">ROM</div>
          <div class="hero-art-spark hero-art-spark-a"></div>
          <div class="hero-art-spark hero-art-spark-b"></div>
        </div>
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
        @keydown.space.prevent="play(rom)"
        :aria-label="`${rom.title}，${platformLabel(rom.platform)} 平台，开始游戏`"
      >
        <RomCover :rom="rom" class="rom-card-cover" />
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
    <ClayPagination
      v-if="!loading && filtered.length > pageSize"
      v-model="page"
      :page-count="pageCount"
      aria-label="ROM 分页"
    />

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
import { useAppDialog } from '../composables/useAppDialog.js'
import { tabGroups, getPlatform } from '../constants/platforms.js'
import { useSettings } from '../composables/useSettings.js'
import VersionPickerDialog from '../components/VersionPickerDialog.vue'
import RomCover from '../components/RomCover.vue'
import ClayPagination from '../components/ClayPagination.vue'

const router = useRouter()
const { showAlert } = useAppDialog()
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

watch([query, activeTab], () => { page.value = 1 })
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

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
    await showAlert(err?.message || '操作失败')
  }
}

function platformLabel(p) { return getPlatform(p).shortLabel }
function platformColor(p) { return getPlatform(p).color }

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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 236px;
  grid-template-areas:
    "profile art"
    "actions art";
  align-content: center;
  row-gap: 28px;
  column-gap: 28px;
  margin: 28px 0 26px;
  padding: 34px;
  min-height: 238px;
  border: 0;
  border-radius: var(--r-2xl);
  background:
    radial-gradient(38% 60% at 88% 6%, rgba(255, 176, 211, 0.42), transparent 70%),
    radial-gradient(40% 70% at 8% 96%, rgba(207, 192, 255, 0.36), transparent 72%),
    var(--clay-surface);
  box-shadow: var(--clay-card);
  overflow: hidden;
}
.hero-profile {
  grid-area: profile;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: 570px;
}
/* 装饰插画占独立一列，文字永远不会压到插画上 */
.hero-art {
  grid-area: art;
  align-self: center;
  justify-self: end;
  position: relative;
  /* 内部按 236×190 绘制，外层只保留缩放后的占位尺寸 */
  width: calc(236px * var(--art-scale, 1));
  height: calc(190px * var(--art-scale, 1));
  pointer-events: none;
}
.hero-art-inner {
  position: absolute;
  top: 0;
  left: 0;
  width: 236px;
  height: 190px;
  transform: scale(var(--art-scale, 1));
  transform-origin: top left;
}
.hero-art-card {
  position: absolute;
  border: 0;
  border-radius: var(--r-lg);
  background: var(--clay-surface);
  box-shadow: var(--clay-md);
}
.hero-art-card-main {
  top: 16px;
  left: 16px;
  right: 16px;
  padding: 16px;
  transform: rotate(-3deg);
}
.hero-art-screen {
  height: 76px;
  border: 0;
  border-radius: var(--r-md);
  background:
    linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(234, 88, 12, 0.06)),
    #FFF9F2;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: end;
  gap: 10px;
  padding: 14px;
}
.hero-art-pixel {
  display: block;
  height: 18px;
  border: 0;
  border-radius: 18px;
  background: var(--accent-gradient);
}
.hero-art-pixel:nth-child(2) { height: 34px; background: var(--sys-orange); }
.hero-art-pixel:nth-child(3) { height: 26px; background: var(--sys-yellow); }
.hero-art-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}
.hero-art-dots { display: inline-flex; align-items: center; gap: 8px; }
.hero-art-dpad {
  position: relative;
  width: 36px;
  height: 36px;
}
.hero-art-dpad::before,
.hero-art-dpad::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 16px;
  background: var(--clay-primary-grad);
  transform: translate(-50%, -50%);
}
.hero-art-dpad::before { width: 36px; height: 12px; }
.hero-art-dpad::after { width: 12px; height: 36px; }
.hero-art-dot {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: var(--clay-primary-grad);
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.16),
              inset 1px 1px 3px rgba(255, 255, 255, 0.6);
}
.hero-art-dot-alt { display: inline-block; background: var(--sys-yellow); }
.hero-art-card-mini {
  right: 0;
  top: 0;
  width: 78px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  transform: rotate(7deg);
}
.hero-art-spark {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 16px;
  background: var(--sys-yellow);
  transform: rotate(16deg);
}
.hero-art-spark-a { left: 4px; top: 12px; }
.hero-art-spark-b { right: 12px; bottom: 2px; background: var(--sys-orange); transform: rotate(-12deg); }
.hero-kicker {
  display: inline-flex;
  align-items: center;
  margin: 0 0 12px;
  padding: 5px 14px;
  border-radius: var(--r-pill);
  background: var(--clay-pink-soft);
  color: #7A3D5C;
  font-size: 12px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
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
  grid-area: actions;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 14px;
  background: var(--clay-inset-surface);
  border: 0;
  border-radius: var(--r-pill);
  color: var(--text-tertiary);
  min-width: 260px;
  box-shadow: var(--clay-in-sm);
  transition: box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease);
}
.search:focus-within {
  background: var(--clay-in-deep);
  box-shadow: var(--clay-in-deep), 0 0 0 4px var(--accent-ring);
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
.tab:hover:not(:disabled) {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.tab:active:not(:disabled) { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.tab:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.tab.active {
  color: #ffffff;
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-sm);
}
.tab.active:hover { color: #ffffff; }
.tab:disabled { opacity: 0.45; cursor: not-allowed; }
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
.action-tab { height: 40px; text-decoration: none; }
.tab-fav svg { color: var(--ink-yellow); }

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
  border: 0;
  border-radius: var(--r-xl);
  overflow: hidden;
  cursor: pointer;
  outline: none;
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.rom-card:hover {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.rom-card:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.rom-card:focus-visible {
  box-shadow: var(--clay-focus);
}
.skel-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--r-sm);
  flex-shrink: 0;
}
/* 游戏卡片左侧展示封面：有图用图，没有图用默认卡带 SVG */
.rom-card-cover {
  --cover-size: 64px;
  --cover-radius: var(--r-sm);
}.rom-card-content {
  min-width: 0;
  padding-right: 10px;
}
.rom-card-title {
  margin: 0 0 5px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 只让标题行避开右上角标，描述仍可用满宽度 */
  padding-right: 116px;
}
.rom-card-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-badges {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: stretch;
  height: 26px;
  border: 0;
  border-radius: var(--r-pill);
  overflow: hidden;
  box-shadow: var(--clay-xs);
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
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  border-right: 0;
}
.status-badge {
  /* 平台色只做浅底，文字改用与深梅子混合后的墨色，浅底上 ≥ 4.5:1 */
  background: color-mix(in srgb, var(--platform-color) 16%, #fff);
  color: color-mix(in srgb, var(--platform-color) 40%, var(--clay-ink));
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
  border: 0;
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  cursor: pointer;
  opacity: 0;
  z-index: 2;
  box-shadow: var(--clay-xs);
  transition: opacity var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.rom-card:hover .fav-btn,
.rom-card:focus-within .fav-btn,
.fav-btn.on { opacity: 1; }
.fav-btn.on { color: var(--ink-yellow); background: var(--clay-lemon); }
.fav-btn:hover {
  background: var(--clay-cream);
  transform: translateY(-3px);
  box-shadow: var(--clay-lift-shadow);
}
.fav-btn:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.fav-btn:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.rom-card-skel { cursor: default; }
.blog-empty {
  margin: 24px auto 0;
  max-width: 520px;
  border: 0;
  border-radius: var(--r-2xl);
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
}

@media (max-width: 768px) {
  .gallery-page { max-width: 100%; }
  .blog-hero {
    margin-top: 18px;
    padding: 24px;
    min-height: auto;
    /* 标题一行放左侧、插画留在右上角，搜索与按钮的整行铺满 */
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "profile art"
      "actions actions";
    row-gap: 20px;
    column-gap: 12px;
  }
  .blog-hero h1 { font-size: 26px; }
  .hero-profile { align-items: flex-start; max-width: none; }
  .hero-art { --art-scale: 0.42; align-self: start; }
  .hero-actions {
    align-items: stretch;
    flex-wrap: nowrap;
    width: 100%;
    min-width: 0;
    gap: 8px;
  }
  .blog-search {
    flex: 1 1 auto;
    min-width: 0;
    width: auto;
  }
  .hero-actions .action-tab {
    flex: 0 0 auto;
    height: 42px;
    padding-left: 12px;
    padding-right: 12px;
  }
  .rom-card-grid { grid-template-columns: 1fr; gap: 16px; }
  .rom-card {
    min-height: 76px;
    padding: 14px 16px;
  }
  .rom-avatar,
  .skel-avatar { width: 50px; height: 50px; }
  .rom-card-content { padding-right: 10px; }
  .rom-card-title { font-size: 15px; margin-bottom: 4px; padding-right: 104px; }
  .rom-card-desc { font-size: 11px; line-height: 1.35; }
}
@media (max-width: 480px) {
  .blog-hero { padding: 20px; border-radius: var(--r-lg); }
  .blog-hero h1 { font-size: 24px; }
  .hero-art { --art-scale: 0.34; }
  .hero-profile { flex-direction: column; gap: 14px; }
}
</style>
