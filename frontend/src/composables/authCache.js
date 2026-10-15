/*
 * 路由守卫与 useAuth 共用的一份"当前用户"缓存。
 *
 * 守卫只需要判断"这个页面能不能进"，没必要每次导航都问一次 /api/auth/me；
 * 但缓存必须跟着登录状态走：登出、登录、改密之后不失效的话，会出现
 * "已经登出还能进 requiresAuth 页面"（接口随后 401，页面报错）这种状态
 * （2026-10 审计 L-12）。
 *
 * 所以缓存只放在这里，由 useAuth 在登录成功、登出、改密成功后显式改写：
 *   - cacheCurrentUser(user) —— 登录/刷新后写入
 *   - clearCurrentUserCache() —— 登出/改密后清空（undefined = 下次导航重新问接口）
 */

let cached = undefined

export function peekCurrentUser() {
  return cached
}

export function cacheCurrentUser(user) {
  cached = user ?? null
}

export function clearCurrentUserCache() {
  cached = undefined
}
