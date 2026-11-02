<?php
// One folder per character, for signed-in players: <accounts>/characters/<id>/
//   character.json   the sheet's character, exactly as the sheet saves it (art, roll log, view settings, dice)
//   meta.json        {"owner": <google sub>, "visibility": "private" | "public", "created": <unix time>, "campaigns": []}
//   history/<n>.json every saved version; an unchanged save makes no new one
// A deleted character's folder moves to <accounts>/characters/.deleted/<id>-<time>/, nothing is ever unlinked.
// Characters saved before the folders (<accounts>/<sub>/<id>.json) are copied in once per account and left in place.
// Used by sheets/player/cloud.php (the sheet's saves) and characters/index.php (who may open /characters/<id>).
// Every function takes the accounts folder, so the test sheet (accounts/dev) and the test script get their own.

const CH_COUNT = 200; // characters per account

function ch_ok_id($id)
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id);
}

function ch_json($file)
{
    $v = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    return is_array($v) ? $v : null;
}

function ch_meta($accounts, $id)
{
    return ch_ok_id($id) ? ch_json("$accounts/characters/$id/meta.json") : null;
}

// "updated" of a saved character, 0 when there is none
function ch_updated($file)
{
    $c = ch_json($file);
    return $c && isset($c['updated']) && is_numeric($c['updated']) ? (float)$c['updated'] : 0;
}

// one writer at a time across all characters, so owner checks, "newer wins" and writes can't interleave
function ch_lock($accounts)
{
    $dir = "$accounts/characters";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return null;
    $lock = fopen("$dir/.lock", 'c');
    return $lock && flock($lock, LOCK_EX) ? $lock : null;
}

// id => updated, for every character this player owns
// shortcut: reads every meta.json, fine for a few hundred characters; add an owner index file past that
function ch_list($accounts, $sub)
{
    $out = [];
    foreach (glob("$accounts/characters/*/meta.json") ?: [] as $m) {
        $meta = ch_json($m);
        if (($meta['owner'] ?? null) === $sub) $out[basename(dirname($m))] = ch_updated(dirname($m) . '/character.json');
    }
    return $out;
}

// write $json as the character and as a new history version (skipped when it matches the last one)
function ch_write($dir, $json)
{
    if (!is_dir("$dir/history") && !@mkdir("$dir/history", 0750, true) && !is_dir("$dir/history")) return false;
    $last = 0;
    foreach (glob("$dir/history/*.json") ?: [] as $f) $last = max($last, (int)basename($f, '.json'));
    if (!$last || @file_get_contents("$dir/history/$last.json") !== $json) {
        if (@file_put_contents("$dir/history/" . ($last + 1) . '.json', $json) === false) return false;
    }
    return @file_put_contents("$dir/character.json", $json) !== false;
}

function ch_new_meta($dir, $sub, $created)
{
    $meta = ['owner' => $sub, 'visibility' => 'private', 'created' => (int)$created, 'campaigns' => []];
    return @file_put_contents("$dir/meta.json", json_encode($meta, JSON_PRETTY_PRINT)) !== false;
}

// once per account: copy <accounts>/<sub>/<id>.json into folders. The old files stay; a ".copied" file marks it done,
// so a character deleted later doesn't come back from its old file.
function ch_copy_in($accounts, $sub)
{
    $old = "$accounts/$sub";
    if (!is_dir($old) || is_file("$old/.copied")) return;
    foreach (glob("$old/*.json") ?: [] as $f) {
        $id = basename($f, '.json');
        $dir = "$accounts/characters/$id";
        if (!ch_ok_id($id) || is_dir($dir)) continue; // an id someone else already has keeps its old file only
        $json = (string)file_get_contents($f);
        if (!@mkdir($dir, 0750, true) || !ch_new_meta($dir, $sub, filemtime($f)) || !ch_write($dir, $json)) return; // try again next time
    }
    @touch("$old/.copied");
}

// the sheet's save: [http code, response]
function ch_save($accounts, $sub, $body)
{
    $c = json_decode($body, true);
    if (!is_array($c) || !isset($c['abilities']) || !is_array($c['abilities']) || !ch_ok_id($c['id'] ?? null) || !is_numeric($c['updated'] ?? null)) {
        return [400, ['error' => "That isn't a character from the sheet."]];
    }
    $dir = "$accounts/characters/{$c['id']}";
    $meta = ch_json("$dir/meta.json");
    if ($meta && ($meta['owner'] ?? null) !== $sub) return [409, ['taken' => true]];
    if (!$meta) {
        if (count(ch_list($accounts, $sub)) >= CH_COUNT) return [507, ['error' => 'Your account is full. Delete some characters first.']];
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't make the character's folder."]];
        if (!ch_new_meta($dir, $sub, time())) return [500, ['error' => "Couldn't save the character."]];
    }
    $have = ch_updated("$dir/character.json");
    if ($have > (float)$c['updated']) return [409, ['updated' => $have]];
    return ch_write($dir, $body) ? [200, ['updated' => (float)$c['updated']]] : [500, ['error' => "Couldn't save the character."]];
}

function ch_set_visibility($accounts, $sub, $id, $vis)
{
    $meta = ch_meta($accounts, $id);
    if (!$meta || ($meta['owner'] ?? null) !== $sub) return [404, ['error' => 'No such character.']];
    if (!in_array($vis, ['private', 'public'], true)) return [400, ['error' => 'Visibility is private or public.']];
    $meta['visibility'] = $vis;
    return @file_put_contents("$accounts/characters/$id/meta.json", json_encode($meta, JSON_PRETTY_PRINT)) !== false
        ? [200, ['visibility' => $vis]] : [500, ['error' => "Couldn't save the setting."]];
}

// deleting moves the folder aside, so a mistake can still be undone by the site owner
function ch_delete($accounts, $sub, $id)
{
    $meta = ch_meta($accounts, $id);
    if (!$meta) return [200, ['deleted' => true]];
    if (($meta['owner'] ?? null) !== $sub) return [404, ['error' => 'No such character.']];
    $gone = "$accounts/characters/.deleted";
    if (!is_dir($gone) && !@mkdir($gone, 0750, true) && !is_dir($gone)) return [500, ['error' => "Couldn't delete the character."]];
    return @rename("$accounts/characters/$id", "$gone/$id-" . time()) ? [200, ['deleted' => true]] : [500, ['error' => "Couldn't delete the character."]];
}
