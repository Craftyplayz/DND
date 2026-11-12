// Checks DM edits (ROADMAP 1.5): sheets/player/dmedit.js (the sheets) and includes/dmedits.php (the account) must apply every
// edit the same way, the DM's sheet must turn its changes into the right small edits, and each edit's Undo must put things back.
//   node _dev/scripts/dm-edits.test.js   (runs PHP too: C:/php/php.exe on Windows, else php)
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
require('../../sheets/player/dmedit.js');
const { apply, run, diff, words, where } = globalThis.hbDm;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const ROOT = join(__dirname, '../..');

let bad = 0;
const is = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); } else console.log(`ok   ${name}`);
};
const clone = (x) => JSON.parse(JSON.stringify(x));

// a character with something of every kind the DM can change
const CHAR = {
    id: 'kai1', updated: 5, archived: 0, name: 'Kai', race: 'Elf', art: '', artUrl: '/sheets/player/art.php?id=kai1&v=0123456789ab', hp: { cur: 20, base: 20, temp: 3, mod: 0 }, exhaustion: 0, insp: false,
    abilities: [{ key: 'STR', name: 'Strength', score: 14, save: false, sb: '' }, { key: 'CON', name: 'Constitution', score: 12, save: true, sb: '' }],
    skills: [{ name: 'Stealth', ab: 'DEX', p: 0, b: '' }, { name: 'Arcana', ab: 'INT', p: 1, b: '' }],
    classes: [{ name: 'Rogue', level: 3, die: 8, hdUsed: 1 }], conditions: ['Prone'], profs: { armour: [], weapons: [], langs: ['Common'], tools: [], notes: '' },
    speeds: [{ type: 'Walk', ft: 30, hover: false }], rolls: [], view: { tab: '' }, calc: { hpMax: 26 }, dmApplied: [],
    panels: [
        { id: 'pi', type: 'items', title: 'Inventory', on: true, sub: 'all', coins: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 }, attMax: 3,
            rows: [{ id: 'r1', cat: 'Weapons', eq: true, att: '', name: 'Longsword', qty: 1, wt: 3, gp: '15', props: ['Versatile'], notes: '' }] },
        { id: 'ps', type: 'spells', title: 'Spells', on: true, sub: 'all', rows: [], slots: [{ max: 4, used: 1 }, { max: 2, used: 0 }], sp: { cur: 0, max: 0, used: 0 }, meta: [], flex: [2, 3] },
        { id: 'pn', type: 'notes', title: 'Notes', on: true, sub: 'all', open: '', sort: 'edited', notes: [{ id: 'n1', title: 'Backstory', group: '', body: 'Born in a barn.', pinned: false, archived: 0, created: 1, updated: 1 }] },
        { id: 'pc', type: 'combat', title: 'Death saves and hit dice', on: true, sub: 'all', ok: 0, bad: 0 },
    ],
};
const E = (op, x) => ({ id: 'e' + Math.random().toString(36).slice(2, 12), at: 1000, t: 'a change', op, ...x });
const INV = ['panels', '#pi:Inventory'];

