<?php
// Campaigns, for signed-in players: one folder per campaign, <accounts>/campaigns/<id>/campaign.json
//   {"id", "name", "dm": <google sub>, "code": <join code>, "created": <unix time>,
//    "members": [{"sub", "name", "joined", "characters": [{"sheet": "player", "id": <character id>}]}]}
// The DM is always members[0]. A campaign only links characters (My Characters, accounts/characters/<id>/); it never
// copies or writes them, so the player's own save stays the only copy. Deleting moves the folder to campaigns/.deleted/.
// Used by campaigns/api.php (changes), campaigns/index.php and campaigns/join/ (pages), characters/index.php (DM access).
// Every function takes the accounts folder, so _dev/scripts/campaigns.test.php gets its own.
require_once __DIR__ . '/characters.php';

const CP_NAME = 80; // characters in a campaign name

function cp_ok_id($id)
{
    return is_string($id) && preg_match('/^[a-f0-9]{12}$/', $id);
}

function cp_ok_code($code)
{
    return is_string($code) && preg_match('/^[a-f0-9]{10}$/', $code);
}

function cp_get($accounts, $id)
{
    return cp_ok_id($id) ? ch_json("$accounts/campaigns/$id/campaign.json") : null;
}

// write through a temp file, so a crash mid-write never leaves half a campaign
function cp_put($accounts, $c)
{
    $dir = "$accounts/campaigns/{$c['id']}";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return false;
    $tmp = "$dir/.campaign.json." . getmypid();
    return @file_put_contents($tmp, json_encode($c, JSON_PRETTY_PRINT)) !== false && @rename($tmp, "$dir/campaign.json");
}

// one writer at a time across all campaigns
function cp_lock($accounts)
{
    $dir = "$accounts/campaigns";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return null;
    $lock = fopen("$dir/.lock", 'c');
    return $lock && flock($lock, LOCK_EX) ? $lock : null;
}

// shortcut: reads every campaign.json, fine for a few hundred campaigns; add an index file past that
function cp_all($accounts)
{
    $out = [];
    foreach (glob("$accounts/campaigns/*/campaign.json") ?: [] as $f) if ($c = ch_json($f)) $out[] = $c;
    return $out;
}

// index of this player in members, or -1
function cp_member($c, $sub)
{
    foreach ($c['members'] ?? [] as $i => $m) if (($m['sub'] ?? null) === $sub) return $i;
    return -1;
}

// ['dm' => [...], 'player' => [...]] campaigns of this player, newest first
function cp_mine($accounts, $sub)
{
    $out = ['dm' => [], 'player' => []];
    foreach (cp_all($accounts) as $c) {
        if (($c['dm'] ?? null) === $sub) $out['dm'][] = $c;
        elseif (cp_member($c, $sub) >= 0) $out['player'][] = $c;
    }
    foreach ($out as &$list) usort($list, fn($a, $b) => ($b['created'] ?? 0) <=> ($a['created'] ?? 0));
    return $out;
}

function cp_by_code($accounts, $code)
{
    if (!cp_ok_code($code)) return null;
    foreach (cp_all($accounts) as $c) if (($c['code'] ?? null) === $code) return $c;
    return null;
}

// does $sub DM a campaign that this character is attached to? (read-only access to the sheet)
function cp_dm_sees($accounts, $sub, $charId)
{
    foreach (cp_all($accounts) as $c) {
        if (($c['dm'] ?? null) !== $sub) continue;
        foreach ($c['members'] as $m) foreach ($m['characters'] ?? [] as $l) if (($l['id'] ?? null) === $charId) return true;
    }
    return false;
}

// the name other players see: the Google name, never the email
function cp_who($user)
{
    $n = trim((string)($user['name'] ?? ''));
    return $n !== '' ? mb_substr($n, 0, CP_NAME) : 'Player';
}

function cp_clean_name($name)
{
    $name = trim(preg_replace('/\s+/u', ' ', (string)$name));
    return $name === '' ? null : mb_substr($name, 0, CP_NAME);
}

