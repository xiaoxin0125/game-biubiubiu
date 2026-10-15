import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import bcrypt from 'bcryptjs'

// 这一组用例守住 2026-10 安全审计里 M 系列（中风险）的处置：任何一条被改回去，
// 都应当在 CI 里立刻暴露，而不是等下一次审计。
//
// TRUST_PROXY 必须在导入 security.js 之前设好：那个模块在加载时读一次环境变量。
process.env.TRUST_PROXY = '1'
const { clientIp } = await import('../server/middleware/security.js')
const { createConcurrencyLimiter } = await import('../server/middleware/concurrency-limit.js')
const {
  hashPassword,
  verifyPassword,
  needsRehash,
  parseScryptHash,
  isLegacyHash,
  MIN_PASSWORD_LENGTH,
} = await import('../server/passwords.js')

const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function fakeContext() {
  const headers = {}
  return {
    headers,
    header: (name, value) => { headers[name] = value },
    json: (body, status) => ({ body, status: status ?? 200 }),
  }
}

// ── M-7：clientIp 取 X-Forwarded-For 的最后一段 ──────────────────────────
test('clientIp 取 XFF 最后一段，客户端伪造的前缀地址顶不掉真实来源', () => {
  const withXff = (value) => clientIp({
    req: { url: 'http://example.com/', header: (name) => (name === 'x-forwarded-for' ? value : null) },
  })
  // 反代追加模式（$proxy_add_x_forwarded_for）：前两段由攻击者伪造，最后一段才是真的
  assert.equal(withXff('1.2.3.4, 5.6.7.8, 203.0.113.9'), '203.0.113.9')
  assert.equal(withXff('203.0.113.9'), '203.0.113.9')
  assert.equal(withXff(' 203.0.113.9 , 10.0.0.1 '), '10.0.0.1')
  assert.equal(withXff(''), 'unknown')
})

// ── M-1：上传并发闸门 ───────────────────────────────────────────────────
test('并发闸门：超出上限直接 429 并带 Retry-After，释放后恢复', async () => {
  const limiter = createConcurrencyLimiter({ name: 'test-gate', max: 1, retryAfterSec: 3 })
  let release
  let firstRuns = 0
  const gate = new Promise((resolve) => { release = resolve })

  // 第一个请求进入处理器后卡在 gate 上，名额被占住
  const first = limiter.middleware(fakeContext(), async () => { firstRuns += 1; await gate })
  assert.equal(firstRuns, 1)

  let secondRuns = 0
  const busy = fakeContext()
  const rejected = await limiter.middleware(busy, async () => { secondRuns += 1 })
  assert.equal(rejected.status, 429)
  assert.equal(busy.headers['Retry-After'], '3')
  assert.equal(secondRuns, 0, '被拒绝的请求不能进入处理器')
  assert.equal(limiter.stats().rejected, 1)
  assert.equal(limiter.stats().peak, 1)

  release()
  await first
  assert.equal(limiter.stats().active, 0)

  // 释放之后可以继续进入
  let ranAfterRelease = false
  await limiter.middleware(fakeContext(), async () => { ranAfterRelease = true })
  assert.equal(ranAfterRelease, true)
  assert.equal(limiter.stats().active, 0)
})

test('并发闸门：处理器抛错也要归还名额', async () => {
  const limiter = createConcurrencyLimiter({ name: 'test-gate-error', max: 1 })
  await assert.rejects(() => limiter.middleware(fakeContext(), async () => { throw new Error('boom') }))
  assert.equal(limiter.stats().active, 0)
})

