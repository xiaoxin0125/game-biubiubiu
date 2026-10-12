#!/usr/bin/env node
/*
 * 一次性补丁：给远端 rom-upload 服务加上"浏览器直连的签名下载入口"。
 *
 *   Node 版：/www/wwwroot/rom-upload/server.js
 *   PHP 版： rom-upload-php/index.php（本仓库内）
 *
 * 新增接口（与主站 server/remote-storage.js 的签名算法一一对应）：
 *   GET  /signed/<id>?exp=<unix秒>&sig=<hmac>     只读单个文件、带有效期
 *   HEAD /signed/<id>?...                         同上，只取响应头
 *   签名内容： HMAC-SHA256(secret, `download.<id>.<exp>`)
 *
 * 特性：幂等（已打过补丁直接退出）、锚点必须唯一命中（否则整体放弃、不写文件）、
 * 写入前留 .bak-<时间戳> 备份。
 *
 * 用法：node deploy/patch-remote-signed.mjs <目标文件> [<目标文件> ...]
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

// ── 通用 ────────────────────────────────────────────────────────────────
function applyReplacements(source, edits, label) {
  let out = source
  for (const [find, replace] of edits) {
    const hits = out.split(find).length - 1
    if (hits !== 1) {
      throw new Error(`${label}: 锚点命中 ${hits} 次（需要恰好 1 次），未修改任何文件：\n${find.slice(0, 120)}`)
    }
    out = out.replace(find, replace)
  }
  return out
}

// ── Node 版 ─────────────────────────────────────────────────────────────
const NODE_MARKER = 'verifyDirectSignature'

const nodeVerifyBlock = `
// ── 浏览器直连签名 ──────────────────────────────────────────────────────
// 主站在做完权限校验后 302 到 /signed/<id>?exp=&sig=，浏览器直接从这里取文件，
// 主站的出口带宽不再承载 ROM。签名绑定"用途 + 文件 id + 过期时间"，只读单个
// 文件且会过期；X-Token（能上传/删除）始终不下发到浏览器。
const DIRECT_URL_PURPOSE = 'download'
const DIRECT_URL_TTL_SEC = 600
const DIRECT_URL_CLOCK_SKEW_SEC = 60

function directSecret() {
  return String(config.downloadSecret || config.token)
}

/** 校验签名；返回 {ok:true} 或 {ok:false, error, status}。 */
function verifyDirectSignature(id, exp, sig, now = Date.now()) {
  const rawExp = String(exp ?? '').trim()
  const provided = String(sig ?? '').trim().toLowerCase()
  if (!FILE_ID_PATTERN.test(String(id || ''))) return { ok: false, error: 'id 非法', status: 400 }
  if (!/^\\d{9,12}$/.test(rawExp)) return { ok: false, error: 'exp 非法', status: 403 }
  const expiry = Number(rawExp)
  const nowSec = Math.floor(now / 1000)
  if (expiry < nowSec - DIRECT_URL_CLOCK_SKEW_SEC) return { ok: false, error: '链接已过期', status: 403 }
  if (expiry > nowSec + DIRECT_URL_TTL_SEC + DIRECT_URL_CLOCK_SKEW_SEC) {
    return { ok: false, error: '过期时间过长', status: 403 }
  }
  const expected = createHmac('sha256', directSecret())
    .update(\`\${DIRECT_URL_PURPOSE}.\${id}.\${rawExp}\`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: '签名不匹配', status: 403 }
  return { ok: true }
}

`

const nodeSignedHandler = `
// 浏览器直连入口：不要求 X-Token（密钥只留在服务器之间），凭签名只读单个文件。
// CORS 头挂在 res 上，后续所有分支（含 404/416）都会带上，前端因此能读到真实
// 状态码并触发回退，而不是一个看不出原因的网络错误。
async function handleSigned(req, res, id, method) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Disposition')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url || '/', \`http://\${req.headers.host || 'localhost'}\`)
  const check = verifyDirectSignature(id, url.searchParams.get('exp'), url.searchParams.get('sig'))
  if (!check.ok) {
    log('signed rejected', id, check.error)
    return sendJson(res, check.status || 403, { error: check.error })
  }

  return handleFile(req, res, id, method === 'GET')
}

async function handleFile(req, res, id, withBody) {`

const nodeEdits = [
  [
    "import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'",
    "import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'",
  ],
  [
    "const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')",
    `const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')\n${nodeVerifyBlock}`,
  ],
  [
    'trustProxy: fromFile.trustProxy === true',
    `downloadSecret: String(fromFile.downloadSecret || process.env.DOWNLOAD_SECRET || '').trim(),
    trustProxy: fromFile.trustProxy === true`,
  ],
  ['async function handleFile(req, res, id, withBody) {', nodeSignedHandler],
  [
    "  if (!tokenMatches(req.headers['x-token'])) {",
    `  // 签名下载入口要在 token 校验之前处理：它本来就不带 X-Token。
  const signedMatch = /^\\/signed\\/([^/]+)$/.exec(path)
  if (signedMatch && (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')) {
    return await handleSigned(req, res, signedMatch[1], method)
  }

  if (!tokenMatches(req.headers['x-token'])) {`,
  ],
  [
    "  GET    /files/:id       读取文件，支持 Range 断点续传",
    `  GET    /files/:id       读取文件，支持 Range 断点续传（需 X-Token）
 *   GET    /signed/:id      浏览器直连下载：?exp=&sig= 签名，只读该文件且有有效期`,
  ],
]

// ── PHP 版 ──────────────────────────────────────────────────────────────
const PHP_MARKER = 'rom_upload_verify_signature'

const phpVerifyBlock = `
// ── 浏览器直连签名 ──────────────────────────────────────────────────────
// 与 Node 版、主站 server/remote-storage.js 的算法必须完全一致：
//   sig = HMAC-SHA256(secret, 'download.<文件id>.<exp>')

// 校验签名；返回 ['ok' => bool, 'error' => string, 'status' => int]。
function rom_upload_verify_signature(array $cfg, string $id, string $exp, string $sig, ?int $now = null): array
{
    if (!preg_match(ROM_UPLOAD_FILE_ID_PATTERN, $id)) {
        return ['ok' => false, 'error' => 'id 非法', 'status' => 400];
    }
    $rawExp = trim($exp);
    if (!preg_match('/^\\d{9,12}$/', $rawExp)) {
        return ['ok' => false, 'error' => 'exp 非法', 'status' => 403];
    }
    $nowSec = $now ?? time();
    $expiry = (int)$rawExp;
    if ($expiry < $nowSec - ROM_UPLOAD_DIRECT_SKEW_SEC) {
        return ['ok' => false, 'error' => '链接已过期', 'status' => 403];
    }
    if ($expiry > $nowSec + ROM_UPLOAD_DIRECT_TTL_SEC + ROM_UPLOAD_DIRECT_SKEW_SEC) {
        return ['ok' => false, 'error' => '过期时间过长', 'status' => 403];
    }
    $secret = (string)($cfg['downloadSecret'] ?? '') !== '' ? (string)$cfg['downloadSecret'] : (string)$cfg['token'];
    $expected = hash_hmac('sha256', ROM_UPLOAD_DIRECT_PURPOSE . '.' . $id . '.' . $rawExp, $secret);
    $provided = strtolower(trim($sig));
    if ($provided === '' || !hash_equals($expected, $provided)) {
        return ['ok' => false, 'error' => '签名不匹配', 'status' => 403];
    }
    return ['ok' => true, 'error' => '', 'status' => 200];
}

// 浏览器直连下载入口：不带 X-Token，凭签名只读这一个文件。
function handle_signed(array $cfg, string $id, string $exp, string $sig, bool $withBody, bool $headOnly): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, Content-Disposition');
    header('Cross-Origin-Resource-Policy: cross-origin');

    $check = rom_upload_verify_signature($cfg, $id, $exp, $sig);
    if (!$check['ok']) {
        json_response((int)$check['status'], ['error' => $check['error']], $headOnly);
    }
    handle_file($cfg, $id, $withBody, $headOnly, true);
}
`

const phpEdits = [
  [
    "const ROM_UPLOAD_VERSION = '1.0.0-php';",
    `const ROM_UPLOAD_VERSION = '1.1.0-php';\n// 直连签名参数（与 Node 版、主站保持一致）\nconst ROM_UPLOAD_DIRECT_PURPOSE = 'download';\nconst ROM_UPLOAD_DIRECT_TTL_SEC = 600;\nconst ROM_UPLOAD_DIRECT_SKEW_SEC = 60;`,
  ],
  [
    "        'configPath' => $path,",
    `        'downloadSecret' => trim((string)($file['downloadSecret'] ?? getenv('DOWNLOAD_SECRET') ?: '')),
        'configPath' => $path,`,
  ],
  [
    'function handle_file(array $cfg, string $id, bool $withBody, bool $headOnly): void',
    'function handle_file(array $cfg, string $id, bool $withBody, bool $headOnly, bool $cors = false): void',
  ],
  [
    "    header('X-Rom-Sha256: ' . ($meta['sha256'] ?? ''));",
    `    header('X-Rom-Sha256: ' . ($meta['sha256'] ?? ''));
    if ($cors) {
        // 错误响应也要带 CORS：前端才能读到真实状态码并触发回退。
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, Content-Disposition');
        header('Cross-Origin-Resource-Policy: cross-origin');
    }`,
  ],
  [
    '// ── 入口 ────────────────────────────────────────────────────────────────',
    `${phpVerifyBlock}\n// ── 入口 ────────────────────────────────────────────────────────────────`,
  ],
  [
    "if (!token_matches($config['token'], (string)($_SERVER['HTTP_X_TOKEN'] ?? ''))) {",
    `// 签名下载入口要在 token 校验之前处理：它本来就不带 X-Token。
if (preg_match('#^/signed/([^/]+)$#', $path, $signedMatches)
    && ($method === 'GET' || $headOnly || $method === 'OPTIONS')) {
    if ($method === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
        http_response_code(204);
        exit;
    }
    handle_signed(
        $config,
        $signedMatches[1],
        (string)($_GET['exp'] ?? ''),
        (string)($_GET['sig'] ?? ''),
        !$headOnly,
        $headOnly
    );
}

if (!token_matches($config['token'], (string)($_SERVER['HTTP_X_TOKEN'] ?? ''))) {`,
  ],
]

// ── 主流程 ──────────────────────────────────────────────────────────────
const targets = process.argv.slice(2)
if (!targets.length) {
  console.error('用法：node deploy/patch-remote-signed.mjs <server.js|index.php> [...]')
  process.exit(2)
}

let changed = 0
for (const target of targets) {
  if (!existsSync(target)) {
    console.error(`[patch] 文件不存在：${target}`)
    process.exitCode = 1
    continue
  }
  const source = readFileSync(target, 'utf8')
  const isPhp = source.startsWith('<?php')
  const marker = isPhp ? PHP_MARKER : NODE_MARKER
  if (source.includes(marker)) {
    console.log(`[patch] 已经是打过补丁的版本，跳过：${target}`)
    continue
  }

  let patched
  try {
    patched = applyReplacements(source, isPhp ? phpEdits : nodeEdits, isPhp ? 'PHP' : 'Node')
  } catch (error) {
    console.error(`[patch] 失败：${error.message}`)
    process.exitCode = 1
    continue
  }

  const backup = `${target}.bak-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`
  copyFileSync(target, backup)
  writeFileSync(target, patched, 'utf8')
  changed += 1
  console.log(`[patch] 已打补丁：${target}（备份 ${backup}）`)
}

console.log(`[patch] 完成：${changed} 个文件被修改`)
