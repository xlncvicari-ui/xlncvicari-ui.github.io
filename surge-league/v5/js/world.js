// Version 5 level engine. A level (js/levels.js) is a list of box-shaped ROOMS. From that this file works out everything else:
// - WALLS: every face of every room becomes wall slabs, minus DOORWAYS (wherever two rooms touch), minus open WINDOWS.
//   Walls are real solids, so the space outside the rooms is flyable: go out a window, come back in anywhere.
// - 'field' walls are see-through energy lattice (solid, but you can watch through them); 'hull' walls are opaque panels.
// - COLLISION for riders and the core against those slabs (a grid makes it fast), an outer boundary, and line-of-sight checks.
// - a ROUTE GRAPH for the bots (room points, doorways, windows, and points out in space), so any level works without hand-made paths.
// - the MESHES: a handful of merged meshes per level (hull, floors, lattice, light strips, decals, goals).
const WALL_T = 0.4, GRID = 6;

// ------------------------------------------------------------------ small geometry helpers (shared with models.js)
const G = {
  cyl: (r, h, s = 12) => new T.CylinderGeometry(r, r, h, s),
  cyl2: (rt, rb, h, s = 12) => new T.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 12) => new T.ConeGeometry(r, h, s),
  box: (w, h, d) => new T.BoxGeometry(w, h, d),
  ball: (r, w = 14, h = 10) => new T.SphereGeometry(r, w, h),
  torus: (R, r, rs = 8, ts = 48, arc = Math.PI * 2) => new T.TorusGeometry(R, r, rs, ts, arc)
};
const solid = (parts, opt = {}) => new T.Mesh(mergeParts(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...opt }));
const glowing = (parts, opt = {}) => new T.Mesh(mergeParts(parts), new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...opt }));
const around = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, (i / n) * Math.PI * 2));
const polar = (a, r, y) => [r * Math.cos(a), y, r * Math.sin(a)];
function reflect(vel, n, bounce) { const vn = vel.dot(n); if (vn >= 0) return 0; vel.addScaledVector(n, -(1 + bounce) * vn); return -vn; }

// The level being played. Filled by loadLevel().
const WORLD = { level: null, rooms: [], walls: [], goals: [], nodes: [], windows: [], doors: [], bounds: null, cells: new Map(), nodeCells: new Map(), routes: new Map() };
const AX = { x: 0, y: 1, z: 2 }, FACES = ['+x', '-x', '+y', '-y', '+z', '-z'];
const faceUV = a => (a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1]);   // which axes run along a face: x face -> (z, y), y face -> (x, z), z face -> (x, y)

// ------------------------------------------------------------------ rooms from a level definition (with mirroring)
function expandRooms(level) {
  const out = [];
  const flip = (r, ax) => {
    const k = 'xyz'[ax], m = { ...r, min: r.min.slice(), max: r.max.slice(), faces: {} };
    m.min[ax] = -r.max[ax]; m.max[ax] = -r.min[ax];
    for (const f in r.faces) m.faces[f[1] === k ? (f[0] === '+' ? '-' : '+') + k : f] = r.faces[f];
    return m;
  };
  for (const r of level.rooms) {
    const base = { id: r.id, min: [r.x[0], r.y[0], r.z[0]], max: [r.x[1], r.y[1], r.z[1]], kind: r.kind || 'corridor', faces: r.faces || {}, label: r.label, tint: r.tint };
    const copies = [[base, '']];
    const m = r.m === undefined ? level.sym : r.m;
    if (m === 'xz') { copies.push([flip(base, 0), '~x'], [flip(base, 2), '~z'], [flip(flip(base, 0), 2), '~xz']); }
    else if (m === 'x') copies.push([flip(base, 0), '~x']);
    else if (m === 'z') copies.push([flip(base, 2), '~z']);
    else if (m === 'p') copies.push([flip(flip(base, 0), 2), '~p']);
    for (const [c, suffix] of copies) out.push({ ...c, id: c.id + suffix, base: r.id, min: new T.Vector3(...c.min), max: new T.Vector3(...c.max) });
  }
  return out;
}
// Mirror a point or goal from the blue end to the orange end (z flips; x flips too on point-symmetric levels).
function toOrange(level, p) { return level.point ? [-p[0], p[1], -p[2]] : [p[0], p[1], -p[2]]; }

