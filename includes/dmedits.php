<?php
// DM edits on player sheets (ROADMAP 1.5): the DM or a co-DM of a campaign a character is attached to changes it through
// small field-level edits (sheets/player/dmedit.js says what each one is; this file is the same rules in PHP). The DM never
// writes the player's character file: edits wait in a queue, the player's sheet applies them, and the player's own save
// carries them into character.json.
//   <accounts>/campaigns/<campaign id>/pending/<character id>.json
//     {"edits": [{...edit, "by": <DM's name>, "c": <campaign id>, "done": 0 | <time a save with it was written>}],
//      "notes": [{"id", "at", "edit", "who", "text"}]}   notes: what the DMs are told (conflicts, refusals, undos), until dismissed
// An edit stays "done" for a while (DM_DONE per queue) so an older copy of the character saved later gets it again; queues
// are read wherever they are (a campaign the character left, or one deleted, under campaigns/.deleted/), so an edit already
// sent always arrives. Used by sheets/player/dm.php, sheets/player/cloud.php, characters/index.php and includes/initiative.php.
require_once __DIR__ . '/campaigns.php';

// What a DM may change, by path pattern ("#" a row by id, "@" a skill or ability by name, "N" a list entry by position), mirrored
// from blank() and the ROW makers in sheets/player/sheet.js (dm-edits.mjs compares the two): v a number or text, b on/off,
// a an amount (set, or changed by adding), tags a list of words, rows a list of entries (add and remove), list a fixed list.
// Left out on purpose: the roll log, view settings, panel layout (order, shown, titles, tabs open), portrait, archive, stamps.
const DM_ROW = ['name' => 'v', 'time' => 'v', 'range' => 'v', 'props' => 'tags', 'mode' => 'v', 'hit' => 'v', 'save' => 'v', 'dc' => 'v',
    'dmg' => 'rows', 'dmg.N.dice' => 'v', 'dmg.N.type' => 'v', 'fx' => 'rows', 'fx.N.k' => 'v', 'fx.N.dice' => 'v', 'fx.N.type' => 'v', 'fx.N.text' => 'v',
    'uses' => 'v', 'used' => 'a', 'reset' => 'v', 'desc' => 'v',
    'lvl' => 'v', 'school' => 'v', 'trig' => 'v', 'comp' => 'v', 'dur' => 'v', 'conc' => 'b', 'ritual' => 'b', 'prep' => 'b', 'higher' => 'v', 'srd' => 'v',
    'cat' => 'v', 'eq' => 'b', 'att' => 'v', 'qty' => 'a', 'wt' => 'v', 'gp' => 'v', 'notes' => 'v', 'off' => 'b',
    'src' => 'v', 'text' => 'v', 'grp' => 'v',
    'kind' => 'v', 'cur' => 'a', 'max' => 'v', 'group' => 'v', 'extra' => 'a', 'levels' => 'rows', 'levels.N.label' => 'v', 'levels.N.max' => 'v', 'levels.N.used' => 'a', 'levels.N.extra' => 'a',
    'cost.amt' => 'v', 'cost.what' => 'v'];
