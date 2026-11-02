<?php
// Design guide: how every page on dnd.craftyplayz.com looks and is built, with live samples.
// Copied from craftyplayz.com/design (Website repo, design/index.php) with everything that isn't about this site taken out.
// The samples use the real global.css + components.css, and the swatches are read from global.css, so this page shows
// exactly what a page gets. When the owner changes a design choice, this page is updated in the same change (CLAUDE.md).
$site_page = [
    'title' => 'Design Guide',
    'description' => 'How every page on dnd.craftyplayz.com looks and is built: tokens, components, layout and rules',
    'components' => true,
    'ui' => true,
];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';

// colour tokens straight from the :root block in global.css
$css = (string) @file_get_contents(SITE_ROOT . '/assets/css/global.css');
preg_match('/:root\s*\{(.*?)\}/s', $css, $root);
preg_match_all('/--([\w-]+):\s*(#[0-9a-f]{3,8})\s*;/i', isset($root[1]) ? $root[1] : '', $tokens, PREG_SET_ORDER);
$uses = [
    'bg' => 'Page background', 'card' => 'Cards', 'card2' => 'Rows, tiles and nested cards inside a card',
    'sunken' => 'Drawer, footer, code blocks', 'line' => 'Borders', 'line-strong' => 'Button borders, dashed outlines',
    'text' => 'Body text', 'muted' => 'Secondary text, meta, counts. Nothing darker is ever text',
    'accent' => 'Focus ring, current tab, progress, hover border. Means "act" or "you are here"', 'accent-soft' => 'Selected background (tab on, picked row)',
    'btn' => 'Primary button, start of bar fills', 'btn-line' => 'Primary button border', 'btn-hover' => 'Primary button hover',
    'btn2' => 'Secondary button', 'btn2-hover' => 'Secondary button hover',
    'link' => 'Links in content', 'highlight' => 'Search hits, "new"', 'danger-bg' => 'Error background', 'danger-line' => 'Error border',
    'info-bg' => 'Note background', 'info-line' => 'Note border', 'ok-bg' => 'Success background', 'ok-line' => 'Success border. Green means success or online only',
    'gold-bg' => 'Rare or perfect background', 'gold-line' => 'Rare or perfect: a nat 20, a full set, a legendary item',
    'series-1' => 'Chart series 1', 'series-2' => 'Chart series 2', 'series-3' => 'Chart series 3',
];

