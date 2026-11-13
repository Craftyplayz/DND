<?php
// Battle maps (ROADMAP 1.6) for campaign members; includes/maps.php does the work and mp_view() decides what each one gets.
//   GET ?c=<campaign>[&m=<map>]              -> {"role", "active", "map", "maps" (DM)}: the map on the table (a DM: any map)
//   GET ...&as=table                         -> any of the GETs as the Table view (ROADMAP 1.7, the DM and co-DMs): role "table"
//   GET ?c=&m=&img=work                      -> the map's picture (players: the map on the table); every screen draws the fog over it
//   GET ?c=&m=&img=public&n=<n>              -> an older masked copy, kept: the DM and co-DMs only
//   GET ?c=&m=&img=work | original | thumb   -> the DM and co-DMs only
//   GET ?c=&m=&pic=<id>                      -> a picture dropped on the map (players: the map on the table, not hidden or fogged)
//   POST ?c=&m=&pic=new&x=&y= (image/*)      -> {"id"}: a picture dropped on the map (players: the map on the table)
//   GET ?c=&mons                             -> the DM's own monsters, to add to the fight or drop on the map
//   POST ?c=&up=<upload id>&i=<n>  (application/octet-stream, 4 MB chunks in order)   the DM and co-DMs upload a picture
//   POST {"c", "op": "upload", "up", "name"} -> {"map"}: the uploaded picture becomes a new map
//   POST {"c", "op", ...}                    -> mp_op(): every other change; the live relay tells the others
// The session cookie is SameSite=Lax and writes must be JSON or octet-stream, so other sites can't post here as the player.
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/maps.php';
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';

function mp_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

$user = auth_user();
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$type = $_SERVER['CONTENT_TYPE'] ?? '';
$body = $post && stripos($type, 'application/json') === 0 ? json_decode((string)file_get_contents('php://input', false, null, 0, 8 * 1024 * 1024), true) : null;
$c = $user ? cp_get($accounts, (string)($_GET['c'] ?? $body['c'] ?? '')) : null;
// ?as=table: the Table view (ROADMAP 1.7) reads as CP_TABLE, so it gets exactly what players get (it can't post: auth.php)
$sub = cp_viewer($c, $user);
if ($sub === null) mp_out($user ? 403 : 401, ['error' => $user ? "You're not in this campaign." : 'Sign in to see the map.']);
$dm = cp_is_dm($c, $sub);

if (!$post && isset($_GET['img'])) {
    $m = mp_read($accounts, $c['id'], $_GET['m'] ?? '');
    $kind = (string)$_GET['img'];
    $dir = mp_root($accounts, $c['id']) . '/' . ($m['id'] ?? '');
    $file = match (true) {
        !$m => null,
        $kind === 'work' && (mp_active($accounts, $c['id'])['id'] ?? null) === $m['id'] => "$dir/work.webp",
        !$dm => null,
        $kind === 'public' => "$dir/public-" . (int)($_GET['n'] ?? 0) . '.webp',
        $kind === 'work', $kind === 'thumb' => "$dir/$kind.webp",
        $kind === 'original' => "$dir/original.{$m['ext']}",
        default => null,
    };
    if (!$file || !is_file($file)) mp_out($dm || !$m ? 404 : 403, ['error' => 'No such picture.']);
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    header('Content-Type: ' . (['jpg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif'][$ext] ?? 'image/webp'));
    header('Content-Length: ' . filesize($file));
    // every address names one picture that never changes (a fog change is a new n)
    header('Cache-Control: private, max-age=31536000, immutable');
    if ($kind === 'original') header('Content-Disposition: inline; filename="' . preg_replace('/[^\w .-]/u', '', $m['name']) . ".$ext\"");
    readfile($file);
    exit;
}

if (!$post && isset($_GET['pic'])) {
    $m = mp_read($accounts, $c['id'], $_GET['m'] ?? '');
    $seen = !$m ? [] : ($dm ? ($m['pics'] ?? []) : ((mp_active($accounts, $c['id'])['id'] ?? null) === $m['id'] ? mp_pics_seen($m) : []));
    $id = in_array((string)$_GET['pic'], array_column($seen, 'id'), true) ? (string)$_GET['pic'] : null;
    $file = $id ? mp_root($accounts, $c['id']) . "/{$m['id']}/pics/$id.webp" : null;
    if (!$file || !is_file($file)) mp_out(404, ['error' => 'No such picture.']);
    header('Content-Type: image/webp');
    header('Content-Length: ' . filesize($file));
    header('Cache-Control: private, max-age=31536000, immutable'); // a picture never changes: a new one gets a new id
    readfile($file);
    exit;
}

if (!$post && isset($_GET['mons'])) {
    if (!$dm) mp_out(403, ['error' => 'Only the DM can do that.']);
    // only what the map page needs to roll initiative and work out AC (formula.js, as the Monster Sheet does)
    $encs = [];
    foreach (ch_json("$accounts/monster-encounters/$sub.json")['encs'] ?? [] as $e) if (empty($e['archived'])) $encs[$e['id']] = $e['name'];
    $out = [];
    foreach (glob("$accounts/monsters/$sub/*.json") ?: [] as $f) {
        $x = ch_json($f);
        if (!$x || !empty($x['archived']) || str_starts_with(basename($f), '_') || !isset($x['id'])) continue;
        $race = (string)($x['race'] ?? '');
        $out[] = ['id' => $x['id'], 'name' => (string)($x['name'] ?? '') ?: 'Unnamed monster', 'enc' => $encs[$x['enc'] ?? ''] ?? '', 'cr' => (string)($x['cr'] ?? '0'),
            'race' => $race, 'size' => mp_size_of($race), 'type' => trim(preg_replace('/\b(tiny|small|medium|large|huge|gargantuan)\b|\(.*$/i', '', $race)),
            'hp' => fi_num($x['hp']['base'] ?? 0) + fi_num($x['hp']['mod'] ?? 0), 'xp' => $x['xp'] ?? null, 'src' => (string)($x['cmp'] ?? ''), 'art' => fi_art((string)($x['art'] ?? '')),
            'prof' => (string)($x['prof'] ?? ''), 'init' => (string)($x['init'] ?? 'DEX'), 'ac' => (string)($x['ac'] ?? '10'),
            'abilities' => array_map(fn($a) => ['key' => (string)($a['key'] ?? ''), 'score' => $a['score'] ?? 10], is_array($x['abilities'] ?? null) ? $x['abilities'] : [])];
    }
    usort($out, fn($a, $b) => [$a['enc'], $a['name']] <=> [$b['enc'], $b['name']]);
    mp_out(200, ['monsters' => $out]);
}

