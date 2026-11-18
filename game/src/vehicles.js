// Cars: the player's arcade car, ambient traffic and the police chase.
// Traffic drives the road grid in lanes and obeys the central traffic lights;
// police spawn on wanted level and ram the player. All positions live on the
// flat city plane, so cars are circles for collision and AABBs for buildings.
import * as THREE from 'three';
import { pick, range } from './rng.js';
import { collideCircle, HALF, PITCH, GRID } from './city.js';

const CAR_COLORS = ['#c0392b', '#2e6db3', '#d8a02c', '#3f8a4f', '#7a4a8a', '#c9c9c9', '#22262c', '#b3642f'];

export function buildCarMesh(color, kind) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: '#101820', roughness: 0.15, metalness: 0.7 });
  const isVan = kind === 'van';
  // Vans are longer and taller than the sedans and taxis, with the cab
  // folded into the body instead of a separate cabin box.
  const body = new THREE.Mesh(new THREE.BoxGeometry(isVan ? 2.1 : 2.0, isVan ? 1.5 : 0.62, isVan ? 5.4 : 4.4), paint);
  body.position.y = isVan ? 0.95 : 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  if (!isVan) g.add(cabin);
  if (isVan) {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.1), glass);
    shield.position.set(0, 1.35, 2.55);
    g.add(shield);
  }
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#14161a', roughness: 0.9 });
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, isVan ? z * 1.25 : z);
    g.add(wheel);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff6c9', emissive: '#ffedb0', emissiveIntensity: 0.8 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    h.position.set(x, 0.62, 2.21);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: '#a01818', emissive: '#d02020', emissiveIntensity: 0.7 }));
    t.position.set(x, 0.62, -2.21);
    g.add(t);
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: '#ff2020', emissive: '#ff2020', emissiveIntensity: 2 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: '#2040ff', emissive: '#2040ff', emissiveIntensity: 2 }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.y = 1.45;
    bar.userData = { red, blue };
    g.add(bar);
    g.userData.lightBar = bar;
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: '#ffd23e', emissive: '#ffd23e', emissiveIntensity: 0.6 }));
    sign.position.y = 1.45;
    g.add(sign);
  }
  return g;
}

function placeOnRoad(G, mesh, x, z, heading) {
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
}

export function makeCar(G, kind, x, z, heading) {
  const color = kind === 'police' ? '#e8e8e8' : pick(G.rng, CAR_COLORS);
  const mesh = buildCarMesh(color, kind);
  placeOnRoad(G, mesh, x, z, heading);
  G.scene.add(mesh);
  const car = {
    mesh, kind, color,
    x, z, heading,
    speed: 0, steer: 0,
    health: 100,
    axis: 'x', dir: 1, line: 0, along: 0, lane: 3,
    cruise: range(G.rng, 9, 13),
    lightStop: 0,
  };
  if (kind === 'traffic' || kind === 'taxi' || kind === 'van') {
    const lines = [];
    for (let k = 0; k <= GRID; k += 1) lines.push(-HALF + k * PITCH);
    car.line = pick(G.rng, lines);
    car.axis = G.rng() < 0.5 ? 'x' : 'z';
    car.dir = G.rng() < 0.5 ? 1 : -1;
    car.along = range(G.rng, -HALF, HALF);
    car.lane = car.dir > 0 ? 3 : -3;
    car.x = car.axis === 'x' ? car.along : car.line + car.lane;
    car.z = car.axis === 'x' ? car.line + car.lane : car.along;
    car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.speed = car.cruise;
    placeOnRoad(G, mesh, car.x, car.z, car.heading);
  }
  return car;
}

// Traffic-light phase: 14 s cycle; north-south green first half, east-west second.
export function lightIsGreen(axis, time) {
  const phase = time % 14;
  return axis === 'z' ? phase < 6 : phase >= 7;
}

function carAhead(G, car, dist) {
  let best = null;
  let bestD = dist;
  for (const other of G.cars) {
    if (other === car || other.kind === 'player') continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const forward = car.axis === 'x' ? dx * car.dir : dz * car.dir;
    const lateral = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
    if (forward > 0 && forward < bestD && lateral < 4) { best = other; bestD = forward; }
  }
  return best;
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.kind !== 'traffic' && car.kind !== 'taxi' && car.kind !== 'van') continue;
    let target = car.cruise;
    // Red light: stop before the next central intersection.
    const nextLine = Math.round(car.along / PITCH) * PITCH;
    const distToLine = (nextLine - car.along) * car.dir;
    if (distToLine > 0 && distToLine < 12 && Math.abs(nextLine) <= HALF) {
      if (!lightIsGreen(car.axis, G.time)) target = 0;
    }
    const ahead = carAhead(G, car, 12);
    if (ahead) target = Math.min(target, ahead.speed * 0.9);
    car.speed += Math.max(-14 * dt, Math.min(8 * dt, target - car.speed));
    car.along += car.dir * car.speed * dt;
    // Turn at an intersection sometimes; turn around at the city edge.
    const cross = Math.round(car.along / PITCH) * PITCH;
    if (Math.abs(car.along - cross) < car.speed * dt + 0.4 && Math.abs(cross) <= HALF && G.rng() < 0.02) {
      const oldLine = car.line;
      car.line = cross;
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.dir = G.rng() < 0.5 ? 1 : -1;
      car.along = oldLine;
      car.lane = car.dir > 0 ? 3 : -3;
    }
    if (car.along > HALF + 6) { car.along = HALF + 6; car.dir = -1; }
    if (car.along < -HALF - 6) { car.along = -HALF - 6; car.dir = 1; }
    car.x = car.axis === 'x' ? car.along : car.line + car.lane;
    car.z = car.axis === 'x' ? car.line + car.lane : car.along;
    const wantHeading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.heading = wantHeading;
    placeOnRoad(G, car.mesh, car.x, car.z, car.heading);
  }
}

