// main.js — Solmar Heat boot, game loop, state machine, input, camera.
import * as THREE from 'three';
import { buildCity, collideCircle, HALF } from './city.js';
import { makePlayerCar, spawnTraffic, updateTraffic, updatePlayerCar, spawnPolice, updatePolice, nearestTrafficCar } from './vehicles.js';
import { makePlayer, updatePlayerOnFoot, spawnPeds, updatePeds, spawnFootCop, updateFootCops } from './people.js';
import { initCombat, shoot, punch, updateCombat } from './combat.js';
import { initMissions, updateMissions, currentObjective, missionTarget, MISSIONS } from './missions.js';
import { initHud, updateHud, showToast, showBrief, hudPopup } from './hud.js';
import { initAudio } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const G = {
  seed: 1,
  state: 'title', // title | play | pause | busted | wasted | complete
  time: 0,
  gameClock: 8 * 60 + 15, // 08:15
  cash: 250,
  stars: 0,
  keys: {},
  camYaw: 0, camPitch: 0.32,
  playerPos: new THREE.Vector3(0, 0, 8),
  playerSpeed: 0,
  damageFlash: 0,
  police: [], footCops: [], traffic: [], peds: [], gang: [],
  stats: { kills: 0, carsStolen: 0 },
  bestCash: 0,
  night: false,
};
window.__G = G; // debug / live-drive probe handle
G.rng = null;

function el(id) { return document.getElementById(id); }

G.setWanted = function (n, why) {
  const prev = G.stars;
  G.stars = Math.max(0, Math.min(5, n));
  if (G.stars > prev) {
    showToast(G, `Wanted level ${G.stars} — ${why || 'the law is after you'}`);
    G.audio?.siren(true);
  }
  if (G.stars === 0) G.audio?.siren(false);
  // sync police cars
  const want = G.stars >= 1 ? Math.min(4, G.stars + 1) : 0;
  while (G.police.length < want) G.police.push(...spawnPolice(G, 1));
  while (G.police.length > want) {
    const c = G.police.pop();
    G.scene.remove(c.mesh);
  }
  // foot cops when wanted and on foot
  if (G.stars >= 2 && !G.player.inCar && G.footCops.length < Math.min(3, G.stars)) {
    spawnFootCop(G);
  }
  G.hud?.update();
};

G.addWanted = function (n, why) { G.setWanted(G.stars + n, why); };

G.addCash = function (n) {
  G.cash += n;
  G.bestCash = Math.max(G.bestCash, G.cash);
};

G.hurtPlayer = function (dmg, src) {
  const p = G.player;
  if (G.state !== 'play') return;
  let rest = dmg;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest * 0.6);
    p.armor -= absorbed; rest -= absorbed;
  }
  p.health -= rest;
  G.damageFlash = Math.min(1, G.damageFlash + 0.5);
  if (p.health <= 0) {
    p.health = 0;
    G.state = src === 'cop' ? 'busted' : 'wasted';
    showEndScreen(G.state);
  }
  G.hud?.update();
};

G.setNight = function (on) {
  G.night = on;
  if (on) {
    G.scene.background.set(0x0b1026);
    G.scene.fog.color.set(0x0b1026);
    G.sun.intensity = 0.25;
    G.hemi.intensity = 0.35;
  } else {
    G.scene.background.set(0x87b5d6);
    G.scene.fog.color.set(0x9fc3dd);
    G.sun.intensity = 1.4;
    G.hemi.intensity = 0.95;
  }
};

G.saveGame = function () { saveGame(G); };
G.showToast = (m) => showToast(G, m);
G.showBrief = (t) => showBrief(G, t);
G.hudPopup = (t, c) => hudPopup(G, t, c);
G.currentObjective = () => currentObjective(G);
G.missionTarget = () => missionTarget(G);

