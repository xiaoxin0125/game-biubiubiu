/* Java 存档（RMS，MIDP 的 RecordStore）与站点云存档之间的桥。
 *
 * 为什么需要它：MIDP 里唯一能持久化的东西就是 RMS，而运行时把它落成自己文件系统
 * 里的文件（`/RecordStore/...`，见 bld/main-all.js 的 RECORD_STORE_BASE）。这些
 * 文件躺在同源 iframe 的 IndexedDB 里：跟着浏览器走，而且**不分游戏** —— 换一个
 * ROM 开局时，上一局的记录还在原处，MIDlet 一读就能读到别人的进度。
 *
 * 所以播放页把整棵 `/RecordStore` 当成「这个 ROM、这个用户」的存档来对待：
 *
 *   - 开局前：按 `save` 参数恢复。参数是 blob: 地址（云存档快照）或者 `none`
 *     （这个用户还没有存档，本地要清干净）。恢复必须在 MIDlet 启动之前做完，
 *     于是这里把自己挂进 `loadingPromises` —— 运行时 await 完这一批才起 VM ——
 *     并留一个超时兜底：存档取不回来，游戏照样要能开。
 *   - 运行中：包装写 RMS 的那几个 native，改动后通知播放页（去抖与上传由它负责）。
 *   - 导出：`snapshot()` 把整棵 /RecordStore 读成一份 JSON，连同内容摘要交给播放页；
 *     摘要没变就不会重复上传。
 *
 * 快照格式是我们自己定的，**不复用运行时的 store.export**：那份会把整个文件系统
 * （含各种临时文件）打进去，导入时还会清库，不适合只当一局的存档用。
 *
 *   { v: 1, at: 1730000000000, files: [{ p: "/RecordStore/1/x.db", m: 1730000000000, d: "base64" }] }
 */
