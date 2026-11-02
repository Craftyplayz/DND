// Monster Sheet (/games/dnd/sheets/monster/): a copy of the player sheet (sheet.js) for monsters. Creature type is kept in the player sheet's race field,
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

    const ABIL = [['STR', 'Strength'], ['DEX', 'Dexterity'], ['CON', 'Constitution'], ['INT', 'Intelligence'], ['WIS', 'Wisdom'], ['CHA', 'Charisma']];
    const SKILLS = [['Acrobatics', 'DEX'], ['Animal Handling', 'WIS'], ['Arcana', 'INT'], ['Athletics', 'STR'], ['Deception', 'CHA'], ['History', 'INT'],
        ['Insight', 'WIS'], ['Intimidation', 'CHA'], ['Investigation', 'INT'], ['Medicine', 'WIS'], ['Nature', 'INT'], ['Perception', 'WIS'],
        ['Performance', 'CHA'], ['Persuasion', 'CHA'], ['Religion', 'INT'], ['Sleight of Hand', 'DEX'], ['Stealth', 'DEX'], ['Survival', 'WIS']];
    const CONDITIONS = 'Blinded\nCharmed\nDeafened\nFrightened\nGrappled\nIncapacitated\nInvisible\nParalysed\nPetrified\nPoisoned\nProne\nRestrained\nStunned\nUnconscious';
    // lists you can edit in Customise, one entry per line
    const LISTS = {
        time: 'Action\nBonus action\nReaction\nLegendary\nFree\nSpecial',
        dmg: 'Acid\nBludgeoning\nCold\nFire\nForce\nLightning\nNecrotic\nPiercing\nPoison\nPsychic\nRadiant\nSlashing\nThunder',
        props: 'Ammunition\nFinesse\nHeavy\nLight\nLoading\nMagical\nReach\nSilvered\nThrown\nTwo-handed\nVersatile',
        cats: 'Weapons\nArmour\nGear\nConsumables\nTreasure\nMagic items\nMisc',
        speeds: 'Walk\nFly\nSwim\nClimb\nBurrow',
    };
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
    // suggestions for the Creature type field (the race key)
    const RACES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];
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
    // Flexible Casting: sorcery points to make a 1st- to 5th-level slot (SRD 5.1 costs; editable per sheet)
    const FLEX_COST = [2, 3, 5, 6, 7];
    const METAMAGIC = [['Careful Spell', '1', 'Some creatures you choose automatically succeed on the save against your spell.'],
        ['Distant Spell', '1', 'Double the range, or make a touch spell reach 30 ft.'],
        ['Empowered Spell', '1', 'Reroll some of the damage dice and use the new rolls.'],
        ['Extended Spell', '1', 'Double the duration, up to 24 hours.'],
        ['Heightened Spell', '3', 'One target has disadvantage on its first save against the spell.'],
        ['Quickened Spell', '2', 'Cast a spell that takes an action as a bonus action instead.'],
        ['Subtle Spell', '1', 'Cast without verbal or somatic components.'],
        ['Twinned Spell', 'spell level', 'Target a second creature with a spell that targets only one.']];
    const TYPES = { profs: 'Proficiencies', attacks: 'Actions', spells: 'Spells', items: 'Inventory', list: 'List', trackers: 'Trackers', notes: 'Notes', text: 'Text', combat: 'Death saves and hit dice', homebrew: 'Homebrew' };
    const RESETS = [['', 'No reset'], ['short', 'Short rest'], ['long', 'Long rest']];
    // homebrew abilities: a sub-tab per timing (anything else goes under Other), and what each effect does
    const HB_TIMES = [['Action', 'Actions', 'action'], ['Bonus action', 'Bonus actions', 'bonus action'], ['Reaction', 'Reactions', 'reaction'], ['Other', 'Other', 'ability']];
    // Passive abilities sub-tabs
    const LIST_GROUPS = [['race', 'Traits'], ['other', 'Other']];
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
    const uid = () => Math.random().toString(36).slice(2, 10);
    // read a number out of whatever was typed ("30 ft" -> 30)
    const nm = (x) => parseFloat(x) || 0;
    const ROW = {
        attack: () => ({ id: uid(), name: '', time: 'Action', range: '', props: [], mode: 'hit', hit: 'STR + PROF', save: 'DEX', dc: '8 + PROF + STR', dmg: [{ dice: '1d6 + STR', type: 'Slashing' }], fx: [], desc: '' }),
        spell: () => ({ id: uid(), lvl: 0, name: '', school: '', time: 'Action', trig: '', range: '', comp: '', dur: '', conc: false, ritual: false, prep: false, mode: 'none', save: 'DEX', dc: '', dmg: [], fx: [], desc: '', higher: '', srd: '' }),
        item: () => ({ id: uid(), cat: 'Gear', eq: false, att: '', name: '', qty: 1, wt: 0, gp: '', props: [], notes: '' }),
        list: () => ({ id: uid(), name: '', src: '', text: '', uses: '', used: 0, reset: '', grp: '' }),
        // kind: count (left / max), pips (boxes ticked as used) or levels (a row of boxes per level, like spell slots)
        tracker: () => ({ id: uid(), name: '', kind: 'count', cur: 1, max: 1, used: 0, reset: 'long', group: '', levels: [] }),
        level: () => ({ label: '', max: '1', used: 0 }),
        meta: () => ({ id: uid(), name: '', cost: '1', desc: '' }),
        hb: () => ({ id: uid(), group: '', name: '', time: 'Action', range: '', mode: 'none', hit: 'PROF + STR', save: 'DEX', dc: '8 + PROF + STR', fx: [], cost: { amt: '', what: '' }, desc: '' }),
        fx: () => ({ k: 'dmg', dice: '', type: '', text: '' }),
        sfx: () => ({ k: 'buff', dice: '', type: '', text: '' }),
        dmg: () => ({ dice: '', type: '' }),
        speed: () => ({ type: 'Fly', ft: 30, hover: false }),
        cls: () => ({ name: '', level: 1, die: 8, hdUsed: 0 }),
        tool: () => ({ name: '', ab: 'DEX', p: 1 }),
        ability: () => ({ key: 'NEW', name: 'New ability', score: 10, save: false, sb: '' }),
        skill: () => ({ name: 'New skill', ab: 'STR', p: 0, b: '' }),
        passive: () => ({ name: 'Passive', f: '10', unit: '' }),
        note: () => ({ id: uid(), title: '', group: '', body: '', pinned: false, created: Date.now(), updated: Date.now() }),
    };
    const PANEL_ROW = { attacks: ROW.attack, spells: ROW.spell, items: ROW.item, list: ROW.list, trackers: ROW.tracker, homebrew: ROW.hb };

    function newPanel(type, title) {
        const p = { id: uid(), type, title: title || TYPES[type], on: true, sub: 'all' };
        if (PANEL_ROW[type]) p.rows = [];
        if (type === 'items') Object.assign(p, { coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, attMax: 3 });
        if (type === 'spells') Object.assign(p, { dc: '8 + PROF + INT', atk: 'PROF + INT', slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })), sp: { cur: 0, max: 0 }, meta: [], flex: FLEX_COST.slice() });
        if (type === 'text') p.text = '';
        if (type === 'combat') Object.assign(p, { ok: 0, bad: 0 });
        if (type === 'profs') p.sub = 'skills';
        if (type === 'notes') Object.assign(p, { notes: [], open: '', sort: 'edited' });
        if (type === 'trackers') p.tabs = [];
        if (type === 'homebrew') Object.assign(p, { sub: 'Action', text: '', tabs: [] });
        return p;
    }

    function blank() {
        return {
            id: uid(), name: '', classes: [ROW.cls()], race: '', cr: '0', alignment: '', age: '', art: '',
            abilities: ABIL.map(([key, name]) => ({ key, name, score: 10, save: false, sb: '' })),
            skills: SKILLS.map(([name, ab]) => ({ name, ab, p: 0, b: '' })),
            prof: 'max(2, ceil(CR / 4) + 1)', ac: '10 + DEX', init: 'DEX',
            hp: { cur: 10, base: 10, temp: 0, mod: 0 }, insp: false,
            speeds: [{ type: 'Walk', ft: 30, hover: false }], conditions: [], exhaustion: 0, condList: CONDITIONS, res: '', imm: '', vul: '',
            passives: [['Passive Perception', '10 + Perception'], ['Passive Investigation', '10 + Investigation'], ['Passive Insight', '10 + Insight']].map(([name, f]) => ({ name, f })),
            senses: '',
            profs: { armour: [], weapons: [], langs: ['Common'], tools: [], notes: '' },
            lists: { ...LISTS },
            panels: [newPanel('profs'), newPanel('attacks'), newPanel('spells'), newPanel('items'), Object.assign(newPanel('list', 'Passive abilities'), { split: true, sub: 'race' }),
                newPanel('trackers', 'Resources'), newPanel('homebrew'), newPanel('combat'),
                Object.assign(newPanel('notes'), { notes: [Object.assign(ROW.note(), { title: 'Tactics', group: 'Monster' })] })],
            view: { tab: '', all: false, prep: false }, hbPanel: true, hb2: true, passSplit: true,
        };
    }

    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    // which Passive abilities tab an entry belongs in, from its source ("Fighter 3", "Hill Dwarf", "Feat")
    function groupOf(src, c) {
        const s = String(src || '').trim().toLowerCase();
        const has = (n) => { const t = String(n || '').trim().toLowerCase(); return t !== '' && s.startsWith(t); };
        if (!s) return 'other';
        if (has(c.race) || RACES.some(has) || s === 'trait') return 'race';
        return 'other';
    }
    // older sheets (before classes, speed lists, proficiency tabs and damage parts) are upgraded in place
    function upgrade(c) {
        const panels = Array.isArray(c.panels) ? c.panels.filter(isObj) : null;
        if (!Array.isArray(c.classes)) {
            const comb = panels && panels.find((p) => p.type === 'combat');
            const die = comb && /d(\d+)/.exec(comb.hd || '');
            c.classes = [{ name: typeof c.cls === 'string' ? c.cls : '', level: +c.level || 1, die: die ? +die[1] : 8, hdUsed: comb ? nm(comb.hdUsed) : 0 }];
        }
        if (!Array.isArray(c.speeds) && typeof c.speed === 'string') {
            c.speeds = c.speed.split(',').map((s) => /^\s*([^\d]*?)\s*(\d+)/.exec(s)).filter(Boolean)
                .map((m, n) => ({ type: m[1] ? m[1][0].toUpperCase() + m[1].slice(1) : n ? 'Other' : 'Walk', ft: +m[2], hover: false }));
        }
        if (panels && !panels.some((p) => p.type === 'profs')) {
            const old = panels.find((p) => p.type === 'text' && p.title === 'Proficiencies and languages');
            const at = Math.max(0, panels.findIndex((p) => p.type === 'skills' || p === old));
            c.profs = Object.assign({ notes: old ? old.text || '' : '' }, isObj(c.profs) ? c.profs : {});
            c.panels = panels.filter((p) => p.type !== 'skills' && p !== old);
            c.panels.splice(at, 0, newPanel('profs'));
        }
        // a Homebrew panel, added once after Resources (a removed or renamed one stays that way)
        if (Array.isArray(c.panels) && !c.hbPanel) {
            const at = c.panels.findIndex((p) => isObj(p) && p.type === 'trackers');
            c.panels.splice(at < 0 ? c.panels.length : at + 1, 0, newPanel('homebrew'));
            c.hbPanel = c.hb2 = true;
        }
        // Homebrew used to be a second Resources panel: its resources move to Resources (in a Homebrew tab unless they had one)
        if (Array.isArray(c.panels) && !c.hb2) {
            const old = c.panels.find((p) => isObj(p) && p.type === 'trackers' && p.title === 'Homebrew');
            const res = c.panels.find((p) => isObj(p) && p.type === 'trackers' && p !== old);
            const moved = old && Array.isArray(old.rows) ? old.rows.filter(isObj) : [];
            if (old && (res || !moved.length)) {
                if (moved.length) {
                    res.rows = [...(Array.isArray(res.rows) ? res.rows : []), ...moved.map((r) => Object.assign(r, { group: r.group || 'Homebrew' }))];
                    res.tabs = [...new Set([...(Array.isArray(res.tabs) ? res.tabs : []), ...moved.map((r) => r.group)])];
                }
                c.panels[c.panels.indexOf(old)] = newPanel('homebrew');
            }
            c.hb2 = true;
        }
        // Passive abilities get Racial, Class and Other tabs once (each entry is sorted by its source in normalise)
        if (Array.isArray(c.panels) && !c.passSplit) {
            const pa = c.panels.find((p) => isObj(p) && p.type === 'list' && p.title === 'Passive abilities');
            if (pa) pa.split = true;
            c.passSplit = true;
        }
        // Personality, Backstory and Notes text panels become notes in one Notes panel
        if (Array.isArray(c.panels) && !c.panels.some((p) => isObj(p) && p.type === 'notes')) {
            const old = c.panels.filter((p) => isObj(p) && p.type === 'text' && ['Personality', 'Backstory', 'Notes'].includes(p.title));
            if (old.length) {
                const np = newPanel('notes');
                np.notes = old.filter((p) => String(p.text || '').trim()).map((p) => Object.assign(ROW.note(), { title: p.title, group: p.title === 'Notes' ? '' : 'Character', body: p.text }));
                c.panels.splice(c.panels.indexOf(old[0]), 0, np);
                c.panels = c.panels.filter((p) => !old.includes(p));
            }
        }
        for (const p of Array.isArray(c.panels) ? c.panels.filter(isObj) : []) {
            if (p.type === 'list' && p.title === 'Features and traits') p.title = 'Passive abilities';
            if (p.title === 'Attacks' && p.type === 'attacks') p.title = 'Actions';
            for (const r of Array.isArray(p.rows) ? p.rows.filter(isObj) : []) {
                if (typeof r.dmg === 'string') r.dmg = r.dmg ? [{ dice: r.dmg, type: '' }] : [];
                if (typeof r.notes === 'string' && r.desc === undefined && p.type !== 'items') r.desc = r.notes;
            }
        }
        return c;
    }

    // fill gaps in an imported or older character so rendering never meets a missing field
    function normalise(c) {
        c = upgrade(isObj(c) ? c : {});
        const d = blank(), out = {};
        // number fields hold whatever was typed, so a string is fine there too
        for (const k in d) out[k] = (typeof c[k] === typeof d[k] || typeof d[k] === 'number' && typeof c[k] === 'string') && Array.isArray(c[k]) === Array.isArray(d[k]) && c[k] !== null ? c[k] : d[k];
        const rows = (list, make) => (Array.isArray(list) ? list : []).filter(isObj).map((r) => Object.assign(make(), r));
        const strs = (list) => (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string');
        out.abilities = rows(out.abilities, ROW.ability);
        out.skills = rows(out.skills, ROW.skill);
        out.passives = rows(out.passives, ROW.passive);
        out.classes = rows(out.classes, ROW.cls);
        if (!out.classes.length) out.classes = [ROW.cls()];
        out.speeds = rows(out.speeds, ROW.speed);
        out.panels = out.panels.filter((p) => isObj(p) && TYPES[p.type]).map((p) => {
            const q = Object.assign(newPanel(p.type), p);
            if (q.rows) q.rows = rows(q.rows, PANEL_ROW[q.type]).map((r) => {
                if ('dmg' in r) { r.dmg = rows(r.dmg, ROW.dmg); r.fx = rows(r.fx, ROW.fx); }
                // SRD cantrips filled before CANTRIP existed: their dice now scale with level
                if ('lvl' in r && !nm(r.lvl) && r.srd && !String(r.srd).startsWith('wd:')) for (const d of r.dmg) d.dice = String(d.dice).replace(/^[1-4]d(\d+)$/, 'CANTRIPd$1');
                if ('props' in r) r.props = strs(r.props);
                return r;
            });
            if (q.type === 'notes') q.notes = rows(q.notes, ROW.note);
            if (q.type === 'list' && q.split) for (const r of q.rows) if (!LIST_GROUPS.some(([g]) => g === r.grp)) r.grp = groupOf(r.src, c);
            if (q.type === 'homebrew') for (const r of q.rows) { r.fx = rows(r.fx, ROW.fx); r.cost = Object.assign({ amt: '', what: '' }, isObj(r.cost) ? r.cost : {}); }
            if (q.type === 'homebrew') q.tabs = strs(q.tabs);
            if (q.type === 'trackers') { q.tabs = strs(q.tabs); for (const r of q.rows) r.levels = rows(r.levels, ROW.level); }
            if (q.type === 'spells') {
                for (const r of q.rows) r.fx = rows(r.fx, ROW.fx);
                q.meta = rows(q.meta, ROW.meta);
                q.sp = Object.assign({ cur: 0, max: 0 }, isObj(q.sp) ? q.sp : {});
                if (!('used' in q.sp)) q.sp.used = Math.max(0, nm(q.sp.max) - nm(q.sp.cur)); // was a left/max counter, now boxes
                q.flex = FLEX_COST.map((d, l) => (Array.isArray(q.flex) && q.flex[l] != null ? q.flex[l] : d));
                q.slots = Array.from({ length: 9 }, (_, l) => Object.assign({ max: 0, used: 0 }, isObj(q.slots && q.slots[l]) ? q.slots[l] : {}));
            }
            return q;
        });
        if (!('base' in out.hp)) out.hp.base = nm(out.hp.max);
        delete out.hp.max;
        out.hp = Object.assign(d.hp, out.hp);
        out.view = Object.assign(d.view, out.view);
        out.lists = Object.assign(d.lists, out.lists);
        // Misc joined the item categories later; older sheets get it once (removing it in Customise sticks)
        if (!out.miscCat && !/^misc$/im.test(out.lists.cats)) out.lists.cats = String(out.lists.cats).trim() + '\nMisc';
        out.miscCat = 1;
        out.profs = Object.assign(d.profs, out.profs);
        for (const k of ['armour', 'weapons', 'langs']) out.profs[k] = strs(out.profs[k]);
        out.profs.tools = rows(out.profs.tools, ROW.tool);
        out.conditions = strs(out.conditions);
        if (!/^(data:image\/|https:\/\/)/.test(out.art)) out.art = '';
        out.id = typeof c.id === 'string' ? c.id : d.id;
        return out;
    }

    // ---- storage ----
    let db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!isObj(db) || !isObj(db.chars)) db = { cur: '', chars: {} };
    for (const id in db.chars) db.chars[id] = normalise(db.chars[id]);
    if (!db.chars[db.cur]) db.cur = Object.keys(db.chars)[0] || '';
    if (!db.cur) { const c = blank(); db.chars[c.id] = c; db.cur = c.id; }
    let C = db.chars[db.cur];
    let warned = false;
    function store() {
        try { localStorage.setItem(KEY, JSON.stringify(db)); warned = false; }
        catch (e) { if (!warned) toast("Couldn't save: this browser's storage is full or blocked. Export the monster so you don't lose it.", 'err'); warned = true; }
    }
    // every edit is also backed up on the server as a new version (backup.php -> private/dnd/monster-backups/), a few seconds after typing stops
    const dirty = new Set();
    let backupTimer = 0;
    function flushBackups() {
        clearTimeout(backupTimer);
        for (const id of [...dirty]) {
            const c = db.chars[id];
            dirty.delete(id);
            if (!c) continue;
            const body = JSON.stringify(c);
            // keepalive lets a backup finish while the page closes (browsers allow it for bodies up to 64 KB)
            fetch('backup.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
                .then((r) => { if (!r.ok && r.status >= 500) dirty.add(id); }).catch(() => dirty.add(id));
        }
    }
    let undoSnap = null, undoTimer = 0; // undo for deletes, see snap()
    function saveNow() {
        if (undoSnap && Date.now() - undoSnap.at > 1000) dropUndo();
        store();
        drawSide();
        if (C) { dirty.add(C.id); clearTimeout(backupTimer); backupTimer = setTimeout(flushBackups, 4000); }
    }
    const save = debounce(saveNow, 250);
    addEventListener('pagehide', () => { store(); flushBackups(); });

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
        : `<button type="button" class="hb-rollbtn" data-act="roll2" data-g="${roll.g}" data-m="${roll.m}" data-x="${roll.x || 1}" data-t="${esc(title)}" title="Roll ${esc(title.toLowerCase())}">${esc(text)}</button>`);
    const dmgLinks = (dmg, V, name = '') => dmg.filter((d) => d.dice || d.type).map((d) => { const txt = d.dice ? diceText(d.dice, V) : '';
        return [d.dice && rollBtn(txt, diceRoll(d.dice, V), `${name || 'Damage'}${d.type ? ' ' + d.type.toLowerCase() : ''} damage`, ruleLink('act', 'damage rolls', txt, 'Damage rolls', 'Damage')),
            d.type && ruleLink('dmg', d.type, d.type, d.type + ' damage', 'Damage type')].filter(Boolean).join(' '); }).join(' + ');
    const hitLink = (v, name, kind, rl, title) => { const txt = show({ ...v, signed: true }) + ' to hit';
        return rollBtn(txt, Number.isFinite(+v.v) ? { g: '20x1', m: +v.v } : null, `${name || 'Attack'} to hit`, ruleLink(kind, rl, txt, title, 'To hit')); };
    // effects in a summary; healing and temp HP are buttons that roll them and apply them to your hit points
    const fxHtml = (fx, V, rp) => fx.map((e, j) => ((e.k === 'heal' || e.k === 'temp') && e.dice
        ? `<button type="button" class="hb-rollbtn" data-act="fxapply" data-p="${rp}.fx.${j}" title="Apply to your hit points">${esc(fxOne(e, V))}</button>` : esc(fxOne(e, V)))).filter(Boolean);
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
    function top() {
        const DICE = [4, 6, 8, 10, 12, 20].map((n) => [n, 'd' + n]);
        // name, creature type, CR, alignment and age are in the bar (conditions, speed and defences sit here)
        const id = '';
        const art =`<button type="button" class="hb-art" data-act="art" aria-label="${C.art ? 'Change' : 'Add'} monster art">${C.art ? `<img src="${esc(C.art)}" alt="" referrerpolicy="no-referrer" width="300" height="300">` : '<span>Add art</span>'}</button>`;
        const abils = `<div class="hb-abils">${C.abilities.map((a, i) => `<div class="hb-abil">
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
        const more = `<div class="hb-more">
            <button type="button" class="btn small" data-act="more" aria-expanded="${!!open.more}" aria-controls="hb-more">Conditions, speed and defences</button>
            <span data-c="speed"></span><span class="hb-condsum" data-c="cond"></span><span class="muted" data-c="def"></span>
        </div>
        <div class="card hb-more-body" id="hb-more"${open.more ? '' : ' hidden'}>
            <h3>Conditions</h3>
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
            </div>
        </div>`;
        const saves = `<section class="card hb-saves"><h2>Saving throws</h2><div class="hb-savegrid">${C.abilities.map((a, i) => `<div class="hb-save">
            <label class="hb-dot">${f(`abilities.${i}.save`, 'Proficient in ' + a.name + ' saves', { check: true })}</label>
            <span>${esc(a.key)}</span>${rollv('save:' + i, a.name + ' save')}
        </div>`).join('')}</div></section>`;
        const senses = `<section class="card hb-senses"><h2>Senses</h2>
            <div class="rows">${C.passives.map((p, i) => `<div class="rowi"><button type="button" class="hb-link grow" data-act="sense" data-i="${i}">${esc(p.name)}</button>${fx(`passives.${i}.f`, p.name, false)}${p.unit ? `<small class="muted">${esc(p.unit)}</small>` : ''}</div>`).join('')}</div>
            <label class="hb-lbl hb-other">Other senses ${f('senses', 'Other senses', { area: true, ph: '120 ft magical darkvision' })}</label>
        </section>`;
        return `<div class="hb-top-id"><div class="hb-id">${id}${more}</div></div><div class="hb-top-abil">${abils}</div><div class="hb-top-combat">${combat}${pinned()}</div>
            <div class="hb-side"><div class="hb-top-art">${art}</div><div class="hb-top-saves">${saves}</div><div class="hb-top-senses">${senses}</div></div>`;
    }

    // notes pinned to the sheet: always on screen, editable in place
    function pinned() {
        const pins = C.panels.flatMap((p, pi) => (p.type === 'notes' && p.on ? p.notes.map((n, i) => [n, `panels.${pi}.notes.${i}`, pi]).filter(([n]) => n.pinned) : []));
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
        return `<div class="hb-entry">
            <div class="hb-entry-h">${lead}<button type="button" class="hb-link" data-act="info" data-p="${rp}">${esc(r.name || 'Unnamed')}</button>
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
            const count = (fn) => p.notes.filter(fn).length;
            const groups = uniq(p.notes.map(g).filter(Boolean)).sort((a, b) => a.localeCompare(b));
            const opts = [['all', 'All', p.notes.length], ['pinned', 'Pinned', count((n) => n.pinned)], ...groups.map((x) => ['g:' + x, x, count((n) => g(n) === x)])];
            if (groups.length && count((n) => !g(n))) opts.push(['none', 'No group', count((n) => !g(n))]);
            const cur = pickSub(p, opts);
            const inSub = (n) => cur === 'all' || (cur === 'pinned' ? n.pinned : cur === 'none' ? !g(n) : g(n) === cur.slice(2));
            const by = { created: (a, b) => b.created - a.created, title: (a, b) => (a.title || '').localeCompare(b.title || '') }[p.sort] || ((a, b) => b.updated - a.updated);
            const shown = p.notes.map((n, i) => [n, i]).filter(([n]) => inSub(n)).sort(([a], [b]) => (b.pinned - a.pinned) || by(a, b));
            const list = shown.map(([n, i]) => {
                const rp = `${path}.notes.${i}`, s = `${n.title} ${n.group} ${n.body}`.toLowerCase();
                return `<button type="button" class="hb-nitem${n.id === p.open ? ' on' : ''}" data-act="nopen" data-p="${path}" data-id="${esc(n.id)}" data-s="${esc(s)}" aria-pressed="${n.id === p.open}"${noteQ && !s.includes(noteQ) ? ' hidden' : ''}>
                    <span class="hb-ntitle"><b data-c="ntitle:${rp}"></b>${n.pinned ? '<span class="badge">Pinned</span>' : ''}</span>
                    <span class="hb-nsnip" data-c="nsnip:${rp}"></span>
                    <small>${g(n) ? esc(g(n)) + ' · ' : ''}<span data-c="nago:${rp}"></span></small>
                </button>`;
            }).join('');
            const oi = p.notes.findIndex((n) => n.id === p.open), n = p.notes[oi], np = `${path}.notes.${oi}`;
            const editor = !n ? `<p class="muted hb-nempty">${p.notes.length ? 'Pick a note, or make a new one.' : 'No notes yet. Make one with New note.'}</p>` : `<div class="hb-nedit">
                ${f(np + '.title', 'Note title', { cls: 'hb-ntitle-in', ph: 'Untitled note' })}
                <div class="hb-nbar">
                    <label class="hb-ngroup">Group ${f(np + '.group', 'Group', { list: 'hb-dl-ng-' + pi, ph: 'No group' })}</label>
                    <button type="button" class="btn small" data-act="npin" data-p="${np}" aria-pressed="${n.pinned}">${n.pinned ? 'Unpin from sheet' : 'Pin to sheet'}</button>
                    <button type="button" class="btn small" data-act="ndup" data-p="${path}" data-i="${oi}">Duplicate</button>
                    <button type="button" class="btn small" data-act="ndel" data-p="${path}" data-i="${oi}">Delete</button>
                </div>
                ${f(np + '.body', 'Note', { area: true, cls: 'hb-nbody', ph: 'Write anything' })}
                <small class="muted"><span data-c="nago:${np}"></span> · created ${esc(dateText(n.created))}</small>
            </div>`;
            const rename = cur.startsWith('g:') ? `<label class="hb-grename">Rename this group <input class="field hb-gname" data-p="${path}" data-g="${esc(cur.slice(2))}" value="${esc(cur.slice(2))}" autocomplete="off"></label>` : '';
            return `<div class="hb-ntools">
                    <button type="button" class="btn small" data-act="nnew" data-p="${path}">New note</button>
                    <button type="button" class="btn small" data-act="nsession" data-p="${path}">New session note</button>
                    <input class="field hb-nq" type="search" value="${esc(noteQ)}" placeholder="Search notes" aria-label="Search notes" autocomplete="off">
                    ${sel(path + '.sort', 'Sort notes', [['edited', 'Recently edited'], ['created', 'Newest first'], ['title', 'Title A to Z']])}
                </div>
                ${subtabs(path + '.sub', opts, cur)}${rename}
                <div class="hb-notes"><div class="hb-nlist">${list || '<p class="muted">No notes here.</p>'}</div>${editor}</div>
                <datalist id="hb-dl-ng-${pi}">${groups.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
        },

        combat: (p, path) => `<div class="kv"><span>Death save successes</span><span>${pips(path + '.ok', 3)}</span></div>
            <div class="kv"><span>Death save failures</span><span class="hb-bad-pips">${pips(path + '.bad', 3)}</span></div>
            ${rulesBlock('hp', ['Death saving throws', 'Falling unconscious', 'Stabilizing a creature', 'Instant death'], 'Death save rules')}
            <h3>Hit dice</h3>
            <div class="rows">${C.classes.map((c, i) => `<div class="rowi"><span class="grow hb-hdset"><label>Hit dice ${f(`classes.${i}.level`, 'Number of hit dice', { num: true, cls: 'hb-n' })}</label> ${sel(`classes.${i}.die`, 'Hit die', [4, 6, 8, 10, 12, 20].map((n) => [n, 'd' + n]))}</span><small data-c="hdl:${i}"></small>${pips(`classes.${i}.hdUsed`, c.level)}</div>`).join('')}</div>
            <p class="muted hb-hint">Filled boxes are spent. Spend any number in a short rest; a long rest gives half back, rounded up.</p>`,
    };

    function panels() {
        const vis = C.panels.map((p, i) => [p, i]).filter(([p]) => p.on);
        if (!vis.length) return '<p class="note">Every panel is hidden. Turn some back on in Customise.</p>';
        const card = ([p, i]) => `<section class="card hb-panel" id="hb-p-${esc(p.id)}"><h2>${esc(p.title)}</h2>${R[p.type](p, 'panels.' + i, i)}</section>`;
        if (C.view.all) return `<div class="masonry">${vis.map(card).join('')}</div>`;
        const cur = vis.find(([p]) => p.id === C.view.tab) || vis[0];
        return `<div class="stabs hb-tabs">${vis.map(([p]) => `<button type="button" class="${p === cur[0] ? 'on' : ''}" data-act="tab" data-id="${esc(p.id)}" aria-pressed="${p === cur[0]}">${esc(p.title)}</button>`).join('')}</div>${card(cur)}`;
    }

    // ---- toolbar ----
    const clsText = (c) => (String(c.cr || '').trim() ? 'CR ' + c.cr : '');
    const pickOpts = () => Object.values(db.chars).map((c) =>
        `<option value="${esc(c.id)}"${c.id === C.id ? ' selected' : ''}>${esc(c.name || 'Unnamed monster')}${clsText(c) ? ' — ' + esc(clsText(c)) : ''}</option>`).join('');
    // the top line: which character, who they are, and (behind Edit) the buttons to make, import, export or delete one
    function bar() {
        return `<select class="field hb-pick" data-act="pick" aria-label="Monster">${pickOpts()}</select>
            <button type="button" class="btn small" data-act="manage" aria-expanded="${!!open.manage}" aria-controls="hb-manage">${PENCIL} Edit</button>
            <button type="button" class="btn small" data-act="dup">Duplicate</button>
            <span class="hb-manage" id="hb-manage"${open.manage ? '' : ' hidden'}>
                <button type="button" class="btn small" data-act="new">New</button>
                <button type="button" class="btn small" data-act="find">Import monster</button>
                <button type="button" class="btn small" data-act="import">Import file</button>
                <button type="button" class="btn small" data-act="export">Export</button>
                <button type="button" class="btn small" data-act="delete">Delete</button>
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

    let srdList = null;
    function loadSrdList() {
        if (srdList) return srdList;
        // ?list=N: bump N when the list changes, browsers cache it for a day
        srdList = fetch('../player/spells.php?list=2').then((r) => (r.ok ? r.json() : Promise.reject())).then((list) => {
            // the label carries the name too: Firefox shows only the label, Chrome shows the value beside it
            $('#hb-dl-srd').innerHTML = list.map(([, n, l]) => `<option value="${esc(n)}" label="${esc(n + ' · ' + (l ? ordinal(l) + ' level' : 'cantrip'))}"></option>`).join('');
            return list;
        }).catch(() => { srdList = null; toast("Couldn't load the SRD spell list. You can still type spells in yourself.", 'err'); return []; });
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
    function openDrawer(html) { $('#hb-drawer-body').innerHTML = html; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); drawer.focus(); }
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
            <p class="hb-dicelink"><a class="btn" href="/games/dnd/dice/">Customise dice</a> <span class="muted">Pick the dice, their sounds, trails and nat 1 and nat 20 effects on the Dice Sets page; they apply here straight away.</span></p>
            <label class="check">${f('view.noSound', 'Turn off dice sounds', { check: true })} No sound when the dice land</label>
            <label class="check">${f('view.noAnim', 'Turn off thrown dice', { check: true })} Show results straight away instead of throwing 3D dice across the page</label>
            <h3>Panels</h3>
            <label class="check">${f('view.all', 'Show every panel at once', { check: true })} Show every panel at once instead of tabs</label>
            <label class="check">${f('view.prep', 'Always show prepared spells', { check: true })} Always show the Prepared tab and checkboxes (for homebrew classes; otherwise only Artificer, Cleric, Druid, Paladin and Wizard get them)</label>
            ${table(['Show', 'Title', 'Type', ''], C.panels.map((p, i) => `<tr><td class="hb-c">${f(`panels.${i}.on`, 'Show ' + p.title, { check: true })}</td>
                <td>${f(`panels.${i}.title`, 'Title')}</td><td class="muted">${TYPES[p.type]}</td>
                <td class="hb-nowrap"><button type="button" class="hb-x" data-act="mv" data-i="${i}" data-d="-1" aria-label="Move ${esc(p.title)} up" title="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" class="hb-x" data-act="mv" data-i="${i}" data-d="1" aria-label="Move ${esc(p.title)} down" title="Move down"${i < C.panels.length - 1 ? '' : ' disabled'}>↓</button>${del('panels', i, p.title)}</td></tr>`).join(''))}
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
    const dlgHTML = () => (dlgMode === 'custom' ? customDlg() : dlgMode.kind === 'crop' ? cropDlg() : dlgMode.kind === 'rest' ? restDlg(dlgMode.r) : formulaDlg(dlgMode));
    // ---- dice: a card for each roll and the dice tray in the bottom-left corner ----
    const DICE = [4, 6, 8, 10, 12, 20, 100], tray = { open: false, pool: {} };
    // the dice chosen on the Dice Sets page (/games/dnd/dice/, choice.js), read at every roll so a change there applies here straight away;
    // with no choice yet, the style this sheet had picked before (C.view.diceStyle). Plain purple if any of it fails to load.
    let choiceP = null;
    const chosenStyle = (m) => (choiceP ||= import(`/games/dnd/dice/choice.js${(($('script[src*="/monster.js"]')?.src || '').match(/\?v=\d+/) || [''])[0]}`)
        .catch((e) => { choiceP = null; throw e; }))
        .then((c) => { const k = C.view.diceStyle || 'purple';
            return c.styleFrom(c.readChoice() || { set: m.STYLES[k] ? { key: k, builtin: true } : { key: k, url: `./sets/${k}.js` } }, m); })
        .catch(() => 'purple');
    const die = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % n) + 1; };
    let rollTimer = 0;
    // groups: [[sides, count]], mod: number added on top
    // groups [['coin', 1]] flips a coin: the card shows Heads or Tails instead of a total
    // each > 1 splits the dice into that many separate results, e.g. one per target ("4 × (1d12 + 10)"); mod covers them all
    function rollShow(title, groups, mod = 0, each = 1) {
        const coin = groups[0]?.[0] === 'coin', side = (v) => (v === 'heads' ? 'Heads' : 'Tails');
        const card = (rolls) => {
            const tail = (m) => (m ? ` ${m < 0 ? '−' : '+'} ${Math.abs(m)}` : '');
            // separate results: result i takes its share of every group's dice
            const hits = each > 1 && !coin ? Array.from({ length: each }, (_, i) => rolls.flatMap(([, r]) => r.slice(i * r.length / each, (i + 1) * r.length / each))) : null;
            const total = coin ? side(rolls[0][1][0]) : hits ? hits.map((v) => v.reduce((a, b) => a + b, mod / each)).join(', ')
                : rolls.reduce((t, [, r]) => t + r.reduce((a, b) => a + b, 0), 0) + mod;
            const expr = coin ? 'Coin' : hits ? `${each} × (${groups.map(([n, c]) => `${c / each}d${n}`).join(' + ')}${tail(mod / each)})`
                : groups.map(([n, c]) => `${c}d${n}`).join(' + ') + tail(mod);
            const shown = coin ? '' : hits ? hits.map((v) => v.join(' + ') + tail(mod / each)).join(' | ') : rolls.map(([, r]) => r.join(', ')).join(' | ') + tail(mod);
            // a lone d20 shows a natural 20 or 1
            const nat = groups.length === 1 && groups[0][0] === 20 && groups[0][1] === 1 ? (rolls[0][1][0] === 20 ? ' hb-nat20' : rolls[0][1][0] === 1 ? ' hb-nat1' : '') : '';
            // just under the sticky sheet bar, which wraps taller on phones
            const hbBar = $('#hb-bar');
            $('#hb-rolls').style.top = (getComputedStyle(hbBar).position === 'sticky' ? Math.max(76, hbBar.offsetHeight + 12) : 16) + 'px';
            $('#hb-rolls').innerHTML = `<button type="button" class="hb-rollcard${nat}${hits ? ' hb-each' : ''}" data-act="rollx" aria-label="Dismiss roll">
                <span class="hb-rollhead"><b>${esc(title)}</b><small>${esc(expr)}</small></span>
                <span class="hb-rolldice">${esc(shown)}</span><span class="hb-rolltot">${total}</span></button>`;
            clearTimeout(rollTimer); rollTimer = setTimeout(() => { $('#hb-rolls').innerHTML = ''; }, 12000);
            // the roll log keeps the last 100 rolls with the character
            (C.rolls ||= []).unshift({ at: Date.now(), title, expr, shown, total, nat: nat.trim() });
            C.rolls.length = Math.min(C.rolls.length, 100);
            saveNow(); drawLog(); if (tray.open) drawTray();
        };
        const quick =() => card(groups.map(([n, c]) => [n, Array.from({ length: c }, () => (n === 'coin' ? (die(2) === 1 ? 'heads' : 'tails') : die(n)))]));
        if (C.view.noAnim || matchMedia('(prefers-reduced-motion: reduce)').matches) return quick();
        $('#hb-rolls').innerHTML = '';
        // 3D dice (dice3d.js, three.js + cannon-es from jsDelivr) load on the first roll; the face that lands up is the result
        const css = getComputedStyle(main);
        dice3d().then(async (m) => m.throwDice(groups, { style: await chosenStyle(m), accent: css.getPropertyValue('--btn').trim() || '#5b3f8f', sound: !C.view.noSound }))
            .then(card, () => { dice3dP = null; quick(); });
    }
    // shortcut: dice3d.js and dice/choice.js reuse monster.js's ?v= version, so a change to either alone needs monster.js touched too (last: coins fly in from any side, 31 Oct 2026)
    let dice3dP = null;
    const dice3d = () => dice3dP || (dice3dP = import(new URL('/games/dnd/dice/dice3d.js' + (($('script[src*="/monster.js"]')?.src || '').match(/\?v=\d+/) || [''])[0], location.href).href));
    function drawTray() {
        const box = $('#hb-dice');
        box.hidden = !!C.view.noTray;
        if (box.hidden) return;
        const groups = DICE.filter((n) => tray.pool[n]).map((n) => [n, tray.pool[n]]);
        box.innerHTML = `${tray.open ? `<div class="hb-tray" role="group" aria-label="Dice tray">
                <div class="hb-traydice">${DICE.map((n) => `<button type="button" class="hb-die" data-act="die" data-n="${n}" aria-label="Add a d${n}" title="Right-click to remove one">d${n}${tray.pool[n] ? `<small>${tray.pool[n]}</small>` : ''}</button>`).join('')}</div>
                <div class="hb-trayrow"><span class="muted">${groups.length ? groups.map(([n, c]) => `${c}d${n}`).join(' + ') : 'Click dice to add them'}</span>
                    <button type="button" class="btn small" data-act="coin">Flip a coin</button><button type="button" class="btn small" data-act="dieclear"${groups.length ? '' : ' disabled'}>Clear</button><button type="button" class="btn small primary" data-act="dieroll"${groups.length ? '' : ' disabled'}>Roll</button></div>
                ${!logSide() && !C.view.noRoll && (C.rolls || []).length ? `<div class="hb-traylog"><span class="muted">Recent rolls</span>${logRows(5)}</div>` : ''}
            </div>` : ''}<button type="button" class="hb-dicebtn" data-act="tray" aria-expanded="${tray.open}" aria-label="${tray.open ? 'Close' : 'Open'} the dice tray" title="Dice">${D20}</button>`;
    }
    // ---- roll log: in the empty space left of the sheet when there is room, otherwise the last few in the dice tray ----
    // the encounter list holds the space left of the sheet, so recent rolls stay in the dice tray
    const logSide = () => false;
    const logTime = (ms) => { const d = new Date(ms); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : dateText(ms); };
    const logRows = (n) => `<ol class="hb-logl">${(C.rolls || []).slice(0, n).map((r) => `<li class="hb-logi${r.nat ? ' ' + r.nat : ''}">
        <span class="hb-logh"><b>${esc(r.title)}</b><small title="${esc(new Date(r.at).toLocaleString())}">${esc(logTime(r.at))}</small></span>
        <span class="hb-logd">${esc(r.expr)} · ${esc(r.shown)}</span><span class="hb-logt${String(r.total).includes(',') ? ' hb-each' : ''}">${esc(String(r.total))}</span></li>`).join('')}</ol>`;
    function drawLog() {
        const box = $('#hb-log'), left = root.getBoundingClientRect().left;
        box.hidden = !!C.view.noRoll || !logSide();
        if (box.hidden) return;
        box.style.width = Math.min(360, left - 32) + 'px';
        box.innerHTML = `<div class="hb-logbar"><h2>Roll log</h2>${(C.rolls || []).length ? '<button type="button" class="btn small" data-act="logclear">Clear</button>' : ''}</div>
            ${(C.rolls || []).length ? logRows(100) : '<p class="muted">Your dice rolls show up here.</p>'}`;
    }
    const D20 = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M12 2 21 7v10l-9 5-9-5V7zM12 2 7.5 9.5h9zM3 7l4.5 2.5L12 17l4.5-7.5L21 7M7.5 9.5 3 17M16.5 9.5 21 17M12 17v5M3 17h18"/></svg>';

    function draw() {
        // sorcery points are boxes: an old counter turns into boxes with the same number left
        for (const p of C.panels) if (p.type === 'trackers') for (const r of p.rows) if (r.kind === 'count' && /^sorcery points?$/i.test(String(r.name).trim())) {
            Object.assign(r, { kind: 'pips', used: Math.max(0, maxOf(r.max) - nm(r.cur)) });
        }
        $('#hb-bar').innerHTML = bar();
        drawSide();
        root.innerHTML = top() + `<div class="hb-top-panels">${panels()}</div><div hidden>${datalists()}</div>`;
        drawTray(); drawLog();
        if (dlg.open && dlgMode && !['rest', 'crop'].includes(dlgMode.kind)) { dlgBody.innerHTML = dlgHTML(); }
        refresh();
    }
    function showDlg(mode) { dlgMode = mode; dlgBody.innerHTML = dlgHTML(); dlg.showModal(); refresh(); }
    dlg.addEventListener('close', () => { dlgMode = null; draw(); });

    // ---- monsters only: the encounter list on the left, Duplicate, and importing from the monster list ----
    // "Goblin" twice becomes "Goblin 1" and "Goblin 2"
    function numbered(name) {
        const all = Object.values(db.chars), base = name.replace(/\s+\d+$/, '');
        if (!all.some((x) => x.name.replace(/\s+\d+$/, '') === base)) return name;
        all.forEach((x) => { if (x.name === base) x.name = base + ' 1'; });
        let n = 2;
        while (all.some((x) => x.name === `${base} ${n}`)) n++;
        return `${base} ${n}`;
    }
    function drawSide() {
        const box = $('#mon-side');
        if (!box) return;
        const list = Object.values(db.chars);
        box.innerHTML = `<h2>Encounter <span class="n">${list.length}</span></h2><div class="mon-list">${list.map((c) => {
            const max = nm(c.hp.base) + nm(c.hp.mod), on = c === C;
            return `<button type="button" class="mon-item${on ? ' on' : ''}${nm(c.hp.cur) <= 0 ? ' down' : ''}" data-act="side" data-id="${esc(c.id)}"${on ? ' aria-current="true"' : ''}>
                <b>${esc(c.name || 'Unnamed monster')}</b><small>HP ${nm(c.hp.cur)}/${max}${String(c.cr).trim() ? ' · CR ' + esc(c.cr) : ''}</small></button>`;
        }).join('')}</div>`;
    }
    // a copy with full hit points, straight after the original in the encounter
    function dupMonster() {
        const c = normalise(JSON.parse(JSON.stringify(C)));
        c.id = uid(); c.name = numbered(C.name || 'Unnamed monster');
        Object.assign(c.hp, { cur: hpMax(), temp: 0 });
        c.conditions = [];
        const ent = Object.entries(db.chars);
        ent.splice(ent.findIndex(([id]) => id === C.id) + 1, 0, [c.id, c]);
        db.chars = Object.fromEntries(ent);
        switchTo(c);
    }

    let monIndex = null;
    async function openFind() {
        open.manage = false;
        $('#mon-dlg').showModal(); $('#mon-q').focus();
        if (monIndex) return monSearch();
        try {
            const r = await fetch('monsters.json');
            if (!r.ok) throw new Error();
            monIndex = await r.json();
            monSearch();
        } catch (err) { Object.assign($('#mon-status'), { className: 'err', textContent: "Couldn't load the monster list. Try again in a minute." }); }
    }
    const crText = (n) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[n] || String(n);
    // names that start with the search first, then names that contain it; at most 100 shown
    function monSearch() {
        const q = $('#mon-q').value.trim().toLowerCase(), all = monIndex.list, st = $('#mon-status');
        const hits = q ? [...all.filter((x) => x[1].toLowerCase().startsWith(q)), ...all.filter((x) => !x[1].toLowerCase().startsWith(q) && x[1].toLowerCase().includes(q))] : all;
        st.className = hits.length ? 'muted' : 'note';
        st.textContent = !hits.length ? 'No monsters match that name.' : hits.length > 100 ? `${hits.length.toLocaleString()} monsters. Type to narrow them down.` : `${hits.length} monster${hits.length === 1 ? '' : 's'}`;
        $('#mon-results').innerHTML = hits.slice(0, 100).map(([key, name, cr, type, src]) => `<button type="button" class="mon-hit" data-mon="${esc(key)}">
            <b>${esc(name)}</b><small>CR ${esc(crText(cr))} ${esc(type)} · ${esc(monIndex.sources[src]?.title || src)}</small></button>`).join('');
    }
    async function takeMonster(b) {
        b.disabled = true; b.querySelector('small').textContent = 'Adding...';
        try {
            const r = await fetch('monsters.php?i=' + encodeURIComponent(b.dataset.mon));
            const j = await r.json();
            if (!r.ok) throw new Error(j.error);
            const c = normalise(fromStatBlock(j, monIndex.sources));
            // the empty monster a first visit starts with is replaced rather than kept
            if (Object.keys(db.chars).length === 1 && !C.name.trim() && !C.race.trim()) delete db.chars[C.id];
            c.name = numbered(c.name);
            $('#mon-dlg').close();
            switchTo(c);
            toast(`Added ${c.name}.`, 'ok');
        } catch (err) { toast(err.message || "Couldn't reach the monster list. Try again in a minute.", 'err'); monSearch(); }
    }
    $('#mon-q').addEventListener('input', debounce(() => monIndex && monSearch(), 80));
    $('#mon-dlg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mon]');
        if (b) takeMonster(b);
        else if (e.target.closest('[data-mon-close]')) $('#mon-dlg').close();
    });

    // a stat block from monsters.php (dnd5eapi.co when src is "srd", otherwise Open5e) as a sheet:
    // saves and skills become proficiency plus any extra bonus, attacks and saving-throw actions become Actions, traits Passive abilities
    const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
    const usage = (u) => (!u ? '' : u.type === 'recharge on roll' ? ` (Recharge ${u.min_value}${u.min_value < 6 ? '–6' : ''})` : u.type === 'per day' ? ` (${u.times}/Day)`
        : u.type === 'recharge after rest' ? ` (Recharges after a ${(u.rest_types || []).join(' or ')} rest)` : '');
    function fromAction(a, time) {
        const d = String(a.desc || ''), hit = /([+-−]\s?\d+)\s+to hit/i.exec(d), dc = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i.exec(d);
        const reach = /\b(?:reach|range) ([\d/]+ ft)/i.exec(d);
        return Object.assign(ROW.attack(), { name: (a.name || '') + usage(a.usage), time, desc: d, range: reach ? reach[1] : '',
            mode: hit ? 'hit' : dc ? 'save' : 'none', hit: hit ? String(nm(hit[1].replace(/[\s]/g, '').replace('−', '-'))) : 'STR + PROF',
            save: dc ? dc[2].slice(0, 3).toUpperCase() : 'DEX', dc: dc ? dc[1] : '8 + PROF + STR',
            dmg: [...d.matchAll(/\((\d+d\d+(?:\s*[+−-]\s*\d+)?)\)\s+([a-z]+)\s+damage/gi)].map(([, dice, type]) => ({ dice: dice.replace(/−/g, '-'), type: cap(type.toLowerCase()) })) });
    }
    function fromStatBlock({ src, m }, sources) {
        const c = blank(), srd = src === 'srd', cr = +(srd ? m.challenge_rating : m.cr) || 0, pb = Math.max(2, Math.ceil(cr / 4) + 1);
        const FULL = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
        c.abilities.forEach((a, i) => { a.score = +m[FULL[i]] || 10; });
        const mod = (key) => { const a = c.abilities.find((x) => x.key === key); return a ? Math.floor((a.score - 10) / 2) : 0; };
        Object.assign(c, { name: m.name || 'Monster', cr: crText(cr), alignment: m.alignment || '',
            race: `${m.size ? m.size + ' ' : ''}${String(m.type || '').toLowerCase()}${m.subtype ? ` (${m.subtype})` : ''}` });
        const saves = {}, skills = {};
        if (srd) for (const p of m.proficiencies || []) {
            const n = p.proficiency?.name || '';
            if (n.startsWith('Saving Throw: ')) saves[n.slice(14).toUpperCase()] = p.value;
            else if (n.startsWith('Skill: ')) skills[n.slice(7).toLowerCase()] = p.value;
        } else {
            FULL.forEach((f, i) => { if (m[f + '_save'] != null) saves[c.abilities[i].key] = m[f + '_save']; });
            for (const [k, v] of Object.entries(m.skills || {})) skills[k.replace(/_/g, ' ').toLowerCase()] = v;
        }
        for (const a of c.abilities) if (saves[a.key] != null) { a.save = true; const x = saves[a.key] - mod(a.key) - pb; if (x) a.sb = String(x); }
        for (const s of c.skills) {
            const v = skills[s.name.toLowerCase()];
            if (v == null) continue;
            const base = v - mod(s.ab);
            s.p = base >= 2 * pb ? 2 : 1;
            if (base - s.p * pb) s.b = String(base - s.p * pb);
        }
        const ac = srd ? (m.armor_class || [])[0] || {} : { value: m.armor_class }, acWhy = srd ? (ac.armor || []).map((x) => x.name).join(', ') || (ac.type === 'natural' ? 'natural armour' : '') : m.armor_desc || '';
        c.ac = `${+ac.value || 10}${acWhy ? ` [${String(acWhy).replace(/[[\]]/g, '')}]` : ''}`;
        const hp = +m.hit_points || 1, hd = /(\d+)d(\d+)/.exec(m.hit_points_roll || m.hit_dice || '');
        c.hp = { cur: hp, base: hp, temp: 0, mod: 0 };
        if (hd) c.classes = [{ name: '', level: +hd[1], die: +hd[2], hdUsed: 0 }];
        const sp = Object.entries(m.speed || {}).filter(([k, v]) => k !== 'hover' && nm(v)).map(([k, v]) => ({ type: cap(k), ft: nm(v), hover: k === 'fly' && !!m.speed.hover }));
        if (sp.length) c.speeds = sp;
        const txt = (x) => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : y.name)).join(', ') : String(x || ''));
        Object.assign(c, { res: txt(m.damage_resistances), vul: txt(m.damage_vulnerabilities),
            imm: [txt(m.damage_immunities), txt(m.condition_immunities) && 'conditions: ' + txt(m.condition_immunities).toLowerCase()].filter(Boolean).join('; '),
            senses: srd ? Object.entries(m.senses || {}).filter(([k]) => k !== 'passive_perception').map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')
                : String(m.senses || '').replace(/,?\s*passive Perception \d+/i, '') });
        c.profs.langs = String(m.languages || '').split(/,\s*/).map((x) => x.trim()).filter((x) => x && !/^[—-]$/.test(x));
        const att = c.panels.find((p) => p.type === 'attacks'), list = c.panels.find((p) => p.type === 'list');
        [[m.actions, 'Action'], [m.bonus_actions, 'Bonus action'], [m.reactions, 'Reaction'], [m.legendary_actions, 'Legendary']]
            .forEach(([l, time]) => { for (const a of Array.isArray(l) ? l : []) att.rows.push(fromAction(a, time)); });
        for (const t of [...(m.special_abilities || []), ...(m.legendary_desc ? [{ name: 'Legendary actions', desc: m.legendary_desc }] : [])]) {
            list.rows.push(Object.assign(ROW.list(), { name: (t.name || '') + usage(t.usage), src: 'Trait', text: t.desc || '' }));
        }
        const s = sources[srd ? 'srd' : m.document__slug];
        if (s) c.panels.find((p) => p.type === 'notes').notes.push(Object.assign(ROW.note(), { title: 'Source', group: 'Monster', body: `${s.title} (${s.licence}). Credits are at the bottom of the page.` }));
        return c;
    }

    function switchTo(c) { saveNow(); C = c; db.chars[c.id] = c; db.cur = c.id; openRows.clear(); saveNow(); draw(); }

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
    undoBox.addEventListener('click', (e) => {
        if (!e.target.closest('button') || !undoSnap) return;
        const s = undoSnap;
        dropUndo(); db = JSON.parse(s.db);
        switchTo(db.chars[s.cur] || Object.values(db.chars)[0] || blank());
        toast('Restored.', 'ok');
    });

    // ---- events ----
    const main = $('.hb');
    // one column in the bottom-left corner: the latest roll above the tray and its button
    main.insertAdjacentHTML('beforeend', '<div class="hb-dice"><div id="hb-rolls" aria-live="polite"></div><div class="hb-trayslot" id="hb-dice"></div></div>');
    main.insertAdjacentHTML('beforeend', '<aside class="hb-log" id="hb-log" aria-label="Roll log" hidden></aside>');
    addEventListener('resize', () => drawLog());
    main.addEventListener('input', (e) => {
        const el = e.target;
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
            for (const it of el.closest('.hb-panel').querySelectorAll('.hb-nitem')) it.hidden = !!noteQ && !it.dataset.s.includes(noteQ);
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
        if (el.dataset.act === 'pick') return switchTo(db.chars[el.value]);
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
        if (how === 'dmg') {
            const soak = Math.min(nm(C.hp.temp), amt);
            C.hp.temp = nm(C.hp.temp) - soak;
            C.hp.cur = Math.max(0, nm(C.hp.cur) - (amt - soak));
        } else if (how === 'temp') {
            if (amt < nm(C.hp.temp)) toast(`Temp HP doesn't stack, so you keep ${C.hp.temp}.`, 'note');
            C.hp.temp = Math.max(nm(C.hp.temp), amt);
        } else C.hp.cur = Math.min(hpMax(), nm(C.hp.cur) + amt);
        saveNow(); draw();
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
    // right-click a die in the tray to take one away
    main.addEventListener('contextmenu', (e) => {
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
            if (e.k === 'heal') { C.hp.cur = Math.min(hpMax(), nm(C.hp.cur) + Math.max(0, amt)); toast(`${name}: healed ${Math.max(0, amt)} (${rolled}).`, 'ok'); }
            else if (amt <= nm(C.hp.temp)) toast(`${name}: ${amt} temp HP, but temp HP doesn't stack, so you keep ${C.hp.temp}.`, 'note');
            else { C.hp.temp = amt; toast(`${name}: ${amt} temp HP (${rolled}).`, 'ok'); }
            saveNow(); return draw();
        }
        if (act === 'roll2') return rollShow(b.dataset.t, b.dataset.g.split(',').map((x) => x.split('x').map(Number)), +b.dataset.m || 0, +b.dataset.x || 1);
        if (act === 'roll') { const v = value(b.dataset.k, vars()); return rollShow(b.dataset.t, [[20, 1]], Number.isFinite(+v.v) ? +v.v : 0); }
        if (act === 'rollx') { clearTimeout(rollTimer); $('#hb-rolls').innerHTML = ''; return; }
        if (act === 'tray') { tray.open = !tray.open; return drawTray(); }
        if (act === 'logclear') { if (confirm('Clear the roll log for this monster?')) { C.rolls = []; saveNow(); drawLog(); } return; }
        if (act === 'die') { tray.pool[b.dataset.n] = (tray.pool[b.dataset.n] || 0) + 1; return drawTray(); }
        if (act === 'dieclear') { tray.pool = {}; return drawTray(); }
        if (act === 'coin') { rollShow('Coin flip', [['coin', 1]]); tray.open = false; return drawTray(); }
        if (act === 'dieroll') { rollShow('Dice', DICE.filter((n) => tray.pool[n]).map((n) => [n, tray.pool[n]])); tray.pool = {}; tray.open = false; return drawTray(); }
        if (act === 'coins') return coinApply(b.parentElement.querySelector('.hb-coinin'), b.dataset.sign);
        if (act === 'info') { const r = get(p); if ('lvl' in r && r.srd && needsFill(r)) srdFill(p); return info(p); }
        if (act === 'dclose') return closeDrawer();
        if (act === 'more') { open.more = !open.more; return draw(); }
        if (act === 'manage') { open.manage = !open.manage; $('#hb-bar').innerHTML = bar(); return $('[data-act=manage]').focus(); }
        if (act === 'hpedit') { open.hp = !open.hp; return draw(); }
        if (act === 'tab') { C.view.tab = b.dataset.id; save(); return draw(); }
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
        if (act === 'nopen') { get(p).open = b.dataset.id; save(); return draw(); }
        if (act === 'ngo') {
            const P = C.panels[i];
            P.open = b.dataset.id; C.view.tab = P.id;
            if (P.sub === 'pinned' || P.sub.startsWith('g:') || P.sub === 'none') P.sub = 'all';
            save(); draw();
            const el = $('#hb-p-' + P.id);
            return el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (act === 'ndel') {
            const P = get(p), n = P.notes[i];
            if (!confirm(`Delete the note "${n.title || 'Untitled note'}"?`)) return;
            snap(b);
            P.notes.splice(i, 1); if (P.open === n.id) P.open = '';
        }
        else if (act === 'npin') { const n = get(p); n.pinned = !n.pinned; }
        else if (act === 'ndup') {
            const P = get(p), n = Object.assign({}, P.notes[i], { id: uid(), title: (P.notes[i].title || 'Untitled note') + ' (copy)', pinned: false, created: Date.now(), updated: Date.now() });
            P.notes.splice(i + 1, 0, n); P.open = n.id;
        }
        else
        if (act === 'sub') set(p, b.dataset.id);
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
        else if (act === 'new') return switchTo(Object.assign(blank(), { name: numbered('New monster') }));
        else if (act === 'side') return switchTo(db.chars[b.dataset.id]);
        else if (act === 'dup') return dupMonster();
        else if (act === 'find') return openFind();
        else if (act === 'import') return $('#hb-file').click();
        else if (act === 'export') return download((C.name || 'monster').replace(/[^\w -]+/g, '').trim() + '.json', JSON.stringify(C, null, 1));
        else if (act === 'delete') {
            if (!confirm(`Delete ${C.name || 'this monster'} from this browser? Export it first if you want to keep a copy.`)) return;
            snap(b);
            delete db.chars[C.id];
            return switchTo(Object.values(db.chars)[0] || blank());
        } else return;
        saveNow(); draw();
    });

    $('#hb-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const c = normalise(JSON.parse(await file.text()));
            c.id = uid();
            switchTo(c);
            toast(`Imported ${c.name || 'the monster'}.`, 'ok');
        } catch (err) { toast("Couldn't import that file. Choose a .json file exported from this sheet.", 'err'); }
    });
    $('#hb-artfile').addEventListener('change', (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) loadArt(file); });

    draw();
});
