import { BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../world/items.js';

// Sandık paneli (MC): tek 27 / çift 54 slot + çanta aynası.
// Yarılar ayrı 27'lik depolar; çift görünümde alt alta birleşir.

function kindOf(id) { return id >= 100 ? 'item' : 'block'; }
function maxOf(kind, id) {
  if (kind === 'item') return ITEMS[id]?.max ?? 64;
  return 64;
}

export class ChestUI {
  constructor(opts) {
    this.inventory = opts.inventory;
    this.getIcon = opts.getIcon;
    this.mgr = opts.mgr;
    this.onChange = opts.onChange || (() => {});
    this.pos = null;
    this.el = {
      panel: document.getElementById('chestPanel'),
      title: document.getElementById('chestTitle'),
      grid: document.getElementById('chestGrid'),
      main: document.getElementById('chestMain'),
      hot: document.getElementById('chestHot'),
      close: document.getElementById('chestClose'),
    };
    if (this.el.close) this.el.close.onclick = () => opts.onClose?.();
  }
  get isOpen() { return this.el.panel && !this.el.panel.classList.contains('hidden'); }
  open(x, y, z) {
    this.pos = { x, y, z };
    this.mgr.get(x, y, z);
    this.el.panel?.classList.remove('hidden');
    this.renderAll();
  }
  close() {
    this.pos = null;
    this.el.panel?.classList.add('hidden');
  }
  // Görünüm yarıları: [tıklanan yarı, eşleşmiş yarı (varsa)]
  halves() {
    if (!this.pos) return [];
    const { x, y, z } = this.pos;
    const a = this.mgr.get(x, y, z);
    const out = [{ key: this.mgr.key(x, y, z), st: a }];
    if (a.paired) {
      const [px, py, pz] = a.paired.split(',').map(Number);
      const b = this.mgr.peek(px, py, pz);
      if (b && b.paired === out[0].key) out.push({ key: a.paired, st: b });
    }
    return out;
  }
  get isDouble() { return this.halves().length > 1; }
  viewSlot(vi) {
    const hs = this.halves();
    const h = hs[Math.floor(vi / 27)];
    if (!h) return null;
    return { half: h, i: vi % 27 };
  }
  clickSlot(vi, e) {
    const inv = this.inventory;
    const slot = this.viewSlot(vi);
    if (!slot) return;
    const right = e.button === 2;
    const cur = slot.half.st.slots[slot.i];
    const curKind = cur ? (cur.kind || kindOf(cur.id)) : null;
    if (!inv.cursor && cur) {
      if (right && cur.count > 1 && !(curKind === 'item' && ITEMS[cur.id]?.tool)) {
        const half = Math.ceil(cur.count / 2);
        inv.cursor = { kind: curKind, id: cur.id, count: half };
        cur.count -= half;
        if (cur.count <= 0) slot.half.st.slots[slot.i] = null;
      } else { inv.cursor = cur; slot.half.st.slots[slot.i] = null; }
    } else if (inv.cursor && !cur) {
      const ck = inv.cursor.kind || kindOf(inv.cursor.id);
      if (right && inv.cursor.count > 1 && !(ck === 'item' && ITEMS[inv.cursor.id]?.tool)) {
        slot.half.st.slots[slot.i] = { kind: ck, id: inv.cursor.id, count: 1 };
        inv.cursor.count--;
        if (inv.cursor.count <= 0) inv.cursor = null;
      } else { slot.half.st.slots[slot.i] = inv.cursor; inv.cursor = null; }
    } else if (inv.cursor && cur) {
      const ck = inv.cursor.kind || kindOf(inv.cursor.id);
      const same = cur.id === inv.cursor.id && curKind === ck && !(ck === 'item' && ITEMS[cur.id]?.tool);
      if (same && right) {
        const mx = maxOf(ck, cur.id);
        if (cur.count < mx && inv.cursor.count > 0) {
          cur.count++;
          inv.cursor.count--;
          if (inv.cursor.count <= 0) inv.cursor = null;
        }
      } else if (same && !right) {
        const mx = maxOf(ck, cur.id);
        const take = Math.min(inv.cursor.count, mx - cur.count);
        cur.count += take; inv.cursor.count -= take;
        if (inv.cursor.count <= 0) inv.cursor = null;
      } else if (!right) {
        slot.half.st.slots[slot.i] = inv.cursor;
        inv.cursor = cur;
      }
    }
    try { if (!inv.cursor) inv.hideGhost?.(); else inv.refreshGhost?.(); } catch {}
    this.renderAll();
    this.onChange();
  }
  slotEl(content, vi) {
    const d = document.createElement('div');
    d.className = 'inv-slot chest-slot';
    if (content) {
      const kind = content.kind || kindOf(content.id);
      const img = document.createElement('img');
      img.src = this.getIcon(content.id, kind);
      img.alt = kind === 'item' ? (ITEMS[content.id]?.ad || '') : (BLOCKS[content.id]?.ad || '');
      img.title = img.alt;
      img.draggable = false;
      d.appendChild(img);
      if (content.count > 1) {
        const c = document.createElement('span'); c.className = 'cnt'; c.textContent = content.count;
        d.appendChild(c);
      }
      if (kind === 'item' && ITEMS[content.id]?.tool) {
        const max = ITEMS[content.id].maxDur, cur = content.dur ?? max;
        const f = Math.max(0, Math.min(1, cur / max));
        const bar = document.createElement('div'); bar.className = 'dur';
        const fill = document.createElement('div'); fill.className = 'dur-fill';
        fill.style.width = (f * 100) + '%';
        fill.style.background = f > 0.6 ? '#5dd65d' : f > 0.25 ? '#e6c832' : '#e03232';
        bar.appendChild(fill);
        d.appendChild(bar);
      }
    }
    d.onpointerdown = (e) => { e.preventDefault(); this.clickSlot(vi, e); };
    d.oncontextmenu = (e) => e.preventDefault();
    d.ondragstart = (e) => e.preventDefault();
    return d;
  }
  renderInv() {
    if (!this.el.main || !this.el.hot || !this.inventory) return;
    this.el.main.innerHTML = '';
    this.inventory.main.forEach((s, i) => this.el.main.appendChild(this.inventory.slotEl(s, 'main', i)));
    this.el.hot.innerHTML = '';
    this.inventory.hotbar.forEach((s, i) => this.el.hot.appendChild(this.inventory.slotEl(s, 'hot', i)));
  }
  renderAll() {
    if (!this.el.grid) return;
    const hs = this.halves();
    if (this.el.title) this.el.title.textContent = hs.length > 1 ? 'Büyük Sandık' : 'Sandık';
    this.el.grid.innerHTML = '';
    this.el.grid.className = 'chest-grid' + (hs.length > 1 ? ' double' : '');
    hs.forEach((h, hi) => {
      h.st.slots.forEach((s, i) => this.el.grid.appendChild(this.slotEl(s, hi * 27 + i)));
    });
    this.renderInv();
  }
}
