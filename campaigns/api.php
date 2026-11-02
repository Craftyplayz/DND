<?php
// Campaign changes for signed-in players (includes/campaigns.php does the work):
//   POST {"act": "create", "name"}                  -> {"id"}, you're the DM
//   POST {"act": "join", "code"}                    -> {"id"}
//   POST {"act": "characters", "id", "characters"}  -> your characters in it (only your own, saved to your account)
//   POST {"act": "leave", "id"}                     players only
//   POST {"act": "rename" | "code" | "remove" | "delete", "id", ...}   DM only
// After a change, the live relay tells everyone with the campaign open, and drops anyone who left or was removed.
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/campaigns.php';
require __DIR__ . '/../includes/live.php';
// DND_ACCOUNTS: a stand-in folder for _dev/scripts/campaigns-page.mjs, so the check never touches real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';

function cp_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) cp_out(401, ['error' => 'Sign in to use campaigns.']);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') cp_out(405, ['error' => 'Use POST.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) cp_out(415, ['error' => 'Send JSON.']);
$body = json_decode((string)file_get_contents('php://input', false, null, 0, 64 * 1024), true);
if (!is_array($body)) cp_out(400, ['error' => "That isn't a campaign change."]);
$lock = cp_lock($accounts);
if (!$lock) cp_out(500, ['error' => "Couldn't lock the campaigns folder."]);
[$code, $out] = cp_act($accounts, $user, $body);
flock($lock, LOCK_UN);
$id = $out['id'] ?? $body['id'] ?? null;
if ($code === 200 && cp_ok_id($id)) {
    $c = cp_get($accounts, $id); // null once deleted: everyone is dropped
    live_publish($id, ['type' => 'campaign'], array_map(fn($m) => live_key($id, $m['sub']), $c['members'] ?? []));
}
cp_out($code, $out);
