// Realm styles: each realm builds its own hoops, obstacles and a field hazard, so every world plays and looks different.
// Same layout everywhere (skills carry over); hazards always come in mirrored copies so both teams get the same.

// ------------------------------------------------------------------ painted textures
const STYLE_TEX = {};
function styleTex(key, w, h, paint, repeat) {
  if (STYLE_TEX[key]) return STYLE_TEX[key];
  const t = canvasTexture(w, h, paint);
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return (STYLE_TEX[key] = t);
}
// Diamond-mesh net with soft see-through holes.
const netTex = () => styleTex('net', 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7; g.lineCap = 'round';
  for (let i = -2; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2 + w, h); g.stroke(); g.beginPath(); g.moveTo(i * w / 2 + w, 0); g.lineTo(i * w / 2, h); g.stroke(); }
}, [6, 2]);
// Swirl for portals and the gravity wells' glowing disc.
const swirlTex = (key, inner, outer) => styleTex(key, 512, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  for (let arm = 0; arm < 5; arm++) for (let i = 0; i < 160; i++) {
    const t = i / 160, a = arm * Math.PI * 2 / 5 + t * 5.5, r = 20 + t * (w / 2 - 30);
    g.fillStyle = `rgba(255,255,255,${(0.6 * (1 - t) + 0.1).toFixed(2)})`;
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 14 * (1 - t) + 4, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-in';
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2); grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
});
// Soft vertical streaks for the steam columns.
const steamTex = () => styleTex('steam', 128, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); const rnd = seeded(41);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 26, grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const fade = g.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
}, [1, 1]);
const beachTex = () => styleTex('beach', 512, 256, (g, w, h) => {
  const cols = ['#ff6b6b', '#ffffff', '#ffd23d', '#ffffff', '#6bc5ff', '#ffffff', '#7be08a', '#ffffff'];
  cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 8, 0, w / 8 + 1, h); });
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
});
const bannerTex = color => styleTex('banner' + color, 128, 256, (g, w, h) => {
  g.fillStyle = color; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w / 2, h * 0.82); g.lineTo(0, h); g.fill();
  g.strokeStyle = '#ffd98a'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h * 0.7);
  g.fillStyle = '#ffd98a'; g.beginPath(); g.moveTo(w / 2, 50); g.lineTo(w / 2 + 26, 100); g.lineTo(w / 2, 150); g.lineTo(w / 2 - 26, 100); g.fill();
});
const padTex = () => styleTex('pad', 256, 256, (g, w, h) => {
  g.fillStyle = '#3d3a48'; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6;
  for (const r of [40, 75, 110]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); }
  g.fillStyle = '#ffe66b'; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 22 : 50; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
  g.fill();
});

const stdMat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const addMat = (color, opacity = 0.6, o = {}) => new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide, ...o });

