import * as THREE from 'three';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../core/config.js';

// Blok fiziği: düşen bloklar (kum/çakıl) + SIVI MOTORU (MC 1.21.1).
// ChunkManager.setBlock funnel'ından beslenir (main.js onEdit kancası).
// Düşme MC 1.21 sayılarıyla: yerçekimi 0.04 blok/tick² (@20tps) = 16 blok/sn²,
// dikey sürtünme ×0.98/tick, limit hız 1.96 blok/tick = 39.2 blok/sn.
// (1 blok ≈0.35sn, 5 blok ≈0.8sn, 10 blok ≈1.1sn.)

export const FALL_IDS = new Set([8, 15]); // kum, çakıl
export const FALL_GRAVITY = 16; // blok/sn²
export const FALL_TERMINAL = 39.2; // blok/sn
const FALL_DRAG_TICK = 0.98;
const FALLER_CAP = 40;
const FALL_TIMEOUT = 30; // sn (MC: 600 tick)

function key(x, y, z) { return x + ',' + y + ',' + z; }

class Queue {
  constructor() { this.list = []; this.set = new Set(); }
  push(x, y, z) {
    if (y < MIN_Y || y > MAX_Y + 8) return;
    const k = key(x, y, z);
    if (this.set.has(k)) return;
    this.set.add(k);
    this.list.push([x, y, z]);
    if (this.list.length > 4000) { const old = this.list.shift(); this.set.delete(key(old[0], old[1], old[2])); }
  }
  // FIFO ( adil ): kuyruktaki en eski hücre önce işlenir.
  // LIFO denendi ama "açlık" sorunu yarattı: sürekli yenileri eklenince eski hücreler
  // hiç sıra gelmiyordu (kaynak bloklar işlenmediği için su düşmüyordu).
  shift() {
    const c = this.list.shift();
    if (c) this.set.delete(key(c[0], c[1], c[2]));
    return c;
  }
  get size() { return this.list.length; }
  clear() { this.list = []; this.set.clear(); }
}

// ===== SIVI MOTORU (MC 1.21.1) =====
// Kaynak/akan ayrımı blok id'sine gömülü -> seviye chunk ile birlikte kaydedilir:
//   16      = Su kaynağı  (seviye 0)
//   87      = Lav kaynağı (seviye 0)
//   88..94  = Akan su     (seviye 1..7)
//   95..97  = Akan lav     (seviye 1..3)
//   98      = Obsidyen
// MC kuralları: su kaynağı 7 blok, lav kaynağı 3 blok yana yayılır.
// "Kısa yol kazanır": seviye = 1 + min(yatay komşu seviyesi).

export const FLUID_WATER = 1;
export const FLUID_LAVA = 2;
export const WATER_SOURCE_ID = 16;
export const LAVA_SOURCE_ID = 87;
export const OBSIDIAN_ID = 98;
export const WATER_MAX_LEVEL = 7;   // MC: kaynak 7 blok
export const LAVA_MAX_LEVEL = 3;    // MC: kaynak 3 blok
export const WATER_TICK = 0.25;     // 4 tick/sn (MC su tick rate 5)
export const LAVA_TICK = 0.5;       // 2 tick/sn (MC lav tick rate 10 -> yavaş)
const WATER_BUDGET = 384;           // tick başına işlenen hücre
const LAVA_BUDGET = 256;

const FLUID_INFO = new Map();
FLUID_INFO.set(WATER_SOURCE_ID, { t: FLUID_WATER, l: 0 });
FLUID_INFO.set(LAVA_SOURCE_ID, { t: FLUID_LAVA, l: 0 });
for (let l = 1; l <= WATER_MAX_LEVEL; l++) FLUID_INFO.set(87 + l, { t: FLUID_WATER, l });
for (let l = 1; l <= LAVA_MAX_LEVEL; l++) FLUID_INFO.set(94 + l, { t: FLUID_LAVA, l });