// One change from campaigns/api.php: [http code, response]. $body is the decoded JSON {act, ...}.
// The caller holds cp_lock().
function cp_act($accounts, $user, $body)
{
    $sub = $user['sub'];
    $act = $body['act'] ?? '';
    if ($act === 'create') {
        $name = cp_clean_name($body['name'] ?? '');
        if ($name === null) return [400, ['error' => 'Give the campaign a name.']];
        do $id = bin2hex(random_bytes(6)); while (is_dir("$accounts/campaigns/$id"));
        $c = ['id' => $id, 'name' => $name, 'dm' => $sub, 'code' => bin2hex(random_bytes(5)), 'created' => time(),
            'members' => [['sub' => $sub, 'name' => cp_who($user), 'joined' => time(), 'characters' => []]]];
        return cp_put($accounts, $c) ? [200, ['id' => $id]] : [500, ['error' => "Couldn't save the campaign."]];
    }
    if ($act === 'join') {
        $c = cp_by_code($accounts, $body['code'] ?? '');
        if (!$c) return [404, ['error' => "This link doesn't work any more. Ask your DM for a new one."]];
        if (cp_member($c, $sub) < 0) {
            $c['members'][] = ['sub' => $sub, 'name' => cp_who($user), 'joined' => time(), 'characters' => []];
            if (!cp_put($accounts, $c)) return [500, ['error' => "Couldn't join the campaign."]];
        }
        return [200, ['id' => $c['id']]];
    }

    // everything else is about one campaign this player is in
    $c = cp_get($accounts, $body['id'] ?? '');
    $me = $c ? cp_member($c, $sub) : -1;
    if ($me < 0) return [404, ['error' => 'No such campaign.']];
    $dm = $c['dm'] === $sub;
    // by reference: it saves $c as changed below (an arrow function would keep the copy from this line)
    $save = function ($out) use ($accounts, &$c) { return cp_put($accounts, $c) ? [200, $out] : [500, ['error' => "Couldn't save the campaign."]]; };

    if ($act === 'characters') {
        $ids = $body['characters'] ?? null;
        if (!is_array($ids)) return [400, ['error' => 'Send a list of characters.']];
        $links = [];
        foreach (array_unique($ids) as $cid) {
            $meta = ch_meta($accounts, $cid);
            if (($meta['owner'] ?? null) !== $sub) return [400, ['error' => "You can only add your own characters that are saved to your account."]];
            $links[] = ['sheet' => 'player', 'id' => $cid];
        }
        $c['members'][$me]['characters'] = $links;
        return $save(['characters' => $links]);
    }
    if ($act === 'leave') {
        if ($dm) return [400, ['error' => "The DM can't leave. Delete the campaign instead."]];
        array_splice($c['members'], $me, 1);
        return $save(['left' => true]);
    }
    if (!$dm) return [403, ['error' => 'Only the DM can do that.']];
    if ($act === 'rename') {
        $name = cp_clean_name($body['name'] ?? '');
        if ($name === null) return [400, ['error' => 'Give the campaign a name.']];
        $c['name'] = $name;
        return $save(['name' => $name]);
    }
    if ($act === 'code') {
        $c['code'] = bin2hex(random_bytes(5));
        return $save(['code' => $c['code']]);
    }
    if ($act === 'remove') {
        $i = cp_member($c, (string)($body['member'] ?? ''));
        if ($i < 0) return [404, ['error' => 'That player is not in this campaign.']];
        if ($i === $me) return [400, ['error' => "The DM can't be removed."]];
        array_splice($c['members'], $i, 1);
        return $save(['removed' => true]);
    }
    if ($act === 'delete') {
        $gone = "$accounts/campaigns/.deleted";
        if (!is_dir($gone) && !@mkdir($gone, 0750, true) && !is_dir($gone)) return [500, ['error' => "Couldn't delete the campaign."]];
        return @rename("$accounts/campaigns/{$c['id']}", "$gone/{$c['id']}-" . time()) ? [200, ['deleted' => true]] : [500, ['error' => "Couldn't delete the campaign."]];
    }
    return [400, ['error' => 'Unknown action.']];
}
