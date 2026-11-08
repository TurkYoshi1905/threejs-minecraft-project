import * as THREE from 'three';
import { MIN_Y, MAX_Y } from '../core/config.js';
import { BLOCKS } from './blocks.js';

// Primed TNT düşüşünde "üzerinde durulabilen" blok mu?
function isFloorSolidId(id) {
  if (!id) return false;
  if (id === 16 || id === 21) return false; // su + meşale katı değil
  if (id === 25 || id === 26) return false; // kapı: basitçe geçirgen (fitil zaten 5sn)
  return true;
}

// Primed TNT (MC 1.21.1 öykünmesi):
// - Blok dünyadan silinir, raylı varlık doğar (yerçekimi, yere iniş)
// - Fitil yanarken beyaz/kırmızı yanıp söner (MC'nin beyaz üst üste binme efekti)
// - 5.0 sn sonra patlar: yarıçap 4, blok yıkımı blast dayanıklılığa göre
//   f = (1 - d/yarıçap) * (0.7 + rand*0.6) * 100  ->  blastResistance < f ise yıkılır
// - Su ve anakaya yıkılmaz; TNT komşuları zincir patlar (kısa rastgele fitil)
// - Patlama oyuncuya hasar + itme uygular

export const TNT_POWER = 4;
const FUSE_IGNITE_S = 5.0;      // çakmak ve çelikle ateşleme (MC aslı 4sn; kullanıcı 5sn istedi)
const FUSE_CHAIN_MIN = 0.5;     // zincir patlamada komşu TNT fitili (MC: 10-30 tick)
const FUSE_CHAIN_MAX = 1.5;
const GRAVITY = 22;
const BLINK_MS = 0.25;

function key(x, y, z) { return x + ',' + y + ',' + z; }

