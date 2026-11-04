<?php
// Shared helpers for the site layout. Every page is listed in site_pages(), which feeds the menu,
// the landing page cards, page titles and breadcrumbs.
// Written for PHP 7.4+ (no PHP 8-only functions).

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

// URL for a file in the site with ?v=<last modified> so it can be cached for a year
function asset($path)
{
    $file = SITE_ROOT . $path;
    return $path . (is_file($file) ? '?v=' . filemtime($file) : '');
}

require_once __DIR__ . '/live.php';

const SITE_NAME = 'Crafty Playz';

// url => [title, description, in the header menu and on the landing page]
function site_pages()
{
    return [
        '/' => ['D&D', 'Our D&D campaign tools', false],
        '/characters/' => ['My Characters', 'Your characters on a sheet you can change to fit any homebrew rules', true],
        '/characters/build/' => ['Character Builder', 'Make a character step by step: class, race, ability scores, background and equipment, at any level', false],
        '/sheets/monster/' => ['Monster Sheet', 'Editable monster stat blocks for an encounter, with HP tracking and clickable dice rolls', true],
        '/campaigns/' => ['Campaigns', 'Make a campaign, invite your players with a link and keep the party together', true],
        '/compendium/' => ['Compendium', 'Search spells, monsters, items, magic items and rules, and add them to a character or an encounter', true],
        // still open by link, just not in the menu or on the landing page
        '/dice/test/' => ['Dice Fairness Test', "Rolls the Homebrew Sheet's 3D dice over and over in four panels to check they are fair", false],
        '/dice/' => ['Dice Sets', 'Ten 3D dice sets with moving parts and 35 sounds to pick from, with a test roll that lands on any number', false],
        '/dice/rolls/' => ['Quick Rolls', 'Four buttons that roll a nat 1, anything from 2 to 19 or a nat 20, or flip a coin, with the dice chosen on Dice Sets', false],
    ];
}

// "/dice/index.php", "/dice" and "/Dice/" all become "/dice/"
function site_norm($path)
{
    $path = strtolower(rawurldecode((string)parse_url($path, PHP_URL_PATH)));
    $path = preg_replace('#/index\.(php|html?)$#', '/', $path);
    $path = preg_replace('#\.(php|html?)$#', '', $path);
    return rtrim($path, '/') . '/';
}

function site_current_path()
{
    $uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
    return (string)parse_url($uri, PHP_URL_PATH);
}

// [title, description, nav] for a listed page, or null
function site_find($path)
{
    $pages = site_pages();
    $want = site_norm($path);
    return isset($pages[$want]) ? $pages[$want] : null;
}

function site_breadcrumbs($path)
{
    if (site_norm($path) === '/') return '';
    $crumbs = ['<a href="/">Home</a>'];
    $found = site_find($path);
    if ($found) {
        $crumbs[] = '<span aria-current="page">' . h($found[0]) . '</span>';
    } else {
        // not in site_pages(): fall back to the folder names; $site_page['crumb'] names the last one (a campaign's name, not its id)
        $parts = array_values(array_filter(explode('/', rawurldecode($path)), 'strlen'));
        $url = '/';
        foreach ($parts as $i => $part) {
            if (preg_match('/^index\.(php|html?)$/', $part)) break;
            $url .= $part . '/';
            $label = $i === count($parts) - 1 && isset($GLOBALS['site_page']['crumb']) ? $GLOBALS['site_page']['crumb'] : ucwords(str_replace(['_', '-'], ' ', preg_replace('/\.(php|html?)$/', '', $part)));
            $crumbs[] = $i < count($parts) - 1 ? '<a href="' . h($url) . '">' . h($label) . '</a>' : '<span aria-current="page">' . h($label) . '</span>';
        }
    }
    return '<nav class="crumbs" aria-label="Breadcrumb">' . implode(' <span class="crumbs-sep">›</span> ', $crumbs) . '</nav>';
}

// The site header: logo, the menu pages from site_pages() and the sign-in button (auth.php)
function site_header()
{
    $current = site_norm(site_current_path());
    echo '<header class="site-header" id="header"><div class="sh-inner">';
    echo '<a class="sh-logo" href="/" aria-label="' . h(SITE_NAME) . ' D&amp;D home"><img src="/assets/img/catsmall.webp" alt="" width="36" height="36"></a>';
    echo '<nav class="sh-nav" aria-label="Main"><ul class="sh-list">';
    foreach (site_pages() as $url => $page) {
        if (!$page[2]) continue;
        $here = strpos($current, $url) === 0;
        echo '<li class="sh-item' . ($here ? ' is-active' : '') . '"><a class="sh-top" href="' . h($url) . '"' . ($here ? ' aria-current="page"' : '') . '>' . h($page[0]) . '</a></li>';
    }
    echo '</ul></nav>' . auth_button() . '</div></header>';
}

