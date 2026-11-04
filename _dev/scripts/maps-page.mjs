// Checks the battle map (ROADMAP 1.6, reworked to work like D&D Beyond Maps) end to end, with the real relay in front of a local PHP
// server (GD loaded). Dee (the DM) uploads a map, displays it, paints live fog, adds monster copies from the Token Browser, runs a
// fight from the left panel, draws and adds overlays; Pat plays Lock. Browser A is Chrome (Firefox with --firefox), browser B the other.
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
const tokOf = (name) => `[...document.querySelectorAll('.mp-tok')].find((e) => e.getAttribute('aria-label').startsWith('${name}'))`;
const rail = (b, t) => click(b, `[data-mpa=tool][data-t=${t}]`);
const pointIn = (b, x, y) => b.ev(`new Promise((done) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); const k = i.naturalWidth / parseFloat(document.querySelector('.mp-stage').style.width); done(JSON.stringify([...g.getImageData(Math.floor(${x} * k), Math.floor(${y} * k), 1, 1).data])); }; i.onerror = () => done('null'); i.src = document.querySelector('.mp-img').src; })`).then(JSON.parse);
const addRow = (b, add) => b.ev(`(() => { const r = document.querySelector('[data-add="${add}"]'); if (!r) return false; const q = r.getBoundingClientRect(); for (const t of ['pointerdown', 'pointerup']) (t === 'pointerup' ? window : r).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: q.left + 5, clientY: q.top + 5, pointerId: 9, button: 0 })); return true; })()`);
const clickTok = (b, name) => b.ev(`(() => { const e = ${tokOf(name)}; if (!e) return false; const r = e.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', button: 0 }; e.dispatchEvent(new PointerEvent('pointerdown', o)); e.dispatchEvent(new PointerEvent('pointerup', o)); return true; })()`);
const menuText = text('[data-mp=menu]');

