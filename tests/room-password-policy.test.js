import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 2026-10-16 重审的三项修复的约束：
//   N-2 私有房间口令的最短长度 + 失败锁定
//   N-3 启动时把历史明文会话令牌批量改写为 sha256
//   N-4 大厅列表只下发 isMine
const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const roomsRoute = project('server/routes/rooms.js')
const authMiddleware = project('server/middleware/auth.js')
const serverIndex = project('server/index.js')
const createDialog = project('frontend/src/components/CreateRoomDialog.vue')
const editDialog = project('frontend/src/components/EditRoomDialog.vue')
const joinDialog = project('frontend/src/components/JoinRoomDialog.vue')

const { ROOM_PASSWORD_MIN, roomPasswordError } = await import('../frontend/src/constants/roomPassword.js')
const { consumeRateLimit, peekRateLimit } = await import('../server/middleware/rate-limit.js')

test('房间口令下限：前后端都是 4 位，且只约束新设置的口令', () => {
  assert.equal(ROOM_PASSWORD_MIN, 4)
  // 留空表示"不设密码 / 不改密码"，不该报错
  assert.equal(roomPasswordError(''), '')
  assert.equal(roomPasswordError(null), '')
  assert.equal(roomPasswordError(undefined), '')
  assert.equal(roomPasswordError('123'), '房间密码至少 4 位')
  assert.equal(roomPasswordError('1234'), '')
  assert.equal(roomPasswordError('一个够长的口令'), '')

  // 服务端用同一套规则（同一个常数、同一个函数）
  assert.match(roomsRoute, /const ROOM_PASSWORD_MIN = 4/)
  assert.match(roomsRoute, /function passwordPolicyError\(password\) \{\n\s*if \(typeof password !== 'string' \|\| !password\) return ''\n\s*return password\.length < ROOM_PASSWORD_MIN \? `房间密码至少 \$\{ROOM_PASSWORD_MIN\} 位` : ''\n\}/)
})

test('长度校验只出现在建房间与改密码，加入房间不拦（老房间的短口令照常能用）', () => {
  assert.match(roomsRoute, /const passwordError = passwordPolicyError\(password\)\n\s*if \(passwordError\) return c\.json\(\{ error: passwordError \}, 400\)/)
  assert.match(roomsRoute, /const passwordError = passwordPolicyError\(pw\)/)
  const joinBlock = roomsRoute.slice(
    roomsRoute.indexOf("roomRoutes.post('/:code/join'"),
    roomsRoute.indexOf('const patchSchema = z.object({'),
  )
  assert.doesNotMatch(joinBlock, /passwordPolicyError|ROOM_PASSWORD_MIN/)
  // 加入弹窗也不做长度校验，只把服务端的提示显示出来
  assert.doesNotMatch(joinDialog, /roomPasswordError|ROOM_PASSWORD_MIN/)
})

test('房间口令错误单独计数：peek 只读不消耗，consume 才累加', () => {
  const key = `test-room-pw:${Date.now()}:${Math.random()}`
  const options = { windowMs: 60_000, max: 3 }

  // 还没失败过：可以试
  assert.equal(peekRateLimit(key, options).ok, true)
  // 反复 peek 不消耗配额
  for (let i = 0; i < 10; i += 1) assert.equal(peekRateLimit(key, options).ok, true)

  consumeRateLimit(key, options)
  consumeRateLimit(key, options)
  assert.equal(peekRateLimit(key, options).ok, true)
  assert.equal(peekRateLimit(key, options).remaining, 1)

  consumeRateLimit(key, options)
  const blocked = peekRateLimit(key, options)
  assert.equal(blocked.ok, false, '失败满上限之后必须挡住')
  assert.ok(blocked.retryAfter >= 1)
  assert.equal(blocked.remaining, 0)
})

