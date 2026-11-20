// Version 3 models (2026-11-19): riders that read as real athletes, rides that look built, and field surfaces with real
// material detail (marble veins, stone grain, foam pores, rusted paint, diamond plate, grass blades, wood grain).
// Everything is still made in code (nothing to download) and baked into a few meshes per object:
// - one material per rider handles fabric, glossy armor, the mirror visor and neon trim at once (a per-vertex "surface"
//   value sets roughness, metalness and glow), so a whole rider costs 4 draw calls and a ride 1;
// - textures are painted once at load from seeded noise, with matching normal maps for surface relief.

// ------------------------------------------------------------------ seeded noise (tileable value noise + fbm)
function makeNoise(seed) {
  const rnd = seeded(seed), perm = Array.from({ length: 256 }, (_, i) => i), V = new Float32Array(256);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) V[i] = rnd();
  const wrap = (a, p) => ((a % p) + p) % p;
  const hash = (x, y, p) => V[(perm[wrap(x, p) & 255] + wrap(y, p)) & 255];
  const s = t => t * t * (3 - 2 * t);
  const n2 = (x, y, p = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = s(x - xi), v = s(y - yi);
    const a = hash(xi, yi, p), b = hash(xi + 1, yi, p), c = hash(xi, yi + 1, p), d = hash(xi + 1, yi + 1, p);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const fbm = (x, y, p = 256, oct = 4) => { let sum = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { sum += amp * n2(x * f, y * f, p * f); n += amp; amp *= 0.5; f *= 2; } return sum / n; };
  return { n2, fbm };
}

// Paints a texture pixel by pixel. fn(u, v) (0..1, tiling) returns [r, g, b] in 0..255 and the height (0..1) for relief.
// Returns { color, normal } canvases.
function paintSurface(size, fn, relief) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), hc = document.createElement('canvas'); hc.width = hc.height = size;
  const hg = hc.getContext('2d'), himg = hg.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b, h] = fn(x / size, y / size), o = (y * size + x) * 4, hv = Math.max(0, Math.min(255, h * 255));
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    himg.data[o] = himg.data[o + 1] = himg.data[o + 2] = hv; himg.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); hg.putImageData(himg, 0, 0);
  return { color: c, normal: normalCanvas(hc, relief) };
}
// { map, normalMap } for a cover surface, loaded from v3/textures/surf-<key>.jpg (painted in code if the file is missing).
// repeat = how many times it tiles per meter.
const SURF_TEX = {};
function surfaceTextures(key, size, fn, relief = 3, repeat = 1, average = '#a0a0a0') {
  if (SURF_TEX[key]) return SURF_TEX[key];
  let painted = null; const paint = () => painted || (painted = paintSurface(size, fn, relief));
  return (SURF_TEX[key] = { map: loadBaked('surf-' + key + '.jpg', size, true, repeat, () => paint().color, average),
                            normalMap: loadBaked('surf-' + key + '-n.jpg', size, false, repeat, () => paint().normal, '#8080ff'), paint });
}
const clamp255 = v => Math.max(0, Math.min(255, v));
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Material surfaces for the cover. UVs are in meters (see roundedBox), so repeat = 1 / tile size in meters.
const SURFACES = {
  // Polished white marble with grey and faint gold veins.
  marble: () => { const N = makeNoise(21); return surfaceTextures('marble', 512, (u, v) => {
    // Calacatta-style: soft cloudy white, a few long wandering grey veins (one contour of a warped noise) with fainter branches.
    const wx = u + (N.fbm(u * 3, v * 3, 3, 4) - 0.5) * 0.35, wy = v + (N.fbm(u * 3 + 5, v * 3, 3, 4) - 0.5) * 0.35;
    const main = Math.abs(N.fbm(wx * 2, wy * 2, 2, 5) - 0.5), branch = Math.abs(N.fbm(wx * 5 + 9, wy * 5, 5, 4) - 0.5);
    const vein = Math.exp(-main * 90) * 0.9 + Math.exp(-branch * 160) * 0.35, cloud = N.fbm(u * 5 + 2, v * 5, 5, 4);
    let c = mixc([247, 245, 240], [230, 227, 220], cloud);
    c = mixc(c, [132, 128, 124], Math.min(1, vein));
    return [...c.map(clamp255), 0.5 - vein * 0.04];
  }, 1.2, 0.35, '#efece6'); },
  // Weathered castle stone: grainy, speckled, with pits and lichen.
  stone: () => { const N = makeNoise(33); return surfaceTextures('stone', 512, (u, v) => {
    const big = N.fbm(u * 3, v * 3, 3, 5), grain = N.n2(u * 160, v * 160, 160), pit = N.fbm(u * 12 + 7, v * 12, 12, 3);
    let c = mixc([196, 198, 206], [150, 154, 166], big);
    c = mixc(c, [104, 108, 118], Math.max(0, pit - 0.6) * 2.2);
    c = mixc(c, [104, 122, 96], Math.max(0, N.fbm(u * 5 + 9, v * 5, 5, 3) - 0.62) * 1.8);
    const k = 0.9 + grain * 0.2;
    return [...c.map(x => clamp255(x * k)), big * 0.6 + grain * 0.15 - Math.max(0, pit - 0.6)];
  }, 4, 0.5, '#aeb0ba'); },
  // Gym crash-mat foam: soft vinyl with tiny pores and stitched seams near the edges of each tile.
  foam: () => { const N = makeNoise(45); return surfaceTextures('foam', 256, (u, v) => {
    const pore = N.n2(u * 90, v * 90, 90), soft = N.fbm(u * 4, v * 4, 4, 3);
    const seam = Math.min(u, 1 - u, v, 1 - v) < 0.015 ? 0.75 : 1;
    const k = (0.93 + soft * 0.1 - (pore > 0.8 ? 0.06 : 0)) * seam;
    return [clamp255(255 * k), clamp255(255 * k), clamp255(255 * k), soft * 0.3 - (pore > 0.8 ? 0.08 : 0) - (seam < 1 ? 0.3 : 0)];
  }, 3, 0.5, '#f0f0f0'); },
  // Painted steel with scratches, rust streaks running down and grime at the bottom.
  rust: () => { const N = makeNoise(57); return surfaceTextures('rust', 512, (u, v) => {
    const patch = N.fbm(u * 6, v * 2, 6, 5), streak = N.fbm(u * 40, v * 2, 40, 3), scratch = N.n2(u * 300, v * 20, 300);
    const rust = Math.max(0, patch - 0.55) * 2.5 + Math.max(0, streak - 0.6) * 1.2;
    let c = mixc([236, 232, 228], [150, 92, 60], Math.min(1, rust));
    if (scratch > 0.86) c = mixc(c, [255, 250, 240], 0.5);
    return [...c.map(clamp255), 0.5 - rust * 0.25 + (scratch > 0.86 ? 0.1 : 0)];
  }, 2.5, 0.4, '#d8c8bc'); },
  // Dark sci-fi hull panels with fine seams and a little brushed sheen.
  panel: () => { const N = makeNoise(69); return surfaceTextures('panel', 512, (u, v) => {
    const gx = (u * 4) % 1, gy = (v * 3) % 1, seam = Math.min(gx, 1 - gx, gy, 1 - gy) < 0.012 ? 0.55 : 1;
    const brush = N.n2(u * 2, v * 260, 2), wear = N.fbm(u * 6, v * 6, 6, 3);
    const k = (0.85 + brush * 0.15 + wear * 0.1) * seam;
    return [clamp255(230 * k), clamp255(232 * k), clamp255(245 * k), (seam < 1 ? 0 : 0.5) + brush * 0.04];
  }, 4, 0.4, '#d6d8e4'); }
};

