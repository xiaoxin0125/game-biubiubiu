import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { mkdirSync, unlinkSync, createReadStream, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { Readable } from 'node:stream'
import { join, resolve } from 'node:path'
import { bodyLimit } from 'hono/body-limit'
import { stream } from 'hono/streaming'
import { db } from '../db/index.js'
import { saveStates, roms, STATUS } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'
import { assertInsideRoot } from '../storage.js'

const liveSave = (extra) =>
  extra ? and(eq(saveStates.status, STATUS.normal), extra) : eq(saveStates.status, STATUS.normal)
const liveRom = (extra) =>
  extra ? and(eq(roms.status, STATUS.normal), extra) : eq(roms.status, STATUS.normal)

const SAVES_DIR = resolve(process.env.SAVES_DIR || 'data/saves')
const MAX_STATE_BYTES = Number(process.env.MAX_STATE_BYTES) || 8 * 1024 * 1024 // 8 MB
const MAX_SAVE_SLOT = Number(process.env.MAX_SAVE_SLOT) || 9

export const saveRoutes = new Hono()

function serialize(row) {
  return {
    id: row.id,
    romId: row.romId,
    slot: row.slot,
    size: row.fileSize,
    updatedAt: row.updatedAt,
  }
}

function normalizeSlot(value) {
  const slot = Number(value || 0)
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SAVE_SLOT) return null
  return slot
}

function checkedSavePath(...parts) {
  return assertInsideRoot(SAVES_DIR, join(SAVES_DIR, ...parts))
}

function openSaveFile(filePath) {
  const checked = assertInsideRoot(SAVES_DIR, filePath)
  return { stat: statSync(checked), stream: createReadStream(checked) }
}

function removeSaveFile(filePath) {
  unlinkSync(assertInsideRoot(SAVES_DIR, filePath))
}

// List all saves for the current user
saveRoutes.get('/mine', requireAuth, async (c) => {
  const me = c.get('user')
  const rows = await db.select().from(saveStates)
    .where(liveSave(eq(saveStates.userId, me.id)))
  return c.json({ saves: rows.map(serialize) })
})

// Get the save for a specific ROM + slot.
// 没有存档时回 204 而不是 404：播放页每次开局都会问一次「这个槽位有存档吗」，
// 404 会让浏览器在控制台打一条红色的加载失败，玩家会以为游戏出错了。
saveRoutes.get('/:romId', requireAuth, async (c) => {
  const me = c.get('user')
  const romId = Number(c.req.param('romId'))
  const slot = normalizeSlot(c.req.query('slot'))
  if (slot === null) return c.json({ error: '存档槽位不合法' }, 400)
  const row = (await db.select().from(saveStates)
    .where(liveSave(and(eq(saveStates.userId, me.id), eq(saveStates.romId, romId), eq(saveStates.slot, slot))))
    .limit(1))[0]
  if (!row) return c.body(null, 204)

  let file
  try { file = openSaveFile(row.filePath) }
  catch { return c.body(null, 204) }

  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Length', String(file.stat.size))
  c.header('X-Save-Updated-At', String(row.updatedAt instanceof Date ? Math.floor(row.updatedAt.getTime()/1000) : row.updatedAt))
  return stream(c, async (s) => {
    // 交给 Readable.toWeb：自带背压与取消处理（手写流包装在客户端中断时会抛
    // ERR_INVALID_STATE，见审计报告 M-5）。
    await s.pipe(Readable.toWeb(file.stream))
  })
})

// Upload / overwrite save for a ROM + slot (body is raw binary).
// bodyLimit 兜住 chunked 请求：只信 content-length 的话，不带该头的请求能把整个
// 体积灌进内存（2026-10 审计 M-1）。
const saveUploadBodyLimit = bodyLimit({
  maxSize: MAX_STATE_BYTES + 1024 * 1024,
  onError: (c) => c.json({ error: `存档超过 ${Math.round(MAX_STATE_BYTES / 1024 / 1024)}MB` }, 413),
})

saveRoutes.post('/:romId', requireAuth, saveUploadBodyLimit, async (c) => {
  const me = c.get('user')
  const romId = Number(c.req.param('romId'))
  const slot = normalizeSlot(c.req.query('slot'))
  if (slot === null) return c.json({ error: '存档槽位不合法' }, 400)

  // Validate ROM exists + accessible
  const rom = (await db.select().from(roms).where(liveRom(eq(roms.id, romId))).limit(1))[0]
  if (!rom) return c.json({ error: 'ROM 不存在' }, 404)
  if (rom.userId !== me.id && !rom.isPublic && me.role !== 'admin') {
    return c.json({ error: '无权为该 ROM 存档' }, 403)
  }

  const raw = Buffer.from(await c.req.arrayBuffer())
  if (!raw.length) return c.json({ error: '空存档' }, 400)

  // 客户端可以把大存档压成 gzip 再传（关标签页前那一次上传有 64KB 硬上限，
  // 压缩是让大存档挤进这条路的办法，见 frontend 的 saveUpload）。解压同样要限长：
  // 只限压缩后的体积等于允许一个 gzip 炸弹把 8MB 上限撑成几十 GB。
  let buf = raw
  if (String(c.req.header('content-encoding') || '').toLowerCase() === 'gzip') {
    try {
      buf = gunzipSync(raw, { maxOutputLength: MAX_STATE_BYTES })
    } catch (error) {
      const tooBig = String(error?.code || '') === 'ERR_BUFFER_TOO_LARGE' || /output length/i.test(String(error?.message || ''))
      return c.json({ error: tooBig ? `存档超过 ${Math.round(MAX_STATE_BYTES/1024/1024)}MB` : '存档解压失败' }, tooBig ? 413 : 400)
    }
  }
  if (!buf.length) return c.json({ error: '空存档' }, 400)
  if (buf.length > MAX_STATE_BYTES) return c.json({ error: `存档超过 ${Math.round(MAX_STATE_BYTES/1024/1024)}MB` }, 413)

  const userDir = checkedSavePath(String(me.id))
  mkdirSync(userDir, { recursive: true })
  const fileName = `${romId}.s${slot}.state`
  const filePath = assertInsideRoot(userDir, join(userDir, fileName))
  await writeFile(filePath, buf)

  await db.insert(saveStates).values({
    userId: me.id,
    romId,
    slot,
    filePath,
    fileSize: buf.length,
    status: STATUS.normal,
    updatedAt: new Date(),
  })
    .onDuplicateKeyUpdate({
      set: {
        filePath,
        fileSize: buf.length,
        status: STATUS.normal,
        updatedAt: new Date(),
      },
    })

  const row = await db.select().from(saveStates)
    .where(liveSave(and(eq(saveStates.userId, me.id), eq(saveStates.romId, romId), eq(saveStates.slot, slot))))
    .limit(1)
    .then((rows) => rows[0])
  return c.json(serialize(row))
})

// Delete a save
saveRoutes.delete('/:romId', requireAuth, async (c) => {
  const me = c.get('user')
  const romId = Number(c.req.param('romId'))
  const slot = normalizeSlot(c.req.query('slot'))
  if (slot === null) return c.json({ error: '存档槽位不合法' }, 400)
  const row = (await db.select().from(saveStates)
    .where(liveSave(and(eq(saveStates.userId, me.id), eq(saveStates.romId, romId), eq(saveStates.slot, slot))))
    .limit(1))[0]
  if (!row) return c.json({ ok: true })
  try { removeSaveFile(row.filePath) } catch {}
  await db.update(saveStates).set({ status: STATUS.deleted }).where(eq(saveStates.id, row.id))
  return c.json({ ok: true })
})
