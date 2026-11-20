// Version 4 screens: start menu, the four-page briefing (the game, the station map, the controllers, contact), the pause menu
// and the clash meter. Same canvas panels and Exo 2 type as version 3 (js/ui.js).
const INK = '#eaf4ff', DIM = '#8fa8c4', CYAN = '#66ffff', GOLD = '#ffd166';
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
  g.fillStyle = strong ? '#04121f' : INK; fitFont(g, title, b.w - 40, sub ? 50 : 36, 900);
  g.fillText(title, b.x + b.w / 2, b.y + b.h / 2 - (sub ? 22 : 0) + 2);
  if (sub) { g.fillStyle = strong ? 'rgba(4,18,31,0.8)' : DIM; fitFont(g, sub, b.w - 40, 26, 700); g.fillText(sub, b.x + b.w / 2, b.y + b.h / 2 + 32); }
}

// ------------------------------------------------------------------ start menu
const MENU4_W = 1.9, MENU4_H = 1.3;
function paintMenu4(g, W, H, panel, m) {
  cardBg(g, W, H);
  const P = 48;
  g.textBaseline = 'middle';
  if (m.result) {
    g.textAlign = 'left'; g.font = uiFont(40, 900); g.fillStyle = DIM; g.fillText('FULL TIME', P, 64);
    g.font = uiFont(96, 900); textShadow(g, 14);
    g.fillStyle = TEAM_COLOR.blue; g.fillText(String(m.result.blue), P, 150);
    const wb = g.measureText(String(m.result.blue)).width;
    g.fillStyle = DIM; g.fillText(':', P + wb + 20, 146);
    g.fillStyle = TEAM_COLOR.orange; g.fillText(String(m.result.orange), P + wb + 64, 150); noShadow(g);
    g.fillStyle = INK; fitFont(g, m.result.line1, W - P * 2 - 520, 24, 700); g.fillText(m.result.line1, P + wb * 2 + 150, 150);
  } else {
    g.textAlign = 'left'; g.fillStyle = INK; g.font = uiFont(84, 900); textShadow(g, 16); g.fillText('SURGE LEAGUE', P, 82); noShadow(g);
    g.fillStyle = CYAN; g.font = uiFont(30, 800); g.fillText('STATION RUGBY  ·  8 vs 8  ·  ZERO GRAVITY', P + 4, 148);
    g.fillStyle = DIM; g.font = uiFont(24, 600); g.fillText('Get the CORE into the other team\'s goals. Pass, steal, clash, score.', P + 4, 190);
  }
  // player card
  const pc = { x: W - P - 470, y: 34, w: 470, h: 150 };
  g.fillStyle = 'rgba(255,255,255,0.06)'; rrect(g, pc.x, pc.y, pc.w, pc.h, 22); g.fill();
  g.textAlign = 'center'; g.fillStyle = INK; fitFont(g, m.profile.name, pc.w - 150, 36, 900); g.fillText(m.profile.name, pc.x + pc.w / 2, pc.y + 50);
  g.fillStyle = DIM; fitFont(g, m.profile.sub, pc.w - 40, 22, 700); g.fillText(m.profile.sub, pc.x + pc.w / 2, pc.y + 104);
  tile(g, panel, { id: 'player-prev', x: pc.x + 10, y: pc.y + 18, w: 64, h: 64, row: 2, col: 0 }, '#7a8aa0', '‹');
  tile(g, panel, { id: 'player-next', x: pc.x + pc.w - 74, y: pc.y + 18, w: 64, h: 64, row: 2, col: 2 }, '#7a8aa0', '›');
  // big choices
  const y0 = 240, gap = 28, bw = (W - P * 2 - gap) / 2;
  tile(g, panel, { id: 'play', x: P, y: y0, w: bw, h: 200, row: 0, col: 0 }, CYAN, m.result ? 'PLAY AGAIN' : 'PLAY MATCH', '8 vs 8 · you fly for BLUE', true);
  tile(g, panel, { id: 'train', x: P + bw + gap, y: y0, w: bw, h: 200, row: 0, col: 1 }, GOLD, 'TRAINING', 'every control, step by step (2 min)', true);
  const y1 = y0 + 230, w3 = (W - P * 2 - gap * 2) / 3;
  tile(g, panel, { id: 'help', x: P, y: y1, w: w3, h: 96, row: 1, col: 0 }, '#7a8aa0', 'HOW TO PLAY');
  tile(g, panel, { id: 'bots', x: P + w3 + gap, y: y1, w: w3, h: 96, row: 1, col: 1 }, '#7a8aa0', `BOTS: ${m.level}`);
  tile(g, panel, { id: 'length', x: P + (w3 + gap) * 2, y: y1, w: w3, h: 96, row: 1, col: 2 }, '#7a8aa0', `LENGTH: ${m.length}`);
  const y2 = y1 + 124;
  tile(g, panel, { id: 'player-new', x: P, y: y2, w: w3, h: 96, row: 3, col: 0 }, '#7a8aa0', 'NEW PLAYER');
  tile(g, panel, { id: 'version', x: P + w3 + gap, y: y2, w: w3, h: 96, row: 3, col: 1 }, '#7a8aa0', m.versionLabel);
  tile(g, panel, { id: 'home', x: P + (w3 + gap) * 2, y: y2, w: w3, h: 96, row: 3, col: 2 }, '#c0605a', 'EXIT');
  // hint strip
  const hy = H - 118;
  g.fillStyle = 'rgba(255,255,255,0.05)'; rrect(g, P, hy, W - P * 2, 70, 20); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#d6e6f5'; const hint = panel.hint || 'Point at anything to learn about it.';
  fitFont(g, hint, W - P * 2 - 40, 28, 600); g.fillText(hint, W / 2, hy + 36);
  g.fillStyle = DIM; g.font = uiFont(22, 600);
  g.fillText(m.inVR ? 'Point with either controller and pull the trigger (or left stick and A).' : 'Click, or arrow keys and Enter.', W / 2, H - 26);
}

