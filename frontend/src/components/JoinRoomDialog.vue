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

            <div v-if="showPasswordField">
              <label class="label">房间密码</label>
              <input v-model="password" class="input" type="password" placeholder="输入房间密码" :required="!ownerExempt" autofocus />
            </div>
            <!-- 房主 / 管理员：服务端对这两种身份本来就免密，如实说明一句，别让人以为漏了输入框 -->
            <p v-else-if="ownerExempt && room?.hasPassword" class="pw-note">
              {{ isRoomOwner ? '你是这个房间的房主，不用输密码' : '管理员进入房间不用输密码' }}
            </p>

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
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'

const props = defineProps({
  room: { type: Object, default: null },
  forcePassword: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'joined'])
const router = useRouter()
const { user, isAdmin } = useAuth()

const code = ref(props.room?.code || '')
const password = ref('')
const needsPassword = ref(props.room?.hasPassword || false)
const error = ref('')
const busy = ref(false)

// 房主进自己的房间不用密码：服务端在 /join 与信令准入里都放过房主，前端再要一次
// 密码只会把人拦在自己房间门口。管理员同理（服务端也放行）。
// 判断来源有两种：大厅卡片带的是服务端算好的 isMine（列表不再下发 hostUserId），
// join / 创建 / 编辑返回的单个房间仍带 hostUserId（2026-10-16 重审 N-4）。
const isRoomOwner = computed(() => {
  if (!props.room) return false
  if (props.room.isMine === true) return true
  return !!user.value && props.room.hostUserId === user.value.id
})
const ownerExempt = computed(() => isRoomOwner.value || (!!props.room && isAdmin.value))
const showPasswordField = computed(() => (needsPassword.value || props.forcePassword) && !ownerExempt.value)

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

/* 房主 / 管理员免密时的那句说明：跟房间信息卡一个调子，安静地贴在原密码框的位置 */
.pw-note {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  box-shadow: var(--clay-in-sm);
}

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
