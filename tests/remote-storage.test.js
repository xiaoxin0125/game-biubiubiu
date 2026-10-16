import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { normalizeRemoteUrl, normalizeRemoteToken } from '../server/remote-storage.js'

test('远端地址只保留协议/主机/路径前缀', () => {
  assert.equal(normalizeRemoteUrl(''), '')
  assert.equal(normalizeRemoteUrl('   '), '')
  assert.equal(normalizeRemoteUrl('http://127.0.0.1:8790'), 'http://127.0.0.1:8790')
  assert.equal(normalizeRemoteUrl('http://127.0.0.1:8790/'), 'http://127.0.0.1:8790')
  assert.equal(normalizeRemoteUrl('https://rom.example.com/store///'), 'https://rom.example.com/store')
})

test('非法远端地址被拒绝', () => {
  for (const value of [
    'ftp://example.com',
    'file:///tmp/roms',
    'example.com:8790',
    'http://example.com/?token=1',
    'http://example.com/#x',
    '不是网址',
  ]) {
    assert.throws(() => normalizeRemoteUrl(value), /远端地址|只支持/, `应拒绝: ${value}`)
  }
})

test('远端密钥长度校验', () => {
  assert.equal(normalizeRemoteToken('  16-char-token!!!  '), '16-char-token!!!')
  assert.equal(normalizeRemoteToken('a'.repeat(64)), 'a'.repeat(64))
  assert.throws(() => normalizeRemoteToken('short'), /至少/)
  assert.throws(() => normalizeRemoteToken('x'.repeat(257)), /过长/)
})

// 「我的 ROM」与管理后台「全部 ROM」的状态筛选都能按存放位置筛：远端 / 本地两项，
// 本地按「不是 remote」判定（老记录没有 storage 字段，缺省就是本地）。
test('ROM 列表的状态筛选包含远端与本地两项', () => {
  const cases = [
    { path: 'frontend/src/views/MyRoms.vue', target: 'activeVisibility' },
    { path: 'frontend/src/views/Admin.vue', target: 'adminRomVisibility' },
  ]
  for (const { path, target } of cases) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(source, /\{ value: 'remote', label: '远端' \}/, `${path} 缺少「远端」选项`)
    assert.match(source, /\{ value: 'local', label: '本地' \}/, `${path} 缺少「本地」选项`)
    assert.match(
      source,
      new RegExp(`if \\(${target}\\.value === 'remote'\\) return rom\\.storage === 'remote'\\n\\s*if \\(${target}\\.value === 'local'\\) return rom\\.storage !== 'remote'`),
      `${path} 没有按 storage 过滤`,
    )
    assert.match(source, new RegExp(`watch\\(\\[[^\\]]*${target}[^\\]]*\\]`), `${path} 换状态后没有回到第一页`)
  }
})
