<?php
// Battle maps with fog of war (ROADMAP 1.6). A campaign's maps are a plain named list:
//   <accounts>/campaigns/<id>/maps/table.json        {"active": <map id> | null}: the map on the table, which players see
//   <accounts>/campaigns/<id>/maps/<map id>/
//     original.<jpg|png|webp|gif>   the upload, exactly as it came (the DM and co-DMs only)
//     work.webp                     a working copy, longest side MP_WORK px, unmasked (the DM's view; masked copies come from it)
//     thumb.webp                    for the DM's map list
//     live.webp                     unused since fog is drawn on each screen; kept where it exists
//     public-<n>.webp               from before live fog: the n-th "Send to table", kept, never written any more
//     map.json                      {"id", "name", "created", "by", "archived" (ms or 0), "ext", "w", "h" (original px),
//                                    "grid": {"s", "ox", "oy"} (square size and offset, original px),
//                                    "fog": {"n", "ops", "sight"}, "draws", "overlays", "enc", "tokens": {key: token},
//                                    and from before live fog, kept and unused: "draft", "sent": null | {"n", "grid", "fog", "at"}}
// Fog is freeform: "ops" replay in order in original px, each {on (true covers, false reveals), all: true | poly: [[x, y], ...] | shape: "square" | "round", r, pts}.
// "sight" is a coarse copy of the result (mp_fog_render) for deciding what stands in sight. A map from before live fog gets ops
// from what players had been sent, never from an unsent draft (mp_fog_upgrade). The old string fog: one character per square,
// "1" revealed, "0" fogged; squares cut by the image's edge count as squares (mp_cells).
// draws: [{c, s, pts}]. overlays: [{id, type: square | circle | cone | line, x, y, len, ang, color, pat, hidden, group, locked}].
// enc: the panel's encounter, {ids: [token keys], init: {key: n}, side: {key: party | enemy}}. maps/opts.json: {fx, ac} (fi_opts).
// A token: {"kind": "pc" | "monster" | "plain", "char" | "mon" + "by" | "name", "size" (T S M L H G), "x", "y" (top-left, original
// px), "placed" (false: in the "Not placed" tray), "hidden" (monsters not in a fight; a fight monster's hidden flag is its
// initiative entry's), "copy" + "suffix" (a copy with its own HP, fi_copies), "rename", "ring", "noName", "locked", "group", "cond"}.
// Token keys are hashes, so no Google or monster id reaches players. Nothing here ever touches a character or monster file.
// mp_view() alone decides what each person gets (players: only the masked picture, no fog ops, no hidden or fogged monsters, no
// drawings or overlays wholly under fog, no original); the Table view (1.7) adds its own role there.
require_once __DIR__ . '/initiative.php';
require_once __DIR__ . '/live.php';

const MP_WORK = 2048; // small copies so maps load fast for everyone (owner's choice); the original keeps full detail
const MP_TYPES = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'];
const MP_SIZES = ['T' => 0.5, 'S' => 1, 'M' => 1, 'L' => 2, 'H' => 3, 'G' => 4]; // squares across
const MP_PTS = 5000; // points in one stroke, polygon or drawing
const MP_SIGHT = 200; // cells along the longest side of "sight"

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
    if ($e['kind'] === 'monster') return mp_key($c['id'], 'monster', ($e['by'] ?? $c['dm']) . ':' . $e['mon'] . (!empty($e['copy']) ? ":{$e['copy']}" : ''));
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
        'w' => $w, 'h' => $h, 'ww' => imagesx($work), 'wh' => imagesy($work), 'grid' => $grid, 'draft' => mp_fogged($grid, $w, $h), 'sent' => null, 'fog' => ['n' => 1, 'ops' => [], 'sight' => null], 'tokens' => new stdClass()];
    return mp_fog_render($accounts, $c['id'], $m) && mp_write($accounts, $c['id'], $m) ? [200, $m] : [500, ['error' => "Couldn't save the map."]];
}

// ---- fog ----

// a list of [x, y] rounded to 0.1, or null
function mp_pts($list, $min = 1, $max = MP_PTS)
{
    if (!is_array($list) || !array_is_list($list) || count($list) < $min || count($list) > $max) return null;
    $out = [];
    foreach ($list as $p) {
        if (!is_array($p) || !is_numeric($p[0] ?? null) || !is_numeric($p[1] ?? null) || !is_finite((float)$p[0]) || !is_finite((float)$p[1])) return null;
        $out[] = [round((float)$p[0], 1), round((float)$p[1], 1)];
    }
    return $out;
}

// one fog op as sent, cleaned, or null
function mp_fog_op($o)
{
    if (!is_array($o) || !is_bool($o['on'] ?? null)) return null;
    if (($o['all'] ?? null) === true) return ['on' => $o['on'], 'all' => true];
    if (isset($o['poly'])) return ($p = mp_pts($o['poly'], 3)) ? ['on' => $o['on'], 'poly' => $p] : null;
    if (!in_array($o['shape'] ?? null, ['square', 'round'], true) || !is_numeric($o['r'] ?? null) || $o['r'] <= 0 || $o['r'] > 100000) return null;
    return ($p = mp_pts($o['pts'] ?? null)) ? ['on' => $o['on'], 'shape' => $o['shape'], 'r' => round((float)$o['r'], 1), 'pts' => $p] : null;
}

