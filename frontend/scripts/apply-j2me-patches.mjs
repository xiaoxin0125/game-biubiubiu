#!/usr/bin/env node
// Re-apply the site patches to the vendored J2meJS runtime in this directory.
//
// The runtime is a vendored GPL-2.0 fork; patches are kept as small, idempotent
// text rewrites so the copy can be refreshed from upstream without losing them.
//
//   1. bld/main-all.js          — prefer window.__j2meJars over config.jars.split(":")
//   2. bld/main-all.js          — never let the compiled-method cache block/abort the boot
//   3. libs/compiled-method-cache.js — read the database handle only after it is open
//   4. main.html                — load preload.js and bridge.js
//   5. bld/main-all.js          — preserve the keypad game-action mappings
//   6. bld/j2me.js              — keep Java bounds/null/array-store checks active
//   7. bld/j2me.js              — turn failed array allocation into OutOfMemoryError
//   8. bld/j2me.js              — disable the optional compiled-method cache
//   9. bld/j2me.js              — a null receiver throws Java NullPointerException, not a JS TypeError
//  10. bld/j2me.js              — only uncaught Java exceptions are reported
//  11. bld/j2me.js              — no createException line per exception created
//  12. bld/main-all.js          — debug value dumps (key codes, config, manifest) removed
//  13. bld/main-all.js          — MIDP internals that are no-ops here stop warning
//  14. main.html                — load lcdui.js (the canvas LCDUI) after the runtime
//  15. bld/j2me.js              — an exception that unwound everything leaves the interpreter
//  16. bld/j2me.js              — a dead thread names its exception
//  17. bld/main-all.js          — the RMS listener registry stops warning
//  18. main.html                — load rms.js (RMS ⇄ 云存档) after the runtime
//  19. bld/main-all.js          — Chinese locale variants reach MIDlets as zh-CN / zh-HK
//  20. bld/j2me.js              — the interpreter yields, so one busy Java thread cannot
//                                 starve the event loop (without it another thread's
//                                 async work never finishes: 功夫西游 white screen)
//  21. bld/j2me.js              — a MIDlet that spells "UTF-8" as "UFT-8" still finds its
//                                 reader class (without it the thread dies and 昆仑千年情
//                                 never finishes loading)
//  22. bld/main-all.js          — drawRGB ignores an empty (zero width/height) region
//                                 instead of failing the paint and freezing the screen
//                                 (功夫西游 - 乱舞唐僧 froze mid-story)
//  23. bld/j2me.js              — a JavaScript error that is not a TypeError becomes a
//                                 Java exception with its message, not a bogus null
//  24. bld/main-all.js          — drawArc/fillArc are MIDP arcs: the ellipse sits in
//                                 the middle of the bounding box, not at its top-left
//                                 corner, and the sweep follows MIDP's angle
//                                 direction (without it 蹦球传说 paints the ball as a
//                                 red disc plus an oversized wedge)
//  25. bld/main-all.js          — Nokia's DirectGraphics.drawImage honours its
//                                 manipulation argument (rotate/flip) instead of
//                                 always drawing TRANS_NONE (without it 恐龙快打's
//                                 hero and mobs break apart whenever they face right)
//  26. main.html                — the built-in touch pad carries no inline event
//                                 handler: the CSP has no 'unsafe-inline', so the
//                                 browser refused to run it and logged a violation
//                                 on every selection started on the pad (bridge.js
//                                 re-attaches the behaviour as a listener)
//  27. bld/j2me.js              — a Java exception that unwound a nested interpreter
//                                 run reaches its caller instead of being swallowed
//                                 and faked as a normal return (without it 冒险小子's
//                                 missing-logo IOException never reaches the MIDlet's
//                                 catch, the loop keeps going with a null image and
//                                 the thread dies on the splash screen)
//  28. bld/j2me.js              — an execution window is half an animation frame (8ms),
//                                 not 80ms: the player mirrors the VM's canvas through a
//                                 timer on the same main thread, so an 80ms window left
//                                 the whole page about 13 turns a second (measured 159
//                                 stalls of ~72ms in 12s). Page frame production 13.6/s →
//                                 60/s and 正义化身－忍者神龟传 3.4 → 11.5fps (3.2 → 10.9
//                                 at 4x CPU throttling); 16ms still only reached 50~53/s
//  29. bld/main-all.js         — a clip rectangle that lies outside the target canvas
//                                 stays outside it: the fork masked all four edges with
//                                 `& 32767`, which turns a negative edge (a rectangle
//                                 wholly left of or above the canvas) into a huge one,
//                                 so the clip stopped clipping. Games that draw a sprite
//                                 by clipping to its rectangle and then blitting the whole
//                                 sheet onto the canvas painted a sheet-wide band across
//                                 the screen (恐龙快打's knocked-down characters)
//  30. bld/j2me.js              — the fork's own ReplaceMethod table finally reaches
//                                 methods a MIDlet calls from its own bytecode, which is
//                                 how bridge.js shims com.samsung.util.AudioClip into
//                                 answering "supported" (without it 冒险小子 treats its
//                                 level-constant array as never allocated and dies with a
//                                 NullPointerException the moment the player presses the
//                                 confirm key inside a level)
//
// Usage: node frontend/scripts/apply-j2me-patches.mjs [运行时目录]
//
// 这个脚本刻意放在 public/ 之外：public/ 里的任何文件都会被 vite 原样复制到
// frontend/dist 并当成静态资源对外提供，而它是开发期工具，不该被下载到
// （2026-10 审计 H-3）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 默认打在仓库里那份运行时上；也可以用第一个参数指定别的目录
// （例如已经被复制出去的 dist/j2me）。
const base = path.resolve(process.argv[2] || fileURLToPath(new URL('../public/j2me', import.meta.url)))

