// Checks DM edits on player sheets (ROADMAP 1.5) end to end, with the real relay in front of a local PHP server. Dee is the DM,
// Pat plays Lock. The DM damages Lock while Pat is away and changes a skill; Pat opens the sheet later and sees both (and nothing
// else changed); Pat undoes each; a copy edited signed out is uploaded later; two of Pat's devices are open while an edit lands
// (one typing a note); a reload mid-apply; an archived character with edits waiting; undoing one edit among several; a conflict;
// the DM's copy following Pat's changes live; the DM's own Undo; the fight tracker's HP buttons.
// Browser A is Chrome (Firefox with --firefox), B the other one, so both browsers play both parts.
//   node _dev/scripts/dm-edits.mjs [--firefox]   (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { launch, serving } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8126 + SHIFT, RELAY = 8092 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-dmedit-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'dmeditcheckdm000000000000000000000', pat: 'dmeditcheckpat00000000000000000000' };
const CAMP = 'd1d100000001';
const FF = process.argv.includes('--firefox');

rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
mkdirSync(join(ACCOUNTS, 'characters', 'lock'), { recursive: true });
writeFileSync(join(ACCOUNTS, 'characters', 'lock', 'meta.json'), JSON.stringify({ owner: '222', visibility: 'private', created: 1, campaigns: [] }));
writeFileSync(join(ACCOUNTS, 'characters', 'lock', 'character.json'), JSON.stringify({ id: 'lock', name: 'Lock', race: 'Human', updated: 5, art: '', view: { noAnim: true },
    hp: { cur: 21, base: 21, temp: 0, mod: 0 }, classes: [{ name: 'Rogue', level: 3, die: 8, hdUsed: 0 }] }));
mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
const members = [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [{ sheet: 'player', id: 'lock' }] }];
writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Edit Test', dm: '111', code: 'd100000001', created: 1, members }));

const web = spawn(PHP, ['-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore',
    env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });
await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`);

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`); };
async function until(b, expr, ok = Boolean, ms = 8000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await b.ev(expr); if (ok(v)) return v; await sleep(150); } return v; }
async function waitFor(fn, ms = 8000) { const t = Date.now(); let v; while (Date.now() - t < ms) { try { v = fn(); } catch { v = null; } if (v) return v; await sleep(100); } return v; }
const go = async (b, url) => { await b.go(url); for (let i = 0; i < 80 && !(await b.ev(`document.readyState === 'complete' && !!document.querySelector('main')`)); i++) await sleep(100); };
const signIn = async (b, sid) => { await go(b, BASE + '/privacy/'); await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); document.cookie = 'dndsid=${sid}; path=/'`); };
const text = (sel) => `document.querySelector('${sel}')?.textContent.replace(/\\s+/g, ' ').trim() || ''`;
const stored = () => JSON.parse(readFileSync(join(ACCOUNTS, 'characters', 'lock', 'character.json'), 'utf8'));
const safe = () => { try { return stored(); } catch { return null; } };
const queue = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'pending', 'lock.json'), 'utf8')); } catch { return { edits: [], notes: [] }; } };
const local = (b) => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars.lock || null)`).then(JSON.parse);
const stealth = (c) => c?.skills.find((s) => s.name === 'Stealth').p;
const api = (sid, path, body) => fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
// the DM's HP box on the sheet (the form shows Damage / Heal, or one button that follows the sign)
const hpBox = (b, n, how) => b.ev(`(() => { const f = document.querySelector('form[data-act=hp]'); document.querySelector('#hb-amt').value = '${how === 'dmg' ? -n : n}';
    f.requestSubmit(f.querySelector('button[value=${how}]') || f.querySelector('button[value=auto]')); return true; })()`);
const undoBtn = (b, starts) => b.ev(`(() => { const u = [...document.querySelectorAll('.hb-undo')].find((x) => !x.hidden && x.textContent.trim().startsWith(${JSON.stringify(starts)})); if (!u) return false; u.querySelector('button').click(); return true; })()`);
// what's different between two copies of the character, leaving out what DM edits always touch (log, applied ids) and stamps
function changed(a, b, path = '', out = []) {
    if (['rolls', 'dmApplied', 'updated', 'calc', 'view'].includes(path)) return out;
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changed(a[k], b[k], path ? `${path}.${k}` : k, out); return out; }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
    return out;
}

