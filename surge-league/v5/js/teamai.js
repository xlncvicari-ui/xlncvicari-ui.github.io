// Team play for the bots (version 5). Works on any level: all it needs is the level's LANES (ways to attack) and the route
// graph that js/world.js builds. Mixed into the game component.
// - With the CORE, a team picks a MAIN lane and a DECOY lane each possession. Supporters run the main lane ahead of the carrier,
//   decoys fly the other lane to drag defenders over, anchors stay home. When three defenders crowd the carrier and a decoy is
//   open, the carrier throws it across and the team swaps lanes (the SWITCH).
// - Bots pass to YOU when you are open and further forward, and straight away when you CALL for it (X).
// - Without it: two press the carrier (they dash in from the side and start rucks), one keeps the lobby holes, one sweeps
//   the deep goal, the rest mark runners goal-side.
// - They reach like you do: a loose core within arm's reach snaps to their hand, and the nearest chaser pulls it in from range.
const TEAMAI = {
  buildBots() {
    this.bots = [];
    for (const team of ['blue', 'orange']) {
      const n = team === 'blue' ? TEAM_SIZE - 1 : TEAM_SIZE, col = TEAM_COLOR[team];
      for (let i = 0; i < n; i++) {
        const el = this.add('a-entity', {}), mount = new T.Group(); el.object3D.add(mount);
        const rider = buildRider(col, i % 3); rider.group.position.y = 0.3; mount.add(rider.group); rider.mount = mount;
        const board = buildRide('gym', col); board.position.y = 0.08; mount.add(board);
        const num = team === 'blue' ? i + 2 : i + 1;
        const tag = labelSprite(String(num), { color: '#ffffff', bg: hexA(col, 0.6), height: 0.42 }); tag.position.y = 2.0; el.object3D.add(tag);
        const xray = glowSprite(col, 2.2, 0.9); xray.material.depthTest = false; xray.renderOrder = 950; xray.position.y = 0.9; xray.visible = false; el.object3D.add(xray);
        const ring = new T.Mesh(new T.TorusGeometry(0.75, 0.05, 6, 32), new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; ring.visible = false; el.object3D.add(ring);
        // the arm they reach with: a thin beam from shoulder to the core while they grab or pull it
        const reach = this.makeBeam(new T.Color(col).getHex(), 0.55, 0.03);
        this.bots.push({ team, num, label: `${TEAM_NAME[team]} ${num}`, el, obj: el.object3D, rider, arm: rider.arm, suitMat: rider.suitMat, tag, xray, carryRing: ring, reach, col,
                         pos: new T.Vector3(), vel: new T.Vector3(), facing: new T.Vector3(0, 0, -HOME_SIGN[team]), role: 'shape', target: new T.Vector3(),
                         path: [], stun: 0, cool: 0, grace: 0, idx: i, dashCool: 1 + Math.random() * 2, dashT: 0, pullT: 0, bin: 0 });
      }
    }
  },

  // A point given for blue's end, turned to this team's end.
  forTeam(team, p) { return new T.Vector3(...(team === 'blue' ? p : toOrange(WORLD.level, p))); },
  // Blue's lanes are written attacking -z; orange flies the mirror image.
  laneVia(team, lane) { return new T.Vector3(...(team === 'blue' ? lane.via : toOrange(WORLD.level, lane.via))); },
  goalsOf(team, kind) { return WORLD.goals.filter(g => g.team === team && (!kind || g.kind === kind)); },
  shotSpot(team, kind) {
    const gs = this.goalsOf(OTHER[team], kind), g = gs[Math.floor(gs.length / 2)] || this.goalsOf(OTHER[team])[0];
    return g.c.clone().addScaledVector(g.n, kind === 'deep' ? 4.5 : 7);
  },
  lineUp() {
    const sp = WORLD.level.spawn, cols = 4;
    for (const team of ['blue', 'orange']) {
      const list = this.matchBots.filter(b => b.team === team), c = this.forTeam(team, sp.c), s = HOME_SIGN[team];
      list.forEach((b, i) => {
        const k = i + (team === 'blue' ? 1 : 0), cx = (k % cols) - (cols - 1) / 2, row = Math.floor(k / cols);
        b.pos.set(c.x + cx * sp.w / cols, c.y + (row ? 1 : -1) * sp.h * 0.22 - 0.9, c.z + s * (row * 2.5 - 1));
        b.vel.set(0, 0, 0); b.facing.set(0, 0, -s); b.stun = 0; b.cool = 0; b.grace = 0; b.path = []; b.dashT = 0; b.duel = null; b.ruck = null; b.bin = 0; b.obj.visible = true;
      });
    }
    this.brains = { blue: this.newBrain('blue'), orange: this.newBrain('orange') };
  },
  newBrain(team) { return { team, main: 0, decoy: 1, planT: 0, switchCool: 4, had: false, route: null }; },
  planRoute(team, laneIdx, from) {
    const lane = WORLD.level.lanes[laneIdx], via = this.laneVia(team, lane), spot = this.shotSpot(team, lane.goal);
    const a = pathPoints(from, via), b = pathPoints(via, spot);
    return { pts: [...a, ...b.slice(1), spot], spot, kind: lane.goal };
  },
  bestShot(team, p, maxRange = 30) {
    let best = null;
    for (const g of WORLD.goals) {
      if (g.team === team) continue;
      const look = g.c.clone().addScaledVector(g.n, 1.0), aim = g.c.clone().addScaledVector(g.n, 0.2), d = aim.distanceTo(p);
      if (d > (g.kind === 'deep' ? 26 : maxRange)) continue;
      const facing = tmp.subVectors(p, g.c).normalize().dot(g.n);
      if (facing < 0.5) continue;
      if (!clearLine(p, look, BALL_R)) continue;
      const q = g.points * 10 - d * 0.35 + facing * 4;
      if (!best || q > best.q) best = { g, aim, d, q };
    }
    return best;
  },
  pressureAt(team, p, r) { let n = 0; for (const a of this.agents()) if (this.teamOf(a) !== team && this.posOf(a).distanceTo(p) < r) n++; return n; },
  passOpen(team, a, b) {
    if (!clearLine(a, b, BALL_R + 0.1)) return false;
    for (const e of this.agents()) {
      if (this.teamOf(e) === team) continue;
      const ep = this.posOf(e);
      if (ep.distanceTo(b) < 3.5) return false;
      const ab = tmp2.subVectors(b, a), t = Math.max(0, Math.min(1, tmp3.subVectors(ep, a).dot(ab) / ab.lengthSq()));
      if (tmp3.copy(a).addScaledVector(ab, t).distanceTo(ep) < 1.8) return false;
    }
    return true;
  },
  // Bigger = closer to scoring for this team (straight-line to where the team is trying to shoot from).
  progressOf(team, p) { const br = this.brains[team], spot = br.route ? br.route.spot : this.shotSpot(team, 'hole'); return -p.distanceTo(spot); },
  free(a) { return a === 'player' ? !(this.playerBin > 0 || this.inDuel('player') || this.inRuck('player')) : !(a.bin > 0 || a.duel || a.ruck || a.stun > 0); },

  // ---------------------------------------------------------------- per-frame
  updateBots(dt, live) {
    const d = this.ball, holderTeam = d.holder ? this.teamOf(d.holder) : d.passTo ? this.teamOf(d.passTo) : null;
    if (live) for (const team of ['blue', 'orange']) this.thinkTeam(team, holderTeam, dt);
    for (const b of this.matchBots) {
      b.stun = Math.max(0, b.stun - dt); b.cool = Math.max(0, b.cool - dt); b.grace = Math.max(0, b.grace - dt); b.dashCool = Math.max(0, b.dashCool - dt); b.dashT = Math.max(0, b.dashT - dt);
      b.reachT = Math.max(0, (b.reachT || 0) - dt);
      if (b.bin > 0 || b.duel || b.ruck) { b.vel.set(0, 0, 0); continue; }
      if (!live) { b.vel.multiplyScalar(Math.exp(-3 * dt)); b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.3); continue; }
      if (b.stun > 0) { b.vel.multiplyScalar(Math.exp(-2 * dt)); b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.4); continue; }
      if (d.holder === b) this.carrierThink(b, dt); else this.catchCheck(b, dt);
      this.steerBot(b, dt);
    }
  },

  thinkTeam(team, holderTeam, dt) {
    const brain = this.brains[team], mine = this.matchBots.filter(b => b.team === team && this.free(b));
    brain.planT += dt; brain.switchCool = Math.max(0, brain.switchCool - dt);
    if ((brain.retick = (brain.retick || 0) - dt) > 0) return;
    brain.retick = this.level.think;
    const d = this.ball, lanes = WORLD.level.lanes;
    if (holderTeam !== team) { brain.planT = 0; brain.had = false; }
    if (holderTeam === team) {
      const carrier = d.holder || d.passTo, cp = this.posOf(carrier);
      if (!brain.had) {
        // a new possession: pick the attack and a decoy
        brain.had = true;
        brain.main = Math.floor(Math.random() * lanes.length);
        brain.decoy = (brain.main + 1 + Math.floor(Math.random() * (lanes.length - 1))) % lanes.length;
        brain.route = this.planRoute(team, brain.main, cp); brain.decoyRoute = this.planRoute(team, brain.decoy, cp);
      }
      const freeBots = mine.filter(b => b !== carrier).sort((a, b) => a.pos.distanceTo(cp) - b.pos.distanceTo(cp));
      freeBots.forEach((b, i) => { b.role = i < 3 ? 'support' : i < 5 ? 'decoy' : 'anchor'; b.slot = i; });
    } else if (holderTeam) {
      const carrier = d.holder || d.passTo, cp = this.posOf(carrier);
      const byDist = mine.slice().sort((a, b) => a.pos.distanceTo(cp) - b.pos.distanceTo(cp));
      byDist.slice(0, 2).forEach(b => { b.role = 'press'; });
      const rest = byDist.slice(2), keepSpot = this.keeperSpot(team), sweepSpot = this.sweeperSpot(team);
      const keeper = rest.slice().sort((a, b) => a.pos.distanceTo(keepSpot) - b.pos.distanceTo(keepSpot))[0];
      if (keeper) keeper.role = 'keeper';
      const others = rest.filter(b => b !== keeper), sweeper = others.slice().sort((a, b) => a.pos.distanceTo(sweepSpot) - b.pos.distanceTo(sweepSpot))[0];
      if (sweeper) sweeper.role = 'sweeper';
      const attackers = this.agents().filter(a => this.teamOf(a) !== team && a !== carrier && this.free(a)), taken = new Set();
      for (const m of others.filter(b => b !== sweeper)) {
        let best = null, bd = Infinity;
        for (const a of attackers) { if (taken.has(a)) continue; const dd = this.posOf(a).distanceTo(m.pos); if (dd < bd) { bd = dd; best = a; } }
        m.role = 'mark'; m.markOn = best; if (best) taken.add(best);
      }
      brain.route = null;
    } else {
      const byDist = mine.slice().sort((a, b) => a.pos.distanceTo(d.pos) - b.pos.distanceTo(d.pos));
      byDist.forEach((b, i) => { b.role = i < 2 ? 'chase' : 'shape'; b.slot = i; });
      brain.route = null;
    }
    for (const b of mine) if (b !== d.holder) b.target.copy(this.roleTarget(b, brain));
  },
  keeperSpot(team) { const gs = this.goalsOf(team, 'hole'), g = gs[Math.floor(gs.length / 2)] || this.goalsOf(team)[0]; return g.c.clone().addScaledVector(g.n, 4.5); },
  sweeperSpot(team) { const g = this.goalsOf(team, 'deep')[0] || this.goalsOf(team)[0]; return g.c.clone().addScaledVector(g.n, 4); },
  routePoint(route, from, ahead) {
    if (!route || !route.pts.length) return null;
    let best = 0, bd = Infinity;
    route.pts.forEach((p, i) => { const dd = p.distanceToSquared(from); if (dd < bd) { bd = dd; best = i; } });
    return route.pts[Math.max(0, Math.min(route.pts.length - 3, best + ahead))] || route.pts[route.pts.length - 1];
  },
  roleTarget(b, brain) {
    const d = this.ball, s = HOME_SIGN[b.team], k = (b.idx % 4) - 1.5, up = (b.idx % 2 ? 1 : -1);
    const jitter = new T.Vector3(k * 1.6, up * 1.6, 0);
    switch (b.role) {
      case 'support': { const carrier = d.holder || d.passTo, cp = carrier ? this.posOf(carrier) : d.pos; const p = this.routePoint(brain.route, cp, 2 + (b.slot || 0)); return (p ? p.clone() : cp.clone()).add(jitter); }
      case 'decoy': { const p = this.routePoint(brain.decoyRoute, b.pos, 3); return (p ? p.clone() : b.pos.clone()).add(jitter); }
      case 'anchor': return this.forTeam(b.team, WORLD.level.spawn.c).add(new T.Vector3(k * 3, up * 2, -s * 8));
      case 'press': { const carrier = d.holder || d.passTo; return carrier ? this.posOf(carrier).clone() : d.pos.clone(); }
      case 'keeper': { const spot = this.keeperSpot(b.team), toBall = d.pos.clone().sub(spot); toBall.z = 0; return spot.add(toBall.clampLength(0, 6).multiplyScalar(0.7)); }
      case 'sweeper': return this.sweeperSpot(b.team);
      case 'mark': {
        if (!b.markOn) return this.forTeam(b.team, WORLD.level.spawn.c).add(jitter);
        const ap = this.posOf(b.markOn), own = this.keeperSpot(b.team);
        return ap.clone().addScaledVector(tmp.subVectors(own, ap).normalize(), 3);
      }
      case 'chase': return d.pos.clone().addScaledVector(d.vel, 0.3);
      default: { const home = this.forTeam(b.team, WORLD.level.spawn.c); return d.pos.clone().lerp(home, 0.25 + (b.slot || 0) * 0.05).add(new T.Vector3(k * 4, up * 2.5, 0)); }
    }
  },

  carrierThink(b, dt) {
    const brain = this.brains[b.team];
    // You called for it: give it to you the moment the pass is on.
    if (b.team === 'blue' && this.callT > 0 && b.grace <= 0 && this.free('player')) {
      const pp = this.bodyPos();
      if (pp.distanceTo(b.pos) < PASS_RANGE && clearLine(this.ball.pos, pp, BALL_R)) { this.callT = 0; this.flash('HERE IT COMES!', 0.9, { color: '#66ffff' }); return this.passFrom(b, 'player'); }
    }
    if ((b.decideT = (b.decideT || 0) - dt) > 0) return;
    b.decideT = this.level.think * 0.8;
    if (b.grace > 0 || b.cool > 0) return;
    const pressured = this.pressureAt(b.team, b.pos, 5) > 0, crowd = this.pressureAt(b.team, b.pos, 15);
    const shot = this.bestShot(b.team, b.pos.clone().add(new T.Vector3(0, 1, 0)), pressured ? 26 : 22);
    if (shot && (shot.g.kind === 'deep' || shot.d < 20 || (pressured && shot.d < 26))) return this.botShoot(b, shot);
    if (!shot) { const far = this.bestShot(b.team, b.pos, 36); if (far && far.d > LONG_SHOT && Math.random() < 0.12) return this.botShoot(b, far); }
    const mates = this.agents().filter(a => a !== b && this.teamOf(a) === b.team && this.free(a));
    let best = null; const myProg = this.progressOf(b.team, b.pos);
    for (const m of mates) {
      const mp = this.posOf(m), dist = mp.distanceTo(b.pos);
      if (dist > PASS_RANGE || dist < 4 || !this.passOpen(b.team, this.ball.pos, mp)) continue;
      let score = this.progressOf(b.team, mp) - myProg - dist * 0.08;
      if (m === 'player') score += 8;
      if (m.role === 'decoy' && crowd >= 3) score += 14;
      if (!best || score > best.score) best = { m, score };
    }
    if (best && (best.score > 6 || (pressured && best.score > -6))) {
      if (best.m.role === 'decoy' && crowd >= 3 && brain.switchCool === 0) {
        [brain.main, brain.decoy] = [brain.decoy, brain.main]; [brain.route, brain.decoyRoute] = [brain.decoyRoute, brain.route]; brain.switchCool = 6;
        if (b.team === 'blue') this.flash('SWITCH! Your team swings the attack the other way.', 1.6);
      }
      return this.passFrom(b, best.m);
    }
    // A rival closing in from the front: sidestep with a dash.
    if (pressured && b.dashCool === 0 && Math.random() < this.level.dash) {
      const threat = this.agents().filter(a => this.teamOf(a) !== b.team).sort((p, q) => this.posOf(p).distanceTo(b.pos) - this.posOf(q).distanceTo(b.pos))[0];
      const away = b.pos.clone().sub(this.posOf(threat)), side = new T.Vector3().crossVectors(away, UP).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      this.botDash(b, side.add(b.facing).normalize());
    }
  },
  botShoot(b, shot) {
    const err = this.level.aim * (0.4 + shot.d / 25) * (this.state === 'penalty' ? 0.6 : 1);
    const dir = shot.aim.clone().sub(this.ball.pos).normalize().add(new T.Vector3((Math.random() - 0.5) * err, (Math.random() - 0.5) * err, (Math.random() - 0.5) * err)).normalize();
    this.release(b, dir.multiplyScalar(BOT_THROW + Math.min(8, shot.d * 0.25)));
    b.cool = 0.8;
  },
  botDash(b, dir) {
    if (b.dashCool > 0 || !freeAt(b.pos.clone().addScaledVector(dir, 3), 0.8)) return;
    b.vel.copy(dir).multiplyScalar(DASH_SPEED * 0.9); b.dashT = DASH_TIME; b.dashCool = 2.5 + Math.random() * 2;
    beepAt(220, 120, 0.05, 'sawtooth', b.pos);
  },
  // Loose core: snap it up within arm's reach; the nearest chaser also pulls it in from your pull range.
  catchCheck(b, dt) {
    const d = this.ball;
    if (d.holder || d.noCatch > 0 || b.cool > 0) return;
    const hand = b.pos.clone().add(new T.Vector3(0, 1.1, 0)), dist = hand.distanceTo(d.pos);
    if (d.passTo === b && dist < BOT_REACH + 0.6) { b.reachT = 0.25; return this.takeBall(b); }
    if (d.passTo && this.teamOf(d.passTo) === b.team) return;
    if (!d.passTo && d.lastThrower && this.teamOf(d.lastThrower) === b.team && this.time - d.throwT < 1.5) return;   // never block your own team's shot
    if (dist < BOT_REACH) {
      if (d.vel.length() > 14 && Math.random() > 0.12) return;  // a hard shot is hard to catch
      b.reachT = 0.25; return this.takeBall(b);
    }
    if (b.role === 'chase' && b.slot === 0 && !d.passTo && dist < (this.easy ? EASY_PULL_RANGE : SNAP_R + ARM_MAX) && clearLine(hand, d.pos, BALL_R)) {
      b.pullT += dt;
      if (b.pullT > (BOT_PULL_DELAY[this.level.name] || 0.5)) { d.vel.lerp(tmp.subVectors(hand, d.pos).setLength(PULL_SPEED), 1 - Math.exp(-8 * dt)); b.reachT = 0.1; }
    } else b.pullT = 0;
  },

  steerBot(b, dt) {
    const d = this.ball, isCarrier = d.holder === b, brain = this.brains[b.team];
    let goal = b.target;
    if (isCarrier) {
      if (!brain.route) brain.route = this.planRoute(b.team, brain.main, b.pos);
      goal = this.routePoint(brain.route, b.pos, 1) || brain.route.spot;
      if (b.pos.distanceTo(brain.route.spot) < 6 || clearLine(b.pos, brain.route.spot, BOT_R)) goal = brain.route.spot;
    }
    let aim = goal;
    if (!clearLine(b.pos, goal, BOT_R)) {
      if (!b.path.length || (b.pathT = (b.pathT || 0) - dt) <= 0 || b.pathGoal.distanceToSquared(goal) > 36) { b.path = pathPoints(b.pos, goal); b.pathGoal = goal.clone(); b.pathT = 0.7; }
      while (b.path.length > 1 && (b.path[0].distanceTo(b.pos) < 2.2 || clearLine(b.pos, b.path[1], BOT_R))) b.path.shift();
      if (b.path.length) aim = b.path[0];
    } else b.path = [];
    const to = tmp.subVectors(aim, b.pos), dist = to.length();
    const speed = BOT_SPEED * this.level.speed * this.teamSpeed(b.team) * (b.role === 'keeper' || b.role === 'sweeper' || b.role === 'anchor' ? 0.8 : 1) * (isCarrier ? 1.04 : b.role === 'press' ? 0.97 : 1);
    const want = dist > 0.05 ? to.multiplyScalar(Math.min(speed, dist * 1.8) / dist) : to.set(0, 0, 0);
    const hunting = b.role === 'press' || b.role === 'chase';
    for (const o of this.agents()) {
      if (o === b) continue;
      const rival = this.teamOf(o) !== b.team;
      if (rival && (hunting || o === d.holder)) continue;
      const sep = tmp2.subVectors(b.pos, this.posOf(o)), sd = sep.length(), room = rival ? 3.5 : 3;
      if (sd < room && sd > 1e-3) want.addScaledVector(sep, (room - sd) / sd * (rival ? 2.5 : 1.5));
    }
    // pressers cut the carrier off: when close and off to one side, dash at where the carrier is going
    if (b.role === 'press' && d.holder && d.holder !== b && b.dashCool === 0) {
      const cp = this.posOf(d.holder), cd = cp.distanceTo(b.pos);
      if (cd > 2.5 && cd < 8 && Math.random() < this.level.dash * dt * 4) this.botDash(b, cp.clone().addScaledVector(this.velOf(d.holder), 0.25).sub(b.pos).normalize());
    }
    if (b.dashT <= 0) { tmp3.subVectors(want, b.vel); const maxDv = BOT_ACCEL * dt; if (tmp3.length() > maxDv) tmp3.setLength(maxDv); b.vel.add(tmp3); }
    b.pos.addScaledVector(b.vel, dt);
    constrainSphere(b.pos, b.vel, BOT_R, 0.3);
    if (b.vel.lengthSq() > 1) { tmp.copy(b.vel); tmp.y *= 0.3; if (tmp.lengthSq() > 0.5) b.facing.lerp(tmp.normalize(), 1 - Math.exp(-6 * dt)).normalize(); }
    else if (!isCarrier) { tmp.subVectors(d.pos, b.pos); tmp.y = 0; if (tmp.lengthSq() > 1) b.facing.lerp(tmp.normalize(), 1 - Math.exp(-3 * dt)).normalize(); }
  },

  // Bots snatch the core out of a rival's hands when they get within reach (your grips make it harder).
  botSteals(dt) {
    const d = this.ball, holder = d.holder;
    if (!holder || this.ruck || this.inDuel(holder)) return;
    const hp = d.pos, team = this.teamOf(holder);
    if ((holder === 'player' ? this.playerGrace : holder.grace) > 0) return;
    const hold = holder === 'player' ? HOLD_GRIP[Math.min(2, this.gripsHeld || 0)] : 1 / (0.8 + this.level.grip * 0.4);
    for (const b of this.matchBots) {
      if (b.team === team || !this.free(b) || b.cool > 0) continue;
      if (b.pos.clone().add(new T.Vector3(0, 1.1, 0)).distanceTo(hp) > BOT_SNATCH_R) continue;
      if (Math.random() < dt * 0.4 * this.level.grip * hold) {
        if (holder === 'player') this.flash(`${b.label} SNATCHED IT! (squeeze your grips to hold on)`, 1.6, { color: '#ff7a2f' }); else holder.stun = 0.4;
        b.reachT = 0.3; this.takeBall(b, true); return;
      }
    }
  }
};