// ------------------------------------------------------------------ geometry helpers
// A box with rounded edges and UVs in meters on every face (so textures tile at the same size on big and small boxes).
function roundedBox(w, h, d, r = 0.06, seg = 2) {
  r = Math.max(0.005, Math.min(r, w / 2 - 0.004, h / 2 - 0.004, d / 2 - 0.004));
  const iw = w / 2 - r, ih = h / 2 - r, rc = Math.min(r * 0.6, iw * 0.5, ih * 0.5), s = new T.Shape();
  s.moveTo(-iw + rc, -ih); s.lineTo(iw - rc, -ih); s.quadraticCurveTo(iw, -ih, iw, -ih + rc); s.lineTo(iw, ih - rc);
  s.quadraticCurveTo(iw, ih, iw - rc, ih); s.lineTo(-iw + rc, ih); s.quadraticCurveTo(-iw, ih, -iw, ih - rc); s.lineTo(-iw, -ih + rc);
  s.quadraticCurveTo(-iw, -ih, -iw + rc, -ih);
  const geo = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 2 });
  geo.translate(0, 0, -Math.max(0.001, d - 2 * r) / 2);
  // ExtrudeGeometry's side UVs follow the outline; re-project every face by its normal so all six sides tile in meters.
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (az >= ax && az >= ay) uv.setXY(i, p.getX(i), p.getY(i)); else if (ay >= ax) uv.setXY(i, p.getX(i), p.getZ(i)); else uv.setXY(i, p.getZ(i), p.getY(i));
  }
  return geo;
}
// A tapered cylinder from point a to point b (ra at a, rb at b).
function limbGeo(a, b, ra, rb, seg = 12) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
  const geo = new T.CylinderGeometry(rb, ra, len, seg, 1, false);
  geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()));
  geo.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return geo;
}
// Part of a sphere around the front (+z): yaw / pitch spans in degrees, centered on the front.
function shellGeo(r, yawSpan, pitchTop, pitchBottom, ws = 18, hs = 10) {
  return new T.SphereGeometry(r, ws, hs, Math.PI / 2 - yawSpan * DEG / 2, yawSpan * DEG, (90 - pitchTop) * DEG, (pitchTop - pitchBottom) * DEG);
}

