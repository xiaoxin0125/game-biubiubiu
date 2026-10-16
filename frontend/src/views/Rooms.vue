<template>
  <div class="rooms-page container">
    <header class="page-head">
      <div>
        <h1 class="page-title">对战大厅</h1>
        <p class="page-sub">和朋友一起开房联机，支持全平台主机和街机 · 游客可直接围观公开房间</p>
      </div>
      <div class="page-head-actions">
        <button class="btn" @click="showJoin = true">输入房间码</button>
        <button v-if="isAuthed" class="btn" @click="showMyRooms = true">我的房间</button>
        <button v-if="isAuthed" class="btn btn-primary" @click="showCreate = true">新建房间</button>
        <router-link v-else to="/auth" class="btn btn-primary">登录后创建</router-link>
      </div>
    </header>

    <section class="section">
      <h2 class="section-title">公开房间</h2>

      <div v-if="loading" class="state">
        <span class="spinner"></span> 加载中…
      </div>
      <div v-else-if="!publicRooms.length" class="empty-state">
        <h3>还没有公开房间</h3>
        <p>第一个创建房间的就是你啦</p>
      </div>
      <div v-else ref="gridRef" class="room-grid" :class="{ 'is-sized': coverSide > 0 }" :style="{ '--cover-side': `${coverSide}px` }">
        <article
          v-for="r in publicRooms"
          :key="r.id"
          class="room-card"
          :class="{ offline: r.hostOnline === false }"
        >
          <!-- 顶部是居中的房间名：点名字复制房间码（卡片本身点了不会进房） -->
          <header class="card-head">
            <RoomNameCopy :code="r.code" class="card-name">{{ r.name }}</RoomNameCopy>
          </header>

          <!-- 封面自己一块圆角插图，两边留白，不顶着卡片的圆角 -->
          <div class="card-cover-box">
            <div class="card-cover">
              <!-- 封面就是房间里正在跑的那盘游戏：房主换 ROM 后，卡片上的封面跟着换 -->
              <RomCover :rom="coverOf(r)" />
              <span class="cover-state" :class="r.hostOnline === false ? 'off' : 'on'">
                <span class="dot" :class="{ on: r.hostOnline, off: r.hostOnline === false }"></span>
                {{ r.hostOnline === false ? '离线' : '在线' }}
              </span>
              <span v-if="r.hasPassword" class="cover-lock" title="需要密码" aria-label="需要密码">
                <svg class="lock-ico" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                <span class="lock-text">需密码</span>
              </span>
            </div>
          </div>

          <div class="card-body">
            <p class="card-rom" :title="r.romTitle">
              <span class="pc-dot" :style="{ background: platformColor(r.romPlatform) }"></span>
              <span class="card-plat">{{ platformLabel(r.romPlatform) }}</span>
              <span class="card-rom-title">{{ r.romTitle }}</span>
            </p>
            <p class="card-host">@{{ r.hostUsername }}</p>
          </div>

          <footer class="card-foot">
            <button class="btn btn-sm btn-primary card-action" @click="pickRoom(r)">
              {{ actionLabel(r) }}
            </button>
          </footer>
        </article>
      </div>
    </section>

    <CreateRoomDialog v-if="showCreate" @close="showCreate = false" @created="onCreated" />
    <JoinRoomDialog v-if="showJoin || pendingRoom" :room="pendingRoom" @close="showJoin = false; pendingRoom = null" @joined="onJoined" />
    <EditRoomDialog v-if="editRoom" :room="editRoom" @close="editRoom = null" @updated="onEdited" />
    <MyRoomsDialog
      v-if="showMyRooms"
      :rooms="myOpenRooms"
      @close="showMyRooms = false"
      @enter="resume"
      @edit="editRoom = $event"
      @close-room="closeRoom"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'
import { useAppDialog } from '../composables/useAppDialog.js'
import { getPlatform } from '../constants/platforms.js'
import RomCover from '../components/RomCover.vue'
import RoomNameCopy from '../components/RoomNameCopy.vue'
import CreateRoomDialog from '../components/CreateRoomDialog.vue'
import JoinRoomDialog from '../components/JoinRoomDialog.vue'
import EditRoomDialog from '../components/EditRoomDialog.vue'
import MyRoomsDialog from '../components/MyRoomsDialog.vue'

const router = useRouter()
const { isAuthed, isAdmin } = useAuth()
const { showConfirm, showAlert } = useAppDialog()

