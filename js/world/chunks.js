import { CHUNK_SIZE, WORLD_HEIGHT, MIN_Y, MAX_Y, RENDER_DISTANCE, UNLOAD_DISTANCE, GEN_BUDGET_PER_FRAME, MESH_BUDGET_PER_FRAME } from '../core/config.js';
import { generateChunk } from './worldgen.js';
import { buildChunkGeometry, bucketToMesh } from './mesher.js';
import { dbChunks } from '../core/idb.js';

// ChunkManager: sonsuz streaming, LRU unload, kirli chunk persist, komşu remesh.
// blocks: Map<key, {cx,cz,blocks:Uint8Array,dirty,meshOp,meshTr}>

const key = (cx, cz) => cx + ',' + cz;

export class ChunkManager {
  constructor(scene, atlas, worldId, seedStr, seedNum, materials) {
    this.scene = scene;
    this.atlas = atlas;
    this.worldId = worldId;
    this.seedStr = seedStr;
    this.seedNum = seedNum;
    this.materials = materials; // {opaque, transparent}
    this.chunks = new Map();
    this.genQueue = [];
    this.meshQueue = new Set();
    this.saveQueue = new Map(); // key -> {cx,cz,blocks snapshot} (karede max 1 yazım)
    this.meshBuilt = 0; // gölge tazeleme takibi için
    this.lastCenter = [Infinity, Infinity];
  }

  getBlock(x, y, z) {
    if (y < MIN_Y) return 10; // altı bedrock say
    if (y > MAX_Y) return 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return 0; // yüklenmemiş komşu hava sayılır (mesh düzeltilir)
    const lx = x - cx * 16, lz = z - cz * 16;
    return c.blocks[(y - MIN_Y) * 256 + lz * 16 + lx];
  }

  // Yüklenmemiş chunk'ta null döner (0=hava ile karışmaz).
  // Drop fiziği gibi "bilinmeyende güvenli dur" gereken yerler için.
  getBlockOrUnknown(x, y, z) {
    if (y < MIN_Y) return 10;
    if (y > MAX_Y) return 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return null;
    const lx = x - cx * 16, lz = z - cz * 16;
    return c.blocks[(y - MIN_Y) * 256 + lz * 16 + lx];
  }

  setBlock(x, y, z, id) {
    if (y < MIN_Y || y > MAX_Y) return false;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return false;
    const lx = x - cx * 16, lz = z - cz * 16;
    c.blocks[(y - MIN_Y) * 256 + lz * 16 + lx] = id;
    c.dirty = true;
    this.enqueueMesh(cx, cz);
    // sınırda ise komşuyu da yenile
    if (lx === 0) this.enqueueMesh(cx - 1, cz);
    if (lx === 15) this.enqueueMesh(cx + 1, cz);
    if (lz === 0) this.enqueueMesh(cx, cz - 1);
    if (lz === 15) this.enqueueMesh(cx, cz + 1);
    // fizik kancası (kum/su): main.js bağlar, yoksa sessiz
    try { this.onEdit?.(x, y, z, id); } catch {}
    return true;
  }

  enqueueMesh(cx, cz) {
    if (this.chunks.has(key(cx, cz))) this.meshQueue.add(key(cx, cz));
  }

  async ensureChunk(cx, cz) {
    const k = key(cx, cz);
    if (this.chunks.has(k)) return this.chunks.get(k);
    // 1. DB'de var mı?
    try {
      const saved = await dbChunks.get(this.worldId, cx, cz);
      if (saved?.blocks && saved.blocks.length === 16 * WORLD_HEIGHT * 16) {
        const c = { cx, cz, blocks: new Uint8Array(saved.blocks), dirty: false, meshOp: null, meshTr: null };
        this.chunks.set(k, c);
        this.meshQueue.add(k);
        this.enqueueMesh(cx - 1, cz); this.enqueueMesh(cx + 1, cz);
        this.enqueueMesh(cx, cz - 1); this.enqueueMesh(cx, cz + 1);
        return c;
      }
    } catch { /* DB yoksa üret */ }
    // 2. Üret
    const blocks = generateChunk(cx, cz, this.seedStr, this.seedNum);
    const c = { cx, cz, blocks, dirty: false, meshOp: null, meshTr: null };
    this.chunks.set(k, c);
    this.meshQueue.add(k);
    // Komşu chunk'ların sınır yüzlerini düzelt (önce hava sanılmıştı)
    this.enqueueMesh(cx - 1, cz); this.enqueueMesh(cx + 1, cz);
    this.enqueueMesh(cx, cz - 1); this.enqueueMesh(cx, cz + 1);
    return c;
  }

