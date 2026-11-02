<?php
// Campaign changes for signed-in players (includes/campaigns.php does the work):
//   POST {"act": "create", "name"}                  -> {"id"}, you're the DM
//   POST {"act": "join", "code"}                    -> {"id"}
//   POST {"act": "characters", "id", "characters"}  -> your characters in it (only your own, saved to your account)
//   POST {"act": "leave", "id"}                     players only
//   POST {"act": "rename" | "code" | "remove" | "delete", "id", ...}   DM only
//   POST {"act": "roll", "id", "roll": {...}}       a roll for the table log (includes/tablelog.php)
//   POST {"act": "session", "id", "start": bool}    the DM starts or ends a session
// After a change, the live relay tells everyone with the campaign open, and drops anyone who left or was removed.
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/tablelog.php';
require_once __DIR__ . '/../includes/live.php';
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
$act = $body['act'] ?? '';
if ($act === 'roll' || $act === 'session') {
    $c = cp_get($accounts, $body['id'] ?? '');
    if (!$c || cp_member($c, $user['sub']) < 0) cp_out(404, ['error' => 'No such campaign.']);
    if ($act === 'session' && $c['dm'] !== $user['sub']) cp_out(403, ['error' => 'Only the DM can do that.']);
    [$code, $out] = $act === 'roll' ? tl_add($accounts, $c, $user, $body['roll'] ?? null) : tl_session($accounts, $c, !empty($body['start']));
    flock($lock, LOCK_UN);
    if ($code === 200 && $act === 'session') live_publish($c['id'], ['type' => 'session', 'session' => $out['session']]);
    if ($code === 200 && $act === 'roll' && empty($out['again'])) {
        // each player gets only what tl_view lets them see
        $e = $out['entry'];
        $players = array_map(fn($m) => live_key($c['id'], $m['sub']), array_filter($c['members'], fn($m) => $m['sub'] !== $c['dm']));
        // "mine" is left off: each page knows its own rolls by the ids it sent
        $full = ['type' => 'roll', 'entry' => ['mine' => false] + tl_view($c, $c['dm'], $e)];
        if ($e['vis'] === 'public') live_publish($c['id'], $full);
        else {
            live_publish($c['id'], $full, null, 'dm');
            if ($e['vis'] === 'dm') live_publish($c['id'], $full, null, [live_key($c['id'], $e['sub'])]);
            else live_publish($c['id'], ['type' => 'roll', 'entry' => tl_view($c, '', $e)], null, array_values($players));
        }
    }
    cp_out($code, $out);
}
[$code, $out] = cp_act($accounts, $user, $body);
flock($lock, LOCK_UN);
$id = $out['id'] ?? $body['id'] ?? null;
if ($code === 200 && cp_ok_id($id)) {
    $c = cp_get($accounts, $id); // null once deleted: everyone is dropped
    live_publish($id, ['type' => 'campaign'], array_map(fn($m) => live_key($id, $m['sub']), $c['members'] ?? []));
}
cp_out($code, $out);
