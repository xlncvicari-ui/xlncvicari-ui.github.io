// Combat (version 3, 2026-11-18). Every rider has health. Punches (swing a glove into a rival), fast tackles, dodgeball hits and
// realm blasts hurt and knock riders back. At zero health a rider is WIPED OUT: they drop the disc, vanish in a burst and come
// back at their own end a few seconds later with a short shield. In SKY BRAWL every wipeout is a point.
const HP_MAX = 100, HP_REGEN = 7, HP_REGEN_DELAY = 4;
const WIPE_TIME = 3, WIPE_TIME_PLAYER = 2.5, SPAWN_GRACE = 2;
const PUNCH_R = 1.2, PUNCH_SPEED = 2.0, PUNCH_FULL = 5, PUNCH_COOL = 0.45, PUNCH_DMG = [20, 42], PUNCH_PUSH = 12;
const TACKLE_DMG = 3.4, TACKLE_SELF = 0.25, BUMP_COOL = 0.6;
const BOT_PUNCH_R = 1.9, BOT_PUNCH_DMG = 14, BOT_PUNCH_RATE = [0.5, 1.1, 1.8]; // punches a second when a rival is in reach, per level
const DODGE_DMG = 28, BLAST_DMG = 18;

const COMBAT = {
  initCombat() {
    this.hp = HP_MAX; this.hpIdle = 0; this.playerOut = 0; this.playerShield = 0; this.hurtFlash = 0; this.bumpCool = 0;
    this.punchCool = { left: 0, right: 0 };
    for (const b of this.bots) {
      Object.assign(b, { hp: HP_MAX, hpIdle: 0, out: 0, shieldT: 0, punchCool: 1 + Math.random(), bumpCool: 0, punchT: 0 });
      if (!b.hpBar) b.hpBar = this.buildHpBar(b);
      b.obj.visible = this.matchBots.includes(b); b.trail.visible = b.obj.visible;
    }
  },

  // Health bar over a bot's head: a dark back and a colored fill that shrinks (two tiny sprites).
  buildHpBar(b) {
    const mk = (color, op) => { const s = new T.Sprite(new T.SpriteMaterial({ color, transparent: true, opacity: op, depthWrite: false, fog: false, toneMapped: false })); s.center.set(0, 0.5); b.obj.add(s); return s; };
    const back = mk('#000000', 0.5), fill = mk('#66ff99', 0.95);
    back.scale.set(1.0, 0.09, 1); back.position.set(-0.5, 1.77, 0);
    fill.scale.set(1.0, 0.07, 1); fill.position.set(-0.5, 1.77, 0.001);
    return { back, fill };
  },

  hpOf(h) { return h === 'player' ? this.hp : h.hp; },
  isOut(h) { return h === 'player' ? this.playerOut > 0 : h.out > 0; },
  shielded(h) { return (h === 'player' ? this.playerShield > 0 : h.shieldT > 0) || this.isOut(h); },
  nameOf(h) { return h === 'player' ? 'YOU' : h.label; },

  // Hurt a rider. push = knockback velocity (or null). Returns true if it wiped them out.
  damage(target, amount, from, push, cause) {
    if (!this.live || this.shielded(target)) return false;
    if (from && this.teamOf(from) === this.teamOf(target)) return false;
    if (this.buffIs(target, 'shield')) amount *= 0.3;
    if (target === 'player') {
      this.hp -= amount; this.hpIdle = 0;
      if (push) this.vel.add(push);
      this.playerStun = Math.max(this.playerStun, Math.min(0.6, amount / 60));
      this.hurtFlash = Math.min(1, this.hurtFlash + amount / 45 + 0.2);
      for (const h of this.hands || []) pulse(h, Math.min(1, 0.4 + amount / 50), 90 + amount * 3);
      beep(90, 160, 0.14, 'square');
    } else {
      target.hp -= amount; target.hpIdle = 0; target.hitT = 1;
      if (push) target.vel.add(push);
      target.stun = Math.max(target.stun, Math.min(0.9, amount / 45));
      if (from === 'player') { beep(1200, 50, 0.07, 'square'); beep(700, 70, 0.06, 'triangle', 0.03); this.stats.hits++; }
    }
    // Knocked hard while carrying: the disc flies loose.
    if (this.disc.holder === target && amount >= 18) this.dropDisc(target);
    const pos = this.posOf(target);
    noiseAt(160, Math.min(0.2, 0.06 + amount / 300), pos, [2200, 400]);
    if (this.hpOf(target) <= 0) { this.wipeOut(target, from, cause); return true; }
    return false;
  },

  wipeOut(t, from, cause) {
    const pos = this.posOf(t).clone(), team = this.teamOf(t);
    if (this.disc.holder === t) this.dropDisc(t);
    this.startBurst(pos, TEAM_COLOR[team], 2);
    noiseAt(900, 0.22, pos, [1800, 90], 0.5); beepAt(60, 700, 0.14, 'sawtooth', pos);
    if (this.mode.koPoints) { const scorer = OTHER[team]; this.score[scorer] += this.mode.koPoints * this.pointsMul(); this.scoreShowT = 2.5; }
    if (from === 'player') { this.stats.kos = (this.stats.kos || 0) + 1; this.flash(`WIPEOUT!  ${this.nameOf(t)}`, 1.6, { big: true, color: '#66ffff' }); for (const h of this.hands || []) pulse(h, 1, 260); }
    else if (t !== 'player' && from) this.flash(`${this.nameOf(from)} WIPED OUT ${this.nameOf(t)}`, 1.4, { color: TEAM_COLOR[this.teamOf(from)] });
    if (t === 'player') {
      this.playerOut = WIPE_TIME_PLAYER; this.hp = 0; this.vel.set(0, 0, 0);
      this.anchors.left = this.anchors.right = null;
      this.flash(`WIPED OUT${from ? ' BY ' + this.nameOf(from) : ''}\nBack in a moment...`, WIPE_TIME_PLAYER, { big: true, color: '#ff7a5a' });
    } else {
      t.out = WIPE_TIME; t.hp = 0; t.vel.set(0, 0, 0);
      t.obj.visible = false; t.trail.visible = false;
    }
  },

  respawnPlayer() {
    this.rig.position.set(0, 14 - 1.3, OWN_Z.blue * 0.8);
    this.rig.rotation.set(0, 0, 0);
    this.steerDir = null; this.levelT = 0; this.turnEase = 0;
    this.vel.set(0, 0, 0); this.hp = HP_MAX; this.playerShield = SPAWN_GRACE; this.playerStun = 0;
    this.energy = ENERGY_MAX; this.flash('BACK IN!', 1, { color: '#66ffff' }); beep(660, 160, 0.08, 'triangle');
  },
  respawnBot(b) {
    b.pos.copy(b.start); b.vel.set(0, 0, 0); b.hp = HP_MAX; b.shieldT = SPAWN_GRACE; b.stun = 0; b.out = 0;
    b.facing.set(0, 0, b.team === 'blue' ? -1 : 1); b.trailInit = false;
    b.obj.visible = true; b.trail.visible = true;
  },

  updateCombat(inp, dt, live) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    this.bumpCool = Math.max(0, this.bumpCool - dt);
    if (!live) return;
    // Player: regenerate, count down a wipeout, respawn.
    this.playerShield = Math.max(0, this.playerShield - dt);
    if (this.playerOut > 0) {
      this.vel.set(0, 0, 0); this.playerStun = Math.max(this.playerStun, 0.2);
      if ((this.playerOut -= dt) <= 0) { this.playerOut = 0; this.respawnPlayer(); }
    } else if ((this.hpIdle += dt) > HP_REGEN_DELAY) this.hp = Math.min(HP_MAX, this.hp + HP_REGEN * dt);
    for (const s of ['left', 'right']) this.punchCool[s] = Math.max(0, this.punchCool[s] - dt);
    // Bots: regenerate, respawn, health bars.
    for (const b of this.matchBots) {
      b.shieldT = Math.max(0, b.shieldT - dt); b.bumpCool = Math.max(0, b.bumpCool - dt); b.punchT = Math.max(0, b.punchT - dt);
      if (b.out > 0) { if ((b.out -= dt) <= 0) this.respawnBot(b); continue; }
      if ((b.hpIdle += dt) > HP_REGEN_DELAY) b.hp = Math.min(HP_MAX, b.hp + HP_REGEN * dt);
      const f = Math.max(0, b.hp / HP_MAX), bar = b.hpBar;
      bar.fill.scale.x = Math.max(0.001, f);
      bar.fill.material.color.set(b.shieldT > 0 ? '#ffffff' : f > 0.6 ? '#66ff99' : f > 0.3 ? '#ffd166' : '#ff5a4a');
      const show = f < 0.999 || b.shieldT > 0;
      bar.fill.visible = bar.back.visible = show;
    }
    this.playerPunches(inp);
    this.botPunches(dt);
  },

  // Punch: swing a glove fast into a rival. Faster swings hit harder and knock them further.
  playerPunches(inp) {
    if (this.playerOut > 0) return;
    for (const h of inp.hands) {
      if (h.desktop) {
        if (!this.keys.KeyV || this.punchCool.right > 0) continue;
        const target = this.liveRivals('player').find(b => { const to = tmp2.subVectors(b.pos, this.headPos); return to.length() < 3.2 && to.normalize().dot(this.headFwd) > 0.5; });
        if (target) this.landPunch(target, h, this.headFwd.clone(), 3.5);
        this.punchCool.right = PUNCH_COOL;
        continue;
      }
      if (this.punchCool[h.side] > 0 || h.realSpeed < PUNCH_SPEED) continue;
      if (this.disc.holder === 'player' && this.disc.hand === h.side) continue;
      const reach = PUNCH_R * (this.mittOn('player') ? 1.8 : 1);
      for (const b of this.liveRivals('player')) {
        const body = tmp.copy(b.pos).add(tmp3.set(0, 0.35, 0));
        if (h.glove.distanceTo(body) > reach + BOT_R * 0.5) continue;
        const dir = h.gloveVel.lengthSq() > 1 ? h.gloveVel.clone().normalize() : body.clone().sub(h.glove).normalize();
        this.landPunch(b, h, dir, h.realSpeed);
        break;
      }
    }
  },
  landPunch(b, h, dir, speed) {
    const k = Math.min(1, Math.max(0, (speed - PUNCH_SPEED) / (PUNCH_FULL - PUNCH_SPEED)));
    const dmg = PUNCH_DMG[0] + (PUNCH_DMG[1] - PUNCH_DMG[0]) * k;
    this.punchCool[h.side] = PUNCH_COOL;
    pulse(h, 0.6 + k * 0.4, 70 + k * 80);
    this.startBurst(b.pos.clone().add(new T.Vector3(0, 0.6, 0)), '#ffffff', 0.6 + k * 0.6);
    this.damage(b, dmg, 'player', dir.clone().multiplyScalar(PUNCH_PUSH * (0.6 + k * 0.6)).add(new T.Vector3(0, 2, 0)), 'punch');
  },
  liveRivals(who) { return this.activeBots.filter(b => b.team !== this.teamOf(who) && !(b.out > 0)); },

  // Bots throw punches at rivals in reach (more often on harder levels), with a quick lunge.
  botPunches(dt) {
    const rate = BOT_PUNCH_RATE[Math.max(0, LEVELS.indexOf(this.level))] || 1;
    for (const b of this.activeBots) {
      if (b.out > 0 || b.stun > 0) continue;
      b.punchCool = Math.max(0, b.punchCool - dt);
      if (b.punchCool > 0) continue;
      let target = null, best = BOT_PUNCH_R;
      for (const e of this.agents()) {
        if (this.teamOf(e) === b.team || this.isOut(e) || this.shielded(e)) continue;
        const dist = this.posOf(e).distanceTo(b.pos);
        if (dist < best) { best = dist; target = e; }
      }
      if (!target || Math.random() > rate * dt * 4) continue;
      const dir = tmp2.subVectors(this.posOf(target), b.pos).normalize().clone();
      b.punchCool = 0.9 + Math.random() * 0.8; b.punchT = 0.25;
      b.vel.addScaledVector(dir, 4);
      this.damage(target, BOT_PUNCH_DMG * (0.8 + this.level.accel * 0.2), b, dir.multiplyScalar(8).add(new T.Vector3(0, 1.5, 0)), 'punch');
    }
  },

  // A hard collision between rivals hurts the one that got hit (and the hitter a little).
  bumpDamage(a, b, closing) {
    if (closing < TACKLE_SPEED || this.teamOf(a.who) === this.teamOf(b.who)) return;
    const cool = w => w === 'player' ? this.bumpCool : w.bumpCool, setCool = w => { if (w === 'player') this.bumpCool = BUMP_COOL; else w.bumpCool = BUMP_COOL; };
    if (cool(a.who) > 0 || cool(b.who) > 0) return;
    setCool(a.who); setCool(b.who);
    // The faster rider is the hitter.
    const [hitter, victim] = a.vel.length() >= b.vel.length() ? [a, b] : [b, a];
    const dmg = (closing - TACKLE_SPEED + 4) * TACKLE_DMG, dir = tmp2.subVectors(victim.pos, hitter.pos).normalize().clone();
    this.damage(victim.who, dmg, hitter.who, dir.multiplyScalar(6 + closing * 0.4), 'tackle');
    this.damage(hitter.who, dmg * TACKLE_SELF, null, null, 'tackle');
    if (hitter.who === 'player' || victim.who === 'player') for (const h of this.hands || []) pulse(h, 1, 140);
  }
};
