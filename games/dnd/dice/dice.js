// Dice Sets page: choose a set and a sound, roll, or land a die on a number. Data (sets, file versions) comes from index.php's #dd-data.
// Every change is saved as the browser's dice choice (choice.js), which the Homebrew Sheet rolls with too.
const DATA = JSON.parse(document.getElementById('dd-data').textContent);
// versioned like the page's other files, so a changed choice.js isn't kept from the browser's cache
const { saveChoice, styleFrom } = await import(DATA.choice);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const out = $('#dd-out'), soundBox = $('#dd-sound');

// the sounds by kind; 'own' is the chosen set's own sound
const CATS = [
    ['own', 'Set’s own', ['own']],
    ['surfaces', 'Table surfaces', ['felt', 'wood', 'glass', 'stone', 'tavern']],
    ['materials', 'Dice materials', ['real', 'bone', 'ice']],
    ['metals', 'Metal dice', ['metal', 'steel', 'brass', 'anvil', 'skillet', 'aluminium', 'copper', 'silver', 'titanium', 'tungsten', 'tungsten2', 'tungsten3', 'tungsten4', 'tungsten5', 'chainmail', 'coins', 'rusty']],
    ['throws', 'How they’re thrown', ['hands', 'cup']],
    ['magic', 'Magic and drama', ['hearth', 'chime', 'sparkle', 'cinema']],
    ['playful', 'Light and playful', ['whisper', 'arcade', 'bouncy']],
];

// what's chosen, kept in this browser
const KEY = 'dice-sets-page';
let state = { set: 'ember', sound: 'own', tab: 'own', nat1: 'orig', nat20: 'orig' };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); soundBox.checked = localStorage.getItem('dice-sets-sound') !== '0'; } catch (e) { }
if (!DATA.sets.some((s) => s.key === state.set)) state.set = DATA.sets[0].key;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } syncChoice(); };
soundBox.addEventListener('change', () => { try { localStorage.setItem('dice-sets-sound', soundBox.checked ? '1' : '0'); } catch (e) { } });

// the engine (three.js and cannon-es come from jsDelivr with it), each set and the sounds load on first use
let engine = null; const sets = {};
const load = () => (engine ||= import(DATA.engine).catch((e) => { engine = null; throw e; }));
// a plain style (builtin) comes from the engine itself
const setInfo = (k) => DATA.sets.find((s) => s.key === k), setUrl = (k) => `./sets/${k}.js?v=${setInfo(k).v}`;
const setOf = (k) => (sets[k] ||= setInfo(k).builtin ? load().then((m) => ({ ...m.STYLES[k], key: k })) : import(setUrl(k)).then((m) => ({ ...m.default, key: 'set-' + k })));
const sounds = import(DATA.sounds).then((m) => m.default);
// coin sound profiles from every coinsounds/ file, each keeping the file it came from; one that fails to load is left out
const coinSounds = Promise.all((DATA.coinsounds || []).map((u) => import(u).then((m) => m.default.map((s) => ({ ...s, url: u })), () => []))).then((l) => l.flat());
// nat 1 and nat 20 sounds from every natsounds/ file; one that fails to load is left out
// each sound keeps the file it came from, for the saved choice
const nats = Promise.all(DATA.nat.map((u) => import(u).then((m) => m.default, () => ({})))).then((mods) => ({
    1: mods.flatMap((m, i) => (m.nat1 || []).map((s) => ({ ...s, url: DATA.nat[i] }))), 20: mods.flatMap((m, i) => (m.nat20 || []).map((s) => ({ ...s, url: DATA.nat[i] }))) }));