// ------------------------------------------------------------------ walls
// spec: 'hull' | 'field' | 'open' | 'mirror', or { mat, win: [width, gap, low, high] } for a row of open windows.
function faceSpec(level, room, f) {
  const d = level.kinds[room.kind] || level.kinds.corridor, spec = room.faces[f] !== undefined ? room.faces[f] : f === '-y' ? d.floor : f === '+y' ? d.ceil : (f[1] === 'z' ? (d.end || d.side) : d.side);
  return typeof spec === 'string' ? { mat: spec } : spec;
}
function loadLevel(level) {
  const W = WORLD;
  Object.assign(W, { level, rooms: expandRooms(level), walls: [], quads: [], goals: [], nodes: [], windows: [], doors: [], cells: new Map(), nodeCells: new Map(), routes: new Map(), frames: [] });
  W.bounds = { min: new T.Vector3(...level.bounds[0]), max: new T.Vector3(...level.bounds[1]) };
  // goals: defined for the blue end, mirrored for orange
  for (const g of level.goals) for (const team of ['blue', 'orange']) {
    const c = team === 'blue' ? g.c : toOrange(level, g.c), n = team === 'blue' ? g.n : toOrange(level, g.n);
    W.goals.push({ team, kind: g.kind, c: new T.Vector3(...c), n: new T.Vector3(...n).normalize(), r: g.r || (g.kind === 'deep' ? 1.9 : 1.6), points: POINTS[g.kind] });
  }
  const sealed = (a, b) => (level.seals || []).some(([p, q]) => (a.base === p && b.base === q) || (a.base === q && b.base === p));
  const addWall = (min, max, mat) => { const w = { min, max, mat, i: W.walls.length }; W.walls.push(w); return w; };
  W.rooms.forEach((room, ri) => {
    for (const f of FACES) {
      const a = AX[f[1]], s = f[0] === '+' ? 1 : -1, [ua, va] = faceUV(a), k = s > 0 ? room.max.getComponent(a) : room.min.getComponent(a);
      const spec = faceSpec(level, room, f);
      if (spec.mat === 'open') continue;
      const u0 = room.min.getComponent(ua), u1 = room.max.getComponent(ua), v0 = room.min.getComponent(va), v1 = room.max.getComponent(va);
      const holes = [];
      // doorways: any room whose opposite face sits on this plane and overlaps
      W.rooms.forEach((o, oi) => {
        if (o === room) return;
        const ok = s > 0 ? o.min.getComponent(a) : o.max.getComponent(a);
        if (Math.abs(ok - k) > 0.02) return;
        const a0 = Math.max(u0, o.min.getComponent(ua)), a1 = Math.min(u1, o.max.getComponent(ua)), b0 = Math.max(v0, o.min.getComponent(va)), b1 = Math.min(v1, o.max.getComponent(va));
        if (a1 - a0 < 0.6 || b1 - b0 < 0.6) return;
        if (sealed(room, o)) { if (oi < ri) holes.push({ u0: a0, u1: a1, v0: b0, v1: b1, kind: 'skip' }); else holes.push({ u0: a0, u1: a1, v0: b0, v1: b1, kind: 'seal' }); return; }
        holes.push({ u0: a0, u1: a1, v0: b0, v1: b1, kind: 'door' });
        if (oi > ri) { const c = [0, 0, 0]; c[a] = k; c[ua] = (a0 + a1) / 2; c[va] = (b0 + b1) / 2; W.doors.push({ c: new T.Vector3(...c), a, size: [a1 - a0, b1 - b0] }); }
      });
      // goal plates: a square cut out of the drawn wall (the plate itself stays solid, see below)
      for (const g of W.goals) {
        if (Math.abs(g.c.getComponent(a) - k) > 0.05 || Math.abs(g.n.getComponent(a)) < 0.9) continue;
        const gu = g.c.getComponent(ua), gv = g.c.getComponent(va), h = g.r + 0.45;
        if (gu < u0 || gu > u1 || gv < v0 || gv > v1) continue;
        holes.push({ u0: gu - h, u1: gu + h, v0: gv - h, v1: gv + h, kind: 'goal' });
      }
      // open windows in a row along the wall
      if (spec.win) {
        const [ww, gap, lo, hi] = spec.win, vertical = a !== 1;
        const L0 = vertical ? u0 : (u1 - u0 >= v1 - v0 ? u0 : v0), L1 = vertical ? u1 : (u1 - u0 >= v1 - v0 ? u1 : v1), alongU = vertical || u1 - u0 >= v1 - v0;
        const n = Math.max(0, Math.floor((L1 - L0 - gap) / (ww + gap))), start = (L0 + L1) / 2 - (n * ww + (n - 1) * gap) / 2;
        const c0 = (alongU ? v0 : u0) + lo, c1 = (alongU ? v1 : u1) - hi;
        for (let i = 0; i < n && c1 - c0 > 1.2; i++) {
          const p0 = start + i * (ww + gap), h = alongU ? { u0: p0, u1: p0 + ww, v0: c0, v1: c1 } : { u0: c0, u1: c1, v0: p0, v1: p0 + ww };
          if (holes.some(o => o.kind !== 'window' && h.u0 < o.u1 + 0.5 && h.u1 > o.u0 - 0.5 && h.v0 < o.v1 + 0.5 && h.v1 > o.v0 - 0.5)) continue; // not across a doorway or goal
          holes.push({ ...h, kind: 'window' });
          const c = [0, 0, 0]; c[a] = k; c[ua] = (h.u0 + h.u1) / 2; c[va] = (h.v0 + h.v1) / 2;
          const nrm = [0, 0, 0]; nrm[a] = s;
          W.windows.push({ c: new T.Vector3(...c), n: new T.Vector3(...nrm), a, size: [h.u1 - h.u0, h.v1 - h.v0], room: ri });
          W.frames.push({ a, k, ua, va, ...h, color: 'accent' });
        }
      }
      // cut the face into a grid along every hole edge, then merge runs of solid cells into slabs
      const cut = (lo, hi, list) => [...new Set([lo, hi, ...list.map(x => Math.max(lo, Math.min(hi, x)))])].sort((p, q) => p - q);
      const U = cut(u0, u1, holes.flatMap(h => [h.u0, h.u1])), V = cut(v0, v1, holes.flatMap(h => [h.v0, h.v1]));
      for (let j = 0; j < V.length - 1; j++) {
        let run = null;
        const flush = () => { if (!run) return; emit(run.u0, run.u1, V[j], V[j + 1], run.kind); run = null; };
        for (let i = 0; i < U.length - 1; i++) {
          const cu = (U[i] + U[i + 1]) / 2, cv = (V[j] + V[j + 1]) / 2, h = holes.find(h => cu > h.u0 && cu < h.u1 && cv > h.v0 && cv < h.v1);
          const kind = !h ? 'wall' : h.kind;
          if (run && run.kind === kind) run.u1 = U[i + 1]; else { flush(); run = { u0: U[i], u1: U[i + 1], kind }; }
        }
        flush();
      }
      function emit(a0, a1, b0, b1, kind) {
        if (kind === 'door' || kind === 'window' || kind === 'skip') return;
        const mn = [0, 0, 0], mx = [0, 0, 0];
        mn[a] = k - WALL_T / 2; mx[a] = k + WALL_T / 2; mn[ua] = a0; mx[ua] = a1; mn[va] = b0; mx[va] = b1;
        const mat = kind === 'seal' ? 'hazard' : kind === 'goal' ? 'goal' : spec.mat;
        addWall(new T.Vector3(...mn), new T.Vector3(...mx), mat);
        if (kind !== 'goal') W.quads.push({ a, s, k, ua, va, u0: a0, u1: a1, v0: b0, v1: b1, mat, room, floor: f === '-y' });
      }
    }
  });
  // free-standing blocks (pillars, partitions, the walls inside loops) and the penalty box
  W.blocks = [];
  for (const b of level.blocks || []) for (const half of ['blue', 'orange']) {
    if (half === 'orange' && b.m === '') continue;
    const c = half === 'blue' ? b.c : toOrange(level, b.c);
    const mn = new T.Vector3(c[0] - b.s[0] / 2, c[1] - b.s[1] / 2, c[2] - b.s[2] / 2), mx = new T.Vector3(c[0] + b.s[0] / 2, c[1] + b.s[1] / 2, c[2] + b.s[2] / 2);
    W.blocks.push({ ...addWall(mn, mx, b.mat || 'hull'), style: b.style });
  }
  W.bin = null;
  if (level.bin) {
    const [bx, by, bz] = level.bin.c, [sx, sy, sz] = level.bin.s, t = 0.3, box = { min: new T.Vector3(bx - sx / 2, by - sy / 2, bz - sz / 2), max: new T.Vector3(bx + sx / 2, by + sy / 2, bz + sz / 2) };
    const slab = (x0, x1, y0, y1, z0, z1) => addWall(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1), 'bin');
    const { min: m, max: M } = box;
    slab(m.x, M.x, m.y - t, m.y, m.z, M.z); slab(m.x, M.x, M.y, M.y + t, m.z, M.z);
    slab(m.x - t, m.x, m.y, M.y, m.z, M.z); slab(M.x, M.x + t, m.y, M.y, m.z, M.z);
    slab(m.x, M.x, m.y, M.y, m.z - t, m.z); slab(m.x, M.x, m.y, M.y, M.z, M.z + t);
    W.bin = { ...box, c: new T.Vector3(bx, by, bz) };
  }
  // spatial grid: each wall goes into every cell its (slightly grown) box touches
  for (const w of W.walls) {
    const g = 1.3, i0 = Math.floor((w.min.x - g) / GRID), i1 = Math.floor((w.max.x + g) / GRID), j0 = Math.floor((w.min.y - g) / GRID), j1 = Math.floor((w.max.y + g) / GRID), k0 = Math.floor((w.min.z - g) / GRID), k1 = Math.floor((w.max.z + g) / GRID);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const key = cellKey(i, j, k); let c = W.cells.get(key); if (!c) W.cells.set(key, c = []); c.push(w); }
  }
  buildGraph();
  return W;
}
const cellKey = (i, j, k) => (i + 512) + (j + 512) * 1024 + (k + 512) * 1048576;
const EMPTY = [];
function wallsNear(p) { return WORLD.cells.get(cellKey(Math.floor(p.x / GRID), Math.floor(p.y / GRID), Math.floor(p.z / GRID))) || EMPTY; }