/** id -> {t: tür, l: seviye} | null */
export function fluidInfo(id) { return FLUID_INFO.get(id) || null; }
/** id bir sıvı mı? */
export function isFluidBlock(id) { return FLUID_INFO.has(id); }
/** sıvı türü (0 = sıvı değil) */
export function fluidTypeOf(id) { const i = FLUID_INFO.get(id); return i ? i.t : 0; }
/** türün maksimum seviyesi (yayılma mesafesi) */
export function fluidMaxLevel(type) { return type === FLUID_LAVA ? LAVA_MAX_LEVEL : WATER_MAX_LEVEL; }
/** tür + seviye -> blok id */
export function fluidIdFor(type, level) {
  if (level <= 0) return type === FLUID_LAVA ? LAVA_SOURCE_ID : WATER_SOURCE_ID;
  return type === FLUID_LAVA ? 94 + level : 87 + level;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Kum/çakıl içinden geçebildiği bloklar: hava, sıvılar, meşale, ateş (MC)
function fallThrough(id) { return id === 0 || id === 16 || id === 21 || id === 86 || isFluidBlock(id); }

export class FallSim {
  constructor() { this.q = new Queue(); this.fallers = []; this.geo = null; this._scene = null; }
  push(x, y, z) { this.q.push(x, y, z); }
  pushColumn(x, y, z) { this.q.push(x, y, z); this.q.push(x, y + 1, z); }
  clear() {
    this.q.clear();
    for (const f of this.fallers) { try { (f.mesh.parent || this._scene)?.remove(f.mesh); } catch {} }
    this.fallers = [];
  }
  get size() { return this.q.size + this.fallers.length; }
  killFaller(f, env) {
    try { env.scene.remove(f.mesh); } catch {}
    const i = this.fallers.indexOf(f);
    if (i >= 0) this.fallers.splice(i, 1);
  }
  // env: {getBlock, setBlock, isLoaded, scene, tileMaterial(id), onTorchCrush(x,y,z,id), spawnDrop(id,x,y,z)}
  update(dt, env) {
    if (!this.geo) this.geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    this._scene = env.scene;
    // 1) tetikleme: desteksiz kum/çakıl -> düşen-varlık doğar, blok hemen silinir (MC)
    let n = 0;
    while (n < 16) {
      const c = this.q.shift();
      if (!c) break;
      n++;
      const [x, y, z] = c;
      if (!env.isLoaded(x, y, z)) continue;
      const id = env.getBlock(x, y, z);
      if (!FALL_IDS.has(id)) continue;
      if (!fallThrough(env.getBlock(x, y - 1, z))) continue;
      if (this.fallers.length >= FALLER_CAP) {
        // havuz dolu: emniyetten anında yerleştir (eski hızlı yol)
        this.instantPlace(x, y, z, id, env);
        continue;
      }
      env.setBlock(x, y, z, 0);
      const mesh = new THREE.Mesh(this.geo, env.tileMaterial(id));
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      env.scene.add(mesh);
      this.fallers.push({ id, x, z, y, vel: 0, age: 0, mesh });
      this.push(x, y + 1, z); // üstteki kolon da kontrol edilsin
    }
    // 2) düşenler: alttan üste işle ki aynı karede üst üste binsinler
    this.fallers.sort((a, b) => a.y - b.y);
    const dragF = Math.pow(FALL_DRAG_TICK, dt * 20);
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.age += dt;
      // timeout (MC: 600 tick) -> eşya olur
      if (f.age > FALL_TIMEOUT || f.y < MIN_Y - 20) {
        try { env.spawnDrop(f.id, f.x, Math.max(MIN_Y, Math.floor(f.y)), f.z); } catch {}
        this.killFaller(f, env);
        continue;
      }
      if (!env.isLoaded(f.x, Math.floor(f.y), f.z)) continue; // chunk boşaldı: havada bekle
      f.vel = Math.min(FALL_TERMINAL, (f.vel + FALL_GRAVITY * dt) * dragF);
      f.y -= f.vel * dt;
      f.mesh.position.set(f.x + 0.5, f.y + 0.5, f.z + 0.5);
      // iniş taraması: ilk katının üstü
      let sy = Math.floor(f.y), guard = 0;
      while (guard++ < 80) {
        const b = env.getBlock(f.x, sy, f.z);
        if (!fallThrough(b)) break;
        sy--;
        if (sy < MIN_Y - 2) break;
      }
      const top = sy + 1;
      if (f.y > top) continue;
      // INDI: hedef hücre yüklenmemişse bekle (blok kaybı yok)
      if (!env.isLoaded(f.x, top, f.z)) { f.y = top; continue; }
      const cell = env.getBlock(f.x, top, f.z);
      this.killFaller(f, env);
      if (top < MIN_Y + 1) continue; // void: kaybolur (MC)
      if (cell === 21) {
        // MC: meşaleye inen kum/çakıl eşya olur, meşale yerinde kalır
        try { env.onTorchCrush(f.x, top, f.z, f.id); } catch {}
      } else if (cell === 0 || cell === 16 || isFluidBlock(cell)) {
        env.setBlock(f.x, top, f.z, f.id);
        this.push(f.x, top + 1, f.z);
      } else {
        try { env.spawnDrop(f.id, f.x, top, f.z); } catch {}
      }
    }
  }
  instantPlace(x, y, z, id, env) {
    let ly = y - 1, guard = 0;
    while (guard++ < 64) {
      const b = env.getBlock(x, ly, z);
      if (!fallThrough(b)) break;
      ly--;
      if (ly < MIN_Y) break;
    }
    ly++;
    if (ly >= y || ly < MIN_Y + 1) return;
    const landId = env.getBlock(x, ly, z);
    if (landId === 21) {
      // MC: kum eşya olur, meşale yerinde kalır (kaynak blok silinir, çoğaltma yok)
      env.setBlock(x, y, z, 0);
      try { env.onTorchCrush(x, ly, z, id); } catch {}
      this.push(x, y + 1, z);
      return;
    }
    env.setBlock(x, y, z, 0);
    env.setBlock(x, ly, z, id);
    this.pushColumn(x, y, z);
    this.pushColumn(x, ly, z);
  }
}

