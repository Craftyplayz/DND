<?php
// Character portraits kept in the account (ROADMAP 0.4), one per character folder: <accounts>/characters/<id>/art.<ext>
// (includes/characters.php). The sheet uploads a character's inline art once signed in, and only after this answers
// does the character swap the inline copy for the address below.
//   GET ?id=<id>&v=<hash>   -> the picture: for its owner, anyone when the character is public, and the players of a
//                              campaign it's in. Cached for good (a new picture gets a new v).
//   POST ?id=<id>           -> the picture's bytes as image/*; owner only -> {"url"}. The old picture moves to history/.
// Uploads must be sent as image/*, which another site's page can't do without asking first, so it can't upload as the player.
require __DIR__ . '/../../includes/auth.php';
require __DIR__ . '/../../includes/campaigns.php';
const CL_ART_MAX = 8 * 1024 * 1024; // only stops a broken client: the proxy turns away requests near 8 MB anyway
// DND_ACCOUNTS: a stand-in folder for _dev/scripts/art-sync.mjs, so the check never touches real accounts
$accounts = getenv('DND_ACCOUNTS') ?: __DIR__ . '/../../private/dnd/accounts';
$id = (string)($_GET['id'] ?? '');

function art_out($code, $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

$user = auth_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $meta = ch_meta($accounts, $id);
    $file = $meta ? ch_art_file($accounts, $id) : null;
    $sub = $user['sub'] ?? null;
    $may = $meta && (($meta['visibility'] ?? '') === 'public' || ($sub && (($meta['owner'] ?? null) === $sub || cp_member_sees($accounts, $sub, $id))));
    if (!$file || !$may) art_out(404, ['error' => 'No such picture.']);
    header('Content-Type: ' . CH_ART_TYPES[pathinfo($file, PATHINFO_EXTENSION)]);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: ' . (($meta['visibility'] ?? '') === 'public' ? 'public' : 'private') . ', max-age=31536000, immutable');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}
if ($method !== 'POST') art_out(405, ['error' => 'Use GET or POST.']);
if (!$user) art_out(401, ['error' => 'Sign in to save pictures to your account.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'image/') !== 0) art_out(415, ['error' => 'Send the picture as an image.']);
$bytes = file_get_contents('php://input', false, null, 0, CL_ART_MAX + 1);
if ($bytes === false || $bytes === '') art_out(400, ['error' => 'No picture was sent.']);
if (strlen($bytes) > CL_ART_MAX) art_out(413, ['error' => 'That picture is too big.']);
$lock = ch_lock($accounts);
if (!$lock) art_out(500, ['error' => "Couldn't lock the characters folder."]);
art_out(...ch_art_save($accounts, $user['sub'], $id, $bytes));
