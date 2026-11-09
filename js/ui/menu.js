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

// ============ AYARLAR PANELİ (kategorili, neredeyse tam ekran) ============
// Sidebar'lı tam-ekran modal: Oyun & Görüntü / Kontroller / Ses & Altyazı / Oyuncu & Dil / Özel / Hakkında.
const SETTINGS_CATS = [
  { id: 'game', icon: '🎮', key: 'settings.catGame' },
  { id: 'controls', icon: '🖱️', key: 'settings.catControls' },
  { id: 'audio', icon: '🔊', key: 'settings.catAudio' },
  { id: 'player', icon: '👤', key: 'settings.catPlayer' },
  { id: 'custom', icon: '🛠️', key: 'settings.catCustom' },
  { id: 'about', icon: 'ℹ️', key: 'settings.catAbout' },
];
let settingsTab = 'game';
// Sekme metninden baştaki emojiyi at (ikon ayrı gösteriliyor; yoksa çift görünür)
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*\s*)+/u;
const cleanLabel = (s) => String(s).replace(LEADING_EMOJI, '');

function closeSettingsPanel() {
  const p = document.getElementById('settingsPanel');
  if (p) p.classList.add('hidden');
}

function sectionLabel(text) {
  const d = document.createElement('div');
  d.className = 'setting-section-label';
  d.textContent = text;
  return d;
}
function iconSpan(icon) {
  const s = document.createElement('span');
  s.className = 'setting-icon-row';
  s.textContent = icon;
  return s;
}
function labelSpan(text) {
  const s = document.createElement('span');
  s.className = 'setting-label';
  s.textContent = text;
  return s;
}
function enumRow({ icon, label, values, get, set }) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.appendChild(iconSpan(icon));
  row.appendChild(labelSpan(label));
  const value = document.createElement('button');
  value.type = 'button';
  value.className = 'setting-value';
  value.textContent = get();
  value.onclick = () => {
    const vals = values;
    let idx = vals.indexOf(get());
    if (idx < 0) idx = 0;
    const next = vals[(idx + 1) % vals.length];
    set(next);
    value.textContent = next;
    saveGameSettings();
  };
  row.appendChild(value);
  return row;
}
function fovRow() {
  const gs = window.gameSettings;
  const row = document.createElement('div');
  row.className = 'setting-row';
  const curFov = typeof gs.fov === 'number' ? gs.fov : 70;
  row.innerHTML = `
    <span class="setting-icon-row">👁️</span>
    <span class="setting-label">${t('settings.fov')}</span>
    <div class="setting-slider-wrap">
      <input type="range" class="setting-range" min="30" max="110" step="1" value="${curFov}" aria-label="FOV range">
      <input type="number" class="setting-num" min="30" max="110" step="1" value="${curFov}" aria-label="FOV">
    </div>
  `;
  const rangeInput = row.querySelector('.setting-range');
  const numInput = row.querySelector('.setting-num');
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
  return row;
}

