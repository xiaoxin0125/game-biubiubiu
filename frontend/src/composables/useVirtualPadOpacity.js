import { ref, watch } from 'vue'

// 虚拟手柄透明度：手机端可以一键把整块手柄压到 20%，把画面让出来；
// 再点一下恢复。跟「连发」开关一样持久化在 localStorage，刷新、重进游戏都还记得，
// 按钮自己会亮起来提示当前是压低状态。压到多少见 VirtualGamepad.vue 的 .vpad-dimmed。
const STORAGE_KEY = 'vpad:opacity-dim'

function readStoredDimmed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function useVirtualPadOpacity() {
  const dimmed = ref(readStoredDimmed())

  function toggle() {
    dimmed.value = !dimmed.value
  }

  watch(dimmed, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      // 隐私模式下写不进去：只影响下次进入游戏的记忆，不影响本次开关。
    }
  })

  return { dimmed, toggle }
}
