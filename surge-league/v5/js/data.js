// Surge League version 5 (built 2026-11-20): Station Rugby grown up. 8 vs 8 in zero gravity, five levels, open windows you can
// fly through, see-through walls, rucks you win with your grip, dash tackles, fights and a penalty box, aurora buffs.
// Every number that shapes how the game feels lives in this file.
const T = AFRAME.THREE;
const DEG = Math.PI / 180;
const STORE_KEY = 'vr-games-surge-league-v5';
const STORE_KEY_FROM = 'vr-games-surge-league-v4'; // first launch copies your players and settings from version 4
const VERSION_LINK = { url: '../v4/', label: 'VERSION 4', hint: 'Switch to version 4 (the first Station Rugby, one level).' };

// ------------------------------------------------------------------ teams
const TEAM_SIZE = 8;
const TEAM_COLOR = { blue: '#2f9bff', orange: '#ff6a2b' };
const TEAM_NAME = { blue: 'BLUE', orange: 'ORANGE' };
const OTHER = { blue: 'orange', orange: 'blue' };
const HOME_SIGN = { blue: 1, orange: -1 };     // blue defends the +z end, orange the -z end

// ------------------------------------------------------------------ flying (you)
const PLAYER_R = 0.6, BALL_R = 0.3, BOT_R = 0.7;
const THRUST = 11, MAX_SPEED = 10, DRAG = 0.4;
const BOOST_BURST = 10, BOOST_MAX = 20, BOOST_TIME = 0.6, BOOST_COOL = 0.8, BOOST_COST = 20, BOOST_HOLD_COST = 30;
const EASY_SPEED = 8.5, EASY_RESPONSE = 4;
const STEER_LIFT = 12 * DEG, STEER_SMOOTH = 12;
const RIDE_TILT = 9 * DEG, RIDE_PITCH = 4 * DEG, SNAP_DEG = 30;
const FLIGHT_MODES = ['hands', 'head'];
const FLIGHT_LABEL = { hands: 'FLIGHT: HANDS STEER (ALWAYS UPRIGHT)', head: 'FLIGHT: CLASSIC (GO WHERE YOU LOOK)' };
const FOLLOW_START = 35 * DEG, FOLLOW_GAIN = 1.2, FOLLOW_MAX = 45 * DEG; // follow-your-head turning (pause menu TURN row)
const ENERGY_MAX = 100, REGEN = 20, REGEN_DELAY = 0.6;
const BOUNCE_WALL = 0.35, BOUNCE_BALL = 0.75;
const ARM_START = 0.32, ARM_GAIN = 10, ARM_MAX = 2.4;
// DASH (B button): a short, sharp burst the way your left stick points (sideways works: cut in front of a runner).
// Whoever you hit during a dash is knocked DASH_KNOCK times harder, and a ruck you start with a dash begins in your favor.
const DASH_SPEED = 24, DASH_TIME = 0.22, DASH_COOL = 1.3, DASH_COST = 28, DASH_KNOCK = 1.7, DASH_HEADSTART = 0.3;

// ------------------------------------------------------------------ the core (ball)
const THROW_GAIN = 1.3, BALL_MAX = 34, BALL_DRAG = 0.12;
const GRAB_R = 0.6, SNAP_R = 1.8, SNAP_SPEED = 30;
const EASY_PULL_RANGE = 21.5, PULL_SPEED = 18;  // point + trigger pulls the core from this far (20% shorter since 2026-11-20)
// Charged throws: tap the trigger for a soft pass or lob (THROW_SOFT), hold up to CHARGE_TIME for a hard throw (THROW_HARD).
const THROW_SOFT = 15, THROW_HARD = 32, CHARGE_TIME = 0.7;
const THROW_ASSIST = 5 * DEG, EASY_ASSIST = 8 * DEG;
const PASS_SPEED = 24, PASS_ANGLE = 18 * DEG, PASS_RANGE = 50;
const STEAL_R = 1.7, GRACE = 0.8;
const CALL_TIME = 2.5;                         // after you call for a pass (X), your teammate looks for you this long
// Bots reach like you do: a loose core within BOT_REACH snaps to their hand, and the nearest chaser pulls it from your pull range.
const BOT_SPEED = 10.5, BOT_ACCEL = 14, BOT_THROW = 24, BOT_REACH = 3.2, BOT_SNATCH_R = 2.6;
const BOT_PULL_DELAY = { ROOKIE: 0.8, PRO: 0.5, LEGEND: 0.3 };

