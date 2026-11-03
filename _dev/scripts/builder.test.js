// Checks the character builder's rules (sheets/player/build.js, ROADMAP 4.2 and 4.3).   usage: node _dev/scripts/builder.test.js
// The table below is hand-worked from the 2014 rules, not from the code: each of the 12 SRD classes at levels 1, 5 and 20,
// single-class, as a Human (+1 to every score) Acolyte, with the standard array, average hit points, every Ability Score
// Improvement as +2 to the class's first ability (then the next once it's 20), the first option of every feature choice that
// isn't taken yet, the first skills of the class list, and the class's first starting-equipment options. See ORDER and GEAR.
require('../../sheets/player/formula.js');
const assert = require('assert');
const B = require('../../sheets/player/build.js');
let n = 0;
const M = require('../../sheets/player/model.js')(() => 'u' + (n++).toString(36));
const srd = require('../../sheets/player/srd-build.json');
// a few spells by name and level, as the page gets them from spells.php (the content files give the rest)
const data = B.mergeContent(srd, { spells: { bless: { name: 'Bless', level: 1 }, 'cure-wounds': { name: 'Cure Wounds', level: 1 }, 'fire-bolt': { name: 'Fire Bolt', level: 0 },
    'magic-missile': { name: 'Magic Missile', level: 1 }, 'protection-from-evil-and-good': { name: 'Protection from Evil and Good', level: 1 }, sanctuary: { name: 'Sanctuary', level: 1 } } });