define('DM_FIELDS', [
    'name' => 'v', 'race' => 'v', 'alignment' => 'v', 'age' => 'v', 'prof' => 'v', 'ac' => 'v', 'init' => 'v', 'insp' => 'b', 'exhaustion' => 'a',
    'condList' => 'v', 'conditions' => 'tags', 'res' => 'v', 'imm' => 'v', 'vul' => 'v', 'senses' => 'v',
    'hp.cur' => 'a', 'hp.base' => 'v', 'hp.temp' => 'a', 'hp.mod' => 'v',
    'classes' => 'rows', 'classes.N.name' => 'v', 'classes.N.level' => 'v', 'classes.N.die' => 'v', 'classes.N.hdUsed' => 'a',
    'abilities' => 'rows', 'abilities.@.key' => 'v', 'abilities.@.name' => 'v', 'abilities.@.score' => 'v', 'abilities.@.save' => 'b', 'abilities.@.sb' => 'v',
    'skills' => 'rows', 'skills.@.name' => 'v', 'skills.@.ab' => 'v', 'skills.@.p' => 'v', 'skills.@.b' => 'v',
    'speeds' => 'rows', 'speeds.N.type' => 'v', 'speeds.N.ft' => 'v', 'speeds.N.hover' => 'b',
    'passives' => 'rows', 'passives.N.name' => 'v', 'passives.N.f' => 'v', 'passives.N.unit' => 'v',
    'profs.armour' => 'tags', 'profs.weapons' => 'tags', 'profs.langs' => 'tags', 'profs.notes' => 'v',
    'profs.tools' => 'rows', 'profs.tools.N.name' => 'v', 'profs.tools.N.ab' => 'v', 'profs.tools.N.p' => 'v',
    'rulesVer' => 'v', 'weightOn' => 'b', 'capF' => 'v', 'coinsOn' => 'b', 'spellPts.on' => 'b', 'spellPts.used' => 'a', 'spellPts.pts' => 'list', 'spellPts.pts.N' => 'v', 'spellPts.cost' => 'list', 'spellPts.cost.N' => 'v',
    'lists.time' => 'v', 'lists.dmg' => 'v', 'lists.props' => 'v', 'lists.cats' => 'v', 'lists.speeds' => 'v',
    'panels.#.rows' => 'rows',
    'panels.#.coins.cp' => 'a', 'panels.#.coins.sp' => 'a', 'panels.#.coins.ep' => 'a', 'panels.#.coins.gp' => 'a', 'panels.#.coins.pp' => 'a', 'panels.#.attMax' => 'v',
    'panels.#.dc' => 'v', 'panels.#.atk' => 'v', 'panels.#.slots' => 'list', 'panels.#.slots.N.max' => 'v', 'panels.#.slots.N.used' => 'a', 'panels.#.slots.N.extra' => 'a',
    'panels.#.sp.cur' => 'a', 'panels.#.sp.max' => 'v', 'panels.#.sp.used' => 'a', 'panels.#.sp.extra' => 'a',
    'panels.#.meta' => 'rows', 'panels.#.meta.#.name' => 'v', 'panels.#.meta.#.cost' => 'v', 'panels.#.meta.#.desc' => 'v',
    'panels.#.flex' => 'list', 'panels.#.flex.N' => 'v', 'panels.#.text' => 'v', 'panels.#.ok' => 'a', 'panels.#.bad' => 'a',
    'panels.#.notes' => 'rows', 'panels.#.notes.#.title' => 'v', 'panels.#.notes.#.group' => 'v', 'panels.#.notes.#.body' => 'v', 'panels.#.notes.#.pinned' => 'b', 'panels.#.notes.#.archived' => 'v',
    'panels.#.tabs' => 'tags',
    // the Character details panel (4.2): DETAILS in sheets/player/model.js
] + array_fill_keys(array_map(fn($k) => "panels.#.f.$k", ['background', 'faith', 'lifestyle', 'gender', 'height', 'weight', 'size', 'skin', 'hair', 'eyes',
    'appearance', 'traits', 'ideals', 'bonds', 'flaws', 'allies', 'enemies', 'orgs', 'backstory']), 'v') + array_combine(array_map(fn($k) => "panels.#.rows.#.$k", array_keys(DM_ROW)), DM_ROW));
const DM_KEEP = 500; // applied edit ids a character remembers (dmedit.js KEEP)
const DM_DONE = 200; // confirmed edits kept per queue, for older copies saved later

function dm_now()
{
    return (int)round(microtime(true) * 1000);
}

