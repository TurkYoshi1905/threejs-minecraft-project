import { BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../world/items.js';

// Tarifler (şekilli, kırpılarak eşleşir). Çıktı blok veya eşya olabilir.
// ID <100 blok, >=100 eşya. MC basitleştirmesi.
// p: satırlar, 0 = boş.
export const RECIPES = [
  { out: { id: 7, count: 4 }, p: [[5]] },                    // kütük -> 4 tahta
  { out: { id: 100, count: 4 }, p: [[7], [7]] },             // 2 tahta dikey -> 4 çubuk
  { out: { id: 20, count: 1 }, p: [[7, 7], [7, 7]] },        // 4 tahta -> masa
  { out: { id: 7, count: 1 }, p: [[20]] },                   // masa geri dönüşüm -> 1 tahta
  { out: { id: 21, count: 4 }, p: [[101], [100]] },          // kömür üstte + çubuk altta -> 4 meşale (MC)
  { out: { id: 21, count: 4 }, p: [[11]] },                  // eski kolay tarif korunur (kömür cevheri -> meşale)
  { out: { id: 110, count: 1 }, p: [[7, 7, 7], [0, 100, 0], [0, 100, 0]] },   // tahta kazma
  { out: { id: 111, count: 1 }, p: [[4, 4, 4], [0, 100, 0], [0, 100, 0]] },   // taş kazma
  { out: { id: 112, count: 1 }, p: [[102, 102, 102], [0, 100, 0], [0, 100, 0]] }, // demir kazma
  { out: { id: 113, count: 1 }, p: [[103, 103, 103], [0, 100, 0], [0, 100, 0]] }, // altın kazma
  { out: { id: 114, count: 1 }, p: [[104, 104, 104], [0, 100, 0], [0, 100, 0]] }, // elmas kazma
  { out: { id: 115, count: 1 }, p: [[7], [100], [100]] },       // tahta kürek
  { out: { id: 116, count: 1 }, p: [[4], [100], [100]] },       // taş kürek
  { out: { id: 117, count: 1 }, p: [[102], [100], [100]] },     // demir kürek
  { out: { id: 118, count: 1 }, p: [[103], [100], [100]] },     // altın kürek
  { out: { id: 119, count: 1 }, p: [[104], [100], [100]] },     // elmas kürek
  { out: { id: 120, count: 1 }, p: [[7, 7], [7, 100], [0, 100]] },       // tahta balta
  { out: { id: 121, count: 1 }, p: [[4, 4], [4, 100], [0, 100]] },       // taş balta
  { out: { id: 122, count: 1 }, p: [[102, 102], [102, 100], [0, 100]] }, // demir balta
  { out: { id: 123, count: 1 }, p: [[103, 103], [103, 100], [0, 100]] }, // altın balta
  { out: { id: 124, count: 1 }, p: [[104, 104], [104, 100], [0, 100]] }, // elmas balta
  { out: { id: 125, count: 1 }, p: [[7], [7], [100]] },         // tahta kılıç
  { out: { id: 126, count: 1 }, p: [[4], [4], [100]] },         // taş kılıç
  { out: { id: 127, count: 1 }, p: [[102], [102], [100]] },     // demir kılıç
  { out: { id: 128, count: 1 }, p: [[103], [103], [100]] },     // altın kılıç
  { out: { id: 129, count: 1 }, p: [[104], [104], [100]] },     // elmas kılıç
  { out: { id: 22, count: 1 }, p: [[4, 4, 4], [4, 0, 4], [4, 4, 4]] },
  { out: { id: 25, count: 3 }, p: [[7, 7], [7, 7], [7, 7]] }, // 6 tahta -> 3 kapı (MC)        // 8 kırma taş -> fırın
];

function normalize(grid, size) {
  // grid: size*size, 0/boş veya id. Dolu alanı kırp, id listesi döndür.
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r * size + c]) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
  }
  if (maxR < 0) return null;
  const rows = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) row.push(grid[r * size + c] || 0);
    rows.push(row);
  }
  return rows;
}