// ------------------------------------------------------------------ collision
const _c = new T.Vector3(), _n = new T.Vector3();
// Keeps a sphere out of every wall and inside the outer boundary, bouncing its velocity. Returns the hardest hit speed.
function constrainSphere(pos, vel, r, bounce, hit) {
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) {
    let touched = false;
    for (const w of wallsNear(pos)) {
      _c.copy(pos).clamp(w.min, w.max);
      const dx = pos.x - _c.x, dy = pos.y - _c.y, dz = pos.z - _c.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); _n.set(dx / d, dy / d, dz / d); pos.copy(_c).addScaledVector(_n, r); }
      else {
        // center inside the slab: leave through its thin side
        const ex = [pos.x - w.min.x, w.max.x - pos.x, pos.y - w.min.y, w.max.y - pos.y, pos.z - w.min.z, w.max.z - pos.z];
        let m = 0; for (let i = 1; i < 6; i++) if (ex[i] < ex[m]) m = i;
        _n.set(m === 0 ? -1 : m === 1 ? 1 : 0, m === 2 ? -1 : m === 3 ? 1 : 0, m === 4 ? -1 : m === 5 ? 1 : 0);
        pos.addScaledVector(_n, ex[m] + r);
      }
      impact = Math.max(impact, reflect(vel, _n, bounce)); touched = true;
      if (hit) { hit.normal = _n.clone(); hit.wall = w; }
    }
    if (!touched) break;
  }
  const b = WORLD.bounds;
  for (const ax of ['x', 'y', 'z']) {
    if (pos[ax] < b.min[ax] + r) { pos[ax] = b.min[ax] + r; if (vel[ax] < 0) { impact = Math.max(impact, -vel[ax]); vel[ax] *= -bounce; if (hit) hit.edge = true; } }
    if (pos[ax] > b.max[ax] - r) { pos[ax] = b.max[ax] - r; if (vel[ax] > 0) { impact = Math.max(impact, vel[ax]); vel[ax] *= -bounce; if (hit) hit.edge = true; } }
  }
  return impact;
}
// Is p inside a wall (grown by margin), or outside the boundary?
function solidAt(p, margin = 0) {
  const b = WORLD.bounds;
  if (p.x < b.min.x || p.x > b.max.x || p.y < b.min.y || p.y > b.max.y || p.z < b.min.z || p.z > b.max.z) return true;
  for (const w of wallsNear(p)) if (p.x > w.min.x - margin && p.x < w.max.x + margin && p.y > w.min.y - margin && p.y < w.max.y + margin && p.z > w.min.z - margin && p.z < w.max.z + margin) return true;
  return false;
}
const freeAt = (p, margin = 0) => !solidAt(p, margin);
const _s = new T.Vector3();
// Is the straight line from a to b open? margin keeps it clear of walls by that much.
function clearLine(a, b, margin = 0.25) {
  const d = a.distanceTo(b), steps = Math.max(2, Math.ceil(d / 0.6));
  for (let i = 1; i < steps; i++) { _s.lerpVectors(a, b, i / steps); if (solidAt(_s, margin)) return false; }
  return true;
}
function roomAt(p) { for (const r of WORLD.rooms) if (p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y && p.z >= r.min.z && p.z <= r.max.z) return r; return null; }

