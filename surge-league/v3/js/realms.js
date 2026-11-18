// Realm worlds: scenery around the arena and floating particles. Built once per realm, then shown or hidden.
// Each builder bakes its shapes into a few meshes (few draw calls) so the Quest keeps a steady frame rate.
const G = {
  cyl: (r, h, s = 12) => new T.CylinderGeometry(r, r, h, s),
  cyl2: (rt, rb, h, s = 12) => new T.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 12) => new T.ConeGeometry(r, h, s),
  box: (w, h, d) => new T.BoxGeometry(w, h, d),
  ball: (r, w = 14, h = 10) => new T.SphereGeometry(r, w, h),
  dode: r => new T.DodecahedronGeometry(r),
  torus: (R, r, rs = 8, ts = 48, arc = Math.PI * 2) => new T.TorusGeometry(R, r, rs, ts, arc)
};
const solid = (parts, opt = {}) => new T.Mesh(mergeParts(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...opt }));
const glowing = (parts, opt = {}) => new T.Mesh(mergeParts(parts), new T.MeshBasicMaterial({ vertexColors: true, ...opt }));
const around = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, (i / n) * Math.PI * 2));
const polar = (a, r, y) => [r * Math.cos(a), y, r * Math.sin(a)];
const teamColorAt = z => (z > 0 ? TEAM_COLOR.blue : TEAM_COLOR.orange);

