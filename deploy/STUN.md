# STUN 服务器部署（独立服务器）

本文说明如何在一台单独的服务器上部署 STUN 服务，供本站联机（WebRTC）使用。
服务端软件用 coturn（Debian/Ubuntu 官方源自带，只开 STUN 不需要证书和密钥）。

## 0. 先确认需不需要

- **不配 STUN 也能部署和单机游玩**。后台「站点设置 → STUN 服务器」留空时，联机只能尝试直连（浏览器给出的本机候选地址）。
- 同一局域网内的两台设备联机：不用 STUN。
- 跨网络（不同宽带/4G、家里连公司）联机：**需要 STUN**，让浏览器发现自己在公网上的地址；如果双方网络还有严格防火墙或对称 NAT，STUN 还不够，需要额外的 TURN 中继（见根目录 `README.md` 的 coturn 叠加编排）。
- 可以单开一台服务器，也可以直接在主站那台机器上装（本文步骤完全相同，只是 STUN 地址填 `stun:主站IP:3478`；系统防火墙和云安全组同样要放行，若主站只监听 127.0.0.1 的端口没有冲突）。

STUN 只做地址发现，不转发游戏流量。带宽占用极小（每个玩家每秒几十字节），1 核 512MB 的机器足够。

## 1. 端口准备

| 端口 | 用途 | 是否必须 |
|---|---|---|
| `3478/udp` | STUN（`stun:主机:3478`） | 必须 |
| `3478/tcp` | 同端口 TCP 回退 | 可选，建议一起放行 |
| `5349/tcp` / `5349/udp` | TLS 版 STUN（`stuns:主机:5349`） | 本项目不要求，可跳过 |

只做 STUN 不需要放行 relay 端口段（那是 TURN 才需要的）。

## 2. 安装 coturn

```bash
sudo apt update && sudo apt install -y coturn
```

Ubuntu 24.04（本次实测版本：4.6.2）和 Debian 11+、Ubuntu 20.04+ 都可以直接用官方包。

## 3. 写配置

先取本机内网 IP 和公网 IP：

```bash
ip -4 addr show scope global | awk '/inet /{print $2}'        # 内网地址，例如 10.0.8.13
curl -4 -s https://ifconfig.me; echo                            # 公网地址，例如 203.0.113.20
```

写入 `/etc/turnserver.conf`（把两处 IP 换成上面的实际值）：

```ini
listening-port=3478
# 让 STUN 返回的地址是公网地址。格式必须是「公网IP/内网IP」两段：
# 只写一个地址（例如 external-ip=203.0.113.20）是无效写法，
# 服务能启动但收不到客户端的 STUN 请求。
external-ip=203.0.113.20/10.0.8.13
# 只提供 STUN：不启用 TLS/DTLS，也不启用中继（不配 user/realm）
no-tls
no-dtls
# 备用端口默认是「监听端口+1」和「TLS端口+1」。如果同机还有其他服务
# 占着相邻端口（常见：nginx / 宝塔面板），coturn 会一直报
# "Cannot bind TLS/TCP listener socket ... Address already in use" 并反复重试，
# 必须显式挪走。
alt-listening-port=3479
alt-tls-listening-port=3480
# 日志
log-file=/var/log/coturn/turnserver.log
pidfile=/run/turnserver.pid
simple-log
no-stdout-log
```

如果机器直接绑公网 IP、没有云平台 NAT，把 `external-ip` 整行删掉即可。

## 4. 启动服务

```bash
sudo install -d -o turnserver -g turnserver /var/log/coturn

# coturn 自带的 unit 只有 TURNSERVER_ENABLE=1 时才启动，这里用 override 常驻。
# 注意 Type=simple + 前台运行是本文验证过的组合：
# 老版本 coturn（如 Ubuntu 22.04 自带的 4.5.2）不支持 --no-daemon，
# 而 unit 默认的 Type=notify 在守护/前台行为不一致时会把服务卡在 activating。
# 把 User 改成机器上实际存在的用户（装 coturn 的包一般会创建 turnserver 用户；
# 若用宝塔/其他面板装的，机器上可能没有该用户，用 www 等已有账号代替即可）。
sudo mkdir -p /etc/systemd/system/coturn.service.d
sudo tee /etc/systemd/system/coturn.service.d/override.conf <<'EOF'
[Service]
Type=simple
User=root
ExecStart=
ExecStart=/usr/bin/turnserver -c /etc/turnserver.conf --pidfile=
Restart=on-failure
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now coturn
systemctl status coturn --no-pager
```

