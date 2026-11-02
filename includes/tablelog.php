<?php
// A campaign's table log (ROADMAP 1.3): every roll shared from a sheet. While the DM runs session <n> rolls go to
// <accounts>/campaigns/<id>/sessions/<n>.json, otherwise to sessions/unsorted.json: {"started", "ended", "entries": [...]}.
// An entry: {"id", "at" (when it was rolled, ms), "sub", "dm" (rolled by the DM), "name", "char", "title", "expr", "shown",
// "total", "nat" ("20", "1" or ""), "vis", "offline"}. vis: "public", "hidden" (a DM roll players see only as "DM rolled")
// or "dm" (a player's roll only they and the DM see). tl_view() alone decides what a player gets, for the log page and
// for what the relay sends, so a hidden result or a whisper never reaches anyone it isn't for.
require_once __DIR__ . '/campaigns.php';

function tl_dir($accounts, $id)
{
    return "$accounts/campaigns/$id/sessions";
}

// the log rolls go to now
function tl_name($c)
{
    return isset($c['session']['n']) ? (string)$c['session']['n'] : 'unsorted';
}

function tl_read($accounts, $id, $name)
{
    if (!preg_match('/^(\d{1,6}|unsorted)$/', (string)$name)) return null;
    return ch_json(tl_dir($accounts, $id) . "/$name.json");
}

function tl_write($accounts, $id, $name, $log)
{
    $dir = tl_dir($accounts, $id);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return false;
    $tmp = "$dir/.$name.json." . getmypid();
    return @file_put_contents($tmp, json_encode($log, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== false && @rename($tmp, "$dir/$name.json");
}

// [{n, started, ended, count}] of the finished and running sessions, newest first
function tl_sessions($accounts, $id)
{
    $out = [];
    foreach (glob(tl_dir($accounts, $id) . '/*.json') ?: [] as $f) {
        $n = basename($f, '.json');
        if (!ctype_digit($n) || !($log = ch_json($f))) continue;
        $out[] = ['n' => (int)$n, 'started' => $log['started'] ?? null, 'ended' => $log['ended'] ?? null, 'count' => count($log['entries'] ?? [])];
    }
    usort($out, fn($a, $b) => $b['n'] <=> $a['n']);
    return $out;
}

// what $sub may see of an entry, or null for nothing. "mine" marks their own rolls; nobody's Google id goes out.
function tl_view($c, $sub, $e)
{
    $mine = ($e['sub'] ?? null) === $sub;
    $out = ['mine' => $mine] + array_diff_key($e, ['sub' => 1]);
    if ($c['dm'] === $sub || $mine || ($e['vis'] ?? '') === 'public') return $out;
    if (($e['vis'] ?? '') === 'hidden') return ['id' => $e['id'], 'at' => $e['at'], 'dm' => true, 'name' => $e['name'], 'vis' => 'hidden', 'mine' => false];
    return null; // a whisper to the DM
}

// the last $n entries $sub may see, oldest first
function tl_tail($c, $sub, $log, $n = 200)
{
    $out = [];
    foreach (array_reverse($log['entries'] ?? []) as $e) {
        if (($v = tl_view($c, $sub, $e)) !== null) $out[] = $v;
        if (count($out) >= $n) break;
    }
    return array_reverse($out);
}

function tl_str($v, $max)
{
    return mb_substr(trim(is_scalar($v) ? (string)$v : ''), 0, $max);
}

// a roll from a sheet: [http code, response]. The caller holds cp_lock() and has checked $user is in $c.
function tl_add($accounts, $c, $user, $roll)
{
    if (!is_array($roll) || !preg_match('/^[\w-]{8,40}$/', (string)($roll['id'] ?? ''))) return [400, ['error' => "That isn't a roll."]];
    $sub = $user['sub'];
    $dm = $c['dm'] === $sub;
    $vis = $roll['vis'] ?? 'public';
    if (!in_array($vis, $dm ? ['public', 'hidden'] : ['public', 'dm'], true)) return [400, ['error' => "That isn't a way to share a roll."]];
    // a character must be one of this player's in the campaign; its name comes from its save, not from the roll
    $char = (string)($roll['char'] ?? '');
    $name = null;
    if ($char !== '') {
        $mine = $c['members'][cp_member($c, $sub)]['characters'] ?? [];
        if (!in_array($char, array_column($mine, 'id'), true)) return [403, ['error' => "That character isn't yours in this campaign."]];
        $name = (string)(ch_json("$accounts/characters/$char/character.json")['name'] ?? '');
    }
    elseif (!$dm) return [400, ['error' => 'Say which character rolled.']];
    else $name = tl_str($roll['name'] ?? '', 80); // the DM's monsters
    $name = trim((string)$name) !== '' ? mb_substr(trim($name), 0, 80) : ($dm && $char === '' ? 'DM' : 'Unnamed character');
    $now = (int)round(microtime(true) * 1000);
    $at = is_numeric($roll['at'] ?? null) ? (int)$roll['at'] : $now;
    $e = ['id' => $roll['id'], 'at' => min($at, $now), 'sub' => $sub, 'dm' => $dm, 'name' => $name, 'char' => $char,
        'title' => tl_str($roll['title'] ?? '', 200), 'expr' => tl_str($roll['expr'] ?? '', 200), 'shown' => tl_str($roll['shown'] ?? '', 500),
        'total' => tl_str($roll['total'] ?? '', 100), 'nat' => in_array($roll['nat'] ?? '', ['20', '1'], true) ? $roll['nat'] : '',
        'vis' => $vis, 'offline' => !empty($roll['offline'])];
    $file = tl_name($c);
    $log = tl_read($accounts, $c['id'], $file) ?? ['started' => null, 'ended' => null, 'entries' => []];
    foreach ($log['entries'] as $have) if ($have['id'] === $e['id']) return [200, ['entry' => $have, 'again' => true]]; // a resend
    $log['entries'][] = $e;
    // an offline roll sent later still sits where it was rolled in time
    usort($log['entries'], fn($a, $b) => $a['at'] <=> $b['at']);
    return tl_write($accounts, $c['id'], $file, $log) ? [200, ['entry' => $e]] : [500, ['error' => "Couldn't save the roll."]];
}

// the DM starts or ends a session: [http code, response, campaign]. The caller holds cp_lock().
function tl_session($accounts, $c, $start)
{
    if ($start) {
        if (isset($c['session']['n'])) return [400, ['error' => 'A session is already running.']];
        $n = ($s = tl_sessions($accounts, $c['id'])) ? $s[0]['n'] + 1 : 1;
        $c['session'] = ['n' => $n, 'started' => time()];
        if (!tl_write($accounts, $c['id'], (string)$n, ['started' => time(), 'ended' => null, 'entries' => []])) return [500, ['error' => "Couldn't start the session."], $c];
    } else {
        if (!isset($c['session']['n'])) return [400, ['error' => 'No session is running.']];
        $n = (string)$c['session']['n'];
        $log = tl_read($accounts, $c['id'], $n) ?? ['started' => $c['session']['started'], 'entries' => []];
        $log['ended'] = time();
        if (!tl_write($accounts, $c['id'], $n, $log)) return [500, ['error' => "Couldn't end the session."], $c];
        $c['session'] = null;
    }
    return cp_put($accounts, $c) ? [200, ['session' => $c['session']], $c] : [500, ['error' => "Couldn't save the campaign."], $c];
}
