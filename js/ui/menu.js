import { openDB, dbWorlds, dbChunks, dbPlayers, dbMeta } from '../core/idb.js';
import { DEFAULT_SEED } from '../core/config.js';

const $ = (id) => document.getElementById(id);
let activeCache = 'default';
const activeId = () => activeCache;
async function loadActive() {
  try {
    const m = await dbMeta.get('active-world', null);
    const legacy = localStorage.getItem('mc-v2-active-world');
    activeCache = m || legacy || 'default';
    if (legacy && !m) await dbMeta.set('active-world', activeCache);
    try { localStorage.removeItem('mc-v2-active-world'); } catch {}
  } catch {}
}
async function setActive(id) {
  activeCache = id;
  try { await dbMeta.set('active-world', id); } catch {}
}

function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function randomSeed() {
  return String(Math.floor(Math.random() * 2 ** 31) - 2 ** 30);
}

async function ensureDefault() {
  const list = await dbWorlds.list();
  if (!list.length) {
    await dbWorlds.put({
      id: 'default', name: 'İlk Dünya', seed: DEFAULT_SEED,
      gamemode: 'creative',
      createdAt: Date.now(), lastPlayed: Date.now(),
    });
  }
  const worlds = await dbWorlds.list();
  if (!worlds.some((w) => w.id === activeCache)) {
    await setActive(worlds[0]?.id || 'default');
  }
}

const SPLASHES = ['%100 JavaScript!', 'Sonsuz chunk!', 'Creeper yok!', 'Seed\'ini yaz!', 'KankaCraft!', '1.21 uyumlu!', 'Elmas -59\'da!', 'Kırmızı bariyere dikkat!', 'T ile sohbet!'];

function showScreen(name) {
  for (const s of ['menuMain', 'menuSingle', 'menuHelp'])
    document.getElementById(s)?.classList.toggle('hidden', s !== name);
}

async function renderList() {
  const box = $('worldList');
  const worlds = await dbWorlds.list();
  const act = activeId();
  const wc = $('worldCount');
  if (wc) wc.textContent = `${worlds.length} dünya`;
  // Menü başlığında aktif dünya adı + seed
  try {
    const cur = worlds.find((w) => w.id === act);
    const ms = $('menuSeed');
    if (ms) ms.textContent = cur ? `${cur.name || 'Dünya'} (Seed: ${cur.seed})` : '';
  } catch {}
  box.innerHTML = '';
  if (!worlds.length) { box.innerHTML = '<div class="world-empty">Henüz dünya yok.</div>'; return; }
  for (const w of worlds) {
    const row = document.createElement('div');
    row.className = 'world-row' + (w.id === act ? ' active' : '');
    const name = document.createElement('span'); name.className = 'w-name'; name.textContent = w.name || 'Dünya';
    const meta = document.createElement('span'); meta.className = 'w-meta';
    const gmTr = (w.gamemode || 'creative') === 'survival' ? 'Hayatta Kalma' : 'Yaratıcı';
    meta.textContent = `${gmTr} • ${String(w.seed).slice(0, 12)} • ${fmtDate(w.lastPlayed)}`;
    const play = document.createElement('button'); play.className = 'w-play'; play.textContent = w.id === act ? 'Seçili' : 'Oyna';
    play.onclick = async () => {
      await setActive(w.id);
      w.lastPlayed = Date.now();
      try { await dbWorlds.put(w); } catch {}
      // Reload YOK: aynı sayfada dünyaya gir (buton tıklaması = kilit izni)
      if (typeof window.__enterWorld === 'function') window.__enterWorld(w.id);
      else location.reload();
    };
    const del = document.createElement('button'); del.className = 'w-del'; del.textContent = 'Sil';
    del.onclick = async () => {
      if (!confirm(`"${w.name}" silinsin mi? Chunklar da silinir.`)) return;
      const wasCurrent = typeof window.__currentWorld === 'function' && window.__currentWorld() === w.id;
      try {
        await dbChunks.deleteWorld(w.id);
        await dbWorlds.delete(w.id);
        try { await dbPlayers.remove(w.id); } catch {}
        if (activeId() === w.id) await setActive('default');
        await ensureDefault();
        // Oynanan dünya silindiyse oyundan çıkar (reload yok)
        if (wasCurrent && typeof window.__exitToMenu === 'function') await window.__exitToMenu(false);
        renderList();
      } catch (e) { alert('Silme başarısız: ' + e); }
    };
    row.append(name, meta, play, del);
    box.appendChild(row);
  }
}

async function init() {
  const sp = document.getElementById('splash');
  if (sp) sp.textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
  showScreen('menuMain');
  $('btnSingle').onclick = () => showScreen('menuSingle');
  $('btnHelpMenu').onclick = () => showScreen('menuHelp');
  $('btnBackMain').onclick = () => showScreen('menuMain');
  $('btnBackMain2').onclick = () => showScreen('menuMain');
  try { await openDB(); } catch { return; }
  try { await ensureDefault(); } catch {}
  try { await renderList(); } catch {}
  $('randomSeedBtn').onclick = () => { $('worldSeed').value = randomSeed(); };
  $('createBtn').onclick = async () => {
    const name = ($('worldName').value || 'Yeni Dünya').trim().slice(0, 24);
    const seed = ($('worldSeed').value || randomSeed()).trim().slice(0, 64);
    const gamemode = $('worldMode').value === 'survival' ? 'survival' : 'creative';
    const id = 'w-' + Date.now().toString(36);
    await dbWorlds.put({ id, name, seed, gamemode, createdAt: Date.now(), lastPlayed: Date.now() });
    await setActive(id);
    // Oluşturunca direkt oyuna gir (reload yok, tıklama kilit izni verir)
    if (typeof window.__enterWorld === 'function') window.__enterWorld(id);
    else location.reload();
  };
}

async function boot() {
  try { await openDB(); } catch { return; }
  await loadActive();
  await init();
}
boot();