// Surface presets: [roughness, metalness, glow].
const SURF = { suit: [0.6, 0.04, 0], armor: [0.3, 0.45, 0], gloss: [0.16, 0.55, 0], visor: [0.04, 0.95, 0], rubber: [0.85, 0, 0],
               neon: [0.5, 0, 1.6], metal: [0.24, 0.85, 0], wood: [0.7, 0, 0], straw: [0.95, 0, 0], soft: [0.95, 0, 0], light: [0.4, 0, 2.4] };

// Merges parts { geo, pos?, rot? (deg), scale?, color, s: surface } into one geometry with color + surface attributes.
// pivot (optional) is subtracted, so the geometry rotates around it when its group turns.
function mergeSurf(parts, pivot = [0, 0, 0]) {
  let count = 0;
  const geos = parts.map(p => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(), r = p.rot || [0, 0, 0], sc = p.scale || [1, 1, 1], pos = p.pos || [0, 0, 0];
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(pos[0] - pivot[0], pos[1] - pivot[1], pos[2] - pivot[2]),
      new T.Quaternion().setFromEuler(new T.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)), new T.Vector3(...sc)));
    count += g.attributes.position.count;
    return g;
  });
  const P = new Float32Array(count * 3), N = new Float32Array(count * 3), C = new Float32Array(count * 3), S = new Float32Array(count * 3), col = new T.Color();
  let o = 0;
  geos.forEach((g, i) => {
    const part = parts[i], n = g.attributes.position.count, surf = part.s || SURF.suit;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    for (let k = 0; k < n; k++) {
      if (typeof part.color === 'function') col.set(part.color(g.attributes.position.getX(k), g.attributes.position.getY(k), g.attributes.position.getZ(k)));
      else if (k === 0) col.set(part.color || '#ffffff');
      C.set([col.r, col.g, col.b], (o + k) * 3); S.set(surf, (o + k) * 3);
    }
    o += n;
  });
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(P, 3)); out.setAttribute('normal', new T.BufferAttribute(N, 3));
  out.setAttribute('color', new T.BufferAttribute(C, 3)); out.setAttribute('surf', new T.BufferAttribute(S, 3));
  out.computeBoundingSphere();
  return out;
}
// One standard material that reads roughness, metalness and glow per vertex.
function surfMaterial() {
  const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, envMapIntensity: 1.1 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec3 surf; varying vec3 vSurf;\nvoid main() {\n  vSurf = surf;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vSurf;\nvoid main() {')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vSurf.z;');
  };
  m.customProgramCacheKey = () => 'surge-surf';
  return m;
}
let sharedSurfMat = null;
const rideMaterial = () => sharedSurfMat || (sharedSurfMat = surfMaterial());

