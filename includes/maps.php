<?php
// Battle maps with fog of war (ROADMAP 1.6). A campaign's maps are a plain named list:
//   <accounts>/campaigns/<id>/maps/table.json        {"active": <map id> | null}: the map on the table, which players see
//   <accounts>/campaigns/<id>/maps/<map id>/
//     original.<jpg|png|webp|gif>   the upload, exactly as it came (the DM and co-DMs only)
//     work.webp                     a working copy, longest side MP_WORK px, unmasked (the DM's view; masked copies come from it)
//     thumb.webp                    for the DM's map list
//     public-<n>.webp               what players get for the n-th "Send to table": every fogged square solid black. All kept.
//     map.json                      {"id", "name", "created", "by", "archived" (ms or 0), "ext", "w", "h" (original px),
//                                    "grid": {"s", "ox", "oy"} (square size and offset, original px), "draft": fog,
//                                    "sent": null | {"n", "grid", "fog", "at"}, "tokens": {key: token}}
// A fog is a string with one character per square, row by row: "1" revealed, "0" fogged. Squares cut by the image's edge
// count as squares (mp_cells). A token: {"kind": "pc" | "monster" | "plain", "char" | "mon" + "by" | "name", "size"
// (T S M L H G), "x", "y" (top-left, original px), "placed" (false: in the "Not placed" tray), "hidden" (monsters not in a
// fight; a fight monster's hidden flag is its initiative entry's)}. Token keys are hashes, so no Google or monster id reaches
// players. Nothing here ever touches a character or monster file.
// mp_view() alone decides what each person gets (players: the sent fog only, no hidden or fogged monsters, no original);
// the Table view (1.7) adds its own role there.
require_once __DIR__ . '/initiative.php';
require_once __DIR__ . '/live.php';

const MP_WORK = 2048; // small copies so maps load fast for everyone (owner's choice); the original keeps full detail
const MP_TYPES = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'];
const MP_SIZES = ['T' => 0.5, 'S' => 1, 'M' => 1, 'L' => 2, 'H' => 3, 'G' => 4]; // squares across

function mp_ok_id($id)
{
    return is_string($id) && preg_match('/^[a-f0-9]{12}$/', $id);
}

function mp_root($accounts, $cid)
{
    return "$accounts/campaigns/$cid/maps";
}

function mp_read($accounts, $cid, $mid)
{
    return mp_ok_id($mid) ? ch_json(mp_root($accounts, $cid) . "/$mid/map.json") : null;
}

function mp_put($file, $data)
{
    $tmp = "$file." . getmypid();
    return @file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== false && @rename($tmp, $file);
}

function mp_write($accounts, $cid, $m)
{
    return mp_put(mp_root($accounts, $cid) . "/{$m['id']}/map.json", $m);
}

// one writer at a time per campaign's maps (the fight's cp_lock is taken first when both are needed)
function mp_lock($accounts, $cid)
{
    $dir = mp_root($accounts, $cid);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return null;
    $lock = fopen("$dir/.lock", 'c');
    return $lock && flock($lock, LOCK_EX) ? $lock : null;
}

function mp_list($accounts, $cid)
{
    $out = [];
    foreach (glob(mp_root($accounts, $cid) . '/*/map.json') ?: [] as $f) if ($m = ch_json($f)) $out[] = $m;
    usort($out, fn($a, $b) => $a['created'] <=> $b['created']);
    return $out;
}

function mp_active($accounts, $cid)
{
    $id = ch_json(mp_root($accounts, $cid) . '/table.json')['active'] ?? null;
    $m = $id ? mp_read($accounts, $cid, $id) : null;
    return $m && !$m['archived'] ? $m : null;
}

// the squares of a grid over a w x h image: [x0, y0, columns, rows]; the first square starts at x0, y0 (<= 0)
function mp_cells($g, $w, $h)
{
    $s = $g['s'];
    $x0 = $g['ox'] > 0 ? $g['ox'] - $s : 0;
    $y0 = $g['oy'] > 0 ? $g['oy'] - $s : 0;
    return [$x0, $y0, max(1, (int)ceil(($w - $x0) / $s - 1e-6)), max(1, (int)ceil(($h - $y0) / $s - 1e-6))];
}

