<template>
  <!-- 手柄整块区域自带「长按防线」：@touchstart/@touchmove 从源头取消浏览器的原生
       触摸手势，@selectstart / @dragstart / @copy / @contextmenu 再拦住选中与菜单
       的每一层。原理与取舍见 onPadTouch 的注释。 -->
  <div
    v-if="enabled"
    ref="padEl"
    class="vpad"
    :class="{ 'vpad-landscape': landscape, 'vpad-dimmed': dimmed }"
    @contextmenu.prevent
    @selectstart.prevent
    @dragstart.prevent
    @copy.prevent
    @touchstart="onPadTouch"
    @touchmove="onPadTouch"
  >
    <!-- Left: J2ME 换掉的是这一块 —— 老手机那颗「十字方向键」：四块不规则五边形拼成
         一个无缝的十字架（整体宽高相等），每块就是一个方向，发的是手机的导航键代码
         （MIDP 的 -1 / -2 / -3 / -4）。手机键盘正中的「5 / 确定」在肩键那一行，这里
         不再重复摆一颗中间键。右侧的 1/3/7/9 四角键与肩键行的 ＊＃ / 5 / 0 照旧保留。
         其余平台仍是可滑动的虚拟摇杆，8 个方向靠手指位置分辨。 -->
    <div class="vpad-group vpad-left">
      <svg
        v-if="isJ2meLayout"
        class="j2me-nav"
        viewBox="0 0 300 300"
        @pointerdown.prevent="onBtnPointerDown"
        @pointermove.prevent="onBtnPointerMove"
        @pointerup.prevent="onBtnPointerUp"
        @pointercancel.prevent="onBtnPointerUp"
      >
        <g
          v-for="b in J2ME_NAV_BUTTONS"
          :key="b.key"
          class="nav-btn"
          :class="[`nav-${b.place}`, { pressed: pressed[b.key] }]"
        >
          <path class="nav-key" :data-btn-key="b.key" :d="b.path" />
          <polygon class="nav-arrow" :points="b.arrow" />
        </g>
      </svg>
      <div
        v-else
        ref="dpadEl"
        class="stick"
        :class="{ active: stickActive }"
        @pointerdown.prevent="onDpadDown"
        @pointermove.prevent="onDpadMove"
        @pointerup.prevent="onDpadEnd"
        @pointercancel.prevent="onDpadEnd"
      >
        <span class="stick-arrow stick-up"    :class="{ on: pressed.up }">▲</span>
        <span class="stick-arrow stick-right" :class="{ on: pressed.right }">▶</span>
        <span class="stick-arrow stick-down"  :class="{ on: pressed.down }">▼</span>
        <span class="stick-arrow stick-left"  :class="{ on: pressed.left }">◀</span>
        <span
          class="stick-knob"
          :style="{ transform: `translate(${stickKnob.x}px, ${stickKnob.y}px)` }"
        ></span>
      </div>
    </div>

    <!-- Center: Start / Select — container-level pointer tracking so a finger
         can slide between SELECT/START without re-tapping (MOBA-style). -->
    <div
      class="vpad-group vpad-center"
      @pointerdown.prevent="onBtnPointerDown"
      @pointermove.prevent="onBtnPointerMove"
      @pointerup.prevent="onBtnPointerUp"
      @pointercancel.prevent="onBtnPointerUp"
    >
      <button
        v-if="has('select')"
        class="sys-btn"
        :class="{ pressed: pressed.select }"
        data-btn-key="select"
      >{{ labelOf('select', 'SELECT') }}</button>
      <button
        v-if="has('start')"
        class="sys-btn sys-btn-start"
        :class="{ pressed: pressed.start }"
        data-btn-key="start"
      >{{ labelOf('start', 'START') }}</button>
      <!-- 连发开关：持久化的 turbo toggle。开启后 A/B/X/Y/L/R 按住即 16Hz 自动射击 -->
      <button
        class="sys-btn turbo-toggle"
        :class="{ on: turboEnabled }"
        @pointerdown.stop.prevent="turboEnabled = !turboEnabled"
        :title="turboEnabled ? '连发已开启，再点关闭' : '点击开启连发'"
      >连发</button>
    </div>

    <!-- Right: Face buttons (layout adapts per platform — see FACE_LAYOUTS) -->
    <div class="vpad-group vpad-right">
      <!-- Face + shoulders share the same pointer-tracking surface so you can
           slide between L/R and face buttons — like HoK 技能键 -->
      <div
        class="face-wrap"
        @pointerdown.prevent="onBtnPointerDown"
        @pointermove.prevent="onBtnPointerMove"
        @pointerup.prevent="onBtnPointerUp"
        @pointercancel.prevent="onBtnPointerUp"
      >
        <div class="face" :class="`face-${layoutType}`">
          <button
            v-for="f in faceBtns"
            :key="f.key"
            class="face-btn"
            :class="[f.className, { pressed: pressed[f.key], turbo: turboEnabled }]"
            :style="{ '--fc': f.color }"
            :data-btn-key="f.key"
          >{{ f.label }}</button>
        </div>
        <div v-if="shoulderBtns.length" class="shoulders" :class="{ stacked: shoulderBtns.length > 2 }">
          <button
            v-for="s in shoulderBtns"
            :key="s.key"
            class="sh-btn"
            :class="{ pressed: pressed[s.key], turbo: turboEnabled }"
            :data-btn-key="s.key"
          >{{ s.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import { getPlatform, resolvePlatformId } from '../../constants/platforms.js'
import { isTouchDeviceLayout } from '../../composables/touchLayout.js'
import { useInputMapping, TURBO_BUTTON_TARGETS, TURBO_FIRE_MS } from '../../composables/useInputMapping.js'
import { dispatchKeyboardEvent } from '../../composables/dispatchKeyboardEvent.js'

const props = defineProps({
  platform: { type: String, default: null },
  // 整页被 CSS 顺时针旋转 90°（强制横屏）时，指针位移要换算回页面本地坐标，
  // 摇杆才会跟着手指走、方向才对得上用户视角。
  landscapeRotate: { type: Boolean, default: false },
  // Optional callback: guest mode forwards the button over the DataChannel
  // instead of dispatching a local key. Return true to swallow the default.
  buttonInterceptor: { type: Function, default: null },
  onButton: { type: Function, default: null },
  pressButton: { type: Function, default: null },
  releaseButton: { type: Function, default: null },
  // 手机端可以暂时把整块虚拟手柄压到 20% 透明度，让出画面。
  dimmed: { type: Boolean, default: false },
})

const { mapping } = useInputMapping()
const pressed = reactive({})
const buttonCounts = reactive({})
const dpadEl = ref(null)
const stickActive = ref(false)
const stickKnob = reactive({ x: 0, y: 0 })
let dpadPointerId = null

// Show on touch devices in both orientations. The old check compared
// `innerWidth < 900`, which hid the pad as soon as a phone rotated to
// landscape (many Android phones report 900+ px there). See touchLayout.js.
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0)
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
function onResize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}
onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onResize)
})

