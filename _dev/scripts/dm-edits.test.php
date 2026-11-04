<?php
// Checks DM edits on the server (includes/dmedits.php, ROADMAP 1.5): which paths a DM may change, who may send, the queue
// (once per id, done only after a save, kept for older copies, never lost when a campaign goes), and the account putting
// missing edits into a save.   usage: php _dev/scripts/dm-edits.test.php
require __DIR__ . '/../../includes/dmedits.php';
$A = sys_get_temp_dir() . '/dm-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } else echo "ok   $name\n"; };
$o = fn($a) => json_decode(json_encode($a)); // as the server reads JSON: objects stay objects
$dm = ['sub' => '111', 'email' => 'dm@example.com', 'name' => 'Dee'];
$co = ['sub' => '222', 'email' => 'co@example.com', 'name' => 'Cora'];
$pl = ['sub' => '333', 'email' => 'pl@example.com', 'name' => 'Pat'];
$st = ['sub' => '444', 'email' => 'st@example.com', 'name' => 'Stan'];
$hero = ['id' => 'lock', 'updated' => 10, 'name' => 'Lock', 'abilities' => [['key' => 'STR', 'name' => 'Strength', 'score' => 14, 'save' => false, 'sb' => '']],
    'skills' => [['name' => 'Stealth', 'ab' => 'DEX', 'p' => 0, 'b' => '']], 'hp' => ['cur' => 20, 'base' => 20, 'temp' => 0, 'mod' => 0], 'calc' => ['hpMax' => 24],
    'conditions' => [], 'rolls' => [], 'view' => (object)[], 'panels' => [['id' => 'pi', 'type' => 'items', 'title' => 'Inventory', 'on' => true, 'coins' => ['cp' => 0, 'sp' => 0, 'ep' => 0, 'gp' => 5, 'pp' => 0],
        'rows' => [['id' => 'r1', 'name' => 'Rope', 'qty' => 1, 'props' => []]]]]];
$char = function ($id, $owner, $c) use ($A) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private', 'created' => 1, 'campaigns' => []]));
    file_put_contents("$A/characters/$id/character.json", json_encode(['id' => $id] + $c));
};
$char('lock', '333', $hero);
$char('dmpc', '111', ['updated' => 1, 'name' => 'Brannoc', 'abilities' => [], 'conditions' => [], 'hp' => ['cur' => 5, 'base' => 5, 'temp' => 0, 'mod' => 0]]);
$char('ozzy', '444', ['updated' => 1, 'name' => 'Ozzy', 'abilities' => []]);
$stored = md5_file("$A/characters/lock/character.json");
$id = cp_act($A, $dm, ['act' => 'create', 'name' => 'Edits'])[1]['id'];
$code = cp_get($A, $id)['code'];
foreach ([$co, $pl, $st] as $u) cp_act($A, $u, ['act' => 'join', 'code' => $code]);
cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['lock']]);
cp_act($A, $dm, ['act' => 'characters', 'id' => $id, 'characters' => ['dmpc']]);
cp_act($A, $dm, ['act' => 'codm', 'id' => $id, 'member' => '222', 'on' => true]);
$c = fn() => cp_get($A, $id);
$n = 0;
$E = function ($op, $x = []) use (&$n, $o) { $n++; return $o(['id' => 'edit' . str_pad((string)$n, 6, '0', STR_PAD_LEFT), 'at' => 1000 + $n, 't' => "change $n", 'op' => $op] + $x); };
$INV = ['panels', '#pi:Inventory'];

// ---- which paths and values a DM may send ----
$ok = [['hp', ['how' => 'dmg', 'amt' => 7]], ['set', ['path' => ['abilities', '@STR', 'score'], 'value' => 16, 'was' => 14]], ['set', ['path' => ['name'], 'value' => 'Lox', 'was' => 'Lock']],
    ['add', ['path' => [...$INV, 'coins', 'gp'], 'amt' => 50]], ['add', ['path' => [...$INV, 'rows', '#r1:Rope', 'qty'], 'amt' => -1]], ['tag', ['path' => ['conditions'], 'value' => 'Poisoned', 'on' => true]],
    ['tag', ['path' => ['profs', 'langs'], 'value' => 'Elvish', 'on' => true]], ['row', ['path' => [...$INV, 'rows'], 'row' => ['id' => 'r2', 'name' => 'Sword', 'qty' => 1, 'props' => ['Finesse'], 'eq' => false]]],
    ['row', ['path' => ['panels', '#ps:Spells', 'rows'], 'row' => ['id' => 's1', 'name' => 'Fireball', 'lvl' => 3, 'dmg' => [['dice' => '8d6', 'type' => 'Fire']], 'fx' => []]]],
    ['unrow', ['path' => [...$INV, 'rows', '#r1:Rope']]], ['unrow', ['path' => ['panels', '#pn:Notes', 'notes', '#n1:Backstory']]],
    ['set', ['path' => ['panels', '#pn:Notes', 'notes', '#n1:Backstory', 'body'], 'value' => 'x', 'was' => 'y']], ['set', ['path' => ['insp'], 'value' => true, 'was' => false]],
    ['add', ['path' => ['panels', '#ps:Spells', 'slots', '0:', 'used'], 'amt' => 1]], ['add', ['path' => ['classes', '0:Rogue', 'hdUsed'], 'amt' => 1]],
    ['roll', ['roll' => ['at' => 1, 'title' => 'Stealth', 'expr' => '1d20', 'shown' => '4', 'total' => 4, 'nat' => '']]]];