// ---- the hand-worked sheets ----
// class, level, scores (STR DEX CON INT WIS CHA), max HP, AC, proficiency bonus, save proficiencies, saves (STR..CHA),
// spell save DC and attack, spell slots by level ("432" = four 1st, three 2nd, two 3rd), pact slots (count@level), cantrips known,
// skills (*2 expertise, *½ half proficiency), attacks (name, to hit, damage; in any order)
const SHEETS = [
    ["barbarian",1,  "16 14 15 9 13 11",  14,  14, 2, "STR CON", "+5 +2 +4 -1 +1 +0",  "-",      "-",         "-",   0,  
        "Animal Handling, Athletics, Insight, Religion",
        "Greataxe +5 1d12 + 3; Handaxe +5 1d6 + 3; Javelin +5 1d6 + 3"],
    ["barbarian",5,  "18 14 15 9 13 11",  50,  14, 3, "STR CON", "+7 +2 +5 -1 +1 +0",  "-",      "-",         "-",   0,  
        "Animal Handling, Athletics, Insight, Religion",
        "Greataxe +7 1d12 + 4; Handaxe +7 1d6 + 4; Javelin +7 1d6 + 4"],
    ["barbarian",20, "24 14 24 9 13 11",  285, 19, 6, "STR CON", "+13 +2 +13 -1 +1 +0","-",      "-",         "-",   0,  
        "Animal Handling, Athletics, Insight, Religion",
        "Greataxe +13 1d12 + 7; Handaxe +13 1d6 + 7; Javelin +13 1d6 + 7"],
    ["bard",     1,  "9 15 14 11 13 16",  10,  13, 2, "DEX CHA", "-1 +4 +2 +0 +1 +5",  "13 +5",  "2",         "-",   2,  
        "Acrobatics, Animal Handling, Arcana, Insight, Religion",
        "Rapier +4 1d8 + 2; Dagger +4 1d4 + 2"],
    ["bard",     5,  "9 15 14 11 13 18",  38,  13, 3, "DEX CHA", "-1 +5 +2 +0 +1 +7",  "15 +7",  "432",       "-",   3,  
        "Acrobatics*2, Animal Handling*2, Arcana, Athletics, Deception, History, Insight, Intimidation*½, Investigation*½, Medicine*½, Nature*½, Perception*½, Performance*½, Persuasion*½, Religion, Sleight of Hand*½, Stealth*½, Survival*½",
        "Rapier +5 1d8 + 2; Dagger +5 1d4 + 2"],
    ["bard",     20, "9 20 14 11 13 20",  143, 16, 6, "DEX CHA", "-1 +11 +2 +0 +1 +11","19 +11", "433332211", "-",   4,  
        "Acrobatics*2, Animal Handling*2, Arcana*2, Athletics*2, Deception, History, Insight, Intimidation*½, Investigation*½, Medicine*½, Nature*½, Perception*½, Performance*½, Persuasion*½, Religion, Sleight of Hand*½, Stealth*½, Survival*½",
        "Rapier +11 1d8 + 5; Dagger +11 1d4 + 5"],
    ["cleric",   1,  "14 11 15 9 16 13",  10,  16, 2, "WIS CHA", "+2 +0 +2 -1 +5 +3",  "13 +5",  "2",         "-",   3,  
        "History, Insight, Medicine, Religion",
        "Mace +4 1d6 + 2; Light Crossbow +2 1d8"],
    ["cleric",   5,  "14 11 15 9 18 13",  38,  16, 3, "WIS CHA", "+2 +0 +2 -1 +7 +4",  "15 +7",  "432",       "-",   4,  
        "History, Insight, Medicine, Religion",
        "Mace +5 1d6 + 2; Light Crossbow +3 1d8"],
    ["cleric",   20, "14 11 20 9 20 13",  203, 16, 6, "WIS CHA", "+2 +0 +5 -1 +11 +7", "19 +11", "433332211", "-",   5,  
        "History, Insight, Medicine, Religion",
        "Mace +8 1d6 + 2; Light Crossbow +6 1d8"],
    ["druid",    1,  "9 14 15 13 16 11",  10,  15, 2, "INT WIS", "-1 +2 +2 +3 +5 +0",  "13 +5",  "2",         "-",   2,  
        "Animal Handling, Arcana, Insight, Religion",
        "Scimitar +4 1d6 + 2"],
    ["druid",    5,  "9 14 15 13 18 11",  38,  15, 3, "INT WIS", "-1 +2 +2 +4 +7 +0",  "15 +7",  "432",       "-",   3,  
        "Animal Handling, Arcana, Insight, Religion",
        "Scimitar +5 1d6 + 2"],
    ["druid",    20, "9 14 20 13 20 11",  203, 15, 6, "INT WIS", "-1 +2 +5 +7 +11 +0", "19 +11", "433332211", "-",   4,  
        "Animal Handling, Arcana, Insight, Religion",
        "Scimitar +8 1d6 + 2"],
    ["fighter",  1,  "16 14 15 9 13 11",  12,  18, 2, "STR CON", "+5 +2 +4 -1 +1 +0",  "-",      "-",         "-",   0,  
        "Acrobatics, Animal Handling, Insight, Religion",
        "Longsword +5 1d8 + 3; Light Crossbow +6 1d8 + 2"],
    ["fighter",  5,  "18 14 15 9 13 11",  44,  18, 3, "STR CON", "+7 +2 +5 -1 +1 +0",  "-",      "-",         "-",   0,  
        "Acrobatics, Animal Handling, Insight, Religion",
        "Longsword +7 1d8 + 4; Light Crossbow +7 1d8 + 2"],
    ["fighter",  20, "20 18 20 9 13 11",  224, 19, 6, "STR CON", "+11 +4 +11 -1 +1 +0","-",      "-",         "-",   0,  
        "Acrobatics, Animal Handling, Insight, Religion",
        "Longsword +11 1d8 + 5; Light Crossbow +12 1d8 + 4"],
    ["monk",     1,  "13 16 14 11 15 9",  10,  15, 2, "STR DEX", "+3 +5 +2 +0 +2 -1",  "-",      "-",         "-",   0,  
        "Acrobatics, Athletics, Insight, Religion",
        "Shortsword +5 1d6 + 3; Dart +5 1d4 + 3"],
    ["monk",     5,  "13 18 14 11 15 9",  38,  16, 3, "STR DEX", "+4 +7 +2 +0 +2 -1",  "-",      "-",         "-",   0,  
        "Acrobatics, Athletics, Insight, Religion",
        "Shortsword +7 1d6 + 4; Dart +7 1d4 + 4"],
    ["monk",     20, "13 20 14 11 20 9",  143, 20, 6, "STR DEX CON INT WIS CHA","+7 +11 +8 +6 +11 +5","-",      "-",         "-",   0,  
        "Acrobatics, Athletics, Insight, Religion",
        "Shortsword +11 1d10 + 5; Dart +11 1d4 + 5"],
    ["paladin",  1,  "16 11 14 9 13 15",  12,  18, 2, "WIS CHA", "+3 +0 +2 -1 +3 +4",  "-",      "-",         "-",   0,  
        "Athletics, Insight, Intimidation, Religion",
        "Longsword +5 1d8 + 3; Javelin +5 1d6 + 3"],
    ["paladin",  5,  "18 11 14 9 13 15",  44,  19, 3, "WIS CHA", "+4 +0 +2 -1 +4 +5",  "13 +5",  "42",        "-",   0,  
        "Athletics, Insight, Intimidation, Religion",
        "Longsword +7 1d8 + 4; Javelin +7 1d6 + 4"],
    ["paladin",  20, "20 11 14 9 13 20",  164, 19, 6, "WIS CHA", "+5 +0 +2 -1 +7 +11", "19 +11", "43332",     "-",   0,  
        "Athletics, Insight, Intimidation, Religion",
        "Longsword +11 1d8 + 5; Javelin +11 1d6 + 5"],
    ["ranger",   1,  "13 16 14 11 15 9",  12,  16, 2, "STR DEX", "+3 +5 +2 +0 +2 -1",  "-",      "-",         "-",   0,  
        "Animal Handling, Athletics, Insight, Investigation, Religion",
        "Shortsword +5 1d6 + 3; Longbow +5 1d8 + 3"],
    ["ranger",   5,  "13 18 14 11 15 9",  44,  16, 3, "STR DEX", "+4 +7 +2 +0 +2 -1",  "13 +5",  "42",        "-",   0,  
        "Animal Handling, Athletics, Insight, Investigation, Religion",
        "Shortsword +7 1d6 + 4; Longbow +9 1d8 + 4"],
    ["ranger",   20, "13 20 14 11 20 9",  164, 16, 6, "STR DEX", "+7 +11 +2 +0 +5 -1", "19 +11", "43332",     "-",   0,  
        "Animal Handling, Athletics, Insight, Investigation, Religion",
        "Shortsword +11 1d6 + 5; Longbow +13 1d8 + 5"],
    ["rogue",    1,  "9 16 15 14 13 11",  10,  14, 2, "DEX INT", "-1 +5 +2 +4 +1 +0",  "-",      "-",         "-",   0,  
        "Acrobatics*2, Athletics*2, Deception, Insight, Intimidation, Religion",
        "Rapier +5 1d8 + 3; Shortbow +5 1d6 + 3; Dagger +5 1d4 + 3"],
    ["rogue",    5,  "9 18 15 14 13 11",  38,  15, 3, "DEX INT", "-1 +7 +2 +5 +1 +0",  "-",      "-",         "-",   0,  
        "Acrobatics*2, Athletics*2, Deception, Insight, Intimidation, Religion",
        "Rapier +7 1d8 + 4; Shortbow +7 1d6 + 4; Dagger +7 1d4 + 4"],
    ["rogue",    20, "9 20 20 16 13 11",  203, 16, 6, "DEX INT WIS","-1 +11 +5 +9 +7 +0", "-",      "-",         "-",   0,  
        "Acrobatics*2, Athletics*2, Deception*2, Insight*2, Intimidation, Religion",
        "Rapier +11 1d8 + 5; Shortbow +11 1d6 + 5; Dagger +11 1d4 + 5"],
    ["sorcerer", 1,  "9 14 15 11 13 16",  9,   15, 2, "CON CHA", "-1 +2 +4 +0 +1 +5",  "13 +5",  "2",         "-",   4,  
        "Arcana, Deception, Insight, Religion",
        "Light Crossbow +4 1d8 + 2; Dagger +4 1d4 + 2"],
    ["sorcerer", 5,  "9 14 15 11 13 18",  37,  15, 3, "CON CHA", "-1 +2 +5 +0 +1 +7",  "15 +7",  "432",       "-",   5,  
        "Arcana, Deception, Insight, Religion",
        "Light Crossbow +5 1d8 + 2; Dagger +5 1d4 + 2"],
    ["sorcerer", 20, "9 14 20 11 13 20",  202, 15, 6, "CON CHA", "-1 +2 +11 +0 +1 +11","19 +11", "433332211", "-",   6,  
        "Arcana, Deception, Insight, Religion",
        "Light Crossbow +8 1d8 + 2; Dagger +8 1d4 + 2"],
    ["warlock",  1,  "9 14 15 11 13 16",  10,  13, 2, "WIS CHA", "-1 +2 +2 +0 +3 +5",  "13 +5",  "-",         "1@1", 2,  
        "Arcana, Deception, Insight, Religion",
        "Light Crossbow +4 1d8 + 2; Dagger +4 1d4 + 2; Quarterstaff +1 1d6 - 1"],
    ["warlock",  5,  "9 14 15 11 13 18",  38,  13, 3, "WIS CHA", "-1 +2 +2 +0 +4 +7",  "15 +7",  "-",         "2@3", 3,  
        "Arcana, Deception, Insight, Religion",
        "Light Crossbow +5 1d8 + 2; Dagger +5 1d4 + 2; Quarterstaff +2 1d6 - 1"],
    ["warlock",  20, "9 14 20 11 13 20",  203, 13, 6, "WIS CHA", "-1 +2 +5 +0 +7 +11", "19 +11", "-",         "4@5", 4,  
        "Arcana, Deception, Insight, Religion",
        "Light Crossbow +8 1d8 + 2; Dagger +8 1d4 + 2; Quarterstaff +5 1d6 - 1"],
    ["wizard",   1,  "9 14 15 16 13 11",  8,   12, 2, "INT WIS", "-1 +2 +2 +5 +3 +0",  "13 +5",  "2",         "-",   3,  
        "Arcana, History, Insight, Religion",
        "Quarterstaff +1 1d6 - 1"],
    ["wizard",   5,  "9 14 15 18 13 11",  32,  12, 3, "INT WIS", "-1 +2 +2 +7 +4 +0",  "15 +7",  "432",       "-",   4,  
        "Arcana, History, Insight, Religion",
        "Quarterstaff +2 1d6 - 1"],
    ["wizard",   20, "9 14 20 20 13 11",  182, 12, 6, "INT WIS", "-1 +2 +5 +11 +7 +0", "19 +11", "433332211", "-",   5,  
        "Arcana, History, Insight, Religion",
        "Quarterstaff +5 1d6 - 1"],
];

