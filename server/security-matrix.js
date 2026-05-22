const BASE_URL = process.env.SECURITY_MATRIX_BASE_URL || 'http://127.0.0.1:3000'
const ORIGIN = process.env.SECURITY_MATRIX_ORIGIN || BASE_URL

const checks = [
  { name: 'anonymous admin users denied', method: 'GET', path: '/api/admin/users', expect: [401] },
  { name: 'anonymous rom mine denied', method: 'GET', path: '/api/roms/mine', expect: [401] },
  { name: 'anonymous saves denied', method: 'GET', path: '/api/saves/mine', expect: [401] },
  { name: 'anonymous public settings allowed', method: 'GET', path: '/api/settings', expect: [200] },
  { name: 'anonymous public rooms allowed', method: 'GET', path: '/api/rooms', expect: [200] },
  { name: 'unsafe request without origin denied in production', method: 'POST', path: '/api/auth/logout', expect: [200, 403], omitOrigin: true },
]

async function runCheck(check) {
  const headers = { Accept: 'application/json' }
  if (!check.omitOrigin && check.method !== 'GET') headers.Origin = ORIGIN
  const res = await fetch(`${BASE_URL}${check.path}`, { method: check.method, headers })
  const ok = check.expect.includes(res.status)
  return { ...check, status: res.status, ok }
}

const results = []
for (const check of checks) {
  results.push(await runCheck(check))
}

for (const result of results) {
  const mark = result.ok ? 'PASS' : 'FAIL'
  console.log(`${mark} ${result.name}: ${result.status} expected ${result.expect.join('/')}`)
}

if (results.some((result) => !result.ok)) process.exit(1)