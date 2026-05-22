export function dispatchKeyboardEvent(type, key, options = {}) {
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
    semicolon: ';',
    minus: '-',
    equal: '=',
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
    semicolon: 'Semicolon',
    minus: 'Minus',
    equal: 'Equal',
  }

  function codeForKey(value) {
    const raw = String(value || '')
    const lowerRaw = raw.toLowerCase()
    if (SPECIAL_CODE[lowerRaw]) return SPECIAL_CODE[lowerRaw]
    if (/^[a-z]$/.test(lowerRaw)) return `Key${lowerRaw.toUpperCase()}`
    if (/^[0-9]$/.test(lowerRaw)) return `Digit${lowerRaw}`
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lowerRaw)) return `F${lowerRaw.slice(1)}`
    if (/^num[0-9]$/.test(lowerRaw)) return `Numpad${lowerRaw.slice(3)}`
    if (lowerRaw === 'numenter') return 'NumpadEnter'
    if (lowerRaw === 'numdivide') return 'NumpadDivide'
    if (lowerRaw === 'nummultiply') return 'NumpadMultiply'
    if (lowerRaw === 'numsubtract') return 'NumpadSubtract'
    if (lowerRaw === 'numadd') return 'NumpadAdd'
    if (lowerRaw === 'decimal') return 'NumpadDecimal'
    return raw || 'Unidentified'
  }

  function keyForKey(value) {
    const raw = String(value || '')
    const lowerRaw = raw.toLowerCase()
    if (SPECIAL_KEY[lowerRaw]) return SPECIAL_KEY[lowerRaw]
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lowerRaw)) return `F${lowerRaw.slice(1)}`
    if (/^num[0-9]$/.test(lowerRaw)) return lowerRaw.slice(3)
    if (lowerRaw === 'numenter') return 'Enter'
    if (lowerRaw === 'numdivide') return '/'
    if (lowerRaw === 'nummultiply') return '*'
    if (lowerRaw === 'numsubtract') return '-'
    if (lowerRaw === 'numadd') return '+'
    if (lowerRaw === 'decimal') return '.'
    return raw
  }

  function locationForKey(value) {
    const lowerRaw = String(value || '').toLowerCase()
    if (lowerRaw === 'rshift') return 2
    if (/^num[0-9]$/.test(lowerRaw) || lowerRaw.startsWith('num') || lowerRaw === 'decimal') return 3
    return 0
  }

  const ev = new KeyboardEvent(type, {
    key: keyForKey(normalized),
    code: SPECIAL_CODE[lower] || codeForKey(normalized),
    location: locationForKey(normalized),
    bubbles: true,
    cancelable: true,
    composed: true,
  })

  if (options?.internal) {
    try { Object.defineProperty(ev, '__internalInputDispatch', { value: true }) } catch {}
  }

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