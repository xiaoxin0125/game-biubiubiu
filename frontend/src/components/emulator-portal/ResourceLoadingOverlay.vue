<template>
  <div class="resource-loading">
    <div class="loading-stack">
      <div class="loading-glow"></div>
      <div class="spinner"></div>
    </div>

    <p class="loading-title">
      <span class="dot" style="--i:0"></span><span class="dot" style="--i:1"></span><span class="dot" style="--i:2"></span>
      INSERT COIN
    </p>
    <p class="loading-game">{{ title }}</p>
    <p class="loading-stage">{{ stageLine }}</p>

    <!-- 有具体资源任务时才画进度条：只读元数据的那一小段不需要百分比。 -->
    <div v-if="overall.hasTasks" class="load-progress">
      <div class="load-bar" :class="{ indeterminate: overall.ratio == null }">
        <div class="load-bar-fill" :style="fillStyle"></div>
      </div>

      <div class="load-meta">
        <span v-if="overall.ratio != null" class="load-pct">{{ Math.round(overall.ratio * 100) }}%</span>
        <span class="load-count">{{ overall.completed }}/{{ overall.totalCount }} 项</span>
        <span v-if="overall.totalBytes" class="load-bytes">{{ formatBytes(overall.loadedBytes) }} / {{ formatBytes(overall.totalBytes) }}</span>
        <span v-else-if="overall.loadedBytes" class="load-bytes">已读取 {{ formatBytes(overall.loadedBytes) }}</span>
      </div>

      <ul class="load-tasks">
        <li v-for="task in progress.tasks" :key="task.id" class="load-task" :class="`is-${task.status}`">
          <span class="t-dot"></span>
          <span class="t-label">{{ task.label }}</span>
          <span class="t-state">{{ progress.statusTextFor(task) }}</span>
          <span v-if="task.size" class="t-bytes">{{ formatBytes(task.loaded) }} / {{ formatBytes(task.size) }}</span>
        </li>
      </ul>
    </div>

    <p v-if="hint" class="loading-hint">{{ hint }}</p>
    <button v-if="progress.failure" class="btn btn-sm loading-retry" @click="emit('retry')">重新加载</button>
    <button v-else-if="slow" class="btn btn-sm loading-retry" @click="emit('retry')">长时间未加载，点此刷新</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 游戏名，用于"这是哪一局"的提示
  title: { type: String, default: '' },
  // useResourceLoadProgress() 返回的会话对象（reactive，模板里直接读属性）
  progress: { type: Object, required: true },
  // 平台相关的补充说明（首次加载较慢之类）
  hint: { type: String, default: '' },
  slow: { type: Boolean, default: false },
})
const emit = defineEmits(['retry'])

const overall = computed(() => props.progress.overall)

const stageLine = computed(() => {
  const progress = props.progress
  if (progress.failure) return `加载失败：${progress.failure.label}`
  if (progress.stage === 'ready') return '启动完成'
  if (progress.stage === 'emulator') return '资源已就绪，正在初始化模拟器…'
  const active = progress.overall.activeLabel
  if (active && (progress.stage === 'resources' || progress.stage === 'verify')) {
    return `${progress.stage === 'verify' ? '校验资源' : '加载资源'}：${active}`
  }
  return progress.stageText || '准备中…'
})

const fillStyle = computed(() => {
  const ratio = overall.value.ratio
  if (ratio == null) return { width: '38%' }
  return { width: `${Math.max(2, Math.round(ratio * 100))}%` }
})

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}
</script>

<style scoped>
/* 加载面板独立于"模拟器组件是否挂载"：核心还在下载、模拟器还在初始化时它都
   盖在画面上，直到游戏真的跑起来才消失。 */
.resource-loading {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  background:
    radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, rgba(0, 0, 0, 0) 60%),
    #2A2138;
}
/* Faint CRT scanlines on the loading screen — on-brand for an arcade loader. */
.resource-loading::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0px,
    rgba(255, 255, 255, 0) 2px,
    rgba(255, 255, 255, 0.035) 2px,
    rgba(255, 255, 255, 0.035) 3px
  );
  pointer-events: none;
}

.loading-stack { position: relative; width: 40px; height: 40px; margin-bottom: 4px; }
.loading-glow {
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 55%, transparent) 0%, transparent 65%);
  filter: blur(6px);
  animation: glow-pulse 1.8s var(--clay-ease) infinite;
}
@keyframes glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.92); }
  50%      { opacity: 1;   transform: scale(1.1);  }
}

.spinner {
  position: relative;
  width: 38px; height: 38px;
  margin: 0 auto 4px;
  border-radius: 50%;
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-md), 0 0 22px color-mix(in srgb, var(--accent) 45%, transparent);
  animation: clay-pulse 1s var(--clay-ease) infinite;
  z-index: 1;
}

.loading-title {
  margin: 0;
  color: #F7F1F6;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.22em;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  animation: coin-blink 1.6s var(--clay-ease) infinite;
}
@keyframes coin-blink {
  0%, 50%, 100% { opacity: 1; }
  60%, 90%      { opacity: 0.45; }
}
.loading-title .dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #A98CF5;
  box-shadow: 0 0 6px var(--accent);
  animation: dot-bounce 1.2s var(--clay-ease) infinite;
  animation-delay: calc(var(--i) * 140ms);
}
@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
  40%           { transform: scale(1);   opacity: 1;   }
}

.loading-game {
  margin: 0;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.loading-stage {
  margin: 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
  max-width: 340px;
  line-height: 1.5;
}
.loading-hint {
  margin: 0;
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  max-width: 320px;
  line-height: 1.55;
}
.loading-retry {
  margin-top: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #F7F1F6;
  border-color: rgba(255, 255, 255, 0.18);
  position: relative;
  z-index: 1;
}
.loading-retry:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }

/* ---- 进度区 ---- */
.load-progress {
  width: min(360px, 84vw);
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.load-bar {
  position: relative;
  height: 6px;
  border-radius: var(--r-pill, 999px);
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
.load-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #A98CF5, #F0A9C8);
  transition: width 0.18s linear;
}
/* 总长长不确定时：不假装知道百分比，改成来回滑动的提示条 */
.load-bar.indeterminate .load-bar-fill {
  position: absolute;
  left: 0;
  animation: load-slide 1.4s var(--clay-ease) infinite;
}
@keyframes load-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(320%); }
}

.load-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.load-pct { color: #fff; font-weight: 900; }

.load-tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 30vh;
  overflow: auto;
}
.load-task {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  text-align: left;
}
.t-dot {
  flex: 0 0 auto;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}
.load-task.is-loading .t-dot { background: #F0C56B; animation: dot-blink 1s linear infinite; }
.load-task.is-verifying .t-dot,
.load-task.is-pending .t-dot { background: #A98CF5; }
.load-task.is-done .t-dot,
.load-task.is-cached .t-dot { background: #7FD1A8; }
.load-task.is-failed .t-dot { background: #F08A8A; }
.load-task.is-skipped .t-dot { background: rgba(255, 255, 255, 0.2); }
@keyframes dot-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.25; }
}
.t-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.load-task.is-done .t-label,
.load-task.is-cached .t-label { color: rgba(255, 255, 255, 0.82); }
.t-state {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.45);
}
.load-task.is-failed .t-state { color: #F08A8A; }
.t-bytes {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.4);
}

/* 手机横屏时纵向空间紧张：任务列表收紧，标题缩小一点。 */
@media (max-height: 460px) {
  .loading-stack { display: none; }
  .load-tasks { max-height: 22vh; }
  .loading-title { font-size: 11px; }
  .loading-game { font-size: 14px; }
}
</style>
