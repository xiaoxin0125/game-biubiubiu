# Games Online

Games Online 是一个自托管的浏览器游戏厅，提供 ROM 管理、浏览器模拟器、云存档、房间大厅、WebSocket 信令、WebRTC 画面传输和联机输入转发。

项目由 Vue 3 前端、Hono Node.js 后端、MySQL/Drizzle 数据层组成。模拟器核心、BIOS、ROM 和存档都使用本地文件系统管理，不依赖外部 CDN。

> 本项目不包含商业 ROM。请只上传、保存和运行你有权使用的 ROM、BIOS 与模拟器核心文件。

## 功能范围

- 公开 ROM 游戏库、个人 ROM、收藏、回收站。
- ROM 父子版本：适合街机 clone、修订版、汉化版、变体版本。
- 浏览器内运行 libretro core。
- 本地键盘、物理手柄、移动端虚拟手柄。
- 按用户保存输入映射配置。
- 云存档读取和写入。
- 公开房间、私有房间、房间密码、房间码。
- 房间聊天室、在线席位、host/guest 状态同步。
- WebSocket 信令 + WebRTC 画面/音频 + DataChannel 输入。
- 管理后台：用户、ROM、BIOS、站点设置、上传开关、联机开关、游客游玩开关。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Vue 3、Vue Router、Vite、Nostalgist |
| 后端 | Node.js、Hono、@hono/node-server、@hono/node-ws |
| 数据库 | MySQL、Drizzle ORM、drizzle-kit |
| 实时通信 | WebSocket、WebRTC、DataChannel |
| 运行资产 | 本地 libretro core、BIOS、上传 ROM、云存档 |

## 目录结构

```text
/www/wwwroot/game
├── frontend/                         # Vue 3 + Vite 前端
│   ├── src/api/                       # API 客户端封装
│   ├── src/components/                # 通用组件、弹窗、模拟器覆盖层
│   ├── src/composables/               # 前端可复用状态和运行逻辑
│   │   ├── input/                     # 输入按钮、键盘、手柄、存储、RetroArch 配置
│   │   └── player/
│   │       ├── solo/                  # 单人播放器输入、动作、生命周期
│   │       └── room/                  # 联机播放器输入、动作、生命周期、Turbo 目标
│   ├── src/constants/                 # 平台与核心兼容出口
│   ├── src/data/                      # BIOS 与核心运行配置
│   ├── src/router/                    # 路由和访问控制
│   └── src/views/                     # 页面入口
├── server/                            # Hono API 与 WebSocket 服务
│   ├── db/                            # Drizzle schema、迁移、MySQL 连接
│   ├── middleware/                    # 认证、安全头、CSRF、限流、错误处理
│   ├── routes/                        # HTTP API 与 WS 路由入口
│   ├── rooms/                         # 房间仓储、WS 准入、在线 store、席位和 relay 策略
│   ├── room-hub.js                    # 房间在线态兼容入口
│   ├── room-tickets.js                # 私有房间短期票据
│   ├── rom-players.js                 # ROM 最大人数推断兼容入口
│   └── storage.js                     # 数据目录越界保护
├── shared/registry/                   # 前后端共享静态 registry
├── data/
│   ├── bios/                          # BIOS 文件
│   ├── cores/                         # libretro core 的 .js/.wasm
│   ├── uploads/                       # ROM 上传目录，运行时生成
│   └── saves/                         # 云存档目录，运行时生成
├── package.json                       # 根脚本和后端依赖
├── frontend/package.json              # 前端依赖
├── drizzle.config.js                  # Drizzle 配置
└── README.md
```

## 模块边界

### 共享 registry

`shared/registry/` 只放静态事实，不承载运行时副作用。

| 文件 | 作用 |
|---|---|
| `platform-roms.js` | 平台、ROM 扩展名、核心顺序 |
| `platform-players.js` | 默认人数、核心人数覆盖、最大房间人数 |
| `platform-bios.js` | BIOS 平台和 BIOS 文件清单 |
| `input-protocol.js` | 房间输入消息格式常量 |
| `room-protocol.js` | 房间 WS 信令事件名 |

### 前端播放器

`Player.vue` 和 `RoomPlayer.vue` 是页面壳和兼容入口。具体逻辑拆到 composable：

