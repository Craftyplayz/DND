// Homebrew classes, subclasses, races, subraces and backgrounds through build.js (ROADMAP 4.6), against a table worked by hand:
// a d10 half caster "Blood Hunter" with STR and WIS saves, a "Rage" feature that must do nothing, its own Crimson rite resource, a choice, a level 1 subclass pick.
//   node _dev/scripts/homebrew-class.test.js
require('../../sheets/player/formula.js');
const assert = require('assert');
const B = require('../../sheets/player/build.js'), HC = require('../../assets/js/homebrew-content.js');
let n = 0;
const M = require('../../sheets/player/model.js')(() => 'u' + (n++).toString(36));
const srd = require('../../sheets/player/srd-build.json');
const is = (name, got, want) => assert.deepStrictEqual(got, want, name);

const klass = { id: 'hbloodhunt', kind: 'class', name: 'Blood Hunter', hitDie: 10, saves: ['STR', 'WIS'], armour: ['light-armor', 'shields'], weapons: ['simple-weapons'], weaponOther: 'Longswords', tools: "Alchemist's supplies", skillChoose: 2, skillFrom: ['Arcana', 'Stealth', 'Survival'], skillsFixed: ['Insight'], hpPerLevel: 1,
    asi: [2], subLevel: 2, subLabel: 'Hunter order', columns: [{ name: 'Rite die', values: ['d4', 'd4', 'd6'] }, { name: 'Rites', values: [1, 2, 3] }],
    levels: [{ n: 1, feats: [{ id: 'f1', name: 'Rage', text: 'Only a name here.', uses: 'PROF', reset: 'short', grants: 'Perception, Heavy armor' }, { id: 'f2', name: 'Hunter style', text: 'Pick one.', choose: 1, options: [{ id: 'a', name: 'Dueling', text: 'Duels.' }, { id: 'b', name: 'Defense', text: 'Defends.' }] }] },
        { n: 2, feats: [{ id: 'f3', name: 'Expertise', text: 'Not official expertise.' }, { id: 'f4', name: 'Keen eye', text: 'Sees well.', pick: 'expert', pickN: 1 }] }, { n: 3, feats: [{ id: 'f5', name: 'Primal Champion', text: 'Does nothing to scores.' }, { id: 'f6', name: 'Jack of All Trades', text: 'No half proficiency.' }] }],
    caster: 'half', ability: 'INT', prep: 'known', slots: HC.slotsFor('half'), cantripsKnown: [0, 1, 1], spellsKnown: [0, 2, 3], spells: [{ id: 'bless', name: 'Bless', level: 1 }, { id: 'no-such-spell', name: 'Lost Spell', level: 1 }],
    resources: [{ name: 'Crimson rite', at: 1, kind: 'count', reset: 'short', maxType: 'level', values: [1, 2, 2] }, { name: 'Blood points', at: 2, kind: 'pips', reset: 'long', maxType: 'column', column: 'Rites' }, { name: 'Maledict', at: 1, reset: 'long', maxType: 'formula', formula: 'BLOODHUNTER_LEVEL + 1' }],
    equip: { fixed: [{ ref: 'dagger', name: 'Dagger', n: 2 }, { ref: 'hb-hmoonblade', name: 'Moon Blade', n: 1 }], choices: [{ options: [{ items: [{ ref: 'longsword', name: 'Longsword', n: 1 }] }, { items: [{ ref: 'shield', name: 'Shield', n: 1 }, { cat: 'simple-weapons', n: 1 }] }] }, { text: 'A keepsake of your choice' }] },
    goldN: 3, goldMult: 10, multiMin: [{ ab: 'STR', score: 13 }, { ab: 'INT', score: 13 }], multiArmour: ['light-armor'], multiWeapons: ['simple-weapons'] };
const order = { id: 'horderghost', kind: 'subclass', name: 'Order of the Ghost', parent: 'hb-hbloodhunt', flavour: 'Hunter order', hpPerLevel: 2, text: 'Ghostly.', levels: [{ n: 1, feats: [{ id: 'g1', name: 'Early sight', text: 'Comes at the pick.' }] }, { n: 3, feats: [{ id: 'g2', name: 'Fade', text: 'Fades.' }] }], spells: [{ id: 'cure-wounds', name: 'Cure Wounds', level: 1, at: 2 }] };
const fighterPath = { id: 'hpathearly', kind: 'subclass', name: 'Early Fighter', parent: 'fighter', levels: [{ n: 1, feats: [{ id: 'e1', name: 'Too soon', text: 'Early.' }] }, { n: 3, feats: [{ id: 'e3', name: 'On time', text: 'At 3.' }] }] };
const race = { id: 'hrbogfolk1', kind: 'race', name: 'Bogfolk', size: 'Small', speed: 25, text: 'Of the bog.', bonuses: [{ ab: 'CON', n: 2 }], bonusChoose: 1, langs: ['common', 'sylvan'], langOther: 'Bogspeak', langChoose: 1, traits: [{ id: 't1', name: 'Dwarven Toughness', text: 'A name only.', uses: '1', reset: 'long' }, { id: 't2', name: 'Mudsense', text: 'Knows mud.' }],
    darkvision: 90, resist: 'Poison, Cold', speeds: [{ type: 'Swim', ft: 30 }], skills: ['Nature'], tools: 'Herbalism kit', skillChoose: 1, skillFrom: ['Stealth', 'Survival'], cantrips: [{ id: 'light', name: 'Light', level: 0 }], cantripChoose: 1, cantripFrom: [{ id: 'mage-hand', name: 'Mage Hand', level: 0 }, { id: 'guidance', name: 'Guidance', level: 0 }] };