// [title, when to use it, markup]. The markup is rendered live and shown as code, so the two always match.
$samples = [
    'buttons' => ['Buttons', 'One <code>.primary</code> per view. Everything else is a plain <code>.btn</code> or a link.', <<<'HTML'
<button class="btn primary">Save</button>
<button class="btn">Cancel</button>
<a class="btn small" href="#components">Small link</a>
<button class="btn" disabled>Working...</button>
HTML],
    'cards' => ['Cards in a grid', 'Text, tables and forms go in a <code>.card</code>. <code>.grid</code> picks its own column count; use <code>.masonry</code> for mixed heights. The count sits in the heading.', <<<'HTML'
<div class="grid">
  <section class="card">
    <h2>Inventory <span class="n">14 items · 62 lb</span></h2>
    <p class="muted">Card content.</p>
  </section>
  <section class="card">
    <h2>Spells</h2>
    <p class="muted">Card content.</p>
  </section>
</div>
HTML],
    'tiles' => ['Tiles', 'Small numbers inside a card.', <<<'HTML'
<div class="tiles">
  <div class="tile"><b>16</b><span>AC</span></div>
  <div class="tile"><b>+3</b><span>initiative</span></div>
  <div class="tile"><b>30 ft</b><span>speed</span></div>
</div>
HTML],
    'badges' => ['Badges', 'Status labels: <code>g</code> green (success, online), <code>r</code> red, <code>p</code> purple, <code>b</code> blue. Tinted, never bright fills.', <<<'HTML'
<div class="badges">
  <span class="badge">Concentration</span>
  <span class="badge g">Online</span>
  <span class="badge r">Poisoned</span>
  <span class="badge p">Homebrew</span>
  <span class="badge b">Flying</span>
</div>
HTML],
    'rows' => ['Row list', 'A list with an optional icon, a name and a value.', <<<'HTML'
<div class="rows">
  <div class="rowi"><span class="grow">Longsword</span><small>×1</small></div>
  <div class="rowi"><span class="grow">Potion of Healing</span><small>×3</small></div>
</div>
HTML],
    'kv' => ['Key / value', 'Detail facts.', <<<'HTML'
<div class="kv">
  <span>Class</span><span>Fighter 5</span>
  <span>Hit dice</span><span>3 / 5</span>
  <span>ID</span><span class="mono">c-1a2b3c</span>
</div>
HTML],
    'table' => ['Table', 'Always inside <code>.table-wrap</code> so only the table scrolls on a phone. Numbers get <code>.num</code> (right-aligned). Add <code>.tall</code> to the wrap for long tables: it caps the height and keeps the header in view.', <<<'HTML'
<div class="table-wrap">
  <table class="table">
    <thead><tr><th>Monster</th><th class="num">CR</th><th class="num">XP</th></tr></thead>
    <tbody>
      <tr><td>Goblin</td><td class="num">1/4</td><td class="num">50</td></tr>
      <tr><td>Bugbear</td><td class="num">1</td><td class="num">200</td></tr>
      <tr><td>Young Green Dragon</td><td class="num">8</td><td class="num">3,900</td></tr>
    </tbody>
  </table>
</div>
HTML],
    'form' => ['Form', 'Each <code>&lt;label&gt;</code> wraps its text and its field. The rules are under Forms below.', <<<'HTML'
<form class="form form-card">
  <label>Character name
    <input class="field" name="name" autocomplete="off" placeholder="Thorin">
  </label>
  <label>Level
    <input class="field" name="level" type="number" inputmode="numeric" min="1" max="20" value="21" aria-invalid="true">
    <small>Enter a number from 1 to 20.</small>
  </label>
  <label>Backstory (optional)
    <textarea class="field" name="notes" rows="3"></textarea>
  </label>
  <fieldset>
    <legend>Hit points on level up</legend>
    <label class="check"><input type="radio" name="hp" checked> Take the average</label>
    <label class="check"><input type="radio" name="hp"> Roll the hit die</label>
  </fieldset>
  <label class="check"><input type="checkbox" name="remember" checked> Remember these settings</label>
  <div class="actions">
    <button class="btn primary">Save character</button>
    <button class="btn" type="reset">Reset</button>
  </div>
</form>
HTML],
    'progress' => ['Progress', 'Bars such as HP or XP to the next level. The fill runs from <code>--btn</code> to <code>--accent</code>. The width is the one inline style that is fine.', <<<'HTML'
<div class="progress"><i style="width:64%"></i></div>
HTML],
    'jump' => ['Jump links', 'Long pages only, and only for sections that exist.', <<<'HTML'
<nav class="jump">
  <a href="#colour">Colour</a>
  <a href="#components">Components</a>
  <a href="#checklist">Checklist</a>
</nav>
HTML],
    'stabs' => ['Pill tabs', 'Switch panels inside a card or a toolbar. The active one gets <code>.on</code>.', <<<'HTML'
<div class="stabs">
  <button class="on">All</button>
  <button>Prepared</button>
  <button>Cantrips</button>
</div>
HTML],
    'bar' => ['Toolbar and field', 'Tool and list pages get one sticky <code>.bar</code> under the title. Content pages don\'t need one.', <<<'HTML'
<div class="bar">
  <input class="field" type="search" placeholder="Search spells..." aria-label="Search spells">
  <button class="btn small">Expand all</button>
  <span class="muted">36 results</span>
</div>
HTML],
    'messages' => ['Messages', 'A plain sentence saying what happened and what to do. Toasts: <code>UI.toast(\'Saved\', \'ok\')</code>; they go away on their own.', <<<'HTML'
<p class="note">Loading monsters...</p>
<p class="err">Couldn't reach dnd5eapi.co. Try again in a minute.</p>
<p class="ok">Saved.</p>
<button class="btn small" data-act="toast">Show a toast</button>
HTML],
    'drawer' => ['Drawer', 'Details for a clicked item. Full width on phones; <code>Esc</code> closes it.', <<<'HTML'
<button class="btn" data-act="drawer">Open the drawer</button>
<aside class="drawer" id="dg-drawer" aria-label="Details" aria-hidden="true" tabindex="-1">
  <button class="close" data-act="drawer-close" aria-label="Close">&times;</button>
  <h2>Fireball</h2>
  <p class="muted">Slides in with transform only, in 180ms.</p>
</aside>
HTML],
    'tree' => ['Raw data tree', 'Raw JSON, last on the page and collapsed. Build children only when a node opens.', <<<'HTML'
<div class="tree">
  <details open>
    <summary><span class="k">hp</span> <span class="ty">object · 2</span></summary>
    <div class="tl"><span class="k">cur</span>: <span class="v number">38</span></div>
    <div class="tl"><span class="k">base</span>: <span class="v number">44</span></div>
  </details>
</div>
HTML],
    'hub' => ['Hub cards', 'The landing page. Made by <code>site_hub()</code> from <code>site_pages()</code>; never write them by hand.', <<<'HTML'
<div class="hub-grid">
  <a class="hub-card" href="/sheets/player/"><b>My Characters</b><span>A character sheet you can change to fit any homebrew rules</span></a>
  <a class="hub-card" href="/sheets/monster/"><b>Monster Sheet</b><span>Editable monster stat blocks for an encounter</span></a>
</div>
HTML],
    'icons' => ['Icons', 'Only where they help people recognise something faster. The rules are under Icons below.', <<<'HTML'
<button class="btn">
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
  Copy link
</button>
<button class="btn small" aria-label="Close" title="Close">&times;</button>
HTML],
];

$skeleton = <<<'PHP'
<?php
$site_page = ['components' => true, 'css' => ['/assets/css/pages/dnd-example.css']];
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
        <h1 class="page-title">Example Tool</h1>
        <p class="page-lede">One line saying what this page does.</p>

        <div class="grid">
            <section class="card"><h2>Section</h2><p>Content.</p></section>
        </div>
    </main>

    <?php site_footer(null, false); ?>
</body>

</html>
PHP;