// standard array placement (before the human +1) and ASI order, per class
const ORDER = {
    barbarian: 'STR15 CON14 DEX13 WIS12 CHA10 INT8', bard: 'CHA15 DEX14 CON13 WIS12 INT10 STR8', cleric: 'WIS15 CON14 STR13 CHA12 DEX10 INT8',
    druid: 'WIS15 CON14 DEX13 INT12 CHA10 STR8', fighter: 'STR15 CON14 DEX13 WIS12 CHA10 INT8', monk: 'DEX15 WIS14 CON13 STR12 INT10 CHA8',
    paladin: 'STR15 CHA14 CON13 WIS12 DEX10 INT8', ranger: 'DEX15 WIS14 CON13 STR12 INT10 CHA8', rogue: 'DEX15 CON14 INT13 WIS12 CHA10 STR8',
    sorcerer: 'CHA15 CON14 DEX13 WIS12 INT10 STR8', warlock: 'CHA15 CON14 DEX13 WIS12 INT10 STR8', wizard: 'INT15 CON14 DEX13 WIS12 CHA10 STR8',
};
// starting equipment: the first option of each choice ("c<n>"), and what fills an "any ..." choice
const GEAR = { fighter: { c1: { o: 0, items: ['longsword'] } }, paladin: { c0: { o: 0, items: ['longsword'] } }, cleric: { c4: { items: ['amulet'] } },
    druid: { c2: { items: ['wooden-staff'] } }, warlock: { c3: { items: ['quarterstaff'] } } };
