// Team play for the bots (version 4). Mixed into the game component, like a rugby side:
// - With the CORE, the team picks a MAIN route (straight up the lobby at the 1-point holes, or round the left or right loop to the
//   3-point deep goal) and a DECOY route. Supporters run the main route ahead of the carrier so there is always a pass on;
//   decoys fly the other route to drag defenders over; two anchors stay home in case the play breaks down.
// - The SWITCH: when three or more defenders crowd the carrier and a decoy is open, the carrier throws it across to the decoy and
//   the whole team swaps routes. That is "sway them one way, attack the other".
// - Bots pass to YOU whenever you are open and further forward than them.
// - Without the CORE: two press the carrier (and CLASH with them), one guards the lobby holes, one guards the deep goal,
//   the rest each mark the nearest runner, standing on the goal side of them.
// - Loose CORE: the two nearest from each team go for it; everyone else keeps a shape around it.
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
        // Seen through walls while you hover in the SIGHT RING.
        const xray = glowSprite(col, 2.2, 0.9); xray.material.depthTest = false; xray.renderOrder = 950; xray.position.y = 0.9; xray.visible = false; el.object3D.add(xray);
        const ring = new T.Mesh(new T.TorusGeometry(0.75, 0.05, 6, 32), new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; ring.visible = false; el.object3D.add(ring);
        this.bots.push({ team, num, label: `${TEAM_NAME[team]} ${num}`, el, obj: el.object3D, rider, arm: rider.arm, suitMat: rider.suitMat, tag, xray, carryRing: ring, col,
                         pos: new T.Vector3(), vel: new T.Vector3(), facing: new T.Vector3(0, 0, -HOME_SIGN[team]), role: 'shape', target: new T.Vector3(),
                         path: [], pathKey: '', stun: 0, cool: 0, grace: 0, thinkT: Math.random() * 0.3, idx: i, hitT: 0, stealT: 0 });
      }
    }
  },

  // Lines both teams up at their own end of the lobby for a kickoff. The core starts in the middle.
  lineUp() {
    const slots = [[-9, 5], [9, 5], [-4, 9], [4, 9], [-9, 13], [9, 13], [0, 4.5], [0, 14]];
    for (const team of ['blue', 'orange']) {
      const s = HOME_SIGN[team], list = this.bots.filter(b => b.team === team);
      list.forEach((b, i) => {
        const [x, y] = slots[(i + (team === 'blue' ? 1 : 0)) % slots.length];
        b.pos.set(x, y, s * (26 + (i % 2) * 6)); b.vel.set(0, 0, 0); b.facing.set(0, 0, -s); b.stun = 0; b.cool = 0; b.grace = 0; b.path = []; b.pathKey = '';
      });
    }
    this.brains = { blue: this.newBrain('blue'), orange: this.newBrain('orange') };
  },
  newBrain(team) {
    const r = Math.random(), main = r < 0.4 ? 'lobby' : r < 0.7 ? 'left' : 'right';
    const decoy = main === 'lobby' ? (Math.random() < 0.5 ? 'left' : 'right') : main === 'left' ? 'right' : (Math.random() < 0.5 ? 'left' : 'lobby');
    return { team, main, decoy, planT: 0, switchCool: 4 };
  },

  // Route as node ids for a plan ('lobby' / 'left' / 'right') from p.
  planRoute(team, plan, p) {
    const t = attackTargets(team), from = nearestNode(p);
    if (plan === 'lobby') return routeBetween(from, t.lobby);
    const via = plan === 'left' ? t.leftVia : t.rightVia;
    return [...routeBetween(from, via), ...routeBetween(via, t.left).slice(1)];
  },
  // Where team's goals are and how good a shot from p is (0 = no shot). Picks the best goal with a clear line.
  bestShot(team, p, maxRange = 30) {
    let best = null;
    for (const g of STATION.goals) {
      if (g.team === team) continue;
      const look = g.c.clone().addScaledVector(g.n, 1.0), aim = g.c.clone().addScaledVector(g.n, 0.2), d = aim.distanceTo(p); // aim at the goal line itself
      if (d > (g.kind === 'deep' ? 26 : maxRange)) continue;
      const facing = tmp.subVectors(p, g.c).normalize().dot(g.n);
      if (facing < 0.5) continue;
      if (!clearLine(p, look, BALL_R)) continue;
      const q = g.points * 10 - d * 0.35 + facing * 4;
      if (!best || q > best.q) best = { g, aim, d, q };
    }
    return best;
  },
  // Enemies near a point.
  pressureAt(team, p, r) { let n = 0; for (const a of this.agents()) if (this.teamOf(a) !== team && this.posOf(a).distanceTo(p) < r) n++; return n; },
  // Is a pass from a to b likely to arrive (no rival close to the line or the receiver, and no wall)?
  passOpen(team, a, b) {
    if (!clearLine(a, b, BALL_R + 0.15)) return false;
    for (const e of this.agents()) {
      if (this.teamOf(e) === team) continue;
      const ep = this.posOf(e);
      if (ep.distanceTo(b) < 3.5) return false;
      const ab = tmp2.subVectors(b, a), t = Math.max(0, Math.min(1, tmp3.subVectors(ep, a).dot(ab) / ab.lengthSq()));
      if (tmp3.copy(a).addScaledVector(ab, t).distanceTo(ep) < 1.8) return false;
    }
    return true;
  },
  // How far along the attack a point is (bigger = closer to scoring), for picking forward passes.
  progressOf(team, p) {
    const s = -HOME_SIGN[team]; // the direction of attack along z
    const deep = Math.abs(p.x) > ST.LW + 1 || Math.abs(p.z) > ST.LZ;  // out on a flank route
    return p.z * s + (deep && p.z * s > 0 ? 25 : 0);
  },

  // ---------------------------------------------------------------- per-frame
  updateBots(dt, live) {
    const d = this.ball, holderTeam = d.holder ? this.teamOf(d.holder) : d.passTo ? this.teamOf(d.passTo) : null;
    for (const team of ['blue', 'orange']) if (live) this.thinkTeam(team, holderTeam, dt);
    for (const b of this.matchBots) {
      b.stun = Math.max(0, b.stun - dt); b.cool = Math.max(0, b.cool - dt); b.grace = Math.max(0, b.grace - dt); b.hitT = Math.max(0, b.hitT - dt * 3);
      if (b.clash) { b.vel.set(0, 0, 0); continue; }
      if (!live) { b.vel.multiplyScalar(Math.exp(-3 * dt)); b.pos.addScaledVector(b.vel, dt); continue; }
      if (b.stun > 0) { b.vel.multiplyScalar(Math.exp(-2 * dt)); b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.4); continue; }
      if (d.holder === b) this.carrierThink(b, dt);
      else this.catchCheck(b);
      this.steerBot(b, dt);
    }
  },

  thinkTeam(team, holderTeam, dt) {
    const brain = this.brains[team], mine = this.matchBots.filter(b => b.team === team);
    brain.planT += dt; brain.switchCool = Math.max(0, brain.switchCool - dt);
    if ((brain.retick = (brain.retick || 0) - dt) > 0) return;
    brain.retick = this.level.think;
    const d = this.ball, ballPos = d.pos, s = HOME_SIGN[team];
    if (holderTeam !== team) { brain.planT = 0; brain.had = false; }
    if (holderTeam === team) {
      // ATTACK: supporters on the main route, decoys on the other, anchors at home.
      const carrier = d.holder || d.passTo, cp = this.posOf(carrier);
      if (!brain.had) {
        // a new possession: pick the attack. Already out on a flank? Keep going that way.
        brain.had = true;
        const side = Math.abs(cp.x) > ST.LW + 2 ? (cp.x < 0 ? 'left' : 'right') : null, r = Math.random();
        brain.main = side && r < 0.5 ? side : r < 0.45 ? 'lobby' : r < 0.72 ? 'left' : 'right';
        const others = ['lobby', 'left', 'right'].filter(x => x !== brain.main);
        brain.decoy = others[Math.floor(Math.random() * others.length)];
        brain.mainRoute = null;
      }
      const free = mine.filter(b => b !== carrier).sort((a, b) => a.pos.distanceTo(cp) - b.pos.distanceTo(cp));
      free.forEach((b, i) => { b.role = i < 3 ? 'support' : i < 5 ? 'decoy' : 'anchor'; b.slot = i; });
      if (!brain.mainRoute || brain.mainFor !== brain.main) { brain.mainRoute = this.planRoute(team, brain.main, cp); brain.mainFor = brain.main; }
    } else if (holderTeam) {
      // DEFEND
      const carrier = d.holder || d.passTo, cp = this.posOf(carrier);
      const byDist = mine.slice().sort((a, b) => a.pos.distanceTo(cp) - b.pos.distanceTo(cp));
      const pressers = byDist.slice(0, 2), rest = byDist.slice(2);
      pressers.forEach(b => { b.role = 'press'; });
      const keeper = rest.sort((a, b) => Math.abs(a.pos.z - s * 36) - Math.abs(b.pos.z - s * 36))[0];
      if (keeper) keeper.role = 'keeper';
      const others = rest.filter(b => b !== keeper), sweeper = others.sort((a, b) => Math.abs(a.pos.z - s * 74) - Math.abs(b.pos.z - s * 74))[0];
      if (sweeper) sweeper.role = 'sweeper';
      const markers = others.filter(b => b !== sweeper), attackers = this.agents().filter(a => this.teamOf(a) !== team && a !== carrier);
      const taken = new Set();
      for (const m of markers) {
        let best = null, bd = Infinity;
        for (const a of attackers) { if (taken.has(a)) continue; const dd = this.posOf(a).distanceTo(m.pos); if (dd < bd) { bd = dd; best = a; } }
        m.role = 'mark'; m.markOn = best; if (best) taken.add(best);
      }
      brain.mainRoute = null;
    } else {
      // LOOSE: the two closest chase, the rest keep shape.
      const byDist = mine.slice().sort((a, b) => a.pos.distanceTo(ballPos) - b.pos.distanceTo(ballPos));
      byDist.forEach((b, i) => { b.role = i < 2 ? 'chase' : 'shape'; b.slot = i; });
      brain.mainRoute = null;
    }
    // Targets for everyone without the core
    for (const b of mine) {
      if (b === d.holder) continue;
      b.target.copy(this.roleTarget(b, brain));
    }
  },

  roleTarget(b, brain) {
    const d = this.ball, s = HOME_SIGN[b.team], k = (b.idx % 4) - 1.5, up = (b.idx % 2 ? 1 : -1);
    switch (b.role) {
      case 'support': {
        const route = brain.mainRoute || [], carrier = d.holder || d.passTo, cp = carrier ? this.posOf(carrier) : d.pos;
        let ni = route.findIndex(id => STATION.routes.nodes[id].p.distanceTo(cp) < 9);
        ni = Math.min(route.length - 3, Math.max(0, ni) + 1 + (b.slot || 0)); // stop short of the goal so you never stand in your own shot
        ni = Math.max(0, ni);
        const p = route.length ? STATION.routes.nodes[route[ni]].p.clone() : cp.clone();
        return p.add(new T.Vector3(k * 2.2, up * 2.2, 0));
      }
      case 'decoy': {
        const route = this.planRoute(b.team, brain.decoy, b.pos), node = STATION.routes.nodes[route[Math.min(route.length - 1, 3 + (b.slot || 0))]];
        return node.p.clone().add(new T.Vector3(0, up * 2, 0));
      }
      case 'anchor': return new T.Vector3(k * 4, ST.CY + up * 3, s * 10);
      case 'press': { const carrier = d.holder || d.passTo; return carrier ? this.posOf(carrier).clone() : d.pos.clone(); }
      case 'keeper': return new T.Vector3(Math.max(-9, Math.min(9, d.pos.x * 0.6)), Math.max(5, Math.min(13, d.pos.y)), s * (ST.LZ - 5));
      case 'sweeper': {
        const threat = this.agents().filter(a => this.teamOf(a) !== b.team && Math.abs(this.posOf(a).x) > ST.LW + 2 && this.posOf(a).z * s > 30);
        const x = threat.length ? Math.sign(this.posOf(threat[0]).x) * 22 : 0;
        return new T.Vector3(x, ST.CY, s * ST.BZ);
      }
      case 'mark': {
        if (!b.markOn) return new T.Vector3(k * 4, ST.CY, s * 20);
        const ap = this.posOf(b.markOn), own = new T.Vector3(0, ST.CY, s * ST.LZ);
        return ap.clone().addScaledVector(tmp.subVectors(own, ap).normalize(), 3);
      }
      case 'chase': return d.pos.clone().addScaledVector(d.vel, 0.3);
      default: {
        // shape: spread around the core, leaning toward your own end
        const z = Math.max(-ST.LZ + 6, Math.min(ST.LZ - 6, d.pos.z + s * (8 + (b.slot || 0) * 2)));
        return new T.Vector3(k * 5, ST.CY + up * 3.5, z);
      }
    }
  },

  // The carrier decides: shoot, pass (switch the play, or to an open runner, or to YOU), or keep flying the route.
  carrierThink(b, dt) {
    const brain = this.brains[b.team];
    if ((b.decideT = (b.decideT || 0) - dt) > 0) return;
    b.decideT = this.level.think * 0.8;
    if (b.grace > 0 || b.cool > 0) return;
    const pressured = this.pressureAt(b.team, b.pos, 5) > 0, crowd = this.pressureAt(b.team, b.pos, 15);
    // 1. A good shot?
    const shot = this.bestShot(b.team, b.pos, pressured ? 26 : 22);
    if (shot && (shot.g.kind === 'deep' || shot.d < 20 || (pressured && shot.d < 26))) return this.botShoot(b, shot);
    // A long shot now and then (the punt).
    if (!shot) { const longShot = this.bestShot(b.team, b.pos, 36); if (longShot && longShot.d > LONG_SHOT && Math.random() < 0.12) return this.botShoot(b, longShot); }
    // 2. Passing options
    const mates = this.agents().filter(a => a !== b && this.teamOf(a) === b.team && !(a.clash) && !(a.stun > 0));
    let best = null;
    const myProg = this.progressOf(b.team, b.pos);
    for (const m of mates) {
      const mp = this.posOf(m), dist = mp.distanceTo(b.pos);
      if (dist > PASS_RANGE || dist < 4 || !this.passOpen(b.team, b.pos, mp)) continue;
      let score = this.progressOf(b.team, mp) - myProg - dist * 0.08;
      if (m === 'player') score += 8;                      // your bots look for you
      if (m.role === 'decoy' && crowd >= 3) score += 14;   // the switch
      if (!best || score > best.score) best = { m, score };
    }
    if (best && (best.score > 6 || (pressured && best.score > -6))) {
      if (best.m.role === 'decoy' && crowd >= 3 && brain.switchCool === 0) {
        const old = brain.main; brain.main = brain.decoy; brain.decoy = old; brain.switchCool = 6; brain.mainRoute = null;
        if (b.team === 'blue') this.flash('SWITCH! Your team swings the attack the other way.', 1.6);
      }
      return this.passFrom(b, best.m);
    }
  },
  botShoot(b, shot) {
    const d = this.ball, err = this.level.aim * (0.4 + shot.d / 25) * (this.state === 'penalty' ? 0.6 : 1);
    const dir = shot.aim.clone().sub(b.pos).normalize().add(new T.Vector3((Math.random() - 0.5) * err, (Math.random() - 0.5) * err, (Math.random() - 0.5) * err)).normalize();
    this.release(b, dir.multiplyScalar(BOT_THROW + Math.min(8, shot.d * 0.25)));
    b.cool = 0.8;
  },
  catchCheck(b) {
    const d = this.ball;
    if (d.holder || d.noCatch > 0 || b.cool > 0 || b.stun > 0) return;
    const dist = b.pos.distanceTo(d.pos);
    if (d.passTo === b && dist < 2.2) return this.takeBall(b);
    // The nearest chaser pulls a loose CORE in from your pull range (point + trigger), after a short reaction time.
    if (b.role === 'chase' && b.slot === 0 && !d.passTo && dist < (this.easy ? EASY_PULL_RANGE : SNAP_R + ARM_MAX) && clearLine(b.pos, d.pos, BALL_R)) {
      b.pullT = (b.pullT || 0) + 1 / 60; // called once a frame
      if (b.pullT > (BOT_PULL_DELAY[this.level.name] || 0.5)) d.vel.lerp(tmp.subVectors(b.pos, d.pos).add(new T.Vector3(0, 1, 0)).setLength(PULL_SPEED), 0.12);
    } else b.pullT = 0;
    if (dist < BOT_CATCH_R + BALL_R) {
      // Fast loose balls are hard to catch; your own team's passes to someone else are left alone.
      if (d.passTo && this.teamOf(d.passTo) === b.team) return;
      // never get in the way of your own team's shot
      if (!d.passTo && d.lastThrower && this.teamOf(d.lastThrower) === b.team && this.time - d.throwT < 1.5) return;
      if (d.vel.length() > 14 && Math.random() > 0.12) return; // a hard shot is hard to catch (about 1 in 3 gets stopped)
      this.takeBall(b);
    }
  },

  // Flying: straight at the target if the line is clear, otherwise along the route graph.
  steerBot(b, dt) {
    const d = this.ball, isCarrier = d.holder === b;
    let goal = b.target;
    if (isCarrier) {
      const brain = this.brains[b.team];
      if (!brain.mainRoute) { brain.mainRoute = this.planRoute(b.team, brain.main, b.pos); brain.mainFor = brain.main; }
      const route = brain.mainRoute, last = STATION.routes.nodes[route[route.length - 1]].p;
      goal = last;
    }
    let aim = goal;
    if (isCarrier && !clearLine(b.pos, goal, BOT_R)) {
      const route = this.brains[b.team].mainRoute, nodes = STATION.routes.nodes;
      let best = 0, bd = Infinity;
      route.forEach((id, i) => { const dd = nodes[id].p.distanceTo(b.pos); if (dd < bd) { bd = dd; best = i; } });
      const next = Math.min(route.length - 1, best + 1);
      aim = clearLine(b.pos, nodes[route[next]].p, BOT_R) ? nodes[route[next]].p : nodes[route[best]].p;
      if (bd > 14 && !clearLine(b.pos, nodes[route[best]].p, BOT_R)) { this.brains[b.team].mainRoute = this.planRoute(b.team, this.brains[b.team].main, b.pos); }
    } else if (!clearLine(b.pos, goal, BOT_R)) {
      const from = nearestNode(b.pos), to = nearestNode(goal), key = from + ':' + to;
      if (b.pathKey !== key) { b.path = routeBetween(from, to).slice(); b.pathKey = key; }
      while (b.path.length > 1 && (STATION.routes.nodes[b.path[0]].p.distanceTo(b.pos) < 3 || clearLine(b.pos, STATION.routes.nodes[b.path[1]].p, BOT_R))) b.path.shift();
      if (b.path.length) aim = STATION.routes.nodes[b.path[0]].p;
    } else { b.path = []; b.pathKey = ''; }
    const to = tmp.subVectors(aim, b.pos), dist = to.length();
    const speed = BOT_SPEED * this.level.speed * (b.role === 'keeper' || b.role === 'sweeper' || b.role === 'anchor' ? 0.8 : 1) * (isCarrier ? 1.04 : b.role === 'press' ? 0.95 : 1);
    const want = dist > 0.05 ? to.multiplyScalar(Math.min(speed, dist * 1.8) / dist) : to.set(0, 0, 0);
    // keep a little apart from teammates, and steer round rivals unless you are going after the carrier or the core
    const hunting = b.role === 'press' || b.role === 'chase';
    for (const o of this.agents()) {
      if (o === b) continue;
      const rival = this.teamOf(o) !== b.team;
      if (rival && (hunting || o === d.holder)) continue;
      const sep = tmp2.subVectors(b.pos, o === 'player' ? this.bodyPos() : o.pos), sd = sep.length(), room = rival ? 3.5 : 3;
      if (sd < room && sd > 1e-3) want.addScaledVector(sep, (room - sd) / sd * (rival ? 2.5 : 1.5));
    }
    tmp3.subVectors(want, b.vel);
    const maxDv = BOT_ACCEL * dt;
    if (tmp3.length() > maxDv) tmp3.setLength(maxDv);
    b.vel.add(tmp3);
    b.pos.addScaledVector(b.vel, dt);
    constrainSphere(b.pos, b.vel, BOT_R, 0.3);
    if (b.vel.lengthSq() > 1) { tmp.copy(b.vel); tmp.y *= 0.3; if (tmp.lengthSq() > 0.5) b.facing.lerp(tmp.normalize(), 1 - Math.exp(-6 * dt)).normalize(); }
    if (b.role === 'press' || isCarrier) return;
    // face the core when standing still
    if (b.vel.lengthSq() < 4) { tmp.subVectors(d.pos, b.pos); tmp.y = 0; if (tmp.lengthSq() > 1) b.facing.lerp(tmp.normalize(), 1 - Math.exp(-3 * dt)).normalize(); }
  },

  // Bots snatch the core straight out of a rival's hands when they get close without crashing in.
  botSteals(dt) {
    const d = this.ball, holder = d.holder;
    if (!holder || holder.clash || this.clash) return;
    const hp = this.posOf(holder), team = this.teamOf(holder);
    if ((holder === 'player' ? this.playerGrace : holder.grace) > 0) return;
    for (const b of this.matchBots) {
      if (b.team === team || b.stun > 0 || b.cool > 0) continue;
      if (b.pos.distanceTo(hp) > STEAL_R + 0.3) continue;
      if (Math.random() < dt * 0.35 * this.level.clash) { this.flash(holder === 'player' ? `${b.label} SNATCHED IT!` : '', 1.2); this.takeBall(b, true); if (holder !== 'player') holder.stun = 0.4; return; }
    }
  }
};
