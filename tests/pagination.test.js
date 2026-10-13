import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PAGINATION_PROFILES, pageInputError, paginationItemWidth, paginationLayout, paginationPages } from '../frontend/src/composables/pagination.js'

const source = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), 'utf8')

function layoutWidth(layout) {
  const { profile, items, showJump } = layout
  return 2 * profile.control
    + (showJump ? profile.jump + profile.gap : 0)
    + profile.gap * (items.length + 1)
    + items.reduce((sum, item) => sum + paginationItemWidth(item, profile), 0)
}

test('页码只有 5 格：首尾两页 + 当前页及其左右各一页', () => {
  assert.deepEqual(paginationPages(1, 1), [1])
  assert.deepEqual(paginationPages(3, 5), [1, 2, 3, 4, 5])
  assert.deepEqual(paginationPages(10, 20), [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  // 当前页靠在开头 / 结尾时整段窗口平移，第一页和最后一页始终在
  assert.deepEqual(paginationPages(1, 20), [1, 2, 3, 4, 'ellipsis', 20])
  assert.deepEqual(paginationPages(2, 20), [1, 2, 3, 4, 'ellipsis', 20])
  assert.deepEqual(paginationPages(3, 20), [1, 2, 3, 4, 'ellipsis', 20])
  assert.deepEqual(paginationPages(19, 20), [1, 'ellipsis', 17, 18, 19, 20])
  assert.deepEqual(paginationPages(20, 20), [1, 'ellipsis', 17, 18, 19, 20])
})

test('页码之间只要有缺口就用省略号，格数不变', () => {
  assert.deepEqual(paginationPages(4, 7), [1, 'ellipsis', 3, 4, 5, 'ellipsis', 7])
  assert.deepEqual(paginationPages(3, 6), [1, 2, 3, 4, 'ellipsis', 6])
  assert.deepEqual(paginationPages(4, 8), [1, 'ellipsis', 3, 4, 5, 'ellipsis', 8])
  assert.deepEqual(paginationPages(5, 9), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 9])
  assert.deepEqual(paginationPages(4, 20), [1, 'ellipsis', 3, 4, 5, 'ellipsis', 20])
})

test('极窄容器退到 3 格：首尾 + 当前页，中间照样省略', () => {
  assert.deepEqual(paginationPages(10, 20, 3), [1, 'ellipsis', 10, 'ellipsis', 20])
  assert.deepEqual(paginationPages(1, 20, 3), [1, 2, 'ellipsis', 20])
  assert.deepEqual(paginationPages(20, 20, 3), [1, 'ellipsis', 19, 20])
  assert.deepEqual(paginationPages(3, 4, 3), [1, 'ellipsis', 3, 4])
  assert.deepEqual(paginationPages(3, 5, 3), [1, 'ellipsis', 3, 'ellipsis', 5])
})

test('任意页数都保留当前页、连成一段，且不重复、不越界、不超预算', () => {
  for (let count = 1; count <= 150; count += 1) {
    for (let current = 1; current <= count; current += 1) {
      for (const slots of [5, 3]) {
        const items = paginationPages(current, count, slots)
        const numbers = items.filter((item) => typeof item === 'number')
        const context = `current=${current}, count=${count}, slots=${slots}`
        assert.ok(numbers.includes(current), context)
        assert.equal(new Set(numbers).size, numbers.length, context)
        assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), context)
        assert.ok(numbers.every((item) => item >= 1 && item <= count), context)
        assert.ok(numbers.length <= slots || numbers.length === count, context)
        assert.equal(items[0], 1, context)
        assert.equal(items.at(-1), count, context)
        for (let index = 1; index < items.length; index += 1) {
          const previous = items[index - 1]
          const item = items[index]
          assert.notDeepEqual([previous, item], ['ellipsis', 'ellipsis'], context)
          if (typeof previous === 'number' && typeof item === 'number') {
            // 被藏起来的页要么没有，要么就得有一个省略号交代
            assert.equal(item - previous, 1, `缺口必须有省略号：${context}`)
          }
        }
      }
    }
  }
})

