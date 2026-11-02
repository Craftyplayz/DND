<?php
// Cloud saves for the Monster Sheet: one file per monster in private/dnd/accounts/monsters/<google sub>/<monster id>.json.
// (The player sheet used to share this file; characters now have a folder each, see includes/characters.php.)
//   GET              -> {"chars": {"<id>": <updated>, ...}}
//   GET ?id=<id>     -> that character
//   POST a character -> kept unless the saved copy has a newer "updated" (then 409 with {"updated"})
//   DELETE ?id=<id>  -> archives it (players can't delete monsters, ROADMAP 0.5): the monster gets "archived", nothing is removed
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../../includes/auth.php';
const CL_ACCOUNTS = __DIR__ . '/../../private/dnd/accounts/monsters';
const CL_MAX = 8 * 1024 * 1024; // only stops a broken client: the proxy turns away requests near 8 MB anyway

function cl_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) cl_out(401, ['error' => 'Sign in to save monsters to your account.']);
$dir = CL_ACCOUNTS . '/' . $user['sub'];
$okId = function ($id) { return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id); };
$updated = function ($file) {
    $c = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    return is_array($c) && isset($c['updated']) && is_numeric($c['updated']) ? (float)$c['updated'] : 0;
};
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $file = $okId($_GET['id']) ? "$dir/{$_GET['id']}.json" : '';
        $file && is_file($file) ? cl_out(200, (string)file_get_contents($file)) : cl_out(404, ['error' => 'No such character.']);
    }
    $list = [];
    foreach (glob("$dir/*.json") ?: [] as $f) $list[basename($f, '.json')] = $updated($f);
    cl_out(200, ['chars' => (object)$list]);
}

if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0 && $method === 'POST') cl_out(415, ['error' => 'Send the character as JSON.']);
if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) cl_out(500, ['error' => "Couldn't make the account folder."]);
// one writer at a time per account, so the "newer wins" check and the write can't interleave
$lock = fopen("$dir/.lock", 'c');
if (!$lock || !flock($lock, LOCK_EX)) cl_out(500, ['error' => "Couldn't lock the account folder."]);

if ($method === 'DELETE') {
    if (!$okId($_GET['id'] ?? null)) cl_out(400, ['error' => 'Bad character id.']);
    $file = "$dir/{$_GET['id']}.json";
    $c = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    if (is_array($c) && empty($c['archived'])) {
        $now = round(microtime(true) * 1000);
        $c['archived'] = $now;
        $c['updated'] = max($now, (float)($c['updated'] ?? 0) + 1);
        if (@file_put_contents($file, json_encode($c)) === false) cl_out(500, ['error' => "Couldn't archive the monster."]);
    }
    cl_out(200, ['archived' => true]);
}
if ($method !== 'POST') cl_out(405, ['error' => 'Use GET, POST or DELETE.']);

$body = file_get_contents('php://input', false, null, 0, CL_MAX + 1);
if ($body === false || $body === '') cl_out(400, ['error' => 'No character was sent.']);
if (strlen($body) > CL_MAX) cl_out(413, ['error' => 'That character is too big to save.']);
$c = json_decode($body, true);
if (!is_array($c) || !isset($c['abilities']) || !is_array($c['abilities']) || !$okId($c['id'] ?? null) || !is_numeric($c['updated'] ?? null)) cl_out(400, ['error' => "That isn't a character from the sheet."]);
$file = "$dir/{$c['id']}.json";
$have = $updated($file);
if ($have > (float)$c['updated']) cl_out(409, ['updated' => $have]);
@file_put_contents($file, $body) !== false ? cl_out(200, ['updated' => (float)$c['updated']]) : cl_out(500, ['error' => "Couldn't save the character."]);
