<?php
// A player's homebrew in their account (includes/homebrew.php).
//   GET                              -> {"acct": "...", "mine": [...], "shared": [...], "shares": {id: [campaign ids]}, "camps": [{id, name, dm}]}
//   POST an entry                    -> kept unless the saved copy has a newer "updated" (then 409 with {"updated"})
//   POST ?act=share {id, c, on}      -> the owner shares their entry with a campaign they're in, or takes it back
//   POST ?act=remove {c, ref}        -> the DM or a co-DM takes an entry out of their campaign
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/homebrew.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';

function hb_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) hb_out(401, ['error' => 'Sign in to save homebrew to your account.']);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') hb_out(200, hb_view($accounts, $user['sub']));
if ($method !== 'POST') hb_out(405, ['error' => 'Use GET or POST.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) hb_out(415, ['error' => 'Send it as JSON.']);
$body = file_get_contents('php://input', false, null, 0, HB_MAX + 1);
if ($body === false || strlen($body) > HB_MAX) hb_out(413, ['error' => "That's too big to save."]);
$in = json_decode($body, true);
$act = $_GET['act'] ?? '';
if ($act === 'share') [$code, $out] = hb_share($accounts, $user['sub'], $in['c'] ?? null, $in['id'] ?? null, !empty($in['on']));
elseif ($act === 'remove') [$code, $out] = hb_remove($accounts, $user['sub'], $in['c'] ?? null, $in['ref'] ?? null);
else [$code, $out] = hb_save($accounts, $user['sub'], $in);
hb_out($code, $out);
