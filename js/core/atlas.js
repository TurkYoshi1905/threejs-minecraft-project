import * as THREE from 'three';
import { BLOCKS } from '../world/blocks.js';

// Tüm blok texture'larını tek atlas'ta birleştirir.
// Neden: chunk başına 10 draw call yerine 2 draw call (opaque + transparent).
// Atlas: 8x8 grid, her tile 16px => 128x128 canvas.

const ATLAS_COLS = 8;
const ATLAS_ROWS = 8;
const TILE = 16;

function collectTextureNames() {
  const names = new Set();
  for (const b of Object.values(BLOCKS)) {
    if (b.all) names.add(b.all);
    if (b.top) names.add(b.top);
    if (b.side) names.add(b.side);
    if (b.bottom) names.add(b.bottom);
    if (b.front) names.add(b.front);
  }
  names.add('furnace_front_on'); // yanık fırın ağzı
  return [...names];
}

function placeholderImage(name) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  g.fillStyle = '#' + (h & 0xffffff).toString(16).padStart(6, '0');
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, TILE, 4); g.fillRect(0, 12, TILE, 4);
  return c;
}

// Prosedürel dokular (dosyasız bloklar: çalışma masası)
function plankBase(g) {
  g.fillStyle = '#a0824f'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#8a6c40';
  for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1);
  g.fillStyle = '#b5935c';
  for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1);
  // tahta aralıkları
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(5, 0, 1, 16); g.fillRect(11, 0, 1, 16);
}
function proceduralTile(name) {
  if (name !== 'crafting_table_top' && name !== 'crafting_table_side' && name !== 'torch') return null;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  if (name === 'torch') {
    // MC düzeni: alev üstte (0-5), sap altta (6-15), 2px genişlikte ortalı.
    // NOT: repodaki block/torch.png alevsiz bozuk geldiği için dosya değil bu çizim kullanılır.
    g.clearRect(0, 0, 16, 16);
    g.fillStyle = '#7a5a2e'; g.fillRect(7, 6, 2, 10); // sap
    g.fillStyle = '#5e421f'; g.fillRect(7, 6, 1, 10); // sap gölgesi
    g.fillStyle = '#3d2c12'; g.fillRect(7, 5, 2, 1);  // alev-sap birleşimi
    g.fillStyle = '#ff9d2e'; g.fillRect(6, 1, 4, 5);  // alev dış (turuncu)
    g.fillStyle = '#ffdf6b'; g.fillRect(6, 1, 4, 3);  // alev iç (sarı)
    g.fillStyle = '#fff6c8'; g.fillRect(7, 1, 2, 2);  // alev çekirdeği (beyaz-sarı)
    return c;
  }
  if (name === 'crafting_table_top') {
    plankBase(g);
    g.strokeStyle = '#4a3418'; g.lineWidth = 2;
    g.strokeRect(1, 1, 14, 14); // koyu çerçeve
    g.strokeStyle = '#6b4c22'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, 2); g.lineTo(8, 14); g.moveTo(2, 8); g.lineTo(14, 8); g.stroke(); // ızgara izi
    g.fillStyle = '#5b5b5b'; g.fillRect(2, 2, 2, 2); g.fillRect(12, 12, 2, 2); // alet başları hissi
  } else {
    plankBase(g);
    g.fillStyle = '#c4a061'; g.fillRect(0, 0, 16, 4); // üst tabla çıkıntısı
    g.fillStyle = '#4a3418'; g.fillRect(0, 4, 16, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, 7, 5, 5); g.fillRect(9, 7, 5, 6); // ön paneller
    g.fillStyle = '#2e2e2e'; g.fillRect(0, 15, 16, 1);
  }
  return c;
}

