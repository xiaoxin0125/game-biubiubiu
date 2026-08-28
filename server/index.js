import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runMigrations } from './db/index.js'
import { authRoutes } from './routes/auth.js'
import { romRoutes } from './routes/roms.js'
import { adminRoutes } from './routes/admin.js'
import { biosRoutes } from './routes/bios.js'
import { coreRoutes } from './routes/cores.js'
import { roomRoutes } from './routes/rooms.js'
import { installRoomsWebSocket } from './routes/rooms-ws.js'
import { saveRoutes } from './routes/saves.js'
import { publicSettingsRoutes, adminSettingsRoutes } from './routes/settings.js'
import { cleanupExpiredSessions } from './middleware/auth.js'
import { csrfProtection, securityHeaders } from './middleware/security.js'
import { installErrorHandler, requestId } from './middleware/error-handler.js'
import { getRuntimeConfig } from './runtime-config.js'

process.on('uncaughtException', (err) => {
  console.error('[api] uncaught exception', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection', reason)
})

await runMigrations()

await cleanupExpiredSessions()
const cleanupTimer = setInterval(cleanupExpiredSessions, 60 * 60 * 1000)
cleanupTimer.unref?.()

const app = new Hono()
installErrorHandler(app)
app.use('*', requestId())
app.use('*', securityHeaders())
app.use('/api/*', csrfProtection())
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
installRoomsWebSocket(app, upgradeWebSocket)

app.route('/api/auth', authRoutes)
app.route('/api/roms', romRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/bios', biosRoutes)
app.route('/api/cores', coreRoutes)
app.route('/api/rooms', roomRoutes)
app.route('/api/saves', saveRoutes)
app.route('/api/settings', publicSettingsRoutes)
app.route('/api/admin/settings', adminSettingsRoutes)

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/runtime-config', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json(getRuntimeConfig())
})

const frontendDistRoot = resolve('frontend/dist')
const frontendIndex = resolve(frontendDistRoot, 'index.html')

if (existsSync(frontendIndex)) {
  app.use('/*', serveStatic({ root: './frontend/dist' }))
  app.notFound((c) => {
    if (c.req.path.startsWith('/api')) return c.text('Not found', 404)
    return c.html(readFileSync(frontendIndex, 'utf-8'))
  })
} else {
  app.notFound((c) => c.text('Not found', 404))
}

const PORT = Number(process.env.PORT) || 3000
const server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on http://0.0.0.0:${info.port}`)
})
injectWebSocket(server)
