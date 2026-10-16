<template>
  <Teleport to="body">
    <div class="mask" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="我的房间">
        <header class="dh">
          <h3>我的房间</h3>
          <p class="sub">我主持、还没关闭的房间</p>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <p v-if="!rooms.length" class="empty">
            还没有未关闭的房间<br />
            点「新建房间」开一局，之后回来这里就能找到
          </p>
          <div v-else class="list">
            <article
              v-for="r in rooms"
              :key="r.id"
              class="row"
            >
              <div class="row-top">
                <RomCover :rom="coverOf(r)" class="row-cover" />
                <div class="row-main">
                  <div class="row-title">
                    <span class="name">{{ r.name }}</span>
                    <span class="badge badge-warn">主持</span>
                    <span class="badge" :class="r.isPublic ? 'badge-success' : ''">
                      {{ r.isPublic ? '公开' : '私密' }}
                    </span>
                    <span v-if="r.hasPassword" class="badge">需密码</span>
                  </div>
                  <div class="row-meta">
                    <span class="meta-item">
                      <span class="pc-dot" :style="{ background: platformColor(r.romPlatform) }"></span>
                      {{ platformLabel(r.romPlatform) }} · {{ r.romTitle }}
                    </span>
                    <RoomCodeChip :code="r.code" />
                  </div>
                </div>
              </div>
              <!-- 动作占满卡片最下面一整行（不缩在封面右侧那一列里） -->
              <div class="row-actions" @click.stop>
                <button class="btn btn-sm btn-primary row-enter" @click="$emit('enter', r)">进入</button>
                <button class="btn btn-sm" @click="$emit('edit', r)">编辑</button>
                <button class="btn btn-sm btn-danger" @click="$emit('close-room', r)">关闭</button>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { getPlatform } from '../constants/platforms.js'
import RomCover from './RomCover.vue'
import RoomCodeChip from './RoomCodeChip.vue'

defineProps({
  // 「我主持的」那些房间（Rooms.vue 里筛好未关闭的），动作都由外层处理
  rooms: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'enter', 'edit', 'close-room'])

// 房间记录上带的是 romId / romTitle / romPlatform / romCoverUrl，拼成 RomCover 认的形状
function coverOf(room) {
  return {
    id: room.romId,
    title: room.romTitle,
    platform: room.romPlatform,
    coverUrl: room.romCoverUrl,
  }
}
function platformColor(p) { return getPlatform(p).color }
function platformLabel(p) { return getPlatform(p).shortLabel }

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 只是一份房间清单，弹窗压到 420px 宽：房间多时列表内部滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  max-height: 80dvh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.2s var(--ease-spring);
}
@keyframes popIn { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

.dh { flex: 0 0 auto; padding: 22px 56px 12px 22px; background: var(--clay-surface-flat); }
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }
.sub { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; }
.dlg-close { position: absolute; top: 14px; right: 14px; z-index: 2; }

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 18px 20px;
}

.empty {
  margin: 0;
  padding: 28px 18px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1.8;
  text-align: center;
  box-shadow: var(--clay-in-sm);
}

.list { display: flex; flex-direction: column; gap: 10px; }
/* 行本身不再是进房按钮（复制房间码时容易误触），只有「进入」按钮进房 */
.row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 0;
  border-radius: var(--r-lg);
  background: var(--clay-surface-alt);
  box-shadow: var(--clay-sm);
}

/* 上半行：封面 + 名称与信息 */
.row-top { display: flex; align-items: flex-start; gap: 12px; }
.row-cover { --cover-size: 46px; }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.row-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.name {
  font-size: 14px;
  font-weight: 900;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.row-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: var(--text-tertiary);
  flex-wrap: wrap;
}
.meta-item { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.pc-dot { width: 10px; height: 10px; border-radius: 14px; flex-shrink: 0; border: 0; }
/* 三个动作占一整行：主按钮（进入）拉伸，编辑 / 关闭保持胶囊宽度 */
.row-actions { display: flex; gap: 6px; }
.row-enter { flex: 1; }

@media (max-width: 600px) {
  .mask { padding: 16px; }
  .dialog-body { padding: 14px 14px 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .mask, .dialog { animation: none; }
}
</style>
