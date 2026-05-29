export const MAX_ROOM_PLAYERS = 4

export const PLATFORM_DEFAULT_CORES = Object.freeze({
  gba: 'mgba',
})

export const PLATFORM_CORE_DEFAULT_MAX_PLAYERS = Object.freeze({
  gba: Object.freeze({
    mgba2: 4,
  }),
})

export const PLATFORM_DEFAULT_MAX_PLAYERS = Object.freeze({
  arcade: 4,
  nes: 2,
  famicom: 2,
  fds: 2,
  sfc: 2,
  snes: 2,
  gb: 1,
  gbc: 1,
  gba: 1,
  megadrive: 2,
  genesis: 2,
  sms: 1,
  gamegear: 1,
  psx: 2,
})