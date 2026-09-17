import * as THREE from 'three';
import { MIN_Y, MAX_Y, SEA_LEVEL, REACH, EYE, PW, PH, RENDER_DISTANCE, DEFAULT_SEED, SAVE_AUTOSAVE_MS } from './core/config.js';
import { BLOCKS, HOTBAR_DEFAULT, BREAK_TIME } from './world/blocks.js';
import { ITEMS, breakInfo } from './world/items.js';
import { buildAtlas } from './core/atlas.js';
import { ChunkManager } from './world/chunks.js';
import { WorldBorder } from './world/border.js';
import { heightAt } from './world/worldgen.js';
import { hashSeed } from './core/rng.js';
import { dbWorlds, dbPlayers, dbMeta, openDB } from './core/idb.js';
import { InventoryUI } from './ui/inventory.js';
import { ChatUI, resolveBlock } from './ui/chat.js';
import { heartIcons } from './ui/hearts.js';
import { CraftUI } from './ui/craft.js';
import { FurnaceManager, FurnaceUI } from './ui/furnace.js';
import { FallSim, WaterSim } from './world/sim.js';
import { Sky } from './world/sky.js';
import { Effects } from './world/effects.js';

// ============ WORLD META (çoklu dünya: aktif kayıt DB'den okunur) ============
const BUILD = 'v6';
window.__BUILD = BUILD;
try { console.log('%cThree.js Minecraft ' + BUILD, 'font-weight:bold'); } catch {}
try { document.getElementById('buildTag').textContent = BUILD; } catch {}
const urlParams = new URLSearchParams(location.search);
const urlWorld = urlParams.get('world');
const urlSeed = urlParams.get('seed');
let WORLD_ID = urlWorld || 'default';
let WORLD_NAME = 'Dünya';
let SEED_STR = urlSeed || DEFAULT_SEED;
let SEED_NUM = hashSeed(SEED_STR) & 0xffffffff;
let GAMEMODE = 'creative';

// ============ THREE KURULUM (optimize) ============
const canvas = document.getElementById('game');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  // Tarayıcı WebGL context vermedi (çok sekme/yenileme sonrası engellenir).
  // Boş siyah ekran yerine yönlendirmeli hata göster.
  console.error('WebGL oluşturulamadı:', err);
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('menu')?.style.setProperty('display', 'none');
  document.getElementById('webglError')?.classList.remove('hidden');
  throw err;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft yerine hızlı PCF
renderer.shadowMap.autoUpdate = false; // her kare sahneyi 2x çizmemek için (aşağıda throttle)
renderer.shadowMap.needsUpdate = true;
let lastShadowCell = '';
let frameNo = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, RENDER_DISTANCE * 16 * 0.45, RENDER_DISTANCE * 16 * 0.95);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x5f7f4a, 1.0));
const sun = new THREE.DirectionalLight(0xfff6e0, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); // 2048 -> 1024 (2x hız)
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0008;
scene.add(sun); scene.add(sun.target);

// ============ MATERYALLER (atlas sonradan) ============
let chunkManager = null;
let border = null;
let atlas = null;
let matOpaque = null, matTransparent = null, matEmissive = null;
let effects = null;
let sky = null;
const DAY_LENGTH_S = 1200; // tam gün 20 dk (MC gibi), /time ile atlanabilir

// ---- UI durum makinesi: menu (ilk) / pause / overlay / death ----
let hasStarted = false;   // ilk kilit alındı mı
let wantMain = true;      // ana menü mü isteniyor (pause değil)
let worldReady = false;

// ============ OYUNCU ============
const player = {
  pos: new THREE.Vector3(8.5, 80, 8.5),
  vel: new THREE.Vector3(),
  yaw: Math.PI * 0.25, pitch: -0.1,
  onGround: false, flying: false,
  health: 20, dead: false, fallStart: 80,
};
let timeOfDay = 6000; // 0-23999, 6000 öğle
const WATER_FOG = new THREE.Color(0x144a8f); // su altı fog rengi
let headUnderwater = false;
const keys = {};
let locked = false;
let inventory = null;
let chat = null;
let craftInv = null;   // envanter içi 2x2
let craftTable = null; // masa 3x3
let furnaceMgr = new FurnaceManager();
let furnaceUI = null;
const fallSim = new FallSim();
const waterSim = new WaterSim();
let waterTickAcc = 0;

// Meşale ışık takibi: koyulan/kırılan meşaleler + sarı ışık havuzu
const torchSet = new Set(); // "x,y,z"
const torchLights = [];
let torchScanT = 0;
let furnTickAcc = 0;
let furnDirty = false;
const tkey = (x, y, z) => x + ',' + y + ',' + z;
function trackTorch(x, y, z, id) {
  if (id === 21) torchSet.add(tkey(x, y, z));
  else torchSet.delete(tkey(x, y, z));
}
function updateTorchLights() {
  // oyuncuya en yakın max 5 meşaleye sarı ışık ata
  const px = player.pos.x, py = player.pos.y + 1, pz = player.pos.z;
  const near = [];
  for (const k of torchSet) {
    if (near.length > 400 && torchSet.size > 2000) break; // güvenlik
    const [x, y, z] = k.split(',').map(Number);
    const d2 = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 + (z + 0.5 - pz) ** 2;
    if (d2 < 30 * 30) near.push([d2, x, y, z]);
  }
  near.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < torchLights.length; i++) {
    const L = torchLights[i];
    if (i < near.length) {
      L.position.set(near[i][1] + 0.5, near[i][2] + 0.7, near[i][3] + 0.5);
      L.intensity = 26; // sıcak sarı, karanlığı deler
    } else L.intensity = 0;
  }
}

function spawnPos() {
  // Suda doğma yok: önce (8,8), yoksa spiral kara ara (deterministik, seed'e bağlı).
  const h0 = heightAt(8, 8, SEED_STR);
  if (h0 > SEA_LEVEL && h0 < 120) return new THREE.Vector3(8.5, h0 + 2, 8.5);
  for (let r = 16; r <= 256; r += 16) {
    for (let a = 0; a < 12; a++) {
      const x = 8 + Math.round(Math.cos((a / 12) * Math.PI * 2) * r);
      const z = 8 + Math.round(Math.sin((a / 12) * Math.PI * 2) * r);
      const h = heightAt(x, z, SEED_STR);
      if (h > SEA_LEVEL && h < 110) return new THREE.Vector3(x + 0.5, h + 2, z + 0.5);
    }
  }
  // Kara bulunamazsa (ağır okyanus seed'i): en yüksek halka noktasına düş
  let best = { h: h0, x: 8, z: 8 };
  for (let r = 16; r <= 256; r += 16) {
    for (let a = 0; a < 12; a++) {
      const x = 8 + Math.round(Math.cos((a / 12) * Math.PI * 2) * r);
      const z = 8 + Math.round(Math.sin((a / 12) * Math.PI * 2) * r);
      const h = heightAt(x, z, SEED_STR);
      if (h > best.h) best = { h, x, z };
    }
  }
  return new THREE.Vector3(best.x + 0.5, best.h + 2, best.z + 0.5);
}

function getBlock(x, y, z) { return chunkManager ? chunkManager.getBlock(x, y, z) : 0; }
function solidAt(x, y, z) {
  const id = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  if (!id) return false;
  if (id === 16 || id === 21) return false; // su ve meşale katı değil (içinden geçilir)
  return true;
}
function inWater(px, py, pz) { return getBlock(Math.floor(px), Math.floor(py + 0.4), Math.floor(pz)) === 16; }
function collides(px, py, pz) {
  for (const dx of [-PW, PW]) for (const dz of [-PW, PW]) for (const dy of [0, 0.9, PH - 0.1]) {
    if (solidAt(px + dx, py + dy, pz + dz)) return true;
  }
  return false;
}

