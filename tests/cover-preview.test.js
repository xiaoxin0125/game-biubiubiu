import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// 首页封面看大图：只有真的显示了图片的封面才接管点击（点一下开弹窗，不再顺手开局），
// 弹窗按站点统一的粘土弹窗来，尺寸压在 300px 上下，不做整屏大图。
const project = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const cover = project('frontend/src/components/RomCover.vue')
const dialog = project('frontend/src/components/CoverPreviewDialog.vue')
const gallery = project('frontend/src/views/Gallery.vue')

test('封面组件只在真的显示图片时发 zoom，并拦住冒泡', () => {
  assert.match(cover, /zoomable: \{ type: Boolean, default: false \}/)
  assert.match(cover, /const emit = defineEmits\(\['zoom'\]\)/)
  // 有图（且没加载失败）才接管点击：没图时点封面还是外层卡片的本职动作（开局）
  assert.match(cover, /const canZoom = computed\(\(\) => props\.zoomable && showImage\.value\)/)
  assert.match(cover, /:class="\{ 'has-image': showImage, 'is-zoomable': canZoom \}"/)
  assert.match(cover, /:role="canZoom \? 'button' : undefined"/)
  assert.match(cover, /:tabindex="canZoom \? 0 : undefined"/)
  // 拦住冒泡，否则会同时触发外层卡片的「点击开始游戏」
  assert.match(cover, /function onActivate\(event\) \{\n\s*if \(!canZoom\.value\) return\n[\s\S]{0,120}event\.stopPropagation\(\)\n\s*emit\('zoom'\)/)
  // 键盘 Enter / 空格也能开，并同时拦住与外层同名的按键
  assert.match(cover, /if \(event\.key !== 'Enter' && event\.key !== ' '\) return\n\s*event\.preventDefault\(\)\n\s*event\.stopPropagation\(\)/)
  // 卡片里按方形裁切，大图弹窗改成 contain
  assert.match(cover, /object-fit: var\(--cover-fit, cover\);/)
  assert.match(cover, /\.rom-cover\.is-zoomable \{ cursor: zoom-in; \}/)
})

test('首页卡片接上大图弹窗，点封面不开局', () => {
  assert.match(gallery, /<RomCover :rom="rom" class="rom-card-cover" zoomable @zoom="coverRom = rom" \/>/)
  assert.match(gallery, /import CoverPreviewDialog from '\.\.\/components\/CoverPreviewDialog\.vue'/)
  assert.match(gallery, /const coverRom = ref\(null\)/)
  assert.match(gallery, /<CoverPreviewDialog\s+v-if="coverRom"\s+:rom="coverRom"\s+@close="coverRom = null"\s+\/>/)
})

test('大图弹窗沿用站点弹窗风格，尺寸不大且整张图可见', () => {
  // 站点统一的遮罩 + 粘土面板 + 关闭按钮
  assert.match(dialog, /<Teleport to="body">/)
  assert.match(dialog, /<div class="mask" @click\.self="\$emit\('close'\)">/)
  assert.match(dialog, /\.mask \{[\s\S]*?backdrop-filter: blur\(6px\);[\s\S]*?z-index: 300;/)
  assert.match(dialog, /\.dialog \{[\s\S]*?background: var\(--clay-surface\);[\s\S]*?border-radius: var\(--r-2xl\);[\s\S]*?box-shadow: var\(--clay-lg\);/)
  assert.match(dialog, /aria-label="关闭"/)
  // Esc 关、点遮罩关
  assert.match(dialog, /function onKeydown\(event\) \{\n\s*if \(event\.key === 'Escape'\) emit\('close'\)/)
  assert.match(dialog, /onMounted\(\(\) => window\.addEventListener\('keydown', onKeydown\)\)/)
  assert.match(dialog, /onBeforeUnmount\(\(\) => window\.removeEventListener\('keydown', onKeydown\)\)/)
  // 弹窗按内容收窄，不要整屏
  assert.match(dialog, /\.dialog \{[\s\S]*?width: auto;[\s\S]*?max-width: calc\(100vw - 40px\);[\s\S]*?max-height: 90vh;/)
  // 大图上限 300px，保持原始比例（contain），不裁切
  assert.match(dialog, /--cover-size: min\(66vw, 42vh, 300px\);/)
  assert.match(dialog, /--cover-fit: contain;/)
  assert.match(dialog, /<RomCover :rom="rom" class="preview-cover" \/>/)
})
