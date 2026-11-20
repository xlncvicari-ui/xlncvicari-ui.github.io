// Meridian Station: the map for version 4. One mirrored layout (left/right and blue end/orange end are identical).
//
//   top view (z runs along the station; blue defends +z, orange defends -z)
//
//        [ring]=====BACK CORRIDOR (deep goal, 3)=====[ring]        z = -76   orange end
//          ||                                         ||
//      side corridor          | LOBBY end wall: |   side corridor
//          ||                 | 3 holes (1 pt)  |      ||
//          ||                 |                 |      ||
//          ++== transverse ===+   SIGHT RING    +=== transverse ==++   z = 0 (everyone's sightline)
//          ||                 |                 |      ||
//          ||                 | 3 holes (1 pt)  |      ||
//        [ring]=====BACK CORRIDOR (deep goal, 3)=====[ring]        z = +76   blue end
//
// The straight route (the lobby) is short and crowded and its goals are worth 1. The flank routes run down a side corridor,
// around a loop (a wall inside each loop makes you go the long way, about 270 degrees) and into the back corridor behind
// the lobby, where the deep goal is worth 3. Everything is built from code and baked into a handful of meshes.

// ------------------------------------------------------------------ small geometry helpers (borrowed from v3 realms.js)
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

// ------------------------------------------------------------------ dimensions (meters)
const ST = {
  LW: 15, LH: 18, LZ: 44,          // lobby: x -15..15, y 0..18, z -44..44
  CY: 9, CH: 4.5,                  // corridors: square, 9 m across, centered at y 9
  SX: 50,                          // side corridors run along z at x = +-50
  RZ: 76, RR: 12,                  // loops centered at (+-50, 9, +-76), centerline radius 12
  BZ: 76,                          // back corridors run along x at z = +-76
  HOLE_R: 1.6, DEEP_R: 1.9
};
ST.RI = ST.RR - ST.CH; ST.RO = ST.RR + ST.CH;
ST.SIDE_END = ST.RZ - Math.sqrt(ST.RO * ST.RO - ST.CH * ST.CH); // where a side corridor meets its loop's outer wall
ST.BACK_END = ST.SX - Math.sqrt(ST.RO * ST.RO - ST.CH * ST.CH); // where a back corridor meets a loop
const SIGHT = new T.Vector3(0, ST.CY, 0), SIGHT_R = 1.1;
const ZONE_COLOR = { blue: '#3d8bff', orange: '#ff7a2f', mid: '#3dffa0', white: '#e8f4ff' };

// ------------------------------------------------------------------ layout: collision volumes, blockers, goals, routes
function buildLayout() {
  const { LW, LH, LZ, CY, CH, SX, RZ, RR, RI, RO, BZ } = ST, y0 = CY - CH, y1 = CY + CH;
  const vols = [], blockers = [], goals = [];
  const box = (ax, bx, ay, by, az, bz, name) => vols.push({ type: 'box', min: new T.Vector3(Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz)), max: new T.Vector3(Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)), name });
  box(-LW, LW, 0, LH, -LZ, LZ, 'lobby');
  for (const sx of [1, -1]) {
    // Joined spaces overlap deeply (3 m or more), so the seam between them never acts like a wall.
    box(sx * 3, sx * ST.SX, y0, y1, -CH, CH, 'transverse');
    box(sx * (SX - CH), sx * (SX + CH), y0, y1, -(ST.SIDE_END + 3), ST.SIDE_END + 3, 'side');
  }
  for (const sz of [1, -1]) box(-(ST.BACK_END + 3), ST.BACK_END + 3, y0, y1, sz * (BZ - CH), sz * (BZ + CH), 'back');
  const rings = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const ring = { type: 'ring', c: new T.Vector3(sx * SX, CY, sz * RZ), ri: RI, ro: RO, h: CH, sx, sz, name: 'ring' };
    vols.push(ring); rings.push(ring);
    // The wall inside each loop, across the short way between where you come in and where you go out (local -135 degrees).
    const la = -135 * DEG, dir = new T.Vector3(sx * Math.cos(la), 0, sz * Math.sin(la));
    const c = ring.c.clone().addScaledVector(dir, RR), q = new T.Quaternion().setFromAxisAngle(UP, Math.atan2(-dir.z, dir.x));
    const half = new T.Vector3(CH + 0.4, CH + 0.2, 0.35);
    blockers.push({ type: 'box', c, half, nhalf: half.clone().negate(), q, qInv: q.clone().invert(), ring });
  }
  // Goals: the team that DEFENDS it, where it is, which way its opening faces (n points out into the station), radius, points.
  for (const sz of [1, -1]) {
    const team = sz > 0 ? 'blue' : 'orange', n = new T.Vector3(0, 0, -sz);
    for (const [x, y] of [[-9, 6], [0, 12], [9, 6]]) goals.push({ team, kind: 'hole', c: new T.Vector3(x, y, sz * LZ), n, r: ST.HOLE_R, points: POINTS.hole });
    goals.push({ team, kind: 'deep', c: new T.Vector3(0, CY, sz * (BZ + CH)), n, r: ST.DEEP_R, points: POINTS.deep });
  }
  return { vols, blockers, goals, rings, routes: buildRoutes(rings) };
}

