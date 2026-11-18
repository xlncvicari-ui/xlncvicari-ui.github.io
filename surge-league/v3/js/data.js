// Surge League v2: tuning numbers, realms (looks), arenas (layouts), modes and bot difficulty.
const T = AFRAME.THREE;
const DEG = Math.PI / 180;
const STORE_KEY = 'vr-games-surge-league-v3';
const STORE_KEY_FROM = 'vr-games-surge-league-v2'; // first launch copies your players and settings from version 2
const VERSION_LINK = { url: '../', label: 'VERSION 2', hint: 'Switch back to version 2 (to compare with this one).' };

// Every arena is the same frisbee-shaped volume so skills carry over: blue half at +z, orange half at -z.
// Version 3: the field is 75% as wide and long as version 2 (FIELD_SCALE) and a bit lower, so you reach the action sooner.
const FIELD_SCALE = 0.75, fs_ = v => v * FIELD_SCALE;
const ARENA_R = 45, Y_MIN = 2, Y_MAX = 34, GOAL_Z = 39;
const PLAYER_R = 0.6, DISC_R = 0.32, BOT_R = 0.8, SNITCH_R = 0.2;

const THRUST = 12, MAX_SPEED = 12, DRAG = 0.35;
const BOOST_BURST = 12, BOOST_MAX = 24, BOOST_TIME = 0.6, BOOST_COOL = 0.8, BOOST_COST = 20;
const EASY_SPEED = 9, EASY_RESPONSE = 4;
// Flight: hands steer, a held stick-click keeps boosting (energy per second), and free flight turns your ride once you point
// past FREE_PITCH (up/down) or FREE_YAW (left/right of where you look). TURN_GAIN = turn speed per radian past that, TURN_MAX caps it.
const BOOST_HOLD_COST = 30, STEER_LIFT = 12 * DEG, STEER_SMOOTH = 12;
const FREE_PITCH = 45 * DEG, FREE_YAW = 50 * DEG, TURN_GAIN = 2.4, TURN_MAX = 2.2, LEVEL_MAX = 1.75;
const FLIGHT_MODES = ['free', 'hands', 'head'];
const FLIGHT_LABEL = { free: 'FLIGHT: FREE (HANDS STEER, FLIPS)', hands: 'FLIGHT: HANDS STEER, STAY LEVEL', head: 'FLIGHT: CLASSIC (GO WHERE YOU LOOK)' };
const ENERGY_MAX = 100, REGEN = 20, REGEN_DELAY = 0.6, PUSH_COST = 15;
const BOUNCE_PLAYER = 0.5, BOUNCE_DISC = 0.8, BOUNCE_BOT = 0.3;
const POCKET_R = 0.9, LAUNCH_GAIN = 1.6, LAUNCH_MAX = 22;
const ARM_START = 0.32, ARM_GAIN = 10, ARM_MAX = 2.4;
const THROW_GAIN = 1.3, DISC_MAX = 40, DISC_DRAG = 0.15;
const GRAB_R = 0.6, SNAP_R = 1.8, SNAP_SPEED = 30;
const EASY_PULL_RANGE = 35, PULL_SPEED = 18, EASY_THROW = 26, PUSH_RANGE = 12, PUSH_POWER = 16;
const THROW_ASSIST = 5 * DEG, EASY_ASSIST = 8 * DEG;
const HOLD_LIMIT = 8, PASS_SPEED = 22, PASS_ANGLE = 15 * DEG, PASS_RANGE = 45;
const CURVE_K = 1.5, CURVE_MAX = 14, CURVE_DECAY = 1.2;
const CURRENT_Y = 16, CURRENT_R = 4.5, CURRENT_LEN = 30, CURRENT_ACCEL = 16, CURRENT_SPEED = 20;
const BOT_SPEED = 11, BOT_ACCEL = 16, BOT_THROW = 26, BOT_SHOOT = 16, BOT_CATCH_R = 1.2;
const STEAL_R = 1.6, BEHIND_DOT = -0.25, GRACE = 0.7;
const SNITCH_SPEED = 16, SNITCH_POINTS = 3;
const TRICK_WINDOW = 2.5, CORE_R = 6, CORE_TICK = 1;
const QUIET_SPEED = 0.12, QUIET_SECONDS = 15, WEAK_THROW = 1.8, STRONG_SWING = 2.5;

