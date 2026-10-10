import { getSetting } from './routes/settings.js'
import { STUN_SETTING_KEY, TURN_URLS_KEY, TURN_USERNAME_KEY, TURN_CREDENTIAL_KEY } from './webrtc-settings.js'

// ICE 配置的来源优先级：后台「站点设置」保存的值 > 环境变量（老部署兜底）。
export async function getRuntimeConfig() {
  const [stunFromSettings, turnUrls, turnUsername, turnCredential] = await Promise.all([
    getSetting(STUN_SETTING_KEY, ''),
    getSetting(TURN_URLS_KEY, ''),
    getSetting(TURN_USERNAME_KEY, ''),
    getSetting(TURN_CREDENTIAL_KEY, ''),
  ])
  return {
    WEBRTC_STUN_URLS: stunFromSettings || process.env.VITE_WEBRTC_STUN_URLS || '',
    WEBRTC_TURN_URLS: turnUrls || process.env.VITE_WEBRTC_TURN_URLS || '',
    WEBRTC_TURN_USERNAME: turnUsername || process.env.VITE_WEBRTC_TURN_USERNAME || '',
    WEBRTC_TURN_CREDENTIAL: turnCredential || process.env.VITE_WEBRTC_TURN_CREDENTIAL || '',
    WEBRTC_FORCE_RELAY: process.env.VITE_WEBRTC_FORCE_RELAY === '1' ? '1' : '0',
    WEBRTC_ICE_SERVERS: process.env.VITE_WEBRTC_ICE_SERVERS || '',
  }
}
