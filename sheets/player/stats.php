<?php
// The action log (ROADMAP "Stats data"), for signed-in players: includes/stats.php does the work. Write only: no page reads it yet.
//   POST {"now": <the browser's clock>, "events": [{"t", "id", "char", "at", ...}]} -> {"wait": [ids of actions to send again later]}
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../../includes/auth.php';
require __DIR__ . '/../../includes/stats.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts';

function st_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) st_out(401, ['error' => 'Sign in to save this to your account.']);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') st_out(405, ['error' => 'Use POST.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) st_out(415, ['error' => 'Send JSON.']);
$body = json_decode((string)file_get_contents('php://input', false, null, 0, 2 * 1024 * 1024), true);
if (!is_array($body)) st_out(400, ['error' => "That isn't a list of actions."]);
[$code, $out] = st_take($accounts, $user['sub'], $body);
st_out($code, $out);
