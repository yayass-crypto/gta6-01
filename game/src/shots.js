// Screenshot scenes behind ?shot=start|drive|chase|mission. Each one sets up
// the real game state, then plays the real rules forward for a fixed number of
// steps with a simple autopilot, so the frame is what a short session really
// looks like — and the same seed always gives the same frame.
import { makeCar, spawnPolice } from './vehicles.js';
import { startMission } from './missions.js';

const STEP = 1 / 60;

function steps(G, stepFn, seconds, inputFn) {
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i += 1) stepFn(G, STEP, inputFn ? inputFn(i) : {});
}

// Put the player in a car on a straight road, heading north.
function putPlayerInCar(G, x, z) {
  const car = makeCar(G, 'sedan', x, z, 0);
  car.kind = 'player';
  G.cars.push(car);
  G.playerCar = car;
  G.player.onFoot = false;
  G.player.x = x;
  G.player.z = z;
  return car;
}

export function stageShot(G, name, stepFn) {
  const noInput = () => ({});
  if (name === 'drive') {
    G.screen = 'play';
    const car = putPlayerInCar(G, 0, 150);
    car.heading = Math.PI; // north, down the central road through downtown
    car.speed = 24;
    G.camMode = 'chase';
    steps(G, stepFn, 6, () => ({ forward: true }));
    return;
  }
  if (name === 'chase') {
    G.screen = 'play';
    const car = putPlayerInCar(G, 0, 0);
    car.heading = Math.PI; // north up the central road, police on the tail
    car.speed = 26;
    G.camMode = 'chase';
    G.wanted.heat = 45; // 2 stars
    spawnPolice(G, 2);
    // A short burst, straight ahead: a long chase lets the rams and the
    // weaving shove the car into a wall and pin it, which reads as a crash,
    // not a chase.
    steps(G, stepFn, 3, () => ({ forward: true }));
    return;
  }
  if (name === 'mission') {
    G.screen = 'play';
    startMission(G, 0);
    const s = G.city.spots;
    G.player.x = s.sedan.x - 6;
    G.player.z = s.sedan.z + 10;
    G.player.heading = Math.atan2(s.sedan.x - G.player.x, s.sedan.z - G.player.z);
    G.camYaw = G.player.heading;
    G.camPitch = 0.32;
    G.camMode = 'follow';
    steps(G, stepFn, 3, noInput);
    return;
  }
  // Default: the title screen over a living city at dusk.
  G.screen = 'title';
  G.clockH = 18.5;
  G.camMode = 'cinematic';
  const titleEl = document.getElementById('titleScreen');
  if (titleEl) {
    titleEl.style.display = 'flex';
    titleEl.style.background = 'linear-gradient(rgba(5,8,14,0.15), rgba(5,8,14,0.78))';
  }
  steps(G, stepFn, 5, noInput);
}
