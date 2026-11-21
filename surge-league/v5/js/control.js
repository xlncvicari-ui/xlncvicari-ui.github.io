// ZONE CONTROL (first draft, 2026-11-21): the second game mode. Same flying, same contact, a different idea.
//
// The field has five RINGS (A to E). A ring belongs to whichever team has had more riders inside it for long enough: every
// extra rider you have in a ring pushes its bar your way, and the rider carrying the CORE counts as CORE_WEIGHT riders. Each ring
// you hold pays points every second, and holding all five pays double. First team to the target wins, or most points when the
// clock runs out. Nobody scores with the CORE here: it is the thing that lets a small group take a ring from a bigger one, so
// rucks and snatches over it still decide matches. Dashes knock rivals out of a ring, and a knockout in a fight takes a rider
// out of the count for the whole time they sit in the box.
//
// Two of the rings ride moving platforms (level.zones[].on = which mover), so the ground you are holding keeps travelling.
// Everything that shapes it is in these numbers.
const ZONE_RATE = 0.11;                 // how much of a ring's bar one extra rider moves per second (a full swing is -1 to +1)
const ZONE_EDGE = 3;                    // more extra riders than this doesn't capture any faster
const CORE_WEIGHT = 3;                  // the rider carrying the CORE counts as this many
const ZONE_POINTS = 0.5;                // points per second for each ring your team holds
const ZONE_ALL = 2;                     // holding every ring multiplies your points by this
const CONTROL_TARGETS = [100, 200, 350];  // first to this many, for the 3, 6 and 10 minute matches
const CONTROL_TIPS = [
  'Fly into a ring and stay: more riders than they have, and it turns your color.', 'The rider carrying the CORE counts as 3.', 'Every ring you hold pays points each second.',
  'Hold all five rings and your points double.', 'B dashes: knock a rival out of the ring.', 'Knock a rival out in a fight and they sit 15 seconds: one less in the ring.',
  'Two of the rings ride platforms. They keep moving.', 'Look down for the score and the rings.', 'Your home ring is behind you. Don\'t leave it empty.'
];