$pagesEntry = <<<'PHP'
'/sheets/monster/' => ['Monster Sheet', 'Editable monster stat blocks for an encounter, with HP tracking and clickable dice rolls', true],
PHP;
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <meta name="robots" content="noindex">
    <style>
        /* design guide page */
        .dg-stack { display: grid; gap: 16px; }
        .dg-stack .card > :last-child { margin-bottom: 0; }
        .dg h3 { margin: 16px 0 8px; font-size: 15px; }
        .dg ul, .dg ol { margin: 0 0 12px; padding-left: 20px; }
        .dg li { margin: 4px 0; }
        .dg p { margin: 0 0 12px; }
        .dg code { padding: 1px 5px; background: var(--card2); border-radius: 4px; font: 13px var(--mono); }
        .dg .table-wrap { margin-bottom: 12px; }
        .dg-code { margin: 0 0 12px; padding: 10px 12px; overflow-x: auto; background: var(--sunken); border: 1px solid var(--line); border-radius: var(--radius); font: 13px/1.5 var(--mono); }
        .dg-code code { padding: 0; background: none; }
        .dg-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
        .dg-sw { overflow: hidden; background: var(--card2); border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }
        .dg-sw i { display: block; height: 40px; border-bottom: 1px solid var(--line); }
        .dg-sw div { padding: 6px 8px; }
        .dg-sw small { display: block; color: var(--muted); font-size: 12px; line-height: 1.35; }
        .dg-comps { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); gap: 16px; }
        .dg-comp { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .dg-comp h3 { margin: 0; }
        .dg-comp > p { margin: 0; font-size: 14px; }
        .dg-demo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; background: var(--bg); border: 1px dashed var(--line-strong); border-radius: var(--radius); }
        .dg .dg-demo > *, .dg-comp .dg-code { margin: 0; }
        .dg-demo > .grid, .dg-demo > .tiles, .dg-demo > .rows, .dg-demo > .kv, .dg-demo > .progress, .dg-demo > .bar, .dg-demo > .tree, .dg-demo > .hub-grid, .dg-demo > .note, .dg-demo > .err, .dg-demo > .ok, .dg-demo > .form, .dg-demo > .table-wrap { flex: 1 1 100%; }
        .dg-demo > .bar { position: static; padding-top: 0; }
    </style>
</head>

