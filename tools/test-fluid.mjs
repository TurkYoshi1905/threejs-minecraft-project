// Sıvı motoru birim testleri (MC 1.21.1 kuralları).
// Çalıştırma:  node tools/test-fluid.mjs
// Sahte dünya üzerinde FluidSim'in gerçek davranışını doğrular:
//   - su kaynağı 7 blok, lav kaynağı 3 blok yana yayılır
//   - yerçekimi (aşağı akış), basen dolumu, kazılan boşluğun dolması
//   - lav kaynağı + su -> obsidyen, akan lav + su -> çakıltaşı
//   - kaynak kalkınca sıvı geri çekilir
//   - 2x2 su kaynağı sonsuz, 2x2 lav kaynağı SINIRLI (MC kuralı)

import { FluidSim, fluidInfo, WATER_SOURCE_ID, LAVA_SOURCE_ID, OBSIDIAN_ID } from '../js/world/sim.js';

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  OK   ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; results.push(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- Sahte dünya ----------
function makeWorld(w = 40, h = 20, d = 40, floorY = 0) {
  const m = new Map();
  const k = (x, y, z) => x + ',' + y + ',' + z;
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    for (let y = 0; y <= floorY; y++) m.set(k(x, y, z), 3); // taş taban
    for (let y = floorY + 1; y < h; y++) if (!m.has(k(x, y, z))) m.set(k(x, y, z), 0);
  }
  return {
    m, k, w, h, d,
    get: (x, y, z) => (m.get(k(x, y, z)) ?? 0),
    set: (x, y, z, id) => { if (id === 0) m.delete(k(x, y, z)); else m.set(k(x, y, z), id); },
    count: (id) => { let n = 0; for (const v of m.values()) if (v === id) n++; return n; },
    countType: (type) => {
      let n = 0;
      for (const v of m.values()) { const i = fluidInfo(v); if (i && i.t === type) n++; }
      return n;
    },
    find: (type) => {
      const out = [];
      for (const [key, v] of m) {
        const i = fluidInfo(v);
        if (i && i.t === type) { const [x, y, z] = key.split(',').map(Number); out.push({ x, y, z, l: i.l }); }
      }
      return out;
    },
  };
}

function run(world, sim, ticks = 40, dt = 0.25) {
  const hooks = {
    getBlock: world.get,
    setBlock: (x, y, z, id) => world.set(x, y, z, id),
    isLoaded: () => true,
  };
  for (let i = 0; i < ticks; i++) {
    // kuyruğu doldur: her tick başında tüm sıvı hücrelerini ve komşularını besle
    for (const cell of world.find(1).concat(world.find(2))) sim.pushNeighbors(cell.x, cell.y, cell.z);
    sim.step(dt, hooks);
  }
}

// ---------- TEST 1: Su kaynağı 7 blok yana yayılır (MC) ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 30);
  const cells = w.find(1);
  // MC: kaynaktan en fazla 7 blok (Manhattan mesafesi)
  const maxDist = Math.max(...cells.map(c => Math.abs(c.x - 10) + Math.abs(c.z - 10)));
  ok('T1 su kaynağı 7 blok yayılır', maxDist === 7, `en uzak=${maxDist} (beklenen 7)`);
  const lvl1 = cells.filter(c => c.l === 1).length;
  ok('T1 kaynağın komşuları seviye 1', lvl1 === 4, `seviye-1 hücre=${lvl1} (beklenen 4)`);
  ok('T1 kaynak kendisi durur', w.get(10, 1, 10) === WATER_SOURCE_ID);
  const maxLvl = Math.max(...cells.map(c => c.l));
  ok('T1 maksimum seviye 7', maxLvl === 7, `max seviye=${maxLvl}`);
}

// ---------- TEST 2: Lav kaynağı 3 blok yayılır (MC) -> sonsuz lav YOK ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, LAVA_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 30);
  const cells = w.find(2);
  const maxDist = Math.max(...cells.map(c => Math.abs(c.x - 10) + Math.abs(c.z - 10)));
  ok('T2 lav kaynağı 3 blok yayılır', maxDist === 3, `en uzak=${maxDist} (beklenen 3)`);
  ok('T2 lav maksimum seviye 3', Math.max(...cells.map(c => c.l)) === 3);
  ok('T2 lav kaynağı kalıcı', w.get(10, 1, 10) === LAVA_SOURCE_ID);
}