// ===== SIVI MOTORU (MC 1.21.1) =====
export class FluidSim {
  constructor() {
    this.qWater = new Queue();
    this.qLava = new Queue();
    this.waterAcc = 0;
    this.lavaAcc = 0;
    this._suppress = 0;
    this.stats = { cells: 0, cobble: 0, obsidian: 0, filled: 0, removed: 0 };
  }
  /** Sim kendi yazımı sırasında genel push'u bastırır (kuyruk şişmesini önler) */
  get suppressed() { return this._suppress > 0; }
  /**
   * Sıvı bloğu yaz + etkilenen hücreleri kuyruğa al (yatay komşular + alt hücre).
   * MC: seviye değişimi komşuların seviyesini etkiler, o yüzden onlar da yeniden hesaplanır.
   */
  write(hooks, x, y, z, id) {
    this._suppress++;
    try { hooks.setBlock(x, y, z, id); } finally { this._suppress--; }
    this.push(x, y, z);
    this.push(x + 1, y, z); this.push(x - 1, y, z);
    this.push(x, y, z + 1); this.push(x, y, z - 1);
    this.push(x, y - 1, z);
  }
  /** Genel bildirim (tür bilinmiyor): her iki kuyruğa da düşer */
  push(x, y, z) { this.qWater.push(x, y, z); this.qLava.push(x, y, z); }
  pushWater(x, y, z) { this.qWater.push(x, y, z); }
  pushLava(x, y, z) { this.qLava.push(x, y, z); }
  /** Hücre + 6 komşu (blok değişiminde tetiklenir) */
  pushNeighbors(x, y, z) {
    this.push(x, y, z);
    this.push(x + 1, y, z); this.push(x - 1, y, z);
    this.push(x, y + 1, z); this.push(x, y - 1, z);
    this.push(x, y, z + 1); this.push(x, y, z - 1);
  }
  clear() { this.qWater.clear(); this.qLava.clear(); this.waterAcc = 0; this.lavaAcc = 0; }
  get size() { return this.qWater.size + this.qLava.size; }