// Waypoint graph for the bots: nodes along every corridor, linked in order. route(from, to) = list of points.
function buildRoutes(rings) {
  const { CY, SX, RR, BZ } = ST, nodes = [], links = [];
  const node = (x, z, tag) => { nodes.push({ p: new T.Vector3(x, CY, z), tag, n: [] }); return nodes.length - 1; };
  const link = (a, b) => { const d = nodes[a].p.distanceTo(nodes[b].p); nodes[a].n.push([b, d]); nodes[b].n.push([a, d]); };
  const chain = ids => { for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]); return ids; };
  const lobby = chain([-38, -26, -13, 0, 13, 26, 38].map(z => node(0, z, z === 0 ? 'center' : 'lobby')));
  const center = lobby[3], tags = {};
  for (const sx of [1, -1]) {
    const door = node(sx * 11, 0, 'door'), mid = node(sx * 30, 0, 'transverse'), junction = node(sx * SX, 0, 'junction');
    chain([center, door, mid, junction]);
    for (const sz of [1, -1]) {
      const side = chain([junction, node(sx * SX, sz * 20, 'side'), node(sx * SX, sz * 40, 'side'), node(sx * SX, sz * 56, 'side')]);
      const ring = rings.find(r => r.sx === sx && r.sz === sz);
      const ringIds = [-90, -45, 0, 45, 90, 135, 180].map(a => node(ring.c.x + sx * RR * Math.cos(a * DEG), ring.c.z + sz * RR * Math.sin(a * DEG), 'ring'));
      chain([side[side.length - 1], ...ringIds]);
      tags[`ring${sx}${sz}`] = ringIds;
      tags[`side${sx}${sz}`] = side;
    }
  }
  for (const sz of [1, -1]) {
    const back = chain([-34, -26, -13, 0, 13, 26, 34].map(x => node(x, sz * BZ, x === 0 ? 'deep' : 'back')));
    for (const sx of [1, -1]) link(back[sx > 0 ? 6 : 0], tags[`ring${sx}${sz}`][6]);
    tags[`back${sz}`] = back;
  }
  tags.lobby = lobby; tags.center = center;
  return { nodes, tags };
}

const STATION = buildLayout();

// ------------------------------------------------------------------ collision (inside the union of volumes)
// Signed distance: negative inside a volume. The station is the union of all volumes, so the free space at p is min over volumes.
const _sv = new T.Vector3();
function volumeSd(v, p) {
  if (v.type === 'box') return Math.max(v.min.x - p.x, p.x - v.max.x, v.min.y - p.y, p.y - v.max.y, v.min.z - p.z, p.z - v.max.z);
  const dx = p.x - v.c.x, dz = p.z - v.c.z, r = Math.hypot(dx, dz);
  return Math.max(v.ri - r, r - v.ro, Math.abs(p.y - v.c.y) - v.h);
}
// Outward normal of volume v's nearest wall at p (into the wall).
function volumeNormal(v, p, out) {
  if (v.type === 'box') {
    const cands = [[v.min.x - p.x, -1, 0, 0], [p.x - v.max.x, 1, 0, 0], [v.min.y - p.y, 0, -1, 0], [p.y - v.max.y, 0, 1, 0], [v.min.z - p.z, 0, 0, -1], [p.z - v.max.z, 0, 0, 1]];
    let best = cands[0]; for (const c of cands) if (c[0] > best[0]) best = c;
    return out.set(best[1], best[2], best[3]);
  }
  const dx = p.x - v.c.x, dz = p.z - v.c.z, r = Math.hypot(dx, dz) || 1, dy = p.y - v.c.y;
  const a = v.ri - r, b = r - v.ro, c = Math.abs(dy) - v.h;
  if (c >= a && c >= b) return out.set(0, Math.sign(dy) || 1, 0);
  return b >= a ? out.set(dx / r, 0, dz / r) : out.set(-dx / r, 0, -dz / r);
}
function stationSd(p) { let best = Infinity, vol = null; for (const v of STATION.vols) { const s = volumeSd(v, p); if (s < best) { best = s; vol = v; } } return { sd: best, vol }; }
function insideBlocker(p, margin = 0) {
  for (const o of STATION.blockers) {
    cA.subVectors(p, o.c).applyQuaternion(o.qInv);
    if (Math.abs(cA.x) < o.half.x + margin && Math.abs(cA.y) < o.half.y + margin && Math.abs(cA.z) < o.half.z + margin) return true;
  }
  return false;
}
function freeAt(p, margin = 0) { return stationSd(p).sd < -margin && !insideBlocker(p, margin); }

