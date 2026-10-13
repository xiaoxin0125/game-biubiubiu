<template>
  <div class="app-shell">
    <AppHeader v-if="showChrome" />
    <router-view v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <keep-alive include="Gallery">
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </Transition>
    </router-view>
    <footer v-if="showChrome" class="app-footer">
      <span>MADE BY</span>
      <a class="footer-author" href="https://www.hxino.com/" target="_blank" rel="noopener noreferrer">XIAOXIN</a>
      <span class="dot">·</span>
      <button
        type="button"
        class="footer-version mono"
        :title="`查看 v${appVersion} 的更新内容`"
        aria-haspopup="dialog"
        :aria-expanded="changelogOpen"
        @click="changelogOpen = true"
      >
        <svg class="footer-version-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
        <span>v{{ appVersion }}</span>
      </button>
    </footer>

    <ChangelogDialog v-if="changelogOpen" :current-version="appVersion" @close="changelogOpen = false" />
    <AppDialog />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppDialog from './components/AppDialog.vue'
import ChangelogDialog from './components/ChangelogDialog.vue'
import { useAppDialog } from './composables/useAppDialog.js'

const route = useRoute()
const { cancelAll } = useAppDialog()
watch(() => route.fullPath, cancelAll, { flush: 'sync' })
const showChrome = computed(() => !route.meta?.fullscreen)
// 构建时由 vite.config.js 的 define 注入，值与 package.json、镜像标签一致
const appVersion = __APP_VERSION__

const changelogOpen = ref(false)
</script>

<style>
.app-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.app-footer {
  margin-top: auto;
  padding: 30px 18px 34px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}
.app-footer .dot { color: var(--text-quaternary); }
.app-footer .footer-author {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: var(--r-pill);
  background: var(--clay-surface);
  box-shadow: var(--clay-xs);
  color: var(--text-primary);
  font-weight: 800;
  text-decoration: none;
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.app-footer .footer-author:hover {
  color: var(--text-primary);
  text-decoration: none;
  transform: var(--clay-lift);
  box-shadow: var(--clay-hover);
}
.app-footer .footer-author:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.app-footer .mono {
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--text-secondary);
}
/* 版本号本身就是「查看更新日志」的入口：外形做成和作者署名一样的粘土药丸 */
.app-footer .footer-version {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-surface);
  box-shadow: var(--clay-xs);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.app-footer .footer-version:hover {
  color: var(--text-primary);
  transform: var(--clay-lift);
  box-shadow: var(--clay-hover);
}
.app-footer .footer-version:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.app-footer .footer-version:focus-visible { outline: none; box-shadow: var(--clay-focus); }
.app-footer .footer-version-icon { opacity: 0.6; transition: opacity var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease); }
.app-footer .footer-version:hover .footer-version-icon { opacity: 1; color: var(--accent); }
</style>
