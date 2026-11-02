<?php
// Campaigns. /campaigns/ lists the campaigns you DM and play in and makes new ones; /campaigns/?c=<id> is one campaign:
// the party's characters, the players, your characters in it, and for the DM the join link, rename, remove and delete.
// Changes go through campaigns/api.php (campaigns.js). With the live relay (includes/live.php) the party, the players and
// who's online update by themselves; #cp-head, #cp-sess and #cp-players are what campaigns.js swaps in from a fresh copy of
// the page. The table log (ROADMAP 1.3) fills #cp-log live (assets/js/live.js); ?c=<id>&s=<n> shows a past session's rolls.
// Only members see a campaign; anyone else gets "not found".
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
require_once SITE_ROOT . '/includes/tablelog.php';
require_once SITE_ROOT . '/includes/live.php';
// DND_ACCOUNTS: a stand-in folder for _dev/scripts/campaigns-page.mjs, so the check never touches real accounts
$accounts = getenv('DND_ACCOUNTS') ?: SITE_ROOT . '/private/dnd/accounts';
$user = auth_user();
$c = $user && isset($_GET['c']) ? cp_get($accounts, $_GET['c']) : null;
if ($c && cp_member($c, $user['sub']) < 0) $c = null;
$isDm = $c && $c['dm'] === $user['sub'];

// a character's card: name, "Level | Species | Class" and art, read from the owner's save (never copied)
// shortcut: inline art goes into the page as it is, so a party with big portraits makes a heavy page; ROADMAP 0.4 moves art to files
function cp_card($accounts, $id)
{
    $ch = ch_ok_id($id) ? ch_json("$accounts/characters/$id/character.json") : null;
    if (!$ch) return null;
    $classes = array_filter(array_map(fn($k) => is_array($k) ? (string)($k['name'] ?? '') : '', is_array($ch['classes'] ?? null) ? $ch['classes'] : []));
    $level = array_sum(array_map(fn($k) => is_array($k) ? (int)($k['level'] ?? 0) : 0, is_array($ch['classes'] ?? null) ? $ch['classes'] : [])) ?: 1;
    $art = is_string($ch['art'] ?? null) && preg_match('#^(data:image/|https://)#', $ch['art']) ? $ch['art']
        : (is_string($ch['artUrl'] ?? null) && preg_match('#^/sheets/player/art\.php\?id=[\w-]+&v=[a-f0-9]{12}$#', $ch['artUrl']) ? $ch['artUrl'] : '');
    return ['name' => ($ch['name'] ?? '') !== '' ? (string)$ch['name'] : 'Unnamed character',
        'line' => implode(' | ', array_filter(["Level $level", (string)($ch['race'] ?? ''), implode(' / ', $classes)])), 'art' => $art];
}
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
    $site_page = ['title' => $c['name'], 'components' => true, 'ui' => true, 'css' => ['/assets/css/pages/campaigns.css']];
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
        $party .= cp_card_html($card, ($m['sub'] === $c['dm'] ? 'DM: ' : '') . $m['name'], $own || $isDm ? '/characters/' . rawurlencode($l['id']) : null);
    }
    $players = count($c['members']) - 1;
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
$tile = fn($k) => '<a class="hub-card" href="/campaigns/?c=' . h($k['id']) . '"><b>' . h($k['name']) . '</b><span>'
    . h(($k['members'][0]['name'] ?? 'DM') . ' is the DM · ' . (count($k['members']) - 1 === 1 ? '1 player' : (count($k['members']) - 1) . ' players')) . '</span></a>';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page cp" id="main"<?= $c && !$past ? ' data-id="' . h($c['id']) . '"' : '' ?>>
        <?= site_breadcrumbs(site_current_path()) ?>
<?php if ($past): ?>
        <h1 class="page-title"><?= $_GET['s'] === 'unsorted' ? 'Rolls outside sessions' : 'Session ' . (int)$_GET['s'] ?></h1>
        <p class="page-lede"><a href="/campaigns/?c=<?= h($c['id']) ?>"><?= h($c['name']) ?></a><?php if (!empty($past['started'])): ?> · <?= h(date('j M Y, H:i', $past['started'])) ?><?= !empty($past['ended']) ? ' to ' . h(date('H:i', $past['ended'])) : ' · running now' ?><?php endif; ?> · <?= count($rolls) === 1 ? '1 roll' : count($rolls) . ' rolls' ?></p>
        <?php if ($rolls): ?><ol class="cp-log"><?= implode('', array_map('cp_roll_html', array_reverse($rolls))) ?></ol>
        <?php else: ?><p class="muted">No rolls in this one.</p><?php endif; ?>
