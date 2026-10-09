# Games Online

自托管的浏览器游戏厅：管理 ROM、在浏览器里运行模拟器、保存云存档，并通过 WebSocket + WebRTC 联机。

前端 Vue 3 + Vite，后端 Hono（Node.js），数据层 MySQL + Drizzle。模拟器 core、BIOS、ROM 和存档全部放在本地文件系统，不依赖外部 CDN。

当前版本 **v1.1.0**，`GET /api/health` 会返回版本号，Docker 镜像标签与源码版本同步（`ghcr.io/xiaoxin0125/game-biubiubiu:v1.1.0`）。

> 仓库不包含任何商业 ROM。请只上传、保存和运行你有权使用的 ROM、BIOS 与模拟器核心。

## 功能

- 游戏库：公开库、个人 ROM、收藏、回收站，支持父子版本（街机 clone、修订版、汉化版）。
- 模拟器：浏览器内运行 libretro core，支持本地键盘、物理手柄和移动端虚拟手柄，输入映射按用户保存。
- 云存档：按 ROM 与槽位读写。
- 联机房间：公开/私有房间、房间码与密码、聊天、席位同步；host 推流画面与音频，guest 通过 DataChannel 回传输入，游客默认观战。
- 管理后台：用户、ROM、BIOS、站点设置（上传开关、联机开关、游客游玩、STUN）。
- ROM 封面与元数据可编辑；超过 3MB 的 ROM 可转存到独立远端存储（Node 或 PHP 版，见 `deploy/README.md`）。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Vue 3、Vue Router、Vite、Nostalgist |
| 后端 | Node.js、Hono、@hono/node-server、@hono/node-ws |
| 数据 | MySQL 8、Drizzle ORM |
| 实时 | WebSocket 信令、WebRTC、DataChannel |
| 资产 | 本地 libretro core、BIOS、ROM、云存档 |

## 目录结构

```text
.
├── frontend/                 # Vue 3 前端：src/api、components、composables、views
├── server/                   # Hono API 与 WebSocket 服务
│   ├── db/                   # Drizzle schema 与迁移
│   ├── middleware/           # 认证、CSRF、安全头、限流、错误处理
│   ├── routes/               # HTTP 与 WS 路由
│   └── rooms/                # 房间仓储、WS 准入、席位与信令策略
├── shared/registry/          # 前后端共享的平台、BIOS、协议常量
├── data/                     # bios、cores、uploads、saves
├── config/                   # Docker 部署用的 .env / app.json 示例
├── deploy/                   # 本机 systemd + Nginx 部署文件与说明
├── compose.yaml              # Docker 基础编排：应用 + MySQL
├── compose.turn.yaml         # 可选叠加：coturn 中继
└── Dockerfile
```

## 架构要点

- 启动：`server/index.js` 先执行数据库迁移和会话清理，再挂载安全中间件、HTTP API、WebSocket 路由，最后托管 `frontend/dist`。
- ROM 播放：`GET /api/roms/:id/file` 依据 `storage` 字段读本地磁盘或代理远端存储（透传 `Range`），前端交给 Nostalgist 按平台核心启动。
- 联机：`/api/rooms/:code/ws` 先经 `room-ws-gate` 校验会话、票据、功能开关与限流，再加入在线房间；房间内 host 运行模拟器并推流，guest 输入经 DataChannel 回传，房主固定为 P1。

## 环境要求

- Node.js >= 20.12（推荐 22 LTS）、npm 10+
- MySQL 8.x
- 可选：Docker + Compose 用于容器化部署；PHP 7.4+ 用于把 ROM 放到只有 PHP 的远端服务器

## 本地开发

```bash
# 1. 创建数据库
mysql -uroot -p <<'SQL'
CREATE DATABASE games_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'games'@'127.0.0.1' IDENTIFIED BY 'games';
GRANT ALL PRIVILEGES ON games_online.* TO 'games'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

# 2. 安装依赖并准备数据目录
npm install
mkdir -p data/uploads data/saves data/bios data/cores

# 3. 注入环境变量（也可以写入 .env 或 config/app.env）
export DATABASE_URL='mysql://games:games@127.0.0.1:3306/games_online'
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='change-this-password'
npm run dev
```

