<?php
// One folder per character, for signed-in players: <accounts>/characters/<id>/
//   character.json   the sheet's character, exactly as the sheet saves it (art, roll log, view settings, dice)
//   meta.json        {"owner": <google sub>, "visibility": "private" | "public", "created": <unix time>, "campaigns": []}
//   history/<n>.json every saved version; a save that changes only the roll log or view settings makes no new one
//   history/names.json    {"<n>": "Before session 12"}, the names players give versions (ROADMAP 0.5); version files never change
//   history/restored.json {"<n>": {"from": <the version it was restored from>, "at": <that version's "updated">}}
//   history/dm.json       {"<n>": true}: versions that brought in DM edits (ROADMAP 1.5)
// Players archive characters (an "archived" time on the character, copied into meta.json); nothing is deleted. Folders that
// an older version of the site deleted sit in <accounts>/characters/.deleted/<id>-<time>/, for the admin only.
// Characters saved before the folders (<accounts>/<sub>/<id>.json) are copied in once per account and left in place.
// Used by sheets/player/cloud.php (the sheet's saves) and characters/index.php (who may open /characters/<id>).
// Every function takes the accounts folder, so the test sheet (accounts/dev) and the test script get their own.

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

// what makes a version: everything but the save stamps, the roll log, view settings, worked-out numbers, applied DM edit ids and
// which note or tab is open
function ch_plain($c, $top = true)
{
    if (!is_array($c)) return $c;
    foreach (['updated', 'open', 'sub'] as $k) unset($c[$k]);
    if ($top) unset($c['rolls'], $c['view'], $c['calc'], $c['dmApplied'], $c['campRules']); // calc: the sheet's worked-out numbers; dmApplied: DM edit ids (1.5); campRules: a copy of its campaign's rules (4.4)
    foreach ($c as $k => $v) if (is_array($v)) $c[$k] = ch_plain($v, false);
    return $c;
}

// version numbers in history/, oldest first
function ch_versions_in($dir)
{
    $ns = [];
    foreach (glob("$dir/history/*.json") ?: [] as $f) if (preg_match('/^\d+$/', $n = basename($f, '.json'))) $ns[] = (int)$n;
    sort($ns);
    return $ns;
}

