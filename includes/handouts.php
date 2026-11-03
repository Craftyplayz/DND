<?php
// DM notes and handouts (ROADMAP 3.4), kept inside each campaign's folder <accounts>/campaigns/<id>/, so deleting the
// campaign moves them to campaigns/.deleted/ with it:
//   notes/<note id>.json               a DM note {id, title, group, body, pinned, archived, created, updated}
//   notes/history/<note id>/<n>.json   every save of it
//   handouts/<id>.json                 {id, title, text, images: [{id, ext, name}], to, table, archived, created, updated,
//                                       sent, edited}. to: null (a draft), "everyone" (every member, later joiners too)
//                                       or [sub, ...]. table: "Show on the Table view" (1.7). edited: last change while sent.
//   handouts/<id>/<image id>.<ext>     its pictures, as uploaded; handouts/history/<id>/<n>.json every save of it
//   handouts/seen/<sub>.json           {handout id: ms}: when this player last opened each (the New and Updated marks)
//   handouts/.incoming/<upload id>     a picture on its way in, 4 MB at a time
// Notes and drafts are the DM's and co-DMs' alone (cp_is_dm). ho_sees() alone decides who may see a handout, for its JSON,
// its pictures and the relay; ho_table() is what the Table view may show. Nothing is deleted: notes and handouts are archived,
// and a picture taken off a handout stays in its folder.
// Every function takes the accounts folder, so _dev/scripts/handouts.test.php gets its own.
require_once __DIR__ . '/campaigns.php';
require_once __DIR__ . '/live.php';

const HO_TYPES = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'];
const HO_CHUNK = 4 * 1024 * 1024; // the host's proxy turns away requests near 8 MB, so pictures come in pieces

function ho_ok_id($id)
{
    return is_string($id) && preg_match('/^[a-z0-9]{8,16}$/', $id);
}

function ho_dir($accounts, $cid)
{
    return "$accounts/campaigns/$cid/handouts";
}

// write through a temp file, then keep a copy in history/<id>/<n>.json
function ho_write($dir, $id, $data)
{
    $hist = "$dir/history/$id";
    if (!is_dir($hist) && !@mkdir($hist, 0750, true) && !is_dir($hist)) return false;
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $tmp = "$dir/.$id.json." . getmypid();
    if (@file_put_contents($tmp, $json) === false || !@rename($tmp, "$dir/$id.json")) return false;
    return @file_put_contents("$hist/" . (count(glob("$hist/*.json") ?: []) + 1) . '.json', $json) !== false;
}

// one writer at a time per campaign, for notes, handouts and uploads
function ho_lock($accounts, $cid)
{
    $lock = cp_ok_id($cid) && is_dir("$accounts/campaigns/$cid") ? fopen("$accounts/campaigns/$cid/.handouts.lock", 'c') : null;
    return $lock && flock($lock, LOCK_EX) ? $lock : null;
}

// ---- DM notes ----

function no_all($accounts, $cid)
{
    $out = [];
    foreach (glob("$accounts/campaigns/$cid/notes/*.json") ?: [] as $f) if ($n = ch_json($f)) $out[] = $n;
    return $out;
}

// a note from the DM's page: kept unless the stored copy is newer (409 with it); the same text again makes no history
function no_save($accounts, $c, $sub, $n)
{
    if (!cp_is_dm($c, $sub)) return [403, ['error' => 'Only the DM can do that.']];
    if (!is_array($n) || !ho_ok_id($n['id'] ?? null) || !is_numeric($n['updated'] ?? null)) return [400, ['error' => "That isn't a note."]];
    $dir = "$accounts/campaigns/{$c['id']}/notes";
    $old = ch_json("$dir/{$n['id']}.json");
    if ($old && $old['updated'] > $n['updated']) return [409, ['note' => $old]];
    $n = ['id' => $n['id'], 'title' => (string)($n['title'] ?? ''), 'group' => (string)($n['group'] ?? ''), 'body' => (string)($n['body'] ?? ''),
        'pinned' => !empty($n['pinned']), 'archived' => is_numeric($n['archived'] ?? null) ? +$n['archived'] : 0,
        'created' => is_numeric($n['created'] ?? null) ? +$n['created'] : +$n['updated'], 'updated' => +$n['updated']];
    if ($old == $n) return [200, ['note' => $n]];
    return ho_write($dir, $n['id'], $n) ? [200, ['note' => $n]] : [500, ['error' => "Couldn't save the note."]];
}

