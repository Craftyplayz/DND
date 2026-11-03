<?php
// My Characters. /characters/ lists the characters in this browser and the account (list.js);
// /characters/<id> (characters/.htaccess) opens one in the homebrew sheet, sheets/player/index.php.
// Only the owner gets a character from the account; anyone else gets it read-only when it's public. The DM or a co-DM of a
// campaign it's in gets it in DM mode, where every change goes to the player as a DM edit (includes/dmedits.php). A character that is
// only in a browser (signed out) has no folder, so the page opens and the sheet finds it in that browser.
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/dmedits.php';

$id = $_GET['id'] ?? '';
if ($id !== '') {
    if ($id !== 'new' && !ch_ok_id($id)) { header('Location: /characters/'); exit; }
    // DND_ACCOUNTS: a stand-in folder for _dev/scripts/characters-page.mjs, so the check never touches real accounts
    $accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
    $meta = ch_meta($accounts, $id);
    $user = auth_user();
    $mine = $meta && $user && ($meta['owner'] ?? null) === $user['sub'];
    $public = $meta && ($meta['visibility'] ?? '') === 'public';
    // the DM or a co-DM of a campaign it's in edits it as DM (ROADMAP 1.5): every change goes to the player as a DM edit
    $dm = $meta && $user && !$mine ? dm_campaign_of($accounts, $user['sub'], $id) : null;
    $hb = ['char' => $id, 'vis' => $meta['visibility'] ?? 'private', 'readonly' => $public && !$mine && !$dm];
    if ($dm) $hb['dm'] = ['c' => $dm[0]['id'], 'camp' => $dm[0]['name'], 'player' => $dm[1]];
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
            <a class="btn primary" href="/characters/build" data-act="create">Create a character</a>
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
        <?php // characters still in the builder (ROADMAP 4.2), with Resume; list.js shows it when there are some ?>
        <details class="ch-arc" id="ch-draft" open hidden><summary class="sec-h">Unfinished <span class="n" id="ch-draft-n"></span></summary>
            <div class="grid ch-grid" id="ch-draft-grid"></div>
        </details>
        <?php // archived characters (ROADMAP 0.5), folded away; list.js shows it when there are some ?>
        <details class="ch-arc" id="ch-arc" hidden><summary class="sec-h">Archived <span class="n" id="ch-arc-n"></span></summary>
            <div class="grid ch-grid" id="ch-arc-grid"></div>
        </details>
        <?php // Create a character: the builder or an empty sheet (ROADMAP 4.2); /characters/#create opens it (the Compendium links there) ?>
        <dialog class="dlg" id="ch-new" aria-labelledby="ch-new-h">
            <h2 id="ch-new-h">Create a character</h2>
            <p class="muted">Build it step by step, or start from an empty sheet and fill it in yourself.</p>
            <div class="hub-grid ch-newgrid">
                <a class="hub-card" href="/characters/build"><b>Build step by step</b><span>Class, race, ability scores, background and equipment, at any level from 1 to 20</span></a>
                <a class="hub-card" href="/characters/new"><b>Blank character</b><span>An empty sheet. Fill in everything yourself</span></a>
            </div>
            <div class="actions"><button type="button" class="btn" data-act="newclose">Cancel</button></div>
        </dialog>
        <p class="muted"><?= auth_user() ? 'Characters are saved in this browser and in your account.' : 'Signed out, characters are saved in this browser only. Sign in to keep them in your Google account.' ?></p>
    </main>

    <?php site_footer(); ?>
    <script src="<?= h(asset('/characters/list.js')) ?>" defer></script>
</body>

</html>