// ------------------------------------------------------------------ hoops
// Local space: the ring faces +z (toward the field); the net and backboard sit behind it at -z.
// Returns { obj, flash: [materials that light up on a goal], obstacles (local), update(dt, time) }.
function makeNet(R, color = '#ffffff', opacity = 0.7) {
  const net = new T.Mesh(new T.CylinderGeometry(R * 0.35, R, 2.2, 24, 1, true), new T.MeshBasicMaterial({ map: netTex(), color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, alphaTest: 0.05 }));
  net.rotation.x = -Math.PI / 2; net.position.z = -1.1;
  return net;
}
const HOOP_STYLE = {
  saucer(R, team) {
    const col = TEAM_COLOR[team], obj = new T.Group(), ring = stdMat(col, { emissive: col, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.3 });
    obj.add(new T.Mesh(new T.TorusGeometry(R, 0.11, 10, 64), ring));
    // Outer ring and its four lights baked into one mesh (fewer draw calls for the Quest).
    const orbit = new T.Mesh(mergeParts([{ geo: G.torus(R + 0.35, 0.04, 6, 64), pos: [0, 0, 0], color: '#66ffff' },
      ...around(4, (i, a) => ({ geo: G.ball(0.12, 10, 8), pos: [Math.cos(a) * (R + 0.35), Math.sin(a) * (R + 0.35), 0], color: '#ffffff' }))]), addMat('#ffffff', 0.9, { vertexColors: true }));
    obj.add(orbit);
    const film = new T.Mesh(new T.CircleGeometry(R - 0.1, 48), addMat(col, 0.12));
    obj.add(film, makeNet(R, '#9ff', 0.45), glowSprite(col, R * 4, 0.5));
    return { obj, flash: [ring], update: (dt, t) => { orbit.rotation.z += dt * 0.8; film.material.opacity = 0.1 + Math.sin(t * 3) * 0.05; } };
  },
  foundry(R, team) {
    const col = TEAM_COLOR[team], obj = new T.Group(), steel = stdMat('#6b7380', { metalness: 0.9, roughness: 0.35 });
    const gear = new T.Group();
    gear.add(new T.Mesh(new T.TorusGeometry(R + 0.1, 0.2, 8, 6 * 8), steel));
    const teeth = around(14, (i, a) => ({ geo: G.box(0.32, 0.36, 0.34), pos: [Math.cos(a) * (R + 0.42), Math.sin(a) * (R + 0.42), 0], rot: [0, 0, a / DEG], color: '#7a828f' }));
    gear.add(solid(teeth, { metalness: 0.9, roughness: 0.35 }));
    const glow = stdMat(col, { emissive: col, emissiveIntensity: 1.2 });
    obj.add(gear, new T.Mesh(new T.TorusGeometry(R - 0.12, 0.06, 6, 48), glow), makeNet(R, '#d0c4b8', 0.55), glowSprite('#ff8a1f', R * 3.5, 0.35));
    return { obj, flash: [glow], update: dt => { gear.rotation.z += dt * (team === 'blue' ? 0.4 : -0.4); } };
  },
  castle(R, team) {
    const col = TEAM_COLOR[team], obj = new T.Group();
    const stones = around(12, (i, a) => ({ geo: G.box(0.62, 0.5, 0.5), pos: [Math.cos(a) * R, Math.sin(a) * R, 0], rot: [0, 0, a / DEG + 90], color: i % 2 ? '#8a8f9e' : '#7c8190' }));
    for (const s of [-1, 1]) stones.push({ geo: G.cyl2(0.07, 0.05, 0.7, 8), pos: [s * (R + 0.6), 0, 0.2], color: '#5a4128' }); // torch handles
    obj.add(solid(stones, { roughness: 0.95, flatShading: true }));
    const trim = stdMat(col, { emissive: col, emissiveIntensity: 0.9 });
    obj.add(new T.Mesh(new T.TorusGeometry(R - 0.32, 0.05, 6, 48), trim));
    const banner = new T.Mesh(new T.PlaneGeometry(0.9, 1.8), new T.MeshStandardMaterial({ map: bannerTex(col), transparent: true, side: T.DoubleSide, roughness: 0.9 }));
    banner.position.set(0, -R - 1.2, 0.05);
    obj.add(banner, makeNet(R, '#e8dcc0', 0.5));
    const flames = [];
    for (const s of [-1, 1]) {
      const torch = new T.Group(); torch.position.set(s * (R + 0.6), 0, 0.2);
      const flame = new T.Mesh(new T.ConeGeometry(0.16, 0.45, 10), addMat('#ffb347', 0.95)); flame.position.y = 0.55;
      const halo = glowSprite('#ffb347', 1.6, 0.7); halo.position.y = 0.6;
      torch.add(flame, halo); obj.add(torch); flames.push({ flame, halo, ph: s * 1.7 });
    }
    return { obj, flash: [trim], update: (dt, t) => { for (const f of flames) { const k = 0.85 + Math.sin(t * 13 + f.ph) * 0.1 + Math.sin(t * 7.3 + f.ph) * 0.08; f.flame.scale.set(k, k * 1.1, k); f.halo.material.opacity = 0.5 + k * 0.25; } } };
  },
  gym(R, team) {
    const col = TEAM_COLOR[team], obj = new T.Group(), rim = stdMat('#ff7a2f', { emissive: col, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
    obj.add(new T.Mesh(new T.TorusGeometry(R, 0.09, 10, 64), rim), makeNet(R, '#ffffff', 0.9));
    // Glass backboard with a painted frame. It's a real wall: misses can bounce back into play.
    const board = new T.Group(); board.position.z = -1.6;
    board.add(new T.Mesh(new T.BoxGeometry(R * 3.4, R * 2.3, 0.12), new T.MeshStandardMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 })));
    const frame = [[0, R * 1.15, R * 3.4, 0.12], [0, -R * 1.15, R * 3.4, 0.12], [R * 1.7, 0, 0.12, R * 2.3], [-R * 1.7, 0, 0.12, R * 2.3], [0, R * 0.5, R * 1.3, 0.08], [0, -R * 0.4, R * 1.3, 0.08], [R * 0.65, 0.05, 0.08, R * 0.9], [-R * 0.65, 0.05, 0.08, R * 0.9]];
    board.add(solid(frame.map(([x, y, w, h], i) => ({ geo: G.box(w, h, 0.16), pos: [x, y, 0.02], color: i < 4 ? '#ffffff' : col })), { roughness: 0.5 }));
    obj.add(board);
    const half = new T.Vector3(R * 1.7, R * 1.15, 0.1);
    return { obj, flash: [rim], obstacles: [{ type: 'box', local: new T.Vector3(0, 0, -1.6), half, bounce: 0.75 }] };
  },
  cloud(R, team) {
    const col = TEAM_COLOR[team], obj = new T.Group();
    const puffs = around(14, (i, a) => ({ geo: G.ball(0.34 + (i % 3) * 0.08, 12, 8), pos: [Math.cos(a) * (R + 0.18), Math.sin(a) * (R + 0.18), (i % 2) * 0.1], color: '#ffffff' }));
    obj.add(solid(puffs, { roughness: 1 }));
    const ring = stdMat(col, { emissive: col, emissiveIntensity: 0.8 });
    obj.add(new T.Mesh(new T.TorusGeometry(R - 0.15, 0.07, 8, 48), ring), makeNet(R, '#ffffff', 0.6));
    const wings = [-1, 1].map(s => { const w = new T.Mesh(new T.PlaneGeometry(1.4, 0.6), new T.MeshStandardMaterial({ color: '#fff6d8', side: T.DoubleSide, roughness: 0.8 })); w.position.set(s * (R + 1.0), R * 0.3, 0); obj.add(w); return { w, s }; });
    return { obj, flash: [ring], update: (dt, t) => { for (const { w, s } of wings) w.rotation.y = s * (0.4 + Math.sin(t * 2.4) * 0.35); } };
  }
};
// Poles: a different post per realm (always the same thin collision box).
function buildPole(realm, team, height) {
  const col = TEAM_COLOR[team], g = new T.Group();
  const id = realm.id;
  if (id === 'saucer') {
    g.add(new T.Mesh(new T.CylinderGeometry(0.22, 0.22, height, 12, 1, true), addMat('#66ffff', 0.25)));
    g.add(new T.Mesh(new T.CylinderGeometry(0.06, 0.06, height, 6), addMat(col, 0.9)));
    const base = new T.Mesh(new T.CylinderGeometry(1, 1.2, 0.3, 24), stdMat('#3a3570', { metalness: 0.7 })); base.position.y = -height / 2 + 0.15; g.add(base);
  } else if (id === 'foundry') {
    g.add(solid([{ geo: G.box(0.36, height, 0.12), pos: [0, 0, 0], color: '#5f6670' }, { geo: G.box(0.12, height, 0.36), pos: [0, 0, 0], color: '#5f6670' },
                 { geo: G.box(0.5, 0.5, 0.5), pos: [0, -height / 2 + 0.25, 0], color: '#3d4148' },
                 ...[0, 1, 2, 3].map(i => ({ geo: G.box(0.4, 0.25, 0.4), pos: [0, -height / 2 + 1 + i * 0.25, 0], color: i % 2 ? '#1a1a1a' : '#ffcc00' }))], { metalness: 0.8, roughness: 0.4 }));
  } else if (id === 'castle') {
    g.add(new T.Mesh(new T.CylinderGeometry(0.28, 0.36, height, 10), stdMat('#7c8190', { roughness: 0.95, flatShading: true })));
    const cap = new T.Mesh(new T.CylinderGeometry(0.5, 0.3, 0.4, 10), stdMat('#8a8f9e', { roughness: 0.9 })); cap.position.y = height / 2 - 0.2; g.add(cap);
  } else if (id === 'gym') {
    g.add(new T.Mesh(new T.CylinderGeometry(0.2, 0.2, height, 14), stdMat('#d9d9e0', { metalness: 0.6, roughness: 0.3 })));
    const pad = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 2.2, 16), stdMat(col, { roughness: 0.8 })); pad.position.y = -height / 2 + 1.1; g.add(pad);
  } else {
    g.add(new T.Mesh(new T.CylinderGeometry(0.15, 0.18, height, 12), stdMat('#e8c46a', { metalness: 0.7, roughness: 0.3 })));
    const rib = new T.Mesh(new T.TorusGeometry(0.22, 0.05, 6, 16), stdMat(col)); rib.rotation.x = Math.PI / 2; rib.position.y = height / 2 - 0.5; g.add(rib);
  }
  return g;
}

