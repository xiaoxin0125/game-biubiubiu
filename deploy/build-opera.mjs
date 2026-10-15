#!/usr/bin/env node
// Run with emsdk 4.0.10 activated. Both source trees must be disposable build
// checkouts, not application directories. Nothing is installed without --install.
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OPERA_REV = '67a29e60a4d194b675c9272b21b61eaa022f3ba3'
const RETROARCH_REV = '69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576' // v1.22.2
const opera = process.env.OPERA_SOURCE
const retroarch = process.env.RETROARCH_SOURCE
if (!opera || !retroarch) throw new Error('Set OPERA_SOURCE and RETROARCH_SOURCE to the pinned source checkouts. See deploy/opera-build.md.')
const run = (cwd, command, args) => execFileSync(command, args, { cwd, stdio: 'inherit' })
for (const [cwd, revision] of [[opera, OPERA_REV], [retroarch, RETROARCH_REV]]) {
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  if (actual !== revision) throw new Error(`Unexpected source revision in ${cwd}: ${actual}`)
}
if (!process.argv.includes('--package-only')) {
  const version = execFileSync('emcc', ['--version'], { encoding: 'utf8' })
  if (!/^emcc .*\b4\.0\.10\b/m.test(version)) throw new Error('Activate Emscripten 4.0.10 before building Opera')
  console.log(version.trim())
  const jobs = String(Math.max(1, Math.min(2, Number(process.env.JOBS) || 2)))
  // Opera's disc reader always calls RetroArch's intfstream_open_chd_track.
  // HAVE_CHD=0 here omits only the unused, older bundled CHD codec implementation;
  // RetroArch below builds CHD support (HAVE_CHD=1) once, with its matching headers.
  const coreArgs = ['platform=emscripten', 'CC=emcc', 'CXX=em++', 'AR=emar', 'HAVE_CHD=0', `LIBRETRO_COMM_DIR=${join(resolve(retroarch), 'libretro-common')}`]
  run(opera, 'make', [...coreArgs, 'clean'])
  // STATIC_LINKING omits Opera's libretro-common implementation. Its headers MUST
  // match RetroArch's linked implementation, including size_t path-function returns.
  run(opera, 'make', ['-j' + jobs, ...coreArgs])
  copyFileSync(join(opera, 'opera_libretro_emscripten.bc'), join(retroarch, 'libretro_emscripten.bc'))
  const extraMakefile = join(resolve(retroarch), 'xbw-opera-flags.mk')
  writeFileSync(extraMakefile, 'LDFLAGS += -Wl,--fatal-warnings -s EXPORTED_RUNTIME_METHODS=$(EXPORTS),setCanvasSize\n')
  const frontendArgs = ['-f', 'Makefile.emscripten', '-f', extraMakefile, 'LIBRETRO=opera', 'CC=emcc', 'CXX=em++', 'LD=emcc', 'HAVE_CHD=1', 'HAVE_BUILTINFLAC=1']
  run(retroarch, 'make', [...frontendArgs, 'clean'])
  run(retroarch, 'make', ['-j' + jobs, ...frontendArgs])
}
// Nostalgist 0.21 instruments `return moduleRtn;` and expects a Promise. In
// Emscripten 4 the async factory may set it to Module directly. Normalize it
// before that exact return (which Nostalgist still needs to locate and wrap).
const gluePath = join(retroarch, 'opera_libretro.js')
const glue = readFileSync(gluePath, 'utf8')
const promiseBridge = 'moduleRtn = Promise.resolve(moduleRtn);'
if (!glue.includes(promiseBridge)) {
  if (glue.split('return moduleRtn;').length !== 2) throw new Error('Unexpected Emscripten factory output')
  writeFileSync(gluePath, glue.replace('return moduleRtn;', `${promiseBridge}\n  return moduleRtn;`))
}
if (!glue.includes('Module["setCanvasSize"]')) throw new Error('Missing Nostalgist canvas-resize export; rebuild with the supplied linker flags')
const artifacts = ['js', 'wasm'].map(ext => {
  const from = join(retroarch, `opera_libretro.${ext}`)
  const bytes = readFileSync(from)
  if (ext === 'wasm' && !WebAssembly.validate(bytes)) throw new Error('Invalid Opera WebAssembly binary')
  console.log(`${from}: ${bytes.length} bytes sha256=${createHash('sha256').update(bytes).digest('hex')}`)
  return { ext, from }
})
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
if (process.argv.includes('--install')) {
  for (const { ext, from } of artifacts) copyFileSync(from, join(root, `data/cores/opera.${ext}`))
  console.log('Installed paired Opera artifacts. Run deploy/build-cores.mjs after browser verification to publish a new content-addressed release.')
}
