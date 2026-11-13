<?php
// Checks the battle maps (ROADMAP 1.6, includes/maps.php and campaigns/maps.php): the live fog is cut out of the players' copy, a
// map from before live fog keeps what players saw, no hidden or fogged monster, drawing or overlay and no original picture reaches
// a player, copies have their own HP, non-members are refused and only pictures are taken.   usage: php _dev/scripts/maps.test.php   (the endpoint part needs includes/config.php)
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

// the grid: partial edge squares count
$is('cells, offset 0', mp_cells(['s' => 100, 'ox' => 0, 'oy' => 0], 400, 300), [0, 0, 4, 3]);
$is('cells, offset 30: partial squares at both edges', mp_cells(['s' => 100, 'ox' => 30, 'oy' => 0], 400, 300), [-70, 0, 5, 3]);
$is('grid: too small refused', $op('111', ['op' => 'grid', 's' => 4, 'ox' => 0, 'oy' => 0])[0], 400);
$is('grid set', $op('111', ['op' => 'grid', 's' => 100, 'ox' => 0, 'oy' => 0])[0], 200);
$is('players may not change the grid', $op('222', ['op' => 'grid', 's' => 50, 'ox' => 0, 'oy' => 0])[0], 403);
$is('the old draft and send are gone', [$op('111', ['op' => 'draft', 'fog' => '1'])[0], $op('111', ['op' => 'send'])[0]], [400, 400]);

// size from the creature type text
$is('sizes', array_map('mp_size_of', ['Large giant', 'tiny beast', 'Gargantuan dragon', 'humanoid (goblinoid)']), ['L', 'T', 'G', 'M']);

// what stands in the clear, from the map's saved "sight" (every screen draws the fog itself)
$sees = fn($file, $x, $y) => mp_sight_any(json_decode(file_get_contents(dirname($file) . '/map.json'), true), $x, $y, $x, $y);
$fogged = fn($file, $x, $y) => !$sees($file, $x, $y);
$open = fn($file, $x, $y) => $sees($file, $x, $y);

// a new upload is clear, and not on the table until the DM says so
$is('a new map has no fog', [mp_read($A, $c['id'], $m['id'])['fog']['ops'], $open("$dir/live.webp", 50, 150)], [[], true]);
$is('off the table: players get no map', mp_view($A, $c, '222')['map'], null);
$is('activate', $op('111', ['op' => 'activate'])[0], 200);
$pv = mp_view($A, $c, '222');
$is('players get the picture and the fog strokes, nothing else of the DM\'s', [str_contains($pv['map']['img'], 'img=work'), isset($pv['map']['fog']['ops']), isset($pv['map']['fog']['sight']), isset($pv['map']['sent']), isset($pv['map']['enc'])], [true, true, false, false, false]);
$is('hide takes it off the table', [$op('111', ['op' => 'hide'])[0], mp_view($A, $c, '222')['map'], $op('111', ['op' => 'activate'])[0]], [200, null, 200]);

// a map from before live fog: its sent fog (top row revealed) becomes ops, players see the same, an unsent draft stays private
file_put_contents($png, $bytes);
[, $old] = mp_create($A, $c, '111', 'Old', $png);
$oldDir = mp_root($A, $c['id']) . "/{$old['id']}";
$legacy = mp_read($A, $c['id'], $old['id']);
unset($legacy['fog']);
$legacy['grid'] = ['s' => 100, 'ox' => 0, 'oy' => 0];
$legacy['sent'] = ['n' => 3, 'grid' => $legacy['grid'], 'fog' => '111100000000', 'at' => 1];
$legacy['draft'] = '111111111111';
mp_write($A, $c['id'], $legacy);
@unlink("$oldDir/live.webp");
mp_op($A, $c, '111', ['op' => 'activate', 'm' => $old['id']]);
$read = mp_read($A, $c['id'], $old['id']);
$is('upgraded on the first change, keeping the old fields', [$read['fog']['n'], $read['sent']['fog'], $read['draft']], [4, '111100000000', '111111111111']);
$is('upgrade: revealed stays revealed', [$open("$oldDir/live.webp", 50, 50), $open("$oldDir/live.webp", 399, 90)], [true, true]);
$is('upgrade: fogged stays fogged, the draft isn\'t used', [$fogged("$oldDir/live.webp", 50, 150), $fogged("$oldDir/live.webp", 399, 299), $fogged("$oldDir/live.webp", 200, 101)], [true, true, true]);
// a map never sent: fully fogged; and upgrading on view (with no change first)
$legacy2 = $read;
unset($legacy2['fog']);
$legacy2['sent'] = null;
mp_write($A, $c['id'], $legacy2);
$pv = mp_view($A, $c, '222');
$is('never sent: upgraded on view, all fogged', [mp_read($A, $c['id'], $old['id'])['fog']['ops'], $fogged("$oldDir/live.webp", 50, 50), $pv['map']['n']], [[['on' => true, 'all' => true]], true, 1]);
mp_op($A, $c, '111', ['op' => 'activate', 'm' => $m['id']]);

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
$is('a party token for the DM: its character and bonus', [$tok($dv, 'Lock')['char'], $tok($dv, 'Lock')['bonus']], ['lock', 0]);
$is('a monster token for the DM: whose it is', $tok($dv, 'Goblin')['by'], '111');
// place everything: goblin in square (0,0), ogre (2x2) at squares (2..3, 0..1), lair in (3,2), Lock in (1,2)
foreach ([['Goblin', 0, 0], ['Ogre', 200, 0], ['Lair', 300, 200], ['Lock', 100, 200]] as [$n, $x, $y]) $op('111', ['op' => 'move', 'k' => $tok($dv, $n)['k'], 'x' => $x, 'y' => $y, 'placed' => true]);
$names = fn($v) => array_column($v['map']['tokens'], 'name');

