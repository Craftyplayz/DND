<?php
// The action log (ROADMAP "Stats data"): what happens in play, kept for a stats page to add up later. Nothing reads it yet and
// no page serves it, so hidden monsters and HP can't leak; whatever serves it later must apply the same rules as fi_view and tl_view.
//   <accounts>/stats/characters/<character id>/<YYYY-MM>.jsonl    what happened on a character's sheet (sheets/player/stats.php)
//   <accounts>/stats/campaigns/<campaign id>/<YYYY-MM>.jsonl      turns, monster HP, map moves (written here on the server)
// One JSON object per line, only ever appended, so a crash can't harm what's there. A resend can repeat a line: "id" is the key.
require_once __DIR__ . '/tablelog.php';

const ST_TYPES = ['hp', 'death', 'insp', 'exh', 'cond', 'level', 'use', 'coin', 'item', 'rest', 'roll'];
const ST_FIELDS = ['d', 'td', 'cur', 'temp', 'max', 'dok', 'dbad', 'ok', 'bad', 'on', 'now', 'name', 'what', 'lvl', 'coin', 'cat', 'qty', 'kind', 'title', 'expr', 'shown', 'total', 'nat', 'by', 'why', 'undo', 'asked'];

function st_now()
{
    return (int)round(microtime(true) * 1000);
}

// one line. false: it couldn't be written (the caller of st_take retries; a server action carries on without its line)
function st_add($accounts, $kind, $id, $rec)
{
    if (!in_array($kind, ['characters', 'campaigns'], true) || !ch_ok_id($id)) return false;
    $dir = "$accounts/stats/$kind/$id";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return false;
    $rec['at'] ??= st_now();
    $rec['id'] ??= bin2hex(random_bytes(8));
    $file = "$dir/" . gmdate('Y-m', (int)($rec['at'] / 1000)) . '.jsonl';
    return @file_put_contents($file, json_encode($rec, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX) !== false;
}

// a time from a browser, put right by how far off its clock was when it sent ($sent: its clock then), never in the future
function st_time($at, $sent)
{
    $now = st_now();
    if (!is_numeric($at)) return $now;
    return min((int)$at + (is_numeric($sent) ? $now - (int)$sent : 0), $now);
}

// what a player's browser sent, cut to known fields: never trusted beyond that
function st_clean($e)
{
    if (!is_array($e) || !in_array($e['t'] ?? null, ST_TYPES, true) || !preg_match('/^[\w-]{8,40}$/', (string)($e['id'] ?? ''))) return null;
    $out = ['t' => $e['t'], 'id' => $e['id']];
    foreach (ST_FIELDS as $k) {
        if (!array_key_exists($k, $e) || !is_scalar($e[$k])) continue;
        $out[$k] = is_string($e[$k]) ? tl_str($e[$k], $k === 'shown' ? 500 : 200) : $e[$k];
    }
    if ($e['t'] === 'roll' && ($dice = tl_dice($e['dice'] ?? null))) $out['dice'] = $dice;
    return $out;
}

// a batch from a sheet: [http code, response]. "wait": ids of actions for a character not in the account yet (it may be on its
// way up); the browser keeps those. An action for someone else's character is dropped.
function st_take($accounts, $sub, $body)
{
    $events = $body['events'] ?? null;
    if (!is_array($events) || count($events) > 500) return [400, ['error' => "That isn't a list of actions."]];
    $wait = [];
    $camps = null;
    $in = [];
    foreach ($events as $raw) {
        $e = st_clean($raw);
        $char = (string)($raw['char'] ?? '');
        if (!$e || !ch_ok_id($char)) continue;
        $meta = ch_meta($accounts, $char);
        if (!$meta) { $wait[] = $e['id']; continue; }
        if (($meta['owner'] ?? null) !== $sub) continue;
        if (!isset($in[$char])) {
            $camps ??= cp_all($accounts);
            $in[$char] = array_values(array_map(fn($c) => $c['id'], array_filter($camps, fn($c) => cp_has_char($c, $char))));
        }
        // srv: not this browser's clock (a DM edit's time, from the server), so its error has no say in it
        $e['at'] = st_time($raw['at'] ?? null, empty($raw['srv']) ? ($body['now'] ?? null) : null);
        if ($in[$char]) $e['c'] = $in[$char];
        if ($e['t'] === 'roll' && isset($e['dice'])) { $set = tl_dice_set($accounts, $sub, $char); if ($k = $set['set']['key'] ?? null) $e['set'] = (string)$k; }
        if (!st_add($accounts, 'characters', $char, $e)) return [500, ['error' => "Couldn't save the actions."]];
    }
    return [200, ['wait' => $wait]];
}

// the fight's turn moved to someone else: one line. The turn guess reads these (ROADMAP "Stats data")
function st_turn($accounts, $c, $before, $after)
{
    if (!$after || ($after['phase'] ?? '') !== 'running' || !($after['turn'] ?? null)) return;
    if ($before && ($before['n'] ?? 0) === $after['n'] && ($before['turn'] ?? null) === $after['turn'] && ($before['round'] ?? 0) === $after['round']) return;
    foreach ($after['entries'] as $e) {
        if ($e['id'] !== $after['turn']) continue;
        $name = $e['kind'] === 'pc' ? (cp_card($accounts, $e['char'])['name'] ?? '') : ($e['name'] ?? '');
        st_add($accounts, 'campaigns', $c['id'], array_filter(['t' => 'turn', 'fight' => $after['n'], 'round' => $after['round'], 'e' => $e['id'], 'kind' => $e['kind'], 'name' => $name,
            'char' => $e['char'] ?? null, 'mon' => $e['mon'] ?? null, 'copy' => $e['copy'] ?? null, 'hidden' => !empty($e['hidden']) ?: null], fn($v) => $v !== null));
        return;
    }
}

// a monster's HP changed: one line in that campaign's log. $m: its save (for what it is), $e: its fight entry, if it's in the fight
function st_mhp($accounts, $cid, $fight, $e, $m, $name, $was, $hp, $op, $at = null)
{
    $n = fn($h, $k) => is_numeric($h[$k] ?? null) ? +$h[$k] : 0;
    return st_add($accounts, 'campaigns', $cid, array_filter(['t' => 'mhp', 'at' => $at, 'fight' => $fight, 'e' => $e['id'] ?? null, 'mon' => $m['id'] ?? ($e['mon'] ?? null), 'copy' => $e['copy'] ?? null,
        'name' => mb_substr((string)$name, 0, 80), 'cr' => $m['cr'] ?? null, 'xp' => $m['xp'] ?? null, 'race' => $m['race'] ?? null, 'cmp' => $m['cmp'] ?? null, 'ac' => $e['ac'] ?? null,
        'k' => $op['k'] ?? 'set', 'n' => is_numeric($op['n'] ?? null) ? +$op['n'] : null,
        'cur0' => $n($was, 'cur'), 'temp0' => $n($was, 'temp'), 'cur' => $n($hp, 'cur'), 'temp' => $n($hp, 'temp'), 'max' => $n($hp, 'base') + $n($hp, 'mod')], fn($v) => $v !== null && $v !== ''));
}
