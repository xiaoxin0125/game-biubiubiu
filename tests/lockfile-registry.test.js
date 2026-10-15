// 镜像打包完全按 `package-lock.json` 里记的地址下载依赖：CI 里的 `npm ci` 与
// Dockerfile 里的 `npm ci` 都一样。v1.7.0 的镜像打包就是栽在这里 —— 那份锁文件是在
// 腾讯云机器上生成的，281 条下载地址被写成了内网镜像
// `http://mirrors.tencentyun.com/npm/...`（内网域名在 VPC 里解析到 169.254.0.3，
// 公网没有记录），GitHub 的构建机解析不了这个域名，两轮流水线都以
// `getaddrinfo EAI_AGAIN` 收场：CI 的 `npm ci` 失败、Dockerfile 的生产阶段
// `npm ci --omit=dev` 同样失败。
//
// 所以把「锁文件只能引用公网仓库」钉成用例：本机换过 npm 源（内网镜像）之后，
// 谁再顺手提交一份被改写的锁文件，`npm test` 会直接拦下来。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 公网可解析的 npm 仓库：GitHub 构建机与各厂商的构建机都访问得到。
const PUBLIC_REGISTRIES = new Set(['registry.npmjs.org', 'registry.npmmirror.com'])

const lockfileUrl = fileURLToPath(new URL('../package-lock.json', import.meta.url))

test('package-lock.json 里的下载地址必须是公网仓库', () => {
  const lock = JSON.parse(readFileSync(lockfileUrl, 'utf8'))

  // 主机 -> 命中的条数与一个样例包名，失败时按主机汇总报出来。
  const offenders = new Map()
  for (const [name, entry] of Object.entries(lock.packages ?? {})) {
    if (typeof entry?.resolved !== 'string') continue
    let url
    try {
      url = new URL(entry.resolved)
    } catch {
      continue // workspace 之间的 link（`"resolved": "frontend"`）不是下载地址
    }
    if (url.protocol === 'https:' && PUBLIC_REGISTRIES.has(url.hostname)) continue

    const hit = offenders.get(url.origin) ?? { count: 0, sample: name }
    hit.count += 1
    offenders.set(url.origin, hit)
  }

  assert.deepEqual(
    [...offenders].map(([origin, hit]) => `${origin}（${hit.count} 条，例如 ${hit.sample}）`),
    [],
    '锁文件里出现了非公网下载地址：构建机（GitHub Actions、Docker 构建）解析不了内网域名，' +
      '镜像打包会以 getaddrinfo EAI_AGAIN 失败。请在能访问公网仓库的环境重新生成锁文件，' +
      '例如 npm install --registry=https://registry.npmjs.org --package-lock-only。',
  )
})