const SUB = { barbarian: 'berserker', bard: 'lore', cleric: 'life', druid: 'land', fighter: 'champion', monk: 'open-hand', paladin: 'devotion', ranger: 'hunter',
    rogue: 'thief', sorcerer: 'draconic', warlock: 'fiend', wizard: 'evocation' };
const ALPHA = M.SKILLS.map(([s]) => s);
const skillOf = (i) => B.profKind(i, M)[1];

// the builder's choices for one of the characters above
function choices(cls, L) {
    const C = srd.classes[cls], ch = B.blankChoices();
    const order = ORDER[cls].split(' ').map((x) => [x.slice(0, 3), +x.slice(3)]);
    Object.assign(ch, { name: `Test ${cls}`, race: 'human', raceOpts: { lang: ['elvish'] }, bg: 'acolyte', bgOpts: { langs: ['dwarvish', 'giant'] }, method: 'std', std: Object.fromEntries(order) });
    const score = Object.fromEntries(order.map(([a, v]) => [a, v + 1]));
    const skills = C.proficiency_choices[0].from.options.map((o) => o.item).filter((i) => !['skill-insight', 'skill-religion'].includes(i)).slice(0, C.proficiency_choices[0].choose);
    const profs = { 0: skills };
    C.proficiency_choices.slice(1).forEach((pc, i) => { profs[i + 1] = pc.from.options.slice(0, pc.choose).map((o) => o.item); });
    const has = new Set(['Insight', 'Religion', ...skills.map(skillOf)]), expert = new Set();
    const e = { id: cls, levels: L, sub: L >= B.subLevel(cls, data) ? SUB[cls] : '', profs, opts: {}, asi: {}, picks: {}, spells: [] };
    const taken = new Set();
    for (let lv = 1; lv <= L; lv++) {
        for (const f of B.featuresAt(cls, e.sub, lv, data)) {
            if (f.choices?.options) {
                const k = B.chooseN(f, C, lv, [...taken].filter((x) => f.choices.options.some((o) => o.index === x)).length);
                // the same option can't be taken twice (an Additional Fighting Style is matched by its name)
                const nameTaken = (o) => [...taken].some((t) => t === o.index || t.replace(/^.*fighting-style-/, '') === o.index.replace(/^.*fighting-style-/, ''));
                e.opts[f.index] = f.choices.options.filter((o) => !nameTaken(o)).slice(0, k).map((o) => o.index);
                e.opts[f.index].forEach((i) => taken.add(i));
            }
            const pk = B.PICKS[f.index];
            if (pk?.[0] === 'skill') { e.picks[f.index] = C.proficiency_choices[0].from.options.map((o) => skillOf(o.item)).filter((s) => !has.has(s)).slice(0, pk[1]); e.picks[f.index].forEach((s) => has.add(s)); }
            if (pk?.[0] === 'expert') { e.picks[f.index] = ALPHA.filter((s) => has.has(s) && !expert.has(s)).slice(0, pk[1]); e.picks[f.index].forEach((s) => expert.add(s)); }
        }
        if (B.asiLevels(C).includes(lv)) {
            const a = order.map(([x]) => x).find((x) => score[x] < 20);
            score[a] = Math.min(20, score[a] + 2);
            e.asi[lv] = { k: '+2', a: [a] };
        }
    }
    ch.classes = [e];
    ch.equip.picks = Object.assign(Object.fromEntries((C.starting_equipment_options || []).map((_, i) => ['c' + i, { o: 0 }])), GEAR[cls] || {});
    return ch;
}

