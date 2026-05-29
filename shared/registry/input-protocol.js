export const ROOM_INPUT_MESSAGE_TYPE = 'input'

export const ROOM_INPUT_ACTIONS = Object.freeze({
  down: 'down',
  up: 'up',
})

export function roomInputMessage({ action, button } = {}) {
  return {
    type: ROOM_INPUT_MESSAGE_TYPE,
    action,
    button,
  }
}