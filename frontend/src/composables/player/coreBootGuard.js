// Nostalgist's default quit() only logs non-zero exits. RetroArch also falls
// back to its menu when retro_load_game() returns false. Neither is a successful
// game boot, even if Nostalgist.start() resolves and a canvas has been created.
export function createCoreBootGuard(core) {
  let failure = null
  const fail = (reason) => {
    failure ||= reason instanceof Error ? reason : new Error(String(reason))
    return failure
  }

  return {
    emscriptenModule: {
      printErr(...args) {
        const line = args.join(' ')
        if (/\[ERROR\].*\[Content\].*Failed to load content/i.test(line)) {
          fail(`${core} 核心无法加载此 ROM，请检查游戏格式、配套文件和核心兼容性。`)
        }
        console.error(...args)
      },
      onAbort(reason) {
        fail(`${core} 核心启动中止：${reason || 'WebAssembly 执行失败'}`)
      },
      quit(status, reason) {
        if (status) throw fail(reason || `${core} 核心异常退出（${status}）`)
      },
    },
    onLaunch() {
      if (failure) throw failure
    },
  }
}
