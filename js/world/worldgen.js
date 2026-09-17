import { MIN_Y, MAX_Y, SEA_LEVEL, CHUNK_SIZE, WORLD_HEIGHT } from '../core/config.js';
import { ValueNoise2D, caveNoise } from '../core/noise.js';
import { hashSeed, hash3, rngForChunk } from '../core/rng.js';

// Chunk üretimi: deterministik, seed'e bağlı.
// cx,cz -> Uint8Array(16*384*16), index: (y-MIN_Y)*256 + z*16 + x

const noiseCache = new Map(); // seedStr -> {cont, hill, moist, river}

function noises(seedStr) {
  if (!noiseCache.has(seedStr)) {
    noiseCache.set(seedStr, {
      cont: new ValueNoise2D(seedStr + ':cont'),
      hill: new ValueNoise2D(seedStr + ':hill'),
      moist: new ValueNoise2D(seedStr + ':moist'),
      river: new ValueNoise2D(seedStr + ':river'),
    });
  }
  return noiseCache.get(seedStr);
}

export function heightAt(x, z, seedStr) {
  const { cont, hill, river } = noises(seedStr);
  const c = cont.fbm(x / 220, z / 220, 4);      // -1..1 kıta (daha geniş kara)
  const h = hill.fbm(x / 38, z / 38, 3);        // -1..1 tepe (3 octave daha dişli)
  const r = river.fbm(x / 160, z / 160, 2);     // nehir maskesi (~0 = nehir)
  let y = 73 + c * 16 + h * 8;
  // okyanus sadece belirgin çukurda / dağ sadece belirgin tepede
  if (c < -0.45) y -= 14;
  else if (c < -0.3) y -= 6;
  if (c > 0.45) y += 6 + h * 5; // plato basamakları yumuşak (dikey duvar yok)
  // nehir yatağı: dar + yumuşak çökertme (max 3 blok, kenara smoothstep).
  // Eski sert min() krater + uçurum yapıyordu.
  const ar = Math.abs(r);
  if (ar < 0.08 && y > SEA_LEVEL - 4) {
    const t = Math.max(0, 1 - ar / 0.08); // 0 kenar -> 1 merkez
    const s = t * t * (3 - 2 * t);
    const target = SEA_LEVEL - 1;
    const depth = Math.min(3, Math.max(0, y - target));
    y -= depth * s;
  }
  return Math.max(MIN_Y + 4, Math.min(150, Math.floor(y)));
}

function triangleProb(y, minY, peakY, maxY) {
  if (y < minY || y > maxY) return 0;
  if (y <= peakY) return (y - minY) / Math.max(1, peakY - minY);
  return 1 - (y - peakY) / Math.max(1, maxY - peakY);
}

function oreAt(x, y, z, seedNum) {
  const r = hash3(x, y, z, seedNum ^ 0x9e3779b9);
  // elmas: -64..16, tepe -59 (damar hissi için komşu bloklarla birlikte değerlendirilir)
  if (y <= 16 && r < 0.014 * triangleProb(y, -64, -59, 16)) return 13;
  // altın: -64..32, tepe -16 (nadir, ayrı hash)
  if (y <= 32 && y >= -64) {
    const rg = hash3(x, y, z, seedNum ^ 0x51ab3f77);
    if (rg < 0.006 * triangleProb(y, -64, -16, 32)) return 23;
  }
  // demir alt: -64..20 tepe -24
  if (y <= 20 && r > 0.986 && triangleProb(y, -64, -24, 20) > 0.35) return 12;
  // demir üst: 20..110 tepe 60
  if (y > 16 && y <= 110 && r < 0.012 * triangleProb(y, 20, 60, 110)) return 12;
  // kömür: 50..319 (dağlarda daha sık)
  if (y >= 50 && r < 0.016 * triangleProb(y, 50, 110, 319)) return 11;
  // çakıl cebi
  if (r > 0.993 && y < 60) return 15;
  return 0;
}

// Damar: merkez cevherin etrafına 2-4 ek blok (deterministik, chunk içi)
function veinInto(blocks, set, cx, cz, lx, y, lz, id, seedNum) {
  const n = 2 + Math.floor(hash3(lx + cx * 31, y, lz + cz * 17, seedNum ^ id) * 3);
  for (let i = 0; i < n; i++) {
    const dx = Math.floor(hash3(lx * 7 + i, y, lz * 3, seedNum ^ 0x11) * 3) - 1;
    const dy = Math.floor(hash3(lx * 3, y + i, lz * 5, seedNum ^ 0x22) * 3) - 1;
    const dz = Math.floor(hash3(lx * 5, y, lz * 7 + i, seedNum ^ 0x33) * 3) - 1;
    const bx = lx + dx, by = y + dy, bz = lz + dz;
    if (bx < 0 || bx > 15 || bz < 0 || bz > 15) continue;
    if (by < MIN_Y + 1 || by > MAX_Y) continue;
    const idx = (by - MIN_Y) * 256 + bz * 16 + bx;
    if (blocks[idx] === 3 || blocks[idx] === 17) blocks[idx] = id;
  }
}

