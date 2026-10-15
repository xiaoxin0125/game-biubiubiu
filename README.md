# Games Online

自托管的浏览器游戏厅：管理 ROM、在浏览器里运行模拟器、保存云存档，并通过 WebSocket + WebRTC 联机。

前端 Vue 3 + Vite，后端 Hono（Node.js），数据层 MySQL + Drizzle。模拟器 core、BIOS、ROM 和存档全部放在本地文件系统，不依赖外部 CDN。

当前版本 **v1.6.1**，`GET /api/health` 会返回版本号，Docker 镜像标签与源码版本同步（`ghcr.io/xiaoxin0125/game-biubiubiu:v1.6.1`，同时打 `v1.6`）。页脚的版本号可以点开，查看 v1.0.0 以来的更新内容（数据在 `frontend/src/constants/changelog.js`）。

> 仓库不包含任何商业 ROM。请只上传、保存和运行你有权使用的 ROM、BIOS 与模拟器核心。

## 功能

- 游戏库：公开库、个人 ROM、收藏、回收站，支持父子版本（街机 clone、修订版、汉化版）。
- 模拟器：浏览器内运行 libretro core，支持本地键盘、物理手柄和移动端虚拟手柄，输入映射按用户保存。手柄映射按设备保存并默认使用 XBOX 标准布局（按手柄上的字母一一对应：A 就是 A、B 就是 B、X 就是 X、Y 就是 Y；FC / NES 系列的 X / Y 行是连发 A / 连发 B，所以手柄的 X / Y 就是连发），PS / NS 等其他手柄在按键设置里逐键手动映射；按键设置的手柄分页会实时显示哪个物理键按下、对应哪一行，可逐键核对；单机默认第一个手柄控制 P1、第二个控制 P2，只有一个手柄时默认只控制 P1，控制顺序可在按键设置里改；联机房间内所有本地物理手柄都作为本机 P1 输入，不受单机座位设置或「不使用手柄」选项影响；房主控制 P1，客机仍只通过现有授权席位回传输入，观战者不能控制。物理手柄只由页面这一层读取后按下对应键位，模拟器自身不再读浏览器手柄（否则同一次按键会被 core 自己的 autoconfig 再处理一遍，出现 A+B、A/B 与 X/Y 对调）。键盘同理：core 里给 P2 / P3 / P4 用的是一批只做内部中转的键，前端把它们从玩家自己的键位里全部避开，玩家本人直接按到这些键时页面会吞掉，不会误触其他玩家。虚拟手柄只在手机 / 平板这类「主指针是触摸、不能悬停」的设备上显示：触摸屏笔记本、一体机即使屏幕能摸，只要鼠标或触控板才是主指针就按 PC 处理，窗口拖小也不会切进触屏布局（那会连带把 core 的玩家数改成 1，模拟器按新配置重启）。手机竖屏、横屏都会显示虚拟手柄；触屏设备用画面左上角的悬浮按钮切全屏，手机横屏时可尝试锁定方向（iOS 等不支持锁定的浏览器会提示手动横屏）；画面右上角另有「按键透明度」按钮（与全屏按钮分居两侧），点一下把整块虚拟手柄压到 20% 让出画面，再点一下恢复，选择会记住。手柄上的按键字母、方向箭头与「连发」都关掉了浏览器自带的长按手势，按住不放不会被「复制 / 搜一搜」菜单打断。
- 玩家工具条：云存档读写、重载游戏（重启模拟器）、金手指、FDS 换面 / 换盘（磁碟机游戏才有）。金手指按 ROM 分成两部分：管理员在后台为游戏内置的代码（玩家只需开关），以及玩家自己添加的代码（保存在本机浏览器）。两者都即时下发给 core，由 core 解析代码文本（Nestopia / FCEUmm / Snes9x / mGBA / Genesis Plus GX / PicoDrive / PCSX-ReARMed 等实现了 `retro_cheat_set` 的 core 生效）；未实现该接口的 core（如 FBNeo、MAME 2003-Plus、QuickNES）会忽略代码。
- 播放页布局：手机端保存 / 读档 / 重置 / 金手指浮在画面右上角、紧挨「按键透明度」按钮，竖屏横排，横屏与全屏竖排并与它同列（排在正下方），FDS 的换面 / 换盘另起一组排在左上角全屏按钮正下方，顶部只留返回、居中的游戏信息与末端的版本选择 / 房间玩家列表；PC 宽屏同一组按钮改成图文按钮排在画面右侧、与画面上沿对齐，一行两个，窗口变窄或页面缩放排不开时收成一行一个，再放不下才退回顶部工具条。画面（crt-screen）左右等宽占位对称，始终停在页面正中，版本选择、房间玩家列表与全屏按钮位置不变。
- 全屏与浮层：全屏的元素是整个播放页，金手指弹窗与按键设置在它内部渲染，弹窗按容器高度自适应、列表内部滚动 —— 原生全屏、iOS / 微信的 CSS 伪全屏、以及浏览器不给锁方向时整页被转成横版的兜底全屏下都能正常打开且不超出屏幕。
- 交互与分页：提示、确认、输入全部是站内弹窗（`frontend/src/components/AppDialog.vue` + `frontend/src/composables/useAppDialog.js`，多条按顺序排队），不再弹浏览器自带的 `alert` / `confirm` / `prompt`；删除类操作的确认按钮是危险色、默认聚焦「取消」，Esc 或点遮罩取消，切换路由会作废等待中的确认。列表分页统一由 `frontend/src/components/ClayPagination.vue` 提供（游戏库、我的 ROM、后台 ROM 列表），按容器实际宽度自适应 —— 优先保住页码个数，其次保住「跳转」，最后才把按钮收小一档；「跳转」走站内输入弹窗并校验页码范围。
- 站点图标：`frontend/public/favicon.svg` 是唯一源文件（粘土粉圆角方块 + 奶油色方向键与 A / B 键），`favicon.ico` 给老浏览器兜底，`apple-touch-icon.png` 供 iOS 加到主屏；页签与书签优先用 SVG。
- 云存档：按 ROM 与槽位读写。
- 联机房间：公开/私有房间、房间码与密码、聊天、席位同步；host 推流画面与音频，guest 通过 DataChannel 回传输入，游客默认观战；房间内不提供 ROM 版本切换，统一跑进房时选定的版本。客机按键在 host 侧换算成一组只做内部中转的键注入 core，这组键同时会从「房主自己的键位」里全部避开，而且房主真的按到它们时页面会直接吞掉（不会打到别的玩家），客机只认经 DataChannel 回传的输入。STUN / TURN 都能在后台填写，保存后玩家刷新页面即生效，不需要重新构建镜像。
- 管理后台：用户、ROM、BIOS、站点设置（上传开关、联机开关、游客游玩、STUN 与 TURN 地址及连通性测试）；每个 ROM 可单独配置内置金手指（后台 ROM 列表里的「金手指」按钮）。
- ROM 与用户列表里的时间统一按 `Asia/Shanghai` 显示：数据库连接、Drizzle 映射和接口输出都固定同一个时区，不再出现差 8 小时的混用。
- ROM 封面与元数据可编辑；ROM 可转存到独立远端存储（Node 或 PHP 版，见 `deploy/README.md`），不限文件大小。

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
│   └── public/               # 站点图标：favicon.svg（源文件）、favicon.ico、apple-touch-icon.png
├── server/                   # Hono API 与 WebSocket 服务
│   ├── db/                   # Drizzle schema 与迁移
│   ├── middleware/           # 认证、CSRF、安全头、限流、错误处理
│   ├── routes/               # HTTP 与 WS 路由
│   └── rooms/                # 房间仓储、WS 准入、席位与信令策略
├── shared/registry/          # 前后端共享的平台、BIOS、协议常量
├── data/                     # bios、cores、uploads、saves
├── config/                   # Docker 部署用的 .env / app.json 示例
├── deploy/                   # 本机 systemd + Nginx 部署文件与说明（含 STUN.md 自建 STUN 教程）
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
| `VITE_WEBRTC_TURN_URLS` | 空 | TURN 地址，逗号分隔；后台「站点设置」里填写后以数据库为准，这里只作兜底 |
| `VITE_WEBRTC_TURN_USERNAME` / `VITE_WEBRTC_TURN_CREDENTIAL` | 空 | TURN 凭据，由服务端运行时下发给浏览器；后台填写优先 |
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
curl --fail http://127.0.0.1:32741/api/health   # {"ok":true,"version":"1.6.1"}
```

所有 Compose 命令都要在源码目录执行并显式带上 `--env-file`。宝塔面板的“Compose/编排”页面不一定读取外部环境变量文件，遇到 `Set ... in .env` 或本地构建提示时，改用宝塔终端执行上面的命令。

**3. 可选：叠加 coturn 中继**

只在跨网络联机（严格防火墙、不同运营商）打洞失败时才需要。先在 `config/.env` 里填好 TURN 段，并放行 `45123/tcp`、`45123/udp` 以及 relay 范围 `45124-45129/tcp`、`45124-45129/udp`（云安全组、系统防火墙、宝塔安全页三处都要放行），然后：

```bash
docker compose --env-file /www/wwwroot/game-biu/config/.env \
  -f compose.yaml -f compose.turn.yaml up -d --no-build
