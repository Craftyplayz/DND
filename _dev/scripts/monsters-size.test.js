// Compares two monsters.json files: only the added 6th field (size) may differ.
// usage: node _dev/scripts/monsters-size.test.js <old.json> <new.json>    (no arguments: checks the sizes in sheets/monster/monsters.json)
const assert = require('assert');
const fs = require('fs');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const [a, b] = process.argv.slice(2);
const now = read(b || require('path').join(__dirname, '../../sheets/monster/monsters.json'));
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Titanic'];
if (a) {
    const old = read(a);
    assert.strictEqual(now.built, old.built, 'built date changed');
    assert.deepStrictEqual(now.sources, old.sources, 'sources changed');
    assert.deepStrictEqual(Object.keys(now), Object.keys(old), 'top-level keys changed');
    assert.strictEqual(now.list.length, old.list.length, 'monster count changed');
    old.list.forEach((r, i) => assert.deepStrictEqual(now.list[i].slice(0, 5), r.slice(0, 5), 'row changed: ' + r[0]));
}
const bad = now.list.filter((r) => r.length !== 6 || !SIZES.includes(r[5]));
assert.strictEqual(bad.length, 0, bad.length + ' rows without a valid size, e.g. ' + JSON.stringify(bad[0]));
console.log('monsters size ok (' + now.list.length + ' rows)');