const patches = [
  {
    label: 'main-all.js: jars come from window.__j2meJars',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('window.__j2meJars || config.jars.split(":")'),
    anchor: 'if (config.jars) {\n  jars = jars.concat(config.jars.split(":"));\n}',
    replacement: `// Site patch: the player passes blob: URLs, which contain colons and cannot go
// through the ":" separator below. preload.js sets window.__j2meJars instead.
if (config.jars || window.__j2meJars) {
  jars = jars.concat(window.__j2meJars || config.jars.split(":"));
}`,
  },
  {
    label: 'main-all.js: compiled-method cache cannot stop the boot',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('compiled method cache unavailable'),
    anchor: 'window.onload = function() {\n  CompiledMethodCache.clear().then(function() {',
    replacement: `window.onload = function() {
  // Site patch (mobile boot): the compiled-method cache is only an optimisation,
  // and on WebKit/iOS its IndexedDB handle is not ready when window.onload fires
  // (upstream read it too early, which rejected the boot on every iOS browser).
  // Never let it stop or delay the VM: wait at most two seconds and start
  // regardless of how the cache behaves.
  var cacheReady = Promise.resolve().then(function() {
    return CompiledMethodCache.clear();
  }).catch(function(error) {
    console.warn("compiled method cache unavailable: " + error);
  });
  var cacheTimeout = new Promise(function(resolve) {
    setTimeout(resolve, 2000);
  });
  Promise.race([cacheReady, cacheTimeout]).then(function() {`,
  },
  {
    label: 'bld/j2me.js: disable the optional compiled-method cache',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('J2ME.enableCompiledMethodCache = false;'),
    anchor: '    J2ME.enableCompiledMethodCache = true && typeof CompiledMethodCache !== "undefined";',
    replacement: `    // Site patch (desktop compatibility): compiled methods are generated for this
    // runtime build and are cheap to regenerate. Do not restore or use methods
    // persisted by an older page/runtime from IndexedDB; that cache is only an
    // optimisation and stale methods can hang the desktop VM during boot.
    J2ME.enableCompiledMethodCache = false;`,
  },
  {
    label: 'compiled-method-cache.js: wait for the database before using it',
    file: 'libs/compiled-method-cache.js',
    applied: (text) => text.includes('openDatabase.then(function() { return new Promise('),
    anchor: 'return openDatabase.then(new Promise(function(resolve, reject) {',
    replacement: `// Site patch (mobile boot): \`openDatabase.then(new Promise(executor))\` runs
    // the executor at call time, i.e. before the database handle exists, so
    // reading \`database\` here threw on WebKit/iOS. Wait for it, then read it.
    return openDatabase.then(function() { return new Promise(function(resolve, reject) {`,
    close: { anchor: '    }));\n  }', replacement: '    }); });\n  }' },
    count: 2,
  },
  {
    label: 'main-all.js: class library follows the page runtime version',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('var pageVersion = null;'),
    anchor: `  var classedjarname='java/classes.jar';
  if(enginemode){
    //启用兼容模式
    classedjarname='java/'+enginemode;
  }`,
    replacement: `  var classedjarname='java/classes.jar';
  if(enginemode){
    //启用兼容模式
    classedjarname='java/'+enginemode;
  }
  // Site patch: main.html is opened with ?v=<runtime version>; requesting the
  // class library under that same version keeps it in step with the scripts'
  // long-lived HTTP cache instead of pairing a new page with an old archive.
  var pageVersion = null;
  try { pageVersion = new URLSearchParams(location.search).get('v'); } catch (error) { pageVersion = null; }
  if (pageVersion) classedjarname += '?v=' + encodeURIComponent(pageVersion);`,
  },
  {
    label: 'main-all.js: key codes carry their MIDP game actions and key queries',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('50:1,52:2,54:5,56:6,53:8,49:9,51:10,55:11,57:12')
      && text.includes('var keyMap = {1:-1, 2:-3, 5:-4, 6:-2, 8:53, 9:49, 10:51, 11:55, 12:57};'),
    anchor: '  var keyMap = {1:119, 2:97, 5:100, 6:115, 8:32, 9:113, 10:101, 11:122, 12:99};',
    replacement: `  // Site patch: the player keeps the phone keypad codes for the 确定 / game keys
  // and sends the navigation codes for the cross, so getKeyCode() answers with
  // exactly those — MIDP defines it as the key code this device delivers for the
  // action, not as one fixed code per action.
  var keyMap = {1:-1, 2:-3, 5:-4, 6:-2, 8:53, 9:49, 10:51, 11:55, 12:57};`,
    close: {
      anchor: '  var gameKeys = {119:1, 97:2, 115:6, 100:5, 32:8, 113:9, 101:10, 122:11, 99:12 , "-1":1, "-2":6, "-3":2, "-4":5, "-5":8, "-6":11,37:2,38:1,39:5,40:6,13:8,81:8,69:11}; //',
      replacement: `  // Site patch: this build dropped the keypad half of MIDP's game-action table,
  // so the phone keypad codes the player sends for 确定 and the game keys
  // (5, 1/3/7/9) produced no game action at all: a MIDlet that asks
  // getGameAction() (or reads GameCanvas.getKeyStates()) instead of comparing
  // the raw key code never saw them. MIDP maps KEY_NUM2/4/6/8 to UP/LEFT/RIGHT/
  // DOWN, KEY_NUM5 to FIRE and KEY_NUM1/3/7/9 to GAME_A..GAME_D; the navigation
  // codes the cross sends are in the table next to them.
  var gameKeys = {119:1, 97:2, 115:6, 100:5, 32:8, 113:9, 101:10, 122:11, 99:12 , "-1":1, "-2":6, "-3":2, "-4":5, "-5":8, "-6":11,37:2,38:1,39:5,40:6,13:8,81:8,69:11,50:1,52:2,54:5,56:6,53:8,49:9,51:10,55:11,57:12}; //`,
    },
  },
  {
    label: 'main-all.js: names for the navigation and soft keys',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('"-1":"Up", "-2":"Down", "-3":"Left", "-4":"Right"'),
    anchor: '  var keyNames = {119:"Up", 97:"Left", 100:"Right", 115:"Down", 32:"Select", 113:"Calendar", 101:"Addressbook", 122:"Menu", 99:"Mail"};',
    replacement: `  // Site patch: keyNames only knew the WASD-era codes. getKeyName() on the codes
  // the cross and the soft keys send fell through to String.fromCharCode(-1),
  // i.e. a placeholder character instead of the readable name MIDP asks for.
  var keyNames = {119:"Up", 97:"Left", 100:"Right", 115:"Down", 32:"Select", 113:"Calendar", 101:"Addressbook", 122:"Menu", 99:"Mail", "-1":"Up", "-2":"Down", "-3":"Left", "-4":"Right", "-5":"Select", "-6":"Softkey 1", "-7":"Softkey 2"};`,
  },
  {
    label: 'bld/j2me.js: a failed allocation raises a Java OutOfMemoryError',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('java/lang/OutOfMemoryError'),
    anchor: `        i32[addr + 0 /* OBJ_CLASS_ID_OFFSET */ >> 2] = arrayClassInfo.id;
        i32[addr + 4 /* ARRAY_LENGTH_OFFSET */ >> 2] = size;
        return addr;`,
    replacement: `        if (addr === 0) {
            // Site patch (allocator safety): the asm.js allocator returns 0 when it
            // cannot satisfy a request, and writing the array header at address 0
            // lands in the runtime's own low memory — which is where the GC keeps
            // its page tables and free lists. A corrupted free list makes the
            // allocator's search spin forever and takes the whole page with it
            // (reported with 正义化身－忍者神龟传, see INTEGRATION.md). Raise a Java
            // OutOfMemoryError instead, so the MIDlet sees a failure it can handle.
            throw $.ctx.createException("java/lang/OutOfMemoryError", "J2ME heap allocation failed");
        }
        i32[addr + 0 /* OBJ_CLASS_ID_OFFSET */ >> 2] = arrayClassInfo.id;
        i32[addr + 4 /* ARRAY_LENGTH_OFFSET */ >> 2] = size;
        return addr;`,
  },
  {
    label: 'bld/j2me.js: interpreter propagates Java runtime exceptions',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('case 1 /* ArrayIndexOutOfBoundsException */:\n                    J2ME.throwArrayIndexOutOfBoundsException(a);')
      && text.includes('case 3 /* NullPointerException */:\n                    J2ME.throwNullPointerException();'),
    anchor: `        Thread.prototype.throwException = function (fp, sp, pc, type, a) {
            this.set(fp, sp, pc);
            switch (type) {
                //这里拦截了报错
                case 1 /* ArrayIndexOutOfBoundsException */:
                    console.log('throwArrayIndexOutOfBoundsException'+a)
                    //J2ME.throwArrayIndexOutOfBoundsException(a);
                    break;
                case 0 /* ArithmeticException */:
                    console.log('ArithmeticException')
                    //J2ME.throwArithmeticException();
                    break;
                case 2 /* NegativeArraySizeException */:
                    
                    console.log('throwNegativeArraySizeException')
                    //J2ME.throwNegativeArraySizeException();
                    break;
                case 3 /* NullPointerException */:
                    //console.log('throwNullPointerException')
                    //J2ME.throwNullPointerException();
                    break;
            }
        };`,
    replacement: `        // Site patch (Java safety): the fork used to log these checks and then
        // continue executing the invalid bytecode. In compiled methods that means a
        // null field receiver or an out-of-range array index writes into arbitrary
        // asm.js memory, including the GC free-list metadata. Throw the Java
        // exception so the interpreter's normal unwind path handles it instead.
        Thread.prototype.throwException = function (fp, sp, pc, type, a) {
            this.set(fp, sp, pc);
            switch (type) {
                case 1 /* ArrayIndexOutOfBoundsException */:
                    J2ME.throwArrayIndexOutOfBoundsException(a);
                    break;
                case 0 /* ArithmeticException */:
                    J2ME.throwArithmeticException();
                    break;
                case 2 /* NegativeArraySizeException */:
                    J2ME.throwNegativeArraySizeException();
                    break;
                case 3 /* NullPointerException */:
                    J2ME.throwNullPointerException();
                    break;
            }
        };`,
  },
  {
    label: 'bld/j2me.js: null checks stop compiled invalid field accesses',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('function throwNullPointerException() {\n        throw $.newNullPointerException();\n    }'),
    anchor: `    function throwNullPointerException() {
        //console.log('newNullPointerException');
        //throw $.newNullPointerException();
    }`,
    replacement: `    function throwNullPointerException() {
        throw $.newNullPointerException();
    }`,
  },
  {
    label: 'bld/j2me.js: bounds checks stop compiled invalid array accesses',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('function throwArrayIndexOutOfBoundsException(index) {\n        throw $.newArrayIndexOutOfBoundsException(String(index));\n    }'),
    anchor: `    function throwArrayIndexOutOfBoundsException(index) {
        console.log("newArrayIndexOutOfBoundsException ");
        //throw $.newArrayIndexOutOfBoundsException(String(index));
    }`,
    replacement: `    function throwArrayIndexOutOfBoundsException(index) {
        throw $.newArrayIndexOutOfBoundsException(String(index));
    }`,
  },
  {
    label: 'bld/j2me.js: divide-by-zero checks propagate Java exceptions',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('function throwArithmeticException() {\n        throw $.newArithmeticException("/ by zero");\n    }'),
    anchor: `    function throwArithmeticException() {
        //hide this!!!! - by zixing
        //console.log("error / by zero")
        //throw $.newArithmeticException("/ by zero");
    }`,
    replacement: `    function throwArithmeticException() {
        throw $.newArithmeticException("/ by zero");
    }`,
  },
  {
    label: 'bld/j2me.js: array-store checks propagate Java exceptions',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('if (!isAssignableTo(valueClassInfo, arrayClassInfo.elementClass)) {\n            throw $.newArrayStoreException();\n        }'),
    anchor: `        if (!isAssignableTo(valueClassInfo, arrayClassInfo.elementClass)) {
            console.log('newArrayStoreException');
            return;
            throw $.newArrayStoreException(); 
        }`,
    replacement: `        if (!isAssignableTo(valueClassInfo, arrayClassInfo.elementClass)) {
            throw $.newArrayStoreException();
        }`,
  },
  {
    label: 'bld/j2me.js: interpreter checks primitive array references before bounds',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('case 46 /* IALOAD */')
      && text.includes('case 79 /* IASTORE */')
      && (text.match(/if \(arrayAddr === 0 \/\* NULL \*\/\)/g) || []).length >= 13,
    transform: (text) => {
      const unguarded = `                        arrayAddr = i32[--sp];
                        if ((index >>> 0) >= (i32[arrayAddr + 4 /* ARRAY_LENGTH_OFFSET */ >> 2] >>> 0)) {
                            thread.throwException(fp, sp, opPC, 1 /* ArrayIndexOutOfBoundsException */, index);
                        }`
      const guarded = `                        arrayAddr = i32[--sp];
                        if (arrayAddr === 0 /* NULL */) {
                            thread.throwException(fp, sp, opPC, 3 /* NullPointerException */);
                            continue;
                        }
                        if ((index >>> 0) >= (i32[arrayAddr + 4 /* ARRAY_LENGTH_OFFSET */ >> 2] >>> 0)) {
                            thread.throwException(fp, sp, opPC, 1 /* ArrayIndexOutOfBoundsException */, index);
                        }`
      if (!text.includes(unguarded)) throw new Error('primitive array operations are already patched or their anchor changed')
      const duplicate = `${guarded}\n${guarded}`
      return text.split(unguarded).join(guarded).split(duplicate).join(guarded)
    },
  },
  {
    label: 'bld/j2me.js: compiled primitive array stores check null first',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('BaselineCompiler.prototype.emitStoreIndexed')
      && text.includes('            this.emitNullPointerCheck(array);\n            this.emitBoundsCheck(array, index);'),
    transform: (text) => {
      const anchor = `            if (kind === 8 /* Reference */) {
                this.emitNullPointerCheck(array);
            }`
      if (!text.includes(anchor)) throw new Error('compiled array-store null-check anchor not found')
      return text.replace(anchor, '            this.emitNullPointerCheck(array);')
    },
  },
  {
    // The touch pad carries `onselectstart='return false'` upstream (next to an
    // `οnselect` whose "o" is a Greek omicron, so that one never ran at all). This
    // site's Content-Security-Policy is `script-src 'self' blob: 'unsafe-eval'
    // 'wasm-unsafe-eval'`: an inline handler is refused, and the browser logs
    // "Executing inline event handler violates ..." every time a selection starts on
    // the pad. Neither a hash nor a nonce can authorise an attribute like this, so
    // the attribute goes and bridge.js attaches the same behaviour as a listener.
    label: 'main.html: the built-in touch pad carries no inline event handler',
    file: 'main.html',
    applied: (text) => text.includes('<div id="gamepad">'),
    transform: (text) => {
      const tag = /<div id="gamepad"[^>]*>/
      if (!tag.test(text)) throw new Error('gamepad anchor not found')
      return text.replace(tag, '<div id="gamepad">')
    },
  },
  {
    label: 'main.html: preload.js and bridge.js',
    file: 'main.html',
    applied: (text) => text.includes('bridge.js'),
    anchor: '<script defer src="config/urlparams.js"></script>',
    replacement: `<script defer src="config/urlparams.js"></script>
<script defer src="preload.js"></script>`,
    then: {
      anchor: '<script defer src="bld/main-all.js"></script>',
      replacement: `<script defer src="bld/main-all.js"></script>
<script defer src="bridge.js"></script>`,
    },
  },
  {
    // The MIDP high-level screens (Form / List / Alert / Gauge …) are drawn into the
    // runtime's canvas by lcdui.js. The runtime's own implementation builds DOM
    // elements inside its page; the player mirrors only `#canvas`, so a game that
    // opens with a Form or List showed nothing at all (and timed out at boot).
    // lcdui.js has to load after main-all.js, whose LCDUI natives it replaces.
    label: 'main.html: lcdui.js',
    file: 'main.html',
    applied: (text) => text.includes('lcdui.js'),
    anchor: '<script defer src="bld/main-all.js"></script>\n<script defer src="bridge.js"></script>',
    replacement: `<script defer src="bld/main-all.js"></script>
<script defer src="lcdui.js"></script>
<script defer src="bridge.js"></script>`,
  },
  {
    label: 'bld/j2me.js: a null receiver throws Java NullPointerException, not a JS TypeError',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (virtual call null check)'),
    anchor: `                                case 182 /* INVOKEVIRTUAL */:
                                    calleeTargetMethodInfo = classInfo.vTable[calleeMethodInfo.vTableIndex];
                                    break;
                                case 185 /* INVOKEINTERFACE */:
                                    calleeTargetMethodInfo = classInfo.iTable[calleeMethodInfo.mangledName];
                                    break;`,
    replacement: `                                // Site patch (virtual call null check): the INVOKESPECIAL
                                // case above checks the receiver, but the virtual and interface
                                // cases dereferenced classInfo, which the invoke path sets to null
                                // when the receiver is null. The result was a JavaScript TypeError
                                // that only became a Java NullPointerException at the interpreter's
                                // catch (translateException) -- a red console error on every such
                                // call, and a JS exception unwinding through code that expects a
                                // Java one. Throw it here, like INVOKESPECIAL does; throwException
                                // never returns for a NullPointerException.
                                case 182 /* INVOKEVIRTUAL */:
                                    if (address === 0 /* NULL */) {
                                        thread.throwException(fp, sp, opPC, 3 /* NullPointerException */);
                                        calleeTargetMethodInfo = calleeMethodInfo;
                                        break;
                                    }
                                    calleeTargetMethodInfo = classInfo.vTable[calleeMethodInfo.vTableIndex];
                                    break;
                                case 185 /* INVOKEINTERFACE */:
                                    if (address === 0 /* NULL */) {
                                        thread.throwException(fp, sp, opPC, 3 /* NullPointerException */);
                                        calleeTargetMethodInfo = calleeMethodInfo;
                                        break;
                                    }
                                    calleeTargetMethodInfo = classInfo.iTable[calleeMethodInfo.mangledName];
                                    break;`,
  },
  {
    label: 'bld/j2me.js: only uncaught Java exceptions reach the console',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (quiet handled exceptions)'),
    anchor: `                if(e && e.constructor && e.constructor.prototype && e.constructor.prototype.classInfo && e.constructor.prototype.classInfo._name)
                {
                    var detailMessage=''
                    if(e.detailMessage){
                        detailMessage=J2ME.fromStringAddr(e.detailMessage);
                    }
                    console.warn("error occurs at : "+e.constructor.prototype.classInfo._name +" detailMessage: "+detailMessage);
                    console.error(e); 
                }else{
                    console.error(e);
                } `,
    replacement: `                if(e && e.constructor && e.constructor.prototype && e.constructor.prototype.classInfo && e.constructor.prototype.classInfo._name)
                {
                    // Site patch (quiet handled exceptions): a Java exception passing
                    // through here is the normal case -- MIDlets raise and catch them
                    // constantly, and this fork printed a warning plus an object dump for
                    // every one of them. Keep it on the debug channel, which the devtools
                    // console hides unless verbose logging is switched on; the uncaught
                    // case is reported once by exceptionUnwind instead.
                    var detailMessage=''
                    if(e.detailMessage){
                        detailMessage=J2ME.fromStringAddr(e.detailMessage);
                    }
                    console.debug("error occurs at : "+e.constructor.prototype.classInfo._name +" detailMessage: "+detailMessage, e);
                }else{
                    console.error(e);
                } `,
    then: {
      anchor: `                    case FrameType.ExitInterpreter:
                        this.popMarkerFrame(FrameType.ExitInterpreter);
                        throw e;`,
      replacement: `                    case FrameType.ExitInterpreter:
                        // Site patch (quiet handled exceptions): the search walked every
                        // frame without finding a handler. That is only the thread's own
                        // bottom marker (fp === bp) when nothing in the MIDlet will catch
                        // this: another marker means compiled code called in here, and the
                        // compiled frames above -- which this search cannot see -- have
                        // their own handlers for it. Reporting those turned a handled
                        // exception into a red line in the console.
                        if (this.fp === this.bp) {
                            console.error("Uncaught Java exception: " +
                                (e && e.classInfo ? e.classInfo._name : String(e)) +
                                (e && e.detailMessage ? ", detailMessage: " + J2ME.fromStringAddr(e.detailMessage) : ""));
                        }
                        else {
                            console.debug("Java exception left the interpreter: " +
                                (e && e.classInfo ? e.classInfo._name : String(e)));
                        }
                        this.popMarkerFrame(FrameType.ExitInterpreter);
                        throw e;`,
    },
  },
  {
    // The fork leaves its author's debugging in the shipped build: a bare key code on
    // every key press, the whole manifest and JAR-store objects on every load, and an
    // undefined config value at boot. The runtime's own informational output (boot
    // progress, media lifecycle, thread ids) is deliberately left alone; only these
    // repeating value dumps go.
    label: 'main-all.js: debug value dumps stop printing',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (no debug logging)'),
    transform: (text) => {
      const drops = [
        {
          anchor: `      console.log(config)`,
          replacement: `      // Site patch (no debug logging): the fork printed the whole config object here.`,
        },
        {
          anchor: `      console.log(MIDP.manifest)`,
          replacement: `      // Site patch (no debug logging): the fork printed the whole manifest object here.`,
        },
        {
          anchor: `        console.log(res);`,
          replacement: `        // Site patch (no debug logging): the fork printed the JAR store result object here.`,
        },
        {
          anchor: `    console.log(keyCode);`,
          replacement: `    // Site patch (no debug logging): the fork printed every key code here.`,
        },
        {
          anchor: `console.log("config.gamepadSize "+config.gamepadSize);`,
          replacement: `// Site patch (no debug logging): the fork printed this config value, always undefined.`,
        },
      ]
      let next = text
      for (const { anchor, replacement } of drops) {
        if (!next.includes(anchor)) {
          throw new Error('anchor not found in bld/main-all.js: ' + anchor.trim().slice(0, 90))
        }
        next = next.split(anchor).join(replacement)
      }
      return next
    },
  },
  {
    label: 'bld/j2me.js: the createException debug line stops printing',
    file: 'bld/j2me.js',
    applied: (text) => !text.includes(`console.log('createException',className,message);`),
    anchor: `            console.log('createException',className,message);`,
    replacement: `            // Site patch (no debug logging): the fork printed a line for every exception created.`,
  },
  {
    // These natives are no-ops (or already answer correctly) on a runtime that draws
    // only the MIDlet's display area, runs one MIDlet at a time and keeps no AMS list.
    // The fork still warns on every call, which buries real problems: 仙剑奇侠传 alone
    // prints eight of them before its title screen. Each replacement records why the
    // no-op is right, so the next reader does not have to guess.
    label: 'main-all.js: no-op MIDP internals stop warning',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (silent MIDP internals)'),
    transform: (text) => {
      const silent = [
        {
          anchor: `Native["com/sun/j2me/content/AppProxy.midletIsAdded.(ILjava/lang/String;)V"] = function(addr, suiteId, classNameAddr) {
  console.warn("com/sun/j2me/content/AppProxy.midletIsAdded.(ILjava/lang/String;)V not implemented");
};`,
          replacement: `Native["com/sun/j2me/content/AppProxy.midletIsAdded.(ILjava/lang/String;)V"] = function(addr, suiteId, classNameAddr) {
  // Site patch (silent MIDP internals): CHAPI bookkeeping for the AMS list of installed
  // MIDlets. This runtime does not keep one, so there is nothing to add.
};`,
        },
        {
          anchor: `  Native["com/sun/midp/midletsuite/MIDletSuiteImpl.lockMIDletSuite.(IZ)V"] = function(addr, id, lock) {
    console.warn("MIDletSuiteImpl.lockMIDletSuite.(IZ)V not implemented (" + id + ", " + lock + ")");
  };`,
          replacement: `  Native["com/sun/midp/midletsuite/MIDletSuiteImpl.lockMIDletSuite.(IZ)V"] = function(addr, id, lock) {
    // Site patch (silent MIDP internals): the AMS locks a suite's storage while it
    // installs or deletes one. One MIDlet runs at a time here and nothing else touches
    // its suite directory, so there is no lock to take.
  };`,
        },
        {
          anchor: `  Native["com/sun/midp/midletsuite/MIDletSuiteImpl.unlockMIDletSuite.(I)V"] = function(addr, suiteId) {
    console.warn("MIDletSuiteImpl.unlockMIDletSuite.(I)V not implemented (" + suiteId + ")");
  };`,
          replacement: `  Native["com/sun/midp/midletsuite/MIDletSuiteImpl.unlockMIDletSuite.(I)V"] = function(addr, suiteId) {
    // Site patch (silent MIDP internals): pairs with lockMIDletSuite above, which never
    // takes a lock.
  };`,
        },
        {
          anchor: `    self.trusted = 1;
    console.warn("com/sun/midp/midletsuite/InstallInfo.load.()V incomplete");`,
          replacement: `    // Site patch (silent MIDP internals): the suite record only carries the trust flag
    // so far; the installer asks for nothing else. Keep it quiet until something reads
    // a field that is really missing.
    self.trusted = 1;`,
        },
        {
          anchor: `  Native["javax/microedition/lcdui/Display.drawTrustedIcon0.(IZ)V"] = function(addr, dispId, drawTrusted) {
    console.warn("Display.drawTrustedIcon0.(IZ)V not implemented (" + dispId + ", " + drawTrusted + ")");
  };`,
          replacement: `  Native["javax/microedition/lcdui/Display.drawTrustedIcon0.(IZ)V"] = function(addr, dispId, drawTrusted) {
    // Site patch (silent MIDP internals): shows or hides the "trusted MIDlet" icon in
    // the platform's title bar. This runtime draws the MIDlet's display area and no
    // title bar of its own, so both directions are a no-op.
  };`,
        },
        {
          anchor: `  Native["com/sun/midp/suspend/SuspendSystem$MIDPSystem.allMidletsKilled.()Z"] = function(addr) {
    console.warn("SuspendSystem$MIDPSystem.allMidletsKilled.()Z not implemented");
    return 0;
  };`,
          replacement: `  Native["com/sun/midp/suspend/SuspendSystem$MIDPSystem.allMidletsKilled.()Z"] = function(addr) {
    // Site patch (silent MIDP internals): answers whether the platform killed every
    // MIDlet behind the app's back. It never does here, so the answer is always false.
    return 0;
  };`,
        },
        {
          anchor: `  Native["com/sun/midp/lcdui/DisplayDevice.displayStateChanged0.(II)V"] = function(addr, hardwareId, state) {
    console.warn("DisplayDevice.displayStateChanged0.(II)V not implemented (" + hardwareId + ", " + state + ")");
  };`,
          replacement: `  Native["com/sun/midp/lcdui/DisplayDevice.displayStateChanged0.(II)V"] = function(addr, hardwareId, state) {
    // Site patch (silent MIDP internals): the phone's display power and rotation state
    // belong to the host page here, and the MIDlet's canvas is drawn at a fixed size.
    // Nothing to reconfigure.
  };`,
        },
        {
          anchor: `  Native["javax/microedition/lcdui/CanvasLFImpl.createNativeResource0.(Ljava/lang/String;Ljava/lang/String;)I"] = function(addr, titleAddr, tickerAddr) {
    console.warn("javax/microedition/lcdui/CanvasLFImpl.createNativeResource0.(Ljava/lang/String;Ljava/lang/String;)I not implemented");
    curDisplayableId = nextMidpDisplayableId++;
    return curDisplayableId;
  };`,
          replacement: `  Native["javax/microedition/lcdui/CanvasLFImpl.createNativeResource0.(Ljava/lang/String;Ljava/lang/String;)I"] = function(addr, titleAddr, tickerAddr) {
    // Site patch (silent MIDP internals): handing the LFImpl a fresh displayable id is
    // the whole implementation -- the id is what the other LFImpl natives receive back.
    curDisplayableId = nextMidpDisplayableId++;
    return curDisplayableId;
  };`,
        },
        {
          anchor: '  addUnimplementedNative("com/sun/j2me/content/InvocationStore.setCleanup0.(ILjava/lang/String;Z)V");',
          replacement: `  // Site patch (silent MIDP internals): CHAPI asks whether an invocation should be
  // cleaned up when the MIDlet exits. Nothing here keeps an invocation between runs,
  // so there is nothing to clean up. addUnimplementedNative cannot say that: it warns
  // on its first call whatever body it is given, so register the native directly.
  Native["com/sun/j2me/content/InvocationStore.setCleanup0.(ILjava/lang/String;Z)V"] = function(addr, suiteId, classNameAddr, cleanup) {
  };`,
        },
      ]
      let next = text
      for (const { anchor, replacement } of silent) {
        if (!next.includes(anchor)) {
          throw new Error('anchor not found: ' + anchor.split('\n')[0].trim().slice(0, 90))
        }
        next = next.split(anchor).join(replacement)
      }
      return next
    },
  },
  {
    // An exception that has already unwound past every frame is on this path on
    // purpose: fastInterpreterFrameAdapter pushes an ExitInterpreter marker so a nested
    // interpreter invocation hands the exception back to the compiled method that called
    // it, and Thread.start0 pushes the thread's own marker at the bottom. The fork
    // swallowed whatever came out of the unwind and continued the interpreter loop; the
    // loop then re-ran the faulting instruction on a stack the unwind had just removed
    // (sp growing a little on every iteration), the Java handler up the stack never saw
    // the exception, and the console filled with one red line per iteration. In 正义化身
    // －忍者神龟传 that was the difference between a game that plays and one that sits on
    // its loading screen for good.
    label: 'bld/j2me.js: an exception that unwound everything leaves the interpreter',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (thread death)'),
    anchor: `                }catch(err){
                    console.error(err)
                    continue;
                }`,
    replacement: `                }catch(err){
                    // Site patch (thread death): an exception carrying a classInfo is a
                    // Java exception that exceptionUnwind put on this path on purpose.
                    // fastInterpreterFrameAdapter pushes the ExitInterpreter marker so a
                    // nested interpreter invocation hands such an exception back to the
                    // compiled method that called it (the compiled code has its own
                    // handlers); Thread.start0 pushes one for the thread as a whole.
                    // Swallowing it here returned the interpreter to a frame stack it
                    // had just unwound: the faulting instruction re-ran forever with a
                    // stack that kept growing, the Java handler further up never got
                    // the exception, and the console filled with one red line per
                    // iteration while the MIDlet sat on its loading screen. Let the
                    // exception through so the ordinary unwind continues.
                    if (err && err.classInfo) {
                        throw err;
                    }
                    console.error(err)
                    continue;
                }`,
  },
  {
    // The same catch printed the raw value, and a Java exception is a plain object to the
    // console, so the one line that explains a dead thread read "[object Object]".
    label: 'bld/j2me.js: a dead thread names its exception',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (readable thread death)'),
    anchor: `            catch (e) {
                console.error(e); 
                /*
                // The exception was never caught and the thread must be terminated.`,
    replacement: `            catch (e) {
                // Site patch (readable thread death): this catch used to print the raw
                // value, and a Java exception is a plain object here, so the one line
                // that explains why a thread died reached the console as "[object
                // Object]". Name the class and its detail message instead; a JavaScript
                // error still prints as itself.
                if (e && e.classInfo && e.classInfo._name) {
                    console.error("Thread terminated by " + e.classInfo._name +
                        (e.detailMessage ? ": " + J2ME.fromStringAddr(e.detailMessage) : ""));
                } else {
                    console.error(e);
                }
                /*
                // The exception was never caught and the thread must be terminated.`,
  },
  {
    // Same family as the silent MIDP internals above: the RMS listener registry exists so
    // the AMS can tell *other* MIDlets that a record store changed. One MIDlet runs at a
    // time here and nothing keeps a registry, so these natives have no work to do -- they
    // answered with a warning instead (two of them on every record store open and close).
    label: 'main-all.js: the RMS listener registry stops warning',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (silent RMS registry)'),
    anchor: `Native["com/sun/midp/rms/RecordStoreRegistry.getRecordStoreListeners.(ILjava/lang/String;)[I"] = function(addr, suiteId, storeNameAddr) {
  console.warn("RecordStoreRegistry.getRecordStoreListeners.(IL...String;)[I not implemented (" + suiteId + ", " + J2ME.fromStringAddr(storeNameAddr) + ")");
  return J2ME.Constants.NULL;
};
Native["com/sun/midp/rms/RecordStoreRegistry.sendRecordStoreChangeEvent.(ILjava/lang/String;II)V"] = function(addr, suiteId, storeNameAddr, changeType, recordId) {
  console.warn("RecordStoreRegistry.sendRecordStoreChangeEvent.(IL...String;II)V not implemented (" + suiteId + ", " + J2ME.fromStringAddr(storeNameAddr) + ", " + changeType + ", " + recordId + ")");
};
Native["com/sun/midp/rms/RecordStoreRegistry.startRecordStoreListening.(ILjava/lang/String;)V"] = function(addr, suiteId, storeNameAddr) {
  console.warn("RecordStoreRegistry.startRecordStoreListening.(IL...String;)V not implemented (" + suiteId + ", " + J2ME.fromStringAddr(storeNameAddr) + ")");
};
Native["com/sun/midp/rms/RecordStoreRegistry.stopRecordStoreListening.(ILjava/lang/String;)V"] = function(addr, suiteId, storeNameAddr) {
  console.warn("RecordStoreRegistry.stopRecordStoreListening.(IL...String;)V not implemented (" + suiteId + ", " + J2ME.fromStringAddr(storeNameAddr) + ")");
};
Native["com/sun/midp/rms/RecordStoreRegistry.stopAllRecordStoreListeners.(I)V"] = function(addr, taskId) {
  console.warn("RecordStoreRegistry.stopAllRecordStoreListeners.(I)V not implemented (" + taskId + ")");
};`,
    replacement: `// Site patch (silent RMS registry): the RMS listener registry is AMS bookkeeping for
// telling *other* MIDlets that a record store changed. One MIDlet runs at a time here
// and nothing keeps a registry, so these are the honest answers -- no listeners to hand
// out, no listeners to start or stop, nobody to notify -- instead of a warning per call.
Native["com/sun/midp/rms/RecordStoreRegistry.getRecordStoreListeners.(ILjava/lang/String;)[I"] = function(addr, suiteId, storeNameAddr) {
  return J2ME.Constants.NULL;
};
Native["com/sun/midp/rms/RecordStoreRegistry.sendRecordStoreChangeEvent.(ILjava/lang/String;II)V"] = function(addr, suiteId, storeNameAddr, changeType, recordId) {
};
Native["com/sun/midp/rms/RecordStoreRegistry.startRecordStoreListening.(ILjava/lang/String;)V"] = function(addr, suiteId, storeNameAddr) {
};
Native["com/sun/midp/rms/RecordStoreRegistry.stopRecordStoreListening.(ILjava/lang/String;)V"] = function(addr, suiteId, storeNameAddr) {
};
Native["com/sun/midp/rms/RecordStoreRegistry.stopAllRecordStoreListeners.(I)V"] = function(addr, taskId) {
};`,
  },
  {
    // The player treats the runtime's `/RecordStore` tree as "this ROM's save file": it
    // restores a cloud snapshot before the MIDlet starts and uploads the tree again when
    // the game writes to it. Both live in rms.js, which needs the runtime's `fs` and its
    // `loadingPromises` (the boot awaits that list, so the import finishes before the VM
    // starts) — hence it loads right after main-all.js like lcdui.js does.
    label: 'main.html: rms.js',
    file: 'main.html',
    applied: (text) => text.includes('rms.js'),
    anchor: '<script defer src="bld/main-all.js"></script>\n<script defer src="lcdui.js"></script>',
    replacement: `<script defer src="bld/main-all.js"></script>
<script defer src="lcdui.js"></script>
<script defer src="rms.js"></script>`,
  },
  {
    // MIDP's microedition.locale is the *device* language: real Chinese phones answer
    // with plain zh-CN (simplified) or zh-HK (traditional), and MIDlets build their own
    // resource name out of that string (`/lang.<value>`). One extra subtag and the game
    // falls back to its default bundle — 「蹦球传说」 only ships lang.xx / lang.zh-CN /
    // lang.zh-HK, so a phone that reports zh-SG (or zh-Hans-CN, zh-Hant-TW …) gets the
    // English game. Browsers report their own spelling, hence this rewrite: fold the
    // Chinese variants onto the device-language names. The player page can override the
    // result outright by passing `language` in the runtime URL (urlparams.js copies it
    // to config.language — see frontend/src/composables/player/j2meLanguage.js).
    label: 'main-all.js: Chinese locale variants reach MIDlets as zh-CN / zh-HK',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (locale):'),
    transform: (text) => {
      const anchor = 'Native["java/lang/System.getProperty0.(Ljava/lang/String;)Ljava/lang/String;"] = function(addr, keyAddr) {'
      if (!text.includes(anchor)) throw new Error('System.getProperty0 anchor not found')
      const helper = `// Site patch (locale): MIDP's microedition.locale is the device language -- a
// simplified-Chinese phone answers zh-CN and a traditional one zh-HK. MIDlets pick
// their resource bundle by that exact string (\`/lang.<value>\`) and fall back to English
// over the smallest difference, while navigator.language answers with the browser's own
// spelling (zh-Hans-CN, zh-SG, zh-Hant-TW, ...). Fold the Chinese variants onto the
// names MIDlets ship; the player page can override the whole thing with its \`language\`
// parameter (URL -> config.language). See frontend/scripts/apply-j2me-patches.mjs.
function siteLocale() {
  var wanted = String(config.language || navigator.language || '');
  var normalized = wanted.replace(/_/g, '-').toLowerCase();
  if (normalized === 'zh' || normalized.indexOf('zh-') === 0) {
    if (normalized.indexOf('hans') >= 0) return 'zh-CN';
    var traditional = normalized.indexOf('hant') >= 0 || normalized.indexOf('-tw') >= 0 ||
      normalized.indexOf('-hk') >= 0 || normalized.indexOf('-mo') >= 0;
    return traditional ? 'zh-HK' : 'zh-CN';
  }
  return wanted;
}

`
      let next = text.replace(anchor, helper + anchor)
      const assignments = (next.match(/value = navigator\.language;/g) || []).length
      if (assignments !== 2) throw new Error(`expected 2 locale assignments, found ${assignments}`)
      next = next.replace(/value = navigator\.language;/g, 'value = siteLocale();')
      return next
    },
  },
  // 解释器自己不让出执行权，而 fork 又把编译方法的抢占检查关了
  // （emitCheckPreemption = false），于是一个不阻塞的 Java 线程可以把 JS 事件循环
  // 一直占住：另一个线程在异步 native 里等的那次 setTimeout / Promise 永远轮不上，
  // 那个线程就再也醒不过来，页面冻结。「功夫西游 - 乱舞唐僧」正是这样白屏的 ——
  // 绘制线程在 paint() 里调用 Java 侧的 System.gc()（该 native 用 setTimeout +
  // Promise 挂起调用线程），它的主循环 meanwhile 在 busy-wait 等这次绘制写完标志。
  {
    label: 'bld/j2me.js: the interpreter yields to the scheduler while it runs',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (interpreter preemption)'),
    anchor: `            opPC = pc, op = code[pc], pc = pc + 1 | 0;
            lastPC = opPC;`,
    replacement: `            opPC = pc, op = code[pc], pc = pc + 1 | 0;
            lastPC = opPC;
            // Site patch (interpreter preemption): 编译出来的方法里有 PS++/PE() 这对
            // 检查（fork 又用 J2ME.emitCheckPreemption = false 关掉了），解释器里一个
            // 都没有 —— 于是一个不阻塞的 Java 线程能让 JS 事件循环永远不回来。后果不
            // 只是「卡」：别的线程在异步 native 里等的 setTimeout / Promise 也因此永
            // 远不执行，那个线程再也不会被唤醒。「功夫西游 - 乱舞唐僧」的绘制线程在
            // paint() 里调用 System.gc()（这个 native 用 setTimeout + Promise 挂起调用
            // 线程），它的主循环同时在 busy-wait 等这次绘制置回标志，两边就这样互等，
            // 页面白屏、整页无响应。这里用同一套计数器按周期让步：要不要让、什么时候
            // 让由 Scheduler.shouldPreempt() 决定（80ms 执行窗口 + 5ms 检查间隔），没
            // 到点就是一次自增加一次掩码判断。让步时把解释器帧的 fp/sp/pc 存回线程，
            // Context.execute 按 U=Yielding 重新排队，恢复后从这条指令继续 —— 与
            // classInitAndUnwindCheck 之后那句 \`if (U) return;\` 是同一条路径。掩码取
            // 1023 而不是编译代码的 0xFF：解释器每条字节码都要过这个判断。
            if ((++PS & 1023) === 0) {
                PE();
                if (U) {
                    thread.set(fp, sp, opPC);
                    return;
                }
            }`,
  },
  // 有些 MIDlet 把「UTF-8」拼成「UFT-8」（两个字母换了位置）。CLDC 的 Helper 按这个
  // 名字去加载 com/sun/cldc/i18n/j2me/UFT_8_Reader，而三个类库里都只有拼写正确的
  // UTF_8_Reader：Class.forName 抛 ClassNotFoundException，没人接住它的那个线程就此
  // 结束——在控制台上就是一行警告加深红色的 NullPointerException。「昆仑千年情」
  // （诺基亚 N73 版 ROM）正是这样加载不进去的：它启动早期要读一段按这个编码写的中文
  // 文本。真机上厂商的内置类库往往连拼错的这一类也一起留着，所以游戏照写不误。这里在
  // 类加载的最后一跳做别名回退：请求 UFT_* 而读不到时按同名的 UTF_* 再读一次，让这类
  // 游戏以自己的拼写跑起来；Java 侧拿到的 Class 名字因此是 UTF_8_Reader，对这层用途
  // （new InputStreamReader(is, "UFT-8")）没有影响。
  {
    label: 'bld/j2me.js: a MIDlet that spells UTF-8 as UFT-8 still finds its reader class',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (misspelled encoding class)'),
    anchor: `            var bytes = JARStore.loadFile(fileName);
            //console.log(bytes)
            if (!bytes) {
                console.warn("ClassNotFoundException "+fileName);`,
    replacement: `            var bytes = JARStore.loadFile(fileName);
            // Site patch (misspelled encoding class): 少数 MIDlet（「昆仑千年情」是
            // 一个）把 "UTF-8" 写成了 "UFT-8"，Helper 于是去要
            // com/sun/cldc/i18n/j2me/UFT_8_Reader —— 类库里只有拼写正确的
            // UTF_8_Reader，加载失败抛出 ClassNotFoundException，最终把调用它的线程
            // 一起带走。真机上拼错的那一类往往也存在，所以游戏不会自查。请求 UFT_*
            // 读不到时按同名的 UTF_* 再读一次就够了：两份实现的差别只在类名上，而
            // 调用方（new InputStreamReader(is, "UFT-8")）只关心读出来的字符。
            if (!bytes && fileName.indexOf("com/sun/cldc/i18n/j2me/UFT_") === 0) {
                bytes = JARStore.loadFile(fileName.replace("UFT_", "UTF_"));
            }
            //console.log(bytes)
            if (!bytes) {
                console.warn("ClassNotFoundException "+fileName);`,
  },
  // 剧情场景定住不动的根因：绘制精灵时游戏会传一个宽或高为 0 的区域给
  // Graphics.drawRGB（真机上就是什么都不画），而这份实现把它直接交给浏览器的
  // createImageData()，浏览器对非正尺寸抛 IndexSizeError；运行时的 translateException
  // 认不出这个 DOMException（只认 TypeError），异常于是带着 _address === undefined
  // 继续走，编译代码的 catch 把它当成 Java 异常重新抛出 —— 抛出来的是 null，紧接着的
  // 空检查又抛出一个假的 NullPointerException。MIDP 规定 paint() 抛出的异常由实现忽略
  // （canvas 保留上一帧），于是这一帧之后每次重绘都在同一处失败，画面永远停在最后一张
  // 画成功的画面上：「功夫西游 - 乱舞唐僧」剧情卡死就是这个样子，输入其实还在进游戏。
  {
    label: 'main-all.js: drawRGB ignores an empty region instead of failing the paint',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (empty drawRGB)'),
    anchor: `  Native["javax/microedition/lcdui/Graphics.drawRGB.([IIIIIIIZ)V"] = function(addr, rgbDataAddr, offset, scanlength, x, y, width, height, processAlpha) { 
    var rgbData = J2ME.getArrayFromAddr(rgbDataAddr);`,
    replacement: `  Native["javax/microedition/lcdui/Graphics.drawRGB.([IIIIIIIZ)V"] = function(addr, rgbDataAddr, offset, scanlength, x, y, width, height, processAlpha) { 
    // Site patch (empty drawRGB): 宽或高为 0 / 负数 / NaN 的区域没有像素可画，真机上
    // 就是什么都不画。这里原来照原样交给 createImageData(width, height)，浏览器对非正
    // 尺寸抛 IndexSizeError（DOMException，不是 TypeError），translateException 认不出
    // 它，异常就被编译代码当成「重新抛出的异常是 null」，最终变成一个假的
    // NullPointerException 打断整帧绘制 —— 而 paint() 的异常按 MIDP 规定被忽略，画面
    // 于是永远停在上一帧，游戏逻辑却还在跑（还能听到按键的反应）。空区域在这里直接
    // 返回，语义与真机一致。
    if (!(width > 0) || !(height > 0)) return;
    var rgbData = J2ME.getArrayFromAddr(rgbDataAddr);`,
  },
  // 与上一条配套的兜底：不认识的 JavaScript 异常原来原样返回，而编译代码马上要读它的
  // _address，读出来是 undefined —— 浏览器给出的真实原因（DOMException 的 name 与
  // message）就此丢失，只剩下一个没头没尾的空指针。统一转成带原始消息的 Java 异常：
  // MIDlet 的 catch 能接住，接不住时控制台也会打印出真正的原因。
  {
    label: 'bld/j2me.js: a JavaScript error becomes a Java exception, not a bogus null',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (untranslatable JS errors)'),
    anchor: `        else if (e.name === "JavaRuntimeException") {
            return $.newRuntimeException(e.message);
        }
        return e;`,
    replacement: `        else if (e.name === "JavaRuntimeException") {
            return $.newRuntimeException(e.message);
        }
        // Site patch (untranslatable JS errors): 编译代码在 catch 里立刻读
        // TE(ex)._address，所以任何没有 _address 的错误（浏览器抛的 DOMException、
        // 原生实现里 TypeError 之外的异常……）都会变成 undefined，再被 emitThrow 的空
        // 检查当成「重新抛出的异常是 null」而变成假的空指针，原始信息全部丢失。转成带
        // 原始 name/message 的 Java 异常，让 MIDlet 或控制台看到真正的原因。
        if (e && (e._address === undefined || e._address === 0)) {
            return $.newRuntimeException((e.name ? e.name + ": " : "") + (e.message ? e.message : String(e)));
        }
        return e;`,
  },
  // MIDP 的圆弧角度以「0 = 3 点钟、逆时针为正」计，画布的角以「0 = 3 点钟、顺时针为
  // 正」计（屏幕 y 轴向下），所以画布角 = -MIDP 角，而 MIDP 的正角度对应画布上角度
  // 递减的方向 —— 也就是 canvas arc() 的 anticlockwise=true。上游把这两个角互换后
  // 一律按 anticlockwise=false 画：正角度（最常见的那种）刚好凑对，负角度却会沿
  // 反方向绕整整 270 度。「蹦球传说」的球体阴影正好是一串负角度扇形。
  {
    label: 'main-all.js: arc sweeps follow MIDP angles and can run either way',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (MIDP arc angles)'),
    anchor: `  function createEllipticalArc(c, x, y, rw, rh, arcStart, arcEnd, closed) {
    c.save();
    c.translate(x, y);
    if (closed) {
      c.moveTo(0, 0);
    }
    c.scale(1, rh / rw);
    c.arc(0, 0, rw, arcStart, arcEnd, false);`,
    replacement: `  // Site patch (MIDP arc angles): MIDP 的圆弧角度是「0 = 3 点钟、逆时针为正」，
  // 画布的角是「0 = 3 点钟、顺时针为正」（屏幕 y 轴向下），所以画布角 = -MIDP 角，
  // 而 MIDP 的正角度对应画布上角度递减的方向（canvas arc() 的 anticlockwise=true）。
  // 上游把起止角互换后一律按 anticlockwise=false 画：正角度刚好凑对，负角度却会沿
  // 另一个方向绕 270 度。|arcAngle| >= 360 时按整圈处理 —— 画布对 start == end 的
  // 圆弧什么都不画。
  function siteArc(startAngle, arcAngle) {
    if (arcAngle >= 360 || arcAngle <= -360) {
      return {startRad: 0, endRad: Math.PI * 2, anticlockwise: false};
    }
    return {
      startRad: -startAngle * .0175,
      endRad: -(startAngle + arcAngle) * .0175,
      anticlockwise: arcAngle > 0,
    };
  }
  function createEllipticalArc(c, x, y, rw, rh, arcStart, arcEnd, closed, anticlockwise) {
    c.save();
    c.translate(x, y);
    if (closed) {
      c.moveTo(0, 0);
    }
    c.scale(1, rh / rw);
    c.arc(0, 0, rw, arcStart, arcEnd, !!anticlockwise);`,
  },
  // 与上一条配套：两个圆弧 native 把包围盒的左上角当成了椭圆圆心传给
  // createEllipticalArc（它要的是圆心），fillArc 还把这个角当成了扇形的顶点。
  // 于是在真机上居中的弧，在这里整块向左上偏了半个包围盒，扇形还多出一块连着
  // 左上角的楔形 —— 「蹦球传说」的球体（42x42 的软件球面 + 一串这种扇形阴影）
  // 因此画成了一坨红白相间的怪东西。
  {
    label: 'main-all.js: drawArc/fillArc sit in the middle of the bounding box',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('// Site patch (arcs centred in the bounding box)'),
    anchor: `  Native["javax/microedition/lcdui/Graphics.drawArc.(IIIIII)V"] = function(addr, x, y, width, height, startAngle, arcAngle) {
    if (width < 0 || height < 0) {
      return;
    }
    var c = NativeMap.get(addr).getGraphicsContext();
    var endRad = -startAngle * .0175;
    var startRad = endRad - arcAngle * .0175;
    c.beginPath();
    createEllipticalArc(c, x, y, width / 2, height / 2, startRad, endRad, false);
    c.stroke();`,
    replacement: `  Native["javax/microedition/lcdui/Graphics.drawArc.(IIIIII)V"] = function(addr, x, y, width, height, startAngle, arcAngle) {
    if (width < 0 || height < 0) {
      return;
    }
    // Site patch (arcs centred in the bounding box): 椭圆的圆心在包围盒正中，
    // 不是它的左上角。角度换算与方向见 siteArc()。
    var c = NativeMap.get(addr).getGraphicsContext();
    var arc = siteArc(startAngle, arcAngle);
    c.beginPath();
    createEllipticalArc(c, x + width / 2, y + height / 2, width / 2, height / 2, arc.startRad, arc.endRad, false, arc.anticlockwise);
    c.stroke();`,
    then: {
      anchor: `    var c = NativeMap.get(addr).getGraphicsContext();
    var endRad = -startAngle * .0175;
    var startRad = endRad - arcAngle * .0175;
    c.beginPath();
    c.moveTo(x, y);
    createEllipticalArc(c, x, y, width / 2, height / 2, startRad, endRad, true);
    c.moveTo(x, y);
    c.fill();`,
      replacement: `    // Site patch (arcs centred in the bounding box): 圆心在包围盒正中，扇形从圆心
    // 张开（原来的顶点是包围盒的左上角，扇叶因此多出一块连到左上角的楔形）。
    var c = NativeMap.get(addr).getGraphicsContext();
    var cx = x + width / 2;
    var cy = y + height / 2;
    var arc = siteArc(startAngle, arcAngle);
    c.beginPath();
    c.moveTo(cx, cy);
    createEllipticalArc(c, cx, cy, width / 2, height / 2, arc.startRad, arc.endRad, false, arc.anticlockwise);
    c.closePath();
    c.fill();`,
    },
  },
  // 「恐龙快打」的主角朝右时整个人散成一堆错位的身体部件、朝左时完全正常，同一张
  // 精灵表里的小怪与道具也一样。原因是 Nokia 的
  // DirectGraphics.drawImage(img, x, y, anchor, manipulation) 里的 manipulation
  // 被这份实现整个丢掉了：它一律按 TRANS_NONE 把整张图贴到 (x, y)。
  //
  // 游戏是照真机的行为算坐标的：先把裁剪区设成「变换后的图该出现的那个矩形」，再把
  // 整张图按变换贴上去，让要用的那块源图正好落进裁剪区（源区域在变换后的图里的偏移
  // = 图尺寸 - 源坐标 - 源尺寸）。不翻转时，落进裁剪区的是同一张表里另一块内容 ——
  // 朝右的每一帧都由另一组精灵组成，所以画面是一堆错位的部件；朝左的帧用
  // manipulation=0 走的就是对的。同一个 ROM 里 manipulation 的分布也印证了这一点：
  // 朝右/朝左的差别只在 8192（FLIP_HORIZONTAL）上。
  //
  // 下面这张表把 Nokia 的组合折算成 MIDP 的 TRANS_* 码，绘制仍交给 renderRegion
  // （drawRegion / Image.createImage(…, transform) 走的都是它）。八种组合都按「源区域
  // 必须落进裁剪区」核对过 —— 这正是游戏为每种组合算出的目标坐标所要求的结果：
  // FLIP_HORIZONTAL 单独出现是 TRANS_MIRROR，FLIP_HORIZONTAL|ROTATE_90 是
  // TRANS_MIRROR_ROT90（不是 TRANS_MIRROR_ROT270），ROTATE_90 单独出现是
  // TRANS_ROT270。除了这个 ROM 自己的几何，折算表与 MicroEmulator 的 Nokia API
  // 实现（J2ME-Loader 继承的那份）一致，FreeJ2ME 对单个旋转/翻转的结果也一样。
  //
  // 表必须定义在 `var TRANS_*` 那一段之后：这次踩到的坑。`TRANS_*` 是 `var`，写在
  // 文件更靠后的位置，放在它们前面的表字面量读到的全是 undefined，于是每次折算都得到
  // undefined，renderRegion 拿 undefined 变换算出的目标坐标是 NaN —— 画是画了，什么
  // 都没落在画布上，游戏里的表现正是「朝右的精灵整块消失」（而 manipulation=0 的朝左
  // 帧走 Graphics.drawImage，完全正常）。
  {
    label: 'main-all.js: Nokia DirectGraphics.drawImage honours its manipulation argument',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('function siteManipulationToTransform(manipulation) {')
      && text.indexOf('function siteManipulationToTransform(manipulation) {') > text.indexOf('var TRANS_MIRROR_ROT90 = 7;'),
    anchor: `Native["com/nokia/mid/ui/DirectGraphicsImp.drawImage.(Ljavax/microedition/lcdui/Image;IIII)V"] = function(addr, imageAddr, x, y, anchor,unknow) { 
  if (imageAddr === J2ME.Constants.NULL) {
    throw $.newNullPointerException("image is null");
  }
  
  var self = getHandle(addr);
  var image = getHandle(imageAddr);
  var imageData = getHandle(image.imageData);
  //console.log(imageData,x, y)
  var c = NativeMap.get(self.graphics).getGraphicsContext(); 
  renderRegion(c, NativeMap.get(image.imageData).context.canvas, 0, 0, imageData.width, imageData.height, TRANS_NONE, x, y, anchor);
};`,
    replacement: `// Site patch (Nokia image manipulation): manipulation 折算成 MIDP 变换码后再交给
// renderRegion 去画（折算表与判定在下面的 TRANS_* 定义之后）。
Native["com/nokia/mid/ui/DirectGraphicsImp.drawImage.(Ljavax/microedition/lcdui/Image;IIII)V"] = function(addr, imageAddr, x, y, anchor, manipulation) { 
  if (imageAddr === J2ME.Constants.NULL) {
    throw $.newNullPointerException("image is null");
  }
  
  var self = getHandle(addr);
  var image = getHandle(imageAddr);
  var imageData = getHandle(image.imageData);
  var c = NativeMap.get(self.graphics).getGraphicsContext(); 
  renderRegion(c, NativeMap.get(image.imageData).context.canvas, 0, 0, imageData.width, imageData.height, siteManipulationToTransform(manipulation), x, y, anchor);
};`,
    then: {
      anchor: `  var TRANS_MIRROR_ROT90 = 7;
  function renderRegion(dstContext, srcCanvas, sx, sy, sw, sh, transform, absX, absY, anchor) {`,
      replacement: `  var TRANS_MIRROR_ROT90 = 7;
  // Site patch (Nokia image manipulation): Nokia 的 manipulation 是「第 13/14 位 =
  // 左右/上下翻转，低位 = 逆时针 90/180/270 度」，两者可叠加。折算成 MIDP 的
  // TRANS_* 码后交给 renderRegion 去画；无法拆解的取值按真机抛
  // IllegalArgumentException（MicroEmulator 的 Nokia API 实现同样如此）。
  //
  // 这张表必须留在这里（TRANS_* 已经赋过值）：放在它们前面时，字面量读到的全是
  // undefined，折算结果也是 undefined，renderRegion 于是拿一个不认识的变换算坐标，
  // 目标位置成了 NaN —— 画面上就是「朝右的精灵整块消失」，而 manipulation=0 的朝左帧
  // 走 Graphics.drawImage，完全看不出问题。
  var siteNokiaManipulation = [
    [TRANS_NONE, TRANS_ROT270, TRANS_ROT180, TRANS_ROT90],
    [TRANS_MIRROR, TRANS_MIRROR_ROT90, TRANS_MIRROR_ROT180, TRANS_MIRROR_ROT270],
    [TRANS_MIRROR_ROT180, TRANS_MIRROR_ROT270, TRANS_MIRROR, TRANS_MIRROR_ROT90],
    [TRANS_ROT180, TRANS_ROT90, TRANS_NONE, TRANS_ROT270],
  ];
  function siteManipulationToTransform(manipulation) {
    var flip = manipulation >>> 13;
    var rotation = manipulation & 8191;
    if (flip > 3 || rotation % 90 !== 0 || rotation > 270) {
      throw $.newIllegalArgumentException("Unsupported manipulation: " + manipulation);
    }
    return siteNokiaManipulation[flip][rotation / 90];
  }
  function renderRegion(dstContext, srcCanvas, sx, sy, sw, sh, transform, absX, absY, anchor) {`,
    },
  },
  {
    // fastInterpreterFrameAdapter 是「编译代码或原生方法调进解释器」的入口：它压一个
    // ExitInterpreter 标记再进 interpret()。exceptionUnwind 走到这个标记时展开的只是
    // 这次嵌套运行压进来的帧 —— 调用者（编译方法或外层解释器循环）还在，处理器也在
    // 那里 —— 所以异常本来就该继续往上传。
    //
    // 上游的 catch 把它和 JS 错误一起吞掉、返回 0 假装调用成功。补丁 15 修的是解释器
    // 循环里同源的吞异常，「冒险小子」撞上的正是这一处漏网的：它的 logo 循环
    // load("/logo"+i+".png") 依赖 IOException 里的 catch (Exception)，而这个运行时里
    // Image.createImage 那条链是「原生 → 再进解释器」，于是每张缺失的图片抛出的异常
    // 都停在这条 catch 上 —— 循环拿到 null 继续装下一张，四个 logo 全部试完，最后画
    // 那张空图时空指针杀掉线程，游戏停在 HandyGames 商标上再也进不去。
    label: 'bld/j2me.js: a Java exception leaving a nested interpreter run reaches its caller',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (nested interpreter exceptions):'),
    anchor: `            var v=0;
            try{ 
                v = interpret(thread);
                //console.log('interpret '+v)
            }
            catch(err){
                console.log('interpret error:',err);
                return v;
            } `,
    replacement: `            var v=0;
            try{ 
                v = interpret(thread);
                //console.log('interpret '+v)
            }
            catch(err){
                // Site patch (nested interpreter exceptions): exceptionUnwind 走到这层
                // ExitInterpreter 标记时，展开的只是这次嵌套运行压进来的帧，调用者
                // （编译方法的 try/catch，或外层解释器循环的 catch → exceptionUnwind）
                // 还在那里，处理器也在它自己的异常表里。带 classInfo 的就是这种 Java
                // 异常，照原样往上传；其余是运行时自己的 JS 错误，维持原样记一条日志。
                if (err && err.classInfo) {
                    throw err;
                }
                console.log('interpret error:',err);
                return v;
            } `,
  },
  // 上游把「一次执行窗口」定成 80ms，想法是「系统要在 100ms 内响应，剩下 20ms 留给事件
  // 循环」。但播放页显示的是从运行时页面镜像过来的一张画布，镜像、触摸手柄与按钮全在
  // 同一条主线程上：窗口的长度就是「整页每秒能画几次」的上界，而一次窗口边界还要等当前
  // 那段 Java 执行返回并排上下一个任务，实际节奏约是窗口的 1.3 倍。80ms 于是只留给整页
  // 每秒约 13 次执行机会 —— 恐龙快打实测 12000ms 里有 11826ms 在跑虚拟机任务，被切成
  // 159 段约 72ms 的长任务，页面里连一个独立的 requestAnimationFrame 循环都只能跑到
  // 13.6 次/秒，画面、触摸手柄、按钮、暂停全部跟着掉到 13 次/秒，手机上（CPU 慢几倍）
  // 只会更糟。
  //
  // 改成半个 60Hz 帧（8ms）后，同一条线程上的动画帧产出实测 13.6 → 60 次/秒、长任务
  // 消失；出帧率：正义化身－忍者神龟传 3.4 → 11.5fps（4 倍 CPU 降频下 3.2 → 10.9），
  // 恐龙快打 4 倍降频下 12.5 → 13.3fps；轻游戏没有任何变化（蹦球传说 58.8 → 58.6、
  // 仙剑奇侠传 54.4 → 54.2，页面帧产出都还在 60）。恐龙快打 1 倍下仍是 13.3fps ——
  // 它自己就按约 75ms 一帧的节奏跑，与窗口无关。
  //
  // 为什么是半个帧而不是一个帧（16ms）：16ms 下同样量到页面帧产出只有 50~53 次/秒
  // （边界间隔被拖到约 20ms），出帧率也略低（忍者神龟传 1 倍 10.6、4 倍 10.2，恐龙快打
  // 4 倍 13.1）；再降到一个帧的八分之一（4ms）则没有额外收益（忍者神龟传 4 倍 11.0、
  // 恐龙快打 4 倍 13.2），只多出调度次数。虚拟机拿到的 CPU 总量不变（依旧 ~99%）。
  {
    label: 'bld/j2me.js: an execution window is half an animation frame',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (half-frame execution window):'),
    anchor: '    var MAX_WINDOW_EXECUTION_TIME = 80;',
    replacement: `    // Site patch (half-frame execution window): 执行窗口 = 半个 60Hz 的帧。
    // 一次窗口边界还要等当前那段 Java 执行返回并排上下一个任务，实际节奏约是窗口的
    // 1.3 倍，所以 80ms 的窗口只留给整页每秒约 13 次执行机会（实测 12000ms 里 11826ms
    // 在跑虚拟机，159 段约 72ms 的长任务），而 16ms 又只到 50~53 次/秒；8ms 下动画帧
    // 产出 13.6 → 60 次/秒、长任务消失、忍者神龟传 3.4 → 11.5fps，虚拟机拿到的 CPU 总量
    // 不变（依旧 ~99%）。再小到 4ms 没有额外收益。
    var MAX_WINDOW_EXECUTION_TIME = 8;`,
  },
  // 「恐龙快打」里被打倒的敌人与主角，只要贴图有一部分移出画面**左**边（游戏会把裁剪区
  // 设成一个负的 x），屏幕上就会出现一条与精灵同高的精灵表碎片 —— 看上去像那张贴图
  // 「错乱」。原因是这份实现的 Graphics.setClip() 给四个边界各套了一个 `& 32767`：对
  // 非负值是恒等运算，对负值却是 `v & 32767 = 32768 + v`，于是一块完全落在画布外的矩形
  // （右/下边界为负）变成一个宽三万多像素的裁剪区 —— 裁剪不但没起作用，还比画布大得多。
  // 游戏正是靠「先 setClip 到精灵矩形、再把整张精灵表按变换贴上去，让要用的那块源图
  // 落进裁剪区」来画精灵的（见补丁 25），裁剪一失效，落进画面的就是精灵表里另一段内容：
  // 一条与精灵同高的横带，位置由整张表贴上去时的偏移决定，有时压在角色身上、有时铺在
  // 路面上（会出现在画面任意位置，玩家看到的就是「倒地的人贴图错乱」）。完全落在画面外
  // 的精灵本该什么都不画。这里把四条边各自夹进 [min, max]（即与目标画布求交），空交集
  // 照旧被下面的判断折叠成空裁剪区。
  {
    label: 'main-all.js: a clip outside the target stays outside',
    file: 'bld/main-all.js',
    applied: (text) => text.includes('Math.min(Math.max(minX, newX2), maxX)'),
    anchor: `    newX1 = Math.max(minX, newX1) & 32767;
    newY1 = Math.max(minY, newY1) & 32767;
    newX2 = Math.min(maxX, newX2) & 32767;
    newY2 = Math.min(maxY, newY2) & 32767;`,
    replacement: `    // Site patch (clip outside the target): 这里原来把四个边界各与 32767 按位与，而这个
    // 掩码只有在值为负时才不是恒等运算 —— 一块完全落在画布外（右侧或下侧边界为负）的
    // 裁剪区因此变成一个巨大的裁剪区，游戏「先按精灵矩形设裁剪区、再把整张精灵表贴上去」
    // 的画法就失去了裁剪：屏幕上会出现一条横贯画面的精灵表碎片。详情见
    // frontend/scripts/apply-j2me-patches.mjs 与 j2me-integration.md。
    newX1 = Math.min(Math.max(minX, newX1), maxX);
    newY1 = Math.min(Math.max(minY, newY1), maxY);
    newX2 = Math.min(Math.max(minX, newX2), maxX);
    newY2 = Math.min(Math.max(minY, newY2), maxY);`,
  },
  {
    // fork 自己的 ReplaceMethod 表（「这里实现替换java中的方法」）只在 JS 调用进来时被查过：
    // getLinkedMethod（编译代码或原生方法调一个 Java 方法）与
    // findNativeMethodImplementation。MIDlet 从自己的字节码里 invokestatic 一个类库方法
    // 时，解释器把字节码解释到底，一次也不查这张表 —— 站点在 bridge.js 里用它做的 shim
    // 因此全部不生效（三星时代的 MIDlet 问 com.samsung.util.AudioClip.isSupported()，
    // 内置类库那份空实现写死答 false，于是「冒险小子」在关卡里按确定键时读到一张从未分配
    // 的关卡常量表，空指针杀掉整个线程、画面定在最后一帧）。
    //
    // 挂在方法解析上：常量池把解析结果缓存进 cp.resolved[]，所以每个方法引用只多一次查表，
    // 解释路径与编译路径都能拿到替换后的 fn。
    label: 'bld/j2me.js: ReplaceMethod also reaches methods a MIDlet calls from its own bytecode',
    file: 'bld/j2me.js',
    applied: (text) => text.includes('// Site patch (method replacement):'),
    anchor: `                    var method = c.getMethodByIndex(i);
                    // if(ReplaceMethod)
                    // {
                    //     var methodInfo=method;
                    //     //这里实现替换java中的方法
                    //     var methodjs=ReplaceMethod[methodInfo.implKey];
                    //     if(methodjs)
                    //     {
                    //         console.log(methodInfo.implKey,"replaced!"); 
                    //         method.fn = methodjs;
                    //         method.state=1;
                    //         return method;
                    //     }   
                    // } 
                    return method;`,
    replacement: `                    var method = c.getMethodByIndex(i);
                    // Site patch (method replacement): 下面这几行原本是 fork 作者注释掉的
                    // 原意（「这里实现替换java中的方法」）。三个挂点里只有
                    // getLinkedMethod / findNativeMethodImplementation 生效，而 MIDlet 自己
                    // 的字节码调用类库方法时走的正是这里 —— 解析一次就把替换后的 fn 装上，
                    // 常量池会把结果缓存下来。
                    var replacement = ReplaceMethod && ReplaceMethod[method.implKey];
                    if (replacement) {
                        method.fn = replacement;
                        method.state = 1 /* Compiled */;
                        J2ME.linkedMethods[method.id] = replacement;
                        return method;
                    }
                    return method;`,
  },
  // 试过、但没有留下来的一条：让 Thread.yield() 在没有别的可运行线程、执行窗口也还没
  // 用完时直接返回。它确实把每秒 29.4 万次（恐龙快打实测，见 j2me-integration.md 的
  // 「线程让出与执行窗口」）的「展开整个 Java 栈 + 调度器重排 + 重入解释器」换成了一次
  // 判断，解释器吞吐也跟着涨了 3~4 倍（按抢占检查次数估算：恐龙快打 123 → 454 次/秒，
  // 忍者神龟传 139 → 520 次/秒），但**画面一帧也没多**：这些 MIDlet 的等待循环是
  // `while (现在 < 截止时刻) Thread.yield();`，省下来的 CPU 全被它自己转手烧回了空转里，
  // 帧率在 1 倍、4 倍、8 倍 CPU 降频下都与只改窗口时完全一致（恐龙快打 13.3/12.5/12.7，
  // 忍者神龟传 10.6/9.6/8.5）。而代价是实实在在的：每次调用多一次 performance.now()，
  // profile 里 canSkipYield 自己就占了 28% 的样本，还改了 Thread.yield 的语义（等待别的
  // 线程或事件循环的场景要多等一个窗口）。没有收益就不留。
]

