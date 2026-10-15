import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import {
  PLATFORM_ROM_REGISTRY,
  PLATFORM_AUTO_DETECT_BY_EXTENSION,
  autoDetectPlatform,
  normalizePlatformId,
} from '../shared/registry/platform-roms.js'
import {
  BIOS_BY_PLATFORM,
  BIOS_PLATFORM_LABELS,
  biosMountPathFor,
} from '../shared/registry/platform-bios.js'
import { PLATFORM_DEFAULT_MAX_PLAYERS } from '../shared/registry/platform-players.js'
import { platforms, platformOrder, platformFacets, getPlatform, pcButtonsForPlatform } from '../frontend/src/constants/platforms.js'
import { coreDisplayName } from '../frontend/src/constants/cores.js'
import { buildPlatformCoreOptions, getBiosUrls } from '../frontend/src/data/config.js'
import { defaultRetroarchConfigForCore } from '../frontend/src/composables/nostalgist.js'

// v1.6.0 加回来的七个平台（PC Engine / PCE-CD / Neo Geo CD / NGP / 3DO / Super 32X / J2ME）
// 靠的核心与 BIOS 都不是项目里原有的东西，所以这组测试盯的是「表」和「盘上的文件」
// 对不对得上：
//   - 共享表（平台 → 扩展名 / 核心）与前端表逐项一致，前端表不会被写歪；
//   - 每个平台用到的核心都真的在 data/cores 里、也都有给玩家看的中文名；
//   - 需要 BIOS 的平台的每个文件都真的躺在 data/bios/<平台>/ 下，且挂载路径与核心
//     要求的系统目录一致（NeoCD 要的是 system/neocd/ 子目录）；
//   - 上传页的扩展名自动识别只认专属扩展名，光盘镜像与 .bin 一律不猜。
const repoFile = (path) => new URL(`../${path}`, import.meta.url)
const readRepo = (path) => readFileSync(repoFile(path), 'utf8')

const gamepadSource = readRepo('frontend/src/components/emulator-portal/VirtualGamepad.vue')
const NEW_PLATFORMS = ['pcengine', 'pcecd', 'neogeocd', 'ngp', '3do', 'sega32x', 'j2me']

test('共享表与前端表逐项一致：扩展名、核心、默认人数、按键', () => {
  for (const [id, entry] of Object.entries(PLATFORM_ROM_REGISTRY)) {
    const p = platforms[id]
    assert.ok(p, `前端表缺少平台 ${id}`)
    assert.deepEqual([...p.fileExtensions], [...entry.fileExtensions], `${id} 的扩展名两边不一致`)
    assert.deepEqual([...p.cores], [...entry.cores], `${id} 的核心两边不一致`)
    assert.ok(p.displayName?.trim(), `${id} 缺少显示名`)
    assert.ok(p.shortLabel?.trim(), `${id} 缺少短标签`)
    assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), `${id} 的颜色不合法：${p.color}`)
    assert.equal(p.maxPlayers, PLATFORM_DEFAULT_MAX_PLAYERS[id] || 1, `${id} 的默认人数不一致`)
    assert.ok(Array.isArray(p.buttons) && p.buttons.length >= 4, `${id} 的按键表不合法`)
  }
})

test('每个平台用到的核心都在 data/cores 里，并且有给玩家看的中文名', () => {
  for (const [id, entry] of Object.entries(PLATFORM_ROM_REGISTRY)) {
    for (const core of entry.cores) {
      assert.ok(coreDisplayName[core], `${id} 的核心 ${core} 没有显示名（加载进度里会显示裸 id）`)
      if (core === 'j2mejs') {
        assert.ok(existsSync(repoFile('frontend/public/j2me/main.html')))
        assert.ok(existsSync(repoFile('frontend/public/j2me/LICENSE')))
        continue
      }
      for (const ext of ['js', 'wasm']) {
        assert.ok(existsSync(repoFile(`data/cores/${core}.${ext}`)), `${id} 的核心 ${core}.${ext} 不在 data/cores 里`)
      }
    }
  }
})

