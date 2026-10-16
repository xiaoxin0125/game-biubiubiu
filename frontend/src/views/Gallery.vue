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
        :class="{ active: activeTab === 'name' }"
        @click="activeTab = 'name'"
      >
        默认 <span class="n">{{ tabCounts.name }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'latest' }"
        @click="activeTab = 'latest'"
      >
        最新 <span class="n">{{ tabCounts.latest }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'hot' }"
        @click="activeTab = 'hot'"
      >
        最热 <span class="n">{{ tabCounts.hot }}</span>
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'random' }"
        title="换个顺序看看，再点一次重新洗牌"
        @click="pickTab('random')"
      >
        随机 <span class="n">{{ tabCounts.random }}</span>
      </button>
      <button
        v-if="isAuthed"
        class="tab tab-fav"
        :class="{ active: activeTab === 'favorites' }"
        :disabled="favoriteGroupCount === 0"
        @click="activeTab = 'favorites'"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.3 5.82 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73L18.18 21z"/></svg>
        收藏 <span class="n">{{ favoriteGroupCount }}</span>
      </button>
      <ClaySelect
        v-model="activeGroup"
        class="group-select"
        aria-label="主机分类"
        :options="groupOptions"
      />
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
      <h3>{{ emptyTitle }}</h3>
      <p>{{ emptyHint }}</p>
      <button v-if="query" class="tab action-tab" @click="query = ''">清除搜索</button>
      <button v-else-if="!activeGroupIsAll" class="tab action-tab" @click="activeGroup = 'all'">查看全部主机</button>
      <template v-else-if="activeTab !== 'favorites'">
        <router-link v-if="isAuthed" to="/my" class="tab action-tab">去上传</router-link>
        <router-link v-else to="/auth" class="tab action-tab">登录 / 注册</router-link>
      </template>
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
        <div class="rom-card-cover-wrap">
          <RomCover :rom="rom" class="rom-card-cover" zoomable @zoom="coverRom = rom" />
          <button
            v-if="isAuthed"
            class="fav-btn"
            :class="{ on: rom.isFavorite }"
            :title="rom.isFavorite ? '取消收藏' : '收藏'"
            @click.stop="toggleFavorite(rom)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" :fill="rom.isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 17.3 5.82 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73L18.18 21z"/></svg>
          </button>
        </div>
        <div class="rom-card-content">
          <h2 class="rom-card-title">{{ rom.title }}</h2>
          <div class="card-badges">
            <span
              class="status-badge"
              :style="{ '--platform-color': platformColor(rom.platform) }"
              :title="platformLabel(rom.platform)"
            >
              {{ platformLabel(rom.platform) }}
            </span>
            <span class="version-badge" :title="`${(rom.versionCount || 0) + 1} 个版本`">
              {{ (rom.versionCount || 0) + 1 }} 版
            </span>
            <span v-if="rom.owner" class="owner-note">由 @{{ rom.owner.username }} 分享</span>
          </div>
        </div>
        <span class="heat-badge" :title="`被游玩 ${rom.playCount} 次`">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
          {{ rom.playCount }}
        </span>
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

    <CoverPreviewDialog
      v-if="coverRom"
      :rom="coverRom"
      @close="coverRom = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'
import { useAppDialog } from '../composables/useAppDialog.js'
import { getPlatform, platformFacets, resolvePlatformId } from '../constants/platforms.js'
import { useSettings } from '../composables/useSettings.js'
import VersionPickerDialog from '../components/VersionPickerDialog.vue'
import CoverPreviewDialog from '../components/CoverPreviewDialog.vue'
import RomCover from '../components/RomCover.vue'
import ClayPagination from '../components/ClayPagination.vue'
import ClaySelect from '../components/ClaySelect.vue'

const router = useRouter()
const { showAlert } = useAppDialog()
const { isAuthed } = useAuth()
const { settings } = useSettings()
const guestPlayEnabled = computed(() => settings.value?.guestPlayEnabled === true || settings.value?.guestPlayEnabled === '1')

