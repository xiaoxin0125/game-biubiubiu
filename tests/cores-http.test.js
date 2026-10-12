import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// 核心路由的集成测试：构建一份临时发布目录，用真实的 HTTP 路由验证
// 版本化地址、清单、历史别名和鉴权边界。
//
// 环境变量必须在 import 路由模块之前设好：cores-release.js 在模块加载时解析目录。
const BUILD_SCRIPT = new URL('../deploy/build-cores.mjs', import.meta.url).pathname
const srcDir = mkdtempSync(join(tmpdir(), 'cores-http-src-'))
const distDir = mkdtempSync(join(tmpdir(), 'cores-http-dist-'))

writeFileSync(join(srcDir, 'fbneo.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 2, 3, 4, 5]))
writeFileSync(join(srcDir, 'fbneo.js'), 'var Module = {};')
execFileSync(process.execPath, [BUILD_SCRIPT, '--src', srcDir, '--out', distDir], { stdio: 'ignore' })

process.env.CORES_DIR = srcDir
process.env.CORES_DIST_DIR = distDir
const { coreRoutes } = await import('../server/routes/cores.js')

const { loadCoreRelease } = await import('../server/cores-release.js')
const release = loadCoreRelease(distDir).release

test.after(() => {
  rmSync(srcDir, { recursive: true, force: true })
  rmSync(distDir, { recursive: true, force: true })
})

test('清单接口给出当前版本与每个文件的体积/摘要', async () => {
  const res = await coreRoutes.request('/manifest')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('cache-control') || '', /no-cache/)
  const body = await res.json()
  assert.equal(body.release, release)
  assert.deepEqual(Object.keys(body.files).sort(), ['fbneo.js', 'fbneo.wasm'])
  assert.equal(body.files['fbneo.wasm'].size, 9)
  assert.match(body.files['fbneo.wasm'].sha256, /^[a-f0-9]{64}$/)
})

test('版本化地址按发布版本提供文件，并带 immutable 缓存', async () => {
  const res = await coreRoutes.request(`/${release}/fbneo.wasm`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/wasm')
  assert.equal(res.headers.get('content-length'), '9')
  assert.match(res.headers.get('cache-control') || '', /immutable/)
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0x00, 0x61, 0x73, 0x6d, 1, 2, 3, 4, 5])
})

test('版本化地址也接受历史别名 <core>_libretro.<ext>', async () => {
  const res = await coreRoutes.request(`/${release}/fbneo_libretro.js`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') || '', /application\/javascript/)
})

test('版本号或文件名不对时是 404/400，不会误发别的版本', async () => {
  // 别的版本目录下没有这个文件：不能"顺手"发当前版本的文件
  const wrong = await coreRoutes.request('/ffffffffffff/fbneo.wasm')
  assert.equal(wrong.status, 404)
  const badRelease = await coreRoutes.request('/NOT-HEX/fbneo.wasm')
  assert.equal(badRelease.status, 400)
  const badFile = await coreRoutes.request(`/${release}/fbneo.zip`)
  assert.equal(badFile.status, 400)
  const missing = await coreRoutes.request(`/${release}/snes9x.wasm`)
  assert.equal(missing.status, 404)
})

test('历史地址仍然可用（老客户端与本地开发都能跑）', async () => {
  const alias = await coreRoutes.request('/fbneo_libretro.wasm')
  assert.equal(alias.status, 200)
  const direct = await coreRoutes.request('/fbneo.js')
  assert.equal(direct.status, 200)
  assert.match(direct.headers.get('content-type') || '', /application\/javascript/)
})
