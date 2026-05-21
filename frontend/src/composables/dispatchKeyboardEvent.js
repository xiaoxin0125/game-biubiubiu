export function dispatchKeyboardEvent(type, key) {
  const normalized = String(key || '')
  const lower = normalized.toLowerCase()
  const SPECIAL_KEY = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    enter: 'Enter',
    space: ' ',
    shift: 'Shift',
    rshift: 'Shift',
    escape: 'Escape',
  }
  const SPECIAL_CODE = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    enter: 'Enter',
    space: 'Space',
    shift: 'ShiftLeft',
    rshift: 'ShiftRight',
    escape: 'Escape',
  }

  function codeForKey(value) {
    const raw = String(value || '')
    const lowerRaw = raw.toLowerCase()
    if (SPECIAL_CODE[lowerRaw]) return SPECIAL_CODE[lowerRaw]
    if (/^[a-z]$/.test(lowerRaw)) return `Key${lowerRaw.toUpperCase()}`
    if (/^[0-9]$/.test(lowerRaw)) return `Digit${lowerRaw}`
    return raw || 'Unidentified'
  }

  const ev = new KeyboardEvent(type, {
    key: SPECIAL_KEY[lower] || normalized,
    code: SPECIAL_CODE[lower] || codeForKey(normalized),
    location: lower === 'rshift' ? 2 : 0,
    bubbles: true,
    cancelable: true,
    composed: true,
  })

  const target = document.querySelector('.portal-canvas') || document.activeElement
  if (target && typeof target.dispatchEvent === 'function') {
    target.dispatchEvent(ev)
    return true
  }

  try {
    window.dispatchEvent(ev)
    document.dispatchEvent(ev)
    return true
  } catch {
    return false
  }
}