// ------------------------------------------------------------------ the station map (top view)
// z runs left to right (BLUE's end on the left, ORANGE's on the right), x runs up and down.
function paintStationMap(g, X, Y, w, h, opts = {}) {
  const zr = 96, xr = 70, s = Math.min(w / (zr * 2), h / (xr * 2)), cx = X + w / 2, cy = Y + h / 2;
  const P = (x, z) => [cx - z * s, cy - x * s];
  const fillRect = (x0, x1, z0, z1, color) => { const [ax, ay] = P(x1, z1), [bx, by] = P(x0, z0); g.fillStyle = color; g.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)); };
  const floor = 'rgba(200,220,245,0.22)', CH = ST.CH;
  fillRect(-ST.LW, ST.LW, -ST.LZ, ST.LZ, floor);
  for (const sx of [1, -1]) {
    fillRect(sx > 0 ? ST.LW : -(ST.SX - CH), sx > 0 ? ST.SX - CH : -ST.LW, -CH, CH, 'rgba(61,255,160,0.28)');
    fillRect(sx * ST.SX - CH, sx * ST.SX + CH, -ST.SIDE_END, ST.SIDE_END, floor);
  }
  for (const sz of [1, -1]) fillRect(-ST.BACK_END, ST.BACK_END, sz * ST.BZ - CH, sz * ST.BZ + CH, floor);
  for (const r of STATION.rings) {
    const [px, py] = P(r.c.x, r.c.z);
    g.strokeStyle = floor; g.lineWidth = (r.ro - r.ri) * s; g.beginPath(); g.arc(px, py, ST.RR * s, 0, Math.PI * 2); g.stroke();
  }
  // loop walls
  g.strokeStyle = GOLD; g.lineWidth = Math.max(3, s * 0.8);
  for (const o of STATION.blockers) {
    const dir = new T.Vector3(1, 0, 0).applyQuaternion(o.q);
    const a = o.c.clone().addScaledVector(dir, o.half.x), b = o.c.clone().addScaledVector(dir, -o.half.x);
    g.beginPath(); g.moveTo(...P(a.x, a.z)); g.lineTo(...P(b.x, b.z)); g.stroke();
  }
  // goals
  for (const goal of STATION.goals) {
    const [px, py] = P(goal.c.x, goal.c.z), col = TEAM_COLOR[goal.team];
    g.fillStyle = col; g.beginPath(); g.arc(px, py, goal.kind === 'deep' ? Math.max(9, s * 2.6) : Math.max(6, s * 1.6), 0, Math.PI * 2); g.fill();
    if (goal.kind === 'deep' || goal.c.x === 0) {
      g.fillStyle = INK; g.font = uiFont(Math.max(18, s * 5), 900); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(goal.kind === 'deep' ? '3' : '1', px + (goal.c.z > 0 ? -1 : 1) * Math.max(24, s * 6), py);
    }
  }
  // sight ring
  const [sxp, syp] = P(0, 0);
  g.strokeStyle = '#e8f4ff'; g.lineWidth = 3; g.beginPath(); g.arc(sxp, syp, Math.max(8, s * 2), 0, Math.PI * 2); g.stroke();
  // BLUE's attack routes (toward ORANGE's end, on the right)
  if (opts.routes !== false) {
    g.lineWidth = Math.max(3, s * 0.7); g.setLineDash([12, 10]); g.strokeStyle = CYAN;
    g.beginPath(); g.moveTo(...P(0, 30)); g.lineTo(...P(0, -38)); g.stroke();
    for (const sx of [1, -1]) {
      g.beginPath(); g.moveTo(...P(sx * 6, 4)); g.lineTo(...P(sx * ST.SX, 0)); g.lineTo(...P(sx * ST.SX, -ST.SIDE_END));
      const ring = STATION.rings.find(r => r.sx === sx && r.sz === -1), [rx, ry] = P(ring.c.x, ring.c.z);
      g.stroke(); g.beginPath();
      // the long way round: from the corridor entry, away from the center line, to the back corridor
      const ang = (x, z) => Math.atan2(P(x, z)[1] - ry, P(x, z)[0] - rx), a0 = ang(sx * ST.SX, -(ST.RZ - ST.RR)), a1 = ang(sx * (ST.SX - ST.RR), -ST.RZ);
      // go round the side that does not cross the loop wall
      const wall = STATION.blockers.find(o => o.ring === ring), wa = ang(wall.c.x, wall.c.z), norm = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const crossesCw = norm(wa - a0) < norm(a1 - a0);
      g.arc(rx, ry, ST.RR * s, a0, a1, crossesCw);
      g.lineTo(...P(0, -ST.BZ)); g.stroke();
    }
    g.setLineDash([]);
  }
  // ends
  g.font = uiFont(Math.max(15, s * 3.2), 900); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = TEAM_COLOR.blue; g.fillText('BLUE END', ...P(-ST.LW + 5, ST.LZ - 16));
  g.fillStyle = TEAM_COLOR.orange; g.fillText('ORANGE END', ...P(-ST.LW + 5, -ST.LZ + 16));
  g.fillStyle = INK; g.font = uiFont(Math.max(14, s * 3), 700); g.fillText('SIGHT RING', sxp, syp + Math.max(22, s * 5));
}

