// Checks sheets/player/content/ (made by _dev/scripts/build-content.mjs).   usage: node _dev/scripts/content.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '../../sheets/player/content');

(async () => {
    const { nameKey, isUA } = await import('./build-content.mjs');
    const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
    const data = { 2014: {}, 2024: {} };
    for (const f of index.files) {
        // sizes in index.json are as built (LF); a Windows checkout may add CRs, so they aren't compared here
        const d = JSON.parse(fs.readFileSync(path.join(DIR, f.file), 'utf8'));
        assert.strictEqual(d.meta.rules, f.rules);
        assert.deepStrictEqual(Object.keys(d), ['meta', ...f.keys], f.file + ' keys');
        Object.assign(data[f.rules], d, { meta: undefined });
    }
    // shortcut: assumes up to ~3 MB gzip per file is fine for the builder; revisit if a file grows past that
    for (const f of index.files) assert.ok(f.gzip < 3e6, f.file + ' is ' + f.gzip + ' bytes gzipped');
    const counts = {};
    for (const [r, d] of Object.entries(data)) {
        const seen = {};
        counts[r] = {};
        for (const [cat, list] of Object.entries(d)) {
            if (cat === 'meta') continue;
            counts[r][cat] = Object.keys(list).length;
            for (const [i, e] of Object.entries(list)) {
                const where = `${r} ${cat} ${i}`;
                assert.strictEqual(e.index, i, where + ' index');
                assert.ok(e.name && e.src, where + ' name/src');
                assert.strictEqual(e.rules, r, where + ' rules');
                assert.ok(!isUA(e), where + ' is Unearthed Arcana / playtest');
                const parent = cat === 'subclasses' ? e.class : cat === 'subraces' ? e.race : '';
                const key = parent + '|' + nameKey(cat, e.name, cat === 'subraces' ? d.races[e.race]?.name : '');
                assert.ok(!seen[cat + key], `${where}: same name as ${seen[cat + key]}`);
                seen[cat + key] = i;
            }
        }
        for (const [i, c] of Object.entries(d.classes)) {
            assert.ok(Number.isInteger(c.hit_die) && c.hit_die >= 6, `${r} class ${i} hit die ${c.hit_die}`);
            assert.strictEqual(c.levels.length, 20, `${r} class ${i} levels`);
            c.levels.forEach((l, n) => assert.strictEqual(l.level, n + 1, `${r} class ${i} level ${n + 1}`));
            for (const s of c.subclasses) assert.strictEqual(d.subclasses[s]?.class, i, `${r} class ${i} subclass ${s}`);
            for (const s of c.spells) assert.ok(d.spells[s], `${r} class ${i} spell ${s}`);
        }
        for (const [i, s] of Object.entries(d.subclasses)) {
            assert.ok(d.classes[s.class]?.subclasses.includes(i), `${r} subclass ${i} -> class ${s.class}`);
            for (const sp of s.spells || []) assert.ok(d.spells[sp.spell], `${r} subclass ${i} spell ${sp.spell}`);
        }
        for (const [i, x] of Object.entries(d.races)) for (const s of x.subraces) assert.strictEqual(d.subraces[s]?.race, i, `${r} race ${i} subrace ${s}`);
        for (const [i, s] of Object.entries(d.subraces)) assert.ok(d.races[s.race]?.subraces.includes(i), `${r} subrace ${i} -> race ${s.race}`);
        for (const [i, s] of Object.entries(d.spells)) {
            assert.ok(Number.isInteger(s.level) && s.level >= 0 && s.level <= 9, `${r} spell ${i} level`);
            for (const c of s.classes) assert.ok(d.classes[c], `${r} spell ${i} class ${c}`);
        }
    }
    // the core classes are there in both rules versions, with the SRD's hit dice
    const hit = { barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8, paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6 };
    for (const r of ['2014', '2024']) for (const [k, h] of Object.entries(hit)) assert.strictEqual(data[r].classes[k]?.hit_die, h, `${r} ${k} hit die`);
    assert.ok(data['2014'].spells.fireball && data['2024'].spells.fireball && data['2014'].races.dwarf && data['2014'].backgrounds.acolyte);
    assert.deepStrictEqual(index.counts, counts, 'index.json counts');
    assert.ok(index.credits.length >= 6 && index.credits.every((c) => c.name && c.copyright), 'credits');
    for (const r of Object.keys(counts)) console.log(r, Object.entries(counts[r]).map(([k, v]) => k + ' ' + v).join(', '));
    console.log('content ok');
})().catch((e) => { console.error(e); process.exit(1); });
