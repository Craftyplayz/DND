<?php
// The table log for pages that share rolls (assets/js/tablelog.js), for signed-in players:
//   GET ?c=<campaign id>      -> {"session", "dm": bool, "entries": [...]}: the last 200 rolls this player may see, oldest first
//                                (&as=table: the Table view's, ROADMAP 1.7)
//   GET ?char=<character id>  -> {"campaigns": [{"id", "name", "dm"}]}: the campaigns one of your characters is in
//   GET ?dm=1                 -> {"campaigns": [...]}: the campaigns you DM or co-DM (the Monster Sheet's rolls go to one of them)
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/tablelog.php';
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';

function tl_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) tl_out(401, ['error' => 'Sign in to share rolls.']);
$sub = $user['sub'];
$list = fn($cs) => array_values(array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name'], 'dm' => cp_is_dm($c, $sub)], $cs));
if (isset($_GET['char'])) {
    $id = (string)$_GET['char'];
    tl_out(200, ['campaigns' => $list(array_filter(cp_all($accounts), function ($c) use ($sub, $id) {
        $i = cp_member($c, $sub);
        return $i >= 0 && in_array($id, array_column($c['members'][$i]['characters'] ?? [], 'id'), true);
    }))]);
}
if (isset($_GET['dm'])) tl_out(200, ['campaigns' => $list(cp_mine($accounts, $sub)['dm'])]);
$c = cp_get($accounts, $_GET['c'] ?? '');
$sub = cp_viewer($c, $user); // ?as=table: the Table view (ROADMAP 1.7) gets what players get, nothing "mine"
if ($sub === null) tl_out(404, ['error' => 'No such campaign.']);
$log = tl_read($accounts, $c['id'], tl_name($c)) ?? ['entries' => []];
tl_out(200, ['session' => $c['session'] ?? null, 'dm' => cp_is_dm($c, $sub), 'entries' => tl_tail($c, $sub, $log)]);
