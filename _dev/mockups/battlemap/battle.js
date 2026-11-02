// Battle map prototype: fake data in localStorage, so the DM, Table and player tabs stay in step.
// shortcut: localStorage stands in for the live relay (ROADMAP 1.2), swap when campaigns exist.
// shortcut: fog only covers the image in the browser; the real build serves players a copy with fog cut out on the server (ROADMAP 1.6).
// shortcut: uploaded map images live in this browser's IndexedDB, not on the server (ROADMAP 1.6 uploads them).
const KEY = 'battlemap-proto', FX = KEY + '-fx';
const VIEW = document.body.dataset.view; // 'dm' | 'table' | 'player'
const ME = document.body.dataset.me || 'dm'; // player pages say which character they are
const CELL = 64; // one square = 5 ft, in map units
const COLORS = ['#e40712', '#ff8a00', '#ffd400', '#2ecc40', '#1e90ff', '#a259ff', '#ffffff'];

const DEFAULT = () => ({
  combat: false, round: 1, active: null, mapId: 'grass',
  units: [
    { id: 'torvin', name: 'Torvin', kind: 'pc', ac: 18, hp: 44, max: 44, bonus: 1, size: 1, c: '#8a5a2b' },
    { id: 'mira', name: 'Mira', kind: 'pc', ac: 12, hp: 22, max: 22, bonus: 3, size: 1, c: '#6a3fa0' },
    { id: 'pip', name: 'Pip', kind: 'pc', ac: 15, hp: 31, max: 31, bonus: 4, size: 1, c: '#2f7d4f' },
    { id: 'sera', name: 'Sera', kind: 'pc', ac: 18, hp: 38, max: 38, bonus: 0, size: 1, c: '#b58a1c' },
    { id: 'gob-a', name: 'Goblin A', kind: 'npc', ac: 15, hp: 7, max: 7, bonus: 2, size: 1, c: '#5c7a2a' },
    { id: 'gob-b', name: 'Goblin B', kind: 'npc', ac: 15, hp: 7, max: 7, bonus: 2, size: 1, c: '#5c7a2a' },
    { id: 'gob-c', name: 'Goblin C', kind: 'npc', ac: 15, hp: 7, max: 7, bonus: 2, size: 1, c: '#5c7a2a' },
    { id: 'bugbear', name: 'Bugbear', kind: 'npc', ac: 16, hp: 27, max: 27, bonus: 2, size: 1, c: '#7a4a2a' },
    { id: 'ogre', name: 'Ogre', kind: 'npc', ac: 11, hp: 59, max: 59, bonus: -1, size: 2, c: '#6b6f3a' },
  ].map(u => ({ ...u, init: null })),
  // every map keeps its own token spots and drawings
  maps: [{
    id: 'grass', name: 'Grass', img: false, cols: 24, rows: 15, marks: [],
    tokens: { torvin: { x: 5, y: 7 }, mira: { x: 3, y: 9 }, pip: { x: 6, y: 10 }, sera: { x: 4, y: 5 }, 'gob-a': { x: 15, y: 4 },
      'gob-b': { x: 16, y: 7 }, 'gob-c': { x: 15, y: 10 }, bugbear: { x: 19, y: 9 }, ogre: { x: 19, y: 4 } },
  }],
});

let state = load();
const view = { s: 1, tx: 0, ty: 0 };
let tool = 'select', shape = 'circle', color = ME === 'dm' ? COLORS[0] : COLORS[5], selected = null, preview = null, fitting = false;
let sidebar = 'init'; // which panel the left sidebar shows: 'init' or 'maps'

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.maps) return s; } catch {}
  return DEFAULT(); // older prototype saves had no maps; start fresh
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('This browser is out of space for the prototype.'); }
  render();
}
addEventListener('storage', e => {
  if (e.key === KEY) { state = load(); render(); }
  if (e.key === FX && e.newValue) { try { const f = JSON.parse(e.newValue); if (f.map === viewId()) { fxs[f.by + ':' + f.kind] = f; startFx(); } } catch {} }
});

const $ = s => document.querySelector(s);
// players and the TV see state.mapId; the DM can look at another map privately (state.dmMapId) to set it up first
const viewId = () => VIEW === 'dm' && state.maps.some(m => m.id === state.dmMapId) ? state.dmMapId : state.mapId;
const cur = () => state.maps.find(m => m.id === viewId()) || state.maps[0];
const unit = id => state.units.find(u => u.id === id);
const pos = u => cur().tokens[u.id]; // undefined: not on this map
const d20 = () => 1 + Math.floor(Math.random() * 20);
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const order = () => state.units.filter(u => u.init != null)
  .sort((a, b) => b.init - a.init || b.bonus - a.bonus || a.name.localeCompare(b.name));
