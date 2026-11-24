// Velora City — the procedural city: streets, buildings, beach, pier and the Spire.
// Everything is generated from a seed, with canvas textures (no image files, no network).
import * as THREE from 'three';
import { WORLD, COLORS, createRng, clamp } from './config.js';

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A building face: lit and dark windows on a coloured facade.
function buildingTexture(base, lit) {
  return makeCanvas(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 12, cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const on = Math.random() < 0.42;
        g.fillStyle = on ? lit : '#20242c';
        g.fillRect(x * cw + 3, y * rh + 4, cw - 6, rh - 8);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 10, w, 10);
  });
}

function roadTexture() {
  const tex = makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#33363d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d3a8';
    g.fillRect(w / 2 - 2, 0, 4, 26); g.fillRect(w / 2 - 2, 64, 4, 26);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 200; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function textTexture(text, sub, bg, fg) {
  return makeCanvas(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) {
      g.font = '28px system-ui, sans-serif';
      g.fillText(sub, w / 2, h / 2 + 38);
    }
  });
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = createRng(seed);
    this.colliders = [];   // {minX,maxX,minZ,maxZ} building footprints
    this.group = new THREE.Group();
    scene.add(this.group);
    this.waterTex = null;
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildPier();
    this.buildStreetlights();
    this.buildTrees();
    this.buildBillboards();
  }

  addCollider(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  // Push a circle (x,z,radius) out of every building AABB it overlaps.
  resolveCollision(p, radius) {
    for (const c of this.colliders) {
      const cx = clamp(p.x, c.minX, c.maxX);
      const cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * radius;
          p.z = cz + (dz / d) * radius;
        } else {
          // dead centre inside: push out along the smallest penetration axis
          const pl = p.x - c.minX, pr = c.maxX - p.x, pt = p.z - c.minZ, pb = c.maxZ - p.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) p.x = c.minX - radius;
          else if (m === pr) p.x = c.maxX + radius;
          else if (m === pt) p.z = c.minZ - radius;
          else p.z = c.maxZ + radius;
        }
      }
    }
    const b = WORLD.half - 2;
    p.x = clamp(p.x, -b, b);
    p.z = clamp(p.z, -b, b + 64); // pier runs past the south edge
  }

  isOnRoad(x, z) {
    for (const s of WORLD.streets) {
      if (Math.abs(x - s) < WORLD.roadHalf + 1) return true;
      if (Math.abs(z - s) < WORLD.roadHalf + 1) return true;
    }
    return false;
  }

  buildGround() {
    const g = this.group;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
      new THREE.MeshLambertMaterial({ color: COLORS.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);
    // Beach: sand strip along the south edge.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half - WORLD.beachZ + 8),
      new THREE.MeshLambertMaterial({ color: COLORS.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.05, (WORLD.beachZ + WORLD.half) / 2 + 2);
    sand.receiveShadow = true;
    g.add(sand);
    // Ocean: animated texture plane beyond the beach.
    this.waterTex = makeCanvas(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2e7fa8'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        const y = Math.random() * h;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + 8, w * 0.6, y - 8, w, y);
        ctx.stroke();
      }
    });
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.repeat.set(10, 4);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.half * 2 + 400, 320),
      new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.waterTex }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, WORLD.waterZ + 160);
    g.add(water);
  }

  buildRoads() {
    const g = this.group;
    const tex = roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: tex });
    const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
    const len = WORLD.half * 2;
    for (const s of WORLD.streets) {
      for (const horizontal of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(len, WORLD.roadWidth), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.rotation.z = horizontal ? Math.PI / 2 : 0;
        road.position.set(horizontal ? s : 0, 0.08, horizontal ? 0 : s);
        road.receiveShadow = true;
        g.add(road);
        // sidewalks: two strips flanking the road
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), walkMat);
          walk.rotation.x = -Math.PI / 2;
          walk.rotation.z = horizontal ? Math.PI / 2 : 0;
          const off = WORLD.roadHalf + 1.5;
          walk.position.set(
            horizontal ? s + side * off : 0,
            0.09,
            horizontal ? 0 : s + side * off,
          );
          walk.receiveShadow = true;
          g.add(walk);
        }
      }
    }
    // Centre plaza around the Spire (0,0): warm paving.
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.block + 14, WORLD.block + 14),
      new THREE.MeshLambertMaterial({ color: 0xcbb28a }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.1, 0);
    plaza.receiveShadow = true;
    g.add(plaza);
  }

  buildBlocks() {
    const g = this.group;
    const rng = this.rng;
    const facades = [
      buildingTexture('#5a6b7d', '#ffd98a'),
      buildingTexture('#7d6a5a', '#ffe9b0'),
      buildingTexture('#4a5a6b', '#9fd8ff'),
      buildingTexture('#6b5a6b', '#ffb0c8'),
      buildingTexture('#3f4a3f', '#c8ffb0'),
    ];
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a38, emissive: 0x0a1a28 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const streets = WORLD.streets;
    for (let ix = 0; ix < streets.length - 1; ix++) {
      for (let iz = 0; iz < streets.length - 1; iz++) {
        const cx = (streets[ix] + streets[ix + 1]) / 2;
        const cz = (streets[iz] + streets[iz + 1]) / 2;
        if (cz > WORLD.beachZ - 30) continue; // beach blocks stay open
        if (Math.abs(cx) < 40 && Math.abs(cz) < 40) {
          if (ix === 3 && iz === 3) { this.buildSpire(cx, cz); continue; }
        }
        // 1–3 buildings per block, kept off the road edges.
        const count = 1 + Math.floor(rng() * 3);
        for (let b = 0; b < count; b++) {
          const w = 12 + rng() * 16;
          const d = 12 + rng() * 16;
          const h = 12 + rng() * rng() * 58;
          const bx = cx + (rng() - 0.5) * (WORLD.block - w - 6);
          const bz = cz + (rng() - 0.5) * (WORLD.block - d - 6);
          const mat = new THREE.MeshLambertMaterial({ map: facades[Math.floor(rng() * facades.length)] });
          const mesh = new THREE.Mesh(boxGeo, mat);
          mesh.scale.set(w, h, d);
          mesh.position.set(bx, h / 2, bz);
          mesh.castShadow = true; mesh.receiveShadow = true;
          g.add(mesh);
          const roof = new THREE.Mesh(boxGeo, roofMat);
          roof.scale.set(w * 0.5, 1.2, d * 0.5);
          roof.position.set(bx, h + 0.6, bz);
          g.add(roof);
          // a lit shopfront box at street level on some buildings
          if (rng() < 0.5) {
            const shop = new THREE.Mesh(boxGeo, glassMat);
            shop.scale.set(w * 0.7, 3, 1);
            shop.position.set(bx, 1.5, bz + d / 2 + 0.4);
            g.add(shop);
          }
          this.addCollider(bx, bz, w, d);
        }
      }
    }
  }

  buildSpire(cx, cz) {
    const g = this.group;
    // Velora Spire: the city's landmark tower, glass shaft + lit crown.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 13, 95, 12),
      new THREE.MeshLambertMaterial({ map: buildingTexture('#3a5a7d', '#ffe9b0') }),
    );
    shaft.position.set(cx, 47.5, cz);
    shaft.castShadow = true;
    g.add(shaft);
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 8, 14, 12),
      new THREE.MeshLambertMaterial({ color: 0xffd98a, emissive: 0x664400 }),
    );
    crown.position.set(cx, 102, cz);
    g.add(crown);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 12, 6),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    );
    tip.position.set(cx, 114, cz);
    g.add(tip);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 8.5),
      new THREE.MeshBasicMaterial({ map: textTexture('VELORA SPIRE', 'EST. 1962', '#16283a', '#ffd98a') }),
    );
    sign.position.set(cx, 62, cz + 13.5);
    g.add(sign);
    const sign2 = sign.clone();
    sign2.rotation.y = Math.PI;
    sign2.position.set(cx, 62, cz - 13.5);
    g.add(sign2);
    this.addCollider(cx, cz, 26, 26);
  }

  buildPier() {
    const g = this.group;
    const rng = this.rng;
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 70), wood);
    pier.position.set(40, 0.6, WORLD.waterZ + 32);
    pier.receiveShadow = true;
    g.add(pier);
    // posts
    const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 6);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6b4f30 });
    for (let z = WORLD.waterZ + 4; z < WORLD.waterZ + 66; z += 8) {
      for (const x of [35.5, 44.5]) {
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(x, -0.5, z);
        g.add(p);
      }
    }
    // shack at the end of the pier
    const shack = new THREE.Mesh(
      new THREE.BoxGeometry(8, 5, 7),
      new THREE.MeshLambertMaterial({ color: 0xd8b36a }),
    );
    shack.position.set(40, 3.1, WORLD.waterZ + 58);
    shack.castShadow = true;
    g.add(shack);
    const shackRoof = new THREE.Mesh(
      new THREE.ConeGeometry(6.5, 3, 4),
      new THREE.MeshLambertMaterial({ color: 0xa34d2d }),
    );
    shackRoof.position.set(40, 7, WORLD.waterZ + 58);
    shackRoof.rotation.y = Math.PI / 4;
    g.add(shackRoof);
    this.addCollider(40, WORLD.waterZ + 58, 9, 8);
    // beach umbrellas
    const umbMat = new THREE.MeshLambertMaterial({ color: 0xff7a5c });
    const umbMat2 = new THREE.MeshLambertMaterial({ color: 0x4dc8e8 });
    for (let i = 0; i < 8; i++) {
      const x = -200 + rng() * 380;
      const z = WORLD.beachZ + 8 + rng() * 18;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), postMat);
      pole.position.set(x, 1.5, z);
      g.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 8), i % 2 ? umbMat : umbMat2);
      top.position.set(x, 3.4, z);
      g.add(top);
    }
  }

  buildStreetlights() {
    const g = this.group;
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
    const lampGeo = new THREE.SphereGeometry(0.55, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const armGeo = new THREE.BoxGeometry(2.4, 0.18, 0.18);
    // one pole per intersection, on the block corner clear of both roads
    const positions = [];
    for (const sx of WORLD.streets) {
      for (const sz of WORLD.streets) {
        if (sz > WORLD.beachZ - 20) continue;
        positions.push([sx + WORLD.roadHalf + 2.2, sz + WORLD.roadHalf + 2.2]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, positions.length);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      m.makeTranslation(x, 3.5, z); poles.setMatrixAt(i, m);
      m.makeTranslation(x - 1.1, 7, z); lamps.setMatrixAt(i, m);
      m.makeTranslation(x - 1.1, 6.9, z); arms.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    g.add(poles); g.add(lamps); g.add(arms);
  }

  buildTrees() {
    const g = this.group;
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4f30 });
    const crownGeo = new THREE.ConeGeometry(2.6, 7, 7);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f7d44 });
    const spots = [];
    for (let i = 0; i < 90; i++) {
      const x = (rng() * 2 - 1) * (WORLD.half - 10);
      const z = (rng() * 2 - 1) * (WORLD.half - 10);
      if (this.isOnRoad(x, z) || z > WORLD.beachZ - 5) continue;
      let inside = false;
      for (const c of this.colliders) {
        if (x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3) { inside = true; break; }
      }
      if (!inside) spots.push([x, z]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 2, z); trunks.setMatrixAt(i, m);
      m.makeTranslation(x, 7, z); crowns.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    g.add(trunks); g.add(crowns);
  }

  buildBillboards() {
    const g = this.group;
    const boards = [
      { x: -90, z: -120, ry: 0, text: 'VELORA', sub: 'SUN • SEA • SPEED' },
      { x: 120, z: 60, ry: Math.PI / 2, text: 'SUNSET PIER', sub: 'FISH • FUN • FERRY' },
      { x: -60, z: 150, ry: Math.PI, text: 'TACO BAY', sub: 'OPEN ALL NIGHT' },
    ];
    for (const b of boards) {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(1, 12, 1),
        new THREE.MeshLambertMaterial({ color: 0x2c313a }),
      );
      pole.position.set(b.x, 6, b.z);
      g.add(pole);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 5.5),
        new THREE.MeshBasicMaterial({ map: textTexture(b.text, b.sub, '#e84d5c', '#ffffff') }),
      );
      board.position.set(b.x, 15, b.z);
      board.rotation.y = b.ry;
      g.add(board);
      const back = board.clone();
      back.rotation.y = b.ry + Math.PI;
      g.add(back);
    }
  }

  update(dt) {
    if (this.waterTex) this.waterTex.offset.y += dt * 0.02;
  }

  // A random point on a road, for spawning traffic.
  randomRoadPoint(rng) {
    const s = WORLD.streets[Math.floor(rng() * WORLD.streets.length)];
    const t = (rng() * 2 - 1) * 170;
    return Math.random() < 0.5 ? { x: s, z: t, axis: 'z' } : { x: t, z: s, axis: 'x' };
  }

  // Nearest intersection to a point (traffic turns here).
  nearestIntersection(x, z) {
    let bx = WORLD.streets[0], bz = WORLD.streets[0];
    for (const s of WORLD.streets) {
      if (Math.abs(s - x) < Math.abs(bx - x)) bx = s;
      if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
    }
    return { x: bx, z: bz };
  }
}
