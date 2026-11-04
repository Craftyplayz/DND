// Checks the action log's comparison in assets/js/stats.js: what each change to a character logs, and the sort of each roll.
//   node _dev/scripts/stats.test.js
const assert = require('node:assert');
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const S = require('../../assets/js/stats.js');

const base = () => ({ id: 'x', hp: { cur: 20, temp: 5, base: 20, mod: 0 }, calc: { hpMax: 20 }, insp: false, exhaustion: 0, conditions: [], classes: [{ name: 'Monk', level: 3, die: 8, hdUsed: 0 }],
    panels: [
        { id: 'c', type: 'combat', ok: 0, bad: 0 },
        { id: 's', type: 'spells', slots: [{ max: 2, used: 0 }, { max: 1, used: 0 }], sp: { cur: 0, max: 3, used: 0 }, rows: [] },
        { id: 't', type: 'trackers', rows: [{ id: 'r1', name: 'Rage', kind: 'pips', used: 0 }, { id: 'r2', name: 'Ki', kind: 'count', cur: 3 }, { id: 'r3', name: 'Pact', kind: 'levels', levels: [{ used: 0 }] }] },
        { id: 'a', type: 'attacks', rows: [{ id: 'a1', name: 'Breath', uses: '1', used: 0 }, { id: 'a2', name: 'Sword', uses: '', used: 0 }] },
        { id: 'i', type: 'items', coins: { gp: 10, sp: 0 }, rows: [{ id: 'p', name: 'Potion', cat: 'Consumables', qty: 2 }] },
    ] });
const change = (fn) => { const a = base(), b = base(); fn(b); return S.diff(S.facts(a), S.facts(b)); };
const panel = (c, type) => c.panels.find((p) => p.type === type);

assert.deepStrictEqual(change(() => {}), [], 'nothing changed, nothing logged');
assert.deepStrictEqual(change((c) => { c.hp.temp = 0; c.hp.cur = 18; }), [{ t: 'hp', d: -2, td: -5, cur: 18, temp: 0, max: 20 }], 'damage through temp HP');
assert.deepStrictEqual(change((c) => { panel(c, 'combat').bad = 1; }), [{ t: 'death', dok: 0, dbad: 1, ok: 0, bad: 1 }], 'a death save');
assert.deepStrictEqual(change((c) => { c.insp = true; }), [{ t: 'insp', on: true }], 'inspiration');
assert.deepStrictEqual(change((c) => { c.conditions = ['Poisoned']; }), [{ t: 'cond', name: 'Poisoned', on: true }], 'a condition');
assert.deepStrictEqual(change((c) => { panel(c, 'spells').slots[1].used = 1; }), [{ t: 'use', what: 'slot', name: 'Spell slot', lvl: 2, d: 1 }], 'a slot by level');
assert.deepStrictEqual(change((c) => { panel(c, 'trackers').rows[0].used = 1; }), [{ t: 'use', what: 'tracker', name: 'Rage', d: 1 }], 'pips count up');
assert.deepStrictEqual(change((c) => { panel(c, 'trackers').rows[1].cur = 1; }), [{ t: 'use', what: 'tracker', name: 'Ki', d: 2 }], 'a count going down is spent');
assert.deepStrictEqual(change((c) => { panel(c, 'trackers').rows[2].levels[0].used = 1; }), [{ t: 'use', what: 'tracker', name: 'Pact', lvl: 1, d: 1 }], 'a tracker with levels');
assert.deepStrictEqual(change((c) => { panel(c, 'attacks').rows[0].used = 1; }), [{ t: 'use', what: 'ability', name: 'Breath', d: 1 }], 'a limited-use ability');
assert.deepStrictEqual(change((c) => { c.classes[0].hdUsed = 2; }), [{ t: 'use', what: 'hitdie', name: 'Monk', d: 2 }], 'hit dice');
assert.deepStrictEqual(change((c) => { c.classes[0].level = 4; }), [{ t: 'level', name: 'Monk', d: 1, now: 4 }], 'a level');
assert.deepStrictEqual(change((c) => { panel(c, 'items').coins.gp = 4; }), [{ t: 'coin', coin: 'gp', d: -6, now: 4 }], 'coins');
assert.deepStrictEqual(change((c) => { panel(c, 'items').rows[0].qty = 1; }), [{ t: 'item', name: 'Potion', cat: 'Consumables', d: -1, qty: 1 }], 'one drunk');
assert.deepStrictEqual(change((c) => { panel(c, 'items').rows.push({ id: 'q', name: 'Rope', cat: 'Gear', qty: 1 }); }), [{ t: 'item', name: 'Rope', cat: 'Gear', d: 1, qty: 1 }], 'an item gained');
assert.deepStrictEqual(change((c) => { panel(c, 'trackers').rows.push({ id: 'n', name: 'New', kind: 'pips', used: 2 }); }), [], 'a new tracker row is not an action');
assert.deepStrictEqual(change((c) => { c.name = 'Renamed'; c.rolls = [1]; c.view = { tab: 'x' }; }), [], 'names, rolls and view settings are not actions');

for (const [title, key, want] of [['Stealth check', 'skill:3', 'skill'], ['Dexterity save', 'save:1', 'save'], ['Strength check', 'mod:0', 'check'], ["Thieves' tools check", 'tool:0', 'tool'], ['Initiative', 'fs:init', 'init'], ['Initiative with advantage', '', 'init'],
    ['Longsword to hit', '', 'attack'], ['Longsword to hit with disadvantage', '', 'attack'], ['Longsword slashing damage', '', 'damage'], ['Coin flip', '', 'coin'], ['Dice', '', 'other']]) assert.strictEqual(S.kind(title, key), want, title);

// the flow: a change is logged once; a copy that came from elsewhere logs nothing; an Undo is marked; a DM edit keeps the DM's time
const out = () => JSON.parse(store['stats-outbox'] || '[]');
const c = base();
S.prime(c);
c.hp.cur = 15; S.note({ asked: 5 }); S.saw(c, true);
assert.deepStrictEqual([out().length, out()[0].t, out()[0].d, out()[0].asked, out()[0].char], [1, 'hp', -5, 5, 'x'], 'a button change is logged at once');
S.saw(c, true);
assert.strictEqual(out().length, 1, 'the same state again logs nothing');
c.hp.cur = 20; S.note({ undo: 1 }); S.saw(c, true);
assert.deepStrictEqual([out().length, out()[1].undo, out()[1].d], [2, 1, 5], 'an Undo is marked');
const pulled = base(); pulled.hp.cur = 1; pulled.id = 'x';
S.prime(pulled); S.saw(pulled, true);
assert.strictEqual(out().length, 2, 'a newer copy from the account logs nothing');
pulled.hp.cur = 0; S.applied(pulled, { edit: 'abc/def', at: 1234, by: 'dm', asked: 1 });
assert.deepStrictEqual([out().length, out()[2].at, out()[2].by, out()[2].asked, out()[2].id], [3, 1234, 'dm', 1, 'dm-abcdef-0'], "a DM edit keeps the DM's time, and an id every device agrees on");
pulled.hp.cur = 9; S.sync(pulled); S.saw(pulled, true);
assert.strictEqual(out().length, 3, 'a change logged elsewhere is not logged again');
for (let i = 0; i < 2100; i++) S.add('x', { t: 'rest', kind: 'long' });
assert.strictEqual(out().length, 2000, 'the outbox never grows past its cap');
console.log('stats ok');
process.exit(0); // the outbox's send timer is still waiting
