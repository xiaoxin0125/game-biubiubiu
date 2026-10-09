import { getSetting } from './routes/settings.js'
import { STUN_SETTING_KEY } from './webrtc-settings.js'

export async function getRuntimeConfig() {
  // STUN comes from Admin > Site settings. The environment variable stays as a
  // fallback so existing Compose/config-file deployments keep working.
  const stunFromSettings = await getSetting(STUN_SETTING_KEY, '')
  return {
    WEBRTC_STUN_URLS: stunFromSettings || process.env.VITE_WEBRTC_STUN_URLS || '',
    WEBRTC_TURN_URLS: process.env.VITE_WEBRTC_TURN_URLS || '',
    WEBRTC_TURN_USERNAME: process.env.VITE_WEBRTC_TURN_USERNAME || '',
    WEBRTC_TURN_CREDENTIAL: process.env.VITE_WEBRTC_TURN_CREDENTIAL || '',
    WEBRTC_FORCE_RELAY: process.env.VITE_WEBRTC_FORCE_RELAY === '1' ? '1' : '0',
    WEBRTC_ICE_SERVERS: process.env.VITE_WEBRTC_ICE_SERVERS || '',
  }
}
