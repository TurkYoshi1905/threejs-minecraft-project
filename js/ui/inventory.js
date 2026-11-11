import { BLOCKS } from '../world/blocks.js';
import { ITEMS, ARMOR_SLOTS } from '../world/items.js';
import { nameOf } from '../core/names.js';
import { t } from '../core/i18n.js';

// MC tarzı envanter: Yaratıcı sekmeli+arama, Hayatta Kalma çanta+hotbar.
// Slot: null | {kind:'block'|'item', id, count, dur?}
// Yaratıcıda stack'ler 64 gösterir, koyunca eksilmez (MC gibi). Sonsuz ∞ yok.

function kindOf(id) { return id >= 100 ? 'item' : 'block'; }
function maxOf(kind, id) {
  if (kind === 'item') return ITEMS[id]?.max ?? 64;
  return 64;
}


const PALETTE_HIDE = new Set([16, 24, 26, 86]); // su, yanık fırın, kapı üstü, ateş — eşya hâli yok
const GRID_ALL = [
  ...Object.keys(BLOCKS).map(Number).filter((id) => !PALETTE_HIDE.has(id) && !BLOCKS[id]?.gizli),
  ...Object.keys(ITEMS).map(Number),
].sort((a, b) => a - b);
const CATS = {
  all: GRID_ALL,
  dogal: [1, 2, 3, 8, 15, 5, 6, 18, 19, 17, 44, 65, 67, 68, 70, 130, 132, 75, 77, 79, 81],
  yapi: [
    4, 7, 14, 20, 22, 25, 21, 9, 5, 1, 61, 62, 63,
    28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
    44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
    64, 66, 69
  ],
  degerli: [11, 12, 23, 13, 10, 14, 104, 105, 106, 102, 103, 101, 75, 77, 79, 81, 71, 72, 73, 74, 76, 78, 80, 82, 83, 84, 85, 133, 134, 135, 136, 137],
  alet: [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 100, 101, 105, 106, 102, 103, 104, 131],
  armor: [150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 139, 140, 141, 87],
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
    this.craftUIs = {}; // panelId -> CraftUI referansı (craft grid'e drop yapmak için)
    // Yeni dünya = boş envanter (her iki modda da). Creative E'den seçer,
    // survival kırarak/toplayarak doldurur.
    this.hotbar = new Array(10).fill(null);
    this.main = new Array(27).fill(null);
    // Zırh (MC 1.21.1 slotları): baş/gövde/bacak/bot
    this.armor = { head: null, chest: null, legs: null, feet: null };
    this.el = {
      panel: document.getElementById('invPanel'),
      grid: document.getElementById('invGrid'),
      main: document.getElementById('invMain'),
      hot: document.getElementById('invHot'),
      armorSlots: document.getElementById('armorSlots'),
      tabs: document.getElementById('invTabs'),
      search: document.getElementById('invSearch'),
      mode: document.getElementById('invMode'),
      close: document.getElementById('invClose'),
    };
    this.el.close.onclick = () => opts.onClose?.();
    this.renderArmorSlots();
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
    this.rightDragVisited = new Set();
    window.addEventListener('pointermove', (e) => this.dragMove(e));
    window.addEventListener('pointerup', (e) => this.dragEnd(e));
    window.addEventListener('pointercancel', () => { this.drag = null; this.rightDragVisited.clear(); if (this.ghost) this.ghost.style.display = 'none'; });
    this.renderAll();
  }

  get isOpen() { return !this.el.panel.classList.contains('hidden'); }
  // Masa/fırın açıkken de sürükle-bırak çalışsın (MC gibi)
  isAnyPanelOpen() {
    if (this.isOpen) return true;
    try {
      if (!document.getElementById('tablePanel')?.classList.contains('hidden')) return true;
      if (!document.getElementById('furnacePanel')?.classList.contains('hidden')) return true;
      if (!document.getElementById('chestPanel')?.classList.contains('hidden')) return true;
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
    this.el.mode.textContent = creative ? t('inv.creative') : t('inv.survival');
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
        if (typeof s === 'number') s = { kind: kindOf(s), id: s, count: 1 };
        if (typeof s === 'object' && (BLOCKS[s.id] || ITEMS[s.id])) {
          const kind = s.kind || kindOf(s.id);
          if (kind === 'block' && (s.id === 16 || s.id === 86)) return null; // yasak blok eşyası (kayıt göçü)
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
      // Zırh: sadece armorSlot alanı olan, kendi slotuna uyan itemleri geri yükle
      if (data.armor && typeof data.armor === 'object') {
        for (const slot of ARMOR_SLOTS) {
          const v = norm(data.armor[slot]);
          this.armor[slot] = (v && ITEMS[v.id]?.armorSlot === slot) ? v : null;
        }
      } else {
        for (const slot of ARMOR_SLOTS) this.armor[slot] = null;
      }
    } catch {}
    this.renderAll();
  }

  // CraftUI panellerini kaydeder (craft grid'e sürükle-bırak için)
  registerCraftUI(panelId, craftUI) {
    this.craftUIs[panelId] = craftUI;
  }

  serialize() {
    const s = (x) => (x ? { kind: x.kind || kindOf(x.id), id: x.id, count: x.count, dur: x.dur } : null);
    const a = {};
    for (const slot of ARMOR_SLOTS) a[slot] = s(this.armor[slot]);
    return { hotbar: this.hotbar.map(s), main: this.main.map(s), sel: this.sel, armor: a };
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
      if (!BLOCKS[id] || id === 10 || id === 16 || id === 86) return false;
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

  consumeSelected(force = false) {
    // Yaratıcıda eksilmez (MC) — force (Q) hariç. Hayatta kalmada 1 eksilt.
    if (this.mode === 'creative' && !force) return true;
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
    this.hotbar = new Array(10).fill(null);
    this.cursor = null;
    this.hideGhost?.();
    this.renderAll(); this.onChange();
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
    d.onpointermove = (e) => {
      if (e.buttons === 1 || e.buttons === 2) {
        if (!this.drag) this.dragStart(area, index, e);
        this.dragMove(e);
      }
    };
    d.onpointerup = (e) => {
      if (this.drag) this.dragEnd(e);
    };
    d.oncontextmenu = (e) => e.preventDefault();
    d.ondragstart = (e) => e.preventDefault();
    return d;
  }

  stackAt(area, index, craftPanel = null) {
    if (area === 'hot') return this.hotbar[index] || null;
    if (area === 'main') return this.main[index] || null;
    if (area === 'armor') return this.armor[ARMOR_SLOTS[index]] || null;
    if (area === 'armor') return this.armor[ARMOR_SLOTS[index]] || null;
    if (area === 'craft') {
      if (index < 0) return null; // sonuç/çıktı hücresi sürüklenemez
      const c = this.craftUIs[craftPanel];
      return (c && c.grid && c.grid[index]) || null;
    }
    if (area === 'chest') return this._chestGet(index);
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
    if (c.count === Infinity) return '∞';
    return String(Math.max(1, c.count)); // tekli de sayiyla goster (geri bildirim)
  }

  // Ana eşya dizisini çöz: main/hot envanter, craft = ilgili panelin grid'i
  _arrFor(area, craftPanel = null) {
    if (area === 'hot') return this.hotbar;
    if (area === 'main') return this.main;
    if (area === 'craft') {
      const c = this.craftUIs[craftPanel];
      return (c && c.grid) ? c.grid : null;
    }
    return null; // chest için flat dizi yok (yarılar ayrı) — _chestGet/_chestSet kullanılmalı
  }

  // ---- Sandık erişimi (görünüm indeksi 0..53: iki yarı yan yana) ----
  _chestGet(vi) {
    try {
      const cu = window.chestUI;
      if (!cu || !cu.isOpen) return null;
      const sl = cu.viewSlot(vi);
      return sl ? (sl.half.st.slots[sl.i] || null) : null;
    } catch { return null; }
  }
  _chestSet(vi, value) {
    try {
      const cu = window.chestUI;
      if (!cu || !cu.isOpen) return;
      const sl = cu.viewSlot(vi);
      if (!sl) return;
      sl.half.st.slots[sl.i] = value;
      cu.renderAll();
    } catch {}
  }
  // ===== ZIRH SLOTLARI =====
  armorPoints() {
    let total = 0;
    for (const slotName of ARMOR_SLOTS) {
      const s = this.armor[slotName];
      if (s && ITEMS[s.id]?.armorPts) total += ITEMS[s.id].armorPts;
    }
    return total;
  }
  renderArmorSlots() {
    const el = this.el.armorSlots;
    if (!el) return;
    el.innerHTML = '';
    // Her slot için piksel-art silueti (MC gibi boşken görülür)
    const silhouette = {
      head: '⛑️',
      chest: '🦺',
      legs: '👖',
      feet: '👢',
    };
    ARMOR_SLOTS.forEach((slotName, idx) => {
      const d = document.createElement('div');
      d.className = 'inv-slot armor-slot';
      d.dataset.area = 'armor';
      d.dataset.index = String(idx);
      const item = this.armor[slotName];
      if (item) {
        const kind = item.kind || kindOf(item.id);
        const img = document.createElement('img');
        img.src = this.getIcon(item.id, kind);
        img.alt = nameOf(kind, item.id) || '';
        img.title = img.alt;
        img.draggable = false;
        d.appendChild(img);
        if (item.count > 1) {
          const c = document.createElement('span'); c.className = 'cnt'; c.textContent = item.count; d.appendChild(c);
        }
      } else {
        const span = document.createElement('span');
        span.className = 'armor-placeholder';
        span.textContent = silhouette[slotName] || '?';
        d.appendChild(span);
      }
      d.onpointerdown = (e) => { e.preventDefault(); this.dragStart('armor', idx, e); };
      d.onpointermove = (e) => { if (e.buttons === 1 || e.buttons === 2) { if (!this.drag) this.dragStart('armor', idx, e); this.dragMove(e); } };
      d.onpointerup = (e) => { if (this.drag) this.dragEnd(e); };
      d.oncontextmenu = (e) => e.preventDefault();
      d.ondragstart = (e) => e.preventDefault();
      el.appendChild(d);
    });
  }
  // ===== ARMOR END =====

  // Alan-bağımsız slot yazma (main/hot/craft grid/chest)
  _setSlot(area, index, value, craftPanel = null) {
    if (area === 'hot') { this.hotbar[index] = value; return; }
    if (area === 'main') { this.main[index] = value; return; }
    if (area === 'armor') {
      const slotName = ARMOR_SLOTS[index];
      if (slotName) { this.armor[slotName] = value; }
      this.renderArmorSlots();
      return;
    }
    if (area === 'chest') { this._chestSet(index, value); return; }
    if (area === 'craft') {
      const c = this.craftUIs[craftPanel];
      if (c && c.grid && index >= 0) c.grid[index] = value;
      if (c) c.refresh();
    }
  }

  dragStart(area, index, e, craftPanel = null) {
    const isRight = e.button === 2;
    this.rightDragVisited.clear();
    // craftPanel'i parametre yoksa olaydan çıkar (craft hücreleri data-craft-panel taşır)
    if (area === 'craft' && !craftPanel) {
      try { craftPanel = e.target?.closest?.('.inv-slot')?.dataset?.craftPanel || null; } catch {}
    }

    // Sağ tıkla sürükleme: elinde eşya yoksa slottaki eşyanın yarısını ele al
    if (isRight && !this.cursor && area !== 'grid') {
      const cur = this.stackAt(area, index, craftPanel);
      if (cur) {
        const curKind = cur.kind || kindOf(cur.id);
        const isTool = curKind === 'item' && ITEMS[cur.id]?.tool;
        if (!isTool) {
          const half = Math.ceil(cur.count / 2);
          this.cursor = { kind: curKind, id: cur.id, count: half };
          cur.count -= half;
          if (cur.count <= 0) {
            this._setSlot(area, index, null, craftPanel);
          }
          this.renderMain(); this.renderHot();
          this.onChange();
          const startKey = `${area}:${craftPanel || ''}:${index}`;
          this.rightDragVisited.add(startKey);
        }
      }
    } else if (isRight && this.cursor) {
      // Elde eşya varken sağ tıklandığında başlangıç slotuna 1 tane bırak
      const startKey = `${area}:${craftPanel || ''}:${index}`;
      this.rightDragVisited.add(startKey);
      this.distributeOneTo({ area, index, craftPanel });
    }

    const s = this.stackAt(area, index, craftPanel);
    this.drag = {
      area, index, button: e.button, shift: e.shiftKey, craftPanel,
      x0: e.clientX, y0: e.clientY, moved: false,
      id: s ? s.id : (this.cursor ? this.cursor.id : 0),
      kind: s ? (s.kind || kindOf(s.id)) : (this.cursor ? (this.cursor.kind || kindOf(this.cursor.id)) : null),
      count: s ? s.count : (this.cursor ? this.cursor.count : 0),
      hover: null,
    };
    if (this.cursor) {
      this.ensureGhost();
      this.ghost.querySelector('img').src = this.getIcon(this.cursor.id, this.cursor.kind || kindOf(this.cursor.id));
      this.ghost.querySelector('.cnt').textContent = this.cursorCountText(this.cursor);
    } else if (s) {
      this.ensureGhost();
      this.ghost.querySelector('img').src = this.getIcon(s.id, s.kind || kindOf(s.id));
      this.ghost.querySelector('.cnt').textContent = this.cursorCountText(s);
    }
  }

  // Minecraft tarzı: sağ tık basılı sürüklerken her geçilen slota 1 adet dağıt
  distributeOneTo(hov) {
    if (!this.cursor || this.cursor.count <= 0 || !hov || !hov.area || hov.index < 0 || hov.area === 'grid') return;
    const curKind = this.cursor.kind || kindOf(this.cursor.id);
    const isTool = curKind === 'item' && ITEMS[this.cursor.id]?.tool;
    if (isTool) return;
    const max = maxOf(curKind, this.cursor.id);

    if (hov.area === 'craft') {
      const c = this.craftUIs[hov.craftPanel];
      if (!c) return;
      const slot = c.grid[hov.index];
      if (!slot) {
        c.grid[hov.index] = { kind: curKind, id: this.cursor.id, count: 1 };
        this.cursor.count--;
      } else {
        const sk = slot.kind || kindOf(slot.id);
        if (slot.id === this.cursor.id && sk === curKind && slot.count < max) {
          slot.count++;
          this.cursor.count--;
        } else {
          return;
        }
      }
      c.renderAll();
      c.refresh();
    } else if (hov.area === 'main' || hov.area === 'hot') {
      const arr = hov.area === 'hot' ? this.hotbar : this.main;
      const slot = arr[hov.index];
      if (!slot) {
        arr[hov.index] = { kind: curKind, id: this.cursor.id, count: 1 };
        this.cursor.count--;
      } else {
        const sk = slot.kind || kindOf(slot.id);
        if (slot.id === this.cursor.id && sk === curKind && slot.count < max) {
          slot.count++;
          this.cursor.count--;
        } else {
          return;
        }
      }
      this.renderMain();
      this.renderHot();
    } else if (hov.area === 'chest') {
      if (typeof window.chestUI !== 'undefined' && window.chestUI && window.chestUI.isOpen) {
        const slotInfo = window.chestUI.viewSlot(hov.index);
        if (slotInfo) {
          const cur = slotInfo.half.st.slots[slotInfo.i];
          if (!cur) {
            slotInfo.half.st.slots[slotInfo.i] = { kind: curKind, id: this.cursor.id, count: 1 };
            this.cursor.count--;
          } else {
            const sk = cur.kind || kindOf(cur.id);
            if (cur.id === this.cursor.id && sk === curKind && cur.count < max) {
              cur.count++;
              this.cursor.count--;
            } else {
              return;
            }
          }
          window.chestUI.renderAll();
        }
      }
    }

    if (this.cursor.count <= 0) {
      this.cursor = null;
      this.hideGhost();
    } else {
      this.refreshGhost();
    }
    this.onChange();
  }

  // Sürükleme hedefini her harekette önceden hesapla (bırakma anına güvenme)
  dragHover(e) {
    let t = null;
    try {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el) {
        t = el.closest?.('.inv-slot') || null;
      }
      if (!t && document.elementsFromPoint) {
        const pts = document.elementsFromPoint(e.clientX, e.clientY);
        for (const cand of pts) {
          const s = cand.closest?.('.inv-slot');
          if (s) { t = s; break; }
        }
      }
    } catch { t = null; }
    if (t && t.dataset.area) {
      return {
        area: t.dataset.area,
        index: +t.dataset.index,
        craftPanel: t.dataset.craftPanel || null,
      };
    }
    // Fare boş alanda (slottan dışı): envanter ızgarası kapsayıcısı içindeyse 'grid' olarak işaretle
    try {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const grid = el?.closest ? el.closest('#invGrid, #craft2Grid, #craft3Grid') : null;
      if (grid) {
        return { area: 'grid', index: -1 };
      }
    } catch {}
    return null;
  }

  dragMove(e) {
    if (!this.isAnyPanelOpen()) { this.hideGhost(); return; }
    // Eldeki stack her zaman farede görünsün (MC gibi) — sayı rozetiyle birlikte
    if (this.cursor && (!this.drag || !this.drag.moved)) {
      this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
    }

    // Sağ tık basılı sürükleme: Minecraft tarzı her geçilen slota 1 adet dağıt
    if ((e.buttons === 2 || (this.drag && this.drag.button === 2)) && this.cursor && this.cursor.count > 0) {
      this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
      const hov = this.dragHover(e);
      if (hov && hov.area && hov.index >= 0 && hov.area !== 'grid') {
        const key = `${hov.area}:${hov.craftPanel || ''}:${hov.index}`;
        if (!this.rightDragVisited.has(key)) {
          this.rightDragVisited.add(key);
          this.distributeOneTo(hov);
        }
      }
      return;
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
    this.rightDragVisited.clear();
    if (!dr || !this.isAnyPanelOpen()) { this.hideGhost(); return; }

    // Sağ tık sürüklemesi bittiğinde: eşyalar sürükleme esnasında slota 1'er 1'er bırakılmıştır.
    // ÖNEMLİ: sağ tık asla clickSlot'a düşmez — pointerdown'da dağıtılan 1 adet yeterlidir
    // (eskiden çift işlem yapıyordu: başlangıç slotu 2 alıyordu).
    if (dr.button === 2) {
      if (this.cursor && e && typeof e.clientX === 'number') {
        this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
      } else if (!this.cursor) {
        this.hideGhost();
      }
      return;
    }

    // Hareket yoksa = klasik tık (boş slot dahil: eldeki stack'i yerleştir)
    if (!dr.moved) {
      this.hideGhost();
      this.clickSlot(dr.area, dr.index, { button: dr.button, shiftKey: dr.shift }, dr.craftPanel || null);
      if (this.cursor && e && typeof e.clientX === 'number') {
        this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
      }
      return;
    }

    // Sürükleme bitti: hedef slotu belirle
    let hov = dr.hover || this.dragHover(e);
    this.hideGhost();

    // Fare boş alanda (slottan dışı) ve envanter kapsayıcısı içindeyse 'grid' (silme alanı) olarak işaretle
    if ((!hov || !hov.area) && e && typeof e.clientX === 'number') {
      try {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const grid = el?.closest ? el.closest('#invGrid, #craft2Grid, #craft3Grid') : null;
        if (grid) hov = { area: 'grid', index: -1 };
      } catch {}
    }

    if (!hov || !hov.area || (hov.area === 'grid' && hov.index < 0)) {
      // Dışarıya veya geçersiz alana bırakıldı: eşyayı asla yok etme!
      this.renderMain(); this.renderHot();
      if (this.cursor && e && typeof e.clientX === 'number') {
        this.showGhost(this.cursor.id, this.cursor.count, e.clientX, e.clientY, this.cursor.kind);
      }
      return;
    }

    const toArea = hov.area;
    const toIndex = hov.index;
    const toPanel = hov.craftPanel || null;

    // Aynı slota geri bırakıldı: hiçbir şey yapma (craft paneli de dahil)
    if (dr.area === toArea && dr.index === toIndex && (dr.craftPanel || null) === toPanel) return;

    // Gerçek slot-to-slot taşıma (kaynak craft paneli sürükleyenden gelir)
    this.dropMove(dr.area, dr.index, toArea, toIndex, dr.button === 2, toPanel, dr.craftPanel || null);
  }

  // Sürükle-bırak yerleştirme (kaynak slottan hedef slota) — MC mantığı
  // toCraftPanel: hedef craft panelinin ID'si (toArea === 'craft' olduğunda)
  // fromCraftPanel: kaynak craft panelinin ID'si (fromArea === 'craft' olduğunda)
  dropMove(fromArea, fromIndex, toArea, toIndex, right, craftPanel = null, fromCraftPanel = null) {
    // Alan-bağımsız slot okuyucu: main/hot/craft grid/chest
    const getCraftGrid = (panelId) => {
      const c = this.craftUIs[panelId];
      return c ? c.grid : null;
    };
    const getSlot = (area, panel, i) => {
      if (i < 0) return null;
      if (area === 'armor') return this.armor[ARMOR_SLOTS[i]] || null;
      if (area === 'chest') return this._chestGet(i);
      if (area === 'craft') { const g = getCraftGrid(panel); return g ? g[i] : null; }
      if (area === 'hot') return this.hotbar[i] || null;
      return this.main[i] || null;
    };
    const setSlot = (area, panel, i, v) => this._setSlot(area, i, v, panel);
    const clearFrom = () => setSlot(fromArea, fromCraftPanel, fromIndex, null);

    // Zırh slotu doğrulaması: sadece uint armorSlot eşleşen eşya geçer
    const armorSlotName = toArea === 'armor' ? ARMOR_SLOTS[toIndex] : null;
    const isArmorTarget = toArea === 'armor';

    // Kaynak verisini al (craft grid'ten, sandıktan veya envanterden)
    const src = getSlot(fromArea, fromCraftPanel, fromIndex);
    if (!src) return;

    const skind = src.kind || kindOf(src.id);

    // Hedef verisini al
    const dst = getSlot(toArea, craftPanel, toIndex);

    // Zırh hedefteyse: sadece uygun armorSlot itemine izin ver
    if (isArmorTarget) {
      const want = ITEMS[src.id];
      if (!want || want.armorSlot !== armorSlotName) return;
    }

    // Aynı slota geri bırakıldı: hiçbir şey yapma
    if (fromArea === toArea && fromIndex === toIndex && (fromCraftPanel || null) === (craftPanel || null)) return;

    // ---- Yaratıcı paletten kopyala (izgara -> envanter veya craft) ----
    if (fromArea === 'grid') {
      const list = this.filteredGrid();
      const id = list[fromIndex];
      if (id == null) return;
      const kind = kindOf(id);
      if (kind === 'item' && ITEMS[id]?.tool) {
        setSlot(toArea, craftPanel, toIndex, { kind, id, count: 1, dur: ITEMS[id].maxDur });
      } else if (right) {
        setSlot(toArea, craftPanel, toIndex, { kind, id, count: 1 });
      } else {
        setSlot(toArea, craftPanel, toIndex, { kind, id, count: maxOf(kind, id) });
      }
      if (toArea === 'hot') this.sel = toIndex;
      this.renderMain(); this.renderHot();
      this.onChange();
      return;
    }

    // Kaynak nesnesinin kopyasını oluştur (referans ataması YAPMA — MC'deki stack ayırması mantığı)
    const cloneSrc = () => ({ kind: src.kind, id: src.id, count: src.count, dur: src.dur });

    // ---- Envanter/craft/sandık slotundan hedefe taşı ----
    // Aletler birleşmez, sadece taşınır/takas edilir
    if (skind === 'item' && ITEMS[src.id]?.tool) {
      if (!dst && !right) {
        setSlot(toArea, craftPanel, toIndex, cloneSrc());
        clearFrom();
      }
      else if (dst && !right) {
        setSlot(toArea, craftPanel, toIndex, cloneSrc());
        setSlot(fromArea, fromCraftPanel, fromIndex, dst);
      }
      // sağ+tık + dolu slot = işlem yok (MC)
    }
    else if (!dst) {
      // Hedef boş
      if (right && src.count > 1) {
        setSlot(toArea, craftPanel, toIndex, { kind: skind, id: src.id, count: 1 });
        src.count--;
      } else {
        setSlot(toArea, craftPanel, toIndex, cloneSrc());
        clearFrom();
      }
    }
    else if ((dst.kind || kindOf(dst.id)) === skind && dst.id === src.id) {
      // Aynı eşya: birleştir (yığın). Stack sınırı 64'i aşamaz.
      const dmax = maxOf(skind, src.id);
      const take = right ? 1 : Math.min(src.count, dmax - dst.count);
      const real = Math.min(take, src.count, Math.max(0, dmax - dst.count));
      dst.count += real;
      src.count -= real;
      if (src.count <= 0) clearFrom();
      // Referansı geri yaz (main/hot/craft/chest: chest renderAll, craft refresh tetiklenir)
      setSlot(toArea, craftPanel, toIndex, dst);
    }
    else if (!right) {
      // Farklı eşya + sol tık = takas
      setSlot(fromArea, fromCraftPanel, fromIndex, dst);
      setSlot(toArea, craftPanel, toIndex, cloneSrc());
    }
    // sağ+tık + farklı eşya = işlem yok (MC)

    if (toArea === 'hot' || fromArea === 'hot') {
      this.sel = toArea === 'hot' ? toIndex : this.sel;
    }
    this.renderMain(); this.renderHot();
    this.onChange();
  }

  invDbg(...a) { try { if (new URLSearchParams(location.search).get('debug') === 'inv') console.log('[inv]', ...a); } catch {} }
  clickSlot(area, index, e, craftPanel = null) {
    this.invDbg('slot', area, index, 'btn=' + (e && e.button), 'panel=' + craftPanel);
    const right = e.button === 2;
    const shift = e.shiftKey;
    // Craft hücresi tıklaması: ilgili CraftUI'nin clickCell'ine delege et (tek doğru yol).
    // Faz 1 öncesi bu yol area==='main'e düşüp aynı indisli çanta slotunu bozuyordu (bug A).
    if (area === 'craft') {
      if (!craftPanel) craftPanel = e?.target?.closest?.('.inv-slot')?.dataset?.craftPanel || null;
      if (!craftPanel) return;
      const c = this.craftUIs[craftPanel];
      if (c && typeof c.clickCell === 'function' && index >= 0) c.clickCell(index, e || {});
      return;
    }
    // Sandık hücresi tıklaması: sandığın kendi clickSlot'una delege et (yarılar 0..53 görünüm indeksi).
    if (area === 'chest') {
      try {
        const cu = window.chestUI;
        if (cu && typeof cu.clickSlot === 'function') cu.clickSlot(index, e || {});
      } catch {}
      return;
    }
    // Palet: elde taşınırken tıklama yaratıcı envantere bırakır ve yok eder (MC Creative çöp kutusu/silme).
    // Elde eşya yoksa yaratıcı paletten eşyayı alır.
    if (area === 'grid') {
      if (this.cursor) {
        this.cursor = null;
        this.hideGhost();
        this.onChange();
        return;
      }
      this.clickGrid(index, e);
      return;
    }
    const arr = area === 'hot' ? this.hotbar : this.main;
    if (shift) { this.quickMove(area, index); return; }
    const cur = arr[index];
    const curKind = cur ? (cur.kind || kindOf(cur.id)) : null;
    const now = performance.now();

    // Çift-tıkla topla (MC): elde eşya varken aynı slota veya eşyaya çift tık = etraftakileri ele çek
    const isDouble = !right && this._lastClick && (now - this._lastClick.t) < 450 && (
      (this._lastClick.area === area && this._lastClick.index === index) ||
      (this.cursor && this._lastClick.id === this.cursor.id)
    );

    if (isDouble && this.cursor) {
      const ck = this.cursor.kind || kindOf(this.cursor.id);
      const isTool = ck === 'item' && ITEMS[this.cursor.id]?.tool;
      if (!isTool && isFinite(this.cursor.count)) {
        this.collectAll(this.cursor.id, this.cursor.kind);
        this._lastClick = null;
        this.renderMain(); this.renderHot();
        this.refreshGhost();
        this.onChange();
        return;
      }
    }
    this._lastClick = {
      t: now,
      area,
      index,
      id: cur ? cur.id : (this.cursor ? this.cursor.id : null),
      kind: curKind || (this.cursor ? this.cursor.kind : null)
    };

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
    // Eldeki id ile aynı olanları hotbar+çantadan ve üretim masalarından ele çek
    const ck = kind || kindOf(id);
    if (!this.cursor || this.cursor.id !== id) return;
    if (ck === 'item' && ITEMS[id]?.tool) return;
    const mx = maxOf(ck, id);
    const bags = [this.hotbar, this.main];
    for (const c of Object.values(this.craftUIs || {})) {
      if (c && c.grid) bags.push(c.grid);
    }
    for (const bag of bags) {
      for (let i = 0; i < bag.length; i++) {
        const s = bag[i];
        if (s && s.id === id && (s.kind || kindOf(s.id)) === ck && this.cursor.count < mx) {
          const take = Math.min(s.count, mx - this.cursor.count);
          this.cursor.count += take; s.count -= take;
          if (s.count <= 0) bag[i] = null;
          if (this.cursor.count >= mx) break;
        }
      }
      if (this.cursor.count >= mx) break;
    }
    for (const c of Object.values(this.craftUIs || {})) {
      if (c) { c.renderAll?.(); c.refresh?.(); }
    }
  }

  clickGrid(index, e = {}) {
    this.invDbg('grid', index, 'btn=' + e.button, 'cursor=', this.cursor && (this.cursor.kind + ':' + this.cursor.id + 'x' + this.cursor.count));
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
    if (area === 'chest') return; // sandık Shift+tık'ı chest.clickSlot kendi içinde çözer
    const from = area === 'hot' ? this.hotbar : this.main;
    const s = from[index];
    if (!s) return;

    // Sandık açıksa çantadan sandığa hızlı aktar
    if (typeof window.chestUI !== 'undefined' && window.chestUI && window.chestUI.isOpen) {
      window.chestUI.insertStack(s);
      if (s.count <= 0) from[index] = null;
      this.renderMain(); this.renderHot();
      this.onChange();
      return;
    }

    const to = area === 'hot' ? this.main : this.hotbar;
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
      p.textContent = t('inv.noResults'); p.style.cssText = 'grid-column:1/-1;text-align:center;opacity:.6;padding:8px';
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
  renderAll() { this.renderGrid(); this.renderMain(); this.renderHot(); this.renderArmorSlots(); }
}
