import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 复制房间码有两处入口：房间名（大厅卡片、房间内顶栏与房间面板）和「我的房间」里的
// 房间码胶囊。两边都必须自己拦住点击 / 按键的冒泡 —— 复制的时候不能顺手进了房间。
const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const chip = project('frontend/src/components/RoomCodeChip.vue')
const nameCopy = project('frontend/src/components/RoomNameCopy.vue')
const clipboard = project('frontend/src/composables/clipboard.js')

test('复制优先走 Clipboard API，老 WebView 退回 execCommand', () => {
  assert.match(clipboard, /export async function copyText\(text\) \{/)
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/)
  assert.match(clipboard, /await navigator\.clipboard\.writeText\(value\)/)
  // 权限被拒 / 非安全上下文时不能就此失败，得继续往下走兜底
  assert.match(clipboard, /\} catch \{\n\s*\/\/ 权限被拒 \/ 非安全上下文：继续走下面的兜底\n\s*\}/)
  assert.match(clipboard, /document\.createElement\('textarea'\)/)
  assert.match(clipboard, /document\.execCommand\('copy'\)/)
  assert.match(clipboard, /document\.body\.removeChild\(area\)/)
  // 复制不了时如实返回 false，由调用方决定怎么提示
  assert.match(clipboard, /return ok\n\s*\} catch \{\n\s*return false\n\s*\}/)
})

