// Velora City — traffic cars that follow the road grid, and pedestrians who walk
// the sidewalks, cross at corners, and run when a car or a gunshot comes near.
import * as THREE from 'three';
import { WORLD, TUNE, clamp, dist2 } from './config.js';
import { Car, randomCarColor, randomCarType } from './vehicles.js';
import { makeHumanoid, animateWalk } from './people.js';

const SHIRTS = [0xe85c5c, 0x5c8ae8, 0x5ce88a, 0xe8d25c, 0xe85cb8, 0x8a5ce8, 0xdddddd, 0x333333];
const PANTS = [0x2c313a, 0x3a3a3a, 0x4a3a2a, 0x2a3a4a, 0x5a5a5a];
const SKINS = [0xd8a077, 0xc98d64, 0x8a5a3a, 0xe8b88a, 0x6b4423];
const HAIRS = [0x2a1c10, 0x111111, 0x6b4a1a, 0x888888, 0x3a2a1a];

class Pedestrian {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.mesh = makeHumanoid({
      shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)],
      pants: PANTS[Math.floor(rng() * PANTS.length)],
      skin: SKINS[Math.floor(rng() * SKINS.length)],
      hair: HAIRS[Math.floor(rng() * HAIRS.length)],
      scale: 0.94 + rng() * 0.12,
    });
    this.mesh.userData.hitRef = { kind: 'ped', ref: this };
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = rng() * Math.PI * 2;
    this.speed = TUNE.pedSpeed * (0.8 + rng() * 0.5);
    this.standing = true;
    this.downTimer = 0;
    this.fleeing = false;
    this.walkPhase = rng() * 6;
    this.respawn();
  }

  respawn() {
    // on a sidewalk, away from the player
    for (let tries = 0; tries < 20; tries++) {
      const s = WORLD.streets[Math.floor(this.rng() * WORLD.streets.length)];
      const t = (this.rng() * 2 - 1) * 175;
      const x = this.rng() < 0.5 ? s + WORLD.roadHalf + 2 : t;
      const z = this.rng() < 0.5 ? t : s + WORLD.roadHalf + 2;
      if (!this.city.isOnRoad(x, z)) {
        this.pos.set(x, 0, z);
        this.heading = this.rng() * Math.PI * 2;
        this.standing = true;
        this.mesh.visible = true;
        this.mesh.rotation.set(0, this.heading, 0);
        return;
      }
    }
    this.pos.set(0, 0, 100);
  }

  knockDown(fromCar) {
    if (!this.standing) return;
    this.standing = false;
    this.downTimer = 4;
    this.mesh.rotation.x = -Math.PI / 2; // lying on the ground
    this.mesh.position.y = 0.3;
  }

  update(dt, G) {
    if (!this.standing) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.mesh.visible = false;
        this.respawn();
      }
      return;
    }
    const px = G.player.pos.x, pz = G.player.pos.z;
    const dPlayer = dist2(this.pos.x, this.pos.z, px, pz);
    // flee a fast car, a nearby gunshot, or the player's car
    const playerCar = G.player.inCar;
    const threat = (playerCar && Math.abs(playerCar.speed) > 6 && dPlayer < 160)
      || (!playerCar && dPlayer < 4)
      || G.gunshotAt > 0 && dPlayer < 900;
    this.fleeing = threat;
    const speed = this.fleeing ? TUNE.pedFleeSpeed : this.speed;
    if (this.fleeing) {
      // run away from the player
      const away = Math.atan2(this.pos.x - px, this.pos.z - pz);
      this.heading += (away - this.heading) * Math.min(1, dt * 4);
    } else if (Math.random() < dt * 0.25) {
      // wander: sometimes turn at a corner
      this.heading += (this.rng() - 0.5) * 1.6;
    }
    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    // stay off the road centre and inside the city; bounce at the edges
    if (this.city.isOnRoad(this.pos.x, this.pos.z)) {
      this.heading += Math.PI * 0.5 * (this.rng() < 0.5 ? 1 : -1);
      this.pos.x += Math.sin(this.heading) * speed * dt * 2;
      this.pos.z += Math.cos(this.heading) * speed * dt * 2;
    }
    const b = WORLD.half - 4;
    if (Math.abs(this.pos.x) > b || Math.abs(this.pos.z) > b) this.heading += Math.PI;
    this.city.resolveCollision(this.pos, 0.5);
    this.walkPhase += dt * speed * 2.4;
    animateWalk(this.mesh, this.walkPhase, true);
    this.mesh.rotation.y = this.heading;
  }
}

