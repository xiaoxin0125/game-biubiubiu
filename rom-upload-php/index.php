<?php
declare(strict_types=1);

/*
 * rom-upload —— ROM 远端存储服务（PHP 版）
 *
 * 和 Node 版（/www/wwwroot/rom-upload/server.js）接口完全一致，主站不需要改代码，
 * 只在「站点设置 → 远端存储」里把地址换成这个站点的地址即可。
 *
 * 依赖：PHP 7.4+（不需要任何扩展，除默认的 hash/json 外无额外要求）
 * 数据目录结构和 Node 版相同：data/files/<id>.bin + data/meta/<id>.json
 *
 * 快速自测：php -S 127.0.0.1:8791 index.php
 * 正式部署：宝塔建 PHP 站点并把站点根目录指向本目录，加伪静态（见 README.md）
 */

const ROM_UPLOAD_SERVICE = 'rom-upload';
const ROM_UPLOAD_VERSION = '1.0.0-php';
const ROM_UPLOAD_DEFAULT_MAX_BYTES = 209715200; // 200MB
const ROM_UPLOAD_MIN_TOKEN_LENGTH = 16;
const ROM_UPLOAD_FILE_ID_PATTERN = '/^[a-f0-9]{32}$/';
const ROM_UPLOAD_CHUNK_BYTES = 262144;

// ── 配置 ────────────────────────────────────────────────────────────────
function load_config(): array
{
    $path = getenv('ROM_UPLOAD_CONFIG') ?: __DIR__ . '/config.json';
    $file = [];
    if (is_file($path)) {
        $decoded = json_decode((string)file_get_contents($path), true);
        if (is_array($decoded)) {
            $file = $decoded;
        }
    }
    $token = trim((string)($file['token'] ?? getenv('TOKEN') ?: ''));
    $dataDir = trim((string)($file['dataDir'] ?? getenv('DATA_DIR') ?: ''));
    $maxFileBytes = (int)($file['maxFileBytes'] ?? getenv('MAX_FILE_BYTES') ?: ROM_UPLOAD_DEFAULT_MAX_BYTES);

    return [
        'token' => $token,
        'dataDir' => $dataDir !== '' ? rtrim($dataDir, '/') : __DIR__ . '/data',
        'maxFileBytes' => $maxFileBytes > 0 ? $maxFileBytes : ROM_UPLOAD_DEFAULT_MAX_BYTES,
        'configPath' => $path,
    ];
}

// ── 基础工具 ────────────────────────────────────────────────────────────
function json_response(int $status, array $payload, bool $headOnly = false): void
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Length: ' . strlen($body));
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    if (!$headOnly) {
        echo $body;
    }
    exit;
}

function token_matches(string $expected, string $provided): bool
{
    if ($expected === '' || strlen($expected) !== strlen($provided)) {
        return false;
    }
    return hash_equals($expected, $provided);
}

function files_dir(array $cfg): string
{
    return $cfg['dataDir'] . '/files';
}

function meta_dir(array $cfg): string
{
    return $cfg['dataDir'] . '/meta';
}

function blob_path(array $cfg, string $id): string
{
    return files_dir($cfg) . '/' . $id . '.bin';
}

function meta_path(array $cfg, string $id): string
{
    return meta_dir($cfg) . '/' . $id . '.json';
}

function ensure_dirs(array $cfg): bool
{
    foreach ([$cfg['dataDir'], files_dir($cfg), meta_dir($cfg)] as $dir) {
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return false;
        }
    }
    return true;
}

