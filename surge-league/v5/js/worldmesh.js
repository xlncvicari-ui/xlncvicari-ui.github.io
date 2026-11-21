// Version 5 level meshes: what js/world.js worked out, drawn. A handful of merged meshes per level (walls, floors, see-through
// walls, light strips, goals), so a whole station costs the headset about a dozen draw calls.
//
// 2026-11-21, "less blocky, more natural":
// - room edges are drawn as COVES (curved, or a few facets), and windows and doorways have rounded corners and a lit frame;
// - walls are shaded per corner of a 5 m grid (darker into the room's corners, with slow painterly drift), so a wall is no
//   longer one flat tone; coves blend from the floor's color into the wall's;
// - the hull is painted as curved shell plates, the floor as sweeping arcs, the see-through walls as veined membrane
//   (like a dragonfly wing) instead of square panes;
// - free-standing blocks are rounded; ORBS are lumpy rocks with moss, strata and small trees; MOVERS are twelve-sided discs.

// ------------------------------------------------------------------ textures painted for the level look
const WTEX = {};
function wtex(key, w, h, paint, opts = {}) {
  if (WTEX[key]) return WTEX[key];
  const t = canvasTexture(w, h, paint);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  if (opts.nearest) { t.magFilter = T.NearestFilter; }
  return (WTEX[key] = t);
}
// Draws something at (x, y) and again wrapped round the edges, so the picture tiles.
function tiled(w, h, x, y, r, draw) { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) if (x + ox > -r && x + ox < w + r && y + oy > -r && y + oy < h + r) draw(x + ox, y + oy); }
// Hull: pale shell plates with a few long curved seams (each a dark line with a light edge under it), and soft mottling.
const shellArt = () => wtex('shell', 512, 512, (g, w, h) => {
  g.fillStyle = '#f3f3f3'; g.fillRect(0, 0, w, h);
  const rnd = seeded(31);
  for (let i = 0; i < 30; i++) {
    const x = rnd() * w, y = rnd() * h, r = 50 + rnd() * 110, dark = rnd() > 0.45;
    tiled(w, h, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, dark ? 'rgba(40,50,80,0.075)' : 'rgba(255,255,255,0.5)'); gr.addColorStop(1, dark ? 'rgba(40,50,80,0)' : 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); });
  }
  const wave = (across, base, amp, k, ph, ph2) => t => base + amp * Math.sin(Math.PI * 2 * k * t / across + ph) + amp * 0.35 * Math.sin(Math.PI * 2 * 3 * t / across + ph2);
  const seam = (fn, vertical, off, style, width) => { g.strokeStyle = style; g.lineWidth = width; g.beginPath(); for (let t = -8; t <= w + 8; t += 8) { const o = fn(t) + off; if (vertical) g.lineTo(o, t); else g.lineTo(t, o); } g.stroke(); };
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const fn = wave(w, h * (i + 0.5) / 3, 14 + rnd() * 22, 1 + (i % 2), rnd() * 6, rnd() * 6); seam(fn, false, 5, 'rgba(255,255,255,0.75)', 4); seam(fn, false, 0, 'rgba(34,40,58,0.62)', 5); }
  for (let i = 0; i < 2; i++) { const fn = wave(h, w * (i + 0.5) / 2, 16 + rnd() * 18, 1, rnd() * 6, rnd() * 6); seam(fn, true, 4, 'rgba(255,255,255,0.6)', 3); seam(fn, true, 0, 'rgba(34,40,58,0.42)', 3.5); }
  g.fillStyle = 'rgba(34,40,58,0.5)';
  for (let i = 0; i < 16; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
});
// Floors: wide arcs that sweep from tile to tile (circles round the tile's corners and middle), plus a fine grain.
const deckArt = () => wtex('deck', 512, 512, (g, w, h) => {
  g.fillStyle = '#eeeeee'; g.fillRect(0, 0, w, h);
  const rnd = seeded(12);
  for (let i = 0; i < 3500; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.25)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  for (let i = 0; i < 14; i++) { const x = rnd() * w, y = rnd() * h, r = 60 + rnd() * 120; tiled(w, h, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(20,30,50,0.1)'); gr.addColorStop(1, 'rgba(20,30,50,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); }
  const ring = (x, y, r, style, lw) => { g.strokeStyle = style; g.lineWidth = lw; tiled(w, h, x, y, r + lw, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, 7); g.stroke(); }); };
  ring(0, 0, w * 0.5, 'rgba(24,30,46,0.5)', 5); ring(0, 0, w * 0.5 - 7, 'rgba(255,255,255,0.5)', 3);
  ring(0, 0, w * 0.3, 'rgba(24,30,46,0.3)', 3); ring(w / 2, h / 2, w * 0.2, 'rgba(24,30,46,0.42)', 4); ring(w / 2, h / 2, w * 0.2 - 6, 'rgba(255,255,255,0.45)', 2.5);
  ring(w / 2, h / 2, w * 0.07, 'rgba(24,30,46,0.3)', 8);
});
// See-through walls: a veined membrane (the edges between scattered cells), cut-out rather than blended so it costs almost
// nothing, with two glints so it still reads as glass.
const veinArt = () => wtex('vein', 256, 256, (g, w, h) => {
  const rnd = seeded(77), pts = Array.from({ length: 8 }, () => [rnd(), rnd()]), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h; let d1 = 9, d2 = 9;
    for (const [px, py] of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { const d = Math.hypot(u - px - ox, v - py - oy); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    const e = d2 - d1, o = (y * w + x) * 4, a = e < 0.007 ? 255 : e < 0.014 ? 255 * (0.014 - e) / 0.007 : 0;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 96); g.lineTo(84, 52); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(176, 208); g.lineTo(208, 176); g.stroke();
});
// The Endless Chasm's false walls: a drifting screen of triangles you can fly straight through.
const veilArt = () => wtex('veil', 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); const rnd = seeded(5);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    if (rnd() < 0.3) continue;
    const x = i * 32 + (j % 2 ? 16 : 0), y = j * 32, up = rnd() > 0.5;
    g.fillStyle = `rgba(255,255,255,${0.55 + rnd() * 0.45})`; g.beginPath();
    if (up) { g.moveTo(x + 3, y + 29); g.lineTo(x + 16, y + 3); g.lineTo(x + 29, y + 29); } else { g.moveTo(x + 3, y + 3); g.lineTo(x + 29, y + 3); g.lineTo(x + 16, y + 29); }
    g.fill();
  }
});
// The Backrooms: tired yellow wallpaper with a skirting board, damp carpet, and ceiling tiles with humming light panels.
const wallpaperArt = () => wtex('wallpaper', 512, 512, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const rnd = seeded(5);
  for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(90,70,10,0.07)'; g.fillRect(x, 0, 30, h); }
  g.strokeStyle = 'rgba(90,70,10,0.2)'; g.lineWidth = 3;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const x = i * 64 + (j % 2 ? 32 : 0) + 15, y = j * 60 + 26; g.beginPath(); g.moveTo(x - 9, y + 6); g.lineTo(x, y - 6); g.lineTo(x + 9, y + 6); g.stroke(); }
  for (let i = 0; i < 7; i++) { const x = rnd() * w, y = rnd() * h * 0.8, r = 40 + rnd() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(70,50,0,0.12)'); gr.addColorStop(1, 'rgba(70,50,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.fillStyle = 'rgba(60,45,10,0.5)'; g.fillRect(0, h - 30, w, 30); g.fillStyle = 'rgba(40,30,5,0.6)'; g.fillRect(0, h - 34, w, 5);
  g.fillStyle = 'rgba(60,45,10,0.3)'; g.fillRect(0, 0, w, 8);
});
const carpetArt = () => wtex('carpet', 512, 512, (g, w, h) => {
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, w, h);
  const rnd = seeded(9);
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.2)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  for (let i = 0; i < 9; i++) { const x = rnd() * w, y = rnd() * h, r = 50 + rnd() * 110, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,30,0,0.2)'); gr.addColorStop(1, 'rgba(40,30,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
});
const ceilingArt = () => wtex('ceiling', 512, 512, (g, w, h) => {
  g.fillStyle = '#a89f84'; g.fillRect(0, 0, w, h);
  const rnd = seeded(3);
  for (let i = 0; i < 2500; i++) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  for (const [i, j] of [[0, 0], [2, 2]]) { g.fillStyle = '#ffffff'; g.fillRect(i * 128 + 8, j * 128 + 8, 112, 112); g.fillStyle = 'rgba(190,170,90,0.35)'; for (let k = 1; k < 4; k++) g.fillRect(i * 128 + 8 + k * 28, j * 128 + 8, 3, 112); }
  g.strokeStyle = 'rgba(40,34,18,0.75)'; g.lineWidth = 5; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128, h); g.moveTo(0, k * 128); g.lineTo(w, k * 128); g.stroke(); }
});
const hazardArt = () => wtex('hazard', 256, 256, (g, w, h) => {
  g.fillStyle = '#ffd23d'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c1f26';
  for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 32 + h, h); g.lineTo(i * 64 + h, h); g.fill(); }
});
let toonRamp = null;
function toonGradient() {
  if (toonRamp) return toonRamp;
  const t = new T.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 4, 1, T.RGBAFormat);
  t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true;
  return (toonRamp = t);
}

