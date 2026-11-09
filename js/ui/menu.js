import { openDB, dbWorlds, dbChunks, dbPlayers, dbMeta } from '../core/idb.js';
import { DEFAULT_SEED } from '../core/config.js';
import { t, applyI18n, getLang, setLang, getPlayerName, setPlayerName } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);
let activeCache = 'default';
const activeId = () => activeCache;

// ============ İLK GİRİŞ MODALI (Premium / Profesyonel) ============
// Oyuncu adı + dil girilmeden oyun başlamaz; localStorage'a kaydedilir.
(function setupFirstRun() {
  try {
    const modal = document.getElementById('firstRunModal');
    if (!modal) return;
    const hasName = !!localStorage.getItem('mc-player-name');
    const hasLang = !!localStorage.getItem('mc-lang');
    if (hasName && hasLang) { applyI18n(); return; } // zaten kayıtlı

    applyI18n();
    modal.style.display = 'flex';
    const btnTr = document.getElementById('frLangTr');
    const btnEn = document.getElementById('frLangEn');
    const nameInput = document.getElementById('frName');
    const err = document.getElementById('frError');
    const startBtn = document.getElementById('frStart');
    let pendingLang = getLang();
    const refreshActive = () => {
      btnTr?.classList.toggle('active', pendingLang === 'tr');
      btnEn?.classList.toggle('active', pendingLang === 'en');
    };
    btnTr?.addEventListener('click', () => { pendingLang = 'tr'; setLang('tr'); applyI18n(); refreshActive(); });
    btnEn?.addEventListener('click', () => { pendingLang = 'en'; setLang('en'); applyI18n(); refreshActive(); });
    refreshActive();
    nameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && startBtn) startBtn.click(); });
    startBtn?.addEventListener('click', () => {
      const name = (nameInput?.value || '').trim();
      if (name.length < 2) { if (err) err.textContent = t('firstRun.errorName'); return; }
      setPlayerName(name);
      setLang(pendingLang);
      applyI18n();
      modal.style.display = 'none';
      try { document.getElementById('chatInput')?.blur(); } catch {}
      // Menüyü yeniden çevirilerle çiz
      try { window.dispatchEvent(new CustomEvent('langchange', { detail: pendingLang })); } catch {}
    });
    setTimeout(() => nameInput?.focus(), 80);
  } catch (e) { console.warn('[firstRun]', e); }
})();

// Oyun-wide ayar state'i (main.js ve diğer modüller tarafından okunabilir)
window.gameSettings = window.gameSettings || {
  renderDistance: 5,
  fov: 70, // MC 1.21.1: 30 (Zoom) - 110 (Quake Pro), varsayılan: 70
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
      id: 'default', name: t('world.firstDefaultName'), seed: DEFAULT_SEED,
      gamemode: 'creative',
      createdAt: Date.now(), lastPlayed: Date.now(),
    });
  }
  const worlds = await dbWorlds.list();
  if (!worlds.some((w) => w.id === activeCache)) {
    await setActive(worlds[0]?.id || 'default');
  }
}

const SPLASHES_TR = [
  '%100 JavaScript!', 'Sonsuz chunk!', 'Creeper yok!', "Seed'in yaz!", 'KankaCraft!',
  '1.21 uyumlu!', 'Elmas -59\'da!', 'Kırmızı bariyere dikkat!', 'T ile sohbet!',
  'Sürün ve koş!', 'Yaprak çürümeli!', 'Mesafe ayarla!',
];
const SPLASHES_EN = [
  '100% JavaScript!', 'Endless chunks!', 'No creepers!', 'Type the seed!', 'KankaCraft!',
  '1.21 compatible!', 'Diamonds at -59!', 'Watch the red border!', 'T for chat!',
  'Sneak and sprint!', 'Leaves should decay!', 'Adjust distance!',
];
function splashes() { return getLang() === 'en' ? SPLASHES_EN : SPLASHES_TR; }