const publicRooms = ref([])
const myRooms = ref([])
const loading = ref(true)
const showCreate = ref(false)
const showJoin = ref(false)
const showMyRooms = ref(false)
const pendingRoom = ref(null)
const editRoom = ref(null)

const myOpenRooms = computed(() => myRooms.value.filter((r) => !r.closedAt))

// 封面正方形的边长（px）。卡片宽度由栅格决定，所以直接量第一张卡片的封面盒子宽度，
// 写进 --cover-side 让封面按同样的像素值定高。不用 aspect-ratio / padding 百分比撑方，
// 是因为微信 X5 这类老 WebView 对它们的支持并不可靠——量出来的像素值在所有浏览器里
// 都一样。窗口缩放、卡片渲染出来都由 ResizeObserver 兜住。
const gridRef = ref(null)
const coverSide = ref(0)
let gridObserver = null

function measureCover() {
  const box = gridRef.value?.querySelector('.card-cover')
  if (!box) return
  const width = Math.round(box.getBoundingClientRect().width)
  if (width > 0 && width !== coverSide.value) coverSide.value = width
}

watch(gridRef, (el) => {
  gridObserver?.disconnect()
  gridObserver = null
  if (!el || typeof ResizeObserver === 'undefined') return
  gridObserver = new ResizeObserver(measureCover)
  gridObserver.observe(el)
  measureCover()
}, { flush: 'post' })

onBeforeUnmount(() => { gridObserver?.disconnect() })

async function load() {
  loading.value = true
  try {
    publicRooms.value = (await api.roomsPublic()).rooms
    if (isAuthed.value) {
      myRooms.value = (await api.roomsMine().catch(() => ({ rooms: [] }))).rooms
    }
  } catch { publicRooms.value = [] }
  finally { loading.value = false }
}
onMounted(load)

// 卡片封面用的是房间当前这盘游戏：有封面就显示图片，没有就用默认卡带图
function coverOf(room) {
  return {
    id: room.romId,
    title: room.romTitle,
    platform: room.romPlatform,
    coverUrl: room.romCoverUrl,
  }
}
// 这张卡片是不是我主持的房间：服务端按当前登录用户算好 isMine 一起下发
// （大厅匿名可读，所以不再下发房主的内部用户 ID，2026-10-16 重审 N-4）。
function isMine(r) {
  return r?.isMine === true
}

// 进这张卡片要不要先问密码。房主和管理员不用问：服务端本来就对这两种身份免密
// （server/routes/rooms.js 的 /join 与信令准入都放行），前端再拦一道只会让房主
// 进自己的房间还得输一遍自己设的密码。
function needsPasswordPrompt(r) {
  return !!r.hasPassword && !isMine(r) && !isAdmin.value
}

function actionLabel(r) {
  if (isMine(r)) return '进入'
  if (r.hostOnline === false) return isAuthed.value ? '等待' : '围观'
  return isAuthed.value ? '加入' : '围观'
}

function pickRoom(r) {
  if (needsPasswordPrompt(r)) pendingRoom.value = r
  else router.push(`/rooms/${r.code}/play/${r.romId}`)
}
function resume(r) { router.push(`/rooms/${r.code}/play/${r.romId}`) }
async function closeRoom(r) {
  if (!await showConfirm(`关闭房间 "${r.name}"？已连接的玩家会被踢出。`, {
    title: '关闭房间', confirmText: '关闭房间', danger: true,
  })) return
  try {
    await api.roomClose(r.code)
    myRooms.value = myRooms.value.filter((x) => x.code !== r.code)
    publicRooms.value = publicRooms.value.filter((x) => x.code !== r.code)
  } catch (err) { await showAlert(err?.message || '关闭失败') }
}
function onCreated(room) {
  showCreate.value = false
  myRooms.value = [room, ...myRooms.value]
  if (room.isPublic) publicRooms.value = [room, ...publicRooms.value]
  router.push(`/rooms/${room.code}/play/${room.romId}`)
}
function onJoined(room) {
  showJoin.value = false
  pendingRoom.value = null
  router.push(`/rooms/${room.code}/play/${room.romId}`)
}
function onEdited(room) {
  editRoom.value = null
  const i = myRooms.value.findIndex((r) => r.id === room.id)
  if (i !== -1) myRooms.value[i] = { ...myRooms.value[i], ...room }
  const j = publicRooms.value.findIndex((r) => r.id === room.id)
  if (j !== -1) {
    if (room.isPublic) publicRooms.value[j] = { ...publicRooms.value[j], ...room }
    else publicRooms.value.splice(j, 1)
  } else if (room.isPublic) publicRooms.value = [room, ...publicRooms.value]
}

