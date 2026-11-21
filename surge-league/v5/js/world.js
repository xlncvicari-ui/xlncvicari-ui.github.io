// Version 5 level engine. A level (js/levels.js) is a list of box-shaped ROOMS. From that this file works out everything else:
// - WALLS: every face of every room becomes wall slabs, minus DOORWAYS (wherever two rooms touch), minus open WINDOWS.
//   Walls are real solids, so the space outside the rooms is flyable: go out a window, come back in anywhere.
// - 'field' walls are see-through (solid, but you can watch through them); 'hull' walls are opaque.
// - COLLISION for riders and the core against all of it (a grid makes it fast), an outer boundary, and line-of-sight checks.
// - a ROUTE GRAPH for the bots (room points, doorways, windows, and points out in space), so any level works without hand-made paths.
// The meshes are built in js/worldmesh.js.
//
// Added 2026-11-21 so levels stop looking like boxes:
// - COVES: the edges where two walls of a room meet are rounded (kind recipe `r`, or room `cove`), with matching collision.
//   A cove can also be a few flat facets (`profile`), which is how the Endless Chasm gets twelve sides out of a square room.
// - ROUNDED OPENINGS: windows and doorways get rounded corners (small solid corner pieces keep you out of them).
// - ORBS: round floating rocks (level.orbs). MOVERS: moving platforms, flat twelve-sided discs (level.movers).
// - LOOP: a level with `loop: P` repeats every P meters up and down, forever. Positions are never wrapped: the walls are simply
//   looked up at (y mod P), and goals and route points are slid to the copy nearest the core (worldFollow).
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
const WORLD = { level: null, rooms: [], walls: [], goals: [], nodes: [], windows: [], doors: [], coves: [], orbs: [], movers: [], bounds: null, loop: 0, oy: 0,
                cells: new Map(), nodeCells: new Map(), routes: new Map() };
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
    const base = { id: r.id, min: [r.x[0], r.y[0], r.z[0]], max: [r.x[1], r.y[1], r.z[1]], kind: r.kind || 'corridor', faces: r.faces || {}, label: r.label, tint: r.tint, cove: r.cove };
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
// spec: 'hull' | 'field' | 'open', or { mat, win: [width, gap, low, high] } for a row of open windows.
function faceSpec(level, room, f) {
  const d = level.kinds[room.kind] || level.kinds.corridor, spec = room.faces[f] !== undefined ? room.faces[f] : f === '-y' ? d.floor : f === '+y' ? d.ceil : (f[1] === 'z' ? (d.end || d.side) : d.side);
  return typeof spec === 'string' ? { mat: spec } : spec;
}
// How the edges of this room that run along axis a3 are rounded: { R, profile?, mat? } or null for a sharp edge.
// profile = points from [1, 0] to [0, 1] in units of R (distance from wall A, distance from wall B); none = a quarter circle.
function coveSpec(level, room, a3) {
  const own = room.cove, k = level.kinds[room.kind] || {};
  const v = own !== undefined && typeof own === 'object' ? (own['xyz'[a3]] !== undefined ? own['xyz'[a3]] : k.r) : own !== undefined ? own : k.r;
  return !v ? null : typeof v === 'number' ? { R: v } : v;
}
function facetPlanes(profile, R) {
  const out = [];
  for (let i = 0; i + 1 < profile.length; i++) {
    const p0 = profile[i][0] * R, q0 = profile[i][1] * R, dp = profile[i + 1][0] * R - p0, dq = profile[i + 1][1] * R - q0, len = Math.hypot(dp, dq);
    let np = -dq / len, nq = dp / len; if (np * (R - p0) + nq * (R - q0) < 0) { np = -np; nq = -nq; }
    out.push({ np, nq, d: np * p0 + nq * q0 });
  }
  return out;
}
function loadLevel(level) {
  const W = WORLD, sharp = !!level.sharp;
  Object.assign(W, { level, rooms: expandRooms(level), walls: [], quads: [], goals: [], nodes: [], windows: [], doors: [], cells: new Map(), nodeCells: new Map(), routes: new Map(),
                     frames: [], coves: [], rounds: [], veils: [], orbs: [], movers: [], loop: level.loop || 0, oy: 0 });
  W.bounds = { min: new T.Vector3(...level.bounds[0]), max: new T.Vector3(...level.bounds[1]) };
  // goals: defined for the blue end, mirrored for orange
  for (const g of level.goals || []) for (const team of ['blue', 'orange']) {
    const c = team === 'blue' ? g.c : toOrange(level, g.c), n = team === 'blue' ? g.n : toOrange(level, g.n);
    W.goals.push({ team, kind: g.kind, c: new T.Vector3(...c), by: c[1], n: new T.Vector3(...n).normalize(), r: g.r || (g.kind === 'deep' ? 1.9 : 1.6), points: POINTS[g.kind] });
  }
  const pair = (list, a, b) => (list || []).some(([p, q]) => (a.base === p && b.base === q) || (a.base === q && b.base === p));
  const addWall = (min, max, mat) => { const w = { min, max, mat, i: W.walls.length }; W.walls.push(w); return w; };

  // ---- pass 1: every face of every room, and the holes in it (doorways, goal plates, windows)
  W.rooms.forEach((room, ri) => {
    room.i = ri; room.info = {}; room.coves = {}; room.coveList = [];
    for (const f of FACES) {
      const a = AX[f[1]], s = f[0] === '+' ? 1 : -1, [ua, va] = faceUV(a), k = s > 0 ? room.max.getComponent(a) : room.min.getComponent(a);
      const spec = faceSpec(level, room, f);
      const u0 = room.min.getComponent(ua), u1 = room.max.getComponent(ua), v0 = room.min.getComponent(va), v1 = room.max.getComponent(va);
      const holes = [], I = room.info[f] = { f, a, s, k, ua, va, u0, u1, v0, v1, spec, holes };
      if (spec.mat === 'open') continue;
      // doorways: any room whose opposite face sits on this plane and overlaps
      W.rooms.forEach((o, oi) => {
        if (o === room) return;
        const ok = s > 0 ? o.min.getComponent(a) : o.max.getComponent(a);
        if (Math.abs(ok - k) > 0.02) return;
        const a0 = Math.max(u0, o.min.getComponent(ua)), a1 = Math.min(u1, o.max.getComponent(ua)), b0 = Math.max(v0, o.min.getComponent(va)), b1 = Math.min(v1, o.max.getComponent(va));
        if (a1 - a0 < 0.6 || b1 - b0 < 0.6) return;
        if (pair(level.seals, room, o)) { holes.push({ u0: a0, u1: a1, v0: b0, v1: b1, kind: oi < ri ? 'skip' : 'seal' }); return; }
        holes.push({ u0: a0, u1: a1, v0: b0, v1: b1, kind: 'door', lead: oi > ri });
        if (oi > ri) {
          const c = [0, 0, 0]; c[a] = k; c[ua] = (a0 + a1) / 2; c[va] = (b0 + b1) / 2; W.doors.push({ c: new T.Vector3(...c), a, size: [a1 - a0, b1 - b0] });
          if (pair(level.veils, room, o)) W.veils.push({ a, k, ua, va, u0: a0, u1: a1, v0: b0, v1: b1 });
        }
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
        }
      }
    }
  });

  // ---- pass 2: coves. An edge is rounded wherever BOTH of its walls are solid right up to it (no doorway, window or goal there).
  const cutOut = (ivs, lo, hi) => ivs.flatMap(([a, b]) => (hi <= a || lo >= b ? [[a, b]] : [[a, Math.min(b, lo)], [Math.max(a, hi), b]].filter(([x, y]) => y - x > 1e-6)));
  const both = (A, B) => A.flatMap(([a, b]) => B.map(([c, d]) => [Math.max(a, c), Math.min(b, d)])).filter(([x, y]) => y - x > 0.6);
  if (!sharp) for (const room of W.rooms) for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const A = room.info[FACES[i]], B = room.info[FACES[j]];
    if (A.a === B.a || A.spec.mat === 'open' || B.spec.mat === 'open') continue;
    const a3 = 3 - A.a - B.a, cv = coveSpec(level, room, a3); if (!cv) continue;
    const size = room.max.clone().sub(room.min), R = Math.min(cv.R, size.getComponent(A.a) / 2, size.getComponent(B.a) / 2); if (R < 0.3) continue;
    const lo = room.min.getComponent(a3), hi = room.max.getComponent(a3);
    const solidOf = (F, O) => {
      let ivs = [[lo, hi]]; const band = O.s > 0 ? [O.k - R, O.k] : [O.k, O.k + R];
      for (const h of F.holes) {
        if (h.kind !== 'door' && h.kind !== 'window' && h.kind !== 'goal') continue;
        const ext = ax => (ax === F.ua ? [h.u0, h.u1] : [h.v0, h.v1]), [p0, p1] = ext(O.a), [t0, t1] = ext(a3);
        if (p1 > band[0] + 0.01 && p0 < band[1] - 0.01) ivs = cutOut(ivs, t0, t1);
      }
      return ivs;
    };
    const ivs = both(solidOf(A, B), solidOf(B, A)); if (!ivs.length) continue;
    const mat = cv.mat || (A.spec.mat === 'field' && B.spec.mat === 'field' ? 'field' : 'hull');
    const c = { room, A, B, a3, R, ivs, mat, profile: cv.profile || null, planes: cv.profile ? facetPlanes(cv.profile, R) : null, low: A.f === '-y' || B.f === '-y', high: A.f === '+y' || B.f === '+y' };
    room.coves[A.f + B.f] = room.coves[B.f + A.f] = c; room.coveList.push(c); W.coves.push(c);
  }

  // ---- pass 3: cut every face into a grid along every hole and cove edge, then merge runs of solid cells into slabs
  for (const room of W.rooms) for (const f of FACES) {
    const I = room.info[f], { a, s, k, ua, va, u0, u1, v0, v1, holes, spec } = I;
    if (spec.mat === 'open') continue;
    const border = (ax, sg) => room.coves[f + (sg > 0 ? '+' : '-') + 'xyz'[ax]];
    const cu0 = border(ua, -1), cu1 = border(ua, 1), cv0 = border(va, -1), cv1 = border(va, 1);
    const cutsU = holes.flatMap(h => [h.u0, h.u1]), cutsV = holes.flatMap(h => [h.v0, h.v1]);
    if (cu0) { cutsU.push(u0 + cu0.R); cutsV.push(...cu0.ivs.flat()); } if (cu1) { cutsU.push(u1 - cu1.R); cutsV.push(...cu1.ivs.flat()); }
    if (cv0) { cutsV.push(v0 + cv0.R); cutsU.push(...cv0.ivs.flat()); } if (cv1) { cutsV.push(v1 - cv1.R); cutsU.push(...cv1.ivs.flat()); }
    const within = (c, t) => c.ivs.some(([x, y]) => t > x && t < y);
    const coved = (cu, cv) => (cu0 && cu - u0 < cu0.R && within(cu0, cv)) || (cu1 && u1 - cu < cu1.R && within(cu1, cv)) || (cv0 && cv - v0 < cv0.R && within(cv0, cu)) || (cv1 && v1 - cv < cv1.R && within(cv1, cu));
    const cut = (lo, hi, list) => [...new Set([lo, hi, ...list.map(x => Math.max(lo, Math.min(hi, x)))])].sort((p, q) => p - q);
    const U = cut(u0, u1, cutsU), V = cut(v0, v1, cutsV);
    const emit = (a0, a1, b0, b1, kind) => {
      if (kind === 'door' || kind === 'window' || kind === 'skip') return;
      const mn = [0, 0, 0], mx = [0, 0, 0];
      mn[a] = k - WALL_T / 2; mx[a] = k + WALL_T / 2; mn[ua] = a0; mx[ua] = a1; mn[va] = b0; mx[va] = b1;
      const mat = kind === 'seal' ? 'hazard' : kind === 'goal' ? 'goal' : spec.mat;
      addWall(new T.Vector3(...mn), new T.Vector3(...mx), mat);
      if (kind !== 'goal' && kind !== 'cove') W.quads.push({ a, s, k, ua, va, u0: a0, u1: a1, v0: b0, v1: b1, mat, room, floor: f === '-y' });
    };
    for (let j = 0; j < V.length - 1; j++) {
      let run = null;
      const flush = () => { if (!run) return; emit(run.u0, run.u1, V[j], V[j + 1], run.kind); run = null; };
      for (let i = 0; i < U.length - 1; i++) {
        const cu = (U[i] + U[i + 1]) / 2, cv = (V[j] + V[j + 1]) / 2, h = holes.find(h => cu > h.u0 && cu < h.u1 && cv > h.v0 && cv < h.v1);
        const kind = h ? h.kind : coved(cu, cv) ? 'cove' : 'wall';
        if (run && run.kind === kind) run.u1 = U[i + 1]; else { flush(); run = { u0: U[i], u1: U[i + 1], kind }; }
      }
      flush();
    }
    // rounded corners for the windows, and for each doorway (drawn once, by the room listed first)
    for (const h of holes) {
      const win = h.kind === 'window'; if (!win && !(h.kind === 'door' && h.lead)) continue;
      const r = sharp ? 0 : Math.min(win ? 1.0 : 1.5, 0.22 * Math.min(h.u1 - h.u0, h.v1 - h.v0));
      W.frames.push({ a, k, ua, va, u0: h.u0, u1: h.u1, v0: h.v0, v1: h.v1, r, color: win ? 'accent' : 'white', door: !win });
      if (r < 0.3) continue;
      for (const [cu, du] of [[h.u0, 1], [h.u1, -1]]) for (const [cv, dv] of [[h.v0, 1], [h.v1, -1]]) {
        W.rounds.push({ a, s, k, ua, va, cu, cv, du, dv, r, mat: spec.mat, room, floor: f === '-y' });
        const c = r * 0.3, mn = [0, 0, 0], mx = [0, 0, 0];
        mn[a] = k - WALL_T / 2; mx[a] = k + WALL_T / 2; mn[ua] = Math.min(cu, cu + du * c); mx[ua] = Math.max(cu, cu + du * c); mn[va] = Math.min(cv, cv + dv * c); mx[va] = Math.max(cv, cv + dv * c);
        addWall(new T.Vector3(...mn), new T.Vector3(...mx), 'trim');
      }
    }
  }

  // free-standing blocks (pillars, partitions), round rocks, moving platforms and the penalty box
  const halves = it => (it.m === '' ? ['blue'] : ['blue', 'orange']);
  W.blocks = [];
  for (const b of level.blocks || []) for (const half of halves(b)) {
    const c = half === 'blue' ? b.c : toOrange(level, b.c);
    const mn = new T.Vector3(c[0] - b.s[0] / 2, c[1] - b.s[1] / 2, c[2] - b.s[2] / 2), mx = new T.Vector3(c[0] + b.s[0] / 2, c[1] + b.s[1] / 2, c[2] + b.s[2] / 2);
    W.blocks.push({ ...addWall(mn, mx, b.mat || 'hull'), style: b.style });
  }
  (level.orbs || []).forEach((o, i) => { for (const half of halves(o)) W.orbs.push({ c: new T.Vector3(...(half === 'blue' ? o.c : toOrange(level, o.c))), r: o.r, style: o.style || level.theme.orb || 'rock', seed: i * 7 + (half === 'blue' ? 1 : 4) }); });
  (level.movers || []).forEach((m, i) => { for (const half of halves(m)) W.movers.push({ ...m, i, flip: half === 'orange', pos: new T.Vector3(), vel: new T.Vector3(), spin: 0 }); });
  updateMovers(0, 0);
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
  W.coveRooms = W.rooms.filter(r => r.coveList.length);
  buildGraph();
  return W;
}
const cellKey = (i, j, k) => (i + 512) + (j + 512) * 1024 + (k + 512) * 1048576;
const EMPTY = [];
function wallsNear(p) { return WORLD.cells.get(cellKey(Math.floor(p.x / GRID), Math.floor(p.y / GRID), Math.floor(p.z / GRID))) || EMPTY; }