// fog: cover everything, reveal the top row with a polygon
$is('players may not change the fog', $op('222', ['op' => 'fog', 'add' => ['on' => true, 'all' => true]])[0], 403);
foreach ([['on' => true], ['on' => 'x', 'all' => true], ['on' => true, 'poly' => [[1, 1], [2, 2]]], ['on' => true, 'poly' => [['a', 1], [2, 2], [3, 3]]], ['on' => true, 'shape' => 'star', 'r' => 5, 'pts' => [[1, 1]]],
    ['on' => true, 'shape' => 'round', 'r' => 5, 'pts' => array_fill(0, 5001, [1, 1])], ['on' => true, 'shape' => 'round', 'r' => -5, 'pts' => [[1, 1]]]] as $i => $badOp)
    $is("a bad fog op refused ($i)", $op('111', ['op' => 'fog', 'add' => $badOp])[0], 400);
$is('cover all', $op('111', ['op' => 'fog', 'add' => ['on' => true, 'all' => true]]), [200, ['n' => 2], [[['type' => 'map'], null]]]);
$is('all fogged', [$fogged("$dir/live.webp", 50, 50), $fogged("$dir/live.webp", 399, 299)], [true, true]);
$is('all fogged: players see the party only', $names(mp_view($A, $c, '222')), ['Lock']);
$op('111', ['op' => 'fog', 'add' => ['on' => false, 'poly' => [[0, 0], [400, 0], [400, 100], [0, 100]]]]);
$is('the top row revealed, the picture back', [$open("$dir/live.webp", 50, 50), $open("$dir/live.webp", 350, 50)], [true, true]);
$is('the rest fogged', [$fogged("$dir/live.webp", 50, 150), $fogged("$dir/live.webp", 399, 299), $fogged("$dir/live.webp", 250, 250)], [true, true, true]);
$is('no copy of the picture per fog change', glob("$dir/public-*.webp"), []);
$is('a stroke in progress: live for all, not saved, the DM\'s only', [$op('111', ['op' => 'fogpv', 'add' => ['on' => true, 'shape' => 'round', 'r' => 5, 'pts' => [[1, 1]]]])[2][0][0]['type'], $op('222', ['op' => 'fogpv', 'add' => ['on' => true, 'shape' => 'round', 'r' => 5, 'pts' => [[1, 1]]]])[0], count(mp_read($A, $c['id'], $m['id'])['fog']['ops'])], ['mapfog', 403, 2]);
// strokes: a round reveal and a square cover, painted over
$op('111', ['op' => 'fog', 'add' => ['on' => false, 'shape' => 'round', 'r' => 30, 'pts' => [[60, 250], [200, 250]]]]);
$is('a round stroke reveals along its line', [$open("$dir/live.webp", 130, 250), $fogged("$dir/live.webp", 130, 200), $fogged("$dir/live.webp", 300, 250)], [true, true, true]);
$op('111', ['op' => 'fog', 'add' => ['on' => true, 'shape' => 'square', 'r' => 20, 'pts' => [[300, 50]]]]);
$is('a square stroke covers', [$fogged("$dir/live.webp", 300, 50), $open("$dir/live.webp", 350, 50)], [true, true]);
$now = mp_read($A, $c['id'], $m['id'])['fog'];
// Undo puts the list back
$is('fogset (Undo)', $op('111', ['op' => 'fogset', 'ops' => array_slice($now['ops'], 0, 2)])[1]['n'], $now['n'] + 1);
$is('undone: the strokes are gone', [$open("$dir/live.webp", 300, 50), $fogged("$dir/live.webp", 130, 250)], [true, true]);
$is('a bad list refused', $op('111', ['op' => 'fogset', 'ops' => [['on' => 1]]])[0], 400);