// when the die blows up or flares, after the exit starts (Ember Cage's fireball and phoenix)
const HIT = { 1: 1.7 * 0.28, 20: 2.1 * 0.42 };
// a set's own trails and nat 1 / nat 20 / other-roll animations (extras/<set>/), loaded when the set is chosen; a file that fails is left out
const extras = {};
const extrasOf = (k) => (extras[k] ||= (async () => {
    const ex = DATA.extras?.[k] || {}, load = (urls) => Promise.all((urls || []).map((u) => import(u).then((m) => m.default, () => null)));
    const [trails, anims] = await Promise.all([load(ex.trails), load(ex.anims)]);
    // each keeps the file it came from, for the saved choice
    const of = (f) => anims.map((a, i) => a?.[f] && { ...a[f], url: ex.anims[i] }).filter(Boolean);
    return { trails: trails.flatMap((l, i) => (l || []).map((t) => ({ ...t, url: ex.trails[i] }))), 1: of('nat1'), 20: of('nat20'), mid: of('mid') };
})());
// what's chosen for each set: { trail, anim1, anim20, animmid } keys, or none for the set's own
const pick = () => (state.picks ||= {})[state.set] ||= {};

// ---- dice set ----
function drawSets() {
    for (const b of $$('[data-set]')) b.setAttribute('aria-pressed', b.dataset.set === state.set);
    const s = DATA.sets.find((x) => x.key === state.set);
    $('#dd-setline').textContent = s.name + ': ' + s.look;
}
// each set's d20 with the 20 on top, one at a time so the page stays responsive
load().then(async (m) => {
    for (const b of $$('[data-set]')) {
        try { $('img', b).src = m.previewStyle(await setOf(b.dataset.set), '#5b3f8f', 96, 96, [20]); } catch (e) { $('img', b).hidden = true; }
        await new Promise((r) => setTimeout(r, 0));
    }
    // then each coin, heads up
    for (const b of $$('.dd-coin')) {
        try { $('img', b).src = await m.previewCoin(b.dataset.coin, 96, 96); } catch (e) { $('img', b).hidden = true; }
    }
}, () => { out.textContent = "Couldn't load the 3D dice. Check your connection and reload."; });
// ---- coin: the 50 cent coin, or one of the model coins (coins/fantasy-coins.glb) ----
const drawCoins = () => { for (const b of $$('.dd-coin')) b.setAttribute('aria-pressed', b.dataset.coin === (state.coin || '50c')); };
// the coin sound list: the coin's own ring, then the profiles
async function drawCoinSounds() {
    const list = [{ key: '', name: 'Coin’s own ring', blurb: 'A bright metal ring on each bounce.' }, ...(await coinSounds)], cur = state.coinSound || '';
    $('#dd-csndcount').textContent = list.length;
    $('#dd-coinsnd').innerHTML = list.map((s) => `<div class="dd-snd${cur === s.key ? ' on' : ''}">
        <button type="button" class="dd-pick" data-csnd="${esc(s.key)}" aria-pressed="${cur === s.key}"><b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>
        ${s.key ? `<button type="button" class="btn small" data-csplay="${esc(s.key)}">Play a flip</button>` : ''}</div>`).join('');
}
// a pretend flip for listening: a landing, then smaller bounces (a coin is only heard while it bounces)
const BOUNCES = [[0.95, 1], [1.15, 0.6], [1.3, 0.4], [1.4, 0.25], [1.47, 0.15], [1.52, 0.08]];

