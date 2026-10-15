import { getSetting } from './routes/settings.js'
import { currentUser } from './middleware/auth.js'
import {
  STUN_SETTING_KEY,
  TURN_URLS_KEY,
  TURN_USERNAME_KEY,
  TURN_CREDENTIAL_KEY,
  TURN_SECRET_KEY,
  TURN_TTL_KEY,
  buildTurnCredentials,
  normalizeTurnTtl,
  TURN_CREDENTIAL_TTL_DEFAULT_SEC,
} from './webrtc-settings.js'
import { CORES_BASE_URL_KEY, CORES_REMOTE_ENABLED_KEY, effectiveCoresBaseUrl } from './cores-release.js'

/**
 * 核心资源基地址：后台的「开关 + 地址」两个设置决定，环境变量只作兜底。
 * 开关为关时不再看环境变量，否则"关掉远端"会被 .env 里的旧值重新打开。
 */
async function resolveCoresBaseUrl() {
  const allowInsecure = process.env.NODE_ENV !== 'production'
  const [savedBaseUrl, savedEnabled] = await Promise.all([
    getSetting(CORES_BASE_URL_KEY, ''),
    getSetting(CORES_REMOTE_ENABLED_KEY, ''),
  ])
  try {
    return effectiveCoresBaseUrl({
      savedBaseUrl,
      savedEnabled,
      fromEnv: process.env.VITE_CORES_BASE_URL,
      allowInsecure,
    })
  } catch (error) {
    console.warn('[runtime-config] 核心资源地址无效，已退回本机：', error.message)
    return ''
  }
}

function turnTtlSeconds(raw) {
  try {
    return Number(normalizeTurnTtl(raw)) || TURN_CREDENTIAL_TTL_DEFAULT_SEC
  } catch {
    return TURN_CREDENTIAL_TTL_DEFAULT_SEC
  }
}

/**
 * 下发给浏览器的 TURN 凭据。三种模式：
 *
 *   ephemeral —— 配了共享密钥（coturn 的 use-auth-secret / TURN REST API）：
 *                每次请求现签一份 `<过期时间戳>:<用户名>` + HMAC-SHA1 密码。
 *                密钥永远不出服务端，凭据到期自动作废，所以匿名访客也安全，
 *                观战（匿名进入公开房间）不需要登录。
 *   static    —— 没配密钥但填了静态用户名/密码：只发给已登录用户。匿名访客拿到
 *                静态密码没有任何收益（观战靠房主一侧的中继候选就能连通），却会
 *                被爬虫成批抓走 —— 这是 2026-10 审计里 H-1 的处置。
 *   login-required / none —— 没配地址或没配任何凭据：不下发用户名与密码，
 *                前端只用 STUN。
 */
async function resolveTurnCredentials(c, { turnUrls, turnUsername, turnCredential, turnSecret, turnTtl }) {
  if (!turnUrls) return { username: '', credential: '', mode: 'none', expiresAtSec: null }

  const secret = String(turnSecret || '').trim()
  if (secret) {
    try {
      const issued = buildTurnCredentials({ secret, ttlSec: turnTtlSeconds(turnTtl) })
      return { username: issued.username, credential: issued.credential, mode: 'ephemeral', expiresAtSec: issued.expiresAtSec }
    } catch (error) {
      console.warn('[runtime-config] 临时 TURN 凭据签发失败，本次不下发凭据：', error.message)
      return { username: '', credential: '', mode: 'none', expiresAtSec: null }
    }
  }

  if (!turnUsername || !turnCredential) {
    return { username: '', credential: '', mode: 'none', expiresAtSec: null }
  }

  const user = c ? await currentUser(c) : null
  if (!user) return { username: '', credential: '', mode: 'login-required', expiresAtSec: null }
  return { username: turnUsername, credential: turnCredential, mode: 'static', expiresAtSec: null }
}

// ICE 配置的来源优先级：后台「站点设置」保存的值 > 环境变量（老部署兜底）。
// 共享密钥只从后台设置读取，刻意不支持 VITE_* 环境变量：那批变量会随页面下发。
export async function getRuntimeConfig(c = null) {
  const [stunFromSettings, turnUrls, turnUsername, turnCredential, turnSecret, turnTtl, coresBaseUrl] = await Promise.all([
    getSetting(STUN_SETTING_KEY, ''),
    getSetting(TURN_URLS_KEY, ''),
    getSetting(TURN_USERNAME_KEY, ''),
    getSetting(TURN_CREDENTIAL_KEY, ''),
    getSetting(TURN_SECRET_KEY, ''),
    getSetting(TURN_TTL_KEY, ''),
    resolveCoresBaseUrl(),
  ])

  const resolvedTurnUrls = turnUrls || process.env.VITE_WEBRTC_TURN_URLS || ''
  const turn = await resolveTurnCredentials(c, {
    turnUrls: resolvedTurnUrls,
    turnUsername: turnUsername || process.env.VITE_WEBRTC_TURN_USERNAME || '',
    turnCredential: turnCredential || process.env.VITE_WEBRTC_TURN_CREDENTIAL || '',
    turnSecret,
    turnTtl,
  })

  return {
    WEBRTC_STUN_URLS: stunFromSettings || process.env.VITE_WEBRTC_STUN_URLS || '',
    WEBRTC_TURN_URLS: resolvedTurnUrls,
    WEBRTC_TURN_USERNAME: turn.username,
    WEBRTC_TURN_CREDENTIAL: turn.credential,
    // 凭据模式与到期时间：运维排查用，前端也据此在过期前重新拉一次配置（见 main.js）。
    WEBRTC_TURN_MODE: turn.mode,
    WEBRTC_TURN_EXPIRES_AT: turn.expiresAtSec ? String(turn.expiresAtSec) : '',
    WEBRTC_FORCE_RELAY: process.env.VITE_WEBRTC_FORCE_RELAY === '1' ? '1' : '0',
    WEBRTC_ICE_SERVERS: process.env.VITE_WEBRTC_ICE_SERVERS || '',
    // 空字符串 = 用主站 /api/cores；填了则是远端资源服务器的 协议://主机/前缀。
    CORES_BASE_URL: coresBaseUrl,
  }
}
