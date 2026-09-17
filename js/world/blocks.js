// Blok kayıtları. ID'ler kalıcıdır (kayıt uyumluluğu için ASLA değiştirme, sadece ekle).
// 1-15 eski dünyayla uyumlu. 16+ yeni.

export const BLOCKS = {
  1:  { ad: 'Çimen',      top: 'grass_block_top',  side: 'grass_block_side', bottom: 'dirt' },
  2:  { ad: 'Toprak',     all: 'dirt' },
  3:  { ad: 'Taş',        all: 'stone' },
  4:  { ad: 'Kırma Taş',  all: 'cobblestone' },
  5:  { ad: 'Meşe Kütük', top: 'oak_log_top', side: 'oak_log', bottom: 'oak_log_top' },
  6:  { ad: 'Yaprak',     all: 'oak_leaves', saydam: true, cutout: true },
  7:  { ad: 'Meşe Tahta', all: 'oak_planks' },
  8:  { ad: 'Kum',        all: 'sand' },
  9:  { ad: 'Cam',        all: 'glass', saydam: true, transparent: true },
  10: { ad: 'Ana Kaya',   all: 'bedrock' },
  11: { ad: 'Kömür Cevheri',  all: 'coal_ore' },
  12: { ad: 'Demir Cevheri',  all: 'iron_ore' },
  13: { ad: 'Elmas Cevheri',  all: 'diamond_ore' },
  14: { ad: 'Tuğla',      all: 'bricks' },
  15: { ad: 'Çakıl',      all: 'gravel' },
  // --- Yeni (1.21 uyumu) ---
  16: { ad: 'Su',         all: 'water_still', saydam: true, transparent: true, sivi: true, secilemez: true },
  17: { ad: 'Derin Kayrak', all: 'deepslate' },
  18: { ad: 'Karlı Çimen', top: 'grass_block_snow', side: 'grass_block_side', bottom: 'dirt' },
  19: { ad: 'Kar Bloğu',  all: 'snow' },
  20: { ad: 'Çalışma Masası', top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'oak_planks' },
  21: { ad: 'Meşale', all: 'torch', saydam: true, isik: 14, cross: true, desteksiz: true },
  22: { ad: 'Fırın', top: 'furnace_top', side: 'furnace_side', front: 'furnace_front', bottom: 'furnace_top', furnace: true },
  23: { ad: 'Altın Cevheri', all: 'gold_ore' },
  24: { ad: 'Yanık Fırın', top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on', bottom: 'furnace_top', furnace: true, lit: true },
};

export const HOTBAR_DEFAULT = [1, 2, 3, 4, 7, 5, 6, 8, 9, 14];

export function isOpaque(id) {
  if (!id) return false;
  const b = BLOCKS[id];
  if (!b) return true;
  return !b.saydam;
}

// Kırma süreleri (saniye, el ile) - Survival için
// NOT: alet çarpanları js/world/items.js HARVEST tablosunda. Buradaki değer = el süresi.
export const BREAK_TIME = {
  1: 0.6, 2: 0.6, 3: 1.8, 4: 1.8, 5: 1.2, 6: 0.25, 7: 1.2,
  8: 0.6, 9: 0.4, 10: Infinity, 11: 2.2, 12: 2.2, 13: 2.2,
  14: 1.8, 15: 0.7, 17: 2.2, 18: 0.6, 19: 0.4, 20: 1.2, 21: 0.05, 22: 2.0, 23: 2.2, 24: 2.0,
};