// Realm powers (B button). Everyone in a realm, bots included, has the same one on the same cooldown.
const POWERS = { tractor: { cool: 8 }, shockwave: { cool: 10 }, slipstream: { cool: 9, time: 2 }, mitt: { cool: 8, time: 2 }, gust: { cool: 8 } };
// The tractor beam only grabs a loose, slow disc, never a shot in flight, so it can't act as a perfect goalie.
const TRACTOR_RANGE = 28, TRACTOR_SPEED = 24, TRACTOR_MAX_DISC_SPEED = 8;
const SHOCK_R = 7, HIT_SPEED = 10, HIT_STUN = 1.5, GUST_RANGE = 14, GUST_DOT = 0.8;

const TEAM_COLOR = { blue: '#3d8bff', orange: '#ff7a2f' };
const OTHER = { blue: 'orange', orange: 'blue' };
const OWN_Z = { blue: GOAL_Z, orange: -GOAL_Z };

// Dream realms: same rules and field, a completely different world, ride and power.
const REALMS = [
  { id: 'saucer', name: 'SAUCER NEBULA', ride: 'UFO', power: 'tractor', powerName: 'TRACTOR BEAM', powerHint: 'pull a loose disc to you from far away',
    sky: { stops: [[0, '#02010a'], [0.35, '#120a35'], [0.5, '#3b2470'], [0.56, '#160c33'], [1, '#02010a']], stars: 1400, nebula: ['#ff4fd8', '#3de0ff', '#7a5cff'] },
    fog: '#140b30', fogDensity: 0.0035, hemi: ['#b9c8ff', '#2a1a4a', 0.75], sun: ['#d2dcff', 0.7],
    floor: 'grid', tint: { blue: '#9fc4ff', orange: '#ffb0de' }, ground: null, lines: '#66ffff', edge: '#66ffff',
    decor: 'space', particles: { kind: 'motes', color: '#9ff7ff', count: 160, size: 0.18 },
    rock: { geo: 'octa', color: '#8fe6ff', emissive: '#2bb3d6', glow: 0.45, metal: 0.2, rough: 0.25 },
    hoop: { tube: 0.12, seg: 48 }, disc: 'dv-disc', trail: '#66ffff', wind: '#bff', arm: '#66ffff', ink: '#ffffff' },
  { id: 'foundry', name: 'IRON FOUNDRY', ride: 'MECH SUIT', power: 'shockwave', powerName: 'SHOCKWAVE', powerHint: 'knock the disc loose and push rivals away',
    sky: { stops: [[0, '#2b1712'], [0.35, '#7a3a22'], [0.5, '#e0874a'], [0.55, '#5a2a1a'], [1, '#1a0d08']], stars: 0, haze: '#ffb070' },
    fog: '#8a4a2c', fogDensity: 0.006, hemi: ['#ffd2a8', '#3a2418', 0.85], sun: ['#ffb070', 0.9],
    floor: 'plates', tint: { blue: '#b8c8e0', orange: '#e8c4a8' }, ground: '#241c18', lines: '#ffb347', edge: '#ff8a1f',
    decor: 'foundry', particles: { kind: 'embers', color: '#ffae4a', count: 220, size: 0.22 },
    rock: { geo: 'ico', color: '#5f6670', emissive: '#ff6a00', glow: 0.3, metal: 0.85, rough: 0.35 },
    hoop: { tube: 0.16, seg: 6 }, disc: 'dv-puck', trail: '#ff8a1f', wind: '#ffcf8a', arm: '#a9b2bd', ink: '#ffffff' },
  { id: 'castle', name: 'MOON CASTLE', ride: 'BROOM', power: 'slipstream', powerName: 'SLIPSTREAM', powerHint: '2 seconds of double speed',
    sky: { stops: [[0, '#03040f'], [0.35, '#0d1440'], [0.5, '#2c2a66'], [0.56, '#0b0f2a'], [1, '#03040f']], stars: 1800, aurora: ['#5effc8', '#7a9cff', '#c88bff'] },
    fog: '#121a40', fogDensity: 0.005, hemi: ['#9fb0ff', '#1a2a1e', 0.55], sun: ['#cfd8ff', 0.55],
    floor: 'cobble', tint: { blue: '#b6c6ff', orange: '#e6d2a8' }, ground: '#1b2e22', lines: '#c9d6ff', edge: '#c9d6ff',
    decor: 'castle', particles: { kind: 'fireflies', color: '#d8ff6a', count: 150, size: 0.2 },
    rock: { geo: 'dode', color: '#8b8378', emissive: '#000000', glow: 0, metal: 0, rough: 0.95 },
    hoop: { tube: 0.1, seg: 64 }, disc: 'dv-quaffle', trail: '#ffd9a0', wind: '#c9d6ff', arm: '#d8c9a3', ink: '#ffffff' },
  { id: 'gym', name: 'DREAM GYM', ride: 'HOVERBOARD', power: 'mitt', powerName: 'CATCH MITT', powerHint: 'huge grab range for 2 seconds. Fast throws stun rivals',
    sky: { stops: [[0, '#b9a6ff'], [0.35, '#f6c6ea'], [0.5, '#ffd9b8'], [0.56, '#f6c6ea'], [1, '#b9a6ff']], stars: 0, puffs: '#ffffff' },
    fog: '#f6d2ea', fogDensity: 0.004, hemi: ['#ffffff', '#c9a0c0', 1.0], sun: ['#fff2e0', 0.9],
    floor: 'planks', tint: { blue: '#cfe3ff', orange: '#ffe2c8' }, ground: '#f2cfe6', lines: '#ffffff', edge: '#ff7ab8',
    decor: 'gym', particles: { kind: 'bubbles', color: '#ffffff', count: 120, size: 0.45 },
    rock: { geo: 'ball', color: '#ff9ecf', emissive: '#000000', glow: 0, metal: 0, rough: 0.55 },
    hoop: { tube: 0.14, seg: 48 }, disc: 'dv-dodgeball', trail: '#ff5a5a', wind: '#ffffff', arm: '#ff9ecf', ink: '#2a1a3e' },
  { id: 'cloud', name: 'CLOUD COURT', ride: 'CLOUD', power: 'gust', powerName: 'GUST', powerHint: 'blow the disc and rivals away in front of you',
    sky: { stops: [[0, '#5aa8f0'], [0.4, '#9fd3ff'], [0.5, '#e6f4ff'], [0.56, '#cfe6f7'], [1, '#9fc6e0']], stars: 0, sun: '#fff6d8' },
    fog: '#bfe1ff', fogDensity: 0.004, hemi: ['#ffffff', '#4a6a4a', 0.9], sun: ['#fff4dd', 0.85],
    floor: 'turf', tint: { blue: '#c8e0ff', orange: '#ffe0c0' }, ground: '#5b8f55', lines: '#f4f8ee', edge: '#ffffff',
    decor: 'cloud', particles: { kind: 'motes', color: '#ffffff', count: 80, size: 0.14 },
    rock: { geo: 'puff', color: '#ffffff', emissive: '#000000', glow: 0, metal: 0, rough: 1 },
    hoop: { tube: 0.12, seg: 48 }, disc: 'dv-disc', trail: '#3d8bff', wind: '#ffffff', arm: '#66ffff', ink: '#1a2a3e' }
];

