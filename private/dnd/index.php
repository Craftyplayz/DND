<?php
// Browse the homebrew sheet's server backups (written by games/dnd/sheets/player*/backup.php) and download any version to restore it.
// backups/<ip>/<character name>/<ip>-<version>.json; the folder is gitignored and only exists on the server.
// private/dnd/monsters/ sets $bk (folder, link, wording) and includes this page for the Monster Sheet's backups.
$bk = ($bk ?? []) + ['dir' => __DIR__ . '/backups', 'url' => '/private/dnd/', 'title' => 'D&D Sheet Backups', 'crumb' => 'D&D sheet backups',
    'sheet' => 'homebrew sheet', 'who' => 'Character', 'other' => ['/private/dnd/monsters/', 'Monster sheet backups']];
$site_page = ['components' => true, 'title' => $bk['title']];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';

define('BK', $bk['dir']);
$subdirs = function ($p) {
    return is_dir($p) ? array_values(array_filter(scandir($p), function ($n) use ($p) { return $n[0] !== '.' && is_dir("$p/$n"); })) : [];
};
// version number => file, newest first
$versionsIn = function ($dir) {
    $out = [];
    foreach (glob($dir . '/*-*.json') ?: [] as $f) if (preg_match('/-(\d+)\.json$/', $f, $m)) $out[(int)$m[1]] = $f;
    krsort($out);
    return $out;
};
$load = function ($file) { return $file ? (json_decode((string)@file_get_contents($file), true) ?: []) : null; };
$classText = function ($c) {
    if (isset($c['cr'])) return trim('CR ' . $c['cr'] . ' · ' . ($c['race'] ?? ''), ' ·');
    return implode(' / ', array_filter(array_map(function ($k) { return ($k['name'] ?? '') !== '' ? trim($k['name'] . ' ' . ($k['level'] ?? '')) : 'Level ' . ($k['level'] ?? '?'); }, (array)($c['classes'] ?? []))));
};
$when = function ($t) { return date('j M Y, H:i:s', $t); };
$link = function ($q) use ($bk) { return $bk['url'] . '?' . http_build_query($q); };

// what changed since the previous version, in sheet terms
$labels = ['name' => 'Name', 'classes' => 'Class', 'race' => 'Race', 'alignment' => 'Alignment', 'age' => 'Age', 'art' => 'Art', 'abilities' => 'Ability scores', 'skills' => 'Skills',
    'prof' => 'Proficiency', 'ac' => 'Armour class', 'init' => 'Initiative', 'hp' => 'Hit points', 'insp' => 'Inspiration', 'speeds' => 'Speeds', 'conditions' => 'Conditions',
    'exhaustion' => 'Exhaustion', 'res' => 'Defences', 'imm' => 'Defences', 'vul' => 'Defences', 'passives' => 'Senses', 'senses' => 'Senses', 'profs' => 'Proficiencies', 'condList' => 'Lists', 'lists' => 'Lists'];
$changes = function ($a, $b) use ($labels) {
    if ($b === null) return ['First version'];
    $out = [];
    foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $k) {
        if (in_array($k, ['view', 'id', 'panels'], true) || json_encode($a[$k] ?? null) === json_encode($b[$k] ?? null)) continue;
        $out[] = $labels[$k] ?? $k;
    }
    $old = [];
    foreach ((array)($b['panels'] ?? []) as $p) $old[$p['id'] ?? ''] = $p;
    foreach ((array)($a['panels'] ?? []) as $p) {
        $q = $old[$p['id'] ?? ''] ?? null;
        unset($p['sub'], $p['open']);
        if ($q) unset($q['sub'], $q['open']);
        if (json_encode($p) !== json_encode($q)) $out[] = $p['title'] ?? 'A panel';
    }
    return array_values(array_unique($out)) ?: ['Layout only'];
};

// only folder names that really exist under backups/ are used, so the query string can't reach anything else
$ips = $subdirs(BK);
$ip = in_array($_GET['ip'] ?? '', $ips, true) ? $_GET['ip'] : '';
$chars = $ip !== '' ? $subdirs(BK . "/$ip") : [];
$ch = in_array($_GET['c'] ?? '', $chars, true) ? $_GET['c'] : '';
$versions = $ch !== '' ? $versionsIn(BK . "/$ip/$ch") : [];

if (isset($_GET['dl']) && isset($versions[(int)$_GET['dl']])) {
    $v = (int)$_GET['dl'];
    $name = preg_replace('/[^\w .-]+/u', '', $ch) ?: 'character';
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $name . ' v' . $v . '.json"');
    readfile($versions[$v]);
    exit;
}

