import { computed } from 'vue'
import { REMOTE_PLAYER_KEY_MAPS, TURBO_BUTTON_TARGETS } from '../useInputMapping.js'
import { dispatchKeyboardEvent } from '../dispatchKeyboardEvent.js'

export function dispatchPlayerButton(playerIndex, action, button, keyMap = null) {
  const eventType = action === 'down' ? 'keydown' : 'keyup'
  const turboTarget = TURBO_BUTTON_TARGETS[button]
  const targetButton = turboTarget || button
  const mappedKey = (keyMap || REMOTE_PLAYER_KEY_MAPS[playerIndex])?.[targetButton]
  if (mappedKey) dispatchKeyboardEvent(eventType, mappedKey, { internal: true })
}

export function useGuestInputForwarding({ mapping, platformButtons, roomRtc, isRoomMode, localPeer, isGuestMode, canLocalControl }) {
  const reverseKeyMap = computed(() => {
    const cfg = mapping.value.keyboard || {}
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
    const raw = e.key
    let k
    if (raw === 'ArrowUp') k = 'up'
    else if (raw === 'ArrowDown') k = 'down'
    else if (raw === 'ArrowLeft') k = 'left'
    else if (raw === 'ArrowRight') k = 'right'
    else if (raw === 'Enter') k = e.location === 3 ? 'numenter' : 'enter'
    else if (raw === 'Shift') k = e.location === 2 ? 'rshift' : 'shift'
    else if (raw === ' ') k = 'space'
    else if (raw === ';') k = 'semicolon'
    else if (raw === '-') k = 'minus'
    else if (raw === '=') k = 'equal'
    else if (raw === '/') k = e.location === 3 ? 'numdivide' : '/'
    else if (raw === '*') k = 'nummultiply'
    else if (raw === '+') k = 'numadd'
    else if (raw === '.') k = e.location === 3 ? 'decimal' : '.'
    else k = raw.length === 1 ? raw.toLowerCase() : raw.toLowerCase()

    const button = reverseKeyMap.value[k]
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