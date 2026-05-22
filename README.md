# Games Online

Games Online 是一个自托管浏览器游戏厅。项目由 Vue 3 前端、Hono Node.js 后端、MySQL/Drizzle 持久化组成，核心能力是 ROM 管理、浏览器模拟器、云存档、房间大厅、WebSocket 信令和 WebRTC 观战/联机输入。

项目不包含任何商业 ROM。请只上传和使用你有权使用的游戏文件、BIOS 文件和模拟器核心文件。

## 功能概览

### 游戏与 ROM

- 支持公开 ROM、个人 ROM、收藏、回收站、版本家族。
- 支持管理员维护 ROM 最大人数，房间人数按 `1..4` 生效。
- 子版本可继承父 ROM 的人数配置。
- 上传权限可由后台开关控制：管理员始终可上传，普通用户可按站点设置开放或关闭。

### 浏览器模拟器

- 前端使用 `nostalgist` 启动 libretro 核心。
- 后端从本地 `data/cores` 提供 `.js` / `.wasm` 核心文件，不依赖外部 CDN。
- BIOS 从本地 `data/bios` 按平台加载。
- 单人模式下按键配置变更会重新载入输入配置。
- 房间主机模式下会固定启动输入快照，避免主机改键时重启模拟器；P1 输入通过当前映射转译到启动快照。

### 输入与手柄

- 键盘、手柄、移动端虚拟手柄均支持自定义映射。
- 平台按钮按实际平台展示，例如 NES/FC、SFC/SNES、GBA、MD/Genesis、PS1、街机等。
- 支持扩展/连发按钮：`AA`、`BB`、`XX`、`YY`、`LL`、`RR`、`L2L2`、`R2R2`。
- 扩展按钮不会写入无效 RetroArch 配置，而是转译到底层真实按钮。
- 移动端虚拟手柄支持 8 向摇杆、多点滑动、系统键、肩键和独立“连发”开关。

### 房间与联机

- 支持公开房间、私有密码房、房间码、聊天室。
- 房主固定为 P1。
- 认证玩家按加入顺序分配 P2-P4 控制席位。
- 游客默认观战；后台可控制游客游玩和联机总开关。
- 房主浏览器运行模拟器，使用 WebRTC 推送画面/音频给其他成员。
- 非房主玩家输入通过 WebRTC DataChannel 回传房主，再在房主侧分发到 P2-P4。
- 玩家离场只关闭对应 peer，不应导致房主 ROM/BIOS 重载。

### 账号、存档和后台

- 支持注册、登录、登出、改密。
- 支持云存档，存档文件落盘到 `data/saves`。
- 管理后台包含：用户管理、ROM 管理、BIOS 查看、站点设置、上传开关、联机开关、游客游玩开关。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Vue 3、Vue Router、Vite、Nostalgist |
| 后端 | Node.js、Hono、@hono/node-server、@hono/node-ws |
| 数据库 | MySQL、Drizzle ORM、drizzle-kit |
| 实时通信 | WebSocket 信令、WebRTC 媒体流、DataChannel 输入 |
| 运行资产 | 本地 libretro core、BIOS、上传 ROM、云存档 |

## 目录结构

```text
/www/wwwroot/game
├── frontend/                         # Vue 前端
│   ├── src/api/                       # API client
│   ├── src/components/                # 通用组件、上传、房间、输入设置
│   ├── src/components/emulator-portal # 模拟器容器、顶部栏、虚拟手柄、房间面板
│   ├── src/composables/               # 认证、设置、模拟器、输入、WebRTC
│   ├── src/composables/player/        # Player 页面拆分后的房间/视频/ROM/存档逻辑
│   ├── src/constants/                 # 平台、核心、按钮配置
│   └── src/views/                     # 页面：大厅、我的 ROM、房间、玩家、后台等
├── server/                            # Hono API 与 WebSocket 服务
│   ├── db/                            # Drizzle schema、迁移、MySQL 连接
│   ├── middleware/                    # 登录态、权限、限流
│   ├── routes/                        # auth/roms/rooms/saves/admin/settings 等接口
│   ├── index.js                       # 服务入口，启动时自动迁移数据库
│   ├── room-hub.js                    # 房间在线态、席位、信令转发
│   └── rom-players.js                 # ROM 最大人数推断与裁剪
├── data/
│   ├── bios/                          # BIOS 文件目录
│   ├── cores/                         # libretro 核心 .js/.wasm
│   ├── uploads/                       # ROM 上传目录，运行时生成
│   └── saves/                         # 云存档目录，运行时生成
├── drizzle.config.js                  # Drizzle 配置
├── package.json                       # 根项目脚本和后端依赖
└── README.md
```

