<?php
// Checks DM notes and handouts in includes/handouts.php.   usage: php _dev/scripts/handouts.test.php
require __DIR__ . '/../../includes/handouts.php';
$A = sys_get_temp_dir() . '/ho-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$CID = 'c0ffee0000a1';
$camp = function ($members, $codms = []) use ($A, $CID) {
    @mkdir("$A/campaigns/$CID", 0777, true);
    file_put_contents("$A/campaigns/$CID/campaign.json", json_encode(['id' => $CID, 'name' => 'Ho', 'dm' => '111', 'code' => 'abcdefabcd', 'created' => 1, 'codms' => $codms,
        'members' => array_map(fn($s) => ['sub' => $s, 'name' => "P$s", 'joined' => 1, 'characters' => []], $members)]));
    return cp_get($A, $CID);
};
$c = $camp(['111', '222', '333', '444'], ['444']); // DM 111, players 222 and 333, co-DM 444
// by reference: the campaign changes below (a player joins, one leaves)
$act = function ($sub, $body) use ($A, &$c) { return ho_act($A, $c, $sub, $body) + [2 => []]; };
$ids = function ($sub) use ($A, &$c) { return array_column(ho_list($A, $c, $sub), 'id'); };
$hist = fn($id) => count(glob("$A/campaigns/$CID/handouts/history/$id/*.json"));
$k = fn($sub) => live_key($CID, $sub);

// drafts: the DM and co-DMs only
$is('player cannot make a handout', $act('222', ['act' => 'save', 'handout' => ['id' => 'hand0001', 'title' => 'x', 'updated' => 1]])[0], 403);
[$code, $out, $live] = $act('111', ['act' => 'save', 'handout' => ['id' => 'hand0001', 'title' => '  The   map ', 'text' => "Line 1\r\nLine 2", 'updated' => 10]]);
$is('DM makes a draft', [$code, $out['handout']['title'], $out['handout']['text'], $out['handout']['to']], [200, 'The map', "Line 1\nLine 2", null]);
$is('a draft tells only the DM pages', $live, [[['type' => 'handout', 'id' => 'hand0001'], 'dm']]);
$is('co-DM sees the draft', $ids('444'), ['hand0001']);
$is('players do not see a draft', [$ids('222'), $ids('333')], [[], []]);
$is('older save is refused with the stored copy', $act('444', ['act' => 'save', 'handout' => ['id' => 'hand0001', 'title' => 'old', 'updated' => 5]])[1]['handout']['title'] ?? null, 'The map');
$is('bad id refused', $act('111', ['act' => 'save', 'handout' => ['id' => '../x', 'updated' => 1]])[0], 400);

// send to one player
$is('nobody picked is refused', $act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => []])[0], 400);
$is('a non-member cannot be a recipient', $act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => ['999']])[0], 400);
[$code, $out, $live] = $act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => ['222']]);
$is('sent to Pat', [$code, $out['handout']['to']], [200, ['222']]);
$is('relay: only Pat and the DM pages, with just the id', $live, [[['type' => 'handout', 'id' => 'hand0001'], 'dm'], [['type' => 'handout', 'id' => 'hand0001'], [$k('222')]]]);
$is('Pat sees it, 333 does not', [$ids('222'), $ids('333')], [['hand0001'], []]);
$v = ho_list($A, $c, '222')[0];
$is('player view has no recipients or switches', array_keys($v), ['id', 'title', 'text', 'images', 'sent', 'edited', 'new', 'updated']);
$is('new until opened', $v['new'], true);
$is('another player cannot open it', $act('333', ['act' => 'open', 'id' => 'hand0001'])[0], 404);
$is('Pat opens it', $act('222', ['act' => 'open', 'id' => 'hand0001'])[0], 200);
$is('opened: not new (kept on the server, so on every device)', [ho_list($A, $c, '222')[0]['new'], ho_list($A, $c, '222')[0]['updated']], [false, false]);

// the Table flag never shows a handout sent to some players
$act('111', ['act' => 'save', 'handout' => ['id' => 'hand0001', 'title' => 'The map', 'text' => "Line 1\nLine 2", 'table' => true, 'updated' => 2e12]]); // sending stamps the time now, so later edits come from the clock too
$is('table switch stored', ho_get($A, $CID, 'hand0001')['table'], true);
$is('a one-player handout never reaches the Table view', ho_table($A, $c), []);

