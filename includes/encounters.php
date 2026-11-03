<?php
// Named encounters on the Monster Sheet (ROADMAP 3.1). Each account's list is one file,
//   private/dnd/accounts/monster-encounters/<google sub>.json  ->  {"encs": [{"id", "name", "order", "archived", "updated"}, ...]}
// kept apart from accounts/monsters/<sub>/ so it can never be taken for a monster. A monster names its encounter in its own "enc".
// Lists merge per encounter: the newer "updated" wins (name, order, archived), and an encounter either side has is never dropped.

// monster ids (sheets/monster/cloud.php): never starting with "_", the prefix kept for the sheet's own files
function mon_id_ok($id)
{
    return is_string($id) && preg_match('/^[A-Za-z0-9-][A-Za-z0-9_-]{0,63}$/', $id) === 1;
}

// the well-formed encounters of a list, in the saved shape; anything else is left out
function enc_clean($list)
{
    $out = [];
    foreach (is_array($list) ? $list : [] as $e) {
        if (!is_array($e) || !is_string($e['id'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $e['id'])) continue;
        $num = fn($k) => is_numeric($e[$k] ?? null) ? (float)$e[$k] : 0.0;
        $out[] = ['id' => $e['id'], 'name' => (is_string($e['name'] ?? null) ? $e['name'] : ''), 'order' => $num('order'), 'archived' => $num('archived'), 'updated' => $num('updated')];
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

// merges $in into the account's list under a lock; returns [status, body]
function enc_save($accounts, $sub, $in)
{
    if (!is_array($in) || !is_array($in['encs'] ?? null)) return [400, ['error' => "That isn't an encounter list."]];
    $dir = "$accounts/monster-encounters";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't make the encounters folder."]];
    $lock = fopen("$dir/.lock", 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return [500, ['error' => "Couldn't lock the encounters folder."]];
    $have = enc_read($accounts, $sub);
    $all = enc_merge($have, enc_clean($in['encs']));
    if ($all !== $have && @file_put_contents(enc_file($accounts, $sub), json_encode(['encs' => $all], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false) {
        flock($lock, LOCK_UN);
        return [500, ['error' => "Couldn't save the encounters."]];
    }
    flock($lock, LOCK_UN);
    return [200, ['encs' => $all]];
}
