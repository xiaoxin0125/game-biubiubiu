/* Bridge between the site's player and the hosted J2meJS runtime frame.
 *
 * The frame is same-origin, so the player drives the VM directly through
 * `window.__j2mePlayer`. This file only forwards failures the runtime would
 * otherwise swallow (uncaught errors and rejected promises) and exposes the
 * small control surface the adapter needs.
 */
(function () {
  function report(message) {
    try {
      parent.postMessage({ type: 'j2me-error', message: String(message) }, '*');
    } catch (error) {
      /* nothing else we can do without a parent */
    }
  }

  window.addEventListener('error', function (event) {
    report(event.error && event.error.stack ? event.error.stack : event.message);
  });
  window.addEventListener('unhandledrejection', function (event) {
    report(event.reason);
  });

  // Pause support: the runtime drives everything (VM scheduler, sleeps, screen
  // blits) through timers and requestAnimationFrame, so holding those back while
  // paused freezes the game exactly where it was, and replaying them on resume
  // lets it continue from there.
  let paused = false
  let nextHeldId = -1
  const held = new Map()
  const nativeSetTimeout = window.setTimeout.bind(window)
  const nativeClearTimeout = window.clearTimeout.bind(window)
  const nativeSetInterval = window.setInterval.bind(window)
  const nativeClearInterval = window.clearInterval.bind(window)
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window)

  function hold(kind, callback, delay, args) {
    const id = nextHeldId--
    held.set(id, { kind, callback, delay, args })
    return id
  }
  function release(id) {
    const item = held.get(id)
    if (!item) return false
    held.delete(id)
    if (item.kind === 'raf') nativeRequestAnimationFrame(item.callback)
    else if (item.kind === 'interval') nativeSetInterval(item.callback, item.delay, ...item.args)
    else nativeSetTimeout(item.callback, item.delay, ...item.args)
    return true
  }
  function flush() {
    for (const id of [...held.keys()]) release(id)
  }

  window.setTimeout = function (callback, delay, ...args) {
    if (!paused) return nativeSetTimeout(callback, delay, ...args)
    return hold('timeout', callback, delay, args)
  }
  window.setInterval = function (callback, delay, ...args) {
    if (!paused) return nativeSetInterval(callback, delay, ...args)
    return hold('interval', callback, delay, args)
  }
  window.clearTimeout = function (id) {
    if (typeof id === 'number' && held.has(id)) { held.delete(id); return }
    nativeClearTimeout(id)
  }
  window.clearInterval = function (id) {
    if (typeof id === 'number' && held.has(id)) { held.delete(id); return }
    nativeClearInterval(id)
  }
  window.requestAnimationFrame = function (callback) {
    if (!paused) return nativeRequestAnimationFrame(callback)
    return hold('raf', callback, 0, [])
  }
  window.cancelAnimationFrame = function (id) {
    if (typeof id === 'number' && held.has(id)) { held.delete(id); return }
    nativeCancelAnimationFrame(id)
  }

  window.__j2mePlayer = {
    press: function (code) {
      try {
        MIDP.sendKeyPress(code);
      } catch (error) {
        report(error);
      }
    },
    release: function (code) {
      try {
        MIDP.sendKeyRelease(code);
      } catch (error) {
        report(error);
      }
    },
    canvas: function () {
      return document.getElementById('canvas');
    },
    // The VM object appears while the runtime boots; the player polls this to
    // tell "runtime loaded" from "runtime still fetching its scripts".
    booted: function () {
      return typeof MIDP !== 'undefined' && typeof JARStore !== 'undefined';
    },
    setPaused: function (next) {
      next = !!next
      if (next === paused) return paused
      paused = next
      if (!paused) flush()
      return paused
    },
  };
}());
