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
  let q = String(query).toLowerCase().trim().replace(/^minecraft:/, '');
  if (/^\d+$/.test(q)) {
    const id = +q;
    return BLOCKS[id] ? id : 0;
  }
  // İngilizce takma adlar (Minecraft 1.21.1 uyumlu)
  const EN_BLOCKS = {
    'grass_block': 1, 'grass': 1, 'dirt': 2, 'stone': 3, 'cobblestone': 4,
    'oak_log': 5, 'log': 5, 'wood': 5, 'oak_leaves': 6, 'leaves': 6,
    'oak_planks': 7, 'planks': 7, 'sand': 8, 'glass': 9, 'bedrock': 10,
    'coal_ore': 11, 'iron_ore': 12, 'diamond_ore': 13, 'bricks': 14, 'brick': 14,
    'gravel': 15, 'deepslate': 17, 'snowy_grass': 18, 'snow_block': 19, 'snow': 19,
    'crafting_table': 20, 'workbench': 20, 'torch': 21, 'furnace': 22, 'gold_ore': 23,
    'oak_door': 25, 'door': 25, 'chest': 27,
    'white_wool': 28, 'orange_wool': 29, 'magenta_wool': 30, 'light_blue_wool': 31,
    'yellow_wool': 32, 'lime_wool': 33, 'pink_wool': 34, 'gray_wool': 35,
    'light_gray_wool': 36, 'cyan_wool': 37, 'purple_wool': 38, 'blue_wool': 39,
    'brown_wool': 40, 'green_wool': 41, 'red_wool': 42, 'black_wool': 43, 'wool': 28,
    'terracotta': 44, 'white_terracotta': 45, 'orange_terracotta': 46, 'magenta_terracotta': 47,
    'light_blue_terracotta': 48, 'yellow_terracotta': 49, 'lime_terracotta': 50, 'pink_terracotta': 51,
    'gray_terracotta': 52, 'light_gray_terracotta': 53, 'cyan_terracotta': 54, 'purple_terracotta': 55,
    'blue_terracotta': 56, 'brown_terracotta': 57, 'green_terracotta': 58, 'red_terracotta': 59,
    'black_terracotta': 60, 'white_concrete': 61, 'concrete': 61, 'stone_bricks': 62,
    'mossy_stone_bricks': 63
  };
  if (EN_BLOCKS[q]) return EN_BLOCKS[q];

  for (const [id, b] of Object.entries(BLOCKS)) {
    if ((b.ad || '').toLocaleLowerCase('tr') === q) return +id;
  }
  for (const [id, b] of Object.entries(BLOCKS)) {
    if ((b.ad || '').toLocaleLowerCase('tr').includes(q)) return +id;
  }
  const tex = q.replace(/\s+/g, '_');
  for (const [id, b] of Object.entries(BLOCKS)) {
    const names = [b.all, b.top, b.side, b.bottom, b.front].filter(Boolean);
    if (names.some((n) => n.toLowerCase() === tex || n.toLowerCase().includes(tex))) return +id;
  }
  return 0;
}