$pv = mp_view($A, $c, '222');
$n = $pv['map']['n'];
$is('players: the same picture whatever the fog', str_contains($pv['map']['img'], 'img=work'), true);
$is('players: goblin in sight, hidden ogre and fogged lair left out', $names($pv), ['Goblin', 'Lock']);
$js = json_encode($pv);
$is('nothing for players about the original, the draft or hidden things', [str_contains($js, 'original'), str_contains($js, 'draft'), str_contains($js, 'Ogre'), str_contains($js, 'hidden'), str_contains($js, '"111"'), str_contains($js, '"hp"')], [false, false, false, false, false, true]);
$is('HP: only on the player\'s own token', array_keys(array_filter(array_column($pv['map']['tokens'], 'hp', 'name'))), ['Lock']);
$is('a DM sees the ops and the working copy', [count(mp_view($A, $c, '111')['map']['fog']['ops']), str_contains(mp_view($A, $c, '111')['map']['img'], 'img=work')], [2, true]);

// drawings and overlays: under fog or hidden, players never get them
$is('a drawing', $op('111', ['op' => 'draw', 'add' => ['c' => 1, 's' => 2, 'pts' => [[50, 50], [60, 60]]]])[0], 200);
$op('111', ['op' => 'draw', 'add' => ['c' => 3, 's' => 2, 'pts' => [[350, 280]]]]);
$is('a bad drawing refused', $op('111', ['op' => 'draw', 'add' => ['c' => 1, 's' => 2, 'pts' => []]])[0], 400);
$ov = fn($id, $x, $y, $extra = []) => $extra + ['id' => $id, 'type' => 'circle', 'x' => $x, 'y' => $y, 'len' => 20, 'ang' => 0, 'color' => 1, 'pat' => 2];
$op('111', ['op' => 'overlay', 'o' => $ov('seen', 50, 50)]);
$op('111', ['op' => 'overlay', 'o' => $ov('dark', 350, 280)]);
$op('111', ['op' => 'overlay', 'o' => $ov('hide', 60, 60, ['hidden' => true, 'group' => 'g1'])]);
$is('a bad overlay refused', $op('111', ['op' => 'overlay', 'o' => ['id' => 'x', 'type' => 'blob']])[0], 400);
$pv = mp_view($A, $c, '222');
$is('players: the drawing in sight only', array_column($pv['map']['draws'], 'c'), [1]);
$is('players: the overlay in sight only, without the DM\'s marks', [array_column($pv['map']['overlays'], 'id'), array_key_exists('hidden', $pv['map']['overlays'][0]), array_key_exists('group', $pv['map']['overlays'][0])], [['seen'], false, false]);
$is('the DM: all of them', [count(mp_view($A, $c, '111')['map']['draws']), array_column(mp_view($A, $c, '111')['map']['overlays'], 'id')], [2, ['seen', 'dark', 'hide']]);
$is('overlay upsert by id', [$op('111', ['op' => 'overlay', 'o' => $ov('seen', 70, 70)])[0], count(mp_read($A, $c['id'], $m['id'])['overlays'])], [200, 3]);
$is('overlay delete and clear drawings', [$op('111', ['op' => 'overlaydel', 'ids' => ['dark', 'hide']])[0], $op('111', ['op' => 'drawset', 'draws' => []])[0], count(mp_read($A, $c['id'], $m['id'])['overlays']), mp_read($A, $c['id'], $m['id'])['draws']], [200, 200, 1, []]);
// players draw, on the map on the table only, and erase only their own lines; nobody learns who drew what
$dmLine = $op('111', ['op' => 'draw', 'add' => ['c' => 1, 's' => 2, 'pts' => [[20, 20]]]])[1]['id'];
$patLine = $op('222', ['op' => 'draw', 'add' => ['c' => 2, 's' => 2, 'pts' => [[30, 30]]]])[1]['id'] ?? null;
$is('a player draws; an overlay stays the DM\'s', [is_string($patLine), $op('222', ['op' => 'overlay', 'o' => $ov('p', 1, 1)])[0]], [true, 403]);
$op('222', ['op' => 'drawdel', 'ids' => [$dmLine, $patLine]]);
$ids = fn($who) => array_column(mp_view($A, $c, $who)['map']['draws'], 'id');
$is("a player erases their own line, never the DM's", $ids('111'), [$dmLine]);
$is("a player can't clear them all", $op('222', ['op' => 'drawset', 'draws' => []])[0], 403);
$is('marked as theirs, with no account id', [mp_view($A, $c, '111')['map']['draws'][0]['mine'], mp_view($A, $c, '222')['map']['draws'][0]['mine'], isset(mp_view($A, $c, '222')['map']['draws'][0]['by'])], [true, false, false]);
$op('111', ['op' => 'drawdel', 'ids' => [$dmLine]]);