// ------------------------------------------------------------------ route graph (built per level)
function buildGraph() {
  const W = WORLD, level = W.level, nodes = W.nodes;
  const add = (p, kind) => { if (solidAt(p, 0.75)) return -1; nodes.push({ p: p.clone(), kind, n: [] }); return nodes.length - 1; };
  for (const r of W.rooms) {
    const size = r.max.clone().sub(r.min), c = r.min.clone().add(r.max).multiplyScalar(0.5);
    const count = ax => Math.max(1, Math.round(size.getComponent(ax) / 11));
    const nx = count(0), ny = Math.min(2, count(1)), nz = count(2);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++)
      add(new T.Vector3(r.min.x + size.x * (i + 0.5) / nx, r.min.y + size.y * (j + 0.5) / ny, r.min.z + size.z * (k + 0.5) / nz), 'room');
  }
  for (const d of W.doors) add(d.c, 'door');
  if (level.exterior !== false) {
    for (const w of W.windows) { add(w.c, 'window'); const out = w.c.clone().addScaledVector(w.n, 5); if (!nodes.some(n => n.kind === 'air' && n.p.distanceTo(out) < 7)) add(out, 'air'); }
    const b = W.bounds, step = 22;
    for (let x = b.min.x + 8; x < b.max.x - 4; x += step) for (let y = b.min.y + 6; y < b.max.y - 4; y += step) for (let z = b.min.z + 8; z < b.max.z - 4; z += step) {
      const p = new T.Vector3(x, y, z);
      if (!roomAt(p) && !(W.bin && p.distanceTo(W.bin.c) < 12)) add(p, 'air');
    }
  }
  for (const b of level.extraNodes || []) for (const p of [b, toOrange(level, b)]) add(new T.Vector3(...p), 'room');
  // connect each node to its nearest visible neighbours; travel through space costs a little more, so bots prefer the corridors
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => [j, m.p.distanceTo(n.p)]).filter(([j, d]) => j !== i && d < 36).sort((p, q) => p[1] - q[1]).slice(0, 14);
    for (const [j, d] of near) {
      if (n.n.some(e => e[0] === j)) continue;
      if (!clearLine(n.p, nodes[j].p, 0.8)) continue;
      const cost = d * (n.kind === 'air' || nodes[j].kind === 'air' ? 1.2 : 1);
      n.n.push([j, cost]); nodes[j].n.push([i, cost]);
    }
  });
  nodes.forEach((n, i) => { const key = cellKey(Math.floor(n.p.x / 12), Math.floor(n.p.y / 12), Math.floor(n.p.z / 12)); let c = W.nodeCells.get(key); if (!c) W.nodeCells.set(key, c = []); c.push(i); });
}
function nearestNode(p) {
  const W = WORLD, ci = Math.floor(p.x / 12), cj = Math.floor(p.y / 12), ck = Math.floor(p.z / 12);
  let best = -1, bd = Infinity, any = -1, ad = Infinity;
  for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) for (let k = ck - 2; k <= ck + 2; k++) for (const id of W.nodeCells.get(cellKey(i, j, k)) || EMPTY) {
    const d = W.nodes[id].p.distanceToSquared(p);
    if (d < ad) { ad = d; any = id; }
    if (d < bd && (d < 2.5 || clearLine(p, W.nodes[id].p, 0.5))) { bd = d; best = id; }
  }
  if (best >= 0) return best;
  if (any >= 0) return any;
  W.nodes.forEach((n, i) => { const d = n.p.distanceToSquared(p); if (d < ad) { ad = d; any = i; } });
  return any;
}
// Shortest path between two nodes (one Dijkstra tree per start node, kept).
function routeBetween(a, b) {
  const W = WORLD, nodes = W.nodes;
  if (a < 0 || b < 0) return [];
  let prev = W.routes.get(a);
  if (!prev) {
    const dist = new Float32Array(nodes.length).fill(Infinity), done = new Uint8Array(nodes.length);
    prev = new Int16Array(nodes.length).fill(-1); dist[a] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, w] of nodes[u].n) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    W.routes.set(a, prev);
  }
  const path = [];
  for (let u = b; u >= 0; u = prev[u]) { path.unshift(u); if (u === a) break; }
  return path[0] === a ? path : [a, b];
}
// A path of points from p to q that the route graph can fly.
function pathPoints(p, q) { return routeBetween(nearestNode(p), nearestNode(q)).map(i => WORLD.nodes[i].p); }

