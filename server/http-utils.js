/*
 * 条件请求（HTTP 缓存校验）的小工具。
 *
 * BIOS 这类"登录后才能读、但内容几乎不变"的资源用得上：先给响应打一个由
 * 体积+mtime 组成的 ETag，客户端下一次带上 If-None-Match，如果没变就只回
 * 304 响应头，不再重复传文件本体。
 */

/** 由文件体积与修改时间生成强 ETag（内容变了就一定变）。 */
export function entityTagFor(size, mtimeMs) {
  const sizeHex = Math.max(0, Math.trunc(Number(size) || 0)).toString(16)
  const mtimeHex = Math.max(0, Math.floor(Number(mtimeMs) || 0)).toString(16)
  return `"${sizeHex}-${mtimeHex}"`
}

/** If-None-Match 是否命中指定 ETag：支持 `*`、逗号列表和 W/ 弱标记前缀。 */
export function ifNoneMatchMatches(header, etag) {
  const raw = String(header || '').trim()
  if (!raw) return false
  if (raw === '*') return true
  const target = String(etag || '').replace(/^W\//, '')
  if (!target) return false
  return raw.split(',').some((part) => part.trim().replace(/^W\//, '') === target)
}
