<template>
  <div class="portal crt-screen" ref="wrapperRef">
    <!-- Nostalgist's generated <canvas> is appended here on boot -->
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useEmulator } from '../../composables/useEmulator.js'

const props = defineProps({
  core: { type: String, required: true },
  // Either a single { fileName, fileContent } or an array of them — arcade
  // clones need their parent romset mounted alongside the clone in the VFS.
  rom: { type: [Object, Array], required: true },
  bios: { type: Array, default: () => [] },
  retroarchConfig: { type: Object, default: () => ({}) },
  retroarchCoreConfig: { type: Object, default: () => ({}) },
  // 资源加载进度会话（可选）：核心下载与启动阶段都会往它上面汇报状态。
  progress: { type: Object, default: null },
  // J2ME 专用：开局弹窗里选定的 Java 类库（enginemode）。改变它意味着换一档类库，
  // 必须重新启动（watch 里会 reboot）。
  engine: { type: String, default: null },
  // J2ME 专用：RMS 云存档的读写接口（null = 不接云存档，例如未登录或房间客人）。
  cloudSave: { type: Object, default: null },
})
const emit = defineEmits(['booted', 'error', 'config-reloaded'])

const {
  wrapperRef,
  boot,
  saveState,
  loadState,
  syncCheats,
  readCheats,
  coreSupportsCheats,
  coreSupportsSaveState,
  pressButton,
  releaseButton,
  canvas,
  captureAudioStream,
  destroy,
} = useEmulator()

// Last cheat list handed to us by the page. RetroArch starts with an empty
// cheat manager on every boot, so a restart (重载游戏 / 按键设置重载 / 换版本)
// has to push it back in.
let lastCheatList = []

async function start() {
  try {
    const emu = await boot({
      core: props.core,
      rom: props.rom,
      bios: props.bios,
      retroarchConfig: props.retroarchConfig,
      retroarchCoreConfig: props.retroarchCoreConfig,
      progress: props.progress,
      engine: props.engine,
      cloudSave: props.cloudSave,
      onRuntimeError: (err) => emit('error', err),
    })
    if (!emu) return
    if (lastCheatList.length) syncCheats(lastCheatList)
    emit('booted')
  } catch (err) {
    console.error('[emulator] boot failed', err)
    emit('error', err)
  }
}

onMounted(() => start())

function configSignature(value) {
  const entries = Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(entries)
}

const retroarchConfigSignature = computed(() => configSignature(props.retroarchConfig))
const retroarchCoreConfigSignature = computed(() => configSignature(props.retroarchCoreConfig))

async function restart() {
  await destroy()
  await start()
}

// Remember what the page wants applied so `start()` can restore it after a
// reboot. Codes never carry over to another ROM/core.
function applyCheats(list) {
  lastCheatList = Array.isArray(list) ? list.slice() : []
  return syncCheats(lastCheatList)
}

// Exposed so the player bar can reboot the emulator (重载游戏). `restart()` is
// also what the ROM/config watchers use internally.
defineExpose({
  restart,
  saveState,
  loadState,
  syncCheats: applyCheats,
  readCheats,
  coreSupportsCheats,
  coreSupportsSaveState,
  pressButton,
  releaseButton,
  captureAudioStream,
  destroy,
  get canvas() { return canvas() },
})

// Re-boot on ROM change. Compare by primary fileContent URL (first entry of
// an array or the single object) plus core name. J2ME's class library
// (enginemode) sits in the same slot: switching it is switching the core.
function romKey(r) {
  if (!r) return null
  if (Array.isArray(r)) return r.map((x) => x?.fileContent).join('|')
  return r.fileContent
}
watch(() => [romKey(props.rom), props.core, props.engine], async ([newKey, newCore, newEngine], [oldKey, oldCore, oldEngine]) => {
  if (newKey === oldKey && newCore === oldCore && newEngine === oldEngine) return
  lastCheatList = []
  await restart()
})

watch([retroarchConfigSignature, retroarchCoreConfigSignature], async ([nextConfig, nextCoreConfig], [prevConfig, prevCoreConfig]) => {
  if ((!prevConfig && !prevCoreConfig) || (nextConfig === prevConfig && nextCoreConfig === prevCoreConfig)) return
  await restart()
  emit('config-reloaded')
})
</script>

<style scoped>
.portal {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #382C46 0%, #2A2138 100%);
  position: relative;
  overflow: hidden;
  contain: layout paint;
}
/* Nostalgist's canvas is inserted via JS so the rule has to escape :deep() */
.portal :deep(.portal-canvas),
.portal :deep(#canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  background: linear-gradient(180deg, #382C46 0%, #2A2138 100%);
  outline: none;
}
</style>