foreach ($ok as [$op, $x]) $is("allowed: $op " . implode('.', $x['path'] ?? []), dm_check($E($op, $x)), null);
$no = [['set', ['path' => ['rolls'], 'value' => '', 'was' => '']], ['set', ['path' => ['view', 'tab'], 'value' => 'x', 'was' => '']], ['set', ['path' => ['art'], 'value' => 'x', 'was' => '']],
    ['set', ['path' => ['artUrl'], 'value' => 'x', 'was' => '']], ['set', ['path' => ['archived'], 'value' => 1, 'was' => 0]], ['set', ['path' => ['updated'], 'value' => 1, 'was' => 0]],
    ['set', ['path' => ['dmApplied'], 'value' => 'x', 'was' => '']], ['set', ['path' => ['calc', 'hpMax'], 'value' => 1, 'was' => 0]], ['set', ['path' => ['junk'], 'value' => 1, 'was' => 0]],
    ['set', ['path' => [...$INV, 'on'], 'value' => false, 'was' => true]], ['set', ['path' => [...$INV, 'title'], 'value' => 'Bag', 'was' => 'Inventory']],
    ['set', ['path' => [...$INV, 'rows', '#r1:Rope', 'id'], 'value' => 'x', 'was' => 'r1']], ['unrow', ['path' => $INV]], ['row', ['path' => ['panels'], 'row' => ['id' => 'p9', 'type' => 'text']]],
    ['set', ['path' => ['insp'], 'value' => 'yes', 'was' => false]], ['set', ['path' => ['name'], 'value' => ['x'], 'was' => 'Lock']], ['add', ['path' => ['name'], 'amt' => 1]],
    ['add', ['path' => ['hp', 'base'], 'amt' => 1]], ['tag', ['path' => ['name'], 'value' => 'x', 'on' => true]], ['tag', ['path' => ['conditions'], 'value' => 3, 'on' => true]],
    ['row', ['path' => [...$INV, 'rows'], 'row' => ['id' => 'r3', 'name' => 'Junk', 'evil' => 1]]], ['row', ['path' => [...$INV, 'rows'], 'row' => ['id' => 'r3', 'qty' => ['x']]]],
    ['row', ['path' => ['panels', '#ps:Spells', 'slots'], 'row' => ['max' => 1, 'used' => 0]]], ['unrow', ['path' => ['panels', '#ps:Spells', 'slots', '0:']]],
    ['hp', ['how' => 'kill', 'amt' => 7]], ['roll', ['roll' => ['title' => ['x']]]], ['set', ['path' => 'name', 'value' => 'x', 'was' => 'y']], ['set', ['path' => ['', 'x'], 'value' => 'x', 'was' => 'y']],
    ['explode', []]];
foreach ($no as [$op, $x]) $is("refused: $op " . (is_array($x['path'] ?? null) ? implode('.', $x['path']) : json_encode($x['path'] ?? '')), dm_check($E($op, $x)) !== null, true);
$is('refused: a bad id', dm_check($o(['id' => 'x', 'at' => 1, 't' => '', 'op' => 'hp', 'how' => 'dmg', 'amt' => 1])) !== null, true);