## 支持的平台和核心

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

当前代码期望 `data/cores` 下存在对应的核心文件，例如：

```text
fbneo.js
fbneo.wasm
fceumm.js
fceumm.wasm
...
pcsx_rearmed.js
pcsx_rearmed.wasm
```

## 环境变量

项目不会自动读取 `.env` 文件。开发或生产部署时，需要通过 shell、systemd、PM2、Docker 或面板环境变量显式注入。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 后端 HTTP + WebSocket 监听端口 |
| `NODE_ENV` | 无 | 建议生产设置为 `production` |
| `DATABASE_URL` | `mysql://games:games@127.0.0.1:3306/games_online` | MySQL 连接串 |
| `ADMIN_USERNAME` | `admin` | 首次初始化管理员用户名，仅数据库为空时生效 |
| `ADMIN_PASSWORD` | 开发默认 `admin123-dev`，生产无默认 | 首次初始化管理员密码；生产环境必须设置且至少 12 位 |
| `TRUST_PROXY` | `0` | 仅在可信反代后方设为 `1`，用于读取 `x-forwarded-*` |
| `CSRF_ALLOWED_ORIGINS` | 空 | 额外允许发起写请求的 Origin，逗号分隔 |
| `CSRF_REQUIRE_ORIGIN` | 生产默认要求 | 设为 `0` 可允许无 Origin 写请求，仅建议可信非浏览器客户端使用 |
| `MAX_UPLOAD_BYTES` | `104857600` | 单个 ROM 上传上限，默认 100 MB |
| `MAX_STATE_BYTES` | `8388608` | 单个云存档上传上限，默认 8 MB |
| `USER_UPLOAD_QUOTA_BYTES` | `2147483648` | 普通用户 live ROM 总上传配额，默认 2 GB |
| `MAX_SAVE_SLOT` | `9` | 云存档槽位最大编号，默认允许 0-9 |
| `UPLOADS_DIR` | `data/uploads` | ROM 上传目录 |
| `BIOS_DIR` | `data/bios` | BIOS 目录 |
| `SAVES_DIR` | `data/saves` | 云存档目录 |
| `CORES_DIR` | `data/cores` | libretro 核心目录 |
| `VITE_API_TARGET` | `http://127.0.0.1:3000` | 仅 Vite 开发代理使用 |

首次启动且数据库没有用户时，会自动创建管理员。生产环境必须在首次启动前设置 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，其中 `ADMIN_PASSWORD` 至少 12 位；普通注册接口不会再创建管理员账号。

## 本地开发

### 1. 准备环境

建议版本：

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

如果 Node 服务和 MySQL 不在同一台机器，请把用户名 host 从 `'127.0.0.1'` 改成实际来源，例如 `'%'`，并同时做好防火墙限制。

### 3. 安装依赖

```bash
cd /www/wwwroot/game
npm install
```

### 4. 准备运行目录

```bash
mkdir -p data/uploads data/saves data/bios data/cores
```

把 libretro 核心放入 `data/cores`，把 BIOS 放入 `data/bios`。常见目录结构如下：

```text
data/bios/arcade/neogeo.zip
data/bios/fds/disksys.rom
data/bios/psx/scph5500.bin
data/bios/psx/scph5501.bin
data/bios/psx/scph5502.bin
```

### 5. 注入环境变量并启动开发服务

```bash
export DATABASE_URL='mysql://games:games@127.0.0.1:3306/games_online'
export ADMIN_USERNAME='admin'
export ADMIN_PASSWORD='change-this-password'
npm run dev
```

开发模式会同时启动：

