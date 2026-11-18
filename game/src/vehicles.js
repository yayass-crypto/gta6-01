// Vehicles for Solmar Heat: player arcade driving, AI traffic, police chase.
import * as THREE from 'three';
import { mulberry32, rand, randi, choice, clamp, lerp } from './common.js';
import { roadLines, HALF, blockCenter } from './city.js';

export const CAR_TYPES = {
  sedan: { len: 4.4, wid: 2.0, top: 26, accel: 14, grip: 2.6, label: 'SEDAN' },
  sports: { len: 4.2, wid: 1.9, top: 38, accel: 20, grip: 3.4, label: 'SPORTS' },
  taxi: { len: 4.4, wid: 2.0, top: 27, accel: 15, grip: 2.7, label: 'TAXI' },
  van: { len: 5.4, wid: 2.2, top: 21, accel: 11, grip: 2.2, label: 'VAN' },
  truck: { len: 6.4, wid: 2.4, top: 19, accel: 10, grip: 2.0, label: 'TRUCK' },
  police: { len: 4.6, wid: 2.0, top: 33, accel: 18, grip: 3.2, label: 'POLICE' },
};
const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0x3aa84f, 0xd8d8d8, 0x222831, 0xc2a12e, 0x7a4fc2, 0xe07a2e];

export function makeCarMesh(type, color) {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: type === 'police' ? 0x1a1d22 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, 0.85, t.len), bodyMat);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.82, 0.7, t.len * 0.48),
    new THREE.MeshLambertMaterial({ color: 0x18222e }));
  cabin.position.set(0, 1.35, -t.len * 0.06); g.add(cabin);
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xffb020, emissiveIntensity: 0.6 }));
    sign.position.set(0, 1.85, 0); g.add(sign);
    body.material = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  }
  if (type === 'police') {
    const door = new THREE.Mesh(new THREE.BoxGeometry(t.wid + 0.06, 0.5, 1.6),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    door.position.y = 0.62; g.add(door);
  }
  // headlights
  const hlMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xfff2a0, emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.12), hlMat);
    hl.position.set(sx * (t.wid / 2 - 0.3), 0.62, t.len / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xff2020, emissiveIntensity: 0.4 }));
    tl.position.set(sx * (t.wid / 2 - 0.3), 0.62, -t.len / 2 - 0.02); g.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * (t.wid / 2 - 0.05), 0.38, sz * (t.len / 2 - 0.85));
    g.add(w); wheels.push(w);
  }
  let lightBar = null;
  if (type === 'police') {
    lightBar = { red: null, blue: null };
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    barBase.position.set(0, 1.78, 0); g.add(barBase);
    const rMat = new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 });
    const bMat = new THREE.MeshLambertMaterial({ color: 0x000033, emissive: 0x2050ff, emissiveIntensity: 0.2 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), rMat); r.position.set(-0.28, 1.82, 0); g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), bMat); b.position.set(0.28, 1.82, 0); g.add(b);
    lightBar = { red: rMat, blue: bMat };
  }
  g.userData = { type, wheels, lightBar, headlightMat: hlMat };
  return g;
}

// ---------- smoke particles ----------
export class Smoke {
  constructor(scene) { this.scene = scene; this.parts = []; }
  puff(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }));
      m.position.set(x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5));
      this.scene.add(m);
      this.parts.push({ m, life: 1.2 + Math.random() * 0.6, vy: 1.6 + Math.random() });
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; p.m.position.y += p.vy * dt; p.m.scale.multiplyScalar(1 + dt * 1.4);
      p.m.material.opacity = Math.max(0, p.life * 0.4);
      if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); this.parts.splice(i, 1); }
    }
  }
}