// ------------------------------------------------------------------ moving platforms
// Where a mover is at time t. Paths: orbit (round a point, with an optional bob), line (back and forth), helix (round and up, forever).
function moverAt(m, t, out) {
  const p = m.path, P = WORLD.loop;
  if (p.type === 'orbit') { const a = (p.ph || 0) + p.w * t; out.set(p.c[0] + p.R * Math.cos(a), p.c[1] + (p.bob ? p.bob[0] * Math.sin(p.bob[1] * t + (p.ph || 0)) : 0), p.c[2] + p.R * Math.sin(a)); }
  else if (p.type === 'line') { const k = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (t / p.T + (p.ph || 0))); out.set(p.a[0] + (p.b[0] - p.a[0]) * k, p.a[1] + (p.b[1] - p.a[1]) * k, p.a[2] + (p.b[2] - p.a[2]) * k); }
  else if (p.type === 'helix') { const a = (p.ph || 0) + p.w * t, y = p.y0 + p.climb * t; out.set(p.c[0] + p.R * Math.cos(a), P ? y - P * Math.floor(y / P) : y, p.c[1] + p.R * Math.sin(a)); }
  else out.set(...p.c);
  if (m.flip) { const q = toOrange(WORLD.level, [out.x, out.y, out.z]); out.set(q[0], q[1], q[2]); }
  return out;
}
const _mv = new T.Vector3();
function updateMovers(t, dt) {
  const P = WORLD.loop;
  for (const m of WORLD.movers) {
    _mv.copy(m.pos); moverAt(m, t, m.pos);
    if (dt > 0) { m.vel.subVectors(m.pos, _mv).divideScalar(dt); if (P && Math.abs(m.vel.y) > P / 4 / dt) m.vel.y = (m.path.climb || 0); } else m.vel.set(0, 0, 0);
    m.spin = (m.spinRate || 0.25) * t * (m.i % 2 ? -1 : 1);
  }
  WORLD.time = t;
}

