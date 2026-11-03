<?php
// DM notes and handouts (ROADMAP 3.4) for signed-in members of a campaign (includes/handouts.php does the work):
//   GET ?c=<id>                          -> {"dm": bool, "handouts": [...]}: the ones you may see, newest first;
//                                           the DM and co-DMs also get "players" [{sub, name}] to send to
//   GET ?c=<id>&h=<handout>&img=<image>  -> one of its pictures, if you may see the handout
//   GET ?c=<id>&notes=1                  -> {"notes": [...]}: DM and co-DMs only
//   POST {"c", "act": "note", "note"}    -> {"note"}; 409 {"note"} when the stored copy is newer
//   POST {"c", "act": "save" | "send" | "unshare" | "archive" | "restore" | "image" | "unimage" | "open", ...}  (ho_act)
//   POST ?c=<id>&up=<upload id>&at=<bytes so far> with a piece of a picture (application/octet-stream, up to 4 MB)
//                                        -> {"size"}; 409 {"size"} when the server has a different amount
// A saved note tells the DM's other pages ("notes"). After a handout change the relay tells the DM's pages and the players who see it ("handout" with only its id; "handout-gone" to
// the ones who lost it); each page then loads its own copy from here.
// The session cookie is SameSite=Lax and writes must be JSON or octet-stream, so other sites can't post here as the player.
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/handouts.php';
// DND_ACCOUNTS: a stand-in folder for the local checks, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../private/dnd/accounts';

function ho_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
if (!$user) ho_out(401, ['error' => 'Sign in to see handouts.']);
$sub = $user['sub'];
$cid = (string)($_GET['c'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$type = $_SERVER['CONTENT_TYPE'] ?? '';
$body = null;
if ($method === 'POST' && stripos($type, 'application/json') === 0) {
    $body = json_decode((string)file_get_contents('php://input', false, null, 0, 8 * 1024 * 1024), true);
    if (!is_array($body)) ho_out(400, ['error' => "That isn't a change."]);
    $cid = (string)($body['c'] ?? '');
}
$c = cp_get($accounts, $cid);
if (!$c || cp_member($c, $sub) < 0) ho_out(404, ['error' => 'No such campaign.']);
$dm = cp_is_dm($c, $sub);

if ($method === 'GET') {
    if (isset($_GET['img'])) {
        $f = ho_image($accounts, $c, $sub, (string)($_GET['h'] ?? ''), (string)$_GET['img']);
        if (!$f) ho_out(404, ['error' => 'No such picture.']);
        header('Content-Type: ' . HO_TYPES[pathinfo($f, PATHINFO_EXTENSION)]);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=86400');
        header('Content-Length: ' . filesize($f));
        readfile($f);
        exit;
    }
    if (isset($_GET['notes'])) $dm ? ho_out(200, ['notes' => no_all($accounts, $c['id'])]) : ho_out(403, ['error' => 'Only the DM can see notes.']);
    $out = ['dm' => $dm, 'handouts' => ho_list($accounts, $c, $sub)];
    if ($dm) $out['players'] = array_values(array_map(fn($m) => ['sub' => $m['sub'], 'name' => $m['name']], array_filter($c['members'], fn($m) => !cp_is_dm($c, $m['sub']))));
    ho_out(200, $out);
}
if ($method !== 'POST') ho_out(405, ['error' => 'Use GET or POST.']);
if ($body === null && stripos($type, 'application/octet-stream') !== 0) ho_out(415, ['error' => 'Send JSON.']);
$lock = ho_lock($accounts, $c['id']);
if (!$lock) ho_out(500, ['error' => "Couldn't lock the campaign folder."]);
if ($body === null) ho_out(...ho_chunk($accounts, $c, $sub, $_GET['up'] ?? '', $_GET['at'] ?? '', (string)file_get_contents('php://input', false, null, 0, HO_CHUNK + 1)));
if (($body['act'] ?? '') === 'note') {
    [$code, $out] = no_save($accounts, $c, $sub, $body['note'] ?? null);
    flock($lock, LOCK_UN);
    if ($code === 200) live_publish($c['id'], ['type' => 'notes'], null, 'dm'); // the other DM pages load them again
    ho_out($code, $out);
}
[$code, $out, $live] = ho_act($accounts, $c, $sub, $body) + [2 => []];
flock($lock, LOCK_UN);
foreach ($live as [$msg, $to]) live_publish($c['id'], $msg, null, $to);
ho_out($code, $out);
