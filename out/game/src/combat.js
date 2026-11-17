// combat.js — shooting, melee, damage, pickups.
import * as THREE from 'three';
import { PITCH, HALF } from './city.js';
import { makePersonMesh } from './people.js';

export function initCombat(G) {
  G.ammo = 12; G.ammoReserve = 48;
  G.pickups = [];
  G.tracers = [];
  G.gang = [];
  // pickups: health / armor / ammo crates around town
  const spots = [[-52, -52], [52, 52], [-104, 104], [104, -104], [0, -104], [-156, 52], [156, -52], [52, -156]];
  const kinds = ['health', 'armor', 'ammo', 'health', 'ammo', 'armor', 'health', 'ammo'];
  spots.forEach(([x, z], i) => spawnPickup(G, kinds[i], x, z));
}

export function spawnPickup(G, kind, x, z) {
  const colors = { health: 0x2ecc71, armor: 0x3498db, ammo: 0xf39c12, cash: 0x27ae60 };
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: colors[kind] || 0xffffff }));
  m.position.set(x, 0.8, z);
  m.rotation.y = Math.PI / 4;
  G.scene.add(m);
  const label = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.25, 1.15),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  label.position.set(x, 1.45, z);
  G.scene.add(label);
  G.pickups.push({ kind, mesh: m, label, pos: new THREE.Vector3(x, 0, z), bob: Math.random() * 6 });
}

function rayHit(G, origin, dir, maxDist) {
  // simple sphere tests against peds, foot cops, gang, traffic cars
  let best = null, bd = maxDist;
  const test = (pos, r, ref) => {
    const to = pos.clone().sub(origin);
    const t = to.dot(dir);
    if (t < 0 || t > bd) return;
    const closest = origin.clone().addScaledVector(dir, t);
    if (closest.distanceTo(pos) < r) { bd = t; best = { ref, dist: t }; }
  };
  for (const p of G.peds) test(p.pos.clone().setY(1.1), 0.8, { type: 'ped', obj: p });
  for (const c of G.footCops) test(c.pos.clone().setY(1.1), 0.8, { type: 'cop', obj: c });
  for (const gm of G.gang) test(gm.pos.clone().setY(1.1), 0.8, { type: 'gang', obj: gm });
  for (const t of G.traffic) test(t.pos.clone().setY(0.8), 1.6, { type: 'car', obj: t });
  for (const pc of G.police) test(pc.pos.clone().setY(0.8), 1.6, { type: 'police', obj: pc });
  return best;
}

export function shoot(G) {
  if (G.ammo <= 0) { G.audio?.click(); return; }
  G.ammo -= 1;
  const origin = G.playerPos.clone().setY(1.5);
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  if (G.player.inCar) dir.set(Math.sin(G.playerCar.heading), 0, Math.cos(G.playerCar.heading));
  const hit = rayHit(G, origin, dir, 60);
  const end = hit ? origin.clone().addScaledVector(dir, hit.dist) : origin.clone().addScaledVector(dir, 60);
  // tracer
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a }));
  G.scene.add(line);
  G.tracers.push({ line, t: 0.08 });
  // muzzle flash
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffe27a }));
  flash.position.copy(origin).addScaledVector(dir, 1.2);
  G.scene.add(flash);
  G.tracers.push({ line: flash, t: 0.06, isMesh: true });
  G.audio?.gunshot();
  G.lastShotPos = origin.clone();
  if (hit) {
    if (hit.ref.type === 'ped') {
      const p = hit.ref.obj;
      G.scene.remove(p.mesh);
      G.peds.splice(G.peds.indexOf(p), 1);
      G.addWanted(2, 'killed a civilian');
    } else if (hit.ref.type === 'cop') {
      const c = hit.ref.obj;
      G.scene.remove(c.mesh);
      G.footCops.splice(G.footCops.indexOf(c), 1);
      G.addWanted(2, 'killed a cop');
    } else if (hit.ref.type === 'gang') {
      const gm = hit.ref.obj;
      gm.hp -= 34;
      if (gm.hp <= 0) {
        G.scene.remove(gm.mesh);
        G.gang.splice(G.gang.indexOf(gm), 1);
        G.addCash(120);
        G.hudPopup('+$120', '#7CFC00');
      }
    } else if (hit.ref.type === 'car' || hit.ref.type === 'police') {
      hit.ref.obj.speed = 0;
      G.addWanted(1, 'shot at a car');
    }
  }
  G.hud?.update();
}

