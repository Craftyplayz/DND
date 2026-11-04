<?php
// Checks the Table view's role (ROADMAP 1.7): one campaign with every kind of secret in it (a hidden monster on its turn, monster
// and player HP, a hidden roll, a whisper, the fog's ops, a hidden token, a monster on a fogged square, the unmasked map, DM notes,
// a draft and a one-player handout) is fed through every filter as CP_TABLE, and none of it may come out. Then the requests:
// ?as=table only for the DM and co-DMs, and every change from the table tab refused.   usage: php _dev/scripts/table.test.php
if (!extension_loaded('gd') && !getenv('MP_TEST_GD')) {
    putenv('MP_TEST_GD=1');
    exit(proc_close(proc_open([PHP_BINARY, '-d', 'extension=gd', __FILE__], [STDIN, STDOUT, STDERR], $pipes)));
}
if (!function_exists('imagewebp')) { echo "FAIL: PHP has no GD with WebP (php -d extension=gd)\n"; exit(1); }
require __DIR__ . '/../../includes/maps.php';
require __DIR__ . '/../../includes/handouts.php';
$A = sys_get_temp_dir() . '/tv-test-' . getmypid();
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };

// the party: Lock (Pat's) is down with two death-save successes and Poisoned; Ozzy (Sam's) is fine, Prone
$char = function ($id, $owner, $name, $hp, $extra = []) use ($A) {
    @mkdir("$A/characters/$id", 0777, true);
    file_put_contents("$A/characters/$id/meta.json", json_encode(['owner' => $owner, 'visibility' => 'private', 'created' => 1, 'campaigns' => []]));
    file_put_contents("$A/characters/$id/character.json", json_encode($extra + ['id' => $id, 'name' => $name, 'updated' => 1, 'abilities' => [], 'hp' => $hp, 'calc' => ['hpMax' => 31]]));
};
$char('lock', '222', 'Lock', ['cur' => 0, 'base' => 31, 'temp' => 0, 'mod' => 0], ['conditions' => ['Poisoned', 'Unconscious'], 'panels' => [['type' => 'combat', 'ok' => 2, 'bad' => 1]]]);
$char('ozzy', '333', 'Ozzy', ['cur' => 23, 'base' => 31, 'temp' => 4, 'mod' => 0], ['conditions' => ['Prone']]);
@mkdir("$A/monsters/111", 0777, true);
foreach ([['gob', 'Goblin', 'Small humanoid', 3, 7], ['lurker', 'Secret Lurker', 'Large aberration', 41, 59], ['fogged', 'Shadow Fiend', 'Medium fiend', 13, 13]] as [$id, $name, $race, $cur, $max])
    file_put_contents("$A/monsters/111/$id.json", json_encode(['id' => $id, 'name' => $name, 'race' => $race, 'updated' => 1, 'abilities' => [], 'hp' => ['cur' => $cur, 'base' => $max, 'temp' => 0, 'mod' => 0]]));
$c = ['id' => 'tab000000001', 'name' => 'Table', 'dm' => '111', 'code' => 'abcdefabcd', 'created' => 1, 'codms' => ['444'], 'members' => [
    ['sub' => '111', 'name' => 'Dee', 'characters' => []], ['sub' => '222', 'name' => 'Pat', 'characters' => [['sheet' => 'player', 'id' => 'lock']]],
    ['sub' => '333', 'name' => 'Sam', 'characters' => [['sheet' => 'player', 'id' => 'ozzy']]], ['sub' => '444', 'name' => 'Cody', 'characters' => []]]];
cp_put($A, $c);
$CID = $c['id'];

// who reads as the table
$_GET['as'] = 'table';
$is('as=table: the DM and a co-DM read as the table', [cp_viewer($c, ['sub' => '111']), cp_viewer($c, ['sub' => '444'])], [CP_TABLE, CP_TABLE]);
$is('as=table: a player or a stranger is refused', [cp_viewer($c, ['sub' => '222']), cp_viewer($c, ['sub' => '999']), cp_viewer($c, null)], [null, null, null]);
unset($_GET['as']);
$is('without it, everyone is themselves', [cp_viewer($c, ['sub' => '111']), cp_viewer($c, ['sub' => '222'])], ['111', '222']);
$is('the table is nobody: not a member, not a DM', [cp_member($c, CP_TABLE), cp_is_dm($c, CP_TABLE), cp_is_owner($c, CP_TABLE)], [-1, false, false]);
$is("the table's live key is its own", in_array(cp_table_key($CID), [live_key($CID, '111'), live_key($CID, '444')], true), false);

