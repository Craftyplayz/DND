<?php
// Checks the battle maps (ROADMAP 1.6, includes/maps.php and campaigns/maps.php): the fog is cut into the players' copy, no
// hidden or fogged monster and no original picture reaches a player, non-members are refused, only pictures are taken,
// and every players' copy is kept.   usage: php _dev/scripts/maps.test.php   (the endpoint part needs includes/config.php)
// GD with WebP: built into the site's image; a local Windows PHP has it as a DLL that php.ini may not load
if (!extension_loaded('gd') && !getenv('MP_TEST_GD')) {
    putenv('MP_TEST_GD=1');
    exit(proc_close(proc_open([PHP_BINARY, '-d', 'extension=gd', __FILE__], [STDIN, STDOUT, STDERR], $pipes)));
}
if (!function_exists('imagewebp')) { echo "FAIL: PHP has no GD with WebP (php -d extension=gd)\n"; exit(1); }
require __DIR__ . '/../../includes/maps.php';
$A = sys_get_temp_dir() . '/mp-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
foreach ([['lock', '222', 'Lock'], ['dmpc', '111', 'Dmpc']] as [$id, $owner, $name]) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private', 'created' => 1, 'campaigns' => []]));
    file_put_contents("$A/characters/$id/character.json", json_encode(['id' => $id, 'name' => $name, 'updated' => 1, 'abilities' => []]));
}
@mkdir("$A/monsters/111", 0777, true);
foreach ([['gob', 'Goblin', 'Small humanoid'], ['ogre', 'Ogre', 'Large giant'], ['wolf', 'Wolf', 'beast']] as [$id, $name, $race])
    file_put_contents("$A/monsters/111/$id.json", json_encode(['id' => $id, 'name' => $name, 'race' => $race, 'updated' => 1, 'abilities' => [], 'hp' => ['cur' => 7, 'base' => 7, 'temp' => 0, 'mod' => 0]]));
$c = ['id' => 'abc000000001', 'name' => 'Maps', 'dm' => '111', 'code' => 'abcdefabcd', 'created' => 1, 'members' => [
    ['sub' => '111', 'name' => 'Dee', 'characters' => [['sheet' => 'player', 'id' => 'dmpc']]],
    ['sub' => '222', 'name' => 'Pat', 'characters' => [['sheet' => 'player', 'id' => 'lock']]]]];
cp_put($A, $c);

// a 400 x 300 white picture, 100 px squares: 4 x 3 squares
$png = sys_get_temp_dir() . '/mp-test-' . getmypid() . '.png';
$im = imagecreatetruecolor(400, 300);
imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
imagepng($im, $png);
$bytes = file_get_contents($png); // mp_create moves the upload into the map's folder
$is('not a picture refused', mp_create($A, $c, '111', 'Notes', __FILE__)[0], 400);
[$code, $m] = mp_create($A, $c, '111', 'Crypt', $png);
$is('a PNG makes a map', [$code, $m['w'], $m['h'], $m['ext']], [200, 400, 300, 'png']);
$dir = mp_root($A, $c['id']) . "/{$m['id']}";
$is('original kept as uploaded, working copy and thumbnail made', [is_file("$dir/original.png"), is_file("$dir/work.webp"), is_file("$dir/thumb.webp")], [true, true, true]);
// a big picture: everyone's copy is shrunk to 2048 px on its longest side, the original keeps its size
$big = sys_get_temp_dir() . '/mp-big-' . getmypid() . '.png';
imagepng(imagecreatetruecolor(5000, 2500), $big);
[, $bm] = mp_create($A, $c, '111', 'Big', $big);
$bw = getimagesize(mp_root($A, $c['id']) . "/{$bm['id']}/work.webp");
$is('big map: copy 2048 px wide, original 5000', [$bw[0], $bw[1], $bm['w']], [2048, 1024, 5000]);
mp_op($A, $c, '111', ['op' => 'archive', 'on' => true, 'm' => $bm['id']]);
$op = function ($sub, $body) use ($A, $c, $m) { return mp_op($A, $c, $sub, $body + ['m' => $m['id']]); };

