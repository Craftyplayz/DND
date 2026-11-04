<?php
// Named encounters on the Monster Sheet (ROADMAP 3.1). Each account's list is one file,
//   private/dnd/accounts/monster-encounters/<google sub>.json  ->  {"encs": [{"id", "name", "order", "archived", "updated", "party"?}, ...], "unsorted"?: {"party", "updated"}}
// party (ROADMAP 3.2): who the encounter's difficulty is worked out for, {"camp": campaign id or "", "off": [character ids left out], "levels": typed levels, "at": when picked, "gone": 1 once the campaign can't be read}.
// Unsorted isn't in the list, so its party sits beside it. Encounters that never had a party keep the older shape.
// kept apart from accounts/monsters/<sub>/ so it can never be taken for a monster. A monster names its encounter in its own "enc".
// Lists merge per encounter: the newer "updated" wins (name, order, archived), and an encounter either side has is never dropped.

// monster ids (sheets/monster/cloud.php): never starting with "_", the prefix kept for the sheet's own files
function mon_id_ok($id)
{
    return is_string($id) && preg_match('/^[A-Za-z0-9-][A-Za-z0-9_-]{0,63}$/', $id) === 1;
}

// a party in the saved shape, or null
function enc_party_clean($p)
{
    if (!is_array($p)) return null;
    $camp = is_string($p['camp'] ?? null) && preg_match('/^[a-f0-9]{12}$/', $p['camp']) ? $p['camp'] : '';
    $off = array_values(array_filter(is_array($p['off'] ?? null) ? $p['off'] : [], fn($x) => is_string($x) && preg_match('/^[\w-]{1,64}$/', $x)));
    $num = fn($k) => is_numeric($p[$k] ?? null) ? (float)$p[$k] : 0.0;
    return ['camp' => $camp, 'off' => $off, 'levels' => is_string($p['levels'] ?? null) ? $p['levels'] : '', 'at' => $num('at'), 'gone' => $num('gone')];
}

// the well-formed encounters of a list, in the saved shape; anything else is left out
function enc_clean($list)
{
    $out = [];
    foreach (is_array($list) ? $list : [] as $e) {
        if (!is_array($e) || !is_string($e['id'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $e['id'])) continue;
        $num = fn($k) => is_numeric($e[$k] ?? null) ? (float)$e[$k] : 0.0;
        $row = ['id' => $e['id'], 'name' => (is_string($e['name'] ?? null) ? $e['name'] : ''), 'order' => $num('order'), 'archived' => $num('archived'), 'updated' => $num('updated')];
        if ($party = enc_party_clean($e['party'] ?? null)) $row['party'] = $party;
        $out[] = $row;
    }
    return $out;
}

// $have with $in merged in: per id the newer "updated" wins (a tie keeps $have); every encounter of either side stays
function enc_merge(array $have, array $in)
{
    $by = [];
    foreach ($have as $e) $by[$e['id']] = $e;
    foreach ($in as $e) if (!isset($by[$e['id']]) || $e['updated'] > $by[$e['id']]['updated']) $by[$e['id']] = $e;
    return array_values($by);
}

function enc_file($accounts, $sub)
{
    return "$accounts/monster-encounters/$sub.json";
}

function enc_read($accounts, $sub)
{
    $c = is_file(enc_file($accounts, $sub)) ? json_decode((string)file_get_contents(enc_file($accounts, $sub)), true) : null;
    return enc_clean($c['encs'] ?? []);
}

// Unsorted's party, or null
function enc_unsorted_clean($u)
{
    $party = is_array($u) ? enc_party_clean($u['party'] ?? null) : null;
    return $party ? ['party' => $party, 'updated' => is_numeric($u['updated'] ?? null) ? (float)$u['updated'] : 0.0] : null;
}

// what the account holds, as the endpoint sends it: the list, and Unsorted's party once there is one
function enc_body($accounts, $sub)
{
    $c = is_file(enc_file($accounts, $sub)) ? json_decode((string)file_get_contents(enc_file($accounts, $sub)), true) : null;
    $u = enc_unsorted_clean($c['unsorted'] ?? null);
    return ['encs' => enc_clean($c['encs'] ?? [])] + ($u ? ['unsorted' => $u] : []);
}

// merges $in into the account's list under a lock; returns [status, body]
function enc_save($accounts, $sub, $in)
{
    if (!is_array($in) || !is_array($in['encs'] ?? null)) return [400, ['error' => "That isn't an encounter list."]];
    $dir = "$accounts/monster-encounters";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't make the encounters folder."]];
    $lock = fopen("$dir/.lock", 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return [500, ['error' => "Couldn't lock the encounters folder."]];
    $have = enc_body($accounts, $sub);
    $all = ['encs' => enc_merge($have['encs'], enc_clean($in['encs']))] + (isset($have['unsorted']) ? ['unsorted' => $have['unsorted']] : []);
    $u = enc_unsorted_clean($in['unsorted'] ?? null);
    if ($u && $u['updated'] > ($have['unsorted']['updated'] ?? -1)) $all['unsorted'] = $u;
    if ($all !== $have && @file_put_contents(enc_file($accounts, $sub), json_encode($all, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false) {
        flock($lock, LOCK_UN);
        return [500, ['error' => "Couldn't save the encounters."]];
    }
    flock($lock, LOCK_UN);
    return [200, $all];
}
