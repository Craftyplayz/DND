<?php
// Cloud saves for the Monster Sheet: one file per monster in private/dnd/accounts/monsters/<google sub>/<monster id>.json.
// (The player sheet used to share this file; characters now have a folder each, see includes/characters.php.)
//   GET              -> {"chars": {"<id>": <updated>, ...}, "hpAt": {"<id>": <hpAt>, ...}}
//   GET ?id=<id>     -> that character
//   POST a character -> kept unless the saved copy has a newer "updated" (then 409 with {"updated"})
//   POST ?hp=<id> {"op": {...}} -> {"hp", "hpAt"}: one hit point change (see below)
//   DELETE ?id=<id>  -> archives it (players can't delete monsters, ROADMAP 0.5): the monster gets "archived", nothing is removed
// Hit points (ROADMAP 1.4) change from more than one place at once (two Monster Sheets, the campaign page, the
// initiative tracker), so once a monster's HP has been changed through ?hp= its "hp" is only ever changed that way:
// each change is applied here, in order, to the saved HP (damage on top of damage, never one copy over another), and
// stamped hpAt (server time). A whole-monster save keeps the saved HP, so a sheet open elsewhere with an old copy can
// never put old hit points back. Every change goes out live to the DM's open sheets and to fights with the monster.
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/initiative.php';
require_once __DIR__ . '/../../includes/live.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts';
define('CL_ACCOUNTS', "$accounts/monsters");
const CL_MAX = 8 * 1024 * 1024; // only stops a broken client: the proxy turns away requests near 8 MB anyway

function cl_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// tell every fight this DM runs with monster $id to reload (its HP or archived mark changed)
function cl_fights($accounts, $sub, $id)
{
    foreach (cp_mine($accounts, $sub)['dm'] as $camp) {
        foreach (fi_read($accounts, $camp['id'])['entries'] ?? [] as $e) if (($e['mon'] ?? null) === $id) {
            live_publish($camp['id'], ['type' => 'fight'], null, $e['hidden'] ? 'dm' : null);
            break;
        }
    }
}


$user = auth_user();
if (!$user) cl_out(401, ['error' => 'Sign in to save monsters to your account.']);
$dir = CL_ACCOUNTS . '/' . $user['sub'];
$okId = function ($id) { return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id); };
$read = function ($file) { $c = is_file($file) ? json_decode((string)file_get_contents($file), true) : null; return is_array($c) ? $c : null; };
$stamp = fn($c, $k) => isset($c[$k]) && is_numeric($c[$k]) ? (float)$c[$k] : 0;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $file = $okId($_GET['id']) ? "$dir/{$_GET['id']}.json" : '';
        $file && is_file($file) ? cl_out(200, (string)file_get_contents($file)) : cl_out(404, ['error' => 'No such character.']);
    }
    $list = $hpAt = [];
    foreach (glob("$dir/*.json") ?: [] as $f) {
        $c = $read($f);
        $list[basename($f, '.json')] = $stamp($c, 'updated');
        if ($stamp($c, 'hpAt')) $hpAt[basename($f, '.json')] = $stamp($c, 'hpAt');
    }
    cl_out(200, ['chars' => (object)$list, 'hpAt' => (object)$hpAt]);
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
        flock($lock, LOCK_UN);
        cl_fights($accounts, $user['sub'], $_GET['id']);
    }
    cl_out(200, ['archived' => true]);
}
if ($method !== 'POST') cl_out(405, ['error' => 'Use GET, POST or DELETE.']);

if (isset($_GET['hp'])) {
    $id = $_GET['hp'];
    $c = $okId($id) ? $read("$dir/$id.json") : null;
    if (!$c) cl_out(404, ['error' => 'Save the monster to your account first.']);
    $in = json_decode((string)file_get_contents('php://input', false, null, 0, 64 * 1024), true);
    // a change sent twice (a lost answer, or two tabs sharing one outbox) counts once: the last 500 change ids are kept
    $q = is_string($in['q'] ?? null) && preg_match('/^[\w-]{8,40}$/', $in['q']) ? $in['q'] : null;
    $seen = $read("$dir/.hp-changes") ?? [];
    if ($q === null || !in_array($q, $seen, true)) {
        $hp = fi_hp(is_array($c['hp'] ?? null) ? $c['hp'] : [], $in['op'] ?? null);
        if ($hp === null) cl_out(400, ['error' => "That isn't a hit point change."]);
        $c['hp'] = array_merge(is_array($c['hp'] ?? null) ? $c['hp'] : [], $hp);
        $c['hpAt'] = max(round(microtime(true) * 1000), $stamp($c, 'hpAt') + 1);
        if (@file_put_contents("$dir/$id.json", json_encode($c, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false) cl_out(500, ['error' => "Couldn't save the hit points."]);
        if ($q !== null) @file_put_contents("$dir/.hp-changes", json_encode(array_slice([...$seen, $q], -500)));
    }
    flock($lock, LOCK_UN);
    $out = ['id' => $id, 'hp' => $c['hp'], 'hpAt' => $c['hpAt']];
    // the DM's open Monster Sheets, then every fight this monster is in (players load what they may see)
    live_publish('me-' . live_key('me', $user['sub']), ['type' => 'mhp'] + $out);
    cl_fights($accounts, $user['sub'], $id);
    cl_out(200, $out);
}

$body = file_get_contents('php://input', false, null, 0, CL_MAX + 1);
if ($body === false || $body === '') cl_out(400, ['error' => 'No character was sent.']);
if (strlen($body) > CL_MAX) cl_out(413, ['error' => 'That character is too big to save.']);
$c = json_decode($body, true);
if (!is_array($c) || !isset($c['abilities']) || !is_array($c['abilities']) || !$okId($c['id'] ?? null) || !is_numeric($c['updated'] ?? null)) cl_out(400, ['error' => "That isn't a character from the sheet."]);
$file = "$dir/{$c['id']}.json";
$have = $read($file);
if ($stamp($have, 'updated') > (float)$c['updated']) cl_out(409, ['updated' => $stamp($have, 'updated')]);
// HP changed through ?hp= stays as saved: this copy's HP may be older
if ($stamp($have, 'hpAt') > 0) {
    $c['hp'] = $have['hp'];
    $c['hpAt'] = $have['hpAt'];
    $body = json_encode($c, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
if (@file_put_contents($file, $body) === false) cl_out(500, ['error' => "Couldn't save the character."]);
flock($lock, LOCK_UN);
// archived or unarchived (ROADMAP 0.5): fights with it show the mark straight away
if (empty($c['archived']) !== empty($have['archived'])) cl_fights($accounts, $user['sub'], $c['id']);
cl_out(200, ['updated' => (float)$c['updated'], 'hp' => $c['hp'] ?? null, 'hpAt' => $c['hpAt'] ?? 0]);