// ---- paths ----
function dm_seg_ok($path)
{
    if (!is_array($path) || !$path || !array_is_list($path)) return false;
    foreach ($path as $s) if (!is_string($s) || $s === '') return false;
    return true;
}
function dm_pat($path)
{
    return implode('.', array_map(fn($s) => $s[0] === '#' ? '#' : ($s[0] === '@' ? '@' : (ctype_digit($s[0]) ? 'N' : $s)), $path));
}
function dm_type($path)
{
    return dm_seg_ok($path) ? (DM_FIELDS[dm_pat($path)] ?? null) : null;
}
// does any field start with $prefix (an object or a row inside one)?
function dm_prefix($prefix)
{
    foreach (DM_FIELDS as $k => $t) if (str_starts_with($k, $prefix)) return true;
    return false;
}
function dm_name($o)
{
    if (!is_object($o)) return '';
    foreach (['name', 'title', 'label', 'type', 'key'] as $k) if (isset($o->$k)) return is_bool($o->$k) ? ($o->$k ? 'true' : 'false') : (string)$o->$k;
    return '';
}
function dm_label($s)
{
    $p = strpos($s, ':');
    return $s[0] === '@' ? substr($s, 1) : ($p === false ? '' : substr($s, $p + 1));
}
function dm_find($list, $s)
{
    if ($s[0] === '#') {
        $id = explode(':', substr($s, 1), 2)[0];
        foreach ($list as $i => $o) if (is_object($o) && ($o->id ?? null) === $id) return $i;
        return -1;
    }
    if ($s[0] === '@') {
        $n = substr($s, 1);
        foreach ($list as $i => $o) if (is_object($o) && (property_exists($o, 'key') ? $o->key : ($o->name ?? null)) === $n) return $i;
        return -1;
    }
    $p = strpos($s, ':');
    $n = $p === false ? $s : substr($s, 0, $p);
    if (!ctype_digit($n) || (int)$n >= count($list)) return -1;
    return $p !== false && dm_name($list[(int)$n]) !== substr($s, $p + 1) ? -1 : (int)$n;
}

// ---- values ----
function dm_num($x)
{
    $v = is_numeric($x) ? (float)$x : (is_string($x) && preg_match('/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/', $x, $m) ? (float)$m[0] : 0.0);
    return is_finite($v) ? ($v == (int)$v && abs($v) < PHP_INT_MAX ? (int)$v : $v) : 0;
}
function dm_kind($v)
{
    return is_bool($v) ? 'b' : (is_int($v) || is_float($v) || is_string($v) ? 'v' : (is_array($v) ? 'l' : (is_object($v) ? 'o' : 'x')));
}
function dm_str($v)
{
    return $v === null ? '' : (is_bool($v) ? ($v ? 'true' : 'false') : (is_float($v) && $v == (int)$v ? (string)(int)$v : (string)$v));
}
function dm_same($a, $b)
{
    return in_array(dm_kind($a), ['l', 'o'], true) || in_array(dm_kind($b), ['l', 'o'], true) ? json_encode($a) === json_encode($b) : dm_str($a) === dm_str($b);
}
function dm_show($v)
{
    return $v === '' || $v === null ? 'blank' : (is_bool($v) ? ($v ? 'on' : 'off') : dm_str($v));
}

// is $v a valid value for field $p (a whole row, when $p is a list of rows)?
function dm_val_ok($p, $v)
{
    $t = DM_FIELDS[$p] ?? null;
    if ($t === 'v' || $t === 'a') return is_string($v) || is_int($v) || is_float($v);
    if ($t === 'b') return is_bool($v);
    if ($t === 'tags') return is_array($v) && array_is_list($v) && !array_filter($v, fn($x) => !is_string($x));
    if ($t === 'rows' || $t === 'list') {
        if (!is_array($v) || !array_is_list($v)) return false;
        foreach ($v as $x) if (is_object($x) ? !dm_row_ok($p, $x) : !dm_val_ok("$p.N", $x)) return false;
        return true;
    }
    if ($t === null && is_object($v) && dm_prefix("$p.")) {
        foreach ($v as $k => $x) if (!dm_val_ok("$p.$k", $x)) return false;
        return true;
    }
    return false;
}
// a row for the list $p: only fields the sheet knows, each the right kind (plus its id and note stamps)
function dm_row_ok($p, $row)
{
    if (!is_object($row)) return false;
    $m = 'N';
    foreach (['#', '@', 'N'] as $x) if (dm_prefix("$p.$x.")) { $m = $x; break; }
    foreach ($row as $k => $v) {
        if (in_array($k, ['id', 'created', 'updated'], true)) { if (!is_scalar($v)) return false; continue; }
        if (!dm_val_ok("$p.$m.$k", $v)) return false;
    }
    return true;
}