function movePlayer(dt) {
  // border clamp
  if (border) {
    if (border.clamp(player.pos)) { /* duvara vurdu */ }
  }
  const speed = player.flying ? 12 : (keys['ShiftLeft'] || keys['ShiftRight'] ? 8 : 4.5);
  const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const s = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let dx = (-sin * f + cos * s), dz = (-cos * f - sin * s);
  const len = Math.hypot(dx, dz) || 1;
  dx = dx / len * speed * dt; dz = dz / len * speed * dt;
  if (!collides(player.pos.x + dx, player.pos.y, player.pos.z)) player.pos.x += dx;
  if (!collides(player.pos.x, player.pos.y, player.pos.z + dz)) player.pos.z += dz;

  const water = inWater(player.pos.x, player.pos.y, player.pos.z);

  if (player.flying) {
    player.vel.y = 0;
    if (keys['Space']) player.pos.y += 10 * dt;
    if (keys['ShiftLeft']) player.pos.y -= 10 * dt;
    // uçarken çarpışma: yukarı/aşağı da kontrol
    if (collides(player.pos.x, player.pos.y, player.pos.z)) {
      if (keys['Space']) player.pos.y -= 10 * dt;
      if (keys['ShiftLeft']) player.pos.y += 10 * dt;
    }
    if (player.pos.y > MAX_Y + 10) player.pos.y = MAX_Y + 10;
    if (player.pos.y < MIN_Y + 1) player.pos.y = MIN_Y + 1;
    player.onGround = false;
    return;
  }

  player.vel.y -= (water ? 8 : 28) * dt;
  if (player.vel.y < (water ? -6 : -40)) player.vel.y = (water ? -6 : -40);
  if (keys['Space']) {
    if (water) player.vel.y = 5;
    else if (player.onGround) player.vel.y = 9;
  }
  if (player.onGround) player.fallStart = player.pos.y;
  const ny = player.pos.y + player.vel.y * dt;
  player.onGround = false;
  if (collides(player.pos.x, ny, player.pos.z)) {
    if (player.vel.y <= 0) {
      player.pos.y = Math.floor(ny) + 1;
      let guard = 0;
      while (collides(player.pos.x, player.pos.y, player.pos.z) && guard++ < 8)
        player.pos.y = Math.floor(player.pos.y) + 1;
      player.onGround = true;
      // düşme hasarı (survival, suya düşmede yok). MC: 4 blok=1 kalp
      const drop = player.fallStart - player.pos.y;
      player.fallStart = player.pos.y;
      if (drop > 3 && GAMEMODE === 'survival' && !player.dead && !inWater(player.pos.x, player.pos.y, player.pos.z)) {
        damage(Math.floor(drop - 3), 'Yüksekten düştün');
      }
    } else {
      player.pos.y = Math.floor(ny + PH) - PH - 0.001;
    }
    player.vel.y = 0;
  } else player.pos.y = ny;

  if (player.pos.y < MIN_Y - 20) { // void
    if (GAMEMODE === 'survival' && !player.dead) { kill('Boşluğa düştün'); }
    else { player.pos.copy(spawnPos()); player.vel.set(0, 0, 0); }
  }
  if (player.pos.y > MAX_Y + 30) player.pos.y = MAX_Y + 30;
}

// ============ CAN / ÖLÜM / GAMEMODE ============
function updateHearts() {
  const el = document.getElementById('hearts');
  if (!el) return;
  if (GAMEMODE !== 'survival') { el.innerHTML = ''; return; }
  // MC tarzı piksel kalpler (10 slot, yarım kalp destekli)
  const H = heartIcons();
  let html = '';
  for (let i = 0; i < 10; i++) {
    const hp = player.health - i * 2;
    const src = hp >= 2 ? H.full : hp >= 1 ? H.half : H.empty;
    html += `<img class="hh" src="${src}" alt="">`;
  }
  el.innerHTML = html;
}
function hurtFlash() {
  const el = document.getElementById('hearts');
  if (!el) return;
  el.classList.remove('hurt');
  void el.offsetWidth; // animasyonu yeniden tetikle
  el.classList.add('hurt');
  clearTimeout(hurtFlash._t);
  hurtFlash._t = setTimeout(() => el.classList.remove('hurt'), 220);
}
function updateModeBadge() {
  const el = document.getElementById('modeBadge');
  if (el) el.textContent = GAMEMODE === 'creative' ? 'YARATICI' : 'HAYATTA KALMA';
  // 2x2 üretim ızgarası sadece survival'da (MC kuralı)
  const cw = document.getElementById('craft2Wrap');
  if (cw) cw.style.display = GAMEMODE === 'survival' ? '' : 'none';
}
function damage(n, reason) {
  if (GAMEMODE !== 'survival' || player.dead || n <= 0) return;
  player.health -= n;
  updateHearts();
  hurtFlash();
  if (player.health <= 0) kill(reason);
}
function kill(reason = 'Öldün') {
  if (player.dead) return;
  if (GAMEMODE !== 'survival') { toast('Yaratıcı modda ölmezsin'); return; }
  player.dead = true;
  player.health = 0;
  updateHearts();
  hideBreakBar();
  effects?.hideCrack();
  document.exitPointerLock?.();
  document.getElementById('deathMsg').textContent = reason;
  document.getElementById('deathScreen').classList.remove('hidden');
  refreshMenus();
}
function respawn() {
  player.pos.copy(spawnPos());
  player.vel.set(0, 0, 0);
  player.health = 20; player.dead = false;
  player.fallStart = player.pos.y;
  updateHearts();
  document.getElementById('deathScreen').classList.add('hidden');
  tryLock();
}
async function setGamemode(mode) {
  const prev = GAMEMODE;
  GAMEMODE = mode === 'survival' ? 'survival' : 'creative';
  if (GAMEMODE === 'survival') { player.flying = false; if (player.health <= 0) player.health = 20; }
  updateHearts(); updateModeBadge();
  inventory?.setMode(GAMEMODE);
  // Mod değişince envanter sıfırlanır (MC kararı: seçim = boş başlangıç)
  if (prev !== GAMEMODE && inventory) {
    inventory.hotbar = new Array(10).fill(null);
    inventory.main = new Array(27).fill(null);
    inventory.cursor = null;
    selected = 0; inventory.sel = 0;
    inventory.renderAll();
  }
  renderHotbar();
  if (prev !== GAMEMODE) toast(GAMEMODE === 'survival' ? 'Hayatta Kalma: kalpler aktif, dikkatli ol!' : 'Yaratıcı: uçma (F), eksilmeyen blok');
  try {
    const w = await dbWorlds.get(WORLD_ID);
    if (w) { w.gamemode = GAMEMODE; w.lastPlayed = Date.now(); await dbWorlds.put(w); }
  } catch {}
  const seedEl2 = document.getElementById('seedInfo');
  if (seedEl2) seedEl2.textContent = `${WORLD_NAME} | Seed: ${SEED_STR} | Y: ${MIN_Y}..${MAX_Y} | Border: ±250k | ${GAMEMODE}`;
  saveAll();
}

// ============ RAYCAST (DDA, chunkManager üzerinden) ============
function raycastVoxel(origin, dir, maxDist) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
  const tDeltaX = stepX ? Math.abs(1 / (dir.x || 1e-9)) : Infinity;
  const tDeltaY = stepY ? Math.abs(1 / (dir.y || 1e-9)) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / (dir.z || 1e-9)) : Infinity;
  let tMaxX = stepX ? (stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX : Infinity;
  let tMaxY = stepY ? (stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ ? (stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 256; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    if (t > maxDist) return null;
    if (y < MIN_Y || y > MAX_Y) continue;
    const id = getBlock(x, y, z);
    if (id && id !== 16) return { x, y, z, nx, ny, nz, id };
  }
  return null;
}

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 1.0, 1.0)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
);
highlight.visible = false;
scene.add(highlight);
// Seçim çerçevesi kapalı: kare çizen tek mekanizma buydu, istek üzerine devre dışı.
// Kırma/koyma raycast ile çalışır, oyuna etkisi yok. Geri açmak için true yap.
// (MC Java'da bu çerçeve vardır; istersen tek satırla döner.)
const SHOW_SELECTION = false;
const DBG_NOHIGHLIGHT = urlParams.get('debug') === 'nohighlight';
const DBG_NOSHADOW = urlParams.get('debug') === 'noshadow';
if (DBG_NOSHADOW) {
  try { renderer.shadowMap.enabled = false; } catch {}
  try { sun.castShadow = false; } catch {}
}

// ============ BULUTLAR (yüksekte, Y=190) ============
const clouds = new THREE.Group();
{
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, fog: false });
  for (let i = 0; i < 14; i++) {
    const w = 8 + Math.random() * 12;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, 6 + Math.random() * 8), cm);
    m.position.set(8 + Math.random() * 96 - 48, 185 + Math.random() * 12, 8 + Math.random() * 96 - 48);
    clouds.add(m);
  }
  scene.add(clouds);
}

