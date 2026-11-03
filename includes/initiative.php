<?php
// A campaign's initiative tracker (ROADMAP 1.4): the current fight is <accounts>/campaigns/<id>/initiative.json, and
// "End fight" moves it to campaigns/<id>/fights/<n>.json (nothing is deleted). The DM runs it from the Monster Sheet;
// players' initiative rolls on their sheets add them (fi_roll). fi_view() alone decides what each person gets, for
// campaigns/fight.php and so for every page: players never receive hidden entries, numbers or monster HP.
//   {"n", "v" (bumped by every DM change; a DM change sent with an older v is refused), "phase": "rolling" | "running",
//    "round", "turn" (entry id), "started" (ms), "startedAt" (ms, "Start round 1": the timer), "out": [character ids the
//    DM took out, whose rolls are ignored], "entries": [...in turn order]}
// An entry: {"id", "kind": "pc" | "monster" | "plain", "char" | "mon" | "name", "init" (null until rolled), "bonus",
//   "tie" (a silent d20 roll-off between equal init and bonus), "secret" (rolled hidden or to the DM), "hidden" (monsters),
//   "name" (monsters: the last name seen, kept if the monster goes), "ac" (monsters, from the Monster Sheet)}
// Monster HP is never kept here: it's read from the monster save of whoever added it, "by" (the DM or a co-DM;
// <accounts>/monsters/<by>/<id>.json; entries from before co-DMs have no "by" and use the DM's).
require_once __DIR__ . '/tablelog.php';

function fi_file($accounts, $id)
{
    return "$accounts/campaigns/$id/initiative.json";
}

function fi_read($accounts, $id)
{
    return ch_json(fi_file($accounts, $id));
}