<body>
    <?php site_header(); ?>

    <main class="page dg" id="main">
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="page-title">Design Guide</h1>
        <p class="page-lede">How every page on this site looks and is built. The samples use the site's real CSS, so copy them as they are.</p>

        <nav class="jump">
            <a href="#start">Start here</a><a href="#principles">Principles</a>
            <a href="#build">Build a page</a><a href="#colour">Colour</a><a href="#type">Type and spacing</a>
            <a href="#layout">Layout</a><a href="#components">Components</a><a href="#forms">Forms</a><a href="#icons">Icons</a>
            <a href="#motion">Motion</a><a href="#writing">Writing</a><a href="#content">Content</a>
            <a href="#data">Data and speed</a><a href="#a11y">Accessibility</a><a href="#traps">Traps</a><a href="#checklist">Checklist</a>
        </nav>

        <div class="dg-stack">
            <section class="card" id="start">
                <h2>Start here</h2>
                <ul>
                    <li><b>Read this page top to bottom before building anything.</b> Rules are in priority order: when two clash, the earlier one wins.</li>
                    <li><b>Build with the components below before writing any CSS.</b> Copy their markup from the code blocks.</li>
                    <li><b>Never invent a value.</b> Colours are tokens, sizes and spacing come from the scales here, the font is the system font.</li>
                    <li><b>Change the look, not the behaviour,</b> when restyling an existing page. Keep its features, URLs, query parameters, localStorage keys and saved data.</li>
                    <li><b>The owner decides the design.</b> When the owner overrides a choice on this page, ask whether it should become the new default here (see <code>CLAUDE.md</code>).</li>
                    <li>How features are built, tested and released (dndtest first, live on the owner's say-so) and how player data stays safe is in <code>CLAUDE.md</code>.</li>
                </ul>
                <h3>Reference pages: when in doubt, copy what these do</h3>
                <div class="table-wrap">
                    <table class="table">
                        <tr><th>Kind of page</th><th>Reference</th><th>What to copy</th></tr>
                        <tr><td>Landing page</td><td><a href="/">Home</a></td><td>Title, one line, then <code>site_hub()</code> cards from <code>site_pages()</code></td></tr>
                        <tr><td>Heavy tool</td><td><a href="/sheets/player/">My Characters</a>, <a href="/sheets/monster/">Monster Sheet</a></td><td>Full-screen tool, no site header (owner's choice), drawers and native dialogs, libraries loaded on first use, saves to the browser and the account</td></tr>
                        <tr><td>3D / heavy library</td><td><a href="/dice/">Dice Sets</a></td><td>three.js and cannon-es loaded only when needed, a plain fallback, reduced motion respected</td></tr>
                        <tr><td>List and long text</td><td><a href="/transcripts/">Session Transcripts</a></td><td>A list of sessions, then one long readable page per session</td></tr>
                        <tr><td>Server-fetched API</td><td><code>characters/index.php</code>, <code>sheets/monster/monsters.php</code>, <code>sheets/player/spells.php</code></td><td>Disk cache, stale fallback when a refresh fails, only the fields the page needs</td></tr>
                    </table>
                </div>
            </section>

            <section class="card" id="principles">
                <h2>Principles <span class="n">in priority order</span></h2>
                <ol>
                    <li><b>Never lose player data.</b> A page change may add to what a player saved, never drop or change it (<code>CLAUDE.md</code>).</li>
                    <li><b>Fast.</b> Content is visible and usable in under 1 second on a phone. The first view is HTML from PHP; JS only improves it. Nothing heavy (3D dice, big data files) loads until it's needed.</li>
                    <li><b>Fits every screen.</b> Players use phones and laptops at the table and PCs online. One layout that flows from 320px to 2560px. Grids pick their own column count, sizes use <code>clamp()</code>, and breakpoints exist only where content actually breaks.</li>
                    <li><b>Uncluttered.</b> One job per page. One primary button per view. Empty things are hidden, details live behind a click, raw data comes last.</li>
                    <li><b>Show it, don't list it.</b> When a page has pictures (character art, monster art, dice), lead with them. Headline numbers (HP, AC, initiative) are big and easy to read at a glance. Tables and raw data still exist, further down.</li>
                    <li><b>One dark theme, one blue accent.</b> Every page uses the same tokens. No page invents a colour, a font, or a light mode. (User-pickable themes may come later; they will swap the tokens, not the pages.)</li>
                    <li><b>Quick, calm motion.</b> Things under the pointer answer it; anything else moves only to explain a change. Under 200ms, <code>transform</code> and <code>opacity</code> only. The 3D dice are the one place motion is the point.</li>
                </ol>
                <p class="muted">A page reads: header → breadcrumbs → title → one muted line → cards → footer. The sheets are full-screen tools and skip the site header and footer.</p>
            </section>

            <section class="card" id="build">
                <h2>Build a page</h2>
                <ol>
                    <li><b>Pick the folder.</b> URLs are folders: <code>/&lt;area&gt;/&lt;page&gt;/index.php</code> (like <code>/sheets/monster/</code>, <code>/dice/rolls/</code>). Lowercase, hyphens, links never end in <code>.php</code>.</li>
                    <li><b>Copy the skeleton below</b> to that folder as <code>index.php</code> and set <code>$site_page</code>.</li>
                    <li><b>Add the page to <code>site_pages()</code></b> in <code>includes/functions.php</code>. It is the only source of the header menu, the footer links, breadcrumbs, tab titles and the hub cards on the landing page. Never hard-code a nav link anywhere else.</li>
                    <li><b>Build the content</b> with the components below. Page-only CSS goes in <code>assets/css/pages/&lt;name&gt;.css</code>.</li>
                    <li><b>Run the checklist</b> at the bottom of this page, then the workflow in <code>CLAUDE.md</code>.</li>
                </ol>
                <pre class="dg-code"><code><?= h($skeleton) ?></code></pre>
                <p class="muted">Never write your own <code>&lt;title&gt;</code>, charset, viewport, favicon or link to <code>global.css</code>: <code>page_head()</code> does all of it, with cache-busting URLs, the account sync script when signed in, and the test-site banner.</p>

                <h3><code>$site_page</code> options</h3>
                <div class="table-wrap">
                    <table class="table">
                        <tr><th>Key</th><th>Effect</th></tr>
                        <tr><td><code>'components' => true</code></td><td>Loads <code>components.css</code>. Almost every page wants it.</td></tr>
                        <tr><td><code>'ui' => true</code></td><td>Loads <code>ui.js</code> (<code>window.UI</code>: <code>$</code>, <code>$$</code>, <code>esc</code>, <code>store</code>, <code>debounce</code>, <code>toast</code>, <code>copy</code>, <code>ago</code>, <code>num</code>). It's deferred, so use it inside <code>DOMContentLoaded</code>.</td></tr>
                        <tr><td><code>'css' => [...]</code></td><td>Page stylesheets, versioned automatically.</td></tr>
                        <tr><td><code>'title'</code>, <code>'description'</code></td><td>Only for pages that aren't in <code>site_pages()</code>. Otherwise both come from there.</td></tr>
                    </table>
                </div>
                <p class="muted">Full-screen tools (the sheets) skip the header and footer. Pages that have no site header never get one added without the owner agreeing.</p>

                <h3>A <code>site_pages()</code> entry</h3>
                <pre class="dg-code"><code><?= h($pagesEntry) ?></code></pre>
                <div class="table-wrap">
                    <table class="table">
                        <tr><th>Part</th><th>Meaning</th></tr>
                        <tr><td>Key</td><td>Folder URL with a trailing <code>/</code>.</td></tr>
                        <tr><td>Title</td><td>Menu text, tab title, breadcrumb, hub card. Short, Title Case.</td></tr>
                        <tr><td>Description</td><td>One short sentence, no full stop. Becomes the meta description and the hub card text.</td></tr>
                        <tr><td><code>true</code> / <code>false</code></td><td>In the header menu or not. A page with <code>false</code> still works by link and keeps its tab title and breadcrumbs.</td></tr>
                    </table>
                </div>
                <p class="muted">Moving a page: add a <code>RedirectMatch 301</code> for the old URL in <code>.htaccess</code>. Retiring one: take it out of <code>site_pages()</code>, <code>git mv</code> its files into <code>private/archive/</code> keeping the path (never delete), and redirect the old URL.</p>
            </section>

            <section class="card" id="colour">
                <h2>Colour <span class="n">dark only · live from global.css</span></h2>
                <div class="dg-swatches">
                    <?php foreach ($tokens as $t): ?>
                        <div class="dg-sw"><i style="background:var(--<?= h($t[1]) ?>)"></i>
                            <div><b class="mono">--<?= h($t[1]) ?></b> <span class="muted mono"><?= h($t[2]) ?></span><?php if (isset($uses[$t[1]])): ?><small><?= h($uses[$t[1]]) ?></small><?php endif; ?></div>
                        </div>
                    <?php endforeach; ?>
                </div>
                <ul>
                    <li><b>Pages use <code>var(--…)</code> only, never a hex value.</b> The exceptions are colours with real meaning (a dice set's own colours, damage-type colours, syntax highlighting) and black or white overlays on art: <code>rgb(0 0 0 / x)</code> scrims, <code>rgb(255 255 255 / x)</code> tracks.</li>
                    <li><b>Three surface levels:</b> <code>--bg</code> → <code>--card</code> → <code>--card2</code>. Text cards get depth from these steps, never from shadows. Shadows are for floating things (drawer, menus, dialogs, tooltips, the dice tray) and art.</li>
                    <li><b>Blue means act or "you are here".</b> Focus ring, current tab, progress, hover border, the primary button. Never decoration.</li>
                    <li><b>Status colours are tinted backgrounds with a matching border:</b> green for success and online (<code>.ok</code>, <code>.badge.g</code>), red for errors and harmful conditions, <code>--info-*</code> for notes, gold for rare or perfect (a nat 20, a legendary item).</li>
                    <li><b>Gradients only where they do a job:</b> scrims over art, bar fills (<code>--btn</code> → <code>--accent</code>). No borders inside borders.</li>
                    <li><code>color-scheme: dark</code> is already set, so scrollbars and form controls are dark.</li>
                </ul>
            </section>

            <section class="card" id="type">
                <h2>Type and spacing</h2>
                <p><b>Font:</b> <code>var(--font)</code>, the system font. <b>Code and IDs:</b> <code>var(--mono)</code>. No web fonts, no icon fonts. Icons are covered under <a href="#icons">Icons</a>.</p>
                <div class="grid">
                    <div class="table-wrap">
                        <table class="table">
                            <tr><th>Text</th><th>Size</th></tr>
                            <tr><td>Page title <code>h1.page-title</code></td><td><code>clamp(24px, 4vw, 34px)</code>, bold. On art add <code>text-shadow: 0 2px 12px rgb(0 0 0 / .6)</code></td></tr>
                            <tr><td>Headline number (HP, AC)</td><td><code>clamp(22px, 3vw, 28px)</code>, 700</td></tr>
                            <tr><td>Section heading outside cards <code>.sec-h</code></td><td>20px, bold; its count 14px <code>--muted</code></td></tr>
                            <tr><td>Card heading <code>.card h2</code></td><td>17px, 600, icon 22px</td></tr>
                            <tr><td>Sub-heading <code>h3</code></td><td>15px</td></tr>
                            <tr><td>Body</td><td>browser default (16px), line-height 1.5</td></tr>
                            <tr><td>Controls, rows, buttons, tile names</td><td>14px, names 600</td></tr>
                            <tr><td>Meta, breadcrumbs, counts, small buttons, labels</td><td>13px, <code>--muted</code></td></tr>
                            <tr><td>Badges, tile labels</td><td>12px</td></tr>
                            <tr><td>Code, IDs, raw data</td><td><code>var(--mono)</code> 12–13px</td></tr>
                        </table>
                    </div>
                    <div class="table-wrap">
                        <table class="table">
                            <tr><th>Thing</th><th>Value</th></tr>
                            <tr><td>Spacing scale</td><td>4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 28px, nothing else</td></tr>
                            <tr><td>Card padding</td><td>16px</td></tr>
                            <tr><td>Gap between cards</td><td>16px · tiles 10px</td></tr>
                            <tr><td>Gap inside lists</td><td>6px rows · 8px tiles</td></tr>
                            <tr><td>Above a section heading</td><td>28px (12px below)</td></tr>
                            <tr><td>Radius</td><td>4px small art and avatars · 8px controls · 12px cards · 999px pills</td></tr>
                            <tr><td>Content width</td><td>max 1280px, 16px side padding (<code>.page</code>)</td></tr>
                        </table>
                    </div>
                </div>
                <p>Never set <code>font-family</code> or a body font size in a page stylesheet, and don't invent sizes like 15.5px or 18px.</p>
                <p><b>Numbers and dates:</b> <code>UI.num(n)</code> for numbers, <code>UI.ago(ms)</code> for "3 days ago" with the exact date in <code>title=""</code>, IDs in <code>.mono</code>.</p>
            </section>

            <section class="card" id="layout">
                <h2>Layout that fits every screen <span class="n">test at 320 · 390 · 768 · 1366 · 2560</span></h2>
                <div class="grid">
                    <div>
                        <div class="badges"><span class="badge g">Do</span></div>
                        <ul>
                            <li>Build mobile-first at 320px, then let it grow.</li>
                            <li>Grids that choose their own columns, with <code>min(100%, …)</code> so one column never overflows: <code>repeat(auto-fill, minmax(min(100%, 340px), 1fr))</code>. Use <code>auto-fit</code> when a few items should stretch to fill the row.</li>
                            <li><code>aspect-ratio</code> on every art card so the grid never jumps.</li>
                            <li><code>flex-wrap: wrap</code> on every toolbar and button row.</li>
                            <li><code>clamp()</code> for headings and repeated UI sizes.</li>
                            <li><code>min-width: 0</code> on grid and flex children that hold text, plus ellipsis on long names.</li>
                            <li>Panels sized <code>width: min(460px, 100vw)</code>, so they're full-screen on phones.</li>
                            <li>Images get <code>width</code>/<code>height</code> attributes and <code>height: auto</code>, so nothing jumps while loading.</li>
                            <li>Wide data (tables, code): wrap only that block in <code>overflow-x: auto</code>.</li>
                            <li>Tap targets at least 40px tall on touch.</li>
                        </ul>
                    </div>
                    <div>
                        <div class="badges"><span class="badge r">Don't</span></div>
                        <ul>
                            <li>Scroll the page sideways at any width.</li>
                            <li>Put fixed pixel widths on containers.</li>
                            <li>Make separate mobile and desktop markup, or sniff the user agent.</li>
                            <li>Hide anything essential behind hover. Hover may add detail, never the only copy of it.</li>
                            <li>Use <code>body { overflow: hidden }</code> or <code>100vh</code> on content pages (full-screen tools like the sheets and dice are the exception).</li>
                            <li>Add a breakpoint "just in case". Most pages need none.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section class="card" id="components">
                <h2>Components <span class="n">components.css, loaded with 'components' => true</span></h2>
                <p class="muted">If a page needs something that isn't here and other pages could use it too, ask for it to be added to <code>components.css</code>, and keep a local copy in the page stylesheet until then. Helpers: <code>.muted</code>, <code>.mono</code>, <code>.hide</code>.</p>
                <div class="dg-comps">
                    <?php foreach ($samples as $id => $s): ?>
                        <section class="dg-comp" id="c-<?= h($id) ?>">
                            <h3><?= h($s[0]) ?></h3>
                            <p class="muted"><?= $s[1] ?></p>
                            <div class="dg-demo"><?= $s[2] ?></div>
                            <pre class="dg-code"><code><?= h($s[2]) ?></code></pre>
                        </section>
                    <?php endforeach; ?>
                </div>
                <h3 id="forms">Forms</h3>
                <ul>
                    <li><b>Every field sits inside its <code>&lt;label&gt;</code></b>, label text first, so clicking the text focuses the field and no <code>id</code> is needed. Never use a placeholder instead of a label; a placeholder is only an example value.</li>
                    <li><b>One field per row by default.</b> Forms sit in <code>.form-card</code> (max 560px wide) so fields don't stretch across the screen.</li>
                    <li><b>Mark the optional fields</b> with "(optional)" in the label. Never mark required ones with an asterisk.</li>
                    <li><b>Use the right input:</b> <code>type="number"</code> with <code>inputmode</code>, <code>min</code> and <code>max</code> for numbers, <code>&lt;select&gt;</code> for more than 4 fixed choices, radios in a <code>&lt;fieldset&gt;</code> for 2 to 4, a <code>.check</code> checkbox for yes/no.</li>
                    <li><b>Errors:</b> set <code>aria-invalid="true"</code> on the field (red border) and put what to fix in the label's <code>&lt;small&gt;</code> ("Enter a number from 1 to 20."). Check a field when it loses focus or the form is sent, not on every key press. A failed send shows one <code>.err</code> above the buttons.</li>
                    <li><b>Things that calculate update as you type</b> (debounced) and need no button. A button is for actions that send, save or take a while; it is the view's one <code>.primary</code>, says what it does ("Save character", not "Submit"), and is disabled with "Saving..." while it works.</li>
                    <li><b>Buttons go last</b>, in an <code>.actions</code> row, primary first.</li>
                </ul>
                <h3 id="icons">Icons</h3>
                <ul>
                    <li><b>Use an icon only when it helps people recognise something faster:</b> links to outside services, dice, conditions, and the few controls everyone knows (close, search, copy, menu). Never decorate headings or buttons that already have clear text.</li>
                    <li><b>UI icons are inline SVG</b> in <code>currentColor</code>, so they follow the text colour. When the same icon is needed on several pages, add a shared PHP helper in <code>includes/functions.php</code> instead of pasting the SVG into each page.</li>
                    <li><b>Sizes:</b> 16px beside text and in buttons, 22px in card headings, 24px in row lists. Character and monster art is not an icon.</li>
                    <li><b>An icon-only button</b> needs <code>aria-label</code> and <code>title</code>. A decorative icon gets <code>alt=""</code> or <code>aria-hidden="true"</code>.</li>
                    <li>No icon fonts, no Font Awesome, and no emoji as icons or in titles, headings, menus or buttons.</li>
                </ul>
                <h3>Page stylesheets</h3>
                <ul>
                    <li>Named <code>assets/css/pages/&lt;name&gt;.css</code>, starting with a one-line comment naming the page.</li>
                    <li>Every class gets a short page prefix (like the sheets' <code>.hb</code>) so nothing leaks. Page-only tokens get it too.</li>
                    <li>Tokens only, no <code>transition: all</code>, no <code>!important</code> except for the <code>[hidden]</code> fix.</li>
                    <li>Under about 40 lines may sit in a <code>&lt;style&gt;</code> in <code>&lt;head&gt;</code>; anything bigger goes in a file so it caches.</li>
                </ul>
            </section>

            <section class="card" id="motion">
                <h2>Motion <span class="n">quick, small, transform and opacity only</span></h2>
                <div class="table-wrap">
                    <table class="table">
                        <tr><th>Use</th><th>Duration</th><th>Property</th></tr>
                        <tr><td>Hover / focus colour</td><td><code>var(--fast)</code> 120ms</td><td>background, border-color, color</td></tr>
                        <tr><td>Card lift on hover (hub cards, tiles)</td><td><code>var(--fast)</code></td><td><code>translateY(-2px)</code>, accent border</td></tr>
                        <tr><td>Art lift on hover (portraits)</td><td><code>var(--base)</code> ease-out</td><td><code>translateY(-3px)</code>, <code>var(--lift)</code> plus a 2px accent ring</td></tr>
                        <tr><td>Press</td><td>60ms</td><td><code>translateY(1px)</code></td></tr>
                        <tr><td>Caret flip</td><td>120ms</td><td>rotate</td></tr>
                        <tr><td>Drawer / panel</td><td><code>var(--base)</code> 180ms ease-out</td><td>transform</td></tr>
                        <tr><td>Menu / dropdown</td><td>120–150ms ease-out</td><td>opacity + 4px translate</td></tr>
                        <tr><td>Scroll to a section</td><td>browser default</td><td><code>scrollIntoView({ behavior: 'smooth' })</code></td></tr>
                    </table>
                </div>
                <p><b>Never:</b> entrance or scroll-reveal animations, staggered cards, animating width/height/top/margin, <code>transition: all</code>, anything over 200ms, colour flashes on hover. The exception is the 3D dice and their nat 1/20 effects, which only play when someone rolls. <code>global.css</code> turns motion off for <code>prefers-reduced-motion</code>; loops and animations you start in JS (dice included) must check it too, and stop when offscreen or the tab is hidden.</p>
            </section>

            <section class="card" id="writing">
                <h2>Writing <span class="n">British English, plain words</span></h2>
                <ul>
                    <li><b>British spelling:</b> colour, centre, organise, favourite, grey, armour, metres.</li>
                    <li><b>Plain words and short sentences.</b> Say what something is or does. No hype, no jokes and no exclamation marks in interface text (titles, ledes, labels, buttons, messages). Game content (character notes, handouts, monster lore) can say whatever it likes; the interface around it stays plain.</li>
                    <li><b>Capitals:</b> page titles and menu items use Title Case (they come from <code>site_pages()</code>). Everything else uses sentence case: card headings, buttons, labels, tabs.</li>
                    <li><b>Buttons start with a verb</b> and say what happens: "Copy link", "Roll initiative". Never "OK", "Submit" or "Click here". Link text says where it goes.</li>
                    <li><b>Full stops:</b> none on titles, headings, labels, buttons or <code>site_pages()</code> descriptions. Ledes, help text and messages are sentences and get one.</li>
                    <li><b>Numbers and dates:</b> digits with thousands commas (3,900 XP), a space before units (30 ft, 5 min, 62 lb), dates as day month year (20 Oct 2026).</li>
                    <li><b>Talk to the reader as "you".</b> Contractions are fine (can't, don't). Messages say what happened and what to do, without blame or error codes.</li>
                </ul>
            </section>

            <section class="card" id="content">
                <h2>Content and clutter</h2>
                <ul>
                    <li><b>One job per page.</b> One <code>.btn.primary</code> per view; everything else is a secondary button or a link.</li>
                    <li><b>One line under the title,</b> not a paragraph. Help text is one muted line where it's needed.</li>
                    <li><b>Text in cards, art on the page.</b> Text, tables and forms sit in <code>.card</code>s. Grids of portraits or tiles sit straight on the page under a section heading; never put a card around a grid of cards.</li>
                    <li><b>Overview first,</b> details on click (drawer, <code>&lt;details&gt;</code>, "Show all", a link to the item's own page), raw data last and collapsed.</li>
                    <li><b>Hide what's empty.</b> No empty cards, no "0 results" headings, no "coming soon" sections. One compact prompt at most.</li>
                    <li><b>Every state has a sentence:</b> loading says what's loading, errors say what failed and what to do. Never a spinner forever or a raw error object.</li>
                    <li><b>Nothing plays or flashes on load.</b> No autoplay, no popups. Dice sounds play only on a roll.</li>
                    <li><b>Muted text instead of extra headings or boxes.</b></li>
                    <li><b>Credit data sources</b> in the lede or a muted line at the bottom ("SRD 5.1 data from dnd5eapi.co, cached for 30 days"). Rules content is SRD 5.1 / Creative Commons only, credited as its licence asks.</li>
                </ul>
            </section>

            <section class="card" id="data">
                <h2>Data, speed and safety</h2>
                <div class="table-wrap">
                    <table class="table">
                        <tr><th>Budget</th><th>Target</th></tr>
                        <tr><td>Content visible on 4G</td><td>under 1s</td></tr>
                        <tr><td>HTML + CSS + JS over the network (gzip), not counting art or 3D dice</td><td>under 60 KB for content pages, under 150 KB for tools</td></tr>
                        <tr><td>Render-blocking third-party requests</td><td>0</td></tr>
                        <tr><td>Layout shift after load</td><td>none</td></tr>
                        <tr><td>Interaction response</td><td>under 100ms</td></tr>
                    </table>
                </div>
                <ul>
                    <li><b>Plain HTML, CSS and JS.</b> No framework, no build step, no jQuery. A library only for one job, loaded on first use (like three.js for the dice), and the page still works if it fails.</li>
                    <li><b>Scripts are deferred</b> or at the end of <code>&lt;body&gt;</code>. Event delegation on <code>data-act</code> / <code>data-id</code>, no inline <code>onclick</code>.</li>
                    <li><b>External APIs</b> (D&amp;D Beyond, dnd5eapi.co, Open5e) are fetched in PHP with a disk cache and a stale fallback (copy <code>dnd_get()</code> in <code>characters/index.php</code>). Pass PHP data to JS with <code>json_encode</code>, not a second fetch.</li>
                    <li><b>Big lists</b> render in chunks of about 250 with "Show more"; hidden content is built when it opens; filters debounce about 80ms and filter in memory.</li>
                    <li><b>Art:</b> WebP for our own images, <code>loading="lazy" decoding="async"</code> past the first screen.</li>
                    <li><b>Escape everything</b> from an API or user: <code>h()</code> in PHP, <code>UI.esc()</code> in JS. Keys stay server-side. User files are read in the browser and only uploaded on an explicit action.</li>
                    <li><b>Saved data follows the Google account</b> and is never lost in an update: see <code>CLAUDE.md</code> before adding anything that stores data.</li>
                    <li><b>Private data</b> (IPs, emails, DM-only information) never goes in a share link or a player's view.</li>
                </ul>
            </section>

            <section class="card" id="a11y">
                <h2>Accessibility and keyboard</h2>
                <ul>
                    <li>One <code>&lt;h1&gt;</code>, headings in order. <code>&lt;button&gt;</code> for actions, <code>&lt;a&gt;</code> for navigation, never a clickable <code>&lt;div&gt;</code>.</li>
                    <li>Every input has a <code>&lt;label&gt;</code> or <code>aria-label</code>; every image has <code>alt</code> (<code>alt=""</code> if decorative, which art behind text always is).</li>
                    <li>The blue <code>:focus-visible</code> ring is global. Never remove an outline without a replacement.</li>
                    <li>Bars and charts carry their numbers in words: <code>role="img"</code> with an <code>aria-label</code> ("38 of 44 hit points"), or a <code>role="progressbar"</code> with values.</li>
                    <li><code>aria-current="page"</code> on the current tab, <code>aria-pressed</code> on toggles that stay on, <code>aria-expanded</code> on toggles that open things, <code>aria-hidden</code> and focus on drawers, native <code>&lt;dialog&gt;</code> for modals.</li>
                    <li><code>Esc</code> closes the innermost open thing. Enter activates.</li>
                    <li>Every action answers within 100ms: disable the button and change its text while working, "Copied!" for 1s.</li>
                    <li>External links: <code>target="_blank" rel="noopener"</code>.</li>
                </ul>
            </section>

            <section class="card" id="traps">
                <h2>Traps</h2>
                <ul>
                    <li><b>Card links turn blue.</b> <code>.page a</code> colours every link. A whole card that is an <code>&lt;a&gt;</code> needs <code>color: var(--text); text-decoration: none</code>. <code>components.css</code> already does this for <code>.hub-card</code>; your own card links need it too.</li>
                    <li><b><code>hidden</code> loses to your <code>display</code>.</b> An element with <code>display: flex</code> or <code>grid</code> in your CSS stays visible when a script sets <code>hidden</code>. Add <code>.yourtag [hidden] { display: none !important; }</code>.</li>
                    <li><b>Text on art needs a scrim.</b> Never rely on the picture being dark: put a black gradient between art and text, and a text shadow on big titles.</li>
                    <li><b>Art goes missing.</b> Hide a broken image so the card's name shows (initials for a portrait). Never a broken-image icon.</li>
                    <li><b><code>url()</code> inside a custom property</b> resolves against the stylesheet that uses <code>var()</code>, not the page. Build absolute URLs in JS.</li>
                    <li><b>A bare <code>button</code> in your markup</b> needs its own reset (<code>.yourtag :where(button:not(.btn))</code>); <code>global.css</code> doesn't style bare elements, but browsers do.</li>
                    <li><b>A field missing from <code>blank()</code> is thrown away</b> on the next load of a sheet. Add new character fields to <code>blank()</code> in both sheets (<code>CLAUDE.md</code>).</li>
                </ul>
            </section>

            <section class="card" id="checklist">
                <h2>Checklist <span class="n">every page, before it ships</span></h2>
                <h3>Structure</h3>
                <ul>
                    <li>Built from the skeleton above; no hand-written <code>&lt;title&gt;</code>, meta or global CSS links</li>
                    <li>In <code>site_pages()</code> with url (trailing <code>/</code>), title, description and the right menu flag</li>
                    <li>Shows in the menu if it should, with the right breadcrumbs and tab title</li>
                    <li>Old URL redirected in <code>.htaccess</code> if it moved; retired files moved to <code>private/archive/</code>, never deleted</li>
                </ul>
                <h3>Look</h3>
                <ul>
                    <li><code>&lt;main class="page yourtag"&gt;</code> and one <code>h1.page-title</code> with a one-line <code>.page-lede</code></li>
                    <li>Only components and a prefixed page stylesheet; only <code>var(--…)</code> colours apart from overlays on art and colours with real meaning</li>
                    <li>Sizes and spacing from the scales; radius 4 / 8 / 12 / 999</li>
                    <li>One primary button; no empty sections; details behind a click</li>
                    <li>Tables in <code>.table-wrap</code>; every form field inside its label; icons only where they help</li>
                    <li>British spelling, plain words, sentence-case buttons and headings</li>
                </ul>
                <h3>Screens</h3>
                <ul>
                    <li>No sideways scroll at 320 / 390 / 768 / 1366 / 2560</li>
                    <li>Grids auto-fill; art has an <code>aspect-ratio</code>; long names ellipsis; images have dimensions</li>
                </ul>
                <h3>Speed</h3>
                <ul>
                    <li>Scripts deferred or at the end of body; libraries loaded on use</li>
                    <li>External API calls cached server-side with a stale fallback</li>
                    <li>Big lists chunked; art past the first screen lazy</li>
                </ul>
                <h3>Behaviour and data</h3>
                <ul>
                    <li>Loading, empty and error states all render sensibly; missing art falls back</li>
                    <li><code>Esc</code> closes, the keyboard reaches everything</li>
                    <li>All API and user text escaped; no keys in HTML; no <code>console.log</code></li>
                    <li>Motion 200ms or less, transform and opacity only, off for reduced motion (dice included)</li>
                    <li>Card links in text colour; <code>[hidden]</code> works with your <code>display</code></li>
                    <li>Anything saved in the browser also saves to the account; the player-data check passes if a sheet changed</li>
                </ul>
            </section>
        </div>
    </main>

    <?php site_footer(null, false); ?>

    <script>
        // live samples: drawer, pill tabs, toast
        document.addEventListener('DOMContentLoaded', () => {
            const drawer = document.getElementById('dg-drawer');
            const setDrawer = (open) => {
                drawer.classList.toggle('open', open);
                drawer.setAttribute('aria-hidden', String(!open));
                if (open) drawer.focus();
            };
            document.addEventListener('click', (e) => {
                const tab = e.target.closest('.stabs button');
                if (tab) tab.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === tab));
                const act = e.target.closest('[data-act]');
                if (!act) return;
                const a = act.dataset.act;
                if (a === 'drawer') setDrawer(true);
                else if (a === 'drawer-close') setDrawer(false);
                else if (a === 'toast') UI.toast('Saved. Toasts go away on their own.', 'ok');
            });
            document.addEventListener('submit', (e) => {
                if (!e.target.closest('.dg-demo')) return;
                e.preventDefault();
                UI.toast('Saved. This sample form doesn\'t send anything.', 'ok');
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false);
            });
        });
    </script>
</body>

</html>