const A = await launch(FF ? 'firefox' : 'chrome'), B = await launch(FF ? 'chrome' : 'firefox');
let C = null;
const pat = A, dm = B;
try {
    for (const b of [pat, dm]) await b.block(/backup\.php|prefs\.php/);
    // Pat opens Lock once: the sheet keeps its worked-out max HP (calc) in the account
    await signIn(pat, SID.pat);
    await go(pat, BASE + '/characters/lock');
    is('the player\'s sheet saves its max HP for the fight tracker', (await waitFor(() => safe()?.calc?.hpMax))|| 0, 21);
    const S0 = stored();
    is('a calc-only save makes no new version', existsSync(join(ACCOUNTS, 'characters', 'lock', 'history', '2.json')), false);
    await go(pat, BASE + '/privacy/'); // Pat is away

    // ---- the DM damages the offline player and changes a skill ----
    await signIn(dm, SID.dm);
    await go(dm, BASE + '/characters/lock');
    is('DM mode: the bar says whose it is', await until(dm, text('#hb-dmbar'), (t) => t.includes('Changes go to Pat')), "Editing Pat's character as DM. Changes go to Pat.");
    is('DM mode: everything can be edited, but not the player\'s own tools', await dm.ev(`[[...document.querySelectorAll('#hb-sheet input')].every((i) => !i.disabled), !document.querySelector('[data-act=manage]')].join()`), 'true,true');
    // the server's list of what a DM may change mirrors the sheet's blank() and ROW makers (less what the DM never changes)
    const sheetFields = JSON.parse(await dm.ev(`JSON.stringify((() => {
        const out = {}, D = hbDm;
        const walk = (o, path) => {
            const key = D.pat(path);
            if (key === 'panels') { for (const p of o) for (const k in p) walk(p[k], ['panels', '#x', k]); return; } // the panels themselves are the layout
            if (path.length && !D.allowed(path)) return;
            if (Array.isArray(o)) {
                if (D.TAGS.test(key)) { out[key] = 'tags'; return; }
                const objs = o.length && o.every((x) => x && typeof x === 'object');
                out[key] = D.FIXED.test(key) || !objs ? 'list' : 'rows';
                const k = path[path.length - 1], seg = objs && o[0].id ? '#x' : k === 'skills' || k === 'abilities' ? '@x' : '0';
                for (const el of o) walk(el, [...path, seg]);
                return;
            }
            if (o && typeof o === 'object') { for (const k in o) walk(o[k], [...path, k]); return; }
            out[key] = typeof o === 'boolean' ? 'b' : D.AMOUNT.test(key) ? 'a' : 'v';
        };
        walk(hbShapes(), []);
        return out;
    })())`));
    const phpFields = JSON.parse(execFileSync(PHP, ['-r', `require '${ROOT.replace(/\\/g, '/')}/includes/dmedits.php'; echo json_encode(DM_FIELDS);`], { encoding: 'utf8' }));
    // "extra" boxes aren't in blank(): the sheet adds them (Flexible Casting, extra uses)
    const sortObj = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/(^|\.)extra$/.test(k)).sort(([a], [b]) => a.localeCompare(b)));
    is("the server's editable fields match the sheet's blank()", sortObj(phpFields), sortObj(sheetFields));
    await until(dm, `document.querySelector('#hb-amt') ? 1 : 0`);
    await hpBox(dm, 7, 'dmg');
    const stealthI = await dm.ev(`[...document.querySelectorAll('[data-act=prof]')].findIndex((b) => b.closest('tr, li, div')?.textContent.includes('Stealth'))`);
    await dm.ev(`document.querySelectorAll('[data-act=prof]')[${stealthI}].click()`);
    is('both edits queued for Pat', (await waitFor(() => queue().edits.length === 2 && queue().edits))?.map((e) => e.t), ['−7 HP', 'Stealth proficiency 0 → 0.5']);
    is('the DM never wrote the character file', JSON.stringify(stored()), JSON.stringify(S0));
    is("the DM's browser keeps no copy", await dm.ev(`!!JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars.lock`), false);
    is("the DM's copy shows the edits", await dm.ev(`document.querySelector('[data-k="hp.cur"]')?.value`), '14');

    // ---- Pat opens the sheet later: both edits, logged, nothing else changed ----
    await go(pat, BASE + '/characters/lock');
    const got = await (async () => { for (let i = 0; i < 60; i++) { const c = await local(pat); if (c?.hp.cur === 14 && stealth(c) === 0.5) return c; await sleep(150); } return local(pat); })();
    is('Pat sees both edits', [got.hp.cur, stealth(got)], [14, 0.5]);
    is('... with "DM" lines in the roll log', got.rolls.filter((r) => r.dm).map((r) => r.title), ['DM: Stealth proficiency 0 → 0.5', 'DM: −7 HP']);
    is('... and nothing else changed', changed(S0, got).sort(), ['hp.cur', `skills.${got.skills.findIndex((s) => s.name === 'Stealth')}.p`]);
    is('the account gets them with Pat\'s save', (await waitFor(() => safe()?.hp.cur === 14 && stealth(safe()) === 0.5)) || false, true);
    is('confirmed in the queue once saved', (await waitFor(() => queue().edits.every((e) => e.done > 0))) || false, true);
    is('the version is marked as a DM edit', (await waitFor(() => { try { return Object.keys(JSON.parse(readFileSync(join(ACCOUNTS, 'characters', 'lock', 'history', 'dm.json'), 'utf8'))).length > 0; } catch { return false; } })) || false, true);

    // ---- Pat undoes each; the log keeps both lines; the DM is told ----
    is('an Undo for each', [await undoBtn(pat, 'DM: −7 HP'), await undoBtn(pat, 'DM: Stealth')], [true, true]);
    const und = await local(pat);
    is('undone', [und.hp.cur, stealth(und)], [21, 0]);
    is('the log keeps both lines', und.rolls.filter((r) => r.dm).map((r) => r.title).slice(0, 2), ['Undid DM: Stealth proficiency 0 → 0.5', 'Undid DM: −7 HP']);
    is('the DM is told, on the open sheet', (await until(dm, `[...document.querySelectorAll('#hb-dmbar li span')].map((s) => s.textContent).join('|')`, (t) => t.includes('Pat undid: Stealth'), 10000)).split('|'), ['Pat undid: −7 HP', 'Pat undid: Stealth proficiency 0 → 0.5']);
    is('the account has the undo', (await waitFor(() => safe()?.hp.cur === 21 && stealth(safe()) === 0)) || false, true);
    await dm.ev(`document.querySelector('#hb-dmbar [data-note]').click()`);
    is('a line can be dismissed', await until(dm, `document.querySelectorAll('#hb-dmbar [data-note]').length`, (n) => n === 1), 1);
    is('... for good', (await waitFor(() => queue().notes.length === 1)) || false, true);

    // ---- the DM's copy follows Pat's changes live, without losing the DM's place ----
    await dm.ev(`document.querySelector('[data-k=race]').focus()`);
    await pat.ev(`(() => { const i = document.querySelector('[data-k=name]'); i.value = 'Lock the Bold'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); })()`);
    is("the DM's copy updates live", await until(dm, `document.querySelector('[data-k=name]').value`, (v) => v === 'Lock the Bold', 12000), 'Lock the Bold');
    is("... and the DM's field keeps focus", await dm.ev(`document.activeElement?.dataset.k`), 'race');
    await dm.ev(`document.activeElement.blur()`);

    // ---- a copy edited signed out, uploaded later, gets the edits it missed ----
    const L3 = await local(pat);
    await go(pat, BASE + '/privacy/');
    await dm.ev(`[...document.querySelectorAll('[data-act=tab]')].find((b) => b.textContent === 'Inventory')?.click()`);
    await until(dm, `!!document.querySelector('.hb-coinin')`);
    await dm.ev(`(() => { const i = document.querySelector('.hb-coinin'); i.value = '50g'; i.parentElement.querySelector('[data-sign="+"]').click(); return true; })()`);
    is('a coin edit queued', (await waitFor(() => queue().edits.find((e) => e.op === 'add' && e.path.join('/').endsWith('coins/gp'))))?.t, '+50 gp');
    C = await launch(FF ? 'chrome' : 'firefox');
    await C.block(/backup\.php|prefs\.php/);
    await go(C, BASE + '/privacy/');
    const away = { ...L3, name: 'Lock of the Road', updated: Date.now() };
    await C.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); localStorage.setItem('hb-sheet', ${JSON.stringify(JSON.stringify({ cur: 'lock', chars: { lock: away } }))}); 1`);
    await go(C, BASE + '/characters/lock');
    await sleep(1500);
    const gp = (c) => c?.panels.find((p) => p.type === 'items').coins.gp;
    is('signed out: nothing happens there', gp(await local(C)), gp(L3));
    await C.ev(`document.cookie = 'dndsid=${SID.pat}; path=/'`);
    await go(C, BASE + '/characters/lock');
    is('signed in: the upload gets the missed edit from the account', (await waitFor(() => safe()?.name === 'Lock of the Road' && gp(safe()) === gp(L3) + 50)) || false, true);
    is('... and so does this browser', await until(C, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.panels.find((p) => p.type === 'items').coins.gp`, (v) => v === gp(L3) + 50), gp(L3) + 50);

    // ---- two of Pat's devices open; one is typing a note when an edit lands: no double apply, nothing lost ----
    await signIn(pat, SID.pat);
    await go(pat, BASE + '/characters/lock');
    await until(pat, `JSON.parse(localStorage.getItem('hb-sheet') || '{}').chars?.lock?.name === 'Lock of the Road'`);
    for (const b of [pat, C]) await until(b, `document.querySelector('[data-act=logtab]') ? 1 : 0`, Boolean, 10000); // live (the table tabs show once in the campaign)
    await go(pat, BASE + '/characters/lock'); // reopen with the account's copy
    await sleep(1000);
    const notesTab = `(() => { const t = [...document.querySelectorAll('[data-act=tab]')].find((b) => b.textContent === 'Notes'); t?.click(); return !!t; })()`;
    await pat.ev(notesTab);
    await until(pat, `!!document.querySelector('[data-act=nopen]')`);
    await pat.ev(`document.querySelector('[data-act=nopen]').click()`);
    const noteK = await until(pat, `document.querySelector('textarea[data-k*=".notes."][data-k$=".body"]')?.dataset.k`, Boolean);
    await pat.ev(`(() => { const t = document.querySelector('[data-k="${noteK}"]'); t.focus(); t.value = 'Typed on device one'; t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    const hp0 = stored().hp.cur;
    await hpBox(dm, 3, 'dmg');
    const id3 = (await waitFor(() => queue().edits.find((e) => e.t === '−3 HP')))?.id;
    is('both devices apply it once', [await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === hp0 - 3), await until(C, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === hp0 - 3)], [hp0 - 3, hp0 - 3]);
    is('the note being typed keeps its text and focus', await pat.ev(`[document.activeElement?.dataset.k === '${noteK}', document.activeElement?.value].join()`), 'true,Typed on device one');
    await pat.ev(`(() => { document.activeElement.value += '!'; document.activeElement.dispatchEvent(new Event('input', { bubbles: true })); document.activeElement.blur(); return 1; })()`);
    const ok2 = await waitFor(() => { const s = safe(); return s && s.hp.cur === hp0 - 3 && JSON.stringify(s).includes('Typed on device one!') && s.dmApplied.filter((x) => x === id3).length === 1 && s; }, 10000);
    is('the account has the note and the edit, once', !!ok2, true);
    is('one DM line in the log', (ok2 || stored()).rolls.filter((r) => r.title === 'DM: −3 HP').length, 1);
    await go(C, BASE + '/privacy/');

    // ---- a reload mid-apply: applied once ----
    await hpBox(dm, 2, 'dmg');
    await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === hp0 - 5);
    await go(pat, BASE + '/characters/lock');
    await sleep(1500);
    is('reloaded mid-apply: applied once', [(await local(pat)).hp.cur, (await waitFor(() => safe()?.hp.cur === hp0 - 5)) || stored().hp.cur], [hp0 - 5, true]);

    // ---- archived with edits waiting: they apply on unarchive ----
    await go(pat, BASE + '/privacy/');
    await hpBox(dm, 4, 'dmg');
    await waitFor(() => queue().edits.find((e) => e.t === '−4 HP'));
    is('Pat archives Lock', (await fetch(`${BASE}/sheets/player/cloud.php?id=lock`, { method: 'DELETE', headers: { Cookie: 'dndsid=' + SID.pat } })).status, 200);
    await go(pat, BASE + '/characters/lock');
    await until(pat, `!!document.querySelector('.hb-arcnote')`);
    await sleep(1000);
    is('archived: the edit waits', [(await local(pat)).hp.cur, queue().edits.find((e) => e.t === '−4 HP').done], [hp0 - 5, 0]);
    await pat.ev(`document.querySelector('[data-act=unarchive]').click()`);
    is('unarchived: it applies', await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === hp0 - 9), hp0 - 9);
    is('... in the account too', (await waitFor(() => safe()?.hp.cur === hp0 - 9 && !safe().archived)) || false, true);
    // back in the campaign (archiving took it out)
    is('re-attached', (await api(SID.pat, '/campaigns/api.php', { act: 'characters', id: CAMP, characters: ['lock'] })).status, 200);

    // ---- undo one among several ----
    await go(pat, BASE + '/characters/lock');
    await until(pat, `document.querySelector('[data-act=logtab]') ? 1 : 0`, Boolean, 10000);
    await go(dm, BASE + '/characters/lock');
    await until(dm, text('#hb-dmbar'));
    const setField = (b, k, v) => b.ev(`(() => { const i = document.querySelector('[data-k="${k}"]'); i.focus(); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return 1; })()`);
    await setField(dm, 'age', '31');
    await dm.ev(`(() => { const b = [...document.querySelectorAll('[data-act=cond]')].find((x) => x.dataset.n === 'Poisoned'); b.click(); return 1; })()`);
    await setField(dm, 'alignment', 'Chaotic Good');
    const three = await until(pat, `(() => { const c = JSON.parse(localStorage.getItem('hb-sheet')).chars.lock; return c.age === '31' && c.conditions.includes('Poisoned') && c.alignment === 'Chaotic Good'; })()`);
    is('three edits arrive', three, true);
    is('undo the middle one', await undoBtn(pat, 'DM: Conditions'), true);
    const u3 = await local(pat);
    is('only that one is undone', [u3.age, u3.conditions.includes('Poisoned'), u3.alignment], ['31', false, 'Chaotic Good']);

    // ---- a conflict: Pat changed it first; Pat's value stays and the DM is told ----
    await setField(pat, 'senses', 'Darkvision 60 ft');
    await waitFor(() => safe()?.senses === 'Darkvision 60 ft');
    is('sent with an old value', (await api(SID.dm, '/sheets/player/dm.php', { act: 'send', c: CAMP, char: 'lock', edits: [{ id: 'conflict00001', at: Date.now(), t: 'Senses blank → Tremorsense', op: 'set', path: ['senses'], value: 'Tremorsense', was: '' }] })).queued, ['conflict00001']);
    await sleep(1500);
    is("Pat's value stays", (await local(pat)).senses, 'Darkvision 60 ft');
    is('the DM is told', (await until(dm, text('#hb-dmbar'), (t) => t.includes('Pat kept their own value for Senses blank → Tremorsense'), 10000)).includes('Pat kept their own value'), true);
    is('a removed row is refused with its name', (await api(SID.dm, '/sheets/player/dm.php', { act: 'send', c: CAMP, char: 'lock', edits: [{ id: 'removed000001', at: Date.now(), t: 'x', op: 'add', path: ['panels', '#nope:Inventory', 'rows', '#gone:Longsword', 'qty'], amt: 1 }] })).refused?.[0]?.why, 'Inventory was removed');

    // ---- the DM's own Undo sends the reverse ----
    const before = (await local(pat)).hp.cur;
    await hpBox(dm, 5, 'dmg');
    await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === before - 5);
    is("the DM's Undo", await undoBtn(dm, 'Sent to Pat: −5 HP'), true);
    is('... reaches Pat', await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === before), before);
    is('nothing left in the outbox', await dm.ev(`JSON.parse(localStorage.getItem('dm-outbox') || '[]').length`), 0);

    // ---- the DM offline: changes wait, then go ----
    await dm.ev(`(() => { const f = window.fetch; window.fetch = (u, o) => (window.cut && String(u).includes('dm.php') ? Promise.reject(new TypeError('offline')) : f(u, o)); window.cut = true; return 1; })()`);
    await hpBox(dm, 1, 'dmg');
    is('offline: changes paused', (await until(dm, text('#hb-dmbar'), (t) => t.includes('Offline, changes paused'))).includes('Offline, changes paused'), true);
    is('... kept in the outbox', await dm.ev(`JSON.parse(localStorage.getItem('dm-outbox') || '[]').length`), 1);
    await dm.ev(`window.cut = false; hbDm.flush().then(() => 1)`);
    is('back online: sent', await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === before - 1), before - 1);

    // ---- the fight tracker: player HP as cur/max, Damage / Heal / Temp as DM edits ----
    is('a fight', (await api(SID.dm, '/campaigns/api.php', { act: 'fight', id: CAMP, op: 'start' })).status, 200);
    const v = (await api(SID.dm, `/campaigns/fight.php?c=${CAMP}`)).fight.v;
    await api(SID.dm, '/campaigns/api.php', { act: 'fight', id: CAMP, op: 'add', items: [{ kind: 'pc', char: 'lock' }], v });
    await go(dm, `${BASE}/campaigns/${CAMP}`);
    const hpNow = (await local(pat)).hp.cur;
    is('the tracker shows HP as cur/max', (await until(dm, text('#cp-fight'), (t) => t.includes(`HP ${hpNow}/21`))).includes(`HP ${hpNow}/21`), true);
    await dm.ev(`(() => { const f = document.querySelector('#cp-fight .fi-hp[data-char=lock]'); f.querySelector('input').value = '6'; f.querySelector('button[value=dmg]').click(); return 1; })()`);
    is('Damage from the tracker reaches the sheet', await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === hpNow - 6), hpNow - 6);
    is('... and the tracker shows it', (await until(dm, text('#cp-fight'), (t) => t.includes(`HP ${hpNow - 6}/21`))).includes(`HP ${hpNow - 6}/21`), true);
    await dm.ev(`(() => { const f = document.querySelector('#cp-fight .fi-hp[data-char=lock]'); f.querySelector('input').value = '4'; f.querySelector('button[value=temp]').click(); return 1; })()`);
    is('Temp from the tracker', await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.temp`, (v) => v === 4), 4);
    await until(dm, `!!document.querySelector('#cp-fight .fi-hp[data-char=lock] input:not([disabled])')`);
    await dm.ev(`(() => { const f = document.querySelector('#cp-fight .fi-hp[data-char=lock]'); f.querySelector('input').value = '99'; f.querySelector('button[value=heal]').click(); return 1; })()`);
    is('Heal from the tracker stops at max', await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.hp.cur`, (v) => v === 21), 21);

    // ---- a DM roll on the sheet goes in as the character's roll ----
    await go(dm, BASE + '/characters/lock');
    await until(dm, text('#hb-dmbar'));
    await dm.ev(`document.querySelector('[data-act=roll]').click()`);
    is("a DM roll lands in Pat's roll log", await until(pat, `JSON.parse(localStorage.getItem('hb-sheet')).chars.lock.rolls[0]?.expr || ''`, (t) => /d20/.test(t)) !== '', true);
    is('... and in the table log, as the character', (await api(SID.pat, `/campaigns/log.php?c=${CAMP}`)).entries.some((e) => e.name === 'Lock of the Road' && /d20/.test(e.expr)), true);

    for (const [who, b] of [['player', pat], ['DM', dm]]) is(`no console errors (${who})`, b.errors.filter((e) => !/Failed to load resource|NetworkError|offline/i.test(e)), []);
} finally {
    A.close(); B.close(); C?.close();
    web.kill(); relay.kill();
    rmSync(TMP, { recursive: true, force: true });
}
console.log(bad ? `${bad} failed` : 'dm edits page ok');
process.exit(bad ? 1 : 0);
