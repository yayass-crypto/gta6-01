// vehicles.js — player car physics, traffic AI, police chase AI.
import * as THREE from 'three';
import { collideCircle, isOnRoad, ROAD, PITCH, HALF } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf39c12, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x1a1a1a, 0xe67e22, 0x16a085, 0xd35400];

export function makeCarMesh(color, isPolice = false, variant = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a33 });
  const bodyLen = variant === 'van' ? 5.2 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, bodyLen), bodyMat);
  body.position.y = 0.55; g.add(body);
  if (variant === 'van') {
    // boxy delivery van: tall cargo box instead of a low cabin
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 3.4), bodyMat);
    cargo.position.set(0, 1.55, -0.7); g.add(cargo);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.2), glassMat);
    cab.position.set(0, 1.1, 1.6); g.add(cab);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
    cabin.position.set(0, 1.05, -0.25); g.add(cabin);
  }
  if (variant === 'taxi') {
    // roof sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xfff200 }));
    sign.position.set(0, 1.45, -0.25); g.add(sign);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 4.42),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    stripe.position.y = 0.62; g.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w); wheels.push(w);
  }
  // headlights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    h.position.set(x, 0.6, 2.22); g.add(h);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.45, -0.25); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0.45, 1.45, -0.25); g.add(bar2);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, wheels };
}

export function spawnTraffic(G) {
  const rng = G.rng;
  G.traffic = [];
  for (let i = 0; i < 14; i++) {
    const roll = rng();
    const variant = roll < 0.2 ? 'taxi' : roll < 0.35 ? 'van' : 'sedan';
    const color = variant === 'taxi' ? 0xf1c40f : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const { group } = makeCarMesh(color, false, variant);
    G.scene.add(group);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = G.roadLines[Math.floor(rng() * G.roadLines.length)];
    const along = -HALF + rng() * HALF * 2;
    const dir = rng() < 0.5 ? 1 : -1;
    const car = {
      mesh: group, axis, line, dir,
      pos: new THREE.Vector3(axis === 'x' ? along : line + (dir > 0 ? 2.8 : -2.8),
        0, axis === 'x' ? line + (dir > 0 ? 2.8 : -2.8) : along),
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: 6 + rng() * 5, targetSpeed: 8 + rng() * 5,
      color, isTraffic: true, stopped: false,
    };
    group.position.copy(car.pos);
    group.rotation.y = car.heading;
    G.traffic.push(car);
  }
}

function lightIsRed(G, axis) {
  // Global light cycle: 6s green for x-roads, 6s green for z-roads.
  const phase = (G.time % 12) < 6;
  return axis === 'x' ? !phase : phase;
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    // distance to next intersection along travel
    const along = car.axis === 'x' ? car.pos.x : car.pos.z;
    const nextLine = (() => {
      for (const l of G.roadLines) {
        if (car.dir > 0 && l > along + 1) return l;
        if (car.dir < 0 && l < along - 1) return l;
      }
      return null;
    })();
    let want = car.targetSpeed;
    if (nextLine !== null) {
      const dist = Math.abs(nextLine - along);
      if (dist < 14 && lightIsRed(G, car.axis)) want = 0; // stop at red
      // random turn at intersection
      if (dist < 2.5 && G.rng() < 0.35) {
        const oldAxis = car.axis;
        car.axis = oldAxis === 'x' ? 'z' : 'x';
        car.dir = G.rng() < 0.5 ? 1 : -1;
        car.line = nextLine;
        car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (car.dir > 0 ? 0 : Math.PI);
        if (car.axis === 'x') car.pos.z = car.line + (car.dir > 0 ? 2.8 : -2.8);
        else car.pos.x = car.line + (car.dir > 0 ? 2.8 : -2.8);
      }
    }
    // slow down if a car is close ahead
    for (const other of G.traffic) {
      if (other === car || other.axis !== car.axis || other.dir !== car.dir) continue;
      const dAlong = (car.axis === 'x' ? other.pos.x - car.pos.x : other.pos.z - car.pos.z) * car.dir;
      const dLat = Math.abs(car.axis === 'x' ? other.pos.z - car.pos.z : other.pos.x - car.pos.x);
      if (dAlong > 0 && dAlong < 9 && dLat < 4) { want = 0; break; }
    }
    car.speed += Math.max(-14 * dt, Math.min(8 * dt, want - car.speed));
    const step = car.speed * dt * car.dir;
    if (car.axis === 'x') car.pos.x += step; else car.pos.z += step;
    if (car.pos.x > HALF + 10 || car.pos.x < -HALF - 10 || car.pos.z > HALF + 10 || car.pos.z < -HALF - 10) {
      // wrap to the other side
      if (car.axis === 'x') car.pos.x = -car.dir * (HALF + 8);
      else car.pos.z = -car.dir * (HALF + 8);
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  }
}

