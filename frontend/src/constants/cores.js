export const cores = {
  fbneo:           { displayName: 'FinalBurn Neo' },
  fceumm:          { displayName: 'FCEUmm' },
  gambatte:        { displayName: 'Gambatte' },
  gearboy:         { displayName: 'Gearboy' },
  gearsystem:      { displayName: 'Gearsystem' },
  genesis_plus_gx: { displayName: 'Genesis Plus GX' },
  mame2003_plus:   { displayName: 'MAME 2003-Plus' },
  mednafen_ngp:    { displayName: 'Beetle NeoPop' },
  mednafen_pce_fast: { displayName: 'Beetle PCE Fast' },
  mgba:            { displayName: 'mGBA' },
  mgba2:           { displayName: 'mGBA2 Link' },
  neocd:           { displayName: 'NeoCD' },
  nestopia:        { displayName: 'Nestopia' },
  opera:           { displayName: 'Opera' },
  pcsx_rearmed:    { displayName: 'PCSX ReARMed' },
  picodrive:       { displayName: 'PicoDrive' },
  quicknes:        { displayName: 'QuickNES' },
  snes9x:          { displayName: 'Snes9x' },
  j2mejs:          { displayName: 'J2meJS（Java 手机游戏）' },
  js2me:           { displayName: 'J2meJS（兼容旧设置）' },
  squirreljme:     { displayName: 'J2meJS（兼容旧设置）' },
  tgbdual:         { displayName: 'TGB Dual' },
  vba_next:        { displayName: 'VBA Next' },
}

export const coreDisplayName = Object.fromEntries(
  Object.entries(cores).map(([k, v]) => [k, v.displayName]),
)
