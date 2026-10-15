import { ref, computed } from 'vue'
import { api } from '../api/client.js'
import { cacheCurrentUser, clearCurrentUserCache } from './authCache.js'

const user = ref(null)
const loading = ref(true)
let primed = false

async function refresh() {
  try {
    const { user: u } = await api.me()
    user.value = u
    cacheCurrentUser(u)
  } catch {
    user.value = null
    cacheCurrentUser(null)
  } finally {
    loading.value = false
  }
}

export function useAuth() {
  if (!primed) {
    primed = true
    refresh()
  }

  async function login(username, password) {
    const u = await api.login(username, password)
    user.value = u
    // 登录状态变了，路由守卫那份缓存必须跟着变（2026-10 审计 L-12）。
    cacheCurrentUser(u)
    return u
  }

  async function register(username, password) {
    const u = await api.register(username, password)
    user.value = u
    cacheCurrentUser(u)
    return u
  }

  async function logout() {
    try { await api.logout() } finally {
      user.value = null
      clearCurrentUserCache()
    }
  }

  return {
    user: computed(() => user.value),
    loading: computed(() => loading.value),
    isAuthed: computed(() => !!user.value),
    isAdmin: computed(() => user.value?.role === 'admin'),
    login,
    register,
    logout,
    refresh,
  }
}