// the numbers the sheet would show, worked out from the built character the way sheet.js does
function sheet(c) {
    const V = { level: c.classes.reduce((t, k) => t + k.level, 0) };
    for (const a of c.abilities) { V[a.key.toLowerCase()] = B.mod(a.score); V[a.key.toLowerCase() + '_score'] = a.score; }
    for (const k of c.classes) V[k.name.toLowerCase() + '_level'] = k.level;
    V.prof = hbCalc(c.prof, V).v;
    const sg = (x) => (x < 0 ? '-' : '+') + Math.abs(x);
    const sp = c.panels.find((p) => p.type === 'spells'), pact = c.panels.find((p) => p.type === 'trackers').rows.find((r) => r.name === 'Pact slots');
    const pl = pact ? pact.levels.findIndex((l) => +l.max > 0) : -1;
    const dmg = (d) => { const [, die, rest] = /^(\S+) \+ (.*)$/.exec(d.dice); const m = hbCalc(rest, V).v; return die + (m ? ` ${m < 0 ? '-' : '+'} ${Math.abs(m)}` : ''); };
    const caster = sp.dc !== '8 + PROF + INT' || c.classes.some((k) => ['Wizard'].includes(k.name));
    const slots = sp.slots.map((s) => +s.max).join('').replace(/0+$/, '') || '-';
    return [c.classes[0].name.toLowerCase(), V.level, c.abilities.map((a) => a.score).join(' '), c.hp.base + V.level * V.con + c.hp.mod, hbCalc(c.ac, V).v, V.prof,
        c.abilities.filter((a) => a.save).map((a) => a.key).join(' '), c.abilities.map((a) => sg(V[a.key.toLowerCase()] + (a.save ? V.prof : 0))).join(' '),
        caster && (slots !== '-' || pact && pl >= 0) ? `${hbCalc(sp.dc, V).v} ${sg(hbCalc(sp.atk, V).v)}` : '-', slots, pl >= 0 ? `${pact.levels[pl].max}@${pl + 1}` : '-',
        B.spellCounts(c.build.classes[0].id, V.level, data).cantrips,
        c.skills.filter((s) => s.p).map((s) => s.name + (s.p === 2 ? '*2' : s.p === 0.5 ? '*½' : '')).join(', '),
        c.panels.find((p) => p.type === 'attacks').rows.map((r) => `${r.name} ${sg(hbCalc(r.hit, V).v)} ${dmg(r.dmg[0])}`).join('; ')];
}

const HEAD = ['class', 'level', 'scores', 'HP', 'AC', 'prof', 'save profs', 'saves', 'spell DC/atk', 'slots', 'pact', 'cantrips', 'skills', 'attacks'];
let bad = 0;
for (const want of SHEETS) {
    const got = sheet(B.build(choices(want[0], want[1]), data, M));
    // the paladin and ranger have no spellcasting at level 1 (no DC either); the warlock has one with pact slots only
    const same = (i) => (HEAD[i] === 'attacks' ? (x) => x.toLowerCase().split('; ').sort().join('; ') : String)(String(got[i])) === (HEAD[i] === 'attacks' ? (x) => x.toLowerCase().split('; ').sort().join('; ') : String)(String(want[i]));
    for (const [i, h] of HEAD.entries()) if (!same(i)) { bad++; console.log(`FAIL ${want[0]} ${want[1]} ${h}: got ${got[i]}, want ${want[i]}`); }
}

