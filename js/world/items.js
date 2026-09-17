// Eşyalar (blok değil): çubuk, hammaddeler, kazma/kürek/balta/kılıç.
// ID'ler 100+ (bloklarla çakışmaz). Slot: {kind:'block'|'item', id, count, dur?}
// Faithful 1.21.1 dokuları textures/ altında vendor edildi.
// 110-114 kazma, 115-119 kürek, 120-124 balta, 125-129 kılıç (ID'ler kalıcı).

export const ITEMS = {
  100: { ad: 'Çubuk', tex: 'stick', max: 64 },
  101: { ad: 'Kömür', tex: 'coal', max: 64, fuel: 80 },
  102: { ad: 'Demir Külçe', tex: 'iron_ingot', max: 64 },
  103: { ad: 'Altın Külçe', tex: 'gold_ingot', max: 64 },
  104: { ad: 'Elmas', tex: 'diamond', max: 64 },
  105: { ad: 'Ham Demir', tex: 'raw_iron', max: 64 },
  106: { ad: 'Ham Altın', tex: 'raw_gold', max: 64 },
  110: { ad: 'Tahta Kazma', tex: 'wooden_pickaxe', tool: 'pickaxe', tier: 1, speed: 2, maxDur: 59, max: 1 },
  111: { ad: 'Taş Kazma', tex: 'stone_pickaxe', tool: 'pickaxe', tier: 2, speed: 4, maxDur: 131, max: 1 },
  112: { ad: 'Demir Kazma', tex: 'iron_pickaxe', tool: 'pickaxe', tier: 3, speed: 6, maxDur: 250, max: 1 },
  113: { ad: 'Altın Kazma', tex: 'golden_pickaxe', tool: 'pickaxe', tier: 1, speed: 12, maxDur: 32, max: 1 },
  114: { ad: 'Elmas Kazma', tex: 'diamond_pickaxe', tool: 'pickaxe', tier: 4, speed: 8, maxDur: 1561, max: 1 },
  115: { ad: 'Tahta Kürek', tex: 'wooden_shovel', tool: 'shovel', tier: 1, speed: 2, maxDur: 59, max: 1 },
  116: { ad: 'Taş Kürek', tex: 'stone_shovel', tool: 'shovel', tier: 2, speed: 4, maxDur: 131, max: 1 },
  117: { ad: 'Demir Kürek', tex: 'iron_shovel', tool: 'shovel', tier: 3, speed: 6, maxDur: 250, max: 1 },
  118: { ad: 'Altın Kürek', tex: 'golden_shovel', tool: 'shovel', tier: 1, speed: 12, maxDur: 32, max: 1 },
  119: { ad: 'Elmas Kürek', tex: 'diamond_shovel', tool: 'shovel', tier: 4, speed: 8, maxDur: 1561, max: 1 },
  120: { ad: 'Tahta Balta', tex: 'wooden_axe', tool: 'axe', tier: 1, speed: 2, maxDur: 59, max: 1 },
  121: { ad: 'Taş Balta', tex: 'stone_axe', tool: 'axe', tier: 2, speed: 4, maxDur: 131, max: 1 },
  122: { ad: 'Demir Balta', tex: 'iron_axe', tool: 'axe', tier: 3, speed: 6, maxDur: 250, max: 1 },
  123: { ad: 'Altın Balta', tex: 'golden_axe', tool: 'axe', tier: 1, speed: 12, maxDur: 32, max: 1 },
  124: { ad: 'Elmas Balta', tex: 'diamond_axe', tool: 'axe', tier: 4, speed: 8, maxDur: 1561, max: 1 },
  125: { ad: 'Tahta Kılıç', tex: 'wooden_sword', tool: 'sword', tier: 1, speed: 2, maxDur: 59, max: 1 },
  126: { ad: 'Taş Kılıç', tex: 'stone_sword', tool: 'sword', tier: 2, speed: 4, maxDur: 131, max: 1 },
  127: { ad: 'Demir Kılıç', tex: 'iron_sword', tool: 'sword', tier: 3, speed: 6, maxDur: 250, max: 1 },
  128: { ad: 'Altın Kılıç', tex: 'golden_sword', tool: 'sword', tier: 1, speed: 12, maxDur: 32, max: 1 },
  129: { ad: 'Elmas Kılıç', tex: 'diamond_sword', tool: 'sword', tier: 4, speed: 8, maxDur: 1561, max: 1 },
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
  14: { tool: 'pickaxe', minTier: 1 },
  15: { tool: 'shovel', minTier: 1, soft: true }, // çakıl
  17: { tool: 'pickaxe', minTier: 1 }, // derin kayrak
  18: { tool: 'shovel', minTier: 1, soft: true }, // karlı çim (toprak düşer)
  20: { tool: 'axe', minTier: 1, soft: true },    // masa
  22: { tool: 'pickaxe', minTier: 1 }, // fırın
  24: { tool: 'pickaxe', minTier: 1 }, // yanık fırın (sönmüşle aynı)
  5:  { tool: 'axe', minTier: 1, soft: true },
  7:  { tool: 'axe', minTier: 1, soft: true },
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
  if (h.soft) return { timeMult: 1.5, drops: true };
  return { timeMult: 5, drops: false };
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
};

// Eritme tarifleri: girdi blok id -> {outItem, time}
export const SMELT = {
  12: { out: 105, time: 10 }, // demir cevheri -> ham demir (MC'de fırın hamı pişirir; cevher bloğu da kabul)
  23: { out: 106, time: 10 }, // altın cevheri -> ham altın
  11: { out: 101, time: 10 }, // kömür cevheri -> kömür
  5:  { out: 101, time: 10 }, // kütük -> kömür (odun kömürü)
  4:  { out: 3, outKind: 'block', time: 10 }, // kırık taş -> taş (MC)
  8:  { out: 9, outKind: 'block', time: 10 }, // kum -> cam
};

// Eritme tarifleri (eşya girdiler): ham -> külçe (MC)
export const SMELT_ITEM = {
  105: { out: 102, time: 10 }, // ham demir -> demir külçe
  106: { out: 103, time: 10 }, // ham altın -> altın külçe
};