// the fight: the hidden Secret Lurker has the turn; Goblin bloodied; everyone rolled in
$fi = fn($body) => fi_op($A, $c, $body + ['v' => fi_read($A, $CID)['v'] ?? null]);
fi_op($A, $c, ['op' => 'start']);
$fi(['op' => 'add', 'items' => [['kind' => 'monster', 'mon' => 'lurker', 'init' => 25, 'bonus' => 3, 'ac' => 17], ['kind' => 'monster', 'mon' => 'gob', 'init' => 12, 'bonus' => 2, 'ac' => 15],
    ['kind' => 'pc', 'char' => 'lock', 'init' => 18], ['kind' => 'pc', 'char' => 'ozzy', 'init' => 9]]]);
$lurker = array_values(array_filter(fi_read($A, $CID)['entries'], fn($e) => ($e['mon'] ?? '') === 'lurker'))[0]['id'];
$fi(['op' => 'hide', 'e' => $lurker, 'on' => true]);
$fi(['op' => 'round1']);
$is('the hidden monster has the turn', fi_read($A, $CID)['turn'], $lurker);

// the map: on the table, fog over the right half; the fogged monster stands in the dark
$png = "$A/map.png";
$im = imagecreatetruecolor(400, 300);
imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
imagepng($im, $png);
[, $m] = mp_create($A, $c, '111', 'Crypt', $png);
$mo = fn($body) => mp_op($A, $c, '111', $body + ['m' => $m['id']]);
$mo(['op' => 'grid', 's' => 100, 'ox' => 0, 'oy' => 0]);
$mo(['op' => 'activate']);
mp_fight_sync($A, $c, null, fi_read($A, $CID));
$mo(['op' => 'fog', 'add' => ['on' => true, 'poly' => [[200, 0], [400, 0], [400, 300], [200, 300]]]]);
$mo(['op' => 'draw', 'add' => ['c' => 1, 's' => 1, 'pts' => [[300, 200]]]]);
$mo(['op' => 'overlay', 'o' => ['id' => 'secrettrap', 'type' => 'circle', 'x' => 50, 'y' => 50, 'len' => 10, 'ang' => 0, 'color' => 1, 'pat' => 1, 'hidden' => true]]);
$mo(['op' => 'drop', 'mon' => 'fogged']);
$toks = mp_tokens($A, $c, mp_read($A, $CID, $m['id']), fi_read($A, $CID));
$key = fn($name) => array_values(array_filter($toks, fn($t) => $t['name'] === $name))[0]['k'];
foreach ([['Lock', 0, 0], ['Ozzy', 100, 0], ['Goblin', 0, 100], ['Secret Lurker', 100, 100], ['Shadow Fiend', 300, 200]] as [$name, $x, $y])
    $mo(['op' => 'move', 'k' => $key($name), 'x' => $x, 'y' => $y, 'placed' => true]);
mp_op($A, $c, '222', ['op' => 'ruler', 'm' => $m['id'], 'pts' => [[50, 50], [150, 50]]]);

// the log: public, hidden (a DM roll), a whisper (to the DM), and a public roll with its dice
$roll = fn($user, $id, $x) => tl_add($A, $c, $user, $x + ['id' => $id, 'title' => 'Roll', 'expr' => '1d20', 'shown' => '7', 'total' => '7', 'at' => 1000]);
$roll(['sub' => '222'], 'r-public01', ['char' => 'lock', 'title' => 'Stealth', 'total' => '14', 'dice' => [[20, [12]]]]);
$roll(['sub' => '111'], 'r-hidden01', ['name' => 'Secret Lurker', 'vis' => 'hidden', 'title' => 'Mind Blast', 'total' => '33', 'shown' => '19 + 14', 'dice' => [[20, [19]]]]);
$roll(['sub' => '333'], 'r-whisper1', ['char' => 'ozzy', 'vis' => 'dm', 'title' => 'Steal the gem', 'total' => '27']);
$is('a roll sent with bad dice keeps no dice', array_key_exists('dice', $roll(['sub' => '222'], 'r-baddice1', ['char' => 'lock', 'dice' => [[20, [21]]]])[1]['entry']), false);

// notes and handouts: a note, a draft, one to Pat only, one to everyone on the TV
no_save($A, $c, '111', ['id' => 'note0001', 'title' => 'Villain plans', 'body' => 'The mayor is the lich', 'updated' => 5]);
$ho = fn($body) => ho_act($A, $c, '111', $body);
$ho(['act' => 'save', 'handout' => ['id' => 'draft001', 'title' => 'Unsent draft', 'text' => 'not yet', 'updated' => 1]]);
$ho(['act' => 'save', 'handout' => ['id' => 'onlypat1', 'title' => 'Only for Pat', 'text' => 'psst', 'updated' => 1]]);
$ho(['act' => 'send', 'id' => 'onlypat1', 'to' => ['222']]);
$ho(['act' => 'save', 'handout' => ['id' => 'tvhand01', 'title' => 'The old map', 'text' => 'Torn at one corner', 'updated' => 1]]);
$ho(['act' => 'send', 'id' => 'tvhand01', 'to' => 'everyone']);
$ho(['act' => 'tv', 'id' => 'tvhand01', 'on' => true]);