// ============ HOTBAR (envantere bağlı, atlas'tan tint'li ikon) ============
let selected = 0;
const hotbarEl = document.getElementById('hotbar');
const selNameEl = document.getElementById('selected-name');
const iconCache = {};
function iconFor(id, kind = null) {
  const k = kind || (id >= 100 ? 'item' : 'block');
  if (k === 'item') {
    const t = ITEMS[id]?.tex || 'stick';
    return `textures/${t}.png`;
  }
  return sideIcon(id);
}
function sideIcon(id) {
  if (!id || !BLOCKS[id]) return '';
  if (iconCache[id]) return iconCache[id];
  try {
    // atlas hazırsa tint'li kare üret (yaprak gri -> yeşil, su mavi)
    const b = BLOCKS[id];
    const texName = b.all ?? b.side;
    const rect = atlas?.uvMap?.[texName];
    if (atlas && rect) {
      const TINTS2 = { grass_block_top: '#BBF66D', oak_leaves: '#4daf2e', water_still: '#3d6fe0' };
      const src = atlas.canvas;
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const sx = rect.u0 * src.width, sy = (1 - rect.v1) * src.height;
      const sw = (rect.u1 - rect.u0) * src.width, sh = (rect.v1 - rect.v0) * src.height;
      g.drawImage(src, sx, sy, sw, sh, 0, 0, 32, 32);
      const tint = TINTS2[texName];
      if (tint) {
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = 32;
        const tg = tmp.getContext('2d'); tg.drawImage(c, 0, 0);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, 32, 32);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(tmp, 0, 0);
        g.globalCompositeOperation = 'source-over';
      }
      const url = c.toDataURL();
      iconCache[id] = url;
      return url;
    }
  } catch {}
  const b = BLOCKS[id];
  const t = b.all ?? b.side;
  return `textures/${t}.png`;
}
function selectedId() { return inventory ? inventory.selectedId() : (HOTBAR_DEFAULT[selected] || 0); }
function selectedToolId() { return inventory ? inventory.selectedToolId() : 0; }
function slotName(s) {
  if (!s) return 'Boş';
  const k = s.kind || (s.id >= 100 ? 'item' : 'block');
  if (k === 'item') return ITEMS[s.id]?.ad || 'Eşya';
  return BLOCKS[s.id]?.ad || 'Boş';
}
function syncSelected() {
  selected = inventory ? inventory.sel : selected;
}
function renderHotbar() {
  syncSelected();
  hotbarEl.innerHTML = '';
  const hb = inventory ? inventory.hotbar : HOTBAR_DEFAULT.map((id) => ({ kind: 'block', id, count: 64 }));
  hb.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'slot' + (i === selected ? ' selected' : '');
    const id = s?.id;
    const kind = s ? (s.kind || (s.id >= 100 ? 'item' : 'block')) : null;
    const label = s ? slotName(s) : 'Boş';
    const cnt = s && s.count > 1 ? `<span class="cnt2">${s.count}</span>` : '';
    let dur = '';
    if (kind === 'item' && ITEMS[id]?.tool) {
      const max = ITEMS[id].maxDur, cur = s.dur ?? max;
      const f = Math.max(0, Math.min(1, cur / max));
      const col = f > 0.6 ? '#5dd65d' : f > 0.25 ? '#e6c832' : '#e03232';
      dur = `<div class="dur"><div class="dur-fill" style="width:${f * 100}%;background:${col}"></div></div>`;
    }
    // MC tarzı: numara rozeti yok, sadece ikon + adet + dayanıklılık
    d.innerHTML = (id ? `<img src="${iconFor(id, kind)}" alt="${label}" title="${label}">${cnt}${dur}` : '');
    d.onclick = () => {
      selected = i;
      if (inventory) { inventory.sel = i; inventory.renderHot(); }
      renderHotbar();
    };
    hotbarEl.appendChild(d);
  });
  const sel = inventory ? inventory.selectedSlot() : null;
  const sid = selectedId();
  const tid = selectedToolId();
  if (sel && (sel.kind || (sel.id >= 100 ? 'item' : 'block')) === 'item') selNameEl.textContent = ITEMS[sel.id]?.ad || '';
  else selNameEl.textContent = sid && BLOCKS[sid] ? BLOCKS[sid].ad : '';
  clearTimeout(renderHotbar._t);
  renderHotbar._t = setTimeout(() => selNameEl.textContent = '', 1500);
}

// ============ KAYIT (IndexedDB) ============
async function saveAll() {
  try {
    if (!chunkManager) return;
    await chunkManager.persistAllDirty();
    await dbPlayers.put({
      worldId: WORLD_ID,
      pos: [player.pos.x, player.pos.y, player.pos.z],
      yaw: player.yaw, pitch: player.pitch,
      gamemode: GAMEMODE, selected,
      inv: inventory ? inventory.serialize() : null,
      health: player.health, time: Math.floor(timeOfDay),
      furnaces: furnaceMgr ? furnaceMgr.serialize() : null,
    });
    const prev = await dbWorlds.get(WORLD_ID).catch(() => null);
    await dbWorlds.put({
      id: WORLD_ID, name: prev?.name || WORLD_NAME || 'Dünya', seed: SEED_STR,
      gamemode: GAMEMODE, lastPlayed: Date.now(), createdAt: prev?.createdAt || Date.now(),
    });
  } catch {}
}

