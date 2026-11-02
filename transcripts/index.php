<?php
require __DIR__ . '/transcripts.php';
$slug = $_GET['s'] ?? '';
$s = tx_slug_ok($slug) ? tx_session($slug) : null;
$site_page = ['components' => true, 'css' => ['/assets/css/pages/games-dnd-transcripts.css']] + ($s ? ['title' => $s['name']] : []);
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';

if ($s) {
    $md = (string)file_get_contents(TX_DATA . "/$slug/transcript.md");
    $msgs = tx_messages($md, $s['start']);
    $summary = tx_summary($md);
    $speakers = array_values(array_unique(array_column($msgs, 'speaker')));
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page tx" id="main">
        <?= site_breadcrumbs(site_current_path()) ?>
        <?php if ($s): ?>
            <h1 class="page-title"><?= h($s['name']) ?></h1>
            <p class="page-lede">
                <?= $s['ts'] ? h(date('j M Y', $s['ts'])) . ' · ' : '' ?><?= $s['duration'] ? h(tx_duration($s['duration'])) . ' · ' : '' ?><?= h(implode(', ', $speakers)) ?>.
                <a href="/games/dnd/transcripts/">All sessions</a>
            </p>

            <?php if (!$s['audio']): ?><p class="note">This session has no recording.</p><?php endif; ?>
            <div class="bar tx-bar">
                <?php if ($s['audio']): ?><audio id="tx-audio" controls preload="metadata" src="data/<?= h($slug) ?>/audio.ogg"></audio><?php endif; ?>
                <input class="field tx-q" id="tx-q" type="search" placeholder="Search the transcript" aria-label="Search the transcript">
                <button class="btn small" type="button" id="tx-prev" title="Previous match (Shift+Enter)">Previous</button>
                <button class="btn small" type="button" id="tx-next" title="Next match (Enter)">Next</button>
                <span class="muted tx-count" id="tx-count" role="status"></span>
                <?php if ($s['audio']): ?><label class="check tx-follow"><input type="checkbox" id="tx-follow" checked> Follow along</label><?php endif; ?>
            </div>
            <?php if ($s['audio']): ?><p class="muted tx-hint">Click a line to play from there. Scrolling stops following; click a line or tick Follow along to resume.</p><?php endif; ?>

            <?php if ($summary !== ''): ?>
                <details class="card tx-summary">
                    <summary>Summary</summary>
                    <p><?= nl2br(h($summary)) ?></p>
                </details>
            <?php endif; ?>

            <?php if (!$msgs): ?>
                <p class="err">No messages found in this transcript.</p>
            <?php endif; ?>
            <div class="tx-log" id="tx-log">
                <?php $prev = null;
                foreach ($msgs as $i => $m): $c = array_search($m['speaker'], $speakers) % 5; ?>
                    <div class="tx-msg<?= $m['speaker'] === $prev ? ' tx-cont' : '' ?>" id="m<?= $i ?>" data-t="<?= $m['t'] ?>">
                        <button type="button" class="tx-time" title="<?= h($m['time']) ?>"><?= tx_clock($m['t']) ?></button>
                        <div class="tx-body">
                            <?php if ($m['speaker'] !== $prev): ?><b class="tx-c<?= $c ?>"><?= h($m['speaker']) ?></b><?php endif; ?>
                            <p><?= h($m['text']) ?></p>
                        </div>
                    </div>
                <?php $prev = $m['speaker'];
                endforeach; ?>
            </div>
        <?php else: $sessions = tx_sessions(); ?>
            <h1 class="page-title">Session Transcripts</h1>
            <p class="page-lede">Recordings of our D&amp;D sessions. Click any line of a transcript to hear it.</p>
            <?php if ($slug !== ''): ?><p class="err">That session doesn't exist.</p><?php endif; ?>
            <div class="actions tx-actions"><a class="btn primary" href="/private/transcripts/">Import a session</a></div>
            <?php if (!$sessions): ?>
                <p class="note">No sessions yet.</p>
            <?php else: ?>
                <div class="hub-grid">
                    <?php foreach ($sessions as $x): ?>
                        <a class="hub-card" href="?s=<?= h($x['slug']) ?>"><b><?= h($x['name']) ?></b><span><?= h(implode(' · ', array_filter([
                            $x['ts'] ? date('j M Y', $x['ts']) : '',
                            $x['duration'] ? tx_duration($x['duration']) : '',
                            $x['audio'] ? '' : 'no recording',
                        ]))) ?></span></a>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        <?php endif; ?>
    </main>

    <?php site_footer(null, false); ?>

    <?php if ($s): ?>
        <script>
            (() => {
                const audio = document.getElementById('tx-audio');
                const log = document.getElementById('tx-log');
                const rows = [...log.children];
                const texts = rows.map(r => r.querySelector('p').textContent);
                const index = new Map(rows.map((r, i) => [r, i]));
                const follow = document.getElementById('tx-follow');
                const q = document.getElementById('tx-q');
                const count = document.getElementById('tx-count');
                let on = null;

                function mark(row) {
                    if (on === row) return;
                    on?.classList.remove('on');
                    (on = row)?.classList.add('on');
                }

                function jump(row, play) {
                    mark(row);
                    history.replaceState(null, '', '#' + row.id);
                    if (!audio) return;
                    audio.currentTime = +row.dataset.t;
                    if (play) audio.play().catch(() => {});
                }

                log.addEventListener('click', e => {
                    const row = e.target.closest('.tx-msg');
                    // selecting text to copy shouldn't restart the audio
                    if (!row || (!e.target.closest('button') && getSelection().toString())) return;
                    if (follow) follow.checked = true;
                    jump(row, true);
                });

                // following: keep the line being spoken in the middle of the screen; scrolling by hand stops it
                function centre() {
                    if (!follow?.checked || !on) return;
                    // glide to the next line, but jump straight there after a seek far away
                    const far = Math.abs(on.getBoundingClientRect().top - innerHeight / 2) > innerHeight;
                    on.scrollIntoView({ block: 'center', behavior: far ? 'auto' : 'smooth' });
                }
                if (follow) {
                    for (const ev of ['wheel', 'touchmove']) addEventListener(ev, () => { if (!audio.paused) follow.checked = false; }, { passive: true });
                    audio.addEventListener('play', centre);
                    follow.addEventListener('change', centre);
                }

                if (audio) audio.addEventListener('timeupdate', () => {
                    // last row that started at or before the playhead (rows are in time order)
                    let lo = 0, hi = rows.length - 1, t = audio.currentTime;
                    while (lo < hi) {
                        const mid = (lo + hi + 1) >> 1;
                        if (+rows[mid].dataset.t <= t) lo = mid; else hi = mid - 1;
                    }
                    if (!rows[lo] || rows[lo] === on) return;
                    mark(rows[lo]);
                    if (!audio.paused) centre();
                });

                // search: mark every match, Enter / Next steps through them and moves the audio there too
                let hits = [], cur = -1;

                function highlight(i, term) {
                    const p = rows[i].querySelector('p'), text = texts[i], low = text.toLowerCase();
                    p.replaceChildren();
                    let at = 0;
                    for (let k = low.indexOf(term); k !== -1; k = low.indexOf(term, at)) {
                        p.append(text.slice(at, k), Object.assign(document.createElement('mark'), { textContent: text.slice(k, k + term.length) }));
                        at = k + term.length;
                    }
                    p.append(text.slice(at));
                }

                function search() {
                    for (const r of hits) r.querySelector('p').textContent = texts[index.get(r)];
                    const term = q.value.trim().toLowerCase();
                    hits = [];
                    cur = -1;
                    if (term) texts.forEach((t, i) => {
                        if (!t.toLowerCase().includes(term)) return;
                        hits.push(rows[i]);
                        highlight(i, term);
                    });
                    count.textContent = !term ? '' : hits.length ? hits.length + ' found' : 'Not found';
                }

                function step(dir) {
                    if (!hits.length) return;
                    if (cur === -1) {
                        // first step of a search starts from the current line, not the top
                        const at = on ? index.get(on) : -1;
                        cur = dir > 0 ? hits.findIndex(r => index.get(r) > at) : hits.findLastIndex(r => index.get(r) < at);
                        if (cur === -1) cur = dir > 0 ? 0 : hits.length - 1;
                    } else cur = (cur + dir + hits.length) % hits.length;
                    count.textContent = (cur + 1) + ' of ' + hits.length;
                    hits[cur].scrollIntoView({ block: 'center' });
                    jump(hits[cur], false);
                }

                let timer;
                q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 150); });
                q.addEventListener('keydown', e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    clearTimeout(timer);
                    if (!hits.length) search();
                    step(e.shiftKey ? -1 : 1);
                });
                document.getElementById('tx-next').addEventListener('click', () => step(1));
                document.getElementById('tx-prev').addEventListener('click', () => step(-1));

                const start = location.hash && document.getElementById(location.hash.slice(1));
                if (start && start.classList.contains('tx-msg')) {
                    start.scrollIntoView({ block: 'center' });
                    jump(start, false);
                }
            })();
        </script>
    <?php endif; ?>
</body>

</html>
