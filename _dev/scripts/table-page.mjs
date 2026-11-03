// Checks the Table view (ROADMAP 1.7) end to end, with the real relay in front of a local PHP server (GD loaded). Dee (the DM)
// opens /campaigns/<id>/table in browser A (Chrome; Firefox with --firefox), as the DM does before moving the tab to the TV.
// Pat plays Lock in browser B (the other one), where Dee later opens the campaign page too. Dee runs the game through the API:
// a map put on the table, a fight with a hidden monster, damage, a draft fog, hidden and fogged tokens, a hidden roll, a
// whisper, DM notes and handouts. The Table view must follow every public change live and never receive a secret: everything
// it fetched and every WebSocket frame its role gets are searched for them. Then the relay goes away and comes back.
//   node _dev/scripts/table-page.mjs [--firefox]   (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { launch, serving } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8128 + SHIFT, RELAY = 8102 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-tv-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const WS = createRequire(import.meta.url)(join(ROOT, 'live/node_modules/ws'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'tvcheckdm000000000000000000000000x', pat: 'tvcheckpat00000000000000000000000x', sam: 'tvchecksam00000000000000000000000x' };
const CAMP = 'aaa000000017';
const FF = process.argv.includes('--firefox');

rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat'], ['sam', '333', 'Sam']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
const charFile = (id) => join(ACCOUNTS, 'characters', id, 'character.json');
for (const [id, owner, name] of [['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy']]) {
    mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner, visibility: 'private', created: 1, campaigns: [] }));
    writeFileSync(charFile(id), JSON.stringify({ id, name, race: 'Human', updated: 5, art: '', view: { noAnim: true }, hp: { cur: 21, base: 21, temp: 0, mod: 0 }, calc: { hpMax: 21 },
        conditions: [], panels: [{ id: 'p1', type: 'combat', ok: 0, bad: 0 }], classes: [{ name: 'Rogue', level: 3, die: 8, hdUsed: 0 }], abilities: [] }));
}
mkdirSync(join(ACCOUNTS, 'monsters', '111'), { recursive: true });
for (const [id, name, race, hp] of [['gob', 'Goblin', 'Small humanoid', 4444], ['lurker', 'Secret Lurker', 'Large aberration', 59], ['shade', 'Shadow Fiend', 'Medium fiend', 13]])
    writeFileSync(join(ACCOUNTS, 'monsters', '111', id + '.json'), JSON.stringify({ id, name, race, updated: 5, cr: '1', abilities: [], ac: '15', init: 'DEX', hp: { cur: hp, base: hp, temp: 0, mod: 0 } }));
mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Table Test', dm: '111', code: 'aaaaaaaaaa', created: 1, members: [
    { sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [{ sheet: 'player', id: 'lock' }] }, { sub: '333', name: 'Sam', joined: 3, characters: [{ sheet: 'player', id: 'ozzy' }] }] }));
// Dee's map, made before the check starts (maps-page.mjs checks uploading): 400 x 300, 100 px squares, not on the table yet
const gd = process.platform === 'win32' ? ['-d', 'extension=gd'] : [];
const MAP = execFileSync(PHP, [...gd, '-r', `require ${JSON.stringify(join(ROOT, 'includes/maps.php'))}; $A = ${JSON.stringify(ACCOUNTS)}; $c = cp_get($A, '${CAMP}');
    $f = $A . '/up.png'; $im = imagecreatetruecolor(400, 300); imagefill($im, 0, 0, imagecolorallocate($im, 90, 120, 90)); imagepng($im, $f);
    [, $m] = mp_create($A, $c, '111', 'Crypt', $f); mp_op($A, $c, '111', ['op' => 'grid', 'm' => $m['id'], 's' => 100, 'ox' => 0, 'oy' => 0]); echo $m['id'];`]).toString().trim();

