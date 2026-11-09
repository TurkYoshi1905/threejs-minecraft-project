// Eşyalar (blok değil): çubuk, hammaddeler, kazma/kürek/balta/kılıç.
// ID'ler 100+ (bloklarla çakışmaz). Slot: {kind:'block'|'item', id, count, dur?}
// Faithful 1.21.1 dokuları textures/ altında vendor edildi.
// 110-114 kazma, 115-119 kürek, 120-124 balta, 125-129 kılıç (ID'ler kalıcı).

export const ITEMS = {
  100: { ad: 'Çubuk', adEn: 'Stick', tex: 'stick', max: 64 },
  101: { ad: 'Kömür', adEn: 'Coal', tex: 'coal', max: 64, fuel: 80 },
  102: { ad: 'Demir Külçe', adEn: 'Iron Ingot', tex: 'iron_ingot', max: 64 },
  103: { ad: 'Altın Külçe', adEn: 'Gold Ingot', tex: 'gold_ingot', max: 64 },
  104: { ad: 'Elmas', adEn: 'Diamond', tex: 'diamond', max: 64 },
  105: { ad: 'Ham Demir', adEn: 'Raw Iron', tex: 'raw_iron', max: 64 },
  106: { ad: 'Ham Altın', adEn: 'Raw Gold', tex: 'raw_gold', max: 64 },
  110: { ad: 'Tahta Kazma', adEn: 'Wooden Pickaxe', tex: 'wooden_pickaxe', tool: 'pickaxe', tier: 1, speed: 2, maxDur: 59, max: 1 },
  111: { ad: 'Taş Kazma', adEn: 'Stone Pickaxe', tex: 'stone_pickaxe', tool: 'pickaxe', tier: 2, speed: 4, maxDur: 131, max: 1 },
  112: { ad: 'Demir Kazma', adEn: 'Iron Pickaxe', tex: 'iron_pickaxe', tool: 'pickaxe', tier: 3, speed: 6, maxDur: 250, max: 1 },
  113: { ad: 'Altın Kazma', adEn: 'Golden Pickaxe', tex: 'golden_pickaxe', tool: 'pickaxe', tier: 1, speed: 12, maxDur: 32, max: 1 },
  114: { ad: 'Elmas Kazma', adEn: 'Diamond Pickaxe', tex: 'diamond_pickaxe', tool: 'pickaxe', tier: 4, speed: 8, maxDur: 1561, max: 1 },
  115: { ad: 'Tahta Kürek', adEn: 'Wooden Shovel', tex: 'wooden_shovel', tool: 'shovel', tier: 1, speed: 2, maxDur: 59, max: 1 },
  116: { ad: 'Taş Kürek', adEn: 'Stone Shovel', tex: 'stone_shovel', tool: 'shovel', tier: 2, speed: 4, maxDur: 131, max: 1 },
  117: { ad: 'Demir Kürek', adEn: 'Iron Shovel', tex: 'iron_shovel', tool: 'shovel', tier: 3, speed: 6, maxDur: 250, max: 1 },
  118: { ad: 'Altın Kürek', adEn: 'Golden Shovel', tex: 'golden_shovel', tool: 'shovel', tier: 1, speed: 12, maxDur: 32, max: 1 },
  119: { ad: 'Elmas Kürek', adEn: 'Diamond Shovel', tex: 'diamond_shovel', tool: 'shovel', tier: 4, speed: 8, maxDur: 1561, max: 1 },
  120: { ad: 'Tahta Balta', adEn: 'Wooden Axe', tex: 'wooden_axe', tool: 'axe', tier: 1, speed: 2, maxDur: 59, max: 1 },
  121: { ad: 'Taş Balta', adEn: 'Stone Axe', tex: 'stone_axe', tool: 'axe', tier: 2, speed: 4, maxDur: 131, max: 1 },
  122: { ad: 'Demir Balta', adEn: 'Iron Axe', tex: 'iron_axe', tool: 'axe', tier: 3, speed: 6, maxDur: 250, max: 1 },
  123: { ad: 'Altın Balta', adEn: 'Golden Axe', tex: 'golden_axe', tool: 'axe', tier: 1, speed: 12, maxDur: 32, max: 1 },
  124: { ad: 'Elmas Balta', adEn: 'Diamond Axe', tex: 'diamond_axe', tool: 'axe', tier: 4, speed: 8, maxDur: 1561, max: 1 },
  125: { ad: 'Tahta Kılıç', adEn: 'Wooden Sword', tex: 'wooden_sword', tool: 'sword', tier: 1, speed: 1.5, maxDur: 59, max: 1 },
  126: { ad: 'Taş Kılıç', adEn: 'Stone Sword', tex: 'stone_sword', tool: 'sword', tier: 2, speed: 1.5, maxDur: 131, max: 1 },
  127: { ad: 'Demir Kılıç', adEn: 'Iron Sword', tex: 'iron_sword', tool: 'sword', tier: 3, speed: 1.5, maxDur: 250, max: 1 },
  128: { ad: 'Altın Kılıç', adEn: 'Golden Sword', tex: 'golden_sword', tool: 'sword', tier: 1, speed: 1.5, maxDur: 32, max: 1 },
  129: { ad: 'Elmas Kılıç', adEn: 'Diamond Sword', tex: 'diamond_sword', tool: 'sword', tier: 4, speed: 1.5, maxDur: 1561, max: 1 },
  // --- Çakmak ve patlatma seti (MC 1.21.1) ---
  130: { ad: 'Çakmak', adEn: 'Flint', tex: 'flint', max: 64 },
  131: { ad: 'Çakmak ve Çelik', adEn: 'Flint and Steel', tex: 'flint_and_steel', tool: 'flintsteel', tier: 0, speed: 1, maxDur: 64, max: 1, neverWornByMining: true },
  132: { ad: 'Barut', adEn: 'Gunpowder', tex: 'gunpowder', max: 64 },
  // --- Maden/gem eşyaları (MC 1.21.1) ---
  133: { ad: 'Lapis Lazuli', adEn: 'Lapis Lazuli', tex: 'lapis_lazuli', max: 64 },
  134: { ad: 'Redstone', adEn: 'Redstone', tex: 'redstone', max: 64 },
  135: { ad: 'Zümrüt', adEn: 'Emerald', tex: 'emerald', max: 64 },
  136: { ad: 'Bakır Külçe', adEn: 'Copper Ingot', tex: 'copper_ingot', max: 64 },
  137: { ad: 'Ham Bakır', adEn: 'Raw Copper', tex: 'raw_copper', max: 64 },
};

