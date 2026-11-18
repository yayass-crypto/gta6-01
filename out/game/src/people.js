// People of Solmar: the on-foot player, sidewalk pedestrians, foot police.
import * as THREE from 'three';
import { mulberry32, rand, choice, clamp, lerp } from './common.js';
import { roadLines, HALF } from './city.js';

const SKIN = [0xd8a078, 0xb07a52, 0x8a5a34, 0xe8b88a];
const SHIRT = [0xc23b2e, 0x2e6fc2, 0x3aa84f, 0xd8d8d8, 0xc2a12e, 0x7a4fc2, 0xe07a2e, 0x222831];

export function makePersonMesh(shirtColor, skinColor, opts = {}) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants ?? 0x2a3140 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirt);
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.72; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.26), pants);
  legL.position.set(-0.16, 0.33, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), shirt);
  armL.position.set(-0.42, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    cap.position.y = 1.96; g.add(cap);
  }
  if (opts.jacket) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.4), new THREE.MeshLambertMaterial({ color: 0x8a1a1a }));
    j.position.y = 1.05; g.add(j);
  }
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

export class OnFoot {
  constructor(scene) {
    this.scene = scene;
    this.mesh = makePersonMesh(0xd8a020, 0xd8a078, { jacket: true });
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.heading = 0; this.speed = 0;
    this.hp = 100; this.armour = 0; this.ammo = 24; this.reserveAmmo = 48;
    this.weapon = 'pistol'; this.punchCd = 0; this.walkPhase = 0;
    this.visible = false;
  }
  show(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.mesh.visible = true; this.visible = true;
    this.mesh.position.set(x, 0, z); this.mesh.rotation.y = heading;
  }
  hide() { this.mesh.visible = false; this.visible = false; }
  damage(amount) {
    let left = amount;
    if (this.armour > 0) { const absorbed = Math.min(this.armour, left * 0.6); this.armour -= absorbed; left -= absorbed; }
    this.hp = Math.max(0, this.hp - left);
  }
  update(dt, input, camYaw, city) {
    if (!this.visible) return;
    this.punchCd = Math.max(0, this.punchCd - dt);
    // WASD relative to camera yaw
    let mx = 0, mz = 0;
    if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.left) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
    if (input.right) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
    const len = Math.hypot(mx, mz);
    const run = input.run ? 8.5 : 4.6;
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      const nx = this.x + mx * run * dt, nz = this.z + mz * run * dt;
      if (!city.collideCircle(nx, this.z, 0.55)) this.x = nx;
      if (!city.collideCircle(this.x, nz, 0.55)) this.z = nz;
      this.x = clamp(this.x, -HALF - 20, HALF + 20);
      this.z = clamp(this.z, -HALF - 20, HALF + 58);
      this.speed = run;
      this.walkPhase += dt * run * 1.6;
    } else {
      this.speed = lerp(this.speed, 0, Math.min(1, dt * 8));
      this.walkPhase += dt * 1.2;
    }
    const s = Math.sin(this.walkPhase);
    const u = this.mesh.userData;
    const amp = clamp(this.speed / 8.5, 0.08, 1) * 0.7;
    u.legL.rotation.x = s * amp; u.legR.rotation.x = -s * amp;
    u.armL.rotation.x = -s * amp * 0.8; u.armR.rotation.x = s * amp * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

