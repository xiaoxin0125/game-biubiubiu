import { computed, ref, shallowRef, watch } from 'vue'
import { api } from '../../api/client.js'
import { getBiosUrls, getPlatformInfo } from '../../data/config.js'
import { cachedFetch } from '../useBlobCache.js'

// Owns ROM metadata, version family resolution, ROM blobs and BIOS payloads.
// Room guests deliberately do not fetch ROM/BIOS: they receive media from the host.
export function usePlayerRom({ routeRomId, isRoomMode, roomCode, localPeer, reportError }) {
  const romMeta = ref(null)
  const parentForChild = ref(null)
  const siblings = ref([])
  const versionMenuOpen = ref(false)
  const rom = shallowRef(null)
  const bios = shallowRef([])
  const biosReady = ref(false)
  const roomInfo = ref(null)
  const localPeerCanLoad = computed(() => !isRoomMode || !!localPeer.value?.isHost)

  const platformInfo = computed(() => getPlatformInfo(romMeta.value?.platform))
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
    try {
      const selfBlob = await cachedFetch(api.romFileUrl(meta.id, meta.fileName))
      const self = { fileName: meta.fileName, fileContent: selfBlob }
      if (parent) {
        const parentBlob = await cachedFetch(api.romFileUrl(parent.id, parent.fileName))
        rom.value = [self, { fileName: parent.fileName, fileContent: parentBlob }]
      } else {
        rom.value = self
      }
    } catch (err) {
      reportError(`下载 ROM 失败：${err.message}`)
    }
  }

  async function resolveBios() {
    biosReady.value = false
    const urls = getBiosUrls(romMeta.value?.platform)
    if (!urls.length) { bios.value = []; biosReady.value = true; return }

    // BIOS bypasses IndexedDB: stale archive bytes cause hard-to-debug CRC issues.
    const items = await Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(u.fileContent, { cache: 'no-store' })
        if (!res.ok) return null
        return { fileName: u.fileName, fileContent: await res.blob() }
      } catch {
        return null
      }
    }))
    bios.value = items.filter(Boolean)
    biosReady.value = true
  }

  async function loadMeta() {
    const id = Number(routeRomId())
    try {
      const [{ roms: mine }, { roms: pub }] = await Promise.all([
        api.romsMine().catch(() => ({ roms: [] })),
        api.romsPublic().catch(() => ({ roms: [] })),
      ])
      let found = [...mine, ...pub].find((r) => r.id === id)
      if (!found) {
        try {
          const { versions } = await api.romVersions(id)
          found = versions.find((r) => r.id === id)
        } catch {}
      }
      if (isRoomMode) {
        const pw = sessionStorage.getItem(`room:${roomCode}:pw`) || ''
        try {
          const room = await api.roomJoin(roomCode, pw)
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