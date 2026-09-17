// Deterministik RNG: string seed -> uint32 -> mulberry32
// Aynı seed her zaman aynı dünyayı üretir.

export function hashSeed(str) {
  // cyrb53
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0); // 53-bit sayı
}

export function mulberry32(seed32) {
  let a = seed32 >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Koordinat tabanlı deterministik hash (cevher/ağaç için, chunk RNG'siz)
// x,y,z + seedNum -> 0..1 arası
export function hash3(x, y, z, seedNum) {
  let h = seedNum | 0;
  h = Math.imul(h ^ (x | 0), 374761393);
  h = Math.imul(h ^ (y | 0), 668265263);
  h = Math.imul(h ^ (z | 0), 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rngForChunk(seedNum, cx, cz) {
  // chunk'a özel RNG
  const h = ((cx * 341873128712 + cz * 132897987541) ^ seedNum) >>> 0;
  return mulberry32(h);
}
