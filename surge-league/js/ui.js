// Surge League v2 interface: crisp canvas-drawn panels (menus, pause, scoreboard, messages) you can point at and click.
// Text is drawn with the Exo 2 font (fonts/exo2-latin.woff2, Open Font License) at a high resolution so it stays sharp in the headset.
const UI_FONT = '"Exo 2", "Segoe UI", Roboto, system-ui, sans-serif';
const UI = { panels: new Set(), fontReady: false };
(() => {
  const done = () => { UI.fontReady = true; for (const p of UI.panels) p.dirty = true; };
  try {
    const f = new FontFace('Exo 2', 'url(fonts/exo2-latin.woff2)', { weight: '500 900' });
    f.load().then(ff => { document.fonts.add(ff); done(); }, done);
  } catch (e) { done(); }
})();

const uiFont = (px, weight = 700) => `${weight} ${Math.round(px)}px ${UI_FONT}`;
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Shrinks the font until the text fits; returns the size used.
function fitFont(g, text, maxW, px, weight = 700) {
  let s = px; g.font = uiFont(s, weight);
  while (s > 12 && g.measureText(text).width > maxW) { s -= 2; g.font = uiFont(s, weight); }
  return s;
}
function wrapLines(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function textShadow(g, blur = 10, color = 'rgba(0,0,0,0.55)') { g.shadowColor = color; g.shadowBlur = blur; g.shadowOffsetY = blur / 4; }
function noShadow(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; }
function hexA(hex, a) { const c = new T.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; }

const uiM = new T.Matrix4(), uiV1 = new T.Vector3(), uiV2 = new T.Vector3();
function shownInScene(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

// A flat panel in the world drawn with a 2D canvas. paint(g, W, H, panel) draws it and registers buttons with panel.button().
class UIPanel {
  constructor(w, h, ppm = 800, opts = {}) {
    this.w = w; this.h = h; this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.W = this.canvas.width = Math.round(w * ppm); this.H = this.canvas.height = Math.round(h * ppm);
    this.g = this.canvas.getContext('2d');
    this.tex = new T.CanvasTexture(this.canvas);
    if ('colorSpace' in this.tex) this.tex.colorSpace = T.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const order = opts.order || 20; // drawn after the world's see-through objects
    this.mat = new T.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    if (opts.onTop) this.mat.depthTest = false;
    this.mesh = new T.Mesh(new T.PlaneGeometry(w, h), this.mat);
    this.mesh.renderOrder = order;
    this.buttons = []; this.dirty = true; this.paint = null; this.opacity = 1;
    // Hover frame: four thin bars and a faint fill, moved over the button you point at (no canvas redraw needed).
    this.hi = new T.Group();
    this.hiMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, fog: false, depthTest: !opts.onTop });
    this.hiFillMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false, fog: false, depthTest: !opts.onTop });
    for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.PlaneGeometry(1, 1), this.hiMat); m.renderOrder = order + 1; this.hi.add(m); }
    this.hiFill = new T.Mesh(new T.PlaneGeometry(1, 1), this.hiFillMat); this.hiFill.renderOrder = order + 1;
    this.hi.add(this.hiFill);
    this.hi.position.z = 0.003; this.hi.visible = false;
    this.mesh.add(this.hi);
    UI.panels.add(this);
  }
  set(paint) { this.paint = paint; this.dirty = true; }
  button(b) { this.buttons.push(b); return b; }
  update() {
    if (!this.dirty || !this.paint) return;
    const g = this.g;
    g.clearRect(0, 0, this.W, this.H);
    this.buttons = [];
    this.paint(g, this.W, this.H, this);
    noShadow(g);
    this.tex.needsUpdate = true; this.dirty = false;
  }
  setOpacity(a) {
    this.opacity = a;
    this.mat.opacity = a;
    this.mesh.visible = a > 0.01 && this.mesh.userData.show !== false;
  }
  // Where a world-space ray hits this panel: { btn, point, dist } or null.
  pick(origin, dir) {
    if (!shownInScene(this.mesh)) return null;
    const m = this.mesh; m.updateWorldMatrix(true, false);
    uiM.copy(m.matrixWorld).invert();
    const o = uiV1.copy(origin).applyMatrix4(uiM), e = uiV2.copy(origin).add(dir).applyMatrix4(uiM).sub(o);
    if (Math.abs(e.z) < 1e-6) return null;
    const t = -o.z / e.z;
    if (t <= 0) return null;
    const lx = o.x + e.x * t, ly = o.y + e.y * t;
    if (Math.abs(lx) > this.w / 2 || Math.abs(ly) > this.h / 2) return null;
    const px = (lx / this.w + 0.5) * this.W, py = (0.5 - ly / this.h) * this.H;
    const point = new T.Vector3(lx, ly, 0).applyMatrix4(m.matrixWorld);
    const btn = this.buttons.find(b => !b.disabled && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
    return { btn, point, dist: point.distanceTo(origin) };
  }
  highlight(b, color = '#ffffff') {
    if (!b) { this.hi.visible = false; return; }
    const sx = this.w / this.W, sy = this.h / this.H, pad = 6;
    const cx = (b.x + b.w / 2) * sx - this.w / 2, cy = this.h / 2 - (b.y + b.h / 2) * sy;
    const bw = (b.w + pad * 2) * sx, bh = (b.h + pad * 2) * sy, t = 0.007;
    const [top, bottom, left, right] = this.hi.children;
    top.position.set(cx, cy + bh / 2, 0); top.scale.set(bw + t, t, 1);
    bottom.position.set(cx, cy - bh / 2, 0); bottom.scale.set(bw + t, t, 1);
    left.position.set(cx - bw / 2, cy, 0); left.scale.set(t, bh, 1);
    right.position.set(cx + bw / 2, cy, 0); right.scale.set(t, bh, 1);
    this.hiFill.position.set(cx, cy, -0.001); this.hiFill.scale.set(bw, bh, 1);
    this.hiMat.color.set(color); this.hiFillMat.color.set(color);
    this.hi.visible = true;
  }
}

