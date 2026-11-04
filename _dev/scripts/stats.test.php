<?php
// Checks the action log in includes/stats.php: who may write what, the file it goes to, the clock fix, and that turns, monster HP
// and shared rolls land in it as ROADMAP "Stats data" says.
//   php _dev/scripts/stats.test.php
require __DIR__ . '/../../includes/initiative.php';
$A = sys_get_temp_dir() . '/st-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
foreach ([['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy']] as [$id, $owner, $name]) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private']));
    file_put_contents("$A/characters/$id/character.json", json_encode(['id' => $id, 'name' => $name, 'abilities' => []]));
}
$dm = ['sub' => '111', 'name' => 'Dee'];
$p = ['sub' => '222', 'name' => 'Pat'];
$cid = cp_act($A, $dm, ['act' => 'create', 'name' => 'Crown'])[1]['id'];
cp_act($A, $p, ['act' => 'join', 'code' => cp_get($A, $cid)['code']]);
cp_act($A, $p, ['act' => 'characters', 'id' => $cid, 'characters' => ['lock']]);
$lines = function ($kind, $id) use ($A) {
    $out = [];
    foreach (glob("$A/stats/$kind/$id/*.jsonl") ?: [] as $f) foreach (file($f) as $l) $out[] = json_decode($l, true);
    return $out;
};
$now = st_now();

// a batch from a sheet
[$code, $out] = st_take($A, '222', ['now' => $now, 'events' => [
    ['t' => 'hp', 'id' => 'event-001', 'char' => 'lock', 'at' => $now - 5000, 'd' => -5, 'td' => 0, 'cur' => 15, 'temp' => 0, 'max' => 20, 'asked' => 5, 'evil' => 'dropped', 'name' => ['not', 'scalar']],
    ['t' => 'hp', 'id' => 'event-002', 'char' => 'ozzy', 'at' => $now, 'd' => -1],
    ['t' => 'hp', 'id' => 'event-003', 'char' => 'notyet', 'at' => $now, 'd' => -1],
    ['t' => 'nonsense', 'id' => 'event-004', 'char' => 'lock'],
    ['t' => 'hp', 'id' => 'x', 'char' => 'lock'],
    ['t' => 'roll', 'id' => 'event-005', 'char' => 'lock', 'at' => $now, 'title' => 'Stealth check', 'kind' => 'skill', 'total' => '15', 'dice' => [[20, [15]]]],
    ['t' => 'roll', 'id' => 'event-006', 'char' => 'lock', 'at' => $now, 'title' => 'Bad dice', 'dice' => [[20, [99]]]],
]]);
$is('the batch goes through', $code, 200);
$is('a character not in the account yet waits', $out['wait'], ['event-003']);
$got = $lines('characters', 'lock');
$is('only the good ones are kept', array_column($got, 'id'), ['event-001', 'event-005', 'event-006']);
$is('unknown fields are cut', isset($got[0]['evil']) || isset($got[0]['name']), false);
$is('the fields stay', [$got[0]['t'], $got[0]['d'], $got[0]['asked']], ['hp', -5, 5]);
$is('it says which campaign', $got[0]['c'], [$cid]);
$is("nothing goes in someone else's character", $lines('characters', 'ozzy'), []);
$is('a roll keeps its dice', $got[1]['dice'], [[20, [15]]]);
$is('impossible dice are cut', isset($got[2]['dice']), false);
$is('not a list', st_take($A, '222', ['events' => 'x'])[0], 400);

// the clock fix: a browser an hour fast; the file goes by the time
$t = st_time(st_now() + 3600000 - 5000, st_now() + 3600000);
$is('a fast clock is put right', abs($t - (st_now() - 5000)) < 1000, true);
$is('never in the future', st_time(st_now() + 99999, st_now()) <= st_now(), true);
st_add($A, 'characters', 'lock', ['t' => 'rest', 'at' => gmmktime(12, 0, 0, 3, 15, 2031) * 1000]);
$is('a line goes in the month it happened', is_file("$A/stats/characters/lock/2031-03.jsonl"), true);
$is('a bad id goes nowhere', st_add($A, 'characters', '../evil', ['t' => 'rest']), false);
$is('a bad folder goes nowhere', st_add($A, 'accounts', 'lock', ['t' => 'rest']), false);

// a DM edit's time is the server's: a browser's wrong clock doesn't move it
st_take($A, '222', ['now' => st_now() + 3600000, 'events' => [['t' => 'hp', 'id' => 'dm-edit1-0', 'char' => 'lock', 'at' => $now - 9000, 'srv' => 1, 'by' => 'dm', 'd' => -3], ['t' => 'hp', 'id' => 'event-007', 'char' => 'lock', 'at' => st_now() + 3600000 - 9000, 'd' => -1]]]);
$got = array_column($lines('characters', 'lock'), null, 'id');
$is("a DM edit keeps the server's time", $got['dm-edit1-0']['at'], $now - 9000);
$is('and the marker is not kept', isset($got['dm-edit1-0']['srv']), false);
$is('a browser time is corrected', abs($got['event-007']['at'] - (st_now() - 9000)) < 2000, true);

