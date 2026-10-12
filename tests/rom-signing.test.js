import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import {
  DIRECT_URL_PURPOSE,
  DIRECT_URL_TTL_SEC,
  buildRemoteDownloadUrl,
  normalizeRemoteDownloadSecret,
  normalizeRemoteDownloadUrl,
  signRemoteDownloadUrl,
  verifyRemoteDownloadUrl,
} from '../server/remote-storage.js'
import { entityTagFor, ifNoneMatchMatches } from '../server/http-utils.js'

const SECRET = 'download-secret-0123456789'
const FILE_ID = 'a'.repeat(32) || '0123456789abcdef0123456789abcdef'

// 远端 rom-upload（Node 与 PHP 两版）用的就是这个表达式；主站签名必须与它逐字节
// 一致，否则浏览器会收到 403。这里直接独立算一遍，避免两处同时写错还互相"验证通过"。
function remoteExpectedSignature(id, exp, secret = SECRET) {
  return createHmac('sha256', secret).update(`${DIRECT_URL_PURPOSE}.${id}.${exp}`).digest('hex')
}

test('直连签名与远端实现使用同一套算法', () => {
  const exp = Math.floor(Date.now() / 1000) + 600
  const sig = signRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp })
  assert.equal(sig, remoteExpectedSignature(FILE_ID, exp))
  assert.match(sig, /^[a-f0-9]{64}$/)
})

test('校验：正常签名通过，过期/篡改/错密钥一律拒绝', () => {
  const now = Date.now()
  const exp = Math.floor(now / 1000) + 300
  const sig = signRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp })

  assert.equal(verifyRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp, sig, now }).ok, true)

  // 过期（超过允许的对表误差）
  const expiredExp = Math.floor(now / 1000) - 120
  assert.equal(verifyRemoteDownloadUrl({
    secret: SECRET,
    fileId: FILE_ID,
    exp: expiredExp,
    sig: signRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp: expiredExp }),
    now,
  }).ok, false)

  // 过期时间被改到很远：不能靠改 exp 换永久链接
  const farExp = Math.floor(now / 1000) + 86400
  assert.equal(verifyRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp: farExp, sig, now }).ok, false)
  // 篡改文件 id / 签名 / 换密钥
  assert.equal(verifyRemoteDownloadUrl({ secret: SECRET, fileId: 'b'.repeat(32), exp, sig, now }).ok, false)
  assert.equal(verifyRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp, sig: 'f'.repeat(64), now }).ok, false)
  assert.equal(verifyRemoteDownloadUrl({ secret: 'other-secret-012345678', fileId: FILE_ID, exp, sig, now }).ok, false)
  // 长度不同的签名不会让比较函数抛异常，只是不通过
  assert.equal(verifyRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp, sig: 'abc', now }).ok, false)
  assert.equal(verifyRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp: 'NaN', sig, now }).ok, false)
})

test('直连地址：签名参数进 URL、地址必须 https、密钥要与上传密钥分开', () => {
  assert.equal(normalizeRemoteDownloadUrl(''), '')
  assert.equal(normalizeRemoteDownloadUrl('https://rom.example.com///'), 'https://rom.example.com')
  assert.throws(() => normalizeRemoteDownloadUrl('http://rom.example.com'), /https/)
  assert.equal(normalizeRemoteDownloadUrl('http://127.0.0.1:8790', { allowInsecure: true }), 'http://127.0.0.1:8790')
  assert.throws(() => normalizeRemoteDownloadUrl('https://rom.example.com/?a=1'), /查询参数/)

  assert.equal(normalizeRemoteDownloadSecret(''), '')
  assert.equal(normalizeRemoteDownloadSecret('  download-secret-0123456789  '), SECRET)
  assert.throws(() => normalizeRemoteDownloadSecret('short'), /至少/)
  assert.throws(() => normalizeRemoteDownloadSecret('x'.repeat(257)), /过长/)
})

test('buildRemoteDownloadUrl 在没有文件 id 时直接放弃（不碰数据库）', async () => {
  // 关键约束：任何一步缺失（没配地址、没配密钥、没开开关、记录没有远端 id）都必须
  // 返回 null，让调用方继续走本机代理，而不是把播放打挂。
  assert.equal(await buildRemoteDownloadUrl(''), null)
  assert.equal(await buildRemoteDownloadUrl(null), null)
  assert.equal(await buildRemoteDownloadUrl(undefined), null)
})

test('签名有效期是短期的，不是长期公开链接', () => {
  assert.equal(DIRECT_URL_TTL_SEC, 600)
  const now = Date.now()
  const exp = Math.floor(now / 1000) + DIRECT_URL_TTL_SEC
  // 刚好在有效期内
  assert.equal(verifyRemoteDownloadUrl({
    secret: SECRET,
    fileId: FILE_ID,
    exp,
    sig: signRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp }),
    now,
  }).ok, true)
  // 超过 TTL + 容差就不接受（防止有人把 exp 往未来推）
  const tooFar = exp + 61
  assert.equal(verifyRemoteDownloadUrl({
    secret: SECRET,
    fileId: FILE_ID,
    exp: tooFar,
    sig: signRemoteDownloadUrl({ secret: SECRET, fileId: FILE_ID, exp: tooFar }),
    now,
  }).ok, false)
})

test('BIOS 条件缓存：ETag 随体积/时间变化，If-None-Match 支持列表与弱标记', () => {
  const a = entityTagFor(1859335, 1700000000000)
  const b = entityTagFor(1859335, 1700000000000)
  const changed = entityTagFor(1859335, 1700000000001)
  assert.equal(a, b)
  assert.notEqual(a, changed)
  assert.match(a, /^"[0-9a-f]+-[0-9a-f]+"$/)

  assert.equal(ifNoneMatchMatches(undefined, a), false)
  assert.equal(ifNoneMatchMatches('', a), false)
  assert.equal(ifNoneMatchMatches('*', a), true)
  assert.equal(ifNoneMatchMatches(a, a), true)
  assert.equal(ifNoneMatchMatches(`W/${a}`, a), true)
  assert.equal(ifNoneMatchMatches(`"other", ${a}`, a), true)
  assert.equal(ifNoneMatchMatches('"other"', a), false)
  assert.equal(ifNoneMatchMatches(a, ''), false)
})
