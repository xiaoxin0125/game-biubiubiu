import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 房间密码的两端约定：服务端只拿它拦「别人」，房主（与管理员）进自己的房间一律免密。
// 前端的大厅卡片与加入弹窗必须跟着这个判断走，否则房主进自己的房间还要输一遍自己设的密码。
const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const roomsRoute = project('server/routes/rooms.js')
const wsGate = project('server/rooms/room-ws-gate.js')
const repository = project('server/rooms/room-repository.js')
const roomsView = project('frontend/src/views/Rooms.vue')
const joinDialog = project('frontend/src/components/JoinRoomDialog.vue')

test('服务端：房主与管理员免密（接口与信令准入都放行）', () => {
  assert.match(roomsRoute, /const isHostOrAdmin = !!me && \(me\.id === row\.r\.hostUserId \|\| me\.role === 'admin'\)/)
  assert.match(roomsRoute, /if \(row\.r\.passwordHash && !isHostOrAdmin\) \{/)
  assert.match(wsGate, /const isHostOrAdmin = !!user && \(user\.id === roomRow\?\.hostUserId \|\| user\.role === 'admin'\)/)
  assert.match(wsGate, /else if \(roomRow\.passwordHash && !isHostOrAdmin && !hasValidRoomTicket\) \{/)
  // 免密判断靠的是房间记录里的房主 id：单个房间的返回值（创建 / 加入 / 编辑）
  // 必须带上它。大厅列表改成下发 isMine，不再暴露内部用户 ID（2026-10-16 重审 N-4）。
  assert.match(roomsRoute, /hostUserId: row\.r\.hostUserId,/)
  assert.doesNotMatch(repository, /hostUserId: row\.hostUserId,/)
})

test('大厅列表只下发 isMine，不再暴露房主的内部用户 ID', () => {
  assert.match(roomsRoute, /isMine: !!me && me\.id === r\.hostUserId,/)
  assert.match(roomsRoute, /roomRoutes\.get\('\/', async \(c\) => \{\n\s*const me = await currentUser\(c\)/)
})

test('大厅卡片：自己的房间直接进，不弹密码框，按钮写「进入」', () => {
  assert.match(roomsView, /const \{ isAuthed, isAdmin \} = useAuth\(\)/)
  // 自己的房间 = 服务端按当前登录用户算好的 isMine
  assert.match(roomsView, /function isMine\(r\) \{\n\s*return r\?\.isMine === true\n\}/)
  // 只有「有密码 + 不是我的 + 我不是管理员」才先问密码
  assert.match(roomsView, /function needsPasswordPrompt\(r\) \{\n\s*return !!r\.hasPassword && !isMine\(r\) && !isAdmin\.value\n\}/)
  assert.match(roomsView, /function pickRoom\(r\) \{\n\s*if \(needsPasswordPrompt\(r\)\) pendingRoom\.value = r\n\s*else router\.push\(`\/rooms\/\$\{r\.code\}\/play\/\$\{r\.romId\}`\)\n\}/)
  // 自己的房间按钮写「进入」，不跟着在线状态显示「等待」
  assert.match(roomsView, /function actionLabel\(r\) \{\n\s*if \(isMine\(r\)\) return '进入'/)
})

test('加入弹窗：房主 / 管理员看不到密码输入框，改成一句说明', () => {
  assert.match(joinDialog, /import \{ useAuth \} from '\.\.\/composables\/useAuth\.js'/)
  assert.match(joinDialog, /const \{ user, isAdmin \} = useAuth\(\)/)
  assert.match(joinDialog, /const isRoomOwner = computed\(\(\) => \{\n\s*if \(!props\.room\) return false\n\s*if \(props\.room\.isMine === true\) return true\n\s*return !!user\.value && props\.room\.hostUserId === user\.value\.id\n\}\)/)
  assert.match(joinDialog, /const ownerExempt = computed\(\(\) => isRoomOwner\.value \|\| \(!!props\.room && isAdmin\.value\)\)/)
  assert.match(joinDialog, /const showPasswordField = computed\(\(\) => \(needsPassword\.value \|\| props\.forcePassword\) && !ownerExempt\.value\)/)
  assert.match(joinDialog, /<div v-if="showPasswordField">/)
  // 免密时输入框不再 required：空着提交也不会被浏览器拦住
  assert.match(joinDialog, /:required="!ownerExempt" autofocus \/>/)
  assert.match(joinDialog, /<p v-else-if="ownerExempt && room\?\.hasPassword" class="pw-note">/)
  assert.match(joinDialog, /\{\{ isRoomOwner \? '你是这个房间的房主，不用输密码' : '管理员进入房间不用输密码' \}\}/)
})
