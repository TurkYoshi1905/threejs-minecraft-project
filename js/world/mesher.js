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

// Biyom/tint renkleri (0..1). Minecraft 1.21.1 Java doğrulanmış değerler:
// çimen Üst (plains grass_block_top) #91BD59, meşe yaprak #77AB2F,
// huş yaprak #80A755 (biyomdan bağımsız), ladin yaprak #619961 (biyomdan bağımsız), su #3F76E4
const TINTS = {
  grass_block_top: [145 / 255, 189 / 255, 89 / 255], // vanilla 1.21.1 Plains çimen üstü (#91BD59)
  grass_block_snow: [0.85, 0.9, 0.9],
  oak_leaves: [119 / 255, 171 / 255, 47 / 255],   // #77AB2F (Plains foliage)
  birch_leaves: [128 / 255, 167 / 255, 85 / 255], // #80A755 (huş, sabit)
  spruce_leaves: [97 / 255, 153 / 255, 97 / 255], // #619961 (ladin, sabit)
  water_still: [63 / 255, 118 / 255, 228 / 255],  // #3F76E4
};

function chestCode(st) { if (!st) return 0; return (((st.dbl | 0) % 3) * 4) + ((st.face | 0) & 3); }
function tintFor(tex) {
  return TINTS[tex] || null;
}
const WHITE = [1, 1, 1];

// Hızlı opaklık tablosu (her yüzde BLOCKS[nid]?.saydam yapmamak için)
const OPAQUE_LUT = new Uint8Array(128);
for (let i = 0; i < 128; i++) {
  const b = BLOCKS[i];
  OPAQUE_LUT[i] = (i !== 0 && b && !b.saydam) ? 1 : 0;
}
// 128 üstü id gelirse güvenli tarafta opak say
function isOpaqueFast(id) {
  return id < 128 ? OPAQUE_LUT[id] === 1 : true;
}