// ---- sound ----
async function drawSounds() {
    const list = await sounds, set = DATA.sets.find((x) => x.key === state.set);
    $('#dd-scount').textContent = list.length + 1;
    $('#dd-cats').innerHTML = CATS.map(([id, title, keys]) => `<button type="button" data-tab="${id}" class="${state.tab === id ? 'on' : ''}"
        aria-pressed="${state.tab === id}">${esc(title)} <span class="n">${keys.length}</span></button>`).join('');
    const keys = CATS.find(([id]) => id === state.tab)[2];
    $('#dd-sounds').innerHTML = keys.map((k) => {
        const m = k === 'own' ? { name: set.name + '’s own sound', blurb: set.sound } : list.find((x) => x.key === k);
        return `<div class="dd-snd${state.sound === k ? ' on' : ''}">
            <button type="button" class="dd-pick" data-pick="${k}" aria-pressed="${state.sound === k}"><b>${esc(m.name)}</b><span>${esc(m.blurb)}</span></button>
            <button type="button" class="btn small" data-play="throw" data-k="${k}">Play throw</button>
            <button type="button" class="btn small" data-play="roll" data-k="${k}">Play a roll</button></div>`;
    }).join('');
}
// the nat 1 and nat 20 lists, shown only for a set whose d20 has its own nat 1 and nat 20 exits
async function drawNats() {
    const set = await setOf(state.set), has = !!(set.exits?.['d20:1'] && set.exits?.['d20:20']);
    $('#dd-nats').hidden = !has; if (!has) return;
    const all = await nats;
    for (const n of [1, 20]) {
        const list = [{ key: 'orig', name: 'Original', blurb: `The set’s own nat ${n} sound.` }, ...all[n]], cur = state['nat' + n];
        $(`#dd-n${n}count`).textContent = list.length;
        $(`#dd-nat${n}`).innerHTML = list.map((s) => `<div class="dd-snd${cur === s.key ? ' on' : ''}">
            <button type="button" class="dd-pick" data-nat="${n}" data-natkey="${esc(s.key)}" aria-pressed="${cur === s.key}"><b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>
            ${s.key === 'orig' ? '' : `<button type="button" class="btn small" data-natplay="${n}" data-natkey="${esc(s.key)}">Play</button>`}</div>`).join('');
    }
}
const natOf = async (n, k) => (await nats)[n].find((s) => s.key === k);
// a set's chosen trails, top layer first (older picks kept one trail as p.trail)
const trailsOf = (p) => { if (!p.trails) { p.trails = p.trail ? [p.trail] : []; delete p.trail; } return p.trails; };
// what's chosen right now, as a choice (choice.js); only: trail keys to use instead of the chosen layers
async function choice(only = null) {
    const k = state.set, info = setInfo(k), [all, ex] = await Promise.all([nats, extrasOf(k)]), p = pick();
    const ref = (x) => x && { key: x.key, url: x.url };
    return { set: info.builtin ? { key: k, builtin: true } : { key: k, url: setUrl(k) },
        sound: state.sound === 'own' ? null : { key: state.sound, url: DATA.sounds },
        nat: { 1: ref(all[1].find((s) => s.key === state.nat1)), 20: ref(all[20].find((s) => s.key === state.nat20)) },
        trails: (only || trailsOf(p)).map((t) => ref(ex.trails.find((x) => x.key === t))).filter(Boolean),
        anims: { 1: ref(ex[1].find((a) => a.key === p.anim1)), 20: ref(ex[20].find((a) => a.key === p.anim20)), mid: ref(ex.mid.find((a) => a.key === p.animmid)) },
        coin: state.coin && state.coin !== '50c' ? state.coin : null,
        coinSound: state.coinSound ? (({ key, url }) => ({ key, url }))((await coinSounds).find((s) => s.key === state.coinSound) || {}) : null };
}
// the Homebrew Sheet reads this
async function syncChoice() { try { saveChoice(await choice()); } catch (e) { } }
// the trail and nat animation lists, shown only for a set that has its own
async function drawExtras() {
    const k = state.set, ex = await extrasOf(k); if (k !== state.set) return;
    const has = ex.trails.length || ex[1].length || ex[20].length || ex.mid.length, p = pick();
    $('#dd-extras').hidden = !has; if (!has) return;
    const layers = trailsOf(p), isOn = (field, key) => (field === 'trail' ? (key ? layers.includes(key) : !layers.length) : (p[field] || '') === key);
    const rows = (list, field, tryAs) => list.map((s) => { const on = isOn(field, s.key || '');
        return `<div class="dd-snd${on ? ' on' : ''}">
            <button type="button" class="dd-pick" data-field="${field}" data-xkey="${esc(s.key || '')}" aria-pressed="${on}"><b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>
            <button type="button" class="btn small" data-field="${field}" data-xkey="${esc(s.key || '')}" data-xtry="${tryAs}">Try</button></div>`; }).join('');
    $('#dd-trailcount').textContent = ex.trails.length + 1;
    $('#dd-trails').innerHTML = rows([{ key: '', name: 'None', blurb: 'No trail.' }, ...ex.trails], 'trail', 'set');
    // the chosen trails as layers, top first: move up or down, or take one off
    const named = layers.map((key) => ex.trails.find((t) => t.key === key)).filter(Boolean);
    $('#dd-layers').hidden = !named.length;
    $('#dd-layers').innerHTML = `<div class="dd-layhead"><b>Layers</b><span class="muted">top first</span>
        <button type="button" class="btn small" data-layer="roll">Roll with these</button></div><ol>${named.map((t, i) => `<li>
        <span class="dd-layname">${esc(t.name)}</span>
        <button type="button" class="dd-laybtn" data-layer="up" data-i="${i}" aria-label="Move ${esc(t.name)} up" title="Move up"${i ? '' : ' disabled'}>↑</button>
        <button type="button" class="dd-laybtn" data-layer="down" data-i="${i}" aria-label="Move ${esc(t.name)} down" title="Move down"${i < named.length - 1 ? '' : ' disabled'}>↓</button>
        <button type="button" class="dd-laybtn" data-layer="off" data-i="${i}" aria-label="Remove ${esc(t.name)}" title="Remove">×</button></li>`).join('')}</ol>`;
    for (const n of [1, 20, 'mid']) {
        $(`#dd-a${n}count`).textContent = ex[n].length + 1;
        $(`#dd-anim${n}`).innerHTML = rows([{ key: '', name: 'Original', blurb: n === 'mid' ? 'The set’s own animation for every other roll.' : `The set’s own nat ${n} animation.` }, ...ex[n]], 'anim' + n, n);
    }
}
// the page's own audio for listening without dice, built like the engine's: a compressor and a short noise buffer
let A = null;
const audio = () => {
    if (!A) { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createDynamicsCompressor(); o.connect(ac.destination);
        const noise = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate), d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        A = { ac, out: o, noise }; }
    if (A.ac.state === 'suspended') A.ac.resume();
    return A;
};
// a sound's throw and hit: one of sounds.js, or the chosen set's own
const soundOf = async (k) => (k === 'own' ? (await setOf(state.set)).sound || {} : (await sounds).find((x) => x.key === k));
// a pretend roll: the throw, then bumps that come quicker and softer, a few of them dice on dice
const HITS = [[0.38, 1, 1], [0.52, 0.8, 1], [0.6, 0.55, 0], [0.7, 0.6, 1], [0.79, 0.45, 1], [0.86, 0.3, 0], [0.93, 0.32, 1], [0.99, 0.2, 1], [1.04, 0.14, 1], [1.08, 0.08, 1]];