// ------------------------------------------------------------------ how to play (four pages)
const BRIEF_W = 1.9, BRIEF_H = 1.3, BRIEF_PAGES = 4;
function paintBriefing(g, W, H, panel, m) {
  cardBg(g, W, H);
  const P = 52, titles = ['THE GAME', 'THE STATION AND SCORING', 'CONTROLS', 'CONTACT AND PENALTIES'];
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = CYAN; g.font = uiFont(26, 800); g.fillText(`HOW TO PLAY  ·  ${m.page + 1} / ${BRIEF_PAGES}`, P, 52);
  g.fillStyle = INK; g.font = uiFont(60, 900); textShadow(g, 12); g.fillText(titles[m.page], P, 108); noShadow(g);
  const body = (lines, x, y, w, size = 32, lh = 1.45) => {
    let yy = y;
    for (const [head, text] of lines) {
      if (head) { g.fillStyle = GOLD; g.font = uiFont(size, 900); g.fillText(head, x, yy); yy += size * 1.25; }
      g.fillStyle = INK; g.font = uiFont(size * 0.85, 600);
      for (const l of wrapLines(g, text, w)) { g.fillText(l, x, yy); yy += size * 0.85 * lh; }
      yy += size * 0.45;
    }
    return yy;
  };
  if (m.page === 0) {
    body([[null, '8 vs 8 in zero gravity aboard Meridian Station. You fly for BLUE with 7 teammates. ORANGE has 8.'],
          ['THE GOAL', 'Get the CORE (the glowing ball) into ORANGE\'s goals at the far end of the station. Carry it, pass it, throw it.'],
          ['NOBODY OWNS IT', 'Anyone can grab the CORE straight out of a rival\'s hands, or crash into them for it. Keep it moving.'],
          ['THE STRATEGY', 'Like rugby: pull their defense one way, then attack the other. Your teammates run routes and pass to you when you\'re open.']],
         P, 190, W * 0.52);
    // illustration: two squads facing off over the core
    const ix = W * 0.62, iw = W - ix - P, iy = 200, ih = 560;
    g.fillStyle = 'rgba(255,255,255,0.04)'; rrect(g, ix, iy, iw, ih, 26); g.fill();
    for (let i = 0; i < 8; i++) {
      const row = i % 4, col = Math.floor(i / 4);
      for (const [team, x] of [['blue', ix + 70 + col * 70], ['orange', ix + iw - 70 - col * 70]]) {
        g.fillStyle = TEAM_COLOR[team]; g.beginPath(); g.arc(x, iy + 110 + row * 110, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#04121f'; g.font = uiFont(22, 900); g.textAlign = 'center'; g.fillText(team === 'blue' && i === 0 ? 'YOU' : String(i + 1), x, iy + 111 + row * 110); g.textAlign = 'left';
      }
    }
    const bx = ix + iw / 2, by = iy + ih / 2;
    const gr = g.createRadialGradient(bx, by, 0, bx, by, 70); gr.addColorStop(0, 'rgba(160,255,255,0.9)'); gr.addColorStop(1, 'rgba(102,255,255,0)');
    g.fillStyle = gr; g.fillRect(bx - 70, by - 70, 140, 140);
    g.fillStyle = '#e9fbff'; g.beginPath(); g.arc(bx, by, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = CYAN; g.font = uiFont(26, 900); g.textAlign = 'center'; g.fillText('THE CORE', bx, by + 56); g.textAlign = 'left';
  } else if (m.page === 1) {
    const mw = W * 0.58;
    g.fillStyle = 'rgba(255,255,255,0.03)'; rrect(g, P, 160, mw, 640, 26); g.fill();
    paintStationMap(g, P + 10, 170, mw - 20, 620);
    g.fillStyle = CYAN; g.font = uiFont(22, 700); g.textAlign = 'center'; g.fillText('dashed: BLUE\'s three ways to attack', P + mw / 2, 820); g.textAlign = 'left';
    const x = P + mw + 40, w = W - x - P;
    const rows = [['1', 'LOBBY HOLES', 'three round holes in their lobby wall: the short, crowded way'],
                  ['3', 'DEEP GOAL', 'behind their lobby: fly a side corridor, round the loop (a wall makes you go the long way), into the back corridor'],
                  ['+1', 'BANK SHOT', 'bounce it off any wall on the way in'],
                  ['+1', 'LONG SHOT', 'score from 28 m or further'],
                  ['2', 'PENALTY', 'free shot after a foul']];
    let y = 180;
    for (const [pts, name, text] of rows) {
      g.fillStyle = GOLD; g.font = uiFont(44, 900); g.textAlign = 'center'; g.fillText(pts, x + 40, y + 20); g.textAlign = 'left';
      g.fillStyle = INK; g.font = uiFont(30, 900); g.fillText(name, x + 100, y + 4);
      g.fillStyle = DIM; g.font = uiFont(22, 600); let yy = y + 40; for (const l of wrapLines(g, text, w - 100)) { g.fillText(l, x + 100, yy); yy += 28; }
      y = yy + 16;
    }
    g.fillStyle = '#9ff6ff'; g.font = uiFont(24, 800); let yy = y + 6;
    for (const l of wrapLines(g, 'SIGHT RING: hover in the exact middle of the lobby and you see every rider through the walls. Nobody can hide round a corner.', w)) { g.fillText(l, x, yy); yy += 30; }
  } else if (m.page === 2) {
    if (m.inVR) {
      const L = paintController(g, 520, 250, 300, 'left'), R = paintController(g, W - 520, 250, 300, 'right');
      const lx = 330, rx = W - 330, ys = [180, 290, 400, 510, 620];
      callout(g, L.trigger, [lx, ys[0]], 'TRIGGER  PASS', 'point at a teammate', 'right');
      callout(g, L.y, [lx, ys[1]], 'Y  PAUSE', 'menu, settings, exit', 'right');
      callout(g, L.stick, [lx, ys[2]], 'STICK  FLY · PUSH = BOOST', 'go where your hands point', 'right');
      callout(g, L.x, [lx, ys[3]], 'X  TURN AROUND', 'a quick 180° turn', 'right');
      callout(g, L.grip, [lx, ys[4]], 'GRIP  SNATCH', 'reach into a rival\'s hands', 'right');
      callout(g, R.trigger, [rx, ys[0]], 'TRIGGER  PULL · THROW', 'point at the core, or a goal', 'left');
      callout(g, R.trigger, [rx, ys[1]], 'TAP IT FAST', 'to win a CLASH', 'left');
      callout(g, R.stick, [rx, ys[2]], 'STICK  SNAP TURN', 'up and down: rise, sink', 'left');
      callout(g, R.a, [rx, ys[3]], 'A  TURN AROUND', 'and select in menus', 'left');
      callout(g, R.grip, [rx, ys[4]], 'GRIP  GRAB', 'or swing and let go (full motion)', 'left');
      g.fillStyle = DIM; g.font = uiFont(24, 600); g.textAlign = 'center';
      g.fillText('You always stay upright. Your ride tilts, your view never does.', W / 2, 760);
    } else {
      const keys = [['WASD', 'fly where you look'], ['E / Q', 'up / down'], ['SHIFT', 'boost (hold to keep going)'], ['L', 'turn around'], ['HOLD G', 'pull the CORE in'],
                    ['SPACE', 'throw where you look'], ['F', 'pass to your best open teammate'], ['G or SPACE', 'tap fast to win a CLASH'], ['P / ESC', 'pause'], ['TAB', 'scoreboard']];
      keys.forEach(([k, v], i) => {
        const x = P + (i % 2) * (W / 2 - 20), y = 200 + Math.floor(i / 2) * 110;
        g.fillStyle = 'rgba(102,255,255,0.15)'; rrect(g, x, y - 38, 220, 76, 16); g.fill();
        g.fillStyle = CYAN; g.font = uiFont(30, 900); g.textAlign = 'center'; g.fillText(k, x + 110, y);
        g.fillStyle = INK; g.font = uiFont(30, 700); g.textAlign = 'left'; g.fillText(v, x + 250, y);
      });
    }
  } else {
    body([['BUMP', 'Touch anyone and you bounce apart.'],
          ['CLASH', 'Fly into the rival carrying the CORE: you both stop dead and wrestle for it. Tap the trigger fast. Teammates within 7 m add their strength, like a maul. The carrier can pass out of it.'],
          ['SNATCH', 'Or reach straight into their hands and grip (point and pull up close works too) to take it with no clash at all.'],
          ['FOUL: LATE HIT', 'Crash hard into a rival who doesn\'t have the CORE and isn\'t near it, and their team gets a PENALTY: a free shot at your lobby holes worth 2.']],
         P, 190, W - P * 2, 32);
  }
  // buttons
  const by = H - 150, bw = 300, bh = 96, last = m.page === BRIEF_PAGES - 1;
  const btns = [['back', 'BACK', '#7a8aa0', m.page > 0]];
  if (last) btns.push(['train', 'TRAINING', GOLD, true], ['play', 'PLAY MATCH', CYAN, true]);
  btns.push(['next', last ? 'GOT IT' : 'NEXT', CYAN, true]);
  const shown = btns.filter(b => b[3]), total = shown.length * bw + (shown.length - 1) * 30;
  shown.forEach(([id, label, color], i) => tile(g, panel, { id, x: W / 2 - total / 2 + i * (bw + 30), y: by, w: bw, h: bh, row: 9, col: i }, color, label, null, id === 'next'));
  g.fillStyle = DIM; g.font = uiFont(22, 600); g.textAlign = 'center';
  g.fillText(m.inVR ? 'Point and pull the trigger, or left stick and A. Y closes.' : 'Click, or arrow keys and Enter. P closes.', W / 2, H - 28);
}

// ------------------------------------------------------------------ pause
const PAUSE4_W = 1.15, PAUSE4_H = 1.48;
function paintPause4(g, W, H, panel, m) {
  cardBg(g, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = INK; g.font = uiFont(64, 900); textShadow(g, 14); g.fillText('PAUSED', W / 2, 70); noShadow(g);
  g.font = uiFont(40, 900);
  if (m.training) { g.fillStyle = GOLD; g.fillText('TRAINING', W / 2, 150); }
  else { g.fillStyle = TEAM_COLOR.blue; g.textAlign = 'right'; g.fillText(`BLUE ${m.blue}`, W / 2 - 24, 150); g.fillStyle = DIM; g.textAlign = 'center'; g.fillText(':', W / 2, 148);
         g.fillStyle = TEAM_COLOR.orange; g.textAlign = 'left'; g.fillText(`${m.orange} ORANGE`, W / 2 + 24, 150); }
  const items = [['resume', 'RESUME', CYAN], ['help', 'HOW TO PLAY', '#7a8aa0'], ['reach', m.reach, '#7a8aa0'], ['flight', m.flight, '#7a8aa0'],
                 ['restart', m.training ? 'RESTART TRAINING' : 'RESTART MATCH', '#7a8aa0'], ['menu', 'MAIN MENU', '#7a8aa0'], ['version', m.versionLabel, '#7a8aa0'], ['home', m.exitLabel, '#c0605a']];
  items.forEach(([id, label, color], i) => tile(g, panel, { id, x: 60, y: 200 + i * 112, w: W - 120, h: 96, row: i, col: 0 }, color, label, null, i === 0));
  g.fillStyle = DIM; g.font = uiFont(22, 600); g.textAlign = 'center';
  g.fillText(m.inVR ? 'Point and pull the trigger, or left stick and A.  Y resumes.' : 'Click, or arrow keys and Enter.  P or Esc resumes.', W / 2, H - 36);
}

// ------------------------------------------------------------------ clash meter: a tug of war you win by tapping
function paintClash(g, W, H, panel, c) {
  g.fillStyle = 'rgba(6,12,24,0.85)'; rrect(g, 0, 0, W, H, 28); g.fill();
  g.strokeStyle = GOLD; g.lineWidth = 5; rrect(g, 3, 3, W - 6, H - 6, 26); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = GOLD; g.font = uiFont(44, 900); g.fillText('CLASH!', W / 2, 40);
  const bx = 60, bw = W - 120, by = 80, bh = 40, mid = bx + bw / 2, k = Math.max(-1, Math.min(1, c.you));
  g.fillStyle = hexA(TEAM_COLOR.orange, 0.6); rrect(g, bx, by, bw / 2, bh, 14); g.fill();
  g.fillStyle = hexA(TEAM_COLOR.blue, 0.6); rrect(g, mid, by, bw / 2, bh, 14); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(mid + k * bw / 2 - 6, by - 10, 12, bh + 20);
  g.font = uiFont(22, 800); g.fillStyle = INK; g.fillText('THEM', bx + 50, by + bh / 2); g.fillText('YOU', bx + bw - 40, by + bh / 2);
  g.fillStyle = INK; g.font = uiFont(26, 700);
  const how = c.inVR ? 'TAP THE TRIGGER FAST' : 'TAP G OR SPACE FAST';
  g.fillText(c.carrier ? `${how}  ·  or PASS out of it` : how, W / 2, 152);
}
