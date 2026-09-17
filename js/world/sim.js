import * as THREE from 'three';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../core/config.js';

// Blok fiziği: düşen bloklar (kum/çakıl) + su dolgusu.
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
  shift() {
    const c = this.list.shift();
    if (c) this.set.delete(key(c[0], c[1], c[2]));
    return c;
  }
  get size() { return this.list.length; }
  clear() { this.list = []; this.set.clear(); }
}

// Kum/çakıl içinden geçebildiği bloklar: hava, su, meşale
function fallThrough(id) { return id === 0 || id === 16 || id === 21; }

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
      } else if (cell === 0 || cell === 16) {
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

// MC-lite su: aşağı doldur + deniz seviyesinde kıyıya yanal yayıl.
// Mağara sellerini engellemek için yanal yayılma y<=SEA_LEVEL hücrelerle sınırlı.
export class WaterSim {
  constructor() { this.q = new Queue(); }
  push(x, y, z) { this.q.push(x, y, z); }
  pushNeighbors(x, y, z) {
    this.q.push(x, y, z);
    this.q.push(x + 1, y, z); this.q.push(x - 1, y, z);
    this.q.push(x, y + 1, z); this.q.push(x, y - 1, z);
    this.q.push(x, y, z + 1); this.q.push(x, y, z - 1);
  }
  clear() { this.q.clear(); }
  get size() { return this.q.size; }
  // hooks: {getBlock, setBlock, isLoaded}
  step(budget, hooks) {
    let n = 0;
    while (n < budget) {
      const c = this.q.shift();
      if (!c) break;
      n++;
      const [x, y, z] = c;
      if (hooks.isLoaded && !hooks.isLoaded(x, y, z)) continue;
      const id = hooks.getBlock(x, y, z);
      if (id === 16) {
        // 1) altına ak: hava/meşale varsa su doldur
        const b = hooks.getBlock(x, y - 1, z);
        if ((b === 0 || b === 21) && y - 1 >= MIN_Y) {
          hooks.setBlock(x, y - 1, z, 16);
          this.pushNeighbors(x, y - 1, z);
        }
        // 2) yana yayıl: sadece deniz seviyesi ve altında, tabanı destekli kıyılar
        if (y <= SEA_LEVEL) {
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dz] of nb) {
            const nid = hooks.getBlock(x + dx, y, z + dz);
            if (nid !== 0) continue;
            const sup = hooks.getBlock(x + dx, y - 1, z + dz);
            if (sup !== 0 && sup !== 21) {
              hooks.setBlock(x + dx, y, z + dz, 16);
              this.pushNeighbors(x + dx, y, z + dz);
            }
          }
        }
      } else if (id === 0 && y <= SEA_LEVEL) {
        // hava cebi: yanında su + altı destekliyse doldur (kazılmış su altı)
        const sup = hooks.getBlock(x, y - 1, z);
        if (sup === 0 || sup === 21) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
        let wet = false;
        for (const [dx, dz] of nb) {
          if (dx === 0 && dz === 0) {
            if (hooks.getBlock(x, y + 1, z) === 16) { wet = true; break; }
          } else if (hooks.getBlock(x + dx, y, z + dz) === 16) { wet = true; break; }
        }
        if (wet) {
          hooks.setBlock(x, y, z, 16);
          this.pushNeighbors(x, y, z);
        }
      }
    }
    return n;
  }
}