const landscape = computed(() => viewportWidth.value > viewportHeight.value)
const enabled = computed(() => isTouchDeviceLayout(viewportWidth.value, viewportHeight.value))

const platButtons = computed(() => {
  if (!props.platform) return null
  return new Set(getPlatform(props.platform).buttons || [])
})
function has(key) {
  if (!platButtons.value) return true
  return platButtons.value.has(key)
}
// Platform-specific face-button label (Arcade=A/B/C/D, Genesis=A/B/C/X/Y/Z,
// PSX=symbols, etc). Falls back to the generic label when no override exists.
const platLabels = computed(() => {
  if (!props.platform) return {}
  return getPlatform(props.platform).buttonLabels || {}
})
function labelOf(key, fallback) {
  return platLabels.value[key] || fallback
}

// Face-button layout presets. Each layout lists retropad keys in render order
// with its color. Physical positioning is CSS-driven via `.face-<layout>`.
// The Chinese-market platforms are: arcade / nes+fds / sfc / gb / gbc / gba /
// megadrive+sega32x / sms / gamegear / psx / pcengine+pcecd / neogeocd / ngp /
// 3do / j2me. 区域别名（famicom / snes / genesis）先收敛到通用名再挑布局 ——
// 老记录里的别名照样摆出机器本来的手柄。
// Colors roughly match the real hardware pads: FC-era A = 黄/橙, B = 红
// (classic 小霸王 2-button look); SNES Japan version has multi-colored
// buttons; PlayStation uses its iconic symbol colors.
const FACE_LAYOUTS = {
  // Famicom / NES / GB / GBC — 2 buttons: A 橙色, B 红色, 跟 小霸王 对齐
  fc:     { keys: ['a', 'b'],             colors: { a: '#F0A05F', b: '#C4526F' } },
  // GBA — 2-button diagonal, orange/red with L/R shoulders
  gba:    { keys: ['a', 'b'],             colors: { a: '#F0A05F', b: '#C4526F' } },
  // SNES (Japan) — 4-color diamond: Y绿 X蓝 A红 B黄
  snes:   { keys: ['x', 'y', 'a', 'b'],   colors: { x: '#82AEF5', y: '#5FC48F', a: '#C4526F', b: '#EFC55B' } },
  // PlayStation — △绿 □粉 ✕蓝 ◯红
  ps:     { keys: ['y', 'x', 'a', 'b'],   colors: { y: '#5FC48F', x: '#FF2D92', a: '#C4526F', b: '#82AEF5' } },
  // Mega Drive / Genesis 6-button pad — matches the real controller: X Y Z on
  // the top row, A B C on the bottom row (2×3). Core mapping (genesis_plus_gx
  // and picodrive agree, per their retro_input_descriptor tables):
  //   retropad y→A, b→B, a→C, l→X, x→Y, r→Z.
  // Listed in on-screen reading order (top-left → bottom-right).
  md:     { keys: ['l', 'x', 'r', 'y', 'b', 'a'],
            colors: { l: '#EFC55B', x: '#F0A05F', r: '#AF52DE',
                      y: '#C4526F', b: '#5FC48F', a: '#82AEF5' } },
  // Master System / Game Gear — 2 buttons: 1 蓝 2 红
  sms:    { keys: ['b', 'a'],             colors: { b: '#82AEF5', a: '#C4526F' } },
  // Arcade face buttons use A/B/C/D; retropad L/R are exposed below as E/F
  // for 6-button cabinets. Neo Geo CD 用的是同一套四键排列（A B 上排、C D 下排）。
  arcade: { keys: ['b', 'a', 'y', 'x'],   colors: { b: '#C4526F', a: '#EFC55B', y: '#5FC48F', x: '#82AEF5' } },
  // PC Engine 六键手柄（Avenue Pad 6）：上排 III IV V，下排 I II VI。
  // 主机自带的两颗 I / II 在下排左侧，III–VI 只有插上六键手柄才有（核心默认两键，
  // 玩家按肩键上的「模式」切换）。
  pce:    { keys: ['y', 'x', 'l', 'a', 'b', 'r'],
            colors: { y: '#C4526F', x: '#F0A05F', l: '#82AEF5',
                      a: '#5FC48F', b: '#EFC55B', r: '#AF52DE' } },
  // 3DO：一只手柄上就 A / B / C 三颗，横排从左到右。retropad y→A, b→B, a→C。
  '3do':  { keys: ['y', 'b', 'a'],        colors: { y: '#C4526F', b: '#EFC55B', a: '#5FC48F' } },
  // J2ME：手机键盘的四个角 —— 1（左上）、3（右上）、7（左下）、9（右下）。
  // 中间那颗「5 确定」在肩键那一行（retropad l2）。
  j2me:   { keys: ['x', 'a', 'y', 'b'],
            colors: { x: '#82AEF5', a: '#82AEF5', y: '#C4526F', b: '#C4526F' } },
}