开发地址：API `http://127.0.0.1:3000`，Web `http://127.0.0.1:5173`。

素材放置：

- BIOS：`data/bios/<平台>/`，例如 `fds/disksys.rom`、`psx/scph5500.bin`、`psx/scph5501.bin`、`psx/scph5502.bin`、`arcade/neogeo.zip`。
- libretro core：`data/cores/`，同名 `.js` + `.wasm`，例如 `fbneo.js`、`fbneo.wasm`。

## 配置

应用按顺序读取配置：`APP_CONFIG_FILE` 指定的文件，或自动检测 `config/.env`、`config/app.env`、`config/app.json`、`.env`。配置文件中的受支持字段会覆盖同名环境变量，方便复用同一个镜像。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HOST` / `PORT` | `0.0.0.0` / `3000` | 监听地址和端口；仅本机 Nginx 反代时 `HOST` 可设 `127.0.0.1` |
| `NODE_ENV` | 无 | 生产建议 `production` |
| `DATABASE_URL` | `mysql://games:games@127.0.0.1:3306/games_online` | MySQL 连接串 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / 开发默认 `admin123-dev` | 仅数据库为空时创建首个管理员；生产必须设置且至少 6 位 |
| `TRUST_PROXY` | `0` | 位于可信反代后方时设为 `1` |
| `CSRF_ALLOWED_ORIGINS` | 空 | 额外允许的写请求 Origin，逗号分隔，须与浏览器地址完全一致 |
| `CSRF_REQUIRE_ORIGIN` | 生产要求 | 设为 `0` 允许无 Origin 的写请求 |
| `MAX_UPLOAD_BYTES` | `104857600` | 单个 ROM 上传上限（100 MB） |
| `MAX_STATE_BYTES` | `8388608` | 单个云存档上限（8 MB） |
| `USER_UPLOAD_QUOTA_BYTES` | `2147483648` | 普通用户 ROM 总配额（2 GB） |
| `MAX_SAVE_SLOT` | `9` | 云存档最大槽位 |
| `UPLOADS_DIR` / `BIOS_DIR` / `SAVES_DIR` / `CORES_DIR` | `data/*` | 各类资产目录 |
| `APP_CONFIG_FILE` | 自动检测 | 指定配置文件路径 |
| `VITE_WEBRTC_STUN_URLS` | 空 | STUN 兜底值；正常在后台「站点设置」里配置 |
| `VITE_WEBRTC_TURN_URLS` | 空 | TURN 地址，逗号分隔；跨网络稳定联机需要 |
| `VITE_WEBRTC_TURN_USERNAME` / `VITE_WEBRTC_TURN_CREDENTIAL` | 空 | TURN 凭据，由服务端运行时下发给浏览器 |
| `VITE_WEBRTC_FORCE_RELAY` | `0` | 设为 `1` 只走 TURN，用于验证中继 |
| `VITE_WEBRTC_ICE_SERVERS` | 空 | 完整 ICE servers JSON，设置后覆盖上面的拆分变量 |
| `VITE_API_TARGET` | `http://localhost:3000` | Vite 开发代理目标 |

## 生产部署

### 方式一：Docker Compose（推荐）

基础编排 `compose.yaml` 只启动应用和 MySQL，不需要任何 TURN 配置；跨网络联机需要自建中继时，再叠加 `compose.turn.yaml` 启动 coturn。持久化数据与源码目录分离：

```text
/www/wwwroot/game          # 源码（只读挂载 config，不被容器写入）
/www/wwwroot/game-biu/data     # BIOS、core、ROM、云存档
/www/wwwroot/game-biu/mysql    # MySQL 数据目录
/www/wwwroot/game-biu/config   # config/.env（同时供 Compose 和应用读取）
/www/wwwroot/game-biu/coturn   # 可选，coturn 运行目录
```

**1. 准备目录和配置**

```bash
cd /www/wwwroot/game
mkdir -p /www/wwwroot/game-biu/{data,config,mysql,backups}
rsync -a data/ /www/wwwroot/game-biu/data/
chown -R 1000:1000 /www/wwwroot/game-biu/data/uploads /www/wwwroot/game-biu/data/saves 2>/dev/null || true

cp config/.env.example /www/wwwroot/game-biu/config/.env
chmod 600 /www/wwwroot/game-biu/config/.env
nano /www/wwwroot/game-biu/config/.env
```

