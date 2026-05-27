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
  max-width: calc(100vw - 32px);
  background: rgba(255, 251, 245, 0.96);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  display: flex;
  flex-direction: column;
  color: #111;
  z-index: 50;
  overflow: hidden;
}
.rp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 2px solid var(--border-color, #111);
  background: rgba(255, 255, 255, 0.5);
}
.rp-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.rp-code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #111;
}
.rp-state,
.rp-mode {
  font-size: 11px;
  font-weight: 900;
  padding: 3px 8px;
  border-radius: 7px;
  color: #111;
  background: #fff;
  border: 2px solid var(--border-color, #111);
  line-height: 1.2;
}
.rp-state.ok { background: color-mix(in srgb, var(--success) 20%, #fff); color: #047857; }
.rp-state.pending { background: color-mix(in srgb, var(--warn) 18%, #fff); color: #9A3412; }
.rp-mode.play { background: color-mix(in srgb, var(--warn) 18%, #fff); color: #9A3412; }
.rp-mode.view { background: rgba(255, 255, 255, 0.78); color: var(--text-secondary); }
.rp-close {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: transparent;
  color: #111;
  border: 2px solid var(--border-color, #111);
  cursor: pointer;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  flex-shrink: 0;
}
.rp-close:hover { background: #111; color: #fff; }

.rp-section-title {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #111;
  margin-bottom: 8px;
}

.rp-members {
  padding: 14px 16px;
  border-bottom: 2px solid var(--border-color, #111);
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
  padding: 8px 10px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  color: #111;
}
.rp-list li.me { background: var(--accent-soft); }
.m-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; }
.m-player,
.m-observer {
  font-size: 10px;
  font-weight: 900;
  padding: 2px 7px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: #fff;
  color: #111;
  flex-shrink: 0;
}
.m-player { background: color-mix(in srgb, var(--warn) 18%, #fff); color: #9A3412; }
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
  padding: 8px 10px;
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.62);
  color: #111;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}
.msg.me { background: var(--accent-soft); }
.msg-from { color: var(--text-tertiary); margin-right: 6px; font-weight: 900; }
.msg.me .msg-from { color: #9A3412; }
.rp-input { display: flex; gap: 8px; }
.rp-input input {
  flex: 1;
  min-width: 0;
  height: 38px;
  background: rgba(255, 255, 255, 0.88);
  border: 2px solid var(--border-color, #111);
  border-radius: 7px;
  padding: 0 12px;
  color: #111;
  font-size: 13px;
  outline: none;
}
.rp-input input:focus { box-shadow: 0 0 0 4px var(--accent-ring); }
.rp-input button {
  height: 38px;
  padding: 0 14px;
  border-radius: 7px;
  border: 2px solid var(--border-color, #111);
  background: #111;
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  flex-shrink: 0;
}
.rp-input button:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-color, #111);
}
.rp-input button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; box-shadow: none; }

.slide-enter-active, .slide-leave-active { transition: transform 0.22s ease, opacity 0.22s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(12px); opacity: 0; }

@media (max-width: 600px) {
  .room-panel { right: 8px; left: 8px; width: auto; top: 56px; bottom: 8px; }
}
</style>