export function isTool(id) {
  return !!ITEMS[id]?.tool;
}

// Blok -> hangi alet gerekir (MC basitleştirmesi).
// required: null = el ile düşer. Kazma/kürek/balta/kılıç şart olanlarda el ile uzun + drop yok.
// soft: doğru alet hızlandırır ama el ile de düşer (toprak/kum/odun gibi).
// minTier: 1 tahta/altın, 2 taş, 3 demir, 4 elmas.
export const HARVEST = {
  1:  { tool: 'shovel', minTier: 1, soft: true }, // çim (toprak düşer, breakInstant'ta)
  2:  { tool: 'shovel', minTier: 1, soft: true }, // toprak
  3:  { tool: 'pickaxe', minTier: 1 }, // taş
  4:  { tool: 'pickaxe', minTier: 1 }, // kırma taş
  6:  { tool: 'sword', minTier: 1, neverDrop: true }, // yaprak: hızlı kırılır ama bir şey düşürmez
  8:  { tool: 'shovel', minTier: 1, soft: true }, // kum
  9:  { noDrop: true }, // cam: MC'de ipeksi dokunuşsuz düşürmez
  10: { tool: 'pickaxe', minTier: 1, never: true }, // anakaya survival'da asla
  11: { tool: 'pickaxe', minTier: 1, dropItem: 101 }, // kömür cevheri -> kömür eşyası
  12: { tool: 'pickaxe', minTier: 2, dropItem: 105 }, // demir cevheri -> ham demir (fırında külçeye pişer)
  13: { tool: 'pickaxe', minTier: 3, dropItem: 104 }, // elmas cevheri -> elmas
  23: { tool: 'pickaxe', minTier: 3, dropItem: 106 }, // altın cevheri -> ham altın (fırında külçeye pişer)
  // Yeni cevherler: lapis taş kazma, redstone/zümrüt demir kazma, bakır taş kazma (MC)
  75: { tool: 'pickaxe', minTier: 2, dropItem: 133 }, // lapis lazuli cevheri -> lapis
  77: { tool: 'pickaxe', minTier: 3, dropItem: 134 }, // redstone cevheri -> redstone
  79: { tool: 'pickaxe', minTier: 3, dropItem: 135 }, // zümrüt cevheri -> zümrüt
  81: { tool: 'pickaxe', minTier: 2, dropItem: 137 }, // bakır cevheri -> ham bakır
  14: { tool: 'pickaxe', minTier: 1 },
  15: { tool: 'shovel', minTier: 1, soft: true }, // çakıl
  17: { tool: 'pickaxe', minTier: 1 }, // derin kayrak
  18: { tool: 'shovel', minTier: 1, soft: true }, // karlı çim (toprak düşer)
  20: { tool: 'axe', minTier: 1, soft: true },    // masa
  22: { tool: 'pickaxe', minTier: 1 }, // fırın
  24: { tool: 'pickaxe', minTier: 1 }, // yanık fırın (sönmüşle aynı)
  5:  { tool: 'axe', minTier: 1, soft: true },
  7:  { tool: 'axe', minTier: 1, soft: true },
  25: { tool: 'axe', minTier: 1, soft: true }, // kapı alt
  26: { tool: 'axe', minTier: 1, soft: true }, // kapı üst
  // TNT (64): hasar tablosunda yok -> her aletle/elle anında kırılır, kendisi düşer (MC)
  // Huş/Ladin seti (meşe ile aynı kurallar)
  65: { tool: 'axe', minTier: 1, soft: true },
  66: { tool: 'axe', minTier: 1, soft: true },
  67: { tool: 'sword', minTier: 1, neverDrop: true },
  68: { tool: 'axe', minTier: 1, soft: true },
  69: { tool: 'axe', minTier: 1, soft: true },
  70: { tool: 'sword', minTier: 1, neverDrop: true },
};

