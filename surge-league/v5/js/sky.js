// Version 5 backdrops, drawn like painted animation cels: flat color shapes with hard edges, bold planets, sparkle stars.
// One sky sphere, one or two planets, the aurora (one mesh with a tiny shader), and per-level extras. All cheap for the headset.

// ------------------------------------------------------------------ painted skies (2048 x 1024, wrapped round a sphere)
function sparkle(g, x, y, r, color) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.18 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.fill();
}
function blobBand(g, w, h, rnd, colors, y0, amp, count, size) {
  // layered cloud banks with hard edges: each layer is a row of overlapping circles in one flat color
  colors.forEach((c, layer) => {
    g.fillStyle = c;
    for (let i = 0; i < count; i++) {
      const x = (i / count) * w + rnd() * 60, y = h * y0 + Math.sin(x / w * Math.PI * 2 * (1 + layer)) * h * amp + layer * size * 0.45 + (rnd() - 0.5) * size;
      g.beginPath(); g.arc(x, y, size * (0.5 + rnd() * 0.8), 0, 7); g.fill();
      if (x < size * 2) { g.beginPath(); g.arc(x + w, y, size, 0, 7); g.fill(); }
    }
  });
}
const SKY_PAINT = {
  orbit(g, w, h, rnd) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#07182a'); bg.addColorStop(0.45, '#0e3a4a'); bg.addColorStop(0.62, '#1d5a5a'); bg.addColorStop(1, '#0a1620');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    blobBand(g, w, h, rnd, ['#12495a', '#1a6466', '#e09a4a22'], 0.56, 0.05, 46, 54);
    for (let i = 0; i < 1500; i++) { const s = rnd(); g.fillStyle = s > 0.9 ? '#ffe9c0' : '#ffffff'; g.globalAlpha = 0.35 + rnd() * 0.65; g.fillRect(rnd() * w, rnd() * h, s > 0.96 ? 2.4 : 1.3, s > 0.96 ? 2.4 : 1.3); }
    g.globalAlpha = 1; for (let i = 0; i < 40; i++) sparkle(g, rnd() * w, rnd() * h * 0.9, 5 + rnd() * 9, i % 3 ? '#ffffff' : '#ffd9a0');
  },
  neon(g, w, h, rnd) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0a0620'); bg.addColorStop(0.5, '#241056'); bg.addColorStop(1, '#090418');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    blobBand(g, w, h, rnd, ['#3a1a7a', '#6a1f9a', '#c0309a55'], 0.42, 0.09, 40, 70);
    blobBand(g, w, h, rnd, ['#143a7a', '#1f6ab0aa'], 0.66, 0.06, 36, 46);
    for (let i = 0; i < 1400; i++) { g.fillStyle = rnd() > 0.8 ? '#9ff6ff' : '#ffffff'; g.globalAlpha = 0.3 + rnd() * 0.7; g.fillRect(rnd() * w, rnd() * h, 1.4, 1.4); }
    g.globalAlpha = 1; for (let i = 0; i < 46; i++) sparkle(g, rnd() * w, rnd() * h * 0.92, 4 + rnd() * 10, i % 2 ? '#ff9ae6' : '#9ff6ff');
  },
  ember(g, w, h, rnd) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#160806'); bg.addColorStop(0.5, '#4a160c'); bg.addColorStop(0.7, '#7a2a10'); bg.addColorStop(1, '#120604');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    blobBand(g, w, h, rnd, ['#5a1c0e', '#8a3412', '#d9642288'], 0.6, 0.05, 44, 60);
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() > 0.6 ? '#ffb347' : '#fff0d0'; g.globalAlpha = 0.25 + rnd() * 0.6; g.fillRect(rnd() * w, rnd() * h, 1.6, 1.6); }
    g.globalAlpha = 1; for (let i = 0; i < 24; i++) sparkle(g, rnd() * w, rnd() * h * 0.8, 4 + rnd() * 8, '#ffd9a0');
  },
  // The Endless Chasm: almost black violet, with faint shards of polygon light.
  abyss(g, w, h, rnd) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0c0724'); bg.addColorStop(0.5, '#150b38'); bg.addColorStop(1, '#0c0724');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cols = ['#7ff6ff', '#ff9ae6', '#c8b6ff'];
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, s = 10 + rnd() * 46, n = 3 + Math.floor(rnd() * 4), a0 = rnd() * 7;
      g.strokeStyle = cols[i % 3]; g.globalAlpha = 0.08 + rnd() * 0.2; g.lineWidth = 1.5; g.beginPath();
      for (let k = 0; k <= n; k++) g.lineTo(x + Math.cos(a0 + k / n * Math.PI * 2) * s, y + Math.sin(a0 + k / n * Math.PI * 2) * s * 0.8);
      g.stroke();
    }
    g.globalAlpha = 1; for (let i = 0; i < 30; i++) sparkle(g, rnd() * w, rnd() * h, 3 + rnd() * 6, cols[i % 3]);
  },
  // Sky Gardens: a soft morning sky, deep teal overhead down to peach, with banks of cloud in flat cel colors.
  garden(g, w, h, rnd) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#123a5a'); bg.addColorStop(0.3, '#2f7f9a'); bg.addColorStop(0.5, '#8fd0c8'); bg.addColorStop(0.62, '#ffd9b8'); bg.addColorStop(0.8, '#e8a8a0'); bg.addColorStop(1, '#3a5a7a');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    blobBand(g, w, h, rnd, ['#ffffffcc', '#ffeedd', '#ffc8b8aa'], 0.6, 0.035, 40, 58);
    blobBand(g, w, h, rnd, ['#ffffff88', '#d8f4f0aa'], 0.4, 0.05, 26, 40);
    blobBand(g, w, h, rnd, ['#f6b8c8aa', '#c890b8aa'], 0.78, 0.04, 34, 66);
    for (let i = 0; i < 260; i++) { g.fillStyle = '#ffffff'; g.globalAlpha = 0.25 + rnd() * 0.5; g.fillRect(rnd() * w, rnd() * h * 0.28, 1.5, 1.5); }
    g.globalAlpha = 1; for (let i = 0; i < 12; i++) sparkle(g, rnd() * w, rnd() * h * 0.25, 4 + rnd() * 6, '#ffffff');
  },
  // The Carousel: dusk. Plum overhead, a band of orange and gold, lantern-colored clouds.
  dusk(g, w, h, rnd) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1a1036'); bg.addColorStop(0.36, '#5a2a6a'); bg.addColorStop(0.52, '#e0705a'); bg.addColorStop(0.6, '#ffc870'); bg.addColorStop(0.72, '#8a3a5a'); bg.addColorStop(1, '#1a1030');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    blobBand(g, w, h, rnd, ['#7a3a7a', '#c0506a', '#ffb070aa'], 0.56, 0.04, 42, 56);
    blobBand(g, w, h, rnd, ['#3a2058', '#5a2a6aaa'], 0.36, 0.06, 30, 60);
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() > 0.7 ? '#ffe9c0' : '#ffffff'; g.globalAlpha = 0.3 + rnd() * 0.6; g.fillRect(rnd() * w, rnd() * h * 0.4, 1.4, 1.4); }
    g.globalAlpha = 1; for (let i = 0; i < 26; i++) sparkle(g, rnd() * w, rnd() * h * 0.36, 4 + rnd() * 8, i % 2 ? '#ffe9c0' : '#ffffff');
  },
  void(g, w, h) { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2a2410'); bg.addColorStop(1, '#161208'); g.fillStyle = bg; g.fillRect(0, 0, w, h); },
  prism(g, w, h, rnd) {
    g.fillStyle = '#05040c'; g.fillRect(0, 0, w, h);
    // a kaleidoscope: the same wedge of light repeated all the way round
    const cols = ['#7ff6ff', '#c8b6ff', '#ff9ae6', '#ffffff'];
    for (let k = 0; k < 24; k++) {
      const x0 = k * w / 24;
      for (let i = 0; i < 14; i++) {
        const sr = seeded(i * 7 + 3), y = h * (0.08 + sr() * 0.84), len = 20 + sr() * 60;
        g.strokeStyle = cols[i % 4]; g.globalAlpha = 0.25 + sr() * 0.5; g.lineWidth = 1.5 + sr() * 2;
        g.beginPath(); g.moveTo(x0 + (k % 2 ? w / 24 - sr() * 60 : sr() * 60), y); g.lineTo(x0 + (k % 2 ? w / 24 - sr() * 60 - len : sr() * 60 + len), y + (sr() - 0.5) * 50); g.stroke();
      }
    }
    g.globalAlpha = 1; for (let i = 0; i < 60; i++) sparkle(g, rnd() * w, rnd() * h, 3 + rnd() * 7, cols[i % 4]);
  }
};
function paintSky(key) { return canvasTexture(2048, 1024, (g, w, h) => SKY_PAINT[key](g, w, h, seeded(key.length * 97 + 5))); }

