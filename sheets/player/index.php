<?php
$site_page = ['components' => true, 'ui' => true, 'css' => ['/assets/css/pages/games-dnd-sheet.css']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php // no site header or footer here: the sheet and its dice use the whole screen (owner's choice) ?>

    <main class="page hb" id="main"<?= auth_user() ? ' data-cloud' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="hb-sr">Homebrew Character Sheet</h1>

        <div class="bar hb-bar" id="hb-bar"><span class="hb-barin" id="hb-barin"></span><?= auth_button() ?></div>
        <div class="hb-sheet" id="hb-sheet"><noscript><p class="err">This sheet needs JavaScript.</p></noscript></div>
        <p class="muted hb-hint"><?= auth_user() ? 'Characters are saved in this browser and in your account.' : 'Characters are saved in this browser only. Use Export to back one up or move it to another device.' ?></p>

        <dialog class="dlg hb-dlg" id="hb-dlg" aria-label="Sheet settings"><div id="hb-dlg-body"></div></dialog>
        <aside class="drawer hb-drawer" id="hb-drawer" aria-label="Details" aria-hidden="true" tabindex="-1">
            <button type="button" class="close" data-act="dclose" aria-label="Close">&times;</button>
            <div id="hb-drawer-body"></div>
        </aside>
        <datalist id="hb-dl-srd"></datalist>
        <input type="file" id="hb-file" accept=".json,application/json" hidden>
        <input type="file" id="hb-artfile" accept="image/*" hidden>
    </main>

    <script src="<?= h(asset('/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/ddb.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/rules.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/sheet.js')) ?>" defer></script>
</body>

</html>