// ------------------------------------------------------------------ obstacles ("rocks")
// Each returns { mesh, bounce?, update(dt, time) } and may move its collision center (always mirror-fair).
// p: { x, y, z, r }, sx/sz: which quarter it sits in (for mirrored motion).
const ROCK_STYLE = {
  saucer(p, ob) {
    const mesh = new T.Group(), mat = stdMat('#ffffff', { vertexColors: true, emissive: '#2bb3d6', emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.2, flatShading: true, transparent: true });
    const crystals = [[0, 0, 0, 1.1, 1.6], [0.7, -0.4, 0.3, 0.5, 0.9], [-0.6, -0.3, -0.4, 0.55, 1.0], [0.1, -0.6, -0.7, 0.45, 0.8]];
    mesh.add(new T.Mesh(mergeParts(crystals.map(([x, y, z, s, h], i) => ({ geo: new T.OctahedronGeometry(p.r * s * 0.7), pos: [x * p.r, y * p.r, z * p.r], rot: [x / DEG, (y + z) / DEG, 0], scale: [1, h, 1], color: i ? '#a8eeff' : '#8fe6ff' }))), mat));
    mesh.add(glowSprite('#66ffff', p.r * 5, 0.35));
    const base = ob.c.clone(), sx = Math.sign(p.x) || 1, sz = Math.sign(p.z) || 1;
    return { mesh, mats: [mat], update: (dt, t) => { mesh.rotation.y += dt * 0.3; ob.c.set(base.x + Math.cos(t * 0.45) * 1.6 * sx, base.y + Math.sin(t * 0.7) * 1.2, base.z + Math.sin(t * 0.45) * 1.6 * sz); mesh.position.copy(ob.c); } };
  },
  foundry(p, ob) {
    // Wrecking balls: spiked iron balls swinging on chains from the girders.
    // Ball and spikes baked into one mesh (one draw call each).
    const spikes = around(12, (i, a) => { const v = new T.Vector3(Math.cos(a) * Math.sin(1 + i % 3), Math.cos(1 + i % 3) * (i % 2 ? 1 : -1), Math.sin(a) * Math.sin(1 + i % 3)).normalize(); const q = new T.Quaternion().setFromUnitVectors(UP, v), e = new T.Euler().setFromQuaternion(q); return { geo: G.cone(p.r * 0.22, p.r * 0.6, 8), pos: v.clone().multiplyScalar(p.r * 1.05).toArray(), rot: [e.x / DEG, e.y / DEG, e.z / DEG], color: '#ff8a1f' }; });
    const mat = stdMat('#ffffff', { vertexColors: true, metalness: 0.75, roughness: 0.35, emissive: '#ff5a00', emissiveIntensity: 0.12, transparent: true });
    const mesh = new T.Mesh(mergeParts([{ geo: new T.IcosahedronGeometry(p.r, 1), pos: [0, 0, 0], color: '#4a4f57' }, ...spikes]), mat);
    const anchor = new T.Vector3(ob.c.x, Y_MAX + 8, ob.c.z), len = anchor.y - ob.c.y, sx = Math.sign(p.x) || 1;
    const chain = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1, 6), stdMat('#2b2622', { metalness: 0.8 }));
    return { mesh, extra: [chain], mats: [mat], update: (dt, t) => {
      const ang = Math.sin(t * 0.9) * 0.2;
      ob.c.set(anchor.x + Math.sin(ang) * len * sx, anchor.y - Math.cos(ang) * len, anchor.z);
      mesh.position.copy(ob.c); mesh.rotation.z = ang * sx;
      chain.position.lerpVectors(anchor, ob.c, 0.5); chain.scale.y = anchor.distanceTo(ob.c); chain.lookAt(ob.c); chain.rotateX(Math.PI / 2);
    } };
  },
  castle(p, ob) {
    // Floating rune stones that bob up and down.
    const mesh = new T.Group(), mat = stdMat('#8b8378', { roughness: 0.95, flatShading: true, transparent: true });
    mesh.add(new T.Mesh(new T.DodecahedronGeometry(p.r * 1.05), mat));
    const rune = new T.Mesh(new T.TorusGeometry(p.r * 1.35, 0.07, 6, 40), addMat('#9fb0ff', 0.75)); rune.rotation.x = Math.PI / 2;
    mesh.add(rune, glowSprite('#9fb0ff', p.r * 4, 0.25));
    const base = ob.c.clone();
    return { mesh, mats: [mat], update: (dt, t) => { ob.c.y = base.y + Math.sin(t * 0.8) * 1.6; mesh.position.copy(ob.c); mesh.rotation.y += dt * 0.25; rune.rotation.z += dt; } };
  },
  gym(p, ob) {
    // Giant beach balls: extra bouncy.
    const mat = new T.MeshStandardMaterial({ map: beachTex(), roughness: 0.45, transparent: true });
    const mesh = new T.Mesh(new T.SphereGeometry(p.r * 1.05, 32, 20), mat);
    ob.bounce = 1.2;
    return { mesh, mats: [mat], squash: true, update: (dt, t) => { mesh.position.copy(ob.c); mesh.rotation.y += dt * 0.4; } };
  },
  cloud(p, ob) {
    const mat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, vertexColors: true });
    const mesh = new T.Mesh(mergeParts([{ geo: G.ball(p.r * 0.85, 14, 10), pos: [0, 0, 0] }, { geo: G.ball(p.r * 0.62, 12, 8), pos: [p.r * 0.75, -0.2, 0.1] }, { geo: G.ball(p.r * 0.6, 12, 8), pos: [-p.r * 0.75, -0.25, -0.1] }, { geo: G.ball(p.r * 0.5, 12, 8), pos: [0.1, p.r * 0.55, 0.2] }]), mat);
    ob.bounce = 0.35;
    const base = ob.c.clone(), sx = Math.sign(p.x) || 1, sz = Math.sign(p.z) || 1;
    return { mesh, mats: [mat], update: (dt, t) => { ob.c.set(base.x + Math.sin(t * 0.25) * 2.2 * sx, base.y + Math.sin(t * 0.4) * 1, base.z + Math.cos(t * 0.25) * 2.2 * sz); mesh.position.copy(ob.c); } };
  }
};