// ------------------------------------------------------------------ textures painted for the level look
const WTEX = {};
function wtex(key, w, h, paint, opts = {}) {
  if (WTEX[key]) return WTEX[key];
  const t = canvasTexture(w, h, paint);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  if (opts.nearest) { t.magFilter = T.NearestFilter; }
  return (WTEX[key] = t);
}
// Hull panels drawn like cel animation: flat fill, bold dark seams, a few rivets and stencil marks.
const panelArt = () => wtex('panel', 512, 512, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const rnd = seeded(31);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = ['#ffffff', '#eeeeee', '#f6f6f6', '#e6e6e6'][(i * 2 + j + (i ? 1 : 0)) % 4]; g.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); }
  g.strokeStyle = '#30343c'; g.lineWidth = 7; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  g.strokeStyle = 'rgba(40,44,52,0.35)'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const x = rnd() * w, y = rnd() * h, l = 30 + rnd() * 60; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke(); }
  g.fillStyle = '#30343c';
  for (const [x, y] of [[18, 18], [w / 2 - 18, 18], [18, h / 2 - 18], [w / 2 - 18, h / 2 - 18]]) for (const [ox, oy] of [[0, 0], [w / 2, 0], [0, h / 2], [w / 2, h / 2]]) { g.beginPath(); g.arc(x + ox, y + oy, 5, 0, 7); g.fill(); }
});
// See-through walls: glass panes drawn the way animation draws glass (a frame and two glint strokes). Cut-out, not blended,
// so they cost the headset almost nothing, and you can watch the whole match through them.
const latticeArt = () => wtex('lattice', 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineCap = 'round';
  g.lineWidth = 12; g.strokeRect(0, 0, w, h);
  g.lineWidth = 7; g.beginPath(); g.moveTo(34, 100); g.lineTo(100, 34); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(62, 116); g.lineTo(116, 62); g.stroke();
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); }
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

