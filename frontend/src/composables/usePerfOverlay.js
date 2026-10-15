// 播放页性能自检浮层：手机端排查「进游戏就卡死」用。
//
// 用法：在游戏地址后面加 ?perf=1（例如 https://xbw.ppxin.com/play/49?perf=1 ），
// 画面左上角会显示实时数据；不加这个参数时本模块完全不启动，正常游戏不受影响。
//
// 显示内容（每秒刷新）：
//   fps      —— 页面主线程的动画帧率。掉到 0 并保持，说明主线程被卡死；
//   最长停顿 —— 观测到的最长一次主线程停顿（毫秒），≥1000 会标红；
//   停顿次数 —— 超过 350ms 的停顿次数，附最近一次发生的时间；
//   触摸数   —— 手指按下次数，用来确认屏幕是不是完全收不到触摸；
//   内存     —— 浏览器报告的 JS 堆大小（仅部分浏览器支持）；
//   画面     —— canvas 的分辨率和显示尺寸，能看出是否因为反复重设尺寸卡住。
//
// 把这个浮层上的数字拍照发出来，就能判断是「主线程卡死」还是「画面/输入异常」。
import { onBeforeUnmount, onMounted, ref } from 'vue'

const LONG_TASK_MS = 350

export function usePerfOverlay({ enabled }) {
  const active = typeof window !== 'undefined' && !!enabled
  const stats = ref('')
  const worstGapMs = ref(0)
  const longTasks = ref(0)
  const touches = ref(0)

  let rafId = 0
  let timerId = 0
  let frames = 0
  let lastFrameAt = 0
  let windowStartAt = 0
  let fps = 0
  let maxGap = 0
  let tasks = 0
  let lastTaskAt = 0

  function tick() {
    const now = performance.now()
    frames += 1
    if (lastFrameAt) {
      const gap = now - lastFrameAt
      if (gap > maxGap) {
        maxGap = gap
        worstGapMs.value = Math.round(gap)
      }
      if (gap >= LONG_TASK_MS) {
        tasks += 1
        longTasks.value = tasks
        lastTaskAt = Math.round(now)
      }
    }
    lastFrameAt = now
    rafId = requestAnimationFrame(tick)
  }

  function onTouchStart() {
    touches.value += 1
  }

  function render() {
    const now = performance.now()
    if (windowStartAt) {
      const elapsed = now - windowStartAt
      if (elapsed >= 1000) {
        fps = Math.round((frames * 1000) / elapsed)
        frames = 0
        windowStartAt = now
      }
    } else {
      windowStartAt = now
    }
    const canvas = document.querySelector('.player-page canvas')
    const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : '—'
    stats.value = [
      `fps ${fps}`,
      `最长停顿 ${worstGapMs.value}ms`,
      `停顿≥${LONG_TASK_MS}ms ${longTasks.value} 次${lastTaskAt ? `（最近 ${lastTaskAt}ms）` : ''}`,
      `触摸 ${touches.value} 次`,
      `内存 ${mem}`,
      canvas ? `画面 ${canvas.width}×${canvas.height} 显示 ${canvas.clientWidth}×${canvas.clientHeight}` : '画面 未创建',
      `视口 ${window.innerWidth}×${window.innerHeight} 缩放${(window.visualViewport?.scale || 1).toFixed(2)}`,
    ].join('\n')
    timerId = window.setTimeout(render, 1000)
  }

  onMounted(() => {
    if (!active) return
    windowStartAt = performance.now()
    lastFrameAt = 0
    rafId = requestAnimationFrame(tick)
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    timerId = window.setTimeout(render, 1000)
  })

  onBeforeUnmount(() => {
    if (!active) return
    cancelAnimationFrame(rafId)
    clearTimeout(timerId)
    document.removeEventListener('touchstart', onTouchStart)
  })

  return { active, stats, worstGapMs, longTasks, touches }
}
