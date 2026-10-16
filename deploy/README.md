# 部署说明（宝塔静态站点 + systemd）

本目录是当前服务器的实际部署方式，与 README 里的 Docker Compose 方案互不影响。

## 结构

| 文件 | 用途 |
|---|---|
| `games-online.service` | systemd 服务单元，运行 Node.js 后端（只监听 `127.0.0.1:3000`） |
| `nginx/extension-app.conf` | 宝塔站点的 `/api` 反向代理与前端路由回退配置 |
| `nginx/security-headers.conf` | 静态资源与文档的安全响应头片段（`frame-ancestors 'none'`），由 `extension-app.conf` include |
| `nginx/security-headers-self-frame.conf` | 同上，仅把「谁能嵌我」放宽成同源（J2ME 运行时页面要被播放页放进 iframe） |
| `STUN.md` | 在独立服务器（或主站本机）上部署 STUN 服务的完整步骤 |

前端由 Nginx 直接托管构建产物 `frontend/dist`，后端只处理 `/api`（含联机 WebSocket `/api/rooms/:code/ws`）。

## 核心资源（体积最大的一块）

模拟器核心（libretro 的 js/wasm）合计约 100 MB，比 ROM 大得多。发布与托管流程：

```bash
node deploy/build-cores.mjs            # 把 data/cores 打成 data/cores-dist/<版本>/（.gz + 清单）
node deploy/build-cores.mjs --prune    # 可选：只保留最近 2 个版本目录
CORES_SSH=root@<资源服务器> deploy/sync-cores.sh   # 同步到远端（原子发布，不删旧版本）
```

- 版本号由内容决定：同一个版本号下的字节永远不变，浏览器可以安心长缓存；换版本号
  等于强制更新。主站按 `<版本>/<文件名>` 提供回退地址，`data/cores-dist` 缺失时会按
  清单体积校验后顶用 `data/cores`，所以本机不需要存两份。
- 远端站点配置模板：`deploy/nginx/remote-cores.conf`（HTTPS + CORS + `gzip_static`）。
- 后台「站点设置 → 核心资源（远端托管）」里打开开关、填 `https://<域名>/releases`，
  点「测试远端核心」用浏览器实测跨域与压缩，再保存。开关关掉即强制使用本机——
  地址会被保留，下次要用直接打开开关。
- 别忘了给主站 nginx 的 `gzip_types` 加上 `application/wasm`，否则 34 MB 的 wasm 是明文传输。
- 细节、验收命令与回滚：`deploy/静态资源托管与带宽优化.md`。

## 大 ROM 远端存储（独立服务）

ROM 可以转存到独立服务 `rom-upload`，减轻主站磁盘压力（不限文件大小）：

```bash
# 代码和说明都在这里
cat /www/wwwroot/rom-upload/README.md

# 首次安装（已经装好，仅换服务器时需要重做）
sudo systemctl enable --now rom-upload
curl -s http://127.0.0.1:8790/health -H "X-Token: $(sudo cat /www/wwwroot/rom-upload/config.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')"
```

- 服务默认监听 `0.0.0.0:8790`，文件放在 `/www/wwwroot/rom-upload/data`；
- 主站后台「站点设置 → 远端存储」里填 **地址**（本机就是 `http://127.0.0.1:8790`）和 **密钥**（`config.json` 的 `token`），点「测试连接」确认；
- 地址和密钥都保存后，上传 ROM 时就会出现「上传到远端服务器」开关（不限文件大小）；
- 上传和播放都由主站带密钥转发，浏览器不会拿到密钥，也无需给远端开 CORS；
- 若远端在另一台机器，记得放行主站服务器 IP，并在远端改掉默认端口/密钥。

### 把已有 ROM 搬到远端（一键迁移）

后台「站点设置 → 远端设置 → 本地 ROM 一键迁移」：

- 「一键迁移到远端」把本站磁盘上还没迁走的 ROM 逐个上传（流式，多大都不进内存）、
  与本地逐一核对大小和 sha256 之后才更新记录，可随时「停止」；已经迁过的记录会跳过，
  所以重跑是安全的。任务跑在服务进程内存里（单实例），重启服务后重新点一次即可。
- 迁移往远端加一份，**本站磁盘上的文件原样保留**，那是远端 ROM 播放的唯一兜底：
  玩家浏览器直连远端失败（远端不可用、网络不通）时前端会改回主站读本地副本。
  302 之前主站还会先体检一次远端（结果缓存 30 秒），远端整体挂了就不会把玩家
  送到一个连不上的地址上。主站不再带密钥代理回源，所以本地副本不要手工删除，
  否则该 ROM 在没有直连时无法播放。
