<?php
// The Table view, now a plain Spectator window (the map and the turn tracker; ROADMAP 1.7, battle map rework) at /campaigns/<id>/table (campaigns/.htaccess, _dev/router.php): the DM opens it from the
// campaign page or the map page in a new tab of their own browser and moves that tab to the TV. It reads everything as the
// table (CP_TABLE, ?as=table on every request and on the live socket), so it gets exactly what a player with no characters
// gets and the server refuses any change from it (includes/auth.php). assets/js/table.js draws it; there are no controls.
//   GET ?c=<id>&ver    -> {"ver"}: the version of the Table view's files; the tab reloads itself when it changes
//   GET ?c=<id>&party  -> {"name", "party": [{name, art}]}: for the screen between maps
// Only the DM and co-DMs open it; no data the page shows is in this first render but the campaign's name and party.
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/campaigns.php';
$accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
$user = auth_user();
$c = $user ? cp_get($accounts, $_GET['c'] ?? '') : null;
$ok = $c && cp_member($c, $user['sub']) >= 0 && cp_is_dm($c, $user['sub']);
header('X-Robots-Tag: noindex');

// what the tab watches for a new version: its own files (an update to the site changes them)
function tv_ver()
{
    $files = ['/campaigns/table.php', '/assets/js/table.js', '/assets/js/map.js', '/assets/js/map-icons.js', '/assets/js/fight.js', '/assets/js/live.js', '/assets/js/conds.js',
        '/assets/css/pages/table.css', '/assets/css/pages/map.css', '/assets/css/pages/fight.css', '/assets/css/global.css', '/assets/css/components.css'];
    return substr(md5(implode('|', array_map(fn($f) => asset($f), $files))), 0, 12);
}
// the party: everyone may see their names and portraits
function tv_party($accounts, $c)
{
    $out = [];
    foreach ($c['members'] as $m) foreach ($m['characters'] ?? [] as $l) if ($card = cp_card($accounts, $l['id'] ?? '')) $out[] = ['name' => $card['name'], 'art' => $card['art']];
    return $out;
}
if (isset($_GET['ver']) || isset($_GET['party'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (!$ok) { http_response_code($user ? 404 : 401); exit('{"error":"No such campaign."}'); }
    exit(json_encode(isset($_GET['ver']) ? ['ver' => tv_ver()] : ['name' => $c['name'], 'party' => tv_party($accounts, $c)], JSON_UNESCAPED_SLASHES));
}
$site_page = ['nopopup' => true, 'title' => $ok ? 'Table · ' . $c['name'] : 'Table view not found', 'components' => true, 'css' => ['/assets/css/pages/fight.css', '/assets/css/pages/map.css', '/assets/css/pages/table.css']];
if (!$ok) http_response_code(404);
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <meta name="dnd-live-as" content="table">
</head>

<body class="tv-body">
<?php if ($ok): ?>
    <main class="tv" id="main" data-c="<?= h($c['id']) ?>" data-ver="<?= h(tv_ver()) ?>">
        <h1 class="mp-sr">Table · <?= h($c['name']) ?></h1>
        <div class="tv-map"><div class="mp-view" data-mp="view" aria-label="Map"></div></div>
        <section class="tv-idle" aria-label="The party" hidden>
            <h2 class="tv-name"><?= h($c['name']) ?></h2>
            <ul class="tv-party"><?php foreach (tv_party($accounts, $c) as $p): ?><li><span class="fi-face"><?php if ($p['art']): ?><img src="<?= h($p['art']) ?>" alt="" referrerpolicy="no-referrer" onerror="this.remove()"><?php endif; ?><span aria-hidden="true"><?= h(implode('', array_map(fn($w) => mb_strtoupper(mb_substr($w, 0, 1)), array_slice(preg_split('/\s+/', trim($p['name'])), 0, 2)))) ?></span></span><b><?= h($p['name']) ?></b></li><?php endforeach; ?></ul>
        </section>
        <div class="mpt-tr" data-mp="tracker" aria-label="Turn order"></div>
        <p class="tv-badge" role="status" hidden>Reconnecting...</p>
        <div class="mpt-br" data-mp="zoom"></div>
        <div data-mp="fight" hidden></div>
    </main>
    <script src="<?= h(asset('/assets/js/live.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/conds.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/fight.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/map-icons.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/map.js')) ?>" defer></script>
    <script src="<?= h(asset('/assets/js/table.js')) ?>" defer></script>
<?php else: ?>
    <?php site_header(); ?>
    <main class="page" id="main">
        <h1 class="page-title">Table view not found</h1>
        <p class="page-lede"><?= $user ? 'Only the DM and co-DMs of a campaign open its Table view, from the campaign page or the map.' : 'Sign in to open your campaigns.' ?></p>
        <p><a href="/campaigns/">Back to Campaigns</a></p>
    </main>
    <?php site_footer(); ?>
<?php endif; ?>
</body>

</html>
