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
