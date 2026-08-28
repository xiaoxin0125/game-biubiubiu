const DEFAULT_STUN_URLS = 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478'

export function getRuntimeConfig() {
  return {
    WEBRTC_STUN_URLS: process.env.VITE_WEBRTC_STUN_URLS || DEFAULT_STUN_URLS,
    WEBRTC_TURN_URLS: process.env.VITE_WEBRTC_TURN_URLS || '',
    WEBRTC_TURN_USERNAME: process.env.VITE_WEBRTC_TURN_USERNAME || '',
    WEBRTC_TURN_CREDENTIAL: process.env.VITE_WEBRTC_TURN_CREDENTIAL || '',
    WEBRTC_FORCE_RELAY: process.env.VITE_WEBRTC_FORCE_RELAY === '1' ? '1' : '0',
    WEBRTC_ICE_SERVERS: process.env.VITE_WEBRTC_ICE_SERVERS || '',
  }
}