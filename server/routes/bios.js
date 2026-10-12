import { Hono } from 'hono'
import { existsSync, statSync, createReadStream, readdirSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import { stream } from 'hono/streaming'
import { currentUser } from '../middleware/auth.js'
import { entityTagFor, ifNoneMatchMatches } from '../http-utils.js'

const BIOS_DIR = resolve(process.env.BIOS_DIR || 'data/bios')

// Content-Type picked from the extension so non-zip BIOS (.rom / .bin for
// PSX / GBA / FDS / etc.) don't get served as application/zip.
function contentTypeFor(name) {
  const ext = extname(name).toLowerCase()
  if (ext === '.zip') return 'application/zip'
  return 'application/octet-stream'
}

export const biosRoutes = new Hono()

biosRoutes.get('/:platform/:file', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.text('unauthorized', 401)
  const platform = c.req.param('platform').replace(/[^a-z0-9_-]/gi, '')
  const file = c.req.param('file').replace(/[^a-zA-Z0-9._-]/g, '')
  if (!platform || !file) return c.text('bad request', 400)
  const full = join(BIOS_DIR, platform, file)
  if (!full.startsWith(BIOS_DIR)) return c.text('forbidden', 403)
  if (!existsSync(full)) return c.text('not found', 404)

  const st = statSync(full)
  // 每次开局都重下 1.8–2.2 MB 的 BIOS 是纯浪费：这里改成条件请求。
  // private 是因为内容只有登录用户能读，不能进共享缓存；no-cache 表示"可以用
  // 本地副本，但每次都要先问一下"——文件没变就是 304，只回响应头。
  const etag = entityTagFor(st.size, st.mtimeMs)
  c.header('Cache-Control', 'private, no-cache')
  c.header('ETag', etag)
  if (ifNoneMatchMatches(c.req.header('if-none-match'), etag)) {
    return c.body(null, 304)
  }
  c.header('Content-Type', contentTypeFor(file))
  c.header('Content-Length', String(st.size))
  return stream(c, async (s) => {
    const rs = createReadStream(full)
    await s.pipe(new ReadableStream({
      start(controller) {
        rs.on('data', (chunk) => controller.enqueue(chunk))
        rs.on('end', () => controller.close())
        rs.on('error', (err) => controller.error(err))
      },
    }))
  })
})

biosRoutes.get('/:platform', (c) => {
  const platform = c.req.param('platform').replace(/[^a-z0-9_-]/gi, '')
  const dir = join(BIOS_DIR, platform)
  if (!existsSync(dir)) return c.json({ files: [] })
  try {
    const files = readdirSync(dir).filter((n) => !n.startsWith('.'))
    return c.json({ files })
  } catch {
    return c.json({ files: [] })
  }
})