// ------------------------------------------------------------------ riders
// A pilot in a riding crouch: fabric undersuit, glossy armor plates in team color on shoulders and knees, a helmet with a
// mirror visor (it reflects the realm's sky), neon trim, gauntlets, boots and a twin-nozzle thruster pack.
// Faces +z. Soles sit 0.22 below the group's origin (on top of the ride). variant 0-2 changes the helmet.
// Returns { group, arm, head, upper, suitMat } (suitMat.emissive flashes when hit).
const RIDER_HIP = [0, 0.78, 0], RIDER_NECK = [0, 1.36, 0.0], RIDER_SHOULDER_R = [0.205, 1.24, 0];
function buildRider(col, variant = 0) {
  const suit = '#23272f', suit2 = '#2e333d', armor = '#454d59', helm = '#2b3039', visor = '#0a0d13', boot = '#16181d';
  const team = new T.Color(col), plate = '#' + team.clone().lerp(new T.Color('#ffffff'), 0.08).getHexString();
  const mat = surfMaterial(), mesh = (parts, pivot) => new T.Mesh(mergeSurf(parts, pivot), mat);
  const S = SURF;
  // ---- legs and hips (fixed to the ride)
  const lower = [
    { geo: new T.SphereGeometry(0.15, 16, 12), pos: [0, 0.77, 0], scale: [1, 0.72, 0.78], color: suit, s: S.suit },
    { geo: new T.TorusGeometry(0.14, 0.024, 8, 28), pos: [0, 0.83, 0], rot: [90, 0, 0], scale: [1, 0.74, 1], color: armor, s: S.armor },
    { geo: roundedBox(0.09, 0.07, 0.03, 0.012, 1), pos: [0, 0.83, 0.112], color: plate, s: S.gloss }
  ];
  for (const sx of [-1, 1]) {
    const hip = [sx * 0.095, 0.76, 0], knee = [sx * 0.125, 0.45, 0.15], ankle = [sx * 0.125, 0.1, 0.0];
    lower.push(
      { geo: limbGeo(hip, knee, 0.088, 0.066), color: suit, s: S.suit },
      { geo: limbGeo([sx * 0.1, 0.7, 0.05], [sx * 0.123, 0.5, 0.15], 0.07, 0.058), scale: [1, 1, 1], color: suit2, s: S.suit },
      { geo: new T.SphereGeometry(0.064, 12, 10), pos: knee, color: suit, s: S.suit },
      { geo: shellGeo(0.075, 150, 60, -40, 12, 8), pos: [knee[0], knee[1] + 0.01, knee[2] + 0.005], color: plate, s: S.gloss },
      { geo: new T.TorusGeometry(0.06, 0.008, 5, 18), pos: [knee[0], knee[1] - 0.06, knee[2] - 0.01], rot: [80, 0, 0], color: col, s: S.neon },
      { geo: limbGeo(knee, ankle, 0.06, 0.045), color: suit, s: S.suit },
      { geo: limbGeo([knee[0], knee[1] - 0.07, knee[2] + 0.02], [ankle[0], ankle[1] + 0.07, ankle[2] + 0.035], 0.058, 0.048), scale: [0.95, 1, 1], color: armor, s: S.armor },
      { geo: new T.SphereGeometry(0.048, 10, 8), pos: ankle, color: suit, s: S.suit },
      { geo: roundedBox(0.115, 0.1, 0.27, 0.035, 2), pos: [sx * 0.125, 0.05, 0.055], color: boot, s: S.rubber },
      { geo: roundedBox(0.105, 0.04, 0.12, 0.015, 1), pos: [sx * 0.125, 0.1, 0.11], color: armor, s: S.armor },
      { geo: G.box(0.118, 0.014, 0.262), pos: [sx * 0.125, 0.008, 0.055], color: col, s: S.neon }
    );
  }
  // ---- upper body (leans with speed): torso, chest plate, shoulders, left arm, thruster pack
  const prof = [[0.001, 0.7], [0.13, 0.72], [0.155, 0.79], [0.148, 0.87], [0.132, 0.95], [0.146, 1.03], [0.178, 1.12], [0.19, 1.18], [0.172, 1.245], [0.12, 1.29], [0.06, 1.31], [0.052, 1.39], [0.001, 1.4]];
  const torso = new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 20);
  const upper = [
    { geo: torso, scale: [1, 1, 0.7], color: suit, s: S.suit },
    { geo: shellGeo(0.2, 120, 38, -18, 18, 10), pos: [0, 1.13, -0.012], scale: [1, 1, 0.74], color: armor, s: S.armor },
    { geo: shellGeo(0.16, 100, 20, -30, 14, 8), pos: [0, 0.96, -0.01], scale: [1, 1, 0.78], color: suit2, s: S.armor },
    { geo: G.box(0.016, 0.2, 0.012), pos: [-0.06, 1.12, 0.152], rot: [-8, 0, -22], color: col, s: S.neon },
    { geo: G.box(0.016, 0.2, 0.012), pos: [0.06, 1.12, 0.152], rot: [-8, 0, 22], color: col, s: S.neon },
    { geo: new T.TorusGeometry(0.068, 0.018, 8, 20), pos: [0, 1.31, 0], rot: [90, 0, 0], color: armor, s: S.armor },
    // thruster pack
    { geo: roundedBox(0.27, 0.34, 0.12, 0.04, 2), pos: [0, 1.1, -0.165], color: armor, s: S.armor },
    { geo: roundedBox(0.2, 0.05, 0.02, 0.008, 1), pos: [0, 1.2, -0.228], color: col, s: S.neon },
    ...[-1, 1].flatMap(sx => [
      { geo: new T.CylinderGeometry(0.05, 0.04, 0.12, 14), pos: [sx * 0.075, 0.9, -0.2], color: '#3a3f49', s: S.metal },
      { geo: new T.CircleGeometry(0.036, 14), pos: [sx * 0.075, 0.839, -0.2], rot: [90, 0, 0], color: '#ffffff', s: S.light }
    ])
  ];
  // shoulder pads in team color, left arm in a ready guard
  const armParts = (sx, shoulder, elbow, wrist, fist) => [
    { geo: shellGeo(0.095, 360, 90, 5, 14, 6), pos: [shoulder[0] + sx * 0.012, shoulder[1] + 0.02, shoulder[2]], scale: [1.08, 0.85, 1], color: plate, s: S.gloss },
    { geo: new T.TorusGeometry(0.09, 0.008, 5, 22), pos: [shoulder[0] + sx * 0.012, shoulder[1] + 0.025, shoulder[2]], rot: [90, 0, 0], scale: [1.08, 1, 1], color: col, s: S.neon },
    { geo: limbGeo(shoulder, elbow, 0.064, 0.052), color: suit, s: S.suit },
    { geo: new T.SphereGeometry(0.052, 10, 8), pos: elbow, color: suit, s: S.suit },
    { geo: limbGeo(elbow, wrist, 0.05, 0.043), color: suit, s: S.suit },
    { geo: limbGeo(elbow.map((v, i) => v + (wrist[i] - v) * 0.3), wrist, 0.058, 0.05), color: armor, s: S.armor },
    { geo: new T.TorusGeometry(0.05, 0.008, 5, 16), pos: wrist, rot: [70, 0, 0], color: col, s: S.neon },
    { geo: new T.SphereGeometry(0.062, 14, 10), pos: fist, scale: [0.9, 0.78, 1.15], color: armor, s: S.armor },
    { geo: new T.SphereGeometry(0.03, 8, 6), pos: [fist[0] - sx * 0.05, fist[1] + 0.01, fist[2] + 0.01], color: armor, s: S.armor },
    { geo: G.box(0.07, 0.014, 0.02), pos: [fist[0], fist[1] + 0.035, fist[2] + 0.055], color: col, s: S.neon }
  ];
  upper.push(...armParts(-1, [-0.205, 1.24, 0], [-0.26, 1.02, 0.08], [-0.21, 1.1, 0.28], [-0.2, 1.12, 0.34]));
  // ---- head: helmet shell, mirror visor, chin guard, neon brow line, variant crest
  const head = [
    { geo: new T.CylinderGeometry(0.05, 0.055, 0.1, 12), pos: [0, 1.38, 0], color: suit, s: S.suit },
    { geo: new T.SphereGeometry(0.14, 26, 18), pos: [0, 1.48, 0.0], scale: [0.95, 1.04, 1.12], color: helm, s: S.gloss },
    { geo: shellGeo(0.1435, 150, 22, -28, 26, 10), pos: [0, 1.48, 0.0], scale: [0.95, 1.04, 1.12], color: visor, s: S.visor },
    { geo: new T.TorusGeometry(0.1445, 0.0055, 4, 30, 150 * DEG), pos: [0, 1.48 + 0.1445 * Math.sin(22 * DEG) * 1.04, 0], rot: [90, 0, 15], scale: [0.95 * Math.cos(22 * DEG), 1.12 * Math.cos(22 * DEG), 1], color: col, s: S.neon },
    { geo: roundedBox(0.15, 0.06, 0.08, 0.025, 2), pos: [0, 1.385, 0.1], rot: [-15, 0, 0], color: helm, s: S.gloss },
    ...[-1, 1].map(sx => ({ geo: new T.CylinderGeometry(0.04, 0.04, 0.03, 16), pos: [sx * 0.133, 1.47, -0.01], rot: [0, 0, 90], color: armor, s: S.metal })),
    ...[-1, 1].map(sx => ({ geo: new T.TorusGeometry(0.03, 0.006, 4, 16), pos: [sx * 0.15, 1.47, -0.01], rot: [0, 90, 0], color: col, s: S.neon }))
  ];
  if (variant === 0) head.push({ geo: roundedBox(0.022, 0.07, 0.24, 0.01, 1), pos: [0, 1.62, -0.02], rot: [12, 0, 0], color: helm, s: S.gloss },
                                { geo: G.box(0.024, 0.012, 0.2), pos: [0, 1.655, -0.03], rot: [12, 0, 0], color: col, s: S.neon });
  else if (variant === 1) for (const sx of [-1, 1]) head.push({ geo: roundedBox(0.02, 0.05, 0.16, 0.008, 1), pos: [sx * 0.14, 1.53, -0.07], rot: [25, sx * 12, sx * -20], color: helm, s: S.gloss },
                                                               { geo: G.box(0.022, 0.01, 0.14), pos: [sx * 0.145, 1.555, -0.07], rot: [25, sx * 12, sx * -20], color: col, s: S.neon });
  else for (let i = 0; i < 5; i++) head.push({ geo: new T.ConeGeometry(0.02, 0.07, 6), pos: [0, 1.625 - i * i * 0.006, 0.06 - i * 0.05], rot: [-15 - i * 18, 0, 0], color: i % 2 ? col : helm, s: i % 2 ? S.neon : S.gloss });
  // ---- right arm: its own pivot at the shoulder so it can punch
  const arm = armParts(1, RIDER_SHOULDER_R, [0.26, 1.02, 0.07], [0.215, 1.08, 0.27], [0.2, 1.1, 0.33]);

  const g = new T.Group(), body = new T.Group(); body.position.y = -0.22; g.add(body);
  body.add(mesh(lower));
  const up = new T.Group(); up.position.set(...RIDER_HIP); up.rotation.x = 14 * DEG; body.add(up);
  up.add(mesh(upper, RIDER_HIP));
  const headG = new T.Group(); headG.position.set(RIDER_NECK[0] - RIDER_HIP[0], RIDER_NECK[1] - RIDER_HIP[1], RIDER_NECK[2] - RIDER_HIP[2]); up.add(headG);
  headG.add(mesh(head, RIDER_NECK));
  const armG = new T.Group(); armG.position.set(RIDER_SHOULDER_R[0] - RIDER_HIP[0], RIDER_SHOULDER_R[1] - RIDER_HIP[1], RIDER_SHOULDER_R[2] - RIDER_HIP[2]); up.add(armG);
  armG.add(mesh(arm, RIDER_SHOULDER_R));
  g.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
  return { group: g, body, arm: armG, head: headG, upper: up, suitMat: mat, phase: Math.random() * 10 };
}