// pings and trails: for everyone, relayed, never saved
$before = file_get_contents("$dir/map.json");
[$code, , $live] = $op('222', ['op' => 'trail', 'id' => 't1', 'pts' => [[1, 2], [3, 4]], 'color' => 1]);
$is('a player points', [$code, $live[0][0]['type'], $live[0][0]['pts']], [200, 'maptrail', [[1.0, 2.0], [3.0, 4.0]]]);
$is('neither is saved', file_get_contents("$dir/map.json"), $before);

// a move into fog: the DM hears it, players are told it's gone; a move into sight reaches them
$gk = $tok($dv, 'Goblin')['k'];
// the action log (ROADMAP "Stats data"): a finished move is a line, each step of a drag isn't
$moves = function () use ($A, $c) { $n = []; foreach (glob("$A/stats/campaigns/{$c['id']}/*.jsonl") ?: [] as $f) foreach (file($f) as $l) if (($x = json_decode($l, true))['t'] === 'token') $n[] = $x; return $n; };
$was = count($moves());
$op('111', ['op' => 'move', 'k' => $gk, 'x' => 100, 'y' => 0, 'placed' => true, 'drag' => true]);
$is('a step of a drag is no line in the action log', count($moves()), $was);
[, , $live] = $op('111', ['op' => 'move', 'k' => $gk, 'x' => 0, 'y' => 200, 'placed' => true]);
$ln = array_slice($moves(), -1)[0];
$is('a finished move is a line: who, from, to, grid, by', [$ln['k'], $ln['from'], $ln['to'], is_numeric($ln['grid']), $ln['by']], [$gk, [100, 0], [0, 200], true, 'dm']);
$is('goblin into the fog: players get "gone"', array_map(fn($l) => [$l[0]['gone'] ?? false, $l[1] === 'dm'], $live), [[false, true], [true, false]]);
$is('goblin left out for players now', $names(mp_view($A, $c, '222')), ['Lock']);
[, , $live] = $op('111', ['op' => 'move', 'k' => $gk, 'x' => 100, 'y' => 0, 'placed' => true]);
$is('back into sight: players get the move', [count($live), $live[1][0]['x'] ?? null], [2, 100.0]);
// the hidden ogre moving never reaches players
[, , $live] = $op('111', ['op' => 'move', 'k' => $tok($dv, 'Ogre')['k'], 'x' => 0, 'y' => 0, 'placed' => true]);
$is('hidden ogre moves: the DM only', array_map(fn($l) => $l[1], $live), ['dm']);
// players move their own token only
$lockK = $tok($dv, 'Lock')['k'];
$is('Pat moves Lock', $op('222', ['op' => 'move', 'k' => $lockK, 'x' => 0, 'y' => 0, 'placed' => true])[0], 200);
$is("Pat can't move the goblin or the DM's character", [$op('222', ['op' => 'move', 'k' => $gk, 'x' => 0, 'y' => 0, 'placed' => true])[0], $op('222', ['op' => 'move', 'k' => $tok($dv, 'Dmpc')['k'], 'x' => 0, 'y' => 0, 'placed' => true])[0]], [403, 403]);
$is("another player's token in the tray isn't sent to Pat", in_array('Dmpc', $names(mp_view($A, $c, '222')), true), false);
// Pat's own token: size only; a locked token stays put
$is('Pat resizes Lock', [$op('222', ['op' => 'token', 'k' => $lockK, 'size' => 'L'])[0], $tok(mp_view($A, $c, '222'), 'Lock')['size']], [200, 'L']);
$is('and nothing else about it', [$op('222', ['op' => 'token', 'k' => $lockK, 'ring' => '#ff0000'])[0], $tok(mp_view($A, $c, '111'), 'Lock')['ring']], [200, '']);
$is("not someone else's", [$op('222', ['op' => 'token', 'k' => $tok($dv, 'Dmpc')['k'], 'size' => 'L'])[0], $op('222', ['op' => 'token', 'k' => $gk, 'size' => 'L'])[0]], [403, 403]);
$op('111', ['op' => 'token', 'k' => $lockK, 'size' => 'M', 'locked' => true]);
$is('locked: Pat can\'t move it, the server lets the DM', [$op('222', ['op' => 'move', 'k' => $lockK, 'x' => 100, 'y' => 0, 'placed' => true])[0], $op('111', ['op' => 'token', 'k' => $lockK, 'locked' => false])[0]], [403, 200]);
// the handles (2026-11-12): any size and any angle, for players on their own token too; picking a size again drops the dragged one
$is('Pat turns and drags Lock to 1.37 squares', [$op('222', ['op' => 'token', 'k' => $lockK, 'rot' => -90, 'sq' => 1.374])[0], array_intersect_key($tok(mp_view($A, $c, '111'), 'Lock'), ['sq' => 1, 'rot' => 1])], [200, ['sq' => 1.37, 'rot' => 270.0]]);
$is('too small, too big, not an angle', [$op('111', ['op' => 'token', 'k' => $lockK, 'sq' => 0.1])[0], $op('111', ['op' => 'token', 'k' => $lockK, 'sq' => 31])[0], $op('111', ['op' => 'token', 'k' => $lockK, 'rot' => 'x'])[0]], [400, 400, 400]);
$is('a dragged size counts for fog', mp_span(mp_read($A, $c['id'], $m['id']), ['size' => 'M', 'sq' => 2.5]), 250.0);
$op('111', ['op' => 'token', 'k' => $lockK, 'size' => 'M', 'rot' => 360]);
$is('a size picked drops sq; 360 is upright', array_intersect_key($tok(mp_view($A, $c, '111'), 'Lock'), ['sq' => 1, 'rot' => 1]), ['sq' => null, 'rot' => 0.0]);
// art: a plain token keeps its own; a character's or monster's is its sheet's; players can't set it with a token op
$px = 'data:image/png;base64,iVBORw0KGgo=';
$lairK = null; foreach (mp_view($A, $c, '111')['map']['tokens'] as $x) if ($x['kind'] === 'plain') $lairK = $x['k'];
$is('plain token art saved and sent', [$op('111', ['op' => 'token', 'k' => $lairK, 'art' => $px])[0], $tok(mp_view($A, $c, '111'), 'Lair')['art']], [200, $px]);
$is('not a picture, not a plain token', [$op('111', ['op' => 'token', 'k' => $lairK, 'art' => 'https://x.example/a.png'])[0], $op('111', ['op' => 'token', 'k' => $gk, 'art' => $px])[0], $op('111', ['op' => 'token', 'k' => $lockK, 'art' => $px])[0]], [400, 400, 400]);
$op('222', ['op' => 'token', 'k' => $lockK, 'art' => $px]);
$is("a player's token op never sets art", $tok(mp_view($A, $c, '111'), 'Lock')['art'], '');
$op('111', ['op' => 'token', 'k' => $lairK, 'art' => '']);
// map pictures (2026-11-13): anyone adds, moves, sizes, turns and removes them; the DM hides; fog and hidden keep them from players
$mm = fn() => mp_read($A, $c['id'], $m['id']);
$pa = mp_pic_add($A, $c['id'], '222', $mm(), $bytes, 50, 50);
$pid = $pa[1]['id'] ?? '';
$pp = $mm()['pics'][0] ?? [];
$is('a picture: saved as WebP, 2 squares on its longest side, keeping its shape', [$pa[0], is_file(mp_root($A, $c['id']) . "/{$m['id']}/pics/$pid.webp"), (float)$pp['w'], (float)$pp['h']], [200, true, 200.0, 150.0]);
$is('not a picture', mp_pic_add($A, $c['id'], '222', $mm(), 'hello', 0, 0)[0], 415);
$is('Pat moves, sizes and turns it; the shape stays', [$op('222', ['op' => 'pic', 'id' => $pid, 'o' => ['x' => 60, 'y' => 70, 'w' => 100, 'rot' => -45, 'hidden' => true]])[0], array_map(fn($v) => is_bool($v) ? $v : (float)$v, array_intersect_key($mm()['pics'][0], array_flip(['x', 'y', 'w', 'h', 'rot', 'hidden'])))],
    [200, ['x' => 60.0, 'y' => 70.0, 'w' => 100.0, 'h' => 75.0, 'rot' => 315.0, 'hidden' => false]]);