以 root 启动、让 coturn 自己在初始化后降权，可以避免非 root 用户绑端口或写 `/run` 时的权限问题。日志文件目录要存在且可写（配置里没改 `log-file` 时默认写 `/var/log/turnserver.log`）。

日志（排查时第一时间看这里）：

```bash
sudo tail -f /var/log/coturn/turnserver.log
```

## 5. 放行 3478

三处都要放行，缺一处外部就连不上：

1. **云平台安全组**：腾讯云/阿里云轻量服务器的「防火墙」、AWS 的 Security Group、Oracle Cloud 的 Security List 里加一条入站规则：协议 `UDP`、端口 `3478`、来源 `0.0.0.0/0`（建议同时加 `TCP 3478`）。腾讯云轻量服务器的防火墙在「轻量应用服务器 → 防火墙」页面。
2. **系统防火墙**（装了 ufw/firewalld 才需要）：

   ```bash
   sudo ufw allow 3478/udp
   sudo ufw allow 3478/tcp
   sudo ufw status
   ```

3. **宝塔面板**（如果这台机器装了宝塔）：面板「安全」页添加放行 `3478`，协议选「UDP/TCP」。

## 6. 验证

### 6.1 服务在监听

```bash
sudo ss -lunp | grep 3478
# 期望：UNCONN ... 0.0.0.0:3478 users:(("turnserver",pid=...,fd=..))
```

### 6.2 本机自测

```bash
sudo apt install -y python3
python3 - <<'EOF'
import socket, os, struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)   # 换成 socket.AF_INET6 + ('::1', 3478) 可测 IPv6
s.settimeout(3)
txid = os.urandom(12)
s.sendto(struct.pack('>HHI12s', 1, 0, 0x2112A442, txid), ('127.0.0.1', 3478))
try:
    data, addr = s.recvfrom(2048)
except socket.timeout:
    print('没有响应：检查 coturn 是否在运行、external-ip 是否配错')
    raise SystemExit(1)
print('来自', addr, '，响应类型 0x%04x，长度 %d 字节' % (struct.unpack('>H', data[0:2])[0], len(data)))
print('事务 ID 匹配' if data[8:20] == txid else '事务 ID 不匹配（不是这次请求的响应）')
EOF
```

### 6.3 主站后台一键测试（推荐）

在**主站**后台「站点设置 → STUN 服务器」里填 `stun:这台服务器的公网IP:3478`，点「测试 STUN 服务器」：

- 后端会真的向这个地址发 STUN Binding 请求，几秒内给出结论：
  - `✓ ... 1ms · 解析到 203.0.113.20:3478 · 出口地址 123.45.67.89:xxxxx` —— 服务器从主站可达，`出口地址` 就是主站看到的来源地址；
  - `✗ ... 超过 2500ms 未收到响应（可能被防火墙拦截）` —— 安全组/防火墙没放行，或公网 IP 填错；
  - `✗ ... 端口拒绝连接（服务器没在监听该端口）` —— coturn 没起来或端口不对；
  - `✗ ... 域名无法解析` —— 填的是域名，但域名解析不到。
- 同一个面板还会用浏览器按这份地址做一次 ICE 采集，确认浏览器能接受该配置。

后台测试是**从主站服务器**发起的。它证明「服务器到服务器可达」，但玩家从公网能不能用，还取决于安全组是否对 `0.0.0.0/0` 放行。要在外网再确认一次，可以用手机流量（不连 Wi-Fi）打开站点，进后台点同一个「测试 STUN 服务器」，或用手机浏览器访问 WebRTC 官方示例页 <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>，只填 `stun:公网IP:3478` 点 Gather candidates，能看到 srflx 候选即说明公网可达。

## 7. 填回主站

后台「站点设置 → STUN 服务器」填：

```text
stun:公网IP或域名:3478
```

