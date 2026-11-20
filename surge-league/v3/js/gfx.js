// Version 3 graphics (2026-11-18 night): as realistic as the Quest 2 allows without post-processing.
// - A filmic grade built into the tone curve (contrast, richer color, cool shadows, warm highlights): costs a few math ops.
// - A real sun (or moon) per realm: its direction lights the scene, sits in the painted sky with a glare, and casts
//   baked shadows from cover, hoops and rocks onto the floor (plus soft contact shadows), painted once per arena.
// - Daytime skies get painted cumulus clouds; shiny surfaces reflect the realm's own sky.
// - Floors get surface relief (normal maps made from their own patterns).
// - Soft shadows under every rider and the disc, a pool of spark bursts. (Riders and rides: js/models.js.)
// Nothing here adds lights or post passes; the floor shader change is a few lines in the floor's own material.

// ------------------------------------------------------------------ filmic grade (tone curve)
(function installGrade() {
  const chunk = T.ShaderChunk.tonemapping_pars_fragment, stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (!chunk.includes(stub)) { console.warn('Surge: tone curve hook not found, using plain ACES'); return; }
  T.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, 1.14 );                                                   // a little richer color
  c += vec3( -0.010, 0.002, 0.016 ) * ( 1.0 - smoothstep( 0.0, 0.35, l ) );        // cool shadows
  c += vec3( 0.018, 0.008, -0.014 ) * smoothstep( 0.45, 1.0, l );                  // warm highlights
  c = clamp( c, 0.0, 1.0 );
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.28 );                                   // gentle S-curve contrast
  return c;
}`);
  window.SURGE_GRADE = true;
})();

// ------------------------------------------------------------------ the sun (or moon) of each realm
// dir points toward the sun. disk/glow paint it into the sky; shadow = how dark its baked shadows are on the floor.
const SUN = {
  saucer: { dir: [0.68, 0.5, 0.5], disk: null, glow: '#ffcf8a', shadow: 0.6 },
  foundry: { dir: [0.74, 0.2, -0.64], disk: '#fff1d0', glow: '#ff9a50', shadow: 0.72 },
  castle: { dir: [-0.43, 0.5, -0.77], disk: null, glow: '#cfd8ff', shadow: 0.6 },
  gym: { dir: [-0.5, 0.58, -0.64], disk: '#fff8ea', glow: '#ffd6a8', shadow: 0.7, clouds: '#ffffff' },
  cloud: { dir: [0.52, 0.5, -0.69], disk: '#fffaf0', glow: '#ffe2b0', shadow: 0.78, clouds: '#ffffff' }
};
const sunDir = id => new T.Vector3(...SUN[id].dir).normalize();

// Sky sphere texture coordinates <-> directions (three.js SphereGeometry layout, seen from inside).
function skyPixel(dir, w, h) {
  const theta = Math.acos(Math.max(-1, Math.min(1, dir.y)));
  let phi = Math.atan2(dir.z, -dir.x); if (phi < 0) phi += Math.PI * 2;
  return [phi / (Math.PI * 2) * w, theta / Math.PI * h];
}

// Paints the sun disk, its glare and (daytime realms) a band of cumulus clouds lit from the sun's side.
function paintSkyExtras(tex, realm) {
  const c = tex.image, g = c.getContext('2d'), w = c.width, h = c.height, S = SUN[realm.id], rnd = seeded(41);
  const [sx, sy] = skyPixel(sunDir(realm.id), w, h);
  if (S.clouds) {
    const sunLeft = sx; // clouds facing the sun get bright rims
    for (let k = 0; k < 30; k++) {
      const cx = rnd() * w, cy = h * (0.3 + rnd() * 0.17), size = (40 + rnd() * 120) * (0.6 + (cy / h - 0.3) * 2.2) * w / 2048;
      const puffs = 8 + Math.floor(rnd() * 14), toSun = Math.sign(((sunLeft - cx + w * 1.5) % w) - w / 2);
      for (let i = 0; i < puffs; i++) {
        const px = cx + (rnd() - 0.5) * size * 2.2, py = cy - rnd() * size * 0.55, r = size * (0.25 + rnd() * 0.4);
        const shade = g.createRadialGradient(px + toSun * r * 0.25, py - r * 0.3, r * 0.1, px, py, r);
        shade.addColorStop(0, 'rgba(255,255,255,0.95)'); shade.addColorStop(0.55, 'rgba(236,240,248,0.8)'); shade.addColorStop(1, 'rgba(220,228,240,0)');
        g.fillStyle = shade; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      }
      // flat, slightly shaded base
      const base = g.createLinearGradient(0, cy - size * 0.1, 0, cy + size * 0.15);
      base.addColorStop(0, 'rgba(200,210,226,0)'); base.addColorStop(1, 'rgba(170,184,206,0.35)');
      g.fillStyle = base; g.beginPath(); g.ellipse(cx, cy + size * 0.05, size * 1.2, size * 0.16, 0, 0, Math.PI * 2); g.fill();
    }
    // high, thin streaks
    g.save(); g.globalAlpha = 0.18; g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    for (let k = 0; k < 30; k++) { const x = rnd() * w, y = h * (0.08 + rnd() * 0.16), len = (80 + rnd() * 260) * w / 2048; g.lineWidth = (2 + rnd() * 6) * w / 2048; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 6, x + len, y + 4); g.stroke(); }
    g.restore();
  }
  // Glare, then the disk
  const R = (S.disk ? 260 : 180) * w / 2048, gl = g.createRadialGradient(sx, sy, 0, sx, sy, R);
  gl.addColorStop(0, S.glow + 'cc'); gl.addColorStop(0.25, S.glow + '55'); gl.addColorStop(1, S.glow + '00');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gl; g.fillRect(sx - R, sy - R, R * 2, R * 2); g.restore();
  if (S.disk) { g.fillStyle = S.disk; g.shadowColor = S.disk; g.shadowBlur = 30; g.beginPath(); g.arc(sx, sy, 16 * w / 2048, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; }
  tex.needsUpdate = true;
}

// Reflection map from the realm's own sky (mirrored, because the sky sphere and reflections read the picture opposite ways).
function envFromSky(renderer, skyTex) {
  const src = skyTex.image, c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0, c.width, c.height);
  const t = new T.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; t.mapping = T.EquirectangularReflectionMapping;
  const pm = new T.PMREMGenerator(renderer), xrOn = renderer.xr.enabled;
  renderer.xr.enabled = false;
  try { return pm.fromEquirectangular(t).texture; } finally { renderer.xr.enabled = xrOn; pm.dispose(); t.dispose(); }
}

// Surface relief: a normal map made from the floor pattern's own light and dark (seams and grooves sink in).
// A relief map from a picture's own light and dark (seams and grooves sink in). k = how deep.
function normalCanvas(src, k = 4) {
  const w = src.width, h = src.height, data = src.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), out = g.createImageData(w, h), at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, len = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
    out.data[o] = (-dx / len * 0.5 + 0.5) * 255; out.data[o + 1] = (dy / len * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / len * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}
// Floors carry their own (baked) relief map: see floorTexture() in js/kit.js.
function floorNormalMap(kind, colorTex) { return colorTex.userData.normal; }

// ------------------------------------------------------------------ baked floor light (shadows, contact shadows, sun pools)
// One 1024 x 1024 picture covers the whole field: red = sunlight reaching the floor (shadows dark), green = sky light
// (contact shadows dark), blue = the warm pools of light through blinds and leaves. The floor shader reads it.
const FIELD_PX = 1024;
function bakeFieldLight(game) {
  const W = FIELD_PX, R = ARENA_R, toPx = (x, z) => [(x / R + 1) / 2 * W, (z / R + 1) / 2 * W], ppm = W / (2 * R);
  const sun = sunDir(game.realm.id), floorY = 0.3;
  const shadowOf = p => { const t = (p.y - floorY) / sun.y; return toPx(p.x - sun.x * t, p.z - sun.z * t); };
  const layer = () => { const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, W); return [c, g]; };
  const [sc, sg] = layer(), [ac, ag] = layer();
  sg.fillStyle = '#000'; ag.fillStyle = '#000';
  // Sun shadows: boxes (cover, hoop poles) as their projected outline, balls (rocks) as stretched ellipses, hoops as rings.
  sg.filter = 'blur(2.5px)';
  const boxShadow = (c, half, q) => {
    const pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const v = new T.Vector3(sx * half.x, sy * half.y, sz * half.z); if (q) v.applyQuaternion(q); v.add(c);
      pts.push(shadowOf(v));
    }
    const hull = convexHull(pts); if (hull.length < 3) return;
    sg.beginPath(); hull.forEach(([x, y], i) => i ? sg.lineTo(x, y) : sg.moveTo(x, y)); sg.closePath(); sg.fill();
  };
  for (const ob of game.obstacles) {
    if (ob.type === 'box' && !ob.spin) boxShadow(ob.c, ob.half, ob.q);
    else if (ob.type === 'ball') {
      const [x, y] = shadowOf(ob.c), stretch = 1 / Math.max(0.25, sun.y), ang = Math.atan2(-sun.z, -sun.x);
      sg.save(); sg.translate(x, y); sg.rotate(ang); sg.globalAlpha = 0.85;
      sg.beginPath(); sg.ellipse(0, 0, ob.r * ppm * stretch, ob.r * ppm, 0, 0, Math.PI * 2); sg.fill(); sg.restore();
    }
  }
  sg.lineWidth = 0.22 * ppm * 2; sg.strokeStyle = '#000';
  for (const hp of game.hoops) {
    // the ring's shadow: sample points around the hoop in its own plane
    sg.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = i / 32 * Math.PI * 2, p = new T.Vector3(Math.cos(a) * hp.size, Math.sin(a) * hp.size, 0).applyQuaternion(hp.obj.quaternion).add(hp.c);
      const [x, y] = shadowOf(p); i ? sg.lineTo(x, y) : sg.moveTo(x, y);
    }
    sg.stroke();
  }
  sg.filter = 'none';
  // Contact shadows: soft darkening around anything near the floor.
  ag.filter = 'blur(10px)';
  for (const ob of game.obstacles) {
    if (ob.type !== 'box' || ob.spin) continue;
    const bottom = ob.c.y - ob.half.y; if (bottom > 3) continue;
    const [x, y] = toPx(ob.c.x, ob.c.z), k = 1 - bottom / 3;
    ag.globalAlpha = 0.55 * k; ag.fillRect(x - (ob.half.x + 0.8) * ppm, y - (ob.half.z + 0.8) * ppm, (ob.half.x * 2 + 1.6) * ppm, (ob.half.z * 2 + 1.6) * ppm);
  }
  ag.globalAlpha = 1; ag.filter = 'none';
  // Very large, soft variation so the floor never looks flat (worn paths, dirt).
  const rnd = seeded(77);
  ag.globalAlpha = 0.07;
  for (let i = 0; i < 60; i++) { const x = rnd() * W, y = rnd() * W, r = 30 + rnd() * 120; const gr = ag.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ag.fillStyle = gr; ag.fillRect(x - r, y - r, r * 2, r * 2); }
  ag.globalAlpha = 1;
  // Combine: R = sunlight (shadow strength per realm), G = sky light, B = light pools.
  const pools = floorLightTexture().image, pc = document.createElement('canvas'); pc.width = pc.height = W;
  pc.getContext('2d').drawImage(pools, 0, 0, W, W);
  const S = sg.getImageData(0, 0, W, W).data, A = ag.getImageData(0, 0, W, W).data, P = pc.getContext('2d').getImageData(0, 0, W, W).data;
  const out = document.createElement('canvas'); out.width = out.height = W;
  const og = out.getContext('2d'), img = og.createImageData(W, W), strength = SUN[game.realm.id].shadow;
  for (let i = 0; i < W * W * 4; i += 4) {
    img.data[i] = 255 * (1 - strength * (1 - S[i] / 255));
    img.data[i + 1] = A[i];
    img.data[i + 2] = P[i] * (S[i] / 255); // no light pools inside shadows
    img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  if (!game.fieldTex) { game.fieldTex = new T.CanvasTexture(out); if ('colorSpace' in game.fieldTex) game.fieldTex.colorSpace = T.NoColorSpace; }
  else { game.fieldTex.image = out; game.fieldTex.needsUpdate = true; }
  return game.fieldTex;
}

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// The floor material reads the baked field light: sunlight * red, sky light * green, plus warm pools from blue.
const FIELD_UNIFORMS = { fieldMap: { value: null }, poolColor: { value: new T.Color('#ffd9a0') }, poolStrength: { value: 0.35 } };
function fieldFloorMaterial(mat) {
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, FIELD_UNIFORMS);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vFieldUv = uv;').replace('void main() {', 'varying vec2 vFieldUv;\nvoid main() {');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D fieldMap; uniform vec3 poolColor; uniform float poolStrength; varying vec2 vFieldUv;\nvoid main() {')
      .replace('#include <aomap_fragment>', `vec3 fieldL = texture2D( fieldMap, vFieldUv ).rgb;
  reflectedLight.directDiffuse *= fieldL.r; reflectedLight.directSpecular *= fieldL.r;
  reflectedLight.indirectDiffuse *= fieldL.g * mix( 1.0, fieldL.r, 0.35 ); reflectedLight.indirectSpecular *= mix( 1.0, fieldL.g, 0.7 ) * mix( 0.6, 1.0, fieldL.r );
  totalEmissiveRadiance += diffuseColor.rgb * poolColor * fieldL.b * poolStrength;
  #include <aomap_fragment>`);
  };
  mat.customProgramCacheKey = () => 'surge-field-floor';
  return mat;
}