$is('too small, not a number', [$op('222', ['op' => 'pic', 'id' => $pid, 'o' => ['w' => 1]])[0], $op('222', ['op' => 'pic', 'id' => $pid, 'o' => ['x' => 'a']])[0]], [400, 400]);
$pv = fn($sub) => array_column(mp_view($A, $c, $sub)['map']['pics'], 'id');
$is('players get it, with its address', [$pv('222'), str_contains(mp_view($A, $c, '222')['map']['pics'][0]['src'], "pic=$pid")], [[$pid], true]);
$op('111', ['op' => 'pic', 'id' => $pid, 'o' => ['hidden' => true]]);
$is('hidden by the DM: players never get it, nor change it', [$pv('222'), $pv('111'), $op('222', ['op' => 'pic', 'id' => $pid, 'o' => ['x' => 1]])[0], $op('222', ['op' => 'picdel', 'ids' => [$pid]])[0]], [[], [$pid], 404, 404]);
$op('111', ['op' => 'pic', 'id' => $pid, 'o' => ['hidden' => false]]);
$is('Pat removes it; the file stays', [$op('222', ['op' => 'picdel', 'ids' => [$pid]])[0], $mm()['pics'], is_file(mp_root($A, $c['id']) . "/{$m['id']}/pics/$pid.webp")], [200, [], true]);
$is('own token: its character id for its owner, not for others', [$tok(mp_view($A, $c, '222'), 'Lock')['char'], isset($tok(mp_view($A, $c, CP_TABLE), 'Lock')['char'])], ['lock', false]);
// the DM's token fields
$is('ring, name badge, group, conditions', [$op('111', ['op' => 'token', 'k' => $gk, 'ring' => '#00ff00', 'noName' => true, 'group' => 'g1', 'cond' => ['Prone', ' ']])[0], $op('111', ['op' => 'token', 'k' => $gk, 'ring' => 'red'])[0]], [200, 400]);
$g = $tok(mp_view($A, $c, '111'), 'Goblin');
$is('saved', [$g['ring'], $g['noName'], $g['group'], $g['cond']], ['#00ff00', true, 'g1', ['Prone']]);
$pg = $tok(mp_view($A, $c, '222'), 'Goblin');
$is('players: no group or HP, the conditions and ring yes', [isset($pg['group']), isset($pg['hp']), $pg['cond'], $pg['ring']], [false, false, ['Prone'], '#00ff00']);
$is("a character's conditions and name are on the sheet", [$op('111', ['op' => 'token', 'k' => $lockK, 'cond' => ['Prone']])[0], $op('111', ['op' => 'token', 'k' => $lockK, 'name' => 'X'])[0]], [400, 400]);
// options: effects and AC for players
$save = file_get_contents("$A/monsters/111/gob.json");
$op('111', ['op' => 'token', 'k' => $gk, 'cond' => []]);
$hurt = json_decode($save, true); $hurt['hp']['cur'] = 1; file_put_contents("$A/monsters/111/gob.json", json_encode($hurt));
$is('bloodied by default', $tok(mp_view($A, $c, '222'), 'Goblin')['status'], 'bloodied');
$is('opts', $op('111', ['op' => 'opts', 'fx' => false, 'ac' => true])[1]['opts'], ['fx' => false, 'ac' => true]);
$is('effects off: looks healthy to players, the DM still sees it', [$tok(mp_view($A, $c, '222'), 'Goblin')['status'], $tok(mp_view($A, $c, '111'), 'Goblin')['status'], array_values(array_filter(fi_view($A, $c, '222')['entries'], fn($e) => $e['name'] === 'Goblin'))[0]['status']], ['healthy', 'bloodied', 'healthy']);
$op('111', ['op' => 'opts', 'fx' => true, 'ac' => false]);
file_put_contents("$A/monsters/111/gob.json", $save);
$is('players may not change the options', $op('222', ['op' => 'opts', 'fx' => false])[0], 403);

