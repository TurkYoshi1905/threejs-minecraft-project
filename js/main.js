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
import { DoorManager } from './world/doors.js';
import { ChestManager } from './world/chests.js';
import { ChestUI } from './ui/chest.js';
import { FallSim, WaterSim } from './world/sim.js';
import { TNTSim } from './world/tnt.js';
import { playIgnite, playExplode } from './core/audio.js';
import { Sky } from './world/sky.js';
import { Effects } from './world/effects.js';

// ============ WORLD META (Ã§oklu dÃ¼nya: aktif kayÄ±t DB'den okunur) ============
const BUILD = 'v14';
window.__BUILD = BUILD;
try { console.log('%cThree.js Minecraft ' + BUILD, 'font-weight:bold'); } catch {}
try { document.getElementById('buildTag').textContent = BUILD; } catch {}
const urlParams = new URLSearchParams(location.search);
const urlWorld = urlParams.get('world');
const urlSeed = urlParams.get('seed');
let WORLD_ID = urlWorld || 'default';
let WORLD_NAME = 'DÃ¼nya';
let SEED_STR = urlSeed || DEFAULT_SEED;
let SEED_NUM = hashSeed(SEED_STR) & 0xffffffff;
let GAMEMODE = 'creative';

// ============ THREE KURULUM (optimize) ============
const canvas = document.getElementById('game');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  // TarayÄ±cÄ± WebGL context vermedi (Ã§ok sekme/yenileme sonrasÄ± engellenir).
  // BoÅŸ siyah ekran yerine yÃ¶nlendirmeli hata gÃ¶ster.
  console.error('WebGL oluÅŸturulamadÄ±:', err);
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('menu')?.style.setProperty('display', 'none');
  document.getElementById('webglError')?.classList.remove('hidden');
  throw err;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft yerine hÄ±zlÄ± PCF
renderer.shadowMap.autoUpdate = false; // her kare sahneyi 2x Ã§izmemek iÃ§in (aÅŸaÄŸÄ±da throttle)
renderer.shadowMap.needsUpdate = true;
let lastShadowCell = '';
let frameNo = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, RENDER_DISTANCE * 16 * 0.45, RENDER_DISTANCE * 16 * 0.95);
window.addEventListener('gamesettingschange', (e) => {
  const rd = (e.detail && typeof e.detail.renderDistance === 'number') ? e.detail.renderDistance : 5;
  if (scene.fog && !headUnderwater) {
    scene.fog.near = rd * 16 * 0.45;
    scene.fog.far = rd * 16 * 0.95;
  }
});

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x5f7f4a, 1.0));
const sun = new THREE.DirectionalLight(0xfff6e0, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); // 2048 -> 1024 (2x hÄ±z)
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
const DAY_LENGTH_S = 1200; // tam gÃ¼n 20 dk (MC gibi), /time ile atlanabilir

// ---- UI durum makinesi: menu (ilk) / pause / overlay / death ----
let hasStarted = false;   // ilk kilit alÄ±ndÄ± mÄ±
let wantMain = true;      // ana menÃ¼ mÃ¼ isteniyor (pause deÄŸil)
let worldReady = false;

// ============ OYUNCU ============
const player = {
  pos: new THREE.Vector3(8.5, 80, 8.5),
  vel: new THREE.Vector3(),
  yaw: Math.PI * 0.25, pitch: -0.1,
  onGround: false, flying: false,
  health: 20, dead: false, fallStart: 80,
  oxygen: 300, drownTimer: 0,
  sneaking: false,
  sprinting: false,
};
let currentEye = EYE;
let lastWTime = 0;
const DOUBLE_TAP_MS = 300;
let targetSpeed = 0;   // yumuÅŸak geÃ§iÅŸ iÃ§in hedef hÄ±z
let currentSpeed = 0;  // mevcut hÄ±z (yumuÅŸak)
let targetFlying = false; // yaratÄ±cÄ± uÃ§ma hedef durumu
let isFlyingSmooth = false; // uÃ§ma geÃ§iÅŸ aktif mi
let currentFov = 70;    // mevcut FOV (yumuÅŸak geÃ§iÅŸ)
let targetFov = 70;     // hedef FOV
const FOV_SPRINT_BOOST = 12; // sprintte FOV artÄ±ÅŸÄ± (vanilla MC ~%15 kick)
const FOV_FLY_BOOST = 7;    // uÃ§arken FOV artÄ±ÅŸÄ±
let flyBobPhase = 0;        // uÃ§ma sÃ¼zÃ¼lme animasyon fazÄ±
let flyTransitionY = 0;     // uÃ§maya kalkarken yumuÅŸak yÃ¼kseliÅŸ animasyonu
let timeOfDay = 6000; // 0-23999, 6000 Ã¶ÄŸle
const WATER_FOG = new THREE.Color(0x144a8f); // su altÄ± fog rengi
let headUnderwater = false;
const keys = {};
let locked = false;
let inventory = null;
let chat = null;
let craftInv = null;   // envanter iÃ§i 2x2
let craftTable = null; // masa 3x3
let furnaceMgr = new FurnaceManager();
let furnaceUI = null;
let chestUI = null; // sandik paneli (uiBuilt blogunda kurulur)
const doorMgr = new DoorManager();
const chestMgr = new ChestManager();
const fallSim = new FallSim();
const waterSim = new WaterSim();
const tntSim = new TNTSim();
const flashLights = []; // patlama flaÅŸ Ä±ÅŸÄ±klarÄ± (kÄ±sa Ã¶mÃ¼rlÃ¼, fade-out)
let waterTickAcc = 0;

// Yaprak Ã§Ã¼rÃ¼me (leaf decay): odun kÄ±rÄ±ldÄ±ÄŸÄ±nda yakÄ±ndaki yapraklar iÅŸaretlenir,
// oyuncu uzaklaÅŸtÄ±ÄŸÄ±nda zamanla kendi kendine kÄ±rÄ±lÄ±r (MC mantÄ±ÄŸÄ±).
const decayingLeaves = new Map(); // "x,y,z" -> timestamp (ms)
const LEAF_DECAY_RADIUS = 4;
const LEAF_DECAY_DELAY_MS = 3000; // odun kÄ±rÄ±ldÄ±ktan sonra bekleme
const LEAF_DECAY_CHANCE = 0.15; // her saniyede %15 ÅŸans
let lastLeafDecayCheck = 0;

// MeÅŸale Ä±ÅŸÄ±k takibi: koyulan/kÄ±rÄ±lan meÅŸaleler + sarÄ± Ä±ÅŸÄ±k havuzu
const torchMap = new Map(); // "x,y,z" -> facing (0 yerde, 1..4 duvarda)
const TORCH_DIR = [[0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]; // mesaleden destega yon
const torchLights = [];
let torchScanT = 0;
let furnTickAcc = 0;
let furnDirty = false;
const tkey = (x, y, z) => x + ',' + y + ',' + z;
function trackTorch(x, y, z, id, facing = 0) {
  if (id === 21) torchMap.set(tkey(x, y, z), facing);
  else torchMap.delete(tkey(x, y, z));
}
function torchFacingAt(x, y, z) { const f = torchMap.get(tkey(x, y, z)); return f == null ? 0 : f; }
// Destegi kirilan mesaleleri dusur (yer + duvar, MC). Donus: dusurulen sayisi.
function popUnsupportedTorches(bx, by, bz) {
  let n = 0;
  const offs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [dx, dy, dz] of offs) {
    const x = bx + dx, y = by + dy, z = bz + dz;
    if (chunkManager.getBlock(x, y, z) !== 21) continue;
    const f = torchFacingAt(x, y, z);
    const d = TORCH_DIR[f] || TORCH_DIR[0];
    if (x + d[0] === bx && y + d[1] === by && z + d[2] === bz) {
      chunkManager.setBlock(x, y, z, 0);
      trackTorch(x, y, z, 0);
      if (GAMEMODE === 'survival') effects?.spawnDrop(21, x, y, z);
      n++;
    }
  }
  return n;
}
function updateTorchLights() {
  // oyuncuya en yakÄ±n max 5 meÅŸaleye sarÄ± Ä±ÅŸÄ±k ata
  const px = player.pos.x, py = player.pos.y + 1, pz = player.pos.z;
  const near = [];
  for (const k of torchMap.keys()) {
    if (near.length > 400 && torchMap.size > 2000) break; // gÃ¼venlik
    const [x, y, z] = k.split(',').map(Number);
    const d2 = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 + (z + 0.5 - pz) ** 2;
    if (d2 < 30 * 30) near.push([d2, x, y, z]);
  }
  near.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < torchLights.length; i++) {
    const L = torchLights[i];
    if (i < near.length) {
      L.position.set(near[i][1] + 0.5, near[i][2] + 0.7, near[i][3] + 0.5);
      L.intensity = 26; // sÄ±cak sarÄ±, karanlÄ±ÄŸÄ± deler
    } else L.intensity = 0;
  }
}