// J2ME 的左侧不是摇杆，而是老手机那颗「十字方向键」。四颗键各是一块不规则五边形
// —— 一个矩形臂 + 朝中心的那块三角（中心方块由四块三角拼成），四颗拼起来正好是一个
// 无缝的十字架，整体宽高相等（viewBox 300×300 = 3 格臂宽）。每颗键发的是 MIDP 的
// 导航键代码（-1 / -2 / -3 / -4，见 j2meRuntime.js 的 J2ME_BUTTON_KEYS）。
// 中间不摆键 —— 手机键盘正中那颗「5 / 确定」就在肩键那一行，摆两颗只会重复。
const J2ME_NAV_BUTTONS = [
  { key: 'up',    place: 'up',    path: 'M100 0H200V100L150 150L100 100Z',  arrow: '150,40 170,70 130,70' },
  { key: 'right', place: 'right', path: 'M300 100V200H200L150 150L200 100Z', arrow: '260,150 230,170 230,130' },
  { key: 'down',  place: 'down',  path: 'M200 300H100V200L150 150L200 200Z', arrow: '150,260 130,230 170,230' },
  { key: 'left',  place: 'left',  path: 'M0 200V100H100L150 150L100 200Z',  arrow: '40,150 70,130 70,170' },
]

function pickLayout(platform) {
  const id = resolvePlatformId(platform)
  if (id === 'arcade' || id === 'neogeocd') return 'arcade'
  if (id === 'psx') return 'ps'
  if (id === 'sfc') return 'snes'
  if (id === 'megadrive' || id === 'sega32x') return 'md'
  if (id === 'sms' || id === 'gamegear') return 'sms'
  if (id === 'gba') return 'gba'
  if (id === 'pcengine' || id === 'pcecd') return 'pce'
  if (id === '3do') return '3do'
  if (id === 'j2me') return 'j2me'
  return 'fc'  // nes, fds, gb, gbc, ngp, and everything else
}

const layoutType = computed(() => pickLayout(props.platform))

// J2ME 的左手边换成导航键（上下左右 + 中间 OK），右手边与肩键照旧。
const isJ2meLayout = computed(() => resolvePlatformId(props.platform) === 'j2me')

// Shoulder row is also used by arcade to expose retropad L/R as E/F;
// several 6-button cabinets need those inputs on mobile. PC Engine 的 V / VI 与
// 「模式」、3DO 的 L / R、J2ME 的「5 确定」也都挂在这一行。
const showShoulders = computed(() => {
  const t = layoutType.value
  return t === 'snes' || t === 'ps' || t === 'gba' || t === 'arcade'
    || t === 'pce' || t === '3do' || t === 'j2me'
})

const shoulderBtns = computed(() => {
  if (!showShoulders.value) return []
  const keys = ['l', 'r', 'l2', 'r2']
  return keys
    .filter((k) => has(k))
    .map((k) => ({ key: k, label: labelOf(k, k.toUpperCase()) }))
})

const faceBtns = computed(() => {
  const spec = FACE_LAYOUTS[layoutType.value] || FACE_LAYOUTS.fc
  return spec.keys
    .filter((k) => has(k))
    .map((k) => ({
      key: k,
      label: labelOf(k, k.toUpperCase()),
      color: spec.colors[k] || '#F0A05F',
      className: `fbtn-${k}`,
    }))
})

function resolveKey(btn) {
  return mapping.value.keyboard[btn] || null
}

function dispatch(type, key) {
  dispatchKeyboardEvent(type, key)
}

function getButtonCount(btn) {
  return buttonCounts[btn] || 0
}

function setButtonCount(btn, next) {
  if (next > 0) buttonCounts[btn] = next
  else delete buttonCounts[btn]
  pressed[btn] = next > 0
}

function resetButton(btn) {
  const count = getButtonCount(btn)
  if (count <= 0) return
  if (count === 1) {
    setButtonCount(btn, 0)
    const l = turboLoops.get(btn)
    if (l) { clearInterval(l); turboLoops.delete(btn) }
    emitUp(btn)
    return
  }
  setButtonCount(btn, count - 1)
}