// the grid: partial edge squares count; the draft starts fully fogged
$is('cells, offset 0', mp_cells(['s' => 100, 'ox' => 0, 'oy' => 0], 400, 300), [0, 0, 4, 3]);
$is('cells, offset 30: partial squares at both edges', mp_cells(['s' => 100, 'ox' => 30, 'oy' => 0], 400, 300), [-70, 0, 5, 3]);
$is('grid: too small refused', $op('111', ['op' => 'grid', 's' => 4, 'ox' => 0, 'oy' => 0])[0], 400);
$is('grid set', $op('111', ['op' => 'grid', 's' => 100, 'ox' => 0, 'oy' => 0])[0], 200);
$is('draft fully fogged', mp_read($A, $c['id'], $m['id'])['draft'], str_repeat('0', 12));
$is('players may not change the grid', $op('222', ['op' => 'grid', 's' => 50, 'ox' => 0, 'oy' => 0])[0], 403);
$is('a draft of the wrong size refused', $op('111', ['op' => 'draft', 'fog' => '1'])[0], 409);

// size from the creature type text
$is('sizes', array_map('mp_size_of', ['Large giant', 'tiny beast', 'Gargantuan dragon', 'humanoid (goblinoid)']), ['L', 'T', 'G', 'M']);

// on the table, never sent: players get no picture and no monsters, only the party
$is('activate', $op('111', ['op' => 'activate'])[0], 200);
$pv = mp_view($A, $c, '222');
$is('never sent: no picture for players', [$pv['map']['img'], $pv['map']['sent']], [null, null]);
// the fight: a goblin, an ogre (hidden) and a lair action join; their tokens wait in the tray
$fop = function ($body) use ($A, $c) {
    $before = fi_read($A, $c['id']);
    $r = fi_op($A, $c, $body + ['v' => $before['v'] ?? null]);
    mp_fight_sync($A, $c, $before, fi_read($A, $c['id']));
    return $r[0];
};
$fop(['op' => 'start']);
$fop(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'gob', 'init' => 12], ['kind' => 'monster', 'mon' => 'ogre', 'init' => 8], ['kind' => 'plain', 'name' => 'Lair', 'init' => 20]]]);
$ogreE = array_values(array_filter(fi_read($A, $c['id'])['entries'], fn($e) => ($e['mon'] ?? '') === 'ogre'))[0];
$fop(['op' => 'hide', 'e' => $ogreE['id'], 'on' => true]);
$dv = mp_view($A, $c, '111');
$tok = fn($v, $name) => array_values(array_filter($v['map']['tokens'], fn($t) => $t['name'] === $name))[0] ?? null;
$is('fight monsters get tray tokens, sized from their type', [$tok($dv, 'Goblin')['placed'], $tok($dv, 'Goblin')['size'], $tok($dv, 'Ogre')['size'], $tok($dv, 'Ogre')['hidden'], $tok($dv, 'Lair')['size']], [false, 'S', 'L', true, 'M']);
$is('party tokens always there, Medium', [$tok($dv, 'Lock')['size'], $tok($dv, 'Dmpc')['placed']], ['M', false]);
// place everything: goblin in square (0,0), ogre (2x2) at squares (2..3, 0..1), lair in (3,2), Lock in (1,2)
foreach ([['Goblin', 0, 0], ['Ogre', 200, 0], ['Lair', 300, 200], ['Lock', 100, 200]] as [$n, $x, $y]) $op('111', ['op' => 'move', 'k' => $tok($dv, $n)['k'], 'x' => $x, 'y' => $y, 'placed' => true]);
$names = fn($v) => array_column($v['map']['tokens'], 'name');
$is('never sent: players see the party only', $names(mp_view($A, $c, '222')), ['Lock']);

