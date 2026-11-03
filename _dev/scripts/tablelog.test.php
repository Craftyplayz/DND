<?php
// Checks the campaign table log in includes/tablelog.php: who sees which roll, sessions, resends and offline order.
//   php _dev/scripts/tablelog.test.php
require __DIR__ . '/../../includes/tablelog.php';
$A = sys_get_temp_dir() . '/tl-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$dm = ['sub' => '111', 'name' => 'Dee'];
$p1 = ['sub' => '222', 'name' => 'Pat'];
$p2 = ['sub' => '333', 'name' => 'Sam'];
foreach ([['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy'], ['dmpc', '111', 'Brannoc']] as [$id, $owner, $name]) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private']));
    file_put_contents("$A/characters/$id/character.json", json_encode(['id' => $id, 'name' => $name, 'abilities' => []]));
}
$id = cp_act($A, $dm, ['act' => 'create', 'name' => 'Crown'])[1]['id'];
$code = cp_get($A, $id)['code'];
cp_act($A, $p1, ['act' => 'join', 'code' => $code]);
cp_act($A, $p2, ['act' => 'join', 'code' => $code]);
cp_act($A, $p1, ['act' => 'characters', 'id' => $id, 'characters' => ['lock']]);
cp_act($A, $p2, ['act' => 'characters', 'id' => $id, 'characters' => ['ozzy']]);
$c = fn() => cp_get($A, $id);
$roll = fn($rid, $extra = []) => $extra + ['id' => $rid, 'at' => 1000, 'title' => 'Stealth', 'expr' => '1d20 + 5', 'shown' => '15 + 5', 'total' => 20, 'nat' => ''];
$names = fn($user) => array_map(fn($e) => ($e['name'] ?? '') . ':' . ($e['title'] ?? '-'), tl_tail($c(), $user['sub'], tl_read($A, $id, 'unsorted')));

// who may roll what
$is('a roll needs an id', tl_add($A, $c(), $p1, ['char' => 'lock'])[0], 400);
$is("someone else's character refused", tl_add($A, $c(), $p1, $roll('r-000001', ['char' => 'ozzy']))[0], 403);
$is('a player needs a character', tl_add($A, $c(), $p1, $roll('r-000002'))[0], 400);
$is("a player can't hide a roll", tl_add($A, $c(), $p1, $roll('r-000003', ['char' => 'lock', 'vis' => 'hidden']))[0], 400);
$is("the DM can't whisper to themselves", tl_add($A, $c(), $dm, $roll('r-000004', ['vis' => 'dm']))[0], 400);
$e = tl_add($A, $c(), $p1, $roll('r-000010', ['char' => 'lock', 'name' => 'Not me', 'total' => 20, 'nat' => '20']))[1]['entry'];
$is("the name comes from the character's save", [$e['name'], $e['nat']], ['Lock', '20']);
tl_add($A, $c(), $p2, $roll('r-000011', ['char' => 'ozzy', 'vis' => 'dm', 'title' => 'Insight', 'at' => 2000]));
tl_add($A, $c(), $dm, $roll('r-000012', ['name' => 'Goblin', 'vis' => 'hidden', 'title' => 'Ambush', 'at' => 3000]));
tl_add($A, $c(), $dm, $roll('r-000013', ['name' => 'Goblin', 'title' => 'Scimitar', 'at' => 4000]));

// who sees what
$is('the DM sees everything', $names($dm), ['Lock:Stealth', 'Ozzy:Insight', 'Goblin:Ambush', 'Goblin:Scimitar']);
$is('the whisperer sees their whisper, a hidden roll only as "DM rolled" (no name)', $names($p2), ['Lock:Stealth', 'Ozzy:Insight', 'DM:-', 'Goblin:Scimitar']);
$is("another player doesn't see the whisper", $names($p1), ['Lock:Stealth', 'DM:-', 'Goblin:Scimitar']);
$hidden = tl_view($c(), '222', tl_read($A, $id, 'unsorted')['entries'][2]);
$is('a hidden roll carries no result', array_intersect_key($hidden, ['total' => 1, 'shown' => 1, 'expr' => 1, 'title' => 1]), []);
$is('nobody gets a Google id', array_key_exists('sub', tl_tail($c(), '111', tl_read($A, $id, 'unsorted'))[0]), false);
$is('own rolls are marked', array_column(tl_tail($c(), '222', tl_read($A, $id, 'unsorted')), 'mine'), [true, false, false]);

