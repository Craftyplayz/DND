<?php
// The homebrew sheet. It only opens through /characters/<id> (characters/index.php includes this page with $hb set);
// the old all-characters page at /sheets/player/ is retired and goes to My Characters, which lists the same browser storage.
// The files stay here: saves (cloud.php), portraits (art.php) and backups keep their addresses.
if (!isset($hb)) { header('Location: /characters/', true, 301); exit; }
// $hb:
//   char: the character to open ("new" makes one), readonly: someone else's public character,
//   inline: the account's copy of it as JSON (owner or public only), vis: private or public,
//   dm: {c, camp, player} when the viewer edits it as the DM of campaign c (ROADMAP 1.5)
$hb = ($hb ?? []) + ['char' => '', 'readonly' => false, 'inline' => null, 'vis' => 'private', 'dm' => null];
$site_page = ($site_page ?? []) + ['components' => true, 'ui' => true, 'cover' => true, 'css' => ['/assets/css/pages/games-dnd-sheet.css', '/assets/css/pages/fight.css', '/assets/css/pages/handouts.css']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php // no site header or footer here: the sheet and its dice use the whole screen (owner's choice) ?>

    <main class="page hb" id="main"<?= auth_user() ? ' data-cloud' : '' ?><?= $hb['char'] !== '' ? ' data-char="' . h($hb['char']) . '" data-vis="' . h($hb['vis']) . '"' : '' ?><?= $hb['readonly'] ? ' data-readonly' : '' ?><?= $hb['dm'] ? ' data-dm="' . h($hb['dm']['c']) . '" data-dm-camp="' . h($hb['dm']['camp']) . '" data-dm-player="' . h($hb['dm']['player']) . '"' : '' ?>>
        <?= $hb['char'] === '' ? site_breadcrumbs(site_current_path()) : '' ?>
        <h1 class="hb-sr">Homebrew Character Sheet</h1>

        <div class="bar hb-bar" id="hb-bar"><span class="hb-barin" id="hb-barin"></span><?= auth_button() ?></div>
        <div class="hb-sheet" id="hb-sheet"><noscript><p class="err">This sheet needs JavaScript.</p></noscript></div>
        <p class="muted hb-hint"><?= $hb['dm'] ? 'Every change you make here goes to ' . h($hb['dm']['player']) . ' as a DM edit, shown in their roll log.' : ($hb['readonly'] ? 'You are looking at someone else\'s character. Nothing you change here is saved.' : (auth_user() ? 'Characters are saved in this browser and in your account.' : 'Characters are saved in this browser only. Use Export to back one up or move it to another device.')) ?></p>
        <?php // the account's copy, as text: "</" can't end the script early because JSON escapes "/" by default ?>
        <?php if ($hb['inline'] !== null): ?><script type="application/json" id="hb-char"><?= json_encode(json_decode($hb['inline'])) ?></script><?php endif; ?>

        <dialog class="dlg hb-dlg" id="hb-dlg" aria-label="Sheet settings"><div id="hb-dlg-body"></div></dialog>
        <aside class="drawer hb-drawer" id="hb-drawer" aria-label="Details" aria-hidden="true" tabindex="-1">
            <button type="button" class="close" data-act="dclose" aria-label="Close">&times;</button>
            <div id="hb-drawer-body"></div>
        </aside>
        <datalist id="hb-dl-srd"></datalist>
        <input type="file" id="hb-file" accept=".json,application/json" hidden>
        <input type="file" id="hb-artfile" accept="image/*" hidden>
    </main>

    <script src="<?= h(asset('/sheets/player/model.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/build.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/content.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/ddb.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/rules.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/versions.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/dmedit.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/live.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/fight.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/handouts.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/homebrew.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/phone.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/sheet.js')) ?>" defer></script>
</body>

</html>
