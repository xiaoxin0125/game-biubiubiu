import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 对战大厅：房间列表改成竖版卡片（封面在上、高比宽大），PC 一行 4 个、手机一行 2 个，
// 封面跟着房间里正在跑的那盘 ROM 走；「我的房间」收进弹窗。房间接口不下发封面地址的话，
// 卡片和弹窗都会退化成默认卡带图，所以接口与页面两端一起钉住。
const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const roomsRoute = project('server/routes/rooms.js')
const roomsView = project('frontend/src/views/Rooms.vue')
const myRoomsDialog = project('frontend/src/components/MyRoomsDialog.vue')

test('房间接口下发游戏封面地址，换 ROM 后封面跟着换', () => {
  assert.match(roomsRoute, /import \{ coverUrlFor \} from '\.\/roms\.js'/)
  // 公开房间、我主持的、房主切 ROM 回包三处都 select 封面字段
  assert.equal((roomsRoute.match(/romCoverPath: roms\.coverPath,/g) || []).length, 3)
  assert.equal((roomsRoute.match(/romCoverUrl: coverUrlFor\(\{ id: (?:r|row\.r)\.romId, coverPath: romCoverPath \}\)/g) || []).length, 2)
  assert.match(roomsRoute, /romCoverUrl: coverUrlFor\(\{ id: row\.r\.romId, coverPath: row\.romCoverPath \}\)/)
  assert.match(roomsRoute, /romCoverUrl: coverUrlFor\(rom\)/)
  // 封面的版本参数取自 coverPath，换封面后地址跟着变，浏览器不会拿旧图
  const roms = project('server/routes/roms.js')
  assert.match(roms, /export function coverUrlFor\(rom\) \{\n\s*if \(!rom\?\.coverPath\) return null/)
})

test('大厅卡片：封面是正方形，PC 一行 3 个、手机一行 1 个', () => {
  assert.match(roomsView, /<div v-else ref="gridRef" class="room-grid" :class="\{ 'is-sized': coverSide > 0 \}" :style="\{ '--cover-side': `\$\{coverSide\}px` \}">/)
  // 封面自己一块圆角插图：外面套一层留白，不顶着卡片的大圆角
  assert.match(roomsView, /<div class="card-cover-box">\s*\n\s*<div class="card-cover">[\s\S]{0,160}?<RomCover :rom="coverOf\(r\)" \/>/)
  assert.match(roomsView, /\.card-cover-box \{ padding: 0 16px; \}/)
  // 封面必须是正方形。不用 aspect-ratio / inset 这类老 WebView 不认的属性：
  // 纯 CSS 用 padding-bottom 百分比兜底，JS 量出卡片宽度后加 .is-sized 按像素定高。
  assert.match(roomsView, /\.card-cover \{\n  position: relative;\n  width: 100%;\n  height: 0;\n  padding-bottom: 100%;\n  border-radius: var\(--r-md\);\n  overflow: hidden;\n  box-shadow: var\(--clay-sm\);\n\}/)
  assert.match(roomsView, /\.room-grid\.is-sized \.card-cover \{\n  height: var\(--cover-side, 0px\);\n  padding-bottom: 0;\n\}/)
  assert.match(roomsView, /\.card-cover :deep\(\.rom-cover\) \{\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;[\s\S]*?--cover-radius: 0;/)
  assert.doesNotMatch(roomsView, /^\s*(?:aspect-ratio|inset):/m, '正方形的实现不能依赖 aspect-ratio / inset')
  // 边长由 ResizeObserver 量出来写进 --cover-side（窗口缩放、卡片渲染都会重量）
  assert.match(roomsView, /const coverSide = ref\(0\)/)
  assert.match(roomsView, /new ResizeObserver\(measureCover\)/)
  assert.match(roomsView, /gridObserver\.observe\(el\)/)
  assert.match(roomsView, /onBeforeUnmount\(\(\) => \{ gridObserver\?\.disconnect\(\) \}\)/)
  assert.match(roomsView, /:style="\{ '--cover-side': `\$\{coverSide\}px` \}"/)
  assert.match(roomsView, /:class="\{ 'is-sized': coverSide > 0 \}"/)
  // 卡片纵向排列（名字、封面、信息、按钮），PC 一行 3 个
  assert.match(roomsView, /\.room-card \{\n  display: flex;\n  flex-direction: column;/)
  assert.match(roomsView, /\.room-grid \{\n  display: grid;\n  grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);\n  gap: 18px;\n\}/)
  // 手机端一张一行、卡片横过来：小封面在左（固定 88px），信息在右，按钮仍在最下整行
  const mobile = roomsView.slice(roomsView.indexOf('@media (max-width: 600px)'))
  assert.match(mobile, /\.room-grid \{ grid-template-columns: minmax\(0, 1fr\); gap: 12px; \}/)
  assert.match(mobile, /\.room-card \{\n    display: grid;\n    grid-template-columns: auto minmax\(0, 1fr\);\n    grid-template-areas:\n      "head head"\n      "cover body"\n      "foot foot";/)
  assert.match(mobile, /\.card-cover-box \{ grid-area: cover; padding: 0; width: 88px; \}/)
  assert.match(mobile, /\.card-body \{ grid-area: body; padding: 0; \}/)
  assert.match(mobile, /\.card-foot \{ grid-area: foot; padding: 0; \}/)
  // 小封面放不下两个角标：「需密码」在手机端收成一颗小锁
  assert.match(mobile, /\.cover-lock \.lock-text \{ display: none; \}/)
  assert.match(roomsView, /<span class="lock-text">需密码<\/span>/)
  // 房间记录上的 romCoverUrl 拼成 RomCover 认的形状
  assert.match(roomsView, /function coverOf\(room\) \{\n\s*return \{\n\s*id: room\.romId,\n\s*title: room\.romTitle,\n\s*platform: room\.romPlatform,\n\s*coverUrl: room\.romCoverUrl,\n\s*\}\n\}/)
  // 卡片上的状态（在线 / 离线）仍在，主按钮（等待 / 加入 / 围观）自己占一整行
  assert.match(roomsView, /<span class="cover-state" :class="r\.hostOnline === false \? 'off' : 'on'">/)
  assert.match(roomsView, /function actionLabel\(r\) \{/)
  assert.match(roomsView, /<footer class="card-foot">\s*\n\s*<button class="btn btn-sm btn-primary card-action" @click="pickRoom\(r\)">/)
  assert.match(roomsView, /\.card-foot \{ padding: 0 16px 16px; \}\n\.card-action \{ width: 100%; \}/)
})

test('房间名放在卡片顶部一行（居中），点名字复制房间码', () => {
  assert.match(roomsView, /<header class="card-head">\s*\n\s*<RoomNameCopy :code="r\.code" class="card-name">\{\{ r\.name \}\}<\/RoomNameCopy>\s*\n\s*<\/header>/)
  assert.match(roomsView, /import RoomNameCopy from '\.\.\/components\/RoomNameCopy\.vue'/)
  // 居中的一行只有名字；房间码胶囊从卡片上撤掉，改由点名字复制
  assert.match(roomsView, /\.card-head \{\n  display: flex;\n  justify-content: center;\n  padding: 16px 16px 12px;\n  font-size: 15px;\n  color: var\(--text-primary\);\n\}/)
  assert.doesNotMatch(roomsView, /RoomCodeChip/)
  assert.doesNotMatch(roomsView, /<code class="meta-code">/)
  assert.doesNotMatch(roomsView, /\.meta-code \{/)
})

test('卡片本身不再进房：只有等待 / 加入 / 围观那颗按钮能进', () => {
  // 卡片起始标签上不再有点击 / 键盘 / tabindex，鼠标也不再是手型
  const tagStart = roomsView.indexOf('<article')
  const tag = roomsView.slice(tagStart, roomsView.indexOf('>', tagStart) + 1)
  assert.doesNotMatch(tag, /@click/)
  assert.doesNotMatch(tag, /@keydown/)
  assert.doesNotMatch(tag, /tabindex/)
  assert.doesNotMatch(roomsView, /\.room-card \{\n  display: flex;\n  flex-direction: column;[\s\S]{0,200}?cursor: pointer;/)
  // 唯一的入口是那颗整行主按钮
  assert.match(roomsView, /<button class="btn btn-sm btn-primary card-action" @click="pickRoom\(r\)">/)
  assert.match(roomsView, /function pickRoom\(r\) \{/)
})

test('房间名最长 7 个字：接口兜底，两个弹窗的输入框也拦住', () => {
  assert.match(roomsRoute, /const ROOM_NAME_MAX = 7/)
  assert.equal((roomsRoute.match(/z\.string\(\)\.min\(1\)\.max\(ROOM_NAME_MAX\)/g) || []).length, 2)
  assert.doesNotMatch(roomsRoute, /max\(60\)/, '房间名的长度校验不该还是 60')
  // 名称不合法时给人话提示，不再一律回「参数不合法」
  assert.match(roomsRoute, /function nameErrorMessage\(error\) \{\n\s*return error\.issues\?\.some\(\(issue\) => issue\.path\?\.\[0\] === 'name'\)\n\s*\? `房间名称需为 1-\$\{ROOM_NAME_MAX\} 个字`\n\s*: ''\n\}/)
  assert.equal((roomsRoute.match(/nameErrorMessage\(parsed\.error\) \|\| '参数不合法'/g) || []).length, 2)

  const create = project('frontend/src/components/CreateRoomDialog.vue')
  const edit = project('frontend/src/components/EditRoomDialog.vue')
  assert.match(create, /<input v-model\.trim="name" class="input" placeholder="例如: 拳皇 97" maxlength="7" required \/>/)
  assert.match(edit, /<input v-model\.trim="name" class="input" maxlength="7" required \/>/)
  for (const [name, source] of [['CreateRoomDialog', create], ['EditRoomDialog', edit]]) {
    assert.doesNotMatch(source, /maxlength="60"/, `${name} 的房间名输入框还允许 60 个字`)
  }
})

test('「我的房间」按钮排在输入房间码之后，点开是弹窗而不是页面上的长列表', () => {
  assert.match(
    roomsView,
    /<button class="btn" @click="showJoin = true">输入房间码<\/button>\s*\n\s*<button v-if="isAuthed" class="btn" @click="showMyRooms = true">我的房间<\/button>/,
  )
  assert.match(roomsView, /<MyRoomsDialog\n\s+v-if="showMyRooms"\n\s+:rooms="myOpenRooms"\n\s+@close="showMyRooms = false"\n\s+@enter="resume"\n\s+@edit="editRoom = \$event"\n\s+@close-room="closeRoom"\n\s+\/>/)
  assert.match(roomsView, /import MyRoomsDialog from '\.\.\/components\/MyRoomsDialog\.vue'/)
  // 页面上的「我主持的」长列表已经收进弹窗
  assert.doesNotMatch(roomsView, /section-title">我主持的</)
  assert.match(roomsView, /const myOpenRooms = computed\(\(\) => myRooms\.value\.filter\(\(r\) => !r\.closedAt\)\)/)
})

test('我的房间弹窗：尺寸不大、列表滚动、动作齐全', () => {
  assert.match(myRoomsDialog, /<Teleport to="body">/)
  assert.match(myRoomsDialog, /<div class="mask" @click\.self="\$emit\('close'\)">/)
  assert.match(myRoomsDialog, /max-width: 420px;/)
  assert.match(myRoomsDialog, /max-height: 80vh;/)
  assert.match(myRoomsDialog, /\.dialog-body \{[\s\S]*?overflow-y: auto;/)
  // Esc 关、点遮罩关
  assert.match(myRoomsDialog, /function onKeydown\(event\) \{\n\s*if \(event\.key === 'Escape'\) emit\('close'\)/)
  assert.match(myRoomsDialog, /onMounted\(\(\) => window\.addEventListener\('keydown', onKeydown\)\)/)
  // 房间行：上半行是封面 + 名称 / 房间码，动作行占满卡片最下面一整行，动作交给外层处理
  assert.match(myRoomsDialog, /defineEmits\(\['close', 'enter', 'edit', 'close-room'\]\)/)
  assert.match(myRoomsDialog, /<div class="row-top">\s*\n\s*<RomCover :rom="coverOf\(r\)" class="row-cover" \/>/)
  assert.match(myRoomsDialog, /<\/div>\s*\n\s*<\/div>\s*\n\s*<!-- 动作占满卡片最下面一整行（不缩在封面右侧那一列里） -->\s*\n\s*<div class="row-actions"/)
  // 进入是主按钮：占满一行剩下的宽度（编辑 / 关闭保持胶囊宽度）
  assert.match(myRoomsDialog, /<button class="btn btn-sm btn-primary row-enter" @click="\$emit\('enter', r\)">进入<\/button>/)
  assert.match(myRoomsDialog, /<button class="btn btn-sm" @click="\$emit\('edit', r\)">编辑<\/button>/)
  assert.match(myRoomsDialog, /<button class="btn btn-sm btn-danger" @click="\$emit\('close-room', r\)">关闭<\/button>/)
  assert.match(myRoomsDialog, /\.row \{\n  display: flex;\n  flex-direction: column;\n  gap: 12px;/)
  assert.match(myRoomsDialog, /\.row-top \{ display: flex; align-items: flex-start; gap: 12px; \}/)
  assert.match(myRoomsDialog, /\.row-actions \{ display: flex; gap: 6px; \}\n\.row-enter \{ flex: 1; \}/)
  // 行本身不再是进房按钮：起始标签上没有 tabindex / 点击 / 键盘绑定，只有「进入」进房
  const rowTagStart = myRoomsDialog.indexOf('class="row"')
  const rowTag = myRoomsDialog.slice(myRoomsDialog.lastIndexOf('<article', rowTagStart), rowTagStart + 20)
  assert.doesNotMatch(rowTag, /@click/)
  assert.doesNotMatch(rowTag, /@keydown/)
  assert.doesNotMatch(rowTag, /tabindex/)
  assert.match(myRoomsDialog, /<button class="btn btn-sm btn-primary row-enter" @click="\$emit\('enter', r\)">进入<\/button>/)
  // 「我的房间」保留房间名显示与复制房间码的胶囊
  assert.match(myRoomsDialog, /<span class="name">\{\{ r\.name \}\}<\/span>/)
  assert.match(myRoomsDialog, /<RoomCodeChip :code="r\.code" \/>/)
  assert.match(myRoomsDialog, /import RoomCodeChip from '\.\/RoomCodeChip\.vue'/)
  assert.match(myRoomsDialog, /coverUrl: room\.romCoverUrl,/)
  // 没有房间时给一句人话，不是空白弹窗
  assert.match(myRoomsDialog, /v-if="!rooms\.length" class="empty"/)
  assert.match(myRoomsDialog, /还没有未关闭的房间/)
})
