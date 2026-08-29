import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { parseEnv } from 'node:util'

const CONFIGURABLE_KEYS = new Set([
  'PORT',
  'NODE_ENV',
  'DATABASE_URL',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'TRUST_PROXY',
  'CSRF_ALLOWED_ORIGINS',
  'CSRF_REQUIRE_ORIGIN',
  'MAX_UPLOAD_BYTES',
  'MAX_STATE_BYTES',
  'USER_UPLOAD_QUOTA_BYTES',
  'MAX_SAVE_SLOT',
  'UPLOADS_DIR',
  'BIOS_DIR',
  'SAVES_DIR',
  'CORES_DIR',
  'VITE_API_TARGET',
  'API_WAIT_TIMEOUT_MS',
  'API_WAIT_INTERVAL_MS',
  'API_WAIT_REQUEST_TIMEOUT_MS',
  'SQLITE_DB',
  'LEGACY_UPLOADS_DIR',
  'IMPORT_TRUNCATE',
  'VITE_WEBRTC_STUN_URLS',
  'VITE_WEBRTC_TURN_URLS',
  'VITE_WEBRTC_TURN_USERNAME',
  'VITE_WEBRTC_TURN_CREDENTIAL',
  'VITE_WEBRTC_FORCE_RELAY',
  'VITE_WEBRTC_ICE_SERVERS',
])

function stringifyConfigValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function readConfigFile(filePath) {
  const contents = readFileSync(filePath, 'utf8')
  if (extname(filePath).toLowerCase() === '.json') {
    const parsed = JSON.parse(contents)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON config must contain an object')
    }
    return parsed
  }
  return parseEnv(contents)
}

export function loadConfigFile() {
  const configuredPath = String(process.env.APP_CONFIG_FILE || '').trim()
  const candidates = configuredPath
    ? [resolve(configuredPath)]
    : [resolve('config/.env'), resolve('config/app.env'), resolve('config/app.json')]
  const filePath = candidates.find((candidate) => existsSync(candidate))

  if (!filePath) {
    if (configuredPath) {
      throw new Error(`APP_CONFIG_FILE does not exist: ${candidates[0]}`)
    }
    return
  }

  const values = readConfigFile(filePath)
  let loaded = 0

  for (const [key, rawValue] of Object.entries(values)) {
    if (!CONFIGURABLE_KEYS.has(key)) continue
    const value = stringifyConfigValue(rawValue)
    if (value === null) continue
    process.env[key] = value
    loaded += 1
  }

  console.log(`[config] loaded ${loaded} value(s) from ${filePath}`)
}

loadConfigFile()