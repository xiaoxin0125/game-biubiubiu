const ELLIPSIS = 'ellipsis'

function range(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
}

// 页码之间只要有缺口就用省略号占位，保证显示的页码刚好是约定的格数。
function withEllipses(pages) {
  const items = []
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0 && pages[index] - pages[index - 1] > 1) items.push(ELLIPSIS)
    items.push(pages[index])
  }
  return items
}

/**
 * 固定给出 slots 个页码：第 1 页和最后一页始终显示，其余留给当前页和它左右的页。
 * 当前页靠近首尾时整段窗口平移，保证显示的页码连成一段、不重复、也不越界。
 */
export function paginationPages(current, count, slots = 5) {
  const total = Math.max(1, Math.floor(count))
  const page = Math.min(total, Math.max(1, Math.floor(current)))
  if (total <= slots) return range(1, total)

  const edge = slots - 2
  const half = Math.floor(edge / 2)
  let start = page - half
  let end = start + edge - 1
  if (start < 2) {
    start = 2
    end = start + edge - 1
  }
  if (end > total - 1) {
    end = total - 1
    start = end - edge + 1
  }
  return withEllipses([1, ...range(start, end), total])
}

// 两档尺寸：先按宽松的排，排不下才收一档；再排不下就少显示两个页码或者收起「跳转」，
// 而不是继续压小按钮。手机竖屏（≥360px）放得下 5 个页码。
export const PAGINATION_PROFILES = {
  roomy: { gap: 6, page: 36, more: 16, control: 38, controlFont: 20, jump: 50, font: 13 },
  tight: { gap: 4, page: 32, more: 10, control: 32, controlFont: 18, jump: 40, font: 12 },
}

export function paginationItemWidth(item, profile) {
  if (item === ELLIPSIS) return profile.more
  return Math.max(profile.page, String(item).length * 8 + 14)
}

function layoutWidth(items, profile, showJump) {
  return 2 * profile.control
    + (showJump ? profile.jump + profile.gap : 0)
    + profile.gap * (items.length + 1)
    + items.reduce((total, item) => total + paginationItemWidth(item, profile), 0)
}

// 候选打法：5 个页码 / 3 个页码 × 两档尺寸 × 是否保留「跳转」。
// 选型优先级：先看显示的页码个数，再看能不能留住「跳转」，最后才看按钮大小，
// 也就是绝不为了塞下按钮而压小页码或藏掉该显示的页码。
const LAYOUT_CANDIDATES = [5, 3].flatMap((slots) => [false, true].flatMap((dense) => [true, false].map((jump) => ({ slots, dense, jump }))))

function betterLayout(candidate, current) {
  if (candidate.numbers !== current.numbers) return candidate.numbers > current.numbers
  if (candidate.showJump !== current.showJump) return candidate.showJump
  return !candidate.dense && current.dense
}

export function paginationLayout(current, count, availableWidth) {
  const available = Math.max(0, Number(availableWidth) || 0)
  let best = null
  let narrowest = null
  for (const candidate of LAYOUT_CANDIDATES) {
    const profile = candidate.dense ? PAGINATION_PROFILES.tight : PAGINATION_PROFILES.roomy
    const items = paginationPages(current, count, candidate.slots)
    const layout = {
      items,
      profile,
      dense: candidate.dense,
      slots: candidate.slots,
      showJump: candidate.jump,
      numbers: items.filter((item) => typeof item === 'number').length,
      width: layoutWidth(items, profile, candidate.jump),
    }
    if (!narrowest || layout.width < narrowest.width) narrowest = layout
    if (layout.width > available) continue
    if (!best || betterLayout(layout, best)) best = layout
  }
  return best || narrowest
}

export function pageInputError(value, count) {
  const input = String(value).trim()
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input))) return '请输入有效的整数页码'
  if (Number(input) < 1 || Number(input) > count) return `请输入 1 到 ${count} 之间的页码`
  return ''
}
