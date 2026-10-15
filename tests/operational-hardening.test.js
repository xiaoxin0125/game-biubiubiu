import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

// 这一组用例守住 2026-10 安全审计第三轮（L 系列低风险项 + 运维加固）的处置：
// 单实例锁、会话闲置过期、健康检查、优雅退出、平台目录搬迁、云存档压缩、
// 静态资源长缓存、postMessage 来源校验、CI 门禁与前端校验的一致性。
//
// 约定同上：能行为验证的就跑真代码，牵涉 HTTP/文件系统的部分按源码断言钉住。

const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const { isSessionIdleExpired } = await import('../server/middleware/auth.js')
const { instanceLockEnabled, DEFAULT_LOCK_NAME } = await import('../server/instance-lock.js')
const { isConnectionLostError, withConnectionRetry } = await import('../server/db/index.js')

// ── 单实例锁：把"整站只有一个进程"从文档假设变成硬约束 ─────────────────
test('单实例锁默认启用，可用 SINGLE_INSTANCE_LOCK=0 显式跳过', () => {
  const original = process.env.SINGLE_INSTANCE_LOCK
  try {
    delete process.env.SINGLE_INSTANCE_LOCK
    assert.equal(instanceLockEnabled(), true, '默认必须启用')
    for (const off of ['0', 'false', 'no', 'off', 'FALSE']) {
      process.env.SINGLE_INSTANCE_LOCK = off
      assert.equal(instanceLockEnabled(), false, `${off} 应当被视为关闭`)
    }
    process.env.SINGLE_INSTANCE_LOCK = '1'
    assert.equal(instanceLockEnabled(), true)
  } finally {
    if (original === undefined) delete process.env.SINGLE_INSTANCE_LOCK
    else process.env.SINGLE_INSTANCE_LOCK = original
  }
})

test('抢不到锁就拒绝启动：提示写清原因，且用退出码 0 避免 systemd 启动风暴', () => {
  const lock = project('server/instance-lock.js')
  // 锁名固定：换名字等于换锁，两个进程各拿一把就没人拦了。
  assert.match(lock, /export const DEFAULT_LOCK_NAME = 'games-online:primary'/)
  assert.match(lock, /SELECT GET_LOCK\(\?, 0\) AS acquired/)
  // 拿锁的连接要一直攥着（还回池子等于放锁）。
  assert.match(lock, /heldConnection = connection/)

  const index = project('server/index.js')
  const lockCall = index.indexOf('await acquireInstanceLock()')
  const serveCall = index.indexOf('const server = serve(')
  assert.ok(lockCall > 0, 'index.js 必须尝试抢锁')
  assert.ok(serveCall > 0 && lockCall < serveCall, '抢锁要在开始接收请求之前')
  // 退出码 0：systemd 的 Restart=on-failure 不会把"抢不到锁"变成启动风暴。
  assert.match(index, /process\.exit\(0\)/)
  assert.match(index, /SINGLE_INSTANCE_LOCK=0 跳过/)
})

// ── 会话闲置过期 ────────────────────────────────────────────────────────
test('会话闲置超过上限即失效，没记过活跃时间的用创建时间兜底', () => {
  const days = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)
  // 默认 14 天：15 天没动过算过期，1 天前动过还算数。
  assert.equal(isSessionIdleExpired({ lastActivityAt: days(15), createdAt: days(16) }), true)
  assert.equal(isSessionIdleExpired({ lastActivityAt: days(1), createdAt: days(16) }), false)
  // 老会话可能没有 last_activity_at（改动之前建立的），退回创建时间判断。
  assert.equal(isSessionIdleExpired({ lastActivityAt: null, createdAt: days(30) }), true)
  // 两个时间都没有就别判过期，免得把刚建立的会话误杀。
  assert.equal(isSessionIdleExpired({ lastActivityAt: null, createdAt: null }), false)

  // 库里读到闲置会话时直接删行并清 Cookie，不是只返回 null。
  const auth = project('server/middleware/auth.js')
  assert.match(auth, /if \(isSessionIdleExpired\(row\.s, now\)\) \{/)
  assert.match(auth, /SESSION_IDLE_TIMEOUT_DAYS/)
  // 定时清理也要一起收走闲置会话。
  assert.match(auth, /conditions\.push\(lt\(sessions\.lastActivityAt, new Date\(now\.getTime\(\) - IDLE_TIMEOUT_MS\)\)\)/)
})

// ── 健康检查与数据库韧性 ────────────────────────────────────────────────
test('健康检查真的去 ping 数据库，连不上就报 503', () => {
  const index = project('server/index.js')
  assert.match(index, /await pingDatabase\(\)/)
  assert.match(index, /db: 'up'/)
  assert.match(index, /\}, 503\)/)

  const db = project('server/db/index.js')
  assert.match(db, /export async function pingDatabase/)
  // 探活要有超时：数据库半死不活时不能把健康检查一起拖住。
  assert.match(db, /database ping timed out after/)
})

