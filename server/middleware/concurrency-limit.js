/*
 * 进程内并发闸门：同一时刻只放行 N 个请求进入被保护的处理器，多出来的立刻返回
 * 429（带 Retry-After）。
 *
 * 用在"一个请求就要在内存里放几十 MB"的上传接口上：单请求的体积由 hono 的
 * bodyLimit 兜住，这里的闸门兜住"同时来好几个"——否则 N 个并发上传就是 N 倍内存
 * （2026-10 审计 M-1）。它是进程内的计数，多实例部署时要换成分布式信号量。
 */

export function createConcurrencyLimiter({
  name = 'default',
  max = 2,
  retryAfterSec = 5,
  busyMessage = '当前上传任务较多，请稍后重试',
} = {}) {
  const limit = Math.max(1, Math.trunc(Number(max) || 1))
  let active = 0
  let peak = 0
  let rejected = 0

  async function middleware(c, next) {
    if (active >= limit) {
      rejected += 1
      c.header('Retry-After', String(Math.max(1, Math.trunc(retryAfterSec) || 1)))
      return c.json({ error: busyMessage }, 429)
    }
    active += 1
    if (active > peak) peak = active
    try {
      await next()
    } finally {
      active -= 1
    }
  }

  return {
    name,
    limit,
    middleware,
    // 便于测试与运维观察（不对外暴露接口）
    stats: () => ({ active, peak, rejected, limit }),
  }
}

const UPLOAD_CONCURRENCY_DEFAULT = 2

/** 上传闸门的默认实例：上限可用 UPLOAD_CONCURRENCY 覆盖。 */
export const uploadConcurrency = createConcurrencyLimiter({
  name: 'rom-upload',
  max: Number(process.env.UPLOAD_CONCURRENCY) || UPLOAD_CONCURRENCY_DEFAULT,
})