// ------------------------------------------------------------------ round rocks
// How each kind of rock is colored: the top, two bands of strata, the underside, and what grows on it.
const ORB_STYLES = {
  garden: { top: '#6fbf5a', rock: ['#b9a58c', '#a08a72'], under: '#6e5d50', trees: ['#ff8fb8', '#ffc4dc', '#6fbf5a'] },
  rock: { top: '#c9c2b4', rock: ['#a8a39a', '#8e8a86'], under: '#5e5c60', trees: null },
  neon: { top: '#5a3fb8', rock: ['#3a2f7a', '#2a2460'], under: '#16123a', trees: ['#66ffff', '#ff5ad1', '#9a5cff'], glow: true },
  slag: { top: '#5a4038', rock: ['#3e2c28', '#30221f'], under: '#1c1412', trees: null, cracks: '#ff8a1f' },
  crystal: { top: '#e8e2ff', rock: ['#b8a8ff', '#8f7fe8'], under: '#5a4fb0', trees: null, facets: true }
};
const ORB_NOISE = makeNoise(40);
function tinted(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, col = new T.Color(color), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new T.BufferAttribute(c, 3)); return g;
}
function mergeColored(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(P, 3)); out.setAttribute('normal', new T.BufferAttribute(N, 3)); out.setAttribute('color', new T.BufferAttribute(C, 3));
  out.computeBoundingSphere(); return out;
}
// One rock: a sphere pushed in and out by slow noise, colored by height. Returns { solid: [geometries], glow: [parts] }.
function orbGeos(o) {
  const st = ORB_STYLES[o.style] || ORB_STYLES.rock, N = ORB_NOISE, s = o.seed * 3.7, solidGeos = [], glow = [];
  let g = new T.IcosahedronGeometry(1, st.facets ? 1 : 3); if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color(), lump = st.facets ? 0.5 : 0.3;
  const bump = (x, y, z) => (N.fbm(x * 1.6 + s, y * 1.6, 256, 3) + N.fbm(y * 1.6 + s + 9, z * 1.6, 256, 3) + N.fbm(z * 1.6 + 5, x * 1.6 + s, 256, 3)) / 3;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k), f = bump(x, y, z), rad = o.r * (0.98 - lump * 0.55 + lump * f);
    p.setXYZ(k, o.c.x + x * rad, o.c.y + y * rad, o.c.z + z * rad);
    const band = Math.floor((y * 0.5 + 0.5) * 7 + f * 2.5) % 2;
    c.set(y > 0.3 + (f - 0.5) * 0.7 ? st.top : y < -0.55 + (f - 0.5) * 0.4 ? st.under : st.rock[band]);
    if (y > 0.3 + (f - 0.5) * 0.7) c.multiplyScalar(0.88 + f * 0.3);
    col.set([c.r, c.g, c.b], k * 3);
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  if (st.facets) g.computeVertexNormals();
  solidGeos.push(g);
  const rnd = seeded(o.seed * 13 + 3), at = (dir, d) => [o.c.x + dir.x * d, o.c.y + dir.y * d, o.c.z + dir.z * d];
  if (st.trees) for (let i = 0; i < Math.round(2 + o.r * 0.7); i++) {
    // small trees round the top: a leaning trunk and a few soft clumps of blossom
    const a = rnd() * Math.PI * 2, tilt = 0.15 + rnd() * 0.75, dir = new T.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
    const base = o.r * (0.98 - lump * 0.55 + lump * bump(dir.x, dir.y, dir.z)) - 0.05, hgt = Math.min(1.9, 0.7 + o.r * 0.16) * (0.7 + rnd() * 0.6), cw = hgt * 0.55, hue = st.trees[i % st.trees.length];
    const trunk = new T.CylinderGeometry(0.05 * hgt, 0.1 * hgt, hgt, 6); trunk.translate(0, hgt / 2, 0);
    const q = new T.Quaternion().setFromUnitVectors(UP, dir), place = (geo, lift, side = 0, fwd = 0) => { geo.translate(side, lift, fwd); geo.applyQuaternion(q); geo.translate(...at(dir, base)); return geo; };
    solidGeos.push(tinted(place(trunk, 0), st.glow ? '#2a2460' : '#6b4a2e'));
    for (let k = 0; k < 3; k++) {
      const blob = new T.IcosahedronGeometry(cw * (0.75 - k * 0.12), 1); blob.scale(1, 0.8, 1);
      const pg = place(blob, hgt * (0.95 + k * 0.16), (rnd() - 0.5) * cw * 0.9, (rnd() - 0.5) * cw * 0.9);
      if (st.glow) glow.push({ geo: pg, pos: [0, 0, 0], color: hue }); else solidGeos.push(tinted(pg, '#' + new T.Color(hue).multiplyScalar(1 - k * 0.07).getHexString()));
    }
  }
  if (st.cracks) for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, y = rnd() * 1.6 - 0.8, rr = Math.sqrt(1 - y * y), dir = new T.Vector3(rr * Math.cos(a), y, rr * Math.sin(a));
    const geo = new T.IcosahedronGeometry(o.r * (0.1 + rnd() * 0.08), 0); geo.scale(1, 0.25, 2.2); geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP, dir)); geo.translate(...at(dir, o.r * 0.86));
    glow.push({ geo, pos: [0, 0, 0], color: st.cracks });
  }
  return { solid: solidGeos, glow };
}

