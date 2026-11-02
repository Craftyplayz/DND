<?php
// Compendium: search spells, monsters, items, magic items and rules; add them to a character or an encounter.
// The lists load in the browser (assets/js/compendium.js); a clicked entry's full text comes through the cached
// proxies sheets/player/spells.php, sheets/monster/monsters.php and compendium/items.php.
$site_page = ['components' => true, 'ui' => true, 'css' => ['/assets/css/pages/compendium.css']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
$sources = (json_decode((string)@file_get_contents(SITE_ROOT . '/sheets/monster/monsters.json'), true) ?: [])['sources'] ?? [];
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page cp" id="main"<?= auth_user() ? ' data-cloud' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="page-title">Compendium</h1>
        <p class="page-lede">Spells, monsters, items and rules from the SRD 5.1 and open-licence books, with the extra spells and your homebrew.</p>

        <div class="stabs cp-tabs" id="cp-tabs" role="tablist" aria-label="Type"></div>
        <div class="bar cp-bar">
            <input class="field cp-q" type="search" id="cp-q" placeholder="Search by name (press / to jump here)" aria-label="Search the compendium" autocomplete="off">
            <button type="button" class="btn cp-filter-btn" id="cp-fbtn" aria-expanded="false" aria-controls="cp-filters">Filters</button>
            <span class="muted" id="cp-count"></span>
        </div>
        <div class="cp-filters" id="cp-filters"></div>

        <div class="cp-grid">
            <section class="cp-listbox" aria-label="Results">
                <div id="cp-list" class="cp-list" aria-live="polite"></div>
                <div id="cp-more" class="cp-more" aria-hidden="true"></div>
            </section>
            <aside class="cp-detail" id="cp-detail" aria-label="Details" tabindex="-1">
                <div class="cp-dhead"><button type="button" class="btn small" id="cp-back">Back to results</button></div>
                <div id="cp-dbody"><p class="muted cp-empty">Pick an entry to read it here.</p></div>
            </aside>
        </div>

        <p class="muted cp-foot">SRD 5.1 data from dnd5eapi.co and open-licence monsters from Open5e, cached for 30 days. <button type="button" class="cp-link" id="cp-credits-btn">Credits</button></p>

        <dialog class="dlg" id="cp-credits" aria-labelledby="cp-credits-t">
            <h2 id="cp-credits-t">Credits</h2>
            <div class="cp-credits">
                <p>This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener">dnd.wizards.com</a>. The SRD 5.1 is licensed under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">Creative Commons Attribution 4.0 International License</a>.</p>
                <p>The extra spells are listed by name and numbers only; their text stays on <a href="https://dnd5e.wikidot.com/" target="_blank" rel="noopener">dnd5e.wikidot.com</a>.</p>
                <h3>Monster books</h3>
                <ul>
                    <?php foreach ($sources as $s): ?>
                        <li><a href="<?= h($s['url']) ?>" target="_blank" rel="noopener"><?= h($s['title']) ?></a> (<?= h($s['licence']) ?>). <?= h($s['copyright']) ?></li>
                    <?php endforeach; ?>
                </ul>
                <p>Open Game Content is used under the <a href="/sheets/monster/ogl.txt">Open Game License 1.0a</a>.</p>
            </div>
            <div class="actions"><button type="button" class="btn primary" data-close>Close</button></div>
        </dialog>

        <dialog class="dlg" id="cp-pick" aria-labelledby="cp-pick-t">
            <h2 id="cp-pick-t">Add to which character?</h2>
            <div id="cp-pick-body" class="rows"></div>
            <div class="actions"><button type="button" class="btn" data-close>Cancel</button></div>
        </dialog>

        <dialog class="dlg" id="cp-dup" aria-labelledby="cp-dup-t">
            <h2 id="cp-dup-t">Add another?</h2>
            <p id="cp-dup-text"></p>
            <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="cp-dup-yes">Add another</button></div>
        </dialog>
    </main>

    <?php site_footer(); ?>
    <script src="<?= h(asset('/assets/js/fuzzy.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/compendium.js')) ?>" defer></script>
</body>

</html>
