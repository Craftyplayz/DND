<?php
// Checks the initiative tracker (includes/initiative.php): order, ties, rolls joining, turns and rounds, ending, the
// hit point rule, and what players may see.   usage: php _dev/scripts/initiative.test.php
require __DIR__ . '/../../includes/initiative.php';
$A = sys_get_temp_dir() . '/fi-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$dm = ['sub' => '111', 'name' => 'Dee'];
$pat = ['sub' => '222', 'name' => 'Pat'];
$sam = ['sub' => '333', 'name' => 'Sam'];
foreach ([['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy'], ['rex', '333', 'Rex'], ['dmpc', '111', 'Dmpc']] as [$id, $owner, $name]) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private', 'created' => 1, 'campaigns' => []]));
    file_put_contents("$A/characters/$id/character.json", json_encode(['id' => $id, 'name' => $name, 'updated' => 1, 'abilities' => [], 'hp' => ['cur' => 17, 'temp' => 2]]));
}
@mkdir("$A/monsters/111", 0777, true);
$mon = function ($id, $name, $cur, $base, $extra = []) use ($A) {
    file_put_contents("$A/monsters/111/$id.json", json_encode(['id' => $id, 'name' => $name, 'updated' => 1, 'abilities' => [], 'hp' => ['cur' => $cur, 'base' => $base, 'temp' => 0, 'mod' => 0]] + $extra));
};
$mon('gob1', 'Goblin 1', 7, 7);
$mon('gob2', 'Goblin 2', 7, 7);
$mon('ogre', 'Ogre', 59, 59, ['art' => 'https://example.com/ogre.png']);
@mkdir("$A/campaigns/feed00000001", 0777, true);
$c = ['id' => 'feed00000001', 'name' => 'Test', 'dm' => '111', 'code' => 'abcdefabcd', 'created' => 1, 'members' => [
    ['sub' => '111', 'name' => 'Dee', 'characters' => [['sheet' => 'player', 'id' => 'dmpc']]],
    ['sub' => '222', 'name' => 'Pat', 'characters' => [['sheet' => 'player', 'id' => 'lock']]],
    ['sub' => '333', 'name' => 'Sam', 'characters' => [['sheet' => 'player', 'id' => 'ozzy'], ['sheet' => 'player', 'id' => 'rex']]]]];
cp_put($A, $c);
$op = function ($body) use ($A, $c) { $f = fi_read($A, $c['id']); return fi_op($A, $c, $body + ['v' => $f['v'] ?? null]); };
$roll = fn($user, $r) => fi_roll($A, $c, $user, $r + ['title' => 'Initiative', 'fight' => fi_read($A, $c['id'])['n'] ?? 0]);
$order = fn() => array_map(fn($e) => $e['char'] ?? $e['mon'] ?? $e['name'], fi_read($A, $c['id'])['entries']);

// the hit point rule (the Monster Sheet's damage form)
$hp = ['cur' => 10, 'base' => 12, 'temp' => 3, 'mod' => 0];
$is('damage: temp soaks first', fi_hp($hp, ['k' => 'dmg', 'n' => 5]), ['cur' => 8, 'base' => 12, 'temp' => 0, 'mod' => 0]);
$is('damage never below 0', fi_hp($hp, ['k' => 'dmg', 'n' => 50])['cur'], 0);
$is('heal up to the max', fi_hp($hp, ['k' => 'heal', 'n' => 50])['cur'], 12);
$is("temp HP doesn't stack", [fi_hp($hp, ['k' => 'temp', 'n' => 2])['temp'], fi_hp($hp, ['k' => 'temp', 'n' => 5])['temp']], [3, 5]);
$is('set only the numbers sent', fi_hp($hp, ['k' => 'set', 'hp' => ['base' => 20]]), ['cur' => 10, 'base' => 20, 'temp' => 3, 'mod' => 0]);
$is('two damages both count', fi_hp(fi_hp($hp, ['k' => 'dmg', 'n' => 4]), ['k' => 'dmg', 'n' => 4])['cur'], 5);
$is('unknown change refused', fi_hp($hp, ['k' => 'boom']), null);
$is('status', [fi_status(['cur' => 4, 'base' => 7]), fi_status(['cur' => 3, 'base' => 7]), fi_status(['cur' => 0, 'base' => 7]), fi_status(['cur' => 5, 'base' => 7, 'mod' => 4])], ['healthy', 'bloodied', 'down', 'bloodied']);

// no fight: rolls do nothing, players see nothing
$is('no fight', fi_view($A, $c, '222'), null);
$is('a roll with no fight', $roll($pat, ['char' => 'lock', 'total' => 15, 'expr' => '1d20 + 2']), false);
$is('only one fight', [$op(['op' => 'start'])[0], fi_op($A, $c, ['op' => 'start'])[0]], [200, 409]);
$is('fight started in the table log', array_column(tl_read($A, $c['id'], 'unsorted')['entries'], 'title'), ['Fight started']);

