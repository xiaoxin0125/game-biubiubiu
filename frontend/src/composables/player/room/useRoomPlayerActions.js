import { ref } from 'vue'

// 房间内的动作：重载游戏、返回列表。
// ROM 版本切换已经从房间顶部移除（房间统一跑进房时选定的版本），这里不再有切换动作；
// 单机那套见 composables/player/solo/useSoloPlayerActions.js。
export function useRoomPlayerActions({
  router,
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

  function goBack() {
    router.push('/rooms')
  }

  return {
    reloading,
    onBooted,
    onInputConfigReloaded,
    onReload,
    reloadPage,
    goBack,
  }
}
