<?php
// SRD 5.1 spells for the homebrew sheet, from dnd5eapi.co (SRD 5.1, CC-BY-4.0).
//   spells.php?list=1      -> [[index, name, level], ...]
//   spells.php?i=fireball  -> one spell, trimmed to the fields the sheet uses
//   spells.php?eqlist=1    -> SRD equipment [[index, name], ...] for the items tab
//   spells.php?eq=longbow  -> { name, props (item attributes), wt, gp }
// Non-SRD spells come from extra-spells.json (stats); their text is fetched from dnd5e.wikidot.com when picked.
// Cached on disk for 30 days (SRD text doesn't change); a failed refresh serves the last copy.
const SRD_API = 'https://www.dnd5eapi.co/api/2014/spells';
const SRD_EQ = 'https://www.dnd5eapi.co/api/2014/equipment';
const SRD_TTL = 2592000;

function srd_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header($code === 200 ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: no-store');
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// GET $url, trim it, cache the trimmed JSON. Returns [json|null, status]
function srd_get($url, $trim, $html = false)
{
    $dir = sys_get_temp_dir() . '/craftyplayz-srd';
    // bump the html tag when the wikidot parser changes, to drop its old cached text
    $file = $dir . '/' . md5($url . ($html ? '#html5' : '#v2')) . '.json';
    if (is_file($file) && time() - filemtime($file) < SRD_TTL) return [file_get_contents($file), 200];
    // a recent 404 is remembered so made-up names can't hammer the API
    if (is_file($file . '.miss') && time() - filemtime($file . '.miss') < 86400) return [null, 404];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CraftyPlayz homebrew sheet; +https://craftyplayz.com/games/dnd/sheets/player/)',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = $body ? ($html ? ['html' => $body] : json_decode($body, true)) : null;
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

// "which you take when ..." from a wikidot page; the SRD API drops a reaction's trigger
// fills a missing save, spell attack or damage from the spell's text ("a Wisdom saving throw", "1d6 psychic damage")
function spell_mech($s)
{
    // stop at a summoned creature's stat block, its attacks aren't the spell's
    $t = '';
    foreach ((array)($s['desc'] ?? []) as $p) { if (stripos($p, 'Armor Class') === 0) break; $t .= ' ' . $p; }
    if (empty($s['save']) && preg_match('~(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw~i', $t, $m)) $s['save'] = strtoupper(substr($m[1], 0, 3));
    if (empty($s['attack_type']) && preg_match('~(melee|ranged) spell attack~i', $t, $m)) $s['attack_type'] = strtolower($m[1]);
    if (empty($s['damage']) && preg_match_all('~(\d+d\d+(?:\s*\+\s*\d+)?)\s+(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage~i', $t, $ms, PREG_SET_ORDER)) {
        $s['damage'] = [];
        foreach ($ms as [, $dice, $type]) {
            $type = ucfirst(strtolower($type));
            if (in_array($type, array_column($s['damage'], 'type'))) continue;
            $die = preg_match('~^1d(\d+)$~', $dice, $d) ? $d[1] : '';
            // cantrips use the usual 1dX..4dX steps so the sheet scales them with character level
            $s['damage'][] = ['type' => $type, 'slot' => (int)$s['level'] || !$die ? [(string)(int)$s['level'] => $dice] : null,
                'char' => (int)$s['level'] || !$die ? null : ['1' => $dice, '5' => "2d$die", '11' => "3d$die", '17' => "4d$die"]];
        }
    }
    return $s;
}

function wd_trigger($html)
{
    return preg_match('~Casting Time:</strong>\s*1 reaction,\s*(.*?)<br~is', $html, $m) ? trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8')) : '';
}

$extra = json_decode((string)@file_get_contents(__DIR__ . '/extra-spells.json'), true) ?: [];

if (isset($_GET['list'])) {
    [$out, $code] = srd_get(SRD_API, function ($j) {
        return array_map(function ($s) { return [(string)$s['index'], (string)$s['name'], (int)$s['level']]; }, (array)($j['results'] ?? []));
    });
    if (!$out) srd_out(502, ['error' => "Couldn't reach the spell list. Try again in a minute."]);
    $list = array_merge(json_decode($out, true), array_map(function ($s) { return ['wd:' . $s['index'], $s['name'], $s['level']]; }, $extra));
    usort($list, function ($a, $b) { return strcasecmp($a[1], $b[1]); });
    srd_out(200, $list);
}

if (isset($_GET['eqlist'])) {
    [$out] = srd_get(SRD_EQ, function ($j) {
        return array_map(function ($s) { return [(string)$s['index'], (string)$s['name']]; }, (array)($j['results'] ?? []));
    });
    $out ? srd_out(200, $out) : srd_out(502, ['error' => "Couldn't reach the item list. Try again in a minute."]);
}
if (isset($_GET['eq'])) {
    $e = (string)$_GET['eq'];
    if (!preg_match('/^[a-z0-9-]{1,80}$/', $e)) srd_out(400, ['error' => 'Unknown item.']);
    // attributes in the order D&D Beyond lists them: category, properties, range, armour numbers
    [$out, $code] = srd_get(SRD_EQ . '/' . $e, function ($j) {
        $p = [];
        foreach (['weapon_category', 'weapon_range', 'tool_category', 'vehicle_category'] as $k) if (!empty($j[$k])) $p[] = (string)$j[$k];
        if (!empty($j['gear_category']['name'])) $p[] = $j['gear_category']['name'];
        foreach ((array)($j['properties'] ?? []) as $q) $p[] = $q['name'];
        $r = $j['throw_range'] ?? (($j['weapon_range'] ?? '') === 'Ranged' ? ($j['range'] ?? null) : null);
        if (!empty($r['long'])) $p[] = 'Range (' . $r['normal'] . '/' . $r['long'] . ')';
        $cat = $j['armor_category'] ?? '';
        if ($cat) $p[] = $cat === 'Shield' ? 'Shield' : $cat . ' armour';
        if (isset($j['armor_class']['base'])) {
            $ac = $j['armor_class'];
            $p[] = 'AC ' . ($cat === 'Shield' ? '+' : '') . $ac['base'] . (!empty($ac['dex_bonus']) ? ' + DEX' . (!empty($ac['max_bonus']) ? ' (max ' . $ac['max_bonus'] . ')' : '') : '');
        }
        if (!empty($j['str_minimum'])) $p[] = 'Str ' . $j['str_minimum'];
        if (!empty($j['stealth_disadvantage'])) $p[] = 'Stealth disadvantage';
        $gp = ($j['cost']['quantity'] ?? 0) * (['cp' => 0.01, 'sp' => 0.1, 'ep' => 0.5, 'gp' => 1, 'pp' => 10][$j['cost']['unit'] ?? 'gp'] ?? 1);
        return ['name' => $j['name'] ?? '', 'props' => $p, 'wt' => $j['weight'] ?? 0, 'gp' => $gp];
    });
    $out ? srd_out(200, $out) : srd_out($code, ['error' => $code === 404 ? 'That item isn\'t in the SRD.' : "Couldn't reach the item list. Try again in a minute."]);
}

$i = (string)($_GET['i'] ?? '');
if (substr($i, 0, 3) === 'wd:') {
    foreach ($extra as $s) if ('wd:' . $s['index'] === $i) {
        $url = 'https://dnd5e.wikidot.com/spell:' . $s['index'];
        // the paragraphs after the stat block, minus the class list; a failed fetch still returns the stats
        [$text] = srd_get($url, function ($j) {
            if (!preg_match('~<div id="page-content">(.*?)<div class="content-separator"[^>]*>\s*</div>\s*</div>~s', $j['html'], $m)) return ['desc' => [], 'higher_level' => []];
            $body = preg_replace('~^.*?<strong>Duration:</strong>.*?</p>~', '', preg_replace('~\s+~', ' ', $m[1]));
            $body = preg_replace('~</(p|li|tr|h\d)>|<br\s*/?>~i', "\n", preg_replace('~</t[dh]>~i', ' | ', $body));
            $desc = $higher = [];
            foreach (explode("\n", html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8')) as $line) {
                $line = trim(preg_replace('~\s*\|\s*$~', '', trim($line)));
                if ($line === '' || strpos($line, 'Spell Lists.') === 0) continue;
                if (strpos($line, 'At Higher Levels.') === 0) $higher[] = trim(substr($line, 17));
                else $desc[] = $line;
            }
            return ['desc' => $desc, 'higher_level' => $higher, 'trigger' => wd_trigger($j['html'])];
        }, true);
        srd_out(200, spell_mech(['wd' => $url, 'index' => $i] + $s + (json_decode((string)$text, true) ?: [])));
    }
    srd_out(404, ['error' => 'Unknown spell.']);
}
if (!preg_match('/^[a-z0-9-]{1,80}$/', $i)) srd_out(400, ['error' => 'Unknown spell.']);
[$out, $code] = srd_get(SRD_API . '/' . $i, function ($j) {
    $keep = ['index', 'name', 'level', 'desc', 'higher_level', 'range', 'components', 'material', 'ritual', 'duration', 'concentration', 'casting_time', 'attack_type', 'heal_at_slot_level'];
    $s = array_intersect_key($j, array_flip($keep));
    $s['school'] = $j['school']['name'] ?? '';
    if (!empty($j['dc']['dc_type']['name'])) $s['save'] = $j['dc']['dc_type']['name'];
    $s['damage'] = array_map(function ($d) {
        return ['type' => $d['damage_type']['name'] ?? '', 'slot' => $d['damage_at_slot_level'] ?? null, 'char' => $d['damage_at_character_level'] ?? null];
    }, isset($j['damage']['damage_type']) || isset($j['damage']['damage_at_slot_level']) || isset($j['damage']['damage_at_character_level']) ? [$j['damage']] : (array)($j['damage'] ?? []));
    return $s;
});
$s = $out ? json_decode($out, true) : null;
if ($s) $out = json_encode($s = spell_mech($s));
if ($s && stripos($s['casting_time'] ?? '', 'reaction') !== false) {
    [$t] = srd_get('https://dnd5e.wikidot.com/spell:' . $i, function ($j) { return ['trigger' => wd_trigger($j['html'])]; }, true);
    $out = json_encode($s + (json_decode((string)$t, true) ?: []));
}
$out ? srd_out(200, $out) : srd_out($code, ['error' => $code === 404 ? 'That spell isn\'t in the SRD.' : "Couldn't reach the spell list. Try again in a minute."]);
