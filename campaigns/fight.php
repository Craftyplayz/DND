<?php
// The current fight (ROADMAP 1.4) for one campaign member, as fi_view() in includes/initiative.php lets them see it:
//   GET ?c=<campaign id>  -> {"fight": {...} | null}
//   GET ?c=<id>&as=table  -> the same for the Table view (ROADMAP 1.7, the DM and co-DMs only): what players see
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/initiative.php';
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$user = auth_user();
$c = $user ? cp_get($accounts, $_GET['c'] ?? '') : null;
$who = cp_viewer($c, $user);
if ($who === null) {
    http_response_code($user ? 404 : 401);
    exit('{"error":"No such campaign."}');
}
echo json_encode(['fight' => fi_view($accounts, $c, $who)], JSON_UNESCAPED_SLASHES);
