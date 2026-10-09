<template>
  <header class="app-header">
    <div class="inner">
      <router-link class="brand" to="/">
        <span class="orb-brand" aria-hidden="true">
          <img src="../assets/brand-game.svg" alt="" />
        </span>
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
          <router-link to="/auth" class="header-login">登录</router-link>
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
  padding: 10px 0 6px;
  background: transparent;
}
.inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 14px 0 18px;
  height: 62px;
  display: flex;
  align-items: center;
  gap: 22px;
  border-radius: var(--r-pill);
  background: var(--clay-float-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--clay-md);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text-primary);
  transition: transform var(--t) var(--clay-ease);
}
.brand:hover { color: var(--text-primary); transform: var(--clay-lift); }
.brand:active { transform: translateY(2px) var(--clay-squash); }
.brand:focus-visible { outline: none; }
.brand:focus-visible .orb-brand { box-shadow: var(--clay-focus); }
.brand-text {
  font-size: 17px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.nav { display: flex; gap: 10px; flex: 1; height: 100%; align-items: center; }
.nav-item {
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--r-pill);
  color: var(--text-secondary);
  background: var(--clay-inset-surface);
  font-size: 14px;
  font-weight: 900;
  text-decoration: none;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.nav-item:hover {
  color: var(--text-primary);
  text-decoration: none;
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.nav-item:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.nav-item.active {
  color: #ffffff;
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-sm);
}
.nav-item.active:hover { color: #ffffff; }
.nav-item:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.header-right { display: flex; align-items: center; gap: 10px; }
.header-login {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-primary-grad);
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
  text-decoration: none;
  box-shadow: var(--clay-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.header-login:hover {
  color: #6C2039;
  background: var(--clay-pink-soft);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.header-login:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.header-login:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.user-menu { position: relative; }
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px 0 6px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-inset-surface);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), background var(--t) var(--clay-ease), color var(--t) var(--clay-ease);
}
.user-chip:hover {
  color: var(--text-primary);
  background: var(--clay-surface-alt);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.user-chip:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.user-chip:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.user-chip svg { color: var(--text-tertiary); }

.avatar {
  width: 26px; height: 26px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-lilac);
  color: var(--text-lilac);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
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
  top: calc(100% + 10px);
  min-width: 224px;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-lg);
  padding: 8px;
  z-index: 60;
  box-shadow: var(--clay-lg);
}
.menu-head { padding: 8px 12px 10px; }
.menu-head-name { font-size: 14px; font-weight: 900; color: var(--text-primary); }
.menu-head-role { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.menu-sep { height: 2px; border-radius: var(--r-pill); background: rgba(94, 58, 84, 0.08); margin: 4px 2px; }

.menu-item {
  display: block;
  width: 100%;
  padding: 9px 12px;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  font-weight: 800;
  cursor: pointer;
  border-radius: var(--r-md);
  transition: background var(--t) var(--clay-ease), color var(--t) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.menu-item:hover {
  background: var(--clay-pink-soft);
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.menu-item:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.menu-item:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.menu-item-meta {
  float: right;
  color: var(--text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.menu-enter-active { transition: opacity 0.18s var(--clay-ease), transform 0.18s var(--clay-ease); }
.menu-leave-active { transition: opacity 0.14s var(--clay-ease); }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-8px) scale(0.96); }

@media (max-width: 640px) {
  .app-header { padding: 8px 0 4px; }
  .inner { padding: 0 10px 0 14px; gap: 10px; height: 58px; }
  .brand-text { display: none; }
  .nav { gap: 6px; }
  .nav-item { padding: 0 12px; font-size: 13px; }
  .user-name { display: none; }
}
</style>