function resetAllButtons() {
  for (const btn of Object.keys(buttonCounts)) {
    while (getButtonCount(btn) > 0) resetButton(btn)
  }
  pointerMap.clear()
  dpadPointerId = null
  stickActive.value = false
  stickKnob.x = 0
  stickKnob.y = 0
}

watch(() => mapping.value.keyboard, () => resetAllButtons(), { deep: true })

// ── Turbo / 连发（显式开关） ────────────────────────────
// 用户点右下角 "连发" 开关决定 A/B/X/Y/L/R/L2/R2 是否自动连发。
// 默认关闭 → 按住就是保持按住（赛车加速、马里奥跑步 OK）。
// 开启后 → 按住即 ~16Hz 自动 press/release（魂斗罗扫射）。
// D-pad 和 start/select 永远不参与 —— 连发只会把它们搞乱。
// 开关状态持久化到 localStorage，下次进入游戏还在。
const TURBO_ELIGIBLE = new Set(['a', 'b', 'x', 'y', 'l', 'r', 'l2', 'r2'])
const TURBO_STORAGE_KEY = 'vpad:turbo'
const turboEnabled = ref(localStorage.getItem(TURBO_STORAGE_KEY) === '1')
const turboLoops = new Map()      // btn → setInterval id

watch(turboEnabled, (v) => {
  localStorage.setItem(TURBO_STORAGE_KEY, v ? '1' : '0')
})

function emitDown(btn) {
  const interceptor = props.buttonInterceptor || props.onButton
  if (interceptor && interceptor('down', btn)) return
  dispatchMappedButton('keydown', btn)
}
function emitUp(btn) {
  const interceptor = props.buttonInterceptor || props.onButton
  if (interceptor && interceptor('up', btn)) return
  dispatchMappedButton('keyup', btn)
}

function dispatchMappedButton(type, btn) {
  const turboTarget = TURBO_BUTTON_TARGETS[btn]
  const target = turboTarget || btn
  if (props.pressButton && props.releaseButton) {
    if (type === 'keydown') props.pressButton(target)
    else props.releaseButton(target)
    return
  }
  const k = resolveKey(target)
  if (k) dispatch(type, k)
}

function press(btn) {
  const count = getButtonCount(btn)
  setButtonCount(btn, count + 1)
  if (count > 0) return

  // 连发模式 + 可连发键：直接跑 16Hz 循环
  if (turboEnabled.value && TURBO_ELIGIBLE.has(btn)) {
    let on = true
    emitDown(btn)
    const loop = setInterval(() => {
      if (!pressed[btn]) return
      on = !on
      if (on) emitDown(btn)
      else    emitUp(btn)
    }, TURBO_FIRE_MS)
    turboLoops.set(btn, loop)
  } else {
    emitDown(btn)
  }
}

function release(btn) {
  resetButton(btn)
}

// ── 长按防复制（浏览器原生手势） ─────────────────────────
// 按键上的字母（A/B/C/D、SELECT、START、连发）和方向箭头都是文本，手机浏览器
// 自带的长按手势会把它们当成可选内容：先弹「复制 / 搜一搜 / 翻译」菜单，菜单还会
// 顺手吞掉这次触摸 —— 玩家按住不放的键收不到抬起（onGlobalPointerEnd 只是事后
// 兜底），手感会突然断掉。CSS 的 user-select / -webkit-touch-callout 只能挡住
// 守规矩的内核，微信 XWEB 与部分国产浏览器照样弹菜单，所以这里在触摸的源头取消
// 默认行为：浏览器的长按手势根本不会开始，也就没有选中和菜单可弹。
// 手柄的按下 / 滑动 / 抬起全部走 pointer 事件（不依赖浏览器合成的 click），
// 取消 touch 的默认行为不会影响手感。
const padEl = ref(null)

function viewportScale() {
  const scale = window.visualViewport?.scale
  return typeof scale === 'number' && scale > 0 ? scale : 1
}

// 画面已经被放大时放行：这时必须让用户能捏合或拖动把缩放还原（跟
// useTouchZoomGuard 一个规矩 —— 那个守卫也是放大后松手，这里不能抢着拦）。
function onPadTouch(e) {
  if (viewportScale() > 1.01) return
  e.preventDefault()
}

// 兜底：万一某个内核无视上面的取消、自己弹出长按菜单（自带菜单的国产浏览器），
// 只要选中范围落在手柄里就立刻清掉选中 —— 菜单挂在选中上，选中没了菜单就收回去，
// 也不会继续吞这一局的手指。selectionchange 只在 document 上派发。
function onSelectionChange() {
  const selection = document.getSelection?.()
  if (!selection || selection.isCollapsed) return
  const anchor = selection.anchorNode
  if (anchor && padEl.value?.contains(anchor)) selection.removeAllRanges()
}

