// Surge League version 5. One A-Frame component runs the menus, the match, the bots and the level.
// The rules in one breath: 8 vs 8 in zero gravity. Get the CORE into the other team's goals (lobby holes 1, deep goal 3, bank
// shot +1, long shot +1). First to the target wins, or most points when the clock runs out. Grab the CORE out of a rival's
// hands, or fly into them to start a RUCK and out-squeeze them. Punch a rival who isn't carrying to start a FIGHT: the loser
// sits in the penalty box. The windows are open: space is part of the field.
AFRAME.registerComponent('surge-game', {
  ...TEAMAI, ...BRAWL, ...CONTROL, ...TRAIN5,
  init() { this.ready = false; if (this.el.hasLoaded) this.setup(); else this.el.addEventListener('loaded', () => this.setup()); },

  setup() {
    const $ = id => document.getElementById(id);
    this.$ = $; this.rig = $('rig').object3D; this.headEl = $('head');
    this.gloveEls = { left: $('gloveL'), right: $('gloveR') };
    this.ball = { pos: new T.Vector3(), vel: new T.Vector3(), holder: null, hand: null, pulledBy: null, snapping: false, passTo: null, passT: 0,
                  lastThrower: null, noCatch: 0, throwT: -99, bankT: -99, throwFrom: new T.Vector3(), spin: 0 };
    this.vel = new T.Vector3(); this.headPos = new T.Vector3(); this.headFwd = new T.Vector3(0, 0, -1);
    this.prevButtons = {}; this.keys = {};
    this.track = { left: { real: [], glove: [], tv: 0 }, right: { real: [], glove: [], tv: 0 } };
    this.save = Profiles.init(loadSave());
    // 2026-11-21: the briefing, the pilot license and the coaching tips belong to each PLAYER now. They used to be saved once per
    // headset, so the second person to play never got the briefing or the tips. Everyone starts fresh (training takes 3 minutes).
    if (!this.save.pilots5) { this.save.pilots5 = 1; for (const p of this.save.profiles) p.v5 = { briefed: false, licensed: false, tips: [] }; delete this.save.briefed5; delete this.save.tips5; delete this.save.licensed; writeSave(this.save); }
    this.flight = FLIGHT_MODES.includes(this.save.flight) ? this.save.flight : 'hands';
    this.level = LEVELS[Math.min(LEVELS.length - 1, this.save.level === undefined ? 1 : this.save.level)];
    this.matchCfg = MATCHES[Math.min(MATCHES.length - 1, this.save.match5 === undefined ? 1 : this.save.match5)];
    // two game modes, each with its own levels and its own remembered pick
    this.mode = this.save.mode5 === 'control' ? 'control' : 'rugby';
    this.picks = { rugby: this.save.level5 || 'meridian', control: this.save.levelC || 'gardens' };
    this.levelPick = this.picks[this.mode]; this.levelScroll = 0; this.zones = [];
    this.fights = this.save.fights !== false;
    this.easy = this.save.reach !== 'full';
    Object.assign(this, { snapArmed: true, pingT: 0, msg: '', msgT: 0, time: 0, tipGap: 0, sightT: 0, energy: ENERGY_MAX, energyIdle: 0, boostT: 0, boostCool: 0, dashT: 0, dashCool: 0,
                          impactFlash: 0, accelMag: 0, vig: 0, playerStun: 0, playerGrace: 0, lastEvent: '', callT: 0, flutter: 0, gripsHeld: 0, playerBin: 0, hurtFlash: 0,
                          buff: { blue: 0, orange: 0 }, duels: [], ruck: null, shards: [], shardT: 4, kickN: Math.floor(Math.random() * 12), charge: null });
    addEventListener('keydown', e => { if (['Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); this.keys[e.code] = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.el.addEventListener('enter-vr', () => {
      const session = this.el.renderer.xr.getSession();
      if (session) session.addEventListener('visibilitychange', () => { this.paused = session.visibilityState === 'hidden'; if (this.paused) this.openPause(); });
      this.calibrateT = 1.2;
    });
    this.el.addEventListener('exit-vr', () => { this.paused = false; this.setCockpit(0); this.menuSeenVR = false; });
    if (window.SURGE_GRADE) this.el.renderer.toneMapping = T.CustomToneMapping;
    this.buildBall(); this.buildFx(); this.buildBots(); this.buildPlayerRide(); this.buildMirror(); this.buildPanels();
    this.score = { blue: 0, orange: 0 }; this.matchBots = this.bots; this.state = 'ready'; this.timeLeft = this.matchCfg.secs; this.stats = this.freshStats();
    this.enterLevel(this.pickedLevel() || this.modeLevels()[0]);
    this.resetToMenu(); this.showPick();
    this.ready = true;
  },
  freshStats() { return { goals: 0, deep: 0, tricks: 0, steals: 0, passes: 0, hits: 0, fouls: 0, comet: 0 }; },
  add(tag, attrs, parent = this.el) { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; },

  // ---------------------------------------------------------------- levels
  enterLevel(level) {
    const scene = this.el.object3D, renderer = this.el.renderer;
    if (this.world) {
      // leaving a level: free its meshes and the pictures painted just for it (the shared ones stay)
      const keep = new Set([...Object.values(WTEX), glowTexture(), dotTexture(), shardTexture(), toonGradient()]);
      for (const g of [this.world.meshes.root, this.world.back.group]) {
        scene.remove(g);
        g.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) { if (m.map && !keep.has(m.map)) m.map.dispose(); m.dispose(); } });
      }
      if (scene.environment) scene.environment.dispose();
    }
    for (const s of this.shards) scene.remove(s.obj); this.shards = [];
    loadLevel(level);
    const back = buildBackdrop(scene, level), env = envFromSky(renderer, back.envTex || back.skyTex);
    scene.environment = env; scene.environmentIntensity = level.theme.shiny ? 1 : 0.5;
    const meshes = buildLevelMeshes(scene, env), th = level.theme;
    scene.fog = th.fog ? new T.FogExp2(th.fog[0], th.fog[1]) : null; scene.background = new T.Color(th.fog ? th.fog[0] : '#02040a');
    const hemi = this.$('hemi').getObject3D('light'), sun = this.$('sun').getObject3D('light');
    if (hemi) { hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2]; }
    if (sun) { sun.color.set(th.sun[0]); sun.intensity = th.sun[1]; sun.position.set(...th.sun[2]).multiplyScalar(600); }
    this.world = { level, meshes, back }; this.lvl = level;
    this.ruck = null; this.duels = []; this.playerBin = 0;
    this.buildZones(level);
  },
  modeLevels() { return LEVELS5.filter(l => l.mode === this.mode); },
  pickedLevel() { return this.levelPick === 'shuffle' ? null : this.modeLevels().find(l => l.id === this.levelPick) || null; },
  winScore() { return this.mode === 'control' ? this.controlTarget() : this.matchCfg.target; },
  matchLabel() { return this.mode === 'control' ? `${Math.round(this.matchCfg.secs / 60)} MIN · FIRST TO ${this.controlTarget()}` : this.matchCfg.label; },
  // The level row on the menu shows four cards at a time: slide it so the picked one is on screen.
  showPick() { const ids = [...this.modeLevels().map(l => l.id), 'shuffle'], i = Math.max(0, ids.indexOf(this.levelPick)); this.levelScroll = Math.max(0, Math.min(ids.length - 4, Math.max(i - 3, Math.min(this.levelScroll, i)))); },
  // A level that repeats forever up and down: keep the goals and the bots' route points on the copy the core is in.
  followWorld(reset) {
    if (!WORLD.loop) return;
    const was = WORLD.oy;
    if (!worldFollow(reset ? this.lvl.ball[1] : this.ball.pos.y)) return;
    for (const b of this.bots) b.path = [];
    for (const t of ['blue', 'orange']) if (this.brains && this.brains[t]) { this.brains[t].route = null; this.brains[t].decoyRoute = null; }
    if (reset) { const dy = WORLD.oy - was; for (const b of this.bots) if (b.bin > 0) b.pos.y += dy; if (this.playerBin > 0) this.rig.position.y += dy; }
  },
  sightDist() { const s = this.world.meshes.sight.position, P = WORLD.loop; let dy = this.headPos.y - s.y; if (P) dy -= P * Math.round(dy / P); return Math.hypot(this.headPos.x - s.x, dy, this.headPos.z - s.z); },
  // The Backrooms hum: quiet mains tones for as long as you are on that level.
  updateHum() {
    const want = !!this.lvl.theme.hum && !this.paused;
    if (want && !this.hum && audioCtx && audioCtx.state === 'running') {
      const out = audioCtx.createGain(); out.gain.value = 0.016; out.connect(audioCtx.destination);
      const os = [60, 120, 180.5].map((f, i) => { const o = audioCtx.createOscillator(), og = audioCtx.createGain(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.value = f; og.gain.value = i ? 0.5 : 0.22; o.connect(og).connect(out); o.start(); return o; });
      this.hum = { out, os };
    } else if (!want && this.hum) { for (const o of this.hum.os) { try { o.stop(); } catch (e) {} } this.hum.out.disconnect(); this.hum = null; }
  },
  nextLevel() { const list = this.modeLevels(), others = list.filter(l => l !== this.lvl); return this.pickedLevel() || others[Math.floor(Math.random() * others.length)] || list[0]; },

  // ---------------------------------------------------------------- world bits
  buildBall() {
    const g = new T.Group();
    this.ballMat = new T.MeshToonMaterial({ color: '#f4feff', emissive: '#66ffff', emissiveIntensity: 0.9, gradientMap: toonGradient() });
    g.add(new T.Mesh(new T.SphereGeometry(BALL_R, 24, 16), this.ballMat));
    this.ballRingMat = new T.MeshBasicMaterial({ color: '#66ffff', toneMapped: false });
    this.ballRings = [0, 1].map(i => { const m = new T.Mesh(new T.TorusGeometry(BALL_R * 1.35, 0.022, 6, 40), this.ballRingMat); m.rotation.set(i ? Math.PI / 2 : 0.4, i ? 0.4 : 0, 0); g.add(m); return m; });
    this.ballGlow = glowSprite('#9ff6ff', 2.2, 0.5); g.add(this.ballGlow);
    // always on, seen through every wall: where the core is
    this.ballMark = glowSprite('#ffffff', 1.6, 0.55); this.ballMark.material.depthTest = false; this.ballMark.renderOrder = 951; g.add(this.ballMark);
    this.chargeRing = new T.Mesh(new T.TorusGeometry(0.42, 0.03, 6, 40), new T.MeshBasicMaterial({ color: '#ffd166', toneMapped: false })); this.chargeRing.visible = false; g.add(this.chargeRing);
    this.ballObj = g; this.el.object3D.add(g);
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(new Float32Array(18 * 3), 3));
    this.trail = new T.Line(tg, new T.LineBasicMaterial({ color: '#9ff6ff', transparent: true, opacity: 0.6 })); this.trail.frustumCulled = false; this.el.object3D.add(this.trail);
  },
  buildPlayerRide() {
    const host = this.$('ride').object3D;
    if (this.rideObj) host.remove(this.rideObj);
    this.rideObj = buildRide('gym', this.pilot().licensed ? '#ffd166' : TEAM_COLOR.blue);
    this.rideObj.position.y = 0.095; this.rideObj.rotation.y = Math.PI; this.rideObj.scale.setScalar(1.05);
    host.add(this.rideObj);
  },
  buildFx() {
    const scene = this.el.object3D;
    this.bursts = makeBurstPool(scene, 6, 40);
    this.makeBeam = (color, opacity, radius) => { const geo = new T.CylinderGeometry(radius, radius, 1, 6); geo.translate(0, 0.5, 0); const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false })); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
    this.beams = { pull: this.makeBeam(0x8ff7ff, 0.8, 0.015), armL: this.makeBeam(0x66ffff, 0.5, 0.03), armR: this.makeBeam(0x66ffff, 0.5, 0.03), aimL: this.makeBeam(0xffffff, 0.22, 0.006), aimR: this.makeBeam(0xffffff, 0.22, 0.006) };
    this.steerMark = new T.Mesh(new T.RingGeometry(0.2, 0.26, 32), new T.MeshBasicMaterial({ color: '#66ffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.steerMark.visible = false; scene.add(this.steerMark);
    const g = new T.ConeGeometry(0.045, 0.15, 8); g.rotateX(Math.PI / 2);
    this.ballArrow = new T.Mesh(g, new T.MeshBasicMaterial({ toneMapped: false })); this.ballArrow.visible = false; this.rig.add(this.ballArrow);
    this.target = new T.Group();
    this.target.add(new T.Mesh(new T.TorusGeometry(1.8, 0.09, 8, 48), new T.MeshBasicMaterial({ color: '#ffd166', toneMapped: false })), glowSprite('#ffd166', 4, 0.35));
    this.target.visible = false; scene.add(this.target);
    // lines from every rider bound into a ruck to its middle
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(16 * 3), 3)); lg.setAttribute('color', new T.BufferAttribute(new Float32Array(16 * 3), 3));
    this.links = new T.LineSegments(lg, new T.LineBasicMaterial({ vertexColors: true, toneMapped: false })); this.links.frustumCulled = false; this.links.visible = false; scene.add(this.links);
    this.ruckGlow = glowSprite('#ffd166', 5, 0.5); this.ruckGlow.visible = false; scene.add(this.ruckGlow);
    this.callMark = glowSprite('#66ffff', 0.9, 0.9); this.callMark.visible = false; this.rig.add(this.callMark);
  },
  // Rear view: hold the right stick down and a small mirror shows what is behind you (drawn only while you hold it).
  buildMirror() {
    const rt = new T.WebGLRenderTarget(512, 256, { depthBuffer: true });
    const cam = new T.PerspectiveCamera(95, 2, 0.1, 3000);
    const mesh = new T.Mesh(new T.PlaneGeometry(0.56, 0.28), new T.MeshBasicMaterial({ map: rt.texture, toneMapped: false, depthTest: false, depthWrite: false, fog: false }));
    mesh.scale.x = -1; mesh.material.side = T.DoubleSide; mesh.position.set(0, 0.24, -0.8); mesh.renderOrder = 990; mesh.visible = false;
    const frame = new T.Mesh(new T.PlaneGeometry(0.6, 0.32), new T.MeshBasicMaterial({ color: '#0a1220', depthTest: false, depthWrite: false, fog: false, toneMapped: false })); frame.position.set(0, 0.24, -0.802); frame.renderOrder = 989; frame.visible = false;
    this.headEl.object3D.add(frame, mesh);
    this.mirror = { rt, cam, mesh, frame, n: 0 };
  },
  updateMirror(inp) {
    const m = this.mirror, on = !!inp.rear && this.state !== 'ready' && this.state !== 'over';
    m.mesh.visible = m.frame.visible = on;
    if (!on || (m.n++ % 2)) return;
    const r = this.el.renderer, head = this.headEl.getObject3D('camera');
    head.getWorldPosition(m.cam.position); head.getWorldQuaternion(m.cam.quaternion); m.cam.rotateY(Math.PI); m.cam.updateMatrixWorld(true);
    const hide = [m.mesh, m.frame, this.toastPanel.mesh, this.scorePanel.mesh, this.zonePanel.mesh, this.ruckPanel.mesh, this.$('cockpit').object3D], was = hide.map(o => o.visible);
    hide.forEach(o => (o.visible = false));
    const prevTarget = r.getRenderTarget(), xr = r.xr.enabled;
    r.xr.enabled = false; r.setRenderTarget(m.rt); r.clear(); r.render(this.el.object3D, m.cam); r.setRenderTarget(prevTarget); r.xr.enabled = xr;
    hide.forEach((o, i) => (o.visible = was[i]));
  },
  setBeam(m, a, b) { tmp2.subVectors(b, a); const len = tmp2.length(); if (len < 0.01) { m.visible = false; return; } m.position.copy(a); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(UP, tmp2.divideScalar(len)); m.visible = true; },

  // ---------------------------------------------------------------- helpers
  agents() { return ['player', ...this.matchBots]; },
  teamOf(a) { return a === 'player' ? 'blue' : a.team; },
  posOf(a) { return a === 'player' ? this.bodyPos() : a.pos; },
  velOf(a) { return a === 'player' ? this.vel : a.vel; },
  bodyPos() { return (this._body || (this._body = new T.Vector3())).copy(this.headPos).add(new T.Vector3(0, -0.5, 0)); },
  nameOf(a) { return a === 'player' ? 'YOU' : a.label; },
  flash(msg, secs = 1.4, opts = {}) { if (!msg) return; this.msg = msg; this.msgT = secs; this.msgOpts = opts; },
  edge(name, down) { const was = this.prevButtons[name]; this.prevButtons[name] = down; return down && !was; },
  useEnergy(n) { this.energy = Math.max(0, this.energy - n); this.energyIdle = 0; },
  // What this player has seen and earned in version 5 (kept on their profile).
  pilot() { const p = Profiles.current(this.save); return p.v5 || (p.v5 = { briefed: false, licensed: false, tips: [] }); },
  playerLocked() { return this.inRuck('player') || this.inDuel('player') || this.state === 'penalty' || this.playerStun > 0.6; },

  // ---------------------------------------------------------------- match flow
  resetToMenu() {
    this.leaveTraining();
    const want = this.pickedLevel() || (this.lvl.mode === this.mode ? this.lvl : this.modeLevels()[0]);
    if (want !== this.lvl) this.enterLevel(want);
    this.followWorld(true); this.resetZones();
    this.state = 'ready'; this.penalty = null; this.ruck = null; this.duels = []; this.playerBin = 0; this.sudden = false;
    for (const b of this.bots) { b.ruck = null; b.duel = null; b.bin = 0; }
    this.matchBots = this.bots; this.lineUp(); this.homePlayer();
    Object.assign(this.ball, { holder: null, passTo: null }); this.ball.pos.set(...this.lvl.ball); this.ball.vel.set(0, 0, 0);
    this.target.visible = false;
    this.helpOpen = false; this.helpPage = 0; this.afterHelp = null;   // a new pilot gets the briefing when they first press PLAY
  },
  homePlayer() { const c = this.forTeam('blue', this.lvl.spawn.c); this.placePlayer(c.x, c.y, c.z, 0); },
  newMatch() {
    this.leaveTraining();
    const next = this.nextLevel(); if (next !== this.lvl) { this.enterLevel(next); this.blinkT = 0.4; }
    this.score = { blue: 0, orange: 0 }; this.timeLeft = this.matchCfg.secs; this.result = null; this.stats = this.freshStats(); this.sudden = false;
    this.penalty = null; this.matchBots = this.bots; this.lastEvent = ''; this.buff = { blue: 0, orange: 0 }; this.resetZones(); this.held = { blue: 0, orange: 0 };
    for (const b of this.bots) { b.bin = 0; b.obj.visible = true; b.zone = null; b.markOn = null; } this.playerBin = 0;
    this.target.visible = false;
    this.kickoff();
    this.startCountdown(4);
    this.flash(this.lvl.name, 2.2, { big: true, color: '#ffd166', sub: `${this.matchLabel()}  ·  ${this.lvl.blurb}` });
    if (this.inVR) this.calibrate();
  },
  startCountdown(n) { const tips = this.mode === 'control' ? CONTROL_TIPS : KICKOFF_TIPS; this.state = 'countdown'; this.countT = n; this.kickTip = tips[this.kickN++ % tips.length]; },
  placePlayer(x, y, z, yaw = 0) { this.rig.position.set(x, y - 1.4, z); this.rig.rotation.set(0, yaw, 0); this.vel.set(0, 0, 0); this.steerDir = null; this.rideTilt = null; this.snapKick = 0; this.dashT = 0; },
  kickoff() {
    const d = this.ball;
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, passTo: null, lastThrower: null, noCatch: 0, throwT: -99, bankT: -99, spin: 0 });
    d.pos.set(...this.lvl.ball); d.vel.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0);
    if (this.ruck) this.endRuck('offload'); this.ruck = null;
    for (const duel of [...this.duels]) { this.duels.splice(this.duels.indexOf(duel), 1); for (const x of [duel.a, duel.b]) if (x !== 'player') x.duel = null; }
    this.followWorld(true); d.pos.set(...this.lvl.ball);
    this.lineUp(true); if (!(this.playerBin > 0)) this.homePlayer();
    this.penalty = null; this.energy = ENERGY_MAX; this.playerStun = 0; this.playerGrace = 0; this.charge = null;
  },
  calibrate() { const y = this.rig.worldToLocal(this.headPos.clone()).y; this.setCockpit(Math.max(-0.5, Math.min(0.7, y - 1.25))); },
  setCockpit(y) { this.cockpitY = y; this.$('cockpit').object3D.position.y = y; },
  updateState(dt) {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countT); this.countT -= dt;
      if (Math.ceil(this.countT) !== before && this.countT > 0 && this.countT <= 3) { this.flash(String(Math.ceil(this.countT)), 0.95, { big: true, sub: this.kickTip }); beep(520, 120, 0.1); }
      if (this.countT <= 0) { this.state = 'playing'; this.flash('GO!', 1.2, { big: true, color: '#66ffff' }); beep(880, 250, 0.12); }
    } else if (this.state === 'scored') {
      this.stateT -= dt;
      if (this.stateT <= 0) { if (this.matchOver()) this.endMatch(); else { this.kickoff(); this.startCountdown(3); } }
    } else if (this.state === 'playing') {
      if (!this.sudden) this.timeLeft -= dt;
      if (this.timeLeft <= 0 && !this.sudden) {
        this.timeLeft = 0;
        if (Math.floor(this.score.blue) === Math.floor(this.score.orange)) { this.sudden = true; this.flash('LEVEL AT TIME!\nNEXT SCORE WINS', 2.5, { big: true, color: '#ffd166' }); beep(440, 400, 0.12, 'square'); this.lastEvent = 'SUDDEN DEATH: next score wins'; }
        else this.endMatch();
      }
    } else if (this.state === 'penalty') this.updatePenalty(dt);
  },
  matchOver() { return this.sudden || this.score.blue >= this.winScore() || this.score.orange >= this.winScore() || this.timeLeft <= 0; },
  endMatch() {
    this.state = 'over'; this.ruck = null; this.penalty = null; this.duels = []; this.playerBin = 0;
    for (const b of this.bots) { b.ruck = null; b.duel = null; b.bin = 0; }
    this.score.blue = Math.floor(this.score.blue); this.score.orange = Math.floor(this.score.orange);
    this.result = Profiles.record(this.save, { mode: this.mode === 'control' ? 'control5' : 'station5', arena: this.lvl.id, realm: 'v5', level: this.level.name, ranked: true, botRating: this.level.rating, scoreFor: this.score.blue, scoreAgainst: this.score.orange, stats: this.stats });
    const won = this.score.blue > this.score.orange, draw = this.score.blue === this.score.orange;
    this.homePlayer();
    this.flash(won ? 'YOU WIN!' : draw ? 'DRAW' : 'ORANGE WINS', 3, { big: true, color: won ? '#66ffff' : '#ffd166' });
    beep(won ? 660 : 330, 400, 0.12); beep(won ? 880 : 262, 500, 0.1, 'sine', 0.2);
  },

  // ---------------------------------------------------------------- input
  trackVel(list, p, dt) { list.push({ p: p.clone(), dt }); if (list.length > 5) list.shift(); let sum = 0; for (let i = 1; i < list.length; i++) sum += list[i].dt; return sum > 0 ? list[list.length - 1].p.clone().sub(list[0].p).divideScalar(sum) : new T.Vector3(); },
  readInput(dt) {
    const fake = window.SURGE_FAKE_XR || null;
    const inVR = !!fake || (this.el.is('vr-mode') && this.el.renderer.xr.isPresenting);
    const cam = this.headEl.getObject3D('camera');
    const fwd = cam.getWorldDirection(new T.Vector3()), headPos = cam.getWorldPosition(new T.Vector3());
    const rigUp = UP.clone().applyQuaternion(this.rig.quaternion), right = new T.Vector3().crossVectors(fwd, rigUp);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0).applyQuaternion(this.rig.quaternion); else right.normalize();
    const inp = { inVR, fwd, right, rigUp, headPos, moveX: 0, moveY: 0, climb: 0, turnX: 0, boost: false, boostHeld: false, around: false, pass: false, start: false, dash: false, call: false, rear: false, punch: false,
                  pausePress: false, menuX: 0, menuY: 0, squeeze: 0, hands: [] };
    let flutterSum = 0;
    if (inVR) {
      const xr = this.el.renderer.xr, frame = fake ? null : this.el.frame || xr.getFrame(), ref = fake ? null : xr.getReferenceSpace();
      const rigQ = this.rig.quaternion, headLocal = this.rig.worldToLocal(headPos.clone()), rightLocal = right.clone().applyQuaternion(rigQ.clone().invert());
      for (const src of fake ? fake.sources(this) : xr.getSession().inputSources) {
        const gp = src.gamepad, side = src.handedness;
        if (!gp || (side !== 'left' && side !== 'right')) continue;
        const sx = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0), sy = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
        const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed), val = i => (gp.buttons[i] ? Math.max(gp.buttons[i].value || 0, gp.buttons[i].pressed ? 1 : 0) : 0);
        if (side === 'left') {
          inp.moveX = sx; inp.moveY = -sy;
          if (this.edge('lStick', btn(3))) inp.boost = true; if (btn(3)) inp.boostHeld = true;     // left stick down: boost
          if (this.edge('lX', btn(4))) inp.call = true;                                              // X: call for a pass
          if (this.edge('lY', btn(5))) inp.pausePress = true;                                        // Y: pause
        } else {
          inp.turnX = sx; inp.climb = -sy;
          if (btn(3)) inp.rear = true;                                                               // right stick down (hold): rear view
          if (this.edge('rA', btn(4))) { inp.around = true; inp.start = true; }                      // A: turn around / select
          if (this.edge('rB', btn(5))) inp.dash = true;                                              // B: dash (in a ruck: offload)
        }
        const gripPose = fake ? src.gripPose : frame && ref && src.gripSpace ? frame.getPose(src.gripSpace, ref) : null;
        const rayPose = fake ? src.rayPose : frame && ref ? frame.getPose(src.targetRaySpace, ref) : null;
        if (!gripPose || !rayPose) continue;
        const gpos = gripPose.transform.position, ro = rayPose.transform.orientation, realLocal = new T.Vector3(gpos.x, gpos.y, gpos.z);
        const shoulder = headLocal.clone().add(new T.Vector3(0, -0.25, 0)).addScaledVector(rightLocal, side === 'left' ? -0.18 : 0.18);
        const offset = realLocal.clone().sub(shoulder), r = offset.length(), reach = r < ARM_START ? r : Math.min(ARM_MAX, r + ARM_GAIN * (r - ARM_START) ** 2);
        const glove = this.rig.localToWorld(shoulder.clone().addScaledVector(offset.normalize(), reach));
        const rayQ = new T.Quaternion(ro.x, ro.y, ro.z, ro.w).premultiply(rigQ), tr = this.track[side], rp = rayPose.transform.position;
        const tv = val(0), gv = val(1), trigger = tv > 0.5, grip = gv > 0.5;
        flutterSum += Math.abs(tv - tr.tv); tr.tv = tv;
        inp.squeeze += (trigger ? 1 : 0) + (grip ? 1 : 0);
        inp.hands.push({ side, glove, aimOrigin: glove, rayOrigin: this.rig.localToWorld(new T.Vector3(rp.x, rp.y, rp.z)), shoulder: this.rig.localToWorld(shoulder.clone()), dir: new T.Vector3(0, 0, -1).applyQuaternion(rayQ),
                         grip, trigger, triggerPressed: this.edge(side + 'T', trigger), throwHeld: false, gloveVel: this.trackVel(tr.glove, glove, dt), realSpeed: this.trackVel(tr.real, realLocal, dt).length(),
                         haptic: gp.hapticActuators && gp.hapticActuators[0], desktop: false });
      }
      inp.menuX = inp.moveX; inp.menuY = inp.moveY;
    } else {
      const k = this.keys;
      inp.moveY = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); inp.moveX = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0); inp.climb = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
      inp.boostHeld = !!(k.ShiftLeft || k.ShiftRight); inp.boost = this.edge('kBoost', inp.boostHeld);
      inp.around = this.edge('kL', !!k.KeyL); inp.start = this.edge('kEnter', !!(k.Enter || k.NumpadEnter));
      inp.pass = this.edge('kF', !!k.KeyF); inp.pausePress = this.edge('kPause', !!(k.KeyP || k.Escape));
      inp.dash = this.edge('kR', !!k.KeyR); inp.call = this.edge('kC', !!k.KeyC); inp.rear = !!k.KeyV; inp.punch = this.edge('kX', !!k.KeyX);
      inp.menuX = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0); inp.menuY = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
      const g = !!k.KeyG, gp = this.edge('kG', g), sp = this.edge('kSpaceTap', !!k.Space);
      inp.squeeze = (g ? 2 : 0) + (k.Space ? 1 : 0); if (gp || sp) flutterSum += 0.9;
      inp.hands.push({ side: 'right', glove: headPos.clone().addScaledVector(fwd, 1.0).addScaledVector(UP, -0.3), aimOrigin: headPos.clone(), shoulder: null, dir: fwd.clone(),
                       grip: false, trigger: g, triggerPressed: gp, throwHeld: !!k.Space, gloveVel: new T.Vector3(), realSpeed: 0, haptic: null, desktop: true });
    }
    // how fast you are fluttering the triggers (for stripping the core in a ruck)
    this.flutter += ((dt > 0 ? flutterSum / dt : 0) - this.flutter) * (1 - Math.exp(-5 * dt));
    return inp;
  },

  // ---------------------------------------------------------------- main loop
  tick(t, dtMs) {
    if (!this.ready) return;
    const dt = Math.min((dtMs || 16) / 1000, 0.05);
    this.time += dt;
    const inp = this.readInput(dt);
    this.inVR = inp.inVR; this.hands = inp.hands; this.lastSqueeze = Math.min(4, inp.squeeze);
    this.headPos.copy(inp.headPos); this.headFwd.copy(inp.fwd);
    setListener(this.headPos, this.headFwd);
    this.updateHum();
    if (this.paused) return;
    updateMovers(this.time, dt);
    if (inp.inVR && this.calibrateT > 0 && (this.calibrateT -= dt) <= 0) this.calibrate();
    this.pingT -= dt; this.msgT = Math.max(0, this.msgT - dt); this.callT = Math.max(0, this.callT - dt);
    if (inp.inVR && !this.inVRBefore) this.prevButtons = {};
    this.inVRBefore = inp.inVR;
    if (this.helpOpen) { this.showPanels('help'); this.updateHelp(inp); this.updateHud(dt); this.render(inp, dt); return; }
    if (inp.pausePress) { if (this.pauseOpen) this.closePause(); else this.openPause(); }
    if (this.pauseOpen) { this.showPanels('pause'); this.updatePause(inp); this.updateHud(dt); return; }
    const inMenu = this.state === 'ready' || this.state === 'over';
    this.showPanels(inMenu ? 'menu' : null);
    if (inMenu) { this.updateMenu(inp); inp.boost = inp.dash = false; }
    else for (const side of ['left', 'right']) { this.lasers[side].beam.visible = false; this.lasers[side].dot.visible = false; }
    this.updateState(dt);
    const live = this.state === 'playing' || this.state === 'training';
    this.live = live;
    this.movePlayer(inp, dt, live);
    this.updateBall(inp, dt);
    if (live || this.state === 'penalty') this.followWorld();
    if (this.state === 'training') this.updateTraining(inp, dt); else this.updateBots(dt, live);
    if (this.zones.length) this.updateZones(dt, live);
    if (live) {
      this.contacts(dt); if (this.state === 'playing') this.botSteals(dt);
      this.updateRuck(inp, dt); this.updateFights(inp, dt, live); this.updateBin(dt); this.updateSight(dt); this.updateAurora(dt);
      if (inp.call) this.callForPass();
      if (this.state === 'playing') this.coach(inp, dt);
    } else { this.updateSight(dt); this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5); }
    this.updateComfort(dt); this.updateMirror(inp); this.updateHud(dt); this.render(inp, dt);
  },

  // ---------------------------------------------------------------- flying (upright, snap turns, head follow, dash)
  movePlayer(inp, dt, live) {
    if (inp.inVR) {
      if (Math.abs(inp.turnX) > 0.7 && Math.abs(inp.climb) < 0.5 && this.snapArmed) { this.snapTurn(inp.turnX > 0 ? -SNAP_DEG : SNAP_DEG); this.snapArmed = false; }
      if (Math.abs(inp.turnX) < 0.3) this.snapArmed = true;
    }
    this.followHead(inp, dt, live);
    if (inp.around && (live || this.state === 'penalty' || this.state === 'countdown')) { this.snapTurn(180); beep(420, 90, 0.05, 'triangle'); }
    const prevVel = this.vel.clone(), locked = this.playerLocked();
    this.boostCool = Math.max(0, this.boostCool - dt); this.boostT = Math.max(0, this.boostT - dt); this.dashCool = Math.max(0, this.dashCool - dt); this.dashT = Math.max(0, this.dashT - dt);
    const dz = v => Math.abs(v) < 0.15 ? 0 : v, climb = Math.abs(inp.turnX) > 0.6 ? 0 : dz(inp.climb);
    const fwd = this.updateSteer(inp, dt), right = new T.Vector3().crossVectors(fwd, inp.rigUp);
    if (right.lengthSq() < 1e-4) right.copy(inp.right); else right.normalize();
    const thrust = new T.Vector3().addScaledVector(fwd, dz(inp.moveY)).addScaledVector(right, dz(inp.moveX)).addScaledVector(inp.rigUp, climb);
    if (thrust.lengthSq() > 1) thrust.normalize();
    const boostDir = thrust.lengthSq() > 0.01 && dz(inp.moveY) >= 0 ? thrust.clone().normalize() : fwd.clone(), speedMul = this.teamSpeed('blue');
    if (live && !locked && inp.boost && this.boostCool === 0 && this.energy >= BOOST_COST) {
      this.vel.addScaledVector(boostDir, BOOST_BURST); this.useEnergy(BOOST_COST);
      this.boostT = BOOST_TIME; this.boostCool = BOOST_COOL; this.boostDir = boostDir.clone(); this.impactFlash = 0.4; this.boostAt = this.time; beep(160, 300, 0.1, 'sawtooth');
    }
    if (this.boostT > 0) { this.boostDir.lerp(boostDir, 1 - Math.exp(-10 * dt)).normalize(); if (live && inp.boostHeld && this.energy > 0) { this.boostT = Math.max(this.boostT, 0.12); this.useEnergy(BOOST_HOLD_COST * dt); this.boostAt = this.time; } }
    // DASH: a sharp burst the way the left stick points (straight ahead if it is centered)
    if (live && !locked && inp.dash && this.dashCool === 0 && this.energy >= DASH_COST && !this.inRuck('player')) {
      const dir = thrust.lengthSq() > 0.04 ? thrust.clone().normalize() : fwd.clone();
      this.vel.copy(dir).multiplyScalar(DASH_SPEED * speedMul); this.dashT = DASH_TIME; this.dashCool = DASH_COOL; this.useEnergy(DASH_COST); this.impactFlash = 0.55; this.dashAt = this.time;
      beep(260, 140, 0.1, 'sawtooth'); beep(520, 90, 0.06, 'square', 0.03); for (const h of inp.hands) pulse(h, 0.7, 60);
    }
    this.boosting = this.boostT > 0 && !locked;
    this.tiltRide(inp, dt, live && !locked);
    if (locked) this.vel.set(0, 0, 0);
    else if (this.dashT > 0) { /* the dash carries you */ }
    else if (!live) this.vel.multiplyScalar(Math.exp(-3 * dt));
    else if (this.easy || !inp.inVR) {
      if (!this.boosting && thrust.lengthSq() < 0.0025) this.vel.multiplyScalar(Math.exp(-1.1 * dt));
      else this.vel.lerp(this.boosting ? this.boostDir.clone().multiplyScalar(BOOST_MAX * 0.85 * speedMul) : thrust.clone().multiplyScalar(EASY_SPEED * speedMul), 1 - Math.exp(-EASY_RESPONSE * dt));
    } else if (this.boosting) this.vel.lerp(this.boostDir.clone().multiplyScalar(BOOST_MAX * 0.9 * speedMul), 1 - Math.exp(-3 * dt));
    else { this.vel.addScaledVector(thrust, THRUST * dt); this.vel.multiplyScalar(Math.exp(-DRAG * dt)); const sp = this.vel.length(), mx = MAX_SPEED * speedMul; if (sp > mx) this.vel.multiplyScalar((mx + (sp - mx) * Math.exp(-2 * dt)) / sp); }
    this.thrustLevel = this.boosting || this.dashT > 0 ? 1 : thrust.length() * 0.5;
    this.rig.position.addScaledVector(this.vel, dt);
    this.accelMag = dt > 0 ? prevVel.sub(this.vel).length() / dt : 0;
    const cam = this.headEl.getObject3D('camera'), center = cam.getWorldPosition(new T.Vector3()), before = center.clone(), hit = {};
    let impact = constrainSphere(center, this.vel, PLAYER_R, BOUNCE_WALL, hit);
    this.rig.position.add(center.sub(before));
    const body = cam.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, -1.0, 0)), bodyBefore = body.clone();
    impact = Math.max(impact, constrainSphere(body, this.vel, 0.45, BOUNCE_WALL, hit));
    this.rig.position.add(body.sub(bodyBefore));
    if (impact > 2.5) { this.impactFlash = Math.min(1, impact / 10); beep(120, 120, 0.1, 'triangle'); for (const h of inp.hands) pulse(h, 0.6, 60); if (hit.edge) this.flash('EDGE OF THE FIELD', 0.8); }
    this.impactFlash = Math.max(0, this.impactFlash - dt * 2);
    this.energyIdle += dt;
    if (this.energyIdle > REGEN_DELAY) this.energy = Math.min(ENERGY_MAX, this.energy + REGEN * (this.buff.blue > 0 ? 1.6 : 1) * dt);
    // out a window and back: remember whether you are inside the rooms
    this.outside = !roomAt(this.headPos);
  },
  followHead(inp, dt, live) {
    this.followRate = 0;
    if (!inp.inVR || !live || this.save.turnFollow === false || this.playerLocked()) { this.followEase = 0; return; }
    const f = this.headFwd.clone().applyQuaternion(this.rig.quaternion.clone().invert()); f.y = 0;
    if (f.lengthSq() < 0.04) return;
    const yaw = Math.atan2(-f.x, -f.z), past = Math.abs(yaw) - FOLLOW_START;
    if (past <= 0) { this.followEase = 0; return; }
    this.followEase = Math.min(1, (this.followEase || 0) + dt * 2);
    const rate = Math.sign(yaw) * Math.min(FOLLOW_MAX, past * FOLLOW_GAIN) * (0.35 + 0.65 * Math.min(1, this.vel.length() / 4)) * this.followEase;
    this.turnAboutHead(() => this.rig.rotateY(rate * dt));
    if (this.steerDir) this.steerDir.applyAxisAngle(UP, rate * dt);
    this.followRate = Math.abs(rate);
  },
  snapTurn(deg) {
    this.turnAboutHead(() => this.rig.rotateY(deg * DEG));
    if (Math.abs(deg) < 90) this.snapKick = Math.sign(deg) * RIDE_TILT * 0.9; else this.blinkT = Math.max(this.blinkT || 0, 0.18);
    if (this.steerDir) this.steerDir.applyAxisAngle(UP, deg * DEG);
    this.turnTotal = (this.turnTotal || 0) + Math.abs(deg);
  },
  tiltRide(inp, dt, live) {
    const dz = v => Math.abs(v) < 0.15 ? 0 : v, k = 1 - Math.exp(-6 * dt);
    this.snapKick = (this.snapKick || 0) * Math.exp(-4 * dt);
    const roll = (live ? -dz(inp.moveX) * RIDE_TILT * (this.dashT > 0 ? 2 : 1) : 0) + this.snapKick, pitch = live ? (this.boosting ? -1 : -Math.max(0, dz(inp.moveY)) * 0.6) * RIDE_PITCH : 0;
    this.rideTilt = this.rideTilt || { r: 0, p: 0 };
    this.rideTilt.r += (roll - this.rideTilt.r) * k; this.rideTilt.p += (pitch - this.rideTilt.p) * k;
    this.$('ride').object3D.rotation.set(this.rideTilt.p, 0, this.rideTilt.r);
  },
  turnAboutHead(turn) {
    const cam = this.headEl.getObject3D('camera');
    this.rig.updateMatrixWorld(true); const before = cam.getWorldPosition(new T.Vector3());
    turn(); this.rig.updateMatrixWorld(true);
    this.rig.position.add(before.sub(cam.getWorldPosition(new T.Vector3())));
  },
  updateSteer(inp, dt) {
    const d = this.ball, q = this.rig.quaternion; let want = null;
    if (inp.inVR && this.flight !== 'head') {
      const sum = new T.Vector3(); let n = 0;
      for (const h of inp.hands) { if (h.desktop || h.grip || h.realSpeed > 1.8 || (d.holder === 'player' && d.hand === h.side)) continue; sum.add(h.dir); n++; }
      if (n && sum.length() > 0.5) {
        const local = sum.normalize().applyQuaternion(q.clone().invert());
        const pitch = Math.min(Math.PI / 2, Math.asin(Math.max(-1, Math.min(1, local.y))) + STEER_LIFT), flat = Math.hypot(local.x, local.z);
        if (flat > 1e-3) { local.x *= Math.cos(pitch) / flat; local.z *= Math.cos(pitch) / flat; local.y = Math.sin(pitch); }
        want = local.applyQuaternion(q);
      }
      this.handSteer = n > 0;
    } else { want = inp.fwd; this.handSteer = false; }
    if (!this.steerDir) this.steerDir = inp.fwd.clone();
    if (want) this.steerDir.lerp(want, 1 - Math.exp(-STEER_SMOOTH * dt)).normalize();
    return this.steerDir;
  },

  // ---------------------------------------------------------------- the CORE
  takeBall(a, stolen = false) {
    const d = this.ball, prev = d.holder;
    if (d.passTo === a && d.lastThrower === 'player' && a !== 'player') this.stats.passes++;
    Object.assign(d, { holder: a, pulledBy: null, snapping: false, passTo: null, noCatch: 0 }); d.vel.set(0, 0, 0);
    if (a === 'player') { this.playerGrace = GRACE; this.charge = null; if (stolen) this.stats.steals++; } else { a.grace = GRACE; a.decideT = 0.4; }
    if (stolen && prev) { beepAt(240, 140, 0.1, 'square', d.pos); this.bursts.fire(d.pos, TEAM_COLOR[this.teamOf(a)], 0.5); }
  },
  aimedAt(h, target, range, base) { tmp2.subVectors(target, h.aimOrigin); const dist = tmp2.length(); if (dist > range) return false; const along = tmp2.dot(h.dir); if (along <= 0) return false; return Math.sqrt(Math.max(0, dist * dist - along * along)) < base + along * 0.08; },
  assistDir(origin, dir, maxAngle) {
    let best = maxAngle, pick = null;
    for (const g of WORLD.goals) { if (g.team === 'blue') continue; tmp.subVectors(g.c, origin); if (tmp.dot(g.n) > 0) continue; const ang = dir.angleTo(tmp); if (ang < best) { best = ang; pick = g; } }
    return pick ? new T.Vector3().subVectors(pick.c, origin).normalize() : dir.clone().normalize();
  },
  mateInSights(h) {
    let best = null, bestAng = PASS_ANGLE;
    for (const b of this.matchBots) { if (b.team !== 'blue' || !this.free(b)) continue; tmp.subVectors(b.pos, h.aimOrigin).setY(tmp.y + 1); if (tmp.length() > PASS_RANGE) continue; const ang = h.dir.angleTo(tmp); if (ang < bestAng) { bestAng = ang; best = b; } }
    // pointing closer to an open goal than to that teammate: you meant to shoot
    if (best && this.state !== 'training') for (const g of WORLD.goals) { if (g.team === 'blue') continue; tmp.subVectors(g.c, h.aimOrigin); if (tmp.dot(g.n) < 0 && tmp.length() < 40 && h.dir.angleTo(tmp) < Math.min(bestAng, EASY_ASSIST)) return null; }
    return best;
  },
  bestMate() {
    let best = null;
    for (const b of this.matchBots) {
      if (b.team !== 'blue' || !this.free(b)) continue;
      const dd = b.pos.distanceTo(this.headPos); if (dd > PASS_RANGE) continue;
      const s = this.progressOf('blue', b.pos) - dd * 0.2 + (this.passOpen('blue', this.headPos, b.pos) ? 20 : 0);
      if (!best || s > best.s) best = { b, s };
    }
    return best && best.b;
  },
  passFrom(passer, target, speed = PASS_SPEED) {
    const d = this.ball, from = d.pos.clone(), tPos = this.posOf(target).clone();
    if (target !== 'player') tPos.y += 1.0;
    const aim = tPos.addScaledVector(this.velOf(target), from.distanceTo(tPos) / speed);
    d.vel.subVectors(aim, from).setLength(speed);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, passTo: target, passT: 2.5, lastThrower: passer, throwT: this.time, bankT: -99 });
    d.throwFrom.copy(from);
    if (passer === 'player') d.noCatch = 0.4; else { passer.cool = 0.6; d.noCatch = 0.15; }
    if (this.ruck && this.ruck.b === passer) this.endRuck('offload');
    beepAt(620, 90, 0.08, 'triangle', from); beepAt(820, 90, 0.08, 'triangle', from, 0.08);
  },
  release(thrower, v) {
    const d = this.ball;
    if (v.length() > BALL_MAX) v.setLength(BALL_MAX);
    d.vel.copy(v);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, noCatch: thrower === 'player' ? 0.3 : 0.2, passTo: null, lastThrower: thrower, throwT: this.time, bankT: -99, spin: 12 + v.length() });
    d.throwFrom.copy(d.pos);
    if (this.ruck && this.ruck.b === thrower) this.endRuck('offload');
    if (this.penalty) this.penalty.shot = true;
    beepAt(400 + v.length() * 15, 120, 0.1, 'square', d.pos);
  },
  catchBall(h, msg) {
    this.takeBall('player', msg === 'STOLE IT!'); this.ball.hand = h.side;
    if (!h.desktop) this.track[h.side].glove.length = 0;
    this.flash(msg); pulse(h, 0.7, 50); beep(880, 80, 0.1);
  },
  // X: ask for the core. The teammate carrying it passes the moment the pass is on.
  callForPass() {
    const d = this.ball, holder = d.holder;
    if (holder === 'player' || this.playerBin > 0) return;
    this.callT = CALL_TIME; beep(1040, 70, 0.08, 'triangle'); beep(1320, 90, 0.08, 'triangle', 0.07); for (const h of this.hands || []) pulse(h, 0.4, 40);
    this.flash(holder && holder !== 'player' && holder.team === 'blue' ? `CALLING FOR IT from ${holder.num}!` : 'CALLING FOR IT: your team looks for you next', 1.1, { color: '#66ffff' });
  },

  updateBall(inp, dt) {
    const d = this.ball, hands = inp.hands, handOf = s => hands.find(h => h.side === s), live = this.live || this.state === 'penalty', canPlay = !(this.playerBin > 0) && !this.inDuel('player');
    this.playerStun = Math.max(0, this.playerStun - dt); this.playerGrace = Math.max(0, this.playerGrace - dt);
    d.noCatch = Math.max(0, d.noCatch - dt);
    if (d.passTo) { d.passT -= dt; if (d.passT <= 0) d.passTo = null; }
    let pullBeam = null; const prevPos = d.pos.clone();
    this.gripsHeld = hands.filter(h => h.grip).length;
    if (live && d.holder === 'player') {
      const h = handOf(d.hand) || hands[0];
      if (!h) d.holder = null;
      else {
        d.hand = h.side; d.pos.copy(h.glove);
        const inRuck = this.inRuck('player');
        if (inp.pass && this.state !== 'penalty') { const to = this.bestMate(); if (to) { this.passFrom('player', to); this.flash(`PASS TO ${to.num}`, 0.8); } }
        else if ((this.easy || h.desktop) && !inRuck) {
          // tap = soft, hold = hard. Let go while pointing at a teammate and it is a pass.
          const held = h.desktop ? h.throwHeld : h.trigger;
          if (!this.charge && (h.desktop ? h.throwHeld : h.triggerPressed)) this.charge = { t: 0 };
          if (this.charge && held) { this.charge.t += dt; if (Math.floor(this.charge.t * 10) !== Math.floor((this.charge.t - dt) * 10)) pulse(h, Math.min(1, 0.2 + this.charge.t / CHARGE_TIME * 0.6), 20); }
          else if (this.charge && !held) {
            const power = Math.min(1, this.charge.t / CHARGE_TIME), speed = THROW_SOFT + (THROW_HARD - THROW_SOFT) * power, mate = !h.desktop && this.state !== 'penalty' ? this.mateInSights(h) : null;
            this.charge = null;
            if (mate) { this.passFrom('player', mate, Math.max(18, speed)); this.flash(power > 0.6 ? `BULLET PASS TO ${mate.num}` : `PASS TO ${mate.num}`, 0.8); }
            else { this.release('player', this.assistDir(h.aimOrigin, h.dir, EASY_ASSIST).multiplyScalar(speed).add(this.vel)); this.lastPower = power; }
            pulse(h, 0.5 + power * 0.5, 70);
          }
        } else if (!this.easy && !h.desktop && !h.grip && !inRuck) {
          const rel = h.gloveVel.clone().sub(this.vel);
          if (h.realSpeed < 1.0) this.release('player', this.vel.clone().add(rel)); else this.release('player', this.assistDir(h.glove, rel, THROW_ASSIST).multiplyScalar(rel.length() * THROW_GAIN).add(this.vel));
        }
      }
    } else if (live && d.holder && this.state !== 'penalty' && canPlay && !this.ruck) {
      // reach in and take it straight out of a rival's hands (or a teammate's: a handoff)
      const bot = d.holder;
      for (const h of hands) {
        if (d.holder !== bot || this.playerStun > 0) break;
        const grabbing = h.grip || ((this.easy || h.desktop) && h.triggerPressed);
        if (!grabbing || !(h.glove.distanceTo(d.pos) < STEAL_R || this.headPos.distanceTo(d.pos) < STEAL_R)) continue;
        if (bot.team === 'blue') this.catchBall(h, 'HANDOFF');
        else if (bot.grace > 0) continue;
        else { bot.stun = 0.8; bot.vel.multiplyScalar(-0.3); this.catchBall(h, 'STOLE IT!'); }
      }
    }
    if (live && d.holder === null) {
      if (canPlay) {
        if (d.passTo === 'player' && this.playerStun === 0) for (const h of hands) if (h.glove.distanceTo(d.pos) < SNAP_R * 1.3 || this.headPos.distanceTo(d.pos) < 2.2) { this.catchBall(h, 'CAUGHT THE PASS'); break; }
        if (d.holder === null) for (const h of hands) {
          if (d.holder !== null || this.playerStun > 0 || d.noCatch > 0) break;
          const dist = h.glove.distanceTo(d.pos);
          if (h.grip && dist < GRAB_R + BALL_R) this.catchBall(h, 'GOT IT'); else if (h.grip && dist < SNAP_R) { d.pulledBy = h.side; d.snapping = true; }
        }
        if (d.holder === null) {
          for (const h of hands) if ((this.easy || h.desktop) && h.trigger && !d.pulledBy && this.playerStun === 0 && d.noCatch === 0 && this.aimedAt(h, d.pos, EASY_PULL_RANGE, 1.4) && clearLine(h.aimOrigin, d.pos, 0.05)) { d.pulledBy = h.side; d.snapping = false; pulse(h, 0.3, 40); beep(440, 80, 0.06); }
          if (d.pulledBy) {
            const h = handOf(d.pulledBy);
            if (!h || !(d.snapping ? h.grip : h.trigger)) { d.pulledBy = null; d.snapping = false; }
            else { tmp.subVectors(h.glove, d.pos); const dist = tmp.length(); d.vel.lerp(tmp.multiplyScalar((d.snapping ? SNAP_SPEED : PULL_SPEED) / Math.max(dist, 0.01)), 1 - Math.exp(-(d.snapping ? 20 : 8) * dt)); pullBeam = h; if (dist < GRAB_R + BALL_R + 0.1) this.catchBall(h, 'GOT IT'); }
          }
        }
      }
      if (d.holder === null) this.flyBall(dt);
    } else if (!live && d.holder === null && this.state !== 'ready') d.vel.multiplyScalar(Math.exp(-2 * dt));
    if (d.holder && d.holder !== 'player') d.pos.copy(d.holder.pos).addScaledVector(d.holder.facing, 0.8).add(new T.Vector3(0, 1.05, 0));
    if (live && d.holder === 'player') this.checkGoalCross(prevPos, d.pos, true);
    if (pullBeam && d.holder === null) this.setBeam(this.beams.pull, pullBeam.glove, d.pos); else this.beams.pull.visible = false;
  },
  flyBall(dt) {
    const d = this.ball, hit = {};
    d.vel.multiplyScalar(Math.exp(-BALL_DRAG * dt));
    const steps = 3, sdt = dt / steps, prev = new T.Vector3();
    for (let i = 0; i < steps; i++) {
      prev.copy(d.pos); d.pos.addScaledVector(d.vel, sdt);
      if (this.checkGoalCross(prev, d.pos, false)) return;
      hit.normal = null;
      const impact = constrainSphere(d.pos, d.vel, BALL_R, BOUNCE_BALL, hit);
      if (hit.normal && impact > 2) {
        if (this.time - d.throwT < BANK_WINDOW && d.bankT < d.throwT + 0.02) d.bankT = this.time;
        if (this.pingT <= 0) { beepAt(hit.wall && hit.wall.mat === 'goal' ? 320 : 700 + Math.min(impact, 30) * 20, hit.wall && hit.wall.mat === 'goal' ? 140 : 60, 0.06, hit.wall && hit.wall.mat === 'goal' ? 'square' : 'sine', d.pos); this.pingT = 0.08; }
        if (d.passTo) d.passTo = null;
      }
    }
    d.spin *= Math.exp(-0.3 * dt);
  },
  // A goal counts when the middle of the core passes through the round opening you can see: inside the rim, front to back.
  checkGoalCross(a, b, carried) {
    for (const g of WORLD.goals) {
      const off = BALL_R + WALL_T / 2 + 0.05, d0 = tmp.subVectors(a, g.c).dot(g.n) - off, d1 = tmp.subVectors(b, g.c).dot(g.n) - off;
      if (!(d0 > 0 && d1 <= 0)) continue;
      tmp.lerpVectors(a, b, d0 / (d0 - d1)).addScaledVector(g.n, -off);
      if (tmp.distanceTo(g.c) > g.r - BALL_R * 0.5) continue;   // more than half the core over the rim: it hits the rim and bounces out
      this.goal(g, carried);
      return true;
    }
    return false;
  },
  goal(g, carried) {
    const d = this.ball, team = OTHER[g.team], scorer = carried ? d.holder : d.lastThrower, own = scorer && this.teamOf(scorer) === g.team;
    let pts = this.state === 'penalty' ? POINTS.penalty : g.points; const extras = [];
    const bank = !carried && d.bankT > d.throwT && d.bankT - d.throwT < BANK_WINDOW, long = !carried && !own && d.throwFrom.distanceTo(g.c) > LONG_SHOT;
    if (!own && bank) { pts += POINTS.bank; extras.push(`BANK SHOT +${POINTS.bank}`); }
    if (long) { pts += POINTS.long; extras.push(`LONG SHOT +${POINTS.long}`); }
    this.score[team] += pts;
    const what = own ? 'OWN GOAL' : this.state === 'penalty' ? 'PENALTY' : g.kind === 'deep' ? 'DEEP GOAL' : 'GOAL', who = scorer ? this.nameOf(scorer) : TEAM_NAME[team];
    this.lastEvent = `${what} +${pts} · ${who}`;
    if (scorer === 'player' && !own) { this.stats.goals++; if (g.kind === 'deep') this.stats.deep++; if (bank || long) this.stats.tricks++; }
    this.flash(`${what}! +${pts}`, 2.4, { big: true, color: TEAM_COLOR[team], sub: [who, ...extras].join('  ·  ') });
    this.bursts.fire(g.c, TEAM_COLOR[team], 1.6); this.bursts.fire(g.c.clone().addScaledVector(g.n, 2), '#ffffff', 1);
    beepAt(team === 'blue' ? 880 : 300, 300, 0.12, 'sine', g.c); beep(team === 'blue' ? 1320 : 220, 400, 0.08, 'sine', 0.15);
    for (const h of this.hands || []) pulse(h, 0.8, 120);
    d.holder = null; d.vel.set(0, 0, 0); d.pos.copy(g.c).addScaledVector(g.n, -1.2);
    if (this.ruck) { const r = this.ruck; this.ruck = null; for (const x of [...r.A, ...r.B]) if (x !== 'player') x.ruck = null; }
    this.penalty = null; this.charge = null;
    if (this.state === 'training') { this.training.scored = g; return; }
    this.state = 'scored'; this.stateT = 2.6;
    if (this.matchOver()) this.lastEvent += '  ·  FULL TIME';
  },

  // ---------------------------------------------------------------- contact: bounces, rucks and fouls
  contacts(dt) {
    const list = this.agents().filter(x => (x === 'player' ? !(this.playerBin > 0) && !this.inDuel('player') : !(x.bin > 0) && !x.duel)), d = this.ball;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const pa = a === 'player' ? this.bodyPos().clone() : a.pos.clone().add(new T.Vector3(0, 0.9, 0)), pb = b === 'player' ? this.bodyPos().clone() : b.pos.clone().add(new T.Vector3(0, 0.9, 0));
      const ra = a === 'player' ? PLAYER_R : BOT_R, rb = b === 'player' ? PLAYER_R : BOT_R, n = pb.clone().sub(pa), dist = n.length();
      if (dist >= ra + rb || dist < 1e-4) continue;
      n.divideScalar(dist);
      const va = this.velOf(a), vb = this.velOf(b), closing = va.clone().sub(vb).dot(n), ta = this.teamOf(a), tb = this.teamOf(b);
      const dashing = x => (x === 'player' ? this.dashT > 0 || this.time - (this.dashAt || -9) < 0.5 : x.dashT > 0);
      if (ta !== tb && !this.ruck) {
        if ((d.holder === a || d.holder === b) && closing > RUCK_SPEED) {
          const carrier = d.holder === a ? a : b, tackler = carrier === a ? b : a;
          const grace = carrier === 'player' ? this.playerGrace : carrier.grace, stunned = tackler === 'player' ? this.playerStun > 0 : tackler.stun > 0;
          if (grace <= 0 && !stunned) { this.startRuck(tackler, carrier, dashing(tackler)); continue; }
        }
      }
      if (this.inRuck(a) || this.inRuck(b)) continue;
      const push = (ra + rb - dist) / 2;
      if (a === 'player') this.rig.position.addScaledVector(n, -push); else a.pos.addScaledVector(n, -push);
      if (b === 'player') this.rig.position.addScaledVector(n, push); else b.pos.addScaledVector(n, push);
      if (closing > 0) {
        const jImp = closing * (1 + BUMP_BOUNCE) / 2, ka = dashing(b) ? DASH_KNOCK : dashing(a) ? 0.6 : 1, kb = dashing(a) ? DASH_KNOCK : dashing(b) ? 0.6 : 1;
        va.addScaledVector(n, -jImp * ka); vb.addScaledVector(n, jImp * kb);
        if (closing > 3) {
          beepAt(160, 90, 0.09, 'triangle', pa); if (closing > 7) noiseAt(140, 0.1, pa, [900, 200]);
          if (a === 'player' || b === 'player') { this.impactFlash = Math.min(1, closing / 10); for (const h of this.hands || []) pulse(h, Math.min(1, 0.4 + closing / 14), 70); }
          for (const [x, k] of [[a, ka], [b, kb]]) if (x !== 'player' && k > 1) x.stun = Math.max(x.stun, 0.35);
        }
        if (ta !== tb && closing > FOUL_SPEED && this.state === 'playing' && this.mode !== 'control' && d.holder !== a && d.holder !== b && d.pos.distanceTo(pa) > FOUL_BALL_R && d.pos.distanceTo(pb) > FOUL_BALL_R) {
          const sa = va.dot(n) + jImp * ka, sb = -(vb.dot(n) - jImp * kb), hitter = sa >= sb ? a : b, victim = hitter === a ? b : a;
          if ((hitter === a ? sa : sb) > FOUL_SPEED * 0.7) { if (hitter === 'player') this.stats.fouls++; this.awardPenalty(this.teamOf(victim), victim, `LATE HIT by ${this.nameOf(hitter)}`); }
        }
      }
    }
  },

  // ---------------------------------------------------------------- penalty shots (after a late hit)
  awardPenalty(team, victim, why) {
    if (this.state !== 'playing') return;
    const holes = this.goalsOf(OTHER[team], 'hole'), g = holes[Math.floor(holes.length / 2)] || this.goalsOf(OTHER[team])[0];
    let spot = g.c.clone().addScaledVector(g.n, 18); if (solidAt(spot, 1) || !clearLine(spot, g.c.clone().addScaledVector(g.n, 1), 0.3)) spot = g.c.clone().addScaledVector(g.n, 9);
    const shooter = team === 'blue' && !(this.playerBin > 0) ? 'player' : (victim !== 'player' && !(victim.bin > 0) ? victim : this.matchBots.find(b => b.team === team && this.free(b)));
    if (!shooter) return;
    if (this.ruck) this.endRuck('offload'); this.ruck = null;
    this.state = 'penalty'; this.penalty = { team, shooter, t: PENALTY_TIME, shot: false, after: 0, spot };
    // everyone else waits round the kickoff spot
    const c = new T.Vector3(...this.lvl.ball); c.y += WORLD.oy; let i = 0;
    for (const b of this.matchBots) {
      if (b.bin > 0) continue;
      if (b === shooter) { b.pos.copy(spot).add(new T.Vector3(0, -0.9, 0)); b.facing.copy(g.n).negate(); b.vel.set(0, 0, 0); continue; }
      const k = i++; b.pos.set(c.x + ((k % 5) - 2) * 2.4, c.y - 0.9 + (Math.floor(k / 5) - 1) * 2.2, c.z + (b.team === 'blue' ? 2 : -2)); b.vel.set(0, 0, 0); b.stun = 0;
      if (solidAt(b.pos, 0.6)) b.pos.copy(c);
    }
    const yaw = Math.atan2(g.n.x, g.n.z);
    if (shooter === 'player') this.placePlayer(spot.x, spot.y, spot.z, yaw); else if (!(this.playerBin > 0)) this.placePlayer(c.x, c.y + 3, c.z + 4, yaw);
    this.takeBall(shooter); if (shooter === 'player') this.ball.hand = 'right';
    this.ball.pos.copy(shooter === 'player' ? spot : shooter.pos);
    this.flash(`${why}!`, 3, { color: TEAM_COLOR[team], sub: `PENALTY to ${TEAM_NAME[team]}: ${shooter === 'player' ? 'your shot' : 'free shot'}, ${POINTS.penalty} points` });
    if (shooter === 'player') this.tip('penalty', true);
    beep(330, 300, 0.12, 'square'); beep(262, 400, 0.1, 'square', 0.25);
    this.lastEvent = `PENALTY to ${TEAM_NAME[team]}`;
  },
  updatePenalty(dt) {
    const p = this.penalty; if (!p) { this.state = 'playing'; return; }
    p.t -= dt;
    if (!p.shot && p.shooter !== 'player' && p.t < PENALTY_TIME - 1.6) { const shot = this.bestShot(p.team, this.ball.pos, 30); if (shot) this.botShoot(p.shooter, shot); else p.t = 0; }
    if (p.shot) { p.after += dt; if (p.after > 2.2) { this.state = 'playing'; this.penalty = null; this.flash('MISSED. PLAY ON!', 1.2); } }
    else if (p.t <= 0) { this.state = 'playing'; this.penalty = null; this.ball.holder = null; this.charge = null; this.flash('TOO SLOW. PLAY ON!', 1.2); }
  },

  // ---------------------------------------------------------------- sight ring and aurora shards
  updateSight(dt) {
    const inside = this.sightDist() < (this.state === 'training' ? 2.0 : 1.4);
    if (inside) { if (this.sightT <= 0) { beep(990, 90, 0.06); beep(1320, 120, 0.05, 'sine', 0.08); this.flash('SIGHT RING: everyone shows through the walls', 1.6, { color: '#9ff6ff' }); } this.sightT = 1.2; }
    else this.sightT = Math.max(0, this.sightT - dt);
    this.inSight = inside;
  },
  updateAurora(dt) {
    for (const t of ['blue', 'orange']) this.buff[t] = Math.max(0, this.buff[t] - dt);
    const scene = this.el.object3D, cols = this.lvl.theme.aurora;
    if (this.state === 'playing' && (this.shardT -= dt) <= 0 && this.shards.length < AURORA_MAX) {
      this.shardT = AURORA_EVERY * (0.7 + Math.random() * 0.6);
      const nodes = WORLD.nodes.filter(n => n.kind === 'room' && WORLD.goals.every(g => g.c.distanceTo(n.p) > 9) && this.shards.every(s => s.pos.distanceTo(n.p) > 14));
      if (nodes.length) {
        const p = nodes[Math.floor(Math.random() * nodes.length)].p, obj = new T.Group();
        obj.add(shardSprite(cols[0]), glowSprite(cols[1], 3.4, 0.35)); obj.position.copy(p); scene.add(obj);
        this.shards.push({ pos: p.clone(), obj, life: AURORA_LIFE, ph: Math.random() * 6 });
      }
    }
    for (const s of [...this.shards]) {
      s.life -= dt;
      const k = Math.min(1, s.life / 2, (AURORA_LIFE - s.life) * 2);
      s.obj.scale.setScalar(Math.max(0.05, k) * (1 + Math.sin(this.time * 3 + s.ph) * 0.12)); s.obj.position.y = s.pos.y + Math.sin(this.time * 1.4 + s.ph) * 0.4;
      let who = null;
      if (s.life > 0) for (const a of this.agents()) if (this.free(a) && this.posOf(a).distanceTo(s.pos) < AURORA_R) { who = a; break; }
      if (who) {
        const team = this.teamOf(who); this.buff[team] = AURORA_TIME;
        this.bursts.fire(s.pos, cols[0], 1.2); beepAt(784, 160, 0.1, 'triangle', s.pos); beepAt(1175, 260, 0.09, 'triangle', s.pos, 0.1);
        this.flash(team === 'blue' ? (who === 'player' ? 'AURORA! Your team is faster and stronger' : `AURORA! ${who.label} charged your team`) : 'ORANGE caught an AURORA SHARD', 1.6, { color: team === 'blue' ? cols[0] : TEAM_COLOR.orange });
        if (who === 'player') for (const h of this.hands || []) pulse(h, 0.8, 200);
        this.lastEvent = `AURORA: ${TEAM_NAME[team]} +speed +strength`;
        s.life = 0;
      }
      if (s.life <= 0) { scene.remove(s.obj); this.shards.splice(this.shards.indexOf(s), 1); }
    }
  },

  // ---------------------------------------------------------------- coaching tips
  tip(id, force) {
    const tips = this.pilot().tips;
    if (tips.includes(id) || (!force && this.tipGap > 0) || !TIPS[id]) return;
    const text = TIPS[id][this.inVR ? 0 : 1]; if (!text) return;
    tips.push(id); writeSave(this.save);
    this.flash(text, 5, { hint: this.inVR ? TIP_HINTS[id] : null, color: '#9ff6ff' });
    this.tipGap = 7;
  },
  coach(inp, dt) {
    this.tipGap = Math.max(0, this.tipGap - dt);
    const played = this.matchCfg.secs - this.timeLeft, d = this.ball;
    if (this.mode === 'control') {
      if (played > 2) this.tip('zone'); if (played > 8) this.tip('steer'); if (played > 14) this.tip('zcore'); if (played > 22) this.tip('dash'); if (played > 30) this.tip('zscore');
      if (d.holder === null && d.pos.distanceTo(this.headPos) < 15) this.tip('grab'); if (played > 40 && this.fights) this.tip('punch'); if (played > 55) this.tip('rear');
      return;
    }
    if (played > 2) this.tip('steer');
    if (played > 6) this.tip('turn');
    if (played > 10) this.tip('boost');
    if (played > 15) this.tip('dash');
    if (played > 20) this.tip('pause');
    if (d.holder === null && d.pos.distanceTo(this.headPos) < 15) this.tip('grab');
    if (d.holder === 'player') { this.tip('throw'); this.tip('pass'); this.tip('hold'); }
    if (d.holder && d.holder !== 'player' && d.holder.team === 'blue' && played > 12) this.tip('call');
    if (d.holder && d.holder !== 'player' && d.holder.team === 'orange' && d.pos.distanceTo(this.headPos) < 14) this.tip('steal');
    if (this.shards.some(s => s.pos.distanceTo(this.headPos) < 25)) this.tip('aurora');
    if (played > 30 && this.lvl.exterior !== false) this.tip('windows');
    if (played > 45) this.tip('rear');
    if (played > 60) this.tip('sight');
    if (played > 75 && this.fights) this.tip('punch');
  },

  // ---------------------------------------------------------------- panels: menus, pause, help, scoreboard, messages
  buildPanels() {
    const menuAnchor = this.$('menu').object3D;
    this.menuPanel = new UIPanel(MENU5_W, MENU5_H, 800); this.pausePanel = new UIPanel(PAUSE5_W, PAUSE5_H, 800); this.helpPanel = new UIPanel(BRIEF5_W, BRIEF5_H, 800);
    menuAnchor.add(this.menuPanel.mesh, this.pausePanel.mesh, this.helpPanel.mesh);
    const ytag = labelSprite('Y  PAUSE', { color: '#ffffff', bg: 'rgba(8,18,31,0.6)', height: 0.045 }); ytag.position.set(0, 0.11, 0); this.gloveEls.left.object3D.add(ytag);
    this.scorePanel = new UIPanel(SCORE_W, SCORE_H, 1000, { onTop: true, order: 900 }); this.$('hud').object3D.add(this.scorePanel.mesh); this.scorePanel.setOpacity(0);
    this.toastPanel = new UIPanel(1.5, 0.5, 700, { onTop: true, order: 1003 }); this.rig.add(this.toastPanel.mesh); this.toastPanel.setOpacity(0);
    this.zonePanel = new UIPanel(0.7, 0.13, 1000, { onTop: true, order: 1002 }); this.headEl.object3D.add(this.zonePanel.mesh); this.zonePanel.mesh.position.set(0, -0.44, -1.15); this.zonePanel.setOpacity(0);
    this.ruckPanel = new UIPanel(0.9, 0.26, 800, { onTop: true, order: 1004 }); this.headEl.object3D.add(this.ruckPanel.mesh); this.ruckPanel.mesh.position.set(0, -0.3, -1); this.ruckPanel.setOpacity(0);
    this.lasers = {};
    for (const side of ['left', 'right']) { const beam = this.makeBeam(0x66ffff, 0.7, 0.004), dot = glowSprite('#ffffff', 0.05, 1); dot.visible = false; this.el.object3D.add(dot); this.lasers[side] = { beam, dot }; }
    this.pointerSide = 'right'; this.focus = { row: 0, col: 0 }; this.pauseFocus = { row: 0, col: 0 };
    this.energyDots = around(10, (i, a) => { const m = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), new T.MeshBasicMaterial({ color: '#66ffff', toneMapped: false })); m.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); this.gloveEls.left.object3D.add(m); return m; });
    const canvas = this.el.canvas;
    if (canvas) {
      const ndc = e => { const r = canvas.getBoundingClientRect(); return new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
      canvas.addEventListener('mousedown', e => { this.mouseDown = { x: e.clientX, y: e.clientY }; });
      canvas.addEventListener('mouseup', e => { if (this.mouseDown && Math.hypot(e.clientX - this.mouseDown.x, e.clientY - this.mouseDown.y) < 6) this.mouseClick = ndc(e); this.mouseDown = null; });
      canvas.addEventListener('mousemove', e => { this.mouseHover = ndc(e); }); canvas.addEventListener('mouseleave', () => { this.mouseHover = null; });
    }
    this.raycaster = new T.Raycaster();
  },
  showPanels(which) { this.menuPanel.mesh.visible = which === 'menu'; this.pausePanel.mesh.visible = which === 'pause'; this.helpPanel.mesh.visible = which === 'help'; for (const z of this.zones) z.tag.visible = !which; },
  pointAt(inp, panels) {
    let hover = null, click = null;
    for (const side of ['left', 'right']) { this.lasers[side].beam.visible = false; this.lasers[side].dot.visible = false; }
    if (inp.inVR) {
      for (const h of inp.hands) {
        if (h.desktop || !h.rayOrigin) continue;
        let best = null;
        for (const p of panels) { const hit = p.pick(h.rayOrigin, h.dir); if (hit && (!best || hit.dist < best.dist)) best = { ...hit, panel: p }; }
        const L = this.lasers[h.side], end = best ? best.point : h.rayOrigin.clone().addScaledVector(h.dir, 2.5);
        this.setBeam(L.beam, h.rayOrigin, end); L.beam.material.opacity = h.side === this.pointerSide ? 0.75 : 0.3;
        if (best) { L.dot.visible = true; L.dot.position.copy(best.point); }
        if (h.triggerPressed) this.pointerSide = h.side;
        if (best && best.btn) { if (!hover || h.side === this.pointerSide) hover = best; if (h.triggerPressed) { click = best; pulse(h, 0.4, 30); } }
      }
    } else if (this.mouseHover || this.mouseClick) {
      const cam = this.headEl.getObject3D('camera');
      const cast = v => { this.raycaster.setFromCamera(v, cam); let best = null; for (const p of panels) { const hit = p.pick(this.raycaster.ray.origin, this.raycaster.ray.direction); if (hit && (!best || hit.dist < best.dist)) best = { ...hit, panel: p }; } return best; };
      if (this.mouseHover) { const b = cast(this.mouseHover); if (b && b.btn) hover = b; }
      if (this.mouseClick) { const b = cast(this.mouseClick); if (b && b.btn) click = b; this.mouseClick = null; }
    }
    return { hover, click };
  },
  stickNav(inp, panel, focus) {
    const flick = (v, name) => { if (Math.abs(v) > 0.7 && this[name]) { this[name] = false; return Math.sign(v); } if (Math.abs(v) < 0.3) this[name] = true; return 0; };
    const dy = flick(inp.menuY, 'armY'), dx = flick(inp.menuX, 'armX');
    if (!dy && !dx) return null;
    const btns = panel.buttons, rows = [...new Set(btns.map(b => b.row))].sort((a, b) => a - b), cur = btns.find(b => b.row === focus.row && b.col === focus.col) || btns[0];
    let next = cur;
    if (dy) { const ri = rows.indexOf(cur.row), row = rows[Math.max(0, Math.min(rows.length - 1, ri - dy))], cx = cur.x + cur.w / 2; next = btns.filter(b => b.row === row).sort((a, b) => Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))[0] || cur; }
    else { const inRow = btns.filter(b => b.row === cur.row).sort((a, b) => a.col - b.col), i = inRow.indexOf(cur); next = inRow[Math.max(0, Math.min(inRow.length - 1, i + dx))] || cur; }
    if (next === cur) return null;
    focus.row = next.row; focus.col = next.col; beep(600, 40, 0.05);
    return next;
  },
  placeMenu(follow) {
    const m = this.$('menu').object3D;
    this.menuLostT = 0;
    if (!this.inVR) { m.position.set(0, 1.22, -1.55); m.rotation.set(0, 0, 0); return; }
    const a = this.rig.worldToLocal(this.headPos.clone()), f = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(a), yaw = Math.atan2(-f.x, -f.z);
    m.rotation.set(0, yaw, 0); m.position.set(a.x - Math.sin(yaw) * 1.5, Math.max(0.75, Math.min(1.7, a.y - 0.3)), a.z - Math.cos(yaw) * 1.5);
  },
  // In the headset a menu must never be somewhere you are not looking: if it has been out of view (or out of reach) for a
  // moment, it comes round to the front again.
  keepMenuInView(dt) {
    if (!this.inVR) return;
    const m = this.$('menu').object3D, a = this.rig.worldToLocal(this.headPos.clone()), f = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(a);
    const to = m.position.clone().sub(a), dist = Math.hypot(to.x, to.z); f.y = 0; to.y = 0;
    const off = f.lengthSq() > 1e-4 && to.lengthSq() > 1e-4 ? f.angleTo(to) : 0;
    this.menuLostT = off > 0.95 || dist > 2.4 || dist < 0.8 ? (this.menuLostT || 0) + dt : 0;
    if (this.menuLostT > 0.9 || !this.menuSeenVR) { this.menuSeenVR = true; this.placeMenu(true); }
  },
  // How to play: short pages you flip through. Reading them once (or doing the training) is what PLAY asks of a new pilot.
  openHelp(then) { this.helpOpen = true; this.helpPage = 0; this.helpKey = ''; this.afterHelp = then || null; this.armX = this.armY = false; this.placeMenu(this.pauseOpen); beep(600, 60, 0.06); },
  updateHelp(inp) {
    this.keepMenuInView(0.016);
    const panel = this.helpPanel, key = `${this.inVR}:${this.helpPage}:${this.lvl.id}:${this.mode}`;
    if (key !== this.helpKey) { this.helpKey = key; const m = { inVR: this.inVR, page: this.helpPage, level: this.lvl, target: this.winScore(), mode: this.state === 'training' ? 'rugby' : this.mode, first: !this.pilot().briefed }; panel.set((g, W, H, p) => paintBriefing5(g, W, H, p, m)); }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]), moved = this.stickNav(inp, panel, this.focus);
    const def = panel.buttons.find(b => b.id === 'next') || panel.buttons[0];
    const shown = hover ? hover.btn : moved || panel.buttons.find(b => b.row === this.focus.row && b.col === this.focus.col) || def;
    panel.highlight(shown, '#66ffff');
    const pick = click ? click.btn : inp.start ? shown : null;
    const close = done => { this.helpOpen = false; if (done) { this.pilot().briefed = true; writeSave(this.save); } if (!this.pauseOpen) this.placeMenu(false); this.armX = this.armY = false; this.menuKey = ''; };
    if (inp.pausePress) { const then = this.afterHelp; close(true); if (then === 'play') this.newMatch(); return; }   // closing early never nags you twice
    if (!pick) return;
    beep(700, 60, 0.06);
    if (pick.id === 'next') { if (this.helpPage < BRIEF5_PAGES - 1) this.helpPage++; else { close(true); if (this.afterHelp === 'play') this.newMatch(); } }
    else if (pick.id === 'back') this.helpPage = Math.max(0, this.helpPage - 1);
    else if (pick.id === 'train') { close(true); if (this.pauseOpen) this.closePause(true); this.startTraining(); }
    else if (pick.id === 'play') { close(true); if (this.pauseOpen) this.closePause(true); this.newMatch(); }
  },
  canPause() { return this.state !== 'ready' && this.state !== 'over'; },
  openPause() { if (!this.canPause() || this.pauseOpen) return; this.pauseOpen = true; this.pauseFocus = { row: 0, col: 0 }; this.armX = this.armY = false; this.pauseKey = ''; this.placeMenu(true); beep(500, 80, 0.08); },
  closePause(quiet) { this.pauseOpen = false; this.placeMenu(false); if (!quiet) beep(700, 80, 0.08); },
  updatePause(inp) {
    this.keepMenuInView(0.016);
    const panel = this.pausePanel, key = `${this.score.blue}:${this.score.orange}:${this.inVR}:${this.easy}:${this.flight}:${this.state}:${this.save.turnFollow}`;
    if (key !== this.pauseKey) {
      this.pauseKey = key;
      const model = { blue: this.score.blue, orange: this.score.orange, inVR: this.inVR, training: this.state === 'training', mode: this.mode, where: `${this.lvl.name}  ·  ${this.matchLabel()}`,
                      reach: this.inVR ? `ARMS: ${this.easy ? 'EASY REACH (point + trigger)' : 'FULL MOTION (swing to throw)'}` : 'ARMS: EASY REACH (PC)', flight: FLIGHT_LABEL[this.flight],
                      turn: this.save.turnFollow === false ? 'TURN: SNAP ONLY (RIGHT STICK)' : 'TURN: SNAP + FOLLOW YOUR HEAD', exitLabel: window.SURGE_APP ? 'QUIT SURGE LEAGUE' : 'EXIT TO HOME SCREEN', versionLabel: `PLAY ${VERSION_LINK.label}` };
      panel.set((g, W, H, p) => paintPause5(g, W, H, p, model));
    }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]);
    if (hover) { this.pauseFocus.row = hover.btn.row; this.pauseFocus.col = hover.btn.col; }
    this.stickNav(inp, panel, this.pauseFocus);
    const focused = panel.buttons.find(b => b.row === this.pauseFocus.row);
    panel.highlight(hover ? hover.btn : focused, '#66ffff');
    const pick = click ? click.btn : inp.start ? focused : null;
    if (!pick) return;
    if (pick.id === 'resume') this.closePause();
    else if (pick.id === 'help') this.openHelp();
    else if (pick.id === 'skip') { this.closePause(true); this.skipStep(); }
    else if (pick.id === 'reach') { if (this.inVR) { this.easy = !this.easy; this.save.reach = this.easy ? 'easy' : 'full'; writeSave(this.save); beep(640, 70, 0.06); } }
    else if (pick.id === 'flight') { this.flight = FLIGHT_MODES[(FLIGHT_MODES.indexOf(this.flight) + 1) % FLIGHT_MODES.length]; this.save.flight = this.flight; writeSave(this.save); beep(640, 70, 0.06); }
    else if (pick.id === 'turn') { this.save.turnFollow = this.save.turnFollow === false; writeSave(this.save); beep(640, 70, 0.06); }
    else if (pick.id === 'restart') { this.closePause(true); if (this.state === 'training') this.startTraining(); else this.newMatch(); }
    else if (pick.id === 'menu') { this.closePause(true); this.resetToMenu(); this.helpOpen = false; }
    else if (pick.id === 'version') this.leaveTo(VERSION_LINK.url);
    else this.exitGame();
  },
  leaveTo(url) {
    this.flash('Loading...', 5); beep(440, 200, 0.08);
    const session = this.el.renderer.xr.getSession && this.el.renderer.xr.getSession(), go = () => location.assign(url + (window.SURGE_APP ? '?app=1' : ''));
    if (session) session.end().then(go, go); else go();
  },
  exitGame() {
    if (window.SURGE_APP) { const session = this.el.renderer.xr.getSession && this.el.renderer.xr.getSession(), close = () => { try { window.close(); } catch (e) {} }; if (session) session.end().then(close, close); else close(); }
    else this.leaveTo('../../');
  },
  menuHint(btn) {
    if (!btn) return 'Point at anything to learn about it.';
    const p = Profiles.current(this.save);
    switch (btn.id) {
      case 'play': return this.pilot().briefed ? `${MODES5.find(x => x.id === this.mode).name}, 8 vs 8 on ${this.levelPick === 'shuffle' ? 'a surprise level' : this.lvl.name}. ${this.matchLabel()}. You fly for BLUE.` : 'First time: a 60-second briefing, then straight into the match.';
      case 'mode': return this.mode === 'rugby' ? 'Switch to ZONE CONTROL: no goals. Five rings to hold, two of them on moving platforms. New maps.' : 'Switch to STATION RUGBY: get the CORE into their goals.';
      case 'scroll-l': case 'scroll-r': return 'More levels this way.';
      case 'train': return this.pilot().licensed ? 'Fly the training again: every control, one step at a time.' : 'Earn your PILOT LICENSE: every control, one step at a time. Licensed pilots fly a gold board.';
      case 'help': return 'The rules, a map of this level, both controllers, rucks, fights and the penalty box.';
      case 'level': return btn.value === 'shuffle' ? 'A different level every match.' : `${LEVELS5.find(l => l.id === btn.value).name}. ${LEVELS5.find(l => l.id === btn.value).blurb}`;
      case 'bots': return `Bot strength ${this.level.rating}: how fast they fly, how well they aim, how hard they grip and punch.`;
      case 'length': return this.mode === 'control' ? 'First team to the target wins. Each ring you hold pays a point every 2 seconds; all five pay double.' : 'First team to the target wins. If the clock runs out first, most points wins; level means next score wins.';
      case 'fights': return this.fights ? 'Fights are ON: punch a rival who isn\'t carrying. Block, dodge, counter. A knockout sends them to the penalty box.' : 'Fights are OFF: no punching, nobody goes to the penalty box.';
      case 'player-prev': case 'player-next': return `Switch player. ${p.name}: ${p.wins} wins, ${p.losses} losses, ${p.draws} draws.`;
      case 'player-new': return 'Add a new player on this headset. Rename players on the 2D page.';
      case 'version': return VERSION_LINK.hint;
      case 'home': return window.SURGE_APP ? 'Close Surge League.' : 'Leave Surge League and go back to the Quest Games menu.';
    }
    return '';
  },
  menuModel() {
    const p = Profiles.current(this.save), r = this.state === 'over' && this.result;
    return { inVR: this.inVR, level: this.level.name, length: this.matchLabel(), versionLabel: VERSION_LINK.label, levelPick: this.levelPick, fights: this.fights, mode: this.mode, scroll: this.levelScroll, levels: this.modeLevels().map(l => l.id), licensed: !!this.pilot().licensed, briefed: !!this.pilot().briefed,
             profile: { name: p.name, sub: `${Profiles.rank(p.rating).name} ${Math.round(p.rating)}   ·   W${p.wins}  L${p.losses}  D${p.draws}` },
             result: r ? { blue: this.score.blue, orange: this.score.orange, line1: `Surge Score ${r.surge}${r.newBest ? ' (new best!)' : ''}   ·   Rank ${r.rank} ${Math.round(r.rating)}${r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta})` : ''}   ·   Goals ${this.stats.goals}  Steals ${this.stats.steals}  Passes ${this.stats.passes}  Rucks and fights won ${this.stats.hits}` } : null };
  },
  menuAction(btn) {
    if (btn.id === 'play') { if (!this.pilot().briefed) return this.openHelp('play'); this.newMatch(); return; }
    if (btn.id === 'train') { this.startTraining(); return; }
    if (btn.id === 'help') return this.openHelp();
    if (btn.id === 'version') return this.leaveTo(VERSION_LINK.url);
    if (btn.id === 'home') return this.exitGame();
    if (btn.id === 'scroll-l' || btn.id === 'scroll-r') { this.levelScroll = Math.max(0, Math.min(this.modeLevels().length + 1 - 4, this.levelScroll + (btn.id === 'scroll-r' ? 1 : -1))); beep(600, 40, 0.05); return; }
    if (btn.id === 'mode') {
      this.mode = this.mode === 'rugby' ? 'control' : 'rugby'; this.save.mode5 = this.mode; this.levelPick = this.picks[this.mode]; this.levelScroll = 0; this.showPick();
      this.enterLevel(this.pickedLevel() || this.modeLevels()[0]); this.resetToMenu(); this.helpOpen = false; this.blinkT = 0.3;
    }
    else if (btn.id === 'level') {
      this.levelPick = this.picks[this.mode] = btn.value; this.save[this.mode === 'control' ? 'levelC' : 'level5'] = btn.value;
      if (btn.value !== 'shuffle' && this.lvl.id !== btn.value) { this.enterLevel(LEVELS5.find(l => l.id === btn.value)); this.resetToMenu(); this.helpOpen = false; this.blinkT = 0.3; }
    }
    else if (btn.id === 'bots') { const i = (LEVELS.indexOf(this.level) + 1) % LEVELS.length; this.level = LEVELS[i]; this.save.level = i; }
    else if (btn.id === 'length') { const i = (MATCHES.indexOf(this.matchCfg) + 1) % MATCHES.length; this.matchCfg = MATCHES[i]; this.save.match5 = i; this.timeLeft = this.matchCfg.secs; }
    else if (btn.id === 'fights') { this.fights = !this.fights; this.save.fights = this.fights; }
    else if (btn.id === 'player-prev' || btn.id === 'player-next') { const list = this.save.profiles, i = list.findIndex(x => x.id === this.save.active); this.save.active = list[(i + (btn.id === 'player-next' ? 1 : -1) + list.length) % list.length].id; this.buildPlayerRide(); }
    else if (btn.id === 'player-new') { const np = Profiles.make(`PLAYER ${this.save.profiles.length + 1}`); this.save.profiles.push(np); this.save.active = np.id; this.buildPlayerRide(); this.flash(`Welcome, ${np.name}!`, 2); }
    writeSave(this.save); beep(700, 50, 0.06);
  },
  updateMenu(inp) {
    this.keepMenuInView(0.016);
    const panel = this.menuPanel, model = this.menuModel(), key = JSON.stringify(model);
    if (key !== this.menuKey) { this.menuKey = key; panel.set((g, W, H, p) => paintMenu5(g, W, H, p, model)); }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]);
    if (hover) { this.focus.row = hover.btn.row; this.focus.col = hover.btn.col; }
    const moved = this.stickNav(inp, panel, this.focus);
    // stick onto an arrow at the end of the level row: slide the row instead of stopping on the arrow
    if (moved && (moved.id === 'scroll-l' || moved.id === 'scroll-r')) { const dir = moved.id === 'scroll-r' ? 1 : -1; this.menuAction(moved); this.focus.col = dir > 0 ? 4 : 1; }
    const focused = panel.buttons.find(b => b.row === this.focus.row && b.col === this.focus.col) || panel.buttons[0], shown = hover ? hover.btn : focused;
    panel.highlight(shown, '#66ffff');
    const hint = this.msgT > 0 && this.state !== 'over' ? this.msg : this.menuHint(shown);
    if (hint !== this.hintText) { this.hintText = hint; panel.hint = hint; panel.dirty = true; const page = document.getElementById('status'); if (page) page.textContent = hint; }
    if (click) this.menuAction(click.btn); else if (inp.start && focused) this.menuAction(focused);
  },

  // ---------------------------------------------------------------- rendering
  render(inp, dt) {
    const d = this.ball, inPlay = this.state !== 'ready' && this.state !== 'over', cols = this.lvl.theme.aurora;
    this.ballObj.position.copy(d.pos);
    const bc = d.holder ? TEAM_COLOR[this.teamOf(d.holder)] : '#66ffff';
    if (this.ballColor !== bc) { this.ballColor = bc; this.ballMat.emissive.set(bc); this.ballRingMat.color.set(bc); this.ballGlow.material.color.set(bc); this.trail.material.color.set(bc); this.ballMark.material.color.set(d.holder ? bc : '#ffffff'); }
    this.ballRings[0].rotation.y += dt * 2.2; this.ballRings[1].rotation.x += dt * 1.7;
    // the marker keeps the same size in your eye however far the core is, and shows through walls
    const bd = d.pos.distanceTo(this.headPos); this.ballMark.scale.setScalar(Math.max(1.2, bd * 0.045)); this.ballMark.visible = inPlay && d.holder !== 'player' && bd > 5; this.ballMark.material.opacity = 0.35 + 0.2 * Math.sin(this.time * 5);
    const ch = this.charge; this.chargeRing.visible = !!ch;
    if (ch) { const p = Math.min(1, ch.t / CHARGE_TIME); this.chargeRing.scale.setScalar(0.7 + p * 1.3); this.chargeRing.material.color.set(p >= 1 ? '#ff6a2b' : p > 0.5 ? '#ffd166' : '#ffffff'); this.chargeRing.lookAt(this.headPos); }
    const tp = this.trail.geometry.attributes.position, flying = d.holder === null && d.vel.lengthSq() > 36;
    for (let i = tp.count - 1; i > 0; i--) tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), tp.getZ(i - 1));
    tp.setXYZ(0, d.pos.x, d.pos.y, d.pos.z);
    if (!flying) for (let i = 1; i < tp.count; i++) tp.setXYZ(i, d.pos.x, d.pos.y, d.pos.z);
    tp.needsUpdate = true; this.trail.visible = flying;
    const shown = new Set(this.state === 'training' ? this.matchBots : this.bots);
    for (const b of this.bots) {
      if (!shown.has(b)) { b.obj.visible = false; b.reach.visible = false; continue; }
      b.obj.visible = true; b.obj.position.copy(b.pos); b.obj.lookAt(tmp.copy(b.pos).add(tmp2.copy(b.facing).setY(b.facing.y * 0.4)));
      animateRider(b, dt, this.time, d.pos);
      b.punchT = Math.max(0, (b.punchT || 0) - dt); b.hitT = Math.max(0, (b.hitT || 0) - dt * 3);
      // in a fight with you: the arm goes back before a punch (further for a heavy one), comes up across the chest on guard
      const duel = b.duel, wind = duel && duel.bot === b ? duel.wind : null, winding = !!wind, heavy = wind && wind.kind === 'heavy', guard = duel && duel.bot === b && duel.guardT > 0 && !wind;
      const wrestle = b.ruck ? Math.sin(this.time * 18 + b.idx) * 0.4 : 0;
      b.arm.rotation.x = b.punchT > 0 ? -1.6 * Math.sin((1 - b.punchT / 0.25) * Math.PI) : winding ? (heavy ? 1.5 : 0.9) * Math.min(1, (wind.t0 - wind.t) / 0.15) : guard ? -1.75 : b.ruck ? -1.1 + wrestle : duel ? -0.9 + Math.sin(this.time * 9 + b.idx) * 0.25 : d.holder === b ? -0.5 : b.reachT > 0 ? -1.3 : 0;
      b.arm.rotation.z = guard ? 0.75 : 0;
      const aura = this.buff[b.team] > 0 ? 0.18 + 0.1 * Math.sin(this.time * 6 + b.idx) : 0;
      if (heavy) b.suitMat.emissive.setRGB(0.9, 0.62, 0.05).multiplyScalar(0.6 + 0.4 * Math.sin(this.time * 30)); else if (winding) b.suitMat.emissive.setRGB(0.7, 0.05, 0.1); else if (guard) b.suitMat.emissive.setRGB(0.05, 0.12, 0.3); else if (aura) b.suitMat.emissive.set(cols[0]).multiplyScalar(aura); else b.suitMat.emissive.setScalar(Math.max(b.hitT * 0.8, b.ruck ? 0.12 + Math.abs(wrestle) * 0.25 : b.stun > 0 ? 0.2 : 0));
      const dist = b.pos.distanceTo(this.headPos);
      b.tag.visible = dist < 26; b.xray.visible = this.sightT > 0; b.carryRing.visible = d.holder === b; if (b.carryRing.visible) b.carryRing.rotation.z += dt * 3;
      // the arm they reach with
      if (b.reachT > 0 && d.holder !== 'player') this.setBeam(b.reach, tmp.copy(b.pos).add(tmp3.set(0, 1.25, 0)), d.pos); else b.reach.visible = false;
    }
    this.bursts.update(dt);
    // ruck: lines from every bound rider to the middle
    const r = this.ruck; this.links.visible = this.ruckGlow.visible = !!r;
    if (r) {
      const lp = this.links.geometry.attributes.position, lc = this.links.geometry.attributes.color, col = new T.Color(); let k = 0;
      for (const x of [...r.A, ...r.B]) { if (k >= 16) break; const p = x === 'player' ? this.bodyPos() : tmp.copy(x.pos).add(tmp3.set(0, 1, 0)); col.set(TEAM_COLOR[this.teamOf(x)]); lp.setXYZ(k, p.x, p.y, p.z); lc.setXYZ(k, col.r, col.g, col.b); k++; lp.setXYZ(k, r.at.x, r.at.y, r.at.z); lc.setXYZ(k, 1, 0.85, 0.4); k++; }
      for (; k < 16; k++) lp.setXYZ(k, r.at.x, r.at.y, r.at.z);
      lp.needsUpdate = lc.needsUpdate = true;
      this.ruckGlow.position.copy(r.at); this.ruckGlow.scale.setScalar(4 + (r.A.length + r.B.length) * 0.6 + Math.sin(this.time * 14) * 0.5);
    }
    const st = this.world.meshes;
    st.sightRings.forEach((ring, i) => { ring.rotation.x += dt * (0.3 + i * 0.15); ring.rotation.y += dt * (0.2 + i * 0.1); });
    st.ringMat.color.set(this.inSight ? '#66ffff' : '#e8f4ff'); st.sightGlow.material.opacity = this.inSight ? 0.7 : 0.25 + Math.sin(this.time * 2) * 0.05;
    this.world.back.update(dt, this.time); this.world.meshes.update(dt, this.time, this.headPos.y);
    if (WORLD.loop) this.world.back.group.position.y = this.headPos.y;
    const fadeM = this.fadeMat(); this.blinkT = Math.max(0, (this.blinkT || 0) - dt);
    if (fadeM) { if (this.blinkT > 0) { fadeM.color.set('#000000'); fadeM.opacity = Math.min(1, this.blinkT * 4); } else if (this.hurtFlash > 0.02) { fadeM.color.set('#c0141e'); fadeM.opacity = this.hurtFlash * 0.45; } else fadeM.opacity = 0; }
    this.pointLocator(this.ballArrow, d.pos, d.holder === null ? '#ffffff' : TEAM_COLOR[this.teamOf(d.holder)], inPlay && d.holder !== 'player');
    this.callMark.visible = this.callT > 0; if (this.callMark.visible) { const h = this.rig.worldToLocal(tmp.copy(this.headPos)); this.callMark.position.set(h.x, h.y + 0.55, h.z); this.callMark.scale.setScalar(0.7 + Math.sin(this.time * 14) * 0.25); }
    for (const side of ['left', 'right']) {
      const h = inp.hands.find(x => x.side === side && !x.desktop), gloveObj = this.gloveEls[side].object3D, arm = side === 'left' ? this.beams.armL : this.beams.armR, aim = side === 'left' ? this.beams.aimL : this.beams.aimR;
      gloveObj.visible = !!h;
      if (!h) { arm.visible = false; aim.visible = false; continue; }
      gloveObj.position.copy(this.rig.worldToLocal(h.glove.clone())); this.setBeam(arm, h.shoulder, h.glove);
      const gm = this.gloveEls[side].getObject3D('mesh'), gc = this.buff.blue > 0 ? cols[0] : this.pilot().licensed ? '#ffd166' : '#66ffff';
      if (gm && gm.userData.c !== gc) { gm.userData.c = gc; gm.material.color.set(gc); gm.material.emissive.set(gc); }
      if (this.easy && inPlay) this.setBeam(aim, h.glove, h.glove.clone().addScaledVector(h.dir, 15)); else aim.visible = false;
    }
    const sm = this.steerMark, showSteer = this.live && this.inVR && this.handSteer && this.steerDir;
    sm.visible = !!showSteer;
    if (showSteer) { sm.position.copy(this.headPos).addScaledVector(this.steerDir, 6); sm.lookAt(this.headPos); sm.material.opacity = 0.12 + Math.min(1, this.thrustLevel || 0) * 0.4; sm.material.color.set(this.dashT > 0 ? '#ff6a2b' : this.boosting ? '#ffd166' : '#66ffff'); }
    const f = this.energy / ENERGY_MAX; this.energyDots.forEach((m, i) => m.material.color.set(f * 10 > i + 0.5 ? (this.dashCool > 0 ? '#ffd166' : '#66ffff') : '#203040'));
  },
  fadeMat() { if (!this.fadeMatCache) { const m = this.$('fade').getObject3D('mesh'); if (!m) return null; m.renderOrder = 1000; this.fadeMatCache = m.material; } return this.fadeMatCache; },
  pointLocator(mesh, target, color, show) {
    const head = this.rig.worldToLocal(tmp2.copy(this.headPos)), local = this.rig.worldToLocal(tmp3.copy(target)), dx = local.x - head.x, dz = local.z - head.z, len = Math.hypot(dx, dz) || 1;
    mesh.visible = show && target.distanceTo(this.headPos) > 6;
    if (!mesh.visible) return;
    mesh.position.set(head.x + dx / len * 0.75, (this.cockpitY || 0) + 0.72, head.z + dz / len * 0.75); mesh.lookAt(target); mesh.material.color.set(color);
  },
  updateComfort(dt) {
    if (!this.vigMat) { const v = this.$('vignette').getObject3D('mesh'); if (!v) return; v.material.map = vignetteTexture(); v.material.needsUpdate = true; v.renderOrder = 999; this.vigMat = v.material; }
    const target = Math.min(0.85, this.accelMag / 34 + Math.max(0, this.vel.length() - 12) / 12 + this.impactFlash * 0.8 + Math.max(0, (this.followRate || 0) - 0.15) * 0.6);
    this.vig += (target - this.vig) * (1 - Math.exp(-8 * dt)); this.vigMat.opacity = this.vig;
  },
  updateHud(dt) {
    const inMenu = this.state === 'ready' || this.state === 'over' || this.pauseOpen || this.helpOpen;
    const lookDown = this.inVR ? this.headFwd.clone().applyQuaternion(this.rig.quaternion.clone().invert()).y < -0.45 : !!this.keys.Tab;
    const want = !inMenu && this.state !== 'training' && (this.state === 'countdown' || this.state === 'scored' || this.state === 'penalty' || (this.state === 'playing' && (this.timeLeft < 10 || this.sudden)) || lookDown);
    this.scoreAlpha = (this.scoreAlpha || 0) + ((want ? 1 : 0) - (this.scoreAlpha || 0)) * Math.min(1, dt * (want ? 10 : 4));
    this.scorePanel.setOpacity(this.scoreAlpha);
    const tl = Math.max(0, this.timeLeft), m = Math.floor(tl / 60), sec = String(Math.floor(tl % 60)).padStart(2, '0'), d = this.ball, who = d.holder ? this.teamOf(d.holder) : null;
    const ctl = this.mode === 'control' && this.state !== 'training';
    const sb = { blue: Math.floor(this.score.blue), orange: Math.floor(this.score.orange), clock: this.sudden ? 'NEXT' : `${m}:${sec}`, clockWarn: this.timeLeft < 10 || this.sudden, mode: `FIRST TO ${this.winScore()}`, realm: this.lvl.name,
                 power: d.holder === 'player' ? (ctl ? 'YOU HAVE THE CORE: you count as 3' : 'YOU HAVE THE CORE') : who === 'blue' ? 'BLUE HAS THE CORE' : who ? 'ORANGE HAS THE CORE' : 'LOOSE CORE', powerReady: who === 'blue',
                 event: this.buff.blue > 0 ? `AURORA ${Math.ceil(this.buff.blue)}s` : ctl && this.held ? `RINGS: BLUE ${this.held.blue}  ·  ORANGE ${this.held.orange}` : this.lastEvent };
    const key = JSON.stringify(sb);
    if (this.scoreAlpha > 0.01 && key !== this.scoreKey) { this.scoreKey = key; this.scorePanel.set((g, W, H, p) => paintScoreboard(g, W, H, p, sb)); }
    this.scorePanel.update();
    let text = this.msgT > 0 && !(inMenu && this.state !== 'over') ? this.msg : '', opts = this.msgOpts || {};
    if (!text && this.playerBin > 0) { text = `PENALTY BOX: ${Math.ceil(this.playerBin)} s`; opts = { color: '#ff4f6a', sub: 'You can watch the whole field from here.' }; }
    if (!text && this.state === 'penalty' && this.penalty && this.penalty.shooter === 'player' && !this.penalty.shot) { text = `PENALTY: ${this.inVR ? 'point at a hole, hold the trigger, let go' : 'look at a hole, hold Space, let go'} (${Math.ceil(this.penalty.t)})`; opts = { color: '#ffd166' }; }
    const tkey = text + '|' + (opts.big ? 1 : 0) + (opts.color || '') + (opts.sub || '') + (opts.hint ? opts.hint.side + opts.hint.part : '');
    if (tkey !== this.toastKey) { this.toastKey = tkey; const t = { text, ...opts }; this.toastPanel.set((g, W, H, p) => paintToast5(g, W, H, p, t)); }
    this.toastPanel.update();
    this.toastAlpha = (this.toastAlpha || 0) + ((text ? 1 : 0) - (this.toastAlpha || 0)) * Math.min(1, dt * 8); this.toastPanel.setOpacity(this.toastAlpha);
    const f = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(this.rig.worldToLocal(this.headPos.clone())); f.y = 0;
    if (f.lengthSq() > 1e-4) {
      f.normalize(); const h = this.rig.worldToLocal(this.headPos.clone()), goal = h.clone().addScaledVector(f, 1.35).add(new T.Vector3(0, -0.12, 0));
      this.toastPos = this.toastPos ? this.toastPos.lerp(goal, 1 - Math.exp(-5 * dt)) : goal.clone();
      this.toastPanel.mesh.position.copy(this.toastPos); this.toastPanel.mesh.lookAt(this.rig.localToWorld(h.clone()));
    }
    // ruck or fight meter
    const r = this.ruck, mineR = r && this.inRuck('player'), duel = this.duels.find(x => x.a === 'player' || x.b === 'player');
    const show = mineR || duel;
    // ZONE CONTROL: the five rings and both scores, low in your view the whole match
    const zshow = ctl && !inMenu && !show && (this.state === 'playing' || this.state === 'countdown');
    this.zoneAlpha = (this.zoneAlpha || 0) + ((zshow ? 1 : 0) - (this.zoneAlpha || 0)) * Math.min(1, dt * 8); this.zonePanel.setOpacity(this.zoneAlpha * 0.92);
    if (ctl && this.zoneAlpha > 0.01) {
      const zm = { blue: Math.floor(this.score.blue), orange: Math.floor(this.score.orange), zones: this.zones.map(z => ({ id: z.id, own: z.own, cap: Math.round(z.cap * 12) / 12, me: z === this.myZone, fight: z.n.blue > 0 && z.n.orange > 0 })) };
      const zk = JSON.stringify(zm); if (zk !== this.zoneKey) { this.zoneKey = zk; this.zonePanel.set((g, W, H, p) => paintZones(g, W, H, p, zm)); }
      this.zonePanel.update();
    }
    this.ruckAlpha = (this.ruckAlpha || 0) + ((show ? 1 : 0) - (this.ruckAlpha || 0)) * Math.min(1, dt * 10); this.ruckPanel.setOpacity(this.ruckAlpha);
    if (mineR) {
      const A = r.A.includes('player'), cm = { kind: 'ruck', you: Math.round((A ? r.p : -r.p) * 40) / 40, inVR: this.inVR, carrier: r.b === 'player', strip: this.teamOf('player') !== this.teamOf(r.b), mine: (A ? r.A : r.B).length, theirs: (A ? r.B : r.A).length, squeeze: this.lastSqueeze || 0 };
      const ck = JSON.stringify(cm); if (ck !== this.ruckKey) { this.ruckKey = ck; this.ruckPanel.set((g, W, H, p) => paintRuck(g, W, H, p, cm)); }
      this.ruckPanel.update();
    } else if (duel) {
      const A = duel.a === 'player', q = v => Math.ceil(v / 4) * 4;
      const cm = { kind: 'duel', you: q(duel.hp[A ? 0 : 1]), them: q(duel.hp[A ? 1 : 0]), cue: duel.wind ? duel.wind.kind : duel.counterT > 0 ? 'counter' : duel.guardT > 0 ? 'guard' : 'open', secs: Math.ceil(DUEL_TIME - duel.t), inVR: this.inVR, off: duel.offBall };
      const ck = JSON.stringify(cm); if (ck !== this.ruckKey) { this.ruckKey = ck; this.ruckPanel.set((g, W, H, p) => paintRuck(g, W, H, p, cm)); }
      this.ruckPanel.update();
    }
  }
});
