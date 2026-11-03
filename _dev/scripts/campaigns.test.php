<?php
// Checks the campaign storage in includes/campaigns.php.   usage: php _dev/scripts/campaigns.test.php
require __DIR__ . '/../../includes/campaigns.php';
$A = sys_get_temp_dir() . '/cp-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$dm = ['sub' => '111', 'email' => 'dm@example.com', 'name' => 'Dee'];
$pl = ['sub' => '222', 'email' => 'pl@example.com', 'name' => ''];
$other = ['sub' => '333', 'email' => 'x@example.com', 'name' => 'Oz'];
$char = function ($id, $owner) use ($A) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private', 'created' => 1, 'campaigns' => []]));
    file_put_contents("$A/characters/$id/character.json", json_encode(['id' => $id, 'updated' => 1, 'name' => $id, 'abilities' => []]));
};
$char('lock', '222');
$char('dmpc', '111');
$char('oz1', '333');
$before = md5_file("$A/characters/lock/character.json") . md5_file("$A/characters/lock/meta.json");

// create
$is('no name refused', cp_act($A, $dm, ['act' => 'create', 'name' => '  '])[0], 400);
[$code, $out] = cp_act($A, $dm, ['act' => 'create', 'name' => "  Curse   of\nthe Crown "]);
$is('create', $code, 200);
$id = $out['id'];
$c = cp_get($A, $id);
$is('name tidied', $c['name'], 'Curse of the Crown');
$is('creator is the DM and first member', [$c['dm'], $c['members'][0]['sub']], ['111', '111']);
$is('code looks right', cp_ok_code($c['code']), true);
$is('long names are cut', mb_strlen(cp_get($A, cp_act($A, $dm, ['act' => 'create', 'name' => str_repeat('a', 300)])[1]['id'])['name']), CP_NAME);

// join by code
$is('bad code', cp_act($A, $pl, ['act' => 'join', 'code' => 'nope'])[0], 404);
$is('join', cp_act($A, $pl, ['act' => 'join', 'code' => $c['code']]), [200, ['id' => $id]]);
cp_act($A, $pl, ['act' => 'join', 'code' => $c['code']]);
$is('joining twice adds nobody', count(cp_get($A, $id)['members']), 2);
$is('no Google name shows as Player, never the email', cp_get($A, $id)['members'][1]['name'], 'Player');
$is('lists for the DM', in_array($id, array_column(cp_mine($A, '111')['dm'], 'id'), true), true);
$is('lists for the player', array_column(cp_mine($A, '222')['player'], 'id'), [$id]);
$is('a stranger sees nothing', cp_mine($A, '333'), ['dm' => [], 'player' => []]);

// characters: only your own, only from the account
$is("someone else's character refused", cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['oz1']])[0], 400);
$is('unknown character refused', cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['../x']])[0], 400);
$is('own character added', cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['lock', 'lock']]), [200, ['characters' => [['sheet' => 'player', 'id' => 'lock']]]]);
cp_act($A, $dm, ['act' => 'characters', 'id' => $id, 'characters' => ['dmpc']]);
$is('the character itself is never written', md5_file("$A/characters/lock/character.json") . md5_file("$A/characters/lock/meta.json"), $before);
$is('DM sees an attached character', cp_dm_sees($A, '111', 'lock'), true);
$is('DM does not see others', cp_dm_sees($A, '111', 'oz1'), false);
$is('a player is not a DM', cp_dm_sees($A, '222', 'dmpc'), false);

