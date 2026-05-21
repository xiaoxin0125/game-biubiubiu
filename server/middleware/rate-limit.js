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

function clientIp(c) {
  return c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || c.req.header('x-real-ip')
    || 'unknown'
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