if (!$post) mp_out(200, mp_view($accounts, $c, $sub, $_GET['m'] ?? null));

// a 4 MB chunk of an upload, in order; the parts build up in maps/.up/ until "upload" makes the map
if (isset($_GET['up'])) {
    if (!$dm) mp_out(403, ['error' => 'Only the DM can upload maps.']);
    if (stripos($type, 'application/octet-stream') !== 0) mp_out(415, ['error' => 'Send the picture as it is.']);
    $id = (string)$_GET['up'];
    if (!preg_match('/^[a-z0-9]{8,40}$/', $id)) mp_out(400, ['error' => "That isn't an upload."]);
    $dir = mp_root($accounts, $c['id']) . '/.up';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) mp_out(500, ['error' => "Couldn't save the upload."]);
    $meta = ch_json("$dir/$id.json") ?? ['sub' => $sub, 'n' => 0];
    if ($meta['sub'] !== $sub) mp_out(403, ['error' => "That isn't your upload."]);
    $i = (int)($_GET['i'] ?? -1);
    if ($i === $meta['n'] - 1) mp_out(200, ['n' => $meta['n']]); // the same chunk again (a retry): already here
    if ($i !== $meta['n']) mp_out(409, ['error' => 'A part of the upload went missing. Upload the map again.']);
    $in = fopen('php://input', 'rb');
    $out = fopen("$dir/$id.part", $i ? 'ab' : 'wb');
    if (!$in || !$out || stream_copy_to_stream($in, $out) === false) mp_out(500, ['error' => "Couldn't save the upload."]);
    fclose($out);
    $meta['n']++;
    if (!mp_put("$dir/$id.json", $meta)) mp_out(500, ['error' => "Couldn't save the upload."]);
    mp_out(200, ['n' => $meta['n']]);
}

// a picture dropped on the map: anyone in the campaign, on the map on the table (the DM: any map)
if (isset($_GET['pic'])) {
    if ($sub === CP_TABLE) mp_out(403, ['error' => "The Table view can't change the map."]);
    if (stripos($type, 'image/') !== 0) mp_out(415, ['error' => 'Send the picture as an image.']);
    $bytes = file_get_contents('php://input', false, null, 0, 8 * 1024 * 1024 + 1);
    if ($bytes === false || $bytes === '') mp_out(400, ['error' => 'No picture was sent.']);
    if (strlen($bytes) > 8 * 1024 * 1024) mp_out(413, ['error' => 'That picture is too big. Use one under 8 MB.']);
    $lock = mp_lock($accounts, $c['id']);
    if (!$lock) mp_out(500, ['error' => "Couldn't lock the maps folder."]);
    $m = mp_read($accounts, $c['id'], $_GET['m'] ?? '');
    $onTable = $m && (mp_active($accounts, $c['id'])['id'] ?? null) === $m['id'];
    if (!$m || (!$dm && !$onTable)) mp_out($m ? 403 : 404, ['error' => $m ? "That map isn't on the table." : 'That map is gone. Reload the page.']);
    [$code, $out] = mp_pic_add($accounts, $c['id'], $sub, mp_fog_upgrade($accounts, $c['id'], $m), $bytes, $_GET['x'] ?? 0, $_GET['y'] ?? 0);
    flock($lock, LOCK_UN);
    if ($code === 200) live_publish($c['id'], ['type' => 'map'], null, $onTable ? null : 'dm');
    mp_out($code, $out);
}

if (!is_array($body)) mp_out(415, ['error' => 'Send JSON.']);
$lock = mp_lock($accounts, $c['id']);
if (!$lock) mp_out(500, ['error' => "Couldn't lock the maps folder."]);
if (($body['op'] ?? '') === 'upload') {
    if (!$dm) mp_out(403, ['error' => 'Only the DM can upload maps.']);
    $id = (string)($body['up'] ?? '');
    $dir = mp_root($accounts, $c['id']) . '/.up';
    if (!preg_match('/^[a-z0-9]{8,40}$/', $id) || (ch_json("$dir/$id.json")['sub'] ?? null) !== $sub || !is_file("$dir/$id.part")) mp_out(404, ['error' => 'That upload is gone. Upload the map again.']);
    [$code, $out] = mp_create($accounts, $c, $sub, $body['name'] ?? '', "$dir/$id.part");
    flock($lock, LOCK_UN);
    if ($code !== 200) mp_out($code, $out);
    live_publish($c['id'], ['type' => 'map'], null, 'dm');
    mp_out(200, ['map' => $out['id']]);
}
[$code, $out, $live] = mp_op($accounts, $c, $sub, $body);
flock($lock, LOCK_UN);
foreach ($live as [$msg, $to]) if ($to === null || $to === 'dm' || $to) live_publish($c['id'], $msg, null, $to);
mp_out($code, $out);
