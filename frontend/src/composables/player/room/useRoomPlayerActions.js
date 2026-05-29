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
}) {
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
    onBooted,
    onInputConfigReloaded,
    reloadPage,
    onFullscreen,
    goBack,
    switchVersion,
  }
}