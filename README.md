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

应用启动时支持两种配置来源：直接注入环境变量，或者读取 `config/app.env` / `config/app.json`。也可以通过 `APP_CONFIG_FILE` 指定其他路径。检测到配置文件时，文件中的受支持字段会覆盖同名环境变量，便于复用 GitHub 已构建好的通用镜像；未写入文件的字段继续使用环境变量或程序默认值。

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
| `APP_CONFIG_FILE` | 自动检测 | 可选配置文件路径；默认依次检测 `config/app.env`、`config/app.json` |
| `VITE_WEBRTC_STUN_URLS` | `stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478` | 运行时 WebRTC STUN 地址，逗号分隔 |
| `VITE_WEBRTC_TURN_URLS` | 空 | 运行时 WebRTC TURN 地址，逗号分隔；跨网络稳定联机需要配置 |
| `VITE_WEBRTC_TURN_USERNAME` | 空 | TURN 用户名 |
| `VITE_WEBRTC_TURN_CREDENTIAL` | 空 | TURN 密码或凭据 |
| `VITE_WEBRTC_FORCE_RELAY` | `0` | 设为 `1` 时只走 TURN relay，适合验证中继是否生效 |
| `VITE_WEBRTC_ICE_SERVERS` | 空 | ICE servers JSON 数组；设置后覆盖上面的 STUN/TURN 拆分变量 |
| `VITE_API_TARGET` | `http://localhost:3000` | Vite 开发代理目标 |

## 本地开发

### 1. 准备环境

- Node.js `>= 20.12`，推荐 Node.js 22 LTS。
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

### 2. Docker Compose 完整部署（应用 + MySQL + STUN/TURN）

本节是生产环境的完整操作说明，适用于普通 Linux 服务器和宝塔面板。宝塔只是负责安装 Docker、管理文件、执行 Compose 和配置网站反向代理；实际运行参数仍来自仓库根目录的 `compose.yaml` 和 `.env.docker`。

#### 2.1 部署后会创建什么

Compose 会启动三个容器：

- `app`：Games Online 应用，容器内部监听 `3000`。
- `mysql`：MySQL 8.4，保存用户、ROM 元数据、房间和站点设置。
- `coturn`：STUN/TURN 服务，处理跨网络 WebRTC 连接和中继。

持久化位置：

- `./data/uploads`：用户上传的 ROM。
- `./data/saves`：云存档。
- `games-online_mysql_data` Docker volume：MySQL 数据。
- `./config/app.json` 或 `./config/app.env`：可选的应用配置文件。

删除并重建容器不会删除这些数据。执行 `docker compose --env-file .env.docker down -v` 会删除 MySQL volume，生产环境不要随意使用该命令。

#### 2.2 域名、端口和防火墙准备

建议准备两个 DNS 记录：

- `game.example.com`：游戏站点域名，可以使用 Cloudflare 代理，也可以仅 DNS。
- `turn.example.com`：TURN 域名，必须是仅 DNS，不可经过 Cloudflare HTTP 代理。

将两个记录都解析到服务器公网 IPv4，并提前放行：

- `80/tcp`、`443/tcp`：宝塔网站和 HTTPS。
- `3478/tcp`、`3478/udp`：TURN 入口。
- `49160-49200/tcp`、`49160-49200/udp`：TURN relay 端口范围。

端口要同时在以下位置放行：

1. 云厂商安全组。
2. 服务器系统防火墙。
3. 宝塔面板“安全”页面。
4. 如果服务器位于路由器或上级 NAT 后方，还要配置同端口的 TCP/UDP 转发。

使用 UFW 的服务器可以执行：

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 49160:49200/tcp
ufw allow 49160:49200/udp
ufw status
```

使用 firewalld 的服务器可以执行：

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --add-port=3478/tcp
firewall-cmd --permanent --add-port=3478/udp
firewall-cmd --permanent --add-port=49160-49200/tcp
firewall-cmd --permanent --add-port=49160-49200/udp
firewall-cmd --reload
firewall-cmd --list-all
```

只选择服务器实际使用的防火墙工具；宝塔安全页面和云安全组仍需同步配置。

应用端口默认只绑定 `127.0.0.1:3000`，供服务器本机的 Nginx 反向代理使用，因此无需向公网开放 `3000`。

#### 2.3 GitHub 镜像说明

