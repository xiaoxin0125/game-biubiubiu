// Give the J2meJS runtime copy in `dist` a content version.
//
// Why: nginx serves `.js`/`.css` out of `dist` with a 12-hour `max-age`. A phone
// that cached the previous runtime therefore keeps executing those scripts
// against a freshly deployed page — the state that stalled J2ME boots on mobile
// with nothing in the logs to show for it.
//
// The player asks for `/j2me/version.json` with `cache: 'no-store'` and opens
// `/j2me/main.html?v=<version>`; every script/stylesheet inside that page is
// rewritten here to carry the same version, and the runtime fetches its class
// library under it too (see `frontend/scripts/apply-j2me-patches.mjs`). Updating any runtime file
// therefore changes every URL at once and the new copy reaches clients that
// still hold the old one.
//
// version.json also carries the runtime's `boot` list — main.html, the local
// assets it references and the `java/*.jar` class libraries, each with its
// size. J2ME has no libretro core, so this list is what the player's progress
// panel shows as the “core” for a JAR: it fetches those URLs (with the same
// `?v=`) before opening the runtime frame, which then reads them from the HTTP
// cache (see `frontend/src/composables/player/j2meCore.js`).
//
// Runs after `vite build`; `dist` is cleaned on every build, so the rewrite
// always starts from the unmodified `public/j2me/main.html`.
import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const distRoot = path.resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)))
const runtimeDir = path.join(distRoot, 'j2me')
const versionFile = path.join(runtimeDir, 'version.json')

async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await listFiles(path.join(dir, entry.name), relative))
    else files.push(relative)
  }
  return files
}

const rawHtml = await readFile(path.join(runtimeDir, 'main.html'), 'utf8')
// The version has to describe the runtime *sources*, so main.html is hashed
// without the stamp this script adds (otherwise every run would change it and
// the version could never settle).
const normalizedHtml = rawHtml.replace(/[?&]v=[0-9a-f]+/g, '')

const files = (await listFiles(runtimeDir))
  .filter((name) => name !== 'version.json')
  .sort()

// 纯文档（GPL 要求的许可证与出处说明）不参与版本指纹：它们不影响运行时行为，
// 而版本号一变，所有缓存过旧运行时的访客都要把这 4.4 MB 重下一次。改一句中文
// 说明不该有那个代价。
const DOC_ONLY_FILES = new Set(['LICENSE', 'LICENSE-README.md'])
const digested = files.filter((name) => !DOC_ONLY_FILES.has(name))

// Sizes come off the same pass that hashes the files. main.html is the size of
// the *stamped* file (the ?v= stamps add a few hundred bytes) and is filled in
// after the rewrite below.
const sizes = new Map()
const digest = createHash('sha256')
for (const name of digested) {
  const content = name === 'main.html' ? normalizedHtml : await readFile(path.join(runtimeDir, name))
  sizes.set(name, Buffer.byteLength(content))
  digest.update(name)
  digest.update('\0')
  digest.update(createHash('sha256').update(content).digest())
  digest.update('\n')
}
const version = digest.digest('hex').slice(0, 12)

const htmlPath = path.join(runtimeDir, 'main.html')
const referenced = []
const stamped = rawHtml.replace(/(\s(?:src|href)=")([^"]+)(")/g, (match, start, url, end) => {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) return match
  // Drop a stamp from an earlier run before adding the current one.
  const bare = url.replace(/[?&]v=[0-9a-f]+/g, '')
  if (!referenced.includes(bare)) referenced.push(bare)
  const separator = bare.includes('?') ? '&' : '?'
  return `${start}${bare}${separator}v=${version}${end}`
})
if (!/\s(?:src|href)="(?!https?:|\/\/|#)[^"]+"/.test(rawHtml)) throw new Error('j2me runtime: main.html has no local asset URLs to stamp')
await writeFile(htmlPath, stamped)
sizes.set('main.html', Buffer.byteLength(stamped))

// The frame fetches the class libraries itself (`java/<engine>.jar`), outside
// main.html, so they are added here. A referenced file that is not on disk
// keeps a null size: the player then reports the bytes it actually reads
// instead of promising a denominator it cannot know.
const boot = [...new Set(['main.html', ...referenced, ...files.filter((name) => /^java\/.*\.jar$/.test(name))])]
  .map((name) => ({ name, size: sizes.get(name) ?? null }))
await writeFile(versionFile, `${JSON.stringify({ version, boot }, null, 2)}\n`)

const stampedCount = (stamped.match(/\?v=/g) || []).length
console.log(`j2me runtime version ${version}: ${stampedCount} asset URLs stamped, ${digested.length} files hashed, ${boot.length} boot files listed`)
