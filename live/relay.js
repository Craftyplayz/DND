// Live relay (ROADMAP 1.2): only passes messages along, PHP saves everything. It runs next to Apache in the site's
// container (docker/start.sh); Apache proxies wss://<site>/live/ws?c=<campaign id> to it.
//   connect     the browser's cookie goes to live/auth.php, which says if this player is in the campaign: {key, role}.
//               Players appear by key (a hash per campaign, never the Google id); everyone in the room gets "presence".
//               ?c=me joins the player's own room (auth.php names it: "room"), where their Monster Sheets hear HP changes.
//   POST /publish {campaign, msg?, to?, members?}   from PHP only (includes/live.php), never through Apache:
//               msg goes to everyone in the room, or to: "dm" / [keys]; members (keys) drops anyone no longer in it.
// If this process is down, pages say "live updates paused" and reload state from PHP every 10 s, so nothing is lost.
'use strict';
const http = require('node:http');
const { WebSocketServer } = require('ws');
const PORT = +process.env.PORT || 8090;
const AUTH = process.env.AUTH_URL || 'http://127.0.0.1/live/auth.php';
const ORIGIN = process.env.ORIGIN || ''; // local checks only: the page's origin when it isn't the relay's host

const rooms = new Map(); // campaign id -> Set of sockets
const room = (c) => rooms.get(c) || new Set();
function send(c, msg, want = () => true) {
    const text = JSON.stringify(msg);
    for (const s of room(c)) if (s.readyState === s.OPEN && want(s)) s.send(text);
}
const presence = (c) => send(c, { type: 'presence', online: [...new Set([...room(c)].map((s) => s.key))] });

const server = http.createServer((req, res) => {
    // Apache adds X-Forwarded-For to everything it proxies, so a request from outside can never publish
    if (req.method === 'POST' && req.url === '/publish' && !req.headers['x-forwarded-for']) {
        let body = '';
        req.on('data', (d) => { body += d; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
            try {
                const { campaign, msg, to, members } = JSON.parse(body);
                if (Array.isArray(members)) for (const s of room(campaign)) if (!members.includes(s.key)) s.close(4403, 'not in the campaign');
                if (msg) send(campaign, msg, (s) => !to || (to === 'dm' ? s.role === 'dm' : Array.isArray(to) && to.includes(s.key)));
                res.end('ok');
            } catch (e) { res.statusCode = 400; res.end('bad message'); }
        });
        return;
    }
    res.statusCode = req.url === '/health' ? 200 : 404;
    res.end(req.url === '/health' ? 'ok' : '');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', async (req, sock, head) => {
    const deny = () => { sock.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); sock.destroy(); };
    // another site can't open a socket with this player's cookie (Apache keeps the browser's Host: ProxyPreserveHost)
    let origin = '';
    try { origin = new URL(req.headers.origin || '').host; } catch (e) { }
    if (!origin || (origin !== req.headers.host && req.headers.origin !== ORIGIN)) return deny();
    let c = new URL(req.url, 'http://relay').searchParams.get('c') || '';
    let who = null;
    try {
        const r = await fetch(AUTH + '?c=' + encodeURIComponent(c), { headers: { cookie: req.headers.cookie || '' }, signal: AbortSignal.timeout(5000) });
        if (r.ok) who = await r.json();
    } catch (e) { }
    if (!who || !who.key) return deny();
    if (who.room) c = String(who.room);
    wss.handleUpgrade(req, sock, head, (ws) => {
        Object.assign(ws, { key: who.key, role: who.role, alive: true });
        if (!rooms.has(c)) rooms.set(c, new Set());
        rooms.get(c).add(ws);
        ws.on('pong', () => { ws.alive = true; });
        ws.on('close', () => {
            room(c).delete(ws);
            if (!room(c).size) rooms.delete(c);
            presence(c);
        });
        presence(c);
    });
});

// drop sockets that stopped answering; the pings also keep proxies from closing idle connections
setInterval(() => {
    for (const r of rooms.values()) for (const s of r) {
        if (!s.alive) { s.terminate(); continue; }
        s.alive = false;
        s.ping();
    }
}, 30000);

server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`live relay on ${PORT}`));