// the fog as a W x H picture: fogged pixels fully transparent black, revealed ones the image's transparent colour, so imagecopy()
// wipes the first and skips the second. Covering rounds outwards and revealing inwards: a fogged pixel is never left a pixel short.
function mp_fog_mask($m, $W, $H)
{
    $im = imagecreatetruecolor($W, $H);
    imagealphablending($im, false);
    $clear = imagecolorallocate($im, 1, 254, 2);
    $fog = imagecolorallocatealpha($im, 0, 0, 0, 127);
    imagefilledrectangle($im, 0, 0, $W - 1, $H - 1, $clear);
    imagecolortransparent($im, $clear);
    $k = $W / $m['w'];
    foreach ($m['fog']['ops'] as $o) {
        $col = $o['on'] ? $fog : $clear;
        if (!empty($o['all'])) imagefilledrectangle($im, 0, 0, $W - 1, $H - 1, $col);
        elseif (isset($o['poly'])) {
            $flat = [];
            foreach ($o['poly'] as $p) { $flat[] = (int)round($p[0] * $k); $flat[] = (int)round($p[1] * $k); }
            imagefilledpolygon($im, $flat, $col);
            if ($o['on']) { imagesetthickness($im, 2); imagepolygon($im, $flat, $col); imagesetthickness($im, 1); }
        } else {
            $r = max(1, $o['on'] ? (int)ceil($o['r'] * $k) : (int)floor($o['r'] * $k));
            $P = array_map(fn($p) => [$p[0] * $k, $p[1] * $k], $o['pts']);
            if ($o['shape'] === 'round') {
                imagesetthickness($im, 2 * $r);
                foreach ($P as $i => $p) {
                    if ($i) imageline($im, (int)round($P[$i - 1][0]), (int)round($P[$i - 1][1]), (int)round($p[0]), (int)round($p[1]), $col);
                    imagefilledellipse($im, (int)round($p[0]), (int)round($p[1]), 2 * $r + 1, 2 * $r + 1, $col);
                }
                imagesetthickness($im, 1);
            } else {
                $st = fn($a, $b) => imagefilledrectangle($im, (int)floor($a - $r), (int)floor($b - $r), (int)ceil($a + $r), (int)ceil($b + $r), $col);
                $st(...$P[0]);
                for ($i = 1; $i < count($P); $i++) {
                    $dx = $P[$i][0] - $P[$i - 1][0];
                    $dy = $P[$i][1] - $P[$i - 1][1];
                    $n = max(1, (int)ceil(hypot($dx, $dy) / max(1, $r / 2)));
                    for ($j = 1; $j <= $n; $j++) $st($P[$i - 1][0] + $dx * $j / $n, $P[$i - 1][1] + $dy * $j / $n);
                }
            }
        }
    }
    return [$im, $clear];
}

// "sight" for $m's fog (the caller saves $m afterwards): what stands in the clear, for what players are sent. Every screen draws the
// fog itself over the one picture (the owner's choice, 2026-11-04: a player could read what's under it, and that's accepted).
function mp_fog_render($accounts, $cid, &$m)
{
    if (!function_exists('imagecreatetruecolor')) return false;
    $sight = null;
    if ($m['fog']['ops']) {
        $k = min(1, 800 / max($m['w'], $m['h']));
        $W = max(1, (int)round($m['w'] * $k));
        $H = max(1, (int)round($m['h'] * $k));
        [$mask, $clear] = mp_fog_mask($m, $W, $H);
        $cell = max($m['w'], $m['h']) / MP_SIGHT;
        $cols = max(1, (int)ceil($m['w'] / $cell));
        $rows = max(1, (int)ceil($m['h'] / $cell));
        $k = $W / $m['w'];
        $bits = '';
        for ($r = 0; $r < $rows; $r++) for ($c = 0; $c < $cols; $c++)
            $bits .= imagecolorat($mask, min($W - 1, (int)(($c + 0.5) * $cell * $k)), min($H - 1, (int)(($r + 0.5) * $cell * $k))) === $clear ? '1' : '0';
        $sight = ['cols' => $cols, 'rows' => $rows, 'cell' => $cell, 'bits' => $bits];
    }
    $m['fog']['sight'] = $sight;
    return true;
}

// a map from before live fog: ops from what players had been sent (an unsent draft stays private in "draft"), never sent: all fogged.
// The caller holds mp_lock(). Unchanged if the picture can't be made, and then players get none (mp_view).
function mp_fog_upgrade($accounts, $cid, $m)
{
    if (isset($m['fog'])) return $m;
    $s = $m['sent'] ?? null;
    $ops = [];
    if (!$s) $ops[] = ['on' => true, 'all' => true];
    else {
        $g = $s['grid'];
        [$x0, $y0, $cols, $rows] = mp_cells($g, $m['w'], $m['h']);
        for ($r = 0; $r < $rows; $r++) for ($col = 0; $col < $cols; $col++) {
            if ($s['fog'][$r * $cols + $col] === '1') continue;
            $end = $col;
            while ($end + 1 < $cols && $s['fog'][$r * $cols + $end + 1] !== '1') $end++;
            $a = $x0 + $col * $g['s'];
            $b = $x0 + ($end + 1) * $g['s'];
            $t = $y0 + $r * $g['s'];
            $u = $t + $g['s'];
            $ops[] = ['on' => true, 'poly' => [[$a, $t], [$b, $t], [$b, $u], [$a, $u]]];
            $col = $end;
        }
    }
    $new = $m;
    $new['fog'] = ['n' => ($s['n'] ?? 0) + 1, 'ops' => $ops, 'sight' => null];
    return mp_fog_render($accounts, $cid, $new) && mp_write($accounts, $cid, $new) ? $new : $m;
}

