<?php
// Compendium: search spells, monsters, items, magic items, classes, races, backgrounds, feats and rules; add them to a
// character or an encounter. The lists load in the browser (assets/js/compendium.js) from sheets/player/content/ (2014 and
// 2024 rules), monsters.json and rules.js; a monster's stat block comes through the cached proxy sheets/monster/monsters.php.
// ?embed=1 is the Compendium popup (assets/js/popup.js): this page in a frame, with no header, footer or title, links opening in the whole window
$embed = ($_GET['embed'] ?? '') === '1';
$site_page = ['nopopup' => true, 'components' => true, 'ui' => true, 'css' => ['/assets/css/pages/compendium.css']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
$sources = (json_decode((string)@file_get_contents(SITE_ROOT . '/sheets/monster/monsters.json'), true) ?: [])['sources'] ?? [];
?>
<!DOCTYPE html>
<html lang="en"<?= $embed ? ' class="cp-embed"' : '' ?>>

<head>
    <?php page_head(); if ($embed) echo '<base target="_top">'; ?>
</head>

<body>
    <?php if (!$embed) site_header(); ?>

    <main class="page cp" id="main"<?= auth_user() ? ' data-cloud' : '' ?> data-hbform="<?= h(asset('/assets/js/homebrew-form.js')) ?>">
<?php if (!$embed): ?>
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="page-title">Compendium</h1>
        <p class="page-lede">Spells, monsters, items, classes, races, backgrounds, feats and rules for the 2014 and 2024 rules, with your homebrew.</p>
<?php endif; ?>

        <fieldset class="cp-rules" id="cp-rules">
            <legend>Rules</legend>
            <label class="check"><input type="radio" name="cp-rules" value="2014"> 2014</label>
            <label class="check"><input type="radio" name="cp-rules" value="2024"> 2024</label>
            <label class="check"><input type="radio" name="cp-rules" value="both" checked> Both</label>
            <label class="check"><input type="radio" name="cp-rules" value="homebrew"> Homebrew</label>
        </fieldset>

        <div class="stabs cp-tabs" id="cp-tabs" role="tablist" aria-label="Type"></div>
        <div class="bar cp-bar">
            <input class="field cp-q" type="search" id="cp-q" placeholder="Search by name (press / to jump here)" aria-label="Search the compendium" autocomplete="off">
            <button type="button" class="btn" id="cp-books">Sources</button>
            <button type="button" class="btn cp-filter-btn" id="cp-fbtn" aria-expanded="false" aria-controls="cp-filters">Filters</button>
            <span class="muted" id="cp-count"></span>
            <button type="button" class="btn" id="cp-arch" hidden></button>
            <button type="button" class="btn primary" id="cp-new" hidden></button>
            <button type="button" class="btn" id="cp-new2" hidden></button>
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

        <p class="muted cp-foot">Monster stat blocks from dnd5eapi.co (SRD 5.1) and Open5e, cached for 30 days. <button type="button" class="cp-link" id="cp-credits-btn">Credits</button></p>

        <dialog class="dlg" id="cp-credits" aria-labelledby="cp-credits-t">
            <h2 id="cp-credits-t">Credits</h2>
            <div class="cp-credits">
                <p>This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener">dnd.wizards.com</a>. The SRD 5.1 is licensed under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">Creative Commons Attribution 4.0 International License</a>.</p>
                <p>The books the classes, races, backgrounds, feats, spells and items come from are listed on the <a href="/credits/">Credits</a> page.</p>
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

        <dialog class="dlg" id="cp-hb" aria-labelledby="cp-hb-t">
            <h2 id="cp-hb-t"></h2>
            <form class="form" id="cp-hb-form" novalidate>
                <div class="form" id="cp-hb-fields"></div>
                <p id="cp-hb-err" hidden></p>
                <div class="actions"><button type="button" class="btn" data-hb-cancel>Cancel</button><button class="btn primary">Save</button></div>
            </form>
        </dialog>

        <dialog class="dlg cp-hbw" id="cp-hbw" aria-labelledby="cp-hbw-t">
            <div class="cp-hbwtop"><h2 id="cp-hbw-t"></h2><button type="button" class="btn small" id="cp-hbw-close">Close</button></div>
            <nav aria-label="Steps"><ol class="cp-hbsteps" id="cp-hbw-steps"></ol></nav>
            <div class="cp-hbwbody" id="cp-hbw-body" tabindex="-1"></div>
            <div class="cp-hbwfoot"><small class="muted" id="cp-hbw-saved"></small><div class="actions"><button type="button" class="btn" id="cp-hbw-back">Back</button><button type="button" class="btn primary" id="cp-hbw-next">Next</button></div></div>
            <div id="cp-hbw-lists"></div>
        </dialog>

        <dialog class="dlg" id="cp-hbask" aria-labelledby="cp-hbask-t">
            <p id="cp-hbask-t"></p>
            <div class="actions"><button type="button" class="btn" id="cp-hbask-no"></button><button type="button" class="btn primary" id="cp-hbask-yes"></button></div>
        </dialog>

        <dialog class="dlg" id="cp-hbarch" aria-labelledby="cp-hbarch-t">
            <h2 id="cp-hbarch-t">Archived homebrew</h2>
            <div id="cp-hbarch-body" class="rows"></div>
            <div class="actions"><button type="button" class="btn" data-close>Close</button></div>
        </dialog>
    </main>

    <?php if (!$embed) site_footer(); ?>
    <script src="<?= h(asset('/assets/js/fuzzy.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/homebrew-content.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/homebrew.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/books.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/compendium.js')) ?>" defer></script>
</body>

</html>