test('房间码胶囊：点了复制，顺手显示「已复制」并拦住冒泡', () => {
  assert.match(chip, /import \{ copyText \} from '\.\.\/composables\/clipboard\.js'/)
  assert.match(chip, /code: \{ type: String, required: true \}/)
  assert.match(chip, /@click\.stop="onCopy"/)
  // 卡片 / 弹窗行上有 keydown.enter → 进房，键盘触发复制时也不能传到外层
  assert.match(chip, /@keydown\.enter\.stop\n\s*@keydown\.space\.stop/)
  assert.match(chip, /async function onCopy\(\) \{\n\s*if \(!await copyText\(props\.code\)\) return/)
  // 「已复制」只显示一秒多，不用弹窗打断玩家；组件卸载时把定时器清掉
  assert.match(chip, /timer = setTimeout\(\(\) => \{ copied\.value = false \}, 1500\)/)
  assert.match(chip, /onBeforeUnmount\(\(\) => clearTimeout\(timer\)\)/)
  assert.match(chip, /\{\{ copied \? '已复制' : code \}\}/)
  // 无障碍：按钮有明确的标题与标签
  assert.match(chip, /:aria-label="`复制房间码 \$\{code\}`"/)
  assert.match(chip, /:title="copied \? '已复制' : `复制房间码 \$\{code\}`"/)
  // 外观沿用站点的凹陷胶囊（可点，但看起来还是房间码那一小块）
  assert.match(chip, /\.room-code \{[\s\S]*?border-radius: var\(--r-pill\);[\s\S]*?box-shadow: var\(--clay-in-sm\);/)
  assert.match(chip, /\.room-code:focus-visible \{ outline: none; box-shadow: var\(--clay-focus\); \}/)
})

test('房间名本身就是复制按钮：点名字复制房间码，名字始终看得见', () => {
  assert.match(nameCopy, /import \{ copyText \} from '\.\.\/composables\/clipboard\.js'/)
  assert.match(nameCopy, /code: \{ type: String, required: true \}/)
  assert.match(nameCopy, /@click\.stop="onCopy"/)
  assert.match(nameCopy, /@keydown\.enter\.stop\n\s*@keydown\.space\.stop/)
  assert.match(nameCopy, /async function onCopy\(\) \{\n\s*if \(!await copyText\(props\.code\)\) return/)
  // 复制成功只把右侧图标换成对勾（不改名字文字），一秒多后复原
  assert.match(nameCopy, /timer = setTimeout\(\(\) => \{ copied\.value = false \}, 1500\)/)
  assert.match(nameCopy, /onBeforeUnmount\(\(\) => clearTimeout\(timer\)\)/)
  assert.match(nameCopy, /<span class="hint" aria-hidden="true">\s*\n\s*<svg v-if="copied"/)
  assert.match(nameCopy, /<span class="name-text"><slot>\{\{ name \}\}<\/slot><\/span>/)
  assert.match(nameCopy, /:aria-label="`复制房间码 \$\{code\}`"/)
  assert.match(nameCopy, /:title="copied \? '已复制房间码' : `复制房间码 \$\{code\}`"/)
  // 平时图标很淡（可用 --name-copy-hint 调亮），悬停 / 聚焦 / 复制成功才亮
  assert.match(nameCopy, /opacity: var\(--name-copy-hint, 0\.32\);/)
  assert.match(nameCopy, /\.room-name:hover \.hint,\n\.room-name:focus-visible \.hint \{ opacity: 1; \}/)
})

test('房间内也看得到房间名：顶栏 PLAYING 后面 + 房间面板标题，都是点一下复制', () => {
  // 服务端把房间名放进信令的 room 状态（进入房间 / 刷新都拿得到，不依赖大厅那一跳）
  const hub = project('server/room-hub.js')
  const state = project('server/rooms/room-state.js')
  assert.match(state, /name: room\.name \|\| '',/)
  assert.match(hub, /name: row\.name \|\| '',/)
  assert.match(hub, /export function updateRoomPermissions\(code, \{ allowPlay, name \} = \{\}\) \{/)
  assert.match(hub, /if \(typeof name === 'string' && name\) room\.name = name/)
  assert.match(project('server/routes/rooms.js'), /updateRoomPermissions\(code, \{ allowPlay: updated\.allowPlay !== false, name: updated\.name \}\)/)

  // 前端把房间名从信令里接下来
  const session = project('frontend/src/composables/player/useRoomSession.js')
  assert.match(session, /const roomName = ref\(''\)/)
  assert.match(session, /if \(typeof room\.name === 'string' && room\.name\) roomName\.value = room\.name/)
  assert.match(session, /roomMaxPlayers, roomName, isHostMode/)

  // 顶栏：房间名摆在 PLAYING 后面，点一下复制房间码
  const overlay = project('frontend/src/components/emulator-portal/GameOverlay.vue')
  assert.match(overlay, /roomName: \{ type: String, default: '' \},/)
  assert.match(overlay, /roomCode: \{ type: String, default: '' \},/)
  assert.match(overlay, /<span class="playing-led"[\s\S]{0,120}?<\/span>\s*\n\s*<!-- 联机房间里把房间名摆在运行指示后面[\s\S]{0,200}?<RoomNameCopy\s+v-if="roomName"\s+:code="roomCode"\s+class="bar-room"\s*>[\s\S]{0,20}?\{\{ roomName \}\}<\/RoomNameCopy>/)
  assert.match(overlay, /\.bar-room \{[\s\S]*?background: var\(--clay-pink-soft\);[\s\S]*?color: #7A3D5C;/)
  // 手机端顶栏放不下，房间名整块收起来（房间面板标题里仍看得到、点它照样复制房间码）；
  // 游戏名与平台标签照常显示，长游戏名带省略号收尾。
  // 房间名是 RoomNameCopy 的根元素、自带 display，必须用 :deep 提一级才盖得住。
  const mobileBar = overlay.slice(overlay.indexOf('@media (max-width: 768px)'), overlay.indexOf('@media (max-height: 500px)'))
  assert.ok(mobileBar.length > 0, '顶栏应有一段手机端媒体查询')
  assert.match(mobileBar, /\.bar-center :deep\(\.bar-room\) \{ display: none; \}/)
  assert.doesNotMatch(mobileBar, /\.bar-title \{[^}]*display: none;/)
  // 横屏手机同样收掉房间名
  const landscapeBar = overlay.slice(overlay.indexOf('@media (max-height: 500px)'))
  assert.match(landscapeBar, /\.bar-badge, \.bar-core, \.playing-led \{ display: none; \}/)
  assert.match(landscapeBar, /\.bar-center :deep\(\.bar-room\) \{ display: none; \}/)
  // 收掉房间名后不再有「游戏名限宽让位」那套规则，也没有残留的 has-room 类
  assert.doesNotMatch(overlay, /has-room/)
  assert.match(overlay, /\.bar-title \{[\s\S]*?text-overflow: ellipsis;/)

  // 房间面板：标题从房间码改成房间名，点名称复制房间码
  const panel = project('frontend/src/components/emulator-portal/RoomPanel.vue')
  assert.match(panel, /name: \{ type: String, default: '' \},/)
  assert.match(panel, /<RoomNameCopy :code="code" class="rp-name">\{\{ name \|\| code \}\}<\/RoomNameCopy>/)
  assert.doesNotMatch(panel, /class="rp-code"/)

  // 播放页把两者接上
  const player = project('frontend/src/views/RoomPlayer.vue')
  assert.match(player, /:room-name="isRoomMode \? roomName : ''"\n\s+:room-code="roomCode"/)
  assert.match(player, /:code="roomCode"\n\s+:name="roomName"/)
})

test('大厅卡片与「我的房间」弹窗各自的复制入口', () => {
  const rooms = project('frontend/src/views/Rooms.vue')
  const dialog = project('frontend/src/components/MyRoomsDialog.vue')
  // 大厅卡片上不再有房间码胶囊（避免误触进房），改成点名字复制
  assert.doesNotMatch(rooms, /RoomCodeChip/)
  assert.match(rooms, /<RoomNameCopy :code="r\.code" class="card-name">\{\{ r\.name \}\}<\/RoomNameCopy>/)
  // 「我的房间」里房间名照常显示，房间码胶囊负责复制
  assert.match(dialog, /<RoomCodeChip :code="r\.code" \/>/)
  assert.match(dialog, /<span class="name">\{\{ r\.name \}\}<\/span>/)
})
