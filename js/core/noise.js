// Hafif value-noise (seed'li). Perlin'e göre hızlı, voxel arazi için yeterli.
// Grid hash -> smoothstep interpolasyon -> fbm

import { hashSeed } from './rng.js';

function hash2(ix, iz, seed32) {
  let h = seed32 | 0;
  h = Math.imul(h ^ (ix | 0), 374761393);
  h = Math.imul(h ^ (iz | 0), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export class ValueNoise2D {
  constructor(seedStr) {
    this.seed = hashSeed(seedStr) & 0xffffffff;
  }
  noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const a = hash2(ix, iz, this.seed);
    const b = hash2(ix + 1, iz, this.seed);
    const c = hash2(ix, iz + 1, this.seed);
    const d = hash2(ix + 1, iz + 1, this.seed);
    const ux = smooth(fx), uz = smooth(fz);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1; // -1..1
  }
  fbm(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }
}

// 3D mağara için ucuz hash tabanlı noise (trilinear)
export function caveNoise(x, y, z, seed32) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = smooth(fx), uy = smooth(fy), uz = smooth(fz);
  const h = (dx, dy, dz) => {
    let hh = seed32 | 0;
    hh = Math.imul(hh ^ ((ix + dx) | 0), 374761393);
    hh = Math.imul(hh ^ ((iy + dy) | 0), 668265263);
    hh = Math.imul(hh ^ ((iz + dz) | 0), 1440662683);
    hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
    hh ^= hh >>> 16;
    return (hh >>> 0) / 4294967296 * 2 - 1;
  };
  const c00 = h(0,0,0) + (h(1,0,0)-h(0,0,0))*ux;
  const c10 = h(0,1,0) + (h(1,1,0)-h(0,1,0))*ux;
  const c01 = h(0,0,1) + (h(1,0,1)-h(0,0,1))*ux;
  const c11 = h(0,1,1) + (h(1,1,1)-h(0,1,1))*ux;
  const c0 = c00 + (c10-c00)*uy;
  const c1 = c01 + (c11-c01)*uy;
  return c0 + (c1-c0)*uz;
}
