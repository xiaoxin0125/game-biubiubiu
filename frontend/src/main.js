import { createApp } from 'vue'
import router from './router'
import App from './App.vue'
import './assets/global.css'

// Suppress benign ResizeObserver loop error
window.addEventListener('error', (e) => {
  if (e.message?.includes('ResizeObserver')) e.stopImmediatePropagation()
})

async function loadRuntimeConfig() {
  try {
    const response = await fetch('/api/runtime-config', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const config = await response.json()
    window.__APP_CONFIG__ = Object.freeze(config && typeof config === 'object' ? config : {})
  } catch (error) {
    console.warn('[web] runtime config unavailable; STUN/TURN will remain unconfigured', error)
    window.__APP_CONFIG__ = Object.freeze({})
  }
}

async function bootstrap() {
  await loadRuntimeConfig()

  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