test('需要 BIOS 的平台：文件都在 data/bios 下，挂载路径与核心要求一致', () => {
  for (const [platform, files] of Object.entries(BIOS_BY_PLATFORM)) {
    assert.ok(BIOS_PLATFORM_LABELS[platform], `${platform} 的 BIOS 分组缺少中文标签`)
    for (const fileName of files) {
      // 后端 /api/bios/:platform/:file 只接受文件名，子目录由挂载表补，所以文件名里
      // 不能出现斜杠 —— 出现了这条接口就取不到文件。
      assert.ok(!fileName.includes('/'), `${platform} 的 ${fileName} 带了子目录，接口取不到`)
      assert.ok(existsSync(repoFile(`data/bios/${platform}/${fileName}`)), `缺少 data/bios/${platform}/${fileName}`)
    }
  }

  // 挂载落点：NeoCD 核心找的是 system/neocd/，其余平台就是文件名本身。
  assert.equal(biosMountPathFor('neogeocd', 'neocd_f.rom'), 'neocd/neocd_f.rom')
  assert.equal(biosMountPathFor('neogeocd', 'ng-lo.rom'), 'neocd/ng-lo.rom')
  assert.equal(biosMountPathFor('pcecd', 'syscard3.pce'), 'syscard3.pce')
  assert.deepEqual(getBiosUrls('j2me'), [], 'J2meJS 自带类库，不需要 BIOS')

  // getBiosUrls：fileName 是挂载落点，下载地址始终是平台目录下的文件名。
  const neocd = getBiosUrls('neogeocd')
  assert.deepEqual(neocd, [
    { fileName: 'neocd/neocd_f.rom', fileContent: '/api/bios/neogeocd/neocd_f.rom' },
    { fileName: 'neocd/ng-lo.rom', fileContent: '/api/bios/neogeocd/ng-lo.rom' },
  ])
  assert.deepEqual(getBiosUrls('pcengine'), [], '卡带机不该挂 BIOS')
})

test('新增平台的扩展名与默认人数按规格：光盘机 2P、掌机 1P、32X 2P', () => {
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.pcengine.fileExtensions], ['.pce', '.zip'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.pcecd.fileExtensions], ['.chd', '.cue', '.ccd', '.toc', '.m3u'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.neogeocd.fileExtensions], ['.chd', '.cue'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.ngp.fileExtensions], ['.ngp', '.ngc', '.ngpc', '.npc', '.zip'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY['3do'].fileExtensions], ['.chd', '.cue', '.iso', '.bin'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.sega32x.fileExtensions], ['.32x', '.bin', '.gen', '.md', '.zip'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.j2me.fileExtensions], ['.jar'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.j2me.cores], ['j2mejs'])
  assert.equal(autoDetectPlatform('descriptor.jad'), '')

  // PCE 卡带与光盘共用一颗核心；32X 只能用 picodrive（genesis_plus_gx 不支持）。
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.pcecd.cores], ['mednafen_pce_fast'])
  assert.deepEqual([...PLATFORM_ROM_REGISTRY.sega32x.cores], ['picodrive'])
  // Beetle NeoPop 只认一个手柄口，J2ME 模拟的是一部手机，两者都只能是单人。
  assert.equal(getPlatform('ngp').maxPlayers, 1)
  assert.equal(getPlatform('j2me').maxPlayers, 1)
  assert.equal(getPlatform('neogeocd').maxPlayers, 2)
})

