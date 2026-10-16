import { clientIp } from './security.js'

const buckets = new Map()

function consumeBucket(bucketKey, { windowMs = 60_000, max = 60 } = {}) {
  const now = Date.now()
  const current = buckets.get(bucketKey)

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(bucketKey, { count: 1, resetAt })
    return { ok: true, remaining: Math.max(0, max - 1), resetAt, retryAfter: 0 }
  }

  current.count += 1
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  return {
    ok: current.count <= max,
    remaining: Math.max(0, max - current.count),
    resetAt: current.resetAt,
    retryAfter,
  }
}

export function consumeRateLimit(key, options = {}) {
  return consumeBucket(String(key || 'unknown'), options)
}

/**
 * 只读地看一眼某个计数桶，不消耗配额。
 *
 * 给"只在失败时计数"的场景用（例如房间密码：输对不该占用尝试次数，输错才累加）。
 * 判定口径与 consumeBucket 一致：已经用掉 count 次时，还能不能再来一次看
 * count < max —— 也就是"失败满 max 次之后的下一次会被挡住"。
 */
export function peekRateLimit(key, { windowMs = 60_000, max = 60 } = {}) {
  const bucket = buckets.get(String(key || 'unknown'))
  const now = Date.now()
  if (!bucket || bucket.resetAt <= now) {
    // 窗口已过（或还没开始）：下一次消费会重开一个桶，所以现在放行。
    return { ok: true, remaining: max, retryAfter: 0, resetAt: now + windowMs }
  }
  const ok = bucket.count < max
  return {
    ok,
    remaining: Math.max(0, max - bucket.count),
    retryAfter: ok ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    resetAt: bucket.resetAt,
  }
}

export function rateLimit({ name = 'default', windowMs = 60_000, max = 60, key } = {}) {
  return async (c, next) => {
    const now = Date.now()
    const bucketKey = `${name}:${key ? key(c) : clientIp(c)}`
    const current = buckets.get(bucketKey)

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
      await next()
      return
    }

    current.count += 1
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: '请求过于频繁，请稍后再试' }, 429)
    }

    await next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, 60_000).unref?.()