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
      <span class="mono">v1.0</span>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'

const route = useRoute()
const showChrome = computed(() => !route.meta?.fullscreen)
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
</style>
