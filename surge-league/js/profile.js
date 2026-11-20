// Player profiles, ranks and match scoring. Everything stays on the headset (no account, no password).
// Online play later reuses the same profile id and signs in to the league server with a device token (see net.js).
const RANKS = [
  { name: 'BRONZE', min: 0 }, { name: 'SILVER', min: 1000 }, { name: 'GOLD', min: 1150 },
  { name: 'PLATINUM', min: 1300 }, { name: 'DIAMOND', min: 1450 }, { name: 'DREAMWALKER', min: 1600 }
];

const Profiles = {
  init(save) {
    if (!Array.isArray(save.profiles) || !save.profiles.length) save.profiles = [this.make('PLAYER 1')];
    if (!save.profiles.some(p => p.id === save.active)) save.active = save.profiles[0].id;
    return save;
  },
  make(name) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
    return { id, name, rating: 1000, wins: 0, losses: 0, draws: 0, best: {}, history: [] };
  },
  current(save) { return save.profiles.find(p => p.id === save.active) || save.profiles[0]; },
  rank(rating) { return RANKS.filter(r => rating >= r.min).pop(); },
  label(p) { const r = this.rank(p.rating); return `${p.name}  ${r.name} ${Math.round(p.rating)}`; },

  // Individual Surge Score for one match: rewards scoring, smart play and the hard stuff.
  surgeScore(st) {
    return st.goals * 10 + st.tricks * 20 + st.steals * 5 + st.passes * 3 + st.comet * 15 + st.hits * 4;
  },

  // Elo against the bots' strength for the chosen difficulty. Practice matches don't change your rank.
  record(save, m) {
    const p = this.current(save);
    const result = m.scoreFor > m.scoreAgainst ? 1 : m.scoreFor < m.scoreAgainst ? 0 : 0.5;
    let delta = 0;
    if (m.ranked) {
      const expected = 1 / (1 + Math.pow(10, (m.botRating - p.rating) / 400));
      delta = Math.round(32 * (result - expected));
      p.rating = Math.max(0, p.rating + delta);
      if (result === 1) p.wins++; else if (result === 0) p.losses++; else p.draws++;
    }
    const surge = this.surgeScore(m.stats);
    const key = `${m.mode}/${m.level}`;
    const newBest = surge > (p.best[key] || 0);
    if (newBest) p.best[key] = surge;
    p.history.unshift({ at: Date.now(), mode: m.mode, arena: m.arena, realm: m.realm, level: m.level, for: m.scoreFor, against: m.scoreAgainst, surge, delta });
    p.history.length = Math.min(p.history.length, 20);
    writeSave(save);
    return { result, delta, surge, newBest, rating: p.rating, rank: this.rank(p.rating).name };
  }
};
