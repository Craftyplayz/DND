// Checks sheets/player/versions.js, the change list of the Versions dialog (ROADMAP 0.5).   usage: node _dev/scripts/dnd-sheet-versions.test.js
const assert = require('assert');
require('../../sheets/player/versions.js');
const ch = globalThis.hbChanges;
const words = (a, b) => ch(a, b).map((x) => x.t);
const note = (id, title, body, extra = {}) => ({ id, title, group: '', body, pinned: false, created: 1, updated: 1, ...extra });
const base = () => ({
    id: 'c', updated: 1, name: 'Lock', race: 'Elf', art: '', artUrl: '', archived: 0, rolls: [], view: { tab: '' },
    hp: { cur: 23, base: 20, temp: 0, mod: 0 }, insp: false, conditions: [],
    abilities: [{ key: 'STR', name: 'Strength', score: 14, save: false, sb: '' }],
    classes: [{ name: 'Fighter', level: 3, die: 10, hdUsed: 0 }],
    profs: { armour: [], weapons: [], langs: ['Common'], tools: [], notes: '' },
    panels: [
        { id: 'p1', type: 'items', title: 'Inventory', on: true, sub: 'all', rows: [{ id: 'r1', name: 'Rope', qty: 1, wt: 10 }] },
        { id: 'p2', type: 'attacks', title: 'Actions', on: true, sub: 'all', rows: [] },
        { id: 'p3', type: 'notes', title: 'Notes', on: true, open: '', notes: [note('n1', 'Backstory', 'Born in a barn.')] },
    ],
});
const edit = (fn) => { const c = base(); fn(c); return c; };

assert.deepStrictEqual(words(base(), base()), []);
// what doesn't count: stamps, roll log, view settings, the open note, the portrait moving into the account
assert.deepStrictEqual(words(base(), edit((c) => { c.updated = 9; c.rolls = [{ total: 20 }]; c.view.tab = 'x'; c.panels[2].open = 'n1'; c.panels[0].sub = 'Gear'; })), []);
assert.deepStrictEqual(words({ ...base(), art: 'sha:abcdef012345' }, { ...base(), art: '', artUrl: '/sheets/player/art.php?id=c&v=abcdef012345' }), []);
// one line per change, in words
assert.deepStrictEqual(words(base(), edit((c) => { c.hp.cur = 18; })), ['HP 23 → 18']);
assert.deepStrictEqual(words(base(), edit((c) => { c.hp.cur = '23'; })), []);
assert.deepStrictEqual(words(base(), edit((c) => { c.abilities[0].score = 16; c.abilities[0].save = true; })), ['Strength score 14 → 16', 'Strength save on']);
assert.deepStrictEqual(words(base(), edit((c) => { c.classes[0].level = 4; })), ['Fighter level 3 → 4']);
assert.deepStrictEqual(words(base(), edit((c) => { c.name = ''; })), ['Name Lock → blank']);
assert.deepStrictEqual(words(base(), edit((c) => { c.conditions = ['Poisoned']; c.profs.langs = ['Elvish']; })), ['Conditions: added Poisoned', 'Languages: added Elvish', 'Languages: removed Common']);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[1].rows.push({ id: 'r2', name: 'Longsword' }); })), ['added Longsword to Actions']);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[0].rows = []; })), ['removed Rope from Inventory']);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[0].rows[0].wt = 4; })), ['Inventory: Rope weight 10 → 4']);
// reordering is one line per moved thing
assert.deepStrictEqual(words(base(), edit((c) => { c.panels.reverse(); })).length, 2);
assert.deepStrictEqual(words(base(), edit((c) => { [c.panels[0], c.panels[1]] = [c.panels[1], c.panels[0]]; })).length, 1);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[1].title = 'Attacks'; c.panels[1].on = false; })), ['renamed Actions panel to Attacks', 'hid Attacks panel']);
// long text: one line, with the whole old and new text to show on a click
const long = ch(base(), edit((c) => { c.panels[2].notes[0].body = 'Born in a barn.\nRaised by wolves.'; }));
assert.deepStrictEqual(long, [{ t: "edited note 'Backstory'", old: 'Born in a barn.', new: 'Born in a barn.\nRaised by wolves.' }]);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[2].notes.push(note('n2', 'Session 1', '')); })), ["added note 'Session 1'"]);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[2].notes[0].archived = 5; })), ["archived note 'Backstory'"]);
assert.deepStrictEqual(words(base(), edit((c) => { c.panels[2].notes[0].pinned = true; })), ["pinned note 'Backstory'"]);
// archive and the portrait
assert.deepStrictEqual(words(base(), edit((c) => { c.archived = 5; })), ['Archived']);
assert.deepStrictEqual(words(edit((c) => { c.archived = 5; }), base()), ['Unarchived']);
assert.deepStrictEqual(words(base(), edit((c) => { c.artUrl = '/sheets/player/art.php?id=c&v=abcdef012345'; })), ['Portrait added']);
assert.deepStrictEqual(words({ ...base(), artUrl: 'x1' }, { ...base(), artUrl: 'x2' }), ['Portrait changed']);
// nested rows without ids: by position
const dmg = (d) => edit((c) => { c.panels[1].rows.push({ id: 'r2', name: 'Longsword', dmg: d }); });
assert.deepStrictEqual(words(dmg([{ dice: '1d8', type: 'Slashing' }]), dmg([{ dice: '1d10', type: 'Slashing' }])), ['Actions: Longsword damage dice 1d8 → 1d10']);
// a fields the sheet doesn't know yet still shows, by its key
assert.deepStrictEqual(words(base(), edit((c) => { c.newThing = 'x'; })), ['NewThing blank → x']);
console.log('versions ok');
