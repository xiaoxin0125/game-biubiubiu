<template>
  <!-- 不做 Teleport：全屏的元素是整个播放页（.player-page），原生全屏只有它内部的内容
       会被渲染 —— 挂在 body 上的弹窗在全屏里点了也出不来；iOS / 微信的 CSS 伪全屏也会把
       body 上的弹窗压在播放页（z-index 500）下面。弹窗留在播放页里，三种全屏都正常，
       整页被 CSS 转成横版时也跟着一起转，方向才对。 -->
  <div class="mask" @click.self="$emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="金手指">
      <header class="dh">
        <h3>金手指</h3>
        <span v-if="coreName" class="core-chip">{{ coreName }}</span>
        <button class="btn btn-ghost btn-icon btn-sm dlg-close" @click="$emit('close')" aria-label="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </header>

      <div class="dialog-body">
        <p v-if="!supported" class="warn">
          当前核心 <b>{{ coreName || '未知' }}</b> 不支持金手指，代码不会生效。
        </p>

        <section v-if="builtinCheats.length" class="group">
          <h4 class="group-title">游戏内置</h4>
          <div class="list">
            <div v-for="item in builtinCheats" :key="item.id" class="row" :class="{ off: !item.enabled }">
              <button
                class="switch"
                :class="{ on: item.enabled }"
                :aria-label="item.enabled ? '关闭该代码' : '启用该代码'"
                @click="$emit('toggle', item.id)"
              >{{ item.enabled ? '开' : '关' }}</button>
              <div class="fields">
                <span class="label-text">{{ item.desc || '金手指' }}</span>
                <code class="code-text">{{ item.code }}</code>
              </div>
            </div>
          </div>
        </section>

        <section class="group">
          <h4 class="group-title">我的代码</h4>
          <div v-if="cheats.length" class="list">
            <div v-for="item in cheats" :key="item.id" class="row" :class="{ off: !item.enabled }">
              <button
                class="switch"
                :class="{ on: item.enabled }"
                :aria-label="item.enabled ? '关闭该代码' : '启用该代码'"
                @click="$emit('toggle', item.id)"
              >{{ item.enabled ? '开' : '关' }}</button>
              <div class="fields">
                <input
                  class="input cheat-code"
                  :value="item.code"
                  spellcheck="false"
                  placeholder="代码"
                  @change="$emit('update', item.id, { code: $event.target.value })"
                />
                <input
                  class="input cheat-desc"
                  :value="item.desc"
                  maxlength="40"
                  placeholder="备注（可选）"
                  @change="$emit('update', item.id, { desc: $event.target.value })"
                />
              </div>
              <button class="btn btn-ghost btn-icon btn-sm del" aria-label="删除" @click="$emit('remove', item.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
            </div>
          </div>
          <p v-else class="empty">还没有自己的代码</p>
        </section>

        <form class="add" @submit.prevent="submit">
          <div class="add-fields">
            <input v-model="draftCode" class="input cheat-code" spellcheck="false" placeholder="输入代码" />
            <input v-model="draftDesc" class="input cheat-desc" maxlength="40" placeholder="备注（可选）" />
          </div>
          <button type="submit" class="btn btn-primary btn-sm" :disabled="!draftCode.trim() || cheats.length >= maxCheats">
            添加并应用
          </button>
        </form>
        <p v-if="error" class="err">{{ error }}</p>
      </div>

      <footer class="df">
        <button v-if="cheats.length" class="btn btn-sm" type="button" @click="$emit('clear')">清空我的代码</button>
        <button class="btn btn-sm" type="button" @click="$emit('close')">关闭</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  // Admin-configured codes: the player only toggles them.
  builtinCheats: { type: Array, default: () => [] },
  // Codes the player added on this device.
  cheats: { type: Array, default: () => [] },
  coreName: { type: String, default: '' },
  supported: { type: Boolean, default: true },
  maxCheats: { type: Number, default: 32 },
})
const emit = defineEmits(['close', 'add', 'update', 'remove', 'toggle', 'clear'])

const draftCode = ref('')
const draftDesc = ref('')
const error = ref('')

function submit() {
  const code = draftCode.value.trim()
  if (!code) return
  if (props.cheats.length >= props.maxCheats) {
    error.value = `最多 ${props.maxCheats} 条金手指`
    return
  }
  error.value = ''
  emit('add', { code, desc: draftDesc.value })
  draftCode.value = ''
  draftDesc.value = ''
}
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
  max-width: 468px;
  /* 按遮罩（铺满播放页）算高度，不用 90vh：全屏后整页被 CSS 转成横版时，
     容器本地高度是 100vw，vh 还是竖屏的高度，弹窗会高过屏幕。
     代码多时由 .dialog-body 自己滚动，不会顶出画面。 */
  max-height: 100%;
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px 58px 12px 24px;
  background: var(--clay-surface-flat);
}
.dh h3 { margin: 0; font-size: 18px; font-weight: 900; color: var(--text-primary); }
.core-chip {
  padding: 4px 10px;
  border-radius: var(--r-pill);
  background: var(--clay-lilac);
  color: var(--text-lilac);
  font-size: 11px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
}
.dlg-close { position: absolute; top: 14px; right: 14px; z-index: 2; }

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.warn {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--warn) 12%, #fff);
  box-shadow: var(--clay-in-sm);
  color: var(--warn);
  font-size: 12px;
  line-height: 1.6;
}
.warn b { font-weight: 900; }

.group { display: flex; flex-direction: column; gap: 8px; }
.group-title {
  margin: 0;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

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
.row.off .fields { opacity: 0.55; }
.fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.label-text { font-size: 13px; font-weight: 900; color: var(--text-primary); }
.code-text {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.switch {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-surface-alt);
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--clay-sm);
  transition: transform var(--t-fast) var(--clay-ease), background var(--t-fast) var(--clay-ease), color var(--t-fast) var(--clay-ease);
}
.switch.on { background: var(--clay-mint); color: var(--text-mint); }
.switch:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.switch:focus-visible { outline: none; box-shadow: var(--clay-focus); }

.input { height: 40px; }
/* 播放页整页关掉了文本选中（长按不出菜单），但金手指代码要能选中复制 */
.input,
.code-text {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
.cheat-code { font-family: ui-monospace, 'SF Mono', monospace; }
.cheat-desc { font-size: 12px; }

.del { flex-shrink: 0; background: var(--clay-surface-alt); }

.empty {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.add { display: flex; flex-direction: column; gap: 8px; }
.add-fields { display: flex; flex-direction: column; gap: 8px; }

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