// ============ OLAYLAR + UI DURUMU ============
const menu = document.getElementById('menu');
const pauseEl = document.getElementById('pauseMenu');
function deathHidden() { return document.getElementById('deathScreen').classList.contains('hidden'); }
function anyOverlay() {
  return (inventory && inventory.isOpen) || (chat && chat.isOpen) || (craftTable && craftTable.isOpen) || (furnaceUI && furnaceUI.isOpen) || !deathHidden();
}
function dropOverflowAtPlayer(id, count, kind = null) {
  // çanta dolunca üretilenler yere düşer (blok+eşya)
  const k = kind || (id >= 100 ? 'item' : 'block');
  for (let i = 0; i < count; i++)
    effects?.spawnDrop(id, Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z), null, k);
}
// Masa/fırın panelindeki ayna envanter (27+10, MC sırasıyla). Aynı state'i kullanır:
// tıklama/sürükleme ana paneldekiyle birebir çalışır.
function renderTableInv() {
  const tm = document.getElementById('tableMain');
  const th = document.getElementById('tableHot');
  if (!tm || !th || !inventory) return;
  tm.innerHTML = '';
  inventory.main.forEach((s, i) => tm.appendChild(inventory.slotEl(s, 'main', i)));
  th.innerHTML = '';
  inventory.hotbar.forEach((s, i) => th.appendChild(inventory.slotEl(s, 'hot', i)));
}
function renderFurnaceInv() {
  try { furnaceUI?.renderInv(); } catch {}
}
function openTable() {
  if (!craftTable || player.dead) return;
  try { furnaceUI?.close(); } catch {}
  document.exitPointerLock?.();
  craftTable.open();
  renderTableInv();
  refreshMenus();
}
function closeTable(returnItems = true) {
  if (!craftTable || !craftTable.isOpen) return;
  craftTable.close(returnItems);
  renderHotbar();
  if (!player.dead) tryLock(); else refreshMenus();
}
function openFurnace(x, y, z) {
  if (!furnaceUI || player.dead) return;
  try { craftTable?.close(true); } catch {}
  try { inventory?.close(); } catch {}
  document.exitPointerLock?.();
  furnaceUI.open(x, y, z);
  refreshMenus();
}
function closeFurnace() {
  if (!furnaceUI || !furnaceUI.isOpen) return;
  furnaceUI.close();
  renderHotbar();
  if (!player.dead) tryLock(); else refreshMenus();
}
// Hangi menü görünsün? İlk açılışta ana menü, sonrasında pause menüsü.
// Böylece oyundayken bir tuş ana menüye fırlatmaz.
function refreshMenus() {
  if (!worldReady) {
    // Boot: logo+menü görünür, pause gizli. Geçiş sırasında: hepsi gizli (yükleme kaplar).
    // DÜZELTME: booted sonrası menü gizlenmeyecek — aksine her zaman görünür olacak.
    // Yükleme ekranı açıksa menü arkada kalabilir, ama display:none yapılmaz.
    const loadingOpen = !document.getElementById('loading')?.classList.contains('hidden');
    menu.style.display = loadingOpen && booted ? 'none' : 'flex';
    pauseEl?.classList.add('hidden');
    return;
  }
  const showMain = !locked && !player.dead && !anyOverlay() && (!hasStarted || wantMain);
  const showPause = !locked && !player.dead && !anyOverlay() && hasStarted && !wantMain;
  lockDbg(`menü kararı: main=${showMain} pause=${showPause} (kilit=${locked} başladı=${hasStarted} anaMenü=${wantMain})`);
  menu.style.display = showMain ? 'flex' : 'none';
  pauseEl?.classList.toggle('hidden', !showPause);
}
function tryLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch((err) => { lockDbg('kilit reddi: ' + (err && err.message ? err.message : err)); refreshMenus(); });
    else setTimeout(refreshMenus, 60);
  } catch (err) { lockDbg('kilit hatası: ' + err); refreshMenus(); }
}
// ?debug=lock: kilit + menü karar günlüğü (ana menüye atma teşhisi)
function lockDbg(t) {
  try {
    console.log('[lock]', t);
    const el = document.getElementById('lockDebug');
    if (!el) return;
    const d = document.createElement('div');
    d.textContent = `${new Date().toLocaleTimeString('tr-TR')}: ${t}`;
    el.prepend(d);
    while (el.children.length > 10) el.lastChild.remove();
  } catch {}
}
document.getElementById('playBtn').onclick = async () => {
  wantMain = false;
  if (!worldReady) {
    // Menüden ilk giriş: aktif dünyayı yükle (ağır iş sadece burada)
    let id = WORLD_ID;
    try { id = (await dbMeta.get('active-world', null)) || WORLD_ID; } catch {}
    enterWorld(id);
  } else tryLock();
};
document.getElementById('resumeBtn').onclick = () => { wantMain = false; tryLock(); };
document.getElementById('toMainBtn').onclick = () => { wantMain = true; refreshMenus(); };
document.getElementById('respawnBtn2').onclick = () => {
  player.pos.copy(spawnPos()); player.vel.set(0, 0, 0);
  wantMain = false; tryLock();
};
// Canvas'a tıklayınca kilidi geri al (envanter/sohbet kapandıktan sonra takılmayı önler)
canvas.addEventListener('click', () => {
  if (!worldReady || locked || player.dead || anyOverlay()) return;
  wantMain = false;
  tryLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  lockDbg(locked ? 'kilit ALINDI' : 'kilit BIRAKILDI');
  if (locked) { hasStarted = true; wantMain = false; }
  else { mouseL = false; mouseR = false; placeCd = 0; hideBreakBar(); effects?.hideCrack(); }
  refreshMenus();
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0025;
  player.pitch -= e.movementY * 0.0025;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.55, 1.55);
});
function typingTarget(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}
function toggleInventory() {
  if (!inventory) return;
  if (inventory.isOpen) {
    try { craftInv?.close(true); } catch {}
    inventory.close();
    // E ile kapatınca oyuna dönüşü dene (başarısızsa pause menüsü gelir)
    if (!player.dead) tryLock(); else refreshMenus();
  }
  else {
    if (player.dead) return;
    document.exitPointerLock?.();
    inventory.open(GAMEMODE);
    refreshMenus();
  }
}
document.addEventListener('keydown', (e) => {
  if (chat && chat.isOpen) return; // sohbet kendi tuşlarını yönetir
  if (typingTarget(e)) { if (e.code !== 'Escape') return; }
  if (e.code === 'Escape' && inventory && inventory.isOpen) { toggleInventory(); return; }
  if (e.code === 'Escape' && craftTable && craftTable.isOpen) { closeTable(true); return; }
  if (e.code === 'Escape' && furnaceUI && furnaceUI.isOpen) { closeFurnace(); return; }
  keys[e.code] = true;
  // Kilit yoksa oyun tuşları çalışmaz (envanter/masa/fırın açıkken E/Esc hariç).
  // Böylece kilitsizken basılan tuşlar oyunun durumunu bozamaz.
  if (!locked && !(inventory && inventory.isOpen) && !(craftTable && craftTable.isOpen) && !(furnaceUI && furnaceUI.isOpen)) {
    if (e.code.startsWith('Digit') || e.code === 'KeyQ' || e.code === 'KeyT' || e.code === 'Slash' || e.code === 'Space') {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
  }
  if (e.code.startsWith('Digit')) {
    const n = e.code === 'Digit0' ? 10 : +e.code.slice(5);
    if (n >= 1 && n <= 10) {
      selected = n - 1;
      if (inventory) { inventory.sel = selected; inventory.renderHot(); }
      renderHotbar();
    }
  }
  if (e.code === 'KeyE') {
    if (craftTable && craftTable.isOpen) closeTable(true);
    else if (furnaceUI && furnaceUI.isOpen) closeFurnace();
    else if (locked || (inventory && inventory.isOpen)) toggleInventory();
  }
  if (e.code === 'KeyH') document.getElementById('helpPanel').classList.toggle('hidden');
  if (e.code === 'KeyT' && locked && !player.dead) { e.preventDefault(); chat?.open(false); }
  if (e.code === 'Slash' && locked && !player.dead) { e.preventDefault(); chat?.open(true); }
    if (e.code === 'Space' && !e.repeat && locked && !player.dead && GAMEMODE === 'creative' && !anyOverlay()) {
    // MC: yaratıcıda çift-Space uçmayı açar/kapatır (basılı tutma sayılmaz)
    const now = performance.now();
    if (now - lastSpaceT < DOUBLE_SPACE_MS) {
      lastSpaceT = 0;
      player.flying = !player.flying;
      player.vel.y = 0;
      toast(player.flying ? 'Uçma açık' : 'Uçma kapalı');
    } else lastSpaceT = now;
  }
  if (e.code === 'KeyQ' && locked && !player.dead && chunkManager) {
    // MC gibi seçili slot'tan 1 tane yere at (blok+eşya, iki modda da).
    // Yaratıcıda envanter eksilmez, hayatta kalmada 1 eksilir.
    const sel = inventory?.selectedSlot();
    if (sel) {
      const sk = sel.kind || (sel.id >= 100 ? 'item' : 'block');
      const isTool = sk === 'item' && ITEMS[sel.id]?.tool;
      if (isTool && GAMEMODE === 'creative') {
        effects?.spawnDrop(sel.id, Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z), new THREE.Vector3(0, 4, 0), sk, sel.dur);
        renderHotbar();
      } else if (isTool) {
        inventory.hotbar[inventory.sel] = null;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const eye = player.pos.clone(); eye.y += EYE;
        effects?.spawnDrop(sel.id, Math.floor(eye.x + dir.x), Math.floor(eye.y), Math.floor(eye.z + dir.z), new THREE.Vector3(dir.x * 6, 2.5, dir.z * 6), sk, sel.dur);
        inventory.renderHot();
        inventory.onChange();
      } else if (GAMEMODE === 'creative' || inventory.consumeSelected()) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const eye = player.pos.clone(); eye.y += EYE;
        effects?.spawnDrop(sel.id, Math.floor(eye.x + dir.x), Math.floor(eye.y), Math.floor(eye.z + dir.z),
          new THREE.Vector3(dir.x * 6, 2.5, dir.z * 6), sk);
        renderHotbar();
      }
    }
  }
    if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('wheel', (e) => {
  if (!locked || !inventory) return;
  const len = inventory.hotbar.length;
  selected = (selected + (e.deltaY > 0 ? 1 : -1) + len) % len;
  inventory.sel = selected; inventory.renderHot();
  renderHotbar();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('closeHelp').onclick = () => document.getElementById('helpPanel').classList.add('hidden');
document.getElementById('respawnBtn').onclick = () => respawn();

function playerInside(x, y, z) {
  const minX = player.pos.x - PW, maxX = player.pos.x + PW;
  const minY = player.pos.y, maxY = player.pos.y + PH;
  const minZ = player.pos.z - PW, maxZ = player.pos.z + PW;
  return x + 1 > minX && x < maxX && y + 1 > minY && y < maxY && z + 1 > minZ && z < maxZ;
}
// basılı-tutarak kırma (survival) + basılı-tutup koyma (MC gibi) durumu
let mouseL = false;
let mouseR = false;
let placeCd = 0;
let creativeBreakCd = 0;
const PLACE_INTERVAL = 0.2; // MC hissi: sn'de ~5 blok
const CREATIVE_BREAK_INTERVAL = 0.05; // yaratıcıda neredeyse anında (MC)
let breakTarget = null; // "x,y,z"
let breakProg = 0;
let lastSpaceT = 0; // çift-Space uçma takibi (MC)
const DOUBLE_SPACE_MS = 300;
function hideBreakBar() {
  breakTarget = null; breakProg = 0;
  document.getElementById('breakBar')?.classList.add('hidden');
  try { effects?.hideCrack(); } catch {}
}
function heldToolId() { return inventory ? inventory.selectedToolId() : 0; }
// Blok fiziği kancası: her setBlock (koyma/kırma/komut/su/fizik) burayı besler.
// getSafe: yüklenmemiş chunk = -1 (katı sayılır, boşluğa akma yok).
function simGet(x, y, z) {
  if (!chunkManager) return -1;
  const v = chunkManager.getBlockOrUnknown(x, y, z);
  return v === null ? -1 : v;
}
function handleBlockEdit(x, y, z) {
  fallSim.pushColumn(x, y, z);
  waterSim.pushNeighbors(x, y, z);
}
function simHooks() {
  return {
    getBlock: simGet,
    setBlock: (x, y, z, id) => chunkManager.setBlock(x, y, z, id),
    isLoaded: (x, y, z) => {
      try { return chunkManager.chunks.has(Math.floor(x / 16) + ',' + Math.floor(z / 16)); }
      catch { return false; }
    },
    scene,
    tileMaterial: (id) => fallTileMaterial(id),
    // MC: meşaleye inen kum/çakıl eşya olur, MEŞALE YERİNDE KALIR (çiftlikler buna güvenir)
    onTorchCrush: (x, y, z, id) => {
      effects?.spawnDrop(id, x, y, z);
    },
    spawnDrop: (id, x, y, z) => effects?.spawnDrop(id, x, y, z),
  };
}
// Düşen kum/çakıl görseli: blok dokulu malzeme (dokubaşı önbellekli)
const fallTileMatCache = {};
function fallTileMaterial(id) {
  if (!fallTileMatCache[id]) {
    const b = BLOCKS[id];
    const texName = b.all ?? b.side;
    const rect = atlas?.uvMap?.[texName] || atlas?.uvMap?.['stone'];
    const src = atlas.canvas;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, rect.u0 * src.width, (1 - rect.v1) * src.height,
      (rect.u1 - rect.u0) * src.width, (rect.v1 - rect.v0) * src.height, 0, 0, 16, 16);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    fallTileMatCache[id] = new THREE.MeshLambertMaterial({ map: t });
  }
  return fallTileMatCache[id];
}
function breakInstant(hit) {
  // Yaratıcıda anakaya dahil her şey kırılır (MC). Hayatta kalmada asla.
  if (hit.id === 10 && GAMEMODE !== 'creative') { toast('Anakaya kırılmaz!'); return; }
  const bid = chunkManager.getBlock(hit.x, hit.y, hit.z);
  const realId = bid || hit.id;
  chunkManager.setBlock(hit.x, hit.y, hit.z, 0);
  trackTorch(hit.x, hit.y, hit.z, 0); // kırılan meşale ışık listesinden düşer
  if (realId === 22 || realId === 24) {
    // Fırın kırılınca içi yere saçılır + sönmüş blok düşer (MC)
    try {
      const st = furnaceMgr.get(hit.x, hit.y, hit.z);
      for (const slot of [st.input, st.fuel, st.output]) {
        if (slot) {
          const sk = slot.kind || (slot.id >= 100 ? 'item' : 'block');
          for (let i = 0; i < slot.count; i++) effects?.spawnDrop(slot.id, hit.x, hit.y, hit.z, null, sk);
        }
      }
    } catch {}
    furnaceMgr.remove(hit.x, hit.y, hit.z);
    try { if (furnaceUI?.pos && furnaceUI.pos.x === hit.x && furnaceUI.pos.y === hit.y && furnaceUI.pos.z === hit.z) furnaceUI.close(); } catch {}
  }
  effects?.burst(hit.x, hit.y, hit.z, realId);
  if (GAMEMODE === 'survival' && realId !== 16 && BLOCKS[realId] && !BLOCKS[realId].secilemez) {
    const tool = heldToolId();
    const info = breakInfo(realId, tool);
    if (info.drops) {
      // MC: çim/karlı çim -> toprak; taş -> kırık taş; cevherler eşya düşürür
      if (realId === 1 || realId === 18) effects?.spawnDrop(2, hit.x, hit.y, hit.z); // toprak
      else if (realId === 3) effects?.spawnDrop(4, hit.x, hit.y, hit.z); // kırık taş
      else if (realId === 11) effects?.spawnDrop(101, hit.x, hit.y, hit.z, null, 'item'); // kömür
      else if (realId === 12) effects?.spawnDrop(105, hit.x, hit.y, hit.z, null, 'item'); // ham demir
      else if (realId === 23) effects?.spawnDrop(106, hit.x, hit.y, hit.z, null, 'item'); // ham altın
      else if (realId === 13) effects?.spawnDrop(104, hit.x, hit.y, hit.z, null, 'item'); // elmas
      else if (realId === 24) effects?.spawnDrop(22, hit.x, hit.y, hit.z); // yanık fırın -> sönmüş fırın
      else effects?.spawnDrop(realId, hit.x, hit.y, hit.z); // yerden toplanır
    }
    // Alet yıpranması (sadece doğru/yanlış fark etmez, her kırışta 1)
    if (tool) {
      const broke = inventory.damageHeldTool(1);
      if (broke) toast('Aletin kırıldı!');
      renderHotbar();
    }
  }
  hideBreakBar();
  effects?.hideCrack();
}
function tryPlaceFromCross() {
  // MC gibi nişangâhtan blok koy. 'table'/'furnace' dönerse panel açıldı (tutmayı bırak).
  if (!chunkManager || player.dead) return 'none';
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const eye = player.pos.clone(); eye.y += EYE;
  const hit = raycastVoxel(eye, dir, REACH);
  if (!hit) return 'none';
  if (hit.id === 20) { openTable(); return 'table'; } // çalışma masası: yerleştirme değil panel
  if (hit.id === 22 || hit.id === 24) { openFurnace(hit.x, hit.y, hit.z); return 'furnace'; } // fırın paneli
  const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
  if (py < MIN_Y || py > MAX_Y) { toast('Yükseklik sınırı!'); return 'none'; }
  const cur = chunkManager.getBlock(px, py, pz);
  if (cur !== 0 && cur !== 16 && cur !== 21) return 'none'; // hava/su/meşale üstüne kurulur
  if (playerInside(px, py, pz)) return 'none';
  const id = selectedId();
  if (!id) {
    const sel = inventory?.selectedSlot();
    if (sel && (sel.kind || 'block') === 'item') { toast('Alet yerleştirilemez!'); return 'none'; }
    toast('Hotbar boş! (E ile blok al)');
    return 'none';
  }
  // Meşale desteği: altında katı blok olmalı (MC)
  if (id === 21) {
    const below = chunkManager.getBlock(px, py - 1, pz);
    const bb = BLOCKS[below];
    if (!below || !bb || bb.saydam) { toast('Meşale alta katı blok ister!'); return 'none'; }
  }
  if (GAMEMODE === 'survival' && !inventory.consumeSelected()) { toast('Blok yok!'); return 'none'; }
  chunkManager.setBlock(px, py, pz, id);
  trackTorch(px, py, pz, id);
  renderHotbar();
  return 'placed';
}
function tryBreakFromCross() {
  // Creative basılı-tut kırma için (survival zaten mouseL+progress ile kırıyor)
  if (!chunkManager || player.dead || GAMEMODE !== 'creative') return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const eye = player.pos.clone(); eye.y += EYE;
  const hit = raycastVoxel(eye, dir, REACH);
  if (hit) breakInstant(hit);
}
document.addEventListener('mousedown', (e) => {
  if (!locked || !chunkManager || player.dead) return;
  if (inventory?.isOpen || chat?.isOpen) return;
  if (craftTable?.isOpen || furnaceUI?.isOpen) return;
  if (e.button === 0) {
    if (GAMEMODE === 'creative') {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const eye = player.pos.clone(); eye.y += EYE;
      const hit = raycastVoxel(eye, dir, REACH);
      if (hit) breakInstant(hit);
      mouseL = true; creativeBreakCd = CREATIVE_BREAK_INTERVAL; // basılı tutunca sürekli kır (MC)
    }
    else { mouseL = true; breakTarget = null; breakProg = 0; }
  } else if (e.button === 2) {
    // MC: sağ basılı tutunca sürekli koy — ilk bloğu hemen koy, gerisi döngüde
    const r = tryPlaceFromCross();
    if (r === 'table' || r === 'furnace') { mouseR = false; return; }
    mouseR = true; placeCd = PLACE_INTERVAL;
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) { mouseL = false; hideBreakBar(); }
  if (e.button === 2) { mouseR = false; placeCd = 0; }
});

function toast(msg) {
  selNameEl.textContent = msg;
  clearTimeout(renderHotbar._t);
  renderHotbar._t = setTimeout(() => selNameEl.textContent = '', 1500);
}

// ============ DÖNGÜ ============
const coordsEl = document.getElementById('coords');
const fpsEl = document.getElementById('fps');
const seedEl = document.getElementById('seedInfo');
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
const perfAcc = { ms: 0, max: 0, n: 0 };

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (locked) movePlayer(dt);
  if (chunkManager) {
    chunkManager.updateStreaming(player.pos.x, player.pos.z);
    // Adaptif bütçe: önceki kare yavaşsa (<30fps) bu kare üretim/mesh atlanır.
    // Oyun davranışı değişmez, sadece takılma anında kuyruk bir kare bekler.
    if (dt <= 0.034) chunkManager.processQueues();
    chunkManager.processSaves(1);
  }
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  // ---- gün döngüsü (/time): zaman akar, güneş/ay/yıldız senkron ----
  timeOfDay = (timeOfDay + (dt * 24000) / DAY_LENGTH_S) % 24000;
  {
    const ang = ((timeOfDay - 6000) / 24000) * Math.PI * 2; // öğle=0
    const elev = Math.cos(ang); // 1 öğle, -1 gece
    const dayF = Math.max(0, Math.min(1, (elev + 0.25) / 1.25));
    const night = new THREE.Color(0x070b18), day = new THREE.Color(0x87ceeb);
    const skyCol = night.clone().lerp(day, dayF);
    scene.background = skyCol;
    if (scene.fog) scene.fog.color.copy(skyCol);
    sun.intensity = 0.08 + 1.15 * dayF;
    sun.color.setHSL(0.12, 0.5, 0.5 + 0.5 * dayF);
    const R = 80;
    sun.position.set(player.pos.x + Math.sin(ang) * R, player.pos.y + Math.max(elev, -0.3) * R + 20, player.pos.z + 20);
    sun.target.position.set(player.pos.x, player.pos.y - 10, player.pos.z);
    sky?.update(ang, dayF, camera.position);
  }
  // ---- su altı (MC gibi: yoğun mavi fog + perde) ----
  {
    const headY = player.pos.y + EYE;
    const uw = !!chunkManager && getBlock(Math.floor(camera.position.x), Math.floor(headY), Math.floor(camera.position.z)) === 16;
    if (uw !== headUnderwater) {
      headUnderwater = uw;
      document.getElementById('waterOverlay')?.classList.toggle('hidden', !uw);
    }
    if (uw) {
      scene.fog.color.copy(WATER_FOG);
      scene.fog.near = 1;
      scene.fog.far = 14;
      scene.background = WATER_FOG;
    } else {
      scene.fog.near = RENDER_DISTANCE * 16 * 0.45;
      scene.fog.far = RENDER_DISTANCE * 16 * 0.95;
    }
  }
  clouds.children.forEach(c => {
    c.position.x += dt * 0.7;
    if (c.position.x > player.pos.x + 90) c.position.x = player.pos.x - 90;
    if (c.position.x < player.pos.x - 90) c.position.x = player.pos.x + 90;
    if (c.position.z > player.pos.z + 90) c.position.z = player.pos.z - 90;
    if (c.position.z < player.pos.z - 90) c.position.z = player.pos.z + 90;
    c.position.y = 185 + (c.id % 7);
  });

  if (border) {
    const b = border.update(dt, player.pos.x, player.pos.z);
    document.body.classList.toggle('at-border', b.dist < 16);
    const bw = document.getElementById('borderWarn');
    if (bw) bw.classList.toggle('hidden', b.dist >= 16);
    if (b.dist < 16) coordsEl.style.color = '#ff8080';
    else coordsEl.style.color = '';
  }

  if (locked && chunkManager && !player.dead) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const eye = player.pos.clone(); eye.y += EYE;
    const hit = raycastVoxel(eye, dir, REACH);
    if (hit && !DBG_NOHIGHLIGHT && SHOW_SELECTION) {
      highlight.visible = true;
      if (hit.id === 21) {
        // Meşale ince direk: seçim kutusu da küçük (MC hissi)
        highlight.scale.set(0.25, 0.7, 0.25);
        highlight.position.set(hit.x + 0.5, hit.y + 0.35, hit.z + 0.5);
      } else {
        highlight.scale.set(1, 1, 1);
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      }
    }
    else highlight.visible = false;
    // MC: sağ basılı sürekli koyma (yaratıcı + hayatta kalma). Masa/fırın açılırsa tutmayı bırak.
    if (mouseR && !anyOverlay()) {
      placeCd -= dt;
      if (placeCd <= 0) {
        const r = tryPlaceFromCross();
        if (r === 'table' || r === 'furnace') mouseR = false;
        else placeCd = PLACE_INTERVAL;
        // survival'da blok bittiyse spam yapma: bir süre bekle
        if (r === 'none' && GAMEMODE === 'survival' && !selectedId()) placeCd = 0.5;
      }
    }
    // MC: creative sol basılı sürekli kırma (neredeyse anında)
    if (mouseL && GAMEMODE === 'creative' && !anyOverlay()) {
      creativeBreakCd -= dt;
      if (creativeBreakCd <= 0) {
        if (hit) breakInstant(hit);
        creativeBreakCd = CREATIVE_BREAK_INTERVAL;
      }
    }
    // survival basılı-tut kırma (alet hızı + hasat kuralı)
    const bar = document.getElementById('breakBar');
    const fill = document.getElementById('breakFill');
    if (mouseL && GAMEMODE === 'survival') {
      if (!hit) { hideBreakBar(); }
      else {
        const key = hit.x + ',' + hit.y + ',' + hit.z;
        if (breakTarget !== key) { breakTarget = key; breakProg = 0; }
        const baseNeed = BREAK_TIME[hit.id] ?? 1;
        if (!isFinite(baseNeed)) { toast('Anakaya kırılmaz!'); mouseL = false; hideBreakBar(); }
        else {
          // Alet çarpanı: doğru kazma hızlı, el/yanlış alet 5x yavaş
          const tool = heldToolId();
          const info = breakInfo(hit.id, tool);
          const need = baseNeed * (info.timeMult || 1);
          breakProg += dt / need;
          bar?.classList.remove('hidden');
          if (fill) fill.style.width = Math.min(100, breakProg * 100) + '%';
          effects?.crack(hit.x, hit.y, hit.z, breakProg);
          // hedef değiştiyse güncel id ile kır
          const cur = chunkManager.getBlock(hit.x, hit.y, hit.z);
          if (!cur) { hideBreakBar(); }
          else if (breakProg >= 1) { breakInstant({ ...hit, id: cur }); renderHotbar(); }
        }
      }
    } else if (!mouseL) { bar?.classList.add('hidden'); }
  } else { highlight.visible = false; if (!mouseL) document.getElementById('breakBar')?.classList.add('hidden'); }

  coordsEl.textContent = `${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}`;
  // efektler: partikül + düşen eşya (iki modda da yerden toplanır, MC gibi)
  effects?.update(dt, new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z),
    !player.dead,
    (id, kind, dur) => {
      const k = kind || (id >= 100 ? 'item' : 'block');
      const ok = inventory ? inventory.addItem(id, 1, k, (typeof dur === 'number') ? dur : null) : false;
      if (ok) { renderHotbar(); try { furnaceUI?.renderAll(); } catch {} }
      return ok;
    });
  // Fırın tick (0.2sn birikimli): eritme + yakıt
  furnTickAcc += dt;
  if (furnTickAcc > 0.2 && chunkManager && furnaceMgr) {
    const acc = furnTickAcc; furnTickAcc = 0;
    try {
      const dirty = furnaceMgr.tick(acc, (x, y, z) => {
        try {
          const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
          return chunkManager.chunks.has(cx + ',' + cz);
        } catch { return true; }
      });
      if (dirty && furnaceUI?.isOpen) furnaceUI.renderAll();
      if (dirty) furnDirty = true;
      // Yanma geçişi (sönmüş<->yanık): blok takası + remesh (MC yanık fırın ağzı)
      try {
        const swaps = furnaceMgr.litSwaps || [];
        furnaceMgr.litSwaps = [];
        for (const sw of swaps) {
          const cur = chunkManager.getBlock(sw.x, sw.y, sw.z);
          if (sw.lit && cur === 22) chunkManager.setBlock(sw.x, sw.y, sw.z, 24);
          else if (!sw.lit && cur === 24) chunkManager.setBlock(sw.x, sw.y, sw.z, 22);
        }
      } catch {}
    } catch {}
  }
  // Kum/çakıl yerçekimi: MC fiziğiyle düşen-varlık (16 blok/sn², limit 39.2)
  if (chunkManager && fallSim.size) {
    try { fallSim.update(dt, simHooks()); } catch {}
  }
  // Su dolgusu: 0.25sn tick, bütçeli (MC-lite)
  waterTickAcc += dt;
  if (waterTickAcc > 0.25 && chunkManager && waterSim.size) {
    waterTickAcc = 0;
    try { waterSim.step(40, simHooks()); } catch {}
  }
  // gölge kısması: SADECE güneş hücresi değişince / 10sn periyot.
  // (Mesh sayacına bağlanmaz: streaming sırasında her kare 2x çizim biter.)
  frameNo++;
  // meşale ışıkları: 0.4sn'de bir en yakınlara ata (her kare tarama yok)
  torchScanT += dt;
  if (torchScanT > 0.4) { torchScanT = 0; try { updateTorchLights(); } catch {} }
  if (chunkManager) {
    const cell = `${Math.floor(player.pos.x / 8)},${Math.floor(player.pos.y / 8)},${Math.floor(player.pos.z / 8)}`;
    if (cell !== lastShadowCell || frameNo % 600 === 0) {
      lastShadowCell = cell;
      renderer.shadowMap.needsUpdate = true;
    }
  }
  // ?debug=perf: kare süresi + kuyruk derinlikleri
  perfAcc.ms += dt * 1000;
  if (dt * 1000 > perfAcc.max) perfAcc.max = dt * 1000;
  perfAcc.n++;
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++; fpsT += dt;
  if (fpsT > 0.5) {
    const fps = Math.round(fpsAcc / fpsN);
    const cc = chunkManager ? chunkManager.chunks.size : 0;
    const q = chunkManager ? chunkManager.genQueue.length + chunkManager.meshQueue.size : 0;
    const sq = chunkManager ? chunkManager.saveQueue.size : 0;
    fpsEl.textContent = `${fps} (${cc}c${q ? '+' + q : ''}${sq ? ' s' + sq : ''})`;
    const pd = document.getElementById('perfDebug');
    if (pd && chunkManager) {
      pd.innerHTML = `kare: ${(perfAcc.ms / perfAcc.n).toFixed(1)}ms avg / ${perfAcc.max.toFixed(0)}ms max<br>` +
        `chunk: ${cc} | üret-kuyruğu: ${chunkManager.genQueue.length} | mesh-kuyruğu: ${chunkManager.meshQueue.size} | kayıt-kuyruğu: ${sq}<br>` +
        `drawcall: ${renderer.info.render.calls} | üçgen: ${(renderer.info.render.triangles / 1000).toFixed(0)}k`;
    }
    fpsAcc = 0; fpsN = 0; fpsT = 0;
    perfAcc.ms = 0; perfAcc.max = 0; perfAcc.n = 0;
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============ BOOT (hafif: menü anında gelir, ağır iş YOK) ============
// "Dünya üretiliyor" yazısı artık SADECE dünyaya girerken çıkar.
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const say = (t) => { if (loadingText) loadingText.textContent = t; };
let booted = false;
let animating = false;
let uiBuilt = false;

function showLoading(t) {
  say(t);
  loadingEl?.classList.remove('hidden');
}
function hideLoading() { loadingEl?.classList.add('hidden'); }

function disposeWorld() {
  if (!chunkManager) return;
  for (const c of chunkManager.chunks.values()) {
    if (c.meshOp) { scene.remove(c.meshOp); c.meshOp.geometry.dispose(); }
    if (c.meshTr) { scene.remove(c.meshTr); c.meshTr.geometry.dispose(); }
    if (c.meshEm) { scene.remove(c.meshEm); c.meshEm.geometry.dispose(); }
  }
  chunkManager.chunks.clear();
  chunkManager.genQueue = [];
  chunkManager.meshQueue.clear();
  chunkManager = null;
}

function scanTorches() {
  // yüklü chunk'lardaki kayıtlı meşaleleri ışık listesine al
  try {
    for (const c of chunkManager.chunks.values()) {
      const { blocks, cx, cz } = c;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] !== 21) continue;
        const y = MIN_Y + Math.floor(i / 256);
        const lz = Math.floor((i % 256) / 16), lx = i % 16;
        torchSet.add(tkey(cx * 16 + lx, y, cz * 16 + lz));
      }
    }
  } catch {}
}

