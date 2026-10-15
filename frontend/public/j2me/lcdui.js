/* MIDP 高级界面画到 canvas 上：Form / List / TextBox / Alert / Gauge / TextField /
 * ImageItem / StringItem / Spacer，外加底部的命令软键条。
 *
 * 为什么不用运行时自带的那套 DOM：那些元素挂在运行时自己的页面里，而播放页只把
 * `#canvas` 镜像出去，所以玩家永远看不到；更糟的是以高级界面开局的游戏连启动判定
 * 都过不了（播放页等不到画面）。画进 canvas 之后，镜像、截图、缩放、全屏都自动生效。
 *
 * Java 侧仍然负责一切状态：布局（它调 setSize0 / setLocation0 告诉我们每个条目的
 * 位置，位置又取决于它问我们的尺寸）、按键（它处理导航，再用 setSelectedIndex0 告诉我
 * 们高亮项）、文本缓冲区、命令的派发。这个文件只负责「把 Java 说的东西画出来」，
 * 并在必要时回答尺寸查询、把按下的软键转成一次 sendCommandEvent。
 *
 * 接入方式：本文件在 `bld/main-all.js` 之后加载，直接覆盖 `Native[...]`。运行时给
 * 这些方法注册的本来就是空壳（其中 ChoiceGroupLFImpl 那份在真实 List 上会读错对象
 * 字段把事件线程搞挂），覆盖同一张表即可。
 */
