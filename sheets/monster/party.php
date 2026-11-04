<?php
// The party of a campaign, for the encounter builder on the Monster Sheet (ROADMAP 3.2). DM and co-DMs only.
//   GET ?c=<campaign id>  -> {"name", "chars": [{"id", "name", "level", "draft"}]}; level is the total of its class levels, 0 with none
//   404 {"gone": true}: no such campaign, or you aren't its DM or a co-DM any more. Levels are read from the owners' saves, never copied.
require __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/campaigns.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts';

function pt_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$user = auth_user();
if (!$user) pt_out(401, ['error' => "Sign in to read a campaign's party."]);
$c = cp_get($accounts, $_GET['c'] ?? '');
if (!$c || !cp_is_dm($c, $user['sub'])) pt_out(404, ['error' => 'No such campaign.', 'gone' => true]);
$chars = [];
foreach ($c['members'] ?? [] as $m) foreach ($m['characters'] ?? [] as $l) {
    $id = $l['id'] ?? '';
    $ch = ch_ok_id($id) ? ch_json("$accounts/characters/$id/character.json") : null;
    if (!$ch || ch_archived(ch_meta($accounts, $id))) continue;
    $classes = is_array($ch['classes'] ?? null) ? $ch['classes'] : [];
    $chars[] = ['id' => $id, 'name' => ($ch['name'] ?? '') !== '' ? (string)$ch['name'] : 'Unnamed character',
        'level' => array_sum(array_map(fn($k) => is_array($k) ? (int)($k['level'] ?? 0) : 0, $classes)), 'draft' => !empty($ch['draft'])];
}
pt_out(200, ['name' => $c['name'], 'chars' => $chars]);