function fi_write($accounts, $id, $f)
{
    $file = fi_file($accounts, $id);
    $tmp = "$file." . getmypid();
    return @file_put_contents($tmp, json_encode($f, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== false && @rename($tmp, $file);
}

// $by: whose Monster Sheet it's saved in (the DM or a co-DM who added it; entries from before co-DMs have none: the DM)
function fi_monster($accounts, $c, $monId, $by = null)
{
    $by = is_string($by) && $by !== '' ? $by : $c['dm'];
    return ch_ok_id($monId) && !preg_match('#[/\\\\.]#', $by) ? ch_json("$accounts/monsters/$by/$monId.json") : null;
}

// the fight entry for monster $monId, or null (cloud.php's ?hp=&c=: a co-DM changing the HP of the DM's monster)
function fi_entry_mon($accounts, $c, $monId)
{
    foreach (fi_read($accounts, $c['id'])['entries'] ?? [] as $e) if (($e['mon'] ?? null) === $monId) return $e;
    return null;
}

function fi_num($v)
{
    return is_numeric($v) ? $v + 0 : 0;
}

// HP as players see it: current HP against the sheet's max (base + change), temp HP left out
function fi_status($hp)
{
    $cur = fi_num($hp['cur'] ?? 0);
    $max = fi_num($hp['base'] ?? 0) + fi_num($hp['mod'] ?? 0);
    return $cur <= 0 ? 'down' : ($cur <= $max / 2 ? 'bloodied' : 'healthy');
}

// one HP change on a monster's {cur, base, temp, mod}, as the Monster Sheet's own buttons do it:
//   {k: "dmg", n}: temp HP soaks it first, never below 0    {k: "heal", n}: up to the max    {k: "temp", n}: temp HP doesn't stack
//   {k: "set", hp: {cur?, base?, temp?, mod?}}: typed numbers
function fi_hp($hp, $op)
{
    $num = fn($v) => is_numeric($v) ? $v + 0 : 0;
    $hp = array_map($num, ['cur' => $hp['cur'] ?? 0, 'base' => $hp['base'] ?? 0, 'temp' => $hp['temp'] ?? 0, 'mod' => $hp['mod'] ?? 0]);
    $n = abs($num($op['n'] ?? 0));
    $k = $op['k'] ?? '';
    if ($k === 'dmg') {
        $soak = min($hp['temp'], $n);
        $hp['temp'] -= $soak;
        $hp['cur'] = max(0, $hp['cur'] - ($n - $soak));
    } elseif ($k === 'heal') $hp['cur'] = min($hp['base'] + $hp['mod'], $hp['cur'] + $n);
    elseif ($k === 'temp') $hp['temp'] = max($hp['temp'], $n);
    elseif ($k === 'set' && is_array($op['hp'] ?? null)) {
        foreach (['cur', 'base', 'temp', 'mod'] as $f) if (array_key_exists($f, $op['hp'])) $hp[$f] = $num($op['hp'][$f]);
    } else return null;
    return $hp;
}

// a monster at 0 HP or less has no turn
function fi_down($accounts, $c, $e)
{
    if ($e['kind'] !== 'monster') return false;
    $m = fi_monster($accounts, $c, $e['mon'], $e['by'] ?? null);
    return $m && fi_status($m['hp'] ?? []) === 'down';
}

// turn order: higher init, then higher bonus, then the silent roll-off; not yet rolled goes last
function fi_cmp($a, $b)
{
    $k = fn($e) => [$e['init'] === null ? PHP_INT_MIN : $e['init'], $e['bonus'] ?? 0, $e['tie'] ?? 0];
    return $k($b) <=> $k($a);
}

// put $e where its number says, leaving every other entry (and the DM's own moves) where it was
function fi_place(&$f, $e)
{
    $f['entries'] = array_values(array_filter($f['entries'], fn($x) => $x['id'] !== $e['id']));
    if ($e['init'] !== null) {
        $tied = fn($t) => count(array_filter($f['entries'], fn($x) => $x['init'] === $e['init'] && ($x['bonus'] ?? 0) === ($e['bonus'] ?? 0) && ($x['tie'] ?? 0) === $t));
        for ($i = 0, $e['tie'] = random_int(1, 20); $tied($e['tie']) && $i < 100; $i++) $e['tie'] = random_int(1, 20);
    }
    $at = count($f['entries']);
    foreach ($f['entries'] as $i => $x) if (fi_cmp($e, $x) < 0) { $at = $i; break; }
    array_splice($f['entries'], $at, 0, [$e]);
}

function fi_index($f, $id)
{
    foreach ($f['entries'] as $i => $e) if ($e['id'] === $id) return $i;
    return -1;
}

// the entry after $from (an index) that gets a turn, wrapping into the next round: [index, wrapped] or null
function fi_after($accounts, $c, $f, $from, $dir = 1)
{
    $n = count($f['entries']);
    for ($k = 1; $k <= $n; $k++) {
        $i = $from + $dir * $k;
        $wrap = $i >= $n || $i < 0;
        $i = (($i % $n) + $n) % $n;
        if (!fi_down($accounts, $c, $f['entries'][$i])) return [$i, $wrap];
    }
    return null;
}

// Next (+1) or Previous (-1) turn
function fi_step($accounts, $c, &$f, $dir)
{
    $i = fi_index($f, (string)$f['turn']);
    $to = fi_after($accounts, $c, $f, $i < 0 ? -1 : $i, $dir);
    if (!$to) return;
    if ($to[1] && $dir < 0 && $f['round'] <= 1) return; // nothing before the first turn
    if ($to[1]) $f['round'] = max(1, $f['round'] + $dir);
    $f['turn'] = $f['entries'][$to[0]]['id'];
}

function fi_new_id($f)
{
    do $id = bin2hex(random_bytes(4)); while (fi_index($f, $id) >= 0);
    return $id;
}

// a line in the table log ("Fight started"): returns the entry, for the relay
function fi_log($accounts, $c, $title)
{
    $e = ['id' => 'fight-' . bin2hex(random_bytes(6)), 'at' => (int)round(microtime(true) * 1000), 'sub' => $c['dm'], 'dm' => true, 'name' => 'DM', 'char' => '',
        'title' => $title, 'expr' => '', 'shown' => '', 'total' => '', 'nat' => '', 'vis' => 'public', 'offline' => false];
    $file = tl_name($c);
    $log = tl_read($accounts, $c['id'], $file) ?? ['started' => null, 'ended' => null, 'entries' => []];
    $log['entries'][] = $e;
    return tl_write($accounts, $c['id'], $file, $log) ? $e : null;
}

// the characters attached to the campaign: id => owner sub
function fi_party($c)
{
    $out = [];
    foreach ($c['members'] as $m) foreach ($m['characters'] ?? [] as $l) $out[$l['id'] ?? ''] = $m['sub'];
    return $out;
}

function fi_int($v)
{
    return is_numeric($v) ? (int)round((float)$v) : null;
}

// One DM change: [http code, response, log entries to publish]. The caller holds cp_lock() and checked it's the DM or a
// co-DM ($sub: whose Monster Sheet added monsters come from; the DM when left out).
//   {op: "start"} | {op: "end"} | {op: "round1"} | {op: "next"} | {op: "prev"}
//   {op: "add", items: [{kind: "pc", char} | {kind: "monster", mon, init, bonus, ac} | {kind: "plain", name, init}]}
//   {op: "remove" | "init" | "move" | "hide", e: entry id, value | dir | on}
// Every op but "start" carries v, the fight the DM was looking at.
function fi_op($accounts, $c, $body, $sub = null)
{
    $sub = $sub ?? $c['dm'];
    $op = (string)($body['op'] ?? '');
    $f = fi_read($accounts, $c['id']);
    $logs = [];
    if ($op === 'start') {
        if ($f) return [409, ['error' => 'A fight is already running.', 'stale' => true], []];
        $n = 0;
        foreach (glob("$accounts/campaigns/{$c['id']}/fights/*.json") ?: [] as $x) $n = max($n, (int)basename($x, '.json'));
        $f = ['n' => $n + 1, 'v' => 0, 'phase' => 'rolling', 'round' => 0, 'turn' => null, 'started' => (int)round(microtime(true) * 1000), 'startedAt' => null, 'out' => [], 'entries' => []];
        if ($e = fi_log($accounts, $c, 'Fight started')) $logs[] = $e;
    } else {
        if (!$f) return [409, ['error' => 'This fight changed, reloaded.', 'stale' => true], []];
        if (($body['v'] ?? null) !== $f['v']) return [409, ['error' => 'This fight changed, reloaded.', 'stale' => true], []];
    }
    $at = isset($body['e']) ? fi_index($f, (string)$body['e']) : -1;
    if (in_array($op, ['remove', 'init', 'move', 'hide'], true) && $at < 0) return [404, ['error' => "That isn't in the fight any more."], []];
    if ($op === 'end') {
        $dir = "$accounts/campaigns/{$c['id']}/fights";
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't end the fight."], []];
        $f['ended'] = (int)round(microtime(true) * 1000);
        if (!fi_write($accounts, $c['id'], $f) || !@rename(fi_file($accounts, $c['id']), "$dir/{$f['n']}.json")) return [500, ['error' => "Couldn't end the fight."], []];
        if ($e = fi_log($accounts, $c, 'Fight ended')) $logs[] = $e;
        return [200, ['ended' => $f['n']], $logs];
    }
    if ($op === 'round1') {
        if ($f['phase'] !== 'rolling') return [400, ['error' => 'Round 1 has started.'], []];
        if (!$f['entries']) return [400, ['error' => 'Nobody is in the fight yet.'], []];
        $f['phase'] = 'running';
        $f['round'] = 1;
        $f['startedAt'] = (int)round(microtime(true) * 1000);
        $first = fi_after($accounts, $c, $f, -1);
        $f['turn'] = $f['entries'][$first ? $first[0] : 0]['id'];
    } elseif ($op === 'next' || $op === 'prev') {
        if ($f['phase'] !== 'running') return [400, ['error' => 'Start round 1 first.'], []];
        fi_step($accounts, $c, $f, $op === 'next' ? 1 : -1);
    } elseif ($op === 'add') {
        $party = fi_party($c);
        foreach (is_array($body['items'] ?? null) ? $body['items'] : [] as $it) {
            $kind = $it['kind'] ?? '';
            if ($kind === 'pc') {
                $id = (string)($it['char'] ?? '');
                if (!isset($party[$id])) return [400, ['error' => "That character isn't in this campaign."], []];
                $f['out'] = array_values(array_diff($f['out'], [$id]));
                foreach ($f['entries'] as $x) if (($x['char'] ?? null) === $id) continue 2;
                fi_place($f, ['id' => fi_new_id($f), 'kind' => 'pc', 'char' => $id, 'init' => fi_int($it['init'] ?? null), 'bonus' => 0, 'tie' => 0, 'secret' => false, 'hidden' => false]);
            } elseif ($kind === 'monster') {
                $m = fi_monster($accounts, $c, (string)($it['mon'] ?? ''), $sub);
                if (!$m) return [400, ['error' => 'Save that monster to your account first (sign in on the Monster Sheet).'], []];
                foreach ($f['entries'] as $x) if (($x['mon'] ?? null) === $m['id']) continue 2;
                fi_place($f, ['id' => fi_new_id($f), 'kind' => 'monster', 'mon' => $m['id'], 'by' => $sub,'name' => mb_substr((string)($m['name'] ?? ''), 0, 80), 'init' => fi_int($it['init'] ?? null),
                    'bonus' => fi_int($it['bonus'] ?? 0) ?? 0, 'tie' => 0, 'secret' => true, 'hidden' => false, 'ac' => fi_int($it['ac'] ?? null)]);
            } elseif ($kind === 'plain') {
                $name = cp_clean_name($it['name'] ?? '');
                if ($name === null) return [400, ['error' => 'Give the entry a name.'], []];
                fi_place($f, ['id' => fi_new_id($f), 'kind' => 'plain', 'name' => $name, 'init' => fi_int($it['init'] ?? null), 'bonus' => 0, 'tie' => 0, 'secret' => false, 'hidden' => false]);
            } else return [400, ['error' => "That can't go in a fight."], []];
        }
    } elseif ($op === 'remove') {
        $e = $f['entries'][$at];
        if ($f['turn'] === $e['id']) {
            fi_step($accounts, $c, $f, 1);
            if ($f['turn'] === $e['id']) $f['turn'] = null; // it was the only one
        }
        array_splice($f['entries'], $at, 1);
        if ($e['kind'] === 'pc') $f['out'] = array_values(array_unique([...$f['out'], $e['char']]));
    } elseif ($op === 'init') {
        $e = $f['entries'][$at];
        $e['init'] = fi_int($body['value'] ?? null);
        fi_place($f, $e);
    } elseif ($op === 'move') {
        $to = $at + (($body['dir'] ?? 0) < 0 ? -1 : 1);
        if ($to < 0 || $to >= count($f['entries'])) return [400, ['error' => "It can't move further."], []];
        [$f['entries'][$at], $f['entries'][$to]] = [$f['entries'][$to], $f['entries'][$at]];
    } elseif ($op === 'hide') {
        if ($f['entries'][$at]['kind'] !== 'monster') return [400, ['error' => 'Only monsters can be hidden.'], []];
        $f['entries'][$at]['hidden'] = !empty($body['on']);
    } elseif ($op !== 'start') return [400, ['error' => 'Unknown fight change.'], []];
    $f['v']++;
    return fi_write($accounts, $c['id'], $f) ? [200, ['v' => $f['v']], $logs] : [500, ['error' => "Couldn't save the fight."], $logs];
}

// an initiative roll from a sheet joins the fight it was rolled in: true when the fight changed. The caller holds cp_lock().
// The roll says which fight ("fight": n; an offline roll that arrives after that fight ended stays in the log only) and,
// from the Monster Sheet, which monster ("mon"). A re-roll counts while rolling in; after round 1 only a first roll does.
function fi_roll($accounts, $c, $user, $roll)
{
    if (!preg_match('/^Initiative\b/', (string)($roll['title'] ?? ''))) return false;
    $f = fi_read($accounts, $c['id']);
    if (!$f || (int)($roll['fight'] ?? 0) !== $f['n'] || !is_numeric($roll['total'] ?? null)) return false;
    $dm = cp_is_dm($c, $user['sub']);
    $char = (string)($roll['char'] ?? '');
    if ($char !== '') {
        if ((fi_party($c)[$char] ?? null) !== $user['sub'] || in_array($char, $f['out'], true)) return false;
        $match = fn($x) => ($x['char'] ?? null) === $char;
        $new = ['kind' => 'pc', 'char' => $char, 'hidden' => false];
    } elseif ($dm && ($m = fi_monster($accounts, $c, (string)($roll['mon'] ?? ''), $user['sub']))) {
        $match = fn($x) => ($x['mon'] ?? null) === $m['id'];
        $new = ['kind' => 'monster', 'mon' => $m['id'], 'by' => $user['sub'], 'name' => mb_substr((string)($m['name'] ?? ''), 0, 80), 'hidden' => false, 'ac' => null];
    } else return false;
    $i = -1;
    foreach ($f['entries'] as $k => $x) if ($match($x)) $i = $k;
    if ($i >= 0 && $f['phase'] !== 'rolling' && $f['entries'][$i]['init'] !== null) return false;
    // the bonus is what the sheet added to the d20 ("1d20 + 3", "2d20 keep higher − 1")
    $bonus = preg_match('/([+\-−])\s*(\d+)\s*$/u', (string)($roll['expr'] ?? ''), $b) ? ($b[1] === '+' ? 1 : -1) * (int)$b[2] : 0;
    $e = ($i >= 0 ? $f['entries'][$i] : ['id' => fi_new_id($f)] + $new) + ['tie' => 0];
    $e = array_merge($e, ['init' => (int)$roll['total'], 'bonus' => $bonus, 'secret' => ($roll['vis'] ?? 'public') !== 'public']);
    fi_place($f, $e);
    return fi_write($accounts, $c['id'], $f);
}

// what $sub may see of the fight, or null when none runs. Players get no numbers, no hidden entries and monster HP
// only as healthy / bloodied / down; the DM gets everything, with player HP to read.
function fi_view($accounts, $c, $sub, $f = null)
{
    $f ??= fi_read($accounts, $c['id']);
    if (!$f) return null;
    $dm = cp_is_dm($c, $sub);
    $party = fi_party($c);
    $vis = [];
    foreach ($f['entries'] as $e) {
        if ($e['hidden'] && !$dm) continue;
        $o = ['id' => $e['id'], 'kind' => $e['kind']];
        if ($e['kind'] === 'pc') {
            $card = cp_card($accounts, $e['char']);
            $ch = $dm ? ch_json("$accounts/characters/{$e['char']}/character.json") : null;
            $o += ['name' => $card['name'] ?? 'Gone character', 'art' => fi_art($card['art'] ?? ''), 'mine' => ($party[$e['char']] ?? null) === $sub];
            if ($o['mine'] || $dm) $o['char'] = $e['char'];
            if ($dm && $ch) $o['hp'] = ['cur' => fi_num($ch['hp']['cur'] ?? 0), 'temp' => fi_num($ch['hp']['temp'] ?? 0)];
        } elseif ($e['kind'] === 'monster') {
            $m = fi_monster($accounts, $c, $e['mon'], $e['by'] ?? null);
            $o += ['name' => trim((string)($m['name'] ?? '')) !== '' ? mb_substr($m['name'], 0, 80) : ($e['name'] ?: 'Monster'),
                'art' => fi_art((string)($m['art'] ?? '')), 'status' => $m ? fi_status($m['hp'] ?? []) : 'healthy'];
            if ($dm) {
                $o += ['mon' => $e['mon'], 'hidden' => $e['hidden'], 'ac' => $e['ac'] ?? null, 'archived' => !empty($m['archived']), 'missing' => !$m];
                if ($m) $o['hp'] = ['cur' => fi_num($m['hp']['cur'] ?? 0), 'max' => fi_num($m['hp']['base'] ?? 0) + fi_num($m['hp']['mod'] ?? 0), 'temp' => fi_num($m['hp']['temp'] ?? 0)];
            }
        } else $o += ['name' => $e['name'], 'art' => ''];
        if ($dm) $o += ['init' => $e['init'], 'bonus' => $e['bonus'] ?? 0, 'secret' => !empty($e['secret'])];
        elseif (!empty($o['mine'])) $o['rolled'] = $e['init'] !== null;
        $vis[] = $o;
    }
    $shown = fn($id) => $id !== null && in_array($id, array_column($vis, 'id'), true) ? $id : null;
    $i = fi_index($f, (string)$f['turn']);
    $next = $f['phase'] === 'running' && $i >= 0 ? fi_after($accounts, $c, $f, $i) : null;
    $out = ['n' => $f['n'], 'v' => $f['v'], 'phase' => $f['phase'], 'round' => $f['round'], 'startedAt' => $f['startedAt'],
        'now' => (int)round(microtime(true) * 1000), 'turn' => $shown($f['turn']), 'next' => $next ? $shown($f['entries'][$next[0]]['id']) : null, 'entries' => $vis];
    // characters of this player that may still roll in (taken out by the DM: no)
    $in = array_column(array_filter($f['entries'], fn($e) => $e['kind'] === 'pc' && $e['init'] !== null), 'char');
    $out['canRoll'] = array_values(array_filter(array_keys($party, $sub, true), fn($id) => !in_array($id, $f['out'], true) && !in_array($id, $in, true)));
    if ($dm) {
        $here = array_column(array_filter($f['entries'], fn($e) => $e['kind'] === 'pc'), 'char');
        $out['party'] = [];
        foreach ($party as $id => $owner) if (!in_array($id, $here, true) && ($card = cp_card($accounts, $id))) $out['party'][] = ['char' => $id, 'name' => $card['name']];
    }
    return $out;
}

// shortcut: a portrait kept inline in a save goes out with every fight update, so big ones fall back to initials;
// ROADMAP 0.4 moved character art to files, monster art could follow
function fi_art($art)
{
    return strlen($art) <= 200000 && preg_match('#^(data:image/|https://|/sheets/player/art\.php\?)#', $art) ? $art : '';
}
