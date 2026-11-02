<?php
// Server backups for the homebrew sheet: the sheet POSTs a whole character after each edit and it is kept as a new version in
//   private/dnd/backups/<ip>/<character name>/<ip>-<version>.json
// private/ is behind basic auth, the folder is gitignored, and deploy.sh never touches untracked server files.
// The Monster Sheet's backup.php sets its own folder and name, then includes this file.
if (!defined('HB_BACKUPS')) define('HB_BACKUPS', __DIR__ . '/../../../../private/dnd/backups');
if (!defined('HB_UNNAMED')) define('HB_UNNAMED', 'Unnamed character');
const HB_MAX = 3 * 1024 * 1024; // art is stored inline as a data URL, so a character can be a few hundred KB

function hb_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

// a safe single folder or file name: no slashes, control characters or leading dots
function hb_name($s, $fallback)
{
    $s = preg_replace('/[\x00-\x1f\x7f\/\\\\:*?"<>|]+/u', '_', (string)$s);
    $s = trim(ltrim(trim($s), '.'));
    if (function_exists('mb_substr')) $s = mb_substr($s, 0, 80); else $s = substr($s, 0, 80);
    return $s === '' ? $fallback : $s;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') hb_out(405, ['error' => 'Send the character with POST.']);
$body = file_get_contents('php://input', false, null, 0, HB_MAX + 1);
if ($body === false || $body === '') hb_out(400, ['error' => 'No character was sent.']);
if (strlen($body) > HB_MAX) hb_out(413, ['error' => 'That character is too big to back up.']);
$c = json_decode($body, true);
if (!is_array($c) || !isset($c['abilities']) || !is_array($c['abilities'])) hb_out(400, ['error' => "That isn't a character from the sheet."]);

$ip = hb_name($_SERVER['REMOTE_ADDR'] ?? 'unknown', 'unknown');
$dir = HB_BACKUPS . '/' . $ip . '/' . hb_name($c['name'] ?? '', HB_UNNAMED);
if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) hb_out(500, ['error' => "Couldn't make the backup folder."]);

// one writer at a time per character folder, so two quick saves can't take the same version number
$lock = fopen($dir . '/.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) hb_out(500, ['error' => "Couldn't lock the backup folder."]);
$last = 0;
foreach (glob($dir . '/' . $ip . '-*.json') ?: [] as $file) {
    if (preg_match('/-(\d+)\.json$/', $file, $m)) $last = max($last, (int)$m[1]);
}
$json = json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
// an unchanged character (page reopened, tab switched) doesn't make a new version
if ($last && @file_get_contents($dir . '/' . $ip . '-' . $last . '.json') === $json) {
    flock($lock, LOCK_UN);
    hb_out(200, ['version' => $last, 'unchanged' => true]);
}
$version = $last + 1;
$ok = @file_put_contents($dir . '/' . $ip . '-' . $version . '.json', $json) !== false;
flock($lock, LOCK_UN);
$ok ? hb_out(200, ['version' => $version]) : hb_out(500, ['error' => "Couldn't write the backup."]);