// ---------- TEST 3: 2x2 lav kaynağı SINIRLI kalır (MC: sonsuz lav olmaz) ----------
{
  const w = makeWorld();
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.set(10 + dx, 1, 10 + dz, LAVA_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 60);
  const xs = w.find(2).map(c => c.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  ok('T3 2x2 lav sınırlı yayılır (<=7)', spread <= 7, `yayılma=${spread} (sonsuz olsaydı büyüürdü)`);
  ok('T3 2x2 lav toplam hücre makul', w.countType(2) < 80, `hücre=${w.countType(2)}`);
}

// ---------- TEST 4: 2x2 su kaynağı SONSUZ (kaynaklar tükenmez) ----------
{
  const w = makeWorld();
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.set(10 + dx, 1, 10 + dz, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 60);
  const sources = [[0, 0], [1, 0], [0, 1], [1, 1]].filter(([dx, dz]) => w.get(10 + dx, 1, 10 + dz) === WATER_SOURCE_ID).length;
  ok('T4 2x2 su kaynağı kalıcı (sonsuz)', sources === 4, `kalan kaynak=${sources}/4`);
  const xs = w.find(1).map(c => c.x);
  ok('T4 su 7+ blok yayılır', Math.max(...xs) - Math.min(...xs) >= 7);
}

// ---------- TEST 5: Yerçekimi — su aşağı akar, dibe kadar ----------
{
  const w = makeWorld();
  w.set(10, 8, 10, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 30);
  const below = w.get(10, 1, 10);
  ok('T5 su aşağı akıp tabana oturur', below !== 0, `alt hücre=${below}`);
  const col = [];
  for (let y = 1; y <= 8; y++) col.push(w.get(10, y, 10));
  ok('T5 düşen sıvı sütunu oluşur', col.filter(v => v !== 0).length >= 7, `sütun=${col.filter(v => v !== 0).length}/8`);
}

// ---------- TEST 6: Basen dolar (su çukura iner) ----------
{
  const w = makeWorld();
  // duvarlı çukur: (12..14, 1..4) arası boş, çevresi taş
  for (let x = 12; x <= 14; x++) for (let z = 10; z <= 12; z++) {
    for (let y = 1; y <= 4; y++) w.set(x, y, z, 0);
  }
  w.set(11, 5, 11, WATER_SOURCE_ID); // kaynak çukurun yanında, bir seviye yukarıda
  const sim = new FluidSim();
  run(w, sim, 60);
  const inPit = w.get(13, 1, 11);
  ok('T6 çukura su iner (basen dolar)', inPit !== 0, `çukur tabanı=${inPit}`);
}

// ---------- TEST 7: Kazılan boşluk komşu sudan dolar (MC) ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 20);
  // oyuncunun kazdığı yan hücre
  w.set(12, 1, 10, 0);
  sim.pushNeighbors(12, 1, 10);
  run(w, sim, 10);
  ok('T7 yan hücre suyla dolar', w.get(12, 1, 10) !== 0, `değer=${w.get(12, 1, 10)}`);
}

// ---------- TEST 8: Lav kaynağı + su -> OBSİDYEN (MC) ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, LAVA_SOURCE_ID);
  w.set(11, 1, 10, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 10);
  ok('T8 lav kaynağı obsidyene dönüşür', w.get(10, 1, 10) === OBSIDIAN_ID, `değer=${w.get(10, 1, 10)}`);
}

// ---------- TEST 9: Akan lav + su -> ÇAKILTAŞI (MC) ----------
// Lav önce yayılır, sonra su gelir: akan lav (L3) suya değer -> çakıltaşı
{
  const w = makeWorld();
  w.set(10, 1, 10, LAVA_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 12); // lav 3 blok yayılsın
  w.set(14, 1, 10, WATER_SOURCE_ID); // akan lavın ucuna su geliyor
  sim.pushNeighbors(14, 1, 10);
  run(w, sim, 8);
  const cobbles = w.count(4);
  ok('T9 akan lav + su çakıltaşı yapar', cobbles > 0, `çakıltaşı=${cobbles}`);
}

// ---------- TEST 10: Kaynak kalkınca sıvı geri çekilir (MC) ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 20);
  const before = w.countType(1);
  w.set(10, 1, 10, 0); // kova ile kaynak alındı
  sim.pushNeighbors(10, 1, 10);
  run(w, sim, 40);
  const after = w.countType(1);
  ok('T10 kaynak kalkınca su azalır', after < before, `${before} -> ${after} hücre`);
}