// Keeps a sphere inside the station and out of the loop walls, bouncing its velocity. Returns the hardest hit speed.
// hit (optional) gets .normal of the last wall touched.
const _sn = new T.Vector3();
function constrainSphere(pos, vel, r, bounce, hit) {
  let impact = 0;
  for (let pass = 0; pass < 3; pass++) {
    const { sd, vol } = stationSd(pos);
    if (sd <= -r) break;
    volumeNormal(vol, pos, _sn);
    pos.addScaledVector(_sn, -(sd + r));
    _sv.copy(_sn).negate();
    impact = Math.max(impact, reflect(vel, _sv, bounce));
    if (hit) hit.normal = _sv.clone();
  }
  for (const o of STATION.blockers) {
    cA.subVectors(pos, o.c).applyQuaternion(o.qInv);
    cB.copy(cA).clamp(o.nhalf, o.half); cC.subVectors(cA, cB);
    const d = cC.length();
    if (d >= r) continue;
    if (d < 1e-6) { cC.set(0, 0, Math.sign(cA.z) || 1); cB.z = o.half.z * cC.z; } else cC.divideScalar(d);
    pos.copy(cB).addScaledVector(cC, r).applyQuaternion(o.q).add(o.c);
    cC.applyQuaternion(o.q);
    impact = Math.max(impact, reflect(vel, cC, bounce));
    if (hit) hit.normal = cC.clone();
  }
  return impact;
}
function reflect(vel, n, bounce) {
  const vn = vel.dot(n);
  if (vn >= 0) return 0;
  vel.addScaledVector(n, -(1 + bounce) * vn);
  return -vn;
}
// Is the straight line from a to b open (no walls)? margin keeps it away from walls (for a ball or a body).
function clearLine(a, b, margin = 0.25) {
  const d = a.distanceTo(b), steps = Math.max(2, Math.ceil(d / 1.2));
  for (let i = 1; i < steps; i++) { _sv.lerpVectors(a, b, i / steps); if (!freeAt(_sv, margin)) return false; }
  return true;
}

// ------------------------------------------------------------------ routes
function nearestNode(p) {
  let best = 0, bd = Infinity;
  STATION.routes.nodes.forEach((n, i) => { const d = n.p.distanceToSquared(p); if (d < bd && (d < 4 || clearLine(p, n.p, 0.3))) { bd = d; best = i; } });
  if (bd === Infinity) STATION.routes.nodes.forEach((n, i) => { const d = n.p.distanceToSquared(p); if (d < bd) { bd = d; best = i; } });
  return best;
}
const _routeCache = new Map();
// Shortest path between two node ids (Dijkstra; the graph has ~80 nodes). avoid: optional set of node ids to stay off.
function routeBetween(a, b) {
  const key = a * 1000 + b;
  if (_routeCache.has(key)) return _routeCache.get(key);
  const nodes = STATION.routes.nodes, dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
  dist[a] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const [v, w] of nodes[u].n) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const path = [];
  for (let u = b; u >= 0; u = prev[u]) { path.unshift(u); if (u === a) break; }
  _routeCache.set(key, path);
  return path;
}
// Node ids for an attacking team's routes: 'lobby' (straight at the 1-point holes), 'left' / 'right' (around a loop to the deep goal).
function attackTargets(team) {
  const sz = -HOME_SIGN[team], t = STATION.routes.tags;
  return {
    lobby: t.lobby[sz > 0 ? 6 : 0],                 // 6 m from their lobby wall: close range on the holes
    left: t[`back${sz}`][3], right: t[`back${sz}`][3], // the deep goal, reached around the left or right loop
    leftVia: t[`side${-1}${sz}`][1], rightVia: t[`side${1}${sz}`][1]
  };
}