// El ile kırınca 5x yavaş + drop yok (sert bloklarda). Doğru alet Tier yetmezse de drop yok.
// soft: 1.5x yavaş ama düşer. neverDrop (yaprak): her zaman düşürmez.
export function breakInfo(blockId, heldItemId) {
  const h = HARVEST[blockId];
  if (!h) return { timeMult: 1, drops: true };
  if (h.noDrop) return { timeMult: 1, drops: false }; // cam gibi: hızlı kırılır ama düşürmez
  if (h.neverDrop) return { timeMult: heldItemId && ITEMS[heldItemId]?.tool === 'sword' ? 1 / (ITEMS[heldItemId].speed || 1) : 1, drops: false };
  const held = heldItemId ? ITEMS[heldItemId] : null;
  const correct = held && held.tool === h.tool && held.tier >= (h.minTier || 1);
  if (h.never) return { timeMult: 1, drops: false, never: true };
  if (correct) return { timeMult: 1 / held.speed, drops: true, tool: held };
  // yanlış alet / el: yumuşaklarda düşer, sertlerde düşürmez
  if (h.soft) return { timeMult: 1.0, drops: true }; // alet istemeyen blok: yanlis alet = el hizi (MC)
  return { timeMult: 10 / 3, drops: false }; // alet isteyen blokta el/yantis: sertlik x 5sn (MC birebir)
}

// Yakıt süreleri (sn, MC: kömür 80, odun/kütük 15, tahta 15, çubuk 5)
export const FUEL_TIME = {
  101: 80, // kömür eşyası
  100: 5,  // çubuk
};
// Blok yakıtlar blok id ile (envanterde blok olarak durur)
export const FUEL_BLOCK_TIME = {
  5: 15, // kütük
  7: 15, // tahta
  65: 15, // huş kütük
  66: 15, // huş tahta
  68: 15, // ladin kütük
  69: 15, // ladin tahta
};

// Eritme tarifleri: girdi blok id -> {outItem, time}
export const SMELT = {
  12: { out: 105, time: 10 }, // demir cevheri -> ham demir (MC'de fırın hamı pişirir; cevher bloğu da kabul)
  23: { out: 106, time: 10 }, // altın cevheri -> ham altın
  11: { out: 101, time: 10 }, // kömür cevheri -> kömür
  5:  { out: 101, time: 10 }, // kütük -> kömür (odun kömürü)
  4:  { out: 3, outKind: 'block', time: 10 }, // kırık taş -> taş (MC)
  8:  { out: 9, outKind: 'block', time: 10 }, // kum -> cam
  81: { out: 137, time: 10 }, // bakır cevheri -> ham bakır
};

// Eritme tarifleri (eşya girdiler): ham -> külçe (MC)
export const SMELT_ITEM = {
  105: { out: 102, time: 10 }, // ham demir -> demir külçe
  106: { out: 103, time: 10 }, // ham altın -> altın külçe
  137: { out: 136, time: 10 }, // ham bakır -> bakır külçe
};