// is any part of this box of the map (original px) in sight? No fog at all: yes. A map whose fog couldn't be made: no.
function mp_sight_any($m, $x0, $y0, $x1, $y1)
{
    $f = $m['fog'] ?? null;
    if (!$f) return false;
    if (!$f['ops']) return true;
    $s = $f['sight'] ?? null;
    if (!$s) return false;
    $c1 = min($s['cols'] - 1, (int)floor($x1 / $s['cell']));
    $r1 = min($s['rows'] - 1, (int)floor($y1 / $s['cell']));
    for ($r = max(0, (int)floor($y0 / $s['cell'])); $r <= $r1; $r++) for ($c = max(0, (int)floor($x0 / $s['cell'])); $c <= $c1; $c++)
        if ($s['bits'][$r * $s['cols'] + $c] === '1') return true;
    return false;
}

// a drawing or overlay as sent, cleaned, or null
function mp_draw_of($d)
{
    if (!is_array($d) || !is_int($d['c'] ?? null) || !is_int($d['s'] ?? null) || $d['c'] < 0 || $d['c'] > 63 || $d['s'] < 0 || $d['s'] > 63) return null;
    return ($p = mp_pts($d['pts'] ?? null)) ? ['c' => $d['c'], 's' => $d['s'], 'pts' => $p] : null;
}
function mp_overlay_of($o)
{
    if (!is_array($o) || !preg_match('/^[\w-]{1,40}$/', (string)($o['id'] ?? '')) || !in_array($o['type'] ?? null, ['square', 'circle', 'cone', 'line'], true)) return null;
    foreach (['x', 'y', 'len', 'ang'] as $f) if (!is_numeric($o[$f] ?? null) || !is_finite((float)$o[$f])) return null;
    foreach (['color', 'pat'] as $f) if (!is_int($o[$f] ?? null) || $o[$f] < 0 || $o[$f] > 63) return null;
    if (isset($o['group']) && $o['group'] !== '' && !preg_match('/^[\w-]{1,40}$/', (string)$o['group'])) return null;
    return ['id' => (string)$o['id'], 'type' => $o['type'], 'x' => round((float)$o['x'], 1), 'y' => round((float)$o['y'], 1), 'len' => round((float)$o['len'], 1), 'ang' => round((float)$o['ang'], 4),
        'color' => $o['color'], 'pat' => $o['pat'], 'hidden' => !empty($o['hidden']), 'group' => (string)($o['group'] ?? ''), 'locked' => !empty($o['locked'])];
}
// what a viewer gets of a drawing: whether it's theirs, never whose
function mp_draws_out($list, $sub)
{
    return array_map(function ($d) use ($sub) { $mine = ($d['by'] ?? null) === $sub; unset($d['by']); return $d + ['mine' => $mine]; }, $list);
}
// what players may get of them: nothing hidden or wholly under fog, none of the DM's marks. The page clips the rest to the picture.
function mp_draws_seen($m)
{
    return array_values(array_filter($m['draws'] ?? [], function ($d) use ($m) {
        foreach ($d['pts'] as $p) if (mp_sight_any($m, $p[0], $p[1], $p[0], $p[1])) return true;
        return false;
    }));
}
function mp_overlays_seen($m)
{
    $out = [];
    foreach ($m['overlays'] ?? [] as $o) {
        if ($o['hidden'] || !mp_sight_any($m, $o['x'] - $o['len'], $o['y'] - $o['len'], $o['x'] + $o['len'], $o['y'] + $o['len'])) continue;
        $out[] = array_intersect_key($o, array_flip(['id', 'type', 'x', 'y', 'len', 'ang', 'color', 'pat']));
    }
    return $out;
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
    $copies = fi_copies($accounts, $c['id']);
    $running = ($f['phase'] ?? '') === 'running';
    $out = [];
    foreach ($toks as $k => $t) {
        if ($t['kind'] === 'pc' && !isset($party[$t['char']])) continue; // left the campaign
        $e = $entries[$k] ?? null;
        $o = ['k' => (string)$k, 'kind' => $t['kind'], 'size' => $t['size'] ?? 'M', 'x' => $t['x'] ?? null, 'y' => $t['y'] ?? null, 'placed' => !empty($t['placed']) && isset($t['x']),
            'fight' => $e ? $e['id'] : null, 'turn' => $e && $f['phase'] === 'running' && $f['turn'] === $e['id'], 'running' => $e && $running,
            'suffix' => (string)($t['suffix'] ?? ''), 'ring' => (string)($t['ring'] ?? ''), 'noName' => !empty($t['noName']), 'locked' => !empty($t['locked']), 'group' => (string)($t['group'] ?? ''),
            'cond' => is_array($t['cond'] ?? null) ? $t['cond'] : []];
        if ($t['kind'] === 'pc') {
            $card = cp_card($accounts, $t['char']);
            $ch = dm_char($accounts, $t['char']);
            $dex = 0;
            foreach (is_array($ch->abilities ?? null) ? $ch->abilities : [] as $a) if (is_object($a) && ($a->key ?? '') === 'DEX') $dex = (int)floor((fi_num($a->score ?? 10) - 10) / 2);
            $lvl = 0;
            foreach (is_array($ch->classes ?? null) ? $ch->classes : [] as $cl) if (is_object($cl)) $lvl += (int)fi_num($cl->level ?? 0);
            $o += ['name' => $card['name'] ?? 'Gone character', 'art' => fi_art($card['art'] ?? ''), 'owner' => $party[$t['char']], 'hidden' => false, 'pc' => fi_pc($accounts, $t['char']),
                'char' => $t['char'], 'bonus' => $dex, 'level' => $lvl, 'hp' => $ch ? ['cur' => fi_num($ch->hp->cur ?? 0), 'max' => fi_num($ch->calc->hpMax ?? 0) ?: null, 'temp' => fi_num($ch->hp->temp ?? 0)] : null];
        } elseif ($t['kind'] === 'monster') {
            $mon = fi_mon_of($accounts, $c, $t);
            $cp = !empty($t['copy']) ? $copies[$t['copy']] ?? null : null;
            $name = trim((string)($mon['name'] ?? '')) !== '' ? mb_substr($mon['name'], 0, 80) : ($t['name'] ?? 'Monster');
            $o += ['name' => !$cp && isset($t['rename']) ? $t['rename'] : $name, 'art' => fi_art((string)($mon['art'] ?? '')),
                'status' => $mon ? fi_status($mon['hp'] ?? []) : 'healthy', 'hidden' => $e ? !empty($e['hidden']) : !empty($t['hidden']),
                'mon' => $t['mon'], 'by' => $t['by'] ?? $c['dm'], 'copy' => $t['copy'] ?? null, 'ac' => $e['ac'] ?? $cp['ac'] ?? null, 'bonus' => $e['bonus'] ?? $cp['bonus'] ?? null,
                'cr' => isset($mon['cr']) ? (string)$mon['cr'] : null, 'xp' => $mon['xp'] ?? null,
                'hp' => $mon ? ['cur' => fi_num($mon['hp']['cur'] ?? 0), 'max' => fi_num($mon['hp']['base'] ?? 0) + fi_num($mon['hp']['mod'] ?? 0), 'temp' => fi_num($mon['hp']['temp'] ?? 0)] : null];
        } else $o += ['name' => $t['rename'] ?? $e['name'] ?? $t['name'] ?? 'Entry', 'art' => '', 'hidden' => !empty($t['hidden'])];
        $out[] = $o;
    }
    return $out;
}

