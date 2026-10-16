#!/usr/bin/env node
/*
 * 把本机存储的 ROM 迁到远端 rom-upload，保留原有记录 id 与所有关联数据。
 *
 * 为什么不"后台重新上传一次再删旧的"：收藏、存档、房间、父子版本、封面全部挂在
 * roms.id 上。重新上传会产生新 id，等于把这些关联全部切断。这个脚本走的是
 * "上传远端文件 → 校验 → 就地更新原记录的 storage 字段"，id 不变。
 *
 * 默认是预演（只打印计划，不写数据库、不上传）。确认无误后加 --apply 真正执行：
 *
 *   node deploy/migrate-roms-to-remote.mjs                  # 预演全部
 *   node deploy/migrate-roms-to-remote.mjs --min-size 3      # 只看 ≥3MB 的
 *   node deploy/migrate-roms-to-remote.mjs --id 12 --id 15   # 指定记录
 *   node deploy/migrate-roms-to-remote.mjs --apply           # 执行，并写出回滚文件
 *   node deploy/migrate-roms-to-remote.mjs --rollback deploy/migrations/roms-remote-<时间>.json
 *
 * 后台「站点设置 → 远端设置 → 本地 ROM 一键迁移」做的是同一件事（不写回滚文件）；
 * 日常用后台那个即可，这个脚本适合需要预演 / 限定范围 / 留回滚文件的场合。
 *
 * 安全约束：
 *   - 只上传、只改 storage/remote_file_id，不动本地文件；filePath 保留为本地副本，
 *     它是远端 ROM 播放的兜底（浏览器直连远端失败时主站读它），所以不要手工删除
 *     （清理清单见脚本结尾）。
 *   - 先上传成功、远端返回的大小与 sha256 都与本地一致，才更新数据库。
 *   - 每个成功的记录都会写进回滚文件，可整批回滚（--keep-remote 保留远端副本）。
 *   - 可重复执行：已经是远端存储的记录会跳过。
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 必须先加载配置（config/.env 或 .env），db / remote-storage 都依赖其中的环境变量。
import '../server/config.js'

const { eq } = await import('drizzle-orm')
const { db } = await import('../server/db/index.js')
const { roms } = await import('../server/db/schema.js')
const { remoteUploadStream, remoteDelete, remoteDownloadConfig, remoteStorageConfig } = await import('../server/remote-storage.js')
const { assertInsideRoot } = await import('../server/storage.js')

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR || 'data/uploads')
const LEGACY_UPLOAD_ROOTS = [
  process.env.LEGACY_UPLOADS_DIR,
  '/www/wwwroot/Xgame/data/uploads',
].filter(Boolean).map((root) => resolve(root))

function parseArgs(argv) {
  const out = { apply: false, ids: [], minSizeBytes: 0, keepRemote: false, outFile: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--apply') out.apply = true
    else if (arg === '--keep-remote') out.keepRemote = true
    else if (arg === '--id' && next) { out.ids.push(Number(next)); i += 1 }
    else if (arg === '--min-size' && next) { out.minSizeBytes = Math.round(Number(next) * 1024 * 1024); i += 1 }
    else if (arg === '--out' && next) { out.outFile = next; i += 1 }
    else if (arg === '--rollback' && next) { out.rollbackFile = next; i += 1 }
    else if (arg === '--help' || arg === '-h') out.help = true
    else { console.error(`未知参数：${arg}`); process.exit(2) }
  }
  return out
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)}KB`
  return `${value}B`
}

// 迁移上传用流式：几百 MB 到几 GB 的文件不进内存（与后台「一键迁移」一致）。
async function sha256OfFile(filePath) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

function resolveLocalPath(filePath) {
  const candidates = [UPLOADS_DIR, ...LEGACY_UPLOAD_ROOTS]
  for (const root of candidates) {
    try {
      const checked = assertInsideRoot(root, filePath)
      if (existsSync(checked)) return checked
    } catch {}
  }
  return null
}

function describeError(error) {
  return error?.message || String(error)
}

// ── 回滚 ────────────────────────────────────────────────────────────────
async function rollback(file) {
  if (!existsSync(file)) {
    console.error(`回滚文件不存在：${file}`)
    process.exit(1)
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : []
  if (!entries.length) {
    console.error('回滚文件里没有记录')
    process.exit(1)
  }
  console.log(`回滚 ${entries.length} 条记录${args.keepRemote ? '（保留远端副本）' : ''}…`)
  let done = 0
  for (const entry of entries) {
    const rows = await db.select().from(roms).where(eq(roms.id, entry.id)).limit(1)
    const row = rows[0]
    if (!row) {
      console.warn(`  跳过 id=${entry.id}：记录不存在`)
      continue
    }
    if (row.storage === 'remote' && entry.originalFilePath) {
      await db.update(roms)
        .set({ storage: 'local', remoteFileId: null, filePath: entry.originalFilePath })
        .where(eq(roms.id, entry.id))
      if (!args.keepRemote && entry.remoteFileId) await remoteDelete(entry.remoteFileId)
      console.log(`  已回滚 id=${entry.id} ${entry.title || ''} → ${entry.originalFilePath}`)
      done += 1
    } else {
      console.warn(`  跳过 id=${entry.id}：当前不是远端存储（storage=${row.storage}）`)
    }
  }
  console.log(`回滚完成：${done} 条`)
}

// ── 主流程 ──────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*/, '').trim())
  process.exit(0)
}