// write $json as the character and as a new history version, unless it matches the last version apart from the roll log,
// view settings and save stamps. $n gets the new version's number, or 0 when none was made.
function ch_write($dir, $json, &$n = null)
{
    $n = 0;
    if (!is_dir("$dir/history") && !@mkdir("$dir/history", 0750, true) && !is_dir("$dir/history")) return false;
    $ns = ch_versions_in($dir);
    $last = $ns ? end($ns) : 0;
    $prev = $last ? @file_get_contents("$dir/history/$last.json") : false;
    // a character the builder is still making (ROADMAP 4.2, "draft") makes no versions; its first one is made at Finish
    $draft = !empty((json_decode($json, true) ?: [])['draft']);
    if (!$draft && ($prev === false || ($prev !== $json && ch_plain(json_decode($prev, true)) !== ch_plain(json_decode($json, true))))) {
        if (@file_put_contents("$dir/history/" . ($last + 1) . '.json', $json) === false) return false;
        $n = $last + 1;
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

// the sheet's save: [http code, response]. $n gets the new version's number (0: none).
function ch_save($accounts, $sub, $body, &$n = null)
{
    $n = 0;
    $c = json_decode($body, true);
    if (!is_array($c) || !isset($c['abilities']) || !is_array($c['abilities']) || !ch_ok_id($c['id'] ?? null) || !is_numeric($c['updated'] ?? null)) {
        return [400, ['error' => "That isn't a character from the sheet."]];
    }
    $dir = "$accounts/characters/{$c['id']}";
    $meta = ch_json("$dir/meta.json");
    if ($meta && ($meta['owner'] ?? null) !== $sub) return [409, ['taken' => true]];
    if (!$meta) {
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't make the character's folder."]];
        if (!ch_new_meta($dir, $sub, time())) return [500, ['error' => "Couldn't save the character."]];
        $meta = ch_json("$dir/meta.json");
    }
    $have = ch_updated("$dir/character.json");
    if ($have > (float)$c['updated']) return [409, ['updated' => $have]];
    if (!ch_write($dir, $body, $n)) return [500, ['error' => "Couldn't save the character."]];
    // campaigns read the archived flag from meta.json (the character's own field is the one that syncs)
    $arch = is_numeric($c['archived'] ?? null) ? (float)$c['archived'] : 0;
    if ((float)($meta['archived'] ?? 0) !== $arch) {
        $meta['archived'] = $arch;
        @file_put_contents("$dir/meta.json", json_encode($meta, JSON_PRETTY_PRINT));
    }
    return [200, ['updated' => (float)$c['updated']]];
}

// is this character archived? (meta.json's copy of the character's own flag)
function ch_archived($meta)
{
    return (float)($meta['archived'] ?? 0) > 0;
}

// the old DELETE: archives instead (players can't delete characters). Nothing moves; the character gets "archived".
function ch_archive_now($accounts, $sub, $id)
{
    $meta = ch_meta($accounts, $id);
    if (!$meta) return [200, ['archived' => true]];
    if (($meta['owner'] ?? null) !== $sub) return [404, ['error' => 'No such character.']];
    $c = ch_json("$accounts/characters/$id/character.json");
    if (!$c) return [500, ['error' => "Couldn't archive the character."]];
    if (!empty($c['archived'])) return [200, ['archived' => true]];
    $now = round(microtime(true) * 1000);
    $c['archived'] = $now;
    $c['updated'] = max($now, (float)($c['updated'] ?? 0) + 1);
    $r = ch_save($accounts, $sub, json_encode($c));
    return $r[0] === 200 ? [200, ['archived' => true, 'updated' => $c['updated']]] : $r;
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

// ---- portraits (ROADMAP 0.4): <accounts>/characters/<id>/art.<ext>, served by sheets/player/art.php ----
// The character keeps only the picture's address (artUrl). A replaced picture moves to history/art-<n>.<ext>.
const CH_ART_TYPES = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'];

// what the bytes really are (never what the upload says), or null
function ch_art_kind($bytes)
{
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) return 'jpg';
    if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) return 'png';
    if (substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') return 'webp';
    if (strncmp($bytes, 'GIF8', 4) === 0) return 'gif';
    return null;
}

function ch_art_file($accounts, $id)
{
    if (!ch_ok_id($id)) return null;
    foreach (array_keys(CH_ART_TYPES) as $ext) if (is_file($f = "$accounts/characters/$id/art.$ext")) return $f;
    return null;
}

// the address a character keeps; v changes with the picture, so browsers can cache each one for good
function ch_art_url($id, $file)
{
    return '/sheets/player/art.php?id=' . rawurlencode($id) . '&v=' . substr(sha1_file($file), 0, 12);
}

// the owner's upload: [http code, response]. The caller holds ch_lock().
function ch_art_save($accounts, $sub, $id, $bytes)
{
    $meta = ch_meta($accounts, $id);
    if (!$meta) return [404, ['error' => 'Save the character to your account first.']];
    if (($meta['owner'] ?? null) !== $sub) return [404, ['error' => 'No such character.']];
    $ext = ch_art_kind($bytes);
    if (!$ext) return [415, ['error' => 'Send a JPEG, PNG, WebP or GIF picture.']];
    $dir = "$accounts/characters/$id";
    if ($old = ch_art_file($accounts, $id)) {
        if (@file_get_contents($old) === $bytes) return [200, ['url' => ch_art_url($id, $old)]];
        if (!is_dir("$dir/history") && !@mkdir("$dir/history", 0750, true) && !is_dir("$dir/history")) return [500, ['error' => "Couldn't save the picture."]];
        $n = 0;
        foreach (glob("$dir/history/art-*") ?: [] as $f) $n = max($n, (int)preg_replace('/^art-(\d+).*$/', '$1', basename($f)));
        if (!@rename($old, "$dir/history/art-" . ($n + 1) . '.' . pathinfo($old, PATHINFO_EXTENSION))) return [500, ['error' => "Couldn't save the picture."]];
    }
    $tmp = "$dir/.art." . getmypid();
    if (@file_put_contents($tmp, $bytes) === false || !@rename($tmp, "$dir/art.$ext")) return [500, ['error' => "Couldn't save the picture."]];
    return [200, ['url' => ch_art_url($id, "$dir/art.$ext")]];
}

// ---- version history (ROADMAP 0.5): every saved version in history/<n>.json, listed newest first, names and restores beside them ----

function ch_owned_dir($accounts, $sub, $id)
{
    $meta = ch_meta($accounts, $id);
    return $meta && ($meta['owner'] ?? null) === $sub ? "$accounts/characters/$id" : null;
}

// {"<n>": ...} sidecar files in history/
function ch_side($dir, $name)
{
    return ch_json("$dir/history/$name.json") ?? [];
}
function ch_side_put($dir, $name, $data)
{
    $tmp = "$dir/history/.$name." . getmypid();
    return @file_put_contents($tmp, json_encode((object)$data, JSON_PRETTY_PRINT)) !== false && @rename($tmp, "$dir/history/$name.json");
}

// up to $limit versions older than $before (0 = from the newest), newest first, plus one more so the oldest can be compared.
// Inline art is sent as a short hash: the list only needs to know a portrait changed.
function ch_versions($accounts, $sub, $id, $before, $limit)
{
    $dir = ch_owned_dir($accounts, $sub, $id);
    if (!$dir) return [404, ['error' => 'No such character.']];
    $ns = array_reverse(array_values(array_filter(ch_versions_in($dir), fn($n) => !$before || $n < $before)));
    $out = [];
    foreach (array_slice($ns, 0, $limit + 1) as $n) {
        $c = ch_json("$dir/history/$n.json");
        if (!$c) continue;
        if (is_string($c['art'] ?? null) && str_starts_with($c['art'], 'data:')) $c['art'] = 'sha:' . substr(sha1($c['art']), 0, 12);
        $out[] = ['n' => $n, 'c' => $c];
    }
    return [200, ['versions' => $out, 'more' => count($ns) > $limit + 1, 'names' => (object)ch_side($dir, 'names'), 'restored' => (object)ch_side($dir, 'restored'), 'dm' => (object)ch_side($dir, 'dm')]];
}

// one version, exactly as it was saved
function ch_version($accounts, $sub, $id, $n)
{
    $dir = ch_owned_dir($accounts, $sub, $id);
    $f = $dir && preg_match('/^\d+$/', (string)$n) ? "$dir/history/$n.json" : '';
    return $f && is_file($f) ? [200, (string)file_get_contents($f)] : [404, ['error' => 'No such version.']];
}

const CH_NAME = 80; // characters in a version's name

// name a version, or clear its name with ''
function ch_name_version($accounts, $sub, $id, $n, $name)
{
    $dir = ch_owned_dir($accounts, $sub, $id);
    if (!$dir || !preg_match('/^\d+$/', (string)$n) || !is_file("$dir/history/$n.json")) return [404, ['error' => 'No such version.']];
    $name = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$name)), 0, CH_NAME);
    $names = ch_side($dir, 'names');
    if ($name === '') unset($names[$n]); else $names[$n] = $name;
    return ch_side_put($dir, 'names', $names) ? [200, ['name' => $name]] : [500, ['error' => "Couldn't save the name."]];
}

