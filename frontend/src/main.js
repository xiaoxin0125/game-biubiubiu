import { createApp } from 'vue'
import router from './router'
import App from './App.vue'
import { loadRuntimeConfig } from './composables/runtimeConfig.js'
import './assets/global.css'

// Suppress benign ResizeObserver loop error
window.addEventListener('error', (e) => {
  if (e.message?.includes('ResizeObserver')) e.stopImmediatePropagation()
})

async function bootstrap() {
  await loadRuntimeConfig()

  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