// Each realm reshapes the field with its own hazard, always placed in mirrored pairs so both teams get the same.
const HAZARDS = {
  saucer: { name: 'GRAVITY WELLS', hint: 'Two black holes bend the disc. Get too close and it slingshots out.' },
  foundry: { name: 'STEAM VENTS', hint: 'Floor vents blast the disc and riders upward. They glow orange before they blow.' },
  castle: { name: 'GHOST PORTALS', hint: 'Throw the disc through a portal and it flies out of its twin across the field.' },
  gym: { name: 'BOUNCE PADS', hint: 'Trampolines launch the disc sky-high, and the giant balls are extra bouncy.' },
  cloud: { name: 'DRIFT CLOUDS', hint: 'Thick clouds wander the field. The disc slows inside, and you can hide in them.' }
};
for (const r of REALMS) { r.hazardName = HAZARDS[r.id].name; r.hazardHint = HAZARDS[r.id].hint; }

// Surge events: every 30 to 50 seconds something shakes up the match for everyone at once (always fair to both teams).
const SURGES = [
  { id: 'double', name: 'DOUBLE POINTS', hint: 'Every score counts twice!', time: 15 },
  { id: 'golden', name: 'GOLDEN HOOPS', hint: 'The gold hoops are worth 3 extra points.', time: 20, needsHoops: true },
  { id: 'turbo', name: 'TURBO DISC', hint: 'The disc flies faster and bounces harder.', time: 15 },
  { id: 'shift', name: 'HOOP SHIFT', hint: 'The hoops are on the move!', time: 18, needsHoops: true },
  { id: 'storm', name: 'WIND STORM', hint: 'Wild winds sweep across the field.', time: 16 },
  { id: 'power', name: 'POWER SURGE', hint: 'Realm powers recharge four times faster.', time: 14 },
  { id: 'dark', name: 'LIGHTS OUT', hint: 'Follow the glowing disc!', time: 12 },
  { id: 'wild', name: 'REALM GOES WILD', hint: '', time: 14 }
];
const SURGE_FIRST = [25, 40], SURGE_GAP = [32, 50];

