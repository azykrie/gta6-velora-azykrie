// Velora City — the story: four jobs to pay off Rex's $8,000 debt to Kessler.
// Each mission is a chain of steps with a beacon marker, a timer where it matters,
// and a cash reward. Plus 8 cash stashes hidden around the city for free roam.
import * as THREE from 'three';
import { TUNE } from './config.js';

const DEBT = 8000;

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Job 1 — The Pickup',
    intro: 'Kessler\'s man left a package at the end of Sunset Pier. Go get it. On foot or by car — your call.',
    reward: 500,
    steps: [
      { text: 'Go to the end of Sunset Pier', x: 40, z: 290, radius: 6, action: 'reach' },
      { text: 'Press E to pick up the package', x: 40, z: 290, radius: 6, action: 'press' },
    ],
  },
  {
    id: 'delivery',
    title: 'Job 2 — Hot Delivery',
    intro: 'The package goes to the Spire Plaza — and the cops just made you. Lose them or outrun them. 100 seconds.',
    reward: 1200,
    timeLimit: 100,
    onStart: (G) => G.police.addWanted(2, 'made during the delivery'),
    steps: [
      { text: 'Deliver the package to Velora Spire Plaza', x: 0, z: 0, radius: 12, action: 'reach' },
    ],
  },
  {
    id: 'cashdrops',
    title: 'Job 3 — Cash Drops',
    intro: 'Kessler hid three drops around Velora — the marina, the north gate, the beach. Collect them all. 150 seconds.',
    reward: 1500,
    timeLimit: 150,
    steps: [
      { text: 'Collect the drop at the marina', x: -180, z: 150, radius: 6, action: 'collect' },
      { text: 'Collect the drop at the north gate', x: 120, z: -180, radius: 6, action: 'collect' },
      { text: 'Collect the drop on the beach', x: -150, z: 218, radius: 6, action: 'collect' },
    ],
  },
  {
    id: 'getaway',
    title: 'Job 4 — The Getaway',
    intro: 'Last job. Kessler\'s crew tipped the cops — 3 stars and counting. Reach the safehouse in the east and the debt is done.',
    reward: 3000,
    onStart: (G) => G.police.addWanted(3, 'the getaway'),
    steps: [
      { text: 'Reach the safehouse — east side, past the billboards', x: 185, z: 60, radius: 10, action: 'reach' },
    ],
  },
];

const CASH_SPOTS = [
  [-150, -150], [150, -120], [-60, 60], [60, -60],
  [-180, 30], [180, -30], [-30, 180], [90, 150],
];