test('上传页的扩展名自动识别：只认专属扩展名，光盘镜像与 .bin 不猜', () => {
  assert.equal(autoDetectPlatform('Bomberman 94 (Japan).pce'), 'pcengine')
  assert.equal(autoDetectPlatform('Virtua Racing Deluxe (USA).32x'), 'sega32x')
  assert.equal(autoDetectPlatform('Last Blade, The.ngc'), 'ngp')
  assert.equal(autoDetectPlatform('仙剑奇侠传.jar'), 'j2me')
  assert.equal(autoDetectPlatform('game.nes'), 'nes')
  assert.equal(autoDetectPlatform('Mario.smc'), 'sfc')
  assert.equal(autoDetectPlatform('Sonic.md'), 'megadrive')
  assert.equal(autoDetectPlatform('roms.zip'), 'arcade')

  // 多台机器共用同一个扩展名：猜错会挂到别的核心上、也拿不到对应的 BIOS。
  for (const name of ['disc.chd', 'disc.cue', 'disc.iso', 'rom.bin', 'disc.m3u']) {
    assert.equal(autoDetectPlatform(name), '', `${name} 不该自动识别出平台`)
  }
  assert.equal(autoDetectPlatform('noextension'), '')
  assert.equal(autoDetectPlatform(''), '')
  assert.equal(autoDetectPlatform('weird.xyz'), '')

  // 表里的平台 id 必须真实存在，否则自动识别会填一个前端不认识的平台。
  for (const [ext, platform] of Object.entries(PLATFORM_AUTO_DETECT_BY_EXTENSION)) {
    assert.ok(PLATFORM_ROM_REGISTRY[platform], `扩展名 ${ext} 指向了不存在的平台 ${platform}`)
    assert.ok(
      PLATFORM_ROM_REGISTRY[platform].fileExtensions.includes(`.${ext}`),
      `${platform} 并不接受 .${ext}`,
    )
  }
})

test('光盘与虚拟机的核心一律关掉 run-ahead', () => {
  for (const core of ['mednafen_pce_fast', 'mednafen_ngp', 'opera', 'neocd', 'squirreljme']) {
    const config = defaultRetroarchConfigForCore(core)
    assert.equal(config.run_ahead_enabled, false, `${core} 应该关掉 run-ahead`)
    assert.equal(config.run_ahead_frames, 0)
    assert.match(gamepadSource.length ? readRepo('frontend/src/composables/nostalgist.js') : '', new RegExp(`'${core}'`))
  }
  // 轻量核心维持原样，别把整站都拖慢。
  assert.equal(defaultRetroarchConfigForCore('snes9x').run_ahead_enabled, true)
})

test('平台级 core options：3DO 点名日版 BIOS 与字库，32X 钉死六键手柄', () => {
  assert.deepEqual(buildPlatformCoreOptions({ platform: '3do', core: 'opera' }), {
    opera_bios: 'panafz1j.bin',
    opera_font: 'panafz1j-kanji.bin',
  })
  assert.deepEqual(buildPlatformCoreOptions({ platform: 'sega32x', core: 'picodrive' }), {
    picodrive_input1: '6 button pad',
    picodrive_input2: '6 button pad',
  })
  // 名字里带数字的平台 id 也只有这一套选项，别串到别的核心上。
  assert.deepEqual(buildPlatformCoreOptions({ platform: 'sega32x', core: 'genesis_plus_gx' }), {})
  assert.deepEqual(buildPlatformCoreOptions({ platform: 'opera', core: 'opera' }), {})
})

