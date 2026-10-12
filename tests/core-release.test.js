import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { test } from 'node:test'

import {
  CORES_BASE_DISABLED,
  effectiveCoresBaseUrl,
  loadCoreRelease,
  normalizeCoresBaseUrl,
  normalizeCoresRemoteEnabled,
  publicCoresBaseUrl,
  readCurrentRelease,
  readReleaseManifest,
  resolveCoreArtifact,
} from '../server/cores-release.js'

const BUILD_SCRIPT = new URL('../deploy/build-cores.mjs', import.meta.url).pathname

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// 一组小样本核心：真的用 data/cores（100MB）跑构建太慢，这里只验证规则。
function makeSourceDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cores-src-'))
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents)
  }
  return dir
}

function build(src, out, extraArgs = []) {
  return execFileSync(process.execPath, [BUILD_SCRIPT, '--src', src, '--out', out, ...extraArgs], {
    encoding: 'utf8',
  })
}

test('构建发布目录：版本号由内容决定，压缩副本可还原', () => {
  const src = makeSourceDir({
    'fbneo.js': 'console.log("fbneo")',
    'fbneo.wasm': Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    'snes9x.wasm': Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x02]),
  })
  const out = mkdtempSync(join(tmpdir(), 'cores-dist-'))
  try {
    build(src, out)

    const current = readCurrentRelease(out)
    assert.match(current.release, /^[a-f0-9]{12}$/)

    const manifest = readReleaseManifest(current.release, out)
    assert.equal(manifest.release, current.release)
    assert.deepEqual(Object.keys(manifest.files).sort(), ['fbneo.js', 'fbneo.wasm', 'snes9x.wasm'])
    // 清单里的体积与摘要必须与源文件一致，前端就是靠它校验下载结果
    const wasm = readFileSync(join(src, 'fbneo.wasm'))
    assert.equal(manifest.files['fbneo.wasm'].size, wasm.length)
    assert.equal(manifest.files['fbneo.wasm'].sha256, sha256(wasm))
    // 预压缩副本必须能还原成原文件，且体积被记进清单
    const gz = readFileSync(join(out, current.release, 'fbneo.wasm.gz'))
    assert.deepEqual(gunzipSync(gz), wasm)
    assert.equal(manifest.files['fbneo.wasm'].gzipSize, gz.length)

    // 同样的内容重复构建：版本号不变（可以放心重跑，不会堆一堆目录）
    build(src, out)
    assert.equal(readCurrentRelease(out).release, current.release)

    // 任何一个字节变化：版本号必须变化（否则浏览器会拿到旧缓存）
    writeFileSync(join(src, 'fbneo.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x03]))
    build(src, out)
    const next = readCurrentRelease(out)
    assert.notEqual(next.release, current.release)
    assert.equal(existsSync(join(out, current.release)), true, '旧版本目录要保留，便于回滚')
  } finally {
    rmSync(src, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})

test('loadCoreRelease 在没有构建产物时返回空清单（本地开发不阻塞）', () => {
  const empty = mkdtempSync(join(tmpdir(), 'cores-empty-'))
  try {
    const release = loadCoreRelease(empty)
    assert.equal(release.release, null)
    assert.deepEqual(release.files, {})
    assert.equal(readCurrentRelease(empty), null)
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test('版本化取文件：优先构建产物，其次按清单体积校验本机文件', () => {
  const src = makeSourceDir({ 'fbneo.wasm': 'wasm-bytes' })
  const out = mkdtempSync(join(tmpdir(), 'cores-dist-'))
  const coresDir = mkdtempSync(join(tmpdir(), 'cores-raw-'))
  try {
    build(src, out)
    const release = readCurrentRelease(out).release

    const built = resolveCoreArtifact({ release, name: 'fbneo.wasm', distDir: out, coresDir })
    assert.equal(built.path, join(out, release, 'fbneo.wasm'))
    assert.equal(built.built, true)

    // 发布目录里被清理掉个别文件（或者远端才是权威副本）时：用 data/cores 顶，
    // 但必须与清单体积一致——否则宁可不发，也不给一份内容不符的核心。
    rmSync(join(out, release, 'fbneo.wasm'))
    writeFileSync(join(coresDir, 'fbneo.wasm'), 'wasm-bytes')
    const fallback = resolveCoreArtifact({ release, name: 'fbneo.wasm', distDir: out, coresDir })
    assert.equal(fallback.path, join(coresDir, 'fbneo.wasm'))
    assert.equal(fallback.built, false)

    writeFileSync(join(coresDir, 'fbneo.wasm'), 'wasm-bytes-CHANGED')
    assert.equal(resolveCoreArtifact({ release, name: 'fbneo.wasm', distDir: out, coresDir }), null)
    // 版本号对不上也不是同一批内容
    assert.equal(resolveCoreArtifact({ release: 'ffffffffffff', name: 'fbneo.wasm', distDir: out, coresDir }), null)
    // 没有清单就无从校验，也不发
    const noManifest = mkdtempSync(join(tmpdir(), 'cores-dist-nom-'))
    try {
      writeFileSync(join(coresDir, 'fbneo.wasm'), 'wasm-bytes')
      assert.equal(
        resolveCoreArtifact({ release, name: 'fbneo.wasm', distDir: noManifest, coresDir, currentRelease: release }),
        null,
      )
    } finally {
      rmSync(noManifest, { recursive: true, force: true })
    }

    // 路径穿越与非法输入
    assert.equal(resolveCoreArtifact({ release, name: '../secret', distDir: out, coresDir }), null)
    assert.equal(resolveCoreArtifact({ release: '../../etc', name: 'fbneo.wasm', distDir: out, coresDir }), null)
    assert.equal(resolveCoreArtifact({ release, name: 'fbneo.zip', distDir: out, coresDir }), null)
  } finally {
    rmSync(src, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
    rmSync(coresDir, { recursive: true, force: true })
  }
})

test('远端核心地址：必须 https，none 表示强制用本机', () => {
  assert.equal(normalizeCoresBaseUrl(''), '')
  assert.equal(normalizeCoresBaseUrl('   '), '')
  assert.equal(normalizeCoresBaseUrl('none'), CORES_BASE_DISABLED)
  assert.equal(normalizeCoresBaseUrl('OFF'), CORES_BASE_DISABLED)
  assert.equal(normalizeCoresBaseUrl('https://cores.example.com/releases///'), 'https://cores.example.com/releases')
  assert.equal(normalizeCoresBaseUrl('http://127.0.0.1:8080', { allowInsecure: true }), 'http://127.0.0.1:8080')

  // https 页面不能跨域加载 http 资源，所以生产环境直接拒绝
  assert.throws(() => normalizeCoresBaseUrl('http://cores.example.com'), /https/)
  assert.throws(() => normalizeCoresBaseUrl('ftp://cores.example.com'), /http/)
  assert.throws(() => normalizeCoresBaseUrl('cores.example.com'), /https/)
  assert.throws(() => normalizeCoresBaseUrl('https://cores.example.com/?a=1'), /查询参数/)
})

test('下发给前端的地址里不能出现哨兵值', () => {
  // 'none' 只是后台/环境变量里的开关语义；直接发给前端会让它拼出
  // `none/<版本>/<文件>` 这种地址，所以必须映射成空字符串。
  assert.equal(publicCoresBaseUrl(normalizeCoresBaseUrl('none')), '')
  assert.equal(publicCoresBaseUrl(normalizeCoresBaseUrl('')), '')
  assert.equal(publicCoresBaseUrl(null), '')
  assert.equal(
    publicCoresBaseUrl(normalizeCoresBaseUrl('https://cores.example.com/releases/')),
    'https://cores.example.com/releases',
  )
})

test('清单接口不暴露版本目录之外的任何东西', () => {
  const src = makeSourceDir({ 'nestopia.wasm': 'bytes' })
  const out = mkdtempSync(join(tmpdir(), 'cores-dist-'))
  try {
    build(src, out, ['--no-gzip'])
    const release = loadCoreRelease(out)
    assert.equal(typeof release.release, 'string')
    assert.deepEqual(Object.keys(release.files), ['nestopia.wasm'])
    assert.equal(release.files['nestopia.wasm'].gzipSize, null, '没开压缩时不该编造压缩体积')
    mkdirSync(join(out, release.release), { recursive: true })
  } finally {
    rmSync(src, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})

test('远端核心开关：只有 1/0（含 boolean 与常见写法），空值表示未设置', () => {
  assert.equal(normalizeCoresRemoteEnabled('1'), '1')
  assert.equal(normalizeCoresRemoteEnabled(1), '1')
  assert.equal(normalizeCoresRemoteEnabled(true), '1')
  assert.equal(normalizeCoresRemoteEnabled('ON'), '1')
  assert.equal(normalizeCoresRemoteEnabled('0'), '0')
  assert.equal(normalizeCoresRemoteEnabled(false), '0')
  assert.equal(normalizeCoresRemoteEnabled('off'), '0')
  assert.equal(normalizeCoresRemoteEnabled(''), '')
  assert.equal(normalizeCoresRemoteEnabled(undefined), '')
  assert.throws(() => normalizeCoresRemoteEnabled('maybe'), /只能是 1 或 0/)
})

test('地址与开关分开存：关着开关也能保存地址，关掉就忽略环境变量', () => {
  const base = 'https://cores.example.com/releases'
  const env = 'https://env.example.com/cores'

  // 开关关着：地址仍留在设置里（下次开启不用重填），但生效值是本机
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: base, savedEnabled: '0' }), '')
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: base, savedEnabled: '0', fromEnv: env }), '',
    '关掉远端不能再被环境变量里的旧值打开')

  // 开关开着：用保存的地址
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: base, savedEnabled: '1' }), base)
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: base, savedEnabled: '1', fromEnv: env }), base)

  // 老数据（没有开关字段）：有地址即开启，none 即关闭，都没有才看环境变量
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: base, savedEnabled: '' }), base)
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: 'none', savedEnabled: '' }), '')
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: '', savedEnabled: '' }), '')
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: '', savedEnabled: '', fromEnv: env }), env)
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: 'none', savedEnabled: '', fromEnv: env }), '',
    '老数据里的 none 哨兵同样要压过环境变量')

  // 开关打开但地址没填：仍允许环境变量兜底，且下发值里不能出现哨兵
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: '', savedEnabled: '1', fromEnv: env }), env)
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: 'none', savedEnabled: '1', fromEnv: env }), env)
  assert.equal(effectiveCoresBaseUrl({ savedBaseUrl: '', savedEnabled: '1', fromEnv: '' }), '')

  // 非 https 的地址在生产环境要被拦下来（后台保存时也是这条规则）
  assert.throws(
    () => effectiveCoresBaseUrl({ savedBaseUrl: 'http://cores.example.com', savedEnabled: '1' }),
    /https/,
  )
  assert.equal(
    effectiveCoresBaseUrl({ savedBaseUrl: 'http://cores.example.com', savedEnabled: '1', allowInsecure: true }),
    'http://cores.example.com',
  )
})
