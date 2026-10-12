#!/usr/bin/env node
/*
 * 核心资源发布构建。
 *
 * 把 data/cores 里的一批核心文件打包成一个"版本目录"，主站与远端资源服务器
 * 都按同一份清单提供文件，浏览器按 <版本>/<文件名> 取，于是版本号本身就能证明
 * 内容（改了任何一个字节，版本号都会变）。产物：
 *
 *   <out>/<release>/<name>.js            原始文件
 *   <out>/<release>/<name>.wasm
 *   <out>/<release>/<name>.js.gz         预压缩副本（远端 nginx gzip_static 用）
 *   <out>/<release>/<name>.wasm.gz
 *   <out>/<release>/manifest.json        文件名 → 体积 / sha256 / 压缩后体积
 *   <out>/current.json                   当前版本指针（服务端只读这个）
 *
 * 用法：
 *   node deploy/build-cores.mjs                      # 构建到 data/cores-dist
 *   node deploy/build-cores.mjs --out /tmp/cores     # 换输出目录
 *   node deploy/build-cores.mjs --prune              # 只保留最近 2 个版本目录
 *
 * 版本号由内容决定，重复构建同一批文件不会产生新目录，因此可以放心重跑；
 * 更新核心文件后重新构建会得到新版本目录，与旧版本并存，便于回滚。
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const CORE_FILE_RE = /^[a-z0-9_]+\.(js|wasm)$/
// 与 server/cores-release.js 保持一致：短版本号便于阅读，12 位十六进制足够唯一。
const RELEASE_ID_LENGTH = 12
const KEEP_RELEASES = 2

function parseArgs(argv) {
  const out = { gzip: true, prune: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--src' && next) { out.src = next; i += 1 } else if (arg.startsWith('--src=')) out.src = arg.slice(6)
    else if (arg === '--out' && next) { out.out = next; i += 1 } else if (arg.startsWith('--out=')) out.out = arg.slice(6)
    else if (arg === '--release' && next) { out.release = next; i += 1 } else if (arg.startsWith('--release=')) out.release = arg.slice(10)
    else if (arg === '--no-gzip') out.gzip = false
    else if (arg === '--prune') out.prune = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else {
      console.error(`未知参数：${arg}（可用：--src --out --release --no-gzip --prune）`)
      process.exit(2)
    }
  }
  return out
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*/, '').trim())
  process.exit(0)
}

const srcDir = resolve(args.src || 'data/cores')
const outDir = resolve(args.out || 'data/cores-dist')

if (!existsSync(srcDir)) {
  console.error(`[cores] 源目录不存在：${srcDir}`)
  process.exit(1)
}

const names = readdirSync(srcDir).filter((name) => CORE_FILE_RE.test(name)).sort()
if (!names.length) {
  console.error(`[cores] ${srcDir} 里没有 .js / .wasm 文件`)
  process.exit(1)
}

// 先算内容指纹：清单与版本号都建立在它之上，任何字节变化都会体现出来。
const files = {}
const fingerprints = []
let rawBytes = 0
for (const name of names) {
  const full = join(srcDir, name)
  const buffer = readFileSync(full)
  const entry = { size: buffer.length, sha256: sha256(buffer) }
  files[name] = entry
  fingerprints.push(`${name}:${entry.size}:${entry.sha256}`)
  rawBytes += entry.size
}

const release = String(args.release || sha256(fingerprints.join('\n')).slice(0, RELEASE_ID_LENGTH)).toLowerCase()
if (!/^[a-f0-9]{8,32}$/.test(release)) {
  console.error(`[cores] 版本号必须是 8-32 位十六进制：${release}`)
  process.exit(1)
}

const releaseDir = join(outDir, release)
mkdirSync(releaseDir, { recursive: true })

let gzipBytes = 0
for (const name of names) {
  const from = join(srcDir, name)
  const to = join(releaseDir, name)
  copyFileSync(from, to)
  if (!args.gzip) continue
  const gz = gzipSync(readFileSync(from), { level: 9 })
  writeFileSync(`${to}.gz`, gz)
  files[name].gzipSize = gz.length
  gzipBytes += gz.length
}

const manifest = {
  release,
  generatedAt: new Date().toISOString(),
  files,
}
writeFileSync(join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

writeFileSync(join(outDir, 'current.json'), `${JSON.stringify({
  release,
  generatedAt: manifest.generatedAt,
  fileCount: names.length,
  bytes: rawBytes,
  gzipBytes: args.gzip ? gzipBytes : null,
}, null, 2)}\n`, 'utf8')

if (args.prune) {
  const releases = readdirSync(outDir)
    .filter((name) => /^[a-f0-9]{8,32}$/.test(name) && statSync(join(outDir, name)).isDirectory())
    .map((name) => ({ name, mtime: statSync(join(outDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const stale of releases.slice(KEEP_RELEASES)) {
    rmSync(join(outDir, stale.name), { recursive: true, force: true })
    console.log(`[cores] 已清理旧版本目录 ${stale.name}`)
  }
}

console.log(`[cores] 源目录   ${srcDir}`)
console.log(`[cores] 版本号   ${release}`)
console.log(`[cores] 输出目录 ${releaseDir}`)
console.log(`[cores] 文件     ${names.length} 个，原始 ${formatBytes(rawBytes)}${args.gzip ? `，gzip 后 ${formatBytes(gzipBytes)}` : ''}`)
console.log('[cores] 远端同步：deploy/sync-cores.sh（先在后台「站点设置 → 核心资源」里填好远端地址）')
