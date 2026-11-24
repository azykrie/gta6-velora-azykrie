// Velora City — cars: built from several parts so they read as real cars, not boxes.
// A slanted-windshield cabin (extruded side profile), hood, grille, bumpers, lights and
// cylinder wheels; five types — sedan, SUV, taxi, police and a low, wide SPORT car
// with a spoiler. Geometry and materials are shared so the city stays cheap to draw.
import * as THREE from 'three';
import { TUNE, clamp } from './config.js';

const CAR_COLORS = [0xd83a3a, 0x3a7bd8, 0xe8c33a, 0x3ad86b, 0xe8e8e8, 0x222226, 0xd86b3a, 0x8a5cd8, 0x3ad8d8];
const SPORT_COLORS = [0xd81e2a, 0x1e6fd8, 0xffb400, 0xff5a1e, 0x222226];

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}

export function randomCarType(rng) {
  const r = rng();
  if (r < 0.45) return 'sedan';
  if (r < 0.65) return 'suv';
  if (r < 0.8) return 'taxi';
  return 'sport';
}

// Side profiles: [length, height] polygons, front is +x. The cabin profile is the
// slanted-windshield piece that sits on the lower body.
const PROFILES = {
  sedan: {
    body: [[-2.2, 0.22], [2.2, 0.22], [2.26, 0.5], [1.55, 0.62], [-1.55, 0.62], [-2.26, 0.5]],
    cabin: [[-1.5, 0.6], [1.3, 0.6], [0.85, 1.12], [-0.6, 1.16], [-1.5, 0.6]],
    width: 2.0, wheelR: 0.38, wheelY: 0.38, wheelX: 0.95, wheelZ: 1.45, topSpeedMul: 1.0,
  },
  suv: {
    body: [[-2.2, 0.25], [2.2, 0.25], [2.26, 0.78], [-2.26, 0.78]],
    cabin: [[-1.85, 0.76], [1.7, 0.76], [1.3, 1.52], [-1.2, 1.52], [-1.85, 0.76]],
    width: 2.05, wheelR: 0.46, wheelY: 0.46, wheelX: 0.98, wheelZ: 1.4, topSpeedMul: 0.95,
  },
  taxi: {
    body: [[-2.2, 0.22], [2.2, 0.22], [2.26, 0.5], [1.55, 0.62], [-1.55, 0.62], [-2.26, 0.5]],
    cabin: [[-1.5, 0.6], [1.3, 0.6], [0.85, 1.12], [-0.6, 1.16], [-1.5, 0.6]],
    width: 2.0, wheelR: 0.38, wheelY: 0.38, wheelX: 0.95, wheelZ: 1.45, topSpeedMul: 1.0,
  },
  sport: {
    body: [[-2.35, 0.16], [2.35, 0.16], [2.42, 0.4], [1.7, 0.5], [-1.7, 0.5], [-2.42, 0.4]],
    cabin: [[-1.35, 0.48], [1.15, 0.48], [0.65, 0.9], [-0.5, 0.94], [-1.35, 0.48]],
    width: 2.18, wheelR: 0.42, wheelY: 0.42, wheelX: 1.0, wheelZ: 1.5, topSpeedMul: 1.3,
  },
};

const geoCache = new Map();
function extrudeGeo(profile, width) {
  const key = JSON.stringify(profile) + '|' + width;
  if (geoCache.has(key)) return geoCache.get(key);
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i++) shape.lineTo(profile[i][0], profile[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2); // shape +x (length) becomes car forward +z
  geoCache.set(key, geo);
  return geo;
}

const matCache = new Map();
function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

