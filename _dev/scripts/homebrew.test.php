<?php
// includes/homebrew.php: saving (newest wins, a kind never changes, bad entries refused, ids can't leave the folder), sharing (members
// only, the owner's edit shows, archiving hides it, leaving stops it), the DM's removal (DMs only, the owner keeps the entry).
//   php _dev/scripts/homebrew.test.php
require __DIR__ . '/../../includes/homebrew.php';

$dir = sys_get_temp_dir() . '/dnd-homebrew-test-' . getmypid();
mkdir($dir);
$bad = 0;
function is($name, $got, $want) { global $bad; if ($got !== $want) { $bad++; echo "FAIL $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; } }
$rule = fn($id, $upd, $name = 'Crits') => ['id' => $id, 'kind' => 'rule', 'name' => $name, 'text' => 'Max dice.', 'updated' => $upd];

// saving
is('saves', hb_save($dir, '1', $rule('rule01', 100))[0], 200);
is('kept', hb_get($dir, '1', 'rule01')['text'], 'Max dice.');
is('older refused', hb_save($dir, '1', $rule('rule01', 50, 'Old')), [409, ['updated' => 100.0]]);
is('older left it alone', hb_get($dir, '1', 'rule01')['name'], 'Crits');
is('newer wins', [hb_save($dir, '1', $rule('rule01', 200, 'New'))[0], hb_get($dir, '1', 'rule01')['name']], [200, 'New']);
is('same kind only', hb_save($dir, '1', ['kind' => 'spell'] + $rule('rule01', 300))[0], 400);
foreach ([['id' => '../../evil'], ['id' => 'AB'], ['kind' => 'nope'], ['name' => '  '], ['name' => 5], ['updated' => 'x']] as $wrong) {
    is('refused ' . json_encode($wrong), hb_save($dir, '1', $wrong + $rule('rule02', 1))[0], 400);
}
is('refused a non-entry', hb_save($dir, '1', 'text')[0], 400);
is('nothing stray written', array_map('basename', glob("$dir/homebrew/1/*.json")), ['rule01.json']);

// every version a save replaces is kept, and an entry only ever goes to its own account
is('the replaced version is kept', json_decode(file_get_contents("$dir/homebrew/1/history/rule01/100.json"), true)['name'], 'Crits');
is('marked with its account', hb_get($dir, '1', 'rule01')['acct'], hb_acct('1'));
is("another account's entry is refused", hb_save($dir, '2', ['acct' => hb_acct('1')] + $rule('rule09', 1)), [403, ['error' => 'That entry belongs to another account.']]);
is('and not written', file_exists("$dir/homebrew/2/rule09.json"), false);
is('its own account may save it', hb_save($dir, '1', ['acct' => hb_acct('1')] + $rule('rule01', 300, 'New'))[0], 200);

// a campaign: DM 1, co-DM 2, player 3; 4 isn't in it
$cid = 'abcdefabcdef';
cp_put($dir, ['id' => $cid, 'name' => 'Camp', 'dm' => '1', 'codms' => ['2'], 'members' => [['sub' => '1', 'name' => 'Dee'], ['sub' => '2', 'name' => 'Co'], ['sub' => '3', 'name' => 'Pat']]]);
hb_save($dir, '3', $rule('patrule', 100, 'Pat rule'));

// sharing
is('outsider can\'t share', hb_share($dir, '4', $cid, 'patrule', true)[0], 403);
is('needs the entry', hb_share($dir, '3', $cid, 'missing', true)[0], 404);
is('no such campaign', hb_share($dir, '3', 'ffffffffffff', 'patrule', true)[0], 404);
is('bad campaign id', hb_share($dir, '3', '../x', 'patrule', true)[0], 404);
is('shares', hb_share($dir, '3', $cid, 'patrule', true), [200, ['shared' => true]]);
hb_share($dir, '3', $cid, 'patrule', true);
is('shared once', count(hb_shares($dir, $cid)), 1);

$v = hb_view($dir, '1');
is('DM sees it, named', [$v['shared'][0]['name'], $v['shared'][0]['by'], $v['shared'][0]['camps'][0]['dm']], ['Pat rule', 'Pat', true]);
is('no account id handed out', strpos(json_encode($v['shared']), '"sub"'), false);
is('owner sees it as theirs', [count(hb_view($dir, '3')['shared']), (array)hb_view($dir, '3')['shares']], [0, ['patrule' => [$cid]]]);
is('player can\'t remove flag', hb_view($dir, '2')['shared'][0]['camps'][0]['dm'], true);
is('outsider sees nothing', [hb_view($dir, '4')['shared'], hb_view($dir, '4')['camps']], [[], []]);
hb_save($dir, '3', $rule('patrule', 200, 'Pat rule 2'));
is('owner\'s edit shows', hb_view($dir, '1')['shared'][0]['name'], 'Pat rule 2');
hb_save($dir, '3', ['archived' => 300] + $rule('patrule', 300, 'Pat rule 2'));
is('archived hides it', hb_view($dir, '1')['shared'], []);
is('owner still has it', hb_view($dir, '3')['mine'][0]['archived'], 300);
hb_save($dir, '3', $rule('patrule', 400, 'Pat rule 2'));
is('unarchived shows again', count(hb_view($dir, '1')['shared']), 1);

// DM only: a monster, for that campaign's DM and co-DMs; a player's whole answer doesn't have it, whoever owns it
$dmc = 'abcdefabcde2';
cp_put($dir, ['id' => $dmc, 'name' => 'Boss camp', 'dm' => '1', 'codms' => ['2'], 'members' => [['sub' => '1', 'name' => 'Dee'], ['sub' => '2', 'name' => 'Co'], ['sub' => '3', 'name' => 'Pat'], ['sub' => '6', 'name' => 'Zed']]]);
hb_save($dir, '3', ['id' => 'secretmon', 'kind' => 'monster', 'name' => 'Secret boss', 'updated' => 1, 'cr' => 5]);
hb_save($dir, '3', $rule('dmrule', 1, 'Not a monster'));
is('a share marked DM only', hb_share($dir, '3', $dmc, 'secretmon', true, true)[0], 200);
$says = fn($sub) => strpos(json_encode(hb_view($dir, $sub)), 'Secret boss') !== false;
is('a player never gets it', [$says('6'), strpos(json_encode(hb_view($dir, '6')), 'secretmon')], [false, false]);
is('the DM, a co-DM and its owner do', [$says('1'), $says('2'), $says('3')], [true, true, true]);
is('the owner is told it is DM only', (array)hb_view($dir, '3')['dmonly'], ['secretmon' => [$dmc]]);
is('the DM sees it marked', array_values(array_filter(hb_view($dir, '1')['shared'], fn($e) => $e['id'] === 'secretmon'))[0]['camps'][0]['dmonly'], true);
is('no account id in it', array_key_exists('acct', array_values(array_filter(hb_view($dir, '1')['shared'], fn($e) => $e['id'] === 'secretmon'))[0]), false);
hb_share($dir, '3', $dmc, 'dmrule', true, true);
is('DM only is for monsters', strpos(json_encode(hb_view($dir, '6')), 'Not a monster') !== false, true);
hb_share($dir, '3', $dmc, 'secretmon', true, false);
is('turned off, players get it', $says('6'), true);
hb_share($dir, '3', $dmc, 'secretmon', true, true);
is('turned on again, gone', $says('6'), false);
cp_put($dir, ['codms' => []] + cp_get($dir, $dmc));
is('a demoted co-DM stops getting it', $says('2'), false);
hb_share($dir, '3', $dmc, 'secretmon', false);
hb_share($dir, '3', $dmc, 'dmrule', false);

// the DM takes it out; the owner keeps it
$ref = hb_view($dir, '1')['shared'][0]['camps'][0]['ref'];
is('player can\'t remove', hb_remove($dir, '3', $cid, $ref)[0], 403);
is('outsider can\'t remove', hb_remove($dir, '4', $cid, $ref)[0], 403);
is('co-DM removes', hb_remove($dir, '2', $cid, $ref), [200, ['removed' => true]]);
is('gone from the campaign', hb_view($dir, '1')['shared'], []);
is('owner keeps the entry', hb_get($dir, '3', 'patrule')['name'], 'Pat rule 2');
is('owner sees it unshared', (array)hb_view($dir, '3')['shares'], []);

// someone who leaves no longer shares
hb_share($dir, '3', $cid, 'patrule', true);
$c = cp_get($dir, $cid);
array_pop($c['members']);
cp_put($dir, $c);
is('left: not shown', hb_view($dir, '1')['shared'], []);

// the owner takes it back
$c['members'][] = ['sub' => '3', 'name' => 'Pat'];
cp_put($dir, $c);
is('back: shown', count(hb_view($dir, '1')['shared']), 1);
hb_share($dir, '3', $cid, 'patrule', false);
is('taken back', hb_view($dir, '1')['shared'], []);

function rm_tree($p) { foreach (glob("$p/{,.}*", GLOB_BRACE) as $f) { if (in_array(basename($f), ['.', '..'], true)) continue; is_dir($f) ? rm_tree($f) : unlink($f); } rmdir($p); }
rm_tree($dir);
echo $bad ? "$bad check(s) failed\n" : "homebrew ok\n";
exit($bad ? 1 : 0);