- 需要预演、限定范围（`--id` / `--min-size`）或留回滚文件时，仍可用命令行版
  `node deploy/migrate-roms-to-remote.mjs`，它和后台走同一套上传与校验逻辑。

### 远端只有 PHP 时（PHP 版 rom-upload）

远端那台机器不方便装 Node（只有 PHP + Nginx/Apache，例如另一台宝塔服务器）时，用 PHP 版即可，
主站不需要改任何代码：

- 文件位置：`/www/wwwroot/rom-upload-php`（`index.php` 单文件 + `config.json` + `README.md`），
  只依赖 PHP 7.4+，不需要 composer、数据库或额外扩展；
- 部署：宝塔新增一个 PHP 站点，站点根目录指向该目录，按目录内 `README.md` 加伪静态、
  `client_max_body_size 200m`、`fastcgi_read_timeout 600s`，并用 `location ^~ /data/ { deny all; }`
  保护数据目录；Apache 直接放好 `.htaccess` 即可；
- 两版接口、`data/` 目录结构完全一致，可以把已上传的 ROM 整目录复制过去，也可以在后台
  「站点设置 → 远端存储」里把地址/密钥在两版之间随时切换（甚至互为备份）；
- 自测命令见 `/www/wwwroot/rom-upload-php/README.md`（`php -S 127.0.0.1:8791 index.php`）。

## 首次安装

```bash
sudo cp /www/wwwroot/xbw.ppxin.com/deploy/games-online.service /etc/systemd/system/games-online.service
sudo mkdir -p /www/server/panel/vhost/nginx/extension/xbw.ppxin.com/includes
sudo cp /www/wwwroot/xbw.ppxin.com/deploy/nginx/security-headers.conf \
        /www/wwwroot/xbw.ppxin.com/deploy/nginx/security-headers-self-frame.conf \
        /www/server/panel/vhost/nginx/extension/xbw.ppxin.com/includes/
sudo cp /www/wwwroot/xbw.ppxin.com/deploy/nginx/extension-app.conf /www/server/panel/vhost/nginx/extension/xbw.ppxin.com/app.conf

sudo systemctl daemon-reload
sudo systemctl enable --now games-online
sudo /www/server/nginx/sbin/nginx -t && sudo /www/server/nginx/sbin/nginx -s reload
```

宝塔生成的站点配置已经 include 了 `/www/server/panel/vhost/nginx/extension/<域名>/*.conf`，因此不要在面板里再添加 `location /`，以免出现重复的 location 报错。

两个安全头片段必须放在 `includes/` 子目录里：通配的 `*.conf` 不会递归到子目录，它们只由 `extension-app.conf` 按需 include（每个 location 引一遍 —— nginx 的 `add_header` 不继承）。升级时这两个文件要跟着 `extension-app.conf` 一起同步，漏放会让上面那句 `nginx -t` 直接失败。

## 日常发布

```bash
cd /www/wwwroot/xbw.ppxin.com
git pull
npm ci
npm run build
node deploy/build-cores.mjs        # 只有 data/cores 变过时才需要重新发布核心
sudo systemctl restart games-online
```

## 备份、恢复与密钥轮换

数据库与 `data/` 是全部状态，两者要么一起备份、要么一起恢复（ROM 记录指向 `data/uploads` 里的
文件，只恢复一半会出现"记录在、文件不在"）。

```bash
# 备份：数据库 + data 目录（uploads / saves / bios 等），按日期归档
sudo mysqldump --single-transaction --routines games_online | gzip > /root/backup/games-$(date +%F).sql.gz
sudo tar czf /root/backup/games-data-$(date +%F).tar.gz -C /www/wwwroot/xbw.ppxin.com data
sudo chmod 600 /root/backup/games-*

# 恢复：先停服务，再按同样的顺序还原（数据库 → data 目录 → 起服务）
sudo systemctl stop games-online
gunzip -c /root/backup/games-2026-10-15.sql.gz | sudo mysql games_online
sudo tar xzf /root/backup/games-data-2026-10-15.tar.gz -C /www/wwwroot/xbw.ppxin.com
sudo chown -R www:www /www/wwwroot/xbw.ppxin.com/data
sudo systemctl start games-online && curl -fsS http://127.0.0.1:3000/api/health
```

需要轮换的密钥与轮换动作（轮换后都要重启服务，并确认 `/api/health` 正常）：

