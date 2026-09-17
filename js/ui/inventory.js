import { BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../world/items.js';

// MC tarzı envanter: Yaratıcı sekmeli+arama, Hayatta Kalma çanta+hotbar.
// Slot: null | {kind:'block'|'item', id, count, dur?}
// Yaratıcıda stack'ler 64 gösterir, koyunca eksilmez (MC gibi). Sonsuz ∞ yok.

function kindOf(id) { return id >= 100 ? 'item' : 'block'; }
function maxOf(kind, id) {
  if (kind === 'item') return ITEMS[id]?.max ?? 64;
  return 64;
}
function nameOf(kind, id) {
  if (kind === 'item') return ITEMS[id]?.ad || 'Eşya';
  return BLOCKS[id]?.ad || 'Blok';
}

const GRID_ALL = [
  ...Object.keys(BLOCKS).map(Number).filter((id) => id !== 16 && id !== 24),
  ...Object.keys(ITEMS).map(Number),
].sort((a, b) => a - b);
const CATS = {
  all: GRID_ALL,
  dogal: [1, 2, 3, 8, 15, 5, 6, 18, 19, 17],
  yapi: [4, 7, 14, 20, 22, 21, 9, 5, 1],
  degerli: [11, 12, 23, 13, 10, 14, 104, 105, 106, 102, 103, 101],
  alet: [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 100, 101, 105, 106, 102, 103, 104],
};
const MAX_STACK = 64;

export class InventoryUI {
  constructor(opts = {}) {
    this.onChange = opts.onChange || (() => {});
    this.getIcon = opts.getIcon || ((id, kind) => {
      const k = kind || kindOf(id);
      if (k === 'item') { const t = ITEMS[id]?.tex || 'stick'; return `textures/${t}.png`; }
      const b = BLOCKS[id]; const t = b.all ?? b.side; return `textures/${t}.png`;
    });
    this.mode = 'creative';
    this.sel = 0;
    this.tab = 'all';
    this.filter = '';
    this.cursor = null;
    // Yeni dünya = boş envanter (her iki modda da). Creative E'den seçer,
    // survival kırarak/toplayarak doldurur.
    this.hotbar = new Array(10).fill(null);
    this.main = new Array(27).fill(null);
    this.el = {
      panel: document.getElementById('invPanel'),
      grid: document.getElementById('invGrid'),
      main: document.getElementById('invMain'),
      hot: document.getElementById('invHot'),
      tabs: document.getElementById('invTabs'),
      search: document.getElementById('invSearch'),
      mode: document.getElementById('invMode'),
      close: document.getElementById('invClose'),
    };
    this.el.close.onclick = () => opts.onClose?.();
    this.el.tabs.querySelectorAll('button[data-tab]').forEach((b) => {
      b.onclick = () => {
        this.tab = b.dataset.tab;
        this.el.tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        this.renderGrid();
      };
    });
    this.el.search.oninput = () => { this.filter = this.el.search.value.toLocaleLowerCase('tr'); this.renderGrid(); };
    // Sürükle-bırak için pencere düzeyi takip (tık davranışı bozulmaz)
    this.drag = null;
    window.addEventListener('pointermove', (e) => this.dragMove(e));
    window.addEventListener('pointerup', (e) => this.dragEnd(e));
    window.addEventListener('pointercancel', () => { this.drag = null; if (this.ghost) this.ghost.style.display = 'none'; });
    this.renderAll();
  }

  get isOpen() { return !this.el.panel.classList.contains('hidden'); }
  // Masa/fırın açıkken de sürükle-bırak çalışsın (MC gibi)
  isAnyPanelOpen() {
    if (this.isOpen) return true;
    try {
      if (!document.getElementById('tablePanel')?.classList.contains('hidden')) return true;
      if (!document.getElementById('furnacePanel')?.classList.contains('hidden')) return true;
    } catch {}
    return false;
  }
  open(mode) {
    if (mode) this.setMode(mode);
    this.el.panel.classList.remove('hidden');
    this.renderAll();
  }
  close() {
    // MC: panel kapanırken elde kalan stack çantaya iade edilir (kayıp yok, dur korunur).
    if (this.cursor) {
      const c = this.cursor;
      this.cursor = null;
      this.hideGhost();
      const ck = c.kind || kindOf(c.id);
      const isTool = ck === 'item' && ITEMS[c.id]?.tool;
      let placed = false;
      if (isTool) {
        // Alet: dur ile birlikte ilk boş slota aynen iade
        const idx = this.hotbar.findIndex((x) => !x);
        if (idx >= 0) { this.hotbar[idx] = c; placed = true; }
        else {
          const mi = this.main.findIndex((x) => !x);
          if (mi >= 0) { this.main[mi] = c; placed = true; }
        }
      } else {
        try { placed = this.addItem(c.id, c.count, ck); } catch { placed = false; }
        if (!placed) {
          const idx = this.hotbar.findIndex((x) => !x);
          if (idx >= 0) { this.hotbar[idx] = c; placed = true; }
          else {
            const mi = this.main.findIndex((x) => !x);
            if (mi >= 0) { this.main[mi] = c; placed = true; }
          }
        }
      }
      // addItem zaten render etti; iade edildiyse tekrar render gerekmez ama garanti olsun
      this.el.panel.classList.add('hidden');
      this.drag = null;
      this.renderAll();
      if (!placed) this.onChange();
      return;
    }
    this.el.panel.classList.add('hidden'); this.cursor = null; this.drag = null; this.hideGhost(); this.renderAll();
  }

  setMode(m) {
    this.mode = m === 'survival' ? 'survival' : 'creative';
    const creative = this.mode === 'creative';
    this.el.tabs.classList.toggle('hidden', !creative);
    this.el.grid.style.display = creative ? '' : 'none';
    // MC benzetmesi: "creative" kelimesi arayüzde geçmez
    this.el.mode.textContent = creative ? '(Yaratıcı Envanter)' : '(Hayatta Kalma)';
    // Eski ∞ kayıtlarını 64'e migrate et, yeni sonsuz üretilmez
    for (const s of [...this.hotbar, ...this.main]) {
      if (!s) continue;
      if (!s.kind) s.kind = kindOf(s.id);
      if (!isFinite(s.count)) s.count = Math.min(maxOf(s.kind, s.id), 64);
      if (s.kind === 'item' && ITEMS[s.id]?.tool && s.dur == null) s.dur = ITEMS[s.id].maxDur;
    }
    if (this.cursor) {
      if (!this.cursor.kind) this.cursor.kind = kindOf(this.cursor.id);
      if (!isFinite(this.cursor.count)) this.cursor.count = Math.min(maxOf(this.cursor.kind, this.cursor.id), 64);
    }
    this.renderAll();
  }

  load(data) {
    try {
      if (!data) return;
      const norm = (s) => {
        if (s == null) return null;
        if (typeof s === 'number') return { kind: kindOf(s), id: s, count: Math.min(maxOf(kindOf(s), s), 64) };
        if (typeof s === 'object' && (BLOCKS[s.id] || ITEMS[s.id])) {
          const kind = s.kind || kindOf(s.id);
          let c = s.count === 'inf' ? maxOf(kind, s.id) : (+s.count || 1);
          c = Math.min(maxOf(kind, s.id), Math.max(1, c));
          const out = { kind, id: s.id, count: c };
          if (kind === 'item' && ITEMS[s.id]?.tool) {
            out.dur = typeof s.dur === 'number' ? s.dur : ITEMS[s.id].maxDur;
          }
          return out;
        }
        return null;
      };
      if (Array.isArray(data.hotbar)) {
        this.hotbar = data.hotbar.slice(0, 10).map(norm);
        while (this.hotbar.length < 10) this.hotbar.push(null);
      }
      if (Array.isArray(data.main)) this.main = data.main.slice(0, 27).map(norm);
      if (typeof data.sel === 'number') this.sel = Math.max(0, Math.min(9, data.sel));
    } catch {}
    this.renderAll();
  }

  serialize() {
    const s = (x) => (x ? { kind: x.kind || kindOf(x.id), id: x.id, count: x.count, dur: x.dur } : null);
    return { hotbar: this.hotbar.map(s), main: this.main.map(s), sel: this.sel };
  }

  selectedSlot() { return this.hotbar[this.sel] || null; }
  selectedId() {
    const s = this.hotbar[this.sel];
    if (!s || (s.kind || kindOf(s.id)) !== 'block') return 0;
    return s.id;
  }
  selectedToolId() {
    const s = this.hotbar[this.sel];
    if (!s || (s.kind || kindOf(s.id)) !== 'item') return 0;
    return ITEMS[s.id]?.tool ? s.id : 0;
  }

  // Kırılan/üretilen bloğu/eşyayı ekle. Sığmazsa false.
  addItem(id, count = 1, kind = null, dur = null) {
    const k = kind || kindOf(id);
    if (k === 'block') {
      if (!BLOCKS[id] || id === 16 || id === 10) return false;
    } else {
      if (!ITEMS[id]) return false;
    }
    const max = maxOf(k, id);
    // Aletler stacklenmez: her biri ayrı slot
    if (k === 'item' && ITEMS[id]?.tool) {
      let need = count;
      const all = [this.hotbar, this.main];
      for (const arr of all) {
        for (let i = 0; i < arr.length && need > 0; i++) {
          if (!arr[i]) { const md = ITEMS[id].maxDur; const dd = (typeof dur === 'number') ? Math.max(1, Math.min(md, Math.floor(dur))) : md; arr[i] = { kind: k, id, count: 1, dur: dd }; need--; }
        }
      }
      this.renderHot(); this.renderMain();
      this.onChange();
      return need === 0;
    }
    let left = count;
    const stacks = [...this.hotbar, ...this.main];
    for (const s of stacks) {
      if (left <= 0) break;
      if (s && (s.kind || kindOf(s.id)) === k && s.id === id && s.count < max) {
        const take = Math.min(left, max - s.count);
        s.count += take; left -= take;
      }
    }
    const all = [this.hotbar, this.main];
    for (const arr of all) {
      for (let i = 0; i < arr.length && left > 0; i++) {
        if (!arr[i]) { const take = Math.min(left, max); arr[i] = { kind: k, id, count: take }; left -= take; }
      }
    }
    this.renderHot(); this.renderMain();
    this.onChange();
    return left === 0;
  }

  consumeSelected() {
    // Yaratıcıda eksilmez (MC). Hayatta kalmada 1 eksilt (blok+eşya, alet hariç).
    if (this.mode === 'creative') return true;
    const s = this.hotbar[this.sel];
    if (!s) return false;
    const k = s.kind || kindOf(s.id);
    if (k === 'item' && ITEMS[s.id]?.tool) return false;
    if (s.count > 1) s.count--;
    else this.hotbar[this.sel] = null;
    this.renderHot();
    this.onChange();
    return true;
  }

  // Eldeki aleti yıprat. Kırılırsa true döner (slot temizlenir).
  damageHeldTool(amount = 1) {
    const s = this.hotbar[this.sel];
    if (!s || (s.kind || kindOf(s.id)) !== 'item' || !ITEMS[s.id]?.tool) return false;
    if (this.mode === 'creative') return false; // yaratıcıda dayanıklılık işlemez
    if (s.dur == null) s.dur = ITEMS[s.id].maxDur;
    s.dur -= amount;
    if (s.dur <= 0) {
      this.hotbar[this.sel] = null;
      this.renderHot(); this.onChange();
      return true;
    }
    this.renderHot();
    this.onChange();
    return false;
  }

  clear() {
    this.main = new Array(27).fill(null);
    this.renderMain(); this.onChange();
  }

  slotEl(slot, area, index) {
    const d = document.createElement('div');
    d.className = 'inv-slot';
    d.dataset.area = area; d.dataset.index = index;
    if (area === 'hot' && index === this.sel) d.classList.add('sel');
    if (slot) {
      const kind = slot.kind || kindOf(slot.id);
      const img = document.createElement('img');
      img.src = this.getIcon(slot.id, kind);
      img.alt = nameOf(kind, slot.id) || '';
      img.title = nameOf(kind, slot.id) || '';
      img.draggable = false;
      d.appendChild(img);
      // Sayı rozeti: 1'den fazlaysa (aletlerde 1 olduğu için görünmez)
      if (slot.count > 1) {
        const c = document.createElement('span'); c.className = 'cnt';
        c.textContent = slot.count;
        d.appendChild(c);
      }
      // Alet dayanıklılık barı (MC gibi altta)
      if (kind === 'item' && ITEMS[slot.id]?.tool) {
        const max = ITEMS[slot.id].maxDur;
        const cur = slot.dur ?? max;
        const bar = document.createElement('div'); bar.className = 'dur';
        const fill = document.createElement('div'); fill.className = 'dur-fill';
        const f = Math.max(0, Math.min(1, cur / max));
        fill.style.width = (f * 100) + '%';
        fill.style.background = f > 0.6 ? '#5dd65d' : f > 0.25 ? '#e6c832' : '#e03232';
        bar.appendChild(fill);
        d.appendChild(bar);
      }
    }
    // Tık (eski davranış) + sürükle-bırak (MC gibi) aynı slotta:
    // 6px'ten az hareket = tık, fazlası = sürükleme.
    d.onpointerdown = (e) => { e.preventDefault(); this.dragStart(area, index, e); };
    d.oncontextmenu = (e) => e.preventDefault();
    d.ondragstart = (e) => e.preventDefault();
    return d;
  }

  stackAt(area, index) {
    if (area === 'hot') return this.hotbar[index] || null;
    if (area === 'main') return this.main[index] || null;
    const list = this.filteredGrid();
    const id = list[index];
    if (id == null) return null;
    const kind = kindOf(id);
    // Yaratıcı palet: ele alınca 64 (aletse 1 + full dur)
    if (kind === 'item' && ITEMS[id]?.tool) return { kind, id, count: 1, dur: ITEMS[id].maxDur, ghost: true };
    return { kind, id, count: maxOf(kind, id), ghost: true };
  }

  ensureGhost() {
    if (!this.ghost) {
      this.ghost = document.createElement('div');
      this.ghost.id = 'dragGhost';
      this.ghost.innerHTML = '<img draggable="false"><span class="cnt"></span>';
      document.body.appendChild(this.ghost);
    }
    return this.ghost;
  }

  cursorCountText(c) {
    if (!c) return '';
    return c.count > 1 ? String(c.count) : '';
  }

  dragStart(area, index, e) {
    // NOT: boş slotta da durum kurulur; yoksa eldeki stack boş slota
    // tıkla/sürükle-bırak ile ASLA yerleştirilemez (kritik düzeltme).
    const s = this.stackAt(area, index);
    this.drag = {
      area, index, button: e.button, shift: e.shiftKey,
      x0: e.clientX, y0: e.clientY, moved: false, id: s ? s.id : 0,
      kind: s ? (s.kind || kindOf(s.id)) : null,
      count: s ? s.count : 0,
      hover: null,
    };
    if (s) {
      this.ensureGhost();
      this.ghost.querySelector('img').src = this.getIcon(s.id, s.kind || kindOf(s.id));
      this.ghost.querySelector('.cnt').textContent = this.cursorCountText(s);
    }
  }

  // Sürükleme hedefini her harekette önceden hesapla (bırakma anına güvenme)
  dragHover(e) {
    let t = null;
    try {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      t = el?.closest?.('.inv-slot') || null;
      if (!t && document.elementsFromPoint) {
        for (const cand of document.elementsFromPoint(e.clientX, e.clientY)) {
          const s = cand?.closest?.('.inv-slot');
          if (s) { t = s; break; }
        }
      }
    } catch { t = null; }
    return t && t.dataset.area ? { area: t.dataset.area, index: +t.dataset.index } : null;
  }

  dragMove(e) {
    if (!this.isAnyPanelOpen()) { this.hideGhost(); return; }
    // Eldeki stack her zaman farede görünsün (MC gibi) — sayı rozetiyle birlikte
    if (this.cursor && (!this.drag || !this.drag.moved)) {
      this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
    }
    if (!this.drag) return;
    if (Math.hypot(e.clientX - this.drag.x0, e.clientY - this.drag.y0) > 6) {
      this.drag.moved = true;
      const gid = this.drag.id || (this.cursor ? this.cursor.id : 0);
      const gcount = this.drag.count || (this.cursor ? this.cursor.count : 0);
      const gkind = this.drag.kind || (this.cursor ? (this.cursor.kind || kindOf(this.cursor.id)) : null);
      this.showGhost(gid, gcount, e.clientX, e.clientY, gkind);
      this.drag.hover = this.dragHover(e);
    }
  }

  showGhost(id, count, x, y, kind = null) {
    if (!id) return;
    // showGhost(id, x, y) eski çağrılarıyla uyumlu: 2. parametre sayı da olabilir, x de olabilir
    if (typeof count === 'number' && typeof x === 'number') {
      // yeni imza: (id, count, x, y, kind) — aynen devam
    } else if (typeof count === 'number' && y === undefined) {
      // eski imza: (id, x, y) -> count kaymış
      y = x; x = count; count = null;
      if (this.cursor && this.cursor.id === id) count = this.cursor.count;
    }
    this.ensureGhost();
    const img = this.ghost.querySelector('img');
    const cnt = this.ghost.querySelector('.cnt');
    const k = kind || (this.cursor && this.cursor.id === id ? (this.cursor.kind || kindOf(id)) : kindOf(id));
    const src = this.getIcon(id, k);
    if (img.getAttribute('src') !== src) img.src = src;
    if (cnt) {
      let txt = '';
      if (count === Infinity) txt = '∞';
      else if (typeof count === 'number' && count > 1) txt = String(count);
      else if (this.cursor && this.cursor.id === id) txt = this.cursorCountText(this.cursor);
      cnt.textContent = txt;
    }
    this.ghost.style.display = 'block';
    this.ghost.style.left = (x - 20) + 'px';
    this.ghost.style.top = (y - 20) + 'px';
  }
  hideGhost() { if (this.ghost) this.ghost.style.display = 'none'; }

  // MC 1.21: farede taşınan stack'i tazele (sayı değişince ghost güncellensin)
  refreshGhost() {
    if (!this.cursor || !this.ghost || this.ghost.style.display !== 'block') return;
    const cnt = this.ghost.querySelector('.cnt');
    if (cnt) cnt.textContent = this.cursorCountText(this.cursor);
  }

  dragEnd(e) {
    const dr = this.drag;
    this.drag = null;
    if (!dr || !this.isAnyPanelOpen()) { this.hideGhost(); return; }
    if (!dr.moved) {
      // klasik tık davranışı (boş slot dahil — eldekini yerleştirir)
      this.hideGhost();
      this.clickSlot(dr.area, dr.index, { button: dr.button, shiftKey: dr.shift });
      // MC: aldıysan eldekini farede sayı ile göster
      if (this.cursor && e && typeof e.clientX === 'number') {
        this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
      }
      return;
    }
    const hov = dr.hover || this.dragHover(e);
    this.hideGhost();
    if (!hov || !hov.area) return; // dışarı bırakıldı: iade
    const toArea = hov.area, toIndex = hov.index;
    if (toArea === 'grid') {
      // ızgaraya bırak = sil (sadece envanter slotlarından gelen)
      if (dr.area !== 'grid') {
        const fromArr = dr.area === 'hot' ? this.hotbar : this.main;
        fromArr[dr.index] = null;
        if (this.cursor && this.cursor.id) this.cursor = null;
        this.renderMain(); this.renderHot();
        this.onChange();
      }
      return;
    }
    if (dr.area === toArea && dr.index === toIndex) return;
    this.dropMove(dr.area, dr.index, toArea, toIndex, dr.button === 2);
  }

  // Sürükle-bırak yerleştirme (kaynak slottan hedef slota)
  dropMove(fromArea, fromIndex, toArea, toIndex, right) {
    const toArr = toArea === 'hot' ? this.hotbar : this.main;
    if (fromArea === 'grid') {
      // Yaratıcı paletten kopya (MC: sol 64, sağ 1)
      const list = this.filteredGrid();
      const id = list[fromIndex];
      if (id == null) return;
      const kind = kindOf(id);
      if (kind === 'item' && ITEMS[id]?.tool) {
        toArr[toIndex] = { kind, id, count: 1, dur: ITEMS[id].maxDur };
      } else if (right) {
        toArr[toIndex] = { kind, id, count: 1 };
      } else {
        toArr[toIndex] = { kind, id, count: maxOf(kind, id) };
      }
      if (toArea === 'hot') this.sel = toIndex;
    } else {
      const fromArr = fromArea === 'hot' ? this.hotbar : this.main;
      const src = fromArr[fromIndex];
      if (!src) return;
      const skind = src.kind || kindOf(src.id);
      const smax = maxOf(skind, src.id);
      const dst = toArr[toIndex];
      // Aletler birleşmez, sadece taşınır/takas edilir
      if (skind === 'item' && ITEMS[src.id]?.tool) {
        if (!dst && !right) { toArr[toIndex] = src; fromArr[fromIndex] = null; }
        else if (dst && !right) { fromArr[fromIndex] = dst; toArr[toIndex] = src; }
      } else if (!dst) {
        if (right && src.count > 1) {
          toArr[toIndex] = { kind: skind, id: src.id, count: 1 };
          src.count--;
        }
        else { toArr[toIndex] = src; fromArr[fromIndex] = null; }
      } else if ((dst.kind || kindOf(dst.id)) === skind && dst.id === src.id) {
        const dmax = maxOf(skind, src.id);
        const take = right ? 1 : Math.min(src.count, dmax - dst.count);
        const real = Math.min(take, src.count, Math.max(0, dmax - dst.count));
        dst.count += real; src.count -= real;
        if (src.count <= 0) fromArr[fromIndex] = null;
      } else if (!right) {
        fromArr[fromIndex] = dst; toArr[toIndex] = src; // takas
      }
      if (toArea === 'hot' || fromArea === 'hot') this.sel = toArea === 'hot' ? toIndex : this.sel;
    }
    this.renderMain(); this.renderHot();
    this.onChange();
  }

  clickSlot(area, index, e) {
    const right = e.button === 2;
    const shift = e.shiftKey;
    // MC gibi: palete tıklamak/bırakmak eldekini SİLER (çöp kutusu)
    if (area === 'grid') {
      if (this.cursor) { this.cursor = null; this.hideGhost(); this.renderMain(); this.renderHot(); this.onChange(); return; }
      this.clickGrid(index, e);
      return;
    }
    const arr = area === 'hot' ? this.hotbar : this.main;
    if (shift) { this.quickMove(area, index); return; }
    const cur = arr[index];
    const curKind = cur ? (cur.kind || kindOf(cur.id)) : null;
    const now = performance.now();
    // Çift-tıkla topla (MC): elde stack varken aynı id'ye çift tık = etraftakileri ele çek
    if (!right && this.cursor && cur && cur.id === this.cursor.id && (cur.kind || kindOf(cur.id)) === (this.cursor.kind || kindOf(this.cursor.id))) {
      const ck = this.cursor.kind || kindOf(this.cursor.id);
      const isTool = ck === 'item' && ITEMS[this.cursor.id]?.tool;
      if (!isTool && isFinite(this.cursor.count)) {
        if (this._lastClick && (now - this._lastClick.t) < 400 && this._lastClick.area === area && this._lastClick.index === index) {
          this.collectAll(this.cursor.id, this.cursor.kind);
          this._lastClick = null;
          this.renderMain(); this.renderHot();
          this.refreshGhost();
          this.onChange();
          return;
        }
      }
    }
    this._lastClick = { t: now, area, index };

    const sameStack = (a, b) => a && b && a.id === b.id && (a.kind || kindOf(a.id)) === (b.kind || kindOf(b.id));
    const isToolSlot = (s) => s && (s.kind || kindOf(s.id)) === 'item' && ITEMS[s.id]?.tool;

    if (!this.cursor && cur) {
      // MC sol: tamamını ele al (sayı ghost'ta görünür). Sağ: yarısını al.
      if (right) {
        if (isToolSlot(cur)) { this.cursor = cur; arr[index] = null; }
        else if (cur.count === 1) { this.cursor = cur; arr[index] = null; }
        else {
          const half = Math.ceil(cur.count / 2);
          this.cursor = { kind: curKind, id: cur.id, count: half };
          cur.count -= half;
          if (cur.count <= 0) arr[index] = null;
        }
      } else {
        // Sol: hepsini al
        this.cursor = cur;
        arr[index] = null;
      }
      if (area === 'hot') this.sel = index;
    } else if (this.cursor && !cur) {
      // Boş slota: sol = tamamını bırak, sağ = 1 tane bırak
      const ck = this.cursor.kind || kindOf(this.cursor.id);
      if (right) {
        if (isToolSlot(this.cursor)) { arr[index] = this.cursor; this.cursor = null; }
        else {
          arr[index] = { kind: ck, id: this.cursor.id, count: 1 };
          this.cursor.count--;
          if (this.cursor.count <= 0) this.cursor = null;
        }
      } else {
        arr[index] = this.cursor;
        this.cursor = null;
      }
      if (area === 'hot') this.sel = index;
    } else if (this.cursor && cur) {
      const ck = this.cursor.kind || kindOf(this.cursor.id);
      if (sameStack(cur, this.cursor)) {
        if (isToolSlot(cur)) { /* alet birleşmez */ }
        else if (right) {
          const mx = maxOf(ck, cur.id);
          if (cur.count < mx && this.cursor.count > 0) {
            cur.count++;
            this.cursor.count--;
            if (this.cursor.count <= 0) this.cursor = null;
          }
        } else {
          const mx = maxOf(ck, cur.id);
          const take = Math.min(this.cursor.count, mx - cur.count);
          cur.count += take; this.cursor.count -= take;
          if (this.cursor.count <= 0) this.cursor = null;
        }
      } else if (!right) {
        // Farklı eşya + sol = takas (MC). Sağ + farklı = hiçbir şey.
        arr[index] = this.cursor;
        this.cursor = cur;
      }
      if (area === 'hot') this.sel = index;
    }
    this.renderMain(); this.renderHot();
    if (!this.cursor) this.hideGhost();
    else this.refreshGhost();
    this.onChange();
  }

  collectAll(id, kind = null) {
    // Eldeki id ile aynı olanları hotbar+çantadan ele çek
    const ck = kind || kindOf(id);
    if (!this.cursor || this.cursor.id !== id) return;
    if (ck === 'item' && ITEMS[id]?.tool) return;
    const mx = maxOf(ck, id);
    const bags = [this.hotbar, this.main];
    for (const bag of bags) {
      for (let i = 0; i < bag.length; i++) {
        const s = bag[i];
        if (s && s.id === id && (s.kind || kindOf(s.id)) === ck && this.cursor.count < mx) {
          const take = Math.min(s.count, mx - this.cursor.count);
          this.cursor.count += take; s.count -= take;
          if (s.count <= 0) bag[i] = null;
          if (this.cursor.count >= mx) return;
        }
      }
    }
  }

  clickGrid(index, e = {}) {
    const list = this.filteredGrid();
    const id = list[index];
    if (id == null) return;
    const right = e.button === 2;
    const kind = kindOf(id);
    // MC palet: sol = tam stack ele al, sağ = 1 tane ele al. Elde varsa çöpe atılmış sayılır.
    if (kind === 'item' && ITEMS[id]?.tool) {
      this.cursor = { kind, id, count: 1, dur: ITEMS[id].maxDur };
    } else if (right) {
      this.cursor = { kind, id, count: 1 };
    } else {
      this.cursor = { kind, id, count: maxOf(kind, id) };
    }
    this.refreshGhost();
  }

  quickMove(area, index) {
    const from = area === 'hot' ? this.hotbar : this.main;
    const to = area === 'hot' ? this.main : this.hotbar;
    const s = from[index];
    if (!s) return;
    const skind = s.kind || kindOf(s.id);
    // Alet: ilk boş slota taşı
    if (skind === 'item' && ITEMS[s.id]?.tool) {
      const empty = to.findIndex((x) => !x);
      if (empty >= 0) { to[empty] = s; from[index] = null; }
      this.renderMain(); this.renderHot();
      this.onChange();
      return;
    }
    const mx = maxOf(skind, s.id);
    for (let i = 0; i < to.length && s.count > 0; i++) {
      if (to[i] && (to[i].kind || kindOf(to[i].id)) === skind && to[i].id === s.id && to[i].count < mx) {
        const take = Math.min(s.count, mx - to[i].count);
        to[i].count += take; s.count -= take;
      }
    }
    for (let i = 0; i < to.length && s.count > 0; i++) {
      if (!to[i]) { to[i] = { kind: skind, id: s.id, count: Math.min(s.count, mx) }; s.count -= to[i].count; }
    }
    if (s.count <= 0) from[index] = null;
    this.renderMain(); this.renderHot();
    this.onChange();
  }

  filteredGrid() {
    let list = CATS[this.tab] || CATS.all;
    if (this.filter) list = list.filter((id) => (nameOf(kindOf(id), id) || '').toLocaleLowerCase('tr').includes(this.filter));
    return list;
  }

  renderGrid() {
    this.el.grid.innerHTML = '';
    const list = this.filteredGrid();
    list.forEach((id, gi) => {
      const kind = kindOf(id);
      const d = document.createElement('div');
      d.className = 'inv-slot';
      d.dataset.area = 'grid'; d.dataset.index = gi;
      const img = document.createElement('img');
      img.src = this.getIcon(id, kind); img.alt = nameOf(kind, id); img.title = nameOf(kind, id);
      img.draggable = false;
      d.appendChild(img);
      d.onpointerdown = (e) => { e.preventDefault(); this.dragStart('grid', gi, e); };
      d.oncontextmenu = (e) => e.preventDefault();
      d.ondragstart = (e) => e.preventDefault();
      this.el.grid.appendChild(d);
    });
    if (!this.el.grid.children.length) {
      const p = document.createElement('div');
      p.textContent = 'Sonuç yok'; p.style.cssText = 'grid-column:1/-1;text-align:center;opacity:.6;padding:8px';
      this.el.grid.appendChild(p);
    }
  }
  renderMain() {
    this.el.main.innerHTML = '';
    this.main.forEach((s, i) => this.el.main.appendChild(this.slotEl(s, 'main', i)));
  }
  renderHot() {
    this.el.hot.innerHTML = '';
    this.hotbar.forEach((s, i) => this.el.hot.appendChild(this.slotEl(s, 'hot', i)));
  }
  renderAll() { this.renderGrid(); this.renderMain(); this.renderHot(); }
}
