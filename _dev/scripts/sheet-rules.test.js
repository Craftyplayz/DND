// The rules behind ROADMAP 4.4 and 4.5, with no page (sheet-rules.mjs drives the sheet itself): multiclass slots by rules version, third casters,
// known and prepared counts, the per-class limit lines, starting items' weights, and magic items taking their base item's weight.
require('../../sheets/player/formula.js');
const assert = require('assert'), fs = require('fs'), path = require('path');
const B = require('../../sheets/player/build.js'), modelOf = require('../../sheets/player/model.js');
const ROOT = path.join(__dirname, '../../sheets/player');
const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
function dataFor(rules) {
    const d = B.mergeContent(rules === '2014' ? json('srd-build.json') : { meta: {} });
    for (const f of json('content/index.json').files) if ((f.rules || '2014') === rules) B.addContent(d, json('content/' + f.file), rules);
    return d;
}
const is = (what, got, want) => assert.deepStrictEqual(got, want, what);
const D14 = dataFor('2014'), D24 = dataFor('2024');
let n = 0; const M = modelOf(() => 'u' + (n++));
const three = (x) => x.slots.slice(0, 4).filter(Boolean).join('/');

// ---- multiclass slots: one table, half casters round by rules version ----
is('paladin 4 / sorcerer 3, 2014', three(B.slotsFor({ paladin: 4, sorcerer: 3 }, D14)), '4/3/2');
is('paladin 4 / sorcerer 3, 2024', three(B.slotsFor({ paladin: 4, sorcerer: 3 }, D24)), '4/3/2');
is('paladin 5 / sorcerer 1, 2014 rounds down', three(B.slotsFor({ paladin: 5, sorcerer: 1 }, D14)), '4/2');
is('paladin 5 / sorcerer 1, 2024 rounds up', three(B.slotsFor({ paladin: 5, sorcerer: 1 }, D24)), '4/3');
is('ranger 5 / wizard 2, 2014', B.slotsFor({ ranger: 5, wizard: 2 }, D14).casterLevel, 4);
is('ranger 5 / wizard 2, 2024', B.slotsFor({ ranger: 5, wizard: 2 }, D24).casterLevel, 5);
is('artificer 5 / wizard 1 rounds up, 2014', three(B.slotsFor({ artificer: 5, wizard: 1 }, D14)), '4/3');
is('artificer 5 / wizard 1 rounds up, 2024', three(B.slotsFor({ artificer: 5, wizard: 1 }, D24)), '4/3');
is('warlock levels never count', B.slotsFor({ warlock: 5, wizard: 3 }, D14).casterLevel, 3);

// ---- third casters: numbers checked against the PHB's and the 2024 PHB's tables ----
const KNOWN = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
const SLOTS = { 3: [2], 4: [3], 7: [4, 2], 10: [4, 3], 13: [4, 3, 2], 16: [4, 3, 3], 19: [4, 3, 3, 1], 20: [4, 3, 3, 1] };
for (const [cls, sub, cant, cant10] of [['fighter', 'eldritch-knight', 2, 3], ['rogue', 'arcane-trickster', 3, 4]]) for (const [D, key] of [[D14, 'known'], [D24, 'prepared']]) {
    is(`${sub} is a third caster with INT`, B.casterOf(cls, D, sub), { ab: 'INT', kind: 'third' });
    is(`${cls} without it is not a caster`, B.casterOf(cls, D).kind, 'none');
    for (let l = 3; l <= 20; l++) {
        const c = B.spellCounts(cls, l, D, { INT: 14 }, sub);
        is(`${sub} ${l} ${key}`, c[key], KNOWN[l - 1]);
        is(`${sub} ${l} cantrips`, c.cantrips, l >= 10 ? cant10 : cant);
    }
    for (const [l, want] of Object.entries(SLOTS)) is(`${sub} ${l} slots`, B.slotsFor({ [cls]: +l }, D, { [cls]: sub }).slots.filter(Boolean), want);
    is(`${sub} before its subclass level`, B.spellCounts(cls, 2, D, {}, sub).cantrips, 0);
    is(`${sub} counts a third in a multiclass`, B.slotsFor({ [cls]: 7, wizard: 3 }, D, { [cls]: sub }).casterLevel, 5);
    assert.ok(B.spellPool(cls, sub, D).some((s) => /^magic missile$/i.test(s.name)), `${sub} picks from the wizard's list`);
    is(`${sub} has no spells without the subclass`, B.spellPool(cls, '', D).length, 0);
}
is('prepares: third casters only in 2024', [B.prepares('fighter', D14, 'eldritch-knight'), B.prepares('fighter', D24, 'eldritch-knight')], [false, true]);

