const TRUST_PROXY_VALUES = new Set(['1', 'true', 'yes', 'on'])
const trustProxy = TRUST_PROXY_VALUES.has(String(process.env.TRUST_PROXY || '').toLowerCase())
const isProduction = process.env.NODE_ENV === 'production'

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function parseAllowedOrigins() {
  return String(process.env.CSRF_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function forwardedValue(c, header) {
  if (!trustProxy) return null
  return c.req.header(header)?.split(',')[0]?.trim() || null
}

// X-Forwarded-For 取最后一段：那是"离我们最近的一跳"（可信反代）写进去的地址。
// 取第一段会被客户端自带的假地址顶掉 —— `$proxy_add_x_forwarded_for` 这类常见配置
// 会把客户端原样传来的 XFF 追加到前面，第一段完全由攻击者控制，限流与审计都会
// 跟着失效（2026-10 审计 M-7）。协议头 X-Forwarded-Proto 相反，仍取第一段：
// 那才是客户端到边缘那一跳的原始协议。
function lastForwardedValue(c, header) {
  if (!trustProxy) return null
  const parts = String(c.req.header(header) || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parts.length ? parts[parts.length - 1] : null
}

export function clientIp(c) {
  return lastForwardedValue(c, 'x-forwarded-for')
    || (trustProxy ? c.req.header('x-real-ip') : null)
    || 'unknown'
}

export function isSecureRequest(c) {
  const forwardedProto = forwardedValue(c, 'x-forwarded-proto')?.toLowerCase()
  if (forwardedProto) return forwardedProto === 'https'
  const forwardedSsl = trustProxy ? c.req.header('x-forwarded-ssl')?.toLowerCase() : null
  if (forwardedSsl === 'on') return true
  const url = new URL(c.req.url)
  return url.protocol === 'https:'
}

function requestOrigin(c) {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

function originAllowed(c, origin) {
  if (!origin) return !isProduction || process.env.CSRF_REQUIRE_ORIGIN === '0'
  const allowed = new Set([requestOrigin(c), ...parseAllowedOrigins()])
  return allowed.has(origin)
}

// The player embeds the J2ME runtime page (`public/j2me/main.html`) in a
// same-origin iframe: that one path has to stay frameable by this site, while
// every other response keeps refusing to be framed at all. (Without this the
// runtime page, when the app server serves the frontend build, is rejected by
// the browser with "Refused to load" / sandbox access errors.)
function framePolicy(pathname) {
  return pathname.startsWith('/j2me/')
    ? { xFrameOptions: 'SAMEORIGIN', frameAncestors: "frame-ancestors 'self'" }
    : { xFrameOptions: 'DENY', frameAncestors: "frame-ancestors 'none'" }
}

export function securityHeaders() {
  return async (c, next) => {
    await next()
    const policy = framePolicy(new URL(c.req.url).pathname)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    c.header('X-Frame-Options', policy.xFrameOptions)
    if (isSecureRequest(c)) {
      c.header('Cross-Origin-Opener-Policy', 'same-origin')
    }
    c.header('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      policy.frameAncestors,
      "form-action 'self'",
      "script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: blob:",
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
    ].join('; '))
    if (isSecureRequest(c) && isProduction) {
      c.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }
  }
}

export function csrfProtection() {
  return async (c, next) => {
    const method = c.req.method.toUpperCase()
    if (unsafeMethods.has(method)) {
      const origin = c.req.header('origin') || ''
      if (!originAllowed(c, origin)) {
        return c.json({ error: 'forbidden origin' }, 403)
      }
    }
    await next()
  }
}