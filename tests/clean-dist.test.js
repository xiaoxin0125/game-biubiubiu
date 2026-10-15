// `public/` 是直接镜像进 `dist/` 的，所以从 public 里删掉的文件必须在下一次构建时
// 从 dist 里一并消失 —— 否则它会一直留在站点上。曾经的一版 js2me 运行时
// （`dist/j2me/vendor`，215 个文件）与已删除的 37 张封面图就是这么留在
// `frontend/dist/j2me` 里的：清理脚本只删了 assets 与 index.html。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const script = fileURLToPath(new URL('../frontend/scripts/clean-dist.js', import.meta.url))

test('构建前清理 dist：public 里已删除的条目从 dist 消失，不属于 vite 的目录保留', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'clean-dist-'))
  try {
    const dist = path.join(fixture, 'dist')
    const publicDir = path.join(fixture, 'public')

    // dist：vite 自己的产物 + 镜像自 public 的条目 + 一个 hosting panel 写的目录
    mkdirSync(path.join(dist, 'assets'), { recursive: true })
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html>\n')
    mkdirSync(path.join(dist, 'j2me/vendor/js'), { recursive: true })
    writeFileSync(path.join(dist, 'j2me/vendor/js/emulator.js'), '// 上一版的运行时\n')
    mkdirSync(path.join(dist, '.well-known/acme-challenge'), { recursive: true })
    writeFileSync(path.join(dist, '.well-known/acme-challenge/token'), 'acme\n')

    // public：只剩 j2me，vendor 已经不在里面了
    mkdirSync(path.join(publicDir, 'j2me'), { recursive: true })
    writeFileSync(path.join(publicDir, 'j2me/main.html'), '<!doctype html>\n')

    execFileSync(process.execPath, [script, dist, publicDir], { encoding: 'utf8' })

    assert.equal(existsSync(path.join(dist, 'assets')), false, 'vite 的 assets 要清掉')
    assert.equal(existsSync(path.join(dist, 'index.html')), false, 'vite 的入口要清掉')
    assert.equal(
      existsSync(path.join(dist, 'j2me')),
      false,
      'public 里仍然存在的条目也要先删掉，等 vite 重新拷一份（否则旧的 vendor 会留下）',
    )
    assert.equal(
      existsSync(path.join(dist, '.well-known/acme-challenge/token')),
      true,
      '不属于 vite 的目录必须留在原处且仍然可写',
    )
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