const glassMat = new THREE.MeshLambertMaterial({ color: 0x182430 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd2 });
const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function makeCarMesh(color, type = 'sedan', isPolice = false) {
  const p = PROFILES[type] || PROFILES.sedan;
  const group = new THREE.Group();
  const paint = lambert(color);
  // lower body: extruded side profile with a real silhouette
  const body = new THREE.Mesh(extrudeGeo(p.body, p.width), paint);
  body.castShadow = true;
  group.add(body);
  // cabin: slanted windshield + roof in dark glass, slightly narrower
  const cabin = new THREE.Mesh(extrudeGeo(p.cabin, p.width - 0.24), glassMat);
  cabin.castShadow = true;
  group.add(cabin);
  // hood line + bumpers + grille
  group.add(box(p.width - 0.3, 0.1, 0.5, paint, 0, p.body[2][1] - 0.02, 1.95));
  group.add(box(p.width, 0.16, 0.18, darkMat, 0, 0.3, 2.24));
  group.add(box(p.width, 0.16, 0.18, darkMat, 0, 0.3, -2.24));
  group.add(box(1.1, 0.14, 0.06, darkMat, 0, 0.42, 2.27));
  // headlights and taillights
  for (const x of [-0.68, 0.68]) {
    const hl = box(0.42, 0.16, 0.08, headlightMat, x, 0.56, 2.26);
    hl.castShadow = false;
    group.add(hl);
    const tl = box(0.42, 0.16, 0.08, taillightMat, x, 0.56, -2.26);
    tl.castShadow = false;
    group.add(tl);
  }
  // side mirrors
  for (const x of [-1.06, 1.06]) {
    group.add(box(0.12, 0.12, 0.22, darkMat, x, 0.78, 0.95));
  }
  // wheels: cylinders with a hubcap disc
  const wheelGeo = new THREE.CylinderGeometry(p.wheelR, p.wheelR, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(p.wheelR * 0.55, p.wheelR * 0.55, 0.32, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const steerWheels = [];
  for (const [x, z, steer] of [
    [-p.wheelX, p.wheelZ, true], [p.wheelX, p.wheelZ, true],
    [-p.wheelX, -p.wheelZ, false], [p.wheelX, -p.wheelZ, false],
  ]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(x, p.wheelY, z);
    w.castShadow = true;
    group.add(w);
    const hub = new THREE.Mesh(hubGeo, chromeMat);
    hub.position.copy(w.position);
    group.add(hub);
    wheels.push(w);
    wheels.push(hub);
    if (steer) steerWheels.push(w);
  }
  if (type === 'sport') {
    // rear spoiler on two struts — the sport car's signature
    for (const x of [-0.7, 0.7]) {
      group.add(box(0.08, 0.22, 0.08, darkMat, x, 0.62, -2.15));
    }
    const wing = box(1.9, 0.07, 0.5, paint, 0, 0.78, -2.2);
    group.add(wing);
    // low front splitter
    group.add(box(p.width - 0.2, 0.1, 0.3, darkMat, 0, 0.16, 2.3));
  }
  if (type === 'taxi') {
    // roof sign
    const sign = box(0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: 0xfff2a8 }), 0, 1.28, -0.2);
    sign.castShadow = false;
    group.add(sign);
  }
  if (isPolice) {
    // light bar + white doors read as a patrol car at a glance
    group.add(box(1.1, 0.14, 0.5, darkMat, 0, 1.24, -0.2));
    const red = box(0.5, 0.14, 0.52, new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.28, 1.32, -0.2);
    red.castShadow = false;
    const blue = box(0.5, 0.14, 0.52, new THREE.MeshBasicMaterial({ color: 0x2244ff }), 0.28, 1.32, -0.2);
    blue.castShadow = false;
    group.add(red); group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  group.userData.wheels = wheels;
  group.userData.steerWheels = steerWheels;
  return group;
}

// Arcade car: position + heading + speed, with drift and building collision.
export class Car {
  constructor(scene, color, x, z, heading, isPolice = false, type = 'sedan') {
    this.type = type;
    this.topSpeedMul = (PROFILES[type] || PROFILES.sedan).topSpeedMul;
    this.mesh = makeCarMesh(color, type, isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPolice = isPolice;
    this.kind = isPolice ? 'police' : 'traffic';
    this.alive = true;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // input: {throttle: -1..1, steer: -1..1} — steer is -1 left, +1 right.
  drive(dt, input, resolveCollision) {
    const fwd = this.forward();
    const maxSpeed = TUNE.carMaxSpeed * this.topSpeedMul;
    // steering: sharper at low speed, gentler flat-out
    const steerTarget = input.steer * TUNE.carSteer * (1 - Math.min(Math.abs(this.speed) / maxSpeed, 0.6) * 0.55);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    if (input.throttle > 0) this.speed += TUNE.carAccel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed += TUNE.carBrake * input.throttle * dt;
      else this.speed -= TUNE.carReverse * -input.throttle * dt; // reversing
    }
    // drag + rolling resistance
    this.speed -= this.speed * 0.35 * dt;
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -TUNE.carMaxReverse, maxSpeed);
    // heading follows steering, scaled by speed (and reversed when reversing)
    this.heading += this.steer * (this.speed / 3.2) * dt * (this.speed >= 0 ? 1 : -1);
    this.pos.x += fwd.x * this.speed * dt;
    this.pos.z += fwd.z * this.speed * dt;
    if (resolveCollision) resolveCollision(this.pos, 2.2);
    // body roll: lean into steering, pitch on accel
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = -this.steer * Math.min(Math.abs(this.speed) / 12, 1) * 0.06;
    this.mesh.rotation.x = clamp(-input.throttle * 0.02, -0.03, 0.03);
    // wheels spin and steer
    const spin = (this.speed * dt) / 0.38;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    for (const w of this.mesh.userData.steerWheels) w.rotation.y = this.steer * 0.9;
  }

  // Soft push between two cars (circles), returns true if they touched.
  static separate(a, b, minDist = 3.4) {
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minDist * minDist || d2 < 0.0001) return false;
    const d = Math.sqrt(d2);
    const push = (minDist - d) / 2;
    const nx = dx / d, nz = dz / d;
    a.pos.x -= nx * push; a.pos.z -= nz * push;
    b.pos.x += nx * push; b.pos.z += nz * push;
    a.speed *= 0.94; b.speed *= 0.94;
    return true;
  }

  remove(scene) {
    scene.remove(this.mesh);
    this.alive = false;
  }
}