const waiting = () => state.units.filter(u => u.init == null);
const icon = name => `<svg class="icon" viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;
const whoName = by => by === 'dm' ? 'DM' : unit(by)?.name || by;
const canMove = u => VIEW === 'dm' || (VIEW === 'player' && u.id === ME);
const canErase = m => VIEW === 'dm' || m.by === ME;
const ft = px => Math.round(px / CELL * 5);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const snapLen = px => Math.max(CELL, Math.round(px / CELL) * CELL); // whole 5 ft steps, at least 5 ft
const snapCorner = p => ({ x: Math.round(p.x / CELL) * CELL, y: Math.round(p.y / CELL) * CELL });
const snapCentre = p => ({ x: (Math.floor(p.x / CELL) + .5) * CELL, y: (Math.floor(p.y / CELL) + .5) * CELL });
const centre = u => ({ x: (pos(u).x + u.size / 2) * CELL, y: (pos(u).y + u.size / 2) * CELL });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute">
  <symbol id="i-panel" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1.5M5.5 11h1.5"/></symbol>
  <symbol id="i-pointer" viewBox="0 0 24 24"><path d="M6 3l13 7.5-5.8 1.6L10.5 18z"/></symbol>
  <symbol id="i-hand" viewBox="0 0 24 24"><path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 10.5V4a1.5 1.5 0 013 0v7M14 10.5V5.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-.5a6 6 0 01-5-2.7L2.2 14.5a1.5 1.5 0 012.5-1.7L8 16"/></symbol>
  <symbol id="i-point" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></symbol>
  <symbol id="i-ruler" viewBox="0 0 24 24"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></symbol>
  <symbol id="i-draw" viewBox="0 0 24 24"><path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/></symbol>
  <symbol id="i-erase" viewBox="0 0 24 24"><path d="M8 20h12"/><path d="M4.5 14.5l9-9a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L12 19H8.5z"/><path d="M9 10l5.5 5.5"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></symbol>
  <symbol id="i-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1" fill="currentColor"/></symbol>
  <symbol id="i-square" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/></symbol>
  <symbol id="i-cone" viewBox="0 0 24 24"><path d="M3 12L20 3.5v17z" stroke-linejoin="round"/></symbol>
  <symbol id="i-line" viewBox="0 0 24 24"><path d="M3 16.5L18.5 1 23 5.5 7.5 21z"/></symbol>
  <symbol id="i-emanation" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-dasharray="3 2.5"/><circle cx="12" cy="12" r="4"/></symbol>
  <symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></symbol>
  <symbol id="i-up" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></symbol>
  <symbol id="i-full" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
  <symbol id="i-fit" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10v4M16 10v4"/></symbol>
  <symbol id="i-tv" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></symbol>
  <symbol id="i-d20" viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 7l-6 9h12z"/><path d="M12 2v5M3 7l3 9M21 7l-3 9M12 22v-6"/></symbol>
  <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
  <symbol id="i-fog" viewBox="0 0 24 24"><path d="M6.5 17a4.5 4.5 0 01-.6-9A6 6 0 0117.5 9a4 4 0 01.5 8z"/><path d="M4 21h16"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-eyeoff" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.1 6.2C3.6 7.9 2 12 2 12s3.5 7 10 7a10 10 0 005.2-1.4"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></symbol>
</svg>`);