function scanFurnaces() {
  // Yüklenen chunk'lardaki fırın görselini yanma durumuna eşitle (22 sönmüş / 24 yanık).
  // Fırın verisi koordinatla anahtarlı olduğu için blok takasında veri kaybolmaz.
  try {
    for (const [k, st] of furnaceMgr.map) {
      const [x, y, z] = k.split(',').map(Number);
      const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
      if (!chunkManager.chunks.has(cx + ',' + cz)) continue;
      const cur = chunkManager.getBlock(x, y, z);
      if (st.burn > 0 && cur === 22) chunkManager.setBlock(x, y, z, 24);
      else if (!(st.burn > 0) && cur === 24) chunkManager.setBlock(x, y, z, 22);
    }
  } catch {}
}

// Dünyaya gir (ilk giriş veya reload'sız geçiş). Buton tıklamasından çağrılır.
async function enterWorld(id) {
  if (!id) return;
  document.exitPointerLock?.();
  showLoading('Hazırlanıyor...');
  refreshMenus();
  try {
    // geçiş yapıyorsak önce mevcut dünyayı kaydet + toparla
    if (worldReady) {
      say('Kaydediliyor...');
      try { craftTable?.close(true); } catch {}
      try { craftInv?.close(true); } catch {}
      try { furnaceUI?.close(); } catch {}
      try { inventory?.close(); } catch {}
      await saveAll();
    }
    disposeWorld();
    try { effects?.clearAll?.(); } catch {}
    torchSet.clear();
    for (const L of torchLights) L.intensity = 0;
    mouseL = false; mouseR = false; placeCd = 0; hideBreakBar(); try { effects?.hideCrack(); } catch {}
    player.dead = false;
    document.getElementById('deathScreen')?.classList.add('hidden');

    WORLD_ID = id;
    try { await dbMeta.set('active-world', WORLD_ID); } catch {}

    // dünya kaydı (yoksa oluştur)
    say('Dünya yükleniyor...');
    try {
      let w = await dbWorlds.get(WORLD_ID);
      if (!w) {
        w = { id: WORLD_ID, name: 'Dünya', seed: DEFAULT_SEED, gamemode: 'creative', createdAt: Date.now(), lastPlayed: Date.now() };
        await dbWorlds.put(w);
      }
      WORLD_NAME = w.name || 'Dünya';
      SEED_STR = String(w.seed || DEFAULT_SEED);
      SEED_NUM = hashSeed(SEED_STR) & 0xffffffff;
      GAMEMODE = w.gamemode === 'survival' ? 'survival' : 'creative';
      player.flying = false; // dunyaya yuruyerek baslanir (cift-Space ile ucma)
      w.lastPlayed = Date.now();
      try { await dbWorlds.put(w); } catch {}
    } catch {}

    // atlas + sahne + arayüz: oturumda bir kez kurulur, tekrar kullanılır
    if (!atlas) {
      say('Atlas kuruluyor...');
      atlas = await buildAtlas();
      try {
        if (new URLSearchParams(location.search).get('debug') === 'atlas') {
          const dbg = document.createElement('div');
          dbg.style.cssText = 'position:fixed;right:8px;top:8px;z-index:200;background:#000;padding:6px;border:2px solid #fff;cursor:pointer;color:#fff;font-size:12px';
          dbg.title = 'Atlas denetimi (kapatmak için tıkla)';
          const im = document.createElement('img');
          im.src = atlas.canvas.toDataURL();
          im.style.cssText = 'width:256px;height:256px;image-rendering:pixelated;display:block';
          dbg.appendChild(im);
          dbg.appendChild(document.createTextNode('atlas 8x8 (tıkla kapat)'));
          dbg.onclick = () => dbg.remove();
          document.body.appendChild(dbg);
        }
      } catch {}
      matOpaque = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide });
      matTransparent = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.FrontSide });
      // Meşale cross quad'lar çift taraflı görünsün
      matEmissive = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, emissive: 0xffffff, emissiveMap: atlas.texture, alphaTest: 0.4, side: THREE.DoubleSide });
    }
    if (!border) border = new WorldBorder(scene);
    if (!sky) sky = new Sky(scene);
    if (torchLights.length === 0) {
      for (let i = 0; i < 5; i++) {
        const L = new THREE.PointLight(0xffb648, 0, 15, 1.8);
        scene.add(L);
        torchLights.push(L);
      }
    }
    if (!effects) {
      effects = new Effects(scene, atlas, (x, y, z) => chunkManager.getBlockOrUnknown(x, y, z));
      try {
        if (new URLSearchParams(location.search).get('debug') === 'drops') {
          const dd = document.createElement('div');
          dd.id = 'dropDebug';
          dd.style.cssText = 'position:fixed;left:8px;top:120px;z-index:200;background:rgba(0,0,0,0.75);color:#7CFC00;font-size:12px;padding:8px 10px;border:1px solid #7CFC00;border-radius:6px;max-width:320px;pointer-events:none;font-family:monospace';
          document.body.appendChild(dd);
          setInterval(() => {
            if (!effects) return;
            dd.innerHTML = `drops: ${effects.drops.length} | spawn:${effects.stat.spawned} pick:${effects.stat.picked} exp:${effects.stat.expired} void:${effects.stat.voided}<br>` +
              effects.log.map((l) => l.replace(/</g, '&lt;')).join('<br>');
          }, 500);
        }
      } catch {}
    }
    chunkManager = new ChunkManager(scene, atlas, WORLD_ID, SEED_STR, SEED_NUM, {
      opaque: matOpaque, transparent: matTransparent, emissive: matEmissive,
    });
    chunkManager.onEdit = handleBlockEdit;
    fallSim.clear(); waterSim.clear(); waterTickAcc = 0;

    if (!uiBuilt) {
      uiBuilt = true;
      say('Envanter kuruluyor...');
      inventory = new InventoryUI({
        getIcon: (id, kind) => iconFor(id, kind),
        onChange: () => { renderHotbar(); if (craftTable?.isOpen) renderTableInv(); if (furnaceUI?.isOpen) renderFurnaceInv(); saveAll(); },
        onClose: () => {
          try { craftInv?.close(true); } catch {}
          inventory.close();
          renderHotbar();
          if (!player.dead) tryLock(); else refreshMenus();
        },
      });
      inventory.setMode(GAMEMODE);
      chat = new ChatUI({
        releaseLock: () => document.exitPointerLock?.(),
        relockHint: () => {},
        onClose: (relock) => { if (relock && !player.dead) tryLock(); else refreshMenus(); },
        setGamemode: (m) => setGamemode(m),
        give: (id, count, kind = null) => {
          const k = kind || (id >= 100 ? 'item' : 'block');
          if (GAMEMODE === 'creative') {
            // Yaratıcıda seçili slota 64 koy (eksilmez)
            if (k === 'item' && ITEMS[id]?.tool) inventory.hotbar[inventory.sel] = { kind: k, id, count: 1, dur: ITEMS[id].maxDur };
            else inventory.hotbar[inventory.sel] = { kind: k, id, count: Math.min(64, count || 64) };
            inventory.renderHot(); renderHotbar(); return true;
          }
          return inventory.addItem(id, count, k);
        },
        setBlock: (x, y, z, id) => {
          if (y < MIN_Y || y > MAX_Y) return { ok: false, msg: 'Y sınırı: -64..319' };
          if (Math.abs(x) > 250000 || Math.abs(z) > 250000) return { ok: false, msg: 'Dünya sınırı dışı!' };
          chunkManager.setBlock(x, y, z, id);
          trackTorch(x, y, z, id);
          return { ok: true };
        },
        pos: () => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z }),
        tp: (x, y, z, toSpawn = false) => {
          if (toSpawn) { player.pos.copy(spawnPos()); player.vel.set(0, 0, 0); return { ok: true }; }
          if (Math.abs(x) > 250000 || Math.abs(z) > 250000) return { ok: false, msg: 'Dünya sınırı dışı!' };
          player.pos.set(
            Math.max(-249999, Math.min(249999, x)),
            Math.max(MIN_Y + 1, Math.min(MAX_Y + 5, y)),
            Math.max(-249999, Math.min(249999, z))
          );
          player.vel.set(0, 0, 0);
          return { ok: true };
        },
        setTime: (t) => { timeOfDay = t; },
        getTime: () => Math.floor(timeOfDay),
        seed: () => SEED_STR,
        clearInv: () => { inventory.clear(); renderHotbar(); },
        kill: () => kill('/kill kullanıldı'),
      });
      craftInv = new CraftUI({
        size: 2, embed: true, inventory, getIcon: (id, kind) => iconFor(id, kind),
        panelId: 'invPanel', gridId: 'craft2Grid', outId: 'craft2Out',
        onDropOverflow: (id, count, kind) => dropOverflowAtPlayer(id, count, kind),
      });
      craftTable = new CraftUI({
        size: 3, inventory, getIcon: (id, kind) => iconFor(id, kind),
        panelId: 'tablePanel', gridId: 'craft3Grid', outId: 'craft3Out',
        closeId: 'tableClose', onClose: () => closeTable(true),
        onDropOverflow: (id, count, kind) => dropOverflowAtPlayer(id, count, kind),
      });
      furnaceUI = new FurnaceUI({
        inventory, mgr: furnaceMgr, getIcon: (id, kind) => iconFor(id, kind),
        onChange: () => { renderHotbar(); saveAll(); },
        onClose: () => closeFurnace(),
      });
      try { document.getElementById('furnaceClose').onclick = () => closeFurnace(); } catch {}
    } else {
      inventory.setMode(GAMEMODE);
    }

    // oyuncu kaydını yükle (yeni dünya = boş envanter + spawn)
    say('Oyuncu yükleniyor...');
    try {
      const saved = await dbPlayers.get(WORLD_ID);
      // Fırın verisini yükle (yoksa boş)
      try { furnaceMgr.clear(); if (saved?.furnaces) furnaceMgr.load(saved.furnaces); } catch {}
      if (saved?.pos) {
        player.pos.set(saved.pos[0], saved.pos[1], saved.pos[2]);
        player.yaw = saved.yaw ?? player.yaw;
        player.pitch = saved.pitch ?? player.pitch;
        if (saved.inv) inventory.load(saved.inv);
        else { inventory.hotbar = new Array(10).fill(null); inventory.main = new Array(27).fill(null); }
        if (saved.selected != null) { selected = saved.selected; inventory.sel = selected; }
        player.health = typeof saved.health === 'number' ? Math.max(0, Math.min(20, saved.health)) : 20;
        if (typeof saved.time === 'number') timeOfDay = ((saved.time % 24000) + 24000) % 24000;
      } else {
        player.pos.copy(spawnPos());
        player.health = 20;
        inventory.hotbar = new Array(10).fill(null);
        inventory.main = new Array(27).fill(null);
        inventory.sel = 0; selected = 0;
        try { furnaceMgr.clear(); } catch {}
      }
      selected = inventory.sel || 0;
    } catch {
      player.pos.copy(spawnPos());
    }
    player.vel.set(0, 0, 0);
    player.fallStart = player.pos.y;
    updateHearts(); updateModeBadge();

    // spawn çevresini önden yükle: önce 3x3 hızlı, gerisi stream
    say('Spawn yükleniyor (3x3)...');
    const scx = Math.floor(player.pos.x / 16), scz = Math.floor(player.pos.z / 16);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      await chunkManager.ensureChunk(scx + dx, scz + dz);
    for (const c of chunkManager.chunks.values()) chunkManager.remesh(c);
    scanTorches();
    scanFurnaces();
    chunkManager.updateStreaming(player.pos.x, player.pos.z);

    if (seedEl) seedEl.textContent = `${WORLD_NAME} | Seed: ${SEED_STR} | Y: ${MIN_Y}..${MAX_Y} | Border: ±250k | ${GAMEMODE}`;
    const menuSeed = document.getElementById('menuSeed');
    if (menuSeed) menuSeed.textContent = `${WORLD_NAME} (Seed: ${SEED_STR})`;
    renderHotbar();
    hideLoading();
    worldReady = true;
    wantMain = false;
    refreshMenus();
    if (!animating) { animating = true; animate(); }
    try {
      chat.msg(`— ${WORLD_NAME} dünyasına girildi (${GAMEMODE === 'creative' ? 'Yaratıcı' : 'Hayatta Kalma'}) —`, 'sys');
      if (GAMEMODE === 'survival') chat.msg('Hayatta Kalma: E ile envanter, kazma yapmadan cevher düşmez! Fırında pişir. T ile komutlar.', 'sys');
      else chat.msg('Yaratıcı: E ile blok+eşya seç (arama var), çift-Space ile uç. T ile komutlar.', 'sys');
    } catch {}
    tryLock(); // buton tıklamasından gelindiği için genelde tutar
  } catch (err) {
    console.error('Dünya girişi başarısız:', err);
    say('Hata oluştu, menüye dönülüyor...');
    setTimeout(() => { hideLoading(); worldReady = false; wantMain = true; refreshMenus(); }, 800);
  }
}

