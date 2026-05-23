import { relative, isAbsolute } from 'node:path'

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

export function clientIp(c) {
  return forwardedValue(c, 'x-forwarded-for')
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

export function securityHeaders() {
  return async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    c.header('X-Frame-Options', 'DENY')
    if (isSecureRequest(c)) {
      c.header('Cross-Origin-Opener-Policy', 'same-origin')
    }
    c.header('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
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