// ---- counts that came out 0 ----
is('artificer 2014: INT + half, rounded down', B.spellCounts('artificer', 5, D14, { INT: 16 }), { cantrips: 2, known: 0, prepared: 5, book: 0 });
is('artificer 2014 level 1, at least 1', B.spellCounts('artificer', 1, D14, { INT: 8 }).prepared, 1);
is('artificer 2024: the class table', B.spellCounts('artificer', 5, D24, { INT: 16 }).prepared, 6);
is('herald: CHA + half, rounded down', B.spellCounts('herald', 5, D14, { CHA: 14 }), { cantrips: 3, known: 0, prepared: 4, book: 0 });
for (const [D, id] of [[D14, 'artificer'], [D14, 'herald'], [D24, 'artificer']]) assert.ok(B.prepares(id, D), id + ' prepares');
for (const [rules, D] of [['2014', D14], ['2024', D24]]) for (const c of B.listOf(D, 'classes', rules)) {
    if (['none', 'pact'].includes(B.casterOf(c.id, D).kind) && c.id !== 'warlock') continue;
    const s = B.spellCounts(c.id, 5, D, { INT: 14, CHA: 14, WIS: 14 });
    assert.ok(s.known + s.prepared + s.book > 0, `${rules} ${c.id} has spells to count at level 5`);
}

// ---- building: rules version, weights, the 2024 pack ----
const build = (D, rules, cls, levels, over = {}) => B.build(Object.assign(B.blankChoices(), { rules, method: 'std', std: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }, level: levels, classes: [{ id: cls, levels, opts: {}, profs: {}, picks: {}, asi: {}, spells: [] }] }, over), D, M);
const inv = (c) => c.panels.find((p) => p.type === 'items').rows;
is('a 2024 build records its version', build(D24, '2024', 'fighter', 1).rulesVer, '2024');
is('a 2014 build leaves it blank', build(D14, '2014', 'fighter', 1).rulesVer, '');
is('rulesOf: blank is 2014', B.rulesOf({ rulesVer: '' }), '2014');
is('rulesOf: a built 2024 character saved before the field', B.rulesOf({ rulesVer: '', build: { rules: '2024' } }), '2024');
is('rulesOf: the sheet\'s own choice wins', B.rulesOf({ rulesVer: '2014', build: { rules: '2024' } }), '2014');
const row = (c, name) => inv(c).find((r) => r.name === name);
{
    const wt = (name, ref, D = D14) => B.itemWeight(name, D, M, ref);
    is('a bundle counts per piece: 20 arrows are 1 lb', wt('Arrow', 'arrow') * 20, 1);
    is('20 crossbow bolts are 1.5 lb', wt('Crossbow bolt', 'crossbow-bolt') * 20, 1.5);
    is('armour by its content name', wt('Leather Armor', 'leather-armor'), 10);
    is('tools', wt("Thieves' Tools", 'thieves-tools'), 1);
    is('gear by the sheet\'s own list', wt('Hempen rope (50 ft)'), 10);
    is('2024 arrows too', wt('Arrows', 'arrows', D24) * 20, 1);
    is('nothing known is 0', wt('Sister\'s letter'), 0);
    const ch = build(D14, '2014', 'rogue', 1, { equip: { mode: 'gear', picks: { c0: { o: 0, items: [] }, c1: { o: 0, items: [] }, c2: { o: 0, items: [] }, c3: { o: 0, items: [] } }, gold: 0, extra: [] } });
    assert.ok(inv(ch).filter((r) => +r.wt > 0).length > inv(ch).filter((r) => !+r.wt).length, 'a built rogue has its weights');
    is('starting leather armour weighs 10 lb', inv(ch).find((r) => /leather/i.test(r.name))?.wt, 10);
    // the 2024 Dungeoneer's Pack comes unpacked with its weights: the fighter's or anyone's who picks it
    const parts = D24.equipment['dungeoneer-pack'].contents;
    assert.ok(parts.length > 3, 'the pack lists its contents');
    const D = { ...D24, classes: { ...D24.classes, fighter: { ...D24.classes.fighter, starting_equipment: [{ equipment: 'dungeoneer-pack', quantity: 1 }], starting_equipment_options: [] } } };
    const made = build(D, '2024', 'fighter', 1, { equip: { mode: 'gear', picks: {}, gold: 0, extra: [] } });
    is('the pack itself isn\'t a row', inv(made).some((r) => /^dungeoneer/i.test(r.name)), false);
    is('its contents are', inv(made).length, parts.length);
    assert.ok(row(made, 'Crowbar')?.wt === 5, 'the crowbar weighs 5 lb');
}

