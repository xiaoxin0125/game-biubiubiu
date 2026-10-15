import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

// 游玩次数（热度）这条链路：播放页启动成功 → POST /api/roms/:id/play → roms.play_count
// 与 rom_plays → 首页「最热」排序 / 卡片热度标签 / 「我的信息」页。任何一环断掉，
// 热度就会永远停在 0 或者首页标签点不动，所以这里把两端都钉住。
const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const schema = project('server/db/schema.js')
const routes = project('server/routes/roms.js')
const client = project('frontend/src/api/client.js')
const gallery = project('frontend/src/views/Gallery.vue')
const header = project('frontend/src/components/AppHeader.vue')
const router = project('frontend/src/router/index.js')

test('roms.play_count 与 rom_plays 表都有迁移，服务启动时能建出来', () => {
  assert.match(schema, /playCount: int\('play_count'\)\.notNull\(\)\.default\(0\)/)
  assert.match(schema, /mysqlTable\('rom_plays'/)
  assert.match(schema, /primaryKey\(\{ columns: \[t\.userId, t\.romId\] \}\)/)

  const migration = 'server/db/migrations/0007_rom_plays.sql'
  assert.ok(existsSync(new URL(`../${migration}`, import.meta.url)), '缺少 0007 迁移文件')
  const sql = project(migration)
  assert.match(sql, /ALTER TABLE `roms` ADD COLUMN `play_count` int NOT NULL DEFAULT 0/)
  assert.match(sql, /CREATE TABLE `rom_plays`/)

  // drizzle 只按 _journal.json 里的条目跑迁移，漏登记等于线上没有这张表
  const journal = JSON.parse(project('server/db/migrations/meta/_journal.json'))
  const tags = journal.entries.map((entry) => entry.tag)
  assert.ok(tags.includes('0007_rom_plays'), '_journal 里没有登记 0007 迁移')
  assert.deepEqual(tags, [...tags].sort(), '_journal 必须按顺序追加')
})

test('游客的游玩也算热度，个人记录只给登录用户', () => {
  const play = routes.slice(routes.indexOf("romRoutes.post('/:id/play'"))
  assert.match(play, /\.set\(\{ playCount: sql`\$\{roms\.playCount\} \+ 1` \}\)/)
  assert.match(play, /if \(user\) \{[\s\S]*?db\.insert\(romPlays\)/)
  // 同一个人玩同一盘卡带靠唯一键累加，不能每次插入新行
  assert.match(play, /\.onDuplicateKeyUpdate\(\{[\s\S]*?playCount: sql`\$\{romPlays\.playCount\} \+ 1`/)

  // 没登录时按「游客试玩」开关放行，只认公开 ROM；登录用户仍按自己的权限判断
  assert.match(play, /const guestOk = \(await getSetting\('guestPlayEnabled', '0'\)\) === '1'/)
  assert.match(play, /if \(!rom\.isPublic\) return c\.json\(\{ error: '该 ROM 非公开' \}, 403\)/)
  assert.match(play, /if \(!canAccessRom\(user, rom\)\) \{\n    return c\.json\(\{ error: 'forbidden' \}, 403\)/)

  const mine = routes.slice(routes.indexOf("romRoutes.get('/plays/mine'"))
  assert.match(mine, /requireAuth/)
  assert.match(mine, /desc\(romPlays\.lastPlayedAt\)/)
})

test('接口把热度下发给前端，前端有对应调用', () => {
  assert.match(routes, /playCount: Number\(rom\.playCount \|\| 0\)/)
  assert.match(client, /romPlay: +\(id\) => request\(`\/api\/roms\/\$\{id\}\/play`, \{ method: 'POST' \}\)/)
  assert.match(client, /romPlaysMine: +\(\) => request\('\/api\/roms\/plays\/mine'\)/)
})

test('播放页在模拟器启动成功后记一次游玩，单人房与联机房的房主都算', () => {
  const recorder = project('frontend/src/composables/player/usePlayRecord.js')
  assert.match(recorder, /recorded = false/)
  assert.match(recorder, /await api\.romPlay\(id\)/)
  // 游客也要记账（热度含游客），所以不能按登录状态短路
  assert.doesNotMatch(recorder, /isAuthed/)

  for (const view of ['frontend/src/views/Player.vue', 'frontend/src/views/RoomPlayer.vue']) {
    const source = project(view)
    assert.match(source, /usePlayRecord\(\{ romMeta \}\)/, view)
    // 只有 booted 变 true 才记账：加载失败、点了返回都不算游玩
    assert.match(source, /watch\(booted, \(value\) => \{ if \(value\) recordPlay\(\) \}\)/, view)
  }
})

test('首页分类栏是「默认 / 最新 / 最热 / 随机 / 收藏」加游戏机下拉框，默认全部', () => {
  // 打开页面默认就是「默认」（按名称），它在分类栏最前面
  assert.match(gallery, /const activeTab = ref\('name'\)/)
  assert.match(gallery, /<div class="blog-tabs">\n\s*<button[\s\S]{0,160}默认 <span class="n">/)
  assert.match(gallery, />\s*默认 <span class="n">/)
  assert.match(gallery, />\s*最新 <span class="n">/)
  assert.match(gallery, />\s*最热 <span class="n">/)
  assert.match(gallery, />\s*随机 <span class="n">/)
  assert.doesNotMatch(gallery, /v-for="\[key, group\] in Object\.entries\(tabGroups\)"/, '主机分类不再平铺成标签')

  // 下拉框用站点统一的 ClaySelect，选项是「全部 + 各游戏机」，标签是平台表里的
  // 中文 + 英文名（别名已并成一台机器），后面跟这台机器的数量
  assert.match(gallery, /<ClaySelect[\s\S]*?v-model="activeGroup"/)
  assert.match(gallery, /import ClaySelect from '\.\.\/components\/ClaySelect\.vue'/)
  assert.match(gallery, /label: `全部 \$\{roms\.value\.length\}`/)
  assert.match(gallery, /platformFacets\(roms\.value, \{ include: activeGroupIsAll\.value \? \[\] : \[activeGroup\.value\] \}\)/)
  assert.match(gallery, /label: `\$\{machine\.label\} \$\{machine\.count\}`/)
  assert.doesNotMatch(gallery, /tabGroups/, '主机分类不再按厂商分组，而是一台游戏机一项')
  // 分类比较走通用名：老记录里写着别名的也算进对应的游戏机
  assert.match(gallery, /function inGroup\(rom, key\) \{\n\s*if \(!key \|\| key === 'all'\) return true\n\s*return resolvePlatformId\(rom\.platform\) === key/)
  assert.match(gallery, /if \(!activeGroupIsAll\.value\) list = list\.filter\(\(r\) => inGroup\(r, activeGroup\.value\)\)/)

  // 默认按名字排（中文拼音、数字自然序，与「我的 ROM」同一套比较规则）；
  // 最热按游玩次数倒序；最新直接用接口的顺序（上传 / 收藏时间倒序）；随机按种子洗牌
  assert.match(gallery, /if \(activeTab\.value === 'name'\) out\.sort\(\(a, b\) => a\.title\.localeCompare\(b\.title, 'zh-Hans-CN', \{ numeric: true, sensitivity: 'base' \}\)\)/)
  assert.match(gallery, /if \(activeTab\.value === 'hot'\) out\.sort\(\(a, b\) => Number\(b\.playCount \|\| 0\) - Number\(a\.playCount \|\| 0\)\)/)
  assert.match(gallery, /if \(activeTab\.value === 'random'\) return shuffled\(out, shuffleSeed\.value\)/)
  // 退出登录 / 取消最后一盘收藏时回到默认，不再回到「最新」
  assert.equal((gallery.match(/activeTab\.value = 'name'/g) || []).length, 3)
  assert.doesNotMatch(gallery, /activeTab\.value = 'latest'/)
  // 再点一次「随机」换种子重新洗牌，并回到第一页
  assert.match(gallery, /if \(tab === 'random' && activeTab\.value === 'random'\) shuffleSeed\.value \+= 1/)
  assert.match(gallery, /watch\(shuffleSeed, \(\) => \{ page\.value = 1 \}\)/)
  // 洗牌用种子迭代出的随机数（不是直接调 Math.random），翻页 / 搜索时顺序才稳定
  assert.doesNotMatch(gallery, /Math\.random\(/)
  assert.match(gallery, /function shuffled\(list, seed\) \{/)
  assert.match(gallery, /for \(let i = out\.length - 1; i > 0; i -= 1\) \{/)

  // 手机端三个标签不显示数量（数量在下拉框的选项里还有），下拉框自己占一整行
  assert.match(gallery, /\.blog-tabs \.tab \.n \{ display: none; \}/)
  const mobileBlock = gallery.slice(gallery.indexOf('@media (max-width: 768px)'))
  assert.match(mobileBlock, /\.blog-tabs \.tab \.n \{ display: none; \}/)
  assert.match(mobileBlock, /\.group-select \{ flex: 1 0 100%; --select-width: 100%; margin-left: 0; \}/)
  // PC 端仍贴着分类栏右端（只有手机端整行）
  assert.match(gallery, /--select-shadow: var\(--clay-in-sm\);\n\s*margin-left: auto;\n\s*flex: 0 0 auto;/)
})

test('卡片末端的热度是图标 + 次数，标签排在内容流里', () => {
  assert.match(gallery, /class="heat-badge"/)
  // 热度单独摆在卡片末端：火焰图标在上、次数在下，做成一块竖直的计量块
  assert.match(gallery, /<span class="heat-badge" :title="`被游玩 \$\{rom\.playCount\} 次`">\n\s*<svg[\s\S]*?\{\{ rom\.playCount \}\}/)
  assert.doesNotMatch(gallery, /热度 \{\{ rom\.playCount \}\}/)
  // 它在内容流里、排在文字之后，也就是卡片右端（不再和平台 / 版本挤在同一行标签里）
  const badgeRow = gallery.slice(gallery.indexOf('<div class="card-badges">'), gallery.indexOf('class="heat-badge"'))
  assert.doesNotMatch(badgeRow, /heat-badge/)
  assert.match(gallery, /<span class="heat-badge"[\s\S]*?<\/span>\n\s*<\/article>/)
  // 0 次也照常显示
  const heatStart = gallery.indexOf('<span class="heat-badge"')
  const heatSpan = gallery.slice(heatStart, gallery.indexOf('</article>', heatStart))
  assert.ok(heatSpan.length > 0 && heatSpan.length < 800, '没能定位到热度块')
  assert.doesNotMatch(heatSpan, /v-if=/)
  // 热度是固定的梅子墨色，不跟平台色走，才不会和状态标签撞色
  assert.match(gallery, /\.heat-badge \{[\s\S]*?background: var\(--clay-inset-surface\);[\s\S]*?color: var\(--clay-ink\);/)
  assert.match(gallery, /\.heat-badge \{[\s\S]*?flex-direction: column;/)
  // 标签行跟着标题走，不再绝对定位到卡片右上角
  assert.match(gallery, /\.card-badges \{\n  display: flex;/)
  assert.doesNotMatch(gallery, /\.card-badges \{[\s\S]{0,80}position: absolute/)
  assert.match(gallery, /\.fav-btn \{[\s\S]*?position: absolute;[\s\S]*?top: -3px;[\s\S]*?right: -3px;/)
  // 收藏按钮得在封面的定位容器里，否则又是相对整张卡片定位
  assert.match(gallery, /<div class="rom-card-cover-wrap">[\s\S]*?<RomCover[\s\S]*?class="fav-btn"/)
  assert.match(gallery, /\.rom-card-cover-wrap \{\n  position: relative;/)
})

test('导航有「我的」，页面记录最近游玩、平台分布与收藏', () => {
  assert.match(header, /to="\/me" class="nav-item" active-class="active">我的<\/router-link>/)
  assert.match(router, /path: '\/me',[\s\S]*?component: \(\) => import\('\.\.\/views\/MyInfo\.vue'\),[\s\S]*?meta: \{ requiresAuth: true \}/)

  const myInfo = project('frontend/src/views/MyInfo.vue')
  assert.match(myInfo, /api\.romPlaysMine\(\)/)
  assert.match(myInfo, /api\.romsFavorites\(\)/)
  // 分布按游戏机累加个人游玩次数（区域别名算进通用名，同一台机器只占一行），次数多的排前面
  assert.match(myInfo, /const id = resolvePlatformId\(platform\)\n\s*counts\.set\(id, \(counts\.get\(id\) \|\| 0\) \+ Number\(item\.playCount \|\| 0\)\)/)
  assert.doesNotMatch(myInfo, /counts\.set\(platform,/)
  assert.match(myInfo, /\.sort\(\(a, b\) => b\.count - a\.count/)

  // 最近游玩 5 条、平台分布 5 条，两块并排一行且等高（少的那块在框内下方留白）
  assert.match(myInfo, /const RECENT_PLAY_LIMIT = 5/)
  assert.match(myInfo, /const PLATFORM_LIMIT = 5/)
  assert.match(myInfo, /const recentPlays = computed\(\(\) => plays\.value\.slice\(0, RECENT_PLAY_LIMIT\)\)/)
  assert.match(myInfo, /const topPlatforms = computed\(\(\) => distribution\.value\.slice\(0, PLATFORM_LIMIT\)\)/)
  assert.match(myInfo, /<div class="split-row">[\s\S]*?最近游玩[\s\S]*?平台分布/)
  assert.match(myInfo, /\.split-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[\s\S]*?align-items: stretch;/)
})
