// 数据库里的时间统一存「服务器本地时间」Asia/Shanghai（UTC+08:00）的墙钟值，
// 不是 UTC。三层都必须在同一个时区上，否则每处时间都会差 8 小时：
//
//   1. MySQL 自己：列的默认值 `DEFAULT (now())` 以及 TIMESTAMP 的读写换算都跟
//      会话时区走 —— server/db/index.js 建连接时会话时区被钉到 +08:00。
//   2. mysql2：裸 pool.query 的 Date ⇄ 字符串换算 —— 靠连接参数 timezone。
//   3. drizzle-orm：它内置的 timestamp() 默认按 UTC 处理
//      （mapFromDriverValue 给值补 "+0000"，mapToDriverValue 用 toISOString()），
//      所以 server/db/schema.js 用下面的函数自定义了列类型。
//
// 踩过的坑：以前 drizzle 写 UTC 墙钟、列默认值写 +08:00，同一张表里混着两个钟，
// 于是接口返回的时间既不是服务器时间也不是上海时间。
export const DB_TIMEZONE = '+08:00'

const DB_OFFSET_MINUTES = 8 * 60
const DB_OFFSET_MS = DB_OFFSET_MINUTES * 60 * 1000
const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/

// MySQL 返回的 'YYYY-MM-DD HH:MM:SS[.fff]' → Date；按上面的时区解释。
export function parseDbTime(value) {
  if (value == null) return value
  if (value instanceof Date) return value
  const text = String(value).trim()
  if (!text) return null
  if (OFFSET_SUFFIX.test(text)) return new Date(text)
  const iso = text.length <= 10 ? `${text}T00:00:00` : text.replace(' ', 'T')
  const parsed = new Date(`${iso}${DB_TIMEZONE}`)
  return Number.isNaN(parsed.getTime()) ? new Date(text) : parsed
}

// Date → MySQL 的 'YYYY-MM-DD HH:MM:SS'（同上时区，精确到秒，和 TIMESTAMP 列一致）。
export function formatDbTime(value) {
  const shifted = new Date(value.getTime() + DB_OFFSET_MS)
  return shifted.toISOString().slice(0, 19).replace('T', ' ')
}