const env = { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` };
const web = spawn(PHP, [...gd, '-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env });
let relay = null;
const startRelay = async () => {
    relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });
    await serving(`http://127.0.0.1:${RELAY}/health`);
};
await serving(BASE + '/privacy/');
await startRelay();

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`); };
async function until(b, expr, ok, ms = 10000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await b.ev(expr); if (ok(v)) return v; await sleep(150); } return v; }
const post = (sid, path, body) => fetch(BASE + path, { method: 'POST', headers: { Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const api = (sid, body) => post(sid, '/campaigns/api.php', { id: CAMP, ...body });
const maps = (body) => post(SID.dm, '/campaigns/maps.php', { c: CAMP, m: MAP, ...body });
const hand = (body) => post(SID.dm, '/campaigns/handouts.php', { c: CAMP, ...body });
const get = (sid, path) => fetch(BASE + path, { headers: { Cookie: 'dndsid=' + sid } });
const dmFight = () => get(SID.dm, `/campaigns/fight.php?c=${CAMP}`).then((r) => r.json()).then((j) => j.fight);
const fightOp = async (op, extra = {}) => api(SID.dm, { act: 'fight', op, v: (await dmFight())?.v, ...extra });
const go = async (b, url) => { await b.go(url); for (let i = 0; i < 80 && !(await b.ev(`document.readyState === 'complete' && !!document.querySelector('main')`)); i++) await sleep(100); };
const signIn = async (b, sid) => { await b.go(BASE + '/privacy/'); await b.ev(`localStorage.clear(); document.cookie = 'dndsid=${sid}; path=/'`); };
const text = (sel) => `document.querySelector('${sel}')?.textContent.replace(/\\s+/g, ' ').trim() || ''`;
const cards = `[...document.querySelectorAll('.tv-card')].map((c) => c.className.replace('tv-card ', '') + ':' + (c.querySelector('.tv-n')?.textContent || c.textContent.trim()))`;
const untilCards = async (b, ok, ms = 10000) => JSON.parse(await until(b, `JSON.stringify(${cards})`, (v) => v && ok(JSON.parse(v)), ms));

// sockets of our own beside the page: one as the table (the frames the Table view gets) and one as the DM (proof the secrets went out)
const sockets = [];
function listen(sid, as) {
    const ws = new WS(`ws://localhost:${RELAY}/?c=${CAMP}${as ? '&as=table' : ''}`, { headers: { cookie: 'dndsid=' + sid, origin: BASE } });
    ws.got = [];
    ws.on('message', (d) => ws.got.push(String(d)));
    sockets.push(ws);
    return new Promise((r) => { ws.on('open', () => r(ws)); ws.on('error', () => r(ws)); ws.on('unexpected-response', (q, res) => { ws.refused = res.statusCode; r(ws); }); });
}
// what may never reach the Table view, found in text: [what it is, pattern]
const SECRETS = [['the hidden monster', /Secret Lurker|"lurker"/], ['the monster in the fog', /Shadow Fiend|"shade"/], ["the hidden roll's title", /Mind Blast/], ["the hidden roll's result", /HIDDENTOTAL41/],
    ['the whisper', /Steal the gem|WHISPER27/], ['HP of anyone', /"hp"|"cur"|"temp"|4444|4437/], ['initiative numbers', /"init"|"bonus"/], ['the draft fog', /"draft"|111111111111/],
    ['the working or original map', /img=work|img=original|img=thumb/], ['a DM note', /NOTE-SECRET|"notes"/], ['a draft or one-player handout', /Unsent draft|Only for Pat/], ['hidden flags', /"hidden":/],
    ['Google ids', /"(111|222|333)"/]];
const leaks = (where, s) => { for (const [what, re] of SECRETS) if (re.test(s)) { bad++; console.log(`FAIL ${where} carried ${what}: ${s.match(re)[0]}`); } };