const roms = ref([])
const favoriteRoms = ref([])
const loading = ref(true)
const query = ref('')
// 分类栏分两截：左边是「怎么看」（默认 / 最新 / 最热 / 随机 / 收藏，各自只摆一批：
// 默认整库、最新前 20、最热前 10、随机 10），右边下拉框是游戏机分类筛选（默认全部）。
// 两者叠加生效，例如「收藏 + 任天堂红白机」= 我收藏的 FC 游戏，叠加时先取标签那一批
// 再筛分类。打开页面用的就是这个默认：按名字排，不另外标注排序规则。
const activeTab = ref('name')
// 「随机」的顺序由种子决定：点一下换一个新种子（重新洗一次），翻页、搜索、换分类时
// 种子不变，所以已经翻过的顺序不会自己乱跳。
const shuffleSeed = ref(0)
const activeGroup = ref('all')
const page = ref(1)
const pageSize = 10
// 各标签一次摆多少盘：默认把整库摆开，最新只取时间序前 20，最热、随机各取 10。
// 先按这个上限截出一批，再在这一批里筛主机分类 / 搜索 —— 标签上的数字、分类下拉框
// 里的数量、分页都按这一批算，所以切标签时它们会一起变。
const TAB_LIMIT = { latest: 20, hot: 10, random: 10 }
// 标签的中文名：空列表的文案要说清「只摆了前 N 盘」，得把名字和上限写在一起
const TAB_NAME = { latest: '最新', hot: '最热', random: '随机' }

function pickTab(tab) {
  if (tab === 'random' && activeTab.value === 'random') shuffleSeed.value += 1
  activeTab.value = tab
}

// Fisher-Yates 洗牌，随机数由种子迭代出来（不用 Math.random）：同一个种子 + 同一份
// 列表洗出同一个顺序，computed 重算时页面不会莫名其妙换一批。
function shuffled(list, seed) {
  const out = [...list]
  let state = (Math.imul(seed + 1, 0x9e3779b1) >>> 0) || 0x1f123bb5
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

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
    if (activeTab.value === 'favorites') activeTab.value = 'name'
  }
})

const activeGroupIsAll = computed(() => activeGroup.value === 'all')

// 某个标签负责的那一批 ROM（还没按主机分类和搜索筛）。最新直接用接口给的顺序取前
// 20（游戏库按上传时间倒序、收藏按收藏时间倒序）；最热按游玩次数倒序取前 10；随机
// 按种子洗牌后取前 10；默认和收藏不截断，整份都摆开。
function listForTab(tab) {
  const list = tab === 'favorites' ? favoriteRoms.value : roms.value
  const limit = TAB_LIMIT[tab]
  if (!limit) return [...list]
  if (tab === 'hot') return [...list].sort((a, b) => Number(b.playCount || 0) - Number(a.playCount || 0)).slice(0, limit)
  if (tab === 'random') return shuffled(list, shuffleSeed.value).slice(0, limit)
  return list.slice(0, limit)
}

// 当前标签的这一批：列表、分类下拉框里的数量、分页都用它
const tabList = computed(() => listForTab(activeTab.value))

// 主机分类下拉框：一台游戏机一项（标签就是平台表里的「中文 (英文)」），后面跟这台
// 机器在当前这批 ROM 里的数量。区域别名（FC / NES、SFC / SNES、MD / Genesis）已经并成
// 一台机器，所以同一个名字不会出现两项，也不会出现「有这一项、下面一盘游戏都没有」
// 的空分类 —— 列表只给出真有游戏的机器。当前选中的那台即使暂时没有游戏也留在选项里，
// 触发器上不会忽然空掉（见 platformFacets 的 include）。
const groupOptions = computed(() => [
  { value: 'all', label: `全部 ${tabList.value.length}` },
  ...platformFacets(tabList.value, { include: activeGroupIsAll.value ? [] : [activeGroup.value] })
    .map((machine) => ({ value: machine.id, label: `${machine.label} ${machine.count}` })),
])