// Arena layouts. Lists marked "quarter" are mirrored into all four quarters, "middle" into both halves,
// so both teams always get the same paths (fair), whatever the arena.
const ARENAS = [
  { id: 'frisbee', name: 'FRISBEE FIELD', short: 'Open middle, wind streams', blurb: 'Open middle, three paths per side, wind streams on the wings.',
    hoops: [{ x: -14, y: 13, size: 1.6, pts: 2 }, { x: 0, y: 20, size: 2.1, pts: 1 }, { x: 14, y: 13, size: 1.6, pts: 2 }],
    rocksQuarter: [{ x: 24, y: 10, z: 30, r: 2.2 }, { x: 30, y: 24, z: 12, r: 1.8 }], rocksMiddle: [{ x: 0, y: 30, z: 26, r: 2.4 }],
    pocketsQuarter: [{ x: 20, y: 14, z: 22 }, { x: 26, y: 18, z: 8 }, { x: 14, y: 22, z: 38 }], pocketsMiddle: [{ x: 0, y: 14, z: 32 }, { x: 0, y: 21, z: 14 }],
    pocketsCenter: [{ x: -10, y: 12, z: 0 }, { x: 10, y: 12, z: 0 }],
    winds: [[{ x: -26, dir: -1 }, { x: 26, dir: 1 }]] },
  { id: 'prism', name: 'PRISM COURT', short: 'Bank shots score double', blurb: 'Bank shots: from a launch ring, hit a prism\'s sweet spot and it banks in. TRICK SHOT = double.',
    hoops: [{ x: 0, y: 18, size: 1.8, pts: 2 }],
    // Each prism is aimed so a throw from its launch ring that hits the plate center reflects straight into the hoop.
    prisms: [{ plate: { x: -20, y: 18, z: 36 }, launch: { x: 8, y: 18, z: 8 } }, { plate: { x: 20, y: 18, z: 36 }, launch: { x: -8, y: 18, z: 8 } }],
    rocksQuarter: [{ x: 30, y: 28, z: 20, r: 2 }], rocksMiddle: [{ x: 0, y: 8, z: 30, r: 2.2 }],
    pocketsQuarter: [{ x: 14, y: 12, z: 18 }, { x: 28, y: 16, z: 4 }], pocketsMiddle: [{ x: 0, y: 24, z: 24 }], pocketsCenter: [{ x: 0, y: 12, z: 0 }],
    winds: [[]] },
  { id: 'storm', name: 'STORM BOWL', short: 'Sweepers, bumpers, shifting wind', blurb: 'Unpredictable: sweeper bars spin, bumper orbs roam, the wind shifts every 20 seconds.',
    hoops: [{ x: -14, y: 13, size: 1.6, pts: 2 }, { x: 0, y: 20, size: 2.1, pts: 1 }, { x: 14, y: 13, size: 1.6, pts: 2 }],
    sweepers: [{ y: 9, len: 42, speed: 0.35 }, { y: 27, len: 42, speed: -0.28 }],
    bumpers: { count: 2, r: 2.2, bounce: 1.3 },
    rocksQuarter: [], rocksMiddle: [{ x: 0, y: 32, z: 30, r: 2 }],
    pocketsQuarter: [{ x: 22, y: 16, z: 20 }, { x: 30, y: 14, z: 6 }], pocketsMiddle: [{ x: 0, y: 18, z: 34 }], pocketsCenter: [],
    // Wind patterns cycle; every pattern is mirror-fair.
    winds: [[{ x: -26, dir: -1 }, { x: 26, dir: 1 }], [{ x: -26, dir: 1 }, { x: 26, dir: -1 }], [{ x: -12, dir: -1 }, { x: 12, dir: 1 }, { x: -38, dir: 1 }, { x: 38, dir: -1 }]] }
];

