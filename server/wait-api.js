const target = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000'
const healthUrl = new URL('/api/settings', target)
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS || 15000)
const intervalMs = Number(process.env.API_WAIT_INTERVAL_MS || 250)
const requestTimeoutMs = Number(process.env.API_WAIT_REQUEST_TIMEOUT_MS || 1000)
const startedAt = Date.now()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ping() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const res = await fetch(healthUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function wait() {
  while (Date.now() - startedAt < timeoutMs) {
    if (await ping()) {
      console.log(`[dev] api ready: ${target}`)
      return
    }
    await sleep(intervalMs)
  }
  console.error(`[dev] api not ready after ${timeoutMs}ms: ${target}`)
  process.exit(1)
}

wait()