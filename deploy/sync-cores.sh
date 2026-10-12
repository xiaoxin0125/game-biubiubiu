#!/usr/bin/env bash
#
# 把本机构建好的核心发布目录同步到远端资源服务器。
#
#   1) node deploy/build-cores.mjs            # 生成 data/cores-dist/<release>/
#   2) deploy/sync-cores.sh                   # 上传（默认只同步，不删任何东西）
#   3) 后台「站点设置 → 核心资源」填 https://<域名>/releases
#
# 设计要点：
#   - 先传到临时目录、核验通过后再 mv 到最终版本目录：正在被玩家使用的版本目录
#     不会出现"半个文件"的中间状态，失败也不会污染现有版本。
#   - 不使用 rsync --delete：旧版本目录保留着，回滚只需要改后台地址。
#   - 上传后逐个比较体积与 sha256，不一致就整体失败退出。
#
# 用法：
#   deploy/sync-cores.sh [--release <版本号>] [--dry-run]
#
# 远端信息用环境变量覆盖（默认值按当前部署填好）：
#   CORES_SSH       ssh 目标，默认 root@43.248.3.138
#   CORES_SSH_KEY   私钥路径（可留空，走 ssh 默认配置/agent）
#   CORES_REMOTE_DIR 远端发布根目录，默认 /www/wwwroot/cores/releases

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT}/data/cores-dist"
SSH_TARGET="${CORES_SSH:-root@43.248.3.138}"
SSH_KEY="${CORES_SSH_KEY:-}"
REMOTE_DIR="${CORES_REMOTE_DIR:-/www/wwwroot/cores/releases}"

RELEASE=""
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) RELEASE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

if [[ -z "${RELEASE}" ]]; then
  if [[ ! -f "${DIST_DIR}/current.json" ]]; then
    echo "缺少 ${DIST_DIR}/current.json：先跑 node deploy/build-cores.mjs" >&2
    exit 1
  fi
  RELEASE="$(node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.release||""))' "${DIST_DIR}/current.json")"
  if [[ -z "${RELEASE}" ]]; then
    echo "无法从 ${DIST_DIR}/current.json 读到版本号" >&2
    exit 1
  fi
fi

SRC_DIR="${DIST_DIR}/${RELEASE}"
if [[ ! -d "${SRC_DIR}" ]]; then
  echo "版本目录不存在：${SRC_DIR}" >&2
  exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
[[ -n "${SSH_KEY}" ]] && SSH_OPTS+=(-i "${SSH_KEY}")
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

echo "[sync] 版本      ${RELEASE}"
echo "[sync] 本地      ${SRC_DIR}"
echo "[sync] 远端      ${SSH_TARGET}:${REMOTE_DIR}/${RELEASE}"
echo "[sync] 文件      $(find "${SRC_DIR}" -type f | wc -l) 个，$(du -sh "${SRC_DIR}" | cut -f1)"

if [[ "${DRY_RUN}" == "1" ]]; then
  rsync -av --dry-run -e "${RSYNC_SSH}" "${SRC_DIR}/" "${SSH_TARGET}:${REMOTE_DIR}/.staging-${RELEASE}/"
  echo "[sync] --dry-run：没有真正上传"
  exit 0
fi

# 1) 传到临时目录（同一文件系统内，随后的 mv 是原子操作）
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "mkdir -p '${REMOTE_DIR}/.staging-${RELEASE}'"
rsync -a --info=progress2 -e "${RSYNC_SSH}" "${SRC_DIR}/" "${SSH_TARGET}:${REMOTE_DIR}/.staging-${RELEASE}/"

# 2) 远端逐个核验体积与 sha256（清单由构建脚本生成，这里只读远端副本）
echo "[sync] 远端核验…"
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "cd '${REMOTE_DIR}/.staging-${RELEASE}' && node -e '
const fs = require(\"fs\");
const crypto = require(\"crypto\");
const manifest = JSON.parse(fs.readFileSync(\"manifest.json\", \"utf8\"));
let bad = 0;
for (const [name, meta] of Object.entries(manifest.files)) {
  if (!fs.existsSync(name)) { console.error(\"缺少 \" + name); bad++; continue; }
  const buf = fs.readFileSync(name);
  const sha = crypto.createHash(\"sha256\").update(buf).digest(\"hex\");
  process.stdout.write(\"  \" + name + \" \" + (buf.length / 1048576).toFixed(1) + \"MB \" + (sha === meta.sha256 && buf.length === meta.size ? \"ok\" : \"MISMATCH\") + \"\n\");
  if (sha !== meta.sha256 || buf.length !== meta.size) bad++;
  const gz = name + \".gz\";
  if (meta.gzipSize != null) {
    if (!fs.existsSync(gz)) { console.error(\"缺少压缩副本 \" + gz); bad++; }
    else if (fs.statSync(gz).size !== meta.gzipSize) { console.error(\"压缩副本大小不符 \" + gz); bad++; }
  }
}
if (bad) { console.error(\"核验失败：\" + bad + \" 个文件\"); process.exit(1); }
console.log(\"核验通过：\" + Object.keys(manifest.files).length + \" 个文件\");
'"

# 3) 原子发布：staging → 版本目录（旧目录不动，回滚就是改回旧版本号）
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "
  set -e
  rm -rf '${REMOTE_DIR}/${RELEASE}.old'
  if [ -d '${REMOTE_DIR}/${RELEASE}' ]; then mv '${REMOTE_DIR}/${RELEASE}' '${REMOTE_DIR}/${RELEASE}.old'; fi
  mv '${REMOTE_DIR}/.staging-${RELEASE}' '${REMOTE_DIR}/${RELEASE}'
  rm -rf '${REMOTE_DIR}/${RELEASE}.old'
  ls -1 '${REMOTE_DIR}'
"

echo "[sync] 完成。把后台「核心资源 → 远端核心地址」设为 https://<域名>/releases"
echo "[sync] 回滚：把该地址改回上一个版本号目录，或填 none 强制使用本机核心"