仓库已包含 `Dockerfile`、`compose.yaml`、`.env.docker.example` 和 GitHub Actions 工作流。推送到 `main`、推送 `v*` 标签或手动运行工作流时，会自动构建 `linux/amd64`、`linux/arm64` 镜像并发布到 GitHub Container Registry（GHCR）：

```text
ghcr.io/xiaoxin0125/game-biubiubiu:latest
ghcr.io/xiaoxin0125/game-biubiubiu:v1.0.0
ghcr.io/xiaoxin0125/game-biubiubiu:sha-xxxxxxx
```

Pull Request 只验证镜像构建，不推送。公开镜像可直接拉取；私有镜像需要先创建具有 `read:packages` 权限的 GitHub Personal Access Token，然后在服务器执行：

```bash
echo '你的_GITHUB_TOKEN' | docker login ghcr.io -u xiaoxin0125 --password-stdin
```

应用镜像包含前端、后端、BIOS 和模拟器 core。ROM、存档和 MySQL 数据不保存在应用镜像中。

#### 2.4 宝塔面板安装 Docker 和准备目录

1. 登录宝塔面板。
2. 打开“Docker”菜单；如果尚未安装 Docker 管理器，按面板提示安装 Docker 和 Compose。
3. 打开“终端”，确认命令可用：

```bash
docker version
docker compose version
```

4. 将仓库放到部署目录。已有仓库时更新代码：

```bash
cd /www/wwwroot/game
git pull --ff-only
```

首次部署时可以克隆：

```bash
cd /www/wwwroot
git clone https://github.com/xiaoxin0125/game-biubiubiu.git game
cd /www/wwwroot/game
```

也可以通过宝塔文件管理上传项目压缩包并解压到 `/www/wwwroot/game`。无论使用哪种方式，最终都应确认以下文件存在：

```bash
cd /www/wwwroot/game
test -f compose.yaml
test -f .env.docker.example
test -f Dockerfile
```

5. 创建持久化目录并设置应用容器的写入权限：

```bash
cd /www/wwwroot/game
mkdir -p data/uploads data/saves config
chown -R 1000:1000 data/uploads data/saves
chmod 755 data data/uploads data/saves config
```

不要修改 `data/bios` 和 `data/cores` 的内容，除非需要增加合法获得的 BIOS 或模拟器 core。

#### 2.5 创建 `.env.docker`

推荐直接复制仓库提供的模板：

```bash
cd /www/wwwroot/game
cp .env.docker.example .env.docker
chmod 600 .env.docker
```

`.env.docker` 是隐藏文件。宝塔文件管理中如果看不到它，请开启“显示隐藏文件”，或者直接在宝塔终端编辑：

```bash
nano .env.docker
```

系统没有 `nano` 时，可以使用 `vi .env.docker`，也可以在宝塔文件管理中创建名为 `.env.docker` 的文件。下面是一份可以直接复制的完整示例，必须替换域名、公网 IP 和全部密码：

```dotenv
# 应用只供宝塔 Nginx 从本机反代
APP_BIND_IP=127.0.0.1
APP_PORT=3000
CSRF_ALLOWED_ORIGINS=https://game.example.com
TRUST_PROXY=1
TZ=Asia/Shanghai

# 首次启动时创建管理员；密码至少 12 位
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请替换为至少12位的管理员强密码

# MySQL；建议使用只包含字母和数字的随机密码，避免 URL 特殊字符转义问题
MYSQL_DATABASE=games_online
MYSQL_USER=games
MYSQL_PASSWORD=请替换为MySQL应用密码
MYSQL_ROOT_PASSWORD=请替换为MySQLRoot密码

# TURN 公网信息
TURN_PUBLIC_HOST=turn.example.com
TURN_PUBLIC_IP=203.0.113.10
TURN_REALM=games-online
TURN_PORT=3478
TURN_MIN_PORT=49160
TURN_MAX_PORT=49200
TURN_USERNAME=games
TURN_PASSWORD=请替换为TURN强密码

# 仅排查 TURN 时临时设为 1，正常使用保持 0
VITE_WEBRTC_FORCE_RELAY=0

# 资源限制
MAX_UPLOAD_BYTES=104857600
MAX_STATE_BYTES=8388608
USER_UPLOAD_QUOTA_BYTES=2147483648
MAX_SAVE_SLOT=9

# 留空时自动检测 /app/config/app.env 或 /app/config/app.json
APP_CONFIG_FILE=

# GitHub Actions 发布的应用镜像
APP_IMAGE=ghcr.io/xiaoxin0125/game-biubiubiu:latest
```