function renderSettings() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) { console.warn('[menu] #settingsPanel bulunamadı'); return; }
  const tabs = panel.querySelector('#settingsTabs');
  if (tabs) {
    tabs.innerHTML = '';
    for (const cat of SETTINGS_CATS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-tab' + (cat.id === settingsTab ? ' active' : '');
      btn.innerHTML = `<span class="tab-ic">${cat.icon}</span><span>${cleanLabel(t(cat.key))}</span>`;
      btn.onclick = () => { settingsTab = cat.id; renderSettings(); };
      tabs.appendChild(btn);
    }
  }
  const cat = SETTINGS_CATS.find((c) => c.id === settingsTab) || SETTINGS_CATS[0];
  const ci = panel.querySelector('#settingsCatIcon'); if (ci) ci.textContent = cat.icon;
  const ct = panel.querySelector('#settingsCatTitle'); if (ct) ct.textContent = cleanLabel(t(cat.key));
  const box = panel.querySelector('#settingsContent');
  if (!box) return;
  box.innerHTML = '';
  const gs = window.gameSettings;

  if (settingsTab === 'game') {
    box.appendChild(sectionLabel(cleanLabel(t('settings.catGame'))));
    box.appendChild(fovRow());
    box.appendChild(enumRow({ icon: '🔭', label: t('settings.renderDist'), values: [2, 4, 6, 8, 10, 12], get: () => gs.renderDistance, set: (v) => { gs.renderDistance = +v; } }));
    box.appendChild(enumRow({ icon: '🖥️', label: t('settings.graphics'), values: [t('settings.fast'), t('settings.fancy')], get: () => gs.graphics === 'güzel' ? t('settings.fancy') : t('settings.fast'), set: (v) => { gs.graphics = v === t('settings.fancy') ? 'güzel' : 'hizli'; } }));
    box.appendChild(enumRow({ icon: '✨', label: t('settings.particles'), values: [t('settings.particlesFull'), t('settings.particlesReduced'), t('settings.particlesOff')], get: () => gs.particles === 'azaltilmis' ? t('settings.particlesReduced') : (gs.particles === 'kapali' ? t('settings.particlesOff') : t('settings.particlesFull')), set: (v) => { gs.particles = v === t('settings.particlesFull') ? 'tam' : (v === t('settings.particlesReduced') ? 'azaltilmis' : 'kapali'); } }));
  } else if (settingsTab === 'controls') {
    box.appendChild(sectionLabel(cleanLabel(t('settings.catControls'))));
    box.appendChild(enumRow({ icon: '🖱️', label: t('settings.invertMouse'), values: [t('settings.off'), t('settings.on')], get: () => gs.invertMouse ? t('settings.on') : t('settings.off'), set: (v) => { gs.invertMouse = v === t('settings.on'); } }));
    box.appendChild(enumRow({ icon: '⚡', label: t('settings.mouseSens'), values: ['%50', '%75', '%100', '%125', '%150'], get: () => Math.round(gs.mouseSensitivity) + '%', set: (v) => { gs.mouseSensitivity = +v.replace('%', ''); } }));
  } else if (settingsTab === 'audio') {
    box.appendChild(sectionLabel(cleanLabel(t('settings.catAudio'))));
    box.appendChild(enumRow({ icon: '🔊', label: t('settings.volume'), values: ['%0', '%25', '%50', '%75', '%100'], get: () => Math.round(gs.volume) + '%', set: (v) => { gs.volume = +v.replace('%', ''); } }));
    box.appendChild(enumRow({ icon: '💬', label: t('settings.subtitles'), values: [t('settings.off'), t('settings.on')], get: () => gs.subtitles ? t('settings.on') : t('settings.off'), set: (v) => { gs.subtitles = v === t('settings.on'); } }));
  } else if (settingsTab === 'player') {
    box.appendChild(sectionLabel(cleanLabel(t('settings.catPlayer'))));
    const nameRow = document.createElement('div');
    nameRow.className = 'setting-row';
    nameRow.appendChild(iconSpan('👤'));
    nameRow.appendChild(labelSpan(t('settings.playerName')));
    const nameInput = document.createElement('input');
    nameInput.className = 'mc-input';
    nameInput.id = 'playerNameInput';
    nameInput.maxLength = 16;
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;
    nameInput.value = getPlayerName();
    nameInput.addEventListener('change', () => { setPlayerName(nameInput.value); nameInput.value = getPlayerName(); });
    nameRow.appendChild(nameInput);
    box.appendChild(nameRow);
    const langRow = document.createElement('div');
    langRow.className = 'setting-row';
    langRow.appendChild(iconSpan('🌐'));
    langRow.appendChild(labelSpan(t('settings.language')));
    const wrap = document.createElement('div');
    wrap.className = 'setting-slider-wrap';
    for (const [lang, label] of [['tr', 'Türkçe'], ['en', 'English']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'setting-value' + (getLang() === lang ? ' active' : '');
      b.textContent = label;
      b.onclick = () => { setLang(lang); applyI18n(); renderSettings(); };
      wrap.appendChild(b);
    }
    langRow.appendChild(wrap);
    box.appendChild(langRow);
    const hint = document.createElement('div');
    hint.className = 'setting-section-label';
    hint.textContent = t('settings.playerNameHint');
    box.appendChild(hint);
  } else if (settingsTab === 'custom') {
    const controls = document.createElement('div');
    controls.className = 'settings-controls';
    const btnAdd = document.createElement('button');
    btnAdd.type = 'button';
    btnAdd.className = 'settings-btn-add';
    btnAdd.textContent = t('settings.addCustom');
    btnAdd.onclick = () => {
      const name = prompt(t('settings.customNamePrompt'));
      if (!name || !name.trim()) return;
      const key = name.trim().replace(/\s+/g, '_').toLowerCase();
      if (window.customSettings[key]) { alert(t('settings.customExists')); return; }
      const value = prompt(t('settings.customValuePrompt'));
      if (value === null) return;
      window.customSettings[key] = value.trim() || '1';
      saveCustomSettings();
      renderSettings();
    };
    const btnReset = document.createElement('button');
    btnReset.type = 'button';
    btnReset.className = 'settings-btn-add danger';
    btnReset.textContent = t('settings.reset');
    btnReset.onclick = () => {
      if (!confirm(t('settings.customDeleteAll'))) return;
      window.customSettings = {};
      saveCustomSettings();
      renderSettings();
    };
    controls.appendChild(btnAdd);
    controls.appendChild(btnReset);
    box.appendChild(controls);
    box.appendChild(sectionLabel(t('settings.customTitle')));
    const keys = Object.keys(window.customSettings);
    if (!keys.length) {
      const empty = document.createElement('div');
      empty.className = 'setting-row';
      empty.innerHTML = `<span class="setting-icon-row">🛠️</span><span class="setting-label">${t('inv.empty')}</span>`;
      box.appendChild(empty);
    } else {
      for (const key of keys) {
        const value = window.customSettings[key];
        const row = document.createElement('div');
        row.className = 'setting-row custom-setting-row';
        row.appendChild(iconSpan('🛠️'));
        row.appendChild(labelSpan(key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())));
        const valueBtn = document.createElement('button');
        valueBtn.type = 'button';
        valueBtn.className = 'setting-value';
        valueBtn.textContent = value;
        valueBtn.onclick = () => {
          const pretty = key.replace(/_/g, ' ');
          const newValue = prompt(t('settings.customPrompt', pretty), value);
          if (newValue !== null) {
            window.customSettings[key] = newValue.trim() || value;
            saveCustomSettings();
            renderSettings();
          }
        };
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'custom-del';
        delBtn.textContent = '🗑️';
        delBtn.onclick = () => {
          if (confirm(t('settings.customDelete', key.replace(/_/g, ' ')))) {
            delete window.customSettings[key];
            saveCustomSettings();
            renderSettings();
          }
        };
        row.appendChild(valueBtn);
        row.appendChild(delBtn);
        box.appendChild(row);
      }
    }
  } else if (settingsTab === 'about') {
    const wrap = document.createElement('div');
    wrap.className = 'settings-about';
    wrap.innerHTML = `
      <div class="about-mark" aria-hidden="true">⛏️</div>
      <div class="about-badge">MC 1.21.1 • v2.1</div>
      <p>${t('settings.aboutText')}</p>
      <p><a href="https://github.com/TurkYoshi1905/threejs-minecraft-project" target="_blank" rel="noopener noreferrer">github.com/TurkYoshi1905/threejs-minecraft-project</a></p>
    `;
    box.appendChild(wrap);
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

// ---- Ayarlar paneli: kapatma düğmeleri + dışa açık API (main.js çağırır) ----
try {
  document.getElementById('settingsDoneBtn')?.addEventListener('click', closeSettingsPanel);
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettingsPanel);
} catch {}

window.openPauseSettings = function() {
  renderSettings();
  const t2 = document.getElementById('settingsTitle');
  if (t2) t2.innerHTML = t('settings.titleHtml');
};

window.closePauseSettings = closeSettingsPanel;