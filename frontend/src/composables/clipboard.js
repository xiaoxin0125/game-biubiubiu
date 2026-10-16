// 复制文本到剪贴板。Clipboard API 只在安全上下文（HTTPS / localhost）里可用，
// 老 WebView 里干脆没有，所以失败了再退回「隐藏 textarea + execCommand」的老办法，
// 两条路都不行就返回 false，由调用方决定怎么提示。

export async function copyText(text) {
  const value = String(text ?? '')
  if (!value) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // 权限被拒 / 非安全上下文：继续走下面的兜底
  }

  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
