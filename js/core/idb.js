// Minimal IndexedDB wrapper (kütüphanesiz).
// DB: mc-clone-v2
//  - worlds  (keyPath: id)
//  - chunks  (keyPath: [worldId, cx, cz])
//  - players (keyPath: worldId)

import { DB_NAME } from './config.js';

const DB_VERSION = 2; // v2: meta store (aktif dünya id artık localStorage'da değil)

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'worldId' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('chunks')) {
        const cs = db.createObjectStore('chunks', { keyPath: ['worldId', 'cx', 'cz'] });
        cs.createIndex('by-world', 'worldId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    // fn get/put döndürür; cursor gibi çoklu işlemlerde farklı kullanım gerekir
    if (req && 'onsuccess' in req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }
  }));
}

export const dbWorlds = {
  get: (id) => tx('worlds', 'readonly', (s) => s.get(id)),
  put: (w) => tx('worlds', 'readwrite', (s) => s.put(w)),
  delete: (id) => tx('worlds', 'readwrite', (s) => s.delete(id)),
  list: () => openDB().then((db) => new Promise((resolve, reject) => {
    const out = [];
    const t = db.transaction('worlds', 'readonly');
    t.objectStore('worlds').openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out.push(c.value); c.continue(); }
      else resolve(out.sort((a, b) => b.lastPlayed - a.lastPlayed));
    };
    t.onerror = () => reject(t.error);
  })),
};

export const dbPlayers = {
  get: (worldId) => tx('players', 'readonly', (s) => s.get(worldId)),
  put: (p) => tx('players', 'readwrite', (s) => s.put(p)),
  remove: (worldId) => tx('players', 'readwrite', (s) => s.delete(worldId)),
};

// Tek seferlik UI tercihi (aktif dünya id). Oyun verisi değil.
export const dbMeta = {
  get: async (k, fallback = null) => {
    try { const r = await tx('meta', 'readonly', (s) => s.get(k)); return r ? r.v : fallback; }
    catch { return fallback; }
  },
  set: (k, v) => tx('meta', 'readwrite', (s) => s.put({ k, v })),
};

export const dbChunks = {
  get: (worldId, cx, cz) => tx('chunks', 'readonly', (s) => s.get([worldId, cx, cz])),
  put: (worldId, cx, cz, blocks) => tx('chunks', 'readwrite', (s) => s.put({
    worldId, cx, cz, blocks: blocks.slice ? blocks.slice() : new Uint8Array(blocks), savedAt: Date.now(),
  })),
  deleteWorld: (worldId) => openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction('chunks', 'readwrite');
    const store = t.objectStore('chunks');
    const idx = store.index('by-world');
    const req = idx.openCursor(IDBKeyRange.only(worldId));
    req.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { c.delete(); c.continue(); }
      else resolve();
    };
    req.onerror = () => reject(req.error);
  })),
};
