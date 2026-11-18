// Solmar: a procedural 8x8-block city on a flat plane. Everything is generated
// from the seeded rng, so the same seed rebuilds the same streets, towers and
// props. Buildings are boxes with canvas-painted window textures; the ground
// is one big painted canvas (roads, sidewalks, crosswalks, beach, port, parks).
import * as THREE from 'three';
import { pick, range, rangeInt } from './rng.js';

export const PITCH = 52; // block + road
export const BLOCK = 40; // building block
export const ROAD = 12;
export const GRID = 8;
export const HALF = (GRID * PITCH) / 2; // 208: outermost road centre

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildingTexture(rng, tint) {
  const floors = rangeInt(rng, 4, 14);
  const cols = rangeInt(rng, 3, 6);
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, s, s);
    for (let f = 0; f < floors; f += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = rng() < 0.35;
        ctx.fillStyle = lit ? '#ffe9a8' : '#1d2733';
        ctx.fillRect(8 + c * ((s - 16) / cols) + 2, 8 + f * ((s - 16) / floors) + 2, (s - 16) / cols - 5, (s - 16) / floors - 5);
      }
    }
  });
}

function groundTexture() {
  return canvasTexture(1024, (ctx, s) => {
    const toPx = (v) => ((v + HALF + 16) / (2 * HALF + 32)) * s;
    ctx.fillStyle = '#8f97a3'; // sidewalk base
    ctx.fillRect(0, 0, s, s);
    // parks: two grass blocks (block coords, centres offset half a pitch)
    ctx.fillStyle = '#5d8a4a';
    for (const [bx, bz] of [[-2, -2], [2, 1]]) {
      ctx.fillRect(toPx((bx + 0.5) * PITCH - BLOCK / 2), toPx((bz + 0.5) * PITCH - BLOCK / 2), toPx(BLOCK) - toPx(0), toPx(BLOCK) - toPx(0));
    }
    // beach strip (south edge) and port (east edge)
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, toPx(HALF - 14), s, s - toPx(HALF - 14));
    ctx.fillStyle = '#7d838d';
    ctx.fillRect(toPx(HALF - 14), 0, s - toPx(HALF - 14), s);
    // roads
    ctx.fillStyle = '#2e3138';
    for (let k = 0; k <= GRID; k += 1) {
      const c = -HALF + k * PITCH;
      ctx.fillRect(toPx(c - ROAD / 2), 0, toPx(ROAD) - toPx(0), s);
      ctx.fillRect(0, toPx(c - ROAD / 2), s, toPx(ROAD) - toPx(0));
    }
    // lane dashes
    ctx.fillStyle = '#d8c95a';
    for (let k = 0; k <= GRID; k += 1) {
      const c = -HALF + k * PITCH;
      for (let d = -HALF; d < HALF; d += 16) {
        ctx.fillRect(toPx(c) - 1, toPx(d), 2, 6);
        ctx.fillRect(toPx(d), toPx(c) - 1, 6, 2);
      }
    }
    // crosswalks at every intersection
    ctx.fillStyle = '#e8e8e8';
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const cx = -HALF + i * PITCH;
        const cz = -HALF + j * PITCH;
        for (let q = -1; q <= 1; q += 1) {
          ctx.fillRect(toPx(cx + q * 3.4) - 1.5, toPx(cz - ROAD / 2), 3, 4);
          ctx.fillRect(toPx(cx + q * 3.4) - 1.5, toPx(cz + ROAD / 2) - 4, 3, 4);
          ctx.fillRect(toPx(cx - ROAD / 2), toPx(cz + q * 3.4) - 1.5, 4, 3);
          ctx.fillRect(toPx(cx + ROAD / 2) - 4, toPx(cz + q * 3.4) - 1.5, 4, 3);
        }
      }
    }
  });
}

function billboardTexture(title, sub, bg) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, s / 2, s / 2 - 8);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(sub, s / 2, s / 2 + 28);
  });
}