export function matchRecipe(grid, size) {
  const n = normalize(grid, size);
  if (!n) return null;
  const key = JSON.stringify(n);
  for (const r of RECIPES) {
    if (JSON.stringify(r.p) === key) return r.out;
  }
  return null;
}

// Izgara paneli (2x2 envanter içi veya 3x3 masa).
// inventory: addItem/consume için InventoryUI referansı (cursor paylaşılır).
export class CraftUI {
  constructor(opts) {
    this.size = opts.size; // 2 veya 3
    this.embed = !!opts.embed; // gömülü ızgara (paneli kendi yönetmez)
    this.inventory = opts.inventory;
    this.getIcon = opts.getIcon;
    this.onCraft = opts.onCraft || (() => {});
    this.onDropOverflow = opts.onDropOverflow || (() => {});
    this.grid = new Array(this.size * this.size).fill(null);
    this.result = null;
    this.el = {
      panel: document.getElementById(opts.panelId),
      grid: document.getElementById(opts.gridId),
      out: document.getElementById(opts.outId),
      close: opts.closeId ? document.getElementById(opts.closeId) : null,
      title: opts.titleId ? document.getElementById(opts.titleId) : null,
    };
    if (this.el.close) this.el.close.onclick = () => opts.onClose?.();
    this.renderAll();
  }
  get isOpen() { return this.el.panel && !this.el.panel.classList.contains('hidden'); }
  open() { this.el.panel?.classList.remove('hidden'); this.renderAll(); }
  close(returnItems = true) {
    if (returnItems && this.inventory) {
      // ızgaradakileri çantaya iade et, sığmayan yere düşer (alet dur korunur)
      for (let i = 0; i < this.grid.length; i++) {
        const s = this.grid[i];
        if (!s) continue;
        this.grid[i] = null;
        const kind = s.kind || (s.id >= 100 ? 'item' : 'block');
        let ok = false;
        if (kind === 'item' && ITEMS[s.id]?.tool) {
          const bags = [this.inventory.hotbar, this.inventory.main];
          for (const bag of bags) {
            const idx = bag.findIndex((x) => !x);
            if (idx >= 0) { bag[idx] = s; ok = true; break; }
          }
          this.inventory.renderAll();
        } else {
          ok = this.inventory.addItem(s.id, s.count, kind);
        }
        if (!ok) this.onDropOverflow(s.id, s.count, kind);
      }
      this.inventory.renderAll();
    }
    if (!this.embed) this.el.panel?.classList.add('hidden');
    this.refresh();
  }
  ids() { return this.grid.map((s) => (s ? s.id : 0)); }
  kinds() { return this.grid.map((s) => (s ? (s.kind || (s.id >= 100 ? 'item' : 'block')) : null)); }
  refresh() {
    this.result = matchRecipe(this.ids(), this.size);
    this.renderAll();
    this.onCraft();
  }
  clickCell(i, e) {
    const inv = this.inventory;
    const right = e.button === 2;
    const cur = this.grid[i];
    const sameId = (a, b) => a && b && a.id === b.id;
    if (!inv.cursor && cur) {
      if (right) {
        if (cur.count === 1) { inv.cursor = cur; this.grid[i] = null; }
        else {
          const half = Math.ceil(cur.count / 2);
          const ck = cur.kind || (cur.id >= 100 ? 'item' : 'block');
          inv.cursor = { kind: ck, id: cur.id, count: half };
          if (ck === 'item' && ITEMS[cur.id]?.tool) inv.cursor.dur = cur.dur ?? ITEMS[cur.id].maxDur;
          cur.count -= half;
          if (cur.count <= 0) this.grid[i] = null;
        }
      } else { inv.cursor = cur; this.grid[i] = null; }
      try { inv.refreshGhost?.(); } catch {}
    } else if (inv.cursor && !cur) {
      const ck = inv.cursor.kind || (inv.cursor.id >= 100 ? 'item' : 'block');
      if (right) {
        if (ck === 'item' && ITEMS[inv.cursor.id]?.tool) { this.grid[i] = inv.cursor; inv.cursor = null; }
        else {
          this.grid[i] = { kind: ck, id: inv.cursor.id, count: 1 };
          inv.cursor.count--;
          if (inv.cursor.count <= 0) inv.cursor = null;
        }
      } else { this.grid[i] = inv.cursor; inv.cursor = null; }
      try { if (!inv.cursor) inv.hideGhost?.(); else inv.refreshGhost?.(); } catch {}
    } else if (inv.cursor && cur) {
      const ck = inv.cursor.kind || (inv.cursor.id >= 100 ? 'item' : 'block');
      const tk = cur.kind || (cur.id >= 100 ? 'item' : 'block');
      const same = cur.id === inv.cursor.id && ck === tk && !(ck === 'item' && ITEMS[cur.id]?.tool);
      if (same && right) {
        // MC: sağ tık dolu-aynı slota 1 tane ekler (max 64, el bitince durur)
        const mx = ck === 'item' ? (ITEMS[cur.id]?.max ?? 64) : 64;
        if (cur.count < mx && inv.cursor.count > 0) {
          cur.count++;
          inv.cursor.count--;
          if (inv.cursor.count <= 0) inv.cursor = null;
        }
      } else if (same && !right) {
        const mx = ck === 'item' ? (ITEMS[cur.id]?.max ?? 64) : 64;
        const take = Math.min(inv.cursor.count, mx - cur.count);
        cur.count += take; inv.cursor.count -= take;
        if (inv.cursor.count <= 0) inv.cursor = null;
      } else if (!right) { this.grid[i] = inv.cursor; inv.cursor = cur; }
      // sağ + farklı id = hiçbir şey (MC)
      try { if (!inv.cursor) inv.hideGhost?.(); else inv.refreshGhost?.(); } catch {}
    }
    this.refresh();
  }
  clickOut(e) {
    if (!this.result) return;
    const max = e.shiftKey ? 64 : 1; // shift = olabildiğince
    let made = 0;
    for (let n = 0; n < max; n++) {
      const r = matchRecipe(this.ids(), this.size);
      if (!r) break;
      // MC 1.21: ızgara malzemesi her üretimde eksilir (yaratıcıda da).
      // Yaratıcıdaki sonsuzluk palettedir, ızgarada değil.
      for (let i = 0; i < this.grid.length; i++) {
        if (!this.grid[i]) continue;
        this.grid[i].count--;
        if (this.grid[i].count <= 0) this.grid[i] = null;
      }
      const kind = r.id >= 100 ? 'item' : 'block';
      if (!this.inventory.addItem(r.id, r.count, kind)) this.onDropOverflow(r.id, r.count, kind);
      made++;
    }
    if (made) this.inventory.renderAll();
    this.refresh();
  }
  slotEl(content, onclick) {
    const d = document.createElement('div');
    d.className = 'inv-slot craft-slot';
    if (content) {
      const kind = content.kind || (content.id >= 100 ? 'item' : 'block');
      const img = document.createElement('img');
      img.src = this.getIcon(content.id, kind);
      const nm = kind === 'item' ? (ITEMS[content.id]?.ad || '') : (BLOCKS[content.id]?.ad || '');
      img.alt = nm;
      img.title = nm;
      img.draggable = false;
      d.appendChild(img);
      if (content.count > 1) {
        const c = document.createElement('span'); c.className = 'cnt'; c.textContent = content.count;
        d.appendChild(c);
      }
    }
    d.onpointerdown = (e) => { e.preventDefault(); onclick(e); };
    d.oncontextmenu = (e) => e.preventDefault();
    d.ondragstart = (e) => e.preventDefault();
    return d;
  }
  renderAll() {
    if (!this.el.grid || !this.el.out) return;
    this.el.grid.innerHTML = '';
    this.el.grid.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
    this.el.grid.className = 'craft-grid';
    this.grid.forEach((s, i) => this.el.grid.appendChild(this.slotEl(s, (e) => this.clickCell(i, e))));
    this.el.out.innerHTML = '';
    const o = this.result ? this.slotEl({ id: this.result.id, count: this.result.count }, (e) => this.clickOut(e)) : this.slotEl(null, () => {});
    if (this.result) o.classList.add('craft-out');
    this.el.out.appendChild(o);
  }
}