// ── Safety-net: document-level pointerup/cancel ─────────
// 长按菜单已经由上面的 onPadTouch 拦掉；但触摸仍可能被别的东西取消（WebView 的
// 边缘手势、系统弹窗等），这类取消不一定在元素上派发 pointercancel，按住的
// D-pad 或按键就会卡住。这里在 window 上兜底：谁的手指没了就松开谁。
function onGlobalPointerEnd(e) {
  // D-pad
  if (dpadPointerId === e.pointerId) {
    try { dpadEl.value?.releasePointerCapture?.(e.pointerId) } catch {}
    dpadPointerId = null
    stickActive.value = false
    stickKnob.x = 0
    stickKnob.y = 0
    applyDirs(new Set())
  }
  // Face / shoulder / center buttons
  if (pointerMap.has(e.pointerId)) {
    const entry = pointerMap.get(e.pointerId)
    if (entry?.key) release(entry.key)
    try { entry?.target?.releasePointerCapture?.(e.pointerId) } catch {}
    pointerMap.delete(e.pointerId)
  }
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') resetAllButtons()
}

onMounted(() => {
  window.addEventListener('pointerup', onGlobalPointerEnd)
  window.addEventListener('pointercancel', onGlobalPointerEnd)
  window.addEventListener('blur', resetAllButtons)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('selectionchange', onSelectionChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onGlobalPointerEnd)
  window.removeEventListener('pointercancel', onGlobalPointerEnd)
  window.removeEventListener('blur', resetAllButtons)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('selectionchange', onSelectionChange)
  resetAllButtons()
  // Clear any pending turbo state on teardown
  for (const l of turboLoops.values()) clearInterval(l)
  turboLoops.clear()
})

// ── MOBA-style multi-touch ─────────────────────────────
// Honor of Kings 技能键 pattern: each finger independently tracks, and
// sliding from one button onto another releases the first and engages the
// second without needing to lift. Enables A+B combos, quick switch between
// SELECT/START, and shoulder + face 叠加 press.
//
// How it works:
// 1. pointerdown on the container: setPointerCapture so moves outside still
//    fire here, then resolve which button is under the finger via
//    elementFromPoint + [data-btn-key].
// 2. pointermove: if the finger drifted to a different button, release the
//    old one and press the new one. Same button = no-op.
// 3. pointerup / cancel: release whatever this finger was on.
// 4. pointerMap tracks per-pointer state, so N fingers can each hold a
//    different button simultaneously (combos work).
const pointerMap = new Map()  // pointerId → { key, target }

function keyAtPoint(x, y) {
  const el = document.elementFromPoint(x, y)
  return el?.closest?.('[data-btn-key]')?.dataset?.btnKey || null
}

function onBtnPointerDown(e) {
  const target = e.currentTarget
  try { target?.setPointerCapture?.(e.pointerId) } catch {}
  const key = keyAtPoint(e.clientX, e.clientY)
  pointerMap.set(e.pointerId, { key, target })
  if (key) press(key)
}

function onBtnPointerMove(e) {
  const entry = pointerMap.get(e.pointerId)
  if (!entry) return
  const prev = entry.key
  const next = keyAtPoint(e.clientX, e.clientY)
  if (prev === next) return
  if (prev) release(prev)
  if (next) press(next)
  entry.key = next
}

function onBtnPointerUp(e) {
  const entry = pointerMap.get(e.pointerId)
  if (entry?.key) release(entry.key)
  try { entry?.target?.releasePointerCapture?.(e.pointerId) } catch {}
  pointerMap.delete(e.pointerId)
}

// ── D-pad: single touch surface, 8-way angle split ──
// Finger position relative to the pad center is mapped to one of 8 octants.
// Diagonals activate two directions simultaneously — so sliding the thumb
// around naturally walks the player in the expected direction.
const DPAD_KEYS = ['up', 'down', 'left', 'right']

function processPointer(e) {
  const el = dpadEl.value
  if (!el) return { dirs: new Set(), knobX: 0, knobY: 0 }
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  let dx = e.clientX - cx
  let dy = e.clientY - cy
  // 整页顺时针转了 90°：屏幕 +x 是页面本地 +y，屏幕 +y 是页面本地 -x。
  // 换算后半径、方向、摇杆偏移都在同一套（用户视角的）坐标里算。
  if (props.landscapeRotate) {
    const physX = dx
    dx = dy
    dy = -physX
  }
  const r = Math.min(rect.width, rect.height) / 2
  const dist = Math.hypot(dx, dy)
  // Clamp knob position to the stick radius so it never leaves the base.
  const knobRadius = r * 0.5
  if (dist > knobRadius) {
    const s = knobRadius / dist
    dx *= s
    dy *= s
  }
  // Dead zone: ignore tiny touches near the center so the user can rest
  // their thumb without sending phantom inputs.
  const dirs = new Set()
  if (dist >= r * 0.22) {
    const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
    if (deg >= 337.5 || deg < 22.5)      dirs.add('right')
    else if (deg < 67.5)                 { dirs.add('right'); dirs.add('down') }
    else if (deg < 112.5)                dirs.add('down')
    else if (deg < 157.5)                { dirs.add('left'); dirs.add('down') }
    else if (deg < 202.5)                dirs.add('left')
    else if (deg < 247.5)                { dirs.add('left'); dirs.add('up') }
    else if (deg < 292.5)                dirs.add('up')
    else                                 { dirs.add('right'); dirs.add('up') }
  }
  return { dirs, knobX: dx, knobY: dy }
}

function applyDirs(wanted) {
  for (const k of DPAD_KEYS) {
    if (wanted.has(k) && !pressed[k]) press(k)
    else if (!wanted.has(k) && pressed[k]) release(k)
  }
}