// reveal the top row in the draft: players still see full fog until it's sent
$is('draft saved', $op('111', ['op' => 'draft', 'fog' => '111100000000'])[0], 200);
$is('a draft is not sent', mp_view($A, $c, '222')['map']['sent'], null);
$is('players may not send', $op('222', ['op' => 'send'])[0], 403);
$is('send', $op('111', ['op' => 'send'])[0], 200);
$pub = imagecreatefromwebp("$dir/public-1.webp");
$px = fn($x, $y) => imagecolorat($pub, $x, $y) & 0xFFFFFF;
$is('revealed squares keep the picture', [$px(50, 50) > 0xE0E0E0, $px(350, 50) > 0xE0E0E0], [true, true]);
$is('fogged squares are black in the players\' copy', [$px(50, 150), $px(399, 299), $px(100, 101), $px(250, 250)], [0, 0, 0, 0]);
$pv = mp_view($A, $c, '222');
$is('players: the sent fog and its copy', [$pv['map']['sent']['fog'], str_contains($pv['map']['img'], 'img=public&n=1')], ['111100000000', true]);
$is('players: goblin in sight, hidden ogre and fogged lair left out', $names($pv), ['Goblin', 'Lock']);
$js = json_encode($pv);
$is('nothing for players about the original, the draft or hidden things', [str_contains($js, 'original'), str_contains($js, 'work'), str_contains($js, 'draft'), str_contains($js, 'Ogre'), str_contains($js, 'hidden'), str_contains($js, '"111"')], [false, false, false, false, false, false]);
// a move into fog: the DM hears it, players are told it's gone; a move into sight reaches them
$gk = $tok($dv, 'Goblin')['k'];
[, , $live] = $op('111', ['op' => 'move', 'k' => $gk, 'x' => 0, 'y' => 200, 'placed' => true]);
$is('goblin into the fog: players get "gone"', array_map(fn($l) => [$l[0]['gone'] ?? false, $l[1] === 'dm'], $live), [[false, true], [true, false]]);
$is('goblin left out for players now', $names(mp_view($A, $c, '222')), ['Lock']);
[, , $live] = $op('111', ['op' => 'move', 'k' => $gk, 'x' => 100, 'y' => 0, 'placed' => true]);
$is('back into sight: players get the move', [count($live), $live[1][0]['x'] ?? null], [2, 100.0]);
// the hidden ogre moving never reaches players
[, , $live] = $op('111', ['op' => 'move', 'k' => $tok($dv, 'Ogre')['k'], 'x' => 0, 'y' => 0, 'placed' => true]);
$is('hidden ogre moves: the DM only', array_map(fn($l) => $l[1], $live), ['dm']);
// players move their own token only
$is('Pat moves Lock', $op('222', ['op' => 'move', 'k' => $tok($dv, 'Lock')['k'], 'x' => 0, 'y' => 0, 'placed' => true])[0], 200);
$is("Pat can't move the goblin or the DM's character", [$op('222', ['op' => 'move', 'k' => $gk, 'x' => 0, 'y' => 0, 'placed' => true])[0], $op('222', ['op' => 'move', 'k' => $tok($dv, 'Dmpc')['k'], 'x' => 0, 'y' => 0, 'placed' => true])[0]], [403, 403]);
$is("another player's token in the tray isn't sent to Pat", in_array('Dmpc', $names(mp_view($A, $c, '222')), true), false);

// a grid change resets the draft; players keep the last sent fog and grid
$op('111', ['op' => 'grid', 's' => 50, 'ox' => 0, 'oy' => 0]);
$is('grid change: draft fully fogged again', mp_read($A, $c['id'], $m['id'])['draft'], str_repeat('0', 48));
$is('players keep the last send', [mp_view($A, $c, '222')['map']['sent']['fog'], (int)mp_view($A, $c, '222')['map']['sent']['grid']['s']], ['111100000000', 100]);
// a second send: a new copy, the first one kept
$op('111', ['op' => 'draft', 'fog' => str_repeat('1', 48)]);
$op('111', ['op' => 'send']);
$is('every players\' copy kept', [is_file("$dir/public-1.webp"), is_file("$dir/public-2.webp")], [true, true]);

