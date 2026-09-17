import { BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../world/items.js';

// Sohbet (T veya /) + komutlar. Minecraft fontu CSS'te.
// api: {
//   print(text, cls), isCreative(), setGamemode(m), give(id,count,kind),
//   setBlock(x,y,z,id), tp(x,y,z), setTime(v), getTime(), seed(),
//   clearInv(), kill(), pos(), releaseLock(), relock()
// }

const CMDS = ['help', 'gamemode', 'give', 'setblock', 'tp', 'time', 'seed', 'clear', 'kill', 'spawn'];

export function resolveBlock(query) {
  if (query == null) return 0;
  const q = String(query).toLocaleLowerCase('tr').trim();
  if (/^\d+$/.test(q)) {
    const id = +q;
    return BLOCKS[id] ? id : 0;
  }
  for (const [id, b] of Object.entries(BLOCKS)) {
    if ((b.ad || '').toLocaleLowerCase('tr') === q) return +id;
  }
  for (const [id, b] of Object.entries(BLOCKS)) {
    if ((b.ad || '').toLocaleLowerCase('tr').includes(q)) return +id;
  }
  const tex = q.replace(/\s+/g, '_');
  for (const [id, b] of Object.entries(BLOCKS)) {
    const names = [b.all, b.top, b.side, b.bottom, b.front].filter(Boolean);
    if (names.some((n) => n.toLocaleLowerCase() === tex)) return +id;
  }
  return 0;
}

export function resolveItem(query) {
  if (query == null) return 0;
  const q = String(query).toLocaleLowerCase('tr').trim();
  if (/^\d+$/.test(q)) {
    const id = +q;
    return ITEMS[id] ? id : 0;
  }
  for (const [id, b] of Object.entries(ITEMS)) {
    if ((b.ad || '').toLocaleLowerCase('tr') === q) return +id;
  }
  for (const [id, b] of Object.entries(ITEMS)) {
    if ((b.ad || '').toLocaleLowerCase('tr').includes(q)) return +id;
  }
  const tex = q.replace(/\s+/g, '_');
  for (const [id, b] of Object.entries(ITEMS)) {
    if ((b.tex || '').toLocaleLowerCase() === tex) return +id;
  }
  return 0;
}

function num(v, fallback) {
  if (v === undefined) return fallback;
  if (typeof v === 'string' && v.startsWith('~')) {
    const d = v.length > 1 ? parseFloat(v.slice(1)) : 0;
    return { rel: isNaN(d) ? 0 : d };
  }
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export class ChatUI {
  constructor(api) {
    this.api = api;
    this.history = [];
    this.hi = -1;
    this.log = document.getElementById('chatLog');
    this.box = document.getElementById('chatBox');
    this.input = document.getElementById('chatInput');
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('input', () => { this.hi = -1; });
  }
  get isOpen() { return !this.box.classList.contains('hidden'); }
  open(withSlash = false) {
    this.api.releaseLock?.();
    this.box.classList.remove('hidden');
    this.input.value = withSlash ? '/' : '';
    setTimeout(() => this.input.focus(), 0);
  }
  close(relock = false) {
    if (!this.isOpen) return;
    this.box.classList.add('hidden');
    this.input.blur();
    this.api.onClose?.(relock);
  }
  msg(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'chat-msg ' + cls;
    d.textContent = text;
    this.log.appendChild(d);
    while (this.log.children.length > 50) this.log.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 12000);
  }
  onKey(e) {
    e.stopPropagation();
    if (e.code === 'Enter') {
      const v = this.input.value.trim();
      if (v) { this.history.unshift(v); if (this.history.length > 100) this.history.pop(); }
      this.close(true); // Enter = kullanıcı hareketi, kilidi geri almayı dene
      if (v) this.dispatch(v);
    } else if (e.code === 'Escape') {
      this.close(false);
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      if (this.history.length) { this.hi = Math.min(this.hi + 1, this.history.length - 1); this.input.value = this.history[this.hi]; }
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      if (this.hi > 0) { this.hi--; this.input.value = this.history[this.hi]; }
      else { this.hi = -1; this.input.value = ''; }
    } else if (e.code === 'Tab') {
      e.preventDefault();
      this.input.value = this.complete(this.input.value);
    }
  }
  complete(v) {
    if (!v.startsWith('/')) return v;
    const parts = v.slice(1).split(/\s+/);
    if (parts.length <= 1) {
      const hit = CMDS.find((c) => c.startsWith(parts[0] || ''));
      return hit ? '/' + hit + ' ' : v;
    }
    if (parts[0] === 'give' && parts.length === 2) {
      const q = parts[1].toLocaleLowerCase();
      const hitB = Object.values(BLOCKS).map((b) => b.ad).find((n) => n.toLocaleLowerCase('tr').startsWith(q));
      if (hitB) return `/give ${hitB} `;
      const hitI = Object.values(ITEMS).map((b) => b.ad).find((n) => n.toLocaleLowerCase('tr').startsWith(q));
      if (hitI) return `/give ${hitI} `;
    }
    return v;
  }
  dispatch(raw) {
    if (!raw.startsWith('/')) { this.msg(`<Oyuncu> ${raw}`); return; }
    const parts = raw.slice(1).trim().split(/\s+/);
    const cmd = (parts.shift() || '').toLowerCase();
    try {
      const out = this.exec(cmd, parts, raw);
      if (out) this.msg(out.text, out.cls || '');
    } catch (err) {
      this.msg('Komut hatası: ' + err.message, 'err');
    }
  }
  exec(cmd, a) {
    const A = this.api;
    switch (cmd) {
      case 'help': {
        const p = a[0] ? +a[0] : 1;
        if (p === 1) return { text: 'Komutlar: /gamemode /give /setblock /tp /time /seed /clear /kill /spawn — /help 2', cls: 'sys' };
        return { text: 'Örn: /give elmas 64 • /gamemode survival • /tp ~ ~10 ~ • /time set night • /setblock ~ ~-1 ~ 3', cls: 'sys' };
      }
      case 'gamemode': {
        const m = (a[0] || '').toLowerCase();
        const mode = m.startsWith('c') || m === '1' ? 'creative' : m.startsWith('s') || m === '0' ? 'survival' : null;
        if (!mode) return { text: 'Kullanım: /gamemode <survival|creative>', cls: 'err' };
        A.setGamemode(mode);
        return { text: 'Oyun modu: ' + mode, cls: 'ok' };
      }
      case 'give': {
        if (!a[0]) return { text: 'Kullanım: /give <blok/eşya> [adet]', cls: 'err' };
        let count = 64;
        let nameParts = a;
        const last = a[a.length - 1];
        if (a.length > 1 && /^-?\d+$/.test(last)) { count = Math.max(1, Math.min(64, +last)); nameParts = a.slice(0, -1); }
        const q = nameParts.join(' ');
        const bid = resolveBlock(q);
        if (bid) {
          if (bid === 16) return { text: 'Su verilemez.', cls: 'err' };
          const ok = A.give(bid, count, 'block');
          return ok
            ? { text: `Verildi: ${BLOCKS[bid].ad} x${count}`, cls: 'ok' }
            : { text: 'Envanter dolu!', cls: 'err' };
        }
        const iid = resolveItem(q);
        if (iid) {
          const ok = A.give(iid, ITEMS[iid]?.tool ? 1 : count, 'item');
          return ok
            ? { text: `Verildi: ${ITEMS[iid].ad} x${ITEMS[iid]?.tool ? 1 : count}`, cls: 'ok' }
            : { text: 'Envanter dolu!', cls: 'err' };
        }
        return { text: 'Blok/eşya bulunamadı: ' + q, cls: 'err' };
      }
      case 'setblock': {
        if (a.length < 4) return { text: 'Kullanım: /setblock <x> <y> <z> <blok>', cls: 'err' };
        const p = A.pos();
        const xyz = [a[0], a[1], a[2]].map((v, i) => {
          const r = num(v, 0);
          if (r && typeof r === 'object') return Math.floor([p.x, p.y, p.z][i] + r.rel);
          if (r === null) return null;
          return Math.floor(r);
        });
        if (xyz.some((v) => v === null)) return { text: 'Koordinat hatalı.', cls: 'err' };
        const id = resolveBlock(a.slice(3).join(' '));
        if (!id && a[3] !== '0') return { text: 'Blok bulunamadı.', cls: 'err' };
        const r = A.setBlock(xyz[0], xyz[1], xyz[2], id);
        return r.ok ? { text: `Blok koyuldu: ${xyz.join(' ')}`, cls: 'ok' } : { text: r.msg, cls: 'err' };
      }
      case 'tp': {
        if (a.length < 3) return { text: 'Kullanım: /tp <x> <y> <z>', cls: 'err' };
        const p = A.pos();
        const xyz = [a[0], a[1], a[2]].map((v, i) => {
          const r = num(v, 0);
          if (r && typeof r === 'object') return [p.x, p.y, p.z][i] + r.rel;
          if (r === null) return null;
          return r;
        });
        if (xyz.some((v) => v === null)) return { text: 'Koordinat hatalı.', cls: 'err' };
        const r = A.tp(xyz[0], xyz[1], xyz[2]);
        return r.ok ? { text: `Işınlanıldı: ${xyz.map((v) => v.toFixed(1)).join(' ')}`, cls: 'ok' } : { text: r.msg, cls: 'err' };
      }
      case 'time': {
        // /time set <day|noon|night|midnight|sayı> | /time (sorgula)
        if (a[0] === 'set' && a[1] !== undefined) {
          const v = a[1].toLowerCase();
          const map = { day: 1000, noon: 6000, sunset: 12000, night: 18000, midnight: 18000, sunrise: 0 };
          const t = map[v] !== undefined ? map[v] : (+v >= 0 && +v < 24000 ? +v : null);
          if (t === null) return { text: 'Kullanım: /time set <day|noon|night|midnight|0-23999>', cls: 'err' };
          A.setTime(t);
          return { text: 'Saat: ' + t, cls: 'ok' };
        }
        return { text: 'Saat: ' + A.getTime(), cls: 'sys' };
      }
      case 'seed': return { text: 'Seed: ' + A.seed(), cls: 'sys' };
      case 'clear': A.clearInv(); return { text: 'Çanta temizlendi.', cls: 'ok' };
      case 'kill': A.kill(); return { text: 'Öldün.', cls: 'sys' };
      case 'spawn': { const r = A.tp(null, null, null, true); return r.ok ? { text: 'Spawn\'a gidildi.', cls: 'ok' } : { text: r.msg, cls: 'err' }; }
      default: return { text: `Bilinmeyen komut: /${cmd} — /help yaz`, cls: 'err' };
    }
  }
}