function showScreen(name) {
  const screens = ['menuMain', 'menuSingle', 'menuCreateWorld', 'menuHelp', 'menuSettings'];
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

  // FOV Ayarı (Slider + Sayı Girişi - MC 1.21.1: 30 - 110)
  const fovRow = document.createElement('div');
  fovRow.className = 'setting-row';
  const curFov = typeof gs.fov === 'number' ? gs.fov : 70;
  fovRow.innerHTML = `
    <span class="setting-icon-row" style="font-size: 17px; min-width: 28px; text-align: center;">👁️</span>
    <span class="setting-label">${t('settings.fov')}</span>
    <div class="setting-slider-wrap">
      <input type="range" class="setting-range" min="30" max="110" step="1" value="${curFov}">
      <input type="number" class="setting-num" min="30" max="110" step="1" value="${curFov}">
    </div>
  `;
  const rangeInput = fovRow.querySelector('.setting-range');
  const numInput = fovRow.querySelector('.setting-num');
  const updateFov = (val) => {
    let n = Math.round(Number(val));
    if (isNaN(n)) n = 70;
    n = Math.max(30, Math.min(110, n));
    gs.fov = n;
    rangeInput.value = n;
    numInput.value = n;
    saveGameSettings();
  };
  rangeInput.oninput = (e) => updateFov(e.target.value);
  numInput.onchange = (e) => updateFov(e.target.value);
  box.appendChild(fovRow);

  const rows = [
    {
      key: 'renderDistance',
      label: t('settings.renderDist'),
      icon: '🔭',
      values: [2, 4, 6, 8, 10, 12],
      get: () => gs.renderDistance,
      set: (v) => { gs.renderDistance = +v; },
    },
    {
      key: 'graphics',
      label: t('settings.graphics'),
      icon: '🖥️',
      values: [t('settings.fast'), t('settings.fancy')],
      get: () => gs.graphics === 'güzel' ? t('settings.fancy') : t('settings.fast'),
      set: (v) => { gs.graphics = v === t('settings.fancy') ? 'güzel' : 'hizli'; },
    },
    {
      key: 'particles',
      label: t('settings.particles'),
      icon: '✨',
      values: [t('settings.particlesFull'), t('settings.particlesReduced'), t('settings.particlesOff')],
      get: () => gs.particles === 'azaltilmis' ? t('settings.particlesReduced') : (gs.particles === 'kapali' ? t('settings.particlesOff') : t('settings.particlesFull')),
      set: (v) => {
        gs.particles = v === t('settings.particlesFull') ? 'tam' : (v === t('settings.particlesReduced') ? 'azaltilmis' : 'kapali');
      },
    },
    {
      key: 'invertMouse',
      label: t('settings.invertMouse'),
      icon: '🖱️',
      values: [t('settings.off'), t('settings.on')],
      get: () => gs.invertMouse ? t('settings.on') : t('settings.off'),
      set: (v) => { gs.invertMouse = v === t('settings.on'); },
    },
    {
      key: 'mouseSensitivity',
      label: t('settings.mouseSens'),
      icon: '⚡',
      values: ['%50', '%75', '%100', '%125', '%150'],
      get: () => Math.round(gs.mouseSensitivity) + '%',
      set: (v) => { gs.mouseSensitivity = +v.replace('%', ''); },
    },
    {
      key: 'subtitles',
      label: t('settings.subtitles'),
      icon: '💬',
      values: [t('settings.off'), t('settings.on')],
      get: () => gs.subtitles ? t('settings.on') : t('settings.off'),
      set: (v) => { gs.subtitles = v === t('settings.on'); },
    },
    {
      key: 'volume',
      label: t('settings.volume'),
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
    customLabel.textContent = t('settings.customTitle');
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
        const newValue = prompt(t('settings.customPrompt', label.textContent), value);
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
        if (confirm(t('settings.customDelete', label.textContent))) {
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

async function playWorld(id) {
  await setActive(id);
  const worlds = await dbWorlds.list();
  const w = worlds.find((x) => x.id === id);
  if (w) {
    w.lastPlayed = Date.now();
    try { await dbWorlds.put(w); } catch {}
  }
  if (typeof window.__enterWorld === 'function') window.__enterWorld(id);
  else location.reload();
}

async function renderList() {
  const box = $('worldList');
  if (!box) {
    console.warn('[menu] #worldList element bulunamadı');
    return;
  }
  const worlds = await dbWorlds.list();
  const act = activeId();
  try {
    const cur = worlds.find((w) => w.id === act);
    const ms = $('menuSeed');
    if (ms) ms.textContent = cur ? `${cur.name || t('game.title')} (Seed: ${cur.seed})` : '';
  } catch {}
  // Alt bilgi: toplam dünya sayısı
  const ft = $('menuFooterText');
  if (ft) ft.textContent = t('brand.footer') + ' • ' + t('menu.footerWorlds', worlds.length);
  box.innerHTML = '';
  if (!worlds.length) {
    box.innerHTML = '<div class="world-empty" data-i18n-html="menu.noWorlds"></div>';
    box.querySelector('.world-empty').textContent = t('menu.noWorlds');
    return;
  }
  for (const w of worlds) {
    const isAct = w.id === act;
    const row = document.createElement('div');
    row.className = 'world-row' + (isAct ? ' active' : '');
    
    // Tıklandığında seç, çift tıklandığında hemen oyna
    row.onclick = async () => {
      await setActive(w.id);
      renderList();
    };
    row.ondblclick = () => playWorld(w.id);

    const icon = document.createElement('div');
    icon.className = 'w-icon';
    icon.textContent = (w.gamemode || 'creative') === 'survival' ? '⚔️' : '⛏️';

    const info = document.createElement('div');
    info.className = 'w-info';

    const name = document.createElement('div');
    name.className = 'w-name';
    name.textContent = w.name || t('game.title');

    const meta = document.createElement('div');
    meta.className = 'w-meta';
    const gmTr = (w.gamemode || 'creative') === 'survival' ? t('msg.modeSurvival') : t('msg.modeCreative');
    meta.innerHTML = `<span class="gm-tag ${w.gamemode || 'creative'}">${gmTr}</span> • Seed: <span class="seed-tag">${String(w.seed).slice(0, 16)}</span> • ${fmtDate(w.lastPlayed)}`;

    info.append(name, meta);

    const play = document.createElement('button');
    play.className = 'w-play';
    play.textContent = isAct ? t('menu.selected') : t('menu.play');
    play.onclick = (e) => {
      e.stopPropagation();
      playWorld(w.id);
    };

    row.append(icon, info, play);
    box.appendChild(row);
  }
}

async function init() {
  const sp = document.getElementById('splash');
  const pool = splashes();
  if (sp) sp.textContent = pool[Math.floor(Math.random() * pool.length)];
  showScreen('menuMain');

  // Ayarları yükle
  loadGameSettings();
  loadCustomSettings();

  // Ana menü butonları
  const btnSingle = $('btnSingle');
  if (btnSingle) btnSingle.onclick = () => { showScreen('menuSingle'); renderList(); };
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

  // Tek Oyunculu ekranı butonları
  const playBtn = $('playBtn');
  if (playBtn) {
    playBtn.onclick = () => {
      const act = activeId();
      if (act) playWorld(act);
    };
  }

  const btnOpenCreate = $('btnOpenCreate');
  if (btnOpenCreate) {
    btnOpenCreate.onclick = async () => {
      // Dünyaların adını kontrol edip sıralı isim ver (dil-duyarlı)
      const worlds = await dbWorlds.list();
      const base = t('create.defaultName').toLowerCase();
      const existingNames = new Set(worlds.map((w) => (w.name || '').trim().toLowerCase()));
      let num = 1;
      while (existingNames.has(`${base} ${num}`.toLowerCase()) || (num === 1 && existingNames.has(base))) {
        num++;
      }
      const wn = $('worldName');
      if (wn) wn.value = `${t('create.defaultName')} ${num}`;
      const ws = $('worldSeed');
      if (ws) ws.value = '';

      // Varsayılan Oyun Modu: Hayatta Kalma
      const worldMode = $('worldMode');
      const btnToggleMode = $('btnToggleMode');
      const modeDescription = $('modeDescription');
      if (worldMode) worldMode.value = 'survival';
      if (btnToggleMode) btnToggleMode.textContent = t('create.gameModeSurvival');
      if (modeDescription) {
        modeDescription.innerHTML = `
          <span class="mode-desc-title">${t('create.modeSurvivalTitle')}</span>
          <span class="mode-desc-text">${t('create.modeSurvivalDesc')}</span>
        `;
      }

      showScreen('menuCreateWorld');
    };
  }

  const btnDeleteSelected = $('btnDeleteSelected');
  if (btnDeleteSelected) {
    btnDeleteSelected.onclick = async () => {
      const act = activeId();
      const worlds = await dbWorlds.list();
      const cur = worlds.find((w) => w.id === act);
      if (!cur) return;
      if (!confirm(t('menu.deleteConfirm', cur.name))) return;
      const wasCurrent = typeof window.__currentWorld === 'function' && window.__currentWorld() === cur.id;
      try {
        await dbChunks.deleteWorld(cur.id);
        await dbWorlds.delete(cur.id);
        try { await dbPlayers.remove(cur.id); } catch {}
        const remain = await dbWorlds.list();
        if (remain.length) await setActive(remain[0].id);
        else await ensureDefault();
        if (wasCurrent && typeof window.__exitToMenu === 'function') await window.__exitToMenu(false);
        renderList();
      } catch (e) {
        alert(t('menu.deleteFailed', String(e)));
      }
    };
  }

  // Yeni Dünya Oluşturma Ekranı Sekmeleri
  const tabBtnGame = $('tabBtnGame');
  const tabBtnWorld = $('tabBtnWorld');
  const tabPaneGame = $('tabPaneGame');
  const tabPaneWorld = $('tabPaneWorld');

  if (tabBtnGame && tabBtnWorld) {
    tabBtnGame.onclick = () => {
      tabBtnGame.classList.add('active');
      tabBtnWorld.classList.remove('active');
      if (tabPaneGame) tabPaneGame.classList.remove('hidden');
      if (tabPaneWorld) tabPaneWorld.classList.add('hidden');
    };
    tabBtnWorld.onclick = () => {
      tabBtnWorld.classList.add('active');
      tabBtnGame.classList.remove('active');
      if (tabPaneWorld) tabPaneWorld.classList.remove('hidden');
      if (tabPaneGame) tabPaneGame.classList.add('hidden');
    };
  }

  // Oyun Modu Değiştirme Butonu (Minecraft Java Tarzı)
  const btnToggleMode = $('btnToggleMode');
  const worldMode = $('worldMode');
  const modeDescription = $('modeDescription');
  if (btnToggleMode && worldMode) {
    btnToggleMode.onclick = () => {
      const cur = worldMode.value;
      if (cur === 'creative') {
        worldMode.value = 'survival';
        btnToggleMode.textContent = t('create.gameModeSurvival');
        if (modeDescription) {
          modeDescription.innerHTML = `
            <span class="mode-desc-title">${t('create.modeSurvivalTitle')}</span>
            <span class="mode-desc-text">${t('create.modeSurvivalDesc')}</span>
          `;
        }
      } else {
        worldMode.value = 'creative';
        btnToggleMode.textContent = t('create.gameModeCreative');
        if (modeDescription) {
          modeDescription.innerHTML = `
            <span class="mode-desc-title">${t('create.modeCreativeTitle')}</span>
            <span class="mode-desc-text">${t('create.modeCreativeDesc')}</span>
          `;
        }
      }
    };
  }

  // Rastgele Seed Butonu
  const randomSeedBtn = $('randomSeedBtn');
  if (randomSeedBtn) {
    randomSeedBtn.onclick = () => {
      const ws = $('worldSeed');
      if (ws) ws.value = randomSeed();
    };
  }

  // İptal Butonu
  const btnCancelCreate = $('btnCancelCreate');
  if (btnCancelCreate) {
    btnCancelCreate.onclick = () => {
      showScreen('menuSingle');
      renderList();
    };
  }

  // Dünyayı Oluştur Butonu
  const createBtn = $('createBtn');
  if (createBtn) {
    createBtn.onclick = async () => {
      const wn = $('worldName');
      const ws = $('worldSeed');
      const wm = $('worldMode');
      const name = (wn ? wn.value.trim() : '') || t('create.defaultName');
      const seed = (ws ? ws.value.trim() : '') || randomSeed();
      const gamemode = (wm ? wm.value : 'survival') === 'creative' ? 'creative' : 'survival';
      const id = 'w-' + Date.now().toString(36);
      await dbWorlds.put({
        id,
        name: name.slice(0, 32),
        seed: seed.slice(0, 64),
        gamemode,
        createdAt: Date.now(),
        lastPlayed: Date.now(),
      });
      await setActive(id);
      if (typeof window.__enterWorld === 'function') window.__enterWorld(id);
      else location.reload();
    };
  }

  // Ayarlar panelini (oyun içi overlay) kapatma
  const settingsDoneBtn = $('settingsDoneBtn');
  if (settingsDoneBtn) {
    settingsDoneBtn.onclick = () => {
      const p = document.getElementById('settingsPanel');
      if (p) p.classList.add('hidden');
    };
  }

  try { await openDB(); } catch { return; }
  try { await ensureDefault(); } catch {}
  try { await renderList(); } catch {}
}

async function boot() {
  try { await openDB(); } catch { return; }
  await loadActive();
  await init();
}

boot();

// ============ Ayarlar paneli: oyuncu adı + dil bağlama ============
(function bindPlayerControls() {
  try {
    const nameInput = document.getElementById('playerNameInput');
    if (nameInput) {
      nameInput.value = getPlayerName();
      nameInput.addEventListener('change', () => {
        setPlayerName(nameInput.value);
        nameInput.value = getPlayerName();
      });
    }
    const trBtn = document.getElementById('langTrBtn');
    const enBtn = document.getElementById('langEnBtn');
    const refreshActive = () => {
      const lang = getLang();
      trBtn?.classList.toggle('active', lang === 'tr');
      enBtn?.classList.toggle('active', lang === 'en');
    };
    const apply = (lang) => {
      setLang(lang);
      applyI18n();
      refreshActive();
    };
    trBtn?.addEventListener('click', () => apply('tr'));
    enBtn?.addEventListener('click', () => apply('en'));
    refreshActive();
  } catch (e) { console.warn('[bindPlayerControls]', e); }
})();

// ---- Duraklatma menüsü ayar butonu (main.js tarafından çağrılabilir) ----
window.openPauseSettings = function() {
  renderSettings();
  const t2 = document.getElementById('settingsTitle');
  if (t2) t2.innerHTML = t('settings.titleHtml');
  const doneBtn = document.getElementById('settingsDoneBtn');
  if (doneBtn) doneBtn.textContent = t('settings.close');
};

window.closePauseSettings = function() {
  const p = document.getElementById('settingsPanel');
  if (p) p.classList.add('hidden');
};