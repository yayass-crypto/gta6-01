// Solmar Heat — boot, game loop, input, camera, wanted system, state machine.
import * as THREE from 'three';
import { mulberry32, clamp, lerp, money } from './common.js';
import { buildCity, HALF } from './city.js';
import { PlayerCar, Traffic, Police, Smoke, CAR_TYPES } from './vehicles.js';
import { OnFoot, Peds, FootCops } from './people.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Synth } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10);

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(40, 26, -60);

const city = buildCity(scene);
const smoke = new Smoke(scene);
const rng = mulberry32(20261118);
// player headlight: a real spotlight cone on the road at night
const headlight = new THREE.SpotLight(0xfff2c8, 0, 55, 0.5, 0.45, 1.2);
headlight.target = new THREE.Object3D();
scene.add(headlight); scene.add(headlight.target);

// ---------- world object (shared by all modules) ----------
const W = {
  scene, camera, renderer, city, cash: 250, wanted: 0, clockMins: 8 * 60,
  mode: 'title', camOrbit: null, lastCrimeT: -999, hideoutT: 0,
  muted: false, time: 0,
};
W.audio = new Synth();

// ---------- player ----------
const onFoot = new OnFoot(scene);
const car = new PlayerCar(scene, smoke);
const player = {
  x: 0, z: 0, heading: 0,
  hp: 100, armour: 0, ammo: 24, reserveAmmo: 48, punchCd: 0, weapon: 'pistol',
  inCar: false, carX: 0, carZ: 0, carHeading: 0, carSpeed: 0, carHp: 100,
  carType: 'sedan', carTypeLabel: 'SEDAN',
  _car: car, _foot: onFoot,
  damage(amount) {
    let left = amount;
    if (this.armour > 0) { const a = Math.min(this.armour, left * 0.6); this.armour -= a; left -= a; }
    this.hp = Math.max(0, this.hp - left);
    W.hud.flashDamage();
    if (this.hp <= 0) W.showEnd('wasted', 'Danny is down. The streets of Solmar claim another one.');
  },
  damageCar(amount) {
    if (!this.inCar) return;
    car.hp = Math.max(0, car.hp - amount);
    this.carHp = car.hp;
    if (car.hp <= 0) {
      smoke.puff(this.carX, 1.5, this.carZ, 8);
      W.audio.fail();
      this.exitCar();
      W.hud.announce('CAR TOTALLED', 'Bail out and run!');
    }
  },
  slowCar(f) { if (this.inCar) car.speed *= f; },
  enterCar(type, color, x, z, heading) {
    car.enter(type, color, x, z, heading);
    onFoot.hide();
    this.inCar = true; this.carType = type;
    this.carTypeLabel = (CAR_TYPES[type] || {}).label || 'SEDAN';
    this.carX = x; this.carZ = z; this.carHeading = heading; this.carSpeed = 0; this.carHp = car.hp;
    W.audio.engine(0, true);
  },
  exitCar() {
    if (!this.inCar) return;
    const sx = this.carX + Math.cos(this.carHeading) * 2.2, sz = this.carZ - Math.sin(this.carHeading) * 2.2;
    car.leave();
    this.inCar = false;
    this.showOnFoot(sx, sz, this.carHeading);
    W.audio.engine(0, false);
  },
  showOnFoot(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    onFoot.show(x, z, heading);
    this.inCar = false;
  },
  sync() {
    if (this.inCar) {
      this.carX = car.x; this.carZ = car.z; this.carHeading = car.heading;
      this.carSpeed = car.speed; this.carHp = car.hp;
      this.x = car.x; this.z = car.z; this.heading = car.heading;
    } else {
      this.x = onFoot.x; this.z = onFoot.z; this.heading = onFoot.heading;
    }
    this.punchCd = onFoot.punchCd;
  },
};
W.player = player;

// ---------- systems ----------
const traffic = new Traffic(scene); traffic.spawnAll();
const peds = new Peds(scene); peds.spawnAll(30);
const cops = new FootCops(scene);
const police = new Police(scene, smoke);
const combat = new Combat(scene, W);
const missions = new Missions(scene, W);
const hud = new Hud(W);
Object.assign(W, { traffic, peds, cops, police, combat, missions, hud });

