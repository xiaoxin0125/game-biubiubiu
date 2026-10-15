import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
// 必须在 createNodeWebSocket 之前导入：它给 Node 补上 @hono/node-ws 依赖的
// ErrorEvent 全局（缺了它，每次 WebSocket 出错都会打一段 ReferenceError 栈）。
import './error-event-polyfill.js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pingDatabase, pool, runMigrations } from './db/index.js'
import { acquireInstanceLock, instanceLockEnabled, releaseInstanceLock } from './instance-lock.js'
import { authRoutes } from './routes/auth.js'
import { romRoutes } from './routes/roms.js'
import { adminRoutes } from './routes/admin.js'
import { biosRoutes } from './routes/bios.js'
import { coreRoutes } from './routes/cores.js'
import { roomRoutes } from './routes/rooms.js'
import { installRoomsWebSocket } from './routes/rooms-ws.js'
import { WS_MAX_MESSAGE_BYTES } from './rooms/room-ws-gate.js'
import { saveRoutes } from './routes/saves.js'
import { publicSettingsRoutes, adminSettingsRoutes } from './routes/settings.js'
import { cleanupExpiredSessions } from './middleware/auth.js'
import { csrfProtection, securityHeaders } from './middleware/security.js'
import { installErrorHandler, requestId } from './middleware/error-handler.js'
import { getRuntimeConfig } from './runtime-config.js'

// 启动时读一次版本号：与 package.json、镜像标签保持一致，便于确认线上实际运行的版本。
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

// 未捕获异常/未处理拒绝采用「记录后退出」：继续跑下去可能在状态不一致的情况下
// 服务（例如流式响应里对已关闭的 controller 继续写），静默吞掉只会让问题更难查。
// systemd 单元配了 Restart=on-failure + RestartSec=5，进程会自己起来。
process.on('uncaughtException', (err) => {
  console.error('[api] uncaught exception, exiting', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection, exiting', reason)
  process.exit(1)
})

await runMigrations()

// 先把"整站只有一个进程"这条假设变成硬约束，再去启动 HTTP 服务：抢不到锁说明
// 已经有一个实例在跑（限流、WS 票据、房间状态都各算各的），这里直接退出。
if (instanceLockEnabled()) {
  const lock = await acquireInstanceLock()
  if (!lock.acquired) {
    console.error(
      `[api] 拒绝启动：单实例锁 ${lock.name} 已被占用${lock.holderHint ? `（${lock.holderHint}）` : ''}。` +
      '本站的限流计数、WebSocket 票据与房间在线状态都保存在进程内存里，' +
      '要起第二个实例必须先按 README「架构要点」把它们迁到共享存储；' +
      '临时冒烟调试可用 SINGLE_INSTANCE_LOCK=0 跳过。',
    )
    // 用退出码 0 结束：systemd 的 Restart=on-failure 不会把"抢不到锁"变成
    // 每 5 秒一次的启动风暴，日志里那条错误信息就是唯一的现场。
    process.exit(0)
  }
}

await cleanupExpiredSessions()
const cleanupTimer = setInterval(cleanupExpiredSessions, 60 * 60 * 1000)
cleanupTimer.unref?.()

const app = new Hono()
installErrorHandler(app)
app.use('*', requestId())
app.use('*', securityHeaders())
app.use('/api/*', csrfProtection())
const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({ app })
// 单条 WebSocket 消息的上限。@hono/node-ws 建的是 `new WebSocketServer({ noServer: true })`，
// 没传 maxPayload，于是沿用 ws 的默认值 100MiB —— 业务层那个 8KB 检查要等整条消息
// 缓冲进内存之后才生效，等于没设。这里在容器层就掐断：超限的消息会被 ws 直接拒绝
// 并以 1009 关闭连接（2026-10 审计 M-2）。留一倍余量给 JSON 信封。
wss.options.maxPayload = WS_MAX_MESSAGE_BYTES * 2
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

app.get('/api/health', async (c) => {
  const startedAt = Date.now()
  try {
    await pingDatabase()
    return c.json({ ok: true, version: APP_VERSION, db: 'up', ms: Date.now() - startedAt })
  } catch (error) {
    // 数据库不可用时如实报 503：让健康和就绪探测（Docker healthcheck、
    // deploy/README 里的巡检脚本）看到真相，而不是一个永远 200 的 ok。
    return c.json({
      ok: false,
      version: APP_VERSION,
      db: 'down',
      ms: Date.now() - startedAt,
      error: error?.message || 'database unavailable',
    }, 503)
  }
})
app.get('/api/runtime-config', async (c) => {
  c.header('Cache-Control', 'no-store')
  // 传 c 是有意的：静态 TURN 凭据只对已登录用户下发（见 runtime-config.js）。
  return c.json(await getRuntimeConfig(c))
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
const HOST = process.env.HOST || '0.0.0.0'
const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`[api] listening on http://${HOST}:${info.port}`)
})
injectWebSocket(server)

// 优雅退出：systemd 停服务时先发 SIGTERM（TimeoutStopSec=30）。这里停掉定时器、
// 断开还在线的 WebSocket、放掉单实例锁与连接池再退出，避免把"连接被对端关闭"
// 这类错误留在日志里；10 秒还没收拾完就强退，别拖着。
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[api] received ${signal}, shutting down`)
  const forceExit = setTimeout(() => {
    console.warn('[api] shutdown timed out, forcing exit')
    process.exit(1)
  }, 10_000)
  forceExit.unref?.()

  clearInterval(cleanupTimer)
  try {
    for (const client of wss.clients) client.close(1001, 'server shutting down')
  } catch (error) {
    console.warn('[api] failed to close websocket clients:', error?.message || error)
  }
  await new Promise((done) => server.close(() => done()))
  await releaseInstanceLock()
  try {
    await pool.end()
  } catch (error) {
    console.warn('[api] failed to close database pool:', error?.message || error)
  }
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