const CONTROL = {
  // Builds the rings for a level (or removes the old ones): three hoops and a glow each, colored by who holds them.
  buildZones(level) {
    const scene = this.el.object3D;
    for (const z of this.zones || []) scene.remove(z.obj);
    this.zones = (level.zones || []).map(z => {
      const obj = new T.Group(), mat = new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
      const hoops = mergeParts([0, 1, 2].map(i => ({ geo: new T.TorusGeometry(z.r, 0.035, 5, 72), pos: [0, 0, 0], rot: i === 0 ? [90, 0, 0] : i === 1 ? [0, 0, 0] : [0, 90, 0] })));
      const ring = new T.Mesh(hoops, mat); ring.frustumCulled = false; obj.add(ring);
      const glow = glowSprite('#ffffff', z.r * 1.6, 0.35); obj.add(glow);
      const tag = labelSprite(z.id, { color: '#ffffff', bg: 'rgba(8,18,31,0.6)', height: 1.5 }); tag.material.depthTest = false; tag.renderOrder = 940; tag.position.y = z.r + 1.4; obj.add(tag);
      scene.add(obj);
      return { ...z, pos: new T.Vector3(...(z.c || [0, 0, 0])), own: z.home || null, cap: z.home === 'blue' ? 1 : z.home === 'orange' ? -1 : 0, n: { blue: 0, orange: 0 }, obj, mat, glow, tag, ring };
    });
    this.placeZones();
  },
  placeZones() {
    for (const z of this.zones) {
      if (z.on !== undefined) { const m = WORLD.movers[z.on]; if (m) z.pos.copy(m.pos).add(tmp.set(...(z.off || [0, 0, 0]))); }
      z.obj.position.copy(z.pos);
    }
  },
  resetZones() { for (const z of this.zones) { z.own = z.home || null; z.cap = z.home === 'blue' ? 1 : z.home === 'orange' ? -1 : 0; z.n.blue = z.n.orange = 0; } this.myZone = null; },
  controlTarget() { return CONTROL_TARGETS[Math.max(0, MATCHES.indexOf(this.matchCfg))] || CONTROL_TARGETS[1]; },
  zoneAt(p) { for (const z of this.zones) if (p.distanceToSquared(z.pos) < z.r * z.r) return z; return null; },

  updateZones(dt, live) {
    this.placeZones();
    const d = this.ball, playing = live && this.state === 'playing';
    if (playing) {
      for (const z of this.zones) z.n.blue = z.n.orange = 0;
      for (const a of this.agents()) {
        if (!this.free(a)) continue;
        const p = a === 'player' ? this.bodyPos() : tmp.copy(a.pos).setY(a.pos.y + 0.9), z = this.zoneAt(p);
        if (z) z.n[this.teamOf(a)] += d.holder === a ? CORE_WEIGHT : 1;
      }
      const held = { blue: 0, orange: 0 };
      for (const z of this.zones) {
        const diff = Math.max(-ZONE_EDGE, Math.min(ZONE_EDGE, z.n.blue - z.n.orange)), before = z.own;
        z.cap = Math.max(-1, Math.min(1, z.cap + diff * ZONE_RATE * dt));
        if (z.cap >= 1) z.own = 'blue'; else if (z.cap <= -1) z.own = 'orange'; else if ((z.own === 'blue' && z.cap <= 0) || (z.own === 'orange' && z.cap >= 0)) z.own = null;
        if (z.own !== before) this.zoneChanged(z, before);
        if (z.own) held[z.own]++;
      }
      for (const team of ['blue', 'orange']) this.score[team] += held[team] * ZONE_POINTS * (held[team] === this.zones.length ? ZONE_ALL : 1) * dt;
      this.held = held;
      // what you are doing to the ring you are in
      const mine = this.free('player') ? this.zoneAt(this.bodyPos()) : null;
      if (mine !== this.myZone) {
        this.myZone = mine;
        if (mine && mine.own !== 'blue') { this.flash(`TAKING RING ${mine.id}: stay inside`, 1.4, { color: '#66ffff' }); beep(660, 70, 0.07); }
        else if (mine && mine.n.orange > 0) this.flash(`DEFEND RING ${mine.id}`, 1.2, { color: '#ffd166' });
      }
      if (mine && mine.own !== 'blue' && mine.n.blue > mine.n.orange && (this.zoneBuzz = (this.zoneBuzz || 0) - dt) <= 0) { this.zoneBuzz = 0.5; for (const h of this.hands || []) pulse(h, 0.25, 30); }
      if (this.sudden ? Math.floor(this.score.blue) !== Math.floor(this.score.orange) : Math.max(this.score.blue, this.score.orange) >= this.controlTarget()) this.endMatch();
    }
    // how they look: the hoops take the holder's color, the glow shows which way the bar is going
    for (const z of this.zones) {
      const c = z.own ? TEAM_COLOR[z.own] : '#f4f8ff', lead = z.cap > 0.02 ? 'blue' : z.cap < -0.02 ? 'orange' : null, fight = z.n.blue > 0 && z.n.orange > 0;
      if (z.shown !== c) { z.shown = c; z.mat.color.set(c); }
      z.glow.material.color.set(lead ? TEAM_COLOR[lead] : '#ffffff'); z.glow.material.opacity = 0.12 + Math.abs(z.cap) * 0.3 + (fight ? 0.15 * Math.sin(this.time * 12) : 0);
      z.glow.scale.setScalar(z.r * (0.6 + Math.abs(z.cap) * 1.3));
      z.ring.rotation.y += dt * 0.12;
    }
  },
  zoneChanged(z, before) {
    const mineNow = z.own === 'blue', near = z.pos.distanceTo(this.headPos) < 60;
    if (z.own) {
      this.flash(`${TEAM_NAME[z.own]} TOOK RING ${z.id}`, 1.6, { color: TEAM_COLOR[z.own], big: mineNow && this.myZone === z });
      this.bursts.fire(z.pos, TEAM_COLOR[z.own], 1.4); beepAt(mineNow ? 784 : 330, 180, 0.1, 'triangle', z.pos); beepAt(mineNow ? 1175 : 247, 260, 0.09, 'triangle', z.pos, 0.12);
      if (mineNow && this.myZone === z) { this.stats.goals++; for (const h of this.hands || []) pulse(h, 0.8, 160); }
      this.lastEvent = `${TEAM_NAME[z.own]} took ring ${z.id}`;
    } else if (near) { this.flash(before === 'blue' ? `RING ${z.id} LOST: it's up for grabs` : `RING ${z.id} is open`, 1.3, { color: '#ffd166' }); beepAt(440, 120, 0.07, 'square', z.pos); }
  },

  // ---------------------------------------------------------------- bots
  // Each think: one rider goes for a loose CORE, one presses a rival carrying it, everyone else is shared out over the rings by
  // how much each ring needs them (a ring under attack, a ring nearly taken, an open ring nearby), minus how far away it is.
  thinkControl(team, dt) {
    const brain = this.brains[team];
    if ((brain.retick = (brain.retick || 0) - dt) > 0) return;
    brain.retick = this.level.think;
    const d = this.ball, sign = team === 'blue' ? 1 : -1, mine = this.matchBots.filter(b => b.team === team && this.free(b));
    const byDist = p => mine.slice().sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    const holder = d.holder, rival = holder && this.teamOf(holder) !== team ? holder : null;
    const chaser = !holder && !d.passTo ? byDist(d.pos) : null, presser = rival ? byDist(this.posOf(rival)) : null;
    const want = this.zones.map(z => {
      const theirs = z.n[OTHER[team]], owned = z.own === team, lead = z.cap * sign;
      return { z, need: owned ? (theirs > 0 ? theirs + 1 : 1) : Math.min(4, theirs + 2), value: owned ? (theirs > 0 ? 9 : lead < 0.6 ? 6 : 2.5) : z.own ? 6.5 : 7.5, got: 0 };
    });
    // you count too: the bots leave room for the ring you are in
    if (team === 'blue' && this.myZone) { const w = want.find(x => x.z === this.myZone); if (w) w.got++; }
    for (const b of mine) {
      b.markOn = null;
      if (b === chaser) { b.role = 'chase'; b.slot = 0; b.zone = null; b.target.copy(d.pos).addScaledVector(d.vel, 0.3); continue; }
      if (b === presser && b !== holder) { b.role = 'press'; b.zone = null; b.target.copy(this.posOf(rival)); continue; }
      let best = null, bs = -Infinity;
      for (const w of want) {
        const s = w.value - b.pos.distanceTo(w.z.pos) * 0.07 - Math.max(0, w.got - w.need + 1) * 3.5 + (b.zone === w.z ? 1.5 : 0) + (holder === b && w.z.own !== team ? 2.5 : 0);
        if (s > bs) { bs = s; best = w; }
      }
      best.got++; b.role = 'zone'; b.zone = best.z; b.slot = best.got;
      // a rival in the same ring: someone to shove out or fight
      let near = null, nd = 9;
      for (const a of this.agents()) { if (this.teamOf(a) === team || !this.free(a) || a === holder) continue; const dd = this.posOf(a).distanceTo(b.pos); if (dd < nd && this.posOf(a).distanceTo(best.z.pos) < best.z.r + 1) { nd = dd; near = a; } }
      b.markOn = near;
    }
  },
  // Where a bot holding a ring hovers: spread round the middle so they don't stack, drifting toward a rival it is marking.
  zoneSpot(b) {
    const z = b.zone, a = b.idx * 2.4 + (b.team === 'blue' ? 0 : 1.2), k = 0.32 + (b.slot % 3) * 0.14;
    tmp.set(Math.cos(a) * z.r * k, ((b.idx % 3) - 1) * z.r * 0.28, Math.sin(a) * z.r * k).add(z.pos);
    if (b.markOn) tmp.lerp(this.posOf(b.markOn), 0.45);
    return tmp;
  },
  updateControlBots(dt) {
    for (const b of this.matchBots) {
      if (b.role !== 'zone' || !b.zone || !this.free(b)) continue;
      b.target.copy(this.zoneSpot(b));
      // shove: a short dash straight at a rival sharing the ring knocks them out of it
      const m = b.markOn;
      if (m && b.dashCool === 0 && this.free(m)) {
        const mp = this.posOf(m), dd = mp.distanceTo(b.pos);
        if (dd > 2 && dd < 7 && Math.random() < this.level.dash * dt * 1.6) this.botDash(b, tmp2.subVectors(mp, b.pos).normalize().clone());
      }
    }
  },
  // The bot carrying the CORE in this mode just holds it where it counts, and gives it to you when you call for it.
  carrierControl(b, dt) {
    if (b.team === 'blue' && this.callT > 0 && b.grace <= 0 && this.free('player')) {
      const pp = this.bodyPos();
      if (pp.distanceTo(b.pos) < PASS_RANGE && clearLine(this.ball.pos, pp, BALL_R)) { this.callT = 0; this.flash('HERE IT COMES!', 0.9, { color: '#66ffff' }); this.passFrom(b, 'player'); }
    }
  }
};