// ------------------------------------------------------------------ building the meshes
// Walls are flat rectangles with rectangular holes (doorways, windows, goal openings). Windows get glass, doorways nothing.
function buildStation(scene, envMap) {
  const { LW, LH, LZ, CY, CH, SX, RZ, RR, RI, RO, BZ } = ST, y0 = CY - CH, y1 = CY + CH;
  const wall = { p: [], n: [], uv: [] }, floor = { p: [], n: [], uv: [] }, glass = { p: [], n: [], uv: [] }, strips = [], goalParts = [], goalGlow = [];
  const emit = (buf, a, b, c, d, nrm) => {
    for (const v of [a, b, c, a, c, d]) { buf.p.push(v.x, v.y, v.z); buf.n.push(nrm.x, nrm.y, nrm.z); }
    for (const v of [a, b, c, a, c, d]) buf.uv.push(...v.uv);
  };
  const P = (x, y, z, u, v) => Object.assign(new T.Vector3(x, y, z), { uv: [u * 0.14, v * 0.14] });
  // plane 'x': wall at x = k, u = z, v = y. plane 'z': wall at z = k, u = x, v = y. plane 'y': floor/ceiling at y = k, u = x, v = z.
  const point = (plane, k, u, v) => plane === 'x' ? P(k, v, u, u, v) : plane === 'z' ? P(u, v, k, u, v) : P(u, k, v, u, v);
  const normalOf = plane => plane === 'x' ? new T.Vector3(1, 0, 0) : plane === 'z' ? new T.Vector3(0, 0, 1) : new T.Vector3(0, 1, 0);
  function rect(plane, k, u0, u1, v0, v1, holes = [], target = wall) {
    const us = [u0, u1], vs = [v0, v1];
    for (const h of holes) { us.push(Math.max(u0, Math.min(u1, h.u0)), Math.max(u0, Math.min(u1, h.u1))); vs.push(Math.max(v0, Math.min(v1, h.v0)), Math.max(v0, Math.min(v1, h.v1))); }
    const U = [...new Set(us)].sort((a, b) => a - b), V = [...new Set(vs)].sort((a, b) => a - b), nrm = normalOf(plane);
    for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < V.length - 1; j++) {
      const cu = (U[i] + U[i + 1]) / 2, cv = (V[j] + V[j + 1]) / 2, h = holes.find(h => cu > h.u0 && cu < h.u1 && cv > h.v0 && cv < h.v1);
      const quad = buf => emit(buf, point(plane, k, U[i], V[j]), point(plane, k, U[i + 1], V[j]), point(plane, k, U[i + 1], V[j + 1]), point(plane, k, U[i], V[j + 1]), nrm);
      if (!h) quad(target === wall && plane === 'y' && k < CY ? floor : target); else if (h.kind === 'glass') quad(glass);
    }
    // frames around windows: thin light strips
    for (const h of holes) if (h.kind === 'glass' && h.frame !== false) {
      const c = h.color || ZONE_COLOR.white, s = 0.08;
      const bar = (a, b) => { const pa = point(plane, k, a[0], a[1]), pb = point(plane, k, b[0], b[1]), mid = pa.clone().add(pb).multiplyScalar(0.5), len = pa.distanceTo(pb);
        const dx = Math.abs(pa.x - pb.x) > 0.01, dy = Math.abs(pa.y - pb.y) > 0.01;
        strips.push({ geo: G.box(dx ? len : s, dy ? len : s, !dx && !dy ? len : (plane === 'z' ? s : (dx || dy) && plane !== 'x' ? (dx && dy ? s : s) : s)), pos: mid.toArray(), color: c }); };
      bar([h.u0, h.v0], [h.u1, h.v0]); bar([h.u0, h.v1], [h.u1, h.v1]); bar([h.u0, h.v0], [h.u0, h.v1]); bar([h.u1, h.v0], [h.u1, h.v1]);
    }
  }
  const win = (u0, u1, v0, v1, color) => ({ u0, u1, v0, v1, kind: 'glass', color });
  const door = (u0, u1, v0, v1) => ({ u0, u1, v0, v1, kind: 'open' });
  const strip = (a, b, color, s = 0.12) => {
    const pa = new T.Vector3(...a), pb = new T.Vector3(...b), d = pb.clone().sub(pa);
    strips.push({ geo: G.box(Math.abs(d.x) || s, Math.abs(d.y) || s, Math.abs(d.z) || s), pos: pa.clone().add(pb).multiplyScalar(0.5).toArray(), color });
  };
  const half = sz => (sz > 0 ? ZONE_COLOR.blue : ZONE_COLOR.orange);

  // ---- lobby
  rect('y', 0, -LW, LW, -LZ, LZ, [win(-9, 9, -9, 9, ZONE_COLOR.mid)]);
  rect('y', LH, -LW, LW, -LZ, LZ, [win(-9, 9, -9, 9, ZONE_COLOR.mid), win(-6, 6, 14, 38), win(-6, 6, -38, -14)]);
  for (const sx of [1, -1]) rect('x', sx * LW, -LZ, LZ, 0, LH, [door(-CH, CH, y0, y1), win(12, 38, 6, 15), win(-38, -12, 6, 15)]);
  for (const sz of [1, -1]) {
    const holes = STATION.goals.filter(g => g.kind === 'hole' && Math.sign(g.c.z) === sz).map(g => ({ u0: g.c.x - g.r - 0.45, u1: g.c.x + g.r + 0.45, v0: g.c.y - g.r - 0.45, v1: g.c.y + g.r + 0.45, kind: 'goal' }));
    rect('z', sz * LZ, -LW, LW, 0, LH, holes);
    for (const x of [-LW + 0.1, LW - 0.1]) strip([x, 0.1, sz * (LZ - 0.1)], [x, LH - 0.1, sz * (LZ - 0.1)], half(sz));
    strip([-LW, LH - 0.1, sz * (LZ - 0.1)], [LW, LH - 0.1, sz * (LZ - 0.1)], half(sz));
    strip([-LW, 0.1, sz * (LZ - 0.1)], [LW, 0.1, sz * (LZ - 0.1)], half(sz));
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    strip([sx * (LW - 0.1), LH - 0.1, sz * 0.5], [sx * (LW - 0.1), LH - 0.1, sz * LZ], ZONE_COLOR.white);
    strip([sx * (LW - 0.1), 0.1, sz * 0.5], [sx * (LW - 0.1), 0.1, sz * LZ], half(sz));
  }
  // halfway line on the floor and ceiling
  strip([-LW, 0.06, 0], [LW, 0.06, 0], ZONE_COLOR.white, 0.2); strip([-LW, LH - 0.06, 0], [LW, LH - 0.06, 0], ZONE_COLOR.white, 0.2);

  // ---- transverse corridors (z = 0, everyone's sightline through the middle)
  for (const sx of [1, -1]) {
    const a = sx * LW, b = sx * (SX - CH), lo = Math.min(a, b), hi = Math.max(a, b);
    rect('y', y0, lo, hi, -CH, CH); rect('y', y1, lo, hi, -CH, CH);
    for (const sz of [1, -1]) {
      rect('z', sz * CH, lo, hi, y0, y1, [win(lo + 4, hi - 4, y0 + 2, y1 - 2, ZONE_COLOR.mid)]);
      strip([lo, y0 + 0.08, sz * (CH - 0.08)], [hi, y0 + 0.08, sz * (CH - 0.08)], ZONE_COLOR.mid);
    }
    strip([lo, y1 - 0.08, 0], [hi, y1 - 0.08, 0], ZONE_COLOR.white, 0.25);
  }

  // ---- side corridors
  for (const sx of [1, -1]) {
    const xi = sx * (SX - CH), xo = sx * (SX + CH), lo = Math.min(xi, xo), hi = Math.max(xi, xo), E = ST.SIDE_END;
    rect('y', y0, lo, hi, -E, E); rect('y', y1, lo, hi, -E, E);
    rect('x', xi, -E, E, y0, y1, [door(-CH, CH, y0, y1), win(12, 52, y0 + 2, y1 - 2), win(-52, -12, y0 + 2, y1 - 2)]);
    rect('x', xo, -E, E, y0, y1, [win(-CH, CH, y0 + 0.6, y1 - 0.6, ZONE_COLOR.mid), win(12, 52, y0 + 2, y1 - 2), win(-52, -12, y0 + 2, y1 - 2)]);
    for (const sz of [1, -1]) {
      strip([sx * SX, y1 - 0.08, sz * CH], [sx * SX, y1 - 0.08, sz * E], ZONE_COLOR.white, 0.25);
      for (const x of [xi, xo]) strip([x - sx * 0.08 * Math.sign(x - sx * SX), y0 + 0.08, sz * CH], [x - sx * 0.08 * Math.sign(x - sx * SX), y0 + 0.08, sz * E], half(sz));
    }
  }

  // ---- back corridors (the deep goal is in the middle of the far wall)
  for (const sz of [1, -1]) {
    const zi = sz * (BZ - CH), zo = sz * (BZ + CH), lo = Math.min(zi, zo), hi = Math.max(zi, zo), E = ST.BACK_END;
    rect('y', y0, -E, E, lo, hi); rect('y', y1, -E, E, lo, hi);
    rect('z', zi, -E, E, y0, y1, [win(-30, -6, y0 + 2, y1 - 2), win(6, 30, y0 + 2, y1 - 2)]);
    const g = STATION.goals.find(g => g.kind === 'deep' && Math.sign(g.c.z) === sz);
    rect('z', zo, -E, E, y0, y1, [{ u0: -g.r - 0.5, u1: g.r + 0.5, v0: g.c.y - g.r - 0.5, v1: g.c.y + g.r + 0.5, kind: 'goal' }, win(-30, -6, y0 + 2, y1 - 2), win(6, 30, y0 + 2, y1 - 2)]);
    strip([-E, y1 - 0.08, sz * BZ], [E, y1 - 0.08, sz * BZ], ZONE_COLOR.white, 0.25);
    for (const z of [zi, zo]) strip([-E, y0 + 0.08, z - sz * 0.08 * Math.sign(z - sz * BZ)], [E, y0 + 0.08, z - sz * 0.08 * Math.sign(z - sz * BZ)], half(sz));
  }

  // ---- loops: annulus floor and ceiling, an inner column, an outer wall with windows and two openings
  for (const ring of STATION.rings) {
    const { c, sx, sz } = ring, segs = 48, gap = Math.asin((CH + 0.05) / RO);
    const entry = Math.atan2(-sz, 0), exit = Math.atan2(0, -sx);
    const inGap = a => [entry, exit].some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap);
    const at = (r, a, y) => P(c.x + r * Math.cos(a), y, c.z + r * Math.sin(a), c.x + r * Math.cos(a), c.z + r * Math.sin(a));
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
      for (const [y, off] of [[y0, -0.03], [y1, 0.03]]) emit(y < CY ? floor : wall, at(RI, a0, y + off), at(RO, a0, y + off), at(RO, a1, y + off), at(RI, a1, y + off), new T.Vector3(0, 1, 0));
      // inner column
      const ia = P(c.x + RI * Math.cos(a0), y0, c.z + RI * Math.sin(a0), a0 * RI, y0), ib = P(c.x + RI * Math.cos(a1), y0, c.z + RI * Math.sin(a1), a1 * RI, y0);
      emit(wall, ia, ib, P(ib.x, y1, ib.z, a1 * RI, y1), P(ia.x, y1, ia.z, a0 * RI, y1), new T.Vector3(Math.cos(a0), 0, Math.sin(a0)));
    }
    // outer wall in 15-degree pieces: solid bands top and bottom, glass between on every other piece, nothing in the openings
    const os = 72;
    for (let i = 0; i < os; i++) {
      const a0 = i / os * Math.PI * 2, a1 = (i + 1) / os * Math.PI * 2, mid = (a0 + a1) / 2;
      if (inGap(mid)) continue;
      const nrm = new T.Vector3(Math.cos(mid), 0, Math.sin(mid)), glassPiece = Math.floor(i / 3) % 2 === 0;
      const band = (ya, yb, buf) => { const A = P(c.x + RO * Math.cos(a0), ya, c.z + RO * Math.sin(a0), a0 * RO, ya), B = P(c.x + RO * Math.cos(a1), ya, c.z + RO * Math.sin(a1), a1 * RO, ya);
        emit(buf, A, B, P(B.x, yb, B.z, a1 * RO, yb), P(A.x, yb, A.z, a0 * RO, yb), nrm); };
      band(y0, y0 + 2, wall); band(y1 - 2, y1, wall); band(y0 + 2, y1 - 2, glassPiece ? glass : wall);
    }
    const col = half(sz);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; if (inGap(a)) continue; strips.push({ geo: G.box(0.12, 0.12, 0.12), pos: [c.x + (RO - 0.1) * Math.cos(a), y0 + 2, c.z + (RO - 0.1) * Math.sin(a)], color: col }); }
    strips.push({ geo: G.torus(RI + 0.06, 0.06, 4, 64), pos: [c.x, y1 - 0.3, c.z], rot: [90, 0, 0], color: ZONE_COLOR.white },
                { geo: G.torus(RI + 0.06, 0.06, 4, 64), pos: [c.x, y0 + 0.3, c.z], rot: [90, 0, 0], color: col },
                { geo: G.torus(RR, 0.1, 4, 96), pos: [c.x, y1 - 0.08, c.z], rot: [90, 0, 0], color: ZONE_COLOR.white });
  }
  // the loop walls: solid slabs with warning stripes, so it is obvious you have to go the long way round
  const blockerParts = [];
  for (const o of STATION.blockers) {
    const e = new T.Euler().setFromQuaternion(o.q);
    blockerParts.push({ geo: G.box(o.half.x * 2, o.half.y * 2, o.half.z * 2), pos: o.c.toArray(), rot: [e.x / DEG, e.y / DEG, e.z / DEG], color: '#c9ced8' });
    for (let k = -3; k <= 3; k++) {
      const off = new T.Vector3(k * 1.2, 0, o.half.z + 0.02).applyQuaternion(o.q);
      strips.push({ geo: G.box(0.35, o.half.y * 2 - 0.4, 0.04), pos: o.c.clone().add(off).toArray(), rot: [e.x / DEG, e.y / DEG, e.z / DEG + 30], color: k % 2 ? '#ffd23d' : '#1c1f26' });
      const off2 = new T.Vector3(k * 1.2, 0, -o.half.z - 0.02).applyQuaternion(o.q);
      strips.push({ geo: G.box(0.35, o.half.y * 2 - 0.4, 0.04), pos: o.c.clone().add(off2).toArray(), rot: [e.x / DEG, e.y / DEG, e.z / DEG - 30], color: k % 2 ? '#ffd23d' : '#1c1f26' });
    }
  }

  // ---- goals: a frame with a round opening, a glowing rim in the defending team's color, a recess going back into the wall
  const goalMeta = [];
  for (const g of STATION.goals) {
    const col = TEAM_COLOR[g.team], side = g.r + (g.kind === 'deep' ? 0.5 : 0.45);
    const shape = new T.Shape(); shape.moveTo(-side, -side); shape.lineTo(side, -side); shape.lineTo(side, side); shape.lineTo(-side, side); shape.lineTo(-side, -side);
    const hole = new T.Path(); hole.absarc(0, 0, g.r, 0, Math.PI * 2, true); shape.holes.push(hole);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), g.n), e = new T.Euler().setFromQuaternion(q), rot = [e.x / DEG, e.y / DEG, e.z / DEG];
    const at = d => g.c.clone().addScaledVector(g.n, d).toArray();
    goalParts.push({ geo: new T.ShapeGeometry(shape, 24), pos: at(0), rot, color: '#2a2f3a' },
                   { geo: new T.CylinderGeometry(g.r, g.r, 2.4, 32, 1, true).rotateX(Math.PI / 2), pos: at(-1.2), rot, color: '#141820' },
                   { geo: new T.CircleGeometry(g.r, 32), pos: at(-2.4), rot, color: '#0b0e14' });
    goalGlow.push({ geo: G.torus(g.r, g.kind === 'deep' ? 0.16 : 0.12, 8, 48), pos: at(0.02), rot, color: col },
                  { geo: G.torus(g.r * 0.98, 0.04, 4, 40), pos: at(-0.9), rot, color: col },
                  { geo: G.torus(g.r * 0.98, 0.04, 4, 40), pos: at(-1.8), rot, color: col });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, o = new T.Vector3(Math.cos(a) * (side - 0.15), Math.sin(a) * (side - 0.15), 0.03).applyQuaternion(q);
      goalGlow.push({ geo: G.box(0.1, 0.1, 0.05), pos: g.c.clone().add(o).toArray(), rot, color: '#ffffff' }); }
    goalMeta.push(g);
  }

  // ---- meshes
  const panels = SURFACES.panel();
  const mkGeo = buf => { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(buf.p, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(buf.n, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(buf.uv, 2)); geo.computeBoundingSphere(); return geo; };
  const wallMat = new T.MeshStandardMaterial({ color: '#eef2f8', map: panels.map, normalMap: panels.normalMap, roughness: 0.42, metalness: 0.25, side: T.DoubleSide, envMap, envMapIntensity: 0.5 });
  panels.map.repeat.set(1, 1); panels.normalMap.repeat.set(1, 1);
  const glassMat = new T.MeshStandardMaterial({ color: '#cfe9ff', transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0.9, side: T.DoubleSide, depthWrite: false, envMap, envMapIntensity: 1.3 });
  const group = new T.Group();
  const walls = new T.Mesh(mkGeo(wall), wallMat); walls.frustumCulled = false;
  // floors a shade darker than walls and ceilings, so down is always obvious
  const floorMat = wallMat.clone(); floorMat.color.set('#7d889c'); floorMat.roughness = 0.5;
  const floors = new T.Mesh(mkGeo(floor), floorMat); floors.frustumCulled = false;
  const glassMesh = new T.Mesh(mkGeo(glass), glassMat); glassMesh.renderOrder = 5; glassMesh.frustumCulled = false;
  group.add(walls, floors, glassMesh, glowing(strips), solid(blockerParts, { roughness: 0.5, metalness: 0.4 }), solid(goalParts, { roughness: 0.4, metalness: 0.6, side: T.DoubleSide }), glowing(goalGlow));
  // points over every goal
  for (const g of goalMeta) {
    const tag = labelSprite(g.kind === 'deep' ? 'DEEP GOAL  3' : '1', { color: '#ffffff', bg: hexA(TEAM_COLOR[g.team], 0.6), height: g.kind === 'deep' ? 0.7 : 0.6 });
    tag.position.copy(g.c).addScaledVector(g.n, 0.4).add(new T.Vector3(0, g.r + 0.9, 0)); group.add(tag);
  }
  // the SIGHT RING: three gyroscope rings in the exact middle of the station
  const sight = new T.Group(); sight.position.copy(SIGHT);
  const ringMat = new T.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.85, toneMapped: false });
  const sightRings = [1.0, 1.18, 1.36].map((r, i) => { const m = new T.Mesh(new T.TorusGeometry(r, 0.035, 6, 64), ringMat); m.rotation.set(i * 1.1, i * 0.7, 0); sight.add(m); return m; });
  const sightGlow = glowSprite('#9ff6ff', 2.6, 0.3); sight.add(sightGlow);
  const sightTag = labelSprite('SIGHT RING', { color: '#e8f4ff', bg: 'rgba(8,18,31,0.5)', height: 0.32 }); sightTag.position.y = 1.9; sight.add(sightTag);
  group.add(sight);
  scene.add(group);
  return { group, sight, sightRings, sightGlow, ringMat, wallMat, glassMat };
}