// ------------------------------------------------------------------ collision
const _c = new T.Vector3(), _n = new T.Vector3();
// Inside a cove's corner zone? Pushes the sphere back onto the curve (or the facets) and bounces it. Returns the hit speed or -1.
function coveHit(c, pos, vel, r, bounce, hit) {
  const t = pos.getComponent(c.a3); let on = false;
  for (const iv of c.ivs) if (t >= iv[0] && t <= iv[1]) { on = true; break; }
  if (!on) return -1;
  const A = c.A, B = c.B, R = c.R; let p = (A.k - pos.getComponent(A.a)) * A.s, q = (B.k - pos.getComponent(B.a)) * B.s;
  if (p < 0 || q < 0 || p >= R || q >= R) return -1;
  let impact = -1;
  const shove = (np, nq, by) => {
    p += np * by; q += nq * by;
    pos.setComponent(A.a, A.k - A.s * p); pos.setComponent(B.a, B.k - B.s * q);
    _n.set(0, 0, 0); _n.setComponent(A.a, -A.s * np); _n.setComponent(B.a, -B.s * nq);
    impact = Math.max(impact, reflect(vel, _n, bounce)); if (hit) { hit.normal = _n.clone(); hit.wall = c; }
  };
  if (!c.planes) { const dx = R - p, dy = R - q, d = Math.hypot(dx, dy), lim = R - r; if (lim > 0 && d > lim) shove(dx / d, dy / d, d - lim); }
  else for (const pl of c.planes) { const sd = pl.np * p + pl.nq * q - pl.d; if (sd < r) shove(pl.np, pl.nq, r - sd); }
  return impact;
}
// A flat disc (a cylinder standing on its axis): the moving platforms.
function discHit(m, pos, vel, r, bounce, hit) {
  const P = WORLD.loop; let dy = pos.y - m.pos.y; if (P) dy -= P * Math.round(dy / P);
  const hh = m.h / 2, dx = pos.x - m.pos.x, dz = pos.z - m.pos.z, rad = Math.hypot(dx, dz);
  if (Math.abs(dy) > hh + r || rad > m.r + r) return -1;
  const cr = Math.min(rad, m.r), cy = Math.max(-hh, Math.min(hh, dy)), k = rad > 1e-6 ? cr / rad : 0;
  let nx = dx - dx * k, ny = dy - cy, nz = dz - dz * k, d = Math.hypot(nx, ny, nz), by;
  if (d > 1e-6) { if (d >= r) return -1; nx /= d; ny /= d; nz /= d; by = r - d; }
  else if (hh - Math.abs(dy) < m.r - rad) { nx = 0; nz = 0; ny = dy >= 0 ? 1 : -1; by = hh - Math.abs(dy) + r; }      // inside: out through the nearer face
  else { nx = rad > 1e-6 ? dx / rad : 1; nz = rad > 1e-6 ? dz / rad : 0; ny = 0; by = m.r - rad + r; }
  pos.x += nx * by; pos.y += ny * by; pos.z += nz * by;
  _n.set(nx, ny, nz); vel.sub(m.vel); const impact = reflect(vel, _n, bounce); vel.add(m.vel);
  if (hit) { hit.normal = _n.clone(); hit.wall = m; }
  return impact;
}
// Keeps a sphere out of every wall, cove, rock and platform and inside the outer boundary, bouncing its velocity.
// Returns the hardest hit speed.
function constrainSphere(pos, vel, r, bounce, hit) {
  const W = WORLD, P = W.loop, sh = P ? P * Math.floor(pos.y / P) : 0;
  let impact = 0; pos.y -= sh;
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
    for (const room of W.coveRooms) {
      if (pos.x < room.min.x || pos.x > room.max.x || pos.y < room.min.y || pos.y > room.max.y || pos.z < room.min.z || pos.z > room.max.z) continue;
      for (const c of room.coveList) { const k = coveHit(c, pos, vel, r, bounce, hit); if (k >= 0) { impact = Math.max(impact, k); touched = true; } }
    }
    for (const o of W.orbs) {
      const dx = pos.x - o.c.x, dy = pos.y - o.c.y, dz = pos.z - o.c.z, d2 = dx * dx + dy * dy + dz * dz, lim = o.r + r;
      if (d2 >= lim * lim) continue;
      const d = Math.sqrt(d2) || 1e-4; _n.set(dx / d, dy / d, dz / d); pos.copy(o.c).addScaledVector(_n, lim);
      impact = Math.max(impact, reflect(vel, _n, bounce)); touched = true; if (hit) { hit.normal = _n.clone(); hit.wall = o; }
    }
    for (const m of W.movers) { const k = discHit(m, pos, vel, r, bounce, hit); if (k >= 0) { impact = Math.max(impact, k); touched = true; } }
    if (!touched) break;
  }
  const b = W.bounds;
  for (const ax of P ? ['x', 'z'] : ['x', 'y', 'z']) {
    if (pos[ax] < b.min[ax] + r) { pos[ax] = b.min[ax] + r; if (vel[ax] < 0) { impact = Math.max(impact, -vel[ax]); vel[ax] *= -bounce; if (hit) hit.edge = true; } }
    if (pos[ax] > b.max[ax] - r) { pos[ax] = b.max[ax] - r; if (vel[ax] > 0) { impact = Math.max(impact, vel[ax]); vel[ax] *= -bounce; if (hit) hit.edge = true; } }
  }
  pos.y += sh;
  return impact;
}
// Is p inside something solid (grown by margin), or outside the boundary?
const _f = new T.Vector3();
function solidAt(p0, margin = 0) {
  const W = WORLD, b = W.bounds, P = W.loop, p = P ? _f.set(p0.x, p0.y - P * Math.floor(p0.y / P), p0.z) : p0;
  if (p.x < b.min.x || p.x > b.max.x || p.z < b.min.z || p.z > b.max.z || (!P && (p.y < b.min.y || p.y > b.max.y))) return true;
  for (const w of wallsNear(p)) if (p.x > w.min.x - margin && p.x < w.max.x + margin && p.y > w.min.y - margin && p.y < w.max.y + margin && p.z > w.min.z - margin && p.z < w.max.z + margin) return true;
  for (const o of W.orbs) if (p.distanceToSquared(o.c) < (o.r + margin) * (o.r + margin)) return true;
  for (const m of W.movers) {
    let dy = p.y - m.pos.y; if (P) dy -= P * Math.round(dy / P);
    if (Math.abs(dy) < m.h / 2 + margin && Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < m.r + margin) return true;
  }
  for (const room of W.coveRooms) {
    if (p.x < room.min.x || p.x > room.max.x || p.y < room.min.y || p.y > room.max.y || p.z < room.min.z || p.z > room.max.z) continue;
    for (const c of room.coveList) {
      const t = p.getComponent(c.a3); if (!c.ivs.some(iv => t >= iv[0] && t <= iv[1])) continue;
      const pp = (c.A.k - p.getComponent(c.A.a)) * c.A.s, q = (c.B.k - p.getComponent(c.B.a)) * c.B.s, R = c.R;
      if (pp < 0 || q < 0 || pp >= R || q >= R) continue;
      if (!c.planes) { if (Math.hypot(R - pp, R - q) > R - margin) return true; }
      else for (const pl of c.planes) if (pl.np * pp + pl.nq * q - pl.d < margin) return true;
    }
  }
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
function roomAt(p) {
  const P = WORLD.loop, y = P ? p.y - P * Math.floor(p.y / P) : p.y;
  for (const r of WORLD.rooms) if (p.x >= r.min.x && p.x <= r.max.x && y >= r.min.y && y <= r.max.y && p.z >= r.min.z && p.z <= r.max.z) return r;
  return null;
}
// A looping level: slide the goals and the bots' route points to the copy of the level nearest height y (where the core is).
// Returns true when the route points moved (paths planned before that are stale).
function worldFollow(y) {
  const W = WORLD, P = W.loop; if (!P) return false;
  for (const g of W.goals) g.c.y = g.by + P * Math.round((y - g.by) / P);
  const oy = P * Math.floor(y / P); if (oy === W.oy) return false;
  W.oy = oy; for (const n of W.nodes) n.p.y = n.by + oy;
  return true;
}

// ------------------------------------------------------------------ route graph (built per level)
function buildGraph() {
  const W = WORLD, level = W.level, nodes = W.nodes, b = W.bounds, P = W.loop;
  const add = (p, kind) => { if (solidAt(p, 0.75)) return -1; nodes.push({ p: p.clone(), by: p.y, kind, n: [] }); return nodes.length - 1; };
  for (const r of W.rooms) {
    const size = r.max.clone().sub(r.min);
    const count = ax => Math.max(1, Math.round(size.getComponent(ax) / 11));
    const nx = count(0), ny = Math.min(P ? 4 : 2, count(1)), nz = count(2);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++)
      add(new T.Vector3(r.min.x + size.x * (i + 0.5) / nx, r.min.y + size.y * (j + 0.5) / ny, r.min.z + size.z * (k + 0.5) / nz), 'room');
  }
  for (const d of W.doors) add(d.c, 'door');
  if (level.exterior !== false) {
    for (const w of W.windows) { add(w.c, 'window'); const out = w.c.clone().addScaledVector(w.n, 5); if (!nodes.some(n => n.kind === 'air' && n.p.distanceTo(out) < 7)) add(out, 'air'); }
    const step = W.rooms.length ? 22 : 13, y0 = P ? 4 : b.min.y + 6, y1 = P ? P - 3 : b.max.y - 4;
    for (let x = b.min.x + 8; x < b.max.x - 4; x += step) for (let y = y0; y < y1; y += step) for (let z = b.min.z + 8; z < b.max.z - 4; z += step) {
      const p = new T.Vector3(x, y, z);
      if (!roomAt(p) && !(W.bin && p.distanceTo(W.bin.c) < 12)) add(p, W.rooms.length ? 'air' : 'room');
    }
  }
  for (const z of level.zones || []) if (z.c) add(new T.Vector3(...z.c), 'room');
  for (const e of level.extraNodes || []) for (const p of [e, toOrange(level, e)]) add(new T.Vector3(...p), 'room');
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
  const W = WORLD, ci = Math.floor(p.x / 12), cj = Math.floor((p.y - W.oy) / 12), ck = Math.floor(p.z / 12);
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