变量填写规则：

- `CSRF_ALLOWED_ORIGINS` 必须包含协议，填写浏览器实际访问地址，例如 `https://game.example.com`，末尾不要加 `/`。多个 Origin 使用英文逗号分隔。
- `ADMIN_PASSWORD` 只在数据库为空、创建第一个管理员时使用；后续修改它不会自动修改现有管理员密码。
- `MYSQL_PASSWORD` 同时用于 MySQL 容器和应用连接串。为了避免连接 URL 解析问题，建议生成只含大小写字母和数字的长密码。
- `TURN_PUBLIC_HOST` 填 TURN 域名或公网 IP，不要带 `http://`、`https://` 或端口。
- `TURN_PUBLIC_IP` 必须是数字公网 IPv4，不要填域名。
- `TURN_PASSWORD` 会由服务端运行时提供给浏览器用于 TURN 长期凭据，因此它不是只在服务器内部使用的秘密。
- `APP_IMAGE` 可以固定为版本标签，例如 `ghcr.io/xiaoxin0125/game-biubiubiu:v1.0.0`，生产环境固定版本比长期使用 `latest` 更容易回滚。

可以在终端生成随机密码：

```bash
openssl rand -hex 24
```

请为管理员、MySQL 应用用户、MySQL root 和 TURN 分别生成不同密码。不要提交 `.env.docker`；该文件已经加入 Git 忽略列表。

#### 2.6 可选：创建 `config/app.json`

只使用 `.env.docker` 就可以完整启动，`config/app.json` 不是必需文件。它适合把应用自身参数集中保存到独立配置中；MySQL 容器和 coturn 容器的基础参数仍必须在 `.env.docker` 中填写。

创建方式：

```bash
cd /www/wwwroot/game
cp config/app.example.json config/app.json
nano config/app.json
chown 1000:1000 config/app.json
chmod 600 config/app.json
```

完整示例：

```json
{
  "DATABASE_URL": "mysql://games:REPLACE_WITH_MYSQL_PASSWORD@mysql:3306/games_online",
  "ADMIN_USERNAME": "admin",
  "ADMIN_PASSWORD": "REPLACE_WITH_ADMIN_PASSWORD",
  "TRUST_PROXY": 1,
  "CSRF_ALLOWED_ORIGINS": "https://game.example.com",
  "CSRF_REQUIRE_ORIGIN": 1,
  "MAX_UPLOAD_BYTES": 104857600,
  "MAX_STATE_BYTES": 8388608,
  "USER_UPLOAD_QUOTA_BYTES": 2147483648,
  "MAX_SAVE_SLOT": 9,
  "VITE_WEBRTC_STUN_URLS": "stun:turn.example.com:3478",
  "VITE_WEBRTC_TURN_URLS": "turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp",
  "VITE_WEBRTC_TURN_USERNAME": "games",
  "VITE_WEBRTC_TURN_CREDENTIAL": "REPLACE_WITH_TURN_PASSWORD",
  "VITE_WEBRTC_FORCE_RELAY": 0
}
```

应用默认依次检测 `/app/config/app.env` 和 `/app/config/app.json`。也可以在 `.env.docker` 中指定：

```dotenv
APP_CONFIG_FILE=/app/config/app.json
```

配置文件中的受支持字段会覆盖应用容器的同名环境变量。修改配置文件后必须重建 `app` 容器才能重新加载：

```bash
docker compose --env-file .env.docker up -d --no-build --force-recreate app
```

如果密码包含 `@`、`:`、`/`、`#`、`?` 或 `%` 等 URL 特殊字符，`DATABASE_URL` 中必须进行 URL 编码；最简单的做法仍是让 MySQL 密码只包含大小写字母和数字。

#### 2.7 部署前检查配置

所有 Compose 命令都必须在包含 `compose.yaml` 的目录执行，并显式指定 `.env.docker`：

```bash
cd /www/wwwroot/game
docker compose --env-file .env.docker config --quiet
```

命令无输出且退出码为 `0` 表示 Compose 语法和必填变量通过。需要查看展开后的配置时可以执行：