(function () {
  'use strict'

  var BASE = '/RecordStore'
  var SNAPSHOT_VERSION = 1
  var SNAPSHOT_TYPE = 'application/x-j2me-rms'
  // 恢复阶段的兜底时限：网络再慢也不能把启动拖成"卡在加载画面"。
  var GATE_TIMEOUT_MS = 8000
  // 攒一小会儿再通知播放页：一次存档往往连着好几个 commitWrite。
  var NOTIFY_DELAY_MS = 800
  var BASE64_CHUNK = 0x8000

  function hasFs() {
    return typeof fs !== 'undefined' && fs && typeof fs.list === 'function'
  }

  function param(name) {
    try { return new URLSearchParams(location.search).get(name) } catch (error) { return null }
  }

  // ---- base64 ----
  // 记录集通常只有几 KB，但别用 apply 一次性喂大数组：分块走。
  function toBase64(bytes) {
    var text = ''
    for (var i = 0; i < bytes.length; i += BASE64_CHUNK) {
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
    }
    return btoa(text)
  }

  function fromBase64(text) {
    var binary = atob(text)
    var bytes = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  /** 内容摘要（FNV-1a，32 位）：只用来判断"和上次上传的是不是同一份"。 */
  function digestOf(text, seed) {
    var hash = seed == null ? 0x811c9dc5 : seed
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i)
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
    }
    return hash.toString(16)
  }

  // ---- 收集与读写 ----
  /** /RecordStore 下所有文件的路径（深度优先，目录本身不算）。 */
  function rmsPaths() {
    var out = []
    if (!hasFs()) return out
    if (!fs.exists(BASE)) return out
    collect(BASE, out)
    return out
  }

  function collect(path, out) {
    var names = fs.list(path)
    for (var i = 0; i < names.length; i++) {
      var name = names[i]
      var isDir = name.charAt(name.length - 1) === '/'
      // fs.list 给目录名带上尾斜杠（见 main-all.js 的 list）。
      var child = path + '/' + (isDir ? name.slice(0, -1) : name)
      if (isDir) collect(child, out)
      else out.push(child)
    }
  }

  function readFiles(paths) {
    var files = []
    var chain = Promise.resolve()
    paths.forEach(function (path) {
      chain = chain.then(function () {
        var blob = fs.getBlob(path)
        if (!blob) return
        var stat = fs.stat(path)
        return blob.arrayBuffer().then(function (buffer) {
          files.push({
            p: path,
            m: stat ? stat.mtime : Date.now(),
            d: toBase64(new Uint8Array(buffer)),
          })
        })
      })
    })
    return chain.then(function () { return files })
  }

  function applySnapshot(text) {
    var data = JSON.parse(text)
    var files = data && data.files ? data.files : []
    var wanted = {}
    files.forEach(function (file) { wanted[file.p] = true })
    // 本地多的先删掉：上一局（别的 ROM）留下的记录不能混进这一局。
    rmsPaths().forEach(function (path) { if (!wanted[path]) fs.remove(path) })
    files.forEach(function (file) {
      if (!/^\/RecordStore\//.test(file.p) || file.p.indexOf('..') !== -1) throw new Error('快照里有非法路径：' + file.p)
      var dir = fs.dirname(file.p)
      if (!fs.exists(dir)) fs.mkdirp(dir)
      if (fs.exists(file.p)) fs.remove(file.p)
      if (!fs.create(file.p, new Blob([fromBase64(file.d)]))) throw new Error('写入失败：' + file.p)
    })
    return files.length
  }

  function removeAll() {
    var paths = rmsPaths()
    paths.forEach(function (path) { fs.remove(path) })
    return paths.length
  }

  function sync(next) {
    try {
      if (typeof fs.syncStore === 'function') fs.syncStore(next)
      else next()
    } catch (error) {
      next()
    }
  }

  // ---- 导出（播放页在改动之后来取）----
  /** @returns {Promise<{blob: Blob, digest: string, files: number, bytes: number}|null>} */
  function snapshot() {
    if (!hasFs()) return Promise.resolve(null)
    return readFiles(rmsPaths()).then(function (files) {
      var text = JSON.stringify({ v: SNAPSHOT_VERSION, at: Date.now(), files: files })
      return {
        blob: new Blob([text], { type: SNAPSHOT_TYPE }),
        digest: digestOf(text),
        files: files.length,
        bytes: text.length,
      }
    })
  }

  // ---- 改动通知 ----
  var dirty = false
  var notifyTimer = null
  var watched = [
    // 记录真正落盘就在 commitWrite；writeBytes 只是往文件里写。
    'com/sun/midp/rms/RecordStoreFile.commitWrite.(I)V',
    'com/sun/midp/rms/RecordStoreFile.truncateFile.(II)V',
    'com/sun/midp/rms/RecordStoreUtil.deleteFile.(Ljava/lang/String;Ljava/lang/String;I)V',
  ]

  function post(message) {
    // 同上：固定目标源，不给跨源窗口接收的机会。
    try { parent.postMessage(message, location.origin) } catch (error) { /* 没有父页面（直接开 main.html 调试）*/ }
  }

  function markDirty() {
    dirty = true
    if (notifyTimer != null) return
    notifyTimer = setTimeout(function () {
      notifyTimer = null
      post({ type: 'j2me-rms-dirty' })
    }, NOTIFY_DELAY_MS)
  }

  function hookWrites() {
    if (typeof Native === 'undefined') return false
    var complete = true
    watched.forEach(function (signature) {
      var native = Native[signature]
      if (typeof native !== 'function') { complete = false; return }
      if (native.__rmsHooked) return
      var wrapped = function () {
        var result = native.apply(this, arguments)
        markDirty()
        return result
      }
      wrapped.__rmsHooked = true
      Native[signature] = wrapped
    })
    return complete
  }

  if (!hookWrites()) {
    // 正常顺序里运行时脚本先加载，这里只是兜底。
    var hookTimer = setInterval(function () { if (hookWrites()) clearInterval(hookTimer) }, 200)
  }

  // ---- 启动前的恢复 ----
  // 播放页把它挂进 loadingPromises：运行时 await 完这一批才起 VM，所以 MIDlet 第一次
  // 读 RMS 时看到的一定是云存档（或一份干净的空气）。
  var status = { restore: 'pending', files: 0, removed: 0, bytes: 0, error: '' }
  var gateResolve = null
  var gateDone = false
  var gate = new Promise(function (resolve) { gateResolve = resolve })

  function finish(restore, extra) {
    status.restore = restore
    if (extra) {
      if (extra.files != null) status.files = extra.files
      if (extra.removed != null) status.removed = extra.removed
      if (extra.bytes != null) status.bytes = extra.bytes
      if (extra.error) status.error = String(extra.error)
    }
    if (gateDone) return
    gateDone = true
    post({ type: 'j2me-rms-restored', status: { restore: status.restore, files: status.files, removed: status.removed, error: status.error } })
    gateResolve()
  }

  setTimeout(function () { finish(status.restore === 'pending' ? 'timeout' : status.restore) }, GATE_TIMEOUT_MS)
  if (typeof loadingPromises !== 'undefined' && loadingPromises && typeof loadingPromises.push === 'function') loadingPromises.push(gate)

  function restore() {
    var mode = param('save')
    if (!hasFs()) return finish('skipped', { error: '文件系统不可用' })
    // 没登录（或旧播放页）：不碰本地数据，与接入云存档之前一样。
    if (mode == null || mode === '') return finish('skipped')
    if (mode === 'none') {
      var removed = removeAll()
      return sync(function () { finish('cleared', { removed: removed }) })
    }
    return fetch(mode, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response.text()
    }).then(function (text) {
      var count = applySnapshot(text)
      return sync(function () { finish('loaded', { files: count, bytes: text.length }) })
    }).catch(function (error) {
      console.warn('[j2me] 云存档读取失败：' + (error && error.message ? error.message : error))
      finish('failed', { error: error && error.message ? error.message : error })
    })
  }

  // initFS 是运行时打开 IndexedDB 文件系统的那一步（main-all.js 把它放在
  // loadingPromises 的第一项）。晚于它才不会写到还没打开的库上。
  Promise.resolve(typeof initFS !== 'undefined' ? initFS : null).then(function () {
    if (!gateDone) restore()
  })

  window.__j2meRms = {
    snapshot: snapshot,
    apply: applySnapshot,
    dirty: function () { return dirty },
    paths: rmsPaths,
    status: function () { return { restore: status.restore, files: status.files, removed: status.removed, bytes: status.bytes, error: status.error } },
  }
}())
