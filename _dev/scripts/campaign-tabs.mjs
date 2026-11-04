// Checks the campaign page's tabs (ROADMAP 1.9) in headless Chrome and Firefox, as the DM, a co-DM and a player, with the real
// relay: each role's tabs and what's on them, hash links, Back and reload, Overview's order with and without a session or a fight,
// tiles, the characters dialog, unopened handouts, the map's rules, the Rolls tab, no sideways scroll from 320 to 2560,
// and that the archived session recordings no longer open.
//   node _dev/scripts/campaign-tabs.mjs      (needs: cd live && npm install, and includes/config.php for sign-in)
// Stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), SHIFT = +process.env.CHECK_PORT_SHIFT || 0, WEB = 8131 + SHIFT, RELAY = 8103 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-tabs-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const USERS = { dm: ['111', 'Dee'], co: ['222', 'Cole'], pl: ['333', 'Pat'], no: ['444', 'Nell'] };
const SID = (who) => `tabscheck${who}00000000000000000000000`;
const CAMP = 'feed00000009';
const J = JSON.stringify;

function setup() {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    for (const [who, [sub, name]] of Object.entries(USERS)) writeFileSync(join(SESSIONS, 'sess_' + SID(who)), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
    for (const [id, owner, name, classes] of [['dmpc', '111', 'Brannoc', [{ name: 'Fighter', level: 3 }]], ['colec', '222', 'A very long character name that really has to wrap somewhere on a small phone', [{ name: 'Fighter', level: 3 }, { name: 'Rogue', level: 2 }]], ['lock', '333', 'Lock', [{ name: 'Barbarian', level: 4 }]], ['oz', '333', 'Ozzy', [{ name: 'Wizard', level: 1 }]]]) {
        mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), J({ owner, visibility: 'private', created: 1, campaigns: [] }));
        writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), J({ id, name, race: 'Human', updated: 5, art: '', classes, abilities: [] }));
    }
    const dir = join(ACCOUNTS, 'campaigns', CAMP);
    mkdirSync(join(dir, 'sessions'), { recursive: true });
    const mem = (sub, name, characters) => ({ sub, name, joined: 1, characters: characters.map((id) => ({ sheet: 'player', id })) });
    writeFileSync(join(dir, 'campaign.json'), J({ id: CAMP, name: 'Tabs <Test>', dm: '111', code: 'abcdef0123', created: 1, codms: ['222'],
        members: [mem('111', 'Dee', []), mem('222', 'Cole', ['colec']), mem('333', 'Pat', ['lock']), mem('444', 'Nell', [])] }));
    const roll = (id, sub, vis, total) => ({ id, at: 1762160000000, sub, dm: sub === '111', name: 'R', char: '', title: 'Check', expr: '1d20', shown: String(total), total: String(total), nat: '', vis, offline: false });
    // session 1 has rolls, one a whisper Pat can't see; session 2 was started and ended by accident: empty; outside sessions: not shown
    writeFileSync(join(dir, 'sessions', '1.json'), J({ started: 1762160000, ended: 1762163600, entries: [roll('rollaaaa1', '333', 'public', 11), roll('rollaaaa2', '222', 'dm', 12), roll('rollaaaa3', '333', 'public', 13)] }));
    writeFileSync(join(dir, 'sessions', '2.json'), J({ started: 1762170000, ended: 1762170100, entries: [] }));
    writeFileSync(join(dir, 'sessions', 'unsorted.json'), J({ started: null, ended: null, entries: [roll('rollaaaa9', '333', 'public', 19)] }));
    // a campaign nobody has joined or rolled in, for the new-campaign and no-sessions states
    const dir2 = join(ACCOUNTS, 'campaigns', 'feed0000000a');
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir2, 'campaign.json'), J({ id: 'feed0000000a', name: 'Empty', dm: '111', code: 'abcdef0124', created: 1, members: [mem('111', 'Dee', []), mem('444', 'Nell', [])] }));
    const dir3 = join(ACCOUNTS, 'campaigns', 'feed0000000b');
    mkdirSync(dir3, { recursive: true });
    writeFileSync(join(dir3, 'campaign.json'), J({ id: 'feed0000000b', name: 'New', dm: '111', code: 'abcdef0125', created: 1, members: [mem('111', 'Dee', [])] }));
}