export class Missions {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.index = 0;          // current mission
    this.doneCount = 0;
    this.active = false;
    this.stepIndex = 0;
    this.timeLeft = 0;
    this.cashFound = 0;
    this.storyDone = false;
    this.beacon = null;
    this.markerRing = null;
    this.cashMeshes = [];
    this.buildCash();
  }

  get current() { return MISSIONS[this.index]; }
  get currentStep() {
    const m = this.current;
    return m && this.active ? m.steps[this.stepIndex] : null;
  }

  buildCash() {
    const geo = new THREE.BoxGeometry(0.9, 0.35, 0.6);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x0a4a1a });
    for (const [x, z] of CASH_SPOTS) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.6, z);
      mesh.rotation.y = Math.random() * Math.PI;
      this.scene.add(mesh);
      this.cashMeshes.push({ mesh, x, z, found: false });
    }
  }

  // a column of light + a ground ring marking the objective
  showBeacon(x, z, color = 0xffd23a) {
    this.hideBeacon();
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.set(x, 30, z);
    this.scene.add(this.beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.2, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    this.scene.add(ring);
    this.markerRing = ring;
    this.beaconX = x; this.beaconZ = z;
  }

  hideBeacon() {
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon.geometry.dispose(); this.beacon = null; }
    if (this.markerRing) { this.scene.remove(this.markerRing); this.markerRing.geometry.dispose(); this.markerRing = null; }
  }

  startMission(G, index = this.index) {
    const m = MISSIONS[index];
    if (!m) return false;
    this.index = index;
    this.active = true;
    this.stepIndex = 0;
    this.timeLeft = m.timeLimit || 0;
    if (m.onStart) m.onStart(G);
    this.showBeacon(m.steps[0].x, m.steps[0].z);
    G.hud.showBanner(m.title, m.intro);
    G.hud.setObjective(m.steps[0].text);
    G.audio.missionDone();
    return true;
  }

  failMission(G, why) {
    this.active = false;
    this.hideBeacon();
    G.hud.showBanner('Job failed', why + ' — press M to try again.');
    G.hud.setObjective('Press M to retry: ' + this.current.title);
    G.audio.error();
  }

  completeMission(G) {
    const m = this.current;
    this.active = false;
    this.doneCount++;
    this.hideBeacon();
    G.player.money += m.reward;
    G.stats.missionsDone++;
    G.audio.missionDone();
    if (this.index >= MISSIONS.length - 1) {
      this.storyDone = true;
      G.hud.showBanner('DEBT PAID', `You did it, Rex. $${DEBT} to Kessler, settled. Velora is yours now — free roam.`);
      G.hud.setObjective('Free roam — find the 8 cash stashes, or just drive.');
      G.police.clearWanted();
      G.onStoryComplete();
    } else {
      this.index++;
      const next = MISSIONS[this.index];
      G.hud.showBanner('Job done  +$' + m.reward, 'Next: ' + next.title + ' — press M when ready.');
      G.hud.setObjective('Press M to start: ' + next.title);
    }
    try { G.saveGame(); } catch { /* storage off */ }
  }

  update(dt, G) {
    const player = G.player;
    // cash stashes
    for (const c of this.cashMeshes) {
      if (c.found) continue;
      c.mesh.rotation.y += dt * 1.5;
      c.mesh.position.y = 0.6 + Math.sin(performance.now() * 0.003 + c.x) * 0.15;
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
      if (dx * dx + dz * dz < 2.4 * 2.4) {
        c.found = true;
        this.scene.remove(c.mesh);
        this.cashFound++;
        player.money += 150;
        G.stats.cashFound++;
        G.hud.showHint('Cash stash +$150');
        G.audio.cash();
      }
    }
    if (!this.active) return;
    const m = this.current;
    const step = this.currentStep;
    if (!step) return;
    // beacon pulse
    if (this.beacon) {
      this.beacon.material.opacity = 0.2 + Math.sin(performance.now() * 0.005) * 0.1;
      this.beacon.rotation.y += dt * 0.8;
    }
    if (m.timeLimit) {
      this.timeLeft -= dt;
      G.hud.setTimer(Math.max(0, this.timeLeft));
      if (this.timeLeft <= 0) {
        this.failMission(G, 'Out of time');
        return;
      }
    }
    const dx = player.pos.x - step.x, dz = player.pos.z - step.z;
    const dist = Math.hypot(dx, dz);
    if (step.action === 'reach' || step.action === 'collect') {
      if (dist < step.radius) this.advanceStep(G);
    } else if (step.action === 'press') {
      if (dist < step.radius) {
        G.hud.setObjective(step.text + '  [E]');
        if (G.input.pressed('KeyE')) this.advanceStep(G);
      }
    }
  }

  advanceStep(G) {
    const m = this.current;
    G.audio.pickup();
    this.stepIndex++;
    if (this.stepIndex >= m.steps.length) {
      this.completeMission(G);
    } else {
      const next = m.steps[this.stepIndex];
      this.showBeacon(next.x, next.z);
      G.hud.setObjective(next.text);
      G.hud.showHint(next.text);
    }
  }

  // minimap + HUD need the active marker
  get marker() {
    const s = this.currentStep;
    return s ? { x: s.x, z: s.z } : null;
  }
}
