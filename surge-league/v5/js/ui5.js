// Version 5 screens: start menu with level cards, the five-page briefing (the game, this level's map, the controllers, rucks,
// fights and the box), the pause menu, the ruck and fight meter, and pop-up messages with a second line.
// Same canvas panels and Exo 2 type as version 3 (js/ui.js).
const INK = '#eaf4ff', DIM = '#8fa8c4', CYAN = '#66ffff', GOLD = '#ffd166', RED = '#ff4f6a';
function cardBg(g, W, H) {
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(10,20,38,0.95)'); bg.addColorStop(1, 'rgba(6,12,26,0.95)');
  g.fillStyle = bg; rrect(g, 0, 0, W, H, 36); g.fill();
  g.strokeStyle = 'rgba(102,255,255,0.45)'; g.lineWidth = 4; rrect(g, 2, 2, W - 4, H - 4, 34); g.stroke();
}
function tile(g, panel, b, color, title, sub, strong) {
  panel.button(b);
  const grd = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  grd.addColorStop(0, hexA(color, strong ? 0.95 : 0.32)); grd.addColorStop(1, hexA(color, strong ? 0.7 : 0.18));
  g.fillStyle = grd; rrect(g, b.x, b.y, b.w, b.h, 24); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = strong ? '#04121f' : INK; fitFont(g, title, b.w - 36, sub ? 50 : 34, 900);
  g.fillText(title, b.x + b.w / 2, b.y + b.h / 2 - (sub ? 22 : 0) + 2);
  if (sub) { g.fillStyle = strong ? 'rgba(4,18,31,0.8)' : DIM; fitFont(g, sub, b.w - 36, 26, 700); g.fillText(sub, b.x + b.w / 2, b.y + b.h / 2 + 32); }
}

