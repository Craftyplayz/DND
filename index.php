<?php
$site_page = [
    'components' => true,
];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page" id="main">
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="page-title">D&amp;D</h1>
        <p class="page-lede">Your characters, monsters and our campaigns.</p>
        <?php // cards come from site_pages() in includes/functions.php, so new pages show up here once listed there ?>
        <?php site_hub(); ?>
    </main>

    <?php site_footer(null, false); ?>
</body>

</html>
