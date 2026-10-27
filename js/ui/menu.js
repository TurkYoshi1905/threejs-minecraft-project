import { openDB, dbWorlds, dbChunks, dbPlayers, dbMeta } from '../core/idb.js';
import { DEFAULT_SEED } from '../core/config.js';

const $ = (id) => document.getElementById(id);
let activeCache = 'default';
const activeId = () => activeCache;

// Oyun-wide ayar state'i (main.js ve diğer modüller tarafından okunabilir)
window.gameSettings = window.gameSettings || {
  renderDistance: 5,
  graphics: 'hizli', // 'hizli' | 'güzel'
  particles: 'tam', // 'tam' | 'azaltilmis' | 'kapali'
  invertMouse: false,
  mouseSensitivity: 100,
  subtitles: true,
  volume: 100,
};

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

const SPLASHES = [
  '%100 JavaScript!', 'Sonsuz chunk!', 'Creeper yok!', "Seed'in yaz!", 'KankaCraft!',
  '1.21 uyumlu!', 'Elmas -59\'da!', 'Kırmızı bariyere dikkat!', 'T ile sohbet!',
  'Sürün ve koş!', 'Yaprak çürümeli!', 'Mesafe ayarla!',
];

function showScreen(name) {
  const screens = ['menuMain', 'menuSingle', 'menuHelp', 'menuSettings'];
  for (const s of screens) {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== name);
  }
}

function renderSettings() {
  const box = $('#settingsContent');
  if (!box) {
    console.warn('[menu] #settingsContent element bulunamadı');
    return;
  }
  const gs = window.gameSettings;
  box.innerHTML = '';

  const rows = [
    {
      key: 'renderDistance',
      label: 'Görüş Mesafesi (Chunk)',
      values: [2, 4, 6, 8, 10, 12],
      get: () => gs.renderDistance,
      set: (v) => { gs.renderDistance = +v; },
    },
    {
      key: 'graphics',
      label: 'Grafik Hızı',
      values: ['Hızlı', 'Güzel'],
      get: () => gs.graphics === 'güzel' ? 'Güzel' : 'Hızlı',
      set: (v) => { gs.graphics = v === 'Güzel' ? 'güzel' : 'hizli'; },
    },
    {
      key: 'particles',
      label: 'Partiküller',
      values: ['Tam', 'Azaltılmış', 'Kapalı'],
      get: () => gs.particles === 'azaltilmis' ? 'Azaltılmış' : (gs.particles === 'kapali' ? 'Kapalı' : 'Tam'),
      set: (v) => {
        gs.particles = v === 'Tam' ? 'tam' : (v === 'Azaltılmış' ? 'azaltilmis' : 'kapali');
      },
    },
    {
      key: 'invertMouse',
      label: 'Fare Ters Yön',
      values: ['Kapalı', 'Açık'],
      get: () => gs.invertMouse ? 'Açık' : 'Kapalı',
      set: (v) => { gs.invertMouse = v === 'Açık'; },
    },
    {
      key: 'mouseSensitivity',
      label: 'Fare Hassasiyeti',
      values: ['%50', '%75', '%100', '%125', '%150'],
      get: () => Math.round(gs.mouseSensitivity) + '%',
      set: (v) => { gs.mouseSensitivity = +v.replace('%', ''); },
    },
    {
      key: 'subtitles',
      label: 'Altyazılar',
      values: ['Kapalı', 'Açık'],
      get: () => gs.subtitles ? 'Açık' : 'Kapalı',
      set: (v) => { gs.subtitles = v === 'Açık'; },
    },
    {
      key: 'volume',
      label: 'Ses Seviyesi',
      values: ['%0', '%25', '%50', '%75', '%100'],
      get: () => Math.round(gs.volume) + '%',
      set: (v) => { gs.volume = +v.replace('%', ''); },
    },
  ];

  for (const row of rows) {
    const container = document.createElement('div');
    container.className = 'setting-row';

    const label = document.createElement('span');
    label.className = 'setting-label';
    label.textContent = row.label;

    const value = document.createElement('button');
    value.className = 'setting-value';
    value.textContent = row.get();
    value.onclick = () => {
      const vals = row.values;
      const cur = row.get();
      let idx = vals.indexOf(cur);
      if (idx < 0) idx = 0;
      const next = vals[(idx + 1) % vals.length];
      value.textContent = next;
      row.set(next);
    };

    container.appendChild(label);
    container.appendChild(value);
    box.appendChild(container);
  }
}