  /**
   * @param dt   geçen süre (sn)
   * @param hooks {getBlock, setBlock, isLoaded, onLavaTouch?}
   */
  step(dt, hooks) {
    let processed = 0;
    this.waterAcc += dt;
    this.lavaAcc += dt;
    if (this.waterAcc >= WATER_TICK) {
      this.waterAcc = 0;
      processed += this.processQueue(this.qWater, FLUID_WATER, WATER_BUDGET, hooks);
    }
    if (this.lavaAcc >= LAVA_TICK) {
      this.lavaAcc = 0;
      processed += this.processQueue(this.qLava, FLUID_LAVA, LAVA_BUDGET, hooks);
    }
    this.stats.cells = processed;
    return processed;
  }

  processQueue(q, type, budget, hooks) {
    let n = 0;
    while (n < budget) {
      const c = q.shift();
      if (!c) break;
      n++;
      const [x, y, z] = c;
      if (hooks.isLoaded && !hooks.isLoaded(x, y, z)) continue;
      const id = hooks.getBlock(x, y, z);
      const info = fluidInfo(id);
      if (!info) { this.tryFill(x, y, z, type, hooks); continue; }
      if (info.t !== type) continue; // diğer sıvı türü -> kendi kuyruğunda işlenir
      this.updateCell(x, y, z, id, info, hooks);
    }
    return n;
  }

  /** Hava hücresi: komşu sıvıdan dolar (MC: kazılan boşluk suyu çeker) */
  tryFill(x, y, z, type, hooks) {
    // SADECE hava hücresi dolar; katı blokların üstüne sıvı yazılmaz
    if (hooks.getBlock(x, y, z) !== 0) return;
    const maxL = fluidMaxLevel(type);
    let best = null;
    // MC: sıvı yalnızca YANINA kazılan boşluğu doldurur (üstüne tırmanmaz)
    for (const [dx, dz] of DIRS4) {
      const nid = hooks.getBlock(x + dx, y, z + dz);
      const ni = fluidInfo(nid);
      if (!ni || ni.t !== type) continue;
      if (best === null || ni.l < best) best = ni.l;
    }
    if (best === null) return;
    const level = best + 1;
    if (level > maxL) return;
    if (hooks.isLoaded && !hooks.isLoaded(x, y, z)) return;
    this.write(hooks, x, y, z, fluidIdFor(type, level));
    this.stats.filled++;
  }