// ------------------------------------------------------------------ the field itself: a center emblem and a realm layer on the floor
// Returns a list of update(dt, time) functions.
function buildFieldExtras(realm, group) {
  const updates = [];
  // Center emblem: the realm's picture in a circle with its name around it.
  const emblem = canvasTexture(1024, 1024, (g, w) => {
    g.save(); g.beginPath(); g.arc(w / 2, w / 2, w * 0.36, 0, 7); g.clip();
    paintRealmArt(g, w * 0.14, w * 0.14, w * 0.72, w * 0.72, realm); g.restore();
    g.strokeStyle = realm.edge; g.lineWidth = 18; g.beginPath(); g.arc(w / 2, w / 2, w * 0.37, 0, 7); g.stroke();
    g.fillStyle = realm.edge; g.font = uiFont(84, 900); g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = realm.name.split('').join(' '), step = (Math.PI * 1.1) / text.length;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 - step * (text.length - 1) / 2 + i * step;
      g.save(); g.translate(w / 2 + Math.cos(a) * w * 0.44, w / 2 + Math.sin(a) * w * 0.44); g.rotate(a + Math.PI / 2); g.fillText(text[i], 0, 0); g.restore();
    }
  });
  const em = new T.Mesh(new T.CircleGeometry(7.6, 64), new T.MeshBasicMaterial({ map: emblem, transparent: true, opacity: 0.85, depthWrite: false }));
  em.rotation.x = -Math.PI / 2; em.position.y = 0.4;
  group.add(em);

  if (realm.id === 'saucer') {
    // Pulse rings that roll out from the center across the grid.
    const rings = [0, 1, 2].map(i => { const m = new T.Mesh(new T.RingGeometry(0.97, 1, 96), addMat('#66ffff', 0.5)); m.rotation.x = -Math.PI / 2; m.position.y = 0.42; group.add(m); return { m, ph: i / 3 }; });
    updates.push((dt, t) => { for (const r of rings) { const k = (t / 6 + r.ph) % 1; r.m.scale.setScalar(8 + k * 52); r.m.material.opacity = 0.45 * (1 - k); } });
  } else if (realm.id === 'foundry') {
    // Clean glowing seams between the deck plates, with a hot spot at each corner (tiles across the floor).
    const cracks = canvasTexture(512, 512, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.strokeStyle = 'rgba(255,122,26,0.9)'; g.lineWidth = 5; g.shadowColor = '#ff5a00'; g.shadowBlur = 14;
      g.strokeRect(2, 2, w - 4, w - 4);
      g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, w); g.stroke();
      g.fillStyle = '#ffcf4a';
      for (const [x, y] of [[0, 0], [w, 0], [0, w], [w, w]]) { g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); }
    });
    cracks.wrapS = cracks.wrapT = T.RepeatWrapping; cracks.repeat.set(7.5, 7.5);
    const lava = new T.Mesh(new T.CircleGeometry(ARENA_R, 64), new T.MeshBasicMaterial({ map: cracks, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }));
    lava.rotation.x = -Math.PI / 2; lava.position.y = 0.36; group.add(lava);
    updates.push((dt, t) => { lava.material.opacity = 0.55 + Math.sin(t * 1.7) * 0.12 + Math.sin(t * 5.3) * 0.06; });
  } else if (realm.id === 'castle') {
    const mistTex = canvasTexture(512, 512, (g, w) => {
      g.clearRect(0, 0, w, w); const rnd = seeded(31);
      for (let i = 0; i < 90; i++) { const x = rnd() * w, y = rnd() * w, r = 30 + rnd() * 70, grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(200,215,255,0.22)'); grd.addColorStop(1, 'rgba(200,215,255,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
    });
    const mists = [1.2, 3].map((y, i) => { const m = new T.Mesh(new T.CircleGeometry(ARENA_R + 6, 64), new T.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.3 - i * 0.12, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = y; group.add(m); return m; });
    updates.push((dt) => { mists[0].rotation.z += dt * 0.02; mists[1].rotation.z -= dt * 0.015; });
  } else if (realm.id === 'gym') {
    const court = canvasTexture(1024, 1024, (g, w) => {
      g.clearRect(0, 0, w, w); const c = w / 2, s = w / 120;
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
      for (const side of [1, -1]) {
        g.beginPath(); g.arc(c, c + side * 52 * s, 18 * s, side > 0 ? Math.PI : 0, side > 0 ? 2 * Math.PI : Math.PI); g.stroke();
        g.strokeRect(c - 7 * s, side > 0 ? c + 37 * s : c - 52 * s, 14 * s, 15 * s);
        g.beginPath(); g.arc(c, side > 0 ? c + 37 * s : c - 37 * s, 7 * s, 0, 7); g.stroke();
      }
      g.fillStyle = 'rgba(255,158,207,0.25)'; g.fillRect(c - 7 * s, c + 37 * s, 14 * s, 15 * s); g.fillRect(c - 7 * s, c - 52 * s, 14 * s, 15 * s);
    });
    const lines = new T.Mesh(new T.CircleGeometry(ARENA_R, 64), new T.MeshBasicMaterial({ map: court, transparent: true, depthWrite: false }));
    lines.rotation.x = -Math.PI / 2; lines.position.y = 0.37; group.add(lines);
  } else if (realm.id === 'cloud') {
    const rnd = seeded(51), n = 260, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new T.Color(), cols = ['#ffffff', '#ffe66b', '#ff9ecf', '#b6a2ff'];
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (ARENA_R - 2); pos.set([Math.cos(a) * r, 0.42, Math.sin(a) * r], i * 3); c.set(cols[i % 4]); col.set([c.r, c.g, c.b], i * 3); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    group.add(new T.Points(geo, new T.PointsMaterial({ size: 0.35, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false })));
  }
  return updates;
}

// ------------------------------------------------------------------ cover (big shapes to hide behind)
// Each style returns parts centered on the box (b: { x, y, z, w, h, d }): { solid: [...], glow: [...], opts }.
// buildCover() bakes every box of the arena into one or two meshes, so all the cover costs at most two draw calls.
const COVER_STYLE = {
  saucer(b) {
    const e = 0.06, hw = b.w / 2, hh = b.h / 2, hd = b.d / 2, glow = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) glow.push({ geo: G.box(e, b.h, e), pos: [sx * hw, 0, sz * hd], color: '#66ffff' });
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) glow.push({ geo: G.box(b.w, e, e), pos: [0, sy * hh, sz * hd], color: '#ff4fd8' });
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) glow.push({ geo: G.box(e, e, b.d), pos: [sx * hw, sy * hh, 0], color: '#66ffff' });
    return { solid: [{ geo: G.box(b.w, b.h, b.d), pos: [0, 0, 0], color: '#1d1840' }], glow, opts: { metalness: 0.7, roughness: 0.3 } };
  },
  foundry(b) {
    // A shipping container with ribs and a hazard stripe.
    const parts = [{ geo: G.box(b.w, b.h, b.d), pos: [0, 0, 0], color: '#8a3b22' }];
    const long = b.w >= b.d, n = Math.max(3, Math.round((long ? b.w : b.d) / 0.8));
    for (let i = 0; i < n; i++) {
      const t = -0.5 + (i + 0.5) / n;
      parts.push(long ? { geo: G.box(0.12, b.h * 0.94, b.d + 0.08), pos: [t * b.w, 0, 0], color: '#6e2f1b' } : { geo: G.box(b.w + 0.08, b.h * 0.94, 0.12), pos: [0, 0, t * b.d], color: '#6e2f1b' });
    }
    for (let i = 0; i < 8; i++) parts.push({ geo: G.box(long ? b.w / 8 : b.w + 0.1, 0.35, long ? b.d + 0.1 : b.d / 8), pos: [long ? (i - 3.5) * b.w / 8 : 0, b.h / 2 - 0.25, long ? 0 : (i - 3.5) * b.d / 8], color: i % 2 ? '#1a1a1a' : '#ffcc00' });
    return { solid: parts, opts: { metalness: 0.6, roughness: 0.55 } };
  },
  castle(b) {
    // A ruined stone wall: stacked blocks with a broken, uneven top.
    const parts = [], rnd = seeded(Math.round(b.x * 7 + b.z * 13 + 100)), long = b.w >= b.d, len = long ? b.w : b.d, thick = long ? b.d : b.w;
    const cols = Math.max(2, Math.round(len / 1.2)), rows = Math.max(2, Math.round(b.h / 0.9));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && rnd() < 0.35) continue;
      const bl = len / cols, bh = b.h / rows, off = (r % 2 ? 0.25 : -0.25) * bl;
      const t = -len / 2 + (c + 0.5) * bl + off;
      if (Math.abs(t) > len / 2 - bl * 0.2) continue;
      const v = 0.85 + rnd() * 0.15, col = `rgb(${Math.round(110 * v)},${Math.round(114 * v)},${Math.round(130 * v)})`;
      parts.push({ geo: G.box(long ? bl * 0.96 : thick, bh * 0.94, long ? thick : bl * 0.96), pos: [long ? t : 0, -b.h / 2 + (r + 0.5) * bh, long ? 0 : t], color: col });
    }
    return { solid: parts, opts: { roughness: 0.95, flatShading: true } };
  },
  gym(b) {
    // Giant stacked foam blocks in pastel colors.
    const parts = [], cols = ['#ff9ecf', '#9fd3ff', '#ffe08a', '#b6f0a8', '#d2b6ff'], rows = Math.max(2, Math.round(b.h / 1.6));
    for (let r = 0; r < rows; r++) {
      const bh = b.h / rows;
      parts.push({ geo: G.box(b.w * (r % 2 ? 0.94 : 1), bh * 0.97, b.d * (r % 2 ? 1 : 0.94)), pos: [0, -b.h / 2 + (r + 0.5) * bh, 0], color: cols[(r + Math.round(Math.abs(b.x + b.z))) % cols.length] });
    }
    return { solid: parts, opts: { roughness: 0.6 } };
  },
  cloud(b) {
    // White marble with gold trim.
    return { solid: [{ geo: G.box(b.w, b.h * 0.86, b.d), pos: [0, 0, 0], color: '#f2efe8' },
                     { geo: G.box(b.w + 0.3, b.h * 0.07, b.d + 0.3), pos: [0, b.h * 0.465, 0], color: '#e8c46a' },
                     { geo: G.box(b.w + 0.3, b.h * 0.07, b.d + 0.3), pos: [0, -b.h * 0.465, 0], color: '#e8c46a' }], opts: { roughness: 0.4, metalness: 0.1 } };
  }
};
function buildCover(realm, boxes) {
  const all = [], glow = []; let opts = {};
  for (const b of boxes) {
    const st = COVER_STYLE[realm.id](b), at = p => ({ ...p, pos: [p.pos[0] + b.x, p.pos[1] + b.y, p.pos[2] + b.z] });
    all.push(...st.solid.map(at)); glow.push(...(st.glow || []).map(at)); opts = st.opts || {};
  }
  const g = new T.Group();
  g.add(solid(all, opts));
  if (glow.length) g.add(glowing(glow));
  return g;
}