// ------------------------------------------------------------------ a level seen from above
// z runs left to right (BLUE's end on the left, ORANGE's on the right), x runs up and down. Works for any level in js/levels.js.
function paintLevelMap(g, X, Y, w, h, level, opts = {}) {
  const rooms = level._rooms || (level._rooms = expandRooms(level)), th = level.theme, mini = !!opts.mini;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of rooms) { x0 = Math.min(x0, r.min.x); x1 = Math.max(x1, r.max.x); z0 = Math.min(z0, r.min.z); z1 = Math.max(z1, r.max.z); }
  if (!rooms.length) { x0 = level.bounds[0][0] * 0.82; x1 = level.bounds[1][0] * 0.82; z0 = level.bounds[0][2] * 0.86; z1 = level.bounds[1][2] * 0.86; }
  const pad = mini ? 2 : 10, s = Math.min((w - pad * 2) / (z1 - z0), (h - pad * 2) / (x1 - x0)), cx = X + w / 2, cy = Y + h / 2, mz = (z0 + z1) / 2, mx = (x0 + x1) / 2;
  const P = (x, z) => [cx + (z - mz) * -s, cy - (x - mx) * s];
  const box = (ax, bx, az, bz) => { const [px, py] = P(bx, bz), [qx, qy] = P(ax, az); return [Math.min(px, qx), Math.min(py, qy), Math.abs(qx - px), Math.abs(qy - py)]; };
  const fills = { hall: hexA(th.hull, 0.8), atrium: hexA(th.hull, 0.8), office: hexA(th.hull, 0.75), corridor: hexA(th.field, 0.5), vault: hexA(th.strip.accent, 0.55) };
  for (const r of rooms.slice().sort((a, b) => a.min.y - b.min.y)) {
    g.fillStyle = fills[r.kind] || fills.corridor; g.fillRect(...box(r.min.x, r.max.x, r.min.z, r.max.z));
    if (!mini) { g.strokeStyle = 'rgba(8,14,26,0.7)'; g.lineWidth = 2; g.strokeRect(...box(r.min.x, r.max.x, r.min.z, r.max.z)); }
  }
  g.fillStyle = 'rgba(20,24,34,0.85)';
  for (const b of level.blocks || []) for (const c of [b.c, toOrange(level, b.c)]) g.fillRect(...box(c[0] - b.s[0] / 2, c[0] + b.s[0] / 2, c[2] - b.s[2] / 2, c[2] + b.s[2] / 2));
  // rocks, moving platforms (with the circle they travel, if they travel one), and the rings of ZONE CONTROL
  const orbTop = (ORB_STYLES[th.orb] || ORB_STYLES.rock).top, dot = (x, z, r, fill) => { const [px, py] = P(x, z); g.fillStyle = fill; g.beginPath(); g.arc(px, py, Math.max(1.5, r * s), 0, Math.PI * 2); g.fill(); };
  for (const o of level.orbs || []) for (const c of o.m === '' ? [o.c] : [o.c, toOrange(level, o.c)]) if (c[0] > x0 && c[0] < x1 && c[2] > z0 && c[2] < z1) dot(c[0], c[2], o.r, hexA(orbTop, 0.9));
  const moverStart = mv => { const p = mv.path; return p.type === 'line' ? [p.a[0], p.a[2]] : p.type === 'helix' ? [p.c[0] + p.R * Math.cos(p.ph || 0), p.c[1] + p.R * Math.sin(p.ph || 0)] : p.type === 'orbit' ? [p.c[0] + p.R * Math.cos(p.ph || 0), p.c[2] + p.R * Math.sin(p.ph || 0)] : [p.c[0], p.c[2]]; };
  const circled = new Set();
  for (const mv of level.movers || []) {
    const p = mv.path, key = p.type + p.R + (p.c || []).join();
    if (!mini && (p.type === 'orbit' || p.type === 'helix') && !circled.has(key)) { circled.add(key); const [px, py] = P(p.c[0], p.type === 'helix' ? p.c[1] : p.c[2]); g.strokeStyle = hexA(th.strip.accent, 0.5); g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.arc(px, py, p.R * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    dot(...moverStart(mv), mv.r, hexA(th.block || th.hull, 0.95));
  }
  for (const z of level.zones || []) {
    const [zx, zz] = z.c ? [z.c[0], z.c[2]] : moverStart(level.movers[z.on]), [px, py] = P(zx, zz), col = z.home ? TEAM_COLOR[z.home] : '#ffffff';
    g.strokeStyle = col; g.lineWidth = mini ? 2.5 : 4; g.beginPath(); g.arc(px, py, Math.max(4, z.r * s), 0, Math.PI * 2); g.stroke();
    if (!mini) { g.fillStyle = col; g.font = uiFont(26, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(z.id, px, py + 1); }
  }
  // the sealed short cuts (yellow)
  if (!mini) for (const [a, b] of level.seals || []) for (const ra of rooms.filter(r => r.base === a)) for (const rb of rooms.filter(r => r.base === b)) {
    const ox0 = Math.max(ra.min.x, rb.min.x), ox1 = Math.min(ra.max.x, rb.max.x), oz0 = Math.max(ra.min.z, rb.min.z), oz1 = Math.min(ra.max.z, rb.max.z);
    if (ox1 - ox0 < -0.1 || oz1 - oz0 < -0.1) continue;
    g.strokeStyle = GOLD; g.lineWidth = 5; g.beginPath(); g.moveTo(...P(ox0, oz0)); g.lineTo(...P(ox1, oz1)); g.stroke();
  }
  // BLUE's ways to attack (toward ORANGE's end, on the right)
  if (!mini && opts.routes !== false && level.lanes) {
    g.lineWidth = 4; g.setLineDash([12, 10]); g.strokeStyle = CYAN; g.fillStyle = CYAN; g.font = uiFont(18, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const lane of level.lanes) {
      const goal = level.goals.filter(q => q.kind === lane.goal).map(q => toOrange(level, q.c)), end = goal[Math.floor(goal.length / 2)];
      g.beginPath(); g.moveTo(...P(level.spawn.c[0], level.spawn.c[2])); g.lineTo(...P(lane.via[0], lane.via[2])); if (end) g.lineTo(...P(end[0], end[2])); g.stroke();
    }
    g.setLineDash([]);
  }
  for (const q of level.goals || []) for (const team of ['blue', 'orange']) {
    const c = team === 'blue' ? q.c : toOrange(level, q.c), [px, py] = P(c[0], c[2]), deep = q.kind === 'deep', r = mini ? (deep ? 5 : 3.5) : (deep ? 15 : 10);
    g.fillStyle = TEAM_COLOR[team]; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    if (!mini) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#04121f'; g.font = uiFont(deep ? 20 : 15, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(deep ? '3' : '1', px, py + 1); }
  }
  if (!mini) {
    const [sx, sy] = P(level.sight[0], level.sight[2]);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(sx, sy, 14, 0, Math.PI * 2); g.stroke();
    g.font = uiFont(20, 900); g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = TEAM_COLOR.blue; g.fillText('BLUE END', X + 8, Y + 14);
    g.fillStyle = TEAM_COLOR.orange; g.textAlign = 'right'; g.fillText('ORANGE END', X + w - 8, Y + 14);
    if (level.bin) { const [bx, by] = P(level.bin.c[0], level.bin.c[2]); g.strokeStyle = RED; g.lineWidth = 3; g.setLineDash([6, 5]); g.strokeRect(bx - level.bin.s[2] * s / 2, by - level.bin.s[0] * s / 2, level.bin.s[2] * s, level.bin.s[0] * s); g.setLineDash([]); }
  }
}

// ------------------------------------------------------------------ start menu
const MENU5_W = 2.0, MENU5_H = 1.3;
const SHORT_NAME = { meridian: 'MERIDIAN', docks: 'NEON DOCKS', foundry: 'FOUNDRY', backrooms: 'BACKROOMS', vault: 'MIRROR VAULT', chasm: 'ENDLESS CHASM', gardens: 'SKY GARDENS', carousel: 'CAROUSEL' };
function levelCard(g, panel, b, level, picked, pool) {
  panel.button(b);
  g.fillStyle = picked ? 'rgba(102,255,255,0.2)' : 'rgba(255,255,255,0.06)'; rrect(g, b.x, b.y, b.w, b.h, 22); g.fill();
  const a = { x: b.x + 10, y: b.y + 10, w: b.w - 20, h: b.h - 66 };
  g.save(); rrect(g, a.x, a.y, a.w, a.h, 16); g.clip();
  if (level) {
    const th = level.theme, bg = g.createLinearGradient(0, a.y, 0, a.y + a.h); bg.addColorStop(0, '#05070f'); bg.addColorStop(1, hexA(th.aurora[0], 0.4));
    g.fillStyle = bg; g.fillRect(a.x, a.y, a.w, a.h);
    paintLevelMap(g, a.x + 8, a.y + 8, a.w - 16, a.h - 16, level, { mini: true });
    if (level.loop) { g.fillStyle = '#ffffff'; g.font = uiFont(34, 900); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText('∞', a.x + a.w - 12, a.y + 24); }
  } else {
    pool.forEach((l, i) => { g.fillStyle = hexA(l.theme.aurora[0], 0.55); g.fillRect(a.x + i * a.w / pool.length, a.y, a.w / pool.length + 1, a.h); });
    g.fillStyle = 'rgba(5,7,15,0.55)'; g.fillRect(a.x, a.y, a.w, a.h);
    g.fillStyle = INK; g.font = uiFont(90, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', a.x + a.w / 2, a.y + a.h / 2 + 4);
  }
  g.restore();
  if (picked) { g.strokeStyle = GOLD; g.lineWidth = 5; rrect(g, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 20); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = picked ? GOLD : INK;
  const name = level ? SHORT_NAME[level.id] || level.name : 'SHUFFLE'; fitFont(g, name, b.w - 24, 30, 900); g.fillText(name, b.x + b.w / 2, b.y + b.h - 30);
}
function paintMenu5(g, W, H, panel, m) {
  cardBg(g, W, H);
  const P = 48, mode = MODES5.find(x => x.id === m.mode) || MODES5[0], other = MODES5.find(x => x.id !== mode.id);
  g.textBaseline = 'middle';
  if (m.result) {
    g.textAlign = 'left'; g.font = uiFont(36, 900); g.fillStyle = DIM; g.fillText('FULL TIME', P, 52);
    g.font = uiFont(96, 900); textShadow(g, 14);
    g.fillStyle = TEAM_COLOR.blue; g.fillText(String(m.result.blue), P, 126);
    const wb = g.measureText(String(m.result.blue)).width;
    g.fillStyle = DIM; g.fillText(':', P + wb + 20, 122);
    g.fillStyle = TEAM_COLOR.orange; g.fillText(String(m.result.orange), P + wb + 64, 126); noShadow(g);
    const wo = g.measureText(String(m.result.orange)).width, tx = P + wb + wo + 100;
    g.fillStyle = INK; g.font = uiFont(22, 700); let yy = 100; for (const l of wrapLines(g, m.result.line1, W - P - 500 - tx).slice(0, 3)) { g.fillText(l, tx, yy); yy += 30; }
  } else {
    g.textAlign = 'left'; g.fillStyle = INK; g.font = uiFont(78, 900); textShadow(g, 16); g.fillText('SURGE LEAGUE', P, 72); noShadow(g);
    g.fillStyle = CYAN; g.font = uiFont(28, 800); g.fillText(`${mode.name}  ·  8 vs 8  ·  ZERO GRAVITY`, P + 4, 130);
    g.fillStyle = DIM; g.font = uiFont(22, 600); g.fillText(mode.line, P + 4, 166);
  }
  // player card
  const pc = { x: W - P - 470, y: 26, w: 470, h: 150 };
  g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, pc.x, pc.y, pc.w, pc.h, 22); g.fill();
  g.textAlign = 'center'; g.fillStyle = m.licensed ? GOLD : INK; fitFont(g, m.profile.name, pc.w - 170, 34, 900); g.fillText(m.profile.name, pc.x + pc.w / 2, pc.y + 42);
  g.fillStyle = DIM; fitFont(g, m.profile.sub, pc.w - 40, 21, 700); g.fillText(m.profile.sub, pc.x + pc.w / 2, pc.y + 88);
  g.fillStyle = m.licensed ? GOLD : '#5d7088'; g.font = uiFont(19, 900); g.fillText(m.licensed ? '★ LICENSED PILOT' : 'NO PILOT LICENSE YET', pc.x + pc.w / 2, pc.y + 124);
  tile(g, panel, { id: 'player-prev', x: pc.x + 10, y: pc.y + 12, w: 60, h: 60, row: -1, col: 0 }, '#7a8aa0', '‹');
  tile(g, panel, { id: 'player-next', x: pc.x + pc.w - 70, y: pc.y + 12, w: 60, h: 60, row: -1, col: 1 }, '#7a8aa0', '›');
  // big choices: play, which game, training
  const y0 = 196, gap = 22, inner = W - P * 2 - gap * 2, wPlay = inner * 0.42, wMode = inner * 0.27, wTrain = inner - wPlay - wMode;
  tile(g, panel, { id: 'play', x: P, y: y0, w: wPlay, h: 152, row: 0, col: 0 }, CYAN, m.result ? 'PLAY AGAIN' : 'PLAY MATCH', `${m.length}  ·  you fly for BLUE`, true);
  tile(g, panel, { id: 'mode', x: P + wPlay + gap, y: y0, w: wMode, h: 152, row: 0, col: 1 }, '#b48cff', `GAME: ${mode.name}`, `switch to ${other.name}`, true);
  tile(g, panel, { id: 'train', x: P + wPlay + wMode + gap * 2, y: y0, w: wTrain, h: 152, row: 0, col: 2 }, GOLD, m.licensed ? 'TRAINING' : 'EARN YOUR LICENSE', m.licensed ? 'fly it again any time' : 'every control · 3 minutes · gold board', true);
  // levels: a row of four cards that slides (arrows at the ends, or keep pushing the stick sideways)
  const pool = LEVELS5.filter(l => l.mode === m.mode), items = [...pool, null], show = Math.min(4, items.length), scroll = Math.max(0, Math.min(items.length - show, m.scroll || 0));
  const y1 = y0 + 172, aw = 64, lg = 16, rowW = W - P * 2 - (aw + lg) * 2, cw = (rowW - lg * 3) / 4, x0 = P + aw + lg + (rowW - (show * cw + (show - 1) * lg)) / 2, more = items.length > show;
  if (more) tile(g, panel, { id: 'scroll-l', x: P, y: y1 + 60, w: aw, h: 180, row: 1, col: 0 }, scroll > 0 ? CYAN : '#3a4658', '‹');
  for (let i = 0; i < show; i++) { const l = items[scroll + i]; levelCard(g, panel, { id: 'level', value: l ? l.id : 'shuffle', x: x0 + i * (cw + lg), y: y1, w: cw, h: 300, row: 1, col: i + 1 }, l, m.levelPick === (l ? l.id : 'shuffle'), pool); }
  if (more) tile(g, panel, { id: 'scroll-r', x: W - P - aw, y: y1 + 60, w: aw, h: 180, row: 1, col: 5 }, scroll < items.length - show ? CYAN : '#3a4658', '›');
  // which part of the row you are looking at
  if (more) for (let i = 0; i < items.length; i++) { g.fillStyle = i >= scroll && i < scroll + show ? CYAN : 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(W / 2 + (i - (items.length - 1) / 2) * 22, y1 + 314, 5, 0, 7); g.fill(); }
  const y2 = y1 + 332, w4 = (W - P * 2 - gap * 3) / 4;
  tile(g, panel, { id: 'help', x: P, y: y2, w: w4, h: 80, row: 2, col: 0 }, '#7a8aa0', 'HOW TO PLAY');
  tile(g, panel, { id: 'bots', x: P + (w4 + gap), y: y2, w: w4, h: 80, row: 2, col: 1 }, '#7a8aa0', `BOTS: ${m.level}`);
  tile(g, panel, { id: 'length', x: P + (w4 + gap) * 2, y: y2, w: w4, h: 80, row: 2, col: 2 }, '#7a8aa0', m.length);
  tile(g, panel, { id: 'fights', x: P + (w4 + gap) * 3, y: y2, w: w4, h: 80, row: 2, col: 3 }, m.fights ? RED : '#7a8aa0', `FIGHTS: ${m.fights ? 'ON' : 'OFF'}`);
  const y3 = y2 + 94, w3 = (W - P * 2 - gap * 2) / 3;
  tile(g, panel, { id: 'player-new', x: P, y: y3, w: w3, h: 72, row: 3, col: 0 }, '#7a8aa0', 'NEW PLAYER');
  tile(g, panel, { id: 'version', x: P + w3 + gap, y: y3, w: w3, h: 72, row: 3, col: 1 }, '#7a8aa0', m.versionLabel);
  tile(g, panel, { id: 'home', x: P + (w3 + gap) * 2, y: y3, w: w3, h: 72, row: 3, col: 2 }, '#c0605a', 'EXIT');
  // hint strip
  const hy = y3 + 86;
  g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, P, hy, W - P * 2, 60, 20); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#d6e6f5'; const hint = panel.hint || 'Point at anything to learn about it.';
  fitFont(g, hint, W - P * 2 - 40, 25, 600); g.fillText(hint, W / 2, hy + 31);
  g.fillStyle = DIM; g.font = uiFont(20, 600);
  g.fillText(m.inVR ? 'Point with either controller and pull the trigger (or left stick and A).' : 'Click, or arrow keys and Enter.', W / 2, H - 20);
}

// ------------------------------------------------------------------ ZONE CONTROL: the five rings and both scores, low in your view
function paintZones(g, W, H, panel, m) {
  g.fillStyle = 'rgba(6,12,24,0.74)'; rrect(g, 0, 0, W, H, H / 2); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = uiFont(48, 900); g.fillStyle = TEAM_COLOR.blue; g.fillText(String(m.blue), 74, H / 2 + 2); g.fillStyle = TEAM_COLOR.orange; g.fillText(String(m.orange), W - 74, H / 2 + 2);
  const n = m.zones.length, gap = (W - 300) / n;
  m.zones.forEach((z, i) => {
    const x = 150 + gap * (i + 0.5), y = H / 2, r = 32;
    g.fillStyle = z.own ? TEAM_COLOR[z.own] : 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    // the bar: an arc growing round the ring toward whoever is taking it
    if (Math.abs(z.cap) > 0.03 && Math.abs(z.cap) < 1) { g.strokeStyle = TEAM_COLOR[z.cap > 0 ? 'blue' : 'orange']; g.lineWidth = 9; g.beginPath(); g.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.abs(z.cap) * Math.PI * 2); g.stroke(); }
    if (z.me) { g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r + 17, 0, 7); g.stroke(); }
    g.fillStyle = z.own ? '#04121f' : INK; g.font = uiFont(36, 900); g.fillText(z.id, x, y + 2);
    if (z.fight) { g.fillStyle = GOLD; g.font = uiFont(30, 900); g.fillText('!', x + r + 6, y - r + 6); }
  });
}