`config/.env` 里必须替换掉全部 `CHANGE_ME`，其中 `MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`、`ADMIN_PASSWORD` 和 `CSRF_ALLOWED_ORIGINS` 是必填项；密码建议只含大小写字母和数字，避免连接串转义问题。私有的 GHCR 镜像还需要先登录：

```bash
echo '你的_GITHUB_TOKEN' | docker login ghcr.io -u xiaoxin0125 --password-stdin
```

**2. 启动**

```bash
cd /www/wwwroot/game
docker compose --env-file /www/wwwroot/game-biu/config/.env up -d --no-build
docker compose --env-file /www/wwwroot/game-biu/config/.env ps
curl --fail http://127.0.0.1:32741/api/health   # {"ok":true,"version":"1.1.0"}
```

所有 Compose 命令都要在源码目录执行并显式带上 `--env-file`。宝塔面板的“Compose/编排”页面不一定读取外部环境变量文件，遇到 `Set ... in .env` 或本地构建提示时，改用宝塔终端执行上面的命令。

**3. 可选：叠加 coturn 中继**

只在跨网络联机（严格防火墙、不同运营商）打洞失败时才需要。先在 `config/.env` 里填好 TURN 段，并放行 `45123/tcp`、`45123/udp` 以及 relay 范围 `45124-45129/tcp`、`45124-45129/udp`（云安全组、系统防火墙、宝塔安全页三处都要放行），然后：

```bash
docker compose --env-file /www/wwwroot/game-biu/config/.env \
  -f compose.yaml -f compose.turn.yaml up -d --no-build
```

- `TURN_PUBLIC_HOST` 填 TURN 域名或公网 IP（不要带协议和端口），`TURN_PUBLIC_IP` 必须是数字 IPv4，`TURN_LISTENING_IP` / `TURN_RELAY_IP` 填本机网卡地址。
- 叠加启动后，服务端会在运行时把 TURN 地址和凭据下发给浏览器，无需重新构建镜像。
- 排查中继链路时可临时设置 `VITE_WEBRTC_FORCE_RELAY=1` 并重建 `app`，验证完改回 `0`。
- 老版本把 coturn 写在 `compose.yaml` 里，升级后如果只带 `-f compose.yaml` 启动，原来的 coturn 容器会变成不受管理的孤儿容器；继续用两份 `-f` 启动即可平滑衔接，确要删除时执行 `docker rm -f games-online-coturn-1`。

**4. 反向代理与 HTTPS**

在宝塔“网站”里添加站点（纯静态），开启 Let's Encrypt 证书和强制 HTTPS，然后添加反向代理到 `http://127.0.0.1:32741`。站点配置要点：

```nginx
client_max_body_size 200m;

location / {
    proxy_pass http://127.0.0.1:32741;
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

WebSocket 入口 `/api/rooms/:code/ws` 必须透传 `Upgrade` 和 `Connection`；站点需要 HTTPS，否则部分浏览器的 WebRTC、音频和移动端能力会受限。

**5. 升级与回滚**

```bash
cd /www/wwwroot/game
git pull --ff-only
docker compose --env-file /www/wwwroot/game-biu/config/.env pull app
docker compose --env-file /www/wwwroot/game-biu/config/.env up -d --no-build
```

生产建议在 `config/.env` 里固定版本标签（如 `APP_IMAGE=ghcr.io/xiaoxin0125/game-biubiubiu:v1.1.0`）而不是长期使用 `latest`，回滚时改回旧标签并执行 `up -d --no-build --force-recreate app` 即可。注意 `restart` 不会加载新的环境变量，修改 `config/.env` 或 `config/app.json` 后需要 `--force-recreate`。

**6. 备份与恢复**

```bash
cd /www/wwwroot/game
set -a; . /www/wwwroot/game-biu/config/.env; set +a

docker compose --env-file /www/wwwroot/game-biu/config/.env exec -T mysql \
  mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE" \
  > "/www/wwwroot/game-biu/backups/mysql_$(date +%F_%H%M%S).sql"

tar -czf "/www/wwwroot/game-biu/backups/files_$(date +%F_%H%M%S).tar.gz" \
  -C /www/wwwroot/game-biu data config/.env
