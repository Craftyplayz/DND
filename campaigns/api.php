<?php
// Campaign changes for signed-in players (includes/campaigns.php does the work):
//   POST {"act": "create", "name"}                  -> {"id"}, you're the DM
//   POST {"act": "join", "code"}                    -> {"id"}
//   POST {"act": "characters", "id", "characters"}  -> your characters in it (only your own, saved to your account);
//                                                      409 {"conflict"} for one already in another campaign
//   POST {"act": "clone", "id", "char"}             -> {"char"}: a copy of your character, in this campaign in its place
//   POST {"act": "keep", "id", "char"}              your character leaves every other campaign
//   POST {"act": "leave", "id"}                     players only
//   POST {"act": "rename" | "code" | "remove" | "delete", "id", ...}   DM only (not co-DMs)
//   POST {"act": "codm", "id", "member", "on": bool}  DM only: make a player a co-DM, or a player again -> {"codms"}
//   POST {"act": "rules", "id", "methods", "hp"}  the DM or a co-DM: how characters are built (ROADMAP 4.2) -> {"rules"}
//   POST {"act": "roll", "id", "roll": {...}}       a roll for the table log (includes/tablelog.php)
//   POST {"act": "session", "id", "start": bool}    the DM or a co-DM starts or ends a session
//   POST {"act": "fight", "id", "op", ...}           the DM or a co-DM runs the initiative tracker (includes/initiative.php, fi_op);
//                                                      409 {"stale"} when the fight changed since the DM's copy ("v")
// An initiative roll also joins the fight (fi_roll). Every fight change also updates the battle map's tokens (mp_fight_sync). Fight changes only tell pages "fight": each loads campaigns/fight.php.
// After a change, the live relay tells everyone with the campaign open, and drops anyone who left or was removed.
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/initiative.php';
require __DIR__ . '/../includes/maps.php';
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
if ($act === 'roll' || $act === 'session' || $act === 'fight') {
    $c = cp_get($accounts, $body['id'] ?? '');
    if (!$c || cp_member($c, $user['sub']) < 0) cp_out(404, ['error' => 'No such campaign.']);
    if ($act !== 'roll' && !cp_is_dm($c, $user['sub'])) cp_out(403, ['error' => 'Only the DM can do that.']);
    $logs = [];
    $fight = false;
    $before = $act === 'session' ? null : fi_read($accounts, $c['id']); // the map on the table follows the fight (mp_fight_sync)
    if ($act === 'fight') [$code, $out, $logs] = fi_op($accounts, $c, $body, $user['sub']);
    else [$code, $out] = $act === 'roll' ? tl_add($accounts, $c, $user, $body['roll'] ?? null) : tl_session($accounts, $c, !empty($body['start']));
    if ($code === 200 && $act === 'roll' && empty($out['again'])) $fight = fi_roll($accounts, $c, $user, $body['roll']);
    if ($code === 200 && $act === 'fight') st_turn($accounts, $c, $before, fi_read($accounts, $c['id'])); // the action log (ROADMAP "Stats data")
    if ($code === 200 && ($act === 'fight' || $fight) && ($ml = mp_lock($accounts, $c['id']))) { mp_fight_sync($accounts, $c, $before, fi_read($accounts, $c['id'])); flock($ml, LOCK_UN); }
    flock($lock, LOCK_UN);
    if ($code === 200 && ($act === 'fight' || $fight)) live_publish($c['id'], ['type' => 'fight']);
    foreach ($logs as $e) live_publish($c['id'], ['type' => 'roll', 'entry' => ['mine' => false] + tl_view($c, $c['dm'], $e)]);

    if ($code === 200 && $act === 'session') live_publish($c['id'], ['type' => 'session', 'session' => $out['session']]);
    if ($code === 200 && $act === 'roll' && empty($out['again'])) {
        // each player gets only what tl_view lets them see
        $e = $out['entry'];
        $players = array_map(fn($m) => live_key($c['id'], $m['sub']), array_filter($c['members'], fn($m) => !cp_is_dm($c, $m['sub'])));
        // "mine" is left off: each page knows its own rolls by the ids it sent
        $full = ['type' => 'roll', 'entry' => ['mine' => false] + tl_view($c, $c['dm'], $e)];
        // a public roll with its dice says which set to throw them with on the Table view (1.7): the roller's own
        if ($e['vis'] === 'public') live_publish($c['id'], isset($e['dice']) ? $full + ['set' => tl_dice_set($accounts, $e['sub'], $e['char'])] : $full);
        else {
            live_publish($c['id'], $full, null, 'dm');
            if ($e['vis'] === 'dm') live_publish($c['id'], $full, null, [live_key($c['id'], $e['sub'])]);
            // a whisper ("dm") never reaches the Table view; a hidden DM roll reaches it, and players, as "DM rolled" only
            else {
                live_publish($c['id'], ['type' => 'roll', 'entry' => tl_view($c, '', $e)], null, array_values($players));
                live_publish($c['id'], ['type' => 'roll', 'entry' => tl_view($c, CP_TABLE, $e)], null, [cp_table_key($c['id'])]);
            }
        }
    }
    cp_out($code, $out);
}
[$code, $out] = cp_act($accounts, $user, $body);
flock($lock, LOCK_UN);
$id = $out['id'] ?? $body['id'] ?? null;
if ($code === 200 && cp_ok_id($id)) {
    $c = cp_get($accounts, $id); // null once deleted: everyone is dropped (the Table view too, ROADMAP 1.7)
    live_publish($id, ['type' => 'campaign'], $c ? [...array_map(fn($m) => live_key($id, $m['sub']), $c['members']), cp_table_key($id)] : []);
    // a new role: their open pages reconnect, so the relay hears it (a demoted co-DM stops getting the DM's messages, and the
    // Table view tabs ask again, so a demoted co-DM's one is turned away)
    if ($act === 'codm') live_publish($id, null, null, null, [live_key($id, (string)$body['member']), cp_table_key($id)]);
}
foreach ($out['changed'] ?? [] as $o) live_publish($o, ['type' => 'campaign']);
cp_out($code, $out);