// A planet drawn in flat bands with a hard shadow edge (toon material does the day/night line).
function planetMesh(r, bands, seg = 48) {
  const tex = canvasTexture(512, 256, (g, w, h) => {
    const rnd = seeded(bands.length * 13 + r);
    let y = 0;
    while (y < h) { const bh = 8 + rnd() * 34; g.fillStyle = bands[Math.floor(rnd() * bands.length)]; g.fillRect(0, y, w, bh + 1); y += bh; }
    g.globalAlpha = 0.5; for (let i = 0; i < 26; i++) { g.fillStyle = bands[i % bands.length]; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 60, 4 + rnd() * 9, 0, 0, 7); g.fill(); }
  });
  return new T.Mesh(new T.SphereGeometry(r, seg, Math.round(seg * 0.6)), new T.MeshToonMaterial({ map: tex, gradientMap: toonGradient(), fog: false }));
}
function ringMesh(r0, r1, color) {
  const tex = canvasTexture(256, 8, (g, w, h) => { for (let x = 0; x < w; x++) { const s = seeded(x * 3 + 1)(); g.fillStyle = color; g.globalAlpha = s > 0.25 ? 0.25 + s * 0.6 : 0; g.fillRect(x, 0, 1, h); } });
  const geo = new T.RingGeometry(r0, r1, 96, 1), uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - r0) / (r1 - r0), 0.5);
  return new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, depthWrite: false, fog: false, toneMapped: false }));
}

