<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="修改密码">
        <header class="dh">
          <h3>修改密码</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <form @submit.prevent="submit" class="form">
            <div>
              <label class="label">当前密码</label>
              <input v-model="currentPassword" class="input" type="password" autocomplete="current-password" required />
            </div>
            <div>
              <label class="label">新密码</label>
              <input v-model="newPassword" class="input" type="password" autocomplete="new-password" placeholder="至少 6 位密码" required />
            </div>
            <div>
              <label class="label">确认新密码</label>
              <input v-model="confirmPassword" class="input" type="password" autocomplete="new-password" required />
            </div>

            <div v-if="error" class="err">{{ error }}</div>
            <div v-if="success" class="ok">密码已更新</div>

            <footer class="df">
              <button type="button" class="btn" :disabled="busy" @click="$emit('close')">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="busy || !currentPassword || !newPassword">
                {{ busy ? '保存中…' : '保存' }}
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
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'

const emit = defineEmits(['close'])
const { logout } = useAuth()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const busy = ref(false)

function validPassword(value) {
  return value.length >= 6
}

async function submit() {
  error.value = ''
  success.value = false
  if (!validPassword(newPassword.value)) { error.value = '新密码至少 6 位'; return }
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的新密码不一致'; return }
  busy.value = true
  try {
    await api.changePassword(currentPassword.value, newPassword.value)
    await logout()
    success.value = true
    setTimeout(() => emit('close'), 1000)
  } catch (err) {
    error.value = err?.message || '修改失败'
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
.ok {
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--success) 12%, #fff);
  border: 0;
  box-shadow: var(--clay-in-sm);
  color: var(--success);
  font-size: 13px;
  text-align: center;
}

.df { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
</style>
