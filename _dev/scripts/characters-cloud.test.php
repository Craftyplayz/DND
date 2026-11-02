<?php
// Checks the per-character folders in includes/characters.php.   usage: php _dev/scripts/characters-cloud.test.php
require __DIR__ . '/../../includes/characters.php';
$A = sys_get_temp_dir() . '/ch-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$char = function ($id, $updated, $name = 'Lock') { return json_encode(['id' => $id, 'updated' => $updated, 'name' => $name, 'abilities' => ['STR' => 10]]); };

// a character saved before the folders is copied in once, and its old file stays
@mkdir("$A/111", 0777, true);
file_put_contents("$A/111/old1.json", $char('old1', 5));
ch_copy_in($A, '111');
$is('old character copied in', ch_list($A, '111'), ['old1' => 5.0]);
$is('old file kept', is_file("$A/111/old1.json"), true);
$is('copy has a history version', is_file("$A/characters/old1/history/1.json"), true);
$is('copy is private', ch_meta($A, 'old1')['visibility'], 'private');

// saving: newer wins, unchanged saves add no version, someone else's id is refused
$is('new character saves', ch_save($A, '111', $char('c1', 10))[0], 200);
$is('newer save', ch_save($A, '111', $char('c1', 20, 'Lock II'))[0], 200);
$is('older save refused', ch_save($A, '111', $char('c1', 15))[1], ['updated' => 20.0]);
ch_save($A, '111', $char('c1', 20, 'Lock II'));
$is('two versions in history', count(glob("$A/characters/c1/history/*.json")), 2);
$is("another player's id is taken", ch_save($A, '222', $char('c1', 99)), [409, ['taken' => true]]);
$is('not a character', ch_save($A, '111', '{"id":"x"}')[0], 400);
$is('bad id', ch_save($A, '111', $char('../x', 1))[0], 400);
$is('each player lists their own', ch_list($A, '222'), []);

// portraits: owner only, real pictures only, a replaced one is kept in history, an unchanged one isn't copied
$jpg = "\xFF\xD8\xFF\xE0" . str_repeat('a', 100);
$png = "\x89PNG\r\n\x1a\n" . str_repeat('b', 100);
$is('no folder yet: save first', ch_art_save($A, '111', 'nope', $jpg)[0], 404);
$is("someone else's character refused", ch_art_save($A, '222', 'c1', $jpg)[0], 404);
$is('not a picture refused', ch_art_save($A, '111', 'c1', '<?php echo 1;')[0], 415);
[$code, $out] = ch_art_save($A, '111', 'c1', $jpg);
$is('picture saved', [$code, file_get_contents("$A/characters/c1/art.jpg")], [200, $jpg]);
$is('address has a version', (bool)preg_match('#^/sheets/player/art\.php\?id=c1&v=[a-f0-9]{12}$#', $out['url']), true);
$is('same picture again changes nothing', [ch_art_save($A, '111', 'c1', $jpg)[1], count(glob("$A/characters/c1/history/art-*"))], [$out, 0]);
$new = ch_art_save($A, '111', 'c1', $png)[1]['url'];
$is('new picture, new address', $new !== $out['url'], true);
$is('old picture kept in history', [ch_art_file($A, 'c1'), file_get_contents("$A/characters/c1/history/art-1.jpg")], ["$A/characters/c1/art.png", $jpg]);
$is('the character itself is untouched', json_decode(file_get_contents("$A/characters/c1/character.json"), true)['name'], 'Lock II');

// no count limit: 250 characters all save
$n = 0;
for ($i = 0; $i < 250; $i++) $n += ch_save($A, '444', $char("many$i", 1))[0] === 200;
$is('250 characters save', [$n, count(ch_list($A, '444'))], [250, 250]);

// visibility and archive are owner only; the old delete archives instead and nothing moves (ROADMAP 0.5)
$is('stranger cannot publish', ch_set_visibility($A, '222', 'c1', 'public')[0], 404);
$is('owner publishes', ch_set_visibility($A, '111', 'c1', 'public'), [200, ['visibility' => 'public']]);
$is('stranger cannot archive', ch_archive_now($A, '222', 'c1')[0], 404);
$before = json_decode(file_get_contents("$A/characters/c1/character.json"), true);
$is('owner archives', ch_archive_now($A, '111', 'c1')[0], 200);
$after = json_decode(file_get_contents("$A/characters/c1/character.json"), true);
$is('archived on the character and in meta', [$after['archived'] > 0, ch_archived(ch_meta($A, 'c1'))], [true, true]);
$is('nothing else changed', array_diff_key($after, ['archived' => 1, 'updated' => 1]), array_diff_key($before, ['updated' => 1]));
$is('folder stays, nothing in .deleted', [is_dir("$A/characters/c1"), is_dir("$A/characters/.deleted")], [true, false]);
$l = array_keys(ch_list($A, '111')); sort($l);
$is('archived still listed', $l, ['c1', 'old1']);
$un = $after; $un['archived'] = 0; $un['updated'] = $after['updated'] + 1;
ch_save($A, '111', json_encode($un));
$is('unarchive clears meta', ch_archived(ch_meta($A, 'c1')), false);

