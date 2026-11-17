// city.js — procedural city of Solmar: grid, roads, buildings, props, beach, port.
// Every visual is generated in code (canvas textures + box geometry). No external assets.
import * as THREE from 'three';

export const PITCH = 52;      // block pitch (road centre to road centre)
export const ROAD = 12;       // road width
export const HALF = 208;      // world half-extent (8 blocks * 52 / 2)
export const BLOCK = PITCH - ROAD; // 40

// Deterministic RNG (mulberry32) so ?shot= scenes are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildingTexture(rng, hue) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = `hsl(${hue}, ${18 + rng() * 20}%, ${28 + rng() * 22}%)`;
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  // windows
  const cols = 4 + Math.floor(rng() * 3);
  const rows = 8 + Math.floor(rng() * 6);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.35;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#1c2733' : '#2b3a4a');
      g.fillRect(8 + x * (112 / cols), 10 + y * (232 / rows), 112 / cols - 6, 232 / rows - 6);
    }
  }
  // ground floor: awning / shop front
  g.fillStyle = rng() < 0.5 ? '#3d2f23' : '#22303a';
  g.fillRect(0, 228, 128, 28);
  g.fillStyle = `hsl(${Math.floor(rng() * 360)}, 70%, 55%)`;
  g.fillRect(6, 232, 116, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const w2u = (x) => ((x + HALF) / (HALF * 2)) * S; // world -> px
  // base: sidewalk grey
  g.fillStyle = '#8d8f8a'; g.fillRect(0, 0, S, S);
  // parks (a few blocks are green)
  const parks = [[-2, -1], [1, 2], [3, -3], [-3, 3]];
  for (const [bi, bj] of parks) {
    const x = w2u(bi * PITCH - BLOCK / 2), y = w2u(bj * PITCH - BLOCK / 2);
    g.fillStyle = '#4d7a3a'; g.fillRect(x, y, (BLOCK / (HALF * 2)) * S, (BLOCK / (HALF * 2)) * S);
    g.fillStyle = '#5d8a46';
    g.beginPath(); g.arc(x + 40, y + 40, 26, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 130, y + 110, 30, 0, 7); g.fill();
  }
  // beach strip (south edge, z > 180)
  g.fillStyle = '#d9c184';
  g.fillRect(0, w2u(176), S, S - w2u(176));
  g.fillStyle = '#3f7fa8';
  g.fillRect(0, w2u(196), S, S - w2u(196));
  // port district (east edge, x > 176): concrete + container rows
  g.fillStyle = '#7a7d7a'; g.fillRect(w2u(176), 0, S - w2u(176), w2u(176));
  // roads: dark asphalt along every grid line
  g.fillStyle = '#33363b';
  for (let k = -4; k <= 4; k++) {
    const p = w2u(k * PITCH);
    const w = (ROAD / (HALF * 2)) * S;
    g.fillRect(p - w / 2, 0, w, S);
    g.fillRect(0, p - w / 2, S, w);
  }
  // road centre dashes (yellow) + edge lines (white)
  g.fillStyle = '#c9a227';
  for (let k = -4; k <= 4; k++) {
    const p = w2u(k * PITCH);
    for (let d = -HALF; d < HALF; d += 16) {
      g.fillRect(p - 1.5, w2u(d), 3, 7);
      g.fillRect(w2u(d), p - 1.5, 7, 3);
    }
  }
  // crosswalks at intersections
  g.fillStyle = '#d8d8d8';
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const x = w2u(i * PITCH), y = w2u(j * PITCH);
      for (let s = -5; s <= 5; s += 2.5) {
        g.fillRect(x + s * 2 - 1, y - ROAD / 2 - 2, 2, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const BILLBOARDS = [
  ['SOLMAR COLA', '#c0392b', 'Taste the heat.'],
  ['PALM MOTEL', '#8e44ad', 'Vacancy — $49/night'],
  ['TACO REY', '#d35400', 'Open 24 hours'],
  ['SUNSET SURF', '#2980b9', 'Boards & lessons'],
  ['MR. FIX-IT', '#27ae60', 'We fix anything*'],
  ['CASINO SOL', '#f39c12', 'Play it lucky'],
  ['PIER PIZZA', '#e74c3c', 'Slice by the sea'],
  ['SOLMAR TAXI', '#f1c40f', 'Ride anywhere, $5'],
];

export function buildCity(G) {
  const rng = mulberry32(G.seed || 1);
  const scene = G.scene;
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const roadLines = [];   // grid line coords, for traffic/peds
  for (let k = -4; k <= 4; k++) roadLines.push(k * PITCH);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  // building textures (a few variants, shared)
  const texes = [0, 1, 2, 3, 4].map(() => buildingTexture(rng, Math.floor(rng() * 360)));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const parks = new Set(['-2,-1', '1,2', '3,-3', '-3,3']);
  const downtown = (bi, bj) => Math.abs(bi) <= 1 && Math.abs(bj) <= 1;

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bi = -4; bi <= 3; bi++) {
    for (let bj = -4; bj <= 3; bj++) {
      const cx = (bi + 0.5) * PITCH, cz = (bj + 0.5) * PITCH;
      if (parks.has(`${bi},${bj}`)) continue;
      if (cz > 176) continue; // beach
      if (cx > 176) continue; // port
      const tall = downtown(bi, bj);
      const n = tall ? 1 : (rng() < 0.6 ? 2 : 1);
      for (let b = 0; b < n; b++) {
        const w = tall ? 26 + rng() * 8 : 12 + rng() * 14;
        const d = tall ? 26 + rng() * 8 : 12 + rng() * 14;
        const h = tall ? 42 + rng() * 46 : 8 + rng() * 22;
        const ox = n === 2 ? (b === 0 ? -9 : 9) : 0;
        const oz = n === 2 ? (b === 0 ? -8 : 8) : 0;
        const mat = new THREE.MeshLambertMaterial({ map: texes[Math.floor(rng() * texes.length)] });
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, h, d);
        m.position.set(cx + ox, h / 2, cz + oz);
        scene.add(m);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.6, d + 0.6);
        roof.position.set(cx + ox, h + 0.3, cz + oz);
        scene.add(roof);
        colliders.push({
          minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
          minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2,
        });
      }
    }
  }

  // port containers (east)
  const contCols = [0xd35400, 0x2980b9, 0x27ae60, 0xc0392b];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: contCols[i % 4] }));
    const w = 12, h = 3, d = 3;
    m.scale.set(w, h, d);
    m.position.set(186 + (i % 2) * 8, h / 2, -160 + i * 26);
    scene.add(m);
    colliders.push({ minX: 186 + (i % 2) * 8 - 6, maxX: 186 + (i % 2) * 8 + 6, minZ: -160 + i * 26 - 1.5, maxZ: -160 + i * 26 + 1.5 });
  }

  // props: lamps along roads, palms on beach, hydrants
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const palmTrunk = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const palmLeaf = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.16, 5, 6);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const leafGeo = new THREE.ConeGeometry(2.2, 2.4, 6);
  for (let k = -3; k <= 3; k++) {
    for (let s = -3; s <= 3; s += 2) {
      const x = k * PITCH + ROAD / 2 + 1.2, z = s * PITCH;
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(x, 2.5, z); scene.add(pole);
      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.set(x, 5.1, z); scene.add(head);
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = -190 + i * 28 + rng() * 8, z = 184 + rng() * 8;
    const t = new THREE.Mesh(trunkGeo, palmTrunk);
    t.position.set(x, 3, z); t.rotation.z = (rng() - 0.5) * 0.2; scene.add(t);
    const l = new THREE.Mesh(leafGeo, palmLeaf);
    l.position.set(x, 6.6, z); scene.add(l);
  }

  // billboards with original fake ads
  const bbGeo = new THREE.BoxGeometry(10, 4.5, 0.4);
  const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, 7, 6);
  const spots = [[-78, -130, 0], [78, 26, 1], [-26, 130, 2], [130, -78, 3], [26, -182, 4], [-182, 78, 5], [-130, 182, 1], [182, 130, 3]];
  BILLBOARDS.forEach(([title, bg, sub], i) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 112);
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
    g.fillText(title, 128, 50);
    g.font = '18px sans-serif'; g.fillText(sub, 128, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const [x, z, rot] = spots[i];
    const pole = new THREE.Mesh(poleGeo, lampMat);
    pole.position.set(x, 3.5, z); scene.add(pole);
    const board = new THREE.Mesh(bbGeo, new THREE.MeshLambertMaterial({ map: tex }));
    board.position.set(x, 8.5, z);
    board.rotation.y = rot * Math.PI / 2;
    scene.add(board);
  });

  // sky dome + fog + lights
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0x9fc3dd, 120, 420);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x54503f, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  G.sun = sun; G.hemi = hemi;

  G.colliders = colliders;
  G.roadLines = roadLines;
  G.parks = parks;
  return { colliders, roadLines };
}

// Circle vs building AABB: push pos out, return true if collided.
export function collideCircle(G, pos, r) {
  let hit = false;
  for (const b of G.colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre inside box: push out along smallest penetration axis
        const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.minX - r; else if (m === pr) pos.x = b.maxX + r;
        else if (m === pt) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
      }
    }
  }
  // world bounds
  pos.x = Math.max(-HALF - 20, Math.min(HALF + 20, pos.x));
  pos.z = Math.max(-HALF - 20, Math.min(HALF + 20, pos.z));
  return hit;
}

export function isOnRoad(G, x, z) {
  for (const l of G.roadLines) {
    if (Math.abs(x - l) < ROAD / 2 + 1 || Math.abs(z - l) < ROAD / 2 + 1) return true;
  }
  return false;
}

// nearest point on the road grid to (x,z)
export function nearestRoadPoint(G, x, z) {
  let bx = G.roadLines[0], bz = G.roadLines[0];
  for (const l of G.roadLines) {
    if (Math.abs(l - x) < Math.abs(bx - x)) bx = l;
    if (Math.abs(l - z) < Math.abs(bz - z)) bz = l;
  }
  return { x: bx, z: bz };
}