<?php elseif ($c): ?>
        <p class="note" id="cp-paused" hidden>Live updates paused. Checking for changes every 10 seconds.</p>
        <div id="cp-head">
        <h1 class="page-title"><?= h($c['name']) ?></h1>
        <p class="page-lede"><?= h($c['members'][0]['name']) ?> is the DM · <?= $players === 1 ? '1 player' : "$players players" ?></p>

        <h2 class="sec-h">Party <span class="n"><?= $count === 1 ? '1 character' : "$count characters" ?></span></h2>
        <?php if ($party !== ''): ?>
            <div class="cp-grid"><?= $party ?></div>
        <?php else: ?>
            <p class="muted">No characters yet. Add yours below.</p>
        <?php endif; ?>
        </div>

        <div id="cp-sess">
            <h2 class="sec-h">Table log <span class="n"><?= isset($c['session']['n']) ? 'Session ' . (int)$c['session']['n'] . ' since ' . h(date('H:i', $c['session']['started'])) : 'No session running' ?></span></h2>
            <?php if ($isDm): ?><p><button type="button" class="btn small" data-act="session" data-start="<?= isset($c['session']['n']) ? '' : '1' ?>"><?= isset($c['session']['n']) ? 'End session' : 'Start session' ?></button>
                <span class="muted"><?= isset($c['session']['n']) ? 'Rolls are kept with this session.' : "Rolls go into this session's own log until you end it." ?></span></p><?php endif; ?>
            <?php if ($sessions || $unsorted): ?><p class="cp-past muted">Past rolls:
                <?php foreach ($sessions as $s): ?><a href="/campaigns/?c=<?= h($c['id']) ?>&amp;s=<?= $s['n'] ?>">Session <?= $s['n'] ?></a> <?php endforeach; ?>
                <?php if ($unsorted): ?><a href="/campaigns/?c=<?= h($c['id']) ?>&amp;s=unsorted">Outside sessions</a><?php endif; ?></p><?php endif; ?>
        </div>
        <ol class="cp-log" id="cp-log"><li class="muted cp-empty">Rolls made on a character in this campaign show up here.</li></ol>

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
                            <?php if ($m['sub'] === $c['dm']): ?><span class="badge b">DM</span>
                            <?php elseif ($isDm): ?><button type="button" class="btn small" data-act="remove" data-sub="<?= h($m['sub']) ?>" data-name="<?= h($m['name']) ?>">Remove</button><?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
                <?php if (!$isDm): ?><p><button type="button" class="btn small" data-act="leave">Leave campaign</button></p><?php endif; ?>
            </section>

            <?php if ($isDm): ?>
                <section class="card">
                    <h2>Invite players</h2>
                    <p class="muted">Anyone signed in who opens this link joins the campaign.</p>
                    <div class="cp-link">
                        <input class="field mono" id="cp-link" value="<?= h($link) ?>" readonly aria-label="Join link">
                        <button type="button" class="btn small" data-act="copy">Copy link</button>
                    </div>
                    <p><button type="button" class="btn small" data-act="code">Make a new link</button> <span class="muted">The old link stops working.</span></p>
                </section>

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
            <?php if ($lists['dm']): ?>
                <h2 class="sec-h">You're the DM <span class="n"><?= count($lists['dm']) ?></span></h2>
                <div class="hub-grid"><?= implode('', array_map($tile, $lists['dm'])) ?></div>
            <?php endif; ?>
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
    <?php if ($c && !$past): ?><script src="<?= h(asset('/assets/js/live.js')) ?>" defer></script><?php endif; ?>
    <?php if (($c && !$past) || ($user && !isset($_GET['c']))): ?><script src="<?= h(asset('/campaigns/campaigns.js')) ?>" defer></script><?php endif; ?>
</body>

</html>