```bash
docker compose --env-file .env.docker config
```

展开后的输出包含数据库和 TURN 密码，不要复制到公开工单、聊天记录或截图中。

#### 2.8 拉取镜像并启动

使用 GitHub 发布镜像部署：

```bash
cd /www/wwwroot/game
docker compose --env-file .env.docker pull app mysql coturn
docker compose --env-file .env.docker up -d --no-build
docker compose --env-file .env.docker ps
```

如果宝塔 Docker 页面支持“Compose/编排”，可以按以下方式创建：

1. 打开“Docker”→“Compose”或“容器编排”→“添加 Compose”。
2. 项目名称填写 `games-online`。
3. 项目目录或工作目录填写 `/www/wwwroot/game`。
4. Compose 文件选择 `/www/wwwroot/game/compose.yaml`；如果面板只能粘贴内容，则粘贴该文件的原始内容。
5. 如果面板提供“环境变量文件”选项，选择 `/www/wwwroot/game/.env.docker`；如果只提供环境变量文本框，可以粘贴 `.env.docker` 的内容。
6. 保存并启动编排，然后在容器列表确认 `app`、`mysql`、`coturn` 均已创建。

不同宝塔版本对外部环境变量文件、工作目录和 `--no-build` 的支持不一致。如果面板提示 `Set ... in .env`、尝试本地构建或找不到相对挂载目录，应删除失败的编排，回到宝塔终端使用上面的 `--env-file .env.docker` 命令启动。终端方式最稳定，也不会要求把密码写入 `compose.yaml`。

首次启动 MySQL 和数据库迁移可能需要几十秒。检查日志和健康状态：

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=200 mysql
docker compose --env-file .env.docker logs --tail=200 app
docker compose --env-file .env.docker logs --tail=200 coturn
curl --fail http://127.0.0.1:3000/api/health
```

健康检查应返回：

```json
{"ok":true}
```

需要从当前源码本地构建而不是使用 GHCR 镜像时执行：

```bash
docker compose --env-file .env.docker up -d --build
```

#### 2.9 在宝塔创建网站和 HTTPS 反向代理

1. 在宝塔“网站”中添加站点 `game.example.com`。PHP 版本选择“纯静态”即可，不需要为应用安装 PHP。
2. 在站点“SSL”页面申请并启用 Let's Encrypt 证书，然后开启“强制 HTTPS”。
3. 打开“反向代理”，添加代理：
   - 代理名称：`games-online`。
   - 目标 URL：`http://127.0.0.1:3000`。
   - 发送域名：`$host`；如果面板不接受该值，可以保留默认。
4. 在站点 Nginx 配置中确认或补充以下内容：

```nginx
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
```

宝塔自动生成的反向代理如果已经存在 `location /`，应编辑现有代理配置，不要再添加第二个相同的 `location /`。保存前在终端验证并重载：

```bash
# 系统 Nginx
nginx -t && nginx -s reload

# 宝塔默认安装路径；上面的 nginx 命令不存在时使用
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
```

WebSocket 入口为 `/api/rooms/:code/ws`，必须透传 `Upgrade` 和 `Connection`。站点需要 HTTPS；否则部分浏览器的 WebRTC、音频和移动端能力会受限。

#### 2.10 验证站点和 TURN

先验证应用：

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail https://game.example.com/api/health
curl --fail https://game.example.com/api/runtime-config
```

`/api/runtime-config` 应显示已经配置的 STUN/TURN URL。该接口也包含浏览器连接 TURN 所需的用户名和凭据，不要把完整输出粘贴到公开工单或截图中。然后在浏览器完成以下检查：

1. 打开 `https://game.example.com`。
2. 使用 `.env.docker` 中的初始管理员账号登录。
3. 上传一份有合法使用权的测试 ROM。
4. 创建房间，再使用手机蜂窝网络或另一条宽带加入，验证跨网络联机。
5. 如果需要确认流量确实经过 TURN，可临时设置 `VITE_WEBRTC_FORCE_RELAY=1`，重建 `app` 容器后测试；验证完成后恢复为 `0`。

修改 TURN/WebRTC 参数后执行：

```bash
docker compose --env-file .env.docker up -d --no-build --force-recreate app coturn
```

#### 2.11 日常升级和回滚

使用 `latest` 升级：

