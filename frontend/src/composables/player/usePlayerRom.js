import { computed, ref, shallowRef, watch } from 'vue'
import { api } from '../../api/client.js'
import { getBiosUrls, getPlatformInfo } from '../../data/config.js'
import { cachedFetch, readResponseBlob } from '../useBlobCache.js'

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR'
}

// Owns ROM metadata, version family resolution, ROM blobs and BIOS payloads.
// Room guests deliberately do not fetch ROM/BIOS: they receive media from the host.
export function usePlayerRom({ routeRomId, isRoomMode, roomCode, localPeer, reportError, progress = null }) {
  const romMeta = ref(null)
  const parentForChild = ref(null)
  const siblings = ref([])
  const versionMenuOpen = ref(false)
  const rom = shallowRef(null)
  const bios = shallowRef([])
  const biosReady = ref(false)
  const roomInfo = ref(null)
  const localPeerCanLoad = computed(() => !isRoomMode || !!localPeer.value?.isHost)

  const platformInfo = computed(() => getPlatformInfo(romMeta.value?.platform, { core: romMeta.value?.defaultCore }))
  const currentVersionLabel = computed(() => {
    if (!romMeta.value) return ''
    if (!romMeta.value.parentRomId) return '原版'
    return romMeta.value.versionLabel || '变体'
  })
  const loadingSub = computed(() => {
    const p = romMeta.value?.platform
    if (!p) return '正在获取游戏信息…'
    if (p === 'arcade') return '街机核心首次加载较慢（10-30 秒），请耐心等待'
    if (p === 'psx') return '核心较大，首次加载约需 10 秒'
    return '核心与 ROM 下载中…'
  })

  async function resolveRomBlobs() {
    const meta = romMeta.value
    if (!meta) { rom.value = null; return }
    const parent = parentForChild.value
    const session = progress?.sessionId
    const signal = progress?.currentSignal?.() ?? null
    progress?.setStage('resources')
    try {
      const selfBlob = await fetchRomBlob(meta, { session, signal, label: meta.title || meta.fileName })
      const self = { fileName: meta.fileName, fileContent: selfBlob }
      if (parent) {
        // 变体（克隆/改版）还需要父版本的共享数据：它是同一个核心的另一份文件。
        const parentBlob = await fetchRomBlob(parent, {
          session,
          signal,
          label: `${parent.title || parent.fileName}（父版本）`,
        })
        rom.value = [self, { fileName: parent.fileName, fileContent: parentBlob }]
      } else {
        rom.value = self
      }
    } catch (err) {
      if (isAbortError(err)) return
      reportError(`下载 ROM 失败：${err.message}`)
    }
  }

  async function fetchRomBlob(meta, { session, signal, label }) {
    const url = api.romFileUrl(meta.id, meta.fileName)
    const id = `rom:${meta.id}`
    // 体积取数据库里的 file_size：这是唯一可信的"资源本身大小"，用它做进度
    // 分母，不依赖响应头（远端回源、gzip 都会让 Content-Length 失真）。
    const size = Number(meta.fileSize) > 0 ? Number(meta.fileSize) : null
    progress?.ensureTask({ id, label, kind: 'rom', size })
    try {
      const blob = await cachedFetch(url, {
        key: url,
        expectedSize: size,
        signal,
        onProgress: ({ loaded, done, cached }) => {
          progress?.taskProgress(id, loaded, { session, cached })
          if (!done) progress?.setStage('resources')
        },
      })
      progress?.taskSettled(id, 'done', { size: size ?? blob.size, loaded: blob.size })
      return blob
    } catch (err) {
      if (isAbortError(err)) throw err
      progress?.taskFailed(id, err?.message || '下载失败')
      throw err
    }
  }

  async function resolveBios() {
    biosReady.value = false
    const urls = getBiosUrls(romMeta.value?.platform)
    if (!urls.length) { bios.value = []; biosReady.value = true; return }

    const session = progress?.sessionId
    const signal = progress?.currentSignal?.() ?? null

    // BIOS bypasses IndexedDB: stale archive bytes cause hard-to-debug CRC issues.
    // 但不再禁用 HTTP 缓存：后端按 ETag 校验，文件没变时只回 304，开局少传
    // 1.8–2.2 MB；文件换了则立刻拿到新内容。
    const items = await Promise.all(urls.map(async (u) => {
      const id = `bios:${u.fileContent}`
      progress?.ensureTask({ id, label: `BIOS ${u.fileName}`, kind: 'bios' })
      try {
        const res = await fetch(u.fileContent, { signal })
        if (!res.ok) {
          progress?.taskSettled(id, 'skipped')
          return null
        }
        const { blob } = await readResponseBlob(res, {
          onProgress: ({ loaded, total, done }) => {
            // BIOS 没被压缩（zip/bin），响应头里的长度就是文件体积，可以直接当分母。
            if (total) progress?.setTaskSize(id, total)
            progress?.taskProgress(id, loaded, { session })
            if (!done) progress?.setStage('resources')
          },
        })
        progress?.taskSettled(id, 'done', { size: blob.size, loaded: blob.size })
        return { fileName: u.fileName, fileContent: blob }
      } catch {
        // BIOS 沿用原来的容错：读不到就跳过，能不能开起来交给核心判断。
        progress?.taskSettled(id, 'skipped')
        return null
      }
    }))
    bios.value = items.filter(Boolean)
    biosReady.value = true
  }

  async function loadMeta() {
    // 每次进入/切换游戏都开一个新会话：中断上一次未完成的下载，进度从零开始，
    // 迟到的旧回调会被 isCurrent() 丢弃。
    progress?.beginSession({ stage: 'meta' })
    const id = Number(routeRomId())
    try {
      let found = null
      try {
        found = (await api.romGet(id)).rom
      } catch {
        const [{ roms: mine }, { roms: pub }] = await Promise.all([
          api.romsMine().catch(() => ({ roms: [] })),
          api.romsPublic().catch(() => ({ roms: [] })),
        ])
        found = [...mine, ...pub].find((r) => r.id === id)
        if (!found) {
          try {
            const { versions } = await api.romVersions(id)
            found = versions.find((r) => r.id === id)
          } catch {}
        }
      }
      if (isRoomMode) {
        try {
          const room = await api.roomJoin(roomCode, '')
          if (room.roomTicket) api.roomStoreTicket(room.code, room.roomTicket)
          roomInfo.value = room
          if (!found && room.romId === id) {
            found = { id: room.romId, title: room.romTitle, platform: room.romPlatform, fileName: '', isPublic: false }
          }
        } catch {}
      }
      if (!found) {
        reportError('ROM 未找到或无权访问 (id=' + id + ')')
        return
      }
      romMeta.value = found
      try {
        const seedId = found.parentRomId || found.id
        const { versions } = await api.romVersions(seedId)
        siblings.value = versions || []
        parentForChild.value = found.parentRomId ? versions.find((r) => r.id === found.parentRomId) || null : null
      } catch {
        siblings.value = [found]
        parentForChild.value = null
      }
    } catch (err) {
      reportError(err.message)
    }
  }

  function resetForRouteChange() {
    romMeta.value = null
    parentForChild.value = null
    siblings.value = []
    rom.value = null
    bios.value = []
    biosReady.value = false
  }

  watch([() => romMeta.value?.id, () => parentForChild.value?.id, localPeerCanLoad], () => {
    rom.value = null
    if (isRoomMode) {
      if (!localPeer.value) return
      if (!localPeer.value.isHost) return
    }
    resolveRomBlobs()
  })

  watch([() => romMeta.value?.platform, localPeerCanLoad], () => {
    if (isRoomMode && localPeer.value && !localPeer.value.isHost) return
    if (isRoomMode && !localPeer.value) return
    resolveBios()
  })

  return { romMeta, roomInfo, siblings, versionMenuOpen, rom, bios, biosReady, platformInfo, currentVersionLabel, loadingSub, loadMeta, resetForRouteChange }
}