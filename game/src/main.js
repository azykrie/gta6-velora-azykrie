// Velora City — boot and the one loop: fixed 1/60 s steps, a render every frame,
// and the screens in between (title, play, pause, busted, wasted, story done).
// ?shot=street|drive|chase|mission stages a scene instead of the title screen,
// steps the world forward, and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { WORLD, STORY, createRng } from './config.js';
import { City } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { SoundEngine } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

class Input {
  constructor() {
    this.keys = {};
    this._pressed = new Set();
    this.mouseDown = false;
    this.dragging = false;
    this.dragDX = 0; this.dragDY = 0;
    this._lastX = 0; this._lastY = 0;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this._pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; this.dragging = false; });
    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', (e) => {
      this.mouseDown = true;
      this.dragging = true;
      this._lastX = e.clientX; this._lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragDX += e.clientX - this._lastX;
      this.dragDY += e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
    const endDrag = () => { this.dragging = false; this.mouseDown = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }
  pressed(code) { return this._pressed.has(code); }
  endFrame() { this._pressed.clear(); this.mouseDown = false; }
}

const G = {
  state: 'title', // title | play | paused | busted | wasted | complete
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  gunshotAt: 0,
  stats: { carsStolen: 0, shotsFired: 0, shotsHit: 0, missionsDone: 0, cashFound: 0 },
};

function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xa8d0e6, 120, 520);
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  G.camera = camera;
  // sun + sky light
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
  G.city = new City(scene, seed);
  G.audio = new SoundEngine();
  G.input = new Input();
  G.hud = new HUD(G);
  G.police = new Police(scene, G.city);
  G.police.onWantedChange = (n, reason) => {
    if (n > 0) G.hud.showHint(`Wanted: ${'★'.repeat(n)} — ${reason}`);
  };
  G.missions = new Missions(scene, G.city);
  G.traffic = new Traffic(scene, G.city, seed + 11);
  G.player = new Player(scene, G.city, 0, 40);
  // save / load helpers on G
  G.saveGame = () => saveGame(G);
  G.onBusted = () => {
    G.state = 'busted';
    const fine = G.police.respawnPlayer(G, 0.2);
    G.hud.showEnd('BUSTED', `The Velora PD caught you. Fine: $${fine}. You wake up at St. Marina Hospital.`);
    G.audio.error();
  };
  G.onWasted = () => {
    G.state = 'wasted';
    const fine = G.police.respawnPlayer(G, 0.1);
    G.hud.showEnd('WASTED', `You got taken out. The hospital patched you up for $${fine}.`);
    G.audio.error();
  };
  G.onStoryComplete = () => {
    // the banner already says DEBT PAID; play continues as free roam
    G.state = 'play';
  };
  window.__game = G;
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function startPlay(fromSave) {
  G.audio.init();
  G.hud.hideStart();
  G.hud.hideEnd();
  G.state = 'play';
  if (fromSave) {
    const data = loadGame();
    if (data) {
      G.player.money = data.money;
      G.player.health = data.health || 100;
      G.player.pos.set(data.player.x, 0, data.player.z);
      G.player.heading = data.player.heading || 0;
      G.missions.index = Math.min(data.missionIndex || 0, 3);
      G.missions.doneCount = data.missionsDone || 0;
      G.missions.cashFound = data.cashFound || 0;
      Object.assign(G.stats, data.stats || {});
      G.hud.showBanner('Welcome back, Rex', 'Money and progress restored. Press M to start your next job.');
      G.hud.setObjective('Press M to start: ' + (G.missions.current?.title ?? 'Free roam'));
    }
  } else {
    G.hud.showBanner(STORY.title, STORY.intro);
    G.hud.setObjective('Press M to start: Job 1 — The Pickup');
  }
}

function togglePause() {
  if (G.state === 'play') {
    G.state = 'paused';
    G.hud.showPause(true);
    G.saveGame();
    G.audio.setEngine(0, false);
    G.audio.setSiren(false);
  } else if (G.state === 'paused') {
    G.state = 'play';
    G.hud.showPause(false);
  }
}

function wireUI() {
  document.getElementById('playBtn').addEventListener('click', () => startPlay(false));
  document.getElementById('continueBtn').addEventListener('click', () => startPlay(true));
  document.getElementById('resumeBtn').addEventListener('click', togglePause);
  document.getElementById('restartBtn').addEventListener('click', () => {
    location.reload();
  });
  document.getElementById('endBtn').addEventListener('click', () => {
    G.hud.hideEnd();
    G.state = 'play';
  });
  document.getElementById('helpBtn').addEventListener('click', () => G.hud.toggleHelp());
  // fill the start screen from the story
  document.getElementById('storyText').textContent = STORY.intro;
  const controls = document.getElementById('controlsList');
  controls.innerHTML = STORY.controls.map(([k, v]) => `<div><b>${k}</b> — ${v}</div>`).join('');
}