// A soft-edged label that always faces you (hoop and rider names).
function labelSprite(text, { color = '#ffffff', bg = 'rgba(8,18,31,0.55)', height = 0.8, weight = 800 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), px = 72;
  g.font = uiFont(px, weight);
  c.width = Math.ceil(g.measureText(text).width * 1.15) + 72; c.height = 112;
  const tex = new T.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height); noShadow(g);
    if (bg) { g.fillStyle = bg; rrect(g, 4, 8, c.width - 8, c.height - 16, 40); g.fill(); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitFont(g, text, c.width - 48, px, weight); textShadow(g, 8);
    g.fillText(text, c.width / 2, c.height / 2 + 4);
    tex.needsUpdate = true;
  };
  draw();
  // The font finishes loading after the first frames; draw again with it.
  if (!UI.fontReady) UI.panels.add({ set dirty(v) { if (v) draw(); } });
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.set(height * c.width / c.height, height, 1);
  return s;
}

// A soft round glow (additive) used for halos around hoops, the disc, riders and hazards.
let glowTexCache = null;
function glowTexture() {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTexCache = new T.CanvasTexture(c);
  return glowTexCache;
}
function glowSprite(color, size, opacity = 0.8) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false }));
  s.scale.set(size, size, 1);
  return s;
}

// ------------------------------------------------------------------ Quest controller diagram
// Draws a Touch controller seen from above at (cx, top), s = height in px. side 'left' | 'right'.
// lit: a set of parts to glow ('stick', 'x', 'y', 'a', 'b', 'grip', 'trigger'). Returns where each part is (for callout lines).
function paintController(g, cx, top, s, side, lit = new Set(), pulse = 1) {
  const m = side === 'left' ? -1 : 1, P = (x, y) => [cx + x * s * m, top + y * s];
  const glow = (on, base) => on ? '#66ffff' : base;
  const parts = {};
  g.save();
  const lightUp = on => { if (on) { g.shadowColor = '#66ffff'; g.shadowBlur = 28 * pulse; } };
  // Trigger and grip stick out on the inner side (the side facing your other hand)
  const trig = lit.has('trigger'), grip = lit.has('grip');
  lightUp(trig); g.fillStyle = glow(trig, '#566175');
  g.save(); g.translate(...P(-0.27, 0.2)); g.rotate(-0.5 * m); rrect(g, -s * 0.05, -s * 0.09, s * 0.1, s * 0.18, s * 0.05); g.fill(); g.restore();
  noShadow(g); parts.trigger = P(-0.3, 0.2);
  lightUp(grip); g.fillStyle = glow(grip, '#566175');
  g.save(); g.translate(...P(-0.2, 0.62)); g.rotate(0.12 * -m); rrect(g, -s * 0.045, -s * 0.16, s * 0.09, s * 0.32, s * 0.045); g.fill(); g.restore();
  noShadow(g); parts.grip = P(-0.23, 0.62);
  // Handle and face
  g.fillStyle = '#2b313c';
  g.beginPath();
  g.moveTo(...P(-0.24, 0.12)); g.quadraticCurveTo(...P(-0.27, 0.42), ...P(-0.16, 0.52));
  g.lineTo(...P(-0.12, 0.98)); g.quadraticCurveTo(...P(0, 1.04), ...P(0.12, 0.98));
  g.lineTo(...P(0.16, 0.52)); g.quadraticCurveTo(...P(0.27, 0.42), ...P(0.24, 0.12));
  g.quadraticCurveTo(...P(0, -0.02), ...P(-0.24, 0.12));
  g.fill();
  // Tracking ring
  g.strokeStyle = '#444d5e'; g.lineWidth = s * 0.07;
  g.beginPath(); g.arc(...P(0, -0.2), s * 0.27, 0, Math.PI * 2); g.stroke();
  // Face: thumbstick and two buttons (left: X lower, Y upper; right: A lower, B upper)
  const btn = (id, x, y, r, label) => {
    const on = lit.has(id);
    lightUp(on);
    g.fillStyle = glow(on, '#141920'); g.beginPath(); g.arc(...P(x, y), s * r, 0, Math.PI * 2); g.fill(); noShadow(g);
    g.strokeStyle = on ? '#e9ffff' : '#6b7690'; g.lineWidth = s * 0.012; g.stroke();
    if (label) { g.fillStyle = on ? '#04121f' : '#e3eaf4'; g.font = uiFont(s * r * 1.25, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, ...P(x, y + r * 0.1)); }
    parts[id] = P(x, y);
  };
  btn('stick', -0.09, 0.3, 0.095, '');
  g.fillStyle = lit.has('stick') ? '#04121f' : '#39414f'; g.beginPath(); g.arc(...P(-0.09, 0.3), s * 0.05, 0, Math.PI * 2); g.fill();
  btn(side === 'left' ? 'y' : 'b', 0.11, 0.22, 0.07, side === 'left' ? 'Y' : 'B');
  btn(side === 'left' ? 'x' : 'a', 0.08, 0.41, 0.07, side === 'left' ? 'X' : 'A');
  g.restore();
  return parts;
}
// A label with a line pointing at a controller part.
function callout(g, from, to, title, sub, align, on) {
  g.strokeStyle = on ? '#66ffff' : 'rgba(160,190,220,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(...from); g.lineTo(to[0] + (align === 'right' ? 12 : -12), to[1]); g.stroke();
  g.fillStyle = on ? '#66ffff' : '#8fa8c4'; g.beginPath(); g.arc(...from, 6, 0, Math.PI * 2); g.fill();
  g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = '#eaf4ff'; fitFont(g, title, 320, 30, 900); g.fillText(title, to[0], to[1] - 15);
  g.fillStyle = '#9db4cc'; fitFont(g, sub, 320, 22, 600); g.fillText(sub, to[0], to[1] + 17);
}

