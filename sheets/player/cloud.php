<?php
// Cloud saves for signed-in players: one folder per character in private/dnd/accounts/characters/<id>/ (includes/characters.php).
//   GET                         -> {"chars": {"<id>": <updated>, ...}}, the characters this player owns
//   GET ?id=<id>                -> that character
//   GET ?id=<id>&versions=1[&before=<n>] -> its saved versions, newest first, 20 at a time (ROADMAP 0.5)
//   GET ?id=<id>&version=<n>    -> one saved version
//   POST a character            -> kept unless the saved copy has a newer "updated" (then 409 with {"updated"});
//                                  an id another player owns gets 409 {"taken": true}
//   POST ?id=<id>&restore=<n>   -> the character, restored from version n (a new version; "before" is the one Undo goes back to)
//   POST ?id=<id>&version=<n>   -> {"name": "..."}: names a version ("" clears it)
//   POST ?id=<id>&visibility=   -> private or public
//   DELETE ?id=<id>             -> archives it (players can't delete characters; nothing moves)
// An archived character (its "archived" field) leaves every campaign it was in.
// The session cookie is SameSite=Lax and writes must be JSON, so other sites can't post here as the player.
require __DIR__ . '/../../includes/auth.php';
require __DIR__ . '/../../includes/characters.php';
require __DIR__ . '/../../includes/campaigns.php';
// DND_ACCOUNTS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real accounts
if (!defined('CL_ACCOUNTS')) define('CL_ACCOUNTS', getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts');
const CL_MAX = 8 * 1024 * 1024; // only stops a broken client: the proxy turns away requests near 8 MB anyway

function cl_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// after a save: an archived character is taken off its campaigns (re-attached by hand after unarchiving)
function cl_done($r, $id)
{
    if ($r[0] === 200 && ch_archived(ch_meta(CL_ACCOUNTS, $id)) && ($lock = cp_lock(CL_ACCOUNTS))) cp_detach(CL_ACCOUNTS, $id);
    cl_out(...$r);
}

$user = auth_user();
if (!$user) cl_out(401, ['error' => 'Sign in to save characters to your account.']);
$sub = $user['sub'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$id = $_GET['id'] ?? null;

if ($method === 'GET' && $id !== null) {
    if (isset($_GET['versions'])) cl_out(...ch_versions(CL_ACCOUNTS, $sub, $id, (int)($_GET['before'] ?? 0), 20));
    if (isset($_GET['version'])) cl_out(...ch_version(CL_ACCOUNTS, $sub, $id, $_GET['version']));
    $meta = ch_meta(CL_ACCOUNTS, $id);
    ($meta['owner'] ?? null) === $sub ? cl_out(200, (string)file_get_contents(CL_ACCOUNTS . "/characters/$id/character.json")) : cl_out(404, ['error' => 'No such character.']);
}
if ($method === 'POST' && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) cl_out(415, ['error' => 'Send the character as JSON.']);
$lock = ch_lock(CL_ACCOUNTS);
if (!$lock) cl_out(500, ['error' => "Couldn't lock the characters folder."]);

// before anything else this player does, so a save can't beat their older characters into the folders
ch_copy_in(CL_ACCOUNTS, $sub);
if ($method === 'GET') cl_out(200, ['chars' => (object)ch_list(CL_ACCOUNTS, $sub)]);
if ($method === 'DELETE') {
    if (!ch_ok_id($id)) cl_out(400, ['error' => 'Bad character id.']);
    cl_done(ch_archive_now(CL_ACCOUNTS, $sub, $id), $id);
}
if ($method !== 'POST') cl_out(405, ['error' => 'Use GET, POST or DELETE.']);
if (isset($_GET['visibility'])) cl_out(...ch_set_visibility(CL_ACCOUNTS, $sub, $id, $_GET['visibility']));

$body = file_get_contents('php://input', false, null, 0, CL_MAX + 1);
if ($body === false || $body === '') cl_out(400, ['error' => 'No character was sent.']);
if (strlen($body) > CL_MAX) cl_out(413, ['error' => 'That character is too big to save.']);
if (isset($_GET['version'])) cl_out(...ch_name_version(CL_ACCOUNTS, $sub, $id, $_GET['version'], (json_decode($body, true) ?: [])['name'] ?? ''));
if (isset($_GET['restore'])) cl_done(ch_restore(CL_ACCOUNTS, $sub, $id, $_GET['restore'], $body), $id);
$r = ch_save(CL_ACCOUNTS, $sub, $body);
cl_done($r, (json_decode($body, true) ?: [])['id'] ?? '');
