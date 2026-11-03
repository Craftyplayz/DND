<?php
// A join link: /campaigns/join/<code> (campaigns/join/.htaccess). Shows the campaign and a Join button (campaigns.js posts
// to campaigns/api.php), so a link opened by a stray image or a preview bot never joins anyone. Already in it: straight there.
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/campaigns.php';
$accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
$user = auth_user();
$code = (string)($_GET['code'] ?? '');
if ($code === '') { header('Location: /campaigns/', true, 303); exit; }
$c = cp_by_code($accounts, $code);
if ($c && $user && cp_member($c, $user['sub']) >= 0) { header('Location: /campaigns/' . $c['id'], true, 303); exit; }
if (!$c) http_response_code(404);
header('X-Robots-Tag: noindex');
$site_page = ['title' => $c ? 'Join ' . $c['name'] : 'Link not working', 'components' => true, 'ui' => true];
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page cp" id="main">
<?php if (!$c): ?>
        <h1 class="page-title">This link doesn't work</h1>
        <p class="page-lede">The DM may have made a new link, or deleted the campaign. Ask them for a new one.</p>
        <p><a href="/campaigns/">Go to Campaigns</a></p>
<?php else: ?>
        <h1 class="page-title"><?= h($c['name']) ?></h1>
        <p class="page-lede"><?= h($c['members'][0]['name']) ?> invited you to join this campaign as a player.</p>
        <?php if ($user): ?>
            <p><button type="button" class="btn primary" data-act="join" data-code="<?= h($code) ?>">Join campaign</button></p>
        <?php else: ?>
            <p class="note"><?= auth_enabled() ? 'Sign in with Google (top right) to join. You come back here afterwards.' : "Sign-in isn't set up on this server, so campaigns are off." ?></p>
        <?php endif; ?>
<?php endif; ?>
    </main>

    <?php site_footer(null, false); ?>
    <?php if ($c && $user): ?><script src="<?= h(asset('/campaigns/campaigns.js')) ?>" defer></script><?php endif; ?>
</body>

</html>
