export const STUN_SETTING_KEY = 'webrtcStunUrls'
export const MAX_STUN_URLS_LENGTH = 2000

// STUN is optional. Store a canonical comma-separated list; never inject defaults.
export function normalizeStunUrls(value) {
  if (typeof value !== 'string') throw new Error('STUN 地址必须是字符串')
  if (value.length > MAX_STUN_URLS_LENGTH) throw new Error('STUN 地址总长度不能超过 2000 个字符')

  const urls = value.split(/[,\r\n]+/).map((url) => url.trim()).filter(Boolean)
  for (const url of urls) {
    const match = /^(?:stun|stuns):(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?$/.exec(url)
    if (!match || (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535))) {
      throw new Error('STUN 地址格式不正确，请使用 stun:主机:端口 或 stuns:主机:端口')
    }
  }
  return [...new Set(urls)].join(',')
}
