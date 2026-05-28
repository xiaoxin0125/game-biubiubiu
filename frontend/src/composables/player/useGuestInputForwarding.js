import { computed } from 'vue'
import { REMOTE_PLAYER_KEY_MAPS, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS, effectiveKeyboardForPlayer, normalizeKeyboardEventKey } from '../useInputMapping.js'
import { dispatchKeyboardEvent } from '../dispatchKeyboardEvent.js'

const remoteTurboLoops = new Map()

export function dispatchPlayerButton(playerIndex, action, button, keyMap = null, controls = null) {
  const turboTarget = TURBO_BUTTON_TARGETS[button]
  if (turboTarget) {
    dispatchPlayerTurboButton(playerIndex, action, button, turboTarget, keyMap, controls)
    return
  }
  if (controls?.pressButton && controls?.releaseButton) {
    if (action === 'down') controls.pressButton(button, playerIndex)
    else controls.releaseButton(button, playerIndex)
    return
  }
  const eventType = action === 'down' ? 'keydown' : 'keyup'
  const mappedKey = (keyMap || REMOTE_PLAYER_KEY_MAPS[playerIndex])?.[button]
  if (mappedKey) dispatchKeyboardEvent(eventType, mappedKey, { internal: true })
}

function dispatchPlayerTurboButton(playerIndex, action, button, targetButton, keyMap = null, controls = null) {
  const loopKey = `${playerIndex}:${button}`
  const mappedKey = (keyMap || REMOTE_PLAYER_KEY_MAPS[playerIndex])?.[targetButton]
  if (!mappedKey && !(controls?.pressButton && controls?.releaseButton)) return

  const press = () => {
    if (controls?.pressButton) controls.pressButton(targetButton, playerIndex)
    else dispatchKeyboardEvent('keydown', mappedKey, { internal: true })
  }
  const release = () => {
    if (controls?.releaseButton) controls.releaseButton(targetButton, playerIndex)
    else dispatchKeyboardEvent('keyup', mappedKey, { internal: true })
  }

  if (action === 'down') {
    if (remoteTurboLoops.has(loopKey)) return
    let down = true
    press()
    const loop = setInterval(() => {
      down = !down
      if (down) press()
      else release()
    }, TURBO_FIRE_MS)
    remoteTurboLoops.set(loopKey, loop)
    return
  }

  const loop = remoteTurboLoops.get(loopKey)
  if (loop) {
    clearInterval(loop)
    remoteTurboLoops.delete(loopKey)
  }
  release()
}

export function useGuestInputForwarding({ mapping, platform, platformButtons, roomRtc, isRoomMode, localPeer, isGuestMode, canLocalControl, keyboardPlayer = null }) {
  const reverseKeyMap = computed(() => {
    const player = Number(typeof keyboardPlayer === 'function' ? keyboardPlayer() : keyboardPlayer) || 1
    const cfg = effectiveKeyboardForPlayer(mapping.value, player, platform?.value || null)
    const allowed = platformButtons?.value ? new Set(platformButtons.value) : null
    const out = {}
    for (const [btn, key] of Object.entries(cfg)) {
      if (allowed && !allowed.has(btn)) continue
      out[key] = btn
    }
    return out
  })

  function guestKeyHandler(e) {
    const rtc = roomRtc()
    if (!rtc || !localPeer.value || localPeer.value.isHost) return
    if (!canLocalControl.value) {
      if (isGuestMode.value) e.preventDefault()
      return
    }
    const button = reverseKeyMap.value[normalizeKeyboardEventKey(e)]
    if (!button) return
    e.preventDefault()
    rtc.sendData({ type: 'input', action: e.type === 'keydown' ? 'down' : 'up', button })
  }

  function guestButtonInterceptor(action, button) {
    if (!isRoomMode) return false
    if (!localPeer.value || localPeer.value.isHost) return false
    if (!canLocalControl.value) return true
    roomRtc()?.sendData({ type: 'input', action, button })
    return true
  }

  return { guestKeyHandler, guestButtonInterceptor }
}