const MODES = [
  { id: 'hoops', name: 'CLASSIC HOOPS', short: 'Score through rival hoops', blurb: 'Throw the disc through the rival hoops.', time: 240, bots: true, hoops: true, snitch: [60, 150], ranked: true },
  { id: 'core', name: 'KING OF THE CORE', short: 'Hold the disc in the core', blurb: 'Hold the disc inside the glowing core: 1 point a second. First to 30.', time: 240, bots: true, hoops: false, core: true, target: 30, snitch: [], ranked: true },
  { id: 'snitch', name: 'SNITCH HUNT', short: 'Snitch every 20 seconds', blurb: 'The snitch comes back every 20 seconds. Hoops count too.', time: 180, bots: true, hoops: true, snitch: [20, 40, 60, 80, 100, 120, 140, 160], ranked: true },
  { id: 'brawl', name: 'SKY BRAWL', short: 'Wipeouts score points', blurb: 'Knock rivals out: every wipeout is a point, and hoops count too. Punch, tackle, blast.', time: 180, bots: true, hoops: true, snitch: [], ranked: true, koPoints: 1 },
  { id: 'practice', name: 'TRICK PRACTICE', short: 'No bots, just you', blurb: 'No bots. Practice throws, curves and bank shots.', time: 180, bots: false, hoops: true, snitch: [], ranked: false }
];

// Bot difficulty. New players start on Rookie; the choice is remembered. rating = the bots' strength for rank changes.
const LEVELS = [
  { name: 'ROOKIE', speed: 0.78, accel: 0.7, aim: 2, steal: 0.8, power: 0.01, rating: 900 },
  { name: 'PRO', speed: 1, accel: 1, aim: 1, steal: 1, power: 0.05, rating: 1200 },
  { name: 'LEGEND', speed: 1.12, accel: 1.25, aim: 0.45, steal: 1.1, power: 1, rating: 1500 }
];

// Cover to hide behind: the same boxes in every arena (each realm draws them its own way). Mirrored, so both teams get the same.
const COVER_QUARTER = [{ x: 14, y: 5.5, z: 12, w: 7, h: 5, d: 2.5 }, { x: 34, y: 9, z: 34, w: 2.5, h: 12, d: 7 }];
const COVER_MIDDLE = [{ x: 0, y: 7, z: 20, w: 3, h: 14, d: 3 }];

// Power-up orbs: they appear in mirrored pairs every 12 to 18 seconds. Fly through one to grab it (bots grab them too).
const POWERUPS = [
  { id: 'speed', name: 'SPEED', color: '#5dff8a', time: 6, hint: 'Double speed for 6 seconds!' },
  { id: 'magnet', name: 'MAGNET', color: '#ff5ad1', time: 7, hint: 'The disc jumps to your hands for 7 seconds.' },
  { id: 'shield', name: 'SHIELD', color: '#ffd23d', time: 8, hint: 'Nobody can steal from you or stun you for 8 seconds.' },
  { id: 'mega', name: 'MEGA THROW', color: '#ff8a1f', time: 12, hint: 'Your next throw is super fast and knocks rivals over.' }
];
const DUNK_BONUS = 2, FIRE_BONUS = 1, FINAL_SURGE_AT = 30, TACKLE_SPEED = 7;

