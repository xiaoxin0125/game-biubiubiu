// Removes previous build output before a rebuild.
// Only vite-owned paths are removed, so unrelated files inside dist (for example the
// ACME challenge directory written by the hosting panel) survive and stay writable.
import { rmSync } from 'node:fs'

const targets = ['../dist/assets', '../dist/index.html']
for (const target of targets) {
  rmSync(new URL(target, import.meta.url), { recursive: true, force: true })
}