// ------------------------------------------------------------------ soft shadows under riders and the disc
let blobTex = null;
function blobTexture() {
  return blobTex || (blobTex = canvasTexture(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
}
function makeBlobShadow(size) {
  const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 1, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.frustumCulled = false;
  return m;
}
// Shadows fall along the sun: a rider at height y lands that far off to the side, bigger and fainter the higher it is.
function placeBlob(m, pos, realmId, size) {
  const sun = sunDir(realmId), t = Math.max(0, pos.y - 0.3) / Math.max(0.2, sun.y), hgt = pos.y - 0.3;
  m.position.set(pos.x - sun.x * Math.min(t, 40), 0.36, pos.z - sun.z * Math.min(t, 40));
  const k = 1 + hgt * 0.035; m.scale.set(k, k, 1);
  m.material.opacity = Math.max(0.12, 0.85 - hgt * 0.022);
  m.visible = hgt < 34;
}

// Riders and rides are built in js/models.js.

// ------------------------------------------------------------------ spark bursts (several at once)
function makeBurstPool(scene, n = 4, count = 40) {
  const pool = [];
  for (let k = 0; k < n; k++) {
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ size: 0.35, map: dotTexture(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    pts.visible = false; pts.frustumCulled = false; scene.add(pts);
    const flash = glowSprite('#ffffff', 4, 0); flash.visible = false; scene.add(flash);
    pool.push({ pts, vel: new Float32Array(count * 3), t: 0, flash });
  }
  let next = 0;
  return {
    fire(pos, color, power = 1) {
      const b = pool[next++ % pool.length], p = b.pts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, pos.x, pos.y, pos.z);
        const v = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((4 + Math.random() * 9) * power);
        b.vel.set([v.x, v.y, v.z], i * 3);
      }
      p.needsUpdate = true; b.pts.material.color.set(color); b.t = 1; b.pts.visible = true;
      b.flash.position.copy(pos); b.flash.material.color.set(color); b.flash.visible = true; b.flash.scale.setScalar(2 + power * 3);
    },
    update(dt) {
      for (const b of pool) {
        if (b.t <= 0) continue;
        b.t = Math.max(0, b.t - dt * 1.2);
        const p = b.pts.geometry.attributes.position, k = Math.exp(-2.5 * dt);
        for (let i = 0; i < p.count; i++) {
          b.vel[i * 3 + 1] -= 6 * dt;
          p.setXYZ(i, p.getX(i) + b.vel[i * 3] * dt, p.getY(i) + b.vel[i * 3 + 1] * dt, p.getZ(i) + b.vel[i * 3 + 2] * dt);
          b.vel[i * 3] *= k; b.vel[i * 3 + 1] *= k; b.vel[i * 3 + 2] *= k;
        }
        p.needsUpdate = true;
        b.pts.material.opacity = b.t; b.pts.visible = b.t > 0;
        b.flash.material.opacity = Math.max(0, (b.t - 0.75) * 3); b.flash.visible = b.flash.material.opacity > 0.01;
      }
    }
  };
}
