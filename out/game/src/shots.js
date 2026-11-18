// ?shot= staging for Solmar Heat: each shot plays the real game forward to a
// representative frame, then the harness sets window.__shotReady = true.
import { mulberry32, rand } from './common.js';

export function stageShot(W, shot, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const P = W.player;
  const S = W.city.spots;
  W.mode = 'play';
  W.hud.hide('title'); W.hud.hide('pause'); W.hud.hide('end'); W.hud.hide('brief');
  W.hud.show('hud');

  if (shot === 'start') {
    W.mode = 'title';
    W.hud.hide('hud'); W.hud.show('title');
    W.camOrbit = { x: 60, z: -90, t: 0 };
    return;
  }
  if (shot === 'drive') {
    P.enterCar('sports', 0xc23b2e, 0, 18, 0);
    P._car.speed = 22;
    W.clockMins = 15 * 60 + 30;
    return;
  }
  if (shot === 'chase') {
    P.enterCar('sports', 0xd8d8d8, 0, 0, 0);
    P._car.speed = 26;
    W.setWanted(3);
    W.police.ensure(3, 0, 0, rng);
    W.police.cars.forEach((c, i) => {
      c.x = [2, -2, 6][i]; c.z = [-30, -46, -62][i];
      c.heading = 0; c.speed = 24;
    });
    W.police.placeRoadblock(0, 34, 0);
    W.clockMins = 17 * 60 + 45;
    return;
  }
  if (shot === 'mission') {
    W.city.setNight(true);
    P.enterCar('sedan', 0x2e6fc2, -36, -52, 0);
    const def = W.missions.defs[2];
    W.missions.start(def);
    W.clockMins = 22 * 60 + 10;
    W.hud.announce('THE BIG SCORE', 'Reach the bank — hold the vault for 3 seconds.');
    return;
  }
  // default: free roam on foot downtown
  P.showOnFoot(0, 0, 0);
}
