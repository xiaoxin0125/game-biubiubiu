import { computed, getCurrentScope, onScopeDispose } from 'vue'

// FDS 磁碟机的两个动作：换面（A / B 面）与换盘（弹出 / 插回）。
//
// 为什么是按键而不是命令：RetroArch 有一组 DISK_EJECT_TOGGLE / DISK_NEXT 命令，
// 但它们只对实现了 disk control 接口的 core 生效，而 nestopia 与 fceumm 都没实现
// —— 两个 core 把 FDS 的磁盘操作直接绑在 retropad 的 L / R 上（nestopia：
// L 插盘/换面、R 换盘；fceumm：L 选面、R 弹出与插入）。所以「换面」= 按下 L。
//
// 为什么要按住一会儿：core 靠电平变化（按下那一帧）触发，RetroArch 一帧才采一次
// 输入，按下与松开落在同一帧里会被整段丢掉。这里按住 FDS_DISK_HOLD_MS 再松手，
// 与 Nostalgist 自己的 keyboardPress 默认时长一致。
export const FDS_DISK_HOLD_MS = 120

// 两个动作在 core 里的 retropad 按键。
const DISK_SIDE_BUTTON = 'l'
const DISK_EJECT_BUTTON = 'r'

export function useFdsDiskSwap({ portalRef, enabled }) {
  // 正在按住的键 → 这次按住对应的那台模拟器。连点同一颗键时第二次直接忽略，
  // 不会有两个定时器交叉释放。
  const holds = new Map()

  // 把还按着的键全部松开。松手只发给「按下时的那台模拟器」：中途重载 / 换过实例之后，
  // 旧动作不能再打到新实例上（重载时 portal 组件本身没变，那一条会正常发出松手）。
  function releaseHeld() {
    for (const [button, hold] of holds) {
      clearTimeout(hold.timer)
      try { hold.portal?.releaseButton?.(button, 1) } catch {}
    }
    holds.clear()
  }

  function tap(button) {
    const portal = portalRef?.value
    if (!enabled?.value || !portal?.pressButton) return false
    if (holds.has(button)) return false
    portal.pressButton(button, 1)
    const timer = setTimeout(() => {
      holds.delete(button)
      if (portalRef?.value !== portal) return
      portal.releaseButton?.(button, 1)
    }, FDS_DISK_HOLD_MS)
    holds.set(button, { timer, portal })
    return true
  }

  // 离开页面（组件卸载 / 换 ROM，整页会重建）时把还按着的键补一次松手，
  // 免得「按下不放」的状态落进下一台模拟器。没有活跃作用域（例如单元测试直接调用）时
  // 没有生命周期可挂，跳过。
  if (getCurrentScope()) onScopeDispose(releaseHeld)

  const canUseFdsDisk = computed(() => !!enabled?.value)

  return {
    canUseFdsDisk,
    // 换面：A 面 ↔ B 面（单张磁盘的两个面）
    swapDiskSide: () => tap(DISK_SIDE_BUTTON),
    // 换盘：弹出 / 插回。多盘游戏靠它换到另一张盘，fceumm 也要先弹出才能选面。
    changeDisk: () => tap(DISK_EJECT_BUTTON),
  }
}
