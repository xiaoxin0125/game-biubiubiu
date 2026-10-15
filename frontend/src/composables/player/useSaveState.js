import { computed } from 'vue'
import { api } from '../../api/client.js'

// Authenticated users save to cloud first; localStorage remains a solo-play fallback.
// Room guests are video clients only and cannot save/load emulator state.
export function useSaveState({ romMeta, platformInfo, portalRef, isAuthed, isGuestMode, showToast }) {
  const localKey = computed(() => romMeta.value ? `state:${platformInfo.value.core}:${romMeta.value.id}` : null)

  async function onSaveState() {
    if (isGuestMode.value) return showToast('客人模式不支持存档')
    if (portalRef.value?.coreSupportsSaveState?.() === false) return showToast('当前运行时不支持即时存档')
    try {
      const data = await portalRef.value?.saveState()
      if (!data) return showToast('存档失败')
      const blob = data instanceof Blob ? data : new Blob([data])
      if (isAuthed.value && romMeta.value) {
        try {
          await api.saveUpload(romMeta.value.id, blob)
          showToast('已存档（云端）')
          return
        } catch (err) {
          console.warn('[saves] cloud upload failed, falling back to local', err)
        }
      }
      if (localKey.value) {
        const buf = new Uint8Array(await blob.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
        localStorage.setItem(localKey.value, btoa(bin))
        showToast('已存档（本地）')
      }
    } catch (err) {
      console.warn('[saves] save failed', err)
      showToast('存档失败')
    }
  }

  async function onLoadState() {
    if (isGuestMode.value) return showToast('客人模式不支持读档')
    if (portalRef.value?.coreSupportsSaveState?.() === false) return showToast('当前运行时不支持即时读档')
    if (!romMeta.value) return
    try {
      if (isAuthed.value) {
        try {
          const blob = await api.saveLoad(romMeta.value.id)
          if (blob) {
            await portalRef.value?.loadState(blob)
            return showToast('已读档（云端）')
          }
        } catch {}
      }
      if (localKey.value) {
        const raw = localStorage.getItem(localKey.value)
        if (!raw) return showToast('无存档')
        const bin = atob(raw)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        await portalRef.value?.loadState(new Blob([bytes]))
        showToast('已读档（本地）')
      } else {
        showToast('无存档')
      }
    } catch (err) {
      console.warn('[saves] load failed', err)
      showToast('读档失败')
    }
  }

  return { onSaveState, onLoadState }
}