const subrace = { id: 'hrdeepmud1', kind: 'subrace', name: 'Deep Bogfolk', parent: 'hb-hrbogfolk1', bonuses: [{ ab: 'WIS', n: 1 }], traits: [{ id: 's1', name: 'Deep breath', text: 'Holds it.' }], resist: 'Acid' };
const elfSub = { id: 'hrelfsub01', kind: 'subrace', name: 'Moss Elf', parent: 'elf', traits: [{ id: 'm', name: 'Moss', text: 'Mossy.' }] };
const bg = { id: 'hbgmudlark', kind: 'background', name: 'Mudlark', text: 'Finds things.', skills: ['Investigation'], tools: "Thieves' tools", langChoose: 1, gold: 12, featureName: 'River rat', featureText: 'Knows the river.', equip: { fixed: [{ ref: 'dagger', name: 'Dagger', n: 1 }], choices: [] }, traitsTable: 'Muddy\nDamp', abilities: ['DEX', 'WIS', 'CHA'], feat: 'Grappler' };
const moon = { id: 'hmoonblade', kind: 'item', name: 'Moon Blade', cat: 'Weapon', wcat: 'Martial', wrange: 'Melee', dice: '1d8', dtype: 'Radiant', updated: 1 };

function data() {
    const d = B.mergeContent(srd, { spells: { bless: { name: 'Bless', level: 1 }, 'cure-wounds': { name: 'Cure Wounds', level: 1 }, 'mage-hand': { name: 'Mage Hand', level: 0 }, light: { name: 'Light', level: 0 } } });
    for (const x of [klass, order, fighterPath, race, subrace, elfSub, bg]) HC.add(d, HC.toContent(x), '2014');
    // as Homebrew.addTo does for an item
    d.equipment['hb-hmoonblade'] = { name: 'Moon Blade', rules: '2014', hbx: moon };
    d.hbParts = () => [{ panel: 'items', row: { name: 'Moon Blade', cat: 'Weapons' }, hbsrc: { id: moon.id } }, { panel: 'attacks', row: { name: 'Moon Blade', hit: 'STR', dmg: [{ dice: '1d8 + STR', type: 'Radiant' }] }, hbsrc: { id: moon.id } }];
    return d;
}
const D = data(), id = 'hb-hbloodhunt', K = D.classes[id];
const choices = (over) => Object.assign(B.blankChoices(), { method: 'std', std: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }, race: 'hb-hrbogfolk1', sub: 'hb-hrdeepmud1', bg: 'hb-hbgmudlark',
    raceOpts: { ab: ['DEX'], lang: ['elvish'], ['hbs:hb-hrbogfolk1']: ['skill-stealth'], ['hbc:hb-hrbogfolk1']: ['mage-hand'] }, bgOpts: { langs: ['orc'], ab: { k: '21', two: 'DEX', one: 'WIS' } } }, over);
const entry = (levels, sub = 'hb-horderghost') => ({ id, levels, sub, opts: { [B.fid(K.levels[0].features[1], 1)]: ['hb-f2-a'] }, profs: { 0: ['skill-arcana', 'skill-survival'] }, picks: {}, asi: { 2: { k: '+2', a: ['STR'] } }, spells: ['bless'] });
const P = (c, t) => c.panels.find((p) => p.type === t), row = (c, t, nm) => P(c, t).rows.find((r) => r.name === nm), res = (c, nm) => row(c, 'trackers', nm);

