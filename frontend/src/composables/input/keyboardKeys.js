export function normalizeRetroarchKey(key) {
  if (key == null) return key
  const value = String(key).trim().toLowerCase()
  if (value === '') return value
  const aliases = {
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    ' ': 'space',
    ';': 'semicolon',
    '-': 'minus',
    '=': 'equals',
    equal: 'equals',
    ',': 'comma',
    '.': 'period',
    '/': 'slash',
    "'": 'quote',
    '[': 'leftbracket',
    ']': 'rightbracket',
    '`': 'backquote',
    delete: 'del',
    control: 'ctrl',
    leftcontrol: 'ctrl',
    rightcontrol: 'rctrl',
    numenter: 'kp_enter',
    numpadenter: 'kp_enter',
    decimal: 'kp_period',
    numdecimal: 'kp_period',
    numpaddecimal: 'kp_period',
    numdivide: 'divide',
    numpaddivide: 'divide',
    nummultiply: 'multiply',
    numpadmultiply: 'multiply',
    numsubtract: 'subtract',
    numpadsubtract: 'subtract',
    numadd: 'add',
    numpadadd: 'add',
  }
  if (/^numpad[0-9]$/.test(value)) return `numpad${value.slice(6)}`
  if (/^num[0-9]$/.test(value)) return `numpad${value.slice(3)}`
  if (/^kp_[0-9]$/.test(value)) return `numpad${value.slice(3)}`
  return aliases[value] || value
}

export function normalizeKeyboardEventKey(e) {
  if (!e) return ''
  const raw = e.key
  let key
  if (raw === 'ArrowUp') key = 'up'
  else if (raw === 'ArrowDown') key = 'down'
  else if (raw === 'ArrowLeft') key = 'left'
  else if (raw === 'ArrowRight') key = 'right'
  else if (raw === 'Enter') key = e.code === 'NumpadEnter' ? 'kp_enter' : 'enter'
  else if (raw === 'Shift') key = e.location === 2 ? 'rshift' : 'shift'
  else if (raw === 'Control') key = e.location === 2 ? 'rctrl' : 'ctrl'
  else if (raw === ' ') key = 'space'
  else if (raw === 'Delete') key = 'del'
  else if (/^Numpad[0-9]$/.test(e.code)) key = `numpad${e.code.slice(6)}`
  else if (/^[0-9]$/.test(raw)) key = raw
  else if (raw === ';') key = 'semicolon'
  else if (raw === '-' && e.code === 'NumpadSubtract') key = 'subtract'
  else if (raw === '-') key = 'minus'
  else if (raw === '=') key = 'equals'
  else if (raw === '/' && e.code === 'NumpadDivide') key = 'divide'
  else if (raw === '/') key = 'slash'
  else if (raw === '*' && e.code === 'NumpadMultiply') key = 'multiply'
  else if (raw === '*') key = 'multiply'
  else if (raw === '+') key = 'add'
  else if (raw === '.' && e.code === 'NumpadDecimal') key = 'kp_period'
  else if (raw === '.') key = 'period'
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(raw)) key = raw.toLowerCase()
  else key = raw?.length === 1 ? raw.toLowerCase() : String(raw || '').toLowerCase()
  return normalizeRetroarchKey(key)
}