// Menüye çık (kayıtlı dünyayı korur, reload yok)
async function exitToMenu(save = true) {
  document.exitPointerLock?.();
  if (worldReady && save) { try { await saveAll(); } catch {} }
  try { craftTable?.close(false); } catch {}
  try { furnaceUI?.close(); } catch {}
  try { inventory?.close(); } catch {}
  hideBreakBar(); try { effects?.hideCrack(); } catch {}
  disposeWorld();
  worldReady = false;
  wantMain = true;
  hideLoading();
  refreshMenus();
}

window.__enterWorld = enterWorld;
window.__exitToMenu = exitToMenu;
window.__currentWorld = () => (worldReady ? WORLD_ID : null);

// Hafif boot: DB + aktif id, o kadar. Ağır iş enterWorld'de.
(async function bootLight() {
  try { await openDB(); } catch {}
  try {
    if (urlWorld) { WORLD_ID = urlWorld; await dbMeta.set('active-world', WORLD_ID); }
    else {
      const fromMeta = await dbMeta.get('active-world', null);
      const legacy = localStorage.getItem('mc-v2-active-world');
      WORLD_ID = fromMeta || legacy || 'default';
      if (legacy && !fromMeta) await dbMeta.set('active-world', WORLD_ID);
      try { localStorage.removeItem('mc-v2-active-world'); localStorage.removeItem('mc-v2-seed'); localStorage.removeItem('mc-v2-gamemode'); } catch {}
    }
  } catch {}
  setInterval(saveAll, SAVE_AUTOSAVE_MS);
  addEventListener('beforeunload', () => {
    saveAll();
    try { renderer.forceContextLoss(); } catch {}
  });
  booted = true;
  refreshMenus(); // menü + logo anında görünür
  // ?debug=lock: kilit/menü günlüğü
  try {
    if (new URLSearchParams(location.search).get('debug') === 'lock') {
      const el = document.createElement('div');
      el.id = 'lockDebug';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:200;background:rgba(0,0,0,0.8);color:#ffd27a;font-size:11px;padding:8px 10px;border:1px solid #ffd27a;border-radius:6px;max-width:340px;pointer-events:none;font-family:monospace';
      document.body.appendChild(el);
    }
  } catch {}
  // ?debug=perf: kare süresi + kuyruk + drawcall
  try {
    if (new URLSearchParams(location.search).get('debug') === 'perf') {
      const el = document.createElement('div');
      el.id = 'perfDebug';
      el.style.cssText = 'position:fixed;right:8px;top:120px;z-index:200;background:rgba(0,0,0,0.8);color:#7cc4ff;font-size:11px;padding:8px 10px;border:1px solid #7cc4ff;border-radius:6px;max-width:360px;pointer-events:none;font-family:monospace';
      el.textContent = 'perf bekleniyor...';
      document.body.appendChild(el);
    }
  } catch {}
  // Açılış splash: logo 1.2sn tam ekran, sonra menüye geçiş
  try {
    setTimeout(() => {
      const sp = document.getElementById('bootSplash');
      if (!sp) return;
      sp.classList.add('gone');
      setTimeout(() => sp.classList.add('off'), 550);
    }, 1200);
  } catch {}
})();