// ------------------------------------------------------------------ contact
const BUMP_BOUNCE = 0.9;                       // riders who touch bounce apart (stronger than version 4)
const RUCK_SPEED = 2.5;                        // fly into the carrier this fast (closing, m/s) and a RUCK forms
// RUCK: the tackler and the carrier lock up and wrestle. Teammates within RUCK_PULL_R are drawn in and bind (up to RUCK_MAX a side).
// Strength per rider: you = GRIP_BASE + GRIP_PER * (triggers and grips squeezed, 0-4); flutter the triggers to strip (+ up to STRIP_MAX)
// when your side doesn't have the core. The tug moves at RUCK_RATE per point of strength difference; +-1 wins; RUCK_TIME at most.
const RUCK_PULL_R = 6.5, RUCK_BIND_R = 2.4, RUCK_MAX = 4, RUCK_TIME = 5, RUCK_RATE = 0.42;
const GRIP_BASE = 0.5, GRIP_PER = 0.4, STRIP_MAX = 1.0;
const RUCK_HOLD = 0.3;                         // the side that has the core gets this much extra: you have to out-pull it, not just match it
const HOLD_GRIP = [1, 0.5, 0.25];              // chance a snatch works on you with 0, 1 or 2 grips squeezed while you carry
const FOUL_SPEED = 12, FOUL_BALL_R = 5;        // late hit: crashing this hard into a rival with the core nowhere near
// FIGHTS (longer and harder since 2026-11-21): land a punch on a rival who isn't carrying and you DUEL. Both start with DUEL_HP
// health; the first to run out is knocked out and sits in the penalty box for BIN_TIME seconds. Out of time (DUEL_TIME): whoever
// is DUEL_EDGE health ahead wins, otherwise it is a split and you both play on. Start one with the core further than
// DUEL_BALL_R away and BOTH of you go to the box.
// Your punch does PUNCH_DMG[0] at PUNCH_SPEED up to PUNCH_DMG[1] at PUNCH_FULL (glove speed, m/s); x HEAD_BONUS on the helmet;
// x COUNTER_BONUS for COUNTER_TIME after you block or dodge; x GUARD_CHIP when their guard is up; +STREAK_BONUS per hit in a row.
// The rival throws jabs (block with a glove in front of your face, or move your head) in combos, heavy swings (gold flash:
// you can only dodge those, a block takes half), and feints. Their timing per bot level: LEVELS[].punch.
const PUNCH_SPEED = 2.2, PUNCH_R = 1.5, DUEL_HP = 180, DUEL_TIME = 40, DUEL_EDGE = 20, DUEL_BALL_R = 12, BIN_TIME = 15;
const PUNCH_DMG = [5, 13], PUNCH_FULL = 5.5, HEAD_BONUS = 1.5, COUNTER_TIME = 1.2, COUNTER_BONUS = 1.8, GUARD_CHIP = 0.2, STREAK_BONUS = 0.08, STREAK_MAX = 3, PUNCH_COOL = 0.45;
// (Measured 2026-11-21 with tests/fight5-autoplay.js, PC punches every 0.57 s: a script that waits for the guard and blocks
// most punches wins in 10 to 22 s; one that never blocks or dodges LOSES to a PRO or LEGEND in about 12 s. After two clean hits
// the rival covers up (three for a rookie). Earlier numbers, DUEL_HP 100 and PUNCH_DMG [9, 24], ended fights in 3 s.)
const BOT_JAB = 14, BOT_HEAVY = 38, JAB_WIND = 0.42, HEAVY_WIND = 0.95, DODGE_DIST = 0.24, BLOCK_R = 0.42;

// ------------------------------------------------------------------ scoring
const POINTS = { hole: 1, deep: 3, penalty: 2, bank: 1, long: 1 };
const LONG_SHOT = 28, BANK_WINDOW = 2.5, PENALTY_TIME = 6;
// A match is first to the target, or most points when the clock runs out. Level at time: next score wins.
// (Bots-only matches score about 3.5 points a minute between both teams, so 11 is reachable in a close 6 minutes.)
const MATCHES = [{ secs: 180, target: 7, label: '3 MIN · FIRST TO 7' }, { secs: 360, target: 11, label: '6 MIN · FIRST TO 11' }, { secs: 600, target: 21, label: '10 MIN · FIRST TO 21' }];

// ------------------------------------------------------------------ aurora shards
// Shards of the aurora drift inside the field. Touch one and your whole team gets AURORA_TIME seconds of speed and strength.
const AURORA_EVERY = 7, AURORA_MAX = 4, AURORA_LIFE = 16, AURORA_TIME = 7, AURORA_SPEED = 1.22, AURORA_STRENGTH = 1.35, AURORA_R = 2.2;

// ------------------------------------------------------------------ bots
const LEVELS = [
  { name: 'ROOKIE', rating: 900, speed: 0.85, aim: 0.18, think: 0.45, grip: 0.9, dash: 0.25, punch: 1.5 },
  { name: 'PRO', rating: 1200, speed: 0.95, aim: 0.1, think: 0.3, grip: 1.2, dash: 0.5, punch: 1.15 },
  { name: 'LEGEND', rating: 1500, speed: 1.05, aim: 0.05, think: 0.2, grip: 1.5, dash: 0.8, punch: 0.9 }
];