- 多个地址用逗号或换行分隔，保存后玩家刷新页面即生效，无需重新打包或重启。
- 如果同时部署了 TURN，STUN 地址填同一台机器的 `stun:主机:3478` 即可；coturn 的 `3478` 端口和 TURN 监听端口（`compose.turn.yaml` 里的 `45123`）互不影响。
- 保存后站点会把这个地址下发给浏览器，联机建立连接时优先用它发现自己对外的地址；没配 STUN 时只尝试直连。

## 8. Docker 部署（不想用系统包时）

```yaml
# docker-compose.yml，在专用服务器上单独运行
services:
  stun:
    image: coturn/coturn:alpine
    restart: unless-stopped
    network_mode: host          # STUN 必须用 host 网络，不能做端口映射
    command:
      - --listening-port=3478
      - --external-ip=203.0.113.20/10.0.8.13   # 公网IP/内网IP；直连公网则删掉这行
      - --no-tls
      - --no-dtls
      - --log-file=stdout
```

```bash
docker compose up -d
docker compose logs -f
```

`network_mode: host` 不能省：如果换成 `ports: ["3478:3478/udp"]`，coturn 会把容器内网地址当成来源地址返回，玩家拿到的就是无效地址。

## 9. 常见问题

下面几条都是从一台真实的「云主机 + 1:1 NAT + 同机有 nginx/宝塔」机器上踩出来的，遇到时按顺序对照：

- **`external-ip` 只写一个地址（无效）**：必须写成 `公网IP/内网IP` 两段。只写公网 IP 时服务能启动、端口在监听，但收不到客户端的 STUN 请求（表现为后台测试一直超时，而 `ping` 和 TCP 却是通的）。
- **日志刷 `Cannot bind TLS/TCP listener socket to addr <内网IP>:监听端口+1`**：这是 coturn 的「备用端口」和同机的 nginx/宝塔撞了。在配置里显式加上 `alt-listening-port=` 和 `alt-tls-listening-port=` 指到空闲端口即可（见第 3 步），否则日志会无限循环。
- **`systemctl` 显示 `activating` 或 `failed (Result: exit-code)`**：老版本 coturn（Ubuntu 22.04 自带 4.5.2）不支持 `--no-daemon`，而自带的 unit 是 `Type=notify`。按第 4 步改成 `Type=simple` + 前台运行（不要加 `-o`/`--daemon`）。
- **`Cannot create pid file: /var/run/turnserver.pid`**：以非 root 用户启动时写不了 `/run`。两个办法：配置里写 `pidfile=/run/turnserver.pid` 并用 root 启动（第 4 步的做法），或启动参数加 `--pidfile=`。
- **必须用 root 先起、初始化后再降权**：端口和日志目录都需要权限，`User=turnserver` 直接起会失败；`/tmp/turnserver.log` 里能看到 `New UID: turnserver(113)` 才说明降权成功。
- **后台测试一直超时**：按「云安全组 → 系统防火墙 → 宝塔安全」的顺序逐层检查。云平台安全组里 **UDP 和 TCP 要分别放行**，只加 TCP 时会出现「TCP 能连、UDP 无响应」的典型现象；测试期间可在服务器上 `tcpdump -n -i eth0 'udp port 14273'`，一边抓一边点后台测试按钮——**抓不到包就是云安全组没放行**（包在到达主机之前就被丢了）。
- **填了域名但解析不到**：确认域名 A 记录指向这台机器的公网 IP，且没有经过 CDN 或反向代理（例如宝塔/CDN 的 HTTP 代理不转发 UDP）。
- **公网 IP 变化**：云主机的弹性 IP 一般固定；如果是会变的 IP，改用域名，并重启 coturn 让 `external-ip` 生效（或删掉 `external-ip`，让 coturn 直接用本机网卡地址）。
- **并发**：纯 STUN 时几乎不占资源，无需调优；如果后面在同一台机器上叠加 TURN 中继，再参考根目录 `README.md` 的端口和并发说明。

## 10. 在同一台机器上加 TURN 中继（可选）

打洞失败（对称 NAT、运营商级 NAT、严格企业防火墙）时需要中继。TURN 才是「每个会话占一个端口」的服务，所以这里要规划**中继端口窗口**。

### 10.1 端口规划