// ---- level up raises a "Spell slots" resource the sheet shows instead of the panel's own ----
{
    const c = build(D14, '2014', 'wizard', 1);
    const res = c.panels.find((p) => p.type === 'trackers');
    res.rows.push(Object.assign(M.ROW.tracker(), { name: 'Spell slots', kind: 'levels', levels: [Object.assign(M.ROW.level(), { label: '1st', max: '2', used: 1 }), Object.assign(M.ROW.level(), { label: '2nd', max: 'LEVEL' })] }));
    const up = B.levelUp(c, { cls: 'wizard', entry: {}, hp: { mode: 'avg' } }, D14, M);
    const t = up.panels.find((p) => p.type === 'trackers').rows.find((r) => r.name === 'Spell slots');
    is('the resource is raised, with what was used kept', [t.levels[0].max, t.levels[0].used], ['3', 1]);
    is('the panel\'s own is raised too', up.panels.find((p) => p.type === 'spells').slots[0].max, 3);
    const three1 = B.levelUp(B.levelUp(up, { cls: 'wizard', entry: {}, hp: { mode: 'avg' } }, D14, M), { cls: 'wizard', entry: {}, hp: { mode: 'avg' } }, D14, M);
    const t3 = three1.panels.find((p) => p.type === 'trackers').rows.find((r) => r.name === 'Spell slots');
    is('a formula is left alone', t3.levels[1].max, 'LEVEL');
    is('slots only rise', B.levelUp(Object.assign(JSON.parse(JSON.stringify(c)), {}), { cls: 'wizard', entry: {}, hp: { mode: 'avg' } }, D14, M).panels.find((p) => p.type === 'spells').slots[0].max, 3);
    t.levels[0].max = '9';
    is('a higher hand-typed number stays', B.levelUp(up, { cls: 'wizard', entry: {}, hp: { mode: 'avg' } }, D14, M).panels.find((p) => p.type === 'trackers').rows.find((r) => r.name === 'Spell slots').levels[0].max, '9');
    // a level up that picks the subclass makes a fighter a caster at once
    const f = build(D14, '2014', 'fighter', 2);
    const f3 = B.levelUp(f, { cls: 'fighter', entry: { sub: 'eldritch-knight', spells: [] }, hp: { mode: 'avg' } }, D14, M);
    is('Eldritch Knight at level 3 gets its slots', f3.panels.find((p) => p.type === 'spells').slots[0].max, 2);
    is('and keeps them in the next level', B.levelUp(f3, { cls: 'fighter', entry: {}, hp: { mode: 'avg' } }, D14, M).panels.find((p) => p.type === 'spells').slots[0].max, 3);
}

