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
  25: { ad: 'Meşe Kapı', all: 'oak_door_bottom', door: true, saydam: true },
  26: { ad: 'Kapı Üstü', all: 'oak_door_top', door: true, gizli: true, saydam: true },
  27: { ad: 'Sandık', top: 'chest_top', side: 'chest_side', bottom: 'oak_planks',
        front: 'chest_front', frontL: 'chest_front_l', frontR: 'chest_front_r', chest: true },
};

export const HOTBAR_DEFAULT = [1, 2, 3, 4, 7, 5, 6, 8, 9, 14];

export function isOpaque(id) {
  if (!id) return false;
  const b = BLOCKS[id];
  if (!b) return true;
  return !b.saydam;
}

// Kırma süreleri: EL ile saniye = MC sertlik x 1.5 (Wiki tablosu).
// Dogrusal alet: /hiz. Ornek: tas+demir kazma 2.25/6 = 0.375sn (MC ile ayni).
export const BREAK_TIME = {
  1: 0.9, 2: 0.75, 3: 2.25, 4: 3.0, 5: 3.0, 6: 0.3, 7: 3.0,
  8: 0.75, 9: 0.45, 10: Infinity, 11: 4.5, 12: 4.5, 13: 4.5,
  14: 3.0, 15: 0.9, 17: 4.5, 18: 0.9, 19: 0.3, 20: 3.75, 21: 0.05, 22: 5.25, 23: 4.5, 24: 5.25, 25: 4.5, 26: 4.5, 27: 3.75,
};


