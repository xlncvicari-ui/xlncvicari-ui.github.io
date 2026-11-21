// Version 5 contact: RUCKS, FIGHTS and the PENALTY BOX. Mixed into the game component.
//
// RUCK   Fly into the rider carrying the core and the two of you lock up. Everyone within RUCK_PULL_R is drawn in and binds on
//        (up to RUCK_MAX a side), so the team that stays together is stronger. Your strength is how many triggers and grips you
//        are squeezing (0 to 4). If your side doesn't have the core, fluttering the triggers strips it faster. The carrier can
//        offload (B) to a teammate outside the ruck. Nobody can snatch the core out of a ruck from the side: join it and out-pull it.
// FIGHT  Land a punch (grip held, fast swing) on a rival who isn't carrying and you duel: first to DUEL_HITS. Block with a glove in front of your face,
//        or duck. The loser sits in the penalty box for BIN_TIME. Start it with the core nowhere near and BOTH of you go.
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
  updatePunches(inp, dt) {
    if (!(this.fights || this.state === 'training') || !this.free('player') && !this.inDuel('player')) return;
    this.punchCool = Math.max(0, (this.punchCool || 0) - dt);
    if (this.punchCool > 0) return;
    let target = null;
    for (const h of inp.hands) {
      if (h.desktop) { if (!inp.punch) continue; } else if (!h.grip || h.realSpeed < PUNCH_SPEED) continue;
      for (const b of this.matchBots) {
        if (b.team === 'blue' || b.bin > 0 || b.ruck) continue;
        const chest = b.pos.clone().add(new T.Vector3(0, 1.0, 0));
        if (h.glove.distanceTo(chest) < (h.desktop ? 2.4 : 0.95) && this.bodyPos().distanceTo(chest) < PUNCH_R + 1.2) { target = b; pulse(h, 1, 90); break; }
      }
      if (target) break;
    }
    if (!target) return;
    this.punchCool = 0.38;
    if (this.ball.holder === target && !this.ruck && !this.inDuel('player')) return this.startRuck('player', target, false);
    let duel = this.duels.find(d => (d.a === 'player' && d.b === target) || (d.b === 'player' && d.a === target));
    if (!duel) { if (this.inDuel('player') || this.inDuel(target) || !this.free('player')) return; duel = this.startDuel('player', target); }
    // a ready bot gets a glove up now and then
    if (Math.random() < 0.12 + (2 - this.level.punch) * 0.12) { this.flash('BLOCKED', 0.5); beepAt(240, 60, 0.06, 'square', target.pos); return; }
    this.landHit(duel, 'player');
  },
  startDuel(a, b) {
    const pa = this.posOf(a), pb = this.posOf(b), mid = pa.clone().lerp(pb, 0.5);
    const offBall = this.ball.pos.distanceTo(mid) > DUEL_BALL_R;
    const duel = { a, b, t: 0, hits: [0, 0], offBall, next: 0.9 + Math.random() * 0.5, wind: null, at: mid };
    this.duels.push(duel);
    for (const x of [a, b]) if (x === 'player') this.vel.set(0, 0, 0); else { x.duel = duel; x.vel.set(0, 0, 0); x.path = []; }
    // square up: the bot faces its rival about an arm's length away
    for (const [x, o] of [[a, b], [b, a]]) if (x !== 'player') {
      const op = this.posOf(o), dir = x.pos.clone().sub(op); dir.y = 0; if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize();
      const y = op.y - (o === 'player' ? 0.9 : 0), side = new T.Vector3(-dir.z, 0, dir.x), at = d2 => op.clone().addScaledVector(d2, 1.5).setY(y);
      this.placeBot(x, [at(dir), at(side), at(side.clone().negate()), at(dir.clone().negate())]);
      x.facing.copy(tmp.subVectors(op, x.pos).setY(0)).normalize();
    }
    const mine = a === 'player' || b === 'player';
    if (mine) { this.tip('punch', true); this.flash(offBall ? 'FIGHT! (far from the CORE: you BOTH go to the box)' : `FIGHT! First to ${DUEL_HITS}. Block with a glove, or duck.`, 2.2, { big: false, color: '#ff4f6a' }); for (const h of this.hands || []) pulse(h, 0.8, 120); }
    beepAt(180, 180, 0.12, 'square', mid); beepAt(120, 260, 0.1, 'sawtooth', mid, 0.1);
    return duel;
  },
  landHit(duel, by) {
    const i = duel.a === by ? 0 : 1, victim = i === 0 ? duel.b : duel.a;
    duel.hits[i]++;
    const vp = this.posOf(victim);
    this.bursts.fire(vp.clone().add(new T.Vector3(0, victim === 'player' ? 0 : 1.2, 0)), '#ffffff', 0.5); noiseAt(120, 0.16, vp, [1800, 300]); beepAt(140, 90, 0.12, 'square', vp);
    if (victim === 'player') { this.hurtFlash = 1; for (const h of this.hands || []) pulse(h, 1, 180); this.flash(`HIT! ${duel.hits[duel.a === 'player' ? 0 : 1]} : ${duel.hits[duel.a === 'player' ? 1 : 0]}`, 0.8, { color: '#ff4f6a' }); }
    else { victim.hitT = 1; if (by === 'player') this.flash(`LANDED! ${duel.hits[duel.a === 'player' ? 0 : 1]} : ${duel.hits[duel.a === 'player' ? 1 : 0]}`, 0.8, { color: '#66ffff' }); }
    if (duel.hits[i] >= DUEL_HITS) this.endDuel(duel);
  },
  updateFights(inp, dt, live) {
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt * 2.5);
    if (!live) return;
    this.updatePunches(inp, dt);
    // a marker who has been shadowing someone for a while may pick a fight
    if (this.fights && (this.fightT = (this.fightT || 8) - dt) <= 0) {
      this.fightT = 6 + Math.random() * 10;
      const b = this.matchBots.find(x => x.role === 'mark' && x.markOn && this.free(x) && this.free(x.markOn) && x.markOn !== this.ball.holder && this.posOf(x.markOn).distanceTo(x.pos) < 4.5 && this.ball.pos.distanceTo(x.pos) < DUEL_BALL_R);
      if (b && !(b.markOn === 'player' && this.playerGrace > 0)) this.startDuel(b, b.markOn);
    }
    for (const duel of [...this.duels]) {
      duel.t += dt;
      const { a, b } = duel, mine = a === 'player' || b === 'player';
      for (const x of [a, b]) if (x !== 'player') x.vel.set(0, 0, 0);
      if (mine) {
        const bot = a === 'player' ? b : a;
        // the bot winds up (arm back, a growl), then throws: block with a glove in front of your face, or move your head
        if (!duel.wind && (duel.next -= dt) <= 0) { duel.wind = { t: 0.5, head: this.headPos.clone() }; beepAt(520, 110, 0.08, 'sawtooth', bot.pos); }
        if (duel.wind && (duel.wind.t -= dt) <= 0) {
          const face = this.headPos.clone().addScaledVector(tmp.subVectors(bot.pos, this.headPos).setY(0).normalize(), 0.3);
          const blocked = (this.hands || []).some(h => !h.desktop && h.glove.distanceTo(face) < 0.42) || (!this.inVR && this.keys.KeyG);
          const dodged = this.headPos.distanceTo(duel.wind.head) > 0.26;
          duel.wind = null; duel.next = this.level.punch * (0.8 + Math.random() * 0.6); bot.punchT = 0.25;
          if (blocked) { this.flash('BLOCKED IT', 0.6, { color: '#66ffff' }); for (const h of this.hands || []) pulse(h, 0.6, 60); beepAt(260, 60, 0.07, 'square', bot.pos); }
          else if (dodged) { this.flash('DODGED', 0.6, { color: '#66ffff' }); }
          else this.landHit(duel, bot);
        }
      } else if ((duel.next -= dt) <= 0) { duel.next = 0.7; this.landHit(duel, Math.random() < 0.5 ? a : b); }
      if (this.duels.includes(duel) && duel.t >= DUEL_TIME) this.endDuel(duel);
    }
  },
  endDuel(duel) {
    this.duels.splice(this.duels.indexOf(duel), 1);
    const { a, b } = duel;
    for (const x of [a, b]) if (x !== 'player') x.duel = null;
    const [ha, hb] = duel.hits, loser = ha === hb ? null : ha > hb ? b : a, winner = loser === a ? b : loser === b ? a : null;
    const mine = a === 'player' || b === 'player';
    if (duel.offBall) {
      this.sendToBin(a, BIN_TIME); this.sendToBin(b, BIN_TIME);
      this.flash(mine ? 'OFF-BALL FIGHT: you BOTH sit in the box' : `OFF-BALL FIGHT: ${this.nameOf(a)} and ${this.nameOf(b)} to the box`, 2.2, { color: '#ff4f6a' });
    } else if (loser) {
      this.sendToBin(loser, BIN_TIME);
      if (winner === 'player') { this.stats.hits++; this.playerGrace = 1; } else winner.grace = 1;
      this.flash(loser === 'player' ? `YOU LOST THE FIGHT: ${BIN_TIME} s in the box` : `${this.nameOf(winner)} WON THE FIGHT: ${this.nameOf(loser)} sits for ${BIN_TIME} s`, 2.2, { big: mine, color: TEAM_COLOR[this.teamOf(winner)] });
    } else if (mine) this.flash('FIGHT OVER: nobody landed enough', 1.2);
    this.lastEvent = duel.offBall ? 'OFF-BALL FIGHT: both benched' : loser ? `${this.nameOf(loser)} in the box` : this.lastEvent;
    beep(300, 300, 0.1, 'square');
  },

  // ---------------------------------------------------------------- the penalty box
  sendToBin(x, secs) {
    const bin = WORLD.bin; if (!bin) return;
    if (this.ball.holder === x) { this.ball.holder = null; this.ball.vel.set(0, 2, 0); }
    const slot = this.binSlot = ((this.binSlot || 0) + 1) % 6, p = new T.Vector3(bin.min.x + 1.6 + (slot % 3) * ((bin.max.x - bin.min.x - 3.2) / 2), bin.min.y + 1.2, bin.c.z + (slot < 3 ? -1.6 : 1.6));
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