// copies: each its own HP, the sheet save never changes; survive the save going
$is('place: a bad monster refused', $op('111', ['op' => 'place', 'mon' => 'nobody', 'x' => 0, 'y' => 0])[0], 400);
$is("players can't place", $op('222', ['op' => 'place', 'mon' => 'wolf', 'x' => 0, 'y' => 0])[0], 403);
$wa = $op('111', ['op' => 'place', 'mon' => 'wolf', 'x' => 10, 'y' => 10, 'ac' => 13, 'bonus' => 2])[1]['k'];
$wb = $op('111', ['op' => 'place', 'mon' => 'wolf', 'x' => 110, 'y' => 10, 'ac' => 13, 'bonus' => 2])[1]['k'];
$wolfSave = file_get_contents("$A/monsters/111/wolf.json");
$dv2 = mp_view($A, $c, '111');
$is('copies are lettered and placed', [$tok($dv2, 'Wolf A')['k'], $tok($dv2, 'Wolf B')['k'], $tok($dv2, 'Wolf A')['suffix'], $tok($dv2, 'Wolf A')['placed'], $tok($dv2, 'Wolf A')['ac'], $tok($dv2, 'Wolf A')['hp']], [$wa, $wb, 'A', true, 13, ['cur' => 7, 'max' => 7, 'temp' => 0]]);
$is('damage to one copy', [$op('111', ['op' => 'copyhp', 'k' => $wa, 'hop' => ['k' => 'dmg', 'n' => 5]])[0], $op('111', ['op' => 'copyhp', 'k' => $wa, 'hop' => ['k' => 'nope']])[0], $op('222', ['op' => 'copyhp', 'k' => $wa, 'hop' => ['k' => 'dmg', 'n' => 5]])[0]], [200, 400, 403]);
$dv2 = mp_view($A, $c, '111');
$is('its own HP only, and bloodied', [$tok($dv2, 'Wolf A')['hp']['cur'], $tok($dv2, 'Wolf B')['hp']['cur'], $tok($dv2, 'Wolf A')['status'], $tok($dv2, 'Wolf B')['status']], [2, 7, 'bloodied', 'healthy']);
$is('the sheet save untouched', file_get_contents("$A/monsters/111/wolf.json"), $wolfSave);
$wc = $op('111', ['op' => 'paste', 'k' => $wa, 'x' => 210, 'y' => 10])[1]['k'];
$dv2 = mp_view($A, $c, '111');
$is('paste: a new letter, the HP it had, then its own', [$tok($dv2, 'Wolf C')['k'], $tok($dv2, 'Wolf C')['hp']['cur'], $op('111', ['op' => 'copyhp', 'k' => $wc, 'hop' => ['k' => 'heal', 'n' => 3]])[0], $tok(mp_view($A, $c, '111'), 'Wolf A')['hp']['cur']], [$wc, 2, 200, 2]);
$is('a copy renamed keeps its letter', [$op('111', ['op' => 'token', 'k' => $wb, 'name' => 'Dire'])[0], (bool)$tok(mp_view($A, $c, '111'), 'Dire B')], [200, true]);
// a copy in the fight: its own entry, its own turn state
$cpid = mp_read($A, $c['id'], $m['id'])['tokens'][$wa]['copy'];
$fop(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'wolf', 'copy' => $cpid, 'init' => 5]]]);
$fop(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'wolf', 'copy' => $cpid, 'init' => 5]]]);
$wE = array_values(array_filter(fi_view($A, $c, '111')['entries'], fn($e) => ($e['copy'] ?? null) === $cpid));
$is('one entry, with the copy\'s name and HP', [count($wE), $wE[0]['name'], $wE[0]['hp']['cur'], $wE[0]['ac']], [1, 'Wolf A', 2, 13]);
$is('the token and entry are one', $tok(mp_view($A, $c, '111'), 'Wolf A')['fight'], $wE[0]['id']);
// a Monster Sheet roll: every copy in the fight takes it, even after round 1, and no separate entry appears
$before = count(fi_read($A, $c['id'])['entries']);
$is('a sheet roll reaches the copies', fi_roll($A, $c, ['sub' => '111'], ['title' => 'Initiative', 'total' => 19, 'expr' => '1d20 + 2', 'vis' => 'hidden', 'mon' => 'wolf', 'fight' => fi_read($A, $c['id'])['n']]), true);
$is('...with no new entry', count(fi_read($A, $c['id'])['entries']), $before);
$is('...and their number', array_values(array_unique(array_column(array_filter(fi_read($A, $c['id'])['entries'], fn($e) => ($e['mon'] ?? '') === 'wolf' && !empty($e['copy'])), 'init'))), [19]);
// two sheet monsters with one name (an encounter's goblins) don't both read "A"
file_put_contents("$A/monsters/111/wolf2.json", str_replace('"wolf"', '"wolf2"', $wolfSave));
$wd = $op('111', ['op' => 'place', 'mon' => 'wolf2', 'x' => 310, 'y' => 10])[1]['k'];
$is('a second monster of that name takes the next letter', array_values(array_filter(mp_view($A, $c, '111')['map']['tokens'], fn($x) => $x['k'] === $wd))[0]['name'] !== 'Wolf A', true);
$op('111', ['op' => 'remove', 'k' => $wd]);
$is('fi_op copyhp reaches it', [fi_op($A, $c, ['op' => 'copyhp', 'copy' => $cpid, 'hop' => ['k' => 'heal', 'n' => 1]])[0], fi_view($A, $c, '111')['entries'][array_search($wE[0]['id'], array_column(fi_view($A, $c, '111')['entries'], 'id'))]['hp']['cur']], [200, 3]);
rename("$A/monsters/111/wolf.json", "$A/monsters/111/wolf.gone");
$is('a copy outlives the save', [$tok(mp_view($A, $c, '111'), 'Wolf A')['hp']['cur'], $op('111', ['op' => 'paste', 'k' => $wa, 'x' => 0, 'y' => 0])[0]], [3, 200]);
rename("$A/monsters/111/wolf.gone", "$A/monsters/111/wolf.json");
// the encounter on the panel
$is('enc saved, only real tokens', [$op('111', ['op' => 'enc', 'enc' => ['ids' => [$wa, $lockK], 'init' => [$wa => 12], 'side' => [$wa => 'enemy', $lockK => 'party']]])[0], $op('111', ['op' => 'enc', 'enc' => ['ids' => ['nope']]])[0]], [200, 400]);
$is('enc for the DM, not players', [mp_view($A, $c, '111')['map']['enc']['ids'], (array)mp_view($A, $c, '111')['map']['enc']['init'], isset(mp_view($A, $c, '222')['map']['enc'])], [[$wa, $lockK], [$wa => 12], false]);