// ---- the rules on their own ----
assert.strictEqual(B.pbCost({ STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 }), 27);
assert.strictEqual(B.pbCost({ STR: 8, DEX: 9, CON: 10, INT: 11, WIS: 12, CHA: 13 }), 15);
assert.strictEqual(B.pbCost({ STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 }), 27);
assert.deepStrictEqual(B.dropLowest([3, 6, 1, 5]), { d: [3, 6, 1, 5], lo: 2, t: 14 });
assert.deepStrictEqual(B.dropLowest([4, 4, 4, 4]), { d: [4, 4, 4, 4], lo: 0, t: 12 });
assert.deepStrictEqual(B.dropLowest([6, 6, 6, 6]).t, 18);
assert.deepStrictEqual(B.dropLowest([1, 1, 1, 1]).t, 3);
// multiclass spell slots: paladin 4 / sorcerer 3 (caster level 5), wizard 3 / cleric 1 (4), warlock 3 / sorcerer 2 (pact apart)
assert.deepStrictEqual(B.slotsFor({ paladin: 4, sorcerer: 3 }, data), { slots: [4, 3, 2, 0, 0, 0, 0, 0, 0], pact: null, casterLevel: 5 });
assert.deepStrictEqual(B.slotsFor({ wizard: 3, cleric: 1 }, data), { slots: [4, 3, 0, 0, 0, 0, 0, 0, 0], pact: null, casterLevel: 4 });
assert.deepStrictEqual(B.slotsFor({ warlock: 3, sorcerer: 2 }, data), { slots: [3, 0, 0, 0, 0, 0, 0, 0, 0], pact: { n: 2, level: 2 }, casterLevel: 2 });
assert.deepStrictEqual(B.slotsFor({ fighter: 5 }, data).slots, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual(B.slotsFor({ wizard: 20, cleric: 0 }, data).slots, [4, 3, 3, 3, 3, 2, 2, 1, 1]);
assert.deepStrictEqual(B.asiLevels(srd.classes.fighter), [4, 6, 8, 12, 14, 16, 19]);
assert.deepStrictEqual(B.asiLevels(srd.classes.rogue), [4, 8, 10, 12, 16, 19]);
assert.strictEqual(B.subLevel('cleric', data), 1); assert.strictEqual(B.subLevel('wizard', data), 2); assert.strictEqual(B.subLevel('fighter', data), 3);

// content merge: later files add and replace by index; srd entries are 2014 rules, listed by name
const merged = B.mergeContent(srd, { classes: { artificer: { name: 'Artificer', hit_die: 8, rules: '2014', src: 'Tome' } }, races: { elf: { name: 'Elf 2024', rules: '2024' } } });
assert.strictEqual(merged.classes.artificer.src, 'Tome');
assert.strictEqual(merged.classes.fighter.src, 'SRD 5.1');
assert.deepStrictEqual(B.listOf(merged, 'races', '2024').map((r) => r.name), ['Elf 2024']);
assert.ok(!B.listOf(merged, 'races', '2014').some((r) => r.id === 'elf'));
assert.strictEqual(B.listOf(merged, 'classes').length, 13);

// races: hill dwarf (toughness +1 HP a level, poison resistance, darkvision), dragonborn ancestry (breath weapon, resistance)
const dw = Object.assign(choices('fighter', 2), { race: 'dwarf', sub: 'hill-dwarf', raceOpts: { 'p:tool-proficiency': ['smiths-tools'] } });
const d = B.build(dw, data, M);
assert.strictEqual(d.race, 'Hill Dwarf');
assert.strictEqual(d.speeds[0].ft, 25);
assert.strictEqual(d.res, 'Poison');
assert.deepStrictEqual(d.abilities.map((a) => a.score), [15, 13, 16, 8, 13, 10]); // standard array + CON 2, WIS 1
assert.strictEqual(d.hp.base, 10 + 6 + 2); // 10, the fighter average 6, toughness 2
assert.ok(d.passives.some((p) => p.name === 'Darkvision' && p.f === '60'));
assert.ok(d.profs.tools.some((t) => t.name === "Smith's tools"));
assert.ok(d.profs.weapons.includes('Warhammers'));
const pas = d.panels.find((p) => p.type === 'list').rows;
assert.deepStrictEqual(pas.filter((r) => r.grp === 'race').map((r) => r.src), ['Dwarf', 'Dwarf', 'Dwarf', 'Dwarf', 'Dwarf', 'Hill Dwarf']);
assert.ok(pas.some((r) => r.name === 'Second Wind' && r.src === 'Fighter 1' && r.grp === 'class'));
assert.ok(pas.some((r) => r.name === 'Shelter of the Faithful' && r.src === 'Background' && r.grp === 'other'));
const db = B.build(Object.assign(choices('sorcerer', 1), { race: 'dragonborn', raceOpts: { 't:draconic-ancestry': ['draconic-ancestry-red'] } }), data, M);
assert.strictEqual(db.res, 'Fire');
const breath = db.panels.find((p) => p.type === 'attacks').rows.find((r) => r.name === 'Breath Weapon');
assert.deepStrictEqual([breath.mode, breath.save, breath.dmg[0].type, breath.range], ['save', 'DEX', 'Fire', '15 ft cone']);
assert.ok(db.panels.find((p) => p.type === 'trackers').rows.some((r) => r.name === 'Breath Weapon' && r.reset === 'short'));
// half-elf: +1 to two abilities of the player's choice
const he = B.build(Object.assign(choices('bard', 1), { race: 'half-elf', raceOpts: { ab: ['STR', 'DEX'] } }), data, M);
assert.deepStrictEqual(he.abilities.map((a) => a.score), [9, 15, 13, 10, 12, 17]);

// point buy and 4d6 (rolled sets assigned to abilities)
const pb = Object.assign(choices('wizard', 1), { method: 'pb', pb: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 10, CHA: 10 } });
assert.deepStrictEqual(B.build(pb, data, M).abilities.map((a) => a.score), [9, 15, 15, 16, 11, 11]);
const rl = Object.assign(choices('wizard', 1), { method: 'roll', sets: [[6, 6, 6, 1], [5, 5, 5, 5], [1, 2, 3, 4], [3, 3, 3, 3], [6, 5, 4, 3], [2, 2, 2, 6]].map(B.dropLowest),
    assign: { STR: 2, DEX: 1, CON: 3, INT: 0, WIS: 4, CHA: 5 } });