chmod 600 /www/wwwroot/game-biu/backups/*
```

恢复时先 `stop app`，解包文件备份、必要时 `chown -R 1000:1000 .../data/uploads .../data/saves`，再用 `mysql < 备份文件` 导入数据库，最后 `start app`。备份包含密码、ROM 和存档，请存放在受控位置。

### 方式二：systemd + Nginx

仓库自带 `deploy/games-online.service`（Node 直接运行后端，读取项目根目录的 `.env`）和 `deploy/nginx/extension-app.conf`（宝塔站点的 `/api` 反代与前端路由回退），适合“Nginx 托管 `frontend/dist` + 后端只提供 `/api`”的部署方式，步骤见 `deploy/README.md`。

```bash
npm ci && npm run build            # 构建前端到 frontend/dist
sudo cp deploy/games-online.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now games-online
sudo journalctl -u games-online -f
```

独立环境变量文件（`/etc/games-online.env`）示例：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=mysql://games:请改成强密码@127.0.0.1:3306/games_online
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成至少12位的初始管理员密码
TRUST_PROXY=1
CSRF_ALLOWED_ORIGINS=https://game.example.com
CSRF_REQUIRE_ORIGIN=1
UPLOADS_DIR=/www/wwwroot/game/data/uploads
BIOS_DIR=/www/wwwroot/game/data/bios
SAVES_DIR=/www/wwwroot/game/data/saves
CORES_DIR=/www/wwwroot/game/data/cores
```

非 Compose 部署的 Nginx 反代要点与上文第 4 步相同，只需把上游端口改成 `3000`。

### 数据目录与权限

- `data/uploads`、`data/saves`：运行用户可读写（容器内 uid 为 1000）。
- `data/bios`、`data/cores`：运行用户可读。
- 升级前建议同时备份数据库和 `data/` 目录。

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

FDS 需要 `disksys.rom`；PSX 常用 BIOS 为 `scph5500.bin`、`scph5501.bin`、`scph5502.bin`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动 API 和 Vite 开发服务器 |
| `npm run dev:api` / `npm run dev:web` | 只启动后端 / 前端 |
| `npm run build` | 构建前端到 `frontend/dist` |
| `npm start` | 启动生产后端，自动迁移数据库并托管前端产物 |
| `npm run preview` | 预览前端构建产物 |
| `npm run db:import:sqlite` | 旧 SQLite 数据导入 MySQL |
| `npm run security:matrix` | 权限矩阵检查 |

验证构建与运行状态：

```bash
npm run build
node --check server/index.js
curl http://127.0.0.1:3000/api/health
```

## 常见问题

**上传 ROM 后无法运行？** 依次检查平台是否选对、对应 core 的 `.js` 与 `.wasm` 是否都在 `data/cores`、平台是否需要 BIOS 文件，以及浏览器控制台是否有 core 或 WebAssembly 报错。

**房间能进入但没有画面 / 一直显示“握手中”？** 通常是 WebRTC 只配置了 STUN，严格防火墙或跨运营商网络无法打洞。先在后台「站点设置」填写可用的 STUN 并让玩家刷新页面；仍然失败时按上文第 3 步部署 coturn 并开放端口，再用 `VITE_WEBRTC_FORCE_RELAY=1` 验证中继链路。只开放少量 relay 端口时并发能力会明显受限。

**游客为什么不能控制？** 游客默认观战。需要在后台开启游客游玩开关，且房间允许游玩，游客才会获得可控制席位。

**忘记管理员密码？** 首个管理员只在数据库为空时创建。忘记密码需要直接修改数据库中的密码哈希，或者在确认没有重要数据后重建数据库并重新初始化。

**修改了 `config/.env` 或 `config/app.json` 为什么不生效？** 配置文件在进程启动时读取。systemd 部署执行 `sudo systemctl restart games-online`，Compose 部署执行 `up -d --no-build --force-recreate app`；`restart` 不会加载新的环境变量。

**`.env` 与 `config/*` 谁优先？** 检测到的配置文件中的受支持字段会覆盖同名环境变量；`APP_CONFIG_FILE` 可以指定任意路径。Docker 部署里 `/app/config/.env` 是唯一需要维护的应用配置文件。