export function punch(G) {
  const p = G.player;
  if (p.punchCd > 0) return;
  p.punchCd = 0.45;
  G.audio?.thud();
  const reach = 2.2;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const tryHit = (pos, r, onHit) => {
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
    if (dx * dx + dz * dz < (reach + r) * (reach + r) && (dx * fx + dz * fz) > -0.5) onHit();
  };
  for (const ped of [...G.peds]) {
    tryHit(ped.pos, 0.6, () => {
      G.scene.remove(ped.mesh);
      G.peds.splice(G.peds.indexOf(ped), 1);
      G.addWanted(1, 'assaulted a civilian');
    });
  }
  for (const c of [...G.footCops]) {
    tryHit(c.pos, 0.6, () => {
      G.scene.remove(c.mesh);
      G.footCops.splice(G.footCops.indexOf(c), 1);
      G.addWanted(2, 'beat a cop');
    });
  }
  for (const gm of [...G.gang]) {
    tryHit(gm.pos, 0.6, () => {
      gm.hp -= 25;
      if (gm.hp <= 0) {
        G.scene.remove(gm.mesh);
        G.gang.splice(G.gang.indexOf(gm), 1);
        G.addCash(120);
        G.hudPopup('+$120', '#7CFC00');
      }
    });
  }
}

export function updateCombat(G, dt) {
  for (const tr of [...G.tracers]) {
    tr.t -= dt;
    if (tr.t <= 0) {
      G.scene.remove(tr.line);
      if (tr.line.geometry) tr.line.geometry.dispose();
      G.tracers.splice(G.tracers.indexOf(tr), 1);
    }
  }
  // pickups bob + collect
  for (const pk of [...G.pickups]) {
    pk.bob += dt * 2;
    pk.mesh.position.y = 0.8 + Math.sin(pk.bob) * 0.15;
    pk.mesh.rotation.y += dt;
    pk.label.position.y = 1.45 + Math.sin(pk.bob) * 0.15;
    if (pk.pos.distanceTo(G.playerPos) < 1.6) {
      if (pk.kind === 'health') { G.player.health = Math.min(100, G.player.health + 40); G.hudPopup('+40 HP', '#2ecc71'); }
      if (pk.kind === 'armor') { G.player.armor = Math.min(100, G.player.armor + 50); G.hudPopup('+50 Armour', '#3498db'); }
      if (pk.kind === 'ammo') { G.ammoReserve += 36; G.hudPopup('+36 Ammo', '#f39c12'); }
      G.audio?.chime();
      G.scene.remove(pk.mesh); G.scene.remove(pk.label);
      G.pickups.splice(G.pickups.indexOf(pk), 1);
      // respawn elsewhere later
      setTimeout(() => {
        if (G.state === 'play') spawnPickup(G, pk.kind, (G.rng() - 0.5) * 300, (G.rng() - 0.5) * 300);
      }, 20000);
    }
  }
  // gang members chase the player
  for (const gm of G.gang) {
    const toP = G.playerPos.clone().sub(gm.pos).setY(0);
    const dist = toP.length();
    if (dist > 0.6) {
      toP.normalize();
      gm.heading = Math.atan2(toP.x, toP.z);
      gm.pos.addScaledVector(toP, 4.2 * dt);
      gm.phase += dt * 8;
    }
    gm.mesh.position.copy(gm.pos);
    gm.mesh.rotation.y = gm.heading;
    const u = gm.mesh.userData;
    const swing = Math.sin(gm.phase) * 0.5;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    if (dist < 1.8 && gm.cd <= 0 && !G.player.inCar) {
      gm.cd = 1.0;
      G.hurtPlayer(10, 'gang');
    }
    gm.cd = Math.max(0, gm.cd - dt);
  }
}

export function spawnGang(G, x, z, n) {
  for (let i = 0; i < n; i++) {
    const mesh = makePersonMesh(0x8a5a3b, 0x1a1a1a, 0x111111);
    G.scene.add(mesh);
    const pos = new THREE.Vector3(x + (G.rng() - 0.5) * 12, 0, z + (G.rng() - 0.5) * 12);
    mesh.position.copy(pos);
    G.gang.push({ mesh, pos, heading: 0, hp: 100, cd: 0, phase: G.rng() * 6 });
  }
}