// ------------------------------------------------------------------ coaching
const TIP_HINTS = {
  boost: { side: 'left', part: 'stick' }, steer: { side: 'left', part: 'stick' }, turn: { side: 'right', part: 'stick' }, grab: { side: 'right', part: 'trigger' },
  throw: { side: 'right', part: 'trigger' }, pass: { side: 'right', part: 'trigger' }, steal: { side: 'right', part: 'grip' }, ruck: { side: 'right', part: 'grip' },
  pause: { side: 'left', part: 'y' }, sight: { side: 'left', part: 'stick' }, penalty: { side: 'right', part: 'trigger' }, dash: { side: 'right', part: 'b' },
  zone: { side: 'left', part: 'stick' }, zcore: { side: 'right', part: 'trigger' },
  call: { side: 'left', part: 'x' }, rear: { side: 'right', part: 'stick' }, hold: { side: 'left', part: 'grip' }, punch: { side: 'right', part: 'grip' }, windows: { side: 'left', part: 'stick' }
};
const TIPS = {
  pause: ['Press Y any time to pause.', 'Press P any time to pause.'],
  steer: ['Point your hands where you want to fly, then push the left stick forward.', 'WASD flies where you look. E and Q go up and down.'],
  turn: ['Flick the right stick left or right to snap turn. A turns you all the way around.', 'L turns you all the way around.'],
  boost: ['Push the LEFT stick DOWN to boost. Keep it pushed to keep boosting.', 'Shift boosts. Hold it to keep boosting.'],
  dash: ['B dashes the way your left stick points. Dash sideways to cut in front of a runner.', 'R dashes the way you are moving.'],
  grab: ['Point at the CORE and hold the trigger to pull it into your hand.', 'Look at the CORE and hold G to pull it in.'],
  throw: ['Tap the trigger for a soft pass. HOLD it to charge a hard throw, then let go.', 'Tap Space for a soft throw, hold it to charge a hard one.'],
  pass: ['Point at a teammate when you let go and it becomes a pass.', 'F passes to your best open teammate.'],
  call: ['A teammate has the CORE: press X to call for it.', 'A teammate has the CORE: press C to call for it.'],
  hold: ['Carrying? Squeeze your GRIPS and rivals can\'t snatch it so easily.', ''],
  steal: ['A rival has the CORE: reach in and grip to snatch it, or fly into them to start a RUCK.', 'Fly into the rival carrying the CORE to start a RUCK.'],
  ruck: ['RUCK! Squeeze every trigger and grip to hold. Flutter the triggers to strip it. Teammates nearby bind on.', 'RUCK! Tap G fast.'],
  rear: ['Hold the RIGHT stick down to check behind you in the mirror.', 'Hold V to check behind you.'],
  windows: ['The windows are open: fly out into space and back in anywhere.', 'The windows are open: fly out into space and back in anywhere.'],
  sight: ['Hover in the SIGHT RING to see every rider through the walls.', 'Hover in the SIGHT RING to see every rider through the walls.'],
  punch: ['Make a fist (hold a GRIP) and swing it into a rival who isn\'t carrying: a FIGHT. Knock them out and they sit in the penalty box.', 'X throws a punch at a rival in reach.'],
  penalty: ['PENALTY: your free shot. Point at a round hole, hold the trigger, let go. 2 points.', 'PENALTY: your free shot. Look at a round hole and hold Space. 2 points.'],
  aurora: ['Fly through an AURORA SHARD: your whole team gets speed and strength.', 'Fly through an AURORA SHARD: your whole team gets speed and strength.'],
  // ZONE CONTROL
  zone: ['Fly into a RING and stay there. More BLUE riders than ORANGE inside, and it turns blue.', 'Fly into a RING and stay there. More BLUE riders than ORANGE inside, and it turns blue.'],
  zcore: ['Whoever carries the CORE counts as 3 riders in a ring. Go and get it.', 'Whoever carries the CORE counts as 3 riders in a ring. Go and get it.'],
  zscore: ['Every ring you hold pays points. The strip at the bottom of your view shows all five.', 'Every ring you hold pays points. Hold Tab for the score.']
};
// One rule on screen during every kickoff countdown, so the rules sink in without a manual.
const KICKOFF_TIPS = [
  'Lobby holes are 1. The DEEP GOAL is 3.', 'Bank it off a wall: +1. Score from 28 m: +1.', 'In a RUCK, squeeze everything. Flutter your triggers to strip.',
  'Teammates within 6 m get pulled into your ruck. Stay close.', 'B dashes. Dash sideways to cut a runner off.', 'X calls for a pass.',
  'Tap = soft pass. Hold = hard throw.', 'The windows are open. Space is a shortcut.', 'Aurora shards buff your whole team.',
  'Lose a fight and you sit in the penalty box.', 'Fighting far from the CORE sends you BOTH to the box.', 'Hold the right stick to check your mirror.'
];
