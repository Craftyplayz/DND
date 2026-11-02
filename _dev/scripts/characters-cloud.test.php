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

// visibility and delete are owner only; delete moves the folder aside
$is('stranger cannot publish', ch_set_visibility($A, '222', 'c1', 'public')[0], 404);
$is('owner publishes', ch_set_visibility($A, '111', 'c1', 'public'), [200, ['visibility' => 'public']]);
$is('stranger cannot delete', ch_delete($A, '222', 'c1')[0], 404);
$is('owner deletes', ch_delete($A, '111', 'c1')[0], 200);
$is('deleted folder kept aside', count(glob("$A/characters/.deleted/c1-*/character.json")), 1);
$is('deleted is gone from the list', array_keys(ch_list($A, '111')), ['old1']);

// an older save than the copied-in character is refused (cloud.php copies in before every save)
@mkdir("$A/333", 0777, true);
file_put_contents("$A/333/old3.json", $char('old3', 50));
ch_copy_in($A, '333');
$is('older save than the copied character refused', ch_save($A, '333', $char('old3', 40))[1], ['updated' => 50.0]);

// copy-in runs once: a deleted old character doesn't come back
ch_delete($A, '111', 'old1');
ch_copy_in($A, '111');
$is('deleted old character stays deleted', ch_list($A, '111'), []);

// clean up the temp folder (test data only)
$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
echo $bad ? "$bad failed\n" : "character folders ok\n";
exit($bad ? 1 : 0);
