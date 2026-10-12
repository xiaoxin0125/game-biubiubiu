import { test } from 'node:test'

// 冒烟测试：这些模块在启动时就会被 import，任何拼错的导入或模块级错误都会让
// 服务起不来。这里在测试进程里把它们全部加载一遍。
//
// 注意：**不要**在这里调用任何会真的查数据库的函数（例如 getRuntimeConfig）。
// mysql2 连接池一旦建链就会让 node --test 迟迟不退出——测试必须保持能自己结束。

const MODULES = [
  '../server/config.js',
  '../server/cores-release.js',
  '../server/http-utils.js',
  '../server/runtime-config.js',
  '../server/remote-storage.js',
  '../server/routes/cores.js',
  '../server/routes/bios.js',
  '../server/routes/roms.js',
  '../server/routes/settings.js',
]

// 关键导出：路由挂载、运行时配置读取都靠它们，名字错了要到线上才发现。
const REQUIRED_EXPORTS = {
  '../server/routes/cores.js': ['coreRoutes'],
  '../server/routes/bios.js': ['biosRoutes'],
  '../server/routes/roms.js': ['romRoutes'],
  '../server/routes/settings.js': ['publicSettingsRoutes', 'adminSettingsRoutes', 'getSetting'],
  '../server/runtime-config.js': ['getRuntimeConfig'],
  '../server/remote-storage.js': ['buildRemoteDownloadUrl', 'remoteOpenFile', 'remoteUpload'],
  '../server/cores-release.js': ['loadCoreRelease', 'resolveCoreArtifact', 'publicCoresBaseUrl'],
  '../server/http-utils.js': ['entityTagFor', 'ifNoneMatchMatches'],
}

for (const path of MODULES) {
  test(`模块可以正常加载：${path.replace('../', '')}`, async () => {
    const mod = await import(path)
    for (const name of REQUIRED_EXPORTS[path] || []) {
      const value = mod[name]
      // 既可能是函数，也可能是一个 Hono 实例（有 request/fetch 方法）
      const usable = typeof value === 'function'
        || (value && typeof value.request === 'function')
        || (value && typeof value.fetch === 'function')
      if (!usable) throw new Error(`${name} 未导出或不是可用的路由/函数`)
    }
  })
}

test('核心地址的哨兵值不会出现在下发给前端的配置里', async () => {
  const { normalizeCoresBaseUrl, publicCoresBaseUrl } = await import('../server/cores-release.js')
  // 'none' 只是后台/环境变量里的开关语义，前端看到的必须是空字符串。
  if (publicCoresBaseUrl(normalizeCoresBaseUrl('none')) !== '') throw new Error('哨兵值泄漏到前端配置里了')
  if (publicCoresBaseUrl(normalizeCoresBaseUrl('https://a.example.com/x')) !== 'https://a.example.com/x') {
    throw new Error('远端地址被错误改写')
  }
})