async function renderList() {
  const box = $('worldList');
  if (!box) {
    console.warn('[menu] #worldList element bulunamadı');
    return;
  }
  const worlds = await dbWorlds.list();
  const act = activeId();
  const wc = $('worldCount');
  if (wc) wc.textContent = `${worlds.length} dünya`;
  try {
    const cur = worlds.find((w) => w.id === act);
    const ms = $('menuSeed');
    if (ms) ms.textContent = cur ? `${cur.name || 'Dünya'} (Seed: ${cur.seed})` : '';
  } catch {}
  box.innerHTML = '';
  if (!worlds.length) {
    box.innerHTML = '<div class="world-empty">Henüz dünya yok.</div>';
    return;
  }
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

  // Ana menü butonları
  const btnSingle = $('btnSingle');
  if (btnSingle) btnSingle.onclick = () => showScreen('menuSingle');
  const btnSettings = $('btnSettings');
  if (btnSettings) btnSettings.onclick = () => { renderSettings(); showScreen('menuSettings'); };
  const btnHelpMenu = $('btnHelpMenu');
  if (btnHelpMenu) btnHelpMenu.onclick = () => showScreen('menuHelp');
  const btnBackMain = $('btnBackMain');
  if (btnBackMain) btnBackMain.onclick = () => showScreen('menuMain');
  const btnBackMain2 = $('btnBackMain2');
  if (btnBackMain2) btnBackMain2.onclick = () => showScreen('menuMain');
  const btnBackSettings = $('btnBackSettings');
  if (btnBackSettings) btnBackSettings.onclick = () => showScreen('menuMain');

  // Ayarlar panelini (oyun içi overlay) kapatma
  const settingsDoneBtn = $('settingsDoneBtn');
  if (settingsDoneBtn) settingsDoneBtn.onclick = () => {
    const p = document.getElementById('settingsPanel');
    if (p) p.classList.add('hidden');
  };

  try { await openDB(); } catch { return; }
  try { await ensureDefault(); } catch {}
  try { await renderList(); } catch {}
  const randomSeedBtn = $('randomSeedBtn');
  if (randomSeedBtn) randomSeedBtn.onclick = () => {
    const ws = $('worldSeed');
    if (ws) ws.value = randomSeed();
  };
  const createBtn = $('createBtn');
  if (createBtn) createBtn.onclick = async () => {
    const wn = $('worldName');
    const ws = $('worldSeed');
    const wm = $('worldMode');
    const name = (wn ? wn.value : '') || 'Yeni Dünya';
    const seed = (ws ? ws.value : '') || randomSeed();
    const gamemode = (wm ? wm.value : 'creative') === 'survival' ? 'survival' : 'creative';
    const id = 'w-' + Date.now().toString(36);
    await dbWorlds.put({ id, name: name.trim().slice(0, 24), seed: seed.trim().slice(0, 64), gamemode, createdAt: Date.now(), lastPlayed: Date.now() });
    await setActive(id);
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

// ---- Duraklatma menüsü ayar butonu (main.js tarafından çağrılabilir) ----
window.openPauseSettings = function() {
  renderSettings();
  const p = document.getElementById('settingsPanel');
  if (p) p.classList.remove('hidden');
  const t = document.getElementById('settingsTitle');
  if (t) t.textContent = '⚙️ Ayarlar';
  const doneBtn = document.getElementById('settingsDoneBtn');
  if (doneBtn) doneBtn.textContent = 'Kapat';
};

window.closePauseSettings = function() {
  const p = document.getElementById('settingsPanel');
  if (p) p.classList.add('hidden');
};