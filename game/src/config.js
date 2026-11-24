// Velora City — shared constants and tuning.
// A sun-soaked coastal city, original in every name, place and face.
export const WORLD = {
  half: 240,            // city extends -240..240 on x and z
  roadEvery: 60,        // street spacing
  roadWidth: 14,
  roadHalf: 7,
  block: 46,            // block size between roads
  beachZ: 205,          // sand starts here (south edge)
  waterZ: 238,          // ocean starts here
  streets: [-180, -120, -60, 0, 60, 120, 180], // road centre lines, both axes
};

export const COLORS = {
  sky: 0x8ec9e8,
  fog: 0xa8d0e6,
  sun: 0xfff2d0,
  asphalt: 0x33363d,
  asphaltLine: 0xd8d3a8,
  sidewalk: 0xb9b3a4,
  ground: 0x7d9b6a,
  sand: 0xe8d29a,
  water: 0x2e7fa8,
  buildingGlass: 0x9fc4d8,
};

export const TUNE = {
  walkSpeed: 6.5,
  runSpeed: 10,
  jumpSpeed: 7,
  gravity: 22,
  carAccel: 14,
  carBrake: 26,
  carReverse: 8,
  carMaxSpeed: 30,
  carMaxReverse: 10,
  carSteer: 0.55,       // radians at standstill scale
  carGrip: 0.92,        // lateral velocity kept per second (drift)
  trafficSpeed: 9,
  pedSpeed: 1.6,
  pedFleeSpeed: 4.2,
  pistolRange: 70,
  pistolDamage: 34,
  magSize: 12,
  reloadTime: 1.1,
  wantedDecaySec: 25,
  policeTopSpeed: 17,
  bustOnFootSec: 2.5,
  bustInCarSec: 3.0,
  healthRegen: 2.5,     // per second, out of combat
};

export const STORY = {
  title: 'VELORA CITY',
  tagline: 'Sun, sea, and one very bad debt.',
  intro:
    'You are Rex Marlowe, a wheelman who owes $8,000 to Kessler, the man who owns half of Velora. ' +
    'Four jobs stand between you and a clean slate. Steal a car, mind the cops, and get it done.',
  controls: [
    ['W A S D', 'Move / drive'],
    ['Mouse drag', 'Look around'],
    ['Shift', 'Sprint'],
    ['Space', 'Jump'],
    ['E', 'Enter / exit car'],
    ['Click', 'Fire pistol'],
    ['R', 'Reload'],
    ['M', 'Start / retry mission'],
    ['P / Esc', 'Pause'],
    ['H', 'Toggle help'],
  ],
};

// Mulberry32 — small deterministic RNG so ?shot= scenes stage identically.
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
