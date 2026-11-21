// Shared helpers: sound, haptics, collision, mesh baking and painted textures (skies, floors).
const UP = new T.Vector3(0, 1, 0);
const tmp = new T.Vector3(), tmp2 = new T.Vector3(), tmp3 = new T.Vector3();
const cA = new T.Vector3(), cB = new T.Vector3(), cC = new T.Vector3(), cN = new T.Vector3();

function mirror4(list) {
  const out = [];
  for (const p of list) for (const sx of [1, -1]) for (const sz of [1, -1]) out.push({ ...p, x: p.x * sx, z: p.z * sz });
  return out;
}
function mirrorZ(list) { return list.flatMap(p => [p, { ...p, z: -p.z }]); }

function loadSave() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  if (!v && typeof STORE_KEY_FROM !== 'undefined') try { v = JSON.parse(localStorage.getItem(STORE_KEY_FROM)); if (v) v.tips = []; } catch (e) {}
  return { best: {}, level: 0, tips: [], menu: {}, ...(v || {}) };
}
function writeSave(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) {} }

let audioCtx = null;
function beep(freq, ms, vol = 0.12, type = 'sine', delay = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime + delay, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + ms / 1000);
  } catch (e) {}
}
function pulse(hand, strength, ms) { try { if (hand && hand.haptic) hand.haptic.pulse(strength, ms); } catch (e) {} }

// 3D sound: plays from a point in the world, so you can hear where the disc is. The listener follows your head.
function setListener(pos, fwd) {
  if (!audioCtx) return;
  const L = audioCtx.listener;
  try {
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  } catch (e) {}
}
function spatialOut(pos) {
  const p = audioCtx.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 6; p.rolloffFactor = 0.7; p.maxDistance = 200;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
  p.connect(audioCtx.destination);
  return p;
}
function beepAt(freq, ms, vol, type, pos, delay = 0) {
  if (!pos) return beep(freq, ms, vol, type, delay);
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime + delay, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol * 2, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
    o.connect(g).connect(spatialOut(pos)); o.start(t0); o.stop(t0 + ms / 1000);
  } catch (e) {}
}
// A burst of filtered noise (steam hiss, whoosh, crowd-ish swell). sweep: [fromHz, toHz].
function noiseAt(ms, vol, pos, sweep = [800, 800], q = 0.8) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.ceil(audioCtx.sampleRate * ms / 1000), buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.min(1, i / (len * 0.1)) * Math.min(1, (len - i) / (len * 0.4));
    const src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain(), t0 = audioCtx.currentTime;
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(sweep[0], t0); f.frequency.exponentialRampToValueAtTime(sweep[1], t0 + ms / 1000);
    g.gain.value = vol * (pos ? 2 : 1);
    src.connect(f).connect(g).connect(pos ? spatialOut(pos) : audioCtx.destination);
    src.start();
  } catch (e) {}
}

function reflect(vel, n, bounce) {
  const vn = vel.dot(n);
  if (vn >= 0) return 0;
  vel.addScaledVector(n, -(1 + bounce) * vn);
  return -vn;
}