function mp_grid($s, $ox, $oy, $w, $h)
{
    if (!is_numeric($s) || !is_numeric($ox) || !is_numeric($oy)) return null;
    $s = round((float)$s, 2);
    if ($s < 8 || $s > max($w, $h)) return null;
    $wrap = fn($o) => round(fmod(fmod((float)$o, $s) + $s, $s), 2);
    return ['s' => $s, 'ox' => $wrap($ox) >= $s ? 0.0 : $wrap($ox), 'oy' => $wrap($oy) >= $s ? 0.0 : $wrap($oy)];
}

function mp_fogged($g, $w, $h)
{
    [, , $cols, $rows] = mp_cells($g, $w, $h);
    return str_repeat('0', $cols * $rows);
}

// "Large Giant", "huge dragon (chromatic)" -> L, H; Medium when the text names no size
function mp_size_of($text)
{
    return preg_match('/\b(tiny|small|medium|large|huge|gargantuan)\b/i', (string)$text, $x) ? strtoupper($x[1][0]) : 'M';
}

// a token's key: the same for the same thing on every map, and no id in it that players shouldn't have
function mp_key($cid, $kind, $ref)
{
    return substr(hash('sha256', "$cid|$kind|$ref"), 0, 12);
}

function mp_entry_key($c, $e)
{
    if ($e['kind'] === 'pc') return mp_key($c['id'], 'pc', $e['char']);
    if ($e['kind'] === 'monster') return mp_key($c['id'], 'monster', ($e['by'] ?? $c['dm']) . ':' . $e['mon']);
    return mp_key($c['id'], 'plain', $e['id']);
}

// ---- images (GD with WebP) ----

// $memory: the one step that holds a full-size picture raises PHP's memory for itself only
function mp_gd($memory = '2048M')
{
    if (!function_exists('imagewebp')) return false;
    @ini_set('memory_limit', $memory);
    return true;
}

// a new map from an uploaded file: [code, map or error]. $file is moved into the map's folder as it is.
function mp_create($accounts, $c, $sub, $name, $file)
{
    $info = @getimagesize($file);
    $ext = $info ? (MP_TYPES[$info[2]] ?? null) : null;
    if (!$ext) return [400, ['error' => "That isn't a JPG, PNG, WebP or GIF picture. Save the map as one of those and upload it again."]];
    if (!mp_gd()) return [500, ['error' => "This server can't make map pictures (PHP's GD with WebP is missing)."]];
    $src = match ($ext) { 'jpg' => @imagecreatefromjpeg($file), 'png' => @imagecreatefrompng($file), 'webp' => @imagecreatefromwebp($file), 'gif' => @imagecreatefromgif($file) };
    if (!$src) return [400, ['error' => "That picture couldn't be read. Save it again as a JPG or PNG and upload that."]];
    imagepalettetotruecolor($src); // a GIF: its first frame, as a still picture
    $w = imagesx($src);
    $h = imagesy($src);
    $k = min(1, MP_WORK / max($w, $h));
    $work = $k < 1 ? imagescale($src, max(1, (int)round($w * $k)), max(1, (int)round($h * $k)), IMG_BICUBIC) : $src;
    do $id = bin2hex(random_bytes(6)); while (is_dir(mp_root($accounts, $c['id']) . "/$id"));
    $dir = mp_root($accounts, $c['id']) . "/$id";
    if (!@mkdir($dir, 0750, true)) return [500, ['error' => "Couldn't save the map."]];
    $thumb = imagescale($work, 320, -1, IMG_BICUBIC);
    $ok = imagewebp($work, "$dir/work.webp", 80) && imagewebp($thumb, "$dir/thumb.webp", 75) && @rename($file, "$dir/original.$ext");
    if (!$ok) return [500, ['error' => "Couldn't save the map."]];
    $grid = mp_grid(max(8, round(min($w, $h) / 10)), 0, 0, $w, $h);
    $m = ['id' => $id, 'name' => cp_clean_name($name) ?? 'Map', 'created' => (int)round(microtime(true) * 1000), 'by' => $sub, 'archived' => 0, 'ext' => $ext,
        'w' => $w, 'h' => $h, 'ww' => imagesx($work), 'wh' => imagesy($work), 'grid' => $grid, 'draft' => mp_fogged($grid, $w, $h), 'sent' => null, 'tokens' => new stdClass()];
    return mp_write($accounts, $c['id'], $m) ? [200, $m] : [500, ['error' => "Couldn't save the map."]];
}

