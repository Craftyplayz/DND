// Checks games/dnd/sheets/player-dev/ddb.js with a tiny made-up D&D Beyond character.   usage: node _dev/scripts/dnd-sheet-ddb.test.js
const assert = require('assert');
require('../../games/dnd/sheets/player-dev/ddb.js');
const stat = (id, value) => ({ id, value });
const C = {
    id: 1, name: 'Test', readonlyUrl: 'https://dndbeyond.com/characters/1', alignmentId: 1, age: 30,
    stats: [stat(1, 16), stat(2, 14), stat(3, 14), stat(4, 10), stat(5, 12), stat(6, 8)], bonusStats: [], overrideStats: [],
    classes: [{ level: 3, hitDiceUsed: 1, definition: { name: 'Fighter', hitDice: 10 }, classFeatures: [] }],
    race: { fullName: 'Human', weightSpeeds: { normal: { walk: 30, fly: 0 } }, racialTraits: [] },
    modifiers: { class: [{ type: 'proficiency', subType: 'strength-saving-throws' }, { type: 'proficiency', subType: 'athletics' }, { type: 'proficiency', subType: 'martial-weapons' }], race: [{ type: 'bonus', subType: 'strength-score', value: 1 }] },
    inventory: [
        { id: 10, equipped: true, quantity: 1, definition: { name: 'Chain Mail', filterType: 'Armor', armorTypeId: 3, armorClass: 16, weight: 55 } },
        { id: 11, equipped: true, quantity: 1, definition: { name: 'Shield', filterType: 'Armor', armorTypeId: 4, armorClass: 2, weight: 6 } },
        { id: 12, equipped: true, quantity: 1, definition: { name: 'Longsword', filterType: 'Weapon', categoryId: 2, attackType: 1, damage: { diceString: '1d8' }, damageType: 'Slashing', properties: [{ name: 'Versatile', notes: '1d10' }], weight: 3 } },
    ],
    baseHitPoints: 22, removedHitPoints: 5, temporaryHitPoints: 3, currencies: { gp: 12 },
    traits: { personalityTraits: '<p>Brave &amp; loud</p>' }, notes: {}, characterValues: [],
};
const R = { abilitySkills: [{ id: 1, name: 'Athletics', stat: 1 }, { id: 2, name: 'Stealth', stat: 2 }], alignments: [{ id: 1, name: 'Lawful Good' }] };
const x = hbFromDdb(C, R);
assert.strictEqual(x.scores.STR, 17);
assert.deepStrictEqual(x.classes, [{ name: 'Fighter', level: 3, die: 10, hdUsed: 1, sub: '' }]);
assert.strictEqual(x.ac, '16 [Chain Mail] + 2 [Shield]');
assert.strictEqual(x.saves.STR.prof, true);
assert.strictEqual(x.saves.DEX.prof, false);
assert.deepStrictEqual(x.skills.find((s) => s.name === 'Athletics'), { name: 'Athletics', ab: 'STR', p: 1, b: '', total: 5 });
assert.deepStrictEqual(x.hp, { max: 28, cur: 23, temp: 3 }); // 22 + CON 2 x 3 levels
assert.strictEqual(x.actions[0].hit, 'STR + PROF');
assert.deepStrictEqual(x.actions[0].dmg, [{ dice: '1d8 + STR', type: 'Slashing' }]);
assert.ok(x.actions[0].desc.startsWith('Two-handed: 1d10 + STR'));
assert.strictEqual(x.alignment, 'Lawful Good');
assert.deepStrictEqual(x.notes, [{ title: 'Personality traits', group: 'Character', body: 'Brave & loud' }, { title: 'Appearance', group: 'Character', body: 'Age: 30' }]);
assert.deepStrictEqual(x.items.rows.map((i) => i.cat), ['Armour', 'Armour', 'Weapons']);
console.log('dnd sheet ddb import ok');