// ---- presets: named copies of the set, sound, nat sounds and that set's trails and animations; saved here, or exported and imported as JSON ----
const PKEY = 'dice-presets', pmsg = $('#dd-pmsg');
const str = (v, max = 80) => (typeof v === 'string' && v.length <= max ? v : undefined);
// a preset from storage or a file, keeping only known fields of the right kind; null when it can't be used
function cleanPreset(p) {
    const name = str(p?.name, 60)?.trim(), k = p?.picks || {};
    if (!name || !setInfo(p.set)) return null;
    return { name, set: p.set, sound: str(p.sound) || 'own', nat1: str(p.nat1) || 'orig', nat20: str(p.nat20) || 'orig',
        picks: { trails: (Array.isArray(k.trails) ? k.trails : []).map((t) => str(t)).filter(Boolean).slice(0, 20), anim1: str(k.anim1), anim20: str(k.anim20), animmid: str(k.animmid) } };
}
const cleanAll = (list) => (Array.isArray(list) ? list.map(cleanPreset).filter(Boolean) : []);
let presets = [];
try { presets = cleanAll(JSON.parse(localStorage.getItem(PKEY))); } catch (e) { }
const storePresets = () => { try { localStorage.setItem(PKEY, JSON.stringify(presets)); } catch (e) { } };
// a preset with a name already saved replaces it
const upsert = (p) => { const i = presets.findIndex((x) => x.name === p.name); if (i >= 0) presets[i] = p; else presets.push(p); };
async function drawPresets() {
    const list = await sounds;
    $('#dd-pcount').textContent = presets.length || '';
    $('#dd-pexport').disabled = !presets.length;
    $('#dd-presets').innerHTML = presets.length ? presets.map((p, i) => {
        const snd = list.find((x) => x.key === p.sound)?.name || 'Set’s own sound', n = p.picks.trails.length;
        return `<div class="dd-snd">
            <button type="button" class="dd-pick" data-preset="${i}"><b>${esc(p.name)}</b><span>${esc(setInfo(p.set).name)} · ${esc(snd)}${n ? ` · ${n} trail${n > 1 ? 's' : ''}` : ''}</span></button>
            <button type="button" class="btn small" data-pdel="${i}" aria-label="Delete ${esc(p.name)}">Delete</button></div>`;
    }).join('') : '<p class="muted dd-natline">No presets yet. Name the current set, sound and trails and save them to switch back in one click.</p>';
}
async function usePreset(p) {
    const list = await sounds;
    Object.assign(state, { set: p.set, sound: p.sound === 'own' || list.some((x) => x.key === p.sound) ? p.sound : 'own', nat1: p.nat1, nat20: p.nat20 });
    state.tab = (CATS.find(([, , keys]) => keys.includes(state.sound)) || CATS[0])[0];
    (state.picks ||= {})[p.set] = { trails: [...p.picks.trails], anim1: p.picks.anim1, anim20: p.picks.anim20, animmid: p.picks.animmid };
    save(); drawSets(); drawSounds(); drawNats(); drawExtras();
    pmsg.textContent = `Using ${p.name}.`;
}
$('#dd-pform').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = pick(), preset = cleanPreset({ name: $('#dd-pname').value, set: state.set, sound: state.sound, nat1: state.nat1, nat20: state.nat20,
        picks: { trails: [...trailsOf(p)], anim1: p.anim1, anim20: p.anim20, animmid: p.animmid } });
    if (!preset) return;
    upsert(preset); storePresets(); drawPresets();
    $('#dd-pname').value = ''; pmsg.textContent = `Saved ${preset.name}.`;
});
$('#dd-pfile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let data = null;
    try { if (f.size < 1e6) data = JSON.parse(await f.text()); } catch (err) { }
    const got = cleanAll(Array.isArray(data) ? data : data?.presets);
    if (!got.length) { pmsg.textContent = 'No presets found in that file.'; return; }
    got.forEach(upsert); storePresets(); drawPresets();
    pmsg.textContent = `Imported ${got.length} preset${got.length > 1 ? 's' : ''}.`;
});