```bash
cd /www/wwwroot/game
git pull --ff-only
docker compose --env-file .env.docker pull app
docker compose --env-file .env.docker up -d --no-build
docker compose --env-file .env.docker ps
```

固定版本升级或回滚时，编辑 `.env.docker`：

```dotenv
APP_IMAGE=ghcr.io/xiaoxin0125/game-biubiubiu:v1.0.0
```

然后执行：

```bash
docker compose --env-file .env.docker pull app
docker compose --env-file .env.docker up -d --no-build --force-recreate app
```

查看实时日志、重启和停止：

```bash
docker compose --env-file .env.docker logs -f --tail=200 app mysql coturn
docker compose --env-file .env.docker restart app
docker compose --env-file .env.docker stop
docker compose --env-file .env.docker start
```

#### 2.12 备份和恢复

升级前至少备份 MySQL、ROM 和存档：

```bash
cd /www/wwwroot/game
mkdir -p backups
set -a
. ./.env.docker
set +a

docker compose --env-file .env.docker exec -T mysql \
  mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE" \
  > "backups/mysql_$(date +%F_%H%M%S).sql"

tar -czf "backups/files_$(date +%F_%H%M%S).tar.gz" data/uploads data/saves config .env.docker
chmod 600 backups/*
```

恢复文件备份前先停止应用：

```bash
docker compose --env-file .env.docker stop app
tar -xzf backups/files_YYYY-MM-DD_HHMMSS.tar.gz -C /www/wwwroot/game
chown -R 1000:1000 data/uploads data/saves
```

恢复数据库：

```bash
set -a
. ./.env.docker
set +a
cat backups/mysql_YYYY-MM-DD_HHMMSS.sql | \
  docker compose --env-file .env.docker exec -T mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
docker compose --env-file .env.docker start app
```

备份文件包含密码、ROM、存档和数据库内容，应保存到受控位置，避免提供公开下载。

#### 2.13 常见部署问题

**Compose 提示 `Set ... in .env` 或变量为空**

确认当前目录和参数：

```bash
cd /www/wwwroot/game
ls -la .env.docker compose.yaml
docker compose --env-file .env.docker config --quiet
```

宝塔编排页面不一定自动读取 `.env.docker`，建议改用宝塔终端执行带 `--env-file` 的命令。

**应用容器反复重启**

```bash
docker compose --env-file .env.docker logs --tail=200 app mysql
```

常见原因包括 MySQL 密码不一致、`ADMIN_PASSWORD` 少于 12 位、`config/app.json` JSON 格式错误，以及配置文件对 uid `1000` 不可读。

**上传 ROM 或保存存档时报权限错误**

```bash
chown -R 1000:1000 data/uploads data/saves
chmod -R u+rwX,go-rwx data/uploads data/saves
docker compose --env-file .env.docker restart app
```

**通过域名可以打开页面，但登录、上传或创建房间返回 `forbidden origin`**

检查 `.env.docker` 中的 `CSRF_ALLOWED_ORIGINS` 是否与浏览器地址完全一致，包括 `https://` 和端口；修改后重建应用容器：

```bash
docker compose --env-file .env.docker up -d --no-build --force-recreate app
```

**跨网络加入房间一直显示“握手中”**

依次确认：

1. `TURN_PUBLIC_HOST` 已解析到本机公网 IPv4，且 DNS 记录没有开启 HTTP 代理。
2. `TURN_PUBLIC_IP` 是正确的数字公网 IPv4。
3. 安全组、宝塔防火墙和系统防火墙同时开放 TURN TCP/UDP 入口及 relay 范围。
4. 如果服务器在 NAT 后方，路由器已配置 TCP 和 UDP 端口转发。
5. `docker compose --env-file .env.docker logs --tail=200 coturn` 没有启动错误。
6. 临时使用 `VITE_WEBRTC_FORCE_RELAY=1` 验证 TURN 中继。

**修改 `.env.docker` 后没有生效**

`restart` 不会重新创建容器，也不会载入新的环境变量。应执行：

```bash
docker compose --env-file .env.docker up -d --no-build --force-recreate app coturn
```

MySQL 初始化变量只在空数据目录首次创建数据库时生效。已有数据库不要通过删除 volume 来强行应用新密码，应进入 MySQL 正常修改账号密码并同步更新 `.env.docker`。

仅导出应用镜像供离线服务器导入：