// ------------------------------------------------------------------ meshes
const WALL_NOISE = makeNoise(11);
function buildLevelMeshes(scene, env) {
  const W = WORLD, level = W.level, th = level.theme, group = new T.Group(), P = W.loop;
  const buf = () => ({ p: [], n: [], uv: [], c: [] });
  const B = { hull: buf(), floor: buf(), field: buf(), hazard: buf(), ceil: buf(), veil: buf() }, rooms = th.art === 'backrooms';
  const strips = [], col = new T.Color(), col2 = new T.Color();
  const zone = z => (level.neutral ? th.strip.mid : z > 2 ? TEAM_COLOR.blue : z < -2 ? TEAM_COLOR.orange : th.strip.mid);
  const SCALE = { field: 1 / 6, hazard: 1 / 3, veil: 1 / 3, hull: 1 / 8, floor: 1 / 8, ceil: 1 / 7 };
  const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  // vertex: position, normal, uv, color (a T.Color or [r, g, b])
  const vert = (b, pos, nrm, uv, c) => { b.p.push(pos[0], pos[1], pos[2]); b.n.push(nrm[0], nrm[1], nrm[2]); b.uv.push(uv[0], uv[1]); b.c.push(c.r, c.g, c.b); };
  const roomTint = (room, mat) => {
    const zc = (room.min.z + room.max.z) / 2, tint = room.tint || (mat === 'floor' ? th.floor : mat === 'field' || mat === 'veil' ? th.field : th.hull);
    const c = mat === 'hazard' ? new T.Color('#ffffff') : mat === 'ceil' ? new T.Color('#fff6cc') : new T.Color(tint).lerp(col2.set(zone(zc)), mat === 'field' ? 0.45 : level.neutral ? 0 : 0.07);
    return mat === 'field' ? c.multiplyScalar(th.fieldGlow || 0.72) : c;
  };
  // How light or dark a point on a wall is: darker within 4.5 m of the room's edges, plus slow drift so no wall is one flat tone.
  const shade = (room, a, ua, va, u, v) => {
    const d = Math.min(u - room.min.getComponent(ua), room.max.getComponent(ua) - u, v - room.min.getComponent(va), room.max.getComponent(va) - v);
    return 1 - 0.27 * (1 - sm(d / 4.5)) + (WALL_NOISE.fbm(u * 0.07 + a * 7.3 + room.i, v * 0.07 + room.i * 3.1, 256, 3) - 0.5) * 0.2;
  };
  for (const q of W.quads) {
    const mat = q.mat === 'hull' && q.floor ? 'floor' : q.mat === 'hull' && rooms && q.a === 1 ? 'ceil' : q.mat, b = B[mat] || B.hull, sc = SCALE[mat] || SCALE.hull;
    const base = roomTint(q.room, mat), shaded = !rooms && (mat === 'hull' || mat === 'floor'), nrm = [0, 0, 0]; nrm[q.a] = -q.s;
    const nu = shaded ? Math.min(20, Math.ceil((q.u1 - q.u0) / 5)) : 1, nv = shaded ? Math.min(20, Math.ceil((q.v1 - q.v0) / 5)) : 1;
    const corner = (i, j) => {
      const u = q.u0 + (q.u1 - q.u0) * i / nu, v = q.v0 + (q.v1 - q.v0) * j / nv, pos = [0, 0, 0]; pos[q.a] = q.k; pos[q.ua] = u; pos[q.va] = v;
      return [pos, [u * sc, v * sc], shaded ? col.copy(base).multiplyScalar(shade(q.room, q.a, q.ua, q.va, u, v)).clone() : base];
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const c4 = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)]; for (const k of [0, 1, 2, 0, 2, 3]) vert(b, c4[k][0], nrm, c4[k][1], c4[k][2]); }
  }
  // rounded corners of windows and doorways: a small fan that fills the corner of the opening
  for (const r of W.rounds) {
    const mat = r.mat === 'hull' && r.floor ? 'floor' : r.mat === 'hull' && rooms && r.a === 1 ? 'ceil' : r.mat, b = B[mat] || B.hull, sc = SCALE[mat] || SCALE.hull, nrm = [0, 0, 0]; nrm[r.a] = -r.s;
    const base = roomTint(r.room, mat), k = mat === 'hull' || mat === 'floor' ? shade(r.room, r.a, r.ua, r.va, r.cu, r.cv) : 1, c = base.clone().multiplyScalar(k);
    const mk = (u, v) => { const pos = [0, 0, 0]; pos[r.a] = r.k; pos[r.ua] = u; pos[r.va] = v; return [pos, [u * sc, v * sc]]; };
    const ou = r.cu + r.du * r.r, ov = r.cv + r.dv * r.r, arc = i => mk(ou - r.du * r.r * Math.cos(i / 5 * Math.PI / 2), ov - r.dv * r.r * Math.sin(i / 5 * Math.PI / 2)), c0 = mk(r.cu, r.cv);
    for (let i = 0; i < 5; i++) { const a0 = arc(i), a1 = arc(i + 1); vert(b, c0[0], nrm, c0[1], c); vert(b, a0[0], nrm, a0[1], c); vert(b, a1[0], nrm, a1[1], c); }
  }
  // light strips and frames
  const strip = (a, b, color, s = 0.14) => { const d = [Math.abs(b[0] - a[0]) || s, Math.abs(b[1] - a[1]) || s, Math.abs(b[2] - a[2]) || s]; strips.push({ geo: G.box(...d), pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], color }); };
  const slant = (a, b, color, s = 0.12) => { const dx = b[0] - a[0], dz = b[2] - a[2]; strips.push({ geo: G.box(Math.hypot(dx, dz), s, s), pos: [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2], rot: [0, -Math.atan2(dz, dx) / DEG, 0], color }); };
  // coves: the curved (or faceted) strip of wall along each rounded edge, with a light line along the middle of the floor and
  // ceiling ones, and a flat cap wherever a cove stops at a doorway
  for (const c of W.coves) {
    const { A, B: Bf, a3, R, room } = c, round = !c.planes;
    const prof = round ? Array.from({ length: 7 }, (_, i) => { const t = i / 6 * Math.PI / 2; return [1 - Math.sin(t), 1 - Math.cos(t), Math.sin(t), Math.cos(t)]; }) : c.profile.map(p => [p[0], p[1], 0, 0]);
    const mat = c.mat === 'field' ? 'field' : 'hull', b = B[mat], sc = SCALE[mat];
    const wallC = roomTint(room, mat), floorC = roomTint(room, 'floor'), lowA = A.f === '-y', lowB = Bf.f === '-y';
    const posOf = (pn, qn, t) => { const pos = [0, 0, 0]; pos[A.a] = A.k - A.s * pn * R; pos[Bf.a] = Bf.k - Bf.s * qn * R; pos[a3] = t; return pos; };
    const nOf = (np, nq) => { const n = [0, 0, 0]; n[A.a] = -A.s * np; n[Bf.a] = -Bf.s * nq; return n; };
    const arcLen = [0]; for (let j = 1; j < prof.length; j++) arcLen.push(arcLen[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]) * R);
    const colorAt = (j, t) => {
      if (mat === 'field') return wallC;
      const k = (round ? 0.84 + 0.1 * Math.abs(j / (prof.length - 1) - 0.5) * 2 : 0.92 - (j % 2) * 0.1) + (WALL_NOISE.fbm(t * 0.07 + room.i, j * 0.4 + a3 * 5, 256, 3) - 0.5) * 0.16;
      const wf = !(lowA || lowB) || rooms ? 0 : lowA ? 1 - prof[j][0] : 1 - prof[j][1];        // 1 on the floor, 0 up the wall
      return col.copy(wallC).lerp(floorC, sm(wf)).multiplyScalar(k).clone();
    };
    for (const [t0, t1] of c.ivs) {
      const nt = Math.max(1, Math.ceil((t1 - t0) / 6));
      for (let j = 0; j + 1 < prof.length; j++) {
        const pl = c.planes && c.planes[j], flat = pl ? nOf(pl.np, pl.nq) : null;
        for (let i = 0; i < nt; i++) {
          const ta = t0 + (t1 - t0) * i / nt, tb = t0 + (t1 - t0) * (i + 1) / nt;
          const cs = [[j, ta], [j, tb], [j + 1, tb], [j + 1, ta]].map(([jj, t]) => [posOf(prof[jj][0], prof[jj][1], t), flat || nOf(prof[jj][2], prof[jj][3]), [t * sc, (arcLen[jj] + (A.k + Bf.k)) * sc], colorAt(jj, t)]);
          for (const k of [0, 1, 2, 0, 2, 3]) vert(b, cs[k][0], cs[k][1], cs[k][2], cs[k][3]);
        }
      }
      // caps (only where the cove stops short of the room's own end wall, or always for see-through coves' frames)
      for (const [t, sgn] of [[t0, 1], [t1, -1]]) {
        if (Math.abs(t - (sgn > 0 ? room.min.getComponent(a3) : room.max.getComponent(a3))) < 0.01 && mat !== 'field') continue;
        const n = [0, 0, 0]; n[a3] = sgn; const tt = t + sgn * 0.02, cc = col.copy(roomTint(room, 'hull')).multiplyScalar(0.7).clone(), c0 = posOf(0, 0, tt);
        for (let j = 0; j + 1 < prof.length; j++) { vert(B.hull, c0, n, [0, 0], cc); vert(B.hull, posOf(prof[j][0], prof[j][1], tt), n, [0.1, 0], cc); vert(B.hull, posOf(prof[j + 1][0], prof[j + 1][1], tt), n, [0.1, 0.1], cc); }
      }
      // lights
      const mid = prof[Math.floor(prof.length / 2)], zc = (room.min.z + room.max.z) / 2;
      if (a3 !== 1 && (c.low || c.high)) { const lift = round ? 0.03 : 0; strip(posOf(mid[0] + lift, mid[1] + lift, t0 + 0.1), posOf(mid[0] + lift, mid[1] + lift, t1 - 0.1), c.low ? zone(zc) : th.strip.white, 0.13); }
      if (c.planes) for (let j = 0; j < prof.length; j++) { if ((j === 0 || j === prof.length - 1) && A.a > Bf.a) continue; strip(posOf(prof[j][0], prof[j][1], t0), posOf(prof[j][0], prof[j][1], t1), j % 2 ? th.strip.accent : th.strip.white, 0.16); }
    }
  }
  // rooms without coves keep the old straight strips along their long floor and ceiling edges
  for (const r of W.rooms) {
    if (r.coveList.length) continue;
    const alongZ = r.max.z - r.min.z >= r.max.x - r.min.x, zc = (r.min.z + r.max.z) / 2, e = 0.12;
    for (const sgn of [0, 1]) {
      const side = alongZ ? (sgn ? r.max.x - e : r.min.x + e) : (sgn ? r.max.z - e : r.min.z + e);
      const E = y => (alongZ ? [[side, y, r.min.z], [side, y, r.max.z]] : [[r.min.x, y, side], [r.max.x, y, side]]);
      strip(...E(r.min.y + e), zone(zc)); strip(...E(r.max.y - e), th.strip.white);
    }
  }
  // a twelve-sided room (the Endless Chasm) gets glowing ribs all the way round, every 12 m
  for (const r of W.rooms) {
    const cs = r.coveList.filter(c => c.planes && c.a3 === 1); if (cs.length < 4) continue;
    const pts = []; for (const c of cs) for (const p of c.profile) pts.push([c.A.a === 0 ? c.A.k - c.A.s * p[0] * c.R : c.B.k - c.B.s * p[1] * c.R, c.A.a === 2 ? c.A.k - c.A.s * p[0] * c.R : c.B.k - c.B.s * p[1] * c.R]);
    const cx = (r.min.x + r.max.x) / 2, cz = (r.min.z + r.max.z) / 2; pts.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
    for (let y = r.min.y + 6; y < r.max.y; y += 12) pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.5) slant([p[0], y, p[1]], [q[0], y, q[1]], (Math.round(y / 12) % 2) ? th.strip.mid : th.strip.accent, 0.14); });
  }
  const lineParts = strips.slice();      // just the long light lines: what the Mirror Vault's reflections and far-off copies are drawn from
  // a lit frame round every window and doorway, following its rounded corners (a flat ribbon in the wall's plane)
  {
    const RP = [], RN = [], w = 0.17; let any = false; const parts = {};
    for (const f of W.frames) {
      const ring = e => { const r = Math.max(0.02, f.r + e), out = [], x0 = f.u0 - e, x1 = f.u1 + e, y0 = f.v0 - e, y1 = f.v1 + e, n = f.r >= 0.3 ? 4 : 1;
        for (const [cx, cy, a0] of [[x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180], [x1 - r, y0 + r, 270]]) for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        return out; };
      const I = ring(-w * 0.35), O = ring(w * 0.65), nrm = [0, 0, 0]; nrm[f.a] = 1;
      const mk = ([u, v]) => { const p = [0, 0, 0]; p[f.a] = f.k; p[f.ua] = u; p[f.va] = v; return p; };
      const key = f.color, part = parts[key] || (parts[key] = { p: [], n: [] });
      for (let i = 0; i < I.length; i++) { const j = (i + 1) % I.length; for (const q of [I[i], O[i], O[j], I[i], O[j], I[j]]) { part.p.push(...mk(q)); part.n.push(...nrm); } }
      any = true;
    }
    if (any) for (const key in parts) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(parts[key].p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(parts[key].n, 3)); strips.push({ geo: g, pos: [0, 0, 0], color: th.strip[key] || th.strip.white }); }
  }
  // the Endless Chasm's false walls
  for (const v of W.veils) {
    const mk = (u, w2) => { const p = [0, 0, 0]; p[v.a] = v.k; p[v.ua] = u; p[v.va] = w2; return p; }, nrm = [0, 0, 0]; nrm[v.a] = 1; col.set(th.strip.accent);
    const cs = [[v.u0, v.v0], [v.u1, v.v0], [v.u1, v.v1], [v.u0, v.v1]].map(([u, w2]) => [mk(u, w2), [u * SCALE.veil, w2 * SCALE.veil]]);
    for (const k of [0, 1, 2, 0, 2, 3]) vert(B.veil, cs[k][0], nrm, cs[k][1], col);
  }
  const geo = b => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(b.c, 3)); g.computeBoundingSphere(); return g; };
  const mesh = (b, mat) => { if (!b.p.length) return null; const m = new T.Mesh(geo(b), mat); m.frustumCulled = false; group.add(m); return m; };
  const toon = (extra = {}) => new T.MeshToonMaterial({ vertexColors: true, map: shellArt(), gradientMap: toonGradient(), side: T.DoubleSide, ...extra });
  const mats = {};
  mats.hull = th.shiny ? new T.MeshStandardMaterial({ vertexColors: true, map: shellArt(), metalness: th.shiny === true ? 0.95 : th.shiny, roughness: 0.12, envMap: env, envMapIntensity: 1.25, side: T.DoubleSide }) : toon(rooms ? { map: wallpaperArt() } : {});
  mats.floor = th.shiny ? mats.hull : toon({ map: rooms ? carpetArt() : deckArt() });
  mats.ceil = new T.MeshBasicMaterial({ vertexColors: true, map: ceilingArt(), side: T.DoubleSide, toneMapped: false });
  mats.field = new T.MeshBasicMaterial({ vertexColors: true, map: veinArt(), alphaTest: 0.2, alphaToCoverage: true, side: T.DoubleSide, toneMapped: false, fog: !!th.fogWalls });
  mats.hazard = new T.MeshToonMaterial({ map: hazardArt(), gradientMap: toonGradient(), side: T.DoubleSide });
  mats.veil = new T.MeshBasicMaterial({ vertexColors: true, map: veilArt(), alphaTest: 0.35, side: T.DoubleSide, toneMapped: false });
  const hullMesh = mesh(B.hull, mats.hull); mesh(B.floor, mats.floor); mesh(B.field, mats.field); mesh(B.hazard, mats.hazard); mesh(B.ceil, mats.ceil); mesh(B.veil, mats.veil);
  // blocks (rounded unless the level is meant to be square) and the penalty box
  const blockParts = [], binParts = [];
  for (const b of W.blocks) {
    const s = b.max.clone().sub(b.min), c = b.min.clone().add(b.max).multiplyScalar(0.5);
    blockParts.push({ geo: level.sharp ? G.box(s.x, s.y, s.z) : roundedBox(s.x, s.y, s.z, Math.min(0.7, 0.22 * Math.min(s.x, s.y, s.z)), 2), pos: c.toArray(), color: b.style === 'hazard' ? '#ffd23d' : (b.style || th.block || th.hull) });
    if (b.style === 'hazard') for (let k = -2; k <= 2; k++) strips.push({ geo: G.box(s.x > s.z ? 0.5 : s.x + 0.04, s.y * 0.8, s.x > s.z ? s.z + 0.04 : 0.5), pos: [c.x + (s.x > s.z ? k * s.x / 5.5 : 0), c.y, c.z + (s.x > s.z ? 0 : k * s.z / 5.5)], color: '#1c1f26' });
  }
  if (blockParts.length) { const m = new T.Mesh(mergeParts(blockParts), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), map: rooms ? wallpaperArt() : null })); group.add(m); }
  // rocks: one mesh for all of them, plus one glowing mesh for anything on them that shines
  if (W.orbs.length) {
    const all = [], glow = [];
    for (const o of W.orbs) { const g = orbGeos(o); all.push(...g.solid); glow.push(...g.glow); }
    const rocks = new T.Mesh(mergeColored(all), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })); rocks.frustumCulled = false; group.add(rocks);
    if (glow.length) { const gm = glowing(glow); gm.frustumCulled = false; group.add(gm); }
  }
  if (W.bin) {
    const { min: m, max: M, c } = W.bin, e = 0.1, cb = '#ff4f6a';
    for (const y of [m.y, M.y]) { strip([m.x, y, m.z], [M.x, y, m.z], cb, e); strip([m.x, y, M.z], [M.x, y, M.z], cb, e); strip([m.x, y, m.z], [m.x, y, M.z], cb, e); strip([M.x, y, m.z], [M.x, y, M.z], cb, e); }
    for (const x of [m.x, M.x]) for (const z of [m.z, M.z]) strip([x, m.y, z], [x, M.y, z], cb, e);
    const fb = buf(), sz = M.clone().sub(m); col.set(cb);
    const face = (pts, nrm, w2) => { const uvs = [[0, 0], [w2 / 4, 0], [w2 / 4, sz.y / 4], [0, sz.y / 4]]; for (const k of [0, 1, 2, 0, 2, 3]) vert(fb, pts[k], nrm, uvs[k], col); };
    face([[m.x, m.y, m.z], [M.x, m.y, m.z], [M.x, M.y, m.z], [m.x, M.y, m.z]], [0, 0, 1], sz.x); face([[m.x, m.y, M.z], [M.x, m.y, M.z], [M.x, M.y, M.z], [m.x, M.y, M.z]], [0, 0, -1], sz.x);
    face([[m.x, m.y, m.z], [m.x, m.y, M.z], [m.x, M.y, M.z], [m.x, M.y, m.z]], [1, 0, 0], sz.z); face([[M.x, m.y, m.z], [M.x, m.y, M.z], [M.x, M.y, M.z], [M.x, M.y, m.z]], [-1, 0, 0], sz.z);
    mesh(fb, mats.field);
    binParts.push({ geo: roundedBox(sz.x, 0.3, sz.z, 0.1, 1), pos: [c.x, m.y - 0.15, c.z], color: '#2a2030' }, { geo: roundedBox(sz.x, 0.3, sz.z, 0.1, 1), pos: [c.x, M.y + 0.15, c.z], color: '#2a2030' });
    group.add(new T.Mesh(mergeParts(binParts), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })));
    const tag = labelSprite('PENALTY BOX', { color: '#ffffff', bg: 'rgba(255,79,106,0.7)', height: 1.4 }); tag.position.set(c.x, M.y + 1.6, c.z); group.add(tag);
  }
  // goals: frame with a round opening, a glowing rim in the defending team's color, a recess going back into the wall
  const goalParts = [], goalGlow = [];
  for (const g of W.goals) {
    const c = TEAM_COLOR[g.team], side = g.r + 0.45, shape = new T.Shape(), rr = 0.5;
    shape.moveTo(-side + rr, -side); shape.lineTo(side - rr, -side); shape.quadraticCurveTo(side, -side, side, -side + rr); shape.lineTo(side, side - rr); shape.quadraticCurveTo(side, side, side - rr, side);
    shape.lineTo(-side + rr, side); shape.quadraticCurveTo(-side, side, -side, side - rr); shape.lineTo(-side, -side + rr); shape.quadraticCurveTo(-side, -side, -side + rr, -side);
    const hole = new T.Path(); hole.absarc(0, 0, g.r, 0, Math.PI * 2, true); shape.holes.push(hole);
    const back = new T.Shape(); back.moveTo(-side, -side); back.lineTo(side, -side); back.lineTo(side, side); back.lineTo(-side, side); back.lineTo(-side, -side); const bh = new T.Path(); bh.absarc(0, 0, g.r, 0, Math.PI * 2, true); back.holes.push(bh);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), g.n), e = new T.Euler().setFromQuaternion(q), rot = [e.x / DEG, e.y / DEG, e.z / DEG];
    const at = d => [g.c.x + g.n.x * d, g.by + g.n.y * d, g.c.z + g.n.z * d];
    goalParts.push({ geo: new T.ShapeGeometry(back, 24), pos: at(0.005), rot, color: '#1b1e27' }, { geo: new T.ShapeGeometry(shape, 24), pos: at(0.04), rot, color: '#2c313d' },
                   { geo: new T.CylinderGeometry(g.r, g.r, 2.4, 28, 1, true).rotateX(Math.PI / 2), pos: at(-1.2), rot, color: '#12151c' }, { geo: new T.CircleGeometry(g.r, 28), pos: at(-2.4), rot, color: '#0a0c12' });
    goalGlow.push({ geo: G.torus(g.r, g.kind === 'deep' ? 0.18 : 0.13, 8, 44), pos: at(0.06), rot, color: c }, { geo: G.torus(g.r * 0.98, 0.05, 4, 36), pos: at(-0.9), rot, color: c }, { geo: G.torus(g.r * 0.98, 0.05, 4, 36), pos: at(-1.8), rot, color: c });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, o = new T.Vector3(Math.cos(a) * (g.r + 0.3), Math.sin(a) * (g.r + 0.3), 0.07).applyQuaternion(q); goalGlow.push({ geo: new T.CircleGeometry(0.07, 8), pos: [g.c.x + o.x, g.by + o.y, g.c.z + o.z], rot, color: '#ffffff' }); }
    const tag = labelSprite(g.kind === 'deep' ? 'DEEP GOAL  3' : '1', { color: '#ffffff', bg: hexA(c, 0.65), height: g.kind === 'deep' ? 0.8 : 0.65 });
    const up = Math.abs(g.n.y) > 0.9 ? new T.Vector3(0, 0, g.c.z > 0 ? -1 : 1) : new T.Vector3(0, 1, 0);
    tag.position.set(g.c.x, g.by, g.c.z).addScaledVector(g.n, 0.6).addScaledVector(up, g.r + 1); group.add(tag);
  }
  if (goalParts.length) { group.add(new T.Mesh(mergeParts(goalParts), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: T.DoubleSide })), glowing(goalGlow, { side: T.DoubleSide })); }
  const stripMesh = glowing(strips.length ? strips : [{ geo: G.box(0.01, 0.01, 0.01), pos: [0, -999, 0], color: '#000000' }], { side: T.DoubleSide }); stripMesh.frustumCulled = false; group.add(stripMesh);
  // The Mirror Vault: the level's own skeleton of light, repeated in every direction like a hall of mirrors (first the mirror
  // image just past each edge of the field, then a fainter copy beyond that), so the place seems to go on forever.
  const lineGeo = (th.mirrors || P) && lineParts.length ? mergeParts(lineParts) : null;
  if (th.mirrors && lineGeo) {
    const Bn = W.bounds, size = Bn.max.clone().sub(Bn.min);
    const ghost = o => new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: T.DoubleSide, fog: false });
    const near = ghost(0.42), far = ghost(0.17);
    for (const ax of ['x', 'y', 'z']) for (const sgn of [1, -1]) {
      const a = new T.Mesh(lineGeo, near); a.scale[ax] = -1; a.position[ax] = 2 * (sgn > 0 ? Bn.max[ax] : Bn.min[ax]); a.frustumCulled = false; a.renderOrder = -1; group.add(a);
      const b = new T.Mesh(lineGeo, far); b.position[ax] = sgn * 2 * size[ax]; b.frustumCulled = false; b.renderOrder = -1; group.add(b);
    }
  }
  // big painted words on the floors (one atlas, one mesh)
  const decals = buildDecals(level); if (decals) group.add(decals);
  // the SIGHT RING
  const sight = new T.Group(); sight.position.set(...level.sight);
  const ringMat = new T.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.85, toneMapped: false });
  const sightRings = [1.0, 1.18, 1.36].map((r, i) => { const m = new T.Mesh(new T.TorusGeometry(r, 0.035, 6, 64), ringMat); m.rotation.set(i * 1.1, i * 0.7, 0); sight.add(m); return m; });
  const sightGlow = glowSprite('#9ff6ff', 2.6, 0.3); sight.add(sightGlow);
  const sightTag = labelSprite('SIGHT RING', { color: '#e8f4ff', bg: 'rgba(8,18,31,0.5)', height: 0.32 }); sightTag.position.y = 1.9; sight.add(sightTag);
  group.add(sight);

  // A looping level is drawn several times over: the full level in the cell you are in and the ones above and below, then
  // only its walls and lights further away, fading into the haze. The whole stack follows you up and down.
  let root = group; const copies = P ? 3 : 1;
  if (P) {
    root = new T.Group(); root.add(group);
    for (const i of [-1, 1]) { const c = group.clone(); c.position.y = i * P; root.add(c); }
    for (const i of [-4, -3, -2, 2, 3, 4]) {
      if (lineGeo) { const m = new T.Mesh(lineGeo, stripMesh.material); m.position.y = i * P; m.frustumCulled = false; root.add(m); }
      if (hullMesh && Math.abs(i) === 2) { const m = new T.Mesh(hullMesh.geometry, hullMesh.material); m.position.y = i * P; m.frustumCulled = false; root.add(m); }
    }
  }
  // moving platforms: every disc in one instanced mesh (and one more for their lit rims)
  let discs = null, rims = null;
  if (W.movers.length) {
    const dg = new T.CylinderGeometry(1, 0.86, 1, 12), n = W.movers.length * copies;
    discs = new T.InstancedMesh(dg, new T.MeshToonMaterial({ color: th.block || th.hull, map: deckArt(), gradientMap: toonGradient() }), n);
    const rg = new T.TorusGeometry(1.0, 0.045, 5, 12); rg.rotateX(Math.PI / 2);
    rims = new T.InstancedMesh(rg, new T.MeshBasicMaterial({ color: th.strip.accent, toneMapped: false }), n);
    discs.frustumCulled = rims.frustumCulled = false; root.add(discs, rims);
  }
  scene.add(root);
  const m4 = new T.Matrix4(), q4 = new T.Quaternion(), v4 = new T.Vector3(), s4 = new T.Vector3(), base = P ? 0 : null;
  const update = (dt, t, headY) => {
    if (P) root.position.y = P * Math.floor(headY / P);
    if (mats.veil.map) mats.veil.map.offset.set(t * 0.05, t * 0.11);
    if (discs) {
      let k = 0;
      for (const mv of W.movers) for (let c = 0; c < copies; c++) {
        q4.setFromAxisAngle(UP, mv.spin);
        v4.set(mv.pos.x, P ? mv.pos.y + (c - 1) * P : mv.pos.y, mv.pos.z); discs.setMatrixAt(k, m4.compose(v4, q4, s4.set(mv.r, mv.h, mv.r)));
        v4.y += mv.h / 2 + 0.02; rims.setMatrixAt(k, m4.compose(v4, q4, s4.set(mv.r, 1, mv.r))); k++;
      }
      discs.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
    }
  };
  update(0, 0, 0);
  return { root, group, sight, sightRings, sightGlow, ringMat, stripMesh, mats, update };
}