function fixedStep(dt) {
  const Gx = G;
  if (Gx.state !== 'play' || Gx.shotFrozen) return;
  Gx.gunshotAt = Math.max(0, Gx.gunshotAt - dt);
  Gx.city.update(dt);
  Gx.player.update(dt, Gx);
  Gx.traffic.update(dt, Gx);
  Gx.police.update(dt, Gx);
  Gx.missions.update(dt, Gx);
  Gx.hud.update(dt, Gx);
  // M starts / retries the current mission
  if (Gx.input.pressed('KeyM') && !Gx.missions.active && !Gx.missions.storyDone) {
    Gx.missions.startMission(Gx);
  }
  if (Gx.input.pressed('KeyP') || Gx.input.pressed('Escape')) togglePause();
  if (Gx.input.pressed('KeyH')) Gx.hud.toggleHelp();
  if (Gx.input.pressed('KeyM') && Gx.input.keys['ShiftLeft']) { /* reserved */ }
}

let last = performance.now();
let acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const frame = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += frame;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    fixedStep(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  G.renderer.render(G.scene, G.camera);
  G.input.endFrame();
}

// --- ?shot= staging: set up a scene, step it forward, freeze it, then flag readiness ---
// The freeze is what makes the screenshot deterministic: without it the world keeps
// running under the headless browser's virtual-time budget and the staged moment is lost.
function stageShot(mode) {
  G.hud.hideStart();
  G.state = 'play';
  const P = G.player;
  const park = (x, z, h, color, type = 'sedan') => G.traffic.spawnParkedCar(x, z, h, color, type);
  const enterParked = (car) => { P.nearCar = car; P.enterCar(G); };
  let steps = 120;
  if (mode === 'street') {
    // on foot ON the pier, facing the shack and the ocean
    P.pos.set(40, 1.1, 252);
    P.heading = 0;
    G.cameraYaw = Math.PI;
    G.cameraPitch = 0.34;
    G.hud.setObjective('Explore Velora on foot — press M to start Job 1');
    G.hud.showHint('Sunset Pier — the beach is south');
  } else if (mode === 'drive') {
    // cruising up the avenue, traffic ahead, a pedestrian on the sidewalk
    const car = park(-60, -120, 0, 0xd83a3a);
    enterParked(car);
    G.police.wanted = 0;
    car.speed = 16;
    park(-60, -55, 0, 0x3ad8d8);
    park(-57, -20, 0, 0xe8c33a);
    G.cameraYaw = Math.PI;
    G.cameraPitch = 0.26;
    steps = 90;
    G.hud.setObjective('Cruise Velora — steal any car with E');
  } else if (mode === 'chase') {
    // the cover: a roadblock ahead, a cop closing from behind, 5 stars — in a SPORT car
    const car = park(0, 60, 0, 0x1e6fd8, 'sport');
    enterParked(car);
    car.speed = 18;
    G.police.wanted = 3;
    G.missions.startMission(G, 3); // the getaway adds 2 more stars: 5 total
    G.police.spawnCopAt(0, 88, Math.PI);
    G.police.spawnCopAt(-7, 96, Math.PI);
    G.police.spawnCopAt(4, 28, 0);
    G.cameraYaw = Math.PI * 0.72; // front-side three-quarter view
    G.cameraPitch = 0.3;
    steps = 45;
  } else if (mode === 'mission') {
    // hot delivery: driving for the Spire, the beacon down the road, a cop behind — in a taxi
    const car = park(0, 90, Math.PI, 0xe8c33a, 'taxi');
    enterParked(car);
    car.speed = 15;
    G.missions.startMission(G, 1);
    G.police.spawnCopAt(4, 118, Math.PI);
    G.cameraYaw = 0;
    G.cameraPitch = 0.26;
    steps = 60;
  }
  // step the world so traffic, police and the beacon are alive in the shot
  for (let i = 0; i < steps; i++) fixedStep(STEP);
  // set a lively speedometer reading (the car coasts with no input while staging)
  if (P.inCar) {
    P.inCar.speed = mode === 'chase' ? 22 : 15;
    G.hud.update(0.1, G);
  }
  // freeze the world so the screenshot catches this exact frame
  G.shotFrozen = true;
  G.hud.el.banner.classList.remove('show');
  G.hud.el.hint.classList.remove('show');
  G.renderer.render(G.scene, G.camera);
  window.__shotReady = true;
  const statusEl = document.getElementById('status');
  if (statusEl) {
    const cp = G.camera.position;
    const pp = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    statusEl.textContent = 'SHOT_READY errors=' + window.__errors.length + ' ' + window.__errors.join(' | ')
      + ` cam=(${cp.x.toFixed(1)},${cp.y.toFixed(1)},${cp.z.toFixed(1)}) car=(${pp.x.toFixed(1)},${pp.z.toFixed(1)})`;
  }
}

buildWorld();
wireUI();
if (shot) {
  stageShot(shot);
} else {
  G.hud.showStart(hasSave());
}
requestAnimationFrame(loop);