async function loadImage(name) {
  // Sıra: prosedürel öncelik (torch) -> gerçek dosya -> prosedürel fallback -> placeholder.
  // Faithful 1.21.1 dokuları textures/ altında vendor edildi.
  // NOT: block/torch.png repoda alevsiz bozuk geldiği için dosya okunmaz, çizim kullanılır.
  if (name === 'torch') return { image: proceduralTile('torch'), usedName: name };
  const tryNames = [name];
  for (const n of tryNames) {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(`textures/${n}.png`);
      if (tex.image) {
        const img = tex.image;
        // Animasyonlu şerit (water_still 16x512): sadece ilk 16x16 frame
        if (img.height > img.width) {
          const c = document.createElement('canvas');
          c.width = c.height = TILE;
          c.getContext('2d').drawImage(img, 0, 0, img.width, img.width, 0, 0, TILE, TILE);
          return { image: c, usedName: n };
        }
        return { image: img, usedName: n };
      }
    } catch { /* devam */ }
  }
  const proc = proceduralTile(name);
  if (proc) return { image: proc, usedName: name };
  return { image: placeholderImage(name), usedName: name };
}

export async function buildAtlas() {
  const names = collectTextureNames();
  // Gutter: her tile'ın etrafına 4px kenar-piksel tekrarı. Vanilla MC de mip'li
  // atlasında pay bırakır; mipmap küçültmelerinde komşu tile sızmasını bitirir.
  const GUT = 4, CELL = TILE + GUT * 2;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const uvMap = {}; // texName -> {u0,v0,u1,v1} (0..1, flipY=true uyumlu)
  const loaded = await Promise.all(names.map(loadImage));

  loaded.forEach(({ image }, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const dx = col * CELL + GUT, dy = row * CELL + GUT;
    const iw = image.width || TILE, ih = image.height || TILE;
    ctx.drawImage(image, 0, 0, iw, ih, dx, dy, TILE, TILE);
    // kenarları gutter'a kopyala (sol/sağ sütun, üst/alt satır, 4 köşe)
    ctx.drawImage(canvas, dx, dy, 1, TILE, dx - GUT, dy, GUT, TILE);
    ctx.drawImage(canvas, dx + TILE - 1, dy, 1, TILE, dx + TILE, dy, GUT, TILE);
    ctx.drawImage(canvas, dx, dy, TILE, 1, dx, dy - GUT, TILE, GUT);
    ctx.drawImage(canvas, dx, dy + TILE - 1, TILE, 1, dx, dy + TILE, TILE, GUT);
    ctx.drawImage(canvas, dx, dy, 1, 1, dx - GUT, dy - GUT, GUT, GUT);
    ctx.drawImage(canvas, dx + TILE - 1, dy, 1, 1, dx + TILE, dy - GUT, GUT, GUT);
    ctx.drawImage(canvas, dx, dy + TILE - 1, 1, 1, dx - GUT, dy + TILE, GUT, GUT);
    ctx.drawImage(canvas, dx + TILE - 1, dy + TILE - 1, 1, 1, dx + TILE, dy + TILE, GUT, GUT);
    const name = names[i];
    // Canvas satırı üstten, UV v'si alttan: dönüştür (sadece 16px iç bölge)
    const u0 = (col * CELL + GUT) / canvas.width;
    const u1 = (col * CELL + GUT + TILE) / canvas.width;
    const v1 = 1 - (row * CELL + GUT) / canvas.height;
    const v0 = 1 - (row * CELL + GUT + TILE) / canvas.height;
    // Kenar sızmasını engellemek için yarım texel içeri
    const padU = 0.5 / canvas.width, padV = 0.5 / canvas.height;
    uvMap[name] = { u0: u0 + padU, v0: v0 + padV, u1: u1 - padU, v1: v1 - padV };
  });

  const texture = new THREE.CanvasTexture(canvas);
  // Vanilla MC: yakında keskin (Nearest büyütme), uzakta yumuşak (mip'li küçültme).
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;

  // fallback isimleri de map'e ekle (eski kayıt uyumu)
  uvMap['stone'] ??= uvMap['cobblestone'];

  return { texture, uvMap, canvas };
}

export function faceTextureName(id, dir) {
  const b = BLOCKS[id];
  if (!b) return 'stone';
  if (b.all) return b.all;
  if (dir === 'py') return b.top;
  if (dir === 'ny') return b.bottom;
  // Fırın: ön yüz (+z) farklı, diğer yanlar side
  if (b.furnace) return dir === 'pz' ? b.front : (dir === 'px' || dir === 'nx' || dir === 'nz' ? b.side : b.side);
  return b.side;
}