// the players' copy for the sent fog: the working copy with every fogged square painted solid black
function mp_render($accounts, $cid, $m)
{
    $dir = mp_root($accounts, $cid) . "/{$m['id']}";
    if (!mp_gd('1024M') || !($im = @imagecreatefromwebp("$dir/work.webp"))) return false;
    $s = $m['sent'];
    $g = $s['grid'];
    $k = imagesx($im) / $m['w'];
    [$x0, $y0, $cols, $rows] = mp_cells($g, $m['w'], $m['h']);
    $black = imagecolorallocate($im, 0, 0, 0);
    imagealphablending($im, false); // black over transparent parts too
    for ($r = 0; $r < $rows; $r++) {
        // one rectangle per run of fogged squares; edges round outwards, so a fogged square is never left a pixel short
        for ($col = 0; $col < $cols; $col++) {
            if ($s['fog'][$r * $cols + $col] === '1') continue;
            $end = $col;
            while ($end + 1 < $cols && $s['fog'][$r * $cols + $end + 1] !== '1') $end++;
            imagefilledrectangle($im, (int)floor(($x0 + $col * $g['s']) * $k), (int)floor(($y0 + $r * $g['s']) * $k),
                (int)ceil(($x0 + ($end + 1) * $g['s']) * $k), (int)ceil(($y0 + ($r + 1) * $g['s']) * $k), $black);
            $col = $end;
        }
    }
    $tmp = "$dir/.public-{$s['n']}.webp." . getmypid();
    return imagewebp($im, $tmp, 75) && @rename($tmp, "$dir/public-{$s['n']}.webp");
}

// ---- tokens ----

// every token on map $m with what each viewer may get, in a fixed order: the party, then the rest as stored
function mp_tokens($accounts, $c, $m, $f)
{
    $party = fi_party($c);
    $toks = (array)($m['tokens'] ?? []);
    foreach ($party as $char => $owner) {
        $k = mp_key($c['id'], 'pc', $char);
        $toks[$k] ??= ['kind' => 'pc', 'char' => $char, 'size' => 'M', 'x' => null, 'y' => null, 'placed' => false];
    }
    $entries = [];
    foreach ($f['entries'] ?? [] as $e) $entries[mp_entry_key($c, $e)] = $e;
    $out = [];
    foreach ($toks as $k => $t) {
        if ($t['kind'] === 'pc' && !isset($party[$t['char']])) continue; // left the campaign
        $e = $entries[$k] ?? null;
        $o = ['k' => (string)$k, 'kind' => $t['kind'], 'size' => $t['size'] ?? 'M', 'x' => $t['x'] ?? null, 'y' => $t['y'] ?? null, 'placed' => !empty($t['placed']) && isset($t['x']),
            'fight' => $e ? $e['id'] : null, 'turn' => $e && $f['phase'] === 'running' && $f['turn'] === $e['id']];
        if ($t['kind'] === 'pc') {
            $card = cp_card($accounts, $t['char']);
            $o += ['name' => $card['name'] ?? 'Gone character', 'art' => fi_art($card['art'] ?? ''), 'owner' => $party[$t['char']], 'hidden' => false, 'pc' => fi_pc($accounts, $t['char'])];
        } elseif ($t['kind'] === 'monster') {
            $mon = fi_monster($accounts, $c, $t['mon'], $t['by']);
            $o += ['name' => trim((string)($mon['name'] ?? '')) !== '' ? mb_substr($mon['name'], 0, 80) : ($t['name'] ?? 'Monster'), 'art' => fi_art((string)($mon['art'] ?? '')),
                'status' => $mon ? fi_status($mon['hp'] ?? []) : 'healthy', 'hidden' => $e ? !empty($e['hidden']) : !empty($t['hidden'])];
        } else $o += ['name' => $e['name'] ?? $t['name'] ?? 'Entry', 'art' => '', 'hidden' => !empty($t['hidden'])];
        $out[] = $o;
    }
    return $out;
}

