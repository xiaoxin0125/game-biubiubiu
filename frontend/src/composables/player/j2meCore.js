/*
 * J2ME 的“核心”。
 *
 * J2ME 不走 libretro：`.jar` 由随前端一起发布的 J2meJS 运行时解释
 * （`frontend/public/j2me/`，细节见该目录的 INTEGRATION.md）。运行时页面自己
 * 会去取那批脚本、样式与 Java 类库，所以这里不改运行时的取法，而是在打开 iframe
 * 之前用**同一批地址**先取一遍：
 *
 * 1. 进度面板里因此有了“核心”这一项（约 4.4 MB）的真实进度；以前 ROM 下完就
 *    只剩一句“初始化模拟器…”，几兆的运行时在看不见的地方慢慢下。
 * 2. iframe 打开时这些请求已经落在浏览器缓存里，不会重复下载：所有地址都带内容
 *    版本号 `?v=<version>`，js/css 有 12 小时 max-age，类库与页面同版本。
 *
 * 取哪些文件、每个文件多大，来自构建时写好的 `/j2me/version.json` 的 `boot`
 * 列表（`frontend/scripts/stamp-j2me-runtime.mjs` 把 main.html 引用的本地资源、
 * 以及 `java/*.jar` 类库连同体积写进去）。没有这份清单（本地开发、或还没跑构建
 * 脚本的部署）就什么都不登记也不预取：面板退回“只有 ROM”，与发布运行时之前一致
 * —— 绝不留一个永远完不成的占位项。
 */

import { fetchBlob } from '../useBlobCache.js'

// 运行时的三个类库（J2meJS 的 enginemode）：默认那个兼容库能启动最多 MIDlet，
// 需要 MIDP 2.0 特性的游戏可以按 ROM 指定 enginemode2 / enginemode3。
export const J2ME_DEFAULT_ENGINE = 'enginemode1-classesold.jar'
export const J2ME_ENGINES = new Set(['enginemode1-classesold.jar', 'enginemode2-classes2.jar', 'enginemode3-classes.jar'])

const RUNTIME_BASE_URL = '/j2me'
const MANIFEST_URL = `${RUNTIME_BASE_URL}/version.json`

// 任务 id 沿用核心任务的命名方式（core:<核心>:<部分>），“核心”一律写 j2mejs：
// 旧设置里的 js2me / squirreljme 跑的是同一个运行时，不该多出一组任务。
const RUNTIME_TASK_ID = 'core:j2mejs:runtime'
const CLASS_LIBRARY_TASK_PREFIX = 'core:j2mejs:java:'

// 构建脚本把 java/*.jar 都写进启动清单（它不知道这一局用哪个 enginemode），
// 但真正要下的只有选中的那一个：其余两个既不下载，也不算进“运行时”的体积。
const CLASS_LIBRARY_PATTERN = /^java\/.*\.jar$/

// 运行时文件都很小，5 个并发够把进度填满，也不会挤掉同时在下的 ROM / BIOS。
const FETCH_CONCURRENCY = 5
// 完全没有新字节进来的时长上限。慢不等于卡：只要还在收字节就不动它；连接真的
// 卡死时放弃等待（这些文件交给运行时自己去取，它的页面有 30 秒启动超时兜底）。
const IDLE_TIMEOUT_MS = 20 * 1000

let manifestPromise = null

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR'
}

/**
 * 运行时清单：内容版本号 + 启动资源（含体积）。
 *
 * 用 `cache: 'no-store'` 读：版本号本身就是用来破缓存的，它要是从缓存里来，
 * 新页面就可能配上老脚本。读取失败或文件还没生成时返回 null，而且**不记住这次
 * 失败** —— 下一次开局会再问一次，同一次页面加载里不会反复请求。
 */
export function loadJ2meRuntimeManifest() {
  if (manifestPromise) return manifestPromise
  const pending = fetch(MANIFEST_URL, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const version = typeof data?.version === 'string' ? data.version : ''
      if (!version) return null
      const boot = (Array.isArray(data.boot) ? data.boot : [])
        .filter((file) => typeof file?.name === 'string' && file.name)
        .map((file) => ({ name: file.name, size: Number(file.size) > 0 ? Number(file.size) : null }))
      return { version, boot }
    })
    .catch(() => null)
  manifestPromise = pending.then((manifest) => {
    if (!manifest) manifestPromise = null
    return manifest
  })
  return manifestPromise
}

export function resetJ2meRuntimeManifestCache() {
  manifestPromise = null
}

/**
 * 类库文件在运行时里的路径。运行时自己按 `config.enginemode.split('-')[1]`
 * 取文件名（见 `bld/main-all.js`），这里跟它保持一致，认不出来就退回默认类库。
 */
export function j2meClassLibrary(engine = J2ME_DEFAULT_ENGINE) {
  const name = String(engine || '').split('-')[1] || String(J2ME_DEFAULT_ENGINE).split('-')[1]
  return /^[\w.]+\.jar$/.test(name) ? `java/${name}` : `java/${String(J2ME_DEFAULT_ENGINE).split('-')[1]}`
}

function classLibraryTaskId(classLibrary) {
  return `${CLASS_LIBRARY_TASK_PREFIX}${classLibrary.slice('java/'.length)}`
}

function totalSize(files) {
  return files.reduce((sum, file) => sum + (file.size || 0), 0) || null
}