// How to play: both controllers with every button labeled, the goal, and ways to score.
const HELP_W = 1.9, HELP_H = 1.3;
function paintHowTo(g, W, H, panel, m) {
  g.fillStyle = 'rgba(8,16,32,0.96)'; rrect(g, 0, 0, W, H, 36); g.fill();
  g.strokeStyle = 'rgba(102,255,255,0.45)'; g.lineWidth = 4; rrect(g, 2, 2, W - 4, H - 4, 34); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#eaf4ff'; g.font = uiFont(56, 900); textShadow(g, 12); g.fillText('HOW TO PLAY', W / 2, 58); noShadow(g);
  if (m.inVR) {
    const L = paintController(g, 520, 272, 320, 'left'), R = paintController(g, W - 520, 272, 320, 'right');
    const lx = 340, rx = W - 340, ys = [170, 265, 360, 455, 550];
    callout(g, L.trigger, [lx, ys[0]], 'TRIGGER  PASS', 'point at your ally', 'right');
    callout(g, L.y, [lx, ys[1]], 'Y  PAUSE', 'menu, settings, exit', 'right');
    callout(g, L.stick, [lx, ys[2]], 'STICK  FLY · PUSH = BOOST', 'go where your hands point', 'right');
    callout(g, L.x, [lx, ys[3]], 'X  RIGHT SIDE UP', 'after flips and loops', 'right');
    callout(g, L.grip, [lx, ys[4]], 'GRIP  GRAB', 'disc, or hold an air pocket', 'right');
    callout(g, R.trigger, [rx, ys[0]], 'TRIGGER  PULL', 'point at the disc', 'left');
    callout(g, R.b, [rx, ys[1]], 'B  POWER', m.power, 'left');
    callout(g, R.stick, [rx, ys[2]], 'STICK  UP/DOWN · PUSH = BOOST', 'sideways to turn', 'left');
    callout(g, R.a, [rx, ys[3]], 'A  RIGHT SIDE UP', 'and select in menus', 'left');
    callout(g, R.grip, [rx, ys[4]], 'GRIP  THROW', 'swing and let go', 'left');
  } else {
    const keys = [['WASD', 'fly where you look'], ['E / Q', 'up / down'], ['SHIFT', 'boost (hold to keep going)'], ['L', 'right side up'], ['HOLD G', 'pull the disc'], ['SPACE', 'throw'], ['F', 'pass'], ['C', 'realm power'], ['P', 'pause']];
    keys.forEach(([k, v], i) => {
      const x = 180 + (i % 2) * 760, y = 170 + Math.floor(i / 2) * 105;
      g.fillStyle = 'rgba(102,255,255,0.15)'; rrect(g, x, y - 36, 190, 72, 16); g.fill();
      g.fillStyle = '#66ffff'; g.font = uiFont(30, 900); g.textAlign = 'center'; g.fillText(k, x + 95, y);
      g.fillStyle = '#eaf4ff'; g.font = uiFont(30, 700); g.textAlign = 'left'; g.fillText(v, x + 220, y);
    });
  }
  // How to score
  const y0 = 650;
  g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, 44, y0, W - 88, 210, 24); g.fill();
  const items = [['THROW', 'through an orange hoop', 'small hoop 2 · big hoop 1'], ['DUNK', 'fly through a hoop holding the disc', '+2 extra'],
                 ['TRICK SHOT', 'bank it in off a prism', 'double points'], ['SNITCH', 'catch the golden snitch', '+3']];
  items.forEach(([t, a, b], i) => {
    const x = 44 + (W - 88) / 4 * (i + 0.5);
    g.textAlign = 'center'; g.fillStyle = '#ffd166'; g.font = uiFont(34, 900); g.fillText(t, x, y0 + 50);
    g.fillStyle = '#eaf4ff'; fitFont(g, a, (W - 88) / 4 - 30, 24, 600); g.fillText(a, x, y0 + 100);
    g.fillStyle = '#9db4cc'; g.font = uiFont(22, 600); g.fillText(b, x, y0 + 140);
  });
  g.fillStyle = '#9db4cc'; g.font = uiFont(24, 600); g.textAlign = 'center';
  g.fillText(m.inVR ? 'Point both hands up and boost to loop over backwards.  Boost into a rival to knock the disc loose.' : 'Steal from the front, never from behind.  Boost into a rival to knock the disc loose.  Grab glowing orbs for power-ups.', W / 2, 900);
  const b = panel.button({ id: 'help-close', x: W / 2 - 220, y: 935, w: 440, h: 0, row: 0, col: 0 });
  b.h = H - 935 - 24;
  g.fillStyle = '#66ffff'; rrect(g, b.x, b.y, b.w, b.h, 22); g.fill();
  g.fillStyle = '#04121f'; g.font = uiFont(40, 900); g.fillText('GOT IT', W / 2, b.y + b.h / 2 + 2);
}

