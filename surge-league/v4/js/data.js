// Surge League version 4: Station Rugby. 8 vs 8 in zero gravity aboard Meridian Station (built 2026-11-19).
const T = AFRAME.THREE;
const DEG = Math.PI / 180;
const STORE_KEY = 'vr-games-surge-league-v4';
const STORE_KEY_FROM = 'vr-games-surge-league-v3'; // first launch copies your players and settings from version 3
const VERSION_LINK = { url: '../v3/', label: 'VERSION 3', hint: 'Switch to version 3 (the open-air realms).' };

// ------------------------------------------------------------------ teams
const TEAM_SIZE = 8;                           // riders per team (blue: you + 7 bots; orange: 8 bots)
const TEAM_COLOR = { blue: '#3d8bff', orange: '#ff7a2f' };
const TEAM_NAME = { blue: 'BLUE', orange: 'ORANGE' };
const OTHER = { blue: 'orange', orange: 'blue' };
const HOME_SIGN = { blue: 1, orange: -1 };     // blue defends the +z end of the station, orange the -z end

// ------------------------------------------------------------------ flying (you)
const PLAYER_R = 0.6, BALL_R = 0.3, BOT_R = 0.7;
const THRUST = 11, MAX_SPEED = 10, DRAG = 0.4;
const BOOST_BURST = 10, BOOST_MAX = 20, BOOST_TIME = 0.6, BOOST_COOL = 0.8, BOOST_COST = 20, BOOST_HOLD_COST = 30;
const EASY_SPEED = 8.5, EASY_RESPONSE = 4;
const STEER_LIFT = 12 * DEG, STEER_SMOOTH = 12;
const RIDE_TILT = 9 * DEG, RIDE_PITCH = 4 * DEG, SNAP_DEG = 30;
const FLIGHT_MODES = ['hands', 'head'];
// Follow your head (pause menu TURN row): look past FOLLOW_START to one side and you drift round that way, up to FOLLOW_MAX per second.
const FOLLOW_START = 35 * DEG, FOLLOW_GAIN = 1.2, FOLLOW_MAX = 45 * DEG;
// Bots pull a loose CORE in from your pull range after this reaction time.
const BOT_PULL_DELAY = { ROOKIE: 0.8, PRO: 0.5, LEGEND: 0.3 };
const FLIGHT_LABEL = { hands: 'FLIGHT: HANDS STEER (ALWAYS UPRIGHT)', head: 'FLIGHT: CLASSIC (GO WHERE YOU LOOK)' };
const ENERGY_MAX = 100, REGEN = 20, REGEN_DELAY = 0.6;
const BOUNCE_WALL = 0.35, BOUNCE_BALL = 0.75;
const ARM_START = 0.32, ARM_GAIN = 10, ARM_MAX = 2.4;

// ------------------------------------------------------------------ the core (ball)
const THROW_GAIN = 1.3, BALL_MAX = 34, BALL_DRAG = 0.12;
const GRAB_R = 0.6, SNAP_R = 1.8, SNAP_SPEED = 30;
const EASY_PULL_RANGE = 27, PULL_SPEED = 18, EASY_THROW = 26;
const THROW_ASSIST = 5 * DEG, EASY_ASSIST = 8 * DEG;
const PASS_SPEED = 24, PASS_ANGLE = 18 * DEG, PASS_RANGE = 50;
const STEAL_R = 1.7, GRACE = 0.8;              // grab the core straight out of a rival's hands within STEAL_R (not in their first GRACE s)
const WEAK_THROW = 1.8, STRONG_SWING = 2.5, QUIET_SPEED = 0.12, QUIET_SECONDS = 15;