const tv = await launch(FF ? 'firefox' : 'chrome'), pat = await launch(FF ? 'chrome' : 'firefox');
let mark = 0;
try {
    for (const b of [tv, pat]) await b.block(/backup\.php|prefs\.php/);
    await signIn(tv, SID.dm);
    await signIn(pat, SID.pat);
    const tableWs = await listen(SID.dm, true), dmWs = await listen(SID.dm, false), patTable = await listen(SID.pat, true);
    is('the relay lets a player in as the table? no', patTable.refused, 403);
    is('a player gets no Table view page', (await get(SID.pat, `/campaigns/${CAMP}/table`)).status, 404);
    is('a player cannot read as the table', [(await get(SID.pat, `/campaigns/fight.php?c=${CAMP}&as=table`)).status, (await get(SID.pat, `/campaigns/maps.php?c=${CAMP}&as=table`)).status], [404, 403]);
    is('signed out: no Table view', (await fetch(`${BASE}/campaigns/${CAMP}/table`)).status, 404);

    // the DM's own pages link to it, in a new tab
    await go(pat, `${BASE}/campaigns/${CAMP}`);
    is('players have no Open Table view button', await pat.ev(`!!document.querySelector('[data-act=tv]')`), false);

    // the Table view with nothing on the table: the campaign's name and party
    await go(tv, `${BASE}/campaigns/${CAMP}/table`);
    is('nothing on the table: the campaign and its party', await until(tv, `!document.querySelector('.tv-idle').hidden && ${text('.tv-idle')}`, (t) => t && t.includes('Lock')), 'Table Test LLockOOzzy');
    is('the one-time full screen prompt', await tv.ev(`!document.querySelector('.tv-full').hidden`), true);
    is('the page carries the table role for the live socket', await tv.ev(`Live.as`), 'table');
    // nothing the tab sends is taken: a change straight from the page is refused, and Live.send sends nothing
    is('a change from the table tab is refused', await tv.ev(`fetch('/campaigns/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'session', id: '${CAMP}', start: true }) }).then((r) => r.status)`), 403);
    is('a map change from the table tab is refused', await tv.ev(`fetch('/campaigns/maps.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: '${CAMP}', m: '${MAP}', op: 'activate' }) }).then((r) => r.status)`), 403);
    is('Live.send from the table tab sends nothing', await tv.ev(`Live.send('${CAMP}', { title: 'x' }) === null && localStorage.getItem('live-outbox') === null`), true);
    is('the session is still not running', JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), 'utf8')).session ?? null, null);
    await tv.ev(`document.querySelector('.tv-full').click(); 1`);
    is('the prompt goes once clicked', await tv.ev(`document.querySelector('.tv-full').hidden`), true);

    // the map goes on the table: never sent, so a black rectangle, then the sent fog (left half)
    await maps({ op: 'activate' });
    is('a map on the table, never sent: black, like players', await until(tv, `document.querySelector('.tv-idle').hidden && !document.querySelector('.mp-black').hidden`, Boolean), true);
    await maps({ op: 'draft', fog: '110011001100' });
    await maps({ op: 'send' });
    is('sent: the masked copy, asked for as the table', await until(tv, `document.querySelector('.mp-img').getAttribute('src') || ''`, (s) => s.includes('img=public')).then((s) => [s.includes('&as=table&'), s.includes('n=1')]), [true, true]);
    is('the picture loads', await until(tv, `document.querySelector('.mp-img').naturalWidth`, (w) => w > 0), 400);
    is('the map fills the screen, fitted', await tv.ev(`(() => { const r = document.querySelector('.mp-stage').getBoundingClientRect(); return r.width > innerWidth * .9 || r.height > innerHeight * .9; })()`), true);
    // keys: + zooms, 0 fits again
    const w0 = await tv.ev(`document.querySelector('.mp-stage').getBoundingClientRect().width`);
    await tv.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })); 1`);
    is('+ zooms in', await tv.ev(`document.querySelector('.mp-stage').getBoundingClientRect().width`) > w0 * 1.1, true);
    await tv.ev(`dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true })); 1`);
    is('0 fits again', Math.round(await tv.ev(`document.querySelector('.mp-stage').getBoundingClientRect().width`)), Math.round(w0));
    // the party on the map: names always shown, under the tokens
    const tok = (name) => `[...document.querySelectorAll('.mp-tok')].find((e) => e.getAttribute('aria-label').startsWith('${name}'))`;
    const dmMap = await get(SID.dm, `/campaigns/maps.php?c=${CAMP}`).then((r) => r.json());
    const key = (name) => dmMap.map.tokens.find((t) => t.name === name).k;
    await maps({ op: 'move', k: key('Lock'), x: 0, y: 0, placed: true });
    await maps({ op: 'move', k: key('Ozzy'), x: 100, y: 100, placed: true });
    is('party tokens live, names showing below them', await until(tv, `(() => { const t = ${tok('Ozzy')}; if (!t) return ''; const n = t.querySelector('.mp-name'); return getComputedStyle(n).display + ':' + (n.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 2); })()`, (v) => v === 'block:true'), 'block:true');

    // the fight: two monsters (the Lurker hidden), Pat rolls in, Ozzy waits
    await fightOp('start');
    await fightOp('add', { items: [{ kind: 'monster', mon: 'lurker', init: 25, bonus: 3, ac: 17 }, { kind: 'monster', mon: 'gob', init: 10, bonus: 2, ac: 15 }] });
    const lurker = (await dmFight()).entries.find((e) => e.mon === 'lurker').id;
    await fightOp('hide', { e: lurker, on: true });
    is('rolling in: the order on top with who is still to roll', (await until(tv, text('.tv-strip'), (t) => t.includes('Waiting for: Lock, Ozzy'))).includes('Rolling initiative'), true);
    is('the strip leaves the hidden monster out', await untilCards(tv, (c) => c.length === 1), ['monster:Goblin']);
    const n = (await dmFight()).n;
    await api(SID.pat, { act: 'roll', roll: { id: 'init-lock-0001', char: 'lock', title: 'Initiative', expr: '1d20 + 2', shown: '13 + 2', total: '15', nat: '', vis: 'public', fight: n, dice: [[20, [13]]] } });
    is('Lock rolled in: only Ozzy is waited for', await until(tv, text('.tv-wait'), (t) => t === 'Waiting for: Ozzy'), 'Waiting for: Ozzy');
    await fightOp('add', { items: [{ kind: 'pc', char: 'ozzy', init: 5 }] });
    await fightOp('round1');
    is("the hidden monster's turn: a DM's turn card, current, Lock next", await untilCards(tv, (c) => c[0]?.startsWith('dm now')), ['dm now:DM\'s turn', 'pc next:Lock', 'monster:Goblin', 'pc:Ozzy']);
    is('round 1 on the strip', await tv.ev(text('.tv-round')), 'Round 1');
    // players see the DM's turn too, on the map page's fight panel
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    is("Pat's map: the DM's turn card", await until(pat, text('[data-mp=fight] .fi-p.on'), (t) => t.includes("DM's turn")), "DMDM's turn");
    is("Pat's map: You're up next", await until(pat, text('.fi-you'), Boolean), "You're up next");
    await fightOp('next');
    is('next turn: the order turns round, Lock first and bigger', await untilCards(tv, (c) => c[0] === 'pc now:Lock'), ['pc now:Lock', 'monster next:Goblin', 'pc:Ozzy']);
    is('the order slides along', await tv.ev(`document.querySelector('.tv-cards').classList.contains('slide')`), true);
    is('no initiative numbers anywhere on the TV', await tv.ev(`/\\b(25|15|10)\\b/.test(document.querySelector('.tv-strip').textContent)`), false);

    // damage: the goblin bloodied (a red edge), never a number
    await post(SID.dm, `/sheets/monster/cloud.php?hp=gob&c=${CAMP}`, { op: { k: 'dmg', n: 4000 } });
    is('the goblin is bloodied on the strip', (await untilCards(tv, (c) => c.includes('monster next bloodied:Goblin'))).includes('monster next bloodied:Goblin'), true);

    // Lock goes down with Poisoned: down, death-save ticks and the condition icon, on the strip and on the token, for everyone
    const lock = JSON.parse(readFileSync(charFile('lock'), 'utf8'));
    Object.assign(lock, { updated: Date.now(), hp: { ...lock.hp, cur: 0 }, conditions: ['Poisoned', 'My Own Curse'], panels: [{ id: 'p1', type: 'combat', ok: 1, bad: 2 }] });
    is('Pat saves Lock at 0 HP', (await post(SID.pat, '/sheets/player/cloud.php', lock)).status, 200);
    is('the TV: Lock down with 1 success and 2 failures, Poisoned', await until(tv, `(() => { const c = document.querySelector('.tv-card.pc.down'); return c && [c.querySelectorAll('.cond-saves .cs-ok.on').length, c.querySelectorAll('.cond-saves .cs-bad.on').length,
        [...c.querySelectorAll('.cond-ic title')].map((t) => t.textContent).join()].join(':'); })()`, Boolean), '1:2:Poisoned,My Own Curse');
    is('the TV token: down, its conditions as icons', await until(tv, `(() => { const t = ${tok('Lock')}; return t && t.classList.contains('down') && t.querySelectorAll('.cond-ic').length; })()`, (v) => v === 2), 2);
    is("Pat's map token shows them too", await until(pat, `(() => { const t = ${tok('Lock')}; return t && t.classList.contains('down') && !!t.querySelector('.cond-saves') && t.querySelectorAll('.cond-ic').length; })()`, (v) => v === 2), 2);
    is("a player's own condition gets its first letter", await tv.ev(`[...document.querySelectorAll('.tv-card .cond-ic')].find((s) => s.querySelector('title').textContent === 'My Own Curse')?.querySelector('text')?.textContent`), 'M');

    // the DM's secrets: a draft fog, the hidden Lurker on a revealed square, the Shadow Fiend in the fog, a hidden roll, a whisper,
    // a note, a draft and a one-player handout
    await maps({ op: 'draft', fog: '111111111111' });
    await maps({ op: 'move', k: (await get(SID.dm, `/campaigns/maps.php?c=${CAMP}`).then((r) => r.json())).map.tokens.find((t) => t.name === 'Goblin').k, x: 0, y: 100, placed: true });
    const lk = (await get(SID.dm, `/campaigns/maps.php?c=${CAMP}`).then((r) => r.json())).map.tokens.find((t) => t.name === 'Secret Lurker').k;
    await maps({ op: 'move', k: lk, x: 100, y: 0, placed: true });
    await maps({ op: 'drop', mon: 'shade' });
    const sh = (await get(SID.dm, `/campaigns/maps.php?c=${CAMP}`).then((r) => r.json())).map.tokens.find((t) => t.name === 'Shadow Fiend').k;
    await maps({ op: 'move', k: sh, x: 300, y: 200, placed: true });
    await maps({ op: 'move', k: sh, x: 200, y: 200, placed: true });
    await api(SID.dm, { act: 'roll', roll: { id: 'hid-roll-0001', name: 'Secret Lurker', title: 'Mind Blast', expr: '1d20 + 14', shown: '19 + 14', total: 'HIDDENTOTAL41', vis: 'hidden', dice: [[20, [19]]] } });
    await api(SID.sam, { act: 'roll', roll: { id: 'whisper-0001', char: 'ozzy', title: 'Steal the gem', expr: '1d20', shown: '17', total: 'WHISPER27', vis: 'dm' } });
    await api(SID.pat, { act: 'roll', roll: { id: 'pub-roll-0001', char: 'lock', title: 'Death save', expr: '1d20', shown: '20', total: '20', nat: '20', vis: 'public', dice: [[20, [20]]] } });
    await post(SID.dm, '/campaigns/handouts.php', { c: CAMP, act: 'note', note: { id: 'note0001', title: 'Plans', body: 'NOTE-SECRET', updated: 5 } });
    await hand({ act: 'save', handout: { id: 'draft001', title: 'Unsent draft', updated: 1 } });
    await hand({ act: 'save', handout: { id: 'onlypat1', title: 'Only for Pat', updated: 1 } });
    await hand({ act: 'send', id: 'onlypat1', to: ['222'] });
    is('the TV: the goblin moved in sight, the hidden and the fogged ones never there', await until(tv, `[...document.querySelectorAll('.mp-tok')].map((t) => t.getAttribute('aria-label').split(',')[0]).sort().join()`, (v) => v === 'Goblin,Lock,Ozzy'), 'Goblin,Lock,Ozzy');
    is('the log: the nat 20 marked, the hidden roll only as "DM rolled", no whisper', await until(tv, `[...document.querySelectorAll('.tv-roll')].map((l) => l.className.replace('tv-roll', '').trim() + '|' + l.textContent.replace(/\\s+/g, ' ').trim()).join(' / ')`,
        (v) => v.includes('Death save')), '|DM Fight started / |Lock Initiative 1513 + 2 / |DM rolled / nat20|Lock Death save 2020');
    // 3D dice for the public roll, if this browser has WebGL (the log line is all without it)
    const gl = await tv.ev(`(() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })()`);
    is('the public roll is thrown in 3D (WebGL: ' + gl + ')', gl ? await until(tv, `!!document.getElementById('hb-throw')`, Boolean, 20000) : true, true);
    // ...landing on the number that was rolled (the throw resolves once the dice stop)
    if (gl) is('the 3D dice land on the real numbers', await until(tv, `JSON.stringify(TableView.state().landed)`, (v) => v && v.includes('pub-roll'), 20000), JSON.stringify({ id: 'pub-roll-0001', dice: [[20, [20]]] }));
    if (process.env.TV_SHOT) writeFileSync(process.env.TV_SHOT + '-map.png', await tv.shot(1280, 720));

    // handouts: the DM's "Show on TV now" button on the campaign page (Dee in browser B), then edits and Take off TV
    await hand({ act: 'save', handout: { id: 'tvhand01', title: 'The old map', text: 'Torn at one corner', updated: 1 } });
    await hand({ act: 'send', id: 'tvhand01', to: 'everyone' });
    await signIn(pat, SID.dm);
    await go(pat, `${BASE}/campaigns/${CAMP}/map`);
    is('the map page has Open Table view in its top bar, for the DM', await until(pat, `document.querySelector('.mp-bar [data-act=tv]')?.getAttribute('href')`, Boolean), `/campaigns/${CAMP}/table`);
    await go(pat, `${BASE}/campaigns/${CAMP}`);
    is('the DM has an Open Table view button, to a new tab', await until(pat, `document.querySelector('[data-act=tv]')?.getAttribute('target')`, Boolean), '_blank');
    await until(pat, `!!document.querySelector('[data-dm=hopen][data-id=onlypat1]')`, Boolean);
    await pat.ev(`document.querySelector('[data-dm=hopen][data-id=onlypat1]').click(); 1`);
    is('no TV button on a handout sent to some players', await until(pat, `!!document.querySelector('[data-dm=hsend]') && !document.querySelector('[data-dm=htv]')`, Boolean), true);
    is('the old Table view switch is gone', await pat.ev(`!!document.querySelector('[data-hf=table]')`), false);
    await pat.ev(`document.querySelector('[data-dm=hopen][data-id=tvhand01]').click(); 1`);
    await until(pat, `document.querySelector('[data-dm=htv]')?.textContent === 'Show on TV now'`, Boolean);
    await pat.ev(`document.querySelector('[data-dm=htv]').click(); 1`);
    is('Show on TV now: the handout over the map', await until(tv, `!document.querySelector('.tv-ho').hidden && ${text('.tv-ho')}`, Boolean), 'The old mapTorn at one corner');
    is('the text alone, big', await tv.ev(`document.querySelector('.tv-ho').classList.contains('tv-hotext-only')`), true);
    is("the DM's list marks it On TV, the button says Take off TV", await until(pat, `document.querySelector('[data-dm=htv]')?.textContent + '|' + ${text('[data-dm=hopen][data-id=tvhand01]')}`, (v) => v.startsWith('Take')), 'Take off TV|The old map SentOn TV');
    await hand({ act: 'save', handout: { id: 'tvhand01', title: 'The old map', text: 'Torn at two corners', updated: Date.now() + 5000 } });
    is('an edit follows live', await until(tv, text('.tv-hotext'), (t) => t.includes('two')), 'Torn at two corners');
    await pat.ev(`document.querySelector('[data-dm=htv]').click(); 1`);
    is('Take off TV: the map again', await until(tv, `document.querySelector('.tv-ho').hidden`, Boolean), true);
    await hand({ act: 'tv', id: 'tvhand01', on: true });
    await until(tv, `!document.querySelector('.tv-ho').hidden`, Boolean);
    await hand({ act: 'unshare', id: 'tvhand01' });
    is('unshared: off the TV', await until(tv, `document.querySelector('.tv-ho').hidden`, Boolean), true);

    // everything the Table view fetched went as the table, and none of it holds a secret
    const urls = JSON.parse(await tv.ev(`JSON.stringify(performance.getEntriesByType('resource').map((e) => e.name))`));
    const mine = urls.filter((u) => /\/campaigns\/(fight|maps|log|handouts)\.php\?/.test(u)); // (not the refused POSTs above)
    is('it fetched its fight, map, log and handout', ['fight', 'maps', 'log', 'handouts'].every((p) => mine.some((u) => u.includes(`/${p}.php`))), true);
    is('every one of them as the table', mine.filter((u) => !u.includes('as=table')), []);
    for (const u of [...new Set(mine)]) leaks(u.replace(BASE, ''), await get(SID.dm, u.replace(BASE, '')).then((r) => (/img=/.test(u) ? '' : r.text())));
    leaks('the TV page', await tv.ev(`document.documentElement.outerHTML`));
    leaks('the WebSocket frames the table gets', tableWs.got.join('\n'));
    is('the DM socket did get the secrets (the check sees them)', ['Mind Blast', 'WHISPER27', '"draft":true', 'Secret Lurker'].map((s) => dmWs.got.some((f) => f.includes(s))), [true, true, true, true]);
    is('the table socket got the live updates', ['"type":"fight"', '"type":"status"', '"type":"tv"', 'DM rolled' && '"vis":"hidden"', 'Death save'].map((s) => tableWs.got.some((f) => f.includes(s))), [true, true, true, true, true]);

    // the relay goes away: "Reconnecting...", the same screen kept, and everything back when it returns
    const before = await tv.ev(`JSON.stringify([${cards}, document.querySelector('.mp-img').getAttribute('src'), document.querySelectorAll('.tv-roll').length])`);
    await tv.ev(`window.__still = 1`);
    relay.kill();
    is('relay gone: Reconnecting...', await until(tv, `!document.querySelector('.tv-badge').hidden && ${text('.tv-badge')}`, Boolean), 'Reconnecting...');
    is('the screen stays as it was', await tv.ev(`JSON.stringify([${cards}, document.querySelector('.mp-img').getAttribute('src'), document.querySelectorAll('.tv-roll').length])`), before);
    await fightOp('next'); // a change while the relay is down: the 10 s check picks it up
    is('while down, changes still come every 10 s', (await untilCards(tv, (c) => c[0] === 'monster now bloodied:Goblin', 15000))?.[0], 'monster now bloodied:Goblin');
    await startRelay();
    is('relay back: the badge goes', await until(tv, `document.querySelector('.tv-badge').hidden`, Boolean, 15000), true);
    is('no reload when nothing changed', await tv.ev(`window.__still === 1`), true);
    // a new version of the site: the tab reloads itself (the relay comes back after an update)
    const conds = join(ROOT, 'assets/js/conds.js'), was = statSync(conds).mtime;
    utimesSync(conds, new Date(), new Date(Date.now() + 60000));
    mark = was;
    relay.kill();
    await until(tv, `!document.querySelector('.tv-badge').hidden`, Boolean);
    await startRelay();
    is('a new version: the tab reloads itself', await until(tv, `window.__still === undefined && document.readyState === 'complete' && !!document.querySelector('.tv-card')`, Boolean, 20000), true);
    utimesSync(conds, new Date(), was);
    mark = 0;
    is('after the reload: the same fight', await untilCards(tv, (c) => c[0] === 'monster now bloodied:Goblin'), ['monster now bloodied:Goblin', 'pc next:Ozzy', 'pc down:Lock']);
    // (the refused changes above, and the relay going away and the reload cutting its socket)
    is('no console errors on the Table view', tv.errors.filter((e) => !/403|Forbidden|WebSocket|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED|can.t establish a connection|interrupted while the page was loading/i.test(e)), []);
    // the end: the fight ends and the map comes off: the party screen again
    await fightOp('end');
    is('no fight: no strip', await until(tv, `document.querySelector('.tv-strip').hidden`, Boolean), true);
    await maps({ op: 'archive', on: true });
    is('no map on the table: the party screen', await until(tv, `!document.querySelector('.tv-idle').hidden`, Boolean), true);
} catch (e) {
    bad++;
    console.log('FAIL', e.stack || e.message);
} finally {
    if (mark) try { utimesSync(join(ROOT, 'assets/js/conds.js'), new Date(), mark); } catch (e) { }
    for (const s of sockets) s.terminate?.();
    tv.close(); pat.close();
    relay?.kill(); web.kill();
    await sleep(300);
    rmSync(TMP, { recursive: true, force: true });
}
console.log(bad ? `${bad} check(s) failed` : 'table page ok');
process.exit(bad ? 1 : 0);