// ---- one edit at a time: JS and PHP must agree on the character and the outcome ----
const CASES = [
    ['damage soaks temp HP first', E('hp', { how: 'dmg', amt: 7 })],
    ['healing stops at max', E('hp', { how: 'heal', amt: 50 })],
    ['temp HP doesn\'t stack', E('hp', { how: 'temp', amt: 2 })],
    ['temp HP higher replaces', E('hp', { how: 'temp', amt: 8 })],
    ['set a score', E('set', { path: ['abilities', '@STR', 'score'], value: 16, was: 14 })],
    ['set: conflict keeps the player\'s value', E('set', { path: ['abilities', '@STR', 'score'], value: 16, was: 13 })],
    ['set: the same value is no conflict', E('set', { path: ['abilities', '@STR', 'score'], value: '14', was: 10 })],
    ['skill by name', E('set', { path: ['skills', '@Stealth', 'p'], value: 1, was: 0 })],
    ['class by position and name', E('add', { path: ['classes', '0:Rogue', 'hdUsed'], amt: 1 })],
    ['class whose name changed is refused', E('add', { path: ['classes', '0:Wizard', 'hdUsed'], amt: 1 })],
    ['coins', E('add', { path: [...INV, 'coins', 'gp'], amt: 50 })],
    ['coins never below 0', E('add', { path: [...INV, 'coins', 'gp'], amt: -500 })],
    ['item quantity by id', E('add', { path: [...INV, 'rows', '#r1:Longsword', 'qty'], amt: 2 })],
    ['a removed row is refused', E('add', { path: [...INV, 'rows', '#gone:Rope', 'qty'], amt: 1 })],
    ['slots used', E('add', { path: ['panels', '#ps:Spells', 'slots', '0:', 'used'], amt: 1 })],
    ['a new amount field (extra boxes)', E('add', { path: ['panels', '#ps:Spells', 'slots', '1:', 'extra'], amt: 1 })],
    ['death saves', E('add', { path: ['panels', '#pc:Death saves and hit dice', 'bad'], amt: 1 })],
    ['exhaustion', E('add', { path: ['exhaustion'], amt: 2 })],
    ['condition added', E('tag', { path: ['conditions'], value: 'Poisoned', on: true })],
    ['condition removed', E('tag', { path: ['conditions'], value: 'Prone', on: false })],
    ['language added', E('tag', { path: ['profs', 'langs'], value: 'Elvish', on: true })],
    ['item property removed', E('tag', { path: [...INV, 'rows', '#r1:Longsword', 'props'], value: 'Versatile', on: false })],
    ['row added at the end', E('row', { path: [...INV, 'rows'], row: { id: 'r2', cat: 'Gear', eq: false, att: '', name: 'Rope', qty: 1, wt: 10, gp: '1', props: [], notes: '' } })],
    ['row removed', E('unrow', { path: [...INV, 'rows', '#r1:Longsword'] })],
    ['a note is archived, not removed', E('unrow', { path: ['panels', '#pn:Notes', 'notes', '#n1:Backstory'] })],
    ['note text', E('set', { path: ['panels', '#pn:Notes', 'notes', '#n1:Backstory', 'body'], value: 'Born in a palace.', was: 'Born in a barn.' })],
    ['flag', E('set', { path: ['insp'], value: true, was: false })],
    ['a roll into the log', E('roll', { roll: { at: 1, title: 'Stealth', expr: '1d20 + 3', shown: '12 + 3', total: 15, nat: '' } })],
    ['the roll log is not the DM\'s', E('set', { path: ['rolls'], value: 'x', was: '' })],
    ['view settings are not the DM\'s', E('set', { path: ['view', 'tab'], value: 'x', was: '' })],
    ['panel layout is not the DM\'s', E('set', { path: ['panels', '#pi:Inventory', 'on'], value: false, was: true })],
    ['archiving is not the DM\'s', E('set', { path: ['archived'], value: 5, was: 0 })],
    ['portrait is not the DM\'s to set', E('set', { path: ['art'], value: 'x', was: '' })],
    ['a new portrait from the map', E('art', { value: 'data:image/jpeg;base64,/9j/AAAA' })],
    ['a portrait that isn\'t a picture', E('art', { value: 'https://evil.example/x.png' })],
    ['a panel can\'t be removed', E('unrow', { path: ['panels', '#pi:Inventory'] })],
    ['wrong kind of value', E('set', { path: ['insp'], value: 'yes', was: false })],
];
const js = CASES.map(([, e]) => { const c = clone(CHAR), r = run(c, clone(e), { hpMax: 26 }); return { c, ok: !!r.ok, conflict: !!r.conflict, why: r.why || '' }; });
const php = JSON.parse(spawnSync(PHP, ['-r', `require '${ROOT.replace(/\\/g, '/')}/includes/dmedits.php';
    $in = json_decode(file_get_contents('php://stdin'));
    $out = [];
    foreach ($in->edits as $e) { $c = json_decode(json_encode($in->char)); $r = dm_run($c, $e, 26); $out[] = ['c' => $c, 'ok' => $r['ok'] ?? false, 'conflict' => $r['conflict'] ?? false, 'why' => $r['why'] ?? '']; }
    echo json_encode($out);`], { input: JSON.stringify({ char: CHAR, edits: CASES.map(([, e]) => e) }), encoding: 'utf8' }).stdout || 'null');