// ------------------------------------------------------------------ painted realm cards (menu tiles and the portal card)
function paintRealmArt(g, x, y, w, h, realm) {
  g.save();
  rrect(g, x, y, w, h, 18); g.clip();
  if (!realm) { // shuffle: a slice of every realm
    REALMS.forEach((r, i) => { g.save(); g.beginPath(); const x0 = x + (i - 0.5) * w / 4.2, x1 = x0 + w / 4.2; g.moveTo(x0, y + h); g.lineTo(x0 + w * 0.35, y); g.lineTo(x1 + w * 0.35, y); g.lineTo(x1, y + h); g.closePath(); g.clip(); paintRealmArt(g, x - w * 0.2, y, w * 1.4, h, r); g.restore(); });
    g.fillStyle = 'rgba(5,10,25,0.35)'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff'; g.font = uiFont(h * 0.5, 900); g.textAlign = 'center'; g.textBaseline = 'middle';
    textShadow(g, 16); g.fillText('?', x + w / 2, y + h * 0.48); noShadow(g);
    g.restore();
    return;
  }
  const grd = g.createLinearGradient(0, y, 0, y + h);
  const stops = realm.sky.stops;
  for (const [at, c] of stops) grd.addColorStop(Math.min(1, at * 1.6), c);
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  const rnd = seeded(realm.id.length * 31 + 7), X = f => x + f * w, Y = f => y + f * h, S = f => f * Math.min(w, h);
  if (realm.id === 'saucer') {
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; g.fillRect(X(rnd()), Y(rnd() * 0.8), 2, 2); }
    const neb = g.createRadialGradient(X(0.3), Y(0.4), 0, X(0.3), Y(0.4), S(0.7)); neb.addColorStop(0, 'rgba(255,79,216,0.35)'); neb.addColorStop(1, 'rgba(255,79,216,0)');
    g.fillStyle = neb; g.fillRect(x, y, w, h);
    g.fillStyle = '#6a4cff'; g.beginPath(); g.arc(X(0.7), Y(0.38), S(0.22), 0, 7); g.fill();
    g.strokeStyle = 'rgba(217,195,255,0.9)'; g.lineWidth = S(0.03); g.beginPath(); g.ellipse(X(0.7), Y(0.38), S(0.4), S(0.09), -0.3, 0, 7); g.stroke();
    g.fillStyle = '#8aa4c4'; g.beginPath(); g.ellipse(X(0.28), Y(0.72), S(0.2), S(0.05), 0, 0, 7); g.fill();
    g.fillStyle = '#9ff'; g.beginPath(); g.ellipse(X(0.28), Y(0.68), S(0.08), S(0.06), 0, Math.PI, 0); g.fill();
    g.strokeStyle = 'rgba(102,255,255,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x, Y(0.86 + i * 0.03)); g.lineTo(x + w, Y(0.86 + i * 0.03)); g.stroke(); }
  } else if (realm.id === 'foundry') {
    const glow = g.createLinearGradient(0, Y(0.6), 0, y + h); glow.addColorStop(0, 'rgba(255,90,26,0)'); glow.addColorStop(1, 'rgba(255,120,30,0.9)');
    g.fillStyle = glow; g.fillRect(x, Y(0.6), w, h * 0.4);
    g.fillStyle = '#2b1c16';
    for (const [fx, fw, fh] of [[0.08, 0.08, 0.6], [0.22, 0.06, 0.45], [0.82, 0.09, 0.7]]) g.fillRect(X(fx), Y(1 - fh), w * fw, h * fh);
    g.save(); g.translate(X(0.55), Y(0.5)); g.fillStyle = '#4a4440';
    g.beginPath(); g.arc(0, 0, S(0.22), 0, 7); g.fill();
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillRect(-S(0.035), -S(0.29), S(0.07), S(0.1)); }
    g.fillStyle = '#2b2622'; g.beginPath(); g.arc(0, 0, S(0.08), 0, 7); g.fill(); g.restore();
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,${150 + rnd() * 80 | 0},60,${0.4 + rnd() * 0.6})`; g.fillRect(X(rnd()), Y(0.3 + rnd() * 0.7), 3, 3); }
  } else if (realm.id === 'castle') {
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; g.fillRect(X(rnd()), Y(rnd() * 0.6), 2, 2); }
    const moon = g.createRadialGradient(X(0.72), Y(0.3), 0, X(0.72), Y(0.3), S(0.32)); moon.addColorStop(0, '#fffbe6'); moon.addColorStop(0.55, '#f4f1dc'); moon.addColorStop(0.6, 'rgba(244,241,220,0.25)'); moon.addColorStop(1, 'rgba(244,241,220,0)');
    g.fillStyle = moon; g.fillRect(x, y, w, h);
    g.fillStyle = '#141a33';
    g.fillRect(X(0.05), Y(0.62), w * 0.9, h * 0.38);
    for (const [fx, fh] of [[0.1, 0.55], [0.42, 0.7], [0.78, 0.5]]) {
      g.fillRect(X(fx), Y(1 - fh), w * 0.12, h * fh);
      g.beginPath(); g.moveTo(X(fx - 0.02), Y(1 - fh)); g.lineTo(X(fx + 0.06), Y(1 - fh - 0.18)); g.lineTo(X(fx + 0.14), Y(1 - fh)); g.fill();
    }
    g.fillStyle = '#ffcf6a';
    for (let i = 0; i < 9; i++) g.fillRect(X(0.12 + rnd() * 0.76), Y(0.66 + rnd() * 0.25), 4, 7);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(216,255,106,0.8)'; g.beginPath(); g.arc(X(rnd()), Y(0.4 + rnd() * 0.5), 2, 0, 7); g.fill(); }
  } else if (realm.id === 'gym') {
    ['#ff6b6b', '#ffb36b', '#ffe66b', '#7be08a', '#6bc5ff', '#8f7bff'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = S(0.045); g.beginPath(); g.arc(X(0.5), Y(0.95), S(0.62) - i * S(0.045), Math.PI, 0); g.stroke(); });
    g.fillStyle = '#d9a76c'; g.fillRect(x, Y(0.82), w, h * 0.18);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, Y(0.86)); g.lineTo(x + w, Y(0.86)); g.stroke();
    for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(X(rnd()), Y(0.1 + rnd() * 0.6), S(0.02 + rnd() * 0.04), 0, 7); g.stroke(); }
    g.fillStyle = '#e8342e'; g.beginPath(); g.arc(X(0.2), Y(0.7), S(0.09), 0, 7); g.fill();
  } else if (realm.id === 'cloud') {
    const sun = g.createRadialGradient(X(0.75), Y(0.25), 0, X(0.75), Y(0.25), S(0.3)); sun.addColorStop(0, '#fff6d8'); sun.addColorStop(0.2, 'rgba(255,246,216,0.8)'); sun.addColorStop(1, 'rgba(255,246,216,0)');
    g.fillStyle = sun; g.fillRect(x, y, w, h);
    g.fillStyle = '#6f8a7a'; g.beginPath(); g.moveTo(x, Y(0.8)); g.lineTo(X(0.25), Y(0.5)); g.lineTo(X(0.45), Y(0.75)); g.lineTo(X(0.7), Y(0.45)); g.lineTo(x + w, Y(0.8)); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
    g.fillStyle = '#5a9a52'; g.fillRect(x, Y(0.82), w, h * 0.18);
    g.fillStyle = '#ffffff';
    for (const [fx, fy, fr] of [[0.25, 0.3, 0.09], [0.33, 0.27, 0.11], [0.42, 0.31, 0.08], [0.6, 0.58, 0.07], [0.67, 0.55, 0.09]]) { g.beginPath(); g.arc(X(fx), Y(fy), S(fr), 0, 7); g.fill(); }
  }
  const shade = g.createLinearGradient(0, y + h * 0.45, 0, y + h); shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = shade; g.fillRect(x, y, w, h);
  g.restore();
}

// ------------------------------------------------------------------ the start / results menu
// m: { realmId, arenaId, modeId, level, players[], playerId, profile, onlineLabel, hint, result, inVR, focus }
const MENU_W = 1.9, MENU_H = 1.3;
function paintStartMenu(g, W, H, panel, m) {
  const ink = '#eaf4ff', dim = '#8fa8c4', accent = '#66ffff';
  // Card background
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(10,20,38,0.94)'); bg.addColorStop(1, 'rgba(6,12,26,0.94)');
  g.fillStyle = bg; rrect(g, 0, 0, W, H, 36); g.fill();
  g.strokeStyle = 'rgba(102,255,255,0.45)'; g.lineWidth = 4; rrect(g, 2, 2, W - 4, H - 4, 34); g.stroke();
  g.textBaseline = 'middle';

  // Header: title (or match result) and the player card
  const P = 44;
  if (m.result) {
    const r = m.result, win = r.blue > r.orange, lose = r.blue < r.orange;
    g.fillStyle = win ? '#3d8bff' : lose ? '#ff7a2f' : '#9aa7b8';
    g.font = uiFont(64, 900); g.textAlign = 'left'; textShadow(g, 14);
    g.fillText(win ? 'BLUE WINS!' : lose ? 'ORANGE WINS' : 'DRAW', P, 66); noShadow(g);
    g.fillStyle = ink; g.font = uiFont(64, 900); g.fillText(`${r.blue} : ${r.orange}`, P + 470, 66);
    g.fillStyle = dim; g.font = uiFont(28, 600);
    g.fillText(r.line1, P, 122);
  } else {
    g.textAlign = 'left'; g.fillStyle = ink; g.font = uiFont(66, 900); textShadow(g, 14);
    g.fillText('SURGE LEAGUE', P, 66); noShadow(g);
    g.fillStyle = accent; g.font = uiFont(30, 700); g.fillText('DREAM REALMS', P + 4, 120);
  }
  // Player card (top right): name, rank, record. Arrows switch players; + adds one.
  const pc = { x: W - 560, y: 26, w: 516, h: 116 };
  g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, pc.x, pc.y, pc.w, pc.h, 22); g.fill();
  g.textAlign = 'center';
  g.fillStyle = ink; fitFont(g, m.profile.name, 300, 36, 800); g.fillText(m.profile.name, pc.x + pc.w / 2 - 20, pc.y + 40);
  g.fillStyle = dim; g.font = uiFont(24, 600); g.fillText(m.profile.sub, pc.x + pc.w / 2 - 20, pc.y + 84);
  const arrowBtn = (id, x, label) => {
    const b = panel.button({ id, x, y: pc.y + 22, w: 58, h: 72, row: 0 });
    g.fillStyle = 'rgba(102,255,255,0.14)'; rrect(g, b.x, b.y, b.w, b.h, 16); g.fill();
    g.fillStyle = accent; g.font = uiFont(40, 900); g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 2);
    return b;
  };
  arrowBtn('player-prev', pc.x + 12, '<').col = 0;
  arrowBtn('player-next', pc.x + pc.w - 140, '>').col = 1;
  const nb = arrowBtn('player-new', pc.x + pc.w - 72, '+'); nb.col = 2;

  // Tile rows
  const rowLabel = (text, y) => { g.textAlign = 'left'; g.fillStyle = dim; g.font = uiFont(24, 800); g.fillText(text, P, y); };
  const tile = (b, selected, paintInner) => {
    panel.button(b);
    g.save();
    if (selected) { textShadow(g, 24, 'rgba(102,255,255,0.7)'); }
    g.fillStyle = selected ? 'rgba(102,255,255,0.18)' : 'rgba(255,255,255,0.05)';
    rrect(g, b.x, b.y, b.w, b.h, 20); g.fill(); noShadow(g);
    paintInner(b);
    g.lineWidth = selected ? 6 : 2; g.strokeStyle = selected ? accent : 'rgba(255,255,255,0.12)';
    rrect(g, b.x, b.y, b.w, b.h, 20); g.stroke();
    g.restore();
  };

  // REALM: picture cards
  rowLabel('REALM', 178);
  const realms = [{ id: 'shuffle', name: 'SHUFFLE', ride: 'a new dream every match' }, ...REALMS];
  const rw = (W - P * 2 - 5 * 16) / 6, rh = 200, ry = 196;
  realms.forEach((r, i) => tile({ id: 'realm', value: r.id, x: P + i * (rw + 16), y: ry, w: rw, h: rh, row: 1, col: i }, m.realmId === r.id, b => {
    paintRealmArt(g, b.x + 6, b.y + 6, b.w - 12, b.h - 64, r.id === 'shuffle' ? null : r);
    g.textAlign = 'center'; g.fillStyle = ink; fitFont(g, r.name, b.w - 20, 26, 800); g.fillText(r.name, b.x + b.w / 2, b.y + b.h - 40);
    g.fillStyle = dim; fitFont(g, r.id === 'shuffle' ? 'SURPRISE ME' : r.ride, b.w - 20, 19, 600); g.fillText(r.id === 'shuffle' ? 'SURPRISE ME' : r.ride, b.x + b.w / 2, b.y + b.h - 15);
  }));

  // ARENA and MODE
  rowLabel('ARENA', 434);
  const aw = (W - P * 2 - 3 * 16) / 4, SHUF = { id: 'shuffle', name: 'SHUFFLE', short: 'a different arena every match' };
  [...ARENAS, SHUF].forEach((a, i) => tile({ id: 'arena', value: a.id, x: P + i * (aw + 16), y: 452, w: aw, h: 92, row: 2, col: i }, m.arenaId === a.id, b => {
    g.textAlign = 'center'; g.fillStyle = ink; fitFont(g, a.name, b.w - 30, 32, 800); g.fillText(a.name, b.x + b.w / 2, b.y + 34);
    g.fillStyle = dim; fitFont(g, a.short, b.w - 30, 21, 600); g.fillText(a.short, b.x + b.w / 2, b.y + 68);
  }));
  rowLabel('MODE', 582);
  const modeTiles = [...MODES, { ...SHUF, short: 'a different mode every match' }], mw = (W - P * 2 - (modeTiles.length - 1) * 16) / modeTiles.length;
  modeTiles.forEach((md, i) => tile({ id: 'mode', value: md.id, x: P + i * (mw + 16), y: 600, w: mw, h: 92, row: 3, col: i }, m.modeId === md.id, b => {
    g.textAlign = 'center'; g.fillStyle = ink; fitFont(g, md.name, b.w - 24, 30, 800); g.fillText(md.name, b.x + b.w / 2, b.y + 34);
    g.fillStyle = dim; fitFont(g, md.short, b.w - 24, 20, 600); g.fillText(md.short, b.x + b.w / 2, b.y + 68);
  }));

  // BOTS chips + ONLINE
  rowLabel('BOTS', 730);
  const bw = 170;
  [...LEVELS, { name: 'SHUFFLE' }].forEach((l, i) => tile({ id: 'bots', value: l.name, x: P + 90 + i * (bw + 14), y: 708, w: bw, h: 64, row: 4, col: i }, m.level === l.name, b => {
    g.textAlign = 'center'; g.fillStyle = ink; fitFont(g, l.name, b.w - 20, 28, 800); g.fillText(l.name, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }));
  const ob = { id: 'online', x: W - P - 520, y: 708, w: 520, h: 64, row: 4, col: 3 };
  tile(ob, m.onlineOn, b => { g.textAlign = 'center'; g.fillStyle = ink; fitFont(g, 'ONLINE: ' + m.onlineLabel, b.w - 30, 24, 700); g.fillText('ONLINE: ' + m.onlineLabel, b.x + b.w / 2, b.y + b.h / 2 + 1); });

  // Description of what you're pointing at (the text itself is a separate small panel, so hovering never redraws this big one)
  g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, P, 792, W - P * 2, 64, 16); g.fill();

  // Bottom row: version 1, home, PLAY
  const btn = (b, label, color, big) => {
    panel.button(b);
    const grd = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    grd.addColorStop(0, hexA(color, big ? 1 : 0.35)); grd.addColorStop(1, hexA(color, big ? 0.75 : 0.2));
    g.fillStyle = grd; rrect(g, b.x, b.y, b.w, b.h, 22); g.fill();
    g.textAlign = 'center'; g.fillStyle = big ? '#04121f' : ink; fitFont(g, label, b.w - 30, big ? 46 : 28, 900);
    g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 2);
  };
  btn({ id: 'help', x: P, y: 880, w: 290, h: 96, row: 5, col: 0 }, 'HOW TO PLAY', '#3d8bff');
  btn({ id: 'version', x: P + 306, y: 880, w: 220, h: 96, row: 5, col: 1 }, m.versionLabel || 'VERSION 1', '#7a8aa0');
  btn({ id: 'home', x: P + 542, y: 880, w: 140, h: 96, row: 5, col: 2 }, 'EXIT', '#7a8aa0');
  btn({ id: 'fullshuffle', x: P + 698, y: 880, w: 300, h: 96, row: 5, col: 3 }, 'FULL SHUFFLE', '#c86bff');
  btn({ id: 'play', x: P + 1014, y: 872, w: W - P * 2 - 1014, h: 112, row: 5, col: 4 }, m.result ? 'PLAY AGAIN  ▶' : 'ENTER THE DREAM  ▶', '#66ffff', true);

  g.textAlign = 'center'; g.fillStyle = dim; g.font = uiFont(21, 600);
  g.fillText(m.inVR ? 'Point and pull the trigger, or use the left stick and A.   In a match, press Y to pause.'
                    : 'Click with the mouse, or arrow keys and Enter.   In a match, P pauses.', W / 2, H - 32);
}

// ------------------------------------------------------------------ pause menu
const PAUSE_W = 1.15, PAUSE_H = 1.48;
function paintPause(g, W, H, panel, m) {
  const ink = '#eaf4ff', dim = '#8fa8c4';
  g.fillStyle = 'rgba(8,16,32,0.95)'; rrect(g, 0, 0, W, H, 36); g.fill();
  g.strokeStyle = 'rgba(102,255,255,0.45)'; g.lineWidth = 4; rrect(g, 2, 2, W - 4, H - 4, 34); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = ink; g.font = uiFont(64, 900); textShadow(g, 14); g.fillText('PAUSED', W / 2, 70); noShadow(g);
  g.fillStyle = dim; fitFont(g, m.where, W - 80, 24, 600); g.fillText(m.where, W / 2, 124);
  g.font = uiFont(40, 900);
  g.fillStyle = '#3d8bff'; g.textAlign = 'right'; g.fillText(`BLUE ${m.blue}`, W / 2 - 24, 176);
  g.fillStyle = dim; g.textAlign = 'center'; g.fillText(':', W / 2, 174);
  g.fillStyle = '#ff7a2f'; g.textAlign = 'left'; g.fillText(`${m.orange} ORANGE`, W / 2 + 24, 176);
  const items = [['resume', 'RESUME', '#66ffff'], ['help', 'HOW TO PLAY (CONTROLS)', '#7a8aa0'], ['reach', m.reach, '#7a8aa0'], ['flight', m.flight, '#7a8aa0'],
                 ['restart', 'RESTART MATCH', '#7a8aa0'], ['menu', 'CHANGE REALM, ARENA OR MODE', '#7a8aa0'],
                 ['v1', 'PLAY VERSION 1 (CLASSIC)', '#7a8aa0'], ['home', m.exitLabel || 'EXIT TO HOME SCREEN', '#c0605a']];
  items.forEach(([id, label, color], i) => {
    const b = panel.button({ id, x: 60, y: 214 + i * 112, w: W - 120, h: 96, row: i, col: 0 });
    const grd = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    grd.addColorStop(0, hexA(color, i === 0 ? 0.95 : 0.35)); grd.addColorStop(1, hexA(color, i === 0 ? 0.7 : 0.2));
    g.fillStyle = grd; rrect(g, b.x, b.y, b.w, b.h, 22); g.fill();
    g.fillStyle = i === 0 ? '#04121f' : ink; fitFont(g, label, b.w - 40, 36, 900); g.textAlign = 'center';
    g.fillText(label, W / 2, b.y + b.h / 2 + 2);
  });
  g.fillStyle = dim; g.font = uiFont(22, 600);
  g.fillText(m.inVR ? 'Point and pull the trigger, or left stick and A.  Y resumes.' : 'Click, or arrow keys and Enter.  P or Esc resumes.', W / 2, H - 36);
}

// ------------------------------------------------------------------ scoreboard (shows itself only when it matters)
const SCORE_W = 0.96, SCORE_H = 0.34;
function paintScoreboard(g, W, H, panel, s) {
  const ink = '#eaf4ff', dim = '#9db4cc';
  g.fillStyle = 'rgba(6,12,24,0.88)'; rrect(g, 0, 0, W, H, 34); g.fill();
  const third = W / 3;
  const team = (x, color, name, score) => {
    const grd = g.createLinearGradient(x, 0, x + third, 0);
    grd.addColorStop(0, hexA(color, x === 0 ? 0.55 : 0.1)); grd.addColorStop(1, hexA(color, x === 0 ? 0.1 : 0.55));
    g.fillStyle = grd; rrect(g, x + 14, 14, third - 28, 150, 24); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = ink; g.font = uiFont(30, 800); g.fillText(name, x + third / 2, 46);
    g.font = uiFont(84, 900); textShadow(g, 12); g.fillText(String(score), x + third / 2, 112); noShadow(g);
  };
  team(0, '#3d8bff', 'BLUE (YOU)', s.blue);
  team(third * 2, '#ff7a2f', 'ORANGE', s.orange);
  g.textAlign = 'center'; g.fillStyle = s.clockWarn ? '#ffd166' : ink; g.font = uiFont(78, 900);
  g.fillText(s.clock, W / 2, 72);
  g.fillStyle = dim; fitFont(g, s.mode, third - 20, 24, 700); g.fillText(s.mode, W / 2, 132);
  // Bottom strip: realm power, active surge event
  g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, 14, 182, W - 28, H - 196, 20); g.fill();
  g.textAlign = 'left'; g.fillStyle = s.powerReady ? '#66ffff' : dim; fitFont(g, s.power, W / 2 - 50, 28, 800); g.fillText(s.power, 40, 182 + (H - 196) / 2);
  g.textAlign = 'right'; g.fillStyle = s.event ? '#ffd166' : dim; fitFont(g, s.event || s.realm, W / 2 - 50, 28, 800); g.fillText(s.event || s.realm, W - 40, 182 + (H - 196) / 2);
}

// ------------------------------------------------------------------ pop-up messages
// t: { text, big, color, hint: { side: 'left'|'right', part: 'b'|'grip'|... } } — a hint draws the controller with that button lit.
function paintToast(g, W, H, panel, t) {
  if (!t.text) return;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const pic = t.hint ? 230 : 0, maxText = W - 120 - pic;
  g.font = uiFont(t.big ? 64 : 40, t.big ? 900 : 700);
  const lines = wrapLines(g, t.text, maxText).slice(0, 4), lh = t.big ? 76 : 52;
  const boxH = Math.max(lines.length * lh + 44, pic ? H - 8 : 0), y0 = (H - boxH) / 2;
  let tw = 0; for (const l of lines) tw = Math.max(tw, g.measureText(l).width);
  const boxW = Math.min(W - 8, tw + 90 + pic), x0 = (W - boxW) / 2;
  g.fillStyle = 'rgba(6,12,24,0.78)'; rrect(g, x0, y0, boxW, boxH, 30); g.fill();
  if (t.color) { g.strokeStyle = t.color; g.lineWidth = 5; rrect(g, x0 + 3, y0 + 3, boxW - 6, boxH - 6, 28); g.stroke(); }
  if (pic) {
    const s = (boxH - 56) / 1.5; // the drawing spans about 1.5 x its size, ring included
    paintController(g, x0 + 30 + pic / 2, y0 + 40 + 0.52 * s, s, t.hint.side, new Set([t.hint.part]));
    g.fillStyle = '#66ffff'; g.font = uiFont(22, 900); g.textAlign = 'center';
    g.fillText(t.hint.side === 'left' ? 'LEFT' : 'RIGHT', x0 + 30 + pic / 2, y0 + 26);
  }
  g.font = uiFont(t.big ? 64 : 40, t.big ? 900 : 700); g.textAlign = 'center';
  g.fillStyle = t.color || '#ffffff'; textShadow(g, 10);
  const cx = x0 + pic + (boxW - pic) / 2, ty = (H - lines.length * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, cx, ty + lh * (i + 0.5)));
}

// ------------------------------------------------------------------ entering a realm
function paintPortal(g, W, H, panel, p) {
  const r = p.realm;
  paintRealmArt(g, 0, 0, W, H, r);
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7); v.addColorStop(0, 'rgba(0,0,0,0.25)'); v.addColorStop(1, 'rgba(0,0,0,0.8)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle'; textShadow(g, 18);
  g.fillStyle = '#cfe2f5'; g.font = uiFont(34, 700); g.fillText('ENTERING THE DREAM', W / 2, H * 0.17);
  g.fillStyle = '#ffffff'; fitFont(g, r.name, W - 80, 104, 900); g.fillText(r.name, W / 2, H * 0.33);
  g.fillStyle = '#e8f3ff'; fitFont(g, `${p.arena}  ·  ${p.mode}`, W - 80, 38, 700); g.fillText(`${p.arena}  ·  ${p.mode}`, W / 2, H * 0.5);
  g.fillStyle = '#ffd166'; g.font = uiFont(36, 800); g.fillText(`RIDE: ${r.ride}`, W / 2, H * 0.64);
  g.fillStyle = '#66ffff'; fitFont(g, `POWER (B): ${r.powerName}`, W - 80, 36, 800); g.fillText(`POWER (B): ${r.powerName}`, W / 2, H * 0.75);
  g.fillStyle = '#e8f3ff'; fitFont(g, r.powerHint, W - 100, 28, 600); g.fillText(r.powerHint, W / 2, H * 0.84);
  if (r.hazardName) { g.fillStyle = '#ffb3e6'; fitFont(g, `WATCH FOR: ${r.hazardName}`, W - 80, 28, 800); g.fillText(`WATCH FOR: ${r.hazardName}`, W / 2, H * 0.93); }
}
