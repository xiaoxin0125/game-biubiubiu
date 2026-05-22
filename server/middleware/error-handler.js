export function installErrorHandler(app) {
  app.onError((err, c) => {
    const requestId = c.req.header('x-request-id') || crypto.randomUUID()
    console.error('[api] request failed', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      error: err?.stack || err?.message || String(err),
    })
    c.header('X-Request-Id', requestId)
    return c.json({ error: 'internal server error', requestId }, 500)
  })
}

export function requestId() {
  return async (c, next) => {
    const id = c.req.header('x-request-id') || crypto.randomUUID()
    c.set('requestId', id)
    c.header('X-Request-Id', id)
    await next()
  }
}