  /** Sıvı hücresini MC kurallarıyla güncelle */
  updateCell(x, y, z, id, info, hooks) {
    const type = info.t;
    const maxL = fluidMaxLevel(type);
    const above = hooks.getBlock(x, y + 1, z);
    const aboveInfo = fluidInfo(above);
    const aboveSame = !!aboveInfo && aboveInfo.t === type;
    const below = hooks.getBlock(x, y - 1, z);
    const belowInfo = fluidInfo(below);
    const belowSame = !!belowInfo && belowInfo.t === type;
    const belowIsSource = belowSame && belowInfo.l === 0;
    const falling = aboveSame && below === 0; // düşüyor (altı boş)

    let level = info.l;

    if (level > 0) {
      // Yatay komşulardaki en iyi (en düşük seviyeli) kaynak yolu
      let best = null;
      for (const [dx, dz] of DIRS4) {
        const nid = hooks.getBlock(x + dx, y, z + dz);
        const ni = fluidInfo(nid);
        if (!ni || ni.t !== type) continue;
        if (best === null || ni.l < best) best = ni.l;
      }
      // MC: geçerli sıvı hücresi kendisinden DAHA DÜŞÜK seviyeli bir komşuya (kaynak yoluna)
      // sahip olmalıdır. Kaynak kalkınca bu dal kırılır ve hücre geri çekilir.
      const hasPath = best !== null && best < level;
      const supported = hasPath || belowIsSource || aboveSame;
      if (!supported) {
        // Kaynak kalmadı -> sıvı geri çekilir (MC)
        this.write(hooks, x, y, z, 0);
        this.stats.removed++;
        return;
      }
      if (hasPath) {
        const desired = best + 1;
        if (desired > maxL) {
          // Yayılma sınırı aşıldı -> hücre kaybolur (MC)
          this.write(hooks, x, y, z, 0);
          this.stats.removed++;
          return;
        }
        if (desired !== level) {
          // Daha kısa yol (tazeleme) veya zayıflama (kaynak uzaklaştı)
          level = desired;
          this.write(hooks, x, y, z, fluidIdFor(type, level));
        }
      }
    }

    // Lav + su karışımı: lav kaynağı -> obsidyen, akan lav -> çakıltaşı (MC)
    if (this.handleMix(x, y, z, type, level, hooks)) return;

    // Aşağı akış (yerçekimi): alt hücre boşsa sıvı düşer
    if (below === 0) {
      if (hooks.isLoaded && !hooks.isLoaded(x, y - 1, z)) return; // yüklü olmayan chunk'a yazma
      this.write(hooks, x, y - 1, z, fluidIdFor(type, 1));
      return;
    }

    // Düşerken yatay yayılmaz (MC)
    if (falling) return;

    // Yatay yayılım (seviye + 1)
    const spread = level + 1;
    if (spread > maxL) return;
    for (const [dx, dz] of DIRS4) {
      const nx = x + dx, nz = z + dz;
      const nid = hooks.getBlock(nx, y, nz);
      const ni = fluidInfo(nid);
      if (ni) {
        if (ni.t === type && ni.l > spread) {
          // Bayat (uzaktan gelen) sıvı -> tazele (sadece gerçekten daha tazese yaz)
          this.write(hooks, nx, y, nz, fluidIdFor(type, spread));
        }
        continue;
      }
      if (nid !== 0) continue; // değiştirilemez blok
      if (hooks.isLoaded && !hooks.isLoaded(nx, y, nz)) continue; // yüklü olmayan chunk'a yayılma
      this.write(hooks, nx, y, nz, fluidIdFor(type, spread));
    }
  }

  /** Su/lav teması -> obsidyen (kaynak) veya çakıltaşı (akan) */
  handleMix(x, y, z, type, level, hooks) {
    for (const [dx, dy, dz] of DIRS6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const nid = hooks.getBlock(nx, ny, nz);
      const ni = fluidInfo(nid);
      if (ni && ni.t !== type) {
        if (type === FLUID_LAVA) {
          // bu hücre lav, komşusu su
          if (level === 0) {
            this.write(hooks, x, y, z, OBSIDIAN_ID);        // lav kaynağı -> obsidyen
            this.stats.obsidian++;
          } else {
            this.write(hooks, x, y, z, 4);                 // akan lav -> çakıltaşı
            this.write(hooks, nx, ny, nz, 4);              // su da çakıltaşı olur
            this.stats.cobble++;
          }
          return true;
        }
        // bu hücre su, komşusu lav
        if (ni.l === 0) {
          this.write(hooks, nx, ny, nz, OBSIDIAN_ID);      // lav kaynağı -> obsidyen
          this.stats.obsidian++;
        } else {
          this.write(hooks, nx, ny, nz, 4);               // akan lav -> çakıltaşı
          this.write(hooks, x, y, z, 4);                  // su da çakıltaşı olur
          this.stats.cobble++;
        }
        return true;
      }
      // Lav, yanıcı blokları tutuşturur (MC: lav ağaca yangın çıkarır)
      if (type === FLUID_LAVA && ni === null && nid !== 0 && hooks.onLavaTouch) {
        try { hooks.onLavaTouch(nx, ny, nz, nid); } catch {}
      }
    }
    return false;
  }
}

// Geriye dönük uyum: eski adı kullanan kodlar için
export const WaterSim = FluidSim;