```bash
docker pull "$(grep '^APP_IMAGE=' .env.docker | cut -d= -f2-)"
docker save "$(grep '^APP_IMAGE=' .env.docker | cut -d= -f2-)" | gzip > games-online.tar.gz
# 目标机：gzip -dc games-online.tar.gz | docker load
```

离线 Compose 部署还需要提前导入 `mysql:8.4` 和 `coturn/coturn:alpine`。

### 3. systemd 示例

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

### 4. 非 Compose 部署的 Nginx 反代要点

使用宝塔和 Compose 时优先按照 2.9 节配置；以下配置供 systemd 或其他直接运行 Node.js 的部署方式参考。

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

### 5. 独立 coturn / 受限 NAT 端口示例

标准 Compose 部署已经包含 coturn，并默认使用 `3478` 和 `49160-49200`。以下内容仅用于独立安装 coturn，或者服务器只能开放少量端口的特殊环境。

WebRTC 参数由服务端在运行时输出，因此使用 GitHub 预构建镜像时也可以通过 Compose 环境变量或 `config/app.json` 修改：

```bash
VITE_WEBRTC_TURN_URLS=turn:公网IP:14276?transport=udp,turn:公网IP:14276?transport=tcp
VITE_WEBRTC_TURN_USERNAME=你的TURN用户名
VITE_WEBRTC_TURN_CREDENTIAL=你的TURN密码
```

coturn 受限 NAT 五端口示例，适合只能开放 `14275-14279` 的机器：

```text
listening-port=14276
listening-ip=内网IP
relay-ip=内网IP
external-ip=公网IP/内网IP
realm=games-biubiubiu
server-name=games-biubiubiu
fingerprint
lt-cred-mech
user=你的TURN用户名:你的TURN密码
min-port=14277
max-port=14279
no-multicast-peers
no-loopback-peers
stale-nonce=600
no-cli
no-tls
no-dtls
log-file=stdout
simple-log
```

NAT 或上级防火墙需要转发：

```text
外部 14276/tcp -> 内网IP:14276/tcp
外部 14276/udp -> 内网IP:14276/udp
外部 14277-14279/tcp -> 内网IP:14277-14279/tcp
外部 14277-14279/udp -> 内网IP:14277-14279/udp
```

端口分工：

| 用途 | 端口 |
|---|---|
| TURN 入口 | `14276/tcp`、`14276/udp` |
| TURN relay | `14277-14279/tcp`、`14277-14279/udp` |

如果 `14275/tcp` 被宝塔面板或其他管理服务占用，不要把它分配给 TURN。TURN 仍可只使用 `14276-14279`，但 relay 端口只有 3 个，并发中继能力有限；多人、多房间跨网时可能端口耗尽。

修改 coturn 或 WebRTC 配置后，重建容器即可：

```bash
docker compose --env-file .env.docker up -d --no-build --force-recreate app coturn
```

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

### `.env` 或 config 文件怎样生效？

Compose 变量文件通过 `docker compose --env-file .env.docker ...` 传入。应用进程还会自动检测 `config/app.env` 和 `config/app.json`，或者读取 `APP_CONFIG_FILE` 指定的文件；配置文件中的受支持字段优先于同名环境变量。修改后需要重启应用进程或重建容器。

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

### 不同网络加入房间一直显示“握手中”怎么办？

通常是 WebRTC 只配置了 STUN，跨运营商 NAT、对称 NAT 或严格防火墙无法打洞。处理顺序：

1. 部署 coturn，并通过 Compose 或应用配置文件写入 `VITE_WEBRTC_TURN_URLS`、`VITE_WEBRTC_TURN_USERNAME`、`VITE_WEBRTC_TURN_CREDENTIAL`。
2. NAT 或上级防火墙转发 TURN 入口端口和 relay 端口。
3. 重建应用容器，使运行时配置重新加载。
4. 用跨网络手机热点实际加入房间验证。
5. 临时设置 `VITE_WEBRTC_FORCE_RELAY=1` 可强制只走 TURN，用于验证中继链路是否真的可用。

只开放少量 relay 端口时，能解决跨 NAT 连接问题，但并发能力会明显受限。

### 游客为什么不能控制？

游客默认观战。需要管理员在后台开启游客游玩开关，且房间允许游玩，游客才会被分配可控制席位。