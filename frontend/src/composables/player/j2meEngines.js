// J2ME 的类库档位（运行时里叫 enginemode）。
//
// 运行时自带三个类库，能启动的游戏范围不一样：默认那个兼容库覆盖面最广，另外两档
// 有的游戏只有它们才能起来（缺 MIDP 2.0 特性时最典型）。哪一档合适只有游戏自己
// 知道，所以播放页在开局前让玩家选一次（弹窗见 components/J2meEngineDialog.vue），
// 选过的按 ROM 记在本地，下次开局预选那一档。
//
// 三个文件名里的 classedjarname 与运行时取类库的方式有关：运行时按
// `config.enginemode.split('-')[1]` 拼成 `java/<那一半>`（见 j2meCore.js 与
// INTEGRATION.md），所以这里的 id 必须保持完整文件名。
import { J2ME_DEFAULT_ENGINE, J2ME_ENGINES } from './j2meCore.js'

export const J2ME_ENGINE_CHOICES = Object.freeze([
  {
    id: 'enginemode1-classesold.jar',
    label: '兼容库（默认）',
    note: '能启动的游戏最多。大部分游戏、包括《仙剑奇侠传》这类老 MIDlet 都在这一档。',
  },
  {
    id: 'enginemode2-classes2.jar',
    label: 'MIDP 2.0 库',
    note: '游戏起不来、或提示缺少 MIDP 2.0 特性（多媒体、3D、完整联网）时换这一档。',
  },
  {
    id: 'enginemode3-classes.jar',
    label: '标准库',
    note: '另一档类库（classes.jar）。前两档都不行时再试它。',
  },
])

const STORAGE_PREFIX = 'j2me:engine:'

/** 播放页只在 J2ME 平台上要这套东西。 */
export function isJ2mePlatform(platform) {
  return platform === 'j2me'
}

/** 这个名字（label）给玩家看：overlay 上的「兼容库」标签、弹窗里的选中项。 */
export function j2meEngineLabel(engine) {
  const choice = J2ME_ENGINE_CHOICES.find((item) => item.id === engine)
  return choice ? choice.label : '兼容库（默认）'
}

/**
 * 这个 ROM 上次选的类库。玩家可能清过站点数据，选项也可能随着运行时更新而变，
 * 所以读回来一律要现校验：不合法就回到默认那一档。
 */
export function readJ2meEngine(romId) {
  if (romId == null) return J2ME_DEFAULT_ENGINE
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + romId)
    return J2ME_ENGINES.has(saved) ? saved : J2ME_DEFAULT_ENGINE
  } catch {
    return J2ME_DEFAULT_ENGINE
  }
}

export function writeJ2meEngine(romId, engine) {
  if (romId == null || !J2ME_ENGINES.has(engine)) return
  try { localStorage.setItem(STORAGE_PREFIX + romId, engine) } catch { /* 无痕模式：不记就是 */ }
}