// Per-frame life for a bot rider: leans into speed, banks into turns, the head follows the disc, a slight breathing bob.
const _v = new T.Vector3(), _q = new T.Quaternion();
function animateRider(b, dt, time, discPos) {
  const r = b.rider; if (!r) return;
  const k = 1 - Math.exp(-6 * dt), speed = b.vel.length();
  // yaw rate from the change of facing
  const yaw = Math.atan2(b.facing.x, b.facing.z), dy = Math.atan2(Math.sin(yaw - (b.lastYaw ?? yaw)), Math.cos(yaw - (b.lastYaw ?? yaw)));
  b.lastYaw = yaw;
  const yawRate = dt > 0 ? dy / dt : 0;
  b.bank = (b.bank || 0) + (Math.max(-0.4, Math.min(0.4, -yawRate * 0.22)) - (b.bank || 0)) * k;
  const climb = Math.max(-1, Math.min(1, b.vel.y / 10));
  r.mount.rotation.z = b.bank; r.mount.rotation.x = Math.max(-0.25, Math.min(0.25, Math.min(1, speed / 25) * 0.18 - climb * 0.12));
  r.upper.rotation.x += ((14 + Math.min(1, speed / 22) * 16) * DEG - r.upper.rotation.x) * k;
  r.body.position.y = -0.22 + Math.sin(time * 2.2 + r.phase) * 0.012;
  // head turns toward the disc within a natural range
  if (discPos) {
    r.head.parent.updateMatrixWorld(true);
    const local = r.head.parent.worldToLocal(_v.copy(discPos)).sub(r.head.position);
    const hy = Math.max(-1.1, Math.min(1.1, Math.atan2(local.x, local.z))), hp = Math.max(-0.6, Math.min(0.5, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
    r.head.rotation.y += (hy - r.head.rotation.y) * k; r.head.rotation.x += (hp - r.head.rotation.x) * k;
  }
}

// ------------------------------------------------------------------ rides
// Built with the top surface at y = 0 and the front toward +z. col = team color (trim and lights).
function buildRide(id, col) {
  const S = SURF, parts = [];
  if (id === 'saucer') {
    const prof = [[0.001, 0.012], [0.55, 0.012], [0.8, -0.005], [0.93, -0.045], [0.95, -0.075], [0.9, -0.11], [0.72, -0.17], [0.42, -0.235], [0.24, -0.26], [0.001, -0.27]];
    parts.push({ geo: new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 40), color: '#9fb0c6', s: S.metal },
               { geo: new T.CylinderGeometry(0.56, 0.56, 0.02, 36), pos: [0, 0.015, 0], color: '#2a2f38', s: S.rubber },
               { geo: new T.TorusGeometry(0.56, 0.012, 6, 48), pos: [0, 0.02, 0], rot: [90, 0, 0], color: col, s: S.neon },
               { geo: new T.TorusGeometry(0.94, 0.016, 6, 64), pos: [0, -0.06, 0], rot: [90, 0, 0], color: col, s: S.neon },
               { geo: new T.TorusGeometry(0.26, 0.03, 8, 32), pos: [0, -0.262, 0], rot: [90, 0, 0], color: '#bff6ff', s: S.light },
               { geo: new T.CircleGeometry(0.24, 24), pos: [0, -0.268, 0], rot: [90, 0, 0], color: '#2a6f9a', s: [0.3, 0, 1.4] });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; parts.push({ geo: new T.SphereGeometry(0.028, 8, 6), pos: [Math.cos(a) * 0.86, -0.1, Math.sin(a) * 0.86], color: i % 2 ? '#ffe7a0' : '#ffffff', s: S.light }); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 2; parts.push({ geo: roundedBox(0.05, 0.05, 0.3, 0.02, 1), pos: [Math.cos(a) * 0.72, -0.01, Math.sin(a) * 0.72], rot: [0, -a / DEG + 90, 0], color: '#5a6676', s: S.metal }); }
  } else if (id === 'foundry') {
    parts.push({ geo: roundedBox(1.1, 0.2, 0.86, 0.06, 2), pos: [0, -0.1, 0], color: '#5c636e', s: S.metal },
               { geo: roundedBox(0.98, 0.03, 0.74, 0.01, 1), pos: [0, 0.006, 0], color: '#2b2e33', s: S.rubber });
    for (let i = 0; i < 7; i++) parts.push({ geo: G.box(0.12, 0.05, 0.03), pos: [-0.36 + i * 0.12, -0.12, 0.43], rot: [0, 0, 35], color: i % 2 ? '#1a1a1a' : '#ffcc00', s: S.armor });
    for (const sx of [-1, 1]) parts.push(
      { geo: new T.CylinderGeometry(0.085, 0.1, 0.5, 18), pos: [sx * 0.56, -0.17, -0.05], rot: [90, 0, 0], color: '#4a5059', s: S.metal },
      { geo: new T.TorusGeometry(0.085, 0.018, 6, 20), pos: [sx * 0.56, -0.17, -0.31], color: '#ff8a2a', s: S.light },
      { geo: new T.CircleGeometry(0.075, 16), pos: [sx * 0.56, -0.17, -0.302], rot: [0, 180, 0], color: '#ffb347', s: S.light },
      { geo: limbGeo([sx * 0.35, 0.0, 0.3], [sx * 0.26, 0.42, 0.44], 0.025, 0.02, 8), color: '#7a828d', s: S.metal });
    parts.push({ geo: roundedBox(0.7, 0.2, 0.08, 0.03, 2), pos: [0, 0.48, 0.47], rot: [-30, 0, 0], color: '#3a3f47', s: S.metal },
               { geo: G.box(0.56, 0.11, 0.01), pos: [0, 0.485, 0.515], rot: [-30, 0, 0], color: col, s: S.neon });
  } else if (id === 'castle') {
    // Sky glider: a slim dark-wood deck with a pointed nose, a brass inlay, swept brass wings with team-color tip lights,
    // a glowing keel underneath and a team-color light on the nose.
    const s = new T.Shape(), L = 0.8, W = 0.2;
    s.moveTo(0, -L - 0.14); s.quadraticCurveTo(W, -L + 0.15, W, 0); s.lineTo(W * 0.8, L); s.lineTo(-W * 0.8, L); s.lineTo(-W, 0); s.quadraticCurveTo(-W, -L + 0.15, 0, -L - 0.14);
    const deck = new T.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
    deck.rotateX(-Math.PI / 2); deck.translate(0, -0.052, 0);
    parts.push({ geo: deck, color: '#4a2f1c', s: S.wood },
               { geo: G.box(0.022, 0.004, 1.3), pos: [0, 0.002, -0.05], color: '#c9a86a', s: S.metal },
               { geo: roundedBox(0.035, 0.08, 1.2, 0.012, 1), pos: [0, -0.1, -0.02], color: '#bfe0ff', s: S.light },
               { geo: new T.OctahedronGeometry(0.05, 0), pos: [0, -0.02, 0.96], scale: [1, 0.6, 1.5], color: col, s: S.light });
    for (const sx of [-1, 1]) parts.push(
      { geo: roundedBox(0.7, 0.024, 0.26, 0.01, 1), pos: [sx * 0.5, -0.04, -0.15], rot: [0, sx * 28, sx * 6], color: '#b8913f', s: S.metal },
      { geo: new T.SphereGeometry(0.025, 8, 6), pos: [sx * 0.81, -0.005, -0.31], color: col, s: S.light });
  } else if (id === 'gym') {
    const s = new T.Shape(), L = 0.72, W = 0.25;
    s.moveTo(-W + 0.05, -L + 0.2); s.quadraticCurveTo(0, -L - 0.04, W - 0.05, -L + 0.2); s.lineTo(W, L - 0.25); s.quadraticCurveTo(0, L + 0.06, -W, L - 0.25); s.lineTo(-W + 0.05, -L + 0.2);
    const deck = new T.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
    deck.rotateX(-Math.PI / 2); deck.translate(0, -0.047, 0);
    const top = new T.ShapeGeometry(s, 10); top.rotateX(-Math.PI / 2);
    parts.push({ geo: deck, color: col, s: S.gloss }, { geo: top, pos: [0, 0.0015, 0], scale: [0.94, 1, 0.96], color: '#2a2833', s: S.rubber });
    for (const sx of [-1, 1]) parts.push({ geo: G.box(0.02, 0.003, 1.0), pos: [sx * 0.17, 0.003, 0], color: '#ffffff', s: S.armor });
    for (const z of [-0.42, 0.42]) parts.push({ geo: new T.CylinderGeometry(0.13, 0.11, 0.05, 20), pos: [0, -0.085, z], color: '#3a3f49', s: S.metal },
                                               { geo: new T.CircleGeometry(0.1, 20), pos: [0, -0.111, z], rot: [90, 0, 0], color: '#7ff6ff', s: S.light });
    parts.push({ geo: roundedBox(0.012, 0.09, 0.16, 0.005, 1), pos: [0, -0.1, -0.6], color: col, s: S.gloss });
  } else {
    // cloud: soft puffs, bright on top and cooler underneath
    const rnd = seeded(77), shade = (x, y) => { const t = Math.max(0, Math.min(1, (y + 0.35) / 0.55)); return '#' + new T.Color('#b9c8de').lerp(new T.Color('#ffffff'), t).getHexString(); };
    const puffs = [[0, -0.12, 0, 0.42], [0.42, -0.15, 0.06, 0.34], [-0.42, -0.15, 0.04, 0.34], [0.05, -0.16, 0.45, 0.32], [-0.05, -0.16, -0.45, 0.32]];
    for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.3; puffs.push([Math.cos(a) * r, -0.1 + rnd() * 0.1, Math.sin(a) * r, 0.16 + rnd() * 0.14]); }
    for (const [x, y, z, r] of puffs) parts.push({ geo: new T.IcosahedronGeometry(r, 2), pos: [x, y, z], color: (px, py) => shade(px, py), s: S.soft });
  }
  const m = new T.Mesh(mergeSurf(parts), rideMaterial());
  const g = new T.Group(); g.add(m);
  return g;
}

