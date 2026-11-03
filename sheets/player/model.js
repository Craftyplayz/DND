// The player character model, shared by the sheet (sheet.js) and the character builder (characters/build/, build.js):
// blank() is every field a character has (normalise() in sheet.js keeps only these), ROW the row makers, newPanel the panels,
// plus the SRD weapon, armour and gear lists. hbModel(uid) -> all of it, with uid() making the row ids.
// Loaded as a plain script (window.hbModel) and by the Node tests (module.exports).
(function (root) {
    'use strict';
    function hbModel(uid) {
        const ABIL = [['STR', 'Strength'], ['DEX', 'Dexterity'], ['CON', 'Constitution'], ['INT', 'Intelligence'], ['WIS', 'Wisdom'], ['CHA', 'Charisma']];
        const SKILLS = [['Acrobatics', 'DEX'], ['Animal Handling', 'WIS'], ['Arcana', 'INT'], ['Athletics', 'STR'], ['Deception', 'CHA'], ['History', 'INT'],
            ['Insight', 'WIS'], ['Intimidation', 'CHA'], ['Investigation', 'INT'], ['Medicine', 'WIS'], ['Nature', 'INT'], ['Perception', 'WIS'],
            ['Performance', 'CHA'], ['Persuasion', 'CHA'], ['Religion', 'INT'], ['Sleight of Hand', 'DEX'], ['Stealth', 'DEX'], ['Survival', 'WIS']];
        const CONDITIONS = 'Blinded\nCharmed\nDeafened\nFrightened\nGrappled\nIncapacitated\nInvisible\nParalysed\nPetrified\nPoisoned\nProne\nRestrained\nStunned\nUnconscious';
        // lists you can edit in Customise, one entry per line
        const LISTS = {
            time: 'Action\nBonus action\nReaction\nFree\nSpecial',
            dmg: 'Acid\nBludgeoning\nCold\nFire\nForce\nLightning\nNecrotic\nPiercing\nPoison\nPsychic\nRadiant\nSlashing\nThunder',
            props: 'Ammunition\nFinesse\nHeavy\nLight\nLoading\nMagical\nReach\nSilvered\nThrown\nTwo-handed\nVersatile',
            cats: 'Weapons\nArmour\nGear\nConsumables\nTreasure\nMagic items\nMisc',
            speeds: 'Walk\nFly\nSwim\nClimb\nBurrow',
        };
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
        const PRESET = {
            armour: ['Light armour', 'Medium armour', 'Heavy armour', 'Shields'],
            weapons: ['Simple weapons', 'Martial weapons'],
            langs: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'],
        };
        const TOOLS = ["Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools", "Cartographer's tools", "Cobbler's tools", "Cook's utensils",
            "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools", "Smith's tools", "Tinker's tools",
            "Weaver's tools", "Woodcarver's tools", 'Disguise kit', 'Forgery kit', 'Herbalism kit', "Navigator's tools", "Poisoner's kit", "Thieves' tools",
            'Dice set', 'Playing card set', 'Bagpipes', 'Drum', 'Flute', 'Lute', 'Lyre', 'Horn', 'Viol', 'Vehicles (land)', 'Vehicles (water)'];
        // Flexible Casting: sorcery points to make a 1st- to 5th-level slot (SRD 5.1 costs; editable per sheet)
        const FLEX_COST = [2, 3, 5, 6, 7];
        const TYPES = { profs: 'Proficiencies', attacks: 'Actions', spells: 'Spells', items: 'Inventory', list: 'List', trackers: 'Trackers', notes: 'Notes', text: 'Text', combat: 'Death saves and hit dice', homebrew: 'Homebrew', handouts: 'Handouts', details: 'Character details' };
        // the Character details panel (4.2): who the character is, beyond the numbers; [key, label, rows (0: one line)]
        const DETAILS = [['background', 'Background', 0], ['faith', 'Faith', 0], ['lifestyle', 'Lifestyle', 0], ['gender', 'Gender and pronouns', 0],
            ['height', 'Height', 0], ['weight', 'Weight', 0], ['size', 'Size', 0], ['skin', 'Skin', 0], ['hair', 'Hair', 0], ['eyes', 'Eyes', 0],
            ['appearance', 'Appearance', 2], ['traits', 'Personality traits', 2], ['ideals', 'Ideals', 2], ['bonds', 'Bonds', 2], ['flaws', 'Flaws', 2],
            ['allies', 'Allies', 2], ['enemies', 'Enemies', 2], ['orgs', 'Organisations', 2], ['backstory', 'Backstory', 6]];
        // read a number out of whatever was typed ("30 ft" -> 30)
        const nm = (x) => parseFloat(x) || 0;
        const ROW = {
            attack: () => ({ id: uid(), name: '', time: 'Action', range: '', props: [], mode: 'hit', hit: 'STR + PROF', save: 'DEX', dc: '8 + PROF + STR', dmg: [{ dice: '1d6 + STR', type: 'Slashing' }], fx: [], uses: '', used: 0, reset: '', desc: '' }),
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
            note: () => ({ id: uid(), title: '', group: '', body: '', pinned: false, archived: 0, created: Date.now(), updated: Date.now() }),
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
            if (type === 'details') p.f = Object.fromEntries(DETAILS.map(([k]) => [k, '']));
            return p;
        }

        function blank() {
            return {
                id: uid(), updated: 0, archived: 0, name: '', classes: [ROW.cls()], race: '', alignment: '', age: '', art: '', artUrl: '',
                abilities: ABIL.map(([key, name]) => ({ key, name, score: 10, save: false, sb: '' })),
                skills: SKILLS.map(([name, ab]) => ({ name, ab, p: 0, b: '' })),
                prof: 'ceil(LEVEL / 4) + 1', ac: '10 + DEX', init: 'DEX',
                hp: { cur: 10, base: 10, temp: 0, mod: 0 }, insp: false, rolls: [],
                speeds: [{ type: 'Walk', ft: 30, hover: false }], conditions: [], exhaustion: 0, condList: CONDITIONS, res: '', imm: '', vul: '',
                passives: [['Passive Perception', '10 + Perception'], ['Passive Investigation', '10 + Investigation'], ['Passive Insight', '10 + Insight']].map(([name, f]) => ({ name, f })),
                senses: '',
                profs: { armour: [], weapons: [], langs: ['Common'], tools: [], notes: '' },
                lists: { ...LISTS },
                panels: [newPanel('profs'), newPanel('attacks'), newPanel('spells'), newPanel('items'), Object.assign(newPanel('list', 'Passive abilities'), { split: true, sub: 'race' }),
                    newPanel('trackers', 'Resources'), newPanel('homebrew'), newPanel('combat'),
                    Object.assign(newPanel('notes'), { notes: ['Personality', 'Backstory'].map((title) => Object.assign(ROW.note(), { title, group: 'Character' })) }),
                    // Character details (4.2) goes last, so every panel before it keeps its place
                    newPanel('details')],
                view: { tab: '', all: false, prep: false, table: '', rollTo: '' }, hbPanel: true, hb2: true, passSplit: true,
                hoPanel: false, // handouts (3.4): true once the Handouts panel has been added (hoAdd), so a closed one stays closed
                // ROADMAP 1.5: the sheet's worked-out max HP for the fight tracker (no version of its own), and the DM edits applied
                calc: { hpMax: 0 }, dmApplied: [],
                // ROADMAP 4.2: a character the builder is still making (draft, no versions until Finish) and what was picked in it
                draft: 0, build: {},
            };
        }

        return { ABIL, SKILLS, CONDITIONS, LISTS, WEAPONS, ARMOUR, GEAR, PRESET, TOOLS, FLEX_COST, TYPES, DETAILS, nm, ROW, PANEL_ROW, newPanel, blank };
    }
    if (typeof module === 'object' && module.exports) module.exports = hbModel; else root.hbModel = hbModel;
})(this);