// what's wrong with an edit before it's queued, or null
function dm_check($e)
{
    if (!is_object($e) || !is_string($e->id ?? null) || !preg_match('/^[\w-]{8,40}$/', $e->id)) return "That isn't a DM edit.";
    if (!is_numeric($e->at ?? null) || !is_string($e->t ?? null) || mb_strlen($e->t) > 2000) return "That isn't a DM edit.";
    $op = $e->op ?? '';
    if ($op === 'hp') return in_array($e->how ?? '', ['dmg', 'heal', 'temp'], true) && is_numeric($e->amt ?? null) ? null : "That isn't a change to hit points.";
    if ($op === 'roll') {
        if (!is_object($e->roll ?? null)) return "That isn't a roll.";
        foreach ($e->roll as $v) if (!is_scalar($v)) return "That isn't a roll.";
        return null;
    }
    $path = $e->path ?? null;
    if (!dm_seg_ok($path)) return "The DM can't change that.";
    $t = dm_type($path);
    $ok = match ($op) {
        'set' => in_array($t, ['v', 'a'], true) ? dm_kind($e->value ?? null) === 'v' && dm_kind($e->was ?? null) === 'v'
            : ($t === 'b' && is_bool($e->value ?? null) && is_bool($e->was ?? null)),
        'add' => $t === 'a' && is_numeric($e->amt ?? null),
        'tag' => $t === 'tags' && is_string($e->value ?? null) && is_bool($e->on ?? null),
        'row' => $t === 'rows' && dm_row_ok(dm_pat($path), $e->row ?? null),
        'unrow' => count($path) > 1 && dm_type(array_slice($path, 0, -1)) === 'rows',
        default => false,
    };
    return $ok ? null : "The DM can't change that.";
}

// ---- applying (dmedit.js apply, for the server's copies: a save missing an edit, the fight tracker, the DM's checks) ----
// $c is the character decoded with json_decode($json) (objects, so {} stays {}). -> ['ok' => bool, 'why' => .., 'conflict' => bool]
function dm_apply(&$c, $e, $max)
{
    $no = fn($why, $conflict = false) => ['ok' => false, 'why' => $why, 'conflict' => $conflict];
    $yes = ['ok' => true, 'why' => '', 'conflict' => false];
    $op = $e->op ?? '';
    if ($op === 'roll') {
        if (!is_object($e->roll ?? null)) return $no("That isn't a roll");
        if (!is_array($c->rolls ?? null)) $c->rolls = [];
        array_unshift($c->rolls, json_decode(json_encode($e->roll)));
        $c->rolls = array_slice($c->rolls, 0, 100);
        return $yes;
    }
    if ($op === 'hp') {
        if (!is_object($c->hp ?? null)) return $no('This character has no hit points');
        $amt = abs(dm_num($e->amt ?? 0));
        $cur = dm_num($c->hp->cur ?? 0);
        $temp = dm_num($c->hp->temp ?? 0);
        if (($e->how ?? '') === 'dmg') {
            $soak = min($temp, $amt);
            $c->hp->temp = $temp - $soak;
            $c->hp->cur = max(0, $cur - ($amt - $soak));
        } elseif (($e->how ?? '') === 'temp') $c->hp->temp = max($temp, $amt);
        elseif (($e->how ?? '') === 'heal') $c->hp->cur = $max > 0 ? min($max, $cur + $amt) : $cur + $amt;
        else return $no("That isn't a change to hit points");
        return $yes;
    }
    $path = $e->path ?? null;
    if (!dm_seg_ok($path)) return $no("The DM can't change that");
    $p = dm_pat($path);
    $t = $op === 'unrow' ? (count($path) > 1 ? dm_type(array_slice($path, 0, -1)) : null) : dm_type($path);
    if ($t === null) return $no("The DM can't change that");
    $o = &$c;
    $n = count($path);
    for ($j = 0; $j < $n; $j++) {
        $s = $path[$j];
        if (is_array($o)) {
            $k = dm_find($o, $s);
            if ($k < 0) return $no((dm_label($s) ?: 'That') . ' was removed');
        } elseif (is_object($o) && (property_exists($o, $s) || ($j === $n - 1 && $t === 'a'))) $k = $s;
        else return $no('That part of the sheet is gone');
        if ($j === $n - 1) break;
        if (is_array($o)) $o = &$o[$k];
        else $o = &$o->$k;
    }
    if (is_array($o)) $ref = &$o[$k];
    else $ref = &$o->$k;
    $cur = $ref;
    if ($op === 'row') {
        if (!is_array($cur) || $t !== 'rows' || !is_object($e->row ?? null)) return $no("That isn't a row");
        $ref[] = json_decode(json_encode($e->row)); // a copy: the edit itself stays as it was sent
        return $yes;
    }
    if ($op === 'unrow') {
        if (!is_array($o) || !is_object($cur)) return $no("That isn't a row");
        if (property_exists($cur, 'body') && property_exists($cur, 'pinned')) { // notes are archived, never deleted
            if (empty($cur->archived)) $cur->archived = dm_num($e->at ?? 0) ?: dm_now();
            return $yes;
        }
        array_splice($o, $k, 1);
        return $yes;
    }
    if ($op === 'tag') {
        if (!is_array($cur) || array_filter($cur, fn($x) => !is_string($x)) || !is_string($e->value ?? null)) return $no("That isn't a list of words");
        $i = array_search($e->value, $cur, true);
        if (!empty($e->on) && $i === false) $ref[] = $e->value;
        elseif (empty($e->on) && $i !== false) array_splice($ref, $i, 1);
        return $yes;
    }
    if ($op === 'add') {
        if ($t !== 'a' || ($cur !== null && dm_kind($cur) !== 'v') || !is_numeric($e->amt ?? null)) return $no("That isn't an amount");
        $v = max(0, dm_num($cur) + dm_num($e->amt));
        if ($p === 'hp.cur' && $max > 0 && dm_num($e->amt) > 0) $v = min($v, max($max, dm_num($cur)));
        $ref = $v;
        return $yes;
    }
    if ($op === 'set') {
        if (!in_array(dm_kind($cur), ['v', 'b'], true) || dm_kind($e->value ?? null) !== dm_kind($cur)) return $no("That isn't the right kind of value");
        if (dm_same($cur, $e->value)) return $yes;
        if (!dm_same($cur, $e->was ?? null)) return $no('it was ' . dm_show($cur) . ' already', true);
        $ref = $e->value;
        return $yes;
    }
    return $no("That isn't a DM edit");
}

