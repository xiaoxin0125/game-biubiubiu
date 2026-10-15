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

/*
 * 列表接口的窗口参数。
 *
 * 列表接口原先一律返回全量：站点一热闹，响应体就跟着记录数线性涨（房间表还只增
 * 不减），既费带宽也费内存（2026-10 审计 M-4 的延伸）。
 *
 * 这里的默认值与上限都取 500：默认就等于上限，是为了不让现有前端（它拿全量在
 * 客户端分页）在数据变多后悄悄少显示几百条 —— 真要截断时，响应里的 `total` 与
 * `hasMore` 能看出来。调用方把 limit/offset 直接喂给 SQL 的 limit/offset 即可。
 */
export const LIST_LIMIT_DEFAULT = 500
export const LIST_LIMIT_MAX = 500

export function parseListWindow(c, { defaultLimit = LIST_LIMIT_DEFAULT, maxLimit = LIST_LIMIT_MAX } = {}) {
  const rawLimit = Number(c.req.query('limit'))
  const rawOffset = Number(c.req.query('offset'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.trunc(rawLimit), maxLimit)
    : defaultLimit
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0
  return { limit, offset }
}

/** 列表响应的统一包装：总是带上 total / limit / offset / hasMore。 */
export function listPage(items, { total, limit, offset }) {
  const size = Number(total ?? items.length)
  return {
    total: size,
    limit,
    offset,
    hasMore: offset + items.length < size,
    count: items.length,
  }
}