// editing a sent handout: Updated mark, history, live to its recipients
$before = $hist('hand0001');
[$code, $out, $live] = $act('111', ['act' => 'save', 'handout' => ['id' => 'hand0001', 'title' => 'The map', 'text' => 'Line 1 changed', 'table' => true, 'updated' => 3e12]]);
$is('edit saved', $code, 200);
$is('every edit kept in history', $hist('hand0001'), $before + 1);
$is('edit goes live to Pat', $live[1] ?? null, [['type' => 'handout', 'id' => 'hand0001'], [$k('222')]]);
$is('Pat sees Updated', ho_list($A, $c, '222')[0]['updated'], true);
$is('same text again makes no history', [$act('111', ['act' => 'save', 'handout' => ['id' => 'hand0001', 'title' => 'The map', 'text' => 'Line 1 changed', 'table' => true, 'updated' => 3.1e12]])[0], $hist('hand0001')], [200, $before + 1]);

// add and remove recipients
[, , $live] = $act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => ['333']]);
$is('swap Pat for 333: 333 gets it, Pat gets gone', $live, [[['type' => 'handout', 'id' => 'hand0001'], 'dm'], [['type' => 'handout', 'id' => 'hand0001'], [$k('333')]], [['type' => 'handout-gone', 'id' => 'hand0001'], [$k('222')]]]);
$is('after the swap', [$ids('222'), $ids('333')], [[], ['hand0001']]);
$is('333 has it as new', ho_list($A, $c, '333')[0]['new'], true);

// everyone, and a player who joins later
$act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => 'everyone']);
$is('everyone: both players', [$ids('222'), $ids('333')], [['hand0001'], ['hand0001']]);
$is('the Table view gets an everyone handout with the switch on', array_column(ho_table($A, $c), 'id'), ['hand0001']);
$c = $camp(['111', '222', '333', '444', '555'], ['444']);
$is('a later joiner sees an everyone handout', $ids('555'), ['hand0001']);
// a player who leaves loses every handout, even "everyone" ones
$c = $camp(['111', '333', '444', '555'], ['444']);
$is('a player who left sees nothing', $ids('222'), []);
$is('a player who left cannot open it', $act('222', ['act' => 'open', 'id' => 'hand0001'])[0], 404);
$is('a stranger cannot list', ho_sees($c, '999', ho_get($A, $CID, 'hand0001')), false);

// pictures: 4 MB pieces, resumable, checked by their first bytes
$png = "\x89PNG\r\n\x1A\n" . str_repeat('p', 100);
$is('player cannot upload', ho_chunk($A, $c, '333', 'aaaaaaaaaaaaaaaa', 0, $png)[0], 403);
$is('bad upload id', ho_chunk($A, $c, '111', '../../x', 0, $png)[0], 400);
$is('first piece', ho_chunk($A, $c, '111', 'aaaaaaaaaaaaaaaa', 0, substr($png, 0, 50)), [200, ['size' => 50]]);
$is('a piece sent again is turned away with the size so far', ho_chunk($A, $c, '111', 'aaaaaaaaaaaaaaaa', 0, substr($png, 0, 50)), [409, ['size' => 50]]);
$is('resume from there', ho_chunk($A, $c, '111', 'aaaaaaaaaaaaaaaa', 50, substr($png, 50)), [200, ['size' => strlen($png)]]);
[$code, $out] = $act('111', ['act' => 'image', 'id' => 'hand0001', 'up' => 'aaaaaaaaaaaaaaaa', 'name' => 'map.png']);
$is('picture added', [$code, count($out['handout']['images'])], [200, 1]);
$img = $out['handout']['images'][0]['id'];
$is('stored as uploaded', file_get_contents("$A/campaigns/$CID/handouts/hand0001/$img.png"), $png);
ho_chunk($A, $c, '111', 'bbbbbbbbbbbbbbbb', 0, '<html><script>alert(1)</script>');
$is('a file that is not a picture is refused', $act('111', ['act' => 'image', 'id' => 'hand0001', 'up' => 'bbbbbbbbbbbbbbbb', 'name' => 'x.png'])[0], 415);
foreach (['jpg' => "\xFF\xD8\xFF\xE0xx", 'gif' => 'GIF89axx', 'webp' => 'RIFF1234WEBPVP8 '] as $ext => $bytes) {
    file_put_contents("$A/x", $bytes);
    $is("magic bytes: $ext", ho_magic("$A/x"), $ext);
}
$is('recipient gets the picture', ho_image($A, $c, '333', 'hand0001', $img) !== null, true);
$is('DM gets the picture', ho_image($A, $c, '111', 'hand0001', $img) !== null, true);
$act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => ['555']]);
$is('a non-recipient cannot get the picture', ho_image($A, $c, '333', 'hand0001', $img), null);
$is('a stranger cannot get the picture', ho_image($A, $c, '999', 'hand0001', $img), null);
$is('a made-up picture id', ho_image($A, $c, '111', 'hand0001', '../hand0001'), null);
[$code] = $act('111', ['act' => 'unimage', 'id' => 'hand0001', 'img' => $img]);
$is('picture taken off, file kept', [$code, is_file("$A/campaigns/$CID/handouts/hand0001/$img.png")], [200, true]);

