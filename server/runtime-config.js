import { getSetting } from './routes/settings.js'
import { STUN_SETTING_KEY, TURN_URLS_KEY, TURN_USERNAME_KEY, TURN_CREDENTIAL_KEY } from './webrtc-settings.js'
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

// ICE 配置的来源优先级：后台「站点设置」保存的值 > 环境变量（老部署兜底）。
export async function getRuntimeConfig() {
  const [stunFromSettings, turnUrls, turnUsername, turnCredential, coresBaseUrl] = await Promise.all([
    getSetting(STUN_SETTING_KEY, ''),
    getSetting(TURN_URLS_KEY, ''),
    getSetting(TURN_USERNAME_KEY, ''),
    getSetting(TURN_CREDENTIAL_KEY, ''),
    resolveCoresBaseUrl(),
  ])
  return {
    WEBRTC_STUN_URLS: stunFromSettings || process.env.VITE_WEBRTC_STUN_URLS || '',
    WEBRTC_TURN_URLS: turnUrls || process.env.VITE_WEBRTC_TURN_URLS || '',
    WEBRTC_TURN_USERNAME: turnUsername || process.env.VITE_WEBRTC_TURN_USERNAME || '',
    WEBRTC_TURN_CREDENTIAL: turnCredential || process.env.VITE_WEBRTC_TURN_CREDENTIAL || '',
    WEBRTC_FORCE_RELAY: process.env.VITE_WEBRTC_FORCE_RELAY === '1' ? '1' : '0',
    WEBRTC_ICE_SERVERS: process.env.VITE_WEBRTC_ICE_SERVERS || '',
    // 空字符串 = 用主站 /api/cores；填了则是远端资源服务器的 协议://主机/前缀。
    CORES_BASE_URL: coresBaseUrl,
  }
}