test('新平台的按键标签与核心的实际映射对得上', () => {
  // PC Engine：b→II、a→I、y→III、x→IV、l→V、r→VI，l2 是六键手柄的切换键。
  const pce = getPlatform('pcengine').buttonLabels
  assert.deepEqual(pce, { a: 'I', b: 'II', y: 'III', x: 'IV', l: 'V', r: 'VI', l2: '模式', select: 'SELECT', start: 'RUN' })
  assert.deepEqual(getPlatform('pcecd').buttonLabels, pce)

  // Neo Geo CD：与街机同一套反向对应。
  const neocd = getPlatform('neogeocd').buttonLabels
  assert.deepEqual({ a: neocd.a, b: neocd.b, x: neocd.x, y: neocd.y }, { a: 'B', b: 'A', x: 'D', y: 'C' })

  // 3DO：三颗面键 A / B / C，X（停止）与 P（播放暂停）当系统键。
  const threeDo = getPlatform('3do').buttonLabels
  assert.deepEqual({ y: threeDo.y, b: threeDo.b, a: threeDo.a }, { y: 'A', b: 'B', a: 'C' })
  assert.equal(threeDo.start, 'P')
  assert.equal(threeDo.select, 'X')

  // NGP：A / B + Option。
  assert.deepEqual(getPlatform('ngp').buttonLabels, { a: 'B', b: 'A', start: 'Option' })

  // J2ME：SquirrelJME 的 Dial Pad 手柄类型把 retropad 当手机键盘，标签就是手机上的键。
  assert.deepEqual(getPlatform('j2me').buttonLabels, {
    a: '3', b: '9', x: '1', y: '7', l: '＊', r: '＃', l2: '5 确定', r2: '0', select: '软键1', start: '软键2',
  })
  // 32X 与 Mega Drive 是同一只六键手柄。
  assert.deepEqual(getPlatform('sega32x').buttonLabels, getPlatform('megadrive').buttonLabels)
})

test('虚拟手柄：新平台的布局摆得出自己的按键，且不会摆出不存在的键', () => {
  const layouts = gamepadSource.slice(gamepadSource.indexOf('const FACE_LAYOUTS'), gamepadSource.indexOf('const layoutType'))
  // pickLayout 的分支：光盘机与街机共用四键、卡带机走各自的布局。平台 id 先由
  // resolvePlatformId 收敛到通用名，所以分支里只剩一台机器一个 id。
  assert.match(gamepadSource, /const id = resolvePlatformId\(platform\)/)
  assert.match(gamepadSource, /id === 'arcade' \|\| id === 'neogeocd'\) return 'arcade'/)
  assert.match(gamepadSource, /id === 'pcengine' \|\| id === 'pcecd'\) return 'pce'/)
  assert.match(gamepadSource, /id === '3do'\) return '3do'/)
  assert.match(gamepadSource, /id === 'j2me'\) return 'j2me'/)
  assert.match(gamepadSource, /id === 'sega32x'\) return 'md'/)
  // ngp 没有自己的布局行：它落到默认的两键布局（fc）上。
  assert.match(gamepadSource, /return 'fc'  \/\/ nes, fds, gb, gbc, ngp, and everything else/)

  // 每个新平台的面键必须真的在 FACE_LAYOUTS 里被摆出来 —— a/b/x/y 少摆一颗，
  // 手机端就按不出那颗键（PC 键盘与物理手柄不受影响）。
  const faceLayoutOf = (layout) => {
    const m = layouts.match(new RegExp(`['"]?${layout}['"]?:\\s*\\{ keys: \\[([^\\]]*)\\]`))
    assert.ok(m, `FACE_LAYOUTS 里缺少 ${layout} 布局`)
    return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
  }
  for (const [platform, layout] of [
    ['pcengine', 'pce'],
    ['pcecd', 'pce'],
    ['3do', '3do'],
    ['j2me', 'j2me'],
    ['neogeocd', 'arcade'],
    ['sega32x', 'md'],
    ['ngp', 'fc'],
  ]) {
    const shown = new Set(faceLayoutOf(layout))
    const available = getPlatform(platform).buttons.filter((b) => ['a', 'b', 'x', 'y'].includes(b))
    for (const btn of available) {
      assert.ok(shown.has(btn), `${platform} 的 ${btn} 没有摆进 ${layout} 布局`)
    }
  }
  // PC Engine 的 V / VI 与「模式」要摆在肩键那一行，否则六键模式按不出来。
  assert.match(gamepadSource, /t === 'pce' \|\| t === '3do' \|\| t === 'j2me'/)
})