// the fight ends: monsters and the lair action go back to the tray, keeping their last positions; party tokens stay
$fop(['op' => 'end']);
$dv = mp_view($A, $c, '111');
$is('fight over: monsters in the tray, positions kept', [$tok($dv, 'Goblin')['placed'], (int)$tok($dv, 'Goblin')['x'], $tok($dv, 'Lock')['placed']], [false, 100, true]);
// taken out of a fight: the token leaves the map
$fop(['op' => 'start']);
$fop(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'wolf', 'init' => 3]]]);
$wolfE = array_values(array_filter(fi_read($A, $c['id'])['entries'], fn($e) => ($e['mon'] ?? '') === 'wolf'))[0];
$is('wolf joins the map', (bool)$tok(mp_view($A, $c, '111'), 'Wolf'), true);
$fop(['op' => 'remove', 'e' => $wolfE['id']]);
$is('removed from the fight: off the map', $tok(mp_view($A, $c, '111'), 'Wolf'), null);
// a monster dropped on the map without a fight; archive and rename
$is('drop a monster without a fight', [$op('111', ['op' => 'drop', 'mon' => 'wolf'])[0], $tok(mp_view($A, $c, '111'), 'Wolf')['placed']], [200, false]);
$is("players can't drop monsters", $op('222', ['op' => 'drop', 'mon' => 'wolf'])[0], 403);
$is('rename', [$op('111', ['op' => 'rename', 'name' => 'Lower crypt'])[0], mp_read($A, $c['id'], $m['id'])['name']], [200, 'Lower crypt']);
$op('111', ['op' => 'archive', 'on' => true]);
$is('archived: off the table, kept', [mp_view($A, $c, '222')['map'], is_file("$dir/map.json")], [null, true]);
$op('111', ['op' => 'archive', 'on' => false]);
$op('111', ['op' => 'activate']);