// Keeps a sphere inside the arena and out of obstacles, bouncing its velocity. Returns the hardest hit speed.
// Obstacles: { type: 'ball', c, r } or { type: 'box', c, half, nhalf, q?, qInv? } (q = rotated box).
// Optional fields: bounce (overrides), spin (rad/s around the arena's vertical axis, for moving sweepers), tag.
// If `hit` is given, hit.obstacle is set to the last obstacle touched.
function resolveSphere(pos, vel, r, bounce, obstacles, hit) {
  let impact = 0;
  const rr = Math.hypot(pos.x, pos.z);
  if (rr > ARENA_R - r) {
    const nx = pos.x / rr, nz = pos.z / rr;
    pos.x = nx * (ARENA_R - r); pos.z = nz * (ARENA_R - r);
    cN.set(-nx, 0, -nz);
    impact = Math.max(impact, reflect(vel, cN, bounce));
  }
  if (pos.y < Y_MIN + r) { pos.y = Y_MIN + r; if (vel.y < 0) { impact = Math.max(impact, -vel.y); vel.y *= -bounce; } }
  if (pos.y > Y_MAX - r) { pos.y = Y_MAX - r; if (vel.y > 0) { impact = Math.max(impact, vel.y); vel.y *= -bounce; } }
  for (const o of obstacles) {
    const b = o.bounce !== undefined ? o.bounce : bounce;
    let n;
    if (o.type === 'ball') {
      cA.subVectors(pos, o.c);
      const d = cA.length(), min = o.r + r;
      if (d >= min || d < 1e-6) continue;
      n = cA.divideScalar(d);
      pos.copy(o.c).addScaledVector(n, min);
    } else {
      cA.subVectors(pos, o.c);
      if (o.q) cA.applyQuaternion(o.qInv);
      cB.copy(cA).clamp(o.nhalf, o.half);
      cC.subVectors(cA, cB);
      const d = cC.length();
      if (d >= r) continue;
      if (d < 1e-6) {
        const px = o.half.x - Math.abs(cA.x), py = o.half.y - Math.abs(cA.y), pz = o.half.z - Math.abs(cA.z);
        cC.set(0, 0, 0);
        if (px <= py && px <= pz) { cC.x = Math.sign(cA.x) || 1; cB.x = o.half.x * cC.x; }
        else if (py <= pz) { cC.y = Math.sign(cA.y) || 1; cB.y = o.half.y * cC.y; }
        else { cC.z = Math.sign(cA.z) || 1; cB.z = o.half.z * cC.z; }
      } else cC.divideScalar(d);
      pos.copy(cB).addScaledVector(cC, r);
      if (o.q) { pos.applyQuaternion(o.q); cC.applyQuaternion(o.q); }
      pos.add(o.c);
      n = cC;
    }
    impact = Math.max(impact, reflect(vel, n, b));
    if (o.spin) { // a spinning sweeper carries you along its swing
      vel.x += -o.spin * (pos.z - o.c.z) * 0.8;
      vel.z += o.spin * (pos.x - o.c.x) * 0.8;
    }
    if (hit) hit.obstacle = o;
  }
  return impact;
}

// Returns the flow direction (+1 or -1 along z) of the wind stream at pos, or 0.
function currentAt(winds, pos) {
  if (Math.abs(pos.z) > CURRENT_LEN) return 0;
  for (const c of winds) {
    const dx = pos.x - c.x, dy = pos.y - CURRENT_Y;
    if (dx * dx + dy * dy < CURRENT_R * CURRENT_R) return c.dir;
  }
  return 0;
}
function applyCurrent(winds, pos, vel, dt) {
  const dir = currentAt(winds, pos);
  if (dir && vel.z * dir < CURRENT_SPEED) vel.z += dir * CURRENT_ACCEL * dt;
  return dir;
}

// Bakes many static shapes into one mesh (one draw call). parts: { geo, pos, rot (deg), scale, color }.
function mergeParts(parts) {
  let count = 0;
  const geos = parts.map(p => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    const r = p.rot || [0, 0, 0], s = p.scale || [1, 1, 1];
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p.pos), new T.Quaternion().setFromEuler(new T.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)), new T.Vector3(...s)));
    count += g.attributes.position.count;
    return g;
  });
  const P = new Float32Array(count * 3), N = new Float32Array(count * 3), C = new Float32Array(count * 3), col = new T.Color();
  const hasUv = geos.every(g => g.attributes.uv), U = hasUv ? new Float32Array(count * 2) : null;
  let o = 0;
  geos.forEach((g, i) => {
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    if (U) U.set(g.attributes.uv.array, o * 2);
    col.set(parts[i].color || '#ffffff');
    for (let k = 0; k < g.attributes.position.count; k++) C.set([col.r, col.g, col.b], (o + k) * 3);
    o += g.attributes.position.count;
  });
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(P, 3));
  out.setAttribute('normal', new T.BufferAttribute(N, 3));
  out.setAttribute('color', new T.BufferAttribute(C, 3));
  if (U) out.setAttribute('uv', new T.BufferAttribute(U, 2));
  return out;
}

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; }
  return t;
}

