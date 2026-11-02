<?php
// Dice Sets: pick one of the ten 3D dice sets (sets/<key>.js) and a sound (the set's own, or one of sounds.js), then roll,
// or make a die land on a chosen number to hear how a roll ending on it sounds. The page's script is dice.js.
$site_page = ['components' => true, 'css' => ['/assets/css/pages/games-dnd-sheet-dice.css']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
// key => [name, what it looks like, what its own sound is like]; the look and sound live in sets/<key>.js
$sets = [
    'ember' => ['Ember Cage', 'A dark iron lattice over a molten core that churns, with sparks drifting up off each die.', 'Iron clanks with a crackle of embers; a whoosh of flame on the throw.'],
    'frost' => ['Frostbound', 'Pale blue ice with silver filigree, frost creeping across the faces and snowflakes circling.', 'Glassy ice clinks and crunches; a cold gust on the throw and a wind-chime shimmer at rest.'],
    'arcane' => ['Arcane Orrery', 'Violet glass inside spinning gold rings, like a tiny orrery, with runes that pulse with light.', 'Bell-like tings tuned to a scale; a rising shimmer on the throw and a soft chord when they settle.'],
    'clockwork' => ['Clockwork', 'Brass faces etched with gears, with small gears turning around each die.', 'Ratchet clicks and metal ticks; a winding sound on the throw and a tick-tock that winds down to a ding.'],
    'storm' => ['Stormcaller', 'Slate-dark glass with lightning flickering across the faces and sparks arcing off the edges.', 'Sharp electric zaps on each hit; thunder on the throw and a distant rumble as they settle.'],
    'wildwood' => ['Wildwood', 'Living wood wrapped in vines, with leaves swaying on the faces and fireflies drifting round.', 'Hollow woody knocks; a rustle of leaves on the throw and a soft birdlike chirp at rest.'],
    'abyss' => ['Abyssal Tide', 'Deep-sea teal with light rippling across the faces and bubbles rising from each die.', 'Muffled underwater thuds and bubble pops; a wave swelling on the throw and a burst of bubbles at rest.'],
    'starfall' => ['Starfall', 'Midnight blue with a slowly turning galaxy inside, silver constellations and stars in orbit.', 'Soft glassy pings that ring out; a whoosh on the throw and a twinkling run of notes when they settle.'],
    'venom' => ['Viper Venom', 'A bone-white frame over toxic green liquid that bubbles, with drips falling from each die.', 'Dry bone clacks and wet gurgles; a hiss on the throw and a last gurgle as they settle.'],
    'spectral' => ['Spectral', 'Ghostly see-through dice with a glowing wisp circling each one and leaving a trail.', 'Hollow, echoing knocks; a breathy rush on the throw and a low moan that fades at rest.'],
];
// the classic plain styles built into dice3d.js (its STYLES), with the standard knock sound
$classic = ['purple' => 'Purple', 'gold' => 'Gold', 'silver' => 'Silver', 'obsidian' => 'Obsidian', 'ruby' => 'Ruby', 'wood' => 'Wood', 'marble' => 'Marble', 'ivory' => 'Ivory'];
$v = fn($f) => filemtime(__DIR__ . '/' . $f);
$data = [
    'engine' => './dice3d.js?v=' . filemtime(__DIR__ . '/dice3d.js'),
    'choice' => './choice.js?v=' . $v('choice.js'),
    'sounds' => './sounds.js?v=' . $v('sounds.js'),
    // coin sound profiles (flip, bounces and settle), a couple to a file
    'coinsounds' => array_map(fn($f) => './coinsounds/' . basename($f) . '?v=' . filemtime($f), glob(__DIR__ . '/coinsounds/*.js') ?: []),
    // things made for one set only, in extras/<set>/trails/ and extras/<set>/anims/ (nat 1, nat 20 and other-roll animations)
    'extras' => array_filter(array_combine(array_keys($sets), array_map(fn($k) => array_filter([
        'trails' => array_map(fn($f) => "./extras/$k/trails/" . basename($f) . '?v=' . filemtime($f), glob(__DIR__ . "/extras/$k/trails/*.js") ?: []),
        'anims' => array_map(fn($f) => "./extras/$k/anims/" . basename($f) . '?v=' . filemtime($f), glob(__DIR__ . "/extras/$k/anims/*.js") ?: []),
    ]), array_keys($sets)))),
    // nat 1 and nat 20 sounds, a few to a file in natsounds/
    'nat' => array_map(fn($f) => './natsounds/' . basename($f) . '?v=' . filemtime($f), glob(__DIR__ . '/natsounds/*.js') ?: []),
    'sets' => [...array_map(fn($k, $s) => ['key' => $k, 'name' => $s[0], 'look' => $s[1], 'sound' => $s[2], 'v' => $v("sets/$k.js")], array_keys($sets), $sets),
        ...array_map(fn($k, $n) => ['key' => $k, 'name' => $n, 'look' => 'Classic plain dice.', 'sound' => 'Plain knocks as they land.', 'builtin' => true], array_keys($classic), $classic)],
];
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <link rel="preconnect" href="https://cdn.jsdelivr.net">
</head>

<body>
    <?php site_header(); ?>

    <main class="page dd" id="main">
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="page-title">Dice Sets</h1>
        <p class="page-lede">Pick a dice set and a sound, then roll. Your choices are what the Homebrew Sheet rolls with too.</p>

        <div class="bar dd-bar">
            <button type="button" class="btn primary" data-roll="20x1">Roll a d20</button>
            <button type="button" class="btn" data-roll="4x1,6x1,8x1,10x1,12x1,20x1">Roll the set</button>
            <button type="button" class="btn" id="dd-coin">Flip a coin</button>
            <span class="dd-land">
                <label>Land <input type="number" class="field dd-count" id="dd-count" min="1" max="30" value="1" inputmode="numeric" aria-label="How many dice"></label>
                <select class="field" id="dd-die" aria-label="Die">
                    <?php foreach ([4, 6, 8, 10, 12, 20, 100] as $d): ?><option value="<?= $d ?>"<?= $d === 20 ? ' selected' : '' ?>>d<?= $d ?></option><?php endforeach; ?>
                    <option value="coin">Coin</option>
                </select>
                <label>all on <select class="field" id="dd-num" aria-label="Number to land on"></select></label>
                <button type="button" class="btn" id="dd-landgo">Roll it</button>
            </span>
            <label class="check"><input type="checkbox" id="dd-sound" checked> Sound</label>
            <span class="dd-out" id="dd-out" aria-live="polite"></span>
        </div>

        <h2 class="sec-h">Presets <span class="n" id="dd-pcount"></span></h2>
        <form class="dd-pbar" id="dd-pform">
            <label>Name <input class="field" id="dd-pname" maxlength="60" placeholder="Fire night" required></label>
            <button type="submit" class="btn">Save current as preset</button>
            <button type="button" class="btn" id="dd-pexport">Export</button>
            <button type="button" class="btn" id="dd-pimport">Import</button>
            <input type="file" id="dd-pfile" accept=".json,application/json" hidden>
            <span class="dd-out" id="dd-pmsg" aria-live="polite"></span>
        </form>
        <div class="dd-sounds" id="dd-presets"></div>

        <h2 class="sec-h">Dice set <span class="n"><?= count($sets) + count($classic) ?></span></h2>
        <div class="dd-sets" role="group" aria-label="Dice set">
            <?php foreach (array_merge(array_map(fn($s) => $s[0], $sets), $classic) as $k => $name): ?>
                <button type="button" class="dd-set" data-set="<?= h($k) ?>" aria-pressed="false"><img alt="" width="96" height="96"><span><?= h($name) ?></span></button>
            <?php endforeach; ?>
        </div>
        <p class="muted dd-setline" id="dd-setline"></p>

        <h2 class="sec-h">Coin <span class="n">7</span></h2>
        <div class="dd-sets" role="group" aria-label="Coin">
            <?php foreach (['50c' => '50 cent', 'gold-new' => 'Gold', 'gold-old' => 'Old gold', 'silver-new' => 'Silver', 'silver-old' => 'Old silver', 'copper-new' => 'Copper', 'copper-old' => 'Old copper'] as $k => $name): ?>
                <button type="button" class="dd-set dd-coin" data-coin="<?= h($k) ?>" aria-pressed="false"><img alt="" width="96" height="96"><span><?= h($name) ?></span></button>
            <?php endforeach; ?>
        </div>
        <p class="muted dd-setline">What Flip a coin throws, here and on the Homebrew Sheet. The gold, silver and copper coins are
            <a href="https://sketchfab.com/3d-models/fantasy-designed-coins-gold-silver-copper-71a3526b3403419f97717865afb27a41" target="_blank" rel="noopener">Fantasy Designed Coins</a>
            by <a href="https://sketchfab.com/Kigha" target="_blank" rel="noopener">Kigha</a>, licensed under
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> (textures resized).</p>

        <h2 class="sec-h">Coin sound <span class="n" id="dd-csndcount"></span></h2>
        <p class="muted dd-natline">How the coin sounds as it flips, bounces and settles.</p>
        <div class="dd-sounds" id="dd-coinsnd"></div>

        <h2 class="sec-h">Sound <span class="n" id="dd-scount"></span></h2>
        <div class="stabs dd-cats" id="dd-cats" role="group" aria-label="Kind of sound"></div>
        <div class="dd-sounds" id="dd-sounds"><p class="note">Loading sounds...</p></div>

        <div id="dd-extras" hidden>
            <h2 class="sec-h">Trail <span class="n" id="dd-trailcount"></span></h2>
            <p class="muted dd-natline">What each die leaves on the table as it rolls. Pick several to layer them.</p>
            <div class="dd-layers" id="dd-layers" hidden></div>
            <div class="dd-sounds" id="dd-trails"></div>
            <div class="dd-nats">
                <?php foreach ([1 => 'Nat 1 animation', 20 => 'Nat 20 animation', 'mid' => 'Other rolls animation'] as $n => $title): ?>
                    <section>
                        <h2 class="sec-h"><?= $title ?> <span class="n" id="dd-a<?= $n ?>count"></span></h2>
                        <p class="muted dd-natline"><?= ['1' => 'How a d20 that lands on 1 leaves the table.', '20' => 'How a d20 that lands on 20 leaves the table.', 'mid' => 'How every other die leaves the table: a d20 on 2 to 19, and the other dice.'][$n] ?></p>
                        <div class="dd-sounds" id="dd-anim<?= $n ?>"></div>
                    </section>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="dd-nats" id="dd-nats" hidden>
            <?php foreach ([1 => 'Nat 1 sound', 20 => 'Nat 20 sound'] as $n => $title): ?>
                <section>
                    <h2 class="sec-h"><?= $title ?> <span class="n" id="dd-n<?= $n ?>count"></span></h2>
                    <p class="muted dd-natline"><?= $n === 1 ? 'Plays when a d20 lands on 1 and blows up.' : 'Plays when a d20 lands on 20 and flares.' ?>
                        <button type="button" class="btn small" data-try="<?= $n ?>">Try it on a d20</button></p>
                    <div class="dd-sounds" id="dd-nat<?= $n ?>"></div>
                </section>
            <?php endforeach; ?>
        </div>
    </main>

    <?php site_footer(null, false); ?>

    <script type="application/json" id="dd-data"><?= json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
    <script type="module" src="<?= h('dice.js?v=' . $v('dice.js')) ?>"></script>
</body>

</html>