// ROM 记录上的平台按通用名比较：老记录里写着别名的也算进对应的游戏机。
function inGroup(rom, key) {
  if (!key || key === 'all') return true
  return resolvePlatformId(rom.platform) === key
}

// 某个分类下一共有多少盘（key 为 all 时不筛）。列表里的数量都走这个函数，
// 跟着下拉框选中的分类走：四个排序标签分别算自己那批的数量，收藏标签算我收藏的数量，
// 都是当前分类下的。
function groupCount(list, key) {
  if (!key || key === 'all') return list.length
  return list.filter((rom) => inGroup(rom, key)).length
}

// 四个排序标签上的数字各算各的：该标签自己那一批里选中分类下的盘数 —— 默认是整库、
// 最新最多 20、最热与随机最多 10，点哪个标签之前就知道会看到多少盘，不会选中一个
// 标签就把四个数字全改成它的数量。收藏标签另算，永远是我收藏的数量。
const tabCounts = computed(() => ({
  name: groupCount(listForTab('name'), activeGroup.value),
  latest: groupCount(listForTab('latest'), activeGroup.value),
  hot: groupCount(listForTab('hot'), activeGroup.value),
  random: groupCount(listForTab('random'), activeGroup.value),
}))
const favoriteGroupCount = computed(() => groupCount(favoriteRoms.value, activeGroup.value))

// 空列表的文案要分得清是「搜不到」「这个分类没有」还是「本来就还没东西」。
const activeGroupLabel = computed(() => (activeGroupIsAll.value ? '' : getPlatform(activeGroup.value).displayName))
const emptyTitle = computed(() => {
  if (query.value) return '没有匹配结果'
  if (!activeGroupIsAll.value) {
    if (activeTab.value === 'favorites') return `收藏里没有 ${activeGroupLabel.value} 的游戏`
    // 标签只摆前 N 盘时，这台机器的游戏可能只是没挤进这一批，别写成「还没有游戏」
    if (TAB_LIMIT[activeTab.value] && groupCount(roms.value, activeGroup.value) > 0) {
      return `${activeGroupLabel.value} 的游戏没进${TAB_NAME[activeTab.value]} ${TAB_LIMIT[activeTab.value]}`
    }
    return `${activeGroupLabel.value} 还没有游戏`
  }
  return activeTab.value === 'favorites' ? '还没有收藏' : '游戏库为空'
})
const emptyHint = computed(() => {
  if (query.value) return '换个关键词试试'
  if (!activeGroupIsAll.value) return '换个主机分类看看'
  if (activeTab.value === 'favorites') return '点卡片封面右上角的星星就能收藏'
  return isAuthed.value ? '上传你的第一个 ROM' : '登录后可以上传自己的 ROM'
})