// Seeded random so painted skies and floors look the same every time.
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function skyTexture(spec) {
  return canvasTexture(2048, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    for (const [at, c] of spec.stops) grd.addColorStop(at, c);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const rnd = seeded(7);
    for (const [i, c] of (spec.nebula || []).entries()) {
      for (let k = 0; k < 5; k++) {
        const x = rnd() * w, y = h * (0.12 + rnd() * 0.3), r = (60 + rnd() * 160) * w / 1024;
        const ng = g.createRadialGradient(x, y, 0, x, y, r);
        ng.addColorStop(0, c + '55'); ng.addColorStop(1, c + '00');
        g.fillStyle = ng; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < (spec.stars || 0) * 2; i++) {
      const y = rnd() * h * 0.5, a = 0.3 + rnd() * 0.7 * (1 - y / (h * 0.5));
      const s = rnd() < 0.06 ? 3 : rnd() < 0.3 ? 2 : 1.4, x = rnd() * w;
      if (s === 3) { const sg = g.createRadialGradient(x, y, 0, x, y, 6); sg.addColorStop(0, `rgba(255,255,255,${a})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sg; g.fillRect(x - 6, y - 6, 12, 12); }
      else { g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; g.fillRect(x, y, s, s); }
    }
    // Aurora ribbons (Moon Castle) and long sun rays (Cloud Court) for extra depth.
    if (spec.aurora) for (let k = 0; k < 3; k++) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let x = 0; x < w; x += 4) {
        const y = h * (0.2 + k * 0.05) + Math.sin(x / 140 + k * 2) * 40 + Math.sin(x / 47 + k) * 12;
        const ag = g.createLinearGradient(0, y - 90, 0, y + 10); ag.addColorStop(0, spec.aurora[k % spec.aurora.length] + '00'); ag.addColorStop(0.8, spec.aurora[k % spec.aurora.length] + '30'); ag.addColorStop(1, spec.aurora[k % spec.aurora.length] + '00');
        g.fillStyle = ag; g.fillRect(x, y - 90, 4, 100);
      }
      g.restore();
    }
    if (spec.haze) {
      const hg = g.createLinearGradient(0, h * 0.38, 0, h * 0.56);
      hg.addColorStop(0, spec.haze + '00'); hg.addColorStop(0.7, spec.haze + '66'); hg.addColorStop(1, spec.haze + '00');
      g.fillStyle = hg; g.fillRect(0, h * 0.38, w, h * 0.18);
    }
    if (spec.sun) {
      const x = w * 0.62, y = h * 0.22, R = 120 * w / 1024, sg = g.createRadialGradient(x, y, 0, x, y, R);
      sg.addColorStop(0, spec.sun); sg.addColorStop(0.15, spec.sun + 'cc'); sg.addColorStop(1, spec.sun + '00');
      g.fillStyle = sg; g.fillRect(x - R, y - R, R * 2, R * 2);
    }
    if (spec.puffs) {
      for (let k = 0; k < 40; k++) {
        const x = rnd() * w, y = h * (0.15 + rnd() * 0.32), r = (20 + rnd() * 50) * w / 1024;
        const pg = g.createRadialGradient(x, y, 0, x, y, r);
        pg.addColorStop(0, spec.puffs + '88'); pg.addColorStop(1, spec.puffs + '00');
        g.fillStyle = pg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  });
}

// Floor surfaces (2026-11-19): painted at 1024 px with real material detail. A 512 px noise layer (per pixel, seeded, tiling)
// gives the base color, then fine detail is drawn on top at full size: grass blades, wood grain, stone edges, steel tread.
// The relief map (js/gfx.js floorNormalMap) is made from this picture, so seams, mortar and tread all catch the light.
// Soft lines and mipmaps keep it from shimmering in the headset.
function paintFloor(kind) {
  const W = 1024, B = 512, rnd = seeded(11), N = makeNoise(kind.length * 31 + 7);
  // per-pixel base layer at 512, scaled up
  const base = (fn) => {
    const c = document.createElement('canvas'); c.width = c.height = B;
    const g = c.getContext('2d'), img = g.createImageData(B, B);
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
      const [r, gg, b] = fn(x / B, y / B), o = (y * B + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  const cl = v => Math.max(0, Math.min(255, v));
  const paint = {
    grid: (g, w, h) => {
      g.drawImage(base((u, v) => { const n = N.fbm(u * 8, v * 8, 8, 4), k = 0.75 + n * 0.5; return [cl(12 * k), cl(16 * k), cl(44 * k)]; }), 0, 0, w, h);
      // faint sub-grid, then the glowing main grid
      g.strokeStyle = 'rgba(102,255,255,0.12)'; g.lineWidth = 2;
      for (let i = 0; i <= 16; i++) { const p = i * w / 16; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      g.strokeStyle = 'rgba(102,255,255,0.6)'; g.lineWidth = 7; g.shadowColor = '#66ffff'; g.shadowBlur = 14;
      for (let i = 0; i <= 4; i++) { const p = i * w / 4; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      g.shadowBlur = 0;
    },
    plates: (g, w, h) => {
      // grimy steel, then diamond tread, plate seams, rivets and scuffs
      g.drawImage(base((u, v) => { const n = N.fbm(u * 6, v * 6, 6, 4), grime = Math.max(0, N.fbm(u * 3 + 5, v * 3, 3, 3) - 0.5) * 1.6, k = 0.82 + n * 0.3 - grime * 0.35;
        return [cl(98 * k), cl(102 * k), cl(110 * k)]; }), 0, 0, w, h);
      const step = w / 32;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const cx = (x + 0.5) * step, cy = (y + 0.5) * step, ang = (x + y) % 2 ? 0.8 : -0.8;
        g.save(); g.translate(cx, cy); g.rotate(ang);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(1.5, 2, step * 0.36, step * 0.1, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(210,214,222,0.55)'; g.beginPath(); g.ellipse(0, 0, step * 0.34, step * 0.085, 0, 0, 7); g.fill();
        g.restore();
      }
      g.strokeStyle = 'rgba(20,22,26,0.85)'; g.lineWidth = 5;
      for (const p of [0, w / 2]) { g.beginPath(); g.moveTo(p + 2, 0); g.lineTo(p + 2, h); g.moveTo(0, p + 2); g.lineTo(w, p + 2); g.stroke(); }
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) for (const [rx, ry] of [[22, 22], [w / 2 - 22, 22], [22, h / 2 - 22], [w / 2 - 22, h / 2 - 22]]) {
        const px = x * w / 2 + rx, py = y * h / 2 + ry, gr = g.createRadialGradient(px - 3, py - 3, 1, px, py, 10);
        gr.addColorStop(0, '#d8dce4'); gr.addColorStop(1, '#3a3d44'); g.fillStyle = gr; g.beginPath(); g.arc(px, py, 9, 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
      for (let i = 0; i < 60; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 80 - 40, y + rnd() * 10 - 5); g.stroke(); }
    },
    cobble: (g, w, h) => {
      // Voronoi stones (tiling): each pixel finds its nearest two stone centers; the gap between them is mortar.
      const n = 9, pts = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pts.push([(x + 0.2 + rnd() * 0.6) / n, (y + 0.2 + rnd() * 0.6) / n, rnd()]);
      g.drawImage(base((u, v) => {
        let d1 = 9, d2 = 9, id = 0;
        const cx = Math.floor(u * n), cy = Math.floor(v * n);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const gx = (cx + ox + n) % n, gy = (cy + oy + n) % n, p = pts[gy * n + gx];
          const px = p[0] + (cx + ox - gx) / n, py = p[1] + (cy + oy - gy) / n, d = Math.hypot(u - px, v - py);
          if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d;
        }
        const edge = (d2 - d1) * n, mortar = edge < 0.08 ? 1 : edge < 0.16 ? 1 - (edge - 0.08) / 0.08 : 0;
        const tone = 0.75 + id * 0.35, grain = 0.88 + N.fbm(u * 40, v * 40, 40, 3) * 0.24, dome = Math.min(1, edge * 2.2);
        const k = tone * grain * (0.7 + dome * 0.3), stone = [108 * k, 112 * k, 124 * k], m = [40, 46, 42];
        return stone.map((s, i) => cl(s + (m[i] - s) * mortar));
      }), 0, 0, w, h);
      // moss in some of the cracks
      g.globalAlpha = 0.18;
      for (let i = 0; i < 400; i++) { g.fillStyle = rnd() < 0.5 ? '#4f7a3a' : '#3d5f30'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 4, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    },
    planks: (g, w, h) => {
      // 8 boards with their own tone, warped grain running along them, end joints and a varnish sheen
      const tones = [[217, 167, 108], [207, 154, 95], [212, 160, 102], [201, 147, 88], [222, 172, 114], [205, 152, 92], [214, 163, 104], [199, 145, 86]];
      g.drawImage(base((u, v) => {
        const i = Math.floor(u * 8), t = tones[i], lu = u * 8 - i;
        const warp = N.fbm(lu * 2 + i * 3, v * 3, 256, 4), grain = Math.sin((lu * 22 + warp * 6) * Math.PI), ring = Math.pow(Math.abs(grain), 0.4);
        const knot = Math.max(0, 1 - Math.hypot(lu - 0.5, (v * 2 + i * 0.37) % 1 - 0.5) * 9) * (i % 3 === 0 ? 1 : 0);
        const k = 0.86 + ring * 0.16 - knot * 0.35 + N.n2(u * 300, v * 6, 300) * 0.05;
        return [cl(t[0] * k), cl(t[1] * k), cl(t[2] * k)];
      }), 0, 0, w, h);
      g.fillStyle = 'rgba(90,50,20,0.45)';
      for (let i = 0; i <= 8; i++) g.fillRect(i * w / 8 - 2, 0, 4, h);
      for (let i = 0; i < 8; i++) { const y = rnd() * h; g.fillRect(i * w / 8, y - 2, w / 8, 3); }
      const sheen = g.createLinearGradient(0, 0, w, h); sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = sheen; g.fillRect(0, 0, w, h);
    },
    turf: (g, w, h) => {
      // living grass: patchy color, soft mowing stripes, then thousands of blades and a few clover patches
      g.drawImage(base((u, v) => { const n = N.fbm(u * 6, v * 6, 6, 4), dry = Math.max(0, N.fbm(u * 3 + 4, v * 3, 3, 3) - 0.58) * 2, stripe = u < 0.5 ? 1.06 : 0.95;
        const k = (0.85 + n * 0.3) * stripe; return [cl((72 + dry * 40) * k), cl((132 - dry * 10) * k), cl((62 - dry * 10) * k)]; }), 0, 0, w, h);
      g.lineCap = 'round';
      for (let i = 0; i < 26000; i++) {
        const x = rnd() * w, y = rnd() * h, len = 5 + rnd() * 9, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9, l = rnd();
        g.strokeStyle = l < 0.33 ? 'rgba(40,90,34,0.55)' : l < 0.75 ? 'rgba(98,160,74,0.5)' : 'rgba(150,196,104,0.45)';
        g.lineWidth = 1 + rnd() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
      }
      for (let i = 0; i < 25; i++) { const x = rnd() * w, y = rnd() * h; for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(52,104,44,0.5)'; g.beginPath(); g.arc(x + rnd() * 18 - 9, y + rnd() * 18 - 9, 3, 0, 7); g.fill(); } }
    }
  }[kind];
  const c = document.createElement('canvas'); c.width = c.height = W; paint(c.getContext('2d'), W, W);
  return c;
}

// Baked copies of the painted textures (v3/textures/, made by tests/bake-textures.js) load in the background, so switching
// realms never freezes the headset while a texture is painted. The texture starts as a flat canvas of the final size in the
// average color; the picture is drawn into it when the file arrives. If the file is missing it is painted in code instead.
const TEX_DIR = 'textures/';
function loadBaked(file, size, srgb, repeat, paint, average = '#808080') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = average; g.fillRect(0, 0, size, size);
  const t = new T.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  const img = new Image();
  img.onload = () => { g.drawImage(img, 0, 0, size, size); t.needsUpdate = true; };
  img.onerror = () => { console.warn('Surge: no baked ' + file + ', painting it'); g.drawImage(paint(), 0, 0, size, size); t.needsUpdate = true; };
  img.src = TEX_DIR + file;
  return t;
}
const FLOOR_REPEAT = { grid: 15, plates: 15, cobble: 18, planks: 12, turf: 10 };
const FLOOR_AVG = { grid: '#0e1430', plates: '#62666e', cobble: '#5e6270', planks: '#c99a62', turf: '#4f8a43' };
const FLOOR_RELIEF = { grid: 3, plates: 5, cobble: 7, planks: 4, turf: 2.5 };
// The floor picture, with its relief map in userData.normal. repeat: how often it tiles across the field (the ground outside
// the field uses a bigger number).
function floorTexture(kind, repeat = FLOOR_REPEAT[kind]) {
  let painted = null; const paint = () => painted || (painted = paintFloor(kind));
  const t = loadBaked('floor-' + kind + '.jpg', 1024, true, repeat, paint, FLOOR_AVG[kind]);
  t.userData.normal = loadBaked('floor-' + kind + '-n.jpg', 1024, false, repeat, () => normalCanvas(paint(), FLOOR_RELIEF[kind]), '#8080ff');
  return t;
}

// Soft round dot for particles (plain points draw as squares).
let dotTex = null;
function dotTexture() {
  return dotTex || (dotTex = canvasTexture(64, 64, g => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }));
}

function vignetteTexture() {
  return canvasTexture(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.3, 'rgba(0,0,0,0)');
    grd.addColorStop(0.75, 'rgba(0,0,0,0.9)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  });
}
