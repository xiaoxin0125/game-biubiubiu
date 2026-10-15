import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { J2ME_BUTTON_KEYS, J2ME_CAPABILITIES, canInflateJarEntries, resolveJ2meRom } from '../frontend/src/composables/player/j2meRuntime.js'
import { smokeJar } from './fixtures/j2me/smokeJar.js'

test('J2ME preserves virtual keypad labels and exposes honest capabilities', () => {
  // 十字键是手机的导航键（MIDP KEY_UP/DOWN/LEFT/RIGHT = -1/-2/-3/-4），
  // 面键与肩键才是手机键盘（1/3/7/9 游戏键、5 确定、* / #、0）。
  assert.deepEqual(J2ME_BUTTON_KEYS, {up:-1,down:-2,left:-3,right:-4,a:51,b:57,x:49,y:55,l:42,r:35,l2:53,select:-6,start:-7,r2:48})
  assert.ok(Object.values(J2ME_CAPABILITIES).every(value => value === false))
})
// 老手机浏览器（老 Android WebView、微信内置浏览器）没有 DecompressionStream /
// deflate-raw：这一层只是「提前告诉你这个 JAR 起不来」的友好检查，读不了清单时
// 应当把游戏交给运行时（它自己带 inflate），而不是拒绝启动。
test('J2ME 在没有解压能力的浏览器上把清单读取让给运行时', async () => {
  assert.equal(canInflateJarEntries(), true)
  const adapter = await readFile(new URL('../frontend/src/composables/player/j2meRuntime.js', import.meta.url), 'utf8')
  assert.match(adapter, /canInflateJarEntries\(\) \? await midletClassFromJar\(bytes\) : null/)
  assert.match(adapter, /if \(midletClass\) url\.searchParams\.set\('midletClassName', midletClass\)/)

  const original = globalThis.DecompressionStream
  try {
    globalThis.DecompressionStream = undefined
    assert.equal(canInflateJarEntries(), false)
    class Unsupported { constructor() { throw new TypeError("Unsupported compression format: 'deflate-raw'") } }
    globalThis.DecompressionStream = Unsupported
    assert.equal(canInflateJarEntries(), false)
  } finally {
    globalThis.DecompressionStream = original
  }
})
test('J2ME accepts buffers, blobs, views and promised single ROM objects', async () => {
  const jar = smokeJar()
  for (const input of [jar, new Blob([jar]), {fileName:'测试.jar',fileContent:Promise.resolve(new Blob([jar]))}, [{fileName:'smoke.JAR',fileContent:jar}]]) {
    assert.deepEqual(Buffer.from(await resolveJ2meRom(input)), jar)
  }
})
test('J2ME rejects descriptors, multiple games, malformed data and failed downloads', async () => {
  for (const suffix of ['jad','jam','sqc']) await assert.rejects(resolveJ2meRom({fileName:`game.${suffix}`,fileContent:smokeJar()}), /只支持 JAR/)
  await assert.rejects(resolveJ2meRom([smokeJar(),smokeJar()]), /一个 JAR/)
  await assert.rejects(resolveJ2meRom(new Uint8Array(30)), /有效的 JAR/)
  await assert.rejects(resolveJ2meRom({}), /无效/)
  const original=globalThis.fetch
  try { globalThis.fetch=async()=>({ok:false,status:404}); await assert.rejects(resolveJ2meRom('/missing.jar'), /404/) }
  finally { globalThis.fetch=original }
})
test('J2ME runtime is self-hosted, GPL-2.0 and kept visible to Chrome', async () => {
  const html=await readFile(new URL('../frontend/public/j2me/main.html',import.meta.url),'utf8')
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/)
  for (const file of ['bld/main-all.js','bld/j2me.js','bld/native.js','libs/encoding.js','java/classesold.jar','LICENSE']) {
    await readFile(new URL(`../frontend/public/j2me/${file}`,import.meta.url))
  }
  const license=await readFile(new URL('../frontend/public/j2me/LICENSE',import.meta.url),'utf8')
  assert.match(license, /GNU GENERAL PUBLIC LICENSE/)
  assert.match(license, /Version 2/)
  // The hosted runtime keeps JAR and class-library state in IndexedDB, which an
  // opaque-origin sandbox cannot reach: same-origin by design, but never drawn
  // directly. The frame must stay on-screen because Chrome throttles timers of
  // hidden frames, and that stalls the VM.
  const adapter=await readFile(new URL('../frontend/src/composables/player/j2meRuntime.js',import.meta.url),'utf8')
  assert.doesNotMatch(adapter, /setAttribute\('sandbox'/)
  assert.doesNotMatch(adapter, /left:-?\d{4,}px|width:1px;height:1px/)
  assert.match(adapter, /frameHandle = setTimeout\(step, 16\)/)
  assert.match(adapter, /if \(frameHandle != null\) clearTimeout\(frameHandle\)/)
  assert.doesNotMatch(adapter, /frameHandle = requestAnimationFrame\(step\)/)
  assert.match(adapter, /midletClassName/)
})