export class TNTSim {
  constructor() {
    this.list = []; // {id:'primed', x, y, z, vx, vy, vz, fuse, mesh, flash}
    this._scene = null;
  }
  get size() { return this.list.length; }
  clear() {
    for (const t of this.list) this._removeMesh(t);
    this.list = [];
  }
  _removeMesh(t) {
    try { if (t.mesh) { (t.mesh.parent || this._scene)?.remove(t.mesh); t.mesh.geometry?.dispose?.(); } } catch {}
  }
  serialize() {
    return this.list.map((t) => ({ x: t.x, y: t.y, z: t.z, fuse: t.fuse }));
  }
  load(arr, scene, faceMaterialFn) {
    this.clear();
    if (!Array.isArray(arr)) return;
    this._scene = scene;
    for (const d of arr) {
      if (!d || typeof d.x !== 'number' || typeof d.y !== 'number' || typeof d.z !== 'number') continue;
      this._spawn(d.x, d.y, d.z, typeof d.fuse === 'number' ? Math.max(0.1, d.fuse) : 1.0, null, faceMaterialFn, scene);
    }
  }
  // Asıl spawn: main.js env'i (scene + tileMaterial/faceMaterial) ile çağırır
  spawn(x, y, z, scene, tileMaterialFn, faceMaterialFn, fuse = FUSE_IGNITE_S) {
    this._scene = scene;
    this._spawn(x, y, z, fuse, tileMaterialFn, faceMaterialFn, scene);
  }
  _spawn(x, y, z, fuse, tileMaterialFn, faceMaterialFn, scene) {
    const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    // TNT 6 yüzü de kendi doğru dokusuyla görünür (üst=tnt_top, alt=tnt_bottom, yan=tnt_side)
    const face = typeof faceMaterialFn === 'function' ? faceMaterialFn : ((id, dir) => tileMaterialFn(id));
    const sideMat = face(64, 'pz');
    const topMat = face(64, 'py');
    const bottomMat = face(64, 'ny');
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat]);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    scene.add(mesh);
    this.list.push({
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 1.2,
      vz: (Math.random() - 0.5) * 0.6,
      fuse,
      mesh,
      blink: 0,
      mats: [sideMat, topMat, bottomMat],
    });
  }

  // env: { scene, getBlock(x,y,z)->number|null, setBlock, isLoaded(x,y,z), spawnDrop, dropLoot(realId,x,y,z), damagePlayer(n, reason), tileMaterial(id), onIgniteChain(x,y,z,fuse) }
  update(dt, env) {
    this._scene = env.scene;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.fuse -= dt;
      t.blink += dt;
      // yanıp sönme: beyaz -> normal -> beyaz (MC hissi)
      const on = Math.floor(t.blink / BLINK_MS) % 2 === 0;
      if (t.mats) for (const m of t.mats) m.emissiveIntensity = on ? 0.85 : 0.05;

      // fizik (basit): yerçekimi + katı zemine iniş
      if (env.isLoaded && !env.isLoaded(Math.floor(t.x), Math.floor(t.y), Math.floor(t.z))) {
        t.fuse = Math.max(t.fuse, 0); // chunk boşaldıysa patlamayı bekletme; MC gibi bekle
        continue;
      }
      t.vy -= GRAVITY * dt;
      let ny = t.y + t.vy * dt;
      const feetBlock = env.getBlock(Math.floor(t.x), Math.floor(ny - 0.49), Math.floor(t.z));
      if (t.vy <= 0 && isFloorSolidId(feetBlock)) {
        ny = Math.floor(ny - 0.49) + 1 + 0.49; // zeminin üstüne otur
        t.vy = 0; t.vx = 0; t.vz = 0;
      }
      t.y = ny;
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      if (t.y < MIN_Y - 30) { // void
        this._removeMesh(t);
        this.list.splice(i, 1);
        continue;
      }
      if (t.mesh) t.mesh.position.set(t.x, t.y, t.z);

      if (t.fuse <= 0) {
        this.explode(Math.floor(t.x), Math.floor(t.y), Math.floor(t.z), env);
        this._removeMesh(t);
        this.list.splice(i, 1);
      }
    }
  }

  // Yıkım + zincir + hasar + efekt
  explode(cx, cy, cz, env) {
    const R = TNT_POWER;
    const destroyed = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > R) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (y < MIN_Y || y > MAX_Y) continue;
          if (env.isLoaded && !env.isLoaded(x, y, z)) continue;
          const id = env.getBlock(x, y, z);
          if (id == null || id === 0) continue;
          if (id === 16) continue; // su yıkılmaz
          const b = BLOCKS[id];
          const blast = b && typeof b.blast === 'number' ? b.blast : 0;
          // MC'ye yaklaştırılmış çıkış: merkeze yakınlık + rastgelelik * 100
          const f = (1 - d / R) * (0.7 + Math.random() * 0.6) * 100;
          if (blast >= f) continue;
          destroyed.push([x, y, z, id]);
        }
      }
    }
    // Zincir TNT'lar önce listeye al (setBlock ile anında patlamaya karışmasın)
    const chained = [];
    for (const [x, y, z, id] of destroyed) {
      if (id === 64) chained.push([x, y, z]);
    }
    for (const [x, y, z, id] of destroyed) {
      try { env.setBlock(x, y, z, 0); } catch {}
    }
    // Düşümler (survival): rastgele kırılmış bloklar eşya olur
    for (const [x, y, z, id] of destroyed) {
      if (id === 64) continue;
      if (Math.random() < 0.55 && typeof env.dropLoot === 'function') {
        try { env.dropLoot(id, x, y, z); } catch {}
      }
      if (id === 21 && typeof env.dropLoot === 'function' && Math.random() < 1) {
        try { env.dropLoot(21, x, y, z); } catch {}
      }
    }
    // Zincir: komşu TNT'ler kısa rastgele fitille ateşlenir (MC)
    if (typeof env.onIgniteChain === 'function') {
      for (const [x, y, z] of chained) {
        const fuse = FUSE_CHAIN_MIN + Math.random() * (FUSE_CHAIN_MAX - FUSE_CHAIN_MIN);
        try { env.onIgniteChain(x, y, z, fuse); } catch {}
      }
    }
    // Oyuncu: hasar + itme
    if (typeof env.damagePlayer === 'function') {
      try {
        const px = env.player?.pos?.x ?? 0, py = env.player?.pos?.y ?? 0, pz = env.player?.pos?.z ?? 0;
        const dx = px - (cx + 0.5), dy = (py + 1) - (cy + 0.5), dz = pz - (cz + 0.5);
        const dist = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz));
        if (dist < R + 1.2) {
          const impact = Math.max(0, 1 - dist / (R + 1.2));
          const dmg = Math.round(impact * 15);
          if (dmg > 0) env.damagePlayer(dmg, 'TNT patlaması');
          // itme (knockback): dışarı doğru + yukarı
          const inv = 1 / dist;
          if (env.player?.vel) {
            env.player.vel.x += dx * inv * impact * 11;
            env.player.vel.z += dz * inv * impact * 11;
            env.player.vel.y += impact * 6;
          }
        }
      } catch {}
    }
    // Efekt: merkezde büyük patlama + ışık flaşı
    if (typeof env.explosionEffect === 'function') {
      try { env.explosionEffect(cx + 0.5, cy + 0.5, cz + 0.5); } catch {}
    }
  }
}
