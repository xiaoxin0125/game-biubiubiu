import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../frontend/src/views/Admin.vue', import.meta.url), 'utf8')

function sectionFor(tab) {
  const match = source.match(new RegExp(`<section v-if="tab === '${tab}'"[^>]*>([\\s\\S]*?)</section>`))
  assert.ok(match, `Missing ${tab} settings panel`)
  return match[1]
}

function fieldsIn(section) {
  return [...section.matchAll(/v-model(?:\.trim)?="form\.(\w+)"/g)]
    .map((match) => match[1])
    .sort()
}

test('管理导航提供远端入口，并保留现有栏目', () => {
  const nav = source.match(/<nav class="seg admin-seg">([\s\S]*?)<\/nav>/)?.[1]
  assert.ok(nav)
  for (const [tab, label] of Object.entries({ site: '站点', remote: '远端', users: '用户', roms: 'ROM', bios: 'BIOS' })) {
    assert.ok(nav.includes(`:class="{ active: tab === '${tab}' }" @click="tab = '${tab}'">${label}</button>`))
  }
})

test('站点设置只保留基本信息和功能开关', () => {
  const section = sectionFor('site')
  assert.match(section, /站点设置/)
  assert.deepEqual(fieldsIn(section), [
    'siteTitle', 'siteSubtitle', 'netplayEnabled', 'guestPlayEnabled', 'userUploadEnabled',
  ].sort())
})

test('远端设置集中展示全部远端配置，并保留连接测试', () => {
  const section = sectionFor('remote')
  assert.match(section, /远端设置/)
  assert.deepEqual(fieldsIn(section), [
    'webrtcStunUrls', 'webrtcTurnUrls', 'webrtcTurnUsername', 'webrtcTurnCredential',
    'webrtcTurnSecret', 'webrtcTurnTtl',
    'remoteUploadUrl', 'remoteUploadToken', 'remoteDownloadUrl', 'remoteDownloadSecret',
    'romDirectEnabled', 'coresRemoteEnabled', 'coresBaseUrl',
  ].sort())
  assert.deepEqual([...section.matchAll(/<h3 class="site-block-title">([^<]+)<\/h3>/g)].map((match) => match[1]), [
    'STUN 服务器（可选）', 'TURN 中继（可选）', '远端存储（大 ROM）',
    '下载地址（浏览器直连）', '核心资源（远端托管）',
  ])
  for (const handler of ['testStun', 'testTurn', 'testRemote', 'testCores']) {
    assert.ok(section.includes(`@click="${handler}"`))
  }
})

test('两个设置面板均保留原有保存入口和状态提示', () => {
  for (const tab of ['site', 'remote']) {
    const section = sectionFor(tab)
    assert.match(section, /:disabled="savingSite" @click="saveSite"/)
    assert.match(section, /v-if="siteSaved" class="saved">已保存/)
  }
})
