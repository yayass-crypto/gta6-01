// shots.js — ?shot=start|drive|chase|mission staging for screenshots.
// Each scene plays the real rules forward to a representative frame, renders
// twice, then sets window.__shotReady = true. Deterministic-ish via seed.
import * as THREE from 'three';
import { startMission } from './missions.js';

export function stageShot(G, name, seed) {
  G.seed = seed || 1;
  const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) G.tick(dt, true); };

  if (name === 'start') {
    // Title screen over the downtown skyline.
    G.state = 'title';
    G.camera.position.set(-60, 42, 120);
    G.camera.lookAt(0, 20, 0);
    G.showTitle(true);
  } else if (name === 'drive') {
    G.startGame();
    // Danny in a car downtown, driving east down the z=0 road (a road centre line)
    const car = G.playerCar;
    car.pos.set(-104, 0, 0);
    car.heading = Math.PI / 2;
    car.speed = 24;
    G.enterCar(car);
    G.camYaw = Math.PI / 2;
    step(80);
  } else if (name === 'chase') {
    G.startGame();
    // 3-star chase north up the x=0 road; police close behind
    const car = G.playerCar;
    car.pos.set(0, 0, -104);
    car.heading = 0;
    car.speed = 28;
    G.enterCar(car);
    G.setWanted(3, 'staged chase');
    for (const cop of G.police) {
      cop.pos.set(car.pos.x + (G.rng() - 0.5) * 16, 0, car.pos.z - 14 - G.rng() * 10);
      cop.heading = 0;
      cop.speed = 26;
    }
    // hold W so the car keeps accelerating through rams and traffic bumps
    G.keys['KeyW'] = true;
    step(60);
    G.keys['KeyW'] = false;
    G.damageFlash = 0.3; // keep some red drama, not a full washout
    // one cop pulling alongside so the chase reads in frame; car keeps speed
    if (G.police[0]) {
      G.police[0].pos.set(car.pos.x - 7, 0, car.pos.z - 2);
      G.police[0].heading = car.heading;
      G.police[0].speed = car.speed;
      G.police[0].mesh.position.copy(G.police[0].pos);
      G.police[0].mesh.rotation.y = G.police[0].heading;
    }
    car.speed = 24;
    G.playerSpeed = 24 * 3.6; // speedometer reads the staged speed
    G.hud?.update();
  } else if (name === 'mission') {
    G.startGame();
    startMission(G, 0);
    // Danny in the marked YELLOW sedan, delivery leg, driving east on the z=104 road
    const car = G.markedCar;
    G.traffic.splice(G.traffic.indexOf(car), 1);
    car.pos.set(-156, 0, 104);
    car.heading = Math.PI / 2;
    car.speed = 20;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    G.enterCar(car);
    G.mission.step = 1; // delivery leg: waypoint + timer visible
    G.mission.target.set(156, 0, -52);
    G.mission.timer = 82;
    G.beacon.position.set(156, 15, -52);
    step(50);
  }
  G.render();
  G.render();
  window.__shotReady = true;
}