// dmedit.js run: once per edit id, not on an archived character, with "DM: <words>" in the roll log
function dm_run(&$c, $e, $max = null)
{
    if (!is_object($e) || !is_string($e->id ?? null)) return ['skip' => true];
    if (!is_array($c->dmApplied ?? null)) $c->dmApplied = [];
    if (in_array($e->id, $c->dmApplied, true)) return ['skip' => true];
    if (!empty($c->archived)) return ['wait' => true];
    $r = dm_apply($c, $e, $max ?? dm_num($c->calc->hpMax ?? 0));
    $c->dmApplied[] = $e->id;
    if (count($c->dmApplied) > DM_KEEP) $c->dmApplied = array_slice($c->dmApplied, -DM_KEEP);
    if ($r['ok'] && ($e->op ?? '') !== 'roll') {
        if (!is_array($c->rolls ?? null)) $c->rolls = [];
        array_unshift($c->rolls, (object)['at' => dm_num($e->at ?? 0) ?: dm_now(), 'title' => (empty($e->self) ? 'DM: ' : '') . (string)($e->t ?? ''), 'expr' => '', 'shown' => '', 'total' => '', 'dm' => 1]);
        $c->rolls = array_slice($c->rolls, 0, 100);
    }
    return $r;
}

// ---- the queues ----
function dm_qfile($accounts, $cid, $char)
{
    return "$accounts/campaigns/$cid/pending/$char.json";
}
// every queue this character has, in any campaign (one it left, or a deleted one, still counts)
function dm_qfiles($accounts, $char)
{
    if (!ch_ok_id($char)) return [];
    return array_merge(glob("$accounts/campaigns/*/pending/$char.json") ?: [], glob("$accounts/campaigns/.deleted/*/pending/$char.json") ?: []);
}
function dm_qread($f)
{
    $q = is_file($f) ? json_decode((string)file_get_contents($f)) : null;
    if (!is_object($q)) $q = new stdClass;
    $q->edits = is_array($q->edits ?? null) ? $q->edits : [];
    $q->notes = is_array($q->notes ?? null) ? $q->notes : [];
    return $q;
}
function dm_qput($f, $q)
{
    $dir = dirname($f);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return false;
    $tmp = "$dir/." . basename($f) . '.' . getmypid();
    return @file_put_contents($tmp, json_encode($q, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) !== false && @rename($tmp, $f);
}
// [[queue file, edit], ...] oldest first; $waiting: only the ones no save has carried yet
function dm_all($accounts, $char, $waiting = false)
{
    $out = [];
    foreach (dm_qfiles($accounts, $char) as $f) foreach (dm_qread($f)->edits as $e) if (is_object($e) && (!$waiting || empty($e->done))) $out[] = [$f, $e];
    usort($out, fn($a, $b) => [dm_num($a[1]->at ?? 0), $a[1]->id ?? ''] <=> [dm_num($b[1]->at ?? 0), $b[1]->id ?? '']);
    return $out;
}

// the stored character as its player will have it, with the edits still waiting applied (the DM's checks, the fight tracker)
function dm_char($accounts, $char)
{
    $c = ch_ok_id($char) ? json_decode((string)@file_get_contents("$accounts/characters/$char/character.json")) : null;
    if (!is_object($c)) return null;
    foreach (dm_all($accounts, $char, true) as [, $e]) dm_run($c, $e);
    return $c;
}

// A player's save (the body cloud.php got): every edit it doesn't have is applied to it (so an older copy saved later can't drop
// one), unless it's archived. -> [the body to save, [queue file => [ids the save now has]], [[queue file, note], ...], [edits applied]]
// The caller holds ch_lock() and cp_lock(), and calls dm_confirm() with the ids once the save is written.
function dm_merge($accounts, $body, $who = 'The player')
{
    $c = json_decode($body);
    if (!is_object($c) || !ch_ok_id($c->id ?? null)) return [$body, [], [], []];
    $all = dm_all($accounts, $c->id);
    if (!$all) return [$body, [], [], []];
    $have = array_flip(array_filter(is_array($c->dmApplied ?? null) ? $c->dmApplied : [], 'is_string'));
    $in = $notes = $applied = [];
    foreach ($all as [$f, $e]) {
        if (!isset($have[$e->id])) {
            $r = dm_run($c, $e);
            if (!empty($r['wait'])) continue;
            $applied[] = $e;
            if (!$r['ok'] && empty($e->done)) $notes[] = [$f, dm_note($e, $who, $r)];
        }
        $in[$f][] = $e->id;
    }
    $json = $applied ? json_encode($c, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : false;
    return [$json !== false ? $json : $body, $in, $notes, $applied];
}

// a note for the DMs when an edit couldn't be applied as sent
function dm_note($e, $who, $r)
{
    $text = $r['conflict'] ?? false ? "kept their own value for {$e->t} ({$r['why']})" : "'s sheet couldn't apply {$e->t}: {$r['why']}";
    return (object)['id' => bin2hex(random_bytes(6)), 'at' => dm_now(), 'edit' => $e->id, 'who' => $who, 'text' => $text];
}

// a save with these ids was written: they're done (kept a while for older copies, see DM_DONE). Notes are added too.
function dm_confirm($in, $notes = [])
{
    $add = [];
    foreach ($notes as [$f, $n]) $add[$f][] = $n;
    foreach (array_unique(array_merge(array_keys($in), array_keys($add))) as $f) {
        $q = dm_qread($f);
        $ids = array_flip($in[$f] ?? []);
        $hit = false;
        foreach ($q->edits as $e) if (isset($ids[$e->id]) && empty($e->done)) { $e->done = dm_now(); $hit = true; }
        $done = array_values(array_filter($q->edits, fn($e) => !empty($e->done)));
        if (count($done) > DM_DONE) {
            $drop = array_flip(array_map(fn($e) => $e->id, array_slice($done, 0, count($done) - DM_DONE)));
            $q->edits = array_values(array_filter($q->edits, fn($e) => !isset($drop[$e->id])));
            $hit = true;
        }
        foreach ($add[$f] ?? [] as $n) if (dm_note_add($q, $n)) $hit = true;
        if ($hit) dm_qput($f, $q);
    }
}

// one note per edit and kind of message
function dm_note_add($q, $n)
{
    foreach ($q->notes as $o) if (($o->edit ?? null) === $n->edit && ($o->text ?? null) === $n->text) return false;
    $q->notes[] = $n;
    return true;
}

// ---- who may ----
// the campaign through which $sub DMs this character (not their own), with its owner's name there; null when none
function dm_campaign_of($accounts, $sub, $char)
{
    $owner = ch_meta($accounts, $char)['owner'] ?? null;
    if (!$owner || $owner === $sub) return null;
    foreach (cp_all($accounts) as $c) if (cp_is_dm($c, $sub) && cp_has_char($c, $char)) return [$c, dm_member_name($c, $owner)];
    return null;
}
function dm_member_name($c, $sub)
{
    $i = cp_member($c, $sub);
    return $i >= 0 ? (string)($c['members'][$i]['name'] ?? 'The player') : 'The player';
}

// The DM's edits for one character: each is checked against DM_FIELDS and against the character as its player will have it
// (the saved copy plus what's waiting), then queued. A refused one gets a note. -> [code, response, queued edits]
// The caller holds ch_lock() and cp_lock().
function dm_send($accounts, $user, $c, $char, $edits)
{
    $owner = ch_meta($accounts, $char)['owner'] ?? null;
    // the owner, from their token on the map: hit points and conditions only ("self": no "DM:" in their roll log)
    $self = $c && $owner === $user['sub'] && cp_member($c, $user['sub']) >= 0;
    if (!$c || !(cp_is_dm($c, $user['sub']) || $self) || !cp_has_char($c, $char)) return [403, ['error' => "You can't change this character. Only its campaign's DM and co-DMs can."], []];
    if (!$owner) return [404, ['error' => 'No such character.'], []];
    if (!is_array($edits) || !array_is_list($edits)) return [400, ['error' => 'Send a list of edits.'], []];
    $now = dm_char($accounts, $char);
    if (!$now) return [404, ['error' => 'No such character.'], []];
    $f = dm_qfile($accounts, $c['id'], $char);
    $q = dm_qread($f);
    $known = array_flip(array_map(fn($x) => $x[1]->id, dm_all($accounts, $char)));
    $queued = $refused = [];
    foreach ($edits as $e) {
        $id = is_object($e) && is_string($e->id ?? null) ? $e->id : '';
        if ($why = dm_check($e)) { $refused[] = ['id' => $id, 'why' => $why]; continue; }
        if ($self && !(($e->op ?? '') === 'hp' || (($e->op ?? '') === 'tag' && ($e->path ?? null) === ['conditions']))) { $refused[] = ['id' => $id, 'why' => 'From the map you can only change hit points and conditions.']; continue; }
        unset($e->self);
        if (isset($known[$id])) continue; // sent before (the outbox tried again)
        $r = dm_run($now, $e);
        if (!$r['ok'] && empty($r['conflict'])) {
            $refused[] = ['id' => $id, 'why' => $r['why']];
            dm_note_add($q, (object)['id' => bin2hex(random_bytes(6)), 'at' => dm_now(), 'edit' => $id, 'who' => '', 'text' => "Not sent: {$e->t} ({$r['why']})"]);
            continue;
        }
        $e->by = cp_who($user);
        if ($self) $e->self = true;
        $e->c = $c['id'];
        $e->done = 0;
        $e->got = dm_now(); // the server's clock, for the action log (ROADMAP "Stats data"): "at" is the DM's browser's
        $q->edits[] = $e;
        $queued[] = $e;
        $known[$id] = true;
    }
    if (($queued || $refused) && !dm_qput($f, $q)) return [500, ['error' => "Couldn't save the change."], []];
    return [200, ['queued' => array_map(fn($e) => $e->id, $queued), 'refused' => $refused], $queued];
}
