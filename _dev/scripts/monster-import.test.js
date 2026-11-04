// Checks MonImport.save (sheets/monster/import.js): a Compendium stat block becomes a saved monster that remembers its key, a second use
// reuses the saved one, and a failed fetch or save rejects with a message.   usage: node _dev/scripts/monster-import.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync(path.join(__dirname, '../../sheets/monster/import.js'), 'utf8');
const BLOCK = { src: 'srd', m: { name: 'Goblin', size: 'Small', type: 'humanoid', subtype: 'goblinoid', challenge_rating: 0.25, strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8,
    armor_class: [{ value: 15, type: 'armor', armor: [{ name: 'Leather Armor' }] }], hit_points: 7, hit_points_roll: '2d6', speed: { walk: '30 ft.' },
    actions: [{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' }] } };
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

(async () => {
    const saved = [];
    let hit = null, failBlock = false;
    const fetch = async (url, opt) => {
        if (url.includes('cloud.php?cmp=')) return hit ? reply(200, { id: hit }) : reply(404, { error: 'No such monster.' });
        if (url.endsWith('monsters.json')) return reply(200, { sources: { srd: { title: 'SRD 5.1', licence: 'CC BY 4.0' } } });
        if (url.includes('monsters.php?i=')) return failBlock ? reply(404, { error: 'No such monster.' }) : reply(200, BLOCK);
        if (url.endsWith('cloud.php') && opt?.method === 'POST') { saved.push(JSON.parse(opt.body)); return reply(200, {}); }
        throw new Error('unexpected ' + url);
    };
    const win = {};
    vm.runInNewContext(code, { window: win, fetch, console, encodeURIComponent, Date, JSON, Math, Object, Array, String, Set, parseFloat, RegExp, Error, Promise });
    const { id } = await win.MonImport.save('srd:goblin');
    assert.strictEqual(saved.length, 1);
    const c = saved[0];
    assert.strictEqual(c.id, id);
    assert.deepStrictEqual([c.cmp, c.name, c.race, c.cr, c.ac, c.hp.cur, c.hp.base, c.enc], ['srd:goblin', 'Goblin', 'Small humanoid (goblinoid)', '1/4', '15 [Leather Armor]', 7, 7, '']);
    assert.ok(c.updated > 0 && Array.isArray(c.abilities), 'what cloud.php takes');
    assert.strictEqual(win.MonImport.normalise(JSON.parse(JSON.stringify(c))).cmp, 'srd:goblin', 'the sheet keeps the key on load');
    hit = 'saved123';
    assert.strictEqual((await win.MonImport.save('srd:goblin')).id, 'saved123', 'a second use reuses it');
    assert.strictEqual(saved.length, 1);
    hit = null; failBlock = true;
    await assert.rejects(win.MonImport.save('srd:nope'), /No such monster/);
    console.log('monster import ok');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