function onDpadDown(e) {
  if (dpadPointerId !== null) return
  dpadPointerId = e.pointerId
  stickActive.value = true
  try { dpadEl.value?.setPointerCapture?.(e.pointerId) } catch {}
  const { dirs, knobX, knobY } = processPointer(e)
  stickKnob.x = knobX
  stickKnob.y = knobY
  applyDirs(dirs)
}
function onDpadMove(e) {
  if (e.pointerId !== dpadPointerId) return
  const { dirs, knobX, knobY } = processPointer(e)
  stickKnob.x = knobX
  stickKnob.y = knobY
  applyDirs(dirs)
}
function onDpadEnd(e) {
  if (e && e.pointerId !== dpadPointerId && dpadPointerId !== null) return
  dpadPointerId = null
  stickActive.value = false
  stickKnob.x = 0
  stickKnob.y = 0
  applyDirs(new Set())
}
</script>

<style scoped>
.vpad {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 30;
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  padding:
    14px
    calc(16px + env(safe-area-inset-right))
    calc(14px + env(safe-area-inset-bottom))
    calc(16px + env(safe-area-inset-left));
  gap: 12px;
  touch-action: none;
  opacity: 1;
  transition: opacity var(--t-fast) var(--clay-ease);
}
.vpad.vpad-dimmed { opacity: 0.2; }

/* 手柄整块区域一律不可选中：按键字母、SELECT / START /「连发」和方向箭头都是文本，
   浏览器自带的长按手势会把它们当成可选内容并弹出「复制 / 搜一搜 / 翻译」。
   这里连同后代一起声明 —— user-select 与 -webkit-touch-callout 都不是继承属性，
   只写在外层挡不住子元素。子元素里只有 touch-action 需要各自声明（不可继承）。
   真机上仍可能被自带长按菜单的内核无视，所以模板上还有一层事件拦截兜底。 */
.vpad,
.vpad * {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
}
.vpad-group { pointer-events: auto; display: flex; align-items: center; justify-content: center; }
.vpad-left  { justify-content: flex-start; }
.vpad-right { justify-content: flex-end; flex-direction: column; gap: 10px; align-items: flex-end; }
.vpad-center { flex-direction: column; gap: 8px; justify-content: flex-end; padding-bottom: 14px; touch-action: none; }

/* MOBA-style pointer surface — face + shoulders share one capture area so
   a finger can slide between any button without needing to lift. */
.face-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  touch-action: none;
}

/* ===== Virtual analog stick ===== */
.stick {
  position: relative;
  width: 150px; height: 150px;
  border-radius: 50%;
  background: var(--clay-inset-surface);
  border: 0;
  box-shadow: var(--clay-in), var(--clay-md);
  touch-action: none;
  cursor: pointer;
  transition: box-shadow var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease);
}
.stick:active { transform: scaleX(1.05) scaleY(0.9); }
.stick.active { background: var(--clay-pink-soft); box-shadow: var(--clay-in-deep), var(--clay-press); }
.stick-knob {
  position: absolute;
  top: 50%; left: 50%;
  width: 66px; height: 66px;
  margin: -33px 0 0 -33px;
  border-radius: 50%;
  background: var(--clay-surface);
  border: 0;
  box-shadow: var(--clay-md);
  pointer-events: none;
  transition: transform 0.08s var(--clay-ease), background var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
}
.stick.active .stick-knob {
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-sm);
  transition: transform 0s, background var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
}
.stick-arrow {
  position: absolute;
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-quaternary);
  font-size: 11px;
  pointer-events: none;
  transition: color var(--t-fast) var(--clay-ease);
}
.stick-arrow.on { color: var(--ink-pink); }
.stick-up    { top: 8px;  left: 50%; transform: translateX(-50%); }
.stick-right { right: 8px; top: 50%; transform: translateY(-50%); }
.stick-down  { bottom: 8px; left: 50%; transform: translateX(-50%); }
.stick-left  { left: 8px; top: 50%; transform: translateY(-50%); }

/* ===== J2ME 十字方向键 =====
   四块不规则五边形（矩形臂 + 朝中心的那块三角）拼成一个无缝的十字架，整体宽高相等。
   形状交给 SVG 的 path，颜色 / 按下状态由下面的 CSS 控制。整块一个投影：看起来是
   一整块粘土捏出来的十字键，四块之间有 SVG 描边画出的细缝。 */