// ---------- player car ----------
export class PlayerCar {
  constructor(scene, smoke) {
    this.scene = scene; this.smoke = smoke;
    this.type = 'sedan'; this.mesh = null;
    this.x = 0; this.z = 0; this.heading = 0; this.speed = 0;
    this.hp = 100; this.active = false; this.smokeT = 0;
  }
  enter(type, color, x, z, heading) {
    this.leave();
    this.type = type;
    this.mesh = makeCarMesh(type, color);
    this.scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading; this.speed = 0; this.hp = 100;
    this.active = true;
  }
  leave() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh = null; }
    this.active = false; this.speed = 0;
  }
  update(dt, input, city, trafficCars) {
    if (!this.active) return;
    const t = CAR_TYPES[this.type];
    const fwd = input.forward ? 1 : input.back ? -1 : 0;
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const drift = input.handbrake;
    if (fwd > 0) this.speed += t.accel * dt * (this.speed < 0 ? 2.2 : 1);
    else if (fwd < 0) this.speed -= (this.speed > 0.5 ? t.accel * 1.6 : t.accel * 0.7) * dt;
    else this.speed = lerp(this.speed, 0, Math.min(1, dt * (drift ? 2.2 : 0.9)));
    if (!drift) this.speed = clamp(this.speed, -t.top * 0.45, t.top);
    else this.speed = clamp(this.speed, -t.top * 0.45, t.top * 1.05);
    const grip = drift ? t.grip * 0.45 : t.grip;
    this.heading += steer * grip * dt * clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed < 0 ? -1 : 1);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const hit = city.collideCircle(nx, nz, 1.6);
    if (hit) {
      // slide along the wall: cancel the blocked component
      const bx = this.x + Math.sin(this.heading) * this.speed * dt * 0.2;
      const bz = this.z + Math.cos(this.heading) * this.speed * dt * 0.2;
      if (!city.collideCircle(bx, nz, 1.6)) { this.x = bx; this.z = nz; }
      else if (!city.collideCircle(nx, bz, 1.6)) { this.x = nx; this.z = bz; }
      if (Math.abs(this.speed) > 8) { this.hp = Math.max(0, this.hp - Math.abs(this.speed) * 0.35); this.smoke.puff(this.x, 1.2, this.z, 2); }
      this.speed *= 0.45;
    } else {
      this.x = clamp(nx, -HALF - 24, HALF + 24);
      this.z = clamp(nz, -HALF - 24, HALF + 62);
    }
    // bump traffic cars
    for (const tc of trafficCars) {
      const dx = tc.x - this.x, dz = tc.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d);
        tc.x += (dx / d) * push; tc.z += (dz / d) * push;
        tc.speed = Math.max(0, tc.speed - 2);
        if (Math.abs(this.speed) > 6) { this.hp = Math.max(0, this.hp - 3); this.smoke.puff(this.x, 1, this.z, 2); }
        this.speed *= 0.8;
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const wob = drift && Math.abs(this.speed) > 10 ? Math.sin(performance.now() / 90) * 0.06 : 0;
    this.mesh.rotation.z = wob;
    if (this.hp < 45) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smoke.puff(this.x, 1.4, this.z, 1); this.smokeT = 0.25; }
    }
  }
}

// ---------- traffic ----------
export class Traffic {
  constructor(scene, seed = 7) {
    this.scene = scene; this.rng = mulberry32(seed); this.cars = [];
    this.spawnN = 18;
  }
  spawnAll() {
    for (let i = 0; i < this.spawnN; i++) this.cars.push(this._makeCar(true));
  }
  _makeCar(anywhere) {
    const rng = this.rng;
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = choice(rng, roadLines);
    const dir = rng() < 0.5 ? 1 : -1;
    const type = choice(rng, ['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck']);
    const mesh = makeCarMesh(type, choice(rng, CAR_COLORS));
    this.scene.add(mesh);
    const pos = anywhere ? rand(rng, -HALF, HALF) : (dir > 0 ? -HALF - 8 : HALF + 8);
    return { mesh, axis, line, pos, dir, lane: dir > 0 ? 2.6 : -2.6, speed: rand(rng, 6, 11), targetSpeed: rand(rng, 7, 12), type, stuck: 0 };
  }
  spawnTyped(type, x, z, parked = false) {
    const mesh = makeCarMesh(type, choice(this.rng, CAR_COLORS));
    this.scene.add(mesh);
    const line = Math.round(z / 36) * 36;
    const c = {
      mesh, axis: 'x', line: Math.max(-HALF, Math.min(HALF, line)), pos: x,
      dir: 1, lane: 2.6, speed: 0, targetSpeed: 8, type, stuck: 0,
      parked, x, z,
    };
    mesh.position.set(x, 0, z);
    this.cars.push(c);
    return c;
  }
  get x() { return 0; }
  carPos(c) {
    return c.axis === 'x' ? { x: c.pos, z: c.line + c.lane } : { x: c.line + c.lane, z: c.pos };
  }
  update(dt, city, player) {
    for (const c of this.cars) {
      if (c.parked) {
        c.mesh.position.set(c.x, 0, c.z);
        continue;
      }
      // traffic light: stop if a red light is just ahead
      const p = this.carPos(c);
      let want = c.targetSpeed;
      const ahead = 10;
      const ax = c.axis === 'x' ? p.x + c.dir * ahead : p.z + c.dir * ahead;
      const az = c.axis === 'x' ? p.z : p.x + c.dir * ahead;
      if (!city.isGreen(c.axis === 'x' ? ax : az, c.axis === 'x' ? az : ax, c.axis)) {
        // only stop if an intersection is actually within the lookahead
        for (const line of roadLines) {
          const d = c.axis === 'x' ? (line - p.x) * c.dir : (line - p.z) * c.dir;
          if (d > 2 && d < 12) { want = 0; break; }
        }
      }
      // car ahead on same lane
      for (const o of this.cars) {
        if (o === c || o.axis !== c.axis || Math.abs(o.line - c.line) > 1 || o.dir !== c.dir) continue;
        const gap = (o.pos - c.pos) * c.dir;
        if (gap > 0 && gap < 9) { want = Math.min(want, Math.max(0, o.speed - 1)); }
      }
      c.speed = lerp(c.speed, want, Math.min(1, dt * 1.5));
      c.pos += c.dir * c.speed * dt;
      // maybe turn at an intersection
      const nearLine = roadLines.find((l) => Math.abs(c.pos - l) < c.speed * dt + 0.6);
      if (nearLine !== undefined && this.rng() < 0.02) {
        const curZ = c.axis === 'x' ? c.line + c.lane : c.pos;
        const curX = c.axis === 'x' ? c.pos : c.line + c.lane;
        if (c.axis === 'x') { c.axis = 'z'; c.line = nearLine; c.pos = curZ; }
        else { c.axis = 'x'; c.line = nearLine; c.pos = curX; }
        c.dir = this.rng() < 0.5 ? 1 : -1;
        c.lane = c.dir > 0 ? 2.6 : -2.6;
      }
      if (c.pos > HALF + 10 || c.pos < -HALF - 10) {
        this.scene.remove(c.mesh);
        const fresh = this._makeCar(false);
        Object.assign(c, fresh);
      }
      const pp = this.carPos(c);
      c.x = pp.x; c.z = pp.z;
      c.mesh.position.set(pp.x, 0, pp.z);
      c.mesh.rotation.y = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    }
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) { this.scene.remove(car.mesh); this.cars.splice(i, 1); this.cars.push(this._makeCar(false)); }
  }
}

