<?php
$site_page = ['components' => true, 'ui' => true, 'css' => ['/assets/css/pages/games-dnd-sheet.css', '/assets/css/pages/games-dnd-monster.css']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
$sources = json_decode((string)@file_get_contents(__DIR__ . '/monsters.json'), true)['sources'] ?? [];
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php // a copy of the player sheet (no site header or footer, owner's choice), with an encounter list on the left ?>

    <main class="page hb mon" id="main">
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="hb-sr">Monster Sheet</h1>

        <div class="bar hb-bar" id="hb-bar"></div>
        <div class="mon-wrap">
            <aside class="card mon-side" id="mon-side" aria-label="Encounter"></aside>
            <div class="hb-sheet" id="hb-sheet"><noscript><p class="err">This sheet needs JavaScript.</p></noscript></div>
        </div>
        <p class="muted hb-hint">Monsters are saved in this browser only. Use Export to back one up or move it to another device.</p>

        <details class="mon-credit">
            <summary>Monster sources and licences</summary>
            <ul>
                <?php foreach ($sources as $s): ?>
                    <li><a href="<?= h($s['url']) ?>" target="_blank" rel="noopener"><?= h($s['title']) ?></a> (<?= h($s['licence']) ?>). <?= h($s['copyright']) ?></li>
                <?php endforeach; ?>
            </ul>
            <p>Open Game Content is used under the <a href="ogl.txt">Open Game License 1.0a</a>. Monster data from <a href="https://www.dnd5eapi.co/" target="_blank" rel="noopener">dnd5eapi.co</a> and <a href="https://open5e.com/" target="_blank" rel="noopener">Open5e</a>.</p>
        </details>

        <dialog class="dlg hb-dlg" id="hb-dlg" aria-label="Sheet settings"><div id="hb-dlg-body"></div></dialog>
        <dialog class="dlg mon-dlg" id="mon-dlg" aria-label="Import a monster">
            <h2>Import a monster</h2>
            <input class="field" type="search" id="mon-q" placeholder="Goblin" aria-label="Search monsters by name" autocomplete="off">
            <p class="note" id="mon-status">Loading the monster list...</p>
            <div class="mon-results" id="mon-results"></div>
            <div class="actions"><button type="button" class="btn" data-mon-close>Close</button></div>
        </dialog>
        <aside class="drawer hb-drawer" id="hb-drawer" aria-label="Details" aria-hidden="true" tabindex="-1">
            <button type="button" class="close" data-act="dclose" aria-label="Close">&times;</button>
            <div id="hb-drawer-body"></div>
        </aside>
        <datalist id="hb-dl-srd"></datalist>
        <input type="file" id="hb-file" accept=".json,application/json" hidden>
        <input type="file" id="hb-artfile" accept="image/*" hidden>
    </main>

    <?php // the formula parser and rules text are the player sheet's own files ?>
    <script src="<?= h(asset('/games/dnd/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/games/dnd/sheets/player/rules.js')) ?>" defer></script>
    <script src="<?= h(asset('/games/dnd/sheets/monster/monster.js')) ?>" defer></script>
</body>

</html>
