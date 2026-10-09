import { ref } from 'vue'

export function useRoomPlayerActions({
  router,
  roomCode,
  romMeta,
  versionMenuOpen,
  portalRef,
  booted,
  markBooted,
  showToast,
  inviteConnectedRoomPeers,
  resetInvites,
  rtc,
  signalMe,
  signalPeers,
}) {
  const reloading = ref(false)

  function onBooted() {
    booted.value = true
    markBooted()
    inviteConnectedRoomPeers({ booted: booted.value })
  }

  function onInputConfigReloaded() {
    booted.value = true
    markBooted()
    showToast('按键设置已保存，输入配置已重新载入')
  }

  function reloadPage() {
    window.location.reload()
  }

  // 重载游戏（仅房主）：重启模拟器。canvas 会被换成新元素，所以先关掉访客的
  // PeerConnection，重启完成后由 onBooted 用新画面重新发起邀请。
  async function onReload() {
    const portal = portalRef.value
    if (!portal?.restart || reloading.value) return
    reloading.value = true
    showToast('正在重载游戏…')
    try {
      for (const peerId of Object.keys(signalPeers?.value || {})) {
        if (peerId === signalMe?.value?.peerId) continue
        try { rtc?.closePeer?.(peerId) } catch {}
      }
      resetInvites?.()
      await portal.restart()
    } catch (err) {
      console.warn('[room] reload failed', err)
      showToast('重载失败')
    } finally {
      reloading.value = false
    }
  }

  function onFullscreen() {
    portalRef.value?.toggleFullscreen()
  }

  function goBack() {
    router.push('/rooms')
  }

  async function switchVersion(v) {
    versionMenuOpen.value = false
    if (!v || v.id === romMeta.value?.id) return
    await portalRef.value?.destroy?.()
    router.push(`/rooms/${roomCode}/play/${v.id}`)
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
