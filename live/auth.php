<?php
// Asked by the live relay (live/relay.js) when a browser connects, with that browser's cookie:
//   GET ?c=<campaign id>  -> {"key", "role": "dm" (the DM or a co-DM) | "player"} when the signed-in player is in it, else 403.
//   GET ?c=<id>&as=table  -> {"key", "role": "table"}: the Table view (ROADMAP 1.7), opened by the DM or a co-DM; it hears only
//                            what goes to everyone or to the table's own key (cp_table_key), never the DM's messages.
//   GET ?c=me             -> {"key", "role": "me", "room"}: the player's own room, for their open Monster Sheets (ROADMAP 1.4)
// It only tells you about yourself, so it's harmless if called from outside.
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/campaigns.php';
require_once __DIR__ . '/../includes/live.php';
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$user = auth_user();
if ($user && ($_GET['c'] ?? '') === 'me') exit(json_encode(['key' => $k = live_key('me', $user['sub']), 'role' => 'me', 'room' => "me-$k"]));
$c = $user ? cp_get($accounts, $_GET['c'] ?? '') : null;
$who = cp_viewer($c, $user);
if ($who === null) {
    http_response_code(403);
    exit('{"error":"Not in this campaign."}');
}
if ($who === CP_TABLE) exit(json_encode(['key' => cp_table_key($c['id']), 'role' => 'table']));
echo json_encode(['key' => live_key($c['id'], $user['sub']), 'role' => cp_is_dm($c, $user['sub']) ? 'dm' : 'player']);