function spawnPos() {
  // Suda doÄŸma yok: Ã¶nce (8,8), yoksa spiral kara ara (deterministik, seed'e baÄŸlÄ±).
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
  // Kara bulunamazsa (aÄŸÄ±r okyanus seed'i): en yÃ¼ksek halka noktasÄ±na dÃ¼ÅŸ
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
function isDoorBlock(id) { return id === 25 || id === 26; }
function isFloorSolid(x, y, z) {
  const id = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  if (!id || id === 16 || id === 21 || id === 25 || id === 26) return false;
  return true;
}
function solidAt(x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const id = getBlock(bx, by, bz);
  if (!id) return false;
  if (id === 16 || id === 21) return false; // su ve meÅŸale katÄ± deÄŸil (iÃ§inden geÃ§ilir)
  if (id === 25 || id === 26) { // kapÄ±: kapalÄ± katÄ±, aÃ§Ä±k geÃ§irgen (MC)
    const doorBaseY = id === 25 ? by : by - 1;
    try {
      const st = doorMgr.map.get(bx + ',' + doorBaseY + ',' + bz);
      if (st && st.open) return false;
      // KapÄ± kapalÄ±: Oyuncu bu kapÄ± bloÄŸunun iÃ§indeyse serbestÃ§e adÄ±m atÄ±p Ã§Ä±kabilsin
      if (typeof player !== 'undefined' && player && player.pos) {
        if (Math.floor(player.pos.x) === bx && Math.floor(player.pos.z) === bz) {
          return false;
        }
      }
      return true;
    } catch { return true; }
  }
  return true;
}
function inWater(px, py, pz) { return getBlock(Math.floor(px), Math.floor(py + 0.4), Math.floor(pz)) === 16; }
function collides(px, py, pz) {
  for (const dx of [-PW, PW]) for (const dz of [-PW, PW]) for (const dy of [0.1, 0.9, PH - 0.1]) {
    if (solidAt(px + dx, py + dy, pz + dz)) return true;
  }
  return false;
}

function hasGround(px, py, pz) {
  for (const cx of [-PW, PW]) {
    for (const cz of [-PW, PW]) {
      if (isFloorSolid(px + cx, py - 0.1, pz + cz)) return true;
    }
  }
  return false;
}

function movePlayer(dt) {
  // border clamp
  if (border) {
    if (border.clamp(player.pos)) { /* duvara vurdu */ }
  }
  // Hedef hÄ±zÄ± belirle (yumuÅŸak geÃ§iÅŸ iÃ§in)
  const baseF = getBaseFov();
  if (player.flying) {
    targetSpeed = 12;
    targetFov = baseF + FOV_FLY_BOOST;
  } else if (player.sprinting && !player.sneaking) {
    targetSpeed = 5.612;
    targetFov = baseF + FOV_SPRINT_BOOST;
  } else if (player.sneaking) {
    targetSpeed = 3.15;
    targetFov = baseF;
  } else {
    targetSpeed = 4.5;
    targetFov = baseF;
  }
  // YumuÅŸak geÃ§iÅŸ: mevcut hÄ±zÄ± hedef hÄ±zla eÅŸitle (MC anlÄ±k deÄŸil, yumuÅŸak ivme)
  const speedLerp = Math.min(1, dt * 12);
  currentSpeed += (targetSpeed - currentSpeed) * speedLerp;
  const speed = currentSpeed;
  const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const s = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let dx = (-sin * f + cos * s), dz = (-cos * f - sin * s);
  const len = Math.hypot(dx, dz) || 1;
  dx = dx / len * speed * dt; dz = dz / len * speed * dt;

  // SÃ¼rÃ¼nme (Shift): Oyuncu yerdeyken kenardan asla dÃ¼ÅŸmez (MC)
  if (player.sneaking && player.onGround && !player.flying) {
    while (dx !== 0 && !hasGround(player.pos.x + dx, player.pos.y, player.pos.z)) {
      if (Math.abs(dx) < 0.005) { dx = 0; break; }
      dx *= 0.5;
    }
    while (dz !== 0 && !hasGround(player.pos.x, player.pos.y, player.pos.z + dz)) {
      if (Math.abs(dz) < 0.005) { dz = 0; break; }
      dz *= 0.5;
    }
  }

  if (!collides(player.pos.x + dx, player.pos.y, player.pos.z)) player.pos.x += dx;
  if (!collides(player.pos.x, player.pos.y, player.pos.z + dz)) player.pos.z += dz;

  const water = inWater(player.pos.x, player.pos.y, player.pos.z);

  if (player.flying) {
    player.vel.y = 0;
    if (keys['Space']) player.pos.y += 10 * dt;
    if (keys['ShiftLeft']) player.pos.y -= 10 * dt;
    // uÃ§arken Ã§arpÄ±ÅŸma: yukarÄ±/aÅŸaÄŸÄ± da kontrol
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

  if (player.vel.y <= 0) {
    // AÅŸaÄŸÄ± dÃ¼ÅŸÃ¼ÅŸ veya zeminde durma: ayak tabanÄ±nÄ±n 4 kÃ¶ÅŸesinde katÄ± zemin ara
    let maxFloor = -Infinity;
    for (const dx of [-PW, PW]) {
      for (const dz of [-PW, PW]) {
        const bx = Math.floor(player.pos.x + dx);
        const bz = Math.floor(player.pos.z + dz);
        const by1 = Math.floor(ny);
        const by2 = Math.floor(player.pos.y - 0.0001);
        for (let by = by1; by <= by2; by++) {
          if (isFloorSolid(bx, by, bz)) {
            const floorTop = by + 1;
            if (floorTop > maxFloor) maxFloor = floorTop;
          }
        }
      }
    }

    if (maxFloor > -Infinity && ny <= maxFloor && player.pos.y >= maxFloor - 0.25) {
      player.pos.y = maxFloor;
      player.onGround = true;
      player.vel.y = 0;
      // DÃ¼ÅŸme hasarÄ± (survival, suya dÃ¼ÅŸmede yok). MC: 4 blok=1 kalp
      const drop = player.fallStart - player.pos.y;
      player.fallStart = player.pos.y;
      if (drop > 3 && GAMEMODE === 'survival' && !player.dead && !inWater(player.pos.x, player.pos.y, player.pos.z)) {
        damage(Math.floor(drop - 3), 'YÃ¼ksekten dÃ¼ÅŸtÃ¼n');
      }
    } else {
      player.pos.y = ny;
    }
  } else {
    // YukarÄ± zÄ±plama / yÃ¼kselme (tavan kontrolÃ¼)
    let hitCeil = false;
    let lowestCeil = Infinity;
    for (const dx of [-PW, PW]) {
      for (const dz of [-PW, PW]) {
        const bx = Math.floor(player.pos.x + dx);
        const bz = Math.floor(player.pos.z + dz);
        const by = Math.floor(ny + PH);
        if (isFloorSolid(bx, by, bz)) {
          hitCeil = true;
          if (by < lowestCeil) lowestCeil = by;
        }
      }
    }
    if (hitCeil && lowestCeil < Infinity) {
      player.pos.y = lowestCeil - PH - 0.001;
      player.vel.y = 0;
    } else {
      player.pos.y = ny;
    }
  }

  if (player.pos.y < MIN_Y - 20) { // void
    if (GAMEMODE === 'survival' && !player.dead) { kill('BoÅŸluÄŸa dÃ¼ÅŸtÃ¼n'); }
    else { player.pos.copy(spawnPos()); player.vel.set(0, 0, 0); }
  }
  if (player.pos.y > MAX_Y + 30) player.pos.y = MAX_Y + 30;
}

// ============ CAN / Ã–LÃœM / GAMEMODE / OKSÄ°JEN / XP / FOV ============
const BUBBLE_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 9 9" shape-rendering="crispEdges">
  <rect x="2" y="0" width="5" height="1" fill="#1b3040"/>
  <rect x="2" y="8" width="5" height="1" fill="#1b3040"/>
  <rect x="0" y="2" width="1" height="5" fill="#1b3040"/>
  <rect x="8" y="2" width="1" height="5" fill="#1b3040"/>
  <rect x="1" y="1" width="1" height="1" fill="#1b3040"/>
  <rect x="7" y="1" width="1" height="1" fill="#1b3040"/>
  <rect x="1" y="7" width="1" height="1" fill="#1b3040"/>
  <rect x="7" y="7" width="1" height="1" fill="#1b3040"/>
  <rect x="2" y="1" width="5" height="7" fill="#2d93e2"/>
  <rect x="1" y="2" width="7" height="5" fill="#2d93e2"/>
  <rect x="2" y="2" width="2" height="2" fill="#ffffff"/>
  <rect x="2" y="4" width="1" height="1" fill="#75c1f0"/>
  <rect x="3" y="5" width="3" height="2" fill="#19559c"/>
</svg>`);

function getBaseFov() {
  const f = window.gameSettings?.fov;
  return typeof f === 'number' && f >= 30 && f <= 110 ? f : 70;
}

function updateBubbles() {
  const el = document.getElementById('bubbles');
  if (!el) return;
  if (GAMEMODE !== 'survival' || (!headUnderwater && player.oxygen >= 300)) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  const count = Math.max(0, Math.min(10, Math.ceil(player.oxygen / 30)));
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<img class="bb" src="${BUBBLE_SVG}" alt="O2">`;
  }
  el.innerHTML = html;
}

function updateXpBar() {
  const el = document.getElementById('xpContainer');
  if (!el) return;
  if (GAMEMODE !== 'survival') el.classList.add('hidden');
  else el.classList.remove('hidden');
}

function updateHearts() {
  const el = document.getElementById('hearts');
  if (!el) return;
  if (GAMEMODE !== 'survival') { el.innerHTML = ''; return; }
  // MC tarzÄ± piksel kalpler (10 slot, yarÄ±m kalp destekli)
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
  // 2x2 Ã¼retim Ä±zgarasÄ± sadece survival'da (MC kuralÄ±)
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
function kill(reason = 'Ã–ldÃ¼n') {
  if (player.dead) return;
  if (GAMEMODE !== 'survival') { toast('YaratÄ±cÄ± modda Ã¶lmezsin'); return; }
  player.dead = true;
  player.health = 0;
  updateHearts();
  updateBubbles();
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
  player.oxygen = 300; player.drownTimer = 0;
  player.fallStart = player.pos.y;
  updateHearts(); updateBubbles(); updateXpBar();
  document.getElementById('deathScreen').classList.add('hidden');
  tryLock();
}
async function setGamemode(mode) {
  const prev = GAMEMODE;
  GAMEMODE = mode === 'survival' ? 'survival' : 'creative';
  if (GAMEMODE === 'survival') { player.flying = false; if (player.health <= 0) player.health = 20; }
  updateHearts(); updateModeBadge(); updateBubbles(); updateXpBar();
  inventory?.setMode(GAMEMODE);
  renderHotbar();
  if (prev !== GAMEMODE) toast(GAMEMODE === 'survival' ? 'Hayatta Kalma: kalpler aktif, dikkatli ol!' : 'YaratÄ±cÄ±: Ã§ift-Space ile uÃ§ma, envanter korunur');
  try {
    const w = await dbWorlds.get(WORLD_ID);
    if (w) { w.gamemode = GAMEMODE; w.lastPlayed = Date.now(); await dbWorlds.put(w); }
  } catch {}
  const seedEl2 = document.getElementById('seedInfo');
  if (seedEl2) seedEl2.textContent = `${WORLD_NAME} | Seed: ${SEED_STR} | Y: ${MIN_Y}..${MAX_Y} | Border: Â±250k | ${GAMEMODE}`;
  saveAll();
}

// ============ RAYCAST (DDA, chunkManager Ã¼zerinden) ============
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
// SeÃ§im Ã§erÃ§evesi kapalÄ±: kare Ã§izen tek mekanizma buydu, istek Ã¼zerine devre dÄ±ÅŸÄ±.
// KÄ±rma/koyma raycast ile Ã§alÄ±ÅŸÄ±r, oyuna etkisi yok. Geri aÃ§mak iÃ§in true yap.
// (MC Java'da bu Ã§erÃ§eve vardÄ±r; istersen tek satÄ±rla dÃ¶ner.)
const SHOW_SELECTION = false;
const DBG_NOHIGHLIGHT = urlParams.get('debug') === 'nohighlight';
const DBG_NOSHADOW = urlParams.get('debug') === 'noshadow';
if (DBG_NOSHADOW) {
  try { renderer.shadowMap.enabled = false; } catch {}
  try { sun.castShadow = false; } catch {}
}

// ============ BULUTLAR (yÃ¼ksekte, Y=190) ============
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

// ============ HOTBAR (envantere baÄŸlÄ±, atlas'tan tint'li ikon) ============
let selected = 0;
const hotbarEl = document.getElementById('hotbar');
const selNameEl = document.getElementById('selected-name');
const iconCache = {};
function iconFor(id, kind = null) {
  if (id === 25) return 'textures/oak_door_item.png'; // kapÄ± ikonu = eÅŸya dokusu (MC)
  if (id === 22 || id === 24) return 'textures/furnace_front_on.png'; // fÄ±rÄ±n ikonu = yanan fÄ±rÄ±n Ã¶nÃ¼ (MC)
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
    // atlas hazÄ±rsa tint'li kare Ã¼ret (yaprak gri -> yeÅŸil, su mavi)
    const b = BLOCKS[id];
    const texName = b.all ?? b.side;
    const rect = atlas?.uvMap?.[texName];
    if (atlas && rect) {
      const TINTS2 = { grass_block_top: '#91BD59', oak_leaves: '#77AB2F', birch_leaves: '#80A755', spruce_leaves: '#619961', water_still: '#3F76E4' };
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
  if (!s) return 'BoÅŸ';
  const k = s.kind || (s.id >= 100 ? 'item' : 'block');
  if (k === 'item') return ITEMS[s.id]?.ad || 'EÅŸya';
  return BLOCKS[s.id]?.ad || 'BoÅŸ';
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
    const label = s ? slotName(s) : 'BoÅŸ';
    const cnt = s && s.count > 1 ? `<span class="cnt2">${s.count}</span>` : '';
    let dur = '';
    if (kind === 'item' && ITEMS[id]?.tool) {
      const max = ITEMS[id].maxDur, cur = s.dur ?? max;
      const f = Math.max(0, Math.min(1, cur / max));
      const col = f > 0.6 ? '#5dd65d' : f > 0.25 ? '#e6c832' : '#e03232';
      dur = `<div class="dur"><div class="dur-fill" style="width:${f * 100}%;background:${col}"></div></div>`;
    }
    // MC tarzÄ±: numara rozeti yok, sadece ikon + adet + dayanÄ±klÄ±lÄ±k
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
      doors: doorMgr ? doorMgr.serialize() : null,
      torches: (() => { try { const o = {}; for (const [k, f] of torchMap) o[k] = f; return o; } catch { return null; } })(),
      chests: chestMgr ? chestMgr.serialize() : null,
      tnt: (() => { try { return tntSim.serialize(); } catch { return null; } })(),
    });
    const prev = await dbWorlds.get(WORLD_ID).catch(() => null);
    await dbWorlds.put({
      id: WORLD_ID, name: prev?.name || WORLD_NAME || 'DÃ¼nya', seed: SEED_STR,
      gamemode: GAMEMODE, lastPlayed: Date.now(), createdAt: prev?.createdAt || Date.now(),
    });
  } catch {}
}