// ------------------------------------------------------------------ the aurora: curtains of light round the level (one mesh)
function auroraMesh(radius, y0, height, colors) {
  const geo = new T.CylinderGeometry(radius, radius * 1.08, height, 120, 1, true), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + Math.sin(a * 5) * 0.08 + Math.sin(a * 11 + 1) * 0.04; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  const mat = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, c0: { value: new T.Color(colors[0]) }, c1: { value: new T.Color(colors[1]) }, power: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; uniform vec3 c0; uniform vec3 c1; uniform float power; varying vec2 vUv;
      void main() {
        float x = vUv.x * 6.2832;
        float fold = sin(x * 9.0 + time * 0.35 + sin(x * 3.0 - time * 0.21) * 2.2) * 0.5 + 0.5;
        float rays = sin(x * 70.0 + sin(x * 13.0 + time * 0.5) * 3.0) * 0.5 + 0.5;
        float curtain = pow(fold, 2.2) * (0.55 + 0.45 * rays);
        float fade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y));
        float gate = smoothstep(0.25, 0.6, sin(x * 2.0 + time * 0.07) * 0.5 + 0.5);
        vec3 col = mix(c0, c1, smoothstep(0.1, 0.9, vUv.y));
        gl_FragColor = vec4(col * curtain * fade * gate * power, 1.0);
      }`,
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.BackSide, fog: false, toneMapped: false
  });
  const m = new T.Mesh(geo, mat); m.position.y = y0 + height / 2; m.renderOrder = -1; m.frustumCulled = false;
  return m;
}
// An aurora shard (the thing you fly through for a team buff): a soft painted ribbon that always faces you.
let shardTex = null;
function shardTexture() {
  return shardTex || (shardTex = canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const x = w * (0.2 + i * 0.15), gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, h / 2 + (i % 2 ? 14 : -14), 9 + i * 2, h * 0.42, 0, 0, 7); g.fill();
    }
  }));
}
function shardSprite(color) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: shardTexture(), color, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false }));
  s.scale.set(2.2, 4.2, 1);
  return s;
}

// ------------------------------------------------------------------ putting a backdrop together for a level
function buildBackdrop(scene, level) {
  const th = level.theme, group = new T.Group(), B = WORLD.bounds, updates = [];
  const skyTex = paintSky(th.sky);
  const sky = new T.Mesh(new T.SphereGeometry(1500, 48, 24), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -3; group.add(sky);
  if (th.sky === 'orbit') {
    const giant = planetMesh(520, ['#e8a04a', '#c9742e', '#f2c27a', '#a8551f', '#f6dca8']); giant.position.set(-160, -760, -240); giant.rotation.z = 0.35; group.add(giant);
    const ring = ringMesh(640, 900, '#f6dca8'); ring.position.copy(giant.position); ring.rotation.set(1.25, 0.2, 0.35); group.add(ring);
    const moon = planetMesh(60, ['#7fd0e8', '#4aa0c8', '#b6ecff']); moon.position.set(520, 260, -700); group.add(moon);
    const sun = glowSprite('#ffe2b0', 220, 0.95); sun.position.set(840, 700, -840); group.add(sun);
    updates.push(dt => { giant.rotation.y += dt * 0.004; });
  } else if (th.sky === 'neon') {
    const planet = planetMesh(300, ['#6a3ad0', '#9a5cff', '#4a22a0', '#c89aff']); planet.position.set(520, 200, -820); planet.rotation.z = -0.4; group.add(planet);
    const ring = ringMesh(380, 620, '#ff9ae6'); ring.position.copy(planet.position); ring.rotation.set(1.1, 0.4, -0.3); group.add(ring);
    const small = planetMesh(70, ['#3df0ff', '#1fa0d0', '#b6ffff']); small.position.set(-640, -300, 500); group.add(small);
    updates.push(dt => { ring.rotation.z += dt * 0.01; });
  } else if (th.sky === 'ember') {
    const sun = planetMesh(420, ['#ff5a1a', '#ff8a2a', '#ffb347', '#e03c10']); sun.material = new T.MeshBasicMaterial({ map: sun.material.map, fog: false, toneMapped: false }); sun.position.set(240, 380, -1050); group.add(sun);
    const glow = glowSprite('#ff7a2a', 1500, 0.55); glow.position.copy(sun.position); glow.renderOrder = -2; group.add(glow);
    const rock = planetMesh(90, ['#5a3a30', '#7a4a38', '#3a2620']); rock.position.set(-560, 120, 520); group.add(rock);
    // embers drifting up through the works
    const n = 260, pos = new Float32Array(n * 3), rnd = seeded(8);
    for (let i = 0; i < n; i++) pos.set([B.min.x + rnd() * (B.max.x - B.min.x), B.min.y + rnd() * (B.max.y - B.min.y), B.min.z + rnd() * (B.max.z - B.min.z)], i * 3);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ size: 0.35, map: dotTexture(), color: '#ffb347', transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false })); pts.frustumCulled = false; group.add(pts);
    updates.push(dt => { const p = geo.attributes.position; for (let i = 0; i < n; i++) { let y = p.getY(i) + dt * (1.5 + (i % 5) * 0.5); if (y > B.max.y) y = B.min.y; p.setY(i, y); } p.needsUpdate = true; });
    updates.push(dt => { sun.rotation.y += dt * 0.01; });
  } else if (th.sky === 'garden') {
    const world = planetMesh(620, ['#3f9a8a', '#58b89a', '#2f7f9a', '#e8f4ee', '#7fc8a8', '#ffffff']); world.position.set(180, -900, -200); world.rotation.z = 0.2; group.add(world);
    const moon = planetMesh(80, ['#ffd9c8', '#f6b8c8', '#ffeedd']); moon.position.set(-560, 420, -640); group.add(moon);
    const sun = glowSprite('#fff2d0', 300, 0.95); sun.position.set(700, 620, -560); group.add(sun);
    updates.push(dt => { world.rotation.y += dt * 0.003; });
  } else if (th.sky === 'dusk') {
    const planet = planetMesh(340, ['#ffb070', '#e0705a', '#ffd9a0', '#c0506a']); planet.position.set(-480, 120, -860); planet.rotation.z = 0.3; group.add(planet);
    const ring = ringMesh(430, 660, '#ffe9c0'); ring.position.copy(planet.position); ring.rotation.set(1.2, -0.3, 0.3); group.add(ring);
    const sun = glowSprite('#ffc870', 380, 0.9); sun.position.set(-760, 60, 760); group.add(sun);
    updates.push(dt => { ring.rotation.z += dt * 0.008; });
  } else if (th.sky === 'prism' || th.sky === 'abyss') {
    // the mirrored shell: a twelve-sided frame, then the same frame again and again further out, fading (the "reflections")
    const frame = r => new T.LineSegments(new T.EdgesGeometry(new T.DodecahedronGeometry(r, 0)), new T.LineBasicMaterial({ color: '#c8b6ff', transparent: true, opacity: 1, toneMapped: false, fog: false }));
    const span = Math.max(B.max.x, B.max.z, th.sky === 'abyss' ? 0 : B.max.y) * (th.sky === 'abyss' ? 2.2 : 1.35);
    const shells = [1, 1.5, 2.2, 3.2, 4.6, 6.6].map((k, i) => { const f = frame(span * k); f.material.opacity = 0.9 / (1 + i * 0.9); f.material.color.set(i % 2 ? '#7ff6ff' : '#c8b6ff'); f.position.y = (B.min.y + B.max.y) / 2; f.rotation.set(i * 0.31, i * 0.52, 0); group.add(f); return f; });
    updates.push(dt => shells.forEach((f, i) => { f.rotation.y += dt * 0.02 * (i % 2 ? 1 : -1) / (1 + i * 0.4); f.rotation.x += dt * 0.008; }));
  } else if (th.sky === 'void') {
    // more rooms beyond the walls, forever: rows of dim ceiling lights fading into the haze
    const n = 400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const gx = (i % 20) - 10, gz = Math.floor(i / 20) - 10; pos.set([gx * 14 + 7, B.max.y - 0.6, gz * 14 + 7], i * 3); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ size: 3.2, map: dotTexture(), color: '#fff6b8', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false })); pts.frustumCulled = false; group.add(pts);
  }
  let aurora = null;
  if (th.sky !== 'void' && th.sky !== 'prism' && th.sky !== 'abyss') {
    const span = Math.max(B.max.x - B.min.x, B.max.z - B.min.z);
    aurora = auroraMesh(span * 0.95, B.max.y - 10, span * 0.9, th.aurora); group.add(aurora);
    const inner = auroraMesh(span * 0.72, B.max.y + 30, span * 0.5, [th.aurora[1], th.aurora[0]]); inner.material.uniforms.power.value = 0.6; group.add(inner);
    updates.push((dt, t) => { aurora.material.uniforms.time.value = t; inner.material.uniforms.time.value = t * 1.3 + 9; });
  }
  // What shiny things reflect. The Mirror Vault's sky is nearly black, so its mirrors get a picture of bright light panels instead;
  // the Backrooms reflect a plain warm room.
  let envTex = null;
  if (th.sky === 'prism' || th.sky === 'abyss') envTex = canvasTexture(1024, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1a1440'); bg.addColorStop(0.4, '#40358f'); bg.addColorStop(0.5, '#cfc6ff'); bg.addColorStop(0.6, '#2c5f8a'); bg.addColorStop(1, '#0e0b24');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const rnd = seeded(77), cols = ['#7ff6ff', '#ff9ae6', '#ffffff', '#c8b6ff', '#fff2b0'];
    for (let i = 0; i < 70; i++) { g.fillStyle = cols[i % 5]; g.globalAlpha = 0.45 + rnd() * 0.5; g.fillRect(rnd() * w, h * (0.08 + rnd() * 0.84), 10 + rnd() * 50, 5 + rnd() * 30); }
    g.globalAlpha = 1;
  });
  else if (th.sky === 'void') envTex = canvasTexture(256, 128, (g, w, h) => { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#fff6c8'); bg.addColorStop(0.5, '#d9c877'); bg.addColorStop(1, '#6a5a2a'); g.fillStyle = bg; g.fillRect(0, 0, w, h); });
  scene.add(group);
  return { group, skyTex, envTex, sky, update(dt, t) { for (const u of updates) u(dt, t); } };
}