// a whole fight: each turn is a line, and a monster's HP says who it was and what it did
@mkdir("$A/monsters/111", 0777, true);
file_put_contents("$A/monsters/111/gob.json", json_encode(['id' => 'gob', 'name' => 'Goblin', 'cr' => '1/4', 'xp' => 50, 'race' => 'Small humanoid', 'hp' => ['cur' => 7, 'base' => 7, 'temp' => 0, 'mod' => 0]]));
$c = cp_get($A, $cid);
$fop = function ($op, $extra = []) use ($A, $cid, $dm) {
    $c = cp_get($A, $cid);
    $before = fi_read($A, $cid);
    $r = fi_op($A, $c, ['op' => $op, 'v' => $before['v'] ?? null] + $extra, $dm['sub']);
    if ($r[0] === 200) st_turn($A, $c, $before, fi_read($A, $cid));
    return $r;
};
$is('fight begins', $fop('begin', ['items' => [['kind' => 'pc', 'char' => 'lock', 'init' => 15], ['kind' => 'monster', 'mon' => 'gob', 'init' => 10, 'ac' => 13]]])[0], 200);
$is('the first turn is a line', array_map(fn($l) => [$l['t'], $l['round'], $l['kind'], $l['name']], $lines('campaigns', $cid)), [['turn', 1, 'pc', 'Lock']]);
$fop('add', ['items' => [['kind' => 'plain', 'name' => 'Trap', 'init' => 1]]]);
$is('a change that moves no turn is no line', count($lines('campaigns', $cid)), 1);
$fop('next');
$turns = $lines('campaigns', $cid);
$is('the next turn names the monster', [$turns[1]['kind'], $turns[1]['mon'], $turns[1]['name'], $turns[1]['fight']], ['monster', 'gob', 'Goblin', 1]);
$is('a turn has a time and an id', isset($turns[1]['at'], $turns[1]['id']), true);

$f = fi_read($A, $cid);
$hpBefore = ['cur' => 7, 'base' => 7, 'temp' => 0, 'mod' => 0];
$hpAfter = fi_hp($hpBefore, ['k' => 'dmg', 'n' => 10]);
st_mhp($A, $cid, $f['n'], $f['entries'][1], ['id' => 'gob', 'cr' => '1/4', 'xp' => 50, 'race' => 'Small humanoid'], 'Goblin', $hpBefore, $hpAfter, ['k' => 'dmg', 'n' => 10]);
$l = array_slice($lines('campaigns', $cid), -1)[0];
$is('monster HP: before, after, the hit', [$l['t'], $l['mon'], $l['cr'], $l['k'], $l['n'], $l['cur0'], $l['cur'], $l['max']], ['mhp', 'gob', '1/4', 'dmg', 10, 7, 0, 7]);

// a copy from the map logs through fi_copy_hp, and a bad change logs nothing
file_put_contents("$A/campaigns/$cid/monster-copies.json", json_encode(['cp1' => ['mon' => 'gob', 'by' => '111', 'name' => 'Goblin', 'suffix' => 'A', 'hp' => $hpBefore, 'ac' => 13]]));
$n = count($lines('campaigns', $cid));
fi_copy_hp($A, $cid, 'cp1', ['k' => 'dmg', 'n' => 3]);
$l = array_slice($lines('campaigns', $cid), -1)[0];
$is('a copy logs its name and what it is', [$l['t'], $l['copy'], $l['name'], $l['cr'], $l['cur']], ['mhp', 'cp1', 'Goblin A', '1/4', 4]);
fi_copy_hp($A, $cid, 'nope', ['k' => 'dmg', 'n' => 3]);
$is('no such copy, no line', count($lines('campaigns', $cid)), $n + 1);

// a shared roll keeps its sort
$r = tl_add($A, cp_get($A, $cid), $p, ['id' => 'r-000001', 'at' => 1000, 'char' => 'lock', 'title' => 'Stealth check', 'expr' => '1d20', 'shown' => '12', 'total' => 12, 'nat' => '', 'kind' => 'skill', 'dice' => [[20, [12]]]]);
$is('a shared roll says what sort it is', [$r[0], $r[1]['entry']['kind']], [200, 'skill']);
$r = tl_add($A, cp_get($A, $cid), $p, ['id' => 'r-000002', 'at' => 1000, 'char' => 'lock', 'title' => 'Stealth check', 'kind' => '<bad>']);
$is('a bad sort is cut', isset($r[1]['entry']['kind']), false);

array_map('unlink', array_filter(glob("$A/{,*/,*/*/,*/*/*/,*/*/*/*/}*", GLOB_BRACE) ?: [], 'is_file'));
echo $bad ? "$bad failure(s)\n" : "stats ok\n";
exit($bad ? 1 : 0);