let failed = false
for (const patch of patches) {
  const filePath = path.join(base, patch.file)
  const original = fs.readFileSync(filePath, 'utf8')
  if (patch.applied(original)) {
    console.log(`ok      ${patch.label}`)
    continue
  }
  let next
  if (patch.transform) {
    try {
      next = patch.transform(original)
    } catch (error) {
      console.error(`FAILED  ${patch.label}: ${error.message}`)
      failed = true
      continue
    }
  } else {
    if (!original.includes(patch.anchor)) {
      console.error(`FAILED  ${patch.label}: anchor not found in ${patch.file}`)
      failed = true
      continue
    }
    next = original.split(patch.anchor).join(patch.replacement)
    if (patch.close) {
      if (!next.includes(patch.close.anchor)) {
        console.error(`FAILED  ${patch.label}: closing anchor not found in ${patch.file}`)
        failed = true
        continue
      }
      next = next.split(patch.close.anchor).join(patch.close.replacement)
    }
    if (patch.then) {
      if (!next.includes(patch.then.anchor)) {
        console.error(`FAILED  ${patch.label}: follow-up anchor not found in ${patch.file}`)
        failed = true
        continue
      }
      next = next.replace(patch.then.anchor, patch.then.replacement)
    }
  }
  if (!patch.applied(next)) {
    console.error(`FAILED  ${patch.label}: patch did not take effect in ${patch.file}`)
    failed = true
    continue
  }
  fs.writeFileSync(filePath, next)
  console.log(`patched ${patch.label}`)
}
process.exitCode = failed ? 1 : 0