// Swaps the player's simple rides (a-entity shapes in index.html) for the built models, keeping the thruster glow.
// The player faces -z, so the models turn around; y = where the old shapes' top surface was.
const PLAYER_RIDE_PLACE = { saucer: [0.06, 1.15], foundry: [0.325, 1.1], castle: [0.09, 1.1], gym: [0.095, 1.05], cloud: [0.42, 1.2] };
function upgradePlayerRides(game, col) {
  for (const id in PLAYER_RIDE_PLACE) {
    const ent = game.$('ride-' + id); if (!ent) continue;
    for (const c of ent.object3D.children) if (!(c.el && c.el.id === 'thrusterGlow')) c.visible = false;
    const [y, s] = PLAYER_RIDE_PLACE[id], m = buildRide(id, col);
    m.position.y = y; m.rotation.y = Math.PI; m.scale.setScalar(s);
    ent.object3D.add(m);
  }
}

// ------------------------------------------------------------------ Cloud Court mountains
// Noise-shaped peaks with grass on the lower slopes, rock above and snow on top (smooth shading, one mesh).
function buildMountains(count, dist, seed = 7) {
  const N = makeNoise(seed), parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.17, h = 70 + ((i * 23) % 55), r = 55 + ((i * 17) % 25);
    const geo = new T.ConeGeometry(r, h, 56, 18, true), p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), t = (y + h / 2) / h, ang = Math.atan2(z, x);
      const n = N.fbm(ang * 3 + i * 7, t * 4, 256, 5), ridge = 1 - Math.abs(N.n2(ang * 6 + i, t * 3) * 2 - 1);
      const rad = Math.hypot(x, z), k2 = 1 + (n - 0.5) * 0.9 + ridge * 0.25 * (1 - t);
      p.setXYZ(k, Math.cos(ang) * rad * k2, y + (n - 0.5) * h * 0.18 * (1 - t), Math.sin(ang) * rad * k2);
    }
    geo.computeVertexNormals();
    const [cx, , cz] = polar(a, dist, 0);
    const color = (x, y, z) => {
      const t = (y + 2) / h, n = N.n2(x * 0.15 + i * 9, z * 0.15) * 0.12;
      if (t + n > 0.74) return '#f2f5fa';
      if (t + n > 0.4) return '#' + new T.Color('#6e726f').lerp(new T.Color('#8c8f8a'), N.n2(x * 0.3, y * 0.3)).getHexString();
      return '#' + new T.Color('#4f7a48').lerp(new T.Color('#6d8a58'), N.n2(x * 0.2 + 3, z * 0.2)).getHexString();
    };
    parts.push({ geo, pos: [cx, h / 2 - 2, cz], color, s: [0.95, 0, 0] });
  }
  return new T.Mesh(mergeSurf(parts), rideMaterial());
}
