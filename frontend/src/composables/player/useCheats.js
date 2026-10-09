import { computed, ref, watch } from 'vue'
import { api } from '../../api/client.js'
import { coreSupportsCheats } from '../../constants/cheats.js'

// Cheats come from two places:
//   * 内置 — an admin configured them for this ROM (read-only for players, they
//     only choose which ones are on),
//   * 我的代码 — added by the player in the dialog and kept in localStorage.
// Both are pushed into the running core through the portal. Room guests never
// own an emulator, so they get no cheats.
const MAX_CHEATS = 32
const MAX_CODE_LENGTH = 120
const MAX_DESC_LENGTH = 40

const customKey = (romId) => (romId ? `cheats:${romId}` : null)
const builtinKey = (romId) => (romId ? `cheat-enabled:${romId}` : null)

function normalizeCustom(entry) {
  if (!entry || typeof entry !== 'object') return null
  const code = String(entry.code || '').trim().slice(0, MAX_CODE_LENGTH)
  if (!code) return null
  return {
    id: String(entry.id || `c${Math.random().toString(36).slice(2, 9)}`),
    code,
    desc: String(entry.desc || '').trim().slice(0, MAX_DESC_LENGTH),
    enabled: entry.enabled !== false,
  }
}

function readJson(key, fallback) {
  if (!key) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch (err) {
    console.warn('[cheats] failed to read local cheats', err)
    return fallback
  }
}

function writeJson(key, value) {
  if (!key) return
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('[cheats] failed to persist local cheats', err)
  }
}

export function useCheats({ romMeta, platformInfo, portalRef, booted, isGuestMode, showToast }) {
  const builtinCheats = ref([])
  const cheats = ref([])
  // Guards persistence while the built-in list is (re)loaded, see loadBuiltin().
  let builtinLoading = false

  const storageKey = computed(() => customKey(romMeta.value?.id))
  const builtinStorageKey = computed(() => builtinKey(romMeta.value?.id))
  const core = computed(() => platformInfo.value?.core || '')
  const cheatSupported = computed(() => coreSupportsCheats(core.value))
  const activeCheats = computed(() => [...builtinCheats.value, ...cheats.value].filter((item) => item.enabled))

  function loadCustom() {
    const parsed = readJson(storageKey.value, [])
    // Older builds stored a plain array; keep reading those stores.
    const list = Array.isArray(parsed) ? parsed : parsed?.custom
    cheats.value = Array.isArray(list) ? list.map(normalizeCustom).filter(Boolean) : []
  }

  function persistCustom() {
    writeJson(storageKey.value, cheats.value.length ? { custom: cheats.value } : null)
  }

  async function loadBuiltin() {
    const romId = romMeta.value?.id
    // Dropping the list switches the core over to "no built-in codes" right
    // away, but the clearing assignment must not overwrite the stored toggles
    // of the ROM we are leaving (or the one we are loading).
    builtinLoading = true
    builtinCheats.value = []
    try {
      if (!romId || isGuestMode.value) return
      let list = []
      try {
        list = (await api.romCheats(romId))?.cheats || []
      } catch (err) {
        // Private/unavailable ROMs just have no built-in codes.
        list = []
      }
      if (romMeta.value?.id !== romId) return
      // Preferences are keyed by the code text (not the row id) so a player's
      // toggle survives an admin re-saving the list, which recreates the rows.
      const enabledMap = readJson(builtinStorageKey.value, {}) || {}
      builtinCheats.value = list.map((entry) => {
        const code = String(entry.code || '').trim()
        return {
          id: `b:${entry.id}`,
          desc: String(entry.desc || '').slice(0, MAX_DESC_LENGTH),
          code,
          enabled: enabledMap[code] === true,
        }
      }).filter((entry) => entry.code)
    } finally {
      builtinLoading = false
    }
  }

  function persistBuiltinPrefs() {
    if (builtinLoading) return
    const enabledMap = {}
    for (const item of builtinCheats.value) {
      if (item.enabled && item.code) enabledMap[item.code] = true
    }
    writeJson(builtinStorageKey.value, Object.keys(enabledMap).length ? enabledMap : null)
  }

  // Hand the whole list to the core: it replaces whatever was applied before,
  // so toggling/adding/removing a code takes effect without a reboot.
  function apply() {
    const portal = portalRef.value
    if (!portal?.syncCheats) return false
    return portal.syncCheats(activeCheats.value) !== false
  }

  function addCheat({ code, desc } = {}) {
    const entry = normalizeCustom({ code, desc, enabled: true })
    if (!entry) return null
    if (cheats.value.length >= MAX_CHEATS) {
      showToast?.(`最多 ${MAX_CHEATS} 条金手指`)
      return null
    }
    cheats.value = [...cheats.value, entry]
    return entry
  }

  function updateCheat(id, patch = {}) {
    cheats.value = cheats.value.map((item) => {
      if (item.id !== id) return item
      const next = { ...item, ...patch }
      if (patch.code !== undefined) next.code = String(patch.code || '').trim().slice(0, MAX_CODE_LENGTH)
      if (patch.desc !== undefined) next.desc = String(patch.desc || '').trim().slice(0, MAX_DESC_LENGTH)
      if (patch.enabled !== undefined) next.enabled = !!patch.enabled
      return next
    })
  }

  function removeCheat(id) {
    cheats.value = cheats.value.filter((item) => item.id !== id)
  }

  // Works for both lists — the dialog only knows the entry id.
  function toggleCheat(id, enabled) {
    if (String(id).startsWith('b:')) {
      builtinCheats.value = builtinCheats.value.map((item) => (
        item.id === id ? { ...item, enabled: enabled === undefined ? !item.enabled : !!enabled } : item
      ))
      return
    }
    const current = cheats.value.find((item) => item.id === id)
    updateCheat(id, { enabled: enabled === undefined ? !current?.enabled : enabled })
  }

  function clearCheats() {
    cheats.value = []
  }

  // Switching games re-reads both lists; any edit is persisted and re-applied
  // to the running core.
  watch(storageKey, loadCustom, { immediate: true })
  watch(() => romMeta.value?.id, loadBuiltin, { immediate: true })
  watch(cheats, () => { persistCustom(); apply() }, { deep: true })
  watch(builtinCheats, () => { persistBuiltinPrefs(); apply() }, { deep: true })
  watch(booted, (value) => { if (value) apply() })

  return {
    builtinCheats,
    cheats,
    core,
    cheatSupported,
    maxCheats: MAX_CHEATS,
    addCheat,
    updateCheat,
    removeCheat,
    toggleCheat,
    clearCheats,
    applyCheats: apply,
  }
}