// archiving (ROADMAP 0.5): an archived character leaves its campaigns and can't be added back until unarchived
$char('arc', '222');
cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['lock', 'arc']]);
ch_save($A, '222', json_encode(['id' => 'arc', 'updated' => 5, 'name' => 'arc', 'abilities' => [], 'archived' => 5]));
cp_detach($A, 'arc');
$is('archived character leaves the campaign', array_column(cp_get($A, $id)['members'][1]['characters'], 'id'), ['lock']);
$is('archived character refused', cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['arc']])[0], 400);
ch_save($A, '222', json_encode(['id' => 'arc', 'updated' => 6, 'name' => 'arc', 'abilities' => [], 'archived' => 0]));
$is('unarchived can join again', cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['lock', 'arc']])[0], 200);
cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['lock']]);
ch_save($A, '222', json_encode(['id' => 'arc', 'updated' => 7, 'name' => 'arc', 'abilities' => [], 'archived' => 7]));
$is('an archived character is not cloned into a campaign', [cp_act($A, $pl, ['act' => 'clone', 'id' => $id, 'char' => 'arc'])[0], array_column(cp_get($A, $id)['members'][1]['characters'], 'id')], [400, ['lock']]);

// one campaign per character: a second campaign refuses it and offers a clone
file_put_contents("$A/characters/lock/art.png", "\x89PNG\r\n\x1a\nfake");
$ch = json_decode(file_get_contents("$A/characters/lock/character.json"), true);
file_put_contents("$A/characters/lock/character.json", json_encode($ch + ['rolls' => [['at' => 1, 'title' => 'Stealth']], 'hp' => ['cur' => 9]]));
@mkdir("$A/characters/lock/history", 0777, true);
file_put_contents("$A/characters/lock/history/1.json", '{}');
$id2 = cp_act($A, $other, ['act' => 'create', 'name' => 'Second'])[1]['id'];
cp_act($A, $pl, ['act' => 'join', 'code' => cp_get($A, $id2)['code']]);
[$code, $out] = cp_act($A, $pl, ['act' => 'characters', 'id' => $id2, 'characters' => ['lock']]);
$is('second campaign refuses the character', [$code, $out['conflict']['id'] ?? null, $out['conflict']['campaigns'][0]['id'] ?? null], [409, 'lock', $id]);
$is('refused attach changes nothing', cp_get($A, $id2)['members'][1]['characters'], []);
$is('saving the same list again where it already is still works', cp_act($A, $pl, ['act' => 'characters', 'id' => $id, 'characters' => ['lock']])[0], 200);
$is("can't clone someone else's character", cp_act($A, $other, ['act' => 'clone', 'id' => $id2, 'char' => 'lock'])[0], 404);
[$code, $out] = cp_act($A, $pl, ['act' => 'clone', 'id' => $id2, 'char' => 'lock']);
$copy = $out['char'] ?? '';
$is('clone made', [$code, ch_ok_id($copy), $copy !== 'lock'], [200, true, true]);
$cc = ch_json("$A/characters/$copy/character.json");
$is('clone: named (copy), same sheet, fresh roll log, own id', [$cc['name'], $cc['hp'], $cc['rolls'], $cc['id']], ['lock (copy)', ['cur' => 9], [], $copy]);
$is('clone: owned by the same player, private', [ch_meta($A, $copy)['owner'], ch_meta($A, $copy)['visibility']], ['222', 'private']);
$is('clone: fresh history (one version), portrait copied', [count(glob("$A/characters/$copy/history/*.json")), is_file("$A/characters/$copy/art.png"), str_contains($cc['artUrl'], "id=$copy")], [1, true, true]);
$is('clone is in the second campaign', array_column(cp_get($A, $id2)['members'][1]['characters'], 'id'), [$copy]);
$is('original stays in the first only', array_column(cp_char_in($A, 'lock'), 'id'), [$id]);
// independence: saving the clone never touches the original
$before2 = md5_file("$A/characters/lock/character.json");
ch_save($A, '222', json_encode(['id' => $copy, 'updated' => $cc['updated'] + 1, 'name' => 'Changed', 'abilities' => []]));
$is('editing the clone leaves the original alone', [md5_file("$A/characters/lock/character.json"), ch_json("$A/characters/$copy/character.json")['name']], [$before2, 'Changed']);
// a character in two campaigns from before the rule: keep in one leaves the other; clone for one puts a copy there
$c2 = cp_get($A, $id2);
$c2['members'][1]['characters'][] = ['sheet' => 'player', 'id' => 'lock'];
cp_put($A, $c2);
$is('older character in two campaigns', count(cp_char_in($A, 'lock')), 2);
$is("keep: only for one that's there", cp_act($A, $pl, ['act' => 'keep', 'id' => $id2, 'char' => 'nope'])[0], 404);
[$code, $out] = cp_act($A, $pl, ['act' => 'keep', 'id' => $id, 'char' => 'lock']);
$is('keep in the first leaves the second', [$code, $out['changed'], array_column(cp_char_in($A, 'lock'), 'id')], [200, [$id2], [$id]]);
$is('the clone stays in the second', array_column(cp_get($A, $id2)['members'][1]['characters'], 'id'), [$copy]);
cp_put($A, $c2);
[$code, $out] = cp_act($A, $pl, ['act' => 'clone', 'id' => $id2, 'char' => 'lock']);
$is('clone for the second takes the original out of it', [$code, in_array('lock', array_column(cp_get($A, $id2)['members'][1]['characters'], 'id'), true), array_column(cp_char_in($A, 'lock'), 'id')], [200, false, [$id]]);
cp_act($A, $pl, ['act' => 'leave', 'id' => $id2]);