// a note archived "now"; no extra boxes is the same as 0 of them
const norm = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'archived' && v > 1e12 ? 'now' : k === 'extra' && v === 0 ? undefined : v)));
CASES.forEach(([name], i) => is(`JS and PHP agree: ${name}`, norm(php?.[i]), norm(js[i])));

// what each case did (from the JS result)
const R = Object.fromEntries(CASES.map(([n], i) => [n, js[i]]));
is('damage: 3 temp soaked, 4 off HP', [R['damage soaks temp HP first'].c.hp.cur, R['damage soaks temp HP first'].c.hp.temp], [16, 0]);
is('heal: capped at 26', R['healing stops at max'].c.hp.cur, 26);
is('temp: 3 stays', R['temp HP doesn\'t stack'].c.hp.temp, 3);
is('conflict reported, value kept', [R['set: conflict keeps the player\'s value'].conflict, R['set: conflict keeps the player\'s value'].c.abilities[0].score], [true, 14]);
is('removed row: refused with its name', R['a removed row is refused'].why, 'Rope was removed');
is('renamed class: refused', R['class whose name changed is refused'].why, 'Wizard was removed');
is('coins: +50', R.coins.c.panels[0].coins.gp, 60);
is('row added at the end', R['row added at the end'].c.panels[0].rows.map((r) => r.name), ['Longsword', 'Rope']);
is('note archived, kept', R['a note is archived, not removed'].c.panels[2].notes.length === 1 && R['a note is archived, not removed'].c.panels[2].notes[0].archived > 0, true);
for (const n of ['the roll log is not the DM\'s', 'view settings are not the DM\'s', 'panel layout is not the DM\'s', 'archiving is not the DM\'s', 'portrait is not the DM\'s to set', 'a portrait that isn\'t a picture', 'a panel can\'t be removed', 'wrong kind of value'])
    is(`refused: ${n}`, R[n].ok, false);
is('the roll log gets "DM: ..." for an applied edit', R.coins.c.rolls[0], { at: 1000, title: 'DM: a change', expr: '', shown: '', total: '', dm: 1 });
is('a new portrait replaces both art fields', [R['a new portrait from the map'].c.art, R['a new portrait from the map'].c.artUrl, R['a new portrait from the map'].c.rolls[0].title], ['data:image/jpeg;base64,/9j/AAAA', '', 'DM: a change']);
is('a new portrait replaces both art fields', [R['a new portrait from the map'].c.art, R['a new portrait from the map'].c.artUrl, R['a new portrait from the map'].c.rolls[0].title], ['data:image/jpeg;base64,/9j/AAAA', '', 'DM: a change']);
is('a DM roll goes in as it was rolled', R['a roll into the log'].c.rolls.map((r) => r.title), ['Stealth']);
is('a refused edit is still marked applied (never tried twice)', R['a removed row is refused'].c.dmApplied.length, 1);

// ---- once per id, archived waits ----
{
    const c = clone(CHAR), e = E('hp', { how: 'dmg', amt: 5 });
    run(c, e, {}); run(c, clone(e), {});
    is('the same edit twice applies once', c.hp, { cur: 18, base: 20, temp: 0, mod: 0 });
    const a = clone(CHAR); a.archived = 9;
    is('an archived character waits', [run(a, E('hp', { how: 'dmg', amt: 5 }), {}).wait, a.hp.cur, a.dmApplied.length], [true, 20, 0]);
}

// ---- every applied edit's Undo puts the character back ----
for (const [name, e] of CASES) {
    const c = clone(CHAR), r = apply(c, clone(e), { hpMax: 26 });
    if (!r.ok || e.op === 'roll') continue;
    for (const op of r.inv) apply(c, op, { hpMax: 26 });
    is(`undo: ${name}`, norm(c), norm(CHAR));
}

