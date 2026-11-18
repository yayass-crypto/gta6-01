// Combat: hitscan pistol, fists, pickups and the gang shooters of mission 3.
// Shots are cone-tested against people and police cars with plain math — no
// raycaster — and leave a fading tracer line plus a muzzle flash.
import * as THREE from 'three';
import { range } from './rng.js';
import { fleeFrom, killPed } from './people.js';
import { damagePlayer } from './vehicles.js';

export function updateTracers(G, dt) {
  for (const t of [...G.tracers]) {
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.12);
    if (t.life <= 0) {
      G.scene.remove(t.line);
      G.tracers.splice(G.tracers.indexOf(t), 1);
    }
  }
  if (G.muzzle) {
    G.muzzle.life -= dt;
    G.muzzle.light.intensity = Math.max(0, G.muzzle.life * 40);
    if (G.muzzle.life <= 0) {
      G.scene.remove(G.muzzle.light);
      G.muzzle = null;
    }
  }
}

function addTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 1 }));
  G.scene.add(line);
  G.tracers.push({ line, life: 0.12 });
  const light = new THREE.PointLight(0xffc860, 14, 12);
  light.position.copy(from);
  G.scene.add(light);
  G.muzzle = { light, life: 0.06 };
}

// Nearest person inside a cone from `from` along `dir` (radians), within range.
function coneTarget(G, from, dir, rangeM, halfAngle) {
  let best = null;
  let bestD = rangeM;
  const consider = (x, z, obj) => {
    const dx = x - from.x;
    const dz = z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) return;
    const ang = Math.atan2(dx, dz);
    let diff = ang - dir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < halfAngle) { best = obj; bestD = d; }
  };
  for (const ped of G.peds) if (ped.state !== 'dead') consider(ped.x, ped.z, { kind: 'ped', ref: ped, dist: bestD });
  for (const cop of G.cops) consider(cop.x, cop.z, { kind: 'cop', ref: cop, dist: bestD });
  for (const g of G.gang) if (g.health > 0) consider(g.x, g.z, { kind: 'gang', ref: g, dist: bestD });
  return best;
}

export function shoot(G) {
  const p = G.player;
  if (p.ammo <= 0) {
    G.audio.click();
    return;
  }
  p.ammo -= 1;
  G.audio.shot();
  const from = new THREE.Vector3(p.x, 1.45, p.z);
  const dir = p.heading + range(G.rng, -0.03, 0.03);
  const target = coneTarget(G, { x: p.x, z: p.z }, dir, 46, 0.16);
  const end = target
    ? new THREE.Vector3(target.ref.x, 1.2, target.ref.z)
    : new THREE.Vector3(p.x + Math.sin(dir) * 46, 1.2, p.z + Math.cos(dir) * 46);
  addTracer(G, from, end);
  if (target) {
    if (target.kind === 'ped') {
      target.ref.health -= 50;
      if (target.ref.health <= 0) killPed(G, target.ref, false);
      else fleeFrom(G, target.ref.x, target.ref.z, 20);
    } else if (target.kind === 'cop') {
      G.wanted.heat = Math.min(100, G.wanted.heat + 30);
      const i = G.cops.indexOf(target.ref);
      if (i >= 0) {
        G.scene.remove(target.ref.mesh);
        G.cops.splice(i, 1);
      }
    } else if (target.kind === 'gang') {
      target.ref.health -= 50;
      if (target.ref.health <= 0) {
        target.ref.mesh.rotation.x = -Math.PI / 2;
        setTimeout(() => G.scene.remove(target.ref.mesh), 5000);
      }
    }
  }
  fleeFrom(G, p.x, p.z, 18);
}

export function punch(G) {
  const p = G.player;
  G.audio.punch();
  const from = { x: p.x, z: p.z };
  const target = coneTarget(G, from, p.heading, 2.6, 0.7);
  if (!target) return;
  if (target.kind === 'ped') {
    target.ref.health -= 35;
    if (target.ref.health <= 0) killPed(G, target.ref, false);
    else fleeFrom(G, target.ref.x, target.ref.z, 18);
  } else if (target.kind === 'cop') {
    G.wanted.heat = Math.min(100, G.wanted.heat + 12);
    const i = G.cops.indexOf(target.ref);
    if (i >= 0) {
      G.scene.remove(target.ref.mesh);
      G.cops.splice(i, 1);
    }
  } else if (target.kind === 'gang') {
    target.ref.health -= 35;
    if (target.ref.health <= 0) target.ref.mesh.rotation.x = -Math.PI / 2;
  }
}

// Gang shooters: stand their ground and fire at the player with spread.
export function updateGang(G, dt) {
  const p = G.player;
  for (const g of G.gang) {
    if (g.health <= 0) continue;
    const dx = p.x - g.x;
    const dz = p.z - g.z;
    const dist = Math.hypot(dx, dz);
    g.heading = Math.atan2(dx, dz);
    g.mesh.rotation.y = g.heading;
    g.shootAt -= dt;
    if (dist < 42 && g.shootAt <= 0) {
      g.shootAt = range(G.rng, 0.9, 1.6);
      const from = new THREE.Vector3(g.x, 1.45, g.z);
      const dir = g.heading + range(G.rng, -0.09, 0.09);
      addTracer(G, from, new THREE.Vector3(p.x, 1.3, p.z));
      if (Math.abs(dir - Math.atan2(dx, dz)) < 0.12 && dist < 40) {
        damagePlayer(G, 8);
        p.lastHurt = G.time;
      }
      G.audio.shot();
    }
  }
}

export function spawnPickups(G) {
  const defs = [
    { kind: 'health', x: 26, z: 130, color: '#3ddc5f' },
    { kind: 'health', x: -130, z: -78, color: '#3ddc5f' },
    { kind: 'armour', x: -26, z: -130, color: '#4aa8ff' },
    { kind: 'armour', x: 130, z: 26, color: '#4aa8ff' },
    { kind: 'ammo', x: 78, z: -130, color: '#ffd23e' },
    { kind: 'ammo', x: -130, z: 78, color: '#ffd23e' },
  ];
  for (const d of defs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.7 }),
    );
    mesh.position.set(d.x, 1.1, d.z);
    G.scene.add(mesh);
    G.pickups.push({ ...d, mesh, taken: false, respawnAt: 0, phase: 0 });
  }
}

export function updatePickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (pk.taken) {
      if (G.time > pk.respawnAt) {
        pk.taken = false;
        pk.mesh.visible = true;
      }
      continue;
    }
    pk.phase += dt * 3;
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1.1 + Math.sin(pk.phase) * 0.15;
    if (Math.hypot(p.x - pk.x, p.z - pk.z) < 1.8) {
      pk.taken = true;
      pk.mesh.visible = false;
      pk.respawnAt = G.time + 60;
      G.audio.pickup();
      if (pk.kind === 'health') p.health = Math.min(100, p.health + 50);
      if (pk.kind === 'armour') p.armour = Math.min(100, p.armour + 50);
      if (pk.kind === 'ammo') p.ammoReserve += 24;
      G.popup(pk.kind === 'health' ? '+50 HEALTH' : pk.kind === 'armour' ? '+50 ARMOUR' : '+24 AMMO');
    }
  }
}
