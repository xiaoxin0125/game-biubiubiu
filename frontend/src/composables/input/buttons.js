export const RETROPAD_BUTTON_DEFS = [
  { key: 'up',     label: '上',      group: 'dpad' },
  { key: 'down',   label: '下',      group: 'dpad' },
  { key: 'left',   label: '左',      group: 'dpad' },
  { key: 'right',  label: '右',      group: 'dpad' },
  { key: 'a',      label: 'A',       group: 'face' },
  { key: 'b',      label: 'B',       group: 'face' },
  { key: 'x',      label: 'X',       group: 'face' },
  { key: 'y',      label: 'Y',       group: 'face' },
  { key: 'l',      label: 'L',       group: 'shoulder' },
  { key: 'r',      label: 'R',       group: 'shoulder' },
  { key: 'l2',     label: 'L2',      group: 'shoulder' },
  { key: 'r2',     label: 'R2',      group: 'shoulder' },
  { key: 'l3',     label: 'L3',      group: 'shoulder' },
  { key: 'r3',     label: 'R3',      group: 'shoulder' },
  { key: 'start',  label: 'Start',   group: 'system' },
  { key: 'select', label: 'Select',  group: 'system' },
]

export const RETROPAD_BUTTON_KEYS = new Set(RETROPAD_BUTTON_DEFS.map((button) => button.key))

export const TURBO_FIRE_MS = 60
export const TURBO_BUTTON_TARGETS = {}
export const BUTTON_DEFS = [...RETROPAD_BUTTON_DEFS]