// Stencilled words on floors and walls: every label is painted into one atlas texture and drawn by one mesh.
function buildDecals(level) {
  const list = [];
  for (const r of WORLD.rooms) if (r.label) list.push({ text: r.label, c: [(r.min.x + r.max.x) / 2, r.min.y + WALL_T / 2 + 0.04, (r.min.z + r.max.z) / 2], w: Math.min(r.max.x - r.min.x, r.max.z - r.min.z) * 0.6, alongZ: r.max.z - r.min.z > r.max.x - r.min.x, color: level.theme.decal });
  if (!list.length) return null;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
  const g = cv.getContext('2d'), rows = Math.max(4, list.length), rh = 1024 / rows, P = [], N = [], U = [];
  g.clearRect(0, 0, 1024, 1024); g.textAlign = 'center'; g.textBaseline = 'middle';
  const uniq = [...new Set(list.map(l => l.text))];
  uniq.forEach((text, i) => { g.fillStyle = '#ffffff'; let px = rh * 0.78; g.font = `900 ${px}px ${UI_FONT}`; const tw = g.measureText(text).width; if (tw > 980) { px *= 980 / tw; g.font = `900 ${px}px ${UI_FONT}`; } g.fillText(text, 512, rh * (i + 0.5)); });
  for (const l of list) {
    const i = uniq.indexOf(l.text), v0 = 1 - (i + 1) / rows, v1 = 1 - i / rows, hw = l.w / 2, hh = l.w * (rh / 1024) / 2 * 1.0;
    const pts = l.alongZ ? [[l.c[0] - hh, l.c[1], l.c[2] + hw], [l.c[0] - hh, l.c[1], l.c[2] - hw], [l.c[0] + hh, l.c[1], l.c[2] - hw], [l.c[0] + hh, l.c[1], l.c[2] + hw]]
                         : [[l.c[0] - hw, l.c[1], l.c[2] + hh], [l.c[0] + hw, l.c[1], l.c[2] + hh], [l.c[0] + hw, l.c[1], l.c[2] - hh], [l.c[0] - hw, l.c[1], l.c[2] - hh]];
    const uvs = [[0, v0], [1, v0], [1, v1], [0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...pts[k]); N.push(0, 1, 0); U.push(...uvs[k]); }
  }
  const tex = new T.CanvasTexture(cv); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
  if (!UI.fontReady) UI.panels.add({ set dirty(v) { if (v) { g.clearRect(0, 0, 1024, 1024); uniq.forEach((text, i) => { let px = rh * 0.78; g.font = `900 ${px}px ${UI_FONT}`; const tw = g.measureText(text).width; if (tw > 980) { px *= 980 / tw; g.font = `900 ${px}px ${UI_FONT}`; } g.fillStyle = '#ffffff'; g.fillText(text, 512, rh * (i + 0.5)); }); tex.needsUpdate = true; } } });
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
  const m = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, color: level.theme.decal, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 1; m.frustumCulled = false;
  return m;
}
