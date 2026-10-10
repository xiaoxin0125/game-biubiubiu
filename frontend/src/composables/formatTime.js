// 界面上的时间统一按服务器所在时区（Asia/Shanghai）显示。
//
// 接口返回的是 ISO 时间串，浏览器默认按「访问者设备的时区」渲染：手机或电脑设成
// 别的时区时，看到的时间就和服务器对不上。这里显式指定时区，保证所有访问者看到
// 同一个时间。
const SERVER_TIME_ZONE = 'Asia/Shanghai'

const shortFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SERVER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const fullFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SERVER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const yearFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SERVER_TIME_ZONE,
  year: 'numeric',
})

function toDate(value) {
  if (value == null) return null
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// 列表用：今年的记录不显示年份（10/09 17:31），往年的带上（2025/10/09 17:31）。
export function formatServerTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  const [date, time] = shortFormatter.format(d).split(' ')
  return yearFormatter.format(d) === yearFormatter.format(new Date())
    ? `${date.slice(5)} ${time}`
    : `${date} ${time}`
}

// 详情用：完整到秒（2026/10/10 09:28:09）。
export function formatServerDateTime(value) {
  const d = toDate(value)
  return d ? fullFormatter.format(d) : '—'
}
