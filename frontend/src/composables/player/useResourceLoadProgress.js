/*
 * 资源加载进度：一次"进入游戏"就是一个会话。
 *
 * 会话里登记若干个资源任务（核心 js/wasm、游戏文件、父版本、BIOS…），下载过程
 * 按块汇报已读取字节，界面据此显示每个资源与总体的真实进度。设计上有三条硬
 * 约束：
 *
 * 1. 计量口径统一。浏览器给的响应流通常已经解压，而 Content-Length 可能是压缩
 *    后的长度，所以进度一律按"资源本身的体积"算：核心用发布清单里的原始体积，
 *    ROM 用数据库里的 file_size，BIOS 用未压缩响应的 Content-Length。没有可信
 *    总长时不给百分比（determinate = false），界面显示已读取字节数。
 * 2. 回调不刷爆界面。下载回调按 256 KB 触发，这里再按 100ms 合并一次写入。
 * 3. 会话隔离。换游戏 / 换版本 / 离开页面会开始新会话并中断旧会话的请求，旧会话
 *    的迟到回调一律丢弃，因此不会串进度、也不会把取消当成完成。
 */

import { computed, getCurrentInstance, onBeforeUnmount, reactive, ref } from 'vue'
import { registerCoreTasksFor } from './useCoreAssets.js'

// 进度写入的最小间隔（毫秒）。大文件按 256 KB 回调时约 10 次/秒，够顺滑。
const FLUSH_INTERVAL_MS = 100

export const STAGE_TEXT = Object.freeze({
  idle: '',
  meta: '读取游戏信息…',
  resources: '加载资源…',
  verify: '校验资源…',
  emulator: '初始化模拟器…',
  ready: '启动完成',
  failed: '加载失败',
})

const STATUS_TEXT = Object.freeze({
  pending: '等待中',
  loading: '下载中',
  cached: '本地缓存已就绪',
  verifying: '校验中',
  done: '已就绪',
  skipped: '已跳过',
  failed: '加载失败',
  canceled: '已取消',
})

function isSettledStatus(status) {
  return status === 'done' || status === 'cached' || status === 'skipped' || status === 'failed' || status === 'canceled'
}

