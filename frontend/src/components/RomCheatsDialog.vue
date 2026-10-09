<template>
  <Teleport to="body">
    <div class="mask" @click.self="$emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="金手指设置">
        <header class="dh">
          <h3>金手指设置</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" :disabled="saving" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <div class="rom-card">
            <div class="rom-name">{{ rom.title }}</div>
            <div class="rom-meta">
              <span>{{ platformLabel }}</span>
              <span>·</span>
              <span>默认核心 {{ coreLabel }}</span>
            </div>
          </div>

          <div v-if="loading" class="state-text">读取中…</div>

          <template v-else>
            <div v-if="rows.length" class="list">
              <div v-for="(row, index) in rows" :key="row.key" class="row">
                <span class="idx">{{ index + 1 }}</span>
                <div class="fields">
                  <input v-model="row.label" class="input cheat-label" maxlength="64" placeholder="名称，如 无限命" />
                  <input v-model="row.code" class="input cheat-code" spellcheck="false" placeholder="代码，如 SXIOPO" />
                </div>
                <button class="btn btn-ghost btn-icon btn-sm del" aria-label="删除" @click="removeRow(index)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                </button>
              </div>
            </div>
            <p v-else class="state-text">还没有金手指，添加后玩家可在游戏内手动开启。</p>

            <button class="btn btn-sm add-btn" type="button" :disabled="rows.length >= maxCheats" @click="addRow">+ 添加一条</button>

            <p class="tips">
              金手指代码由游戏核心解析，格式取决于核心：NES 用 Nestopia/FCEUmm（Game Genie 如 SXIOPO、原始码如 00A0:FF），SFC 用 Snes9x，GBA 用 mGBA，MD 用 Genesis Plus GX，PS1 用 PCSX-ReARMed。未实现金手指的街机核心（FBNeo / MAME 2003-Plus）会忽略代码。
            </p>
          </template>

          <p v-if="error" class="err">{{ error }}</p>
        </div>

        <footer class="df">
          <button class="btn btn-sm" type="button" :disabled="saving" @click="$emit('close')">取消</button>
          <button class="btn btn-primary btn-sm" type="button" :disabled="saving || loading" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { getPlatform } from '../constants/platforms.js'
import { coreDisplayName } from '../constants/cores.js'

const props = defineProps({
  rom: { type: Object, required: true },
  maxCheats: { type: Number, default: 32 },
})
const emit = defineEmits(['close', 'saved'])

const rows = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
let seq = 0

const platformLabel = computed(() => {
  const platform = getPlatform(props.rom.platform)
  return platform?.displayName || props.rom.platform || ''
})
const coreLabel = computed(() => {
  const core = props.rom.defaultCore || getPlatform(props.rom.platform)?.cores?.[0]
  return coreDisplayName[core] || core || '—'
})

function addRow() {
  rows.value.push({ key: `n${seq++}`, label: '', code: '' })
}

function removeRow(index) {
  rows.value.splice(index, 1)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { cheats } = await api.adminRomCheats(props.rom.id)
    rows.value = (cheats || []).map((entry) => ({
      key: `s${entry.id}`,
      label: entry.desc || '',
      code: entry.code || '',
    }))
  } catch (err) {
    error.value = err?.message || '读取失败'
  } finally {
    loading.value = false
  }
}

async function save() {
  const payload = rows.value
    .map((row) => ({ desc: row.label.trim(), code: row.code.trim() }))
    .filter((row) => row.code)
  saving.value = true
  error.value = ''
  try {
    const { cheats } = await api.adminRomCheatsSave(props.rom.id, payload)
    emit('saved', cheats || [])
  } catch (err) {
    error.value = err?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.mask {
  position: fixed; inset: 0;
  background: rgba(94, 58, 84, 0.30);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  box-shadow: var(--clay-lg);
  animation: popIn 0.2s var(--ease-spring);
}
@keyframes popIn { from { opacity: 0; transform: translateY(8px) scaleX(0.97) scaleY(0.95); } to { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); } }

.dh {
  flex: 0 0 auto;
  padding: 22px 58px 12px 24px;
  background: var(--clay-surface-flat);
}
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }
.dlg-close { position: absolute; top: 14px; right: 14px; z-index: 2; }

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rom-card {
  padding: 14px 16px;
  background: var(--clay-inset-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--clay-in-sm);
}
.rom-name { font-size: 14px; font-weight: 900; color: var(--text-primary); margin-bottom: 4px; }
.rom-meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-secondary); }

.list { display: flex; flex-direction: column; gap: 8px; }
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.idx {
  flex-shrink: 0;
  width: 24px;
  text-align: center;
  font-size: 12px;
  font-weight: 900;
  color: var(--text-tertiary);
}
.fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.input { height: 40px; }
.cheat-label { font-size: 13px; }
.cheat-code { font-family: ui-monospace, 'SF Mono', monospace; }

.del { flex-shrink: 0; background: var(--clay-surface-alt); }

.add-btn { align-self: flex-start; }

.state-text { margin: 0; font-size: 12px; color: var(--text-tertiary); }

.tips {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-tertiary);
}

.err {
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--error) 12%, #fff);
  color: var(--error);
  font-size: 12px;
  text-align: center;
}

.df {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 24px 20px;
  background: var(--clay-surface-flat);
}
</style>