// unshare and archive
[, , $live] = $act('111', ['act' => 'unshare', 'id' => 'hand0001']);
$is('unshare: a draft again, gone for its player', [ho_get($A, $CID, 'hand0001')['to'], end($live)], [null, [['type' => 'handout-gone', 'id' => 'hand0001'], [$k('555')]]]);
$is('unshared is invisible to players', $ids('555'), []);
$act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => 'everyone']);
[$code, , $live] = $act('444', ['act' => 'archive', 'id' => 'hand0001']);
$is('co-DM archives; everyone loses it live', [$code, end($live)[0]['type']], [200, 'handout-gone']);
$is('archived is never deleted', is_file("$A/campaigns/$CID/handouts/hand0001.json"), true);
$is('archived: players see nothing, DM still does', [$ids('333'), $ids('111')], [[], ['hand0001']]);
$is('an archived one cannot be sent', $act('111', ['act' => 'send', 'id' => 'hand0001', 'to' => 'everyone'])[0], 400);
$act('111', ['act' => 'restore', 'id' => 'hand0001']);
$is('restored as a draft', [ho_get($A, $CID, 'hand0001')['archived'], ho_get($A, $CID, 'hand0001')['to'], $ids('333')], [0, null, []]);

// DM notes: DM and co-DMs only, newest wins, every save in history, archived not deleted
$note = ['id' => 'note0001', 'title' => 'Villain', 'group' => 'NPCs', 'body' => 'Secret plan', 'pinned' => true, 'archived' => 0, 'created' => 5, 'updated' => 10];
$is('player cannot save a note', no_save($A, $c, '333', $note)[0], 403);
$is('DM saves a note', no_save($A, $c, '111', $note)[0], 200);
$is('co-DM saves a newer one', no_save($A, $c, '444', ['body' => 'New plan', 'updated' => 20] + $note)[0], 200);
$is('an older copy gets the stored one back', no_save($A, $c, '111', ['body' => 'stale', 'updated' => 15] + $note), [409, ['note' => array_merge($note, ['body' => 'New plan', 'updated' => 20])]]);
$is('every save in history', count(glob("$A/campaigns/$CID/notes/history/note0001/*.json")), 2);
no_save($A, $c, '111', ['archived' => 30, 'updated' => 30] + $note);
$is('an archived note stays', no_all($A, $CID)[0]['archived'], 30);
$is('notes never in the Table view', json_encode(ho_table($A, $c)), '[]');

// deleting the campaign takes notes and handouts with it into campaigns/.deleted/
cp_act($A, ['sub' => '111', 'name' => 'Dee'], ['act' => 'delete', 'id' => $CID]);
$gone = glob("$A/campaigns/.deleted/$CID-*")[0] ?? '';
$is('notes and handouts moved with the campaign', [is_file("$gone/notes/note0001.json"), is_file("$gone/handouts/hand0001.json"), is_file("$gone/handouts/hand0001/$img.png")], [true, true, true]);

// tidy up
$rm = function ($d) use (&$rm) { foreach (array_diff(scandir($d), ['.', '..']) as $f) is_dir("$d/$f") ? $rm("$d/$f") : unlink("$d/$f"); rmdir($d); };
$rm($A);
echo $bad ? "$bad check(s) failed\n" : "handouts ok\n";
exit($bad ? 1 : 0);