function assetUrl(name, version) {
  const url = `${RUNTIME_BASE_URL}/${name}`
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

/** fetchBlob 的报错里带着整条 URL（含版本号）：面板上只留能看懂的部分。 */
function describeFailure(error) {
  const text = String(error?.message || '').trim()
  const status = text.match(/→ (\d{3})\b/)
  if (status) return `HTTP ${status[1]}`
  return text || '下载失败'
}

/**
 * 登记 J2ME 的“核心”任务，并返回这次要取的资源（登记与取用共用同一份清单）。
 *
 * 返回 null 表示这次不做任何事：没有清单、或清单里没有启动资源。进度面板里除
 * ROM 之外的东西一律不动 —— 占位任务比没有任务更糟。
 */
export async function registerJ2meCoreTasks(progress, { engine = J2ME_DEFAULT_ENGINE } = {}) {
  const manifest = await loadJ2meRuntimeManifest()
  if (!manifest?.boot?.length) return null

  const classLibrary = j2meClassLibrary(engine)
  const runtimeFiles = manifest.boot.filter((file) => !CLASS_LIBRARY_PATTERN.test(file.name))
  const classLibraryFiles = manifest.boot.filter((file) => file.name === classLibrary)
  const jobs = []
  if (runtimeFiles.length) {
    jobs.push({ id: RUNTIME_TASK_ID, label: 'J2meJS 运行时（脚本与样式）', files: runtimeFiles, size: totalSize(runtimeFiles) })
  }
  // 类库是运行时里最大的一块，也是启动耗时的主要来源，单列一项更看得明白。
  if (classLibraryFiles.length) {
    jobs.push({
      id: classLibraryTaskId(classLibrary),
      label: `Java 类库（${classLibrary.slice('java/'.length)}）`,
      files: classLibraryFiles,
      size: totalSize(classLibraryFiles),
    })
  }
  if (!jobs.length) return null

  if (progress) {
    // 平台默认核心可能先占过位（core:xxx:js|wasm），J2ME 没有那两个文件：
    // 去掉还没开始的占位，已经在下的不碰。
    const wanted = new Set(jobs.map((job) => job.id))
    for (const task of progress.tasks || []) {
      if (task?.kind === 'core' && !wanted.has(task.id)) progress.dropTask?.(task.id)
    }
    for (const job of jobs) {
      progress.ensureTask({ id: job.id, label: job.label, kind: 'core', size: job.size })
    }
  }

  return { version: manifest.version, jobs }
}

async function loadJob(job, { version, session, progress, signal, keepAlive }) {
  const queue = [...job.files]
  let loaded = 0
  let failure = null

  while (queue.length && !failure && !signal.aborted) {
    await Promise.all(queue.splice(0, FETCH_CONCURRENCY).map(async (file) => {
      if (failure || signal.aborted) return
      try {
        const { bytes } = await fetchBlob(assetUrl(file.name, version), {
          signal,
          // 地址里已经带内容版本号：命中缓存就直接用，不必回源确认；这一次请求的
          // 意义正是让 iframe 之后读到同一份缓存。
          cache: 'force-cache',
          expectedSize: file.size,
          onProgress: ({ loaded: fileLoaded, done }) => {
            if (done) return
            keepAlive()
            progress?.taskProgress(job.id, loaded + fileLoaded, { session })
          },
        })
        keepAlive()
        loaded += bytes
        progress?.taskProgress(job.id, loaded, { session })
      } catch (error) {
        if (!isAbortError(error)) failure = { name: file.name, message: describeFailure(error) }
      }
    }))
  }

  return { loaded, failure }
}

/**
 * 把运行时启动资源取一遍，进度写进面板，返回清单（调用方要用它的版本号）。
 *
 * 失败一律不抛：这几项下载只是“提前取”，拿不到时运行时会自己去取，能不能开起来
 * 由运行时说了算。会话换了、或者连接卡死了就停下，绝不把等待拖成无限。
 */
export async function warmJ2meRuntime({ progress = null, engine = J2ME_DEFAULT_ENGINE, signal = null } = {}) {
  // 会话要在第一个 await 之前记下来：从那以后面板里可能已经是另一局游戏了。
  const session = progress?.sessionId
  const plan = await registerJ2meCoreTasks(progress, { engine })
  if (!plan) return null
  const isStale = () => progress && session != null && session !== progress.sessionId
  if (isStale()) return plan

  const controller = new AbortController()
  const abort = () => { try { controller.abort() } catch {} }
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }

  let idleTimedOut = false
  let idleTimer = null
  const keepAlive = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { idleTimedOut = true; abort() }, IDLE_TIMEOUT_MS)
  }

  progress?.setStage('resources')
  keepAlive()
  try {
    const results = await Promise.all(plan.jobs.map((job) => loadJob(job, {
      version: plan.version, session, progress, signal: controller.signal, keepAlive,
    })))

    // 会话换了（换游戏 / 离开页面）就什么都不写：此刻面板里是另一局的同名任务。
    if (isStale()) return plan
    plan.jobs.forEach((job, index) => {
      const result = results[index]
      if (idleTimedOut) {
        progress?.taskSettled(job.id, 'skipped', { note: '下载超时，改由运行时自行加载' })
      } else if (controller.signal.aborted) {
        // 被会话信号中断：上面已经判过 stale，这里只是防御。
      } else if (result.failure) {
        progress?.taskFailed(job.id, `${result.failure.name} 下载失败（${result.failure.message}）`)
      } else {
        progress?.taskSettled(job.id, 'done', { size: job.size || result.loaded, loaded: result.loaded })
      }
    })
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    signal?.removeEventListener?.('abort', abort)
  }

  return plan
}
