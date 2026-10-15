import { api } from '../../api/client.js'

// 记一次游玩。
//
// 后端把这次调用当成「这盘卡带真的跑起来了」：播放页是在模拟器启动成功
// （@booted）之后才调的，所以加载失败、点了返回都不会凭空 +1。
//
// 同一个页面加载里只记一次：「重载游戏」会再次触发 @booted，但那是同一次
// 游玩，不再重复计数。
//
// 游客也记 —— 他们玩的那一次同样算进热度，只是后端不会给他建个人记录
// （「我的信息」页的最近游玩只认登录用户）。管理员没打开游客试玩时后端会
// 回 401，这里忽略就行。
export function usePlayRecord({ romMeta }) {
  let recorded = false

  async function recordPlay() {
    if (recorded) return
    const id = romMeta?.value?.id
    if (!id) return
    recorded = true
    try {
      await api.romPlay(id)
    } catch {
      // 记录失败不影响游玩：下次启动成功时再补一次。
      recorded = false
    }
  }

  return { recordPlay }
}