// ---- the shape ----
is('in the class list', B.listOf(D, 'classes', '2014').some((c) => c.id === id && c.name === 'Blood Hunter'), true);
is('subclass of it', B.subsOf(id, D, '2014').map((s) => s.id), ['hb-horderghost']);
is('its pick level comes from the form', B.subLevel(id, D), 2);
is('its improvements come from the form', B.asiLevels(K), [2]);
is('half caster', B.casterOf(id, D), { ab: 'INT', kind: 'half' });
is('its spell counts', B.spellCounts(id, 3, D, { INT: 14 }), { cantrips: 1, known: 3, prepared: 0, book: 0 });
is('its list, and a spell this data lacks shows by name', B.spellPool(id, 'hb-horderghost', D).map((s) => s.name).sort(), ['Bless', 'Cure Wounds', 'Lost Spell']);
is('(a) or (b) reads like official text', K.starting_equipment_options[0].desc, '(a) Longsword or (b) Shield, any simple weapons');
is('gold', B.goldDice(id, D), [3, 10]);

// ---- level 3, worked by hand ----
const c3 = B.build(choices({ level: 3, classes: [entry(3)] }), D, M);
// CON 13 + 2 racial = 15 (+2): hit points 10 at 1, 6 at each of 2 and 3 (die avg), +1 class and +2 subclass per level = 10 + 12 + 9 = 31 base, + 3 x 2 CON = 37
is('hit points', c3.hp.base, 31);
is('hit points now', c3.hp.cur, 37);
is('saves', c3.abilities.filter((a) => a.save).map((a) => a.key), ['STR', 'WIS']);
is('scores: +2 STR at 2, racial, the +1 chosen, subrace WIS, the background DEX and WIS', c3.abilities.map((a) => a.score), [17, 17, 15, 12, 12, 8]);
is('skills', c3.skills.filter((s) => s.p).map((s) => s.name), ['Arcana', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival']);
is('armour and weapons', [c3.profs.armour, c3.profs.weapons.includes('Simple weapons')], [['Light armour', 'Shields', 'Heavy armour'], true]);
is('a homebrew Rage only has what its fields say', [row(c3, 'list', 'Rage').uses, row(c3, 'list', 'Rage').reset, res(c3, 'Rage')], ['PROF', 'short', undefined]);
is('the picked option is a row', !!row(c3, 'list', 'Dueling'), true);
is('its resources', [res(c3, 'Crimson rite').max, res(c3, 'Crimson rite').reset, res(c3, 'Blood points').max, res(c3, 'Blood points').kind, res(c3, 'Maledict').max], ['2', 'short', '3', 'pips', 'BLOODHUNTER_LEVEL + 1']);
is('Jack of All Trades by name does nothing', c3.skills.some((s) => s.p === 0.5), false);
is("Primal Champion by name doesn't raise scores", c3.abilities[0].score, 17);
is('the early subclass feature arrives at the pick, the later one at 3', [row(c3, 'list', 'Early sight').src, row(c3, 'list', 'Fade').src], ['Blood Hunter 2', 'Blood Hunter 3']);
is('spell slots: half caster at 3', P(c3, 'spells').slots.slice(0, 2).map((s) => s.max), [3, 0]);
is('the spell picked', P(c3, 'spells').rows.map((r) => r.name).includes('Bless'), true);
is('slots use the class ability', P(c3, 'spells').dc, '8 + PROF + INT');

// ---- race and background ----
is('race', [c3.race, c3.speeds, P(c3, 'details').f.size], ['Deep Bogfolk', [{ type: 'Walk', ft: 25, hover: false }, { type: 'Swim', ft: 30, hover: false }], 'Small']);
is('darkvision', c3.passives.find((p) => p.name === 'Darkvision').f, '90');
is('resistances, subrace too', c3.res, 'Poison, Cold, Acid');
is('languages', c3.profs.langs.sort(), ['Bogspeak', 'Common', 'Elvish', 'Orc', 'Sylvan']);
is('tools', c3.profs.tools.map((t) => t.name).sort(), ["Alchemist's supplies", 'Herbalism kit', "Thieves' tools"]);
is('cantrips, fixed and picked', P(c3, 'spells').rows.filter((r) => !r.lvl).map((r) => r.name).sort(), ['Light', 'Mage Hand']);
is('Dwarven Toughness by name gives no hit points, its row has a counter', [row(c3, 'list', 'Dwarven Toughness').uses, row(c3, 'list', 'Dwarven Toughness').hbf], ['1', 1]);
is('feature of the background', row(c3, 'list', 'River rat').src, 'Background');
is('its gold', P(c3, 'items').coins.gp, 12);
is('its feat', !!row(c3, 'list', 'Grappler'), true);

// ---- gear: a picked homebrew weapon gets its rows, a typed choice is what was typed ----
const geared = B.build(choices({ level: 1, classes: [entry(1)], equip: { mode: 'gear', picks: { c0: { o: 1, items: ['club'] }, c1: { text: 'Old locket' } }, gold: 0, extra: [] } }), D, M);
is('fixed, picked and typed gear', P(geared, 'items').rows.map((r) => r.name).sort(), ['Club', 'Dagger', 'Moon Blade', 'Old locket', 'Shield']);
is("a homebrew item from the class's list has its action", row(geared, 'attacks', 'Moon Blade').dmg[0].type, 'Radiant');

// ---- level up 1 to 3, as a member would ----
let c = B.build(choices({ level: 1, classes: [entry(1, '')] }), D, M);
is('level 1', [c.classes[0].level, c.hp.base, res(c, 'Crimson rite').max, res(c, 'Blood points')], [1, 11, '1', undefined]);
c = B.levelUp(c, { cls: id, entry: { ...entry(2), levels: undefined }, hp: { mode: 'avg' } }, D, M);
is('level 2', [c.classes[0].level, c.hp.base, res(c, 'Crimson rite').max, res(c, 'Blood points').max, c.abilities[0].score, !!row(c, 'list', 'Keen eye'), !!row(c, 'list', 'Early sight')], [2, 11 + 6 + 3, '2', '2', 17, true, true]);
const edited = JSON.parse(JSON.stringify(c)), before = JSON.stringify(c);
row(edited, 'list', 'Dueling').text = 'My own words.';
c = B.levelUp(edited, { cls: id, entry: { ...entry(3), levels: undefined }, hp: { mode: 'avg' } }, D, M);
is('level 3', [c.classes[0].level, c.hp.base, res(c, 'Blood points').max, !!row(c, 'list', 'Fade')], [3, 11 + 2 * 9, '3', true]);
is('level up never rewrites a row', row(c, 'list', 'Dueling').text, 'My own words.');
is('and leaves the character it was given alone', JSON.stringify(JSON.parse(before)) === before, true);

// ---- an official class with a homebrew subclass: the pick level doesn't move ----
is('Fighter still picks at 3', B.subLevel('fighter', D), 3);
const f = (lv) => B.featuresAt('fighter', 'hb-hpathearly', lv, D).map((x) => x.name);
is('nothing early at 1', f(1).includes('Too soon'), false);
is('it arrives at 3, with the one for 3', ['Too soon', 'On time'].every((x) => f(3).includes(x)), true);
is('an official race with a lone homebrew subrace has no bonus from it', B.bonuses(Object.assign(B.blankChoices(), { race: 'elf', sub: '' }), D).DEX, 2);

// ---- Start from: official content into the form and back ----
const seed = { id: 'hstartfrom', kind: 'class', name: 'My Fighter', ...HC.fromOfficial('class', srd.classes.fighter) };
const back = HC.toContent(seed).e;
is('hit die and saves survive', [back.hit_die, back.saving_throws], [10, ['str', 'con']]);
is('skills survive', back.proficiency_choices[0].choose, 2);
is('improvements survive', back.hbAsi, [4, 6, 8, 12, 14, 16, 19]);
is('features survive', back.levels[0].features.map((x) => x.name), srd.classes.fighter.levels[0].features.map((x) => x.name));
is('a choice survives', back.levels[0].features.find((x) => x.choices).choices.options.length, srd.classes.fighter.levels[0].features.find((x) => x.choices).choices.options.length);
is('(a) or (b) survives', back.starting_equipment_options.length, srd.classes.fighter.starting_equipment_options.length);
const d2 = data();
HC.add(d2, HC.toContent(seed), '2014');
is('and it builds', B.build(choices({ level: 2, classes: [{ id: 'hb-hstartfrom', levels: 2, opts: {}, profs: {}, picks: {}, asi: {}, spells: [] }] }), d2, M).classes[0].level, 2);
const wiz = HC.fromOfficial('class', srd.classes.wizard);
is('a caster keeps its table', [wiz.caster, wiz.slots[19].join(''), wiz.prep], ['full', '433332211'.padEnd(9, '0').slice(0, 9), 'prepared']);
const r2 = HC.fromOfficial('race', srd.races.dwarf), bg2 = HC.fromOfficial('background', srd.backgrounds.acolyte);
is('a race and a background', [r2.speed, r2.bonuses, bg2.skills, bg2.langChoose], [25, [{ ab: 'CON', n: 2 }], ['Insight', 'Religion'], 2]);

// ---- slot tables ----
is('half caster table', [HC.slotsFor('half')[0].join(''), HC.slotsFor('half')[4].slice(0, 2), HC.slotsFor('half')[19].slice(0, 5)], ['000000000', [4, 2], [4, 3, 3, 3, 2]]);
is('third caster table', [HC.slotsFor('third')[2].slice(0, 1), HC.slotsFor('third')[18].slice(0, 4)], [[2], [4, 3, 3, 1]]);
is('pact table', [HC.slotsFor('pact')[0][0], HC.slotsFor('pact')[10][4]], [1, 3]);
console.log('homebrew class ok');
