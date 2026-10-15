// Removes previous build output before a rebuild.
//
// `public/` is copied straight into `dist/` under the same names, so every entry it
// holds is vite-owned too. Skipping them means a file or directory dropped from
// `public/` keeps being served from the previous build: that is how a copy of the
// abandoned js2me runtime (`dist/j2me/vendor`, 215 files) and 37 deleted cover images
// stayed on the site after they were gone from the source. Only vite-owned paths are
// removed, so unrelated files inside dist (for example the ACME challenge directory
// written by the hosting panel) survive and stay writable.
//
// Usage: node scripts/clean-dist.js [dist-dir] [public-dir]
import { rmSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dist = path.resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)))
const publicDir = path.resolve(process.argv[3] || fileURLToPath(new URL('../public', import.meta.url)))

// vite's own output, which public/ does not carry.
for (const target of ['assets', 'index.html']) {
  rmSync(path.join(dist, target), { recursive: true, force: true })
}

// Everything under public/ lands in dist/ under the same name.
if (existsSync(publicDir)) {
  for (const entry of readdirSync(publicDir)) {
    rmSync(path.join(dist, entry), { recursive: true, force: true })
  }
}
