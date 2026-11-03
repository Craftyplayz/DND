<?php
$site_page = [
    'title' => 'Credits',
    'description' => 'Where the rules text, spells, classes, races and icons on this site come from, and their licences',
    'components' => true,
];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
// the importer (_dev/scripts/build-content.mjs) writes one notice per source it used
$index = json_decode((string) @file_get_contents($_SERVER['DOCUMENT_ROOT'] . '/sheets/player/content/index.json'), true);
$credits = is_array($index['credits'] ?? null) ? $index['credits'] : [];
// bare links in a notice become clickable
function credit_text($s)
{
    return preg_replace('~(https?://[^\s<>"]+[^\s<>".,)])~', '<a href="$1">$1</a>', h($s));
}
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
        <h1 class="page-title">Credits</h1>
        <p class="page-lede">The classes, races, backgrounds, feats, spells and items in the character builder come from these sources. Each notice below is the one its licence asks for.</p>
        <div style="display: grid; gap: 12px; max-width: 820px">

        <?php foreach ($credits as $c): ?>
            <section class="card">
                <h2><?= h($c['name'] ?? '') ?></h2>
                <p class="muted"><?= h(implode(' · ', array_filter([$c['publisher'] ?? '', $c['author'] ?? '', implode(', ', $c['licences'] ?? [])]))) ?></p>
                <?php if (!empty($c['copyright'])): ?><p><?= credit_text($c['copyright']) ?></p><?php endif; ?>
                <p>
                    <?php if (!empty($c['permalink'])): ?><a href="<?= h($c['permalink']) ?>">Source</a><?php endif; ?>
                    <?php if (!empty($c['via'])): ?> · read from <a href="<?= h($c['via']) ?>"><?= h(preg_replace('~^https?://~', '', $c['via'])) ?></a><?php endif; ?>
                </p>
            </section>
        <?php endforeach; ?>

        <section class="card">
            <h2>Open Game License</h2>
            <p>Material marked above as under the Open Game License v1.0a is used under that licence. Its Section 15 copyright notices are the ones shown with each source. The full text is at <a href="https://opengamingfoundation.org/ogl.html">opengamingfoundation.org/ogl.html</a>.</p>
        </section>

        <section class="card">
            <h2>Icons</h2>
            <p>Icons by Carl Olsen, Caro Asercion, Cathelineau, Darkzaitzev, Delapouite, Faithtoken, Kier Heyl, Lorc, Sbed, Skoll and Zeromancer from <a href="https://game-icons.net">game-icons.net</a>, licensed <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>.</p>
        </section>

        </div>
    </main>

    <?php site_footer(); ?>
</body>

</html>
