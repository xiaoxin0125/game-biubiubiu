<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="加入房间">
        <header class="dh">
          <h3>加入房间</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <form @submit.prevent="submit" class="form">
            <div v-if="room" class="room-card">
              <div class="room-name">{{ room.name }}</div>
              <div class="room-meta">
                <span>房主 @{{ room.hostUsername }}</span>
                <span>·</span>
                <span>{{ room.romTitle }}</span>
              </div>
            </div>
            <div v-else>
              <label class="label">房间码</label>
              <input v-model="code" class="input" placeholder="6 位房间码" maxlength="6" style="text-transform: uppercase;" required />
            </div>

            <div v-if="needsPassword || forcePassword">
              <label class="label">房间密码</label>
              <input v-model="password" class="input" type="password" placeholder="输入房间密码" autofocus required />
            </div>

            <div v-if="error" class="err">{{ error }}</div>

            <footer class="df">
              <button type="button" class="btn" :disabled="busy" @click="$emit('close')">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="busy || (!code && !room)">
                {{ busy ? '加入中…' : '加入' }}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'

const props = defineProps({
  room: { type: Object, default: null },
  forcePassword: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'joined'])
const router = useRouter()

const code = ref(props.room?.code || '')
const password = ref('')
const needsPassword = ref(props.room?.hasPassword || false)
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  const roomCode = (props.room?.code || code.value).trim().toUpperCase()
  if (!roomCode) { error.value = '请输入房间码'; return }
  busy.value = true
  try {
    const joined = await api.roomJoin(roomCode, password.value)
    if (joined.roomTicket) api.roomStoreTicket(joined.code, joined.roomTicket)
    emit('joined', joined)
    router.push(`/rooms/${joined.code}/play/${joined.romId}`)
  } catch (err) {
    if (err?.data?.needsPassword) {
      needsPassword.value = true
      error.value = '此房间需要密码'
    } else {
      error.value = err?.message || '加入失败'
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.mask {
  position: fixed; inset: 0;
  background: rgba(94, 58, 84, 0.30);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 标题栏不参与滚动，关闭按钮固定在弹窗右上角；只有 .dialog-body 滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.2s var(--ease-spring);
}
@keyframes popIn { from { opacity: 0; transform: translateY(8px) scaleX(0.97) scaleY(0.95); } to { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); } }

.dh {
  flex: 0 0 auto;
  padding: 22px 58px 12px 24px;
  background: var(--clay-surface-flat);
}
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }

.dlg-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 24px 22px;
}

.form { display: flex; flex-direction: column; gap: 14px; }

.room-card {
  padding: 16px 18px;
  background: var(--clay-inset-surface);
  border: 0;
  border-radius: var(--r-lg);
  box-shadow: var(--clay-in-sm);
}
.room-name { font-size: 15px; font-weight: 900; color: var(--text-primary); margin-bottom: 4px; }
.room-meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-secondary); }

.err {
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--error) 12%, #fff);
  border: 0;
  box-shadow: var(--clay-in-sm);
  color: var(--error);
  font-size: 13px;
  text-align: center;
}
.df { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
</style>
