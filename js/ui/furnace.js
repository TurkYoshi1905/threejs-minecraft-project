import { BLOCKS } from '../world/blocks.js';
import { ITEMS, FUEL_TIME, FUEL_BLOCK_TIME, SMELT, SMELT_ITEM } from '../world/items.js';

// Fırın yöneticisi + arayüzü (MC basitleştirmesi).
// Her fırın konumu: {input, fuel, output, prog, burn, burnTotal}
// Slot: null | {kind, id, count} (alet yakıt olmaz)

function kindOf(id) { return id >= 100 ? 'item' : 'block'; }

export function fuelTimeOf(slot) {
  if (!slot) return 0;
  const k = slot.kind || kindOf(slot.id);
  if (k === 'item') return FUEL_TIME[slot.id] || 0;
  return FUEL_BLOCK_TIME[slot.id] || 0;
}

export function smeltOf(inputSlot) {
  if (!inputSlot) return null;
  const k = inputSlot.kind || kindOf(inputSlot.id);
  if (k === 'item') {
    if (ITEMS[inputSlot.id]?.tool) return null;
    return SMELT_ITEM[inputSlot.id] || null;
  }
  return SMELT[inputSlot.id] || null;
}

export class FurnaceManager {
  constructor() {
    this.map = new Map(); // "x,y,z" -> state
  }
  key(x, y, z) { return x + ',' + y + ',' + z; }
  get(x, y, z) {
    const k = this.key(x, y, z);
    if (!this.map.has(k)) this.map.set(k, { input: null, fuel: null, output: null, prog: 0, burn: 0, burnTotal: 0 });
    return this.map.get(k);
  }
  remove(x, y, z) { this.map.delete(this.key(x, y, z)); }
  clear() { this.map.clear(); }
  serialize() {
    const out = {};
    for (const [k, v] of this.map) out[k] = v;
    return out;
  }
  load(obj) {
    this.map.clear();
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') this.map.set(k, { input: v.input || null, fuel: v.fuel || null, output: v.output || null, prog: +v.prog || 0, burn: +v.burn || 0, burnTotal: +v.burnTotal || 0 });
    }
  }
  // 0.2sn tick:-worlddeki tüm fırınlar (sayı az olduğu için hepsi)
  // Yanma 0<->sıfır geçişlerini litSwaps'a yazar (main blok takası yapar: 22<->24).
  tick(dt, isLoaded) {
    let dirty = false;
    this.litSwaps = [];
    for (const [k, st] of this.map) {
      const [x, y, z] = k.split(',').map(Number);
      if (isLoaded && !isLoaded(x, y, z)) continue;
      const wasLit = st.burn > 0;
      const recipe = smeltOf(st.input);
      // çıktı doluysa bekle
      let room = true;
      if (recipe) {
        const okind = recipe.outKind || (recipe.out >= 100 ? 'item' : 'block');
        if (st.output) {
          const outk = st.output.kind || kindOf(st.output.id);
          if (outk !== okind || st.output.id !== recipe.out) room = false;
          else {
            const mx = outk === 'item' ? (ITEMS[recipe.out]?.max ?? 64) : 64;
            if (st.output.count >= mx) room = false;
          }
        }
      } else room = false;
      if (st.burn > 0) {
        st.burn -= dt;
        if (st.burn < 0) st.burn = 0;
        dirty = true;
      }
      if (recipe && room) {
        if (st.burn <= 0) {
          // yeni yakıt yak
          const ft = fuelTimeOf(st.fuel);
          if (ft > 0) {
            st.fuel.count--;
            if (st.fuel.count <= 0) st.fuel = null;
            st.burn = ft; st.burnTotal = ft;
            dirty = true;
          } else {
            if (st.prog !== 0) { st.prog = 0; dirty = true; }
            continue;
          }
        }
        if (st.burn > 0) {
          st.prog += dt / recipe.time;
          dirty = true;
          if (st.prog >= 1) {
            st.prog = 0;
            st.input.count--;
            if (st.input.count <= 0) st.input = null;
            const okind = recipe.outKind || (recipe.out >= 100 ? 'item' : 'block');
            if (!st.output) st.output = { kind: okind, id: recipe.out, count: 1 };
            else st.output.count++;
          }
        }
      } else if (st.prog !== 0) { st.prog = 0; dirty = true; }
      const isLit = st.burn > 0;
      if (isLit !== wasLit) this.litSwaps.push({ x, y, z, lit: isLit });
    }
    return dirty;
  }
}

