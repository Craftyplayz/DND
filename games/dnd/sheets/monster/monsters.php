<?php
// One monster's stat block for the Monster Sheet, by its key in monsters.json (built by _dev/scripts/build-monsters.js):
//   monsters.php?i=srd:goblin   -> dnd5eapi.co (SRD 5.1, CC BY 4.0)
//   monsters.php?i=o5e:a-mi-kuk -> api.open5e.com (open-licence books)
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
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CraftyPlayz monster sheet; +https://craftyplayz.com/games/dnd/sheets/monster/)',
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

// only keys in the built list are fetched, so the proxy can't be pointed anywhere else
$i = (string)($_GET['i'] ?? '');
$list = json_decode((string)@file_get_contents(__DIR__ . '/monsters.json'), true)['list'] ?? [];
if (!in_array($i, array_column($list, 0), true)) mon_out(404, ['error' => 'That monster isn\'t in the list.']);
[$src, $slug] = explode(':', $i, 2);
$url = $src === 'srd' ? 'https://www.dnd5eapi.co/api/2014/monsters/' . rawurlencode($slug) : 'https://api.open5e.com/v1/monsters/' . rawurlencode($slug) . '/';
// the sheet only shows the stat block: drop lore, pictures and links
[$out, $code] = mon_get($url, function ($j) {
    return array_diff_key($j, array_flip(['desc', 'image', 'img_main', 'url', 'updated_at', 'page_no', 'environments', 'v2_converted_path', 'document__url', 'document__license_url']));
});
$out ? mon_out(200, '{"src":' . json_encode($src) . ',"m":' . $out . '}') : mon_out($code, ['error' => $code === 404 ? 'That monster isn\'t available any more.' : "Couldn't reach the monster list. Try again in a minute."]);