export function makePlayerCar(G, color = 0xc0392b) {
  const { group, wheels } = makeCarMesh(color);
  G.scene.add(group);
  const car = {
    mesh: group, wheels,
    pos: new THREE.Vector3(0, 0, 0), heading: 0,
    speed: 0, steer: 0, health: 100, smoke: null,
    isPlayer: true,
  };
  group.position.copy(car.pos);
  return car;
}

export function updatePlayerCar(G, dt) {
  const car = G.playerCar;
  if (!car) return;
  const k = G.keys;
  const accel = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 0.7 : 0);
  const steerIn = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
  const handbrake = !!k['Space'];
  const maxSpeed = 34;
  car.speed += accel * (handbrake ? 6 : 16) * dt;
  if (!accel) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-12, Math.min(maxSpeed, car.speed));
  const steerTarget = steerIn * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.5 : 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, 8 * dt);
  const turnRate = car.steer * 1.9 * Math.min(1, Math.abs(car.speed) / 8) * (handbrake ? 1.6 : 1);
  car.heading += turnRate * dt * Math.sign(car.speed || 1);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  const before = car.pos.clone();
  if (collideCircle(G, car.pos, 1.6)) {
    // scrape: lose some speed on building hit
    car.speed *= 0.55;
    car.health -= 1.2;
    if (car.health < 30 && !car.smoke) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }));
      s.position.set(0, 1.2, 1.4); car.mesh.add(s); car.smoke = s;
    }
  }
  // bump traffic cars
  for (const t of G.traffic) {
    const dx = t.pos.x - car.pos.x, dz = t.pos.z - car.pos.z;
    if (dx * dx + dz * dz < 7.5) {
      t.speed = Math.max(t.speed, 4);
      car.speed *= 0.85;
    }
  }
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  for (const w of car.wheels) w.rotation.x += car.speed * dt * 2;
  if (car.smoke) car.smoke.material.opacity = 0.3 + Math.random() * 0.3;
  G.playerSpeed = Math.abs(car.speed) * 3.6; // km/h display
}

export function spawnPolice(G, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const { group } = makeCarMesh(0x111111, true);
    G.scene.add(group);
    const a = G.rng() * Math.PI * 2;
    const d = 40 + G.rng() * 20;
    const car = {
      mesh: group,
      pos: new THREE.Vector3(G.playerPos.x + Math.cos(a) * d, 0, G.playerPos.z + Math.sin(a) * d),
      heading: a, speed: 0, isPolice: true, health: 100,
    };
    group.position.copy(car.pos);
    out.push(car);
  }
  return out;
}

export function updatePolice(G, dt) {
  for (const cop of G.police) {
    const dx = G.playerPos.x - cop.pos.x, dz = G.playerPos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    const target = dist > 60 ? 26 : 30;
    cop.speed += (target - cop.speed) * Math.min(1, 2 * dt);
    cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
    if (collideCircle(G, cop.pos, 1.6)) cop.speed *= 0.6;
    // ram the player
    if (dist < 3.4) {
      if (G.player.inCar && G.playerCar) {
        G.playerCar.health -= 14 * dt;
        G.playerCar.speed *= 0.92;
        G.damageFlash = Math.min(1, G.damageFlash + 0.4);
        G.audio?.thud();
      } else {
        G.hurtPlayer(18 * dt, 'cop');
      }
    }
    cop.mesh.position.copy(cop.pos);
    cop.mesh.rotation.y = cop.heading;
  }
}

export function nearestTrafficCar(G, pos, maxDist = 9) {
  let best = null, bd = maxDist;
  for (const t of G.traffic) {
    const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