// a grid change leaves the fog alone
$was = mp_read($A, $c['id'], $m['id'])['fog'];
$op('111', ['op' => 'grid', 's' => 50, 'ox' => 0, 'oy' => 0]);
$is('grid change: the fog stays', mp_read($A, $c['id'], $m['id'])['fog'], $was);
$op('111', ['op' => 'grid', 's' => 100, 'ox' => 0, 'oy' => 0]);

// the fight ends: every token stays where it is
$fop(['op' => 'end']);
$dv = mp_view($A, $c, '111');
$is('fight over: monsters stay put', [$tok($dv, 'Goblin')['placed'], (int)$tok($dv, 'Goblin')['x'], $tok($dv, 'Lock')['placed']], [true, 100, true]);
$is('fight over: a hidden monster stays hidden', [$tok($dv, 'Ogre')['hidden'], in_array('Ogre', $names(mp_view($A, $c, '222')), true)], [true, false]);
// taken out of a fight: the token stays too; one the sheet added still gets a tray token
$fop(['op' => 'start']);
$fop(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'wolf', 'init' => 3]]]);
$wolfE = array_values(array_filter(fi_read($A, $c['id'])['entries'], fn($e) => ($e['mon'] ?? '') === 'wolf' && empty($e['copy'])))[0];
$is('the sheet\'s wolf joins the tray', $tok(mp_view($A, $c, '111'), 'Wolf')['placed'], false);
$fop(['op' => 'remove', 'e' => $wolfE['id']]);
$is('removed from the fight: its token stays', (bool)$tok(mp_view($A, $c, '111'), 'Wolf'), true);
$fop(['op' => 'end']);
$is("players can't drop monsters", $op('222', ['op' => 'drop', 'mon' => 'wolf'])[0], 403);
$is('rename', [$op('111', ['op' => 'rename', 'name' => 'Lower crypt'])[0], mp_read($A, $c['id'], $m['id'])['name']], [200, 'Lower crypt']);
$op('111', ['op' => 'archive', 'on' => true]);
$is('archived: off the table, kept', [mp_view($A, $c, '222')['map'], is_file("$dir/map.json")], [null, true]);
$op('111', ['op' => 'archive', 'on' => false]);
$op('111', ['op' => 'activate']);
$n = mp_read($A, $c['id'], $m['id'])['fog']['n'];

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
    $is('non-member: 403', [$req('eve', 'GET', $q)[0], $req('eve', 'GET', "$q&m={$m['id']}&img=work")[0]], [403, 403]);
    [$code, $out] = $req('pat', 'GET', $q);
    $is('player view over HTTP', [$code, json_decode($out, true)['map']['id'] ?? null], [200, $m['id']]);
    $is('player response: no original, draft or hidden monster', [str_contains($out, 'original'), str_contains($out, 'draft'), str_contains($out, 'Ogre')], [false, false, false]);
    $is('player: the picture of the map on the table, never the original', [$req('pat', 'GET', "$q&m={$m['id']}&img=work")[0], $req('pat', 'GET', "$q&m={$m['id']}&img=original")[0]], [200, 403]);
    copy("$dir/work.webp", "$dir/public-1.webp"); // from before live fog
    $is('an older copy: the DM only', [$req('dm', 'GET', "$q&m={$m['id']}&img=public&n=1")[0], $req('pat', 'GET', "$q&m={$m['id']}&img=public&n=1")[0]], [200, 403]);
    [$code, $out] = $req('pat', 'POST', '/campaigns/maps.php', json_encode(['c' => $c['id'], 'm' => $m['id'], 'op' => 'fog', 'add' => ['on' => false, 'all' => true]]));
    $is('a player can\'t change the fog over HTTP', $code, 403);
    [$code, $out] = $req('dm', 'POST', '/campaigns/maps.php', json_encode(['c' => $c['id'], 'm' => $m['id'], 'op' => 'fogset', 'ops' => mp_read($A, $c['id'], $m['id'])['fog']['ops']]));
    $is('a DM can, and it\'s a new n', [$code, json_decode($out, true)['n'] ?? null], [200, $n + 1]);
    [$code, $out] = $req('dm', 'GET', "$q&mons");
    $wolfM = array_values(array_filter(json_decode($out, true)['monsters'], fn($x) => $x['id'] === 'wolf'))[0];
    $is('mons: what the Token Browser needs', [$wolfM['race'], $wolfM['size'], $wolfM['type'], $wolfM['hp'], $wolfM['src']], ['beast', 'M', 'beast', 7, '']);
    $is('player: the picture to draw fog over, never the original', [$req('pat', 'GET', "$q&m={$m['id']}&img=original")[0], $req('pat', 'GET', "$q&m={$m['id']}&img=work")[0]], [403, 200]);
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
    $is('form posts refused', $req('dm', 'POST', $q, 'op=fog', 'application/x-www-form-urlencoded')[0], 415);
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