export function generateChunk(cx, cz, seedStr, seedNum) {
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const set = (lx, y, lz, id) => {
    if (y < MIN_Y || y > MAX_Y) return;
    blocks[(y - MIN_Y) * 256 + lz * 16 + lx] = id;
  };
  const seed32 = seedNum & 0xffffffff;

  for (let lx = 0; lx < 16; lx++) {
    for (let lz = 0; lz < 16; lz++) {
      const wx = cx * 16 + lx, wz = cz * 16 + lz;
      const h = heightAt(wx, wz, seedStr);
      const { moist } = noises(seedStr);
      const m = moist.fbm(wx / 90, wz / 90, 2); // -1..1 nem (kumsal/kil yamaları)
      const sandy = h <= SEA_LEVEL + 2 || (m > 0.45 && h < SEA_LEVEL + 6);
      const gravelPatch = m < -0.5 && h <= SEA_LEVEL + 3;
      const snowy = h >= 105;
      for (let y = MIN_Y; y <= h; y++) {
        let id = 3; // taş
        if (y === MIN_Y) id = 10; // bedrock
        else if (y < 0 && y > MIN_Y) {
          // tek hash ile deepslate/taş seç (iki hash yerine)
          const hr = hash3(wx, y, wz, seedNum);
          id = hr > 0.45 ? 17 : 3;
          if (y >= h - 6 && y < h) {
            const ore = oreAt(wx, y, wz, seedNum);
            if (ore) id = ore;
          }
        }
        else if (y === h) id = snowy ? 18 : gravelPatch ? 15 : (sandy ? 8 : 1);
        else if (y > h - 4) id = gravelPatch ? 15 : sandy ? 8 : 2;
        else {
          const ore = oreAt(wx, y, wz, seedNum);
          if (ore) id = ore;
        }
        // mağara: spaghetti (2 noise kesişimi), y<45 ve yüzeyden 5 altta
        if (id !== 10 && y < h - 5 && y > MIN_Y + 1 && y < 45) {
          const c1 = caveNoise(wx / 18, y / 16, wz / 18, seed32);
          const c2 = caveNoise(wx / 14 + 100, y / 12, wz / 14, seed32 ^ 0x5bd1e995);
          if (c1 * c1 + c2 * c2 < 0.018) { set(lx, y, lz, 0); continue; }
        }
        set(lx, y, lz, id);
      }
      // deniz/göl
      if (h < SEA_LEVEL) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) set(lx, y, lz, 16);
        // su altı tabanı: kum/çakıl karışık (m'ye göre)
        const bi = (h - MIN_Y) * 256 + lz * 16 + lx;
        if (m < -0.3) blocks[bi] = 15;
        else if (blocks[bi] === 2 || blocks[bi] === 1) blocks[bi] = 8;
      }
    }
  }

  // Damar genişletme (2. geçiş, sadece cevher merkezlerinden)
  for (let i = 0; i < blocks.length; i++) {
    const id = blocks[i];
    if (id !== 11 && id !== 12 && id !== 13 && id !== 23) continue;
    // her cevherin ~%60'ı damar merkezi olur (aşırı yayılmayı önler)
    const y = MIN_Y + Math.floor(i / 256);
    const lz = Math.floor((i % 256) / 16), lx = i % 16;
    const wx = cx * 16 + lx, wz = cz * 16 + lz;
    if (hash3(wx, y, wz, seedNum ^ 0x77) < 0.6) {
      const set2 = (bx, by, bz, nid) => {
        if (by < MIN_Y || by > MAX_Y || bx < 0 || bx > 15 || bz < 0 || bz > 15) return;
        const j = (by - MIN_Y) * 256 + bz * 16 + bx;
        if (blocks[j] === 3 || blocks[j] === 17) blocks[j] = nid;
      };
      veinInto(blocks, set2, cx, cz, lx, y, lz, id, seedNum);
    }
  }

  // Ağaçlar: orman biyomunda sık, kumsalda yok (chunk içine sığanlar)
  const rng = rngForChunk(seedNum, cx, cz);
  const { moist: moistN } = noises(seedStr);
  const forest = moistN.fbm(cx * 16 / 120, cz * 16 / 120, 2);
  const treeBase = forest > 0.15 ? 3 : 1;
  const treeCount = treeBase + Math.floor(rng() * 3);
  for (let t = 0; t < treeCount; t++) {
    const lx = 2 + Math.floor(rng() * 12);
    const lz = 2 + Math.floor(rng() * 12);
    const wx = cx * 16 + lx, wz = cz * 16 + lz;
    const h = heightAt(wx, wz, seedStr);
    if (h <= SEA_LEVEL + 1 || h >= 100 || h > MAX_Y - 8) continue;
    const topId = blocks[(h - MIN_Y) * 256 + lz * 16 + lx];
    if (topId !== 1) continue;
    if (rng() < (forest > 0.15 ? 0.2 : 0.45)) continue; // ormanda seyreltme az
    const trunk = 4 + Math.floor(rng() * 3); // 4-6 boy
    for (let y = 1; y <= trunk; y++) set(lx, h + y, lz, 5);
    for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
      const r = dy >= trunk ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy <= trunk) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
        const bx = lx + dx, by = h + dy, bz = lz + dz;
        if (bx < 0 || bx > 15 || bz < 0 || bz > 15) continue;
        const i = (by - MIN_Y) * 256 + bz * 16 + bx;
        if (blocks[i] === 0) blocks[i] = 6;
      }
    }
  }
  return blocks;
}
