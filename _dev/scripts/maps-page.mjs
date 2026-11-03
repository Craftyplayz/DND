// Checks the battle map (ROADMAP 1.6) end to end, with the real relay in front of a local PHP server (GD loaded). Dee (the DM)
// uploads a map in 4 MB chunks, fits the grid, reveals a room as a draft, sends it and runs the fight from the map page;
// Pat plays Lock on a phone-sized screen. Browser A is Chrome (Firefox with --firefox), browser B the other one.
//   node _dev/scripts/maps-page.mjs [--firefox]   (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, serving } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8127 + SHIFT, RELAY = 8101 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-maps-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'mapcheckdm00000000000000000000000x', pat: 'mapcheckpat0000000000000000000000x', sam: 'mapchecksam0000000000000000000000x' };
const CAMP = 'aaa000000001';
const FF = process.argv.includes('--firefox');

rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat'], ['sam', '333', 'Sam']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
for (const [id, owner, name] of [['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy']]) {
    mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner, visibility: 'private', created: 1, campaigns: [] }));
    writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify({ id, name, race: 'Human', updated: 5, art: '', view: { noAnim: true }, hp: { cur: 21, base: 21, temp: 0, mod: 0 }, classes: [{ name: 'Rogue', level: 3, die: 8, hdUsed: 0 }], abilities: [] }));
}
mkdirSync(join(ACCOUNTS, 'monsters', '111'), { recursive: true });
const ABIL = (dex) => [['STR', 10], ['DEX', dex], ['CON', 10], ['INT', 10], ['WIS', 10], ['CHA', 10]].map(([key, score]) => ({ key, name: key, score, save: false, sb: '' }));
for (const [id, name, race, dex, ac] of [['gob', 'Goblin', 'Small humanoid (goblinoid)', 14, '15'], ['ogre', 'Ogre', 'Large giant', 8, '11']])
    writeFileSync(join(ACCOUNTS, 'monsters', '111', id + '.json'), JSON.stringify({ id, name, race, updated: 5, cr: '1', abilities: ABIL(dex), ac, init: 'DEX', hp: { cur: 7, base: 7, temp: 0, mod: 0 } }));
mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Map Test', dm: '111', code: 'aaaaaaaaaa', created: 1, members: [
    { sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [{ sheet: 'player', id: 'lock' }] }, { sub: '333', name: 'Sam', joined: 3, characters: [{ sheet: 'player', id: 'ozzy' }] }] }));

// GD with WebP is in the site's image; a local Windows PHP may have it only as a DLL php.ini doesn't load
const gd = process.platform === 'win32' ? ['-d', 'extension=gd'] : [];
const web = spawn(PHP, [...gd, '-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore',
    env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });
await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`);

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`); };
async function until(b, expr, ok, ms = 8000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await b.ev(expr); if (ok(v)) return v; await sleep(150); } return v; }
const api = (sid, body) => fetch(`${BASE}/campaigns/api.php`, { method: 'POST', headers: { Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const mapsApi = (sid, body) => fetch(`${BASE}/campaigns/maps.php`, { method: 'POST', headers: { Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' }, body: JSON.stringify({ c: CAMP, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const viewAs = (sid) => fetch(`${BASE}/campaigns/maps.php?c=${CAMP}`, { headers: { Cookie: 'dndsid=' + sid } }).then((r) => r.text());
const fight = (sid) => fetch(`${BASE}/campaigns/fight.php?c=${CAMP}`, { headers: { Cookie: 'dndsid=' + sid } }).then((r) => r.json()).then((j) => j.fight);
const mapDir = () => join(ACCOUNTS, 'campaigns', CAMP, 'maps', readdirSync(join(ACCOUNTS, 'campaigns', CAMP, 'maps')).find((d) => /^[a-f0-9]{12}$/.test(d)));
const mapJson = () => JSON.parse(readFileSync(join(mapDir(), 'map.json'), 'utf8'));
const go = async (b, url) => { await b.go(url); for (let i = 0; i < 80 && !(await b.ev(`document.readyState === 'complete' && !!document.querySelector('main')`)); i++) await sleep(100); await b.ev(HELP); };
const signIn = async (b, sid) => { await b.go(BASE + '/privacy/'); await b.ev(`localStorage.clear(); document.cookie = 'dndsid=${sid}; path=/'`); };
const text = (sel) => `document.querySelector('${sel}')?.textContent.replace(/\\s+/g, ' ').trim() || ''`;
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(\`${sel}\`); if (!e) return false; e.click(); return true; })()`);
// pointer events at map pixels (x, y), on an element (default: the view)
const HELP = `window.__pt = (x, y) => { const s = document.querySelector('.mp-stage'), r = s.getBoundingClientRect(), k = r.width / parseFloat(s.style.width); return [r.left + x * k, r.top + y * k]; };
    window.__ptr = (type, x, y, o = {}) => { const [cx, cy] = __pt(x, y), el = o.el ? document.querySelector(o.el) : document.querySelector('[data-mp=view]');
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: o.id || 1, pointerType: o.type || 'mouse', button: o.button || 0, buttons: 1, isPrimary: !o.id || o.id === 1 })); }; 1`;
const drag = async (b, pts, o = {}) => {
    await b.ev(`__ptr('pointerdown', ${pts[0][0]}, ${pts[0][1]}, ${JSON.stringify(o)})`);
    for (const p of pts.slice(1)) { await b.ev(`__ptr('pointermove', ${p[0]}, ${p[1]}, ${JSON.stringify({ ...o, el: null })})`); await sleep(o.pause || 30); }
    if (!o.hold) await b.ev(`__ptr('pointerup', ${pts.at(-1)[0]}, ${pts.at(-1)[1]}, ${JSON.stringify({ ...o, el: null })})`);
};
const inFight = (name) => `[...document.querySelectorAll('[data-mp=fight] .fi-e')].some((li) => li.textContent.includes('${name}'))`;
const tokOf = (name) => `[...document.querySelectorAll('.mp-tok')].find((e) => e.getAttribute('aria-label').startsWith('${name}'))`;

const dm = await launch(FF ? 'firefox' : 'chrome'), pat = await launch(FF ? 'chrome' : 'firefox');
try {
    for (const b of [pat, dm]) await b.block(/backup\.php|prefs\.php/);
    await signIn(dm, SID.dm);
    await signIn(pat, SID.pat);
    is('a non-member gets no map page', (await fetch(`${BASE}/campaigns/${CAMP}/map`)).status, 404);
    await go(dm, `${BASE}/campaigns/${CAMP}/map`);
    is('DM: nothing yet', (await until(dm, text('.mp-msg'), (t) => t.includes('Upload'))).includes('Upload a map picture'), true);

    // upload: a noisy 1600 x 1200 PNG (more than one 4 MB chunk), made in the page; a text file first, refused
    await dm.ev(`(() => { const i = document.querySelector('[data-mp=file]'), dt = new DataTransfer(); dt.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' })); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    is('a text file is refused with a message', (await until(dm, text('[data-mp=upstate]'), (t) => t.includes("isn't"))).includes('JPG, PNG, WebP or GIF'), true);
    const size = await dm.ev(`new Promise((done) => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d'), d = x.createImageData(1600, 1200);
        for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = 200; d.data[i + 3] = 255; }
        x.putImageData(d, 0, 0); c.toBlob((b) => { const i = document.querySelector('[data-mp=file]'), dt = new DataTransfer(); dt.items.add(new File([b], 'Crypt.png', { type: 'image/png' })); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); done(b.size); }, 'image/png'); })`);
    is('the picture is over 4 MB', size > 4 * 1024 * 1024, true);
    is('uploaded: the map opens on the grid tool', (await until(dm, text('.mp-title'), (t) => t === 'Crypt', 30000)), 'Crypt');
    const tableJson = join(ACCOUNTS, 'campaigns', CAMP, 'maps', 'table.json');
    is('the original kept exactly as uploaded, not put on the table by itself', [readFileSync(join(mapDir(), 'original.png')).length, existsSync(tableJson) && readFileSync(tableJson, 'utf8').includes(mapJson().id)], [size, false]);
    await until(dm, `!!document.querySelector('[data-mpa=activate]')`, Boolean);
    await click(dm, '[data-mpa=activate]');
    is('Put on the table: the map list shows it on the table', (await until(dm, text('[data-mp=maps]'), (t) => t.includes('On the table'))).includes('Crypt'), true);

    // grid: a box dragged over one square (100 px); the whole grid follows
    await until(dm, `!!document.querySelector('.mp-grid.mp-fit')`, Boolean);
    await drag(dm, [[0, 0], [50, 50], [100, 100]]);
    // (the page rounds synthetic pointer positions to whole screen pixels, a few map pixels at this zoom)
    const g0 = await until(dm, '1', () => Math.abs(mapJson().grid.s - 100) < 4, 5000).then(() => mapJson().grid);
    is('grid fitted from one square', [Math.abs(g0.s - 100) < 4, Math.min(g0.ox, 100 - g0.ox) < 6, Math.min(g0.oy, 100 - g0.oy) < 6], [true, true, true]);
    // exact, so the squares below are known; the size field takes typed numbers
    await mapsApi(SID.dm, { op: 'grid', m: mapJson().id, s: 100, ox: 0, oy: 0 });
    await dm.ev(`document.querySelector('[data-mpa=tool][data-v=move]').click(); 1`);
    await sleep(300);
    await dm.ev(`document.querySelector('[data-mpa=tool][data-v=grid]').click(); 1`);
    // arrow keys nudge it
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); 1`);
    is('arrow key nudges the grid', await until(dm, '1', () => mapJson().grid.ox === 1, 5000).then(() => mapJson().grid.ox), 1);
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); 1`);
    await until(dm, '1', () => mapJson().grid.ox === 0, 5000);

    // Pat opens the map on a phone-sized screen: on the table, never sent, so all black with the party
    await pat.shot(390, 844);
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    is('player: never sent, an all-black map', await until(pat, `!document.querySelector('.mp-black').hidden && document.querySelector('.mp-img').hidden`, Boolean), true);
    is("player: Lock waits in Pat's tray", (await until(pat, text('[data-mp=tray]'), (t) => t.includes('Lock'))).includes('Ozzy'), false);

    // fog: a revealed room (4 x 3 squares) as a draft; players still see full fog
    await click(dm, '[data-mpa=tool][data-v=fog]');
    await click(dm, '[data-mpa=brush][data-v=rect]');
    await drag(dm, [[10, 10], [200, 200], [390, 290]]);
    const room = (fog) => [...'111100000000'.repeat(3)].every((ch, i) => fog[Math.floor(i / 12) * 16 + (i % 12)] === ch);
    is('draft saved about a second after the stroke', await until(dm, text('.mp-save'), (t) => t.startsWith('Draft saved'), 5000).then(() => room(mapJson().draft)), true);
    is('a draft is not sent: players still get no picture', JSON.parse(await viewAs(SID.pat)).map.sent, null);
    is('DM: changed squares outlined, players unchanged', await dm.ev(`!document.querySelector('.mp-marks').hidden`), true);
    // send: players now see the room, live
    await click(dm, '[data-mpa=send]');
    is('sent: the player gets the masked copy live', await until(pat, `document.querySelector('.mp-img').getAttribute('src') || ''`, (s) => s.includes('img=public&n=1'), 10000).then((s) => s.includes('img=public&n=1')), true);
    is('the picture really loads for the player', await until(pat, `document.querySelector('.mp-img').naturalWidth`, (w) => w > 0), 1600);
    // more drawn in the draft, not sent: the player keeps the first send
    await click(dm, '[data-mpa=brush][data-v=brush]');
    await drag(dm, [[650, 50], [750, 50]]);
    await until(dm, text('.mp-save'), (t) => t.startsWith('Draft saved'), 5000);
    is('player sees only what was sent', JSON.parse(await viewAs(SID.pat)).map.sent.fog.split('1').length - 1, 12);
    // Undo takes the brush stroke back out of the draft
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); 1`);
    is('Ctrl+Z undoes the stroke', await until(dm, '1', () => mapJson().draft.split('1').length - 1 === 12, 5000).then(() => mapJson().draft.split('1').length - 1), 12);
    // "What players see": the DM gets the players' copy
    await click(dm, '[data-mpa=preview]');
    is('What players see: the masked copy', await until(dm, `document.querySelector('.mp-img').getAttribute('src')`, (s) => s.includes('img=public')).then((s) => s.includes('img=public')), true);
    await click(dm, '[data-mpa=preview]');
    await click(dm, '[data-mpa=tool][data-v=move]');

    // Pat places Lock from the tray (a tap puts it mid-view) and drags it with a finger to square (1, 1)
    await click(pat, '[data-mp=tray] .mp-trayt');
    await pat.ev(`(() => { const b = document.querySelector('[data-mp=tray] .mp-trayt'); if (!b) return 0; const r = b.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, pointerId: 7, pointerType: 'touch', isPrimary: true };
        b.dispatchEvent(new PointerEvent('pointerdown', o)); dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
    is('Lock is on the map', await until(pat, `!!${tokOf('Lock')}`, Boolean), true);
    await pat.ev(`${tokOf('Lock')}.id = 'lock-tok'; 1`);
    await until(pat, '1', () => Object.values(mapJson().tokens).some((t) => t.char === 'lock' && t.placed), 5000);
    const lk = mapJson().tokens;
    const lockKey = Object.keys(lk).find((k) => lk[k].char === 'lock');
    const at = lk[lockKey];
    await drag(pat, [[at.x + 50, at.y + 50], [at.x + 20, at.y + 20], [160, 160], [150, 150]], { el: '#lock-tok', type: 'touch', id: 3 });
    is('phone: Lock moved by touch, snapped to a whole square', await until(pat, '1', () => mapJson().tokens[lockKey].x === 100, 5000).then(() => [mapJson().tokens[lockKey].x, mapJson().tokens[lockKey].y]), [100, 100]);
    is('the DM sees Lock there live', await until(dm, `(${tokOf('Lock')})?.style.left`, (v) => v === '100px'), '100px');
    // Pat can't move Sam's Ozzy: the DM puts Ozzy at (200, 0); Pat's drag on it only pans
    const dmToks = JSON.parse(await viewAs(SID.dm)).map.tokens;
    const oz = dmToks.find((t) => t.name === 'Ozzy');
    is('the DM moves any token', (await mapsApi(SID.dm, { op: 'move', m: mapJson().id, k: oz.k, x: 200, y: 0, placed: true })).status, 200);
    await until(pat, `!!${tokOf('Ozzy')}`, Boolean);
    is("Ozzy isn't Pat's to move", await pat.ev(`${tokOf('Ozzy')}.classList.contains('can')`), false);
    await pat.ev(`${tokOf('Ozzy')}.id = 'oz-tok'; 1`);
    await drag(pat, [[250, 50], [300, 100], [350, 150]], { el: '#oz-tok', type: 'touch', id: 4 });
    await sleep(500);
    is("Pat's drag left Ozzy where it was", [mapJson().tokens[oz.k].x, mapJson().tokens[oz.k].y], [200, 0]);
    is("the server refuses Pat moving Ozzy", (await mapsApi(SID.pat, { op: 'move', m: mapJson().id, k: oz.k, x: 0, y: 0, placed: true })).status, 403);

    // the fight, run from the map page: start, add the goblin and the ogre from the DM's monsters
    await until(dm, `!!document.querySelector('[data-mp=fight] [data-fi=start]')`, Boolean);
    await click(dm, '[data-mp=fight] [data-fi=start]');
    await until(dm, `!!document.querySelector('[data-mp=fightadd] select')`, Boolean);
    await dm.ev(`(() => { const s = document.querySelector('[data-mp=fightadd] select'); s.value = 'gob'; document.querySelector('[data-mpa=fightadd]').click(); return 1; })()`);
    is('map page: goblin added to the fight', await until(dm, inFight('Goblin'), Boolean), true);
    await until(dm, `!!document.querySelector('[data-mp=fightadd] select option[value=ogre]')`, Boolean);
    await dm.ev(`(() => { const s = document.querySelector('[data-mp=fightadd] select'); s.value = 'ogre'; document.querySelector('[data-mpa=fightadd]').click(); return 1; })()`);
    await until(dm, inFight('Ogre'), Boolean);
    const f1 = await fight(SID.dm);
    is('initiative bonus and AC worked out like the Monster Sheet', [f1.entries.find((e) => e.mon === 'gob').bonus, f1.entries.find((e) => e.mon === 'gob').ac, f1.entries.find((e) => e.mon === 'ogre').bonus], [2, 15, -1]);
    is('their tokens wait in the tray, sized from the creature type', await until(dm, text('[data-mp=tray]'), (t) => t.includes('Goblin') && t.includes('Ogre')).then(() => {
        const t = Object.values(mapJson().tokens); return [t.find((x) => x.mon === 'gob')?.size, t.find((x) => x.mon === 'ogre')?.size]; }), ['S', 'L']);
    // hide the ogre from the fight panel, then place both (a tap on the tray puts them mid-view, in the fog)
    await dm.ev(`[...document.querySelectorAll('[data-mp=fight] .fi-e')].find((li) => li.textContent.includes('Ogre')).querySelector('[data-fi=hide]').click(); 1`);
    await until(dm, `!!document.querySelector('[data-mp=fight] .fi-e.hid')`, Boolean);
    for (const n of ['Goblin', 'Ogre']) {
        await dm.ev(`(() => { const b = [...document.querySelectorAll('[data-mp=tray] .mp-trayt')].find((x) => x.textContent.includes('${n}')); const r = b.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, pointerId: 9, pointerType: 'mouse', isPrimary: true };
            b.dispatchEvent(new PointerEvent('pointerdown', o)); dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
        await until(dm, `!!${tokOf(n)}`, Boolean);
    }
    // the hidden ogre into the revealed room: never sent to Pat
    await dm.ev(`${tokOf('Ogre')}.id = 'ogre-tok'; ${tokOf('Goblin')}.id = 'gob-tok'; 1`);
    const og = Object.values(mapJson().tokens).find((x) => x.mon === 'ogre');
    await drag(dm, [[og.x + 10, og.y + 10], [300, 200], [210, 10]], { el: '#ogre-tok' });
    await until(dm, '1', () => Object.values(mapJson().tokens).find((x) => x.mon === 'ogre').x === 200, 5000);
    // live drag: the goblin goes from the fog into the room while Pat watches; Pat sees it before it's dropped
    const gb = Object.values(mapJson().tokens).find((x) => x.mon === 'gob');
    await drag(dm, [[gb.x + 10, gb.y + 10], [500, 400], [310, 110]], { el: '#gob-tok', hold: true, pause: 300 });
    is('live: Pat sees the goblin mid-drag', await until(pat, `(${tokOf('Goblin')})?.style.left || ''`, (v) => v === '300px', 8000), '300px');
    await dm.ev(`__ptr('pointermove', 10, 110); 1`); await sleep(400);
    is('live: the next drag step reaches Pat too', await until(pat, `(${tokOf('Goblin')})?.style.left || ''`, (v) => v === '0px', 8000), '0px');
    await dm.ev(`__ptr('pointerup', 10, 110); 1`);
    is('dropped: last drop saved', await until(dm, '1', () => Object.values(mapJson().tokens).find((x) => x.mon === 'gob').x === 0, 5000).then(() => Object.values(mapJson().tokens).find((x) => x.mon === 'gob').y), 100);
    const pv = await viewAs(SID.pat);
    is('player: no hidden ogre, no original, no draft in the map response', [pv.includes('Ogre'), pv.includes('original'), pv.includes('img=work'), pv.includes('draft')], [false, false, false, false]);
    is('player page: no ogre token', await pat.ev(`!${tokOf('Ogre')} && !document.body.innerHTML.includes('Ogre')`), true);
    // into the fog: the goblin leaves Pat's map
    await drag(dm, [[10, 110], [700, 700]], { el: '#gob-tok' });
    is('a monster moved into the fog leaves the player\'s map', await until(pat, `!${tokOf('Goblin')}`, Boolean), true);
    await drag(dm, [[710, 710], [10, 110]], { el: '#gob-tok' });
    await until(pat, `!!${tokOf('Goblin')}`, Boolean);

    // the ruler, with a corner, seen live by the DM while Pat drags it: 3 squares then 2 = 25 ft
    await pat.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); 1`);
    await drag(pat, [[50, 50], [200, 50], [350, 50]], { id: 11, hold: true, pause: 200 });
    await pat.ev(`__ptr('pointerdown', 350, 50, { button: 2, id: 12 }); 1`);
    await pat.ev(`__ptr('pointermove', 350, 150, { id: 11 }); 1`); await sleep(200);
    await pat.ev(`__ptr('pointermove', 350, 250, { id: 11 }); 1`);
    is('ruler: Pat sees 25 ft', await until(pat, text('.mp-ruler'), (t) => t.includes('25 ft')), '25 ft');
    is('ruler: the DM sees it live with a corner', await until(dm, text('.mp-ruler'), (t) => t.includes('25 ft · Pat')), '25 ft · Pat');
    await pat.ev(`__ptr('pointerup', 350, 250, { id: 11 }); 1`);
    is('released: the ruler goes for everyone', await until(dm, text('.mp-ruler'), (t) => t === ''), '');

    // turns: Lock rolls in, round 1, Next until it's Lock's go; Pat's map shows the notice and the ring
    const n = (await fight(SID.pat)).n;
    await api(SID.pat, { act: 'roll', id: CAMP, roll: { id: 'patroll000001', char: 'lock', title: 'Initiative', expr: '1d20 + 2', shown: '1 + 2', total: '3', fight: n } });
    await until(dm, text('[data-mp=fight]'), (t) => t.includes('Lock'));
    await click(dm, '[data-mp=fight] [data-fi=round1]');
    await until(dm, text('[data-mp=fight] .fi-top'), (t) => t.includes('Round 1'));
    let saw = '';
    for (let i = 0; i < 8 && !saw.includes('Your turn'); i++) {
        saw = await until(pat, text('[data-mp=fight]'), (t) => t.includes('Your turn') || t.includes("You're up next"), 2500);
        if (saw.includes("You're up next")) is("Pat: \"You're up next\"", true, true);
        if (!saw.includes('Your turn')) { const was = await dm.ev(text('[data-mp=fight] .fi-e.on')); await click(dm, '[data-mp=fight] [data-fi=next]'); await until(dm, text('[data-mp=fight] .fi-e.on'), (t) => t !== was, 3000); }
    }
    is('Pat: "Your turn" on the map page', saw.includes('Your turn'), true);
    is("a ring on Lock's token", await until(pat, `${tokOf('Lock')}?.classList.contains('on')`, Boolean), true);

    // a grid change after the fog: asked first, the draft starts over, players keep the last send
    await click(dm, '[data-mpa=tool][data-v=grid]');
    await drag(dm, [[0, 0], [25, 25], [50, 50]]);
    is('asked before the grid resets the fog', (await until(dm, text('dialog[open]'), (t) => t.includes('Changing the grid resets the fog'))).includes('Changing the grid resets the fog'), true);
    await click(dm, 'dialog[open] button[value=yes]');
    is('grid changed: draft fully fogged', await until(dm, '1', () => mapJson().grid.s === 50, 5000).then(() => mapJson().draft.includes('1')), false);
    is('players keep the last sent fog and grid', (() => { const s = JSON.parse(readFileSync(join(mapDir(), 'map.json'), 'utf8')).sent; return [s.grid.s, room(s.fog)]; })(), [100, true]);
    await click(dm, '[data-mpa=tool][data-v=move]');

    // the fight ends: monsters back to the tray (positions kept), Lock stays
    await click(dm, '[data-mp=fight] [data-fi=end]');
    await click(dm, '#fi-ask button[value=yes]');
    is('fight over: goblin back in the tray, Lock still placed', await until(dm, '1', () => !Object.values(mapJson().tokens).find((x) => x.mon === 'gob').placed, 8000).then(() => {
        const t = Object.values(mapJson().tokens); return [t.find((x) => x.mon === 'gob').placed, t.find((x) => x.mon === 'gob').x, t.find((x) => x.char === 'lock').placed]; }), [false, 0, true]);
    is("player: the goblin left Pat's map", await until(pat, `!${tokOf('Goblin')}`, Boolean), true);

    // rename and archive from the list; nothing deleted
    await dm.ev(`document.querySelector('[data-mpa=rename]').click(); 1`);
    await until(dm, `!!document.querySelector('dialog[open] input')`, Boolean);
    await dm.ev(`(() => { const i = document.querySelector('dialog[open] input'); i.value = 'Lower crypt'; document.querySelector('dialog[open] button[value=yes]').click(); return 1; })()`);
    is('renamed', await until(dm, text('.mp-title'), (t) => t === 'Lower crypt'), 'Lower crypt');
    await click(dm, '[data-mpa=archive]');
    is('archived: folded away, kept', (await until(dm, text('[data-mp=maps] details summary'), (t) => t.includes('Archived (1)'))), 'Archived (1)');
    is('players: no map on the table', await until(pat, text('.mp-msg'), (t) => t.includes('No map on the table')), 'No map on the table yet.');
    await click(dm, '[data-mpa=unarchive]');
    await until(dm, `!!document.querySelector('[data-mpa=activate]')`, Boolean);
    await click(dm, '[data-mpa=activate]');
    is('back on the table for Pat', await until(pat, `!!document.querySelector('.mp-img:not([hidden])')`, Boolean), true);
    is('every players\' copy kept', readdirSync(mapDir()).filter((f) => f.startsWith('public-')), ['public-1.webp']);

    // the campaign page: a Map section with the map on the table
    await go(pat, `${BASE}/campaigns/${CAMP}`);
    is('campaign page: the map, with Lock on it', await until(pat, `!!document.querySelector('#cp-map .mp-tok')`, Boolean), true);
    // the player sheet's top bar: a Map button
    await go(pat, `${BASE}/characters/lock`);
    is('sheet: a Map button to the map page', await until(pat, `document.querySelector('#hb-map')?.getAttribute('href') || ''`, (h) => h.includes('/map')), `/campaigns/${CAMP}/map`);

    // offline: the player's moves pause with "Live updates paused"
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    await until(pat, `!!${tokOf('Lock')}`, Boolean);
    relay.kill();
    is('relay down: the player sees "Live updates paused", moving greyed out', await until(pat, `!document.querySelector('[data-mp=paused]').hidden && !${tokOf('Lock')}.classList.contains('can')`, Boolean, 10000), true);

    for (const [who, b] of [['DM', dm], ['Pat', pat]]) is(`no console errors (${who})`, b.errors.filter((e) => !/backup\.php|prefs\.php|WebSocket|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED/.test(e) && !e.includes(RELAY)), []);
} finally { pat.close(); dm.close(); relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'maps page ok');
process.exit(bad ? 1 : 0);