- API：`http://127.0.0.1:3000`
- Web：`http://127.0.0.1:5173`

前端开发服务器会代理 `/api` 和 WebSocket 到后端。

## 生产部署教程

下面以 Ubuntu / Debian + MySQL + systemd + Nginx 为例。其他 Linux 发行版只需要替换包管理命令。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y curl git nginx mysql-server build-essential
```

安装 Node.js 22 LTS：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 2. 创建 MySQL 数据库和账号

```bash
sudo mysql
```

```sql
CREATE DATABASE games_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'games'@'127.0.0.1' IDENTIFIED BY '请改成强密码';
GRANT ALL PRIVILEGES ON games_online.* TO 'games'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

### 3. 上传或拉取项目代码

如果代码已经位于 `/www/wwwroot/game`，跳过本步骤。

```bash
sudo mkdir -p /www/wwwroot
sudo chown -R $USER:$USER /www/wwwroot
cd /www/wwwroot
git clone <你的仓库地址> game
cd /www/wwwroot/game
```

### 4. 创建运行目录

```bash
mkdir -p data/uploads data/saves data/bios data/cores
```

确认目录归运行用户所有。如果后续用 `www-data` 运行服务：

```bash
sudo chown -R www-data:www-data /www/wwwroot/game/data
```

### 5. 放置核心和 BIOS

核心文件放入：

```text
/www/wwwroot/game/data/cores
```

每个核心通常需要一组同名文件：

```text
core_name.js
core_name.wasm
```

BIOS 文件放入：

```text
/www/wwwroot/game/data/bios
```

示例：

```text
/www/wwwroot/game/data/bios/arcade/neogeo.zip
/www/wwwroot/game/data/bios/fds/disksys.rom
/www/wwwroot/game/data/bios/psx/scph5500.bin
/www/wwwroot/game/data/bios/psx/scph5501.bin
/www/wwwroot/game/data/bios/psx/scph5502.bin
```

没有对应 BIOS 或核心时，相关平台可能无法启动。

### 6. 配置环境变量文件

创建 `/etc/games-online.env`：

```bash
sudo tee /etc/games-online.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://games:请改成强密码@127.0.0.1:3306/games_online
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成至少12位首次启动管理员密码
TRUST_PROXY=1
CSRF_ALLOWED_ORIGINS=https://你的域名
CSRF_REQUIRE_ORIGIN=1
MAX_UPLOAD_BYTES=104857600
MAX_STATE_BYTES=8388608
USER_UPLOAD_QUOTA_BYTES=2147483648
MAX_SAVE_SLOT=9
UPLOADS_DIR=/www/wwwroot/game/data/uploads
BIOS_DIR=/www/wwwroot/game/data/bios
SAVES_DIR=/www/wwwroot/game/data/saves
CORES_DIR=/www/wwwroot/game/data/cores
EOF
```

限制权限：

```bash
sudo chmod 600 /etc/games-online.env
```

注意：`ADMIN_USERNAME` / `ADMIN_PASSWORD` 只在数据库首次为空时创建初始管理员。已经初始化后，修改这两个变量不会改已有管理员密码。生产环境 `ADMIN_PASSWORD` 必须至少 12 位，否则服务会拒绝启动。

### 7. 安装依赖并构建前端

```bash
cd /www/wwwroot/game
npm ci
npm run build
```

构建产物位于：

```text
/www/wwwroot/game/frontend/dist
```

后端启动时如果检测到 `frontend/dist/index.html`，会自动托管前端静态文件，并对非 `/api` 路径回退到 SPA 首页。

### 8. 启动一次服务并初始化数据库

```bash
cd /www/wwwroot/game
set -a
. /etc/games-online.env
set +a
npm start
```

看到类似输出即可：

```text
[db] seeded initial admin: username="admin", role=admin
[api] listening on http://0.0.0.0:3000
```

启动时会自动执行 `server/db/migrations` 里的 Drizzle 迁移，不需要单独手动跑迁移命令。

确认健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

返回：

```json
{"ok":true}
```

### 9. 配置 systemd 服务

创建服务文件：

```bash
sudo tee /etc/systemd/system/games-online.service >/dev/null <<'EOF'
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
EOF
```

