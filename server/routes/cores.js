// Serve libretro cores from local disk. Files are shipped under data/cores/ so
// runtime is pure static reads — no outbound fetches, no dependency on jsdelivr
// being reachable.
//
//   GET /api/cores/manifest                → 当前发布版本号 + 每个文件的体积/sha256
//   GET /api/cores/<release>/<core>.js     → 版本化地址（内容由版本号保证）
//   GET /api/cores/<release>/<core>.wasm
//   GET /api/cores/<core>.js               → 历史地址，仍然可用
//   GET /api/cores/<core>.wasm
//   GET /api/cores/<core>_libretro.js      → 历史别名
//   GET /api/cores/<core>_libretro.wasm
//
// 版本化地址优先读构建产物 data/cores-dist/<release>/（含预压缩副本的原始
// 文件），没有构建过时按清单体积校验后顶用 data/cores 里的同名文件。主站只是
// 远端资源服务器的回退通道：正常情况下浏览器直接从资源服务器取文件。

import { Hono } from 'hono'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CORES_DIR,
  CORES_DIST_DIR,
  CORE_FILE_RE,
  RELEASE_ID_RE,
  loadCoreRelease,
  resolveCoreArtifact,
} from '../cores-release.js'

export const coreRoutes = new Hono()

function coreResponse(body, ext) {
  return new Response(body, {
    headers: {
      'Content-Type': ext === 'js' ? 'application/javascript; charset=utf-8' : 'application/wasm',
      'Content-Length': String(body.length),
      // 版本化内容 + immutable：浏览器按年缓存，不需要再回源确认。
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

// 清单要能随时反映新发布的版本，因此每次请求都重新读 current.json（不缓存）。
coreRoutes.get('/manifest', (c) => {
  c.header('Cache-Control', 'no-cache')
  return c.json(loadCoreRelease())
})

coreRoutes.get('/:release/:file', (c) => {
  const release = c.req.param('release')
  const requestedFile = c.req.param('file')
  if (!RELEASE_ID_RE.test(release)) return c.text('bad request', 400)
  const m = CORE_FILE_RE.exec(requestedFile)
  if (!m) return c.text('bad request', 400)
  const [, core, ext] = m
  const name = `${core}.${ext}`

  const artifact = resolveCoreArtifact({
    release,
    name,
    distDir: CORES_DIST_DIR,
    coresDir: CORES_DIR,
  })
  if (!artifact) return c.text('core not found on disk', 404)

  return coreResponse(readFileSync(artifact.path), ext)
})

coreRoutes.get('/:file', (c) => {
  const requestedFile = c.req.param('file')
  const m = CORE_FILE_RE.exec(requestedFile)
  if (!m) return c.text('bad request', 400)
  const [, core, ext] = m
  const file = `${core}.${ext}`

  const full = join(CORES_DIR, file)
  if (!full.startsWith(CORES_DIR) || !existsSync(full)) {
    return c.text('core not found on disk', 404)
  }

  return coreResponse(readFileSync(full), ext)
})