// ---------- pedestrians ----------
export class Peds {
  constructor(scene, seed = 21) {
    this.scene = scene; this.rng = mulberry32(seed); this.list = [];
  }
  spawnAll(n = 30) {
    for (let i = 0; i < n; i++) this.list.push(this._make(true));
  }
  _make(anywhere) {
    const rng = this.rng;
    const mesh = makePersonMesh(choice(rng, SHIRT), choice(rng, SKIN));
    this.scene.add(mesh);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = choice(rng, roadLines);
    const pos = anywhere ? rand(rng, -HALF, HALF) : rand(rng, -HALF, HALF);
    const dir = rng() < 0.5 ? 1 : -1;
    return { mesh, axis, line, pos, dir, speed: rand(rng, 1.2, 2.2), flee: 0, fx: 0, fz: 0, phase: rand(rng, 0, 6) };
  }
  scare(x, z, radius = 26) {
    for (const p of this.list) {
      const pp = this.pos(p);
      if (Math.hypot(pp.x - x, pp.z - z) < radius) { p.flee = 3 + Math.random() * 2; p.fx = x; p.fz = z; }
    }
  }
  pos(p) {
    return p.axis === 'x' ? { x: p.pos, z: p.line + (p.dir > 0 ? 6 : -6) } : { x: p.line + (p.dir > 0 ? 6 : -6), z: p.pos };
  }
  update(dt, city) {
    for (const p of this.list) {
      let sp = p.speed;
      if (p.flee > 0) {
        p.flee -= dt; sp = 6.5;
        const pp = this.pos(p);
        const dx = pp.x - p.fx, dz = pp.z - p.fz;
        const d = Math.hypot(dx, dz) || 1;
        const nx = pp.x + (dx / d) * sp * dt, nz = pp.z + (dz / d) * sp * dt;
        if (!city.collideCircle(nx, pp.z, 0.5)) { /* flee along free axis */ }
        // flee by moving the underlying pos along its axis away from the scare point
        if (p.axis === 'x') p.pos += (dx >= 0 ? 1 : -1) * sp * dt;
        else p.pos += (dz >= 0 ? 1 : -1) * sp * dt;
      } else {
        p.pos += p.dir * sp * dt;
        if (p.pos > HALF + 4) { p.pos = HALF + 4; p.dir = -1; }
        if (p.pos < -HALF - 4) { p.pos = -HALF - 4; p.dir = 1; }
      }
      const pp = this.pos(p);
      p.phase += dt * sp * 3.2;
      const s = Math.sin(p.phase);
      const u = p.mesh.userData;
      u.legL.rotation.x = s * 0.5; u.legR.rotation.x = -s * 0.5;
      u.armL.rotation.x = -s * 0.4; u.armR.rotation.x = s * 0.4;
      p.mesh.position.set(pp.x, 0, pp.z);
      const heading = p.flee > 0
        ? Math.atan2(pp.x - p.fx, pp.z - p.fz)
        : p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
      p.mesh.rotation.y = heading;
    }
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.list) {
      const pp = this.pos(p);
      const d = Math.hypot(pp.x - x, pp.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) { this.scene.remove(p.mesh); this.list.splice(i, 1); this.list.push(this._make(true)); }
  }
}

// ---------- foot police ----------
export class FootCops {
  constructor(scene) {
    this.scene = scene; this.list = [];
  }
  ensure(count, px, pz, rng) {
    while (this.list.length < count) {
      const a = rng() * Math.PI * 2;
      const mesh = makePersonMesh(0x1a2a4a, choice(rng, SKIN), { cap: true, pants: 0x1a2a4a });
      const x = px + Math.sin(a) * 40, z = pz + Math.cos(a) * 40;
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.list.push({ mesh, x, z, heading: 0, closeT: 0, phase: rng() * 6 });
    }
    while (this.list.length > count) {
      const c = this.list.pop();
      this.scene.remove(c.mesh);
    }
  }
  clear() {
    for (const c of this.list) this.scene.remove(c.mesh);
    this.list = [];
  }
  update(dt, player, city) {
    for (const c of this.list) {
      const dx = player.x - c.x, dz = player.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      c.heading = Math.atan2(dx, dz);
      const sp = d > 3 ? 6.2 : 2.2;
      const nx = c.x + (dx / d) * sp * dt, nz = c.z + (dz / d) * sp * dt;
      if (!city.collideCircle(nx, c.z, 0.5)) c.x = nx;
      if (!city.collideCircle(c.x, nz, 0.5)) c.z = nz;
      c.phase += dt * sp * 2.4;
      const s = Math.sin(c.phase);
      const u = c.mesh.userData;
      u.legL.rotation.x = s * 0.55; u.legR.rotation.x = -s * 0.55;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      if (d < 2.2) {
        c.closeT += dt;
        player.damage(6 * dt);
      } else c.closeT = Math.max(0, c.closeT - dt);
    }
  }
  maxCloseT() { return this.list.reduce((m, c) => Math.max(m, c.closeT), 0); }
}
