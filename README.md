# Games Online

Games Online 是一个自托管浏览器游戏厅。项目由 Vue 3 前端、Hono Node.js 后端、MySQL/Drizzle 数据层组成，提供 ROM 管理、浏览器模拟器、云存档、房间大厅、WebSocket 信令和 WebRTC 观战/联机输入。

项目不包含商业 ROM。请只上传和使用你有权使用的 ROM、BIOS 和模拟器核心文件。

## 当前源码结构

```text
/www/wwwroot/game
├── frontend/                         # Vue 3 + Vite 前端
│   ├── src/api/                       # 前端 API 封装
│   ├── src/components/                # 通用弹窗、顶部栏、上传、房间创建/编辑
│   ├── src/components/emulator-portal # 模拟器容器、覆盖层、房间面板、虚拟手柄
│   ├── src/composables/               # 认证、设置、输入、模拟器、WebRTC 等状态逻辑
│   ├── src/composables/player/        # Player 页面拆分后的 ROM、存档、房间、视频、输入逻辑
│   ├── src/constants/                 # 平台、核心、按钮配置
│   ├── src/data/                      # BIOS 与核心运行配置
│   ├── src/router/                    # 页面路由和访问控制
│   └── src/views/                     # Gallery、MyRoms、Rooms、Player、Admin、Auth
├── server/                            # Hono API 与 WebSocket 服务
│   ├── db/                            # Drizzle schema、迁移、MySQL 连接、初始化管理员
│   ├── middleware/                    # 认证、权限、CSRF、安全头、限流、错误处理
│   ├── routes/                        # auth/roms/rooms/saves/admin/settings/bios/cores
│   ├── index.js                       # 服务入口，启动时迁移数据库并注册路由
│   ├── room-hub.js                    # 房间在线态、席位、聊天、信令转发
│   ├── room-tickets.js                # 私有房间短期票据
│   ├── rom-players.js                 # ROM 最大人数推断与限制
│   └── storage.js                     # 数据目录越界保护
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

## 源码逻辑梳理

### 1. 启动链路

```text
npm start
  -> server/index.js
  -> runMigrations()
  -> 清理过期 session / ticket
  -> 注册安全中间件、API 路由、WebSocket 路由
  -> 如果存在 frontend/dist/index.html，则托管前端构建产物
  -> 监听 0.0.0.0:PORT
```

后端启动时会自动执行 `server/db/migrations` 下的数据库迁移。数据库为空时会创建首个管理员账号。

### 2. 前端页面关系

```text
App.vue
  -> AppHeader.vue
  -> router-view
      /          Gallery     公开 ROM 列表、搜索、收藏、版本选择
      /auth      Auth        登录注册
      /my        MyRoms      我的 ROM、上传、回收站、公开状态
      /rooms     Rooms       房间大厅、创建/加入/编辑/关闭房间
      /admin     Admin       用户、ROM、BIOS、站点设置
      /play/:id  Player      模拟器、云存档、虚拟手柄、房间联机
```

路由层会拦截需要登录或管理员权限的页面。`/play/:id` 是全屏页面，不展示普通顶部栏和页脚。

### 3. ROM 数据流

```text
上传 ROM
  -> frontend UploadDialog
  -> POST /api/roms/upload
  -> 校验平台、大小、配额、父子版本关系、默认核心
  -> 写入 data/uploads
  -> 写入 roms 表
  -> 记录审计日志

浏览 ROM
  -> Gallery 调 /api/roms/public
  -> MyRoms 调 /api/roms/mine 和 /api/roms/trash
  -> 版本弹窗调 /api/roms/:id/versions

播放 ROM
  -> Player 读取 ROM 元数据
  -> usePlayerRom 下载 ROM blob
  -> 子版本会同时挂载父 ROM 文件
  -> Nostalgist 按指定 libretro core 启动
```

ROM 支持软删除和永久删除。软删除保留文件用于恢复；永久删除会清理 ROM 文件、相关云存档和数据库关联记录。

### 4. 模拟器和输入流

```text
Player.vue
  -> usePlayerRom         获取 ROM、BIOS、版本族
  -> EmulatorPortal       承载模拟器画布
  -> useEmulator          管理 Nostalgist 生命周期
  -> useInputMapping      管理键盘/手柄映射
  -> useGamepads          轮询物理手柄
  -> VirtualGamepad       移动端虚拟手柄
  -> useSaveState         云存档读写
```

单人模式下，玩家直接在本地浏览器运行模拟器。移动端显示虚拟手柄；桌面端支持键盘和 Gamepad API。

### 5. 房间和联机流

```text
创建/加入房间
  -> /api/rooms
  -> /api/rooms/:code/join
  -> 私有房间通过短期 roomTicket 进入 WebSocket

房间在线态
  -> /api/rooms/:code/ws
  -> room-hub.js 维护 peer、席位、聊天和信令转发

媒体和输入
  -> 房主浏览器运行模拟器
  -> 房主 canvas.captureStream / AudioContext 产生媒体流
  -> WebRTC 推送给访客
  -> 访客输入通过 DataChannel 回传房主
  -> 房主侧映射到 P2-P4