const filtered = computed(() => {
  let list = tabList.value
  if (!activeGroupIsAll.value) list = list.filter((r) => inGroup(r, activeGroup.value))
  const q = query.value.trim().toLowerCase()
  if (q) list = list.filter((r) => r.title.toLowerCase().includes(q))
  const out = [...list]
  // 「默认」按游戏名排（中文按拼音、数字按自然序，和「我的 ROM」列表同一套规则）。
  // 其余标签的顺序在 tabList 里就定好了：最新是接口的时间倒序，最热是游玩次数倒序
  // （次数相同保持时间顺序，Array#sort 是稳定排序），随机是种子洗出来的顺序，不再动。
  if (activeTab.value === 'name') out.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
  return out
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const pagedRoms = computed(() => {
  const start = (page.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})

watch([query, activeTab, activeGroup], () => { page.value = 1 })
// 再点一次「随机」重新洗牌时也回到第一页，新的一批从头看
watch(shuffleSeed, () => { page.value = 1 })
// 换到没有收藏的分类时别把人留在空列表上（与取消最后一盘收藏时的处理一致）。
watch(activeGroup, () => {
  if (activeTab.value === 'favorites' && favoriteGroupCount.value === 0) activeTab.value = 'name'
})
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
      if (activeTab.value === 'favorites' && favoriteRoms.value.length === 0) activeTab.value = 'name'
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
// 点卡片封面看大图：只对有封面的游戏生效（RomCover 只在真的显示图片时才发 zoom）
const coverRom = ref(null)

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
  margin-bottom: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 6px 12px 2px;
}
/* 主机分类下拉框排在分类栏最末端，外观与旁边的胶囊标签一致 */
.group-select {
  --select-height: 34px;
  --select-min-height: 34px;
  --select-font-size: 13px;
  --select-padding: 0 34px 0 14px;
  --select-arrow-right: 13px;
  --select-bg: var(--clay-inset-surface);
  --select-color: var(--text-secondary);
  --select-shadow: var(--clay-in-sm);
  margin-left: auto;
  flex: 0 0 auto;
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
.rom-card-cover-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}
.rom-card-cover {
  --cover-size: 64px;
  --cover-radius: var(--r-sm);
}
/* 卡片内容：标题一行，下面一行标签（平台 / 版本 / 热度）加作者署名。
   标签与署名都在流里排，不再往卡片右上角浮一块，标题也不用为它留出空白。 */
.rom-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.rom-card-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 一行标签：各自独立的胶囊，中间留 6px，比原来连成一整块的长条轻一些 */
.card-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.version-badge,
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
  box-shadow: var(--clay-xs);
}
.version-badge {
  background: var(--clay-surface-flat);
  color: var(--text-primary);
}
.status-badge {
  /* 平台色只做浅底，文字改用与深梅子混合后的墨色，浅底上 ≥ 4.5:1 */
  background: color-mix(in srgb, var(--platform-color) 16%, #fff);
  color: color-mix(in srgb, var(--platform-color) 40%, var(--clay-ink));
}
/* 热度（游玩次数）单独摆在卡片末端：方块里火焰在上、次数在下，做成一小块
   竖直的计量块。方块用凹陷质感（像嵌进卡片的计数器），和旁边凸起的标签区分开；
   颜色仍是固定的梅子墨色，平台色那一大片红蓝绿橙紫金跟它都不撞。 */
.heat-badge {
  flex: 0 0 auto;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 42px;
  padding: 8px 8px 7px;
  border-radius: var(--r-md);
  background: var(--clay-inset-surface);
  color: var(--clay-ink);
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--clay-in-sm);
}
.heat-badge svg { flex-shrink: 0; opacity: 0.9; }
.owner-note {
  min-width: 0;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 收藏按钮贴在封面的右上角：不占卡片右下的位置，也不会被平台标签挡住 */
.fav-btn {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 22px;
  height: 22px;
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
  /* 分类栏分两行：标签一排，游戏机下拉框自己占一整行 —— 名字都是「中文 (英文)」，
     和标签挤在同一行只会被截断 */
  .blog-tabs { flex-wrap: wrap; overflow: visible; }
  .group-select { flex: 1 0 100%; --select-width: 100%; margin-left: 0; }
  /* 手机端标签不再带数量：标签本身已经占满一行，数字留给下拉框里的选项 */
  .blog-tabs .tab .n { display: none; }
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
  .rom-card-content { gap: 6px; }
  .rom-card-title { font-size: 15px; }
  .card-badges { gap: 5px; }
  .version-badge,
  .status-badge { height: 20px; padding: 0 8px; }
  .heat-badge { min-width: 38px; gap: 2px; padding: 6px 7px; font-size: 12px; }
  .heat-badge svg { width: 13px; height: 13px; }
  .owner-note { font-size: 11px; }
}
@media (max-width: 480px) {
  .blog-hero { padding: 20px; border-radius: var(--r-lg); }
  .blog-hero h1 { font-size: 24px; }
  .hero-art { --art-scale: 0.34; }
  .hero-profile { flex-direction: column; gap: 14px; }
}
</style>
