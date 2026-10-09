# 部署说明（宝塔静态站点 + systemd）

本目录是当前服务器的实际部署方式，与 README 里的 Docker Compose 方案互不影响。

## 结构

| 文件 | 用途 |
|---|---|
| `games-online.service` | systemd 服务单元，运行 Node.js 后端（只监听 `127.0.0.1:3000`） |
| `nginx/extension-app.conf` | 宝塔站点的 `/api` 反向代理与前端路由回退配置 |

前端由 Nginx 直接托管构建产物 `frontend/dist`，后端只处理 `/api`（含联机 WebSocket `/api/rooms/:code/ws`）。

## 大 ROM 远端存储（独立服务）

超过 3MB 的 ROM 可以转存到独立服务 `rom-upload`，减轻主站磁盘压力：

```bash
# 代码和说明都在这里
cat /www/wwwroot/rom-upload/README.md

# 首次安装（已经装好，仅换服务器时需要重做）
sudo systemctl enable --now rom-upload
curl -s http://127.0.0.1:8790/health -H "X-Token: $(sudo cat /www/wwwroot/rom-upload/config.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')"
```

- 服务默认监听 `0.0.0.0:8790`，文件放在 `/www/wwwroot/rom-upload/data`；
- 主站后台「站点设置 → 远端存储」里填 **地址**（本机就是 `http://127.0.0.1:8790`）和 **密钥**（`config.json` 的 `token`），点「测试连接」确认；
- 地址和密钥都保存后，上传 ROM 时超过 3MB 就会出现「上传到远端服务器」开关；
- 上传和播放都由主站带密钥转发，浏览器不会拿到密钥，也无需给远端开 CORS；
- 若远端在另一台机器，记得放行主站服务器 IP，并在远端改掉默认端口/密钥。

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
sudo cp /www/wwwroot/xbw.ppxin.com/deploy/nginx/extension-app.conf /www/server/panel/vhost/nginx/extension/xbw.ppxin.com/app.conf

sudo systemctl daemon-reload
sudo systemctl enable --now games-online
sudo /www/server/nginx/sbin/nginx -t && sudo /www/server/nginx/sbin/nginx -s reload
```

宝塔生成的站点配置已经 include 了 `/www/server/panel/vhost/nginx/extension/<域名>/*.conf`，因此不要在面板里再添加 `location /`，以免出现重复的 location 报错。

## 日常发布

```bash
cd /www/wwwroot/xbw.ppxin.com
git pull
npm ci
npm run build
sudo systemctl restart games-online
```

## 常用命令

```bash
sudo systemctl status games-online
sudo journalctl -u games-online -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://xbw.ppxin.com/api/health
```

## 注意事项

- 站点根目录是 `frontend/dist`，宝塔申请、续签 HTTPS 证书时会把校验文件写到 `frontend/dist/.well-known/acme-challenge`，该目录由 root 创建。`frontend/vite.config.js` 已设置 `emptyOutDir: false`，构建脚本只清理 vite 自己生成的 `dist/assets` 和 `dist/index.html`，因此证书目录不会导致构建失败。
- STUN 不再通过环境变量下发，改为后台“站点设置”中填写，保存在数据库里，保存后无需重新打包。TURN 仍通过 `VITE_WEBRTC_*` 环境变量配置。
- `.env` 中的 `NODE_ENV=production` 会使写请求校验 Origin。`CSRF_ALLOWED_ORIGINS` 必须包含浏览器实际访问的地址。
- 站点已经启用 HTTPS 强制跳转，所以写入 `CSRF_ALLOWED_ORIGINS` 的地址必须是 `https://xbw.ppxin.com`。
