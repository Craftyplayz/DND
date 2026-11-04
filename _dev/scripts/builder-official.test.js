// Official content builds exactly as before homebrew classes and races (ROADMAP 4.6). builder-official.golden.json holds a hash of the whole character
// for every official class and race at levels 1, 3, 5, 11 and 20 (and levelled up one level at a time to 5), with every subclass, in both rules versions, made
// by build.js before that work. Then the same again with homebrew in the data: a subclass with an early feature on each class, a subrace on each race, features
// and traits named like official ones. Nothing official may change.
//   node _dev/scripts/builder-official.test.js           (--write makes the golden file again, only when official content itself has changed)
require('../../sheets/player/formula.js');
const assert = require('assert'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const B = require('../../sheets/player/build.js'), modelOf = require('../../sheets/player/model.js');
const ROOT = path.join(__dirname, '../../sheets/player'), GOLD = path.join(__dirname, 'builder-official.golden.json');
const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
Date.now = () => 1000; // notes carry their creation time

function dataFor(rules) {
    const d = B.mergeContent(rules === '2014' ? json('srd-build.json') : { meta: {} });
    for (const f of json('content/index.json').files) if ((f.rules || '2014') === rules) B.addContent(d, json('content/' + f.file), rules);
    return d;
}
// every choice taken the first way, so the character is full of what a player would really pick
function entryFor(id, levels, sub, d) {
    const cls = d.classes[id], e = { id, levels, sub, opts: {}, profs: {}, picks: {}, asi: {}, spells: [] };
    (cls.proficiency_choices || []).forEach((pc, i) => { e.profs[i] = (pc.from?.options || []).map((o) => o.item?.index || o.item).filter(Boolean).slice(0, pc.choose); });
    for (let n = 1; n <= levels; n++) {
        for (const f of B.featuresAt(id, sub, n, d)) {
            if (f.choices?.options) e.opts[B.fid(f, n)] = f.choices.options.slice(0, B.chooseN(f, cls, n, 0)).map((o) => o.index);
            const pk = B.pickOf(f);
            if (pk) e.picks[B.fid(f, n)] = ['Acrobatics', 'Athletics', 'Arcana'].slice(0, pk[1]);
        }
    }
    for (const l of B.asiLevels(cls)) if (l <= levels) e.asi[l] = { k: '+2', a: ['STR'] };
    const pool = B.spellPool(id, sub, d).map((s) => s.index).sort();
    e.spells = pool.slice(0, 4);
    return e;
}
// view.phoneTab (ROADMAP 2.1) came after the golden file: it's only the phone's last tab, nothing a build decides.
// The fields of ROADMAP 4.4 and 4.5 are left out the same way: they're the sheet's settings, and every build gets their defaults.
const SKIP = new Set(['phoneTab', 'rulesVer', 'spellPts', 'weightOn', 'capF', 'coinsOn', 'campRules', 'off', ...(process.env.GOLD_NO_WT ? ['wt'] : [])]);
const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x, (k, v) => (SKIP.has(k) ? undefined : v))).digest('hex').slice(0, 16);
function sweep(d, rules) {
    const out = {}, list = (k) => B.listOf(d, k, rules).filter((x) => !x.hbx);
    const races = list('races'), bgs = list('backgrounds');
    const fresh = () => { let n = 0; return modelOf(() => 'u' + (n++).toString(36)); };
    const base = (over) => Object.assign(B.blankChoices(), { rules, method: 'std', std: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }, race: races[0]?.id || '', bg: bgs[0]?.id || '' }, over);
    for (const c of list('classes')) {
        const subs = [{ id: '' }, ...B.subsOf(c.id, d, rules).filter((s) => !s.hbx)];
        out[`${rules} class ${c.id} level`] = B.subLevel(c.id, d);
        for (const s of subs) for (const lv of [1, 3, 5, 11, 20]) {
            const ch = base({ level: lv, classes: [entryFor(c.id, lv, s.id, d)] });
            out[`${rules} ${c.id}/${s.id} ${lv}`] = hash(B.build(ch, d, fresh()));
        }
        // level up, one level at a time, with the first subclass
        const sub = subs[1]?.id || '', M = fresh();
        let char = B.build(base({ level: 1, classes: [entryFor(c.id, 1, sub, d)] }), d, M);
        for (let n = 2; n <= 5; n++) {
            const full = entryFor(c.id, n, sub, d), one = { ...full, levels: undefined };
            char = B.levelUp(char, { cls: c.id, entry: one, hp: { mode: 'avg' } }, d, M);
        }
        out[`${rules} ${c.id} level up`] = hash(char);
    }
    for (const r of races) for (const s of [{ id: '' }, ...list('subraces').filter((x) => (x.race?.index || x.race) === r.id)]) {
        const ch = base({ level: 1, race: r.id, sub: s.id, classes: [entryFor(list('classes')[0].id, 1, '', d)] });
        out[`${rules} race ${r.id}/${s.id}`] = hash(B.build(ch, d, fresh()));
    }
    for (const b of bgs) out[`${rules} background ${b.id}`] = hash(B.build(base({ level: 1, bg: b.id, classes: [entryFor(list('classes')[0].id, 1, '', d)] }), d, fresh()));
    return out;
}
const now = {};
for (const r of ['2014', '2024']) Object.assign(now, sweep(dataFor(r), r));
if (process.argv.includes('--write')) { fs.writeFileSync(GOLD, JSON.stringify(now, null, 0).replace(/,"/g, ',\n"')); console.log(`wrote ${Object.keys(now).length} hashes`); process.exit(0); }
const gold = JSON.parse(fs.readFileSync(GOLD, 'utf8'));
assert.deepStrictEqual(Object.keys(now).sort(), Object.keys(gold).sort());
const diff = Object.keys(gold).filter((k) => gold[k] !== now[k]);
assert.strictEqual(diff.length, 0, 'official builds changed: ' + diff.slice(0, 10).join(', '));
console.log(`${Object.keys(gold).length} official builds same`);

// the same with homebrew beside them: it may add choices, never change an official build
if (fs.existsSync(path.join(__dirname, '../../assets/js/homebrew-content.js'))) {
    const HC = require('../../assets/js/homebrew-content.js');
    for (const r of ['2014', '2024']) {
        const d = dataFor(r), early = { kind: 'subclass', name: 'Early path', levels: [{ n: 1, feats: [{ id: 'f1', name: 'Rage', text: 'Not a rage.' }, { id: 'f2', name: 'Primal Champion', text: 'Nor this.' }] }] };
        for (const c of Object.keys(d.classes)) HC.add(d, HC.toContent({ ...early, id: 'hs' + c.replace(/\W/g, ''), parent: c }), r);
        for (const x of Object.keys(d.races)) HC.add(d, HC.toContent({ kind: 'subrace', id: 'hr' + x.replace(/\W/g, ''), name: 'Extra ' + x, parent: x, traits: [{ id: 't', name: 'Dwarven Toughness', text: 'Not that.' }] }), r);
        const again = sweep(d, r), bad = Object.keys(again).filter((k) => gold[k] !== again[k]);
        assert.strictEqual(bad.length, 0, 'homebrew changed official builds: ' + bad.slice(0, 10).join(', '));
    }
    console.log('and the same with homebrew beside them');
}
console.log('builder official ok');