W.addCash = (amount, x, z) => {
  W.cash += amount;
  hud.popup('+$' + amount, x, z);
};
W.addWanted = (n) => { W.wanted = Math.min(5, W.wanted + n); W.lastCrimeT = W.time; };
W.setWanted = (n) => { W.wanted = clamp(n, 0, 5); if (n > 0) W.lastCrimeT = W.time; };
W.saveGame = () => {
  writeSave({
    cash: W.cash, done: [...missions.done], hp: player.hp, armour: player.armour,
    ammo: player.ammo, reserveAmmo: player.reserveAmmo, muted: W.muted,
    bestCash: Math.max(W.cash, (loadSave() || {}).bestCash || 0),
  });
};
W.showEnd = (kind, text) => {
  if (W.mode === 'busted' || W.mode === 'wasted' || W.mode === 'story') return;
  W.mode = kind;
  const titles = { busted: 'BUSTED', wasted: 'WASTED', story: 'STORY COMPLETE' };
  $('end-title').textContent = titles[kind] || 'GAME OVER';
  $('end-text').textContent = text;
  $('btn-retry').textContent = kind === 'story' ? 'KEEP PLAYING' : 'TRY AGAIN';
  hud.show('end');
  W.audio.fail();
  if (kind !== 'story') W.setWanted(0);
};

// ---------- input ----------
const keys = {};
const input = { forward: false, back: false, left: false, right: false, run: false, handbrake: false };
let camYaw = 0, camPitch = 0.32, dragging = false, downX = 0, downY = 0, moved = 0;

function refreshInput() {
  input.forward = !!(keys.KeyW || keys.ArrowUp);
  input.back = !!(keys.KeyS || keys.ArrowDown);
  input.left = !!(keys.KeyA || keys.ArrowLeft);
  input.right = !!(keys.KeyD || keys.ArrowRight);
  input.run = !!(keys.ShiftLeft || keys.ShiftRight);
  input.handbrake = !!keys.Space;
}
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true; refreshInput();
  if (e.code === 'KeyM') openNextMission();
  if (e.code === 'KeyN') toggleMute();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyE') tryEnterExit();
  if (e.code === 'KeyF') trySteal();
  if (e.code === 'KeyR') reload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; refreshInput(); });
canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; downX = e.clientX; downY = e.clientY; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - downX, dy = e.clientY - downY;
  moved += Math.abs(dx) + Math.abs(dy);
  downX = e.clientX; downY = e.clientY;
  camYaw -= dx * 0.005;
  camPitch = clamp(camPitch + dy * 0.003, 0.08, 0.9);
});
addEventListener('pointerup', (e) => {
  if (dragging && moved < 6 && W.mode === 'play') {
    W.audio.resume();
    if (player.inCar) combat.shoot();
    else if (player.weapon === 'pistol') combat.shoot();
    else combat.punch();
  }
  dragging = false;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function toggleMute() {
  W.muted = !W.muted;
  W.audio.setMuted(W.muted);
  hud.announce(W.muted ? 'SOUND OFF' : 'SOUND ON', '');
}
function togglePause() {
  if (W.mode === 'play') { W.mode = 'pause'; hud.show('pause'); }
  else if (W.mode === 'pause') { W.mode = 'play'; hud.hide('pause'); }
}
function reload() {
  if (player.inCar || player.weapon !== 'pistol') return;
  if (player.reserveAmmo <= 0 || player.ammo >= 24) return;
  const need = 24 - player.ammo;
  const take = Math.min(need, player.reserveAmmo);
  player.ammo += take; player.reserveAmmo -= take;
  W.audio.reload();
}
function tryEnterExit() {
  if (W.mode !== 'play') return;
  if (player.inCar) { player.exitCar(); return; }
  const tc = traffic.nearest(player.x, player.z, 4.5);
  if (tc) {
    const type = tc.mesh.userData.type || 'sedan';
    traffic.remove(tc);
    player.enterCar(type, 0x888888, tc.x, tc.z, player.heading);
    if (missions.active?.def.id === 1 && missions.active.stage === 'steal') {
      // stealing counts as the lift either way; mark progress when in the sedan
    }
    W.addWanted(0);
    hud.announce('IN THE CAR', CAR_TYPES[type].label + ' — drive!');
  }
}
function trySteal() {
  if (W.mode !== 'play' || player.inCar) return;
  const tc = traffic.nearest(player.x, player.z, 4.5);
  if (tc) {
    const type = tc.mesh.userData.type || 'sedan';
    traffic.remove(tc);
    player.enterCar(type, 0x888888, tc.x, tc.z, player.heading);
    W.addWanted(1);
    peds.scare(player.x, player.z, 18);
    hud.announce('CAR JACKED', 'The owner ran. One star of heat.');
  }
}
function openNextMission() {
  if (W.mode !== 'play') return;
  if (missions.active) return;
  const n = missions.nextDef();
  if (n) hud.showBrief(n);
}
hud.onBriefGo = () => {
  const n = missions.nextDef();
  if (n) missions.start(n);
};

// ---------- title / flow ----------
function startGame(fresh) {
  const save = fresh ? null : loadSave();
  if (fresh) { clearSave(); missions.done.clear(); W.cash = 250; }
  else if (save) {
    W.cash = save.cash ?? 250;
    missions.done = new Set(save.done || []);
    player.hp = save.hp ?? 100; player.armour = save.armour ?? 0;
    player.ammo = save.ammo ?? 24; player.reserveAmmo = save.reserveAmmo ?? 48;
    W.muted = !!save.muted; W.audio.setMuted(W.muted);
  }
  player.showOnFoot(0, 0, 0);
  W.mode = 'play';
  W.clockMins = 8 * 60;
  hud.hide('title'); hud.hide('pause'); hud.hide('end');
  hud.show('hud');
  W.audio.resume(); W.audio.startAmbient();
  hud.announce('SOLMAR HEAT', 'Welcome back, Danny. Press M for work.');
}
$('btn-new').addEventListener('click', () => startGame(true));
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-resume').addEventListener('click', () => togglePause());
$('btn-quit-title').addEventListener('click', () => { W.mode = 'title'; hud.hide('pause'); hud.show('title'); });
$('btn-retry').addEventListener('click', () => {
  hud.hide('end');
  if (W.mode === 'story') { W.mode = 'play'; return; }
  player.hp = 100; player.armour = 0; player.ammo = 24; player.reserveAmmo = 48;
  player.showOnFoot(0, 0, 0);
  police.ensure(0, 0, 0, rng); cops.clear(); combat.clearGang();
  W.mode = 'play';
});
$('btn-end-title').addEventListener('click', () => { W.mode = 'title'; hud.hide('end'); hud.show('title'); });
if (!loadSave()) $('btn-continue').style.display = 'none';

// ---------- camera ----------
function updateCamera(dt) {
  if (W.mode === 'title') {
    W.camOrbit = W.camOrbit || { t: 0 };
    W.camOrbit.t += dt * 0.05;
    const a = W.camOrbit.t;
    camera.position.set(Math.sin(a) * 105, 55, Math.cos(a) * 105);
    camera.lookAt(0, 8, 0);
    return;
  }
  const px = player.inCar ? player.carX : player.x;
  const pz = player.inCar ? player.carZ : player.z;
  const dist = player.inCar ? 13.5 : 9.5;
  const height = player.inCar ? 5.2 : 4.2;
  const yaw = player.inCar ? player.carHeading : camYaw;
  const cx = px - Math.sin(yaw) * Math.cos(camPitch) * dist;
  const cz = pz - Math.cos(yaw) * Math.cos(camPitch) * dist;
  const cy = height + Math.sin(camPitch) * dist * 0.6;
  camera.position.x = lerp(camera.position.x, cx, Math.min(1, dt * 6));
  camera.position.y = lerp(camera.position.y, cy, Math.min(1, dt * 6));
  camera.position.z = lerp(camera.position.z, cz, Math.min(1, dt * 6));
  camera.lookAt(px + Math.sin(yaw) * 4, 1.6, pz + Math.cos(yaw) * 4);
}

// ---------- main loop ----------
let last = performance.now();
let frames = 0;
let shotReadySent = false;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  W.time += dt;

  if (W.mode === 'title') {
    city.update(dt);
    traffic.update(dt, city, player);
    peds.update(dt, city);
    updateCamera(dt);
    renderer.render(scene, camera);
  } else if (W.mode === 'play') {
    W.clockMins = (W.clockMins + dt * 2) % (24 * 60);
    // player
    if (player.inCar) {
      car.update(dt, input, city, traffic.cars);
      if (input.handbrake && Math.abs(car.speed) > 12) smoke.puff(car.x, 0.5, car.z, 1);
    } else {
      onFoot.update(dt, input, camYaw, city);
      if (input.handbrake) combat.punch();
    }
    player.sync();
    // wanted decay + hideout lay-low
    if (W.wanted > 0 && W.time - W.lastCrimeT > 18) {
      const nearCop = police.cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 35)
        || cops.list.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 25);
      if (!nearCop) {
        W._decayT = (W._decayT || 0) + dt;
        if (W._decayT > 8) { W.wanted = Math.max(0, W.wanted - 1); W._decayT = 0; }
      } else W._decayT = 0;
    }
    const hs = city.spots.hideout;
    if (W.wanted > 0 && Math.hypot(player.x - hs.x, player.z - hs.z) < 9) {
      W.hideoutT += dt;
      hud.setObjective('Laying low… ' + Math.ceil(3 - W.hideoutT) + 's  ($100)', 1);
      if (W.hideoutT >= 3 && W.cash >= 100) {
        W.cash -= 100; W.setWanted(0); W.hideoutT = 0;
        hud.announce('HEAT GONE', 'Vega\'s garage keeps you clean. -$100.');
      }
    } else W.hideoutT = 0;
    // police
    police.ensure(player.inCar ? W.wanted : 0, player.x, player.z, rng);
    police.update(dt, player, city, W.wanted);
    cops.ensure(!player.inCar ? W.wanted : 0, player.x, player.z, rng);
    cops.update(dt, player, city);
    if (!player.inCar && cops.maxCloseT() > 2) W.showEnd('busted', 'The Solmar PD finally caught up. Danny is in the back of a cruiser.');
    if (W.wanted >= 3 && !player.inCar) { /* roadblocks are for driving */ }
    if (W.wanted >= 3 && player.inCar && police.roadblocks.length === 0) {
      police.placeRoadblock(player.carX, player.carZ, player.carHeading);
    }
    if (W.wanted < 3) police.clearRoadblocks();
    // world
    traffic.update(dt, city, player);
    peds.update(dt, city);
    city.update(dt);
    combat.update(dt);
    missions.update(dt);
    smoke.update(dt);
    // health regen (slow)
    if (player.hp > 0 && player.hp < 100) player.hp = Math.min(100, player.hp + dt * 0.8);
    // audio
    W.audio.engine(player.inCar ? Math.abs(player.carSpeed) / 38 : 0, player.inCar);
    W.audio.siren(W.wanted > 0 && police.cars.length > 0);
    // headlight cone at night while driving
    if (player.inCar && city.isNight()) {
      headlight.intensity = 2.4;
      headlight.position.set(
        player.carX + Math.sin(player.carHeading) * 2.2, 1.3,
        player.carZ + Math.cos(player.carHeading) * 2.2);
      headlight.target.position.set(
        player.carX + Math.sin(player.carHeading) * 26, 0,
        player.carZ + Math.cos(player.carHeading) * 26);
    } else headlight.intensity = 0;
    updateCamera(dt);
    hud.update(dt);
    renderer.render(scene, camera);
    // autosave every ~20s
    W._saveT = (W._saveT || 0) + dt;
    if (W._saveT > 20) { W._saveT = 0; W.saveGame(); }
  } else {
    // pause / end screens: keep rendering the frozen scene
    renderer.render(scene, camera);
  }

  frames++;
  if (SHOT && !shotReadySent && frames >= 4) {
    shotReadySent = true;
    window.__shotReady = true;
  }
  if (!window.__ready) window.__ready = true;
}

// ---------- shot staging / probe hooks ----------
if (SHOT) stageShot(W, SHOT, SEED);
W.probe = {
  startNew: () => startGame(true),
  teleportToCar() {
    const tc = traffic.nearest(player.x, player.z, 500);
    if (tc) player.showOnFoot(tc.x + 3, tc.z, 0);
    return !!tc;
  },
  key(code, down = true) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  },
  state: () => ({
    mode: W.mode, inCar: player.inCar, carSpeed: player.carSpeed,
    x: player.x, z: player.z, cash: W.cash, wanted: W.wanted,
    hp: player.hp, missionsDone: [...missions.done],
  }),
};
window.__game = W;

requestAnimationFrame(loop);
