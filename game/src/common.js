// Shared helpers for Solmar Heat: seeded RNG, math, canvas textures.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (rng, a, b) => a + rng() * (b - a);
export const randi = (rng, a, b) => Math.floor(rand(rng, a, b + 1));
export const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const money = (n) => '$' + Math.floor(n).toLocaleString('en-US');
export const fmtClock = (mins) => {
  const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};

// Canvas texture for a building facade: lit windows on a coloured wall.
export function facadeTexture(rng, base, floors, cols, neon) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 128, 10);
  const cw = 128 / cols, ch = 240 / floors;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < cols; i++) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : 'rgba(10,14,22,0.85)';
      g.fillRect(4 + i * cw, 14 + f * ch + 3, cw - 8, ch - 7);
    }
  }
  if (neon) {
    g.fillStyle = neon; g.fillRect(0, 226, 128, 22);
    g.fillStyle = '#101018'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
    g.fillText(choice(rng, ['HOTEL', 'MOTEL', 'BAR', '24H', 'PIER 9', 'CLUB']), 64, 242);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvas texture for a billboard with an original fake ad.
export function billboardTexture(rng, lines, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(4, 4, 248, 120);
  g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 30px sans-serif';
  g.fillText(lines[0], 128, 56);
  g.font = 'bold 17px sans-serif';
  g.fillText(lines[1] || '', 128, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvas texture for a neon shop sign.
export function signTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg; g.font = 'bold 28px sans-serif'; g.textAlign = 'center';
  g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