// ---- handouts ----

function ho_get($accounts, $cid, $id)
{
    return ho_ok_id($id) ? ch_json(ho_dir($accounts, $cid) . "/$id.json") : null;
}

function ho_all($accounts, $cid)
{
    $out = [];
    foreach (glob(ho_dir($accounts, $cid) . '/*.json') ?: [] as $f) if ($h = ch_json($f)) $out[] = $h;
    return $out;
}

// may this member see the handout? The DM and co-DMs see every one, drafts too; a player only a sent, unarchived one sent
// to them or to everyone, and only while they're in the campaign
function ho_sees($c, $sub, $h)
{
    if (cp_member($c, $sub) < 0) return false;
    if (cp_is_dm($c, $sub)) return true;
    $to = $h['to'] ?? null;
    return empty($h['archived']) && ($to === 'everyone' || (is_array($to) && in_array($sub, $to, true)));
}

// what the Table view may show (1.7): only a handout with its switch on that went to everyone, so one sent to some players
// never reaches the shared screen
function ho_table($accounts, $c)
{
    return array_values(array_filter(ho_all($accounts, $c['id']), fn($h) => !empty($h['table']) && empty($h['archived']) && ($h['to'] ?? null) === 'everyone'));
}

// the players (not the DM or co-DMs) who see it: their live keys get its messages
function ho_keys($c, $h)
{
    $out = [];
    foreach ($c['members'] as $m) if (!cp_is_dm($c, $m['sub']) && ho_sees($c, $m['sub'], $h)) $out[] = live_key($c['id'], $m['sub']);
    return $out;
}

function ho_seen_file($accounts, $cid, $sub)
{
    return ho_dir($accounts, $cid) . '/seen/' . preg_replace('/[^\w-]/', '_', $sub) . '.json';
}

// a handout as this member gets it; a player gets no recipients, switches or archive state
function ho_view($c, $sub, $h, $seen)
{
    $q = 'c=' . rawurlencode($c['id']) . '&h=' . rawurlencode($h['id']) . '&img=';
    $imgs = array_map(fn($i) => ['id' => $i['id'], 'name' => $i['name'], 'url' => '/campaigns/handouts.php?' . $q . rawurlencode($i['id'])], $h['images'] ?? []);
    $at = $seen[$h['id']] ?? 0;
    $out = ['id' => $h['id'], 'title' => $h['title'], 'text' => $h['text'], 'images' => $imgs, 'sent' => $h['sent'] ?? 0, 'edited' => $h['edited'] ?? 0,
        'new' => !$at, 'updated' => $at && ($h['edited'] ?? 0) > $at];
    if (!cp_is_dm($c, $sub)) return $out;
    return $out + ['to' => $h['to'] ?? null, 'table' => !empty($h['table']), 'archived' => $h['archived'] ?? 0, 'created' => $h['created'] ?? 0, 'updated' => $h['updated'] ?? 0];
}

// every handout this member may see, newest first (sent time for players, last change for the DM)
function ho_list($accounts, $c, $sub)
{
    $seen = ch_json(ho_seen_file($accounts, $c['id'], $sub)) ?: [];
    $dm = cp_is_dm($c, $sub);
    $list = array_map(fn($h) => ho_view($c, $sub, $h, $seen), array_values(array_filter(ho_all($accounts, $c['id']), fn($h) => ho_sees($c, $sub, $h))));
    usort($list, fn($a, $b) => $dm ? $b['updated'] <=> $a['updated'] : $b['sent'] <=> $a['sent']);
    return $list;
}

// the picture file a member may see, or null
function ho_image($accounts, $c, $sub, $hid, $img)
{
    $h = ho_get($accounts, $c['id'], $hid);
    if (!$h || !ho_sees($c, $sub, $h)) return null;
    foreach ($h['images'] ?? [] as $i) if ($i['id'] === $img) {
        $f = ho_dir($accounts, $c['id']) . "/$hid/{$i['id']}.{$i['ext']}";
        return is_file($f) ? $f : null;
    }
    return null;
}

