<template>
  <div class="my-info-page container">
    <header class="page-head">
      <div>
        <h1 class="page-title">我的信息</h1>
        <p class="page-sub">
          {{ user?.username ? `@${user.username} 的游玩记录：` : '' }}最近玩了哪些游戏、常玩哪台机器、收藏了哪些卡带。
        </p>
      </div>
      <div class="page-head-actions">
        <router-link to="/" class="btn btn-primary btn-sm">去游戏库</router-link>
      </div>
    </header>

    <div v-if="loading" class="panel-card loading-card">
      <div class="spinner"></div>
      <p>加载中…</p>
    </div>

    <template v-else>
      <section class="stat-row">
        <article class="stat-card">
          <span class="stat-label">游玩次数</span>
          <strong class="stat-value">{{ totalPlays }}</strong>
          <span class="stat-hint">每次成功启动模拟器算一次</span>
        </article>
        <article class="stat-card">
          <span class="stat-label">玩过的游戏</span>
          <strong class="stat-value">{{ plays.length }}</strong>
          <span class="stat-hint">按最近游玩排序</span>
        </article>
        <article class="stat-card">
          <span class="stat-label">收藏</span>
          <strong class="stat-value">{{ favorites.length }}</strong>
          <span class="stat-hint">在首页点封面右上角的星星</span>
        </article>
      </section>

      <div class="split-row">
        <section class="panel-card block-card">
          <div class="block-head">
            <h2 class="block-title">最近游玩</h2>
            <span class="block-sub">最近 5 盘</span>
          </div>
          <p v-if="!recentPlays.length" class="block-empty">还没有玩过任何游戏。</p>
          <ul v-else class="row-list">
            <li v-for="item in recentPlays" :key="item.rom.id" class="row-item">
              <RomCover :rom="item.rom" class="row-cover" />
              <div class="row-main">
                <div class="row-title">{{ item.rom.title }}</div>
                <div class="row-meta">
                  {{ platformLabel(item.rom.platform) }} · 玩过 {{ item.playCount }} 次 · {{ formatServerTime(item.lastPlayedAt) }}
                </div>
              </div>
              <router-link :to="`/play/${item.rom.id}`" class="tab row-action">继续玩</router-link>
            </li>
          </ul>
        </section>

        <section class="panel-card block-card">
          <div class="block-head">
            <h2 class="block-title">平台分布</h2>
            <span class="block-sub">次数最多的 5 个</span>
          </div>
          <p v-if="!topPlatforms.length" class="block-empty">还没有游玩记录，去游戏库开一局吧。</p>
          <ul v-else class="dist-list">
            <li v-for="item in topPlatforms" :key="item.platform" class="dist-item">
              <span class="dist-name" :style="{ '--platform-color': item.color }" :title="item.name">{{ item.label }}</span>
              <span class="dist-track">
                <span class="dist-fill" :style="{ width: `${item.percent}%`, '--platform-color': item.color }"></span>
              </span>
              <span class="dist-count">{{ item.count }} 次 · {{ item.percent }}%</span>
            </li>
          </ul>
        </section>
      </div>

      <section class="panel-card block-card">
        <div class="block-head">
          <h2 class="block-title">我的收藏</h2>
          <span class="block-sub">共 {{ favorites.length }} 盘</span>
        </div>
        <p v-if="!favorites.length" class="block-empty">还没有收藏，在首页把指针移到卡片封面，点右上角的星星就能收进来。</p>
        <ul v-else class="row-list">
          <li v-for="rom in favorites" :key="rom.id" class="row-item">
            <RomCover :rom="rom" class="row-cover" />
            <div class="row-main">
              <div class="row-title">{{ rom.title }}</div>
              <div class="row-meta">{{ platformLabel(rom.platform) }} · 热度 {{ rom.playCount || 0 }}</div>
            </div>
            <router-link :to="`/play/${rom.id}`" class="tab row-action">开始游戏</router-link>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'
import { getPlatform, platforms } from '../constants/platforms.js'
import { formatServerTime } from '../composables/formatTime.js'
import RomCover from '../components/RomCover.vue'

const { user } = useAuth()

const loading = ref(true)
const plays = ref([])
const favorites = ref([])

onMounted(async () => {
  try {
    const [mine, favs] = await Promise.all([
      api.romPlaysMine().catch(() => ({ plays: [] })),
      api.romsFavorites().catch(() => ({ roms: [] })),
    ])
    plays.value = mine.plays || []
    favorites.value = favs.roms || []
  } finally {
    loading.value = false
  }
})

const totalPlays = computed(() => plays.value.reduce((sum, item) => sum + Number(item.playCount || 0), 0))