const dm = await launch(FF ? 'firefox' : 'chrome'), pat = await launch(FF ? 'chrome' : 'firefox');
try {
    for (const b of [pat, dm]) await b.block(/backup\.php|prefs\.php/);
    await signIn(dm, SID.dm);
    await signIn(pat, SID.pat);
    is('a non-member gets no map page', (await fetch(`${BASE}/campaigns/${CAMP}/map`)).status, 404);
    await go(dm, `${BASE}/campaigns/${CAMP}/map`);
    is('DM: nothing yet', (await until(dm, text('.mp-msg'), (t) => t.includes('Upload'))).includes('Upload a map picture'), true);

    // the rail, the Menu and the map dropdown, where the owner's screenshots put them
    is('DM rail: select, pan | fog, draw, overlays, ruler, ping, tokens', await until(dm, `[...document.querySelectorAll('[data-mp=rail] [data-t]')].map((b) => b.dataset.t).join()`, Boolean), 'select,pan,fog,draw,overlay,ruler,point,tokens');
    await until(dm, `!!document.querySelector('[data-mpi=map]')`, Boolean);
    is('every rail button has its drawn icon', await dm.ev(`[...document.querySelectorAll('[data-mp=rail] [data-t]')].every((b) => !!b.querySelector('svg path, svg circle, svg rect, svg line'))`), true);

    // Map Browser: a text file refused, then a noisy 1600 x 1200 PNG over one 4 MB chunk
    await dm.ev(`(() => { const s = document.querySelector('[data-mpi=map]'); s.value = '__browse'; s.dispatchEvent(new Event('change', { bubbles: true })); })(); 1`);
    is('Map Browser opens', await until(dm, `!!document.querySelector('[data-mbf]')`, Boolean), true);
    const putFile = (expr) => `(() => { const i = document.querySelector('[data-mbf]'), dt = new DataTransfer(); dt.items.add(${expr}); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`;
    await dm.ev(putFile(`new File(['hello'], 'notes.txt', { type: 'text/plain' })`) + '; 1');
    is('a text file is refused with a message', (await until(dm, text('[data-mbs]'), (t) => t.includes("isn't"))).includes('JPG, PNG, WebP or GIF'), true);
    const size = await dm.ev(`new Promise((done) => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d'), d = x.createImageData(1600, 1200);
        for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = 200; d.data[i + 3] = 255; }
        x.putImageData(d, 0, 0); c.toBlob((b) => { ${putFile(`new File([b], 'Crypt.png', { type: 'image/png' })`)}; done(b.size); }); })`);
    is('the picture is over 4 MB', size > 4 * 1024 * 1024, true);
    is('uploaded: Scale the map opens', await until(dm, `!!document.querySelector('[data-scs]')`, Boolean, 30000), true);
    const tableJson = join(ACCOUNTS, 'campaigns', CAMP, 'maps', 'table.json');
    is('the original kept as uploaded, not displayed by itself', [readFileSync(join(mapDir(), 'original.png')).length, existsSync(tableJson) && JSON.parse(readFileSync(tableJson, 'utf8')).active], [size, false]);
    is('a new map starts clear', mapJson().fog.ops, []);
    await dm.ev(`(() => { const s = document.querySelector('[data-scs]'); s.value = 100; s.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-scy]').click(); })(); 1`);
    is('the grid saved from the size field', await until(dm, '1', () => mapJson().grid.s === 100, 5000).then(() => mapJson().grid.s), 100);
    await until(dm, `!document.querySelector('dialog[open]')`, Boolean);
    is('no campaign name in the corner; the Menu goes back to it', await dm.ev(`!document.querySelector('.mpt-tl a') && !!document.querySelector('[data-mpi=menu] option[value=camp]')`), true);

    // the map isn't on the table until Display map
    await pat.shot(1100, 800);
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    is('player: waiting for a map', (await until(pat, text('.mp-msg'), Boolean)).includes('Waiting'), true);
    await until(dm, `!!document.querySelector('[data-mpa=showmap]')`, Boolean);
    await click(dm, '[data-mpa=showmap]');
    is('Display map becomes Hide map', await until(dm, `!!document.querySelector('[data-mpa=hidemap]')`, Boolean), true);
    is('player: the picture comes live', await until(pat, `!!document.querySelector('.mp-img')?.getAttribute('src')`, Boolean), true);
    is('player rail: select, pan, ruler, ping only', await until(pat, `[...document.querySelectorAll('[data-mp=rail] [data-t]')].map((b) => b.dataset.t).join()`, Boolean), 'select,pan,draw,ruler,point');
    let leak = await viewAs(SID.pat);
    is('player never gets fog strokes, an encounter or the working picture', [/"ops"/.test(leak), /"enc"/.test(leak), /img=work|img=original/.test(leak), /"draft"|"sent"/.test(leak)], [false, false, false, false]);
    is('player: the clear map shows the picture', (await until(pat, `document.querySelector('.mp-img').complete`, Boolean).then(() => pointIn(pat, 500, 500)))?.[3], 255);

    // fog: live. Cover All, then a brush stroke and a polygon clear parts; players follow, fogged pixels are gone from their picture
    const mid = await dm.ev(`document.querySelector('.mp-img').src`);
    await rail(dm, 'fog');
    is('fog flyout', await until(dm, `!!document.querySelector('[data-mpa=fogall][data-v="1"]')`, Boolean), true);
    await click(dm, '[data-mpa=fogall][data-v="1"]');
    const nAll = await until(dm, '1', () => mapJson().fog.ops.length === 1, 5000).then(() => mapJson().fog.n);
    is('Cover All, for players: transparent with nothing left of the picture', await until(pat, `document.querySelector('.mp-img').src`, (s) => s.includes('n=' + nAll)).then(async () => { await sleep(600); const p = await pointIn(pat, 500, 500); return p; }), [0, 0, 0, 0]);
    is('DM: the fog is on their canvas, light blue', JSON.parse(await dm.ev(`(() => { const c = document.querySelector('.mp-fog'), d = c.getContext('2d').getImageData(10, 10, 1, 1).data; return JSON.stringify([d[0], d[1], d[2], d[3]]); })()`)), [74, 159, 220, 255]);
    await dm.ev(`__ptr('pointermove', 600, 600); 1`);
    is('the square brush follows the mouse', await until(dm, `document.querySelector('rect.mp-brush')?.getAttribute('width')`, Boolean), '300');
    await click(dm, '[data-mpa=fogshape][data-v=round]');
    await dm.ev(`__ptr('pointermove', 610, 600); 1`);
    is('the round brush too', await until(dm, `document.querySelector('circle.mp-brush')?.getAttribute('r')`, Boolean), '150');
    await click(dm, '[data-mpa=fogshape][data-v=square]');
    await click(dm, '[data-mpa=fogmode][data-v=erase]');
    await click(dm, '[data-mpa=fogshape][data-v=round]');
    await drag(dm, [[300, 300], [400, 300], [500, 300]]);
    await until(dm, '1', () => mapJson().fog.ops.length === 2, 5000);
    is('a stroke reveals it straight away, for players too', await until(pat, `document.querySelector('.mp-img').src`, (s) => s.includes('n=' + mapJson().fog.n)).then(async () => { await sleep(600); return (await pointIn(pat, 400, 300))?.[3]; }), 255);
    is('still fogged further off', (await pointIn(pat, 1200, 900))?.[3], 0);
    await click(dm, '[data-mpa=fogshape][data-v=polygon]');
    for (const [x, y] of [[800, 100], [1100, 100], [1100, 400], [800, 400]]) await drag(dm, [[x, y]]);
    await drag(dm, [[800, 100]]);
    is('a polygon closes on its first point', await until(dm, '1', () => mapJson().fog.ops.length === 3, 5000).then(() => !!mapJson().fog.ops[2].poly), true);
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); 1`);
    is('Ctrl+Z takes the last stroke back', await until(dm, '1', () => mapJson().fog.ops.length === 2, 5000).then(() => mapJson().fog.ops.length), 2);
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); 1`);
    await until(dm, '1', () => mapJson().fog.ops.length === 1, 5000);
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); 1`);
    await until(dm, '1', () => mapJson().fog.ops.length === 0, 5000);
    // a known layout from here: the left half clear, the right half fogged
    await mapsApi(SID.dm, { op: 'fogset', m: mapJson().id, ops: [{ on: true, poly: [[800, 0], [1600, 0], [1600, 1200], [800, 1200]] }] });
    is('an old picture address is refused to players', (await fetch(`${BASE}/campaigns/maps.php?c=${CAMP}&m=${mapJson().id}&img=public&n=${nAll}`, { headers: { Cookie: 'dndsid=' + SID.pat } })).status, 403);

    // the Token Browser: the party on the Players tab, your monsters and the Compendium on Monsters; each click a new copy
    await rail(dm, 'tokens');
    await until(dm, `!!document.querySelector('.mpt-browser')`, Boolean);
    await click(dm, '.mpt-browserh [data-mpa=tool]');
    await until(dm, `!document.querySelector('.mpt-browser')`, Boolean);
    await dm.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true })); 1`);
    is('the Token Browser opens again after closing', await until(dm, `!!document.querySelector('.mpt-browser')`, Boolean), true);
    is('Token Browser opens on Monsters', await until(dm, text('.mpt-browserh'), (t) => t.includes('Token Browser')).then(() => until(dm, `!!document.querySelector('[data-add="mon:gob"]')`, Boolean)), true);
    is('the Compendium is listed under your monsters, grouped by encounter', await until(dm, text('.mpt-list'), (t) => t.includes('COMPENDIUM'), 15000).then((t) => t.includes('UNSORTED') && t.includes('Add all (2)')), true);
    await dm.ev(`(() => { const i = document.querySelector('[data-mpi=brq]'); i.value = 'gob'; i.dispatchEvent(new Event('input', { bubbles: true })); })(); 1`);
    is('search narrows the list, keeping the field focused-safe', await until(dm, `!document.querySelector('[data-add="mon:ogre"]')`, Boolean), true);
    await dm.ev(`(() => { const i = document.querySelector('[data-mpi=brq]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })(); 1`);
    await until(dm, `!!document.querySelector('[data-add="mon:ogre"]')`, Boolean);
    await addRow(dm, 'mon:gob');
    is('a click adds Goblin A', await until(dm, `!!${tokOf('Goblin A')}`, Boolean), true);
    await addRow(dm, 'mon:gob');
    is('another click adds Goblin B', await until(dm, `!!${tokOf('Goblin B')}`, Boolean), true);
    await addRow(dm, 'mon:ogre');
    await until(dm, `!!${tokOf('Ogre A')}`, Boolean);
    await click(dm, '[data-mpa=brtab][data-v=pc]');
    const lockKey = await until(dm, `document.querySelector('[data-add^="tok:"]')?.dataset.add || ''`, Boolean);
    await addRow(dm, lockKey);
    await until(dm, `!!${tokOf('Lock')}`, Boolean);
    const T = () => { const j = mapJson(); return Object.entries(j.tokens).map(([k, t]) => ({ k, ...t })); };
    const key = (name) => T().find((t) => t.mon === { Goblin: 'gob', Ogre: 'ogre' }[name.split(' ')[0]] && t.suffix === name.split(' ')[1]).k;
    const m = mapJson().id;
    const place = (name, x, y) => mapsApi(SID.dm, { op: 'move', m, k: key(name), x, y, placed: true });
    await place('Goblin A', 200, 200); await place('Goblin B', 300, 200); await place('Ogre A', 1200, 600);
    const lockK = T().find((t) => t.kind === 'pc' && t.char === 'lock')?.k;
    await mapsApi(SID.dm, { op: 'move', m, k: lockK, x: 100, y: 100, placed: true });
    is('player: monsters in the clear shown, the one under fog never sent', JSON.parse(await until(pat, `JSON.stringify([!!${tokOf('Goblin A')}, !!${tokOf('Ogre A')}])`, (v) => JSON.parse(v)[0])), [true, false]);
    leak = await viewAs(SID.pat);
    is('...nothing about it in what they fetched', leak.includes('Ogre'), false);

    // the token menu: HP on a copy never touches the Monster Sheet, nor the other copy
    await rail(dm, 'select');
    const before = readFileSync(join(ACCOUNTS, 'monsters', '111', 'gob.json'), 'utf8');
    await until(dm, `!!${tokOf('Goblin A')}`, Boolean);
    await clickTok(dm, 'Goblin A');
    is('clicking a monster brings up its menu', (await until(dm, menuText, (t) => t.includes('Goblin A'))).includes('CONDITIONS'), true);
    await click(dm, '[data-mpa=panel][data-v=hp]');
    await until(dm, `!!document.querySelector('[data-mpi=hpn]')`, Boolean);
    const hpBefore = await dm.ev(`BM.state.m.tokens.find((t) => t.name === 'Goblin A').hp.cur`);
    await dm.ev(`document.querySelector('[data-mpi=hpn]').value = 3; document.querySelector('[data-mpa=hp][data-v=dmg]').click(); 1`);
    is('Damage on the copy', await until(dm, `BM.state.m.tokens.find((t) => t.name === 'Goblin A').hp.cur`, (v) => v === hpBefore - 3), hpBefore - 3);
    is('the other copy keeps its HP', await dm.ev(`BM.state.m.tokens.find((t) => t.name === 'Goblin B').hp.cur`), hpBefore);
    is('the Monster Sheet save is untouched', readFileSync(join(ACCOUNTS, 'monsters', '111', 'gob.json'), 'utf8'), before);
    await click(dm, '[data-mpa=panel][data-v=cond]');
    await until(dm, `!!document.querySelector('[data-mpa=cond][data-v=Prone]')`, Boolean);
    await click(dm, '[data-mpa=cond][data-v=Prone]');
    is('a condition stored on the token', await until(dm, '1', () => T().find((t) => t.k === key('Goblin A')).cond?.includes('Prone'), 5000).then(() => true), true);
    await click(dm, '[data-mpa=togglehide]');
    is('HIDE: gone from players', await until(pat, `!${tokOf('Goblin A')}`, Boolean), true);
    await until(dm, `${tokOf('Goblin A')}?.classList.contains('hid')`, Boolean);
    await click(dm, '[data-mpa=togglehide]');
    is('REVEAL: back for players', await until(pat, `!!${tokOf('Goblin A')}`, Boolean), true);

    // Combat Encounter: Add all tokens, Auto initiative, Start combat; no rolling-in phase
    await click(dm, '[data-mpa=side]');
    is('the top-left button opens Combat Encounter', await until(dm, text('[data-mp=side] h2'), Boolean), 'Combat Encounter');
    await until(dm, `!!document.querySelector('[data-mpa=addall]')`, Boolean);
    await click(dm, '[data-mpa=addall]');
    is('matching monsters share a row', await until(dm, text('[data-mp=side] .mpt-rows'), (t) => t.includes('x2')).then((t) => [t.includes('1 PLAYERS'), t.includes('3 ENEMIES')]), [true, true]);
    is('the encounter is saved with the map', await until(dm, '1', () => mapJson().enc?.ids?.length === 4, 5000).then(() => mapJson().enc.ids.length), 4);
    is('monsters have no number until rolled', mapJson().enc.init[key('Goblin A')], undefined);
    is('...party characters do', typeof mapJson().enc.init[lockK], 'number');
    await click(dm, '[data-mpa=start]');
    is('Start combat becomes Initiative Order', await until(dm, text('[data-mp=side] h2'), (t) => t === 'Initiative Order'), 'Initiative Order');
    const f0 = await fight(SID.dm);
    is('already running at round 1, the first turn set', [f0.phase, f0.round, !!f0.turn, f0.entries.length], ['running', 1, true, 4]);
    is('the tracker on both screens', await until(pat, `document.querySelectorAll('[data-mp=tracker] .mpt-tile').length`, (n) => n >= 3) >= 3, true);
    is('the current one is first and larger', await until(dm, `document.querySelector('[data-mp=tracker] .mpt-tile')?.classList.contains('on')`, Boolean), true);
    is("the sheet's roll prompt still reaches the player", (await fight(SID.pat)).canRoll, ['lock']);
    const tilesOf = "[...document.querySelectorAll('[data-mp=tracker] .mpt-tile')].map((e) => e.title).join()";
    is('a monster under fog stays out of the players\' order', [(await until(pat, tilesOf, Boolean)).includes('Ogre'), JSON.stringify(await fight(SID.pat)).includes('Ogre')], [false, false]);
    is('...the DM still has it', (await until(dm, tilesOf, Boolean)).includes('Ogre'), true);
    await mapsApi(SID.dm, { op: 'fogset', m, ops: [] });
    is('revealed: it joins the players\' order live', await until(pat, `(${tilesOf}).includes('Ogre')`, Boolean), true);
    await mapsApi(SID.dm, { op: 'fogset', m, ops: [{ on: true, poly: [[800, 0], [1600, 0], [1600, 1200], [800, 1200]] }] });
    is('covered again: it leaves, live', await until(pat, `!(${tilesOf}).includes('Ogre')`, Boolean), true);
    const gobs = f0.entries.filter((e) => e.mon === 'gob');
    is('Start combat rolled for them, one roll for a kind', [gobs.length, gobs[0].init != null, gobs[0].init === gobs[1].init], [2, true, true]);
    is('the list stays blank for the next fight', mapJson().enc.init[key('Goblin A')], undefined);
    await until(dm, `!!document.querySelector('[data-fadd]')`, Boolean);
    await dm.ev(`(() => { const f = document.querySelector('[data-fadd]'); f.name.value = 'Lair action'; f.init.value = '20'; f.requestSubmit(); })(); 1`);
    is('an extra entry joins the order', await until(dm, text('[data-mp=side] .mpt-rows'), (t) => t.includes('Lair action')).then((t) => t.includes('Lair action')), true);
    const lair = () => fight(SID.dm).then((f) => f.entries.findIndex((e) => e.name === 'Lair action'));
    const at = await lair();
    await until(dm, `!document.querySelectorAll('[data-mpa=fmove][data-dir="1"]')[${at}]?.disabled`, Boolean);
    await dm.ev(`document.querySelectorAll('[data-mpa=fmove][data-dir="1"]')[${at}].click(); 1`);
    let moved = -1; for (let i = 0; i < 30 && moved !== at + 1; i++) { await sleep(150); moved = await lair(); }
    is('the down button moves it', moved, at + 1);
    const lairId = (await fight(SID.dm)).entries.find((e) => e.name === 'Lair action').id;
    await until(dm, `!!document.querySelector('[data-mpa=unfight][data-v="${lairId}"]')`, Boolean);
    await dm.ev(`document.querySelector('[data-mpa=unfight][data-v="${lairId}"]').click(); 1`);
    is('the row\'s ✕ removes it', await until(dm, text('[data-mp=side] .mpt-rows'), (t) => !t.includes('Lair action')).then((t) => t.includes('Lair action')), false);
    const t0 = (await fight(SID.dm)).turn;
    await until(dm, `!document.querySelector('[data-mpa=next]')?.disabled`, Boolean);
    await click(dm, '[data-mpa=next]');
    is('Next moves the turn', await until(dm, '1', async () => true).then(() => until(dm, `BM.state.fight?.turn`, (v) => v && v !== t0)) !== t0, true);
    await until(dm, `!!document.querySelector('[data-mpa=endpop]')`, Boolean);
    await click(dm, '[data-mpa=endpop]');
    is('the up arrow is End combat', await until(dm, text('.mpt-endpop'), Boolean), 'End combat');
    await click(dm, '.mpt-endpop [data-mpa=end]');
    await until(dm, `!!document.querySelector('dialog[open] [value=yes]')`, Boolean);
    await click(dm, 'dialog[open] [value=yes]');
    is('End combat: back to Combat Encounter', await until(dm, text('[data-mp=side] h2'), (t) => t === 'Combat Encounter'), 'Combat Encounter');
    is('tokens stay where they are', T().find((t) => t.k === key('Goblin A')).placed, true);
    is('the tracker goes', await until(pat, `!document.querySelector('[data-mp=tracker] .mpt-tile')`, Boolean), true);

    // drawing and overlays: seen by all, except a hidden overlay and anything under fog
    await rail(dm, 'draw');
    await until(dm, `!!document.querySelector('[data-mpa=penmode]')`, Boolean);
    await drag(dm, [[100, 500], [200, 520], [300, 500]]);
    await until(dm, '1', () => (mapJson().draws || []).length === 1, 5000);
    await rail(dm, 'overlay');
    await until(dm, `!!document.querySelector('[data-mpa=ovtype]')`, Boolean);
    await drag(dm, [[400, 600], [500, 600], [600, 700]]);
    await until(dm, '1', () => (mapJson().overlays || []).length === 1, 5000);
    await mapsApi(SID.dm, { op: 'overlay', m, o: { id: 'hiddenone', type: 'circle', x: 300, y: 800, len: 100, ang: 0, color: 0, pat: 0, hidden: true, group: '', locked: false } });
    await mapsApi(SID.dm, { op: 'overlay', m, o: { id: 'infogone1', type: 'circle', x: 1300, y: 800, len: 50, ang: 0, color: 0, pat: 0, hidden: false, group: '', locked: false } });
    await mapsApi(SID.dm, { op: 'draw', m, add: { c: 0, s: 0, pts: [[1400, 1000], [1450, 1000]] } });
    leak = JSON.parse(await viewAs(SID.pat)).map;
    is('players get what is in the clear only', [leak.draws.length, leak.overlays.map((o) => o.type).join()], [1, 'square']);

    // Pat: their own token. HP and conditions go to the sheet as edits; another token gives no menu and can't be moved
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    await until(pat, `!!${tokOf('Lock')}`, Boolean);
    await clickTok(pat, 'Goblin B');
    is("no menu on someone else's token", await pat.ev(`document.querySelector('[data-mp=menu]').hidden`), true);
    is('moving another token is refused', (await mapsApi(SID.pat, { op: 'move', m, k: key('Goblin B'), x: 0, y: 0, placed: true })).status, 403);
    await clickTok(pat, 'Lock');
    is('their own token: the menu', (await until(pat, menuText, (t) => t.includes('Lock'))).includes('CONDITIONS'), true);
    is('players see no DM tabs on it', JSON.parse(await pat.ev(`JSON.stringify([!!document.querySelector('[data-mpa=combat]'), !!document.querySelector('[data-mpa=togglehide]')])`)), [false, false]);
    await click(pat, '[data-mpa=panel][data-v=hp]');
    await until(pat, `!!document.querySelector('[data-mpi=hpn]')`, Boolean);
    await pat.ev(`document.querySelector('[data-mpi=hpn]').value = 4; document.querySelector('[data-mpa=hp][data-v=dmg]').click(); 1`);
    is('Damage from the token goes to the sheet', await until(pat, `document.querySelector('[data-mp=menu] .who small')?.textContent || ''`, (t) => t.startsWith('17/')).then((t) => t.startsWith('17/')), true);
    is('another player never gets their HP', JSON.parse(await viewAs(SID.sam)).map.tokens.find((t) => t.name === 'Lock').hp, undefined);
    is('a player can\'t edit more than HP and conditions', (await fetch(`${BASE}/sheets/player/dm.php`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.pat, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'send', c: CAMP, char: 'lock', edits: [{ id: 'nope00000001', at: 1, t: 'x', op: 'set', path: ['name'], value: 'Bad', was: 'Lock' }] }) }).then((r) => r.json())).refused?.length, 1);

    // Pat draws: it shows for the DM; they erase only their own line
    await rail(pat, 'draw');
    await until(pat, `!!document.querySelector('[data-mpa=penmode]')`, Boolean);
    is('players have no Clear drawings', await pat.ev(`!document.querySelector('[data-mpa=cleardraw]')`), true);
    await pat.ev(HELP);
    await drag(pat, [[100, 900], [200, 950]]);
    is("a player's line reaches the DM", await until(dm, 'BM.state.m.draws.length', (n) => n === 3), 3);
    await click(pat, '[data-mpa=penmode][data-v=erase]');
    await drag(pat, [[100, 500], [100, 900]]);
    is('erasing takes their line, not the DM\'s under the same stroke', await until(dm, 'BM.state.m.draws.length', (n) => n === 2), 2);

    // Ping and ruler: seen live by the others; a player sees the DM's ping
    await rail(pat, 'ruler');
    await drag(pat, [[150, 150], [350, 150]], { hold: true });
    is('a player\'s ruler shows on the DM\'s map live', await until(dm, text('.mp-ruler'), (t) => t.includes('ft · Pat')).then((t) => t.includes('Pat')), true);
    await pat.ev(`__ptr('pointerup', 350, 150); 1`);
    is('it goes when they let go', await until(dm, `!document.querySelector('.mp-ruler').textContent.includes('Pat')`, Boolean), true);
    await rail(dm, 'point');
    await until(dm, `!!document.querySelector('[data-mpa=ptmode]')`, Boolean);
    await drag(dm, [[200, 200]]);
    is('a ping shows on the player\'s map', await until(pat, `!!document.querySelector('.mp-ping')`, Boolean), true);

    // Add all: the whole Monster Sheet group at once
    const nToks = await dm.ev('BM.state.m.tokens.filter((t) => t.placed).length');
    await rail(dm, 'tokens');
    await until(dm, `!!document.querySelector('[data-mpa=brtab][data-v=mon]')`, Boolean);
    await click(dm, '[data-mpa=brtab][data-v=mon]');
    await until(dm, `!!document.querySelector('[data-mpa=addenc]')`, Boolean);
    await click(dm, '[data-mpa=addenc]');
    is('Add all places every monster in the group', await until(dm, 'BM.state.m.tokens.filter((t) => t.placed).length', (n) => n === nToks + 2), nToks + 2);

    // Hide map: players wait again; settings hide effects
    await click(dm, '[data-mpa=hidemap]');
    is('Hide map: players wait', (await until(pat, text('.mp-msg'), (t) => t.includes('Waiting'))).includes('Waiting'), true);
    await click(dm, '[data-mpa=showmap]');
    await until(pat, `!!document.querySelector('.mp-img')?.getAttribute('src')`, Boolean);

    // the sheet's Map button still leads here, the campaign page still shows it
    await go(pat, `${BASE}/campaigns/${CAMP}`);
    is('campaign page: the map shows', await until(pat, `!document.querySelector('#cp-map')?.hidden && !!document.querySelector('#cp-map .mp-stage')`, Boolean), true);

    // offline: the player's moves pause with "Live updates paused"
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    await until(pat, `!!${tokOf('Lock')}`, Boolean);
    relay.kill();
    is('relay down: the player sees "Live updates paused"', (await until(pat, `!document.querySelector('[data-mp=paused]').hidden && ${text('[data-mp=paused]')}`, Boolean, 20000)).includes('Live updates paused'), true);

    for (const [who, b] of [['DM', dm], ['Pat', pat]]) is(`no console errors (${who})`, b.errors.filter((e) => !/backup\.php|prefs\.php|WebSocket|ws:\/\/|ERR_CONNECTION|Failed to load resource|403|NetworkError|net::/i.test(e)), []);
} finally { pat.close(); dm.close(); relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'maps page ok');
process.exit(bad ? 1 : 0);