修正项目权限：

```bash
sudo chown -R www-data:www-data /www/wwwroot/game/data
sudo chown -R www-data:www-data /www/wwwroot/game/frontend/dist
```

启动并设为开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now games-online
sudo systemctl status games-online
```

查看日志：

```bash
sudo journalctl -u games-online -f
```

### 10. 配置 Nginx 反向代理

示例域名：`game.example.com`。

```bash
sudo tee /etc/nginx/sites-available/games-online >/dev/null <<'EOF'
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
EOF
```

启用站点：

```bash
sudo ln -sf /etc/nginx/sites-available/games-online /etc/nginx/sites-enabled/games-online
sudo nginx -t
sudo systemctl reload nginx
```

WebSocket 信令入口是：

```text
/api/rooms/:code/ws
```

反向代理必须透传 `Upgrade` 和 `Connection`，否则房间无法建立实时连接。

### 11. 配置 HTTPS

生产环境建议启用 HTTPS。WebRTC、摄像头/音频流、移动端浏览器策略都更依赖安全上下文。

使用 Certbot 的常见流程：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.com
```

签发后检查：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 12. 登录后台

访问：

```text
https://game.example.com
```

使用首次启动管理员登录。登录后建议立刻：

1. 修改管理员密码。
2. 检查站点标题和副标题。
3. 根据需要开启/关闭普通用户上传。
4. 根据需要开启/关闭联机功能和游客游玩。
5. 上传或整理 ROM。
6. 在 ROM 管理中维护最大人数：自动、1、2、3、4。

## PM2 部署方式

如果不用 systemd，也可以用 PM2：

```bash
sudo npm install -g pm2
cd /www/wwwroot/game
npm ci
npm run build
set -a
. /etc/games-online.env
set +a
pm2 start server/index.js --name games-online
pm2 save
pm2 startup
```

PM2 方式也要保证环境变量已经注入。推荐用 ecosystem 文件统一维护环境变量，避免 shell 会话丢失。

## 宝塔面板部署要点

如果部署在宝塔面板：

1. 网站目录指向 `/www/wwwroot/game`。
2. Node 项目启动文件使用 `server/index.js` 或启动命令 `npm start`。
3. 运行目录必须是 `/www/wwwroot/game`。
4. 环境变量按本文 `/etc/games-online.env` 中的变量逐项填入面板。
5. 反向代理到 `127.0.0.1:3000`。
6. 必须开启 WebSocket 代理。
7. Nginx 上传限制需要大于 `MAX_UPLOAD_BYTES`，例如 `client_max_body_size 200m;`。
8. `data/uploads`、`data/saves`、`data/bios`、`data/cores` 要给 Node 运行用户可读写权限，其中 `bios` 和 `cores` 至少可读。

## 数据库迁移和升级

### 自动迁移

服务启动时会执行：

```text
server/db/migrations
```

也就是说，正常升级流程是：

```bash
cd /www/wwwroot/game
git pull
npm ci
npm run build
sudo systemctl restart games-online
sudo journalctl -u games-online -f
```

启动过程会自动执行新增迁移。

### 升级前备份

建议备份三类数据：

```bash
# 1. 数据库
mysqldump -u games -p games_online > games_online_$(date +%F).sql

# 2. 上传 ROM、云存档、BIOS、核心
sudo tar -czf games_data_$(date +%F).tar.gz -C /www/wwwroot/game data

# 3. 环境变量
sudo cp /etc/games-online.env ./games-online.env.backup.$(date +%F)
```

### 回滚

如果升级后异常：

1. 回退代码到上一版本。
2. 如数据库迁移已改变结构，按备份 SQL 恢复。
3. 恢复 `data` 目录。
4. 重新 `npm ci && npm run build`。
5. 重启服务。

## 旧 SQLite 数据导入

项目保留了导入脚本：

```bash
npm run db:import:sqlite
```

实际使用前请先阅读并按你的旧数据路径调整 `server/db/import-sqlite-to-mysql.js`。导入前务必备份 MySQL。

## 运维检查清单

### 服务状态

```bash
systemctl status games-online
journalctl -u games-online -n 100 --no-pager
curl http://127.0.0.1:3000/api/health
```