// ---- the limit lines ----
{
    const c = M.blank();
    c.classes = [Object.assign(M.ROW.cls(), { name: 'Paladin', level: 4 }), Object.assign(M.ROW.cls(), { name: 'Sorcerer', level: 3 })];
    c.abilities.find((a) => a.key === 'CHA').score = 16;
    const sp = c.panels.find((p) => p.type === 'spells');
    const add = (name, lvl, source, prep) => sp.rows.push(Object.assign(M.ROW.spell(), { name, lvl, source, prep: !!prep }));
    ['Bless', 'Cure Wounds', 'Shield of Faith', 'Command', 'Heroism', 'Divine Favor'].forEach((x, i) => add(x, 1, 'Paladin', i < 5));
    add('Protection from Evil', 1, 'Oath of Devotion', true); // a subclass's: never counts
    add('Sleep', 1, 'Elf', true); // not a class's: never counts
    ['Burning Hands', 'Shield', 'Magic Missile', 'Thunderwave', 'Misty Step'].forEach((x) => add(x, x === 'Misty Step' ? 2 : 1, 'Sorcerer'));
    ['Fire Bolt', 'Light', 'Mage Hand', 'Prestidigitation'].forEach((x) => add(x, 0, 'Sorcerer'));
    add('Detect Magic', 1, undefined, true); add('Identify', 1);
    const L14 = B.spellLimits(c, D14), by = (L, name) => L.lines.find((x) => x.name === name);
    is('2014 paladin prepares CHA + half', by(L14, 'Paladin').prepared, [5, 5]);
    is('2014 sorcerer knows', by(L14, 'Sorcerer').known, [5, 4]);
    is('2014 sorcerer cantrips apart', by(L14, 'Sorcerer').cantrips, [4, 4]);
    is('2014 sorcerer prepares nothing', [by(L14, 'Sorcerer').prepared, by(L14, 'Sorcerer').prepares], [null, false]);
    is('only hand-added rows are not assigned', L14.unassigned, 2);
    is('what the classes give', B.castingOf(c, D14).slots.slice(0, 3), [4, 3, 2]);
    const L24 = B.spellLimits(c, D24);
    is('2024 paladin from the table', by(L24, 'Paladin').prepared, [5, 5]);
    is('2024 sorcerer prepares from the table', [by(L24, 'Sorcerer').prepared[1], by(L24, 'Sorcerer').known], [6, null]);
    c.classes[0].level = 1;
    is('a 2014 paladin at level 1 has no line yet', by(B.spellLimits(c, D14), 'Paladin'), undefined);
    c.classes = [Object.assign(M.ROW.cls(), { name: 'Wizard', level: 3 })];
    c.abilities.find((a) => a.key === 'INT').score = 16;
    const W = by(B.spellLimits(c, D14), 'Wizard');
    is('a wizard shows spellbook and prepared', [W.book[1], W.prepared[1], W.cantrips[1]], [10, 6, 3]);
    c.classes = [Object.assign(M.ROW.cls(), { name: 'Tea maker', level: 3 })];
    is('a class nobody knows has no line', B.spellLimits(c, D14).lines, []);
    is('and no slots to suggest', B.castingOf(c, D14).unknown, true);
}

// ---- magic items take the base weapon or armour's weight where the name shows it ----
for (const [name, want] of [['Longsword (+1)', 3], ['Mace of Disruption', 4], ['Chain Mail of Warding (+3)', 55], ['Armor of Resistance (Plate)', 65], ['Armor of Resistance (Leather)', 10], ['Adamantine Armor (Chain-Mail)', 55],
    ['Mithral Armor (Half Plate)', 40], ['Half Plate Armor (+2)', 40], ['Demon Half Plate Armor', 40], ['Plate Armor of Etherealness', 65], ['Dragon Scale Mail', 45], ['Animated Shield', 6], ['Crossbow-Heavy (+3)', 18],
    ['Holy Avenger (Light Crossbow)', 5], ['Net (+1)', 3], ['Musket (+2)', 10], ['Pistol (+1)', 3],
    ['Bag of Holding', null], ['Flame Tongue', null], ['Sun Blade', null], ['Ring of Protection', null], ['Feather Token (Whip)', null], ['Braid Whip Clasp', null]]) is(name, M.magicWeight(name), want);

console.log('sheet rules ok');