test('加入房间：先只读检查，口令错了才计数（输对不占用尝试次数）', () => {
  assert.match(roomsRoute, /const ROOM_PASSWORD_FAIL_MAX = 10/)
  assert.match(roomsRoute, /const ROOM_PASSWORD_FAIL_WINDOW_MS = 15 \* 60 \* 1000/)
  assert.match(roomsRoute, /const failKey = passwordFailKey\(c, code\)/)
  assert.match(roomsRoute, /const gate = peekRateLimit\(failKey, failOptions\)/)
  assert.match(roomsRoute, /if \(!gate\.ok\) \{\n\s*c\.header\('Retry-After', String\(gate\.retryAfter\)\)\n\s*return c\.json\(\{ error: '密码错误次数过多，请稍后再试' \}, 429\)\n\s*\}/)
  assert.match(roomsRoute, /const ok = await verifyPassword\(password, row\.r\.passwordHash\)\n\s*if \(!ok\) \{\n\s*consumeRateLimit\(failKey, failOptions\)/)
  // 计数键按「来源 + 房间码」隔离：一个房间被爆破不影响另一个房间
  assert.match(roomsRoute, /function passwordFailKey\(c, code\) \{\n\s*return `room-password:\$\{clientIp\(c\)\}:\$\{String\(code \|\| ''\)\.toUpperCase\(\)\}`\n\}/)
})

test('前端建房间与改密码都按同一下限校验，并提示给用户', () => {
  assert.match(createDialog, /import \{ ROOM_PASSWORD_MIN, roomPasswordError \} from '\.\.\/constants\/roomPassword\.js'/)
  assert.match(createDialog, /const pwError = roomPasswordError\(password\.value\)\n\s*if \(pwError\) \{ error\.value = pwError; return \}/)
  assert.match(editDialog, /import \{ ROOM_PASSWORD_MIN, roomPasswordError \} from '\.\.\/constants\/roomPassword\.js'/)
  assert.match(editDialog, /if \(!clearPw\.value\) \{\n\s*const pwError = roomPasswordError\(password\.value\)\n\s*if \(pwError\) \{ error\.value = pwError; return \}\n\s*\}/)
  // 清除密码这条路不走长度校验
  assert.match(editDialog, /if \(clearPw\.value\) patch\.password = null/)
})

test('启动时把历史明文会话令牌批量改写为 sha256（不需要任何人重新登录）', () => {
  assert.match(authMiddleware, /const LEGACY_TOKEN_PATTERN = \/\^\[A-Za-z0-9_-\]\{43\}\$\//)
  assert.match(authMiddleware, /export async function upgradeLegacySessionTokens\(\)/)
  assert.match(authMiddleware, /if \(!LEGACY_TOKEN_PATTERN\.test\(token\)\) continue/)
  assert.match(authMiddleware, /await db\.update\(sessions\)\.set\(\{ token: hashSessionToken\(token\) \}\)\.where\(eq\(sessions\.id, row\.id\)\)/)
  // 在迁移之后、抢单实例锁之前执行一次
  assert.match(serverIndex, /await runMigrations\(\)\n\n\/\/ 历史明文会话令牌[\s\S]{0,400}const upgradedSessionTokens = await upgradeLegacySessionTokens\(\)/)
  assert.match(serverIndex, /import \{ cleanupExpiredSessions, upgradeLegacySessionTokens \} from '\.\/middleware\/auth\.js'/)
})

test('大厅列表只下发 isMine，单个房间的返回值仍带 hostUserId', () => {
  // 列表：有 isMine，没有 hostUserId
  assert.match(roomsRoute, /isMine: !!me && me\.id === r\.hostUserId,/)
  assert.match(roomsRoute, /isMine: true,\n\s*maxPlayers: romMaxPlayers \?\? null,/)
  const listBlock = roomsRoute.slice(roomsRoute.indexOf("roomRoutes.get('/',"), roomsRoute.indexOf("roomRoutes.get('/mine'"))
  assert.doesNotMatch(listBlock, /hostUserId:/)
  // 创建 / 加入 / 编辑的单个房间：带上房主 ID，进房页据此判断"我是房主"
  assert.match(roomsRoute, /hostUserId: inserted\.hostUserId,/)
  assert.match(roomsRoute, /hostUserId: row\.r\.hostUserId,/)
  assert.match(roomsRoute, /hostUserId: updated\.hostUserId,/)
})