test('游戏机分类：每台机器一项、通用名唯一，空分类不出现', () => {
  // 平台表里再没有别名条目，一台机器只有一个 id。
  for (const alias of ['famicom', 'snes', 'genesis']) {
    assert.equal(platforms[alias], undefined, `平台表里不该再有别名 ${alias}`)
    assert.equal(PLATFORM_ROM_REGISTRY[alias], undefined, `共享表里不该再有别名 ${alias}`)
  }
  assert.equal(normalizePlatformId('famicom'), 'nes')
  assert.equal(normalizePlatformId('snes'), 'sfc')
  assert.equal(normalizePlatformId('genesis'), 'megadrive')
  assert.equal(normalizePlatformId('nes'), 'nes')
  assert.equal(normalizePlatformId(''), '')
  // 通用名就是玩家嘴里的名字：FC / SFC / MD。
  assert.equal(getPlatform('nes').shortLabel, 'FC')
  assert.equal(getPlatform('sfc').shortLabel, 'SFC')
  assert.equal(getPlatform('megadrive').shortLabel, 'MD')
  // 别名读旧数据时照样落到同一台机器上（摆放布局、按键标签都不掉默认值）。
  assert.equal(getPlatform('famicom'), getPlatform('nes'))
  assert.equal(getPlatform('snes'), getPlatform('sfc'))
  assert.equal(getPlatform('genesis'), getPlatform('megadrive'))

  // 分类聚合：别名与通用名合成一项，没有游戏的机器不出现在下拉框里。
  const facets = platformFacets([
    { platform: 'nes' }, { platform: 'famicom' },
    { platform: 'sfc' }, { platform: 'snes' },
    { platform: 'megadrive' },
  ])
  assert.deepEqual(facets.map((f) => [f.id, f.count]), [['nes', 2], ['sfc', 2], ['megadrive', 1]])
  // 标签一律「中文 (英文)」，筛选里两台看起来像但其实是同一台机器的名字不会再各占一项。
  for (const facet of facets) {
    assert.match(facet.label, /^[^()]+ \([^)]+\)$/, `${facet.id} 的名字不是中文 + 英文：${facet.label}`)
  }
  assert.equal(facets[0].label, '任天堂红白机 (FC / NES)')
  // 平台表里每一台机器都能被聚合成一项（顺序与平台表一致，家族挨在一起）。
  const all = platformFacets(Object.keys(platforms).map((platform) => ({ platform })))
  assert.deepEqual(all.map((f) => f.id), platformOrder)
  assert.deepEqual([...all.map((f) => f.id)].sort(), [...Object.keys(PLATFORM_ROM_REGISTRY)].sort())
  // 当前选中的那台即使一盘都没有也要留在选项里，触发器上不会空掉。
  assert.deepEqual(platformFacets([], { include: ['psx'] }).map((f) => [f.id, f.count]), [['psx', 0]])
  assert.deepEqual(platformFacets([], { include: ['nes'] }), [{ id: 'nes', label: '任天堂红白机 (FC / NES)', shortLabel: 'FC', color: platforms.nes.color, count: 0 }])
})

test('新平台的按键表按核心接口给：J2ME 才有 l2，NGP 没有 select', () => {
  const j2me = pcButtonsForPlatform('j2me')
  for (const key of ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'l2', 'r2', 'start', 'select']) {
    assert.ok(j2me.includes(key), `J2ME 缺少 ${key}`)
  }
  const ngp = pcButtonsForPlatform('ngp')
  assert.deepEqual([...ngp], ['up', 'down', 'left', 'right', 'a', 'b', 'start'])
  // 3DO 用不到 x（它把 X 停止放在 select 上），多摆一颗会让人以为按不出东西。
  assert.ok(!pcButtonsForPlatform('3do').includes('x'))
})