export function resolveItem(query) {
  if (query == null) return 0;
  let q = String(query).toLowerCase().trim().replace(/^minecraft:/, '');
  if (/^\d+$/.test(q)) {
    const id = +q;
    return ITEMS[id] ? id : 0;
  }
  // İngilizce takma adlar (Minecraft 1.21.1 uyumlu)
  const EN_ITEMS = {
    'stick': 100, 'coal': 101, 'iron_ingot': 102, 'iron': 102,
    'gold_ingot': 103, 'gold': 103, 'diamond': 104,
    'wooden_pickaxe': 110, 'wood_pickaxe': 110,
    'stone_pickaxe': 111,
    'iron_pickaxe': 112,
    'golden_pickaxe': 113, 'gold_pickaxe': 113,
    'diamond_pickaxe': 114,
    'wooden_shovel': 115, 'wood_shovel': 115,
    'stone_shovel': 116,
    'iron_shovel': 117,
    'golden_shovel': 118, 'gold_shovel': 118,
    'diamond_shovel': 119,
    'wooden_axe': 120, 'wood_axe': 120,
    'stone_axe': 121,
    'iron_axe': 122,
    'golden_axe': 123, 'gold_axe': 123,
    'diamond_axe': 124,
    'wooden_sword': 125, 'wood_sword': 125,
    'stone_sword': 126,
    'iron_sword': 127,
    'golden_sword': 128, 'gold_sword': 128,
    'diamond_sword': 129
  };
  if (EN_ITEMS[q]) return EN_ITEMS[q];

  for (const [id, b] of Object.entries(ITEMS)) {
    if ((b.ad || '').toLocaleLowerCase('tr') === q) return +id;
  }
  for (const [id, b] of Object.entries(ITEMS)) {
    if ((b.ad || '').toLocaleLowerCase('tr').includes(q)) return +id;
  }
  const tex = q.replace(/\s+/g, '_');
  for (const [id, b] of Object.entries(ITEMS)) {
    if ((b.tex || '').toLowerCase() === tex || (b.tex || '').toLowerCase().includes(tex)) return +id;
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
        if (p === 1) return { text: 'Commands: /gamemode /give /setblock /tp /time /seed /clear /kill /spawn — /help 2', cls: 'sys' };
        return { text: 'Examples: /give @p diamond 64 • /gamemode creative • /tp ~ ~10 ~ • /time set day • /setblock ~ ~-1 ~ stone', cls: 'sys' };
      }
      case 'gamemode': {
        const m = (a[0] || '').toLowerCase();
        const mode = m.startsWith('c') || m === '1' ? 'creative' : m.startsWith('s') || m === '0' ? 'survival' : null;
        if (!mode) return { text: 'Usage: /gamemode <survival|creative>', cls: 'err' };
        A.setGamemode(mode);
        return { text: 'Game mode set to: ' + mode, cls: 'ok' };
      }
      case 'give': {
        if (!a[0]) return { text: 'Usage: /give [player] <item> [count]', cls: 'err' };
        let parts = [...a];
        const first = parts[0].toLowerCase();
        if (['@p', '@s', '@a', '@e', 'player', 'oyuncu', 'steve', 'alex'].includes(first)) {
          parts.shift();
        } else if (parts.length >= 2) {
          const r1 = resolveBlock(first) || resolveItem(first);
          if (!r1) {
            const r2 = resolveBlock(parts.slice(1).join(' ')) || resolveItem(parts.slice(1).join(' ')) || resolveBlock(parts[1]) || resolveItem(parts[1]);
            if (r2) parts.shift();
          }
        }
        if (!parts.length) return { text: 'Usage: /give [player] <item> [count]', cls: 'err' };
        let count = 64;
        const last = parts[parts.length - 1];
        if (parts.length > 1 && /^-?\d+$/.test(last)) {
          count = Math.max(1, Math.min(64, +last));
          parts = parts.slice(0, -1);
        }
        const q = parts.join(' ');
        const bid = resolveBlock(q);
        if (bid) {
          if (bid === 16) return { text: 'Cannot give water block directly.', cls: 'err' };
          const ok = A.give(bid, count, 'block');
          return ok
            ? { text: `Gave ${count} [${BLOCKS[bid]?.ad || q}] to player`, cls: 'ok' }
            : { text: 'Inventory is full!', cls: 'err' };
        }
        const iid = resolveItem(q);
        if (iid) {
          const c = ITEMS[iid]?.tool ? 1 : count;
          const ok = A.give(iid, c, 'item');
          return ok
            ? { text: `Gave ${c} [${ITEMS[iid]?.ad || q}] to player`, cls: 'ok' }
            : { text: 'Inventory is full!', cls: 'err' };
        }
        return { text: `Unknown block or item: ${q}`, cls: 'err' };
      }
      case 'setblock': {
        if (a.length < 4) return { text: 'Usage: /setblock <x> <y> <z> <block>', cls: 'err' };
        const p = A.pos();
        const xyz = [a[0], a[1], a[2]].map((v, i) => {
          const r = num(v, 0);
          if (r && typeof r === 'object') return Math.floor([p.x, p.y, p.z][i] + r.rel);
          if (r === null) return null;
          return Math.floor(r);
        });
        if (xyz.some((v) => v === null)) return { text: 'Invalid coordinates.', cls: 'err' };
        const id = resolveBlock(a.slice(3).join(' '));
        if (!id && a[3] !== '0') return { text: 'Unknown block.', cls: 'err' };
        const r = A.setBlock(xyz[0], xyz[1], xyz[2], id);
        return r.ok ? { text: `Block placed at: ${xyz.join(' ')}`, cls: 'ok' } : { text: r.msg, cls: 'err' };
      }
      case 'tp': {
        if (a.length < 3) return { text: 'Usage: /tp <x> <y> <z>', cls: 'err' };
        const p = A.pos();
        const xyz = [a[0], a[1], a[2]].map((v, i) => {
          const r = num(v, 0);
          if (r && typeof r === 'object') return [p.x, p.y, p.z][i] + r.rel;
          if (r === null) return null;
          return r;
        });
        if (xyz.some((v) => v === null)) return { text: 'Invalid coordinates.', cls: 'err' };
        const r = A.tp(xyz[0], xyz[1], xyz[2]);
        return r.ok ? { text: `Teleported to: ${xyz.map((v) => v.toFixed(1)).join(' ')}`, cls: 'ok' } : { text: r.msg, cls: 'err' };
      }
      case 'time': {
        if (a[0] === 'set' && a[1] !== undefined) {
          const v = a[1].toLowerCase();
          const map = { day: 1000, noon: 6000, sunset: 12000, night: 18000, midnight: 18000, sunrise: 0 };
          const t = map[v] !== undefined ? map[v] : (+v >= 0 && +v < 24000 ? +v : null);
          if (t === null) return { text: 'Usage: /time set <day|noon|night|midnight|0-23999>', cls: 'err' };
          A.setTime(t);
          return { text: 'Time set to: ' + t, cls: 'ok' };
        }
        return { text: 'Current time: ' + A.getTime(), cls: 'sys' };
      }
      case 'seed': return { text: 'Seed: ' + A.seed(), cls: 'sys' };
      case 'clear': A.clearInv(); return { text: 'Inventory cleared.', cls: 'ok' };
      case 'kill': A.kill(); return { text: 'Killed player.', cls: 'sys' };
      case 'spawn': { const r = A.tp(null, null, null, true); return r.ok ? { text: 'Teleported to world spawn.', cls: 'ok' } : { text: r.msg, cls: 'err' }; }
      default: return { text: `Unknown command: /${cmd} — type /help`, cls: 'err' };
    }
  }
}
