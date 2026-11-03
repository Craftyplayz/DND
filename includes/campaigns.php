<?php
// Campaigns, for signed-in players: one folder per campaign, <accounts>/campaigns/<id>/campaign.json
//   {"id", "name", "dm": <google sub>, "code": <join code>, "created": <unix time>,
//    "members": [{"sub", "name", "joined", "characters": [{"sheet": "player", "id": <character id>}]}],
//    "codms": [<google sub>, ...] (co-DMs: members the DM promoted; missing in older campaigns, meaning none)}
// The DM is always members[0]. cp_is_dm() (DM or co-DM) and cp_is_owner() (the DM alone) are the only role checks. A campaign only links characters (My Characters, accounts/characters/<id>/); it never
// copies or writes them, so the player's own save stays the only copy. Deleting moves the folder to campaigns/.deleted/.
// Used by campaigns/api.php (changes), campaigns/index.php and campaigns/join/ (pages), characters/index.php (DM access).
// Every function takes the accounts folder, so _dev/scripts/campaigns.test.php gets its own.
require_once __DIR__ . '/characters.php';
require_once __DIR__ . '/live.php';

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

// the DM: the campaign's creator. Only they rename, delete, make a new join link, remove players and pick co-DMs.
function cp_is_owner($c, $sub)
{
    return is_string($sub) && $sub !== '' && ($c['dm'] ?? null) === $sub;
}

// the DM or a co-DM: everything else the DM can do (party sheets, fights, sessions, hidden rolls and whispers)
function cp_is_dm($c, $sub)
{
    return cp_is_owner($c, $sub) || (cp_member($c, $sub) >= 0 && in_array($sub, (array)($c['codms'] ?? []), true));
}

// The Table view (ROADMAP 1.7): the DM's own signed-in tab, but every filter treats it as this stand-in "sub", which is never
// a member, a DM or anyone's owner, so it gets what a player with no characters gets and nothing "mine". The filters that
// show the table something extra (a hidden monster's turn as "DM's turn", the handout on the TV) check for it by name.
const CP_TABLE = 'table';

// who a request reads as: the signed-in player, or CP_TABLE for ?as=table from the DM or a co-DM; null: not allowed
function cp_viewer($c, $user)
{
    if (!$c || !$user || cp_member($c, $user['sub']) < 0) return null;
    if (($_GET['as'] ?? '') !== 'table') return $user['sub'];
    return cp_is_dm($c, $user['sub']) ? CP_TABLE : null;
}

// the Table view's key in the campaign's live room (every DM's table tab shares it)
function cp_table_key($cid)
{
    return live_key($cid, CP_TABLE);
}