// does a placed token stand at least partly in sight?
function mp_in_sight($m, $t)
{
    if (!$t['placed']) return false;
    $span = (MP_SIZES[$t['size']] ?? 1) * $m['grid']['s'];
    return mp_sight_any($m, $t['x'], $t['y'], $t['x'] + $span - 0.01, $t['y'] + $span - 0.01);
}

// the fight entries whose token on the map on the table is placed and wholly under fog (fi_view hides them from players)
function mp_fogged_entries($accounts, $c, $f)
{
    $m = mp_active($accounts, $c['id']);
    if (!$m) return [];
    $toks = (array)($m['tokens'] ?? []);
    $out = [];
    foreach ($f['entries'] as $e) {
        $t = $e['kind'] === 'pc' ? null : ($toks[mp_entry_key($c, $e)] ?? null);
        if ($t && !empty($t['placed']) && isset($t['x']) && !mp_in_sight($m, ['placed' => true, 'size' => $t['size'] ?? 'M', 'x' => $t['x'], 'y' => $t['y']])) $out[] = $e['id'];
    }
    return $out;
}

// may players get this token? Party tokens once placed; monsters and other entries when placed, not hidden and in sight
function mp_player_sees($m, $t)
{
    if (!$t['placed']) return false;
    return $t['kind'] === 'pc' || (!$t['hidden'] && mp_in_sight($m, $t));
}

// what one viewer gets of a token: players never get owners, fight ids, hidden marks, or any HP but their own character's.
// A party character's token carries down, death saves and conditions for everyone (fi_pc, ROADMAP 1.7), unless the DM turned off
// the effects (opts.fx); AC only with opts.ac, on a monster in the running fight.
function mp_tok_out($t, $sub, $dm, $opts = ['fx' => true, 'ac' => false])
{
    $mine = $t['kind'] === 'pc' && $t['owner'] === $sub;
    $fx = $dm || $opts['fx'];
    $o = ['k' => $t['k'], 'kind' => $t['kind'], 'name' => $t['name'], 'art' => $t['art'], 'size' => $t['size'], 'x' => $t['x'], 'y' => $t['y'], 'placed' => $t['placed'], 'turn' => $t['turn'], 'mine' => $mine,
        'status' => $fx ? ($t['status'] ?? null) : ($t['kind'] === 'monster' ? 'healthy' : null), 'suffix' => $t['suffix'], 'ring' => $t['ring'], 'noName' => $t['noName'], 'locked' => $t['locked'], 'cond' => $t['cond']];
    if ($t['kind'] === 'pc' && $t['pc']) $o += $fx ? $t['pc'] : ['down' => false, 'saves' => null, 'conds' => $t['pc']['conds']];
    if ($dm) {
        $o += ['hidden' => $t['hidden'], 'fight' => $t['fight'], 'group' => $t['group']];
        if ($t['kind'] === 'pc') $o += ['char' => $t['char'], 'bonus' => $t['bonus'], 'level' => $t['level'], 'hp' => $t['hp']];
        if ($t['kind'] === 'monster') $o += ['copy' => $t['copy'], 'mon' => $t['mon'], 'by' => $t['by'], 'ac' => $t['ac'], 'bonus' => $t['bonus'], 'cr' => $t['cr'], 'xp' => $t['xp'], 'hp' => $t['hp']];
    } else {
        if ($mine) $o += ['char' => $t['char'], 'hp' => $t['hp']];
        if ($opts['ac'] && $t['kind'] === 'monster' && $t['running'] && $t['ac'] !== null) $o['ac'] = $t['ac'];
    }
    return $o;
}

// ---- what each person sees ----

