<?php
// Checks the Compendium's data and its items proxy (compendium/items.php): the built spell list, the monster sources every
// entry points at, bad item keys turned away, a cached item served, and the last copy served when a refresh fails.
//   php _dev/scripts/compendium.test.php
$root = realpath(__DIR__ . '/../..');
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };

$spells = json_decode(file_get_contents("$root/compendium/spells.json"), true)['list'];
$is('319 SRD spells', count($spells), 319);
$is('spell keys are unique', count(array_unique(array_column($spells, 0))), 319);
$is('every spell row has 9 fields', count(array_filter($spells, fn($s) => count($s) !== 9)), 0);
$extra = json_decode(file_get_contents("$root/sheets/player/extra-spells.json"), true);
$is('205 extra spells', count($extra), 205);
$is('extra spells all link to wikidot by index', count(array_filter($extra, fn($s) => !preg_match('/^[a-z0-9-]+$/', $s['index']))), 0);
$is('no spell is in both lists', array_values(array_intersect(array_column($spells, 0), array_column($extra, 'index'))), []);

$m = json_decode(file_get_contents("$root/sheets/monster/monsters.json"), true);
$is('every monster book has a licence line', count(array_filter($m['sources'], fn($s) => empty($s['copyright']) || empty($s['licence']))), 0);
$is('every monster points at a known book', count(array_filter($m['list'], fn($r) => !isset($m['sources'][$r[4]]))), 0);

// the newest book's copy wins, one copy per name
$byName = [];
foreach ($m['list'] as $r) $byName[$r[1]] = $r[4];
$is('Tome of Beasts 2023 wins over 2016', $byName['Abominable Beauty'] ?? '', 'tob-2023');
$is('the SRD wins', $byName['Goblin'] ?? '', 'srd');
$is('one monster per name', count($byName), count($m['list']));
// the rules switch follows the account: the same settings list in sync.js and prefs.php
$keys = function ($file, $re) { preg_match($re, file_get_contents($file), $x); preg_match_all("/'([^']+)'/", $x[1], $y); return $y[1]; };
$sync = $keys("$root/assets/js/sync.js", '/const KEYS = \[(.*?)\]/');
$is('sync.js and prefs.php list the same settings', $sync, $keys("$root/prefs.php", '/const PF_KEYS = \[(.*?)\]/'));
$is('compendium-rules follows the account', in_array('compendium-rules', $sync, true), true);

// run items.php as a request
$run = function ($query) use ($root) {
    $f = tempnam(sys_get_temp_dir(), 'cpt');
    file_put_contents($f, '<?php $_GET = json_decode(' . var_export(json_encode($query), true) . ', true); include ' . var_export("$root/compendium/items.php", true) . ';');
    $out = (string)shell_exec(escapeshellarg(PHP_BINARY) . ' -d display_errors=0 ' . escapeshellarg($f));
    unlink($f);
    return json_decode($out, true);
};
$is('a bad key is turned away', $run(['i' => '../x']), ['error' => 'Unknown item.']);
$is('a key without a kind is turned away', $run(['i' => 'longsword']), ['error' => 'Unknown item.']);
$is('no key is turned away', $run([]), ['error' => 'Unknown item.']);

$dir = sys_get_temp_dir() . '/craftyplayz-items';
@mkdir($dir, 0755, true);
$cache = fn($url) => $dir . '/' . md5($url . '' . '#v1') . '.json';
$item = ['name' => 'Cached Thing', 'category' => 'Weapon', 'props' => [], 'damage' => '', 'ac' => '', 'cost' => '', 'weight' => 0, 'desc' => []];
$f = $cache('https://www.dnd5eapi.co/api/2014/equipment/compendium-test-fresh');
file_put_contents($f, json_encode($item));
$is('a fresh cached item is served', $run(['i' => 'eq:compendium-test-fresh']), $item);
// an old copy of an item the API doesn't have: the refresh fails and the last copy is served
$g = $cache('https://www.dnd5eapi.co/api/2014/magic-items/compendium-test-stale');
file_put_contents($g, json_encode($item));
touch($g, time() - 40 * 86400);
$is('a failed refresh serves the last copy', $run(['i' => 'magic:compendium-test-stale']), $item);
@unlink($f); @unlink($g); @unlink($g . '.miss');

echo $bad ? "$bad check(s) failed\n" : "compendium ok\n";
exit($bad ? 1 : 0);