// ---- rolling ----
const NUMS = (d) => Array.from({ length: d }, (_, i) => i + 1);
// the coin lands on heads or tails instead of a number
const fillNums = () => { if ($('#dd-die').value === 'coin') { $('#dd-num').innerHTML = '<option value="heads">Heads</option><option value="tails">Tails</option>'; return; }
    const d = +$('#dd-die').value, cur = +$('#dd-num').value || d;
    $('#dd-num').innerHTML = NUMS(d).map((n) => `<option${n === Math.min(cur, d) ? ' selected' : ''}>${n}</option>`).join(''); };
const said = (n, v) => (n === 'coin' ? `Coin: ${v === 'heads' ? 'Heads' : 'Tails'}` : `d${n} ${v}`);
// only: trail keys to use instead of the chosen layers (a trail's Try shows it on its own)
async function roll(groups, land = null, only = null) {
    out.textContent = 'Rolling...';
    try {
        // built the same way as the Homebrew Sheet's rolls
        const m = await load(), style = await styleFrom(await choice(only), m);
        // a new roll takes the last one's dice off the table first, even mid-roll
        m.clearTable(true);
        const res = await m.throwDice(groups, { style, sound: soundBox.checked, land });
        out.textContent = res.flatMap(([n, r]) => r.map((v) => said(n, v))).join(' · ');
    } catch (e) { out.textContent = "Couldn't roll. Try again."; }
}

