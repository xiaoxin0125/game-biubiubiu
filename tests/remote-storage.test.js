import assert from 'node:assert/strict'
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