// every version of every character (or of one player): [ip, character, version, file, previous file, saved time]
$allVersions = function ($onlyIp) use ($ips, $subdirs, $versionsIn) {
    $out = [];
    foreach ($onlyIp !== '' ? [$onlyIp] : $ips as $i) foreach ($subdirs(BK . "/$i") as $c) {
        $vs = $versionsIn(BK . "/$i/$c");
        $nums = array_keys($vs);
        foreach ($nums as $n => $v) $out[] = ['ip' => $i, 'c' => $c, 'v' => $v, 'file' => $vs[$v], 'prev' => isset($nums[$n + 1]) ? $vs[$nums[$n + 1]] : null, 't' => filemtime($vs[$v])];
    }
    usort($out, function ($a, $b) { return $b['t'] - $a['t'] ?: $b['v'] - $a['v']; });
    return $out;
};
// the same version list as a table: recent changes, search results
$versionTable = function ($rows, $showWho) use ($load, $classText, $when, $changes, $link, $bk) {
    if (!$rows) return '';
    $html = '<div class="table-wrap"><table class="table"><thead><tr>' . ($showWho ? '<th>' . $bk['who'] . '</th><th>Player IP</th>' : '') . '<th class="num">Version</th><th>Saved</th>' . ($showWho ? '' : '<th>' . $bk['who'] . '</th>') . '<th>Changed</th><th></th></tr></thead><tbody>';
    foreach ($rows as $r) {
        $data = $load($r['file']);
        $hp = $data['hp'] ?? [];
        $sub = trim($classText($data) . ' · HP ' . ($hp['cur'] ?? '?') . '/' . ($hp['max'] ?? $hp['base'] ?? '?'), ' ·');
        $preview = $data;
        if (!empty($preview['art'])) $preview['art'] = '(picture, ' . number_format(strlen($preview['art']) / 1024) . ' KB)';
        $who = '<td><a href="' . h($link(['ip' => $r['ip'], 'c' => $r['c']])) . '">' . h($r['c']) . '</a><br><small class="muted">' . h($sub) . '</small></td><td class="mono"><a href="' . h($link(['ip' => $r['ip']])) . '">' . h($r['ip']) . '</a></td>';
        $html .= '<tr>' . ($showWho ? $who : '') . '<td class="num">' . $r['v'] . '</td><td>' . h($when($r['t'])) . '<br><small class="muted">' . number_format(filesize($r['file']) / 1024, 1) . ' KB</small></td>'
            . ($showWho ? '' : '<td>' . h($data['name'] ?? '') . '<br><small class="muted">' . h($sub) . '</small></td>')
            . '<td class="bk-changes">' . h(implode(', ', $changes($data, $load($r['prev'])))) . '</td>'
            . '<td><div class="bk-actions"><a class="btn small" href="' . h($link(['ip' => $r['ip'], 'c' => $r['c'], 'dl' => $r['v']])) . '">Download</a></div>'
            . '<details><summary>Show data</summary><pre class="bk-pre">' . h(json_encode($preview, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) . '</pre></details></td></tr>';
    }
    return $html . '</tbody></table></div>';
};

$q = trim((string)($_GET['q'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <meta name="robots" content="noindex, nofollow">
    <style>
        .bk .bk-changes { color: var(--muted); font-size: 13px; }
        .bk .bk-pre { max-height: 420px; overflow: auto; margin: 8px 0 0; padding: 10px; background: var(--sunken); border-radius: var(--radius); font-family: var(--mono); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .bk details summary { color: var(--link); cursor: pointer; font-size: 13px; }
        .bk .table td { vertical-align: top; }
        .bk .bk-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .bk .bk-search .field { flex: 1 1 240px; }
    </style>
</head>

<body>
    <?php site_header(); ?>

    <main class="page bk" id="main">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/private/">Private</a> <span class="crumbs-sep">›</span> <?php if ($ip === '' && $q === ''): ?><span aria-current="page"><?= h($bk['crumb']) ?></span><?php else: ?><a href="<?= h($bk['url']) ?>"><?= h($bk['crumb']) ?></a> <span class="crumbs-sep">›</span> <span aria-current="page"><?= h($ch !== '' ? $ch : ($ip !== '' ? $ip : 'Search')) ?></span><?php endif; ?></nav>

        <?php if ($ch === ''): ?>
            <h1 class="page-title"><?= h($bk['title']) ?></h1>
            <p class="page-lede">Every edit on the <?= h($bk['sheet']) ?> is kept here as a version. Download one and load it with Import on the sheet to restore it. <a href="<?= h($bk['other'][0]) ?>"><?= h($bk['other'][1]) ?></a></p>
            <form class="bar bk-search" method="get" action="<?= h($bk['url']) ?>" role="search">
                <?php if ($ip !== ''): ?><input type="hidden" name="ip" value="<?= h($ip) ?>"><?php endif; ?>
                <input class="field" type="search" name="q" value="<?= h($q) ?>" placeholder="<?= h($bk['who']) ?>, <?= $bk['who'] === 'Monster' ? 'CR, type' : 'class' ?>, IP or date (28 Oct 2026, 2026-10-28)" aria-label="Search backups">
                <button class="btn small primary" type="submit">Search</button>
                <?php if ($q !== ''): ?><a class="btn small" href="<?= h($ip !== '' ? $link(['ip' => $ip]) : $bk['url']) ?>">Clear</a><?php endif; ?>
            </form>
            <?php
            $all = $allVersions($ip);
            if ($q !== ''):
                // a version matches on character, IP, class, or any common way of writing the day it was saved
                $needle = mb_strtolower($q);
                $hits = array_values(array_filter($all, function ($r) use ($needle, $load, $classText) {
                    $t = $r['t'];
                    $hay = implode(' | ', [$r['c'], $r['ip'], date('j M Y', $t), date('j F Y', $t), date('Y-m-d', $t), date('d/m/Y', $t), date('j/n/Y', $t), date('M Y', $t), date('F Y', $t), date('D j M', $t), date('l', $t)]);
                    if (mb_stripos($hay, $needle) !== false) return true;
                    return mb_stripos($classText($load($r['file'])), $needle) !== false;
                }));
                $shown = array_slice($hits, 0, 200);
            ?>
                <h2 class="sec-h">Matches for “<?= h($q) ?>” <span class="n"><?= count($hits) ?> version<?= count($hits) === 1 ? '' : 's' ?></span></h2>
                <?= $hits ? $versionTable($shown, true) : '<p class="note">No versions match. Try a character name, a class, an IP, or a date like 28 Oct 2026.</p>' ?>
                <?php if (count($hits) > count($shown)): ?><p class="muted">Showing the newest 200. Add more to the search to narrow it down.</p><?php endif; ?>
            <?php elseif (!$all): ?>
                <p class="note">No backups yet. They appear once someone edits a <?= h(strtolower($bk['who'])) ?> on the sheet.</p>
            <?php else:
                // one row per character folder, most recently saved first
                $byChar = [];
                foreach ($all as $r) { $k = $r['ip'] . "\0" . $r['c']; if (!isset($byChar[$k])) $byChar[$k] = $r + ['n' => 0]; $byChar[$k]['n']++; }
            ?>
                <h2 class="sec-h">Recent changes <span class="n">last <?= min(10, count($all)) ?></span></h2>
                <?= $versionTable(array_slice($all, 0, 10), true) ?>
                <h2 class="sec-h"><?= h($bk['who']) ?>s <span class="n"><?= count($byChar) ?></span></h2>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th><?= h($bk['who']) ?></th><th>Player IP</th><th class="num">Versions</th><th>Last saved</th></tr></thead>
                    <tbody>
                        <?php foreach ($byChar as $r): $data = $load($r['file']); ?>
                            <tr>
                                <td><a href="<?= h($link(['ip' => $r['ip'], 'c' => $r['c']])) ?>"><?= h($r['c']) ?></a><?php if ($classText($data)): ?><br><small class="muted"><?= h($classText($data)) ?></small><?php endif; ?></td>
                                <td class="mono"><a href="<?= h($link(['ip' => $r['ip']])) ?>"><?= h($r['ip']) ?></a></td>
                                <td class="num"><?= (int)$r['n'] ?></td>
                                <td><?= h($when($r['t'])) ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table></div>
            <?php endif; ?>

        <?php else: ?>
            <h1 class="page-title"><?= h($ch) ?></h1>
            <p class="page-lede"><?= count($versions) ?> version<?= count($versions) === 1 ? '' : 's' ?> from <span class="mono"><?= h($ip) ?></span>, newest first. Download a version and load it with Import on the sheet to restore it.</p>
            <?php
            $nums = array_keys($versions);
            $rows = [];
            foreach (array_slice($nums, 0, isset($_GET['all']) ? null : 100) as $n => $v) {
                $rows[] = ['ip' => $ip, 'c' => $ch, 'v' => $v, 'file' => $versions[$v], 'prev' => isset($nums[$n + 1]) ? $versions[$nums[$n + 1]] : null, 't' => filemtime($versions[$v])];
            }
            ?>
            <?= $versionTable($rows, false) ?>
            <?php if (count($versions) > count($rows)): ?>
                <p><a class="btn small" href="<?= h($link(['ip' => $ip, 'c' => $ch, 'all' => 1])) ?>">Show all <?= count($versions) ?> versions</a></p>
            <?php endif; ?>
        <?php endif; ?>
    </main>

    <?php site_footer(null, false); ?>
</body>

</html>