// ---- who may send ----
$send = fn($u, $char, $edits, $camp = null) => dm_send($A, $u, $camp ?? $c(), $char, $edits);
$is('a player may not', $send($pl, 'ozzy', [$E('hp', ['how' => 'dmg', 'amt' => 1])])[0], 403);
$is('a stranger may not', $send(['sub' => '999', 'name' => 'X'], 'lock', [$E('hp', ['how' => 'dmg', 'amt' => 1])])[0], 403);
$is('not for a character outside the campaign', $send($dm, 'ozzy', [$E('hp', ['how' => 'dmg', 'amt' => 1])])[0], 403);
// the owner, from their token on the map: hit points and conditions only, marked as their own
$own = $send($dm, 'dmpc', [$h0 = $E('hp', ['how' => 'dmg', 'amt' => 1]), $t0 = $E('tag', ['path' => ['conditions'], 'value' => 'Prone', 'on' => true]), $x0 = $E('set', ['path' => ['name'], 'value' => 'New', 'was' => 'Dmpc']), $y0 = $E('tag', ['path' => ['profs', 'langs'], 'value' => 'Orc', 'on' => true])]);
$is('your own character: HP and conditions, nothing else', [$own[0], $own[1]['queued'], array_column($own[1]['refused'], 'id')], [200, [$h0->id, $t0->id], [$x0->id, $y0->id]]);
$is('your own: marked, and a client can\'t mark a DM\'s edit', [$own[2][0]->self ?? null, $send($co, 'dmpc', [$sx = $E('hp', ['how' => 'heal', 'amt' => 1, 'self' => true])])[2][0]->self ?? null], [true, null]);
$is('the DM may', $send($dm, 'lock', [$h = $E('hp', ['how' => 'dmg', 'amt' => 7])])[1], ['queued' => [$h->id], 'refused' => []]);
$is('a co-DM may', $send($co, 'lock', [$s = $E('set', ['path' => ['skills', '@Stealth', 'p'], 'value' => 1, 'was' => 0])])[1]['queued'], [$s->id]);
$is('a co-DM may edit the DM\'s character', $send($co, 'dmpc', [$E('hp', ['how' => 'heal', 'amt' => 1])])[0], 200);
$is('the character file is never written by a DM', md5_file("$A/characters/lock/character.json"), $stored);
$Q = dm_qfile($A, $id, 'lock');
$q = dm_qread($Q);
$is('queued in the campaign, with who sent it and not done', array_map(fn($e) => [$e->by, $e->c, $e->done], $q->edits), [['Dee', $id, 0], ['Cora', $id, 0]]);
$is('the same edit again is not queued twice', [$send($dm, 'lock', [$h])[0], count(dm_qread($Q)->edits)], [200, 2]);
[$cd, $out] = $send($dm, 'lock', [$r = $E('add', ['path' => [...$INV, 'rows', '#zz:Lantern', 'qty'], 'amt' => 1]), $bad1 = $E('set', ['path' => ['view', 'tab'], 'value' => 'x', 'was' => ''])]);
$is('a removed row and a bad path are refused, with reasons', $out['refused'], [['id' => $r->id, 'why' => 'Lantern was removed'], ['id' => $bad1->id, 'why' => "The DM can't change that."]]);
$is('... and the DMs get a line about the removed row', array_map(fn($x) => $x->text, dm_qread($Q)->notes), ["Not sent: {$r->t} (Lantern was removed)"]);
$row = $E('row', ['path' => [...$INV, 'rows'], 'row' => ['id' => 'r2', 'name' => 'Sword', 'qty' => 1, 'props' => []]]);
$after = $E('add', ['path' => [...$INV, 'rows', '#r2:Sword', 'qty'], 'amt' => 1]);
$is('an edit to a row the DM just added (still waiting) is checked against it', $send($dm, 'lock', [$row, $after])[1]['refused'], []);
$is('the DM\'s view: the saved character with what is waiting', [dm_char($A, 'lock')->hp->cur, dm_char($A, 'lock')->skills[0]->p, count(dm_char($A, 'lock')->panels[0]->rows)], [13, 1, 2]);

