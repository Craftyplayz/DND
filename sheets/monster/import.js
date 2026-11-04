// The Monster Sheet's data shape and its conversion of a stat block into a sheet, in one place for two pages: sheets/monster/monster.js and
// the battle map's Token Browser (assets/js/map.js).
//   MonImport.save(key) -> Promise<{id}>: the Compendium monster "key" (a key from monsters.json) saved to this account's Monster Sheet, reusing one
//   saved from the same key before (its key is kept in "cmp", in Unsorted, under its own name). Rejects with a message to show.
window.MonImport = (() => {
    'use strict';
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
    const RACES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];
    // Flexible Casting: sorcery points to make a 1st- to 5th-level slot (SRD 5.1 costs; editable per sheet)
    const FLEX_COST = [2, 3, 5, 6, 7];
    const TYPES = { profs: 'Proficiencies', attacks: 'Actions', spells: 'Spells', items: 'Inventory', list: 'List', trackers: 'Trackers', notes: 'Notes', text: 'Text', combat: 'Death saves and hit dice', homebrew: 'Homebrew' };
    // Passive abilities sub-tabs
    const LIST_GROUPS = [['race', 'Traits'], ['other', 'Other']];
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
        return p;
    }

    function blank() {
        return {
            // enc: the id of its encounter (ROADMAP 3.1); '' (or an id that isn't in the list) is Unsorted
            id: uid(), updated: 0, archived: 0, enc: '', name: '', classes: [ROW.cls()], race: '', cr: '0', alignment: '', age: '', art: '',
            abilities: ABIL.map(([key, name]) => ({ key, name, score: 10, save: false, sb: '' })),
            skills: SKILLS.map(([name, ab]) => ({ name, ab, p: 0, b: '' })),
            prof: 'max(2, ceil(CR / 4) + 1)', ac: '10 + DEX', init: 'DEX',
            hp: { cur: 10, base: 10, temp: 0, mod: 0 }, hpAt: 0, insp: false, rolls: [],
            speeds: [{ type: 'Walk', ft: 30, hover: false }], conditions: [], exhaustion: 0, condList: CONDITIONS, res: '', imm: '', vul: '',
            passives: [['Passive Perception', '10 + Perception'], ['Passive Investigation', '10 + Investigation'], ['Passive Insight', '10 + Insight']].map(([name, f]) => ({ name, f })),
            senses: '',
            profs: { armour: [], weapons: [], langs: ['Common'], tools: [], notes: '' },
            lists: { ...LISTS },
            panels: [newPanel('profs'), newPanel('attacks'), newPanel('spells'), newPanel('items'), Object.assign(newPanel('list', 'Passive abilities'), { split: true, sub: 'race' }),
                newPanel('trackers', 'Resources'), newPanel('homebrew'), newPanel('combat'),
                Object.assign(newPanel('notes'), { notes: [Object.assign(ROW.note(), { title: 'Tactics', group: 'Monster' })] })],
            view: { tab: '', phoneTab: '', all: false, prep: false }, hbPanel: true, hb2: true, passSplit: true,
            // homebrew (ROADMAP 5.2): the entry this monster is a copy of, {id, by, at, sum}
            hbsrc: null,
            // the Compendium key it was saved from by the map's Token Browser ('' otherwise)
            cmp: '',
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

    const crText = (n) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[n] || String(n);
    // a stat block from monsters.php (dnd5eapi.co when src is "srd", otherwise Open5e) as a sheet:
    // saves and skills become proficiency plus any extra bonus, attacks and saving-throw actions become Actions, traits Passive abilities
    const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
    const usage = (u) => (!u ? '' : u.type === 'recharge on roll' ? ` (Recharge ${u.min_value}${u.min_value < 6 ? '–6' : ''})` : u.type === 'per day' ? ` (${u.times}/Day)`
        : u.type === 'recharge after rest' ? ` (Recharges after a ${(u.rest_types || []).join(' or ')} rest)` : '');
    function fromAction(a, time) {
        // "+4 to hit" and "DC 13 Dexterity", or the 2024 wording: "Attack Roll: +4" and "Dexterity Saving Throw: DC 13"
        const d = String(a.desc || ''), hit = /([+-−]\s?\d+)\s+to hit/i.exec(d) || /Attack Roll:\s*([+-−]\s?\d+)/i.exec(d), m24 = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC (\d+)/i.exec(d);
        const dc = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i.exec(d) || (m24 && [m24[0], m24[2], m24[1]]);
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


    const BASE = '/sheets/monster/';
    const json = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Couldn't reach the monster list. Try again in a minute."); return j; };
    let sources = null;
    async function save(key) {
        const hit = await fetch(BASE + 'cloud.php?cmp=' + encodeURIComponent(key), { cache: 'no-store' });
        if (hit.ok) return { id: (await hit.json()).id };
        sources ||= (await json(await fetch(BASE + 'monsters.json'))).sources;
        const c = normalise(fromStatBlock(await json(await fetch(BASE + 'monsters.php?i=' + encodeURIComponent(key))), sources));
        c.cmp = key; c.updated = Date.now();
        await json(await fetch(BASE + 'cloud.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }));
        return { id: c.id };
    }
    return { ABIL, SKILLS, CONDITIONS, LISTS, RACES, FLEX_COST, TYPES, LIST_GROUPS, uid, nm, ROW, PANEL_ROW, newPanel, blank, isObj, groupOf, upgrade, normalise, crText, cap, usage, fromAction, fromStatBlock, save };
})();
