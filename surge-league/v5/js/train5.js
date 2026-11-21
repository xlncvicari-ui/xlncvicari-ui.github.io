// Version 5 training: fourteen short steps you fly through on Meridian Station, one control at a time. Finish it and you earn a
// PILOT LICENSE (gold board and gloves): the reward for learning the game properly. Mixed into the game component.
const TRAIN5 = {
  startTraining() {
    if (this.lvl.id !== 'meridian') this.enterLevel(LEVELS5[0]);
    this.state = 'training'; this.score = { blue: 0, orange: 0 }; this.timeLeft = 0; this.stats = this.freshStats(); this.sudden = false;
    this.ruck = null; this.duels = []; this.penalty = null; this.playerBin = 0; this.buff = { blue: 0, orange: 0 }; this.charge = null;
    for (const s of this.shards) this.el.object3D.remove(s.obj); this.shards = [];
    for (const b of this.bots) { b.obj.visible = false; b.reach.visible = false; b.ruck = null; b.duel = null; b.bin = 0; b.stun = 0; }
    this.ally = this.bots.find(b => b.team === 'blue'); this.rival = this.bots.find(b => b.team === 'orange');
    this.matchBots = [];
    this.realLevel = this.realLevel || this.level; this.level = LEVELS[0];     // the training rival is always a rookie
    this.placePlayer(0, 9, 30, 0);
    this.dropBall();
    this.training = { step: -1, t: 0 };
    this.nextStep();
  },
  leaveTraining() { if (this.realLevel) { this.level = this.realLevel; this.realLevel = null; } this.training = null; this.target.visible = false; },
  dropBall() { const d = this.ball; d.holder = null; d.passTo = null; d.pos.set(0, -50, 0); d.vel.set(0, 0, 0); },
  ringAt(x, y, z) { this.target.position.set(x, y, z); this.target.rotation.set(0, 0, 0); this.target.visible = true; },
  aheadOf(dist, y) {
    const f = new T.Vector3(this.headFwd.x, 0, this.headFwd.z); if (f.lengthSq() < 0.01) f.set(0, 0, -1); f.normalize();
    const p = this.headPos.clone().addScaledVector(f, dist);
    p.x = Math.max(-11, Math.min(11, p.x)); p.z = Math.max(-40, Math.min(40, p.z)); p.y = y;
    return { p, f };
  },
  givePlayerBall() { const h = (this.hands || [])[0]; this.takeBall('player'); this.ball.hand = h ? h.side : 'right'; },
  spawnTrainee(b, dist, keep) {
    const { p, f } = this.aheadOf(dist, 8.2);
    Object.assign(b, { stun: 0, cool: 0, grace: 0, bin: 0, ruck: null, duel: null, role: 'idle', path: [] });
    b.pos.copy(p); b.vel.set(0, 0, 0); b.facing.copy(f).negate(); b.obj.visible = true; b.target.copy(p);
    this.matchBots = keep ? [...new Set([...this.matchBots, b])] : [b];
  },
  TRAINING5: [
    { id: 'fly', vr: 'Point your hands where you want to go and push the LEFT STICK forward. Fly through the gold ring.', pc: 'W flies where you look (drag the mouse to look). Fly through the gold ring.', hint: 'steer',
      setup(g) { g.ringAt(0, 10, 14); }, done: g => g.headPos.distanceTo(g.target.position) < 2.2 },
    { id: 'turn', vr: 'Flick the RIGHT STICK left or right to snap turn. A turns you all the way around in one go. Turn around now.', pc: 'Press L to turn all the way around.', hint: 'turn',
      setup(g) { g.target.visible = false; g.turnTotal = 0; }, done: g => g.turnTotal >= 150 },
    { id: 'boost', vr: 'Click the LEFT STICK down to boost, and keep it down to keep boosting. Boost through the ring.', pc: 'Hold Shift to boost. Boost through the ring.', hint: 'boost',
      setup(g) { const { p } = g.aheadOf(14, 10); g.target.position.copy(p); g.target.lookAt(g.headPos); g.target.visible = true; },
      done: g => g.headPos.distanceTo(g.target.position) < 2.4 && g.time - (g.boostAt || -9) < 1.5 },
    { id: 'dash', vr: 'B is your DASH: a sharp burst the way the left stick points. Push the stick SIDEWAYS and press B. Do it twice.', pc: 'R is your DASH. Hold A or D and press R. Do it twice.', hint: 'dash',
      setup(g) { g.target.visible = false; g.training.n = 0; g.training.last = g.dashAt; },
      done: g => { if (g.dashAt !== g.training.last) { g.training.last = g.dashAt; g.training.n++; } return g.training.n >= 2; } },
    { id: 'grab', vr: 'This is the CORE. Point at it and HOLD THE TRIGGER to pull it into your hand.', pc: 'This is the CORE. Look at it and hold G to pull it in.', hint: 'grab',
      setup(g) { const { p } = g.aheadOf(7, 9); const d = g.ball; d.pos.copy(p); d.vel.set(0, 0, 0); d.holder = null; d.passTo = null; }, done: g => g.ball.holder === 'player' },
    { id: 'throw', vr: 'TAP the trigger for a soft throw. HOLD it and the ring round the CORE grows: a hard throw. Fly to the gold ring, point at a round hole in the ORANGE wall, hold, let go.', pc: 'Tap Space for a soft throw, hold it for a hard one. Fly to the gold ring, look at a round hole and throw.', hint: 'throw', back: 'player',
      setup(g) { g.ringAt(0, 9, -30); }, done: g => { const sc = g.training.scored; if (sc && sc.team !== 'orange') g.training.scored = null; return !!sc && sc.team === 'orange'; } },
    { id: 'pass', vr: 'A teammate is open. Point at them and TAP the trigger. Letting go while you point at a teammate is always a pass.', pc: 'A teammate is open. Press F to pass.', hint: 'pass', back: 'player',
      setup(g) { g.target.visible = false; g.spawnTrainee(g.ally, 10); g.givePlayerBall(); }, done: g => g.ball.holder === g.ally },
    { id: 'call', vr: 'Now THEY have it. Press X to CALL FOR A PASS and it comes straight to your hand.', pc: 'Now THEY have it. Press C to call for a pass.', hint: 'call', back: 'ally',
      setup(g) { g.callT = 0; if (g.ball.holder !== g.ally) g.takeBall(g.ally); }, done: g => g.ball.holder === 'player' },
    { id: 'ruck', vr: 'ORANGE has the CORE. Fly straight into them: that is a RUCK. Now SQUEEZE every trigger and grip. More fingers, more strength. Flutter the triggers to strip it.', pc: 'ORANGE has the CORE. Fly into them to start a RUCK, then hold G and Space and tap them fast.', hint: 'ruck', back: 'rival',
      setup(g) { g.ally.obj.visible = false; g.ally.reach.visible = false; g.dropBall(); g.spawnTrainee(g.rival, 14); g.takeBall(g.rival); g.rival.grace = 0; }, done: g => g.ball.holder === 'player' && !g.ruck },
    { id: 'punch', vr: 'FIGHTS. ORANGE isn\'t carrying now. Make a fist (hold a GRIP) and swing it into their chest, three times. When they flash red they are about to hit: glove in front of your face, or duck.', pc: 'FIGHTS. Fly next to ORANGE and press X to punch, three times. Hold G to block.', hint: 'punch', back: 'ally', hold: 2.8,
      setup(g) { g.spawnTrainee(g.rival, 4.5); g.spawnTrainee(g.ally, 4.5, true); g.ally.pos.x += g.ally.pos.x > 0 ? -6 : 6; g.ally.target.copy(g.ally.pos); g.takeBall(g.ally); g.training.fought = false; },
      done: g => { if (g.inDuel('player')) g.training.fought = true; if (g.playerBin > 4) { g.playerBin = 4; g.flash('This is the PENALTY BOX. Lose a fight and you sit here and watch.', 3.5, { color: '#ff4f6a' }); } return g.training.fought && !g.inDuel('player') && !(g.playerBin > 0); } },
    { id: 'rear', vr: 'Someone is behind you. HOLD the RIGHT STICK down: a mirror shows what is back there. Hold it for a moment.', pc: 'Someone is behind you. Hold V to look in your mirror.', hint: 'rear',
      setup(g) { g.dropBall(); g.ally.obj.visible = false; g.ally.reach.visible = false; g.spawnTrainee(g.rival, -6); g.training.held = 0; }, done: (g, inp, dt) => { if (inp.rear) g.training.held += dt; return g.training.held > 1.2; } },
    { id: 'windows', vr: 'The windows are OPEN. Fly out through the gold ring into space, then come back in through any window.', pc: 'The windows are OPEN. Fly out through the gold ring into space, then come back in.', hint: 'windows',
      setup(g) {
        g.matchBots = []; g.rival.obj.visible = false; g.rival.reach.visible = false; g.training.out = false;
        const wins = WORLD.windows.filter(w => Math.abs(w.n.x) > 0.9 && Math.abs(w.c.x) < 16 && w.c.y < 16).sort((a, b) => a.c.distanceTo(g.headPos) - b.c.distanceTo(g.headPos)), w = wins[0];
        if (w) { g.target.position.copy(w.c); g.target.lookAt(w.c.clone().add(w.n)); g.target.visible = true; } else g.training.out = true;
      }, done: g => { if (g.outside) g.training.out = true; return g.training.out && !g.outside; } },
    { id: 'sight', vr: 'Last one. Fly to the SIGHT RING in the exact middle of the lobby and hover inside it: you see every rider through the walls.', pc: 'Last one. Fly to the SIGHT RING in the middle of the lobby and stay inside it.', hint: 'sight',
      setup(g) { g.target.visible = false; }, done: g => g.inSight },
    { id: 'done', vr: 'PILOT LICENSE EARNED. Your board and gloves are gold now. Lobby holes 1, deep goal 3, bank and long shots +1, first to the target wins. Press A for the menu.', pc: 'PILOT LICENSE EARNED. Holes 1, deep goal 3, bank and long shots +1, first to the target wins. Press Enter for the menu.', hint: null,
      setup(g) { g.grantLicense(); }, done: (g, inp) => inp.start || g.training.t > 25 }
  ],
  grantLicense() {
    const first = !this.save.licensed;
    this.save.licensed = true; this.save.briefed5 = true; writeSave(this.save); this.buildPlayerRide(); this.menuKey = '';
    if (first) { beep(523, 160, 0.1); beep(659, 160, 0.1, 'sine', 0.15); beep(784, 160, 0.1, 'sine', 0.3); beep(1047, 400, 0.12, 'sine', 0.45); for (const h of this.hands || []) pulse(h, 1, 400); this.bursts.fire(this.headPos.clone().addScaledVector(this.headFwd, 2.5), '#ffd166', 1.2); }
  },
  nextStep() {
    const tr = this.training; tr.step++; tr.t = 0; tr.loose = 0; tr.scored = null; tr.doneT = 0;
    const s = this.TRAINING5[tr.step];
    if (!s) { this.resetToMenu(); return; }
    s.setup(this);
    this.flash(`${tr.step + 1} / ${this.TRAINING5.length}   ${this.inVR ? s.vr : s.pc}`, 999, { hint: this.inVR && s.hint ? TIP_HINTS[s.hint] : null, color: s.id === 'done' ? '#ffd166' : '#9ff6ff' });
  },
  updateTraining(inp, dt) {
    const tr = this.training; if (!tr) return;
    tr.t += dt;
    const s = this.TRAINING5[tr.step], d = this.ball;
    // the trainees: the teammate hovers and watches you; the rival drifts slowly away while it carries the core
    for (const b of this.matchBots) {
      b.stun = Math.max(0, b.stun - dt); b.grace = Math.max(0, b.grace - dt); b.cool = Math.max(0, b.cool - dt); b.reachT = Math.max(0, (b.reachT || 0) - dt);
      if (b.ruck || b.duel || b.bin > 0) { b.vel.set(0, 0, 0); continue; }
      if (b === this.rival && d.holder === b) { const away = b.pos.clone().sub(this.headPos); away.y = 0; if (away.lengthSq() > 1) b.target.copy(b.pos).addScaledVector(away.normalize(), 2); }
      if (b.stun > 0) { b.vel.multiplyScalar(Math.exp(-2 * dt)); b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.4); continue; }
      const to = b.target.clone().sub(b.pos); b.vel.lerp(to.multiplyScalar(b === this.rival ? 0.8 : 1.5), 1 - Math.exp(-2 * dt));
      if (b.vel.length() > 3) b.vel.setLength(3);
      b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.3);
      if (b === this.ally && d.holder !== b) this.catchCheck(b, dt);
      tmp.subVectors(this.headPos, b.pos); tmp.y = 0; if (tmp.lengthSq() > 1) b.facing.lerp(tmp.normalize(), 1 - Math.exp(-4 * dt)).normalize();
    }
    // you called for it: the teammate throws it to you
    if (s.id === 'call' && d.holder === this.ally && this.callT > 0 && tr.t > 0.4) { this.callT = 0; this.flash('HERE IT COMES!', 0.9, { color: '#66ffff' }); this.passFrom(this.ally, 'player', 16); }
    // a core that got away comes back to whoever this step needs to have it
    if (s.back && d.holder === null && !this.ruck) {
      tr.loose += dt;
      if (tr.loose > 3.2 && !tr.scored) {
        tr.loose = 0;
        if (s.back === 'player') { this.givePlayerBall(); this.flash(s.id === 'throw' ? 'Try again: point at a round hole in the ORANGE wall, hold the trigger, let go.' : 'Try again: point at your teammate and tap the trigger.', 3, { color: '#9ff6ff' }); }
        else if (this[s.back].obj.visible && !(this[s.back].bin > 0)) this.takeBall(this[s.back]);
      }
    } else tr.loose = 0;
    // step done: a chime, a short beat so you see what you just did (longer after the fight, to watch the loser sit in the box), then the next one
    if (!tr.doneT && s.done(this, inp, dt)) {
      beep(660, 120, 0.1); beep(990, 160, 0.1, 'sine', 0.1); this.bursts.fire(this.headPos.clone().addScaledVector(this.headFwd, 2), '#ffd166', 0.5);
      tr.doneT = s.hold || 0.35;
    } else if (tr.doneT && (tr.doneT -= dt) <= 0) { tr.doneT = 0; this.nextStep(); }
    this.target.rotation.z += dt * 0.6;
  }
};
