async function request(path, { method = 'GET', body, formData, headers = {} } = {}) {
  const opts = {
    method,
    headers: { Accept: 'application/json', ...headers },
    credentials: 'include',
  }
  if (formData) {
    opts.body = formData
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(path, opts)
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null
  if (!res.ok) {
    const err = new Error(data?.error || `请求失败 (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

// 存档上传的压缩阈值：超过它的存档先试 gzip。keepalive fetch 的 64KB 上限是硬
// 限制，压缩是让大存档也能挤进"关页面时最后存一次"这条路（2026-10 审计 L-5）。
const SAVE_COMPRESS_THRESHOLD_BYTES = 16 * 1024

/** 浏览器原生 gzip（老浏览器没有 CompressionStream 时返回 null，调用方照原样传）。 */
async function gzipBlob(blob) {
  if (typeof CompressionStream !== 'function') return null
  try {
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'))
    return await new Response(stream).blob()
  } catch {
    return null
  }
}

export const api = {
  // auth
  me: () => request('/api/auth/me'),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  register: (username, password) => request('/api/auth/register', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
  webSocketTicket: () => request('/api/auth/ws-ticket', { method: 'POST' }),

  // roms
  romsMine: () => request('/api/roms/mine'),
  romsPublic: () => request('/api/roms/public'),
  romsFavorites: () => request('/api/roms/favorites'),
  romGet: (id) => request(`/api/roms/${id}`),
  romCheats: (id) => request(`/api/roms/${id}/cheats`),
  romUpload: (fd) => request('/api/roms/upload', { method: 'POST', formData: fd }),
  romUpdate: (id, patch) => request(`/api/roms/${id}`, { method: 'PATCH', body: patch }),
  romUploadCover: (id, fd) => request(`/api/roms/${id}/cover`, { method: 'POST', formData: fd }),
  romDeleteCover: (id) => request(`/api/roms/${id}/cover`, { method: 'DELETE' }),
  romDelete: (id, { permanent = false } = {}) =>
    request(`/api/roms/${id}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' }),
  romsTrash:  () => request('/api/roms/trash'),
  romRestore: (id) => request(`/api/roms/${id}/restore`, { method: 'POST' }),
  romFavorite:   (id) => request(`/api/roms/${id}/favorite`, { method: 'POST' }),
  romUnfavorite: (id) => request(`/api/roms/${id}/favorite`, { method: 'DELETE' }),
  // 记一次游玩：播放页在模拟器启动成功后调用，用来累积热度与「我的信息」的记录。
  romPlay:       (id) => request(`/api/roms/${id}/play`, { method: 'POST' }),
  romPlaysMine:  () => request('/api/roms/plays/mine'),
  romVersions:   (id) => request(`/api/roms/${id}/versions`),
  // Include the original filename as the last URL segment so emulators that
  // infer romset identity from the archive name (FBNeo, MAME) can find matches.
  romFileUrl: (id, name) => name
    ? `/api/roms/${id}/file/${encodeURIComponent(name)}`
    : `/api/roms/${id}/file`,

  // saves
  saveLoad: async (romId, slot = 0) => {
    const res = await fetch(`/api/saves/${romId}?slot=${slot}`, { credentials: 'include' })
    // 204 = 这个槽位没有存档（后端不再用 404，免得控制台多一条红色报错）。
    if (res.status === 204 || res.status === 404) return null
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      throw new Error(d?.error || `加载存档失败 (${res.status})`)
    }
    return await res.blob()
  },
  saveUpload: async (romId, blob, slot = 0, { keepalive = false } = {}) => {
    // 关标签页之前那最后一次自动存档走的是 keepalive fetch，而浏览器对 keepalive
    // 请求体有 64KB 硬上限，超了会静默失败（只有一句 console.warn，玩家以为存上了）。
    // 大存档先就地压成 gzip：服务端识别 Content-Encoding 后解压再落盘，存进去的
    // 还是原样的字节（2026-10 审计 L-5）。
    let body = blob
    const headers = { 'Content-Type': 'application/octet-stream' }
    if (blob && blob.size > SAVE_COMPRESS_THRESHOLD_BYTES) {
      const compressed = await gzipBlob(blob)
      if (compressed && compressed.size < blob.size) {
        body = compressed
        headers['Content-Encoding'] = 'gzip'
      }
    }
    const res = await fetch(`/api/saves/${romId}?slot=${slot}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
      // 关标签页之前最后一次自动存档用得上：普通 fetch 会被浏览器掐掉。
      keepalive,
    })
    const d = await res.json().catch(() => null)
    if (!res.ok) throw new Error(d?.error || `上传存档失败 (${res.status})`)
    return d
  },

  // rooms
  roomsPublic: () => request('/api/rooms'),
  roomsMine:   () => request('/api/rooms/mine'),
  roomCreate:  (body) => request('/api/rooms', { method: 'POST', body }),
  roomJoin:    (code, password) => request(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: { password: password || '' } }),
  roomStoreTicket: (code, roomTicket) => {
    if (!code || !roomTicket) return
    sessionStorage.setItem(`room:${String(code).toUpperCase()}:ticket`, roomTicket)
  },
  roomUpdate:  (code, patch) => request(`/api/rooms/${encodeURIComponent(code)}`, { method: 'PATCH', body: patch }),
  roomClose:   (code) => request(`/api/rooms/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  // settings
  settings: () => request('/api/settings'),
  adminSettings: () => request('/api/admin/settings'),
  adminUpdateSettings: (patch) => request('/api/admin/settings', { method: 'PATCH', body: patch }),
  adminTestRemote: (payload) => request('/api/admin/settings/test-remote', { method: 'POST', body: payload || {} }),
  adminTestStun: (payload) => request('/api/admin/settings/test-stun', { method: 'POST', body: payload || {} }),
  adminTestTurn: (payload) => request('/api/admin/settings/test-turn', { method: 'POST', body: payload || {} }),

  // admin
  adminUsers: () => request('/api/admin/users'),
  adminRoms: () => request('/api/admin/roms'),
  adminRomCheats: (id) => request(`/api/admin/roms/${id}/cheats`),
  adminRomCheatsSave: (id, cheats) => request(`/api/admin/roms/${id}/cheats`, { method: 'PUT', body: { cheats } }),
  adminBios: () => request('/api/admin/bios'),
  // 本地 ROM 一键迁移到远端存储：GET 拿进度/统计，POST 启动或停止。
  adminRomRemoteMigration: () => request('/api/admin/roms/remote-migration'),
  adminStartRomRemoteMigration: () => request('/api/admin/roms/remote-migration', { method: 'POST' }),
  adminCancelRomRemoteMigration: () => request('/api/admin/roms/remote-migration/cancel', { method: 'POST' }),
  adminUpdateUser: (id, patch) => request(`/api/admin/users/${id}`, { method: 'PATCH', body: patch }),
  adminDeleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
}