// the endpoints, on a local server with stand-in accounts and sessions
$cfg = __DIR__ . '/../../includes/config.php';
if (!is_file($cfg)) echo "skipped the endpoint checks: no includes/config.php for sign-in\n";
else {
    $port = 8125 + (int)getenv('CHECK_PORT_SHIFT');
    $T = sys_get_temp_dir() . '/mp-test-web-' . getmypid();
    @mkdir("$T/sessions", 0777, true);
    $sids = ['dm' => 'mapcheckdm000000000000000000000000', 'pat' => 'mapcheckpat00000000000000000000000', 'eve' => 'mapcheckeve00000000000000000000000'];
    foreach ([['dm', '111', 'Dee'], ['pat', '222', 'Pat'], ['eve', '999', 'Eve']] as [$who, $sub, $name])
        file_put_contents("$T/sessions/sess_{$sids[$who]}", 'user|' . serialize(['sub' => $sub, 'email' => "$who@example.com", 'name' => $name]));
    $env = array_merge(getenv(), ['DND_ACCOUNTS' => $A, 'DND_SESSIONS' => "$T/sessions"]);
    $root = realpath(__DIR__ . '/../..');
    $gd = PHP_SHLIB_SUFFIX === 'dll' ? ['-d', 'extension=gd'] : []; // (a php.ini that loads it already only logs a warning)
    $srv = proc_open([PHP_BINARY, ...$gd, '-S', "127.0.0.1:$port", '-t', $root, "$root/_dev/router.php"], [['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'], ['file', sys_get_temp_dir() . "/mp-test-$port.log", 'a'], ['file', sys_get_temp_dir() . "/mp-test-$port.log", 'a']], $pipes, $root, $env);
    $req = function ($who, $method, $path, $body = null, $type = 'application/json') use ($port, $sids) {
        $ctx = stream_context_create(['http' => ['method' => $method, 'ignore_errors' => true, 'timeout' => 20,
            'header' => ($who ? "Cookie: dndsid={$sids[$who]}\r\n" : '') . ($body !== null ? "Content-Type: $type\r\n" : ''), 'content' => $body ?? '']]);
        $out = @file_get_contents("http://127.0.0.1:$port$path", false, $ctx);
        preg_match('#^HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $mm);
        return [(int)($mm[1] ?? 0), $out];
    };
    $q = "/campaigns/maps.php?c={$c['id']}";
    for ($t = 0; $t < 50 && $req(null, 'GET', $q)[0] === 0; $t++) usleep(100000);
    $is('signed out: 401', $req(null, 'GET', $q)[0], 401);
    $is('non-member: 403', [$req('eve', 'GET', $q)[0], $req('eve', 'GET', "$q&m={$m['id']}&img=public&n=2")[0]], [403, 403]);
    [$code, $out] = $req('pat', 'GET', $q);
    $is('player view over HTTP', [$code, json_decode($out, true)['map']['id'] ?? null], [200, $m['id']]);
    $is('player response: no original, work copy, draft or hidden monster', [str_contains($out, 'original'), str_contains($out, 'img=work'), str_contains($out, 'draft'), str_contains($out, 'Ogre')], [false, false, false, false]);
    $is('player: the current copy only', [$req('pat', 'GET', "$q&m={$m['id']}&img=public&n=2")[0], $req('pat', 'GET', "$q&m={$m['id']}&img=public&n=1")[0]], [200, 403]);
    $is('player: no original or work copy', [$req('pat', 'GET', "$q&m={$m['id']}&img=original")[0], $req('pat', 'GET', "$q&m={$m['id']}&img=work")[0]], [403, 403]);
    $is('DM: the original as uploaded', $req('dm', 'GET', "$q&m={$m['id']}&img=original")[1], file_get_contents("$dir/original.png"));
    $is("player can't ask for another map", json_decode($req('pat', 'GET', "$q&m=000000000000")[1], true)['map']['id'], $m['id']);
    // uploads: DM only, in chunks, pictures only
    $up = fn($who, $id, $i, $data) => $req($who, 'POST', "$q&up=$id&i=$i", $data, 'application/octet-stream')[0];
    $is('players may not upload', $up('pat', 'patupload01', 0, 'x'), 403);
    $half = intdiv(strlen($bytes), 2);
    $is('chunks in order', [$up('dm', 'dmupload01', 0, substr($bytes, 0, $half)), $up('dm', 'dmupload01', 2, 'x'), $up('dm', 'dmupload01', 1, substr($bytes, $half))], [200, 409, 200]);
    [$code, $out] = $req('dm', 'POST', '/campaigns/maps.php', json_encode(['c' => $c['id'], 'op' => 'upload', 'up' => 'dmupload01', 'name' => 'Second']));
    $is('a chunked PNG becomes a map', [$code, mp_read($A, $c['id'], json_decode($out, true)['map'] ?? '')['w'] ?? null], [200, 400]);
    $up('dm', 'dmupload02', 0, "%PDF-1.4 not a picture");
    [$code, $out] = $req('dm', 'POST', '/campaigns/maps.php', json_encode(['c' => $c['id'], 'op' => 'upload', 'up' => 'dmupload02', 'name' => 'Notes']));
    $is('other file types refused with a message', [$code, str_contains((string)json_decode($out, true)['error'], 'JPG, PNG, WebP or GIF')], [400, true]);
    $is('form posts refused', $req('dm', 'POST', $q, 'op=send', 'application/x-www-form-urlencoded')[0], 415);
    proc_terminate($srv);
    proc_close($srv);
    $rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
    $rm($T);
}
$rm = function ($p) use (&$rm) { if (is_dir($p) && !is_link($p)) { foreach (array_diff(scandir($p), ['.', '..']) as $f) $rm("$p/$f"); rmdir($p); } else @unlink($p); };
$rm($A);
@unlink($png);
echo $bad ? "$bad failed\n" : "maps ok\n";
exit($bad ? 1 : 0);
