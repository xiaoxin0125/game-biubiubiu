import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000'

// 版本号只认源码：优先读根 package.json（镜像标签和 /api/health 用的也是它），
// 读不到时退回前端自己的 package.json。页脚据此显示，避免再出现写死的旧版本。
function readAppVersion() {
  for (const candidate of ['../package.json', './package.json']) {
    try {
      const parsed = JSON.parse(readFileSync(new URL(candidate, import.meta.url), 'utf8'))
      if (parsed?.version) return String(parsed.version)
    } catch {
      // 换下一个候选文件
    }
  }
  return 'dev'
}

const APP_VERSION = readAppVersion()

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
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    // dist is also the web root of the hosting panel, which writes certificate
    // challenge files into it. Cleaning is handled by scripts/clean-dist.js.
    emptyOutDir: false,
  },
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