// ---- the player's save: missing edits go in, done once written ----
$save = fn($ch) => dm_merge($A, json_encode($ch), 'Pat');
$h1 = $hero;
[$body, $in, $notes, $applied] = $save($h1);
$got = json_decode($body, true);
$is('a save without the edits gets them all, in order', [$got['hp']['cur'], $got['skills'][0]['p'], array_column($got['panels'][0]['rows'], 'qty'), count($applied)], [13, 1, [1, 2], 4]);
$is('... once each', count($got['dmApplied']), 4);
$is('... with "DM: ..." lines in the roll log', array_column($got['rolls'], 'title'), ['DM: ' . $after->t, 'DM: ' . $row->t, 'DM: ' . $s->t, 'DM: ' . $h->t]);
$is('{} stays {}', str_contains($body, '"view":{}'), true);
$is('not done before the save is written', array_column(dm_qread($Q)->edits, 'done'), [0, 0, 0, 0]);
dm_confirm($in, $notes);
$is('done once written', count(array_filter(dm_qread($Q)->edits, fn($e) => $e->done > 0)), 4);
[$body2, , , $ap2] = dm_merge($A, $body, 'Pat');
$is('a save that has them all is left as it is', [$body2 === $body, $ap2], [true, []]);
// an older copy (from before the edits) saved later gets them again
[$old, , , $ap3] = $save($hero);
$is('an older copy saved later: the edits go back in', [json_decode($old, true)['hp']['cur'], count($ap3)], [13, 4]);
// the player changed the skill on another device before the DM's edit arrived there: their value stays, the DMs are told
$mine = $hero; $mine['skills'][0]['p'] = 2; $mine['dmApplied'] = [$h->id];
[$b4, , $n4] = $save($mine);
$is('a conflict keeps the player\'s value', json_decode($b4, true)['skills'][0]['p'], 2);
$is('... and is told only for an edit not done yet', $n4, []);
// archived: edits wait
$k = $E('hp', ['how' => 'dmg', 'amt' => 1]);
$send($dm, 'lock', [$k]);
$arch = $got; $arch['archived'] = 5;
[$b5, $in5, , $ap5] = $save($arch);
$is('an archived character: the edit waits', [json_decode($b5, true)['hp']['cur'], $ap5, in_array($k->id, $in5[$Q] ?? [], true)], [13, [], false]);
$arch['archived'] = 0;
[$b6, $in6] = $save($arch);
$is('unarchived: it goes in', [json_decode($b6, true)['hp']['cur'], in_array($k->id, $in6[$Q], true)], [12, true]);
dm_confirm($in6);

// ---- queues outlive the campaign link ----
$k2 = $E('add', ['path' => [...$INV, 'coins', 'gp'], 'amt' => 10]);
$send($dm, 'lock', [$k2]);
cp_act($A, $pl, ['act' => 'leave', 'id' => $id]);
$is('the player left: no new edits', $send($dm, 'lock', [$E('hp', ['how' => 'dmg', 'amt' => 1])])[0], 403);
$is('... but one already sent still applies', json_decode($save(json_decode($b6, true))[0], true)['panels'][0]['coins']['gp'], 15);
cp_act($A, $dm, ['act' => 'delete', 'id' => $id]);
$is('the campaign deleted: still found', count(dm_qfiles($A, 'lock')), 1);
$is('... and still applies', json_decode($save(json_decode($b6, true))[0], true)['panels'][0]['coins']['gp'], 15);
$is('nothing was unlinked', is_file($Q) || count(glob("$A/campaigns/.deleted/*/pending/lock.json")) === 1, true);

// ---- a clone keeps nothing waiting for the original ----
$is('a new id has no queue', dm_all($A, 'other1'), []);

// ---- done edits are kept a while, then dropped ----
$q = dm_qread($f = dm_qfiles($A, 'lock')[0]);
$q->edits = array_map(fn($i) => $o(['id' => "old$i" . str_repeat('x', 5), 'at' => $i, 't' => '', 'op' => 'hp', 'how' => 'dmg', 'amt' => 0, 'done' => 0]), range(1, DM_DONE + 5));
dm_qput($f, $q);
dm_confirm([$f => array_map(fn($e) => $e->id, $q->edits)]);
$is('kept: the newest DM_DONE confirmed edits', [count(dm_qread($f)->edits), dm_qread($f)->edits[0]->id], [DM_DONE, 'old6xxxxx']);

// ---- the list mirrors the sheet's blank() (dm-edits.mjs compares them in the browser); amounts match dmedit.js ----
$amounts = array_keys(array_filter(DM_FIELDS, fn($t) => $t === 'a'));
sort($amounts);
$is('amount fields', $amounts, ['classes.N.hdUsed', 'exhaustion', 'hp.cur', 'hp.temp', 'panels.#.bad', 'panels.#.coins.cp', 'panels.#.coins.ep', 'panels.#.coins.gp', 'panels.#.coins.pp', 'panels.#.coins.sp',
    'panels.#.ok', 'panels.#.rows.#.cur', 'panels.#.rows.#.extra', 'panels.#.rows.#.levels.N.extra', 'panels.#.rows.#.levels.N.used', 'panels.#.rows.#.qty', 'panels.#.rows.#.used',
    'panels.#.slots.N.extra', 'panels.#.slots.N.used', 'panels.#.sp.cur', 'panels.#.sp.extra', 'panels.#.sp.used']);

// clean up the temp folder (test data only)
$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
echo $bad ? "$bad failed\n" : "dm edits ok\n";
exit($bad ? 1 : 0);
