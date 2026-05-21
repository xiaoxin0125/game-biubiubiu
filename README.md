# Games Online

Games Online 是一个自托管浏览器游戏厅：Vue 前端 + Hono 后端 + MySQL 持久化，支持 ROM 管理、云存档、公开大厅、创建/加入房间、WebSocket 信令和 WebRTC 联机观战/对战。

## 功能概览

- 多平台 ROM 管理：上传、公开/私密、多版本、收藏、回收站。
- 浏览器模拟器：基于 Nostalgist/libretro，核心与 BIOS 可本地托管，启用 rewind，轻量核心启用 1 帧 run-ahead。
- 移动端虚拟手柄：支持 8 向摇杆、MOBA 式多点滑动、PS1 L2/R2、安全区适配、连发开关和防长按菜单。
- 联机房间：公开大厅、私密房、房间码、聊天、游客围观。
- WebRTC 推流：房主运行模拟器，客人接收画面/音频，输入通过 DataChannel 回传。
- 账号与存档：注册、登录、改密、云存档，本地存档兜底。
- 管理后台：用户、ROM、BIOS 列表、站点设置、联机开关、上传开关。

## 快速启动

```bash
npm install
npm run dev
```

开发模式会同时启动：

- API：`http://localhost:3000`
- Web：`http://localhost:5173`

生产模式：

```bash
npm ci
npm run build
npm start
```

## 默认管理员

首次启动且数据库为空时会创建默认管理员：

- 用户名：`admin`
- 密码：`admin123`

生产环境请通过 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 在首次启动前覆盖，或首次登录后立即修改密码。

## 关键目录

```text
server/                 Hono API、WebSocket、MySQL/Drizzle
frontend/               Vue 前端，可独立构建为 frontend/dist
frontend/src/composables/player/ Player 页拆分后的联机/ROM/存档逻辑
data/bios/              BIOS 静态资产；管理后台 BIOS 页签会列出运行时会加载的 arcade/psx/fds 文件
data/cores/             libretro 核心静态资产
data/uploads/           运行时 ROM 上传目录，不建议提交
data/saves/             运行时云存档目录，不建议提交
docs/                   架构、联机、数据和部署维护文档
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | HTTP + WebSocket 端口 |
| `DATABASE_URL` | `mysql://games:games@127.0.0.1:3306/games_online` | MySQL 连接串 |
| `UPLOADS_DIR` | `data/uploads` | ROM 上传目录 |
| `BIOS_DIR` | `data/bios` | BIOS 目录 |
| `SAVES_DIR` | `data/saves` | 云存档目录 |
| `CORES_DIR` | `data/cores` | libretro 核心目录 |
| `MAX_UPLOAD_BYTES` | `104857600` | 单个 ROM 上传上限 |
| `MAX_STATE_BYTES` | `8388608` | 单个存档上传上限 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | 首次初始化管理员 |

## 联机模型

Games Online 的联机不是同步多个模拟器内核，而是：

```text
房主浏览器运行模拟器
  -> canvas.captureStream + AudioContext 生成媒体流
  -> WebRTC 发给客人
客人输入
  -> WebRTC DataChannel
  -> 房主浏览器合成 P2 键盘事件
  -> Nostalgist/RetroArch 接收输入
```

当前前端实质实现 P2 输入映射；后端可分配 P2~P4 席位，但 P3/P4 需要后续补充独立映射。

更多维护说明见：

- `docs/architecture.md`
- `docs/netplay.md`
- `docs/data-layout.md`
- `docs/deployment.md`

## 反向代理要点

`/api/rooms/:code/ws` 是 WebSocket 信令入口，反向代理必须透传 `Upgrade` 和 `Connection` 头。生产环境建议使用 HTTPS；如果跨 NAT 联机不稳定，需要部署 TURN。

## 许可

MIT。项目不附带任何 ROM 游戏内容，请自行准备合法 ROM。