// The site footer. $crumbs prints the breadcrumbs here too (pages normally print them under the header).
function site_footer($path = null, $crumbs = true)
{
    if ($path === null) $path = site_current_path();
    echo '<footer class="site-footer">';
    if ($crumbs) echo site_breadcrumbs($path);
    echo '<nav class="sf-links" aria-label="Pages">';
    foreach (site_pages() as $url => $page) if ($page[2]) echo '<a href="' . h($url) . '">' . h($page[0]) . '</a>';
    echo '<a href="/privacy/">Privacy</a>';
    echo '<a href="/credits/">Credits</a>';
    echo '<a href="https://craftyplayz.com/">craftyplayz.com</a>';
    echo '</nav>';
    echo '<p class="sf-meta">© ' . date('Y') . ' CraftyPlayz</p>';
    echo '<p class="sf-meta">This work includes material from the <a href="https://dnd.wizards.com/resources/systems-reference-document">System Reference Document 5.1</a> by Wizards of the Coast LLC, licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</a>.</p>';
    echo '</footer>';
}

// <head> contents for every page
function page_head()
{
    global $site_page;
    $p = is_array($site_page) ? $site_page : [];
    $found = site_find(site_current_path());
    $title = isset($p['title']) ? $p['title'] : ($found ? $found[0] : null);
    $desc = isset($p['description']) ? $p['description'] : ($found ? $found[1] : '');

    echo '<meta charset="UTF-8">' . "\n";
    // cover: full-screen tools that keep clear of the notch and home bar themselves (the sheets)
    echo '<meta name="viewport" content="width=device-width, initial-scale=1.0' . (!empty($p['cover']) ? ', viewport-fit=cover' : '') . '">' . "\n";
    echo '<meta name="color-scheme" content="dark">' . "\n";
    echo '<meta name="theme-color" content="#202020">' . "\n";
    echo '<title>' . h($title ? $title . ' · ' . SITE_NAME : SITE_NAME) . '</title>' . "\n";
    if ($desc !== '') echo '<meta name="description" content="' . h($desc) . '">' . "\n";
    echo '<link rel="icon" href="/favicon.ico">' . "\n";
    echo '<link rel="stylesheet" href="' . h(asset('/assets/css/global.css')) . '">' . "\n";
    if (!empty($p['components'])) echo '<link rel="stylesheet" href="' . h(asset('/assets/css/components.css')) . '">' . "\n";
    foreach (isset($p['css']) ? (array)$p['css'] : [] as $css) echo '<link rel="stylesheet" href="' . h(asset($css)) . '">' . "\n";
    // signed in: settings follow the Google account; it runs before the page's own scripts so it sees their saves
    if (auth_user()) echo '<script src="' . h(asset('/assets/js/sync.js')) . '" defer></script>' . "\n";
    // the live relay's address for assets/js/live.js (pages that share rolls load that script themselves)
    if (auth_user() && live_ws() !== '') echo '<meta name="dnd-live" content="' . h(live_ws()) . '">' . "\n";
    if (!empty($p['ui'])) echo '<script src="' . h(asset('/assets/js/ui.js')) . '" defer></script>' . "\n";
    // the test site (SITE_ENV=test in compose.yml) says so at the top of every page and stays out of search engines
    if (getenv('SITE_ENV') === 'test') {
        echo '<meta name="robots" content="noindex, nofollow">' . "\n";
        echo '<style>body::before { content: "Test site"; display: block; padding: 8px 16px; background: var(--danger-bg); border-bottom: 2px solid var(--danger-line); color: #ff6b6b; font: 700 18px/1.2 var(--font); text-align: center; text-transform: uppercase; }</style>' . "\n";
    }
}

// Card grid of the menu pages in site_pages()
function site_hub()
{
    echo '<div class="hub"><section class="hub-group"><div class="hub-grid">';
    foreach (site_pages() as $url => $page) {
        if (!$page[2]) continue;
        echo '<a class="hub-card" href="' . h($url) . '"><b>' . h($page[0]) . '</b><span>' . h($page[1]) . '</span></a>';
    }
    echo '</div></section></div>';
}