// does a placed token stand on at least one square the players were sent as revealed?
function mp_in_sight($m, $t)
{
    $s = $m['sent'] ?? null;
    if (!$s || !$t['placed']) return false;
    $g = $s['grid'];
    [$x0, $y0, $cols, $rows] = mp_cells($g, $m['w'], $m['h']);
    $span = (MP_SIZES[$t['size']] ?? 1) * $m['grid']['s'];
    $lo = fn($v, $o) => (int)floor(($v - $o) / $g['s']);
    for ($r = max(0, $lo($t['y'], $y0)); $r <= min($rows - 1, $lo($t['y'] + $span - 0.01, $y0)); $r++)
        for ($col = max(0, $lo($t['x'], $x0)); $col <= min($cols - 1, $lo($t['x'] + $span - 0.01, $x0)); $col++)
            if ($s['fog'][$r * $cols + $col] === '1') return true;
    return false;
}

// may players get this token? Party tokens once placed; monsters and other entries when placed, not hidden and in sight
function mp_player_sees($m, $t)
{
    if (!$t['placed']) return false;
    return $t['kind'] === 'pc' || (!$t['hidden'] && mp_in_sight($m, $t));
}

// what one viewer gets of a token: players never get owners, fight ids or hidden marks. A party character's token carries
// down, death saves and conditions for everyone (fi_pc, ROADMAP 1.7), never HP.
function mp_tok_out($t, $sub, $dm)
{
    $mine = $t['kind'] === 'pc' && $t['owner'] === $sub;
    $o = ['k' => $t['k'], 'kind' => $t['kind'], 'name' => $t['name'], 'art' => $t['art'], 'size' => $t['size'], 'x' => $t['x'], 'y' => $t['y'],
        'placed' => $t['placed'], 'turn' => $t['turn'], 'mine' => $mine, 'status' => $t['status'] ?? null];
    if ($t['kind'] === 'pc' && $t['pc']) $o += $t['pc'];
    if ($dm) $o += ['hidden' => $t['hidden'], 'fight' => $t['fight']];
    return $o;
}

// ---- what each person sees ----

// $role: "dm" (the DM or a co-DM: everything, any map, the draft fog and the unmasked picture), "player" (the map on the
// table only, with the sent fog, its masked picture and the tokens mp_player_sees() lets through) or "table" (the Table view,
// ROADMAP 1.7, $sub CP_TABLE: what a player gets, with no token of its own; its picture addresses say as=table).
// $mid: the map a DM opens (default: the one on the table).
function mp_view($accounts, $c, $sub, $mid = null, $role = null)
{
    $role ??= $sub === CP_TABLE ? 'table' : (cp_is_dm($c, $sub) ? 'dm' : 'player');
    $dm = $role === 'dm';
    $active = mp_active($accounts, $c['id']);
    $m = $dm && $mid ? mp_read($accounts, $c['id'], $mid) : $active;
    $base = '/campaigns/maps.php?c=' . rawurlencode($c['id']) . ($role === 'table' ? '&as=table' : '');
    $out = ['role' => $role, 'active' => $active['id'] ?? null, 'map' => null];
    if ($dm) $out['maps'] = array_map(fn($x) => ['id' => $x['id'], 'name' => $x['name'], 'archived' => $x['archived'], 'sent' => (bool)$x['sent'],
        'thumb' => "$base&m={$x['id']}&img=thumb"], mp_list($accounts, $c['id']));
    if (!$m) return $out;
    $f = fi_read($accounts, $c['id']);
    $toks = mp_tokens($accounts, $c, $m, $f);
    $sent = $m['sent'] ? ['n' => $m['sent']['n'], 'grid' => $m['sent']['grid'], 'fog' => $m['sent']['fog']] : null;
    $o = ['id' => $m['id'], 'name' => $m['name'], 'w' => $m['w'], 'h' => $m['h'], 'grid' => $m['grid'], 'sent' => $sent, 'archived' => $m['archived']];
    if ($dm) {
        $o += ['draft' => $m['draft'], 'img' => "$base&m={$m['id']}&img=work", 'original' => "$base&m={$m['id']}&img=original",
            'public' => $sent ? "$base&m={$m['id']}&img=public&n={$sent['n']}" : null];
        $o['tokens'] = array_map(fn($t) => mp_tok_out($t, $sub, true), $toks);
    } else {
        // never sent: no picture at all, players get a black rectangle the map's size (with the party on it)
        $o['img'] = $sent ? "$base&m={$m['id']}&img=public&n={$sent['n']}" : null;
        $o['tokens'] = array_values(array_map(fn($t) => mp_tok_out($t, $sub, false),
            array_filter($toks, fn($t) => mp_player_sees($m, $t) || ($t['kind'] === 'pc' && $t['owner'] === $sub))));
    }
    $out['map'] = $o;
    return $out;
}