```

房主固定为 P1。认证玩家按加入顺序分配可操作席位；游客默认观战，是否允许游客游玩由后台开关控制。

### 6. 权限和安全边界

- 登录态使用 HttpOnly Cookie + 数据库存储 session。
- WebSocket 使用短期 ticket，私有房间额外使用 roomTicket。
- 写请求经过 CSRF Origin 校验。
- 管理接口统一要求管理员权限。
- 上传和存档写入会做大小限制和目录越界检查。
- 认证和房间加入有内存限流。
- 用户、设置、认证、ROM 关键操作会写入审计日志。

## 功能概览

- 公开 ROM 游戏库、个人 ROM、收藏、回收站。
- ROM 版本族：父 ROM + 子版本，适合街机 clone/variant。
- 平台默认核心和管理员最大人数设置。
- 浏览器内启动 libretro core。
- 本地 BIOS 和本地 core 文件，不依赖外部 CDN。
- 键盘、手柄、移动端虚拟手柄映射。
- 云存档上传和读取。
- 公开/私有房间、房间密码、房间码、聊天室。
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

## 支持平台

| 平台 | ROM 扩展名 | 默认/可选核心 |
|---|---|---|
| 街机 | `.zip` | `fbneo`、`mame2003_plus` |
| NES / FC / FDS | `.nes`、`.unif`、`.unf`、`.fds`、`.zip` | `nestopia`、`fceumm`、`quicknes` |
| SFC / SNES | `.smc`、`.sfc`、`.zip` | `snes9x` |
| GB / GBC | `.gb`、`.gbc`、`.cgb`、`.sgb`、`.zip` | `mgba`、`gambatte`、`gearboy`、`tgbdual` |
| GBA | `.gba`、`.zip` | `mgba`、`vba_next` |
| Mega Drive / Genesis | `.md`、`.gen`、`.smd`、`.bin`、`.zip` | `genesis_plus_gx`、`picodrive` |
| Master System / Game Gear | `.sms`、`.gg`、`.zip` | `genesis_plus_gx`、`picodrive`、`gearsystem` |
| PlayStation | `.chd`、`.cue`、`.bin`、`.iso`、`.pbp`、`.m3u` | `pcsx_rearmed` |

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
| `VITE_API_TARGET` | `http://127.0.0.1:3000` | Vite 开发代理目标 |

## 本地开发

### 1. 准备环境

- Node.js `>= 20.11`，推荐 Node.js 22 LTS。
- MySQL 8.x 或兼容版本。
- npm 10+。

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

开发模式会启动：

- API：`http://127.0.0.1:3000`
- Web：`http://127.0.0.1:5173`

## 生产部署要点

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

房间 WebSocket 入口是 `/api/rooms/:code/ws`，反代必须透传 `Upgrade` 和 `Connection`。

生产环境建议启用 HTTPS，否则部分浏览器的 WebRTC 和移动端策略可能受限。

## 开发脚本

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

## 运维检查

```bash
curl http://127.0.0.1:3000/api/health
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

`ADMIN_PASSWORD` 只在数据库为空时生效。数据库已经初始化后，修改环境变量不会覆盖已有管理员。需要通过已有管理员改密，或备份后直接处理数据库用户记录。

### 上传大 ROM 失败

同时检查：

- `MAX_UPLOAD_BYTES`
- Nginx `client_max_body_size`
- 面板或 CDN 上传限制
- `data/uploads` 写权限

### 房间能进但没有画面

重点检查：

- Nginx 是否透传 WebSocket。
- 是否使用 HTTPS。
- 房主是否真正进入游戏并完成模拟器启动。
- 双方网络是否能 WebRTC 打洞。

当前源码内置公共 STUN：`stun.l.google.com:19302`、`stun.cloudflare.com:3478`。没有外置 TURN 配置项，复杂 NAT 环境下连接成功率会受影响。

### 某个平台无法启动

检查对应平台的：

- ROM 扩展名。
- `data/cores` 中 core `.js` / `.wasm` 是否存在。
- `data/bios` 中 BIOS 是否存在。
- 浏览器控制台和后端日志。

## 源码维护评价

当前代码已经完成了从页面、接口、数据表到实时房间的完整闭环。主要优点是模块边界清楚、运行资产本地化、权限控制覆盖较完整、房间链路拆分合理。主要短板是 Player 页面仍然偏重，WebRTC/TURN 配置还不够工程化，自动化测试覆盖不足。

源码评分：`82 / 100`。

| 维度 | 评分 | 说明 |
|---|---:|---|
| 架构清晰度 | 84 | 前后端边界清楚，Player 已拆出多个组合逻辑，但页面仍偏大 |
| 功能完整度 | 88 | ROM、存档、后台、房间、输入链路完整 |
| 安全性 | 82 | Cookie、CSRF、权限、限流、目录保护都有覆盖，仍缺少更系统的安全测试 |
| 可维护性 | 78 | 常用逻辑已模块化，仍有部分大文件和复杂状态链路 |
| 部署友好度 | 84 | 自动迁移、构建托管、环境变量清晰，但 TURN/观测能力还有提升空间 |
| 测试保障 | 60 | 当前更依赖人工验证，自动化测试不足 |