// Velora City — Rex Marlowe on foot: WASD + mouse camera, jumping, stealing cars,
// and a pistol. The camera is third-person and follows on foot and in a car.
import * as THREE from 'three';
import { TUNE, clamp, lerp, dist2 } from './config.js';
import { makeHumanoid, animateWalk } from './people.js';

export class Player {
  constructor(scene, city, x, z) {
    this.scene = scene;
    this.city = city;
    this.mesh = makeHumanoid({ shirt: 0x2a6db0, pants: 0x2c313a, hair: 0x2a1c10 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = 0;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.money = 250;
    this.inCar = null;      // Car object when driving
    this.nearCar = null;    // Car object in reach of E
    this.ammo = TUNE.magSize;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.hurtTimer = 0;     // seconds since last damage (regen gate)
    this.walkPhase = 0;
    this.muzzle = null;
    this.tracer = null;
    this.tracerLife = 0;
  }

  get speed() { return this.inCar ? Math.abs(this.inCar.speed) : 0; }

  damage(amount, G) {
    if (this.health <= 0) return;
    this.health -= amount;
    this.hurtTimer = 0;
    G.hud.flashDamage();
    G.audio.thud();
    if (this.health <= 0) {
      this.health = 0;
      G.onWasted();
    }
  }

  heal(dt) {
    this.hurtTimer += dt;
    if (this.hurtTimer > 6 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + TUNE.healthRegen * dt);
    }
  }

  update(dt, G) {
    const input = G.input;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = TUNE.magSize;
    }
    this.heal(dt);
    if (this.inCar) this.updateDriving(dt, G);
    else this.updateOnFoot(dt, G);
    this.updateCamera(dt, G);
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0 && this.tracer) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
  }

  updateOnFoot(dt, G) {
    const input = G.input;
    const camYaw = G.cameraYaw;
    let mx = 0, mz = 0;
    if (input.keys['KeyW']) mz += 1;
    if (input.keys['KeyS']) mz -= 1;
    if (input.keys['KeyD']) mx += 1;
    if (input.keys['KeyA']) mx -= 1;
    const len = Math.hypot(mx, mz);
    const run = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
    const speed = run ? TUNE.runSpeed : TUNE.walkSpeed;
    if (len > 0) {
      mx /= len; mz /= len;
      // camera-relative: forward is where the camera looks
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = -fz, rz = fx;
      const dx = fx * mz + rx * mx;
      const dz = fz * mz + rz * mx;
      this.pos.x += dx * speed * dt;
      this.pos.z += dz * speed * dt;
      this.heading = Math.atan2(dx, dz);
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.walkPhase = lerp(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, dt * 10);
    }
    // jump + gravity
    if (input.pressed('Space') && this.grounded) {
      this.vy = TUNE.jumpSpeed;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= TUNE.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    }
    this.city.resolveCollision(this.pos, 0.55);
    // walk cycle: arms and legs swing, torso bobs
    animateWalk(this.mesh, this.walkPhase, len > 0);
    this.mesh.rotation.y = this.heading;
    // nearest car for E
    this.nearCar = null;
    let best = 4.2;
    for (const car of G.traffic.cars) {
      if (car.kind === 'parked') continue;
      const d2 = dist2(this.pos.x, this.pos.z, car.pos.x, car.pos.z);
      if (d2 < best * best) { best = Math.sqrt(d2); this.nearCar = car; }
    }
    for (const car of G.police.cops) {
      const d2 = dist2(this.pos.x, this.pos.z, car.pos.x, car.pos.z);
      if (d2 < best * best) { best = Math.sqrt(d2); this.nearCar = car; }
    }
    if (this.nearCar && input.pressed('KeyE')) this.enterCar(G);
    // fire pistol on click
    if (input.mouseDown && this.fireCooldown <= 0 && this.reloading <= 0) this.fire(G);
    if (input.pressed('KeyR') && this.ammo < TUNE.magSize && this.reloading <= 0) {
      this.reloading = TUNE.reloadTime;
      G.audio.blip(300, 0.08);
    }
  }

  enterCar(G) {
    const car = this.nearCar;
    if (!car) return;
    car.kind = 'player';
    this.inCar = car;
    this.mesh.visible = false;
    G.audio.setEngine(0, true);
    G.audio.blip(520, 0.08);
    G.police.addWanted(1, 'car theft');
    G.stats.carsStolen++;
    G.hud.showHint('Driving — W/S accelerate & brake, A/D steer, E to get out');
  }

  exitCar(G) {
    const car = this.inCar;
    if (!car) return;
    // step out on the driver's side
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    this.city.resolveCollision(this.pos, 0.55);
    car.kind = 'parked';
    car.speed = 0;
    this.inCar = null;
    this.mesh.visible = true;
    this.heading = car.heading;
    G.audio.setEngine(0, false);
  }

  updateDriving(dt, G) {
    const input = G.input;
    const car = this.inCar;
    const throttle = (input.keys['KeyW'] ? 1 : 0) + (input.keys['KeyS'] ? -1 : 0);
    const steer = (input.keys['KeyA'] ? -1 : 0) + (input.keys['KeyD'] ? 1 : 0);
    car.drive(dt, { throttle, steer }, (p, r) => this.city.resolveCollision(p, r));
    G.audio.setEngine(Math.abs(car.speed) / TUNE.carMaxSpeed, true);
    if (input.pressed('KeyE')) this.exitCar(G);
    // handbrake skid
    if (input.keys['Space'] && Math.abs(car.speed) > 8) {
      car.speed *= 1 - 2.2 * dt;
      if (Math.random() < dt * 6) G.audio.skid();
    }
    // hitting a pedestrian while driving
    for (const ped of G.traffic.peds) {
      if (!ped.standing) continue;
      if (dist2(car.pos.x, car.pos.z, ped.pos.x, ped.pos.z) < 3.2 * 3.2 && Math.abs(car.speed) > 3) {
        ped.knockDown(car);
        G.police.addWanted(1, 'hit a pedestrian');
        G.audio.thud();
        car.speed *= 0.82;
      }
    }
    // hitting a traffic car
    for (const other of G.traffic.cars) {
      if (other === car || other.kind === 'player') continue;
      if (dist2(car.pos.x, car.pos.z, other.pos.x, other.pos.z) < 3.4 * 3.4) {
        other.speed *= 0.6;
        car.speed *= 0.9;
      }
    }
  }

  fire(G) {
    if (this.ammo <= 0) {
      this.reloading = TUNE.reloadTime;
      G.audio.error();
      return;
    }
    this.ammo--;
    this.fireCooldown = 0.16;
    G.audio.gunshot();
    // raycast from the camera through the crosshair
    const origin = new THREE.Vector3();
    G.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const targets = [];
    for (const ped of G.traffic.peds) if (ped.standing) targets.push({ obj: ped.mesh, ref: ped, kind: 'ped' });
    for (const car of G.traffic.cars) targets.push({ obj: car.mesh, ref: car, kind: 'car' });
    for (const cop of G.police.cops) targets.push({ obj: cop.mesh, ref: cop, kind: 'cop' });
    const ray = new THREE.Raycaster(origin, dir, 0.5, TUNE.pistolRange);
    const hits = ray.intersectObjects(targets.map((t) => t.obj), true);
    let end = origin.clone().addScaledVector(dir, TUNE.pistolRange);
    if (hits.length) {
      const hit = hits[0];
      end = hit.point.clone();
      let node = hit.object;
      while (node && !node.userData.hitRef) node = node.parent;
      const hitRef = node ? node.userData.hitRef : null;
      if (hitRef) {
        if (hitRef.kind === 'ped') {
          hitRef.ref.knockDown(null);
          G.police.addWanted(1, 'shot a pedestrian');
        } else if (hitRef.kind === 'car') {
          hitRef.ref.speed *= 0.5;
          G.police.addWanted(1, 'shot a car');
        } else if (hitRef.kind === 'cop') {
          G.police.damageCop(hitRef.ref, TUNE.pistolDamage);
        }
        G.stats.shotsHit++;
      }
    }
    G.stats.shotsFired++;
    // tracer line from the gun to the hit point
    const start = this.pos.clone();
    start.y = 1.3;
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    if (this.tracer) this.scene.remove(this.tracer);
    this.tracer = line;
    this.tracerLife = 0.07;
    // muzzle flash
    const flash = new THREE.PointLight(0xffc860, 12, 9);
    flash.position.copy(start);
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 50);
    // firing near police draws attention
    if (G.police.wanted < 1) G.police.addWanted(1, 'gunfire');
  }

  updateCamera(dt, G) {
    const input = G.input;
    // drag to look: pointer down + move rotates the camera yaw/pitch
    if (input.dragging) {
      G.cameraYaw -= input.dragDX * 0.0045;
      G.cameraPitch = clamp(G.cameraPitch + input.dragDY * 0.004, -0.15, 0.85);
      input.dragDX = 0; input.dragDY = 0;
    }
    // arrow keys also turn the camera
    if (input.keys['ArrowLeft']) G.cameraYaw += dt * 2.2;
    if (input.keys['ArrowRight']) G.cameraYaw -= dt * 2.2;
    if (input.keys['ArrowUp']) G.cameraPitch = clamp(G.cameraPitch - dt * 1.2, -0.15, 0.85);
    if (input.keys['ArrowDown']) G.cameraPitch = clamp(G.cameraPitch + dt * 1.2, -0.15, 0.85);
    const target = this.inCar ? this.inCar.pos : this.pos;
    const dist = this.inCar ? 11 : 7.5;
    const yaw = G.cameraYaw;
    const pitch = G.cameraPitch;
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + 2 + Math.sin(pitch) * dist + (this.inCar ? 1.5 : 0.5);
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cam = G.camera;
    cam.position.set(cx, Math.max(cy, 1.2), cz);
    cam.lookAt(target.x, target.y + 1.6, target.z);
    // keep the camera out of buildings: pull it in if the view is blocked
    // (cheap check: if the camera point is inside a building AABB, lift it)
    for (const c of this.city.colliders) {
      if (cam.position.x > c.minX && cam.position.x < c.maxX && cam.position.z > c.minZ && cam.position.z < c.maxZ) {
        cam.position.y += 6;
        break;
      }
    }
  }
}