  updateStreaming(px, pz) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    if (pcx === this.lastCenter[0] && pcz === this.lastCenter[1]) return;
    this.lastCenter = [pcx, pcz];
    // spiral öncelik
    const want = [];
    for (let r = 0; r <= RENDER_DISTANCE; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        want.push([pcx + dx, pcz + dz]);
      }
    }
    want.sort((a, b) => (Math.abs(a[0]-pcx)+Math.abs(a[1]-pcz)) - (Math.abs(b[0]-pcx)+Math.abs(b[1]-pcz)));
    this.genQueue = want.filter(([cx, cz]) => !this.chunks.has(key(cx, cz)));
    // unload (kirli chunk DB'ye anında değil kuyrukla yazılır — takılma yapmaz)
    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > UNLOAD_DISTANCE) {
        if (c.dirty && !this.saveQueue.has(k)) this.saveQueue.set(k, { cx: c.cx, cz: c.cz, blocks: c.blocks.slice() });
        if (c.meshOp) { this.scene.remove(c.meshOp); c.meshOp.geometry.dispose(); }
        if (c.meshTr) { this.scene.remove(c.meshTr); c.meshTr.geometry.dispose(); }
        if (c.meshEm) { this.scene.remove(c.meshEm); c.meshEm.geometry.dispose(); }
        this.chunks.delete(k);
        this.meshQueue.delete(k);
      }
    }
  }

  async persistChunk(c) {
    try {
      await dbChunks.put(this.worldId, c.cx, c.cz, c.blocks);
      c.dirty = false;
    } catch {}
  }

  // Kare başına max 1 DB yazımı (structured-clone ana thread'i kilitlemesin)
  async processSaves(budget = 1) {
    let n = 0;
    for (const [k, s] of [...this.saveQueue]) {
      if (n >= budget) break;
      this.saveQueue.delete(k);
      try {
        // hâlâ yüklüyse güncel veriyi yaz (sonradan değişmiş olabilir)
        const live = this.chunks.get(k);
        if (live && live.dirty) await this.persistChunk(live);
        else await dbChunks.put(this.worldId, s.cx, s.cz, s.blocks);
        n++;
      } catch {}
    }
  }

  async persistAllDirty() {
    for (const [k, c] of this.chunks) {
      if (c.dirty && !this.saveQueue.has(k)) this.saveQueue.set(k, { cx: c.cx, cz: c.cz, blocks: c.blocks.slice() });
    }
    await this.processSaves(4); // otomatik kayıtta biraz daha agresif
  }

  async processQueues() {
    // üretim bütçesi
    let n = 0;
    while (this.genQueue.length && n < GEN_BUDGET_PER_FRAME) {
      const [cx, cz] = this.genQueue.shift();
      if (!this.chunks.has(key(cx, cz))) { await this.ensureChunk(cx, cz); n++; }
    }
    // mesh bütçesi
    let m = 0;
    for (const k of [...this.meshQueue]) {
      if (m >= MESH_BUDGET_PER_FRAME) break;
      this.meshQueue.delete(k);
      const c = this.chunks.get(k);
      if (c) { this.remesh(c); m++; }
    }
  }

  remesh(c) {
    const { op, tr, em } = buildChunkGeometry(
      c.blocks, c.cx, c.cz, (x, y, z) => this.getBlock(x, y, z),
      this.atlas.uvMap, MIN_Y, WORLD_HEIGHT
    );
    if (c.meshOp) { this.scene.remove(c.meshOp); c.meshOp.geometry.dispose(); c.meshOp = null; }
    if (c.meshTr) { this.scene.remove(c.meshTr); c.meshTr.geometry.dispose(); c.meshTr = null; }
    if (c.meshEm) { this.scene.remove(c.meshEm); c.meshEm.geometry.dispose(); c.meshEm = null; }
    c.meshOp = bucketToMesh(op, this.materials.opaque, true);
    c.meshTr = bucketToMesh(tr, this.materials.transparent, false);
    c.meshEm = bucketToMesh(em, this.materials.emissive, false);
    this.meshBuilt++;
    if (c.meshOp) this.scene.add(c.meshOp);
    if (c.meshTr) this.scene.add(c.meshTr);
    if (c.meshEm) this.scene.add(c.meshEm);
  }
}