// $role: "dm" (the DM or a co-DM: everything, any map, the fog's ops and the unmasked picture), "player" (the map on the
// table only, with its masked picture and the tokens, drawings and overlays in sight) or "table" (the Table view,
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
    if ($dm) $out['maps'] = array_map(fn($x) => ['id' => $x['id'], 'name' => $x['name'], 'archived' => $x['archived'],
        'thumb' => "$base&m={$x['id']}&img=thumb"], mp_list($accounts, $c['id']));
    if ($m && !isset($m['fog']) && ($lock = mp_lock($accounts, $c['id']))) { // a map from before live fog, the first time it's looked at
        $m = mp_fog_upgrade($accounts, $c['id'], mp_read($accounts, $c['id'], $m['id']) ?? $m);
        flock($lock, LOCK_UN);
    }
    if (!$m) return $out;
    $f = fi_read($accounts, $c['id']);
    $toks = mp_tokens($accounts, $c, $m, $f);
    $opts = fi_opts($accounts, $c['id']);
    $n = $m['fog']['n'] ?? null;
    $o = ['id' => $m['id'], 'name' => $m['name'], 'w' => $m['w'], 'h' => $m['h'], 'grid' => $m['grid'], 'n' => $n, 'archived' => $m['archived'], 'opts' => $opts];
    if ($dm) {
        $enc = $m['enc'] ?? [];
        $o += ['fog' => ['n' => $n, 'ops' => $m['fog']['ops'] ?? []], 'enc' => ['ids' => $enc['ids'] ?? [], 'init' => (object)($enc['init'] ?? []), 'side' => (object)($enc['side'] ?? [])],
            'img' => "$base&m={$m['id']}&img=work", 'original' => "$base&m={$m['id']}&img=original", 'draws' => mp_draws_out($m['draws'] ?? [], $sub), 'overlays' => $m['overlays'] ?? []];
        $o['tokens'] = array_map(fn($t) => mp_tok_out($t, $sub, true), $toks);
    } else {
        $o += ['img' => "$base&m={$m['id']}&img=work", 'fog' => ['n' => $n, 'ops' => $m['fog']['ops'] ?? []], 'draws' => mp_draws_out(mp_draws_seen($m), $sub), 'overlays' => mp_overlays_seen($m)];
        $o['tokens'] = array_values(array_map(fn($t) => mp_tok_out($t, $sub, false, $opts),
            array_filter($toks, fn($t) => mp_player_sees($m, $t) || ($t['kind'] === 'pc' && $t['owner'] === $sub))));
    }
    $out['map'] = $o;
    return $out;
}

// ---- the fight's tokens ----