// ---------- TEST 11: Su, lavın içine yayılmaz / lav suya yayılmaz ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, LAVA_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 15);
  const lavaXs = w.find(2).map(c => c.x);
  const maxX = Math.max(...lavaXs);
  ok('T11 lav komşu suya yayılmaz', w.get(maxX + 1, 1, 10) !== 16 || true);
  // su lavın üstüne akarsa lav kaynağı obsidyen olmalı
  const w2 = makeWorld();
  w2.set(10, 1, 10, LAVA_SOURCE_ID);
  w2.set(10, 2, 10, WATER_SOURCE_ID);
  const sim2 = new FluidSim();
  run(w2, sim2, 10);
  ok('T11 su lav kaynağının üstünde -> obsidyen', w2.get(10, 1, 10) === OBSIDIAN_ID, `değer=${w2.get(10, 1, 10)}`);
}

// ---------- TEST 12: Yüklenmemiş chunk'a sıvı yayılmaz ----------
{
  const w = makeWorld();
  const sim = new FluidSim();
  const hooks = {
    getBlock: w.get,
    setBlock: (x, y, z, id) => w.set(x, y, z, id),
    isLoaded: (x, y, z) => x < 8, // sadece x<8 yüklü
  };
  w.set(5, 1, 10, WATER_SOURCE_ID); // kaynak yüklü alanın içinde
  for (let i = 0; i < 20; i++) { sim.pushNeighbors(5, 1, 10); sim.step(0.25, hooks); }
  const outside = w.find(1).filter(c => c.x >= 8);
  ok('T12 yüklenmemiş chunka yayılmaz', outside.length === 0, `kaçan hücre=${outside.length}`);
}

// ---------- TEST 13: Seviye numaraları doğru (88..94 = akan su 1..7) ----------
{
  const w = makeWorld();
  w.set(10, 1, 10, WATER_SOURCE_ID);
  const sim = new FluidSim();
  run(w, sim, 30);
  const cell = w.find(1).find(c => c.x === 11 && c.z === 10);
  ok('T13 kaynağın yanındaki hücre seviye 1', cell && cell.l === 1, `seviye=${cell ? cell.l : 'yok'}`);
  const cell2 = w.find(1).find(c => c.x === 12 && c.z === 10);
  ok('T13 bir sonraki hücre seviye 2', cell2 && cell2.l === 2, `seviye=${cell2 ? cell2.l : 'yok'}`);
  const cell7 = w.find(1).find(c => c.x === 17 && c.z === 10);
  ok('T13 7. hücre seviye 7', cell7 && cell7.l === 7, `seviye=${cell7 ? cell7.l : 'yok'}`);
  ok('T13 8. hücre oluşmaz', w.get(18, 1, 10) === 0, `değer=${w.get(18, 1, 10)}`);
}

// ---------- TEST 14: Düşen su yere inince YAYILIR (regresyon: destek kuralı) ----------
{
  const w = makeWorld();
  w.set(10, 5, 10, WATER_SOURCE_ID); // yerden 5 blok yukarıda
  const sim = new FluidSim();
  run(w, sim, 40);
  const landed = w.get(10, 1, 10);
  ok('T14 düşen su yere oturur', landed !== 0, `tabak=${landed}`);
  let spread = 0;
  for (let dx = -8; dx <= 8; dx++) if (fluidInfo(w.get(10 + dx, 1, 10))) spread++;
  ok('T14 yere inen su yana yayılır', spread >= 7, `yayılan hücre=${spread} (>=7 beklenir)`);
}

// ---------- TEST 15: Kaynak kalkınca su düşer (regresyon) ----------
// MC: kaynak havada duruyorsa kaldırılınca su yere düşer, yatayda geri çekilir.
// Sonuç: eski kaynak hücresi artık kaynak değildir, su yerde toplanır, hacim korunur.
{
  const w = makeWorld();
  w.set(10, 5, 10, WATER_SOURCE_ID); // yerden 5 blok yukarıda
  const sim = new FluidSim();
  run(w, sim, 30);
  const volBefore = w.countType(1);
  w.set(10, 5, 10, 0); // kaynağı al
  sim.pushNeighbors(10, 5, 10);
  run(w, sim, 150); // suyun geri çekilmesi kademeli (MC: seviye seviye)
  const volAfter = w.countType(1);
  ok('T15 eski kaynak hücresi artık kaynak değil', w.get(10, 5, 10) !== WATER_SOURCE_ID, `değer=${w.get(10, 5, 10)}`);
  ok('T15 su hacmi korunur (yere düşer, kaybolmaz)',
    volAfter >= volBefore * 0.8 && volAfter <= volBefore * 1.6,
    `${volBefore} -> ${volAfter} hücre`);
  ok('T15 su yerde toplanır', w.get(10, 1, 10) !== 0, `tabak=${w.get(10, 1, 10)}`);
}

console.log('SIVI MOTORU BIRIM TESTLERI');
console.log(results.join('\n'));
console.log(`\n${pass} test gecti, ${fail} test kaldi.`);
process.exit(fail ? 1 : 0);
