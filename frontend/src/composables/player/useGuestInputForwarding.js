import { computed } from 'vue'
import { P2_KEY_MAP } from '../useInputMapping.js'
import { dispatchKeyboardEvent } from '../dispatchKeyboardEvent.js'

// Current netplay maps all controllable guests to the host's P2 bindings.
// The room hub may allocate P2-P4 seats, but distinct P3/P4 RetroArch maps are
// intentionally not implemented yet; docs/netplay.md calls this out explicitly.
export function dispatchP2Button(action, button) {
  const mappedKey = P2_KEY_MAP[button]
  if (!mappedKey) return
  dispatchKeyboardEvent(action === 'down' ? 'keydown' : 'keyup', mappedKey)
}

export function useGuestInputForwarding({ mapping, roomRtc, isRoomMode, localPeer, isGuestMode, canLocalControl }) {
  const reverseKeyMap = computed(() => {
    const cfg = mapping.value.keyboard || {}
    const out = {}
    for (const [btn, key] of Object.entries(cfg)) out[key] = btn
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
    else if (raw === 'Enter') k = 'enter'
    else if (raw === 'Shift') k = e.location === 2 ? 'rshift' : 'shift'
    else if (raw === ' ') k = 'space'
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