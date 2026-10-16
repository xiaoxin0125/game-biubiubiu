<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <span class="orb-brand" aria-hidden="true">
          <img src="../assets/brand-game.svg" alt="" />
        </span>
        <div class="brand-text">
          <h1 class="brand-name">{{ settings.siteTitle }}</h1>
          <p class="brand-sub">{{ mode === 'login' ? '欢迎回来' : '创建一个账号' }}</p>
        </div>
      </div>

      <div class="seg auth-seg">
        <button class="seg-btn" :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button class="seg-btn" :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <div class="field">
          <label class="label">用户名</label>
          <input v-model.trim="username" class="input" autocomplete="username" :placeholder="USERNAME_RULE_HINT" required />
        </div>
        <div class="field">
          <label class="label">密码</label>
          <input v-model="password" class="input" type="password" autocomplete="current-password" placeholder="至少 8 位密码" required />
        </div>
        <div v-if="error" class="err">{{ error }}</div>
        <button class="btn btn-primary btn-lg btn-submit" :disabled="submitting">
          {{ submitting ? '处理中…' : (mode === 'login' ? '登录' : '创建账号') }}
        </button>
      </form>

      <p class="foot-tip">
        {{ mode === 'login' ? '还没有账号？' : '已经有账号？' }}
        <a href="#" @click.prevent="mode = mode === 'login' ? 'register' : 'login'">
          {{ mode === 'login' ? '立即注册' : '前往登录' }}
        </a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useSettings } from '../composables/useSettings.js'
// 用户名规则（含占位符文案）与服务端读的是同一份，避免界面提示和真实校验对不上。
import { usernameProblem, USERNAME_RULE_HINT } from '../../../shared/username-policy.js'

const { login, register } = useAuth()
const { settings } = useSettings()
const router = useRouter()
const route = useRoute()

const mode = ref(route.query.mode === 'register' ? 'register' : 'login')
const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

// 服务端新密码最短 8 位（见 server/passwords.js）：这里跟着改，否则 6~7 位
// 会先被前端放行、再被后端 400 拒绝。
function validPassword(value) {
  return value.length >= 8
}

async function submit() {
  error.value = ''
  if (!username.value) return (error.value = '请输入用户名')
  // 注册按现行规则先拦一道，用户不用等一次往返就知道名字哪里不合规；
  // 登录只要求非空：长度与字符集都不再收紧，免得历史账号被前端挡在门外。
  if (mode.value === 'register') {
    const problem = usernameProblem(username.value)
    if (problem) return (error.value = problem)
  }
  if (mode.value === 'register' && !validPassword(password.value)) {
    return (error.value = '密码至少 8 位')
  }
  submitting.value = true
  try {
    if (mode.value === 'login') await login(username.value, password.value)
    else await register(username.value, password.value)
    router.push(route.query.redirect || '/')
  } catch (err) {
    error.value = err?.message || '操作失败'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.auth-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  min-height: calc(100dvh - var(--header-h) - 40px);
}
.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 34px 30px;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-card);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.auth-brand .orb-brand { width: 40px; height: 40px; font-size: 16px; }
.brand-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.brand-name {
  margin: 0;
  font-size: 19px;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.brand-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.auth-seg { display: flex; width: 100%; margin-bottom: 20px; }
.auth-seg .seg-btn { flex: 1; height: 32px; }

.auth-form { display: flex; flex-direction: column; gap: 14px; }
.err {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--error) 12%, #fff);
  border: 0;
  box-shadow: var(--clay-in-sm);
  color: var(--error);
  font-size: 13px;
  font-weight: 800;
}
.btn-submit { width: 100%; margin-top: 4px; }

.foot-tip {
  text-align: center;
  margin: 18px 0 0;
  font-size: 13px;
  color: var(--text-tertiary);
}
.foot-tip a { color: var(--accent-hover); font-weight: 900; }
.foot-tip a:hover { color: var(--accent-hover); }
</style>