export function buildChunkGeometry(blocks, cx, cz, getBlockGlobal, uvMap, MIN_Y, WORLD_HEIGHT, getTorch, getFurnace, getDoor, getChest, getTorchList) {
  const op = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const tr = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const em = { pos: [], nor: [], uv: [], col: [], idx: [] }; // ışık yayanlar (meşale)

  const getLocal = (lx, y, lz) => {
    if (y < MIN_Y || y > MIN_Y + WORLD_HEIGHT - 1) return 0;
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) return blocks[(y - MIN_Y) * 256 + lz * 16 + lx];
    return getBlockGlobal(cx * 16 + lx, y, cz * 16 + lz);
  };

  // ===== IŞIK: sütun başına yumuşak gökyüzü tıkanması (MC 1.21.1'e yakın gradyan) =====
  // Eskiden: herhangi bir blok üstte varsa TÜM alt yüzeyler 0.03 (pik siyah) du. Artık:
  // üstte kaç opak blok olduğuna göre üssel-yumuşak sönüm + alt sınır 0.24 (kaydet görünür).
  const colBlocked = new Float32Array(16 * 16 * WORLD_HEIGHT);
  {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        let shade = 1.0; // açık gökyüzü (üst değer)
        for (let y = MIN_Y + WORLD_HEIGHT - 1; y >= MIN_Y; y--) {
          colBlocked[(lz * 16 + lx) * WORLD_HEIGHT + (y - MIN_Y)] = shade;
          // Her opak blok ışığı ~%45 kısar, 0.24 tabanında durur (mağaralar görünür, meşale hâlâ şart)
          if (isOpaqueFast(blocks[(y - MIN_Y) * 256 + lz * 16 + lx])) shade = Math.max(0.24, shade * 0.55);
        }
      }
    }
  }
  // ===== Işık: meşaleler (seviye 14, her blok -1 taxicab) =====
  const torchList = (typeof getTorchList === 'function') ? (getTorchList(cx, cz) || []) : [];
  function torchLightAt(wx, y, wz) {
    let best = 0;
    for (let i = 0; i < torchList.length; i++) {
      const t = torchList[i];
      const d = Math.abs(t[0] - wx) + Math.abs(t[1] - y) + Math.abs(t[2] - wz);
      const l = 14 - d;
      if (l > best) best = l;
    }
    if (best <= 0) return 0;
    // Hafif eğri: yüksek seviyeler daha parlak, 0'a doğru hızla düşer (MC'ye yakın)
    return Math.pow(best / 15, 2.3);
  }

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

  // MC kapı: 3/16 ince 3D panel. Vanilla Minecraft 1.21.1 model spesifikasyonu:
  // Alt yarı (id 25) alt doku, üst yarı (id 26) üst doku.
  // Üst kapak sadece en üstte (id 26), alt kapak sadece en altta (id 25). Ortada kapak/raf YOKTUR.
  // Kenarlar 3 piksellik orantılı UV ile çizilir (esneme veya bozulma olmaz).
  const DOOR_N = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
  function addDoor(bucket, wx, y, wz, rect, face, open, hinge = 1, isTop = false, isBottom = false, light = 1) {
    const n = DOOR_N[face & 3] || DOOR_N[0];
    const t = [-n[2], 0, n[0]]; // panel teğeti
    const shade = Math.abs(n[0]) > 0 ? 0.8 : 0.7;
    const hh = 0.09375; // 3/32 blok (toplam 3/16 = 0.1875 kalınlık)
    const du = (rect.u1 - rect.u0) * (3 / 16);
    const dv = (rect.v1 - rect.v0) * (3 / 16);
    const quads = [];

    if (!open) {
      // KAPALI: Tam dikey dikdörtgen panel
      const cx = wx + 0.5, cz = wz + 0.5;
      const C00 = [cx - t[0] * 0.5 - n[0] * hh, y, cz - t[2] * 0.5 - n[2] * hh];
      const C10 = [cx + t[0] * 0.5 - n[0] * hh, y, cz + t[2] * 0.5 - n[2] * hh];
      const C11 = [cx + t[0] * 0.5 + n[0] * hh, y, cz + t[2] * 0.5 + n[2] * hh];
      const C01 = [cx - t[0] * 0.5 + n[0] * hh, y, cz - t[2] * 0.5 + n[2] * hh];
      const T00 = [C00[0], y + 1, C00[2]];
      const T10 = [C10[0], y + 1, C10[2]];
      const T11 = [C11[0], y + 1, C11[2]];
      const T01 = [C01[0], y + 1, C01[2]];

      // Ön yüz (+n)
      quads.push({
        p: [C01, C11, T11, T01],
        n: [n[0], 0, n[2]],
        uv: [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]],
      });
      // Arka yüz (-n)
      quads.push({
        p: [C10, C00, T00, T10],
        n: [-n[0], 0, -n[2]],
        uv: [[rect.u1, rect.v0], [rect.u0, rect.v0], [rect.u0, rect.v1], [rect.u1, rect.v1]],
      });
      // Sol kenar (-t)
      quads.push({
        p: [C00, C01, T01, T00],
        n: [-t[0], 0, -t[2]],
        uv: [[rect.u0, rect.v0], [rect.u0 + du, rect.v0], [rect.u0 + du, rect.v1], [rect.u0, rect.v1]],
      });
      // Sağ kenar (+t)
      quads.push({
        p: [C11, C10, T10, T11],
        n: [t[0], 0, t[2]],
        uv: [[rect.u1 - du, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u1 - du, rect.v1]],
      });
      // Üst kapak (+y) - SADECE üst yarıda (id 26)
      if (isTop) {
        quads.push({
          p: [T00, T01, T11, T10],
          n: [0, 1, 0],
          uv: [[rect.u0, rect.v0], [rect.u0, rect.v0 + dv], [rect.u1, rect.v0 + dv], [rect.u1, rect.v0]],
        });
      }
      // Alt kapak (-y) - SADECE alt yarıda (id 25)
      if (isBottom) {
        quads.push({
          p: [C01, C00, C10, C11],
          n: [0, -1, 0],
          uv: [[rect.u0, rect.v0], [rect.u0, rect.v0 + dv], [rect.u1, rect.v0 + dv], [rect.u1, rect.v0]],
        });
      }
    } else {
      // AÇIK: Menteşeden 90° duvara doğru dönmüş panel
      const hs = hinge < 0 ? -1 : 1;
      const hx = wx + 0.5 + t[0] * 0.5 * hs, hz = wz + 0.5 + t[2] * 0.5 * hs;
      const dx = -n[0], dz = -n[2];
      const th = [t[0], 0, t[2]];

      const C00 = [hx - th[0] * hh, y, hz - th[2] * hh];
      const C01 = [hx + th[0] * hh, y, hz + th[2] * hh];
      const C11 = [hx + dx + th[0] * hh, y, hz + dz + th[2] * hh];
      const C10 = [hx + dx - th[0] * hh, y, hz + dz - th[2] * hh];
      const T00 = [C00[0], y + 1, C00[2]];
      const T01 = [C01[0], y + 1, C01[2]];
      const T11 = [C11[0], y + 1, C11[2]];
      const T10 = [C10[0], y + 1, C10[2]];

      // Yan yüz 1 (+th)
      quads.push({
        p: [C01, C11, T11, T01],
        n: [th[0], 0, th[2]],
        uv: [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]],
      });
      // Yan yüz 2 (-th)
      quads.push({
        p: [C10, C00, T00, T10],
        n: [-th[0], 0, -th[2]],
        uv: [[rect.u1, rect.v0], [rect.u0, rect.v0], [rect.u0, rect.v1], [rect.u1, rect.v1]],
      });
      // Menteşe kenarı (-dx, -dz)
      quads.push({
        p: [C00, C01, T01, T00],
        n: [-dx, 0, -dz],
        uv: [[rect.u0, rect.v0], [rect.u0 + du, rect.v0], [rect.u0 + du, rect.v1], [rect.u0, rect.v1]],
      });
      // Panel ucu kenarı (+dx, +dz)
      quads.push({
        p: [C11, C10, T10, T11],
        n: [dx, 0, dz],
        uv: [[rect.u1 - du, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u1 - du, rect.v1]],
      });
      // Üst kapak (+y) - SADECE üst yarıda (id 26)
      if (isTop) {
        quads.push({
          p: [T00, T01, T11, T10],
          n: [0, 1, 0],
          uv: [[rect.u0, rect.v0], [rect.u0, rect.v0 + dv], [rect.u1, rect.v0 + dv], [rect.u1, rect.v0]],
        });
      }
      // Alt kapak (-y) - SADECE alt yarıda (id 25)
      if (isBottom) {
        quads.push({
          p: [C01, C00, C10, C11],
          n: [0, -1, 0],
          uv: [[rect.u0, rect.v0], [rect.u0, rect.v0 + dv], [rect.u1, rect.v0 + dv], [rect.u1, rect.v0]],
        });
      }
    }
    for (const q of quads) {
      const base = bucket.pos.length / 3;
      const len = Math.hypot(q.n[0], q.n[1], q.n[2]) || 1;
      const nn = [q.n[0] / len, q.n[1] / len, q.n[2] / len];
      q.p.forEach((v, i) => {
        bucket.pos.push(v[0], v[1], v[2]);
        bucket.nor.push(...nn);
        const [u, vCoord] = q.uv[i];
        bucket.uv.push(u, vCoord);
        bucket.col.push(shade * light, shade * light, shade * light);
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
        if (id === 86) continue; // ateş: chunk mesh'te çizilmez, effects'in animasyonlu quad'ları kullanılır
        // Yüz ışık çarpanı: yumuşak sky-light gradyanı (taban 0.24) veya meşale ışığı (MC seviye 1'er)
        const wx = cx * 16 + lx, wz = cz * 16 + lz;
        const colKey = (lz * 16 + lx) * WORLD_HEIGHT + (y - MIN_Y);
        const blocked = colBlocked[colKey];
        const torchF = torchLightAt(wx, y, wz);
        const faceLight = Math.max(blocked, torchF * 0.97 + 0.03);
        // Kapı yarıları: ince panel, alt/üst doku ayrı
        if (id === 25 || id === 26) {
          const by = id === 25 ? y : y - 1;
          const st = getDoor ? getDoor(cx * 16 + lx, by, cz * 16 + lz) : null;
          const face = (st && st.face | 0) || 0;
          const open = !!(st && st.open);
          const hinge = (st && st.hinge) || 1;
          const wx0 = cx * 16 + lx, wz0 = cz * 16 + lz;
          // Kapıyı doğru yüz yönüyle çiz (her yön için ayrı doku)
          const DIRS = ['pz', 'nz', 'px', 'nx'];
          const dir = DIRS[face] || 'pz';
          const tex = faceTextureName(id, dir, face, 0);
          const rect = uvMap[tex] || uvMap['stone'];
          const isTop = id === 26;
          const isBottom = id === 25;
          addDoor(op, wx0, y, wz0, rect, face, open, hinge, isTop, isBottom, faceLight);
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
        const isTrans = id === 9 || id === 16 || id === 6;
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
            bucket.col.push(tint[0] * f.shade * faceLight, tint[1] * f.shade * faceLight, tint[2] * f.shade * faceLight);
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
