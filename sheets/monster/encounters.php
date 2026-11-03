<?php
// Named encounters for the Monster Sheet (ROADMAP 3.1): the account's encounter list, merged per encounter (includes/encounters.php).
//   GET                      -> {"encs": [...]}
//   POST {"encs": [...]}     -> {"encs": [...]}: the account's list with these merged in (newer "updated" wins per encounter)
// Like cloud.php: JSON only (other sites can't post here as the player), one writer at a time, 401 when signed out.
require __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/encounters.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts';

function enc_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$user = auth_user();
if (!$user) enc_out(401, ['error' => 'Sign in to save encounters to your account.']);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') enc_out(200, ['encs' => enc_read($accounts, $user['sub'])]);
if ($method !== 'POST') enc_out(405, ['error' => 'Use GET or POST.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) enc_out(415, ['error' => 'Send the encounters as JSON.']);
$body = (string)file_get_contents('php://input', false, null, 0, 1024 * 1024 + 1);
if (strlen($body) > 1024 * 1024) enc_out(413, ['error' => 'That encounter list is too big to save.']);
enc_out(...enc_save($accounts, $user['sub'], json_decode($body, true)));