// a resend changes nothing; an offline roll sent later lands where it was rolled
$is('resend is the same roll', tl_add($A, $c(), $p1, $roll('r-000010', ['char' => 'lock']))[1]['again'] ?? false, true);
tl_add($A, $c(), $p1, $roll('r-000014', ['char' => 'lock', 'title' => 'Offline', 'at' => 1500, 'offline' => true]));
$is('offline roll in time order', array_slice($names($dm), 0, 3), ['Lock:Stealth', 'Lock:Offline', 'Ozzy:Insight']);
$is('rolled in the future becomes now', tl_add($A, $c(), $p1, $roll('r-000015', ['char' => 'lock', 'at' => PHP_INT_MAX]))[1]['entry']['at'] <= microtime(true) * 1000, true);

// a co-DM sees and rolls as the DM does; made a player again, they see what a player sees
$player = $names($p1);
cp_act($A, $dm, ['act' => 'codm', 'id' => $id, 'member' => '222', 'on' => true]);
$is('a co-DM sees whispers and hidden rolls', $names($p1), $names($dm));
$is("a co-DM can't whisper", tl_add($A, $c(), $p1, $roll('r-000030', ['vis' => 'dm']))[0], 400);
$e = tl_add($A, $c(), $p1, $roll('r-000031', ['name' => 'Wolf', 'vis' => 'hidden', 'title' => 'Bite', 'at' => 5000]))[1]['entry'] ?? null;
$is("a co-DM rolls hidden for a monster, marked as the DM's", [$e['name'] ?? null, $e['dm'] ?? null, $e['vis'] ?? null], ['Wolf', true, 'hidden']);
$is('a player sees the co-DM roll only as "DM rolled" (no name)', in_array('DM:-', $names($p2), true), true);
$is('the DM sees it', in_array('Wolf:Bite', $names($dm), true), true);
cp_act($A, $dm, ['act' => 'codm', 'id' => $id, 'member' => '222', 'on' => false]);
$is('demoted: a player again', array_values(array_filter($names($p1), fn($n) => $n !== 'Wolf:Bite')), $player); // their own roll stays theirs

// sessions: only rolls during one go into it
$is("can't end what isn't running", tl_session($A, $c(), false)[0], 400);
[$code, $out, $camp] = tl_session($A, $c(), true);
$is('session 1 starts', [$code, $out['session']['n']], [200, 1]);
$is("can't start twice", tl_session($A, $c(), true)[0], 400);
tl_add($A, $c(), $p1, $roll('r-000020', ['char' => 'lock', 'title' => 'In session']));
$is('the roll is in the session', array_column(tl_read($A, $id, '1')['entries'], 'title'), ['In session']);
$is('not in the unsorted log', in_array('In session', array_column(tl_read($A, $id, 'unsorted')['entries'], 'title'), true), false);
tl_session($A, $c(), false);
$is('session 1 ended', [tl_read($A, $id, '1')['ended'] > 0, $c()['session']], [true, null]);
tl_session($A, $c(), true);
$is('next session is 2', $c()['session']['n'], 2);
$is('sessions listed newest first', array_column(tl_sessions($A, $id), 'n'), [2, 1]);
$is('bad log names refused', [tl_read($A, $id, '../x'), tl_read($A, $id, '1.json')], [null, null]);

$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
echo $bad ? "$bad failed\n" : "table log ok\n";
exit($bad ? 1 : 0);
