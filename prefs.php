<?php
// Settings that follow the signed-in account: the localStorage keys listed in assets/js/sync.js, kept in
// private/dnd/accounts/prefs/<google sub>.json as {"<key>": {"updated": <ms>, "value": <string or null>}}.
//   GET                         -> that object
//   POST {key, updated, value}  -> kept unless the saved one is newer (then 409 with {"updated"})
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/includes/auth.php';
const PF_KEYS = ['dice-choice', 'dice-sets-page', 'dice-sets-sound', 'dnd.rollMode', 'monster-table', 'monster-roll-vis', 'compendium-view', 'compendium-rules', 'compendium-favs', 'compendium-recent', 'compendium-enc', 'encounter-rules', 'compendium-books', 'sheet-full-layout', 'map-tools']; // the same list as sync.js
const PF_MAX = 8 * 1024 * 1024; // only stops a broken client: the proxy turns away requests near 8 MB anyway

function pf_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) pf_out(401, ['error' => 'Sign in to save settings to your account.']);
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$dir = (getenv('DND_ACCOUNTS') ?: __DIR__ . '/private/dnd/accounts') . '/prefs';
$file = $dir . '/' . $user['sub'] . '.json';
$read = function () use ($file) {
    $all = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    return is_array($all) ? $all : [];
};

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') pf_out(200, (object)$read());
if ($_SERVER['REQUEST_METHOD'] !== 'POST') pf_out(405, ['error' => 'Use GET or POST.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) pf_out(415, ['error' => 'Send the setting as JSON.']);
$body = file_get_contents('php://input', false, null, 0, PF_MAX + 1);
if ($body === false || strlen($body) > PF_MAX) pf_out(413, ['error' => 'That setting is too big.']);
$p = json_decode($body, true);
if (!is_array($p) || !in_array($p['key'] ?? null, PF_KEYS, true) || !is_numeric($p['updated'] ?? null)
    || !(is_string($p['value'] ?? null) || array_key_exists('value', $p) && $p['value'] === null)) pf_out(400, ['error' => "That isn't a setting from this site."]);

if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) pf_out(500, ['error' => "Couldn't make the settings folder."]);
// one writer at a time per account, so the "newer wins" check and the write can't interleave
$lock = fopen($file . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) pf_out(500, ['error' => "Couldn't lock the settings."]);
$all = $read();
$have = (float)($all[$p['key']]['updated'] ?? 0);
if ($have > (float)$p['updated']) pf_out(409, ['updated' => $have]);
$all[$p['key']] = ['updated' => (float)$p['updated'], 'value' => $p['value']];
@file_put_contents($file, json_encode($all, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== false
    ? pf_out(200, ['updated' => (float)$p['updated']]) : pf_out(500, ['error' => "Couldn't save the setting."]);