// --- title / end screens ---
function showScreen(id) {
  for (const s of ['screen-title', 'screen-pause', 'screen-end', 'screen-complete']) {
    el(s).style.display = s === id ? 'flex' : 'none';
  }
}
G.showTitle = function (show) {
  if (show) showScreen('screen-title');
  el('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
};
function showEndScreen(kind) {
  el('end-title').textContent = kind === 'busted' ? 'BUSTED!' : 'WASTED';
  el('end-sub').textContent = kind === 'busted'
    ? 'The Solmar PD caught up with Danny. Bail: $150.'
    : 'Danny is down. The streets of Solmar show no mercy.';
  G.cash = Math.max(0, G.cash - 150);
  showScreen('screen-end');
  G.saveGame();
}
G.showComplete = function () {
  el('complete-cash').textContent = '$' + Math.floor(G.cash).toLocaleString('en-US');
  showScreen('screen-complete');
  G.saveGame();
};

G.startGame = function (fresh) {
  if (fresh) {
    G.cash = 250; G.missionIndex = 0; G.missionDone = [false, false, false];
    G.mission = null; G.stars = 0; G.player.health = 100; G.player.armor = 0;
    G.ammo = 12; G.ammoReserve = 48;
  }
  G.state = 'play';
  showScreen(null);
  G.audio?.unlock();
  G.hud?.update();
};

G.enterCar = function (car) {
  const p = G.player;
  p.inCar = true;
  G.playerCar = car;
  p.mesh.visible = false;
  G.playerPos.copy(car.pos);
  G.audio?.engine(0.1);
};
G.exitCar = function () {
  const p = G.player;
  if (!G.playerCar) return;
  const car = G.playerCar;
  p.inCar = false;
  p.pos.set(car.pos.x - 2.5, 0, car.pos.z);
  p.mesh.visible = true;
  p.mesh.position.copy(p.pos);
  G.playerPos.copy(p.pos);
  G.playerCar = null;
  G.audio?.engine(0);
};

// --- input ---
function bindInput() {
  window.addEventListener('keydown', (e) => {
    G.keys[e.code] = true;
    G.audio?.unlock();
    if (e.code === 'Enter' && G.state === 'title') { G.startGame(false); return; }
    if (e.code === 'Escape') {
      if (G.state === 'play') { G.state = 'pause'; showScreen('screen-pause'); }
      else if (G.state === 'pause') { G.state = 'play'; showScreen(null); }
      return;
    }
    if (G.state !== 'play') return;
    if (e.code === 'KeyM') {
      const muted = G.audio?.toggleMute();
      showToast(G, muted ? 'Sound muted' : 'Sound on');
    }
    if (e.code === 'KeyR') {
      if (G.ammoReserve > 0 && G.ammo < 12) {
        const take = Math.min(12 - G.ammo, G.ammoReserve);
        G.ammo += take; G.ammoReserve -= take;
        G.audio?.click(); G.hud?.update();
      }
    }
    if (e.code === 'KeyF') shoot(G);
    if (e.code === 'Space' && !G.player.inCar) punch(G);
    if (e.code === 'KeyE') {
      if (G.player.inCar) { G.exitCar(); return; }
      // try to enter nearest traffic car (steal it)
      const car = nearestTrafficCar(G, G.playerPos, 6);
      if (car) {
        // remove from traffic, becomes player car
        G.traffic.splice(G.traffic.indexOf(car), 1);
        car.isPlayer = true;
        car.health = 100;
        G.playerCar = car;
        G.stats.carsStolen += 1;
        G.addWanted(1, 'stole a car');
        G.enterCar(car);
        showToast(G, 'Car stolen! Lose the heat or lay low.');
      } else {
        // try the parked player car nearby (own car)
        const own = G.parkedCar;
        if (own && own.pos.distanceTo(G.playerPos) < 6) {
          G.playerCar = own;
          G.enterCar(own);
        }
      }
    }
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  // mouse orbit: drag to rotate camera
  let dragging = false, lx = 0, ly = 0;
  const cv = el('game-canvas');
  cv.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    G.camYaw -= (e.clientX - lx) * 0.005;
    G.camPitch = Math.max(0.05, Math.min(1.1, G.camPitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY;
  });
  cv.addEventListener('click', () => { if (G.state === 'play') shoot(G); });
  el('btn-new').addEventListener('click', () => G.startGame(true));
  el('btn-continue').addEventListener('click', () => {
    loadGame(G);
    G.startGame(false);
  });
  el('btn-resume').addEventListener('click', () => { G.state = 'play'; showScreen(null); });
  el('btn-restart').addEventListener('click', () => G.startGame(true));
  el('btn-title').addEventListener('click', () => { G.state = 'title'; G.showTitle(true); });
  el('btn-end-title').addEventListener('click', () => {
    G.player.health = 100; G.state = 'title'; G.showTitle(true);
  });
  el('btn-complete-roam').addEventListener('click', () => {
    G.player.health = 100; G.state = 'play'; showScreen(null);
  });
}

// --- camera ---
function updateCamera(dt) {
  const cam = G.camera;
  if (G.state === 'title') {
    // slow orbit over downtown
    const t = G.time * 0.05;
    cam.position.set(Math.cos(t) * 150, 60 + Math.sin(t * 0.7) * 10, Math.sin(t) * 150);
    cam.lookAt(0, 25, 0);
    return;
  }
  const target = G.player.inCar && G.playerCar ? G.playerCar : G.player;
  const heading = G.player.inCar && G.playerCar ? G.playerCar.heading : G.camYaw;
  const dist = G.player.inCar ? 13 : 8.5;
  const height = G.player.inCar ? 5.2 : 4.2;
  // camera behind the heading
  const cx = target.pos.x - Math.sin(heading) * dist;
  const cz = target.pos.z - Math.cos(heading) * dist;
  const want = new THREE.Vector3(cx, height, cz);
  cam.position.lerp(want, Math.min(1, 6 * dt));
  cam.lookAt(target.pos.x, target.pos.y + 1.6, target.pos.z);
}

// --- main tick ---
G.tick = function (dt, staged) {
  G.time += dt;
  G.gameClock = (G.gameClock + dt * 0.6) % 1440; // ~1 game-min per real second
  if (G.state === 'title') {
    updateCamera(dt);
    return;
  }
  if (G.state !== 'play' && !staged) return;
  updatePlayerOnFoot(G, dt);
  if (G.player.inCar) updatePlayerCar(G, dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateFootCops(G, dt);
  updateCombat(G, dt);
  updateMissions(G, dt);
  // wanted decay when hidden: no cops nearby and not committing crimes
  if (G.stars > 0) {
    G._decayT = (G._decayT || 0) + dt;
    if (G._decayT > 25) {
      G._decayT = 0;
      const nearestCop = G.police.reduce((m, c) => Math.min(m, c.pos.distanceTo(G.playerPos)), 999);
      if (nearestCop > 45) G.setWanted(G.stars - 1, 'lay low — heat cooling off');
    }
  }
  // car wrecked?
  if (G.player.inCar && G.playerCar && G.playerCar.health <= 0) {
    G.playerCar.health = 0;
    showToast(G, 'Your car is wrecked!');
    G.exitCar();
  }
  G.damageFlash = Math.max(0, G.damageFlash - dt * 1.4);
  G.audio?.engine(G.player.inCar ? Math.min(1, Math.abs(G.playerCar?.speed || 0) / 34) : 0);
  updateCamera(dt);
  G.hud?.update();
};

G.render = function () {
  G.renderer.render(G.scene, G.camera);
};

// --- boot ---
function boot() {
  const params = new URLSearchParams(location.search);
  G.seed = parseInt(params.get('seed') || '1', 10) || 1;
  G.rng = makeRng(G.seed);

  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 900);
  G.camera.position.set(0, 40, 90);
  G.renderer = new THREE.WebGLRenderer({ canvas: el('game-canvas'), antialias: true });
  G.renderer.setSize(1280, 720);
  G.renderer.setPixelRatio(1);

  buildCity(G);
  G.player = makePlayer(G);
  G.playerCar = makePlayerCar(G, 0xc0392b);
  G.parkedCar = G.playerCar;
  G.playerCar.pos.set(0, 0, 14);
  G.playerCar.mesh.position.copy(G.playerCar.pos);
  // marked sedan for mission 1 (parked by the pier)
  const marked = makePlayerCar(G, 0xf1c40f);
  marked.pos.set(-156, 0, 104);
  marked.heading = Math.PI / 2;
  marked.mesh.position.copy(marked.pos);
  marked.mesh.rotation.y = marked.heading;
  marked.isMarked = true;
  marked.isParked = true;
  G.markedCar = marked;
  G.traffic.push(marked); // parked: speed 0, it sits in traffic list but never moves
  marked.targetSpeed = 0; marked.speed = 0; marked.axis = 'x'; marked.line = 104; marked.dir = 1;

  spawnTraffic(G);
  spawnPeds(G);
  initCombat(G);
  initMissions(G);
  initHud(G);
  initAudio(G);
  bindInput();

  G.showTitle(true);
  G.hud?.update();

  // shot staging
  const shot = params.get('shot');
  if (shot) {
    // stage after first frame so everything exists
    requestAnimationFrame(() => {
      try { stageShot(G, shot, G.seed); } catch (err) { console.error('shot staging failed', err); }
    });
    return;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.tick(dt, false);
    G.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__ready = true;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

boot();