export function buildCity(scene, rng) {
  const city = {
    buildings: [], // {minX,maxX,minZ,maxZ,h}
    lamps: [],
    spots: {},
  };

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * HALF + 32, 2 * HALF + 32),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const tints = ['#7a6a58', '#5f6b7a', '#8a7a68', '#6b5a6e', '#74624e', '#4e5e6b'];
  // Block centres sit half a pitch off the road lines, so buildings never
  // straddle a road: block (bx, bz) is centred at (bx + 0.5) * PITCH.
  const downtown = (bx, bz) => (bx === -1 || bx === 0) && (bz === -1 || bz === 0);
  for (let bx = -4; bx <= 3; bx += 1) {
    for (let bz = -4; bz <= 3; bz += 1) {
      if ((bx === -2 && bz === -2) || (bx === 2 && bz === 1)) continue; // parks
      const cx = (bx + 0.5) * PITCH;
      const cz = (bz + 0.5) * PITCH;
      const tall = downtown(bx, bz);
      const count = tall ? rangeInt(rng, 1, 2) : rangeInt(rng, 1, 3);
      for (let n = 0; n < count; n += 1) {
        const w = range(rng, 14, 26);
        const d = range(rng, 14, 26);
        const x = cx + range(rng, -8, 8);
        const z = cz + range(rng, -8, 8);
        const h = tall ? range(rng, 26, 58) : range(rng, 8, 22);
        const tex = buildingTexture(rng, pick(rng, tints));
        const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        const roof = new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.95 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        city.buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
        if (rng() < 0.4) {
          const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, range(rng, 3, 7), 6),
            new THREE.MeshStandardMaterial({ color: '#22262c' }),
          );
          antenna.position.set(x + range(rng, -4, 4), h + 2, z + range(rng, -4, 4));
          scene.add(antenna);
        }
      }
    }
  }

  // Street lamps along the roads.
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6, metalness: 0.4 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#fff6c9', emissive: '#ffdf7a', emissiveIntensity: 0.9 });
  for (let k = 0; k <= GRID; k += 1) {
    for (let d = -HALF + 20; d < HALF; d += 52) {
      for (const [x, z] of [[-HALF + k * PITCH + 7, d], [d, -HALF + k * PITCH + 7]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 8), lampMat);
        pole.position.set(x, 3.5, z);
        scene.add(pole);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampHeadMat);
        head.position.set(x, 7.1, z);
        scene.add(head);
        city.lamps.push({ x, z });
      }
    }
  }

  // Beach palms (south strip) and port containers (east strip).
  const palmMat = new THREE.MeshStandardMaterial({ color: '#7a5a34', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f7d3a', roughness: 0.9 });
  for (let i = 0; i < 14; i += 1) {
    const x = range(rng, -HALF, HALF);
    const z = HALF + range(rng, 2, 12);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 7), palmMat);
    trunk.position.set(x, 3, z);
    trunk.rotation.z = range(rng, -0.15, 0.15);
    scene.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 7), leafMat);
    top.position.set(x, 6.8, z);
    scene.add(top);
  }
  const containerColors = ['#b3402f', '#2f6db3', '#c98a2e', '#3f8a4f'];
  for (let i = 0; i < 18; i += 1) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.6, 2.6),
      new THREE.MeshStandardMaterial({ color: pick(rng, containerColors), roughness: 0.8 }),
    );
    c.position.set(HALF + range(rng, 2, 10), 1.3, range(rng, -HALF, HALF));
    c.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
    c.castShadow = true;
    scene.add(c);
  }

  // Two billboards with original fake ads.
  for (const [x, z, ry, title, sub, bg] of [
    [-52, -104, 0, 'SOLMAR COLA', 'taste the heat', '#a83232'],
    [104, 52, Math.PI / 2, 'VEGA MOTORS', 'drive it like you stole it', '#274b7a'],
  ]) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(16, 7, 0.4),
      new THREE.MeshStandardMaterial({ map: billboardTexture(title, sub, bg), roughness: 0.7 }),
    );
    board.position.set(x, 11, z);
    board.rotation.y = ry;
    scene.add(board);
    const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 6), lampMat);
    leg1.position.set(x - 5, 4, z);
    scene.add(leg1);
    const leg2 = leg1.clone();
    leg2.position.x = x + 5;
    scene.add(leg2);
  }

  // Named spots the missions and systems use — all on roads, never inside a
  // block, so the player can always drive or walk to them.
  city.spots = {
    playerStart: { x: 0, z: 156 },
    chopShop: { x: -156, z: -26 },
    bank: { x: 0, z: -26 },
    hideout: { x: -156, z: -156 },
    package: { x: 156, z: 78 },
    sedan: { x: 104, z: 130 },
  };
  return city;
}

// Push a circle (x, z, radius r) out of every building AABB it overlaps.
// Returns the corrected position and whether it hit anything.
export function collideCircle(city, x, z, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        x += r;
      }
    }
  }
  const lim = HALF + 14;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(lim, z));
  return { x, z, hit };
}

// A random point on a road centre line (for traffic / pedestrian spawns).
export function roadPoint(city, rng) {
  const line = Math.floor(rng() * (GRID + 1));
  const along = range(rng, -HALF, HALF);
  const c = -HALF + line * PITCH;
  return rng() < 0.5 ? { x: c, z: along } : { x: along, z: c };
}
