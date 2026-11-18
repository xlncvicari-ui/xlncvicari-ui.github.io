// The cinematic look (2026-11-18, from the owner's reference clip): darker and moodier, a warm key light, glossy surfaces that
// reflect strip lights, sunlight through blinds and leaves falling across the floor, black rider suits with neon team trim.
// Everything here is baked once (textures and reflection maps), so it adds no draw calls and almost no work per frame.

// Per realm: sky = a tint over the painted sky (golden-hour grade), fog = [thickness, brightness] multipliers (thinner, darker haze = deeper shadows and clearer distance), ambient = how much of the old fill light stays (lower = more contrast), key = sun strength, warm = how far the sun
// tints toward golden hour, sunTint = that golden color, patch = color and strength of the light falling on the floor, floorRough = floor gloss,
// env = the room the shiny surfaces reflect: base brightness, strip-light color, window glow.
const LOOK = {
  saucer: { sky: '#ffffff', fog: [0.7, 0.7], ambient: 0.4, key: 1.5, warm: 0.15, sunTint: '#ffd7b0', patch: ['#9fe8ff', 0.22], floorRough: 0.35, env: { base: 0.22, strip: '#66ffff', window: '#b9a6ff' } },
  foundry: { sky: '#d8c4b8', fog: [0.55, 0.55], ambient: 0.4, key: 1.6, warm: 0.4, sunTint: '#ffb36b', patch: ['#ffc38a', 0.4], floorRough: 0.5, env: { base: 0.3, strip: '#ff8a1f', window: '#ffc38a' } },
  castle: { sky: '#ffffff', fog: [0.7, 0.7], ambient: 0.45, key: 1.5, warm: 0.0, sunTint: '#cfd8ff', patch: ['#c4d4ff', 0.25], floorRough: 0.75, env: { base: 0.2, strip: '#c9d6ff', window: '#9fb0ff' } },
  gym: { sky: '#cdb6bf', fog: [0.4, 0.7], ambient: 0.32, key: 1.6, warm: 0.35, sunTint: '#ffd6a0', patch: ['#ffe2b8', 0.4], floorRough: 0.4, env: { base: 0.55, strip: '#ff7ab8', window: '#fff1dc' } },
  cloud: { sky: '#d2bfa4', fog: [0.45, 0.72], ambient: 0.32, key: 1.7, warm: 0.5, sunTint: '#ffd9a8', patch: ['#fff0c8', 0.35], floorRough: 0.9, env: { base: 0.5, strip: '#ffffff', window: '#fff6d8' } }
};

// The room the shiny things reflect: dark walls in the realm's color, two strip lights all the way round, a bright window
// and a soft ceiling panel. Turned into a reflection map once per realm.
function envTexture(realm) {
  const L = LOOK[realm.id].env;
  const tex = canvasTexture(512, 256, (g, w, h) => {
    const fog = new T.Color(realm.fog), dark = fog.clone().multiplyScalar(L.base), floor = fog.clone().multiplyScalar(L.base * 0.35);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#' + dark.clone().multiplyScalar(0.6).getHexString()); grd.addColorStop(0.5, '#' + dark.getHexString()); grd.addColorStop(1, '#' + floor.getHexString());
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // Ceiling panel
    const cp = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.45);
    cp.addColorStop(0, 'rgba(255,248,236,0.55)'); cp.addColorStop(1, 'rgba(255,248,236,0)');
    g.fillStyle = cp; g.fillRect(0, 0, w, h * 0.45);
    // Windows: warm bright rectangles cut by blind slats
    for (const x0 of [0.08, 0.58]) {
      g.fillStyle = L.window; g.globalAlpha = 0.9; g.fillRect(x0 * w, h * 0.3, w * 0.2, h * 0.24);
      g.globalAlpha = 1; g.fillStyle = '#' + dark.getHexString();
      for (let y = h * 0.3; y < h * 0.54; y += 7) g.fillRect(x0 * w, y, w * 0.2, 3);
    }
    // Strip lights
    g.fillStyle = L.strip; g.shadowColor = L.strip; g.shadowBlur = 6;
    g.fillRect(0, h * 0.2, w, 3); g.fillRect(0, h * 0.62, w, 2);
    g.shadowBlur = 0;
  });
  tex.mapping = T.EquirectangularReflectionMapping;
  return tex;
}

