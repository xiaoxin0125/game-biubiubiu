import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000'

function quietApiProxyError(err, _req, res) {
  if (err?.code !== 'ECONNREFUSED') {
    console.error('[vite] api proxy error:', err)
  }
  if (!res || typeof res.writeHead !== 'function') return
  if (!res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
  }
  res.end(JSON.stringify({ error: 'api-starting' }))
}

export default defineConfig({
  root: frontendRoot,
  base: '/',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
        configure(proxy) {
          proxy.on('error', quietApiProxyError)
        },
      },
    },
  },
})