test('上传入口挂上了限流、并发闸门与 bodyLimit 三道闸', () => {
  const roms = project('server/routes/roms.js')
  const upload = roms.slice(roms.indexOf("romRoutes.post('/upload'"))
  assert.match(upload, /requireAuth,\s*\n\s*romUploadRateLimit,\s*\n\s*uploadConcurrency\.middleware,\s*\n\s*romUploadBodyLimit/)
  // 限流按用户维度，10 次/分钟（UPLOAD_RATE_LIMIT_PER_MINUTE 可覆盖）
  assert.match(roms, /max: Number\(process\.env\.UPLOAD_RATE_LIMIT_PER_MINUTE\) \|\| 10/)
  assert.match(roms, /key: \(c\) => String\(c\.get\('user'\)\?\.id \?\? clientIp\(c\)\)/)
  // 封面重设同样在闸门后面（它会先把 4MB 读进内存）
  const cover = roms.slice(roms.indexOf("romRoutes.post('/:id/cover'"))
  assert.match(cover.slice(0, 400), /uploadConcurrency\.middleware/)
  assert.match(cover.slice(0, 400), /bodyLimit\(/)

  // 存档上传：只信 content-length 会被 chunked 绕过，必须有 bodyLimit
  const saves = project('server/routes/saves.js')
  assert.match(saves, /saveRoutes\.post\('\/:romId', requireAuth, saveUploadBodyLimit/)
  assert.match(saves, /maxSize: MAX_STATE_BYTES \+ 1024 \* 1024/)
})

// ── M-2：WebSocket 单条消息上限（在容器层就掐断，而不是缓冲完再判） ──────
test('WebSocket 服务端设置了 maxPayload，与业务层的 8KB 限制对齐', () => {
  const index = project('server/index.js')
  assert.match(index, /wss\.options\.maxPayload = WS_MAX_MESSAGE_BYTES \* 2/)
  const gate = project('server/rooms/room-ws-gate.js')
  assert.match(gate, /export const WS_MAX_MESSAGE_BYTES = 8192/)
})

test('ErrorEvent polyfill 让 ws 的 socket 错误回调不再抛 ReferenceError', async () => {
  const { installErrorEventPolyfill } = await import('../server/error-event-polyfill.js')
  // 模块在导入时就装好了（index.js 里同样在 createNodeWebSocket 之前导入它）
  assert.equal(typeof globalThis.ErrorEvent, 'function')
  const error = new Error('boom')
  const event = new globalThis.ErrorEvent('error', { error })
  assert.equal(event.type, 'error')
  assert.equal(event.error, error)
  assert.equal(event.message, 'boom')
  assert.ok(event instanceof globalThis.Event)
  // 幂等：已存在不会重复覆盖
  assert.equal(installErrorEventPolyfill(), false)
  assert.match(project('server/index.js'), /import '\.\/error-event-polyfill\.js'/)
})

// ── M-3：口令哈希与会话令牌 ─────────────────────────────────────────────
test('密码使用 scrypt：同一个口令两次哈希不同，校验可分辨对错', async () => {
  const first = await hashPassword('correct horse battery staple')
  const second = await hashPassword('correct horse battery staple')
  assert.notEqual(first, second, '必须每次换盐')
  assert.match(first, /^scrypt\$32768\$8\$1\$/)
  assert.equal(isLegacyHash(first), false)
  assert.ok(parseScryptHash(first))

  assert.equal(await verifyPassword('correct horse battery staple', first), true)
  assert.equal(await verifyPassword('wrong password', first), false)
  assert.equal(await verifyPassword('', first), false)
  assert.equal(await verifyPassword('x', 'not-a-hash'), false)
  assert.equal(needsRehash(first), false)
})

test('历史 bcrypt 哈希仍可校验，并在校验后被判定为需要升级', async () => {
  const legacy = bcrypt.hashSync('old-password-123', 10)
  assert.equal(isLegacyHash(legacy), true)
  assert.equal(await verifyPassword('old-password-123', legacy), true)
  assert.equal(await verifyPassword('nope', legacy), false)
  assert.equal(needsRehash(legacy), true)
})

test('口令最短长度统一为 8 位，且旧的 6 位哈希不受影响', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8)
  const auth = project('server/routes/auth.js')
  assert.match(auth, /const passwordSchema = z\.string\(\)\s*\n\s*\.min\(MIN_PASSWORD_LENGTH\)/)
  assert.match(auth, /return `密码至少 \$\{MIN_PASSWORD_LENGTH\} 位`/)
  // 用户口令不再直接用 bcryptjs（实现收敛到 server/passwords.js）
  assert.doesNotMatch(auth, /from 'bcryptjs'/)
  assert.doesNotMatch(auth, /bcrypt\.(hash|compare)/)
  assert.match(project('server/db/index.js'), /const MIN_ADMIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH/)
  // 房间密码走同一套哈希（否则两处实现会各自漂移）
  const rooms = project('server/routes/rooms.js')
  assert.doesNotMatch(rooms, /from 'bcryptjs'/)
  assert.doesNotMatch(rooms, /bcrypt\.(hash|compare)/)
  assert.match(rooms, /import \{ hashPassword, verifyPassword \} from '\.\.\/passwords\.js'/)
})

