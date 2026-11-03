<?php
// The character builder (ROADMAP 4.2), /characters/build: a new character step by step, at any level, as a real character
// that is saved as you go (a "draft" in My Characters until Finish). ?id=<id> resumes a draft; ?up=<id> is the Level up of a
// finished character (4.3), the same screens for the next level only. The steps are builder.js; the rules are
// sheets/player/build.js. Signed in, the campaigns you play in (and their DM's character rules) are in the page.
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/campaigns.php';
$accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
$user = auth_user();
$camps = [];
if ($user) foreach (cp_all($accounts) as $c) {
    $i = cp_member($c, $user['sub']);
    if ($i < 0) continue;
    $camps[] = ['id' => $c['id'], 'name' => $c['name'], 'rules' => cp_rules($c), 'mine' => array_values(array_column($c['members'][$i]['characters'] ?? [], 'id'))];
}
usort($camps, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
$site_page = ['title' => isset($_GET['up']) ? 'Level up' : 'Character Builder', 'components' => true, 'ui' => true, 'css' => ['/assets/css/pages/builder.css']];
header('X-Robots-Tag: noindex');
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page bd" id="main"<?= $user ? ' data-cloud' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
        <div class="bd-top">
            <h1 class="page-title" id="bd-title"><?= isset($_GET['up']) ? 'Level up' : 'New character' ?> <span class="muted bd-sum" id="bd-sum"></span></h1>
            <span class="bd-saved muted" id="bd-saved" aria-live="polite"></span>
            <button type="button" class="btn small" data-act="exit">Save and exit</button>
            <button type="button" class="btn small" data-act="cancel">Cancel</button>
        </div>
        <div class="bd-layout">
            <nav class="bd-steps" aria-label="Steps"><details id="bd-stepsdet" open><summary id="bd-stepsum"></summary><ol id="bd-steplist"></ol></details></nav>
            <div class="bd-main">
                <section class="card bd-step" id="bd-step" aria-live="polite"><p class="muted">Loading the classes, races and backgrounds...</p><noscript><p class="err">The builder needs JavaScript.</p></noscript></section>
                <div class="bd-nav"><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn primary" data-act="next">Next</button></div>
            </div>
        </div>
        <p class="muted bd-credit">Classes, races, backgrounds and spells from the System Reference Document 5.1 by Wizards of the Coast, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC-BY-4.0</a>, the content credited on each entry and icons from game-icons.net (CC BY 3.0). All sources are on the <a href="/credits/">Credits</a> page.</p>
        <script type="application/json" id="bd-camps"><?= json_encode($camps) ?></script>
        <input type="file" id="bd-artfile" accept="image/*" hidden>
        <aside class="bd-panel" id="bd-panel" role="dialog" aria-modal="false" aria-labelledby="bd-ptitle" hidden>
            <div class="bd-phead"><h2 id="bd-ptitle"></h2><button type="button" class="btn small" id="bd-pclose" data-act="pclose">Close</button></div>
            <div class="bd-pmeta" id="bd-pmeta"></div>
            <div class="bd-pbody" id="bd-pbody"></div>
            <div class="bd-pfoot"><button type="button" class="btn primary" id="bd-ppick" data-act="ppick" hidden>Pick</button></div>
        </aside>
    </main>

    <?php site_footer(); ?>
    <script src="<?= h(asset('/sheets/player/model.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/formula.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/build.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/content.js')) ?>" defer></script>
    <script src="<?= h(asset('/sheets/player/rules.js')) ?>" defer></script>
    <script src="<?= h(asset('/characters/build/builder.js')) ?>" defer></script>
</body>

</html>
