<template>
  <Transition name="slide">
    <aside v-if="open" class="room-panel" @click.stop>
      <header class="rp-head">
        <div class="rp-title">
          <span class="rp-code">{{ code }}</span>
          <span class="rp-state" :class="connected ? 'ok' : 'pending'">
            {{ connected ? (isHost ? '主机' : '已连接') : '连接中…' }}
          </span>
          <span class="rp-mode" :class="allowPlay ? 'play' : 'view'">
            {{ allowPlay ? '可对战' : '仅观战' }}
          </span>
        </div>
        <button class="rp-close" @click="$emit('close')" aria-label="关闭">×</button>
      </header>

      <section class="rp-members">
        <div class="rp-section-title">房间成员 ({{ sortedPeers.length }})</div>
        <ul class="rp-list">
          <li v-for="p in sortedPeers" :key="p.id" :class="{ me: p.id === mePeerId }">
            <span class="m-name">{{ p.username || '游客' }}</span>
            <span v-if="p.playerIndex" class="m-player">P{{ p.playerIndex }}</span>
            <span v-else class="m-observer">观战</span>
          </li>
        </ul>
      </section>

      <section class="rp-chat">
        <div class="rp-section-title">聊天</div>
        <div class="rp-log" ref="logRef">
          <div v-for="(c, i) in chat" :key="i" class="msg" :class="{ me: c.from === mePeerId }">
            <span class="msg-from">{{ c.fromName || '匿名' }}</span>
            <span class="msg-text">{{ c.text }}</span>
          </div>
        </div>
        <form class="rp-input" @submit.prevent="submit">
          <input
            v-model="draft"
            placeholder="说点什么…"
            maxlength="500"
            :disabled="!connected"
          />
          <button type="submit" :disabled="!draft.trim() || !connected">发送</button>
        </form>
      </section>
    </aside>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  open: Boolean,
  code: String,
  connected: Boolean,
  isHost: Boolean,
  allowPlay: { type: Boolean, default: true },
  mePeerId: String,
  peers: { type: Object, default: () => ({}) },
  chat: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'send'])

const draft = ref('')
const logRef = ref(null)

const sortedPeers = computed(() => {
  const arr = Object.values(props.peers || {})
  arr.sort((a, b) => {
    const ai = a.playerIndex ?? 99
    const bi = b.playerIndex ?? 99
    if (ai !== bi) return ai - bi
    if ((a.id === props.mePeerId) !== (b.id === props.mePeerId)) return a.id === props.mePeerId ? -1 : 1
    return String(a.username || '').localeCompare(String(b.username || ''), 'zh-Hans-CN')
  })
  return arr
})

function submit() {
  const text = draft.value.trim()
  if (!text) return
  emit('send', text)
  draft.value = ''
}

// Auto-scroll on new messages
watch(() => props.chat.length, async () => {
  await nextTick()
  if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
})
</script>

<style scoped>
.room-panel {
  position: fixed;
  right: 16px;
  top: 64px;
  bottom: 16px;
  width: 340px;
  /* 用 --view-w：全屏且整页被转成横版时本地宽高互换，vw 会算成竖屏的宽度 */
  max-width: calc(var(--view-w, 100vw) - 32px);
  background: var(--clay-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 0;
  border-radius: var(--r-2xl);
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
  box-shadow: var(--clay-lg);
  z-index: 50;
  overflow: hidden;
}
.rp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
  border-bottom: 0;
  background: var(--clay-surface-alt);
}
.rp-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.rp-code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--text-primary);
}
.rp-state,
.rp-mode {
  font-size: 11px;
  font-weight: 900;
  padding: 4px 11px;
  border-radius: var(--r-pill);
  color: var(--text-secondary);
  background: var(--clay-surface-flat);
  border: 0;
  box-shadow: var(--clay-xs);
  line-height: 1.2;
}
.rp-state.ok { background: color-mix(in srgb, var(--success) 20%, #fff); color: #2C6B4F; }
.rp-state.pending { background: color-mix(in srgb, var(--warn) 18%, #fff); color: var(--warn); }
.rp-mode.play { background: color-mix(in srgb, var(--warn) 18%, #fff); color: var(--warn); }
.rp-mode.view { background: rgba(255, 255, 255, 0.78); color: var(--text-secondary); }
.rp-close {
  width: 36px;
  height: 36px;
  border-radius: var(--r-pill);
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  border: 0;
  cursor: pointer;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  flex-shrink: 0;
  box-shadow: var(--clay-xs);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.rp-close:hover {
  background: var(--clay-primary-grad);
  color: #fff;
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.rp-close:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.rp-close:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.rp-section-title {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.rp-members {
  padding: 14px 16px;
  border-bottom: 0;
}
.rp-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rp-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--r-md);
  background: var(--clay-surface-flat);
  font-size: 13px;
  color: var(--text-primary);
  box-shadow: var(--clay-xs);
}
.rp-list li.me { background: var(--clay-pink-soft); }
.m-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; }
.m-player,
.m-observer {
  font-size: 10px;
  font-weight: 900;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  box-shadow: var(--clay-xs);
  flex-shrink: 0;
}
.m-player { background: color-mix(in srgb, var(--warn) 18%, #fff); color: var(--warn); }
.m-observer { color: var(--text-secondary); }

.rp-chat { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 14px 16px; }
.rp-log {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
  margin-bottom: 12px;
}
.msg {
  padding: 10px 14px;
  border: 0;
  border-radius: var(--r-md);
  background: var(--clay-surface-flat);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  box-shadow: var(--clay-xs);
}
.msg.me { background: var(--clay-pink-soft); }
.msg-from { color: var(--text-tertiary); margin-right: 6px; font-weight: 900; }
.msg.me .msg-from { color: var(--warn); }
.rp-input { display: flex; gap: 8px; }
.rp-input input {
  flex: 1;
  min-width: 0;
  height: 42px;
  background: var(--clay-inset-surface);
  border: 0;
  border-radius: var(--r-md);
  padding: 0 14px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  outline: none;
  box-shadow: var(--clay-in);
  transition: box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease);
}
.rp-input input::placeholder { color: var(--text-quaternary); }
.rp-input input:focus { box-shadow: var(--clay-in-deep), 0 0 0 4px var(--accent-ring); }
.rp-input button {
  height: 42px;
  padding: 0 18px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-primary-grad);
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--clay-sm);
  flex-shrink: 0;
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.rp-input button:hover:not(:disabled) {
  background: var(--clay-pink-soft);
  color: #6C2039;
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.rp-input button:active:not(:disabled) { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.rp-input button:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.rp-input button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: var(--clay-xs); }

.slide-enter-active, .slide-leave-active { transition: transform var(--t) var(--clay-ease), opacity var(--t) var(--clay-ease); }
.slide-enter-from, .slide-leave-to { transform: translateX(12px); opacity: 0; }

@media (max-width: 600px) {
  .room-panel { right: 8px; left: 8px; width: auto; top: 56px; bottom: 8px; }
}
</style>
