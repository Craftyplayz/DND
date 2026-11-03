<?php
// DM edits on player sheets (ROADMAP 1.5), for signed-in players; includes/dmedits.php does the work.
//   POST {"act": "send", "c", "char", "edits": [...]}   the DM or a co-DM of campaign c, which the character is in (never their own):
//        each edit is checked and queued for the player -> {"queued": [ids], "refused": [{"id", "why"}]}
//   GET ?char=<id>&c=<campaign>   the DM: {"char": the saved character, "edits": [the ones still waiting], "notes": [...]}
//   GET ?char=<id>                its owner: {"edits": [...]}, the waiting ones and the confirmed ones an older copy may lack ("done")
//   POST {"act": "note", "char", "edit", "text"}   the owner's sheet tells the DMs (a conflict, a refusal, an undo)
//   POST {"act": "dismiss", "c", "char", "note"}   the DM drops a note
// The live relay tells the player's open sheets about new edits ("dmedit", to that player only) and the DMs' open copies about
// changes ("char", "dmnote"). The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here.
require __DIR__ . '/../../includes/auth.php';
require __DIR__ . '/../../includes/initiative.php';
require_once __DIR__ . '/../../includes/live.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts';
const DM_MAX = 8 * 1024 * 1024; // the proxy's own limit; nothing smaller (no app limits)

function dm_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$user = auth_user();
if (!$user) dm_out(401, ['error' => 'Sign in to change characters.']);
$sub = $user['sub'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $char = (string)($_GET['char'] ?? '');
    $meta = ch_meta($accounts, $char);
    if (!$meta) dm_out(404, ['error' => 'No such character.']);
    if (isset($_GET['c'])) {
        $c = cp_get($accounts, (string)$_GET['c']);
        if (!$c || !cp_is_dm($c, $sub) || !cp_has_char($c, $char) || ($meta['owner'] ?? null) === $sub) dm_out(403, ['error' => "You can't change this character."]);
        $q = dm_qread(dm_qfile($accounts, $c['id'], $char));
        dm_out(200, ['char' => json_decode((string)file_get_contents("$accounts/characters/$char/character.json")),
            'edits' => array_map(fn($x) => $x[1], dm_all($accounts, $char, true)), 'notes' => $q->notes]);
    }
    if (($meta['owner'] ?? null) !== $sub) dm_out(404, ['error' => 'No such character.']);
    dm_out(200, ['edits' => array_map(fn($x) => $x[1], dm_all($accounts, $char))]);
}
if ($method !== 'POST') dm_out(405, ['error' => 'Use GET or POST.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) dm_out(415, ['error' => 'Send JSON.']);
$raw = (string)file_get_contents('php://input', false, null, 0, DM_MAX + 1);
if (strlen($raw) > DM_MAX) dm_out(413, ['error' => 'That change is too big to send.']);
$b = json_decode($raw);
if (!is_object($b)) dm_out(400, ['error' => "That isn't a DM edit."]);
$act = $b->act ?? '';
$char = (string)($b->char ?? '');
if (!ch_ok_id($char)) dm_out(400, ['error' => 'Bad character id.']);
$chl = ch_lock($accounts);
$cpl = $chl ? cp_lock($accounts) : null;
if (!$cpl) dm_out(500, ['error' => "Couldn't lock the characters folder."]);

if ($act === 'send') {
    $c = cp_get($accounts, (string)($b->c ?? ''));
    $health = ch_ok_id($char) ? fi_pc($accounts, $char) : null; // what everyone sees of it (ROADMAP 1.7)
    [$code, $out, $queued] = dm_send($accounts, $user, $c, $char, $b->edits ?? null);
    flock($cpl, LOCK_UN);
    flock($chl, LOCK_UN);
    if ($queued) {
        $owner = ch_meta($accounts, $char)['owner'] ?? '';
        live_publish($c['id'], ['type' => 'dmedit', 'char' => $char, 'edits' => $queued], null, [live_key($c['id'], $owner)]);
        // down, death saves or conditions changed: everyone's fight and map load again
        if (fi_pc($accounts, $char) !== $health) live_publish($c['id'], ['type' => 'status']);
    }
    if ($queued || ($out['refused'] ?? [])) live_publish($c['id'], ['type' => 'char', 'char' => $char], null, 'dm');
    dm_out($code, $out);
}
if ($act === 'note') {
    // the owner's sheet: one line per edit and message, beside that edit in its queue
    if ((ch_meta($accounts, $char)['owner'] ?? null) !== $sub) dm_out(404, ['error' => 'No such character.']);
    $edit = (string)($b->edit ?? '');
    $text = mb_substr(trim((string)($b->text ?? '')), 0, 2000);
    $hit = null;
    foreach (dm_all($accounts, $char) as [$f, $e]) if ($e->id === $edit) $hit = [$f, $e];
    if (!$hit || $text === '') dm_out(404, ['error' => 'No such DM edit.']);
    [$f, $e] = $hit;
    $c = cp_get($accounts, (string)($e->c ?? ''));
    $q = dm_qread($f);
    $new = dm_note_add($q, (object)['id' => bin2hex(random_bytes(6)), 'at' => dm_now(), 'edit' => $edit, 'who' => $c ? dm_member_name($c, $sub) : 'The player', 'text' => $text]);
    if ($new && !dm_qput($f, $q)) dm_out(500, ['error' => "Couldn't save that."]);
    flock($cpl, LOCK_UN);
    flock($chl, LOCK_UN);
    if ($new && $c) live_publish($c['id'], ['type' => 'dmnote', 'char' => $char], null, 'dm');
    dm_out(200, ['ok' => true]);
}
if ($act === 'dismiss') {
    $c = cp_get($accounts, (string)($b->c ?? ''));
    if (!$c || !cp_is_dm($c, $sub)) dm_out(403, ['error' => 'Only the DM can do that.']);
    $f = dm_qfile($accounts, $c['id'], $char);
    $q = dm_qread($f);
    $keep = array_values(array_filter($q->notes, fn($n) => ($n->id ?? null) !== ($b->note ?? '')));
    if (count($keep) !== count($q->notes)) { $q->notes = $keep; if (!dm_qput($f, $q)) dm_out(500, ['error' => "Couldn't save that."]); }
    flock($cpl, LOCK_UN);
    flock($chl, LOCK_UN);
    live_publish($c['id'], ['type' => 'dmnote', 'char' => $char], null, 'dm');
    dm_out(200, ['ok' => true]);
}
dm_out(400, ['error' => 'Unknown action.']);
