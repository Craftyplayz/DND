<?php
// My Characters. /characters/ lists the characters in this browser and the account (list.js);
// /characters/<id> (characters/.htaccess) opens one in the homebrew sheet, sheets/player/index.php.
// Only the owner gets a character from the account; anyone else gets it read-only when it's public, and so does the DM of
// a campaign it's in (includes/campaigns.php). A character that is
// only in a browser (signed out) has no folder, so the page opens and the sheet finds it in that browser.
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/campaigns.php';

$id = $_GET['id'] ?? '';
if ($id !== '') {
    if ($id !== 'new' && !ch_ok_id($id)) { header('Location: /characters/'); exit; }
    // DND_ACCOUNTS: a stand-in folder for _dev/scripts/characters-page.mjs, so the check never touches real accounts
    $accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
    $meta = ch_meta($accounts, $id);
    $user = auth_user();
    $mine = $meta && $user && ($meta['owner'] ?? null) === $user['sub'];
    $public = $meta && ($meta['visibility'] ?? '') === 'public';
    $dm = $meta && $user && !$mine && !$public && cp_dm_sees($accounts, $user['sub'], $id);
    $hb = ['char' => $id, 'vis' => $meta['visibility'] ?? 'private', 'readonly' => ($public || $dm) && !$mine];
    if ($mine || $public || $dm) $hb['inline'] = (string)file_get_contents("$accounts/characters/$id/character.json");
    $c = isset($hb['inline']) ? json_decode($hb['inline'], true) : null;
    $site_page = ['title' => ($c['name'] ?? '') !== '' ? $c['name'] : 'Character'];
    if (!$public) header('X-Robots-Tag: noindex');
    require SITE_ROOT . '/sheets/player/index.php';
    exit;
}

$site_page = ['components' => true, 'ui' => true, 'css' => ['/assets/css/pages/characters.css']];
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page ch" id="main"<?= auth_user() ? ' data-cloud' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
        <div class="ch-head">
            <h1 class="page-title">My Characters</h1>
            <a class="btn primary" href="/characters/new">Create a character</a>
        </div>
        <div class="bar ch-bar">
            <input class="field ch-q" type="search" id="ch-q" placeholder="Search by name, level, class, species or campaign" aria-label="Search characters" autocomplete="off">
            <select class="field" id="ch-sort" aria-label="Sort by">
                <option value="created">Created: oldest</option>
                <option value="-created">Created: newest</option>
                <option value="-updated">Last edited</option>
                <option value="name">Name</option>
                <option value="-level">Level</option>
            </select>
            <span class="muted" id="ch-count"></span>
        </div>
        <div class="grid ch-grid" id="ch-grid"><noscript><p class="err">This page needs JavaScript.</p></noscript></div>
        <p class="muted"><?= auth_user() ? 'Characters are saved in this browser and in your account.' : 'Signed out, characters are saved in this browser only. Sign in to keep them in your Google account.' ?></p>

        <dialog class="dlg" id="ch-del" aria-labelledby="ch-del-title">
            <h2 id="ch-del-title">Delete this character?</h2>
            <p id="ch-del-text"></p>
            <div class="actions"><button type="button" class="btn" value="cancel" id="ch-del-no">Cancel</button><button type="button" class="btn primary" id="ch-del-yes">Delete</button></div>
        </dialog>
    </main>

    <?php site_footer(); ?>
    <script src="<?= h(asset('/characters/list.js')) ?>" defer></script>
</body>

</html>