```text
单人播放器
  Player.vue
    -> usePlayerRom
    -> usePlayerEmulatorConfig
    -> useSaveState
    -> player/solo/useLocalPlayerInput
    -> player/solo/useSoloPlayerActions
    -> player/solo/useSoloPlayerLifecycle

联机播放器
  RoomPlayer.vue
    -> usePlayerRoomRuntime
    -> useRoomSession
    -> useRoomRtc
    -> useGuestInputForwarding
    -> player/room/useRoomPlayerInput
    -> player/room/useRoomPlayerActions
    -> player/room/useRoomPlayerLifecycle
```

### 后端房间

HTTP 路由、WS 准入、在线态、席位策略、信令 relay 已拆分：

| 文件 | 作用 |
|---|---|
| `server/routes/rooms.js` | 房间 HTTP 路由入口 |
| `server/routes/rooms-ws.js` | WebSocket 路由入口 |
| `server/room-hub.js` | 兼容入口，保留原导出名 |
| `server/rooms/room-repository.js` | 房间存活条件、房间码、序列化 |
| `server/rooms/room-ws-gate.js` | WS 准入、票据、限流、消息解析 |
| `server/rooms/live-room-store.js` | 内存房间和 peer 存储 |
| `server/rooms/room-seat-policy.js` | host/guest 席位、`playerIndex`、`canControl` |
| `server/rooms/room-signal-relay.js` | `offer`、`answer`、`ice`、`chat` 转发规则 |
| `server/rooms/room-state.js` | 房间状态和 peer 摘要 |

## 主要数据流

### 启动链路

```text
npm start
  -> server/index.js
  -> runMigrations()
  -> cleanupExpiredSessions()
  -> 注册安全中间件、HTTP API、WebSocket 路由
  -> 如果存在 frontend/dist/index.html，则托管前端构建产物
  -> 监听 0.0.0.0:PORT
```

### ROM 上传和播放

```text
上传 ROM
  -> UploadDialog
  -> POST /api/roms/upload
  -> 校验平台、大小、配额、父子版本、默认核心
  -> 写入 data/uploads
  -> 写入 roms 表
  -> 写入审计日志

播放 ROM
  -> Player.vue / RoomPlayer.vue
  -> usePlayerRom 获取元数据、ROM blob、BIOS
  -> EmulatorPortal 承载模拟器
  -> Nostalgist 按平台核心启动
```

子版本播放时仍保持原数据形态：单 ROM 是对象，父子版本可组合为数组。

### 联机房间

```text
创建/加入房间
  -> /api/rooms
  -> /api/rooms/:code/join
  -> 私有房间返回短期 roomTicket

进入 WebSocket
  -> /api/rooms/:code/ws
  -> room-ws-gate 校验 session、ws ticket、roomTicket、netplay 开关、限流
  -> room-hub 加入在线 peer

联机运行
  -> host 浏览器运行模拟器
  -> host 通过 WebRTC 推送画面和音频
  -> guest 通过 DataChannel 发送输入
  -> host 将远端输入映射到 P2-P4
```

房主固定为 P1。认证玩家按席位策略获得 P2-P4 控制权。游客默认观战，是否可控制由后台开关决定。

## 支持平台

| 平台 | ROM 扩展名 | 核心顺序 | 默认人数 |
|---|---|---|---|
| `arcade` | `.zip` | `fbneo`、`mame2003_plus` | 4P |
| `nes` / `famicom` | `.nes`、`.unif`、`.unf`、`.zip` | `nestopia`、`fceumm`、`quicknes` | 2P |
| `fds` | `.fds`、`.zip` | `nestopia`、`fceumm` | 2P |
| `sfc` / `snes` | `.smc`、`.sfc`、`.zip` | `snes9x` | 2P |
| `gb` | `.gb`、`.zip` | `mgba`、`gambatte`、`gearboy`、`tgbdual` | 1P |
| `gbc` | `.gb`、`.gbc`、`.cgb`、`.sgb`、`.zip` | `mgba`、`gambatte`、`gearboy`、`tgbdual` | 1P |
| `gba` | `.gba`、`.zip` | `mgba`、`mgba2`、`vba_next` | 1P，`mgba2` 为 4P 特例 |
| `megadrive` / `genesis` | `.md`、`.gen`、`.smd`、`.bin`、`.zip` | `genesis_plus_gx`、`picodrive` | 2P |
| `sms` | `.sms`、`.zip` | `genesis_plus_gx`、`picodrive`、`gearsystem` | 1P |
| `gamegear` | `.gg`、`.zip` | `genesis_plus_gx`、`gearsystem` | 1P |
| `psx` | `.chd`、`.cue`、`.bin`、`.iso`、`.pbp`、`.m3u` | `pcsx_rearmed` | 2P，3/4P 联机启用 multitap 配置 |