// ============ OLAYLAR + UI DURUMU ============
const menu = document.getElementById('menu');
const pauseEl = document.getElementById('pauseMenu');
// MC tek oyuncu: menuler acikken simulasyon donar (gun/firin/su/kum/drop).
// Sohbet ve olum ekrani haric â€” onlar akmaya devam eder.
function isPaused() {
  if (!worldReady || locked || player.dead) return false;
  if (typeof chat !== "undefined" && chat && chat.isOpen) return false;
  if (inventory && inventory.isOpen) return true;
  if (craftTable && craftTable.isOpen) return true;
  if (furnaceUI && furnaceUI.isOpen) return true;
  if (typeof chestUI !== "undefined" && chestUI && chestUI.isOpen) return true;
  try { if (pauseEl && !pauseEl.classList.contains("hidden")) return true; } catch {}
  try { if (document.getElementById('settingsPanel') && !document.getElementById('settingsPanel').classList.contains('hidden')) return true; } catch {}
  return false;
}
let wasPaused = false;
function deathHidden() { return document.getElementById('deathScreen').classList.contains('hidden'); }
function anyOverlay() {
  const settingsOpen = !!(document.getElementById('settingsPanel') && !document.getElementById('settingsPanel').classList.contains('hidden'));
  return settingsOpen || (inventory && inventory.isOpen) || (chat && chat.isOpen) || (craftTable && craftTable.isOpen) || (furnaceUI && furnaceUI.isOpen) || (chestUI && chestUI.isOpen) || !deathHidden();
}
function dropOverflowAtPlayer(id, count, kind = null) {
  // Ã§anta dolunca Ã¼retilenler yere dÃ¼ÅŸer (blok+eÅŸya)
  const k = kind || (id >= 100 ? 'item' : 'block');
  for (let i = 0; i < count; i++)
    effects?.spawnDrop(id, Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z), null, k);
}
// Masa/fÄ±rÄ±n panelindeki ayna envanter (27+10, MC sÄ±rasÄ±yla). AynÄ± state'i kullanÄ±r:
// tÄ±klama/sÃ¼rÃ¼kleme ana paneldekiyle birebir Ã§alÄ±ÅŸÄ±r.
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
      try { chestUI?.close(); } catch {}
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
// ============ TNT (Ã§akmak ve Ã§elikle ateÅŸleme + patlama) ============
function explosionEffect(x, y, z) {
  try { playExplode(); } catch {}
  // bÃ¶lgesel patlama efekti: tonlarca taÅŸ/kÄ±vÄ±lcÄ±m + sÄ±cak flaÅŸ Ä±ÅŸÄ±ÄŸÄ±
  try { effects?.burst(Math.floor(x), Math.floor(y), Math.floor(z), 64, 26); } catch {}
  try { effects?.burst(Math.floor(x), Math.floor(y), Math.floor(z), 3, 14); } catch {}
  const L = new THREE.PointLight(0xffc27a, 220, 34, 1.6);
  L.position.set(x, y + 1, z);
  scene.add(L);
  flashLights.push({ L, life: 0.6 });
}
function igniteTNTAt(x, y, z) {
  if (!chunkManager) return;
  chunkManager.setBlock(x, y, z, 0); // blok silinir, primed TNT doÄŸar (MC)
  try { playIgnite(); } catch {}
  try { tntSim.spawn(x, y, z, scene, fallTileMaterial, fallFaceMaterial, 5.0); } catch (e) { console.warn('TNT spawn hatasÄ±:', e); }
  // Hayatta kalmada Ã§eliÄŸin dayanÄ±klÄ±lÄ±ÄŸÄ± 1 eksilir (MC: 64 kullanÄ±m); yaratÄ±cortak eksilmez
  if (GAMEMODE === 'survival' && inventory) {
    const sel = inventory.selectedSlot();
    if (sel && sel.id === 131) {
      sel.dur = (typeof sel.dur === 'number' ? sel.dur : ITEMS[131].maxDur) - 1;
      if (sel.dur <= 0) {
        inventory.hotbar[inventory.sel] = null;
        toast('Ã‡akmak ve Ã§eliÄŸin bitti!');
      }
      try { inventory.renderHot(); inventory.onChange(); } catch {}
    }
  }
  renderHotbar();
}
function tntHooks() {
  return {
    scene, player,
    getBlock: simGet,
    setBlock: (x, y, z, id) => chunkManager.setBlock(x, y, z, id),
    isLoaded: (x, y, z) => {
      try { return chunkManager.chunks.has(Math.floor(x / 16) + ',' + Math.floor(z / 16)); }
      catch { return true; }
    },
    spawnDrop: (id, x, y, z) => effects?.spawnDrop(id, x, y, z),
    dropLoot: (id, x, y, z) => dropBlockLoot(id, x, y, z),
    damagePlayer: (n, reason) => damage(n, reason),
    tileMaterial: fallTileMaterial,
    faceMaterial: fallFaceMaterial,
    onIgniteChain: (x, y, z, fuse) => { try { tntSim.spawn(x, y, z, scene, fallTileMaterial, fallFaceMaterial, fuse); } catch {} },
    explosionEffect,
  };
}
function toggleDoor(x, y, z) {
  const cur = chunkManager.getBlock(x, y, z);
  const bx = x, by = cur === 26 ? y - 1 : y, bz = z;
  if (chunkManager.getBlock(bx, by, bz) !== 25) return;
  const st = doorMgr.get(bx, by, bz);
  st.open = !st.open;
  const cx = Math.floor(bx / 16), cz = Math.floor(bz / 16);
  chunkManager.enqueueMesh(cx, cz);
  const c = chunkManager.chunks.get(cx + ',' + cz);
  if (c) chunkManager.remesh(c);
  renderHotbar();
  saveAll();
}
function pairChest(x, y, z) {
  // KomÅŸu TEK sandÄ±klardan ilk uygunla eÅŸleÅŸ; yÃ¶n komÅŸununkine uyar (MC).
  // ÃœÃ§Ã¼ncÃ¼ sandÄ±k / yÃ¶nsÃ¼z komÅŸu eÅŸleÅŸmez.
  const mine = chestMgr.get(x, y, z);
  const ord = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of ord) {
    const nx = x + dx, nz = z + dz;
    if (chunkManager.getBlock(nx, y, nz) !== 27) continue;
    const nb = chestMgr.peek(nx, y, nz);
    if (!nb || nb.paired) continue;
    mine.face = (nb.face | 0) & 3;
    const mk = chestMgr.key(x, y, z), nk = chestMgr.key(nx, y, nz);
    mine.paired = nk;
    nb.paired = mk;
    chunkManager.enqueueMesh(Math.floor(nx / 16), Math.floor(nz / 16));
    break;
  }
}
function openChest(x, y, z) {
  if (!chestUI || player.dead) return;
  try { craftTable?.close(true); } catch {}
  try { inventory?.close(); } catch {}
  document.exitPointerLock?.();
  chestUI.open(x, y, z);
  refreshMenus();
}
function closeChest() {
  if (!chestUI || !chestUI.isOpen) return;
  chestUI.close();
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
// Hangi menÃ¼ gÃ¶rÃ¼nsÃ¼n? Ä°lk aÃ§Ä±lÄ±ÅŸta ana menÃ¼, sonrasÄ±nda pause menÃ¼sÃ¼.
// BÃ¶ylece oyundayken bir tuÅŸ ana menÃ¼ye fÄ±rlatmaz.
function refreshMenus() {
  if (!worldReady) {
    // Boot: logo+menÃ¼ gÃ¶rÃ¼nÃ¼r, pause gizli. GeÃ§iÅŸ sÄ±rasÄ±nda: hepsi gizli (yÃ¼kleme kaplar).
    // DÃœZELTME: booted sonrasÄ± menÃ¼ gizlenmeyecek â€” aksine her zaman gÃ¶rÃ¼nÃ¼r olacak.
    // YÃ¼kleme ekranÄ± aÃ§Ä±ksa menÃ¼ arkada kalabilir, ama display:none yapÄ±lmaz.
    const loadingOpen = !document.getElementById('loading')?.classList.contains('hidden');
    menu.style.display = loadingOpen && booted ? 'none' : 'flex';
    pauseEl?.classList.add('hidden');
    return;
  }
  const showMain = !locked && !player.dead && !anyOverlay() && (!hasStarted || wantMain);
  const showPause = !locked && !player.dead && !anyOverlay() && hasStarted && !wantMain;
  lockDbg(`menÃ¼ kararÄ±: main=${showMain} pause=${showPause} (kilit=${locked} baÅŸladÄ±=${hasStarted} anaMenÃ¼=${wantMain})`);
  menu.style.display = showMain ? 'flex' : 'none';
  pauseEl?.classList.toggle('hidden', !showPause);
}
function tryLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch((err) => { lockDbg('kilit reddi: ' + (err && err.message ? err.message : err)); refreshMenus(); });
    else setTimeout(refreshMenus, 60);
  } catch (err) { lockDbg('kilit hatasÄ±: ' + err); refreshMenus(); }
}
// ?debug=lock: kilit + menÃ¼ karar gÃ¼nlÃ¼ÄŸÃ¼ (ana menÃ¼ye atma teÅŸhisi)
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
    // MenÃ¼den ilk giriÅŸ: aktif dÃ¼nyayÄ± yÃ¼kle (aÄŸÄ±r iÅŸ sadece burada)
    let id = WORLD_ID;
    try { id = (await dbMeta.get('active-world', null)) || WORLD_ID; } catch {}
    enterWorld(id);
  } else tryLock();
};
document.getElementById('resumeBtn').onclick = () => {
  try { document.getElementById('settingsPanel')?.classList.add('hidden'); } catch {}
  wantMain = false; tryLock();
};
document.getElementById('toMainBtn').onclick = () => { wantMain = true; refreshMenus(); };
document.getElementById('respawnBtn2').onclick = () => {
  player.pos.copy(spawnPos()); player.vel.set(0, 0, 0);
  wantMain = false; tryLock();
};
document.getElementById('pauseSettingsBtn').onclick = () => {
  if (typeof window.openPauseSettings === 'function') window.openPauseSettings();
};
// Canvas'a tÄ±klayÄ±nca kilidi geri al (envanter/sohbet kapandÄ±ktan sonra takÄ±lmayÄ± Ã¶nler)
canvas.addEventListener('click', () => {
  if (!worldReady || locked || player.dead || anyOverlay()) return;
  wantMain = false;
  tryLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  lockDbg(locked ? 'kilit ALINDI' : 'kilit BIRAKILDI');
  if (locked) { hasStarted = true; wantMain = false; mouseGuard = true; }
  else { mouseL = false; mouseR = false; placeCd = 0; hideBreakBar(); effects?.hideCrack(); }
  refreshMenus();
});
let mouseGuard = true; // kilit sonrasi ilk olaydaki sicrama artigi yoksay
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  if (mouseGuard) { mouseGuard = false; return; }
  const sens = ((window.gameSettings && typeof window.gameSettings.mouseSensitivity === 'number') ? window.gameSettings.mouseSensitivity : 100) / 100;
  const invert = (window.gameSettings && window.gameSettings.invertMouse) ? -1 : 1;
  // Tarayici kilit gecislerinde dev movementX firlatir (360 donme); kelepcele (MC hissi ayni)
  const dx = Math.max(-60, Math.min(60, e.movementX || 0));
  const dy = Math.max(-60, Math.min(60, e.movementY || 0));
  player.yaw -= dx * 0.0025 * sens;
  player.pitch -= dy * 0.0025 * sens * invert;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.55, 1.55);
  camera.rotation.order = 'YXZ'; // emniyet: sira hicbir zaman bozulmasin
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
    // E ile kapatÄ±nca oyuna dÃ¶nÃ¼ÅŸÃ¼ dene (baÅŸarÄ±sÄ±zsa pause menÃ¼sÃ¼ gelir)
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
  if (chat && chat.isOpen) return; // sohbet kendi tuÅŸlarÄ±nÄ± yÃ¶netir
  if (typingTarget(e)) { if (e.code !== 'Escape') return; }
  const sp = document.getElementById('settingsPanel');
  if (e.code === 'Escape' && sp && !sp.classList.contains('hidden')) {
    sp.classList.add('hidden');
    refreshMenus();
    return;
  }
  if (e.code === 'Escape' && inventory && inventory.isOpen) { toggleInventory(); return; }
  if (e.code === 'Escape' && craftTable && craftTable.isOpen) { closeTable(true); return; }
  if (e.code === 'Escape' && furnaceUI && furnaceUI.isOpen) { closeFurnace(); return; }
  if (e.code === 'Escape' && chestUI && chestUI.isOpen) { closeChest(); return; }
  keys[e.code] = true;

  // SÃ¼rÃ¼nme (Shift) â€” MC gibi yavaÅŸlatÄ±r, kenardan dÃ¼ÅŸmeme saÄŸlar
  // Envanter/craft/fÄ±rÄ±n/sandÄ±k gibi panel aÃ§Ä±kken eÄŸilim devre dÄ±ÅŸÄ±
  // EÄŸilme sprint'i iptal eder (koÅŸarken eÄŸilip yÃ¼rÃ¼yemeyiz)
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !anyOverlay()) {
    player.sneaking = true;
    player.sprinting = false; // eÄŸilince koÅŸma durur
  }

  // Ã‡ift-W koÅŸma (MC sprint) â€” SÃœRÃœNME (Shift) aÃ§Ä±kken iki kez W basÄ±nca HIZLANMAYACAK
  // !e.repeat: TuÅŸa basÄ±lÄ± tutulduÄŸunda tarayÄ±cÄ±nÄ±n OS key-repeat gÃ¶ndermesini engeller (sadece fiziksel Ã§ift tÄ±klamayla Ã§alÄ±ÅŸÄ±r)
  if (e.code === 'KeyW' && !e.repeat && locked && !player.dead && !player.flying && !anyOverlay() && !player.sneaking) {
    const now = performance.now();
    if (now - lastWTime < DOUBLE_TAP_MS) {
      player.sprinting = true;
    }
    lastWTime = now;
  }

  // Kilit yoksa oyun tuÅŸlarÄ± Ã§alÄ±ÅŸmaz (envanter/masa/fÄ±rÄ±n aÃ§Ä±kken E/Esc hariÃ§).
  // BÃ¶ylece kilitsizken basÄ±lan tuÅŸlar oyunun durumunu bozamaz.
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
    else if (chestUI && chestUI.isOpen) closeChest();
    else if (locked || (inventory && inventory.isOpen)) toggleInventory();
  }
  if (e.code === 'KeyH') document.getElementById('helpPanel').classList.toggle('hidden');
  if (e.code === 'KeyT' && locked && !player.dead) { e.preventDefault(); chat?.open(false); }
  if (e.code === 'Slash' && locked && !player.dead) { e.preventDefault(); chat?.open(true); }
    if (e.code === 'Space' && !e.repeat && locked && !player.dead && GAMEMODE === 'creative' && !anyOverlay()) {
    // MC: yaratÄ±cÄ±da Ã§ift-Space uÃ§mayÄ± aÃ§ar/kapatÄ±r (basÄ±lÄ± tutma sayÄ±lmaz)
    const now = performance.now();
    if (now - lastSpaceT < DOUBLE_SPACE_MS) {
      lastSpaceT = 0;
      player.flying = !player.flying;
      targetFlying = player.flying;
      if (player.flying) {
        // YumuÅŸak kalkÄ±ÅŸ: hafif yukarÄ± ivme ve kamera yaylanma animasyonu
        player.vel.y = 2.0;
        flyTransitionY = 0.28;
      } else {
        player.vel.y = -0.5;
        flyTransitionY = 0;
      }
      toast(player.flying ? 'UÃ§ma aÃ§Ä±k' : 'UÃ§ma kapalÄ±');
    } else lastSpaceT = now;
  }
  if (e.code === 'KeyQ' && locked && !player.dead && chunkManager) {
    // MC gibi seÃ§ili slot'tan 1 tane yere at (blok+eÅŸya, iki modda da).
    // Q her basÄ±ÅŸta 1 eksiltir (alet elden gider) â€” iki modda da, ev kuralÄ±
    const sel = inventory?.selectedSlot();
    if (sel) {
      const sk = sel.kind || (sel.id >= 100 ? 'item' : 'block');
      const isTool = sk === 'item' && ITEMS[sel.id]?.tool;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const eye = player.pos.clone(); eye.y += EYE;
      const dropAt = [Math.floor(eye.x + dir.x), Math.floor(eye.y), Math.floor(eye.z + dir.z)];
      const dropVel = new THREE.Vector3(dir.x * 6, 2.5, dir.z * 6);
      if (isTool) {
        // Alet Q ile elden gider (iki modda da, ev kurali); dusen kopya ayni dayaniklilikta
        const dd = sel.dur;
        inventory.hotbar[inventory.sel] = null;
        effects?.spawnDrop(sel.id, dropAt[0], dropAt[1], dropAt[2], dropVel, sk, dd);
        inventory.renderHot();
        inventory.onChange();
      } else if (inventory.consumeSelected(true)) {
        // Stack her basista 1 eksilir (yaraticida da, ev kurali)
        effects?.spawnDrop(sel.id, dropAt[0], dropAt[1], dropAt[2], dropVel, sk);
        renderHotbar();
      }
    }
  }
    if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !anyOverlay()) {
    player.sneaking = false;
  }
  // KoÅŸma: W bÄ±rakÄ±lÄ±nca durur (MC gibi sÃ¼rekli basÄ±lÄ± tutma gerekmez ama ici basit tutuyoruz)
  if (e.code === 'KeyW') {
    player.sprinting = false;
  }
});
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
// basÄ±lÄ±-tutarak kÄ±rma (survival) + basÄ±lÄ±-tutup koyma (MC gibi) durumu
let mouseL = false;
let mouseR = false;
let placeCd = 0;
let creativeBreakCd = 0;
const PLACE_INTERVAL = 0.2; // MC hissi: sn'de ~5 blok
const CREATIVE_BREAK_INTERVAL = 0.25; // ilk vurus aninda, tekrar yavas (spam korumasi) // yaratÄ±cÄ±da neredeyse anÄ±nda (MC)
let breakTarget = null; // "x,y,z"
let breakProg = 0;
let breakCd = 0; // MC 6-tick blok-arasi bekleme
let lastSpaceT = 0; // Ã§ift-Space uÃ§ma takibi (MC)
const DOUBLE_SPACE_MS = 300;
function hideBreakBar() {
  breakTarget = null; breakProg = 0;
  document.getElementById('breakBar')?.classList.add('hidden');
  try { effects?.hideCrack(); } catch {}
}
function faceFromYaw() {
  const lx = -Math.sin(player.yaw), lz = -Math.cos(player.yaw);
  return Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 3 : 2) : (lz > 0 ? 1 : 0);
}
function heldToolId() { return inventory ? inventory.selectedToolId() : 0; }
// Blok fiziÄŸi kancasÄ±: her setBlock (koyma/kÄ±rma/komut/su/fizik) burayÄ± besler.
// getSafe: yÃ¼klenmemiÅŸ chunk = -1 (katÄ± sayÄ±lÄ±r, boÅŸluÄŸa akma yok).
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
    // MC: meÅŸaleye inen kum/Ã§akÄ±l eÅŸya olur, MEÅALE YERÄ°NDE KALIR (Ã§iftlikler buna gÃ¼venir)
    onTorchCrush: (x, y, z, id) => {
      effects?.spawnDrop(id, x, y, z);
    },
    spawnDrop: (id, x, y, z) => effects?.spawnDrop(id, x, y, z),
  };
}
// DÃ¼ÅŸen kum/Ã§akÄ±l gÃ¶rseli: blok dokulu malzeme (dokubaÅŸÄ± Ã¶nbellekli)
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
// YÃ¼z-bazlÄ± malzeme (primed TNT vb.: Ã¼st/alt yÃ¼z kendi doÄŸru dokusuyla gÃ¶rÃ¼nÃ¼r)
const fallFaceMatCache = {};
function fallFaceMaterial(id, dir) {
  const key = id + ':' + dir;
  if (!fallFaceMatCache[key]) {
    const b = BLOCKS[id];
    if (!b) return fallTileMaterial(id);
    const texName = dir === 'py' ? b.top : dir === 'ny' ? b.bottom : (b.all ?? b.side);
    const rect = atlas?.uvMap?.[texName] || atlas?.uvMap?.['stone'];
    const src = atlas.canvas;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, rect.u0 * src.width, (1 - rect.v1) * src.height,
      (rect.u1 - rect.u0) * src.width, (rect.v1 - rect.v0) * src.height, 0, 0, 16, 16);
    const T = { oak_leaves: '#77AB2F', birch_leaves: '#80A755', spruce_leaves: '#619961', grass_block_top: '#91BD59', water_still: '#3F76E4' }[texName];
    if (T) {
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = 16;
      tmp.getContext('2d').drawImage(c, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = T; g.fillRect(0, 0, 16, 16);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(tmp, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    // Primed blink emissive'i iÃ§in baÄŸÄ±msÄ±z instance (shared cache deÄŸil)
    fallFaceMatCache[key] = new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveIntensity: 0 });
  }
  return fallFaceMatCache[key];
}
// MC dÃ¼ÅŸÃ¼m tablosu â€” kÄ±rÄ±lma ve TNT patlamasÄ± paylaÅŸÄ±r.
// Ã‡akÄ±l: MC 1.21.1 â€” %10 Ã§akmak, %90 Ã§akÄ±lÄ±n kendisi (Silk Touch yok).
function dropBlockLoot(realId, x, y, z, tool = heldToolId()) {
  const info = breakInfo(realId, tool);
  if (!info.drops) return;
  if (realId === 1 || realId === 18) effects?.spawnDrop(2, x, y, z); // toprak
  else if (realId === 3) effects?.spawnDrop(4, x, y, z); // kÄ±rÄ±k taÅŸ
  else if (realId === 11) effects?.spawnDrop(101, x, y, z, null, 'item'); // kÃ¶mÃ¼r
  else if (realId === 12) effects?.spawnDrop(105, x, y, z, null, 'item'); // ham demir
  else if (realId === 23) effects?.spawnDrop(106, x, y, z, null, 'item'); // ham altÄ±n
  else if (realId === 13) effects?.spawnDrop(104, x, y, z, null, 'item'); // elmas
  else if (realId === 24) effects?.spawnDrop(22, x, y, z); // yanÄ±k fÄ±rÄ±n -> sÃ¶nmÃ¼ÅŸ fÄ±rÄ±n
  else if (realId === 25 || realId === 26) { effects?.spawnDrop(25, x, y, z); effects?.spawnDrop(25, x, y, z); } // kapÄ±: 2 eÅŸya (ev kuralÄ±)
  else if (realId === 15) { const flint = Math.random() < 0.1; effects?.spawnDrop(flint ? 130 : 15, x, y, z, null, flint ? 'item' : 'block'); }
  else effects?.spawnDrop(realId, x, y, z); // yerden toplanÄ±r
}

