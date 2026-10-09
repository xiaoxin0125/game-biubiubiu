# rom-upload —— ROM 远端存储服务（PHP 版）

和 Node 版（`/www/wwwroot/rom-upload`）功能、接口、数据目录结构完全一致，主站不需要
改代码：在后台「站点设置 → 远端存储」里把**地址**换成这个站点的地址、**密钥**填成
`config.json` 里的 `token`，点「测试连接」通过即可。

适用场景：远端那台服务器不方便装 Node，只有 PHP + Nginx/Apache（宝塔新建一个 PHP 站点即可）。

- 只依赖 PHP 7.4+（默认扩展即可），无需 composer、无需数据库。
- 浏览器永远不会直接访问本服务：上传/下载都由主站服务端带密钥转发，密钥不下发前端。
- 支持 `Range` 断点续传，模拟器读取大文件时可以分段请求。

## 文件结构

```
/www/wwwroot/rom-upload-php/
├── index.php             # 服务本体（单文件）
├── config.json           # 实际配置（从 config.example.json 复制修改）
├── config.example.json   # 配置模板
├── .htaccess             # Apache 重写规则（Nginx 用不到）
├── nginx.conf.example    # 宝塔/Nginx 配置片段说明
├── README.md             # 本文件
└── data/
    ├── .htaccess         # Apache：拒绝外部访问 data
    ├── files/<id>.bin    # 文件内容
    └── meta/<id>.json    # 元数据（原始文件名、大小、sha256、上传时间）
```

## 配置

`config.json`（也可以用环境变量 `TOKEN` / `DATA_DIR` / `MAX_FILE_BYTES`）：

| 字段 | 环境变量 | 说明 |
|---|---|---|
| `token` | `TOKEN` | 共享密钥，**至少 16 位**，必须和主站后台配置一致 |
| `dataDir` | `DATA_DIR` | 存储根目录，默认 `./data`（要可写，建议放在站点根目录下） |
| `maxFileBytes` | `MAX_FILE_BYTES` | 单文件上限，默认 200MB |

```bash
cp config.example.json config.json
# 生成密钥（或者直接填和 Node 版一样的 token，就能共用同一批数据）
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

## 部署（宝塔 + Nginx）

1. 面板 → 网站 → 添加站点：填域名或 `IP:端口`，PHP 版本 7.4+，站点根目录指向本目录；
2. 网站 → 设置 → 伪静态，粘贴：

   ```
   location / {
       try_files $uri $uri/ /index.php?$query_string;
   }
   ```

3. 网站 → 设置 → 配置文件，在 `server { }` 里补上（宝塔默认 `client_max_body_size` 只有 1m，
   不改的话大 ROM 会被 Nginx 直接 413 拦掉，根本进不到 PHP）：

   ```
   client_max_body_size 200m;
   fastcgi_read_timeout 600s;
   fastcgi_send_timeout 600s;
   location ^~ /data/ { deny all; }
   ```

4. 目录权限与保护：`data/` 需要 www 用户可写；`config.json` 建议 `chmod 600`。
   `location ^~ /data/` 必须加，否则有人可以直接下载别人上传的 ROM。

Apache 环境不用手改配置：仓库里的 `.htaccess`（重写 + 拒绝 data）放好就能用。

## 快速自测（不装 Nginx 也能验证）

```bash
cd /www/wwwroot/rom-upload-php
php -S 127.0.0.1:8791 index.php        # 用 PHP 内置服务器跑起来

curl -s http://127.0.0.1:8791/health -H "X-Token: $TOKEN"
curl -s -X POST http://127.0.0.1:8791/upload \
  -H "X-Token: $TOKEN" -H "X-Filename: kof97.zip" \
  --data-binary @kof97.zip
curl -s -H "X-Token: $TOKEN" -H "Range: bytes=0-99" \
  http://127.0.0.1:8791/files/<id> | wc -c
curl -s -X DELETE http://127.0.0.1:8791/files/<id> -H "X-Token: $TOKEN"
```

内置服务器是单进程的，只适合自测；正式使用请走 Nginx + PHP-FPM。

## 接口

除 `/health` 外都需要请求头 `X-Token`。日常请在主站后台点「测试连接」，不必手敲。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health` | 健康检查：版本、存储目录、是否可写、文件数、占用字节、剩余空间 |
| `POST` | `/upload` | 上传：请求体为原始字节，`X-Filename` 传文件名（URL 编码），可选 `X-Sha256` 校验 |
| `GET` | `/files/:id` | 读取文件，支持 `Range` |
| `HEAD` | `/files/:id` | 只取文件头信息 |
| `DELETE` | `/files/:id` | 删除文件（主站永久删除 ROM 时会调用） |

## 和 Node 版的关系

- 两版的数据目录结构相同，可以直接把 `data/` 整个复制过去，已上传的 ROM 不用重传；
- 主站只认「地址 + 密钥」，所以两版可以随时切换，甚至同时部署互为备份；
- 如果远端那台服务器有 Node，用哪版都行；只有 PHP 时用本版。
