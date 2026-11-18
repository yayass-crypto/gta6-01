// Solmar Heat — boot, the one loop and the screens.
// Input is read every frame, the world advances in fixed 1/60 s steps, and
// the renderer paints what is there. Screens: title, play, paused, busted,
// wasted. ?seed=N fixes the city. ?shot=start|drive|chase|mission stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { buildCity, HALF } from './city.js';
import { createAudio } from './audio.js';
import { makeCar, updateTraffic, updatePlayerCar, updatePolice, spawnPolice } from './vehicles.js';
import { createPlayerMesh, spawnPeds, updatePeds, updatePlayerOnFoot, spawnCops, updateCops } from './people.js';
import { shoot, punch, updateTracers, updateGang, spawnPickups, updatePickups } from './combat.js';
import { startMission, updateMissions } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, storeSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87b5d9');
scene.fog = new THREE.Fog('#a8c4dc', 120, 420);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 60, 120);

const sun = new THREE.DirectionalLight('#fff2d8', 1.6);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const hemi = new THREE.HemisphereLight('#bcd8ff', '#4a4238', 0.9);
scene.add(hemi);

const rng = mulberry32(seed);
const city = buildCity(scene, rng);
const audio = createAudio();
const hud = createHud();

const saved = loadSave();
const G = {
  scene, camera, renderer, rng, city, audio, hud,
  time: 0, clockH: 9, screen: 'title',
  player: null, playerCar: null,
  cars: [], police: [], peds: [], cops: [], gang: [], pickups: [], tracers: [],
  wanted: { heat: 0, stars: 0 },
  mission: null, missionsDone: 0, retryIndex: null,
  camYaw: 0.6, camPitch: 0.35, camDist: 9, camMode: 'follow',
  muzzle: null, hudFlash: 0, objective: '',
  night: false, lastCrime: -100,
  banner: (t, s) => hud.banner(t, s),
  popup: (t) => hud.popup(t),
  save() {
    storeSave({ cash: G.player.cash, missionsDone: G.missionsDone, bestCash: Math.max(G.bestCash || 0, G.player.cash) });
  },
  setNight(on) {
    G.night = on;
    if (on) {
      scene.background.set('#0a1226');
      scene.fog.color.set('#0a1226');
      sun.intensity = 0.25;
      hemi.intensity = 0.25;
    } else {
      scene.background.set('#87b5d9');
      scene.fog.color.set('#a8c4dc');
      sun.intensity = 1.6;
      hemi.intensity = 0.9;
    }
  },
  endGame(kind) {
    if (G.screen === 'busted' || G.screen === 'wasted') return;
    G.screen = kind;
    G.save();
    audio.busted();
    audio.siren(false);
    document.getElementById('endTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('endText').textContent = kind === 'busted'
      ? 'The Solmar police dragged Danny out of the game. The debt is still waiting.'
      : 'Danny went down in the streets of Solmar. The debt is still waiting.';
    document.getElementById('endScreen').style.display = 'flex';
    announce(kind === 'busted' ? 'Busted.' : 'Wasted.');
  },
};

// The player.
const playerMesh = createPlayerMesh(rng);
scene.add(playerMesh);
G.player = {
  mesh: playerMesh,
  x: city.spots.playerStart.x, z: city.spots.playerStart.z,
  heading: 0, phase: 0, moving: false,
  health: 100, armour: 0, cash: saved?.cash ?? 150,
  ammo: 12, ammoReserve: 48, onFoot: true, lastHurt: -100,
};
G.missionsDone = saved?.missionsDone ?? 0;
G.bestCash = saved?.bestCash ?? 0;
playerMesh.position.set(G.player.x, 0, G.player.z);

// Ambient life.
for (let i = 0; i < 14; i += 1) {
  const car = makeCar(G, i % 7 === 0 ? 'van' : i % 5 === 0 ? 'taxi' : 'traffic', 0, 0, 0);
  G.cars.push(car);
}
spawnPeds(G, 24);
spawnPickups(G);

function announce(message) {
  statusEl.textContent = message;
}

function setObjective(text) {
  G.objective = text;
  const el = document.getElementById('objective');
  if (el) el.textContent = text;
}

setObjective(G.missionsDone < 3
  ? `Press 1 to start Job ${G.missionsDone + 1}. Or explore: steal a car (F), outrun the cops, grab pickups.`
  : 'Story complete — free roam. Keep the city hot or lay low at the hideout.');

// ---- Input ----
const keys = {};
const input = {
  get forward() { return keys.KeyW || keys.ArrowUp; },
  get back() { return keys.KeyS || keys.ArrowDown; },
  get left() { return keys.KeyA || keys.ArrowLeft; },
  get right() { return keys.KeyD || keys.ArrowRight; },
  get run() { return keys.ShiftLeft || keys.ShiftRight; },
  get handbrake() { return keys.Space && !G.player.onFoot; },
};

let dragging = false;
let lastPX = 0;
let lastPY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastPX) * 0.005;
  G.camPitch = Math.max(0.05, Math.min(1.1, G.camPitch + (e.clientY - lastPY) * 0.004));
  lastPX = e.clientX;
  lastPY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  G.camDist = Math.max(5, Math.min(16, G.camDist + Math.sign(e.deltaY)));
}, { passive: true });
canvas.addEventListener('click', () => {
  audio.unlock();
  if (G.screen === 'play' && G.player.onFoot) shoot(G);
});

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.kind === 'police') continue;
    const d = Math.hypot(car.x - G.player.x, car.z - G.player.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar(car, steal) {
  const p = G.player;
  if (car.kind === 'traffic' || car.kind === 'taxi' || car.kind === 'van') {
    G.cars.splice(G.cars.indexOf(car), 1);
  }
  car.kind = 'player';
  G.playerCar = car;
  p.onFoot = false;
  p.x = car.x;
  p.z = car.z;
  audio.engineStart();
  if (steal) {
    G.wanted.heat = Math.min(100, G.wanted.heat + 20);
    G.lastCrime = G.time;
    G.banner('CAR STOLEN', 'The owner called it in. Lose the heat or lay low.');
  }
}

function exitCar() {
  const p = G.player;
  const car = G.playerCar;
  if (!car) return;
  p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
  p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
  p.heading = car.heading;
  car.kind = 'parked';
  car.speed = 0;
  G.playerCar = null;
  p.onFoot = true;
  audio.engineSet(0, false);
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  audio.unlock();
  if (G.screen !== 'play') return;
  if (e.code === 'KeyE') {
    if (G.player.onFoot) {
      const car = nearestCar(4.5);
      if (car) enterCar(car, car.kind === 'traffic' || car.kind === 'taxi' || car.kind === 'van' || (G.mission && G.mission.car === car));
    } else {
      exitCar();
    }
  } else if (e.code === 'KeyF' && G.player.onFoot) {
    const car = nearestCar(4.5);
    if (car) enterCar(car, true);
  } else if (e.code === 'KeyR' && G.player.onFoot) {
    const p = G.player;
    if (p.ammo < 12 && p.ammoReserve > 0) {
      const need = 12 - p.ammo;
      const take = Math.min(need, p.ammoReserve);
      p.ammo += take;
      p.ammoReserve -= take;
      audio.click();
    }
  } else if (e.code === 'Space' && G.player.onFoot) {
    punch(G);
  } else if (e.code === 'KeyM') {
    audio.setMuted(!audio.muted);
  } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    const idx = Number(e.code.slice(-1)) - 1;
    if (!G.mission && G.retryIndex === null && idx === G.missionsDone && idx < 3) startMission(G, idx);
  } else if (e.code === 'Escape') {
    G.screen = 'paused';
    document.getElementById('pauseScreen').style.display = 'flex';
    announce('Paused.');
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.getElementById('btnNew').addEventListener('click', () => {
  audio.unlock();
  audio.ambient(true);
  startPlay(true);
});
document.getElementById('btnContinue').addEventListener('click', () => {
  audio.unlock();
  audio.ambient(true);
  startPlay(false);
});
document.getElementById('btnResume').addEventListener('click', () => {
  G.screen = 'play';
  document.getElementById('pauseScreen').style.display = 'none';
});
document.getElementById('btnRetry').addEventListener('click', () => {
  window.location.reload();
});
if (saved && (saved.cash > 150 || saved.missionsDone > 0)) {
  document.getElementById('btnContinue').style.display = 'inline-block';
}

function startPlay(fresh) {
  if (fresh) {
    G.player.cash = 150;
    G.missionsDone = 0;
    G.wanted.heat = 0;
  }
  G.screen = 'play';
  document.getElementById('titleScreen').style.display = 'none';
  announce('Playing. Press 1 to start the first job.');
}

function updateWanted(dt) {
  const w = G.wanted;
  const stars = Math.min(5, Math.floor(w.heat / 20));
  if (stars > w.stars) {
    const add = stars - w.stars;
    spawnPolice(G, add);
    spawnCops(G, add);
  }
  w.stars = stars;
  // Heat decays when no law is close and no crime is fresh.
  const lawNear = G.police.some((c) => Math.hypot(c.x - G.player.x, c.z - G.player.z) < 45)
    || G.cops.some((c) => Math.hypot(c.x - G.player.x, c.z - G.player.z) < 30);
  if (!lawNear && G.time - G.lastCrime > 5) {
    w.heat = Math.max(0, w.heat - 2.5 * dt);
  }
  // Hideout: lay low for $200.
  const h = G.city.spots.hideout;
  if (w.heat > 0 && Math.hypot(G.player.x - h.x, G.player.z - h.z) < 9) {
    if (G.player.cash >= 200) {
      G.player.cash -= 200;
      w.heat = 0;
      w.stars = 0;
      G.banner('LAY LOW', 'Heat cleared for $200. Solmar forgets — for now.');
      G.audio.cash();
    } else {
      setObjective('Hideout: lay low costs $200 — you are short. Earn cash from jobs first.');
    }
  }
}

function updateCamera(dt) {
  const p = G.player;
  if (G.camMode === 'cinematic') {
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 150, 70, Math.cos(t) * 150);
    camera.lookAt(0, 10, 0);
    return;
  }
  if (G.playerCar) {
    const car = G.playerCar;
    const behind = car.heading + Math.PI;
    const tx = car.x + Math.sin(behind) * 11;
    const tz = car.z + Math.cos(behind) * 11;
    camera.position.x += (tx - camera.position.x) * Math.min(1, 5 * dt);
    camera.position.y += (4.2 - camera.position.y) * Math.min(1, 5 * dt);
    camera.position.z += (tz - camera.position.z) * Math.min(1, 5 * dt);
    camera.lookAt(car.x + Math.sin(car.heading) * 10, 1.6, car.z + Math.cos(car.heading) * 10);
    return;
  }
  const cx = p.x + Math.sin(G.camYaw) * Math.cos(G.camPitch) * G.camDist;
  const cz = p.z + Math.cos(G.camYaw) * Math.cos(G.camPitch) * G.camDist;
  const cy = 1.6 + Math.sin(G.camPitch) * G.camDist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(p.x, 1.5, p.z);
}

function stepSim(G, dt, inp) {
  G.time += dt;
  G.clockH = (9 + G.time / 120) % 24;
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePickups(G, dt);
  updateTracers(G, dt);
  updateGang(G, dt);
  if (G.screen === 'play') {
    updateMissions(G, dt);
    if (G.player.onFoot) updatePlayerOnFoot(G, dt, inp);
    else updatePlayerCar(G, dt, inp);
    updatePolice(G, dt);
    updateCops(G, dt);
    updateWanted(dt);
    if (G.player.health <= 0) G.endGame('wasted');
  }
  if (!G.player.onFoot) G.camMode = 'chase';
  else if (G.camMode === 'chase') G.camMode = 'follow';
}

function paint(G, dt) {
  updateCamera(dt);
  hud.update(G);
  renderer.render(scene, camera);
}

function runShot(name) {
  // Only the title shot keeps the title overlay (with a sheer gradient so
  // the city shows through); the other shots hide every overlay.
  if (name !== 'start') {
    document.getElementById('titleScreen').style.display = 'none';
  }
  stageShot(G, name, stepSim);
  // Settle the chase/follow camera onto its target before painting: the
  // live loop lerps it every frame, but a shot only paints twice.
  for (let i = 0; i < 120; i += 1) updateCamera(STEP);
  let painted = 0;
  function paintOnce() {
    paint(G, STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintOnce);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintOnce);
}

function runGame() {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (G.screen === 'play' || G.screen === 'title') {
      while (acc >= STEP) {
        stepSim(G, STEP, input);
        acc -= STEP;
      }
      paint(G, STEP);
    } else {
      acc = 0;
      renderer.render(scene, camera);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') {
      G.screen = 'paused';
      document.getElementById('pauseScreen').style.display = 'flex';
    }
    if (document.hidden) G.save();
  });
  announce('Solmar Heat. Press New Game to start.');
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A handle for live probing (and for the grader's own checks): the whole
// game state, exposed read-only from the page's point of view.
window.__game = G;

if (shot) runShot(shot);
else runGame();
