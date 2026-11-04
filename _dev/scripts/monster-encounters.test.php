<?php
// Checks named encounters (ROADMAP 3.1): the per-encounter merge in includes/encounters.php, the "_" guard on monster ids, and the
// endpoints (sheets/monster/encounters.php, cloud.php, backup.php?encs) on a local server with stand-in folders.
//   php _dev/scripts/monster-encounters.test.php      (the endpoint part needs includes/config.php for sign-in)
require __DIR__ . '/../../includes/encounters.php';
$A = sys_get_temp_dir() . '/enc-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$e = fn($id, $updated, $name = 'Cave', $extra = []) => $extra + ['id' => $id, 'name' => $name, 'order' => 0.0, 'archived' => 0.0, 'updated' => (float)$updated];

// merge: newer wins per encounter, a tie keeps the saved one, nothing either side has is dropped
$m = enc_merge([$e('a', 5, 'Old'), $e('b', 9, 'Kept')], [$e('a', 6, 'New'), $e('b', 8, 'Older'), $e('c', 1, 'Only here')]);
$is('newer name wins', array_column($m, 'name', 'id'), ['a' => 'New', 'b' => 'Kept', 'c' => 'Only here']);
$is('a tie keeps the saved one', enc_merge([$e('a', 5, 'Saved')], [$e('a', 5, 'Sent')])[0]['name'], 'Saved');
$is('an empty list drops nothing', count(enc_merge([$e('a', 1), $e('b', 1)], [])), 2);
$is('archived and order follow the newer copy', enc_merge([$e('a', 1)], [$e('a', 2, 'Cave', ['archived' => 7.0, 'order' => 3.0])])[0], $e('a', 2, 'Cave', ['archived' => 7.0, 'order' => 3.0]));

// cleaning: bad entries and fields are left out, types are fixed
$c = enc_clean([['id' => '../x', 'updated' => 9], 'nope', ['id' => 'ok', 'name' => ['x'], 'order' => '2', 'updated' => 'soon', 'extra' => 1], ['id' => 'long', 'name' => str_repeat('é', 200)]]);
$is('only good ids kept, in the saved shape', $c[0], ['id' => 'ok', 'name' => '', 'order' => 2.0, 'archived' => 0.0, 'updated' => 0.0]);
$is('names kept whole (no limits)', mb_strlen($c[1]['name']), 200);
$is('not a list', enc_clean('x'), []);

// the "_" guard: monster ids never start with "_"
$is('monster ids', array_map('mon_id_ok', ['abc123', 'a_b-c', '_encounters', '-x', '', str_repeat('a', 65), '../a', null]), [true, true, false, true, false, false, false, false]);

// saving: merged under a lock into accounts/monster-encounters/<sub>.json, apart from accounts/monsters/
$is('not a list refused', enc_save($A, '111', ['nope' => 1])[0], 400);
$is('first save', enc_save($A, '111', ['encs' => [$e('a', 5, 'Cave')]]), [200, ['encs' => [$e('a', 5, 'Cave')]]]);
$is('second device merges in', enc_save($A, '111', ['encs' => [$e('b', 3, 'Bridge')]])[1]['encs'], [$e('a', 5, 'Cave'), $e('b', 3, 'Bridge')]);
$is('an older copy changes nothing', enc_save($A, '111', ['encs' => [$e('a', 4, 'Stale')]])[1]['encs'][0]['name'], 'Cave');
$is('read back', enc_read($A, '111'), [$e('a', 5, 'Cave'), $e('b', 3, 'Bridge')]);
$is('in its own folder', [is_file("$A/monster-encounters/111.json"), is_dir("$A/monsters")], [true, false]);
$is('each account its own', enc_read($A, '222'), []);

