import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { ITEMS } from './items.js';
import { faceTextureName } from '../core/atlas.js';

// Kırılma çatlağı + blok partikülleri + yere düşen eşya entity'si.
// Renkler atlas tile'larının ortalamasından alınır (doğru blok rengi).

export const PICKUP_DELAY = 0.7; // yerden alma koruma süresi (sn, MC hissi)

function tileAvg(atlas, texName) {
  const key = 'avg:' + texName;
  tileAvg._c ??= {};
  if (tileAvg._c[key]) return tileAvg._c[key];
  try {
    const rect = atlas.uvMap[texName];
    const src = atlas.canvas;
    const sx = Math.floor(rect.u0 * src.width), sy = Math.floor((1 - rect.v1) * src.height);
    const sw = Math.max(1, Math.floor((rect.u1 - rect.u0) * src.width));
    const sh = Math.max(1, Math.floor((rect.v1 - rect.v0) * src.height));
    const g = src.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(sx, sy, sw, sh).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return (tileAvg._c[key] = new THREE.Color(0x888888));
    // biyom tint'i (üst, yan şeritle aynı yeşil: #BBF66D)
    const T = { grass_block_top: [0.735, 0.966, 0.429], oak_leaves: [0.3, 0.68, 0.18], water_still: [0.24, 0.45, 0.95] }[texName];
    const col = new THREE.Color((r / n / 255) * (T?.[0] ?? 1), (gg / n / 255) * (T?.[1] ?? 1), (b / n / 255) * (T?.[2] ?? 1));
    return (tileAvg._c[key] = col);
  } catch { return (tileAvg._c[key] = new THREE.Color(0x888888)); }
}

function sideTex(id) {
  const b = BLOCKS[id];
  if (!b) return 'stone';
  return b.all ?? b.side;
}

// 5 aşamalı çatlak dokusu (bir kez üretilir, tekrar kullanılır)
const crackTexCache = [];
function crackTexture(stage) {
  if (crackTexCache[stage]) return crackTexCache[stage];
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 16, 16);
  g.strokeStyle = 'rgba(20,10,10,0.9)';
  g.lineWidth = 1;
  let seed = 1234 + stage * 777;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = 2 + stage * 2;
  for (let i = 0; i < lines; i++) {
    g.beginPath();
    let x = 8, y = 8;
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (rnd() - 0.5) * 12; y += (rnd() - 0.5) * 12;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  crackTexCache[stage] = t;
  return t;
}