// ------------------------------------------------------------------ how to play (five short pages)
const BRIEF5_W = 2.0, BRIEF5_H = 1.3, BRIEF5_PAGES = 5;
function paintBriefing5(g, W, H, panel, m) {
  cardBg(g, W, H);
  const ctl = m.mode === 'control';
  const P = 52, titles = [ctl ? 'ZONE CONTROL IN TEN SECONDS' : 'THE GAME IN TEN SECONDS', `THIS LEVEL: ${m.level.name}`, 'YOUR CONTROLS', 'RUCKS: SQUEEZE TO WIN', ctl ? 'FIGHTS AND AURORA' : 'FIGHTS, FOULS AND AURORA'];
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = CYAN; g.font = uiFont(24, 800); g.fillText(`HOW TO PLAY  ·  ${m.page + 1} of ${BRIEF5_PAGES}  ·  one minute to read`, P, 46);
  for (let i = 0; i < BRIEF5_PAGES; i++) { g.fillStyle = i <= m.page ? CYAN : 'rgba(255,255,255,0.15)'; rrect(g, W - P - (BRIEF5_PAGES - i) * 54, 36, 44, 12, 6); g.fill(); }
  g.fillStyle = INK; fitFont(g, titles[m.page], W - P * 2, 58, 900); textShadow(g, 12); g.fillText(titles[m.page], P, 104); noShadow(g);
  const body = (lines, x, y, w, size = 30, lh = 1.4) => {
    let yy = y;
    for (const [head, text] of lines) {
      if (head) { g.fillStyle = GOLD; g.font = uiFont(size, 900); g.fillText(head, x, yy); yy += size * 1.22; }
      g.fillStyle = INK; g.font = uiFont(size * 0.84, 600);
      for (const l of wrapLines(g, text, w)) { g.fillText(l, x, yy); yy += size * 0.84 * lh; }
      yy += size * 0.42;
    }
    return yy;
  };
  const frame = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,0.04)'; rrect(g, x, y, w, h, 26); g.fill(); };
  if (m.page === 0) {
    body(ctl ? [[null, '8 against 8, no gravity. You fly for BLUE with 7 teammates. There are no goals in this game.'],
          ['HOLD THE RINGS', `Five rings, A to E. Fly into one and stay: while BLUE has more riders inside than ORANGE, it turns blue. Each ring you hold pays points every second. First to ${m.target} wins.`],
          ['THE CORE COUNTS AS 3', 'Whoever carries the CORE (the glowing ball) counts as three riders in a ring. Rip it off them, or fly into them for a ruck.'],
          ['CLEAR THEM OUT', 'Dash (B) into a rival to knock them out of a ring. Knock one out in a fight and they sit 15 seconds in the box.']]
         : [[null, '8 against 8, no gravity. You fly for BLUE with 7 teammates.'],
          ['SCORE', `Get the CORE (the glowing ball) into ORANGE's goals. First team to ${m.target} wins. If the clock runs out first, most points wins.`],
          ['NOBODY OWNS IT', 'Rip it out of a rival\'s hands, crash into them for it, or pick off a pass.'],
          ['STAY TOGETHER', 'Like rugby: teammates near you make you stronger in every tussle, and they are your pass when you get swarmed.']],
         P, 176, W * 0.5, ctl ? 28 : 30);
    const ix = W * 0.6, iw = W - ix - P, iy = 170, ih = 600;
    frame(ix, iy, iw, ih);
    for (let i = 0; i < 8; i++) {
      const row = i % 4, col = Math.floor(i / 4);
      for (const [team, x] of [['blue', ix + 70 + col * 72], ['orange', ix + iw - 70 - col * 72]]) {
        g.fillStyle = TEAM_COLOR[team]; g.beginPath(); g.arc(x, iy + 120 + row * 118, 27, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#04121f'; g.font = uiFont(21, 900); g.textAlign = 'center'; g.fillText(team === 'blue' && i === 0 ? 'YOU' : String(i + 1), x, iy + 121 + row * 118); g.textAlign = 'left';
      }
    }
    const bx = ix + iw / 2, by = iy + ih / 2;
    const gr = g.createRadialGradient(bx, by, 0, bx, by, 76); gr.addColorStop(0, 'rgba(160,255,255,0.9)'); gr.addColorStop(1, 'rgba(102,255,255,0)');
    g.fillStyle = gr; g.fillRect(bx - 76, by - 76, 152, 152);
    g.fillStyle = '#e9fbff'; g.beginPath(); g.arc(bx, by, 23, 0, Math.PI * 2); g.fill();
    g.fillStyle = CYAN; g.font = uiFont(26, 900); g.textAlign = 'center'; g.fillText('THE CORE', bx, by + 60);
    g.fillStyle = GOLD; g.font = uiFont(40, 900); g.fillText(`FIRST TO ${m.target}`, bx, iy + ih - 44); g.textAlign = 'left';
  } else if (m.page === 1) {
    const mw = W * 0.56;
    frame(P, 150, mw, 640);
    paintLevelMap(g, P + 14, 164, mw - 28, 612, m.level);
    g.fillStyle = CYAN; g.font = uiFont(21, 700); g.textAlign = 'center'; g.fillText(ctl ? 'lettered circles: the RINGS  ·  dashed circle: where the platforms travel  ·  red box: PENALTY BOX' : 'dashed lines: BLUE\'s ways to attack  ·  double ring: the SIGHT RING  ·  red box: PENALTY BOX', P + mw / 2, 812); g.textAlign = 'left';
    const x = P + mw + 36, w = W - x - P;
    const rows = ctl ? [['1', 'EACH RING', 'a point every 2 seconds while you hold it'], ['x2', 'ALL FIVE', 'hold every ring and your points double'],
                        ['3', 'THE CORE', 'its carrier counts as 3 riders in a ring'], ['↕', 'MOVING RINGS', 'B and D ride platforms that never stop'], ['A', 'HOME RING', 'yours from the start: don\'t leave it empty']]
      : [['1', 'LOBBY HOLE', 'the round holes in their end wall'], ['3', 'DEEP GOAL', 'the long way round, behind or above their end'],
                  ['+1', 'BANK SHOT', 'off any wall on the way in'], ['+1', 'LONG SHOT', 'from 28 m or further'], ['2', 'PENALTY', 'a free shot after a late hit']];
    let y = 176;
    for (const [pts, name, text] of rows) {
      g.fillStyle = GOLD; g.font = uiFont(42, 900); g.textAlign = 'center'; g.fillText(pts, x + 40, y + 18); g.textAlign = 'left';
      g.fillStyle = INK; g.font = uiFont(28, 900); g.fillText(name, x + 96, y + 2);
      g.fillStyle = DIM; g.font = uiFont(21, 600); let yy = y + 36; for (const l of wrapLines(g, text, w - 96)) { g.fillText(l, x + 96, yy); yy += 27; }
      y = yy + 14;
    }
    g.fillStyle = '#9ff6ff'; g.font = uiFont(23, 800); let yy = y + 8;
    const note = ctl ? (m.level.rooms.length ? 'The windows are OPEN: fly out and back in anywhere. Platforms are solid: use them as cover.' : 'No walls at all. Rocks and platforms are solid: use them as cover. The lights mark the edge of the field.')
      : m.level.loop ? 'No floor and no ceiling: fly up or down as far as you like, it never ends. The two shimmering walls are false: fly through them.'
      : m.level.exterior === false ? 'Solid walls here, no windows. Hover in the SIGHT RING to see every rider through them.'
      : 'The windows are OPEN: fly out into space and back in anywhere. Glowing lattice walls are solid, but you see through them.';
    for (const l of wrapLines(g, note, w)) { g.fillText(l, x, yy); yy += 30; }
    g.fillStyle = INK; g.font = uiFont(21, 600); yy += 10; for (const l of wrapLines(g, m.level.blurb, w)) { g.fillText(l, x, yy); yy += 27; }
  } else if (m.page === 2) {
    if (m.inVR) {
      const L = paintController(g, 560, 300, 290, 'left'), R = paintController(g, W - 560, 300, 290, 'right');
      const lx = 360, rx = W - 360, ys = [200, 310, 420, 530, 640];
      callout(g, L.trigger, [lx, ys[0]], 'TRIGGER  PULL · THROW', 'works with either hand', 'right');
      callout(g, L.y, [lx, ys[1]], 'Y  PAUSE', 'settings, how to play, exit', 'right');
      callout(g, L.stick, [lx, ys[2]], 'STICK  FLY · CLICK = BOOST', 'you go where your hands point', 'right');
      callout(g, L.x, [lx, ys[3]], 'X  CALL FOR A PASS', 'your teammate throws it to you', 'right');
      callout(g, L.grip, [lx, ys[4]], 'GRIP  SNATCH · HOLD ON', 'squeeze while carrying: harder to rob', 'right');
      callout(g, R.trigger, [rx, ys[0]], 'TAP = SOFT · HOLD = HARD', 'let go at a teammate: a pass', 'left');
      callout(g, R.b, [rx, ys[1]], 'B  DASH', 'the way the left stick points', 'left');
      callout(g, R.stick, [rx, ys[2]], 'STICK  SNAP TURN · UP/DOWN', 'hold it DOWN: rear-view mirror', 'left');
      callout(g, R.a, [rx, ys[3]], 'A  TURN AROUND', 'and select in menus', 'left');
      callout(g, R.grip, [rx, ys[4]], 'GRIP  SNATCH · HOLD ON', 'hold it and swing: a punch', 'left');
      g.fillStyle = DIM; g.font = uiFont(23, 600); g.textAlign = 'center';
      g.fillText('You always stay upright. Look far to one side and you drift that way (turn it off in the pause menu).', W / 2, 800);
    } else {
      const keys = [['WASD', 'fly where you look'], ['E / Q', 'up / down'], ['SHIFT', 'boost (hold)'], ['R', 'dash'], ['HOLD G', 'pull the CORE in'], ['SPACE', 'tap: soft throw · hold: hard'],
                    ['F', 'pass to an open teammate'], ['C', 'call for a pass'], ['V', 'mirror (hold)'], ['X', 'punch'], ['L', 'turn around'], ['P / ESC', 'pause · TAB: score']];
      keys.forEach(([k, v], i) => {
        const x = P + (i % 2) * (W / 2 - 20), y = 190 + Math.floor(i / 2) * 100;
        g.fillStyle = 'rgba(102,255,255,0.15)'; rrect(g, x, y - 36, 210, 72, 16); g.fill();
        g.fillStyle = CYAN; g.font = uiFont(28, 900); g.textAlign = 'center'; g.fillText(k, x + 105, y);
        g.fillStyle = INK; g.font = uiFont(28, 700); g.textAlign = 'left'; g.fillText(v, x + 236, y);
      });
    }
  } else if (m.page === 3) {
    body([['RUCK', 'Fly into the rival carrying the CORE. You lock together and wrestle for it.'],
          ['SQUEEZE', 'Every trigger and grip you hold down adds strength. One finger is a weak hold. All four is iron.'],
          ['STRIP', 'They have it? Flutter your triggers while you squeeze and you rip it loose faster.'],
          ['BIND ON', 'Teammates within 6 m get pulled in and add their strength. Three beat two. To steal from a ruck you have to join it and out-pull it.'],
          ['DASH IN, OFFLOAD OUT', 'Hit with a dash (B) and the ruck starts in your favor. Carrying and losing? B throws it to a free teammate.']],
         P, 170, W * 0.56, 28);
    const ix = W * 0.64, iw = W - ix - P, iy = 170, ih = 600; frame(ix, iy, iw, ih);
    g.textAlign = 'center'; g.fillStyle = INK; g.font = uiFont(26, 900); g.fillText('FINGERS DOWN = STRENGTH', ix + iw / 2, iy + 44);
    const names = ['none', '1', '2', '3', 'all 4'];
    names.forEach((nm, i) => {
      const y = iy + 100 + i * 78, bw = (iw - 220) * (0.2 + i * 0.2);
      for (let k = 0; k < 4; k++) { g.fillStyle = k < i ? CYAN : 'rgba(255,255,255,0.14)'; g.beginPath(); g.arc(ix + 40 + k * 30, y, 11, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = i === 4 ? GOLD : hexA(CYAN, 0.35 + i * 0.15); rrect(g, ix + 170, y - 14, bw, 28, 10); g.fill();
    });
    const ty = iy + 500;
    g.fillStyle = hexA(TEAM_COLOR.orange, 0.6); rrect(g, ix + 40, ty, (iw - 80) / 2, 34, 12); g.fill();
    g.fillStyle = hexA(TEAM_COLOR.blue, 0.6); rrect(g, ix + iw / 2, ty, (iw - 80) / 2, 34, 12); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(ix + iw / 2 + 70, ty - 10, 12, 54);
    g.fillStyle = INK; g.font = uiFont(22, 800); g.fillText('pull the marker to your side', ix + iw / 2, ty + 66);
    g.textAlign = 'left';
  } else {
    body([['FIGHT', 'Make a fist (hold a GRIP) and swing it into a rival who isn\'t carrying. You both have a health bar: harder swings and helmet shots hurt more. Knock them out.'],
          ['BLOCK, DODGE, COUNTER', 'Red flash: a jab. Glove in front of your face, or move your head. Gold flash: a heavy swing, only a dodge saves you. Hit when their guard drops, or right after you block or dodge.'],
          ['PENALTY BOX', ctl ? 'The loser sits 15 seconds in the box, watching: one rider less in the rings.' : 'The loser sits 15 seconds in the box, watching. Start a fight far from the CORE and you BOTH sit.'],
          ctl ? ['SHOVE', 'There are no late hits in ZONE CONTROL: crashing into rivals to clear a ring is the game.'] : ['LATE HIT', 'Crash hard into a rival who is nowhere near the CORE and their team gets a free shot worth 2.'],
          ['AURORA SHARDS', 'Ribbons of light drift through the level. Fly through one and your whole team is faster and stronger for 7 seconds.'],
          ['ALWAYS VISIBLE', 'The CORE glows through every wall. Hold the right stick down for your mirror.']],
         P, 166, W * 0.56, 25, 1.32);
    const ix = W * 0.64, iw = W - ix - P, iy = 170, ih = 600; frame(ix, iy, iw, ih);
    // the box above the field
    const bx = ix + iw / 2, top = iy + 70;
    g.strokeStyle = RED; g.lineWidth = 5; g.setLineDash([10, 8]); g.strokeRect(bx - 110, top, 220, 90); g.setLineDash([]);
    g.fillStyle = RED; g.font = uiFont(22, 900); g.textAlign = 'center'; g.fillText('PENALTY BOX · 15 s', bx, top + 45);
    g.fillStyle = 'rgba(200,220,245,0.22)'; rrect(g, ix + 50, top + 190, iw - 100, 150, 16); g.fill();
    g.fillStyle = DIM; g.font = uiFont(20, 700); g.fillText('the field, far below', bx, top + 320);
    for (const [dx, col] of [[-40, TEAM_COLOR.blue], [40, TEAM_COLOR.orange]]) { g.fillStyle = col; g.beginPath(); g.arc(bx + dx, top + 240, 22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffffff'; g.font = uiFont(40, 900); g.fillText('✦', bx, top + 240);
    g.strokeStyle = RED; g.lineWidth = 4; g.beginPath(); g.moveTo(bx + 40, top + 214); g.quadraticCurveTo(bx + 120, top + 150, bx + 60, top + 96); g.stroke();
    g.fillStyle = INK; g.font = uiFont(21, 700);
    let yy = top + 400; for (const l of ['Not sure about fights?', 'Turn them off on the menu:', 'FIGHTS: OFF']) { g.fillStyle = l.includes('OFF') ? GOLD : INK; g.fillText(l, bx, yy); yy += 32; }
    g.textAlign = 'left';
  }
  // buttons
  const by = H - 150, bw = 320, bh = 92, last = m.page === BRIEF5_PAGES - 1;
  const btns = [['back', 'BACK', '#7a8aa0', m.page > 0]];
  if (last) btns.push(['train', 'TRAINING', GOLD, true], ['play', 'PLAY MATCH', CYAN, true]);
  btns.push(['next', last ? 'GOT IT' : 'NEXT', CYAN, true]);
  const shown = btns.filter(b => b[3]), total = shown.length * bw + (shown.length - 1) * 28;
  shown.forEach(([id, label, color], i) => tile(g, panel, { id, x: W / 2 - total / 2 + i * (bw + 28), y: by, w: bw, h: bh, row: 9, col: i }, color, label, null, id === 'next'));
  g.fillStyle = DIM; g.font = uiFont(21, 600); g.textAlign = 'center';
  g.fillText(m.inVR ? 'Point and pull the trigger, or left stick and A. Y closes.  Finish TRAINING for your pilot license and a gold board.' : 'Click, or arrow keys and Enter. P closes.', W / 2, H - 28);
}

// ------------------------------------------------------------------ pause
const PAUSE5_W = 1.15, PAUSE5_H = 1.6;
function paintPause5(g, W, H, panel, m) {
  cardBg(g, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = INK; g.font = uiFont(60, 900); textShadow(g, 14); g.fillText('PAUSED', W / 2, 62); noShadow(g);
  g.font = uiFont(38, 900);
  if (m.training) { g.fillStyle = GOLD; g.fillText('TRAINING', W / 2, 128); }
  else { g.fillStyle = TEAM_COLOR.blue; g.textAlign = 'right'; g.fillText(`BLUE ${m.blue}`, W / 2 - 24, 128); g.fillStyle = DIM; g.textAlign = 'center'; g.fillText(':', W / 2, 126);
         g.fillStyle = TEAM_COLOR.orange; g.textAlign = 'left'; g.fillText(`${m.orange} ORANGE`, W / 2 + 24, 128); }
  g.textAlign = 'center'; g.fillStyle = DIM; fitFont(g, m.where, W - 100, 22, 700); g.fillText(m.where, W / 2, 172);
  const items = [['resume', 'RESUME', CYAN], m.training ? ['skip', 'SKIP THIS STEP', GOLD] : ['help', 'HOW TO PLAY', '#7a8aa0'], ['reach', m.reach, '#7a8aa0'], ['flight', m.flight, '#7a8aa0'], ['turn', m.turn, '#7a8aa0'],
                 ['restart', m.training ? 'RESTART TRAINING' : 'RESTART MATCH', '#7a8aa0'], ['menu', 'MAIN MENU', '#7a8aa0'], ['version', m.versionLabel, '#7a8aa0'], ['home', m.exitLabel, '#c0605a']];
  items.forEach(([id, label, color], i) => tile(g, panel, { id, x: 60, y: 204 + i * 110, w: W - 120, h: 94, row: i, col: 0 }, color, label, null, i === 0));
  g.fillStyle = DIM; g.font = uiFont(22, 600); g.textAlign = 'center';
  g.fillText(m.inVR ? 'Point and pull the trigger, or left stick and A.  Y resumes.' : 'Click, or arrow keys and Enter.  P or Esc resumes.', W / 2, H - 36);
}

// ------------------------------------------------------------------ ruck and fight meter (in front of your chest)
function paintRuck(g, W, H, panel, c) {
  const edge = c.kind === 'duel' ? RED : GOLD;
  g.fillStyle = 'rgba(6,12,24,0.86)'; rrect(g, 0, 0, W, H, 28); g.fill();
  g.strokeStyle = edge; g.lineWidth = 5; rrect(g, 3, 3, W - 6, H - 6, 26); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (c.kind === 'ruck') {
    g.fillStyle = GOLD; g.font = uiFont(40, 900); g.fillText(`RUCK   ${c.mine} v ${c.theirs}`, W / 2, 36);
    const bx = 56, bw = W - 112, by = 66, bh = 38, mid = bx + bw / 2, k = Math.max(-1, Math.min(1, c.you));
    g.fillStyle = hexA(TEAM_COLOR.orange, 0.6); rrect(g, bx, by, bw / 2, bh, 14); g.fill();
    g.fillStyle = hexA(TEAM_COLOR.blue, 0.6); rrect(g, mid, by, bw / 2, bh, 14); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(mid + k * bw / 2 - 6, by - 9, 12, bh + 18);
    g.font = uiFont(20, 800); g.fillStyle = INK; g.fillText('THEM', bx + 46, by + bh / 2); g.fillText('YOU', bx + bw - 38, by + bh / 2);
    // how many fingers you are squeezing right now
    for (let i = 0; i < 4; i++) { g.fillStyle = i < c.squeeze ? CYAN : 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(W / 2 - 54 + i * 36, 136, 12, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = INK; g.font = uiFont(23, 700);
    const how = c.inVR ? (c.strip ? 'SQUEEZE ALL 4 + FLUTTER THE TRIGGERS' : 'SQUEEZE ALL 4 TO HOLD ON') : (c.strip ? 'HOLD G + SPACE, TAP THEM FAST' : 'HOLD G + SPACE');
    const line = c.carrier ? `${how}  ·  ${c.inVR ? 'B' : 'R'} OFFLOADS` : how;
    fitFont(g, line, W - 40, 23, 700); g.fillText(line, W / 2, 180);
  } else {
    // what to do this instant, in one word, then both health bars
    const cue = { jab: ['BLOCK!', '#ffffff'], heavy: ['DODGE!', GOLD], feint: ['BLOCK!', '#ffffff'], counter: ['COUNTER NOW!', CYAN], guard: ['GUARD UP: WAIT', DIM], open: ['HIT THEM!', RED] }[c.cue] || ['FIGHT', RED];
    g.fillStyle = cue[1]; g.font = uiFont(46, 900); g.fillText(cue[0], W / 2, 40);
    const bw = W / 2 - 110, by = 78, bh = 34;
    for (const [x, hp, col, dir] of [[40, c.you, CYAN, 1], [W - 40 - bw, c.them, TEAM_COLOR.orange, -1]]) {
      g.fillStyle = 'rgba(255,255,255,0.14)'; rrect(g, x, by, bw, bh, 12); g.fill();
      const w = Math.max(0, Math.min(1, hp / DUEL_HP)) * bw;
      if (w > 4) { g.fillStyle = hp < DUEL_HP * 0.3 ? RED : col; rrect(g, dir > 0 ? x : x + bw - w, by, w, bh, 12); g.fill(); }
    }
    g.fillStyle = INK; g.font = uiFont(24, 900); g.fillText('YOU', 40 + bw / 2, by + bh / 2 + 1); g.fillText('THEM', W - 40 - bw / 2, by + bh / 2 + 1);
    g.fillStyle = DIM; g.font = uiFont(26, 900); g.fillText(String(Math.max(0, c.secs)), W / 2, by + bh / 2 + 1);
    const line = c.off ? 'FAR FROM THE CORE: you BOTH go to the box' : c.inVR ? 'RED: BLOCK OR DODGE · GOLD: DODGE · HIT WHEN THE GUARD DROPS' : 'X PUNCHES · HOLD G TO BLOCK · A/D DODGES';
    g.fillStyle = c.off ? GOLD : INK; fitFont(g, line, W - 40, 23, 700); g.fillText(line, W / 2, 160);
  }
}

// ------------------------------------------------------------------ pop-up messages (main line, smaller second line, optional controller picture)
function paintToast5(g, W, H, panel, t) {
  if (!t.text) return;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const pic = t.hint ? 230 : 0, maxText = W - 120 - pic;
  g.font = uiFont(26, 700);
  const subs = t.sub ? wrapLines(g, t.sub, maxText).slice(0, 2) : [];
  let size, lh, lines, textH;
  for (size of (t.big ? [62, 52, 44] : [38, 34, 30, 27, 24])) {
    lh = Math.round(size * (t.big ? 1.16 : 1.26)); g.font = uiFont(size, t.big ? 900 : 700);
    lines = wrapLines(g, t.text, maxText); textH = lines.length * lh + subs.length * 36 + (subs.length ? 8 : 0);
    if (textH + 44 <= H - 4) break;
  }
  let tw = 0; for (const l of lines) tw = Math.max(tw, g.measureText(l).width);
  g.font = uiFont(26, 700); for (const l of subs) tw = Math.max(tw, g.measureText(l).width);
  const boxH = Math.min(H - 4, Math.max(textH + 40, pic ? H - 8 : 0)), y0 = (H - boxH) / 2, boxW = Math.min(W - 8, tw + 90 + pic), x0 = (W - boxW) / 2;
  g.fillStyle = 'rgba(6,12,24,0.8)'; rrect(g, x0, y0, boxW, boxH, 30); g.fill();
  if (t.color) { g.strokeStyle = t.color; g.lineWidth = 5; rrect(g, x0 + 3, y0 + 3, boxW - 6, boxH - 6, 28); g.stroke(); }
  if (pic) {
    const s = (boxH - 56) / 1.5;
    paintController(g, x0 + 30 + pic / 2, y0 + 40 + 0.52 * s, s, t.hint.side, new Set([t.hint.part]));
    g.fillStyle = CYAN; g.font = uiFont(22, 900); g.textAlign = 'center';
    g.fillText(t.hint.side === 'left' ? 'LEFT' : 'RIGHT', x0 + 30 + pic / 2, y0 + 26);
  }
  const cx = x0 + pic + (boxW - pic) / 2; let y = (H - textH) / 2;
  g.font = uiFont(size, t.big ? 900 : 700); g.textAlign = 'center'; g.fillStyle = t.color || '#ffffff'; textShadow(g, 10);
  for (const l of lines) { g.fillText(l, cx, y + lh / 2); y += lh; }
  noShadow(g);
  if (subs.length) { y += 8; g.font = uiFont(26, 700); g.fillStyle = '#d6e6f5'; for (const l of subs) { g.fillText(l, cx, y + 18); y += 36; } }
}
