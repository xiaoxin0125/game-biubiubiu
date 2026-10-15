import { computed, ref } from 'vue'
import { api } from '../../api/client.js'

// Java 手机游戏的存档：MIDP 里能持久化的只有 RMS（RecordStore），运行时会把它落成
// 一个同源文件系统里的 /RecordStore 目录树。播放页把整棵树当成这个 ROM 的存档，
// 开局自动读、运行中自动写（时序在 j2meRuntime.js，文件格式在 public/j2me/rms.js）。
//
// 谁有存档：登录用户各算各的（服务端按 用户 + ROM + 槽位 唯一），客人模式与未登录
// 都不接 —— 他们玩的是「这一次」，不写云端。房间也只有房主启动核心，客人传 enabled。
export function useJ2meCloudSave({ romMeta, isAuthed, isGuestMode, showToast, enabled = null }) {
  const active = computed(() => !!romMeta.value
    && romMeta.value.platform === 'j2me'
    && isAuthed.value
    && !isGuestMode.value
    && (enabled ? enabled.value === true : true))

  // 自动存档是静默的：只在第一次成功时提示一次，免得每存一次弹一条。
  const announced = ref(false)
  let lastFailureAt = 0

  function toast(message, duration) {
    try { showToast?.(message, duration) } catch { /* 提示失败不该影响存档本身 */ }
  }

  const cloudSave = computed(() => (active.value ? {
    async load() {
      try {
        const blob = await api.saveLoad(romMeta.value.id, 0)
        if (blob) toast('已自动读取云存档', 2400)
        return blob
      } catch (error) {
        console.warn('[j2me] 云存档读取失败', error)
        toast('云存档读取失败，本次从头开始', 3200)
        return null
      }
    },
    async save(blob, options) {
      try {
        await api.saveUpload(romMeta.value.id, blob, 0, options)
        if (!announced.value) {
          announced.value = true
          toast('已自动存档（云端）', 2400)
        }
      } catch (error) {
        console.warn('[j2me] 云存档上传失败', error)
        // 网络抖动会连着失败好几次：提示限流，别刷屏。
        const now = Date.now()
        if (now - lastFailureAt > 30 * 1000) {
          lastFailureAt = now
          toast('云存档保存失败，稍后会自动重试', 3200)
        }
      }
    },
  } : null))

  return { cloudSave, cloudSaveActive: active }
}
