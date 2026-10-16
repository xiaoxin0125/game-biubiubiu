import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 页脚更新日志：数据文件、弹窗组件与版本号必须互相对得上。
// 之前出现过「页脚写死旧版本」的问题，这里把版本来源钉在根 package.json 上。
const rootPkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const frontendPkg = JSON.parse(readFileSync(new URL('../frontend/package.json', import.meta.url), 'utf8'))
const appSource = readFileSync(new URL('../frontend/src/App.vue', import.meta.url), 'utf8')
const changelogSource = readFileSync(new URL('../frontend/src/constants/changelog.js', import.meta.url), 'utf8')

// 常量文件是纯数据，直接 import 会走 ESM 解析而不需要构建，可以读出真实结构。
const { APP_CHANGELOG } = await import('../frontend/src/constants/changelog.js')

test('版本号三处一致', () => {
  assert.equal(frontendPkg.version, rootPkg.version)
  assert.equal(APP_CHANGELOG[0].version, rootPkg.version)
  assert.ok(/^\d+\.\d+\.\d+$/.test(rootPkg.version), `版本号格式异常：${rootPkg.version}`)
})

test('更新日志覆盖 v1.0.0 起的所有版本，按新到旧排列', () => {
  const versions = APP_CHANGELOG.map((release) => release.version)
  assert.deepEqual(versions, ['1.7.1', '1.7.0', '1.6.3', '1.6.2', '1.6.1', '1.6.0', '1.5.2', '1.5.1', '1.5.0', '1.4.0', '1.3.0', '1.2.0', '1.1.0', '1.0.0'])

  // 同一个小版本内的修订（1.5.1 在 1.5.0 之前）也要排对，所以要连补丁号一起比
  const sorted = [...versions].sort((a, b) => {
    const [, aMinor, aPatch] = a.split('.').map(Number)
    const [, bMinor, bPatch] = b.split('.').map(Number)
    return bMinor - aMinor || bPatch - aPatch
  })
  assert.deepEqual(versions, sorted, '版本必须从新到旧排列')

  for (const release of APP_CHANGELOG) {
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `${release.version} 缺少日期`)
    assert.ok(release.title?.trim(), `${release.version} 缺少标题`)
    assert.ok(release.groups?.length, `${release.version} 没有内容分组`)
    for (const group of release.groups) {
      assert.ok(group.label?.trim(), `${release.version} 有分组缺少小标题`)
      assert.ok(group.items?.length, `${release.version} 的「${group.label}」没有条目`)
      for (const item of group.items) {
        assert.equal(typeof item, 'string')
        assert.ok(item.trim().length > 8, `${release.version} 有过短的条目：${item}`)
      }
    }
  }
})

test('页脚版本号是按钮，点击打开更新日志弹窗', () => {
  // 版本号仍然是构建期注入的值，不允许写死
  assert.match(appSource, /const appVersion = __APP_VERSION__/)
  assert.match(appSource, /class="footer-version mono"/)
  assert.match(appSource, /@click="changelogOpen = true"/)
  assert.match(appSource, /<ChangelogDialog v-if="changelogOpen" :current-version="appVersion"/)
  assert.match(appSource, /import ChangelogDialog from '\.\/components\/ChangelogDialog\.vue'/)
})

test('弹窗组件渲染版本号、日期与当前标记', () => {
  const dialog = readFileSync(new URL('../frontend/src/components/ChangelogDialog.vue', import.meta.url), 'utf8')
  assert.match(dialog, /import \{ APP_CHANGELOG \} from '\.\.\/constants\/changelog\.js'/)
  assert.match(dialog, /v-for="release in releases"/)
  assert.match(dialog, /release\.version === currentVersion/)
  assert.match(dialog, /v-for="group in release\.groups"/)
  assert.match(dialog, /v-for="\(item, index\) in group\.items"/)
  assert.match(dialog, /Escape/)
})

test('更新日志只写数据，不在组件里硬编码条目', () => {
  const dialog = readFileSync(new URL('../frontend/src/components/ChangelogDialog.vue', import.meta.url), 'utf8')
  assert.ok(!/v1\.[0-5]\.0/.test(dialog), '弹窗组件里不应出现具体版本号')
  assert.ok(changelogSource.includes('APP_CHANGELOG'))
})
