// Velora City — the HUD: wanted stars, health, money, speed, objective text,
// a canvas minimap, banners, and the title / pause / busted screens (all DOM).
import { WORLD } from './config.js';

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = {};
    for (const id of ['stars', 'healthFill', 'healthText', 'money', 'speed', 'objective',
      'timer', 'banner', 'bannerTitle', 'bannerSub', 'hint', 'crosshair', 'vignette',
      'minimap', 'startScreen', 'pauseScreen', 'endScreen', 'endTitle', 'endText',
      'helpPanel', 'prompt', 'ammo']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.bannerTimer = 0;
    this.hintTimer = 0;
    this.mapTimer = 0;
  }

  setStars(n) {
    const el = this.el.stars;
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="${i < n ? 'on' : ''}">★</span>`;
    }
    if (el.dataset.n !== String(n)) {
      el.innerHTML = html;
      el.dataset.n = String(n);
      el.classList.toggle('hot', n >= 3);
    }
  }

  setHealth(h) {
    this.el.healthFill.style.width = Math.max(0, h) + '%';
    this.el.healthText.textContent = Math.ceil(h);
    this.el.healthFill.classList.toggle('low', h < 30);
  }

  setMoney(m) { this.el.money.textContent = '$' + Math.round(m).toLocaleString('en-US'); }
  setSpeed(kmh) { this.el.speed.textContent = Math.round(kmh); }
  setAmmo(ammo, mag, reloading) {
    this.el.ammo.textContent = reloading ? 'RELOADING…' : `AMMO ${ammo} / ${mag}`;
  }
  setObjective(text) { this.el.objective.textContent = text; }
  setTimer(sec) {
    this.el.timer.textContent = sec > 0 ? '⏱ ' + Math.ceil(sec) + 's' : '';
  }

  showBanner(title, sub = '') {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerTimer = 4;
  }

  showHint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    this.hintTimer = 3;
  }

  showPrompt(text) {
    if (!text) { this.el.prompt.textContent = ''; this.el.prompt.classList.remove('show'); return; }
    this.el.prompt.textContent = text;
    this.el.prompt.classList.add('show');
  }

  flashDamage() {
    this.el.vignette.classList.add('hit');
    setTimeout(() => this.el.vignette.classList.remove('hit'), 180);
  }

  setCrosshair(on) { this.el.crosshair.style.display = on ? 'block' : 'none'; }

  showStart(hasSave) {
    this.el.startScreen.classList.remove('hidden');
    document.getElementById('continueBtn').style.display = hasSave ? 'inline-block' : 'none';
  }
  hideStart() { this.el.startScreen.classList.add('hidden'); }
  showPause(on) { this.el.pauseScreen.classList.toggle('hidden', !on); }
  showEnd(title, text) {
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = text;
    this.el.endScreen.classList.remove('hidden');
  }
  hideEnd() { this.el.endScreen.classList.add('hidden'); }
  toggleHelp() { this.el.helpPanel.classList.toggle('hidden'); }

  update(dt, G) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove('show');
    }
    this.setStars(G.police.wanted);
    this.setHealth(G.player.health);
    this.setMoney(G.player.money);
    const kmh = (G.player.inCar ? Math.abs(G.player.inCar.speed) : 0) * 3.6;
    this.setSpeed(kmh);
    this.setAmmo(G.player.ammo, 12, G.player.reloading > 0);
    this.setCrosshair(!G.player.inCar && G.state === 'play');
    // prompt: enter a nearby car
    if (G.state === 'play' && !G.player.inCar && G.player.nearCar) {
      this.showPrompt('Press E to steal this car');
    } else if (G.state === 'play' && G.player.inCar) {
      this.showPrompt('E — get out    •    Space — handbrake');
    } else {
      this.showPrompt('');
    }
    // minimap, throttled to 10 Hz
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      this.drawMinimap(G);
    }
  }

  drawMinimap(G) {
    const ctx = this.mapCtx;
    const S = 180, half = WORLD.half;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(20, 32, 40, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // beach + water (south edge is the bottom of the map)
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, ((WORLD.beachZ + half) / (half * 2)) * S, S, S);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, ((WORLD.waterZ + half) / (half * 2)) * S, S, S);
    // roads
    ctx.strokeStyle = '#5a5f6a';
    ctx.lineWidth = 4;
    for (const s of WORLD.streets) {
      const [x] = toMap(s, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, z] = toMap(0, s);
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
    }
    // Spire plaza
    const [px, pz] = toMap(0, 0);
    ctx.fillStyle = '#cbb28a';
    ctx.fillRect(px - 6, pz - 6, 12, 12);
    // cash stashes
    ctx.fillStyle = '#2fae4e';
    for (const c of G.missions.cashMeshes) {
      if (c.found) continue;
      const [x, z] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // mission marker: pulsing yellow diamond
    const marker = G.missions.marker;
    if (marker) {
      const [x, z] = toMap(marker.x, marker.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.moveTo(x, z - pulse); ctx.lineTo(x + pulse, z);
      ctx.lineTo(x, z + pulse); ctx.lineTo(x - pulse, z);
      ctx.closePath(); ctx.fill();
    }
    // traffic cars: white dots
    ctx.fillStyle = '#ffffff';
    for (const car of G.traffic.cars) {
      const c = car.car ?? car;
      if (c.kind === 'player') continue;
      const [x, z] = toMap(c.pos.x, c.pos.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // police: flashing blue/red dots
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#2244ff' : '#ff2222';
    for (const cop of G.police.cops) {
      const [x, z] = toMap(cop.pos.x, cop.pos.z);
      ctx.beginPath(); ctx.arc(x, z, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // player: green arrow, rotated to heading
    const [ux, uz] = toMap(G.player.pos.x, G.player.pos.z);
    const heading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
    ctx.save();
    ctx.translate(ux, uz);
    ctx.rotate(Math.PI - heading); // arrow tip (drawn up) points along the heading
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
    // N
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', S - 12, 13);
  }
}