// A power-up orb: a glowing shape with its name above it.
function buildOrb(type) {
  const g = new T.Group();
  const core = new T.Mesh(new T.IcosahedronGeometry(0.55, 1), new T.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.9, flatShading: true, roughness: 0.3 }));
  const ring = new T.Mesh(new T.TorusGeometry(0.95, 0.05, 6, 40), addMat(type.color, 0.9));
  const tag = labelSprite(type.name, { color: '#ffffff', bg: hexA(type.color, 0.65), height: 0.42 }); tag.position.y = 1.4;
  g.add(core, ring, glowSprite(type.color, 3.6, 0.6), tag);
  g.userData = { core, ring };
  return g;
}

// ------------------------------------------------------------------ hazards
// Each hazard: { group, update(dt, time, wild), disc(d, dt, game), body(pos, vel, dt) }.
const HAZARD_BUILD = {
  // Saucer Nebula: two gravity wells on the sidelines (mirror images). They bend throws and slingshot a close disc out.
  saucer() {
    const group = new T.Group(), wells = [-1, 1].map(s => {
      const c = new T.Vector3(32 * s, 22, 0), g = new T.Group(); g.position.copy(c);
      g.add(new T.Mesh(new T.SphereGeometry(1.5, 24, 16), new T.MeshBasicMaterial({ color: '#000000' })));
      const rim = new T.Mesh(new T.TorusGeometry(1.6, 0.12, 8, 48), addMat('#ff4fd8', 0.9));
      const disk = new T.Mesh(new T.RingGeometry(2, 8, 64), new T.MeshBasicMaterial({ map: swirlTex('accretion', 'rgba(255,230,180,1)', 'rgba(122,92,255,1)'), transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
      disk.rotation.x = -Math.PI / 2 + 0.35;
      const halo = glowSprite('#7a5cff', 16, 0.45);
      g.add(rim, disk, halo); group.add(g);
      return { c, g, rim, disk, halo, cool: 0 };
    });
    let R = 16;
    return {
      group,
      update(dt, t, wild) {
        R = wild ? 24 : 16;
        for (const w of wells) { w.disk.rotation.z += dt * (wild ? 2.4 : 1.1); w.rim.lookAt(0, w.c.y, 0); w.halo.scale.setScalar(wild ? 26 : 16 + Math.sin(t * 2) * 1.5); w.cool = Math.max(0, w.cool - dt); }
      },
      disc(d, dt, game) {
        for (const w of wells) {
          const to = tmp.subVectors(w.c, d.pos), dist = to.length();
          if (dist > R || dist < 1e-3) continue;
          if (dist < 2.4 && w.cool === 0) { // slingshot out, sideways around the hole
            const out = tmp2.crossVectors(to, UP).normalize();
            if (out.dot(d.vel) < 0) out.negate();
            d.vel.copy(out).multiplyScalar(Math.max(24, d.vel.length())).add(tmp3.copy(to).normalize().multiplyScalar(-6));
            d.pos.copy(w.c).addScaledVector(tmp3.copy(to).normalize(), -2.6);
            w.cool = 0.8; game.hazardPing(d.pos, 'sling');
            continue;
          }
          const k = 1 - dist / R, acc = 30 * k * k + 5 / dist;
          d.vel.addScaledVector(to.normalize(), Math.min(45, acc) * dt);
          d.vel.addScaledVector(tmp2.crossVectors(to, UP), acc * 0.35 * dt);
        }
      },
      body(pos, vel, dt) {
        for (const w of wells) {
          const to = tmp.subVectors(w.c, pos), dist = to.length();
          if (dist > R || dist < 1e-3) continue;
          if (dist < 3) vel.addScaledVector(to.normalize(), -30 * dt); // never get sucked in
          else { const k = 1 - dist / R; vel.addScaledVector(to.normalize(), 7 * k * k * dt); }
        }
      }
    };
  },

  // Iron Foundry: floor vents that glow, hiss, then blast everything above them upward.
  foundry() {
    const group = new T.Group();
    const sets = [{ spots: mirror4([{ x: 20, z: 24 }]), t: 4 }, { spots: [{ x: 36, z: 0 }, { x: -36, z: 0 }], t: 7 }];
    const vents = [];
    for (const set of sets) {
      set.timer = set.t; set.phase = 'idle'; set.vents = [];
      for (const sp of set.spots) {
        const g = new T.Group(); g.position.set(sp.x, 0.32, sp.z);
        g.add(solid([{ geo: G.cyl(3.4, 0.25, 32), pos: [0, 0, 0], color: '#2b2622' }, ...[-2, -1, 0, 1, 2].map(i => ({ geo: G.box(5.4, 0.3, 0.3), pos: [0, 0.1, i * 1.1], color: '#4a4440' }))], { metalness: 0.8, roughness: 0.4 }));
        const glow = new T.Mesh(new T.CircleGeometry(3.1, 32), new T.MeshBasicMaterial({ color: '#ff6a00', transparent: true, opacity: 0.15, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05;
        const col = new T.Mesh(new T.CylinderGeometry(2.6, 3.2, 32, 24, 1, true), new T.MeshBasicMaterial({ map: steamTex().clone(), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, fog: true }));
        col.material.map.wrapS = col.material.map.wrapT = T.RepeatWrapping; col.material.map.needsUpdate = true;
        col.position.y = 16;
        g.add(glow, col); group.add(g);
        const v = { c: new T.Vector3(sp.x, 0, sp.z), glow, col, set };
        set.vents.push(v); vents.push(v);
      }
    }
    return {
      group,
      update(dt, t, wild, game) {
        for (const set of sets) {
          set.timer -= dt * (wild ? 2.2 : 1);
          if (set.phase === 'idle' && set.timer <= 1.1) { set.phase = 'warn'; game.hazardPing(set.vents[0].c.clone().setY(2), 'hiss'); }
          if (set.phase === 'warn' && set.timer <= 0) { set.phase = 'blast'; set.timer = 1.7; game.hazardPing(set.vents[0].c.clone().setY(4), 'blast'); }
          else if (set.phase === 'blast' && set.timer <= 0) { set.phase = 'idle'; set.timer = 5 + Math.random() * 4; }
          for (const v of set.vents) {
            const warn = set.phase === 'warn' ? 0.35 + Math.abs(Math.sin(t * 14)) * 0.5 : 0, blast = set.phase === 'blast';
            v.glow.material.opacity = blast ? 0.9 : warn || 0.15;
            v.col.material.opacity += ((blast ? 0.75 : 0) - v.col.material.opacity) * Math.min(1, dt * 8);
            v.col.material.map.offset.y -= dt * 1.8;
          }
        }
      },
      lift(pos) { for (const v of vents) if (v.set.phase === 'blast' && Math.hypot(pos.x - v.c.x, pos.z - v.c.z) < 3.4 && pos.y < 34) return true; return false; },
      disc(d, dt) { if (this.lift(d.pos)) { d.vel.y += 70 * dt; d.vel.x *= Math.exp(-2 * dt); d.vel.z *= Math.exp(-2 * dt); } },
      body(pos, vel, dt) { if (this.lift(pos)) vel.y += 34 * dt; }
    };
  },

  // Moon Castle: portal twins on each half. The disc flies into one and out of its twin on the far side, same speed.
  castle() {
    const group = new T.Group(), pairs = [];
    for (const z of [20, -20]) {
      const pair = [-1, 1].map(s => {
        const c = new T.Vector3(36 * s, 16, z), n = new T.Vector3(-s, 0, 0), g = new T.Group();
        g.position.copy(c); g.lookAt(c.clone().add(n));
        const stone = solid(around(16, (i, a) => ({ geo: G.box(0.9, 0.7, 0.7), pos: [Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0], rot: [0, 0, a / DEG + 90], color: i % 2 ? '#5d6172' : '#6b6f80' })), { roughness: 0.95, flatShading: true });
        const swirl = new T.Mesh(new T.CircleGeometry(3, 48), new T.MeshBasicMaterial({ map: swirlTex('portal', 'rgba(220,240,255,1)', 'rgba(140,90,255,1)'), transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
        g.add(stone, swirl, glowSprite('#9f7bff', 12, 0.4)); group.add(g);
        return { c, n, g, swirl, base: c.clone() };
      });
      pairs.push(pair);
    }
    return {
      group,
      update(dt, t, wild) {
        for (const pair of pairs) for (const p of pair) {
          p.swirl.rotation.z += dt * (wild ? 4 : 1.6);
          p.c.y = p.base.y + (wild ? Math.sin(t * 0.9) * 8 : Math.sin(t * 0.4) * 2);
          p.g.position.copy(p.c);
        }
      },
      disc(d, dt, game, prev) {
        if (d.portalCool > 0) { d.portalCool -= dt; return; }
        for (const pair of pairs) for (let i = 0; i < 2; i++) {
          const a = pair[i], b = pair[1 - i];
          const d0 = tmp.subVectors(prev, a.c).dot(a.n), d1 = tmp.subVectors(d.pos, a.c).dot(a.n);
          if (!(d0 > 0 && d1 <= 0)) continue;
          tmp.subVectors(d.pos, a.c); tmp.x = 0;
          if (tmp.length() > 3) continue;
          d.pos.set(b.c.x + b.n.x * 0.6, b.c.y + tmp.y, b.c.z + tmp.z);
          d.portalCool = 0.5;
          game.hazardPing(d.pos, 'portal');
          return;
        }
      },
      // Riders go through too: fly into a portal and you come out of its twin, same speed and direction.
      prev: new Map(),
      body(pos, vel, dt, game, who) {
        const prev = this.prev.get(who);
        this.prev.set(who, { p: pos.clone(), cool: prev ? Math.max(0, prev.cool - dt) : 0 });
        if (!prev || prev.cool > 0) return;
        for (const pair of pairs) for (let i = 0; i < 2; i++) {
          const a = pair[i], b = pair[1 - i];
          const d0 = tmp.subVectors(prev.p, a.c).dot(a.n), d1 = tmp.subVectors(pos, a.c).dot(a.n);
          if (!(d0 > 0 && d1 <= 0)) continue;
          tmp.subVectors(pos, a.c); tmp.x = 0;
          if (tmp.length() > 3) continue;
          const offset = new T.Vector3(b.c.x + b.n.x * 1.4, b.c.y + tmp.y, b.c.z + tmp.z).sub(pos);
          if (who === 'player') game.teleportPlayer(offset); else pos.add(offset);
          this.prev.set(who, { p: pos.clone(), cool: 0.8 });
          if (game) game.hazardPing(pos.clone(), 'portal');
          return;
        }
      }
    };
  },

  // Dream Gym: trampolines on the floor launch the disc and riders sky-high.
  gym() {
    const group = new T.Group(), pads = [...mirror4([{ x: 18, z: 20 }]), { x: 0, z: 30 }, { x: 0, z: -30 }].map(sp => {
      const g = new T.Group(); g.position.set(sp.x, 0.32, sp.z);
      const mat = new T.Mesh(new T.CircleGeometry(3.6, 40), new T.MeshStandardMaterial({ map: padTex(), roughness: 0.8 }));
      mat.rotation.x = -Math.PI / 2; mat.position.y = 0.55;
      const frame = new T.Mesh(new T.TorusGeometry(3.8, 0.28, 10, 48), stdMat('#ff9ecf', { roughness: 0.5 })); frame.rotation.x = Math.PI / 2; frame.position.y = 0.55;
      g.add(solid(around(8, (i, a) => ({ geo: G.cyl(0.12, 0.6, 8), pos: [Math.cos(a) * 3.8, 0.25, Math.sin(a) * 3.8], color: '#bfc4cc' })), { metalness: 0.7, roughness: 0.3 }));
      g.add(mat, frame); group.add(g);
      return { c: new T.Vector3(sp.x, 0, sp.z), mat, frame, boing: 0 };
    });
    const onPad = pos => pads.find(p => Math.hypot(pos.x - p.c.x, pos.z - p.c.z) < 3.8);
    return {
      group,
      update(dt, t, wild) { for (const p of pads) { p.boing = Math.max(0, p.boing - dt * 3); const k = 1 - Math.sin(p.boing * Math.PI) * 0.5; p.mat.position.y = 0.55 * k; } this.wild = wild; },
      disc(d, dt, game) {
        if (d.pos.y > Y_MIN + DISC_R + 0.4 || d.vel.y > 2) return;
        const p = onPad(d.pos); if (!p) return;
        d.vel.y = Math.max(-d.vel.y * 1.3, this.wild ? 30 : 22); p.boing = 1;
        game.hazardPing(d.pos, 'boing');
      },
      body(pos, vel, dt, game) {
        if (pos.y > Y_MIN + 1.6 || vel.y > 2) return;
        const p = onPad(pos); if (!p) return;
        vel.y = Math.max(-vel.y, this.wild ? 20 : 15); p.boing = 1;
        if (game) game.hazardPing(pos, 'boing');
      }
    };
  },

  // Cloud Court: thick clouds drift around the field. The disc slows inside and you can hide in them.
  cloud() {
    const group = new T.Group(), rnd = seeded(77);
    const clouds = [];
    for (const [qx, qz, ph] of [[1, 1, 0], [-1, -1, 0], [-1, 1, 2.2], [1, -1, 2.2]]) {
      const parts = [];
      for (let i = 0; i < 9; i++) parts.push({ geo: G.ball(2.2 + rnd() * 1.6, 14, 10), pos: [(rnd() - 0.5) * 7, (rnd() - 0.5) * 2.5, (rnd() - 0.5) * 6], color: rnd() < 0.3 ? '#eef3fa' : '#ffffff' });
      const mesh = new T.Mesh(mergeParts(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.9, depthWrite: false }));
      group.add(mesh);
      clouds.push({ mesh, qx, qz, ph, c: new T.Vector3() });
    }
    return {
      group,
      update(dt, t, wild) {
        const sp = wild ? 0.5 : 0.16;
        for (const cl of clouds) {
          const a = t * sp + cl.ph;
          cl.c.set(cl.qx * (22 + Math.sin(a) * 12), 16 + Math.sin(a * 1.3) * 5, cl.qz * (24 + Math.cos(a) * 14));
          cl.mesh.position.copy(cl.c);
        }
      },
      inside(pos) { return clouds.some(cl => tmp.subVectors(pos, cl.c).multiply(tmp2.set(1 / 5, 1 / 3, 1 / 4.5)).lengthSq() < 1); },
      disc(d, dt) { if (this.inside(d.pos)) { const sp = d.vel.length(); if (sp > 6) d.vel.multiplyScalar(Math.max(6 / sp, Math.exp(-1.6 * dt))); } },
      body(pos, vel, dt) { if (this.inside(pos)) { vel.multiplyScalar(Math.exp(-0.8 * dt)); vel.y += 2 * dt; } }
    };
  }
};
