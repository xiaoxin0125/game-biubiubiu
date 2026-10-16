/*
 * 本地 ROM → 远端存储的一键迁移任务器（管理员在后台「远端设置」里触发）。
 *
 * 为什么不"重新上传一次再删旧的"：收藏、存档、房间、父子版本、封面全部挂在
 * roms.id 上。重新上传会产生新 id，等于把这些关联全部切断。这里走的是
 * "上传远端文件 → 校验大小与 sha256 → 就地更新原记录的 storage / remote_file_id"，
 * id 不变、关联不断。
 *
 * 三条关键约定：
 * 1. 本地副本保留。filePath 仍然指向本站磁盘上的原文件 —— 它是远端 ROM 播放的
 *    唯一兜底（浏览器直连远端失败时主站读它，见 routes/roms.js 的 serveRomFile），
 *    所以迁移只往远端加一份，不删本地。
 * 2. 单实例、进程内存。与限流计数、房间状态一样，任务状态只存在于当前进程；
 *    迁移期间服务重启任务会停掉，重跑即可 —— 已经是远端存储的记录会被跳过。
 * 3. 串行 + 大文件靠体积排序。一次只搬一个文件（内存与远端压力都可控），
 *    体积大的先搬（腾格子的收益最大，失败也能更早暴露）。
 *
 * 脚本版等价物：deploy/migrate-roms-to-remote.mjs（支持预演与回滚文件），
 * 两条路径共用同一套 storage.js / remote-storage.js 逻辑。
 */

import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { and, count, eq, notLike, sum } from 'drizzle-orm'
import { db } from './db/index.js'
import { roms, STATUS } from './db/schema.js'
import {
  remoteDelete,
  remoteStorageConfig,
  remoteUploadStream,
} from './remote-storage.js'
import {
  REMOTE_FILE_PATH_PREFIX,
  pickRemoteMigrationCandidates,
  resolveReadableUploadPath,
} from './storage.js'

// 失败明细最多留这么多条：任务状态是要下发给后台页面的，不能无限增长。
const MAX_ERROR_ENTRIES = 50
// 错误信息长度上限，避免某次远端异常把整段响应体塞进状态里。
const MAX_ERROR_LENGTH = 300

function emptyTask() {
  return {
    running: false,
    cancelRequested: false,
    startedAt: null,
    finishedAt: null,
    total: 0,
    totalBytes: 0,
    processed: 0,
    migrated: 0,
    migratedBytes: 0,
    failed: 0,
    current: null,
    errors: [],
    note: '',
  }
}

let task = emptyTask()
let abortController = null

/**
 * 从全部候选里挑出这次要迁移的记录：只搬本站磁盘上、还活着的 ROM，大的先搬。
 * 具体的筛选规则见 storage.js 的 pickRemoteMigrationCandidates（纯函数、有单测）。
 */
export function pickMigrationCandidates(rows) {
  return pickRemoteMigrationCandidates((rows || []).filter((row) => Number(row?.status) === STATUS.normal))
}

export function migrationTaskState() {
  return {
    ...task,
    current: task.current ? { ...task.current } : null,
    errors: task.errors.map((entry) => ({ ...entry })),
  }
}

export function isMigrationRunning() {
  return task.running
}

async function listCandidates() {
  const rows = await db.select().from(roms).where(eq(roms.status, STATUS.normal))
  return pickMigrationCandidates(rows)
}

async function pendingTotals() {
  const [row] = await db.select({ n: count(), bytes: sum(roms.fileSize) })
    .from(roms)
    .where(and(eq(roms.status, STATUS.normal), eq(roms.storage, 'local')))
  return { count: Number(row?.n || 0), bytes: Number(row?.bytes || 0) }
}

// 有本地副本的远端 ROM：filePath 不是 `remote:` 占位值的就是。体积按数据库里
// 的 file_size 估算（不逐个 stat 磁盘，避免后台一打开就扫一遍全站文件）。
async function localCopyTotals() {
  const [row] = await db.select({ n: count(), bytes: sum(roms.fileSize) })
    .from(roms)
    .where(and(
      eq(roms.status, STATUS.normal),
      eq(roms.storage, 'remote'),
      notLike(roms.filePath, `${REMOTE_FILE_PATH_PREFIX}%`),
    ))
  return { count: Number(row?.n || 0), bytes: Number(row?.bytes || 0) }
}

/** 后台页面用的一份快照：任务进度 + 待迁移统计 + 本地副本统计。 */
export async function romRemoteMigrationOverview() {
  const [pending, localCopies, config] = await Promise.all([
    pendingTotals(),
    localCopyTotals(),
    remoteStorageConfig(),
  ])
  return {
    task: migrationTaskState(),
    pending,
    localCopies,
    remoteConfigured: config.configured,
  }
}

