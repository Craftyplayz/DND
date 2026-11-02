<?php
// Quick Rolls: four buttons that throw the Crafty Fire Dice preset (built here as a choice.js choice) to land on a nat 1, anything from 2 to 19 or a nat 20, or flip the coin,
// for watching the exit animations without the rest of the Dice Sets page.
$site_page = ['components' => true];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
$v = fn($f) => filemtime(__DIR__ . '/' . $f);
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <link rel="preconnect" href="https://cdn.jsdelivr.net">
    <style>
        /* the dice table floats over the whole page, as on Dice Sets */
        #hb-throw { position: fixed; inset: 0; z-index: 1740; width: 100vw; height: 100vh; pointer-events: none; }
    </style>
</head>

<body>
    <?php site_header(); ?>

    <main class="page" id="main">
        <div class="bar" id="qr-bar">
            <button type="button" class="btn" data-land="1">Nat 1</button>
            <button type="button" class="btn" data-land="mid">2-19</button>
            <button type="button" class="btn" data-land="20">Nat 20</button>
            <button type="button" class="btn" data-coin>Flip a coin</button>
            <span class="muted" id="qr-out" aria-live="polite"></span>
        </div>
    </main>

    <?php site_footer(null, false); ?>

    <script type="module">
        // the same engine and choice code the Dice Sets page and the Homebrew Sheet use, always with the Crafty Fire Dice preset, plus the gold coin and Pirate Doubloon sound (paths from dice/)
        const at = (key, url) => ({ key, url });
        const PRESET = { set: at('ember', './sets/ember.js'), sound: at('tungsten3', './sounds.js'),
            nat: { 1: at('a09-doom-bell', './natsounds/09.js'), 20: at('a02-bar-chime-bloom', './natsounds/02.js') },
            trails: [at('t06-glyph-prints', './extras/ember/trails/06.js'), at('t05-ash-fall', './extras/ember/trails/05.js'), at('t02-spark-spray', './extras/ember/trails/02.js'),
                at('t05-smoke-plume', './extras/ember/trails/05.js'), at('t01-scorch-brands', './extras/ember/trails/01.js')],
            anims: { 1: at('a21-shatter', './extras/ember/anims/21.js'), 20: at('a14-exploded-view', './extras/ember/anims/14.js'), mid: at('a34-ash-wind', './extras/ember/anims/34.js') },
            coin: 'gold-new', coinSound: at('c05-doubloon', './coinsounds/05.js') };
        const engine = import('../dice3d.js?v=<?= $v('../dice3d.js') ?>'), choice = import('../choice.js?v=<?= $v('../choice.js') ?>');
        const out = document.getElementById('qr-out');
        document.getElementById('qr-bar').addEventListener('click', async (e) => {
            const b = e.target.closest('button'); if (!b) return;
            out.textContent = 'Rolling...';
            try {
                const [m, c] = await Promise.all([engine, choice]);
                const style = await c.styleFrom(PRESET, m);
                // a new roll takes the last one's dice off the table first, even mid-animation
                m.clearTable(true);
                const res = 'coin' in b.dataset ? await m.throwDice([['coin', 1]], { style }) : await m.throwDice([[20, 1]], { style, land: [[b.dataset.land === 'mid' ? 2 + Math.floor(Math.random() * 18) : +b.dataset.land]] });
                const v = res[0][1][0];
                out.textContent = v === 'heads' ? 'Heads' : v === 'tails' ? 'Tails' : 'd20 ' + v;
            } catch (err) { out.textContent = "Couldn't roll. Try again."; }
        });
    </script>
</body>

</html>