function breakInstant(hit) {
  // YaratÄ±cÄ±da anakaya dahil her ÅŸey kÄ±rÄ±lÄ±r (MC). Hayatta kalmada asla.
  if (hit.id === 10 && GAMEMODE !== 'creative') { toast('Anakaya kÄ±rÄ±lmaz!'); return; }
  const bid = chunkManager.getBlock(hit.x, hit.y, hit.z);
  const realId = bid || hit.id;
  chunkManager.setBlock(hit.x, hit.y, hit.z, 0);
  trackTorch(hit.x, hit.y, hit.z, 0);
  try { popUnsupportedTorches(hit.x, hit.y, hit.z); } catch {} // desteksiz meÅŸale dÃ¼ÅŸer (MC) Ä±ÅŸÄ±k listesinden dÃ¼ÅŸer
  if (realId === 22 || realId === 24) {
    // FÄ±rÄ±n kÄ±rÄ±lÄ±nca iÃ§i yere saÃ§Ä±lÄ±r + sÃ¶nmÃ¼ÅŸ blok dÃ¼ÅŸer (MC)
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
  if (realId === 25 || realId === 26) {
    // KapÄ±: HANGÄ° yarÄ± kÄ±rÄ±lÄ±rsa kÄ±rÄ±lsÄ±n iki hÃ¼cre de gider (iki modda da).
    // Eski hata: Ã¼st yarÄ± kÄ±rÄ±lÄ±nca alt yarÄ±ya hiÃ§ bakÄ±lmÄ±yordu (otherY yanlÄ±ÅŸ hÃ¼creydi).
    const baseY = realId === 25 ? hit.y : hit.y - 1;
    const topY = baseY + 1;
    try { if (chunkManager.getBlock(hit.x, topY, hit.z) === 26) chunkManager.setBlock(hit.x, topY, hit.z, 0); } catch {}
    try { if (chunkManager.getBlock(hit.x, baseY, hit.z) === 25) chunkManager.setBlock(hit.x, baseY, hit.z, 0); } catch {}
    try { doorMgr.remove(hit.x, baseY, hit.z); } catch {}
    try { popUnsupportedTorches(hit.x, baseY, hit.z); } catch {}
    try { popUnsupportedTorches(hit.x, topY, hit.z); } catch {}
  }
  if (realId === 27 && GAMEMODE === 'survival') {
    // SandÄ±k: bu yarÄ±nÄ±n 27 slotu saÃ§Ä±lÄ±r + sandÄ±k bloÄŸu dÃ¼ÅŸer (MC yarÄ±-baÅŸÄ±na entity)
    try {
      const cst = chestMgr.peek(hit.x, hit.y, hit.z);
      if (cst) {
        for (const slot of cst.slots) {
          if (!slot) continue;
          const sk = slot.kind || (slot.id >= 100 ? 'item' : 'block');
          const n = (sk === 'item' && ITEMS[slot.id]?.tool) ? 1 : slot.count;
          for (let i = 0; i < n; i++) effects?.spawnDrop(slot.id, hit.x, hit.y, hit.z, null, sk, slot.dur);
        }
        if (cst.paired) {
          const [px, py, pz] = cst.paired.split(',').map(Number);
          const ps = chestMgr.peek(px, py, pz);
          if (ps) ps.paired = null; // kalan yarÄ± tek sandÄ±ÄŸa dÃ¶ner
        }
      }
    } catch {}
    chestMgr.remove(hit.x, hit.y, hit.z);
    try { if (chestUI?.pos && ((chestUI.pos.x === hit.x && chestUI.pos.y === hit.y && chestUI.pos.z === hit.z) || (chestUI.halves().length > 1 && chestUI.halves()[1].key === hit.x + ',' + hit.y + ',' + hit.z))) chestUI.close(); } catch {}
  }
  // Odun kÄ±rÄ±ldÄ±ÄŸÄ±nda yakÄ±ndaki yapraklarÄ± Ã§Ã¼rÃ¼me listesine al (leaf decay)
  if (realId === 5 || realId === 65 || realId === 68) {
    const now = Date.now();
    for (let dx = -LEAF_DECAY_RADIUS; dx <= LEAF_DECAY_RADIUS; dx++) {
      for (let dy = -LEAF_DECAY_RADIUS; dy <= LEAF_DECAY_RADIUS; dy++) {
        for (let dz = -LEAF_DECAY_RADIUS; dz <= LEAF_DECAY_RADIUS; dz++) {
          const bx = hit.x + dx, by = hit.y + dy, bz = hit.z + dz;
          const bid = chunkManager.getBlock(bx, by, bz);
          if (bid === 6 || bid === 67 || bid === 70) { // yaprak (meÅŸe/huÅŸ/ladin)
            decayingLeaves.set(bx + ',' + by + ',' + bz, now + LEAF_DECAY_DELAY_MS);
          }
        }
      }
    }
  }
  effects?.burst(hit.x, hit.y, hit.z, realId);
  if (GAMEMODE === 'survival' && realId !== 16 && BLOCKS[realId] && !BLOCKS[realId].secilemez) {
    const tool = heldToolId();
    if (breakInfo(realId, tool).drops) dropBlockLoot(realId, hit.x, hit.y, hit.z, tool);
    // Alet yÄ±pranmasÄ± (Ã§akmak ve Ã§elik madencilikle yÄ±pranmaz; MC: ateÅŸ yakÄ±nca eksilir)
    const itm = tool ? ITEMS[tool] : null;
    if (tool && itm && !itm.neverWornByMining) {
      const broke = inventory.damageHeldTool(1);
      if (broke) toast('Aletin kÄ±rÄ±ldÄ±!');
      renderHotbar();
    }
  }
  hideBreakBar();
  effects?.hideCrack();
}
function tryPlaceFromCross() {
  // MC gibi niÅŸangÃ¢htan blok koy. 'table'/'furnace' dÃ¶nerse panel aÃ§Ä±ldÄ± (tutmayÄ± bÄ±rak).
  if (!chunkManager || player.dead) return 'none';
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const eye = player.pos.clone(); eye.y += EYE;
  const hit = raycastVoxel(eye, dir, REACH);
  if (!hit) return 'none';
  if (hit.id === 20) { openTable(); return 'table'; } // Ã§alÄ±ÅŸma masasÄ±: yerleÅŸtirme deÄŸil panel
  if (hit.id === 22 || hit.id === 24) { openFurnace(hit.x, hit.y, hit.z); return 'furnace'; } // fÄ±rÄ±n paneli
  if (hit.id === 25 || hit.id === 26) { toggleDoor(hit.x, hit.y, hit.z); return 'door'; } // kapÄ± aÃ§/kapa
  if (hit.id === 27) { openChest(hit.x, hit.y, hit.z); return 'chest'; } // sandÄ±k paneli
  // TNT: elde Ã§akmak ve Ã§elik varken saÄŸ tÄ±k -> ateÅŸle (MC). Yoksa normal koyma davranÄ±ÅŸÄ±.
  if (hit.id === 64) {
    const sel = inventory?.selectedSlot();
    if (sel && (sel.kind || 'item') === 'item' && sel.id === 131) {
      igniteTNTAt(hit.x, hit.y, hit.z);
      return 'tnt';
    }
  }
  const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
  if (py < MIN_Y || py > MAX_Y) { toast('YÃ¼kseklik sÄ±nÄ±rÄ±!'); return 'none'; }
  const cur = chunkManager.getBlock(px, py, pz);
  if (cur !== 0 && cur !== 16 && cur !== 21) return 'none'; // hava/su/meÅŸale Ã¼stÃ¼ne kurulur
  if (playerInside(px, py, pz)) return 'none';
  const id = selectedId();
  if (!id) {
    const sel = inventory?.selectedSlot();
    if (sel && (sel.kind || 'block') === 'item') { toast('Alet yerleÅŸtirilemez!'); return 'none'; }
    toast('Hotbar boÅŸ! (E ile blok al)');
    return 'none';
  }
  // KapÄ± (25): hedef + Ã¼st hÃ¼creye alt/Ã¼st yarÄ±; ikisi de boÅŸ olmalÄ± (MC)
  if (id === 25) {
    if (py + 1 > MAX_Y) { toast('YÃ¼kseklik sÄ±nÄ±rÄ±!'); return 'none'; }
    const sup = chunkManager.getBlock(px, py - 1, pz);
    const sb = BLOCKS[sup];
    if (!sup || !sb || sb.saydam) { toast('KapÄ± altÄ± katÄ± blok ister!'); return 'none'; }
    const cur2 = chunkManager.getBlock(px, py + 1, pz);
    if (cur2 !== 0 && cur2 !== 16 && cur2 !== 21) return 'none';
    if (playerInside(px, py, pz) || playerInside(px, py + 1, pz)) return 'none';
    if (GAMEMODE === 'survival' && !inventory.consumeSelected()) { toast('Blok yok!'); return 'none'; }
    chunkManager.setBlock(px, py, pz, 25);
    chunkManager.setBlock(px, py + 1, pz, 26);
    trackTorch(px, py, pz, 25);
    trackTorch(px, py + 1, pz, 26);
    try {
      const dst = doorMgr.get(px, py, pz);
      dst.face = faceFromYaw();
      dst.hinge = 1;
      // MC cift kapi: yandaki kapiyla ayni yone bak, mentese ters (tam duz durur)
      const ord = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of ord) {
        if (chunkManager.getBlock(px + dx, py, pz + dz) !== 25) continue;
        const nb = doorMgr.peek(px + dx, py, pz + dz);
        if (!nb) continue;
        dst.face = (nb.face | 0) & 3;
        dst.hinge = (nb.hinge < 0 ? -1 : 1) < 0 ? 1 : -1;
        break;
      }
    } catch {}
    renderHotbar();
    return 'placed';
  }
  if (id === 26) { toast('KapÄ±yÄ± alt yarÄ±dan koy!'); return 'none'; }
  // MeÅŸale: Ã¼st yÃ¼ze tÄ±klama = yerde (altÄ± katÄ± olmalÄ±), yan yÃ¼ze = duvarda (tÄ±klanan blok destek).
  // Tavan altÄ± geÃ§ersiz (MC).
  let torchFace = 0;
  if (id === 21) {
    if (hit.ny === 1) {
      const below = chunkManager.getBlock(px, py - 1, pz);
      const bb = BLOCKS[below];
      if (!below || !bb || bb.saydam) { toast('MeÅŸale alta katÄ± blok ister!'); return 'none'; }
      torchFace = 0;
    } else if (hit.ny === 0) {
      const sx = -hit.nx, sy = -hit.ny, sz = -hit.nz; // destek yÃ¶nÃ¼ (tiklanan blok)
      torchFace = sx === 1 ? 3 : sx === -1 ? 4 : sz === 1 ? 1 : 2;
    } else { toast('MeÅŸale alta ya da duvara konur!'); return 'none'; }
  }
  if (GAMEMODE === 'survival' && !inventory.consumeSelected()) { toast('Blok yok!'); return 'none'; }
  chunkManager.setBlock(px, py, pz, id);
  trackTorch(px, py, pz, id, torchFace);
  if (id === 27) {
    try { chestMgr.get(px, py, pz).face = faceFromYaw(); } catch {}
    try { pairChest(px, py, pz); } catch {}
  }
  if (id === 22) {
    // Firin on yuzu oyuncuya bakar (MC): bakis yonunun tersi
    try {
      const lx = -Math.sin(player.yaw), lz = -Math.cos(player.yaw);
      const face = Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 3 : 2) : (lz > 0 ? 1 : 0);
      furnaceMgr.get(px, py, pz).face = face;
    } catch {}
  }
  renderHotbar();
  return 'placed';
}
function tryBreakFromCross() {
  // Creative basÄ±lÄ±-tut kÄ±rma iÃ§in (survival zaten mouseL+progress ile kÄ±rÄ±yor)
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
      mouseL = true; creativeBreakCd = CREATIVE_BREAK_INTERVAL; // basÄ±lÄ± tutunca sÃ¼rekli kÄ±r (MC)
    }
    else { mouseL = true; breakTarget = null; breakProg = 0; }
  } else if (e.button === 2) {
    // MC: saÄŸ basÄ±lÄ± tutunca sÃ¼rekli koy â€” ilk bloÄŸu hemen koy, gerisi dÃ¶ngÃ¼de
    const r = tryPlaceFromCross();
    if (r === 'table' || r === 'furnace' || r === 'door' || r === 'chest') { mouseR = false; return; }
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

// ============ DÃ–NGÃœ ============
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

  const paused = isPaused();
  if (paused && !wasPaused) { try { saveAll(); } catch {} } // duraklatmada otomatik kayit (MC)
  wasPaused = paused;
  const simDt = paused ? 0 : dt;
  if (locked) movePlayer(simDt);

  if (chunkManager) {
    chunkManager.updateStreaming(player.pos.x, player.pos.z);
    // Adaptif bÃ¼tÃ§e: Ã¶nceki kare yavaÅŸsa (<30fps) bu kare Ã¼retim/mesh atlanÄ±r.
    // Oyun davranÄ±ÅŸÄ± deÄŸiÅŸmez, sadece takÄ±lma anÄ±nda kuyruk bir kare bekler.
    if (dt <= 0.034) chunkManager.processQueues();
    chunkManager.processSaves(1);
  }
  const targetEye = (player.sneaking && !player.flying) ? (EYE - 0.24) : EYE;
  currentEye += (targetEye - currentEye) * Math.min(1, dt * 15);
  camera.position.set(player.pos.x, player.pos.y + currentEye, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  // FOV yumuÅŸak geÃ§iÅŸ (sprint/uÃ§ma ile FOV artÄ±ÅŸÄ±)
  const fovLerp = Math.min(1, dt * 10);
  currentFov += (targetFov - currentFov) * fovLerp;
  camera.fov = currentFov;
  camera.updateProjectionMatrix();

  // UÃ§ma animasyonu: yaratÄ±cÄ± modda uÃ§arken yumuÅŸak sÃ¼zÃ¼lme ve yaylanma animasyonu
  if (player.flying && GAMEMODE === 'creative' && locked) {
    flyBobPhase += dt * 3.5;
    const flyBob = Math.sin(flyBobPhase) * 0.035;
    if (flyTransitionY > 0) {
      flyTransitionY = Math.max(0, flyTransitionY - dt * 1.2);
    }
    camera.position.y += flyBob + flyTransitionY;
  }

  // KoÅŸma (sprint): kamera sarsÄ±lmaz, yumuÅŸak FOV geÃ§iÅŸi ile hÄ±z hissi saÄŸlanÄ±r
  camera.rotation.z = 0;
  // ---- gÃ¼n dÃ¶ngÃ¼sÃ¼ (/time): zaman akar, gÃ¼neÅŸ/ay/yÄ±ldÄ±z senkron ----
  timeOfDay = (timeOfDay + (simDt * 24000) / DAY_LENGTH_S) % 24000;
  {
    const ang = ((timeOfDay - 6000) / 24000) * Math.PI * 2; // Ã¶ÄŸle=0
    const elev = Math.cos(ang); // 1 Ã¶ÄŸle, -1 gece
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
  // ---- su altÄ± (MC gibi: yoÄŸun mavi fog + perde) ----
  {
    const headY = player.pos.y + EYE;
    const uw = !!chunkManager && getBlock(Math.floor(camera.position.x), Math.floor(headY), Math.floor(camera.position.z)) === 16;
    if (uw !== headUnderwater) {
      headUnderwater = uw;
      document.getElementById('waterOverlay')?.classList.toggle('hidden', !uw);
    }
    // Su altÄ± oksijen & boÄŸulma sistemi (MC 1.21.1: 300 tick / 15 sn, bitince 1 sn'de 1 kalp hasar)
    if (GAMEMODE === 'survival' && !player.dead) {
      if (uw) {
        player.oxygen = Math.max(0, player.oxygen - 20 * simDt);
        if (player.oxygen <= 0) {
          player.drownTimer = (player.drownTimer || 0) + simDt;
          if (player.drownTimer >= 1.0) {
            player.drownTimer = 0;
            damage(2, 'BoÄŸuldun');
          }
        }
      } else {
        player.drownTimer = 0;
        if (player.oxygen < 300) {
          // Sudan Ã§Ä±kÄ±nca baloncuklar normal/hÄ±zlÄ± ÅŸekilde dolar (MC: saniyede ~5-10 balon)
          player.oxygen = Math.min(300, player.oxygen + 300 * simDt);
        }
      }
      updateBubbles();
    } else {
      player.oxygen = 300;
      player.drownTimer = 0;
      updateBubbles();
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
    c.position.x += simDt * 0.7;
    if (c.position.x > player.pos.x + 90) c.position.x = player.pos.x - 90;
    if (c.position.x < player.pos.x - 90) c.position.x = player.pos.x + 90;
    if (c.position.z > player.pos.z + 90) c.position.z = player.pos.z - 90;
    if (c.position.z < player.pos.z - 90) c.position.z = player.pos.z + 90;
    c.position.y = 185 + (c.id % 7);
  });

  if (border) {
    const b = border.update(simDt, player.pos.x, player.pos.z);
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
        // MeÅŸale ince direk: seÃ§im kutusu da kÃ¼Ã§Ã¼k (MC hissi)
        highlight.scale.set(0.25, 0.7, 0.25);
        highlight.position.set(hit.x + 0.5, hit.y + 0.35, hit.z + 0.5);
      } else {
        highlight.scale.set(1, 1, 1);
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      }
    }
    else highlight.visible = false;
    // MC: saÄŸ basÄ±lÄ± sÃ¼rekli koyma (yaratÄ±cÄ± + hayatta kalma). Masa/fÄ±rÄ±n aÃ§Ä±lÄ±rsa tutmayÄ± bÄ±rak.
    if (mouseR && !anyOverlay()) {
      placeCd -= dt;
      if (placeCd <= 0) {
        const r = tryPlaceFromCross();
        if (r === 'table' || r === 'furnace' || r === 'door' || r === 'chest') mouseR = false;
        else placeCd = PLACE_INTERVAL;
        // survival'da blok bittiyse spam yapma: bir sÃ¼re bekle
        if (r === 'none' && GAMEMODE === 'survival' && !selectedId()) placeCd = 0.5;
      }
    }
    // MC: creative sol basÄ±lÄ± sÃ¼rekli kÄ±rma (neredeyse anÄ±nda)
    if (mouseL && GAMEMODE === 'creative' && !anyOverlay()) {
      creativeBreakCd -= dt;
      if (creativeBreakCd <= 0) {
        if (hit) breakInstant(hit);
        creativeBreakCd = CREATIVE_BREAK_INTERVAL;
      }
    }
    // survival basÄ±lÄ±-tut kÄ±rma (alet hÄ±zÄ± + hasat kuralÄ±)
    const bar = document.getElementById('breakBar');
    const fill = document.getElementById('breakFill');
    if (mouseL && GAMEMODE === 'survival') {
      if (!hit) { hideBreakBar(); }
      else {
        const key = hit.x + ',' + hit.y + ',' + hit.z;
        if (breakTarget !== key) { breakTarget = key; breakProg = 0; breakCd = 0.3; }
        const baseNeed = BREAK_TIME[hit.id] ?? 1;
        if (!isFinite(baseNeed)) { toast('Anakaya kÄ±rÄ±lmaz!'); mouseL = false; hideBreakBar(); }
        else {
          // Alet Ã§arpanÄ± (MC): doÄŸru alet hÄ±zlÄ±, yanlÄ±ÅŸ alet 3.33x, yumuÅŸak el hÄ±zÄ±
          const tool = heldToolId();
          const info = breakInfo(hit.id, tool);
          const need = baseNeed * (info.timeMult || 1);
          let gate = true;
          if (breakCd > 0) { breakCd -= dt; if (need > 0.05) gate = false; }
          if (gate) breakProg += dt / need;
          bar?.classList.remove('hidden');
          if (fill) fill.style.width = Math.min(100, breakProg * 100) + '%';
          effects?.crack(hit.x, hit.y, hit.z, breakProg);
          // hedef deÄŸiÅŸtiyse gÃ¼ncel id ile kÄ±r
          const cur = chunkManager.getBlock(hit.x, hit.y, hit.z);
          if (!cur) { hideBreakBar(); }
          else if (breakProg >= 1) { breakInstant({ ...hit, id: cur }); renderHotbar(); }
        }
      }
    } else if (!mouseL) { bar?.classList.add('hidden'); }
  } else { highlight.visible = false; if (!mouseL) document.getElementById('breakBar')?.classList.add('hidden'); }

  coordsEl.textContent = `${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}`;
  // efektler: partikÃ¼l + dÃ¼ÅŸen eÅŸya (iki modda da yerden toplanÄ±r, MC gibi)
  effects?.update(simDt, new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z),
    !player.dead,
    (id, kind, dur) => {
      const k = kind || (id >= 100 ? 'item' : 'block');
      const ok = inventory ? inventory.addItem(id, 1, k, (typeof dur === 'number') ? dur : null) : false;
      if (ok) { renderHotbar(); try { furnaceUI?.renderAll(); } catch {} }
      return ok;
    });
  // FÄ±rÄ±n tick (0.2sn birikimli): eritme + yakÄ±t
  furnTickAcc += simDt;
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
      // Yanma geÃ§iÅŸi (sÃ¶nmÃ¼ÅŸ<->yanÄ±k): blok takasÄ± + remesh (MC yanÄ±k fÄ±rÄ±n aÄŸzÄ±)
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
  // Kum/Ã§akÄ±l yerÃ§ekimi: MC fiziÄŸiyle dÃ¼ÅŸen-varlÄ±k (16 blok/snÂ², limit 39.2)
  if (chunkManager && fallSim.size) {
    if (!paused) { try { fallSim.update(dt, simHooks()); } catch {} }
  }
  // TNT: primed varlÄ±klar (fitil + fizik) â€” patlama yÄ±kÄ±mÄ± blast dayanÄ±klÄ±lÄ±ÄŸa gÃ¶re
  if (chunkManager && tntSim.size) {
    if (!paused) { try { tntSim.update(dt, tntHooks()); } catch (e) { console.warn('TNT tick hatasÄ±:', e); } }
  }
  // Patlama flaÅŸ Ä±ÅŸÄ±klarÄ±: hÄ±zlÄ± sÃ¶nÃ¼m
  if (flashLights.length) {
    for (let i = flashLights.length - 1; i >= 0; i--) {
      const f = flashLights[i];
      f.life -= dt;
      f.L.intensity = Math.max(0, f.life / 0.6) * 220;
      if (f.life <= 0) { try { scene.remove(f.L); f.L.dispose?.(); } catch {} flashLights.splice(i, 1); }
    }
  }
  // Su dolgusu: 0.25sn tick, bÃ¼tÃ§eli (MC-lite)
  waterTickAcc += simDt;
  if (waterTickAcc > 0.25 && chunkManager && waterSim.size) {
    waterTickAcc = 0;
    try { waterSim.step(40, simHooks()); } catch {}
  }
  // gÃ¶lge kÄ±smasÄ±: SADECE gÃ¼neÅŸ hÃ¼cresi deÄŸiÅŸince / 10sn periyot.
  // (Mesh sayacÄ±na baÄŸlanmaz: streaming sÄ±rasÄ±nda her kare 2x Ã§izim biter.)
  frameNo++;
  // meÅŸale Ä±ÅŸÄ±klarÄ±: 0.4sn'de bir en yakÄ±nlara ata (her kare tarama yok)
  torchScanT += dt;
  if (torchScanT > 0.4) { torchScanT = 0; try { updateTorchLights(); } catch {} }
  if (chunkManager) {
    const cell = `${Math.floor(player.pos.x / 8)},${Math.floor(player.pos.y / 8)},${Math.floor(player.pos.z / 8)}`;
    if (cell !== lastShadowCell || frameNo % 600 === 0) {
      lastShadowCell = cell;
      renderer.shadowMap.needsUpdate = true;
    }
  }
  // ?debug=perf: kare sÃ¼resi + kuyruk derinlikleri
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
        `chunk: ${cc} | Ã¼ret-kuyruÄŸu: ${chunkManager.genQueue.length} | mesh-kuyruÄŸu: ${chunkManager.meshQueue.size} | kayÄ±t-kuyruÄŸu: ${sq}<br>` +
        `drawcall: ${renderer.info.render.calls} | Ã¼Ã§gen: ${(renderer.info.render.triangles / 1000).toFixed(0)}k`;
    }
    fpsAcc = 0; fpsN = 0; fpsT = 0;
    perfAcc.ms = 0; perfAcc.max = 0; perfAcc.n = 0;
  }

  // Yaprak Ã§Ã¼rÃ¼me: her saniyede bir iÅŸaretli yapraklarÄ± kontrol et
  if (chunkManager && !paused) {
    lastLeafDecayCheck += dt;
    if (lastLeafDecayCheck >= 1.0) {
      lastLeafDecayCheck = 0;
      const now = Date.now();
      const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
      for (const [k, decayTime] of decayingLeaves.entries()) {
        if (now < decayTime) continue;
        const [bx, by, bz] = k.split(',').map(Number);
        const dist2 = (bx + 0.5 - px) ** 2 + (by + 0.5 - py) ** 2 + (bz + 0.5 - pz) ** 2;
        // Oyuncu 6 blok iÃ§indeyse Ã§Ã¼rÃ¼tme (MC mantÄ±ÄŸÄ±)
        if (dist2 < 36) continue;
        if (Math.random() < LEAF_DECAY_CHANCE) {
          const bid = chunkManager.getBlock(bx, by, bz);
          if (bid === 6 || bid === 67 || bid === 70) {
            chunkManager.setBlock(bx, by, bz, 0);
            effects?.burst(bx, by, bz, bid, 4);
          }
        }
        decayingLeaves.delete(k);
      }
    }
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============ BOOT (hafif: menÃ¼ anÄ±nda gelir, aÄŸÄ±r iÅŸ YOK) ============
// "DÃ¼nya Ã¼retiliyor" yazÄ±sÄ± artÄ±k SADECE dÃ¼nyaya girerken Ã§Ä±kar.
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
  try { tntSim.clear(); } catch {}
  for (const f of flashLights) { try { scene.remove(f.L); } catch {} }
  flashLights.length = 0;
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
  // yÃ¼klÃ¼ chunk'lardaki kayÄ±tlÄ± meÅŸaleleri Ä±ÅŸÄ±k listesine al
  try {
    for (const c of chunkManager.chunks.values()) {
      const { blocks, cx, cz } = c;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] !== 21) continue;
        const y = MIN_Y + Math.floor(i / 256);
        const lz = Math.floor((i % 256) / 16), lx = i % 16;
        if (!torchMap.has(tkey(cx * 16 + lx, y, cz * 16 + lz))) torchMap.set(tkey(cx * 16 + lx, y, cz * 16 + lz), 0);
      }
    }
  } catch {}
}