// Builds the reflection maps for every realm up front (before VR starts), so switching realms in the headset costs nothing.
function buildEnvMaps(renderer) {
  const maps = {}, pm = new T.PMREMGenerator(renderer), xrOn = renderer.xr.enabled;
  renderer.xr.enabled = false;
  try {
    for (const r of REALMS) { const src = envTexture(r); maps[r.id] = pm.fromEquirectangular(src).texture; src.dispose(); }
  } finally { renderer.xr.enabled = xrOn; pm.dispose(); }
  return maps;
}

// Light falling on the floor: three pools of sunlight through window blinds, broken up by leaf shadows, plus a few flecks
// of light through foliage. Drawn into the floor itself (its glow map, tinted per realm), so it costs no extra draw call.
let patchTex = null;
function floorLightTexture() {
  if (patchTex) return patchTex;
  patchTex = canvasTexture(1024, 1024, (g, w, h) => {
    const rnd = seeded(23), slant = -0.55; // every pool falls at the same angle, like one sun
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const pools = [[0.3, 0.32, 300, 210], [0.7, 0.66, 300, 210], [0.68, 0.24, 190, 150], [0.32, 0.76, 190, 150]];
    for (const [px, py, pw, ph] of pools) {
      g.save(); g.translate(px * w, py * h); g.rotate(slant);
      // soft-edged window shape
      const lay = document.createElement('canvas'); lay.width = pw * 2; lay.height = ph * 2;
      const l = lay.getContext('2d');
      l.fillStyle = '#fff';
      for (let y = 0; y < ph * 2; y += 15) l.fillRect(0, y, pw * 2, 9); // blind slats
      l.globalCompositeOperation = 'destination-in';
      const m = l.createRadialGradient(pw, ph, Math.min(pw, ph) * 0.35, pw, ph, Math.max(pw, ph));
      m.addColorStop(0, 'rgba(255,255,255,1)'); m.addColorStop(1, 'rgba(255,255,255,0)');
      l.fillStyle = m; l.fillRect(0, 0, pw * 2, ph * 2);
      g.filter = 'blur(2px)'; g.drawImage(lay, -pw, -ph); g.filter = 'none';
      g.restore();
    }
    // Leaf shadows across the pools
    g.save(); g.globalCompositeOperation = 'destination-out'; g.filter = 'blur(3px)';
    for (let c = 0; c < 26; c++) {
      const cx = rnd() * w, cy = rnd() * h, n = 6 + Math.floor(rnd() * 10);
      for (let i = 0; i < n; i++) {
        const x = cx + (rnd() - 0.5) * 70, y = cy + (rnd() - 0.5) * 70, s = 6 + rnd() * 14;
        g.fillStyle = `rgba(0,0,0,${0.55 + rnd() * 0.4})`;
        g.beginPath(); g.ellipse(x, y, s, s * 0.45, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // Flecks of sun through foliage
    for (let i = 0; i < 70; i++) {
      const x = w * (0.15 + rnd() * 0.7), y = h * (0.15 + rnd() * 0.7), s = 4 + rnd() * 10;
      const fg = g.createRadialGradient(x, y, 0, x, y, s); fg.addColorStop(0, 'rgba(255,255,255,0.55)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fg; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    g.filter = 'none';
  });
  return patchTex;
}

// Thin strip lights along the bottom of every cover block (like cove lighting), added into the cover's glow mesh.
function coverStrips(b, color) {
  const e = 0.05, hw = b.w / 2, hh = b.h / 2, hd = b.d / 2, y = -hh + 0.12, out = 0.02;
  return [{ geo: G.box(b.w + out * 2, e, e), pos: [0, y, hd + out], color }, { geo: G.box(b.w + out * 2, e, e), pos: [0, y, -hd - out], color },
          { geo: G.box(e, e, b.d + out * 2), pos: [hw + out, y, 0], color }, { geo: G.box(e, e, b.d + out * 2), pos: [-hw - out, y, 0], color },
          { geo: G.box(b.w * 0.9, e * 0.8, e * 0.8), pos: [0, hh + 0.01, hd + out], color }, { geo: G.box(b.w * 0.9, e * 0.8, e * 0.8), pos: [0, hh + 0.01, -hd - out], color }];
}