function read_meta(array $cfg, string $id): ?array
{
    $path = meta_path($cfg, $id);
    if (!is_file($path)) {
        return null;
    }
    $decoded = json_decode((string)file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function decode_file_name(string $raw): string
{
    $value = trim($raw);
    if ($value === '') {
        return 'rom.bin';
    }
    $decoded = rawurldecode($value);
    $decoded = str_replace('\\', '/', $decoded);
    $base = basename($decoded);
    $base = preg_replace('/[\x00-\x1f]/', '', $base) ?? 'rom.bin';
    if ($base === '') {
        return 'rom.bin';
    }
    // mbstring 不是必备扩展，缺失时退回字节截断
    return function_exists('mb_substr') ? mb_substr($base, 0, 255) : substr($base, 0, 255);
}

function content_type_for(string $name): string
{
    switch (strtolower((string)pathinfo($name, PATHINFO_EXTENSION))) {
        case 'zip':
            return 'application/zip';
        case '7z':
            return 'application/x-7z-compressed';
        default:
            return 'application/octet-stream';
    }
}

function storage_stats(array $cfg): array
{
    $files = 0;
    $bytes = 0;
    $entries = @scandir(files_dir($cfg)) ?: [];
    foreach ($entries as $entry) {
        if (substr($entry, -4) !== '.bin') {
            continue;
        }
        $size = @filesize(files_dir($cfg) . '/' . $entry);
        if ($size === false) {
            continue;
        }
        $files++;
        $bytes += (int)$size;
    }
    return ['files' => $files, 'bytes' => $bytes];
}

function check_writable(array $cfg): bool
{
    $probe = $cfg['dataDir'] . '/.write-test-' . getmypid();
    if (@file_put_contents($probe, 'ok') === false) {
        return false;
    }
    @unlink($probe);
    return true;
}

function parse_range(string $header, int $size): array
{
    if (!preg_match('/^bytes=(\d*)-(\d*)$/', trim($header), $m)) {
        return ['kind' => 'none'];
    }
    [$rawStart, $rawEnd] = [$m[1], $m[2]];
    if ($rawStart === '' && $rawEnd === '') {
        return ['kind' => 'none'];
    }
    if ($rawStart === '') {
        $suffix = (int)$rawEnd;
        if ($suffix <= 0) {
            return ['kind' => 'none'];
        }
        $start = max($size - $suffix, 0);
        $end = $size - 1;
    } else {
        $start = (int)$rawStart;
        $end = $rawEnd === '' ? $size - 1 : (int)$rawEnd;
    }
    if ($start > $end || $start >= $size) {
        return ['kind' => 'unsatisfiable'];
    }
    return ['kind' => 'range', 'start' => $start, 'end' => min($end, $size - 1)];
}

function stream_blob(string $path, int $offset, int $length): void
{
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        return;
    }
    if ($offset > 0) {
        fseek($handle, $offset);
    }
    $remaining = $length;
    while ($remaining > 0 && !feof($handle) && !connection_aborted()) {
        $chunk = fread($handle, (int)min(ROM_UPLOAD_CHUNK_BYTES, $remaining));
        if ($chunk === false || $chunk === '') {
            break;
        }
        echo $chunk;
        $remaining -= strlen($chunk);
        flush();
    }
    fclose($handle);
}

// ── 路由处理 ────────────────────────────────────────────────────────────
function handle_health(array $cfg, bool $headOnly): void
{
    $stats = storage_stats($cfg);
    $free = @disk_free_space($cfg['dataDir']);
    json_response(200, [
        'ok' => true,
        'service' => ROM_UPLOAD_SERVICE,
        'version' => ROM_UPLOAD_VERSION,
        'runtime' => 'php',
        'phpVersion' => PHP_VERSION,
        'dataDir' => $cfg['dataDir'],
        'writable' => check_writable($cfg),
        'files' => $stats['files'],
        'bytes' => $stats['bytes'],
        'freeBytes' => $free === false ? null : (int)$free,
        'maxFileBytes' => $cfg['maxFileBytes'],
        'serverTime' => gmdate('c'),
    ], $headOnly);
}

function handle_upload(array $cfg): void
{
    @set_time_limit(0);
    @ini_set('zlib.output_compression', '0');

    $declaredLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declaredLength > $cfg['maxFileBytes']) {
        json_response(413, ['error' => '文件超过上限 ' . $cfg['maxFileBytes'] . ' 字节']);
    }
    if (!ensure_dirs($cfg)) {
        json_response(500, ['error' => '数据目录不可写：' . $cfg['dataDir']]);
    }

    $name = decode_file_name((string)($_SERVER['HTTP_X_FILENAME'] ?? ''));
    $expectedSha = strtolower(trim((string)($_SERVER['HTTP_X_SHA256'] ?? '')));
    $id = bin2hex(random_bytes(16));
    $tempPath = files_dir($cfg) . '/' . $id . '.part';
    $targetPath = blob_path($cfg, $id);

    $input = fopen('php://input', 'rb');
    $output = fopen($tempPath, 'wb');
    if ($input === false || $output === false) {
        if (is_resource($input)) fclose($input);
        if (is_resource($output)) fclose($output);
        @unlink($tempPath);
        json_response(500, ['error' => '无法写入数据目录']);
    }

    $hash = hash_init('sha256');
    $size = 0;
    $tooLarge = false;
    while (true) {
        $chunk = fread($input, ROM_UPLOAD_CHUNK_BYTES);
        if ($chunk === false || $chunk === '') {
            break;
        }
        $size += strlen($chunk);
        if ($size > $cfg['maxFileBytes']) {
            $tooLarge = true;
            break;
        }
        hash_update($hash, $chunk);
        fwrite($output, $chunk);
    }
    fclose($input);
    fclose($output);

    if ($tooLarge) {
        @unlink($tempPath);
        json_response(413, ['error' => '文件超过上限 ' . $cfg['maxFileBytes'] . ' 字节']);
    }
    if ($size === 0) {
        @unlink($tempPath);
        json_response(400, ['error' => '文件为空']);
    }

    $sha256 = hash_final($hash);
    if ($expectedSha !== '' && !hash_equals($expectedSha, $sha256)) {
        @unlink($tempPath);
        json_response(400, ['error' => 'sha256 校验失败']);
    }
    if (!@rename($tempPath, $targetPath)) {
        @unlink($tempPath);
        json_response(500, ['error' => '保存失败']);
    }

    $meta = [
        'id' => $id,
        'name' => $name,
        'size' => $size,
        'sha256' => $sha256,
        'contentType' => content_type_for($name),
        'createdAt' => gmdate('c'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    ];
    @file_put_contents(meta_path($cfg, $id), json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

    json_response(201, array_merge(['ok' => true], $meta));
}

function handle_file(array $cfg, string $id, bool $withBody, bool $headOnly): void
{
    if (!preg_match(ROM_UPLOAD_FILE_ID_PATTERN, $id)) {
        json_response(400, ['error' => 'id 非法'], $headOnly);
    }
    $meta = read_meta($cfg, $id);
    $path = blob_path($cfg, $id);
    if ($meta === null || !is_file($path)) {
        json_response(404, ['error' => '文件不存在'], $headOnly);
    }
    $size = (int)filesize($path);

    header('Content-Type: ' . ($meta['contentType'] ?? 'application/octet-stream'));
    header('Accept-Ranges: bytes');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    header('X-Rom-Sha256: ' . ($meta['sha256'] ?? ''));
    header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode((string)($meta['name'] ?? ($id . '.bin'))));

    $range = parse_range((string)($_SERVER['HTTP_RANGE'] ?? ''), $size);
    if (($range['kind'] ?? 'none') === 'unsatisfiable') {
        http_response_code(416);
        header('Content-Range: bytes */' . $size);
        exit;
    }
    if (($range['kind'] ?? 'none') === 'range') {
        $length = $range['end'] - $range['start'] + 1;
        http_response_code(206);
        header('Content-Range: bytes ' . $range['start'] . '-' . $range['end'] . '/' . $size);
        header('Content-Length: ' . $length);
        if ($withBody) {
            stream_blob($path, (int)$range['start'], (int)$length);
        }
        exit;
    }

    http_response_code(200);
    header('Content-Length: ' . $size);
    if ($withBody) {
        stream_blob($path, 0, $size);
    }
    exit;
}

function handle_delete(array $cfg, string $id): void
{
    if (!preg_match(ROM_UPLOAD_FILE_ID_PATTERN, $id)) {
        json_response(400, ['error' => 'id 非法']);
    }
    $meta = read_meta($cfg, $id);
    if ($meta === null) {
        json_response(404, ['error' => '文件不存在']);
    }
    @unlink(blob_path($cfg, $id));
    @unlink(meta_path($cfg, $id));
    json_response(200, ['ok' => true, 'id' => $id]);
}

// 计算站点在 URL 里的前缀（服务放在子目录时用）。
//
// 注意不能直接用 SCRIPT_NAME：PHP 内置服务器（php -S 127.0.0.1:8791 index.php）
// 会把它设成请求路径本身，那样 /files/<id> 会被误剪成 /<id>，读取文件全部 404。
// 优先按「脚本真实位置相对 DOCUMENT_ROOT」推导；算不出来时（例如 Apache Alias
// 把别处目录映射到 /rom-upload）再退回 SCRIPT_NAME，但只在它确实指向脚本文件时采用。
function script_base_dir(): string
{
    $docRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $scriptFile = realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
    if ($docRoot !== false && $scriptFile !== false) {
        $docRoot = rtrim(str_replace('\\', '/', $docRoot), '/');
        $scriptFile = str_replace('\\', '/', $scriptFile);
        if ($docRoot !== '' && strpos($scriptFile, $docRoot . '/') === 0) {
            $dir = rtrim(str_replace('\\', '/', dirname(substr($scriptFile, strlen($docRoot)))), '/');
            if ($dir !== '' && $dir !== '.' && $dir !== '/') {
                return $dir;
            }
        }
    }

    $name = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $requestPath = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $scriptBase = basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
    if ($name !== '' && $scriptBase !== '' && $name !== $requestPath && basename($name) === $scriptBase) {
        $dir = rtrim(str_replace('\\', '/', dirname($name)), '/');
        if ($dir !== '' && $dir !== '.' && $dir !== '/') {
            return $dir;
        }
    }

    return '';
}

// ── 入口 ────────────────────────────────────────────────────────────────
$config = load_config();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$headOnly = $method === 'HEAD';

$path = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$path = rtrim($path, '/');
if ($path === '') {
    $path = '/';
}
// 支持把服务放在子目录里（例如 http://主机/rom-upload/health）
$scriptDir = script_base_dir();
if ($scriptDir !== '' && ($path === $scriptDir || strpos($path, $scriptDir . '/') === 0)) {
    $path = substr($path, strlen($scriptDir)) ?: '/';
    if ($path === '') {
        $path = '/';
    }
}

if ($path === '/') {
    json_response(200, [
        'service' => ROM_UPLOAD_SERVICE,
        'version' => ROM_UPLOAD_VERSION,
        'runtime' => 'php',
        'hint' => '请使用带 X-Token 的接口调用',
    ], $headOnly);
}

if ($config['token'] === '' || strlen($config['token']) < ROM_UPLOAD_MIN_TOKEN_LENGTH) {
    json_response(500, [
        'ok' => false,
        'error' => 'token 未配置或长度不足 ' . ROM_UPLOAD_MIN_TOKEN_LENGTH . ' 位（' . $config['configPath'] . '）',
    ], $headOnly);
}

if (!token_matches($config['token'], (string)($_SERVER['HTTP_X_TOKEN'] ?? ''))) {
    json_response(401, ['error' => 'unauthorized'], $headOnly);
}

if (!ensure_dirs($config)) {
    json_response(500, ['ok' => false, 'error' => '数据目录不可写：' . $config['dataDir']], $headOnly);
}

if ($path === '/health' && ($method === 'GET' || $headOnly)) {
    handle_health($config, $headOnly);
}

if ($path === '/upload' && $method === 'POST') {
    handle_upload($config);
}

if (preg_match('#^/files/([^/]+)$#', $path, $matches)) {
    if ($method === 'GET' || $headOnly) {
        handle_file($config, $matches[1], !$headOnly, $headOnly);
    }
    if ($method === 'DELETE') {
        handle_delete($config, $matches[1]);
    }
}

json_response(404, ['error' => 'not found'], $headOnly);