function scanFurnaces() {
  // YÃ¼klenen chunk'lardaki fÄ±rÄ±n gÃ¶rselini yanma durumuna eÅŸitle (22 sÃ¶nmÃ¼ÅŸ / 24 yanÄ±k).
  // FÄ±rÄ±n verisi koordinatla anahtarlÄ± olduÄŸu iÃ§in blok takasÄ±nda veri kaybolmaz.
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

// DÃ¼nyaya gir (ilk giriÅŸ veya reload'sÄ±z geÃ§iÅŸ). Buton tÄ±klamasÄ±ndan Ã§aÄŸrÄ±lÄ±r.
async function enterWorld(id) {
  if (!id) return;
  document.exitPointerLock?.();
  showLoading('HazÄ±rlanÄ±yor...');
  refreshMenus();
  try {
    // geÃ§iÅŸ yapÄ±yorsak Ã¶nce mevcut dÃ¼nyayÄ± kaydet + toparla
    if (worldReady) {
      say('Kaydediliyor...');
      try { craftTable?.close(true); } catch {}
      try { craftInv?.close(true); } catch {}
      try { furnaceUI?.close(); } catch {}
      try { chestUI?.close(); } catch {}
      try { inventory?.close(); } catch {}
      await saveAll();
    }
    disposeWorld();
    try { effects?.clearAll?.(); } catch {}
    torchMap.clear();
    for (const L of torchLights) L.intensity = 0;
    mouseL = false; mouseR = false; placeCd = 0; hideBreakBar(); try { effects?.hideCrack(); } catch {}
    player.dead = false;
    document.getElementById('deathScreen')?.classList.add('hidden');

    WORLD_ID = id;
    try { await dbMeta.set('active-world', WORLD_ID); } catch {}

    // dÃ¼nya kaydÄ± (yoksa oluÅŸtur)
    say('DÃ¼nya yÃ¼kleniyor...');
    try {
      let w = await dbWorlds.get(WORLD_ID);
      if (!w) {
        w = { id: WORLD_ID, name: 'DÃ¼nya', seed: DEFAULT_SEED, gamemode: 'creative', createdAt: Date.now(), lastPlayed: Date.now() };
        await dbWorlds.put(w);
      }
      WORLD_NAME = w.name || 'DÃ¼nya';
      SEED_STR = String(w.seed || DEFAULT_SEED);
      SEED_NUM = hashSeed(SEED_STR) & 0xffffffff;
      GAMEMODE = w.gamemode === 'survival' ? 'survival' : 'creative';
      player.flying = false; // dunyaya yuruyerek baslanir (cift-Space ile ucma)
      w.lastPlayed = Date.now();
      try { await dbWorlds.put(w); } catch {}
    } catch {}

    // atlas + sahne + arayÃ¼z: oturumda bir kez kurulur, tekrar kullanÄ±lÄ±r
    if (!atlas) {
      say('Atlas kuruluyor...');
      atlas = await buildAtlas();
      for (const k in iconCache) delete iconCache[k]; // yeni atlas ile temiz ikonlar Ã¼retilsin
      try {
        if (new URLSearchParams(location.search).get('debug') === 'atlas') {
          const dbg = document.createElement('div');
          dbg.style.cssText = 'position:fixed;right:8px;top:8px;z-index:200;background:#000;padding:6px;border:2px solid #fff;cursor:pointer;color:#fff;font-size:12px';
          dbg.title = 'Atlas denetimi (kapatmak iÃ§in tÄ±kla)';
          const im = document.createElement('img');
          im.src = atlas.canvas.toDataURL();
          im.style.cssText = 'width:256px;height:256px;image-rendering:pixelated;display:block';
          dbg.appendChild(im);
          dbg.appendChild(document.createTextNode('atlas (tÄ±kla kapat)'));
          dbg.onclick = () => dbg.remove();
          document.body.appendChild(dbg);
        }
      } catch {}
      matOpaque = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide });
      matTransparent = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.FrontSide });
      // MeÅŸale cross quad'lar Ã§ift taraflÄ± gÃ¶rÃ¼nsÃ¼n
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
    chunkManager.torchFacing = (x, y, z) => torchFacingAt(x, y, z);
    chunkManager.doorState = (x, y, z) => { try { return doorMgr.map.get(x + ',' + y + ',' + z) || null; } catch { return null; } };
    chunkManager.chestState = (x, y, z) => { try { return chestMgr.info(x, y, z); } catch { return null; } };
    chunkManager.furnaceFacing = (x, y, z) => { try { const st = furnaceMgr.map.get(x + ',' + y + ',' + z); return (st && st.face | 0) || 0; } catch { return 0; } };
    fallSim.clear(); waterSim.clear(); waterTickAcc = 0;

    if (!uiBuilt) {
      uiBuilt = true;
      say('Envanter kuruluyor...');
      inventory = new InventoryUI({
        getIcon: (id, kind) => iconFor(id, kind),
        onChange: () => { renderHotbar(); if (craftTable?.isOpen) renderTableInv(); if (furnaceUI?.isOpen) renderFurnaceInv(); if (typeof chestUI !== 'undefined' && chestUI?.isOpen) { try { chestUI.renderInv(); } catch {} } saveAll(); },
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
            // YaratÄ±cÄ±da seÃ§ili slota 64 koy (eksilmez)
            if (k === 'item' && ITEMS[id]?.tool) inventory.hotbar[inventory.sel] = { kind: k, id, count: 1, dur: ITEMS[id].maxDur };
            else inventory.hotbar[inventory.sel] = { kind: k, id, count: Math.min(64, count || 64) };
            inventory.renderHot(); renderHotbar(); return true;
          }
          return inventory.addItem(id, count, k);
        },
        setBlock: (x, y, z, id) => {
          if (y < MIN_Y || y > MAX_Y) return { ok: false, msg: 'Y sÄ±nÄ±rÄ±: -64..319' };
          if (Math.abs(x) > 250000 || Math.abs(z) > 250000) return { ok: false, msg: 'DÃ¼nya sÄ±nÄ±rÄ± dÄ±ÅŸÄ±!' };
          chunkManager.setBlock(x, y, z, id);
          trackTorch(x, y, z, id);
          return { ok: true };
        },
        pos: () => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z }),
        tp: (x, y, z, toSpawn = false) => {
          if (toSpawn) { player.pos.copy(spawnPos()); player.vel.set(0, 0, 0); return { ok: true }; }
          if (Math.abs(x) > 250000 || Math.abs(z) > 250000) return { ok: false, msg: 'DÃ¼nya sÄ±nÄ±rÄ± dÄ±ÅŸÄ±!' };
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
        kill: () => kill('/kill kullanÄ±ldÄ±'),
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
      chestUI = new ChestUI({
        inventory, mgr: chestMgr, getIcon: (id, kind) => iconFor(id, kind),
        onChange: () => { renderHotbar(); saveAll(); },
        onClose: () => closeChest(),
      });
      window.chestUI = chestUI;
      window.__inv = inventory; // debug/test tutamacÄ± (konsoldan eriÅŸim)
      try { document.getElementById('chestClose').onclick = () => closeChest(); } catch {}
    } else {
      inventory.setMode(GAMEMODE);
    }

    // oyuncu kaydÄ±nÄ± yÃ¼kle (yeni dÃ¼nya = boÅŸ envanter + spawn)
    say('Oyuncu yÃ¼kleniyor...');
    try {
      const saved = await dbPlayers.get(WORLD_ID);
      // FÄ±rÄ±n verisini yÃ¼kle (yoksa boÅŸ)
      try { furnaceMgr.clear(); if (saved?.furnaces) furnaceMgr.load(saved.furnaces); } catch {}
      try { doorMgr.clear(); if (saved?.doors) doorMgr.load(saved.doors); } catch {}
      try { torchMap.clear(); if (saved?.torches) { for (const [k, f] of Object.entries(saved.torches)) torchMap.set(k, (f | 0) % 5); } } catch {}
      try { chestMgr.clear(); if (saved?.chests) chestMgr.load(saved.chests); } catch {}
      try { tntSim.clear(); if (saved?.tnt) tntSim.load(saved.tnt, scene, fallFaceMaterial); } catch {}
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
        try { doorMgr.clear(); } catch {}
        try { torchMap.clear(); } catch {}
        try { chestMgr.clear(); } catch {}
        try { tntSim.clear(); } catch {}
      }
      selected = inventory.sel || 0;
    } catch {
      player.pos.copy(spawnPos());
    }
    player.vel.set(0, 0, 0);
    player.fallStart = player.pos.y;
    updateHearts(); updateModeBadge(); updateBubbles(); updateXpBar();

    // spawn Ã§evresini Ã¶nden yÃ¼kle: Ã¶nce 3x3 hÄ±zlÄ±, gerisi stream
    say('Spawn yÃ¼kleniyor (3x3)...');
    const scx = Math.floor(player.pos.x / 16), scz = Math.floor(player.pos.z / 16);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      await chunkManager.ensureChunk(scx + dx, scz + dz);
    for (const c of chunkManager.chunks.values()) chunkManager.remesh(c);
    scanTorches();
    scanFurnaces();
    chunkManager.updateStreaming(player.pos.x, player.pos.z);

    if (seedEl) seedEl.textContent = `${WORLD_NAME} | Seed: ${SEED_STR} | Y: ${MIN_Y}..${MAX_Y} | Border: Â±250k | ${GAMEMODE}`;
    const menuSeed = document.getElementById('menuSeed');
    if (menuSeed) menuSeed.textContent = `${WORLD_NAME} (Seed: ${SEED_STR})`;
    renderHotbar();
    hideLoading();
    worldReady = true;
    wantMain = false;
    refreshMenus();
    if (!animating) { animating = true; animate(); }
    try {
      chat.msg(`â€” ${WORLD_NAME} dÃ¼nyasÄ±na girildi (${GAMEMODE === 'creative' ? 'YaratÄ±cÄ±' : 'Hayatta Kalma'}) â€”`, 'sys');
      if (GAMEMODE === 'survival') chat.msg('Hayatta Kalma: E ile envanter, kazma yapmadan cevher dÃ¼ÅŸmez! FÄ±rÄ±nda piÅŸir. T ile komutlar.', 'sys');
      else chat.msg('YaratÄ±cÄ±: E ile blok+eÅŸya seÃ§ (arama var), Ã§ift-Space ile uÃ§. T ile komutlar.', 'sys');
    } catch {}
    tryLock(); // buton tÄ±klamasÄ±ndan gelindiÄŸi iÃ§in genelde tutar
  } catch (err) {
    console.error('DÃ¼nya giriÅŸi baÅŸarÄ±sÄ±z:', err);
    say('Hata oluÅŸtu, menÃ¼ye dÃ¶nÃ¼lÃ¼yor...');
    setTimeout(() => { hideLoading(); worldReady = false; wantMain = true; refreshMenus(); }, 800);
  }
}

