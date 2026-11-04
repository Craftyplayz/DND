// Checks the encounter difficulty tables and sums (sheets/monster/difficulty.js, ROADMAP 3.2) against the books.
//   node _dev/scripts/encounter-difficulty.test.js
// The tables below were typed separately from the book pages: Basic Rules (2014) for XP by CR, thresholds and multipliers,
// SRD 5.2.1 page 202 for the 2024 budgets, so a slip in either copy shows up here.
const assert = require('assert');
const D = require('../../sheets/monster/difficulty.js');

const BOOK_XP = '0:10 1/8:25 1/4:50 1/2:100 1:200 2:450 3:700 4:1100 5:1800 6:2300 7:2900 8:3900 9:5000 10:5900 11:7200 12:8400 13:10000 14:11500 15:13000 16:15000 17:18000 18:20000 19:22000 20:25000 21:33000 22:41000 23:50000 24:62000 25:75000 26:90000 27:105000 28:120000 29:135000 30:155000';
for (const pair of BOOK_XP.split(' ')) { const [cr, xp] = pair.split(':'); assert.strictEqual(D.crXp(cr), +xp, 'XP for CR ' + cr); }
assert.strictEqual(Object.keys(D.XP).length, 34);

const BOOK_2014 = `25 50 75 100|50 100 150 200|75 150 225 400|125 250 375 500|250 500 750 1100|300 600 900 1400|350 750 1100 1700|450 900 1400 2100|550 1100 1600 2400|600 1200 1900 2800|800 1600 2400 3600|1000 2000 3000 4500|1100 2200 3400 5100|1250 2500 3800 5700|1400 2800 4300 6400|1600 3200 4800 7200|2000 3900 5900 8800|2100 4200 6300 9500|2400 4900 7300 10900|2800 5700 8500 12700`;
const BOOK_2024 = `50 75 100|100 150 200|150 225 400|250 375 500|500 750 1100|600 1000 1400|750 1300 1700|1000 1700 2100|1300 2000 2600|1600 2300 3100|1900 2900 4100|2200 3700 4700|2600 4200 5400|2900 4900 6200|3300 5400 7800|3800 6100 9800|4500 7200 11700|5000 8700 14200|5500 10700 17200|6400 13200 22000`;
const rows = (s) => s.split('|').map((r) => r.split(' ').map(Number));
assert.deepStrictEqual(D.T2014, rows(BOOK_2014));
assert.deepStrictEqual(D.T2024, rows(BOOK_2024));

// the multiplier: the book's bands, and one step for a small or large party
for (const [n, m] of [[1, 1], [2, 1.5], [3, 2], [6, 2], [7, 2.5], [10, 2.5], [11, 3], [14, 3], [15, 4], [40, 4]]) assert.strictEqual(D.multiplier(n, 4), m, `${n} monsters`);
for (const size of [3, 4, 5]) assert.strictEqual(D.multiplier(1, size), 1, `party of ${size} has no shift`);
assert.strictEqual(D.multiplier(1, 2), 1.5, 'book: single monster, small party');
assert.strictEqual(D.multiplier(15, 1), 5, 'book: 15 or more, small party');
assert.strictEqual(D.multiplier(1, 6), 0.5, 'book: single monster, large party');
assert.strictEqual(D.multiplier(4, 7), 1.5, 'large party moves down');
assert.strictEqual(D.multiplier(4, 0), 2, 'no party yet: no shift');

// reading a CR
for (const [x, v] of [['1/4', 0.25], ['1 / 2', 0.5], ['0.25', 0.25], ['¼', 0.25], ['½', 0.5], ['⅛', 0.125], ['15 (lair)', 15], [' 3 ', 3], [7, 7], ['0', 0]]) assert.strictEqual(D.crValue(x), v, 'read ' + x);
for (const x of ['abc', '', null, undefined, '1/0', '-1', '?']) assert.strictEqual(D.crValue(x), null, 'unreadable ' + x);
for (const x of ['abc', '', '1/3', '31', '1/0', '?']) assert.strictEqual(D.crXp(x), null, 'no XP for ' + x);

// typed levels
assert.deepStrictEqual(D.parseLevels('5, 5, 4').levels, [5, 5, 4]);
assert.deepStrictEqual(D.parseLevels('4x5').levels, [5, 5, 5, 5]);
assert.deepStrictEqual(D.parseLevels('2 x 3, 1×7 9').levels, [3, 3, 7, 9]);
assert.deepStrictEqual(D.parseLevels('').levels, []);
assert.deepStrictEqual(D.parseLevels('5, abc, 0, 25'), { levels: [5, 1, 20], bad: ['abc'], moved: [0, 25] });
assert.deepStrictEqual(D.parseLevels('99999999x5').levels, [], 'a stray huge count');

// the roadmap's example, worked by hand: 4 level 3s against 4 goblins (50 XP each)
const gob = [50, 50, 50, 50], four = [3, 3, 3, 3];
let r = D.rate('2014', four, gob);
assert.deepStrictEqual([r.total, r.mult, r.adjusted, r.tier.label, r.tier.cls], [200, 2, 400, 'Easy', 'g']);
assert.deepStrictEqual(r.thresholds, [['Easy', 300], ['Medium', 600], ['Hard', 900], ['Deadly', 1600]]);
r = D.rate('2024', four, gob);
assert.deepStrictEqual([r.total, r.mult, r.adjusted, r.tier.label, r.tier.ours], [200, 1, 200, 'Trivial', true]);
assert.deepStrictEqual(r.thresholds, [['Low', 600], ['Moderate', 900], ['High', 1600]]);

// mixed levels add each character's own thresholds
assert.deepStrictEqual(D.rate('2014', [5, 3], [100]).thresholds[0], ['Easy', 325]);
// reaching a threshold counts as it; one under doesn't
assert.strictEqual(D.rate('2014', [1, 1, 1, 1], [100]).tier.label, 'Easy');
assert.strictEqual(D.rate('2014', [1, 1, 1, 1], [99]).tier.label, 'Trivial');
assert.strictEqual(D.rate('2014', [1, 1, 1, 1], [200]).tier.label, 'Medium');
assert.strictEqual(D.rate('2014', [1, 1, 1, 1], [400]).tier.label, 'Deadly');
assert.strictEqual(D.rate('2014', [1, 1, 1, 1], [99999]).tier.label, 'Deadly', 'no band above Deadly');
assert.strictEqual(D.rate('2024', [1, 1, 1, 1], [400]).tier.label, 'High');
assert.deepStrictEqual([D.rate('2024', [1, 1, 1, 1], [401]).tier.label, D.rate('2024', [1, 1, 1, 1], [401]).tier.cls], ['Above High', 'r']);
// halves round down
assert.strictEqual(D.rate('2014', [5, 5, 5], [25, 10]).adjusted, 52);
// no party or no monsters: no difficulty
assert.strictEqual(D.rate('2014', [], [50]).tier, null);
assert.strictEqual(D.rate('2014', [3], []).tier, null);
assert.deepStrictEqual([D.rate('2014', [], [50, 50]).adjusted, D.rate('2014', [3], []).adjusted], [150, 0]);
// unknown rules fall back to 2014
assert.strictEqual(D.rate('', four, gob).rules, '2014');

console.log('encounter difficulty ok');
