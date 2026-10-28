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

// Kullanıcı tanımlı özel ayarlar (localStorage'da kalıcı olarak saklanır)
window.customSettings = window.customSettings || {};

const GAME_SETTINGS_KEY = 'mc-game-settings';
const CUSTOM_SETTINGS_KEY = 'mc-custom-settings';

function loadGameSettings() {
  try {
    const raw = localStorage.getItem(GAME_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.assign(window.gameSettings, parsed);
      }
    }
  } catch {}
}
function saveGameSettings() {
  try {
    localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(window.gameSettings));
    window.dispatchEvent(new CustomEvent('gamesettingschange', { detail: window.gameSettings }));
  } catch {}
}

function loadCustomSettings() {
  try {
    const raw = localStorage.getItem(CUSTOM_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        window.customSettings = parsed;
      }
    }
  } catch {}
}
function saveCustomSettings() {
  try {
    localStorage.setItem(CUSTOM_SETTINGS_KEY, JSON.stringify(window.customSettings));
  } catch {}
}

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

// Settings panelini yoksa dinamik olarak oluşturur (düzgün karanlık modal)
function ensureSettingsPanel() {
  let panel = document.getElementById('settingsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'settingsPanel';
    panel.className = 'hidden';
    panel.innerHTML = `
      <div class="settings-box">
        <div class="settings-box-inner">
          <div class="settings-header">
            <div class="settings-icon">⚙️</div>
            <div class="settings-title" id="settingsTitle">Ayarlar<small>Three.js Minecraft</small></div>
          </div>
          <div class="settings-controls">
            <button id="btnAddCustomSetting" class="settings-btn-add" type="button">+ Özel Ayar Ekle</button>
            <button id="btnResetCustomSetting" class="settings-btn-add" type="button" style="background: linear-gradient(135deg, #a33 0%, #772222 100%); border-color: #771111;">↺ Sıfırla</button>
          </div>
          <div id="settingsContent"></div>
          <div class="settings-footer">
            <button id="settingsDoneBtn" class="settings-btn-done">Bitti</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  const btnAdd = document.getElementById('btnAddCustomSetting');
  if (btnAdd) {
    btnAdd.onclick = () => {
      const name = prompt('Özel ayar adı (örn: FOV, Ses, Mavi):');
      if (!name || !name.trim()) return;
      const key = name.trim().replace(/\s+/g, '_').toLowerCase();
      if (window.customSettings[key]) {
        alert('Bu isimde bir ayar zaten var!');
        return;
      }
      const value = prompt('Ayar değeri (örn: 90, açık, yüksek):');
      if (value === null) return;
      window.customSettings[key] = value.trim() || '1';
      saveCustomSettings();
      renderSettings();
    };
  }

  const btnReset = document.getElementById('btnResetCustomSetting');
  if (btnReset) {
    btnReset.onclick = () => {
      if (!confirm('Tüm özel ayarları silmek istediğinize emin misiniz?')) return;
      window.customSettings = {};
      saveCustomSettings();
      renderSettings();
    };
  }

  const doneBtn = document.getElementById('settingsDoneBtn');
  if (doneBtn) {
    doneBtn.onclick = () => {
      panel.classList.add('hidden');
      if (typeof window.closePauseSettings === 'function') window.closePauseSettings();
    };
  }

  return panel;
}

function renderSettings() {
  const panel = ensureSettingsPanel();
  const box = document.getElementById('settingsContent');
  if (!box) {
    console.warn('[menu] #settingsContent elementi oluşturulamadı');
    return;
  }
  const gs = window.gameSettings;
  box.innerHTML = '';

  const rows = [
    {
      key: 'renderDistance',
      label: 'Görüş Mesafesi (Chunk)',
      icon: '🔭',
      values: [2, 4, 6, 8, 10, 12],
      get: () => gs.renderDistance,
      set: (v) => { gs.renderDistance = +v; },
    },
    {
      key: 'graphics',
      label: 'Grafik Hızı',
      icon: '🖥️',
      values: ['Hızlı', 'Güzel'],
      get: () => gs.graphics === 'güzel' ? 'Güzel' : 'Hızlı',
      set: (v) => { gs.graphics = v === 'Güzel' ? 'güzel' : 'hizli'; },
    },
    {
      key: 'particles',
      label: 'Partiküller',
      icon: '✨',
      values: ['Tam', 'Azaltılmış', 'Kapalı'],
      get: () => gs.particles === 'azaltilmis' ? 'Azaltılmış' : (gs.particles === 'kapali' ? 'Kapalı' : 'Tam'),
      set: (v) => {
        gs.particles = v === 'Tam' ? 'tam' : (v === 'Azaltılmış' ? 'azaltilmis' : 'kapali');
      },
    },
    {
      key: 'invertMouse',
      label: 'Fare Ters Yön',
      icon: '🖱️',
      values: ['Kapalı', 'Açık'],
      get: () => gs.invertMouse ? 'Açık' : 'Kapalı',
      set: (v) => { gs.invertMouse = v === 'Açık'; },
    },
    {
      key: 'mouseSensitivity',
      label: 'Fare Hassasiyeti',
      icon: '⚡',
      values: ['%50', '%75', '%100', '%125', '%150'],
      get: () => Math.round(gs.mouseSensitivity) + '%',
      set: (v) => { gs.mouseSensitivity = +v.replace('%', ''); },
    },
    {
      key: 'subtitles',
      label: 'Altyazılar',
      icon: '💬',
      values: ['Kapalı', 'Açık'],
      get: () => gs.subtitles ? 'Açık' : 'Kapalı',
      set: (v) => { gs.subtitles = v === 'Açık'; },
    },
    {
      key: 'volume',
      label: 'Ses Seviyesi',
      icon: '🔊',
      values: ['%0', '%25', '%50', '%75', '%100'],
      get: () => Math.round(gs.volume) + '%',
      set: (v) => { gs.volume = +v.replace('%', ''); },
    },
  ];

  // Sistem ayar satırları
  for (const row of rows) {
    const container = document.createElement('div');
    container.className = 'setting-row';

    const icon = document.createElement('span');
    icon.className = 'setting-icon-row';
    icon.textContent = row.icon;
    icon.style.cssText = 'font-size: 17px; min-width: 28px; text-align: center;';

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
      saveGameSettings();
    };

    container.appendChild(icon);
    container.appendChild(label);
    container.appendChild(value);
    box.appendChild(container);
  }

  // Özel ayarlar bölümü
  const customKeys = Object.keys(window.customSettings);
  if (customKeys.length > 0) {
    const customLabel = document.createElement('div');
    customLabel.style.cssText = 'font-size: 11px; color: #6fcf47; text-shadow: 1px 1px 0 #000; margin-top: 8px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;';
    customLabel.textContent = 'ÖZEL AYARLAR (Kullanıcı Tanımlı)';
    box.appendChild(customLabel);

    for (const key of customKeys) {
      const value = window.customSettings[key];
      const container = document.createElement('div');
      container.className = 'setting-row custom-setting-row';

      const icon = document.createElement('span');
      icon.className = 'setting-icon-row';
      icon.textContent = '🛠️';
      icon.style.cssText = 'font-size: 17px; min-width: 28px; text-align: center;';

      const label = document.createElement('span');
      label.className = 'setting-label';
      label.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const valueBtn = document.createElement('button');
      valueBtn.className = 'setting-value';
      valueBtn.textContent = value;
      valueBtn.onclick = () => {
        const newValue = prompt(`"${label.textContent}" için yeni değer:`, value);
        if (newValue !== null) {
          window.customSettings[key] = newValue.trim() || value;
          saveCustomSettings();
          renderSettings();
        }
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.style.cssText = 'font-size: 14px; background: #333; border: 2px solid #555; border-radius: 3px; color: #fff; cursor: pointer; padding: 4px 8px; box-shadow: 0 2px 0 #000;';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`"${label.textContent}" özel ayarını silmek istediğinize emin misiniz?`)) {
          delete window.customSettings[key];
          saveCustomSettings();
          renderSettings();
        }
      };

      container.appendChild(icon);
      container.appendChild(label);
      container.appendChild(valueBtn);
      container.appendChild(delBtn);
      box.appendChild(container);
    }
  }

  panel.classList.remove('hidden');
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

  // Ayarları yükle
  loadGameSettings();
  loadCustomSettings();

  // Ana menü butonları
  const btnSingle = $('btnSingle');
  if (btnSingle) btnSingle.onclick = () => showScreen('menuSingle');
  const btnSettings = $('btnSettings');
  if (btnSettings) btnSettings.onclick = () => { renderSettings(); };
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
  const t = document.getElementById('settingsTitle');
  if (t) t.textContent = 'Ayarlar';
  const doneBtn = document.getElementById('settingsDoneBtn');
  if (doneBtn) doneBtn.textContent = 'Kapat';
};

window.closePauseSettings = function() {
  const p = document.getElementById('settingsPanel');
  if (p) p.classList.add('hidden');
};