const DECOR = {
  // Saucer Nebula: the field floats in deep space under a ringed planet, ringed by light pylons and drifting asteroids.
  space(g) {
    const rnd = seeded(3);
    g.add(glowing([{ geo: G.torus(61, 0.35, 8, 120), pos: [0, 0.2, 0], rot: [90, 0, 0], color: '#66ffff' },
                   { geo: G.torus(66, 0.15, 6, 120), pos: [0, -3, 0], rot: [90, 0, 0], color: '#7a5cff' }]));
    g.add(solid([{ geo: G.cyl2(60, 20, 18, 48), pos: [0, -9, 0], color: '#1a1638' }], { metalness: 0.4 }));
    const pylons = [], caps = [];
    around(8, (i, a) => {
      const [x, , z] = polar(a + 0.39, 74, 0);
      pylons.push({ geo: G.box(2, 28, 2), pos: [x, 10, z], rot: [0, -a / DEG, 0], color: '#231d4a' });
      caps.push({ geo: G.box(2.6, 1.2, 2.6), pos: [x, 24.5, z], rot: [0, -a / DEG, 0], color: teamColorAt(z) },
                { geo: G.box(2.2, 0.4, 2.2), pos: [x, -3.5, z], rot: [0, -a / DEG, 0], color: '#66ffff' });
    });
    g.add(solid(pylons, { metalness: 0.6, roughness: 0.4 }));
    g.add(glowing(caps));
    const rocks = [];
    for (let i = 0; i < 28; i++) {
      const a = rnd() * Math.PI * 2, r = 110 + rnd() * 150, s = 3 + rnd() * 9;
      rocks.push({ geo: G.dode(s), pos: polar(a, r, -40 + rnd() * 170), rot: [rnd() * 360, rnd() * 360, 0], color: rnd() < 0.5 ? '#4b4566' : '#5d4f7a' });
    }
    g.add(solid(rocks, { flatShading: true, roughness: 1 }));
    g.add(solid([{ geo: G.ball(70, 40, 28), pos: [-260, 150, -380], color: '#6a4cff' }, { geo: G.ball(16, 24, 16), pos: [300, 220, 220], color: '#ffcf8a' }], { roughness: 0.9, fog: false }));
    const ring = new T.Mesh(new T.RingGeometry(95, 140, 96), new T.MeshBasicMaterial({ color: '#d9c3ff', side: T.DoubleSide, transparent: true, opacity: 0.55, fog: false }));
    ring.position.set(-260, 150, -380); ring.rotation.set(1.25, 0.3, 0.2);
    g.add(ring);
  },

  // Iron Foundry: a lava moat around a steel deck, smokestacks, crane girders and giant turning gears.
  foundry(g, spin) {
    const rnd = seeded(5);
    g.add(glowing([{ geo: new T.RingGeometry(64, 84, 96), pos: [0, 0.1, 0], rot: [-90, 0, 0], color: '#ff5a1a' },
                   { geo: new T.RingGeometry(84, 86, 96), pos: [0, 0.12, 0], rot: [-90, 0, 0], color: '#ffcf4a' }], { side: T.DoubleSide }));
    // Deck top sits below the floor (y 0.3) so the two never flicker against each other.
    g.add(solid([{ geo: G.cyl(62, 1.2, 64), pos: [0, -0.6, 0], color: '#2b2622' }], { metalness: 0.5 }));
    const stacks = [], rims = [];
    around(8, (i, a) => {
      const [x, , z] = polar(a + 0.39, 102, 0);
      stacks.push({ geo: G.cyl2(3.2, 4.4, 56, 16), pos: [x, 28, z], color: '#3b3532' });
      rims.push({ geo: G.torus(3.3, 0.35, 6, 24), pos: [x, 55, z], rot: [90, 0, 0], color: '#ff7a2f' });
    });
    g.add(solid(stacks, { metalness: 0.4 }));
    g.add(glowing(rims));
    const girders = around(6, (i, a) => ({ geo: G.box(150, 2.2, 2.2), pos: [0, 62 + (i % 2) * 8, 0], rot: [0, a / DEG / 2, 0], color: '#4a4440' }));
    g.add(solid(girders, { metalness: 0.7, roughness: 0.5 }));
    around(4, (i, a) => {
      const teeth = around(14, (k, b) => ({ geo: G.box(3, 3.4, 2.4), pos: [Math.cos(b) * 15.5, Math.sin(b) * 15.5, 0], rot: [0, 0, b / DEG], color: '#6a645e' }));
      const gear = solid([{ geo: G.torus(13.5, 2.4, 8, 40), pos: [0, 0, 0], color: '#5f5a55' }, { geo: G.cyl(3, 3, 16), pos: [0, 0, 0], rot: [90, 0, 0], color: '#3a3532' }, ...teeth], { metalness: 0.8, roughness: 0.4 });
      const [x, , z] = polar(a + 0.78, 130, 0);
      gear.position.set(x, 30 + rnd() * 30, z);
      gear.lookAt(0, gear.position.y, 0);
      spin.push({ obj: gear, speed: (i % 2 ? 1 : -1) * (0.15 + rnd() * 0.1) });
      g.add(gear);
    });
  },

  // Moon Castle: battlement walls with lit windows, towers, floating lanterns, a huge moon.
  castle(g) {
    const rnd = seeded(9);
    const wall = [], crest = [], windows = [], lanterns = [];
    around(32, (i, a) => {
      const [x, , z] = polar(a, 77, 0), w = 2 * 77 * Math.sin(Math.PI / 32) + 0.4;
      wall.push({ geo: G.box(w, 10, 3), pos: [x, 5, z], rot: [0, 90 - a / DEG, 0], color: '#5d6172' });
      for (const off of [-0.3, 0.3]) crest.push({ geo: G.box(w * 0.28, 1.8, 3.2), pos: [x + Math.sin(a) * w * off, 10.9, z - Math.cos(a) * w * off], rot: [0, 90 - a / DEG, 0], color: '#6b6f80' });
    });
    around(8, (i, a) => {
      const [x, , z] = polar(a + 0.2, 80, 0);
      wall.push({ geo: G.cyl(5.5, 26, 14), pos: [x, 13, z], color: '#70748a' });
      crest.push({ geo: G.cone(7, 10, 14), pos: [x, 31, z], color: teamColorAt(z) });
      for (let k = 0; k < 3; k++) windows.push({ geo: G.box(1, 1.8, 0.3), pos: [x * 0.93, 9 + k * 5.5, z * 0.93], rot: [0, 90 - (a + 0.2) / DEG, 0], color: '#ffcf6a' });
    });
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = 63 + rnd() * 10;
      lanterns.push({ geo: G.box(0.7, 1, 0.7), pos: polar(a, r, 5 + rnd() * 28), rot: [0, rnd() * 90, 0], color: '#ffb347' });
    }
    g.add(solid(wall, { roughness: 0.95 }));
    g.add(solid(crest, { roughness: 0.9 }));
    g.add(glowing([...windows, ...lanterns]));
    g.add(glowing([{ geo: G.ball(30, 32, 20), pos: [-150, 175, -270], color: '#f4f1dc' }], { fog: false }));
    g.add(new T.Mesh(G.ball(44, 24, 16), new T.MeshBasicMaterial({ color: '#7d86c9', transparent: true, opacity: 0.12, fog: false, depthWrite: false })));
    g.children[g.children.length - 1].position.set(-150, 175, -270);
  },

  // Dream Gym: a wooden court with bleachers, two rainbows (one behind each goal) and giant floating toys.
  gym(g) {
    const rnd = seeded(13);
    const seats = [];
    for (const side of [1, -1]) for (const a of [0.55, Math.PI - 0.55]) {
      const ang = side > 0 ? a : -a;
      for (let s = 0; s < 6; s++) {
        const [x, , z] = polar(ang, 74 + s * 2.2, 0);
        seats.push({ geo: G.box(30, 1.2, 2.2), pos: [x, 1 + s * 1.4, z], rot: [0, 90 - ang / DEG, 0], color: s % 2 ? '#f3f0ea' : (z > 0 ? '#8fb8ff' : '#ffb27a') });
      }
    }
    g.add(solid(seats, { roughness: 0.7 }));
    const bands = ['#ff6b6b', '#ffb36b', '#ffe66b', '#7be08a', '#6bc5ff', '#8f7bff', '#d67bff'];
    const arcs = [];
    for (const z of [-96, 96]) bands.forEach((c, i) => arcs.push({ geo: G.torus(62 + i * 2.2, 1.1, 8, 64, Math.PI), pos: [0, 0, z], color: c }));
    g.add(glowing(arcs, { transparent: true, opacity: 0.85 }));
    const toys = [], pastel = ['#ff9ecf', '#9fd3ff', '#ffe08a', '#b6f0a8', '#d2b6ff', '#ffb38a'];
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, r = 110 + rnd() * 90, s = 4 + rnd() * 7;
      toys.push({ geo: rnd() < 0.6 ? G.box(s, s, s) : G.ball(s * 0.7, 18, 12), pos: polar(a, r, 15 + rnd() * 80), rot: [rnd() * 60, rnd() * 360, rnd() * 60], color: pastel[i % 6] });
    }
    g.add(solid(toys, { roughness: 0.5 }));
  },

  // Cloud Court: the original daytime look with team-flag towers, clouds and mountains.
  cloud(g) {
    const tower = [];
    around(8, (i, a) => {
      const [x, , z] = polar(a + 0.39, 74, 0), c = teamColorAt(z);
      tower.push({ geo: G.cyl(4, 18, 10), pos: [x, 9, z], color: '#d8cfbd' }, { geo: G.cone(5, 6, 10), pos: [x, 21, z], color: c },
                 { geo: G.cyl(0.1, 6, 5), pos: [x, 27, z], color: '#555555' }, { geo: new T.PlaneGeometry(2.4, 1.4), pos: [x + 1.2, 29, z], color: c });
    });
    g.add(solid(tower, { side: T.DoubleSide, roughness: 0.9 }));
    g.add(solid(around(12, (i, a) => { const h = 60 + (i * 23) % 50; return { geo: G.cone(50, h, 6), pos: polar(a + 0.17, 330, h / 2), color: '#6f8a7a' }; }), { flatShading: true, roughness: 1 }));
    const puffs = [];
    around(16, (i, a) => {
      const r = 140 + (i * 37) % 80, y = 60 + (i * 13) % 30, [cx, , cz] = polar(a + 0.12, r, 0);
      for (let j = 0; j < 3; j++) puffs.push({ geo: G.ball(6 + (j === 1 ? 2 : 0), 10, 8), pos: [cx + (j - 1) * 6, y + (j === 1 ? 2 : 0), cz] });
    });
    g.add(solid(puffs, { roughness: 1 }));
  }
};