// ------------------------------------------------------------------ space outside: stars, a nebula band, a planet below, a sun
function paintSpace() {
  return canvasTexture(2048, 1024, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#04060d'); bg.addColorStop(0.5, '#070b18'); bg.addColorStop(1, '#03050a');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const rnd = seeded(907);
    // nebula band across the sky
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = h * 0.42 + Math.sin(x / w * Math.PI * 2) * h * 0.12 + (rnd() - 0.5) * h * 0.16, r = 30 + rnd() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r), c = rnd() < 0.5 ? '90,70,180' : rnd() < 0.5 ? '40,120,190' : '190,70,130';
      gr.addColorStop(0, `rgba(${c},0.07)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * w, y = rnd() * h, s = rnd(), a = 0.3 + rnd() * 0.7;
      g.fillStyle = s > 0.97 ? `rgba(190,215,255,${a})` : s > 0.94 ? `rgba(255,230,200,${a})` : `rgba(255,255,255,${a * 0.8})`;
      g.fillRect(x, y, s > 0.985 ? 2.4 : s > 0.9 ? 1.6 : 1, s > 0.985 ? 2.4 : s > 0.9 ? 1.6 : 1);
    }
  });
}
function paintPlanet() {
  const N = makeNoise(77);
  return canvasTexture(1024, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, land = N.fbm(u * 6, v * 3, 6, 5), cloud = N.fbm(u * 12 + 3, v * 6, 12, 4), lat = Math.abs(v - 0.5) * 2;
      let c = land > 0.53 ? [70 + land * 60, 110 + land * 40, 60] : [18, 52 + land * 40, 110 + land * 60];
      if (lat > 0.82) c = [230, 238, 245];
      const cl = Math.max(0, cloud - 0.5) * 2.4;
      c = c.map(ch => ch + (245 - ch) * Math.min(1, cl));
      const o = (y * w + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function buildSpace(scene) {
  const skyTex = paintSpace();
  const sky = new T.Mesh(new T.SphereGeometry(1400, 48, 24), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -2; scene.add(sky);
  const planet = new T.Mesh(new T.SphereGeometry(520, 64, 40), new T.MeshStandardMaterial({ map: paintPlanet(), roughness: 0.9, metalness: 0, fog: false }));
  planet.position.set(-120, -720, -260); planet.rotation.z = 0.3; scene.add(planet);
  const halo = glowSprite('#6fb8ff', 1250, 0.35); halo.position.copy(planet.position); halo.renderOrder = -1; scene.add(halo);
  const sun = glowSprite('#fff2d6', 160, 0.95); sun.position.set(700, 420, -600); scene.add(sun);
  return { sky, skyTex, planet };
}