assert.deepStrictEqual(B.build(rl, data, M).abilities.map((a) => a.score), [10, 16, 10, 19, 16, 11]);

// hit points: rolled levels, level 1 always the maximum
const hr = Object.assign(choices('fighter', 3), { hp: { mode: 'roll', rolls: { 2: 3, 3: 10 } } });
assert.strictEqual(B.build(hr, data, M).hp.base, 10 + 3 + 10);

// multiclass in the builder: fighter 1 / wizard 2 (wizard gets no saves or armour of its own)
const mc = choices('fighter', 1);
mc.classes.push({ id: 'wizard', levels: 2, sub: 'evocation', profs: {}, opts: {}, asi: {}, picks: {}, spells: ['fire-bolt', 'magic-missile'] });
const m = B.build(mc, data, M);
assert.deepStrictEqual(m.classes.map((k) => [k.name, k.level, k.die]), [['Fighter', 1, 10], ['Wizard', 2, 6]]);
assert.deepStrictEqual(m.abilities.filter((a) => a.save).map((a) => a.key), ['STR', 'CON']);
assert.strictEqual(m.hp.base, 10 + 4 + 4);
assert.deepStrictEqual(m.panels.find((p) => p.type === 'spells').slots.map((s) => s.max).slice(0, 2), [3, 0]);
assert.deepStrictEqual(m.panels.find((p) => p.type === 'spells').rows.map((r) => [r.name, r.lvl, r.prep, r.source]), [['Fire Bolt', 0, false, 'Wizard'], ['Magic Missile', 1, true, 'Wizard']]);
assert.strictEqual(m.panels.find((p) => p.type === 'spells').dc, '8 + PROF + INT');

// domain spells come prepared; gold instead of equipment; the details panel and the build record
const cl = Object.assign(choices('cleric', 1), { equip: { mode: 'gold', gold: 120, picks: {}, extra: ["Healer's kit"] }, details: { alignment: 'Lawful good', faith: 'Lathander', backstory: 'Raised in a temple.' } });
const k = B.build(cl, data, M);
assert.deepStrictEqual(k.panels.find((p) => p.type === 'spells').rows.filter((r) => r.prep).map((r) => r.name), ['Bless', 'Cure Wounds']);
assert.deepStrictEqual(k.panels.find((p) => p.type === 'items').rows.map((r) => r.name), ["Healer's kit"]);
assert.strictEqual(k.panels.find((p) => p.type === 'items').coins.gp, 120);
assert.deepStrictEqual([k.alignment, k.panels.find((p) => p.type === 'details').f.faith, k.panels.find((p) => p.type === 'details').f.backstory, k.panels.find((p) => p.type === 'details').f.background], ['Lawful good', 'Lathander', 'Raised in a temple.', 'Acolyte']);
assert.deepStrictEqual(k.build.classes, cl.classes);
assert.ok(k.abilities.find((a) => a.key === 'WIS').save);
assert.ok(k.profs.armour.includes('Heavy armour')); // Life Domain's Bonus Proficiency
// every row the builder adds says where it came from
for (const p of k.panels) for (const r of p.rows || []) assert.ok(r.source || r.src, `${p.type} row ${r.name} has no source`);

// ---- level up (4.3): fighter 1 -> 5 matches a fighter built at 5; wizard 3 / cleric 1; nothing the player had is lost ----
const fu = B.build(choices('fighter', 1), data, M);
let up = fu;
const f5 = choices('fighter', 5).classes[0];
for (let lv = 2; lv <= 5; lv++) up = B.levelUp(up, { cls: 'fighter', entry: { ...f5, levels: lv }, hp: { mode: 'avg' } }, data, M);
const want5 = SHEETS.find((s) => s[0] === 'fighter' && s[1] === 5);
assert.deepStrictEqual(sheet(Object.assign(up, { build: { classes: [{ id: 'fighter' }] } })).slice(0, 9), want5.slice(0, 9));
assert.ok(up.panels.find((p) => p.type === 'trackers').rows.some((r) => r.name === 'Action Surge'));
// the player's own changes stay: a renamed item, an edited formula, a typed note
const mine = B.build(choices('wizard', 3), data, M);
mine.panels.find((p) => p.type === 'items').rows[0].name = 'My staff';
mine.ac = '10 + DEX + 3 [Bracers]';
const before = JSON.stringify(mine);
const wc = B.levelUp(mine, { cls: 'cleric', entry: { id: 'cleric', sub: 'life', profs: {}, opts: {}, asi: {}, picks: {}, spells: [] }, hp: { mode: 'roll', roll: 6 } }, data, M);
assert.strictEqual(JSON.stringify(mine), before, 'level up leaves the old character untouched (Undo)');
assert.deepStrictEqual(wc.classes.map((k) => [k.name, k.level]), [['Wizard', 3], ['Cleric', 1]]);
assert.deepStrictEqual(wc.panels.find((p) => p.type === 'spells').slots.map((s) => s.max).slice(0, 3), [4, 3, 0]);
assert.strictEqual(wc.hp.base, mine.hp.base + 6);
assert.ok(wc.profs.armour.includes('Medium armour') && wc.profs.armour.includes('Heavy armour'));
assert.ok(!wc.abilities.find((a) => a.key === 'CHA').save, 'a second class gives no saves');
// every value the character had is still there (only added to, or a number raised)
function kept(a, b, path = '') {
    if (a === null || typeof a !== 'object') {
        if (typeof a === 'number' && typeof b === 'number' && b >= a) return;
        if (typeof a === 'string' && /^\d+$/.test(a) && /^\d+$/.test(String(b)) && +b >= +a) return;
        assert.strictEqual(b, a, path);
        return;
    }
    for (const k of Object.keys(a)) if (!['build', 'calc'].includes(k)) kept(a[k], b?.[k], path + '.' + k);
}
kept(mine, wc);
assert.deepStrictEqual(wc.build.ups.map((u) => [u.cls, u.n, u.hp]), [['cleric', 1, 6]]);
// bard 2: Jack of All Trades gives half proficiency to the rest
const bd = B.levelUp(B.build(choices('bard', 1), data, M), { cls: 'bard', entry: { id: 'bard', profs: {}, opts: {}, asi: {}, picks: {} }, hp: { mode: 'avg' } }, data, M);
assert.strictEqual(bd.skills.find((s) => s.name === 'Stealth').p, 0.5);
assert.strictEqual(bd.skills.find((s) => s.name === 'Insight').p, 1);