FDS 需要 `disksys.rom`。PSX 常用 BIOS 包括 `scph5500.bin`、`scph5501.bin`、`scph5502.bin`。

## 环境变量

项目不会自动读取 `.env` 文件。开发和生产都需要通过 shell、systemd、PM2、Docker 或面板环境变量显式注入。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 后端 HTTP + WebSocket 监听端口 |
| `NODE_ENV` | 无 | 生产建议设为 `production` |
| `DATABASE_URL` | `mysql://games:games@127.0.0.1:3306/games_online` | MySQL 连接串 |
| `ADMIN_USERNAME` | `admin` | 首次初始化管理员用户名，仅数据库为空时生效 |
| `ADMIN_PASSWORD` | 开发默认 `admin123-dev`，生产无默认 | 首次初始化管理员密码；生产必须至少 12 位 |
| `TRUST_PROXY` | `0` | 可信反代后方设为 `1` |
| `CSRF_ALLOWED_ORIGINS` | 空 | 额外允许写请求的 Origin，逗号分隔 |
| `CSRF_REQUIRE_ORIGIN` | 生产默认要求 | 设为 `0` 可允许无 Origin 写请求 |
| `MAX_UPLOAD_BYTES` | `104857600` | 单个 ROM 上传上限，默认 100 MB |
| `MAX_STATE_BYTES` | `8388608` | 单个云存档上传上限，默认 8 MB |
| `USER_UPLOAD_QUOTA_BYTES` | `2147483648` | 普通用户 live ROM 总上传配额，默认 2 GB |
| `MAX_SAVE_SLOT` | `9` | 云存档槽位最大编号，默认 0-9 |
| `UPLOADS_DIR` | `data/uploads` | ROM 上传目录 |
| `BIOS_DIR` | `data/bios` | BIOS 目录 |
| `SAVES_DIR` | `data/saves` | 云存档目录 |
| `CORES_DIR` | `data/cores` | libretro core 目录 |
| `VITE_API_TARGET` | `http://localhost:3000` | Vite 开发代理目标 |

## 本地开发

### 1. 准备环境

- Node.js `>= 20.11`，推荐 Node.js 22 LTS。
- npm 10+。
- MySQL 8.x 或兼容版本。

### 2. 创建数据库

```sql
CREATE DATABASE games_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'games'@'127.0.0.1' IDENTIFIED BY 'games';
GRANT ALL PRIVILEGES ON games_online.* TO 'games'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 3. 安装依赖

```bash
cd /www/wwwroot/game
npm install
```

### 4. 准备数据目录

```bash
mkdir -p data/uploads data/saves data/bios data/cores
```

常见 BIOS 示例：

```text
data/bios/arcade/neogeo.zip
data/bios/fds/disksys.rom
data/bios/psx/scph5500.bin
data/bios/psx/scph5501.bin
data/bios/psx/scph5502.bin
```

core 文件放在 `data/cores`，通常是同名 `.js` + `.wasm`：

```text
data/cores/fbneo.js
data/cores/fbneo.wasm
data/cores/snes9x.js
data/cores/snes9x.wasm
```

### 5. 注入环境变量并启动

```bash
export DATABASE_URL='mysql://games:games@127.0.0.1:3306/games_online'
export ADMIN_USERNAME='admin'
export ADMIN_PASSWORD='change-this-password'
npm run dev
```

开发地址：

- API：`http://127.0.0.1:3000`
- Web：`http://127.0.0.1:5173`

## 生产部署

### 1. 构建

```bash
cd /www/wwwroot/game
npm ci
npm run build
```

