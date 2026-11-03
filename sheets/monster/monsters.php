<?php
// One monster's stat block for the Monster Sheet, by its key in monsters.json (built by _dev/scripts/build-monsters.js):
//   monsters.php?i=srd:goblin   -> dnd5eapi.co (SRD 5.1, CC BY 4.0)
//   monsters.php?i=o5e:a-mi-kuk -> api.open5e.com (open-licence books)
//   monsters.php?i=s24:goblin-warrior -> api.open5e.com v2 (SRD 5.2), turned into the same shape as an o5e block
// A key a rebuild replaced (aliases.json) still answers, so a request queued from the Compendium isn't stranded.
// Cached on disk for 30 days (stat blocks don't change); a failed refresh serves the last copy.
const MON_TTL = 2592000;

function mon_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header($code === 200 ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: no-store');
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// GET $url, trim it, cache the trimmed JSON. Returns [json|null, status]
function mon_get($url, $trim)
{
    $dir = sys_get_temp_dir() . '/craftyplayz-monsters';
    $file = $dir . '/' . md5($url) . '.json';
    if (is_file($file) && time() - filemtime($file) < MON_TTL) return [file_get_contents($file), 200];
    if (is_file($file . '.miss') && time() - filemtime($file . '.miss') < 86400) return [null, 404];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CraftyPlayz monster sheet; +https://dnd.craftyplayz.com/sheets/monster/)',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = $body ? json_decode($body, true) : null;
    if ($status === 200 && is_array($json)) {
        $out = json_encode($trim($json));
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        @file_put_contents($file, $out, LOCK_EX);
        return [$out, 200];
    }
    if (is_file($file)) return [file_get_contents($file), 200];
    if ($status === 404) { if (!is_dir($dir)) @mkdir($dir, 0755, true); @file_put_contents($file . '.miss', '404', LOCK_EX); }
    return [null, $status === 404 ? 404 : 502];
}

// an Open5e v2 creature in the shape the sheet and Compendium read for an Open5e v1 monster
function mon_from_v2($c)
{
    $rs = $c['resistances_and_immunities'] ?? [];
    $m = ['name' => $c['name'] ?? '', 'size' => $c['size']['name'] ?? '', 'type' => $c['type']['name'] ?? '', 'subtype' => $c['subcategory'] ?? '', 'alignment' => $c['alignment'] ?? '',
        'armor_class' => $c['armor_class'] ?? 10, 'armor_desc' => $c['armor_detail'] ?? '', 'hit_points' => $c['hit_points'] ?? 1, 'hit_dice' => $c['hit_dice'] ?? '',
        'speed' => array_diff_key((array)($c['speed'] ?? []), ['unit' => 1]), 'cr' => $c['challenge_rating'] ?? 0, 'xp' => $c['experience_points'] ?? 0, 'languages' => $c['languages']['as_string'] ?? '',
        'skills' => $c['skill_bonuses'] ?? [], 'damage_vulnerabilities' => $rs['damage_vulnerabilities_display'] ?? '', 'damage_resistances' => $rs['damage_resistances_display'] ?? '',
        'damage_immunities' => $rs['damage_immunities_display'] ?? '', 'condition_immunities' => $rs['condition_immunities_display'] ?? '', 'document__slug' => 'srd-2024',
        'special_abilities' => array_map(fn($t) => ['name' => $t['name'] ?? '', 'desc' => $t['desc'] ?? ''], (array)($c['traits'] ?? [])),
        'actions' => [], 'bonus_actions' => [], 'reactions' => [], 'legendary_actions' => []];
    foreach ((array)($c['ability_scores'] ?? []) as $k => $v) {
        $m[$k] = $v;
        // v2 lists a save for every ability; only one above the plain modifier is a proficiency
        if (isset($c['saving_throws'][$k]) && $c['saving_throws'][$k] !== ($c['modifiers'][$k] ?? null)) $m[$k . '_save'] = $c['saving_throws'][$k];
    }
    $senses = [];
    foreach (['blindsight', 'darkvision', 'tremorsense', 'truesight'] as $s) if (!empty($c[$s . '_range'])) $senses[] = "$s {$c[$s . '_range']} ft.";
    if (isset($c['passive_perception'])) $senses[] = "passive Perception {$c['passive_perception']}";
    $m['senses'] = implode(', ', $senses);
    $acts = (array)($c['actions'] ?? []);
    usort($acts, fn($a, $b) => ($a['order_in_statblock'] ?? 0) <=> ($b['order_in_statblock'] ?? 0));
    $to = ['ACTION' => 'actions', 'BONUS_ACTION' => 'bonus_actions', 'REACTION' => 'reactions', 'LEGENDARY_ACTION' => 'legendary_actions'];
    foreach ($acts as $a) {
        $u = $a['usage_limits'] ?? null;
        $n = (int)($u['param'] ?? 0);
        $tail = !$u ? '' : ($u['type'] === 'PER_DAY' ? " ($n/Day)" : ' (Recharge ' . $n . ($n < 6 ? '–6' : '') . ')');
        $m[$to[$a['action_type'] ?? ''] ?? 'actions'][] = ['name' => ($a['name'] ?? '') . $tail, 'desc' => $a['desc'] ?? ''];
    }
    return $m;
}

// only keys in the built list are fetched, so the proxy can't be pointed anywhere else
$i = (string)($_GET['i'] ?? '');
$list = json_decode((string)@file_get_contents(__DIR__ . '/monsters.json'), true)['list'] ?? [];
$i = (json_decode((string)@file_get_contents(__DIR__ . '/aliases.json'), true) ?: [])[$i] ?? $i;
if (!in_array($i, array_column($list, 0), true)) mon_out(404, ['error' => 'That monster isn\'t in the list.']);
[$src, $slug] = explode(':', $i, 2);
$url = $src === 'srd' ? 'https://www.dnd5eapi.co/api/2014/monsters/' . rawurlencode($slug) : ($src === 's24' ? 'https://api.open5e.com/v2/creatures/srd-2024_' . rawurlencode($slug) . '/' : 'https://api.open5e.com/v1/monsters/' . rawurlencode($slug) . '/');
// the sheet only shows the stat block: drop lore, pictures and links
[$out, $code] = mon_get($url, function ($j) use ($src) {
    if ($src === 's24') return mon_from_v2($j);
    return array_diff_key($j, array_flip(['desc', 'image', 'img_main', 'url', 'updated_at', 'page_no', 'environments', 'v2_converted_path', 'document__url', 'document__license_url']));
});
$out ? mon_out(200, '{"src":' . json_encode($src) . ',"m":' . $out . '}') : mon_out($code, ['error' => $code === 404 ? 'That monster isn\'t available any more.' : "Couldn't reach the monster list. Try again in a minute."]);