// ---- the imported content (sheets/player/content/, when it's there; CONTENT_DIR to try another copy) ----
// every class, race, subrace and background of each rules version builds at levels 1, 5 and 20 with each class's first
// options, without throwing and with sane numbers; the content's text-only choices are skipped, as a player would type them
const fs = require('fs'), path = require('path');
const CDIR = process.env.CONTENT_DIR || path.join(__dirname, '../../sheets/player/content');
let built = 0;
const idx = fs.existsSync(path.join(CDIR, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(CDIR, 'index.json'), 'utf8')) : { files: [] };
for (const rules of ['2014', '2024']) {
    const files = (idx.files || []).filter((f) => f.rules === rules && !/spells|items/.test(f.file)).map((f) => JSON.parse(fs.readFileSync(path.join(CDIR, f.file), 'utf8')));
    if (!files.length) continue;
    const D = B.mergeContent(rules === '2014' ? srd : {});
    files.forEach((f) => B.addContent(D, f, rules));
    const races = B.listOf(D, 'races', rules), bgs = B.listOf(D, 'backgrounds', rules);
    for (const [i, cls] of B.listOf(D, 'classes', rules).entries()) for (const L of [1, 5, 20]) {
        const race = races[i % races.length], sub = B.listOf(D, 'subraces', rules).find((x) => (x.race?.index || x.race) === race?.id);
        const ch = Object.assign(B.blankChoices(), { rules, name: 'Smoke', race: race?.id || '', sub: sub?.id || '', bg: bgs[i % bgs.length]?.id || '', method: 'std', std: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 } });
        const subs = B.subsOf(cls.id, D, rules);
        const e = { id: cls.id, levels: L, sub: L >= B.subLevel(cls.id, D) && subs[0] ? subs[0].id : '', profs: {}, opts: {}, asi: {}, picks: {}, spells: [] };
        (cls.proficiency_choices || []).forEach((pc, j) => { e.profs[j] = (pc.from?.options || []).slice(0, pc.choose).map((o) => o.item?.index || o.item); });
        for (let lv = 1; lv <= L; lv++) for (const f of B.featuresAt(cls.id, e.sub, lv, D)) if (f.choices?.options) e.opts[f.index] = f.choices.options.slice(0, f.choices.choose || 1).map((o) => o.index);
        for (const lv of B.asiLevels(cls)) if (lv <= L) e.asi[lv] = { k: '+2', a: ['CON'] };
        ch.classes = [e];
        let c;
        try { c = B.build(ch, D, M); } catch (x) { bad++; console.log(`FAIL content ${rules} ${cls.id} ${L} (${race?.id}, ${ch.bg}): ${x.stack.split('\n').slice(0, 3).join(' ')}`); continue; }
        built++;
        const lvl = c.classes.reduce((t, k) => t + k.level, 0);
        if (lvl !== L || !(c.hp.base >= L) || c.abilities.some((a) => !(a.score >= 1 && a.score <= 30))) { bad++; console.log(`FAIL content ${rules} ${cls.id} ${L}: level ${lvl}, hp base ${c.hp.base}, scores ${c.abilities.map((a) => a.score)}`); }
    }
}
if (built) console.log(`content: ${built} characters built from the imported classes`);

if (bad) { console.log(`${bad} value(s) differ from the hand-worked sheets`); process.exit(1); }
console.log(`builder ok (${SHEETS.length} hand-worked sheets)`);
