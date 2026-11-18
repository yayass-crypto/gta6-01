// Procedural city of Solmar: 8x8 blocks, downtown towers, beach strip, port,
// parks, street props, traffic lights, and a day/night lighting mode.
import * as THREE from 'three';
import { mulberry32, rand, randi, choice, facadeTexture, billboardTexture, signTexture } from './common.js';

export const PITCH = 36, HALF = 144;
export const roadLines = [];
for (let j = 0; j <= 8; j++) roadLines.push(-HALF + j * PITCH);
export const blockCenter = (i, j) => ({ x: (i - 3.5) * PITCH, z: (j - 3.5) * PITCH });

const PALETTE = ['#5a6b7d', '#7d6a5a', '#4f5d6e', '#6e5a6e', '#5d7a6a', '#8a7a5a', '#46586a', '#715a4a'];

export function buildCity(scene, seed = 20261118) {
  const rng = mulberry32(seed);
  const colliders = [];
  const lampMats = [];
  const buildingMats = [];
  const trafficLights = [];
  const group = new THREE.Group();
  scene.add(group);

  // --- ground: asphalt base, sidewalks, sand beach, sea ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x2e3138 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 6); group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 60, 26),
    new THREE.MeshLambertMaterial({ color: 0xc2a878 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, HALF + 22); group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 60, 60),
    new THREE.MeshLambertMaterial({ color: 0x1e6f8e }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.04, HALF + 65); group.add(sea);

  // road markings: centre dashes along every road line
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  const dashGeo = new THREE.BoxGeometry(4, 0.06, 0.5);
  for (const line of roadLines) {
    for (let p = -HALF + 9; p < HALF; p += 12) {
      const d1 = new THREE.Mesh(dashGeo, dashMat); d1.position.set(p, 0.06, line); group.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat); d2.rotation.y = Math.PI / 2; d2.position.set(line, 0.06, p); group.add(d2);
    }
  }

  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x8a8d94 });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addBox(w, h, d, x, y, z, mat, collide = true) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    group.add(m);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }

  // --- blocks ---
  const downtown = (i, j) => i >= 2 && i <= 5 && j >= 2 && j <= 5;
  const isPark = (i, j) => (i === 1 && j === 1) || (i === 6 && j === 2);
  const isPort = (i, j) => i === 7 && j >= 0 && j <= 5;
  const isBeach = (i, j) => j === 7;

  const facadeMats = [];
  for (let k = 0; k < 8; k++) {
    facadeMats.push(new THREE.MeshLambertMaterial({
      map: facadeTexture(rng, PALETTE[k], randi(rng, 6, 12), randi(rng, 4, 7), rng() < 0.4 ? choice(rng, ['#ff5ad0', '#4ad8ff', '#ffb020']) : null),
      emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0,
    }));
  }
  // give each facade material its own texture as emissive map for night glow
  facadeMats.forEach((m) => { m.emissiveMap = m.map; });

  const containerCols = [0xc23b2e, 0x2e6fc2, 0x3aa84f, 0xc2a12e, 0x7a4fc2];
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a2e });
  const palmLeaf = new THREE.MeshLambertMaterial({ color: 0x3f9a4a });

  function tree(x, z, palm = false) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), trunkMat);
    trunk.position.set(x, 1.5, z); group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(palm ? 2.6 : 2.2, palm ? 2.2 : 3.4, 7), palm ? palmLeaf : leafMat);
    crown.position.set(x, palm ? 4.2 : 4.6, z); group.add(crown);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const c = blockCenter(i, j);
      // sidewalk slab
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(27, 27), sidewalkMat);
      slab.rotation.x = -Math.PI / 2; slab.position.set(c.x, 0.07, c.z); group.add(slab);
      if (isBeach(i, j)) {
        const sandSlab = new THREE.Mesh(new THREE.PlaneGeometry(27, 27), new THREE.MeshLambertMaterial({ color: 0xc2a878 }));
        sandSlab.rotation.x = -Math.PI / 2; sandSlab.position.set(c.x, 0.08, c.z); group.add(sandSlab);
        for (let k = 0; k < 3; k++) tree(c.x + rand(rng, -10, 10), c.z + rand(rng, -10, 10), true);
        continue;
      }
      if (isPark(i, j)) {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), grassMat);
        grass.rotation.x = -Math.PI / 2; grass.position.set(c.x, 0.09, c.z); group.add(grass);
        for (let k = 0; k < 7; k++) tree(c.x + rand(rng, -11, 11), c.z + rand(rng, -11, 11));
        addBox(6, 1, 2, c.x, 0.5, c.z + 8, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), true);
        continue;
      }
      if (isPort(i, j)) {
        const yard = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshLambertMaterial({ color: 0x6a6f76 }));
        yard.rotation.x = -Math.PI / 2; yard.position.set(c.x, 0.09, c.z); group.add(yard);
        for (let k = 0; k < 5; k++) {
          const col = new THREE.MeshLambertMaterial({ color: choice(rng, containerCols) });
          addBox(8, 2.6, 2.6, c.x + rand(rng, -8, 8), 1.3, c.z + rand(rng, -9, 9), col);
        }
        continue;
      }
      if (downtown(i, j)) {
        const h = rand(rng, 30, 68);
        const mat = choice(rng, facadeMats);
        buildingMats.push(mat);
        const w = rand(rng, 16, 22), d = rand(rng, 16, 22);
        addBox(w, h, d, c.x, h / 2, c.z, mat);
        // rooftop props: AC box + antenna
        addBox(3, 1.5, 3, c.x + 4, h + 0.75, c.z - 3, new THREE.MeshLambertMaterial({ color: 0x555a60 }), false);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        ant.position.set(c.x - 5, h + 4, c.z + 4); group.add(ant);
        // neon shop sign on some towers
        if (rng() < 0.5) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5),
            new THREE.MeshBasicMaterial({ map: signTexture(choice(rng, ['VEGA\'S', 'NEON PALMS', 'PIER 9 BAR', 'SOLMAR COLA', 'TACO TIDE', 'SUNSET MOTORS']), '#141018', choice(rng, ['#ff5ad0', '#4ad8ff', '#ffb020'])) }));
          sign.position.set(c.x, 7, c.z + d / 2 + 0.15); group.add(sign);
        }
      } else {
        // 1-2 smaller buildings per block
        const n = rng() < 0.6 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const h = rand(rng, 8, 24);
          const mat = choice(rng, facadeMats);
          buildingMats.push(mat);
          const w = rand(rng, 9, 13), d = rand(rng, 9, 13);
          const ox = n === 2 ? (k === 0 ? -6 : 6) : 0;
          const oz = n === 2 ? (k === 0 ? -5 : 5) : 0;
          addBox(w, h, d, c.x + ox, h / 2, c.z + oz, mat);
        }
        if (rng() < 0.5) tree(c.x + rand(rng, -9, 9), c.z + rand(rng, -9, 9));
      }
    }
  }

  // --- construction site (block 0,5) ---
  {
    const c = blockCenter(0, 5);
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
    addBox(1.2, 26, 1.2, c.x - 6, 13, c.z, craneMat, true);
    const jib = new THREE.Mesh(boxGeo, craneMat); jib.scale.set(20, 1, 1); jib.position.set(c.x + 2, 25, c.z); group.add(jib);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    cable.position.set(c.x + 10, 21, c.z); group.add(cable);
    addBox(2, 1.2, 2, c.x - 6, 1, c.z + 6, new THREE.MeshLambertMaterial({ color: 0x8a6a3a }), true);
    addBox(2, 1.2, 2, c.x + 6, 1, c.z - 6, new THREE.MeshLambertMaterial({ color: 0x8a6a3a }), true);
  }

  // --- streetlights at every other intersection ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  for (let a = 0; a <= 8; a += 2) {
    for (let b = 0; b <= 8; b += 2) {
      const x = roadLines[a], z = roadLines[b];
      if (Math.abs(z) > HALF + 1 || Math.abs(x) > HALF + 1) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.5, 6), poleMat);
      pole.position.set(x + 5.4, 3.25, z + 5.4); group.add(pole);
      const lm = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd98a, emissiveIntensity: 0.15 });
      lampMats.push(lm);
      const lamp = new THREE.Mesh(lampGeo, lm);
      lamp.position.set(x + 5.4, 6.6, z + 5.4); group.add(lamp);
      colliders.push({ minX: x + 4.9, maxX: x + 5.9, minZ: z + 4.9, maxZ: z + 5.9 });
    }
  }

  // --- traffic lights at downtown intersections ---
  const tlRed = new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0 });
  const tlGreen = new THREE.MeshLambertMaterial({ color: 0x003300, emissive: 0x20ff40, emissiveIntensity: 0 });
  const tlBox = new THREE.MeshLambertMaterial({ color: 0x181a1e });
  for (const [li, lj] of [[3, 3], [3, 5], [5, 3], [5, 5]]) {
    const x = roadLines[li], z = roadLines[lj];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6), poleMat);
    pole.position.set(x + 5.2, 2.75, z - 5.2); group.add(pole);
    const box = new THREE.Mesh(boxGeo, tlBox); box.scale.set(0.7, 1.8, 0.7); box.position.set(x + 5.2, 5.6, z - 5.2); group.add(box);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), tlRed.clone());
    red.position.set(x + 5.2, 6.1, z - 4.8); group.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), tlGreen.clone());
    green.position.set(x + 5.2, 5.2, z - 4.8); group.add(green);
    trafficLights.push({ x, z, red: red.material, green: green.material, phase: 0 });
  }

  // --- billboards with original fake ads ---
  const ads = [
    [['SOLMAR COLA', 'TASTE THE HEAT'], '#c23b2e', '#ffe9a8'],
    [['TACO TIDE', 'OPEN TILL 4AM'], '#2e6fc2', '#ffffff'],
    [['NEON PALMS', 'HOTEL & CASINO'], '#7a2d8a', '#ffd23f'],
    [['SUNSET MOTORS', 'DRIVE IT LIKE YOU STOLE IT'], '#2e8a4f', '#ffffff'],
    [['PIER 9', 'FRESH CATCH DAILY'], '#1e6f8e', '#ffe9a8'],
    [['VEGA\'S', 'NO QUESTIONS ASKED'], '#8a2d2d', '#ffd23f'],
  ];
  ads.forEach(([lines, bg, fg], k) => {
    const bx = roadLines[1 + (k % 4) * 2], bz = k < 3 ? -HALF + 2 : HALF - 2;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 8),
      new THREE.MeshBasicMaterial({ map: billboardTexture(rng, lines, bg, fg) }));
    board.position.set(bx, 9, bz);
    if (bz < 0) board.rotation.y = 0; else board.rotation.y = Math.PI;
    group.add(board);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), poleMat);
    leg.position.set(bx - 5, 3, bz); group.add(leg);
    const leg2 = leg.clone(); leg2.position.x = bx + 5; group.add(leg2);
  });

  // --- named spots for missions ---
  const spots = {
    chopShop: { x: 90, z: 96 },
    bank: { x: -18, z: -30 },
    hideout: { x: -96, z: 90 },
    taxiStand: { x: 6, z: 126 },
    turfCorner: { x: 54, z: -84 },
    race: [
      { x: -108, z: -108 }, { x: 108, z: -108 }, { x: 108, z: 108 },
      { x: -108, z: 108 }, { x: 0, z: -108 },
    ],
    sedanSpawn: { x: 30, z: 40 },
    taxiSpawn: { x: 6, z: 114 },
  };

  // --- lights & sky ---
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60); scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4038, 0.9); scene.add(hemi);
  scene.background = new THREE.Color(0x87b5d8);
  scene.fog = new THREE.Fog(0x87b5d8, 260, 620);

  let night = false;
  function setNight(on) {
    night = on;
    sun.intensity = on ? 0.55 : 2.4;
    sun.color.setHex(on ? 0x8a9fd8 : 0xfff2d8);
    hemi.intensity = on ? 0.35 : 0.9;
    scene.background.setHex(on ? 0x0d1424 : 0x87b5d8);
    scene.fog.color.setHex(on ? 0x0d1424 : 0x87b5d8);
    scene.fog.near = on ? 160 : 260; scene.fog.far = on ? 420 : 620;
    lampMats.forEach((m) => { m.emissiveIntensity = on ? 1.6 : 0.15; });
    buildingMats.forEach((m) => { m.emissiveIntensity = on ? 0.55 : 0; });
  }

  let phaseT = 0;
  function update(dt) {
    phaseT += dt;
    const phase = Math.floor(phaseT / 8) % 2;
    for (const tl of trafficLights) {
      tl.phase = phase;
      tl.red.emissiveIntensity = phase === 0 ? 0.2 : 1.8;
      tl.green.emissiveIntensity = phase === 0 ? 1.8 : 0.2;
    }
  }
  // axis 'x' means travelling along x; green when phase 0
  function isGreen(x, z, axis) {
    for (const tl of trafficLights) {
      if (Math.abs(tl.x - x) < 9 && Math.abs(tl.z - z) < 9) {
        return axis === 'x' ? tl.phase === 0 : tl.phase === 1;
      }
    }
    return true;
  }

  function collideCircle(x, z, r) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return { cx, cz, dx, dz };
    }
    return null;
  }

  return { group, colliders, trafficLights, spots, setNight, update, isGreen, collideCircle, isNight: () => night };
}
