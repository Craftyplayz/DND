<?php
$site_page = ['components' => true, 'ui' => true, 'css' => ['/assets/css/pages/games-dnd-sheet.css', '/assets/css/pages/games-dnd-monster.css', '/assets/css/pages/fight.css']];
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

    <main class="page hb mon" id="main"<?= auth_user() ? ' data-cloud' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="hb-sr">Monster Sheet</h1>

        <div class="bar hb-bar" id="hb-bar"><span class="hb-barin" id="hb-barin"></span><?= auth_button() ?></div>
        <?php // the fight (ROADMAP 1.4) in the campaign the sheet's rolls go to: a link to its battle map, where the DM runs it (1.6) ?>
        <section class="card mon-fight" id="mon-fight" aria-label="Fight" hidden></section>
        <div class="mon-wrap">
            <aside class="card mon-side" id="mon-side" aria-label="Encounter"></aside>
            <div class="hb-sheet" id="hb-sheet"><noscript><p class="err">This sheet needs JavaScript.</p></noscript></div>
        </div>
        <p class="muted hb-hint"><?= auth_user() ? 'Monsters are saved in this browser and in your account.' : 'Monsters are saved in this browser only. Use Export to back one up or move it to another device.' ?></p>

        <details class="mon-credit">
            <summary>Monster sources and licences</summary>
            <ul>
                <?php foreach ($sources as $s): ?>
                    <li><a href="<?= h($s['url']) ?>" target="_blank" rel="noopener"><?= h($s['title']) ?></a> (<?= h($s['licence']) ?>). <?= h($s['copyright']) ?></li>
                <?php endforeach; ?>
            </ul>
            <p>Open Game Content is used under the <a href="ogl.txt">Open Game License 1.0a</a>. Monster data from <a href="https://www.dnd5eapi.co/" target="_blank" rel="noopener">dnd5eapi.co</a> and <a href="https://open5e.com/" target="_blank" rel="noopener">Open5e</a>.</p>
            <p>The 2024 encounter budgets include material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener">dndbeyond.com/srd</a>, licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">Creative Commons Attribution 4.0 International License</a>. The 2014 XP thresholds and multipliers are the numbers from the free D&amp;D Basic Rules (2014), with no text copied.</p>
        </details>

        <dialog class="dlg hb-dlg" id="hb-dlg" aria-label="Sheet settings"><div id="hb-dlg-body"></div></dialog>
        <dialog class="dlg mon-dlg" id="mon-dlg" aria-label="Import a monster">
            <h2>Import a monster</h2>
            <input class="field" type="search" id="mon-q" placeholder="Goblin" aria-label="Search monsters by name" autocomplete="off">
            <div class="mon-findf">
                <label>CR from <input class="field" id="mon-crlo" placeholder="1/4" autocomplete="off"></label>
                <label>CR to <input class="field" id="mon-crhi" placeholder="5" autocomplete="off"></label>
                <label>Rules <select class="field" id="mon-rules"><option value="">All</option><option value="2014">2014</option><option value="2024">2024</option></select></label>
                <label id="mon-nwrap" hidden>How many <input class="field" type="number" id="mon-n" min="1" value="1"></label>
            </div>
            <div class="mon-sum" id="mon-sum" hidden><span id="mon-sumline"></span> <span class="muted" id="mon-added" aria-live="polite"></span></div>
            <p class="note" id="mon-status">Loading the monster list...</p>
            <div class="mon-results" id="mon-results"></div>
            <div class="actions"><button type="button" class="btn" data-mon-close>Close</button></div>
        </dialog>
        <?php // named encounters (ROADMAP 3.1): Manage encounters, the target list for Move / Copy to encounter; the party and phone difficulty details (3.2) ?>
        <dialog class="dlg mon-dlg" id="mon-encdlg" aria-label="Encounters"><div id="mon-encbody"></div></dialog>
        <aside class="drawer hb-drawer" id="hb-drawer" aria-label="Details" aria-hidden="true" tabindex="-1">
            <button type="button" class="close" data-act="dclose" aria-label="Close">&times;</button>
            <div id="hb-drawer-body"></div>
        </aside>
        <datalist id="hb-dl-srd"></datalist>
        <input type="file" id="hb-file" accept=".json,application/json" hidden>
        <input type="file" id="hb-artfile" accept="image/*" hidden>
    </main>

    <?php // the formula parser and rules text are the player sheet's own files ?>
    <script src="<?= h(asset('/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/rules.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/live.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/dmedit.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/fight.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/monster/difficulty.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/homebrew.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/monster/monster.js')) ?>" defer></script>
</body>

</html>