(function () {
  'use strict'

  // ---- 常量（MIDP 侧的值）----
  var LAYOUT_DEFAULT = 0, LAYOUT_LEFT = 1, LAYOUT_RIGHT = 2, LAYOUT_CENTER = 3
  var CHOICE_EXCLUSIVE = 1, CHOICE_MULTIPLE = 2, CHOICE_IMPLICIT = 3
  var APPEARANCE_PLAIN = 0
  var PADDING = 4
  var COLORS = {
    background: '#ffffff',
    foreground: '#000000',
    titleBar: '#dfe3e6',
    titleText: '#111111',
    highlightBackground: '#2f6fd0',
    highlightText: '#ffffff',
    box: '#9aa3ab',
    muted: '#5b646c',
  }

  // ---- 状态 ----
  var screens = {}        // nativeId -> 屏幕
  var items = {}          // nativeId -> 条目
  var nextId = 1
  var activeScreen = 0    // 当前显示的高级屏幕；0 = MIDlet 在用 Canvas
  var canvasIsCurrent = true
  var redrawTimer = null

  // ---- 读 Java 侧的值 ----
  function str(addr) {
    if (!addr) return ''
    try { return J2ME.fromStringAddr(addr) } catch (error) { return '' }
  }

  /** 按名字读一个对象字段（引用字段读 4 字节地址）。 */
  function readObjectField(handle, className, name, signature) {
    if (!handle || !handle.classInfo) return 0
    try {
      var classInfo = J2ME.CLASSES.loadClass(className)
      var field = classInfo.getFieldByName(J2ME.toUTF8(name), J2ME.toUTF8(signature), false)
      if (!field) return 0
      return i32[handle._address + field.byteOffset >> 2]
    } catch (error) { return 0 }
  }

  function readArrayField(handle, className, name) {
    if (!handle || !handle.classInfo) return null
    try {
      var classInfo = J2ME.CLASSES.loadClass(className)
      var field = classInfo.getFieldByName(J2ME.toUTF8(name), J2ME.toUTF8('[C'), false)
      if (!field) return null
      var addr = i32[handle._address + field.byteOffset >> 2]
      return addr ? { addr: addr, length: readIntField(handle, className, 'length') } : null
    } catch (error) { return null }
  }

  function readIntField(handle, className, name) {
    if (!handle || !handle.classInfo) return 0
    try {
      var classInfo = J2ME.CLASSES.loadClass(className)
      var field = classInfo.getFieldByName(J2ME.toUTF8(name), J2ME.toUTF8('I'), false)
      if (!field) return 0
      return i32[handle._address + field.byteOffset >> 2]
    } catch (error) { return 0 }
  }

  function readBooleanField(handle, className, name) {
    if (!handle || !handle.classInfo) return false
    try {
      var classInfo = J2ME.CLASSES.loadClass(className)
      var field = classInfo.getFieldByName(J2ME.toUTF8(name), J2ME.toUTF8('Z'), false)
      if (!field) return false
      return i8[handle._address + field.byteOffset] !== 0
    } catch (error) { return false }
  }

  /** DynamicCharacterArray 里的文字。 */
  function bufferText(bufferAddr) {
    var handle = bufferAddr ? getHandle(bufferAddr) : null
    if (!handle) return ''
    var chars = readArrayField(handle, 'com/sun/midp/lcdui/DynamicCharacterArray', 'buffer')
    if (!chars) return ''
    var length = readIntField(handle, 'com/sun/midp/lcdui/DynamicCharacterArray', 'length')
    if (length <= 0) return ''
    try {
      var array = J2ME.getArrayFromAddr(chars.addr)
      var out = ''
      for (var i = 0; i < length && i < array.length; i++) out += String.fromCharCode(array[i])
      return out
    } catch (error) { return '' }
  }

  /** 把一个 Java char[] / String 写回 DynamicCharacterArray（文本编辑用）。 */
  function setBufferText(bufferAddr, text) {
    var handle = bufferAddr ? getHandle(bufferAddr) : null
    if (!handle) return
    try {
      var methodInfo = J2ME.CLASSES.getClass('com/sun/midp/lcdui/DynamicCharacterArray')
        .getMethodByNameString('set', '([CII)V')
      var method = J2ME.getLinkedMethod(methodInfo)
      var charArray = J2ME.newCharArray(text.length)
      J2ME.setUncollectable(charArray)
      var array = J2ME.getArrayFromAddr(charArray)
      for (var i = 0; i < text.length; i++) array[i] = text.charCodeAt(i)
      J2ME.unsetUncollectable(charArray)
      method(handle._address, charArray, 0, text.length)
    } catch (error) { /* 写不进去也不该拖垮这一帧 */ }
  }

  // ---- 字体 ----
  // 运行时的约定：一个 Font 对象在 NativeMap 里对应一个已经设好 font 的 2D context，
  // context 上还挂着 height / baseline / fontSize 三个度量值，画字直接用它。
  var fontBySpec = {}      // "face|style|size" → context（setFont0 只给规格，建好缓存复用）
  var defaultFont = null
  var fallbackFont = null

  /** 最后兜底：连 Java 字体都建不出来时，至少让这一帧还能画。 */
  function fallbackFontContext() {
    if (fallbackFont) return fallbackFont
    try {
      var context = document.createElement('canvas').getContext('2d')
      context.fontSize = 16
      context.height = 16
      context.baseline = 13
      context.font = '16px Arial,Helvetica,sans-serif'
      fallbackFont = context
    } catch (error) { fallbackFont = null }
    return fallbackFont
  }

  /** 按 face / style / size 建字体（ItemLFImpl.setFont0 传的就是这三个值）。 */
  function fontForSpec(face, style, size) {
    var key = (face | 0) + '|' + (style | 0) + '|' + (size | 0)
    if (Object.prototype.hasOwnProperty.call(fontBySpec, key)) return fontBySpec[key]
    var context = null
    try {
      var classInfo = J2ME.CLASSES.loadClass('javax/microedition/lcdui/Font')
      var addr = J2ME.allocUncollectableObject(classInfo)
      var methodInfo = classInfo.getMethodByNameString('<init>', '(III)V', false)
      J2ME.preemptionLockLevel++
      J2ME.getLinkedMethod(methodInfo)(addr, face | 0, style | 0, size | 0)
      J2ME.preemptionLockLevel--
      context = applyMetrics(NativeMap.get(addr) || null, getHandle(addr))
    } catch (error) { context = null }
    if (!context || !context.font) context = fallbackFontContext()
    fontBySpec[key] = context
    return context
  }

  // 运行时的字体度量（height / baseline）设在 Font 对象上，canvas context 上只有
  // font / fontSize 两个。画字要按 baseline 定基线，所以把度量搬一份到 context 上。
  function applyMetrics(context, handle) {
    if (!context || !handle) return context
    if (context.height == null) context.height = handle.height
    if (context.baseline == null) context.baseline = handle.baseline
    return context
  }

  function defaultFontContext() {
    if (!defaultFont) defaultFont = fontForSpec(0, 0, 0)
    return defaultFont
  }

  /** 字体地址 → 字体 context（运行时就是这么存的）。 */
  function fontContext(fontAddr) {
    if (fontAddr) {
      var context = NativeMap.get(fontAddr)
      if (context && context.font) return applyMetrics(context, getHandle(fontAddr))
    }
    return defaultFontContext()
  }

  /** 一个条目的字体：优先用它自己的（地址或 face/style/size 规格），否则用默认字体。 */
  function itemFont(item) {
    if (!item) return defaultFontContext()
    if (item.font) return fontContext(item.font)
    if (item.fontSpec) return fontForSpec(item.fontSpec.face, item.fontSpec.style, item.fontSpec.size)
    return defaultFontContext()
  }

  function fontHeight(font) { return (font && font.height) || 16 }
  function fontAscent(font) { return (font && font.baseline) || Math.round(fontHeight(font) * 0.8) }
  function textWidth(font, text) {
    if (!font || !text) return 0
    return font.measureText(text).width | 0
  }
  function applyFont(context, font) {
    var height = fontHeight(font)
    context.font = (font && font.font) || (height + 'px Arial,Helvetica,sans-serif')
  }

  /** 按宽度折行；返回行数组。 */
  function wrap(font, text, width) {
    if (!text) return []
    var lines = []
    var current = ''
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i)
      if (ch === '\n') { lines.push(current); current = ''; continue }
      var next = current + ch
      if (current && textWidth(font, next) > width) { lines.push(current); current = ch }
      else current = next
    }
    lines.push(current)
    return lines
  }

  /** 超宽就截断加省略号（标题栏和软键标签用）。 */
  function clipText(font, text, width) {
    if (!text || width <= 0 || textWidth(font, text) <= width) return text
    var out = text
    while (out.length > 1 && textWidth(font, out + '…') > width) out = out.slice(0, -1)
    return out + '…'
  }

  // ---- 画布 ----
  function context() {
    var device = MIDP && MIDP.deviceContext
    return device && device.canvas ? device : null
  }

  function screenSize() {
    var device = context()
    return device ? { width: device.canvas.width, height: device.canvas.height } : { width: 240, height: 320 }
  }

  function titleHeight(screen) {
    if (!screen.title) return 0
    return fontHeight(fontContext(0)) + PADDING * 2
  }

  // ---- 绘制 ----
  function drawItems(device, screen) {
    var size = screenSize()
    var top = titleHeight(screen)
    var bottom = size.height - softKeyBarHeight(screen)
    var available = Math.max(1, bottom - top)
    var viewport = Math.min(screen.viewportHeight || available, available)
    device.save()
    device.beginPath()
    device.rect(0, top, size.width, viewport)
    device.clip()
    device.translate(0, top - (screen.scroll | 0))
    for (var i = 0; i < screen.itemIds.length; i++) {
      drawItem(device, items[screen.itemIds[i]], screen)
    }
    device.restore()
  }

  function drawItem(device, item, screen) {
    if (!item || item.hidden) return
    var x = item.x | 0, y = item.y | 0, width = item.width | 0, height = item.height | 0
    switch (item.kind) {
      case 'string': return drawStringItem(device, item, x, y, width, height)
      case 'choice': return drawChoiceGroup(device, item, x, y, width, height)
      case 'gauge': return drawGauge(device, item, x, y, width, height)
      case 'text': return drawTextField(device, item, x, y, width, height)
      case 'image': return drawImageItem(device, item, x, y, width, height)
      default: return undefined  // spacer 与还没实现的条目留白
    }
  }

  function drawLabel(device, item, x, y) {
    if (!item.label) return 0
    var font = itemFont(item)
    applyFont(device, font)
    device.fillStyle = COLORS.muted
    device.fillText(item.label, x, y + fontAscent(font))
    return fontHeight(font)
  }

  function drawStringItem(device, item, x, y, width, height) {
    var font = itemFont(item)
    applyFont(device, font)
    device.fillStyle = COLORS.foreground
    var lines = wrap(font, item.text, width)
    var lineHeight = fontHeight(font)
    var baseline = y + fontAscent(font)
    for (var i = 0; i < lines.length && baseline <= y + height + lineHeight; i++) {
      device.fillText(lines[i], x, baseline)
      baseline += lineHeight
    }
  }

  function drawChoiceGroup(device, item, x, y, width, height) {
    var font = itemFont(item)
    var lineHeight = fontHeight(font)
    var cursor = y
    cursor += drawLabel(device, item, x, cursor)
    var markerWidth = lineHeight
    var textX = item.layout === -1 ? x + PADDING : x + markerWidth + PADDING
    for (var i = 0; i < item.elements.length; i++) {
      var element = item.elements[i]
      var selected = item.choiceType === CHOICE_IMPLICIT ? i === item.selectedIndex : !!element.selected
      var rowHeight = lineHeight + PADDING
      if (selected && item.choiceType === CHOICE_IMPLICIT) {
        device.fillStyle = COLORS.highlightBackground
        device.fillRect(x, cursor - PADDING / 2, width, rowHeight)
      }
      var textY = cursor + fontAscent(font)
      if (item.choiceType !== CHOICE_IMPLICIT) {
        // 单选画圆、多选画方，选中的中间填实
        var boxX = x + PADDING
        var boxY = cursor + (lineHeight - markerWidth) / 2 + 1
        device.strokeStyle = selected ? COLORS.highlightBackground : COLORS.box
        device.fillStyle = selected ? COLORS.highlightBackground : COLORS.background
        device.lineWidth = 1
        if (item.choiceType === CHOICE_EXCLUSIVE) {
          device.beginPath()
          device.arc(boxX + markerWidth / 2, boxY + markerWidth / 2, markerWidth / 2 - 1, 0, Math.PI * 2)
          if (selected) device.fill(); else device.stroke()
        } else {
          device.fillRect(boxX, boxY, markerWidth - 2, markerWidth - 2)
          device.strokeRect(boxX + 0.5, boxY + 0.5, markerWidth - 3, markerWidth - 3)
        }
      }
      var textColour = selected && item.choiceType === CHOICE_IMPLICIT ? COLORS.highlightText : COLORS.foreground
      device.fillStyle = textColour
      applyFont(device, font)
      var lines = wrap(font, element.text, width - (textX - x) - PADDING)
      for (var line = 0; line < lines.length; line++) {
        device.fillText(lines[line], textX, textY + line * lineHeight)
      }
      cursor += Math.max(rowHeight, lines.length * lineHeight + PADDING)
    }
  }

  function drawGauge(device, item, x, y, width, height) {
    var font = itemFont(item)
    var lineHeight = fontHeight(font)
    var cursor = y + drawLabel(device, item, x, cursor = y)
    var barHeight = Math.max(6, Math.round(lineHeight / 2.4))
    var barY = cursor + PADDING
    var barWidth = item.interactive ? Math.round(width * 0.6) : Math.round(width * 0.6)
    var barX = x
    device.fillStyle = COLORS.background
    device.strokeStyle = COLORS.box
    device.lineWidth = 1
    device.strokeRect(barX + 0.5, barY + 0.5, barWidth - 1, barHeight - 1)
    var ratio = item.maxValue > 0 ? Math.max(0, Math.min(1, item.value / item.maxValue)) : 0
    device.fillStyle = COLORS.highlightBackground
    var filled = Math.round((barWidth - 4) * ratio)
    if (filled > 0) device.fillRect(barX + 2, barY + 2, filled, barHeight - 4)
    if (item.interactive) {
      // 可交互的 Gauge 画一个滑标，位置就是当前值
      var knobX = barX + 2 + filled
      device.fillStyle = COLORS.foreground
      device.fillRect(Math.min(knobX, barX + barWidth - 4), barY - 1, 3, barHeight + 2)
    }
  }

  function drawTextField(device, item, x, y, width, height) {
    var font = itemFont(item)
    var lineHeight = fontHeight(font)
    var cursor = y + drawLabel(device, item, x, y)
    var boxHeight = Math.max(lineHeight + PADDING, height - (cursor - y))
    device.fillStyle = COLORS.background
    device.strokeStyle = COLORS.box
    device.lineWidth = 1
    device.strokeRect(x + 0.5, cursor + 0.5, width - 1, boxHeight - 1)
    device.fillStyle = COLORS.foreground
    applyFont(device, font)
    var text = item.text || ''
    var lines = wrap(font, text, width - PADDING * 2)
    for (var line = 0; line < lines.length; line++) {
      device.fillText(lines[line], x + PADDING, cursor + PADDING + fontAscent(font) + line * lineHeight)
    }
    if (item.focused) {
      // 光标：最后一行末尾一小竖
      var last = lines.length ? lines[lines.length - 1] : ''
      var caretX = x + PADDING + textWidth(font, last)
      var caretY = cursor + PADDING + (Math.max(1, lines.length) - 1) * lineHeight
      device.fillRect(caretX, caretY + 2, 1, lineHeight - 2)
    }
  }

  function imageCanvasOf(imageAddr) {
    if (!imageAddr) return null
    try {
      var image = getHandle(imageAddr)
      var imageDataAddr = image && image.imageData ? image.imageData : imageAddr
      var entry = NativeMap.get(imageDataAddr)
      return entry && entry.context ? entry.context.canvas : null
    } catch (error) { return null }
  }

  function drawImageItem(device, item, x, y, width, height) {
    var cursor = y + drawLabel(device, item, x, y)
    var canvas = imageCanvasOf(item.imageAddr)
    if (canvas && canvas.width) {
      var drawWidth = Math.min(canvas.width, width)
      var drawHeight = Math.round(canvas.height * (drawWidth / canvas.width))
      var offsetX = item.layout === LAYOUT_CENTER ? x + Math.round((width - drawWidth) / 2)
        : item.layout === LAYOUT_RIGHT ? x + width - drawWidth : x
      device.drawImage(canvas, offsetX, cursor, drawWidth, drawHeight)
    } else if (item.altText) {
      var font = itemFont(item)
      applyFont(device, font)
      device.fillStyle = COLORS.muted
      device.fillText(item.altText, x, cursor + fontAscent(font))
    }
  }

  function drawAlert(device, screen) {
    var size = screenSize()
    var font = fontContext(0)
    var lineHeight = fontHeight(font)
    var boxWidth = Math.round(size.width * 0.8)
    var lines = wrap(font, screen.text || '', boxWidth - PADDING * 4)
    var titleLines = screen.title ? wrap(font, screen.title, boxWidth - PADDING * 4) : []
    var boxHeight = PADDING * 3 + (titleLines.length + lines.length) * lineHeight
    if (screen.imageAddr) boxHeight += lineHeight * 2
    var boxX = Math.round((size.width - boxWidth) / 2)
    var boxY = Math.round((size.height - boxHeight) / 2)
    device.fillStyle = COLORS.background
    device.fillRect(boxX, boxY, boxWidth, boxHeight)
    device.strokeStyle = COLORS.foreground
    device.lineWidth = 2
    device.strokeRect(boxX + 1, boxY + 1, boxWidth - 2, boxHeight - 2)
    var cursor = boxY + PADDING * 2
    applyFont(device, font)
    device.fillStyle = COLORS.foreground
    device.textAlign = 'center'
    var centre = boxX + boxWidth / 2
    for (var i = 0; i < titleLines.length; i++) {
      device.fillText(titleLines[i], centre, cursor + fontAscent(font))
      cursor += lineHeight
    }
    if (screen.imageAddr) {
      var canvas = imageCanvasOf(screen.imageAddr)
      if (canvas && canvas.width) {
        var height = Math.min(lineHeight * 2, canvas.height)
        var width = Math.round(canvas.width * (height / canvas.height))
        device.drawImage(canvas, centre - width / 2, cursor, width, height)
      }
      cursor += lineHeight * 2
    }
    for (var line = 0; line < lines.length; line++) {
      device.fillText(lines[line], centre, cursor + fontAscent(font))
      cursor += lineHeight
    }
    device.textAlign = 'left'
  }

  /** 软键条高度；这个屏幕没有命令就不占地方。 */
  function softKeyBarHeight(screen) {
    return commandsOf(screen).length ? fontHeight(defaultFontContext()) + PADDING * 2 : 0
  }

  /** 画底部软键条（左/右各一个标签），返回它占的高度。 */
  function drawSoftKeys(device, screen) {
    var height = softKeyBarHeight(screen)
    if (!height) return 0
    var size = screenSize()
    var font = defaultFontContext()
    var y = size.height - height
    device.fillStyle = COLORS.titleBar
    device.fillRect(0, y, size.width, height)
    applyFont(device, font)
    device.fillStyle = COLORS.titleText
    var baseline = y + Math.round((height + fontHeight(font)) / 2) - 2
    var keys = screen.softKeys || {}
    drawKeyLabels(device, keys.left && keys.left.label, keys.right && keys.right.label)
    return height
  }

  /** 底部左/右两个软键标签（软键条与平台对话框共用）。 */
  function drawKeyLabels(device, left, right) {
    var size = screenSize()
    var font = defaultFontContext()
    var height = fontHeight(font) + PADDING * 2
    var y = size.height - height
    device.fillStyle = COLORS.titleBar
    device.fillRect(0, y, size.width, height)
    applyFont(device, font)
    device.fillStyle = COLORS.titleText
    var baseline = y + Math.round((height + fontHeight(font)) / 2) - 2
    var room = Math.round(size.width / 2) - PADDING * 2
    if (left) {
      device.textAlign = 'left'
      device.fillText(clipText(font, left, room), PADDING, baseline)
    }
    if (right) {
      device.textAlign = 'right'
      device.fillText(clipText(font, right, room), size.width - PADDING, baseline)
    }
    device.textAlign = 'left'
  }

  // ---- 平台对话框 ----
  // 运行时自己要弹的那类输入框（短信验证码）挂在那张隐藏页面的 DOM 上，玩家看不到；而
  // JSR-120 的接收 native 是活的——MIDlet 调 receive0 时会一直等下去，只有这个对话框能把
  // 消息塞进队列。所以它画到画布上，输入复用播放页的输入框：把请求做成一个「伪条目」，
  // 播放页那条路一行都不用改。
  var PLATFORM_TEXT_ID = 'platform'
  var platformText = null

  /** 平台输入框的排版：画它、给播放页定位输入框，用的是同一份计算。 */
  function textPromptLayout() {
    var prompt = platformText
    if (!prompt) return null
    var size = screenSize()
    var font = defaultFontContext()
    var lineHeight = fontHeight(font)
    var boxWidth = Math.min(size.width - PADDING * 2, Math.round(size.width * 0.86))
    var lines = wrap(font, prompt.message, boxWidth - PADDING * 4)
    var inputHeight = lineHeight + PADDING * 2
    var boxHeight = PADDING * 3 + lines.length * lineHeight + inputHeight + (prompt.deadline ? lineHeight : 0) + PADDING
    var boxX = Math.round((size.width - boxWidth) / 2)
    var boxY = Math.round((size.height - boxHeight) / 2)
    return {
      box: { x: boxX, y: boxY, width: boxWidth, height: boxHeight },
      lines: lines,
      font: font,
      lineHeight: lineHeight,
      input: {
        x: boxX + PADDING * 2,
        y: boxY + PADDING * 2 + lines.length * lineHeight + PADDING,
        width: boxWidth - PADDING * 4,
        height: inputHeight,
      },
    }
  }

  function drawTextPrompt(device) {
    var prompt = platformText
    var layout = textPromptLayout()
    if (!prompt || !layout) return
    var size = screenSize()
    var font = layout.font
    device.setTransform(1, 0, 0, 1, 0, 0)
    device.globalAlpha = 1
    device.textBaseline = 'alphabetic'
    device.textAlign = 'left'
    device.fillStyle = COLORS.background
    device.fillRect(0, 0, size.width, size.height)
    device.strokeStyle = COLORS.foreground
    device.lineWidth = 2
    device.strokeRect(layout.box.x + 1, layout.box.y + 1, layout.box.width - 2, layout.box.height - 2)
    applyFont(device, font)
    device.fillStyle = COLORS.foreground
    device.textAlign = 'center'
    var centre = layout.box.x + layout.box.width / 2
    var cursor = layout.box.y + PADDING * 2
    for (var i = 0; i < layout.lines.length; i++) {
      device.fillText(layout.lines[i], centre, cursor + fontAscent(font))
      cursor += layout.lineHeight
    }
    device.textAlign = 'left'
    device.strokeStyle = COLORS.box
    device.lineWidth = 1
    device.strokeRect(layout.input.x + 0.5, layout.input.y + 0.5, layout.input.width - 1, layout.input.height - 1)
    var shown = clipText(font, prompt.text, layout.input.width - PADDING * 2)
    device.fillStyle = COLORS.foreground
    device.fillText(shown, layout.input.x + PADDING, layout.input.y + PADDING + fontAscent(font))
    if (shown) device.fillRect(layout.input.x + PADDING + textWidth(font, shown), layout.input.y + PADDING + 2, 1, layout.lineHeight - 4)
    if (prompt.deadline) {
      var seconds = Math.max(0, Math.ceil((prompt.deadline - Date.now()) / 1000))
      var label = Math.floor(seconds / 60) + ':' + ('0' + (seconds % 60)).slice(-2)
      device.fillStyle = COLORS.muted
      device.textAlign = 'center'
      device.fillText(prompt.timeoutText ? prompt.timeoutText + ' ' + label : label, centre, layout.input.y + layout.input.height + fontAscent(font))
      device.textAlign = 'left'
    }
    drawKeyLabels(device, '完成', '取消')
  }

  /** 弹一个平台输入框（一次只允许一个）。 */
  function showTextPrompt(options) {
    var device = context()
    platformText = {
      id: PLATFORM_TEXT_ID,
      platform: true,
      kind: 'text',
      label: '',
      focused: true,
      text: options.value == null ? '' : String(options.value),
      maxSize: options.maxLength | 0,
      htmlType: options.htmlType || '',
      message: options.message || '',
      deadline: options.timeoutMs > 0 ? Date.now() + options.timeoutMs : 0,
      timeoutText: options.timeoutText || '',
      onCommit: options.onCommit || null,
      onCancel: options.onCancel || null,
      snapshot: null,
    }
    // 底下可能是 MIDlet 自己画的 Canvas：它卡在等消息时不会再重画，所以关掉之后得把
    // 这一帧还回去。
    try {
      if (device) platformText.snapshot = device.getImageData(0, 0, device.canvas.width, device.canvas.height)
    } catch (error) { /* 画布被跨域图片污染过就没有快照可用 */ }
    invalidate()
  }

  function closeTextPrompt(cancelled) {
    var prompt = platformText
    if (!prompt) return null
    platformText = null
    var device = context()
    if (prompt.snapshot && device) {
      try { device.putImageData(prompt.snapshot, 0, 0) } catch (error) { /* 忽略 */ }
    }
    invalidate()
    if (cancelled && prompt.onCancel) { try { prompt.onCancel() } catch (error) { /* 忽略 */ } }
    return prompt
  }

  function commitTextPrompt() {
    var prompt = closeTextPrompt(false)
    if (prompt && prompt.onCommit) { try { prompt.onCommit(prompt.text) } catch (error) { /* 忽略 */ } }
  }

  // ---- 短信验证码 ----
  // 这份构建里 JSR-120 的接收 native 是活的，但消息只有「玩家手填」这一条路能进队列：
  // MIDlet 调 receive0 时队列是空的，它会一直等下去。原来负责填的是 promptForMessageText，
  // 而那个对话框挂在隐藏页面的 DOM 上，玩家看不到。所以在这里把两者接上。
  var SMS_RECEIVE0 = 'com/sun/midp/io/j2me/sms/Protocol.receive0.(IIILcom/sun/midp/io/j2me/sms/Protocol$SMSPacket;)I'

  function smsDialogOptions() {
    var settings = typeof MIDlet !== 'undefined' && MIDlet ? MIDlet : {}
    // 运行时那句默认文案是英文占位，站点是中文界面：换成同义的提示，顺带告诉玩家怎么输入。
    var placeholder = 'This app sent you an SMS. Type the message you received here:'
    var message = settings.SMSDialogVerificationText
    if (!message || message === placeholder) message = '游戏在等一条短信验证码：按中间那颗「OK」或点下面的输入框填写，填完按「完成」。'
    return {
      message: message,
      maxLength: settings.SMSDialogInputMaxLength | 0,
      htmlType: settings.SMSDialogInputType || 'text',
      timeoutMs: settings.SMSDialogTimeout | 0,
      timeoutText: settings.SMSDialogTimeoutText || '剩余',
      onCommit: function (value) {
        var filter = typeof settings.SMSDialogReceiveFilter === 'function' ? settings.SMSDialogReceiveFilter : null
        if (typeof receiveSms === 'function') receiveSms(filter ? filter(value) : value, 'unknown')
      },
    }
  }

  function showSmsPrompt() {
    if (platformText) return
    showTextPrompt(smsDialogOptions())
  }

  function hookSmsReceive() {
    var native = Native[SMS_RECEIVE0]
    if (typeof native !== 'function') return false
    if (native.__lcduiHooked) return true
    var wrapped = function () {
      var result = native.apply(this, arguments)
      // native 是同步设置 j2meSMSWaiting 的：队列空就说明它开始等了，这时让玩家填验证码。
      if (MIDP && MIDP.j2meSMSWaiting && !platformText) showSmsPrompt()
      return result
    }
    wrapped.__lcduiHooked = true
    Native[SMS_RECEIVE0] = wrapped
    return true
  }

  if (!hookSmsReceive()) {
    // 正常顺序里运行时脚本先加载，这里只是兜底。
    var smsHookTimer = setInterval(function () { if (hookSmsReceive()) clearInterval(smsHookTimer) }, 200)
  }

  function redraw() {
    var device = context()
    if (!device) return
    var size = screenSize()
    device.setTransform(1, 0, 0, 1, 0, 0)
    device.globalAlpha = 1
    device.textBaseline = 'alphabetic'
    device.textAlign = 'left'
    // 高级屏幕显示时由我们接管整个画面；画面归 MIDlet 自己画时只在有平台对话框时叠加。
    if (!canvasIsCurrent && activeScreen) {
      var screen = screens[activeScreen]
      if (screen) {
        device.fillStyle = COLORS.background
        device.fillRect(0, 0, size.width, size.height)
        if (screen.kind === 'alert') {
          drawAlert(device, screen)
        } else {
          if (screen.title) {
            var font = fontContext(0)
            var barHeight = titleHeight(screen)
            device.fillStyle = COLORS.titleBar
            device.fillRect(0, 0, size.width, barHeight)
            device.fillStyle = COLORS.titleText
            applyFont(device, font)
            device.textAlign = 'center'
            device.fillText(clipText(font, screen.title, size.width - PADDING * 2), Math.round(size.width / 2), Math.round((barHeight + fontHeight(font)) / 2) - 2)
            device.textAlign = 'left'
          }
          drawItems(device, screen)
          drawSoftKeys(device, screen)
        }
      }
    }
    if (platformText) drawTextPrompt(device)
  }

  function invalidate() {
    if (redrawTimer != null) return
    redrawTimer = setTimeout(function () {
      redrawTimer = null
      try { redraw() } catch (error) { console.warn('[lcdui] redraw failed: ' + (error && error.message)) }
    }, 0)
  }

  // 画面归 MIDlet 自己画时，允许它覆盖我们的屏幕内容；但只要有高级屏幕或平台对话框在显示，
  // 就周期性重画一次，防止运行时刷新旧帧时把我们画的东西盖掉。对话框还要自己看超时。
  setInterval(function () {
    if (platformText) {
      if (platformText.deadline && Date.now() >= platformText.deadline) closeTextPrompt(false)
      else invalidate()
      return
    }
    if (!canvasIsCurrent && activeScreen) invalidate()
  }, 250)

  // ---- 条目尺寸 ----
  // MIDP 的 LayoutManager 只在 layout 带 LAYOUT_EXPAND 时才把条目拉满，其余一律用
  // 这里报的「偏好宽度」。所以「该铺满」的几类在这里自己铺满：List 的选中条、输入框、
  // 进度条，否则它们会在真机上半屏都不到。
  function itemPreferredWidth(item, availableWidth) {
    var font = itemFont(item)
    var room = availableWidth > 0 ? availableWidth : screenSize().width
    if (item.kind === 'choice' && item.layout === -1) return room
    if (item.kind === 'text' || item.kind === 'gauge') return room
    var width = 0
    if (item.label) width = Math.max(width, textWidth(font, item.label))
    switch (item.kind) {
      case 'string': width = Math.max(width, textWidth(font, item.text || '')); break
      case 'choice':
        for (var i = 0; i < (item.elements || []).length; i++) {
          width = Math.max(width, textWidth(font, item.elements[i].text || '') + fontHeight(font))
        }
        break
      case 'image': {
        var canvas = imageCanvasOf(item.imageAddr)
        if (canvas) width = Math.max(width, canvas.width)
        break
      }
      default: break
    }
    return Math.max(1, Math.min(width, room))
  }

  function itemPreferredHeight(item, availableWidth) {
    var font = itemFont(item)
    var lineHeight = fontHeight(font)
    var height = item.label ? lineHeight : 0
    switch (item.kind) {
      case 'string': {
        var lines = wrap(font, item.text || '', availableWidth || 240)
        height += Math.max(1, lines.length) * lineHeight
        break
      }
      case 'choice': {
        var elements = item.elements || []
        if (!elements.length) { height += lineHeight; break }
        for (var i = 0; i < elements.length; i++) {
          var lines = wrap(font, elements[i].text || ' ', (availableWidth || 240) - lineHeight - PADDING)
          height += Math.max(lineHeight, lines.length * lineHeight) + PADDING
        }
        break
      }
      case 'text': height += lineHeight + PADDING * 2; break
      case 'gauge': height += Math.round(lineHeight / 2.4) + PADDING * 2; break
      case 'image': {
        var canvas = imageCanvasOf(item.imageAddr)
        height += canvas && canvas.height ? canvas.height : lineHeight
        break
      }
      default: height += PADDING; break
    }
    return Math.max(1, height)
  }

  // 最小尺寸：Java 用它兜住条目（比 preferred 小，比 0 大），给太小会把布局挤扁。
  function itemMinimumWidth(item) {
    var font = itemFont(item)
    switch (item.kind) {
      case 'string': return Math.max(1, textWidth(font, (item.text || '').split('\n')[0] || ''))
      case 'choice': return fontHeight(font) + PADDING * 2
      case 'text': return fontHeight(font) + PADDING * 2
      case 'gauge': return PADDING * 2
      default: return 1
    }
  }

  function itemMinimumHeight(item) {
    var font = itemFont(item)
    var height = item.label ? fontHeight(font) : 0
    switch (item.kind) {
      case 'string': return height + fontHeight(font)
      case 'choice': return height + fontHeight(font) + PADDING
      case 'text': return height + fontHeight(font) + PADDING * 2
      case 'gauge': return height + Math.round(fontHeight(font) / 2.4) + PADDING * 2
      case 'image': {
        var canvas = imageCanvasOf(item.imageAddr)
        return height + (canvas && canvas.height ? canvas.height : fontHeight(font))
      }
      default: return height + PADDING
    }
  }

  // ---- 屏幕与条目的登记 ----
  function createScreen(kind, title, lfAddress) {
    var id = nextId++
    screens[id] = {
      id: id,
      kind: kind,
      title: title || '',
      ticker: '',
      itemIds: [],
      scroll: 0,
      viewportHeight: 0,
      text: '',
      imageAddr: 0,
      currentItemId: 0,
      commands: null,
      itemCommands: [],
      softKeys: { left: null, right: null },
      lfAddress: lfAddress || 0,
    }
    return id
  }

  function createItem(kind, ownerId, extra) {
    var id = nextId++
    var item = {
      id: id,
      kind: kind,
      ownerId: ownerId,
      label: '',
      layout: LAYOUT_DEFAULT,
      font: 0,
      hidden: false,
      x: 0, y: 0, width: 0, height: 0,
      text: '',
      elements: [],
      choiceType: CHOICE_EXCLUSIVE,
      selectedIndex: 0,
      value: 0,
      maxValue: 100,
      interactive: false,
      imageAddr: 0,
      altText: '',
      focused: false,
    }
    if (extra) for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) item[key] = extra[key]
    items[id] = item
    return id
  }

  function screenOf(ownerId) {
    var screen = screens[ownerId]
    if (screen && screen.itemIds.indexOf(screen.currentItemId) < 0 && screen.currentItemId) screen.currentItemId = 0
    return screen
  }

  function attachItem(ownerId, itemId) {
    var screen = screens[ownerId]
    if (!screen) return
    if (screen.itemIds.indexOf(itemId) < 0) screen.itemIds.push(itemId)
  }

  // ---- native 覆盖 ----
  function install(key, impl) { Native[key] = impl }

  // 屏幕
  install('javax/microedition/lcdui/CanvasLFImpl.createNativeResource0.(Ljava/lang/String;Ljava/lang/String;)I', function (addr) {
    // MIDlet 自己的画布成为当前显示：停止画高级界面，把画面让回给它。
    canvasIsCurrent = true
    activeScreen = 0
    return nextId++
  })
  install('javax/microedition/lcdui/DisplayableLFImpl.setTitle0.(ILjava/lang/String;)V', function (addr, nativeId, titleAddr) {
    var screen = screens[nativeId]
    if (screen) { screen.title = str(titleAddr); invalidate() }
  })
  install('javax/microedition/lcdui/DisplayableLFImpl.setTicker0.(ILjava/lang/String;)V', function (addr, nativeId, tickerAddr) {
    var screen = screens[nativeId]
    if (screen) { screen.ticker = str(tickerAddr); invalidate() }
  })
  install('javax/microedition/lcdui/DisplayableLFImpl.deleteNativeResource0.(I)V', function (addr, nativeId) {
    var screen = screens[nativeId]
    if (screen) {
      for (var i = 0; i < screen.itemIds.length; i++) delete items[screen.itemIds[i]]
      delete screens[nativeId]
    }
    if (activeScreen === nativeId) activeScreen = 0
  })
  install('javax/microedition/lcdui/FormLFImpl.createNativeResource0.(Ljava/lang/String;Ljava/lang/String;)I', function (addr, titleAddr) {
    return createScreen('form', str(titleAddr), addr)
  })
  install('javax/microedition/lcdui/FormLFImpl.showNativeResource0.(IIII)V', function (addr, nativeId, modelVersion, width, viewportHeight) {
    var screen = screens[nativeId]
    if (!screen) return
    screen.width = width
    screen.viewportHeight = viewportHeight
    canvasIsCurrent = false
    activeScreen = nativeId
    invalidate()
  })
  install('javax/microedition/lcdui/FormLFImpl.setScrollPosition0.(I)V', function (addr, y) {
    var screen = screens[activeScreen]
    if (!screen) return
    screen.scroll = y | 0
    invalidate()
  })
  install('javax/microedition/lcdui/FormLFImpl.getScrollPosition0.()I', function () {
    var screen = screens[activeScreen]
    return screen ? screen.scroll | 0 : 0
  })
  install('javax/microedition/lcdui/FormLFImpl.getViewportHeight0.()I', function () {
    var screen = screens[activeScreen]
    if (screen && screen.viewportHeight) return screen.viewportHeight | 0
    var size = screenSize()
    return screen ? size.height - titleHeight(screen) : size.height
  })
  install('javax/microedition/lcdui/FormLFImpl.setCurrentItem0.(III)V', function (addr, nativeId, itemId) {
    var screen = screens[nativeId]
    if (!screen) return
    screen.currentItemId = itemId
    for (var id in items) items[id].focused = Number(id) === Number(itemId)
    invalidate()
    flushItemChange()      // 焦点挪走了：正是把输入框的改动告诉 MIDlet 的时机
  })
  // Alert
  install('javax/microedition/lcdui/AlertLFImpl.createNativeResource0.(Ljava/lang/String;Ljava/lang/String;I)I', function (addr, titleAddr) {
    return createScreen('alert', str(titleAddr), addr)
  })
  install('javax/microedition/lcdui/AlertLFImpl.showNativeResource0.(I)V', function (addr, nativeId) {
    if (!screens[nativeId]) return
    canvasIsCurrent = false
    activeScreen = nativeId
    invalidate()
  })
  install('javax/microedition/lcdui/AlertLFImpl.setNativeContents0.(ILjavax/microedition/lcdui/ImageData;[ILjava/lang/String;)Z', function (addr, nativeId, imageDataAddr, indicatorBoundsAddr, textAddr) {
    var screen = screens[nativeId]
    if (screen) {
      screen.imageAddr = imageDataAddr
      screen.text = str(textAddr)
      invalidate()
    }
    return 0
  })

  // ---- 命令（Command / 软键）----
  // 运行时的 NativeMenu.updateCommands 是 DOM 版：它先找 displayable-<id> 元素，找不到就
  // 退到侧边栏/ prompt() 分支，而运行时在 iframe 里把 prompt 换成了 window.parent.DumbPipe，
  // 播放页没有那个东西，于是每切一次屏就抛一次 TypeError 被它自己吞掉打成日志。
  // 命令的派发其实全在 Java 侧（Display.handleCommandEvent → uCallCommandEvent → 
  // CommandListener），这里只要把命令收下来画成软键，按下去时把 id 发回 Java 即可。
  var COMMAND_BACK = 2, COMMAND_CANCEL = 3, COMMAND_STOP = 6, COMMAND_EXIT = 7
  var pendingCommands = []   // 最近一次 updateCommands 收到的命令（新屏幕还没被 show 时的落点）

  function isBackCommand(command) {
    return command.type === COMMAND_BACK || command.type === COMMAND_CANCEL
      || command.type === COMMAND_STOP || command.type === COMMAND_EXIT
  }

  /** Command 对象 → { label, type, priority, id }。 */
  function commandInfo(address) {
    var handle = address ? getHandle(address) : null
    if (!handle) return null
    var label = str(readObjectField(handle, 'javax/microedition/lcdui/Command', 'shortLabel', 'Ljava/lang/String;'))
    if (!label) label = str(readObjectField(handle, 'javax/microedition/lcdui/Command', 'longLabel', 'Ljava/lang/String;'))
    return {
      label: label,
      type: readIntField(handle, 'javax/microedition/lcdui/Command', 'commandType'),
      priority: readIntField(handle, 'javax/microedition/lcdui/Command', 'priority'),
      id: readIntField(handle, 'javax/microedition/lcdui/Command', 'id'),
    }
  }

  function readCommands(addresses, count) {
    var commands = []
    try {
      var list = addresses ? J2ME.getArrayFromAddr(addresses) : []
      for (var i = 0; i < count && i < list.length; i++) {
        var command = commandInfo(list[i])
        if (command) commands.push(command)
      }
    } catch (error) { /* 读不全也不该挡住这一帧 */ }
    commands.sort(function (a, b) { return (a.priority | 0) - (b.priority | 0) })
    return commands
  }

  /** 命令列表 → 左右两个软键（返回类命令优先放右键，只有一个命令时放左键）。 */
  function assignSoftKeys(screen) {
    var commands = commandsOf(screen)
    var others = [], backs = []
    for (var i = 0; i < commands.length; i++) (isBackCommand(commands[i]) ? backs : others).push(commands[i])
    var left = null, right = null
    if (others.length) {
      left = others[0]
      right = backs.length ? backs[0] : (others.length > 1 ? others[1] : null)
    } else if (backs.length) {
      left = backs[0]
      right = backs.length > 1 ? backs[1] : null
    }
    screen.softKeys = { left: left, right: right }
    return commands
  }

  /** 屏幕当前的命令；Java 在 show 之前就发过一遍时用暂存的那份。 */
  function commandsOf(screen) {
    if (screen && !screen.commands && pendingCommands.length) screen.commands = pendingCommands
    return (screen && screen.commands) || []
  }

  /** 把命令发回 Java（Java 侧再去调 MIDlet 的 CommandListener）。 */
  function sendCommand(command) {
    if (!command || !MIDP || typeof MIDP.sendCommandEvent !== 'function') return false
    try { MIDP.sendCommandEvent(command.id) } catch (error) { return false }
    return true
  }

  /** 按软键：which 取 'left' / 'right'。平台对话框在的时候它的软键优先。 */
  function pressSoftKey(which) {
    if (platformText) {
      if (which === 'left') commitTextPrompt()
      else if (which === 'right') closeTextPrompt(true)
      return true
    }
    var screen = screens[activeScreen]
    if (!screen || !screen.softKeys) return false
    return sendCommand(screen.softKeys[which])
  }

  install('javax/microedition/lcdui/NativeMenu.updateCommands.([Ljavax/microedition/lcdui/Command;I[Ljavax/microedition/lcdui/Command;I)V', function (addr, itemCommandsAddr, numItemCommands, commandsAddr, numCommands) {
    var screen = screens[activeScreen]
    pendingCommands = readCommands(commandsAddr, numCommands)
    var itemCommands = readCommands(itemCommandsAddr, numItemCommands)
    if (screen) {
      screen.commands = pendingCommands
      screen.itemCommands = itemCommands
      assignSoftKeys(screen)
    }
    invalidate()
  })

  // ---- 软键按键 ----
  // 播放页的按键都从 MIDP.sendKeyPress 进来（见 bridge.js），MIDP 的左右软键码是
  // -6 / -7，播放页把它们接在 select / start 两个按钮上。这个构建的 Java 侧对高级
  // 界面的软键什么都没做（命令菜单那条路是空的，实测按键无反应），所以在这里接住：
  // 只要显示的是高级屏幕就当成软键处理。按键照旧往下传——Canvas 游戏要自己收这两个
  // 键，而高级屏幕的 Java 侧拿到它们本来也不做事。
  var KEY_SOFT1 = -6, KEY_SOFT2 = -7

  function hookSoftKeys() {
    if (!MIDP || typeof MIDP.sendKeyPress !== 'function') return false
    if (MIDP.__lcduiSoftKeys) return true
    var sendKeyPress = MIDP.sendKeyPress
    MIDP.sendKeyPress = function (keyCode) {
      if (!canvasIsCurrent && activeScreen) {
        if (keyCode === KEY_SOFT1 || keyCode === KEY_SOFT2) pressSoftKey(keyCode === KEY_SOFT1 ? 'left' : 'right')
        else navigateList(keyCode)
      }
      return sendKeyPress.apply(this, arguments)
    }
    MIDP.__lcduiSoftKeys = true
    return true
  }

  // ---- List 内的按键导航 ----
  // 这个构建里没有 ListLFImpl（List 就是「一个只含 ChoiceGroup 的 Form」），Java 侧没有
  // 任何人负责移动列表内的选中项：DisplayableLFImpl.uCallKeyPressed 是空实现，
  // ChoiceGroupLFImpl 完全没有按键处理，ItemLFImpl.uCallTraverse 只管焦点标记。实测
  // 上下键和确定键在列表上都毫无反应，所以这两件事由这里代劳。
  // Java 侧不需要我们通知：它要答案时会用 getSelectedIndex0 把我们这份状态读回去。
  var ACTION_UP = 1, ACTION_DOWN = 6, ACTION_FIRE = 8
  var KEY_CONVERTER = 'javax/microedition/lcdui/KeyConverter.getGameAction.(I)I'

  /** 用运行时自己的按键表把键码换成 MIDP 的游戏动作（和 Java 侧同一个答案）。 */
  function gameActionOf(keyCode) {
    var method = Native[KEY_CONVERTER]
    if (typeof method !== 'function') return 0
    try { return method(0, keyCode) | 0 } catch (error) { return 0 }
  }

  /** 当前显示的如果是一个 List（整屏只有一条 layout = -1 的 choice），返回那条条目。 */
  function activeList() {
    var screen = screens[activeScreen]
    if (!screen || screen.kind !== 'form' || screen.itemIds.length !== 1) return null
    var item = items[screen.itemIds[0]]
    return item && item.kind === 'choice' && item.layout === -1 ? item : null
  }

  /** List 显式设过的 selectCommand（列表命令表里有它才认，避免用空标签的默认命令）。 */
  function listSelectCommandId(item) {
    if (!item.lfAddress) return -1
    try {
      var group = readObjectField(getHandle(item.lfAddress), 'javax/microedition/lcdui/ChoiceGroupLFImpl', 'cg', 'Ljavax/microedition/lcdui/ChoiceGroup;')
      var owner = group ? readObjectField(getHandle(group), 'javax/microedition/lcdui/ChoiceGroup', 'owner', 'Ljavax/microedition/lcdui/Screen;') : 0
      var command = owner ? readObjectField(getHandle(owner), 'javax/microedition/lcdui/List', 'selectCommand', 'Ljavax/microedition/lcdui/Command;') : 0
      if (!command) return -1
      return readIntField(getHandle(command), 'javax/microedition/lcdui/Command', 'id')
    } catch (error) { return -1 }
  }

  function setListSelection(list, index) {
    list.selectedIndex = index | 0
    for (var i = 0; i < list.elements.length; i++) list.elements[i].selected = i === list.selectedIndex
    invalidate()
  }

  /** 上下键：高亮在列表里循环（真机的列表按到底就绕回第一项）。 */
  function moveListSelection(list, step) {
    var count = (list.elements || []).length
    if (!count) return
    var index = (list.selectedIndex | 0) + step
    if (index < 0) index = count - 1
    if (index >= count) index = 0
    setListSelection(list, index)
  }

  /** 确定键：先选中当前项，再按 MIDP 的语义发一次命令。 */
  function selectListCurrent(list) {
    var screen = screens[activeScreen]
    if (!screen) return
    setListSelection(list, list.selectedIndex | 0)
    var commands = commandsOf(screen)
    var selectId = listSelectCommandId(list)
    var target = null
    for (var i = 0; i < commands.length; i++) {
      if (selectId >= 0 && commands[i].id === selectId) { target = commands[i]; break }
    }
    if (!target) {
      for (var j = 0; j < commands.length; j++) if (!isBackCommand(commands[j])) { target = commands[j]; break }
    }
    if (!target && commands.length) target = commands[0]
    sendCommand(target)
  }

  /** 高级屏幕显示时的按键补充处理；Canvas 游戏完全不受影响。 */
  function navigateList(keyCode) {
    var list = activeList()
    if (!list) return
    var action = gameActionOf(keyCode)
    if (action === ACTION_UP) moveListSelection(list, -1)
    else if (action === ACTION_DOWN) moveListSelection(list, 1)
    else if (action === ACTION_FIRE) selectListCurrent(list)
  }

  if (!hookSoftKeys()) {
    // 运行时还没把 MIDP 挂出来（正常顺序里它在主 bundle 里就有了），稍等重试。
    var hookTimer = setInterval(function () { if (hookSoftKeys()) clearInterval(hookTimer) }, 200)
  }

  // ---- 文本输入 ----
  // 运行时自己那套编辑器（TextEditorProvider）挂在隐藏 iframe 的 DOM 上，玩家既看不见也
  // 点不到；这份构建更是根本没把它接到高级界面上：TextFieldLFImpl.createNativeResource0
  // 是空壳，getString0 读的是一个只有 prompt() 才会写进去的全局变量。所以输入由播放页
  // 显示（一个真正的 <input>，手机上能拉起系统键盘），这里只做三件事：告诉播放页现在哪个
  // 输入框被聚焦、把打进去的字写回 Java、提交时通知 ItemStateListener。Java 侧读值时本来
  // 就会用 getString0 来问我们，不需要别的同步。
  var TEXT_UNEDITABLE = 131072
  var pendingItemChange = 0     // 内容改过、还没通知 MIDlet 的条目 id

  /** 当前聚焦的、可编辑的输入框。 */
  function focusedTextField() {
    if (canvasIsCurrent || !activeScreen) return null
    var screen = screens[activeScreen]
    if (!screen || screen.kind !== 'form') return null
    var item = items[screen.currentItemId]
    if (!item || item.kind !== 'text' || item.hidden) return null
    if ((item.constraints | 0) & TEXT_UNEDITABLE) return null
    return item
  }

  /** 给播放页的输入框状态：坐标是画布坐标，edit* 是真正画输入框那块（标签在上面）。 */
  function textFieldState() {
    if (platformText) {
      var layout = textPromptLayout()
      if (!layout) return null
      return {
        id: platformText.id,
        platform: true,
        x: layout.input.x, y: layout.input.y, width: layout.input.width, height: layout.input.height,
        editX: layout.input.x, editY: layout.input.y, editWidth: layout.input.width, editHeight: layout.input.height,
        constraints: 0,
        maxSize: platformText.maxSize | 0,
        htmlType: platformText.htmlType || '',
        text: platformText.text || '',
      }
    }
    var item = focusedTextField()
    if (!item) return null
    var font = itemFont(item)
    var labelHeight = item.label ? fontHeight(font) : 0
    var height = item.height | 0
    var width = item.width | 0
    return {
      id: item.id,
      x: item.x | 0, y: item.y | 0, width: width, height: height,
      editX: item.x | 0,
      editY: (item.y | 0) + labelHeight,
      editWidth: width,
      editHeight: Math.max(fontHeight(font) + PADDING, height - labelHeight),
      constraints: item.constraints | 0,
      maxSize: item.maxSize | 0,
      text: item.text || '',
    }
  }

  /** 改输入框的内容：写明面上那份，同时写回 Java 的 DynamicCharacterArray。 */
  function setItemText(item, text) {
    if (!item) return false
    var limit = item.maxSize | 0
    var next = text == null ? '' : String(text)
    if (limit > 0 && next.length > limit) next = next.slice(0, limit)
    item.text = next
    setBufferText(item.bufferAddr, next)
    invalidate()
    return true
  }

  /** 提交：写回内容，并攒下一次「条目内容变了」的通知。 */
  function commitItemText(item, text) {
    if (!setItemText(item, text)) return false
    if (item.platform) { commitTextPrompt(); return true }
    // 通知不能在这里发：调用来自播放页，那时没有 VM 上下文（实测报 ctx 为 null）。
    // 攒着，等 Java 下次叫到我们（读值或移动焦点）时再发，那时上下文是现成的。
    pendingItemChange = item.id
    return true
  }

  /**
   * 把攒下的通知发出去。必须从 Java 调进来的 native 里调用——只有那时 $ 才指向 isolate。
   * 发完就清掉，免得同一个条目通知两次。
   */
  function flushItemChange() {
    var id = pendingItemChange
    if (!id) return false
    pendingItemChange = 0
    var screen = screens[activeScreen]
    var item = items[id]
    if (!item || !screen || screen.id !== item.ownerId) return false
    return notifyItemChanged(item)
  }

  function notifyItemChanged(item) {
    var screen = screens[activeScreen]
    var reason = ''
    try {
      var ownerAddr = screen && screen.lfAddress
        ? readObjectField(getHandle(screen.lfAddress), 'javax/microedition/lcdui/DisplayableLFImpl', 'owner', 'Ljavax/microedition/lcdui/Displayable;')
        : 0
      var owner = ownerAddr ? getHandle(ownerAddr) : null
      var formClass = J2ME.CLASSES.getClass('javax/microedition/lcdui/Form')
      // 只有 Form 有 uCallItemStateChanged；List / TextBox 的宿主对象不是 Form。
      if (!owner || owner.classInfo !== formClass) reason = '宿主不是 Form'
      else if (!item || !item.lfAddress) reason = '条目没有 LF'
      else {
        var javaItem = readObjectField(getHandle(item.lfAddress), 'javax/microedition/lcdui/ItemLFImpl', 'item', 'Ljavax/microedition/lcdui/Item;')
        var methodInfo = javaItem && formClass.getMethodByNameString('uCallItemStateChanged', '(Ljavax/microedition/lcdui/Item;)V')
        if (!javaItem) reason = '条目没有 Java 侧对象'
        else if (!methodInfo) reason = '找不到 uCallItemStateChanged'
        else {
          J2ME.preemptionLockLevel++
          J2ME.getLinkedMethod(methodInfo)(ownerAddr, javaItem)
          J2ME.preemptionLockLevel--
          return true
        }
      }
    } catch (error) { reason = '调用失败：' + (error && error.message) }
    if (reason) console.debug('[lcdui] ItemStateListener 没通知到：' + reason)
    return false
  }

  // 条目通用
  install('javax/microedition/lcdui/ItemLFImpl.setSize0.(III)V', function (addr, nativeId, width, height) {
    var item = items[nativeId]
    if (item) { item.width = width | 0; item.height = height | 0; invalidate() }
  })
  install('javax/microedition/lcdui/ItemLFImpl.setLocation0.(III)V', function (addr, nativeId, x, y) {
    var item = items[nativeId]
    if (item) { item.x = x | 0; item.y = y | 0; invalidate() }
  })
  install('javax/microedition/lcdui/ItemLFImpl.setLabel0.(ILjava/lang/String;)V', function (addr, nativeId, labelAddr) {
    var item = items[nativeId]
    if (item) { item.label = str(labelAddr); invalidate() }
  })
  install('javax/microedition/lcdui/ItemLFImpl.show0.(I)V', function (addr, nativeId) {
    var item = items[nativeId]
    if (item) { item.hidden = false; invalidate() }
  })
  install('javax/microedition/lcdui/ItemLFImpl.hide0.(I)V', function (addr, nativeId) {
    var item = items[nativeId]
    if (item) { item.hidden = true; invalidate() }
  })
  install('javax/microedition/lcdui/ItemLFImpl.delete0.(I)V', function (addr, nativeId) {
    delete items[nativeId]
    invalidate()
  })
  // 尺寸查询：Java 侧传的第一个参数是条目自己的 nativeId（不是对象地址），
  // 它拿这几个答案去算布局，答错了整屏的条目都会挤在一起。
  install('javax/microedition/lcdui/ItemLFImpl.getPreferredWidth0.(II)I', function (addr, nativeId, availableWidth) {
    return itemPreferredWidth(items[nativeId] || {}, availableWidth)
  })
  install('javax/microedition/lcdui/ItemLFImpl.getPreferredHeight0.(II)I', function (addr, nativeId, availableWidth) {
    return itemPreferredHeight(items[nativeId] || {}, availableWidth)
  })
  install('javax/microedition/lcdui/ItemLFImpl.getMinimumWidth0.(I)I', function (addr, nativeId) {
    return itemMinimumWidth(items[nativeId] || {})
  })
  install('javax/microedition/lcdui/ItemLFImpl.getMinimumHeight0.(I)I', function (addr, nativeId) {
    return itemMinimumHeight(items[nativeId] || {})
  })

  // StringItem
  install('javax/microedition/lcdui/StringItemLFImpl.createNativeResource0.(ILjava/lang/String;ILjava/lang/String;ILjavax/microedition/lcdui/Font;)I', function (addr, ownerId, labelAddr, layout, textAddr, appearanceMode, fontAddr) {
    var id = createItem('string', ownerId, { label: str(labelAddr), layout: layout | 0, font: fontAddr, text: str(textAddr) })
    attachItem(ownerId, id)
    return id
  })
  install('javax/microedition/lcdui/StringItemLFImpl.setContent0.(ILjava/lang/String;I)V', function (addr, nativeId, textAddr) {
    var item = items[nativeId]
    if (item) { item.text = str(textAddr); invalidate() }
  })
  // setFont0 传的是 face / style / size 三个 int（不是 Font 对象），按规格建字体。
  install('javax/microedition/lcdui/StringItemLFImpl.setFont0.(IIII)V', function (addr, nativeId, face, style, size) {
    var item = items[nativeId]
    if (item) { item.fontSpec = { face: face | 0, style: style | 0, size: size | 0 }; invalidate() }
  })

  // ChoiceGroup（List 也是它：layout 传 -1 表示属于 List）
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.createNativeResource0.(ILjava/lang/String;III[Ljavax/microedition/lcdui/ChoiceGroup$CGElement;II)I', function (addr, ownerId, labelAddr, layout, choiceType, fitPolicy, elementsAddr, numOfEls, selectedIndex) {
    var elements = []
    try {
      var addresses = elementsAddr ? J2ME.getArrayFromAddr(elementsAddr) : []
      for (var i = 0; i < numOfEls && i < addresses.length; i++) {
        if (!addresses[i]) { elements.push({ text: '', selected: false, imageAddr: 0 }); continue }
        var element = getHandle(addresses[i])
        elements.push({
          text: str(readObjectField(element, 'javax/microedition/lcdui/ChoiceGroup$CGElement', 'stringEl', 'Ljava/lang/String;')),
          imageAddr: readObjectField(element, 'javax/microedition/lcdui/ChoiceGroup$CGElement', 'imageEl', 'Ljavax/microedition/lcdui/Image;'),
          font: readObjectField(element, 'javax/microedition/lcdui/ChoiceGroup$CGElement', 'fontEl', 'Ljavax/microedition/lcdui/Font;'),
          selected: readBooleanField(element, 'javax/microedition/lcdui/ChoiceGroup$CGElement', 'selected'),
        })
      }
    } catch (error) { /* 元素读不全也要把屏幕画出来 */ }
    var id = createItem('choice', ownerId, {
      label: str(labelAddr),
      layout: layout | 0,
      choiceType: choiceType | 0,
      elements: elements,
      selectedIndex: selectedIndex | 0,
      lfAddress: addr,       // 需要时从这里摸回 List 对象（读它的 selectCommand）
    })
    attachItem(ownerId, id)
    return id
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.insert0.(IILjava/lang/String;Ljavax/microedition/lcdui/ImageData;Z)V', function (addr, nativeId, index, textAddr, imageDataAddr, selected) {
    var item = items[nativeId]
    if (!item) return
    item.elements.splice(0, 0, { text: str(textAddr), imageAddr: 0, selected: !!selected })
    invalidate()
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.set0.(IILjava/lang/String;Ljavax/microedition/lcdui/ImageData;Z)V', function (addr, nativeId, index, textAddr, imageDataAddr, selected) {
    var item = items[nativeId]
    if (!item || !item.elements[index]) return
    item.elements[index] = { text: str(textAddr), imageAddr: 0, selected: !!selected }
    invalidate()
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.delete0.(III)V', function (addr, nativeId, index) {
    var item = items[nativeId]
    if (!item) return
    item.elements.splice(index, 1)
    invalidate()
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.deleteAll0.(I)V', function (addr, nativeId) {
    var item = items[nativeId]
    if (item) { item.elements = []; invalidate() }
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.setSelectedIndex0.(IIZ)V', function (addr, nativeId, index, selected) {
    var item = items[nativeId]
    if (!item) return
    if (item.choiceType === CHOICE_IMPLICIT) item.selectedIndex = index | 0
    if (item.elements[index]) item.elements[index].selected = selected !== 0
    invalidate()
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.setSelectedFlags0.(I[ZI)V', function (addr, nativeId, flagsAddr, numOfEls) {
    var item = items[nativeId]
    if (!item) return
    try {
      var flags = J2ME.getArrayFromAddr(flagsAddr)
      for (var i = 0; i < item.elements.length && i < flags.length; i++) item.elements[i].selected = !!flags[i]
    } catch (error) { /* 忽略 */ }
    invalidate()
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.setFitPolicy0.(II)V', function () {})
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.setFont0.(IIIII)V', function (addr, nativeId, index, face, style, size) {
    var item = items[nativeId]
    if (!item) return
    var spec = { face: face | 0, style: style | 0, size: size | 0 }
    if (item.elements[index]) item.elements[index].fontSpec = spec
    else item.fontSpec = spec
    invalidate()
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.getSelectedIndex0.(I)I', function (addr, nativeId) {
    var item = items[nativeId]
    return item ? item.selectedIndex | 0 : 0
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.getSelectedFlags0.(I[ZI)I', function (addr, nativeId, flagsAddr, numOfEls) {
    var item = items[nativeId]
    if (!item) return 0
    try {
      var flags = J2ME.getArrayFromAddr(flagsAddr)
      for (var i = 0; i < item.elements.length && i < flags.length; i++) flags[i] = item.elements[i].selected ? 1 : 0
    } catch (error) { /* 忽略 */ }
    return 0
  })
  install('javax/microedition/lcdui/ChoiceGroupLFImpl.isSelected0.(II)Z', function (addr, nativeId, index) {
    var item = items[nativeId]
    return item && item.elements[index] && item.elements[index].selected ? 1 : 0
  })

  // Gauge
  install('javax/microedition/lcdui/GaugeLFImpl.createNativeResource0.(ILjava/lang/String;IZII)I', function (addr, ownerId, labelAddr, layout, interactive, maxValue, initialValue) {
    var id = createItem('gauge', ownerId, {
      label: str(labelAddr),
      layout: layout | 0,
      interactive: !!interactive,
      maxValue: maxValue | 0,
      value: initialValue | 0,
    })
    attachItem(ownerId, id)
    return id
  })
  install('javax/microedition/lcdui/GaugeLFImpl.setValue0.(III)V', function (addr, nativeId, value, maxValue) {
    var item = items[nativeId]
    if (item) { item.value = value | 0; if (maxValue > 0) item.maxValue = maxValue | 0; invalidate() }
  })

  // TextField / TextBox
  install('javax/microedition/lcdui/TextFieldLFImpl.createNativeResource0.(ILjava/lang/String;ILcom/sun/midp/lcdui/DynamicCharacterArray;ILjava/lang/String;)I', function (addr, ownerId, labelAddr, layout, bufferAddr, constraints, initialInputModeAddr) {
    var id = createItem('text', ownerId, {
      label: str(labelAddr),
      layout: layout | 0,
      constraints: constraints | 0,
      bufferAddr: bufferAddr,
      text: bufferText(bufferAddr),
      lfAddress: addr,      // 提交编辑时要顺着它摸到 Java 的 Item，通知 ItemStateListener
    })
    attachItem(ownerId, id)
    return id
  })
  install('javax/microedition/lcdui/TextFieldLFImpl.setString0.(ILcom/sun/midp/lcdui/DynamicCharacterArray;)V', function (addr, nativeId, bufferAddr) {
    var item = items[nativeId]
    if (!item) return
    item.bufferAddr = bufferAddr
    item.text = bufferText(bufferAddr)
    invalidate()
  })
  install('javax/microedition/lcdui/TextFieldLFImpl.getString0.(ILcom/sun/midp/lcdui/DynamicCharacterArray;)Z', function (addr, nativeId, charsAddr) {
    flushItemChange()      // 只有 Java 调进来时才有 VM 上下文，通知就在这些点发
    var item = items[nativeId]
    if (!item) return 0
    setBufferText(charsAddr, item.text || '')
    return 1
  })
  install('javax/microedition/lcdui/TextFieldLFImpl.setMaxSize0.(II)V', function (addr, nativeId, maxSize) {
    var item = items[nativeId]
    if (item) item.maxSize = maxSize | 0
  })
  install('javax/microedition/lcdui/TextFieldLFImpl.setConstraints0.(II)V', function (addr, nativeId, constraints) {
    var item = items[nativeId]
    if (item) { item.constraints = constraints | 0; invalidate() }
  })
  install('javax/microedition/lcdui/TextFieldLFImpl.getCaretPosition0.(I)I', function (addr, nativeId) {
    var item = items[nativeId]
    return item && item.text ? item.text.length : 0
  })

  // ImageItem
  install('javax/microedition/lcdui/ImageItemLFImpl.createNativeResource0.(ILjava/lang/String;ILjavax/microedition/lcdui/ImageData;Ljava/lang/String;I)I', function (addr, ownerId, labelAddr, layout, imageDataAddr, altTextAddr, appearanceMode) {
    var id = createItem('image', ownerId, {
      label: str(labelAddr),
      layout: layout | 0,
      imageAddr: imageDataAddr,
      altText: str(altTextAddr),
    })
    attachItem(ownerId, id)
    return id
  })
  install('javax/microedition/lcdui/ImageItemLFImpl.setContent0.(ILjavax/microedition/lcdui/ImageData;Ljava/lang/String;I)V', function (addr, nativeId, imageDataAddr, altTextAddr) {
    var item = items[nativeId]
    if (item) { item.imageAddr = imageDataAddr; item.altText = str(altTextAddr); invalidate() }
  })

  /** 按 id 取条目：平台对话框那个伪条目的 id 是固定字符串。 */
  function itemById(id) {
    return id === PLATFORM_TEXT_ID ? platformText : items[id]
  }

  // 播放页与探针用的入口：播放页靠 textField / commitText 显示输入框，
  // 其余几项让探针与排障能看见运行时内部状态。
  window.__lcdui = {
    screens: screens,
    items: items,
    redraw: redraw,
    /** 当前聚焦的输入框（没有就 null）：{ id, x, y, width, height, constraints, maxSize, text } */
    textField: textFieldState,
    /** 编辑过程中写值（不通知 MIDlet）。 */
    setText: function (nativeId, text) {
      return setItemText(itemById(nativeId), text)
    },
    /** 提交：写值并通知 MIDlet 的 ItemStateListener。 */
    commitText: function (nativeId, text) {
      return commitItemText(itemById(nativeId), text)
    },
    /** 平台对话框（现在还只有短信验证码那一个）。 */
    prompt: function () {
      return platformText ? { message: platformText.message, text: platformText.text, deadline: platformText.deadline > 0 } : null
    },
    commands: function () {
      var screen = screens[activeScreen]
      return screen ? { left: (screen.softKeys || {}).left || null, right: (screen.softKeys || {}).right || null } : null
    },
    pressSoftKey: function (which) { return pressSoftKey(which) },
  }
}())
