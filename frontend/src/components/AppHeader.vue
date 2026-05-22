<template>
  <header class="app-header">
    <div class="inner">
      <router-link class="brand" to="/">
        <span class="orb-brand">筱</span>
        <span class="brand-text">{{ settings.siteTitle }}</span>
      </router-link>

      <nav class="nav">
        <router-link to="/" class="nav-item" exact-active-class="active">首页</router-link>
        <router-link v-if="showNetplay" to="/rooms" class="nav-item" active-class="active">联机</router-link>
        <router-link v-if="isAuthed" to="/my" class="nav-item" active-class="active">投稿</router-link>
        <router-link v-if="isAdmin" to="/admin" class="nav-item" active-class="active">管理</router-link>
      </nav>

      <div class="header-right">
        <template v-if="loading">
          <div class="skeleton" style="width: 84px; height: 28px;"></div>
        </template>
        <template v-else-if="isAuthed">
          <div class="user-menu" @click="onMenuToggle">
            <button class="user-chip" type="button" :aria-expanded="menuOpen">
              <span class="avatar">{{ initial }}</span>
              <span class="user-name">{{ user.username }}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <Transition name="menu">
              <div v-if="menuOpen" class="menu" @click.stop>
                <div class="menu-head">
                  <div class="menu-head-name">{{ user.username }}</div>
                  <div class="menu-head-role">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</div>
                </div>
                <div class="menu-sep"></div>
                <button class="menu-item" @click="openPassword">修改密码</button>
                <button class="menu-item" @click="onClearCache">
                  清空本地缓存<span v-if="cacheLabel" class="menu-item-meta">{{ cacheLabel }}</span>
                </button>
                <button class="menu-item" @click="onLogout">退出登录</button>
              </div>
            </Transition>
          </div>
        </template>
        <template v-else>
          <router-link to="/auth" class="btn btn-primary btn-sm">登录</router-link>
        </template>
      </div>
    </div>
    <ChangePasswordDialog v-if="showPassword" @close="showPassword = false" />
  </header>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useSettings } from '../composables/useSettings.js'
import { stats as cacheStatsFn, clearCache } from '../composables/useBlobCache.js'
import ChangePasswordDialog from './ChangePasswordDialog.vue'

const { user, isAuthed, isAdmin, loading, logout } = useAuth()
const { settings } = useSettings()

const cacheLabel = ref('')
async function refreshCacheStats() {
  const { count, bytes } = await cacheStatsFn()
  cacheLabel.value = count > 0 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : ''
}

async function onClearCache() {
  if (!confirm('清空本地缓存？ROM、BIOS、核心会在下次启动游戏时重新下载。')) return
  await clearCache()
  await refreshCacheStats()
  menuOpen.value = false
}

const showNetplay = computed(() => isAdmin.value || settings.value.netplayEnabled !== false)
const router = useRouter()
const menuOpen = ref(false)
const showPassword = ref(false)

function openPassword() {
  menuOpen.value = false
  showPassword.value = true
}

const initial = computed(() => (user.value?.username || '?').slice(0, 1).toUpperCase())

async function onLogout() {
  await logout()
  menuOpen.value = false
  router.push('/auth')
}

function closeMenu() { menuOpen.value = false }

function onMenuToggle(e) {
  e?.stopPropagation()
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) refreshCacheStats()
}

onMounted(() => { document.addEventListener('click', closeMenu); refreshCacheStats() })
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
}
.inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text-primary);
}
.brand-text {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.nav { display: flex; gap: 8px; flex: 1; height: 100%; align-items: center; }
.nav-item {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  border-radius: var(--r-pill);
  transition: color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
}
.nav-item:hover { color: var(--accent); text-decoration: none; background: var(--accent-soft); transform: translateY(-1px); }
.nav-item.active {
  color: #fff;
  background: var(--accent);
  box-shadow: var(--shadow-accent-sm);
}

.header-right { display: flex; align-items: center; gap: 8px; }

.user-menu { position: relative; }
.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px 0 3px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-strong);
  background: var(--bg-2);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out);
}
.user-chip:hover { border-color: var(--text-tertiary); }
.user-chip svg { color: var(--text-tertiary); }

.avatar {
  width: 22px; height: 22px;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}
.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 220px;
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  padding: 6px;
  box-shadow: var(--shadow-md);
  z-index: 60;
}
.menu-head { padding: 8px 10px 10px; }
.menu-head-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.menu-head-role { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.menu-sep { height: 1px; background: var(--border); margin: 4px -6px; }

.menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  transition: background var(--t-fast) var(--ease-out);
}
.menu-item:hover { background: var(--bg-2); }
.menu-item-meta {
  float: right;
  color: var(--text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.menu-enter-active { transition: opacity 0.12s var(--ease-out), transform 0.12s var(--ease-out); }
.menu-leave-active { transition: opacity 0.1s var(--ease-out); }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 640px) {
  .inner { padding: 0 16px; gap: 12px; }
  .brand-text { display: none; }
  .nav-item { padding: 0 8px; font-size: 13px; }
  .user-name { display: none; }
}
</style>
