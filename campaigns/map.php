<?php
// The battle map (ROADMAP 1.6), full screen, at /campaigns/<id>/map (campaigns/.htaccess, _dev/router.php). The DM and co-DMs
// upload and prepare maps, fit the grid, paint the fog, send it to the table and run the fight here; players see the map
// on the table with the turn order and move their own token. assets/js/map.js draws it; campaigns/maps.php decides what each
// person gets. Like the sheets it has no site header (a full-screen tool). Only members see it.
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/campaigns.php';
require_once SITE_ROOT . '/includes/live.php';
// DND_ACCOUNTS: a stand-in folder for the local checks, so they never touch real accounts
$accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
$user = auth_user();
$c = $user ? cp_get($accounts, $_GET['c'] ?? '') : null;
if ($c && cp_member($c, $user['sub']) < 0) $c = null;
$isDm = $c && cp_is_dm($c, $user['sub']);
$site_page = ['title' => $c ? 'Map · ' . $c['name'] : 'Map not found', 'components' => true, 'ui' => true, 'css' => ['/assets/css/pages/fight.css', '/assets/css/pages/map.css']];
header('X-Robots-Tag: noindex');
if (!$c) http_response_code(404);
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
<?php if ($c): ?>
    <main class="mp" id="main" data-c="<?= h($c['id']) ?>" data-me="<?= h(live_key($c['id'], $user['sub'])) ?>"<?= $isDm ? ' data-dm' : '' ?>>
        <h1 class="mp-sr">Map · <?= h($c['name']) ?></h1>
        <header class="mpt-top">
            <div class="mpt-tl" data-mp="tl"></div>
            <div class="mpt-tr" data-mp="tracker" aria-label="Turn order"></div>
            <div class="mpt-tright"><span data-mp="menuPick"></span><?= auth_button() ?></div>
        </header>
        <div class="mpt-main">
            <aside class="mpt-side" data-mp="side" aria-label="Combat" hidden></aside>
            <div class="mpt-stage">
                <div class="mp-view" data-mp="view" aria-label="Map"></div>
                <nav class="mpt-rail" data-mp="rail" aria-label="Map tools"></nav>
                <section class="mpt-fly" data-mp="opts" hidden></section>
                <div class="mpt-menu" data-mp="menu" hidden></div>
                <div class="mpt-br" data-mp="zoom"></div>
                <p class="note mpt-paused" data-mp="paused" hidden></p>
                <?php if (!$isDm): ?><section class="mpt-tray" data-mp="tray" hidden></section><?php endif; ?>
                <div data-mp="fight" hidden></div>
            </div>
        </div>
    </main>
    <script src="<?= h(asset('/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/live.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/dmedit.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/conds.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/fight.js')) ?>" defer></script>
    <?php if ($isDm): ?><script src="<?= h(asset('/sheets/monster/difficulty.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/monster/import.js')) ?>" defer></script><?php endif; ?>
    <script src="<?= h(asset('/assets/js/map.js')) ?>" defer></script>
    <script>
        addEventListener('DOMContentLoaded', () => { const m = document.getElementById('main'); window.BM = BattleMap.mount(m, m.dataset.c, { dm: 'dm' in m.dataset, me: m.dataset.me, full: true }); });
    </script>
<?php else: ?>
    <?php site_header(); ?>
    <main class="page" id="main">
        <h1 class="page-title">Map not found</h1>
        <p class="page-lede"><?= $user ? "You're not in this campaign, or it was deleted. Ask the DM for a join link." : 'Sign in to open your campaigns.' ?></p>
        <p><a href="/campaigns/">Back to Campaigns</a></p>
    </main>
    <?php site_footer(); ?>
<?php endif; ?>
</body>

</html>
