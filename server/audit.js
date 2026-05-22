import { db } from './db/index.js'
import { auditLogs } from './db/schema.js'
import { clientIp } from './middleware/security.js'

const MAX_METADATA_CHARS = 4000

function redact(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redact)
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret|cookie|hash/i.test(key)) out[key] = '[redacted]'
    else out[key] = redact(item)
  }
  return out
}

function metadataToString(metadata) {
  if (!metadata) return null
  try {
    return JSON.stringify(redact(metadata)).slice(0, MAX_METADATA_CHARS)
  } catch {
    return JSON.stringify({ note: 'metadata-unserializable' })
  }
}

export async function audit(c, { action, targetType = null, targetId = null, metadata = null, actor = undefined } = {}) {
  if (!action) return
  try {
    const user = actor === undefined ? c.get?.('user') : actor
    await db.insert(auditLogs).values({
      actorUserId: user?.id ?? null,
      actorUsername: user?.username ?? null,
      action,
      targetType,
      targetId: targetId == null ? null : String(targetId),
      ip: clientIp(c),
      userAgent: (c.req.header('user-agent') || '').slice(0, 512),
      metadata: metadataToString(metadata),
    })
  } catch (err) {
    console.error('[audit] failed to write audit log', err)
  }
}