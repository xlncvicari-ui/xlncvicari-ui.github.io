// Version 5 contact: RUCKS, FIGHTS and the PENALTY BOX. Mixed into the game component.
//
// RUCK   Fly into the rider carrying the core and the two of you lock up. Everyone within RUCK_PULL_R is drawn in and binds on
//        (up to RUCK_MAX a side), so the team that stays together is stronger. Your strength is how many triggers and grips you
//        are squeezing (0 to 4). If your side doesn't have the core, fluttering the triggers strips it faster. The carrier can
//        offload (B) to a teammate outside the ruck. Nobody can snatch the core out of a ruck from the side: join it and out-pull it.
// FIGHT  Land a punch (grip held, fast swing) on a rival who isn't carrying and you duel until one of you is knocked out (health
//        bars). Their jabs come in combos (red flash): block with a glove in front of your face, or move your head. Heavy swings
//        (gold flash) can only be dodged. Their guard goes up and down: hit when it is down, or right after you block or dodge
//        (a counter, which hits much harder). The loser sits in the penalty box for BIN_TIME. Start it with the core nowhere
//        near and BOTH of you go.
// BOX    A see-through cell above (or beside) the level. You can watch the whole match from it. You can't do anything else.
const BRAWL = {
  inRuck(a) { const r = this.ruck; return !!r && (r.A.includes(a) || r.B.includes(a)); },
  inDuel(a) { return !!this.duels && this.duels.some(d => d.a === a || d.b === a); },
  teamSpeed(team) { return this.buff[team] > 0 ? AURORA_SPEED : 1; },
  teamStrength(team) { return this.buff[team] > 0 ? AURORA_STRENGTH : 1; },
  // Moves a bot (its board) to the first of these spots that is open: not inside a wall, not off the field. None open: it stays put.
  placeBot(b, spots) { for (const p of spots) if (!solidAt(tmp3.copy(p).setY(p.y + 0.9), 0.5)) { b.pos.copy(p); return true; } return false; },

  // ---------------------------------------------------------------- rucks
  startRuck(tackler, carrier, dashed) {
    const at = this.posOf(carrier).clone().lerp(this.posOf(tackler), 0.5);
    this.ruck = { a: tackler, b: carrier, A: [tackler], B: [carrier], at, t: 0, p: dashed ? DASH_HEADSTART : 0, buzz: 0, spark: 0 };
    for (const x of [tackler, carrier]) this.bind(x);
    const mine = tackler === 'player' || carrier === 'player';
    if (mine) { this.tip('ruck', true); for (const h of this.hands || []) pulse(h, 1, 160); }
    this.flash(mine ? 'RUCK!' : '', 1, { big: true, color: '#ffd166' });
    beepAt(110, 260, 0.14, 'sawtooth', at); noiseAt(300, 0.14, at, [500, 120]);
    this.bursts.fire(at, '#ffd166', 0.9);
  },
  bind(x) { if (x === 'player') this.vel.set(0, 0, 0); else { x.ruck = true; x.vel.set(0, 0, 0); x.path = []; } },
  updateRuck(inp, dt) {
    const r = this.ruck; if (!r) return;
    r.t += dt;
    // teammates nearby are drawn in and bind on
    for (const x of this.agents()) {
      if (this.inRuck(x) || !this.free(x)) continue;
      const side = this.teamOf(x) === this.teamOf(r.a) ? r.A : r.B;
      if (side.length >= RUCK_MAX) continue;
      const p = this.posOf(x), dist = p.distanceTo(r.at);
      if (dist > RUCK_PULL_R) continue;
      const pull = r.at.clone().sub(p).setLength(18 * dt);
      if (x === 'player') { if (!this.boosting) this.vel.add(pull); } else x.vel.add(pull.multiplyScalar(1.6));
      if (dist < RUCK_BIND_R) {
        side.push(x); this.bind(x);
        if (x !== 'player') { const out = x.pos.clone().sub(r.at); out.y *= 0.3; if (out.lengthSq() < 0.01) out.set(1, 0, 0); this.placeBot(x, [r.at.clone().addScaledVector(out.normalize(), 1.5 + side.length * 0.25).add(new T.Vector3(0, -0.9, 0))]); }
        beepAt(300 + side.length * 60, 80, 0.07, 'triangle', r.at);
        if (x === 'player') { this.flash('BOUND ON! Squeeze everything.', 1.2, { color: '#ffd166' }); this.tip('ruck', true); }
        else if (this.inRuck('player') && this.teamOf(x) === 'blue') this.flash(`${x.label} binds on with you`, 0.9, { color: '#66ffff' });
      }
    }
    const haveCore = this.teamOf(r.b), playerSide = r.A.includes('player') ? 'A' : r.B.includes('player') ? 'B' : null;
    const strength = x => {
      if (x === 'player') {
        const strip = this.teamOf('player') !== haveCore ? Math.min(STRIP_MAX, (this.flutter || 0) * 0.22) : 0;
        return (GRIP_BASE + GRIP_PER * inp.squeeze + strip) * this.teamStrength('blue');
      }
      return this.level.grip * (0.85 + 0.3 * Math.sin(this.time * 3 + x.idx)) * this.teamStrength(x.team);
    };
    const SA = r.A.reduce((s, x) => s + strength(x), 0), SB = r.B.reduce((s, x) => s + strength(x), 0) + RUCK_HOLD;
    r.SA = SA; r.SB = SB;
    r.p += (SA - SB) * RUCK_RATE * dt + (Math.random() - 0.5) * 0.2 * dt;
    for (const x of [...r.A, ...r.B]) if (x !== 'player') x.vel.set(0, 0, 0);
    // it shakes harder the more you are being out-pulled
    if (playerSide && (r.buzz -= dt) <= 0) {
      const against = playerSide === 'A' ? SB - SA : SA - SB;
      r.buzz = 0.09; for (const h of this.hands || []) pulse(h, Math.max(0.25, Math.min(1, 0.45 + against * 0.35)), 70);
    }
    if ((r.spark -= dt) <= 0) { r.spark = 0.22; this.bursts.fire(r.at, Math.abs(r.p) > 0.5 ? TEAM_COLOR[r.p > 0 ? this.teamOf(r.a) : haveCore] : '#ffd166', 0.3); noiseAt(120, 0.05, r.at, [300, 150]); }
    // offloads: you press B; a bot carrier does it when it is losing and someone is open
    const mates = () => this.agents().filter(x => !this.inRuck(x) && this.free(x) && this.teamOf(x) === haveCore && this.posOf(x).distanceTo(r.at) < 26 && this.passOpen(haveCore, this.ball.pos, this.posOf(x)));
    if (r.b === 'player' && inp.dash) { const m = mates()[0]; if (m) { this.flash(`OFFLOAD TO ${m.num}`, 0.9, { color: '#66ffff' }); this.passFrom('player', m); return; } this.flash('Nobody open to offload to', 0.8); }
    if (r.b !== 'player' && r.t > 0.6 && r.p > 0.25 && Math.random() < dt * 0.9) { const m = mates()[0]; if (m) { this.passFrom(r.b, m); return; } }
    if (r.p >= 1 || r.p <= -1 || r.t >= RUCK_TIME) this.endRuck(r.p > 0.12 ? 'A' : 'B');
  },
  endRuck(winner) {
    const r = this.ruck; if (!r) return;
    this.ruck = null;
    for (const x of [...r.A, ...r.B]) if (x !== 'player') x.ruck = null;
    const knock = (x, speed, stun) => {
      const dir = this.posOf(x).clone().sub(r.at); if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0.2, Math.random() - 0.5); dir.normalize();
      if (x === 'player') { this.vel.copy(dir).multiplyScalar(speed); this.playerStun = stun; } else { x.vel.copy(dir).multiplyScalar(speed); x.stun = stun; }
    };
    if (winner === 'offload') { for (const x of r.A) knock(x, 3, 0.3); for (const x of r.B) knock(x, 2, 0.1); if (r.A.includes('player')) this.flash('THEY OFFLOADED IT', 1); return; }
    const losers = winner === 'A' ? r.B : r.A, winners = winner === 'A' ? r.A : r.B;
    for (const x of losers) knock(x, 7, 0.8);
    for (const x of winners) { knock(x, 2, 0); if (x === 'player') this.playerGrace = 1.2; else x.grace = 1.2; }
    if (winner === 'A') { this.takeBall(r.a, true); if (r.a === 'player') this.ball.hand = (this.hands && this.hands[0] && this.hands[0].side) || 'right'; }
    const pSide = r.A.includes('player') ? 'A' : r.B.includes('player') ? 'B' : null;
    if (pSide) {
      const won = pSide === winner;
      if (won) this.stats.hits++;
      this.flash(won ? (winner === 'A' ? 'RUCK WON! Your team strips it.' : 'HELD ON!') : (winner === 'A' ? 'STRIPPED! They out-pulled you.' : 'THEY HELD ON'), 1.5, { color: won ? '#66ffff' : '#ff7a2f' });
      for (const h of this.hands || []) pulse(h, 1, 220);
    }
    beepAt(winner === 'A' ? 700 : 300, 200, 0.12, 'triangle', r.at); this.bursts.fire(r.at, TEAM_COLOR[this.teamOf(winners[0])], 1.2);
  },

  // ---------------------------------------------------------------- fights
  // Your punches: a fast glove into a rival's body. On the carrier that is a tackle (a ruck); on anyone else it is a fight.
  // In a fight a punch does more the faster the glove is moving, more again on the helmet, and much more as a counter.
  updatePunches(inp, dt) {
    if (!(this.fights || this.state === 'training') || !this.free('player') && !this.inDuel('player')) return;
    this.punchCool = Math.max(0, (this.punchCool || 0) - dt);
    if (this.punchCool > 0) return;
    let target = null, hand = null, head = false;
    for (const h of inp.hands) {
      if (h.desktop) { if (!inp.punch) continue; } else if (!h.grip || h.realSpeed < PUNCH_SPEED) continue;
      for (const b of this.matchBots) {
        if (b.team === 'blue' || b.bin > 0 || b.ruck) continue;
        const chest = b.pos.clone().add(new T.Vector3(0, 1.0, 0)), helm = b.pos.clone().add(new T.Vector3(0, 1.55, 0));
        const dc = h.glove.distanceTo(chest), dh = h.glove.distanceTo(helm);
        if (Math.min(dc, dh) < (h.desktop ? 2.4 : 0.95) && this.bodyPos().distanceTo(chest) < PUNCH_R + 1.2) { target = b; hand = h; head = !h.desktop && dh < 0.4 && dh < dc; break; }
      }
      if (target) break;
    }
    if (!target) return;
    this.punchCool = PUNCH_COOL;
    if (this.ball.holder === target && !this.ruck && !this.inDuel('player')) { pulse(hand, 1, 90); return this.startRuck('player', target, false); }
    let duel = this.duels.find(d => (d.a === 'player' && d.b === target) || (d.b === 'player' && d.a === target));
    if (!duel) { if (this.inDuel('player') || this.inDuel(target) || !this.free('player')) return; duel = this.startDuel('player', target); }
    const speed = hand.desktop ? 3 + Math.random() * 1.6 : hand.realSpeed, power = Math.max(0, Math.min(1, (speed - PUNCH_SPEED) / (PUNCH_FULL - PUNCH_SPEED)));
    let dmg = PUNCH_DMG[0] + (PUNCH_DMG[1] - PUNCH_DMG[0]) * power; const tags = [];
    if (head) { dmg *= HEAD_BONUS; tags.push('HEADSHOT'); }
    if (duel.counterT > 0) { dmg *= COUNTER_BONUS; tags.push('COUNTER'); duel.counterT = 0; }
    if (duel.guardT > 0 && !duel.wind) {
      // their guard is up: most of it lands on the glove, and they answer straight away
      dmg *= GUARD_CHIP; duel.streak = 0; duel.next = Math.min(duel.next, 0.3);
      this.flash('BLOCKED: wait for the guard to drop', 0.6, { color: '#ffd166' }); beepAt(240, 60, 0.08, 'square', target.pos); pulse(hand, 0.5, 50);
      return this.landHit(duel, 'player', dmg, { quiet: true });
    }
    duel.streak = this.time - (duel.lastLand || -9) < 1.4 ? Math.min(STREAK_MAX, (duel.streak || 0) + 1) : 0; duel.lastLand = this.time;
    dmg *= 1 + STREAK_BONUS * duel.streak; if (duel.streak >= 1) tags.push(`x${duel.streak + 1}`);
    pulse(hand, 1, 60 + power * 120);
    // a clean hit knocks their rhythm: the jab they were winding up is gone, and a big one drops their guard
    // Only a solid hit stops the jab they were winding up. After a couple of clean hits they cover up, so a fight has a rhythm
    // (hit, hit, they guard, they swing) instead of ending in one flurry; a really big hit breaks the guard open instead.
    if (dmg >= 12) { if (duel.wind && duel.wind.kind !== 'heavy') duel.wind = null; duel.next += 0.25; }
    duel.clean = (duel.clean || 0) + 1;
    if (dmg >= 16) { duel.guardT = 0; duel.guardNext = 1.2; duel.clean = 0; }
    else if (!duel.training && !duel.wind && duel.clean >= (this.level.punch > 1.3 ? 3 : 2)) { duel.clean = 0; duel.guardT = (0.9 + Math.random() * 0.6) / this.level.punch; }
    this.landHit(duel, 'player', dmg, { tags, power });
  },
  startDuel(a, b) {
    const pa = this.posOf(a), pb = this.posOf(b), mid = pa.clone().lerp(pb, 0.5);
    const offBall = this.mode !== 'control' && this.ball.pos.distanceTo(mid) > DUEL_BALL_R, mine = a === 'player' || b === 'player';
    const training = this.state === 'training', bot = a === 'player' ? b : b === 'player' ? a : null;
    const duel = { a, b, bot, t: 0, hp: [DUEL_HP, DUEL_HP], hits: [0, 0], offBall, next: 1.1 + Math.random() * 0.5, wind: null, combo: 0, guardT: 0, guardNext: 0.6, counterT: 0, streak: 0, beat: 0, at: mid, training };
    if (training && bot) duel.hp[a === 'player' ? 1 : 0] = 60;      // the training rival goes down after a few good ones
    this.duels.push(duel);
    for (const x of [a, b]) if (x === 'player') this.vel.set(0, 0, 0); else { x.duel = duel; x.vel.set(0, 0, 0); x.path = []; }
    // square up: the bot faces its rival about an arm's length away
    for (const [x, o] of [[a, b], [b, a]]) if (x !== 'player') {
      const op = this.posOf(o), dir = x.pos.clone().sub(op); dir.y = 0; if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize();
      const y = op.y - (o === 'player' ? 0.9 : 0), side = new T.Vector3(-dir.z, 0, dir.x), at = d2 => op.clone().addScaledVector(d2, 1.5).setY(y);
      this.placeBot(x, [at(dir), at(side), at(side.clone().negate()), at(dir.clone().negate())]);
      x.facing.copy(tmp.subVectors(op, x.pos).setY(0)).normalize();
    }
    if (mine) {
      this.tip('punch', true);
      this.flash(offBall ? 'FIGHT! (far from the CORE: you BOTH go to the box)' : 'FIGHT! Knock them out.', 2, { big: true, color: '#ff4f6a', sub: this.inVR ? 'Red flash: block or dodge. Gold flash: dodge. Hit when their guard drops.' : 'X punches. Hold G to block. A or D dodges.' });
      for (const h of this.hands || []) pulse(h, 1, 200);
    }
    beepAt(180, 180, 0.12, 'square', mid); beepAt(120, 260, 0.1, 'sawtooth', mid, 0.1); noiseAt(260, 0.1, mid, [400, 1600]);
    return duel;
  },
  // by = who threw it. Takes dmg off the other one's health; no health left is a knockout.
  landHit(duel, by, dmg, opts = {}) {
    const i = duel.a === by ? 0 : 1, victim = i === 0 ? duel.b : duel.a, vi = 1 - i;
    duel.hits[i]++; duel.hp[vi] = Math.max(0, duel.hp[vi] - dmg);
    const vp = this.posOf(victim), big = dmg >= DUEL_HP * 0.1, at = vp.clone().add(new T.Vector3(0, victim === 'player' ? 0 : 1.2, 0));
    if (!opts.quiet) {
      this.bursts.fire(at, big ? '#ffd166' : '#ffffff', big ? 0.9 : 0.5); noiseAt(big ? 200 : 120, big ? 0.22 : 0.16, vp, [big ? 900 : 1800, big ? 120 : 300]); beepAt(big ? 90 : 140, big ? 160 : 90, 0.14, 'square', vp);
      if (big) beepAt(60, 220, 0.12, 'sine', vp, 0.02);
    }
    if (victim === 'player') {
      this.hurtFlash = Math.min(1.4, 0.7 + dmg / 30); for (const h of this.hands || []) pulse(h, 1, big ? 320 : 160);
      this.flash(big ? 'HEAVY HIT!' : 'HIT!', 0.7, { color: '#ff4f6a' });
    } else {
      victim.hitT = big ? 1.6 : 1;
      if (by === 'player' && !opts.quiet) this.flash([big ? 'BIG HIT!' : 'LANDED!', ...(opts.tags || [])].join('  '), 0.7, { color: opts.tags && opts.tags.length ? '#ffd166' : '#66ffff' });
    }
    if (duel.hp[vi] <= 0) this.endDuel(duel, by);
  },
  // The rival's next move against you: a jab combo, a heavy swing or a feint. Harder bots feint more and swing heavy more often.
  botAttack(duel) {
    const hard = Math.max(0, Math.min(1, (1.5 - this.level.punch) / 0.6)), r = Math.random();   // 0 rookie .. 1 legend
    if (duel.training) { duel.combo = 0; return { kind: 'jab', t: 0.7 }; }
    if (r < 0.14 + hard * 0.12) return { kind: 'feint', t: 0.3 };
    if (r < 0.4 + hard * 0.12) { duel.combo = 0; return { kind: 'heavy', t: HEAVY_WIND * (1.1 - hard * 0.2) }; }
    duel.combo = Math.floor(Math.random() * (2 + hard * 1.5));                 // this many more jabs follow
    return { kind: 'jab', t: JAB_WIND * (1.15 - hard * 0.25) };
  },
  updateFights(inp, dt, live) {
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt * 2.5);
    if (!live) return;
    this.updatePunches(inp, dt);
    // a marker who has been shadowing someone for a while may pick a fight
    if (this.fights && this.state === 'playing' && (this.fightT = (this.fightT || 8) - dt) <= 0) {
      this.fightT = 6 + Math.random() * 10;
      const b = this.matchBots.find(x => (x.role === 'mark' || x.role === 'zone') && x.markOn && this.free(x) && this.free(x.markOn) && x.markOn !== this.ball.holder && this.posOf(x.markOn).distanceTo(x.pos) < 4.5 && (this.mode === 'control' || this.ball.pos.distanceTo(x.pos) < DUEL_BALL_R));
      if (b && !(b.markOn === 'player' && this.playerGrace > 0)) this.startDuel(b, b.markOn);
    }
    for (const duel of [...this.duels]) {
      duel.t += dt;
      const { a, b, bot } = duel;
      for (const x of [a, b]) if (x !== 'player') x.vel.set(0, 0, 0);
      if (bot) {
        const me = a === 'player' ? 0 : 1;
        duel.counterT = Math.max(0, duel.counterT - dt);
        // their guard goes up and down; you hit when it is down, or straight after you block or dodge
        if (duel.guardT > 0) { if ((duel.guardT -= dt) <= 0) { duel.guardT = 0; duel.guardNext = (duel.training ? 2.6 : 0.9 + Math.random() * 0.8) * this.level.punch; } }
        else if (!duel.wind && (duel.guardNext -= dt) <= 0) duel.guardT = duel.training ? 0.7 : (1.0 + Math.random() * 0.8) / this.level.punch;
        if (!duel.wind && (duel.next -= dt) <= 0) {
          const w = this.botAttack(duel); duel.wind = { ...w, t0: w.t, head: this.headPos.clone() }; duel.guardT = 0;
          beepAt(w.kind === 'heavy' ? 300 : 520, w.kind === 'heavy' ? 420 : 110, 0.09, 'sawtooth', bot.pos);
          if (w.kind === 'heavy') for (const h of this.hands || []) pulse(h, 0.35, 300);
        }
        if (duel.wind && (duel.wind.t -= dt) <= 0) {
          const w = duel.wind, face = this.headPos.clone().addScaledVector(tmp.subVectors(bot.pos, this.headPos).setY(0).normalize(), 0.3);
          const blocked = (this.hands || []).some(h => !h.desktop && h.glove.distanceTo(face) < BLOCK_R) || (!this.inVR && !!this.keys.KeyG);
          const dodged = this.headPos.distanceTo(w.head) > DODGE_DIST || (!this.inVR && !!(this.keys.KeyA || this.keys.KeyD));
          duel.wind = null;
          const gap = this.level.punch * (duel.training ? 1.6 : 1);
          if (w.kind === 'feint') { duel.next = 0.25 + Math.random() * 0.2; duel.combo = 0; }
          else {
            bot.punchT = 0.25;
            duel.next = duel.combo > 0 ? 0.22 + Math.random() * 0.12 : gap * (0.9 + Math.random() * 0.7); if (duel.combo > 0) duel.combo--;
            if (dodged) { duel.counterT = COUNTER_TIME; duel.combo = 0; duel.next = Math.max(duel.next, 0.8); this.flash('DODGED! COUNTER NOW', 0.8, { color: '#66ffff' }); beep(990, 60, 0.07); }
            else if (blocked && w.kind === 'jab') { duel.counterT = COUNTER_TIME * 0.8; this.flash('BLOCKED! COUNTER NOW', 0.7, { color: '#66ffff' }); for (const h of this.hands || []) pulse(h, 0.7, 70); beepAt(260, 60, 0.08, 'square', bot.pos); }
            else if (blocked) { this.flash('GUARD BROKEN (dodge the gold ones)', 0.9, { color: '#ffd166' }); this.landHit(duel, bot, BOT_HEAVY * 0.5); }
            else this.landHit(duel, bot, w.kind === 'heavy' ? BOT_HEAVY : BOT_JAB * (0.85 + Math.random() * 0.3));
          }
        }
        // low on health: your heart thumps in your hands
        if (this.duels.includes(duel) && duel.hp[me] < DUEL_HP * 0.3 && (duel.beat -= dt) <= 0) { duel.beat = 0.55; beep(70, 90, 0.1, 'sine'); beep(60, 110, 0.08, 'sine', 0.14); for (const h of this.hands || []) pulse(h, 0.3, 50); }
      } else if ((duel.next -= dt) <= 0) {
        // two bots: they trade until one drops
        duel.next = 0.5 + Math.random() * 0.5;
        const by = Math.random() < 0.5 ? a : b; by.punchT = 0.25; this.landHit(duel, by, 6 + Math.random() * 12);
      }
      if (this.duels.includes(duel) && duel.t >= DUEL_TIME) this.endDuel(duel, null);
    }
  },
  // winner = who landed the knockout; null = out of time: a clear lead on health wins it, otherwise it is a split.
  endDuel(duel, winner) {
    this.duels.splice(this.duels.indexOf(duel), 1);
    const { a, b } = duel;
    for (const x of [a, b]) if (x !== 'player') x.duel = null;
    const [ha, hb] = duel.hp, ko = !!winner;
    if (!winner && Math.abs(ha - hb) >= DUEL_EDGE) winner = ha > hb ? a : b;
    const loser = winner ? (winner === a ? b : a) : null, mine = a === 'player' || b === 'player';
    if (ko) {
      const lp = this.posOf(loser).clone().add(new T.Vector3(0, loser === 'player' ? 0 : 1.2, 0));
      this.bursts.fire(lp, '#ffd166', 1.6); this.bursts.fire(lp, '#ffffff', 1.1); noiseAt(420, 0.24, lp, [1400, 80]); beepAt(70, 380, 0.16, 'sine', lp);
    }
    if (duel.offBall) {
      this.sendToBin(a, BIN_TIME); this.sendToBin(b, BIN_TIME);
      this.flash(mine ? 'OFF-BALL FIGHT: you BOTH sit in the box' : `OFF-BALL FIGHT: ${this.nameOf(a)} and ${this.nameOf(b)} to the box`, 2.2, { color: '#ff4f6a' });
    } else if (loser) {
      this.sendToBin(loser, BIN_TIME);
      if (winner === 'player') { this.stats.hits++; this.playerGrace = 1.5; this.energy = ENERGY_MAX; } else winner.grace = 1;
      const how = ko ? 'KNOCKOUT' : 'WON ON POINTS';
      this.flash(loser === 'player' ? (ko ? 'KNOCKED OUT' : 'LOST ON POINTS') : winner === 'player' ? `${how}!` : `${this.nameOf(winner)}: ${how}`, 2.4,
                 { big: mine, color: TEAM_COLOR[this.teamOf(winner)], sub: loser === 'player' ? `${BIN_TIME} s in the penalty box` : `${this.nameOf(loser)} sits for ${BIN_TIME} s` });
      if (mine) for (const h of this.hands || []) pulse(h, 1, 400);
    } else if (mine) this.flash('SPLIT: too close to call. Play on!', 1.6, { color: '#ffd166' });
    this.lastEvent = duel.offBall ? 'OFF-BALL FIGHT: both benched' : loser ? `${ko ? 'KO' : 'FIGHT'}: ${this.nameOf(loser)} in the box` : this.lastEvent;
    beep(300, 300, 0.1, 'square'); if (ko) { beep(523, 140, 0.09, 'triangle', 0.1); beep(784, 300, 0.09, 'triangle', 0.24); }
  },

  // ---------------------------------------------------------------- the penalty box
  sendToBin(x, secs) {
    const bin = WORLD.bin; if (!bin) return;
    if (this.ball.holder === x) { this.ball.holder = null; this.ball.vel.set(0, 2, 0); }
    const slot = this.binSlot = ((this.binSlot || 0) + 1) % 6, p = new T.Vector3(bin.min.x + 1.6 + (slot % 3) * ((bin.max.x - bin.min.x - 3.2) / 2), bin.min.y + 1.2 + WORLD.oy, bin.c.z + (slot < 3 ? -1.6 : 1.6));
    if (x === 'player') { this.playerBin = secs; this.placePlayer(p.x, p.y + 1.2, p.z, this.rig.rotation.y); this.blinkT = 0.3; this.charge = null; }
    else { x.bin = secs; x.pos.copy(p); x.vel.set(0, 0, 0); x.facing.set(0, 0, -HOME_SIGN[x.team]); x.path = []; }
  },
  updateBin(dt) {
    const home = team => this.forTeam(team, WORLD.level.spawn.c);
    for (const b of this.matchBots) if (b.bin > 0 && (b.bin -= dt) <= 0) { b.bin = 0; b.pos.copy(home(b.team)).add(new T.Vector3((b.idx % 3 - 1) * 2, -0.9, 0)); b.grace = 1; if (b.team === 'blue') this.flash(`${b.label} is back in`, 0.9); }
    if (this.playerBin > 0 && (this.playerBin -= dt) <= 0) {
      this.playerBin = 0; const h = home('blue'); this.placePlayer(h.x, h.y, h.z, 0); this.blinkT = 0.3; this.playerGrace = 1.5;
      this.flash('BACK IN!', 1.2, { big: true, color: '#66ffff' }); beep(660, 120, 0.1); beep(990, 160, 0.1, 'sine', 0.1);
    }
  }
};
