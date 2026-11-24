// Velora City — the wanted system and the Velora PD: patrol cars that chase,
// ram, and bust you, with stars that rise with your crimes and fade when you lay low.
import * as THREE from 'three';
import { WORLD, TUNE, clamp, dist2 } from './config.js';
import { Car } from './vehicles.js';

const COPS_FOR_STARS = [0, 1, 2, 3, 4, 6];
const HOSPITAL = { x: -180, z: -180 }; // respawn point: St. Marina Hospital, north-west

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.cops = [];
    this.crimeTimer = 0;      // time since the last crime
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.flashTimer = 0;
    this.spawnTimer = 0;
  }

  addWanted(n, reason) {
    if (this.wanted >= 5) return;
    const before = this.wanted;
    this.wanted = Math.min(5, this.wanted + n);
    this.crimeTimer = 0;
    this.decayTimer = 0;
    if (this.wanted > before) {
      // the HUD flashes the new star count; the reason is logged for the player
      if (this.onWantedChange) this.onWantedChange(this.wanted, reason);
    }
  }

  clearWanted() {
    this.wanted = 0;
    this.bustTimer = 0;
  }

  damageCop(cop, dmg) {
    cop.hp -= dmg;
    if (cop.hp <= 0) {
      // the cop car is wrecked: smoke, spin, then it is towed away
      cop.wrecked = true;
      cop.wreckTimer = 2.5;
      this.addWanted(1, 'wrecked a police car');
    }
  }

  spawnCopAt(x, z, heading) {
    // place a patrol car at an exact spot (used to stage the chase screenshot)
    const car = new Car(this.scene, 0x1a1a22, x, z, heading, true);
    car.kind = 'police';
    car.hp = 100;
    car.wrecked = false;
    car.mesh.userData.hitRef = { kind: 'cop', ref: car };
    this.cops.push(car);
    return car;
  }

  spawnCop(G) {
    // appear on a road at the map edge, roughly toward the player
    const p = G.player.pos;
    const edge = Math.floor(Math.random() * 4);
    let x, z;
    if (edge === 0) { x = -180; z = p.z + (Math.random() - 0.5) * 120; }
    else if (edge === 1) { x = 180; z = p.z + (Math.random() - 0.5) * 120; }
    else if (edge === 2) { z = -180; x = p.x + (Math.random() - 0.5) * 120; }
    else { z = 180; x = p.x + (Math.random() - 0.5) * 120; }
    x = clamp(x, -180, 180); z = clamp(z, -180, 180);
    const heading = Math.atan2(p.x - x, p.z - z);
    const car = new Car(this.scene, 0x1a1a22, x, z, heading, true);
    car.kind = 'police';
    car.hp = 100;
    car.wrecked = false;
    car.mesh.userData.hitRef = { kind: 'cop', ref: car };
    this.cops.push(car);
    return car;
  }

  update(dt, G) {
    const player = G.player;
    this.crimeTimer += dt;
    // wanted fades when you lay low: no crime for a while, no cop close by
    if (this.wanted > 0 && this.crimeTimer > TUNE.wantedDecaySec) {
      let nearest = Infinity;
      for (const cop of this.cops) {
        nearest = Math.min(nearest, dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z));
      }
      if (nearest > 1600) { // 40 units away
        this.decayTimer += dt;
        if (this.decayTimer > 4) {
          this.wanted--;
          this.decayTimer = 0;
          this.crimeTimer = 0;
          if (this.onWantedChange) this.onWantedChange(this.wanted, 'laying low');
        }
      }
    }
    // keep the right number of cops on the street
    const want = COPS_FOR_STARS[this.wanted];
    this.spawnTimer -= dt;
    if (this.cops.length < want && this.spawnTimer <= 0) {
      this.spawnCop(G);
      this.spawnTimer = 1.2;
    }
    // siren while any cop is active
    G.audio.setSiren(this.cops.length > 0 && this.wanted > 0);
    // light bar flash
    this.flashTimer += dt;
    const flashOn = Math.floor(this.flashTimer * 6) % 2 === 0;
    for (const cop of this.cops) {
      if (cop.mesh.userData.lightRed) {
        cop.mesh.userData.lightRed.material.color.setHex(flashOn ? 0xff2222 : 0x550000);
        cop.mesh.userData.lightBlue.material.color.setHex(flashOn ? 0x000055 : 0x2244ff);
      }
    }
    // pursuit
    const target = player.inCar ? player.inCar.pos : player.pos;
    const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : 0;
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      if (cop.wrecked) {
        cop.wreckTimer -= dt;
        cop.speed *= 1 - 3 * dt;
        cop.heading += dt * 2;
        cop.drive(dt, { throttle: 0, steer: 0 }, (p, r) => this.city.resolveCollision(p, r));
        if (cop.wreckTimer <= 0) {
          cop.remove(this.scene);
          this.cops.splice(i, 1);
        }
        continue;
      }
      // steer toward the player, with a little prediction
      const px = target.x + (player.inCar ? Math.sin(player.inCar.heading) * player.inCar.speed * 0.4 : 0);
      const pz = target.z + (player.inCar ? Math.cos(player.inCar.heading) * player.inCar.speed * 0.4 : 0);
      const wantHeading = Math.atan2(px - cop.pos.x, pz - cop.pos.z);
      let diff = wantHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.4, -1, 1);
      const topSpeed = Math.min(TUNE.policeTopSpeed, 11 + this.wanted * 1.2 + playerSpeed * 0.25);
      const throttle = cop.speed < topSpeed ? 0.9 : 0.25;
      cop.drive(dt, { throttle, steer }, (p, r) => this.city.resolveCollision(p, r));
      // ram: on contact, damage the player (or their car) and shove them
      const d2 = dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);
      if (d2 < 3.6 * 3.6) {
        if (player.inCar) {
          player.inCar.speed *= 0.86;
          if (Math.random() < dt * 2) player.damage(4, G);
        } else {
          player.damage(14 * dt * 4, G);
          // knock the player away from the cop
          const nx = player.pos.x - cop.pos.x, nz = player.pos.z - cop.pos.z;
          const d = Math.hypot(nx, nz) || 1;
          player.pos.x += (nx / d) * 6 * dt;
          player.pos.z += (nz / d) * 6 * dt;
        }
      }
      // despawn cops that fell far behind when the heat is off
      if (this.wanted === 0 && d2 > 90 * 90) {
        cop.remove(this.scene);
        this.cops.splice(i, 1);
      }
    }
    // separation between cops
    for (let i = 0; i < this.cops.length; i++) {
      for (let j = i + 1; j < this.cops.length; j++) Car.separate(this.cops[i], this.cops[j]);
    }
    // bust: caught standing still near a cop
    if (this.wanted > 0) {
      let near = false;
      for (const cop of this.cops) {
        if (dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z) < 36) { near = true; break; }
      }
      const still = player.inCar ? playerSpeed < 0.6 : true;
      if (near && still) {
        this.bustTimer += dt;
        if (this.bustTimer > (player.inCar ? TUNE.bustInCarSec : TUNE.bustOnFootSec)) {
          this.bustTimer = 0;
          G.onBusted();
        }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
    }
  }

  // after a bust or a wasted: wake up at the hospital, lighter in the pocket
  respawnPlayer(G, fineFraction) {
    const player = G.player;
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      player.mesh.visible = true;
      car.kind = 'parked';
      car.speed = 0;
    }
    player.pos.set(HOSPITAL.x, 0, HOSPITAL.z);
    player.heading = 0;
    player.health = 100;
    const fine = Math.min(player.money, Math.max(50, Math.floor(player.money * fineFraction)));
    player.money -= fine;
    this.clearWanted();
    for (const cop of this.cops) cop.remove(this.scene);
    this.cops = [];
    G.audio.setEngine(0, false);
    G.audio.setSiren(false);
    return fine;
  }
}
