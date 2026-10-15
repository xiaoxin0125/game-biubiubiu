/*
 * 给 Node 补一个 ErrorEvent 全局。
 *
 * 为什么需要：`@hono/node-ws` 1.3.1 在 WebSocket 的 error 事件里会执行
 *   events?.onError?.(new ErrorEvent("error", { error }), ctx)
 * 而 Node 只提供 Event / MessageEvent / CloseEvent，**没有** ErrorEvent（实测 Node 24）。
 * 于是每次 socket 出错都会抛 ReferenceError 被库自己 catch 掉并 console.error 整段栈
 * —— 我们注册的 onError 永远收不到通知，攻击者还能用超大消息（被 ws 的 maxPayload
 * 拒绝）成批刷日志。
 *
 * 这里只补最小的构造语义：type、error、message 三个属性够库用，其余字段留空。
 * 装了它之后，socket 错误会正常走到 rooms-ws.js 的 onError（负责摘掉该 peer）。
 */

export function installErrorEventPolyfill(target = globalThis) {
  if (typeof target.ErrorEvent === 'function') return false

  class ErrorEvent extends target.Event {
    constructor(type, init = {}) {
      super(type)
      this.message = String(init.message ?? init.error?.message ?? '')
      this.error = init.error ?? null
      this.filename = String(init.filename ?? '')
      this.lineno = Number(init.lineno ?? 0)
      this.colno = Number(init.colno ?? 0)
    }
  }

  target.ErrorEvent = ErrorEvent
  return true
}

installErrorEventPolyfill()