/* ---------- map images (IndexedDB, shared by every tab of this browser) ---------- */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('battlemap-proto', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('maps');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function imgPut(id, blob) {
  const db = await idb();
  await new Promise((res, rej) => { const t = db.transaction('maps', 'readwrite'); t.objectStore('maps').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
const urls = {};
const imgUrl = id => urls[id] ||= idb().then(db => new Promise((res, rej) => {
  const r = db.transaction('maps').objectStore('maps').get(id);
  r.onsuccess = () => res(r.result ? URL.createObjectURL(r.result) : null); r.onerror = () => rej(r.error);
})).catch(() => null);
const imageSize = blob => new Promise((res, rej) => {
  const i = new Image(), u = URL.createObjectURL(blob);
  i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); };
  i.onerror = () => rej(new Error('not an image')); i.src = u;
});

/* ---------- map ---------- */
const map = $('.map'), vp = $('.viewport');
map.innerHTML = `<div class="layer"><svg class="marks"></svg><div class="tokens"></div><svg class="fog"></svg><svg class="fx"></svg></div>`;
const layer = map.querySelector('.layer'), marksEl = map.querySelector('.marks'), tokensEl = map.querySelector('.tokens'), fxEl = map.querySelector('.fx'), fogEl = map.querySelector('.fog');
let G = {}; // size of the current map: W, H in map units, ox, oy = where the grid starts, cols, rows

function applyMap() {
  const m = cur(), k = m.img ? CELL / m.sq : 1; // image pixels -> map units
  const W = m.img ? m.iw * k : m.cols * CELL, H = m.img ? m.ih * k : m.rows * CELL;
  const ox = m.img ? m.ox * k : 0, oy = m.img ? m.oy * k : 0;
  G = { W, H, ox, oy, cols: Math.floor((W - ox) / CELL), rows: Math.floor((H - oy) / CELL) };
  Object.assign(map.style, { width: W + 'px', height: H + 'px' });
  map.style.setProperty('--gx', ox + 'px'); map.style.setProperty('--gy', oy + 'px');
  layer.style.transform = `translate(${ox}px,${oy}px)`;
  for (const s of [marksEl, fxEl, fogEl]) { s.setAttribute('width', W); s.setAttribute('height', H); }
  map.classList.toggle('img', !!m.img);
  map.classList.toggle('fitting', fitting);
  if (m.img) imgUrl(m.id).then(u => { if (cur().id === m.id) map.style.setProperty('--img', u ? `url(${u})` : 'none'); });
}

function renderTokens() {
  const ids = new Set(order().map(u => u.id));
  tokensEl.innerHTML = state.units.filter(pos).map(u => {
    const p = pos(u);
    const cls = [u.kind, u.id === state.active && state.combat ? 'active' : '', u.hp <= 0 ? 'down' : '',
      u.id === selected ? 'selected' : '', canMove(u) ? 'movable' : ''].join(' ');
    const shield = state.combat && ids.has(u.id)
      ? `<div class="shield"><svg viewBox="0 0 24 28"><path d="M12 1l10 4v8c0 7-5 11.5-10 14C7 24.5 2 20 2 13V5z" fill="#2b3036" stroke="#9aa3ab" stroke-width="1.5"/></svg><b>${u.init}</b></div>` : '';
    return `<div class="token ${cls}" data-id="${u.id}" style="left:${p.x * CELL}px;top:${p.y * CELL}px;width:${u.size * CELL}px;height:${u.size * CELL}px;--c:${u.c};--size:${u.size}">
      ${shield}<div class="disc">${initials(u.name)}</div><div class="label">${esc(u.name)}</div></div>`;
  }).join('');
}

/* ---------- drawings and spell shapes (saved until erased) ---------- */
const label = (x, y, text) => `<text class="lbl" x="${x}" y="${y}">${esc(text)}</text>`;
const fill = c => `fill="${c}" fill-opacity=".28" stroke="${c}" stroke-width="3" stroke-linejoin="round"`;
function markSvg(m) {
  const c = m.color;
  if (m.type === 'draw') return `<polyline points="${m.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (m.type === 'circle') return `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" ${fill(c)}/>${label(m.x, m.y, ft(m.r) + ' ft radius')}`;
  if (m.type === 'emanation') {
    const u = unit(m.on); if (!u || !pos(u)) return '';
    const o = centre(u);
    return `<circle cx="${o.x}" cy="${o.y}" r="${u.size * CELL / 2 + m.r}" ${fill(c)} stroke-dasharray="10 6"/>${label(o.x, o.y + u.size * CELL / 2 + m.r - 14, ft(m.r) + ' ft emanation')}`;
  }
  if (m.type === 'square') return `<rect x="${m.x}" y="${m.y}" width="${m.side}" height="${m.side}" ${fill(c)}/>${label(m.x + m.side / 2, m.y + m.side / 2, ft(m.side) + ' ft cube')}`;
  // cone and line run from an origin in a direction; a cone is as wide at its end as it is long
  const dx = Math.cos(m.a), dy = Math.sin(m.a), half = m.type === 'cone' ? m.len / 2 : CELL / 2;
  const end = { x: m.x + dx * m.len, y: m.y + dy * m.len };
  const pts = m.type === 'cone'
    ? [[m.x, m.y], [end.x - dy * half, end.y + dx * half], [end.x + dy * half, end.y - dx * half]]
    : [[m.x - dy * half, m.y + dx * half], [end.x - dy * half, end.y + dx * half], [end.x + dy * half, end.y - dx * half], [m.x + dy * half, m.y - dx * half]];
  const mid = m.type === 'cone' ? { x: m.x + dx * m.len * .62, y: m.y + dy * m.len * .62 } : { x: (m.x + end.x) / 2, y: (m.y + end.y) / 2 };
  return `<path d="${roundPath(pts, m.type === 'cone' ? 14 : 4)}" ${fill(c)}/>${label(mid.x, mid.y, ft(m.len) + ' ft ' + m.type)}`;
}
// a closed polygon with each corner cut back by r and curved through the corner
function roundPath(pts, r) {
  const n = pts.length, at = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(d, l / 2) / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = at(p, pts[(i + n - 1) % n], r), b = at(p, pts[(i + 1) % n], r);
    d += `${i ? 'L' : 'M'}${a[0]},${a[1]}Q${p[0]},${p[1]} ${b[0]},${b[1]}`;
  }
  return d + 'Z';
}
/* ---------- fog of war: strokes of a round brush over a base of all hidden or all shown ---------- */
const BRUSH = { s: CELL * .75, m: CELL * 1.5, l: CELL * 3 }; // brush radius
let fogMode = 'reveal', brush = 'm', brushAt = null;
const fogOf = m => m.fog ||= { base: 'shown', strokes: [] };
function renderFog() {
  const f = fogOf(cur()), x = -G.ox, y = -G.oy;
  // in the mask white keeps the fog and black clears it
  const paint = st => `<polyline points="${st.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${st.mode === 'reveal' ? '#000' : '#fff'}" stroke-width="${st.r * 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const any = f.base === 'hidden' || f.strokes.some(st => st.mode === 'hide');
  fogEl.innerHTML = (any ? `<mask id="fogmask" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${G.W}" height="${G.H}">
      <rect x="${x}" y="${y}" width="${G.W}" height="${G.H}" fill="${f.base === 'hidden' ? '#fff' : '#000'}"/>${f.strokes.map(paint).join('')}</mask>
    <rect class="cover" x="${x}" y="${y}" width="${G.W}" height="${G.H}" mask="url(#fogmask)"/>` : '')
    + (brushAt ? `<circle class="brush ${fogMode}" cx="${brushAt.x}" cy="${brushAt.y}" r="${BRUSH[brush]}"/>` : '');
}
let fogWrite = 0;
function saveFogSoon() { // painting writes at most every 60 ms, so other tabs follow along without a write per mouse move
  renderFog();
  const now = Date.now();
  if (now - fogWrite > 60) { fogWrite = now; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
}
vp.addEventListener('pointermove', e => { if (tool === 'fog' && VIEW === 'dm') { brushAt = toMap(e); renderFog(); } });
vp.addEventListener('pointerleave', () => { if (brushAt) { brushAt = null; renderFog(); } });

function renderMarks() {
  marksEl.innerHTML = cur().marks.map(m => `<g data-mark="${m.id}" class="${canErase(m) ? 'erasable' : ''}">${markSvg(m)}</g>`).join('')
    + (preview ? `<g class="preview">${markSvg(preview)}</g>` : '');
}
function shapeFrom(o, p) {
  const base = { type: shape, color, by: ME };
  if (shape === 'circle') { const c = snapCorner(o); return { ...base, x: c.x, y: c.y, r: snapLen(dist(c, p)) }; }
  if (shape === 'square') {
    const c = snapCorner(o), side = snapLen(Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)));
    return { ...base, x: p.x < c.x ? c.x - side : c.x, y: p.y < c.y ? c.y - side : c.y, side };
  }
  return { ...base, x: o.x, y: o.y, a: Math.atan2(p.y - o.y, p.x - o.x), len: snapLen(dist(o, p)) };
}

/* ---------- point, ping and ruler (fade on their own, shown to everyone) ---------- */
const fxs = {};
let fxRunning = false, fxLastWrite = 0;
function fxSend(f, force) {
  f.by = ME; f.map = viewId(); fxs[ME + ':' + f.kind] = f; startFx();
  const now = Date.now();
  if (force || now - fxLastWrite > 40) { fxLastWrite = now; try { localStorage.setItem(FX, JSON.stringify(f)); } catch {} }
}
function startFx() { if (!fxRunning) { fxRunning = true; requestAnimationFrame(tickFx); } }
function tickFx() {
  const now = Date.now();
  let out = '';
  for (const [k, f] of Object.entries(fxs)) {
    if (f.map !== viewId()) { delete fxs[k]; continue; }
    if (f.kind === 'trail') {
      const pts = f.pts.filter(p => now - p[2] < 900);
      if (!pts.length) { delete fxs[k]; continue; }
      for (let i = 1; i < pts.length; i++) // thin at the tail, thick at the head
        out += `<line x1="${pts[i - 1][0]}" y1="${pts[i - 1][1]}" x2="${pts[i][0]}" y2="${pts[i][1]}" stroke="${f.color}" stroke-width="${1 + 7 * i / pts.length}" stroke-linecap="round"/>`;
      const h = f.pts[f.pts.length - 1];
      if (now - h[2] < 900) out += `<circle cx="${h[0]}" cy="${h[1]}" r="9" fill="#fff" stroke="${f.color}" stroke-width="3"/>`;
    } else if (f.kind === 'ping') {
      const age = now - f.t;
      if (age > 1800) { delete fxs[k]; continue; }
      for (let i = 0; i < 3; i++) {
        const a = (age - i * 250) / 1100;
        if (a > 0 && a < 1) out += `<circle cx="${f.x}" cy="${f.y}" r="${8 + a * 70}" fill="none" stroke="${f.color}" stroke-width="${6 * (1 - a) + 1}" opacity="${1 - a}"/>`;
      }
      out += `<circle cx="${f.x}" cy="${f.y}" r="8" fill="${f.color}" stroke="#fff" stroke-width="3" opacity="${Math.min(1, (1800 - age) / 400)}"/>`
        + label(f.x, f.y - 26, whoName(f.by));
    } else if (f.kind === 'ruler') {
      if (now - f.t > (f.done ? 1500 : 15000)) { delete fxs[k]; continue; }
      const { a, b } = f, cells = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / CELL;
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#000" stroke-opacity=".55" stroke-width="8" stroke-linecap="round"/>
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-width="3" stroke-dasharray="12 8"/>
        <circle cx="${a.x}" cy="${a.y}" r="6" fill="#fff"/><circle cx="${b.x}" cy="${b.y}" r="6" fill="#fff"/>
        <rect x="${b.x + 14}" y="${b.y - 34}" width="78" height="30" rx="6" fill="#1d2125" stroke="#fff" stroke-opacity=".4"/>
        <text class="lbl" x="${b.x + 53}" y="${b.y - 19}">${Math.round(cells) * 5} ft</text>`;
    }
  }
  fxEl.innerHTML = out;
  if (Object.keys(fxs).length) requestAnimationFrame(tickFx); else fxRunning = false;
}
const ping = p => fxSend({ kind: 'ping', x: p.x, y: p.y, t: Date.now(), color }, true);

