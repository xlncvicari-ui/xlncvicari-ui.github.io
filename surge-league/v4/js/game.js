// Surge League version 4: Station Rugby. One A-Frame component runs the menus, the match, the bots and the station.
// Rules in one breath: 8 vs 8 in zero gravity. Carry, pass and throw the CORE into the other team's goals: the three holes
// in their lobby wall (1 point) or the deep goal behind it, reached round a loop (3 points). Bank it off a wall for +1, score
// from far away for +1. Grab the CORE straight out of a rival's hands, or fly into them to CLASH (you both stop and wrestle
// for it). Hitting a rival who doesn't have the CORE is a foul: their team gets a penalty shot worth 2.
AFRAME.registerComponent('surge-game', {
  ...TEAMAI,
  init() {
    this.ready = false;
    if (this.el.hasLoaded) this.setup(); else this.el.addEventListener('loaded', () => this.setup());
  },

  setup() {
    const $ = id => document.getElementById(id);
    this.$ = $;
    this.rig = $('rig').object3D;
    this.headEl = $('head');
    this.gloveEls = { left: $('gloveL'), right: $('gloveR') };
    this.ball = { pos: new T.Vector3(0, ST.CY, 0), vel: new T.Vector3(), holder: null, hand: null, pulledBy: null, snapping: false, passTo: null, passT: 0,
                  lastThrower: null, noCatch: 0, throwT: -99, bankT: -99, throwFrom: new T.Vector3(), spin: 0 };
    this.vel = new T.Vector3();
    this.headPos = new T.Vector3(); this.headFwd = new T.Vector3(0, 0, -1);
    this.prevButtons = {};
    this.track = { left: { real: [], glove: [], q: null, omega: new T.Vector3() }, right: { real: [], glove: [], q: null, omega: new T.Vector3() } };
    this.keys = {};
    this.save = Profiles.init(loadSave());
    this.flight = FLIGHT_MODES.includes(this.save.flight) ? this.save.flight : 'hands';
    this.level = LEVELS[Math.min(LEVELS.length - 1, this.save.level || 1)];
    this.matchLen = MATCH_LENGTHS.includes(this.save.matchLen) ? this.save.matchLen : 300;
    this.easy = this.save.reach !== 'full';
    this.snapArmed = true; this.pingT = 0; this.msg = ''; this.msgT = 0; this.time = 0; this.tipGap = 0; this.sightT = 0; this.energy = ENERGY_MAX; this.energyIdle = 0;
    this.boostT = 0; this.boostCool = 0; this.impactFlash = 0; this.accelMag = 0; this.vig = 0; this.playerStun = 0; this.playerGrace = 0; this.lastEvent = '';
    addEventListener('keydown', e => { if (['Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); this.keys[e.code] = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.el.addEventListener('enter-vr', () => {
      const session = this.el.renderer.xr.getSession();
      if (session) session.addEventListener('visibilitychange', () => { this.paused = session.visibilityState === 'hidden'; if (this.paused) this.openPause(); });
      this.calibrateT = 1.2;
    });
    this.el.addEventListener('exit-vr', () => { this.paused = false; this.setCockpit(0); });
    this.pauseOpen = false;
    const renderer = this.el.renderer, scene = this.el.object3D;
    if (window.SURGE_GRADE) renderer.toneMapping = T.CustomToneMapping;
    this.space = buildSpace(scene);
    const env = envFromSky(renderer, this.space.skyTex);
    scene.environment = env; scene.environmentIntensity = 0.55; scene.background = new T.Color('#02040a');
    this.station = buildStation(scene, env);
    this.setLights();
    this.buildBall();
    this.buildBots();
    this.buildPlayerRide();
    this.buildFx();
    this.buildPanels();
    this.score = { blue: 0, orange: 0 };
    this.matchBots = []; this.state = 'ready'; this.timeLeft = this.matchLen;
    this.stats = this.freshStats();
    this.resetToMenu();
    this.ready = true;
  },

  freshStats() { return { goals: 0, deep: 0, tricks: 0, steals: 0, passes: 0, hits: 0, fouls: 0, comet: 0 }; },
  add(tag, attrs, parent = this.el) {
    const e = document.createElement(tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  },
  setLights() {
    const hemi = this.$('hemi').getObject3D('light'), sun = this.$('sun').getObject3D('light');
    if (hemi) { hemi.color.set('#e4ecff'); hemi.groundColor.set('#46505f'); hemi.intensity = 1.25; }
    if (sun) { sun.color.set('#fff1dc'); sun.intensity = 1.1; sun.position.set(700, 420, -600); }
  },

  // ---------------------------------------------------------------- world bits
  buildBall() {
    const g = new T.Group();
    this.ballMat = new T.MeshStandardMaterial({ color: '#e9fbff', emissive: '#66ffff', emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3 });
    g.add(new T.Mesh(new T.SphereGeometry(BALL_R, 24, 16), this.ballMat));
    this.ballRingMat = new T.MeshBasicMaterial({ color: '#66ffff', toneMapped: false });
    this.ballRings = [0, 1].map(i => { const m = new T.Mesh(new T.TorusGeometry(BALL_R * 1.35, 0.02, 6, 40), this.ballRingMat); m.rotation.set(i ? Math.PI / 2 : 0.4, i ? 0.4 : 0, 0); g.add(m); return m; });
    this.ballGlow = glowSprite('#9ff6ff', 2.2, 0.5); g.add(this.ballGlow);
    this.ballXray = glowSprite('#ffffff', 1.6, 0.9); this.ballXray.material.depthTest = false; this.ballXray.renderOrder = 951; this.ballXray.visible = false; g.add(this.ballXray);
    this.ballObj = g; this.el.object3D.add(g);
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(new Float32Array(18 * 3), 3));
    this.trail = new T.Line(tg, new T.LineBasicMaterial({ color: '#9ff6ff', transparent: true, opacity: 0.6 })); this.trail.frustumCulled = false; this.el.object3D.add(this.trail);
  },
  buildPlayerRide() {
    this.rideObj = buildRide('gym', TEAM_COLOR.blue);
    this.rideObj.position.y = 0.095; this.rideObj.rotation.y = Math.PI; this.rideObj.scale.setScalar(1.05);
    this.$('ride').object3D.add(this.rideObj);
  },
  buildFx() {
    const scene = this.el.object3D;
    this.bursts = makeBurstPool(scene, 5, 40);
    const beam = (color, opacity, radius) => { const geo = new T.CylinderGeometry(radius, radius, 1, 6); geo.translate(0, 0.5, 0); const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity })); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
    this.makeBeam = beam;
    this.beams = { pull: beam(0x8ff7ff, 0.8, 0.015), armL: beam(0x66ffff, 0.5, 0.03), armR: beam(0x66ffff, 0.5, 0.03), aimL: beam(0xffffff, 0.22, 0.006), aimR: beam(0xffffff, 0.22, 0.006) };
    this.steerMark = new T.Mesh(new T.RingGeometry(0.2, 0.26, 32), new T.MeshBasicMaterial({ color: '#66ffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.steerMark.visible = false; scene.add(this.steerMark);
    const arrow = () => { const g = new T.ConeGeometry(0.045, 0.15, 8); g.rotateX(Math.PI / 2); const m = new T.Mesh(g, new T.MeshBasicMaterial({ toneMapped: false })); m.visible = false; this.rig.add(m); return m; };
    this.ballArrow = arrow();
    // training target ring
    this.target = new T.Group();
    this.target.add(new T.Mesh(new T.TorusGeometry(1.8, 0.09, 8, 48), new T.MeshBasicMaterial({ color: '#ffd166', toneMapped: false })), glowSprite('#ffd166', 4, 0.35));
    this.target.visible = false; scene.add(this.target);
  },
  setBeam(m, a, b) {
    tmp2.subVectors(b, a); const len = tmp2.length();
    if (len < 0.01) { m.visible = false; return; }
    m.position.copy(a); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(UP, tmp2.divideScalar(len)); m.visible = true;
  },

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

  // ---------------------------------------------------------------- match flow
  resetToMenu() {
    this.state = 'ready'; this.training = null; this.penalty = null; this.clash = null;
    this.matchBots = this.bots; this.lineUp(); this.placePlayer(0, 9, 30);
    for (const b of this.bots) b.obj.visible = true;
    this.ball.pos.set(0, ST.CY, 0); this.ball.vel.set(0, 0, 0); this.ball.holder = null; this.ball.passTo = null;
    this.target.visible = false;
    this.helpOpen = !this.save.seenBrief4; this.helpPage = 0;
  },
  newMatch() {
    this.score = { blue: 0, orange: 0 }; this.timeLeft = this.matchLen; this.result = null; this.stats = this.freshStats();
    this.training = null; this.penalty = null; this.clash = null; this.matchBots = this.bots; this.lastEvent = '';
    for (const b of this.bots) b.obj.visible = true;
    this.target.visible = false;
    this.kickoff();
    this.state = 'countdown'; this.countT = 3; this.flash('3', 0.9, { big: true });
    if (this.inVR) this.calibrate();
  },
  placePlayer(x, y, z, yaw = 0) {
    this.rig.position.set(x, y - 1.4, z); this.rig.rotation.set(0, yaw, 0); this.vel.set(0, 0, 0);
    this.steerDir = null; this.rideTilt = null; this.snapKick = 0;
  },
  kickoff() {
    const d = this.ball;
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, passTo: null, lastThrower: null, noCatch: 0, throwT: -99, bankT: -99, spin: 0 });
    d.pos.set(0, ST.CY, 0); d.vel.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0);
    this.lineUp(); this.placePlayer(0, 9, 30);
    this.clash = null; this.penalty = null; this.energy = ENERGY_MAX; this.playerStun = 0; this.playerGrace = 0;
    for (const b of this.bots) b.clash = false;
  },
  calibrate() { const y = this.rig.worldToLocal(this.headPos.clone()).y; this.setCockpit(Math.max(-0.5, Math.min(0.7, y - 1.25))); },
  setCockpit(y) { this.cockpitY = y; this.$('cockpit').object3D.position.y = y; },
  updateState(dt) {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countT); this.countT -= dt;
      if (Math.ceil(this.countT) !== before && this.countT > 0) { this.flash(String(Math.ceil(this.countT)), 0.9, { big: true }); beep(520, 120, 0.1); }
      if (this.countT <= 0) { this.state = 'playing'; this.flash('GO!', 1.2, { big: true, color: '#66ffff' }); beep(880, 250, 0.12); }
    } else if (this.state === 'scored') {
      this.stateT -= dt;
      if (this.stateT <= 0) { this.kickoff(); this.state = 'countdown'; this.countT = 3; this.flash('3', 0.9, { big: true }); }
    } else if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.endMatch();
    } else if (this.state === 'penalty') this.updatePenalty(dt);
  },
  endMatch() {
    this.state = 'over'; this.timeLeft = 0; this.clash = null; this.penalty = null;
    const res = Profiles.record(this.save, { mode: 'station', arena: 'meridian', realm: 'station', level: this.level.name, ranked: true, botRating: this.level.rating,
                                             scoreFor: this.score.blue, scoreAgainst: this.score.orange, stats: this.stats });
    this.result = res;
    const won = this.score.blue > this.score.orange, draw = this.score.blue === this.score.orange;
    this.flash(won ? 'YOU WIN!' : draw ? 'DRAW' : 'ORANGE WINS', 3, { big: true, color: won ? '#66ffff' : '#ffd166' });
    beep(won ? 660 : 330, 400, 0.12); beep(won ? 880 : 262, 500, 0.1, 'sine', 0.2);
  },

  // ---------------------------------------------------------------- input (same as version 3)
  trackVel(list, p, dt) {
    list.push({ p: p.clone(), dt }); if (list.length > 5) list.shift();
    let sum = 0; for (let i = 1; i < list.length; i++) sum += list[i].dt;
    return sum > 0 ? list[list.length - 1].p.clone().sub(list[0].p).divideScalar(sum) : new T.Vector3();
  },
  readInput(dt) {
    const fake = window.SURGE_FAKE_XR || null;
    const inVR = !!fake || (this.el.is('vr-mode') && this.el.renderer.xr.isPresenting);
    const cam = this.headEl.getObject3D('camera');
    const fwd = cam.getWorldDirection(new T.Vector3()), headPos = cam.getWorldPosition(new T.Vector3());
    const rigUp = UP.clone().applyQuaternion(this.rig.quaternion), right = new T.Vector3().crossVectors(fwd, rigUp);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0).applyQuaternion(this.rig.quaternion); else right.normalize();
    const inp = { inVR, fwd, right, rigUp, headPos, moveX: 0, moveY: 0, climb: 0, turnX: 0, boost: false, boostHeld: false, level: false, pass: false, start: false,
                  pausePress: false, menuX: 0, menuY: 0, tap: false, hands: [] };
    if (inVR) {
      const xr = this.el.renderer.xr, frame = fake ? null : this.el.frame || xr.getFrame(), ref = fake ? null : xr.getReferenceSpace();
      const rigQ = this.rig.quaternion, headLocal = this.rig.worldToLocal(headPos.clone()), rightLocal = right.clone().applyQuaternion(rigQ.clone().invert());
      for (const src of fake ? fake.sources(this) : xr.getSession().inputSources) {
        const gp = src.gamepad, side = src.handedness;
        if (!gp || (side !== 'left' && side !== 'right')) continue;
        const sx = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0), sy = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
        const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
        if (this.edge(side + 'Stick', btn(3))) inp.boost = true;
        if (btn(3)) inp.boostHeld = true;
        if (this.edge(side + 'Face', btn(4))) { inp.level = true; if (side === 'right') inp.start = true; }
        if (side === 'left') { inp.moveX = sx; inp.moveY = -sy; if (this.edge('lY', btn(5))) inp.pausePress = true; }
        else { inp.turnX = sx; inp.climb = -sy; }
        const gripPose = fake ? src.gripPose : frame && ref && src.gripSpace ? frame.getPose(src.gripSpace, ref) : null;
        const rayPose = fake ? src.rayPose : frame && ref ? frame.getPose(src.targetRaySpace, ref) : null;
        if (!gripPose || !rayPose) continue;
        const gpos = gripPose.transform.position, ro = rayPose.transform.orientation;
        const realLocal = new T.Vector3(gpos.x, gpos.y, gpos.z);
        const shoulder = headLocal.clone().add(new T.Vector3(0, -0.25, 0)).addScaledVector(rightLocal, side === 'left' ? -0.18 : 0.18);
        const offset = realLocal.clone().sub(shoulder), r = offset.length();
        const reach = r < ARM_START ? r : Math.min(ARM_MAX, r + ARM_GAIN * (r - ARM_START) ** 2);
        const glove = this.rig.localToWorld(shoulder.clone().addScaledVector(offset.normalize(), reach));
        const rayQ = new T.Quaternion(ro.x, ro.y, ro.z, ro.w).premultiply(rigQ);
        const tr = this.track[side], grip = btn(1), trigger = btn(0), rp = rayPose.transform.position;
        const triggerPressed = this.edge(side + 'T', trigger);
        if (triggerPressed) inp.tap = true;
        inp.hands.push({ side, glove, aimOrigin: glove, rayOrigin: this.rig.localToWorld(new T.Vector3(rp.x, rp.y, rp.z)), shoulder: this.rig.localToWorld(shoulder.clone()),
                         dir: new T.Vector3(0, 0, -1).applyQuaternion(rayQ), grip, trigger, triggerPressed, throwPressed: false,
                         gloveVel: this.trackVel(tr.glove, glove, dt), realSpeed: this.trackVel(tr.real, realLocal, dt).length(), haptic: gp.hapticActuators && gp.hapticActuators[0], desktop: false });
      }
      inp.menuX = inp.moveX; inp.menuY = inp.moveY;
    } else {
      const k = this.keys;
      inp.moveY = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); inp.moveX = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0); inp.climb = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
      inp.boostHeld = !!(k.ShiftLeft || k.ShiftRight); inp.boost = this.edge('kBoost', inp.boostHeld);
      inp.level = this.edge('kL', !!k.KeyL); inp.start = this.edge('kEnter', !!(k.Enter || k.NumpadEnter));
      inp.pass = this.edge('kF', !!k.KeyF); inp.pausePress = this.edge('kPause', !!(k.KeyP || k.Escape));
      inp.menuX = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0); inp.menuY = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
      const g = !!k.KeyG, space = this.edge('kSpace', !!k.Space), gp = this.edge('kG', g);
      inp.tap = gp || space;
      inp.hands.push({ side: 'right', glove: headPos.clone().addScaledVector(fwd, 1.0).addScaledVector(UP, -0.3), aimOrigin: headPos.clone(), shoulder: null, dir: fwd.clone(),
                       grip: false, trigger: g, triggerPressed: gp, throwPressed: space, gloveVel: new T.Vector3(), realSpeed: 0, haptic: null, desktop: true });
    }
    return inp;
  },

  // ---------------------------------------------------------------- main loop
  tick(t, dtMs) {
    if (!this.ready) return;
    const dt = Math.min((dtMs || 16) / 1000, 0.05);
    this.time += dt;
    const inp = this.readInput(dt);
    this.inVR = inp.inVR; this.hands = inp.hands;
    this.headPos.copy(inp.headPos); this.headFwd.copy(inp.fwd);
    setListener(this.headPos, this.headFwd);
    if (this.paused) return;
    if (inp.inVR && this.calibrateT > 0 && (this.calibrateT -= dt) <= 0) this.calibrate();
    this.pingT -= dt; this.msgT = Math.max(0, this.msgT - dt);
    if (inp.inVR && !this.inVRBefore) this.prevButtons = {};
    this.inVRBefore = inp.inVR;

    if (this.helpOpen) { this.showPanels('help'); this.updateHelp(inp); this.updateHud(dt); this.render(inp, dt); return; }
    if (inp.pausePress) { if (this.pauseOpen) this.closePause(); else this.openPause(); }
    if (this.pauseOpen) { this.showPanels('pause'); this.updatePause(inp); this.updateHud(dt); return; }
    const inMenu = this.state === 'ready' || this.state === 'over';
    this.showPanels(inMenu ? 'menu' : null);
    if (inMenu) { this.updateMenu(inp); inp.boost = false; }
    else for (const side of ['left', 'right']) { this.lasers[side].beam.visible = false; this.lasers[side].dot.visible = false; }
    this.updateState(dt);
    const live = this.state === 'playing' || this.state === 'training';
    this.live = live;
    this.movePlayer(inp, dt, live);
    this.updateBall(inp, dt);
    if (this.state === 'training') this.updateTraining(inp, dt); else this.updateBots(dt, live);
    if (live) { this.contacts(dt); this.botSteals(dt); this.updateClash(inp, dt); this.updateSight(dt); if (this.state === 'playing') this.coach(inp, dt); }
    else if (this.state === 'penalty') this.updateSight(dt);
    this.updateComfort(dt);
    this.updateHud(dt);
    this.render(inp, dt);
  },

  // ---------------------------------------------------------------- flying (upright, snap turns; ported from version 3)
  movePlayer(inp, dt, live) {
    if (inp.inVR) {
      if (Math.abs(inp.turnX) > 0.7 && Math.abs(inp.climb) < 0.5 && this.snapArmed) { this.snapTurn(inp.turnX > 0 ? -SNAP_DEG : SNAP_DEG); this.snapArmed = false; }
      if (Math.abs(inp.turnX) < 0.3) this.snapArmed = true;
    }
    if (inp.level && (live || this.state === 'penalty' || this.state === 'countdown')) { this.snapTurn(180); beep(420, 90, 0.05, 'triangle'); }
    const prevVel = this.vel.clone();
    this.boostCool = Math.max(0, this.boostCool - dt); this.boostT = Math.max(0, this.boostT - dt);
    const locked = (this.clash && (this.clash.a === 'player' || this.clash.b === 'player')) || this.state === 'penalty' || this.playerStun > 0.6;
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    const climb = Math.abs(inp.turnX) > 0.6 ? 0 : dz(inp.climb);
    const fwd = this.updateSteer(inp, dt), right = new T.Vector3().crossVectors(fwd, inp.rigUp);
    if (right.lengthSq() < 1e-4) right.copy(inp.right); else right.normalize();
    const thrust = new T.Vector3().addScaledVector(fwd, dz(inp.moveY)).addScaledVector(right, dz(inp.moveX)).addScaledVector(inp.rigUp, climb);
    if (thrust.lengthSq() > 1) thrust.normalize();
    const boostDir = thrust.lengthSq() > 0.01 && dz(inp.moveY) >= 0 ? thrust.clone().normalize() : fwd.clone();
    if (live && !locked && inp.boost && this.boostCool === 0 && this.energy >= BOOST_COST) {
      this.vel.addScaledVector(boostDir, BOOST_BURST); this.useEnergy(BOOST_COST);
      this.boostT = BOOST_TIME; this.boostCool = BOOST_COOL; this.boostDir = boostDir.clone(); this.impactFlash = 0.4; this.boostAt = this.time;
      beep(160, 300, 0.1, 'sawtooth');
    }
    if (this.boostT > 0) {
      this.boostDir.lerp(boostDir, 1 - Math.exp(-10 * dt)).normalize();
      if (live && inp.boostHeld && this.energy > 0) { this.boostT = Math.max(this.boostT, 0.12); this.useEnergy(BOOST_HOLD_COST * dt); this.boostAt = this.time; }
    }
    this.boosting = this.boostT > 0 && !locked;
    this.tiltRide(inp, dt, live && !locked);
    if (locked) this.vel.set(0, 0, 0);
    else if (!live) this.vel.multiplyScalar(Math.exp(-3 * dt));
    else if (this.easy || !inp.inVR) {
      if (!this.boosting && thrust.lengthSq() < 0.0025) this.vel.multiplyScalar(Math.exp(-1.1 * dt));
      else this.vel.lerp(this.boosting ? this.boostDir.clone().multiplyScalar(BOOST_MAX * 0.85) : thrust.clone().multiplyScalar(EASY_SPEED), 1 - Math.exp(-EASY_RESPONSE * dt));
    } else if (this.boosting) this.vel.lerp(this.boostDir.clone().multiplyScalar(BOOST_MAX * 0.9), 1 - Math.exp(-3 * dt));
    else {
      this.vel.addScaledVector(thrust, THRUST * dt); this.vel.multiplyScalar(Math.exp(-DRAG * dt));
      const sp = this.vel.length(); if (sp > MAX_SPEED) this.vel.multiplyScalar((MAX_SPEED + (sp - MAX_SPEED) * Math.exp(-2 * dt)) / sp);
    }
    this.thrustLevel = this.boosting ? 1 : thrust.length() * 0.5;
    this.rig.position.addScaledVector(this.vel, dt);
    this.accelMag = dt > 0 ? prevVel.sub(this.vel).length() / dt : 0;
    // keep the head and the body inside the station
    const cam = this.headEl.getObject3D('camera'), center = cam.getWorldPosition(new T.Vector3()), before = center.clone();
    let impact = constrainSphere(center, this.vel, PLAYER_R, BOUNCE_WALL);
    this.rig.position.add(center.sub(before));
    const body = cam.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, -1.0, 0)), bodyBefore = body.clone();
    impact = Math.max(impact, constrainSphere(body, this.vel, 0.45, BOUNCE_WALL));
    this.rig.position.add(body.sub(bodyBefore));
    if (impact > 2.5) { this.impactFlash = Math.min(1, impact / 10); beep(120, 120, 0.1, 'triangle'); for (const h of inp.hands) pulse(h, 0.6, 60); }
    this.impactFlash = Math.max(0, this.impactFlash - dt * 2);
    this.energyIdle += dt;
    if (this.energyIdle > REGEN_DELAY) this.energy = Math.min(ENERGY_MAX, this.energy + REGEN * dt);
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
    const roll = (live ? -dz(inp.moveX) * RIDE_TILT : 0) + this.snapKick, pitch = live ? (this.boosting ? -1 : -Math.max(0, dz(inp.moveY)) * 0.6) * RIDE_PITCH : 0;
    this.rideTilt = this.rideTilt || { r: 0, p: 0 };
    this.rideTilt.r += (roll - this.rideTilt.r) * k; this.rideTilt.p += (pitch - this.rideTilt.p) * k;
    this.$('ride').object3D.rotation.set(this.rideTilt.p, 0, this.rideTilt.r);
  },
  turnAboutHead(turn) {
    const cam = this.headEl.getObject3D('camera');
    this.rig.updateMatrixWorld(true);
    const before = cam.getWorldPosition(new T.Vector3());
    turn();
    this.rig.updateMatrixWorld(true);
    this.rig.position.add(before.sub(cam.getWorldPosition(new T.Vector3())));
  },
  updateSteer(inp, dt) {
    const d = this.ball, q = this.rig.quaternion;
    let want = null;
    if (inp.inVR && this.flight !== 'head') {
      const sum = new T.Vector3(); let n = 0;
      for (const h of inp.hands) {
        if (h.desktop || h.grip || h.realSpeed > 1.8 || (d.holder === 'player' && d.hand === h.side)) continue;
        sum.add(h.dir); n++;
      }
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
    if (d.passTo === a && d.lastThrower && d.lastThrower !== a && this.teamOf(d.lastThrower) === this.teamOf(a) && d.lastThrower === 'player') this.stats.passes++;
    Object.assign(d, { holder: a, pulledBy: null, snapping: false, passTo: null, noCatch: 0 });
    d.vel.set(0, 0, 0);
    if (a === 'player') { this.playerGrace = GRACE; if (stolen) this.stats.steals++; }
    else { a.grace = GRACE; a.decideT = 0.4; }
    if (stolen && prev) { beepAt(240, 140, 0.1, 'square', d.pos); this.bursts.fire(d.pos, TEAM_COLOR[this.teamOf(a)], 0.5); }
  },
  aimedAt(h, target, range, base) {
    tmp2.subVectors(target, h.aimOrigin); const dist = tmp2.length();
    if (dist > range) return false;
    const along = tmp2.dot(h.dir);
    if (along <= 0) return false;
    return Math.sqrt(Math.max(0, dist * dist - along * along)) < base + along * 0.08;
  },
  // Nudges a throw toward a rival goal if it already points close to one.
  assistDir(origin, dir, maxAngle) {
    let best = maxAngle, pick = null;
    for (const g of STATION.goals) {
      if (g.team === 'blue') continue;
      tmp.subVectors(g.c, origin);
      if (tmp.dot(g.n) > 0) continue;
      const ang = dir.angleTo(tmp);
      if (ang < best) { best = ang; pick = g; }
    }
    return pick ? new T.Vector3().subVectors(pick.c, origin).normalize() : dir.clone().normalize();
  },
  // A teammate you are pointing at (within PASS_ANGLE), or null.
  mateInSights(h) {
    let best = null, bestAng = PASS_ANGLE;
    for (const b of this.matchBots) {
      if (b.team !== 'blue' || b.clash) continue;
      tmp.subVectors(b.pos, h.aimOrigin);
      if (tmp.length() > PASS_RANGE) continue;
      const ang = h.dir.angleTo(tmp); if (ang < bestAng) { bestAng = ang; best = b; }
    }
    return best;
  },
  bestMate() {
    let best = null;
    for (const b of this.matchBots) {
      if (b.team !== 'blue' || b.clash) continue;
      const dd = b.pos.distanceTo(this.headPos); if (dd > PASS_RANGE) continue;
      const s = this.progressOf('blue', b.pos) - dd * 0.2 + (this.passOpen('blue', this.headPos, b.pos) ? 20 : 0);
      if (!best || s > best.s) best = { b, s };
    }
    return best && best.b;
  },
  passFrom(passer, target) {
    const d = this.ball, tPos = this.posOf(target).clone(), from = passer === 'player' ? d.pos.clone() : d.pos.clone();
    const aim = tPos.addScaledVector(this.velOf(target), from.distanceTo(tPos) / PASS_SPEED);
    d.vel.subVectors(aim, from).setLength(PASS_SPEED);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, passTo: target, passT: 2.5, lastThrower: passer, throwT: this.time, bankT: -99 });
    d.throwFrom.copy(from);
    if (passer === 'player') d.noCatch = 0.4; else { passer.cool = 0.6; d.noCatch = 0.15; }
    if (this.clash && (this.clash.b === passer)) this.endClash('offload');
    beepAt(620, 90, 0.08, 'triangle', from); beepAt(820, 90, 0.08, 'triangle', from, 0.08);
  },
  release(thrower, v) {
    const d = this.ball;
    if (v.length() > BALL_MAX) v.setLength(BALL_MAX);
    d.vel.copy(v);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, noCatch: thrower === 'player' ? 0.3 : 0.2, passTo: null, lastThrower: thrower, throwT: this.time, bankT: -99, spin: 12 + v.length() });
    d.throwFrom.copy(d.pos);
    if (this.clash && this.clash.b === thrower) this.endClash('offload');
    if (this.penalty) this.penalty.shot = true;
    beepAt(400 + v.length() * 15, 120, 0.1, 'square', d.pos);
  },
  catchBall(h, msg) {
    this.takeBall('player', msg === 'STOLE IT!');
    this.ball.hand = h.side;
    if (!h.desktop) this.track[h.side].glove.length = 0;
    this.flash(msg); pulse(h, 0.7, 50); beep(880, 80, 0.1);
  },

  updateBall(inp, dt) {
    const d = this.ball, hands = inp.hands, handOf = s => hands.find(h => h.side === s), live = this.live || this.state === 'penalty';
    this.playerStun = Math.max(0, this.playerStun - dt); this.playerGrace = Math.max(0, this.playerGrace - dt);
    d.noCatch = Math.max(0, d.noCatch - dt);
    if (d.passTo) { d.passT -= dt; if (d.passT <= 0) d.passTo = null; }
    let pullBeam = null;
    const prevPos = d.pos.clone();
    if (live && d.holder === 'player') {
      const h = handOf(d.hand) || hands[0];
      if (!h) d.holder = null;
      else {
        d.hand = h.side;
        const mate = !h.desktop ? this.mateInSights(h) : null;
        if (this.state !== 'penalty' && (inp.pass || (h.triggerPressed && mate))) {
          const to = inp.pass ? this.bestMate() : mate;
          if (to) { this.passFrom('player', to); this.flash(`PASS TO ${to.num}`, 0.8); }
        } else if (this.easy || h.desktop) {
          if (h.triggerPressed || h.throwPressed) this.release('player', this.assistDir(h.aimOrigin, h.dir, EASY_ASSIST).multiplyScalar(EASY_THROW).add(this.vel));
          else d.pos.copy(h.glove);
        } else if (!h.grip) {
          const rel = h.gloveVel.clone().sub(this.vel);
          if (h.realSpeed < 1.0) this.release('player', this.vel.clone().add(rel));
          else this.release('player', this.assistDir(h.glove, rel, THROW_ASSIST).multiplyScalar(rel.length() * THROW_GAIN).add(this.vel));
        } else d.pos.copy(h.glove);
      }
    } else if (live && d.holder && this.state !== 'penalty') {
      // reach in and take it straight out of a rival's hands (or a teammate's: a handoff)
      const bot = d.holder;
      for (const h of hands) {
        if (d.holder !== bot || this.playerStun > 0 || bot.clash) break;
        const grabbing = h.grip || ((this.easy || h.desktop) && h.trigger);
        const near = h.glove.distanceTo(d.pos) < STEAL_R || this.headPos.distanceTo(d.pos) < STEAL_R;
        if (!grabbing || !near) continue;
        if (bot.team === 'blue') this.catchBall(h, 'HANDOFF');
        else if (bot.grace > 0) continue;
        else { bot.stun = 0.8; bot.vel.multiplyScalar(-0.3); this.catchBall(h, 'STOLE IT!'); }
      }
    }
    if (live && d.holder === null) {
      if (d.passTo === 'player' && this.playerStun === 0) for (const h of hands) if (h.glove.distanceTo(d.pos) < SNAP_R * 1.3 || this.headPos.distanceTo(d.pos) < 2.2) { this.catchBall(h, 'CAUGHT THE PASS'); break; }
      if (d.holder === null) for (const h of hands) {
        if (d.holder !== null || this.playerStun > 0 || d.noCatch > 0) break;
        const dist = h.glove.distanceTo(d.pos);
        if (h.grip && dist < GRAB_R + BALL_R) this.catchBall(h, 'GOT IT');
        else if (h.grip && dist < SNAP_R) { d.pulledBy = h.side; d.snapping = true; }
      }
      if (d.holder === null) {
        for (const h of hands) if ((this.easy || h.desktop) && h.trigger && !d.pulledBy && this.playerStun === 0 && d.noCatch === 0 && this.aimedAt(h, d.pos, EASY_PULL_RANGE, 1.4)) { d.pulledBy = h.side; d.snapping = false; pulse(h, 0.3, 40); beep(440, 80, 0.06); }
        if (d.pulledBy) {
          const h = handOf(d.pulledBy);
          if (!h || !(d.snapping ? h.grip : h.trigger)) { d.pulledBy = null; d.snapping = false; }
          else {
            tmp.subVectors(h.glove, d.pos); const dist = tmp.length();
            d.vel.lerp(tmp.multiplyScalar((d.snapping ? SNAP_SPEED : PULL_SPEED) / Math.max(dist, 0.01)), 1 - Math.exp(-(d.snapping ? 20 : 8) * dt));
            pullBeam = h;
            if (dist < GRAB_R + BALL_R + 0.1) this.catchBall(h, 'GOT IT');
          }
        }
      }
      if (d.holder === null) this.flyBall(dt);
    } else if (!live && d.holder === null && this.state !== 'ready') d.vel.multiplyScalar(Math.exp(-2 * dt));
    if (d.holder && d.holder !== 'player') d.pos.copy(d.holder.pos).addScaledVector(d.holder.facing, 0.8).add(new T.Vector3(0, 1.05, 0));
    // carrying it in by hand counts too (reach into a hole)
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
        if (this.pingT <= 0) { beepAt(700 + Math.min(impact, 30) * 20, 60, 0.05, 'sine', d.pos); this.pingT = 0.08; }
        if (d.passTo) d.passTo = null;
      }
    }
    d.spin *= Math.exp(-0.3 * dt);
  },
  checkGoalCross(a, b, carried) {
    for (const g of STATION.goals) {
      // the goal line sits one ball-radius out from the wall: the wall stops the ball before its center could reach the wall itself
      const off = BALL_R + 0.05, d0 = tmp.subVectors(a, g.c).dot(g.n) - off, d1 = tmp.subVectors(b, g.c).dot(g.n) - off;
      if (!(d0 > 0 && d1 <= 0)) continue;
      tmp.lerpVectors(a, b, d0 / (d0 - d1)).addScaledVector(g.n, -off);
      if (tmp.distanceTo(g.c) > g.r - BALL_R * 0.4) continue;
      this.goal(g, carried);
      return true;
    }
    return false;
  },
  goal(g, carried) {
    const d = this.ball, team = OTHER[g.team], scorer = carried ? d.holder : d.lastThrower;
    const own = scorer && this.teamOf(scorer) === g.team;
    let pts = this.state === 'penalty' ? POINTS.penalty : g.points;
    const extras = [];
    const bank = !carried && d.bankT > d.throwT && d.bankT - d.throwT < BANK_WINDOW;
    const long = !carried && !own && d.throwFrom.distanceTo(g.c) > LONG_SHOT;
    if (!own && bank) { pts += POINTS.bank; extras.push(`BANK SHOT +${POINTS.bank}`); }
    if (long) { pts += POINTS.long; extras.push(`LONG SHOT +${POINTS.long}`); }
    this.score[team] += pts;
    const what = own ? 'OWN GOAL' : this.state === 'penalty' ? 'PENALTY' : g.kind === 'deep' ? 'DEEP GOAL' : 'GOAL';
    const who = scorer ? this.nameOf(scorer) : TEAM_NAME[team];
    this.lastEvent = `${what} +${pts} · ${who}`;
    if (scorer === 'player' && !own) { this.stats.goals++; if (g.kind === 'deep') this.stats.deep++; if (bank || long) this.stats.tricks++; }
    this.flash(`${what}! +${pts}${extras.length ? '\n' + extras.join('  ') : ''}`, 2.4, { big: true, color: TEAM_COLOR[team] });
    this.bursts.fire(g.c, TEAM_COLOR[team], 1.4);
    beepAt(team === 'blue' ? 880 : 300, 300, 0.12, 'sine', g.c); beep(team === 'blue' ? 1320 : 220, 400, 0.08, 'sine', 0.15);
    for (const h of this.hands || []) pulse(h, 0.8, 120);
    d.holder = null; d.vel.set(0, 0, 0); d.pos.copy(g.c).addScaledVector(g.n, -1.2);
    this.clash = null; for (const b of this.bots) b.clash = false;
    this.penalty = null;
    if (this.state === 'training') { this.training.scored = g; return; }
    this.state = 'scored'; this.stateT = 2.6;
  },

  // ---------------------------------------------------------------- contact: bounces, clashes and fouls
  contacts(dt) {
    const list = this.agents(), d = this.ball;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const pa = a === 'player' ? this.bodyPos().clone() : a.pos.clone().add(new T.Vector3(0, 0.9, 0)), pb = b === 'player' ? this.bodyPos().clone() : b.pos.clone().add(new T.Vector3(0, 0.9, 0));
      const ra = a === 'player' ? PLAYER_R : BOT_R, rb = b === 'player' ? PLAYER_R : BOT_R;
      const n = pb.clone().sub(pa), dist = n.length();
      if (dist >= ra + rb || dist < 1e-4) continue;
      n.divideScalar(dist);
      const va = this.velOf(a), vb = this.velOf(b), closing = va.clone().sub(vb).dot(n);
      const ta = this.teamOf(a), tb = this.teamOf(b);
      const inClash = c => c === 'player' ? !!(this.clash && (this.clash.a === 'player' || this.clash.b === 'player')) : !!c.clash;
      // Fly into the rival carrying the core: CLASH.
      if (ta !== tb && !this.clash && closing > CLASH_SPEED * 0.5 && (d.holder === a || d.holder === b)) {
        const carrier = d.holder === a ? a : b, tackler = carrier === a ? b : a;
        const grace = carrier === 'player' ? this.playerGrace : carrier.grace;
        const stunned = tackler === 'player' ? this.playerStun > 0 : tackler.stun > 0;
        if (closing > CLASH_SPEED && grace <= 0 && !stunned) { this.startClash(tackler, carrier); continue; }
      }
      if (inClash(a) || inClash(b)) continue;
      // Otherwise: bounce apart.
      const push = (ra + rb - dist) / 2;
      if (a === 'player') this.rig.position.addScaledVector(n, -push); else a.pos.addScaledVector(n, -push);
      if (b === 'player') this.rig.position.addScaledVector(n, push); else b.pos.addScaledVector(n, push);
      if (closing > 0) {
        const jImp = closing * (1 + BUMP_BOUNCE) / 2;
        va.addScaledVector(n, -jImp); vb.addScaledVector(n, jImp);
        if (closing > 3) { beepAt(160, 90, 0.08, 'triangle', pa); if (a === 'player' || b === 'player') { this.impactFlash = Math.min(1, closing / 12); for (const h of this.hands || []) pulse(h, 0.6, 50); } }
        // A late hit: rivals, nobody near the core, crashing in hard. The one who flew in is penalized.
        if (ta !== tb && closing > FOUL_SPEED && this.state === 'playing' && d.holder !== a && d.holder !== b &&
            d.pos.distanceTo(pa) > FOUL_BALL_R && d.pos.distanceTo(pb) > FOUL_BALL_R) {
          const sa = va.dot(n) + jImp, sb = -(vb.dot(n) - jImp); // their speeds toward each other before the bounce
          const hitter = sa >= sb ? a : b, victim = hitter === a ? b : a;
          if ((hitter === a ? sa : sb) > FOUL_SPEED * 0.7) this.foul(hitter, victim);
        }
      }
    }
  },
  startClash(tackler, carrier) {
    this.clash = { a: tackler, b: carrier, t: 0, p: 0, at: this.posOf(carrier).clone() };
    if (tackler !== 'player') tackler.clash = true; if (carrier !== 'player') carrier.clash = true;
    if (tackler === 'player' || carrier === 'player') { this.vel.set(0, 0, 0); this.tip('clash'); for (const h of this.hands || []) pulse(h, 1, 120); }
    this.flash(tackler === 'player' || carrier === 'player' ? 'CLASH!' : '', 1, { big: true, color: '#ffd166' });
    beepAt(110, 260, 0.14, 'sawtooth', this.clash.at); noiseAt(260, 0.12, this.clash.at, [400, 120]);
    this.bursts.fire(this.clash.at, '#ffd166', 0.8);
  },
  clashHelp(side) {
    let n = 0;
    for (const x of this.agents()) if (x !== this.clash.a && x !== this.clash.b && this.teamOf(x) === this.teamOf(side) && this.posOf(x).distanceTo(this.clash.at) < CLASH_HELP_R) n++;
    return n * CLASH_HELP;
  },
  updateClash(inp, dt) {
    const c = this.clash; if (!c) return;
    c.t += dt;
    const strength = side => {
      if (side === 'player') {
        const yank = (this.hands || []).reduce((m, h) => Math.max(m, h.realSpeed || 0), 0);
        return 1 + Math.min(1, yank / 2) * 0.8;
      }
      return this.level.clash * (0.85 + 0.3 * Math.sin(this.time * 3 + side.idx));
    };
    c.p += ((strength(c.a) + this.clashHelp(c.a)) - (strength(c.b) + this.clashHelp(c.b))) * CLASH_RATE * dt + (Math.random() - 0.5) * 0.25 * dt;
    if (inp.tap) { if (c.a === 'player') c.p += CLASH_TAP; else if (c.b === 'player') c.p -= CLASH_TAP; beep(500 + Math.random() * 200, 40, 0.05); }
    for (const x of [c.a, c.b]) if (x !== 'player') x.vel.set(0, 0, 0);
    if ((this.sparkT = (this.sparkT || 0) - dt) < 0) { this.sparkT = 0.3; this.bursts.fire(c.at, '#ffd166', 0.25); }
    // a bot carrier can offload out of a clash, like rugby
    if (c.b !== 'player' && c.t > 0.5 && Math.random() < dt * 0.7) {
      const mates = this.agents().filter(x => x !== c.b && this.teamOf(x) === c.b.team && this.posOf(x).distanceTo(c.at) < 18 && this.passOpen(c.b.team, c.at, this.posOf(x)));
      if (mates.length) { this.passFrom(c.b, mates[0]); return; }
    }
    if (c.p >= 1 || c.p <= -1 || c.t >= CLASH_TIME) this.endClash(c.p > 0.15 ? 'tackler' : 'carrier');
  },
  endClash(winner) {
    const c = this.clash; if (!c) return;
    this.clash = null;
    for (const x of [c.a, c.b]) if (x !== 'player') x.clash = false;
    const away = (x, other, speed) => { const dir = this.posOf(x).clone().sub(this.posOf(other)); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
      if (x === 'player') { this.vel.copy(dir).multiplyScalar(speed); this.playerStun = 0.7; } else { x.vel.copy(dir).multiplyScalar(speed); x.stun = 0.7; } };
    if (winner === 'offload') { away(c.a, c.b, 3); if (c.a === 'player') this.flash('THEY OFFLOADED IT', 1); return; }
    if (winner === 'tackler') {
      this.takeBall(c.a, true); away(c.b, c.a, 5);
      if (c.a === 'player') { this.ball.hand = 'right'; this.stats.hits++; this.flash('YOU WON THE CLASH!', 1.4, { color: '#66ffff' }); }
      else if (c.b === 'player') this.flash('LOST THE CLASH', 1.2, { color: '#ff7a2f' });
    } else {
      away(c.a, c.b, 5);
      if (c.b === 'player') { this.playerGrace = 1; this.flash('BROKE FREE!', 1.2, { color: '#66ffff' }); }
      else c.b.grace = 1;
      if (c.a === 'player') this.flash('THEY BROKE FREE', 1.2);
    }
    beepAt(winner === 'tackler' ? 700 : 300, 160, 0.1, 'triangle', c.at);
  },
  foul(hitter, victim) {
    const team = this.teamOf(victim);
    if (hitter === 'player') this.stats.fouls++;
    this.awardPenalty(team, victim, `LATE HIT by ${this.nameOf(hitter)}`);
  },

  // ---------------------------------------------------------------- penalties
  awardPenalty(team, victim, why) {
    if (this.state !== 'playing') return;
    const wallSign = HOME_SIGN[OTHER[team]], spot = new T.Vector3(0, ST.CY, wallSign * (ST.LZ - 20));
    const shooter = team === 'blue' ? 'player' : (victim !== 'player' ? victim : this.matchBots.find(b => b.team === team));
    this.clash = null; for (const b of this.bots) b.clash = false;
    this.state = 'penalty';
    this.penalty = { team, shooter, t: PENALTY_TIME, shot: false, after: 0, spot };
    const behind = spot.clone().add(new T.Vector3(0, 0, -wallSign * 14));
    let i = 0;
    for (const b of this.matchBots) {
      if (b === shooter) { b.pos.copy(spot).add(new T.Vector3(0, -0.9, 0)); b.facing.set(0, 0, wallSign); b.vel.set(0, 0, 0); continue; }
      const k = i++, row = Math.floor(k / 5);
      b.pos.set(((k % 5) - 2) * 5, ST.CY - 3 + row * 4, behind.z - wallSign * (row * 3 + (b.team === team ? 0 : 6))); b.vel.set(0, 0, 0); b.stun = 0;
    }
    if (shooter === 'player') this.placePlayer(spot.x, spot.y, spot.z, wallSign > 0 ? Math.PI : 0);
    else this.placePlayer(-6, ST.CY, behind.z - wallSign * 3, wallSign > 0 ? Math.PI : 0);
    this.takeBall(shooter);
    if (shooter === 'player') this.ball.hand = 'right';
    this.ball.pos.copy(shooter === 'player' ? spot : shooter.pos);
    this.flash(`${why}!\nPENALTY to ${TEAM_NAME[team]}: ${shooter === 'player' ? 'your shot' : 'free shot'}, ${POINTS.penalty} points`, 3, { color: TEAM_COLOR[team] });
    if (shooter === 'player') this.tip('penalty', true);
    beep(330, 300, 0.12, 'square'); beep(262, 400, 0.1, 'square', 0.25);
    this.lastEvent = `PENALTY to ${TEAM_NAME[team]}`;
  },
  updatePenalty(dt) {
    const p = this.penalty; if (!p) { this.state = 'playing'; return; }
    p.t -= dt;
    if (!p.shot && p.shooter !== 'player' && p.t < PENALTY_TIME - 1.6) {
      const shot = this.bestShot(p.team, p.shooter.pos.clone().add(new T.Vector3(0, 1, 0)), 30);
      if (shot) this.botShoot(p.shooter, shot); else p.t = 0;
    }
    if (p.shot) {
      p.after += dt;
      if (p.after > 2.2) { this.state = 'playing'; this.penalty = null; this.flash('MISSED. PLAY ON!', 1.2); }
    } else if (p.t <= 0) { this.state = 'playing'; this.penalty = null; this.ball.holder = null; this.flash('TOO SLOW. PLAY ON!', 1.2); }
  },

  // ---------------------------------------------------------------- the SIGHT RING
  updateSight(dt) {
    const inside = this.headPos.distanceTo(SIGHT) < SIGHT_R;
    if (inside) { if (this.sightT <= 0) { beep(990, 90, 0.06); beep(1320, 120, 0.05, 'sine', 0.08); this.flash('SIGHT RING: everyone shows through the walls', 1.6, { color: '#9ff6ff' }); } this.sightT = 1.2; }
    else this.sightT = Math.max(0, this.sightT - dt);
    this.inSight = inside;
  },

  // ---------------------------------------------------------------- coaching tips
  tip(id, force) {
    const tips = this.save.tips4 || (this.save.tips4 = []);
    if (tips.includes(id) || (!force && this.tipGap > 0) || !TIPS[id]) return;
    const text = TIPS[id][this.inVR ? 0 : 1];
    if (!text) return;
    tips.push(id); writeSave(this.save);
    this.flash(text, 5, { hint: this.inVR ? TIP_HINTS[id] : null, color: '#9ff6ff' });
    this.tipGap = 7;
  },
  coach(inp, dt) {
    this.tipGap = Math.max(0, this.tipGap - dt);
    const played = this.matchLen - this.timeLeft, d = this.ball;
    if (played > 2) this.tip('steer');
    if (played > 6) this.tip('turn');
    if (played > 10) this.tip('boost');
    if (played > 14) this.tip('pause');
    if (d.holder === null && d.pos.distanceTo(this.headPos) < 15) this.tip('grab');
    if (d.holder === 'player') { this.tip('throw'); this.tip('pass'); }
    if (d.holder && d.holder !== 'player' && d.holder.team === 'orange' && d.pos.distanceTo(this.headPos) < 14) this.tip('steal');
    if (Math.abs(this.headPos.x) > ST.LW + 4) this.tip('deep');
    if (played > 40) this.tip('sight');
  },

  // ---------------------------------------------------------------- training (the demo you fly through)
  startTraining() {
    this.state = 'training'; this.score = { blue: 0, orange: 0 }; this.timeLeft = 0; this.stats = this.freshStats();
    this.clash = null; this.penalty = null;
    for (const b of this.bots) { b.obj.visible = false; b.clash = false; }
    this.ally = this.bots.find(b => b.team === 'blue'); this.rival = this.bots.find(b => b.team === 'orange');
    this.matchBots = [];
    this.placePlayer(0, 9, 30);
    const d = this.ball; d.holder = null; d.passTo = null; d.pos.set(0, -50, 0); d.vel.set(0, 0, 0);
    this.training = { step: -1, t: 0 };
    this.nextStep();
  },
  TRAINING: [
    { id: 'fly', vr: 'Point your hands where you want to go and push the LEFT STICK forward. Fly through the gold ring.', pc: 'W flies where you look (drag the mouse to look). Fly through the gold ring.', hint: 'steer',
      setup(g) { g.target.position.set(0, 10, 14); g.target.rotation.set(0, 0, 0); g.target.visible = true; }, done: g => g.headPos.distanceTo(g.target.position) < 2.2 },
    { id: 'turn', vr: 'Flick the RIGHT STICK left or right to snap turn. Turn all the way around (A or X does it in one go).', pc: 'Press L to turn all the way around.', hint: 'turn',
      setup(g) { g.target.visible = false; g.turnTotal = 0; }, done: g => g.turnTotal >= 150 },
    { id: 'boost', vr: 'Push a thumbstick DOWN to boost. Boost through the ring.', pc: 'Hold Shift to boost. Boost through the ring.', hint: 'boost',
      setup(g) { const p = g.headPos.clone().addScaledVector(new T.Vector3(g.headFwd.x, 0, g.headFwd.z).normalize(), 14); p.x = Math.max(-10, Math.min(10, p.x)); p.z = Math.max(-40, Math.min(40, p.z)); p.y = 10; g.target.position.copy(p); g.target.lookAt(g.headPos); g.target.visible = true; },
      done: g => g.headPos.distanceTo(g.target.position) < 2.4 && g.time - (g.boostAt || -9) < 1.5 },
    { id: 'grab', vr: 'This is the CORE. Point at it and HOLD THE TRIGGER to pull it into your hand.', pc: 'This is the CORE. Look at it and hold G to pull it in.', hint: 'grab',
      setup(g) { g.target.visible = false; const p = g.headPos.clone().addScaledVector(g.headFwd, 7); p.y = 9; g.ball.pos.copy(p); g.ball.vel.set(0, 0, 0); g.ball.holder = null; }, done: g => g.ball.holder === 'player' },
    { id: 'shoot', vr: 'Fly to the ORANGE end (the gold ring), point at one of the round holes in the wall and press the TRIGGER to throw. 1 point.', pc: 'Fly to the ORANGE end (the gold ring) and press Space to throw it into a round hole. 1 point.', hint: 'throw',
      setup(g) { g.training.scored = null; g.target.position.set(0, 9, -32); g.target.rotation.set(0, 0, 0); g.target.visible = true; }, done: g => g.training.scored && g.training.scored.kind === 'hole', retry: true },
    { id: 'pass', vr: 'Your teammate is open. Point at them and press the TRIGGER to pass.', pc: 'Your teammate is open. Press F to pass.', hint: 'pass',
      setup(g) { g.target.visible = false; g.givePlayerBall(); g.spawnTrainee(g.ally, 10); }, done: g => g.ball.holder === g.ally },
    { id: 'clash', vr: 'ORANGE has the CORE. Fly straight into them to CLASH, then TAP THE TRIGGER fast to wrestle it away. (Or reach in and grip to snatch it.)', pc: 'ORANGE has the CORE. Fly into them to CLASH, then tap G fast.', hint: 'clash',
      setup(g) { g.matchBots = []; g.ally.obj.visible = false; g.spawnTrainee(g.rival, 14); g.takeBall(g.rival); g.rival.grace = 0; }, done: g => g.ball.holder === 'player' },
    { id: 'sight', vr: 'Fly to the SIGHT RING in the exact middle of the lobby and hover inside it: you see every rider through the walls.', pc: 'Fly to the SIGHT RING in the middle of the lobby and stay inside it.', hint: 'sight',
      setup(g) { g.matchBots = []; g.rival.obj.visible = false; g.ball.holder = null; g.ball.pos.set(0, -50, 0); }, done: g => g.inSight },
    { id: 'done', vr: 'You\'re ready. Lobby holes are 1, the DEEP GOAL behind their lobby (round a loop) is 3, bank shots and long shots +1. Hit someone without the CORE and they get a penalty shot (2). Press A for the menu.', pc: 'You\'re ready. Holes 1, deep goal 3, bank and long shots +1, penalties 2. Press Enter for the menu.', hint: null,
      setup() {}, done: (g, inp) => inp.start || g.training.t > 25 }
  ],
  givePlayerBall() { const h = (this.hands || [])[0]; this.takeBall('player'); this.ball.hand = h ? h.side : 'right'; },
  spawnTrainee(b, dist) {
    const f = new T.Vector3(this.headFwd.x, 0, this.headFwd.z).normalize(), p = this.headPos.clone().addScaledVector(f, dist);
    p.x = Math.max(-11, Math.min(11, p.x)); p.z = Math.max(-40, Math.min(40, p.z)); p.y = 8.2;
    b.pos.copy(p); b.vel.set(0, 0, 0); b.facing.copy(f).negate(); b.obj.visible = true; b.stun = 0; b.cool = 0; b.role = 'idle'; b.target.copy(p);
    this.matchBots = [b];
  },
  nextStep() {
    const tr = this.training; tr.step++; tr.t = 0;
    const s = this.TRAINING[tr.step];
    if (!s) { this.resetToMenu(); return; }
    s.setup(this);
    this.flash(`${tr.step + 1} / ${this.TRAINING.length}   ${this.inVR ? s.vr : s.pc}`, 999, { hint: this.inVR && s.hint ? TIP_HINTS[s.hint] : null, color: '#9ff6ff' });
  },
  updateTraining(inp, dt) {
    const tr = this.training; if (!tr) return;
    tr.t += dt;
    const s = this.TRAINING[tr.step];
    // the trainees: the ally hovers; the rival drifts slowly away from you holding the core
    for (const b of this.matchBots) {
      b.stun = Math.max(0, b.stun - dt); b.grace = Math.max(0, b.grace - dt);
      if (b.clash) { b.vel.set(0, 0, 0); continue; }
      if (b === this.rival && this.ball.holder === b) { const away = b.pos.clone().sub(this.headPos); away.y = 0; if (away.lengthSq() > 1) b.target.copy(b.pos).addScaledVector(away.normalize(), 2); }
      if (b.stun > 0) { b.vel.multiplyScalar(Math.exp(-2 * dt)); b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.4); continue; }
      const to = b.target.clone().sub(b.pos); b.vel.lerp(to.multiplyScalar(b === this.rival ? 0.8 : 1.5), 1 - Math.exp(-2 * dt));
      if (b.vel.length() > 3) b.vel.setLength(3);
      b.pos.addScaledVector(b.vel, dt); constrainSphere(b.pos, b.vel, BOT_R, 0.3);
      if (b === this.ally) { this.catchCheck(b); tmp.subVectors(this.headPos, b.pos); tmp.y = 0; if (tmp.lengthSq() > 1) b.facing.lerp(tmp.normalize(), 1 - Math.exp(-4 * dt)).normalize(); }
    }
    if (this.ball.holder === this.ally && s.id !== 'pass') { this.ball.holder = null; }
    // the shooting step: a missed throw comes back to your hand after a moment
    if (s.retry && this.ball.holder === null && !tr.scored) { tr.miss = (tr.miss || 0) + dt; if (tr.miss > 3) { tr.miss = 0; this.givePlayerBall(); this.flash('Try again: point at a round hole in the ORANGE wall and throw.', 3, { color: '#9ff6ff' }); } } else tr.miss = 0;
    if (s.done(this, inp)) {
      beep(660, 120, 0.1); beep(990, 160, 0.1, 'sine', 0.1); this.bursts.fire(this.headPos.clone().addScaledVector(this.headFwd, 2), '#ffd166', 0.5);
      this.nextStep();
    }
    this.target.rotation.z += dt * 0.6;
  },

  // ---------------------------------------------------------------- panels: menus, pause, help, scoreboard, messages
  buildPanels() {
    const menuAnchor = this.$('menu').object3D;
    this.menuPanel = new UIPanel(MENU4_W, MENU4_H, 800);
    this.pausePanel = new UIPanel(PAUSE4_W, PAUSE4_H, 800);
    this.helpPanel = new UIPanel(BRIEF_W, BRIEF_H, 800);
    menuAnchor.add(this.menuPanel.mesh, this.pausePanel.mesh, this.helpPanel.mesh);
    const ytag = labelSprite('Y  PAUSE', { color: '#ffffff', bg: 'rgba(8,18,31,0.6)', height: 0.045 });
    ytag.position.set(0, 0.11, 0); this.gloveEls.left.object3D.add(ytag);
    this.scorePanel = new UIPanel(SCORE_W, SCORE_H, 1000, { onTop: true, order: 900 });
    this.$('hud').object3D.add(this.scorePanel.mesh); this.scorePanel.setOpacity(0);
    this.toastPanel = new UIPanel(1.4, 0.46, 700, { onTop: true, order: 1003 });
    this.rig.add(this.toastPanel.mesh); this.toastPanel.setOpacity(0);
    this.clashPanel = new UIPanel(0.9, 0.22, 800, { onTop: true, order: 1004 });
    this.headEl.object3D.add(this.clashPanel.mesh); this.clashPanel.mesh.position.set(0, -0.28, -1); this.clashPanel.setOpacity(0);
    this.lasers = {};
    for (const side of ['left', 'right']) {
      const beam = this.makeBeam(0x66ffff, 0.7, 0.004), dot = glowSprite('#ffffff', 0.05, 1);
      dot.visible = false; this.el.object3D.add(dot);
      this.lasers[side] = { beam, dot };
    }
    this.pointerSide = 'right'; this.focus = { row: 0, col: 0 }; this.pauseFocus = { row: 0, col: 0 };
    this.energyDots = around(10, (i, a) => {
      const m = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), new T.MeshBasicMaterial({ color: '#66ffff' }));
      m.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); this.gloveEls.left.object3D.add(m); return m;
    });
    const canvas = this.el.canvas;
    if (canvas) {
      const ndc = e => { const r = canvas.getBoundingClientRect(); return new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
      canvas.addEventListener('mousedown', e => { this.mouseDown = { x: e.clientX, y: e.clientY }; });
      canvas.addEventListener('mouseup', e => { if (this.mouseDown && Math.hypot(e.clientX - this.mouseDown.x, e.clientY - this.mouseDown.y) < 6) this.mouseClick = ndc(e); this.mouseDown = null; });
      canvas.addEventListener('mousemove', e => { this.mouseHover = ndc(e); });
      canvas.addEventListener('mouseleave', () => { this.mouseHover = null; });
    }
    this.raycaster = new T.Raycaster();
  },
  showPanels(which) {
    this.menuPanel.mesh.visible = which === 'menu'; this.pausePanel.mesh.visible = which === 'pause'; this.helpPanel.mesh.visible = which === 'help';
  },
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
    const btns = panel.buttons, rows = [...new Set(btns.map(b => b.row))].sort((a, b) => a - b);
    const cur = btns.find(b => b.row === focus.row && b.col === focus.col) || btns[0];
    let next = cur;
    if (dy) { const ri = rows.indexOf(cur.row), row = rows[Math.max(0, Math.min(rows.length - 1, ri - dy))], cx = cur.x + cur.w / 2;
      next = btns.filter(b => b.row === row).sort((a, b) => Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))[0] || cur; }
    else { const inRow = btns.filter(b => b.row === cur.row).sort((a, b) => a.col - b.col), i = inRow.indexOf(cur); next = inRow[Math.max(0, Math.min(inRow.length - 1, i + dx))] || cur; }
    if (next === cur) return null;
    focus.row = next.row; focus.col = next.col; beep(600, 40, 0.05);
    return next;
  },
  placeMenu(follow) {
    const m = this.$('menu').object3D;
    if (!follow) { m.position.set(0, 1.22, -1.55); m.rotation.set(0, 0, 0); return; }
    const a = this.rig.worldToLocal(this.headPos.clone()), f = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(a), yaw = Math.atan2(-f.x, -f.z);
    m.rotation.set(0, yaw, 0); m.position.set(-Math.sin(yaw) * 1.4, 1.22, -Math.cos(yaw) * 1.4);
  },

  // How to play: four pages (the game, the station map, the controllers, contact and penalties).
  openHelp() { this.helpOpen = true; this.helpPage = 0; this.helpKey = ''; this.armX = this.armY = false; this.placeMenu(this.pauseOpen); beep(600, 60, 0.06); },
  updateHelp(inp) {
    const panel = this.helpPanel, key = `${this.inVR}:${this.helpPage}`;
    if (key !== this.helpKey) { this.helpKey = key; const m = { inVR: this.inVR, page: this.helpPage, pages: BRIEF_PAGES }; panel.set((g, W, H, p) => paintBriefing(g, W, H, p, m)); }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]);
    const moved = this.stickNav(inp, panel, this.focus);
    const def = panel.buttons.find(b => b.id === 'next') || panel.buttons[0];
    const shown = hover ? hover.btn : moved || panel.buttons.find(b => b.row === this.focus.row && b.col === this.focus.col) || def;
    panel.highlight(shown, '#66ffff');
    const pick = click ? click.btn : inp.start ? shown : null;
    const close = () => { this.helpOpen = false; this.save.seenBrief4 = true; writeSave(this.save); if (!this.pauseOpen) this.placeMenu(false); this.armX = this.armY = false; };
    if (inp.pausePress) { close(); return; }
    if (!pick) return;
    beep(700, 60, 0.06);
    if (pick.id === 'next') { if (this.helpPage < BRIEF_PAGES - 1) this.helpPage++; else close(); }
    else if (pick.id === 'back') this.helpPage = Math.max(0, this.helpPage - 1);
    else if (pick.id === 'train') { close(); if (this.pauseOpen) this.closePause(true); this.startTraining(); }
    else if (pick.id === 'play') { close(); if (this.pauseOpen) this.closePause(true); this.newMatch(); }
  },

  canPause() { return this.state !== 'ready' && this.state !== 'over'; },
  openPause() {
    if (!this.canPause() || this.pauseOpen) return;
    this.pauseOpen = true; this.pauseFocus = { row: 0, col: 0 }; this.armX = this.armY = false; this.pauseKey = '';
    this.placeMenu(true); beep(500, 80, 0.08);
  },
  closePause(quiet) { this.pauseOpen = false; this.placeMenu(false); if (!quiet) beep(700, 80, 0.08); },
  updatePause(inp) {
    const panel = this.pausePanel, key = `${this.score.blue}:${this.score.orange}:${this.inVR}:${this.easy}:${this.flight}:${this.state}`;
    if (key !== this.pauseKey) {
      this.pauseKey = key;
      const model = { blue: this.score.blue, orange: this.score.orange, inVR: this.inVR, training: this.state === 'training',
                      reach: this.inVR ? `ARMS: ${this.easy ? 'EASY REACH (point + trigger)' : 'FULL MOTION (swing to throw)'}` : 'ARMS: EASY REACH (PC)',
                      flight: FLIGHT_LABEL[this.flight], exitLabel: window.SURGE_APP ? 'QUIT SURGE LEAGUE' : 'EXIT TO HOME SCREEN', versionLabel: `PLAY ${VERSION_LINK.label}` };
      panel.set((g, W, H, p) => paintPause4(g, W, H, p, model));
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
    else if (pick.id === 'reach') { if (this.inVR) { this.easy = !this.easy; this.save.reach = this.easy ? 'easy' : 'full'; writeSave(this.save); beep(640, 70, 0.06); } }
    else if (pick.id === 'flight') { this.flight = FLIGHT_MODES[(FLIGHT_MODES.indexOf(this.flight) + 1) % FLIGHT_MODES.length]; this.save.flight = this.flight; writeSave(this.save); beep(640, 70, 0.06); }
    else if (pick.id === 'restart') { this.closePause(true); if (this.state === 'training') this.startTraining(); else this.newMatch(); }
    else if (pick.id === 'menu') { this.closePause(true); this.resetToMenu(); this.helpOpen = false; }
    else if (pick.id === 'version') this.leaveTo(VERSION_LINK.url);
    else this.exitGame();
  },
  leaveTo(url) {
    this.flash('Loading...', 5); beep(440, 200, 0.08);
    const session = this.el.renderer.xr.getSession && this.el.renderer.xr.getSession();
    const go = () => location.assign(url + (window.SURGE_APP ? '?app=1' : ''));
    if (session) session.end().then(go, go); else go();
  },
  exitGame() {
    if (window.SURGE_APP) {
      const session = this.el.renderer.xr.getSession && this.el.renderer.xr.getSession();
      const close = () => { try { window.close(); } catch (e) {} };
      if (session) session.end().then(close, close); else close();
    } else this.leaveTo('../../');
  },

  // Start menu (and results after a match).
  menuHint(btn) {
    if (!btn) return 'Point at anything to learn about it.';
    const p = Profiles.current(this.save);
    switch (btn.id) {
      case 'play': return `8 vs 8 against ${this.level.name} bots, ${this.matchLen / 60} minutes. You play for BLUE.`;
      case 'train': return 'A 2-minute flight through every control: flying, turning, boosting, catching, shooting, passing, clashing.';
      case 'help': return 'The rules, a map of the station, both controllers, and how contact and penalties work.';
      case 'bots': return `Bot strength ${this.level.rating}: how fast they fly, how well they aim, how hard they clash. Your rank moves more against stronger bots.`;
      case 'length': return 'How long a match lasts.';
      case 'player-prev': case 'player-next': return `Switch player. ${p.name}: ${p.wins} wins, ${p.losses} losses, ${p.draws} draws.`;
      case 'player-new': return 'Add a new player on this headset. Rename players on the 2D page.';
      case 'version': return VERSION_LINK.hint;
      case 'home': return window.SURGE_APP ? 'Close Surge League.' : 'Leave Surge League and go back to the Quest Games menu.';
    }
    return '';
  },
  menuModel() {
    const p = Profiles.current(this.save), r = this.state === 'over' && this.result;
    return { inVR: this.inVR, level: this.level.name, length: `${this.matchLen / 60} MIN`, versionLabel: VERSION_LINK.label,
             profile: { name: p.name, sub: `${Profiles.rank(p.rating).name} ${Math.round(p.rating)}   ·   W${p.wins}  L${p.losses}  D${p.draws}` },
             result: r ? { blue: this.score.blue, orange: this.score.orange,
                           line1: `Surge Score ${r.surge}${r.newBest ? ' (new best!)' : ''}   ·   Rank ${r.rank} ${Math.round(r.rating)}${r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta})` : ''}   ·   Goals ${this.stats.goals}  Steals ${this.stats.steals}  Passes ${this.stats.passes}  Clashes won ${this.stats.hits}` } : null };
  },
  menuAction(btn) {
    if (btn.id === 'play') { this.newMatch(); return; }
    if (btn.id === 'train') { this.startTraining(); return; }
    if (btn.id === 'help') return this.openHelp();
    if (btn.id === 'version') return this.leaveTo(VERSION_LINK.url);
    if (btn.id === 'home') return this.exitGame();
    if (btn.id === 'bots') { const i = (LEVELS.indexOf(this.level) + 1) % LEVELS.length; this.level = LEVELS[i]; this.save.level = i; }
    else if (btn.id === 'length') { const i = (MATCH_LENGTHS.indexOf(this.matchLen) + 1) % MATCH_LENGTHS.length; this.matchLen = MATCH_LENGTHS[i]; this.save.matchLen = this.matchLen; }
    else if (btn.id === 'player-prev' || btn.id === 'player-next') {
      const list = this.save.profiles, i = list.findIndex(x => x.id === this.save.active);
      this.save.active = list[(i + (btn.id === 'player-next' ? 1 : -1) + list.length) % list.length].id;
    } else if (btn.id === 'player-new') { const np = Profiles.make(`PLAYER ${this.save.profiles.length + 1}`); this.save.profiles.push(np); this.save.active = np.id; this.flash(`Welcome, ${np.name}!`, 2); }
    writeSave(this.save); beep(700, 50, 0.06);
  },
  updateMenu(inp) {
    const panel = this.menuPanel, model = this.menuModel(), key = JSON.stringify(model);
    if (key !== this.menuKey) { this.menuKey = key; panel.set((g, W, H, p) => paintMenu4(g, W, H, p, model)); }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]);
    if (hover) { this.focus.row = hover.btn.row; this.focus.col = hover.btn.col; }
    this.stickNav(inp, panel, this.focus);
    const focused = panel.buttons.find(b => b.row === this.focus.row && b.col === this.focus.col) || panel.buttons[0];
    const shown = hover ? hover.btn : focused;
    panel.highlight(shown, '#66ffff');
    const hint = this.msgT > 0 ? this.msg : this.menuHint(shown);
    if (hint !== this.hintText) { this.hintText = hint; panel.hint = hint; panel.dirty = true; const page = document.getElementById('status'); if (page) page.textContent = hint; }
    if (click) this.menuAction(click.btn); else if (inp.start && focused) this.menuAction(focused);
  },

  // ---------------------------------------------------------------- rendering
  render(inp, dt) {
    const d = this.ball, inPlay = this.state !== 'ready' && this.state !== 'over';
    // the core: colored by whoever holds it
    this.ballObj.position.copy(d.pos);
    const bc = d.holder ? TEAM_COLOR[this.teamOf(d.holder)] : '#66ffff';
    if (this.ballColor !== bc) { this.ballColor = bc; this.ballMat.emissive.set(bc); this.ballRingMat.color.set(bc); this.ballGlow.material.color.set(bc); this.trail.material.color.set(bc); }
    this.ballRings[0].rotation.y += dt * 2.2; this.ballRings[1].rotation.x += dt * 1.7;
    this.ballXray.visible = this.sightT > 0;
    const tp = this.trail.geometry.attributes.position, flying = d.holder === null && d.vel.lengthSq() > 36;
    for (let i = tp.count - 1; i > 0; i--) tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), tp.getZ(i - 1));
    tp.setXYZ(0, d.pos.x, d.pos.y, d.pos.z);
    if (!flying) for (let i = 1; i < tp.count; i++) tp.setXYZ(i, d.pos.x, d.pos.y, d.pos.z);
    tp.needsUpdate = true; this.trail.visible = flying;
    // bots
    const shownBots = new Set(this.state === 'training' ? this.matchBots : this.bots);
    for (const b of this.bots) {
      const on = shownBots.has(b) && b.obj.visible !== false;
      if (!on) { b.obj.visible = false; continue; }
      b.obj.visible = true;
      b.obj.position.copy(b.pos); b.obj.lookAt(tmp.copy(b.pos).add(b.facing));
      animateRider(b, dt, this.time, d.pos);
      const wrestle = b.clash ? Math.sin(this.time * 18 + b.idx) * 0.4 : 0;
      b.arm.rotation.x = b.clash ? -1.1 + wrestle : d.holder === b ? -0.5 : 0;
      b.suitMat.emissive.setScalar(b.clash ? 0.15 + Math.abs(wrestle) * 0.3 : b.stun > 0 ? 0.25 : 0);
      const dist = b.pos.distanceTo(this.headPos);
      b.tag.visible = dist < 26;
      b.xray.visible = this.sightT > 0;
      b.carryRing.visible = d.holder === b;
      if (b.carryRing.visible) b.carryRing.rotation.z += dt * 3;
    }
    this.bursts.update(dt);
    // the sight ring turns; it lights up while you are inside it
    const st = this.station;
    st.sightRings.forEach((r, i) => { r.rotation.x += dt * (0.3 + i * 0.15); r.rotation.y += dt * (0.2 + i * 0.1); });
    st.ringMat.color.set(this.inSight ? '#66ffff' : '#e8f4ff'); st.sightGlow.material.opacity = this.inSight ? 0.7 : 0.25 + Math.sin(this.time * 2) * 0.05;
    // blink (turning around) and comfort fade
    const fadeM = this.fadeMat();
    this.blinkT = Math.max(0, (this.blinkT || 0) - dt);
    if (fadeM) { fadeM.color.set('#000000'); fadeM.opacity = this.blinkT > 0 ? Math.min(1, this.blinkT * 4) : 0; }
    this.pointLocator(this.ballArrow, d.pos, d.holder === null ? '#ffffff' : TEAM_COLOR[this.teamOf(d.holder)], inPlay && d.holder !== 'player');
    for (const side of ['left', 'right']) {
      const h = inp.hands.find(x => x.side === side && !x.desktop), gloveObj = this.gloveEls[side].object3D;
      const arm = side === 'left' ? this.beams.armL : this.beams.armR, aim = side === 'left' ? this.beams.aimL : this.beams.aimR;
      gloveObj.visible = !!h;
      if (!h) { arm.visible = false; aim.visible = false; continue; }
      gloveObj.position.copy(this.rig.worldToLocal(h.glove.clone()));
      this.setBeam(arm, h.shoulder, h.glove);
      if (this.easy && inPlay) this.setBeam(aim, h.glove, h.glove.clone().addScaledVector(h.dir, 15)); else aim.visible = false;
    }
    const sm = this.steerMark, showSteer = this.live && this.inVR && this.handSteer && this.steerDir;
    sm.visible = !!showSteer;
    if (showSteer) { sm.position.copy(this.headPos).addScaledVector(this.steerDir, 6); sm.lookAt(this.headPos); sm.material.opacity = 0.12 + Math.min(1, this.thrustLevel || 0) * 0.4; sm.material.color.set(this.boosting ? '#ffd166' : '#66ffff'); }
    const f = this.energy / ENERGY_MAX;
    this.energyDots.forEach((m, i) => m.material.color.set(f * 10 > i + 0.5 ? '#66ffff' : '#203040'));
  },
  fadeMat() {
    if (!this.fadeMatCache) { const m = this.$('fade').getObject3D('mesh'); if (!m) return null; m.renderOrder = 1000; this.fadeMatCache = m.material; }
    return this.fadeMatCache;
  },
  pointLocator(mesh, target, color, show) {
    const head = this.rig.worldToLocal(tmp2.copy(this.headPos)), local = this.rig.worldToLocal(tmp3.copy(target));
    const dx = local.x - head.x, dz = local.z - head.z, len = Math.hypot(dx, dz) || 1;
    mesh.visible = show && target.distanceTo(this.headPos) > 6;
    if (!mesh.visible) return;
    mesh.position.set(head.x + dx / len * 0.75, (this.cockpitY || 0) + 0.72, head.z + dz / len * 0.75);
    mesh.lookAt(target); mesh.material.color.set(color);
  },
  updateComfort(dt) {
    if (!this.vigMat) { const v = this.$('vignette').getObject3D('mesh'); if (!v) return; v.material.map = vignetteTexture(); v.material.needsUpdate = true; v.renderOrder = 999; this.vigMat = v.material; }
    const target = Math.min(0.85, this.accelMag / 30 + Math.max(0, this.vel.length() - 12) / 12 + this.impactFlash * 0.8);
    this.vig += (target - this.vig) * (1 - Math.exp(-8 * dt));
    this.vigMat.opacity = this.vig;
  },

  // Scoreboard (look down, or the last 10 s, goals, penalties), the floating message, and the clash meter.
  updateHud(dt) {
    const inMenu = this.state === 'ready' || this.state === 'over' || this.pauseOpen || this.helpOpen;
    const lookDown = this.inVR ? this.headFwd.clone().applyQuaternion(this.rig.quaternion.clone().invert()).y < -0.45 : !!this.keys.Tab;
    const want = !inMenu && this.state !== 'training' && (this.state === 'countdown' || this.state === 'scored' || this.state === 'penalty' || (this.state === 'playing' && this.timeLeft < 10) || lookDown);
    this.scoreAlpha = (this.scoreAlpha || 0) + ((want ? 1 : 0) - (this.scoreAlpha || 0)) * Math.min(1, dt * (want ? 10 : 4));
    this.scorePanel.setOpacity(this.scoreAlpha);
    const m = Math.floor(Math.max(0, this.timeLeft) / 60), sec = String(Math.floor(Math.max(0, this.timeLeft) % 60)).padStart(2, '0'), d = this.ball;
    const who = d.holder ? this.teamOf(d.holder) : null;
    const sb = { blue: this.score.blue, orange: this.score.orange, clock: `${m}:${sec}`, clockWarn: this.timeLeft < 10, mode: 'STATION RUGBY  ·  8 v 8', realm: 'HOLES 1 · DEEP 3 · BANK +1 · LONG +1',
                 power: d.holder === 'player' ? 'YOU HAVE THE CORE' : who === 'blue' ? 'BLUE HAS THE CORE' : who ? 'ORANGE HAS THE CORE' : 'LOOSE CORE', powerReady: who === 'blue', event: this.lastEvent };
    const key = JSON.stringify(sb);
    if (this.scoreAlpha > 0.01 && key !== this.scoreKey) { this.scoreKey = key; this.scorePanel.set((g, W, H, p) => paintScoreboard(g, W, H, p, sb)); }
    this.scorePanel.update();
    // message
    let text = this.msgT > 0 && !(inMenu && this.state !== 'over') ? this.msg : '', opts = this.msgOpts || {};
    if (!text && this.state === 'penalty' && this.penalty && this.penalty.shooter === 'player' && !this.penalty.shot) { text = `PENALTY: point at a hole and throw (${Math.ceil(this.penalty.t)})`; opts = { color: '#ffd166' }; }
    const tkey = text + '|' + (opts.big ? 1 : 0) + (opts.color || '') + (opts.hint ? opts.hint.side + opts.hint.part : '');
    if (tkey !== this.toastKey) { this.toastKey = tkey; const t = { text, ...opts }; this.toastPanel.set((g, W, H, p) => paintToast(g, W, H, p, t)); }
    this.toastPanel.update();
    this.toastAlpha = (this.toastAlpha || 0) + ((text ? 1 : 0) - (this.toastAlpha || 0)) * Math.min(1, dt * 8);
    this.toastPanel.setOpacity(this.toastAlpha);
    // the toast floats ahead of you, a little low, lagging gently behind where you look
    const f = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(this.rig.worldToLocal(this.headPos.clone())); f.y = 0;
    if (f.lengthSq() > 1e-4) {
      f.normalize(); const h = this.rig.worldToLocal(this.headPos.clone());
      const goal = h.clone().addScaledVector(f, 1.35).add(new T.Vector3(0, -0.12, 0));
      this.toastPos = this.toastPos ? this.toastPos.lerp(goal, 1 - Math.exp(-5 * dt)) : goal.clone();
      this.toastPanel.mesh.position.copy(this.toastPos); this.toastPanel.mesh.lookAt(this.rig.localToWorld(h.clone()));
    }
    // clash meter
    const c = this.clash, mine = c && (c.a === 'player' || c.b === 'player');
    this.clashAlpha = (this.clashAlpha || 0) + ((mine ? 1 : 0) - (this.clashAlpha || 0)) * Math.min(1, dt * 10);
    this.clashPanel.setOpacity(this.clashAlpha);
    if (mine) {
      const you = c.a === 'player' ? c.p : -c.p, cm = { you: Math.round(you * 40) / 40, inVR: this.inVR, carrier: c.b === 'player', t: Math.max(0, CLASH_TIME - c.t) };
      const ck = JSON.stringify(cm);
      if (ck !== this.clashKey) { this.clashKey = ck; this.clashPanel.set((g, W, H, p) => paintClash(g, W, H, p, cm)); }
      this.clashPanel.update();
    }
  }
});
