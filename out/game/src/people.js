// people.js — player on foot, pedestrians, foot cops.
import * as THREE from 'three';
import { collideCircle, ROAD, PITCH, HALF } from './city.js';

const SKINS = [0xe8b88a, 0x8a5a3b, 0xd9a066, 0x6b4423, 0xf0c8a0];
const SHIRTS = [0x2e86c1, 0xc0392b, 0x27ae60, 0xf39c12, 0x8e44ad, 0xecf0f1, 0x1abc9c];

export function makePersonMesh(skin, shirt, pants) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skinMat);
  head.position.y = 1.62; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.66; g.add(hair);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.08; g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pantsMat);
  legL.position.set(-0.16, 0.36, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirtMat);
  armL.position.set(-0.42, 1.08, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR, head };
  return g;
}

export function makePlayer(G) {
  const mesh = makePersonMesh(0xe8b88a, 0xc0392b, 0x223344);
  G.scene.add(mesh);
  return {
    mesh, pos: new THREE.Vector3(0, 0, 8), heading: 0,
    health: 100, armor: 0, inCar: false, speed: 0,
    punchCd: 0, walkPhase: 0,
  };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  if (p.inCar) return;
  const k = G.keys;
  const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
  const strafe = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
  const run = !!k['ShiftLeft'] || !!k['ShiftRight'];
  const speed = run ? 9 : 5;
  // movement relative to camera yaw
  const cy = G.camYaw;
  const mx = Math.sin(cy) * fwd + Math.cos(cy) * strafe;
  const mz = Math.cos(cy) * fwd - Math.sin(cy) * strafe;
  const len = Math.hypot(mx, mz) || 1;
  if (fwd || strafe) {
    p.pos.x += (mx / len) * speed * dt;
    p.pos.z += (mz / len) * speed * dt;
    p.heading = Math.atan2(mx, mz);
    p.walkPhase += dt * speed * 1.6;
    p.speed = speed;
  } else p.speed = 0;
  collideCircle(G, p.pos, 0.55);
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
  const u = p.mesh.userData;
  const swing = p.speed > 0 ? Math.sin(p.walkPhase) * 0.55 : 0;
  u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
  p.punchCd = Math.max(0, p.punchCd - dt);
  // slow health regen
  if (p.health < 100 && G.stars === 0) p.health = Math.min(100, p.health + 1.2 * dt);
  G.playerPos.copy(p.pos);
}

export function spawnPeds(G) {
  G.peds = [];
  for (let i = 0; i < 24; i++) {
    const rng = G.rng;
    const mesh = makePersonMesh(
      SKINS[Math.floor(rng() * SKINS.length)],
      SHIRTS[Math.floor(rng() * SHIRTS.length)],
      0x222831);
    G.scene.add(mesh);
    // stand on a sidewalk: near a road line, offset onto the block edge
    const line = G.roadLines[Math.floor(rng() * G.roadLines.length)];
    const along = -HALF + rng() * HALF * 2;
    const side = rng() < 0.5 ? 1 : -1;
    const pos = new THREE.Vector3(
      rng() < 0.5 ? line + side * (ROAD / 2 + 2.5) : along,
      0,
      rng() < 0.5 ? along : line + side * (ROAD / 2 + 2.5));
    const ped = {
      mesh, pos, heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 0.9, state: 'walk',
      fleeT: 0, target: new THREE.Vector3(pos.x + (rng() - 0.5) * 40, 0, pos.z + (rng() - 0.5) * 40),
      phase: rng() * 6,
    };
    mesh.position.copy(pos);
    G.peds.push(ped);
  }
}

export function updatePeds(G, dt) {
  const threat = G.lastShotPos; // gunfire / crash scares peds
  for (const ped of G.peds) {
    let flee = false;
    if (threat && ped.pos.distanceTo(threat) < 26) flee = true;
    if (G.player.inCar && G.playerCar && Math.abs(G.playerCar.speed) > 12 &&
        ped.pos.distanceTo(G.playerCar.pos) < 10) flee = true;
    if (flee) {
      ped.state = 'flee';
      ped.fleeT = 2.5;
      const away = ped.pos.clone().sub(G.playerPos).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      ped.target.copy(ped.pos).add(away.normalize().multiplyScalar(30));
    } else if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) ped.state = 'walk';
    }
    const speed = ped.state === 'flee' ? 5.5 : ped.speed;
    const toT = ped.target.clone().sub(ped.pos).setY(0);
    if (toT.length() < 2) {
      // pick a new nearby sidewalk target
      ped.target.set(
        Math.max(-HALF, Math.min(HALF, ped.pos.x + (G.rng() - 0.5) * 60)),
        0,
        Math.max(-HALF, Math.min(HALF, ped.pos.z + (G.rng() - 0.5) * 60)));
    } else {
      toT.normalize();
      ped.heading = Math.atan2(toT.x, toT.z);
      ped.pos.addScaledVector(toT, speed * dt);
      ped.phase += dt * speed * 2;
    }
    collideCircle(G, ped.pos, 0.5);
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = ped.heading;
    const u = ped.mesh.userData;
    const swing = Math.sin(ped.phase) * 0.5;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
  }
}

export function spawnFootCop(G) {
  const mesh = makePersonMesh(0xd9a066, 0x1a3a6b, 0x101418);
  G.scene.add(mesh);
  const a = G.rng() * Math.PI * 2;
  const cop = {
    mesh, pos: new THREE.Vector3(G.playerPos.x + Math.cos(a) * 18, 0, G.playerPos.z + Math.sin(a) * 18),
    heading: 0, speed: 4.6, punchCd: 0, phase: 0,
  };
  mesh.position.copy(cop.pos);
  G.footCops.push(cop);
  return cop;
}

export function updateFootCops(G, dt) {
  for (const cop of G.footCops) {
    const toP = G.playerPos.clone().sub(cop.pos).setY(0);
    const dist = toP.length();
    if (dist > 0.5) {
      toP.normalize();
      cop.heading = Math.atan2(toP.x, toP.z);
      cop.pos.addScaledVector(toP, cop.speed * dt);
      cop.phase += dt * 8;
    }
    collideCircle(G, cop.pos, 0.5);
    cop.mesh.position.copy(cop.pos);
    cop.mesh.rotation.y = cop.heading;
    const u = cop.mesh.userData;
    const swing = Math.sin(cop.phase) * 0.5;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    cop.punchCd = Math.max(0, cop.punchCd - dt);
    if (dist < 1.6 && cop.punchCd <= 0 && !G.player.inCar) {
      cop.punchCd = 0.9;
      G.hurtPlayer(12, 'cop');
      G.audio?.thud();
    }
  }
  // despawn far cops when wanted is 0
  if (G.stars === 0 && G.footCops.length) {
    for (const cop of G.footCops) G.scene.remove(cop.mesh);
    G.footCops.length = 0;
  }
}