// the party (ROADMAP 3.2): kept on the encounter in the saved shape, only where there is one; Unsorted's sits beside the list, newer wins
$party = ['camp' => 'aaaaaaaaaaaa', 'off' => ['char1'], 'levels' => '5, 4', 'at' => 7.0, 'gone' => 0.0];
$is('party kept', enc_clean([['id' => 'p', 'updated' => 1, 'party' => $party + ['extra' => 1]]])[0]['party'], $party);
$is('party cleaned', enc_party_clean(['camp' => '../x', 'off' => ['ok', '../no', 3], 'levels' => ['x'], 'at' => 'soon']), ['camp' => '', 'off' => ['ok'], 'levels' => '', 'at' => 0.0, 'gone' => 0.0]);
$is('no party: the older shape', array_key_exists('party', enc_clean([['id' => 'p', 'updated' => 1, 'party' => 'nope']])[0]), false);
$is('newer copy brings its party', enc_save($A, '333', ['encs' => [$e('a', 1), ]])[0], 200);
$is('party saved with the encounter', enc_save($A, '333', ['encs' => [$e('a', 2, 'Cave', ['party' => $party])]])[1]['encs'][0]['party'], $party);
$is('an older copy without one keeps it', enc_save($A, '333', ['encs' => [$e('a', 1)]])[1]['encs'][0]['party'], $party);
$is('no Unsorted party yet: not in the answer', array_key_exists('unsorted', enc_body($A, '333')), false);
$is('Unsorted party saved', enc_save($A, '333', ['encs' => [], 'unsorted' => ['party' => $party, 'updated' => 5]])[1]['unsorted'], ['party' => $party, 'updated' => 5.0]);
$is('an older Unsorted party loses', enc_save($A, '333', ['encs' => [], 'unsorted' => ['party' => ['levels' => 'old'], 'updated' => 4]])[1]['unsorted']['party'], $party);
$is('a list alone leaves it', enc_save($A, '333', ['encs' => []])[1]['unsorted']['updated'], 5.0);
$is('a newer Unsorted party wins', enc_save($A, '333', ['encs' => [], 'unsorted' => ['party' => ['levels' => 'new'], 'updated' => 6]])[1]['unsorted']['party']['levels'], 'new');
$is('encounters survive it all', count(enc_read($A, '333')), 1);

