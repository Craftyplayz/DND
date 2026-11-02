<?php
// D&D Beyond import for the homebrew sheet test copy: ddb.php?id=<character id or link> -> { character, rules }.
// Same unofficial endpoints and caching as /games/dnd/characters/ (copied from there, not shared, so that page stays untouched):
// they only return public characters, need no key, and rate-limit heavy use, so every answer is cached.
const DDB_CACHE_TTL = 600;    // characters: 10 minutes
const DDB_RULES_TTL = 86400;  // rule data barely changes

function ddb_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

// GET a D&D Beyond JSON endpoint through a disk cache; a failed refresh falls back to the last good copy.
function ddb_get($url, $file, $ttl, $trim = null)
{
    $dir = sys_get_temp_dir() . '/craftyplayz-ddb';
    $path = $dir . '/' . $file;
    $cached = is_file($path) ? json_decode((string)@file_get_contents($path), true) : null;
    if ($cached && time() - filemtime($path) < $ttl) return ['data' => $cached, 'status' => 200];
    $miss = $path . '.miss';
    if (!$cached && is_file($miss) && time() - filemtime($miss) < $ttl) return ['data' => null, 'status' => (int)file_get_contents($miss)];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CraftyPlayz homebrew sheet; +https://craftyplayz.com/games/dnd/sheets/player-dev/)',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = $body ? json_decode($body, true) : null;
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if ($status === 200 && !empty($json['success']) && isset($json['data'])) {
        $data = $trim ? $trim($json['data']) : $json['data'];
        @file_put_contents($path, json_encode($data), LOCK_EX);
        return ['data' => $data, 'status' => 200];
    }
    if ($cached) return ['data' => $cached, 'status' => 200];
    if ($status >= 400 && $status < 500) @file_put_contents($miss, (string)$status, LOCK_EX);
    return ['data' => null, 'status' => $status];
}

// keep only the lookup tables the import uses (the full file is ~540 KB)
function ddb_trim_rules($r)
{
    $pick = function ($rows, $keys) {
        return array_map(function ($row) use ($keys) { return array_intersect_key($row, array_flip($keys)); }, (array)$rows);
    };
    $out = array_intersect_key($r, array_flip([
        'abilitySkills', 'conditions', 'naturalActions', 'levelProficiencyBonuses', 'creatureSizes', 'senses', 'movements', 'damageTypes',
        'damageAdjustments', 'multiClassSpellSlots', 'spellComponents', 'limitedUseResetTypes', 'noArmorAcAmount', 'baseWeaponReach',
        'defaultAttunedItemCountMax', 'proficiencyGroups', 'minimumHpTotal',
    ]));
    $out['alignments'] = $pick($r['alignments'] ?? [], ['id', 'name']);
    $out['activationTypes'] = $pick($r['activationTypes'] ?? [], ['id', 'name']);
    $out['lifestyles'] = $pick($r['lifestyles'] ?? [], ['id', 'name']);
    return $out;
}

// ddb.php?rules=1 -> { senses: [...], skills: [...] } from D&D Beyond's rule data, for the sheet's pick lists
if (isset($_GET['rules'])) {
    $rules = ddb_get('https://character-service.dndbeyond.com/character/v5/rule-data', 'rules.json', DDB_RULES_TTL, 'ddb_trim_rules');
    if (!$rules['data']) ddb_out(502, ['error' => "Couldn't reach D&D Beyond right now."]);
    $names = function ($rows) { return array_values(array_filter(array_map(function ($r) { return (string)($r['name'] ?? ''); }, (array)$rows), function ($n) { return $n !== '' && $n !== 'Unknown'; })); };
    ddb_out(200, ['senses' => $names($rules['data']['senses'] ?? []), 'skills' => $names($rules['data']['abilitySkills'] ?? [])]);
}

$id = preg_match('/(\d{4,12})/', (string)($_GET['id'] ?? ''), $m) ? $m[1] : '';
if ($id === '') ddb_out(400, ['error' => 'Paste a D&D Beyond character link or its ID number.']);

$char = ddb_get('https://character-service.dndbeyond.com/character/v5/character/' . $id, 'char-' . $id . '.json', DDB_CACHE_TTL);
if (!$char['data']) {
    $s = $char['status'];
    ddb_out($s === 403 ? 403 : (in_array($s, [404, 409], true) ? 404 : 502), ['error' => $s === 403
        ? 'That character is private. Set its privacy to Public on D&D Beyond (character settings, Character Privacy) and try again.'
        : (in_array($s, [404, 409], true) ? "No D&D Beyond character has the ID $id." : "Couldn't reach D&D Beyond right now. Try again in a minute.")]);
}
$rules = ddb_get('https://character-service.dndbeyond.com/character/v5/rule-data', 'rules.json', DDB_RULES_TTL, 'ddb_trim_rules');
ddb_out(200, ['character' => $char['data'], 'rules' => $rules['data'] ?: new stdClass()]);
