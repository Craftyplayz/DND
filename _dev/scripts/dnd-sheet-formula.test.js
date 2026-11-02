// Checks games/dnd/sheets/player-dev/formula.js.   usage: node _dev/scripts/dnd-sheet-formula.test.js
const assert = require('assert');
require('../../games/dnd/sheets/player-dev/formula.js');
const calc = globalThis.hbCalc;
const vars = { dex: 3, prof: 2, level: 5, perception: 4 };
assert.strictEqual(calc('10 + DEX', vars).v, 13);
assert.strictEqual(calc('ceil(LEVEL / 4) + 1', vars).v, 3);
assert.strictEqual(calc('8 + prof + -dex * 2', vars).v, 4);
assert.strictEqual(calc('LEVEL / 2', vars).v, 2);
assert.strictEqual(calc('max(DEX, 1, 2)', vars).v, 3);
assert.strictEqual(calc('', vars).v, 0);
assert.strictEqual(calc('10 + Perception', vars).v, 14);
assert.throws(() => calc('10 + WIS', vars), /Unknown name WIS/);
assert.throws(() => calc('(1 + 2', vars), /Missing \)/);
assert.throws(() => calc('constructor', vars), /Unknown name/);
assert.strictEqual(calc('10 + DEX + 2 [Shield]', vars).v, 15);
assert.strictEqual(calc('min(DEX, 2) [Medium armour] + 14', vars).v, 16);
const terms = globalThis.hbTerms;
assert.deepStrictEqual(terms('10 + min(DEX, 2) - 1 [Curse] + 2 [Shield]'), [
    { sign: '+', src: '10', label: '' }, { sign: '+', src: 'min(DEX, 2)', label: '' },
    { sign: '-', src: '1', label: 'Curse' }, { sign: '+', src: '2', label: 'Shield' }]);
assert.deepStrictEqual(terms('-DEX * 2 + PROF'), [{ sign: '-', src: 'DEX * 2', label: '' }, { sign: '+', src: 'PROF', label: '' }]);
assert.deepStrictEqual(terms('2 * -1'), [{ sign: '+', src: '2 * -1', label: '' }]);
assert.deepStrictEqual(terms(''), []);
const dice = (f) => globalThis.hbDice(f, vars).text;
assert.strictEqual(dice('4 * (1d12 + 10)'), '4 × (1d12 + 10)');
assert.deepStrictEqual(globalThis.hbDice('4 * (1d12 + 10)', vars), { text: '4 × (1d12 + 10)', dice: [[12, 4]], k: 40, each: 4 });
assert.strictEqual(dice('4 * (1d12 + 10) + 2'), '4d12 + 42');
assert.strictEqual(dice('4 * (4d12 + 10)'), '4 × (4d12 + 10)');
assert.strictEqual(dice('4d12 + (10 * 4)'), '4d12 + 40');
assert.strictEqual(dice('ceil(LEVEL / 4) + 1 + 1d8'), '1d8 + 3');
assert.strictEqual(dice('1d6 + DEX - 1d6 + 2d6'), '2d6 + 3');
assert.strictEqual(dice('2d8 - 1'), '2d8 − 1');
assert.strictEqual(dice('2 * (1d4 + 3)'), '2 × (1d4 + 3)');
assert.strictEqual(dice('(4d12) / 2'), '2d12');
assert.throws(() => dice('1d12 / 2'), /split/);
assert.throws(() => dice('1d8 * 1d6'), /multiplied by dice/);
assert.throws(() => dice('max(1d8, 2)'), /inside max/);
console.log('dnd sheet formula ok');