let bad = 0;
const is = (name, got, want) => { if (J(got) !== J(want)) { bad++; console.log(`FAIL ${name}: got ${J(got)}, want ${J(want)}`); } };
const api = (who, body) => fetch(`${BASE}/campaigns/api.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'dndsid=' + SID(who) }, body: J(body) }).then((r) => r.status);
async function until(b, expr, ok = Boolean, ms = 6000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await b.ev(expr); if (ok(v)) return v; await sleep(100); } return v; }
const go = async (b, url) => { await b.go(url); for (let i = 0; i < 80 && !(await b.ev(`document.readyState === 'complete' && !!document.querySelector('#main')`)); i++) await sleep(100); };
const pills = `[...document.querySelectorAll('#cp-tabs [data-tab]')].map((p) => p.dataset.tab).join()`;
const onTab = `[...document.querySelectorAll('[data-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.panel).join() + '|' + document.querySelector('#cp-tabs .on').dataset.tab`;
const seen = (sel) => `(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.closest('[hidden]') && e.getClientRects().length > 0; })()`;
const order = `[...document.querySelector('#cp-over').children].filter((e) => !e.hidden && (e.id === 'cp-extras' ? [...e.children].some((c) => !c.hidden) : e.textContent.trim())).map((e) => e.id).join()`;
const click = (b, sel) => b.ev(`(document.querySelector(${J(sel)}).click(), 1)`);

setup();
const web = spawn(PHP, ['-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });
await serving(BASE + '/privacy/');
try {
    // nothing here needs a browser: the old addresses and the archived recordings
    for (const q of [`/campaigns/?c=${CAMP}&s=1`, `/campaigns/?c=${CAMP}&s=unsorted`, `/campaigns/${CAMP}?s=7`]) {
        const r = await fetch(BASE + q, { redirect: 'manual' });
        is(`${q} goes to the Rolls tab`, [r.status, r.headers.get('location')], [301, `/campaigns/${CAMP}#rolls`]);
    }
    for (const q of ['/transcripts/', '/transcripts/?s=x', '/transcripts/data/x/audio.ogg', '/transcripts/data/.htaccess']) {
        const r = await fetch(BASE + q, { redirect: 'manual' });
        is(`${q} no longer opens`, [r.status, r.headers.get('location')], [301, '/campaigns/']);
    }
    for (const q of ['/private/archive/transcripts/', '/private/archive/private/transcripts/', '/private/archive/transcripts/?audio=x']) is(`${q}: not for anyone signed out`, (await fetch(BASE + q)).status, 401);
    is('a player can\'t open the archive', (await fetch(BASE + '/private/archive/transcripts/', { headers: { Cookie: 'dndsid=' + SID('pl') } })).status, 403);
    const logDefault = await (await fetch(`${BASE}/campaigns/log.php?c=${CAMP}`, { headers: { Cookie: 'dndsid=' + SID('pl') } })).json();
    is('log.php without page=1 is as it was: the rolls outside sessions', [Object.keys(logDefault).sort().join(), logDefault.entries.map((e) => e.id)], ['dm,entries,session', ['rollaaaa9']]);

    for (const name of browsers) {
        setup();
        const dm = await launch(name), co = await launch(name), pl = await launch(name);
        const all = [[dm, 'dm'], [co, 'co'], [pl, 'pl']];
        try {
            for (const [b, who] of all) { await go(b, BASE + '/privacy/'); await b.ev(`localStorage.clear(); document.cookie = 'dndsid=${SID(who)}; path=/'`); }
            const page = `${BASE}/campaigns/${CAMP}`;
            for (const [b] of all) await go(b, page);

            // each role's tabs and what's on them
            is(`${name} DM's tabs`, await dm.ev(pills), 'overview,rolls,handouts,notes,campaign');
            is(`${name} co-DM's tabs`, await co.ev(pills), 'overview,rolls,handouts,notes,campaign');
            is(`${name} player's tabs`, await pl.ev(pills), 'overview,rolls,handouts,campaign');
            is(`${name} plain address opens Overview`, await dm.ev(onTab), 'overview|overview');
            is(`${name} the other tabs really are out of sight`, await dm.ev(`[...document.querySelectorAll('[data-panel]')].filter((p) => p.getClientRects().length).map((p) => p.dataset.panel).join()`), 'overview');
            is(`${name} name in the breadcrumb, not the id`, await dm.ev(`[...document.querySelectorAll('.crumbs [aria-current]')].map((c) => c.textContent).join()`), 'Tabs <Test>,Tabs <Test>');
            is(`${name} Start session and Table view: DM`, [await dm.ev(seen('[data-act=session]')), await dm.ev(seen('[data-act=tv]'))], [true, true]);
            is(`${name} Start session and Table view: co-DM`, [await co.ev(seen('[data-act=session]')), await co.ev(seen('[data-act=tv]'))], [true, true]);
            is(`${name} player has neither`, await pl.ev(`!document.querySelector('[data-act=session], [data-act=tv]')`), true);
            is(`${name} player: no notes, no link, no DM tools`, await pl.ev(`!document.querySelector('#dm-notes, #cp-link, #cp-rename, [data-act=remove], [data-act=codm], #cp-pins')`), true);
            is(`${name} co-DM: link, no DM-only tools, can leave`, await co.ev(`[!!document.querySelector('#cp-link'), !document.querySelector('[data-act=code], #cp-rename, [data-act=delete], [data-act=remove], [data-act=codm]'), !!document.querySelector('[data-act=leave]')].join()`), 'true,true,true');
            is(`${name} DM can't leave`, await dm.ev(`!document.querySelector('[data-act=leave]') && !!document.querySelector('[data-act=code]')`), true);
            is(`${name} player reads the rules`, await pl.ev(`!document.querySelector('#cp-rulesf') && !!document.querySelector('#cp-rules p')`), true);

            // hash links, reload and Back
            await click(dm, '#cp-tabs [data-tab=rolls]');
            is(`${name} a pill switches`, [await until(dm, onTab, (v) => v === 'rolls|rolls'), await dm.ev('location.hash')], ['rolls|rolls', '#rolls']);
            await click(dm, '#cp-tabs [data-tab=notes]');
            await until(dm, onTab, (v) => v === 'notes|notes');
            await dm.ev('history.back(), 1');
            is(`${name} Back returns to the last tab`, await until(dm, onTab, (v) => v === 'rolls|rolls'), 'rolls|rolls');
            await click(dm, '#cp-tabs [data-tab=overview]');
            is(`${name} Overview pill clears the address`, [await until(dm, onTab, (v) => v === 'overview|overview'), await dm.ev('location.pathname + location.hash')], ['overview|overview', `/campaigns/${CAMP}`]);
            await go(dm, page + '#campaign');
            is(`${name} a #campaign link opens that tab`, await until(dm, onTab, (v) => v === 'campaign|campaign'), 'campaign|campaign');
            await dm.ev('location.reload(), 1');
            await sleep(500);
            is(`${name} reload stays on it`, await until(dm, `window.UI ? ${onTab} : ''`, (v) => v === 'campaign|campaign'), 'campaign|campaign');
            await go(pl, page + '#notes');
            is(`${name} a player's #notes opens Overview, address cleaned`, [await until(pl, onTab, (v) => v === 'overview|overview'), await until(pl, 'location.hash', (h) => h === '')], ['overview|overview', '']);

            // tiles and the online dot
            await go(dm, page);
            is(`${name} tile lines`, await dm.ev(`[...document.querySelectorAll('.ch-tile small:not(.cp-owner)')].map((s) => s.textContent).join()`), 'Level 5 Fighter / Rogue,Level 4 Barbarian');
            is(`${name} tile owners`, await dm.ev(`[...document.querySelectorAll('.ch-tile .cp-owner')].map((s) => s.textContent).join()`), 'Co-DM: Cole,Pat');
            is(`${name} DM opens every tile`, await dm.ev(`[...document.querySelectorAll('.ch-tiles a.ch-tile')].map((a) => a.getAttribute('href')).join()`), '/characters/colec,/characters/lock');
            is(`${name} player opens only their own tile`, await pl.ev(`[...document.querySelectorAll('.ch-tiles a.ch-tile')].map((a) => a.getAttribute('href')).join() + '|' + document.querySelectorAll('.ch-tiles div.ch-tile').length`), '/characters/lock|1');
            is(`${name} green dot for who's online`, await until(dm, `[...document.querySelectorAll('.ch-tile[data-key]')].map((t) => !t.querySelector('.cp-dot').hidden).join()`, (v) => v === 'true,true'), 'true,true');

            // the characters dialog
            is(`${name} button text and weight`, [await dm.ev(`document.querySelector('[data-act=chars]').textContent + document.querySelector('[data-act=chars]').classList.contains('primary')`), await pl.ev(`document.querySelector('[data-act=chars]').textContent + document.querySelector('[data-act=chars]').classList.contains('primary')`)], ['Add your characterfalse', 'Change charactersfalse']);
            await click(pl, '[data-act=chars]');
            is(`${name} dialog opens`, [await until(pl, `document.querySelector('#cp-chardlg').open`), await pl.ev(`[...document.querySelectorAll('#cp-chars [name=ch]')].map((i) => i.value + i.checked).join()`)], [true, 'locktrue,ozfalse']);
            await click(pl, '#cp-chars [data-act=charsno]');
            await pl.ev(`window.__old = 1; document.querySelector('#cp-chars [value=oz]').checked = true; document.querySelector('#cp-chars [type=submit]').click(); 1`);
            await until(pl, `!window.__old && document.readyState === 'complete' && !!window.UI`);
            is(`${name} saved and in the party, live for the DM`, [await pl.ev(`document.querySelectorAll('.ch-tile').length`), await until(dm, `document.querySelectorAll('.ch-tile').length`, (n) => n === 3)], [3, 3]);
            await api('pl', { act: 'characters', id: CAMP, characters: ['lock'] });
            await until(pl, `document.querySelectorAll('.ch-tile').length`, (n) => n === 2);

            // the Rolls tab: the empty session 2 doesn't hide session 1; the count is each person's own; outside-session rolls don't show
            const head = `document.querySelector('#cp-rhead').textContent.replace(/ · \\d.*? · / , ' · DATE · ')`;
            is(`${name} DM: last session with rolls`, await until(dm, head, (t) => t.startsWith('Last session')), 'Last session: 1 · DATE · 3 rolls');
            is(`${name} player: no one else's whisper in the count`, await until(pl, head, (t) => t.startsWith('Last session')), 'Last session: 1 · DATE · 2 rolls');
            is(`${name} Rolls tab rows`, [await dm.ev(`document.querySelectorAll('#cp-log .cp-roll').length`), await pl.ev(`document.querySelectorAll('#cp-log .cp-roll').length`)], [3, 2]);
            is(`${name} roll times on a 12-hour clock`, /^\d{1,2}:\d\d [ap]m$/.test(await dm.ev(`document.querySelector('#cp-log small').textContent`)), true);
            is(`${name} Last played links to Rolls`, [await dm.ev(`document.querySelector('#cp-last a').getAttribute('href')`), /^Last played \d{1,2} \w{3} \d{4} · 3 rolls$/.test(await dm.ev(`document.querySelector('#cp-last').textContent.trim()`))], ['#rolls', true]);

            // Overview's order, live, and nobody is moved off their tab
            is(`${name} Overview between sessions: no map, no fight`, await dm.ev(order), 'cp-last,cp-party,cp-nomap');
            is(`${name} a player gets no map line`, await pl.ev(order), 'cp-last,cp-party');
            await click(pl, '#cp-tabs [data-tab=rolls]');
            is(`${name} starts a session`, await api('dm', { act: 'session', id: CAMP, start: true }), 200);
            is(`${name} badge for everyone`, /^Session 3 since \d{1,2}:\d\d [ap]m$/.test(await until(pl, `document.querySelector('#cp-sbadge')?.textContent || ''`, (t) => t.includes('since'))), true);
            is(`${name} the player stays on Rolls`, await pl.ev(onTab), 'rolls|rolls');
            is(`${name} Rolls follows the session`, [await until(pl, `document.querySelector('#cp-rhead').textContent`, (t) => t === 'Session 3'), await until(pl, `document.querySelector('#cp-log .cp-empty')?.textContent`)], ['Session 3', 'No rolls yet in this session.']);
            is(`${name} Overview reorders live`, await until(dm, order, (v) => v === 'cp-party,cp-nomap'), 'cp-party,cp-nomap');
            is(`${name} End button now`, await until(dm, `document.querySelector('[data-act=session]').textContent`, (t) => t === 'End session'), 'End session');
            await api('pl', { act: 'roll', id: CAMP, roll: { id: 'liveroll0001', char: 'lock', title: 'Live', expr: '1d20', shown: '5', total: '5' } });
            is(`${name} a roll in the session shows live`, await until(pl, `document.querySelectorAll('#cp-log .cp-roll').length`, (n) => n === 1), 1);
            await click(dm, '[data-act=session]');
            is(`${name} End asks first`, await until(dm, `document.querySelector('#cp-ask').open ? document.querySelector('#cp-ask-title').textContent : ''`), 'End session 3?');
            await click(dm, '#cp-ask-no');
            is(`${name} Cancel keeps it running`, await dm.ev(`!!document.querySelector('#cp-sbadge')`), true);

            // a fight: the dot, the order, Run the fight for DMs
            await click(pl, '#cp-tabs [data-tab=overview]');
            is(`${name} starts a fight`, await api('dm', { act: 'fight', id: CAMP, op: 'start' }), 200);
            is(`${name} dot on the Overview pill`, await until(pl, `!document.querySelector('#cp-fdot').hidden`), true);
            is(`${name} Fight above the rest`, await until(dm, order, (v) => v.includes('cp-fight')), 'cp-party,cp-fight,cp-nomap');
            is(`${name} Run the fight, for DMs only`, [await until(dm, `document.querySelector('#cp-fight a.btn')?.textContent || ''`), await pl.ev(`!document.querySelector('#cp-fight a.btn')`)], ['Run the fight', true]);
            await click(dm, '[data-act=session]');
            is(`${name} ending with a fight on says so`, (await until(dm, `document.querySelector('#cp-ask').open ? document.querySelector('#cp-ask-text').textContent : ''`)).includes('A fight is still running'), true);
            await click(dm, '#cp-ask-yes');
            await until(pl, `!document.querySelector('#cp-sbadge')`);
            is(`${name} still the play order while the fight's on`, await until(pl, order, (v) => v.includes('cp-fight')), 'cp-party,cp-fight');
            is(`${name} ends the fight`, await api('dm', { act: 'fight', id: CAMP, op: 'end', v: 1e9 }).then((s) => s === 200 || s === 409), true);
            const v = (await (await fetch(`${BASE}/campaigns/fight.php?c=${CAMP}`, { headers: { Cookie: 'dndsid=' + SID('dm') } })).json()).fight?.v;
            if (v !== undefined) await api('dm', { act: 'fight', id: CAMP, op: 'end', v });
            is(`${name} dot gone`, await until(pl, `document.querySelector('#cp-fdot').hidden`), true);
            is(`${name} last session is now the live-rolled one`, await until(pl, `document.querySelector('#cp-rhead').textContent.startsWith('Last session: 3')`), true);

            // handouts: the count, the Overview line, opening one
            const made = 1762200000000;
            await fetch(`${BASE}/campaigns/handouts.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'dndsid=' + SID('dm') }, body: J({ c: CAMP, act: 'save', handout: { id: 'hohohohoho1', title: 'Old <map>', text: 'x', updated: made } }) });
            await fetch(`${BASE}/campaigns/handouts.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'dndsid=' + SID('dm') }, body: J({ c: CAMP, act: 'send', id: 'hohohohoho1', to: 'everyone' }) });
            is(`${name} count on the player's pill`, await until(pl, `document.querySelector('#cp-hocount').textContent`, (t) => t === '1'), '1');
            is(`${name} the DM has no count`, await dm.ev(`document.querySelector('#cp-hocount').hidden`), true);
            is(`${name} a line naming it on Overview, escaped`, await until(pl, `document.querySelector('#cp-newho').textContent`), 'New handouts: Old <map>');
            await click(pl, '[data-ho-go]');
            is(`${name} the name opens it on its tab`, [await until(pl, onTab, (t) => t === 'handouts|handouts'), await until(pl, `document.querySelector('.ho-item').open`)], ['handouts|handouts', true]);
            is(`${name} opened: count and line go`, [await until(pl, `document.querySelector('#cp-hocount').hidden`), await pl.ev(`document.querySelector('#cp-newho').hidden`)], [true, true]);

            // pinned notes
            await fetch(`${BASE}/campaigns/handouts.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'dndsid=' + SID('dm') }, body: J({ c: CAMP, act: 'note', note: { id: 'nonononono1', title: 'Baron', group: '', body: 'secret', pinned: true, archived: 0, updated: made } }) });
            await go(dm, page);
            is(`${name} pinned note on Overview`, await until(dm, `document.querySelector('#cp-pins a')?.textContent || ''`), 'Baron');
            await click(dm, '#cp-pins a');
            is(`${name} its title opens it on Notes`, [await until(dm, onTab, (t) => t === 'notes|notes'), await until(dm, `document.querySelector('#dm-nedit [data-nf=title]')?.value`)], ['notes|notes', 'Baron']);
            await go(pl, page);
            is(`${name} players never get the note`, await pl.ev(`document.documentElement.outerHTML.includes('Baron')`), false);

            // the map: everyone gets it once the DM displays it
            const mapId = 'aaaaaaaaaaaa', mapDir = join(ACCOUNTS, 'campaigns', CAMP, 'maps'), grid = { s: 50, ox: 0, oy: 0 }, stored = { id: mapId, name: 'Cave', created: 1, by: '111', archived: 0, ext: 'png', w: 400, h: 300, ww: 400, wh: 300, grid, draft: '0'.repeat(48), sent: null, tokens: {} };
            mkdirSync(join(mapDir, mapId), { recursive: true });
            writeFileSync(join(mapDir, mapId, 'map.json'), J(stored));
            writeFileSync(join(mapDir, 'table.json'), J({ active: mapId }));
            await go(dm, page); await go(pl, page);
            is(`${name} DM: the map on the table, not the line`, [await until(dm, seen('#cp-map .mp-view')), await dm.ev(seen('#cp-nomap'))], [true, false]);
            is(`${name} player: the map once it's displayed`, await until(pl, seen('#cp-map .mp-view')), true);
            is(`${name} it's fitted to its box`, await until(pl, `document.querySelector('#cp-map .mp-stage')?.style.transform || ''`, (t) => t.includes('scale')).then((t) => t.includes('scale')), true);
            await pl.shot(375, 800); await click(pl, '#cp-tabs [data-tab=overview]');
            is(`${name} phone: map about 70% of the height, 2 tiles a row`, [await pl.ev(`Math.abs(document.querySelector('#cp-map .mp-view').offsetHeight - innerHeight * 0.7) <= 2`), await pl.ev(`getComputedStyle(document.querySelector('.ch-tiles')).gridTemplateColumns.split(' ').length`)], [true, 2]);
            is(`${name} phone: pills 44 px tall`, await pl.ev(`document.querySelector('#cp-tabs a').offsetHeight`), 44);
            await pl.shot(1280, 800); await click(pl, '#cp-tabs [data-tab=overview]');
            is(`${name} desktop: the map fills the screen under its heading`, await pl.ev(`Math.abs(document.querySelector('#cp-map .mp-view').offsetHeight - (innerHeight - 150)) <= 2`), true);
            // leaving and coming back keeps the map
            await click(pl, '#cp-tabs [data-tab=rolls]'); await click(pl, '#cp-tabs [data-tab=overview]');
            is(`${name} back on Overview: still there`, await pl.ev(seen('#cp-map .mp-view')), true);

            // a co-DM made a player again while on Notes lands on Overview
            await go(co, page + '#notes');
            await until(co, onTab, (t) => t === 'notes|notes');
            is(`${name} co-DM demoted`, await api('dm', { act: 'codm', id: CAMP, member: '222', on: false }), 200);
            is(`${name} ... moved off the tab they can't have`, await until(co, `window.UI && document.querySelector('#main').dataset.role === 'player' ? ${onTab} : ''`, (t) => t === 'overview|overview', 8000), 'overview|overview');
            await api('dm', { act: 'codm', id: CAMP, member: '222', on: true });

            // no sideways scroll at any width, on every tab
            for (const [b, who] of [[dm, 'DM'], [pl, 'player']]) {
                for (const w of [320, 375, 768, 1280, 2560]) {
                    await b.shot(w, 800);
                    for (const t of ['rolls', 'handouts', 'campaign', 'overview']) {
                        await click(b, `#cp-tabs [data-tab=${t}]`);
                        const over = await b.ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
                        if (over > 1) { bad++; console.log(`FAIL ${name} ${who} ${t} at ${w}: ${over} px sideways: ` + await b.ev(`[...document.querySelectorAll('main *, header *, footer *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + e.className + '#' + e.id).join(' ')`)); }
                    }
                }
            }

            for (const [b, who] of all) { const errs = b.errors.filter((e) => !/prefs\.php|WebSocket|maps\.php|handouts\.php.*notes=1|403 \(Forbidden\).*handouts\.php/.test(e) && !e.includes(String(RELAY))); is(`${name} no console errors (${who})`, errs, []); }
        } finally { dm.close(); co.close(); pl.close(); }

        // the first-time states, each in a browser of its own
        const b = await launch(name);
        try {
            await go(b, BASE + '/privacy/');
            await b.ev(`document.cookie = 'dndsid=${SID('dm')}; path=/'`);
            await go(b, `${BASE}/campaigns/feed0000000b`);
            is(`${name} new campaign: a line to the invite`, await b.ev(`document.querySelector('#cp-party .note a').getAttribute('href')`), '#campaign');
            is(`${name} no session ever: no Last played`, await b.ev(`document.querySelector('#cp-last').hidden`), true);
            is(`${name} no session ever: the DM's words`, await until(b, `document.querySelector('#cp-log .cp-empty')?.textContent`), 'No sessions yet. Rolls show here once you start a session.');
            await b.ev(`document.cookie = 'dndsid=${SID('no')}; path=/'`);
            await go(b, `${BASE}/campaigns/feed0000000a`);
            is(`${name} no session ever: the player's words`, await until(b, `document.querySelector('#cp-log .cp-empty')?.textContent`), 'No sessions yet.');
            is(`${name} no characters: the primary button, and the way to make one`, [await b.ev(`document.querySelector('[data-act=chars]').classList.contains('primary')`), await b.ev(`document.querySelector('#cp-chardlg a').getAttribute('href')`)], [true, '/characters/build']);
            await go(b, `${BASE}/campaigns/feed0000000c`);
            is(`${name} not found: no id in the breadcrumb`, await b.ev(`document.querySelector('.crumbs [aria-current]').textContent + document.documentElement.outerHTML.includes('Feed0000000c')`), 'Not foundfalse');
        } finally { b.close(); }
    }
} finally { relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'campaign tabs ok');
process.exit(bad ? 1 : 0);
