import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { faceTextureName } from '../core/atlas.js';

// Chunk başına 2 mesh: opaque (cutout dahil) + transparent (cam/su)
// Atlas UV + vertex rengine tint gömülür (çim/yaprak biyom rengi).

const FACES = [
  { dir: 'px', n: [1, 0, 0],   shade: 0.8,  corners: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { dir: 'nx', n: [-1, 0, 0],  shade: 0.8,  corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { dir: 'py', n: [0, 1, 0],   shade: 1.0,  corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir: 'ny', n: [0, -1, 0],  shade: 0.5,  corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir: 'pz', n: [0, 0, 1],   shade: 0.7,  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { dir: 'nz', n: [0, 0, -1],  shade: 0.7,  corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];
const FACE_UV = [[0,0],[1,0],[1,1],[0,1]];

// Biyom/tint renkleri (0..1). Üst doku saf gri (#939393), yan şerit #6C8E3F.
// Üst, birebir yan yeşili olsun diye tint = şerit/üst: [0.735, 0.966, 0.429].
const TINTS = {
  grass_block_top: [0.735, 0.966, 0.429], // yan şeritle aynı yeşil
  grass_block_snow: [0.85, 0.9, 0.9],
  oak_leaves: [0.30, 0.68, 0.18],
  water_still: [0.24, 0.45, 0.95],
};

function chestCode(st) { if (!st) return 0; return (((st.dbl | 0) % 3) * 4) + ((st.face | 0) & 3); }
function tintFor(tex) {
  return TINTS[tex] || null;
}
const WHITE = [1, 1, 1];

// Hızlı opaklık tablosu (her yüzde BLOCKS[nid]?.saydam yapmamak için)
const OPAQUE_LUT = new Uint8Array(64);
for (let i = 0; i < 64; i++) {
  const b = BLOCKS[i];
  OPAQUE_LUT[i] = (i !== 0 && b && !b.saydam) ? 1 : 0;
}
// 64 üstü id gelirse güvenli tarafta opak say
function isOpaqueFast(id) {
  return id < 64 ? OPAQUE_LUT[id] === 1 : true;
}

export function buildChunkGeometry(blocks, cx, cz, getBlockGlobal, uvMap, MIN_Y, WORLD_HEIGHT, getTorch, getFurnace, getDoor, getChest) {
  const op = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const tr = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const em = { pos: [], nor: [], uv: [], col: [], idx: [] }; // ışık yayanlar (meşale)

  const getLocal = (lx, y, lz) => {
    if (y < MIN_Y || y > MIN_Y + WORLD_HEIGHT - 1) return 0;
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) return blocks[(y - MIN_Y) * 256 + lz * 16 + lx];
    return getBlockGlobal(cx * 16 + lx, y, cz * 16 + lz);
  };

  // MC meşale: ince direk, altta ortalı, X cross 2 quad. Tam küp değil.
  function addTorch(bucket, wx, y, wz, rect, facing = 0) {
    // direk: x 7/16..9/16, z 7/16..9/16, y 0..10/16
    // duvar mesalesi (facing 1..4): duvara yaslanir + uca dogru egilir (MC)
    const TD = { 1: [0, 0, 1], 2: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
    const sd = TD[facing] || [0, 0, 0];
    const ox = sd[0] * 3 / 16, oz = sd[2] * 3 / 16; // yaslanma
    const lx = sd[0] / 16, lz = sd[2] / 16; // egilme (uc duvara yakin)
    const x0 = wx + 7 / 16 + ox, x1 = wx + 9 / 16 + ox;
    const z0 = wz + 7 / 16 + oz, z1 = wz + 9 / 16 + oz;
    const y0 = y, y1 = y + 10 / 16;
    const lean = (t) => [lx * t, 0, lz * t]; // kose yuksekligine gore ek kayma (uc duvara yakin)
    const quads = [
      // plane 1: x sabit orta, z boyunca (ön/arka yüzler)
      { p: [[(x0+x1)/2, y0, z0], [(x0+x1)/2, y0, z1], [(x0+x1)/2, y1, z1], [(x0+x1)/2, y1, z0]], n: [1, 0.3, 0] },
      { p: [[(x0+x1)/2, y0, z1], [(x0+x1)/2, y0, z0], [(x0+x1)/2, y1, z0], [(x0+x1)/2, y1, z1]], n: [-1, 0.3, 0] },
      // plane 2: z sabit orta, x boyunca
      { p: [[x0, y0, (z0+z1)/2], [x1, y0, (z0+z1)/2], [x1, y1, (z0+z1)/2], [x0, y1, (z0+z1)/2]], n: [0, 0.3, 1] },
      { p: [[x1, y0, (z0+z1)/2], [x0, y0, (z0+z1)/2], [x0, y1, (z0+z1)/2], [x1, y1, (z0+z1)/2]], n: [0, 0.3, -1] },
    ];
    for (const q of quads) {
      const base = bucket.pos.length / 3;
      const len = Math.hypot(q.n[0], q.n[1], q.n[2]);
      const n = [q.n[0]/len, q.n[1]/len, q.n[2]/len];
      q.p.forEach((v, i) => {
        const t = (v[1] - y0) / Math.max(1e-6, y1 - y0);
        const dl = lean(t);
        bucket.pos.push(v[0] + dl[0], v[1], v[2] + dl[2]);
        bucket.nor.push(...n);
        const [fu, fv] = FACE_UV[i];
        bucket.uv.push(rect.u0 + (rect.u1 - rect.u0) * fu, rect.v0 + (rect.v1 - rect.v0) * fv);
        bucket.col.push(1, 1, 1);
      });
      bucket.idx.push(base, base + 1, base + 2, base + 2, base + 3, base);
    }
  }

  // MC kapı: ince panel (3/16). Kapalı = hücre ortasında, normal oyuncuya bakar.
  // Açık = menteşeden 90° salınmış. Alt yarı alt doku, üst yarı üst doku.
  const DOOR_N = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
  function addDoor(bucket, wx, y, wz, rect, face, open, hinge = 1) {
    const n = DOOR_N[face & 3] || DOOR_N[0];
    const t = [-n[2], 0, n[0]]; // panel teğeti
    const shade = Math.abs(n[0]) > 0 ? 0.8 : 0.7;
    const quads = [];
    if (!open) {
      const cx = wx + 0.5, cz = wz + 0.5, hh = 0.094;
      const c = [
        [cx - t[0] * 0.5 - n[0] * hh, y, cz - t[2] * 0.5 - n[2] * hh],
        [cx + t[0] * 0.5 - n[0] * hh, y, cz + t[2] * 0.5 - n[2] * hh],
        [cx + t[0] * 0.5 + n[0] * hh, y + 1, cz + t[2] * 0.5 + n[2] * hh],
        [cx - t[0] * 0.5 + n[0] * hh, y + 1, cz - t[2] * 0.5 + n[2] * hh],
      ];
      // on yuz (+n) ve arka yuz (-n) icin iki quad
      quads.push({ p: [c[0], c[1], c[2], c[3]], n });
      quads.push({ p: [c[1], c[0], c[3], c[2]], n: [-n[0], 0, -n[2]] });
    } else {
      // Acik: mentese kenarindan -n yonune 1 blok salinir (eksen-hizali, burulma yok).
      // Menteşe tarafı hinge (+t / -t). Komsu kapiyla ayni yone bakip ters mentese = MC cift kapi.
      const hs = (hinge < 0 ? -1 : 1);
      const hx = wx + 0.5 + t[0] * 0.5 * hs, hz = wz + 0.5 + t[2] * 0.5 * hs;
      const dx = -n[0], dz = -n[2], hh = 0.094;
      const ax = hx + dx, az = hz + dz; // panel ucu (menteşeden 1 blok)
      const c = [
        [hx - t[0] * hh, y, hz - t[2] * hh],
        [hx + t[0] * hh, y, hz + t[2] * hh],
        [ax + t[0] * hh, y + 1, az + t[2] * hh],
        [ax - t[0] * hh, y + 1, az - t[2] * hh],
      ];
      // Gercek panel normali: capraz carpim (isik dogru duser)
      let pnx = t[2] * 1 - 0 * dz, pny = 0 * dx - t[0] * 1, pnz = t[0] * dz - t[2] * dx;
      const pl = Math.hypot(pnx, pny, pnz) || 1;
      pnx /= pl; pny /= pl; pnz /= pl;
      quads.push({ p: [c[0], c[1], c[2], c[3]], n: [pnx, pny, pnz] });
      quads.push({ p: [c[1], c[0], c[3], c[2]], n: [-pnx, -pny, -pnz] });
    }
    for (const q of quads) {
      const base = bucket.pos.length / 3;
      const len = Math.hypot(q.n[0], q.n[1], q.n[2]) || 1;
      const nn = [q.n[0] / len, q.n[1] / len, q.n[2] / len];
      q.p.forEach((v, i) => {
        bucket.pos.push(v[0], v[1], v[2]);
        bucket.nor.push(...nn);
        const [fu, fv] = FACE_UV[i];
        bucket.uv.push(rect.u0 + (rect.u1 - rect.u0) * fu, rect.v0 + (rect.v1 - rect.v0) * fv);
        bucket.col.push(shade, shade, shade);
      });
      bucket.idx.push(base, base + 1, base + 2, base + 2, base + 3, base);
    }
  }

  for (let y = MIN_Y; y < MIN_Y + WORLD_HEIGHT; y++) {
    const yBase = (y - MIN_Y) * 256;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const id = blocks[yBase + lz * 16 + lx];
        if (!id) continue;
        const b = BLOCKS[id];
        // Kapı yarıları: ince panel, alt/üst doku ayrı
        if (id === 25 || id === 26) {
          const by = id === 25 ? y : y - 1;
          const st = getDoor ? getDoor(cx * 16 + lx, by, cz * 16 + lz) : null;
          const tex = faceTextureName(id, 'pz');
          const rect = uvMap[tex] || uvMap['stone'];
          addDoor(op, cx * 16 + lx, y, cz * 16 + lz, rect, (st && st.face | 0) || 0, !!(st && st.open), (st && st.hinge) || 1);
          continue;
        }
        // Meşale özel: komşuya bakmadan her zaman cross çiz (desteksiz küçük model)
        if (id === 21) {
          const tex = 'torch';
          const rect = uvMap[tex] || uvMap['stone'];
          const wx = cx * 16 + lx, wz = cz * 16 + lz;
          addTorch(em, wx, y, wz, rect, getTorch ? getTorch(wx, y, wz) : 0);
          continue;
        }
        // su: üstü açıksa üst yüzü bir piksel aşağıda? v1'de tam blok, basit tutuyoruz
        const isTrans = id === 9 || id === 16;
        const isSaydam = b?.saydam === true;
        for (const f of FACES) {
          const nx2 = lx + f.n[0], ny2 = y + f.n[1], nz2 = lz + f.n[2];
          let nid;
          if (ny2 < MIN_Y || ny2 > MIN_Y + WORLD_HEIGHT - 1) nid = 0;
          else if (nx2 >= 0 && nx2 < 16 && nz2 >= 0 && nz2 < 16) nid = blocks[(ny2 - MIN_Y) * 256 + nz2 * 16 + nx2];
          else nid = getBlockGlobal(cx * 16 + nx2, ny2, cz * 16 + nz2);
          if (isOpaqueFast(nid)) continue;
          // Aynı tip komşuda iç yüzü çizme: cam-cam, yaprak-yaprak VE su-su.
          // (Su üst yüzü, üstte hava varsa zaten çizilir; üstte su varsa atlanır.)
          if (nid === id && isSaydam) continue;
          const wx0 = cx * 16 + lx, wz0 = cz * 16 + lz;
          const ff = (id === 22 || id === 24) && getFurnace ? (getFurnace(wx0, y, wz0) || 0) : 0;
          const cc = id === 27 && getChest ? chestCode(getChest(wx0, y, wz0)) : 0;
          const tex = faceTextureName(id, f.dir, ff, cc);
          const rect = uvMap[tex] || uvMap['stone'];
          const tint = tintFor(tex) || WHITE;
          const bucket = id === 21 ? em : (isTrans ? tr : op);
          const base = bucket.pos.length / 3;
          const wx = cx * 16 + lx, wz = cz * 16 + lz;
          f.corners.forEach((c, i) => {
            bucket.pos.push(wx + c[0], y + c[1], wz + c[2]);
            bucket.nor.push(...f.n);
            const [fu, fv] = FACE_UV[i];
            bucket.uv.push(
              rect.u0 + (rect.u1 - rect.u0) * fu,
              rect.v0 + (rect.v1 - rect.v0) * fv
            );
            bucket.col.push(tint[0] * f.shade, tint[1] * f.shade, tint[2] * f.shade);
          });
          bucket.idx.push(base, base + 1, base + 2, base + 2, base + 3, base);
        }
      }
    }
  }
  return { op, tr, em };
}

export function bucketToMesh(bucket, material, shadows = true) {
  if (!bucket.idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(bucket.col, 3));
  g.setIndex(bucket.idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = true;
  return mesh;
}
