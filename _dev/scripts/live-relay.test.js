// Checks live/relay.js on its own, with a stand-in for live/auth.php: who may connect, presence, publish (to all, to the
// DM, to some), dropping removed players, and that a request through Apache (X-Forwarded-For) can't publish.
//   node _dev/scripts/live-relay.test.js        (needs: cd live && npm install)
'use strict';
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
let WebSocket;
try { WebSocket = require(path.join(__dirname, '../../live/node_modules/ws')); }
catch (e) { console.log("FAIL: the relay's packages are missing. Run: cd live && npm install"); process.exit(1); }

const RELAY = 8095, AUTH = 8096, ORIGIN = 'http://localhost:8097';
// the stand-in auth: cookie "who=<key>:<role>" is in campaign "camp1"
const auth = http.createServer((req, res) => {
    const m = /who=(\w+):(dm|player)/.exec(req.headers.cookie || '');
    if (!m || !req.url.endsWith('?c=camp1')) { res.statusCode = 403; return res.end('{}'); }
    res.end(JSON.stringify({ key: m[1], role: m[2] }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

// a socket that keeps everything it receives; resolves with the close code if the relay refuses it
function open(cookie, { c = 'camp1', origin = ORIGIN } = {}) {
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${RELAY}/?c=${c}`, { headers: { cookie, origin } });
        ws.got = [];
        ws.on('message', (d) => ws.got.push(JSON.parse(d)));
        ws.on('open', () => resolve(ws));
        ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
        ws.on('error', () => resolve('error'));
        ws.closed = new Promise((r) => ws.on('close', (code) => r(code)));
    });
}
const publish = (body, headers = {}) => fetch(`http://localhost:${RELAY}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then((r) => r.status);
const last = (ws, type) => ws.got.filter((m) => m.type === type).pop();

(async () => {
    await new Promise((r) => auth.listen(AUTH, '127.0.0.1', r));
    const relay = spawn(process.execPath, [path.join(__dirname, '../../live/relay.js')], {
        env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${AUTH}/live/auth.php`, ORIGIN }, stdio: 'ignore' });
    await sleep(600);
    try {
        is('stranger refused', await open('who=nobody'), 403);
        is('wrong campaign refused', await open('who=dm1:dm', { c: 'camp2' }), 403);
        is('another site refused', await open('who=dm1:dm', { origin: 'https://evil.example' }), 403);
        const dm = await open('who=dm1:dm'), pl = await open('who=pl1:player'), pl2 = await open('who=pl2:player');
        await sleep(200);
        is('presence lists everyone', last(dm, 'presence').online.sort(), ['dm1', 'pl1', 'pl2']);

        is('publish ok', await publish({ campaign: 'camp1', msg: { type: 'campaign' } }), 200);
        await sleep(200);
        is('everyone gets it', [dm, pl, pl2].map((w) => !!last(w, 'campaign')), [true, true, true]);
        await publish({ campaign: 'camp1', msg: { type: 'secret' }, to: 'dm' });
        await publish({ campaign: 'camp1', msg: { type: 'whisper' }, to: ['pl2'] });
        await sleep(200);
        is('to the DM only', [dm, pl, pl2].map((w) => !!last(w, 'secret')), [true, false, false]);
        is('to one player only', [dm, pl, pl2].map((w) => !!last(w, 'whisper')), [false, false, true]);
        is('through Apache refused', await publish({ campaign: 'camp1', msg: { type: 'fake' } }, { 'X-Forwarded-For': '1.2.3.4' }), 404);
        await sleep(200);
        is('nothing arrived from outside', !!last(dm, 'fake'), false);

        await publish({ campaign: 'camp1', msg: { type: 'campaign' }, members: ['dm1', 'pl1'] });
        is('removed player dropped', await pl2.closed, 4403);
        await sleep(200);
        is('presence after removal', last(dm, 'presence').online.sort(), ['dm1', 'pl1']);
        pl.close();
        await sleep(200);
        is('presence after leaving', last(dm, 'presence').online, ['dm1']);
        is('health', await fetch(`http://localhost:${RELAY}/health`).then((r) => r.text()), 'ok');
        dm.close();
    } finally { relay.kill(); auth.close(); }
    console.log(bad ? `${bad} failed` : 'live relay ok');
    process.exit(bad ? 1 : 0);
})();