// what a file is from its first bytes (never from its name or the type the browser sent)
function ho_magic($file)
{
    $f = @fopen($file, 'rb');
    $b = $f ? (string)fread($f, 12) : '';
    if ($f) fclose($f);
    if (str_starts_with($b, "\xFF\xD8\xFF")) return 'jpg';
    if (str_starts_with($b, "\x89PNG\r\n\x1A\n")) return 'png';
    if (str_starts_with($b, 'GIF87a') || str_starts_with($b, 'GIF89a')) return 'gif';
    if (str_starts_with($b, 'RIFF') && substr($b, 8, 4) === 'WEBP') return 'webp';
    return null;
}

// one piece of a picture: it goes on the end only when $at is how much has arrived, so a piece sent twice or out of order
// is turned away with the size so far ("size"), and the page carries on from there
function ho_chunk($accounts, $c, $sub, $up, $at, $bytes)
{
    if (!cp_is_dm($c, $sub)) return [403, ['error' => 'Only the DM can do that.']];
    if (!is_string($up) || !preg_match('/^[a-f0-9]{16}$/', $up)) return [400, ['error' => 'Bad upload id.']];
    if (strlen($bytes) > HO_CHUNK) return [413, ['error' => 'Send pictures 4 MB at a time.']];
    $dir = ho_dir($accounts, $c['id']) . '/.incoming';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't save the picture."]];
    $f = "$dir/$up";
    clearstatcache();
    $size = is_file($f) ? filesize($f) : 0;
    if ((string)$at !== (string)$size) return [409, ['size' => $size]];
    if (@file_put_contents($f, $bytes, FILE_APPEND) === false) return [500, ['error' => "Couldn't save the picture. The server may be out of space."]];
    return [200, ['size' => $size + strlen($bytes)]];
}

function ho_clean_title($t)
{
    return mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$t)), 0, 200);
}

// players the handout goes to: "everyone", or the members picked (the DM and co-DMs see it anyway)
function ho_clean_to($c, $to)
{
    if ($to === 'everyone') return 'everyone';
    if (!is_array($to)) return null;
    $subs = array_values(array_unique(array_filter($to, fn($s) => is_string($s) && cp_member($c, $s) >= 0 && !cp_is_dm($c, $s))));
    return $subs ?: null;
}