| 密钥/凭据 | 位置 | 轮换方式 |
| --- | --- | --- |
| 数据库口令 | `DATABASE_URL`（`.env`）、MySQL 用户 | `ALTER USER ... IDENTIFIED BY '新口令'` 后改 `.env` |
| 首个管理员口令 | `ADMIN_PASSWORD`（`.env`） | 只在数据库为空时用于播种；改管理员口令请在站点里登录后改密（会让该账号其它会话立刻失效） |
| TURN 共享密钥 | 后台「站点设置 → TURN 中继」+ coturn `static-auth-secret` | 两边同时改；临时凭据模式下旧凭据最多存活 `ttl` 秒 |
| 远端存储密钥 | 后台「站点设置 → 远端存储」+ 远端 `config.json` | 两边同时改，改完点「测试远端存储」 |

``.env` 里是数据库口令、TURN 与远端存储凭据，权限固定为 `640`、属主 `www`（运行服务的用户）、
属组 `ubuntu`（服务器上跑测试与发版脚本的账号），同机其他用户读不到（2026-10 审计 L-4）。
迁移服务器时不要用会放宽权限的拷贝方式：`git clone` 不会带上它，`cp -r` 之后记得
`chown www:ubuntu .env && chmod 640 .env`。

## 常用命令

```bash
sudo systemctl status games-online
sudo journalctl -u games-online -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://xbw.ppxin.com/api/health
curl -fsS https://xbw.ppxin.com/api/cores/manifest | head -c 200   # 当前核心发布版本
npm test                            # 回归测试（等价于 node --test "tests/*.test.js"，不需要数据库）
npm run lint                        # ESLint（CI 同样会跑）
npm run test:coverage               # 带覆盖率的测试报告（仅供参考，CI 不设阈值）
```

## 注意事项

- 站点根目录是 `frontend/dist`，宝塔申请、续签 HTTPS 证书时会把校验文件写到 `frontend/dist/.well-known/acme-challenge`，该目录由 root 创建。`frontend/vite.config.js` 已设置 `emptyOutDir: false`，构建脚本只清理 vite 自己生成的 `dist/assets` 和 `dist/index.html`，因此证书目录不会导致构建失败。
- 核心与 ROM 都有"浏览器直连远端"的开关，位置在后台「站点设置」：核心是「核心资源（远端托管）」，
  ROM 是「远端存储 → ROM 由浏览器直连远端下载」。两者都默认走本机，验收通过后再打开；
  关闭后立刻回退本机路径（核心关开关，ROM 走本地副本）。ROM 直连打开后，浏览器端拿到
  网络错误或非 2xx 会自己改回本站读本地副本，不必人工介入。
- 远端若跑的是旧的 rom-upload（Node / PHP 两版），浏览器直连需要的 `/signed/:id` 接口要先用
  `node deploy/patch-remote-signed.mjs <目标文件>` 补上（幂等、会先备份）。
- 存量 ROM 迁到远端有两个入口：后台「站点设置 → 远端设置 → 本地 ROM 一键迁移」（日常用这个），
  或命令行 `node deploy/migrate-roms-to-remote.mjs`（默认预演，支持 `--id` / `--min-size` 限定范围
  并写出可回滚的 JSON）。两者都保留原记录 id 与收藏/存档/房间等关联，本地文件也原样保留 ——
  它是远端 ROM 播放的兜底（远端直连失败时主站读它），所以不要手工删。
- STUN 不再通过环境变量下发，改为后台“站点设置”中填写，保存在数据库里，保存后无需重新打包。保存前可以点「测试 STUN 服务器」：后端会向填写的地址发真实 STUN 请求（UDP/TCP）并报告延迟与出口地址，浏览器侧再做一次 ICE 采集自检。TURN 同样是后台「站点设置 → TURN 中继」里的地址 + 用户名 + 密码优先，环境变量 `VITE_WEBRTC_TURN_*` 只作兜底；点「测试 TURN 中继」时若填了凭据会真的分配一次中继端口。在另一台服务器上自建 STUN 服务的方法见 `deploy/STUN.md`。
- 数据库里的时间统一按 `Asia/Shanghai`（+08:00）读写：`server/db/index.js` 建连接时会话时区钉在 `+08:00`，`server/db/schema.js` 也用自定义 timestamp 类型做同样的换算（见 `server/db/timezone.js`）。服务器的系统时区或 `TZ` 与它不一致时，列表里显示的时间不会跟着偏，但 MySQL 里已有的历史数据需按同一时区理解。
- `.env` 中的 `NODE_ENV=production` 会使写请求校验 Origin。`CSRF_ALLOWED_ORIGINS` 必须包含浏览器实际访问的地址。
- 站点已经启用 HTTPS 强制跳转，所以写入 `CSRF_ALLOWED_ORIGINS` 的地址必须是 `https://xbw.ppxin.com`。
- 静态资源托管/带宽优化的完整说明（含远端站点模板、验收命令、回滚、待核实条件）见
  `deploy/静态资源托管与带宽优化.md`。
