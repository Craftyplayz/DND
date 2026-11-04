// Monster Sheet (/sheets/monster/): a copy of the player sheet (sheet.js) for monsters. Creature type is kept in the player sheet's race field,
// there are no classes (one hidden row keeps the monster's hit dice) and CR stands in for level. Monsters live in this browser's localStorage,
// and every edit is backed up on the server (backup.php, browsed at /private/dnd/monsters/).
// The search list is monsters.json (built by _dev/scripts/build-monsters.js); monsters.php fetches one stat block.
// Every input carries data-k="path.in.character"; typing updates the character, saves, and refreshes the [data-c] numbers.
// Clicks that change structure (add/remove rows, conditions, tabs) redraw the sheet.
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const { $, esc, toast, debounce } = UI;
    const KEY = 'monster-sheet';
    const root = $('#hb-sheet'), dlg = $('#hb-dlg'), dlgBody = $('#hb-dlg-body'), drawer = $('#hb-drawer');

    // the monster's shape and the stat block conversion: sheets/monster/import.js, shared with the map's Token Browser
    const { ABIL, SKILLS, CONDITIONS, LISTS, RACES, FLEX_COST, TYPES, LIST_GROUPS, uid, nm, ROW, PANEL_ROW, newPanel, blank, isObj, groupOf, upgrade, normalise, crText, cap, usage, fromAction, fromStatBlock } = window.MonImport;
    const LIST_NAMES = { time: 'Timings', dmg: 'Damage types', props: 'Weapon properties', cats: 'Item categories', speeds: 'Speed types' };
    const PRESET = {
        armour: ['Light armour', 'Medium armour', 'Heavy armour', 'Shields'],
        weapons: ['Simple weapons', 'Martial weapons'],
        langs: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'],
    };
    const TOOLS = ["Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools", "Cartographer's tools", "Cobbler's tools", "Cook's utensils",
        "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools", "Smith's tools", "Tinker's tools",
        "Weaver's tools", "Woodcarver's tools", 'Disguise kit', 'Forgery kit', 'Herbalism kit', "Navigator's tools", "Poisoner's kit", "Thieves' tools",
        'Dice set', 'Playing card set', 'Bagpipes', 'Drum', 'Flute', 'Lute', 'Lyre', 'Horn', 'Viol', 'Vehicles (land)', 'Vehicles (water)'];
    // 2014 classes that prepare spells; the rest know theirs, so the Prepared tab hides unless Customise turns it on
    const PREP_CLASSES = ['artificer', 'cleric', 'druid', 'paladin', 'wizard'];
    const HIT_DIE = { barbarian: 12, fighter: 10, paladin: 10, ranger: 10, sorcerer: 6, wizard: 6, artificer: 8, bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8 };
    // suggestion lists for the plain text fields
    const CLASSES = Object.keys(HIT_DIE).map((c) => c[0].toUpperCase() + c.slice(1));

    // SRD hit dice and class/race names come from srd-build.json (fetched once, then browser-cached); the inline lists above are the offline fallback.
    // hbSrd() resolves with the data, or null when it can't be loaded (4.2+ say "needs a connection once").
    let srdP = null;
    const hbSrd = () => srdP || (srdP = fetch('/sheets/player/srd-build.json').then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d) for (const [k, c] of Object.entries(d.classes)) { HIT_DIE[k] = c.hit_die; if (!CLASSES.includes(c.name)) CLASSES.push(c.name); }
        return d;
    }).catch(() => null));
    window.hbSrd = hbSrd; hbSrd();
    // suggestions for the Creature type field (the race key)
    const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];
    const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
    const DURATIONS = ['Instantaneous', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', '24 hours', '7 days', '10 days', '30 days', 'Until dispelled', 'Special',
        'Up to 1 round', 'Up to 1 minute', 'Up to 10 minutes', 'Up to 1 hour', 'Up to 8 hours', 'Up to 24 hours'];
    // SRD weapons: name|damage|type|properties|range|weight (lb)
    const WEAPONS = `Club|1d4|Bludgeoning|Light|5 ft|2
Dagger|1d4|Piercing|Finesse, Light, Thrown|5 ft or 20/60 ft|1
Greatclub|1d8|Bludgeoning|Two-handed|5 ft|10
Handaxe|1d6|Slashing|Light, Thrown|5 ft or 20/60 ft|2
Javelin|1d6|Piercing|Thrown|5 ft or 30/120 ft|2
Light hammer|1d4|Bludgeoning|Light, Thrown|5 ft or 20/60 ft|2
Mace|1d6|Bludgeoning||5 ft|4
Quarterstaff|1d6|Bludgeoning|Versatile|5 ft|4
Sickle|1d4|Slashing|Light|5 ft|2
Spear|1d6|Piercing|Thrown, Versatile|5 ft or 20/60 ft|3
Light crossbow|1d8|Piercing|Ammunition, Loading, Two-handed|80/320 ft|5
Dart|1d4|Piercing|Finesse, Thrown|5 ft or 20/60 ft|0.25
Shortbow|1d6|Piercing|Ammunition, Two-handed|80/320 ft|2
Sling|1d4|Bludgeoning|Ammunition|30/120 ft|0
Battleaxe|1d8|Slashing|Versatile|5 ft|4
Flail|1d8|Bludgeoning||5 ft|2
Glaive|1d10|Slashing|Heavy, Reach, Two-handed|10 ft|6
Greataxe|1d12|Slashing|Heavy, Two-handed|5 ft|7
Greatsword|2d6|Slashing|Heavy, Two-handed|5 ft|6
Halberd|1d10|Slashing|Heavy, Reach, Two-handed|10 ft|6
Lance|1d12|Piercing|Reach|10 ft|6
Longsword|1d8|Slashing|Versatile|5 ft|3
Maul|2d6|Bludgeoning|Heavy, Two-handed|5 ft|10
Morningstar|1d8|Piercing||5 ft|4
Pike|1d10|Piercing|Heavy, Reach, Two-handed|10 ft|18
Rapier|1d8|Piercing|Finesse|5 ft|2
Scimitar|1d6|Slashing|Finesse, Light|5 ft|3
Shortsword|1d6|Piercing|Finesse, Light|5 ft|2
Trident|1d6|Piercing|Thrown, Versatile|5 ft or 20/60 ft|4
War pick|1d8|Piercing||5 ft|2
Warhammer|1d8|Bludgeoning|Versatile|5 ft|2
Whip|1d4|Slashing|Finesse, Reach|10 ft|3
Blowgun|1|Piercing|Ammunition, Loading|25/100 ft|1
Hand crossbow|1d6|Piercing|Ammunition, Light, Loading|30/120 ft|3
Heavy crossbow|1d10|Piercing|Ammunition, Heavy, Loading, Two-handed|100/400 ft|18
Longbow|1d8|Piercing|Ammunition, Heavy, Two-handed|150/600 ft|2`.split('\n').map((l) => l.split('|'));
    const ARMOUR = [['Padded armour', 8], ['Leather armour', 10], ['Studded leather armour', 13], ['Hide armour', 12], ['Chain shirt', 20], ['Scale mail', 45],
        ['Breastplate', 20], ['Half plate', 40], ['Ring mail', 40], ['Chain mail', 55], ['Splint armour', 60], ['Plate armour', 65], ['Shield', 6]];
    // SRD gear: [name, weight, category]
    const GEAR = [['Backpack', 5], ['Bedroll', 7], ['Blanket', 3], ['Candle', 0], ['Caltrops (bag of 20)', 2], ['Chalk', 0], ['Component pouch', 2], ['Crowbar', 5],
        ['Arcane focus (crystal)', 1], ['Arcane focus (staff)', 4], ['Druidic focus (wooden staff)', 4], ['Holy symbol (amulet)', 1], ["Healer's kit", 3],
        ['Hempen rope (50 ft)', 10], ['Silk rope (50 ft)', 5], ['Hooded lantern', 2], ['Bullseye lantern', 2], ['Lamp', 1], ['Oil (flask)', 1], ['Rations (1 day)', 2],
        ['Tinderbox', 1], ['Torch', 1], ['Waterskin', 5], ['Mess kit', 1], ['Spellbook', 3], ['Ball bearings (bag of 1,000)', 2], ['Grappling hook', 4], ['Hammer', 3],
        ['Piton', 0.25], ['Steel mirror', 0.5], ['Book', 5], ['Ink (1 ounce bottle)', 0], ['Ink pen', 0], ['Parchment (one sheet)', 0], ['Pouch', 1], ['Sack', 0.5],
        ['Shovel', 5], ['Manacles', 6], ["Climber's kit", 12], ['Hunting trap', 25], ['Common clothes', 3], ["Traveler's clothes", 4], ['Fine clothes', 6],
        ['Costume clothes', 4], ['Robes', 4], ['Arrows (20)', 1], ['Crossbow bolts (20)', 1.5], ['Sling bullets (20)', 1.5], ['Blowgun needles (50)', 1],
        ['Potion of healing', 0.5, 'Consumables'], ['Antitoxin (vial)', 0, 'Consumables'], ['Acid (vial)', 1, 'Consumables'], ["Alchemist's fire (flask)", 1, 'Consumables'],
        ['Holy water (flask)', 1, 'Consumables'], ['Basic poison (vial)', 0, 'Consumables'],
        ...WEAPONS.map((w) => [w[0], +w[5], 'Weapons']), ...ARMOUR.map(([n, w]) => [n, w, 'Armour'])];
    const LANGS = ['Aarakocra', 'Aquan', 'Auran', 'Druidic', 'Gith', 'Gnoll', 'Ignan', 'Leonin', 'Loxodon', 'Minotaur', 'Quori', 'Sign language', 'Sylvan', 'Terran', 'Thieves’ Cant', 'Vedalken'];
    const FEATURES = ['Darkvision', 'Superior Darkvision', 'Fey Ancestry', 'Trance', 'Keen Senses', 'Dwarven Resilience', 'Stonecunning', 'Lucky', 'Brave',
        'Halfling Nimbleness', 'Relentless Endurance', 'Savage Attacks', 'Hellish Resistance', 'Infernal Legacy', 'Breath Weapon', 'Damage Resistance', 'Gnome Cunning',
        'Menacing', 'Rage', 'Unarmored Defense', 'Reckless Attack', 'Danger Sense', 'Extra Attack', 'Fighting Style', 'Second Wind', 'Action Surge', 'Indomitable',
        'Sneak Attack', 'Cunning Action', 'Uncanny Dodge', 'Evasion', 'Expertise', 'Martial Arts', 'Unarmored Movement', 'Deflect Missiles', 'Slow Fall',
        'Stunning Strike', 'Divine Sense', 'Lay on Hands', 'Divine Smite', 'Aura of Protection', 'Channel Divinity', 'Wild Shape', 'Bardic Inspiration',
        'Jack of All Trades', 'Song of Rest', 'Font of Magic', 'Arcane Recovery', 'Eldritch Invocations', 'Pact Boon', 'Favored Enemy', 'Natural Explorer',
        'Spellcasting', 'Ability Score Improvement',
        'Alert', 'Actor', 'Athlete', 'Charger', 'Chef', 'Crossbow Expert', 'Crusher', 'Defensive Duelist', 'Dual Wielder', 'Dungeon Delver', 'Durable',
        'Eldritch Adept', 'Elemental Adept', 'Fey Touched', 'Fighting Initiate', 'Grappler', 'Great Weapon Master', 'Healer', 'Heavily Armored', 'Inspiring Leader',
        'Keen Mind', 'Lightly Armored', 'Linguist', 'Mage Slayer', 'Magic Initiate', 'Martial Adept', 'Medium Armor Master', 'Metamagic Adept', 'Mobile',
        'Moderately Armored', 'Mounted Combatant', 'Observant', 'Piercer', 'Poisoner', 'Polearm Master', 'Resilient', 'Ritual Caster', 'Savage Attacker', 'Sentinel',
        'Shadow Touched', 'Sharpshooter', 'Shield Master', 'Skill Expert', 'Skilled', 'Skulker', 'Slasher', 'Spell Sniper', 'Tavern Brawler', 'Telekinetic',
        'Telepathic', 'Tough', 'War Caster', 'Weapon Master'];
    const RESOURCES = ['Rage', 'Ki points', 'Bardic Inspiration', 'Channel Divinity', 'Wild Shape', 'Second Wind', 'Action Surge', 'Indomitable', 'Lay on Hands',
        'Divine Sense', 'Sorcery points', 'Superiority dice', 'Arcane Recovery', 'Spell slots', 'Pact slots', 'Hit dice', 'Infusions', 'Flash of Genius',
        'Luck points', 'Breath Weapon', 'Relentless Endurance', 'Healing Light', 'Fey Step'];
    const METAMAGIC = [['Careful Spell', '1', 'Some creatures you choose automatically succeed on the save against your spell.'],
        ['Distant Spell', '1', 'Double the range, or make a touch spell reach 30 ft.'],
        ['Empowered Spell', '1', 'Reroll some of the damage dice and use the new rolls.'],
        ['Extended Spell', '1', 'Double the duration, up to 24 hours.'],
        ['Heightened Spell', '3', 'One target has disadvantage on its first save against the spell.'],
        ['Quickened Spell', '2', 'Cast a spell that takes an action as a bonus action instead.'],
        ['Subtle Spell', '1', 'Cast without verbal or somatic components.'],
        ['Twinned Spell', 'spell level', 'Target a second creature with a spell that targets only one.']];
    const RESETS = [['', 'No reset'], ['short', 'Short rest'], ['long', 'Long rest']];
    // homebrew abilities: a sub-tab per timing (anything else goes under Other), and what each effect does
    const HB_TIMES = [['Action', 'Actions', 'action'], ['Bonus action', 'Bonus actions', 'bonus action'], ['Reaction', 'Reactions', 'reaction'], ['Other', 'Other', 'ability']];
    const FX_KINDS = [['dmg', 'Damage'], ['heal', 'Healing'], ['temp', 'Temp HP'], ['buff', 'Buff / utility']];
    // what a spell does besides damage (damage keeps its own rows); also the spell list's effect filter
    // suggestions for item attributes; picking an SRD item fills its own from dnd5eapi.co
    const ITEM_ATTRS = ['Simple', 'Martial', 'Melee', 'Ranged', 'Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Special', 'Thrown', 'Two-Handed', 'Versatile',
        'Silvered', 'Magical', 'Light armour', 'Medium armour', 'Heavy armour', 'Shield', 'Stealth disadvantage', 'Consumable', 'Arcane Foci', 'Holy Symbols', 'Druidic Foci', 'Kits'];
    const SPELL_FX = [['heal', 'Healing'], ['temp', 'Temp HP'], ['buff', 'Buff'], ['debuff', 'Debuff'], ['control', 'Control'], ['teleport', 'Teleport / movement'], ['summon', 'Summon'], ['defence', 'Defence'], ['utility', 'Utility']];
    const FX_PH = { buff: '+2 AC until the start of your next turn', debuff: 'Disadvantage on attack rolls', control: 'The target is restrained', teleport: 'Teleport up to 30 feet', summon: 'A spectral steed appears', defence: '+5 AC until your next turn', utility: 'Bright light in a 20-foot radius' };
    const TRACKER_KINDS = [['count', 'Counter'], ['pips', 'Boxes'], ['levels', 'Slots by level'], ['sorcery', 'Sorcery points'], ['ki', 'Ki points']];
    const PROF = [[0, 'Not proficient'], [0.5, 'Half proficient'], [1, 'Proficient'], [2, 'Expertise']];
    const HELP = 'Formulas can use ability keys for modifiers (DEX), _SCORE for scores (DEX_SCORE), PROF, CR (LEVEL means the same), CANTRIP (cantrip dice, CANTRIPd10), skill names without spaces (SleightofHand), resources by name without spaces (KIPOINTS left, KIPOINTS_USED spent, KIPOINTS_MAX), spell slots (SLOTS, SLOTS_USED, SLOTS_3, SLOTS_3_USED), numbers, + - * / ( ), min(), max(), floor(), ceil(), and [labels] like 2 [Shield]. Results round down.';
    // non-SRD spells (srd: 'wd:<slug>') carry stats only; their text is linked on dnd5e.wikidot.com
    const wdUrl = (r) => (String(r.srd || '').startsWith('wd:') ? 'https://dnd5e.wikidot.com/spell:' + r.srd.slice(3) : '');
    const SRD_CREDIT = 'From the <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener">System Reference Document 5.1 and 5.2</a> by Wizards of the Coast, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC-BY-4.0</a>.';

    // ---- storage ----
    let db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!isObj(db) || !isObj(db.chars)) db = { cur: '', chars: {} };
    // updated: when the monster last changed (0 = an untouched blank); ones saved before it existed count as very old
    for (const id in db.chars) { db.chars[id] = normalise(db.chars[id]); db.chars[id].updated ||= 1; }
    if (!db.chars[db.cur]) db.cur = Object.keys(db.chars)[0] || '';
    if (!db.cur) { const c = blank(); db.chars[c.id] = c; db.cur = c.id; }
    let C = db.chars[db.cur];
    // ---- named encounters (ROADMAP 3.1) ----
    // db.encs: [{id, name, order, archived, updated}], also kept in the account (encounters.php) and backed up (backup.php?encs).
    // A monster's "enc" names its encounter; empty, or naming one that isn't in the list, it's in Unsorted (its value is kept).
    // Lists merge per encounter: the newer "updated" wins, and an encounter either copy has is never dropped.
    // party (ROADMAP 3.2): who its difficulty is worked out for; only encounters that have had one carry it
    const partyNorm = (p) => (isObj(p) ? { camp: typeof p.camp === 'string' ? p.camp : '', off: (Array.isArray(p.off) ? p.off : []).filter((x) => typeof x === 'string'), levels: typeof p.levels === 'string' ? p.levels : '', at: nm(p.at), gone: nm(p.gone) } : null);
    const encNorm = (list) => (Array.isArray(list) ? list : []).filter((e) => isObj(e) && typeof e.id === 'string' && e.id)
        .map((e) => { const party = partyNorm(e.party); return { id: e.id, name: typeof e.name === 'string' ? e.name : '', order: nm(e.order), archived: nm(e.archived), updated: nm(e.updated), ...(party ? { party } : {}) }; });
    // Unsorted isn't in the list, so its party sits beside it, merged the same way
    const unsortedNorm = (u) => { const party = isObj(u) ? partyNorm(u.party) : null; return party ? { party, updated: nm(u.updated) } : null; };
    function encMerge(a, b) {
        const m = new Map(a.map((e) => [e.id, e]));
        for (const e of b) if (!m.has(e.id) || e.updated > m.get(e.id).updated) m.set(e.id, e);
        return [...m.values()];
    }
    db.encs = encMerge([], encNorm(db.encs));
    db.unsorted = unsortedNorm(db.unsorted);
    if (!db.unsorted) delete db.unsorted;
    const encOf = (id) => db.encs.find((e) => e.id === id);
    const bucket = (c) => (c.enc && encOf(c.enc) ? c.enc : '');
    const encName = (id) => (id ? encOf(id)?.name.trim() || 'Unnamed encounter' : 'Unsorted');
    const encsLive = () => db.encs.filter((e) => !e.archived).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    const monsIn = (id) => Object.values(db.chars).filter((c) => bucket(c) === id);
    // the encounter the list shows: the open monster's (db.cur is this browser's last-opened monster, never synced)
    let shownEnc = bucket(C);
    let warned = false;
    function store() {
        try { localStorage.setItem(KEY, JSON.stringify(db)); warned = false; }
        catch (e) { if (!warned) toast("Couldn't save: this browser's storage is full or blocked. Export the monster so you don't lose it.", 'err'); warned = true; }
    }
    // signed in (data-cloud on <main>): monsters are also kept in the account (cloud.php), with this browser's copy for offline use;
    // whichever copy has the newer "updated" wins. Untouched blanks (updated 0) stay in this browser.
    let cloud = 'cloud' in $('#main').dataset;
    function cloudOff() {
        if (!cloud) return;
        cloud = false;
        toast('You were signed out, so monsters are only saved in this browser now. Sign in again to save them to your account.', 'note');
    }
    function cloudSave(id, body) {
        if (hpQueue().some((x) => x.id === id)) { dirty.add(id); return; } // after its HP changes (hpFlush), so they count once
        fetch('cloud.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
            .then((r) => { if (r.status === 401) cloudOff(); else if (!r.ok && r.status !== 409) dirty.add(id); }).catch(() => dirty.add(id));
    }
    // on load: take the account's newer monsters and send up the ones this browser has newer (on first sign-in, all of them)
    if (cloud) (async () => {
        const r = await fetch('cloud.php');
        if (r.status === 401) return cloudOff();
        if (!r.ok) return;
        const { chars, hpAt } = await r.json();
        let got = false;
        for (const [id, up] of Object.entries(chars)) {
            if (db.chars[id] && db.chars[id].updated >= up) continue;
            const g = await fetch('cloud.php?id=' + encodeURIComponent(id));
            if (!g.ok) continue;
            db.chars[id] = normalise(await g.json());
            got = true;
        }
        for (const id in db.chars) if (db.chars[id].updated > (chars[id] || 0)) cloudSave(id, JSON.stringify(db.chars[id]));
        if (got) for (const id in db.chars) hpSeen[id] = hpKey(db.chars[id]);
        hpPull(hpAt);
        if (!got) return;
        // the blank monster made because this browser had none gives way to the account's
        if (!C.updated && Object.keys(db.chars).length > 1) delete db.chars[C.id];
        C = db.chars[db.cur] || Object.values(db.chars)[0];
        db.cur = C.id;
        if (!shownEnc || !encOf(shownEnc)) shownEnc = bucket(C); // an encounter picked while they loaded stays
        store(); draw();
    })().catch(() => {});

    // the encounter list goes to the account (merged there, the merged list comes back) and to the server backups,
    // a moment after each change; signed in, every load sends this browser's list and takes the account's
    let encEdit = 0, encSent = 0; // edits made here, and the last one the account has
    const encPost = (url, keepalive = false) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encs: db.encs, ...(db.unsorted ? { unsorted: db.unsorted } : {}) }), keepalive });
    async function encSync() {
        if (!cloud) return;
        const n = encEdit;
        try {
            const r = await encPost('encounters.php');
            if (r.status === 401) return cloudOff();
            if (!r.ok) return;
            const out = await r.json(), got = encNorm(out.encs), uns = unsortedNorm(out.unsorted), was = JSON.stringify([db.encs, db.unsorted]);
            db.encs = encMerge(db.encs, got);
            if (uns && uns.updated > (db.unsorted?.updated || 0)) db.unsorted = uns;
            encSent = n;
            if (JSON.stringify([db.encs, db.unsorted]) === was) return;
            if (!shownEnc || !encOf(shownEnc)) shownEnc = bucket(C);
            store(); draw();
        } catch (e) { }
    }
    const encSyncLater = debounce(encSync, 600), encBackupLater = debounce(() => encPost('backup.php?encs').catch(() => { }), 1500);
    function encSaved() { encEdit++; store(); encSyncLater(); encBackupLater(); }
    addEventListener('pagehide', () => { if (encEdit !== encSent) { encPost('backup.php?encs', true).catch(() => { }); if (cloud) encPost('encounters.php', true).catch(() => { }); } });
    if (cloud) encSync();

    // every edit is also backed up on the server as a new version (backup.php -> private/dnd/monster-backups/), a few seconds after typing stops
    const dirty = new Set();
    let backupTimer = 0;
    function flushBackups() {
        clearTimeout(backupTimer);
        if (Phone.pulling()) { backupTimer = setTimeout(flushBackups, 300); return; } // checking the account first: see pullOnReturn
        for (const id of [...dirty]) {
            const c = db.chars[id];
            dirty.delete(id);
            if (!c) continue;
            const body = JSON.stringify(c);
            // keepalive lets a backup finish while the page closes (browsers allow it for bodies up to 64 KB)
            fetch('backup.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
                .then((r) => { if (!r.ok && r.status >= 500) dirty.add(id); }).catch(() => dirty.add(id));
            if (cloud && c.updated) cloudSave(id, body);
        }
    }
    let undoSnap = null, undoTimer = 0; // undo for deletes, see snap()
    function saveNow(edited = true) {
        if (C && C.archived) return; // read-only until it's unarchived
        hpCheck(C);
        if (undoSnap && Date.now() - undoSnap.at > 1000) dropUndo();
        if (edited && C) C.updated = Date.now();
        store();
        drawSide();
        if (C) { dirty.add(C.id); clearTimeout(backupTimer); backupTimer = setTimeout(flushBackups, 4000); }
    }
    // the edit is stamped straight away, so switching monster before the save runs still stamps the right one
    const saveLater = debounce(() => saveNow(false), 250);
    const save = () => { if (C && !C.archived) C.updated = Date.now(); saveLater(); };
    addEventListener('pagehide', () => { store(); flushBackups(); });

    // ---- hit points from anywhere (ROADMAP 1.4) ----
    // Signed in, a monster's HP can change here, on another open Monster Sheet and from the campaign page at once, so each
    // HP change also goes to the account as one change (cloud.php?hp=): damage and healing as amounts, anything typed as the
    // numbers that changed. The account applies them in order and sends the result to every open sheet (the "me" room), so
    // no change is lost and an old copy never puts old HP back. Changes made offline wait in "monster-hp-outbox" (only
    // changes on their way to the account, so not synced themselves).
    const HPQ = 'monster-hp-outbox';
    const hpQueue = () => { try { const q = JSON.parse(localStorage.getItem(HPQ)); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
    const hpKeep = (q) => { try { localStorage.setItem(HPQ, JSON.stringify(q)); } catch (e) { } };
    const hpKey = (c) => JSON.stringify(['cur', 'base', 'temp', 'mod'].map((k) => nm(c.hp[k])));
    const hpSeen = {}; // monster id -> its HP as last sent or taken
    for (const id in db.chars) hpSeen[id] = hpKey(db.chars[id]);
    // the damage form's rule (cloud.php's fi_hp does the same), also for changes from the tracker
    function hpApply(c, { k, n }) {
        const max = nm(c.hp.base) + nm(c.hp.mod);
        if (k === 'dmg') { const soak = Math.min(nm(c.hp.temp), n); c.hp.temp = nm(c.hp.temp) - soak; c.hp.cur = Math.max(0, nm(c.hp.cur) - (n - soak)); }
        else if (k === 'temp') c.hp.temp = Math.max(nm(c.hp.temp), n);
        else c.hp.cur = Math.min(max, nm(c.hp.cur) + n);
    }
    function hpOp(c, op) {
        hpSeen[c.id] = hpKey(c);
        if (!cloud || !c.updated) return; // not in the account: the whole-monster save carries it
        hpKeep([...hpQueue(), { q: uid() + uid(), id: c.id, op }]);
        hpFlush();
    }
    // any other HP edit (typed numbers, rests) goes as the numbers that changed
    function hpCheck(c) {
        if (!c || hpSeen[c.id] === hpKey(c)) return;
        if (hpSeen[c.id] === undefined) { hpSeen[c.id] = hpKey(c); return; }
        const was = JSON.parse(hpSeen[c.id]), now = JSON.parse(hpKey(c)), hp = {};
        ['cur', 'base', 'temp', 'mod'].forEach((k, i) => { if (was[i] !== now[i]) hp[k] = now[i]; });
        hpOp(c, { k: 'set', hp });
    }
    let hpBusy = false;
    async function hpFlush() {
        if (hpBusy || !cloud) return;
        hpBusy = true;
        for (const item of hpQueue()) {
            let r;
            try { r = await fetch('cloud.php?hp=' + encodeURIComponent(item.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: item.q, op: item.op }) }); } catch (e) { break; }
            if (r.status === 401) { cloudOff(); break; }
            if (r.status >= 500 || r.status === 429) break;
            hpKeep(hpQueue().filter((x) => x.q !== item.q)); // done, or turned down for good (404: not in the account; its save carries it)
            if (r.ok) hpTake(await r.json());
        }
        hpBusy = false;
        if (!hpQueue().length && dirty.size) flushBackups();
    }
    addEventListener('online', hpFlush);
    setInterval(() => { if (hpQueue().length) hpFlush(); }, 15000);
    // the account's HP, unless this browser still has changes of its own on the way for that monster
    function hpTake(m) {
        const c = db.chars[m.id];
        if (!c || !m.hp || nm(m.hpAt) <= nm(c.hpAt) || hpQueue().some((x) => x.id === m.id)) return;
        Object.assign(c.hp, m.hp);
        c.hpAt = m.hpAt;
        hpSeen[c.id] = hpKey(c);
        store(); drawSide();
        if (c === C) draw();
    }
    // newer HP in the account than here (hpAt: id -> when, from cloud.php's list)
    async function hpPull(hpAt = {}) {
        for (const [id, at] of Object.entries(hpAt || {})) {
            if (!db.chars[id] || nm(db.chars[id].hpAt) >= at) continue;
            try { const g = await fetch('cloud.php?id=' + encodeURIComponent(id)); if (g.ok) hpTake(await g.json()); } catch (e) { }
        }
    }
    // the account's own room: every open sheet hears each HP change at once (and checks every 10 s while the relay is down)
    if (cloud && window.Live) Live.watch('me', {
        load: async () => { try { const r = await fetch('cloud.php'); if (r.ok) hpPull((await r.json()).hpAt); } catch (e) { } },
        onMessage(m) { if (m.type === 'mhp') hpTake(m); },
    });
    if (cloud) hpFlush();

    const get = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), C);
    function set(path, val) {
        const ks = path.split('.');
        const o = ks.slice(0, -1).reduce((o, k) => o[k], C);
        o[ks[ks.length - 1]] = val;
    }
    const L = (name) => (C.lists[name] || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const uniq = (a) => [...new Set(a)];

    // ---- numbers ----
    const kk = (s) => String(s).replace(/\W/g, '').toLowerCase();
    const sg = (n) => (n < 0 ? '−' + -n : '+' + n);
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    function ev(f, V) { try { return hbCalc(f, V); } catch (e) { return { v: NaN, err: e.message }; } }
    // a maximum may be a number or a formula (PROF, LEVEL, CHA, SORCERER_LEVEL); a broken one counts as 0
    const maxOf = (f, V) => { const r = ev(f, V || vars()); return isNaN(r.v) ? 0 : Math.max(0, r.v); };
    // CR stands in for level (CR and LEVEL in formulas, cantrip dice); "1/4" counts as 0.25
    const crNum = (x) => { const m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String(x)); return m ? m[1] / m[2] : nm(x); };
    const level = () => crNum(C.cr);
    const hdTotal = () => C.classes.reduce((s, c) => s + nm(c.level), 0);
    // max HP = base (+ any temporary change)
    const hpMax = () => nm(C.hp.base) + nm(C.hp.mod);
    function profT(ab, p, extra, V) {
        const m = ab ? V[kk(ab)] : 0; // '' = N/A, proficiency only
        if (m === undefined) return { v: NaN, err: 'No ability called ' + ab };
        const b = ev(extra, V);
        return { v: m + Math.floor(V.prof * p) + (b.v || 0), err: b.err };
    }
    function vars() {
        // CANTRIP: cantrip damage dice by CR (1, then 2 at 5, 3 at 11, 4 at 17)
        const V = { level: level(), cr: level(), cantrip: 1 + [5, 11, 17].filter((l) => level() >= l).length };
        for (const a of C.abilities) { const s = nm(a.score); V[kk(a.key)] = Math.floor((s - 10) / 2); V[kk(a.key) + '_score'] = s; }
        V.prof = ev(C.prof, V).v || 0;
        for (const s of C.skills) V[kk(s.name)] = profT(s.ab, s.p, s.b, V).v;
        // resources: NAME is what's left, NAME_USED what's spent, NAME_MAX the maximum (Ki points -> KIPOINTS);
        // slots by level add NAME_1..NAME_9 (each with _USED, _MAX); SLOTS is the spell slots wherever they're kept
        const put = (k, left, max) => { if (!k || has(V, k)) return; V[k] = left; V[k + '_max'] = max; V[k + '_used'] = max - left; };
        const lvls = (k, list) => {
            let L = 0, M = 0;
            list.forEach((o, j) => { const m = maxOf(o.max, V) + nm(o.extra), l = Math.max(0, m - nm(o.used)); put(`${k}_${j + 1}`, l, m); L += l; M += m; });
            put(k, L, M);
        };
        for (const p of C.panels) if (p.type === 'trackers') for (const r of p.rows) {
            const k = kk(r.name);
            if (r.kind === 'levels') lvls(k, r.levels);
            else if (r.kind === 'pips') { const m = maxOf(r.max, V) + nm(r.extra); put(k, Math.max(0, m - nm(r.used)), m); }
            else put(k, nm(r.cur), maxOf(r.max, V));
        }
        const st = slotTracker(), sp = C.panels.find((p) => p.type === 'spells');
        lvls('slots', st ? get(st).levels : sp ? sp.slots : []);
        return V;
    }
    function saveT(a, V) { const b = ev(a.sb, V); return { v: V[kk(a.key)] + (a.save ? V.prof : 0) + (b.v || 0), err: b.err }; }
    const show = (r) => (r.err || typeof r.v === 'number' && isNaN(r.v) ? '?' : r.signed ? sg(r.v) : r.v);
    // "10 + DEX 2 + Shield 2" for a formula
    function why(src, V) {
        const t = hbTerms(src);
        if (t.length < 2 && !(t[0] && t[0].label)) return '';
        return t.map((x, n) => { const r = ev(x.src, V); return (n ? ` ${x.sign === '-' ? '−' : '+'} ` : x.sign === '-' ? '−' : '') + (x.label || x.src.replace(/^min\(\s*(\w+)\s*,\s*(\d+)\s*\)$/i, '$1 (max $2)')) + (x.label || !/^\d+$/.test(x.src) ? ' ' + show(r) : ''); }).join('');
    }
    // "1d8 + STR" -> "1d8 + 3"; a variable straight before a die is its count ("CANTRIPd10" -> "2d10")
    const resolve = (s, V) => String(s || '').replace(/[A-Za-z_]\w*/g, (w) => { const k = w.toLowerCase(), m = k.match(/^(.+?)(d\d+)$/);
        if (m && has(V, m[1]) && !isNaN(V[m[1]])) return V[m[1]] + m[2];
        return /^d\d+$/.test(k) || !has(V, k) || isNaN(V[k]) ? w : String(V[k]); })
        .replace(/\+\s*-\s*(\d)/g, '− $1').replace(/\s+/g, ' ').trim();
    // the formula tester and dice boxes: dice stay dice and the rest is worked out ("4 * (4d12 + 10)" -> "16d12 + 40", formula.js hbDice)
    function diceCalc(src, V) {
        let r;
        try { r = hbDice(src, V); } catch (e) { return { v: NaN, err: e.message }; }
        return r.dice.length ? { v: r.text } : { ...ev(src, V), why: why(src, V) };
    }
    // dice for display and roll buttons: names filled in and the plain-number part worked out ("4d12 + (10 * 4)" -> "4d12 + 40")
    const diceText = (s, V) => { const r = diceCalc(s, V); return r.err || r.v === undefined ? resolve(s, V) : String(r.v); };
    const dmgText = (list, V) => list.filter((d) => d.dice || d.type).map((d) => `${diceText(d.dice, V)} ${d.type}`.trim()).join(' + ');
    const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
    const dateText = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    let noteQ = '';
    const panelOf = (rp) => get(rp.split('.').slice(0, 2).join('.'));

    // each part of an action's summary links to its SRD rule (rules.js); names is "a|b" for more than one rule
    const ruleLink = (kind, names, text, title, sub) => (String(names).split('|').some((n) => rule(kind, n))
        ? `<button type="button" class="hb-prop" data-act="rinfo" data-k="${kind}" data-n="${esc(names)}" data-t="${esc(title)}" data-s="${esc(sub)}">${esc(text)}</button>` : esc(text));
    function rangeRules(range) {
        const s = String(range), first = +(s.match(/\d+/) || [0])[0];
        return [(/\bor\b/.test(s) || (!s.includes('/') && first && first <= 10)) && 'melee attacks', (s.includes('/') || first > 10) && 'ranged attacks'].filter(Boolean).join('|');
    }
    // "2d6 + 1d8 − 1" -> { g: '6x2,8x1', m: -1 }; null when it isn't plain dice the tray has plus whole numbers
    function parseRoll(s) {
        const t = String(s).replace(/−/g, '-').replace(/\s+/g, ''), g = [];
        let m = 0, rest = t.replace(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi, (x, sd, c, n, sn, k) => {
            if (n) { if (sd === '-' || !DICE.includes(+n)) g.push(null); else g.push(`${n}x${c || 1}`); }
            else m += (sn === '-' ? -1 : 1) * +k;
            return '';
        });
        return !rest && g.length && !g.includes(null) ? { g: g.join(','), m } : null;
    }
    // what a dice box rolls: { g: '12x4', m: 40, x: 4 }; x > 1 is that many separate results ("4 × (1d12 + 10)")
    function diceRoll(s, V) {
        let r;
        try { r = hbDice(s, V); } catch (e) { return parseRoll(resolve(s, V)); }
        if (!r.dice.length || r.dice.some(([n, c]) => c < 0 || !DICE.includes(n))) return null;
        return { g: r.dice.map(([n, c]) => `${n}x${c}`).join(','), m: r.k, x: r.each || 1 };
    }
    // a boxed roll button, or the plain rule link when click to roll is off
    const rollBtn = (text, roll, title, fallback) => (C.view.noRoll || !roll ? fallback
        : `<button type="button" class="hb-rollbtn" data-act="roll2"${roll.d20 ? ' data-d20' : ''} data-g="${roll.g}" data-m="${roll.m}" data-x="${roll.x || 1}" data-t="${esc(title)}" title="Roll ${esc(title.toLowerCase())}">${esc(text)}</button>`);
    const dmgLinks = (dmg, V, name = '') => dmg.filter((d) => d.dice || d.type).map((d) => { const txt = d.dice ? diceText(d.dice, V) : '';
        return [d.dice && rollBtn(txt, diceRoll(d.dice, V), `${name || 'Damage'}${d.type ? ' ' + d.type.toLowerCase() : ''} damage`, ruleLink('act', 'damage rolls', txt, 'Damage rolls', 'Damage')),
            d.type && ruleLink('dmg', d.type, d.type, d.type + ' damage', 'Damage type')].filter(Boolean).join(' '); }).join(' + ');
    const hitLink = (v, name, kind, rl, title) => { const txt = show({ ...v, signed: true }) + ' to hit';
        return rollBtn(txt, Number.isFinite(+v.v) ? { g: '20x1', m: +v.v } : null, `${name || 'Attack'} to hit`, ruleLink(kind, rl, txt, title, 'To hit')); };
    // effects in a summary; healing and temp HP are buttons that roll them and apply them to your hit points
    const fxHtml = (fx, V, rp) => fx.map((e, j) => ((e.k === 'heal' || e.k === 'temp') && e.dice
        ? `<button type="button" class="hb-rollbtn" data-act="fxapply" data-p="${rp}.fx.${j}" title="Apply to your hit points">${esc(fxOne(e, V))}</button>` : esc(fxOne(e, V)))).filter(Boolean);
    // ROADMAP 2.1: what a row shows on a phone before it's opened: its rolls, or its weight or source
    function rowQuick(r, P, V) {
        const name = r.name, dmg = () => (r.dmg || []).filter((d) => d.dice).map((d) => rollBtn(diceText(d.dice, V), diceRoll(d.dice, V), `${name || 'Damage'}${d.type ? ' ' + d.type.toLowerCase() : ''} damage`, esc(diceText(d.dice, V))));
        const hit = (v) => { const t = show({ ...v, signed: true }); return rollBtn(t, Number.isFinite(+v.v) ? { g: '20x1', m: +v.v, d20: 1 } : null, `${name || 'Attack'} to hit`, esc(t)); };
        if (P.type === 'attacks') return [r.mode === 'hit' ? hit(ev(r.hit, V)) : r.mode === 'save' ? `<small>${esc(r.save)} ${esc(show(ev(r.dc, V)))}</small>` : '', ...dmg()].filter(Boolean).join(' ');
        if (P.type === 'spells' && 'lvl' in r) return [r.mode === 'atk' ? hit(ev(P.atk, V)) : r.mode === 'save' ? `<small>${esc(r.save)} ${esc(show(ev(r.dc || P.dc, V)))}</small>` : '', ...dmg()].filter(Boolean).join(' ');
        if (P.type === 'items') return `<small>${nm(r.qty) > 1 ? '×' + nm(r.qty) + ' · ' : ''}${nm(r.wt) ? nm(r.wt) + ' lb' : ''}</small>`;
        return r.src ? `<small>${esc(r.src)}</small>` : '';
    }
    function actSum(r, V, rp) {
        return [r.time && ruleLink('act', String(r.time).toLowerCase(), r.time, r.time, 'Timing'),
            r.range && ruleLink('act', rangeRules(r.range), r.range, 'Range: ' + r.range, 'Range'),
            r.mode === 'hit' ? hitLink(ev(r.hit, V), r.name, 'act', 'attack rolls', 'Attack rolls') : '',
            r.mode === 'save' ? ruleLink('act', 'saving throws', `DC ${show(ev(r.dc, V))} ${r.save}`, 'Saving throws', 'Save') : '',
            dmgLinks(r.dmg, V, r.name), ...fxHtml(r.fx, V, rp),
            r.props.map((n) => ruleLink('prop', n, n, n, 'Weapon property')).join(', ')].filter(Boolean).join(' · ');
    }
    const fxOne = (e, V) => (e.k === 'heal' ? 'Heals ' + diceText(e.dice, V) : e.k === 'temp' ? diceText(e.dice, V) + ' temp HP' : e.k === 'dmg' ? dmgText([e], V) : e.text || (SPELL_FX.find(([k]) => k === e.k) || [])[1] || '').trim();
    const hasFx = (r, k) => (k === 'dmg' ? r.dmg.some((d) => d.dice) : r.fx.some((e) => e.k === k));
    const costText = (r) => [String(r.cost.amt).trim(), String(r.cost.what).trim()].filter(Boolean).join(' ');
    function hbSum(r, V, rp) {
        return [...[r.time, r.range, r.mode === 'hit' ? show({ ...ev(r.hit, V), signed: true }) + ' to hit' : '', r.mode === 'save' ? `DC ${show(ev(r.dc, V))} ${r.save}` : '',
            dmgText(r.fx.filter((e) => e.k === 'dmg'), V)].map(esc), ...fxHtml(r.fx.map((e) => (e.k === 'dmg' ? {} : e)), V, rp), esc(costText(r))].filter(Boolean).join(' · ');
    }
    // a counter or boxes resource whose name matches a cost ("Ki point" finds "Ki points")
    function resOf(name) {
        const n = String(name).trim().toLowerCase().replace(/s$/, '');
        if (!n) return null;
        for (const p of C.panels) if (p.type === 'trackers') {
            const r = p.rows.find((x) => x.kind !== 'levels' && String(x.name).trim().toLowerCase().replace(/s$/, '') === n);
            if (r) return r;
        }
        return null;
    }
    // path of a counter resource, for views elsewhere that edit the same numbers
    function resPath(name) {
        const r = resOf(name);
        if (!r || r.kind !== 'pips') return '';
        const pi = C.panels.findIndex((p) => p.type === 'trackers' && p.rows.includes(r));
        return `panels.${pi}.rows.${C.panels[pi].rows.indexOf(r)}`;
    }
    const resLeft = (r) => (r.kind === 'pips' ? maxOf(r.max) + nm(r.extra) - nm(r.used) : nm(r.cur));
    // boxes for a { max, used, extra } object at path: a spell slot level or sorcery points
    const box = (base, V) => pips(base + '.used', maxOf(get(base).max, V), get(base).extra);
    // the "Spell slots" tracker in Resources, if there is one; it and the Spells tab show the same slots
    function slotTracker() {
        for (const [pi, p] of C.panels.entries()) if (p.type === 'trackers') {
            const j = p.rows.findIndex((r) => r.kind === 'levels' && /^spell slots?$/i.test(String(r.name).trim()));
            if (j >= 0) return `panels.${pi}.rows.${j}`;
        }
        return '';
    }
    // Flexible Casting box under the sorcery points: make a slot, turn a slot into points, the cost table
    function flexBox(p, path, spP) {
        const s = get(spP), left = maxOf(s.max) + nm(s.extra) - nm(s.used), sb = slotBases(path), cost = p.flex || FLEX_COST;
        const make = cost.map((c, l) => { const n = maxOf(String(c)); return `<option value="${l}"${left < n || !sb[l] ? ' disabled' : ''}>${ordinal(l + 1)} · ${n} SP${left < n ? ` (you have ${Math.max(0, left)})` : ''}</option>`; }).join('');
        const free = sb.map((b, l) => [b, l]).filter(([b]) => maxOf(get(b).max) + nm(get(b).extra) - nm(get(b).used) > 0);
        return `<div class="hb-flex"><h4>Flexible Casting <small class="muted">bonus action</small></h4>
            <div class="hb-flexrow"><span>Make a slot</span><select class="field hb-auto" id="hb-flex-make" aria-label="Slot level to create">${make}</select><button type="button" class="btn small" data-act="flexmake" data-p="${path}">Create</button></div>
            <div class="hb-flexrow"><span>Turn a slot into points</span>${free.length ? `<select class="field hb-auto" id="hb-flex-burn" aria-label="Slot level to turn into sorcery points">${free.map(([, l]) => `<option value="${l}">${ordinal(l + 1)} · +${l + 1} SP</option>`).join('')}</select><button type="button" class="btn small" data-act="flexburn" data-p="${path}">Convert</button>` : '<span class="muted">No unused spell slots</span>'}</div>
            <div class="table-wrap"><table class="table hb-table"><thead><tr><th>Spell slot level</th>${cost.map((_, l) => `<th>${ordinal(l + 1)}</th>`).join('')}</tr></thead>
                <tbody><tr><td>Sorcery point cost</td>${cost.map((_, l) => `<td>${f(`${path}.flex.${l}`, ordinal(l + 1) + '-level slot cost', { cls: 'hb-n' })}</td>`).join('')}</tr></tbody></table></div>
            <p class="muted hb-hint">Made slots and points above your maximum show as outlined boxes and go when you finish a long rest.</p></div>`;
    }
    // where the slots of each spell level (index 0 = 1st) live: the tracker's levels, or the Spells tab's own
    const slotBases = (path) => { const t = slotTracker(); return t ? get(t).levels.map((_, j) => `${t}.levels.${j}`) : get(path).slots.map((_, l) => `${path}.slots.${l}`); };
    const costAmt = (r) => (String(r.cost.amt).trim() ? maxOf(r.cost.amt) : 1);
    const ITEM_ATT = [['', 'None'], ['needs', 'Needs attunement'], ['yes', 'Attuned']];
    // everything the old inventory table showed, on one line that wraps; attributes open their rule
    const itemFacts = (r) => [r.cat, nm(r.qty) !== 1 ? '×' + nm(r.qty) : '', nm(r.wt) ? `${nm(r.wt)} lb${nm(r.qty) > 1 ? ` each (${Math.round(nm(r.wt) * nm(r.qty) * 100) / 100} lb)` : ''}` : '',
        String(r.gp).trim() !== '' && nm(r.gp) ? `${nm(r.gp)} gp${nm(r.qty) > 1 ? ' each' : ''}` : '', r.att ? ITEM_ATT.find(([k]) => k === r.att)?.[1] : ''].filter(Boolean);
    const itemSum = (r) => [...itemFacts(r).map(esc), ...r.props.map((n) => `<button type="button" class="hb-prop" data-act="attr" data-n="${esc(n)}">${esc(n)}</button>`),
        r.notes ? esc(r.notes) : ''].filter(Boolean).join(' · ');
    function spellSum(r, P, V, rp) {
        return [nm(r.lvl) ? ruleLink('spell', 'spell level', ordinal(nm(r.lvl)), ordinal(nm(r.lvl)) + '-level spell', 'Spell level') : ruleLink('spell', 'cantrips', 'Cantrip', 'Cantrip', 'Spell level'),
            r.time && ruleLink('spell', 'casting time', r.time, 'Casting time: ' + r.time, 'Casting time') + (r.trig ? ', ' + esc(r.trig) : ''),
            r.range && ruleLink('spell', 'spell range', r.range, 'Range: ' + r.range, 'Range'),
            r.conc ? ruleLink('spell', 'concentration', 'Concentration', 'Concentration', 'Duration') : '',
            r.ritual ? ruleLink('spell', 'rituals', 'Ritual', 'Ritual', 'Casting') : '',
            r.mode === 'atk' ? hitLink(ev(P.atk, V), r.name, 'spell', 'spell attack rolls', 'Spell attack rolls') : '',
            r.mode === 'save' ? ruleLink('spell', 'spell saving throws', `DC ${show(ev(r.dc || P.dc, V))} ${r.save}`, 'Spell saving throws', 'Save') : '',
            dmgLinks(r.dmg, V, r.name), ...fxHtml(r.fx, V, rp)].filter(Boolean).join(' · ');
    }

    // value behind a [data-c] key: { v (number or text), err, signed, why, warn }
    function value(key, V) {
        const [t, a] = key.split(':');
        switch (t) {
            case 'mod': return { v: V[kk(C.abilities[a].key)], signed: true };
            case 'save': return { ...saveT(C.abilities[a], V), signed: true };
            case 'skill': { const s = C.skills[a]; return { ...profT(s.ab, s.p, s.b, V), signed: true }; }
            case 'tool': { const s = C.profs.tools[a]; return { ...profT(s.ab, s.p, '', V), signed: true }; }
            case 'fx': return { ...ev(get(a), V), why: why(get(a), V) };
            case 'fb': return diceCalc(get(a), V);
            case 'fs': return { ...ev(get(a), V), signed: true, why: why(get(a), V) };
            case 'rowq': return { html: rowQuick(get(a), panelOf(a), V) };
            case 'phname': return { v: C.name || 'Unnamed monster' };
            case 'phcur': return { v: nm(C.hp.cur) };
            case 'phtemp': return { v: nm(C.hp.temp) ? '+' + nm(C.hp.temp) : '' };
            case 'phcond': return { v: C.conditions.length + (nm(C.exhaustion) ? 1 : 0) };
            case 'phsub': return { v: phSub() };
            case 'phacwhy': return { v: why(C.ac, V) || '' };
            case 'asum': return { html: actSum(get(a), V, a) };
            case 'ssum': return { html: spellSum(get(a), panelOf(a), V, a) };
            case 'isum': return { html: itemSum(get(a)) };
            case 'lsum': return { v: get(a).src };
            case 'hsum': return { html: hbSum(get(a), V, a) };
            case 'msum': return { v: get(a).cost === '' ? '' : `${get(a).cost} SP` };
            case 'wt': return { v: Math.round(C.panels[a].rows.reduce((s, r) => s + nm(r.qty) * nm(r.wt), 0) * 100) / 100 + ' lb' };
            case 'att': { const P = C.panels[a], n = P.rows.filter((r) => r.att === 'yes').length; return { v: `${n} / ${nm(P.attMax)}`, warn: n > nm(P.attMax) }; }
            case 'hdl': { const c = C.classes[a]; return { v: `${Math.max(0, nm(c.level) - nm(c.hdUsed))} of ${nm(c.level)} left` }; }
            case 'lvl': return { v: C.classes.length > 1 ? 'Level ' + level() + ' total' : '' };
            case 'hpmax': return { v: hpMax(), warn: nm(C.hp.mod) < 0, why: `${nm(C.hp.base)} base${nm(C.hp.mod) ? ` ${sg(nm(C.hp.mod))} change` : ''}` };
            case 'hptemp': return { v: nm(C.hp.temp) ? `+${nm(C.hp.temp)} temp` : '' };
            case 'speed': return { v: C.speeds.map((s) => `${s.type} ${/^\s*[\d.]+\s*$/.test(s.ft) ? s.ft + ' ft' : s.ft}${s.hover ? ' (hover)' : ''}`).join(' · ') };
            case 'cond': return { v: [...C.conditions, nm(C.exhaustion) ? 'Exhaustion ' + C.exhaustion : ''].filter(Boolean).join(', ') };
            case 'ntitle': return { v: get(a).title || 'Untitled note' };
            // the worked-out maximum next to a formula like LEVEL or PROF
            case 'tmax': { const s = String(get(a) ?? '').trim(); return { v: !s || /^\d+$/.test(s) ? '' : '= ' + maxOf(s, V) }; }
            case 'nsnip': { const b = String(get(a).body || '').replace(/\s+/g, ' ').trim(); return { v: b.length > 90 ? b.slice(0, 90) + '…' : b }; }
            case 'nago': return { v: 'Edited ' + UI.ago(get(a).updated) };
            case 'def': return { v: [C.res && 'Resists ' + C.res, C.imm && 'Immune to ' + C.imm, C.vul && 'Vulnerable to ' + C.vul].filter(Boolean).join(' · ') };
        }
        return { v: '' };
    }

    function refresh() {
        const V = vars();
        for (const el of document.querySelectorAll('.hb [data-c]')) {
            const r = value(el.dataset.c, V);
            if ('html' in r) el.innerHTML = r.html; else el.textContent = show(r);
            el.classList.toggle('hb-bad', !!r.err);
            el.classList.toggle('hb-warn', !!r.warn);
            if (r.err || r.why) el.title = r.err || r.why; else el.removeAttribute('title');
        }
        for (const el of document.querySelectorAll('.hb [data-e]')) el.textContent = value(el.dataset.e, V).err || '';
        for (const el of document.querySelectorAll('.hb [data-w]')) el.textContent = value(el.dataset.w, V).why || '';
        const total = Math.max(hpMax(), nm(C.hp.cur) + nm(C.hp.temp)) || 1;
        const hp = $('#hb-hpbar'), tmp = $('#hb-tempbar');
        if (hp) hp.style.width = Math.max(0, Math.min(100, (nm(C.hp.cur) / total) * 100)) + '%';
        if (tmp) tmp.style.width = Math.max(0, Math.min(100, (nm(C.hp.temp) / total) * 100)) + '%';
        if (Phone.on()) phMarks();
    }

    // ---- markup helpers ----
    const PENCIL = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    function f(k, label, o = {}) {
        const v = get(k), cls = o.cls ? ' ' + o.cls : '', ph = o.ph ? ` placeholder="${esc(o.ph)}"` : '';
        if (o.area) return `<textarea class="field${cls}" data-k="${k}" aria-label="${esc(label)}"${ph}>${esc(v ?? '')}</textarea>`;
        if (o.check) return `<input type="checkbox" data-k="${k}" aria-label="${esc(label)}"${v ? ' checked' : ''}>`;
        const num = o.num ? ' inputmode="decimal"' : '';
        return `<input class="field${cls}"${num} data-k="${k}" value="${esc(v ?? '')}" aria-label="${esc(label)}"${ph}${o.list ? ` list="${o.list}"` : ''}${o.multi ? ' data-multi="1"' : ''} autocomplete="off">`;
    }
    const sel = (k, label, opts) => `<select class="field" data-k="${k}" aria-label="${esc(label)}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(get(k)) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const abSel = (k, label, na) => { const keys = [...(na ? [['', 'N/A']] : []), ...C.abilities.map((a) => [a.key, a.key])]; const v = get(k); return sel(k, label, keys.some(([x]) => x === v) ? keys : [[v, v + ' (missing)'], ...keys]); };
    const val = (key, cls = '') => `<b class="hb-val${cls}" data-c="${key}"></b>`;
    // a bonus you can click to roll d20 + it (Customise turns this off)
    const rollv = (key, label, cls = '') => (C.view.noRoll ? val(key, cls)
        : `<button type="button" class="hb-d20" data-act="roll" data-k="${key}" data-t="${esc(label)}" title="Roll ${esc(label)}">${val(key, cls)}</button>`);
    // a computed number that opens the formula builder
    const fx = (path, title, signed, cls = '') => `<button type="button" class="hb-roll${cls}" data-act="formula" data-p="${path}" data-t="${esc(title)}"${signed ? ' data-s="1"' : ''} data-c="${signed ? 'fs' : 'fx'}:${path}" aria-label="${esc(title)}, edit the formula"></button>`;
    const del = (p, i, what, text) => `<button type="button" class="${text ? 'btn small' : 'hb-x'}" data-act="del" data-p="${p}" data-i="${i}" aria-label="Remove ${esc(what)}"${text ? '' : ' title="Remove"'}>${text || '&times;'}</button>`;
    const add = (p, t, text, extra = '') => `<button type="button" class="btn small" data-act="add" data-p="${p}" data-t="${t}"${extra}>${text}</button>`;
    // extra boxes after max are temporary (Flexible Casting); they look different and go on a long rest
    const pips = (path, max, extra = 0) => `<span class="hb-pips">${Array.from({ length: Math.max(0, Math.min(nm(max) + nm(extra), 30)) }, (_, i) =>
        `<button type="button" class="${[i < get(path) ? 'used' : '', i >= nm(max) ? 'extra' : ''].join(' ').trim()}" data-act="pip" data-p="${path}" data-i="${i}" aria-label="${i + 1}" aria-pressed="${i < get(path)}"></button>`).join('')}</span>`;
    const table = (head, body) => !body ? '' : `<div class="table-wrap"><table class="table hb-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    const dot = (act, i, s, name) => { const lv = Math.max(0, PROF.findIndex(([p]) => p === s.p)); return `<button type="button" class="hb-prof l${lv}" data-act="${act}" data-i="${i}" aria-label="${esc(name)}: ${PROF[lv][1]}" title="${PROF[lv][1]}"></button>`; };
    // sub-tabs inside a panel; the choice is saved on the panel as .sub
    // sub-tabs plus a pencil that opens your own tabs for renaming, deleting and adding (Resources, Homebrew)
    function tabBar(p, path, opts, cur, tabs) {
        const tid = p.id + ':tabs', tedit = openRows.has(tid);
        return `<div class="hb-subrow">${subtabs(path + '.sub', opts, cur)}<button type="button" class="hb-x hb-toggle hb-tedit" data-act="toggle" data-id="${esc(tid)}" aria-expanded="${tedit}" aria-label="Edit tabs" title="${tedit ? 'Done' : 'Edit tabs'}">${PENCIL}</button></div>
            ${tedit ? `<div class="hb-tabedit">${tabs.map((g) => `<div class="hb-tabtools"><input class="field hb-tname" data-p="${path}" data-g="${esc(g)}" value="${esc(g)}" autocomplete="off" aria-label="Tab name"><button type="button" class="btn small" data-act="tdel" data-p="${path}" data-g="${esc(g)}">Delete</button></div>`).join('')}
                <div class="actions"><button type="button" class="btn small" data-act="tadd" data-p="${path}">New tab</button></div></div>` : ''}`;
    }
    function subtabs(path, opts, cur) {
        return `<div class="stabs hb-sub">${opts.map(([id, label, n]) => `<button type="button" class="${id === cur ? 'on' : ''}" data-act="sub" data-p="${path}" data-id="${esc(id)}" aria-pressed="${id === cur}">${esc(label)}${n != null ? ` <span class="muted">${n}</span>` : ''}</button>`).join('')}</div>`;
    }
    const pickSub = (p, opts) => (opts.some(([id]) => id === p.sub) ? p.sub : opts[0][0]);
    // removable tags with an "add your own" field
    function tags(path, presets, ph, list, kind) {
        const have = get(path), all = uniq([...presets, ...have]);
        return `<div class="badges">${all.map((n) => `<button type="button" class="badge${have.includes(n) ? ' b' : ''}" data-act="chip" data-p="${path}" data-n="${esc(n)}" aria-pressed="${have.includes(n)}"${kind ? ruleTip(kind, n) : ''}>${esc(n)}${presets.includes(n) ? '' : ' <span aria-hidden="true">&times;</span>'}</button>`).join('')}</div>
            <div class="hb-addtag"><input class="field hb-tagin" data-p="${path}" aria-label="Add your own" placeholder="${esc(ph)}"${list ? ` list="${list}"` : ''} autocomplete="off"><button type="button" class="btn small" data-act="tagadd">Add</button></div>`;
    }
    const dmgEdit = (rp) => `<div class="hb-dmgs">${get(rp + '.dmg').map((d, j) => `<div class="hb-dmgrow">${f(`${rp}.dmg.${j}.dice`, 'Damage dice', { cls: 'hb-formula', ph: '1d8 + STR' })}${f(`${rp}.dmg.${j}.type`, 'Damage type', { list: 'hb-dl-dmg', ph: 'Slashing' })}${del(rp + '.dmg', j, 'damage')}</div>`).join('')}</div>
        <div class="actions">${add(rp + '.dmg', 'dmg', 'Add damage')}</div>`;
    // effect rows: damage, healing and temp HP take dice, the rest a line of text
    const fxEdit = (rp, r, kinds, t) => `<div class="hb-dmgs">${r.fx.map((e, j) => { const ep = `${rp}.fx.${j}`; return `<div class="hb-fxrow">${sel(ep + '.k', 'Kind of effect', kinds)}${
            e.k === 'dmg' ? f(ep + '.dice', 'Damage dice', { cls: 'hb-formula', ph: '2d6 + STR' }) + f(ep + '.type', 'Damage type', { list: 'hb-dl-dmg', ph: 'Slashing' })
            : e.k === 'heal' || e.k === 'temp' ? f(ep + '.dice', e.k === 'heal' ? 'Healing dice' : 'Temp HP dice', { cls: 'hb-formula hb-fxwide', ph: '1d8 + WIS' })
            : f(ep + '.text', 'What it does', { cls: 'hb-fxwide', ph: FX_PH[e.k] || FX_PH.buff })}${del(rp + '.fx', j, 'effect')}</div>`; }).join('')}</div>
        <div class="actions">${add(rp + '.fx', t, 'Add effect')}</div>`;
    function datalists() {
        const dl = (id, items) => `<datalist id="${id}">${items.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
        return dl('hb-dl-time', L('time')) + dl('hb-dl-dmg', L('dmg')) + dl('hb-dl-props', L('props')) + dl('hb-dl-speeds', L('speeds')) + dl('hb-dl-tools', TOOLS)
            + dl('hb-dl-race', RACES) + dl('hb-dl-align', ALIGNMENTS) + dl('hb-dl-class', CLASSES) + dl('hb-dl-school', SCHOOLS) + dl('hb-dl-dur', DURATIONS)
            + dl('hb-dl-weapon', WEAPONS.map((w) => w[0])) + dl('hb-dl-attack', [UNARMED.name, ...WEAPONS.map((w) => w[0])]) + dl('hb-dl-gear', gearNames()) + dl('hb-dl-meta', METAMAGIC.map((m) => m[0]))
            + dl('hb-dl-feat', FEATURES) + dl('hb-dl-src', [...RACES, ...CLASSES, 'Feat', 'Background', 'Item']) + dl('hb-dl-rsrc', RESOURCES)
            + dl('hb-dl-armour', ARMOUR.map((a) => a[0])) + dl('hb-dl-langs', LANGS)
            + dl('hb-dl-attr', uniq([...ITEM_ATTRS, ...itemRows().flatMap((r) => r.props)]))
            + dl('hb-dl-hbtime', HB_TIMES.map(([t]) => t)) + dl('hb-dl-cost', uniq([...C.panels.filter((p) => p.type === 'trackers').flatMap((p) => p.rows.filter((r) => r.kind !== 'levels').map((r) => r.name)).filter(Boolean), 'Spell slot', 'Hit points', 'gp', 'Hit dice']))
            + ['res', 'imm', 'vul'].map((k) => `<datalist id="hb-dl-${k}"></datalist>`).join('');
    }

    // ---- the always-visible top ----
    function topParts() {
        const DICE = [4, 6, 8, 10, 12, 20].map((n) => [n, 'd' + n]);
        // name, creature type, CR, alignment and age are in the bar (conditions, speed and defences sit here)
        const id = '';
        const art =`<button type="button" class="hb-art" data-act="art" aria-label="${C.art ? 'Change' : 'Add'} monster art">${C.art ? `<img src="${esc(C.art)}" alt="" referrerpolicy="no-referrer" width="300" height="300">` : '<span>Add art</span>'}</button>`;
        const abils = Phone.on() ? phAbils() : `<div class="hb-abils">${C.abilities.map((a, i) => `<div class="hb-abil">
            <span class="hb-lbl" title="${esc(a.name)}">${esc(a.key)}</span>
            ${rollv('mod:' + i, a.name + ' check', ' hb-big')}
            ${f(`abilities.${i}.score`, a.name + ' score', { num: true, cls: 'hb-score' })}
        </div>`).join('')}</div>`;
        const combat = `<div class="hb-combat">
            <div class="hb-box hb-hp">
                <div class="hb-hp-head"><span class="hb-lbl">Hit points</span><button type="button" class="hb-x" data-act="hpedit" aria-expanded="${!!open.hp}" aria-label="Edit base and temporary hit points" title="Edit base and temp HP">${PENCIL}</button></div>
                <div class="hb-hpv">${f('hp.cur', 'Current hit points', { num: true })}<span>/</span><b data-c="hpmax"></b><span class="hb-temp" data-c="hptemp"></span></div>
                <div class="hb-hpbar" aria-hidden="true"><i id="hb-hpbar"></i><i id="hb-tempbar"></i></div>
                ${open.hp ? `<div class="hb-hpf">
                    <label>Base ${f('hp.base', 'Base hit points, before level × CON modifier', { num: true })}</label>
                    <label>Max change ${f('hp.mod', 'Temporary change to maximum hit points', { num: true })}</label>
                    <label>Temp ${f('hp.temp', 'Temporary hit points', { num: true })}</label>
                </div>` : ''}
                ${C.view.hpScroll
                    // the scroll style: one amount (scroll over it), one button that heals above 0 and damages otherwise
                    ? '<form class="hb-dmg" data-act="hp"><input class="field" id="hb-amt" inputmode="decimal" value="0" aria-label="Amount: above 0 heals, below 0 damages" title="Scroll to change"><button class="btn small hb-hpgo" value="auto"><span>Damage</span><span>Heal</span></button><button class="btn small" value="temp">Set temp</button></form>'
                    : '<form class="hb-dmg" data-act="hp"><input class="field" id="hb-amt" inputmode="decimal" aria-label="Amount" placeholder="5"><button class="btn small" value="dmg">Damage</button><button class="btn small" value="heal">Heal</button><button class="btn small" value="temp">Set temp</button></form>'}
            </div>
            <div class="hb-box hb-stats">
                <div><span class="hb-lbl">AC</span>${fx('ac', 'Armour class', false, ' hb-big')}</div>
                <div><span class="hb-lbl">Initiative</span>${C.view.noRoll ? fx('init', 'Initiative', true, ' hb-big')
                    // rolls 1d20 + initiative; its formula is still in Customise
                    : '<button type="button" class="hb-roll hb-big" data-act="roll" data-k="fs:init" data-t="Initiative" data-c="fs:init" title="Roll initiative" aria-label="Roll initiative"></button>'}</div>
                <div><span class="hb-lbl">Prof.</span>${fx('prof', 'Proficiency bonus', true, ' hb-big')}</div>
                <label class="hb-insp"><span class="hb-lbl">Inspiration</span>${f('insp', 'Heroic inspiration', { check: true })}</label>
            </div>
        </div>`;
        const conds = C.condList.split('\n').map((s) => s.trim()).filter(Boolean);
        const moreBody = `<h3>Conditions</h3>
            <div class="badges" aria-label="Conditions">${conds.map((n) => `<button type="button" class="badge${C.conditions.includes(n) ? ' r' : ''}" data-act="cond" data-n="${esc(n)}" aria-pressed="${C.conditions.includes(n)}"${ruleTip('cond', n)}>${esc(n)}</button>`).join('')}</div>
            <label class="hb-exh">Exhaustion ${f('exhaustion', 'Exhaustion level', { num: true })}</label>
            ${rulesBlock('cond', conds.filter((n) => C.conditions.includes(n)))}${nm(C.exhaustion) > 0 ? `<div class="hb-rules"><div class="hb-rule"><b>Exhaustion level ${Math.min(6, nm(C.exhaustion))}</b>${rulePs((rule('cond', 'exhaustion') || []).filter((x) => /^\d - /.test(x) && +x[0] <= nm(C.exhaustion)).map((x) => '- ' + x.slice(4)))}</div></div>` : ''}
            <h3>Speed</h3>
            <div class="hb-speeds">${C.speeds.map((s, i) => `<div class="hb-speed">${f(`speeds.${i}.type`, 'Speed type', { list: 'hb-dl-speeds' })}${f(`speeds.${i}.ft`, 'Feet', { num: true, cls: 'hb-n' })}<span class="muted">ft</span><label class="check">${f(`speeds.${i}.hover`, 'Hover', { check: true })} Hover</label>${del('speeds', i, s.type + ' speed')}</div>`).join('')}</div>
            <div class="actions">${add('speeds', 'speed', 'Add speed')}</div>
            <h3>Defences</h3>
            <div class="hb-grid">
                <label>Resistances ${f('res', 'Resistances', { list: 'hb-dl-res', multi: true, ph: 'fire, cold' })}</label>
                <label>Immunities ${f('imm', 'Immunities', { list: 'hb-dl-imm', multi: true })}</label>
                <label>Vulnerabilities ${f('vul', 'Vulnerabilities', { list: 'hb-dl-vul', multi: true })}</label>
            </div>`;
        const more = `<div class="hb-more">
            <button type="button" class="btn small" data-act="more" aria-expanded="${!!open.more}" aria-controls="hb-more">Conditions, speed and defences</button>
            <span data-c="speed"></span><span class="hb-condsum" data-c="cond"></span><span class="muted" data-c="def"></span>
        </div>
        <div class="card hb-more-body" id="hb-more"${open.more ? '' : ' hidden'}>${moreBody}</div>`;
        const saves = `<section class="card hb-saves"><h2>Saving throws</h2><div class="hb-savegrid">${C.abilities.map((a, i) => `<div class="hb-save">
            <label class="hb-dot">${f(`abilities.${i}.save`, 'Proficient in ' + a.name + ' saves', { check: true })}</label>
            <span>${esc(a.key)}</span>${rollv('save:' + i, a.name + ' save')}
        </div>`).join('')}</div></section>`;
        const senses = `<section class="card hb-senses"><h2>Senses</h2>
            <div class="rows">${C.passives.map((p, i) => `<div class="rowi"><button type="button" class="hb-link grow" data-act="sense" data-i="${i}">${esc(p.name)}</button>${fx(`passives.${i}.f`, p.name, false)}${p.unit ? `<small class="muted">${esc(p.unit)}</small>` : ''}</div>`).join('')}</div>
            <label class="hb-lbl hb-other">Other senses ${f('senses', 'Other senses', { area: true, ph: '120 ft magical darkvision' })}</label>
        </section>`;
        return { id, art, abils, combat, more, moreBody, saves, senses, pins: pinned() };
    }
    function top() {
        const { id, art, abils, combat, more, saves, senses } = topParts();
        return `<div class="hb-top-id"><div class="hb-id">${id}${more}</div></div><div class="hb-top-abil">${abils}</div><div class="hb-top-combat">${combat}${pinned()}</div>
            <div class="hb-side"><div class="hb-top-art">${art}</div><div class="hb-top-saves">${saves}</div><div class="hb-top-senses">${senses}</div></div>`;
    }

    // notes pinned to the sheet: always on screen, editable in place
    function pinned() {
        const pins = C.panels.flatMap((p, pi) => (p.type === 'notes' && p.on ? p.notes.map((n, i) => [n, `panels.${pi}.notes.${i}`, pi]).filter(([n]) => n.pinned && !n.archived) : []));
        return pins.length ? `<div class="hb-pins">${pins.map(([n, np, pi]) => `<div class="hb-pin">
            <div class="hb-pin-h"><button type="button" class="hb-link" data-act="ngo" data-i="${pi}" data-id="${esc(n.id)}" data-c="ntitle:${np}" title="Open in notes"></button>
                <button type="button" class="hb-x" data-act="npin" data-p="${np}" aria-label="Unpin ${esc(n.title || 'note')}" title="Unpin">&times;</button></div>
            ${f(np + '.body', n.title || 'Pinned note', { area: true, cls: 'hb-pin-body' })}
        </div>`).join('')}</div>` : '';
    }

    // ---- configurable panels ----
    // one action or spell: a summary line you can open to edit
    // end: buttons after the pencil (the inventory's remove ×)
    function entry(rp, r, summaryKey, editor, lead = '', tail = '', end = '') {
        const isOpen = openRows.has(r.id);
        // a phone: one line that opens on tap, with its rolls still on the line (ROADMAP 2.1)
        if (Phone.on()) {
            const on = phRows.has(r.id) || isOpen;
            return `<div class="hb-entry">
                <div class="hb-entry-h">${lead}<button type="button" class="hb-link ph-rowname" data-act="phrow" data-id="${esc(r.id)}" aria-expanded="${on}">${esc(r.name || 'Unnamed')}</button>${hbBadge(r)}<span class="ph-rowq" data-c="rowq:${rp}"></span></div>
                ${tail}${on ? `<div class="ph-rowopen"><span class="hb-sum" data-c="${summaryKey}:${rp}"></span><div class="ph-rowbtns"><button type="button" class="btn small" data-act="info" data-p="${rp}">Details</button>
                    <button type="button" class="hb-x hb-toggle" data-act="toggle" data-id="${esc(r.id)}" aria-expanded="${isOpen}" aria-label="Edit ${esc(r.name || 'entry')}" title="Edit">${PENCIL}</button>${end}</div></div>` : ''}
                ${isOpen ? `<div class="hb-editor">${editor()}</div>` : ''}
            </div>`;
        }
        return `<div class="hb-entry">
            <div class="hb-entry-h">${lead}<button type="button" class="hb-link" data-act="info" data-p="${rp}">${esc(r.name || 'Unnamed')}</button>${hbBadge(r)}
                <span class="hb-sum" data-c="${summaryKey}:${rp}"></span>
                <button type="button" class="hb-x hb-toggle" data-act="toggle" data-id="${esc(r.id)}" aria-expanded="${isOpen}" aria-label="Edit ${esc(r.name || 'entry')}" title="Edit">${PENCIL}</button>${end}</div>
            ${tail}${isOpen ? `<div class="hb-editor">${editor()}</div>` : ''}
        </div>`;
    }

    function actionEditor(rp, r) {
        return `<div class="hb-grid">
            <label>Name ${f(rp + '.name', 'Name', { list: 'hb-dl-attack', ph: 'Longsword' })}</label>
            <label>Timing ${f(rp + '.time', 'Timing', { list: 'hb-dl-time' })}</label>
            <label>Range or reach ${f(rp + '.range', 'Range or reach', { ph: '5 ft or 80/320 ft' })}</label>
            <label>Resolves with ${sel(rp + '.mode', 'Resolves with', [['hit', 'Attack roll'], ['save', 'Saving throw'], ['none', 'Nothing']])}</label>
            ${r.mode === 'hit' ? `<div class="hb-fxbox"><span>To hit</span>${fx(rp + '.hit', 'To hit', true)}</div>` : ''}
            ${r.mode === 'save' ? `<label>Save ${abSel(rp + '.save', 'Save ability')}</label><div class="hb-fxbox"><span>Save DC</span>${fx(rp + '.dc', 'Save DC', false)}</div>` : ''}
        </div>
        <h4>Effects</h4>${dmgEdit(rp)}${fxEdit(rp, r, SPELL_FX, 'sfx')}
        <h4>Properties</h4>${tags(rp + '.props', [], 'Finesse', 'hb-dl-props', 'prop')}
        <label class="hb-wide">Description ${f(rp + '.desc', 'Description', { area: true })}</label>
        <div class="actions">${del(panelPath(rp) + '.rows', rp.split('.').pop(), r.name || 'action', 'Remove action')}</div>`;
    }

    function hbEditor(rp, r) {
        const P = panelOf(rp), tabs = uniq([...P.tabs, ...P.rows.map((x) => x.group).filter(Boolean)]);
        return `<div class="hb-grid">
            <label>Name ${f(rp + '.name', 'Name', { ph: 'Shadow Strike' })}</label>
            ${tabs.length ? `<label>Tab ${sel(rp + '.group', 'Tab', [['', 'No tab'], ...tabs.map((t) => [t, t])])}</label>` : ''}
            <label>Timing ${f(rp + '.time', 'Timing', { list: 'hb-dl-hbtime' })}</label>
            <label>Range ${f(rp + '.range', 'Range', { ph: '30 ft' })}</label>
            <label>Resolves with ${sel(rp + '.mode', 'Resolves with', [['none', 'Nothing'], ['hit', 'Attack roll'], ['save', 'Saving throw']])}</label>
            ${r.mode === 'hit' ? `<div class="hb-fxbox"><span>To hit</span>${fx(rp + '.hit', 'To hit', true)}</div>` : ''}
            ${r.mode === 'save' ? `<label>Save ${abSel(rp + '.save', 'Save ability')}</label><div class="hb-fxbox"><span>Save DC</span>${fx(rp + '.dc', 'Save DC', false)}</div>` : ''}
        </div>
        <h4>Effects</h4>${fxEdit(rp, r, FX_KINDS, 'fx')}
        <h4>Cost</h4><div class="hb-costrow">${f(rp + '.cost.amt', 'Cost amount', { cls: 'hb-n hb-formula', ph: '1' })}${f(rp + '.cost.what', 'What it costs', { list: 'hb-dl-cost', ph: 'Ki points, a spell slot, 50 gp...' })}</div>
        <p class="muted hb-hint">Name one of your resources (a counter or boxes) to get a Use button that spends it.</p>
        <label class="hb-wide">Notes ${f(rp + '.desc', 'Notes', { area: true })}</label>
        <div class="actions">${del(panelPath(rp) + '.rows', rp.split('.').pop(), r.name || 'ability', 'Remove')}</div>`;
    }

    function spellEditor(rp, r) {
        return `<div class="hb-grid">
            <label>Name ${f(rp + '.name', 'Spell name', { list: 'hb-dl-srd', ph: 'Fireball' })}</label>
            <label>Level ${f(rp + '.lvl', 'Level, 0 for a cantrip', { num: true })}</label>
            <label>School ${f(rp + '.school', 'School', { list: 'hb-dl-school', ph: 'Evocation' })}</label>
            <label>Casting time ${f(rp + '.time', 'Casting time', { list: 'hb-dl-time' })}</label>
            ${/reaction/i.test(r.time) || r.trig ? `<label>Reaction trigger ${f(rp + '.trig', 'When you can take the reaction', { ph: 'which you take when you are hit by an attack' })}</label>` : ''}
            <label>Range ${f(rp + '.range', 'Range', { ph: '150 feet' })}</label>
            <label>Components ${f(rp + '.comp', 'Components', { ph: 'V, S, M (bat guano)' })}</label>
            <label>Duration ${f(rp + '.dur', 'Duration', { list: 'hb-dl-dur', ph: 'Instantaneous' })}</label>
            <div class="hb-checks"><label class="check">${f(rp + '.conc', 'Concentration', { check: true })} Concentration</label><label class="check">${f(rp + '.ritual', 'Ritual', { check: true })} Ritual</label></div>
            <label>Resolves with ${sel(rp + '.mode', 'Resolves with', [['none', 'Nothing'], ['atk', 'Spell attack'], ['save', 'Saving throw']])}</label>
            ${r.mode === 'save' ? `<label>Save ${abSel(rp + '.save', 'Save ability')}</label><label>DC override (optional) ${f(rp + '.dc', 'DC override formula', { cls: 'hb-formula', ph: 'Uses your spell save DC' })}</label>` : ''}
        </div>
        <p class="muted hb-hint">Pick a name from the list to fill in an SRD spell.</p>
        <h4>Effects</h4>${dmgEdit(rp)}${fxEdit(rp, r, SPELL_FX, 'sfx')}
        <label class="hb-wide">Description ${f(rp + '.desc', 'Description', { area: true })}</label>
        <label class="hb-wide">At higher levels ${f(rp + '.higher', 'At higher levels', { area: true })}</label>
        <div class="actions">${del(panelPath(rp) + '.rows', rp.split('.').pop(), r.name || 'spell', 'Remove spell')}</div>`;
    }
    const panelPath = (rp) => rp.split('.').slice(0, 2).join('.');

    const R = {
        profs: (p, path) => {
            const opts = [['skills', 'Skills'], ['armour', 'Armour'], ['weapons', 'Weapons'], ['tools', 'Tools'], ['langs', 'Languages']];
            if (C.profs.notes) opts.push(['notes', 'Notes']);
            const cur = pickSub(p, opts);
            let body;
            if (cur === 'skills') body = `<div class="rows hb-two">${C.skills.map((s, i) => `<div class="rowi">${dot('prof', i, s, s.name)}<button type="button" class="hb-link grow" data-act="skill" data-i="${i}">${esc(s.name)}</button><small>${esc(s.ab)}</small>${rollv('skill:' + i, s.name + ' check')}</div>`).join('')}</div>
                <p class="muted hb-hint">Click a dot to change proficiency. Add or rename skills in Customise.</p>`;
            else if (cur === 'tools') body = `<div class="rows">${C.profs.tools.map((t, i) => `<div class="rowi hb-tool">${dot('tprof', i, t, t.name || 'tool')}${f(`profs.tools.${i}.name`, 'Tool', { cls: 'grow', list: 'hb-dl-tools', ph: "Thieves' tools" })}${abSel(`profs.tools.${i}.ab`, 'Ability', true)}${rollv('tool:' + i, (t.name || 'Tool') + ' check')}${del('profs.tools', i, t.name || 'tool')}</div>`).join('')}</div>
                <div class="actions">${add('profs.tools', 'tool', 'Add tool')}</div>`;
            else if (cur === 'notes') body = f('profs.notes', 'Notes', { area: true, cls: 'hb-text' });
            else body = tags('profs.' + cur, PRESET[cur], { armour: 'Mithral armour', weapons: 'Longsword', langs: 'Thieves’ Cant' }[cur], { armour: 'hb-dl-armour', weapons: 'hb-dl-weapon', langs: 'hb-dl-langs' }[cur], { armour: 'armour', weapons: 'weapons', langs: 'lang' }[cur])
                + rulesBlock({ armour: 'armour', weapons: 'weapons', langs: 'lang' }[cur], C.profs[cur]);
            return subtabs(path + '.sub', opts, cur) + body;
        },

        attacks: (p, path, pi) => {
            // the four combat timings always get a tab; any other timing only once something uses it
            const always = ['Action', 'Bonus action', 'Reaction', 'Free'];
            const times = uniq([...always, ...L('time'), ...p.rows.map((r) => r.time)]).filter((t) => always.includes(t) || p.rows.some((r) => r.time === t));
            const opts = [['all', 'All', p.rows.length], ...times.map((t) => [t, t, p.rows.filter((r) => r.time === t).length])];
            const cur = pickSub(p, opts);
            const list = p.rows.map((r, i) => [r, `${path}.rows.${i}`]).filter(([r]) => cur === 'all' || r.time === cur)
                .map(([r, rp]) => entry(rp, r, 'asum', () => actionEditor(rp, r))).join('');
            // what every character can do, per timing tab; each name opens its rule (rules.js)
            const basics = COMBAT.filter(([t]) => cur === 'all' || cur === t).map(([t, names]) => `<p><span class="muted">${t}</span> ${names.split('|')
                .map((n) => ruleLink('act', n.toLowerCase(), n, n, t + (n === 'Grapple' || n === 'Shove' ? ', part of an Unarmed Strike' : ''))).join(', ')}</p>`).join('');
            return (p.rows.length ? subtabs(path + '.sub', opts, cur) : '') + `<div class="hb-list">${list}</div>
                <div class="actions">${add(path + '.rows', 'attack', 'Add action', cur !== 'all' ? ` data-time="${esc(cur)}"` : '')}</div>
                ${basics ? `<div class="hb-basics"><h4>Actions in combat</h4>${basics}</div>` : ''}`;
        },

        spells: (p, path, pi) => {
            const lv = uniq(p.rows.map((r) => nm(r.lvl))).sort((a, b) => a - b);
            const prep = C.view.prep || C.classes.some((c) => PREP_CLASSES.includes(kk(c.name)));
            const opts = [['all', 'All', p.rows.length], ...lv.map((l) => [String(l), l ? ordinal(l) : 'Cantrips', p.rows.filter((r) => nm(r.lvl) === l).length]),
                ...(prep ? [['prep', 'Prepared', p.rows.filter((r) => r.prep).length]] : []), ['meta', 'Metamagic']];
            const cur = pickSub(p, opts);
            // a "Sorcery points" counter in Resources is the one source; otherwise the tab keeps its own
            const sp = resPath('Sorcery points'), spP = sp || path + '.sp';
            if (cur === 'meta') return subtabs(path + '.sub', opts, cur) + `
                <div class="rowi hb-track"><span class="grow">Sorcery points${sp ? ' <small class="muted">(synced with Resources)</small>' : ''}</span>
                    ${box(spP)}${sp ? `<small class="muted">${Math.max(0, maxOf(get(spP).max) + nm(get(spP).extra) - nm(get(spP).used))} / ${maxOf(get(spP).max)} left</small>`
                        : `<label class="hb-maxl">Max ${f(spP + '.max', 'Sorcery points maximum (number or formula)', { cls: 'hb-n hb-formula' })}</label><small class="muted" data-c="tmax:${spP}.max"></small>`}</div>
                ${C.classes.some((c) => /sorcer/i.test(c.name)) || sp ? flexBox(p, path, spP) : ''}
                <div class="hb-list">${p.meta.map((m, i) => { const mp = `${path}.meta.${i}`; return entry(mp, m, 'msum', () => `<div class="hb-entry-h">${f(mp + '.name', 'Name', { cls: 'hb-strong', list: 'hb-dl-meta', ph: 'Quickened Spell' })}<label class="hb-cost">Cost ${f(mp + '.cost', 'Cost in sorcery points', { cls: 'hb-n' })}</label></div>
                    <label class="hb-wide">Description ${f(mp + '.desc', 'Description', { area: true })}</label>
                    <div class="actions">${del(path + '.meta', i, m.name || 'metamagic', 'Remove metamagic')}</div>`); }).join('')}</div>
                <div class="actions"><select class="field hb-auto" id="hb-meta-pick" aria-label="Metamagic option"><option value="">Your own</option>${METAMAGIC.map(([n]) => `<option>${esc(n)}</option>`).join('')}</select><button type="button" class="btn small" data-act="addmeta" data-p="${path}.meta">Add metamagic</button></div>`;
            const sb = slotBases(path), linked = !!slotTracker();
            const slots = sb.map((b, l) => (maxOf(get(b).max) + nm(get(b).extra) > 0 ? `<span class="hb-slot"><small>${ordinal(l + 1)}</small>${box(b)}</span>` : '')).join('');
            // effect filter: only kinds some spell has
            const kinds = [['dmg', 'Damage'], ...SPELL_FX].filter(([k]) => p.rows.some((r) => hasFx(r, k))), fxf = kinds.some(([k]) => k === p.fxf) ? p.fxf : '';
            const filter = kinds.length ? `<label class="hb-fxf">Effect ${sel(path + '.fxf', 'Show spells with this effect', [['', 'Any'], ...kinds.map(([k, t]) => [k, `${t} (${p.rows.filter((r) => hasFx(r, k)).length})`])])}</label>` : '';
            const list = p.rows.map((r, i) => [r, `${path}.rows.${i}`]).sort((a, b) => (nm(a[0].lvl) || 0) - (nm(b[0].lvl) || 0))
                .filter(([r]) => (cur === 'all' || (cur === 'prep' ? r.prep : String(nm(r.lvl)) === cur)) && (!fxf || hasFx(r, fxf)))
                .map(([r, rp]) => entry(rp, r, 'ssum', () => spellEditor(rp, r), prep ? `<label class="hb-prep" title="Prepared">${f(rp + '.prep', 'Prepared', { check: true })}</label>` : '')).join('');
            return `<div class="hb-grid">
                    <div class="hb-box"><span class="hb-lbl">Save DC</span>${fx(path + '.dc', 'Spell save DC', false, ' hb-big')}</div>
                    <div class="hb-box"><span class="hb-lbl">Spell attack</span>${fx(path + '.atk', 'Spell attack', true, ' hb-big')}</div>
                </div>
                ${slots ? `<div class="hb-slots">${slots}</div>` : ''}
                <details class="hb-details"><summary>Spell slots per level${linked ? ' (synced with Resources)' : ''}</summary><div class="hb-slotmax">${sb.map((b, l) => `<label>${ordinal(l + 1)} ${f(b + '.max', ordinal(l + 1) + ' level slots (number or formula)', { cls: 'hb-formula' })}</label>`).join('')}</div></details>
                <div class="hb-subrow">${subtabs(path + '.sub', opts, cur)}${filter}</div><div class="hb-list">${list || (fxf ? '<p class="muted">No spells here with that effect.</p>' : '')}</div>
                <div class="actions">${add(path + '.rows', 'spell', 'Add spell', /^\d$/.test(cur) ? ` data-lvl="${cur}"` : cur === 'prep' ? ' data-prep="1"' : '')}</div>
                ${p.rows.some((r) => r.srd && !wdUrl(r)) ? `<p class="muted hb-hint">SRD spell text: ${SRD_CREDIT}</p>` : ''}`;
        },

        items: (p, path, pi) => {
            const cats = uniq([...L('cats'), ...p.rows.map((r) => r.cat).filter(Boolean)]);
            const opts = [['all', 'All', p.rows.length], ...cats.map((c) => [c, c, p.rows.filter((r) => r.cat === c).length])];
            const cur = pickSub(p, opts);
            // like spells: equipped box, name (opens the details), a summary that wraps, and the fields behind the pencil
            const list = p.rows.map((r, i) => [r, i]).filter(([r]) => cur === 'all' || r.cat === cur).map(([r, i]) => { const rp = `${path}.rows.${i}`; return entry(rp, r, 'isum', () => `<div class="hb-grid">
                    <label>Name ${f(rp + '.name', 'Item', { list: 'hb-dl-gear', ph: 'Rope, 50 ft' })}</label>
                    <label>Category ${sel(rp + '.cat', 'Category', cats.map((c) => [c, c]))}</label>
                    <label>Quantity ${f(rp + '.qty', 'Quantity', { num: true })}</label>
                    <label>Weight each (lb) ${f(rp + '.wt', 'Weight each in pounds', { num: true })}</label>
                    <label>Cost each (gp) ${f(rp + '.gp', 'Cost each in gold', { num: true, ph: '0' })}</label>
                    <label>Attunement ${sel(rp + '.att', 'Attunement', ITEM_ATT)}</label>
                </div>
                <div class="hb-wide"><span class="muted">Attributes</span><div class="hb-attrs">${r.props.map((n) => `<span class="hb-attr"><button type="button" class="hb-prop" data-act="attr" data-n="${esc(n)}">${esc(n)}</button><button type="button" class="hb-x" data-act="chip" data-p="${rp}.props" data-n="${esc(n)}" aria-label="Remove ${esc(n)}" title="Remove">&times;</button></span>`).join('')}
                    <input class="field hb-tagin hb-attrin" data-p="${rp}.props" list="hb-dl-attr" placeholder="Add" aria-label="Add an attribute to ${esc(r.name || 'this item')}" autocomplete="off"></div></div>
                <label class="hb-wide">Notes ${f(rp + '.notes', 'Notes', { area: true })}</label>`,
                `<label class="hb-prep" title="Equipped">${f(rp + '.eq', 'Equipped', { check: true })}</label>`, '', del(path + '.rows', i, r.name || 'item')); }).join('');
            // coins are shown, and changed by typing an amount (formula.js hbCoins breaks coins for change)
            const worth = ['pp', 'gp', 'ep', 'sp', 'cp'].reduce((t, c) => t + nm(p.coins[c]) * { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }[c], 0) / 100;
            return `<div class="hb-purse">${['pp', 'gp', 'ep', 'sp', 'cp'].map((c) => `<span class="hb-coin"><b>${nm(p.coins[c]).toLocaleString()}</b> ${c}</span>`).join('')}
                    <small class="muted">${worth.toLocaleString()} gp in all</small>
                    <span class="hb-coinbox"><input class="field hb-coinin" data-p="${path}.coins" placeholder="5g5s" aria-label="Coins to spend or add, like 5g5s" autocomplete="off">
                    <button type="button" class="btn small" data-act="coins" data-sign="-" aria-label="Spend these coins" title="Spend">&minus;</button><button type="button" class="btn small" data-act="coins" data-sign="+" aria-label="Add these coins" title="Add">+</button></span></div>
                <div class="hb-attune"><span>Attuned <b data-c="att:${pi}"></b></span><label>Attunement slots ${f(path + '.attMax', 'Attunement slots', { num: true, cls: 'hb-n' })}</label></div>
                ${subtabs(path + '.sub', opts, cur)}
                <div class="hb-list">${list}</div>
                ${p.rows.length ? `<p class="hb-wt">Total weight, all items <b data-c="wt:${pi}"></b></p>` : ''}
                <div class="actions">${add(path + '.rows', 'item', 'Add item', ` data-cat="${esc(cur === 'all' ? 'Gear' : cur)}"`)}</div>`;
        },

        // entries (passive abilities, features); each can have uses that come back on a rest
        list: (p, path) => {
            const V = vars();
            // a split list (Passive abilities) has a sub-tab per group, each with its own entries and Add button
            const opts = p.split ? LIST_GROUPS.map(([g, label]) => [g, label, p.rows.filter((r) => r.grp === g).length]) : null, cur = opts && pickSub(p, opts);
            // the name opens the description; uses stay out so they can be ticked off in play
            return (opts ? subtabs(path + '.sub', opts, cur) : '') + `<div class="hb-list">${p.rows.map((r, i) => [r, i]).filter(([r]) => !cur || r.grp === cur).map(([r, i]) => { const rp = `${path}.rows.${i}`; return entry(rp, r, 'lsum', () => `<div class="hb-entry-h">${f(rp + '.name', 'Name', { cls: 'hb-strong', list: 'hb-dl-feat', ph: 'Darkvision' })}${f(rp + '.src', 'Source (optional)', { cls: 'hb-src', list: 'hb-dl-src', ph: 'Elf' })}</div>
                <div class="hb-uses">
                    <label>Uses ${f(rp + '.uses', 'Uses (number or formula)', { cls: 'hb-n hb-formula', ph: 'none' })}</label><small class="muted" data-c="tmax:${rp}.uses"></small>
                    ${sel(rp + '.reset', 'Resets on', RESETS)}
                    ${cur ? `<label>Tab ${sel(rp + '.grp', 'Tab', LIST_GROUPS.map(([g, label]) => [g, label]))}</label>` : ''}
                </div>
                <label class="hb-wide">Description ${f(rp + '.text', 'Description', { area: true })}</label>
                <div class="actions">${del(path + '.rows', i, r.name || 'entry', 'Remove entry')}</div>`, '',
                String(r.uses).trim() ? `<div class="hb-uses">${pips(rp + '.used', maxOf(r.uses, V))}<small class="muted">${esc(r.reset ? RESETS.find(([k]) => k === r.reset)[1] : '')}</small></div>` : ''); }).join('') || (cur ? `<p class="muted">No ${LIST_GROUPS.find(([g]) => g === cur)[1].toLowerCase()} yet.</p>` : '')}</div><div class="actions">${add(path + '.rows', 'list', 'Add entry', cur ? ` data-grp="${cur}"` : '')}</div>`;
        },

        // resources in your own sub-tabs: counters, boxes, or slots by level
        trackers: (p, path, pi) => {
            const V = vars();
            const tabs = uniq([...p.tabs, ...p.rows.map((r) => r.group).filter(Boolean)]);
            const opts = [['all', 'All', p.rows.length], ...tabs.map((t) => ['t:' + t, t, p.rows.filter((r) => r.group === t).length])];
            const cur = pickSub(p, opts), tab = cur.startsWith('t:') ? cur.slice(2) : '';
            const row = (r, rp, i) => {
                const head = `${f(rp + '.name', 'Name', { cls: 'hb-strong', list: 'hb-dl-rsrc', ph: r.kind === 'levels' ? 'Spell slots' : 'Rage' })}`;
                const main = r.kind === 'count' ? `<span class="hb-count">
                        <button type="button" class="btn small" data-act="track" data-p="${rp}" data-d="-1" aria-label="Use one">−</button>
                        ${f(rp + '.cur', 'Left', { num: true, cls: 'hb-n' })}<span>/</span>${f(rp + '.max', 'Maximum (number or formula)', { cls: 'hb-n hb-formula' })}
                        <button type="button" class="btn small" data-act="track" data-p="${rp}" data-d="1" aria-label="Get one back">+</button><small class="muted" data-c="tmax:${rp}.max"></small></span>`
                    : r.kind === 'pips' ? `<span class="hb-count">${box(rp, V)}<label class="hb-maxl">Max ${f(rp + '.max', 'Maximum (number or formula)', { cls: 'hb-n hb-formula' })}</label><small class="muted" data-c="tmax:${rp}.max"></small></span>` : '';
                const levels = r.kind === 'levels' ? `<div class="hb-levels">${r.levels.map((l, j) => `<div class="hb-level">
                        ${f(`${rp}.levels.${j}.label`, 'Level name', { cls: 'hb-lvlname', ph: '1st' })}
                        <label class="hb-maxl">Max ${f(`${rp}.levels.${j}.max`, 'Maximum (number or formula)', { cls: 'hb-n hb-formula' })}</label>
                        ${box(`${rp}.levels.${j}`, V)}${del(rp + '.levels', j, (l.label || 'level') + ' level')}
                    </div>`).join('')}<div class="actions">${add(rp + '.levels', 'level', 'Add level')}</div></div>` : '';
                const edit = (on) => `<button type="button" class="hb-x hb-toggle" data-act="toggle" data-id="${esc(r.id)}" aria-expanded="${on}" aria-label="Edit ${esc(r.name || 'resource')}" title="${on ? 'Done' : 'Edit'}">${PENCIL}</button>`;
                // slots by level stay compact (Lv1 and its boxes, levels with at least one slot) until the pencil opens the full editor
                if (r.kind === 'levels' && !openRows.has(r.id)) {
                    const lv = r.levels.map((l, j) => [l, j]).filter(([l]) => maxOf(l.max, V) + nm(l.extra) > 0)
                        .map(([l, j]) => `<span class="hb-slot"><small>Lv${j + 1}</small>${box(`${rp}.levels.${j}`, V)}</span>`).join('');
                    return `<div class="hb-entry hb-res">
                        <div class="hb-entry-h"><b class="grow">${esc(r.name || 'Spell slots')}</b>${edit(false)}</div>
                        <div class="hb-levels">${lv || '<p class="muted">No slots yet. Press the pencil to set them.</p>'}</div>
                    </div>`;
                }
                // boxes (sorcery points and the like) compact the same way: name, how many are left, the boxes
                if (r.kind === 'pips' && !openRows.has(r.id)) {
                    const mx = maxOf(r.max, V), reset = r.reset ? ' · ' + RESETS.find(([k]) => k === r.reset)[1].toLowerCase() : '';
                    return `<div class="hb-entry hb-res">
                        <div class="hb-entry-h"><b class="grow">${esc(r.name || 'Resource')}</b><small class="muted">${Math.max(0, mx + nm(r.extra) - nm(r.used))} / ${mx} left${reset}</small>${edit(false)}</div>
                        <div class="hb-levels">${mx + nm(r.extra) ? box(rp, V) : '<p class="muted">No boxes yet. Press the pencil to set the maximum.</p>'}</div>
                    </div>`;
                }
                return `<div class="hb-entry hb-res">
                    <div class="hb-entry-h">${head}${main}${sel(rp + '.reset', 'Resets on', RESETS)}
                        ${tabs.length ? sel(rp + '.group', 'Tab', [['', 'No tab'], ...tabs.map((t) => [t, t])]) : ''}${r.kind === 'levels' || r.kind === 'pips' ? edit(true) : ''}${del(path + '.rows', i, r.name || 'resource')}</div>
                    ${levels}
                </div>`;
            };
            const list = p.rows.map((r, i) => [r, i]).filter(([r]) => cur === 'all' || r.group === tab).map(([r, i]) => row(r, `${path}.rows.${i}`, i)).join('');
            // one pencil edits every tab: rename, delete, add
            return `${tabBar(p, path, opts, cur, tabs)}
                <div class="hb-list">${list || '<p class="muted">No resources here yet.</p>'}</div>
                <div class="actions"><select class="field hb-auto" id="hb-tkind-${pi}" aria-label="Kind of resource">${TRACKER_KINDS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select><button type="button" class="btn small" data-act="tnew" data-p="${path}" data-i="${pi}">Add resource</button></div>`;
        },

        // homebrew abilities, each with effects and a cost that can spend one of your resources
        // tabs: the timings, then your own (pencil to add, rename, delete, like Resources), then notes; an ability in your tab still shows under its timing
        homebrew: (p, path) => {
            const main = HB_TIMES.slice(0, 3).map(([t]) => t);
            const inTab = (r, t) => (t.startsWith('t:') ? r.group === t.slice(2) : t === 'Other' ? !main.includes(r.time) : r.time === t);
            const tabs = uniq([...p.tabs, ...p.rows.map((r) => r.group).filter(Boolean)]);
            const opts = [...HB_TIMES.map(([t, label]) => [t, label, p.rows.filter((r) => inTab(r, t)).length]), ...tabs.map((g) => ['t:' + g, g, p.rows.filter((r) => r.group === g).length]), ['notes', 'Notes']];
            const cur = pickSub(p, opts), tab = cur.startsWith('t:') ? cur.slice(2) : '', bar = tabBar(p, path, opts, cur, tabs);
            if (cur === 'notes') return bar + f(path + '.text', p.title + ' notes', { area: true, cls: 'hb-text', ph: 'House rules, reminders, ideas' });
            const what = tab ? 'ability' : HB_TIMES.find(([t]) => t === cur)[2];
            const list = p.rows.map((r, i) => [r, `${path}.rows.${i}`]).filter(([r]) => inTab(r, cur)).map(([r, rp]) => {
                const res = resOf(r.cost.what);
                const use = res ? `<div class="hb-uses"><button type="button" class="btn small" data-act="hbuse" data-p="${rp}">Use</button><span>${esc(costAmt(r) + ' ' + res.name)}, ${resLeft(res)} left</span></div>` : '';
                return entry(rp, r, 'hsum', () => hbEditor(rp, r), '', use);
            }).join('');
            return bar + `<div class="hb-list">${list || `<p class="muted">No ${tab ? 'abilities in this tab' : what === 'ability' ? 'other abilities' : what + 's'} yet.</p>`}</div>
                <div class="actions">${add(path + '.rows', 'hb', 'Add ' + what, tab ? ` data-group="${esc(tab)}"` : ` data-time="${esc(cur)}"`)}</div>`;
        },

        text: (p, path) => f(path + '.text', p.title, { area: true, cls: 'hb-text' }),

        // notes: a list (search, groups as sub-tabs, sort) beside the open note
        notes: (p, path, pi) => {
            const g = (n) => String(n.group || '').trim();
            // archived notes (ROADMAP 0.5) are out of play: only search and the Archived list at the bottom show them
            const live = p.notes.filter((n) => !n.archived), arch = p.notes.map((n, i) => [n, i]).filter(([n]) => n.archived);
            const archGroups = uniq(arch.map(([n]) => g(n)).filter(Boolean)).map((x) => [x, arch.filter(([n]) => g(n) === x).length]).filter(([, c]) => c > 1);
            const count = (fn) => live.filter(fn).length;
            const groups = uniq(live.map(g).filter(Boolean)).sort((a, b) => a.localeCompare(b));
            const opts = [['all', 'All', live.length], ['pinned', 'Pinned', count((n) => n.pinned)], ...groups.map((x) => ['g:' + x, x, count((n) => g(n) === x)])];
            if (groups.length && count((n) => !g(n))) opts.push(['none', 'No group', count((n) => !g(n))]);
            const cur = pickSub(p, opts);
            const inSub = (n) => cur === 'all' || (cur === 'pinned' ? n.pinned : cur === 'none' ? !g(n) : g(n) === cur.slice(2));
            const by = { created: (a, b) => b.created - a.created, title: (a, b) => (a.title || '').localeCompare(b.title || '') }[p.sort] || ((a, b) => b.updated - a.updated);
            const shown = p.notes.map((n, i) => [n, i]).filter(([n]) => !n.archived && inSub(n)).sort(([a], [b]) => (b.pinned - a.pinned) || by(a, b));
            const list = shown.map(([n, i]) => {
                const rp = `${path}.notes.${i}`, s = `${n.title} ${n.group} ${n.body}`.toLowerCase();
                return `<button type="button" class="hb-nitem${n.id === p.open ? ' on' : ''}" data-act="nopen" data-p="${path}" data-id="${esc(n.id)}" data-s="${esc(s)}" aria-pressed="${n.id === p.open}"${noteQ && !s.includes(noteQ) ? ' hidden' : ''}>
                    <span class="hb-ntitle"><b data-c="ntitle:${rp}"></b>${n.pinned ? '<span class="badge">Pinned</span>' : ''}</span>
                    <span class="hb-nsnip" data-c="nsnip:${rp}"></span>
                    <small>${g(n) ? esc(g(n)) + ' · ' : ''}<span data-c="nago:${rp}"></span></small>
                </button>`;
            }).join('');
            const found = arch.map(([n, i]) => {
                const s = `${n.title} ${n.group} ${n.body}`.toLowerCase();
                return `<div class="hb-nitem hb-narc" data-s="${esc(s)}"${noteQ && s.includes(noteQ) ? '' : ' hidden'}>
                    <span class="hb-ntitle"><b>${esc(n.title || 'Untitled note')}</b><span class="badge">Archived</span></span>
                    <button type="button" class="btn small" data-act="nunarc" data-p="${path}" data-i="${i}">Restore</button></div>`;
            }).join('');
            const oi = p.notes.findIndex((n) => n.id === p.open && !n.archived), n = p.notes[oi], np = `${path}.notes.${oi}`;
            const editor = !n ? `<p class="muted hb-nempty">${live.length ? 'Pick a note, or make a new one.' : 'No notes yet. Make one with New note.'}</p>` : `<div class="hb-nedit">
                ${f(np + '.title', 'Note title', { cls: 'hb-ntitle-in', ph: 'Untitled note' })}
                <div class="hb-nbar">
                    <label class="hb-ngroup">Group ${f(np + '.group', 'Group', { list: 'hb-dl-ng-' + pi, ph: 'No group' })}</label>
                    <button type="button" class="btn small" data-act="npin" data-p="${np}" aria-pressed="${n.pinned}">${n.pinned ? 'Unpin from sheet' : 'Pin to sheet'}</button>
                    <button type="button" class="btn small" data-act="ndup" data-p="${path}" data-i="${oi}">Duplicate</button>
                    <button type="button" class="btn small" data-act="narc" data-p="${path}" data-i="${oi}">Archive</button>
                </div>
                ${f(np + '.body', 'Note', { area: true, cls: 'hb-nbody', ph: 'Write anything' })}
                <small class="muted"><span data-c="nago:${np}"></span> · created ${esc(dateText(n.created))}</small>
            </div>`;
            const rename = cur.startsWith('g:') ? `<label class="hb-grename">Rename this group <input class="field hb-gname" data-p="${path}" data-g="${esc(cur.slice(2))}" value="${esc(cur.slice(2))}" autocomplete="off"></label> <button type="button" class="btn small" data-act="ngarc" data-p="${path}" data-g="${esc(cur.slice(2))}">Archive group</button>` : '';
            return `<div class="hb-ntools">
                    <button type="button" class="btn small" data-act="nnew" data-p="${path}">New note</button>
                    <button type="button" class="btn small" data-act="nsession" data-p="${path}">New session note</button>
                    <input class="field hb-nq" type="search" value="${esc(noteQ)}" placeholder="Search notes" aria-label="Search notes" autocomplete="off">
                    ${sel(path + '.sort', 'Sort notes', [['edited', 'Recently edited'], ['created', 'Newest first'], ['title', 'Title A to Z']])}
                </div>
                ${subtabs(path + '.sub', opts, cur)}${rename}
                <div class="hb-notes"><div class="hb-nlist">${list || '<p class="muted">No notes here.</p>'}${found}</div>${editor}</div>
                ${arch.length ? `<details class="hb-narch"><summary>Archived (${arch.length})</summary><div class="rows">${archGroups.map(([x, c]) => `<div class="rowi"><span class="grow"><b>${esc(x)}</b> <small class="muted">${c} notes</small></span><button type="button" class="btn small" data-act="ngunarc" data-p="${path}" data-g="${esc(x)}">Restore group</button></div>`).join('')}${arch.map(([n, i]) => `<div class="rowi"><span class="grow">${esc(n.title || 'Untitled note')}${g(n) ? ` <small class="muted">${esc(g(n))}</small>` : ''}</span>
                    <button type="button" class="btn small" data-act="nunarc" data-p="${path}" data-i="${i}">Restore</button></div>`).join('')}</div></details>` : ''}
                <datalist id="hb-dl-ng-${pi}">${groups.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
        },

        combat: (p, path) => `<div class="kv"><span>Death save successes</span><span>${pips(path + '.ok', 3)}</span></div>
            <div class="kv"><span>Death save failures</span><span class="hb-bad-pips">${pips(path + '.bad', 3)}</span></div>
            ${rulesBlock('hp', ['Death saving throws', 'Falling unconscious', 'Stabilizing a creature', 'Instant death'], 'Death save rules')}
            <h3>Hit dice</h3>
            <div class="rows">${C.classes.map((c, i) => `<div class="rowi"><span class="grow hb-hdset"><label>Hit dice ${f(`classes.${i}.level`, 'Number of hit dice', { num: true, cls: 'hb-n' })}</label> ${sel(`classes.${i}.die`, 'Hit die', [4, 6, 8, 10, 12, 20].map((n) => [n, 'd' + n]))}</span><small data-c="hdl:${i}"></small>${pips(`classes.${i}.hdUsed`, c.level)}</div>`).join('')}</div>
            <p class="muted hb-hint">Filled boxes are spent. Spend any number in a short rest; a long rest gives half back, rounded up.</p>`,
    };

    const panelCard = ([p, i]) => `<section class="card hb-panel" id="hb-p-${esc(p.id)}"><h2>${esc(p.title)}</h2>${R[p.type](p, 'panels.' + i, i)}</section>`;
    function panels() {
        const vis = C.panels.map((p, i) => [p, i]).filter(([p]) => p.on);
        if (!vis.length) return '<p class="note">Every panel is hidden. Turn some back on in Customise.</p>';
        const card = panelCard;
        if (C.view.all) return `<div class="masonry">${vis.map(card).join('')}</div>`;
        const cur = vis.find(([p]) => p.id === C.view.tab) || vis[0];
        return `<div class="stabs hb-tabs">${vis.map(([p]) => `<button type="button" class="${p === cur[0] ? 'on' : ''}" data-act="tab" data-id="${esc(p.id)}" aria-pressed="${p === cur[0]}">${esc(p.title)}</button>`).join('')}</div>${card(cur)}`;
    }

    // ---- toolbar ----
    const clsText = (c) => (String(c.cr || '').trim() ? 'CR ' + c.cr : '');
    // the phone picker lists the shown encounter's monsters (and the open one, wherever it is)
    const pickOpts = () => Object.values(db.chars).filter((c) => c === C || !c.archived && bucket(c) === shownEnc).map((c) =>
        `<option value="${esc(c.id)}"${c.id === C.id ? ' selected' : ''}>${esc(c.name || 'Unnamed monster')}${clsText(c) ? ' — ' + esc(clsText(c)) : ''}</option>`).join('');
    const DIFFBAR = () => `<button type="button" class="mon-diffbar" data-act="diffopen" aria-label="Encounter difficulty">${diffLine()}</button>`;
    // the top line: which character, who they are, and (behind Edit) the buttons to make, import, export or delete one
    function bar() {
        // an archived monster: read-only until it's unarchived (ROADMAP 0.5)
        if (C.archived) return `${encPicker('mon-encbar')}${DIFFBAR()}<select class="field hb-pick" data-act="pick" aria-label="Monster">${pickOpts()}</select>
            <b class="hb-roname">${esc(C.name || 'Unnamed monster')}</b><span class="badge">Archived</span>
            <span class="hb-arcnote">This monster is archived.</span>
            <button type="button" class="btn small primary" data-act="unarchive">Unarchive</button>
            <button type="button" class="btn small" data-act="new">New</button>`;
        return `${encPicker('mon-encbar')}${DIFFBAR()}<select class="field hb-pick" data-act="pick" aria-label="Monster">${pickOpts()}</select>
            <button type="button" class="btn small" data-act="manage" aria-expanded="${!!open.manage}" aria-controls="hb-manage">${PENCIL} Edit</button>
            <button type="button" class="btn small" data-act="dup">Duplicate</button>
            ${hbMonNewer() ? '<button type="button" class="btn small" data-act="hbmon">Update available</button>' : ''}
            <span class="hb-manage" id="hb-manage"${open.manage || Phone.on() ? '' : ' hidden'}>
                <button type="button" class="btn small" data-act="new">New</button>
                <button type="button" class="btn small" data-act="find">Import monster</button>
                <button type="button" class="btn small" data-act="hbsave">Save as homebrew</button>
                <button type="button" class="btn small" data-act="import">Import file</button>
                <button type="button" class="btn small" data-act="export">Export</button>
                <button type="button" class="btn small" data-act="encto">Move to encounter</button>
                <button type="button" class="btn small" data-act="encto" data-copy>Copy to encounter</button>
                <button type="button" class="btn small" data-act="archive">Archive</button>
            </span>
            <label class="hb-name">Name ${f('name', 'Name')}</label>
            <label class="hb-race">Creature type ${f('race', 'Creature type', { list: 'hb-dl-race' })}</label>
            <label class="hb-age">CR ${f('cr', 'Challenge rating')}</label>
            <label class="hb-align">Alignment ${f('alignment', 'Alignment', { list: 'hb-dl-align' })}</label>
            <label class="hb-age">Age ${f('age', 'Age')}</label>
            <span class="hb-gap"></span>
            <button type="button" class="btn small" data-act="rest" data-r="short">Short rest</button>
            <button type="button" class="btn small" data-act="rest" data-r="long">Long rest</button>
            <button type="button" class="btn small primary" data-act="custom">Customise</button>`;
    }

    // ---- formula builder ----
    const KINDS = [['num', 'Number'], ['ab', 'Ability modifier'], ['prof', 'Proficiency bonus'], ['level', 'Level'], ['f', 'Other formula']];
    function parseParts(src) {
        const ab = (s) => C.abilities.find((a) => a.key.toLowerCase() === s.toLowerCase());
        return hbTerms(src).map((t) => {
            const s = t.src, base = { sign: t.sign, label: t.label, cap: '' };
            let m;
            if (/^\d+$/.test(s)) return { ...base, k: 'num', v: s };
            if (ab(s)) return { ...base, k: 'ab', v: ab(s).key };
            if ((m = /^min\(\s*([A-Za-z_]\w*)\s*,\s*(\d+)\s*\)$/i.exec(s)) && ab(m[1])) return { ...base, k: 'ab', v: ab(m[1]).key, cap: m[2] };
            if (/^prof$/i.test(s)) return { ...base, k: 'prof', v: '' };
            if (/^level$/i.test(s)) return { ...base, k: 'level', v: '' };
            return { ...base, k: 'f', v: s };
        });
    }
    function buildParts(parts) {
        return parts.map((p, n) => {
            const v = String(p.v || '').trim();
            const body = p.k === 'num' ? String(nm(v)) : p.k === 'ab' ? (String(p.cap).trim() !== '' ? `min(${v}, ${nm(p.cap)})` : v)
                : p.k === 'prof' ? 'PROF' : p.k === 'level' ? 'LEVEL' : /[+-]/.test(v) && !/^\(.*\)$/.test(v) ? `(${v})` : v || '0';
            const lab = String(p.label || '').replace(/[[\]]/g, '').trim();
            return (n ? ` ${p.sign} ` : p.sign === '-' ? '-' : '') + body + (lab ? ` [${lab}]` : '');
        }).join('');
    }
    function partsHTML(parts) {
        const keys = C.abilities.map((a) => [a.key, a.key]);
        const opt = (list, v) => list.map(([k, t]) => `<option value="${esc(k)}"${String(v) === String(k) ? ' selected' : ''}>${esc(t)}</option>`).join('');
        return parts.map((p, n) => `<div class="hb-part">
            <select class="field hb-sign" data-b="${n}.sign" aria-label="Add or subtract">${opt([['+', '+'], ['-', '−']], p.sign)}</select>
            <select class="field" data-b="${n}.k" aria-label="Kind of part">${opt(KINDS, p.k)}</select>
            ${p.k === 'num' ? `<input class="field hb-n" inputmode="decimal" data-b="${n}.v" value="${esc(p.v)}" aria-label="Number">` : ''}
            ${p.k === 'ab' ? `<select class="field" data-b="${n}.v" aria-label="Ability">${opt(keys, p.v)}</select><input class="field hb-n" inputmode="decimal" data-b="${n}.cap" value="${esc(p.cap)}" aria-label="Highest this can add (optional)" placeholder="no cap" title="Highest this can add, e.g. 2 for medium armour">` : ''}
            ${p.k === 'f' ? `<input class="field hb-formula" data-b="${n}.v" value="${esc(p.v)}" aria-label="Formula" placeholder="ceil(LEVEL / 2)">` : ''}
            <input class="field hb-plabel" data-b="${n}.label" value="${esc(p.label)}" aria-label="Label (optional)" placeholder="Label, e.g. Shield">
            <button type="button" class="hb-x" data-act="pdel" data-i="${n}" aria-label="Remove this part" title="Remove">&times;</button>
        </div>`).join('');
    }
    function formulaDlg(m) {
        const key = (m.s ? 'fs:' : 'fx:') + m.p;
        return `<h2>${esc(m.t)}</h2>
            <p class="hb-result"><b class="hb-big" data-c="${key}"></b> <small class="hb-err" data-e="${key}"></small></p>
            <p class="muted hb-hint" data-w="${key}"></p>
            <div id="hb-parts">${partsHTML(m.parts)}</div>
            <div class="actions"><button type="button" class="btn small" data-act="padd">Add part</button></div>
            <details class="hb-details"><summary>Edit as text</summary><label class="hb-lbl hb-wide">Formula ${f(m.p, m.t + ' formula', { cls: 'hb-formula' })}</label><p class="muted hb-hint">${HELP}</p></details>
            <div class="actions"><button type="button" class="btn primary" data-act="close">Done</button></div>`;
    }

    // ---- rests ----
    function restDlg(kind) {
        const back = Math.ceil(hdTotal() / 2);
        if (kind === 'long') return `<h2>Long rest</h2>
            <p>Taking a long rest will:</p>
            <ul class="hb-plain"><li>Set hit points to the maximum, and clear temp HP and any max HP change</li><li>Restore spell slots, sorcery points and every resource</li>
            <li>Give back up to ${back} spent hit ${back === 1 ? 'die' : 'dice'}</li><li>Lower exhaustion by 1 and clear death saves</li></ul>
            <div class="actions"><button type="button" class="btn primary" data-act="dolong">Take long rest</button><button type="button" class="btn" data-act="close">Cancel</button></div>`;
        const con = C.abilities.find((a) => kk(a.key) === 'con'), V = vars();
        const rows = C.classes.map((c, i) => { const left = Math.max(0, nm(c.level) - nm(c.hdUsed)); return `<tr><td>Hit dice</td><td>d${nm(c.die) || 8}</td><td>${left}</td>
            <td><input class="field hb-n" inputmode="decimal" min="0" max="${left}" value="0" data-spend="${i}" aria-label="Hit dice to spend"${left ? '' : ' disabled'}></td></tr>`; }).join('');
        return `<h2>Short rest</h2>
            <p>Resources that reset on a short rest come back. To heal, roll the hit dice you spend${con ? ` and add your ${esc(con.key)} modifier (${sg(V[kk(con.key)])}) to each` : ''}, then enter the total.</p>
            ${table(['', 'Die', 'Left', 'Spend'], rows)}
            <label class="hb-lbl hb-wide">Hit points regained <input class="field" id="hb-heal" inputmode="decimal" min="0" value="0"></label>
            <div class="actions"><button type="button" class="btn primary" data-act="doshort">Take short rest</button><button type="button" class="btn" data-act="close">Cancel</button></div>`;
    }
    function rest(kind) {
        for (const p of C.panels) {
            const due = (r) => r.reset === 'short' || (kind === 'long' && r.reset === 'long');
            if (p.type === 'trackers') for (const r of p.rows.filter(due)) {
                if (r.kind === 'levels') for (const l of r.levels) l.used = 0;
                else if (r.kind === 'pips') r.used = 0;
                else r.cur = maxOf(r.max);
            }
            if (p.type === 'list') for (const r of p.rows.filter(due)) r.used = 0;
            if (kind !== 'long') continue;
            if (p.type === 'trackers') for (const r of p.rows) { r.extra = 0; for (const l of r.levels) l.extra = 0; }
            if (p.type === 'spells') { for (const s of p.slots) { s.used = 0; s.extra = 0; } p.sp.used = 0; p.sp.extra = 0; }
            if (p.type === 'combat') { p.ok = 0; p.bad = 0; }
        }
        if (kind === 'long') {
            let back = Math.ceil(hdTotal() / 2);
            for (const c of [...C.classes].sort((a, b) => b.die - a.die)) { const n = Math.min(back, nm(c.hdUsed)); c.hdUsed = nm(c.hdUsed) - n; back -= n; }
            C.hp.mod = 0; C.hp.cur = hpMax(); C.hp.temp = 0;
            if (nm(C.exhaustion) > 0) C.exhaustion = nm(C.exhaustion) - 1;
        } else {
            for (const el of dlgBody.querySelectorAll('[data-spend]')) {
                const c = C.classes[el.dataset.spend], left = Math.max(0, nm(c.level) - nm(c.hdUsed));
                c.hdUsed = nm(c.hdUsed) + Math.max(0, Math.min(left, Math.floor(nm(el.value))));
            }
            C.hp.cur = Math.min(hpMax(), nm(C.hp.cur) + Math.max(0, nm($('#hb-heal').value)));
        }
        dlg.close();
        saveNow(); draw();
        toast(kind === 'long' ? 'Long rest taken.' : 'Short rest taken.', 'ok');
    }

    // ---- SRD spells (loaded on first use) ----
    // ---- SRD equipment: item names to suggest, attributes / weight / cost when one is picked ----
    let eqList = null, eqNames = [];
    // the SRD lists some names back to front ("Crossbow, light"); show them the usual way round so they match the sheet's own
    const natural = (n) => n.replace(/^([^,(]+), ([^,(]+?)(\s*\(.*\))?$/, (_, a, b, c = '') => b[0].toUpperCase() + b.slice(1) + ' ' + a.toLowerCase() + c).replace(/\bArmor\b/i, 'armour');
    // the sheet's own names for SRD items it spells differently; the SRD twin is hidden and the sheet's name fills from it
    const EQ_ALIAS = { 'caltrops (bag of 20)': 'Caltrops', chalk: 'Chalk (1 piece)', 'arcane focus (crystal)': 'Crystal', 'arcane focus (staff)': 'Staff', 'druidic focus (wooden staff)': 'Wooden staff',
        'holy symbol (amulet)': 'Amulet', 'hempen rope (50 ft)': 'Hempen rope (50 feet)', 'silk rope (50 ft)': 'Silk rope (50 feet)', 'arrows (20)': 'Arrow', 'crossbow bolts (20)': 'Crossbow bolt',
        'sling bullets (20)': 'Sling bullet', 'blowgun needles (50)': 'Blowgun needle', 'half plate': 'Half plate armour' };
    // sheet names first, then SRD ones not already there (ignoring case)
    const gearNames = () => {
        const seen = new Set(Object.values(EQ_ALIAS).map((n) => n.toLowerCase()));
        return [...GEAR.map((g) => g[0]), ...eqNames].filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    };
    function loadEqList() {
        if (eqList) return eqList;
        eqList = fetch('../player/spells.php?eqlist=1').then((r) => (r.ok ? r.json() : Promise.reject())).then((list) => {
            eqNames = list.map(([, n]) => natural(n));
            $('#hb-dl-gear').innerHTML = gearNames().map((n) => `<option value="${esc(n)}">`).join('');
            return list;
        }).catch(() => { eqList = null; return []; });
        return eqList;
    }
    // fills only what's empty, so typed-in attributes, weight and cost stay
    async function eqFill(rp) {
        const r = get(rp), name = String(r.name).trim().toLowerCase(), want = (EQ_ALIAS[name] || name).toLowerCase();
        const hit = (await loadEqList()).find(([, n]) => natural(n).toLowerCase() === want);
        if (!hit) return;
        try {
            const res = await fetch('../player/spells.php?eq=' + encodeURIComponent(hit[0]));
            if (!res.ok) throw 0;
            const s = await res.json();
            if (!r.props.length) r.props = s.props || [];
            if (!nm(r.wt) && s.wt) r.wt = s.wt;
            if (String(r.gp).trim() === '' && s.gp) r.gp = s.gp;
            saveNow(); draw();
        } catch (e) { }
    }
    const itemRows = () => C.panels.filter((p) => p.type === 'items').flatMap((p) => p.rows);
    // an item attribute: its SRD rule when there is one, and which of your items have it
    function attrInfo(n) {
        const k = n.toLowerCase().replace(/\s*\(.*\)$/, '');
        const r = rule('prop', k) || rule('armour', k === 'shield' ? 'shields' : k.replace(/armor$/, 'armour')) || (k === 'simple' || k === 'martial' ? rule('weapons', k + ' weapons') : null)
            || (k === 'range' || k === 'ranged' ? rule('act', 'ranged attacks') : k === 'melee' ? rule('act', 'melee attacks') : null);
        const have = itemRows().filter((x) => x.props.includes(n)).map((x) => x.name || 'Unnamed item');
        openDrawer(`<h2>${esc(n)}</h2><p class="muted">Item attribute</p>
            <div class="hb-desc">${r ? rulePs(r) : '<p class="muted">No SRD description for this attribute.</p>'}</div>
            ${have.length ? `<h4>Your items with it</h4><ul class="hb-plain">${have.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            ${r ? `<p class="muted hb-hint">${SRD_CREDIT}</p>` : ''}`);
    }

    // homebrew spells first in the name suggestions, marked (assets/js/homebrew.js); a row from homebrew is the monster's own copy
    let srdList = null, srdOpts = '', srdNames = new Set();
    function spellOpts() {
        $('#hb-dl-srd').innerHTML = Homebrew.of(['spell']).map((x) => { const n = x.name + Homebrew.SUFFIX; return `<option value="${esc(n)}" label="${esc(n + ' · ' + (+x.level ? ordinal(+x.level) + ' level' : 'cantrip'))}"></option>`; }).join('') + srdOpts;
    }
    function hbPick(k, typed) {
        const low = String(typed).trim().toLowerCase(), x = panelOf(k).type === 'spells' ? Homebrew.named(['spell'], low, !srdNames.has(low)) : null;
        if (!x) return false;
        Homebrew.apply(get(k.replace(/\.name$/, '')), Homebrew.parts(x, C)[0]);
        saveNow(); draw();
        toast(`Filled in ${x.name} from homebrew.`, 'ok');
        return true;
    }
    function loadSrdList() {
        if (srdList) return srdList;
        Homebrew.ready().then(spellOpts);
        // ?list=N: bump N when the list changes, browsers cache it for a day
        srdList = fetch('../player/spells.php?list=2').then((r) => (r.ok ? r.json() : Promise.reject())).then((list) => {
            // the label carries the name too: Firefox shows only the label, Chrome shows the value beside it
            srdOpts = list.map(([, n, l]) => `<option value="${esc(n)}" label="${esc(n + ' · ' + (l ? ordinal(l) + ' level' : 'cantrip'))}"></option>`).join('');
            srdNames = new Set(list.map(([, n]) => n.toLowerCase()));
            spellOpts();
            return list;
        }).catch(() => { srdList = null; spellOpts(); toast("Couldn't load the SRD spell list. You can still type spells in yourself.", 'err'); return []; });
        return srdList;
    }
    const pickDice = (d, lvl) => {
        if (d.slot) return d.slot[lvl] || Object.values(d.slot)[0] || '';
        // the usual cantrip steps (1dX, 2dX, 3dX, 4dX) keep scaling with level
        const steps = d.char ? Object.values(d.char) : [], die = String(steps[0] || '').split('d')[1];
        if (steps.length === 4 && steps.every((v, i) => v === `${i + 1}d${die}`)) return 'CANTRIPd' + die;
        if (d.char) { let best = ''; for (const [k, v] of Object.entries(d.char)) if (+k <= level()) best = v; return best || Object.values(d.char)[0] || ''; }
        return '';
    };
    function fromSrd(s, r) {
        const ct = s.casting_time || '', desc = (s.desc || []).join('\n\n');
        // a best guess at non-damage effects; MOD is left for the player to swap for their ability
        const fx = [...(s.heal_at_slot_level ? [{ k: 'heal', dice: String(Object.values(s.heal_at_slot_level)[0] || ''), type: '', text: '' }] : []),
            ...[['teleport', /\bteleport/i], ['summon', /\b(summon|conjure)/i]].filter(([, re]) => re.test(desc)).map(([k]) => ({ k, dice: '', type: '', text: '' }))];
        Object.assign(r, {
            name: s.name, lvl: nm(s.level), school: s.school || '', range: s.range || '', dur: s.duration || '',
            time: /^1 action$/i.test(ct) ? 'Action' : /^1 bonus action$/i.test(ct) ? 'Bonus action' : /^1 reaction/i.test(ct) ? 'Reaction' : ct, trig: s.trigger || '',
            comp: (s.components || []).join(', ') + (s.material ? ` (${s.material})` : ''),
            conc: !!s.concentration, ritual: !!s.ritual, mode: s.save ? 'save' : s.attack_type ? 'atk' : 'none', save: s.save || r.save,
            dmg: (s.damage || []).map((d) => ({ dice: pickDice(d, nm(s.level)), type: d.type || '' })).filter((d) => d.dice),
            fx, desc, higher: (s.higher_level || []).join('\n\n'), srd: s.index,
        });
    }
    // rows filled before spells.php read save/attack/damage from the text get one re-check (mech marks it done)
    const noMech = (r) => r.mode === 'none' && !(r.dmg || []).length;
    const needsFill = (r) => !r.desc || (noMech(r) && !r.mech);
    async function srdFill(rp) {
        const r = get(rp), list = await loadSrdList();
        if (r.hbsrc) return;
        const hit = list.find(([, n]) => n.toLowerCase() === String(r.name).trim().toLowerCase());
        // an already-filled spell only gets what it's missing (text, or save/attack/damage on older rows), so edits stay
        const textOnly = hit && r.srd === hit[0];
        if (!hit || (textOnly && !needsFill(r))) return;
        try {
            const res = await fetch('../player/spells.php?i=' + encodeURIComponent(hit[0]));
            if (!res.ok) throw 0;
            const s = await res.json();
            if (!textOnly) fromSrd(s, r);
            else {
                const t = {}; fromSrd(s, t);
                if (!r.desc && t.desc) Object.assign(r, { desc: t.desc, higher: t.higher });
                if (noMech(r)) Object.assign(r, { mode: t.mode, save: t.save || r.save, dmg: t.dmg });
            }
            r.mech = 1;
            saveNow(); draw();
            toast(`Filled in ${r.name}${wdUrl(r) ? '' : ' from the SRD'}.`, 'ok');
        } catch (e) { toast(`Couldn't load ${r.name} from the SRD. Try again in a minute.`, 'err'); }
    }

    // the SRD 5.2 combat actions every character has, by timing; rule text in rules.js
    const COMBAT = [['Action', 'Attack|Dash|Disengage|Dodge|Grapple|Help|Hide|Improvise|Influence|Magic|Ready|Search|Shove|Study|Utilize'],
        ['Bonus action', 'Two-Weapon Fighting'], ['Reaction', 'Opportunity Attack'], ['Free', 'Interact with an Object']];
    // SRD 5.2 (CC-BY-4.0) unarmed strike: 1 + STR bludgeoning, or grapple / shove
    const UNARMED = { name: 'Unarmed Strike', range: '5 ft', mode: 'hit', hit: 'STR + PROF', dmg: [{ dice: '1 + STR', type: 'Bludgeoning' }],
        desc: 'Instead of using a weapon to make a melee attack, you can use a punch, kick, head-butt, or similar forceful blow. Whenever you use your Unarmed Strike, choose one of the following options for its effect.\n'
            + 'Damage. You make an attack roll against the target. Your bonus to the roll equals your Strength modifier plus your Proficiency Bonus. On a hit, the target takes Bludgeoning damage equal to 1 plus your Strength modifier.\n'
            + 'Grapple. The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it has the Grappled condition. The DC for the saving throw and any escape attempts equals 8 plus your Strength modifier and Proficiency Bonus. This grapple is possible only if the target is no more than one size larger than you and if you have a hand free to grab it.\n'
            + 'Shove. The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you either push it 5 feet away or cause it to have the Prone condition. The DC for the saving throw equals 8 plus your Strength modifier and Proficiency Bonus. This shove is possible only if the target is no more than one size larger than you.' };
    // picking a known weapon, item or metamagic from the suggestions fills in the rest of its row
    const named = (list, name) => list.find((x) => x[0].toLowerCase() === String(name).trim().toLowerCase());
    function rowFill(k) {
        const rp = k.replace(/\.name$/, ''), r = get(rp), P = panelOf(k);
        if (/\.meta\.\d+\.name$/.test(k)) {
            const m = named(METAMAGIC, r.name);
            if (!m) return false;
            Object.assign(r, { name: m[0], cost: m[1], desc: r.desc || m[2] });
        } else if (P.type === 'attacks' && named([[UNARMED.name]], r.name)) {
            Object.assign(r, { ...UNARMED, props: [], dmg: UNARMED.dmg.map((d) => ({ ...d })), desc: r.desc || UNARMED.desc });
        } else if (P.type === 'attacks') {
            const w = named(WEAPONS, r.name);
            if (!w) return false;
            const props = w[3] ? w[3].split(', ') : [], ab = props.includes('Finesse') || props.includes('Ammunition') ? 'DEX' : 'STR';
            Object.assign(r, { name: w[0], range: w[4], props, mode: 'hit', hit: ab + ' + PROF', dmg: [{ dice: w[1] + ' + ' + ab, type: w[2] }] });
        } else if (P.type === 'items') {
            const g = named(GEAR, r.name);
            if (!g) return false;
            Object.assign(r, { name: g[0], wt: g[1], cat: g[2] || 'Gear' });
        } else return false;
        saveNow(); draw();
        toast(`Filled in ${r.name}.`, 'ok');
        return true;
    }
    // comma-separated fields: suggest the next entry after what's already typed
    function multiList(el) {
        const pre = el.value.includes(',') ? el.value.replace(/[^,]*$/, '').replace(/\s*$/, ' ') : '';
        const have = el.value.toLowerCase().split(',').map((s) => s.trim());
        const items = uniq([...L('dmg'), ...(C.condList || CONDITIONS).split('\n').map((s) => s.trim()).filter(Boolean)]).filter((x) => !have.includes(x.toLowerCase()));
        $('#' + el.getAttribute('list')).innerHTML = items.map((x) => `<option value="${esc(pre + x)}">`).join('');
    }

    // ---- SRD rules text (rules.js): conditions, skills, weapon properties, languages, armour and weapon proficiencies ----
    const RULES = window.HB_RULES || {};
    function rule(kind, name) {
        const n = String(name).trim().toLowerCase();
        if (kind === 'weapons') {
            const simple = WEAPONS.slice(0, 14), w = named(WEAPONS, n);
            if (n === 'simple weapons' || n === 'martial weapons') return [(n[0] === 's' ? simple : WEAPONS.slice(14)).map((x) => x[0]).join(', ') + '.'];
            return w ? [`${simple.includes(w) ? 'Simple' : 'Martial'} weapon. ${w[1]} ${w[2].toLowerCase()} damage${w[3] ? '. ' + w[3] : ''}. ${w[4]}.`] : null;
        }
        return (RULES[kind] || {})[n] || null;
    }
    const ruleTip = (kind, name) => { const r = rule(kind, name); return r ? ` title="${esc(r.join(' ').replace(/(^|\s)- /g, '$1'))}"` : ''; };
    // "- " lines are SRD bullet points
    const rulePs = (r) => (r || []).map((x) => (x.startsWith('- ') ? `<p class="hb-bullet">${esc(x.slice(2))}</p>` : `<p>${esc(x)}</p>`)).join('');
    // what the chosen conditions, properties or proficiencies do, under where they're picked
    function rulesBlock(kind, names, heading) {
        const rows = names.map((n) => [n, rule(kind, n)]).filter(([, r]) => r);
        return rows.length ? `<div class="hb-rules">${heading ? `<h4>${esc(heading)}</h4>` : ''}${rows.map(([n, r]) => `<div class="hb-rule"><b>${esc(n)}</b>${rulePs(r)}</div>`).join('')}
            <p class="muted hb-hint">Rules text from the SRD 5.1, CC-BY-4.0.</p></div>` : '';
    }

    // ---- details drawer ----
    const paras = (s) => String(s || '').split(/\n+/).filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join('');
    function info(rp) {
        const r = get(rp), V = vars(), spell = 'lvl' in r, P = panelOf(rp);
        const kv = (rows) => rows.filter(([, v]) => v).map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v)}</span></div>`).join('');
        // list entries and metamagic: just a source or cost, uses and the text
        if (P.type === 'items') return openDrawer(`<h2>${esc(r.name || 'Unnamed')}</h2><p class="muted">${esc([r.cat, r.eq ? 'Equipped' : ''].filter(Boolean).join(', '))}</p>
            ${kv([['Quantity', String(nm(r.qty))], ['Weight', nm(r.wt) ? `${nm(r.wt)} lb each` : ''], ['Cost', nm(r.gp) ? `${nm(r.gp)} gp each` : ''], ['Attunement', r.att ? ITEM_ATT.find(([k]) => k === r.att)?.[1] : '']])}
            ${r.props.length ? `<h4>Attributes</h4><p>${r.props.map((n) => `<button type="button" class="hb-prop" data-act="attr" data-n="${esc(n)}">${esc(n)}</button>`).join(', ')}</p>` : ''}
            <div class="hb-desc">${paras(r.notes) || '<p class="muted">No notes yet. Add some with the edit button.</p>'}</div>`);
        if (!('time' in r)) {
            const uses = String(r.uses ?? '').trim() ? `${maxOf(r.uses, V)}${r.reset ? ', back on a ' + RESETS.find(([k]) => k === r.reset)[1].toLowerCase() : ''}` : '';
            return openDrawer(`<h2>${esc(r.name || 'Unnamed')}</h2><p class="muted">${esc(r.src || '')}</p>
                ${kv([['Cost', 'cost' in r && r.cost !== '' ? r.cost + ' sorcery points' : ''], ['Uses', uses]])}
                <div class="hb-desc">${paras(r.text ?? r.desc) || '<p class="muted">No description yet. Add one with the edit button.</p>'}</div>`);
        }
        const head = spell ? (nm(r.lvl) ? `${ordinal(nm(r.lvl))}-level ${(r.school || 'spell').toLowerCase()}` : `${r.school || 'Spell'} cantrip`) + (r.ritual ? ' (ritual)' : '') : r.time;
        const res = spell ? (r.mode === 'atk' ? show({ ...ev(P.atk, V), signed: true }) + ' to hit' : r.mode === 'save' ? `DC ${show(ev(r.dc || P.dc, V))} ${r.save} save` : '')
            : r.mode === 'hit' ? show({ ...ev(r.hit, V), signed: true }) + ' to hit' : r.mode === 'save' ? `DC ${show(ev(r.dc, V))} ${r.save} save` : '';
        if ('cost' in r && !spell) return openDrawer(`<h2>${esc(r.name || 'Unnamed')}</h2><p class="muted">${esc(r.time)}</p>
            ${kv([['Range', r.range], ['Resolves with', res], ['Cost', costText(r)]])}
            ${r.fx.some((e) => e.dice || e.text) ? `<h4>Effects</h4><ul class="hb-plain">${r.fx.filter((e) => e.dice || e.text).map((e) => `<li>${esc(fxOne(e, V))}</li>`).join('')}</ul>` : ''}
            <div class="hb-desc">${paras(r.desc)}</div>`);
        openDrawer(`<h2>${esc(r.name || 'Unnamed')}</h2><p class="muted">${esc(head || '')}</p>
            ${kv(spell ? [['Casting time', r.time + (r.trig ? ', ' + r.trig : '')], ['Range', r.range], ['Components', r.comp], ['Duration', (r.conc ? 'Concentration, ' : '') + r.dur], ['Resolves with', res], ['Damage', dmgText(r.dmg, V)], ['Effects', r.fx.map((e) => fxOne(e, V)).filter(Boolean).join(' · ')]]
                : [['Timing', r.time], ['Range', r.range], ['Resolves with', res], ['Damage', dmgText(r.dmg, V)], ['Effects', r.fx.map((e) => fxOne(e, V)).filter(Boolean).join(' · ')], ['Properties', r.props.filter((n) => !rule('prop', n)).join(', ')]])}
            <div class="hb-desc">${paras(r.desc) || '<p class="muted">No description yet. Add one with the edit button.</p>'}
            ${spell && r.higher ? `<p><b>At higher levels.</b></p>${paras(r.higher)}` : ''}</div>
            ${spell ? '' : rulesBlock('prop', r.props, 'Properties')}
            ${spell && wdUrl(r) ? `<p class="muted hb-hint">Full spell text: <a href="${wdUrl(r)}" target="_blank" rel="noopener">${esc(r.name)} on dnd5e.wikidot.com</a></p>` : spell && r.srd ? `<p class="muted hb-hint">${SRD_CREDIT}</p>` : ''}`);
    }
    function openDrawer(html) { if (Phone.on()) return Phone.info(html); $('#hb-drawer-body').innerHTML = html; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); drawer.focus(); }
    function ruleInfo(kind, names, title, sub) {
        const list = names.split('|').filter((n) => rule(kind, n));
        const body = list.length === 1 ? rulePs(rule(kind, list[0]))
            : list.map((n) => `<h4>${esc(n[0].toUpperCase() + n.slice(1))}</h4>${rulePs(rule(kind, n))}`).join('');
        openDrawer(`<h2>${esc(title)}</h2><p class="muted">${esc(sub)}</p><div class="hb-desc">${body}</div><p class="muted hb-hint">${SRD_CREDIT}</p>`);
    }
    function skillInfo(i) {
        const sk = C.skills[i], v = value('skill:' + i, vars());
        openDrawer(`<h2>${esc(sk.name)}</h2><p class="muted">${esc(sk.ab)} skill, ${PROF.find(([p]) => p === sk.p)?.[1].toLowerCase() || 'not proficient'}</p>
            <div class="kv"><span>Bonus</span><span>${esc(show({ ...v, signed: true }))}</span></div>
            <div class="hb-desc">${rulePs(rule('skill', sk.name)) || '<p class="muted">No SRD description for this skill.</p>'}</div>
            ${rule('skill', sk.name) ? `<p class="muted hb-hint">${SRD_CREDIT}</p>` : ''}`);
    }
    function senseInfo(i) {
        const p = C.passives[i], n = String(p.name).toLowerCase(), v = value('fx:passives.' + i + '.f', vars());
        // "Passive Perception": the passive check rule plus the skill; otherwise the first SRD sense named in it
        const sk = n.startsWith('passive') && C.skills.find((s) => n.includes(s.name.toLowerCase()));
        const key = n.startsWith('passive') ? 'passive' : Object.keys(RULES.sense || {}).find((k) => n.includes(k));
        const text = rulePs(rule('sense', key || '')) + (sk ? `<h4>${esc(sk.name)}</h4>${rulePs(rule('skill', sk.name))}` : '');
        openDrawer(`<h2>${esc(p.name)}</h2><p class="muted">Sense</p>
            <div class="kv"><span>Value</span><span>${esc(show(v))}${p.unit ? ' ' + esc(p.unit) : ''}</span></div>
            <div class="hb-desc">${text || '<p class="muted">No SRD description for this sense.</p>'}</div>
            ${text ? `<p class="muted hb-hint">${SRD_CREDIT}</p>` : ''}`);
    }
    function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }

    // ---- sense pick list: passive skills from this sheet, senses from D&D Beyond's rule data ----
    let senseNames = ['Blindsight', 'Darkvision', 'Tremorsense', 'Truesight'], senseLoaded = false;
    function senseOptions() {
        const have = new Set(C.passives.map((p) => p.name));
        const opt = (v, t) => `<option value="${esc(v)}"${have.has(t) ? ' disabled' : ''}>${esc(t)}</option>`;
        return '<option value="">Your own</option>'
            + `<optgroup label="Passive skills">${C.skills.map((k) => opt('p:' + k.name, 'Passive ' + k.name)).join('')}</optgroup>`
            + `<optgroup label="Senses">${senseNames.map((n) => opt('s:' + n, n)).join('')}</optgroup>`;
    }
    function loadSenses() {
        if (senseLoaded) return;
        senseLoaded = true;
        fetch('../player/ddb.php?rules=1').then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
            if (Array.isArray(j.senses) && j.senses.length) senseNames = j.senses;
            const pick = $('#hb-sense-pick');
            if (pick) pick.innerHTML = senseOptions();
        }).catch(() => { senseLoaded = false; });
    }

    // ---- customise ----
    // top of Customise: a formula to try out (kept in view.fb, never used by the sheet) and every word a formula can use, with its value now
    // guide rows for resources: left / spent / max, plus one row of per-level words for slots
    function resWords(V, w) {
        const U = (k) => k.toUpperCase(), trio = (k) => w(U(k)) + w(U(k) + '_USED') + w(U(k) + '_MAX'), nums = (k) => `${V[k]} / ${V[k + '_used']} / ${V[k + '_max']}`;
        const levelRow = (k, list, name) => [list.map((_, j) => `${k}_${j + 1}`).filter((x) => V[x + '_max'] > 0).map((x) => w(U(x)) + w(U(x) + '_USED')).join(' ') || '<span class="muted">none set</span>',
            `${name} at one level: <code>${U(k)}_3</code> is 3rd-level slots left, <code>${U(k)}_3_USED</code> spent, <code>${U(k)}_3_MAX</code> the maximum`, ''];
        const out = [], st = slotTracker(), sp = C.panels.find((p) => p.type === 'spells'), slots = st ? get(st).levels : sp ? sp.slots : [];
        if (slots.length) out.push([trio('slots'), 'Spell slots, every level together: left, spent (missing), maximum', nums('slots')], levelRow('slots', slots, 'Spell slots'));
        for (const p of C.panels) if (p.type === 'trackers') for (const r of p.rows) {
            const k = kk(r.name);
            if (!k || !has(V, k + '_max')) continue;
            out.push([trio(k), `${esc(r.name)}: left, spent, maximum`, nums(k)]);
            if (r.kind === 'levels') out.push(levelRow(k, r.levels, esc(r.name)));
        }
        return out;
    }
    function formulaGuide() {
        const V = vars();
        if (C.view.fb == null) C.view.fb = 'ceil(LEVEL / 4) + 1';
        const w = (word, ins = word) => `<button type="button" class="hb-fword" data-act="fbadd" data-n="${esc(ins)}" title="Add to the formula">${esc(word)}</button>`;
        const now = (k) => (has(V, k) && !isNaN(V[k]) ? String(V[k]) : '');
        const rows = [
            ...C.abilities.map((a) => [w(kk(a.key).toUpperCase()), `${esc(a.name || a.key)} modifier`, sg(V[kk(a.key)] || 0)]),
            ...C.abilities.map((a) => [w(kk(a.key).toUpperCase() + '_SCORE'), `${esc(a.name || a.key)} score`, now(kk(a.key) + '_score')]),
            [w('PROF'), 'Proficiency bonus', sg(V.prof)],
            [w('CR'), 'Challenge rating (1/4 counts as 0.25). LEVEL means the same', now('cr')],
            [w('CANTRIP'), 'Cantrip dice: 1, then 2 at CR 5, 3 at 11, 4 at 17. In damage, <code>CANTRIPd10</code> rolls that many d10s', now('cantrip')],
            [C.skills.map((s) => w(s.name.replace(/\s+/g, ''))).join(' '), 'A skill\'s full bonus, its name without spaces', ''],
            ...resWords(V, w),
        ];
        const syntax = [
            [w('+') + w('-') + w('*') + w('/') + w('( )', '()'), 'Maths. * and / happen before + and −; brackets go first. Results round down.', ''],
            [w('min(a, b)', 'min(DEX, 2)'), 'The smaller value. <code>min(DEX, 2)</code> caps DEX at +2, like medium armour', ''],
            [w('max(a, b)', 'max(1, CHA)'), 'The larger value. <code>max(1, CHA)</code> is never below 1', ''],
            [w('floor(x)', 'floor(LEVEL / 2)'), 'Round down. <code>floor(LEVEL / 2)</code> is half your level', ''],
            [w('ceil(x)', 'ceil(LEVEL / 2)'), 'Round up. <code>ceil(LEVEL / 4) + 1</code> is the proficiency bonus', ''],
            [w('round(x)', 'round(LEVEL / 3)'), 'Round to the nearest whole number', ''],
            [w('abs(x)', 'abs(STR)'), 'Drop a minus sign: <code>abs(-2)</code> is 2', ''],
            [w('[label]', '2 [Shield]'), 'Names the number before it in the breakdown: <code>10 + DEX + 2 [Shield]</code>', ''],
            [w('1d8'), 'Dice, in damage and healing boxes only. Written as is; a word straight before <code>d</code> sets how many', ''],
        ];
        const tbl = (list) => table(['Word', 'What it does', 'Now'], list.map(([a, b, c]) => `<tr><td class="hb-fwords">${a}</td><td>${b}</td><td class="hb-c">${esc(c)}</td></tr>`).join(''));
        return `<h3>Formulas</h3>
            <div class="hb-fbuild">
                <label class="hb-lbl hb-wide">Try a formula ${f('view.fb', 'Formula to try', { cls: 'hb-formula', ph: '10 + DEX + 2 [Shield]' })}</label>
                <p class="hb-result">= <b class="hb-big" data-c="fb:view.fb"></b> <small class="hb-err" data-e="fb:view.fb"></small></p>
                <p class="muted hb-hint" data-w="fb:view.fb"></p>
                <p class="muted hb-hint">Only for trying things out; nothing on the sheet uses it. Click any word below to add it, then copy the formula into any box on the sheet.</p>
            </div>
            <h4>For this monster</h4>${tbl(rows)}
            <h4>Maths and other parts</h4>${tbl(syntax)}`;
    }
    function customDlg() {
        const mini = (head, rows, addBtn) => table(head, rows) + `<div class="actions">${addBtn}</div>`;
        return `<h2>Customise</h2>
            <p class="muted hb-hint">Changes apply as you type.</p>
            ${formulaGuide()}
            <h3>Hit points</h3>
            <label class="check">${f('view.hpScroll', 'Scroll to set damage or healing', { check: true })} One amount you scroll over (up heals, down damages) and one button that says Heal or Damage to match</label>
            <h3>Dice</h3>
            <label class="check">${f('view.noRoll', 'Turn off click to roll', { check: true })} Roll your own dice: don't roll when an ability, save, skill or tool bonus is clicked</label>
            <label class="check">${f('view.noTray', 'Hide the dice button', { check: true })} Hide the dice button in the bottom-left corner</label>
            <p class="hb-dicelink"><a class="btn" href="/dice/">Customise dice</a> <span class="muted">Pick the dice, their sounds, trails and nat 1 and nat 20 effects on the Dice Sets page; they apply here straight away.</span></p>
            <label class="check">${f('view.noSound', 'Turn off dice sounds', { check: true })} No sound when the dice land</label>
            <label class="check">${f('view.noAnim', 'Turn off thrown dice', { check: true })} Show results straight away instead of throwing 3D dice across the page</label>
            <h3>Panels</h3>
            <label class="check">${f('view.all', 'Show every panel at once', { check: true })} Show every panel at once instead of tabs</label>
            <label class="check">${f('view.prep', 'Always show prepared spells', { check: true })} Always show the Prepared tab and checkboxes (for homebrew classes; otherwise only Artificer, Cleric, Druid, Paladin and Wizard get them)</label>
            ${Phone.fullSwitch()}<div class="hb-ptable">${table(['Show', 'Title', 'Type', ''], C.panels.map((p, i) => `<tr><td class="hb-c">${f(`panels.${i}.on`, 'Show ' + p.title, { check: true })}</td>
                <td>${f(`panels.${i}.title`, 'Title')}</td><td class="muted">${TYPES[p.type]}${Phone.on() ? ' · ' + Phone.tabName(p.type) + ' tab' : ''}</td>
                <td class="hb-nowrap"><button type="button" class="hb-x" data-act="mv" data-i="${i}" data-d="-1" aria-label="Move ${esc(p.title)} up" title="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" class="hb-x" data-act="mv" data-i="${i}" data-d="1" aria-label="Move ${esc(p.title)} down" title="Move down"${i < C.panels.length - 1 ? '' : ' disabled'}>↓</button>${del('panels', i, p.title)}</td></tr>`).join(''))}</div>
            <div class="actions hb-addpanel"><select class="field hb-auto" id="hb-newtype" aria-label="Panel type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select><button type="button" class="btn small" data-act="addpanel">Add panel</button></div>
            <h3>Numbers</h3>
            ${table(['Number', 'Formula', 'Result'], [['prof', 'Proficiency bonus', 1], ['ac', 'Armour class', 0], ['init', 'Initiative', 1]].map(([k, t, s]) =>
                `<tr><td>${t}</td><td>${f(k, t + ' formula', { cls: 'hb-formula' })}</td><td><b data-c="${s ? 'fs' : 'fx'}:${k}"></b></td></tr>`).join(''))}
            <h3>Abilities</h3>
            ${mini(['Key', 'Name', 'Extra save bonus', ''], C.abilities.map((a, i) => `<tr><td>${f(`abilities.${i}.key`, 'Key', { cls: 'hb-n' })}</td><td>${f(`abilities.${i}.name`, 'Name')}</td><td>${f(`abilities.${i}.sb`, 'Extra save bonus formula', { cls: 'hb-formula', ph: '0' })}</td><td>${del('abilities', i, a.name)}</td></tr>`).join(''), add('abilities', 'ability', 'Add ability'))}
            <h3>Skills</h3>
            ${mini(['Skill', 'Ability', 'Extra bonus', ''], C.skills.map((s, i) => `<tr><td>${f(`skills.${i}.name`, 'Skill')}</td><td>${abSel(`skills.${i}.ab`, 'Ability')}</td><td>${f(`skills.${i}.b`, 'Extra bonus formula', { cls: 'hb-formula', ph: '0' })}</td><td>${del('skills', i, s.name)}</td></tr>`).join(''), add('skills', 'skill', 'Add skill'))}
            <h3>Senses</h3>
            ${table(['Name', 'Formula', 'Result', 'Unit', ''], C.passives.map((p, i) => `<tr><td>${f(`passives.${i}.name`, 'Name')}</td><td>${f(`passives.${i}.f`, 'Formula', { cls: 'hb-formula' })}</td><td><b data-c="fx:passives.${i}.f"></b></td><td>${f(`passives.${i}.unit`, 'Unit', { cls: 'hb-n', ph: 'ft' })}</td><td>${del('passives', i, p.name)}</td></tr>`).join(''))}
            <div class="actions"><select class="field hb-auto" id="hb-sense-pick" aria-label="Sense to add">${senseOptions()}</select><button type="button" class="btn small" data-act="addsense">Add sense</button></div>
            <h3>Lists</h3>
            <p class="muted hb-hint">One entry per line. These fill the suggestions and tabs.</p>
            <div class="hb-grid hb-lists"><label>Conditions ${f('condList', 'Conditions', { area: true })}</label>${Object.entries(LIST_NAMES).map(([k, t]) => `<label>${t} ${f('lists.' + k, t, { area: true })}</label>`).join('')}</div>
            ${C.art ? '<h3>Art</h3><button type="button" class="btn small" data-act="artdel">Remove art</button>' : ''}
            <div class="actions"><button type="button" class="btn" data-act="close">Close</button></div>`;
    }

    // ---- drawing ----
    const open = { more: false, hp: false, manage: false };
    const openRows = new Set();
    let dlgMode = null;
    const dlgHTML = () => (dlgMode.kind === 'hbsave' ? hbSaveDlg() : dlgMode.kind === 'hbmon' ? hbMonDlg() : dlgMode.kind === 'hbup' ? hbUpDlg(dlgMode) : dlgMode === 'custom' ? customDlg() : dlgMode.kind === 'crop' ? cropDlg() : dlgMode.kind === 'rest' ? restDlg(dlgMode.r) : formulaDlg(dlgMode));
    // ---- dice: a card for each roll and the dice tray in the bottom-left corner ----
    const DICE = [4, 6, 8, 10, 12, 20, 100], tray = { open: false, pool: {} };
    // the dice chosen on the Dice Sets page (/dice/, choice.js), read at every roll so a change there applies here straight away;
    // with no choice yet, the style this sheet had picked before (C.view.diceStyle). Plain purple if any of it fails to load.
    let choiceP = null;
    const chosenStyle = (m) => (choiceP ||= import(`/dice/choice.js${(($('script[src*="/monster.js"]')?.src || '').match(/\?v=\d+/) || [''])[0]}`)
        .catch((e) => { choiceP = null; throw e; }))
        .then((c) => { const k = C.view.diceStyle || 'purple';
            return c.styleFrom(c.readChoice() || { set: m.STYLES[k] ? { key: k, builtin: true } : { key: k, url: `./sets/${k}.js` } }, m); })
        .catch(() => 'purple');
    const die = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % n) + 1; };
    let rollTimer = 0;
    // groups: [[sides, count]], mod: number added on top
    // groups [['coin', 1]] flips a coin: the card shows Heads or Tails instead of a total
    // each > 1 splits the dice into that many separate results, e.g. one per target ("4 × (1d12 + 10)"); mod covers them all
    function rollShow(title, groups, mod = 0, each = 1, adv = '') {
        const logIt = !C.archived; // decided now: an archived roll stays unlogged even if Unarchive comes before its dice land
        const coin = groups[0]?.[0] === 'coin', side = (v) => (v === 'heads' ? 'Heads' : 'Tails'), thrown = adv ? [[20, 2]] : groups;
        if (adv) title += adv === 'adv' ? ' with advantage' : ' with disadvantage';
        const card = (rolls) => {
            // every die as it landed, for the Table view's 3D dice (ROADMAP 1.7); a coin flip has none
            const dice = rolls.every(([n]) => [4, 6, 8, 10, 12, 20, 100].includes(n)) ? rolls.map(([n, r]) => [n, r.slice()]) : undefined;
            const c = camp(), to = c && rollTo() ? (c.dm ? ' · hidden' : ' · to DM') : '';
            const pair = adv && rolls[0][1];
            if (pair) rolls = [[20, [Math[adv === 'adv' ? 'max' : 'min'](...pair)]]];
            const tail = (m) => (m ? ` ${m < 0 ? '−' : '+'} ${Math.abs(m)}` : '');
            // separate results: result i takes its share of every group's dice
            const hits = each > 1 && !coin ? Array.from({ length: each }, (_, i) => rolls.flatMap(([, r]) => r.slice(i * r.length / each, (i + 1) * r.length / each))) : null;
            const total = coin ? side(rolls[0][1][0]) : hits ? hits.map((v) => v.reduce((a, b) => a + b, mod / each)).join(', ')
                : rolls.reduce((t, [, r]) => t + r.reduce((a, b) => a + b, 0), 0) + mod;
            const expr = pair ? `2d20 keep ${adv === 'adv' ? 'higher' : 'lower'}${tail(mod)}` : coin ? 'Coin' : hits ? `${each} × (${groups.map(([n, c]) => `${c / each}d${n}`).join(' + ')}${tail(mod / each)})`
                : groups.map(([n, c]) => `${c}d${n}`).join(' + ') + tail(mod);
            const kept = pair && rolls[0][1][0], shown = pair ? `~${pair[pair.indexOf(kept) ^ 1]}~, ${kept}` + tail(mod) : coin ? '' : hits ? hits.map((v) => v.join(' + ') + tail(mod / each)).join(' | ') : rolls.map(([, r]) => r.join(', ')).join(' | ') + tail(mod);
            // a lone d20 shows a natural 20 or 1
            const nat = groups.length === 1 && groups[0][0] === 20 && groups[0][1] === 1 ? (rolls[0][1][0] === 20 ? ' hb-nat20' : rolls[0][1][0] === 1 ? ' hb-nat1' : '') : '';
            // just under the sticky sheet bar, which wraps taller on phones
            const hbBar = $('#hb-bar');
            $('#hb-rolls').style.top = (getComputedStyle(hbBar).position === 'sticky' ? Math.max(76, hbBar.offsetHeight + 12) : 16) + 'px';
            $('#hb-rolls').innerHTML = `<button type="button" class="hb-rollcard${nat}${hits ? ' hb-each' : ''}" data-act="rollx" aria-label="Dismiss roll">
                <span class="hb-rollhead"><b>${esc(title)}</b><small>${esc(expr + to)}</small></span>
                <span class="hb-rolldice">${strike(shown)}</span><span class="hb-rolltot">${total}</span></button>`;
            clearTimeout(rollTimer); rollTimer = setTimeout(() => { $('#hb-rolls').innerHTML = ''; }, Phone.on() ? 5000 : 12000);
            // the roll log keeps the last 100 rolls with the character
            if (logIt) (C.rolls ||= []).unshift({ at: Date.now(), title, expr, shown, total, nat: nat.trim() });
            C.rolls.length = Math.min(C.rolls.length, 100);
            saveNow(false); drawLog(); if (tray.open) drawTray(); // a roll isn't an edit
            // and to the campaign's table log (live.js keeps it until it's sent, offline too)
            if (c) sent.add(Live.send(c.id, { char: CHAR_ID(), name: C.name, title, expr, shown, total: String(total), nat: nat.includes('20') ? '20' : nat.includes('1') ? '1' : '', vis: !rollTo() ? 'public' : c.dm ? 'hidden' : 'dm', dice, ...window.Fight?.tag(c.id, title, C.id) }));
        };
        const quick =() => card(groups.map(([n, c]) => [n, Array.from({ length: c }, () => (n === 'coin' ? (die(2) === 1 ? 'heads' : 'tails') : die(n)))]));
        if (C.view.noAnim || matchMedia('(prefers-reduced-motion: reduce)').matches) return quick();
        $('#hb-rolls').innerHTML = '';
        // 3D dice (dice3d.js, three.js + cannon-es from jsDelivr) load on the first roll; the face that lands up is the result
        const css = getComputedStyle(main);
        dice3d().then(async (m) => m.throwDice(thrown, { style: await chosenStyle(m), accent: css.getPropertyValue('--btn').trim() || '#5b3f8f', sound: !C.view.noSound }))
            .then(card, () => { dice3dP = null; quick(); });
    }
    // ---- the table (ROADMAP 1.3): signed in, rolls are shared to a campaign's table log (assets/js/live.js) ----
    // "Rolls go to" in the dice tray picks the campaign ("none" keeps them to yourself, "" means its only one); the toggle
    // next to it sends a player's rolls to the DM only, or hides the DM's. Everyone else's rolls pop up as cards and fill
    // the Table tab of the roll log. What each player may see is decided on the server (includes/tablelog.php).
    // for the whole sheet: which campaign you DM gets its rolls, and public or hidden. Settings that follow the account
    // (monster-table, monster-roll-vis in assets/js/sync.js and prefs.php).
    const pref = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
    const tableChoice = () => pref('monster-table');
    const setTable = (v) => setPref('monster-table', v);
    const rollTo = () => pref('monster-roll-vis') === 'hidden';
    const setRollTo = (on) => setPref('monster-roll-vis', on ? 'hidden' : '');
    const CAMPS_Q = () => 'dm=1';
    const CHAR_ID = () => '';
    const tableReady = () => true;
    // someone else's roll takes the card's place, as your own rolls do here
    function putCard(html) {
        const hbBar = $('#hb-bar');
        $('#hb-rolls').style.top = (getComputedStyle(hbBar).position === 'sticky' ? Math.max(76, hbBar.offsetHeight + 12) : 16) + 'px';
        $('#hb-rolls').innerHTML = html;
        clearTimeout(rollTimer); rollTimer = setTimeout(() => { $('#hb-rolls').innerHTML = ''; }, Phone.on() ? 6000 : 12000);
    }
    let camps = [], tlog = [], tloaded = false, watching = null, watchId = '', logTab = 'mine';
    const sent = new Set();
    const camp = () => (tableChoice() === 'none' ? null : camps.find((x) => x.id === tableChoice()) || (camps.length === 1 && !tableChoice() ? camps[0] : null));
    async function loadCamps() {
        camps = [];
        if (cloud && window.Live && tableReady()) {
            try { const r = await fetch('/campaigns/log.php?' + CAMPS_Q()); if (r.ok) camps = (await r.json()).campaigns; } catch (e) { }
        }
        tableWatch(); drawTray(); drawLog(); drawSide();
    }
    function tableWatch() {
        // the fight in the campaign picked here (assets/js/fight.js): the DM runs it on the battle map (ROADMAP 1.6), so the panel
        // only links there; it redraws the list's "Add to fight" buttons
        Phone.frame(); refresh();
        window.Fight?.panel($('#mon-fight'), camp()?.id || '', { brief: true, onChange: drawSide });
        const id = camp()?.id || '';
        if (id === watchId) return;
        watching?.close();
        watching = null; watchId = id; tlog = []; tloaded = false;
        if (!id) { logTab = 'mine'; return; }
        watching = Live.watch(id, {
            onRolls(list, all) {
                if (all) {
                    // a reload (reconnect, or polling with no relay) cards the rolls that came in meanwhile; the first load is
                    // history, and a roll older than the log we hold was trimmed off it, not missed
                    if (tloaded) {
                        const had = new Set(tlog.map((x) => x.id)), from = tlog[0]?.at ?? 0;
                        for (const e of list.filter((x) => !had.has(x.id) && !sent.has(x.id) && x.at >= from).slice(-5)) tableCard(e);
                    }
                    tlog = list; tloaded = true;
                }
                else for (const e of list) {
                    const i = tlog.findIndex((x) => x.id === e.id);
                    if (i >= 0) tlog[i] = e; else { tlog.push(e); if (!sent.has(e.id)) tableCard(e); }
                }
                tlog.sort((a, b) => a.at - b.at);
                if (tlog.length > 200) tlog = tlog.slice(-200);
                drawLog(); if (tray.open) drawTray();
            },
            onMessage(m) { if (m.type === 'removed') loadCamps(); },
        });
    }
    const strike = (t) => esc(t).replace(/~([^~]*)~/g, '<s>$1</s>');
    const hiddenRoll = (e) => e.vis === 'hidden' && e.total === undefined;
    const natCls = (e) => (e.nat === '20' ? ' hb-nat20' : e.nat === '1' ? ' hb-nat1' : '');
    const tableNote = (e) => (e.vis === 'dm' ? ' · to DM' : e.vis === 'hidden' && !hiddenRoll(e) ? ' · hidden' : '') + (e.offline ? ' · offline roll' : '');
    function tableCard(e) {
        const h = hiddenRoll(e);
        putCard(`<button type="button" class="hb-rollcard hb-other${natCls(e)}" data-act="rollx" aria-label="Dismiss roll">
            <span class="hb-rollhead"><b>${esc(e.name)}${h ? ' rolled' : `<span class="hb-rollwhat">: ${esc(e.title)}</span>`}</b><small>${h ? 'A hidden roll' : esc(e.expr + tableNote(e))}</small></span>
            <span class="hb-rolldice">${h ? '' : strike(e.shown)}</span><span class="hb-rolltot">${h ? '?' : esc(String(e.total))}</span></button>`);
    }
    const tableRows = (n) => `<ol class="hb-logl">${tlog.slice(-n).reverse().map((e) => `<li class="hb-logi${natCls(e)}">
        <span class="hb-logh"><b>${esc(e.name)}${hiddenRoll(e) ? ' rolled' : ': ' + esc(e.title)}</b><small title="${esc(new Date(e.at).toLocaleString())}">${esc(logTime(e.at))}</small></span>
        <span class="hb-logd">${hiddenRoll(e) ? 'A hidden roll' : esc(e.expr) + ' · ' + strike(e.shown)}${esc(tableNote(e))}</span><span class="hb-logt">${hiddenRoll(e) ? '?' : esc(String(e.total))}</span></li>`).join('')}</ol>`;
    const tablePick = () => (camps.length ? `<div class="hb-trayrow hb-trayto"><label>Rolls go to <select class="field" data-act="tablepick">${camps.map((x) => `<option value="${esc(x.id)}"${camp()?.id === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="none"${camp() ? '' : ' selected'}>Nowhere (only you)</option></select></label>
        ${camp() ? `<button type="button" class="btn small" data-act="rollto" aria-pressed="${rollTo()}" title="${camp().dm ? 'Hidden rolls show to players only as rolled' : 'Only you and the DM see rolls sent to the DM'}">${camp().dm ? (rollTo() ? 'Hidden' : 'Public') : (rollTo() ? 'To DM' : 'Everyone')}</button>` : ''}</div>` : '');

    // shortcut: dice3d.js and dice/choice.js reuse monster.js's ?v= version, so a change to either alone needs monster.js touched too (last: coins fly in from any side, 31 Oct 2026)
    let dice3dP = null;
    const dice3d = () => dice3dP || (dice3dP = import(new URL('/dice/dice3d.js' + (($('script[src*="/monster.js"]')?.src || '').match(/\?v=\d+/) || [''])[0], location.href).href));
    function drawTray() {
        const box = $('#hb-dice');
        if (Phone.on()) { box.hidden = !!C.view.noTray && !!C.view.noRoll; box.innerHTML = `<button type="button" class="hb-dicebtn" data-act="tray" aria-label="Open dice and roll log" title="Dice">${D20}</button>`; if (Phone.kind() === 'dice') Phone.fill(); return; }
        box.hidden = !!C.view.noTray;
        if (box.hidden) return;
        const groups = DICE.filter((n) => tray.pool[n]).map((n) => [n, tray.pool[n]]);
        box.innerHTML = `${tray.open ? `<div class="hb-tray" role="group" aria-label="Dice tray">
                <div class="hb-traydice">${DICE.map((n) => `<button type="button" class="hb-die" data-act="die" data-n="${n}" aria-label="Add a d${n}" title="Right-click to remove one">d${n}${tray.pool[n] ? `<small>${tray.pool[n]}</small>` : ''}</button>`).join('')}</div>
                <div class="hb-trayrow"><span class="muted">${groups.length ? groups.map(([n, c]) => `${c}d${n}`).join(' + ') : 'Click dice to add them'}</span>
                    <button type="button" class="btn small" data-act="coin">Flip a coin</button><button type="button" class="btn small" data-act="dieclear"${groups.length ? '' : ' disabled'}>Clear</button><button type="button" class="btn small primary" data-act="dieroll"${groups.length ? '' : ' disabled'}>Roll</button></div>
                ${tablePick()}
                ${!logSide() && !C.view.noRoll && (C.rolls || []).length ? `<div class="hb-traylog"><span class="muted">Recent rolls</span>${logRows(5)}</div>` : ''}
                ${!logSide() && !C.view.noRoll && tlog.length ? `<div class="hb-traylog"><span class="muted">At the table</span>${tableRows(5)}</div>` : ''}
            </div>` : ''}<button type="button" class="hb-dicebtn" data-act="tray" aria-expanded="${tray.open}" aria-label="${tray.open ? 'Close' : 'Open'} the dice tray" title="Dice">${D20}</button>`;
    }
    // ---- roll log: in the empty space left of the sheet when there is room, otherwise the last few in the dice tray ----
    // the encounter list holds the space left of the sheet, so recent rolls stay in the dice tray
    const logSide = () => false;
    const logTime = (ms) => { const d = new Date(ms); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : dateText(ms); };
    const logRows = (n) => `<ol class="hb-logl">${(C.rolls || []).slice(0, n).map((r) => `<li class="hb-logi${r.nat ? ' ' + r.nat : ''}">
        <span class="hb-logh"><b>${esc(r.title)}</b><small title="${esc(new Date(r.at).toLocaleString())}">${esc(logTime(r.at))}</small></span>
        <span class="hb-logd">${esc(r.expr)} · ${strike(r.shown)}</span><span class="hb-logt${String(r.total).includes(',') ? ' hb-each' : ''}">${esc(String(r.total))}</span></li>`).join('')}</ol>`;
    function drawLog() {
        if (Phone.on()) { $('#hb-log').hidden = true; if (Phone.kind() === 'dice') Phone.fill(); return; }
        const box = $('#hb-log'), left = root.getBoundingClientRect().left;
        box.hidden = !!C.view.noRoll || !logSide();
        if (box.hidden) return;
        box.style.width = Math.min(360, left - 32) + 'px';
        if (!camp()) logTab = 'mine';
        const tabs = camp() ? `<div class="stabs hb-logtabs"><button type="button" data-act="logtab" data-t="mine" class="${logTab === 'mine' ? 'on' : ''}">Mine</button><button type="button" data-act="logtab" data-t="table" class="${logTab === 'table' ? 'on' : ''}">Table</button></div>` : '';
        if (logTab === 'table') return void (box.innerHTML = `<div class="hb-logbar"><h2>Roll log</h2>${tabs}</div>${tlog.length ? tableRows(200) : '<p class="muted">Rolls at the table show up here.</p>'}`);
        box.innerHTML = `<div class="hb-logbar"><h2>Roll log</h2>${tabs}${(C.rolls || []).length ? '<button type="button" class="btn small" data-act="logclear">Clear</button>' : ''}</div>
            ${(C.rolls || []).length ? logRows(100) : '<p class="muted">Your dice rolls show up here.</p>'}`;
    }
    const D20 = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M12 2 21 7v10l-9 5-9-5V7zM12 2 7.5 9.5h9zM3 7l4.5 2.5L12 17l4.5-7.5L21 7M7.5 9.5 3 17M16.5 9.5 21 17M12 17v5M3 17h18"/></svg>';

    function draw() {
        // sorcery points are boxes: an old counter turns into boxes with the same number left
        for (const p of C.panels) if (p.type === 'trackers') for (const r of p.rows) if (r.kind === 'count' && /^sorcery points?$/i.test(String(r.name).trim())) {
            Object.assign(r, { kind: 'pips', used: Math.max(0, maxOf(r.max) - nm(r.cur)) });
        }
        const ph = Phone.on();
        $('#hb-barin').innerHTML = ph ? '' : bar();
        drawSide();
        root.innerHTML = (ph ? Phone.mainHTML() : top() + `<div class="hb-top-panels">${panels()}</div>`) + `<div hidden>${datalists()}</div>`;
        Phone.frame();
        drawTray(); drawLog(); Phone.fill();
        if (dlg.open && dlgMode && !['rest', 'crop', 'hbsave'].includes(dlgMode.kind)) { dlgBody.innerHTML = dlgHTML(); }
        if (C.archived) for (const el of root.querySelectorAll('input, select, textarea')) el.disabled = true;
        phLock();
        refresh();
    }
    function showDlg(mode) { Phone.close(); dlgMode = mode; dlgBody.innerHTML = dlgHTML(); dlg.showModal(); refresh(); }
    dlg.addEventListener('close', () => { dlgMode = null; draw(); });

    // ---- monsters only: the encounter list on the left, Duplicate, and importing from the monster list ----
    // "Goblin" twice in one encounter becomes "Goblin 1" and "Goblin 2"
    function numbered(name, enc = '') {
        const all = monsIn(enc), base = name.replace(/\s+\d+$/, '');
        if (!all.some((x) => x.name.replace(/\s+\d+$/, '') === base)) return name;
        all.forEach((x) => { if (x.name === base) { x.name = base + ' 1'; x.updated = Date.now(); dirty.add(x.id); } });
        let n = 2;
        while (all.some((x) => x.name === `${base} ${n}`)) n++;
        return `${base} ${n}`;
    }
    function drawSide() {
        const box = $('#mon-side');
        if (!box) return;
        const all = monsIn(shownEnc), list = all.filter((c) => !c.archived), arch = all.filter((c) => c.archived), shown = encOf(shownEnc);
        const gone = db.encs.filter((e) => e.archived).sort((a, b) => a.order - b.order);
        const item = (c) => {
            const max = nm(c.hp.base) + nm(c.hp.mod), on = c === C;
            return `<button type="button" class="mon-item${on ? ' on' : ''}${nm(c.hp.cur) <= 0 ? ' down' : ''}" data-act="side" data-id="${esc(c.id)}"${on ? ' aria-current="true"' : ''}>
                <b>${esc(c.name || 'Unnamed monster')}</b><small>HP ${nm(c.hp.cur)}/${max}${String(c.cr).trim() ? ' · CR ' + esc(c.cr) : ''}${EncDiff.crXp(c.cr) === null ? '' : ' · ' + EncDiff.crXp(c.cr).toLocaleString() + ' XP'}</small></button>`;
        };
        // archived monsters (ROADMAP 0.5) wait at the bottom, folded away, each with Unarchive
        // archived encounters (ROADMAP 3.1) wait folded at the very bottom; their monsters keep their own archived marks
        box.innerHTML = encPicker('mon-encside') + `<section class="mon-diff" aria-label="Encounter difficulty">${diffHTML()}</section>` + `<h2>Monsters <span class="n">${list.length}</span></h2>`
            + (shown?.archived ? `<p class="note mon-encnote">This encounter is archived. <button type="button" class="btn small" data-act="encunarc" data-id="${esc(shown.id)}">Unarchive</button></p>` : '')
            + (list.length ? '' : '<p class="muted mon-encnote">No monsters here yet. Open one and pick Move to encounter (under Edit) to put it here.</p>')
            + `<div class="mon-list">${list.map((c) => item(c) + fightBtn(c)).join('')}</div>${fightBtn()}`
            + (arch.length ? `<details class="mon-arch"${arch.includes(C) ? ' open' : ''}><summary>Archived (${arch.length})</summary><div class="mon-list">${arch.map((c) => `<div class="mon-arcrow">${item(c)}
                <button type="button" class="btn small" data-act="monunarc" data-id="${esc(c.id)}">Unarchive</button></div>`).join('')}</div></details>` : '')
            + (gone.length ? `<details class="mon-arch mon-encarch"${shown?.archived ? ' open' : ''}><summary>Archived encounters (${gone.length})</summary><div class="mon-list">${gone.map((e) => `<div class="mon-arcrow">
                <button type="button" class="mon-item${e === shown ? ' on' : ''}" data-act="encshow" data-id="${esc(e.id)}"><b>${esc(encName(e.id))}</b><small>${monsIn(e.id).length} monster${monsIn(e.id).length === 1 ? '' : 's'}</small></button>
                <button type="button" class="btn small" data-act="encunarc" data-id="${esc(e.id)}">Unarchive</button></div>`).join('')}</div></details>` : '');
        $('#mon-side .mon-list').classList.toggle('fi-on', !!fightNow());
        diffOthers();
    }

    // ---- the encounter builder (ROADMAP 3.2): the sums are in difficulty.js ----
    const encRules = () => (pref('encounter-rules') === '2024' ? '2024' : '2014');
    const partyOwn = (id) => (id ? encOf(id)?.party : db.unsorted?.party) || null;
    const partyLast = () => [...db.encs.map((e) => e.party), db.unsorted?.party].filter(Boolean).sort((a, b) => b.at - a.at)[0] || null;
    // an encounter's own party, else the last one used, else the campaign the rolls go to
    const partyOf = (id) => partyOwn(id) || partyLast() || { camp: camp()?.id || '', off: [], levels: '', at: 0, gone: 0 };
    function partySet(id, patch) {
        const p = { ...partyOf(id), ...patch, at: Date.now(), gone: 0 };
        if (!id) db.unsorted = { party: p, updated: p.at };
        else Object.assign(encOf(id), { party: p, updated: p.at });
        encSaved();
        drawSide();
    }
    // the last party seen of each campaign, so prep works offline; a copy of what the account already holds, so this browser only
    const PARTY_SEEN = 'mon-party-seen';
    const seenAll = () => { try { return JSON.parse(localStorage.getItem(PARTY_SEEN)) || {}; } catch (e) { return {}; } };
    let partySeen = seenAll(), partyLive = new Set(), partyWatch = null, partyWatchId = '';
    // the party of an encounter as the sums want it, and what to say about it
    function partyNow(id) {
        const p = partyOf(id), seen = p.camp ? partySeen[p.camp] : null, chars = seen?.chars || [], notes = [];
        const counted = chars.filter((c) => !c.draft && !p.off.includes(c.id));
        const drafts = chars.filter((c) => c.draft).length, typed = EncDiff.parseLevels(p.levels);
        if (p.gone) notes.push('That campaign is no longer available, so these are the last levels seen.');
        if (p.camp && !seen) notes.push(partyLive.has(p.camp) ? '' : "This campaign's party can't be read right now.");
        if (p.camp && seen && !partyLive.has(p.camp)) notes.push(`Last checked ${new Date(seen.at).toLocaleDateString()}.${cloud ? '' : ' Sign in to refresh.'}`);
        if (drafts) notes.push(`${drafts} unfinished character${drafts === 1 ? '' : 's'} not counted.`);
        for (const c of counted) {
            if (c.level < 1) notes.push(`${c.name} has no class level, so counts as level 1.`);
            if (c.level > 20) notes.push(`${c.name} is above level 20, so counts as level 20.`);
        }
        const lvl = (c) => Math.min(20, Math.max(1, c.level));
        return { p, chars, typed, levels: [...counted.map(lvl), ...typed.levels], notes: notes.filter(Boolean),
            line: [...counted.map((c) => `${c.name} ${lvl(c)}`), ...typed.levels.map(String)].join(', ') };
    }
    // the sums for the shown encounter. Archived monsters and unnamed new blanks are out; Down ones stay, as this is a planning number
    function diffNow(id = shownEnc) {
        const mons = monsIn(id).filter((c) => !c.archived && String(c.name).trim()), party = partyNow(id);
        const unread = mons.filter((c) => EncDiff.crXp(c.cr) === null);
        return { party, unread, r: EncDiff.rate(encRules(), party.levels, mons.map((c) => EncDiff.crXp(c.cr) || 0)) };
    }
    const n0 = (x) => x.toLocaleString();
    const tierBadge = (t) => `<span class="badge${t.cls ? ' ' + t.cls : ''}">${esc(t.label)}</span>`;
    function diffHTML() {
        const { party, unread, r } = diffNow(), size = party.levels.length, many = `${r.count === 1 ? '1 monster' : r.count + ' monsters'}${size && (size < 3 || size > 5) ? ', party of ' + size : ''}`;
        const head = !r.count ? '<p class="muted mon-diffmsg">No monsters yet</p>'
            : !party.levels.length ? '<p class="muted mon-diffmsg">Pick a party for difficulty</p>'
                : `<p class="mon-difftier">${tierBadge(r.tier)}${r.tier.ours ? ` <small>below ${r.lowest} (this site's word)</small>` : ''}</p>`;
        return `${head}
            <div class="kv"><span>Total XP</span><b>${n0(r.total)}</b>${r.rules === '2014' ? `<span>Adjusted XP</span><b>${n0(r.adjusted)}</b>` : ''}</div>
            ${r.rules === '2014' && r.count ? `<small class="mon-diffhow">${n0(r.total)} XP × ${r.mult} (${many}) = ${n0(r.adjusted)}</small>` : ''}
            ${r.thresholds.length ? `<small class="mon-diffhow">${r.thresholds.map(([t, x]) => `${esc(t)} ${n0(x)}`).join(' · ')}</small>` : ''}
            <small class="mon-diffparty"><b>Party</b> ${esc(party.line) || 'None yet'}</small>
            ${party.notes.map((t) => `<small class="mon-diffnote">${esc(t)}</small>`).join('')}
            ${unread.map((c) => `<small class="mon-diffnote">${esc(c.name)} has a CR that can't be read, so counts as 0 XP.</small>`).join('')}
            <small class="mon-diffhow">${r.rules} rules</small>
            <div class="mon-diffacts"><button type="button" class="btn small" data-act="diffadd">Add monsters</button><button type="button" class="btn small" data-act="diffparty">Party</button>${party.p.camp && cloud ? '<button type="button" class="btn small" data-act="diffrefresh">Refresh</button>' : ''}</div>`;
    }
    // the one line on phones, where the sidebar is hidden; 2.1 can move this element without touching the rest
    function diffLine() {
        const { party, r } = diffNow();
        const xp = `${n0(r.rules === '2014' ? r.adjusted : r.total)} XP`;
        return !r.count ? 'No monsters yet' : !party.levels.length ? `${xp} · Pick a party` : `${tierBadge(r.tier)} ${xp}`;
    }
    // what's outside the sidebar: the phone line, an open details dialog, and following the party's campaign
    function diffOthers() {
        const line = $('.mon-diffbar');
        if (line) line.innerHTML = diffLine();
        if (encMode?.kind === 'diff') $('#mon-encbody .mon-diff').innerHTML = diffHTML();
        if (encMode?.kind === 'party') partyDlgFill();
        if ($('#mon-dlg').open && findTo !== null) findSum();
        partyFollow(partyOf(shownEnc).camp);
    }
    function partyFollow(id) {
        if (!cloud || !window.Live) id = '';
        if (id === partyWatchId) return;
        partyWatch?.close();
        partyWatchId = id;
        partyWatch = id ? Live.watch(id, { load: () => partyLoad(id), onMessage: (m) => { if (m.type === 'campaign' || m.type === 'removed') partyLoad(id); } }) : null;
    }
    async function partyLoad(id) {
        let r;
        try { r = await fetch('party.php?c=' + encodeURIComponent(id), { cache: 'no-store' }); } catch (e) { r = null; }
        const out = r ? await r.json().catch(() => null) : null;
        if (r?.status === 404 && out?.gone) return partyGone(id);
        const was = JSON.stringify([partySeen[id]?.chars, partyLive.has(id)]);
        if (!r?.ok || !out) partyLive.delete(id);
        else {
            partyLive.add(id);
            partySeen[id] = { at: Date.now(), name: String(out.name), chars: out.chars };
            try { localStorage.setItem(PARTY_SEEN, JSON.stringify(partySeen)); } catch (e) { }
        }
        if (JSON.stringify([partySeen[id]?.chars, partyLive.has(id)]) !== was) drawSide();
    }
    // the account says this campaign can't be read any more (deleted, or no longer its DM): the last levels seen become typed ones, so nothing is lost
    function partyGone(id) {
        const left = [db.unsorted?.party, ...db.encs.map((e) => e.party)].filter((p) => p?.camp === id);
        const now = Date.now();
        for (const e of [...db.encs, ...(db.unsorted ? [db.unsorted] : [])]) {
            const p = e.party;
            if (p?.camp !== id) continue;
            const seen = (partySeen[id]?.chars || []).filter((c) => !c.draft && !p.off.includes(c.id)).map((c) => Math.min(20, Math.max(1, c.level)));
            e.party = { camp: '', off: [], levels: [...seen, ...EncDiff.parseLevels(p.levels).levels].join(', '), at: p.at, gone: 1 };
            e.updated = now;
        }
        partyLive.delete(id);
        partyFollow('');
        if (left.length) encSaved();
        drawSide();
    }
    // the party dialog: its fields stay as they are while the list of characters and the reading of the typed levels are filled in
    function partyDlgHTML() {
        const id = shownEnc, p = partyOf(id), pick = camps.some((x) => x.id === p.camp) ? p.camp : '';
        const opts = [['', 'None (type the levels)'], ...camps.map((x) => [x.id, x.name]), ...(p.camp && !pick ? [[p.camp, partySeen[p.camp]?.name || 'Campaign']] : [])];
        return `<h2>Party for ${esc(encName(id))}</h2>
            ${cloud ? `<label class="mon-partyf">Campaign <select class="field" data-party="camp">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === p.camp ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
                : '<p class="muted">Sign in to pick a campaign you run.</p>'}
            <div id="mon-partychars"></div>
            <label class="mon-partyf"><span id="mon-partylab"></span> <input class="field" data-party="levels" value="${esc(p.levels)}" placeholder="5, 5, 4 or 4x5" autocomplete="off" aria-describedby="mon-partyread"></label>
            <p class="muted mon-partyread" id="mon-partyread"></p>
            <label class="mon-partyf">Rules <select class="field" data-party="rules">${[['2014', '2014 rules'], ['2024', '2024 rules']].map(([v, t]) => `<option value="${v}"${v === encRules() ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
            <div class="actions"><button type="button" class="btn" data-enc="close">Close</button></div>`;
    }
    function partyDlgFill() {
        const { p, chars, typed } = partyNow(shownEnc);
        const lab = $('#mon-partylab');
        if (!lab) return;
        lab.textContent = p.camp ? 'Extra levels' : 'Party levels';
        $('#mon-partychars').innerHTML = !p.camp ? '' : chars.length ? `<div class="mon-partylist">${chars.map((c) => `<label><input type="checkbox" data-party-off="${esc(c.id)}"${!c.draft && !p.off.includes(c.id) ? ' checked' : ''}${c.draft ? ' disabled' : ''}> ${esc(c.name)}, ${c.draft ? 'unfinished, not counted' : 'level ' + Math.min(20, Math.max(1, c.level))}</label>`).join('')}</div>`
            : `<p class="muted">${partyLive.has(p.camp) ? 'No characters in this campaign yet.' : "This campaign's party can't be read right now."}</p>`;
        const said = [];
        if (typed.levels.length) said.push('Read as ' + typed.levels.join(', ') + '.');
        if (typed.bad.length) said.push(`Left out ${typed.bad.join(', ')}.`);
        if (typed.moved.length) said.push(`Levels run from 1 to 20, so ${typed.moved.join(', ')} moved to fit.`);
        $('#mon-partyread').textContent = said.join(' ');
    }
    // ---- the fight (ROADMAP 1.4): "Add to fight" beside each monster while one runs in the picked campaign ----
    const fightNow = () => (camp() && window.Fight?.state(camp().id)) || null;
    function fightBtn(c) {
        const f = fightNow();
        if (!f) return '';
        if (!c) return '<p><button type="button" class="btn small" data-act="fightadd">Add whole encounter to fight</button></p>';
        return f.entries.some((e) => e.mon === c.id) ? '<span class="badge">In fight</span>' : `<button type="button" class="btn small" data-act="fightadd" data-id="${esc(c.id)}" aria-label="Add ${esc(c.name || 'Unnamed monster')} to the fight">Add to fight</button>`;
    }
    // each with its own initiative roll (d20 + its initiative) and AC, worked out as the sheet shows them
    async function fightAdd(list, b) {
        const f = fightNow(), have = new Set((f?.entries || []).map((e) => e.mon));
        list = list.filter((m) => m && !have.has(m.id));
        if (!f || !list.length) return;
        b.disabled = true;
        const was = C, items = list.map((m) => {
            C = m;
            const V = vars(), bonus = Math.round(nm(value('fs:init', V).v)), ac = Math.round(nm(value('fx:ac', V).v));
            return { kind: 'monster', mon: m.id, bonus, ac, init: die(20) + bonus };
        });
        C = was;
        // in the account first, so the tracker finds them and their HP
        for (const m of list) {
            if (!m.updated) m.updated = Date.now();
            await fetch('cloud.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).catch(() => { });
        }
        store();
        await Fight.act(camp().id, 'add', { items });
    }
    // a copy with full hit points; like every new monster it starts in Unsorted (ROADMAP 3.1)
    function dupMonster() {
        const c = normalise(JSON.parse(JSON.stringify(C)));
        c.id = uid(); c.enc = ''; c.name = numbered(C.name || 'Unnamed monster'); c.updated = Date.now();
        Object.assign(c.hp, { cur: hpMax(), temp: 0 });
        c.conditions = [];
        const ent = Object.entries(db.chars);
        ent.splice(ent.findIndex(([id]) => id === C.id) + 1, 0, [c.id, c]);
        db.chars = Object.fromEntries(ent);
        switchTo(c);
    }

    // ---- named encounters (ROADMAP 3.1): the picker, New / Manage encounters, and Move / Copy to encounter ----
    // the same picker sits at the top of the sidebar and, on phones, in the bar above the monster picker
    function encPicker(cls) {
        const shown = encOf(shownEnc);
        const opts = [['', 'Unsorted'], ...encsLive().map((e) => [e.id, encName(e.id)]), ...(shown?.archived ? [[shown.id, encName(shown.id) + ' (archived)']] : [])];
        return `<select class="field mon-encpick ${cls}" data-act="encpick" aria-label="Encounter">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === shownEnc ? ' selected' : ''}>${esc(t)}</option>`).join('')}
            <optgroup label="Encounters"><option value="+new">New encounter</option><option value="+manage">Manage encounters</option></optgroup></select>`;
    }
    // show an encounter: its first monster opens unless the open one is already in it (an empty one keeps the open monster)
    function encShow(id) {
        shownEnc = id;
        const first = monsIn(id).find((c) => !c.archived);
        if (bucket(C) !== id && first) return switchTo(first);
        draw();
    }
    function encNew() {
        const names = new Set(db.encs.map((e) => e.name.trim()));
        let n = db.encs.length + 2; // Unsorted counts as the first
        while (names.has(`Encounter ${n}`)) n++;
        const last = partyLast();
        const e = { id: uid(), name: `Encounter ${n}`, order: Math.max(0, ...db.encs.map((x) => x.order + 1)), archived: 0, updated: Date.now(), ...(last ? { party: { ...last, off: [...last.off] } } : {}) };
        db.encs.push(e);
        encSaved();
        shownEnc = e.id; draw();
        encOpen({ kind: 'manage' }, e.id);
    }
    // up or down among the encounters that aren't archived; every one whose place changed is stamped
    function encMove(id, d) {
        const list = encsLive(), i = list.findIndex((e) => e.id === id), j = i + d, now = Date.now();
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        list.forEach((e, k) => { if (e.order !== k) Object.assign(e, { order: k, updated: now }); });
        encSaved();
    }
    // archived, an encounter and its monsters fold away; the monsters themselves aren't touched, so Unarchive brings them back as they were
    function encArchive(e, on) {
        if (!e) return;
        Object.assign(e, { archived: on ? Date.now() : 0, updated: Date.now() });
        encSaved();
        encShow(on ? (shownEnc === e.id ? '' : shownEnc) : e.id);
    }
    // a move is an edit of the monster (newest wins, its fight entry stays); its name changes only if the target has one the same
    function encTo(target, copy) {
        if (copy) {
            const c = normalise(JSON.parse(JSON.stringify(C)));
            Object.assign(c, { id: uid(), enc: target, name: numbered(C.name || 'Unnamed monster', target), updated: Date.now(), rolls: [], hpAt: 0, conditions: [] });
            Object.assign(c.hp, { cur: hpMax(), temp: 0 });
            db.chars[c.id] = c;
            dirty.add(c.id); saveNow(false); draw();
            return toast(`Copied to ${encName(target)} as ${c.name}.`, 'ok');
        }
        const taken = (n) => monsIn(target).some((x) => x !== C && x.name === n);
        if (taken(C.name)) {
            const base = C.name.replace(/\s+\d+$/, '') || 'Unnamed monster';
            let n = 2;
            while (taken(`${base} ${n}`)) n++;
            C.name = `${base} ${n}`;
        }
        C.enc = target; shownEnc = target;
        saveNow(); draw();
        toast(`Moved ${C.name || 'the monster'} to ${encName(target)}.`, 'ok');
    }
    const encDlg = $('#mon-encdlg');
    let encMode = null; // {kind: 'manage'}, {kind: 'to', copy}, {kind: 'party'} or {kind: 'diff'}
    function encDlgHTML() {
        if (encMode.kind === 'party') return partyDlgHTML();
        if (encMode.kind === 'diff') return `<h2>${esc(encName(shownEnc))}</h2><section class="mon-diff" aria-label="Encounter difficulty">${diffHTML()}</section><div class="actions"><button type="button" class="btn" data-enc="close">Close</button></div>`;
        const close = '<button type="button" class="btn" data-enc="close">Close</button>';
        if (encMode.kind === 'to') {
            const to = [['', 'Unsorted'], ...encsLive().map((e) => [e.id, encName(e.id)])].filter(([id]) => encMode.copy || id !== bucket(C));
            const n = (id) => monsIn(id).filter((c) => !c.archived).length;
            return `<h2>${encMode.copy ? 'Copy' : 'Move'} ${esc(C.name || 'Unnamed monster')} to</h2>
                ${to.length ? `<div class="mon-results">${to.map(([id, t]) => `<button type="button" class="mon-hit" data-enc="to" data-id="${esc(id)}"><b>${esc(t)}</b><small>${n(id)} monster${n(id) === 1 ? '' : 's'}</small></button>`).join('')}</div>`
                    : '<p class="note">There are no other encounters yet. Pick New encounter in the encounter list first.</p>'}
                <div class="actions">${close}</div>`;
        }
        const live = encsLive(), gone = db.encs.filter((e) => e.archived);
        const row = (e, i) => `<div class="mon-encrow"><input class="field" data-enc-name="${esc(e.id)}" value="${esc(e.name)}" aria-label="Encounter name">
            <button type="button" class="btn small" data-enc="up" data-id="${esc(e.id)}" aria-label="Move ${esc(encName(e.id))} up" title="Move up"${i ? '' : ' disabled'}>&uarr;</button>
            <button type="button" class="btn small" data-enc="down" data-id="${esc(e.id)}" aria-label="Move ${esc(encName(e.id))} down" title="Move down"${i < live.length - 1 ? '' : ' disabled'}>&darr;</button>
            <button type="button" class="btn small" data-enc="arc" data-id="${esc(e.id)}">Archive</button></div>`;
        return `<h2>Manage encounters</h2><p class="muted">New monsters always start in Unsorted.</p>
            <div class="mon-encrows">${live.map(row).join('') || '<p class="note">No encounters yet.</p>'}</div>
            ${gone.length ? `<h3>Archived encounters</h3><div class="mon-encrows">${gone.map((e) => `<div class="mon-encrow"><span>${esc(encName(e.id))}</span>
                <button type="button" class="btn small" data-enc="unarc" data-id="${esc(e.id)}">Unarchive</button></div>`).join('')}</div>` : ''}
            <div class="actions"><button type="button" class="btn" data-enc="new">New encounter</button>${close}</div>`;
    }
    function encOpen(mode, focus) {
        encMode = mode;
        $('#mon-encbody').innerHTML = encDlgHTML();
        if (!encDlg.open) encDlg.showModal();
        if (mode.kind === 'party') partyDlgFill();
        const f = focus && encDlg.querySelector(`[data-enc-name="${focus}"]`);
        if (f) { f.focus(); f.select(); }
    }
    encDlg.addEventListener('close', () => { encMode = null; draw(); });
    encDlg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-enc]'), k = b?.dataset.enc, id = b?.dataset.id;
        if (!b) return;
        if (k === 'close') return encDlg.close();
        if (k === 'new') return encNew();
        if (k === 'to') { const copy = encMode.copy; encDlg.close(); return encTo(id, copy); }
        if (k === 'up' || k === 'down') encMove(id, k === 'up' ? -1 : 1);
        if (k === 'arc' || k === 'unarc') encArchive(encOf(id), k === 'arc');
        encOpen(encMode);
        encDlg.querySelector(`[data-enc="${k}"][data-id="${id}"]:not(:disabled)`)?.focus();
    });
    encDlg.addEventListener('input', (e) => {
        if (e.target.dataset.party === 'levels') return partySet(shownEnc, { levels: e.target.value });
        const en = e.target.dataset.encName && encOf(e.target.dataset.encName);
        if (!en) return;
        en.name = e.target.value; en.updated = Date.now();
        encSaved();
    });

    encDlg.addEventListener('change', (e) => {
        const t = e.target, k = t.dataset.party;
        if (k === 'camp') partySet(shownEnc, { camp: t.value, off: [] });
        else if (k === 'rules') { setPref('encounter-rules', t.value); drawSide(); }
        else if (t.dataset.partyOff) {
            const off = new Set(partyOf(shownEnc).off);
            off[t.checked ? 'delete' : 'add'](t.dataset.partyOff);
            partySet(shownEnc, { off: [...off] });
        }
    });

    let monIndex = null, findTo = null; // findTo: the encounter "Add monsters" fills; null for the plain Import monster search
    // Import monster (under Edit) adds one to Unsorted and opens it; Add monsters (ROADMAP 3.2) stays open and fills the shown encounter
    async function openFind(to = null) {
        open.manage = false;
        findTo = to;
        $('#mon-dlg h2').textContent = to === null ? 'Import a monster' : `Add monsters to ${encName(to)}`;
        $('#mon-nwrap').hidden = to === null;
        Object.assign($('#mon-n'), { value: 1 });
        $('#mon-added').textContent = '';
        if (to !== null) findSum();
        $('#mon-sum').hidden = to === null;
        $('#mon-dlg').showModal(); $('#mon-q').focus();
        Homebrew.ready().then(() => { if (monIndex && $('#mon-dlg').open) monSearch(); });
        if (monIndex) return monSearch();
        try {
            const r = await fetch('monsters.json');
            if (!r.ok) throw new Error();
            monIndex = await r.json();
            monSearch();
        } catch (err) { Object.assign($('#mon-status'), { className: 'err', textContent: "Couldn't load the monster list. Try again in a minute." }); }
    }
    const findSum = () => { $('#mon-sumline').innerHTML = diffLine(); };
    // the search list: names that start with the search first, then names that contain it, within the CR and rules filters
    function monHits() {
        const q = $('#mon-q').value.trim().toLowerCase(), lo = EncDiff.crValue($('#mon-crlo').value), hi = EncDiff.crValue($('#mon-crhi').value), rules = $('#mon-rules').value;
        // homebrew comes first and shows under either rules version
        const hb = Homebrew.of(['monster']).map((x) => ['hb:' + x.id, x.name, +x.cr || 0, [x.size, x.type].filter(Boolean).join(' '), 'hb', x.size]);
        const all = [...hb, ...monIndex.list].filter((x) => (lo === null || x[2] >= lo) && (hi === null || x[2] <= hi) && (x[4] === 'hb' || !rules || (x[4] === 'srd-2024') === (rules === '2024')));
        return q ? [...all.filter((x) => x[1].toLowerCase().startsWith(q)), ...all.filter((x) => !x[1].toLowerCase().startsWith(q) && x[1].toLowerCase().includes(q))] : all;
    }
    // at most 100 shown
    function monSearch() {
        const st = $('#mon-status'), hits = monHits();
        st.className = hits.length ? 'muted' : 'note';
        st.textContent = !hits.length ? 'No monsters match that name.' : hits.length > 100 ? `${hits.length.toLocaleString()} monsters. Type to narrow them down.` : `${hits.length} monster${hits.length === 1 ? '' : 's'}`;
        $('#mon-results').innerHTML = hits.slice(0, 100).map(([key, name, cr, type, src]) => `<button type="button" class="mon-hit" data-mon="${esc(key)}">
            <b>${esc(name)}${src === 'srd-2024' ? ' <span class="badge b">2024</span>' : src === 'hb' ? ' <span class="badge p">Homebrew</span>' : ''}</b><small>CR ${esc(crText(cr))} ${esc(type)} · ${src === 'hb' ? 'Homebrew' : esc(monIndex.sources[src]?.title || src)}</small></button>`).join('');
    }
    // The one way monsters join an encounter: n copies of a monster-list entry into encounter enc ('' is Unsorted), each its own
    // creature, numbered within that encounter. open: show the last one added; otherwise the open monster stays, unless it was the
    // empty one a first visit starts with, which is replaced rather than kept. Returns the last one added; throws if it can't be fetched.
    async function addMonsters(key, n, enc, open) {
        if (!monIndex) monIndex = await (await fetch('monsters.json')).json();
        const hb = key.startsWith('hb:');
        if (hb) await Homebrew.ready();
        const x = hb ? Homebrew.find(key.slice(3)) : null;
        if (hb && !x) throw new Error(HB_GONE);
        let j = null;
        if (!hb) { const r = await fetch('monsters.php?i=' + encodeURIComponent(key)); j = await r.json(); if (!r.ok) throw new Error(j.error); }
        const empty = Object.keys(db.chars).length === 1 && !C.name.trim() && !C.race.trim();
        let c;
        for (let k = 0; k < n; k++) {
            c = hb ? hbFromEntry(x) : normalise(fromStatBlock(j, monIndex.sources));
            c.enc = enc; c.name = numbered(c.name, enc); c.updated = Date.now();
            db.chars[c.id] = c;
            dirty.add(c.id);
        }
        if (empty) delete db.chars[C.id];
        if (open || empty) switchTo(c);
        else { store(); clearTimeout(backupTimer); backupTimer = setTimeout(flushBackups, 4000); draw(); } // not saveNow: the open monster may be archived
        return c;
    }
    async function takeMonster(b) {
        const to = findTo, n = to === null ? 1 : Math.max(1, Math.floor(+$('#mon-n').value) || 1), was = b.querySelector('b').textContent;
        b.disabled = true; b.querySelector('small').textContent = 'Adding...';
        try {
            const c = await addMonsters(b.dataset.mon, n, to === null ? '' : to, to === null);
            if (to === null) { $('#mon-dlg').close(); return toast(`Added ${c.name}.`, 'ok'); }
            $('#mon-added').textContent = `Added ${n > 1 ? n + ' × ' : ''}${was} to ${encName(to)}.`;
            monSearch();
        } catch (err) { toast(err.message || "Couldn't reach the monster list. Try again in a minute.", 'err'); monSearch(); }
    }
    $('#mon-q').addEventListener('input', debounce(() => monIndex && monSearch(), 80));
    for (const id of ['#mon-crlo', '#mon-crhi', '#mon-rules']) $(id).addEventListener('input', debounce(() => monIndex && monSearch(), 80));
    $('#mon-dlg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mon]');
        if (b) takeMonster(b);
        else if (e.target.closest('[data-mon-close]')) $('#mon-dlg').close();
    });

    // ---- homebrew monsters (ROADMAP 5.2): "Save as homebrew" keeps the stat block, without play state or notes; every monster added from one is its
    // own copy with its source in c.hbsrc, and updating is the player's choice. Rows with their own source (a homebrew spell) update the same way. ----
    const HB_GONE = "That homebrew monster isn't available any more.";
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const HB_SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Titanic'];
    const HB_CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
    // the stat block alone: what's the same for every copy, so comparing two says whether anything real changed
    function hbDefinition(c0) {
        const c = clone(c0);
        for (const k of ['id', 'name', 'updated', 'archived', 'enc', 'rolls', 'conditions', 'exhaustion', 'insp', 'hpAt', 'view', 'hbsrc', 'cmp']) delete c[k];
        c.hp = { base: c.hp.base, mod: c.hp.mod };
        for (const k of c.classes) delete k.hdUsed;
        c.panels = c.panels.filter((p) => p.type !== 'notes').map((p) => {
            for (const k of ['sub', 'open', 'ok', 'bad', 'on']) delete p[k];
            for (const r of p.rows || []) { delete r.used; delete r.cur; delete r.prep; delete r.hbsrc; for (const l of r.levels || []) delete l.used; }
            for (const s of p.slots || []) delete s.used;
            if (p.sp) delete p.sp.used, delete p.sp.cur;
            return p;
        });
        return c;
    }
    const hbSumOf = (c) => Homebrew.sum(hbDefinition(c));
    // a copy for the entry: fresh play state, no notes
    function hbFresh(c0) {
        const c = clone(c0), V = vars();
        Object.assign(c, { rolls: [], conditions: [], exhaustion: 0, insp: false, hpAt: 0, enc: '', archived: 0, hbsrc: null, view: blank().view });
        c.hp = { ...c.hp, temp: 0, cur: nm(c.hp.base) + nm(c.hp.mod) };
        for (const k of c.classes) k.hdUsed = 0;
        for (const p of c.panels) {
            if (p.type === 'notes') { p.notes = []; p.open = ''; }
            if (p.type === 'combat') Object.assign(p, { ok: 0, bad: 0 });
            for (const r of p.rows || []) { if ('used' in r) r.used = 0; if (p.type === 'trackers') r.cur = maxOf(r.max, V); for (const l of r.levels || []) l.used = 0; }
            for (const s of p.slots || []) s.used = 0;
            if (p.sp) Object.assign(p.sp, { used: 0, cur: nm(p.sp.max) });
        }
        return c;
    }
    // the numbers worked out now, for the Compendium to show
    function hbBlock() {
        const V = vars(), P = (t) => C.panels.find((p) => p.type === t), val = (f) => { const r = ev(f, V); return r.err ? String(f) : r.v; };
        const note = /\[([^\]]*)\]/.exec(C.ac), hd = C.classes[0] && !C.classes[0].name && nm(C.classes[0].level) > 1 ? ` (${nm(C.classes[0].level)}d${C.classes[0].die})` : '';
        const actText = (r) => r.desc || [r.mode === 'hit' ? sg(val(r.hit)) + ' to hit' : r.mode === 'save' ? `DC ${val(r.dc)} ${r.save} save` : '', dmgText(r.dmg, V)].filter(Boolean).join('. ');
        return { ac: `${val(C.ac)}${note ? ` (${note[1]})` : ''}`, hp: hpMax() + hd, speed: C.speeds.map((s) => (s.type === 'Walk' ? '' : s.type + ' ') + s.ft + ' ft.').join(', '),
            abilities: C.abilities.map((a) => ({ key: a.key, score: nm(a.score) })), saves: C.abilities.filter((a) => a.save).map((a) => `${a.key} ${sg(saveT(a, V).v)}`).join(', '),
            skills: C.skills.filter((s) => s.p || String(s.b).trim()).map((s) => `${s.name} ${sg(profT(s.ab, s.p, s.b, V).v)}`).join(', '), vul: C.vul, res: C.res, imm: C.imm, senses: C.senses, langs: C.profs.langs.join(', '),
            traits: (P('list')?.rows || []).map((r) => ({ name: r.name, text: r.text })), actions: (P('attacks')?.rows || []).map((r) => ({ name: r.name, time: r.time, text: actText(r) })),
            spells: (P('spells')?.rows || []).map((r) => r.name).filter(Boolean) };
    }
    const hbOwn = () => (C.hbsrc ? Homebrew.mine().find((e) => e.id === C.hbsrc.id && !e.archived) : null);
    function hbSaveDlg() {
        const [, size = '', type = ''] = /^(?:(Tiny|Small|Medium|Large|Huge|Gargantuan|Titanic)\b\s*)?(.*)$/i.exec(String(C.race).trim()) || [], own = hbOwn(), cr = EncDiff.crValue(C.cr) ?? 0;
        const opts = (list, cur) => list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('');
        const gone = C.hbsrc && !Homebrew.find(C.hbsrc.id) ? `<p class="muted">From ${esc(C.hbsrc.by ? C.hbsrc.by + "'s" : 'your')} homebrew. No longer available to update.</p>` : '';
        return `<h2>Save as homebrew</h2>${gone}
            <div class="form"><label>Name <input class="field" id="hbm-name" value="${esc(String(own ? own.name : C.name).replace(/\s+\d+$/, ''))}" autocomplete="off"><small hidden></small></label>
            <label>Size <select class="field" id="hbm-size">${opts([['', 'Not set'], ...HB_SIZES.map((s) => [s, s])], HB_SIZES.find((s) => s.toLowerCase() === size.toLowerCase()) || '')}</select></label>
            <label>Type <input class="field" id="hbm-type" value="${esc(type)}" autocomplete="off"></label>
            <label>Challenge rating <select class="field" id="hbm-cr">${opts(HB_CRS.map((n) => [n, crText(n)]), HB_CRS.includes(cr) ? cr : 0)}</select></label></div>
            <p class="muted hb-hint">Its notes stay out. Hit points go back to full, and conditions, rolls and uses spent are cleared in the saved copy. Share it from its entry in the Compendium.</p>
            <div class="actions">${own ? `<button type="button" class="btn primary" data-act="hbsavego">Update ${esc(own.name)}</button><button type="button" class="btn" data-act="hbsavego" data-new="1">Save as a new one</button>` : '<button type="button" class="btn primary" data-act="hbsavego" data-new="1">Save as homebrew</button>'}<button type="button" class="btn" data-act="close">Cancel</button></div>`;
    }
    async function hbSaveGo(asNew) {
        const name = $('#hbm-name').value.trim();
        if (!name) { $('#hbm-name').setAttribute('aria-invalid', 'true'); Object.assign($('#hbm-name').parentElement.querySelector('small'), { textContent: 'Give it a name.', hidden: false }); return $('#hbm-name').focus(); }
        const size = $('#hbm-size').value, type = $('#hbm-type').value.trim(), cr = +$('#hbm-cr').value, own = asNew ? null : hbOwn();
        C.race = [size, type].filter(Boolean).join(' '); C.cr = crText(cr);
        const sheet = hbFresh(C);
        for (const k of ['id', 'updated']) delete sheet[k];
        sheet.name = name;
        const source = C.panels.flatMap((p) => p.notes || []).find((n) => n.title === 'Source' && n.group === 'Monster');
        const e = { ...(own || { id: Homebrew.id(), kind: 'monster' }), name, size, type, cr, sheet, block: hbBlock() };
        if (source) e.credit = source.body;
        try { await Homebrew.save(e); } catch (err) { return toast("Couldn't save it: this browser's storage is full or blocked.", 'err'); }
        C.hbsrc = { id: e.id, by: '', at: e.updated, sum: hbSumOf(C) };
        saveNow();
        dlg.close();
        toast(Homebrew.full() ? 'Saved to your account. This browser is full, so it only has a copy for this visit.' : `Saved ${name} as homebrew. It's in the Compendium's Monsters tab.`, 'ok');
    }
    // one more monster from an entry: its own copy, all of it
    function hbFromEntry(x) {
        const c = normalise(clone(x.sheet));
        c.id = uid(); c.name = x.name; c.updated = Date.now(); c.hbsrc = null;
        if (x.credit) { const np = c.panels.find((p) => p.type === 'notes'); if (np) np.notes.push(Object.assign(ROW.note(), { title: 'Source', group: 'Monster', body: String(x.credit) })); }
        c.hbsrc = { id: x.id, by: x.by || '', at: +x.updated || 0, sum: hbSumOf(c) };
        return c;
    }
    const hbMonNewer = () => { if (!C.hbsrc) return null; const x = Homebrew.find(C.hbsrc.id); return x && x.updated > C.hbsrc.at ? x : null; };
    const hbMonLines = (c) => { const P = (t) => (c.panels.find((p) => p.type === t)?.rows || []).map((r) => r.name).join(', ');
        return [['Type', c.race], ['Challenge rating', c.cr], ['Armour class', c.ac], ['Hit points', nm(c.hp.base) + nm(c.hp.mod)], ['Speed', c.speeds.map((s) => s.type + ' ' + s.ft).join(', ')], ['Ability scores', c.abilities.map((a) => a.key + ' ' + a.score).join(', ')],
            ['Actions', P('attacks')], ['Traits', P('list')], ['Spells', P('spells')], ['Resources', P('trackers')], ['Resistances', c.res], ['Immunities', c.imm], ['Vulnerabilities', c.vul], ['Senses', c.senses], ['Languages', c.profs.langs.join(', ')]].map(([a, b]) => [a, String(b)]); };
    function hbMonDlg() {
        const x = hbMonNewer();
        if (!x) return '<h2>Update</h2><p>That homebrew is no longer available.</p><div class="actions"><button type="button" class="btn" data-act="close">Close</button></div>';
        const was = hbMonLines(C), now = hbMonLines(hbFromEntry(x)), list = now.map((l, i) => [l[0], was[i][1], l[1]]).filter((l) => l[1] !== l[2]);
        return `<h2>Update ${esc(C.name || 'this monster')}</h2>
            ${hbSumOf(C) !== C.hbsrc.sum ? "<p class=\"note\">You've changed this monster by hand. Updating replaces your changes to its stat block.</p>" : ''}
            ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Field</th><th>Now</th><th>After the update</th></tr></thead><tbody>${list.map(([f, a, b]) => `<tr><td>${esc(f)}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Only its text changes.</p>'}
            <p class="muted hb-hint">Its hit points, conditions, notes, rolls and uses spent stay as they are.</p>
            <div class="actions"><button type="button" class="btn primary" data-act="hbmongo">Update</button><button type="button" class="btn" data-act="close">Cancel</button></div>`;
    }
    function hbMonApply() {
        const x = hbMonNewer(), old = C, before = clone(C);
        dlg.close();
        if (!x) return;
        const n = hbFromEntry(x), num = /\s+(\d+)$/.exec(old.name);
        Object.assign(n, { id: old.id, enc: old.enc, name: x.name + (num ? num[0] : ''), rolls: old.rolls, conditions: old.conditions, exhaustion: old.exhaustion, insp: old.insp, hpAt: old.hpAt, view: old.view, updated: Date.now() });
        n.hp = { ...n.hp, cur: old.hp.cur, temp: old.hp.temp };
        for (const p of n.panels) {
            const q = old.panels.find((o) => o.type === p.type);
            if (!q) continue;
            if (p.type === 'notes') Object.assign(p, { notes: q.notes, open: q.open });
            if (p.type === 'combat') Object.assign(p, { ok: q.ok, bad: q.bad });
            for (const r of p.rows || []) { const o = (q.rows || []).find((y) => y.id === r.id); if (o) for (const k of ['used', 'cur', 'prep']) if (k in o) r[k] = o[k]; }
            (p.slots || []).forEach((s, i) => { if (q.slots?.[i]) s.used = q.slots[i].used; });
        }
        n.classes.forEach((k, i) => { if (old.classes[i]) k.hdUsed = old.classes[i].hdUsed; });
        C = n; db.chars[n.id] = n;
        saveNow(); draw();
        offerUndo(`Updated ${n.name}`, () => { const b = normalise(before); b.updated = Date.now(); switchTo(b); toast('Update undone.', 'ok'); });
    }
    // a row that came from homebrew: as on the player sheet
    const hbNewer = (r) => { if (!r.hbsrc) return null; const x = Homebrew.find(r.hbsrc.id); return x && x.updated > r.hbsrc.at ? x : null; };
    const hbBadge = (r) => (hbNewer(r) ? ' <span class="badge p">Update available</span>' : '');
    const hbRows = (id) => C.panels.flatMap((P) => (P.rows || []).filter((r) => r.hbsrc && r.hbsrc.id === id).map((r) => [P, r]));
    function hbInfoAdd(p) {
        const r = get(p);
        if (!r.hbsrc) return;
        const who = r.hbsrc.by ? `${r.hbsrc.by}'s` : 'your', note = Homebrew.find(r.hbsrc.id) ? '' : r.hbsrc.by && !Homebrew.signedIn() ? ' Sign in to check for updates.' : ' No longer available to update.';
        $('#hb-drawer-body').insertAdjacentHTML('beforeend', `<div class="hb-hbsrc"><p class="muted"><span class="badge p">Homebrew</span> From ${esc(who)} homebrew.${note}</p>
            ${hbNewer(r) ? `<button type="button" class="btn small" data-act="hbup" data-p="${p}">Update</button>` : ''}</div>`);
    }
    function hbUpDlg({ p }) {
        const r = get(p), x = Homebrew.find(r.hbsrc.id);
        if (!x) return '<h2>Update</h2><p>That homebrew is no longer available.</p><div class="actions"><button type="button" class="btn" data-act="close">Close</button></div>';
        const parts = Homebrew.parts(x, C), rows = hbRows(x.id), seen = new Set(), cut = (t) => (t.length > 120 ? t.slice(0, 120) + '...' : t);
        const list = rows.flatMap(([P, row]) => { const part = parts.find((q) => q.panel === P.type); return part ? Homebrew.changes(row, part) : []; }).filter((c) => { const k = c.join('|'); return !seen.has(k) && seen.add(k); });
        return `<h2>Update ${esc(r.name || 'this row')}</h2>
            ${rows.some(([, row]) => Homebrew.edited(row)) ? "<p class=\"note\">You've changed this by hand. Updating replaces your changes.</p>" : ''}
            ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Field</th><th>Now</th><th>After the update</th></tr></thead><tbody>${list.map(([f, a, b]) => `<tr><td>${esc(f)}</td><td>${esc(cut(a))}</td><td>${esc(cut(b))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing on this row changes.</p>'}
            <p class="muted hb-hint">Prepared and uses spent stay as they are.</p>
            <div class="actions"><button type="button" class="btn primary" data-act="hbupgo" data-p="${p}">Update</button><button type="button" class="btn" data-act="close">Cancel</button></div>`;
    }
    function hbUpdate(p) {
        const r = get(p), x = Homebrew.find(r.hbsrc.id), before = clone(C), name = r.name;
        dlg.close(); closeDrawer();
        if (!x) return;
        const parts = Homebrew.parts(x, C);
        for (const [P, row] of hbRows(x.id)) { const part = parts.find((q) => q.panel === P.type); if (part) Homebrew.apply(row, part); else row.hbsrc.at = x.updated; }
        saveNow(); draw();
        offerUndo(`Updated ${name || 'the row'}`, () => { const b = normalise(before); b.updated = Date.now(); switchTo(b); toast('Update undone.', 'ok'); });
    }
    // from the Compendium: ?hb=new, edit:<id> (your entry, then Save as homebrew updates it), copy:<id> (someone's entry, as your own), key:<monster key>
    async function hbFromPage() {
        const q = new URLSearchParams(location.search).get('hb');
        if (!q) return;
        history.replaceState(null, '', location.pathname);
        const hint = 'Press Edit, then Save as homebrew, when it\'s ready.', [how, ...rest] = q.split(':'), arg = rest.join(':');
        if (how === 'new') { switchTo(Object.assign(blank(), { name: numbered('New monster'), updated: Date.now() })); return toast(hint, 'ok', 8000); }
        try {
            if (how === 'key') { await addMonsters(arg, 1, '', true); return toast(hint, 'ok', 8000); }
            await Homebrew.ready();
            const x = Homebrew.find(arg);
            if (!x) return toast(HB_GONE, 'err');
            if (how === 'edit') {
                // the copy already open for this version, rather than one more every time
                const have = Object.values(db.chars).find((c) => !c.archived && c.hbsrc?.id === x.id && c.hbsrc.at === x.updated && c.name === x.name);
                if (have) return switchTo(have);
            }
            const c = hbFromEntry(x);
            if (how === 'copy') c.hbsrc = null;
            c.name = numbered(c.name, ''); c.updated = Date.now();
            switchTo(c);
            toast(hint, 'ok', 8000);
        } catch (err) { toast(err.message || "Couldn't reach the monster list. Try again in a minute.", 'err'); }
    }
    // switching isn't an edit, so it doesn't touch either monster's updated time
    function switchTo(c) { saveNow(false); C = c; db.chars[c.id] = c; db.cur = c.id; shownEnc = bucket(c); openRows.clear(); saveNow(false); draw(); }

    function download(name, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // art is cropped to a 480 px square (the art box is square) so a few characters fit in localStorage (about 5 MB)
    const CROP = 480;
    async function loadArt(file) {
        let img;
        try { img = await createImageBitmap(file); } catch (e) { return toast("Couldn't read that image. Try a PNG or JPEG.", 'err'); }
        showDlg({ kind: 'crop', img, z: 1, cx: img.width / 2, cy: img.height / 2 });
        const cv = $('#hb-crop');
        let drag = null;
        cv.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
        cv.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const k = CROP / cv.clientWidth / cropScale();
            dlgMode.cx -= (e.clientX - drag[0]) * k; dlgMode.cy -= (e.clientY - drag[1]) * k;
            drag = [e.clientX, e.clientY]; drawCrop();
        });
        cv.addEventListener('pointerup', () => { drag = null; });
        cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(dlgMode.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
        $('#hb-crop-z').addEventListener('input', (e) => setZoom(+e.target.value));
        drawCrop();
    }
    const cropScale = () => CROP / Math.min(dlgMode.img.width, dlgMode.img.height) * dlgMode.z;
    function setZoom(z) { dlgMode.z = Math.min(4, Math.max(1, z)); $('#hb-crop-z').value = dlgMode.z; drawCrop(); }
    function drawCrop() {
        const m = dlgMode, s = cropScale(), half = CROP / 2 / s;
        // keep the square inside the picture
        m.cx = Math.min(m.img.width - half, Math.max(half, m.cx)); m.cy = Math.min(m.img.height - half, Math.max(half, m.cy));
        $('#hb-crop').getContext('2d').drawImage(m.img, CROP / 2 - m.cx * s, CROP / 2 - m.cy * s, m.img.width * s, m.img.height * s);
    }
    const cropDlg = () => `<h2>Crop art</h2>
        <p class="muted hb-hint">Drag the picture to move it. Zoom with the slider or the mouse wheel.</p>
        <canvas class="hb-crop" id="hb-crop" width="${CROP}" height="${CROP}"></canvas>
        <label class="hb-lbl hb-wide">Zoom <input type="range" id="hb-crop-z" min="1" max="4" step="0.01" value="1"></label>
        <div class="actions"><button type="button" class="btn primary" data-act="cropsave">Save art</button><button type="button" class="btn" data-act="close">Cancel</button></div>`;

    // the coin box: a button's sign replaces any typed one; Enter keeps what's typed (no sign adds)
    function coinApply(input, sign) {
        const v = input.value.trim(), k = input.dataset.p;
        if (!v) return input.focus();
        try { const r = window.hbCoins(get(k), sign ? sign + v.replace(/^[+-]\s*/, '') : v); Object.assign(get(k), r.purse); saveNow(); draw(); toast(r.text, 'ok'); $('.hb-coinin')?.focus(); }
        catch (err) { toast(err.message, 'err'); }
    }
    function addTag(input) {
        const v = input.value.trim(), list = get(input.dataset.p);
        input.value = '';
        if (v && !list.includes(v)) { list.push(v); saveNow(); draw(); }
    }

    // ---- undo: a delete can be taken back for 15 seconds; a later save (any other edit) drops it so undo never wipes newer work ----
    const undoBox = document.createElement('div');
    undoBox.className = 'hb-undo'; undoBox.hidden = true;
    function dropUndo() { undoSnap = null; clearTimeout(undoTimer); undoBox.hidden = true; }
    function snap(b, label) {
        undoSnap = { db: JSON.stringify(db), cur: C.id, at: Date.now() };
        const what = (label || b.getAttribute('aria-label') || b.textContent || 'Deleted').trim().replace(/^Remove\b/, 'Removed').replace(/^Delete\b/, 'Deleted');
        undoBox.innerHTML = `<span>${esc(what)}</span><button type="button" class="btn small">Undo</button>`;
        let box = $('.toasts');
        if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
        box.appendChild(undoBox); undoBox.hidden = false;
        clearTimeout(undoTimer); undoTimer = setTimeout(dropUndo, 15000);
    }
    // ---- a 15-second Undo for archiving (ROADMAP 0.5), beside the delete Undo above; returns a function that drops it ----
    function offerUndo(text, fn) {
        const el = document.createElement('div');
        el.className = 'hb-undo';
        el.innerHTML = `<span>${esc(text)}</span><button type="button" class="btn small">Undo</button>`;
        let box = $('.toasts');
        if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
        box.appendChild(el);
        const t = setTimeout(() => el.remove(), 15000), drop = () => { clearTimeout(t); el.remove(); };
        el.querySelector('button').addEventListener('click', () => { drop(); fn(); });
        return drop;
    }
    // ---- archive (ROADMAP 0.5): players never delete a monster. It keeps everything and gets an "archived" time, which syncs
    // like any edit (newest wins); archived, it's read-only and waits under Archived in the encounter list.
    let arcUndo = null;
    function setArchived(on) {
        if (!on && arcUndo) arcUndo();
        C.archived = on ? Date.now() : 0; C.updated = Date.now();
        store();
        dirty.add(C.id); flushBackups();
        open.manage = false;
        draw();
        if (on) arcUndo = offerUndo(`Archived ${C.name || 'the monster'}`, () => { arcUndo = null; setArchived(false); });
    }
    undoBox.addEventListener('click', (e) => {
        if (!e.target.closest('button') || !undoSnap) return;
        const s = undoSnap;
        dropUndo(); db = Object.assign(JSON.parse(s.db), { encs: db.encs, unsorted: db.unsorted }); // the encounter list isn't part of a delete's Undo
        switchTo(db.chars[s.cur] || Object.values(db.chars)[0] || blank());
        toast('Restored.', 'ok');
    });

    // what an archived monster still does: look, roll, open things, and come back
    const VIEW_ACTS = new Set(['phrow', 'advnext', 'dieless', 'skill', 'attr', 'sense', 'rinfo', 'roll', 'roll2', 'adv', 'rollx', 'tray', 'rollto', 'logtab', 'die', 'dieclear', 'coin', 'dieroll',
        'info', 'dclose', 'more', 'manage', 'tab', 'toggle', 'nopen', 'ngo', 'sub', 'close', 'export', 'new', 'import', 'find', 'side', 'unarchive', 'monunarc', 'versions', 'fightadd', 'encshow', 'encunarc', 'diffadd', 'diffparty', 'diffrefresh', 'diffopen']); // fightadd: other monsters into the fight

    // ---- events ----
    const main = $('.hb');
    // one column in the bottom-left corner: the latest roll above the tray and its button
    main.insertAdjacentHTML('beforeend', '<div class="hb-dice"><div id="hb-rolls" aria-live="polite"></div><div class="hb-trayslot" id="hb-dice"></div></div>');
    main.insertAdjacentHTML('beforeend', '<aside class="hb-log" id="hb-log" aria-label="Roll log" hidden></aside>');
    addEventListener('resize', () => drawLog());
    main.addEventListener('input', (e) => {
        const el = e.target;
        if (C.archived && el.id !== 'hb-amt') return; // archived: nothing typed is kept
        if (el.dataset.b && dlgMode && dlgMode.parts) {
            const [n, field] = el.dataset.b.split('.'), part = dlgMode.parts[n];
            part[field] = el.value;
            if (field === 'k') { part.v = part.k === 'num' ? '0' : part.k === 'ab' ? C.abilities[0].key : ''; part.cap = ''; }
            set(dlgMode.p, buildParts(dlgMode.parts));
            const raw = dlgBody.querySelector(`[data-k="${dlgMode.p}"]`);
            if (raw) raw.value = get(dlgMode.p);
            if (field === 'k') $('#hb-parts').innerHTML = partsHTML(dlgMode.parts);
            save(); return refresh();
        }
        if (el.classList.contains('hb-nq')) {
            noteQ = el.value.trim().toLowerCase();
            // archived notes show only as search results
            for (const it of el.closest('.hb-panel').querySelectorAll('.hb-nitem')) it.hidden = it.classList.contains('hb-narc') ? !noteQ || !it.dataset.s.includes(noteQ) : !!noteQ && !it.dataset.s.includes(noteQ);
            return;
        }
        const k = el.dataset.k;
        if (!k) return;
        set(k, el.type === 'checkbox' ? el.checked : el.value);
        if (el.dataset.multi) multiList(el);
        // the same field can show twice (a pinned note and the Notes tab); keep both in step
        for (const o of document.querySelectorAll(`.hb [data-k="${k}"]`)) if (o !== el && o.type !== 'checkbox') o.value = el.value;
        if (/\.notes\.\d+\.(title|body|group)$/.test(k)) get(k.replace(/\.\w+$/, '')).updated = Date.now();
        save(); refresh();
        if (dlgMode && dlgMode.parts && k === dlgMode.p) { dlgMode.parts = parseParts(el.value); $('#hb-parts').innerHTML = partsHTML(dlgMode.parts); }
        if (/\.att$/.test(k) && el.value === 'yes') {
            const P = panelOf(k), n = P.rows.filter((r) => r.att === 'yes').length;
            if (n > nm(P.attMax)) toast(`You're attuned to ${n} items but have ${nm(P.attMax)} attunement slots.`, 'note');
        }
        if (k === 'view.all' || k === 'view.prep' || k === 'view.hpScroll' || k === 'view.noRoll' || k === 'view.noTray' || /^panels\.\d+\.on$/.test(k) || /\.(mode|cat|k|grp|fxf)$/.test(k) || /^panels\.\d+\.sort$/.test(k) || (el.type === 'checkbox' && /\.prep$/.test(k) && panelOf(k).sub === 'prep')) draw();
    });
    main.addEventListener('change', (e) => {
        const el = e.target, k = el.dataset.k || '';
        if (el.dataset.act === 'tablepick') { setTable(el.value); tableWatch(); drawLog(); return drawTray(); }
        if (el.dataset.act === 'pick') return switchTo(db.chars[el.value]);
        if (el.dataset.act === 'encpick') {
            const v = el.value;
            el.value = shownEnc;
            return v === '+new' ? encNew() : v === '+manage' ? encOpen({ kind: 'manage' }) : encShow(v);
        }
        if (C.archived) return;
        if (el.classList.contains('hb-tagin')) return addTag(el);
        if (el.classList.contains('hb-gname')) {
            const P = get(el.dataset.p), from = el.dataset.g, to = el.value.trim();
            if (!to || to === from) return;
            for (const n of P.notes) if (String(n.group).trim() === from) n.group = to;
            P.sub = 'g:' + to;
            saveNow(); return draw();
        }
        if (el.classList.contains('hb-tname')) {
            const P = get(el.dataset.p), from = el.dataset.g, to = el.value.trim();
            if (!to || to === from) return;
            P.tabs = uniq(P.tabs.map((t) => (t === from ? to : t)).concat(to));
            for (const r of P.rows) if (r.group === from) r.group = to;
            if (P.sub === 't:' + from) P.sub = 't:' + to;
            saveNow(); return draw();
        }
        if (/\.notes\.\d+\.group$/.test(k) || /^panels\.\d+\.rows\.\d+\.(uses|max|group)$/.test(k) || /\.(levels\.\d+|slots\.\d+|sp)\.max$/.test(k) || /\.flex\.\d+$/.test(k)) { saveNow(); return draw(); }
        if (/^classes\.\d+\.name$/.test(k)) { const d = HIT_DIE[el.value.trim().toLowerCase()]; if (d) set(k.replace(/name$/, 'die'), d); }
        if (/^panels\.\d+\.rows\.\d+\.name$/.test(k) && el.value.trim() && hbPick(k, el.value)) return;
        if (/^panels\.\d+\.rows\.\d+\.name$/.test(k) && panelOf(k).type === 'spells' && el.value.trim()) srdFill(k.replace(/\.name$/, ''));
        if (/^panels\.\d+\.rows\.\d+\.name$/.test(k) && panelOf(k).type === 'items' && el.value.trim()) eqFill(k.replace(/\.name$/, ''));
        if (/^panels\.\d+\.(rows|meta)\.\d+\.name$/.test(k) && rowFill(k)) return;
        if (/\.(time|lvl)$/.test(k) || /\.cost\.(what|amt)$/.test(k) || /^classes\.\d+\.(name|level|die)$/.test(k) || /^(lists\.|condList|exhaustion)/.test(k) || /^speeds\./.test(k) && /\.type$/.test(k)) return dlg.open ? null : draw();
        // a new name shows in the character list; only its options are redrawn, so typing in the bar isn't interrupted
        if ((k === 'name' || /\.(name|key|title)$/.test(k)) && !dlg.open) $('.hb-pick').innerHTML = pickOpts();
    });
    main.addEventListener('focusin', (e) => { if (e.target.getAttribute('list') === 'hb-dl-srd') loadSrdList(); if (e.target.getAttribute('list') === 'hb-dl-gear') loadEqList(); if (e.target.dataset.multi) multiList(e.target); });
    main.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('hb-tagin')) { e.preventDefault(); addTag(e.target); }
        if (e.key === 'Enter' && e.target.classList.contains('hb-coinin') && e.target.value.trim()) { e.preventDefault(); coinApply(e.target, ''); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open') && !dlg.open) closeDrawer(); });
    main.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = nm($('#hb-amt').value), amt = Math.abs(v);
        let how = e.submitter && e.submitter.value;
        if (how === 'auto') how = v > 0 ? 'heal' : 'dmg';
        if (!amt && how !== 'temp') return $('#hb-amt').focus();
        if (how === 'temp' && amt < nm(C.hp.temp)) toast(`Temp HP doesn't stack, so you keep ${C.hp.temp}.`, 'note');
        const hpWas = { ...C.hp };
        hpApply(C, { k: how, n: amt });
        hpOp(C, { k: how, n: amt });
        saveNow();
        if (!Phone.on()) return draw();
        Phone.close();
        const c = C, sign = how === 'dmg' ? '−' : '+';
        offerUndo(how === 'temp' ? `Temp HP ${nm(C.hp.temp)}` : `${sign}${amt} HP, now ${nm(C.hp.cur)}/${hpMax()}`, () => { c.hp = hpWas; saveNow(); draw(); });
    });
    // the scroll style of hit points: scroll over the amount to change it (shift for 5 at a time); the button follows its sign
    const hpLabel = () => { const b = $('.hb-hpgo'); if (b) b.toggleAttribute('data-heal', nm($('#hb-amt').value) > 0); };
    main.addEventListener('wheel', (e) => {
        const el = e.target.closest('#hb-amt');
        if (!el || !C.view.hpScroll) return;
        e.preventDefault();
        el.value = nm(el.value) + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1); hpLabel();
    }, { passive: false });
    main.addEventListener('input', (e) => { if (e.target.id === 'hb-amt') hpLabel(); });
    // press and hold a d20 roll on a phone: advantage or disadvantage (the same menu as the player sheet's)
    main.insertAdjacentHTML('beforeend', `<div class="hb-advmenu" id="hb-adv" role="menu" aria-label="Roll with" hidden>
        <button type="button" role="menuitem" data-act="adv" data-a="adv">Advantage roll</button><button type="button" role="menuitem" data-act="adv" data-a="dis">Disadvantage roll</button></div>`);
    const isD20 = (b) => !!b && (b.dataset.act === 'roll' || 'd20' in b.dataset);
    let advFor = null, holdTimer = 0, held = false;
    function advOpen(b, x, y) { const m = $('#hb-adv'); advFor = b; m.hidden = false; m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px'; m.querySelector('button').focus(); }
    function advClose() { const m = $('#hb-adv'); if (!m.hidden) { m.hidden = true; if (advFor?.isConnected) advFor.focus(); } advFor = null; }
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#hb-adv')) advClose(); });
    addEventListener('scroll', () => advFor && advClose(), true);
    main.addEventListener('pointerdown', (e) => {
        held = false; clearTimeout(holdTimer);
        const b = e.target.closest('[data-act]');
        if (Phone.on() && e.pointerType === 'touch' && isD20(b)) holdTimer = setTimeout(() => { held = true; advOpen(b, e.clientX, e.clientY); }, 500);
    });
    for (const t of ['pointerup', 'pointercancel']) main.addEventListener(t, () => clearTimeout(holdTimer));
    // right-click a die in the tray to take one away
    main.addEventListener('contextmenu', (e) => {
        const r = e.target.closest('[data-act]');
        if (Phone.on() && isD20(r)) { e.preventDefault(); if (!held) advOpen(r, e.clientX, e.clientY); return; }
        const b = e.target.closest('[data-act="die"]');
        if (!b) return;
        e.preventDefault();
        const n = b.dataset.n;
        if (tray.pool[n] > 1) tray.pool[n]--; else delete tray.pool[n];
        drawTray();
    });
    main.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.tagName === 'SELECT' || b.tagName === 'FORM') return;
        const act = b.dataset.act, p = b.dataset.p, i = +b.dataset.i;
        if (held && isD20(b)) { held = false; return; } // the click that ends a press and hold opened the menu instead of rolling
        // archived (ROADMAP 0.5): it can be looked at and rolled, nothing else, until it's unarchived
        if (C.archived && !VIEW_ACTS.has(act)) return;
        if (act === 'formula') return showDlg({ kind: 'formula', p, t: b.dataset.t, s: !!b.dataset.s, parts: parseParts(get(p)) });
        if (act === 'padd' || act === 'pdel') {
            if (act === 'padd') dlgMode.parts.push({ sign: '+', k: 'num', v: '1', cap: '', label: '' }); else dlgMode.parts.splice(i, 1);
            set(dlgMode.p, buildParts(dlgMode.parts));
            dlgBody.innerHTML = formulaDlg(dlgMode); saveNow(); return refresh();
        }
        if (act === 'custom') { loadSenses(); return showDlg('custom'); }
        if (act === 'close') return dlg.close();
        if (act === 'cropsave') { C.art = $('#hb-crop').toDataURL('image/jpeg', 0.85); saveNow(); return dlg.close(); }
        if (act === 'rest') return showDlg({ kind: 'rest', r: b.dataset.r });
        if (act === 'doshort' || act === 'dolong') return rest(act === 'dolong' ? 'long' : 'short');
        if (act === 'skill') return skillInfo(+b.dataset.i);
        if (act === 'attr') return attrInfo(b.dataset.n);
        if (act === 'sense') return senseInfo(+b.dataset.i);
        if (act === 'fbadd') {
            // operators go on the end, () wraps what's there, anything else joins with + unless the formula ends waiting for a value
            const cur = String(C.view.fb || '').trim(), n = b.dataset.n;
            C.view.fb = ['+', '-', '*', '/'].includes(n) ? `${cur} ${n} ` : n === '()' ? `(${cur})`
                : !cur ? n : /[-+*/(,]$/.test(cur) ? `${cur}${cur.endsWith('(') ? '' : ' '}${n}` : `${cur} + ${n}`;
            save();
            const inp = $('.hb-fbuild [data-k="view.fb"]');
            if (inp) { inp.value = C.view.fb; inp.focus(); }
            return refresh();
        }
        if (act === 'flexmake' || act === 'flexburn') {
            const s = get(resPath('Sorcery points') || p + '.sp'), sb = slotBases(p);
            const l = +$(act === 'flexmake' ? '#hb-flex-make' : '#hb-flex-burn').value, slot = sb[l] && get(sb[l]), lv = ordinal(l + 1);
            if (!slot) return toast(`There's no ${lv}-level row in your spell slots.`, 'err');
            if (act === 'flexmake') {
                const n = maxOf(String((get(p).flex || FLEX_COST)[l])), left = maxOf(s.max) + nm(s.extra) - nm(s.used);
                if (left < n) return toast(`Not enough sorcery points: a ${lv}-level slot costs ${n}, you have ${Math.max(0, left)}.`, 'err');
                snap(b, `Made a ${lv}-level slot for ${n} sorcery points`);
                s.used = nm(s.used) + n; slot.extra = nm(slot.extra) + 1;
            } else {
                if (maxOf(slot.max) + nm(slot.extra) - nm(slot.used) <= 0) return toast(`No unused ${lv}-level slot.`, 'err');
                snap(b, `Turned a ${lv}-level slot into ${l + 1} sorcery points`);
                // no cap: points above the maximum become extra boxes until a long rest
                slot.used = nm(slot.used) + 1; s.used = nm(s.used) - (l + 1);
                if (s.used < 0) { s.extra = nm(s.extra) - s.used; s.used = 0; }
            }
            saveNow(); return draw();
        }
        if (act === 'rinfo') return ruleInfo(b.dataset.k, b.dataset.n, b.dataset.t, b.dataset.s);
        if (act === 'fxapply') {
            const e = get(b.dataset.p), name = get(b.dataset.p.split('.').slice(0, -2).join('.')).name || (e.k === 'heal' ? 'Healing' : 'Temp HP'), V = vars();
            // the same dice maths as the boxes (formula.js hbDice): each die rolled, then the flat bonus added
            let d = null;
            try { d = hbDice(e.dice, V); } catch (x) { }
            const rolls = d ? d.dice.flatMap(([n, c]) => Array.from({ length: Math.abs(c) }, () => Math.sign(c) * die(n))) : [];
            const amt = d ? rolls.reduce((t, x) => t + x, d.k) : NaN;
            const rolled = rolls.join(' + ').replace(/\+ -/g, '− ') + (d && d.k ? (rolls.length ? (d.k < 0 ? ' − ' : ' + ') : '') + (rolls.length ? Math.abs(d.k) : d.k) : '');
            if (!Number.isFinite(amt)) return toast(`Couldn't work out ${name}: check its formula.`, 'err');
            if (e.k === 'heal') { hpApply(C, { k: 'heal', n: Math.max(0, amt) }); hpOp(C, { k: 'heal', n: Math.max(0, amt) }); toast(`${name}: healed ${Math.max(0, amt)} (${rolled}).`, 'ok'); }
            else if (amt <= nm(C.hp.temp)) toast(`${name}: ${amt} temp HP, but temp HP doesn't stack, so you keep ${C.hp.temp}.`, 'note');
            else { hpApply(C, { k: 'temp', n: amt }); hpOp(C, { k: 'temp', n: amt }); toast(`${name}: ${amt} temp HP (${rolled}).`, 'ok'); }
            saveNow(); return draw();
        }
        if (act === 'roll2') return rollShow(b.dataset.t, b.dataset.g.split(',').map((x) => x.split('x').map(Number)), +b.dataset.m || 0, +b.dataset.x || 1, 'd20' in b.dataset ? takeAdv() : '');
        if (act === 'roll') { const v = value(b.dataset.k, vars()); return rollShow(b.dataset.t, [[20, 1]], Number.isFinite(+v.v) ? +v.v : 0, 1, takeAdv()); }
        if (act === 'adv') { const t = advFor; advClose(); if (!t) return; const v = t.dataset.act === 'roll2' ? { v: +t.dataset.m || 0 } : value(t.dataset.k, vars()); return rollShow(t.dataset.t, [[20, 1]], Number.isFinite(+v.v) ? +v.v : 0, 1, b.dataset.a); }
        if (act === 'rollx') { clearTimeout(rollTimer); $('#hb-rolls').innerHTML = ''; return; }
        if (act === 'tray') { if (Phone.on()) return Phone.open('dice'); tray.open = !tray.open; return drawTray(); }
        if (act === 'rollto') { setRollTo(!rollTo()); return drawTray(); }
        if (act === 'fightadd') return fightAdd(b.dataset.id ? [db.chars[b.dataset.id]] : monsIn(shownEnc).filter((c) => !c.archived), b);
        if (act === 'logtab') { logTab = b.dataset.t; return drawLog(); }
        if (act === 'logclear') { if (Phone.on()) { const was = C.rolls; C.rolls = []; saveNow(); drawLog(); offerUndo('Roll log cleared.', () => { C.rolls = was; saveNow(); drawLog(); }); return; } if (confirm('Clear the roll log for this monster?')) { C.rolls = []; saveNow(); drawLog(); } return; }
        if (act === 'die') { tray.pool[b.dataset.n] = (tray.pool[b.dataset.n] || 0) + 1; return drawTray(); }
        if (act === 'dieclear') { tray.pool = {}; return drawTray(); }
        if (act === 'coin') { rollShow('Coin flip', [['coin', 1]]); tray.open = false; return drawTray(); }
        if (act === 'dieroll') { rollShow('Dice', DICE.filter((n) => tray.pool[n]).map((n) => [n, tray.pool[n]])); tray.pool = {}; tray.open = false; return drawTray(); }
        if (act === 'coins') return coinApply(b.parentElement.querySelector('.hb-coinin'), b.dataset.sign);
        if (act === 'info') { const r = get(p); if ('lvl' in r && r.srd && needsFill(r)) srdFill(p); info(p); return hbInfoAdd(p); }
        if (act === 'hbup') return showDlg({ kind: 'hbup', p });
        if (act === 'hbupgo') return hbUpdate(p);
        if (act === 'hbmon') return showDlg({ kind: 'hbmon' });
        if (act === 'hbmongo') return hbMonApply();
        if (act === 'hbsave') { open.manage = false; return showDlg({ kind: 'hbsave' }); }
        if (act === 'hbsavego') return hbSaveGo(b.dataset.new === '1');
        if (act === 'dclose') return closeDrawer();
        if (act === 'more') { open.more = !open.more; return draw(); }
        if (act === 'manage') { open.manage = !open.manage; $('#hb-barin').innerHTML = bar(); return $('[data-act=manage]').focus(); }
        if (act === 'hpedit') { open.hp = !open.hp; return draw(); }
        if (act === 'tab') { C.view.tab = b.dataset.id; saveNow(false); return draw(); }
        if (act === 'phrow') { const id = b.dataset.id; phRows.has(id) ? phRows.delete(id) : phRows.add(id); openRows.delete(id); return drawKeepY(); }
        if (act === 'dieless') { const n = b.dataset.n; if (tray.pool[n] > 1) tray.pool[n]--; else delete tray.pool[n]; return drawTray(); }
        if (act === 'advnext') { advNext = b.dataset.v; return Phone.fill(); }
        if (act === 'toggle') { const id = b.dataset.id; openRows.has(id) ? openRows.delete(id) : openRows.add(id); return draw(); }
        if (act === 'tagadd') return addTag(b.previousElementSibling);
        if (act === 'nnew' || act === 'nsession') {
            const P = get(p), n = ROW.note();
            if (act === 'nsession') Object.assign(n, { group: 'Sessions', title: `Session ${P.notes.filter((x) => String(x.group).trim() === 'Sessions').length + 1} · ${dateText(Date.now())}` });
            else if (P.sub.startsWith('g:')) n.group = P.sub.slice(2);
            else if (P.sub === 'pinned') n.pinned = true;
            P.notes.push(n); P.open = n.id;
            saveNow(); draw();
            const t = $(`[data-k="${p}.notes.${P.notes.length - 1}.${act === 'nnew' ? 'title' : 'body'}"]`);
            return t && t.focus();
        }
        if (act === 'tadd') {
            const P = get(p), taken = uniq([...P.tabs, ...P.rows.map((r) => r.group)]);
            let name = 'New tab', n = 2;
            while (taken.includes(name)) name = 'New tab ' + n++;
            P.tabs.push(name); P.sub = 't:' + name;
            saveNow(); draw();
            const t = $(`.hb-tname[data-p="${p}"][data-g="${name}"]`);
            if (t) { t.focus(); t.select(); }
            return;
        }
        if (act === 'tdel') {
            const P = get(p), g = b.dataset.g, n = P.rows.filter((r) => r.group === g).length;
            const hb = P.type === 'homebrew';
            if (n && !confirm(`Delete the ${g} tab? Its ${n} ${hb ? (n === 1 ? 'ability' : 'abilities') : 'resource' + (n === 1 ? '' : 's')} stay under ${hb ? 'their timing' : 'All'}.`)) return;
            snap(b);
            for (const r of P.rows) if (r.group === g) r.group = '';
            P.tabs = P.tabs.filter((t) => t !== g); if (P.sub === 't:' + g) P.sub = 'all';
            saveNow(); return draw();
        }
        if (act === 'tnew') {
            const P = get(p), kind = $('#hb-tkind-' + i).value, tab = P.sub.startsWith('t:') ? P.sub.slice(2) : '';
            const cls = (name) => C.classes.some((c) => kk(c.name) === name) ? name.toUpperCase() + '_LEVEL' : 'LEVEL';
            const r = Object.assign(ROW.tracker(), { group: tab }, {
                count: { kind: 'count' },
                pips: { kind: 'pips', max: '3' },
                levels: { kind: 'levels', name: 'Spell slots', levels: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'].map((label) => ({ label, max: '0', used: 0 })) },
                sorcery: { kind: 'pips', name: 'Sorcery points', max: cls('sorcerer') },
                ki: { kind: 'count', name: 'Ki points', max: cls('monk'), reset: 'short' },
            }[kind] || {});
            r.cur = maxOf(r.max);
            const sp = C.panels.find((q) => q.type === 'spells');
            if (kind === 'levels' && sp && !slotTracker()) r.levels.forEach((l, j) => Object.assign(l, { max: String(sp.slots[j].max), used: nm(sp.slots[j].used) }));
            if (kind === 'levels' || r.kind === 'pips') openRows.add(r.id);
            P.rows.push(r);
            saveNow(); return draw();
        }
        if (act === 'nopen') { get(p).open = b.dataset.id; saveNow(false); return draw(); }
        if (act === 'ngo') {
            const P = C.panels[i];
            P.open = b.dataset.id; C.view.tab = P.id; Phone.showPanel('notes');
            if (P.sub === 'pinned' || P.sub.startsWith('g:') || P.sub === 'none') P.sub = 'all';
            saveNow(false); draw();
            const el = $('#hb-p-' + P.id);
            return el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // notes are archived, never deleted (ROADMAP 0.5): out of the list and off the sheet, kept under Archived with Restore
        if (act === 'narc') {
            const P = get(p), n = P.notes[i];
            n.archived = Date.now(); if (P.open === n.id) P.open = '';
            offerUndo(`Archived ${n.title || 'Untitled note'}`, () => { n.archived = 0; P.open = n.id; saveNow(); draw(); });
        }
        else if (act === 'ngarc') { // the whole group at once, one Undo
            const P = get(p), hit = P.notes.filter((n) => !n.archived && String(n.group || '').trim() === b.dataset.g), open = P.open;
            hit.forEach((n) => { n.archived = Date.now(); if (P.open === n.id) P.open = ''; });
            offerUndo(`Archived group ${b.dataset.g}`, () => { hit.forEach((n) => { n.archived = 0; }); P.open = open; saveNow(); draw(); });
        }
        else if (act === 'ngunarc') get(p).notes.forEach((n) => { if (n.archived && String(n.group || '').trim() === b.dataset.g) n.archived = 0; });
        else if (act === 'nunarc') { const n = get(p).notes[i]; n.archived = 0; get(p).open = n.id; }
        else if (act === 'npin') { const n = get(p); n.pinned = !n.pinned; }
        else if (act === 'ndup') {
            const P = get(p), n = Object.assign({}, P.notes[i], { id: uid(), title: (P.notes[i].title || 'Untitled note') + ' (copy)', pinned: false, created: Date.now(), updated: Date.now() });
            P.notes.splice(i + 1, 0, n); P.open = n.id;
        }
        else
        if (act === 'sub') { set(p, b.dataset.id); saveNow(false); return draw(); }
        else if (act === 'cond') { const n = b.dataset.n; C.conditions = C.conditions.includes(n) ? C.conditions.filter((x) => x !== n) : [...C.conditions, n]; }
        else if (act === 'chip') { const list = get(p), n = b.dataset.n; set(p, list.includes(n) ? list.filter((x) => x !== n) : [...list, n]); }
        else if (act === 'prof' || act === 'tprof') { const s = act === 'prof' ? C.skills[i] : C.profs.tools[i], lv = PROF.findIndex(([q]) => q === s.p); s.p = PROF[(lv + 1) % PROF.length][0]; }
        else if (act === 'pip') set(p, get(p) === i + 1 ? i : i + 1);
        else if (act === 'hbuse') {
            const r = get(p), res = resOf(r.cost.what), n = costAmt(r);
            if (!res) return;
            const left = resLeft(res);
            if (n > left) return toast(`Not enough ${res.name}: ${left} left, ${r.name || 'this'} costs ${n}.`, 'err');
            if (res.kind === 'pips') res.used = nm(res.used) + n; else res.cur = left - n;
            toast(`${r.name || 'Used'}: spent ${n} ${res.name}, ${left - n} left.`, 'ok');
        }
        else if (act === 'track') { const r = get(p); r.cur = Math.max(0, Math.min(maxOf(r.max), nm(r.cur) + +b.dataset.d)); }
        else if (act === 'add') {
            const row = ROW[b.dataset.t]();
            if (b.dataset.time) row.time = b.dataset.time;
            if (b.dataset.group) row.group = b.dataset.group;
            if (b.dataset.cat) row.cat = b.dataset.cat;
            if (b.dataset.grp) row.grp = b.dataset.grp;
            if (b.dataset.lvl) row.lvl = +b.dataset.lvl;
            if (b.dataset.prep) row.prep = true;
            if (b.dataset.t === 'level') row.label = ordinal(get(p).length + 1);
            if (row.id && ('desc' in row || 'text' in row || 'notes' in row)) openRows.add(row.id);
            get(p).push(row);
        }
        else if (act === 'addsense') {
            const v = $('#hb-sense-pick').value, name = v.slice(2);
            C.passives.push(Object.assign(ROW.passive(), v.startsWith('p:') ? { name: 'Passive ' + name, f: '10 + ' + name.replace(/\W/g, '') } : v.startsWith('s:') ? { name, f: '60', unit: 'ft' } : {}));
        }
        else if (act === 'addmeta') { const m = METAMAGIC.find(([n]) => n === $('#hb-meta-pick').value), row = Object.assign(ROW.meta(), m ? { name: m[0], cost: m[1], desc: m[2] } : {}); if (!m) openRows.add(row.id); get(p).push(row); }
        else if (act === 'addpanel') C.panels.push(newPanel($('#hb-newtype').value));
        else if (act === 'del') {
            if (p === 'panels' && !confirm(`Remove the ${C.panels[i].title} panel and everything in it?`)) return;
            snap(b); get(p).splice(i, 1);
        }
        else if (act === 'mv') { const j = i + +b.dataset.d; [C.panels[i], C.panels[j]] = [C.panels[j], C.panels[i]]; }
        else if (act === 'art') return $('#hb-artfile').click();
        else if (act === 'artdel') { snap(b); C.art = ''; }
        else if (act === 'new') return switchTo(Object.assign(blank(), { name: numbered('New monster'), updated: Date.now() }));
        else if (act === 'side') { Phone.close(); return switchTo(db.chars[b.dataset.id]); }
        else if (act === 'dup') return dupMonster();
        else if (act === 'encto') { open.manage = false; return encOpen({ kind: 'to', copy: 'copy' in b.dataset }); }
        else if (act === 'encshow') return encShow(b.dataset.id);
        else if (act === 'encunarc') return encArchive(encOf(b.dataset.id), false);
        else if (act === 'find') return openFind();
        else if (act === 'diffadd') { if (encDlg.open) encDlg.close(); return openFind(shownEnc); }
        else if (act === 'diffparty') return encOpen({ kind: 'party' });
        else if (act === 'diffrefresh') return partyLoad(partyOf(shownEnc).camp);
        else if (act === 'diffopen') return encOpen({ kind: 'diff' });
        else if (act === 'import') return $('#hb-file').click();
        else if (act === 'export') return download((C.name || 'monster').replace(/[^\w -]+/g, '').trim() + '.json', JSON.stringify(C, null, 1));
        else if (act === 'archive') return setArchived(true);
        else if (act === 'unarchive') return setArchived(false);
        else if (act === 'monunarc') { switchTo(db.chars[b.dataset.id]); return setArchived(false); }
        else return;
        saveNow(); draw();
    });

    $('#hb-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const c = normalise(JSON.parse(await file.text()));
            c.id = uid(); c.enc = ''; c.updated = Date.now();
            switchTo(c);
            toast(`Imported ${c.name || 'the monster'}.`, 'ok');
        } catch (err) { toast("Couldn't import that file. Choose a .json file exported from this sheet.", 'err'); }
    });
    $('#hb-artfile').addEventListener('change', (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) loadArt(file); });

    // The Compendium's "Add to encounter" leaves {id, key, n, enc} in localStorage "mon-pending"; they are added here when the sheet opens and when
    // one arrives while it is open. Under a lock, and a request leaves the queue only once its monsters are saved, so none is lost or added twice.
    function takePending() {
        const run = async () => {
            const read = () => { try { const q = JSON.parse(localStorage.getItem('mon-pending')); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
            const x = read().find((y) => y && typeof y.key === 'string');
            if (!x) return;
            try {
                const n = Math.max(1, Math.floor(+x.n) || 1);
                await addMonsters(x.key, n, typeof x.enc === 'string' ? x.enc : '', true);
                localStorage.setItem('mon-pending', JSON.stringify(read().filter((y) => y && y.id !== x.id)));
                toast(`Added ${n > 1 ? n + ' x ' : ''}${x.name || 'the monster'} from the Compendium.`, 'ok');
            } catch (err) {
                // homebrew that has gone won't come back on a reload, so its request doesn't stay queued
                if (err.message === HB_GONE) localStorage.setItem('mon-pending', JSON.stringify(read().filter((y) => y && y.id !== x.id)));
                return toast(err.message === HB_GONE ? HB_GONE : "Couldn't add the monster from the Compendium. Reload to try again.", 'err');
            }
            return run();
        };
        return navigator.locks ? navigator.locks.request('mon-pending', run) : run();
    }
    addEventListener('storage', (e) => { if (e.key === 'mon-pending') takePending(); });


    // ---- phone mode (ROADMAP 2.1, assets/js/phone.js): what this sheet hands to the phone's frame ----
    const phRows = new Set(), $$ = (s) => [...document.querySelectorAll(s)];
    let advNext = ''; // the dice sheet's Advantage / Disadvantage: for the next d20 only
    const takeAdv = () => { const a = advNext; advNext = ''; return a; };
    const drawKeepY = () => { const y = scrollY; draw(); scrollTo(0, y); };
    function phMarks() {
        const hp = $('#ph-hp'), cur = nm(C.hp.cur), max = hpMax(), n = C.conditions.length + (nm(C.exhaustion) ? 1 : 0);
        if (hp) { hp.classList.toggle('low', cur > 0 && cur < max / 2); hp.classList.toggle('down', cur <= 0); hp.setAttribute('aria-label', `Hit points ${cur} of ${max}${nm(C.hp.temp) ? ', ' + nm(C.hp.temp) + ' temporary' : ''}. Tap to damage or heal`); }
        $('#ph-cond')?.classList.toggle('set', n > 0);
        $('[data-c="phsub"]')?.classList.toggle('cond', n > 0);
    }
    // the line under the name: the conditions when there are any, otherwise who this is
    function phSub() {
        const L = C.conditions, list = [...L.slice(0, 2), ...(nm(C.exhaustion) ? ['Exhaustion ' + C.exhaustion] : [])].join(', ') + (L.length > 2 ? ` +${L.length - 2}` : '');
        return list || phWho();
    }
    const phHpSheet = () => `<div class="ph-hpnow"><b data-c="phcur"></b><span>/ <span data-c="hpmax"></span></span><span class="ph-temp" data-c="hptemp"></span></div>
        ${phRO() ? '<p class="muted">Read only, so this can\'t change.</p>' : `<form class="ph-hpform" data-act="hp"><input class="field ph-amt" id="hb-amt" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Amount" aria-label="Amount">
            <div class="ph-hpgo"><button class="btn ph-dmg" value="dmg">Damage</button><button class="btn ph-heal" value="heal">Heal</button></div>
            <div class="ph-two"><button class="btn" value="temp">Set temp</button><button type="button" class="btn" data-act="hpedit" aria-expanded="${!!open.hp}">Edit HP</button></div></form>
            ${open.hp ? `<div class="hb-hpf ph-two"><label>Current ${f('hp.cur', 'Current hit points', { num: true })}</label><label>Base ${f('hp.base', 'Base hit points, before level × CON modifier', { num: true })}</label>
                <label>Max change ${f('hp.mod', 'Temporary change to maximum hit points', { num: true })}</label><label>Temp ${f('hp.temp', 'Temporary hit points', { num: true })}</label></div>` : ''}`}`;
    const phAcSheet = () => `<div class="ph-hpnow"><b data-c="fx:ac"></b></div><p class="muted" data-c="phacwhy"></p>${phRO() ? '' : '<button type="button" class="btn" data-act="custom">Open Customise</button>'}`;
    const phCondSheet = () => phRO() ? topParts().moreBody.replace(/<button type="button" class="badge/g, '<button type="button" disabled class="badge') : topParts().moreBody;
    function phDiceSheet() {
        const groups = DICE.filter((n) => tray.pool[n]).map((n) => [n, tray.pool[n]]), noTray = !!C.view.noTray, noLog = !!C.view.noRoll;
        if (!camp()) logTab = 'mine';
        const rows = logTab === 'table' ? (tlog.length ? tableRows(200) : '<p class="muted">Rolls at the table show up here.</p>') : (C.rolls || []).length ? logRows(100) : '<p class="muted">Your dice rolls show up here.</p>';
        return `${noTray ? '' : `<div class="ph-dice">${DICE.map((n) => `<div class="ph-die${tray.pool[n] ? ' has' : ''}"><button type="button" class="hb-die" data-act="die" data-n="${n}" aria-label="Add a d${n}">${tray.pool[n] || ''}d${n}</button>${tray.pool[n] ? `<button type="button" class="ph-minus" data-act="dieless" data-n="${n}" aria-label="Remove a d${n}">−</button>` : ''}</div>`).join('')}<div class="ph-die"><button type="button" class="hb-die" data-act="coin">Coin</button></div></div>
            <div class="ph-seg" role="group" aria-label="The next d20 roll">${[['adv', 'Advantage'], ['', 'Normal'], ['dis', 'Disadvantage']].map(([v, w]) => `<button type="button" class="${advNext === v ? 'on' : ''}" data-act="advnext" data-v="${v}" aria-pressed="${advNext === v}">${w}</button>`).join('')}</div>
            <div class="ph-go"><button type="button" class="btn" data-act="dieclear"${groups.length ? '' : ' disabled'}>Clear</button><button type="button" class="btn primary" data-act="dieroll"${groups.length ? '' : ' disabled'}>Roll${groups.length ? ' ' + groups.map(([n, c]) => `${c}d${n}`).join(' + ') : ''}</button></div>${tablePick()}`}
            ${noLog ? '' : `<div class="ph-loghead">${camp() ? `<div class="stabs"><button type="button" data-act="logtab" data-t="mine" class="${logTab === 'mine' ? 'on' : ''}">Mine</button><button type="button" data-act="logtab" data-t="table" class="${logTab === 'table' ? 'on' : ''}">Table</button></div>` : '<h3>Roll log</h3>'}${logTab === 'mine' && (C.rolls || []).length ? '<button type="button" class="btn small" data-act="logclear">Clear log</button>' : ''}</div>${rows}`}`;
    }
    // Spells with nothing in them: just the way to add one
    const phCard = ([p, i]) => (p.type === 'spells' && !p.rows.length && !p.slots.some((s) => maxOf(s.max) > 0)
        ? `<section class="card hb-panel" id="hb-p-${esc(p.id)}"><h2>${esc(p.title)}</h2><p class="muted">No spells yet.</p>${phRO() ? '' : `<div class="actions">${add(`panels.${i}.rows`, 'spell', 'Add spell')}</div>`}</section>`
        : panelCard([p, i]));
    const phFoot = () => [...$$('#main > .hb-hint, #main > .mon-credit')].map((e) => e.outerHTML).join('');
    const phLock = () => { if (phRO()) for (const el of $$('#ph-body input:not([data-ph-full]), #ph-body select, #ph-body textarea')) el.disabled = true; };
    const phWho = () => [String(C.cr).trim() ? 'CR ' + C.cr : '', C.race].filter(Boolean).join(' · ') || 'Monster';
    const phRO = () => !!C.archived;
    const phApi = { monster: true, abEdit: false, notice: () => (C.archived ? 'This monster is archived. <button type="button" class="btn small primary" data-act="unarchive">Unarchive</button>' : ''), pencil: PENCIL, C: () => C, draw, refresh: () => { phLock(); refresh(); }, saveView: () => saveNow(false),
        visible: () => C.panels.map((p, i) => [p, i]).filter(([p]) => p.on), card: phCard, parts: topParts, defaultOrder: () => blank().panels.map((p) => p.type),
        head: () => { const list = monsIn(shownEnc).filter((c) => !c.archived), i = list.indexOf(C); return { cur: nm(C.hp.cur), noRoll: !!C.view.noRoll, prev: i > 0 ? list[i - 1].id : '', next: i >= 0 && i < list.length - 1 ? list[i + 1].id : '' }; },
        map: () => (camp() ? '/campaigns/' + encodeURIComponent(camp().id) + '/map' : ''), ro: phRO,
        hpSheet: phHpSheet, acSheet: phAcSheet, condSheet: phCondSheet, diceSheet: phDiceSheet,
        menuSheet: () => { const t = topParts(); return `<div class="ph-menu"><a class="btn" href="/">Home</a>${bar()}<div class="ph-artw">${t.art}</div><div id="ph-auth" class="ph-authw"></div>${Phone.fullSwitch()}<div class="ph-foot">${phFoot()}</div></div>`; },
    };
    function phAbils() {
        return `<div class="hb-abils ph-abils">${C.abilities.map((a, i) => (phApi.abEdit ? `<label class="hb-abil"><span class="hb-lbl">${esc(a.key)}</span>${f(`abilities.${i}.score`, a.name + ' score', { num: true, cls: 'hb-score' })}</label>`
            : `<div class="hb-abil"><span class="hb-lbl" title="${esc(a.name)}">${esc(a.key)}</span>${rollv('mod:' + i, a.name + ' check', ' hb-big')}<small class="muted">${esc(a.score)}</small></div>`)).join('')}</div>
            <div class="rowi ph-profrow"><span class="grow">Proficiency bonus</span>${fx('prof', 'Proficiency bonus', true, '')}</div><label class="rowi ph-profrow"><span class="grow">Inspiration</span>${f('insp', 'Heroic inspiration', { check: true })}</label>`;
    }
    Phone.start(phApi);

    // ROADMAP 2.1: coming back to an open sheet, signed in, the account's newer copy is taken (before anything goes up from here)
    Phone.pullOnReturn({ url: 'cloud.php', cloud: () => cloud, chars: () => db.chars, normalise, current: () => C, adopt: (c) => { C = c; }, off: cloudOff, store, flush: flushBackups, toast, offerUndo,
        draw: () => { const y = scrollY; draw(); scrollTo(0, y); }, keep: (mine) => { mine.updated = Date.now(); db.chars[mine.id] = mine; C = mine; saveNow(false); draw(); } });

    draw();
    takePending();
    hbFromPage();
    // monsters and rows whose source has a newer version, once the account has answered
    Homebrew.ready().then(() => { if (hbMonNewer() || C.panels.some((P) => (P.rows || []).some(hbNewer))) draw(); });
    loadCamps();
});