function platformColor(p) { return getPlatform(p).color }
function platformLabel(p) { return getPlatform(p).shortLabel }
</script>

<style scoped>
.rooms-page { max-width: 960px; }

.section { margin-bottom: 32px; }
.section-title {
  font-size: 14px;
  font-weight: 900;
  color: var(--text-primary);
  margin: 0 0 12px;
  letter-spacing: 0.02em;
}

/* 房间卡片是竖版：顶部房间名、中间封面、下面信息与整行按钮。PC 一行 3 个、手机一行 2 个 */
.room-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.room-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-lg);
  outline: none;
  box-shadow: var(--clay-card);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.room-card:hover {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.room-card.offline { opacity: 0.78; }

/* 顶部一行只有居中的房间名：点名字复制房间码（不再另摆房间码胶囊，避免误触进房） */
.card-head {
  display: flex;
  justify-content: center;
  padding: 16px 16px 12px;
  font-size: 15px;
  color: var(--text-primary);
}
.card-name { --name-copy-hint: 0.45; }

/* 封面上下左右都留白，自己是一块圆角插图：不再顶着卡片的大圆角，四个角也不会互相较劲 */
.card-cover-box { padding: 0 16px; }

/* 封面是正方形，两条路一起上：
   1) 默认用 padding-bottom 百分比撑方（纯 CSS 兜底，JS 还没量到宽度时也不会塌）；
   2) JS 量出卡片宽度后给栅格加上 .is-sized，封面直接按 --cover-side 的像素值定高 ——
      不依赖 aspect-ratio、百分比高度和 inset，老 WebView 也不会变形。 */
.card-cover {
  position: relative;
  width: 100%;
  height: 0;
  padding-bottom: 100%;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--clay-sm);
}
.room-grid.is-sized .card-cover {
  height: var(--cover-side, 0px);
  padding-bottom: 0;
}
.card-cover :deep(.rom-cover) {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  --cover-radius: 0;
  box-shadow: none;
}
.cover-state {
  position: absolute;
  left: 8px;
  top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
}
.cover-state.on { color: var(--text-mint); }
.cover-state.off { color: var(--text-tertiary); }
.cover-lock {
  position: absolute;
  right: 8px;
  top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
}
.lock-ico { flex-shrink: 0; opacity: 0.75; }
.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.dot.on  { background: var(--success); }
.dot.off { background: var(--text-quaternary); }

.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 12px;
}
.card-rom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  min-width: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.card-plat { font-weight: 900; flex-shrink: 0; }
.card-rom-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.card-host {
  margin: 0;
  font-size: 11px;
  color: var(--text-quaternary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-dot { width: 10px; height: 10px; border-radius: 14px; flex-shrink: 0; border: 0; }

/* 主按钮自己占一整行：点哪都能进房，不再和房间码挤在半行里 */
.card-foot { padding: 0 16px 16px; }
.card-action { width: 100%; }

.state,
.empty-state {
  padding: 44px 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 0;
  border-radius: var(--r-xl);
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
}
.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  margin: 0 8px 0 0;
  border-radius: 50%;
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-xs);
  animation: clay-pulse 1s var(--clay-ease) infinite;
  vertical-align: -3px;
}

@media (max-width: 600px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .page-head-actions { flex-direction: row; flex-wrap: wrap; gap: 8px; }
  /* 手机端一张一行、卡片横过来：小封面在左、信息在右，比两列竖版大卡片好扫读。
     名称那行仍占卡片最上面一行，主按钮仍是最下面一整行。 */
  .room-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .room-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "head head"
      "cover body"
      "foot foot";
    align-items: center;
    gap: 10px 12px;
    padding: 14px;
  }
  .card-head { grid-area: head; padding: 0; font-size: 14px; }
  .card-cover-box { grid-area: cover; padding: 0; width: 88px; }
  .card-cover { border-radius: var(--r-sm); }
  /* 小封面上两个角标挤不下：「需密码」收成一颗小锁，在线状态缩一小圈 */
  .cover-state { left: 6px; top: 6px; padding: 2px 7px; font-size: 10px; gap: 4px; }
  .cover-lock { right: 6px; top: 6px; padding: 4px; }
  .cover-lock .lock-text { display: none; }
  .dot { width: 5px; height: 5px; }
  .card-body { grid-area: body; padding: 0; }
  .card-foot { grid-area: foot; padding: 0; }
}
</style>