if (args.rollbackFile) {
  await rollback(resolve(args.rollbackFile))
  process.exit(0)
}

const remote = await remoteStorageConfig()
if (!remote.configured) {
  console.error('尚未配置远端存储：请在后台「站点设置 → 远端存储」里填好地址和密钥')
  process.exit(1)
}
const downloadCfg = await remoteDownloadConfig()
console.log(`远端上传地址：${remote.url}`)
console.log(`浏览器直连下载：${downloadCfg.enabled && downloadCfg.configured ? `已开启（${downloadCfg.url}）` : '未开启（仍由主站代理回源）'}`)

const all = await db.select().from(roms).where(eq(roms.status, 1))
const candidates = all
  .filter((row) => (row.storage || 'local') === 'local')
  .filter((row) => !args.ids.length || args.ids.includes(row.id))
  .filter((row) => Number(row.fileSize) >= args.minSizeBytes)
  .sort((a, b) => Number(b.fileSize) - Number(a.fileSize))

if (!candidates.length) {
  console.log('没有需要迁移的本地 ROM')
  process.exit(0)
}

const totalBytes = candidates.reduce((sum, row) => sum + (Number(row.fileSize) || 0), 0)
console.log(`\n待迁移 ${candidates.length} 个 ROM，共 ${formatBytes(totalBytes)}：`)
for (const row of candidates) {
  console.log(`  id=${row.id} ${formatBytes(row.fileSize)} ${row.platform} ${row.title}（${row.fileName}）`)
}

if (!args.apply) {
  console.log('\n这是预演：没有上传、没有改数据库。确认无误后加 --apply 执行。')
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const outFile = resolve(args.outFile || join(SCRIPT_DIR, 'migrations', `roms-remote-${stamp}.json`))
mkdirSync(dirname(outFile), { recursive: true })

const entries = []
let uploaded = 0
let failed = 0

for (const row of candidates) {
  const localPath = resolveLocalPath(row.filePath)
  if (!localPath) {
    console.error(`  ✗ id=${row.id} 本地文件找不到（file_path=${row.filePath}），跳过`)
    failed += 1
    continue
  }

  const size = statSync(localPath).size
  try {
    const sha256 = await sha256OfFile(localPath)
    // 流式上传 + 远端校验（大小与 sha256 都对得上才算成功）。
    const result = await remoteUploadStream({
      stream: createReadStream(localPath),
      fileName: row.fileName,
      sha256,
      size,
    })
    if (Number(result.size) !== size || (result.sha256 && result.sha256 !== sha256)) {
      throw new Error(`远端校验不一致（本地 ${size}/${sha256.slice(0, 12)}…，远端 ${result.size}/${String(result.sha256).slice(0, 12)}…）`)
    }

    // 保留 filePath：它是本地副本，浏览器直连远端失败时主站拿它兜底
    // （与后台「一键迁移」行为一致）。本地副本不要删，删了该 ROM 就没有兜底了。
    await db.update(roms)
      .set({ storage: 'remote', remoteFileId: String(result.id) })
      .where(eq(roms.id, row.id))

    entries.push({
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      originalFilePath: row.filePath,
      localPath,
      size,
      sha256,
      remoteFileId: String(result.id),
      appliedAt: new Date().toISOString(),
    })
    writeFileSync(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), remoteUrl: remote.url, entries }, null, 2)}\n`, 'utf8')
    uploaded += 1
    console.log(`  ✓ id=${row.id} ${row.title} → 远端 ${result.id}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ id=${row.id} ${row.title}：${describeError(error)}`)
  }
}

console.log(`\n完成：成功 ${uploaded}，失败 ${failed}`)
if (uploaded) {
  console.log(`回滚文件：${outFile}`)
  console.log(`回滚命令：node deploy/migrate-roms-to-remote.mjs --rollback ${outFile}`)
  console.log('\n本地副本已保留（直连远端失败时主站用它兜底），脚本不会删，也请不要手动删 ——')
  console.log('删掉之后这个 ROM 在没有直连时就无法播放。相应文件位置：')
  for (const entry of entries) console.log(`  ${entry.localPath}`)
}
if (failed) process.exitCode = 1
process.exit(0)