// ------------------------------------------------------------------ contact
const BUMP_BOUNCE = 0.7;                       // riders who touch bounce apart
const CLASH_SPEED = 2.5;                       // fly into the core carrier this fast (m/s, closing) and you lock up in a CLASH
const CLASH_TIME = 2.6, CLASH_RATE = 0.9;      // a clash lasts at most this long; how fast the tug-of-war moves
const CLASH_HELP_R = 7, CLASH_HELP = 0.55;     // each teammate within CLASH_HELP_R adds this much strength (like a maul)
const CLASH_TAP = 0.12;                        // strength from each fast trigger tap (you)
const FOUL_SPEED = 12;                         // hitting a rival WITHOUT the core this hard (closing speed) is a late hit
const FOUL_BALL_R = 5;                         // ...unless the core is within this distance (then it's a fair contest)

// ------------------------------------------------------------------ scoring
const POINTS = { hole: 1, deep: 3, penalty: 2, bank: 1, long: 1 };
const LONG_SHOT = 28;                          // a goal thrown from this far away (m) is a LONG SHOT (+1), like a drop goal
const BANK_WINDOW = 2.5;                       // the core hit a wall within this many seconds of the throw: BANK SHOT (+1)
const PENALTY_TIME = 6;                        // seconds to take a penalty shot

// ------------------------------------------------------------------ bots
const LEVELS = [
  { name: 'ROOKIE', rating: 900, speed: 0.85, aim: 0.18, think: 0.45, clash: 0.85 },
  { name: 'PRO', rating: 1200, speed: 0.95, aim: 0.1, think: 0.3, clash: 1.0 },
  { name: 'LEGEND', rating: 1500, speed: 1.05, aim: 0.05, think: 0.2, clash: 1.15 }
];
const BOT_SPEED = 10.5, BOT_ACCEL = 14, BOT_THROW = 24, BOT_CATCH_R = 1.3;
const MATCH_LENGTHS = [180, 300, 480];

// ------------------------------------------------------------------ coaching
const TIP_HINTS = {
  boost: { side: 'right', part: 'stick' }, steer: { side: 'left', part: 'stick' }, turn: { side: 'right', part: 'stick' }, grab: { side: 'right', part: 'trigger' },
  throw: { side: 'right', part: 'trigger' }, pass: { side: 'left', part: 'trigger' }, steal: { side: 'right', part: 'grip' }, clash: { side: 'right', part: 'trigger' },
  pause: { side: 'left', part: 'y' }, sight: { side: 'left', part: 'stick' }, penalty: { side: 'right', part: 'trigger' }, around: { side: 'right', part: 'a' }
};
const TIPS = {
  pause: ['Press Y any time to pause.', 'Press P any time to pause.'],
  steer: ['Point your hands where you want to fly, then push the left stick forward.', 'WASD flies where you look. E and Q go up and down.'],
  turn: ['Flick the right stick left or right to snap turn. A or X turns you all the way around.', 'L turns you all the way around.'],
  boost: ['Push a thumbstick DOWN to boost. Keep it pushed to keep boosting.', 'Shift boosts. Hold it to keep boosting.'],
  grab: ['Point at the CORE and hold the trigger to pull it into your hand.', 'Look at the CORE and hold G to pull it in.'],
  throw: ['Point at a goal and press the trigger to throw.', 'Space throws where you look.'],
  pass: ['Point at a teammate and press the trigger to pass. Passing beats getting caught.', 'Press F to pass to your best open teammate.'],
  steal: ['A rival has the CORE: reach in and grip to snatch it, or fly into them to CLASH.', 'Fly into the rival carrying the CORE to CLASH.'],
  clash: ['CLASH! Tap the trigger fast to wrestle the CORE. Teammates nearby help. You can pass out of it.', 'CLASH! Tap G fast to wrestle the CORE. F passes out of it.'],
  sight: ['Hover in the SIGHT RING in the lobby center to see every rider through the walls.', 'Hover in the SIGHT RING in the lobby center to see every rider through the walls.'],
  penalty: ['PENALTY: you get a free shot. Point at a round hole and press the trigger. 2 points.', 'PENALTY: you get a free shot. Look at a round hole and press Space. 2 points.'],
  deep: ['The loops lead to the DEEP GOAL behind their lobby: 3 points.', 'The loops lead to the DEEP GOAL behind their lobby: 3 points.']
};