export class FurnaceUI {
  constructor(opts) {
    this.inventory = opts.inventory;
    this.getIcon = opts.getIcon;
    this.mgr = opts.mgr;
    this.onChange = opts.onChange || (() => {});
    this.pos = null; // {x,y,z}
    this.el = {
      panel: document.getElementById('furnacePanel'),
      input: document.getElementById('furnIn'),
      fuel: document.getElementById('furnFuel'),
      out: document.getElementById('furnOut'),
      burnFill: document.getElementById('furnBurnFill'),
      progFill: document.getElementById('furnProgFill'),
      main: document.getElementById('furnMain'),
      hot: document.getElementById('furnHot'),
      close: document.getElementById('furnaceClose'),
    };
    if (this.el.close) this.el.close.onclick = () => opts.onClose?.();
  }
  get isOpen() { return this.el.panel && !this.el.panel.classList.contains('hidden'); }
  open(x, y, z) {
    this.pos = { x, y, z };
    this.mgr.get(x, y, z); // oluştur
    this.el.panel?.classList.remove('hidden');
    this.renderAll();
  }
  close() {
    this.pos = null;
    this.el.panel?.classList.add('hidden');
  }
  state() {
    if (!this.pos) return null;
    return this.mgr.get(this.pos.x, this.pos.y, this.pos.z);
  }
  clickSlot(which, e) {
    const st = this.state();
    const inv = this.inventory;
    if (!st) return;
    if (which === 'out') {
      if (!st.output) return;
      const o = st.output;
      const ok = inv.addItem(o.id, o.count, o.kind || kindOf(o.id));
      if (ok) { st.output = null; this.onChange(); }
      this.renderAll();
      return;
    }
    const right = e.button === 2;
    const cur = st[which]; // input/fuel
    if (!inv.cursor && cur) {
      if (right && cur.count > 1) {
        const half = Math.ceil(cur.count / 2);
        inv.cursor = { kind: cur.kind || kindOf(cur.id), id: cur.id, count: half };
        cur.count -= half;
        if (cur.count <= 0) st[which] = null;
      } else { inv.cursor = cur; st[which] = null; }
    } else if (inv.cursor && !cur) {
      const ck = inv.cursor.kind || kindOf(inv.cursor.id);
      // yakıt slotuna sadece yakıt, girdi slotuna sadece eritilebilir
      if (which === 'fuel' && fuelTimeOf({ kind: ck, id: inv.cursor.id }) <= 0) return;
      if (which === 'input' && !smeltOf({ kind: ck, id: inv.cursor.id })) {
        // MC'de her şey girmez; yine de koymaya izin verme
        return;
      }
      if (ck === 'item' && ITEMS[inv.cursor.id]?.tool) return; // alet yakıt/girdi olmaz
      if (right && inv.cursor.count > 1) {
        st[which] = { kind: ck, id: inv.cursor.id, count: 1 };
        inv.cursor.count--;
        if (inv.cursor.count <= 0) inv.cursor = null;
      } else { st[which] = inv.cursor; inv.cursor = null; }
    } else if (inv.cursor && cur) {
      const ck = inv.cursor.kind || kindOf(inv.cursor.id);
      const tk = cur.kind || kindOf(cur.id);
      const same = cur.id === inv.cursor.id && ck === tk;
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
      } else if (!right) { st[which] = inv.cursor; inv.cursor = cur; }
      // sağ + farklı id = hiçbir şey (MC)
    }
    try { if (!inv.cursor) inv.hideGhost?.(); else inv.refreshGhost?.(); } catch {}
    this.renderAll();
    this.onChange();
  }
  slotEl(content, which) {
    const d = document.createElement('div');
    d.className = 'inv-slot furn-slot';
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
    }
    if (which !== 'out' || content) {
      d.onpointerdown = (e) => { e.preventDefault(); this.clickSlot(which, e); };
    }
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
    const st = this.state();
    if (!this.el.input) return;
    this.el.input.innerHTML = '';
    this.el.input.appendChild(this.slotEl(st?.input || null, 'input'));
    this.el.fuel.innerHTML = '';
    this.el.fuel.appendChild(this.slotEl(st?.fuel || null, 'fuel'));
    this.el.out.innerHTML = '';
    const o = this.slotEl(st?.output || null, 'out');
    if (st?.output) o.classList.add('craft-out');
    this.el.out.appendChild(o);
    if (this.el.burnFill) {
      const f = st && st.burnTotal > 0 ? Math.max(0, st.burn / st.burnTotal) : 0;
      this.el.burnFill.style.height = (f * 100) + '%';
    }
    if (this.el.progFill) {
      this.el.progFill.style.width = ((st?.prog || 0) * 100) + '%';
    }
    this.renderInv();
  }
}