| 端口 | 用途 | 放行 |
|---|---|---|
| `14273/udp` | STUN + TURN（同一个监听端口） | 必须 |
| `14273/tcp` | TURN over TCP 回退 | 建议 |
| `14280-14400/udp` | 中继端口窗口（约 120 个端口） | 必须 |

窗口大小的经验值：**一个中继会话约占 1~2 个端口**（UDP/TCP 各一），按并发数 ×2 再留 30% 余量。120 个端口 ≈ 60~80 个并发中继会话。玩家浏览器到 TURN 服务器的源端口是随机的，不需要限制；**只有服务器这一侧的中继窗口需要在安全组和 ufw 里放行**。

### 10.2 服务器配置

在原有 STUN 配置基础上追加（`no-tls`/`no-dtls` 保持关闭；TURN 必须配凭据）：

```bash
# 生成一个强密码
openssl rand -base64 24
```

```ini
# /etc/turnserver.conf
listening-port=14273
alt-listening-port=14276
alt-tls-listening-port=14277
external-ip=43.248.3.138/172.16.0.127
no-tls
no-dtls
no-cli
no-stdout-log
log-file=/tmp/turnserver.log
pidfile=/run/turnserver.pid
simple-log
# ── TURN 中继 ──
min-port=14280
max-port=14400
realm=games-online
user=gameuser:把上面生成的密码填在这里
lt-cred-mech
fingerprint
no-multicast-peers
```

```bash
# 放行中继窗口（云安全组里也要加 UDP 14280-14400，来源 0.0.0.0/0）
ufw allow 14280:14400/udp
systemctl restart coturn
```

验证中继是否真的可用（在**主站**这台机器上执行）：

```bash
cd /www/wwwroot/xbw.ppxin.com
node --input-type=module -e "
import { probeTurnServer } from './server/stun-test.js'
console.log(await probeTurnServer('turn:43.248.3.138:14273?transport=udp'))
"
```

期望输出 `ok: true`、`note: 中继端口可用，要求鉴权（正常）`。后台「站点设置」里也有对应的「测试 TURN 中继」按钮。

### 10.3 主站侧

在主站后台「站点设置 → TURN 中继」里填三项即可（保存进数据库，后台可随时改，不需要动 `.env`）：

```text
TURN 服务器地址：turn:公网IP:14273?transport=udp,turn:公网IP:14273?transport=tcp
TURN 用户名：    gameuser
TURN 密码：      和服务器上 user= 后面的密码一致
```

点「测试 TURN 中继」按钮：填了用户名密码时会真的分配一次中继端口，成功输出形如
`✓ … 中继地址 43.248.3.138:16007`；密码错了会明确提示「用户名或密码不正确」。

`.env` 里的 `VITE_WEBRTC_TURN_*` 只是兜底（老部署兼容），后台填了以后台为准。

排查中继链路时可临时把 `VITE_WEBRTC_FORCE_RELAY=1` 打开，强制所有联机走中继，验证完改回 `0`。

### 10.4 两个容易踩的点

- **中继端口窗口必须和安全组放行范围一致**：`min-port`/`max-port` 里分配出来的端口，如果安全组没放行，会出现「后台测试显示分配成功、但联机时媒体流不通」。改窗口后记得同步改 ufw 和云安全组。
- **中继端口是动态分配的，不要写死**：测试结果里的端口每次都不一样，属正常现象；只要落在你配置的窗口内即可。

## 11. 一个已验证可用的完整示例

某台云主机（内网 `172.16.0.127`、公网 `43.248.3.138`、监听 `14273`，同机 nginx 占 14274、宝塔占 14275），最终 `turnserver.conf`：

```ini
listening-port=14273
alt-listening-port=14276
alt-tls-listening-port=14277
external-ip=43.248.3.138/172.16.0.127
no-tls
no-dtls
no-cli
no-stdout-log
log-file=/tmp/turnserver.log
pidfile=/run/turnserver.pid
simple-log
```

以及 systemd drop-in（`/etc/systemd/system/coturn.service.d/override.conf`）：

```ini
[Service]
Type=simple
User=root
Group=root
ExecStart=
ExecStart=/usr/bin/turnserver -c /etc/turnserver.conf --pidfile=
Restart=on-failure
```

验证结果：`stun:43.248.3.138:14273` 探测成功，延迟 31ms，正确返回了调用方的公网出口地址。
