// People: Danny on foot, sidewalk pedestrians and the cops who chase him.
// Pedestrians walk the sidewalks and flee gunfire and crashes; cops spawn with
// the wanted level, run the player down and brawl him into a bust.
import * as THREE from 'three';
import { pick, range } from './rng.js';
import { collideCircle, roadPoint } from './city.js';
import { damagePlayer } from './vehicles.js';

const SKINS = ['#c98a5a', '#8a5a3a', '#e8b88a', '#6b4a2f', '#d8a06a'];
const SHIRTS = ['#c0392b', '#2e6db3', '#3f8a4f', '#d8a02c', '#7a4a8a', '#e8e8e8', '#22262c'];

export function buildPersonMesh(rng, shirtColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, SKINS), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor || pick(rng, SHIRTS), roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: '#2b3240', roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.26), pants);
  legL.position.set(-0.16, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.position.set(-0.42, 1.15, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

function walkAnim(mesh, phase, speed01) {
  const s = Math.sin(phase) * 0.55 * speed01;
  mesh.userData.legL.rotation.x = s;
  mesh.userData.legR.rotation.x = -s;
  mesh.userData.armL.rotation.x = -s * 0.8;
  mesh.userData.armR.rotation.x = s * 0.8;
}

export function createPlayerMesh(rng) {
  const mesh = buildPersonMesh(rng, '#ffb02e'); // Danny's yellow jacket
  return mesh;
}

export function spawnPeds(G, count) {
  for (let i = 0; i < count; i += 1) {
    const pt = roadPoint(G.city, G.rng);
    const mesh = buildPersonMesh(G.rng);
    mesh.position.set(pt.x + range(G.rng, -4, 4), 0, pt.z + range(G.rng, -4, 4));
    G.scene.add(mesh);
    G.peds.push({
      mesh, x: mesh.position.x, z: mesh.position.z,
      heading: G.rng() * Math.PI * 2,
      speed: range(G.rng, 1.0, 1.8),
      state: 'walk', health: 50, fleeX: 0, fleeZ: 0, phase: G.rng() * 6,
      tx: pt.x, tz: pt.z,
    });
  }
}

export function updatePeds(G, dt) {
  for (const ped of [...G.peds]) {
    if (ped.state === 'dead') continue;
    let tx = ped.tx;
    let tz = ped.tz;
    let speed = ped.speed;
    if (ped.state === 'flee') {
      tx = ped.fleeX;
      tz = ped.fleeZ;
      speed = 4.2;
      if (Math.hypot(tx - ped.x, tz - ped.z) < 2) ped.state = 'walk';
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      const pt = roadPoint(G.city, G.rng);
      ped.tx = pt.x;
      ped.tz = pt.z;
      continue;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    const hit = collideCircle(G.city, ped.x, ped.z, 0.5);
    ped.x = hit.x;
    ped.z = hit.z;
    ped.phase += dt * speed * 4;
    walkAnim(ped.mesh, ped.phase, Math.min(1, speed / 2));
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    // Hit by the player's car: knocked down, driver wanted.
    const car = G.playerCar;
    if (car && Math.hypot(car.x - ped.x, car.z - ped.z) < 2.6 && Math.abs(car.speed) > 3) {
      killPed(G, ped, true);
    }
  }
}

export function fleeFrom(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.state === 'dead') continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    const d = Math.hypot(dx, dz);
    if (d < radius && d > 0.01) {
      ped.state = 'flee';
      ped.fleeX = ped.x + (dx / d) * 30;
      ped.fleeZ = ped.z + (dz / d) * 30;
    }
  }
}

export function killPed(G, ped, byCar) {
  ped.state = 'dead';
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.3;
  G.wanted.heat = Math.min(100, G.wanted.heat + (byCar ? 25 : 30));
  fleeFrom(G, ped.x, ped.z, 25);
  setTimeout(() => {
    G.scene.remove(ped.mesh);
    const i = G.peds.indexOf(ped);
    if (i >= 0) G.peds.splice(i, 1);
  }, 9000);
}

export function updatePlayerOnFoot(G, dt, input) {
  const p = G.player;
  const run = input.run ? 2 : 1;
  const speed = 5.2 * run;
  let mx = 0;
  let mz = 0;
  if (input.forward) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  if (mx !== 0 || mz !== 0) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    // Movement is relative to the camera yaw.
    const cy = G.camYaw;
    const wx = mx * Math.cos(cy) - mz * Math.sin(cy);
    const wz = mx * Math.sin(cy) + mz * Math.cos(cy);
    const nx = p.x + wx * speed * dt;
    const nz = p.z + wz * speed * dt;
    const hit = collideCircle(G.city, nx, nz, 0.55);
    p.x = hit.x;
    p.z = hit.z;
    p.heading = Math.atan2(wx, wz);
    p.phase += dt * speed * 1.6;
    walkAnim(p.mesh, p.phase, run);
    p.moving = true;
  } else {
    p.moving = false;
    walkAnim(p.mesh, p.phase, 0);
  }
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  // Slow health regen out of combat.
  if (G.time - p.lastHurt > 8 && p.health > 0 && p.health < 100) {
    p.health = Math.min(100, p.health + 2 * dt);
  }
}

export function spawnCops(G, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = G.rng() * Math.PI * 2;
    const x = G.player.x + Math.sin(angle) * range(G.rng, 25, 40);
    const z = G.player.z + Math.cos(angle) * range(G.rng, 25, 40);
    const mesh = buildPersonMesh(G.rng, '#1c2f4a'); // dark blue uniform
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.cops.push({
      mesh, x, z, heading: 0, speed: 5.6,
      punchAt: 0, phase: G.rng() * 6,
    });
  }
}

export function updateCops(G, dt) {
  const p = G.player;
  for (const cop of [...G.cops]) {
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
    if (dist > 2.2) {
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      const hit = collideCircle(G.city, cop.x, cop.z, 0.5);
      cop.x = hit.x;
      cop.z = hit.z;
      cop.phase += dt * 9;
      walkAnim(cop.mesh, cop.phase, 1);
    } else {
      // Brawl: a punch every 0.9 s.
      cop.punchAt -= dt;
      if (cop.punchAt <= 0) {
        cop.punchAt = 0.9;
        damagePlayer(G, 7);
        p.lastHurt = G.time;
        G.audio.punch();
      }
      walkAnim(cop.mesh, cop.phase, 0);
    }
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
  }
  // Busted: low health and a cop right on top of him.
  if (p.health <= 25 && G.cops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 2.5)) {
    G.endGame('busted');
  }
  // Cull cops when the heat is gone.
  if (G.wanted.stars === 0 && G.cops.length > 0) {
    for (const cop of [...G.cops]) {
      if (Math.hypot(cop.x - p.x, cop.z - p.z) > 60) {
        G.scene.remove(cop.mesh);
        G.cops.splice(G.cops.indexOf(cop), 1);
      }
    }
  }
}
