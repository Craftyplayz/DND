// Checks the old-key aliases (content/aliases.json, monster/aliases.json): how they are worked out, and that every key a favourite or link
// could have been saved under before the content files and the monster rebuild still reaches an entry.
//   node _dev/scripts/compendium-aliases.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { aliases } = require('./build-monsters.js');
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../..', f), 'utf8'));

(async () => {
    const { aliasOf, contentAliases } = await import('./content/aliases.mjs');
    // how an old index finds its entry
    const e = { 'melfs-acid-arrow': "Melf's Acid Arrow", 'bigbys-hand': "Bigby's Hand", 'dragon-scale-mail': 'Dragon Scale Mail', 'mithral-armor-chain-mail': 'Mithral Armor (Chain Mail)', 'fire-bolt': 'Fire Bolt' };
    assert.strictEqual(aliasOf('acid-arrow', 'Acid Arrow', e), 'melfs-acid-arrow', 'a book owner in front of the name');
    assert.strictEqual(aliasOf('arcane-hand', 'Arcane Hand', e), 'bigbys-hand', 'a known rename');
    assert.strictEqual(aliasOf('dragon-scale-mail-red', 'Red Dragon Scale Mail', e), 'dragon-scale-mail', 'a variant goes to its parent');
    assert.strictEqual(aliasOf('mithral-armor', 'Mithral Armor', e), 'mithral-armor-chain-mail', 'a parent goes to a variant');
    assert.strictEqual(aliasOf('nothing', 'Nothing Like It', e), '', 'no match stays unresolved');
    const r = contentAliases({ spells: [['fire-bolt', 'Fire Bolt'], ['acid-arrow', 'Acid Arrow'], ['wd:fire-bolt', 'Fire Bolt']], magic: [], prior: { 'magic:magic:x': 'magic:2014:y', 'magic:magic:gone': 'magic:2014:nope' } }, { spells: { 'fire-bolt': { name: 'Fire Bolt' }, 'melfs-acid-arrow': { name: "Melf's Acid Arrow" } }, magic_items: { y: { name: 'Y' } } });
    assert.deepStrictEqual(r.aliases, { 'spell:acid-arrow': 'spell:2014:melfs-acid-arrow', 'magic:magic:x': 'magic:2014:y' }, 'only changed keys; an earlier alias stays while its target exists');

    // monsters: dropped keys go to the entry holding the name, never to the 2024 namesake; earlier aliases follow a move
    const now = [['o5e:new', 'Adult Red Dragon'], ['s24:adult-red-dragon', 'Adult Red Dragon'], ['s24:only', 'Only 2024']];
    assert.deepStrictEqual(aliases([['o5e:old', 'Red Dragon, Adult'], ['o5e:new', 'Adult Red Dragon'], ['o5e:gone', 'Only 2024']], now), { 'o5e:old': 'o5e:new' }, 'by name, not to 2024, and kept keys need none');
    assert.deepStrictEqual(aliases([['o5e:mid', 'Adult Red Dragon']], now, { 'o5e:first': 'o5e:mid' }), { 'o5e:first': 'o5e:new', 'o5e:mid': 'o5e:new' }, 'an alias whose target moved follows it');

    // the real files
    const a = read('sheets/player/content/aliases.json'), sp = read('sheets/player/content/2014-spells.json').spells, it = read('sheets/player/content/2014-items.json');
    const reach = (k) => { const [t, r, i] = (a[k] || '').split(':'); return r === '2014' && (t === 'spell' ? sp : it.magic_items)[i]; };
    for (const k of Object.keys(a)) assert.ok(reach(k), 'alias points nowhere: ' + k);
    for (const [k, n] of [...read('compendium/spells.json').list.map((x) => [x[0], x[1]]), ...read('sheets/player/extra-spells.json').map((s) => ['wd:' + s.index, s.name])]) {
        assert.ok(sp[k.replace(/^wd:/, '')] || reach('spell:' + k), `old spell key ${k} (${n}) reaches nothing`);
    }
    assert.strictEqual(a['spell:acid-arrow'], 'spell:2014:melfs-acid-arrow');
    assert.strictEqual(Object.keys(a).filter((k) => k.startsWith('spell:')).length, 17, 'the 17 renamed spells');
    assert.strictEqual(Object.keys(a).filter((k) => k.startsWith('magic:')).length, 111, 'the 111 magic items the SRD listed differently');
    const m = read('sheets/monster/aliases.json'), keys = new Set(read('sheets/monster/monsters.json').list.map((x) => x[0]));
    for (const [k, v] of Object.entries(m)) { assert.ok(keys.has(v), `monster alias ${k} -> ${v} points nowhere`); assert.ok(!keys.has(k), `alias for a key still listed: ${k}`); }
    assert.strictEqual(Object.keys(m).length, 347, 'the 347 Tome of Beasts monsters that moved');
    assert.strictEqual(m['o5e:abominable-beauty'], 'o5e:abominablebeauty-tob1-2023');
    console.log('compendium aliases ok');
})().catch((e) => { console.error(e); process.exit(1); });