// ---- the fight's tokens ----

// keep the map on the table in step with the fight ($before: the fight before the change, null if none ran):
// monsters and other entries that joined get a token in the tray, ones taken out leave the map, and when the fight ends
// they all go back to the tray, keeping their last positions. True when the map changed. The caller holds mp_lock().
function mp_fight_sync($accounts, $c, $before, $after)
{
    $m = mp_active($accounts, $c['id']);
    if (!$m) return false;
    $toks = (array)($m['tokens'] ?? []);
    $was = $toks;
    $ids = array_column($after['entries'] ?? [], 'id');
    foreach ($after['entries'] ?? [] as $e) {
        if ($e['kind'] === 'pc' || isset($toks[$k = mp_entry_key($c, $e)])) continue;
        if ($e['kind'] === 'monster') {
            $mon = fi_monster($accounts, $c, $e['mon'], $e['by'] ?? null);
            $toks[$k] = ['kind' => 'monster', 'mon' => $e['mon'], 'by' => $e['by'] ?? $c['dm'], 'name' => $e['name'] ?? '', 'size' => mp_size_of($mon['race'] ?? ''), 'x' => null, 'y' => null, 'placed' => false];
        } else $toks[$k] = ['kind' => 'plain', 'name' => $e['name'], 'size' => 'M', 'x' => null, 'y' => null, 'placed' => false];
    }
    if ($after) {
        foreach ($before['entries'] ?? [] as $e) if ($e['kind'] !== 'pc' && !in_array($e['id'], $ids, true)) unset($toks[mp_entry_key($c, $e)]);
    } elseif ($before) {
        foreach ($toks as &$t) if ($t['kind'] !== 'pc') $t['placed'] = false;
        unset($t);
    }
    if ($toks == $was) return false;
    $m['tokens'] = $toks ?: new stdClass();
    return mp_write($accounts, $c['id'], $m);
}

// ---- changes ----

// the live keys of the players (not the DM or co-DMs) in a campaign, and the Table view's (1.7), which sees what they see
function mp_players($c)
{
    return [...array_values(array_map(fn($m) => live_key($c['id'], $m['sub']), array_filter($c['members'], fn($m) => !cp_is_dm($c, $m['sub'])))), cp_table_key($c['id'])];
}