// the endpoints, on a local server with stand-in accounts, sessions and backups
$cfg = __DIR__ . '/../../includes/config.php';
if (!is_file($cfg)) echo "skipped the endpoint checks: no includes/config.php for sign-in\n";
else {
    $port = 8124 + (int)getenv('CHECK_PORT_SHIFT');
    $T = sys_get_temp_dir() . '/enc-test-web-' . getmypid();
    @mkdir("$T/sessions", 0777, true);
    $sid = 'enccheck0000000000000000000000000';
    file_put_contents("$T/sessions/sess_$sid", 'user|' . serialize(['sub' => '111', 'email' => 'me@example.com', 'name' => 'Me']));
    $php = PHP_BINARY;
    $j = fn($x) => json_decode(json_encode($x), true); // as it comes over HTTP
    $env = array_merge(getenv(), ['DND_ACCOUNTS' => "$T/accounts", 'DND_SESSIONS' => "$T/sessions", 'DND_MONSTER_BACKUPS' => "$T/monster-backups"]);
    $root = realpath(__DIR__ . '/../..');
    $srv = proc_open([$php, '-S', "127.0.0.1:$port", '-t', $root, "$root/_dev/router.php"], [['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'], ['file', sys_get_temp_dir() . "/enc-test-$port.log", 'a'], ['file', sys_get_temp_dir() . "/enc-test-$port.log", 'a']], $pipes, $root, $env);
    $req = function ($method, $path, $body = null, $signed = true, $type = 'application/json') use ($port, $sid) {
        $ctx = stream_context_create(['http' => ['method' => $method, 'ignore_errors' => true, 'timeout' => 10,
            'header' => ($signed ? "Cookie: dndsid=$sid\r\n" : '') . ($body !== null ? "Content-Type: $type\r\n" : ''), 'content' => $body ?? '']]);
        $out = @file_get_contents("http://127.0.0.1:$port$path", false, $ctx);
        preg_match('#^HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $m);
        return [(int)($m[1] ?? 0), json_decode((string)$out, true)];
    };
    for ($t = 0; $t < 50 && $req('GET', '/sheets/monster/encounters.php', null, false)[0] === 0; $t++) usleep(100000);
    // the party read (ROADMAP 3.2): the DM and co-DMs only; 404 says "gone" so the sheet can tell it from being offline
    $write = function ($f, $x) use ($T) { @mkdir(dirname("$T/accounts/$f"), 0777, true); file_put_contents("$T/accounts/$f", json_encode($x)); };
    foreach (['charaaaaaaa1' => [['level' => 2], ['level' => 3]], 'charaaaaaaa2' => [], 'charaaaaaaa3' => [['level' => 7]], 'charaaaaaaa4' => [['level' => 9]]] as $cid => $cl) {
        $write("characters/$cid/character.json", ['id' => $cid, 'name' => $cid === 'charaaaaaaa2' ? '' : "N$cid", 'classes' => $cl] + ($cid === 'charaaaaaaa3' ? ['draft' => 1] : []));
        $write("characters/$cid/meta.json", ['owner' => '222', 'created' => 1] + ($cid === 'charaaaaaaa4' ? ['archived' => 9] : []));
    }
    $link = fn($ids) => array_map(fn($i) => ['sheet' => 'player', 'id' => $i], $ids);
    $write('campaigns/aaaaaaaaaaaa/campaign.json', ['id' => 'aaaaaaaaaaaa', 'name' => 'Mine', 'dm' => '111', 'members' => [['sub' => '111', 'characters' => []], ['sub' => '222', 'characters' => $link(['charaaaaaaa1', 'charaaaaaaa2', 'charaaaaaaa3', 'charaaaaaaa4', 'missingchar1'])]]]);
    $write('campaigns/bbbbbbbbbbbb/campaign.json', ['id' => 'bbbbbbbbbbbb', 'name' => 'Theirs', 'dm' => '222', 'members' => [['sub' => '222', 'characters' => []], ['sub' => '111', 'characters' => []]]]);
    $write('campaigns/cccccccccccc/campaign.json', ['id' => 'cccccccccccc', 'name' => 'Co-run', 'dm' => '222', 'codms' => ['111'], 'members' => [['sub' => '222', 'characters' => []], ['sub' => '111', 'characters' => []]]]);
    $is('party: signed out', $req('GET', '/sheets/monster/party.php?c=aaaaaaaaaaaa', null, false)[0], 401);
    $is('party: the DM gets total levels, the draft marked, no archived or missing ones', $req('GET', '/sheets/monster/party.php?c=aaaaaaaaaaaa'), [200, ['name' => 'Mine', 'chars' => [
        ['id' => 'charaaaaaaa1', 'name' => 'Ncharaaaaaaa1', 'level' => 5, 'draft' => false], ['id' => 'charaaaaaaa2', 'name' => 'Unnamed character', 'level' => 0, 'draft' => false], ['id' => 'charaaaaaaa3', 'name' => 'Ncharaaaaaaa3', 'level' => 7, 'draft' => true]]]]);
    $is('party: a player is turned away, as gone', $req('GET', '/sheets/monster/party.php?c=bbbbbbbbbbbb'), [404, ['error' => 'No such campaign.', 'gone' => true]]);
    $is('party: a co-DM may read', $req('GET', '/sheets/monster/party.php?c=cccccccccccc')[0], 200);
    $is('party: no such campaign', $req('GET', '/sheets/monster/party.php?c=dddddddddddd')[1]['gone'] ?? false, true);
    $is('party: bad id', $req('GET', '/sheets/monster/party.php?c=../x')[0], 404);
    $is('signed out: 401', $req('GET', '/sheets/monster/encounters.php', null, false)[0], 401);
    $is('signed out: no save', $req('POST', '/sheets/monster/encounters.php', '{"encs":[]}', false)[0], 401);
    $is('empty list at first', $req('GET', '/sheets/monster/encounters.php'), [200, ['encs' => []]]);
    $is('JSON only', $req('POST', '/sheets/monster/encounters.php', 'encs=1', true, 'application/x-www-form-urlencoded')[0], 415);
    $is('save merges and answers the list', $req('POST', '/sheets/monster/encounters.php', json_encode(['encs' => [$e('a', 5, 'Cave')]])), $j([200, ['encs' => [$e('a', 5, 'Cave')]]]));
    $is('the list comes back', $req('GET', '/sheets/monster/encounters.php'), $j([200, ['encs' => [$e('a', 5, 'Cave')]]]));
    $is('stored apart from the monsters', [is_file("$T/accounts/monster-encounters/111.json"), is_file("$T/accounts/monsters/111/_encounters.json")], [true, false]);
    // cloud.php refuses monster ids starting with "_"
    $mon = fn($id) => json_encode(['id' => $id, 'updated' => 1, 'name' => 'Goblin', 'abilities' => []]);
    $is('cloud.php: "_" id refused', $req('POST', '/sheets/monster/cloud.php', $mon('_encounters'))[0], 400);
    $is('cloud.php: "_" id not fetched', $req('GET', '/sheets/monster/cloud.php?id=_encounters')[0], 404);
    $is('cloud.php: a normal id saves', $req('POST', '/sheets/monster/cloud.php', $mon('gob1'))[0], 200);
    $is('cloud.php: the list has only monsters', $req('GET', '/sheets/monster/cloud.php')[1]['chars'], ['gob1' => 1]);
    // the encounter list is backed up beside the monster folders, a new version only when it changed
    $req('POST', '/sheets/monster/backup.php?encs', json_encode(['encs' => [$e('a', 5)]]), false);
    $req('POST', '/sheets/monster/backup.php?encs', json_encode(['encs' => [$e('a', 5)]]), false);
    $req('POST', '/sheets/monster/backup.php?encs', json_encode(['encs' => [$e('a', 6)]]), false);
    $files = array_map('basename', glob("$T/monster-backups/127.0.0.1/encounters-*.json") ?: []);
    sort($files);
    $is('backups: two versions', $files, ['encounters-1.json', 'encounters-2.json']);
    $is('backups: not a list refused', $req('POST', '/sheets/monster/backup.php?encs', '{"x":1}', false)[0], 400);
    $is('backups: monsters still back up', $req('POST', '/sheets/monster/backup.php', $mon('gob1'), false), [200, ['version' => 1]]);
    proc_terminate($srv);
    proc_close($srv);
}
echo $bad ? "$bad failed\n" : "monster encounters ok\n";
exit($bad ? 1 : 0);