// One change from campaigns/handouts.php: [http code, response, messages for the relay [[msg, to], ...]].
// The caller holds ho_lock(). Only "open" is for players; everything else is the DM's or a co-DM's.
function ho_act($accounts, $c, $sub, $body)
{
    $act = $body['act'] ?? '';
    $dir = ho_dir($accounts, $c['id']);
    $id = $body['id'] ?? ($body['handout']['id'] ?? null);
    $h = ho_get($accounts, $c['id'], $id);
    $msg = fn($type) => ['type' => $type, 'id' => $id];
    // the DM's other pages hear about every change; players only about what they see
    $live = fn($before, $after) => array_values(array_filter([[$msg('handout'), 'dm'],
        ($k = ho_keys($c, $after)) ? [$msg('handout'), $k] : null,
        ($g = array_values(array_diff($before ? ho_keys($c, $before) : [], $k))) ? [$msg('handout-gone'), $g] : null]));
    $view = fn($h) => ho_view($c, $sub, $h, ch_json(ho_seen_file($accounts, $c['id'], $sub)) ?: []);

    if ($act === 'open') {
        if (!$h || !ho_sees($c, $sub, $h)) return [404, ['error' => 'No such handout.']];
        $file = ho_seen_file($accounts, $c['id'], $sub);
        if (!is_dir(dirname($file)) && !@mkdir(dirname($file), 0750, true) && !is_dir(dirname($file))) return [500, ['error' => "Couldn't save that."]];
        $seen = ch_json($file) ?: [];
        $seen[$h['id']] = (int)round(microtime(true) * 1000);
        return @file_put_contents($file, json_encode($seen)) !== false ? [200, ['opened' => true], []] : [500, ['error' => "Couldn't save that."]];
    }
    if (!cp_is_dm($c, $sub)) return [403, ['error' => 'Only the DM can do that.']];
    $now = (int)round(microtime(true) * 1000);
    $save = function ($new, $before) use ($dir, $id, $view, $live) {
        return ho_write($dir, $id, $new) ? [200, ['handout' => $view($new)], $live($before, $new)] : [500, ['error' => "Couldn't save the handout."]];
    };

    // {handout: {id, title, text, table, updated}}: a new draft, or a change to one (kept unless the stored copy is newer)
    if ($act === 'save') {
        $in = $body['handout'] ?? null;
        if (!is_array($in) || !ho_ok_id($id) || !is_numeric($in['updated'] ?? null)) return [400, ['error' => "That isn't a handout."]];
        if ($h && $h['updated'] > $in['updated']) return [409, ['handout' => $view($h)]];
        $new = ($h ?: ['id' => $id, 'title' => '', 'text' => '', 'images' => [], 'to' => null, 'table' => false, 'archived' => 0, 'created' => $now, 'sent' => 0, 'edited' => 0]);
        $new = array_merge($new, ['title' => ho_clean_title($in['title'] ?? ''), 'text' => str_replace("\r\n", "\n", (string)($in['text'] ?? '')), 'table' => !empty($in['table']), 'updated' => +$in['updated']]);
        if ($h && [$h['title'], $h['text'], $h['table']] === [$new['title'], $new['text'], $new['table']]) return [200, ['handout' => $view($h)], []];
        if ($h && $h['to'] !== null && [$h['title'], $h['text']] !== [$new['title'], $new['text']]) $new['edited'] = $now;
        return $save($new, $h);
    }
    if (!$h) return [404, ['error' => 'No such handout.']];
    // {to: "everyone" | [sub, ...]}: send a draft, or change who a sent one goes to (the added get it live, the removed lose it)
    if ($act === 'send') {
        if (!empty($h['archived'])) return [400, ['error' => 'Restore the handout first.']];
        $to = ho_clean_to($c, $body['to'] ?? null);
        if ($to === null) return [400, ['error' => 'Pick who gets the handout.']];
        return $save(array_merge($h, ['to' => $to, 'sent' => $h['to'] === null ? $now : $h['sent'], 'updated' => max($now, $h['updated'] + 1)]), $h);
    }
    // back to a draft: it goes from the players' pages
    if ($act === 'unshare') return $save(array_merge($h, ['to' => null, 'updated' => max($now, $h['updated'] + 1)]), $h);
    // archived, it's a draft again for when it's restored
    if ($act === 'archive') return $save(array_merge($h, ['archived' => $now, 'to' => null, 'updated' => max($now, $h['updated'] + 1)]), $h);
    if ($act === 'restore') return $save(array_merge($h, ['archived' => 0, 'updated' => max($now, $h['updated'] + 1)]), $h);
    // {up, name}: a finished upload becomes one of its pictures, if its first bytes say it's a jpg, png, webp or gif
    if ($act === 'image') {
        $up = (string)($body['up'] ?? '');
        $f = "$dir/.incoming/$up";
        if (!preg_match('/^[a-f0-9]{16}$/', $up) || !is_file($f)) return [404, ['error' => "The picture didn't arrive. Add it again."]];
        $ext = ho_magic($f);
        if (!$ext) return [415, ['error' => 'That file isn\'t a JPG, PNG, WebP or GIF picture.']];
        if (!is_dir("$dir/$id") && !@mkdir("$dir/$id", 0750, true) && !is_dir("$dir/$id")) return [500, ['error' => "Couldn't save the picture."]];
        $img = bin2hex(random_bytes(6));
        if (!@rename($f, "$dir/$id/$img.$ext")) return [500, ['error' => "Couldn't save the picture."]];
        $new = $h;
        $new['images'][] = ['id' => $img, 'ext' => $ext, 'name' => mb_substr(trim((string)($body['name'] ?? '')), 0, 200) ?: "picture.$ext"];
        $new['updated'] = max($now, $h['updated'] + 1);
        if ($h['to'] !== null) $new['edited'] = $now;
        return $save($new, $h);
    }
    // {img}: a picture comes off the handout; its file stays where it is
    if ($act === 'unimage') {
        $new = $h;
        $new['images'] = array_values(array_filter($h['images'], fn($i) => $i['id'] !== ($body['img'] ?? '')));
        if (count($new['images']) === count($h['images'])) return [404, ['error' => 'No such picture.']];
        $new['updated'] = max($now, $h['updated'] + 1);
        if ($h['to'] !== null) $new['edited'] = $now;
        return $save($new, $h);
    }
    return [400, ['error' => 'Unknown action.']];
}