export function updatePlayerCar(G, dt, input) {
  const car = G.playerCar;
  if (!car) return;
  const maxSpeed = car.kind === 'sport' ? 46 : 38;
  if (input.forward) car.speed += 15 * dt;
  if (input.back) car.speed -= (car.speed > 0.5 ? 24 : 10) * dt;
  if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed = Math.max(-10, Math.min(maxSpeed, car.speed));
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, 8 * dt);
  const grip = input.handbrake ? 0.5 : 1;
  car.heading += (car.speed / 2.9) * Math.tan(car.steer * 0.55) * grip * dt * (car.speed >= 0 ? 1 : -1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(G.city, nx, nz, 2.3);
  if (hit.hit && Math.abs(car.speed) > 8) {
    car.health -= (Math.abs(car.speed) - 8) * 1.5;
    G.audio.punch();
    car.speed *= 0.4;
  } else if (hit.hit) {
    car.speed *= 0.5;
  }
  car.x = hit.x;
  car.z = hit.z;
  // Car-car bumps.
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      car.x -= ux * push;
      car.z -= uz * push;
      other.x += ux * push;
      other.z += uz * push;
      if (Math.abs(car.speed) > 6) {
        car.health -= 3;
        other.health -= 3;
        if (other.kind === 'traffic' || other.kind === 'taxi' || other.kind === 'van') G.wanted.heat = Math.min(100, G.wanted.heat + 4);
      }
      car.speed *= 0.85;
    }
  }
  placeOnRoad(G, car.mesh, car.x, car.z, car.heading);
  G.audio.engineSet(Math.abs(car.speed) / maxSpeed, true);
}

export function spawnPolice(G, count) {
  const p = G.player;
  for (let i = 0; i < count; i += 1) {
    const angle = G.rng() * Math.PI * 2;
    const x = p.x + Math.sin(angle) * 60;
    const z = p.z + Math.cos(angle) * 60;
    const car = makeCar(G, 'police', x, z, Math.atan2(p.x - x, p.z - z));
    car.cruise = 40;
    G.cars.push(car);
    G.police.push(car);
  }
  G.audio.siren(true);
}

export function updatePolice(G, dt) {
  const p = G.player;
  const px = p.x;
  const pz = p.z;
  for (const car of G.police) {
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    const targetSpeed = dist > 30 ? 40 : 26;
    car.speed += Math.max(-16 * dt, Math.min(12 * dt, targetSpeed - car.speed));
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const hit = collideCircle(G.city, nx, nz, 2.3);
    car.x = hit.x;
    car.z = hit.z;
    if (hit.hit) car.speed *= 0.6;
    // Ram the player.
    if (dist < 4.6) {
      if (G.playerCar) {
        G.playerCar.health -= 6 * dt;
        G.playerCar.speed *= 0.98;
        if (Math.random() < dt * 2) G.audio.punch();
      } else {
        damagePlayer(G, 10 * dt);
      }
      car.speed *= 0.9;
    }
    placeOnRoad(G, car.mesh, car.x, car.z, car.heading);
    // Flash the light bar.
    const bar = car.mesh.userData.lightBar;
    if (bar) {
      const on = Math.floor(G.time * 4) % 2 === 0;
      bar.userData.red.material.emissiveIntensity = on ? 2.5 : 0.2;
      bar.userData.blue.material.emissiveIntensity = on ? 0.2 : 2.5;
    }
  }
  // Cull far-away police once the heat is gone.
  if (G.wanted.stars === 0) {
    for (const car of [...G.police]) {
      const d = Math.hypot(car.x - px, car.z - pz);
      if (d > 90) {
        G.scene.remove(car.mesh);
        G.cars.splice(G.cars.indexOf(car), 1);
        G.police.splice(G.police.indexOf(car), 1);
      }
    }
    if (G.police.length === 0) G.audio.siren(false);
  }
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, amount * 0.6);
    p.armour -= absorbed;
    p.health -= (amount - absorbed);
  } else {
    p.health -= amount;
  }
  p.health = Math.max(0, p.health);
  G.hudFlash = 1;
}