test('按宽度选打法：优先 5 个页码，其次换小一号，最后才减页码', () => {
  const wide = paginationLayout(10, 20, 904)
  assert.deepEqual(wide.items, [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  assert.equal(wide.dense, false)
  assert.ok(layoutWidth(wide) <= 904)

  // 375px 手机（内容宽 339）：5 个页码收一档后放得下，不必减页码
  const phone = paginationLayout(10, 20, 339)
  assert.equal(phone.items.length, 7)
  assert.equal(phone.dense, true)
  assert.equal(phone.slots, 5)
  assert.equal(phone.showJump, true)
  assert.ok(layoutWidth(phone) <= 339)
  assert.ok(phone.profile.page >= 30, '页码按钮不能被压到 30px 以下')

  // 320px 手机（内容宽 284）：留不住「跳转」也要先把 5 个页码摆出来
  const narrow = paginationLayout(10, 20, 284)
  assert.deepEqual(narrow.items, [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  assert.equal(narrow.numbers, 5)
  assert.equal(narrow.showJump, false)
  assert.ok(layoutWidth(narrow) <= 284)
  assert.ok(narrow.profile.page >= 30, '页码按钮不能被压到 30px 以下')
})

test('常见视口宽度下分页都排得下，且页码按钮不低于 30px', () => {
  // 手机竖屏到桌面：内容宽 = 视口宽 - 左右 18px 内边距
  for (const width of [284, 320, 324, 339, 354, 378, 414, 568, 600, 700, 904]) {
    for (const count of [1, 2, 5, 6, 7, 8, 20, 100, 9999]) {
      for (const current of [1, 2, Math.ceil(count / 2), count - 1, count]) {
        if (current < 1 || current > count) continue
        const layout = paginationLayout(current, count, width)
        const context = `${width}px / ${current}/${count}`
        assert.ok(layout.items.includes(current), context)
        assert.ok(layout.profile.page >= PAGINATION_PROFILES.tight.page, context)
        assert.ok(layoutWidth(layout) <= width, `${context} 用了 ${layoutWidth(layout)}px`)
      }
    }
  }
  // 放得下 5 个页码时不许偷偷减到 3 个
  assert.equal(paginationLayout(10, 20, 904).slots, 5)
  assert.equal(paginationLayout(10, 20, 339).slots, 5)
  assert.equal(paginationLayout(10, 20, 339).showJump, true)
  // 极端窄屏：宁可收起「跳转」，也要保住 5 个页码
  const narrow = paginationLayout(10, 20, 284)
  assert.equal(narrow.numbers, 5)
  assert.equal(narrow.showJump, false)
  assert.deepEqual(narrow.items, [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
})

test('跳转只接受范围内的完整整数，拒绝小数、截断文本和越界值', () => {
  for (const value of ['1', '20', ' 12 ', '02']) assert.equal(pageInputError(value, 20), '')
  for (const value of ['', ' ', 'abc', '2abc', '1.5', '1e1', 'Infinity', '-1', '9007199254740993']) {
    assert.equal(pageInputError(value, 20), '请输入有效的整数页码', value)
  }
  for (const value of ['0', '21', '100']) assert.equal(pageInputError(value, 20), '请输入 1 到 20 之间的页码', value)
})

test('三处列表统一使用分页组件，上一页/下一页是纯图标按钮', () => {
  for (const path of ['views/Gallery.vue', 'views/MyRoms.vue', 'views/Admin.vue']) {
    const text = source(path)
    assert.match(text, /<ClayPagination\s/, path)
    assert.doesNotMatch(text, /function pageItems\(|\.pagination\s*\{/, path)
  }
  const component = source('components/ClayPagination.vue')
  assert.match(component, /flex-wrap: nowrap/)
  assert.match(component, /new ResizeObserver\(measure\)/)
  assert.match(component, /observer\?\.disconnect\(\)/)
  assert.match(component, /await showPrompt\(/)
  assert.match(component, /inputMode: 'numeric'/)
  assert.match(component, /pageInputError\(value, props.pageCount\)/)
  assert.match(component, /:aria-current=/)
  assert.match(component, /:disabled="current <= 1"/)
  assert.match(component, /:disabled="current >= pageCount"/)
  // 上一页 / 下一页只剩箭头，文字只出现在无障碍标签里
  assert.match(component, /class="page-btn page-icon"/)
  assert.match(component, /aria-label="上一页" title="上一页"/)
  assert.match(component, /aria-label="下一页" title="下一页"/)
  assert.doesNotMatch(component, />上一页</)
  assert.doesNotMatch(component, />下一页</)
})
