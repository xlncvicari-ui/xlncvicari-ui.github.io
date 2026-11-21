// Version 5 levels. Each level is a list of box rooms: rooms that touch get a doorway between them automatically, walls get rows
// of OPEN windows, and js/world.js builds collisions, bot routes and meshes from that. Everything is written for the BLUE end (+z)
// and mirrored to the ORANGE end, so both teams always play the same shape.
//
// room: { id, x: [min, max], y: [min, max], z: [min, max], kind, m, faces, label }
//   m     = how it is copied: 'xz' four copies (left/right and both ends), 'x', 'z', 'p' (turned half round the middle), '' just one
//   kind  = which wall recipe from `kinds` (floor / ceil / side / end). A recipe is 'hull' (solid panels), 'field' (see-through
//           lattice, still solid), 'open' (no wall), or { mat, win: [window width, gap between, sill, head] } for open windows.
//   faces = overrides for single faces, e.g. { '+z': 'hull' }
// goals, lanes, spawn: given for blue's end; lanes are how BLUE attacks (toward -z): a point to fly through, then which goal.
const WIN = (w, gap, lo, hi, mat = 'field') => ({ mat, win: [w, gap, lo, hi] });

const THEMES = {
  // Meridian: cream panels, teal and amber light, an amber gas giant below. Warm retro space-opera colors.
  station: { hull: '#efe6d2', floor: '#3f6f86', field: '#8fe8ff', block: '#d9ceb6', decal: '#ffffff', strip: { white: '#fff3d6', mid: '#3dffb0', accent: '#ffb347' },
             sky: 'orbit', hemi: ['#fff1dc', '#3a5a6a', 1.25], sun: ['#ffd9a8', 1.25, [0.6, 0.5, -0.6]], aurora: ['#38ff9c', '#b46bff'] },
  // Neon Docks: night-blue hull, magenta and cyan neon, a ringed violet planet.
  neon: { hull: '#2a2f5c', floor: '#161a3a', field: '#ff5ad1', block: '#3b3f7a', decal: '#66ffff', strip: { white: '#66ffff', mid: '#ff5ad1', accent: '#ffe66b' },
          sky: 'neon', hemi: ['#b8c0ff', '#28204a', 1.35], sun: ['#ffc8f0', 0.9, [-0.5, 0.6, 0.5]], aurora: ['#66ffff', '#ff5ad1'] },
  // Foundry Works: rust and soot under a huge red sun, molten orange light.
  foundry: { hull: '#b5633c', floor: '#3a2a26', field: '#ffb347', block: '#6e3b28', decal: '#ffd23d', strip: { white: '#ffd9a0', mid: '#ff8a1f', accent: '#ffd23d' },
             sky: 'ember', hemi: ['#ffd0a8', '#3a1c14', 1.15], sun: ['#ff9a5a', 1.5, [0.2, 0.35, -0.9]], aurora: ['#ffd23d', '#ff4f2e'] },
  // The Backrooms: mono-yellow wallpaper, damp carpet, humming ceiling lights, and it never seems to end.
  backrooms: { hull: '#d9c877', floor: '#8a7a4a', field: '#f5efc0', block: '#cdbb68', decal: '#6e5f2e', strip: { white: '#fffbe0', mid: '#fff6b8', accent: '#fff6b8' },
               sky: 'void', hemi: ['#fff6c8', '#6a5a2a', 1.5], sun: ['#fff2c0', 0.35, [0.1, 1, 0.1]], fog: ['#b7a65a', 0.016], fogWalls: true, art: 'backrooms', hum: true, aurora: ['#fff6b8', '#ffe07a'] },
  // The Mirror Vault: black mirror panels and light edges inside a giant twelve-sided shell that repeats forever.
  mirror: { hull: '#9aa6c8', floor: '#8a94b8', field: '#6a5fd0', mirrors: true, block: '#b8c0e0', decal: '#c8b6ff', strip: { white: '#ffffff', mid: '#c8b6ff', accent: '#7ff6ff' },
            sky: 'prism', hemi: ['#dcd6ff', '#30284a', 1.2], sun: ['#ffffff', 0.9, [0.4, 0.8, 0.3]], shiny: true, aurora: ['#7ff6ff', '#c8b6ff'] }
};