test('连接池开着 TCP keepalive，并把"连接被掐断"的重试收敛在启动流程里', async () => {
  const db = project('server/db/index.js')
  assert.match(db, /enableKeepAlive: true/)
  assert.match(db, /keepAliveInitialDelay: 10_000/)
  // 迁移与启动清理套一层重试（幂等），业务写操作不套。
  assert.match(db, /withConnectionRetry\(\(\) => migrate\(/)

  assert.equal(isConnectionLostError({ code: 'PROTOCOL_CONNECTION_LOST' }), true)
  assert.equal(isConnectionLostError({ code: 'ECONNRESET' }), true)
  assert.equal(isConnectionLostError({ code: 'ER_DUP_ENTRY' }), false)
  assert.equal(isConnectionLostError(null), false)

  let calls = 0
  const value = await withConnectionRetry(async () => {
    calls += 1
    if (calls === 1) throw Object.assign(new Error('gone'), { code: 'PROTOCOL_CONNECTION_LOST' })
    return 'ok'
  })
  assert.equal(value, 'ok')
  assert.equal(calls, 2, '掉线后应当重试一次')

  let attempts = 0
  await assert.rejects(
    withConnectionRetry(async () => {
      attempts += 1
      throw Object.assign(new Error('gone'), { code: 'PROTOCOL_CONNECTION_LOST' })
    }),
    /gone/,
  )
  assert.equal(attempts, 2, '重试次数是有限的，不能无限重放')

  await assert.rejects(
    withConnectionRetry(async () => { throw new Error('语法错误不该重试') }),
    /语法错误/,
  )
})

test('收到 SIGTERM 后优雅退出：停监听、断 WS、放锁、关池', () => {
  const index = project('server/index.js')
  assert.match(index, /process\.on\('SIGTERM'/)
  assert.match(index, /process\.on\('SIGINT'/)
  assert.match(index, /for \(const client of wss\.clients\) client\.close\(1001/)
  assert.match(index, /await releaseInstanceLock\(\)/)
  assert.match(index, /await pool\.end\(\)/)
  // 收不完就强退，别让 systemd 一直等（TimeoutStopSec=30）。
  assert.match(index, /shutdown timed out, forcing exit/)
})

// ── 平台目录搬迁（L-11）─────────────────────────────────────────────────
test('管理员改平台时文件跟着搬，任何一步失败都整体回滚', () => {
  const roms = project('server/routes/roms.js')
  assert.match(roms, /function planPlatformMoves\(rows, platform\)/)
  assert.match(roms, /async function applyPlatformMoves\(moves\)/)
  // 先搬文件、再改库：中途失败时库里还指向旧目录，两边一致。
  const moveCall = roms.indexOf('await applyPlatformMoves(planned.moves)')
  const updateCall = roms.indexOf('for (const entry of planned.plan) {')
  assert.ok(moveCall > 0 && updateCall > moveCall, '必须先搬文件再改库')
  // 回滚：已搬走的按相反顺序搬回原位。
  assert.match(roms, /for \(const move of done\.reverse\(\)\)/)
  assert.match(roms, /failed to roll back platform file move/)
  // 目标已存在时不动任何文件（避免覆盖别人的同名文件）。
  assert.match(roms, /目标文件已存在，未改动任何文件/)
  // 文件不在磁盘上时只改记录，不凭空造路径。
  assert.match(roms, /targets\.set\(filePath, null\)/)
  // 封面被多个变体共用时只搬一次。
  assert.match(roms, /if \(targets\.has\(filePath\)\) return targets\.get\(filePath\)/)
  // 搬了什么要进审计日志。
  assert.match(roms, /movedFiles: movedFileCount/)
})

test('搬迁的目标目录与上传时的分层规则一致（用户 / 平台）', () => {
  const roms = project('server/routes/roms.js')
  assert.match(roms, /const targetDir = checkedUploadPath\(String\(userId\), platform\)/)
  assert.match(roms, /const userDir = checkedUploadPath\(String\(user\.id\), platform\)/)
})

// ── 云存档：压缩 + 提前上传（L-5）──────────────────────────────────────
test('大存档先压 gzip 再传，服务端解压并限制解压后的体积', () => {
  const client = project('frontend/src/api/client.js')
  assert.match(client, /const SAVE_COMPRESS_THRESHOLD_BYTES = 16 \* 1024/)
  assert.match(client, /new CompressionStream\('gzip'\)/)
  assert.match(client, /headers\['Content-Encoding'\] = 'gzip'/)
  assert.match(client, /compressed\.size < blob\.size/)

  const saves = project('server/routes/saves.js')
  assert.match(saves, /gunzipSync\(raw, \{ maxOutputLength: MAX_STATE_BYTES \}\)/)
  // 解压失败与解压后超限要分开报，别把 gzip 炸弹当成"格式错误"。
  assert.match(saves, /存档解压失败/)
  assert.match(saves, /ERR_BUFFER_TOO_LARGE/)

  // 切后台走普通请求（页面还活着，能完整跑完），只有 pagehide 才用 keepalive 兜底。
  const j2me = project('frontend/src/composables/player/j2meRuntime.js')
  assert.match(j2me, /function onVisibilityHidden\(\) \{ if \(document\.visibilityState === 'hidden'\) void flushCloudSave\(\) \}/)
  assert.match(j2me, /function onPageHide\(\) \{ void flushCloudSave\(\{ keepalive: true \}\) \}/)
})

// ── postMessage 来源校验（L-6）───────────────────────────────────────────
test('iframe 消息两端都校验来源', () => {
  const j2me = project('frontend/src/composables/player/j2meRuntime.js')
  assert.match(j2me, /if \(event\.source && event\.source !== runtimeWindow\(\)\) return/)

  for (const file of ['frontend/public/j2me/bridge.js', 'frontend/public/j2me/rms.js']) {
    const source = project(file)
    assert.doesNotMatch(source, /postMessage\([^)]*,\s*'\*'\)/, `${file} 还在用通配目标源`)
    assert.match(source, /location\.origin/)
  }
})

// ── 路由守卫缓存（L-12）与前端校验一致性 ────────────────────────────────
test('登录状态变化时路由守卫的缓存同步失效', () => {
  const router = project('frontend/src/router/index.js')
  assert.match(router, /import \{ cacheCurrentUser, peekCurrentUser \} from '\.\.\/composables\/authCache\.js'/)
  assert.doesNotMatch(router, /let cachedUser/)

  const auth = project('frontend/src/composables/useAuth.js')
  assert.match(auth, /cacheCurrentUser\(u\)/)
  assert.match(auth, /clearCurrentUserCache\(\)/)
})

test('前端密码校验与服务端的 8 位下限一致', async () => {
  const { MIN_PASSWORD_LENGTH } = await import('../server/passwords.js')
  assert.equal(MIN_PASSWORD_LENGTH, 8)
  for (const file of ['frontend/src/views/Auth.vue', 'frontend/src/components/ChangePasswordDialog.vue']) {
    const source = project(file)
    assert.match(source, /value\.length >= 8/, `${file} 的校验没跟上服务端`)
    assert.match(source, /至少 8 位/)
  }
})

// ── nginx：静态资源长缓存 + 缺失文件真 404（L-9）────────────────────────
test('nginx 配置给带 hash 的资源长缓存，缺文件不再回 index.html', () => {
  const conf = project('deploy/nginx/extension-app.conf')
  assert.match(conf, /location \^~ \/assets\//)
  assert.match(conf, /immutable/)
  assert.match(conf, /location @spa/)
  // 带扩展名的路径一律返回真 404，不再把 index.html 当成 JS/CSS 发出去。
  assert.ok(
    conf.includes('if ($uri ~ "\\.") { return 404; }'),
    'SPA 回退要对带扩展名的缺失文件返回 404',
  )
})

// ── CI 门禁（L-10）──────────────────────────────────────────────────────
test('CI 跑 lint / 测试 / 依赖审计，且 npm 脚本齐全', () => {
  const pkg = JSON.parse(project('package.json'))
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.js')
  assert.equal(pkg.scripts.lint, 'eslint .')
  assert.match(pkg.scripts['test:coverage'], /--experimental-test-coverage/)
  assert.ok(pkg.devDependencies.eslint, 'eslint 要在 devDependencies 里')

  const ci = project('.github/workflows/ci.yml')
  assert.match(ci, /npm run lint/)
  assert.match(ci, /npm test/)
  assert.match(ci, /npm audit --omit=dev --audit-level=moderate/)
  assert.match(ci, /npm run build/)

  assert.ok(existsSync(new URL('../eslint.config.js', import.meta.url)), 'eslint 扁平配置要在仓库根')
})

test('依赖更新有机器人盯着，运维文档写清备份与轮换', () => {
  const dependabot = project('.github/dependabot.yml')
  assert.match(dependabot, /package-ecosystem: npm/)
  assert.match(dependabot, /package-ecosystem: github-actions/)

  const deploy = project('deploy/README.md')
  assert.match(deploy, /## 备份、恢复与密钥轮换/)
  assert.match(deploy, /mysqldump --single-transaction/)
  assert.match(deploy, /chmod 600 \.env|chmod 600/)
})

test('环境变量样例与文档列出新增开关', () => {
  const example = project('.env.example')
  assert.match(example, /SESSION_IDLE_TIMEOUT_DAYS=14/)
  assert.match(example, /SINGLE_INSTANCE_LOCK=1/)
  const compose = project('compose.yaml')
  assert.match(compose, /SESSION_IDLE_TIMEOUT_DAYS/)
  assert.match(compose, /SINGLE_INSTANCE_LOCK/)
  const config = project('server/config.js')
  assert.match(config, /'SESSION_IDLE_TIMEOUT_DAYS'/)
  assert.match(config, /'SINGLE_INSTANCE_LOCK'/)
})

test('单实例锁名可用于排障（避免手误改锁名）', () => {
  assert.equal(DEFAULT_LOCK_NAME, 'games-online:primary')
})
