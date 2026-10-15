# J2ME runtime integration (J2meJS)

## What runs here

`.jar` ROMs are played by **J2meJS** (upstream
[`Rosabis/J2meJS`](https://github.com/Rosabis/J2meJS), pinned to commit `75947c1`
of `main`, a fork of Mozilla's j2me.js), copied into `frontend/public/j2me/` and
served from our own origin. There is no libretro core and no BIOS: the runtime
loads its own Java class library from `frontend/public/j2me/java/`.

Refreshing the vendored copy means re-applying `apply-site-patches.mjs` (see
below); upstream is the place the corresponding source lives for GPL-2.0.

License: **GPL-2.0** (`frontend/public/j2me/LICENSE`, upstream README kept as
`LICENSE-README.md`). The emoji graphics under `style/emoji/` are CC-BY-4.0 and
are covered by that license only. The footer and README name the runtime and its
license.

## Why not SquirrelJME's libretro core

Probed 2026-10-14: the libretro core loads and starts, but its content loading is
unimplemented upstream. In `nanocoat/frontend/libretro/boot.c` every load path
ends in `sjme_nvm_defaultBootSuiteInDirectory()`, whose file lookup
`sjme_nvm_defaultBootSuiteAttempt()` is a disabled `sjme_todo("Impl?")` stub, and
`sjme_nvm_parseCommandLine()` stubs `-jar` the same way. `retro_load_game()`
therefore returns false for every input: a real MIDlet JAR and the core's own
class-library archive both fail with `[Content] Failed to load content` even with
`squirreljme-0.3.0-fast.jar` present in the system directory under the exact name
its `.info` requires. The prebuilt core and class library were removed from
`data/cores` and `data/bios/j2me` and the core release was rebuilt without them.

## Site patches to the vendored runtime

`apply-site-patches.mjs` in this directory re-applies every patch and is
idempotent, so run it after refreshing the vendored copy:

```bash
node frontend/public/j2me/apply-site-patches.mjs
```

1. `bld/main-all.js` — its boot list splits `config.jars` on `":"`, which breaks
   `blob:` URLs. The patched line prefers `window.__j2meJars` when set.
2. `bld/main-all.js` — `window.onload` must never be stopped by the
   compiled-method cache (see the mobile section below): the `clear()` result is
   given a two-second race and a `catch`, and the VM starts either way.
3. `bld/main-all.js` — the class library is requested under the page's `?v=`
   version, so a browser that cached the previous runtime cannot pair it with a
   new page.
4. `bld/main-all.js` — key codes carry their MIDP game actions: `getGameAction`
   gains 2/4/6/8 → UP/LEFT/RIGHT/DOWN, 5 → FIRE and 1/3/7/9 → GAME_A..GAME_D
   (the navigation codes were already in the table), and `getKeyCode` answers
   with the codes this player actually sends (see "Adapter" for both).
5. `bld/main-all.js` — `keyNames` learns the navigation and soft keys, which
   otherwise fall through to `String.fromCharCode(-1)` in `getKeyName()`.
6. `bld/j2me.js` — the optional compiled-method cache is disabled. JIT methods
   are regenerated for every session instead of being restored from a desktop
   browser's IndexedDB, where methods from an older runtime can stall boot.
7. `libs/compiled-method-cache.js` — `restore()`/`clear()` read the `database`
   handle only after `openDatabase` resolves (upstream handed `new Promise(...)`
   straight to `.then()`, whose executor runs at call time).
8. `main.html` — loads `preload.js` (which turns the `?jar=` parameter into
   `window.__j2meJars`) right after the config scripts, and `bridge.js` after the
   runtime scripts.

`bridge.js` forwards uncaught runtime errors to the player and exposes
`window.__j2mePlayer` (key press/release, the VM canvas, boot state, pause). The
pause implementation holds back `setTimeout` / `setInterval` /
`requestAnimationFrame` while paused, which freezes the VM where it was because
the runtime drives its scheduler, sleeps and screen blits through those timers.

The page must be named `main.html`: the runtime decides between its "index" and
"player" modes by looking for that name in the URL.

## Mobile: the WebKit boot failure (fixed 2026-10-14)

J2ME loaded on desktop Chromium but never on phones. iOS Safari and iOS Edge
(WebKit) run the same WebKit engine and failed *after* `java/classesold.jar` was
delivered, with nothing else requested and no picture:

```
Unhandled Promise Rejection: TypeError: undefined is not an object
  (evaluating 'database.transaction')
```

`compiled-method-cache.js` handed a `new Promise(executor)` to
`openDatabase.then(...)`, so the executor ran immediately — before the
IndexedDB open had produced the `database` handle. On V8 the database happens
to be open by the time `window.onload` calls `clear()`, so nothing threw; on
WebKit it was still opening, the executor threw, and the rejected promise was
reported through `bridge.js` as a fatal error, which made the player tear the
frame down. Patch 4 fixes the call; patch 2 makes the cache non-fatal and
non-blocking as well, because it is only an optimisation.

Two related changes went in with it:

- The adapter no longer treats every reported error as fatal while booting: the
  first error is held for five seconds (`J2ME_BOOT_ERROR_GRACE_MS`) instead of
  failing instantly. A session that paints continues (the error stays visible in
  `getStatus().error`), and one that does not fails with the runtime's own
  message rather than a bare "startup timed out".
- The app server now allows the runtime page to be framed by this site
  (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'` for `/j2me/` only).
  Its blanket `DENY` / `frame-ancestors 'none'` made every J2ME boot fail when
  the Node app serves the frontend build (Docker deployment) with "Refused to
  load" / sandbox access violations.

## Desktop freeze: parent-frame animation scheduling (fixed 2026-10-14)

A controlled comparison with `/www/wwwroot/default/J2meJS-main/java` identified
an integration trigger, rather than a ROM or class-library problem. The same
450,183-byte `正义化身－忍者神龟传` JAR passes its loading screen in the original
page and in a minimal iframe using our patched runtime. Adding even an empty,
continuous `requestAnimationFrame` loop in the parent makes it hang inside the
asm.js allocator. Removing that parent RAF loop, or replacing the adapter's
canvas mirror with a 16 ms `setTimeout` loop, allows it to load and keep painting.

The adapter now uses the timer mirror and cancels it on pause, failure and exit.
A Chromium run of the actual game remained responsive for 45 seconds, passed the
previous loading freeze, and kept changing frames with the VM heap stable at
557,056 bytes. This identifies and removes the integration trigger; it does not
claim that the exact invalid VM memory write has been located. Mobile browser
emulation can reproduce the old failure too, so the fix is applied consistently
instead of depending on user-agent detection.

The earlier allocator investigation below is retained as background; its
`OutOfMemoryError` guard alone did **not** fix this game. Moving the runtime to a
separate origin is optional isolation work, not required for this fix.

### Earlier allocator evidence

`正义化身－忍者神龟传` (and, by the shape of it, any MIDlet that drives the fork's
runtime into the same corner) freezes the whole page on PC: the game's own
“载入中…” screen stops mid-way and the tab stops responding — the renderer's main
thread never yields again, so not even the player's UI can react.

Measured through the production player entry (`tests/j2me-real-game.mjs`, plus a
CDP driver that samples the page every second):

- At the freeze the game had painted its own loading screen and the VM heap was
  ~471 KB of the 128 MB asm.js heap, so this is **not** memory pressure.
- `Runtime.evaluate` times out from then on and `Profiler.stop` never returns,
  but `Debugger.pause` still does: the renderer is spinning inside JS, not
  waiting on I/O.
- The paused chain is `jf → Rc → Pc → Nc → Yb → ce → Ab → Bb` in
  `bld/native.js` — the Emscripten asm.js GC — entered from `newArray()` in
  `bld/j2me.js` via `J2ME.gcMallocAtomic` (`jf` is the exported
  `_gcMallocAtomic`, per the module's export table).
- `ASM._getUsedHeapSize()` stays at exactly the same value across four minutes
  and the Java frame state (`fp`, `sp`, `opPC`) is byte-identical across pauses:
  **one** `_gcMallocAtomic()` call never returns. `Bb` is the allocator's
  free-space search; its loop walks a chain that never terminates, i.e. the free
  lists it walks were corrupted earlier.
- Only this game does it. `仙剑奇侠传` runs and repaints for 45+ s in the same
  harness (its screen hash changes, no freeze).

Where the corruption comes from: this fork **disables Java's error paths**.
`Thread.prototype.throwException` only logs (`case 1/0/2/3` are commented out,
“这里拦截了报错”), and `throwArrayIndexOutOfBoundsException`,
`throwNullPointerException` and `throwArithmeticException` are neutered too, so
the interpreter runs the very store/field write the check just rejected. The
compiled path is the same: `emitBoundsCheck()` calls `TI()` — the neutered
throw — and then writes anyway, privilege-listed methods skip the check
entirely, and a compiled `putfield` on a null receiver goes through `TN()`
(also neutered) and writes at `null + fieldOffset`. Addresses that low are the
module's own static data, and that is exactly where the GC keeps its page table
(`c[60320 + …]`) and free-list heads (`c[8 + …]`). One wild write there and the
allocator's search spins forever — taking the browser tab with it.

What ships from this investigation: the runtime now keeps Java's safety checks active. `Thread.throwException()` and the compiled `TN` / `TI` / `TA` helpers raise the corresponding Java exceptions instead of logging and continuing; the array-store check does the same. This prevents a bad field or array access from writing over the GC's page tables or free lists. `newArray()` also raises a Java `OutOfMemoryError` when the allocator returns 0 instead of writing an array header at address 0. The game still boots and repaints with these guards, and the actual game sequence below has been exercised through the production player entry.

What was tried and does **not** fix the freeze (all verified on this ROM):
the other two class libraries (`enginemode2-classes2.jar`,
`enginemode3-classes.jar`), an all-STORED JAR (no JS inflate), a suspended
`AudioContext`, 20× CPU throttling, omitting `midletClassName`, forcing a full
collection every 32 scheduler turns, and bounding the allocator's `while(1)` and
`do-while` loops (50 k iterations, `break` on bail-out) — the spin simply moves
to a loop outside the bounded set, and the caller's “collect and retry” path
keeps the page blocked. Disabling the JIT (`invokeThreshold` /
`backwardBranchThreshold` set to 1e9, so everything stays in the interpreter,
which does skip the wild accesses) keeps the page responsive but leaves the game
stuck on its loading screen, so it is not a fix either.

Recommended follow-up, in order of value:

1. **Give the runtime its own origin** (its own port/host, not just its own
   path). Same-origin frames share one renderer main thread, which is why a hung
   VM freezes the player UI; a separate origin gets its own process, so the
   player could detect the dead frame and offer a reload instead of hanging.
   That needs the JAR handoff moved from the `blob:` URL to `postMessage` (blob
   URLs are origin-scoped) and the canvas mirror switched to transferred
   `ImageBitmap`s (a cross-origin canvas cannot be read back).
2. Report the allocator/exception findings upstream (`Rosabis/J2meJS`): the
   neutered `throwException` paths plus a free list that can be walked forever
   are both upstream issues, and the repro above is self-contained.

## Runtime asset versioning

nginx serves `.js`/`.css` out of `dist` with a 12-hour `max-age`. A phone that
cached the previous runtime therefore keeps executing those scripts against a
freshly deployed page — the state that hid the fix above from the phone that
reported it. `frontend/scripts/stamp-j2me-runtime.mjs` (run by `npm run build`)
hashes the runtime copy in `dist/j2me`, writes `dist/j2me/version.json`, and
stamps every local `src`/`href` in `main.html` with `?v=<version>`. The adapter
reads that file with `cache: 'no-store'` and opens
`/j2me/main.html?v=<version>`, and the patched `main-all.js` fetches the class
library under the same version. Changing any runtime file therefore changes
every URL at once; a missing `version.json` (dev server) simply means unstamped
URLs.

## The J2ME “core” in the player's loading panel

J2ME has no libretro core to download, but booting a game still pulls ~4.4 MB of
runtime: the scripts and stylesheets `main.html` references, plus the Java class
library (`java/classesold.jar`). The frame fetches those itself, so before the
last change the player only showed the ROM task and then sat on “初始化模拟器…”
while the rest arrived invisibly.

`version.json` also carries a `boot` list — `main.html`, every local
`src`/`href` it references, and the `java/*.jar` class libraries, each with its
size (`size: null` for a referenced file that is not on disk). The player reads
it twice:

- `frontend/src/composables/player/useCoreAssets.js` registers the tasks as soon
  as the core is known (that is what the panel lists as the two “core” rows,
  with byte totals, before anything is downloaded), and
- `frontend/src/composables/player/j2meCore.js` (`warmJ2meRuntime`) fetches
  those files under the same `?v=<version>` URLs before `prepareJ2me` opens the
  frame, reporting real byte progress. The frame's own requests then hit the
  browser cache (`cache: 'force-cache'`, js/css have a 12h `max-age`, the class
  library revalidates at worst) instead of downloading the same megabytes twice.

Only the class library for the chosen `enginemode` is fetched; the other two are
listed in `boot` but never requested or counted. A download failure is reported
as a failed task but never aborts the boot — the runtime has its own fetch and
its own 30 s startup timeout — and if the warm-up stalls (20 s without a single
new byte) it stops waiting, marks its tasks as skipped and lets the frame carry
on. Without a `version.json` (dev server, unstamped deployment) no “core” task
is registered at all and the panel falls back to ROM-only, exactly as before.


## Adapter

`frontend/src/composables/player/j2meRuntime.js` (`prepareJ2me`):

- Resolves the ROM to bytes, then reads the main class from
  `META-INF/MANIFEST.MF` inside the JAR (the manifest is usually deflated, so the
  ZIP central directory is walked and the entry is inflated with
  `DecompressionStream`). The class file itself is verified too, so an
  unlaunchable JAR fails with a clear message instead of timing out.
- Hands the JAR to the runtime as a `blob:` URL through the frame's query string,
  together with `midletClassName`, the class library (`enginemode1-classesold.jar`
  by default), the screen preset and the runtime version read from
  `/j2me/version.json` (see "Runtime asset versioning").
- Boots are reported, not assumed: an error the runtime reports while starting is
  held for `J2ME_BOOT_ERROR_GRACE_MS` (5 s) instead of failing the session, so
  the WebKit noise described below cannot kill a boot that is about to paint,
  and a session that never paints fails with the runtime's own message.
- **The frame is same-origin, not sandboxed.** The runtime keeps JAR and class
  state in IndexedDB, which browsers do not expose to an opaque-origin sandbox,
  so the JAR executes with this origin's privileges. A separate origin (its own
  host/port serving only these files) would restore that isolation and is the
  recommended follow-up; nothing else in the adapter depends on being
  same-origin except reading the VM canvas.
- The frame stays on-screen at the VM's screen size and is hidden with
  `opacity: 0`. Chrome throttles timers in frames it considers invisible to about
  one wake-up per second; that throttling is what made the previous runtime feel
  stuck (measured: an 18 s boot and ~1 % interpreter utilisation, both fixed by
  keeping the frame visible).
- The player displays a canvas the adapter owns, mirrored from the runtime's
  canvas by a short `setTimeout` loop, so the player UI, fullscreen and
  screenshots keep working on one element. The parent page deliberately does
  not use `requestAnimationFrame` for this mirror: Chromium's parent and
  J2meJS's nested RAF loops can trigger the runtime's allocator corruption
  during this game's loading screen. The timer path avoids that desktop-only
  freeze while preserving the existing mobile behavior.
- Keys go straight to `MIDP.sendKeyPress/sendKeyRelease` with the phone keypad
  codes below. `player` other than 1 is ignored, and J2ME is a single-player
  platform (see `PLATFORM_SINGLE_PLAYER`), so rooms give a seat to P1 only.

| Application button | Phone key | Code |
| --- | --- | --- |
| up / down / left / right | 方向键 (navigation keys) | -1 / -2 / -3 / -4 |
| x / a / y / b | 1 / 3 / 7 / 9 | 49 / 51 / 55 / 57 |
| l2 | 5 (confirm) | 53 |
| r2 | 0 | 48 |
| l / r | * / # | 42 / 35 |
| select / start | left / right soft key | -6 / -7 |

The cross sends MIDP's navigation key codes (`Canvas.KEY_UP/DOWN/LEFT/RIGHT`),
which is what a phone with a direction pad reports and what keypad-era MIDlets
compare against in `keyPressed` (the sample below checks `-1`/`50` and `-2`/`56`
in the same branches, so it answers to either convention). The face and shoulder
buttons stay on the phone keypad, whose labels the virtual pad shows.

Only MIDlets that never look at the raw key code can tell the conventions apart:
those ask `getGameAction()` / `GameCanvas.getKeyStates()`, and this build's
`KeyConverter` had dropped the keypad half of MIDP's game-action table, so the
keypad codes (5, 1/3/7/9) produced no action at all. The site patch restores the
table (2/4/6/8 → UP/LEFT/RIGHT/DOWN, 5 → FIRE, 1/3/7/9 → GAME_A..GAME_D — the
navigation codes were already there) and points the reverse table (`getKeyCode`)
at the codes this player actually sends, which is what MIDP defines it to answer.

## Verified behaviour (2026-10-14)

External sample `/www/wwwroot/default/GAME/J2ME/仙剑奇侠传.jar` (304 KB), run
through the production player entry in Chromium: first frame after **1.09 s**
(previous runtime: ~2.0 s after its timer fix, ~18 s before it), the phone **5**
key moves the title screen into the game's menu, no runtime errors. The menu
renders the same way under both runtimes (five vertical item columns); that is
the game's own layout, not a rendering defect.

Mobile, after the fixes above: the same game through the same player entry on
the deployed site, driven in **WebKit** (the engine behind iOS Safari and iOS
Edge) with an iPhone user agent and touch emulation — boot to a painted, running
session in ~6-8 s, `?v=<runtime version>` on every runtime request, and the
runtime frame's timers unthrottled (139 `setTimeout(…, 0)` ticks per 600 ms, rAF
firing). Chromium with mobile emulation boots the same way in ~5 s.

The fixture browser test (`tests/j2me-browser.test.js`) drives MIDlet bytecode,
input, pause/resume, missing-main-class handling, exit cleanup, the frame timer
guard, the versioned frame URL and both sides of the boot error grace period;
`tests/j2me-runtime.test.js` covers ROM validation and the manifest reader, and
`tests/j2me-runtime-patches.test.js` guards the vendored patches and the build
stamping. Real-game evidence directories from this session:
`/tmp/j2mejs/integrated`, `/tmp/j2mejs/matrix`, `/tmp/j2mejs/full`.

## Limitations

- Only `.jar`. JAD/JAM are descriptors, `.sqc` suites are not supported.
- Browsers without `DecompressionStream` / `deflate-raw` (older Android WebViews,
  some in-app browsers) cannot be pre-checked: the adapter only reads the JAR
  manifest when it can inflate it, and otherwise hands the game to the runtime,
  which reads the manifest with its own inflate. On those browsers an
  unlaunchable JAR therefore fails as a startup timeout instead of a readable
  message.
- No save states, no rewind, no cheats: `saveState`/`loadState` reject.
- In-game RMS storage is whatever the runtime keeps in IndexedDB; it is not tied
  to our cloud saves.
- MIDP high-level screens (Form/List/TextBox), the runtime's own dialogs and its
  on-screen keypad live inside the hidden frame, so only the game canvas is
  visible to the player.
- The class library choice matters per game; a ROM that needs MIDP 2.0 features
  may need `enginemode2-classes2.jar` instead of the default compatibility
  library.
- J2ME is single-player: one seat, no room control for anyone but the host.