function pushError(row, message) {
  const text = String(message || '未知错误').slice(0, MAX_ERROR_LENGTH)
  task.errors.push({ id: row.id, title: row.title, error: text })
  if (task.errors.length > MAX_ERROR_ENTRIES) task.errors.shift()
}

async function sha256OfFile(filePath) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

/**
 * 搬一个 ROM：读本地文件 → 流式上传 → 校验 → 更新记录。
 * 远端副本校验不过或落库失败时，会把刚传上去的远端文件删掉，不留孤儿。
 */
async function migrateOne(row, signal) {
  const localPath = resolveReadableUploadPath(row.filePath)
  const size = statSync(localPath).size
  const sha256 = await sha256OfFile(localPath)
  const uploaded = await remoteUploadStream({
    stream: createReadStream(localPath),
    fileName: row.fileName,
    sha256,
    size,
    signal,
  })
  const uploadedId = String(uploaded.id)
  if (Number(uploaded.size) !== size || (uploaded.sha256 && String(uploaded.sha256) !== sha256)) {
    await remoteDelete(uploadedId)
    throw new Error(`远端校验不一致（本地 ${size} 字节，远端 ${uploaded.size} 字节），已删除远端副本`)
  }
  try {
    // 保留 filePath：它是本地副本，直连失败时兜底用（见文件头注释）。
    await db.update(roms)
      .set({ storage: 'remote', remoteFileId: uploadedId })
      .where(eq(roms.id, row.id))
  } catch (error) {
    await remoteDelete(uploadedId).catch(() => {})
    throw error
  }
  return { size }
}

async function runMigration(rows, signal) {
  for (const row of rows) {
    if (signal.aborted) break
    task.current = { id: row.id, title: row.title, fileSize: row.fileSize }
    let cancelled = false
    try {
      const { size } = await migrateOne(row, signal)
      task.migrated += 1
      task.migratedBytes += size
    } catch (error) {
      if (signal.aborted) {
        // 手动停止：正在上传的这个是被中断的，不算"失败"，剩下的也不再处理。
        cancelled = true
      } else {
        task.failed += 1
        pushError(row, error?.message || error)
      }
    }
    task.processed += 1
    task.current = null
    if (cancelled) break
  }
  task.running = false
  task.finishedAt = new Date().toISOString()
  if (task.cancelRequested && task.processed < task.total) {
    task.note = `已手动停止：本次处理 ${task.processed}/${task.total} 个`
  }
}

/**
 * 启动一次迁移。已经在跑、远端未配置、没有可迁移的记录时都不会重复启动。
 * 返回 `{ started, reason, task }`，调用方据此给管理员提示。
 */
export async function startRomRemoteMigration() {
  if (task.running) return { started: false, reason: 'running', task: migrationTaskState() }
  const config = await remoteStorageConfig()
  if (!config.configured) throw new Error('尚未配置远端存储，请先填写远端地址和密钥并保存')
  const rows = await listCandidates()
  if (!rows.length) return { started: false, reason: 'empty', task: migrationTaskState() }

  task = {
    ...emptyTask(),
    running: true,
    startedAt: new Date().toISOString(),
    total: rows.length,
    totalBytes: rows.reduce((sumBytes, row) => sumBytes + (Number(row.fileSize) || 0), 0),
  }
  abortController = new AbortController()
  const signal = abortController.signal
  // 不 await：任务在后台跑，进度由 romRemoteMigrationOverview 轮询。
  runMigration(rows, signal).catch((error) => {
    task.running = false
    task.finishedAt = new Date().toISOString()
    task.note = `任务异常中止：${String(error?.message || error).slice(0, MAX_ERROR_LENGTH)}`
    console.error('[rom-migration] task crashed', error)
  }).finally(() => {
    abortController = null
  })
  return { started: true, reason: null, task: migrationTaskState() }
}

/** 停止迁移：立刻中断正在上传的文件，剩下的记录不再处理。 */
export function cancelRomRemoteMigration() {
  if (!task.running) return { cancelled: false, task: migrationTaskState() }
  task.cancelRequested = true
  try { abortController?.abort() } catch {}
  return { cancelled: true, task: migrationTaskState() }
}

// 测试用：把任务状态复位（不影响任何进行中的任务，只在没有任务时使用）。
export function resetMigrationStateForTest() {
  if (task.running) return false
  task = emptyTask()
  return true
}