// rolling in: three players roll, the order sorts live
$roll($pat, ['char' => 'lock', 'total' => 12, 'expr' => '1d20 + 2', 'vis' => 'public']);
$roll($sam, ['char' => 'ozzy', 'total' => 18, 'expr' => '1d20 + 4']);
$roll($sam, ['char' => 'rex', 'total' => 9, 'expr' => '1d20 − 1', 'vis' => 'dm']);
$is('order by number', $order(), ['ozzy', 'lock', 'rex']);
$is('bonus read from the roll', array_column(fi_read($A, $c['id'])['entries'], 'bonus'), [4, 2, -1]);
$is("not someone else's character", $roll($pat, ['char' => 'ozzy', 'total' => 30]), false);
$is('a roll for an old fight stays in the log only', fi_roll($A, $c, $pat, ['title' => 'Initiative', 'fight' => 99, 'char' => 'lock', 'total' => 30]), false);
$is('a skill roll is not initiative', fi_roll($A, $c, $pat, ['title' => 'Stealth', 'fight' => 1, 'char' => 'lock', 'total' => 30]), false);
$roll($pat, ['char' => 'lock', 'total' => 20, 'expr' => '1d20 + 2']);
$is('a re-roll while rolling in replaces', $order(), ['lock', 'ozzy', 'rex']);
$is('one entry per character', count(fi_read($A, $c['id'])['entries']), 3);

// monsters, a plain entry, ties
$is('a monster not in the account is refused', $op(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'nope']]])[0], 400);
$is('add two monsters', $op(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'gob1', 'init' => 18, 'bonus' => 2, 'ac' => 15], ['kind' => 'monster', 'mon' => 'ogre', 'init' => 5, 'bonus' => -1, 'ac' => 11]]])[0], 200);
$is('a monster once only', $op(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'gob1', 'init' => 3]]])[0], 200);
$is('equal number: higher bonus first', $order(), ['lock', 'ozzy', 'gob1', 'rex', 'ogre']);
$op(['op' => 'add', 'items' => [['kind' => 'plain', 'name' => 'Lair action', 'init' => 20]]]);
$f = fi_read($A, $c['id']);
$is('equal number and bonus: a silent roll-off decides', [$f['entries'][0]['tie'] !== $f['entries'][1]['tie'], count(array_filter($f['entries'], fn($e) => $e['init'] === 20))], [true, 2]);
$is('roll-off order holds', fi_cmp($f['entries'][0], $f['entries'][1]), -1);
$lair = array_values(array_filter($f['entries'], fn($e) => $e['kind'] === 'plain'))[0]['id'];
$is('no table log line for the roll-off', count(tl_read($A, $c['id'], 'unsorted')['entries']), 1);

// the DM: stale changes refused, edit numbers, move, hide
$is('a change from an older copy is refused', fi_op($A, $c, ['op' => 'next', 'v' => 0])[1]['error'] ?? '', 'This fight changed, reloaded.');
$is('next before round 1', $op(['op' => 'next'])[0], 400);
$op(['op' => 'remove', 'e' => $lair]);
$ogre = array_values(array_filter(fi_read($A, $c['id'])['entries'], fn($e) => ($e['mon'] ?? '') === 'ogre'))[0]['id'];
$op(['op' => 'init', 'e' => $ogre, 'value' => 25]);
$is('a typed number moves it', $order()[0], 'ogre');
$op(['op' => 'move', 'e' => $ogre, 'dir' => 1]);
$is('move down', array_slice($order(), 0, 2), ['lock', 'ogre']);
$op(['op' => 'move', 'e' => $ogre, 'dir' => -1]);
$op(['op' => 'hide', 'e' => $ogre, 'on' => true]);

// players see no numbers, no hidden monster, no monster HP
$pv = fi_view($A, $c, '222');
$json = json_encode($pv);
$is('player: the hidden monster is not sent', [str_contains($json, 'Ogre'), str_contains($json, 'ogre'), count($pv['entries'])], [false, false, 4]);
$is('player: no numbers or HP', [str_contains($json, '"init"'), str_contains($json, '"hp"'), str_contains($json, '"bonus"'), str_contains($json, '"secret"'), str_contains($json, '"mon"')], [false, false, false, false, false]);
$is("player: other players' characters have no id or health", array_map(fn($e) => [isset($e['char']), isset($e['status'])], array_values(array_filter($pv['entries'], fn($e) => $e['kind'] === 'pc' && !$e['mine']))), [[false, false], [false, false]]);
$is('player: own character marked', array_values(array_filter($pv['entries'], fn($e) => !empty($e['mine'])))[0]['char'], 'lock');
$is('player: goblin as healthy', array_values(array_filter($pv['entries'], fn($e) => $e['kind'] === 'monster'))[0]['status'], 'healthy');
$is('player: Lock rolled, may not roll again... yet can (rolling in)', $pv['canRoll'], []);
$is('Sam: both characters rolled', fi_view($A, $c, '333')['canRoll'], []);
$dv = fi_view($A, $c, '111');
$is('DM: the hidden monster with HP and AC', array_map(fn($e) => [$e['hidden'], $e['hp'], $e['ac']], array_values(array_filter($dv['entries'], fn($e) => ($e['mon'] ?? '') === 'ogre'))), [[true, ['cur' => 59, 'max' => 59, 'temp' => 0], 11]]);
$is('DM: player HP to read, the roll to the DM marked', array_map(fn($e) => [$e['hp'], $e['secret']], array_values(array_filter($dv['entries'], fn($e) => ($e['char'] ?? '') === 'rex'))), [[['cur' => 17, 'temp' => 2], true]]);
$is("DM: the party character that isn't in yet", array_column($dv['party'], 'char'), ['dmpc']);

