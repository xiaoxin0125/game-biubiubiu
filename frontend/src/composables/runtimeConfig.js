/*
 * 运行时配置（/api/runtime-config）的取用与续期。
 *
 * 服务端下发的 ICE 配置里可能带着一份会过期的临时 TURN 凭据（coturn 的
 * use-auth-secret 模式，见 server/runtime-config.js），所以这里除了取一次，
 * 还要在到期前主动重取：否则页面挂久了再建房就连不上中继。
 *
 * main.js 启动时调用一次；后台「站点设置」保存成功后也会调用一次，让新配的
 * STUN/TURN 立刻生效，同时拿回服务端重新签发的凭据。
 */

const TURN_REFRESH_MARGIN_MS = 5 * 60 * 1000
const TURN_REFRESH_MIN_DELAY_MS = 30 * 1000
const TURN_REFRESH_MAX_DELAY_MS = 30 * 60 * 1000

let refreshTimer = null

function turnCredentialExpiresAtMs() {
  const value = Number(window.__APP_CONFIG__?.WEBRTC_TURN_EXPIRES_AT)
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0
}

function scheduleConfigRefresh() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null }
  const expiresAtMs = turnCredentialExpiresAtMs()
  if (!expiresAtMs) return
  const delay = Math.min(
    Math.max(expiresAtMs - Date.now() - TURN_REFRESH_MARGIN_MS, TURN_REFRESH_MIN_DELAY_MS),
    TURN_REFRESH_MAX_DELAY_MS,
  )
  refreshTimer = setTimeout(() => { void loadRuntimeConfig() }, delay)
}

export async function loadRuntimeConfig() {
  // 快照旧值：拉取失败时保住已经生效的 ICE 配置，而不是清空成"没有 STUN"。
  const previous = window.__APP_CONFIG__
  try {
    const response = await fetch('/api/runtime-config', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const config = await response.json()
    window.__APP_CONFIG__ = Object.freeze(config && typeof config === 'object' ? config : {})
  } catch (error) {
    console.warn('[web] runtime config unavailable; STUN/TURN will remain unconfigured', error)
    if (!previous) window.__APP_CONFIG__ = Object.freeze({})
  }
  scheduleConfigRefresh()
}

// 从后台切回前台时补一次：浏览器会节流后台标签页的定时器，只靠上面的定时器
// 可能在"回到页面后才真正开始联机"的场景里晚一步。
function refreshConfigIfExpiring() {
  const expiresAtMs = turnCredentialExpiresAtMs()
  if (!expiresAtMs) return
  if (expiresAtMs - Date.now() > TURN_REFRESH_MARGIN_MS) return
  void loadRuntimeConfig()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshConfigIfExpiring()
})