// ---------- police ----------
export class Police {
  constructor(scene, smoke) {
    this.scene = scene; this.smoke = smoke; this.cars = []; this.roadblocks = [];
    this.flashT = 0;
  }
  _spawn(x, z) {
    const mesh = makeCarMesh('police', 0x1a1d22);
    this.scene.add(mesh);
    return { mesh, x, z, heading: 0, speed: 0, hp: 60 };
  }
  ensure(count, px, pz, rng) {
    while (this.cars.length < count) {
      const a = rng() * Math.PI * 2;
      const c = this._spawn(px + Math.sin(a) * 55, pz + Math.cos(a) * 55);
      this.cars.push(c);
    }
    while (this.cars.length > count) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
  }
  clearRoadblocks() {
    for (const r of this.roadblocks) this.scene.remove(r.mesh);
    this.roadblocks = [];
  }
  placeRoadblock(px, pz, heading) {
    this.clearRoadblocks();
    for (const off of [-4, 4]) {
      const mesh = makeCarMesh('police', 0x1a1d22);
      const x = px + Math.sin(heading) * 26 + Math.cos(heading) * off;
      const z = pz + Math.cos(heading) * 26 - Math.sin(heading) * off;
      mesh.position.set(x, 0, z); mesh.rotation.y = heading + Math.PI / 2;
      this.scene.add(mesh);
      this.roadblocks.push({ mesh, x, z });
    }
  }
  update(dt, player, city, wanted) {
    this.flashT += dt;
    const flash = Math.floor(this.flashT * 4) % 2 === 0;
    const target = player.inCar ? { x: player.carX, z: player.carZ } : { x: player.x, z: player.z };
    for (const c of this.cars) {
      const dx = target.x - c.x, dz = target.z - c.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
      const top = 24 + wanted * 2;
      c.speed = lerp(c.speed, d > 4 ? top : 8, Math.min(1, dt * 1.2));
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      if (city.collideCircle(c.x, c.z, 1.6)) {
        c.x -= Math.sin(c.heading) * c.speed * dt * 1.4;
        c.z -= Math.cos(c.heading) * c.speed * dt * 1.4;
        c.heading += 0.9;
        c.speed *= 0.5;
      }
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const lb = c.mesh.userData.lightBar;
      if (lb) { lb.red.emissiveIntensity = flash ? 2.2 : 0.15; lb.blue.emissiveIntensity = flash ? 0.15 : 2.2; }
      // ram damage
      if (d < 3.6) {
        if (player.inCar) {
          player.damageCar(14 * dt);
          player.slowCar(0.92);
        } else {
          player.hp = Math.max(0, player.hp - 10 * dt);
        }
        c.speed *= 0.6;
      }
    }
  }
}