const KINDS = {
  hall: { floor: 'hull', ceil: WIN(10, 6, 5, 5), side: WIN(8, 5, 3, 3), end: 'hull' },      // big rooms; end walls carry goals
  atrium: { floor: 'hull', ceil: WIN(8, 5, 4, 4), side: WIN(7, 5, 3, 3) },                   // big rooms open on every side
  corridor: { floor: 'hull', ceil: 'field', side: WIN(5, 4, 1.6, 1.6) },                     // see-through walls with open windows
  vault: { floor: 'hull', ceil: 'field', side: 'field' },                                    // see-through but closed (deep goals)
  office: { floor: 'hull', ceil: 'hull', side: 'hull', end: 'hull' }                         // solid everywhere (the Backrooms)
};

const LEVELS5 = [
  {
    id: 'meridian', name: 'MERIDIAN STATION', blurb: 'The classic. Lobby, flanks, loops, deep goal. The windows are open now.', theme: THEMES.station, kinds: KINDS, sym: 'xz',
    rooms: [
      { id: 'lobby', x: [-15, 15], y: [0, 18], z: [-44, 44], kind: 'hall', m: '', label: 'MERIDIAN' },
      { id: 'gate', x: [15, 45.5], y: [4.5, 13.5], z: [-4.5, 4.5], m: 'x', label: 'GATE' },
      { id: 'flank', x: [45.5, 54.5], y: [4.5, 13.5], z: [-59.5, 59.5], m: 'x', label: 'FLANK' },
      // the loop: four rooms round a block, with the short way sealed (yellow and black wall), so the deep goal is the long way round
      { id: 'loopA', x: [33.5, 57.5], y: [4.5, 13.5], z: [59.5, 68.5], kind: 'vault' },
      { id: 'loopB', x: [57.5, 66.5], y: [4.5, 13.5], z: [59.5, 83.5], kind: 'vault' },
      { id: 'loopC', x: [42.5, 66.5], y: [4.5, 13.5], z: [83.5, 92.5], kind: 'vault' },
      { id: 'loopD', x: [33.5, 42.5], y: [4.5, 13.5], z: [68.5, 92.5], kind: 'vault' },
      { id: 'back', x: [-33.5, 33.5], y: [4.5, 13.5], z: [71.5, 80.5], kind: 'vault', m: 'z', faces: { '+z': 'hull' }, label: 'DEEP' }
    ],
    seals: [['loopA', 'loopD']],
    goals: [{ kind: 'hole', c: [-9, 6, 44], n: [0, 0, -1] }, { kind: 'hole', c: [0, 12, 44], n: [0, 0, -1] }, { kind: 'hole', c: [9, 6, 44], n: [0, 0, -1] }, { kind: 'deep', c: [0, 9, 80.5], n: [0, 0, -1] }],
    lanes: [{ name: 'lobby', via: [0, 9, -20], goal: 'hole' }, { name: 'left flank', via: [-50, 9, -30], goal: 'deep' }, { name: 'right flank', via: [50, 9, -30], goal: 'deep' }, { name: 'outside', via: [26, 12, -30], goal: 'hole' }],
    bounds: [[-92, -16, -114], [92, 48, 114]], bin: { c: [0, 36, 0], s: [16, 5, 10] }, sight: [0, 9, 0], ball: [0, 9, 0], spawn: { c: [0, 9, 31], w: 22, h: 10 }
  },
  {
    id: 'docks', name: 'NEON DOCKS', blurb: 'A hub, two arms and a ring road. The deep goal is down in the vault under their chamber.', theme: THEMES.neon, kinds: KINDS, sym: 'xz',
    rooms: [
      { id: 'hub', x: [-12, 12], y: [0, 20], z: [-12, 12], kind: 'atrium', m: '', label: 'HUB' },
      { id: 'arm', x: [-7, 7], y: [4, 16], z: [12, 50], m: 'z', label: 'ARM' },
      { id: 'chamber', x: [-18, 18], y: [0, 20], z: [50, 64], kind: 'hall', m: 'z', label: 'DOCK' },
      { id: 'tube', x: [12, 40], y: [6, 14], z: [-4, 4], m: 'x' },
      { id: 'ring', x: [40, 48], y: [6, 14], z: [-64, 64], m: 'x', label: 'RING ROAD' },
      { id: 'link', x: [18, 40], y: [6, 14], z: [56, 64] },
      { id: 'vault', x: [-6, 6], y: [-10, 0], z: [52, 62], kind: 'vault', m: 'z', faces: { '-y': 'hull' } }
    ],
    goals: [{ kind: 'hole', c: [-10, 6, 64], n: [0, 0, -1] }, { kind: 'hole', c: [0, 13, 64], n: [0, 0, -1] }, { kind: 'hole', c: [10, 6, 64], n: [0, 0, -1] }, { kind: 'deep', c: [0, -10, 57], n: [0, 1, 0] }],
    lanes: [{ name: 'the arm', via: [0, 10, -30], goal: 'hole' }, { name: 'left ring road', via: [-44, 10, -40], goal: 'deep' }, { name: 'right ring road', via: [44, 10, -40], goal: 'deep' }, { name: 'the arm, then down', via: [0, 10, -40], goal: 'deep' }],
    bounds: [[-72, -24, -88], [72, 48, 88]], bin: { c: [0, 36, 0], s: [16, 5, 10] }, sight: [0, 10, 0], ball: [0, 10, 0], spawn: { c: [0, 10, 46], w: 26, h: 10 }
  },
  {
    id: 'foundry', name: 'FOUNDRY WORKS', blurb: 'A winding run through the works, a catwalk overhead, and the deep goal up the chimney.', theme: THEMES.foundry, kinds: KINDS, sym: 'p', point: true,
    rooms: [
      { id: 'furnace', x: [-20, 20], y: [0, 24], z: [-10, 10], kind: 'atrium', m: '', label: 'FURNACE' },
      { id: 'run1', x: [8, 16], y: [4, 12], z: [10, 22] },
      { id: 'run2', x: [-16, 16], y: [4, 12], z: [22, 30] },
      { id: 'run3', x: [-16, -8], y: [4, 12], z: [30, 38] },
      { id: 'run4', x: [-16, 16], y: [4, 12], z: [38, 46] },
      { id: 'yard', x: [-14, 14], y: [0, 16], z: [46, 60], kind: 'hall', label: 'YARD' },
      { id: 'catwalk', x: [20, 28], y: [10, 18], z: [-10, 60], label: 'CATWALK' },
      { id: 'ramp', x: [14, 20], y: [8, 16], z: [50, 58] },
      { id: 'chimney', x: [-5, 5], y: [16, 28], z: [48, 58], kind: 'vault', faces: { '+y': 'hull' } }
    ],
    goals: [{ kind: 'hole', c: [-8, 5, 60], n: [0, 0, -1] }, { kind: 'hole', c: [0, 11, 60], n: [0, 0, -1] }, { kind: 'hole', c: [8, 5, 60], n: [0, 0, -1] }, { kind: 'deep', c: [0, 28, 53], n: [0, -1, 0] }],
    lanes: [{ name: 'the run', via: [12, 8, -34], goal: 'hole' }, { name: 'the catwalk', via: [-24, 14, -30], goal: 'deep' }, { name: 'outside', via: [34, 20, -40], goal: 'hole' }, { name: 'the run, then up', via: [0, 8, -42], goal: 'deep' }],
    bounds: [[-62, -14, -84], [62, 50, 84]], bin: { c: [0, 40, 0], s: [16, 5, 10] }, sight: [0, 12, 0], ball: [0, 12, 0], spawn: { c: [0, 8, 53], w: 22, h: 10 }
  },
  {
    id: 'backrooms', name: 'THE BACKROOMS', blurb: 'Low ceilings, yellow walls, a hum you can\'t place. Solid walls here: use the sight ring.', theme: THEMES.backrooms, kinds: KINDS, sym: 'p', point: true, exterior: false, neutral: true,
    rooms: [
      { id: 'floor0', x: [-30, 30], y: [0, 7], z: [-54, 54], kind: 'office', m: '', label: 'LEVEL 0' },
      { id: 'alcove', x: [30, 40], y: [0, 7], z: [38, 50], kind: 'office' }
    ],
    blocks: [
      ...[8, 20, 32, 44].flatMap(z => [-18, -6, 6, 18].map(x => ({ c: [x, 3.5, z], s: [2, 7, 2] }))),
      { c: [-12, 3.5, 14], s: [10, 7, 0.7] }, { c: [14, 3.5, 26], s: [12, 7, 0.7] }, { c: [-2, 3.5, 38], s: [14, 7, 0.7] }, { c: [24, 3.5, 31], s: [0.7, 7, 9] }, { c: [-24, 3.5, 12], s: [0.7, 7, 8] }
    ],
    goals: [{ kind: 'hole', c: [-12, 3.5, 54], n: [0, 0, -1], r: 1.5 }, { kind: 'hole', c: [0, 3.5, 54], n: [0, 0, -1], r: 1.5 }, { kind: 'hole', c: [12, 3.5, 54], n: [0, 0, -1], r: 1.5 }, { kind: 'deep', c: [40, 3.5, 44], n: [-1, 0, 0], r: 1.8 }],
    lanes: [{ name: 'the left wall', via: [-22, 3.5, -22], goal: 'hole' }, { name: 'the right wall', via: [22, 3.5, -22], goal: 'hole' }, { name: 'the alcove', via: [-22, 3.5, -36], goal: 'deep' }, { name: 'the middle', via: [0, 3.5, -26], goal: 'hole' }],
    bounds: [[-41, -0.4, -55], [41, 7.4, 55]], bin: { c: [-25.5, 3.5, 0], s: [8, 6, 12] }, sight: [0, 3.5, 0], ball: [0, 3.5, 0], spawn: { c: [0, 3.5, 47], w: 44, h: 3 }
  },
  {
    id: 'vault', name: 'THE MIRROR VAULT', blurb: 'A cross of tunnels inside a mirrored shell. Go up the shaft for the deep goal.', theme: THEMES.mirror, kinds: KINDS, sym: 'xz',
    rooms: [
      { id: 'core', x: [-10, 10], y: [4, 24], z: [-10, 10], kind: 'atrium', m: '', label: 'CORE' },
      { id: 'ztube', x: [-4, 4], y: [10, 18], z: [10, 34], m: 'z' },
      { id: 'endroom', x: [-14, 14], y: [4, 24], z: [34, 48], kind: 'hall', m: 'z', label: 'NARTHEX' },
      { id: 'xtube', x: [10, 30], y: [10, 18], z: [-4, 4], m: 'x' },
      { id: 'wing', x: [30, 42], y: [4, 24], z: [-12, 12], kind: 'atrium', m: 'x', label: 'WING' },
      { id: 'gallery', x: [32, 40], y: [10, 18], z: [12, 44] },
      { id: 'cross', x: [14, 32], y: [10, 18], z: [36, 44] },
      { id: 'shaft', x: [-4, 4], y: [24, 36], z: [-4, 4], kind: 'vault', m: '' },
      { id: 'crown', x: [-10, 10], y: [36, 46], z: [-22, 22], kind: 'vault', m: '', faces: { '+z': 'hull', '-z': 'hull' }, label: 'CROWN' }
    ],
    goals: [{ kind: 'hole', c: [-8, 9, 48], n: [0, 0, -1] }, { kind: 'hole', c: [0, 17, 48], n: [0, 0, -1] }, { kind: 'hole', c: [8, 9, 48], n: [0, 0, -1] }, { kind: 'deep', c: [0, 41, 22], n: [0, 0, -1] }],
    lanes: [{ name: 'the nave', via: [0, 14, -22], goal: 'hole' }, { name: 'the wing', via: [36, 14, -28], goal: 'hole' }, { name: 'up the shaft', via: [0, 41, 0], goal: 'deep' }, { name: 'the other wing', via: [-36, 14, -28], goal: 'hole' }],
    bounds: [[-60, -10, -66], [60, 64, 66]], bin: { c: [0, 56, 0], s: [14, 5, 9] }, sight: [0, 14, 0], ball: [0, 14, 0], spawn: { c: [0, 14, 41], w: 22, h: 12 }
  }
];