// an older save than the copied-in character is refused (cloud.php copies in before every save)
@mkdir("$A/333", 0777, true);
file_put_contents("$A/333/old3.json", $char('old3', 50));
ch_copy_in($A, '333');
$is('older save than the copied character refused', ch_save($A, '333', $char('old3', 40))[1], ['updated' => 50.0]);

// copy-in runs once: an archived old character isn't copied in again
ch_archive_now($A, '111', 'old1');
@touch("$A/111/.copied");
ch_copy_in($A, '111');
$is('archived old character stays archived', ch_archived(ch_meta($A, 'old1')), true);

// version history (ROADMAP 0.5): roll log and view-only saves make no version; list, read, name, restore
$v = function ($u, $extra = []) { return json_encode(['id' => 'v1', 'updated' => $u, 'name' => 'Vee', 'abilities' => [], 'hp' => ['cur' => 10], 'rolls' => [], 'view' => ['tab' => '']] + $extra + ['hp' => []]); };
ch_save($A, '555', $v(1));
ch_save($A, '555', json_encode(['hp' => ['cur' => 7]] + json_decode($v(2), true)));
ch_save($A, '555', json_encode(['rolls' => [['total' => 20]], 'hp' => ['cur' => 7]] + json_decode($v(3), true)));
ch_save($A, '555', json_encode(['view' => ['tab' => 'x'], 'rolls' => [['total' => 20]], 'hp' => ['cur' => 7]] + json_decode($v(4), true)));
$is('roll and view saves make no version', count(glob("$A/characters/v1/history/*.json")), 2);
$is('but the character is saved', json_decode(file_get_contents("$A/characters/v1/character.json"), true)['view']['tab'], 'x');
[$code, $list] = ch_versions($A, '555', 'v1', 0, 20);
$is('versions newest first', [$code, array_column($list['versions'], 'n'), $list['more']], [200, [2, 1], false]);
$is('versions owner only', ch_versions($A, '111', 'v1', 0, 20)[0], 404);
$is('one version', json_decode(ch_version($A, '555', 'v1', 1)[1], true)['hp']['cur'], 10);
$is('no such version', ch_version($A, '555', 'v1', '../x')[0], 404);
$is('name a version', ch_name_version($A, '555', 'v1', 1, "  Before   session 12 "), [200, ['name' => 'Before session 12']]);
$is('long names cut', mb_strlen(ch_name_version($A, '555', 'v1', 2, str_repeat('é', 200))[1]['name']), CH_NAME);
ch_name_version($A, '555', 'v1', 2, '');
$is('names kept beside the history', (array)ch_versions($A, '555', 'v1', 0, 20)[1]['names'], [1 => 'Before session 12']);
$is('names are not versions', count(ch_versions($A, '555', 'v1', 0, 20)[1]['versions']), 2);
[$code, $out] = ch_restore($A, '555', 'v1', 1, json_encode(['hp' => ['cur' => 10]] + json_decode($v(10), true)));
$is('restore adds a version', [$code, $out['before'], $out['version'], count(glob("$A/characters/v1/history/*.json"))], [200, 2, 3, 3 + 2]);
$is('restore remembered', (array)ch_versions($A, '555', 'v1', 0, 20)[1]['restored'], [3 => ['from' => 1, 'at' => 1]]);
$is('older versions untouched', json_decode(file_get_contents("$A/characters/v1/history/2.json"), true)['hp']['cur'], 7);
$is('restore of another character refused', ch_restore($A, '555', 'v1', 1, $char('zz', 99))[0], 400);
$is('restore of a missing version refused', ch_restore($A, '555', 'v1', 99, $v(11))[0], 404);
// paging
for ($i = 0; $i < 30; $i++) ch_save($A, '555', json_encode(['name' => "N$i"] + json_decode($v(20 + $i), true)));
[, $p1] = ch_versions($A, '555', 'v1', 0, 20);
[, $p2] = ch_versions($A, '555', 'v1', end($p1['versions'])['n'] + 1, 20);
$is('pages of 20 plus one to compare', [count($p1['versions']), $p1['more'], $p2['versions'][0]['n'], $p2['more']], [21, true, 13, false]);
// a restored portrait comes back from history (the current one moves there; nothing is removed)
$jpg2 = "\xFF\xD8\xFF\xE1" . str_repeat('z', 50);
$url1 = ch_art_save($A, '555', 'v1', $jpg2)[1]['url'];
ch_art_save($A, '555', 'v1', $png);
ch_restore($A, '555', 'v1', 1, json_encode(['artUrl' => $url1] + json_decode($v(99), true)));
$is('old portrait is current again', [file_get_contents(ch_art_file($A, 'v1')), count(glob("$A/characters/v1/history/art-*"))], [$jpg2, 2]);

// clean up the temp folder (test data only)
$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
echo $bad ? "$bad failed\n" : "character folders ok\n";
exit($bad ? 1 : 0);
