// Physical pads belong to the app's own useGamepads layer. The emulator core
// must never read them: RetroArch's Emscripten build polls the browser directly
// (input/drivers_joypad/rwebpad_joypad.c → emscripten_sample_gamepad_data →
// navigator.getGamepads) and, because our config writes every
// input_player*_<button>_btn / _axis as `nul`, its driver falls back to the
// autoconfig binds (see input/input_driver.c: `bind_joykey != NO_BTN ?
// bind_joykey : autobind_joykey`). That fallback delivers the same physical
// press a second time with RetroArch's own layout (built-in EMSCRIPTEN profile:
// a=1, b=0, x=3, y=2), which showed up as P1 A+B presses, swapped A/B and X/Y,
// and one pad driving two players.
//
// Emscripten resolves `navigator.getGamepads` on every sample, so replacing the
// page-level reader with an empty one keeps the core blind to pads while this
// module hands the original reader back to our own input code.

// The reader saved per navigator. Keyed by the navigator itself so a swapped
// navigator (tests, embedded frames) never inherits another one's pads, and a
// navigator that never had gamepad support simply yields nothing.
const nativeReaders = new WeakMap()

function emptyGetGamepads() {
  return []
}

// `navigator` exists in browsers and in the test harnesses; anything else keeps
// the guard inert instead of throwing.
function currentNavigator() {
  return typeof navigator !== 'undefined' ? navigator : null
}

// Remember the real reader for this navigator. Called before installing the
// guard and again by readPhysicalPads().
function nativeReaderFor(nav) {
  if (!nav) return null
  const candidate = nav.getGamepads
  if (typeof candidate === 'function' && candidate !== emptyGetGamepads) {
    nativeReaders.set(nav, candidate)
    return candidate
  }
  // The guard may already be installed: hand back the reader saved earlier.
  return nativeReaders.get(nav) || null
}

// Idempotent: installing twice keeps the same empty reader and the same saved
// original. Returns true when pads are (now) hidden from the page.
export function installNativeGamepadGuard() {
  const nav = currentNavigator()
  if (!nav) return false
  nativeReaderFor(nav)
  if (nav.getGamepads === emptyGetGamepads) return true
  try {
    nav.getGamepads = emptyGetGamepads
    return nav.getGamepads === emptyGetGamepads
  } catch {
    // Some environments define it as a non-writable accessor.
    try {
      Object.defineProperty(nav, 'getGamepads', {
        value: emptyGetGamepads,
        configurable: true,
        writable: true,
      })
      return nav.getGamepads === emptyGetGamepads
    } catch {
      return false
    }
  }
}

export function isNativeGamepadGuardInstalled() {
  const nav = currentNavigator()
  return !!nav && nav.getGamepads === emptyGetGamepads
}

// The pads the app is allowed to read, using the browser's real reader even
// while the guard is installed. Always the live array from the browser.
export function readPhysicalPads() {
  const nav = currentNavigator()
  const reader = nativeReaderFor(nav)
  if (typeof reader !== 'function') return []
  try {
    const pads = reader.call(nav)
    return Array.from(pads || [])
  } catch {
    return []
  }
}
