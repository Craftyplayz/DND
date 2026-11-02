<?php
// SRD 5.1 equipment and magic items for the Compendium, from dnd5eapi.co (SRD 5.1, CC-BY-4.0).
//   items.php?list=1                  -> {"eq": [[key, name, category], ...], "magic": [[key, name, category, rarity, variant], ...]}
//   items.php?i=eq:longsword          -> one item of equipment
//   items.php?i=magic:bag-of-holding  -> one magic item
// Keys use the sheet's equipment index after the prefix. Cached on disk for 30 days (SRD text doesn't change);
// a failed refresh serves the last copy, a never-cached item is a 502.
const IT_API = 'https://www.dnd5eapi.co/api/2014';
const IT_TTL = 2592000;

function it_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header($code === 200 ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: no-store');
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// GET (or POST a GraphQL query) $url, trim it, cache the trimmed JSON. Returns [json|null, status]
function it_get($url, $trim, $post = null)
{
    $dir = sys_get_temp_dir() . '/craftyplayz-items';
    $file = $dir . '/' . md5($url . $post . '#v1') . '.json';
    if (is_file($file) && time() - filemtime($file) < IT_TTL) return [file_get_contents($file), 200];
    if (is_file($file . '.miss') && time() - filemtime($file . '.miss') < 86400) return [null, 404];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CraftyPlayz compendium; +https://dnd.craftyplayz.com/compendium/)',
    ]);
    if ($post !== null) curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $post, CURLOPT_HTTPHEADER => ['Content-Type: application/json']]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = $body ? json_decode($body, true) : null;
    if ($status === 200 && is_array($json) && empty($json['errors'])) {
        $out = json_encode($trim($json));
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        @file_put_contents($file, $out, LOCK_EX);
        return [$out, 200];
    }
    if (is_file($file)) return [file_get_contents($file), 200];
    if ($status === 404) { if (!is_dir($dir)) @mkdir($dir, 0755, true); @file_put_contents($file . '.miss', '404', LOCK_EX); }
    return [null, $status === 404 ? 404 : 502];
}

// "Wondrous item, uncommon (requires attunement)" -> the attunement part, if any
function it_attune($desc)
{
    return preg_match('~\((requires attunement[^)]*)\)~i', (string)($desc[0] ?? ''), $m) ? $m[1] : '';
}

if (isset($_GET['list'])) {
    // equipment has no category in its list, so each category's own list is read (small, cached one by one)
    [$all] = it_get(IT_API . '/equipment', function ($j) { return array_map(function ($e) { return [(string)$e['index'], (string)$e['name']]; }, (array)($j['results'] ?? [])); });
    $cat = [];
    foreach (['weapon', 'armor', 'tools', 'mounts-and-vehicles', 'adventuring-gear'] as $c) {
        [$o] = it_get(IT_API . '/equipment-categories/' . $c, function ($j) { return ['name' => (string)($j['name'] ?? ''), 'eq' => array_map(function ($e) { return (string)$e['index']; }, (array)($j['equipment'] ?? []))]; });
        $d = $o ? json_decode($o, true) : null;
        if ($d) foreach ($d['eq'] as $ix) $cat[$ix] = $cat[$ix] ?? $d['name'];
    }
    [$magic] = it_get('https://www.dnd5eapi.co/graphql/2014', function ($j) {
        return array_map(function ($m) {
            return ['magic:' . $m['index'], (string)$m['name'], (string)($m['equipment_category']['name'] ?? ''), (string)($m['rarity']['name'] ?? ''), (int)!empty($m['variant'])];
        }, (array)($j['data']['magicItems'] ?? []));
    }, json_encode(['query' => '{ magicItems(limit: 1000) { index name rarity { name } equipment_category { name } variant } }']));
    if (!$all || !$magic) it_out(502, ['error' => "Couldn't reach the item list. Try again in a minute."]);
    $eq = array_map(function ($e) use ($cat) { return ['eq:' . $e[0], $e[1], $cat[$e[0]] ?? 'Other']; }, json_decode($all, true));
    it_out(200, ['eq' => $eq, 'magic' => json_decode($magic, true)]);
}

$i = (string)($_GET['i'] ?? '');
if (!preg_match('/^(eq|magic):([a-z0-9-]{1,80})$/', $i, $m)) it_out(400, ['error' => 'Unknown item.']);
if ($m[1] === 'magic') {
    [$out, $code] = it_get(IT_API . '/magic-items/' . $m[2], function ($j) {
        return ['name' => (string)($j['name'] ?? ''), 'category' => (string)($j['equipment_category']['name'] ?? ''), 'rarity' => (string)($j['rarity']['name'] ?? ''),
            'attunement' => it_attune($j['desc'] ?? []), 'variant' => !empty($j['variant']), 'desc' => array_values((array)($j['desc'] ?? [])),
            'variants' => array_map(function ($v) { return (string)($v['name'] ?? ''); }, (array)($j['variants'] ?? []))];
    });
} else {
    [$out, $code] = it_get(IT_API . '/equipment/' . $m[2], function ($j) {
        $p = [];
        foreach (['weapon_category', 'weapon_range', 'tool_category', 'vehicle_category'] as $k) if (!empty($j[$k])) $p[] = (string)$j[$k];
        if (!empty($j['gear_category']['name'])) $p[] = $j['gear_category']['name'];
        foreach ((array)($j['properties'] ?? []) as $q) $p[] = (string)$q['name'];
        $dmg = !empty($j['damage']['damage_dice']) ? $j['damage']['damage_dice'] . ' ' . strtolower($j['damage']['damage_type']['name'] ?? '') : '';
        if (!empty($j['two_handed_damage']['damage_dice'])) $dmg .= ' (' . $j['two_handed_damage']['damage_dice'] . ' two-handed)';
        $r = $j['throw_range'] ?? (($j['weapon_range'] ?? '') === 'Ranged' ? ($j['range'] ?? null) : null);
        if (!empty($r['long'])) $p[] = 'Range (' . $r['normal'] . '/' . $r['long'] . ')';
        $b = $j['armor_class'] ?? null;
        $ac = isset($b['base']) ? (($j['armor_category'] ?? '') === 'Shield' ? '+' : '') . $b['base'] . (!empty($b['dex_bonus']) ? ' + DEX' . (!empty($b['max_bonus']) ? ' (max ' . $b['max_bonus'] . ')' : '') : '') : '';
        return ['name' => (string)($j['name'] ?? ''), 'category' => (string)($j['equipment_category']['name'] ?? ''), 'props' => $p, 'damage' => trim($dmg), 'ac' => $ac,
            'cost' => isset($j['cost']['quantity']) ? $j['cost']['quantity'] . ' ' . $j['cost']['unit'] : '', 'weight' => $j['weight'] ?? 0,
            'desc' => array_values((array)($j['desc'] ?? []))];
    });
}
$out ? it_out(200, $out) : it_out($code, ['error' => $code === 404 ? 'That item isn\'t in the SRD.' : "Couldn't reach the item list. Try again in a minute."]);
