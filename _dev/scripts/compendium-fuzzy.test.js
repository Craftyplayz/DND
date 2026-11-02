// Checks the Compendium's typo-tolerant search scorer.   usage: node _dev/scripts/compendium-fuzzy.test.js
const assert = require('assert');
const { score, dist } = require('../../assets/js/fuzzy.js');

assert.strictEqual(dist('firebal', 'fireball', 2), 1);
assert.strictEqual(dist('fierball', 'fireball', 2), 1, 'a swap is one edit');
assert.ok(score('firebal', 'Fireball') >= 850, 'an unfinished name is a starts-with');
assert.ok(score('fireblal', 'Fireball') >= 300, 'a typo still finds it');
assert.ok(score('fierball', 'Fireball') >= 300, 'a swapped pair still finds it');
assert.ok(score('gobln', 'Goblin') >= 300);
assert.ok(score('bag of holdin', 'Bag of Holding') >= 800, 'every word counts');
assert.ok(score('bag holding', 'Bag of Holding') >= 700, 'words can skip');
assert.ok(score('grapled', 'Grappled') >= 300);
assert.strictEqual(score('xyzzy', 'Fireball'), 0, 'junk finds nothing');
assert.strictEqual(score('fireball dragon', 'Fireball'), 0, 'every word has to match');
assert.strictEqual(score('fir', 'Goblin'), 0, 'short words are not fuzzy');
assert.strictEqual(score('dragn', 'Fireball'), 0);

// ranking: exact > starts with > word starts > contains > typo
const r = (q, t) => score(q, t);
assert.ok(r('fire', 'Fire') > r('fire', 'Fireball'));
assert.ok(r('fire', 'Fireball') > r('fire', 'Greater Fire'));
assert.ok(r('fire', 'Greater Fire') > r('fire', 'Campfire'));
assert.ok(r('fire', 'Campfire') > r('firebal', 'Firebolt'));
assert.strictEqual(score("abi-dalzim's", "Abi-Dalzim's Horrid Wilting") >= 800, true, 'punctuation is ignored');
assert.ok(score('', 'anything') > 0, 'no query matches everything');
console.log('compendium fuzzy ok');