// Restore version $n: $body is that version as the sheet will keep it (with today's roll log, view settings and archived
// flag, and a fresh "updated"). It's saved like any edit, so it becomes a new version and the old ones stay. A portrait the
// version had that was replaced since comes back from history/ (the current one moves there). "before" is the version Undo
// goes back to. The caller holds ch_lock().
function ch_restore($accounts, $sub, $id, $n, $body)
{
    $dir = ch_owned_dir($accounts, $sub, $id);
    if (!$dir || !preg_match('/^\d+$/', (string)$n) || !is_file("$dir/history/$n.json")) return [404, ['error' => 'No such version.']];
    $c = json_decode($body, true);
    if (!is_array($c) || ($c['id'] ?? null) !== $id) return [400, ['error' => "That isn't this character."]];
    $ns = ch_versions_in($dir);
    $before = $ns ? end($ns) : 0;
    if (preg_match('/[?&]v=([a-f0-9]{12})$/', (string)($c['artUrl'] ?? ''), $m)) {
        $cur = ch_art_file($accounts, $id);
        if (!$cur || substr(sha1_file($cur), 0, 12) !== $m[1]) {
            foreach (glob("$dir/history/art-*") ?: [] as $f) {
                if (substr(sha1_file($f), 0, 12) !== $m[1]) continue;
                ch_art_save($accounts, $sub, $id, (string)file_get_contents($f));
                break;
            }
        }
    }
    $r = ch_save($accounts, $sub, $body, $new);
    if ($r[0] !== 200) return $r;
    if ($new) { $res = ch_side($dir, 'restored'); $res[$new] = ['from' => (int)$n, 'at' => ch_updated("$dir/history/$n.json")]; ch_side_put($dir, 'restored', $res); }
    return [200, $r[1] + ['before' => $before, 'version' => $new]];
}