test('会话令牌只以 sha256 入库，且兼容改动前建立的旧会话', () => {
  const auth = project('server/middleware/auth.js')
  assert.match(auth, /function hashSessionToken\(token\) \{\s*\n\s*return createHash\('sha256'\)/)
  assert.match(auth, /token: hashSessionToken\(token\), ip, userAgent, expiresAt/)
  // 旧会话（库里还是明文）命中一次后改写为哈希，不强制任何人重新登录
  assert.match(auth, /row = await findSessionRow\(token, now\)/)
  assert.match(auth, /set\(\{ token: hashed \}\)/)
  // 退出登录要能同时删掉明文与哈希两种行
  assert.match(auth, /eq\(sessions\.token, hashSessionToken\(token\)\),\s*\n\s*eq\(sessions\.token, token\),/)
  // 不再有裸的 fire-and-forget 写库（它是 unhandled rejection 的来源）
  assert.doesNotMatch(auth, /\.execute\?\.\(\)/)
  assert.match(auth, /ACTIVITY_TOUCH_INTERVAL_MS/)
})

// ── M-4：建房上限、投稿入口小锁 ─────────────────────────────────────────
test('普通用户同时只能有一个未关闭的房间，管理员不受限', () => {
  const rooms = project('server/routes/rooms.js')
  assert.match(rooms, /const MAX_OPEN_ROOMS_PER_USER = 1/)
  assert.match(rooms, /if \(me\.role !== 'admin'\) \{\s*\n\s*const \[row\] = await db\.select\(\{ n: count\(\) \}\)\.from\(rooms\)/)
  assert.match(rooms, /openRoomLimit: MAX_OPEN_ROOMS_PER_USER/)
  assert.match(rooms, /roomRoutes\.post\('\/', requireAuth, roomCreateLimiter/)
})

test('管理员关闭普通用户上传后，投稿页面显示小锁而不是被后端拒绝', () => {
  const myRoms = project('frontend/src/views/MyRoms.vue')
  assert.match(myRoms, /const canUpload = computed\(\(\) => isAdmin\.value \|\| settings\.value\.userUploadEnabled !== false\)/)
  assert.match(myRoms, /:disabled="!canUpload"/)
  assert.match(myRoms, /管理员已关闭普通用户上传/)
  // 空态里的「选择文件」也要锁上，并给一句人话
  assert.match(myRoms, /\{\{ canUpload \? '选择文件' : '上传已关闭' \}\}/)
  assert.match(myRoms, /function openUpload\(\) \{\s*\n\s*\/\/ 锁着的时候不打开上传弹窗/)
})

// ── M-5：流式响应与进程异常策略 ─────────────────────────────────────────
test('流式响应统一用 Readable.toWeb，不再手写流包装', () => {
  for (const file of ['server/routes/roms.js', 'server/routes/saves.js', 'server/routes/bios.js']) {
    const source = project(file)
    assert.match(source, /import \{ Readable \} from 'node:stream'/, `${file} 缺少 Readable 导入`)
    assert.match(source, /Readable\.toWeb\(/, `${file} 应该用 Readable.toWeb`)
    assert.doesNotMatch(source, /new ReadableStream\(\{\s*\n\s*start\(controller\)/, `${file} 仍有手写流包装`)
  }
})

test('未捕获异常与未处理拒绝记录后退出，交给 systemd 拉起', () => {
  const index = project('server/index.js')
  assert.match(index, /process\.on\('uncaughtException', \(err\) => \{\s*\n\s*console\.error\('\[api\] uncaught exception, exiting', err\)\s*\n\s*process\.exit\(1\)/)
  assert.match(index, /process\.on\('unhandledRejection', \(reason\) => \{\s*\n\s*console\.error\('\[api\] unhandled rejection, exiting', reason\)\s*\n\s*process\.exit\(1\)/)
})

// ── M-8：匿名可读的接口 ─────────────────────────────────────────────────
test('BIOS 文件清单与单文件下载一样需要登录', () => {
  const bios = project('server/routes/bios.js')
  assert.match(bios, /biosRoutes\.get\('\/:platform', requireAuth, \(c\) => \{/)
  assert.match(bios, /biosRoutes\.get\('\/:platform\/:file', async \(c\) => \{\s*\n\s*const user = await currentUser\(c\)/)
})