// DM only
$is('stranger gets no campaign', cp_act($A, $other, ['act' => 'rename', 'id' => $id, 'name' => 'x'])[0], 404);
$is('player cannot rename', cp_act($A, $pl, ['act' => 'rename', 'id' => $id, 'name' => 'x'])[0], 403);
$is('player cannot make a new link', cp_act($A, $pl, ['act' => 'code', 'id' => $id])[0], 403);
$is('player cannot delete', cp_act($A, $pl, ['act' => 'delete', 'id' => $id])[0], 403);
$is('DM renames', cp_act($A, $dm, ['act' => 'rename', 'id' => $id, 'name' => 'Crown']), [200, ['name' => 'Crown']]);
$old = cp_get($A, $id)['code'];
$new = cp_act($A, $dm, ['act' => 'code', 'id' => $id])[1]['code'];
$is('new link differs', $new !== $old, true);
$is('old link stops working', cp_act($A, $other, ['act' => 'join', 'code' => $old])[0], 404);
$is('new link works', cp_act($A, $other, ['act' => 'join', 'code' => $new])[0], 200);

// remove, leave
$is("DM can't remove themselves", cp_act($A, $dm, ['act' => 'remove', 'id' => $id, 'member' => '111'])[0], 400);
$is('DM removes a player', cp_act($A, $dm, ['act' => 'remove', 'id' => $id, 'member' => '333'])[0], 200);
$is('removed player is out', cp_member(cp_get($A, $id), '333'), -1);
$is("DM can't leave", cp_act($A, $dm, ['act' => 'leave', 'id' => $id])[0], 400);
$is('player leaves', cp_act($A, $pl, ['act' => 'leave', 'id' => $id])[0], 200);
$is('left player no longer linked for the DM', cp_dm_sees($A, '111', 'lock'), false);
$is('character still there after leaving', is_file("$A/characters/lock/character.json"), true);

// delete moves the folder aside and never touches characters
$is('delete', cp_act($A, $dm, ['act' => 'delete', 'id' => $id])[0], 200);
$is('gone from the list', in_array($id, array_column(cp_mine($A, '111')['dm'], 'id'), true), false);
$is('kept in .deleted', count(glob("$A/campaigns/.deleted/$id-*/campaign.json")), 1);
$is("DM's own character untouched", is_file("$A/characters/dmpc/character.json"), true);
$is('bad id', cp_act($A, $dm, ['act' => 'rename', 'id' => '../../x', 'name' => 'x'])[0], 404);

// clean up the temp folder (test data only)
$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
echo $bad ? "$bad failed\n" : "campaigns ok\n";
exit($bad ? 1 : 0);
