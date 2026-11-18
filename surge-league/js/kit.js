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
  let o = 0;
  geos.forEach((g, i) => {
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    col.set(parts[i].color || '#ffffff');
    for (let k = 0; k < g.attributes.position.count; k++) C.set([col.r, col.g, col.b], (o + k) * 3);
    o += g.attributes.position.count;
  });
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(P, 3));
  out.setAttribute('normal', new T.BufferAttribute(N, 3));
  out.setAttribute('color', new T.BufferAttribute(C, 3));
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

// Floor patterns. Soft lines (not 1-pixel) and mipmaps keep them from shimmering in the headset.
function floorTexture(kind) {
  const rnd = seeded(11);
  const paint = {
    grid: (g, w, h) => {
      g.fillStyle = '#0b0f2a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(102,255,255,0.55)'; g.lineWidth = 4; g.shadowColor = '#66ffff'; g.shadowBlur = 8;
      for (let i = 0; i <= 4; i++) { const p = i * w / 4; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
    },
    plates: (g, w, h) => {
      g.fillStyle = '#5b5f66'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        g.fillStyle = ['#62666e', '#575b62', '#5e626a', '#53575e'][y * 2 + x]; g.fillRect(x * w / 2 + 4, y * h / 2 + 4, w / 2 - 8, h / 2 - 8);
        g.fillStyle = '#3a3d42';
        for (const [rx, ry] of [[16, 16], [w / 2 - 16, 16], [16, h / 2 - 16], [w / 2 - 16, h / 2 - 16]]) { g.beginPath(); g.arc(x * w / 2 + rx, y * h / 2 + ry, 5, 0, 7); g.fill(); }
      }
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2;
      for (let i = 0; i < 30; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 40 - 20, y + rnd() * 6 - 3); g.stroke(); }
    },
    cobble: (g, w, h) => {
      g.fillStyle = '#2e3a2c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 18, v = 70 + Math.floor(rnd() * 50);
        g.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
        g.beginPath(); g.ellipse(x, y, r, r * (0.7 + rnd() * 0.3), rnd() * 3, 0, 7); g.fill();
      }
    },
    planks: (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ['#d9a76c', '#cf9a5f', '#d4a066', '#c99358'][i % 4]; g.fillRect(i * w / 8, 0, w / 8, h);
        g.fillStyle = 'rgba(120,70,30,0.25)'; g.fillRect(i * w / 8, 0, 2, h);
        g.strokeStyle = 'rgba(140,90,40,0.18)'; g.lineWidth = 2;
        for (let k = 0; k < 4; k++) { const x = i * w / 8 + 6 + rnd() * (w / 8 - 12); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h / 3, x - 6, h * 2 / 3, x, h); g.stroke(); }
      }
    },
    turf: (g, w, h) => {
      g.fillStyle = '#4f8f4a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5a9a52'; g.fillRect(0, 0, w / 2, h);
      for (let i = 0; i < 400; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(rnd() * w, rnd() * h, 2, 6); }
    }
  }[kind];
  return canvasTexture(512, 512, paint, { grid: 15, plates: 15, cobble: 18, planks: 12, turf: 10 }[kind]);
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
