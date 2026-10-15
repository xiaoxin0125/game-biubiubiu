# Opera WebAssembly 构建与验证

## 原因与修复范围

原 Opera 浏览器核心在 `GET_SYSTEM_DIRECTORY` 后立即触发 `WebAssembly.RuntimeError: unreachable`，尚未打开 BIOS 或 CHD。Opera 的静态链接构建不编译自身的 libretro-common 实现，却使用其旧头文件：例如 `fill_pathname_join` 声明返回 `void`，RetroArch 1.22.2 的实现返回 `size_t`。WebAssembly 函数签名不一致会产生陷阱，不能通过换 BIOS 或延长启动等待时间修复。

`build-opera.mjs` 使用 RetroArch 同一份 libretro-common 头文件构建 Opera，并将链接警告作为错误处理，避免再次发布不匹配的二进制。CHD 解码仅由 RetroArch 提供一份（含内置 FLAC 支持）；Opera 的 `HAVE_CHD=0` 只是省略旧的重复 codec 对象，其光盘读取仍调用 `intfstream_open_chd_track`。

此外，Nostalgist 0.21.0 要求工厂返回值可调用 `.then()`，并在启动后使用 `Module.setCanvasSize`。脚本对 Emscripten 4 输出做 Promise 归一化，并显式导出 `setCanvasSize`。

## 固定版本

| 组件 | 来源 | 版本 |
| --- | --- | --- |
| Opera | https://github.com/libretro/opera-libretro | `67a29e60a4d194b675c9272b21b61eaa022f3ba3` |
| RetroArch | https://github.com/libretro/RetroArch | v1.22.2，`69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576` |
| Emscripten | https://github.com/emscripten-core/emsdk | `4.0.10` |
| Nostalgist | 项目 `package-lock.json` | `0.21.0` |

构建不使用 Opera 当前 master 的新 BIOS 实现，不修改上游 C 源码。上游许可证与对应源码保留在上述固定提交中；分发二进制时应一并遵守 Opera、RetroArch 及所链接依赖的许可证要求。

## 构建

使用专用、可清理的源码检出目录。脚本会执行 `make clean`，不要指向有其他工作内容的目录。低内存主机建议 `JOBS=1`，默认及最高为 2。

```sh
git clone https://github.com/emscripten-core/emsdk.git /path/to/emsdk
/path/to/emsdk/emsdk install 4.0.10
/path/to/emsdk/emsdk activate 4.0.10
. /path/to/emsdk/emsdk_env.sh

git clone https://github.com/libretro/opera-libretro.git /path/to/opera
git -C /path/to/opera checkout 67a29e60a4d194b675c9272b21b61eaa022f3ba3
git clone --branch v1.22.2 https://github.com/libretro/RetroArch.git /path/to/retroarch

OPERA_SOURCE=/path/to/opera RETROARCH_SOURCE=/path/to/retroarch \
  node deploy/build-opera.mjs
```

脚本核对源码提交与编译器版本，输出文件位于 RetroArch 检出目录的 `opera_libretro.js` 与 `opera_libretro.wasm`。默认只构建，不修改运行中的核心资源；输出包含两文件的 SHA-256。`--package-only` 仅检查和处理已有编译产物。

## 真实浏览器回归

自行提供有权使用的游戏与 BIOS；仓库测试不下载或包含商业游戏。默认 BIOS 目录为 `data/bios/3do`，需要 `panafz1j.bin` 与 `panafz1j-kanji.bin`，与生产配置一致。

```sh
OPERA_TEST_CHROME=/path/to/chrome \
OPERA_TEST_ROM=/path/to/game.chd \
OPERA_TEST_CORE_DIR=/path/to/retroarch \
OPERA_TEST_ARTIFACT_DIR=/path/to/evidence \
  node --test tests/opera-browser.test.js
```

测试经生产 `prepareEmulator` 入口启动，保留正常音频和生产键位配置；Opera 默认禁用自动 rewind，因为真实 CHD 验证中单个未压缩快照达 25,550,672 字节，超过默认 20 MB 回退缓冲区，会逐帧报错。手动即时存档/读档仍然支持，浏览器测试会实际保存并等待核心处理读取命令。测试还检查启动、非黑色画面、核心日志、按键注入、暂停/恢复和退出。截图与日志写入可选证据目录；截图仍需人工辨认是 BIOS 还是实际游戏，像素非黑本身不能证明可玩。可用 `OPERA_TEST_PLAY_MS` 增加观察时长，`OPERA_TEST_DEBUG_PORT` 避免调试端口冲突。

`OPERA_TEST_ROM_URL` 仅用于已有的可信本机只读测试服务器，避免重复保存商业镜像。浏览器自身仅访问临时本机测试服务器；测试不会调用业务 API、改写业务数据库或记录游玩次数。未设置 Chrome/ROM 环境变量时，此项浏览器测试显式跳过。

## 已验证结果（2026-10-14）

Chromium 156 / Linux / 软件 WebGL，以本项目默认日版 BIOS 验证既有样本：

- `Kakinoki Shougi (Japan).chd`：出现标题；正常 P/A 按键进入「対局／詰将棋を解く／棋譜の再生」菜单；手动即时存档、读档命令实际执行。
- `Driving School (J).chd`：出现动态标题；正常按键进入「初級コース／上級コース」菜单；手动快照创建成功。
- 两个样本均未再出现 WebAssembly `unreachable`、加载内容失败或 JS 未捕获异常。此验证不是完整通关或所有设备的性能保证。

本次产物：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `opera.js` | 249034 | `ec071b12a4747829df2a6c6d54779e0319993da918a45e1b450cd1df1190c97b` |
| `opera.wasm` | 2477106 | `5198a87c771ad45fd8a1e843eb194033d3ce5576cc5e396c472ee0d1f076ea60` |

上游会把编译日期写入核心，因此不同日期构建的摘要可能不同，应以当次输出为准。

## 安装和缓存更新

验证成功后，安装 **成对** 的 JS/WASM，再构建新的版本化发布。保留旧发布以便回退，不使用 `--prune`。

```sh
OPERA_SOURCE=/path/to/opera RETROARCH_SOURCE=/path/to/retroarch \
  node deploy/build-opera.mjs --package-only --install
node deploy/build-cores.mjs
```

发布清单的版本由内容计算，浏览器因此获得新的缓存键，不会沿用旧核心。配置了远端核心托管时，按 `deploy/sync-cores.sh` 同步同一版本；同步完成前可由现有同版本本机回退提供文件。仅复制 `data/cores/opera.*` 而不更新清单，无法可靠更新用户缓存。