### 端口检查

```bash
ss -lntp | grep 3000
```

### Nginx 检查

```bash
nginx -t
systemctl status nginx
```

### 数据目录权限

```bash
ls -ld /www/wwwroot/game/data /www/wwwroot/game/data/uploads /www/wwwroot/game/data/saves
```

Node 运行用户需要：

- `data/uploads`：读写。
- `data/saves`：读写。
- `data/bios`：读取。
- `data/cores`：读取。

## WebRTC 和网络说明

当前联机模型是房主浏览器推流：

```text
房主浏览器运行模拟器
  -> canvas.captureStream / AudioContext 产生媒体流
  -> WebRTC 推送给其他成员
其他成员输入
  -> DataChannel 回传给房主
  -> 房主侧分发到 P2-P4
```

注意事项：

- WebSocket 只负责信令，媒体流走浏览器 WebRTC。
- 代码内置公共 STUN：`stun.l.google.com:19302`、`stun.cloudflare.com:3478`。
- 部分复杂 NAT、公司网络、校园网可能无法直连。当前源码没有外置 TURN 配置项，如需高成功率，需要扩展 TURN 配置并部署 TURN 服务。
- 生产环境建议 HTTPS，否则部分浏览器能力和移动端策略可能受限。

## 常见问题

### 1. 启动时报数据库连接失败

检查：

- `DATABASE_URL` 是否注入到服务进程。
- MySQL 是否允许该账号从当前 host 连接。
- 数据库是否存在。
- 密码里如果有特殊字符，连接串里需要 URL 编码。

### 2. `.env.example` 已复制但服务没有读取

项目没有内置 dotenv。`.env` 文件不会自动生效。你需要：

```bash
set -a
. /path/to/env-file
set +a
npm start
```

或者使用 systemd `EnvironmentFile=`、PM2 ecosystem、面板环境变量。

### 3. 上传大 ROM 失败

同时检查：

- `MAX_UPLOAD_BYTES`。
- Nginx `client_max_body_size`。
- 面板或 CDN 的上传限制。
- `data/uploads` 写入权限。

### 4. 房间无法连接画面

检查：

- Nginx 是否透传 WebSocket Upgrade。
- 浏览器控制台是否有 WebRTC 或权限错误。
- 是否使用 HTTPS。
- 双方网络是否能 WebRTC 打洞。
- 房主页面是否真正进入了游戏并完成模拟器启动。

### 5. 某个平台无法启动

检查：

- ROM 扩展名是否在平台允许列表内。
- 对应 core `.js` / `.wasm` 是否在 `data/cores`。
- 对应 BIOS 是否在 `data/bios`。
- 浏览器控制台和后端日志是否有 `core not found`、`bios`、`fetch` 错误。

### 6. 首次管理员密码忘记了

如果数据库已经初始化，`ADMIN_PASSWORD` 不会覆盖现有用户。可选处理：

- 用已有管理员在后台或个人菜单修改。
- 直接在数据库中重置用户，或清空用户表后重新初始化。生产环境请先备份。

## 开发脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动 API 和 Vite 开发服务器 |
| `npm run dev:api` | 仅启动后端，带 Node watch |
| `npm run dev:web` | 等待 API 可用后启动 Vite |
| `npm run build` | 构建前端到 `frontend/dist` |
| `npm run preview` | Vite 预览前端构建产物，仅用于前端预览 |
| `npm start` | 启动生产后端，自动迁移数据库并托管前端构建产物 |
| `npm run db:import:sqlite` | 旧 SQLite 数据导入 MySQL 的辅助脚本 |

## 安全建议

- 生产环境必须修改默认管理员密码。
- 不要把 `.env`、数据库备份、ROM、BIOS、云存档提交到仓库。
- 使用 HTTPS。
- 给 MySQL 设置强密码，并限制来源 IP。
- 定期备份 MySQL 和 `data` 目录。
- 对公网开放上传时，合理设置 `MAX_UPLOAD_BYTES`、Nginx 上传限制和磁盘监控。
- ROM、BIOS 和核心文件来源请自行确认合法性和安全性。

## 许可

MIT。