构建产物位于 `frontend/dist`。后端检测到 `frontend/dist/index.html` 后会自动托管前端页面。

### 2. systemd 示例

环境变量文件 `/etc/games-online.env`：

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://games:请改成强密码@127.0.0.1:3306/games_online
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成至少12位首次启动管理员密码
TRUST_PROXY=1
CSRF_ALLOWED_ORIGINS=https://game.example.com
CSRF_REQUIRE_ORIGIN=1
UPLOADS_DIR=/www/wwwroot/game/data/uploads
BIOS_DIR=/www/wwwroot/game/data/bios
SAVES_DIR=/www/wwwroot/game/data/saves
CORES_DIR=/www/wwwroot/game/data/cores
```

服务文件 `/etc/systemd/system/games-online.service`：

```ini
[Unit]
Description=Games Online
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/www/wwwroot/game
EnvironmentFile=/etc/games-online.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo chown -R www-data:www-data /www/wwwroot/game/data
sudo systemctl daemon-reload
sudo systemctl enable --now games-online
sudo journalctl -u games-online -f
```

### 3. Nginx 反代要点

```nginx
server {
    listen 80;
    server_name game.example.com;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

WebSocket 入口是 `/api/rooms/:code/ws`，反代必须透传 `Upgrade` 和 `Connection`。

生产环境建议启用 HTTPS，否则部分浏览器的 WebRTC、音频和移动端策略可能受限。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动 API 和 Vite 开发服务器 |
| `npm run dev:api` | 仅启动后端，带 Node watch |
| `npm run dev:web` | 等待 API 可用后启动 Vite |
| `npm run build` | 构建前端到 `frontend/dist` |
| `npm run preview` | Vite 预览前端构建产物 |
| `npm start` | 启动生产后端，自动迁移数据库并托管前端构建产物 |
| `npm run db:import:sqlite` | 旧 SQLite 数据导入 MySQL 的辅助脚本 |
| `npm run security:matrix` | 权限矩阵检查脚本 |

## 验证命令

```bash
npm --workspace frontend run build

node --check server/routes/rooms.js
node --check server/routes/rooms-ws.js
node --check server/room-hub.js
node --check server/rooms/room-ws-gate.js
node --check server/rooms/room-seat-policy.js
node --check server/rooms/room-signal-relay.js
node --check shared/registry/platform-roms.js
node --check shared/registry/platform-players.js
node --check shared/registry/platform-bios.js
```

运行健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

## 运维检查

```bash
systemctl status games-online
journalctl -u games-online -n 100 --no-pager
nginx -t
```

数据目录权限要求：

- `data/uploads`：运行用户可读写。
- `data/saves`：运行用户可读写。
- `data/bios`：运行用户可读。
- `data/cores`：运行用户可读。

升级前建议备份：

```bash
mysqldump -u games -p games_online > games_online_$(date +%F).sql
sudo tar -czf games_data_$(date +%F).tar.gz -C /www/wwwroot/game data
```

## 常见问题

### `.env` 文件为什么不生效？

项目没有内置 dotenv。需要手动导出环境变量，或通过 systemd `EnvironmentFile=`、PM2 ecosystem、Docker、面板环境变量注入。

### 首次管理员密码忘记了怎么办？

项目只在数据库为空时创建首个管理员。忘记密码后，需要通过数据库修改管理员密码哈希，或在确认没有重要数据后重建数据库并重新初始化。

### 上传 ROM 后不能运行怎么办？

按顺序检查：

1. 平台是否选对。
2. 对应 core 的 `.js` 和 `.wasm` 是否都在 `data/cores`。
3. BIOS 平台是否缺文件，例如 FDS、PSX、部分街机 BIOS。
4. 浏览器控制台是否有 core 下载、CORS、音频或 WebAssembly 错误。

### 房间能进入但没有画面怎么办？

按顺序检查：

1. 生产站点是否使用 HTTPS。
2. Nginx 是否正确透传 WebSocket Upgrade。
3. 后台是否开启联机功能。
4. 房主是否已经成功启动模拟器。
5. 浏览器是否阻止了自动播放音频，访客可手动取消静音。

### 游客为什么不能控制？

游客默认观战。需要管理员在后台开启游客游玩开关，且房间允许游玩，游客才会被分配可控制席位。