export class Effects {
  constructor(scene, atlas, getBlock) {
    this.scene = scene;
    this.atlas = atlas;
    this.getBlock = getBlock;
    this.parts = [];   // {m, vel, life}
    this.drops = [];   // {m, id, vel, age}
    this.dropMatCache = {};
    const cg = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.crackMesh = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({
      map: crackTexture(0), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    this.crackMesh.visible = false;
    this.crackMesh.frustumCulled = false;
    scene.add(this.crackMesh);
    this.partGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.dropGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  }

  crack(x, y, z, prog) {
    const stage = Math.max(0, Math.min(4, Math.floor(prog * 5)));
    this.crackMesh.visible = true;
    this.crackMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    if (this.crackMesh.material.map !== crackTexture(stage)) {
      this.crackMesh.material.map = crackTexture(stage);
      this.crackMesh.material.needsUpdate = true;
    }
  }
  hideCrack() { this.crackMesh.visible = false; }
  clearAll() {
    try {
      for (const p of this.parts) { this.scene.remove(p.m); try { p.m.material.dispose(); } catch {} }
      for (const d of this.drops) { this.scene.remove(d.m); }
    } catch {}
    this.parts = []; this.drops = [];
    this.hideCrack();
  }

  burst(x, y, z, id, n = 14) {
    const col = tileAvg(this.atlas, sideTex(id));
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 220) { const p = this.parts.shift(); this.scene.remove(p.m); p.m.material.dispose(); }
      const m = new THREE.Mesh(this.partGeo, new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.85 + Math.random() * 0.3) }));
      m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      this.scene.add(m);
      this.parts.push({
        m, life: 0.5 + Math.random() * 0.3,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 4),
      });
    }
  }

  // MC gibi 6 yüzlü mini blok: [sağ, sol, üst, alt, ön, arka]
  // Eşyalar (id>=100) için düz item ikonlu küçük kutu.
  dropMats(id, kind = null) {
    const k = kind || (id >= 100 ? 'item' : 'block');
    const ck = k + ':' + id;
    if (!this.dropMatCache[ck]) {
      if (k === 'item') {
        const tex = ITEMS[id]?.tex || 'stick';
        const loader = new THREE.TextureLoader();
        const t = loader.load(`textures/${tex}.png`);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.2 });
        this.dropMatCache[ck] = [m, m, m, m, m, m];
        return this.dropMatCache[ck];
      }
      const mk = (dir) => {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        const texName = faceTextureName(id, dir);
        const rect = this.atlas.uvMap[texName] || this.atlas.uvMap['stone'];
        const src = this.atlas.canvas;
        g.drawImage(src, rect.u0 * src.width, (1 - rect.v1) * src.height,
          (rect.u1 - rect.u0) * src.width, (rect.v1 - rect.v0) * src.height, 0, 0, 16, 16);
        // biyom tint'i (üst, yan şeritle aynı yeşil)
        const T = { grass_block_top: '#BBF66D', oak_leaves: '#4daf2e', water_still: '#3d6fe0' }[texName];
        if (T) {
          const tmp = document.createElement('canvas'); tmp.width = tmp.height = 16;
          tmp.getContext('2d').drawImage(c, 0, 0);
          g.globalCompositeOperation = 'multiply'; g.fillStyle = T; g.fillRect(0, 0, 16, 16);
          g.globalCompositeOperation = 'destination-in'; g.drawImage(tmp, 0, 0);
          g.globalCompositeOperation = 'source-over';
        }
        const t = new THREE.CanvasTexture(c);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.2 });
      };
      const side = mk('pz'), top = mk('py'), bottom = mk('ny');
      // BoxGeometry sıra: +x, -x, +y, -y, +z, -z
      this.dropMatCache[ck] = [side, side, top, bottom, side, side];
    }
    return this.dropMatCache[ck];
  }

  spawnDrop(id, x, y, z, vel = null, kind = null) {
    const k = kind || (id >= 100 ? 'item' : 'block');
    // Aletler yere düşmez (MC'de elde kırılır), güvenlik
    if (k === 'item' && ITEMS[id]?.tool) return;
    if (this.drops.length > 60) { const d = this.drops.shift(); this.scene.remove(d.m); this.dbg('drop-atıldı(eski)'); }
    const flat = k === 'item'; // MC: eşyalar yerde yatan düz sprite, bloklar mini küp
    const m = flat ? this.dropItemMesh(id) : new THREE.Mesh(this.dropGeo, this.dropMats(id, k));
    m.position.set(x + 0.5, y + 0.6, z + 0.5);
    if (flat) m.rotation.z = Math.random() * Math.PI; // yatık düzlemde rastgele yön
    else m.rotation.y = Math.random() * Math.PI;
    this.scene.add(m);
    this.drops.push({
      m, id, kind: k, flat, age: 0,
      vel: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 3, 4.5, (Math.random() - 0.5) * 3),
    });
    this.stat.spawned++;
    this.dbg(`spawn #${id} @${x},${y},${z}`);
  }

  // MC tarzı düz eşya: yere yatık tek quad, Y'de döner
  itemTexCache = {};
  itemTex(id) {
    if (!this.itemTexCache[id]) {
      const tex = ITEMS[id]?.tex || 'stick';
      const t = new THREE.TextureLoader().load(`textures/${tex}.png`);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      this.itemTexCache[id] = t;
    }
    return this.itemTexCache[id];
  }
  dropItemMesh(id) {
    if (!this.dropItemGeo) this.dropItemGeo = new THREE.PlaneGeometry(0.38, 0.38);
    if (!this.dropItemMatCache) this.dropItemMatCache = {};
    if (!this.dropItemMatCache[id]) {
      this.dropItemMatCache[id] = new THREE.MeshLambertMaterial({
        map: this.itemTex(id), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide,
      });
    }
    const m = new THREE.Mesh(this.dropItemGeo, this.dropItemMatCache[id]);
    m.rotation.x = -Math.PI / 2; // yere yatık
    return m;
  }

  // Teşhis (?debug=drops): sayaçlar + son olaylar
  stat = { spawned: 0, picked: 0, expired: 0, voided: 0 };
  log = [];
  dbg(t) {
    this.log.unshift(`${new Date().toLocaleTimeString('tr-TR')}: ${t}`);
    if (this.log.length > 8) this.log.pop();
  }

  update(dt, playerPos, canPickup, onPickup) {
    // partiküller
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 5;
      if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); this.parts.splice(i, 1); }
    }
    // düşen eşyalar
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > 90) { this.scene.remove(d.m); this.drops.splice(i, 1); this.stat.expired++; this.dbg(`süre-doldu #${d.id}`); continue; }
      const toPlayer = new THREE.Vector3().subVectors(playerPos, d.m.position);
      toPlayer.y += 1;
      const dist = toPlayer.length();
      // Yerden alma koruması (PICKUP_DELAY): hemen geri alınmaz
      if (canPickup && d.age > PICKUP_DELAY && dist < 3) {
        toPlayer.normalize().multiplyScalar((4 - dist) * 3 * dt);
        d.m.position.add(toPlayer);
        if (dist < 1.1) {
          if (onPickup(d.id, d.kind || (d.id >= 100 ? 'item' : 'block'))) { this.scene.remove(d.m); this.drops.splice(i, 1); this.stat.picked++; this.dbg(`toplandı #${d.id}`); }
          continue;
        }
      } else {
        d.vel.y -= 20 * dt;
        if (d.vel.y < -12) d.vel.y = -12;
        const nx = d.m.position.x + d.vel.x * dt;
        const ny = d.m.position.y + d.vel.y * dt;
        const nz = d.m.position.z + d.vel.z * dt;
        const below = this.getBlock(Math.floor(nx), Math.floor(ny - 0.2), Math.floor(nz));
        if (below === null) {
          // chunk yüklenmemiş: void'e düşürme, havada bekle
          d.vel.multiplyScalar(0.9);
        } else if (below && d.vel.y <= 0) {
          d.m.position.set(nx, Math.floor(ny - 0.2) + 1 + (d.flat ? 0.06 : 0.14), nz);
          d.vel.set(0, 0, 0);
        } else {
          d.m.position.set(nx, ny, nz);
          if (d.m.position.y < -80) { this.scene.remove(d.m); this.drops.splice(i, 1); this.stat.voided++; this.dbg(`boşluğa-düştü #${d.id}`); continue; }
        }
      }
      if (d.flat) d.m.rotation.z += dt * 2; // yatık eşya Y'de döner
      else d.m.rotation.y += dt * 2;
      d.m.position.y += Math.sin(d.age * 4) * 0.002;
    }
  }
}
