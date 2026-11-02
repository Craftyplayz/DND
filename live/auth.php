<?php
// Asked by the live relay (live/relay.js) when a browser connects, with that browser's cookie:
//   GET ?c=<campaign id>  -> {"key", "role": "dm" | "player"} when the signed-in player is in it, else 403.
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
if (!$c || cp_member($c, $user['sub']) < 0) {
    http_response_code(403);
    exit('{"error":"Not in this campaign."}');
}
echo json_encode(['key' => live_key($c['id'], $user['sub']), 'role' => $c['dm'] === $user['sub'] ? 'dm' : 'player']);