class TrafficCar {
  constructor(scene, city, rng) {
    this.city = city;
    this.rng = rng;
    const p = city.randomRoadPoint(rng);
    const heading = p.axis === 'z' ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const type = randomCarType(rng);
    const color = type === 'taxi' ? 0xe8c33a : randomCarColor(rng);
    this.car = new Car(scene, color, p.x, p.z, heading, false, type);
    this.car.mesh.userData.hitRef = { kind: 'car', ref: this.car };
    this.targetSpeed = TUNE.trafficSpeed * (0.8 + rng() * 0.4);
    this.scene = scene;
  }

  get pos() { return this.car.pos; }
  get speed() { return this.car.speed; }
  set speed(v) { this.car.speed = v; }
  get heading() { return this.car.heading; }
  set heading(v) { this.car.heading = v; }
  get kind() { return this.car.kind; }
  set kind(v) { this.car.kind = v; }
  drive(dt, input, resolve) { this.car.drive(dt, input, resolve); }

  update(dt, G) {
    const car = this.car;
    if (car.kind === 'player' || car.kind === 'parked') return;
    // follow the road: aim at the next intersection, turn sometimes
    const fwd = car.forward();
    const near = this.city.nearestIntersection(car.pos.x, car.pos.z);
    const distToInter = Math.hypot(near.x - car.pos.x, near.z - car.pos.z);
    let desiredHeading = car.heading;
    if (distToInter < 8 && this.rng() < dt * 0.9) {
      // turn left or right at the intersection
      desiredHeading = car.heading + (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      this.turnTarget = desiredHeading;
    }
    if (this.turnTarget !== undefined) {
      let diff = this.turnTarget - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += clamp(diff, -1.6 * dt, 1.6 * dt);
      if (Math.abs(diff) < 0.05) this.turnTarget = undefined;
    }
    // slow for the car ahead
    let throttle = 0.55;
    for (const other of G.traffic.cars) {
      if (other === this) continue;
      const d2 = dist2(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
      if (d2 < 100) {
        const ox = other.pos.x - car.pos.x, oz = other.pos.z - car.pos.z;
        const dot = ox * fwd.x + oz * fwd.z;
        if (dot > 0 && d2 < 64) { throttle = -0.4; break; }
      }
    }
    // slow for the player's car ahead
    const pc = G.player.inCar;
    if (pc && pc !== car) {
      const d2 = dist2(car.pos.x, car.pos.z, pc.pos.x, pc.pos.z);
      if (d2 < 64) {
        const ox = pc.pos.x - car.pos.x, oz = pc.pos.z - car.pos.z;
        if (ox * fwd.x + oz * fwd.z > 0) throttle = -0.4;
      }
    }
    // keep to the target speed
    if (car.speed > this.targetSpeed) throttle = -0.3;
    car.drive(dt, { throttle, steer: 0 }, (p, r) => this.city.resolveCollision(p, r));
    // if pushed off the road, steer back toward the nearest intersection
    if (!this.city.isOnRoad(car.pos.x, car.pos.z) && this.turnTarget === undefined) {
      const n = this.city.nearestIntersection(car.pos.x, car.pos.z);
      this.turnTarget = Math.atan2(n.x - car.pos.x, n.z - car.pos.z);
    }
    // U-turn if it somehow left the city grid
    if (Math.abs(car.pos.x) > WORLD.half - 8 || Math.abs(car.pos.z) > WORLD.half - 8) {
      car.heading += Math.PI;
      car.pos.x = clamp(car.pos.x, -WORLD.half + 10, WORLD.half - 10);
      car.pos.z = clamp(car.pos.z, -WORLD.half + 10, WORLD.half - 10);
    }
  }
}

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = (() => {
      let a = seed >>> 0;
      return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    this.cars = [];
    this.peds = [];
    for (let i = 0; i < 10; i++) this.cars.push(new TrafficCar(scene, city, this.rng));
    for (let i = 0; i < 14; i++) this.peds.push(new Pedestrian(scene, city, this.rng));
  }

  // a fresh parked car near a point, for missions / shot staging
  spawnParkedCar(x, z, heading, color, type = 'sedan') {
    const car = new Car(this.scene, color ?? randomCarColor(this.rng), x, z, heading, false, type);
    car.kind = 'parked';
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    this.cars.push(car);
    return car;
  }

  update(dt, G) {
    for (const c of this.cars) {
      if (c.update) c.update(dt, G);
    }
    for (const p of this.peds) p.update(dt, G);
    // keep cars apart
    const all = this.cars.map((c) => c.car ?? c).filter((c) => c.alive && c.kind !== 'player');
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        Car.separate(all[i], all[j]);
      }
    }
  }
}