```

- `TURN_PUBLIC_HOST` 填 TURN 域名或公网 IP（不要带协议和端口），`TURN_PUBLIC_IP` 必须是数字 IPv4，`TURN_LISTENING_IP` / `TURN_RELAY_IP` 填本机网卡地址。
- 叠加启动后，服务端会在运行时把 TURN 地址和凭据下发给浏览器，无需重新构建镜像。地址与凭据也可以在后台「站点设置」的 TURN 中继里填写，此时以数据库里的值优先，改完点「测试 TURN 中继」可当场验证（填了用户名/密码会真的分配一次中继端口）。
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

生产建议在 `config/.env` 里固定版本标签（如 `APP_IMAGE=ghcr.io/xiaoxin0125/game-biubiubiu:v1.6.1`）而不是长期使用 `latest`，回滚时改回旧标签并执行 `up -d --no-build --force-recreate app` 即可。注意 `restart` 不会加载新的环境变量，修改 `config/.env` 或 `config/app.json` 后需要 `--force-recreate`。从 v1.1.x 升级到 v1.2.0 会在容器启动时自动执行金手指表迁移（`0006_rom_cheats.sql`）；v1.2.0 升级到 v1.3.0 没有新的表结构变更，直接替换镜像即可；v1.3.0 升级到 v1.4.0 同样没有表结构变更；v1.4.0 升级到 v1.5.0 也没有新的表结构变更，替换镜像后建议再执行一次 `node deploy/build-cores.mjs` 发布当前核心（版本化核心地址与远端托管依赖它，见 `deploy/README.md`）；v1.5.0 升级到 v1.5.1 只改了前端与图标资源，没有表结构变更，替换镜像即可（改过图标配色的话记得重新构建前端）；v1.5.1 升级到 v1.5.2 同样只改前端（FDS 换面 / 换盘按钮、键盘中转键隔离、统一弹窗与分页），没有表结构变更，替换镜像或重新构建前端即可；v1.5.2 升级到 v1.6.0 新增七个平台、四颗 libretro 核心、前端托管的 J2meJS 运行时与三组 BIOS 资源；需补齐 `data/cores`（四份新增核心）与 `data/bios`（`pcecd` / `neogeocd` / `3do` 三个目录），重新构建前端以发布 `j2me/` 资源，并执行一次 `node deploy/build-cores.mjs` 生成新的核心发布版本（远端资源服务器也要同步这一版，见 `deploy/sync-cores.sh`）；v1.6.0 升级到 v1.6.1 只改前端构建与运行时目录（移除了被替换掉的 js2me 运行时与已删除的封面图，并修好构建前的清理），没有表结构变更，也没有新的核心与 BIOS，重新构建前端即可。

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
| `nes` | `.nes`、`.unif`、`.unf`、`.zip` | `nestopia`、`fceumm`、`quicknes` | 2P |
| `fds` | `.fds`、`.zip` | `nestopia`、`fceumm` | 2P |
| `sfc` | `.smc`、`.sfc`、`.zip` | `snes9x` | 2P |
| `gb` | `.gb`、`.zip` | `mgba`、`gambatte`、`gearboy`、`tgbdual` | 1P |
| `gbc` | `.gb`、`.gbc`、`.cgb`、`.sgb`、`.zip` | `mgba`、`gambatte`、`gearboy`、`tgbdual` | 1P |
| `gba` | `.gba`、`.zip` | `mgba`、`mgba2`、`vba_next` | 1P，`mgba2` 为 4P 特例 |
| `megadrive` | `.md`、`.gen`、`.smd`、`.bin`、`.zip` | `genesis_plus_gx`、`picodrive` | 2P |
| `sms` | `.sms`、`.zip` | `genesis_plus_gx`、`picodrive`、`gearsystem` | 1P |
| `gamegear` | `.gg`、`.zip` | `genesis_plus_gx`、`gearsystem` | 1P |
| `sega32x` | `.32x`、`.bin`、`.gen`、`.md`、`.zip` | `picodrive` | 2P |
| `psx` | `.chd`、`.cue`、`.bin`、`.iso`、`.pbp`、`.m3u` | `pcsx_rearmed` | 2P，3/4P 联机启用 multitap 配置 |
| `pcengine` | `.pce`、`.zip` | `mednafen_pce_fast` | 2P |
| `pcecd` | `.chd`、`.cue`、`.ccd`、`.toc`、`.m3u` | `mednafen_pce_fast` | 2P |
| `neogeocd` | `.chd`、`.cue` | `neocd` | 2P |
| `ngp` | `.ngp`、`.ngc`、`.ngpc`、`.npc`、`.zip` | `mednafen_ngp` | 1P（核心只认一个手柄口） |
| `3do` | `.chd`、`.cue`、`.iso`、`.bin` | `opera` | 2P |
| `j2me` | `.jar` | 本机托管的 `j2mejs` | 1P |

一台机器在表里只有一条记录：红白机 / NES 记作 `nes`（界面显示「任天堂红白机 (FC / NES)」，徽章 `FC`），超任 / SNES 记作 `sfc`（`SFC`），世嘉五代 / MD / Genesis 记作 `megadrive`（`MD`）。区域叫法不再各占一条平台记录，否则分类筛选里同一台机器会出现两项、其中一项一盘游戏都没有，同一款游戏一半标 `nes`、一半标 `famicom` 时也无法互为版本。历史数据里的旧别名（`famicom`、`snes`、`genesis`）由迁移 `0008_platform_aliases` 并到通用名上，后端收到老客户端上传的别名也会先归一（见 `shared/registry/platform-roms.js` 的 `normalizePlatformId()`）。注意平台 id 是 ROM 记录上的字段，同时也是分组键：上传页按扩展名自动识别只认「一个扩展名基本只可能属于一台机器」的情况（`.nes`、`.unif`、`.unf` → `nes`，`.smc`、`.sfc` → `sfc`，`.md`、`.gen`、`.smd` → `megadrive`，`.pce` → `pcengine`，`.32x` → `sega32x`，`.ngp` / `.ngc` / `.ngpc` / `.npc` → `ngp`，`.jar` → `j2me`，任何 `.zip` → `arcade`），光盘镜像（`.cue` / `.chd` / `.iso`）与 `.bin` 多台机器共用，不再自动识别，要手动选。首页的主机分类下拉框、我的 ROM 与后台的平台筛选都以「机器」为单位（每台机器一项、标签是平台表里的「中文 (英文)」，只列真有游戏的机器），所以不会再出现空分类。

BIOS 按平台放在 `data/bios/<平台>/` 下：FDS 需要 `disksys.rom`；PSX 常用 BIOS 为 `scph5500.bin`、`scph5501.bin`、`scph5502.bin`；PCE-CD 需要 `syscard3.pce`（去掉 512 字节 copier 头后的本体，MD5 `38179df8f4ac870017db21ebcbf53114`）；Neo Geo CD 需要 `neocd_f.rom` 与 `ng-lo.rom`（核心按 `system/neocd/` 找，挂载时的子目录由 `shared/registry/platform-bios.js` 的挂载表补上）；3DO 用日版 FZ-1 的 `panafz1j.bin` 与日版字库 `panafz1j-kanji.bin`（核心选项里已点名这两份）；J2ME 改用前端本机托管的 J2meJS，不需要 BIOS；当前上传格式只接受 `.jar`，JAD/JAM 描述文件需要先取得对应 JAR 后再上传；`.sqc` 不受支持。J2meJS 的 MIDP/厂商扩展兼容性有限，不保证所有 Java 游戏都能运行；不支持即时存档/读档，游戏内 RMS 存档仅在当前运行会话有效。后台「BIOS 文件」页会列出每个平台的必填项与缺失文件。

Opera 的浏览器核心需要让 libretro-common 的头文件与 RetroArch 实现一致；构建版本、CHD 支持和真实浏览器回归步骤见 [`deploy/opera-build.md`](deploy/opera-build.md)。Java 运行时的许可证、站点补丁、手机端（WebKit）启动修复与运行时资源版本号见 [`frontend/public/j2me/INTEGRATION.md`](frontend/public/j2me/INTEGRATION.md)；它的沙箱 iframe 必须留在屏幕内并靠 `opacity` 隐藏，一旦被挪出屏幕，Chrome 会把它的定时器压到每秒一次，游戏会明显卡顿。

FDS 是磁碟机，游戏中途要换 A / B 面：播放页的按钮组里会多出「换面」「换盘」两颗（键盘默认对应 `U` 与 `P`，也能在按键设置里改）。nestopia 下「换面」直接翻到另一面，「换盘」在双盘游戏里换到另一张盘；fceumm 下要先「换盘」弹出、再「换面」选面、再「换盘」插回。这两颗按布局走：PC 宽屏在画面右侧那组图文按钮里，窄屏退回顶部工具条时也一起排进工具条；手机端不跟右上角那组挤在同一排，而是排在画面左上角全屏按钮的正下方，尺寸与全屏 /「按键透明度」按钮一致（42px），竖屏窄到 320px 也不会顶出屏幕。

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

**房间能进入但没有画面 / 一直显示“握手中”？** 通常是 WebRTC 只配置了 STUN，严格防火墙或跨运营商网络无法打洞。先在后台「站点设置」填写可用的 STUN（填好后点「测试 STUN 服务器」，会从服务器发真实 STUN 请求并给出结论；自建方法见 `deploy/STUN.md`）并让玩家刷新页面；仍然失败时按上文第 3 步部署 coturn 并开放端口，把 TURN 地址与凭据填进后台「TURN 中继」再点「测试 TURN 中继」确认可用，最后用 `VITE_WEBRTC_FORCE_RELAY=1` 验证中继链路。只开放少量 relay 端口时并发能力会明显受限。

**游客为什么不能控制？** 游客默认观战。需要在后台开启游客游玩开关，且房间允许游玩，游客才会获得可控制席位。

**忘记管理员密码？** 首个管理员只在数据库为空时创建。忘记密码需要直接修改数据库中的密码哈希，或者在确认没有重要数据后重建数据库并重新初始化。

**修改了 `config/.env` 或 `config/app.json` 为什么不生效？** 配置文件在进程启动时读取。systemd 部署执行 `sudo systemctl restart games-online`，Compose 部署执行 `up -d --no-build --force-recreate app`；`restart` 不会加载新的环境变量。

**`.env` 与 `config/*` 谁优先？** 检测到的配置文件中的受支持字段会覆盖同名环境变量；`APP_CONFIG_FILE` 可以指定任意路径。Docker 部署里 `/app/config/.env` 是唯一需要维护的应用配置文件。
