import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_LOGIN_MAX_LENGTH,
  USERNAME_PATTERN,
  USERNAME_RULE_HINT,
  usernameProblem,
} from '../shared/username-policy.js'

const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// 这一组用例守住 2026-10 那次注册放宽：用户名从"只收 ASCII 字母数字下划线连字符"
// 扩到"可用中文与 . @"，同时修掉"用户名不合规却回密码至少 8 位"的错提示。
// 规则被改回去（或前端、后端又各写一套）应当在 CI 里立刻暴露。

// ── 规则本身 ─────────────────────────────────────────────────────────────
test('中文用户名可以通过校验', () => {
  for (const name of ['张三丰', '玩家一号', '欧阳靖', '島崎遥香', '繁体測試', '赵日天']) {
    assert.equal(usernameProblem(name), null, `${name} 应当被接受`)
    assert.ok(USERNAME_PATTERN.test(name))
  }
})

test('字母、数字、下划线、连字符、点、@ 都可以用', () => {
  for (const name of ['abc', 'player_1', 'player-1', 'player.1', 'player@1', 'a.b-c_d@e', '1934199454']) {
    assert.equal(usernameProblem(name), null, `${name} 应当被接受`)
  }
})

test('空格、全角标点、emoji 与其它符号仍然被拒', () => {
  for (const name of ['张 三', 'abc def', '张三。', '名字·中点', '玩家😀', 'a/b', 'a\\b', 'a+b', "o'brien", 'a#b', '　全角空格']) {
    assert.match(String(usernameProblem(name)), /只能用中文/, `${name} 应当被拒绝`)
  }
})

test('长度按字符算：3 位起步，注册封顶 20 位', () => {
  assert.match(String(usernameProblem('ab')), new RegExp(`至少 ${USERNAME_MIN_LENGTH} 位`))
  assert.equal(usernameProblem('abc'), null)
  assert.equal(usernameProblem('汉'.repeat(USERNAME_MAX_LENGTH)), null)
  assert.match(String(usernameProblem('汉'.repeat(USERNAME_MAX_LENGTH + 1))), /最多 20 位/)
})

test('登录的长度上限放到列宽，历史账号不会被注册规则挡在门外', () => {
  const long = 'a'.repeat(USERNAME_LOGIN_MAX_LENGTH)
  assert.match(String(usernameProblem(long)), /最多 20 位/)
  assert.equal(usernameProblem(long, { max: USERNAME_LOGIN_MAX_LENGTH }), null)
  assert.match(String(usernameProblem(`${long}a`, { max: USERNAME_LOGIN_MAX_LENGTH })), /最多 32 位/)
})

test('输入框提示文案与常量一致', () => {
  assert.match(USERNAME_RULE_HINT, new RegExp(`${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 位`))
  assert.match(USERNAME_RULE_HINT, /中文/)
})

test('长度上限落在数据库列宽之内', () => {
  const schema = project('server/db/schema.js')
  const column = /username: varchar\('username', \{ length: (\d+) \}\)/.exec(schema)
  assert.ok(column, 'users.username 的列定义变了，这条用例要跟着更新')
  const columnLength = Number(column[1])
  assert.ok(USERNAME_MAX_LENGTH <= columnLength)
  assert.ok(USERNAME_LOGIN_MAX_LENGTH <= columnLength)
})

// ── 接口行为：校验不通过时的提示要说清是哪个字段 ────────────────────────
// 传非法数据时路由在查库之前就返回了，所以这些请求不会碰到数据库。
const { authRoutes } = await import('../server/routes/auth.js')

async function postRegister(body) {
  const res = await authRoutes.request('/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, payload: await res.json() }
}

test('注册接口把用户名的问题回给用户名，不再一律回密码提示', async () => {
  const bad = await postRegister({ username: '张 三', password: 'longenough' })
  assert.equal(bad.status, 400)
  assert.match(bad.payload.error, /用户名/)
  assert.doesNotMatch(bad.payload.error, /密码/)

  const short = await postRegister({ username: 'ab', password: 'longenough' })
  assert.match(short.payload.error, new RegExp(`用户名至少 ${USERNAME_MIN_LENGTH} 位`))

  const long = await postRegister({ username: 'a'.repeat(USERNAME_MAX_LENGTH + 1), password: 'longenough' })
  assert.match(long.payload.error, new RegExp(`用户名最多 ${USERNAME_MAX_LENGTH} 位`))

  // 密码太短仍回密码提示；用户名本身是合规的
  const weakPassword = await postRegister({ username: 'validname', password: 'short' })
  assert.equal(weakPassword.status, 400)
  assert.match(weakPassword.payload.error, /密码至少 8 位/)
})

// ── 两份实现必须继续共用同一份规则 ──────────────────────────────────────
test('前后端读的是同一份用户名规则', () => {
  const auth = project('server/routes/auth.js')
  const view = project('frontend/src/views/Auth.vue')
  assert.match(auth, /shared\/username-policy\.js/)
  assert.match(view, /shared\/username-policy\.js/)
  // 旧规则（只收 ASCII）与旧提示不能再回到注册/登录链路上
  assert.doesNotMatch(auth, /a-zA-Z0-9_/)
  assert.doesNotMatch(view, /用户名至少 3 位/)
})
