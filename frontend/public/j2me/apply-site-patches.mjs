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
//
// Usage: node frontend/public/j2me/apply-site-patches.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const base = path.dirname(fileURLToPath(import.meta.url))

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