// ---- the DM's sheet: its changes become the right edits ----
{
    const a = clone(CHAR), b = clone(CHAR);
    b.abilities[0].score = 16; b.skills[0].p = 1; b.hp.cur = 13; b.conditions.push('Poisoned'); b.panels[0].coins.gp = 60;
    b.panels[0].rows[0].qty = 3; b.panels[0].rows.push({ id: 'r9', cat: 'Gear', eq: false, att: '', name: '', qty: 1, wt: 0, gp: '', props: [], notes: '' });
    b.panels[2].notes[0].body = 'Born at sea.'; b.panels[2].notes[0].updated = 99;
    b.classes.push({ name: 'Wizard', level: 1, die: 6, hdUsed: 0 }); b.speeds.splice(0, 1);
    b.view.tab = 'x'; b.rolls.push({ title: 'x' }); b.panels[0].on = false; b.panels.reverse();
    const ops = diff(a, b);
    is('diff: one edit per change, none for view, log or layout', ops.map((o) => [o.op, o.path.join('/'), o.value ?? o.amt ?? o.row?.name ?? '', o.was ?? '']), [
        ['add', 'hp/cur', -7, ''],
        ['set', 'abilities/@STR/score', 16, 14],
        ['set', 'skills/@Stealth/p', 1, 0],
        ['row', 'classes', 'Wizard', ''],
        ['tag', 'conditions', 'Poisoned', ''],
        ['unrow', 'speeds/0:Walk', '', ''],
        ['add', 'panels/#pi:Inventory/coins/gp', 50, ''],
        ['add', 'panels/#pi:Inventory/rows/#r1:Longsword/qty', 2, ''],
        ['row', 'panels/#pi:Inventory/rows', '', ''],
        ['set', 'panels/#pn:Notes/notes/#n1:Backstory/body', 'Born at sea.', 'Born in a barn.'],
    ]);
    // the edits, applied to the player's copy, give the DM's copy (apart from what the DM can't change)
    const c = clone(CHAR);
    for (const o of ops) apply(c, o, { hpMax: 26 });
    const keep = (x) => { const y = clone(x); delete y.view; delete y.rolls; y.panels = y.panels.map(({ on, ...p }) => ({ ...p, notes: p.notes?.map(({ updated, ...n }) => n) })).sort((p, q) => p.id.localeCompare(q.id)); return y; };
    is('diff then apply: the same character', keep(c), keep(b));
    // a row removed from the middle of a list without ids
    const m = clone(CHAR); m.classes = [{ name: 'A', level: 1 }, { name: 'B', level: 1 }, { name: 'C', level: 1 }];
    const n = clone(m); n.classes.splice(1, 1); n.classes[1].level = 2;
    is('diff: a middle row removed, the next one still found by name', diff(m, n).map((o) => [o.op, o.path.join('/'), o.value ?? '']), [['unrow', 'classes/1:B', ''], ['set', 'classes/1:C/level', 2]]);
    const mm = clone(m);
    for (const o of diff(m, n)) apply(mm, o, {});
    is('... and applied', mm.classes, n.classes);
}

// ---- words and the sheet's own paths ----
const changes = (a, b) => (a.hp.cur !== b.hp.cur ? [{ t: `HP ${a.hp.cur} → ${b.hp.cur}` }] : a.panels[0].coins.gp !== b.panels[0].coins.gp ? [{ t: `Inventory coins gp ${a.panels[0].coins.gp} → ${b.panels[0].coins.gp}` }] : [{ t: 'Strength score 14 → 16' }]);
is('words: damage', words({ op: 'hp', how: 'dmg', amt: 7 }), '−7 HP');
is('words: coins', words({ op: 'add', path: [...INV, 'coins', 'gp'], amt: 50 }, CHAR, CHAR, changes), '+50 gp');
is('words: a set, as the Versions dialog says it', words({ op: 'set', path: ['abilities', '@STR', 'score'] }, CHAR, CHAR, changes), 'Strength score 14 → 16');
is('where: the sheet\'s path', where(CHAR, [...INV, 'rows', '#r1:Longsword', 'qty']), 'panels.0.rows.0.qty');
is('where: gone', where(CHAR, [...INV, 'rows', '#nope', 'qty']), null);

console.log(bad ? `${bad} failed` : 'dm edits ok');
process.exit(bad ? 1 : 0);
