<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="创建房间">
        <header class="dh">
          <h3>创建房间</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <form @submit.prevent="submit" class="form">
            <div>
              <label class="label">房间名称</label>
              <input v-model.trim="name" class="input" placeholder="例如: 拳皇 97 开黑" maxlength="60" required />
            </div>

            <div>
              <label class="label">游戏 ROM</label>
              <div class="rom-search">
                <input v-model="romQuery" class="input" placeholder="搜索你的 ROM 或公开 ROM…" />
                <div v-if="filteredRoms.length" class="rom-list">
                  <button
                    v-for="r in filteredRoms.slice(0, 8)"
                    :key="r.id"
                    type="button"
                    class="rom-row"
                    :class="{ selected: selectedRom?.id === r.id }"
                    @click="selectedRom = r"
                  >
                    <span class="rt">{{ r.title }}</span>
                    <span class="rp">{{ r.platform }}</span>
                  </button>
                </div>
                <div v-else class="rom-empty">{{ roms.length ? '没有匹配结果' : '你还没有 ROM，先去上传或让管理员公开一些 ROM' }}</div>
              </div>
            </div>

            <label class="opt">
              <div class="sw">
                <input type="checkbox" v-model="isPublic" />
                <span class="track"><span class="thumb"></span></span>
              </div>
              <div class="opt-text">
                <div class="pt">房间公开</div>
                <div class="ps">公开房间会显示在对战大厅里</div>
              </div>
            </label>
            <label class="opt">
              <div class="sw">
                <input type="checkbox" v-model="allowPlay" />
                <span class="track"><span class="thumb"></span></span>
              </div>
              <div class="opt-text">
                <div class="pt">允许对战</div>
                <div class="ps">关闭后登录玩家不能操作，游客试玩由站点设置控制</div>
              </div>
            </label>

            <div>
              <label class="label">房间密码（可选）</label>
              <input v-model="password" class="input" type="password" placeholder="留空表示不需要密码" maxlength="64" />
            </div>

            <div v-if="error" class="err">{{ error }}</div>

            <footer class="df">
              <button type="button" class="btn" :disabled="busy" @click="$emit('close')">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="busy || !name || !selectedRom">
                {{ busy ? '创建中…' : '创建房间' }}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/client.js'

const emit = defineEmits(['close', 'created'])

const roms = ref([])
const romQuery = ref('')
const selectedRom = ref(null)
const name = ref('')
const isPublic = ref(true)
const allowPlay = ref(true)
const password = ref('')
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    const [mine, pub] = await Promise.all([
      api.romsMine().catch(() => ({ roms: [] })),
      api.romsPublic().catch(() => ({ roms: [] })),
    ])
    const merged = [...mine.roms, ...pub.roms]
    const seen = new Set()
    roms.value = merged.filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
  } catch {}
})

const filteredRoms = computed(() => {
  const q = romQuery.value.trim().toLowerCase()
  if (!q) return roms.value
  return roms.value.filter((r) =>
    r.title.toLowerCase().includes(q) || r.platform.toLowerCase().includes(q),
  )
})

async function submit() {
  error.value = ''
  if (!selectedRom.value) { error.value = '请选择一个 ROM'; return }
  busy.value = true
  try {
    const room = await api.roomCreate({
      name: name.value,
      romId: selectedRom.value.id,
      isPublic: isPublic.value,
      allowPlay: allowPlay.value,
      password: password.value || undefined,
    })
    if (room.roomTicket) api.roomStoreTicket(room.code, room.roomTicket)
    emit('created', room)
  } catch (err) {
    error.value = err?.message || '创建失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.mask {
  position: fixed; inset: 0;
  background: rgba(94, 58, 84, 0.28);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 标题栏不参与滚动，关闭按钮固定在弹窗右上角；只有 .dialog-body 滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow: hidden;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-2xl);
  animation: popIn 0.2s var(--ease-spring);

  box-shadow: var(--clay-lg);
}
@keyframes popIn { from { opacity: 0; transform: translateY(10px) scaleX(0.96) scaleY(0.94); } to { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); } }

.dh {
  flex: 0 0 auto;
  padding: 22px 58px 12px 24px;
  background: var(--clay-surface-flat);
}
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }

.dlg-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 24px 22px;
}

.form { display: flex; flex-direction: column; gap: 14px; }

.rom-search { display: flex; flex-direction: column; gap: 8px; }
.rom-list {
  max-height: 220px;
  overflow-y: auto;
  border: 0;
  padding: 6px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.rom-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border: none;
  border-bottom: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: var(--clay-xs);
  transition: background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease), transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.rom-row:last-child { border-bottom: none; }
.rom-row:hover { background: var(--clay-surface-alt); transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.rom-row:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.rom-row.selected { background: var(--clay-primary-grad); color: #fff; box-shadow: var(--clay-sm); }
.rom-row.selected .rp { color: rgba(255, 255, 255, 0.78); }
.rt { font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp { color: var(--text-tertiary); font-size: 11px; margin-left: 8px; flex-shrink: 0; font-weight: 900; }
.rom-empty {
  padding: 14px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  border: 0;
  border-radius: var(--r-md);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}

.opt {
  display: flex;
  gap: 14px;
  align-items: center;
  cursor: pointer;
  padding: 16px 18px;
  border: 0;
  border-radius: var(--r-lg);
  /* 面板是白色粘土卡，开关行用糖果粉卡片区分层次 */
  background: var(--clay-pink-soft);
  box-shadow: var(--clay-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.opt:hover { transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.opt:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.sw { position: relative; flex-shrink: 0; }
.sw input { opacity: 0; position: absolute; width: 100%; height: 100%; top: 0; left: 0; margin: 0; cursor: pointer; }
.track {
  position: relative; display: block;
  width: 44px; height: 26px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  border: 0;
  box-shadow: var(--clay-in-sm);
  transition: background var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.thumb {
  position: absolute; top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: var(--clay-primary-grad);
  border-radius: var(--r-pill);
  box-shadow: var(--clay-xs);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.sw input:checked + .track { background: var(--clay-primary-grad); box-shadow: var(--clay-sm); }
.sw input:checked + .track .thumb { background: var(--clay-surface-flat); transform: translateX(18px); }
.sw:active .thumb { transform: scaleX(1.08) scaleY(0.9); }
.sw input:checked:active + .track .thumb { transform: translateX(18px) scaleX(1.08) scaleY(0.9); }
.pt { font-size: 14px; font-weight: 900; color: var(--clay-ink); }
.ps { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

.err {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--error) 12%, #fff);
  border: 0;
  box-shadow: var(--clay-in-sm);
  color: var(--error);
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}
.df { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
</style>
