/* Bridge between the site's player and the hosted J2meJS runtime frame.
 *
 * The frame is same-origin, so the player drives the VM directly through
 * `window.__j2mePlayer`. This file only forwards failures the runtime would
 * otherwise swallow (uncaught errors and rejected promises) and exposes the
 * small control surface the adapter needs.
 */
(function () {
  // 三星时代的 MIDlet（「冒险小子」）会先问 `com.samsung.util.AudioClip.isSupported()`：
  // 拿到 true 才分配自己那张关卡常量表（ABGame.x() 里的 `if (i) c = new int[7]`），而关卡
  // 音乐、关卡切换这些路径会不带条件地读它 —— 内置类库带的那份 AudioClip 是完整的 Java
  // 空实现（构造与 play/stop/pause/resume 都不做事），isSupported() 却写死 `return false`，
  // 于是游戏在关卡里按一下确定键就读到一张从未分配的 int[7]：空指针结束 MIDlet 线程、
  // 画面定在最后一帧。真机上这个类由三星/国产手机的类库提供并答 true，这里照真机答 true：
  // 本运行时里 AudioClip 的每个调用本来就是安全空操作（与站点对其它「在这里是空操作」的
  // MIDP 内部实现的做法一致）。这条 shim 依赖 bld/j2me.js 的补丁 30 —— ReplaceMethod 表
  // 要在方法解析时也被查一次，否则 MIDlet 自己字节码里的调用根本走不到它。
  if (typeof ReplaceMethod === 'object' && ReplaceMethod) {
    ReplaceMethod['com/samsung/util/AudioClip.isSupported.()Z'] = function () {
      return 1;
    };
  }

  function report(message) {
    try {
      // 指定目标源而不是 '*':运行时按设计与本页同源，消息不该有机会投给别的窗口。
      parent.postMessage({ type: 'j2me-error', message: String(message) }, location.origin);
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

  // The runtime's built-in touch pad used to say `onselectstart='return false'`
  // (next to an `οnselect` whose "o" was a Greek omicron, i.e. not a handler at
  // all): this site serves its pages with `script-src 'self' blob: 'unsafe-eval'
  // 'wasm-unsafe-eval'`, so the browser refuses to run an inline handler and logs
  // "Executing inline event handler violates ..." the moment a selection starts on
  // the pad. The behaviour lives here instead, where a listener is not inline.
  var siteGamepad = document.getElementById('gamepad');
  if (siteGamepad) {
    siteGamepad.addEventListener('selectstart', function (event) {
      event.preventDefault();
    });
  }

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