// ------------------------------------------------------------------ meshes
function buildLevelMeshes(scene, env) {
  const W = WORLD, level = W.level, th = level.theme, group = new T.Group();
  const buf = () => ({ p: [], n: [], uv: [], c: [] });
  const B = { hull: buf(), floor: buf(), field: buf(), hazard: buf(), mirror: buf(), ceil: buf() }, rooms = th.art === 'backrooms';
  const strips = [], col = new T.Color();
  const zone = z => (level.neutral ? th.strip.mid : z > 2 ? TEAM_COLOR.blue : z < -2 ? TEAM_COLOR.orange : th.strip.mid);
  const emit = (b, pts, nrm, uvs, color) => { col.set(color); for (const i of [0, 1, 2, 0, 2, 3]) { b.p.push(...pts[i]); b.n.push(...nrm); b.uv.push(...uvs[i]); b.c.push(col.r, col.g, col.b); } };
  for (const q of W.quads) {
    const mk = (u, v) => { const p = [0, 0, 0]; p[q.a] = q.k; p[q.ua] = u; p[q.va] = v; return p; };
    const pts = [mk(q.u0, q.v0), mk(q.u1, q.v0), mk(q.u1, q.v1), mk(q.u0, q.v1)], nrm = [0, 0, 0]; nrm[q.a] = -q.s;
    const mat = q.mat === 'hull' && q.floor ? 'floor' : q.mat === 'hull' && rooms && q.a === 1 ? 'ceil' : q.mat, scale = mat === 'field' ? 1 / 3 : mat === 'hazard' ? 1 / 3 : 1 / 7;
    const uvs = [[q.u0, q.v0], [q.u1, q.v0], [q.u1, q.v1], [q.u0, q.v1]].map(([u, v]) => [u * scale, v * scale]);
    const zc = (q.room.min.z + q.room.max.z) / 2, tint = q.room.tint || (mat === 'floor' ? th.floor : mat === 'field' ? th.field : th.hull);
    const color = mat === 'hazard' ? '#ffffff' : mat === 'ceil' ? '#fff6cc' : '#' + new T.Color(tint).lerp(new T.Color(zone(zc)), mat === 'field' ? 0.45 : level.neutral ? 0 : 0.07).getHexString();
    emit(B[mat] || B.hull, pts, nrm, uvs, color);
  }
  // light strips along the long floor and ceiling edges of every room; frames round every open window
  const strip = (a, b, color, s = 0.14) => { const d = [Math.abs(b[0] - a[0]) || s, Math.abs(b[1] - a[1]) || s, Math.abs(b[2] - a[2]) || s]; strips.push({ geo: G.box(...d), pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], color }); };
  for (const r of W.rooms) {
    const alongZ = r.max.z - r.min.z >= r.max.x - r.min.x, zc = (r.min.z + r.max.z) / 2, e = 0.12;
    for (const sgn of [0, 1]) {
      const side = alongZ ? (sgn ? r.max.x - e : r.min.x + e) : (sgn ? r.max.z - e : r.min.z + e);
      const A = y => (alongZ ? [[side, y, r.min.z], [side, y, r.max.z]] : [[r.min.x, y, side], [r.max.x, y, side]]);
      strip(...A(r.min.y + e), zone(zc)); strip(...A(r.max.y - e), th.strip.white);
    }
  }
  for (const f of W.frames) {
    const mk = (u, v) => { const p = [0, 0, 0]; p[f.a] = f.k; p[f.ua] = u; p[f.va] = v; return p; }, c = th.strip.accent;
    strip(mk(f.u0, f.v0), mk(f.u1, f.v0), c, 0.1); strip(mk(f.u0, f.v1), mk(f.u1, f.v1), c, 0.1); strip(mk(f.u0, f.v0), mk(f.u0, f.v1), c, 0.1); strip(mk(f.u1, f.v0), mk(f.u1, f.v1), c, 0.1);
  }
  const geo = b => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(b.c, 3)); g.computeBoundingSphere(); return g; };
  const mesh = (b, mat) => { if (!b.p.length) return null; const m = new T.Mesh(geo(b), mat); m.frustumCulled = false; group.add(m); return m; };
  const toon = (extra = {}) => new T.MeshToonMaterial({ vertexColors: true, map: panelArt(), gradientMap: toonGradient(), side: T.DoubleSide, ...extra });
  const mats = {};
  mats.hull = th.shiny ? new T.MeshStandardMaterial({ vertexColors: true, map: panelArt(), metalness: 0.95, roughness: 0.1, envMap: env, envMapIntensity: 1.25, side: T.DoubleSide }) : toon(rooms ? { map: wallpaperArt() } : {});
  mats.floor = th.shiny ? mats.hull : toon(rooms ? { map: carpetArt() } : {});
  mats.ceil = new T.MeshBasicMaterial({ vertexColors: true, map: ceilingArt(), side: T.DoubleSide, toneMapped: false });
  mats.field = new T.MeshBasicMaterial({ vertexColors: true, map: latticeArt(), alphaTest: 0.2, alphaToCoverage: true, side: T.DoubleSide, toneMapped: false, fog: !!th.fogWalls });
  mats.hazard = new T.MeshToonMaterial({ map: hazardArt(), gradientMap: toonGradient(), side: T.DoubleSide });
  mesh(B.hull, mats.hull); mesh(B.floor, mats.floor); mesh(B.field, mats.field); mesh(B.hazard, mats.hazard); mesh(B.mirror, mats.hull); mesh(B.ceil, mats.ceil);
  // blocks and the penalty box
  const blockParts = [], binParts = [];
  for (const b of W.blocks) {
    const s = b.max.clone().sub(b.min), c = b.min.clone().add(b.max).multiplyScalar(0.5);
    blockParts.push({ geo: G.box(s.x, s.y, s.z), pos: c.toArray(), color: b.style === 'hazard' ? '#ffd23d' : (b.style || th.block || th.hull) });
    if (b.style === 'hazard') for (let k = -2; k <= 2; k++) strips.push({ geo: G.box(s.x > s.z ? 0.5 : s.x + 0.04, s.y * 0.8, s.x > s.z ? s.z + 0.04 : 0.5), pos: [c.x + (s.x > s.z ? k * s.x / 5.5 : 0), c.y, c.z + (s.x > s.z ? 0 : k * s.z / 5.5)], color: '#1c1f26' });
  }
  if (blockParts.length) { const m = new T.Mesh(mergeParts(blockParts), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), map: rooms ? wallpaperArt() : null })); group.add(m); }
  if (W.bin) {
    const { min: m, max: M, c } = W.bin, e = 0.1, cb = '#ff4f6a';
    for (const y of [m.y, M.y]) { strip([m.x, y, m.z], [M.x, y, m.z], cb, e); strip([m.x, y, M.z], [M.x, y, M.z], cb, e); strip([m.x, y, m.z], [m.x, y, M.z], cb, e); strip([M.x, y, m.z], [M.x, y, M.z], cb, e); }
    for (const x of [m.x, M.x]) for (const z of [m.z, M.z]) strip([x, m.y, z], [x, M.y, z], cb, e);
    const fb = buf(), sz = M.clone().sub(m);
    const face = (pts, nrm) => emit(fb, pts, nrm, [[0, 0], [pts[1][0] - pts[0][0] + pts[1][2] - pts[0][2], 0], [1, 1], [0, 1]].map((u, i) => [[0, 0], [1, 0], [1, 1], [0, 1]][i].map((v, k) => v * (k ? sz.y : Math.max(sz.x, sz.z)) / 3)), cb);
    face([[m.x, m.y, m.z], [M.x, m.y, m.z], [M.x, M.y, m.z], [m.x, M.y, m.z]], [0, 0, 1]); face([[m.x, m.y, M.z], [M.x, m.y, M.z], [M.x, M.y, M.z], [m.x, M.y, M.z]], [0, 0, -1]);
    face([[m.x, m.y, m.z], [m.x, m.y, M.z], [m.x, M.y, M.z], [m.x, M.y, m.z]], [1, 0, 0]); face([[M.x, m.y, m.z], [M.x, m.y, M.z], [M.x, M.y, M.z], [M.x, M.y, m.z]], [-1, 0, 0]);
    mesh(fb, mats.field);
    binParts.push({ geo: G.box(sz.x, 0.2, sz.z), pos: [c.x, m.y - 0.1, c.z], color: '#2a2030' }, { geo: G.box(sz.x, 0.2, sz.z), pos: [c.x, M.y + 0.1, c.z], color: '#2a2030' });
    group.add(new T.Mesh(mergeParts(binParts), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })));
    const tag = labelSprite('PENALTY BOX', { color: '#ffffff', bg: 'rgba(255,79,106,0.7)', height: 1.4 }); tag.position.set(c.x, M.y + 1.6, c.z); group.add(tag);
  }
  // goals: frame with a round opening, a glowing rim in the defending team's color, a recess going back into the wall
  const goalParts = [], goalGlow = [];
  for (const g of W.goals) {
    const c = TEAM_COLOR[g.team], side = g.r + 0.45, shape = new T.Shape();
    shape.moveTo(-side, -side); shape.lineTo(side, -side); shape.lineTo(side, side); shape.lineTo(-side, side); shape.lineTo(-side, -side);
    const hole = new T.Path(); hole.absarc(0, 0, g.r, 0, Math.PI * 2, true); shape.holes.push(hole);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), g.n), e = new T.Euler().setFromQuaternion(q), rot = [e.x / DEG, e.y / DEG, e.z / DEG];
    const at = d => g.c.clone().addScaledVector(g.n, d).toArray();
    goalParts.push({ geo: new T.ShapeGeometry(shape, 24), pos: at(0.02), rot, color: '#262a34' },
                   { geo: new T.CylinderGeometry(g.r, g.r, 2.4, 28, 1, true).rotateX(Math.PI / 2), pos: at(-1.2), rot, color: '#12151c' }, { geo: new T.CircleGeometry(g.r, 28), pos: at(-2.4), rot, color: '#0a0c12' });
    goalGlow.push({ geo: G.torus(g.r, g.kind === 'deep' ? 0.18 : 0.13, 8, 44), pos: at(0.04), rot, color: c }, { geo: G.torus(g.r * 0.98, 0.05, 4, 36), pos: at(-0.9), rot, color: c }, { geo: G.torus(g.r * 0.98, 0.05, 4, 36), pos: at(-1.8), rot, color: c });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, o = new T.Vector3(Math.cos(a) * (side - 0.14), Math.sin(a) * (side - 0.14), 0.05).applyQuaternion(q); goalGlow.push({ geo: G.box(0.12, 0.12, 0.05), pos: g.c.clone().add(o).toArray(), rot, color: '#ffffff' }); }
    const tag = labelSprite(g.kind === 'deep' ? 'DEEP GOAL  3' : '1', { color: '#ffffff', bg: hexA(c, 0.65), height: g.kind === 'deep' ? 0.8 : 0.65 });
    const up = Math.abs(g.n.y) > 0.9 ? new T.Vector3(0, 0, g.c.z > 0 ? -1 : 1) : new T.Vector3(0, 1, 0);
    tag.position.copy(g.c).addScaledVector(g.n, 0.6).addScaledVector(up, g.r + 1); group.add(tag);
  }
  const goalMesh = new T.Mesh(mergeParts(goalParts), new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: T.DoubleSide }));
  const goalGlowMesh = glowing(goalGlow); group.add(goalMesh, goalGlowMesh);
  const stripMesh = glowing(strips); stripMesh.frustumCulled = false; group.add(stripMesh);
  // The Mirror Vault: the level's own skeleton of light, repeated in every direction like a hall of mirrors (first the mirror
  // image just past each edge of the field, then a fainter copy beyond that), so the place seems to go on forever.
  if (th.mirrors) {
    const Bn = W.bounds, size = Bn.max.clone().sub(Bn.min);
    const ghost = o => new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: T.DoubleSide, fog: false });
    const near = ghost(0.42), far = ghost(0.17);
    for (const ax of ['x', 'y', 'z']) for (const sgn of [1, -1]) {
      const a = new T.Mesh(stripMesh.geometry, near); a.scale[ax] = -1; a.position[ax] = 2 * (sgn > 0 ? Bn.max[ax] : Bn.min[ax]); a.frustumCulled = false; a.renderOrder = -1; group.add(a);
      const b = new T.Mesh(stripMesh.geometry, far); b.position[ax] = sgn * 2 * size[ax]; b.frustumCulled = false; b.renderOrder = -1; group.add(b);
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
  scene.add(group);
  return { group, sight, sightRings, sightGlow, ringMat, stripMesh, mats };
}

// Stencilled words on floors and walls: every label is painted into one atlas texture and drawn by one mesh.
function buildDecals(level) {
  const list = [];
  for (const r of WORLD.rooms) if (r.label) list.push({ text: r.label, c: [(r.min.x + r.max.x) / 2, r.min.y + WALL_T / 2 + 0.04, (r.min.z + r.max.z) / 2], w: Math.min(r.max.x - r.min.x, r.max.z - r.min.z) * 0.7, alongZ: r.max.z - r.min.z > r.max.x - r.min.x, color: level.theme.decal });
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
