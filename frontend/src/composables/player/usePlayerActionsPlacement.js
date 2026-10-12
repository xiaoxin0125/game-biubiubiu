import { computed } from 'vue'

// 保存 / 读档 / 重置 / 金手指（桌面端还有按键设置）这组按钮放在哪里。
//
//   mobile —— 触屏设备：浮在画面右上角，与「按键透明度」按钮同侧；竖排时和它同列（排在正下方）；
//   side   —— 桌面且窗口够宽：图文按钮排在画面（crt-screen）右侧，一行两个，
//             两列排不开时组件自己收成一行一个（见 GameActionButtons.vue）；
//   top    —— 桌面但窗口 / 页面缩放到放不下侧栏：退回顶部工具条，和以前一致。
//
// 判定同时看「是不是触屏布局」和窗口宽度：手机横屏后 innerWidth 往往超过
// 1000px，不能只按宽度决定摆放方式（参考 touchLayout.js 的短边规则）。
export const ACTIONS_SIDE_MIN_VIEWPORT_WIDTH = 1000
// 侧栏两列的宽度下限：再窄就收成一行一个（与 GameActionButtons.vue 里的 1199px 对应）
export const ACTIONS_SIDE_TWO_COLUMN_MIN_WIDTH = 1200
// 侧栏各档列宽，和组件里 .actions-side 的实际宽度是同一个值（--side-actions-w）：
// 左侧用等宽占位对称，画面才能保持在页面正中。
export const ACTIONS_SIDE_COLUMN_WIDTH = { one: 138, two: 176 }

export function usePlayerActionsPlacement({ isTouchLayout, viewportWidth, viewportHeight, isFullscreen, isForcedLandscape }) {
  const width = computed(() => viewportWidth?.value || 0)

  const variant = computed(() => {
    if (isTouchLayout?.value) return 'mobile'
    return width.value >= ACTIONS_SIDE_MIN_VIEWPORT_WIDTH ? 'side' : 'top'
  })

  const isLandscapeViewport = computed(() => width.value > (viewportHeight?.value || 0))
  // 手机端：全屏（原生或伪全屏）、以及整页被 CSS 转成横版时改成竖排按钮
  const vertical = computed(() => !!(isFullscreen?.value || isForcedLandscape?.value) || isLandscapeViewport.value)

  // 侧栏列宽（含左侧占位）：由页面写进 --side-actions-w，组件按它定自己的宽度
  const sideColumnWidth = computed(() => `${width.value >= ACTIONS_SIDE_TWO_COLUMN_MIN_WIDTH
    ? ACTIONS_SIDE_COLUMN_WIDTH.two
    : ACTIONS_SIDE_COLUMN_WIDTH.one}px`)

  return { variant, vertical, isLandscapeViewport, sideColumnWidth }
}
