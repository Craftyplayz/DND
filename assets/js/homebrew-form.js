// The guided form for homebrew classes, subclasses, races, subraces and backgrounds (ROADMAP 4.6): a full-screen popup in steps with Back and Next, loaded the first time
// it's needed. HbWizard.open(kind, entry or null, seed or null, ctx) edits a plain entry (see homebrew-content.js for what the fields become). A new one saves itself as
// Unfinished as you go, which only you see and can't be shared or picked; editing a finished one only saves at Finish, so a half-done edit never reaches a campaign.
window.HbWizard = (() => {
    'use strict';
    const { $, esc, debounce, toast } = UI, HC = window.HomebrewContent;
    const STEPS = {
        class: [['basics', 'Basics'], ['profs', 'Proficiencies'], ['levels', 'Levels and features'], ['cast', 'Spellcasting'], ['res', 'Resources'], ['equip', 'Starting equipment'], ['multi', 'Multiclassing'], ['review', 'Review']],
        subclass: [['basics', 'Basics'], ['levels', 'Features'], ['subspells', 'Spells'], ['review', 'Review']],
        race: [['basics', 'Basics'], ['bonus', 'Scores and languages'], ['traits', 'Traits'], ['effects', 'What it gives'], ['review', 'Review']],
        subrace: [['basics', 'Basics'], ['bonus', 'Scores and languages'], ['traits', 'Traits'], ['effects', 'What it gives'], ['review', 'Review']],
        background: [['basics', 'Basics'], ['bgprofs', 'Proficiencies'], ['equip', 'Equipment'], ['feature', 'Feature'], ['tables', 'Personality'], ['b2024', 'Ability scores and feat'], ['review', 'Review']],
    };
    const NOUN = { class: 'class', subclass: 'subclass', race: 'race', subrace: 'subrace', background: 'background' };
    const ARMOUR = [['light-armor', 'Light armour'], ['medium-armor', 'Medium armour'], ['heavy-armor', 'Heavy armour'], ['shields', 'Shields']], WEAPONS = [['simple-weapons', 'Simple weapons'], ['martial-weapons', 'Martial weapons']];
    const RESETS = [['', 'No reset'], ['short', 'Short rest'], ['long', 'Long rest']];
    const CATS = [['simple-weapons', 'Any simple weapon'], ['simple-melee-weapons', 'Any simple melee weapon'], ['martial-weapons', 'Any martial weapon'], ['martial-melee-weapons', 'Any martial melee weapon'], ['holy-symbols', 'Any holy symbol'], ['arcane-foci', 'Any arcane focus'], ['druidic-foci', 'Any druidic focus'], ['musical-instruments', 'Any musical instrument']];
    const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    let w = null, uid = 0;
    const fid = () => 'f' + Date.now().toString(36) + (uid++).toString(36);
    const dlg = () => $('#cp-hbw'), get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), w.x);
    function set(p, v) { const ks = p.split('.'), last = ks.pop(); let o = w.x; ks.forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1] ?? last) ? [] : {}; o = o[k]; }); o[last] = v; }
    const list = (p) => { const v = get(p); if (Array.isArray(v)) return v; set(p, []); return get(p); };

    // ---- fields: every one is inside its label, and bound to a path in the entry by data-w ----
    const small = (h) => (h ? `<small>${esc(h)}</small>` : '<small hidden></small>');
    const text = (p, label, o = {}) => `<label>${esc(label)}${o.area ? `<textarea class="field" data-w="${p}" rows="${o.area}">${esc(get(p) ?? '')}</textarea>` : `<input class="field" data-w="${p}" value="${esc(get(p) ?? '')}" autocomplete="off"${o.list ? ` list="${o.list}"` : ''}${o.item ? ' data-item' : ''}>`}${small(o.hint)}</label>`;
    const num = (p, label, o = {}) => `<label>${esc(label)}<input class="field" type="number" inputmode="numeric" data-w="${p}" data-t="n" value="${esc(get(p) ?? '')}"${o.min !== undefined ? ` min="${o.min}"` : ''}${o.max !== undefined ? ` max="${o.max}"` : ''}${o.redraw ? ' data-r' : ''}>${small(o.hint)}</label>`;
    const sel = (p, label, opts, o = {}) => `<label>${esc(label)}<select class="field" data-w="${p}"${o.redraw ? ' data-r' : ''}${o.number ? ' data-t="n"' : ''}>${opts.map((x) => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}"${String(v) === String(get(p) ?? o.dflt ?? '') ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select>${small(o.hint)}</label>`;
    const check = (p, label, o = {}) => `<label class="check"><input type="checkbox" data-w="${p}" data-t="c"${get(p) ? ' checked' : ''}${o.redraw ? ' data-r' : ''}> ${esc(label)}</label>`;
    const multi = (p, label, opts, o = {}) => `<fieldset class="cp-hbchecks"><legend>${esc(label)}</legend>${opts.map((x) => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<label class="check"><input type="checkbox" data-w="${p}" data-t="m" value="${esc(v)}"${(get(p) || []).map(String).includes(String(v)) ? ' checked' : ''}> ${esc(t)}</label>`; }).join('')}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</fieldset>`;
    const btn = (act, label, o = {}) => `<button type="button" class="btn small" data-wa="${act}"${o.p !== undefined ? ` data-p="${esc(o.p)}"` : ''}${o.i !== undefined ? ` data-i="${o.i}"` : ''}${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${esc(label)}</button>`;

    // ---- a feature or trait ----
    function featureHtml(p, i, leveled) {
        const f = get(p + '.' + i), q = `${p}.${i}`, opts = f.options || [];
        return `<fieldset class="cp-hbfeat"><legend>${esc(f.name || (leveled ? 'New feature' : 'New trait'))}</legend><div class="form">${text(q + '.name', 'Name')}${text(q + '.text', 'What it does (optional)', { area: 3 })}
            ${text(q + '.uses', 'Uses (optional)', { hint: 'A number or a sheet formula, like PROF. It gives the row a counter.' })}${sel(q + '.reset', 'Uses come back on', RESETS)}
            ${leveled ? `${text(q + '.grants', 'Gives proficiency in (optional)', { hint: 'Skills, armour, weapons or tools, separated by commas.' })}
            ${sel(q + '.pick', 'The player also picks', [['', 'Nothing'], ['skill', 'Skills to be proficient in'], ['expert', 'Skills to double proficiency in']], { redraw: true })}${f.pick ? num(q + '.pickN', 'How many', { min: 1 }) : ''}
            ${opts.length ? num(q + '.choose', 'The player chooses how many of these options', { min: 1 }) : ''}
            ${opts.map((o, j) => `<div class="cp-hbopt">${text(`${q}.options.${j}.name`, `Option ${j + 1}`)}${text(`${q}.options.${j}.text`, 'What it does (optional)', { area: 2 })}${btn('del', 'Remove option', { p: q + '.options', i: j })}</div>`).join('')}
            <div class="cp-hbbtns">${btn('addopt', 'Add an option to choose from', { p: q })}</div>` : ''}</div>
            <div class="cp-hbbtns">${btn('up', 'Up', { p, i, label: 'Move up' })}${btn('down', 'Down', { p, i, label: 'Move down' })}${btn('del', 'Remove', { p, i })}
            ${leveled ? `<label class="cp-hbinl">Also at levels <input class="field" data-also="${q}" placeholder="6, 10" autocomplete="off"></label>${btn('also', 'Add there', { p: q })}` : ''}</div></fieldset>`;
    }
    function levelsHtml() {
        const x = w.x, isClass = w.kind === 'class', warn = !isClass && w.ctx.subLevelOf(x.parent);
        const early = warn && (x.levels || []).filter((l) => +l.n < warn && (l.feats || []).length).map((l) => l.n);
        const fold = (n) => {
            let at = (x.levels || []).findIndex((l) => +l.n === n);
            const has = at >= 0 && (x.levels[at].feats || []).length, open = w.open['l' + n] ?? (has || n === 1);
            const body = at >= 0 ? (x.levels[at].feats || []).map((f, i) => featureHtml(`levels.${at}.feats`, i, true)).join('') : '';
            const asi = isClass ? `<label class="check"><input type="checkbox" data-asi="${n}"${(x.asi || []).includes(n) ? ' checked' : ''}> Ability Score Improvement at this level</label>` : '';
            return `<details class="cp-hbfold" data-fold="l${n}"${open ? ' open' : ''}><summary>Level ${n}${has ? ` <span class="muted">(${(x.levels[at].feats || []).length})</span>` : ''}${(x.asi || []).includes(n) && isClass ? ' <span class="muted">improvement</span>' : ''}</summary><div class="cp-hbfoldin">${asi}${body}<div class="cp-hbbtns">${btn('addfeat', 'Add feature', { i: n })}</div></div></details>`;
        };
        return `${isClass ? `<div class="form">${num('subLevel', 'Picks its subclass at level', { min: 1, max: 20 })}${text('subLabel', 'Subclasses are called (optional)', { hint: 'For example Hunter order.' })}</div>
            <h3>Extra columns on the class table (optional)</h3><p class="muted">For things like a rising die. A resource can read its maximum from one.</p>
            ${(x.columns || []).map((c, i) => `<div class="cp-hbcol">${text(`columns.${i}.name`, 'Column name')}<div class="table-wrap"><table class="table cp-hbgrid"><thead><tr>${Array.from({ length: 20 }, (_, l) => `<th class="num">${l + 1}</th>`).join('')}</tr></thead><tbody><tr>${Array.from({ length: 20 }, (_, l) => `<td><input class="field" data-w="columns.${i}.values.${l}" value="${esc((c.values || [])[l] ?? '')}" aria-label="${esc(c.name || 'Column')} at level ${l + 1}" autocomplete="off"></td>`).join('')}</tr></tbody></table></div>${btn('del', 'Remove column', { p: 'columns', i })}</div>`).join('')}
            <div class="cp-hbbtns">${btn('addcol', 'Add a column')}</div><h3>Features per level</h3>` : ''}
            ${early && early.length ? `<p class="note">This class picks its subclass at level ${warn}. What you put at level ${early.join(', ')} arrives at level ${warn}.</p>` : ''}
            ${Array.from({ length: 20 }, (_, i) => fold(i + 1)).join('')}`;
    }
    // ---- spells ----
    const spellLine = (s) => `${s.name}${+s.level ? ` (level ${s.level})` : ' (cantrip)'}`;
    const spellPicker = (p, label) => `<div class="cp-hbrow"><label>${esc(label)}<input class="field" data-spellin="${p}" list="cp-hbw-spells" autocomplete="off"><small hidden></small></label>${btn('addspell', 'Add', { p })}</div>
        <ul class="cp-hblist">${list(p).map((s, i) => `<li><span class="grow">${esc(spellLine(s))}</span>${p === 'spells' && w.kind === 'subclass' ? num(`spells.${i}.at`, 'From level', { min: 1, max: 20 }) : ''}${btn('del', 'Remove', { p, i, label: 'Remove ' + s.name })}</li>`).join('')}</ul>`;
    function castHtml() {
        const x = w.x, type = x.caster || 'none', on = type !== 'none';
        const grid = () => `<div class="table-wrap cp-hbslots"><table class="table cp-hbgrid"><thead><tr><th>Level</th><th>Cantrips</th>${x.prep === 'known' ? '<th>Spells known</th>' : ''}${Array.from({ length: 9 }, (_, s) => `<th class="num">${ordinal(s + 1)}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: 20 }, (_, l) => `<tr><td class="num">${l + 1}</td>
            <td><input class="field" type="number" min="0" data-w="cantripsKnown.${l}" data-t="n" value="${esc((x.cantripsKnown || [])[l] ?? 0)}" aria-label="Cantrips at level ${l + 1}"></td>
            ${x.prep === 'known' ? `<td><input class="field" type="number" min="0" data-w="spellsKnown.${l}" data-t="n" value="${esc((x.spellsKnown || [])[l] ?? 0)}" aria-label="Spells known at level ${l + 1}"></td>` : ''}
            ${Array.from({ length: 9 }, (_, s) => `<td><input class="field" type="number" min="0" data-w="slots.${l}.${s}" data-t="n" value="${esc(((x.slots || [])[l] || [])[s] ?? 0)}" aria-label="${ordinal(s + 1)} level slots at level ${l + 1}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        return `<div class="form">${sel('caster', 'Spellcasting', [['none', 'Not a spellcaster'], ['full', 'Full caster'], ['half', 'Half caster'], ['third', 'Third caster'], ['pact', 'Pact Magic'], ['custom', 'My own table']], { redraw: true, dflt: 'none', hint: 'Picking one fills the table below. You can change every number.' })}
            ${on ? `${sel('ability', 'Casting ability', HC.ABS, { dflt: 'INT' })}${type === 'custom' ? sel('counts', 'For multiclassing it counts as', [['none', 'Not counted'], ['full', 'Full caster'], ['half', 'Half caster'], ['third', 'Third caster']]) : ''}
            ${sel('prep', 'How it gets its spells', [['known', 'Knows a fixed number'], ['prepared', 'Prepares from the list'], ['book', 'Prepares from a spellbook']], { redraw: true, dflt: 'known' })}
            ${x.prep === 'prepared' || x.prep === 'book' ? check('prepHalf', 'Prepares ability modifier + half its level (otherwise + its level)') : ''}
            ${x.prep === 'book' ? num('book1', 'Spells in the book at level 1', { min: 0 }) + num('bookN', 'Spells added per level', { min: 0 }) : ''}` : ''}</div>
            ${on ? `<h3>The table</h3>${grid()}<h3>Spell list</h3>
            <div class="form">${sel('copyList', 'Copy a list from', [['', 'Choose a class...'], ...w.ctx.classes().filter(([id]) => !id.startsWith('hb-'))], { hint: 'Adds that class\'s spells to the list.' }).replace('data-w="copyList"', 'data-copylist')}</div>
            ${spellPicker('spells', 'Add a spell')}<p class="muted">Homebrew spells that tick this class join its list by themselves.</p>` : ''}`;
    }
    // ---- resources ----
    function resHtml() {
        const cols = (w.x.columns || []).filter((c) => c.name).map((c) => c.name);
        return `<p class="muted">What the class spends and gets back: Rage, Ki points. They land in Resources on the sheet.</p>${(w.x.resources || []).map((r, i) => `<fieldset class="cp-hbfeat"><legend>${esc(r.name || 'New resource')}</legend><div class="form">
            ${text(`resources.${i}.name`, 'Name')}${num(`resources.${i}.at`, 'Starts at level', { min: 1, max: 20 })}${sel(`resources.${i}.reset`, 'Comes back on', RESETS.slice(1), { dflt: 'long' })}${sel(`resources.${i}.kind`, 'Shown as', [['count', 'A count'], ['pips', 'Boxes']], { dflt: 'count' })}
            ${sel(`resources.${i}.maxType`, 'Its maximum is', [['level', 'A number per level'], ['column', 'A column of the class table'], ['formula', 'A formula']], { redraw: true, dflt: 'level' })}
            ${r.maxType === 'formula' ? text(`resources.${i}.formula`, 'Formula', { hint: `Sheet formulas: PROF, LEVEL, CHA, ${(String(w.x.name || 'CLASS').replace(/\W/g, '') || 'CLASS').toUpperCase()}_LEVEL, and + - * / ( ) min() max() floor() ceil().` }) : r.maxType === 'column' ? sel(`resources.${i}.column`, 'Column', cols.length ? cols : [['', 'Add a column in Levels and features first']]) : `<div class="table-wrap"><table class="table cp-hbgrid"><thead><tr>${Array.from({ length: 20 }, (_, l) => `<th class="num">${l + 1}</th>`).join('')}</tr></thead><tbody><tr>${Array.from({ length: 20 }, (_, l) => `<td><input class="field" type="number" min="0" data-w="resources.${i}.values.${l}" data-t="n" value="${esc((r.values || [])[l] ?? '')}" aria-label="Maximum at level ${l + 1}"></td>`).join('')}</tr></tbody></table></div>`}</div>
            <div class="cp-hbbtns">${btn('del', 'Remove', { p: 'resources', i })}</div></fieldset>`).join('')}<div class="cp-hbbtns">${btn('addres', 'Add a resource')}</div>`;
    }
    // ---- starting equipment: fixed items, and "(a) or (b)" choices of items ----
    function itemRow(p, i) {
        const it = get(`${p}.${i}`), q = `${p}.${i}`;
        return `<div class="cp-hbrow">${it.cat !== undefined ? sel(q + '.cat', 'Any of', CATS) : text(q + '.name', 'Item', { list: 'cp-hbw-items', item: true })}${num(q + '.n', 'How many', { min: 1 })}${btn('del', 'Remove', { p, i })}</div>`;
    }
    function equipHtml() {
        const fixed = list('equip.fixed'), ch = list('equip.choices');
        return `<h3>Everyone gets</h3>${fixed.map((_, i) => itemRow('equip.fixed', i)).join('')}<div class="cp-hbbtns">${btn('additem', 'Add an item', { p: 'equip.fixed' })}</div>
            <h3>The player chooses</h3>${ch.map((c, i) => `<fieldset class="cp-hbfeat"><legend>Choice ${i + 1}</legend>${c.text !== undefined ? `<div class="form">${text(`equip.choices.${i}.text`, 'What the choice says', { hint: 'The player types what they take.' })}</div>` : `
                ${(c.options || []).map((o, j) => `<div class="cp-hbopt"><b>(${String.fromCharCode(97 + j)})</b>${(o.items || []).map((_, k) => itemRow(`equip.choices.${i}.options.${j}.items`, k)).join('')}<div class="cp-hbbtns">${btn('additem', 'Add an item', { p: `equip.choices.${i}.options.${j}.items` })}${btn('addcat', 'Add "any of" a kind', { p: `equip.choices.${i}.options.${j}.items` })}${btn('del', 'Remove this option', { p: `equip.choices.${i}.options`, i: j })}</div></div>`).join('')}
                <div class="cp-hbbtns">${btn('addchoiceopt', 'Add an option', { p: `equip.choices.${i}.options` })}</div>`}<div class="cp-hbbtns">${btn('del', 'Remove this choice', { p: 'equip.choices', i })}</div></fieldset>`).join('')}
            <div class="cp-hbbtns">${btn('addchoice', 'Add a choice')}${btn('addtyped', 'Add a typed choice')}</div>
            ${w.kind === 'class' ? `<h3>Or gold instead (optional)</h3><div class="form">${num('goldN', 'Number of d4s', { min: 0 })}${num('goldMult', 'Multiplied by', { min: 1 })}</div>` : `<div class="form">${num('gold', 'Gold pieces (optional)', { min: 0 })}</div>`}`;
    }

    const STEP = {
        basics() {
            const x = w.x, from = w.isNew ? w.ctx.officials(w.kind) : [];
            const start = from.length ? `<label>Start from (optional)<select class="field" data-start><option value="">Blank</option>${from.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select><small>Fills the form from this one. You can change all of it.</small></label>` : '';
            const parent = w.kind === 'subclass' ? sel('parent', 'Subclass of', [['', 'Choose a class...'], ...w.ctx.classes()], { redraw: true }) : w.kind === 'subrace' ? sel('parent', 'Subrace of', [['', 'Choose a race...'], ...w.ctx.races()], { redraw: true }) : '';
            return `<div class="form">${start}${text('name', 'Name')}${parent}
                ${w.kind === 'class' ? sel('hitDie', 'Hit die', [[6, 'd6'], [8, 'd8'], [10, 'd10'], [12, 'd12']], { number: true, dflt: 8 }) : ''}
                ${w.kind === 'race' ? sel('size', 'Size', ['Tiny', 'Small', 'Medium', 'Large'], { dflt: 'Medium' }) + num('speed', 'Speed in ft', { min: 0 }) : ''}
                ${w.kind === 'subclass' ? text('flavour', 'Flavour line (optional)', { hint: 'For example Hunter order.' }) : ''}
                ${text('text', 'Description (optional)', { area: 5, hint: 'A line starting with "- " becomes a list.' })}
                ${w.kind === 'class' || w.kind === 'subclass' ? num('hpPerLevel', 'Extra hit points per level (optional)', { min: 0 }) : ''}
                ${w.kind === 'race' ? text('sizeText', 'About its size (optional)') + text('age', 'Age (optional)') + text('alignment', 'Alignment (optional)') : ''}</div>`;
        },
        profs() { return `${multi('saves', 'Saving throws', HC.ABS, { hint: 'Usually two.' })}${multi('armour', 'Armour (optional)', ARMOUR)}${multi('weapons', 'Weapons (optional)', WEAPONS)}<div class="form">${text('weaponOther', 'Other weapons (optional)', { hint: 'Separate them with commas.' })}${text('tools', 'Tools (optional)', { hint: 'Separate them with commas.' })}${num('skillChoose', 'Skills the player chooses', { min: 0 })}</div>${multi('skillFrom', 'They choose from', HC.SKILLS)}${multi('skillsFixed', 'Skills everyone gets (optional)', HC.SKILLS)}`; },
        levels: levelsHtml,
        cast: castHtml,
        res: resHtml,
        equip: equipHtml,
        multi() {
            return `<p class="muted">Shown as a warning in the builder, never a block.</p>${(w.x.multiMin || []).map((m, i) => `<div class="cp-hbrow">${sel(`multiMin.${i}.ab`, 'Ability', HC.ABS)}${num(`multiMin.${i}.score`, 'At least', { min: 1 })}${btn('del', 'Remove', { p: 'multiMin', i })}</div>`).join('')}
                <div class="cp-hbbtns">${btn('addmin', 'Add a minimum score')}</div>${check('multiAny', 'Any one of these is enough')}<h3>Proficiencies when taken as a second class</h3>${multi('multiArmour', 'Armour (optional)', ARMOUR)}${multi('multiWeapons', 'Weapons (optional)', WEAPONS)}`;
        },
        subspells() { return `<p class="muted">Spells the subclass adds. A class that prepares its spells always has them prepared from that level.</p>${spellPicker('spells', 'Add a spell')}`; },
        bonus() {
            return `${(w.x.bonuses || []).map((b, i) => `<div class="cp-hbrow">${sel(`bonuses.${i}.ab`, 'Ability', HC.ABS)}${num(`bonuses.${i}.n`, 'Bonus')}${btn('del', 'Remove', { p: 'bonuses', i })}</div>`).join('')}<div class="cp-hbbtns">${btn('addbonus', 'Add an ability bonus')}</div>
                <div class="form">${w.kind === 'race' ? num('bonusChoose', '+1 to how many scores of the player\'s choice (optional)', { min: 0 }) : ''}</div>
                ${multi('langs', 'Languages (optional)', HC.LANGS.map((l) => [l.toLowerCase().replace(/ /g, '-'), l]))}<div class="form">${text('langOther', 'Other languages (optional)', { hint: 'Separate them with commas.' })}${num('langChoose', 'Extra languages of the player\'s choice (optional)', { min: 0 })}</div>`;
        },
        traits() { return `${list('traits').map((_, i) => featureHtml('traits', i, false)).join('')}<div class="cp-hbbtns">${btn('addtrait', 'Add a trait')}</div>`; },
        effects() {
            return `<p class="muted">These reach the sheet. Attacks like a breath weapon stay as text in a trait.</p><div class="form">${num('darkvision', 'Darkvision in ft (optional)', { min: 0 })}${text('resist', 'Resistances (optional)', { hint: 'Separate them with commas.' })}${text('tools', 'Tools (optional)', { hint: 'Separate them with commas.' })}</div>
                <h3>Other speeds (optional)</h3>${(w.x.speeds || []).map((s, i) => `<div class="cp-hbrow">${sel(`speeds.${i}.type`, 'Kind', ['Fly', 'Swim', 'Climb', 'Burrow'])}${num(`speeds.${i}.ft`, 'ft', { min: 0 })}${btn('del', 'Remove', { p: 'speeds', i })}</div>`).join('')}<div class="cp-hbbtns">${btn('addspeed', 'Add a speed')}</div>
                ${multi('skills', 'Skills it gives (optional)', HC.SKILLS)}<div class="form">${num('skillChoose', 'Skills the player chooses (optional)', { min: 0 })}</div>${multi('skillFrom', 'They choose from (any, if none are ticked)', HC.SKILLS)}
                <h3>Cantrips (optional)</h3>${spellPicker('cantrips', 'It gives this cantrip')}<div class="form">${num('cantripChoose', 'Cantrips the player chooses', { min: 0 })}</div>${spellPicker('cantripFrom', 'They choose from')}`;
        },
        bgprofs() { return `${multi('skills', 'Skills (optional)', HC.SKILLS)}<div class="form">${text('tools', 'Tools (optional)', { hint: 'Separate them with commas.' })}${num('langChoose', 'Languages of the player\'s choice (optional)', { min: 0 })}</div>`; },
        feature() { return `<div class="form">${text('featureName', 'Feature name (optional)')}${text('featureText', 'What it does (optional)', { area: 5 })}</div>`; },
        tables() { const t = (k, l) => text(k, l + ' (optional)', { area: 4, hint: 'One per line. The builder rolls on the list or lets the player type.' }); return `<div class="form">${t('traitsTable', 'Personality traits')}${t('idealsTable', 'Ideals')}${t('bondsTable', 'Bonds')}${t('flawsTable', 'Flaws')}</div>`; },
        b2024() { return `<p class="muted">The 2024 way of doing a background, optional under either rules.</p>${multi('abilities', 'Three abilities it raises', HC.ABS)}<div class="form">${text('feat', 'Its feat (optional)', { list: 'cp-hbw-feats' })}</div>`; },
        review() {
            const bad = problems();
            return `${bad.length ? `<div class="err"><p>Before you can finish:</p><ul>${bad.map(([, m]) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '<p class="muted">This is how it will read in the Compendium.</p>'}<div class="cp-hbreview">${w.ctx.preview(w.x)}</div>`;
        },
    };
    function problems() {
        const x = w.x, out = [], at = (s) => STEPS[w.kind].findIndex(([k]) => k === s), name = String(x.name || '').trim();
        if (!name) out.push([at('basics'), `Give the ${NOUN[w.kind]} a name.`]);
        if (w.kind === 'class' && name && w.ctx.officialClassNamed(name)) out.push([at('basics'), `There's already a ${name}. Pick another name.`]);
        if (w.kind === 'class' && !+x.hitDie) out.push([at('basics'), 'Pick a hit die.']);
        if ((w.kind === 'subclass' || w.kind === 'subrace') && !x.parent) out.push([at('basics'), `Pick its ${w.kind === 'subclass' ? 'class' : 'race'}.`]);
        for (const r of x.resources || []) if (String(r.name || '').trim() && r.maxType === 'formula') { const m = w.ctx.formulaError(r.formula); if (m || !String(r.formula || '').trim()) out.push([at('res'), `${r.name}: ${m || 'write its formula.'}`]); }
        const feats = [...(x.levels || []).flatMap((l) => l.feats || []), ...(x.traits || [])];
        for (const f of feats) if (String(f.uses || '').trim()) { const m = w.ctx.formulaError(f.uses); if (m) out.push([at(w.kind === 'class' || w.kind === 'subclass' ? 'levels' : 'traits'), `${f.name || 'A feature'}'s uses: ${m}`]); }
        return out;
    }

    function draw() {
        const steps = STEPS[w.kind], [key, label] = steps[w.step], body = $('#cp-hbw-body'), top = body.scrollTop;
        $('#cp-hbw-t').textContent = `${w.isNew ? 'New' : w.x.unfinished ? 'Finish' : 'Edit'} ${NOUN[w.kind]}${w.x.name ? ': ' + w.x.name : ''}`;
        $('#cp-hbw-steps').innerHTML = steps.map(([, t], i) => `<li><button type="button" class="cp-link" data-wstep="${i}"${i === w.step ? ' aria-current="step"' : ''}>${i + 1}. ${esc(t)}</button></li>`).join('');
        body.innerHTML = `<h3 class="cp-hbsteph">${esc(label)}</h3>` + STEP[key]();
        $('#cp-hbw-saved').textContent = w.x.unfinished && String(w.x.name || '').trim() ? 'Saved as Unfinished. Only you can see it.' : w.x.unfinished ? 'Give it a name and it saves as you go.' : 'Saved when you finish.';
        $('#cp-hbw-back').disabled = w.step === 0;
        $('#cp-hbw-next').textContent = w.step === steps.length - 1 ? 'Finish' : 'Next';
        $('#cp-hbw-next').disabled = w.step === steps.length - 1 && problems().length > 0;
        body.scrollTop = top;
    }
    const autosave = debounce(() => { if (w && w.x.unfinished && String(w.x.name || '').trim()) w.ctx.save(w.x).catch(() => { }); }, 500);
    function changed() { w.dirty = true; autosave(); $('#cp-hbw-saved').textContent = w.x.unfinished ? 'Saved as Unfinished. Only you can see it.' : 'Saved when you finish.'; }

    // ---- what the buttons do ----
    const ACT = {
        del(b) { const l = list(b.dataset.p); l.splice(+b.dataset.i, 1); },
        up(b) { const l = list(b.dataset.p), i = +b.dataset.i; if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; },
        down(b) { const l = list(b.dataset.p), i = +b.dataset.i; if (i < l.length - 1) [l[i + 1], l[i]] = [l[i], l[i + 1]]; },
        addfeat(b) { levelOf(+b.dataset.i).feats.push({ id: fid(), name: '' }); w.open['l' + b.dataset.i] = true; },
        addopt(b) { const f = get(b.dataset.p); (f.options ||= []).push({ id: fid(), name: '' }); f.choose ||= 1; },
        also(b) { const f = get(b.dataset.p), box = $('#cp-hbw-body').querySelector(`[data-also="${b.dataset.p}"]`); for (const n of String(box.value).split(',').map((s) => +s.trim()).filter((n) => n >= 1 && n <= 20)) { levelOf(n).feats.push({ id: fid(), name: f.name, text: '' }); w.open['l' + n] = true; } },
        addcol() { list('columns').push({ name: '', values: [] }); },
        addres() { list('resources').push({ name: '', at: 1, kind: 'count', reset: 'long', maxType: 'level', values: [] }); },
        addmin() { list('multiMin').push({ ab: 'STR', score: 13 }); },
        addbonus() { list('bonuses').push({ ab: 'STR', n: 1 }); },
        addtrait() { list('traits').push({ id: fid(), name: '' }); },
        addspeed() { list('speeds').push({ type: 'Fly', ft: 30 }); },
        additem(b) { list(b.dataset.p).push({ name: '', ref: '', n: 1 }); },
        addcat(b) { list(b.dataset.p).push({ cat: CATS[0][0], n: 1 }); },
        addchoice() { list('equip.choices').push({ options: [{ items: [{ name: '', ref: '', n: 1 }] }, { items: [{ name: '', ref: '', n: 1 }] }] }); },
        addtyped() { list('equip.choices').push({ text: '' }); },
        addchoiceopt(b) { list(b.dataset.p).push({ items: [{ name: '', ref: '', n: 1 }] }); },
        addspell(b) {
            const box = $('#cp-hbw-body').querySelector(`[data-spellin="${b.dataset.p}"]`), s = w.ctx.spellNamed(box.value), note = box.parentElement.querySelector('small');
            if (!s) { box.setAttribute('aria-invalid', 'true'); Object.assign(note, { textContent: 'Pick a spell from the list.', hidden: false }); box.focus(); return false; }
            const l = list(b.dataset.p);
            if (!l.some((x) => x.id === s.id)) l.push({ ...s, ...(w.kind === 'subclass' ? { at: 1 } : {}) });
        },
    };
    const levelOf = (n) => { const l = list('levels'); let v = l.find((x) => +x.n === n); if (!v) { v = { n, feats: [] }; l.push(v); l.sort((a, b) => a.n - b.n); } v.feats ||= []; return v; };

    function bind() {
        const body = $('#cp-hbw-body');
        body.addEventListener('input', (e) => { const el = e.target; if (!el.dataset.w || el.dataset.t === 'c' || el.dataset.t === 'm') return; store(el); changed(); });
        body.addEventListener('change', (e) => {
            const el = e.target;
            if (el.dataset.start !== undefined) return startFrom(el.value);
            if (el.dataset.copylist !== undefined) { const add = w.ctx.classSpells(el.value), l = list('spells'); for (const s of add) if (!l.some((x) => x.id === s.id)) l.push(s); changed(); toast(`Added ${add.length} spells.`, 'ok'); return draw(); }
            if (el.dataset.asi) { const a = list('asi'), n = +el.dataset.asi; set('asi', el.checked ? [...new Set([...a, n])].sort((p, q) => p - q) : a.filter((x) => x !== n)); changed(); return draw(); }
            if (!el.dataset.w) return;
            store(el);
            if (el.dataset.w === 'caster') presets(el.value);
            if (el.dataset.w === 'parent') w.ctx.parentChanged?.(w.x);
            changed();
            if (el.dataset.r !== undefined) draw();
        });
        body.addEventListener('click', (e) => {
            const b = e.target.closest('[data-wa]');
            if (b && ACT[b.dataset.wa]?.(b) !== false) { changed(); draw(); }
        });
        body.addEventListener('toggle', (e) => { const k = e.target.dataset?.fold; if (k) w.open[k] = e.target.open; }, true);
        $('#cp-hbw-steps').addEventListener('click', (e) => { const b = e.target.closest('[data-wstep]'); if (b) go(+b.dataset.wstep); });
        $('#cp-hbw-back').addEventListener('click', () => go(w.step - 1));
        $('#cp-hbw-next').addEventListener('click', () => (w.step === STEPS[w.kind].length - 1 ? finish() : go(w.step + 1)));
        $('#cp-hbw-close').addEventListener('click', tryClose);
        dlg().addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });
        dlg().addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#cp-hbask').open) { e.preventDefault(); tryClose(); } });
    }
    function store(el) {
        const t = el.dataset.t, p = el.dataset.w;
        if (t === 'c') set(p, el.checked);
        else if (t === 'm') { const v = el.value, a = (get(p) || []).filter((x) => String(x) !== v); set(p, el.checked ? [...a, v] : a); }
        else if (t === 'n') set(p, el.value === '' ? '' : +el.value);
        else set(p, el.value);
        // an item keeps what it points at along with its name
        if (el.dataset.item !== undefined) { const n = el.value.replace(/ \(homebrew\)$/, ''); set(p, n); set(p.replace(/\.name$/, '.ref'), w.ctx.itemRef(el.value)); }
    }
    function presets(type) {
        if (['full', 'half', 'third', 'pact'].includes(type)) set('slots', HC.slotsFor(type));
        else if (type === 'custom' && !w.x.slots) set('slots', HC.slotsFor('none'));
        w.x.prep ||= 'known';
        w.x.ability ||= 'INT';
    }
    function startFrom(id) {
        if (!id) return;
        const keep = { id: w.x.id, kind: w.x.kind, name: w.x.name, unfinished: w.x.unfinished, updated: w.x.updated, acct: w.x.acct };
        w.x = { ...w.ctx.seedOf(w.kind, id), ...keep };
        if (!String(w.x.name || '').trim()) w.x.name = w.ctx.officialName(w.kind, id) + ' (homebrew)';
        changed(); draw();
    }
    function go(i) { w.step = Math.max(0, Math.min(STEPS[w.kind].length - 1, i)); draw(); $('#cp-hbw-body').scrollTop = 0; $('#cp-hbw-body').focus({ preventScroll: true }); }
    async function finish() {
        const bad = problems();
        if (bad.length) return go(bad[0][0]);
        const x = w.x, ctx = w.ctx;
        delete x.unfinished;
        try { await ctx.save(x); } catch (e) { x.unfinished = 1; return toast("Couldn't save it: this browser's storage is full or blocked.", 'err'); }
        w = null; dlg().close(); ctx.done(x);
    }
    async function tryClose() {
        const named = String(w.x.name || '').trim();
        // a new one with a name is safe as Unfinished; anything else asks first
        if (w.x.unfinished && named) { const x = w.x, ctx = w.ctx; try { await ctx.save(x); } catch (e) { } w = null; dlg().close(); return ctx.done(x); }
        if (w.dirty && !await w.ctx.ask('Discard your changes?', 'Discard changes', 'Keep editing')) return;
        w = null; dlg().close();
    }
    let bound = false;
    function open(kind, x, seed, ctx) {
        if (!bound) { bind(); bound = true; }
        const fresh = !x, base = x ? JSON.parse(JSON.stringify(x)) : { id: Homebrew.id(), kind, unfinished: 1, ...(kind === 'class' ? { hitDie: 8, asi: [4, 8, 12, 16, 19], subLevel: 3, caster: 'none', saves: [] } : kind === 'race' ? { size: 'Medium', speed: 30 } : {}), ...(seed || {}) };
        w = { kind, x: base, step: 0, open: {}, ctx, isNew: fresh && !seed, dirty: !!seed };
        $('#cp-hbw-lists').innerHTML = `<datalist id="cp-hbw-spells">${ctx.spells().map((s) => `<option value="${esc(s.label)}">`).join('')}</datalist><datalist id="cp-hbw-items">${ctx.items().map((n) => `<option value="${esc(n)}">`).join('')}</datalist><datalist id="cp-hbw-feats">${ctx.feats().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
        draw();
        dlg().showModal();
        if (seed) autosave();
    }
    return { open };
})();