// MenÃ¼ye Ã§Ä±k (kayÄ±tlÄ± dÃ¼nyayÄ± korur, reload yok)
async function exitToMenu(save = true) {
  document.exitPointerLock?.();
  if (worldReady && save) { try { await saveAll(); } catch {} }
  try { craftTable?.close(false); } catch {}
  try { furnaceUI?.close(); } catch {}
      try { chestUI?.close(); } catch {}
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

// Hafif boot: DB + aktif id, o kadar. AÄŸÄ±r iÅŸ enterWorld'de.
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
  refreshMenus(); // menÃ¼ + logo anÄ±nda gÃ¶rÃ¼nÃ¼r
  // ?debug=lock: kilit/menÃ¼ gÃ¼nlÃ¼ÄŸÃ¼
  try {
    if (new URLSearchParams(location.search).get('debug') === 'lock') {
      const el = document.createElement('div');
      el.id = 'lockDebug';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:200;background:rgba(0,0,0,0.8);color:#ffd27a;font-size:11px;padding:8px 10px;border:1px solid #ffd27a;border-radius:6px;max-width:340px;pointer-events:none;font-family:monospace';
      document.body.appendChild(el);
    }
  } catch {}
  // ?debug=perf: kare sÃ¼resi + kuyruk + drawcall
  try {
    if (new URLSearchParams(location.search).get('debug') === 'perf') {
      const el = document.createElement('div');
      el.id = 'perfDebug';
      el.style.cssText = 'position:fixed;right:8px;top:120px;z-index:200;background:rgba(0,0,0,0.8);color:#7cc4ff;font-size:11px;padding:8px 10px;border:1px solid #7cc4ff;border-radius:6px;max-width:360px;pointer-events:none;font-family:monospace';
      el.textContent = 'perf bekleniyor...';
      document.body.appendChild(el);
    }
  } catch {}
  // AÃ§Ä±lÄ±ÅŸ splash: logo 1.2sn tam ekran, sonra menÃ¼ye geÃ§iÅŸ
  try {
    setTimeout(() => {
      const sp = document.getElementById('bootSplash');
      if (!sp) return;
      sp.classList.add('gone');
      setTimeout(() => sp.classList.add('off'), 550);
    }, 1200);
  } catch {}
})();
