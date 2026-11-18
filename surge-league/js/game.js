// Surge League v2 game: one A-Frame component that runs the menu, the match, the bots and the world.
AFRAME.registerComponent('surge-game', {
  init() {
    this.ready = false;
    if (this.el.hasLoaded) this.setup(); else this.el.addEventListener('loaded', () => this.setup());
  },

  setup() {
    const $ = id => document.getElementById(id);
    this.$ = $;
    this.rig = $('rig').object3D;
    this.headEl = $('head');
    this.discObj = $('disc').object3D;
    this.discSpinObj = $('discSpin').object3D;
    this.snitchObj = $('snitch').object3D;
    this.wings = [$('wingL').object3D, $('wingR').object3D];
    this.gloveEls = { left: $('gloveL'), right: $('gloveR') };
    this.disc = { pos: new T.Vector3(), vel: new T.Vector3(), quat: new T.Quaternion(), holder: null, hand: null, pulledBy: null, snapping: false,
                  tractor: null, tractorT: 0, passTo: null, passT: 0, lastThrower: null, noCatch: 0, holdT: 0, curve: 0, hitCool: 0,
                  bankT: -99, away: 0, spin: 0, spinAngle: 0 };
    this.snitch = { active: false, pos: new T.Vector3(), vel: new T.Vector3(), target: new T.Vector3(), retarget: 0, spawned: 0 };
    this.vel = new T.Vector3(); this.holdVel = new T.Vector3();
    this.anchors = { left: null, right: null };
    this.power = { cool: 0, t: 0 };
    this.headPos = new T.Vector3(); this.headFwd = new T.Vector3(0, 0, -1);
    this.prevButtons = {};
    this.track = { left: { real: [], glove: [], q: null, omega: new T.Vector3() }, right: { real: [], glove: [], q: null, omega: new T.Vector3() } };
    this.keys = {};
    this.save = Profiles.init(loadSave());
    this.flight = FLIGHT_MODES.includes(this.save.flight) ? this.save.flight : 'free';
    this.level = LEVELS[Math.min(LEVELS.length - 1, this.save.level || 0)];
    this.menu = { row: 0, realm: 'shuffle', arena: 'frisbee', mode: 'hoops', ...this.save.menu };
    this.stats = this.freshStats();
    this.snapArmed = true; this.pingT = 0; this.msg = ''; this.msgT = 0; this.time = 0; this.tipGap = 0;
    this.easy = false; this.modeLock = null; this.quietT = 0; this.weakThrows = 0; this.bigSwings = 0; this.swingCool = 0; this.activity = 1;
    this.yHold = 0; this.shockT = 0; this.worlds = {}; this.skies = {}; this.floors = {}; this.ghosts = new Map();
    addEventListener('keydown', e => { if (['Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); this.keys[e.code] = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.el.addEventListener('enter-vr', () => {
      const session = this.el.renderer.xr.getSession();
      // Headset off (or the Quest menu opened): freeze, and come back to the pause menu instead of straight into play.
      if (session) session.addEventListener('visibilitychange', () => { this.paused = session.visibilityState === 'hidden'; if (this.paused) this.openPause(); });
      this.calibrateT = 1.2;
    });
    this.el.addEventListener('exit-vr', () => { this.paused = false; this.setCockpit(0); });
    this.pauseOpen = false; this.pauseRow = 0; this.versionPick = 'v2';
    this.net = new NetClient({ welcome: m => { this.save.token = m.token; writeSave(this.save); }, rating: m => this.flash(`ONLINE RANK: ${m.rank} ${m.rating} (${m.delta >= 0 ? '+' : ''}${m.delta})`, 3), match: m => this.flash(`MATCH FOUND: ${m.players.map(p => p.name).join(' vs ')}`, 3) });
    if (this.save.server) this.net.connect(this.save.server, Profiles.current(this.save), this.save.token);
    this.envMaps = buildEnvMaps(this.el.renderer);
    this.buildStatic();
    this.buildBots();
    this.buildPanels();
    this.surge = null; this.nextSurgeAt = 0; this.scoreAlpha = 0; this.scoreShowT = 0; this.toastAlpha = 0; this.hitBuzzAt = 0;
    this.orbs = []; this.buffs = new Map(); this.streak = { team: null, n: 0 }; this.portalFlash = 0;
    this.arena = ARENAS.find(a => a.id === this.menu.arena) || ARENAS[0];
    this.mode = MODES.find(m => m.id === this.menu.mode) || MODES[0];
    this.applyRealm(this.previewRealm());
    this.newMatch();
    this.ready = true;
  },

  freshStats() { return { goals: 0, steals: 0, passes: 0, snitch: 0, tricks: 0, hits: 0 }; },

  // ---------------------------------------------------------------- world building
  add(tag, attrs, parent = this.el) {
    const e = document.createElement(tag);
    for (const k in attrs) e.setAttribute(k, (k === 'material' || k === 'geometry') ? AFRAME.utils.styleParser.parse(attrs[k]) : attrs[k]);
    parent.appendChild(e);
    return e;
  },

  buildStatic() {
    const scene = this.el.object3D;
    this.sky = new T.Mesh(new T.SphereGeometry(1000, 48, 24), new T.MeshBasicMaterial({ side: T.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    this.ground = new T.Mesh(new T.CircleGeometry(500, 48), new T.MeshStandardMaterial({ roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    scene.add(this.ground);
    // Two floor halves (blue at +z, orange at -z) raised off the ground so nothing is ever coplanar (no flicker).
    this.halves = ['blue', 'orange'].map(team => {
      const m = new T.Mesh(new T.CircleGeometry(ARENA_R, 64, team === 'blue' ? Math.PI : 0, Math.PI), new T.MeshStandardMaterial({ roughness: 0.85 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.3;
      scene.add(m);
      return m;
    });
    const lineMat = this.lineMat = new T.MeshStandardMaterial({ roughness: 1 });
    const mid = new T.Mesh(new T.BoxGeometry(ARENA_R * 2, 0.1, 0.8), lineMat); mid.position.y = 0.36;
    const center = new T.Mesh(new T.TorusGeometry(8, 0.2, 6, 64), lineMat); center.rotation.x = Math.PI / 2; center.position.y = 0.42;
    scene.add(mid, center);
    this.edgeMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const edge = new T.Mesh(new T.TorusGeometry(ARENA_R, 0.35, 8, 128), this.edgeMat); edge.rotation.x = Math.PI / 2; edge.position.y = 0.6;
    const top = new T.Mesh(new T.TorusGeometry(ARENA_R, 0.2, 6, 128), this.edgeMat); top.rotation.x = Math.PI / 2; top.position.y = Y_MAX;
    this.wallMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false });
    const wall = new T.Mesh(new T.CylinderGeometry(ARENA_R, ARENA_R, Y_MAX - 2, 96, 1, true), this.wallMat); wall.position.y = (Y_MAX + 2) / 2;
    scene.add(edge, top, wall);

    this.beams = { pull: this.makeBeam(0x8ff7ff, 0.8, 0.015), armL: this.makeBeam(0x66ffff, 0.55, 0.035), armR: this.makeBeam(0x66ffff, 0.55, 0.035),
                   aimL: this.makeBeam(0xffffff, 0.25, 0.006), aimR: this.makeBeam(0xffffff, 0.25, 0.006) };
    const tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.BufferAttribute(new Float32Array(18 * 3), 3));
    this.trail = new T.Line(tg, new T.LineBasicMaterial({ transparent: true, opacity: 0.6 }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    const arrow = () => { const g = new T.ConeGeometry(0.045, 0.15, 8); g.rotateX(Math.PI / 2); const m = new T.Mesh(g, new T.MeshBasicMaterial()); m.visible = false; this.rig.add(m); return m; };
    this.discArrow = arrow(); this.snitchArrow = arrow();
    // Where your hands are steering: a faint ring ahead of you while you fly.
    this.steerMark = new T.Mesh(new T.RingGeometry(0.2, 0.26, 32), new T.MeshBasicMaterial({ color: '#66ffff', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
    this.steerMark.visible = false; scene.add(this.steerMark);
    const bg = new T.BufferGeometry();
    bg.setAttribute('position', new T.BufferAttribute(new Float32Array(48 * 3), 3));
    this.burst = new T.Points(bg, new T.PointsMaterial({ size: 0.45, map: dotTexture(), transparent: true, depthWrite: false }));
    this.burst.visible = false; this.burst.frustumCulled = false; this.burstVel = new Float32Array(48 * 3); this.burstT = 0;
    scene.add(this.burst);
    this.shock = new T.Mesh(new T.TorusGeometry(1, 0.06, 6, 48), new T.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.8 }));
    this.shock.rotation.x = Math.PI / 2; this.shock.visible = false;
    scene.add(this.shock);
    // King of the Core: the glowing core in the middle.
    this.core = new T.Group();
    this.core.add(new T.Mesh(new T.SphereGeometry(CORE_R, 32, 20), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, depthWrite: false })));
    for (const r of [0, 60, 120]) { const ring = new T.Mesh(new T.TorusGeometry(CORE_R, 0.08, 6, 64), new T.MeshBasicMaterial({ color: '#ffffff' })); ring.rotation.set(r * DEG, r * DEG, 0); this.core.add(ring); }
    this.core.position.set(0, 16, 0);
    scene.add(this.core);
    // A soft glow around the disc so it's easy to spot from anywhere (brighter when the lights go out).
    this.discGlow = glowSprite('#ffffff', 2.4, 0.45);
    this.discObj.add(this.discGlow);
    this.snitchObj.add(glowSprite('#ffd23d', 1.8, 0.6));
  },

  makeBeam(color, opacity, radius) {
    const geo = new T.CylinderGeometry(radius, radius, 1, 6);
    geo.translate(0, 0.5, 0);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity }));
    m.visible = false; m.frustumCulled = false;
    this.el.object3D.add(m);
    return m;
  },

  setBeam(m, a, b) {
    tmp2.subVectors(b, a);
    const len = tmp2.length();
    if (len < 0.01) { m.visible = false; return; }
    m.position.copy(a); m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, tmp2.divideScalar(len));
    m.visible = true;
  },

  buildBots() {
    const defs = [{ team: 'blue', label: 'ALLY', start: [8, 14, 40], lane: 1 },
                  { team: 'orange', label: 'ORANGE 1', start: [-8, 14, -40], lane: -1 },
                  { team: 'orange', label: 'ORANGE 2', start: [8, 14, -40], lane: 1, seeker: true }];
    const add = (t, a, p) => this.add(t, a, p);
    this.bots = defs.map(def => {
      const el = add('a-entity', {}), col = TEAM_COLOR[def.team];
      // Rider: glossy black helmet and suit with neon team trim (the look from the owner's reference clip): a glowing visor,
      // a band round the helmet and two stripes on the suit.
      add('a-sphere', { radius: 0.3, position: '0 0.62 0', 'segments-width': 28, 'segments-height': 18, material: 'color: #15171c; metalness: 0.6; roughness: 0.22' }, el);
      add('a-sphere', { radius: 0.25, position: '0 0.64 0.11', scale: '1.05 0.55 0.85', 'segments-width': 24, 'segments-height': 12, material: `color: #0b1320; metalness: 0.9; roughness: 0.1; emissive: ${col}; emissiveIntensity: 0.55` }, el);
      add('a-torus', { radius: 0.3, 'radius-tubular': 0.018, position: '0 0.6 0', rotation: '90 0 0', 'segments-tubular': 36, material: `color: ${col}; emissive: ${col}; emissiveIntensity: 1` }, el);
      add('a-cone', { 'radius-bottom': 0.26, 'radius-top': 0.17, height: 0.42, position: '0 0.2 0', 'segments-radial': 20, material: 'color: #1a1c21; metalness: 0.35; roughness: 0.4' }, el);
      add('a-torus', { radius: 0.255, 'radius-tubular': 0.02, position: '0 0.03 0', rotation: '90 0 0', 'segments-tubular': 32, material: `color: ${col}; emissive: ${col}; emissiveIntensity: 1` }, el);
      add('a-torus', { radius: 0.22, 'radius-tubular': 0.03, position: '0 0.24 0', rotation: '90 0 0', 'segments-tubular': 32, material: `color: ${col}; emissive: ${col}; emissiveIntensity: 0.9` }, el);
      const tag = labelSprite(def.label, { color: '#ffffff', bg: hexA(col, 0.55), height: 0.45 }); tag.position.y = 1.3; el.object3D.add(tag);
      const halo = glowSprite(col, 2.6, 0.35); halo.position.y = 0.5; el.object3D.add(halo);
      const rides = { saucer: add('a-entity', {}, el), foundry: add('a-entity', {}, el), castle: add('a-entity', {}, el), gym: add('a-entity', {}, el), cloud: add('a-entity', {}, el) };
      add('a-cylinder', { radius: 0.9, height: 0.16, 'segments-radial': 20, material: `color: ${col}; emissive: ${col}; emissiveIntensity: 0.35; metalness: 0.4` }, rides.saucer);
      add('a-box', { width: 1.1, height: 0.5, depth: 0.8, position: '0 0.05 0', material: 'color: #5f6670; metalness: 0.7; roughness: 0.4' }, rides.foundry);
      add('a-box', { width: 1.12, height: 0.12, depth: 0.82, position: '0 0.2 0', material: `color: ${col}; emissive: ${col}; emissiveIntensity: 0.4` }, rides.foundry);
      add('a-cylinder', { radius: 0.04, height: 2.1, rotation: '90 0 0', position: '0 0.1 0.2', color: '#7a5230' }, rides.castle);
      add('a-cone', { 'radius-bottom': 0.25, 'radius-top': 0.05, height: 0.7, rotation: '90 0 0', position: '0 0.1 -0.95', color: '#d9b45a' }, rides.castle);
      add('a-box', { width: 0.5, height: 0.07, depth: 1.4, material: `color: ${col}; emissive: ${col}; emissiveIntensity: 0.4` }, rides.gym);
      for (const [x, s] of [[-0.45, 0.42], [0, 0.55], [0.45, 0.42]]) add('a-sphere', { radius: s, position: `${x} 0 0`, 'segments-width': 12, 'segments-height': 8, material: `color: #ffffff; emissive: ${col}; emissiveIntensity: 0.15` }, rides.cloud);
      const start = new T.Vector3(...def.start);
      // A light trail behind each rider so you can follow them across the field.
      const trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(16 * 3), 3));
      const trail = new T.Line(trailGeo, new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 })); trail.frustumCulled = false;
      this.el.object3D.add(trail);
      return { ...def, el, obj: el.object3D, rides, start, pos: start.clone(), vel: new T.Vector3(), facing: new T.Vector3(0, 0, def.team === 'blue' ? -1 : 1),
               stun: 0, cool: 0, grace: 0, power: { cool: 0, t: 0 }, trail, halo, col };
    });
  },

  previewRealm() {
    if (this.menu.realm !== 'shuffle') return REALMS.find(r => r.id === this.menu.realm) || REALMS[0];
    if (!this.shuffleNext) this.shuffleNext = REALMS[Math.floor(Math.random() * REALMS.length)];
    return this.shuffleNext;
  },

  applyRealm(realm) {
    this.realm = realm;
    const scene = this.el;
    this.sky.material.map = this.skies[realm.id] || (this.skies[realm.id] = skyTexture(realm.sky));
    this.sky.material.needsUpdate = true;
    this.applyLights(realm, false);
    const floor = this.floors[realm.floor] || (this.floors[realm.floor] = floorTexture(realm.floor));
    const look = LOOK[realm.id];
    this.el.object3D.environment = this.envMaps[realm.id];
    this.halves.forEach((m, i) => {
      const mat = m.material; mat.map = floor; mat.color.set(realm.tint[i ? 'orange' : 'blue']);
      mat.emissiveMap = floorLightTexture(); mat.emissive.set(look.patch[0]); mat.emissiveIntensity = look.patch[1]; mat.roughness = look.floorRough; mat.metalness = 0.1;
      mat.needsUpdate = true;
    });
    this.ground.visible = !!realm.ground;
    if (realm.ground) this.ground.material.color.set(realm.ground);
    this.lineMat.color.set(realm.lines);
    this.edgeMat.color.set(realm.edge);
    this.wallMat.color.set(realm.edge);
    for (const id in this.worlds) this.worlds[id].group.visible = false;
    const world = this.worlds[realm.id] || (this.worlds[realm.id] = buildRealmWorld(realm));
    if (!world.group.parent) this.el.object3D.add(world.group);
    world.group.visible = true;
    for (const r of REALMS) this.$('ride-' + r.id).object3D.visible = r.id === realm.id;
    for (const b of this.bots) for (const id in b.rides) b.rides[id].object3D.visible = id === realm.id;
    for (const id of ['dv-disc', 'dv-puck', 'dv-quaffle', 'dv-dodgeball']) this.$(id).object3D.visible = id === realm.disc;
    this.trail.material.color.set(realm.trail);
    this.discGlow.material.color.set(realm.trail);
    for (const k of ['armL', 'armR']) this.beams[k].material.color.set(realm.arm);
    this.buildArena();
  },

  // Realm lighting. dim = the LIGHTS OUT surge: almost dark, the disc and riders glow.
  applyLights(realm, dim) {
    const look = LOOK[realm.id], k = dim ? 0.18 : 1, fog = new T.Color(realm.fog).multiplyScalar((dim ? 0.25 : 1) * look.fog[1]);
    this.el.object3D.fog = new T.FogExp2(fog, realm.fogDensity * look.fog[0] * (dim ? 1.6 : 1));
    this.el.object3D.background = fog;
    // The cinematic grade (js/look.js): less flat fill light, a stronger and warmer key light.
    const sun = new T.Color(realm.sun[0]).lerp(new T.Color(look.sunTint), look.warm);
    this.$('hemi').setAttribute('light', { color: realm.hemi[0], groundColor: realm.hemi[1], intensity: realm.hemi[2] * look.ambient * k });
    this.$('sun').setAttribute('light', { color: '#' + sun.getHexString(), intensity: realm.sun[1] * look.key * k });
    this.sky.material.color.set(look.sky).multiplyScalar(dim ? 0.3 : 1);
    this.discGlow.scale.setScalar(dim ? 7 : 2.4); this.discGlow.material.opacity = dim ? 0.8 : 0.45;
  },

  // Builds hoops, prisms, rocks, air pockets, sweepers, bumpers and wind streams for the current arena, realm and mode.
  buildArena() {
    const arena = this.arena, realm = this.realm, mode = this.mode, scene = this.el.object3D;
    if (this.arenaGroup) { scene.remove(this.arenaGroup); this.arenaGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    if (this.arenaEl) this.arenaEl.parentNode.removeChild(this.arenaEl);
    const group = this.arenaGroup = new T.Group();
    this.arenaEl = this.add('a-entity', {});
    scene.add(group);
    this.obstacles = []; this.hoops = []; this.rocks = []; this.movers = []; this.bumpers = []; this.prisms = [];

    // Hoops: every realm builds its own (UFO rings, gears, stone arches, backboards, cloud wreaths). Same size and spot everywhere.
    this.styleUpdates = [];
    if (mode.hoops) for (const team of ['blue', 'orange']) {
      const z = OWN_Z[team], n = new T.Vector3(0, 0, team === 'blue' ? -1 : 1);
      arena.hoops.forEach((hl, idx) => {
        const c = new T.Vector3(hl.x, hl.y, z), st = HOOP_STYLE[realm.id](hl.size, team);
        const obj = st.obj;
        obj.position.copy(c); obj.rotation.y = team === 'blue' ? Math.PI : 0;
        group.add(obj); obj.updateMatrixWorld(true);
        const ph = hl.y - hl.size, pole = buildPole(realm, team, ph);
        pole.position.set(c.x, ph / 2, c.z); group.add(pole);
        const half = new T.Vector3(0.18, ph / 2, 0.18);
        const poleOb = { type: 'box', c: new T.Vector3(c.x, ph / 2, c.z), half, nhalf: half.clone().negate() };
        this.obstacles.push(poleOb);
        const extra = (st.obstacles || []).map(o => {
          const ob = { type: 'box', c: obj.localToWorld(o.local.clone()), half: o.half, nhalf: o.half.clone().negate(), bounce: o.bounce, local: o.local };
          this.obstacles.push(ob);
          return ob;
        });
        const label = labelSprite(team === 'blue' ? `DEFEND ${hl.pts}` : `SCORE ${hl.pts} PT${hl.pts > 1 ? 'S' : ''}`, { color: team === 'blue' ? '#cfe0ff' : '#ffffff', bg: hexA(TEAM_COLOR[team], 0.5), height: 1.1 });
        label.position.set(0, hl.size + 1.3, 0); obj.add(label);
        if (st.update) this.styleUpdates.push(st.update);
        this.hoops.push({ ...hl, idx, team, c, base: c.clone(), n, mat: st.flash[0], mats: st.flash, glow: st.flash.map(m => m.emissive.clone()), flash: 0, obj, pole, poleOb, extra });
      });
    }

    // Prisms: aimed so a throw from the launch ring that hits the plate's center reflects straight into the hoop.
    if (mode.hoops) for (const pr of arena.prisms || []) for (const s of [1, -1]) {
      const P = new T.Vector3(pr.plate.x * s, pr.plate.y, pr.plate.z * s), L = new T.Vector3(pr.launch.x * s, pr.launch.y, pr.launch.z * s);
      const hoopC = new T.Vector3(0, arena.hoops[0].y, GOAL_Z * s);
      const normal = tmp.subVectors(L, P).normalize().add(tmp2.subVectors(hoopC, P).normalize()).normalize().clone();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
      const plate = new T.Mesh(new T.BoxGeometry(3.2, 3.2, 0.3), new T.MeshStandardMaterial({ color: '#d9c3ff', emissive: '#7a5cff', emissiveIntensity: 0.35, transparent: true, opacity: 0.75, metalness: 0.3, roughness: 0.15 }));
      plate.position.copy(P); plate.quaternion.copy(q);
      const spot = new T.Mesh(new T.TorusGeometry(0.45, 0.06, 6, 32), new T.MeshBasicMaterial({ color: '#ffffff' }));
      spot.position.copy(P).addScaledVector(normal, 0.2); spot.quaternion.copy(q);
      const pad = new T.Mesh(new T.TorusGeometry(1.4, 0.07, 6, 40), new T.MeshBasicMaterial({ color: '#d9c3ff', transparent: true, opacity: 0.6 }));
      pad.position.copy(L); pad.lookAt(P);
      const guide = new T.Line(new T.BufferGeometry().setFromPoints([L, P, hoopC]), new T.LineDashedMaterial({ color: '#d9c3ff', dashSize: 0.8, gapSize: 1.6, transparent: true, opacity: 0.25 }));
      guide.computeLineDistances();
      group.add(plate, spot, pad, guide);
      const half = new T.Vector3(1.6, 1.6, 0.15);
      this.obstacles.push({ type: 'box', c: P, half, nhalf: half.clone().negate(), q, qInv: q.clone().invert(), bounce: 0.95, tag: 'prism' });
      this.prisms.push({ P, L, normal, hoopC, plate });
    }

    // Obstacles: crystal asteroids, swinging wrecking balls, bobbing rune stones, bouncy beach balls or drifting puffs.
    for (const p of [...mirror4(arena.rocksQuarter), ...mirrorZ(arena.rocksMiddle)]) {
      const ob = { type: 'ball', c: new T.Vector3(p.x, p.y, p.z), r: p.r }, st = ROCK_STYLE[realm.id](p, ob);
      st.mesh.position.copy(ob.c); group.add(st.mesh);
      for (const e of st.extra || []) group.add(e);
      this.obstacles.push(ob);
      this.rocks.push({ mesh: st.mesh, ob, c: ob.c, r: p.r, mats: st.mats || [], update: st.update, squash: st.squash, squashT: 0 });
    }
    // Cover to hide behind (blocks riders and the disc). Same spots in every arena, drawn in the realm's style.
    const coverBoxes = [...mirror4(COVER_QUARTER), ...mirrorZ(COVER_MIDDLE)];
    group.add(buildCover(realm, coverBoxes));
    for (const b of coverBoxes) {
      const half = new T.Vector3(b.w / 2, b.h / 2, b.d / 2);
      this.obstacles.push({ type: 'box', c: new T.Vector3(b.x, b.y, b.z), half, nhalf: half.clone().negate() });
    }
    // The realm's own field hazard (gravity wells, steam vents, ghost portals, bounce pads or drift clouds).
    this.hazard = HAZARD_BUILD[realm.id]();
    group.add(this.hazard.group);

    // Storm Bowl: two sweeper bars spinning opposite ways, and bumper orbs on mirrored paths.
    for (const sw of arena.sweepers || []) {
      const mesh = new T.Mesh(new T.BoxGeometry(sw.len, 1.2, 1.2), new T.MeshStandardMaterial({ color: realm.edge, emissive: realm.edge, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 }));
      mesh.position.set(0, sw.y, 0);
      group.add(mesh);
      const half = new T.Vector3(sw.len / 2, 0.6, 0.6), q = new T.Quaternion();
      const ob = { type: 'box', c: new T.Vector3(0, sw.y, 0), half, nhalf: half.clone().negate(), q, qInv: q.clone(), spin: sw.speed, bounce: 0.9 };
      this.obstacles.push(ob);
      this.movers.push({ mesh, ob, speed: sw.speed, angle: 0 });
    }
    if (arena.bumpers) for (let i = 0; i < arena.bumpers.count * 2; i++) {
      const mesh = new T.Mesh(new T.IcosahedronGeometry(arena.bumpers.r, 1), new T.MeshStandardMaterial({ color: '#ffffff', emissive: realm.edge, emissiveIntensity: 0.6, flatShading: true }));
      group.add(mesh);
      const ob = { type: 'ball', c: new T.Vector3(), r: arena.bumpers.r, bounce: arena.bumpers.bounce };
      this.obstacles.push(ob);
      this.bumpers.push({ mesh, ob, phase: Math.floor(i / 2) * 2.1, mirror: i % 2 ? -1 : 1 });
    }

    this.pockets = [...mirror4(arena.pocketsQuarter), ...mirrorZ(arena.pocketsMiddle), ...arena.pocketsCenter].map((p, i) => ({ c: new T.Vector3(p.x, p.y, p.z), phase: i * 0.7 }));
    // Faint on purpose so they never get in the way; the pocket a hand reaches for lights up.
    const glowMat = opacity => new T.MeshBasicMaterial({ color: '#e6ffff', transparent: true, opacity, depthWrite: false, fog: false });
    const shellGeo = new T.SphereGeometry(0.55, 16, 12), n = Math.max(1, this.pockets.length);
    this.pocketShells = new T.InstancedMesh(shellGeo, glowMat(0.06), n);
    this.pocketCores = new T.InstancedMesh(new T.SphereGeometry(0.14, 10, 8), glowMat(0.3), n);
    const m4 = new T.Matrix4();
    for (const im of [this.pocketShells, this.pocketCores]) {
      im.count = this.pockets.length;
      this.pockets.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.c.x, p.c.y, p.c.z)));
      im.frustumCulled = false;
      group.add(im);
    }
    this.pocketGlows = [0, 1].map(() => { const m = new T.Mesh(shellGeo, glowMat(0)); m.visible = false; group.add(m); return m; });

    this.windIndex = 0;
    this.setWinds(arena.winds[0]);
    this.core.visible = !!mode.core;
    this.core.traverse(o => { if (o.material) o.material.color.set(realm.edge); });
  },

  setWinds(winds) {
    this.winds = winds;
    if (this.wind) { this.arenaGroup.remove(this.wind); this.wind.geometry.dispose(); }
    const per = 140, total = Math.max(1, per * winds.length), pos = new Float32Array(total * 3);
    for (let i = 0; i < per * winds.length; i++) {
      const c = winds[Math.floor(i / per)], a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * CURRENT_R;
      pos.set([c.x + r * Math.cos(a), CURRENT_Y + r * Math.sin(a), (Math.random() * 2 - 1) * CURRENT_LEN], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    this.wind = new T.Points(geo, new T.PointsMaterial({ color: this.realm.wind, size: 0.3, map: dotTexture(), transparent: true, opacity: winds.length ? 0.55 : 0, depthWrite: false }));
    this.wind.frustumCulled = false; this.windPer = per;
    this.arenaGroup.add(this.wind);
  },

  // ---------------------------------------------------------------- helpers
  agents() { return ['player', ...this.activeBots]; },
  teamOf(h) { return h === 'player' ? 'blue' : h.team; },
  posOf(h) { return h === 'player' ? this.headPos : h.pos; },
  velOf(h) { return h === 'player' ? this.vel : h.vel; },
  facingOf(h) { return h === 'player' ? this.headFwd : h.facing; },
  powerOf(h) { return h === 'player' ? this.power : h.power; },
  fromFrontOrSide(holder, thiefPos) {
    tmp2.subVectors(thiefPos, this.posOf(holder));
    if (tmp2.lengthSq() < 1e-6) return true;
    return this.facingOf(holder).dot(tmp2.normalize()) > BEHIND_DOT;
  },
  mittOn(h) { return this.realm.power === 'mitt' && this.powerOf(h).t > 0; },
  slipOn(h) { return this.realm.power === 'slipstream' && this.powerOf(h).t > 0; },
  objective(team) { return this.mode.core ? this.core.position : new T.Vector3(0, 16, -OWN_Z[team]); },
  flash(msg, secs = 1.4, opts = {}) { this.msg = msg; this.msgT = secs; this.msgOpts = opts; this.hudT = 0; },
  surgeIs(id) { return !!(this.surge && this.surge.ev.id === id); },
  edge(name, down) { const was = this.prevButtons[name]; this.prevButtons[name] = down; return down && !was; },
  useEnergy(n) { this.energy = Math.max(0, this.energy - n); this.energyIdle = 0; },

  // ---------------------------------------------------------------- match flow
  newMatch() {
    this.state = 'ready';
    this.score = { blue: 0, orange: 0 };
    this.timeLeft = this.mode.time;
    this.result = null;
    this.stats = this.freshStats();
    this.snitch.active = false; this.snitch.spawned = 0;
    this.activeBots = this.mode.bots ? this.bots : [];
    for (const b of this.bots) { b.obj.visible = this.activeBots.includes(b); b.trail.visible = b.obj.visible; }
    if (this.surge) this.endSurge(true);
    this.nextSurgeAt = SURGE_FIRST[0] + Math.random() * (SURGE_FIRST[1] - SURGE_FIRST[0]);
    this.finalSurgeOn = false; this.onFire = null; this.streak = { team: null, n: 0 };
    this.clearOrbs(); this.buffs = new Map(); this.nextOrbAt = 8 + Math.random() * 6;
    this.kickoff();
  },

  // Load into the dream: fade out, swap the world, show its name, fade back in, then count down.
  // Shuffle tiles: roll the arena, mode and bot level fresh for every match (practice is left out of shuffled modes).
  rollShuffles() {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    if (this.menu.arena === 'shuffle') this.arena = pick(ARENAS);
    if (this.menu.mode === 'shuffle') this.mode = pick(MODES.filter(m => m.bots));
    if (this.menu.bots === 'shuffle') this.level = pick(LEVELS);
  },
  enterPortal() {
    this.save.menu = { ...this.menu }; writeSave(this.save);
    this.rollShuffles();
    this.nextRealm = this.previewRealm();
    this.shuffleNext = null;
    this.newMatch();
    this.state = 'portal'; this.portalT = 0; this.portalSwapped = false;
    this.$('fade').setAttribute('material', 'color', this.nextRealm.fog);
    beep(220, 900, 0.08); beep(330, 900, 0.06, 'sine', 0.3); beep(495, 900, 0.05, 'sine', 0.6);
  },

  kickoff() {
    const d = this.disc;
    // Every kickoff is a little different: the disc pops up and drifts left or right, never toward one team.
    d.pos.set((Math.random() - 0.5) * 3, 16 + (Math.random() - 0.5) * 2, 0); d.vel.set((Math.random() - 0.5) * 7, 2 + Math.random() * 3, 0); d.quat.identity();
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, tractor: null, passTo: null, lastThrower: null, noCatch: 0, holdT: 0, curve: 0, bankT: -99, away: 0, spin: 0, mega: false });
    this.rig.position.set(0, 14 - 1.3, 40);
    if (UP.clone().applyQuaternion(this.rig.quaternion).y < 0.999) this.blinkT = 0.35;
    this.rig.rotation.set(0, 0, 0);
    this.steerDir = null; this.levelT = 0; this.turnEase = 0; this.turnRate = 0;
    this.vel.set(0, 0, 0); this.holdVel.set(0, 0, 0);
    this.anchors.left = this.anchors.right = null;
    this.energy = ENERGY_MAX; this.energyIdle = 0; this.boostT = 0; this.boostCool = 0;
    this.power.cool = 3; this.power.t = 0;
    this.playerStun = 0; this.playerGrace = 0; this.impactFlash = 0; this.accelMag = 0; this.vig = this.vig || 0; this.coreT = 0;
    for (const b of this.bots) { b.pos.copy(b.start); b.vel.set(0, 0, 0); b.facing.set(0, 0, b.team === 'blue' ? -1 : 1); b.stun = 0; b.cool = 0; b.grace = 0; b.power.cool = 3; b.power.t = 0; }
    this.hudT = 0;
  },

  startCountdown(seconds) { if (this.inVR) this.calibrate(); this.kickoff(); this.state = 'countdown'; this.countT = seconds; this.flash(String(seconds), 0.9, { big: true }); },

  calibrate() { const y = this.rig.worldToLocal(this.headPos.clone()).y; this.setCockpit(Math.max(-0.5, Math.min(0.7, y - 1.25))); },
  setCockpit(y) { this.cockpitY = y; this.$('cockpit').object3D.position.y = y; },

  updateState(dt) {
    if (this.state === 'portal') {
      this.portalT += dt;
      const t = this.portalT, fade = this.fadeMat();
      if (!this.portalSwapped && t >= 0.5) {
        this.applyRealm(this.nextRealm);
        this.kickoff();
        this.portalSwapped = true;
        const card = { realm: this.nextRealm, arena: this.arena.name, mode: this.mode.name };
        this.portalPanel.set((g, W, H, p) => paintPortal(g, W, H, p, card));
        this.portalPanel.update();
      }
      if (fade) fade.opacity = t < 0.5 ? t / 0.5 : t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 0.6);
      this.portalPanel.setOpacity(t < 0.5 ? 0 : t < 3.4 ? Math.min(1, (t - 0.5) / 0.3) : Math.max(0, 1 - (t - 3.4) / 0.4));
      if (t >= 4) { this.portalPanel.setOpacity(0); if (fade) fade.opacity = 0; this.state = 'countdown'; this.countT = 3; this.flash('3', 0.9, { big: true }); if (this.inVR) this.calibrate(); }
      this.hudT = 0;
    } else if (this.state === 'countdown') {
      const before = Math.ceil(this.countT);
      this.countT -= dt;
      if (Math.ceil(this.countT) !== before && this.countT > 0) beep(440, 120, 0.1);
      if (this.countT <= 0) { this.state = 'playing'; this.flash('GO!', 1.2, { big: true, color: '#66ffff' }); beep(880, 250, 0.12); }
      else if (Math.ceil(this.countT) !== before) this.flash(String(Math.ceil(this.countT)), 0.9, { big: true });
      this.hudT = 0;
    } else if (this.state === 'scored') {
      this.stateT -= dt;
      if (this.stateT <= 0) { if (this.timeLeft <= 0) this.endMatch(); else this.startCountdown(2); }
    } else if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); }
    }
  },

  fadeMat() {
    if (!this.fadeMatCache) { const m = this.$('fade').getObject3D('mesh'); if (!m) return null; m.renderOrder = 1000; this.fadeMatCache = m.material; }
    return this.fadeMatCache;
  },
  endMatch() {
    this.state = 'over';
    // Ended upside down? Blink and stand upright so the menu is level.
    if (UP.clone().applyQuaternion(this.rig.quaternion).y < 0.999) { this.blinkT = 0.35; this.rig.rotation.set(0, 0, 0); this.steerDir = null; }
    this.disc.holder = null; this.snitch.active = false;
    this.result = Profiles.record(this.save, { mode: this.mode.id, arena: this.arena.id, realm: this.realm.id, level: this.level.name, ranked: this.mode.ranked && this.mode.bots,
                                               botRating: this.level.rating, scoreFor: this.score.blue, scoreAgainst: this.score.orange, stats: this.stats });
    if (this.net.match) this.net.send('result', { room: this.net.match.room, score: this.score, stats: this.stats });
    beep(523, 200, 0.12); beep(392, 400, 0.12, 'sine', 0.2);
    this.hudT = 0;
  },

  // ---------------------------------------------------------------- input
  trackVel(list, p, dt) {
    list.push({ p: p.clone(), dt });
    if (list.length > 5) list.shift();
    let sum = 0;
    for (let i = 1; i < list.length; i++) sum += list[i].dt;
    return sum > 0 ? list[list.length - 1].p.clone().sub(list[0].p).divideScalar(sum) : new T.Vector3();
  },
  // Smoothed wrist spin (rad/s); its vertical part curves throws.
  trackSpin(tr, qNow, dt) {
    if (tr.q && dt > 0) {
      const dq = qNow.clone().multiply(tr.q.clone().invert());
      if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
      const angle = 2 * Math.acos(Math.min(1, dq.w)), s = Math.sqrt(Math.max(0, 1 - dq.w * dq.w));
      tr.omega.lerp(s > 1e-4 ? new T.Vector3(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(angle / dt) : new T.Vector3(), 0.5);
    }
    tr.q = qNow.clone();
    return tr.omega.y;
  },

  readInput(dt) {
    const inVR = this.el.is('vr-mode') && this.el.renderer.xr.isPresenting;
    const cam = this.headEl.getObject3D('camera');
    const fwd = cam.getWorldDirection(new T.Vector3()), headPos = cam.getWorldPosition(new T.Vector3());
    // Up and right follow your ride, not the arena, so they still make sense upside down.
    const rigUp = UP.clone().applyQuaternion(this.rig.quaternion), right = new T.Vector3().crossVectors(fwd, rigUp);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0).applyQuaternion(this.rig.quaternion); else right.normalize();
    const inp = { inVR, fwd, right, rigUp, headPos, quat: cam.getWorldQuaternion(new T.Quaternion()), moveX: 0, moveY: 0, climb: 0, turnX: 0,
                  boost: false, boostHeld: false, level: false, power: false, pass: false, start: false, yDown: false, pausePress: false, menuX: 0, menuY: 0, hands: [] };
    if (inVR) {
      const xr = this.el.renderer.xr, frame = this.el.frame || xr.getFrame(), ref = xr.getReferenceSpace();
      const rigQ = this.rig.quaternion, headLocal = this.rig.worldToLocal(headPos.clone());
      const rightLocal = right.clone().applyQuaternion(rigQ.clone().invert());
      for (const src of xr.getSession().inputSources) {
        const gp = src.gamepad, side = src.handedness;
        if (!gp || (side !== 'left' && side !== 'right')) continue;
        const sx = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0), sy = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
        const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
        // Push either stick down to boost; keep it pushed to keep boosting. A or X turns you right side up (A also selects in menus).
        if (this.edge(side + 'Stick', btn(3))) inp.boost = true;
        if (btn(3)) inp.boostHeld = true;
        if (this.edge(side + 'Face', btn(4))) { inp.level = true; if (side === 'right') inp.start = true; }
        if (side === 'left') { inp.moveX = sx; inp.moveY = -sy; if (this.edge('lY', btn(5))) inp.pausePress = true; } // Y: pause menu
        else { inp.turnX = sx; inp.climb = -sy; if (this.edge('rB', btn(5))) inp.power = true; }
        const gripPose = frame && ref && src.gripSpace ? frame.getPose(src.gripSpace, ref) : null;
        const rayPose = frame && ref ? frame.getPose(src.targetRaySpace, ref) : null;
        if (!gripPose || !rayPose) continue;
        const gpos = gripPose.transform.position, go = gripPose.transform.orientation, ro = rayPose.transform.orientation;
        const realLocal = new T.Vector3(gpos.x, gpos.y, gpos.z);
        const shoulder = headLocal.clone().add(new T.Vector3(0, -0.25, 0)).addScaledVector(rightLocal, side === 'left' ? -0.18 : 0.18);
        const offset = realLocal.clone().sub(shoulder), r = offset.length();
        // Long arms: past ARM_START the glove reaches out faster than your real hand (up to ARM_MAX).
        const reach = r < ARM_START ? r : Math.min(ARM_MAX, r + ARM_GAIN * (r - ARM_START) ** 2);
        const glove = this.rig.localToWorld(shoulder.clone().addScaledVector(offset.normalize(), reach));
        const rayQ = new T.Quaternion(ro.x, ro.y, ro.z, ro.w).premultiply(rigQ), quat = new T.Quaternion(go.x, go.y, go.z, go.w).premultiply(rigQ);
        const tr = this.track[side], grip = btn(1), trigger = btn(0);
        const rp = rayPose.transform.position, rayOrigin = this.rig.localToWorld(new T.Vector3(rp.x, rp.y, rp.z));
        inp.hands.push({ side, glove, aimOrigin: glove, rayOrigin, shoulder: this.rig.localToWorld(shoulder.clone()), dir: new T.Vector3(0, 0, -1).applyQuaternion(rayQ), quat,
                         grip, trigger, triggerPressed: this.edge(side + 'T', trigger), throwPressed: false,
                         gloveVel: this.trackVel(tr.glove, glove, dt), realSpeed: this.trackVel(tr.real, realLocal, dt).length(),
                         spinY: this.trackSpin(tr, quat, dt), curveKeys: 0, haptic: gp.hapticActuators && gp.hapticActuators[0], desktop: false });
      }
      inp.menuX = inp.moveX; inp.menuY = inp.moveY;
    } else {
      const k = this.keys;
      inp.moveY = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      inp.moveX = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      inp.climb = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
      inp.boostHeld = !!(k.ShiftLeft || k.ShiftRight);
      inp.boost = this.edge('kBoost', inp.boostHeld);
      inp.level = this.edge('kL', !!k.KeyL);
      inp.start = this.edge('kEnter', !!(k.Enter || k.NumpadEnter));
      inp.power = this.edge('kC', !!k.KeyC);
      inp.pass = this.edge('kF', !!k.KeyF);
      inp.pausePress = this.edge('kPause', !!(k.KeyP || k.Escape || k.KeyR));
      inp.menuX = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
      inp.menuY = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
      const g = !!k.KeyG;
      inp.hands.push({ side: 'right', glove: headPos.clone().addScaledVector(fwd, 1.0).addScaledVector(UP, -0.3), aimOrigin: headPos.clone(), shoulder: null,
                       dir: fwd.clone(), quat: inp.quat.clone(), grip: false, trigger: g, triggerPressed: this.edge('kG', g), throwPressed: this.edge('kSpace', !!k.Space),
                       gloveVel: new T.Vector3(), realSpeed: 0, spinY: 0, curveKeys: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), haptic: null, desktop: true });
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
    this.updateRush();
    setListener(this.headPos, this.headFwd);
    if (this.paused) return;
    if (inp.inVR && this.calibrateT > 0 && (this.calibrateT -= dt) <= 0) this.calibrate();
    this.pingT -= dt;
    this.msgT = Math.max(0, this.msgT - dt);

    if (inp.inVR && !this.inVRBefore) this.prevButtons = {};
    this.inVRBefore = inp.inVR;

    // How to play card (from the start menu or the pause menu). Y, A or GOT IT closes it.
    if (this.helpOpen) {
      this.menuPanel.mesh.visible = this.pausePanel.mesh.visible = false;
      this.helpPanel.mesh.visible = true;
      this.updateHelp(inp); this.updateHud(dt); return;
    }
    this.helpPanel.mesh.visible = false;
    // Pause menu (Y; PC: P or Esc). The match clock, bots and disc all stop while it's open.
    if (inp.pausePress) { if (this.pauseOpen) this.closePause(); else this.openPause(); }
    if (this.pauseOpen && !this.canPause()) this.closePause(true);
    this.menuPanel.mesh.visible = !this.pauseOpen && (this.state === 'ready' || this.state === 'over');
    this.pausePanel.mesh.visible = !!this.pauseOpen;
    if (this.pauseOpen) { this.updatePause(inp); this.updateHud(dt); return; }

    const inMenu = this.state === 'ready' || this.state === 'over';
    if (inMenu) { this.updateMenu(inp); inp.boost = false; }
    else for (const side of ['left', 'right']) { this.lasers[side].beam.visible = false; this.lasers[side].dot.visible = false; }
    this.updateState(dt);
    const live = this.state === 'playing';
    this.live = live;
    this.updateSurges(dt);
    this.updateOrbs(dt, live);
    this.updateMode(inp, dt, live);
    this.updatePowers(dt);
    if (live && inp.power) this.usePower('player');
    this.updateArena(dt);
    this.movePlayer(inp, dt, live);
    this.updateDisc(inp, dt, live);
    this.updateSnitch(inp, dt, live);
    this.updateBots(dt, live);
    if (live) { this.bumpBodies(); this.coach(inp, dt); this.updateCore(dt); }
    this.updateNet(inp);
    this.updateComfort(dt);
    this.updateHud(dt);
    this.render(inp, dt);
  },

  // ---------------------------------------------------------------- panels: menus, pause, scoreboard, messages
  buildPanels() {
    const menuAnchor = this.$('menu').object3D;
    this.menuPanel = new UIPanel(MENU_W, MENU_H, 800);
    this.hintPanel = new UIPanel(MENU_W - 0.12, 0.075, 800);
    this.hintPanel.mesh.position.set(0, MENU_H / 2 - 824 / 800, 0.002);
    this.menuPanel.mesh.add(this.hintPanel.mesh);
    this.pausePanel = new UIPanel(PAUSE_W, PAUSE_H, 800);
    this.helpPanel = new UIPanel(HELP_W, HELP_H, 800);
    this.helpPanel.mesh.visible = false;
    menuAnchor.add(this.menuPanel.mesh, this.pausePanel.mesh, this.helpPanel.mesh);
    this.helpOpen = !this.save.seenHelp; // first time: show the controls before anything else
    // A small "Y PAUSE" tag rides above your left glove so the pause button is never a mystery.
    const ytag = labelSprite('Y  PAUSE', { color: '#ffffff', bg: 'rgba(8,18,31,0.6)', height: 0.045 });
    ytag.position.set(0, 0.11, 0); this.gloveEls.left.object3D.add(ytag);
    this.scorePanel = new UIPanel(SCORE_W, SCORE_H, 1000, { onTop: true, order: 900 });
    this.$('hud').object3D.add(this.scorePanel.mesh);
    this.scorePanel.setOpacity(0);
    this.toastPanel = new UIPanel(1.4, 0.42, 700, { onTop: true, order: 1003 });
    this.rig.add(this.toastPanel.mesh); this.toastPanel.setOpacity(0);
    this.portalPanel = new UIPanel(1.25, 0.82, 900, { onTop: true, order: 1001 });
    this.headEl.object3D.add(this.portalPanel.mesh); this.portalPanel.mesh.position.set(0, 0, -1.1); this.portalPanel.setOpacity(0);
    // Laser pointers (shown while a menu is up) with a dot where they touch the panel.
    this.lasers = {};
    for (const side of ['left', 'right']) {
      const beam = this.makeBeam(0x66ffff, 0.7, 0.004), dot = glowSprite('#ffffff', 0.05, 1);
      dot.visible = false; this.el.object3D.add(dot);
      this.lasers[side] = { beam, dot };
    }
    this.pointerSide = 'right';
    this.focus = { row: 5, col: 2 }; this.pauseFocus = { row: 0, col: 0 };
    // Energy for boosting: a ring of dots around your left glove.
    this.energyDots = around(10, (i, a) => {
      const m = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), new T.MeshBasicMaterial({ color: '#66ffff' }));
      m.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); this.gloveEls.left.object3D.add(m); return m;
    });
    // PC: click and point at the menus with the mouse.
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

  // Which button the lasers (VR) or the mouse (PC) point at, and whether it was clicked this frame.
  pointAt(inp, panels) {
    let hover = null, click = null;
    for (const side of ['left', 'right']) { this.lasers[side].beam.visible = false; this.lasers[side].dot.visible = false; }
    if (inp.inVR) {
      for (const h of inp.hands) {
        if (h.desktop || !h.rayOrigin) continue;
        let best = null;
        for (const p of panels) { const hit = p.pick(h.rayOrigin, h.dir); if (hit && (!best || hit.dist < best.dist)) best = { ...hit, panel: p }; }
        const L = this.lasers[h.side], end = best ? best.point : h.rayOrigin.clone().addScaledVector(h.dir, 2.5);
        this.setBeam(L.beam, h.rayOrigin, end);
        L.beam.material.opacity = h.side === this.pointerSide ? 0.75 : 0.3;
        if (best) { L.dot.visible = true; L.dot.position.copy(best.point); }
        if (h.triggerPressed) this.pointerSide = h.side;
        if (best && best.btn) {
          if (!hover || h.side === this.pointerSide) hover = best;
          if (h.triggerPressed) { click = best; pulse(h, 0.4, 30); }
        }
      }
    } else if (this.mouseHover || this.mouseClick) {
      const cam = this.headEl.getObject3D('camera');
      const cast = v => { this.raycaster.setFromCamera(v, cam); let best = null; for (const p of panels) { const hit = p.pick(this.raycaster.ray.origin, this.raycaster.ray.direction); if (hit && (!best || hit.dist < best.dist)) best = { ...hit, panel: p }; } return best; };
      if (this.mouseHover) { const b = cast(this.mouseHover); if (b && b.btn) hover = b; }
      if (this.mouseClick) { const b = cast(this.mouseClick); if (b && b.btn) click = b; this.mouseClick = null; }
    }
    return { hover, click };
  },

  // Stick / arrow keys move a focus box around a panel's buttons (rows and columns). Returns the newly focused button if it moved.
  stickNav(inp, panel, focus) {
    const flick = (v, name) => { if (Math.abs(v) > 0.7 && this[name]) { this[name] = false; return Math.sign(v); } if (Math.abs(v) < 0.3) this[name] = true; return 0; };
    const dy = flick(inp.menuY, 'armY'), dx = flick(inp.menuX, 'armX');
    if (!dy && !dx) return null;
    const btns = panel.buttons, rows = [...new Set(btns.map(b => b.row))].sort((a, b) => a - b);
    const cur = btns.find(b => b.row === focus.row && b.col === focus.col) || btns[0];
    let next = cur;
    if (dy) {
      const ri = rows.indexOf(cur.row), row = rows[Math.max(0, Math.min(rows.length - 1, ri - dy))];
      const cx = cur.x + cur.w / 2;
      next = btns.filter(b => b.row === row).sort((a, b) => Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))[0] || cur;
    } else {
      const inRow = btns.filter(b => b.row === cur.row).sort((a, b) => a.col - b.col), i = inRow.indexOf(cur);
      next = inRow[Math.max(0, Math.min(inRow.length - 1, i + dx))] || cur;
    }
    if (next === cur) return null;
    focus.row = next.row; focus.col = next.col;
    beep(600, 40, 0.05);
    return next;
  },

  // ---------------------------------------------------------------- how to play card
  openHelp() { this.helpOpen = true; this.helpKey = ''; this.armX = this.armY = false; this.placeMenu(this.pauseOpen); beep(600, 60, 0.06); },
  updateHelp(inp) {
    const panel = this.helpPanel, key = `${this.inVR}:${this.realm.id}`;
    if (key !== this.helpKey) { this.helpKey = key; const m = { inVR: this.inVR, power: `${this.realm.powerName.toLowerCase()} (this realm)` }; panel.set((g, W, H, p) => paintHowTo(g, W, H, p, m)); }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]);
    panel.highlight(hover ? hover.btn : panel.buttons[0], '#66ffff');
    if (click || inp.start || inp.pausePress) {
      this.helpOpen = false; this.save.seenHelp = true; writeSave(this.save);
      if (!this.pauseOpen) this.placeMenu(false);
      this.armX = this.armY = false; beep(700, 60, 0.06);
    }
  },

  // ---------------------------------------------------------------- pause menu
  canPause() { return this.state !== 'ready' && this.state !== 'over'; },
  openPause() {
    if (!this.canPause() || this.pauseOpen) return;
    this.pauseOpen = true; this.pauseFocus = { row: 0, col: 0 }; this.armX = this.armY = false; this.pauseKey = '';
    this.anchors.left = this.anchors.right = null;
    this.placeMenu(true);
    beep(500, 80, 0.08);
  },
  closePause(quiet) { this.pauseOpen = false; this.placeMenu(false); if (!quiet) beep(700, 80, 0.08); },
  // The pause menu appears wherever you're looking; the start menu stays straight ahead of your ride.
  placeMenu(follow) {
    const m = this.$('menu').object3D;
    if (!follow) { m.position.set(0, 1.22, -1.55); m.rotation.set(0, 0, 0); return; }
    const a = this.rig.worldToLocal(this.headPos.clone()), f = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(a);
    const yaw = Math.atan2(-f.x, -f.z);
    m.rotation.set(0, yaw, 0); m.position.set(-Math.sin(yaw) * 1.4, 1.22, -Math.cos(yaw) * 1.4);
  },
  updatePause(inp) {
    const panel = this.pausePanel;
    const key = `${this.score.blue}:${this.score.orange}:${this.inVR}:${this.realm.id}:${this.arena.id}:${this.mode.id}:${this.easy}:${this.flight}`;
    if (key !== this.pauseKey) {
      this.pauseKey = key;
      const model = { where: `${this.realm.name}  ·  ${this.arena.name}  ·  ${this.mode.name}`, blue: this.score.blue, orange: this.score.orange, inVR: this.inVR,
                      reach: this.inVR ? `ARMS: ${this.easy ? 'EASY REACH (point + trigger)' : 'FULL MOTION (swing to throw)'}` : 'ARMS: EASY REACH (PC)',
                      flight: FLIGHT_LABEL[this.flight], exitLabel: window.SURGE_APP ? 'QUIT SURGE LEAGUE' : 'EXIT TO HOME SCREEN' };
      panel.set((g, W, H, p) => paintPause(g, W, H, p, model));
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
    else if (pick.id === 'reach') { if (this.inVR) { this.modeLock = this.easy ? 'full' : 'easy'; this.setEasy(this.modeLock === 'easy', 'you chose it'); } }
    else if (pick.id === 'flight') {
      this.flight = FLIGHT_MODES[(FLIGHT_MODES.indexOf(this.flight) + 1) % FLIGHT_MODES.length];
      this.save.flight = this.flight; writeSave(this.save); beep(640, 70, 0.06);
    }
    else if (pick.id === 'restart') { this.closePause(true); this.newMatch(); this.startCountdown(3); }
    else if (pick.id === 'menu') { this.closePause(true); this.newMatch(); }
    else if (pick.id === 'v1') this.leaveTo('v1/');
    else this.exitGame();
  },
  // Go to another page (version 1 or the Quest Games home screen). Ends VR first so the browser doesn't hang in an empty room.
  leaveTo(url) {
    this.flash('Loading...', 5); beep(440, 200, 0.08);
    const session = this.el.renderer.xr.getSession && this.el.renderer.xr.getSession();
    const go = () => location.assign(url + (window.SURGE_APP ? '?app=1' : ''));
    if (session) session.end().then(go, go); else go();
  },
  // Exit: in the installed app this closes it; in the browser it goes back to the Quest Games home screen.
  exitGame() {
    if (window.SURGE_APP) {
      // The app closes itself if the headset allows it; otherwise you land on the big PLAY button (the Meta button quits).
      const session = this.el.renderer.xr.getSession && this.el.renderer.xr.getSession();
      const close = () => { try { window.close(); } catch (e) {} };
      if (session) session.end().then(close, close); else close();
    } else this.leaveTo('../');
  },

  // ---------------------------------------------------------------- start / results menu
  menuHint(btn) {
    if (!btn) return 'Point at anything to learn about it.';
    const p = Profiles.current(this.save);
    switch (btn.id) {
      case 'realm': {
        if (btn.value === 'shuffle') return `A different dream every match. Next up: ${this.previewRealm().name}.`;
        const r = REALMS.find(x => x.id === btn.value);
        return `Ride a ${r.ride.toLowerCase()}. Power: ${r.powerName}. Hazard: ${r.hazardName}.`;
      }
      case 'arena': return btn.value === 'shuffle' ? 'A random arena every match.' : ARENAS.find(a => a.id === btn.value).blurb;
      case 'mode': { if (btn.value === 'shuffle') return 'A random mode every match (bots always on).'; const m = MODES.find(x => x.id === btn.value); return m.blurb + (m.ranked ? ' Ranked.' : ' Not ranked.'); }
      case 'fullshuffle': return 'Shuffle everything: realm, arena, mode and bot level are a surprise every match. Starts right away.';
      case 'version': return VERSION_LINK.hint;
      case 'bots': if (btn.value === 'SHUFFLE') return 'Rookie, Pro or Legend bots, picked at random every match.'; return `Bot strength ${LEVELS.find(l => l.name === btn.value).rating}. Your rank moves more against stronger bots.`;
      case 'player-prev': case 'player-next': return `Switch player. ${p.name}: ${p.wins} wins, ${p.losses} losses, ${p.draws} draws.`;
      case 'player-new': return 'Add a new player on this headset. Rename players on the 2D page.';
      case 'online': return this.save.server ? 'Look for an online match (1 vs 1). Click again to stop.' : 'Add a league server address on the 2D page to play people online.';
      case 'help': return 'See every button on both controllers, and all the ways to score.';
      case 'home': return window.SURGE_APP ? 'Close Surge League.' : 'Leave Surge League and go back to the Quest Games menu.';
      case 'play': return `${this.previewRealm().name} · ${this.menu.arena === 'shuffle' ? 'SHUFFLED ARENA' : this.arena.name} · ${this.menu.mode === 'shuffle' ? 'SHUFFLED MODE' : this.mode.name} · ${this.menu.bots === 'shuffle' ? 'SHUFFLED' : this.level.name} bots`;
    }
    return '';
  },
  menuModel() {
    const p = Profiles.current(this.save), r = this.state === 'over' && this.result;
    return {
      realmId: this.menu.realm, arenaId: this.menu.arena === 'shuffle' ? 'shuffle' : this.arena.id, modeId: this.menu.mode === 'shuffle' ? 'shuffle' : this.mode.id,
      level: this.menu.bots === 'shuffle' ? 'SHUFFLE' : this.level.name, inVR: this.inVR, versionLabel: VERSION_LINK.label,
      profile: { name: p.name, sub: `${Profiles.rank(p.rating).name} ${Math.round(p.rating)}   ·   W${p.wins}  L${p.losses}  D${p.draws}` },
      onlineLabel: this.net.label(), onlineOn: this.net.status === 'searching' || !!this.net.match,
      result: r ? { blue: this.score.blue, orange: this.score.orange,
                    line1: `Surge Score ${r.surge}${r.newBest ? ' (new best!)' : ''}   ·   Rank ${r.rank} ${Math.round(r.rating)}${r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta})` : ''}   ·   Goals ${this.stats.goals}  Steals ${this.stats.steals}  Passes ${this.stats.passes}` } : null
    };
  },
  menuAction(btn) {
    const v = btn.value;
    if (btn.id === 'realm') { if (this.menu.realm !== v || v === 'shuffle') { this.menu.realm = v; this.shuffleNext = null; this.applyRealm(this.previewRealm()); } }
    else if (btn.id === 'arena') { this.menu.arena = v; if (v !== 'shuffle' && this.arena.id !== v) { this.arena = ARENAS.find(a => a.id === v); this.buildArena(); } }
    else if (btn.id === 'mode') { this.menu.mode = v; if (v !== 'shuffle' && this.mode.id !== v) { this.mode = MODES.find(m => m.id === v); this.buildArena(); this.newMatch(); } }
    else if (btn.id === 'bots') { this.menu.bots = v === 'SHUFFLE' ? 'shuffle' : v; if (v !== 'SHUFFLE') { this.level = LEVELS.find(l => l.name === v); this.save.level = LEVELS.indexOf(this.level); } }
    else if (btn.id === 'fullshuffle') {
      Object.assign(this.menu, { realm: 'shuffle', arena: 'shuffle', mode: 'shuffle', bots: 'shuffle' }); this.shuffleNext = null;
      this.flash('FULL SHUFFLE: realm, arena, mode and bots are a surprise every match.', 2.5); this.enterPortal(); return;
    }
    else if (btn.id === 'player-prev' || btn.id === 'player-next') {
      const list = this.save.profiles, i = list.findIndex(x => x.id === this.save.active);
      this.save.active = list[(i + (btn.id === 'player-next' ? 1 : -1) + list.length) % list.length].id;
    } else if (btn.id === 'player-new') {
      const np = Profiles.make(`PLAYER ${this.save.profiles.length + 1}`);
      this.save.profiles.push(np); this.save.active = np.id;
      this.flash(`Welcome, ${np.name}!`, 2);
    } else if (btn.id === 'online') {
      if (!this.save.server) this.flash('No league server set yet. Add one on the 2D page.', 2.5);
      else if (this.net.status === 'searching') this.net.unqueue();
      else this.net.queue(this.mode.id, this.arena.id, 2);
    } else if (btn.id === 'help') return this.openHelp();
    else if (btn.id === 'version') return this.leaveTo(VERSION_LINK.url);
    else if (btn.id === 'home') return this.exitGame();
    else if (btn.id === 'play') { this.enterPortal(); return; }
    this.save.menu = { ...this.menu }; writeSave(this.save);
    beep(700, 50, 0.06);
  },
  updateMenu(inp) {
    const panel = this.menuPanel, model = this.menuModel(), key = JSON.stringify(model);
    if (key !== this.menuKey) { this.menuKey = key; panel.set((g, W, H, p) => paintStartMenu(g, W, H, p, model)); }
    panel.update();
    const { hover, click } = this.pointAt(inp, [panel]);
    if (hover) { this.focus.row = hover.btn.row; this.focus.col = hover.btn.col; }
    const moved = this.stickNav(inp, panel, this.focus);
    // Moving the stick along a row of choices picks them right away (like before); A then enters the dream.
    if (moved && ['realm', 'arena', 'mode', 'bots'].includes(moved.id) && inp.menuX) this.menuAction(moved);
    const focused = panel.buttons.find(b => b.row === this.focus.row && b.col === this.focus.col);
    const shown = hover ? hover.btn : focused;
    panel.highlight(shown, '#66ffff');
    const hint = this.msgT > 0 ? this.msg : this.menuHint(shown);
    if (hint !== this.hintText) {
      this.hintText = hint;
      this.hintPanel.set((g, W, H) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d6e6f5'; fitFont(g, hint, W - 40, 28, 600); g.fillText(hint, W / 2, H / 2 + 1); });
      const page = document.getElementById('status'); if (page) page.textContent = hint;
    }
    this.hintPanel.update();
    if (click) this.menuAction(click.btn);
    else if (inp.start && focused) {
      // A on a choice tile = play; on a button = press it.
      if (['realm', 'arena', 'mode', 'bots'].includes(focused.id)) this.enterPortal(); else this.menuAction(focused);
    }
  },

  // ---------------------------------------------------------------- power-up orbs
  buffIs(who, id) { const b = this.buffs.get(who); return !!(b && b.type.id === id); },
  clearOrbs() { for (const o of this.orbs || []) this.el.object3D.remove(o.obj); this.orbs = []; },
  updateOrbs(dt, live) {
    for (const [who, b] of this.buffs) {
      if ((b.t -= dt) > 0) continue;
      this.buffs.delete(who);
      if (who === 'player') this.flash(`${b.type.name} wore off`, 1.2);
    }
    for (const o of this.orbs) {
      o.life -= dt;
      o.obj.userData.core.rotation.y += dt * 1.6; o.obj.userData.ring.rotation.x += dt * 1.2;
      o.obj.position.set(o.pos.x, o.pos.y + Math.sin(this.time * 2 + o.ph) * 0.3, o.pos.z);
      o.obj.scale.setScalar(o.life < 2 ? Math.max(0.05, o.life / 2) : Math.min(1, (o.age = (o.age || 0) + dt) * 2));
    }
    this.orbs = this.orbs.filter(o => { if (o.life > 0) return true; this.el.object3D.remove(o.obj); return false; });
    if (!live) return;
    const elapsed = this.mode.time - this.timeLeft;
    if (!this.orbs.length && elapsed >= this.nextOrbAt && this.timeLeft > 8) {
      // A mirrored pair (one in each half), same power-up, away from cover and obstacles.
      const type = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      let p = null;
      for (let k = 0; k < 20 && !p; k++) {
        const c = new T.Vector3((Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 24), 8 + Math.random() * 18, 10 + Math.random() * 26);
        if (this.obstacles.every(o => (o.type === 'ball' ? o.c.distanceTo(c) - o.r : o.c.distanceTo(c) - o.half.length()) > 3)) p = c;
      }
      if (p) for (const s of [1, -1]) {
        const obj = buildOrb(type), pos = new T.Vector3(p.x * s, p.y, p.z * s);
        this.el.object3D.add(obj);
        this.orbs.push({ type, pos, obj, life: 20, ph: s });
      }
      this.nextOrbAt = elapsed + 12 + Math.random() * 6;
      if (p) beepAt(1200, 200, 0.06, 'triangle', p);
    }
    for (const o of [...this.orbs]) for (const a of this.agents()) {
      if (this.posOf(a).distanceTo(o.pos) > 1.9) continue;
      this.grantBuff(a, o.type);
      this.startBurst(o.pos, o.type.color);
      this.el.object3D.remove(o.obj); this.orbs.splice(this.orbs.indexOf(o), 1);
      break;
    }
  },
  grantBuff(who, type) {
    this.buffs.set(who, { type, t: type.time });
    if (who === 'player') {
      this.flash(`${type.name}!\n${type.hint}`, 2.6, { big: true, color: type.color });
      beep(880, 100, 0.1, 'triangle'); beep(1320, 200, 0.1, 'triangle', 0.1);
      for (const h of this.hands || []) pulse(h, 0.7, 120);
    } else {
      beepAt(660, 160, 0.08, 'triangle', who.pos);
      if (who.pos.distanceTo(this.headPos) < 35) this.flash(`${who.label} grabbed ${type.name}`, 1.4, { color: type.color });
    }
  },

  // ---------------------------------------------------------------- streaks: two goals in a row sets a team on fire (+1 per goal until the other team scores)
  scoreStreak(team) {
    if (this.streak.team === team) this.streak.n++; else this.streak = { team, n: 1 };
    if (this.onFire && this.onFire !== team) { this.onFire = null; this.flash(`${OTHER[team] === 'blue' ? 'YOUR' : 'ORANGE\'S'} FIRE IS OUT`, 1.5); }
    if (this.streak.n === 2 && this.onFire !== team) {
      this.onFire = team;
      setTimeout(() => this.flash(team === 'blue' ? 'BLUE IS ON FIRE!  +1 every goal' : 'ORANGE IS ON FIRE!  Stop them!', 2.5, { big: true, color: '#ff8a1f' }), 2300);
    }
  },

  // ---------------------------------------------------------------- surge events
  updateSurges(dt) {
    if (this.state !== 'playing') return;
    const elapsed = this.mode.time - this.timeLeft;
    // Final Surge: the last 30 seconds count double (not in practice).
    if (!this.finalSurgeOn && this.mode.bots && this.timeLeft <= FINAL_SURGE_AT && !this.mode.core) {
      this.finalSurgeOn = true;
      this.flash('FINAL SURGE!\nEvery point counts double', 3, { big: true, color: '#ff4fd8' });
      this.scoreShowT = 3.5;
      beep(330, 200, 0.12, 'sawtooth'); beep(440, 200, 0.12, 'sawtooth', 0.18); beep(660, 500, 0.12, 'sawtooth', 0.36);
      for (const h of this.hands || []) pulse(h, 0.8, 200);
    }
    if (this.surge) {
      this.surge.left -= dt;
      if (this.surge.left <= 0) this.endSurge();
    } else if (elapsed >= this.nextSurgeAt && this.timeLeft > 12) {
      const pool = SURGES.filter(e => (!e.needsHoops || this.mode.hoops) && e.id !== this.lastSurge);
      this.startSurge(pool[Math.floor(Math.random() * pool.length)]);
    }
  },
  startSurge(ev) {
    this.surge = { ev, left: ev.time, start: this.time, hoop: Math.floor(Math.random() * Math.max(1, this.arena.hoops.length)) };
    this.lastSurge = ev.id;
    const hint = ev.id === 'wild' ? `${this.realm.hazardName} go wild!` : ev.hint;
    this.flash(`SURGE!  ${ev.name}\n${hint}`, 3.2, { big: true, color: '#ffd166' });
    this.scoreShowT = 3.5;
    beep(392, 160, 0.1, 'triangle'); beep(523, 160, 0.1, 'triangle', 0.14); beep(784, 380, 0.11, 'triangle', 0.28);
    for (const h of this.hands || []) pulse(h, 0.7, 120);
    if (ev.id === 'golden') for (const hp of this.hoops) if (hp.idx === this.surge.hoop) for (const m of hp.mats) m.emissive.set('#ffd23d');
    if (ev.id === 'storm') {
      const flip = Math.random() < 0.5 ? 1 : -1;
      this.setWinds([{ x: -34, dir: flip }, { x: 34, dir: -flip }, { x: -12, dir: -flip }, { x: 12, dir: flip }]);
    }
    if (ev.id === 'dark') this.applyLights(this.realm, true);
  },
  endSurge(quiet) {
    const ev = this.surge.ev;
    if (ev.id === 'golden') for (const hp of this.hoops) hp.mats.forEach((m, i) => m.emissive.copy(hp.glow[i]));
    if (ev.id === 'storm') { this.windIndex = 0; this.setWinds(this.arena.winds[0]); }
    if (ev.id === 'dark') this.applyLights(this.realm, false);
    this.surge = null;
    const elapsed = this.mode.time - this.timeLeft;
    this.nextSurgeAt = elapsed + SURGE_GAP[0] + Math.random() * (SURGE_GAP[1] - SURGE_GAP[0]);
    if (!quiet) { this.flash(`${ev.name} is over`, 1.4); beep(392, 200, 0.06, 'triangle'); }
  },

  // ---------------------------------------------------------------- comfort and mode
  setEasy(on, why) {
    if (this.easy === on) return;
    this.easy = on; this.quietT = 0; this.weakThrows = 0; this.bigSwings = 0;
    this.flash(on ? `EASY REACH ON${why ? ` (${why})` : ''}\nPoint and hold trigger to pull. Trigger again to throw.` : `FULL MOTION ON${why ? ` (${why})` : ''}\nGrab with grip, swing and let go to throw.`, 3.5);
    beep(on ? 520 : 780, 160, 0.1);
  },
  updateMode(inp, dt, live) {
    if (!inp.inVR) { this.easy = true; return; }
    if (inp.toggleMode) { this.modeLock = this.easy ? 'full' : 'easy'; this.setEasy(this.modeLock === 'easy', 'you chose it'); return; }
    if (this.modeLock || !live) return;
    let speed = 0;
    for (const h of inp.hands) speed = Math.max(speed, h.realSpeed);
    this.activity += (speed - this.activity) * (1 - Math.exp(-dt / 3));
    this.swingCool = Math.max(0, this.swingCool - dt);
    if (!this.easy) {
      this.quietT = this.activity < QUIET_SPEED ? this.quietT + dt : 0;
      if (this.quietT > QUIET_SECONDS) this.setEasy(true, 'small arm moves');
      else if (this.weakThrows >= 2) this.setEasy(true, 'soft throws');
    } else {
      if (speed > STRONG_SWING && this.swingCool === 0) { this.bigSwings++; this.swingCool = 0.6; }
      this.bigSwings = Math.max(0, this.bigSwings - dt / 20);
      if (this.bigSwings >= 3) this.setEasy(false, 'big swings');
    }
  },

  // ---------------------------------------------------------------- powers
  updatePowers(dt) {
    const rate = this.surgeIs('power') ? 4 : 1;
    for (const a of this.agents()) { const p = this.powerOf(a); p.cool = Math.max(0, p.cool - dt * rate); p.t = Math.max(0, p.t - dt); }
    if (this.shockT > 0) this.shockT = Math.max(0, this.shockT - dt);
  },

  usePower(user) {
    const realm = this.realm, st = this.powerOf(user), isPlayer = user === 'player';
    if (st.cool > 0) { if (isPlayer) this.flash(`${realm.powerName} ready in ${Math.ceil(st.cool)}s`, 0.8); return false; }
    const pos = this.posOf(user), team = this.teamOf(user), d = this.disc;
    if (realm.power === 'tractor') {
      if (d.holder !== null || d.away > 0 || pos.distanceTo(d.pos) > TRACTOR_RANGE) { if (isPlayer) this.flash('Tractor beam: the disc is out of reach', 0.9); return false; }
      if (d.vel.length() > TRACTOR_MAX_DISC_SPEED) { if (isPlayer) this.flash('Tractor beam: too fast, wait for a loose disc', 1.1); return false; }
      d.tractor = user; d.tractorT = 2.5; d.pulledBy = null; d.passTo = null;
      beep(180, 500, 0.08); beep(240, 500, 0.06, 'sine', 0.1);
    } else if (realm.power === 'shockwave' || realm.power === 'gust') {
      const gust = realm.power === 'gust', dir = this.facingOf(user);
      for (const target of this.agents()) {
        if (this.teamOf(target) === team || this.buffIs(target, 'shield')) continue;
        const away = tmp3.subVectors(this.posOf(target), pos), dist = away.length();
        if (dist > (gust ? GUST_RANGE : SHOCK_R) || dist < 1e-3) continue;
        away.normalize();
        if (gust && away.dot(dir) < GUST_DOT) continue;
        if (d.holder === target && this.fromFrontOrSide(target, pos)) {
          d.holder = null; d.hand = null; d.lastThrower = user; d.noCatch = 0; d.holdT = 0;
          d.vel.copy(gust ? dir : tmp2.subVectors(pos, d.pos).normalize()).multiplyScalar(gust ? 14 : 8);
          if (target === 'player') this.flash('KNOCKED LOOSE!');
        }
        const push = gust ? dir : away;
        if (target === 'player') { this.vel.addScaledVector(push, 10); this.playerStun = Math.max(this.playerStun, 0.8); }
        else { target.vel.addScaledVector(push, 10); target.stun = Math.max(target.stun, 0.8); }
      }
      if (gust && d.holder === null && d.pos.distanceTo(pos) < GUST_RANGE && tmp3.subVectors(d.pos, pos).normalize().dot(dir) > GUST_DOT) { d.vel.addScaledVector(dir, 14); d.lastThrower = user; }
      this.shock.position.copy(pos); this.shockT = 0.45;
      beep(gust ? 300 : 70, 400, 0.15, 'sawtooth'); beep(gust ? 450 : 110, 300, 0.1, 'square', 0.05);
    } else {
      st.t = POWERS[realm.power].time;
      beep(realm.power === 'slipstream' ? 600 : 900, 250, 0.08, 'triangle');
    }
    st.cool = POWERS[realm.power].cool;
    if (isPlayer) { this.flash(realm.powerName + '!', 1); for (const h of this.hands) pulse(h, 0.6, 80); }
    return true;
  },

  // ---------------------------------------------------------------- arena motion (Storm Bowl)
  updateArena(dt) {
    const wild = !!(this.surge && this.surge.ev.id === 'wild');
    for (const r of this.rocks) if (r.update) r.update(dt, this.time);
    for (const u of this.styleUpdates) u(dt, this.time);
    this.hazard.update(dt, this.time, wild, this);
    if (this.live) {
      this.hazard.body(this.headPos, this.vel, dt, this, 'player');
      for (const b of this.activeBots) this.hazard.body(b.pos, b.vel, dt, null, b);
    }
    // Hoop Shift surge: every hoop slides side to side together (both ends move the same way, so it stays fair).
    const shift = this.surge && this.surge.ev.id === 'shift' ? Math.sin((this.time - this.surge.start) * 0.8) * 7 * Math.min(1, this.surge.left / 1.5) : 0;
    for (const hp of this.hoops) {
      const x = hp.base.x + shift;
      if (Math.abs(hp.c.x - x) < 1e-4) continue;
      hp.c.x = x; hp.obj.position.x = x; hp.pole.position.x = x; hp.poleOb.c.x = x;
      for (const ob of hp.extra) { hp.obj.updateMatrixWorld(true); ob.c.copy(hp.obj.localToWorld(ob.local.clone())); }
    }
    for (const m of this.movers) {
      m.angle += m.speed * dt;
      m.ob.q.setFromAxisAngle(UP, m.angle); m.ob.qInv.copy(m.ob.q).invert();
      m.mesh.quaternion.copy(m.ob.q);
    }
    for (const b of this.bumpers) {
      const t = this.time * 0.35 + b.phase;
      b.ob.c.set(Math.sin(t) * 26 * b.mirror, 16 + Math.sin(t * 1.7) * 9, Math.sin(t * 0.8 + 1) * 30 * b.mirror);
      b.mesh.position.copy(b.ob.c); b.mesh.rotation.y += dt;
    }
    if (this.arena.winds.length > 1 && this.live && !(this.surge && this.surge.ev.id === 'storm')) {
      const idx = Math.floor((this.mode.time - this.timeLeft) / 20) % this.arena.winds.length;
      if (idx !== this.windIndex) { this.windIndex = idx; this.setWinds(this.arena.winds[idx]); this.flash('THE WIND SHIFTS!', 1.6); beep(200, 500, 0.08, 'sawtooth'); }
    }
  },

  // ---------------------------------------------------------------- player movement
  movePlayer(inp, dt, live) {
    if (inp.inVR) {
      if (Math.abs(inp.turnX) > 0.7 && Math.abs(inp.climb) < 0.5 && this.snapArmed) { this.snapTurn(inp.turnX > 0 ? -30 : 30, inp.headPos.clone()); this.snapArmed = false; }
      if (Math.abs(inp.turnX) < 0.3) this.snapArmed = true;
    }
    const d = this.disc, anchored = [];
    for (const h of inp.hands) {
      if (h.desktop) continue;
      const a = this.anchors[h.side];
      if (a && (!h.grip || !live)) { this.anchors[h.side] = null; continue; }
      const holdingDisc = d.holder === 'player' && d.hand === h.side, discClose = d.holder === null && h.glove.distanceTo(d.pos) < SNAP_R;
      if (!a && live && h.grip && !holdingDisc && !discClose) {
        const p = this.pockets.find(pk => pk.c.distanceTo(h.glove) < POCKET_R);
        if (p) { this.anchors[h.side] = { point: h.glove.clone(), pocket: p }; pulse(h, 0.5, 40); beep(240, 70, 0.05, 'triangle'); }
      }
      if (this.anchors[h.side]) anchored.push({ a: this.anchors[h.side], h });
    }
    const prevVel = this.vel.clone();
    this.boostCool = Math.max(0, this.boostCool - dt); this.boostT = Math.max(0, this.boostT - dt);
    const slip = this.slipOn('player');
    if (anchored.length) {
      // Air pockets: the gripping glove stays put and you move around it.
      const delta = new T.Vector3();
      for (const { a, h } of anchored) delta.add(a.point.clone().sub(h.glove));
      delta.divideScalar(anchored.length);
      this.rig.position.add(delta);
      if (dt > 0) this.holdVel.lerp(delta.divideScalar(dt), 0.5);
      this.vel.copy(this.holdVel);
      this.wasAnchored = true;
    } else {
      if (this.wasAnchored) {
        this.wasAnchored = false;
        this.vel.copy(this.holdVel).multiplyScalar(LAUNCH_GAIN);
        if (this.vel.length() > LAUNCH_MAX) this.vel.setLength(LAUNCH_MAX);
        if (this.vel.length() > 4) { beep(200, 220, 0.08, 'sawtooth'); this.impactFlash = 0.3; }
        this.holdVel.set(0, 0, 0);
      }
      const dz = v => Math.abs(v) < 0.15 ? 0 : v;
      const climb = Math.abs(inp.turnX) > 0.6 ? 0 : dz(inp.climb);
      // Stick forward flies where your hands point (classic: where you look). Sideways slides, right stick up/down rises and sinks
      // along your own body, so it all still works upside down.
      const fwd = this.updateSteer(inp, dt), right = new T.Vector3().crossVectors(fwd, inp.rigUp);
      if (right.lengthSq() < 1e-4) right.copy(inp.right); else right.normalize();
      const thrust = new T.Vector3().addScaledVector(fwd, dz(inp.moveY)).addScaledVector(right, dz(inp.moveX)).addScaledVector(inp.rigUp, climb);
      if (thrust.lengthSq() > 1) thrust.normalize();
      const boostDir = thrust.lengthSq() > 0.01 && dz(inp.moveY) >= 0 ? thrust.clone().normalize() : fwd.clone();
      if (live && inp.boost && this.boostCool === 0 && this.energy >= BOOST_COST) {
        this.vel.addScaledVector(boostDir, BOOST_BURST);
        this.useEnergy(BOOST_COST);
        this.boostT = BOOST_TIME; this.boostCool = BOOST_COOL; this.boostDir = boostDir.clone(); this.impactFlash = 0.5;
        beep(160, 300, 0.1, 'sawtooth');
      }
      // A boost keeps following your hands, and keeps going while the stick stays pushed down (until the energy runs out).
      if (this.boostT > 0) {
        this.boostDir.lerp(boostDir, 1 - Math.exp(-10 * dt)).normalize();
        if (live && inp.boostHeld && this.energy > 0) { this.boostT = Math.max(this.boostT, 0.12); this.useEnergy(BOOST_HOLD_COST * dt); }
      }
      this.boosting = this.boostT > 0;
      this.orientRig(inp, dt, live, thrust);
      const speedMul = (slip ? 2 : 1) * (this.buffIs('player', 'speed') ? 1.7 : 1);
      if (!live) this.vel.multiplyScalar(Math.exp(-3 * dt));
      else if (this.easy) {
        const flow = currentAt(this.winds, this.headPos);
        if (!this.boosting && thrust.lengthSq() < 0.0025) {
          // Let go of the stick: you keep gliding and slow down gently, like coasting on ice (stops after a couple of seconds).
          this.vel.multiplyScalar(Math.exp(-1.1 * dt));
          if (flow && this.vel.z * flow < CURRENT_SPEED * 0.6) this.vel.z += flow * CURRENT_ACCEL * 0.5 * dt;
        } else {
          const target = this.boosting ? this.boostDir.clone().multiplyScalar(BOOST_MAX * 0.8) : thrust.clone().multiplyScalar(EASY_SPEED * speedMul);
          if (flow) target.z += flow * CURRENT_SPEED * 0.6;
          this.vel.lerp(target, 1 - Math.exp(-EASY_RESPONSE * dt));
        }
      } else if (this.boosting) {
        this.vel.lerp(this.boostDir.clone().multiplyScalar(BOOST_MAX * 0.9 * speedMul), 1 - Math.exp(-3 * dt));
      } else {
        this.vel.addScaledVector(thrust, THRUST * (slip ? 1.6 : 1) * dt);
        applyCurrent(this.winds, this.headPos, this.vel, dt);
        this.vel.multiplyScalar(Math.exp(-DRAG * dt));
        const max = (this.boosting ? BOOST_MAX : MAX_SPEED) * speedMul, sp = this.vel.length();
        if (sp > max) this.vel.multiplyScalar((max + (sp - max) * Math.exp(-2 * dt)) / sp);
      }
      this.thrustLevel = this.boosting || slip ? 1 : thrust.length() * 0.5;
      this.rig.position.addScaledVector(this.vel, dt);
    }
    this.accelMag = dt > 0 ? prevVel.sub(this.vel).length() / dt : 0;
    const center = this.headEl.getObject3D('camera').getWorldPosition(new T.Vector3()), before = center.clone();
    const impact = resolveSphere(center, this.vel, PLAYER_R, this.easy ? 0.2 : BOUNCE_PLAYER, this.obstacles);
    this.rig.position.add(center.sub(before));
    if (impact > 2) { this.impactFlash = Math.min(1, impact / 10); beep(120, 120, 0.1, 'triangle'); for (const h of inp.hands) pulse(h, 0.6, 60); }
    this.impactFlash = Math.max(0, this.impactFlash - dt * 2);
    this.energyIdle += dt;
    if (this.energyIdle > REGEN_DELAY) this.energy = Math.min(ENERGY_MAX, this.energy + REGEN * dt);
  },

  snapTurn(deg) { this.turnAboutHead(() => this.rig.rotateY(deg * DEG)); },

  // Turns the ride (and you with it) around your head, so the turn never slides you sideways.
  turnAboutHead(turn) {
    const cam = this.headEl.getObject3D('camera');
    this.rig.updateMatrixWorld(true);
    const before = cam.getWorldPosition(new T.Vector3());
    turn();
    this.rig.updateMatrixWorld(true);
    this.rig.position.add(before.sub(cam.getWorldPosition(new T.Vector3())));
  },

  // Steering: the average of the hands that aren't busy (holding the disc or gripping), smoothed a little.
  // With both busy it keeps the last direction. Classic flight (and the PC) steer where you look.
  updateSteer(inp, dt) {
    const d = this.disc, q = this.rig.quaternion;
    let want = null;
    if (inp.inVR && this.flight !== 'head') {
      const sum = new T.Vector3(); let n = 0;
      for (const h of inp.hands) {
        // Skip busy hands: holding the disc, gripping, or swinging fast (a punch or a throw's follow-through).
        if (h.desktop || h.grip || h.realSpeed > 1.8 || (d.holder === 'player' && d.hand === h.side)) continue;
        sum.add(h.dir); n++;
      }
      if (n && sum.length() > 0.5) {
        // Relaxed hands point a little down; a small lift makes them fly level.
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

  // Free flight: point past the comfortable range and your ride turns to follow, so pointing both hands up and boosting
  // loops you over backwards, and you can fly upside down with the arena overhead. Hands-level flight only turns left/right and
  // eases back upright. A / X (PC: L) turns you right side up again in any mode.
  orientRig(inp, dt, live, thrust) {
    const q = this.rig.quaternion, start = q.clone();
    if (inp.level && live) { this.levelT = 1.5; beep(520, 120, 0.06, 'triangle'); }
    const tilted = inp.rigUp.y < 0.9995;
    const engaged = live && (this.boosting || thrust.length() > 0.3);
    this.turnEase = (this.turnEase || 0) + ((engaged ? 1 : 0) - (this.turnEase || 0)) * (1 - Math.exp(-6 * dt));
    if (tilted && (this.levelT > 0 || this.flight !== 'free') && live) {
      // Upright again, keeping the direction you're looking.
      const hl = this.headFwd.clone().applyQuaternion(start.clone().invert()), hw = this.headFwd;
      const localYaw = Math.hypot(hl.x, hl.z) > 0.2 ? Math.atan2(-hl.x, -hl.z) : 0;
      const ref = Math.hypot(hw.x, hw.z) > 0.2 ? hw : this.vel.lengthSq() > 1 ? this.vel : new T.Vector3(0, 0, -1).applyQuaternion(start);
      const target = new T.Quaternion().setFromAxisAngle(UP, Math.atan2(-ref.x, -ref.z) - localYaw);
      // Capped turn speed (about 100°/s) so leveling out never whips you around.
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.dot(target))));
      this.turnAboutHead(() => q.rotateTowards(target, Math.min(LEVEL_MAX, ang * (this.levelT > 0 ? 3 : 2)) * dt));
    } else if (this.handSteer && this.turnEase > 0.01 && this.flight !== 'head') {
      const qi = start.clone().invert(), a = this.steerDir.clone().applyQuaternion(qi);
      const hf = this.headFwd.clone().applyQuaternion(qi); hf.y = 0;
      if (hf.lengthSq() < 0.04) hf.set(0, 0, -1); hf.normalize();
      const pitch = Math.asin(Math.max(-1, Math.min(1, a.y))), flat = new T.Vector3(a.x, 0, a.z);
      let yaw = 0;
      if (flat.lengthSq() > 1e-4) { flat.normalize(); yaw = Math.atan2(hf.z * flat.x - hf.x * flat.z, hf.dot(flat)); }
      const rate = (angle, free) => { const ex = Math.abs(angle) - free; return ex > 0 ? Math.sign(angle) * Math.min(TURN_MAX, ex * TURN_GAIN) : 0; };
      const pr = this.flight === 'free' ? rate(pitch, FREE_PITCH) : 0, yr = rate(yaw, FREE_YAW) * Math.cos(pitch), k = this.turnEase * dt;
      if (pr || yr) {
        const axis = new T.Vector3().crossVectors(hf, UP).normalize();
        this.turnAboutHead(() => q.multiply(new T.Quaternion().setFromAxisAngle(UP, yr * k)).multiply(new T.Quaternion().setFromAxisAngle(axis, pr * k)));
      }
    }
    if (this.levelT > 0) this.levelT = tilted ? Math.max(0, this.levelT - dt) : 0;
    // How fast the view is turning, for the comfort vignette.
    const turned = dt > 0 ? 2 * Math.acos(Math.min(1, Math.abs(start.dot(q)))) / dt : 0;
    this.turnRate = (this.turnRate || 0) + (turned - (this.turnRate || 0)) * (1 - Math.exp(-10 * dt));
  },

  // ---------------------------------------------------------------- the disc
  aimedAt(h, target, range, base) {
    tmp2.subVectors(target, h.aimOrigin);
    const dist = tmp2.length();
    if (dist > range) return false;
    const along = tmp2.dot(h.dir);
    if (along <= 0) return false;
    return Math.sqrt(Math.max(0, dist * dist - along * along)) < base + along * 0.08;
  },
  // Nudges a throw toward an enemy hoop if it already points close to one.
  assistDir(origin, dir, maxAngle) {
    let best = maxAngle, pick = null;
    for (const hp of this.hoops) {
      if (hp.team === 'blue') continue;
      tmp.subVectors(hp.c, origin);
      if (tmp.dot(hp.n) > 0) continue;
      const ang = dir.angleTo(tmp);
      if (ang < best) { best = ang; pick = hp; }
    }
    return pick ? new T.Vector3().subVectors(pick.c, origin).normalize() : dir.clone().normalize();
  },
  catchDisc(h, msg) {
    const d = this.disc;
    if (msg === 'STOLE IT!') this.stats.steals++;
    Object.assign(d, { holder: 'player', hand: h.side, pulledBy: null, snapping: false, tractor: null, passTo: null, lastThrower: 'player', holdT: 0, curve: 0, mega: false });
    d.vel.set(0, 0, 0);
    this.playerGrace = GRACE;
    if (!h.desktop) this.track[h.side].glove.length = 0;
    this.flash(msg);
    pulse(h, 0.7, 50); beep(880, 80, 0.1);
  },
  botTakes(b) {
    const d = this.disc;
    if (d.passTo === b && d.lastThrower === 'player') this.stats.passes++;
    Object.assign(d, { holder: b, hand: null, pulledBy: null, snapping: false, tractor: null, passTo: null, lastThrower: b, holdT: 0, curve: 0, mega: false });
    b.dunker = Math.random() < 0.4; // some possessions, the bot tries to fly it in for a dunk
    d.vel.set(0, 0, 0);
    b.grace = GRACE;
  },
  releaseDisc(v, h, curve = 0) {
    const d = this.disc;
    if (this.buffIs('player', 'mega')) { v.multiplyScalar(1.4); this.disc.mega = true; this.buffs.delete('player'); this.flash('MEGA THROW!', 1, { color: '#ff8a1f' }); }
    if (v.length() > this.discMax()) v.setLength(this.discMax());
    d.vel.copy(v);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, noCatch: 0.3, lastThrower: 'player', holdT: 0, passTo: null, bankT: -99,
                       curve: Math.max(-CURVE_MAX, Math.min(CURVE_MAX, curve)), spin: 12 + v.length() });
    pulse(h, 1, 70);
    beep(400 + v.length() * 15, 120, 0.1, 'square');
  },
  passFrom(passer, target) {
    const d = this.disc, tPos = this.posOf(target);
    const aim = tPos.clone().addScaledVector(this.velOf(target), tPos.distanceTo(d.pos) / PASS_SPEED);
    d.vel.subVectors(aim, d.pos).setLength(PASS_SPEED);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, snapping: false, tractor: null, passTo: target, passT: 2.5, lastThrower: passer, holdT: 0, curve: 0, spin: 15, bankT: -99 });
    if (passer === 'player') d.noCatch = 0.4; else passer.cool = 0.6;
    beep(620, 90, 0.08, 'triangle'); beep(820, 90, 0.08, 'triangle', 0.08);
  },
  allyInSights(h) {
    const ally = this.activeBots.find(b => b.team === 'blue');
    if (!ally) return null;
    tmp.subVectors(ally.pos, h.aimOrigin);
    return tmp.length() <= PASS_RANGE && h.dir.angleTo(tmp) < PASS_ANGLE ? ally : null;
  },
  dropDisc(holder) {
    const d = this.disc;
    Object.assign(d, { holder: null, hand: null, holdT: 0, noCatch: 0 });
    d.vel.copy(this.velOf(holder)).multiplyScalar(0.5).add(new T.Vector3(0, 1.5, 0));
    if (holder === 'player') { this.playerStun = 1; this.flash('TOO SLOW! Throw or pass sooner', 1.6); beep(150, 300, 0.12, 'sawtooth'); }
    else holder.cool = 1;
  },

  updateDisc(inp, dt, live) {
    const d = this.disc, hands = inp.hands, handOf = s => hands.find(h => h.side === s);
    this.playerStun = Math.max(0, this.playerStun - dt);
    this.playerGrace = Math.max(0, this.playerGrace - dt);
    d.noCatch = Math.max(0, d.noCatch - dt); d.hitCool = Math.max(0, d.hitCool - dt);
    if (d.passTo) { d.passT -= dt; if (d.passT <= 0) d.passTo = null; }
    if (d.away > 0) { d.away -= dt; if (d.away <= 0) this.respawnNearPlayer(); this.beams.pull.visible = false; return; }
    let pullBeam = null;
    const mitt = this.mittOn('player') || this.buffIs('player', 'magnet'), grabR = GRAB_R * (mitt ? 3 : 1), snapR = SNAP_R * (mitt ? 2.2 : 1);
    const holdLimit = this.mode.core ? 10 : HOLD_LIMIT;
    if (live && d.holder) {
      const before = Math.floor(d.holdT);
      d.holdT += dt;
      if (d.holder === 'player' && d.holdT > holdLimit - 3 && Math.floor(d.holdT) !== before) { beep(1000, 60, 0.08); for (const h of hands) pulse(h, 0.4, 40); }
      if (d.holdT > holdLimit) this.dropDisc(d.holder);
    }
    if (live) {
      if (d.holder === 'player') {
        const h = handOf(d.hand);
        if (!h) d.holder = null;
        else if (inp.pass || (h.triggerPressed && this.allyInSights(h))) {
          const ally = this.activeBots.find(b => b.team === 'blue');
          if (ally) { this.passFrom('player', ally); this.flash('PASS!', 0.8); }
        } else if (this.easy || h.desktop) {
          if (h.triggerPressed || h.throwPressed) this.releaseDisc(this.assistDir(h.aimOrigin, h.dir, EASY_ASSIST).multiplyScalar(EASY_THROW).add(this.vel), h, h.curveKeys * 8);
          else { d.pos.copy(h.glove); d.quat.copy(h.quat); }
        } else if (!h.grip) {
          const rel = h.gloveVel.clone().sub(this.vel);
          if (h.realSpeed < 1.0) this.releaseDisc(this.vel.clone().add(rel), h);
          else this.releaseDisc(this.assistDir(h.glove, rel, THROW_ASSIST).multiplyScalar(rel.length() * THROW_GAIN).add(this.vel), h, -h.spinY * CURVE_K);
          if (h.realSpeed < WEAK_THROW) this.weakThrows++; else if (h.realSpeed > STRONG_SWING) this.weakThrows = 0;
        } else { d.pos.copy(h.glove); d.quat.copy(h.quat); }
      } else if (d.holder) {
        const bot = d.holder;
        for (const h of hands) {
          if (d.holder !== bot || this.playerStun > 0) break;
          const grabbing = h.grip || ((this.easy || h.desktop) && h.trigger);
          const near = h.glove.distanceTo(bot.pos) < STEAL_R || this.headPos.distanceTo(bot.pos) < STEAL_R;
          if (!grabbing || !near) continue;
          if (bot.team === 'blue') this.catchDisc(h, 'HANDOFF');
          else if (bot.grace > 0) continue;
          else if (this.buffIs(bot, 'shield')) { if (!this.behindWarnT || this.time > this.behindWarnT) { this.flash('SHIELDED! Wait it out or tackle later.', 1.4); this.behindWarnT = this.time + 1.5; } }
          else if (this.fromFrontOrSide(bot, h.glove)) { bot.stun = 1.5; this.catchDisc(h, 'STOLE IT!'); }
          else if (!this.behindWarnT || this.time > this.behindWarnT) { this.flash('Not from behind! Cut in front.'); this.behindWarnT = this.time + 1.5; }
        }
      }
      // Passes aimed at you snap into your hand without needing to grip.
      if (d.holder === null && d.passTo === 'player' && this.playerStun === 0) {
        for (const h of hands) if (h.glove.distanceTo(d.pos) < SNAP_R * 1.3 || this.headPos.distanceTo(d.pos) < 2.2) { this.catchDisc(h, 'CAUGHT THE PASS'); break; }
      }
      if (d.holder === null) for (const h of hands) {
        if (d.holder !== null || this.playerStun > 0 || d.noCatch > 0) break;
        const dist = h.glove.distanceTo(d.pos);
        if (h.grip && dist < grabR + DISC_R) this.catchDisc(h, 'GOT IT');
        else if (h.grip && dist < snapR && !this.anchors[h.side]) { d.pulledBy = h.side; d.snapping = true; }
      }
      if (d.holder === null) {
        for (const h of hands) {
          if (this.easy || h.desktop) {
            if (h.trigger && !d.pulledBy && this.playerStun === 0 && d.noCatch === 0 && this.aimedAt(h, d.pos, EASY_PULL_RANGE, 1.2 * (mitt ? 2 : 1))) { d.pulledBy = h.side; d.snapping = false; pulse(h, 0.3, 40); beep(440, 80, 0.06); }
          } else if (h.triggerPressed && this.energy >= PUSH_COST && this.aimedAt(h, d.pos, PUSH_RANGE, 1.5)) {
            d.vel.addScaledVector(h.dir, PUSH_POWER); d.pulledBy = null; d.lastThrower = 'player'; d.bankT = -99;
            this.useEnergy(PUSH_COST); pulse(h, 0.8, 60); beep(300, 120, 0.1, 'sawtooth');
          }
        }
        if (d.pulledBy) {
          const h = handOf(d.pulledBy);
          if (!h || !(d.snapping ? h.grip : h.trigger)) { d.pulledBy = null; d.snapping = false; }
          else {
            tmp.subVectors(h.glove, d.pos);
            const dist = tmp.length();
            d.vel.lerp(tmp.multiplyScalar((d.snapping ? SNAP_SPEED : PULL_SPEED) / Math.max(dist, 0.01)), 1 - Math.exp(-(d.snapping ? 20 : 8) * dt));
            pullBeam = h;
            if (dist < grabR + DISC_R) this.catchDisc(h, 'GOT IT');
          }
        }
        // MAGNET power-up: a loose disc within 12 m flies to your nearest hand.
        if (d.holder === null && this.buffIs('player', 'magnet') && d.noCatch === 0 && this.playerStun === 0 && hands.length) {
          const h = hands.reduce((a, b) => a.glove.distanceTo(d.pos) < b.glove.distanceTo(d.pos) ? a : b), dist = h.glove.distanceTo(d.pos);
          if (dist < 12) {
            d.vel.lerp(tmp.subVectors(h.glove, d.pos).setLength(PULL_SPEED * 1.4), 1 - Math.exp(-6 * dt));
            if (dist < grabR + DISC_R + 0.3) this.catchDisc(h, 'MAGNET!');
          }
        }
        if (d.holder === null && d.tractor) this.updateTractor(dt, hands);
      }
      if (d.holder === null) this.flyDisc(dt);
    }
    if (d.holder && d.holder !== 'player') { d.pos.copy(d.holder.pos).addScaledVector(d.holder.facing, 1.1); d.quat.identity(); }
    if (live && d.holder) this.checkDunk(); else this.dunkPrev = null;
    if (pullBeam && d.holder === null) this.setBeam(this.beams.pull, pullBeam.glove, d.pos);
    else if (d.tractor && d.holder === null) this.setBeam(this.beams.pull, d.tractor === 'player' ? this.headPos.clone().add(new T.Vector3(0, -0.5, 0)) : d.tractor.pos, d.pos);
    else this.beams.pull.visible = false;
  },

  // Dunk: carry the disc through a rival hoop yourself (hand or body) instead of throwing it.
  checkDunk() {
    const d = this.disc, holder = d.holder, prev = this.dunkPrev;
    this.dunkPrev = { holder, pos: d.pos.clone() };
    if (!prev || prev.holder !== holder || prev.pos.distanceTo(d.pos) > 6) return;
    const team = this.teamOf(holder);
    for (const h of this.hoops) {
      if (h.team === team) continue;
      const d0 = tmp.subVectors(prev.pos, h.c).dot(h.n), d1 = tmp.subVectors(d.pos, h.c).dot(h.n);
      if (!(d0 > 0 && d1 <= 0)) continue;
      tmp.lerpVectors(prev.pos, d.pos, d0 / (d0 - d1));
      if (tmp.distanceTo(h.c) > h.size + 0.25) continue;
      d.lastThrower = holder; this.dunkPrev = null;
      return this.goal(h, true);
    }
  },

  updateTractor(dt, hands) {
    const d = this.disc, user = d.tractor;
    if ((d.tractorT -= dt) <= 0) { d.tractor = null; return; }
    const hand = user === 'player' ? (hands.find(h => h.side === 'right') || hands[0]) : null;
    const target = user === 'player' ? (hand ? hand.glove : this.headPos) : user.pos;
    tmp.subVectors(target, d.pos);
    const dist = tmp.length();
    d.vel.lerp(tmp.multiplyScalar(TRACTOR_SPEED / Math.max(dist, 0.01)), 1 - Math.exp(-10 * dt));
    if (dist < (user === 'player' ? GRAB_R + DISC_R + 0.4 : BOT_CATCH_R + DISC_R)) {
      if (user === 'player') { if (hand) this.catchDisc(hand, 'BEAMED IN'); else d.tractor = null; } else this.botTakes(user);
    }
  },

  discMax() { return DISC_MAX * (this.surgeIs('turbo') ? 1.35 : 1) * (this.disc.mega ? 1.4 : 1); },
  flyDisc(dt) {
    const d = this.disc, hit = {}, turbo = this.surgeIs('turbo');
    d.vel.multiplyScalar(Math.exp(-DISC_DRAG * (turbo ? 0.4 : 1) * dt));
    applyCurrent(this.winds, d.pos, d.vel, dt);
    if (Math.abs(d.curve) > 0.1 && d.vel.lengthSq() > 4) {
      const side = tmp3.crossVectors(d.vel, UP);
      if (side.lengthSq() > 1e-6) d.vel.addScaledVector(side.normalize(), d.curve * dt);
      d.curve *= Math.exp(-CURVE_DECAY * dt);
    }
    const max = this.discMax();
    if (d.vel.length() > max) d.vel.setLength(max);
    const steps = 3, sdt = dt / steps, prev = new T.Vector3();
    for (let i = 0; i < steps; i++) {
      prev.copy(d.pos);
      d.pos.addScaledVector(d.vel, sdt);
      for (const h of this.hoops) {
        const d0 = tmp.subVectors(prev, h.c).dot(h.n), d1 = tmp.subVectors(d.pos, h.c).dot(h.n);
        if (d0 > 0 && d1 <= 0) { tmp.lerpVectors(prev, d.pos, d0 / (d0 - d1)); if (tmp.distanceTo(h.c) < h.size - DISC_R * 0.5) return this.goal(h); }
      }
      if ((this.realm.id === 'gym' || d.mega) && this.checkDodgeballHit()) break;
      this.hazard.disc(d, sdt, this, prev);
      hit.obstacle = null;
      const impact = resolveSphere(d.pos, d.vel, DISC_R, turbo ? 0.95 : BOUNCE_DISC, this.obstacles, hit);
      if (hit.obstacle && hit.obstacle.tag === 'prism') { d.bankT = this.time; beepAt(1200, 90, 0.08, 'triangle', d.pos); }
      if (hit.obstacle && impact > 2) { const rock = this.rocks.find(r => r.ob === hit.obstacle); if (rock && rock.squash) rock.squashT = 1; }
      if (impact > 3 && this.pingT <= 0) {
        beepAt(700 + Math.min(impact, 30) * 20, 60, 0.05, 'sine', d.pos); this.pingT = 0.08;
        this.discHitFeedback(impact, d.pos);
      }
    }
    d.spin *= Math.exp(-0.3 * dt);
  },

  // Vibration that tells you where the disc is when it hits something: the controller on that side buzzes harder,
  // and a double buzz means it's behind you. A matching sound plays from the spot, too.
  discHitFeedback(impact, pos) {
    if (!this.inVR || !this.hands || this.time < this.hitBuzzAt || this.disc.holder === 'player') return;
    const to = tmp3.subVectors(pos, this.headPos), dist = to.length();
    if (dist < 1) return;
    to.divideScalar(dist);
    const right = new T.Vector3().crossVectors(this.headFwd, UP.clone().applyQuaternion(this.rig.quaternion));
    if (right.lengthSq() < 1e-4) return;
    right.normalize();
    this.hitBuzzAt = this.time + 0.15;
    const side = to.dot(right), behind = to.dot(this.headFwd) < -0.3;
    const strength = Math.min(1, 0.35 + impact / 30) * Math.max(0.45, 1 - dist / 110);
    const amt = s => strength * Math.max(0.06, Math.min(1, (1 + s * side) * 0.75));
    const buzz = () => { for (const h of this.hands) if (!h.desktop) pulse(h, amt(h.side === 'left' ? -1 : 1), 45); };
    buzz();
    if (behind) setTimeout(buzz, 130);
  },

  // Sounds and buzzes for realm hazards (sound plays from where it happens).
  hazardPing(pos, kind) {
    if (kind === 'sling') { noiseAt(600, 0.12, pos, [300, 2400]); beepAt(160, 500, 0.08, 'sawtooth', pos); this.discHitFeedback(14, pos); }
    else if (kind === 'hiss') noiseAt(1000, 0.06, pos, [3000, 5000], 1.5);
    else if (kind === 'blast') { noiseAt(1600, 0.16, pos, [500, 1800], 0.6); beepAt(70, 600, 0.1, 'sawtooth', pos); }
    else if (kind === 'portal') { beepAt(520, 260, 0.08, 'sine', pos); beepAt(780, 260, 0.06, 'sine', pos, 0.08); this.discHitFeedback(12, pos); }
    else if (kind === 'boing') { const now = this.time; if ((this.boingAt || 0) > now) return; this.boingAt = now + 0.2; beepAt(220, 300, 0.1, 'triangle', pos); beepAt(440, 200, 0.06, 'triangle', pos, 0.05); this.discHitFeedback(10, pos); }
  },

  // Dream Gym: a fast ball thrown by one team stuns the first rival it touches, unless their Catch Mitt is on.
  checkDodgeballHit() {
    const d = this.disc;
    if (!d.lastThrower || d.hitCool > 0 || d.passTo || d.vel.length() < HIT_SPEED) return false;
    const throwerTeam = this.teamOf(d.lastThrower);
    for (const target of this.agents()) {
      if (this.teamOf(target) === throwerTeam || this.mittOn(target) || this.buffIs(target, 'shield')) continue;
      const tp = this.posOf(target);
      if (tp.distanceTo(d.pos) > (target === 'player' ? 1.0 : BOT_R + DISC_R + 0.2)) continue;
      reflect(d.vel, tmp3.subVectors(d.pos, tp).normalize(), 0.5);
      d.hitCool = 0.4;
      if (target === 'player') { this.playerStun = HIT_STUN; this.flash('YOU GOT HIT!', 1.2); for (const h of this.hands) pulse(h, 1, 250); }
      else { target.stun = HIT_STUN; if (d.lastThrower === 'player') { this.flash('HIT!', 1); this.stats.hits++; } }
      beep(140, 160, 0.14, 'square');
      return true;
    }
    return false;
  },

  // Points multiplier from surges: Double Points and the Final Surge (last 30 seconds) stack.
  pointsMul() { return (this.surgeIs('double') ? 2 : 1) * (this.finalSurgeOn ? 2 : 1); },
  goal(h, dunk = false) {
    const d = this.disc;
    if (!d.lastThrower) return;
    const team = OTHER[h.team], trick = !dunk && this.time - d.bankT < TRICK_WINDOW, golden = this.surgeIs('golden') && h.idx === this.surge.hoop;
    const fire = this.onFire === team;
    const pts = (h.pts * (trick ? 2 : 1) + (golden ? 3 : 0) + (dunk ? DUNK_BONUS : 0) + (fire ? FIRE_BONUS : 0)) * this.pointsMul();
    this.scoreShowT = 4;
    h.flash = 1;
    this.startBurst(h.c, dunk ? '#ffffff' : trick ? '#d9c3ff' : TEAM_COLOR[team]);
    d.vel.set(0, 0, 0);
    Object.assign(d, { holder: null, hand: null, pulledBy: null, tractor: null, passTo: null, bankT: -99, mega: false });
    this.score[team] += pts;
    if (d.lastThrower === 'player') { this.stats.goals++; if (trick) this.stats.tricks++; if (dunk) this.stats.dunks = (this.stats.dunks || 0) + 1; }
    this.scoreStreak(team);
    const who = d.lastThrower === 'player' ? 'YOU' : team === 'blue' ? 'YOUR ALLY' : 'ORANGE';
    const how = dunk ? 'SLAM DUNK! ' : trick ? 'TRICK SHOT! ' : '';
    this.flash(`${how}${golden ? 'GOLDEN! ' : ''}${fire ? 'ON FIRE! ' : ''}${who} SCORED +${pts}${team === 'blue' ? '!' : ''}`, 2.2, { big: true, color: team === 'blue' ? '#8fc2ff' : '#ffb183' });
    if (dunk) { beepAt(90, 500, 0.2, 'square', h.c); noiseAt(500, 0.15, h.c, [2000, 300]); }
    if (team === 'blue') { beep(660, 120, 0.12); beep(880, 120, 0.12, 'sine', 0.1); beep(1320, 260, 0.12, 'sine', 0.2); if (trick || dunk) beep(1760, 400, 0.1, 'sine', 0.35); for (const hand of this.hands) pulse(hand, 1, dunk ? 300 : 150); }
    else { beep(300, 200, 0.12, 'sawtooth'); beep(200, 300, 0.12, 'sawtooth', 0.2); }
    if (this.activeBots.length) { this.state = 'scored'; this.stateT = 1.5; }
    else d.away = 1; // practice: the disc comes back right in front of you
  },

  respawnNearPlayer() {
    const d = this.disc;
    d.pos.copy(this.headPos).addScaledVector(this.headFwd, 3).add(new T.Vector3(0, -0.5, 0));
    resolveSphere(d.pos, d.vel.set(0, 0, 0), DISC_R, 0, this.obstacles);
    Object.assign(d, { away: 0, lastThrower: null, noCatch: 0 });
  },

  // King of the Core: the team holding the disc inside the core scores every second.
  updateCore(dt) {
    if (!this.mode.core) return;
    const d = this.disc;
    const inside = d.holder && this.posOf(d.holder).distanceTo(this.core.position) < CORE_R;
    this.core.children[0].material.opacity = inside ? 0.18 : 0.08;
    if (!inside) { this.coreT = 0; return; }
    this.coreT += dt;
    if (this.coreT < CORE_TICK) return;
    this.coreT -= CORE_TICK;
    const team = this.teamOf(d.holder);
    this.score[team] += this.pointsMul();
    beep(team === 'blue' ? 990 : 330, 70, 0.07);
    if (this.score[team] >= this.mode.target) { this.timeLeft = 0; this.endMatch(); }
  },

  // ---------------------------------------------------------------- snitch
  updateSnitch(inp, dt, live) {
    const s = this.snitch, times = this.mode.snitch;
    if (!live) return;
    const elapsed = this.mode.time - this.timeLeft;
    if (!s.active) {
      if (s.spawned < times.length && elapsed >= times[s.spawned]) {
        s.active = true; s.spawned++;
        s.pos.set(0, 22, 0); s.vel.set(0, 0, 0); s.retarget = 0;
        this.flash(`THE SNITCH IS OUT! +${SNITCH_POINTS}`, 2.5);
        beep(1200, 80, 0.08); beep(1500, 80, 0.08, 'sine', 0.1); beep(1800, 120, 0.08, 'sine', 0.2);
      }
      return;
    }
    if ((s.retarget -= dt) <= 0) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (ARENA_R - 6);
      s.target.set(r * Math.cos(a), Y_MIN + 3 + Math.random() * (Y_MAX - Y_MIN - 6), r * Math.sin(a));
      s.retarget = 0.6 + Math.random() * 0.8;
    }
    const desired = tmp.subVectors(s.target, s.pos);
    let nearest = null, nd = Infinity;
    for (const a of this.agents()) { const dd = this.posOf(a).distanceTo(s.pos); if (dd < nd) { nd = dd; nearest = a; } }
    if (nearest && nd < 10) desired.add(tmp2.subVectors(s.pos, this.posOf(nearest)).normalize().multiplyScalar(20));
    desired.setLength(SNITCH_SPEED);
    s.vel.lerp(desired, 1 - Math.exp(-3 * dt));
    s.pos.addScaledVector(s.vel, dt);
    resolveSphere(s.pos, s.vel, SNITCH_R, 0.9, this.obstacles);
    const mitt = this.mittOn('player');
    for (const h of inp.hands) {
      const got = (this.easy || h.desktop) ? (h.trigger && this.aimedAt(h, s.pos, 6, 0.8)) : (h.grip && h.glove.distanceTo(s.pos) < SNAP_R * (mitt ? 1.6 : 0.7));
      if (got) return this.catchSnitch('blue', h, true);
    }
    for (const b of this.activeBots) if (b.stun === 0 && b.pos.distanceTo(s.pos) < (BOT_CATCH_R + SNITCH_R) * (this.mittOn(b) ? 2.5 : 1)) return this.catchSnitch(b.team, null, false);
  },
  catchSnitch(team, h, byPlayer) {
    this.startBurst(this.snitch.pos, '#ffd23d');
    this.snitch.active = false;
    this.score[team] += SNITCH_POINTS * this.pointsMul();
    this.scoreShowT = 4;
    if (byPlayer) this.stats.snitch++;
    if (team === 'blue') { this.flash(`${byPlayer ? 'YOU' : 'YOUR ALLY'} CAUGHT THE SNITCH! +${SNITCH_POINTS}`, 2.5); pulse(h, 1, 250); beep(880, 100, 0.12); beep(1320, 100, 0.12, 'sine', 0.1); beep(1760, 300, 0.12, 'sine', 0.2); }
    else { this.flash(`ORANGE CAUGHT THE SNITCH +${SNITCH_POINTS}`, 2.5); beep(300, 300, 0.12, 'sawtooth'); }
  },

  // ---------------------------------------------------------------- bots
  passTarget(b) {
    const goal = this.objective(b.team);
    let pick = null, bestGain = 6;
    for (const m of this.agents()) {
      if (m === b || this.teamOf(m) !== b.team) continue;
      const mp = this.posOf(m);
      if (mp.distanceTo(b.pos) > PASS_RANGE) continue;
      const gain = b.pos.distanceTo(goal) - mp.distanceTo(goal);
      const open = !this.agents().some(e => this.teamOf(e) !== b.team && this.posOf(e).distanceTo(mp) < 5);
      if (open && gain > bestGain) { bestGain = gain; pick = m; }
    }
    return pick;
  },

  botPowerAI(b, chaser) {
    if (b.power.cool > 0 || b.stun > 0 || Math.random() > this.level.power) return;
    const d = this.disc, p = this.realm.power;
    const enemyCarrier = d.holder && this.teamOf(d.holder) !== b.team ? d.holder : null;
    const near = enemyCarrier && this.posOf(enemyCarrier).distanceTo(b.pos);
    if (p === 'tractor') { const dist = b.pos.distanceTo(d.pos); if (d.holder === null && chaser === b && dist > 8 && dist < TRACTOR_RANGE && d.vel.length() <= TRACTOR_MAX_DISC_SPEED) this.usePower(b); }
    else if (p === 'shockwave') { if (enemyCarrier && near < SHOCK_R - 1 && this.fromFrontOrSide(enemyCarrier, b.pos)) this.usePower(b); }
    else if (p === 'gust') { if (enemyCarrier && near < GUST_RANGE - 2 && tmp3.subVectors(this.posOf(enemyCarrier), b.pos).normalize().dot(b.facing) > 0.9) this.usePower(b); }
    else if (p === 'slipstream') { if (d.holder === b || (enemyCarrier && near > 10)) this.usePower(b); }
    else if (p === 'mitt') { if (d.holder === null && b.pos.distanceTo(d.pos) < 7) this.usePower(b); }
  },

  updateBots(dt, live) {
    const d = this.disc, s = this.snitch, bots = this.activeBots;
    if (!live) { for (const b of bots) b.vel.multiplyScalar(Math.exp(-3 * dt)); return; }
    const botSpeed = BOT_SPEED * this.level.speed * (this.easy ? 0.85 : 1), core = this.mode.core;
    const chaser = {};
    if (d.holder === null && d.away <= 0) for (const team of ['blue', 'orange']) {
      let best = Infinity, pick = null;
      for (const b of bots) { if (b.team !== team || b.stun > 0 || (s.active && b.seeker)) continue; const dist = b.pos.distanceTo(d.pos); if (dist < best) { best = dist; pick = b; } }
      const pd = this.headPos.distanceTo(d.pos);
      if (team === 'blue' && pick && pd < best && pd < 10) pick = null;
      chaser[team] = pick;
    }
    for (const b of bots) {
      b.stun = Math.max(0, b.stun - dt); b.cool = Math.max(0, b.cool - dt); b.grace = Math.max(0, b.grace - dt);
      this.botPowerAI(b, chaser[b.team]);
      // Read the holder after powers run: an earlier bot or this bot's power may have changed it this frame.
      const holderTeam = d.holder ? this.teamOf(d.holder) : null;
      let goal;
      if (d.holder === b) goal = core ? this.core.position.clone().add(new T.Vector3(b.lane * 2, 0, 0)) : this.botAttack(b);
      else if (s.active && b.seeker) goal = s.pos.clone().addScaledVector(s.vel, 0.4);
      else if (d.passTo === b) goal = d.pos.clone();
      else if (holderTeam === b.team) goal = core ? this.core.position.clone().add(new T.Vector3(b.lane * 8, 3, 0)) : this.posOf(d.holder).clone().add(new T.Vector3(b.lane * 10, 2, Math.sign(-OWN_Z[b.team]) * 12));
      else if (holderTeam) {
        // Steals only work from the front, so get between the carrier and what they're heading for.
        const cp = this.posOf(d.holder), to = (core ? this.core.position.clone() : new T.Vector3(0, 16, OWN_Z[b.team])).sub(cp);
        goal = cp.clone().addScaledVector(to.normalize(), Math.min(6, to.length() * 0.5));
      } else if (chaser[b.team] === b) goal = d.pos.clone().addScaledVector(d.vel, Math.min(1, b.pos.distanceTo(d.pos) / botSpeed));
      else goal = core ? this.core.position.clone().add(new T.Vector3(0, 0, OWN_Z[b.team] * 0.15)) : new T.Vector3(Math.max(-14, Math.min(14, d.pos.x)), 16, OWN_Z[b.team] - Math.sign(OWN_Z[b.team]) * 9);
      if (!goal) continue;

      const speed = b.stun > 0 ? 0 : botSpeed * (this.slipOn(b) ? 1.8 : 1) * (this.buffIs(b, 'speed') ? 1.6 : 1);
      tmp.subVectors(goal, b.pos);
      const dist = tmp.length();
      const desired = dist > 0.01 ? tmp.multiplyScalar(Math.min(speed, dist * 2) / dist) : tmp.set(0, 0, 0);
      const steer = desired.sub(b.vel);
      if (steer.length() > BOT_ACCEL * this.level.accel * dt) steer.setLength(BOT_ACCEL * this.level.accel * dt);
      b.vel.add(steer);
      applyCurrent(this.winds, b.pos, b.vel, dt);
      b.pos.addScaledVector(b.vel, dt);
      if (resolveSphere(b.pos, b.vel, BOT_R, BOUNCE_BOT, this.obstacles) > 0.5) b.vel.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6));
      if (b.vel.lengthSq() > 0.25) b.facing.copy(b.vel).normalize();

      const catchR = (d.passTo === b ? BOT_CATCH_R + 1 : BOT_CATCH_R) * (this.mittOn(b) || this.buffIs(b, 'magnet') ? 2.5 : 1);
      if (d.holder === null && d.away <= 0 && b.cool === 0 && b.stun === 0 && b.pos.distanceTo(d.pos) < catchR + DISC_R) { this.botTakes(b); beep(330, 100, 0.08); }
      else if (d.holder && d.holder !== b && this.teamOf(d.holder) !== b.team && b.stun === 0) {
        const graceOk = d.holder === 'player' ? this.playerGrace === 0 : !(d.holder.grace > 0);
        if (graceOk && !this.buffIs(d.holder, 'shield') && b.pos.distanceTo(this.posOf(d.holder)) < STEAL_R * this.level.steal && this.fromFrontOrSide(d.holder, b.pos)) {
          const victim = d.holder;
          this.botTakes(b);
          if (victim === 'player') { this.playerStun = 1; this.flash('STOLEN!'); for (const h of this.hands) pulse(h, 1, 200); } else victim.stun = 1.5;
          beep(180, 250, 0.12, 'sawtooth');
        }
      }
    }
  },

  // A carrying bot heads for the best rival hoop (a prism's launch ring on Prism Court), swerves around rivals, then shoots or passes.
  botAttack(b) {
    const d = this.disc;
    let pick = null, bestScore = Infinity;
    for (const hp of this.hoops) { if (hp.team === b.team) continue; const sc = hp.c.distanceTo(b.pos) - hp.pts * 4; if (sc < bestScore) { bestScore = sc; pick = hp; } }
    if (!pick) return b.pos.clone();
    const prism = this.prisms.find(p => Math.sign(p.hoopC.z) === Math.sign(pick.c.z) && p.L.distanceTo(b.pos) < 30);
    const front = pick.c.clone().addScaledVector(pick.n, 11), goal = (prism && b.pos.distanceTo(prism.L) > 3 ? prism.L : front).clone();
    for (const e of this.agents()) {
      if (this.teamOf(e) === b.team) continue;
      const toE = tmp2.subVectors(this.posOf(e), b.pos), dist = toE.length();
      if (dist > 8 || dist < 1e-3 || b.facing.dot(toE.normalize()) < 0.3) continue;
      const side = tmp3.crossVectors(b.facing, UP).normalize();
      goal.addScaledVector(side, side.dot(toE) > 0 ? -8 : 8).add(new T.Vector3(0, toE.y > 0 ? -3 : 3, 0));
      break;
    }
    const toHoop = tmp.subVectors(pick.c, b.pos);
    const lined = toHoop.length() < BOT_SHOOT && toHoop.dot(pick.n) < -0.75 * toHoop.length();
    const pressured = this.agents().some(e => this.teamOf(e) !== b.team && this.posOf(e).distanceTo(b.pos) < 6);
    const mate = (pressured || d.holdT > 4) ? this.passTarget(b) : null;
    // Dunk run: some possessions the bot flies straight through the hoop instead of shooting.
    if (b.dunker && !pressured && d.holdT < 6.5 && toHoop.length() < 22 && toHoop.dot(pick.n) < -0.6 * toHoop.length()) return pick.c.clone().addScaledVector(pick.n, -5);
    if (prism && b.pos.distanceTo(prism.L) < 3) this.botShoot(b, prism.P, 0.6);
    else if (b.pos.distanceTo(front) < 3.5 || lined || (d.holdT > 6.5 && toHoop.dot(pick.n) < 0)) this.botShoot(b, pick.c, pick.size * 1.3);
    else if (mate) this.passFrom(b, mate);
    return goal;
  },

  botShoot(b, target, spread) {
    const d = this.disc;
    const aim = target.clone().add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * this.level.aim));
    d.vel.copy(aim.sub(d.pos)).setLength(BOT_THROW * (this.buffIs(b, 'mega') ? 1.4 : 1));
    if (this.buffIs(b, 'mega')) { d.mega = true; this.buffs.delete(b); }
    Object.assign(d, { holder: null, lastThrower: b, spin: 20, noCatch: 0, holdT: 0, passTo: null, curve: 0, bankT: -99 });
    b.cool = 0.8;
    beep(260, 120, 0.08, 'square');
  },

  // Riders bump off each other instead of passing through.
  bumpBodies() {
    const bodies = [{ who: 'player', pos: this.headPos, vel: this.vel, r: 0.7 }, ...this.activeBots.map(b => ({ who: b, pos: b.pos, vel: b.vel, r: BOT_R }))];
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], n = tmp3.subVectors(a.pos, b.pos), dist = n.length(), min = a.r + b.r;
      if (dist < min + 0.8 && dist > 1e-4) this.tryTackle(a, b, n.clone().divideScalar(dist));
      if (dist >= min || dist < 1e-4) continue;
      n.divideScalar(dist);
      const push = (min - dist) / 2;
      for (const [body, sign] of [[a, 1], [b, -1]]) { if (body.who === 'player') this.rig.position.addScaledVector(n, push * sign); else body.pos.addScaledVector(n, push * sign); }
      const closing = tmp2.subVectors(a.vel, b.vel).dot(n);
      if (closing < 0) {
        a.vel.addScaledVector(n, -closing * 0.7); b.vel.addScaledVector(n, closing * 0.7);
        if ((a.who === 'player' || b.who === 'player') && -closing > 3) { beep(110, 90, 0.08, 'triangle'); for (const h of this.hands) pulse(h, 0.5, 50); }
      }
    }
  },

  // Tackle: slam into a rival carrying the disc fast enough (a boost does it) and the disc flies loose, from any side.
  tryTackle(a, b, n) {
    const d = this.disc, closing = -tmp2.subVectors(a.vel, b.vel).dot(n);
    if (closing < TACKLE_SPEED || !d.holder) return;
    const [carrier, hitter] = d.holder === a.who ? [a, b] : d.holder === b.who ? [b, a] : [null, null];
    if (!carrier || this.teamOf(carrier.who) === this.teamOf(hitter.who) || this.buffIs(carrier.who, 'shield')) return;
    if (hitter.who !== 'player' && hitter.who.cool > 0) return;
    Object.assign(d, { holder: null, hand: null, holdT: 0, noCatch: 0.35, lastThrower: hitter.who, passTo: null });
    d.vel.copy(hitter.vel).multiplyScalar(0.6).add(new T.Vector3((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 6));
    if (carrier.who === 'player') { this.playerStun = 1; this.flash('TACKLED!', 1.2, { color: '#ffb183' }); for (const h of this.hands) pulse(h, 1, 220); }
    else { carrier.who.stun = 1.3; carrier.who.cool = 1; }
    if (hitter.who === 'player') { this.flash('TACKLE!', 1.2, { big: true, color: '#66ffff' }); this.stats.steals++; for (const h of this.hands) pulse(h, 0.9, 160); }
    else hitter.who.cool = 2;
    this.startBurst(d.pos, '#ffffff');
    beepAt(90, 300, 0.18, 'square', d.pos); noiseAt(300, 0.12, d.pos, [1500, 200]);
  },

  // Rider goes through a portal (Moon Castle): move the whole rig, with a quick violet flash.
  teleportPlayer(offset) {
    this.rig.position.add(offset); this.headPos.add(offset);
    this.portalFlash = 1;
    for (const h of this.hands || []) pulse(h, 0.6, 120);
  },

  // ---------------------------------------------------------------- coaching, sound, online
  tip(id) {
    if (this.save.tips.includes(id) || this.msgT > 0 || this.tipGap > 0) return;
    this.save.tips.push(id); writeSave(this.save);
    const text = TIPS[id][this.inVR ? 0 : 1];
    const hint = this.inVR ? TIP_HINTS[id.startsWith('power-') ? 'power' : id] : null;
    if (text) { this.flash(text, 4, { hint }); this.tipGap = 4.5; }
  },
  coach(inp, dt) {
    this.tipGap = Math.max(0, this.tipGap - dt);
    const d = this.disc, playing = this.mode.time - this.timeLeft;
    if (playing > 6) this.tip('pause');
    if (d.holder === 'player' && this.hoops.some(h => h.team === 'orange' && h.c.distanceTo(this.headPos) < 25)) this.tip('dunk');
    if (this.orbs.some(o => o.pos.distanceTo(this.headPos) < 30)) this.tip('orb');
    if (this.mode.core) this.tip('core');
    if (this.prisms.length) this.tip('prism');
    if (playing > 2 && this.flight !== 'head') this.tip('steer');
    if (playing > 3) this.tip('boost2');
    if (playing > 14 && this.flight === 'free') this.tip('flip');
    if (d.holder === null && d.pos.distanceTo(this.headPos) < 6) this.tip('grab');
    if (d.holder === 'player') {
      this.tip(this.easy && this.inVR ? 'easyThrow' : 'throw');
      const ally = this.activeBots.find(b => b.team === 'blue');
      if (ally && ally.pos.distanceTo(this.headPos) < 30) this.tip('pass');
      if (d.holdT > 4) this.tip('clock');
    }
    if (d.holder && d.holder !== 'player' && d.holder.team === 'orange' && d.holder.pos.distanceTo(this.headPos) < 12) this.tip('steal');
    if (this.inVR && inp.hands.some(x => this.pockets.some(p => p.c.distanceTo(x.glove) < 3))) this.tip('pocket');
    if (currentAt(this.winds, this.headPos)) this.tip('wind');
    if (playing > 10 && this.power.cool === 0) {
      const id = 'power-' + this.realm.id;
      TIPS[id] = TIPS[id] || [`Press B: ${this.realm.powerName}. ${this.realm.powerHint}.`, `Press C: ${this.realm.powerName}. ${this.realm.powerHint}.`];
      this.tip(id);
    }
  },

  // A soft wind rush that rises with your speed (smoothed here; scheduling ramps every frame would pile up and stutter).
  updateRush() {
    if (!audioCtx) return;
    if (!this.rush) {
      const len = audioCtx.sampleRate, buf = audioCtx.createBuffer(1, len, len), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
      src.buffer = buf; src.loop = true; filter.type = 'bandpass'; filter.Q.value = 0.7; gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(audioCtx.destination); src.start();
      this.rush = { gain, filter };
    }
    const sp = this.paused || this.state !== 'playing' ? 0 : this.vel.length();
    this.rushSpeed = (this.rushSpeed || 0) + (sp - (this.rushSpeed || 0)) * 0.08;
    this.rush.gain.gain.value = Math.min(0.06, this.rushSpeed / 26 * 0.06);
    this.rush.filter.frequency.value = 350 + this.rushSpeed * 45;
  },

  // Online presence: send your rider and show other players as ghost riders (full shared matches come next).
  updateNet(inp) {
    if (!this.net.match) { if (this.ghosts.size) { for (const g of this.ghosts.values()) g.el.parentNode.removeChild(g.el); this.ghosts.clear(); } return; }
    const hands = inp.hands.filter(h => !h.desktop);
    this.net.sendPose(this.headPos, inp.quat, hands[0] && hands[0].glove, hands[1] && hands[1].glove, this.vel);
    for (const [id, pose] of this.net.remote) {
      let g = this.ghosts.get(id);
      if (!g) {
        const el = this.add('a-entity', {});
        this.add('a-sphere', { radius: 0.35, material: 'color: #ffffff; opacity: 0.6; transparent: true' }, el);
        const who = this.net.match.players.find(p => p.id === id);
        this.add('a-text', { value: who ? who.name : 'PLAYER', align: 'center', width: 4, position: '0 0.8 0', side: 'double' }, el);
        g = { el };
        this.ghosts.set(id, g);
      }
      g.el.object3D.position.set(...pose.p);
    }
  },

  // ---------------------------------------------------------------- rendering
  startBurst(pos, color) {
    const p = this.burst.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, pos.x, pos.y, pos.z);
      const v = tmp3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 8);
      this.burstVel.set([v.x, v.y, v.z], i * 3);
    }
    p.needsUpdate = true;
    this.burst.material.color.set(color);
    this.burstT = 1;
  },

  pointLocator(mesh, target, color, show) {
    const head = this.rig.worldToLocal(tmp2.copy(this.headPos)), local = this.rig.worldToLocal(tmp3.copy(target));
    const dx = local.x - head.x, dz = local.z - head.z, len = Math.hypot(dx, dz) || 1;
    mesh.visible = show && this.state !== 'portal' && target.distanceTo(this.headPos) > 6;
    if (!mesh.visible) return;
    mesh.position.set(head.x + dx / len * 0.75, (this.cockpitY || 0) + 0.72, head.z + dz / len * 0.75);
    mesh.lookAt(target);
    mesh.material.color.set(color);
  },

  render(inp, dt) {
    const d = this.disc, s = this.snitch;
    this.discObj.visible = d.away <= 0;
    this.discObj.position.copy(d.pos); this.discObj.quaternion.copy(d.quat);
    d.spinAngle += d.spin * dt; this.discSpinObj.rotation.y = d.spinAngle;
    this.snitchObj.visible = s.active;
    if (s.active) { this.snitchObj.position.copy(s.pos); const flap = Math.sin(this.time * 40) * 0.6; this.wings[0].rotation.z = flap; this.wings[1].rotation.z = -flap; }
    for (const b of this.activeBots) { b.obj.position.copy(b.pos); b.obj.lookAt(tmp.copy(b.pos).add(b.facing)); }
    for (const hp of this.hoops) if (hp.flash > 0) { hp.flash = Math.max(0, hp.flash - dt); hp.mat.emissiveIntensity = 0.7 + hp.flash * 3; }
    // Rocks fade to see-through when you're close so they never block your view.
    for (const r of this.rocks) {
      const a = Math.max(0.2, Math.min(1, (r.c.distanceTo(this.headPos) - r.r - 2) / 8));
      for (const m of r.mats) m.opacity = a;
      if (r.squashT > 0) { r.squashT = Math.max(0, r.squashT - dt * 3); const k = Math.sin(r.squashT * Math.PI * 3) * 0.12 * r.squashT; r.mesh.scale.set(1 + k, 1 - k, 1 + k); }
    }
    // Rider trails and glows (a bot's glow takes its power-up's color)
    for (const b of this.activeBots) {
      const buff = this.buffs.get(b), hc = buff ? buff.type.color : this.onFire === b.team ? '#ff8a1f' : b.col;
      if (b.haloC !== hc) { b.haloC = hc; b.halo.material.color.set(hc); b.halo.scale.setScalar(hc === b.col ? 2.6 : 4); }
      const tp = b.trail.geometry.attributes.position;
      if ((b.trailT = (b.trailT || 0) + dt) > 0.05) {
        b.trailT = 0;
        for (let i = tp.count - 1; i > 0; i--) tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), tp.getZ(i - 1));
      }
      tp.setXYZ(0, b.pos.x, b.pos.y + 0.4, b.pos.z);
      if (!b.trailInit || Math.hypot(tp.getX(1) - b.pos.x, tp.getZ(1) - b.pos.z) > 8) { b.trailInit = true; for (let i = 1; i < tp.count; i++) tp.setXYZ(i, b.pos.x, b.pos.y + 0.4, b.pos.z); }
      tp.needsUpdate = true;
    }
    for (const p of this.prisms) p.plate.material.emissiveIntensity = 0.35 + Math.max(0, 1 - (this.time - this.disc.bankT)) * 1.5;

    const m4 = this.m4 || (this.m4 = new T.Matrix4());
    this.pockets.forEach((p, i) => { const sc = 1 + Math.sin(this.time * 2 + p.phase) * 0.08; this.pocketShells.setMatrixAt(i, m4.makeScale(sc, sc, sc).setPosition(p.c)); });
    this.pocketShells.instanceMatrix.needsUpdate = true;
    this.pocketGlows.forEach((glow, i) => {
      const h = inp.hands.filter(x => !x.desktop)[i];
      let best = null, near = 0;
      if (h) for (const p of this.pockets) {
        const held = this.anchors[h.side] && this.anchors[h.side].pocket === p;
        const k = held ? 1 : 1 - Math.min(1, (h.glove.distanceTo(p.c) - POCKET_R) / 2.5);
        if (k > near) { near = k; best = p; }
      }
      glow.visible = !!best;
      if (best) { glow.position.copy(best.c); glow.scale.setScalar(1 + near * 0.3); glow.material.opacity = near * near * 0.35; }
    });

    const wp = this.wind.geometry.attributes.position;
    for (let i = 0; i < wp.count && this.winds.length; i++) {
      const dir = this.winds[Math.floor(i / this.windPer)].dir;
      let z = wp.getZ(i) + dir * 14 * dt;
      if (z > CURRENT_LEN) z -= CURRENT_LEN * 2; else if (z < -CURRENT_LEN) z += CURRENT_LEN * 2;
      wp.setZ(i, z);
    }
    wp.needsUpdate = true;

    const world = this.worlds[this.realm.id];
    if (patchTex) patchTex.offset.set(Math.sin(this.time * 0.23) * 0.0015, Math.sin(this.time * 0.31) * 0.0012); // leaves stirring
    world.particles.userData.update(dt, this.time);
    for (const g of world.spin) g.obj.rotateZ(g.speed * dt);
    for (const u of world.updates) u(dt, this.time);
    // Hide inside a drift cloud: everything goes white around you.
    const inCloud = this.hazard.inside && this.hazard.inside(this.headPos), fadeM = this.fadeMat();
    this.blinkT = Math.max(0, (this.blinkT || 0) - dt);
    if (fadeM && this.state !== 'portal' && this.blinkT > 0) { fadeM.color.set('#000000'); fadeM.opacity = Math.min(1, this.blinkT * 4); }
    else if (fadeM && this.state !== 'portal') {
      this.cloudFog = (this.cloudFog || 0) + ((inCloud ? 0.55 : 0) - (this.cloudFog || 0)) * Math.min(1, dt * 4);
      this.portalFlash = Math.max(0, this.portalFlash - dt * 3);
      if (this.portalFlash * 0.7 > this.cloudFog) { fadeM.color.set('#b49cff'); fadeM.opacity = this.portalFlash * 0.7; }
      else { fadeM.color.set('#eef4fb'); fadeM.opacity = this.cloudFog; }
    } else if (fadeM && this.state === 'portal') fadeM.color.set(this.nextRealm ? this.nextRealm.fog : '#000');

    if (this.shockT > 0) { const sc = 0.5 + (1 - this.shockT / 0.45) * SHOCK_R; this.shock.visible = true; this.shock.scale.set(sc, sc, sc); } else this.shock.visible = false;
    if (this.burstT > 0) {
      this.burstT = Math.max(0, this.burstT - dt);
      const bp = this.burst.geometry.attributes.position, bv = this.burstVel, k = Math.exp(-2 * dt);
      for (let i = 0; i < bp.count; i++) { bp.setXYZ(i, bp.getX(i) + bv[i * 3] * dt, bp.getY(i) + bv[i * 3 + 1] * dt, bp.getZ(i) + bv[i * 3 + 2] * dt); bv[i * 3] *= k; bv[i * 3 + 1] *= k; bv[i * 3 + 2] *= k; }
      bp.needsUpdate = true; this.burst.material.opacity = this.burstT;
    }
    this.burst.visible = this.burstT > 0;

    // Disc trail: the last 18 positions while it flies fast, so quick throws are easy to follow.
    const tp = this.trail.geometry.attributes.position, flying = d.holder === null && d.away <= 0 && d.vel.lengthSq() > 36;
    for (let i = tp.count - 1; i > 0; i--) tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), tp.getZ(i - 1));
    tp.setXYZ(0, d.pos.x, d.pos.y, d.pos.z);
    if (!flying) for (let i = 1; i < tp.count; i++) tp.setXYZ(i, d.pos.x, d.pos.y, d.pos.z);
    tp.needsUpdate = true; this.trail.visible = flying;

    const inPlay = this.state !== 'ready' && this.state !== 'over';
    this.pointLocator(this.discArrow, d.pos, d.holder === null ? '#ffffff' : TEAM_COLOR[this.teamOf(d.holder)], inPlay && d.holder !== 'player' && d.away <= 0);
    this.pointLocator(this.snitchArrow, s.pos, '#ffd23d', s.active);

    for (const side of ['left', 'right']) {
      const h = inp.hands.find(x => x.side === side && !x.desktop), gloveObj = this.gloveEls[side].object3D;
      const arm = side === 'left' ? this.beams.armL : this.beams.armR, aim = side === 'left' ? this.beams.aimL : this.beams.aimR;
      gloveObj.visible = !!h;
      if (!h) { arm.visible = false; aim.visible = false; continue; }
      gloveObj.position.copy(this.rig.worldToLocal(h.glove.clone()));
      gloveObj.scale.setScalar(this.mittOn('player') ? 2.2 : 1);
      const gm = this.gloveEls[side].getObject3D('mesh'), buff = this.buffs.get('player'), gc = buff ? buff.type.color : this.onFire === 'blue' ? '#ff8a1f' : '#66ffff';
      if (gm && gm.userData.c !== gc) { gm.userData.c = gc; gm.material.color.set(gc); gm.material.emissive.set(gc); }
      this.setBeam(arm, h.shoulder, h.glove);
      if (this.easy) this.setBeam(aim, h.glove, h.glove.clone().addScaledVector(h.dir, 15)); else aim.visible = false;
    }
    const sm = this.steerMark, showSteer = this.live && this.inVR && this.handSteer && this.steerDir && !this.anchors.left && !this.anchors.right;
    sm.visible = !!showSteer;
    if (showSteer) {
      sm.position.copy(this.headPos).addScaledVector(this.steerDir, 6); sm.up.copy(UP).applyQuaternion(this.rig.quaternion); sm.lookAt(this.headPos);
      sm.material.opacity = 0.12 + Math.min(1, this.thrustLevel || 0) * 0.4;
      sm.material.color.set(this.boosting ? '#ffd166' : '#66ffff');
    }
    const f = this.energy / ENERGY_MAX;
    this.energyDots.forEach((m, i) => { const on = f * 10 > i + 0.5; m.material.color.set(on ? '#66ffff' : '#203040'); });
    const glowMesh = this.$('thrusterGlow').getObject3D('mesh');
    if (glowMesh) glowMesh.material.opacity = 0.15 + (this.thrustLevel || 0) * 0.6;
  },

  updateComfort(dt) {
    if (!this.vigMat) {
      const v = this.$('vignette').getObject3D('mesh');
      if (!v) return;
      v.material.map = vignetteTexture(); v.material.needsUpdate = true; v.renderOrder = 999;
      this.vigMat = v.material;
    }
    // Darker edges when you speed up, hit something, or your ride is turning (loops and rolls), which keeps flips comfortable.
    const target = Math.min(0.85, this.accelMag / 30 + Math.max(0, this.vel.length() - 14) / 14 + this.impactFlash * 0.8 + Math.max(0, (this.turnRate || 0) - 0.3) * 0.35 * (this.save.comfort === false ? 0 : 1));
    this.vig += (target - this.vig) * (1 - Math.exp(-8 * dt));
    this.vigMat.opacity = this.vig;
  },

  modeLabel() {
    if (!this.inVR) return 'Easy reach (PC)';
    if (this.modeLock) return this.easy ? 'Easy reach (locked)' : 'Full motion (locked)';
    return this.easy ? 'Easy reach (auto)' : 'Full motion (auto)';
  },

  // Scoreboard: hidden while you play, fades in for goals, the countdown, surge events, the last 10 seconds,
  // or when you look down at your ride (PC: hold Tab). Messages float in front of you instead of sitting on the dashboard.
  updateHud(dt) {
    const inMenu = this.state === 'ready' || this.state === 'over' || this.pauseOpen;
    this.scoreShowT = Math.max(0, this.scoreShowT - dt);
    const lookDown = this.inVR ? this.headFwd.clone().applyQuaternion(this.rig.quaternion.clone().invert()).y < -0.45 : !!this.keys.Tab;
    const want = !inMenu && this.state !== 'portal' && (this.state === 'countdown' || this.state === 'scored' || this.scoreShowT > 0 ||
                 (this.state === 'playing' && this.timeLeft < 10) || lookDown);
    this.scoreAlpha += ((want ? 1 : 0) - this.scoreAlpha) * Math.min(1, dt * (want ? 10 : 4));
    this.scorePanel.setOpacity(this.scoreAlpha);
    const m = Math.floor(this.timeLeft / 60), sec = String(Math.floor(this.timeLeft % 60)).padStart(2, '0'), pw = this.power;
    const sb = {
      blue: this.score.blue, orange: this.score.orange, clock: `${m}:${sec}`, clockWarn: this.timeLeft < 10,
      mode: this.mode.core ? `${this.mode.name} · FIRST TO ${this.mode.target}` : this.mode.name, realm: `${this.realm.name}${this.snitch.active ? ' · SNITCH OUT' : ''}`,
      power: `${this.inVR ? 'B' : 'C'}: ${this.realm.powerName} ${pw.t > 0 ? 'ACTIVE' : pw.cool > 0 ? Math.ceil(pw.cool) + 's' : 'READY'}`, powerReady: pw.cool === 0,
      event: this.surge ? `${this.surge.ev.name} ${Math.ceil(this.surge.left)}s` : this.finalSurgeOn ? 'FINAL SURGE x2' : this.buffs.get('player') ? `${this.buffs.get('player').type.name} ${Math.ceil(this.buffs.get('player').t)}s`
           : this.onFire ? `${this.onFire === 'blue' ? 'BLUE' : 'ORANGE'} ON FIRE` : ''
    };
    const key = JSON.stringify(sb);
    if (this.scoreAlpha > 0.01 && key !== this.scoreKey) { this.scoreKey = key; this.scorePanel.set((g, W, H, p) => paintScoreboard(g, W, H, p, sb)); }
    this.scorePanel.update();

    // Floating message, lagging gently behind where you look.
    let text = '', opts = this.msgOpts || {};
    if (this.msgT > 0 && !inMenu) text = this.msg;
    else if (this.state === 'playing' && this.disc.holder === 'player' && this.disc.holdT > (this.mode.core ? 7 : 4)) { text = `THROW IN ${Math.ceil((this.mode.core ? 10 : HOLD_LIMIT) - this.disc.holdT)}`; opts = { color: '#ffd166' }; }
    const tkey = text + '|' + (opts.big ? 1 : 0) + (opts.color || '') + (opts.hint ? opts.hint.side + opts.hint.part : '');
    if (text && tkey !== this.toastKey) { this.toastKey = tkey; const t = { text, big: opts.big, color: opts.color, hint: opts.hint }; this.toastPanel.set((g, W, H, p) => paintToast(g, W, H, p, t)); }
    this.toastAlpha += ((text && this.state !== 'portal' ? 1 : 0) - this.toastAlpha) * Math.min(1, dt * (text ? 14 : 5));
    this.toastPanel.setOpacity(this.toastAlpha);
    this.toastPanel.update();
    if (this.toastAlpha > 0.01) {
      const head = this.rig.worldToLocal(this.headPos.clone()), fwd = this.rig.worldToLocal(this.headPos.clone().add(this.headFwd)).sub(head);
      fwd.y = Math.max(-0.3, Math.min(0.3, fwd.y)); fwd.normalize();
      const target = head.addScaledVector(fwd, 1.5).add(new T.Vector3(0, opts.big ? 0.05 : -0.2, 0)), tm = this.toastPanel.mesh;
      if (!this.toastPlaced) { tm.position.copy(target); this.toastPlaced = true; } else tm.position.lerp(target, 1 - Math.exp(-5 * dt));
      tm.up.copy(UP).applyQuaternion(this.rig.quaternion); tm.lookAt(this.headPos);
    } else this.toastPlaced = false;

    const page = document.getElementById('status');
    if (page && !inMenu) { const line = `BLUE ${sb.blue} : ${sb.orange} ORANGE   ${sb.clock}   ${sb.power}${sb.event ? '   ' + sb.event : ''}${text ? '\n' + text : ''}`; if (line !== this.pageLine) { this.pageLine = line; page.textContent = line; } }
  }});
