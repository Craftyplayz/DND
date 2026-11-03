// Checks DM notes and handouts (ROADMAP 3.4) end to end in headless Chrome and Firefox, with the real relay (live/relay.js)
// in front of a local PHP server. The DM (Dee) writes a note that survives a reload, makes a handout with a picture and sends
// it to Pat only. Pat's sheet gets a Handouts panel and a live "New handout" toast; Sam (another player) never sees it, live
// or after reloading. Pat's New mark follows the account to a second browser; opening it there clears it here. An edit
// shows "Updated" live, an unshare takes it away live, and with the relay stopped the 10 s check still catches up.
//   node _dev/scripts/handouts-page.mjs      (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), SHIFT = +process.env.CHECK_PORT_SHIFT || 0, WEB = 8124 + SHIFT, RELAY = 8093 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-handouts-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'hocheckdm00000000000000000000000', pat: 'hocheckpat0000000000000000000000', sam: 'hochecksam0000000000000000000000' };
const CAMP = 'beef00000001';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function setup() {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat'], ['sam', '333', 'Sam']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
    for (const [id, owner, name] of [['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy']]) {
        mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner, visibility: 'private', created: 1, campaigns: [] }));
        writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify({ id, name, race: 'Human', updated: 5, art: '', classes: [{ name: 'Rogue', level: 3, die: 8, hdUsed: 0 }], abilities: [] }));
    }
    mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Handout Test', dm: '111', code: 'abcdefabcf', created: 1, members: [
        { sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [{ sheet: 'player', id: 'lock' }] },
        { sub: '333', name: 'Sam', joined: 3, characters: [{ sheet: 'player', id: 'ozzy' }] }] }));
}

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`); };
async function until(b, expr, ok, ms = 5000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await b.ev(expr); if (ok(v)) return v; await sleep(150); } return v; }
const go = async (b, url) => { await b.go(url); for (let i = 0; i < 80 && !(await b.ev(`document.readyState === 'complete' && !!document.querySelector('main')`)); i++) await sleep(100); };
const as = async (b, sid) => { await go(b, BASE + '/privacy/'); await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); document.cookie = 'dndsid=${sid}; path=/'`); };
// type into a field the way a player does: the value, then an input event that bubbles to the page's listeners
const type = (b, sel, v) => b.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const click = (b, sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)}).click(), 1)`);
const items = `JSON.stringify([...document.querySelectorAll('.ho-item')].map((d) => d.querySelector('.ho-t b').textContent + (d.querySelector('.ho-mark') ? ' [' + d.querySelector('.ho-mark').textContent + ']' : '')))`;
const toast = `[...document.querySelectorAll('.ho-toast span')].map((s) => s.textContent).join('|')`;
const fetchAs = (sid, q) => fetch(`${BASE}/campaigns/handouts.php?c=${CAMP}${q}`, { headers: { Cookie: 'dndsid=' + sid } });

const web = spawn(PHP, ['-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore',
    env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
let relay = null;
const startRelay = () => { relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } }); };
try {
    await serving(BASE + '/privacy/');
    for (const name of browsers) {
        setup();
        startRelay();
        await serving(`http://127.0.0.1:${RELAY}/health`);
        const dm = await launch(name), pat = await launch(name), sam = await launch(name);
        const all = [dm, pat, sam];
        try {
            for (const b of all) await b.block(/backup\.php|prefs\.php/);
            await as(dm, SID.dm); await as(pat, SID.pat); await as(sam, SID.sam);

            // DM notes: autosave, kept in the browser and the account, there after a reload
            await go(dm, `${BASE}/campaigns/${CAMP}`);
            is(`${name} DM has Notes and Handouts`, await dm.ev(`!!document.querySelector('#dm-notes') && !!document.querySelector('#dm-ho')`), true);
            await click(dm, '[data-dm=nnew]');
            await type(dm, '#dm-nedit [data-nf=title]', 'Villain');
            await type(dm, '#dm-nedit [data-nf=body]', 'The baron is the dragon.');
            is(`${name} note autosaves`, await until(dm, `document.querySelector('#dm-nstate')?.textContent`, (v) => v === 'Saved'), 'Saved');
            is(`${name} note in this browser too`, await dm.ev(`Object.values(JSON.parse(localStorage.getItem('campaign-dm'))['${CAMP}'].notes)[0].body`), 'The baron is the dragon.');
            await go(dm, `${BASE}/campaigns/${CAMP}`);
            await dm.ev(`localStorage.removeItem('campaign-dm')`); // the account's copy alone, as on a new device
            await go(dm, `${BASE}/campaigns/${CAMP}`);
            await click(dm, '#dm-nlist [data-dm=nopen]');
            is(`${name} note survives a reload (from the account)`, await dm.ev(`document.querySelector('#dm-nedit [data-nf=body]').value`), 'The baron is the dragon.');
            is(`${name} players never get notes`, (await fetchAs(SID.pat, '&notes=1')).status, 403);
            errsOk(name, dm, 'DM page');

            // Pat's sheet: the Handouts panel appears the first time the character is in a campaign; Sam's campaign page
            await go(pat, `${BASE}/characters/lock`);
            is(`${name} sheet gets a Handouts panel`, await until(pat, `[...document.querySelectorAll('.hb-tabs button')].some((b) => b.textContent === 'Handouts')`, Boolean), true);
            is(`${name} panel saved with the character`, await pat.ev(`(() => { const c = JSON.parse(localStorage.getItem('hb-sheet')).chars.lock; return JSON.stringify([c.hoPanel, c.panels.filter((p) => p.type === 'handouts').length]); })()`), '[true,1]');
            await pat.ev(`[...document.querySelectorAll('.hb-tabs button')].find((b) => b.textContent === 'Handouts').click()`);
            is(`${name} empty panel says so`, await until(pat, `document.querySelector('#hb-ho')?.textContent.trim()`, (v) => v?.startsWith('No handouts')), 'No handouts yet. They show up here when the DM sends you one.');
            await go(sam, `${BASE}/campaigns/${CAMP}`);
            is(`${name} players have no Notes section`, await sam.ev(`!document.querySelector('#dm-notes') && !!document.querySelector('#cp-ho')`), true);
            await sleep(1000); // sockets in

            // the DM makes a handout with a picture and sends it to Pat only
            await click(dm, '[data-dm=hnew]');
            await type(dm, '#dm-hedit [data-hf=title]', 'Secret map');
            await type(dm, '#dm-hedit [data-hf=text]', 'Line one\nLine two');
            await dm.ev(`(() => { const bin = atob('${PNG}'), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                const dt = new DataTransfer(); dt.items.add(new File([u], 'map.png', { type: 'image/png' }));
                const inp = document.querySelector('[data-dm-file]'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
            is(`${name} picture uploads`, await until(dm, `document.querySelectorAll('#dm-hedit .dm-pic').length`, (v) => v === 1), 1);
            is(`${name} a draft until sent`, await until(dm, `document.querySelector('#dm-hstate')?.textContent`, (v) => v?.startsWith('Draft')), 'Draft: only you and co-DMs see it.');
            await click(dm, '#dm-hedit [data-to=everyone]'); // everyone off: each player's box can be picked
            await click(dm, '#dm-hedit [data-to="333"]'); // Sam off, Pat stays
            await click(dm, '[data-dm=hsend]');
            is(`${name} sent to Pat`, (await until(dm, `document.querySelector('#dm-hstate')?.textContent`, (v) => v?.startsWith('Sent')))?.startsWith('Sent to Pat on '), true);

            // Pat: a live toast and the New mark; Sam: nothing
            is(`${name} Pat gets a live toast`, await until(pat, toast, (v) => v.includes('New handout: Secret map'), 3000), 'New handout: Secret map');
            is(`${name} Pat's panel shows it as New`, await until(pat, items, (v) => v !== '[]'), JSON.stringify(['Secret map [New]']));
            await sleep(1500);
            is(`${name} Sam sees nothing live`, [await sam.ev(items), await sam.ev(toast)], ['[]', '']);
            await go(sam, `${BASE}/campaigns/${CAMP}`);
            is(`${name} Sam sees nothing after a reload`, await sam.ev(items), '[]');
            const samList = await (await fetchAs(SID.sam, '')).json();
            is(`${name} the server gives Sam nothing`, samList.handouts, []);

            // the New mark follows Pat's account to a second browser, and opening it there clears it on the sheet
            const pat2 = await launch(name);
            all.push(pat2);
            await pat2.block(/backup\.php|prefs\.php/);
            await as(pat2, SID.pat);
            await go(pat2, `${BASE}/campaigns/${CAMP}`);
            is(`${name} second browser: New`, await pat2.ev(items), JSON.stringify(['Secret map [New]']));
            await click(pat2, '.ho-item summary');
            is(`${name} text keeps its line breaks`, await pat2.ev(`document.querySelector('.ho-text').textContent`), 'Line one\nLine two');
            await click(pat2, '.ho-img');
            is(`${name} picture opens in a dialog with Download`, await until(pat2, `document.querySelector('#ho-dlg')?.open && document.querySelector('#ho-dlg a').getAttribute('download')`, Boolean), 'map.png');
            is(`${name} the picture loads for Pat`, await until(pat2, `document.querySelector('#ho-dlg img').naturalWidth`, (v) => v === 1), 1);
            const imgUrl = await pat2.ev(`document.querySelector('#ho-dlg a').href`);
            const imgRes = await fetch(imgUrl, { headers: { Cookie: 'dndsid=' + SID.pat } });
            is(`${name} picture served as png with nosniff`, [imgRes.status, imgRes.headers.get('content-type'), imgRes.headers.get('x-content-type-options')], [200, 'image/png', 'nosniff']);
            is(`${name} Sam can't get the picture`, (await fetch(imgUrl, { headers: { Cookie: 'dndsid=' + SID.sam } })).status, 404);
            await pat2.ev(`document.querySelector('#ho-dlg').close()`);
            await sleep(500);
            await go(pat, `${BASE}/characters/lock`);
            is(`${name} opened elsewhere: not New on the sheet`, await until(pat, items, (v) => v === JSON.stringify(['Secret map'])), JSON.stringify(['Secret map']));

            // an edit shows Updated live; unshare takes it away live (after the freshly loaded sheet's relay socket is open)
            await sleep(1500);
            await type(dm, '#dm-hedit [data-hf=text]', 'Line one\nLine two\nLine three');
            is(`${name} edit shows Updated live`, await until(pat, items, (v) => v.includes('Updated')), JSON.stringify(['Secret map [Updated]']));
            await sleep(500);
            await click(dm, '[data-dm=hunshare]');
            is(`${name} unshare: gone live`, await until(pat, items, (v) => v === '[]'), '[]');

            // relay down: sending again still reaches Pat through the 10 s check, and Sam still gets nothing
            relay.kill();
            is(`${name} paused on the campaign page`, await until(pat2, `!document.querySelector('#cp-paused').hidden`, Boolean), true);
            await click(dm, '[data-dm=hsend]');
            // (not Updated: it was open on this page when it changed, so it counts as read)
            is(`${name} after reconnecting / polling: back for Pat`, await until(pat2, items, (v) => v !== '[]', 13000), JSON.stringify(['Secret map']));
            startRelay();
            await serving(`http://127.0.0.1:${RELAY}/health`);
            is(`${name} relay back`, await until(pat2, `document.querySelector('#cp-paused').hidden`, Boolean, 13000), true);
            await go(sam, `${BASE}/campaigns/${CAMP}`);
            is(`${name} Sam still sees nothing`, await sam.ev(items), '[]');

            // archive: gone for Pat, kept under Archived for the DM
            await click(dm, '[data-dm=harc]');
            is(`${name} archived: gone for Pat`, await until(pat2, items, (v) => v === '[]'), '[]');
            is(`${name} archived: under Archived (1)`, await until(dm, `document.querySelector('#dm-harch summary')?.textContent`, Boolean), 'Archived (1)');
            for (const [b, who] of [[dm, 'DM'], [pat, 'Pat sheet'], [pat2, 'Pat campaign'], [sam, 'Sam']]) errsOk(name, b, who);
        } finally { for (const b of all) b.close(); relay.kill(); }
    }
} finally { web.kill(); relay?.kill(); rmSync(TMP, { recursive: true, force: true }); }

function errsOk(name, b, who) {
    const errs = b.errors.filter((e) => !/WebSocket|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED|backup\.php|prefs\.php|net::ERR_FAILED/.test(e) && !e.includes(String(RELAY)));
    is(`${name} no console errors (${who})`, errs, []);
}
console.log(bad ? `${bad} check(s) failed` : 'handouts page ok');
process.exit(bad ? 1 : 0);
