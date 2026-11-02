<?php
$site_page = ['components' => true, 'title' => 'Private'];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
auth_require();

// folder => description
$sections = [
    'transcripts' => 'Import a D&D session',
    'dnd' => 'D&D sheet backups',
    'dnd/monsters' => 'Monster sheet backups',
];
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <meta name="robots" content="noindex, nofollow">
</head>

<body>
    <?php site_header(); ?>

    <main class="page" id="main">
        <h1 class="page-title">Private</h1>
        <p class="page-lede">Password-protected pages.</p>

        <div class="hub-grid">
            <?php foreach ($sections as $dir => $label): ?>
                <a class="hub-card" href="/private/<?= $dir ?>/"><b><?= h($label) ?></b><span>/private/<?= $dir ?>/</span></a>
            <?php endforeach; ?>
        </div>
    </main>

    <?php site_footer(null, false); ?>
</body>

</html>
