// Checks sheets/player/srd-build.json (made by _dev/scripts/build-srd.mjs).   usage: node _dev/scripts/srd-build.test.js
const assert = require('assert');
const fs = require('fs');
const d = require('../../sheets/player/srd-build.json');
assert.deepStrictEqual(Object.keys(d), ['meta', 'classes', 'subclasses', 'races', 'subraces', 'backgrounds', 'feats']);
assert.match(d.meta.licence, /CC-BY-4\.0/);
const hit = { barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8, paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6 };
assert.deepStrictEqual(Object.keys(d.classes).sort(), Object.keys(hit));
assert.strictEqual(Object.keys(d.races).length, 9);
assert.ok(d.backgrounds.acolyte && d.feats.grappler);
const PROF = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
for (const [k, c] of Object.entries(d.classes)) {
    assert.strictEqual(c.hit_die, hit[k], k + ' hit die');
    assert.strictEqual(c.levels.length, 20, k + ' levels');
    c.levels.forEach((l, i) => { assert.strictEqual(l.level, i + 1); assert.strictEqual(l.prof_bonus, PROF[i], k + ' prof ' + (i + 1)); });
    assert.ok(c.levels[0].features.length, k + ' level 1 features');
    for (const l of c.levels) for (const f of l.features) assert.ok(f.name && f.desc.length, k + ' feature text ' + f.index);
    assert.ok(c.saving_throws.length === 2 && c.starting_equipment_options && c.multi_classing && c.proficiencies.length, k + ' facts');
    assert.strictEqual(c.subclasses.length, 1);
    assert.ok(d.subclasses[c.subclasses[0]].levels.length, k + ' subclass levels');
    if (c.spellcasting) { assert.ok(c.spells.length > 10, k + ' spell list'); assert.ok(c.levels.every((l) => l.spellcasting), k + ' slots'); }
}
const slots = (k, lv) => Object.entries(d.classes[k].levels[lv - 1].spellcasting).filter(([n]) => /^spell_slots_level_/.test(n)).map(([, v]) => v);
assert.deepStrictEqual(slots('wizard', 5), [4, 3, 2, 0, 0, 0, 0, 0, 0]);   // full caster
assert.deepStrictEqual(slots('paladin', 5), [4, 2, 0, 0, 0]);  // half caster
assert.deepStrictEqual(slots('warlock', 5), [0, 0, 2, 0, 0, 0, 0, 0, 0]);  // pact magic
assert.strictEqual(d.classes.fighter.spellcasting, undefined);
assert.strictEqual(d.classes.barbarian.levels[0].class_specific.rage_count, 2);
// choice lists
const choices = (k, n) => d.classes[k].levels.flatMap((l) => l.features).find((f) => f.name === n).choices.options.length;
assert.ok(choices('fighter', 'Fighting Style') >= 6 && choices('sorcerer', 'Metamagic') === 8 && choices('warlock', 'Eldritch Invocations') >= 30);
// races: traits carry text; subraces add to their parent
assert.ok(d.races.dwarf.subraces.includes('hill-dwarf') && d.subraces['hill-dwarf'].traits.length);
for (const r of Object.values(d.races)) assert.ok(r.traits.every((t) => t.desc.length));
// every name the sheet already offers still resolves: SRD races/classes are in sheet.js's inline lists
const src = fs.readFileSync(__dirname + '/../../sheets/player/sheet.js', 'utf8');
for (const n of [...Object.values(d.races), ...Object.values(d.subraces), ...Object.values(d.classes)].map((e) => e.name)) assert.ok(src.includes("'" + n + "'") || src.includes(n.toLowerCase() + ':'), 'sheet.js lost ' + n);
console.log('srd build ok');
