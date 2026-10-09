<template>
  <Teleport to="body">
    <div class="mask">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="编辑房间">
        <header class="dh">
          <h3>编辑房间</h3>
          <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="dialog-body">
          <form @submit.prevent="submit" class="form">
            <div class="room-hint">
              房间码 <span class="code">{{ room.code }}</span>
            </div>
            <div>
              <label class="label">房间名称</label>
              <input v-model.trim="name" class="input" maxlength="60" required />
            </div>

            <div>
              <label class="label">游戏 ROM</label>
              <div class="rom-search">
                <input v-model="romQuery" class="input" placeholder="搜索 ROM…" />
                <div v-if="filteredRoms.length" class="rom-list">
                  <button
                    v-for="r in filteredRoms.slice(0, 8)"
                    :key="r.id"
                    type="button"
                    class="rom-row"
                    :class="{ selected: selectedRomId === r.id }"
                    @click="selectedRomId = r.id"
                  >
                    <span class="rt">{{ r.title }}</span>
                    <span class="rp">{{ r.platform }}</span>
                  </button>
                </div>
                <div v-else class="rom-empty">没有匹配结果</div>
                <div v-if="romChanged" class="rom-warn">
                  切换游戏后，当前连接的访客会被断开，需要重新加入房间。
                </div>
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

            <div class="pw-area">
              <label class="label">密码</label>
              <div class="pw-state" v-if="room.hasPassword && !clearPw">
                <span class="pw-badge">已设密码</span>
                <button type="button" class="btn btn-sm btn-ghost" @click="clearPw = true">清除密码</button>
              </div>
              <div v-else-if="clearPw" class="pw-state pw-cleared">
                <span class="pw-badge pw-badge-clear">将移除密码</span>
                <button type="button" class="btn btn-sm btn-ghost" @click="clearPw = false">取消</button>
              </div>
              <input v-model="password" class="input" type="password"
                     :placeholder="room.hasPassword ? '输入新密码则替换，留空不改' : '留空表示无密码'"
                     maxlength="64" />
            </div>

            <div v-if="error" class="err">{{ error }}</div>

            <footer class="df">
              <button type="button" class="btn" :disabled="busy" @click="$emit('close')">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="busy || !name || !selectedRomId">
                {{ busy ? '保存中…' : '保存' }}
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

const props = defineProps({
  room: { type: Object, required: true },
})
const emit = defineEmits(['close', 'updated'])

const name = ref(props.room.name)
const isPublic = ref(props.room.isPublic !== false)
const allowPlay = ref(props.room.allowPlay !== false)
const password = ref('')
const clearPw = ref(false)
const error = ref('')
const busy = ref(false)

const roms = ref([])
const romQuery = ref('')
const selectedRomId = ref(props.room.romId)

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
    if (!roms.value.some((r) => r.id === props.room.romId) && props.room.romTitle) {
      roms.value.unshift({
        id: props.room.romId,
        title: props.room.romTitle,
        platform: props.room.romPlatform || '',
      })
    }
  } catch {}
})

const filteredRoms = computed(() => {
  const q = romQuery.value.trim().toLowerCase()
  if (!q) return roms.value
  return roms.value.filter((r) =>
    r.title.toLowerCase().includes(q) || r.platform.toLowerCase().includes(q),
  )
})
const romChanged = computed(() => selectedRomId.value !== props.room.romId)

async function submit() {
  error.value = ''
  busy.value = true
  const patch = {}
  if (name.value !== props.room.name) patch.name = name.value
  if (isPublic.value !== props.room.isPublic) patch.isPublic = isPublic.value
  if (allowPlay.value !== (props.room.allowPlay !== false)) patch.allowPlay = allowPlay.value
  if (selectedRomId.value && selectedRomId.value !== props.room.romId) patch.romId = selectedRomId.value
  if (clearPw.value) patch.password = null
  else if (password.value) patch.password = password.value

  try {
    if (Object.keys(patch).length === 0) {
      emit('close')
      return
    }
    const updated = await api.roomUpdate(props.room.code, patch)
    if (updated.roomTicket) api.roomStoreTicket(props.room.code, updated.roomTicket)
    emit('updated', updated)
  } catch (err) {
    error.value = err?.message || '保存失败'
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
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 标题栏不参与滚动，关闭按钮固定在弹窗右上角；只有 .dialog-body 滚动 */
.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 440px;
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

.room-hint {
  padding: 12px 16px;
  border-radius: var(--r-md);
  background: var(--clay-surface-flat);
  border: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.room-hint .code {
  font-family: var(--mono-stack);
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: 0.08em;
  margin-left: 4px;
}

.rom-search { display: flex; flex-direction: column; gap: 8px; }
.rom-list {
  max-height: 200px;
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
.rom-warn {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--clay-surface-flat);
  border: 0;
  color: var(--warn);
  font-size: 12px;
  font-weight: 800;
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

.pw-area { display: flex; flex-direction: column; gap: 8px; }
.pw-state { display: flex; align-items: center; gap: 8px; }
.pw-badge {
  display: inline-flex; align-items: center;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  font-size: 11px; font-weight: 900;
  background: var(--clay-surface-flat);
  border: 0;
  color: var(--success);
}
.pw-badge-clear { color: var(--warn); }

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