// ['dm' => [...], 'player' => [...]] campaigns of this player, newest first; 'dm' includes the ones they co-DM
function cp_mine($accounts, $sub)
{
    $out = ['dm' => [], 'player' => []];
    foreach (cp_all($accounts) as $c) {
        if (cp_is_dm($c, $sub)) $out['dm'][] = $c;
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

// does $sub DM or co-DM a campaign that this character is attached to? (read-only access to the sheet)
function cp_dm_sees($accounts, $sub, $charId)
{
    foreach (cp_all($accounts) as $c) {
        if (!cp_is_dm($c, $sub)) continue;
        foreach ($c['members'] as $m) foreach ($m['characters'] ?? [] as $l) if (($l['id'] ?? null) === $charId) return true;
    }
    return false;
}

// is this character attached to campaign $c (by any member)?
function cp_has_char($c, $charId)
{
    foreach ($c['members'] ?? [] as $m) if (in_array($charId, array_column($m['characters'] ?? [], 'id'), true)) return true;
    return false;
}

// is $sub in a campaign this character is attached to? (its card and portrait show to the whole party)
function cp_member_sees($accounts, $sub, $charId)
{
    foreach (cp_all($accounts) as $c) {
        if (cp_member($c, $sub) < 0) continue;
        foreach ($c['members'] as $m) foreach ($m['characters'] ?? [] as $l) if (($l['id'] ?? null) === $charId) return true;
    }
    return false;
}

// an archived character leaves every campaign it's in (sheets/player/cloud.php). The caller holds cp_lock().
function cp_detach($accounts, $charId)
{
    foreach (cp_all($accounts) as $c) {
        $hit = false;
        foreach ($c['members'] as &$m) {
            $keep = array_values(array_filter($m['characters'] ?? [], fn($l) => ($l['id'] ?? null) !== $charId));
            if (count($keep) !== count($m['characters'] ?? [])) { $m['characters'] = $keep; $hit = true; }
        }
        unset($m);
        if ($hit) cp_put($accounts, $c);
    }
}

// a character's card: name, "Level | Species | Class" and art, read from the owner's save (never copied)
// shortcut: inline art goes into the page as it is, so a party with big portraits makes a heavy page; ROADMAP 0.4 moves art to files
function cp_card($accounts, $id)
{
    $ch = ch_ok_id($id) ? ch_json("$accounts/characters/$id/character.json") : null;
    if (!$ch) return null;
    $classes = array_filter(array_map(fn($k) => is_array($k) ? (string)($k['name'] ?? '') : '', is_array($ch['classes'] ?? null) ? $ch['classes'] : []));
    $level = array_sum(array_map(fn($k) => is_array($k) ? (int)($k['level'] ?? 0) : 0, is_array($ch['classes'] ?? null) ? $ch['classes'] : [])) ?: 1;
    $art = is_string($ch['art'] ?? null) && preg_match('#^(data:image/|https://)#', $ch['art']) ? $ch['art']
        : (is_string($ch['artUrl'] ?? null) && preg_match('#^/sheets/player/art\.php\?id=[\w-]+&v=[a-f0-9]{12}$#', $ch['artUrl']) ? $ch['artUrl'] : '');
    return ['name' => ($ch['name'] ?? '') !== '' ? (string)$ch['name'] : 'Unnamed character',
        'line' => implode(' | ', array_filter(["Level $level", (string)($ch['race'] ?? ''), implode(' / ', $classes)])), 'art' => $art];
}

// the campaigns this character is attached to (one at a time since 2026-11-02; older ones may still be in several)
function cp_char_in($accounts, $charId)
{
    $out = [];
    foreach (cp_all($accounts) as $c) foreach ($c['members'] as $m) if (in_array($charId, array_column($m['characters'] ?? [], 'id'), true)) { $out[] = $c; break; }
    return $out;
}

// a copy of one of $sub's characters as a new character of theirs, through the normal folder layout: the current sheet
// and portrait, named "<name> (copy)", with a fresh roll log and a fresh history (no history files are copied). New id or null.
function cp_clone_char($accounts, $sub, $charId)
{
    $ch = (ch_meta($accounts, $charId)['owner'] ?? null) === $sub ? ch_json("$accounts/characters/$charId/character.json") : null;
    if (!$ch) return null;
    do $id = bin2hex(random_bytes(6)); while (is_dir("$accounts/characters/$id"));
    $dir = "$accounts/characters/$id";
    if (!@mkdir($dir, 0750, true) || !ch_new_meta($dir, $sub, time())) return null;
    $ch['id'] = $id;
    $ch['name'] = (trim((string)($ch['name'] ?? '')) !== '' ? trim($ch['name']) : 'Unnamed character') . ' (copy)';
    $ch['rolls'] = [];
    $ch['updated'] = (int)round(microtime(true) * 1000);
    if ($art = ch_art_file($accounts, $charId)) {
        $to = "$dir/" . basename($art);
        if (!@copy($art, $to)) return null;
        $ch['artUrl'] = ch_art_url($id, $to);
    }
    return ch_write($dir, json_encode($ch, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) ? $id : null;
}

// $sub is no longer a co-DM (left, removed or demoted); "codms" is only written once a campaign has had one
function cp_drop_codm(&$c, $sub)
{
    if (isset($c['codms'])) $c['codms'] = array_values(array_filter((array)$c['codms'], fn($s) => $s !== $sub));
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
    $owner = cp_is_owner($c, $sub);
    // by reference: it saves $c as changed below (an arrow function would keep the copy from this line)
    $save = function ($out) use ($accounts, &$c) { return cp_put($accounts, $c) ? [200, $out] : [500, ['error' => "Couldn't save the campaign."]]; };

    if ($act === 'characters') {
        $ids = $body['characters'] ?? null;
        if (!is_array($ids)) return [400, ['error' => 'Send a list of characters.']];
        $links = [];
        $have = array_column($c['members'][$me]['characters'] ?? [], 'id');
        foreach (array_unique($ids) as $cid) {
            $meta = ch_meta($accounts, $cid);
            if (($meta['owner'] ?? null) !== $sub) return [400, ['error' => "You can only add your own characters that are saved to your account."]];
            if (ch_archived($meta)) return [400, ['error' => "Archived characters can't join a campaign. Unarchive one in My Characters first."]];
            // one campaign per character; one that is here already (from before the rule) stays
            $in = in_array($cid, $have, true) ? [] : array_values(array_filter(cp_char_in($accounts, $cid), fn($o) => $o['id'] !== $c['id']));
            if ($in) {
                $name = (string)(ch_json("$accounts/characters/$cid/character.json")['name'] ?? '') ?: 'Unnamed character';
                return [409, ['error' => "$name is already in {$in[0]['name']}. A character can be in one campaign at a time.",
                    'conflict' => ['id' => $cid, 'name' => $name, 'campaigns' => array_map(fn($o) => ['id' => $o['id'], 'name' => $o['name']], $in)]]];
            }
            $links[] = ['sheet' => 'player', 'id' => $cid];
        }
        $c['members'][$me]['characters'] = $links;
        return $save(['characters' => $links]);
    }
    // a copy of your character, put in this campaign in the original's place (if it was here)
    if ($act === 'clone') {
        $cid = (string)($body['char'] ?? '');
        if ((ch_meta($accounts, $cid)['owner'] ?? null) !== $sub) return [404, ['error' => 'No such character.']];
        if (ch_archived(ch_meta($accounts, $cid))) return [400, ['error' => "Archived characters can't join a campaign. Unarchive one in My Characters first."]];
        $new = cp_clone_char($accounts, $sub, $cid);
        if (!$new) return [500, ['error' => "Couldn't copy the character."]];
        $c['members'][$me]['characters'] = array_values(array_filter($c['members'][$me]['characters'] ?? [], fn($l) => ($l['id'] ?? null) !== $cid));
        $c['members'][$me]['characters'][] = ['sheet' => 'player', 'id' => $new];
        return $save(['char' => $new]);
    }
    // keep your character in this campaign only: it leaves every other one ("changed": the campaigns it left)
    if ($act === 'keep') {
        $cid = (string)($body['char'] ?? '');
        if (!in_array($cid, array_column($c['members'][$me]['characters'] ?? [], 'id'), true)) return [404, ['error' => "That character isn't yours in this campaign."]];
        $changed = [];
        foreach (cp_char_in($accounts, $cid) as $o) {
            if ($o['id'] === $c['id']) continue;
            foreach ($o['members'] as &$m) $m['characters'] = array_values(array_filter($m['characters'] ?? [], fn($l) => ($l['id'] ?? null) !== $cid));
            unset($m);
            if (!cp_put($accounts, $o)) return [500, ['error' => "Couldn't save the campaign."]];
            $changed[] = $o['id'];
        }
        return [200, ['kept' => $c['id'], 'changed' => $changed]];
    }
    if ($act === 'leave') {
        if ($owner) return [400, ['error' => "The DM can't leave. Delete the campaign instead."]];
        array_splice($c['members'], $me, 1);
        cp_drop_codm($c, $sub);
        return $save(['left' => true]);
    }
    if (!$owner) return [403, ['error' => 'Only the DM can do that.']];
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
        cp_drop_codm($c, $c['members'][$i]['sub']);
        array_splice($c['members'], $i, 1);
        return $save(['removed' => true]);
    }
    // {act: "codm", member, on}: make a player a co-DM, or a player again
    if ($act === 'codm') {
        $who = (string)($body['member'] ?? '');
        $i = cp_member($c, $who);
        if ($i < 0) return [404, ['error' => 'That player is not in this campaign.']];
        if ($i === $me) return [400, ['error' => "You're the DM already."]];
        cp_drop_codm($c, $who);
        if (!empty($body['on'])) $c['codms'][] = $who;
        return $save(['codms' => $c['codms'] ?? []]);
    }
    if ($act === 'delete') {
        $gone = "$accounts/campaigns/.deleted";
        if (!is_dir($gone) && !@mkdir($gone, 0750, true) && !is_dir($gone)) return [500, ['error' => "Couldn't delete the campaign."]];
        return @rename("$accounts/campaigns/{$c['id']}", "$gone/{$c['id']}-" . time()) ? [200, ['deleted' => true]] : [500, ['error' => "Couldn't delete the campaign."]];
    }
    return [400, ['error' => 'Unknown action.']];
}