// One change: [http code, response, live messages [[msg, to], ...]] (to: null everyone, "dm", or a list of keys).
// The caller holds mp_lock(). Ops for the DM and co-DMs:
//   {op: "activate", m} | {op: "rename", m, name} | {op: "archive", m, on} | {op: "grid", m, s, ox, oy} | {op: "draft", m, fog}
//   {op: "send", m} | {op: "token", m, k, size?, hidden?} | {op: "drop", m, mon} | {op: "remove", m, k}
// and for everyone: {op: "move", m, k, x, y, placed} (players: their own character's token on the map on the table only),
// {op: "ruler", m, pts: [[x, y], ...] | null} (shown to everyone live, never saved).
function mp_op($accounts, $c, $sub, $body)
{
    $dm = cp_is_dm($c, $sub);
    $op = (string)($body['op'] ?? '');
    $m = mp_read($accounts, $c['id'], $body['m'] ?? '');
    if (!$m) return [404, ['error' => 'That map is gone. Reload the page.'], []];
    $active = mp_active($accounts, $c['id']);
    $onTable = $active && $active['id'] === $m['id'];
    $all = [[['type' => 'map'], $onTable ? null : 'dm']];
    if ($op === 'ruler') {
        if (!$onTable && !$dm) return [403, ['error' => "That map isn't on the table."], []];
        $pts = null;
        if (is_array($body['pts'] ?? null)) {
            $pts = [];
            foreach ($body['pts'] as $p) if (is_array($p) && is_numeric($p[0] ?? null) && is_numeric($p[1] ?? null)) $pts[] = [round((float)$p[0], 1), round((float)$p[1], 1)];
        }
        $me = $c['members'][cp_member($c, $sub)];
        return [200, ['ok' => true], [[['type' => 'ruler', 'm' => $m['id'], 'who' => live_key($c['id'], $sub), 'name' => $me['name'], 'pts' => $pts], $onTable ? null : 'dm']]];
    }
    if ($op === 'move') {
        $f = fi_read($accounts, $c['id']);
        $toks = mp_tokens($accounts, $c, $m, $f);
        $i = array_search((string)($body['k'] ?? ''), array_column($toks, 'k'), true);
        if ($i === false) return [404, ['error' => "That token isn't on this map any more."], []];
        $t = $toks[$i];
        if (!$dm && (!$onTable || $t['kind'] !== 'pc' || $t['owner'] !== $sub)) return [403, ['error' => 'You can only move your own character.'], []];
        $placed = !empty($body['placed']);
        if ($placed && (!is_numeric($body['x'] ?? null) || !is_numeric($body['y'] ?? null))) return [400, ['error' => 'Where to?'], []];
        $before = $t;
        $stored = (array)($m['tokens'] ?? []);
        $keep = $stored[$t['k']] ?? null;
        // a party token that was never moved isn't stored yet
        if (!$keep) foreach (fi_party($c) as $char => $owner) if (mp_key($c['id'], 'pc', $char) === $t['k']) $keep = ['kind' => 'pc', 'char' => $char, 'size' => 'M'];
        // positions stay near the map (a token can hang over its edge, not wander off it)
        $span = (MP_SIZES[$t['size']] ?? 1) * $m['grid']['s'];
        if ($placed) {
            $keep['x'] = round(max(-$span / 2, min($m['w'] - $span / 2, (float)$body['x'])), 1);
            $keep['y'] = round(max(-$span / 2, min($m['h'] - $span / 2, (float)$body['y'])), 1);
        }
        $keep['placed'] = $placed;
        $stored[$t['k']] = $keep;
        $m['tokens'] = $stored;
        if (!mp_write($accounts, $c['id'], $m)) return [500, ['error' => "Couldn't save the move."], []];
        $t = array_merge($t, ['x' => $keep['x'] ?? null, 'y' => $keep['y'] ?? null, 'placed' => $placed && isset($keep['x'])]);
        $msg = ['type' => 'mapmove', 'm' => $m['id'], 'k' => $t['k'], 'x' => $t['x'], 'y' => $t['y'], 'placed' => $t['placed']];
        $live = [[$msg, 'dm']];
        if ($onTable) {
            // players: the move if they may see the token now; "gone" if they could before and can't now; nothing otherwise
            $now = mp_player_sees($m, $t);
            $was = mp_player_sees($m, $before);
            $players = mp_players($c);
            if ($t['kind'] === 'pc') {
                $owner = live_key($c['id'], $t['owner']);
                $others = array_values(array_diff($players, [$owner]));
                if (in_array($owner, $players, true)) $live[] = [$msg, [$owner]]; // their own token, placed or not
                if ($now) $live[] = [$msg, $others];
                elseif ($was) $live[] = [['type' => 'mapmove', 'm' => $m['id'], 'k' => $t['k'], 'gone' => true], $others];
            } elseif ($now) $live[] = [$msg, $players];
            elseif ($was) $live[] = [['type' => 'mapmove', 'm' => $m['id'], 'k' => $t['k'], 'gone' => true], $players];
        }
        return [200, ['ok' => true], $live];
    }
    if (!$dm) return [403, ['error' => 'Only the DM can do that.'], []];
    if ($op === 'activate') {
        if ($m['archived']) return [400, ['error' => 'Unarchive the map first.'], []];
        if (!mp_put(mp_root($accounts, $c['id']) . '/table.json', ['active' => $m['id']])) return [500, ['error' => "Couldn't put the map on the table."], []];
        $f = fi_read($accounts, $c['id']);
        mp_fight_sync($accounts, $c, $f, $f);
        return [200, ['active' => $m['id']], [[['type' => 'map'], null]]];
    }
    if ($op === 'rename') {
        $name = cp_clean_name($body['name'] ?? '');
        if ($name === null) return [400, ['error' => 'Give the map a name.'], []];
        $m['name'] = $name;
    } elseif ($op === 'archive') {
        $m['archived'] = empty($body['on']) ? 0 : (int)round(microtime(true) * 1000);
        if ($m['archived'] && $onTable) {
            mp_put(mp_root($accounts, $c['id']) . '/table.json', ['active' => null]);
            $all = [[['type' => 'map'], null]];
        }
    } elseif ($op === 'grid') {
        $g = mp_grid($body['s'] ?? null, $body['ox'] ?? 0, $body['oy'] ?? 0, $m['w'], $m['h']);
        if (!$g) return [400, ['error' => 'A square must be at least 8 pixels and no bigger than the map.'], []];
        if ($g != $m['grid']) {
            // the squares moved, so the draft starts over fully fogged; players keep the last sent fog until the next send
            $m['grid'] = $g;
            $m['draft'] = mp_fogged($g, $m['w'], $m['h']);
        }
    } elseif ($op === 'draft') {
        $fog = (string)($body['fog'] ?? '');
        if (strlen($fog) !== strlen(mp_fogged($m['grid'], $m['w'], $m['h'])) || !preg_match('/^[01]*$/', $fog)) return [409, ['error' => 'The grid changed. Reload the map.'], []];
        $m['draft'] = $fog;
        $all = [[['type' => 'map', 'm' => $m['id'], 'draft' => true], 'dm']];
    } elseif ($op === 'send') {
        $m['sent'] = ['n' => ($m['sent']['n'] ?? 0) + 1, 'grid' => $m['grid'], 'fog' => $m['draft'], 'at' => (int)round(microtime(true) * 1000)];
        if (!mp_render($accounts, $c['id'], $m)) return [500, ['error' => "Couldn't make the players' copy of the map."], []];
    } elseif ($op === 'token' || $op === 'remove') {
        $toks = (array)($m['tokens'] ?? []);
        $k = (string)($body['k'] ?? '');
        if (!isset($toks[$k])) {
            // a party token that was never moved isn't stored yet
            foreach (fi_party($c) as $char => $owner) if (mp_key($c['id'], 'pc', $char) === $k) $toks[$k] = ['kind' => 'pc', 'char' => $char, 'size' => 'M', 'x' => null, 'y' => null, 'placed' => false];
            if (!isset($toks[$k])) return [404, ['error' => "That token isn't on this map any more."], []];
        }
        if ($op === 'remove') {
            if ($toks[$k]['kind'] === 'pc') return [400, ['error' => 'Party characters always have a token.'], []];
            unset($toks[$k]);
        } else {
            if (isset($body['size'])) {
                if (!isset(MP_SIZES[$body['size']])) return [400, ['error' => 'Pick a size from Tiny to Gargantuan.'], []];
                $toks[$k]['size'] = $body['size'];
            }
            if (isset($body['hidden'])) {
                if ($toks[$k]['kind'] === 'pc') return [400, ['error' => "Party characters can't be hidden."], []];
                $toks[$k]['hidden'] = !empty($body['hidden']);
            }
        }
        $m['tokens'] = $toks ?: new stdClass();
    } elseif ($op === 'drop') {
        $mon = fi_monster($accounts, $c, (string)($body['mon'] ?? ''), $sub);
        if (!$mon) return [400, ['error' => 'Save that monster to your account first (sign in on the Monster Sheet).'], []];
        $toks = (array)($m['tokens'] ?? []);
        $k = mp_key($c['id'], 'monster', "$sub:{$mon['id']}");
        $toks[$k] ??= ['kind' => 'monster', 'mon' => $mon['id'], 'by' => $sub, 'name' => mb_substr((string)($mon['name'] ?? ''), 0, 80), 'size' => mp_size_of($mon['race'] ?? ''), 'x' => null, 'y' => null, 'placed' => false];
        $m['tokens'] = $toks;
        $all = [[['type' => 'map'], 'dm']];
    } else return [400, ['error' => 'Unknown map change.'], []];
    return mp_write($accounts, $c['id'], $m) ? [200, ['ok' => true], $all] : [500, ['error' => "Couldn't save the map."], []];
}
