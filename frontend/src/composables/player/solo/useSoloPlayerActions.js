import { ref } from 'vue'

export function useSoloPlayerActions({
  router,
  romMeta,
  versionMenuOpen,
  portalRef,
  booted,
  markBooted,
  showToast,
}) {
  const reloading = ref(false)

  function onBooted() {
    booted.value = true
    markBooted()
  }

  function onInputConfigReloaded() {
    booted.value = true
    markBooted()
    showToast('按键设置已保存，输入配置已重新载入')
  }

  function reloadPage() {
    window.location.reload()
  }

  // 重载游戏：把模拟器整个重启（core + ROM 重新装载），等价于拔掉电源再开机。
  async function onReload() {
    const portal = portalRef.value
    if (!portal?.restart || reloading.value) return
    reloading.value = true
    showToast('正在重载游戏…')
    try {
      await portal.restart()
    } catch (err) {
      console.warn('[player] reload failed', err)
      showToast('重载失败')
    } finally {
      reloading.value = false
    }
  }

  function onFullscreen() {
    portalRef.value?.toggleFullscreen()
  }

  function goBack() {
    router.push('/')
  }

  async function switchVersion(v) {
    versionMenuOpen.value = false
    if (!v || v.id === romMeta.value?.id) return
    await portalRef.value?.destroy?.()
    router.push(`/play/${v.id}`)
  }

  return {
    reloading,
    onBooted,
    onInputConfigReloaded,
    onReload,
    reloadPage,
    onFullscreen,
    goBack,
    switchVersion,
  }
}