// 平台分布：把每盘游戏的游玩次数按平台累加起来，再按次数从多到少排。
const distribution = computed(() => {
  const counts = new Map()
  for (const item of plays.value) {
    const platform = item.rom?.platform
    if (!platform) continue
    counts.set(platform, (counts.get(platform) || 0) + Number(item.playCount || 0))
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return [...counts.entries()]
    .map(([platform, count]) => ({
      platform,
      count,
      label: getPlatform(platform).shortLabel,
      // 并排一行后这一列只剩几十像素，短名显示、全名挂在 title 上
      name: getPlatform(platform).displayName,
      color: platforms[platform]?.color || 'var(--accent)',
      // 最少的也留 4% 宽度，不然长尾的平台条会细到看不见
      percent: total ? Math.max(4, Math.round((count / total) * 100)) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'))
})

// 最近游玩 + 平台分布并排一行：两边各只摆固定条数（5 / 5），列表不滚动，
// 行高由「最近 5 盘」那一块决定，另一块内容少就在框内下方留白。
const RECENT_PLAY_LIMIT = 5
const PLATFORM_LIMIT = 5
const recentPlays = computed(() => plays.value.slice(0, RECENT_PLAY_LIMIT))
const topPlatforms = computed(() => distribution.value.slice(0, PLATFORM_LIMIT))

function platformLabel(p) { return getPlatform(p).shortLabel }
</script>

<style scoped>
.my-info-page { max-width: 960px; }

/* 三张统计卡：数值最大、标签最小，和后台的概览卡同一套粘土表面 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 22px;
  border: 0;
  border-radius: var(--r-xl);
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
}
.stat-label { color: var(--text-tertiary); font-size: 12px; font-weight: 800; }
.stat-value {
  color: var(--text-primary);
  font-size: 30px;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.stat-hint { color: var(--text-quaternary); font-size: 11px; font-weight: 700; }

.loading-card { text-align: center; padding: 56px 24px; }
.loading-card p { margin: 0; color: var(--text-tertiary); font-size: 14px; }

.block-card { margin-bottom: 18px; }
/* 最近游玩（左）+ 平台分布（右）并排一行：两块等高，行高由左边「最近 5 盘」
   的内容决定；右边条数少，多出来的高度就是框内下方的留白。列表不滚动。 */
.split-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 18px;
  margin-bottom: 18px;
}
.split-row .block-card { margin-bottom: 0; }
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.block-title { margin: 0; font-size: 17px; font-weight: 900; color: var(--text-primary); }
.block-sub { color: var(--text-tertiary); font-size: 12px; font-weight: 800; }
.block-empty {
  margin: 0;
  padding: 18px;
  border-radius: var(--r-lg);
  background: var(--clay-surface-alt);
  color: var(--text-secondary);
  font-size: 13px;
  box-shadow: var(--clay-sm);
}

/* 平台分布：标签 + 凹槽里的填充条 + 次数 */
.dist-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.dist-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 86px;
  align-items: center;
  gap: 10px;
}
.dist-name {
  color: color-mix(in srgb, var(--platform-color) 40%, var(--clay-ink));
  font-size: 13px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dist-track {
  height: 16px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
  overflow: hidden;
}
.dist-fill {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: color-mix(in srgb, var(--platform-color) 62%, #fff);
  box-shadow: inset 2px 2px 4px rgba(255, 255, 255, 0.5);
}
.dist-count {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 最近游玩 / 收藏：一行一盘，横排封面 + 文字 + 动作 */
.row-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.row-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--r-lg);
  background: var(--clay-surface-alt);
  box-shadow: var(--clay-sm);
}
.row-cover { --cover-size: 46px; --cover-radius: var(--r-sm); }
.row-main { flex: 1; min-width: 0; }
.row-title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-meta {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-action {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: var(--clay-in-sm);
}
.row-action:hover {
  color: var(--text-primary);
  text-decoration: none;
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.row-action:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.row-action:focus-visible { outline: none; box-shadow: var(--clay-focus); }

@media (max-width: 768px) {
  .my-info-page { max-width: 100%; }
  .stat-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .stat-card { padding: 14px; gap: 4px; }
  .stat-value { font-size: 22px; }
  .stat-hint { display: none; }
  /* 两块改成上下排：一行放不下两列，各自按内容高度走，不留空白 */
  .split-row { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .dist-item { grid-template-columns: 72px minmax(0, 1fr) 78px; gap: 8px; }
  .dist-name { font-size: 12px; }
  .row-item { gap: 10px; padding: 10px; }
  .row-cover { --cover-size: 40px; }
}
@media (max-width: 480px) {
  .stat-hint { display: none; }
  .row-item { flex-wrap: wrap; }
  .row-action { margin-left: auto; padding: 0 12px; }
}
</style>
