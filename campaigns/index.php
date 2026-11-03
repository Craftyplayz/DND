<?php
// Campaigns. /campaigns/ lists the campaigns you DM and play in and makes new ones; /campaigns/<id> is one campaign:
// the party's characters, the players, your characters in it, for the DM and co-DMs the join link and party sheets, and
// for the DM alone a new link, rename, remove, delete and making players co-DMs (or players again).
// Changes go through campaigns/api.php (campaigns.js). With the live relay (includes/live.php) the party, the players and
// who's online update by themselves; #cp-head, #cp-sess and #cp-players are what campaigns.js swaps in from a fresh copy of
// the page. The table log (ROADMAP 1.3) fills #cp-log live (assets/js/live.js); ?c=<id>&s=<n> shows a past session's rolls.
// Only members see a campaign; anyone else gets "not found".
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/tablelog.php';
require_once SITE_ROOT . '/includes/live.php';
require_once SITE_ROOT . '/includes/handouts.php';
// DND_ACCOUNTS: a stand-in folder for _dev/scripts/campaigns-page.mjs, so the check never touches real accounts
$accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
$user = auth_user();
// old links: /campaigns/?c=<id> -> /campaigns/<id> (a past session's ?c=<id>&s=<n> stays as it is)
if (isset($_GET['c']) && !isset($_GET['s']) && preg_match('/^[A-Za-z0-9_-]+$/', (string)$_GET['c']) && preg_match('#^/campaigns/(index\.php)?$#', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
    header('Location: /campaigns/' . $_GET['c'], true, 301);
    exit;
}
$c = $user && isset($_GET['c']) ? cp_get($accounts, $_GET['c']) : null;
if ($c && cp_member($c, $user['sub']) < 0) $c = null;
$isDm = $c && cp_is_dm($c, $user['sub']); // the DM or a co-DM
$isOwner = $c && cp_is_owner($c, $user['sub']); // the DM alone: invite links, rename, delete, remove, co-DMs

// "Dee is the DM · Pat is a co-DM · 2 players", under a campaign's title and on its tile (co-DMs aren't counted as players)
function cp_people($c)
{
    $co = array_column(array_filter($c['members'], fn($m) => !cp_is_owner($c, $m['sub']) && cp_is_dm($c, $m['sub'])), 'name');
    $players = count($c['members']) - 1 - count($co);
    $last = array_pop($co);
    return ($c['members'][0]['name'] ?? 'DM') . ' is the DM'
        . ($last === null ? '' : ' · ' . ($co ? implode(', ', $co) . " and $last are co-DMs" : "$last is a co-DM"))
        . ' · ' . ($players === 1 ? '1 player' : "$players players");
}

// a character's card (cp_card() in includes/campaigns.php) as HTML
function cp_card_html($card, $who, $href)
{
    $art = $card['art'] !== '' ? '<img src="' . h($card['art']) . '" alt="" referrerpolicy="no-referrer" width="64" height="64" loading="lazy">' : '<span class="ch-noart" aria-hidden="true"></span>';
    $top = '<span class="ch-who"><b>' . h($card['name']) . '</b><small>' . h($card['line']) . '</small></span>';
    return '<article class="ch-card">' . ($href ? '<a class="ch-top" href="' . h($href) . '">' . $art . $top . '</a>' : '<div class="ch-top">' . $art . $top . '</div>')
        . '<div class="ch-acts"><span class="muted cp-owner">' . h($who) . '</span>' . ($href ? '<a class="btn small" href="' . h($href) . '">View</a>' : '') . '</div></article>';
}

// one roll in the table log; campaigns.js draws live ones the same way (cpRoll)
function cp_roll_html($e)
{
    $hidden = ($e['vis'] ?? '') === 'hidden' && !isset($e['total']);
    $tags = ($e['vis'] ?? '') === 'dm' ? '<span class="badge p">to DM</span>' : (($e['vis'] ?? '') === 'hidden' ? '<span class="badge p">hidden</span>' : '');
    if (!empty($e['offline'])) $tags .= '<span class="badge">offline roll</span>';
    $nat = ($e['nat'] ?? '') === '20' ? ' cp-nat20' : (($e['nat'] ?? '') === '1' ? ' cp-nat1' : '');
    return '<li class="cp-roll' . $nat . '"><span class="cp-rh"><b>' . h($e['name']) . '</b> ' . ($hidden ? 'rolled' : h($e['title'] ?? '')) . $tags
        . '<small title="' . h(date('j M Y H:i:s', (int)($e['at'] / 1000))) . '">' . h(date('H:i', (int)($e['at'] / 1000))) . '</small></span>'
        . ($hidden ? '' : '<span class="cp-rd">' . preg_replace('/~([^~]*)~/', '<s>$1</s>', h(trim(($e['expr'] ?? '') . ' · ' . ($e['shown'] ?? ''), ' ·'))) . '</span><span class="cp-rt">' . h((string)($e['total'] ?? '')) . '</span>') . '</li>';
}

$past = $c && isset($_GET['s']) ? tl_read($accounts, $c['id'], $_GET['s']) : null;
if ($past) {
    $site_page = ['title' => ($_GET['s'] === 'unsorted' ? 'Rolls outside sessions' : 'Session ' . (int)$_GET['s']) . ' · ' . $c['name'], 'components' => true, 'css' => ['/assets/css/pages/campaigns.css']];
    header('X-Robots-Tag: noindex');
    $rolls = tl_tail($c, $user['sub'], $past, PHP_INT_MAX);
}
elseif ($c) {
    $site_page = ['title' => $c['name'], 'components' => true, 'ui' => true, 'css' => ['/assets/css/pages/campaigns.css', '/assets/css/pages/fight.css', '/assets/css/pages/handouts.css', '/assets/css/pages/map.css']];
    // handouts (ROADMAP 3.4) and, for the DM and co-DMs, notes and the players to send to: in the page, so no second fetch
    $ho = ['handouts' => ho_list($accounts, $c, $user['sub'])] + ($isDm ? ['notes' => no_all($accounts, $c['id']),
        'players' => array_values(array_map(fn($m) => ['sub' => $m['sub'], 'name' => $m['name']], array_filter($c['members'], fn($m) => !cp_is_dm($c, $m['sub']))))] : []);
    $sessions = tl_sessions($accounts, $c['id']);
    $unsorted = tl_read($accounts, $c['id'], 'unsorted');
    header('X-Robots-Tag: noindex');
    $me = $c['members'][cp_member($c, $user['sub'])];
    $mineIds = array_column($me['characters'] ?? [], 'id');
    $mine = [];
    $archived = 0; // archived characters can't join (ROADMAP 0.5)
    foreach (array_keys(ch_list($accounts, $user['sub'])) as $id) {
        if (ch_archived(ch_meta($accounts, $id))) { $archived++; continue; }
        if ($card = cp_card($accounts, $id)) $mine[$id] = $card['name'];
    }
    asort($mine, SORT_NATURAL | SORT_FLAG_CASE);
    $party = '';
    $count = 0;
    foreach ($c['members'] as $m) foreach ($m['characters'] ?? [] as $l) {
        $card = cp_card($accounts, $l['id'] ?? '');
        if (!$card) continue; // the owner deleted it
        $count++;
        $own = $m['sub'] === $user['sub'];
        $party .= cp_card_html($card, (cp_is_owner($c, $m['sub']) ? 'DM: ' : (cp_is_dm($c, $m['sub']) ? 'Co-DM: ' : '')) . $m['name'], $own || $isDm ? '/characters/' . rawurlencode($l['id']) : null);
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $link = (preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host) ? 'http' : 'https') . "://$host/campaigns/join/{$c['code']}";
}
elseif (isset($_GET['c'])) {
    $site_page = ['title' => 'Campaign not found', 'components' => true];
    http_response_code(404);
}
else {
    $site_page = ['components' => true, 'ui' => true, 'css' => ['/assets/css/pages/campaigns.css']];
    $lists = $user ? cp_mine($accounts, $user['sub']) : null;
}
$tile = fn($k) => '<a class="hub-card" href="/campaigns/' . h($k['id']) . '"><b>' . h($k['name']) . '</b><span>'
    . h(cp_people($k)) . '</span></a>';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page cp" id="main"<?= $c && !$past ? ' data-id="' . h($c['id']) . '" data-role="' . ($isOwner ? 'dm' : ($isDm ? 'codm' : 'player')) . '"' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
<?php if ($past): ?>
        <h1 class="page-title"><?= $_GET['s'] === 'unsorted' ? 'Rolls outside sessions' : 'Session ' . (int)$_GET['s'] ?></h1>
        <p class="page-lede"><a href="/campaigns/<?= h($c['id']) ?>"><?= h($c['name']) ?></a><?php if (!empty($past['started'])): ?> · <?= h(date('j M Y, H:i', $past['started'])) ?><?= !empty($past['ended']) ? ' to ' . h(date('H:i', $past['ended'])) : ' · running now' ?><?php endif; ?> · <?= count($rolls) === 1 ? '1 roll' : count($rolls) . ' rolls' ?></p>
        <?php if ($rolls): ?><ol class="cp-log"><?= implode('', array_map('cp_roll_html', array_reverse($rolls))) ?></ol>
        <?php else: ?><p class="muted">No rolls in this one.</p><?php endif; ?>
<?php elseif ($c): ?>
        <p class="note" id="cp-paused" hidden>Live updates paused. Checking for changes every 10 seconds.</p>
        <div id="cp-head">
        <h1 class="page-title"><?= h($c['name']) ?></h1>
        <p class="page-lede"><?= h(cp_people($c)) ?></p>

        <h2 class="sec-h">Party <span class="n"><?= $count === 1 ? '1 character' : "$count characters" ?></span></h2>
        <?php if ($party !== ''): ?>
            <div class="cp-grid"><?= $party ?></div>
        <?php else: ?>
            <p class="muted">No characters yet. Add yours below.</p>
        <?php endif; ?>
        </div>

        <?php // the current fight (ROADMAP 1.4, assets/js/fight.js): players see the order, the DM numbers and monster HP ?>
        <section class="card cp-fight" id="cp-fight" aria-label="Fight" hidden></section>
        <?php // the battle map on the table (ROADMAP 1.6, assets/js/map.js), live; the full-screen map page is a click away ?>
        <section class="card cp-map" id="cp-map" data-me="<?= h(live_key($c['id'], $user['sub'])) ?>" aria-label="Map">
            <h2>Map <a class="btn small" href="/campaigns/<?= h($c['id']) ?>/map">Open full screen</a><?php if ($isDm): // the TV (ROADMAP 1.7): its own tab, to drag to the TV ?>
                <a class="btn small" href="/campaigns/<?= h($c['id']) ?>/table" target="_blank" rel="noopener" data-act="tv">Open Table view</a><?php endif; ?></h2>
            <div class="mp-barin" data-mp="bar"></div>
            <div class="mp-view" data-mp="view"></div>
            <div data-mp="tray" hidden></div>
        </section>

        <div id="cp-sess">
            <h2 class="sec-h">Table log <span class="n"><?= isset($c['session']['n']) ? 'Session ' . (int)$c['session']['n'] . ' since ' . h(date('H:i', $c['session']['started'])) : 'No session running' ?></span></h2>
            <?php if ($isDm): ?><p><button type="button" class="btn small" data-act="session" data-start="<?= isset($c['session']['n']) ? '' : '1' ?>"><?= isset($c['session']['n']) ? 'End session' : 'Start session' ?></button>
                <span class="muted"><?= isset($c['session']['n']) ? 'Rolls are kept with this session.' : "Rolls go into this session's own log until you end it." ?></span></p><?php endif; ?>
            <?php if ($sessions || $unsorted): ?><p class="cp-past muted">Past rolls:
                <?php foreach ($sessions as $s): ?><a href="/campaigns/?c=<?= h($c['id']) ?>&amp;s=<?= $s['n'] ?>">Session <?= $s['n'] ?></a> <?php endforeach; ?>
                <?php if ($unsorted): ?><a href="/campaigns/?c=<?= h($c['id']) ?>&amp;s=unsorted">Outside sessions</a><?php endif; ?></p><?php endif; ?>
        </div>
        <ol class="cp-log" id="cp-log"><li class="muted cp-empty">Rolls made on a character in this campaign show up here.</li></ol>

        <?php // handouts and DM notes (ROADMAP 3.4): campaigns/dm.js for the DM and co-DMs, assets/js/handouts.js for players ?>
        <script type="application/json" id="cp-ho-data"><?= json_encode($ho) ?></script>
        <?php if ($isDm): ?>
            <section class="card" id="dm-ho" aria-labelledby="dm-ho-h">
                <h2 id="dm-ho-h">Handouts</h2>
                <div class="dm-split">
                    <div><div class="dm-bar"><button type="button" class="btn small" data-dm="hnew">New handout</button></div><div class="dm-list" id="dm-hlist"></div></div>
                    <div class="dm-edit form" id="dm-hedit"></div>
                </div>
                <details class="dm-arch" id="dm-harch" hidden></details>
            </section>
            <section class="card" id="dm-notes" aria-labelledby="dm-notes-h">
                <h2 id="dm-notes-h">Notes <span class="n">only you and co-DMs see these</span></h2>
                <div class="dm-split">
                    <div><div class="dm-bar"><button type="button" class="btn small" data-dm="nnew">New note</button><input class="field" type="search" id="dm-nsearch" placeholder="Search notes" aria-label="Search notes" autocomplete="off"></div><div class="dm-list" id="dm-nlist"></div></div>
                    <div class="dm-edit form" id="dm-nedit"></div>
                </div>
                <details class="dm-arch" id="dm-narch" hidden></details>
                <datalist id="dm-ngroups"></datalist>
            </section>
        <?php else: ?>
            <section class="card" id="cp-ho" aria-labelledby="cp-ho-h">
                <h2 id="cp-ho-h">Handouts</h2>
                <div id="cp-holist"><p class="muted">Loading handouts...</p></div>
            </section>
        <?php endif; ?>

        <div class="masonry cp-cards">
            <section class="card">
                <h2>Your characters</h2>
                <?php if ($mine): ?>
                    <form class="form" id="cp-chars">
                        <fieldset>
                            <legend>Characters in this campaign</legend>
                            <?php foreach ($mine as $id => $name): ?>
                                <label class="check"><input type="checkbox" name="ch" value="<?= h($id) ?>"<?= in_array($id, $mineIds, true) ? ' checked' : '' ?>> <?= h($name) ?></label>
                            <?php endforeach; ?>
                        </fieldset>
                        <div class="actions"><button class="btn primary" type="submit">Save characters</button></div>
                    </form>
                <?php endif; ?>
                <?php if ($archived): ?>
                    <p class="muted">Archived characters can't join a campaign. Unarchive one in My Characters first.</p>
                <?php elseif (!$mine): ?>
                    <p class="muted">You have no characters in your account yet. <a href="/characters/">Make one in My Characters</a> while signed in, then come back here.</p>
                <?php endif; ?>
            </section>

            <section class="card" id="cp-players">
                <h2>Players <span class="n"><?= count($c['members']) ?></span></h2>
                <div class="rows">
                    <?php foreach ($c['members'] as $m): ?>
                        <div class="rowi" data-key="<?= h(live_key($c['id'], $m['sub'])) ?>"><span class="grow"><?= h($m['name']) ?><?= $m['sub'] === $user['sub'] ? ' <span class="muted">(you)</span>' : '' ?></span>
                            <span class="badge g cp-on" hidden>Online</span>
                            <?php $co = !cp_is_owner($c, $m['sub']) && cp_is_dm($c, $m['sub']); ?>
                            <?php if (cp_is_owner($c, $m['sub'])): ?><span class="badge b">DM</span>
                            <?php else: ?>
                                <?php if ($co): ?><span class="badge b">Co-DM</span><?php endif; ?>
                                <?php if ($isOwner): ?><button type="button" class="btn small" data-act="codm" data-on="<?= $co ? '' : '1' ?>" data-sub="<?= h($m['sub']) ?>" data-name="<?= h($m['name']) ?>"><?= $co ? 'Make player' : 'Make co-DM' ?></button>
                                <button type="button" class="btn small" data-act="remove" data-sub="<?= h($m['sub']) ?>" data-name="<?= h($m['name']) ?>">Remove</button><?php endif; ?>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
                <?php if (!$isOwner): ?><p><button type="button" class="btn small" data-act="leave">Leave campaign</button></p><?php endif; ?>
            </section>

            <?php if ($isDm): ?>
                <section class="card">
                    <h2>Invite players</h2>
                    <p class="muted">Anyone signed in who opens this link joins the campaign.</p>
                    <div class="cp-link">
                        <input class="field mono" id="cp-link" value="<?= h($link) ?>" readonly aria-label="Join link">
                        <button type="button" class="btn small" data-act="copy">Copy link</button>
                    </div>
                    <?php if ($isOwner): ?><p><button type="button" class="btn small" data-act="code">Make a new link</button> <span class="muted">The old link stops working.</span></p><?php endif; ?>
                </section>
            <?php endif; ?>

            <?php // the DM's character rules (ROADMAP 4.2): what the character builder offers a character built for this campaign
            $rules = cp_rules($c); $mNames = ['pb' => 'Point buy', 'std' => 'Standard array', 'roll' => '4d6 drop lowest', 'man' => 'Manual']; $hNames = ['avg' => 'Take the average', 'roll' => 'Roll the hit die']; ?>
            <section class="card" id="cp-rules">
                <h2>Character rules</h2>
                <?php if ($isDm): ?>
                    <form class="form" id="cp-rulesf">
                        <p class="muted">What the character builder offers when a player builds a character for this campaign.</p>
                        <fieldset><legend>Ability scores</legend>
                            <?php foreach ($mNames as $k => $t): ?><label class="check"><input type="checkbox" name="m" value="<?= $k ?>"<?= in_array($k, $rules['methods'], true) ? ' checked' : '' ?>> <?= h($t) ?></label><?php endforeach; ?>
                        </fieldset>
                        <fieldset><legend>Hit points after level 1</legend>
                            <?php foreach ($hNames as $k => $t): ?><label class="check"><input type="checkbox" name="hp" value="<?= $k ?>"<?= in_array($k, $rules['hp'], true) ? ' checked' : '' ?>> <?= h($t) ?></label><?php endforeach; ?>
                        </fieldset>
                        <div class="actions"><button class="btn" type="submit">Save rules</button></div>
                    </form>
                <?php else: ?>
                    <p class="muted">Ability scores: <?= h(implode(', ', array_map(fn($k) => $mNames[$k], $rules['methods']))) ?>. Hit points: <?= h(implode(' or ', array_map(fn($k) => strtolower($hNames[$k]), $rules['hp']))) ?>.</p>
                <?php endif; ?>
            </section>
            <?php if ($isOwner): ?>
                <section class="card">
                    <h2>Campaign</h2>
                    <form class="form" id="cp-rename">
                        <label>Name
                            <input class="field" name="name" value="<?= h($c['name']) ?>" maxlength="<?= CP_NAME ?>" autocomplete="off" required>
                        </label>
                        <div class="actions"><button class="btn" type="submit">Rename</button><button type="button" class="btn" data-act="delete">Delete campaign</button></div>
                    </form>
                </section>
            <?php endif; ?>
        </div>

        <dialog class="dlg" id="cp-ask" aria-labelledby="cp-ask-title">
            <h2 id="cp-ask-title"></h2>
            <p id="cp-ask-text"></p>
            <div class="actions"><button type="button" class="btn" id="cp-ask-no">Cancel</button><button type="button" class="btn primary" id="cp-ask-yes"></button></div>
        </dialog>
<?php elseif (isset($_GET['c'])): ?>
        <h1 class="page-title">Campaign not found</h1>
        <p class="page-lede"><?= $user ? "You're not in this campaign, or it was deleted. Ask the DM for a join link." : 'Sign in to open your campaigns.' ?></p>
        <p><a href="/campaigns/">Back to Campaigns</a></p>
<?php else: ?>
        <h1 class="page-title">Campaigns</h1>
        <p class="page-lede">Make a campaign, invite your players with a link, and keep the party's characters together.</p>
        <?php if (!$user): ?>
            <p class="note"><?= auth_enabled() ? 'Sign in with Google (top right) to make or join a campaign.' : "Sign-in isn't set up on this server, so campaigns are off." ?></p>
        <?php else: ?>
            <section class="card cp-new">
                <h2>New campaign</h2>
                <form class="form" id="cp-create">
                    <label>Campaign name
                        <input class="field" name="name" maxlength="<?= CP_NAME ?>" autocomplete="off" placeholder="Curse of the Crown" required>
                    </label>
                    <div class="actions"><button class="btn primary" type="submit">Create campaign</button></div>
                </form>
            </section>
            <?php // cp_mine()'s 'dm' list has the campaigns you co-DM too; they get their own heading here
            foreach (['the DM' => true, 'a co-DM' => false] as $role => $own): $list = array_filter($lists['dm'], fn($k) => cp_is_owner($k, $user['sub']) === $own); ?>
                <?php if ($list): ?>
                <h2 class="sec-h">You're <?= $role ?> <span class="n"><?= count($list) ?></span></h2>
                <div class="hub-grid"><?= implode('', array_map($tile, $list)) ?></div>
                <?php endif; ?>
            <?php endforeach; ?>
            <?php if ($lists['player']): ?>
                <h2 class="sec-h">You're playing in <span class="n"><?= count($lists['player']) ?></span></h2>
                <div class="hub-grid"><?= implode('', array_map($tile, $lists['player'])) ?></div>
            <?php endif; ?>
            <?php if (!$lists['dm'] && !$lists['player']): ?>
                <p class="muted">You're not in any campaigns yet. Make one above, or open a join link from your DM.</p>
            <?php endif; ?>
        <?php endif; ?>
<?php endif; ?>
    </main>

    <?php site_footer(); ?>
    <?php if ($c && !$past): ?><script src="<?= h(asset('/assets/js/live.js')) ?>" defer></script><script src="<?= h(asset('/sheets/player/dmedit.js')) ?>" defer></script><script src="<?= h(asset('/assets/js/conds.js')) ?>" defer></script><script src="<?= h(asset('/assets/js/fight.js')) ?>" defer></script>
        <script src="<?= h(asset('/assets/js/handouts.js')) ?>" defer></script><?php if ($isDm): ?><script src="<?= h(asset('/campaigns/dm.js')) ?>" defer></script><?php endif; ?>
        <script src="<?= h(asset('/assets/js/map.js')) ?>" defer></script>
        <script>addEventListener('DOMContentLoaded', () => { const s = document.getElementById('cp-map'), m = document.getElementById('main'); BattleMap.mount(s, m.dataset.id, { dm: m.dataset.role !== 'player', me: s.dataset.me }); });</script><?php endif; ?>
    <?php if (($c && !$past) || ($user && !isset($_GET['c']))): ?><script src="<?= h(asset('/campaigns/campaigns.js')) ?>" defer></script><?php endif; ?>
</body>

</html>
