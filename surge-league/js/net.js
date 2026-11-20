// Multiplayer framework: talks to the Surge League server (server/league-server.mjs) over WebSocket.
// The game runs fully offline without it; online play turns on when a server address is set.
//
// Message format (JSON, field t = type):
//   client -> server
//     hello   { v, profile: { id, name, rating }, token? }   sign in (token is issued by the server; no passwords)
//     queue   { mode, arena, size }                          look for a match (size 2 = 1v1, 4 = 2v2)
//     unqueue {}
//     pose    { p: [x,y,z], q: [x,y,z,w], l: [x,y,z], r: [x,y,z], v: [x,y,z] }   your rider, ~15 per second
//     world   { disc, bots, score, clock }                   host only: the shared game state, ~15 per second
//     result  { room, score: { blue, orange }, stats }       both sides report; the server rates when they agree
//   server -> client
//     welcome { token, you: { id, name, rating, rank }, online }
//     presence{ online, queued }
//     match   { room, seed, mode, arena, realm, host, players: [{ id, name, rating, team }] }
//     pose    { id, ... }   relayed rider of another player
//     world   { ... }       relayed host state
//     rating  { rating, delta, rank }
//     error   { message }
const NET_VERSION = 1;

class NetClient {
  constructor(handlers) {
    this.h = handlers || {};
    this.ws = null;
    this.url = '';
    this.status = 'offline';
    this.online = 0;
    this.match = null;
    this.remote = new Map();
  }

  connect(url, profile, token) {
    this.close();
    if (!url) { this.status = 'offline'; return; }
    this.url = url; this.profile = profile; this.token = token;
    this.status = 'connecting';
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.status = 'bad address'; return; }
    this.ws = ws;
    ws.onopen = () => { this.status = 'online'; this.send('hello', { v: NET_VERSION, profile: { id: profile.id, name: profile.name, rating: profile.rating }, token }); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.status = 'reconnecting';
      this.match = null;
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(this.url, this.profile, this.token), 5000);
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'welcome') { this.token = m.token; this.online = m.online; }
      if (m.t === 'presence') { this.online = m.online; this.queued = m.queued; }
      if (m.t === 'match') { this.match = m; this.remote.clear(); this.status = 'in match'; }
      if (m.t === 'pose') this.remote.set(m.id, { ...m, at: performance.now() });
      if (m.t === 'left') this.remote.delete(m.id);
      const fn = this.h[m.t];
      if (fn) fn(m);
    };
  }

  close() {
    clearTimeout(this.retry);
    if (this.ws) { const ws = this.ws; this.ws = null; try { ws.close(); } catch (e) {} }
    this.status = 'offline';
  }

  send(t, data) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t, ...data }));
  }

  queue(mode, arena, size) { this.send('queue', { mode, arena, size }); this.status = 'searching'; }
  unqueue() { this.send('unqueue', {}); this.status = 'online'; }

  // Sends your rider at most ~15 times a second.
  sendPose(head, quat, left, right, vel) {
    const now = performance.now();
    if (!this.match || now - (this.lastPose || 0) < 66) return;
    this.lastPose = now;
    const r = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    this.send('pose', { p: r(head), q: [quat.x, quat.y, quat.z, quat.w].map(n => +n.toFixed(4)), l: left ? r(left) : null, r: right ? r(right) : null, v: r(vel) });
  }

  label() {
    if (this.status === 'offline') return 'OFF (add a league server on the 2D page)';
    if (this.status === 'online') return `${this.online} PLAYER${this.online === 1 ? '' : 'S'} CONNECTED`;
    if (this.status === 'searching') return `SEARCHING... ${this.queued || 1} in queue`;
    if (this.status === 'in match') return 'MATCH FOUND';
    return this.status.toUpperCase();
  }
}
