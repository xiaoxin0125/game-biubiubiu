// 清掉构建产物里的「开发期文件」。
//
// `public/` 会被 vite 原样复制进 `dist/`，所以往里面丢一个工具脚本或一份内部文档，
// 它就会作为静态文件上线：`/j2me/apply-site-patches.mjs` 与 `/j2me/INTEGRATION.md`
// 就是这么被访客直接下载到的（2026-10 安全审计 H-3）。这两个文件已经搬到
// `frontend/scripts/`，这里再兜一层，防止以后有人把同类文件放回 public/。
//
// 运行时真正需要的只有 .html / .js / .css / .json / .jar / .wasm / 图片，
// 所以这里按「开发期类型」删除，而不是按白名单保留（避免误删运行时资源）。
//
// Usage: node scripts/prune-dist-devfiles.js [dist-dir]
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dist = path.resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)))

// 源码文档、构建脚本、source map、样式源码：都不该被访客下载。
const DEV_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.mjs', '.map', '.ts', '.tsx', '.scss', '.sh'])
// 没有扩展名但同样不该上线的文件。
const DEV_FILE_NAMES = new Set(['.gitignore', '.gitattributes', 'package.json', 'package-lock.json'])

// 例外：许可证与出处说明属于分发要求，必须留在站点上（nginx 侧也有对应的精确匹配
// 放行规则，见 deploy/nginx/extension-app.conf）。这里按前缀放行，避免以后再被误删。
const KEPT_PREFIXES = ['LICENSE', 'COPYING', 'NOTICE']

const removed = []

function prune(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      prune(full)
      continue
    }
    if (KEPT_PREFIXES.some((prefix) => entry.name.toUpperCase().startsWith(prefix))) continue
    const devFile = DEV_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      || DEV_FILE_NAMES.has(entry.name)
    if (!devFile) continue
    rmSync(full, { force: true })
    removed.push(path.relative(dist, full))
  }
}

if (existsSync(dist)) {
  prune(dist)
  if (removed.length) {
    console.log(`[prune-dist] removed ${removed.length} dev-only file(s): ${removed.join(', ')}`)
  }
}
