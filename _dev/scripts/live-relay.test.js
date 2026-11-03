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

// CHECK_PORT_SHIFT moves the ports, so check-all can run this beside the other checks
const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, RELAY = 8095 + SHIFT, AUTH = 8096 + SHIFT, ORIGIN = `http://localhost:${8097 + SHIFT}`;
// the stand-in auth: cookie "who=<key>:<role>" is in campaign "camp1"
const auth = http.createServer((req, res) => {
    const m = /who=(\w+):(dm|player)/.exec(req.headers.cookie || '');
    if (!m || !req.url.endsWith('?c=camp1')) { res.statusCode = 403; return res.end('{}'); }
    res.end(JSON.stringify({ key: m[1], role: m[2] }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// waits until fn() is true (what the next check then looks at), at most ms
const wait = async (fn, ms = 3000) => { for (const t = Date.now(); !(await fn()) && Date.now() - t < ms;) await sleep(20); };
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
    await wait(() => fetch(`http://localhost:${RELAY}/health`).then((r) => r.ok, () => false), 10000);
    try {
        is('stranger refused', await open('who=nobody'), 403);
        is('wrong campaign refused', await open('who=dm1:dm', { c: 'camp2' }), 403);
        is('another site refused', await open('who=dm1:dm', { origin: 'https://evil.example' }), 403);
        const dm = await open('who=dm1:dm'), pl = await open('who=pl1:player'), pl2 = await open('who=pl2:player');
        await wait(async () => last(dm, 'presence')?.online.length === 3);
        is('presence lists everyone', last(dm, 'presence').online.sort(), ['dm1', 'pl1', 'pl2']);

        is('publish ok', await publish({ campaign: 'camp1', msg: { type: 'campaign' } }), 200);
        await wait(async () => [dm, pl, pl2].every((w) => last(w, 'campaign')));
        is('everyone gets it', [dm, pl, pl2].map((w) => !!last(w, 'campaign')), [true, true, true]);
        await publish({ campaign: 'camp1', msg: { type: 'secret' }, to: 'dm' });
        await publish({ campaign: 'camp1', msg: { type: 'whisper' }, to: ['pl2'] });
        await sleep(200); // kept: the players must get nothing, so there is nothing to wait for
        is('to the DM only', [dm, pl, pl2].map((w) => !!last(w, 'secret')), [true, false, false]);
        is('to one player only', [dm, pl, pl2].map((w) => !!last(w, 'whisper')), [false, false, true]);
        is('through Apache refused', await publish({ campaign: 'camp1', msg: { type: 'fake' } }, { 'X-Forwarded-For': '1.2.3.4' }), 404);
        await sleep(200); // kept: nothing must arrive, so there is nothing to wait for
        is('nothing arrived from outside', !!last(dm, 'fake'), false);

        await publish({ campaign: 'camp1', msg: { type: 'campaign' }, members: ['dm1', 'pl1'] });
        is('removed player dropped', await pl2.closed, 4403);
        await wait(async () => last(dm, 'presence')?.online.length === 2);
        is('presence after removal', last(dm, 'presence').online.sort(), ['dm1', 'pl1']);
        // a co-DM promoted or demoted: their socket closes with 4401 (the page reconnects with the new role), nobody else's
        const co = await open('who=co1:dm');
        await publish({ campaign: 'camp1', rekey: ['co1'] });
        is('rekeyed socket closed for a reconnect', await co.closed, 4401);
        await publish({ campaign: 'camp1', msg: { type: 'secret2' }, to: 'dm' });
        await wait(async () => last(dm, 'secret2'));
        is('others stay connected', [!!last(dm, 'secret2'), pl.readyState], [true, WebSocket.OPEN]);
        await wait(async () => last(dm, 'presence')?.online.length === 2);
        pl.close();
        await wait(async () => last(dm, 'presence')?.online.length === 1);
        is('presence after leaving', last(dm, 'presence').online, ['dm1']);
        is('health', await fetch(`http://localhost:${RELAY}/health`).then((r) => r.text()), 'ok');
        dm.close();
    } finally { relay.kill(); auth.close(); }
    console.log(bad ? `${bad} failed` : 'live relay ok');
    process.exit(bad ? 1 : 0);
})();
