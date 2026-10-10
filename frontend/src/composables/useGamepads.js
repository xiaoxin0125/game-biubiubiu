import { ref, onBeforeUnmount, watch, unref } from 'vue'
import {
  TURBO_BUTTON_TARGETS,
  TURBO_FIRE_MS,
  deviceMappingFor,
  describeConnectedDevices,
  effectiveKeyboardForPlayer,
  resolveSoloSeatPlayers,
} from './useInputMapping.js'
import { turboButtonsForPlatform } from '../constants/platforms.js'
import { dispatchKeyboardEvent } from './dispatchKeyboardEvent.js'
import { readPhysicalPads } from './input/physicalGamepads.js'

const AXIS_DEADZONE = 0.5
const AXIS_DIRECTIONS = [
  { axis: 0, negative: 'left', positive: 'right' },
  { axis: 1, negative: 'up', positive: 'down' },
]

// Solo seats select devices, while mappings stay attached to device keys.
// A playerResolver receives every connected descriptor, including extra room
// pads. All physical sources are combined before emitting a player/button edge.
export function useGamepads({
  mapping,
  // Receives source logical edges before internal mapping. For NES this is X/Y
  // (the direct pressButton/releaseButton fallback receives their A/B targets).
  // Return true to consume the edge instead of the direct/keyboard fallback.
  onButton,
  pressButton,
  releaseButton,
  maxLocalPlayers = 2,
  seats = null,
  playerResolver = null,
  platformButtons = null,
  platform = null,
  // A boolean/ref/computed. false releases and suspends physical output, while
  // connected/padCount continue updating (for example while settings are open).
  enabled = true,
} = {}) {
  const connected = ref(false)
  const padCount = ref(0)
  const logicalButtons = new Map()
  const outputs = new Map()
  let rafId = null
  let disposed = false

  // Dispatch only the effective retropad target. Capture keyboard key-up at
  // press time so changing a mapping cannot leave the old key held.
  function startDirect(btn, player) {
    if (pressButton && releaseButton) {
      pressButton(btn, player)
      return () => releaseButton(btn, player)
    }
    const key = effectiveKeyboardForPlayer(unref(mapping), player)[btn]
    if (!key || key === 'nul') return () => {}
    dispatchKeyboardEvent('keydown', key)
    return () => dispatchKeyboardEvent('keyup', key)
  }

  function setOutput(active, down) {
    active.down = down
    const outputKey = `${active.player}:${active.target}`
    let output = outputs.get(outputKey)
    if (down) {
      if (!output) {
        output = { contributors: new Set(), release: null }
        outputs.set(outputKey, output)
      }
      if (output.contributors.has(active.key)) return
      output.contributors.add(active.key)
      if (output.contributors.size === 1) output.release = startDirect(active.target, active.player)
      return
    }
    if (!output || !output.contributors.delete(active.key)) return
    if (output.contributors.size === 0) {
      outputs.delete(outputKey)
      output.release?.()
    }
  }

  function startLogicalButton(desired) {
    const active = { ...desired, down: false, loop: null }
    active.handled = onButton ? !!onButton('down', active.btn, active.player, active.slot) : false
    logicalButtons.set(active.key, active)
    if (active.handled) return
    if (active.turbo) {
      active.loop = setInterval(() => setOutput(active, !active.down), TURBO_FIRE_MS)
    }
    setOutput(active, true)
  }

  function stopLogicalButton(active) {
    if (active.loop !== null) clearInterval(active.loop)
    logicalButtons.delete(active.key)
    onButton?.('up', active.btn, active.player, active.slot)
    if (!active.handled) setOutput(active, false)
  }

  function releaseTrackedButtons() {
    for (const active of [...logicalButtons.values()]) stopLogicalButton(active)
  }

  function resolveAssignments(devices) {
    if (typeof playerResolver === 'function') {
      const assignments = new Map()
      for (const device of devices) {
        const player = Number(playerResolver(device, devices))
        if (Number.isInteger(player) && player >= 1) assignments.set(device.key, player)
      }
      return assignments
    }
    return resolveSoloSeatPlayers(devices, unref(seats), unref(maxLocalPlayers))
  }

  function collectLogicalButtons(devices) {
    const desired = new Map()
    const assignments = resolveAssignments(devices)
    const buttons = unref(platformButtons)
    const allowed = buttons ? new Set(buttons) : null
    const turboTargets = { ...TURBO_BUTTON_TARGETS, ...turboButtonsForPlatform(unref(platform)) }

    function add(btn, player, slot) {
      if (!btn || (allowed && !allowed.has(btn))) return
      const key = `${player}:${btn}`
      if (!desired.has(key)) {
        desired.set(key, { key, btn, player, slot, target: turboTargets[btn] || btn, turbo: !!turboTargets[btn] })
      }
    }

    for (const device of devices) {
      const player = assignments.get(device.key)
      if (!player) continue
      const reverseMap = new Map()
      const gpMap = deviceMappingFor(unref(mapping), device.key, device.position)
      for (const [btn, index] of Object.entries(gpMap)) {
        if (typeof index === 'number' && (!allowed || allowed.has(btn))) reverseMap.set(index, btn)
      }
      const padButtons = device.pad.buttons || []
      for (let i = 0; i < padButtons.length; i++) {
        if (padButtons[i]?.pressed || Number(padButtons[i]?.value || 0) > 0.5) add(reverseMap.get(i), player, device.position)
      }
      for (const { axis, negative, positive } of AXIS_DIRECTIONS) {
        const value = Number(device.pad.axes?.[axis] || 0)
        if (value < -AXIS_DEADZONE) add(negative, player, device.position)
        else if (value > AXIS_DEADZONE) add(positive, player, device.position)
      }
    }
    return desired
  }

  function poll() {
    if (disposed) return
    rafId = null
    const pads = readPhysicalPads()
    const devices = describeConnectedDevices(pads)
    padCount.value = devices.length
    connected.value = devices.length > 0

    if (unref(enabled) === false) {
      releaseTrackedButtons()
    } else {
      const desired = collectLogicalButtons(devices)
      // Add first, then remove stale contributors. A same-frame handover from
      // one pad to another must not briefly release an otherwise held output.
      for (const [key, next] of desired) {
        const active = logicalButtons.get(key)
        if (active && active.target === next.target && active.turbo === next.turbo) continue
        if (active) stopLogicalButton(active)
        startLogicalButton(next)
      }
      for (const [key, active] of [...logicalButtons.entries()]) {
        if (!desired.has(key)) stopLogicalButton(active)
      }
    }
    if (!disposed) rafId = requestAnimationFrame(poll)
  }

  const stopConfigWatch = watch([
    () => unref(mapping),
    () => unref(seats),
    () => unref(maxLocalPlayers),
    () => unref(platformButtons),
    () => unref(platform),
    () => unref(enabled),
  ], releaseTrackedButtons, { deep: true, flush: 'sync' })
  rafId = requestAnimationFrame(poll)

  onBeforeUnmount(() => {
    disposed = true
    if (rafId !== null) cancelAnimationFrame(rafId)
    stopConfigWatch()
    releaseTrackedButtons()
  })

  return { connected, padCount }
}
