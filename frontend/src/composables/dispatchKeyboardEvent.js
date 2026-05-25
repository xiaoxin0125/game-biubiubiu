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
    equals: '=',
    comma: ',',
    period: '.',
    slash: '/',
    quote: "'",
    leftbracket: '[',
    rightbracket: ']',
    backquote: '`',
    tab: 'Tab',
    backspace: 'Backspace',
    capslock: 'CapsLock',
    insert: 'Insert',
    del: 'Delete',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    ctrl: 'Control',
    rctrl: 'Control',
    add: '+',
    subtract: '-',
    divide: '/',
    multiply: '*',
    kp_enter: 'Enter',
    kp_period: '.',
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
    equals: 'Equal',
    comma: 'Comma',
    period: 'Period',
    slash: 'Slash',
    quote: 'Quote',
    leftbracket: 'BracketLeft',
    rightbracket: 'BracketRight',
    backquote: 'Backquote',
    tab: 'Tab',
    backspace: 'Backspace',
    capslock: 'CapsLock',
    insert: 'Insert',
    del: 'Delete',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    ctrl: 'ControlLeft',
    rctrl: 'ControlRight',
    add: 'NumpadAdd',
    subtract: 'NumpadSubtract',
    divide: 'NumpadDivide',
    multiply: 'NumpadMultiply',
    kp_enter: 'NumpadEnter',
    kp_period: 'NumpadDecimal',
  }

  function codeForKey(value) {
    const raw = String(value || '')
    const lowerRaw = raw.toLowerCase()
    if (SPECIAL_CODE[lowerRaw]) return SPECIAL_CODE[lowerRaw]
    if (/^kp_[0-9]$/.test(lowerRaw)) return `Numpad${lowerRaw.slice(3)}`
    if (/^num[0-9]$/.test(lowerRaw)) return `Numpad${lowerRaw.slice(3)}`
    if (/^[a-z]$/.test(lowerRaw)) return `Key${lowerRaw.toUpperCase()}`
    if (/^[0-9]$/.test(lowerRaw)) return `Digit${lowerRaw}`
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lowerRaw)) return `F${lowerRaw.slice(1)}`
    if (lowerRaw === 'numenter' || lowerRaw === 'kp_enter') return 'NumpadEnter'
    if (lowerRaw === 'numdivide' || lowerRaw === 'divide') return 'NumpadDivide'
    if (lowerRaw === 'nummultiply' || lowerRaw === 'multiply') return 'NumpadMultiply'
    if (lowerRaw === 'numsubtract' || lowerRaw === 'subtract') return 'NumpadSubtract'
    if (lowerRaw === 'numadd' || lowerRaw === 'add') return 'NumpadAdd'
    if (lowerRaw === 'decimal' || lowerRaw === 'kp_period') return 'NumpadDecimal'
    return raw || 'Unidentified'
  }

  function keyForKey(value) {
    const raw = String(value || '')
    const lowerRaw = raw.toLowerCase()
    if (SPECIAL_KEY[lowerRaw]) return SPECIAL_KEY[lowerRaw]
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lowerRaw)) return `F${lowerRaw.slice(1)}`
    if (/^kp_[0-9]$/.test(lowerRaw)) return lowerRaw.slice(3)
    if (/^num[0-9]$/.test(lowerRaw)) return lowerRaw.slice(3)
    if (lowerRaw === 'numenter' || lowerRaw === 'kp_enter') return 'Enter'
    if (lowerRaw === 'numdivide' || lowerRaw === 'divide') return '/'
    if (lowerRaw === 'nummultiply' || lowerRaw === 'multiply') return '*'
    if (lowerRaw === 'numsubtract' || lowerRaw === 'subtract') return '-'
    if (lowerRaw === 'numadd' || lowerRaw === 'add') return '+'
    if (lowerRaw === 'decimal' || lowerRaw === 'kp_period') return '.'
    return raw
  }

  function locationForKey(value) {
    const lowerRaw = String(value || '').toLowerCase()
    if (lowerRaw === 'rshift') return 2
    if (lowerRaw === 'rctrl') return 2
    if (/^kp_[0-9]$/.test(lowerRaw)) return 3
    if (/^num[0-9]$/.test(lowerRaw) || lowerRaw.startsWith('num') || lowerRaw === 'decimal') return 3
    if (['add', 'subtract', 'divide', 'multiply', 'kp_enter', 'kp_period'].includes(lowerRaw)) return 3
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