// everything the Table view could ever be given, as it would be sent
$tv = [
    'fight' => fi_view($A, $c, CP_TABLE),
    'map' => mp_view($A, $c, CP_TABLE, $m['id']), // asking for a map by id gets the one on the table anyway
    'log' => tl_tail($c, CP_TABLE, tl_read($A, $CID, tl_name($c))),
    'tv' => ho_view($c, CP_TABLE, ho_tv($A, $c), []),
];
$json = json_encode($tv, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
foreach (['Secret Lurker' => 'the hidden monster', 'Shadow Fiend' => 'the monster on a fogged square', 'Mind Blast' => "the hidden roll's title", '"33"' => "the hidden roll's result",
    '19 + 14' => "the hidden roll's dice", 'Steal the gem' => 'the whisper', '"27"' => "the whisper's result", 'img=work' => 'the working copy', 'img=original' => 'the original map',
    'img=thumb' => 'the map list', '"ops"' => "the fog's ops", 'secrettrap' => 'a hidden overlay', '"enc"' => 'the encounter panel', 'Villain plans' => 'a DM note', 'mayor' => "a DM note's text", 'Unsent draft' => 'a draft handout',
    'Only for Pat' => 'a one-player handout', '"222"' => "a player's Google id", '"111"' => "the DM's Google id", 'lurker' => "the hidden monster's id", $lurker => "the hidden entry's id"] as $s => $what)
    $is("the Table view never gets $what", str_contains($json, $s), false);
// numbers: no key that carries HP, initiative or hidden flags, anywhere
$keys = [];
// (the map's "opts" only says whether the DM turned effects and AC on, with no numbers)
$walk = function ($x) use (&$walk, &$keys) { if (is_array($x)) foreach ($x as $k => $v) { if ($k === 'opts') continue; if (is_string($k)) $keys[$k] = true; $walk($v); } };
foreach ($tv as $part) $walk($part);
foreach (['hp', 'cur', 'max', 'temp', 'init', 'bonus', 'tie', 'secret', 'hidden', 'ac', 'mon', 'by', 'owner', 'fight', 'draft', 'original', 'maps', 'party', 'to', 'table', 'notes', 'sub', 'players'] as $k)
    $is("no \"$k\" field reaches the Table view", isset($keys[$k]), false);
$is('nothing is "mine" for the table', array_filter([...array_column($tv['fight']['entries'], 'mine'), ...array_column($tv['map']['map']['tokens'], 'mine'), ...array_column($tv['log'], 'mine')]), []);
$is('no character the table may roll for', $tv['fight']['canRoll'], []);

// what it does get
$f = $tv['fight'];
$is("the hidden monster's turn is the DM's turn", [$f['turn'], $f['entries'][0]], ['dm-turn', ['id' => 'dm-turn', 'kind' => 'dm', 'name' => "DM's turn", 'art' => '']]);
$by = fn($list, $name) => array_values(array_filter($list, fn($e) => $e['name'] === $name))[0] ?? null;
$is('monsters as healthy / bloodied / down', $by($f['entries'], 'Goblin')['status'], 'bloodied');
$is('Lock: down, death saves and conditions, no HP', array_intersect_key($by($f['entries'], 'Lock'), ['down' => 1, 'saves' => 1, 'conds' => 1]), ['down' => true, 'saves' => ['ok' => 2, 'bad' => 1], 'conds' => ['Poisoned', 'Unconscious']]);
$is('Ozzy: up, no death saves, Prone', array_intersect_key($by($f['entries'], 'Ozzy'), ['down' => 1, 'saves' => 1, 'conds' => 1]), ['down' => false, 'saves' => null, 'conds' => ['Prone']]);
$mv = $tv['map'];
$is('the map: role table, no fog ops, the masked picture through as=table', [$mv['role'], isset($mv['map']['fog']), str_contains($mv['map']['img'], '&as=table&') && str_contains($mv['map']['img'], 'img=public')], ['table', false, true]);
$is('the map: no drawing under fog', $mv['map']['draws'], []);
$is('the map: the party and the monsters in sight, never the hidden or the fogged one', array_column($mv['map']['tokens'], 'name'), ['Goblin', 'Lock', 'Ozzy']);
$is('a party token says down, death saves and conditions too', array_intersect_key($by($mv['map']['tokens'], 'Lock'), ['down' => 1, 'saves' => 1, 'conds' => 1]), ['down' => true, 'saves' => ['ok' => 2, 'bad' => 1], 'conds' => ['Poisoned', 'Unconscious']]);
$is('the log: the public roll with its dice, the hidden one as "DM rolled", no whisper', array_map(fn($e) => [$e['name'], $e['title'] ?? '-', $e['dice'] ?? null], $tv['log']),
    [['Lock', 'Stealth', [[20, [12]]]], ['DM', '-', null], ['Lock', 'Roll', null], ['DM', 'Fight started', null]]);
$is('the handout on the TV, its picture addresses as=table', [$tv['tv']['title'], $tv['tv']['text']], ['The old map', 'Torn at one corner']);

// what the relay carries for the table: moves of monsters it can't see never reach its key; the table key gets what players get
$players = mp_players($c);
$is('the table key hears the moves players hear', in_array(cp_table_key($CID), $players, true), true);
[, , $live] = $mo(['op' => 'move', 'k' => $key('Secret Lurker'), 'x' => 0, 'y' => 200, 'placed' => true]);
$is('a hidden monster moved: only the DM pages hear it', array_column($live, 1), ['dm']);
[, , $live] = $mo(['op' => 'move', 'k' => $key('Shadow Fiend'), 'x' => 300, 'y' => 100, 'placed' => true]);
$is('a monster moving about in the fog: only the DM pages', array_column($live, 1), ['dm']);
[, , $live] = ho_act($A, $c, '111', ['act' => 'save', 'handout' => ['id' => 'draft001', 'title' => 'Unsent draft 2', 'updated' => 2]]);
$is('a draft handout changed: the table hears nothing', in_array([cp_table_key($CID)], array_column($live, 1), true), false);

// dice sets: the roller's own (the character's, else their synced dice-choice); another site's script is never passed on
@mkdir("$A/prefs", 0777, true);
file_put_contents("$A/prefs/222.json", json_encode(['dice-choice' => ['updated' => 1, 'value' => json_encode(['set' => ['key' => 'ember', 'url' => './sets/ember.js?v=12'], 'trails' => [['key' => 'smoke', 'url' => './extras/ember/trails.js?v=3']]])]]));
$is("the roller's synced dice-choice", tl_dice_set($A, '222', '')['set']['key'] ?? null, 'ember');
file_put_contents("$A/prefs/333.json", json_encode(['dice-choice' => ['updated' => 1, 'value' => json_encode(['set' => ['key' => 'x', 'url' => 'https://evil.example/x.js']])]]));
$is("a dice-choice naming another site's script: plain dice", tl_dice_set($A, '333', ''), null);
file_put_contents("$A/prefs/333.json", json_encode(['dice-choice' => ['updated' => 1, 'value' => json_encode(['set' => ['key' => 'x', 'url' => './sets/../../x.js']])]]));
$is('a dice-choice climbing out of the dice folder: plain dice', tl_dice_set($A, '333', ''), null);
$is('dice: only real dice with possible faces', [tl_dice([[6, [1, 6]], [100, [100]]]), tl_dice([[7, [1]]]), tl_dice([[6, [0]]]), tl_dice([[20, array_fill(0, 61, 1)]]), tl_dice('x')],
    [[[6, [1, 6]], [100, [100]]], null, null, null, null]);

// requests from the table tab: every change refused before any endpoint, the DM's cookie or not
$run = function ($method, $referer, $as) {
    $code = '$_GET["as"] = ' . var_export($as, true) . '; require ' . var_export(__DIR__ . '/../../includes/auth.php', true) . '; echo "through";';
    $p = proc_open([PHP_BINARY, '-r', $code], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['REQUEST_METHOD' => $method, 'HTTP_REFERER' => $referer] + getenv());
    $out = stream_get_contents($pipes[1]);
    proc_close($p);
    return $out;
};
$is('a POST from the table page is refused', $run('POST', 'https://dnd.example/campaigns/tab000000001/table', ''), '{"error":"The Table view can\'t change anything."}');
$is('a POST with as=table is refused', $run('POST', '', 'table'), '{"error":"The Table view can\'t change anything."}');
$is('a DELETE from the table page is refused', $run('DELETE', 'https://dnd.example/campaigns/tab000000001/table/', ''), '{"error":"The Table view can\'t change anything."}');
$is('reading from the table page goes through', $run('GET', 'https://dnd.example/campaigns/tab000000001/table', 'table'), 'through');
$is('a POST from the map page goes through', $run('POST', 'https://dnd.example/campaigns/tab000000001/map', ''), 'through');

$rm = function ($d) use (&$rm) { foreach (array_diff(scandir($d), ['.', '..']) as $f) is_dir("$d/$f") ? $rm("$d/$f") : unlink("$d/$f"); rmdir($d); };
$rm($A);
echo $bad ? "$bad check(s) failed\n" : "table ok\n";
exit($bad ? 1 : 0);
