// J2ME 的游戏语言（运行时侧就是 MIDP 的 microedition.locale）。
//
// 游戏挑语言包的方式是拿设备语言去拼资源名（`/lang.<值>`），差一个后缀就用不上 ——
// 「蹦球传说」这类老 MIDlet 只认 zh-CN / zh-HK，而浏览器的 navigator.language 会报
// zh-Hans-CN、zh-SG 这些变体，于是中文手机也跑英文。运行时侧的 siteLocale 补丁
// （见 frontend/scripts/apply-j2me-patches.mjs）负责把中文变体归到游戏认的名字；
// 这里再给玩家一个手动覆盖：开局弹窗里选一次，记在本地。
//
// 语言是玩家自己的偏好（不是某个 ROM 的属性），所以跨 ROM 共用一个值。
export const J2ME_LANGUAGE_CHOICES = Object.freeze([
  {
    id: 'auto',
    label: '自动（跟随浏览器）',
    note: '按浏览器的语言启动；中文的写法（zh-CN、zh-Hans-CN、zh-SG 等）都会归到游戏认的简体中文。',
  },
  {
    id: 'zh-CN',
    label: '简体中文',
    note: '按「简体中文」启动。这个语言包缺了哪门语言，游戏自己会退回英文。',
  },
  {
    id: 'zh-HK',
    label: '繁体中文',
    note: '按「繁体中文」启动（港台语言包）。游戏没有繁体包时会退回英文。',
  },
  {
    id: 'en-US',
    label: 'English',
    note: '按英文启动。',
  },
])

export const J2ME_DEFAULT_LANGUAGE = 'auto'

const STORAGE_KEY = 'j2me:language'

/** 传给运行时的 language 参数：auto 什么都不传，由运行时自己看浏览器语言。 */
export function j2meLanguageParam(language) {
  return language && language !== J2ME_DEFAULT_LANGUAGE ? language : null
}

export function isJ2meLanguage(language) {
  return J2ME_LANGUAGE_CHOICES.some((choice) => choice.id === language)
}

/**
 * 玩家上次选的语言。跟类库一样，读回来一律现校验：选项可能随版本变化，
 * 清过站点数据也读不到。
 */
export function readJ2meLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return J2ME_LANGUAGE_CHOICES.some((choice) => choice.id === saved) ? saved : J2ME_DEFAULT_LANGUAGE
  } catch {
    return J2ME_DEFAULT_LANGUAGE
  }
}

export function writeJ2meLanguage(language) {
  if (!J2ME_LANGUAGE_CHOICES.some((choice) => choice.id === language)) return
  try { localStorage.setItem(STORAGE_KEY, language) } catch { /* 无痕模式：不记就是 */ }
}

/** 给玩家看的名字（弹窗里的选中项、排查问题时看得懂）。 */
export function j2meLanguageLabel(language) {
  const choice = J2ME_LANGUAGE_CHOICES.find((item) => item.id === language)
  return choice ? choice.label : J2ME_LANGUAGE_CHOICES[0].label
}