// keep the map on the table in step with the fight: monsters and other entries that joined with no token get one in the tray.
// A token stays where it is when its entry leaves or the fight ends, and keeps its entry's hidden mark, so a hidden monster
// never shows just because the fight is over. True when the map changed. The caller holds mp_lock().
function mp_fight_sync($accounts, $c, $before, $after)
{
    $m = mp_active($accounts, $c['id']);
    if (!$m) return false;
    $toks = (array)($m['tokens'] ?? []);
    $was = $toks;
    $still = array_column($after['entries'] ?? [], 'id');
    foreach ($before['entries'] ?? [] as $e) if ($e['kind'] === 'monster' && !in_array($e['id'], $still, true) && isset($toks[$k = mp_entry_key($c, $e)])) $toks[$k]['hidden'] = !empty($e['hidden']);
    foreach ($after['entries'] ?? [] as $e) {
        if ($e['kind'] === 'pc' || isset($toks[$k = mp_entry_key($c, $e)])) continue;
        if ($e['kind'] === 'monster') {
            $mon = fi_monster($accounts, $c, $e['mon'], $e['by'] ?? null);
            $toks[$k] = ['kind' => 'monster', 'mon' => $e['mon'], 'by' => $e['by'] ?? $c['dm'], 'name' => $e['name'] ?? '', 'size' => mp_size_of($mon['race'] ?? ''), 'x' => null, 'y' => null, 'placed' => false];
            if (!empty($e['copy'])) $toks[$k] += ['copy' => $e['copy'], 'suffix' => fi_copies($accounts, $c['id'])[$e['copy']]['suffix'] ?? ''];
        } else $toks[$k] = ['kind' => 'plain', 'name' => $e['name'], 'size' => 'M', 'x' => null, 'y' => null, 'placed' => false];
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

// positions stay near the map (a token can hang over its edge, not wander off it)
function mp_clamp($m, $span, $x, $y)
{
    return [round(max(-$span / 2, min($m['w'] - $span / 2, (float)$x)), 1), round(max(-$span / 2, min($m['h'] - $span / 2, (float)$y)), 1)];
}

// the next letter for a copy of this monster on this map: A, B, ... Z, then 27, 28, ...
function mp_suffix($toks, $mon, $name = null)
{
    // the same monster, or another on the sheet with the same name (an encounter's three goblins), so no two tokens read alike
    $used = array_column(array_filter($toks, fn($t) => !empty($t['copy']) && (($t['mon'] ?? null) === $mon || ($name !== null && ($t['name'] ?? null) === $name))), 'suffix');
    for ($i = 0; ; $i++) {
        $l = $i < 26 ? chr(65 + $i) : chr(65 + (int)($i / 26) - 1) . chr(65 + $i % 26);
        if (!in_array($l, $used, true)) return $l;
    }
}

// One change: [http code, response, live messages [[msg, to], ...]] (to: null everyone, "dm", or a list of keys).
// The caller holds mp_lock(). Ops for the DM and co-DMs:
//   {op: "activate", m} | {op: "hide", m} | {op: "rename", m, name} | {op: "archive", m, on} | {op: "grid", m, s, ox, oy}
//   {op: "fog", m, add} (an "all" op replaces the list) | {op: "fogset", m, ops} (Undo)
//   {op: "draw", m, add} and {op: "drawdel", m, ids} (players too: their own lines, the map on the table) | {op: "drawset", m, draws} | {op: "overlay", m, o} (by id) | {op: "overlaydel", m, ids}
//   {op: "token", m, k, size?, hidden?, ring?, noName?, locked?, group?, name?, cond?} (players: size only, their own token on the map on the table)
//   {op: "drop", m, mon} | {op: "remove", m, k} | {op: "place", m, mon, x, y, ac?, bonus?} | {op: "paste", m, k, x, y}
//   {op: "copyhp", m, k, hop} | {op: "enc", m, enc} | {op: "opts", m, fx?, ac?} | {op: "send", m, mons: [{mon, ac, bonus}]}
// and for everyone: {op: "move", m, k, x, y, placed} (players: their own character's token on the map on the table only, unless locked),
// {op: "ruler", m, pts: [[x, y], ...] | null}, {op: "ping", m, x, y, c}, {op: "trail", m, id, pts, c} (shown to everyone live, never saved).
function mp_op($accounts, $c, $sub, $body)
{
    $dm = cp_is_dm($c, $sub);
    $op = (string)($body['op'] ?? '');
    $m = mp_read($accounts, $c['id'], $body['m'] ?? '');
    if (!$m) return [404, ['error' => 'That map is gone. Reload the page.'], []];
    $m = mp_fog_upgrade($accounts, $c['id'], $m);
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
    // a fog stroke while it's being painted: shown live on every screen, saved by "fog" when it ends
    if ($op === 'fogpv') {
        if (!$dm) return [403, ['error' => 'Only the DM can do that.'], []];
        if (!($o = mp_fog_op($body['add'] ?? null))) return [400, ['error' => "That isn't a fog change."], []];
        return [200, ['ok' => true], [[['type' => 'mapfog', 'm' => $m['id'], 'who' => live_key($c['id'], $sub), 'op' => $o], $onTable ? null : 'dm']]];
    }
    if ($op === 'trail') {
        if (!$onTable && !$dm) return [403, ['error' => "That map isn't on the table."], []];
        $msg = ['m' => $m['id'], 'who' => live_key($c['id'], $sub), 'c' => is_int($body['color'] ?? null) ? max(0, min(63, $body['color'])) : 0];
        $pts = mp_pts($body['pts'] ?? null);
        if (!$pts || !preg_match('/^[\w-]{1,40}$/', (string)($body['id'] ?? ''))) return [400, ['error' => "That isn't a trail."], []];
        $msg += ['type' => 'maptrail', 'id' => (string)$body['id'], 'pts' => $pts];
        return [200, ['ok' => true], [[$msg, $onTable ? null : 'dm']]];
    }
    if ($op === 'move') {
        $f = fi_read($accounts, $c['id']);
        $toks = mp_tokens($accounts, $c, $m, $f);
        $i = array_search((string)($body['k'] ?? ''), array_column($toks, 'k'), true);
        if ($i === false) return [404, ['error' => "That token isn't on this map any more."], []];
        $t = $toks[$i];
        if (!$dm && (!$onTable || $t['kind'] !== 'pc' || $t['owner'] !== $sub)) return [403, ['error' => 'You can only move your own character.'], []];
        if (!$dm && $t['locked']) return [403, ['error' => 'The DM locked that token.'], []];
        $placed = !empty($body['placed']);
        if ($placed && (!is_numeric($body['x'] ?? null) || !is_numeric($body['y'] ?? null))) return [400, ['error' => 'Where to?'], []];
        $before = $t;
        $stored = (array)($m['tokens'] ?? []);
        $keep = $stored[$t['k']] ?? null;
        // a party token that was never moved isn't stored yet
        if (!$keep) foreach (fi_party($c) as $char => $owner) if (mp_key($c['id'], 'pc', $char) === $t['k']) $keep = ['kind' => 'pc', 'char' => $char, 'size' => 'M'];
        $span = (MP_SIZES[$t['size']] ?? 1) * $m['grid']['s'];
        if ($placed) [$keep['x'], $keep['y']] = mp_clamp($m, $span, $body['x'], $body['y']);
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
    if (!$dm && !(in_array($op, ['draw', 'drawdel'], true) && $onTable)) { // players draw on the map on the table, and erase their own lines
        // a player may resize their own character's token on the map on the table, and nothing else about it
        $own = false;
        if ($op === 'token' && $onTable) foreach (fi_party($c) as $char => $owner) if ($owner === $sub && mp_key($c['id'], 'pc', $char) === (string)($body['k'] ?? '')) $own = true;
        if (!$own) return [403, ['error' => 'Only the DM can do that.'], []];
        $body = array_intersect_key($body, ['k' => 1, 'size' => 1]);
    }
    if ($op === 'activate') {
        if ($m['archived']) return [400, ['error' => 'Unarchive the map first.'], []];
        if (!mp_put(mp_root($accounts, $c['id']) . '/table.json', ['active' => $m['id']])) return [500, ['error' => "Couldn't put the map on the table."], []];
        $f = fi_read($accounts, $c['id']);
        mp_fight_sync($accounts, $c, $f, $f);
        return [200, ['active' => $m['id']], [[['type' => 'map'], null]]];
    }
    if ($op === 'hide') {
        if ($onTable && !mp_put(mp_root($accounts, $c['id']) . '/table.json', ['active' => null])) return [500, ['error' => "Couldn't hide the map."], []];
        return [200, ['active' => null], [[['type' => 'map'], null]]];
    }
    if ($op === 'opts') {
        $o = fi_opts($accounts, $c['id']);
        foreach (['fx', 'ac'] as $f) if (isset($body[$f])) $o[$f] = !empty($body[$f]);
        if (!mp_put(mp_root($accounts, $c['id']) . '/opts.json', $o)) return [500, ['error' => "Couldn't save that."], []];
        return [200, ['opts' => $o], [[['type' => 'map'], null], [['type' => 'fight'], null]]];
    }
    if ($op === 'fog' || $op === 'fogset') {
        if (!isset($m['fog'])) return [500, ['error' => "Couldn't save the fog."], []];
        $ops = [];
        foreach ($op === 'fog' ? [$body['add'] ?? null] : (is_array($body['ops'] ?? null) ? $body['ops'] : [null]) as $x) if (!($ops[] = mp_fog_op($x))) return [400, ['error' => "That isn't a fog change."], []];
        if ($op === 'fog') $ops = !empty($ops[0]['all']) ? ($ops[0]['on'] ? $ops : []) : [...$m['fog']['ops'], $ops[0]];
        $m['fog']['ops'] = $ops;
        $m['fog']['n']++;
        if (!mp_fog_render($accounts, $c['id'], $m) || !mp_write($accounts, $c['id'], $m)) return [500, ['error' => "Couldn't make the players' copy of the map."], []];
        return [200, ['n' => $m['fog']['n']], $all];
    }
    if ($op === 'copyhp') {
        $copy = ((array)($m['tokens'] ?? []))[(string)($body['k'] ?? '')]['copy'] ?? null;
        $hp = $copy ? fi_copy_hp($accounts, $c['id'], $copy, $body['hop'] ?? null) : null;
        if ($hp === null) return [400, ['error' => "That isn't a hit point change."], []];
        return [200, ['hp' => $hp], [[['type' => 'fight'], null], ...$all]];
    }
    if ($op === 'place' || $op === 'paste') {
        $toks = (array)($m['tokens'] ?? []);
        if (!is_numeric($body['x'] ?? null) || !is_numeric($body['y'] ?? null)) return [400, ['error' => 'Where to?'], []];
        $from = $op === 'paste' ? $toks[(string)($body['k'] ?? '')] ?? null : null;
        if ($op === 'paste' && ($from['kind'] ?? '') !== 'monster') return [400, ['error' => 'Only monsters can be pasted.'], []];
        $by = $from['by'] ?? $sub;
        $id = $from['mon'] ?? (string)($body['mon'] ?? '');
        $mon = fi_monster($accounts, $c, $id, $by);
        $old = !empty($from['copy']) ? fi_copies($accounts, $c['id'])[$from['copy']] ?? null : null;
        if (!$mon && !$old) return [400, ['error' => 'Save that monster to your account first (sign in on the Monster Sheet).'], []];
        $copy = bin2hex(random_bytes(6));
        $suffix = mp_suffix($toks, $id, mb_substr((string)($old['name'] ?? $mon['name'] ?? 'Monster'), 0, 80));
        $size = $from['size'] ?? mp_size_of($mon['race'] ?? '');
        $rec = ['mon' => $id, 'by' => $by, 'name' => mb_substr((string)($old['name'] ?? $mon['name'] ?? 'Monster'), 0, 80), 'suffix' => $suffix, 'hp' => $old['hp'] ?? fi_hp($mon['hp'] ?? [], ['k' => 'set', 'hp' => []]),
            'ac' => $old['ac'] ?? fi_int($body['ac'] ?? null), 'bonus' => $old['bonus'] ?? fi_int($body['bonus'] ?? 0) ?? 0];
        if (!fi_copies_change($accounts, $c['id'], function (&$all) use ($copy, $rec) { $all[$copy] = $rec; return true; })) return [500, ['error' => "Couldn't save the token."], []];
        [$x, $y] = mp_clamp($m, (MP_SIZES[$size] ?? 1) * $m['grid']['s'], $body['x'], $body['y']);
        $k = mp_key($c['id'], 'monster', "$by:$id:$copy");
        $toks[$k] = ['kind' => 'monster', 'mon' => $id, 'by' => $by, 'copy' => $copy, 'suffix' => $suffix, 'name' => $rec['name'], 'size' => $size, 'x' => $x, 'y' => $y, 'placed' => true]
            + array_intersect_key($from ?? [], ['cond' => 1, 'ring' => 1, 'noName' => 1, 'hidden' => 1]);
        $m['tokens'] = $toks;
        return mp_write($accounts, $c['id'], $m) ? [200, ['k' => $k], $all] : [500, ['error' => "Couldn't save the token."], []];
    }
    // Send to initiative (3.3): an encounter from the Monster Sheet joins this map's Combat Encounter as copies with their own HP.
    // Not placed, so players see nothing until the DM puts them on the map. A name that's already unique stays as it is, no letter.
    if ($op === 'send') {
        if (fi_read($accounts, $c['id'])) return [409, ['error' => 'A fight is running. Add them from the Monster Sheet.'], []];
        $toks = (array)($m['tokens'] ?? []);
        $mons = [];
        foreach (is_array($body['mons'] ?? null) ? $body['mons'] : [] as $x) {
            $mon = is_array($x) ? fi_monster($accounts, $c, (string)($x['mon'] ?? ''), $sub) : null;
            if (!$mon) return [400, ['error' => 'Save those monsters to your account first (sign in on the Monster Sheet).'], []];
            $mons[] = [$x, $mon, mb_substr((string)($mon['name'] ?? '') ?: 'Monster', 0, 80)];
        }
        if (!$mons) return [400, ['error' => 'There are no monsters to send.'], []];
        $taken = array_count_values(array_column($mons, 2));
        $copies = [];
        $enc = ($m['enc'] ?? []) + ['ids' => [], 'init' => [], 'side' => []];
        foreach ($mons as [$x, $mon, $name]) {
            $id = $mon['id'];
            $alone = $taken[$name] === 1 && !array_filter($toks, fn($t) => !empty($t['copy']) && ($t['name'] ?? null) === $name);
            $suffix = $alone ? '' : mp_suffix($toks, $id, $name);
            $copy = bin2hex(random_bytes(6));
            $copies[$copy] = ['mon' => $id, 'by' => $sub, 'name' => $name, 'suffix' => $suffix, 'hp' => fi_hp($mon['hp'] ?? [], ['k' => 'set', 'hp' => []]), 'ac' => fi_int($x['ac'] ?? null), 'bonus' => fi_int($x['bonus'] ?? 0) ?? 0];
            $k = mp_key($c['id'], 'monster', "$sub:$id:$copy");
            $toks[$k] = ['kind' => 'monster', 'mon' => $id, 'by' => $sub, 'copy' => $copy, 'suffix' => $suffix, 'name' => $name, 'size' => mp_size_of($mon['race'] ?? ''), 'x' => null, 'y' => null, 'placed' => false];
            $enc['ids'][] = $k;
            $enc['side'][$k] = 'enemy';
        }
        if (!fi_copies_change($accounts, $c['id'], function (&$all) use ($copies) { $all = $copies + $all; return true; })) return [500, ['error' => "Couldn't save the tokens."], []];
        $m['tokens'] = $toks;
        $m['enc'] = $enc;
        return mp_write($accounts, $c['id'], $m) ? [200, ['sent' => count($mons)], $all] : [500, ['error' => "Couldn't save the tokens."], []];
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
        $m['grid'] = $g; // the fog is freeform: it doesn't move with the squares
    } elseif ($op === 'draw') {
        if (!($d = mp_draw_of($body['add'] ?? null))) return [400, ['error' => "That isn't a drawing."], []];
        $d['id'] = bin2hex(random_bytes(6));
        $d['by'] = $sub;
        $m['draws'] = [...($m['draws'] ?? []), $d];
        return mp_write($accounts, $c['id'], $m) ? [200, ['id' => $d['id']], $all] : [500, ['error' => "Couldn't save the map."], []];
    } elseif ($op === 'drawdel') {
        $ids = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        $m['draws'] = array_values(array_filter($m['draws'] ?? [], fn($d) => !(in_array($d['id'] ?? null, $ids, true) && ($dm || ($d['by'] ?? null) === $sub))));
    } elseif ($op === 'drawset') {
        $list = [];
        foreach (is_array($body['draws'] ?? null) ? $body['draws'] : [null] as $x) if (!($list[] = mp_draw_of($x))) return [400, ['error' => "That isn't a drawing."], []];
        $m['draws'] = $list;
    } elseif ($op === 'overlay') {
        if (!($o = mp_overlay_of($body['o'] ?? null))) return [400, ['error' => "That isn't an overlay."], []];
        $list = array_values(array_filter($m['overlays'] ?? [], fn($x) => $x['id'] !== $o['id']));
        $list[] = $o;
        $m['overlays'] = $list;
    } elseif ($op === 'overlaydel') {
        $ids = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        $m['overlays'] = array_values(array_filter($m['overlays'] ?? [], fn($x) => !in_array($x['id'], $ids, true)));
    } elseif ($op === 'enc') {
        $in = is_array($body['enc'] ?? null) ? $body['enc'] : [];
        $have = array_column(mp_tokens($accounts, $c, $m, fi_read($accounts, $c['id'])), 'k');
        $ids = is_array($in['ids'] ?? null) ? array_values(array_unique(array_filter($in['ids'], 'is_string'))) : [];
        if (array_diff($ids, $have)) return [400, ['error' => "That token isn't on this map any more."], []];
        $enc = ['ids' => $ids, 'init' => [], 'side' => []];
        foreach ($ids as $k) {
            if (($n = fi_int($in['init'][$k] ?? null)) !== null) $enc['init'][$k] = $n;
            if (in_array($in['side'][$k] ?? null, ['party', 'enemy'], true)) $enc['side'][$k] = $in['side'][$k];
        }
        $m['enc'] = $enc;
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
            if (isset($body['ring'])) {
                if ($body['ring'] !== '' && !preg_match('/^#[0-9a-f]{6}$/i', (string)$body['ring'])) return [400, ['error' => 'Pick a ring colour.'], []];
                $toks[$k]['ring'] = $body['ring'];
            }
            foreach (['noName', 'locked'] as $f) if (isset($body[$f])) $toks[$k][$f] = !empty($body[$f]);
            if (isset($body['group'])) {
                if ($body['group'] !== '' && !preg_match('/^[\w-]{1,40}$/', (string)$body['group'])) return [400, ['error' => "That isn't a group."], []];
                $toks[$k]['group'] = $body['group'];
            }
            if (isset($body['cond'])) {
                if ($toks[$k]['kind'] === 'pc' || !is_array($body['cond'])) return [400, ['error' => "A character's conditions are on their sheet."], []];
                $toks[$k]['cond'] = array_values(array_slice(array_map(fn($x) => mb_substr(trim($x), 0, 40), array_filter($body['cond'], fn($x) => is_string($x) && trim($x) !== '')), 0, 20));
            }
            if (isset($body['name'])) {
                if ($toks[$k]['kind'] === 'pc') return [400, ['error' => "A character's name is on their sheet."], []];
                $name = $body['name'] === '' ? '' : cp_clean_name($body['name']);
                if ($name === null) return [400, ['error' => 'Give the token a name.'], []];
                $copy = $toks[$k]['copy'] ?? null;
                if ($copy && $name !== '') fi_copies_change($accounts, $c['id'], function (&$all) use ($copy, $name) { if (!isset($all[$copy])) return null; $all[$copy]['name'] = $name; return true; });
                elseif (!$copy) { if ($name === '') unset($toks[$k]['rename']); else $toks[$k]['rename'] = $name; }
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