// round 1, turns, down monsters skipped, rounds
$op(['op' => 'round1']);
$f = fi_read($A, $c['id']);
$is('round 1 starts at the top, the timer runs', [$f['round'], $f['turn'] === $f['entries'][0]['id'], is_int($f['startedAt'])], [1, true, true]);
$is('player sees no turn while the hidden monster acts', fi_view($A, $c, '222')['turn'], null);
$roll($pat, ['char' => 'lock', 'total' => 1, 'expr' => '1d20 + 2']);
$is('after round 1 a re-roll is ignored', $order()[1], 'lock');
$mon('gob1', 'Goblin 1', 0, 7);
$turns = [];
for ($i = 0; $i < 5; $i++) { $op(['op' => 'next']); $f = fi_read($A, $c['id']); $turns[] = [$f['round'], $f['entries'][fi_index($f, $f['turn'])]['char'] ?? $f['entries'][fi_index($f, $f['turn'])]['mon']]; }
$is('next skips the down goblin and wraps into round 2', $turns, [[1, 'lock'], [1, 'ozzy'], [1, 'rex'], [2, 'ogre'], [2, 'lock']]);
$op(['op' => 'prev']);
$op(['op' => 'prev']);
$f = fi_read($A, $c['id']);
$is('previous goes back a round', [$f['round'], $f['entries'][fi_index($f, $f['turn'])]['char'] ?? ''], [1, 'rex']);
$is('down shows to players', array_values(array_filter(fi_view($A, $c, '222')['entries'], fn($e) => $e['kind'] === 'monster'))[0]['status'], 'down');
// a late arrival slots in by number and the turn stays
$turn = $f['turn'];
$is('DM adds their own character', $op(['op' => 'add', 'items' => [['kind' => 'pc', 'char' => 'dmpc']]])[0], 200);
$is('it can roll in late', fi_view($A, $c, '111')['canRoll'], ['dmpc']);
$roll($dm, ['char' => 'dmpc', 'total' => 19, 'expr' => '1d20']);
$is('late roll slots in, the turn stays', [$order()[2], fi_read($A, $c['id'])['turn']], ['dmpc', $turn]);
// removing a character keeps it out
$rex = array_values(array_filter(fi_read($A, $c['id'])['entries'], fn($e) => ($e['char'] ?? '') === 'rex'))[0]['id'];
$op(['op' => 'remove', 'e' => $rex]);
$is('removed: the turn moves on, its rolls are ignored', [in_array('rex', $order(), true), fi_read($A, $c['id'])['turn'] !== $rex, $roll($sam, ['char' => 'rex', 'total' => 5]), fi_view($A, $c, '333')['canRoll']], [false, true, false, []]);
// a monster rolled from the Monster Sheet joins
fi_roll($A, $c, $dm, ['title' => 'Initiative', 'fight' => 1, 'mon' => 'gob2', 'total' => 11, 'expr' => '1d20 + 2', 'vis' => 'hidden']);
$is('a Monster Sheet roll adds the monster', in_array('gob2', $order(), true), true);
$is("players can't add monsters by rolling", fi_roll($A, $c, $pat, ['title' => 'Initiative', 'fight' => 1, 'mon' => 'ogre', 'total' => 11]), false);
// archived and gone monsters stay, marked
$mon('gob2', 'Goblin 2', 7, 7, ['archived' => true]);
@unlink("$A/monsters/111/ogre.json");
$dv = fi_view($A, $c, '111');
$is('archived and gone monsters stay, marked', array_map(fn($e) => [$e['name'], $e['archived'], $e['missing']], array_values(array_filter($dv['entries'], fn($e) => $e['kind'] === 'monster' && $e['mon'] !== 'gob1'))), [['Ogre', false, true], ['Goblin 2', true, false]]);

// ending moves the fight to fights/<n>.json
$is('end', $op(['op' => 'end'])[0], 200);
$is('ended: kept as fight 1, no current fight', [is_file("$A/campaigns/{$c['id']}/fights/1.json"), fi_read($A, $c['id']), fi_view($A, $c, '222')], [true, null, null]);
$is('fight ended in the table log', array_column(tl_read($A, $c['id'], 'unsorted')['entries'], 'title'), ['Fight started', 'Fight ended']);
$op(['op' => 'start']);
$is('the next fight is number 2', fi_read($A, $c['id'])['n'], 2);

$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
echo $bad ? "$bad failed\n" : "initiative ok\n";
exit($bad ? 1 : 0);