.j2me-nav {
  display: block;
  width: 216px;
  height: 216px;
  touch-action: none;
  filter: drop-shadow(0 4px 6px rgba(94, 58, 84, 0.18));
}
.nav-key {
  fill: var(--clay-surface-flat);
  stroke: rgba(94, 58, 84, 0.12);
  stroke-width: 2;
  transition: fill var(--t-fast) var(--clay-ease);
}
.nav-btn.pressed .nav-key { fill: #FFD0E4; }
.nav-arrow {
  fill: var(--text-quaternary);
  pointer-events: none;
  transition: fill var(--t-fast) var(--clay-ease);
}
.nav-btn.pressed .nav-arrow { fill: #6C2039; }

/* ===== Face buttons ===== */
.face {
  display: grid;
  width: 150px;
  height: 150px;
  gap: 4px;
}
.face-btn {
  --fc: #F0A05F;
  width: 54px; height: 54px;
  border-radius: 50%;
  border: 0;
  background: var(--clay-surface);
  color: color-mix(in srgb, var(--fc) 40%, var(--clay-ink));
  font-weight: 900;
  font-size: 16px;
  font-family: inherit;
  box-shadow: var(--clay-md), 0 0 0 3px color-mix(in srgb, var(--fc) 22%, transparent);
  transition: background var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
  place-self: center;
  padding: 0;
  /* 连点不会被当成双击缩放（其余原生手势见 .vpad 的规则） */
  touch-action: none;
}
.face-btn.pressed {
  background: color-mix(in srgb, var(--fc) 34%, #fff);
  color: color-mix(in srgb, var(--fc) 32%, var(--clay-ink));
  transform: translateY(2px) scaleX(1.05) scaleY(0.9);
  box-shadow: var(--clay-press), 0 0 0 3px color-mix(in srgb, var(--fc) 30%, transparent);
}

/* Turbo / 连发 indicator — pulsing glow ring while auto-firing */
.face-btn.turbo,
.sh-btn.turbo {
  animation: turbo-pulse 0.5s var(--clay-ease) infinite;
}
@keyframes turbo-pulse {
  0%, 100% { transform: scaleX(1) scaleY(1); box-shadow: var(--clay-md), 0 0 0 3px color-mix(in srgb, var(--fc, #F0A05F) 22%, transparent); }
  50%      { transform: scaleX(0.94) scaleY(1.06); box-shadow: var(--clay-sm), 0 0 0 8px color-mix(in srgb, var(--fc, #F0A05F) 26%, transparent); }
}

/* FC / Famicom / GB — 2 large buttons on a clean diagonal, 小霸王 style.
   2x2 grid gives the A/B pair breathing room without them overflowing a
   crowded 3x3 cell. */
.face-fc, .face-gba {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    ".  a"
    "b  .";
  gap: 8px;
}
.face-fc .face-btn, .face-gba .face-btn { width: 60px; height: 60px; font-size: 18px; }
.face-fc .fbtn-a, .face-gba .fbtn-a { grid-area: a; }
.face-fc .fbtn-b, .face-gba .fbtn-b { grid-area: b; }

/* SNES — diamond X-top, Y-left, A-right, B-bottom */
.face-snes {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  grid-template-areas:
    ".  x  ."
    "y  .  a"
    ".  b  .";
}
.face-snes .fbtn-x { grid-area: x; }
.face-snes .fbtn-y { grid-area: y; }
.face-snes .fbtn-a { grid-area: a; }
.face-snes .fbtn-b { grid-area: b; }

/* PlayStation — same diamond positions, Sony symbol colors */
.face-ps {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  grid-template-areas:
    ".  y  ."
    "x  .  a"
    ".  b  .";
}
.face-ps .fbtn-y { grid-area: y; }
.face-ps .fbtn-x { grid-area: x; }
.face-ps .fbtn-a { grid-area: a; }
.face-ps .fbtn-b { grid-area: b; }

/* Neo Geo arcade — 2x2 grid: A B on top, C D on bottom */
.face-arcade {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "arcA arcB"
    "arcC arcD";
  gap: 10px;
}
.face-arcade .fbtn-b { grid-area: arcA; }   /* label "A" */
.face-arcade .fbtn-a { grid-area: arcB; }   /* label "B" */
.face-arcade .fbtn-y { grid-area: arcC; }   /* label "C" */
.face-arcade .fbtn-x { grid-area: arcD; }   /* label "D" */

/* Mega Drive 6-button pad — hardware layout: X Y Z on top, A B C below.
   retropad→label: l='X' x='Y' r='Z' (top) / y='A' b='B' a='C' (bottom). */
.face-md {
  width: 186px;
  height: 124px;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "x y z"
    "a b c";
  gap: 6px;
}
.face-md .face-btn { width: 48px; height: 48px; font-size: 15px; }
.face-md .fbtn-l { grid-area: x; }   /* 'X' */
.face-md .fbtn-x { grid-area: y; }   /* 'Y' */
.face-md .fbtn-r { grid-area: z; }   /* 'Z' */
.face-md .fbtn-y { grid-area: a; }   /* 'A' */
.face-md .fbtn-b { grid-area: b; }   /* 'B' */
.face-md .fbtn-a { grid-area: c; }   /* 'C' */

/* Master System / Game Gear — 2 buttons horizontal: 1 2 */
.face-sms {
  width: 140px;
  height: 70px;
  grid-template-columns: 1fr 1fr;
  grid-template-areas: "smsOne smsTwo";
}
.face-sms .fbtn-b { grid-area: smsOne; }
.face-sms .fbtn-a { grid-area: smsTwo; }

/* PC Engine Avenue Pad 6 — 6 buttons in two rows of three:
   上排 III IV V（retropad y x l），下排 I II VI（retropad a b r）。 */
.face-pce {
  width: 186px;
  height: 124px;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "pce3 pce4 pce5"
    "pce1 pce2 pce6";
  gap: 6px;
}
.face-pce .face-btn { width: 48px; height: 48px; font-size: 15px; }
.face-pce .fbtn-y { grid-area: pce3; }   /* III */
.face-pce .fbtn-x { grid-area: pce4; }   /* IV */
.face-pce .fbtn-l { grid-area: pce5; }   /* V */
.face-pce .fbtn-a { grid-area: pce1; }   /* I */
.face-pce .fbtn-b { grid-area: pce2; }   /* II */
.face-pce .fbtn-r { grid-area: pce6; }   /* VI */

/* 3DO — 手柄上就三颗面键，横排从左到右 A B C（retropad y b a） */
.face-3do {
  width: 180px;
  height: 70px;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-areas: "doC doB doA";
}
.face-3do .fbtn-y { grid-area: doC; }    /* 标签 'A' */
.face-3do .fbtn-b { grid-area: doB; }    /* 标签 'B' */
.face-3do .fbtn-a { grid-area: doA; }    /* 标签 'C' */

/* J2ME — 手机键盘的四个角：1 3 / 7 9（retropad x a / y b）。
   左手边那颗十字方向键（四块五边形拼成的十字架）见 .j2me-nav，手机键盘正中那颗
   5 / 确定在肩键那一行。 */
.face-j2me {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "j1 j3"
    "j7 j9";
  gap: 10px;
}
.face-j2me .face-btn { width: 60px; height: 60px; font-size: 18px; }
.face-j2me .fbtn-x { grid-area: j1; }    /* 标签 '1' */
.face-j2me .fbtn-a { grid-area: j3; }    /* 标签 '3' */
.face-j2me .fbtn-y { grid-area: j7; }    /* 标签 '7' */
.face-j2me .fbtn-b { grid-area: j9; }    /* 标签 '9' */

/* ===== Shoulders ===== */
.shoulders { display: flex; gap: 10px; margin-right: 4px; }
.shoulders.stacked {
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 160px;
}
.sh-btn {
  padding: 9px 20px;
  border-radius: var(--r-sm) var(--r-sm) var(--r-lg) var(--r-lg);
  border: 0;
  background: var(--clay-surface);
  color: var(--text-secondary);
  font-weight: 900;
  font-size: 12px;
  font-family: inherit;
  box-shadow: var(--clay-md);
  transition: background var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
  touch-action: none;
}
.sh-btn.pressed {
  background: var(--clay-pink-soft);
  color: #6C2039;
  transform: translateY(2px) scaleX(1.05) scaleY(0.9);
  box-shadow: var(--clay-press);
}

/* ===== System (Start/Select) ===== */
.sys-btn {
  padding: 8px 18px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--clay-surface);
  color: var(--text-secondary);
  font-weight: 900;
  font-size: 11px;
  letter-spacing: 0.06em;
  font-family: inherit;
  box-shadow: var(--clay-sm);
  transition: background var(--t-fast) var(--clay-ease), transform var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
  touch-action: none;
}
.sys-btn.pressed {
  background: var(--clay-pink-soft);
  color: #6C2039;
  transform: translateY(2px) scaleX(1.05) scaleY(0.9);
  box-shadow: var(--clay-press-sm);
}

/* 连发开关 — 默认灰色，开启时发橙色光示警 */
.turbo-toggle { color: var(--text-secondary); }
.turbo-toggle.on {
  background: var(--clay-cream);
  color: var(--text-cream);
  box-shadow: var(--clay-sm);
}

/* Portrait mobile: compact */
@media (max-width: 480px) {
  .stick, .face { width: 132px; height: 132px; }
  .face-md { width: 168px; height: 112px; }
  .face-sms { width: 128px; height: 64px; }
  .face-pce { width: 168px; height: 112px; }
  .face-3do { width: 162px; height: 64px; }
  .stick-knob { width: 58px; height: 58px; margin: -29px 0 0 -29px; }
  .face-btn { width: 46px; height: 46px; font-size: 14px; }
  .face-fc .face-btn, .face-gba .face-btn { width: 54px; height: 54px; font-size: 16px; }
  .face-j2me .face-btn { width: 54px; height: 54px; font-size: 16px; }
  /* 十字键每一块和旁边的面键一样大（54px），整体 162px = 3 块臂宽 */
  .j2me-nav { width: 162px; height: 162px; }
  .face-md .face-btn { width: 42px; height: 42px; font-size: 13px; }
  .face-pce .face-btn { width: 42px; height: 42px; font-size: 13px; }
}

/* Landscape: push stick / face buttons toward corners */
@media (orientation: landscape) and (max-height: 500px) {
  .vpad {
    padding:
      8px
      calc(12px + env(safe-area-inset-right))
      calc(8px + env(safe-area-inset-bottom))
      calc(12px + env(safe-area-inset-left));
  }
  .vpad-center { padding-bottom: 8px; flex-direction: row; }
  .stick, .face { width: 128px; height: 128px; }
  .face-md { width: 162px; height: 106px; }
  .face-sms { width: 122px; height: 60px; }
  .face-pce { width: 162px; height: 106px; }
  .face-3do { width: 156px; height: 60px; }
  .stick-knob { width: 56px; height: 56px; margin: -28px 0 0 -28px; }
  .face-btn { width: 44px; height: 44px; }
  .face-fc .face-btn, .face-gba .face-btn { width: 52px; height: 52px; font-size: 15px; }
  .face-j2me .face-btn { width: 52px; height: 52px; font-size: 15px; }
  .j2me-nav { width: 168px; height: 168px; }
  .face-md .face-btn { width: 40px; height: 40px; font-size: 13px; }
  .face-pce .face-btn { width: 40px; height: 40px; font-size: 13px; }
}

/* 窄屏手机（320px 那档）：十字键再收一档，免得把中间的软键挤出去 */
@media (max-width: 360px) {
  .j2me-nav { width: 132px; height: 132px; }
}
</style>
