import { ref, computed, watch } from 'vue'
import { api } from '../api/client.js'

const DEFAULTS = {
  siteTitle: 'Games Online',
  siteSubtitle: '共赴复古联机之境',
  netplayEnabled: true,
  guestPlayEnabled: false,
  userUploadEnabled: true,
  // 远端存储（大 ROM 转存）是否已在站点设置里配置好
  remoteUploadAvailable: false,
}

const settings = ref({ ...DEFAULTS })
const loaded = ref(false)
let primed = false

function normalize(raw) {
  const out = { ...DEFAULTS, ...raw }
  // coerce "1"/"0" → boolean
  for (const key of ['netplayEnabled', 'guestPlayEnabled', 'userUploadEnabled', 'remoteUploadAvailable']) {
    if (typeof out[key] === 'string') out[key] = out[key] === '1'
  }
  return out
}

async function refresh() {
  try {
    const data = await api.settings()
    if (data && typeof data === 'object') settings.value = normalize(data)
  } catch {}
  finally { loaded.value = true }
}

watch(
  () => settings.value.siteTitle,
  (title) => {
    if (typeof document !== 'undefined' && title) document.title = title
  },
  { immediate: true },
)

export function useSettings() {
  if (!primed) {
    primed = true
    refresh()
  }
  return {
    settings: computed(() => settings.value),
    loaded: computed(() => loaded.value),
    refresh,
    updateLocal(patch) {
      settings.value = normalize({ ...settings.value, ...patch })
    },
  }
}
