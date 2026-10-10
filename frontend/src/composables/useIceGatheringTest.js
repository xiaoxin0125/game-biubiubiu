// 浏览器侧 WebRTC 自检。
//
// 主要给后台「站点设置 → STUN 服务器」的测试按钮用：按填写的地址原样建一个
// RTCPeerConnection 并等 ICE 采集结束，用来确认地址能被浏览器接受、本机
// WebRTC 可用。浏览器不会把 STUN 的应答内容暴露给页面，所以"STUN 服务器
// 是否真的可用"由服务端探测（server/stun-test.js）判断。
//
// 注意：必须在页面处于可见状态时调用。后台标签页的定时器会被浏览器节流，
// ICE 采集可能迟迟不结束。

const DEFAULT_TIMEOUT_MS = 3500

function toServerList(hosts) {
  const urls = [...new Set((hosts || []).map((item) => String(item || '').trim()).filter(Boolean))]
  return urls.length ? [{ urls }] : []
}

export function testStunIce(hosts, { iceTransportPolicy = 'all', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection !== 'function') {
      resolve({ ok: false, candidates: 0, error: '当前浏览器不支持 WebRTC（需要 HTTPS 环境和现代浏览器）' })
      return
    }
    const servers = toServerList(hosts)
    if (!servers.length) {
      resolve({ ok: false, candidates: 0, error: '还没有填写 STUN 地址' })
      return
    }
    let pc
    try {
      // 带 iceCandidatePoolSize 时浏览器在创建对象后就预采集，不需要真的协商
      pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy, iceCandidatePoolSize: 1 })
    } catch (error) {
      resolve({ ok: false, candidates: 0, error: `ICE 配置被浏览器拒绝：${error?.message || error}` })
      return
    }
    const candidates = new Set()
    let timer = null
    const finish = (result) => {
      if (timer) clearTimeout(timer)
      pc.onicecandidate = null
      pc.onicegatheringstatechange = null
      try { pc.close() } catch {}
      resolve(result)
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.add(event.candidate.candidate)
        // 只采到 host 候选（局域网地址）说明 STUN 没给出公网地址，多等一会儿再下结论
      } else if (candidates.size) {
        finish({ ok: true, candidates: candidates.size })
      }
    }
    // 有些环境下最后一颗候选会先于 gathering 状态变化，两个信号都等
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete' && candidates.size) finish({ ok: true, candidates: candidates.size })
    }
    timer = setTimeout(() => {
      if (candidates.size) finish({ ok: true, candidates: candidates.size, timedOut: true })
      else finish({ ok: false, candidates: 0, error: `ICE 采集在 ${timeoutMs}ms 内没有产生任何候选地址` })
    }, timeoutMs)
  })
}
