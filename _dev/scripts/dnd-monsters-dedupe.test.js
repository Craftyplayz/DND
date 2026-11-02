// Checks the duplicate check in build-monsters.js.   usage: node _dev/scripts/dnd-monsters-dedupe.test.js
const assert = require('assert');
const { dedupe } = require('./build-monsters.js');
const goblin = { name: 'Goblin', ac: 15, hp: 7, str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8, cr: 0.25 };
const m = (o) => ({ ...goblin, ...o });
const keys = (list) => dedupe(list).map((e) => e.key);

assert.deepStrictEqual(keys([m({ key: 'srd' }), m({ key: 'copy' })]), ['srd'], 'an exact copy goes');
assert.deepStrictEqual(keys([m({ key: 'srd' }), m({ key: 'hp', hp: 9 })]), ['srd'], 'one changed number still goes');
assert.deepStrictEqual(keys([m({ key: 'srd' }), m({ key: 'two', hp: 9, ac: 13 })]), ['srd'], 'two changed numbers still go');
assert.deepStrictEqual(keys([m({ key: 'srd' }), m({ key: 'remake', hp: 30, ac: 17, str: 16 })]), ['srd'], 'a rebalanced copy with the same name goes');
assert.deepStrictEqual(keys([m({ key: 'srd' }), m({ key: 'a5e' }), m({ key: 'orc', name: 'Orc' })]), ['srd', 'orc'], 'the first copy wins and other monsters stay');
assert.deepStrictEqual(keys([m({ key: 'srd' }), m({ key: 'boss', name: 'Goblin Boss' })]), ['srd', 'boss'], 'a different name stays');
assert.deepStrictEqual(keys([m({ key: 'a', name: 'Adult Red Dragon' }), m({ key: 'b', name: 'Red Dragon, Adult' })]), ['a'], 'reordered names match');
assert.deepStrictEqual(keys([m({ key: 'a', name: 'Goblin' }), m({ key: 'b', name: 'goblin' })]), ['a'], 'case does not matter');
console.log('dnd monsters dedupe ok');