/* ---------- pan, zoom and the pointer ---------- */
function applyView() {
  map.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`;
  $('.pct').textContent = (view.s * 100).toFixed(1) + '%';
}
function fit() {
  const r = vp.getBoundingClientRect(), top = state.combat && showStrip() ? 90 : 20;
  view.s = Math.min((r.width - 40) / G.W, (r.height - top - 20) / G.H);
  view.tx = (r.width - G.W * view.s) / 2;
  view.ty = top + (r.height - top - 20 - G.H * view.s) / 2;
  applyView();
}
function zoomAt(f, cx, cy) {
  const s = Math.min(3, Math.max(0.05, view.s * f));
  view.tx = cx - (cx - view.tx) * (s / view.s);
  view.ty = cy - (cy - view.ty) * (s / view.s);
  view.s = s; applyView();
}
// screen point -> grid space (0,0 is the top-left corner of the first full square)
function toMap(e) {
  const r = vp.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.tx) / view.s - G.ox, y: (e.clientY - r.top - view.ty) / view.s - G.oy };
}

vp.addEventListener('wheel', e => {
  e.preventDefault();
  const r = vp.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

vp.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  try { vp.setPointerCapture(e.pointerId); } catch {} // keeps the drag going when the pointer leaves the map
  const p0 = toMap(e), start = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  const tok = e.target.closest('.token'), u = tok && unit(tok.dataset.id);
  const moved = ev => Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6;
  let move = () => {}, up = () => {};
  const pan = () => {
    vp.classList.add('panning');
    move = ev => { view.tx = start.tx + ev.clientX - start.x; view.ty = start.ty + ev.clientY - start.y; applyView(); };
    up = () => vp.classList.remove('panning');
  };

  if (fitting) {
    // drag slides the grid over the image until its lines sit on the map's own squares
    const m = cur(), k = CELL / m.sq, ox = m.ox, oy = m.oy, wrap = n => ((n % m.sq) + m.sq) % m.sq;
    move = ev => { m.ox = wrap(ox + (ev.clientX - start.x) / view.s / k); m.oy = wrap(oy + (ev.clientY - start.y) / view.s / k); applyMap(); };
    up = () => save();
  } else if (e.altKey && VIEW !== 'table') { ping(p0); return; }
  else if (tool === 'select' && u && canMove(u)) {
    selected = u.id; renderTokens();
    const el = tokensEl.querySelector(`[data-id="${u.id}"]`), p = pos(u), ox = p.x * CELL, oy = p.y * CELL;
    move = ev => {
      el.style.left = ox + (ev.clientX - start.x) / view.s + 'px';
      el.style.top = oy + (ev.clientY - start.y) / view.s + 'px';
    };
    up = ev => {
      p.x = clamp(Math.round((ox + (ev.clientX - start.x) / view.s) / CELL), 0, G.cols - u.size);
      p.y = clamp(Math.round((oy + (ev.clientY - start.y) / view.s) / CELL), 0, G.rows - u.size);
      save();
    };
  } else if (tool === 'select' && VIEW !== 'table') {
    // press and hold without moving pings (for phones); dragging pans
    pan();
    const panMove = move, panUp = up, hold = setTimeout(() => ping(p0), 500);
    move = ev => { if (moved(ev)) clearTimeout(hold); panMove(ev); };
    up = () => { clearTimeout(hold); panUp(); };
  } else if (tool === 'point') {
    const f = { kind: 'trail', color, pts: [[p0.x, p0.y, Date.now()]] };
    let far = false;
    move = ev => { far ||= moved(ev); const p = toMap(ev); f.pts.push([p.x, p.y, Date.now()]); f.pts = f.pts.slice(-80); fxSend(f); };
    up = () => { if (far) fxSend(f, true); else { delete fxs[ME + ':trail']; ping(p0); } };
  } else if (tool === 'ruler') {
    const a = snapCentre(p0);
    move = ev => fxSend({ kind: 'ruler', a, b: snapCentre(toMap(ev)), t: Date.now() });
    up = ev => fxSend({ kind: 'ruler', a, b: snapCentre(toMap(ev)), t: Date.now(), done: true }, true);
  } else if (tool === 'draw') {
    preview = { type: 'draw', color, by: ME, pts: [[Math.round(p0.x), Math.round(p0.y)]] };
    move = ev => {
      const p = toMap(ev), last = preview.pts[preview.pts.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) > 3) { preview.pts.push([Math.round(p.x), Math.round(p.y)]); renderMarks(); }
    };
    up = () => { const m = preview; preview = null; if (m.pts.length > 1) addMark(m); else renderMarks(); };
  } else if (tool === 'shape' && shape === 'emanation') {
    if (!u) { toast('Start an emanation on a token, then drag outwards.'); return; }
    const o = centre(u), rad = u.size * CELL / 2;
    preview = { type: 'emanation', on: u.id, r: CELL, color, by: ME };
    move = ev => { preview.r = snapLen(dist(o, toMap(ev)) - rad); renderMarks(); };
    up = () => { const m = preview; preview = null; addMark(m); };
  } else if (tool === 'shape') {
    preview = shapeFrom(p0, p0);
    move = ev => { preview = shapeFrom(p0, toMap(ev)); renderMarks(); };
    up = () => { const m = preview; preview = null; addMark(m); };
  } else if (tool === 'fog' && VIEW === 'dm') {
    const st = { mode: fogMode, r: BRUSH[brush], pts: [[Math.round(p0.x), Math.round(p0.y)]] };
    fogOf(cur()).strokes.push(st); saveFogSoon();
    move = ev => {
      const p = toMap(ev), last = st.pts[st.pts.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) > st.r / 4) { st.pts.push([Math.round(p.x), Math.round(p.y)]); saveFogSoon(); }
    };
    up = () => save();
  } else if (tool === 'erase') {
    const g = e.target.closest('[data-mark]'), m = g && cur().marks.find(x => x.id === g.dataset.mark);
    if (m && canErase(m)) { cur().marks = cur().marks.filter(x => x !== m); save(); return; }
    pan();
  } else pan();

  renderMarks();
  vp.addEventListener('pointermove', move);
  vp.addEventListener('pointerup', ev => { vp.removeEventListener('pointermove', move); up(ev); }, { once: true });
});
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function addMark(m) { cur().marks.push({ ...m, id: newId() }); save(); }

$('[data-zoom="in"]').onclick = () => { const r = vp.getBoundingClientRect(); zoomAt(1.2, r.width / 2, r.height / 2); };
$('[data-zoom="out"]').onclick = () => { const r = vp.getBoundingClientRect(); zoomAt(1 / 1.2, r.width / 2, r.height / 2); };
$('[data-zoom="fit"]').onclick = fit;
$('[data-act="fullscreen"]').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
addEventListener('resize', fit);

/* ---------- maps: show, upload, fit the grid (DM) ---------- */
function renderMapBar() {
  if (VIEW !== 'dm') return;
  $('[data-act="grid"]').hidden = !cur().img || fitting;
  const bar = $('.fitbar');
  bar.hidden = !fitting;
  if (fitting) bar.querySelector('input').value = +cur().sq.toFixed(1);
  const priv = viewId() !== state.mapId, banner = $('.banner');
  banner.hidden = !priv || fitting;
  if (priv) banner.innerHTML = `<span>Only you can see this map. Players see <b>${esc(state.maps.find(m => m.id === state.mapId)?.name)}</b>.</span>
    <button class="redbtn" data-show="${viewId()}">Show now</button>`;
}
function mapsHtml() {
  return state.maps.map(m => {
    const live = m.id === state.mapId, mine = m.id === viewId();
    return `<div class="maprow ${mine ? 'active' : ''}">
      <div class="thumb ${m.img ? '' : 'grass'}" data-thumb="${m.img ? m.id : ''}"></div>
      <div><b>${esc(m.name)}</b>
        <small>${live ? '<span class="dot"></span>Players see this' : mine ? 'Only you see this' : '&nbsp;'}</small>
        <div class="mapbtns">
          <button class="redbtn" data-show="${m.id}" ${live && mine ? 'disabled' : ''}>Show now</button>
          <button class="ghost" data-preview="${m.id}" ${mine ? 'disabled' : ''}>Show only for me</button>
        </div></div></div>`;
  }).join('');
}
$('#mapfile')?.addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { w, h } = await imageSize(file), id = newId();
    await imgPut(id, file); // image first, so other tabs can load it as soon as the map appears
    const tokens = {};
    state.units.filter(u => u.kind === 'pc').forEach((u, i) => tokens[u.id] = { x: 1, y: 1 + i });
    // guess: the image is about 24 squares wide; the DM fixes it in the grid step
    state.maps.push({ id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), img: true, iw: w, ih: h, sq: Math.max(10, w / 24), ox: 0, oy: 0, tokens, marks: [], fog: { base: 'hidden', strokes: [] } });
    state.dmMapId = id; fitting = true; // a new map starts private, so the DM can set it up
    save(); fit();
  } catch { toast("That file isn't an image this browser can open."); }
});
function setSquare(n) {
  const m = cur();
  if (!Number.isFinite(n)) return;
  m.sq = clamp(n, 10, 1000); m.ox %= m.sq; m.oy %= m.sq;
  save();
}
$('.fitbar input')?.addEventListener('change', e => setSquare(parseFloat(e.target.value)));

/* ---------- tool rail (DM and players; the Table view has none) ---------- */
const SHAPES = { circle: 'Sphere / cylinder (radius)', cone: 'Cone', square: 'Cube', line: 'Line (5 ft wide)', emanation: 'Emanation (follows a token)' };
function renderRail() {
  const rail = $('.rail');
  if (!rail) return;
  const b = (t, name, title) => `<button class="iconbtn ${tool === t ? 'on' : ''}" data-act="tool" data-tool="${t}" title="${title}">${icon(name)}</button>`;
  rail.innerHTML = b('select', 'pointer', 'Select and move tokens (hold to ping)') + b('pan', 'hand', 'Move the map')
    + '<div class="sep"></div>'
    + b('point', 'point', 'Point: drag to draw a trail everyone sees, click to ping') + b('ruler', 'ruler', 'Ruler')
    + b('draw', 'draw', 'Draw') + b('shape', shape, 'Spell shapes: ' + SHAPES[shape]) + b('erase', 'erase', VIEW === 'dm' ? 'Erase a drawing or shape' : 'Erase your own drawings and shapes')
    + (VIEW === 'dm' ? b('fog', 'fog', 'Fog of war') : '')
    + '<div class="sep"></div>'
    + `<button class="iconbtn" data-act="colors" title="Colour"><span class="swatch" style="background:${color}"></span></button>`
    + (VIEW === 'dm' ? `<button class="iconbtn" data-act="clear" title="Clear all drawings and shapes on this map">${icon('trash')}</button>` : '')
    + (rail.dataset.fly === 'shape' ? `<div class="fly" data-for="[data-tool=shape]">` + Object.entries(SHAPES).map(([k, t]) =>
      `<button class="iconbtn ${k === shape ? 'on' : ''}" data-shape="${k}" title="${t}">${icon(k)}</button>`).join('') + '</div>' : '')
    + (rail.dataset.fly === 'fog' ? `<div class="fly" data-for="[data-tool=fog]">
      <button class="iconbtn ${fogMode === 'reveal' ? 'on' : ''}" data-fog="reveal" title="Reveal: paint to clear fog">${icon('eye')}</button>
      <button class="iconbtn ${fogMode === 'hide' ? 'on' : ''}" data-fog="hide" title="Hide: paint fog back">${icon('eyeoff')}</button>
      <span class="vsep"></span>${Object.keys(BRUSH).map(k => `<button class="iconbtn ${k === brush ? 'on' : ''}" data-brush="${k}" title="${{ s: 'Small', m: 'Medium', l: 'Large' }[k]} brush"><span class="dotb ${k}"></span></button>`).join('')}
      <span class="vsep"></span><button class="ghost" data-fogall="shown">Reveal all</button><button class="ghost" data-fogall="hidden">Hide all</button></div>` : '')
    + (rail.dataset.fly === 'colors' ? `<div class="fly" data-for="[data-act=colors]">` + COLORS.map(c =>
      `<button class="iconbtn" data-color="${c}" title="${c}"><span class="swatch ${c === color ? 'on' : ''}" style="background:${c}"></span></button>`).join('') + '</div>' : '');
  const fly = rail.querySelector('.fly');
  if (fly) fly.style.top = rail.querySelector(fly.dataset.for).offsetTop + 'px';
  rail.hidden = fitting;
  vp.dataset.tool = fitting ? 'pan' : tool;
  map.classList.toggle('erasing', tool === 'erase');
  if (tool !== 'fog' && brushAt) { brushAt = null; renderFog(); }
}

/* ---------- initiative strip (table and player views, or DM with the panel closed) ---------- */
const showStrip = () => VIEW !== 'dm' || document.body.classList.contains('collapsed');
function renderStrip() {
  const el = $('.strip'), o = order();
  if (!state.combat || !showStrip() || !o.length) { el.innerHTML = ''; return; }
  const i = Math.max(0, o.findIndex(u => u.id === state.active));
  const rot = [...o.slice(i), ...o.slice(0, i)];
  el.innerHTML = `<div class="round">Round<b>${state.round}</b></div>` + rot.map((u, n) =>
    `<div class="pic ${u.kind} ${n === 0 ? 'now' : ''} ${u.hp <= 0 ? 'down' : ''}" style="--c:${u.c}" title="${esc(u.name)}">${initials(u.name)}</div>`).join('');
}

/* ---------- DM panel ---------- */
function rowHtml(u) {
  const act = state.combat && u.id === state.active ? 'active' : '';
  return `<div class="row ${act} ${u.hp <= 0 ? 'down' : ''}" data-id="${u.id}">
    <div class="pic" style="--c:${u.c}">${initials(u.name)}</div>
    <div><b>${esc(u.name)}</b><small>AC:<span>${u.ac}</span></small>
      <small>Initiative:<span class="init" data-edit="init">${u.init ?? '-'}</span></small></div>
    ${pos(u) ? `<button class="hp" data-edit="hp" title="Type -7 for damage, +5 to heal, or a new number"><b>${u.hp}</b> / ${u.max}</button>`
      : `<button class="hp" data-place="${u.id}" title="Put this token in the middle of the screen">Place</button>`}</div>`;
}
function waitHtml(u) {
  const tip = u.kind === 'pc' ? 'Pretend the player rolled initiative on their sheet (demo)' : 'Roll for this monster';
  return `<div class="row" data-id="${u.id}">
    <div class="pic" style="--c:${u.c}">${initials(u.name)}</div>
    <div><b>${esc(u.name)}</b><small>${u.kind === 'pc' ? 'Waiting for their roll' : 'Not rolled'}</small></div>
    <div class="wait"><input type="number" placeholder="Init" data-set="${u.id}"><button class="iconbtn" data-roll="${u.id}" title="${tip}">${icon('d20')}</button></div></div>`;
}
function renderPanel() {
  if (VIEW !== 'dm') return;
  const list = $('.list'), foot = $('.foot');
  $('.top h1').textContent = sidebar === 'maps' ? 'Maps' : 'Initiative Order';
  $('[data-act="maps"]').classList.toggle('on', sidebar === 'maps' && !document.body.classList.contains('collapsed'));
  if (sidebar === 'maps') {
    list.innerHTML = mapsHtml();
    list.querySelectorAll('[data-thumb]:not([data-thumb=""])').forEach(el =>
      imgUrl(el.dataset.thumb).then(u => { if (u) el.style.backgroundImage = `url(${u})`; }));
    foot.innerHTML = `<button class="redbtn start" data-act="upload">Upload a map</button>`;
    return;
  }
  if (!state.combat) {
    const on = state.units.filter(pos), off = state.units.filter(u => !pos(u));
    list.innerHTML = `<h3>On the map</h3>` + (on.map(rowHtml).join('') || '<p class="empty">Nobody yet.</p>')
      + (off.length ? `<h3>Not on this map</h3>` + off.map(rowHtml).join('') : '');
    foot.innerHTML = `<button class="redbtn start" data-act="start">Start combat</button>`;
    return;
  }
  const o = order(), w = waiting();
  list.innerHTML = (o.length ? o.map(rowHtml).join('') : `<p class="empty">Nobody has rolled yet.</p>`) +
    (w.length ? `<h3>Waiting for initiative</h3>` + w.map(waitHtml).join('') : '');
  const turn = Math.max(0, o.findIndex(u => u.id === state.active)) + 1;
  foot.innerHTML = `<button class="iconbtn" data-act="prev" title="Previous turn">${icon('undo')}</button>
    <div class="counter">Round<b>${state.round}</b></div><div class="counter">Turn<b>${o.length ? turn : '-'}</b></div>
    <div class="split"><button class="redbtn" data-act="next">Next</button><button class="redbtn" data-act="menu">${icon('up')}</button></div>`;
}

let wasCombat = state.combat, wasMap = null;
function render() {
  applyMap(); renderTokens(); renderMarks(); renderFog(); renderStrip(); renderPanel(); renderRail(); renderMapBar();
  $('[data-act="start-top"]')?.toggleAttribute('hidden', state.combat);
  // the strip takes room at the top, and a new map needs framing
  if (wasCombat !== state.combat || wasMap !== viewId()) { wasCombat = state.combat; wasMap = viewId(); fit(); }
}

/* ---------- combat ---------- */
function step(dir) {
  const o = order();
  if (!o.length) return;
  let i = o.findIndex(u => u.id === state.active);
  if (i < 0) i = 0; else i += dir;
  if (i >= o.length) { i = 0; state.round++; }
  if (i < 0) { if (state.round === 1) return; i = o.length - 1; state.round--; }
  state.active = o[i].id; save();
}
function setInit(u, n, fromSheet) {
  if (!Number.isFinite(n)) return;
  u.init = n;
  if (!state.active) state.active = order()[0].id;
  if (fromSheet) toast(`${u.name} rolled ${n} for initiative on their sheet.`);
  save();
}

function openStart() {
  const dlg = $('#start'), on = state.units.filter(pos), npcs = on.filter(u => u.kind === 'npc'), pcs = state.units.filter(u => u.kind === 'pc');
  const inputs = list => list.map(u => `<label>${esc(u.name)}</label><input type="number" name="${u.id}" placeholder="${u.kind === 'pc' ? 'sheet' : 'd20' + (u.bonus < 0 ? u.bonus : '+' + u.bonus)}">`).join('');
  dlg.querySelector('.npcs').innerHTML = inputs(npcs);
  dlg.querySelector('.pcs').innerHTML = inputs(pcs);
  const sync = () => dlg.querySelector('.npcs').hidden = dlg.querySelector('[name=mode]:checked').value === 'auto';
  dlg.querySelectorAll('[name=mode]').forEach(r => r.onchange = sync);
  sync(); dlg.showModal();
}
$('#start')?.addEventListener('close', e => {
  const dlg = e.target;
  if (dlg.returnValue !== 'go') return;
  const auto = dlg.querySelector('[name=mode]:checked').value === 'auto';
  for (const u of state.units) {
    const inp = dlg.querySelector(`[name="${u.id}"]`); // monsters on other maps aren't in this fight
    if (!inp) { u.init = null; continue; }
    const typed = parseInt(inp.value, 10);
    u.init = u.kind === 'npc' && auto ? d20() + u.bonus : Number.isFinite(typed) ? typed : null;
  }
  Object.assign(state, { combat: true, round: 1, active: order()[0]?.id ?? null });
  save();
});

function inlineEdit(el, value, commit) {
  const inp = document.createElement('input');
  inp.value = value; el.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = ok => { if (done) return; done = true; ok ? commit(inp.value.trim()) : render(); };
  inp.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
  inp.onblur = () => finish(true);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-edit],[data-roll],[data-shape],[data-color],[data-place],[data-sq],[data-show],[data-preview],[data-fog],[data-brush],[data-fogall],.row');
  const rail = $('.rail');
  if (!t) { $('.menu')?.remove(); return; }
  const act = t.dataset.act;
  if (act !== 'menu') $('.menu')?.remove();
  if (act === 'start' || act === 'start-top') openStart();
  else if (act === 'next') step(1);
  else if (act === 'prev') step(-1);
  else if (act === 'menu') {
    if ($('.menu')) return $('.menu').remove();
    t.parentElement.insertAdjacentHTML('beforeend', `<div class="menu"><button data-act="prev">Previous turn</button><button data-act="reroll">Re-roll monsters</button><button data-act="end">End combat</button></div>`);
  }
  else if (act === 'reroll') { state.units.forEach(u => { if (u.kind === 'npc' && u.init != null) u.init = d20() + u.bonus; }); save(); }
  else if (act === 'end') { state.units.forEach(u => u.init = null); Object.assign(state, { combat: false, round: 1, active: null }); save(); }
  else if (act === 'panel') { document.body.classList.toggle('collapsed'); try { localStorage.setItem(KEY + '-collapsed', document.body.classList.contains('collapsed') ? '1' : ''); } catch {} render(); fit(); }
  else if (act === 'grid') { fitting = true; render(); }
  else if (act === 'maps') {
    const open = sidebar === 'maps' && !document.body.classList.contains('collapsed');
    sidebar = open ? 'init' : 'maps'; document.body.classList.remove('collapsed'); render(); fit();
  }
  else if (act === 'upload') $('#mapfile').click();
  else if (t.dataset.show) { fitting = false; state.mapId = state.dmMapId = t.dataset.show; save(); }
  else if (t.dataset.preview) { fitting = false; state.dmMapId = t.dataset.preview; save(); }
  else if (act === 'grid-done') { fitting = false; render(); }
  else if (t.dataset.sq) setSquare(cur().sq + Number(t.dataset.sq));
  else if (act === 'tool') {
    const next = t.dataset.tool;
    rail.dataset.fly = (next === 'shape' || next === 'fog') && rail.dataset.fly !== next ? next : '';
    tool = next; renderRail();
  }
  else if (act === 'colors') { rail.dataset.fly = rail.dataset.fly === 'colors' ? '' : 'colors'; renderRail(); }
  else if (act === 'clear') { if (cur().marks.length && confirm('Clear every drawing and spell shape from this map?')) { cur().marks = []; save(); } }
  else if (t.dataset.shape) { shape = t.dataset.shape; tool = 'shape'; rail.dataset.fly = ''; renderRail(); }
  else if (t.dataset.fog) { fogMode = t.dataset.fog; renderRail(); }
  else if (t.dataset.brush) { brush = t.dataset.brush; renderRail(); }
  else if (t.dataset.fogall) { cur().fog = { base: t.dataset.fogall, strokes: [] }; save(); }
  else if (t.dataset.color) { color = t.dataset.color; rail.dataset.fly = ''; renderRail(); }
  else if (t.dataset.place) {
    const u = unit(t.dataset.place), r = vp.getBoundingClientRect(), c = toMap({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    cur().tokens[u.id] = { x: clamp(Math.floor(c.x / CELL), 0, G.cols - u.size), y: clamp(Math.floor(c.y / CELL), 0, G.rows - u.size) };
    save();
  }
  else if (t.dataset.roll) { const u = unit(t.dataset.roll); setInit(u, d20() + u.bonus, u.kind === 'pc'); }
  else if (t.dataset.edit) {
    const u = unit(t.closest('.row').dataset.id);
    if (t.dataset.edit === 'init') inlineEdit(t, u.init ?? '', v => { const n = parseInt(v, 10); Number.isFinite(n) ? setInit(u, n) : render(); });
    else inlineEdit(t, '', v => {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) u.hp = clamp(/^[+-]/.test(v) ? u.hp + n : n, 0, u.max);
      save();
    });
  }
  else if (t.classList.contains('row') && !e.target.closest('input')) { selected = t.dataset.id; renderTokens(); }
});
document.addEventListener('keydown', e => {
  const inp = e.target.closest?.('[data-set]');
  if (inp && e.key === 'Enter') setInit(unit(inp.dataset.set), parseInt(inp.value, 10));
});

let toastTimer;
function toast(msg) {
  $('.toast')?.remove(); clearTimeout(toastTimer);
  document.body.insertAdjacentHTML('beforeend', `<div class="toast">${esc(msg)}</div>`);
  toastTimer = setTimeout(() => $('.toast')?.remove(), 3000);
}

try { if (VIEW === 'dm' && localStorage.getItem(KEY + '-collapsed')) document.body.classList.add('collapsed'); } catch {}
render();
