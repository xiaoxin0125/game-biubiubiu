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
})
const emit = defineEmits(['booted', 'error', 'config-reloaded'])

const {
  wrapperRef,
  boot,
  saveState,
  loadState,
  pressButton,
  releaseButton,
  canvas,
  captureAudioStream,
  toggleFullscreen,
  destroy,
} = useEmulator()

async function start() {
  try {
    await boot({
      core: props.core,
      rom: props.rom,
      bios: props.bios,
      retroarchConfig: props.retroarchConfig,
      retroarchCoreConfig: props.retroarchCoreConfig,
    })
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

// Re-boot on ROM change. Compare by primary fileContent URL (first entry of
// an array or the single object) plus core name.
function romKey(r) {
  if (!r) return null
  if (Array.isArray(r)) return r.map((x) => x?.fileContent).join('|')
  return r.fileContent
}
watch(() => [romKey(props.rom), props.core], async ([newKey, newCore], [oldKey, oldCore]) => {
  if (newKey === oldKey && newCore === oldCore) return
  await restart()
})

watch([retroarchConfigSignature, retroarchCoreConfigSignature], async ([nextConfig, nextCoreConfig], [prevConfig, prevCoreConfig]) => {
  if ((!prevConfig && !prevCoreConfig) || (nextConfig === prevConfig && nextCoreConfig === prevCoreConfig)) return
  await restart()
  emit('config-reloaded')
})

defineExpose({
  saveState,
  loadState,
  pressButton,
  releaseButton,
  toggleFullscreen,
  captureAudioStream,
  destroy,
  get canvas() { return canvas() },
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
  background: #000;
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
  background: #000;
  outline: none;
}
</style>
