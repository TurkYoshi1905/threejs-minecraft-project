import { BLOCKS } from './blocks.js';
import { ITEMS } from './items.js';

// Sandık durumu: her yarı kendi koordinatıyla anahtarlı {face, paired, slots[27]}.
// Çift sandık = komşu iki yarı (paired karşılıklı anahtar). MC gibi her yarı
// kendi 27 slotunu tutar; panel birleşik 54 gösterir. Üçlü birleşme yok.

function cleanSlot(s) {
  if (!s || typeof s !== 'object') return null;
  const kind = s.kind === 'item' ? 'item' : 'block';
  const id = +s.id || 0;
  if (kind === 'block' && !BLOCKS[id]) return null;
  if (kind === 'item' && !ITEMS[id]) return null;
  let count = Math.max(1, Math.min(kind === 'item' ? (ITEMS[id]?.max ?? 64) : 64, +s.count || 1));
  const out = { kind, id, count };
  if (kind === 'item' && ITEMS[id]?.tool) {
    out.dur = typeof s.dur === 'number' ? Math.max(0, Math.min(ITEMS[id].maxDur, s.dur)) : ITEMS[id].maxDur;
  }
  return out;
}

export class ChestManager {
  constructor() { this.map = new Map(); }
  key(x, y, z) { return x + ',' + y + ',' + z; }
  blank() { return { face: 0, paired: null, slots: new Array(27).fill(null) }; }
  get(x, y, z) {
    const k = this.key(x, y, z);
    if (!this.map.has(k)) this.map.set(k, this.blank());
    return this.map.get(k);
  }
  peek(x, y, z) { return this.map.get(this.key(x, y, z)) || null; }
  remove(x, y, z) { this.map.delete(this.key(x, y, z)); }
  clear() { this.map.clear(); }
  // Render bilgisi: {face, dbl} dbl: 0 tek, 1 sol/min, 2 sağ/max
  info(x, y, z) {
    const st = this.peek(x, y, z);
    if (!st) return null;
    let dbl = 0;
    if (st.paired) {
      const [px, , pz] = st.paired.split(',').map(Number);
      const other = this.peek(px, y, pz);
      if (other && other.paired === this.key(x, y, z)) {
        dbl = (px < x || pz < z) ? 2 : 1;
      }
    }
    return { face: (st.face | 0) & 3, dbl };
  }
  serialize() {
    const out = {};
    for (const [k, v] of this.map) {
      out[k] = { face: (v.face | 0) & 3, paired: v.paired || null, slots: (v.slots || []).slice(0, 27).map(cleanSlot) };
    }
    return out;
  }
  load(obj) {
    this.map.clear();
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object') continue;
      const slots = new Array(27).fill(null);
      if (Array.isArray(v.slots)) {
        for (let i = 0; i < Math.min(27, v.slots.length); i++) slots[i] = cleanSlot(v.slots[i]);
      }
      this.map.set(k, { face: (v.face | 0) & 3, paired: typeof v.paired === 'string' ? v.paired : null, slots });
    }
  }
}