// Which button each tip is about, so the pop-up shows the controller with that button lit.
const TIP_HINTS = {
  boost2: { side: 'right', part: 'stick' }, steer: { side: 'left', part: 'stick' }, flip: { side: 'right', part: 'a' }, grab: { side: 'right', part: 'grip' }, throw: { side: 'right', part: 'grip' },
  easyThrow: { side: 'right', part: 'trigger' }, pass: { side: 'left', part: 'trigger' }, steal: { side: 'right', part: 'grip' },
  pocket: { side: 'left', part: 'grip' }, pause: { side: 'left', part: 'y' }, power: { side: 'right', part: 'b' }
};

// One-time coach tips. [Quest text, PC text]
const TIPS = {
  pause: ['Press Y any time to pause.', 'Press P any time to pause.'],
  dunk: ['Holding the disc? Fly right through a rival hoop to DUNK for 2 extra points!', 'Holding the disc? Fly through a rival hoop to DUNK for 2 extra!'],
  orb: ['Fly through the glowing orb to grab a power-up!', 'Fly through the glowing orb to grab a power-up!'],
  steer: ['Point your hands where you want to fly, then push the left stick forward.', ''],
  boost2: ['Push a thumbstick DOWN to boost. Keep it pushed to keep boosting.', 'Shift boosts. Hold it to keep boosting.'],
  flip: ['Point both hands up and boost to loop over backwards. A or X turns you right side up.', 'Look up and boost to loop over. L turns you right side up.'],
  grab: ['Reach for the disc and grip. It snaps into your hand.', 'Look at the disc and hold G to pull it in.'],
  throw: ['Swing your arm and let go of grip to throw. Flick your wrist to curve it.', 'Space throws where you look. Hold A or D to curve.'],
  easyThrow: ['Point and press trigger to throw.', ''],
  pass: ['Point at your ALLY and pull the trigger to pass.', 'Press F to pass to your ally.'],
  clock: ['8 seconds max with the disc. Throw or pass!', '8 seconds max with the disc. Throw or pass!'],
  steal: ['Grab it from the front, or BOOST straight into them to knock it loose!', 'Grab it from the front, or boost straight into them to knock it loose!'],
  pocket: ['Grip the shimmering air pocket, pull yourself along, let go to fling.', ''],
  punch: ['Swing your fist into a rival to PUNCH. Knock out their health and they get sent back to their end!', 'Press V to punch a rival in front of you. Knock them out to send them back!'],
  wind: ['Wind stream! It carries you along the side.', 'Wind stream! It carries you along the side.'],
  prism: ['Prism Court: throw from a launch ring at the prism\'s glowing center. It banks into the hoop for a TRICK SHOT.', 'Prism Court: throw from a launch ring at the prism\'s glowing center for a TRICK SHOT.'],
  core: ['King of the Core: hold the disc inside the glowing core to score.', 'King of the Core: hold the disc inside the glowing core to score.']
};

// Shrink every layout to the smaller field. Positions move in toward the middle; sizes (hoops, cover, rocks) stay the same.
(function shrinkField() {
  const xz = q => { if (q) { if ('x' in q) q.x *= FIELD_SCALE; if ('z' in q) q.z *= FIELD_SCALE; } };
  for (const a of ARENAS) {
    for (const k of ['hoops', 'rocksQuarter', 'rocksMiddle', 'pocketsQuarter', 'pocketsMiddle', 'pocketsCenter']) (a[k] || []).forEach(xz);
    (a.prisms || []).forEach(q => { xz(q.plate); xz(q.launch); });
    (a.sweepers || []).forEach(w => { w.len *= FIELD_SCALE; });
    a.winds.forEach(list => list.forEach(xz));
  }
  COVER_QUARTER.forEach(xz); COVER_MIDDLE.forEach(xz);
})();