// Floating particles that give each realm its mood. One draw call each.
function makeParticles(spec) {
  const n = spec.count, pos = new Float32Array(n * 3), seed = new Float32Array(n * 3), rnd = seeded(17);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = spec.kind === 'embers' ? 64 + rnd() * 20 : Math.sqrt(rnd()) * 70;
    pos.set([r * Math.cos(a), 2 + rnd() * 38, r * Math.sin(a)], i * 3);
    seed.set([rnd() * 10, 0.5 + rnd(), rnd() * Math.PI * 2], i * 3);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const mat = new T.PointsMaterial({ color: spec.color, size: spec.size * 1.6, map: dotTexture(), transparent: true, opacity: spec.kind === 'bubbles' ? 0.5 : 0.85, depthWrite: false,
                                     blending: spec.kind === 'bubbles' ? T.NormalBlending : T.AdditiveBlending, fog: spec.kind === 'bubbles' });
  const pts = new T.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (dt, time) => {
    const p = geo.attributes.position;
    for (let i = 0; i < n; i++) {
      const s0 = seed[i * 3], sp = seed[i * 3 + 1], ph = seed[i * 3 + 2];
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (spec.kind === 'embers') { y += sp * 4 * dt; x += Math.sin(time + s0) * 0.3 * dt; if (y > 45) y = 0.5; }
      else if (spec.kind === 'bubbles') { y += sp * 1.2 * dt; x += Math.sin(time * 0.8 + s0) * 0.2 * dt; if (y > 40) y = 1; }
      else if (spec.kind === 'fireflies') { x += Math.sin(time * sp + ph) * 0.8 * dt; z += Math.cos(time * sp * 0.7 + s0) * 0.8 * dt; y += Math.sin(time * 1.3 + ph) * 0.4 * dt; }
      else { y += Math.sin(time * 0.5 + ph) * 0.15 * dt; x += Math.cos(time * 0.3 + s0) * 0.1 * dt; }
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    if (spec.kind === 'fireflies') mat.opacity = 0.6 + Math.sin(time * 3) * 0.25;
  };
  return pts;
}

// Builds (once) and returns { group, spin[], particles } for a realm.
function buildRealmWorld(realm) {
  const group = new T.Group(), spin = [];
  // Scenery is built for the old, bigger field; shrink it with the field so it still rings the arena.
  const decor = new T.Group(); decor.scale.setScalar(FIELD_SCALE); group.add(decor);
  DECOR[realm.decor](decor, spin);
  const updates = buildFieldExtras(realm, group);
  const particles = makeParticles(realm.particles);
  group.add(particles);
  return { group, spin, particles, updates };
}