document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    // the set's own sound row names the set, so it redraws too
    if (b.dataset.set) { state.set = b.dataset.set; save(); drawSets(); drawSounds(); drawNats(); drawExtras(); }
    else if (b.dataset.coin) { state.coin = b.dataset.coin; save(); drawCoins(); roll([['coin', 1]]); }
    else if (b.dataset.csnd != null) { state.coinSound = b.dataset.csnd || undefined; save(); drawCoinSounds(); }
    else if (b.dataset.csplay) { const s = (await coinSounds).find((x) => x.key === b.dataset.csplay), a = audio(), t = a.ac.currentTime + 0.05;
        for (const [at, vol] of BOUNCES) s.hit({ ...a, t: t + at, vol, onTable: true }); }
    else if (b.dataset.field === 'trail') {
        // a trail row adds that trail as the top layer, or takes it off again; None takes them all off; Try rolls the set with just that trail
        const key = b.dataset.xkey, list = trailsOf(pick());
        if (b.dataset.xtry) return roll([[4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [20, 1]], null, key ? [key] : []);
        if (!key) list.length = 0; else if (list.includes(key)) list.splice(list.indexOf(key), 1); else list.unshift(key);
        save(); drawExtras();
    }
    else if (b.dataset.field) {
        // picking an animation; Try also lands a d20 on 1 or 20 with it, or rolls the set for the other-rolls one
        pick()[b.dataset.field] = b.dataset.xkey || undefined; save(); drawExtras();
        if (b.dataset.xtry === 'mid') roll([[4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [20, 1]], [[3], [4], [5], [6], [7], [11]]);
        else if (b.dataset.xtry) roll([[20, 1]], [[+b.dataset.xtry]]);
    }
    else if (b.dataset.layer) {
        const list = trailsOf(pick()), i = +b.dataset.i;
        if (b.dataset.layer === 'roll') return roll([[4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [20, 1]]);
        if (b.dataset.layer === 'off') list.splice(i, 1);
        else { const j = b.dataset.layer === 'up' ? i - 1 : i + 1; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; }
        save(); drawExtras();
    }
    else if (b.dataset.nat) { state['nat' + b.dataset.nat] = b.dataset.natkey; save(); drawNats(); }
    else if (b.dataset.natplay) { const n = +b.dataset.natplay, s = await natOf(n, b.dataset.natkey), a = audio(), t0 = a.ac.currentTime + 0.05;
        s.play({ ...a, t0, hit: t0 + HIT[n] }); }
    else if (b.dataset.try) roll([[20, 1]], [[+b.dataset.try]]);
    else if (b.dataset.tab) { state.tab = b.dataset.tab; save(); drawSounds(); }
    else if (b.dataset.pick) { state.sound = b.dataset.pick; save(); drawSounds(); }
    else if (b.dataset.play) {
        const m = await soundOf(b.dataset.k), a = audio(), t = a.ac.currentTime + 0.05;
        m.throw?.({ ...a, t, count: 3 });
        if (b.dataset.play === 'roll') for (const [at, vol, table] of HITS) m.hit?.({ ...a, t: t + at, vol, onTable: !!table });
    }
    else if (b.dataset.preset) usePreset(presets[+b.dataset.preset]);
    else if (b.dataset.pdel) { const p = presets[+b.dataset.pdel]; if (!confirm(`Delete the preset ${p.name}?`)) return;
        presets.splice(+b.dataset.pdel, 1); storePresets(); drawPresets(); pmsg.textContent = `Deleted ${p.name}.`; }
    else if (b.id === 'dd-pimport') $('#dd-pfile').click();
    else if (b.id === 'dd-pexport') {
        const a = Object.assign(document.createElement('a'), { download: 'dice-presets.json',
            href: URL.createObjectURL(new Blob([JSON.stringify({ kind: 'dice-presets', presets }, null, 2)], { type: 'application/json' })) });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    else if (b.dataset.roll) roll(b.dataset.roll.split(',').map((g) => g.split('x').map(Number)));
    else if (b.id === 'dd-coin') roll([['coin', 1]]);
    // Land on: that many of the die, every one landing on the chosen number (1 to 30)
    else if (b.id === 'dd-landgo') { const die = $('#dd-die').value, coin = die === 'coin', n = Math.max(1, Math.min(30, parseInt($('#dd-count').value, 10) || 1));
        $('#dd-count').value = n; roll([[coin ? 'coin' : +die, n]], [Array(n).fill(coin ? $('#dd-num').value : +$('#dd-num').value)]); }
});
$('#dd-die').addEventListener('change', fillNums);
fillNums(); drawSets(); drawCoins(); drawCoinSounds(); drawSounds(); drawNats(); drawExtras(); drawPresets();
