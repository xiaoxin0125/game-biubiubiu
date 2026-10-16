import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  REMOTE_FILE_PATH_PREFIX,
  isRemoteOnlyFilePath,
  localFallbackFilePath,
  pickRemoteMigrationCandidates,
  resolveReadableUploadPath,
} from '../server/storage.js'
import { streamUploadTimeoutMs } from '../server/remote-storage.js'

// 远端记录的 filePath 只有两种：本地副本路径，或历史遗留的 `remote:<id>` 占位值。
// 本地兜底（直连失败时读本地文件）完全依赖这两个判断不出错。
test('remote: 占位值与本地兜底路径互斥', () => {
  const marker = `${REMOTE_FILE_PATH_PREFIX}a1b2c3`
  assert.equal(marker, 'remote:a1b2c3')
  assert.equal(isRemoteOnlyFilePath(marker), true)
  assert.equal(localFallbackFilePath(marker), '')
  assert.equal(isRemoteOnlyFilePath('data/uploads/1/nes/game.nes'), false)
  assert.equal(localFallbackFilePath('data/uploads/1/nes/game.nes'), 'data/uploads/1/nes/game.nes')
  assert.equal(isRemoteOnlyFilePath(''), false)
  assert.equal(localFallbackFilePath(''), '')
  assert.equal(localFallbackFilePath(null), '')
})

test('迁移候选：只挑本地存储且还有本地文件的记录，大的先来', () => {
  const rows = [
    { id: 1, storage: 'local', filePath: 'data/uploads/1/nes/a.nes', fileSize: 1024 },
    // 已经是远端存储（迁移过的）：跳过，重复执行不会重复上传
    { id: 2, storage: 'remote', filePath: 'data/uploads/1/nes/b.nes', fileSize: 2048 },
    // 远端且没有本地副本（上传时就选了远端）：没有文件可搬
    { id: 3, storage: 'local', filePath: 'remote:deadbeef', fileSize: 4096 },
    { id: 4, storage: 'local', filePath: 'data/uploads/1/snes/c.sfc', fileSize: 8192 },
    // storage 为空按 local 处理（历史数据）
    { id: 5, storage: '', filePath: 'data/uploads/1/gba/d.gba', fileSize: 512 },
  ]
  assert.deepEqual(pickRemoteMigrationCandidates(rows).map((row) => row.id), [4, 1, 5])
  assert.deepEqual(pickRemoteMigrationCandidates(null), [])
  assert.deepEqual(pickRemoteMigrationCandidates([]), [])
})

test('resolveReadableUploadPath 拒绝占位值、空值与目录外路径', () => {
  assert.throws(() => resolveReadableUploadPath('remote:abc'), /upload-file-not-found/)
  assert.throws(() => resolveReadableUploadPath(''), /upload-file-not-found/)
  assert.throws(() => resolveReadableUploadPath(null), /upload-file-not-found/)
  assert.throws(() => resolveReadableUploadPath('/etc/passwd'), /upload-file-not-found/)
  assert.throws(() => resolveReadableUploadPath('../../etc/passwd'), /upload-file-not-found/)
  assert.throws(() => resolveReadableUploadPath('data/uploads-malicious/x.nes'), /upload-file-not-found/)
})

test('流式上传超时按体积放宽，且不低于 10 分钟', () => {
  const tenMinutes = 10 * 60 * 1000
  assert.equal(streamUploadTimeoutMs(0), tenMinutes)
  assert.equal(streamUploadTimeoutMs(1024), tenMinutes)
  assert.equal(streamUploadTimeoutMs(50 * 1024 * 1024), tenMinutes)
  // 1GB：按每 MiB 2 秒给预算
  assert.equal(streamUploadTimeoutMs(1024 * 1024 * 1024), 1024 * 2000)
})
