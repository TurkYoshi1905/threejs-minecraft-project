// Kapı durumu: alt yarı koordinatıyla anahtarlı {face 0..3, open}.
// face: kapalı panel normalinin baktığı yön (0:+z 1:-z 2:+x 3:-x, oyuncuya döner).
// Menteşe sabit sol (basitleştirme); açık panel 90° salınır.

export class DoorManager {
  constructor() { this.map = new Map(); }
  key(x, y, z) { return x + ',' + y + ',' + z; }
  get(x, y, z) {
    const k = this.key(x, y, z);
    if (!this.map.has(k)) this.map.set(k, { face: 0, open: false, hinge: 1 });
    return this.map.get(k);
  }
  peek(x, y, z) { return this.map.get(this.key(x, y, z)) || null; }
  remove(x, y, z) { this.map.delete(this.key(x, y, z)); }
  clear() { this.map.clear(); }
  serialize() {
    const out = {};
    for (const [k, v] of this.map) out[k] = { face: (v.face | 0) & 3, open: !!v.open, hinge: v.hinge < 0 ? -1 : 1 };
    return out;
  }
  load(obj) {
    this.map.clear();
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') this.map.set(k, { face: (v.face | 0) & 3, open: !!v.open, hinge: v.hinge < 0 ? -1 : 1 });
    }
  }
}