export function useResourceLoadProgress({ flushIntervalMs = FLUSH_INTERVAL_MS } = {}) {
  const stage = ref('idle')
  const tasks = ref([])
  const sessionId = ref(0)
  const failure = ref(null)

  // id → 任务对象（tasks 里的同一个对象引用），以及待写入的进度值
  const byId = new Map()
  const pendingBytes = new Map()
  let flushTimer = null
  let controller = null

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (!pendingBytes.size) return
    for (const [id, loaded] of pendingBytes) {
      const task = byId.get(id)
      if (task) task.loaded = loaded
    }
    pendingBytes.clear()
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(flush, flushIntervalMs)
  }

  function abortSession() {
    if (controller) {
      try { controller.abort() } catch {}
      controller = null
    }
  }

  /** 开始一次新的加载会话：中断上一次请求，清空任务。 */
  function beginSession({ stage: initialStage = 'meta' } = {}) {
    abortSession()
    flush()
    controller = new AbortController()
    byId.clear()
    pendingBytes.clear()
    tasks.value = []
    failure.value = null
    stage.value = initialStage
    sessionId.value += 1
    return sessionId.value
  }

  /** 当前会话的取消信号：下载时传进 fetch，换会话即中断。 */
  function currentSignal() {
    if (!controller) controller = new AbortController()
    return controller.signal
  }

  function isCurrent(session) {
    return session === undefined || session === null || session === sessionId.value
  }

  /** 登记（或补齐）一个资源任务；重复登记只会更新标签与体积。 */
  function ensureTask({ id, label, kind = 'asset', size = null }) {
    if (!id) return null
    let task = byId.get(id)
    if (!task) {
      task = reactive({
        id,
        label: label || id,
        kind,
        size: Number.isFinite(size) && size > 0 ? size : null,
        loaded: 0,
        status: 'pending',
        note: '',
        error: '',
      })
      byId.set(id, task)
      tasks.value = [...tasks.value, task]
    } else {
      if (label) task.label = label
      if (!task.size && Number.isFinite(size) && size > 0) task.size = size
    }
    return task
  }

  function setTaskSize(id, size) {
    const task = byId.get(id)
    if (!task || task.size) return
    if (Number.isFinite(size) && size > 0) task.size = size
  }

  function setTaskStatus(id, status, patch = {}) {
    const task = byId.get(id)
    if (!task) return null
    task.status = status
    if (patch.error !== undefined) task.error = patch.error || ''
    if (patch.note !== undefined) task.note = patch.note || ''
    if (patch.source !== undefined) task.source = patch.source
    if (patch.label !== undefined && patch.label) task.label = patch.label
    if (patch.size !== undefined) setTaskSize(id, patch.size)
    return task
  }

  /**
   * 汇报已读取字节。`session` 用于丢弃旧会话的迟到回调。
   * loaded 是"资源本身"的字节数；cached 表示直接命中了本地副本。
   */
  function taskProgress(id, loaded, { session, cached = false } = {}) {
    if (!isCurrent(session)) return
    const task = byId.get(id)
    if (!task) return
    if (cached) {
      flush()
      task.loaded = task.size || Number(loaded) || 0
      task.status = 'cached'
      task.note = ''
      task.error = ''
      return
    }
    if (task.status === 'pending') task.status = 'loading'
    // 有新字节进来就说明正在正常下载，清掉"切换地址"之类的提示。
    if (task.note && !task.error) task.note = ''
    pendingBytes.set(id, Number(loaded) || 0)
    scheduleFlush()
  }

  function taskSettled(id, status = 'done', patch = {}) {
    flush()
    const task = setTaskStatus(id, status, patch)
    if (!task) return null
    if (patch.loaded !== undefined) task.loaded = Number(patch.loaded) || 0
    else if (task.size && (status === 'done' || status === 'cached')) task.loaded = task.size
    return task
  }

  function taskFailed(id, message, patch = {}) {
    flush()
    const label = byId.get(id)?.label || id
    const task = setTaskStatus(id, 'failed', { ...patch, error: message || '加载失败' })
    if (!failure.value) failure.value = { id, label, message: message || '加载失败' }
    return task
  }

  /**
   * 从面板上抹掉一个任务（只用于"已经不需要了、而且还没开始"的任务）。
   * 典型场景：选定核心从平台默认值切到 ROM 指定的核心，前一个核心的占位任务不该
   * 继续计入"共几项"。已经在下载或已经完成的任务不删——那是在抹掉事实。
   */
  function dropTask(id) {
    const task = byId.get(id)
    if (!task) return false
    if (isSettledStatus(task.status) || task.status === 'loading' || task.status === 'verifying') return false
    byId.delete(id)
    pendingBytes.delete(id)
    tasks.value = tasks.value.filter((item) => item !== task)
    return true
  }

  function setStage(next) {
    if (!STAGE_TEXT[next]) return
    stage.value = next
  }

  // 核心任务是唯一"提前知道体积"的部分：清单里写着原始体积与 sha256，
  // 于是核心下载可以显示准确百分比，也能在完成后校验内容。实现挂在 api 上
  // （见文件底部）：必须把 reactive 包装后的对象交给它，否则迭代的是 tasks 这个
  // ref 对象 —— Chromium 抛 "object is not iterable"、WebKit 抛 "undefined is
  // not a function"，核心任务登记不上，进度面板只剩 ROM 那几项。

  const overall = computed(() => {
    let totalBytes = 0
    let loadedBytes = 0
    let completed = 0
    let settled = 0
    let unknownSize = 0
    for (const task of tasks.value) {
      if (task.status === 'skipped' || task.status === 'canceled') {
        settled += 1
        completed += 1
        continue
      }
      const size = task.size || null
      if (size) totalBytes += size
      else if (!isSettledStatus(task.status)) unknownSize += 1
      loadedBytes += Math.min(task.loaded || 0, size || Number.MAX_SAFE_INTEGER)
      if (isSettledStatus(task.status)) {
        settled += 1
        if (task.status === 'done' || task.status === 'cached') completed += 1
      }
    }
    const totalCount = tasks.value.length
    const determinate = totalBytes > 0 && (unknownSize === 0 || settled === totalCount)
    let ratio = null
    if (determinate) ratio = Math.max(0, Math.min(loadedBytes / totalBytes, 1))
    else if (totalCount > 0 && settled === totalCount) ratio = 1
    return {
      ratio,
      determinate,
      loadedBytes,
      totalBytes,
      completed,
      settled,
      totalCount,
      hasTasks: totalCount > 0,
      allSettled: totalCount > 0 && settled === totalCount,
      activeLabel: tasks.value.find((task) => task.status === 'loading' || task.status === 'verifying')?.label || '',
    }
  })

  const stageText = computed(() => STAGE_TEXT[stage.value] || '')

  function statusTextFor(task) {
    if (task.status === 'failed' && task.error) return task.error
    if (task.note) return task.note
    return STATUS_TEXT[task.status] || ''
  }

  function reset() {
    abortSession()
    flush()
    byId.clear()
    pendingBytes.clear()
    tasks.value = []
    failure.value = null
    stage.value = 'idle'
  }

  if (getCurrentInstance()) onBeforeUnmount(() => { abortSession() })

  let progress = null
  const api = {
    stage,
    tasks,
    sessionId,
    failure,
    overall,
    stageText,
    beginSession,
    currentSignal,
    ensureTask,
    setTaskSize,
    setTaskStatus,
    taskProgress,
    taskSettled,
    taskFailed,
    dropTask,
    setStage,
    registerCoreTasks: (core, options) => registerCoreTasksFor(progress, core, options),
    statusTextFor,
    reset,
    // 测试与特殊场景：立刻落盘挂起的进度
    flushNow: flush,
  }
  // reactive() 会把内部的 ref / computed 解包，模板和控制台里直接读
  // progress.stage / progress.overall 就是当前值，不用再 .value。
  progress = reactive(api)
  return progress
}
