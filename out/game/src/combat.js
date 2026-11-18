// Combat for Solmar Heat: pistol hitscan, fists, pickups, gang enemies.
import * as THREE from 'three';
import { mulberry32, rand, choice, clamp } from './common.js';
import { makePersonMesh } from './people.js';

const PICKUP_COLORS = { health: 0x2fd84f, ammo: 0xfacc15, armour: 0x3a86ff, cash: 0x7dff8a };

export class Combat {
  constructor(scene, W) {
    this.scene = scene; this.W = W;
    this.pickups = [];
    this.gang = [];
    this.tracers = [];
    this.flashT = 0;
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.scene.add(this.flash);
    this.rng = mulberry32(99);
    this.spawnPickups();
  }
  spawnPickups() {
    const spots = [
      { x: -36, z: 30, kind: 'health' }, { x: 72, z: -36, kind: 'ammo' },
      { x: -72, z: -72, kind: 'armour' }, { x: 36, z: 108, kind: 'health' },
      { x: 108, z: -72, kind: 'ammo' }, { x: -108, z: 36, kind: 'cash' },
      { x: 0, z: -72, kind: 'armour' }, { x: -18, z: 72, kind: 'cash' },
    ];
    for (const s of spots) this.addPickup(s.x, s.z, s.kind);
  }
  addPickup(x, z, kind) {
    const mat = new THREE.MeshLambertMaterial({ color: PICKUP_COLORS[kind], emissive: PICKUP_COLORS[kind], emissiveIntensity: 0.5 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
    mesh.position.set(x, 0.9, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z, kind, t: Math.random() * 6, taken: false });
  }
  // ray vs sphere test; returns distance along ray or Infinity
  _raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return Infinity;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 > r * r) return Infinity;
    return tca - Math.sqrt(r * r - d2);
  }
  shoot() {
    const W = this.W, P = W.player;
    if (P.ammo <= 0) { W.audio.blip(180, 0.08, 'square', 0.15); return; }
    P.ammo--;
    W.audio.shot();
    const origin = P.inCar
      ? new THREE.Vector3(P.carX, 1.4, P.carZ)
      : new THREE.Vector3(P.x, 1.5, P.z);
    const heading = P.inCar ? P.carHeading : P.heading;
    const spread = (Math.random() - 0.5) * 0.03;
    const dir = new THREE.Vector3(Math.sin(heading + spread), -0.02, Math.cos(heading + spread));
    this.flash.position.copy(origin).addScaledVector(dir, 1.2);
    this.flash.material.opacity = 0.95; this.flashT = 0.06;
    // find nearest hit among peds, foot cops, gang, traffic cars
    let best = Infinity, hit = null;
    const test = (cx, cy, cz, r, obj) => {
      const t = this._raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, cx, cy, cz, r);
      if (t < best) { best = t; hit = obj; }
    };
    for (const p of W.peds.list) { const pp = W.peds.pos(p); test(pp.x, 1.1, pp.z, 0.9, { kind: 'ped', ref: p }); }
    for (const c of W.cops.list) test(c.x, 1.1, c.z, 0.9, { kind: 'cop', ref: c });
    for (const g of this.gang) test(g.x, 1.1, g.z, 0.9, { kind: 'gang', ref: g });
    for (const tc of W.traffic.cars) test(tc.x, 0.9, tc.z, 1.8, { kind: 'car', ref: tc });
    const end = origin.clone().addScaledVector(dir, Math.min(best === Infinity ? 60 : best, 60));
    this._tracer(origin, end);
    if (!hit) return;
    if (hit.kind === 'ped') {
      W.peds.remove(hit.ref); W.addWanted(2); W.peds.scare(origin.x, origin.z, 30);
      W.hud.popup('+$0 — civilian down', origin.x, origin.z);
    } else if (hit.kind === 'cop') {
      const i = W.cops.list.indexOf(hit.ref);
      if (i >= 0) { W.scene.remove(hit.ref.mesh); W.cops.list.splice(i, 1); }
      W.addWanted(2);
    } else if (hit.kind === 'gang') {
      hit.ref.hp -= 34;
      if (hit.ref.hp <= 0) this.killGang(hit.ref);
    } else if (hit.kind === 'car') {
      hit.ref.speed = Math.max(0, hit.ref.speed - 4);
      W.peds.scare(origin.x, origin.z, 20);
    }
  }
  _tracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }
  punch() {
    const W = this.W, P = W.player;
    if (P.punchCd > 0) return;
    P.punchCd = 0.45;
    W.audio.punch();
    const ox = P.inCar ? P.carX : P.x, oz = P.inCar ? P.carZ : P.z;
    const heading = P.inCar ? P.carHeading : P.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const tryHit = (cx, cz, dmg) => {
      const dx = cx - ox, dz = cz - oz;
      const d = Math.hypot(dx, dz);
      return d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3;
    };
    for (const g of [...this.gang]) {
      if (tryHit(g.x, g.z)) { g.hp -= 25; if (g.hp <= 0) this.killGang(g); }
    }
    for (const c of [...W.cops.list]) {
      if (tryHit(c.x, c.z)) {
        const i = W.cops.list.indexOf(c);
        W.scene.remove(c.mesh); W.cops.list.splice(i, 1); W.addWanted(1);
      }
    }
    const ped = W.peds.nearest(ox, oz, 2.4);
    if (ped) {
      const pp = W.peds.pos(ped);
      if (tryHit(pp.x, pp.z)) { W.peds.remove(ped); W.addWanted(1); W.peds.scare(ox, oz, 26); }
    }
  }
  spawnGang(n, x, z) {
    for (let i = 0; i < n; i++) {
      const mesh = makePersonMesh(0x8a1a1a, choice(this.rng, [0xd8a078, 0xb07a52]), { jacket: true });
      const gx = x + rand(this.rng, -14, 14), gz = z + rand(this.rng, -14, 14);
      mesh.position.set(gx, 0, gz);
      this.scene.add(mesh);
      this.gang.push({ mesh, x: gx, z: gz, hp: 30, shootT: rand(this.rng, 0.5, 2), phase: rand(this.rng, 0, 6) });
    }
  }
  killGang(g) {
    const i = this.gang.indexOf(g);
    if (i >= 0) { this.scene.remove(g.mesh); this.gang.splice(i, 1); }
    const reward = 50 + Math.floor(Math.random() * 100);
    this.W.addCash(reward, g.x, g.z);
    this.W.audio.cash();
  }
  clearGang() {
    for (const g of this.gang) this.scene.remove(g.mesh);
    this.gang = [];
  }
  update(dt) {
    const W = this.W, P = W.player;
    this.flashT -= dt;
    if (this.flashT <= 0) this.flash.material.opacity = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    // pickups bob + collect
    const px = P.inCar ? P.carX : P.x, pz = P.inCar ? P.carZ : P.z;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.t += dt;
      pk.mesh.position.y = 0.9 + Math.sin(pk.t * 2.5) * 0.25;
      pk.mesh.rotation.y += dt * 1.5;
      if (Math.hypot(pk.x - px, pk.z - pz) < 2.2) {
        pk.taken = true; pk.mesh.visible = false;
        W.audio.pickup();
        if (pk.kind === 'health') { P.hp = Math.min(100, P.hp + 40); W.hud.announce('HEALTH +40', 'Patched up.'); }
        if (pk.kind === 'ammo') { P.reserveAmmo += 36; W.hud.announce('AMMO +36', 'Stocked up.'); }
        if (pk.kind === 'armour') { P.armour = Math.min(100, P.armour + 50); W.hud.announce('ARMOUR +50', 'Vest on.'); }
        if (pk.kind === 'cash') { W.addCash(150, pk.x, pk.z); }
        setTimeout(() => { pk.taken = false; pk.mesh.visible = true; }, 45000);
      }
    }
    // gang AI
    for (const g of [...this.gang]) {
      const dx = px - g.x, dz = pz - g.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 6) { g.x += (dx / d) * 3.4 * dt; g.z += (dz / d) * 3.4 * dt; }
      g.phase += dt * 5;
      const u = g.mesh.userData;
      const s = Math.sin(g.phase);
      u.legL.rotation.x = s * 0.5; u.legR.rotation.x = -s * 0.5;
      g.mesh.position.set(g.x, 0, g.z);
      g.mesh.rotation.y = Math.atan2(dx, dz);
      g.shootT -= dt;
      if (g.shootT <= 0 && d < 34) {
        g.shootT = 1.4 + Math.random() * 1.2;
        W.audio.shot();
        const origin = new THREE.Vector3(g.x, 1.5, g.z);
        const spread = (Math.random() - 0.5) * 0.22;
        const dir = new THREE.Vector3(Math.sin(Math.atan2(dx, dz) + spread), -0.02, Math.cos(Math.atan2(dx, dz) + spread));
        const end = origin.clone().addScaledVector(dir, d);
        this._tracer(origin, end);
        if (Math.random() < clamp(0.55 - d * 0.012, 0.12, 0.55)) {
          P.damage(6 + Math.random() * 6);
          W.hud.flashDamage();
        }
      }
    }
  }
}
